import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.spec import load_spec, validate, run_names, word_count, banned_in, workspace_root, SpecError

def write_spec(d, **over):
    spec = {"title": "T", "key": "t", "out": "t.html", "images": "images", "runs": {"before": "/a", "after": "/b"},
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
    def test_duplicate_ids(self):
        s = load_spec(write_spec(self.d)); s['steps'].append(dict(s['steps'][0]))
        self.assertTrue(any('duplicate id' in e for e in validate(s)[0]))
    def test_word_count(self):
        self.assertEqual(word_count("it's a two-line, five-word headline"), 5)
        self.assertEqual(word_count("it’s a two-line, five-word headline"), 5)   # curly apostrophe is one word too

if __name__ == '__main__': unittest.main()
