import json, os, re, sys, tempfile, unittest
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
        self.assertIn('<html lang="en" data-theme="midnight">', html)        # first paint matches the deck's first theme
        self.spec['themes'] = ['light', 'midnight']                                  # …and follows the spec, not a hardcoded midnight
        html2, _ = build_page(self.spec, self.boxes)
        self.assertIn('<html lang="en" data-theme="light">', html2); self.assertNotIn('__THEME__', html2)
        self.assertEqual(warnings, [])
    def test_deck_data_shape(self):
        d = deck_data(self.spec, self.boxes)
        self.assertEqual(d['runs'], ['before', 'after']); self.assertEqual(d['themeNames']['midnight'], 'Midnight')
        s = d['steps'][1]; self.assertEqual(s['images']['light']['after'], 'images/deck/c--light--after.png'); self.assertEqual(s['boxes']['light']['after'], [25.0, 25.0, 20.0, 15.0])
        self.assertEqual(s['measured'], ''); self.assertEqual(s['risk'], '')
    def test_refuses_when_a_picture_is_missing(self):
        os.remove(os.path.join(self.spec['_base'], 'images', 'deck', 'c--light--after.png'))
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
    def test_theme_tokens_outrank_the_page_defaults(self):
        # page.css's defaults sit on a bare `:root{...}` (specificity 0,1,0); the theme tokens must
        # beat that regardless of <style> tag order, so every emitted rule needs `:root[data-theme="`.
        css = tokens_css(theme_tokens(['midnight', 'halftone-dimension']))
        for line in css.splitlines():
            self.assertTrue(line.startswith(':root[data-theme="'), line)
        with open(os.path.join(os.path.dirname(HERE), 'deck', 'page.css')) as f:
            page_css = f.read()
        m = re.search(r':root\{([^}]*)\}', page_css)
        self.assertIsNotNone(m, 'page.css should declare a bare :root{...} block')
        self.assertIn('--radius-md', m.group(1))
    def test_unknown_theme_is_an_error(self):
        with self.assertRaises(SpecError): theme_tokens(['no-such-theme'])
    def test_script_safe_json(self):
        self.spec['steps'][0]['notice'] = 'a </script> tag'
        html, _ = build_page(self.spec, self.boxes); self.assertNotIn('</script> tag', html)

    def test_step_with_its_own_theme_list(self):
        # A real-app capture exists in one theme only; that step lists it and the deck must not demand the others.
        self.spec['steps'][1]['themes'] = ['light']
        boxes = crop_images(self.spec, log=lambda *a: None)['boxes']
        self.assertEqual(sorted(boxes['S-2']), ['light'])                          # cropped for the step's theme only
        os.remove(os.path.join(self.spec['_base'], 'images', 'deck', 'c--midnight--after.png')); os.remove(os.path.join(self.spec['_base'], 'images', 'deck', 'c--midnight--before.png'))
        self.spec['steps'] = [self.spec['steps'][1]]                                # midnight missing must not block THIS step
        html, _ = build_page(self.spec, boxes)
        d = deck_data(self.spec, boxes)
        self.assertEqual(d['steps'][0]['themes'], ['light']); self.assertEqual(sorted(d['steps'][0]['images']), ['light'])
        self.assertEqual(d['themes'], ['midnight', 'light'])                       # the deck-wide list is untouched
        self.assertIn('st.themes || DECK.themes', html)

    def test_choice_step_cuts_one_picture_per_variant_from_the_last_run(self):
        # Destin 2026-08-27: variants of one thing are ONE question on one page, not a yes/no each.
        self.spec['steps'].append({'id': 'S-4', 'surface': 'Home', 'path': 'Chat', 'headline': 'Which one?',
            'variants': [{'id': 'A', 'label': 'Plain', 'crop': 'c', 'summary': 'No box.'},
                         {'id': 'B', 'label': 'Boxed', 'crop': 'c', 'summary': 'Has a box.', 'highlight': {'selector': '#send'}, 'measured': '80 px wide'}]})
        from deck.spec import validate
        self.assertEqual(validate(self.spec)[0], [])
        boxes = crop_images(self.spec, log=lambda *a: None)['boxes']
        self.assertEqual(sorted(boxes['S-4']['light']), ['B'])                       # A has no highlight, so no box — and that is fine
        html, _ = build_page(self.spec, boxes)
        d = deck_data(self.spec, boxes)['steps'][3]
        self.assertEqual(d['kind'], 'choice'); self.assertEqual([v['id'] for v in d['variants']], ['A', 'B'])
        self.assertEqual(d['images']['light'], {'A': 'images/deck/c--light--after.png', 'B': 'images/deck/c--light--after.png'})   # the LAST run
        self.assertEqual(d['boxes']['light']['B'], [25.0, 25.0, 20.0, 15.0]); self.assertNotIn('changed', d)
        self.assertIn('None of these', html)

    def test_decide_step_is_one_picture_beside_written_options(self):
        # Destin 2026-08-27: a two-sided question cannot wear yes/no buttons. Two panels — the
        # picture of how it is today, and the options merged into the decision column.
        self.spec['steps'].append({'id': 'S-4', 'surface': 'Home', 'path': 'Chat', 'crop': 'c',
            'highlight': {'selector': '#send'}, 'headline': 'Where should the block go?',
            'options': [{'id': 'a', 'label': 'Leave it', 'summary': 'Nothing moves.', 'cost': 'Stays crowded.'},
                        {'id': 'b', 'label': 'Move it down', 'summary': 'It drops below.', 'measured': '40 px down'}]})
        from deck.spec import validate
        self.assertEqual(validate(self.spec)[0], [])
        boxes = crop_images(self.spec, log=lambda *a: None)['boxes']
        html, _ = build_page(self.spec, boxes)
        d = deck_data(self.spec, boxes)['steps'][3]
        self.assertEqual(d['kind'], 'decide'); self.assertEqual([o['id'] for o in d['options']], ['a', 'b'])
        self.assertEqual(d['options'][0]['cost'], 'Stays crowded.')
        self.assertNotIn('changed', d)                                  # no What changed card
        self.assertEqual(sorted(d['images']['light']), ['after', 'before'])   # a picture per run, like a normal step
        self.assertEqual(d['boxes']['light']['after'], [25.0, 25.0, 20.0, 15.0])


class TemplateTests(unittest.TestCase):
    """`templates/` is the answer to "what does a spec of this kind look like?" — one worked
    example per step kind in the design's chooser (§4, §6.5). A template that does not validate
    teaches a session a spec that will be refused, so every one of them is checked here.

    They are validated, never BUILT: a template names crops and run folders but ships no
    screenshots, and pictures are build's business, not the spec's."""

    DIR = os.path.join(os.path.dirname(HERE), 'templates')
    NAMES = ['approve.json', 'brief.json', 'choice.json', 'clip.json', 'contract.json',
             'decide.json', 'live.json', 'questions.json']

    def _files(self):
        return sorted(f for f in os.listdir(self.DIR) if f.endswith('.json'))

    def test_there_is_a_template_for_every_kind(self):
        self.assertEqual(self._files(), self.NAMES)

    def test_every_template_loads_and_validates_with_no_errors(self):
        from deck.spec import validate
        for name in self._files():
            with self.subTest(template=name):
                spec = load_spec(os.path.join(self.DIR, name))
                errors, _ = validate(spec)
                self.assertEqual(errors, [], f'{name}: ' + '; '.join(errors))

    def test_no_comment_survives_the_load(self):
        # The whole point of `_comment` is that it explains the field to the session writing the
        # deck and then disappears — it must never reach validation, the page or the answers file.
        def walk(node, where):
            if isinstance(node, dict):
                self.assertEqual([k for k in node if k.startswith('_comment')], [], where)
                for k, v in node.items():
                    walk(v, f'{where}.{k}')
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, f'{where}[{i}]')
        for name in self._files():
            with self.subTest(template=name):
                walk(load_spec(os.path.join(self.DIR, name)), name)

    def test_every_template_is_actually_commented(self):
        # A template with no comments is just another deck: the explanation IS the deliverable.
        for name in self._files():
            with self.subTest(template=name):
                with open(os.path.join(self.DIR, name)) as f:
                    raw = f.read()
                self.assertGreaterEqual(raw.count('"_comment'), 6, name)

    def test_each_kind_is_covered_by_the_template_named_after_it(self):
        from deck.spec import is_choice, is_clip, is_contract, is_decide, is_page, is_question, is_words
        from deck.live import is_live
        def steps(name):
            return load_spec(os.path.join(self.DIR, name))['steps']
        self.assertTrue(any(is_choice(s) for s in steps('choice.json')))
        self.assertTrue(any(is_decide(s) for s in steps('decide.json')))
        self.assertTrue(any(is_clip(s) for s in steps('clip.json')))
        self.assertTrue(any(is_live(s) for s in steps('live.json')))
        self.assertTrue(any(is_contract(s) for s in steps('contract.json')))
        self.assertTrue(any(is_question(s) for s in steps('questions.json')))
        self.assertTrue(any(is_page(s) for s in steps('questions.json')))
        # Approve and brief are the same shape; the run count is what tells them apart.
        approve, brief = load_spec(os.path.join(self.DIR, 'approve.json')), load_spec(os.path.join(self.DIR, 'brief.json'))
        self.assertEqual(len(approve['runs']), 2)
        self.assertEqual(list(brief['runs']), ['today'])
        for spec in (approve, brief):
            self.assertTrue(all(not is_words(s) and not is_live(s) for s in spec['steps']))


if __name__ == '__main__': unittest.main()
