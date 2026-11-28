"""CLI-level pins for `review-cards.py acceptance` and its verdicts file (card #15 d).

The grader writes <spec stem>.verdicts.json; a missing, truncated or wrong-shaped file must stop
the command with a readable message and exit 1 — never a traceback — and must not leave a
half-written acceptance deck behind. Picture-free like test_contract.py, run as a real
subprocess so the exit code and streams are the ones a session actually sees.

Own file on purpose: other sessions are editing the existing deck test files."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fixture import contract_spec   # noqa: E402

CLI = os.path.join(os.path.dirname(HERE), 'review-cards.py')


class AcceptanceVerdictsFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.spec = contract_spec(self.tmp)
        stem = os.path.basename(self.spec)[:-len('.json')]
        self.verdicts = os.path.join(os.path.dirname(self.spec), stem + '.verdicts.json')
        self.acceptance = os.path.join(os.path.dirname(self.spec), stem + '.acceptance.json')

    def run_cli(self):
        return subprocess.run([sys.executable, '-I', CLI, 'acceptance', self.spec],
                              capture_output=True, text=True, timeout=60)

    def assert_clean_refusal(self, r, *needles):
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn('Traceback', r.stderr)
        self.assertIn('cannot read verdicts file', r.stderr)
        for n in needles:
            self.assertIn(n, r.stderr)
        self.assertFalse(os.path.exists(self.acceptance), 'no acceptance deck may be written')

    def test_missing_verdicts_file(self):
        self.assert_clean_refusal(self.run_cli(), self.verdicts)

    def test_corrupt_verdicts_file_is_reported_not_a_traceback(self):
        # Truncated JSON: the case the old `except OSError` alone let through as a crash.
        with open(self.verdicts, 'w') as f:
            f.write('{"R1": {"verdict": "pa')
        self.assert_clean_refusal(self.run_cli(), 'line 1 column')   # the parser's own reason is shown

    def test_a_valid_verdicts_file_still_builds_the_deck(self):
        with open(self.verdicts, 'w') as f:
            json.dump({'R1': {'verdict': 'pass', 'evidence': 'answered a'},
                       'R3': {'verdict': 'fail', 'evidence': 'one failed'}}, f)
        r = self.run_cli()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.exists(self.acceptance))


if __name__ == '__main__':
    unittest.main()
