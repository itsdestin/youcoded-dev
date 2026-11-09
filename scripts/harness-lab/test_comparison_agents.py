import tempfile
import unittest
from pathlib import Path
from comparison_agents import GatePi, GateClaudeCode, GateOpenCode, GateHermes

class ComparisonAgentsTests(unittest.TestCase):
    def test_each_client_gets_only_opaque_gate_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            token = root/'gate.token'; token.write_text('yc-gate-not-a-real-provider-key')
            for cls in (GatePi, GateClaudeCode, GateOpenCode, GateHermes):
                agent = cls(logs_dir=root/'logs', model_name='anthropic/claude-haiku-5-5',
                            gate_url='http://172.17.0.1:18765', gate_token_file=str(token))
                self.assertEqual(agent.extra_env['ANTHROPIC_BASE_URL'], 'http://172.17.0.1:18765')
                self.assertEqual(agent.extra_env['ANTHROPIC_API_KEY'], 'yc-gate-not-a-real-provider-key')
                self.assertTrue(agent.version())
                cls.parse_options({'gate_url':'http://172.17.0.1:18765', 'gate_token_file':str(token)})
                if cls is GateOpenCode:
                    self.assertEqual(agent._opencode_config['provider']['anthropic']['options']['baseURL'], 'http://172.17.0.1:18765/v1')
                    self.assertEqual(agent._opencode_config['small_model'], 'anthropic/claude-haiku-5-5')
    def test_hermes_version_probe_uses_current_cli_flag(self):
        self.assertIn('--version', GateHermes.get_version_command(None))

    def test_refuses_real_provider_key_in_gate_token_file(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory)/'key'; token.write_text('sk-ant-test-canary')
            with self.assertRaisesRegex(ValueError, 'opaque'):
                GatePi(logs_dir=Path(directory), model_name='anthropic/claude-haiku-5-5',
                       gate_url='http://172.17.0.1:18765', gate_token_file=str(token))

if __name__ == '__main__':
    unittest.main()
