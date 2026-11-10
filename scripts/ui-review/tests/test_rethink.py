"""The 2026-11-09 rethink of the review deck, pinned: one text box per answer, the "calls I
made" list, the how-it-was-checked note on Today, the word caps, the build stamp, and the
areas / changed calls a session must be able to read back out of the summary.
Source: docs/active/design/2026-11-09-review-deck-rethink/ (Destin's answers, both rounds)."""
import json
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import words_spec                                   # noqa: E402
from deck.build import deck_data                                 # noqa: E402
from deck.serve import summary                                   # noqa: E402
from deck.spec import BULLET_WORDS_MAX, PART_WORDS_MAX, load_spec, validate   # noqa: E402

DECK = os.path.join(os.path.dirname(HERE), 'deck')
CALLS = {'id': 'K-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Calls I made for you',
         'calls': [{'id': 'size', 'call': 'The board is five rows tall.', 'why': 'It matches the other games.'},
                   {'id': 'sound', 'call': 'A win plays no sound.', 'why': 'Nothing else in the app plays one.'}]}


def spec_with(tmp, mutate):
    p = words_spec(tmp)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


class RethinkTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def errs(self, mutate):
        return validate(spec_with(self.tmp, mutate))[0]

    def test_a_calls_list_is_accepted_and_reaches_the_page(self):
        s = spec_with(self.tmp, lambda r: r['steps'].append(dict(CALLS)))
        self.assertEqual(validate(s)[0], [])
        st = [x for x in deck_data(s, {})['steps'] if x['id'] == 'K-1'][0]
        self.assertEqual(st['kind'], 'calls')
        self.assertEqual([c['id'] for c in st['calls']], ['size', 'sound'])

    def test_a_call_needs_its_reason_and_a_unique_id(self):
        e = self.errs(lambda r: r['steps'].append({**CALLS, 'calls': [{'id': 'a', 'call': 'x'}]}))
        self.assertTrue(any('K-1: every call needs id, call' in x for x in e), e)
        e = self.errs(lambda r: r['steps'].append({**CALLS, 'calls': [CALLS['calls'][0], CALLS['calls'][0]]}))
        self.assertTrue(any('used twice' in x for x in e), e)

    def test_checked_rides_to_the_page_and_must_be_a_sentence(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'checked': 'Opened the games screen on 9 Nov and counted.'}))
        self.assertEqual(validate(s)[0], [])
        self.assertEqual(deck_data(s, {})['steps'][0]['checked'], 'Opened the games screen on 9 Nov and counted.')
        self.assertTrue(any('Q-1: checked is one plain sentence' in x for x in self.errs(lambda r: r['steps'][0].update({'checked': ' '}))))

    def test_a_wall_of_text_is_refused(self):
        long_part = ' '.join(['word'] * (PART_WORDS_MAX + 1))
        self.assertTrue(any(f'Q-1: today is {PART_WORDS_MAX + 1} words' in x for x in self.errs(lambda r: r['steps'][0].update({'today': long_part}))))
        long_pro = ' '.join(['word'] * (BULLET_WORDS_MAX + 1))
        self.assertTrue(any('Q-1/a: a pro is' in x for x in self.errs(lambda r: r['steps'][0]['options'][0].update({'pros': [long_pro]}))))

    def test_the_deck_says_when_it_was_built(self):
        built = deck_data(load_spec(words_spec(self.tmp)), {})['built']
        self.assertRegex(built['at'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')
        self.assertIn('commit', built)

    def test_summary_prints_changed_calls_and_marked_areas(self):
        s = spec_with(self.tmp, lambda r: r['steps'].append(dict(CALLS)))
        out = summary(s, {'answers': {
            'K-1': {'v': 'other', 'changes': {'sound': 'play the win chime'}},
            'Q-1': {'v': 'other', 'marks': [{'pic': 'the picture', 'x': 10, 'y': 20, 'w': 30, 'h': 5, 'text': 'too cramped'}]}}})
        self.assertIn('change sound — "play the win chime"', out)
        self.assertIn('area 1 on the picture (left 10%, top 20%, 30% wide, 5% tall) — "too cramped"', out)

    def test_page_source_keeps_the_two_fixes_destin_named(self):
        # He named two faults (2026-11-09): a green circle on an answered question, and two
        # text boxes on a typed answer. Both were one-line causes; these keep them from returning.
        js = open(os.path.join(DECK, 'page.js')).read()
        css = open(os.path.join(DECK, 'page.css')).read()
        self.assertIn('class="qtick"', js)
        self.assertNotRegex(js, r'<span class="tick"')            # `.tick` is the finish screen's 56px circle
        self.assertRegex(js, re.escape("st.answer === 'words' || st.kind === 'calls' ? ''"))   # no note box beside a typed answer


if __name__ == '__main__':
    unittest.main()
