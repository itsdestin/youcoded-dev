import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec, SpecError
from deck.crops import crop_images
from deck.build import build_page, theme_tokens, tokens_css, deck_data

class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp)); self.boxes = crop_images(self.spec, log=lambda *a: None)['boxes']
    def test_builds_one_self_describing_page(self):
        html, warnings = build_page(self.spec, self.boxes)
        self.assertIn('<title>Fixture review</title>', html); self.assertIn('const DECK=', html)
        self.assertIn('[data-theme="midnight"]{--canvas:#0D1117', html)      # tokens inlined
        self.assertIn('.chip{', html); self.assertIn("fetch('/answers'", html)  # css + js inlined
        self.assertEqual(warnings, [])
    def test_deck_data_shape(self):
        d = deck_data(self.spec, self.boxes)
        self.assertEqual(d['runs'], ['before', 'after']); self.assertEqual(d['themeNames']['midnight'], 'Midnight')
        s = d['steps'][1]; self.assertEqual(s['images']['light']['after'], 'images/c--light--after.png'); self.assertEqual(s['boxes']['light']['after'], [25.0, 25.0, 20.0, 15.0])
        self.assertEqual(s['measured'], ''); self.assertEqual(s['risk'], '')
    def test_refuses_when_a_picture_is_missing(self):
        os.remove(os.path.join(self.spec['_base'], 'images', 'c--light--after.png'))
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('no picture for light/after', str(cm.exception))
    def test_refuses_when_a_box_is_missing(self):
        self.boxes['S-2']['light'] = {}
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('S-2: no highlight box for light', str(cm.exception))
    def test_refuses_on_writing_rule_errors(self):
        self.spec['steps'][0]['headline'] = 'We changed the token'
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('banned word "token"', str(cm.exception))
    def test_tokens_for_community_theme_come_from_its_manifest(self):
        # No skip: the worktree has no wecoded-themes/ of its own, build.py must find the workspace root's copy.
        t = theme_tokens(['midnight', 'halftone-dimension', 'meadow-mist'])
        self.assertEqual(t['halftone-dimension']['accent'].lower(), '#e51f48'); self.assertTrue(t['halftone-dimension']['_dark']); self.assertFalse(t['meadow-mist']['_dark'])
        self.assertIn('[data-theme="halftone-dimension"]{', tokens_css(t)); self.assertIn('--radius-md:16px', tokens_css(t))
    def test_unknown_theme_is_an_error(self):
        with self.assertRaises(SpecError): theme_tokens(['no-such-theme'])
    def test_script_safe_json(self):
        self.spec['steps'][0]['notice'] = 'a </script> tag'
        html, _ = build_page(self.spec, self.boxes); self.assertNotIn('</script> tag', html)

if __name__ == '__main__': unittest.main()
