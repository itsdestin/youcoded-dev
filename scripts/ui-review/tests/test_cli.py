import io, json, os, sys, tempfile, unittest
from contextlib import redirect_stderr, redirect_stdout
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
import importlib.util
spec_ = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py')); rc = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(rc)

class CliTests(unittest.TestCase):
    def setUp(self):
        self.p = make_fixture(tempfile.mkdtemp()); self.d = os.path.dirname(self.p)
        # WHY: `build` now opens the deck on whatever theme the live app is on. Point that
        # lookup at a file that does not exist, so these tests read the same on any machine
        # instead of following whichever theme Destin happens to be using today.
        os.environ['YOUCODED_APPEARANCE_FILE'] = os.path.join(self.d, 'no-appearance.json')
        self.addCleanup(os.environ.pop, 'YOUCODED_APPEARANCE_FILE', None)
    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err): code = rc.main(list(args))
        return code, out.getvalue(), err.getvalue()
    def test_build_crops_and_writes_the_page(self):
        code, out, err = self.run_cli('build', self.p); self.assertEqual(code, 0, err)
        self.assertIn('4 crops', out); self.assertIn('wrote', out); self.assertTrue(os.path.exists(os.path.join(self.d, 'fixture.html')))
    def test_build_reports_missing_as_failure_and_writes_no_page(self):
        s = json.load(open(self.p)); s['steps'][1]['highlight'] = {'selector': '#nope'}; json.dump(s, open(self.p, 'w'))
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 1); self.assertIn('missing: S-2', err)
        self.assertFalse(os.path.exists(os.path.join(self.d, 'fixture.html')))
    def test_writing_rule_error_is_reported(self):
        s = json.load(open(self.p)); s['steps'][0]['headline'] = 'Changed the token'; json.dump(s, open(self.p, 'w'))
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 1); self.assertIn('banned word', err)
    def test_theme_flag_opens_the_page_on_that_theme(self):
        code, _, err = self.run_cli('build', self.p, '--theme', 'light'); self.assertEqual(code, 0, err)
        page = open(os.path.join(self.d, 'fixture.html')).read()
        self.assertIn('<html lang="en" data-theme="light">', page)
    def test_without_the_flag_the_page_opens_on_the_specs_first_theme(self):
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 0, err)
        page = open(os.path.join(self.d, 'fixture.html')).read()
        self.assertIn('<html lang="en" data-theme="midnight">', page)
    def test_the_live_apps_theme_opens_the_deck_when_it_is_captured(self):
        # The fixture's shots exist in midnight and light; a live app on light must open on light.
        json.dump({'theme': 'light'}, open(os.environ['YOUCODED_APPEARANCE_FILE'], 'w'))
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 0, err)
        page = open(os.path.join(self.d, 'fixture.html')).read()
        self.assertIn('<html lang="en" data-theme="light">', page)
    def test_wait_reads_the_answers_file(self):
        json.dump({'submitted': '2026-08-27T18:40:00Z', 'answers': {}}, open(os.path.join(self.d, 'deck.answers.json'), 'w'))
        code, out, _ = self.run_cli('wait', self.p, '--timeout', '1'); self.assertEqual(code, 0); self.assertIn('3 skipped', out)

if __name__ == '__main__': unittest.main()
