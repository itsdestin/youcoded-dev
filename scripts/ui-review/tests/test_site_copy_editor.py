import importlib.util
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location(
    'site_copy_editor', os.path.join(os.path.dirname(HERE), 'site-copy-editor.py'))
sce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sce)


def marked(html):
    """The ids identify_text_blocks assigned, in document order."""
    out, count = sce.identify_text_blocks(html)
    return out, count


class MarkingTests(unittest.TestCase):
    def test_prose_tags_and_containers_are_marked(self):
        out, n = marked('<p>Hello</p><div class="showcase-title">Big</div>')
        self.assertEqual(n, 2)
        self.assertIn('<p data-c="b0" data-c-type="text">Hello</p>', out)
        self.assertIn('class="showcase-title" data-c="b1" data-c-type="text"', out)

    def test_a_summary_question_is_marked(self):
        # The FAQ questions are <summary>; the tool ignored them until 2026-09-10.
        out, n = marked('<details class="panel"><summary>Do I have to pay?</summary>'
                        '<div class="a">No. It is free.</div></details>')
        self.assertEqual(n, 2)
        self.assertIn('<summary data-c=', out)

    def test_a_single_letter_class_matches_exactly_and_not_as_a_substring(self):
        # WHY: FAQ answers use class="a". As a substring match it would swallow
        # nearly every div on the page (2026-09-10).
        out, n = marked('<div class="a">answer</div><div class="abc">not an answer</div>')
        self.assertEqual(n, 1)
        self.assertIn('class="a" data-c=', out)
        self.assertNotIn('class="abc" data-c=', out)

    def test_a_nested_block_survives_a_matched_ancestor(self):
        # WHY: the first version matched whole elements, so a matched ancestor
        # consumed nested blocks and the first FAQ answer was never marked.
        out, n = marked('<div class="origin-story"><p>outer</p><div class="a">inner</div></div>')
        self.assertEqual(n, 3)
        self.assertIn('class="a" data-c=', out)

    def test_markup_inside_scripts_styles_and_comments_is_left_alone(self):
        html = ('<p>Real copy</p>'
                '<script>var t = \'<p class="a">in js</p>\';</script>'
                '<style>/* <p>in css</p> */</style>'
                '<!-- <p>in comment</p> -->')
        out, n = marked(html)
        self.assertEqual(n, 1)
        self.assertIn('var t = \'<p class="a">in js</p>\'', out)
        self.assertNotIn('data-c', html.split('<script>')[1])

    def test_the_returned_count_matches_the_markers_in_the_output(self):
        out, n = marked('<p>one</p><div class="a">two</div><span>three</span>')
        self.assertEqual(n, len(re.findall(r'data-c="', out)))

    def test_a_template_literal_id_is_skipped(self):
        # WHY: id="sw-${theme.id}" is substituted by the page's own script; adding
        # data-c is safe but renaming the id would break the build.
        out, n = marked('<button id="sw-${theme.id}" class="sw"></button><p>Copy</p>')
        self.assertEqual(n, 1)
        self.assertIn('id="sw-${theme.id}"', out)

    def test_an_empty_block_is_still_marked_so_the_page_can_filter_it(self):
        # A matched container holding only whitespace is marked here and removed
        # by the page (no bare gap becomes an editable block).
        out, n = marked('<div class="hero-sub">\n  </div>')
        self.assertEqual(n, 1)
        self.assertIn('class="hero-sub" data-c=', out)

    def test_the_editor_payload_is_injected_once(self):
        out, _ = marked('<html><body><p>Hello</p></body></html>')
        self.assertEqual(len(re.findall(r'<p data-c="b0" data-c-type="text">', out)), 1)
        self.assertIn('#ce-toolbar{position:fixed', out)          # the chrome CSS
        self.assertIn("document.querySelectorAll('[data-c-type=\"text\"]')", out)  # the controller
        self.assertEqual(out.count('#ce-toolbar{position:fixed'), 1)
        # the payload is injected INSIDE the body, before its closing tag
        self.assertLess(out.index('#ce-toolbar{position:fixed'), out.rindex('</body>'))


class SaveTests(unittest.TestCase):
    def test_edits_are_written_as_json_and_markdown(self):
        import tempfile
        d = tempfile.mkdtemp()
        state = {
            'key': 'site-copy-editor', 'submitted': '2026-09-10T12:00:00Z', 'blockCount': 2,
            'edits': {'b0': {'original': 'Old <b>hero</b>', 'current': 'New hero'}},
        }
        jpath, mpath = sce.write_edits(d, state)
        self.assertTrue(os.path.exists(jpath))
        body = open(mpath, encoding='utf-8').read()
        self.assertIn('- was: Old hero', body)
        self.assertIn('- now: New hero', body)

    def test_no_edits_is_recorded_plainly(self):
        import tempfile
        d = tempfile.mkdtemp()
        _, mpath = sce.write_edits(d, {'key': 'k', 'edits': {}})
        self.assertIn('_No edits._', open(mpath, encoding='utf-8').read())


if __name__ == '__main__':
    unittest.main()
