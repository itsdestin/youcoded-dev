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
    def test_preview_without_chrome_refuses(self):
        # WHY this case lives in test_cli and not the render suite: CI must be able to run it
        # on a machine with no browser at all. PATH is emptied for the call, so `preview` sees
        # exactly what such a machine sees.
        old = os.environ['PATH']
        os.environ['PATH'] = tempfile.mkdtemp()
        try:
            code, out, err = self.run_cli('preview', self.p)
        finally:
            os.environ['PATH'] = old
        self.assertEqual(code, 2, out + err)
        self.assertIn('preview needs google-chrome-stable on PATH', out + err)

    # `selfie` renders the deck fixture with the deck code at two git refs and boxes what
    # moved. The DRY RUN is the half that needs neither Chrome nor a checkout: it lays out the
    # synthetic run, copies the three fixture decks beside it, and writes the review spec that
    # a real run would then fill with pictures. That is what CI can check.
    def test_selfie_dry_run_writes_the_review_spec_and_checks_nothing_out(self):
        out = tempfile.mkdtemp()
        code, so, se = self.run_cli('selfie', '--dry-run', '--out', out)
        self.assertEqual(code, 0, so + se)
        p = os.path.join(out, 'selfie-review.json')
        self.assertTrue(os.path.exists(p), so + se)
        s = json.load(open(p))
        # One step per fixture page x window size: three decks, eight pages, two sizes.
        self.assertGreaterEqual(len(s['steps']), 8, json.dumps(s['steps'], indent=1))
        for st in s['steps']:
            self.assertEqual(st['highlight'], 'auto')
            self.assertIn(st['crop'], s['crops'])
        # The two run folders the pictures will land in exist, so a session can see the shape
        # of the run before anything is rendered.
        for run in s['runs'].values():
            self.assertTrue(os.path.isdir(run), run)
        # The three fixture decks are beside the synthetic run, pointed at it.
        for stem in ('selfie', 'selfie-brief', 'selfie-questions'):
            self.assertTrue(os.path.exists(os.path.join(out, 'deck', stem + '.json')), stem)
        self.assertTrue(os.path.exists(os.path.join(out, 'runs', 'after', 'shots-main', 'midnight', 'home.png')))
        # A dry run never checks a second copy of the workspace out.
        self.assertFalse(os.path.exists(os.path.join(out, 'before')), 'a dry run makes no worktree')

    def test_selfie_bad_before_ref_refuses_plainly_instead_of_a_traceback(self):
        # `_add_worktree` raises RuntimeError on a ref git cannot check out; that used to
        # propagate straight out of main() as a traceback (the selfie dispatch sits before the
        # try/except SpecError). Fake can_render() so this is provable on a machine with no
        # Chrome or ffmpeg on PATH — the thing under test is the bad ref, not the browser check.
        import deck.selfie as selfie_mod
        orig = selfie_mod.can_render
        selfie_mod.can_render = lambda log=print: True
        self.addCleanup(setattr, selfie_mod, 'can_render', orig)
        out = tempfile.mkdtemp()
        bad_ref = 'no-such-ref-selfie-test-xyz'
        code, so, se = self.run_cli('selfie', '--before', bad_ref, '--out', out)
        self.assertEqual(code, 1, so + se)
        self.assertNotIn('Traceback', so + se)
        self.assertIn(bad_ref, se, so + se)

    def test_wait_reads_the_answers_file(self):
        json.dump({'submitted': '2026-08-27T18:40:00Z', 'answers': {}}, open(os.path.join(self.d, 'deck.answers.json'), 'w'))
        code, out, _ = self.run_cli('wait', self.p, '--timeout', '1'); self.assertEqual(code, 0); self.assertIn('3 skipped', out)

if __name__ == '__main__': unittest.main()
