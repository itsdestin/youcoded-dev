import unittest
from run_comparison import schedule, command_for

class RunComparisonTests(unittest.TestCase):
    def test_rotated_repeated_schedule_has_every_cell_once(self):
        p = {'agents':['a','b','c'], 'tasks':['x','y'], 'repetitions':2}
        rows = schedule(p)
        self.assertEqual(len(rows), 12)
        self.assertEqual(len({(r['agent'],r['task'],r['repetition']) for r in rows}), 12)
        self.assertNotEqual([r['agent'] for r in rows[:3]], [r['agent'] for r in rows[3:6]])
    def test_command_contains_gate_token_path_not_provider_credential(self):
        row = {'id':'pi-x-0','agent':'pi','task':'x','repetition':0,'token_file':'/private/opaque.token'}
        cmd = command_for(row, '/lab', '/desktop', '/bin/harbor', 'http://172.17.0.1:18765', 'protocol')
        self.assertIn('comparison_agents:GatePi', cmd)
        self.assertIn('gate_token_file=/private/opaque.token', cmd)
        self.assertNotIn('key_file=/private/opaque.token', cmd)
        self.assertIn('anthropic/claude-haiku-5-5', cmd)
        self.assertIn('--max-retries', cmd)
        claude = command_for({**row, 'agent':'claude-code'}, '/lab', '/desktop', '/bin/harbor', 'http://172.17.0.1:18765', 'protocol')
        self.assertEqual(claude[claude.index('-m')+1], 'claude-haiku-5-5')

if __name__ == '__main__': unittest.main()
