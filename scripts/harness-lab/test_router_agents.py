import tempfile
import unittest
import asyncio
from pathlib import Path
from router_agents import RouterYouCoded, RouterPi, RouterOpenCode, RouterClaudeCode, RouterHermes
import yaml
import os
from unittest.mock import patch
from harbor.agents.installed.hermes import Hermes
from comparison_agents import PreparedGateMixin
from router_agents import validate_context_window_tokens, validate_auto_compact_tokens

class RouterHermesDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_controller_dispatch_uses_only_placeholder_and_restores_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            agent=RouterHermes(logs_dir=root/'logs',model_name='openrouter/anthropic/claude-haiku-5.5',gate_url='http://gateway:18766',gate_token_file=str(token))
            before={k:os.environ.get(k) for k in ('OPENROUTER_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_TOKEN')}
            async def native_run(instance,*args):
                self.assertEqual(os.environ.get('OPENROUTER_API_KEY'),'yc-gate-controller-sentinel')
                self.assertFalse(os.environ.get('ANTHROPIC_API_KEY'))
                self.assertEqual(instance.model_name,'anthropic/claude-haiku-5.5')
                raise RuntimeError('simulated native failure')
            with patch.object(Hermes,'run',native_run):
                with self.assertRaisesRegex(RuntimeError,'simulated native failure'):
                    await agent.run('hello',None,None)
            self.assertEqual(before,{k:os.environ.get(k) for k in before})

class RouterAgentTests(unittest.TestCase):
    def test_claude_autocompact_is_wired_to_run_and_resume_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            agent=RouterClaudeCode(logs_dir=root/'logs',model_name='openrouter/anthropic/claude-haiku-5.5',
                gate_url='http://gateway:18766',gate_token_file=str(token),auto_compact_tokens=200000)
            commands=[]
            async def record(instance,environment,command,env=None,**kwargs):
                commands.append(command);return command
            async def exercise():
                with patch.object(PreparedGateMixin,'exec_as_agent',record):
                    await agent.exec_as_agent(None,'setup claude --version')
                    await agent.exec_as_agent(None,'export PATH=x; claude --verbose --output-format=stream-json --continue --print')
                    await agent.exec_as_agent(None,'export PATH=x; claude --verbose --output-format=stream-json --resume abc123 --print')
            asyncio.run(exercise())
            self.assertEqual(commands[0],'setup claude --version')
            self.assertIn('--autocompact 200000 --continue --print',commands[1])
            self.assertIn('--autocompact 200000 --resume abc123 --print',commands[2])
            self.assertEqual(commands[2].count('--resume abc123'),1)

    def test_context_controls_reach_native_client_config_only_when_requested(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            pi=RouterPi(logs_dir=root/'pi',model_name='openrouter/qwen/qwen3.8-flash',gate_url='http://gateway:18766',gate_token_file=str(token),context_window_tokens=200000)
            model=pi._build_custom_models_json(pi.model_connection,'qwen/qwen3.8-flash')['providers']['harbor-endpoint']['models'][0]
            self.assertEqual(model['contextWindow'],200000)
            opencode=RouterOpenCode(logs_dir=root/'oc',model_name='openrouter/qwen/qwen3.8-flash',gate_url='http://gateway:18766',gate_token_file=str(token),context_window_tokens=200000)
            self.assertEqual(opencode._opencode_config['provider']['openrouter']['models'],{'qwen/qwen3.8-flash':{'limit':{'context':200000,'output':8192}}})
            hermes=RouterHermes(logs_dir=root/'he',model_name='openrouter/anthropic/claude-haiku-5.5',gate_url='http://gateway:18766',gate_token_file=str(token),context_window_tokens=200000)
            self.assertEqual(yaml.safe_load(hermes._build_config_yaml(hermes.model_name,20))['model'],{
                'default':'anthropic/claude-haiku-5.5','provider':'custom','base_url':'http://gateway:18766/v1',
                'key_env':'OPENAI_API_KEY','api_mode':'chat_completions','context_length':200000})
            self.assertNotIn('yc-gate-offline-fixture-token',hermes._build_config_yaml(hermes.model_name,20))
            default=RouterPi(logs_dir=root/'default',model_name='openrouter/qwen/qwen3.8-flash',gate_url='http://gateway:18766',gate_token_file=str(token))
            self.assertNotIn('contextWindow',default._build_custom_models_json(default.model_connection,'qwen/qwen3.8-flash')['providers']['harbor-endpoint']['models'][0])

    def test_context_control_ranges_reject_invalid_and_autocompact_minimum_is_100k(self):
        self.assertIsNone(validate_context_window_tokens(None))
        self.assertEqual(validate_context_window_tokens(1_000_000),1_000_000)
        self.assertEqual(validate_auto_compact_tokens(100_000),100_000)
        for validator,value in ((validate_context_window_tokens,32767),(validate_context_window_tokens,1_000_001),
                                (validate_auto_compact_tokens,99999),(validate_auto_compact_tokens,1_000_001),
                                (validate_auto_compact_tokens,True)):
            with self.subTest(validator=validator.__name__,value=value),self.assertRaises(ValueError): validator(value)

    def test_claude_code_uses_only_pinned_first_party_haiku_and_bearer_auth(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            agent=RouterClaudeCode(logs_dir=root/'logs',model_name='openrouter/anthropic/claude-haiku-5.5',
                gate_url='http://gateway:18766',gate_token_file=str(token))
            self.assertEqual(agent.extra_env['ANTHROPIC_BASE_URL'],'http://gateway:18766')
            self.assertEqual(agent.extra_env['ANTHROPIC_AUTH_TOKEN'],'yc-gate-offline-fixture-token')
            self.assertEqual(agent.extra_env['ANTHROPIC_API_KEY'],'')
            for key in ('ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL',
                        'ANTHROPIC_DEFAULT_OPUS_MODEL','CLAUDE_CODE_SUBAGENT_MODEL'):
                self.assertEqual(agent.extra_env[key],'claude-haiku-5.5')
            self.assertEqual(agent.extra_env['CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING'],'1')
            self.assertEqual(agent._resolved_model_name(),'anthropic/claude-haiku-5.5')
            self.assertTrue(agent.options.disable_web_search)
            self.assertEqual(agent.options.max_turns,20)
            with self.assertRaisesRegex(ValueError,'restricted'):
                RouterClaudeCode(logs_dir=root/'logs',model_name='openrouter/anthropic/claude-sonnet-4',
                    gate_url='http://gateway:18766',gate_token_file=str(token))

    def test_hermes_uses_native_openai_compatible_gate_and_opaque_token(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            agent=RouterHermes(logs_dir=root/'logs',model_name='openrouter/anthropic/claude-haiku-5.5',
                gate_url='http://gateway:18766',gate_token_file=str(token))
            self.assertEqual(agent.extra_env['OPENAI_BASE_URL'],'http://gateway:18766/v1')
            self.assertEqual(agent.extra_env['OPENAI_API_KEY'],'yc-gate-offline-fixture-token')
            self.assertEqual(agent.extra_env['OPENROUTER_API_KEY'],'yc-gate-offline-fixture-token')
            self.assertEqual(agent.model_name,'anthropic/claude-haiku-5.5')
            self.assertEqual(agent.options.max_turns,20)
            config=yaml.safe_load(agent._build_config_yaml(agent.model_name,20))
            self.assertEqual(config['model'],{'default':'anthropic/claude-haiku-5.5','provider':'custom',
                'base_url':'http://gateway:18766/v1','key_env':'OPENAI_API_KEY','api_mode':'chat_completions'})
            self.assertNotIn('yc-gate-offline-fixture-token',agent._build_config_yaml(agent.model_name,20))

    def test_exact_panel_model_and_opaque_gate_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);token=root/'token';token.write_text('yc-gate-offline-fixture-token')
            desktop=root/'desktop';(desktop/'dist/main').mkdir(parents=True);(desktop/'dist/main/create-runtime.js').write_text('// fixture')
            for cls in (RouterPi,RouterOpenCode):
                agent=cls(logs_dir=root/'logs',model_name='openrouter/qwen/qwen3.8-flash',gate_url='http://gateway:18766',gate_token_file=str(token))
                self.assertEqual(agent.extra_env['OPENROUTER_API_KEY'],'yc-gate-offline-fixture-token')
                self.assertEqual(agent.extra_env['OPENROUTER_BASE_URL'],'http://gateway:18766/v1')
                if cls is RouterPi:
                    self.assertEqual(agent.model_connection.configured_base_url,'http://gateway:18766/v1')
                    config=agent._build_custom_models_json(agent.model_connection,'qwen/qwen3.8-flash')
                    self.assertEqual(config['providers']['harbor-endpoint']['api'],'openai-completions')
                    self.assertEqual(config['providers']['harbor-endpoint']['models'][0]['id'],'qwen/qwen3.8-flash')
            native=RouterYouCoded(logs_dir=root/'logs',model_name='qwen/qwen3.8-flash',desktop_dir=desktop,
                gate_url='http://gateway:18766',gate_token_file=str(token))
            self.assertEqual(native.config['provider'],'openrouter');self.assertEqual(native.config['model'],'qwen/qwen3.8-flash')
            self.assertEqual(native.config['gatewayUrl'],'http://gateway:18766')
            with self.assertRaisesRegex(ValueError,'panel'):
                RouterPi(logs_dir=root/'logs',model_name='openrouter/unknown/model',gate_url='http://gateway:18766',gate_token_file=str(token))

if __name__=='__main__': unittest.main()
