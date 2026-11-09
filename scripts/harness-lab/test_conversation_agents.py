import asyncio
import unittest
from types import SimpleNamespace
from conversation_agents import run_conversation, validate_steps, copy_private_snapshot, write_private_json, AGENTS, NATIVE_CLIENTS, ConversationAgent
from router_agents import RouterClaudeCode, RouterHermes
from unittest.mock import patch
import tempfile
import os
from pathlib import Path

class ConversationTests(unittest.TestCase):
    def test_context_controls_cannot_be_silently_passed_to_unwired_clients(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);scenario=root/'scenario.json';scenario.write_text('[{"kind":"user","text":"hello"}]')
            common={'scenario_file':scenario,'gate_url':'http://gateway','gate_token_file':root/'token',
                    'logs_dir':root/'logs','model_name':'test-model'}
            with self.assertRaisesRegex(ValueError,'not supported'):
                ConversationAgent(client='pi',context_window_tokens=200000,**common)
            with self.assertRaisesRegex(ValueError,'only by router-claude-code'):
                ConversationAgent(client='router-pi',auto_compact_tokens=200000,**common)

    def test_failed_controller_command_preserves_its_failure_receipt(self):
        class Environment:
            async def exec(self,**kwargs):
                if not kwargs['command'].startswith('/usr/bin/python3 -I -S -c '):
                    raise AssertionError('Controller must exclude task-local imports and site hooks')
                return SimpleNamespace(return_code=1,stdout='{"file":"note.txt","controllerOwned":true,"applied":false,"writeFailed":true,"restorationVerified":false}')
        async def exercise():
            receipt=await ConversationAgent._external_change(object(),Environment(),{'file':'note.txt','expectedBefore':'old','replacement':'new'})
            self.assertFalse(receipt['restorationVerified']);self.assertFalse(receipt['applied'])
        asyncio.run(exercise())

    def test_router_native_resume_clients_are_registered_as_competitors(self):
        self.assertIs(AGENTS['router-claude-code'],RouterClaudeCode)
        self.assertIs(AGENTS['router-hermes'],RouterHermes)
        self.assertNotIn('router-claude-code',NATIVE_CLIENTS)
        self.assertNotIn('router-hermes',NATIVE_CLIENTS)
        validate_steps([{'kind':'user','text':'initial'},{'kind':'user','text':'continue'}],native=False)

    def test_capture_does_not_follow_agent_planted_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source';source.mkdir()
            outside=root/'outside';outside.write_text('private')
            (source/'escape').symlink_to(outside)
            (source/'trace.json').write_text('{}')
            notes=copy_private_snapshot(source,root/'snapshot')
            self.assertEqual(notes,['escape'])
            self.assertFalse((root/'snapshot/escape').exists())
            result=root/'result.json';result.symlink_to(outside)
            write_private_json(result,{'ok':True})
            self.assertEqual(outside.read_text(),'private')
            self.assertFalse(result.is_symlink())
            self.assertEqual(result.stat().st_mode&0o777,0o600)

    def test_external_change_is_controller_owned_between_native_user_turns(self):
        class Client:
            capabilities=SimpleNamespace(resume=True)
            def __init__(self): self.seen=[]
            async def run(self,prompt,*args): self.seen.append(('run',prompt))
            async def resume(self,prompt,*args): self.seen.append(('resume',prompt))
        async def exercise():
            client=Client();snapshots=[];changes=[]
            async def snapshot(index,*args): snapshots.append(index);return {'captureComplete':True}
            async def change(step): changes.append(step['file']);return {'applied':True,'kind':'external-change-between-turns','controllerOwned':True}
            steps=[{'kind':'user','text':'inspect'},{'kind':'external-change','file':'note.txt','expectedBefore':'old','replacement':'new'},{'kind':'user','text':'continue'}]
            result=await run_conversation(client,None,steps,snapshot,external_change=change)
            self.assertEqual(result['status'],'completed');self.assertEqual(client.seen,[('run','inspect'),('resume','continue')])
            self.assertEqual(snapshots,[0,2]);self.assertEqual(changes,['note.txt'])
            self.assertEqual(result['steps'][1]['kind'],'external-change');self.assertTrue(result['steps'][1]['controllerOwned'])
            with self.assertRaisesRegex(ValueError,'controller'):
                await run_conversation(client,None,steps,snapshot)
        asyncio.run(exercise())

    def test_same_delegate_native_resume_no_fabricated_restart(self):
        class Client:
            capabilities=SimpleNamespace(resume=True)
            def __init__(self): self.seen=[]
            async def run(self,prompt,env,context): self.seen.append(('run',prompt))
            async def resume(self,prompt,env,context): self.seen.append(('resume',prompt))
        async def exercise():
            client=Client();snapshots=[]
            async def snapshot(index,step,context): snapshots.append(index);return {'finalText':'reply','captureComplete':True}
            result=await run_conversation(client,None,[{'kind':'user','text':'first','label':'initial'},
                {'kind':'user','text':'shorter','label':'correction'}],snapshot)
            self.assertEqual(client.seen,[('run','first'),('resume','shorter')])
            self.assertEqual(snapshots,[0,1]);self.assertEqual(result['status'],'completed')
            self.assertEqual(result['steps'][1]['label'],'correction')
        asyncio.run(exercise())
    def test_missing_step_evidence_stops_as_capture_failure_not_completed_conversation(self):
        class Client:
            capabilities=SimpleNamespace(resume=True)
            async def run(self,*args): pass
            async def resume(self,*args): raise AssertionError('no later step after failed capture')
        async def exercise():
            async def snapshot(*args): return {'captureComplete':False}
            result=await run_conversation(Client(),None,[{'kind':'user','text':'first'},{'kind':'user','text':'next'}],snapshot)
            self.assertEqual(result['status'],'failed');self.assertEqual(result['unexecutedSteps'],1)
            self.assertEqual(result['steps'][0]['errorClass'],'CaptureIncomplete')
        asyncio.run(exercise())

    def test_unsupported_compaction_rejected_before_first_model_call(self):
        with self.assertRaisesRegex(ValueError,'compact'):
            validate_steps([{'kind':'user','text':'first'},{'kind':'compact'}],native=False)
    def test_cancellation_preserves_partial_step_before_propagating(self):
        class Client:
            capabilities=SimpleNamespace(resume=True)
            async def run(self,*args): raise asyncio.CancelledError()
        async def exercise():
            saved=[]
            async def snapshot(*args): return {'captureComplete':False}
            async def checkpoint(row): saved.append(row)
            with self.assertRaises(asyncio.CancelledError):
                await run_conversation(Client(),None,[{'kind':'user','text':'first'}],snapshot,on_step=checkpoint)
            self.assertEqual(saved[0]['status'],'interrupted')
        asyncio.run(exercise())

    def test_no_resume_capability_refuses_before_first_turn(self):
        class Client:
            capabilities=SimpleNamespace(resume=False)
            async def run(self,*args): raise AssertionError('must not run')
        async def exercise():
            with self.assertRaisesRegex(ValueError,'resume'):
                await run_conversation(Client(),None,[{'kind':'user','text':'first'},{'kind':'user','text':'next'}],None)
        asyncio.run(exercise())
    def test_failure_retains_first_checkpoint_and_never_sends_later_prompt(self):
        class Client:
            capabilities=SimpleNamespace(resume=True)
            async def run(self,*args): pass
            async def resume(self,*args): raise RuntimeError('provider disconnected')
        async def exercise():
            snapshots=[]
            async def snapshot(index,step,context): snapshots.append(index);return {'captureComplete':True}
            result=await run_conversation(Client(),None,[{'kind':'user','text':str(i)} for i in range(3)],snapshot)
            self.assertEqual(result['status'],'failed');self.assertEqual(result['unexecutedSteps'],1)
            self.assertEqual(len(result['steps']),2);self.assertEqual(snapshots,[0,1])
        asyncio.run(exercise())

if __name__=='__main__': unittest.main()
