"""Words-only steps: a question or a statement with NO picture. Validation, the data the page
gets, and the runs/images rule. Picture-free like test_live.py — this is what CI runs.
Plan: docs/active/plans/2026-09-01-feature-flow-plan.md Task 1."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import words_spec                                   # noqa: E402
from deck.build import build_page, deck_data                     # noqa: E402
from deck.crops import crop_images                               # noqa: E402
from deck.spec import SpecError, is_words, load_spec, no_pictures, validate   # noqa: E402


def spec_with(tmp, mutate, **over):
    p = words_spec(tmp, **over)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


class WordsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_words_deck_needs_no_images_or_runs(self):
        s = load_spec(words_spec(self.tmp))
        self.assertTrue(no_pictures(s))
        self.assertNotIn('images', s)
        self.assertEqual(list(s['runs']), ['today'])
        self.assertEqual(errs(s), [])

    def test_one_option_is_enough_without_a_picture(self):
        s = load_spec(words_spec(self.tmp))
        self.assertEqual([e for e in errs(s) if 'Q-1' in e], [])

    def test_a_picture_decide_still_needs_two_options(self):
        # The two-option floor stays for picture decks: one option plus Other is a yes/no in disguise.
        s = spec_with(self.tmp, lambda r: r['steps'].append(
            {'id': 'D-1', 'surface': 'Games', 'path': 'Board', 'crop': 'bubble', 'highlight': {'text': 'Send'},
             'headline': 'Bigger?', 'options': [{'id': 'a', 'label': 'Yes', 'summary': 'x'}]}),
            images='images/questions', runs={'today': '/nowhere'})
        self.assertTrue(any('D-1: a decide step needs at least 2 options' in e for e in errs(s)))

    def test_words_step_refuses_a_picture(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'crop': 'bubble'}))
        self.assertTrue(any('Q-1: a words step has no crop' in e for e in errs(s)))

    def test_words_statement_needs_its_body(self):
        s = spec_with(self.tmp, lambda r: r['steps'][2].pop('notice'))
        self.assertTrue(any('Q-3: missing notice' in e for e in errs(s)))

    def test_words_step_obeys_the_writing_rules(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'summary': 'Uses a new reducer'}))
        self.assertTrue(any('banned word "reducer"' in e for e in errs(s)))

    def test_words_step_yes_no_labels_obey_the_writing_rules(self):
        # The yes/no labels are button copy Destin reads — the same banned-word rule
        # that already covers headline/options/etc must reach them too.
        s = spec_with(self.tmp, lambda r: r['steps'][2].update({'yes': 'Uses the reducer'}))
        self.assertTrue(any('Q-3: yes label uses banned word "reducer"' in e for e in errs(s)))

    def test_deck_data_marks_words_and_carries_labels(self):
        s = load_spec(words_spec(self.tmp))
        d = deck_data(s, {})
        q1, q3 = d['steps'][0], d['steps'][2]
        self.assertTrue(q1['words'] and q3['words'])
        self.assertEqual(q1['kind'], 'decide'); self.assertEqual(len(q1['options']), 1)
        self.assertNotIn('images', q1); self.assertNotIn('boxes', q1)
        self.assertEqual((q3['yes'], q3['no']), ('Holds', 'Fails'))
        self.assertNotIn('kind', q3)

    def test_crop_and_build_skip_words_steps(self):
        s = load_spec(words_spec(self.tmp))
        r = crop_images(s, log=lambda m: None)
        self.assertEqual((r['count'], r['missing']), (0, []))
        page, warnings = build_page(s, r['boxes'])
        self.assertIn('"words": true', page)
        self.assertEqual(warnings, [])

    def test_summary_prints_the_note_plainly(self):
        from deck.serve import summary
        s = load_spec(words_spec(self.tmp))
        # Q-1 carries a leftover note_kind — an answers file written before the tags were
        # removed (Destin, 2026-09-04) — and it must be ignored, not printed.
        state = {'submitted': '2026-09-01T10:00:00Z', 'answers': {
            'Q-1': {'v': 'pick', 'pick': 'a', 'note': 'but smaller', 'note_kind': 'now'},
            'Q-3': {'v': 'yes', 'note': 'fine'}}}
        lines = summary(s, state).split('\n')
        self.assertEqual(lines[1], 'Q-1 pick a — "but smaller"')
        self.assertEqual(lines[3], 'Q-3 yes — "fine"')

    def test_is_words_is_the_flag_not_a_guess(self):
        # A step that merely FORGOT its crop is still an error, not a silent words step.
        self.assertFalse(is_words({'id': 'x', 'headline': 'h'}))
        self.assertTrue(is_words({'id': 'x', 'words': True}))
        # A contract step (rows) is a words step too — even with no rows yet, so the empty
        # contract gets the contract error in Task 3, not "missing crop".
        self.assertTrue(is_words({'id': 'x', 'rows': []}))


if __name__ == '__main__':
    unittest.main()
