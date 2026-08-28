import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.spec import load_spec, validate, run_names, word_count, banned_in, workspace_root, SpecError

def write_spec(d, **over):
    # images/deck names the spec stem ('deck.json'), which is what validate() wants — see
    # test_images_folder_must_name_the_deck for the warning when it does not.
    spec = {"title": "T", "key": "t", "out": "t.html", "images": "images/deck", "runs": {"before": "/a", "after": "/b"},
            "crops": {"c": ["main", "home", "100x50+10+20"]},
            "steps": [{"id": "S-1", "surface": "Home", "path": "Chat", "crop": "c",
                       "headline": "Short headline.", "changed": "What changed.", "notice": "You will notice."}]}
    spec.update(over)
    p = os.path.join(d, 'deck.json'); json.dump(spec, open(p, 'w')); return p

class SpecTests(unittest.TestCase):
    def setUp(self): self.d = tempfile.mkdtemp()
    def test_load_merges_shared_crops_and_defaults(self):
        s = load_spec(write_spec(self.d))
        self.assertEqual(s['_stem'], 'deck'); self.assertIn('bubble', s['_crops']); self.assertIn('c', s['_crops'])
        self.assertEqual(s['themes'][0], 'midnight'); self.assertEqual(run_names(s), ['before', 'after'])
    def test_missing_top_level_key_raises(self):
        with self.assertRaises(SpecError): load_spec(self._without('title'))
    def test_workspace_root_holds_the_sub_repos(self):
        # The worktree has no youcoded/ or wecoded-themes/ of its own; the root above worktrees/ does.
        root = workspace_root()
        self.assertTrue(os.path.isdir(os.path.join(root, 'wecoded-themes', 'themes')), root)
        self.assertTrue(os.path.isfile(os.path.join(root, 'youcoded', 'desktop', 'src', 'renderer', 'styles', 'globals.css')), root)
    def _without(self, key):
        p = write_spec(self.d); s = json.load(open(p)); del s[key]; json.dump(s, open(p, 'w')); return p
    def test_three_runs_rejected(self):
        with self.assertRaises(SpecError): load_spec(write_spec(self.d, runs={"a": "/a", "b": "/b", "c": "/c"}))
    def test_valid_spec_has_no_errors(self):
        self.assertEqual(validate(load_spec(write_spec(self.d))), ([], []))
    def test_images_folder_must_name_the_deck(self):
        s = load_spec(write_spec(self.d, images='images'))
        errors, warnings = validate(s)
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1); self.assertIn('does not contain the spec name "deck"', warnings[0])

    def test_headline_word_limit(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['headline'] = ' '.join(['word'] * 26)
        errors, _ = validate(s); self.assertTrue(any('26 words' in e for e in errors))
    def test_banned_words_whole_word_case_insensitive(self):
        self.assertEqual(banned_in('The Token is a primitive'), ['token', 'primitive'])
        self.assertEqual(banned_in('property tokens'), [])          # not whole words
        self.assertEqual(banned_in('ipc call via the DOM'), ['ipc', 'dom'])
        s = load_spec(write_spec(self.d)); s['steps'][0]['changed'] = 'Uses a new CSS class'
        errors, _ = validate(s); self.assertTrue(any('banned word "css class"' in e for e in errors))
    def test_required_fields(self):
        s = load_spec(write_spec(self.d)); del s['steps'][0]['notice']; s['steps'][0]['surface'] = ''
        errors, _ = validate(s); self.assertTrue(any('missing notice' in e for e in errors)); self.assertTrue(any('missing surface' in e for e in errors))
    def test_unknown_crop_is_an_error(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['crop'] = 'nope'
        self.assertTrue(any('unknown crop' in e for e in validate(s)[0]))
    def test_highlight_rules(self):
        s = load_spec(write_spec(self.d, runs={"today": "/a"}))
        self.assertTrue(any('needs a highlight' in e for e in validate(s)[0]))
        s['steps'][0]['highlight'] = 'auto'; self.assertTrue(any('"auto" highlight needs' in e for e in validate(s)[0]))
        s['steps'][0]['highlight'] = {'box': [1, 2, 3, 4]}; errors, warnings = validate(s)
        self.assertEqual(errors, []); self.assertTrue(any('hand-placed box' in w for w in warnings))
        s['steps'][0]['highlight'] = {'nothing': 1}; self.assertTrue(any('selector, text or box' in e for e in validate(s)[0]))
    def test_warnings_for_long_risk_and_numberless_measured(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['risk'] = ' '.join(['r'] * 41); s['steps'][0]['measured'] = 'a bit taller'
        _, warnings = validate(s); self.assertEqual(len(warnings), 2)
    def test_choice_step_rules(self):
        from deck.spec import is_choice
        spec = load_spec(write_spec(self.d))
        st = {'id': 'C-1', 'surface': 'Home', 'path': 'Chat', 'headline': 'Which?', 'variants': [{'id': 'A', 'label': 'a', 'crop': 'c', 'summary': 'x'}]}
        spec['steps'].append(st); self.assertTrue(is_choice(st))
        errs = validate(spec)[0]; self.assertTrue(any('at least 2 variants' in e for e in errs))
        st['variants'].append({'id': 'A', 'label': 'b', 'crop': 'nope', 'summary': 'uses a token', 'highlight': {}})
        errs = validate(spec)[0]
        for want in ('duplicate variant id "A"', 'unknown crop "nope"', 'banned word "token"', 'highlight must have selector, text or box'):
            self.assertTrue(any(want in e for e in errs), (want, errs))
        st['variants'][1] = {'id': 'B', 'label': 'b', 'crop': 'c', 'summary': 'fine'}
        self.assertEqual([e for e in validate(spec)[0] if e.startswith('C-1')], [])   # no changed/notice needed on a choice step
    def test_decide_step_rules(self):
        from deck.spec import is_decide
        spec = load_spec(write_spec(self.d))
        st = {'id': 'D-1', 'surface': 'Home', 'path': 'Chat', 'headline': 'Where should it go?',
              'crop': 'c', 'highlight': {'selector': '#send'},
              'options': [{'id': 'a', 'label': 'Leave it', 'summary': 'Nothing moves.'}]}
        spec['steps'].append(st); self.assertTrue(is_decide(st))
        errs = validate(spec)[0]; self.assertTrue(any('at least 2 options' in e for e in errs))
        st['options'].append({'id': 'a', 'label': 'b', 'summary': 'uses a reducer'})
        errs = validate(spec)[0]
        for want in ('duplicate option id "a"', 'banned word "reducer"'):
            self.assertTrue(any(want in e for e in errs), (want, errs))
        st['options'][1] = {'id': 'b', 'label': 'Move it', 'summary': 'It drops below.', 'cost': 'One more row of height.'}
        # no changed/notice needed on a decide step — the options are the right-hand column
        self.assertEqual([e for e in validate(spec)[0] if e.startswith('D-1')], [])
        del st['highlight']   # one picture only, so there is nothing to diff: a highlight is required
        self.assertTrue(any('needs a highlight' in e for e in validate(spec)[0]))

    def test_duplicate_ids(self):
        s = load_spec(write_spec(self.d)); s['steps'].append(dict(s['steps'][0]))
        self.assertTrue(any('duplicate id' in e for e in validate(s)[0]))
    def test_word_count(self):
        self.assertEqual(word_count("it's a two-line, five-word headline"), 5)
        self.assertEqual(word_count("it’s a two-line, five-word headline"), 5)   # curly apostrophe is one word too

if __name__ == '__main__': unittest.main()


class ClipStepTests(unittest.TestCase):
    def setUp(self): self.d = tempfile.mkdtemp()
    def _spec(self, clip):
        return load_spec(write_spec(self.d, steps=[{"id": "C-1", "surface": "Home", "path": "Chat", "clip": clip,
                                                    "headline": "It moves.", "changed": "Now animated.", "notice": "Motion."}]))
    def test_scene_name_clip_validates_and_names_its_files(self):
        from deck.spec import clip_files
        s = self._spec("hero"); errors, _ = validate(s); self.assertEqual(errors, [])
        vids, posters = clip_files(s, s['steps'][0])
        self.assertEqual(vids, {"before": "images/deck/clips/hero--before.webm", "after": "images/deck/clips/hero--after.webm"})
        self.assertEqual(posters["after"], "images/deck/clips/hero--after.webp")
    def test_explicit_files_need_every_run(self):
        errors, _ = validate(self._spec({"before": "a.webm"}))
        self.assertTrue(any('no file for run "after"' in e for e in errors), errors)
    def test_clip_step_rejects_crop_and_banned_words(self):
        s = self._spec("hero"); s['steps'][0]['crop'] = 'c'; s['steps'][0]['changed'] = 'the reducer moved'
        errors, _ = validate(s)
        self.assertTrue(any('has no crop' in e for e in errors), errors)
        self.assertTrue(any('banned word "reducer"' in e for e in errors), errors)
