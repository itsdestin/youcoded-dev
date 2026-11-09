"""Versioned exports/configuration independent of installed Harbor and paid admission."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import comparison_tasks as tasks
import evaluation_workflow as workflow
import evaluation_qualification as qualification
from external_verification import VERSION
from lab_harbor_export import export_suite, plugin_config, lifecycle_status
import run_objective_comparison as runner

HERE = Path(__file__).resolve().parent


class ExportTests(unittest.TestCase):
    def test_v2_export_is_explicit_and_v1_exports_remain_frozen(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source'; tasks.snapshot(HERE.parents[1]/'youcoded',source)
            limits=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90)
            legacy=root/'legacy'; tasks.export_suite(source,legacy,'local@sha256:'+'a'*64,limits)
            before=workflow.tree(legacy)
            v2=root/'external'; export_suite(source,v2,'local@sha256:'+'a'*64,limits)
            self.assertEqual(workflow.tree(legacy),before)
            for task in tasks.IDS:
                with self.subTest(task=task):
                    base=v2/task
                    self.assertIn(VERSION,(base/'environment/fixtures/TASK.md').read_text())
                    self.assertIn(VERSION,(base/'instruction.md').read_text())
                    self.assertIn('exit 1',(base/'tests/test.sh').read_text())
                    self.assertNotIn('reward.txt',(base/'tests/test.sh').read_text())
                    self.assertEqual(json.loads((base/'tests/host-contract.json').read_text()),dict(version=VERSION,task=task))
                    self.assertEqual(json.loads((base/'tests/baseline-manifest.json').read_text()),tasks.hashes(base/'environment/fixtures'))
                    self.assertFalse((base/'environment/fixtures/tests/host-contract.json').exists())
                    self.assertNotIn(VERSION,(legacy/task/'environment/fixtures/TASK.md').read_text())

    def test_plan_hashes_bind_external_contract_and_commands_select_both_plugins(self):
        pin='a'*64
        request=dict(mode='compare',profile='smoke',arms=[dict(id='youcoded',adapter='youcoded',version='build:'+pin,fingerprint=pin),dict(id='claude-code',adapter='claude-code',version='2.1.302',fingerprint=pin)],model='anthropic/claude-haiku-5.5',provider='Anthropic',network='controlled-retrieval',limits=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90),budgetUsd=1,image='local@sha256:'+pin)
        plan=workflow.resolve(request)
        old=json.loads((HERE/'comparison-contracts.json').read_text())
        self.assertEqual(plan['suiteVersion'],VERSION)
        self.assertFalse(plan['canRun']);self.assertEqual(plan['plannedCells'],6)
        for task in plan['tasks']:
            self.assertEqual(task['contractVersion'],VERSION)
            prior=next(t for t in old['tasks'] if t['id']==task['id'])
            self.assertNotEqual(plan['taskDefinitionHashes'][task['id']],hashlib.sha256(json.dumps(prior,separators=(',',':'),ensure_ascii=False).encode()).hexdigest())
        config=dict(sourceDir='/tmp/controller',desktopDir='/tmp/build',harbor='/tmp/harbor',gateUrl='http://gateway:18766',jobsDir='/tmp/jobs',comparisonKey='offline',evaluationLimits=request['limits'],hostVerification=dict(**plugin_config(),taskIds=tasks.IDS))
        row=dict(agent='youcoded',taskId=tasks.IDS[0],taskPath='/tmp/task',model=request['model'],tokenFile='/tmp/token',trialKey='fixture')
        command=runner.command_for(row,config)
        self.assertEqual(command[command.index('--env')+1],plugin_config()['environment']['import_path'])
        self.assertEqual(command[command.index('--verifier')+1],plugin_config()['verifier']['import_path'])
        self.assertNotIn('--extra-docker-compose',command)
        legacy=runner.command_for({**row,'taskId':'finish-the-file'},config)
        self.assertNotIn('--verifier',legacy);self.assertIn('--extra-docker-compose',legacy)

    def test_qualification_keeps_runtime_and_paid_guards_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            status=qualification.LocalProbe(tmp).lifecycle()
            self.assertTrue(status['implementedOfflineContract'])
            self.assertFalse(status['runtimeQualified']);self.assertFalse(status['qualified'])
            with self.assertRaisesRegex(ValueError,'qualification'):
                qualification.admit_execution({'schemaVersion':2})


if __name__ == '__main__': unittest.main()
