"""A deck that grows (round 10): one spec per feature, re-built each round, earlier rounds read from the
dated answers files serve.py keeps. Source: Destin, rounds 1, 8 and 10 (deck/grows.py has the quotes)."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.build import deck_data                                   # noqa: E402
from deck.gate import check_gate                                   # noqa: E402
from deck.grows import earlier_rounds, round_number, settled_ids   # noqa: E402
from deck.serve import summary                                     # noqa: E402
from deck.spec import load_spec, validate                          # noqa: E402


def question(i, headline, **kw):
    return {'id': i, 'words': True, 'surface': 'Decks', 'path': 'Rows', 'headline': headline,
            'today': 'It is one way today.', 'problem': 'That is slow.', 'proposal': 'Do it the other way.',
            'options': [{'id': 'a', 'label': 'First', 'summary': 'The first way.', 'pros': ['Quick.'], 'cons': ['Plain.']},
                        {'id': 'b', 'label': 'Second', 'summary': 'The second way.', 'pros': ['Rich.'], 'cons': ['Slow.']}], **kw}


def base_spec(**over):
    spec = {'title': 'Grow', 'key': 'grow', 'out': 'grow.html', 'themes': ['midnight'], 'grows': True,
            'steps': [{'id': 'P-1', 'page': 'Understanding', 'intro': 'Judge.', 'stage': 'understanding'},
                      question('Q-1', 'First question?'), question('Q-2', 'Second question?'),
                      {'id': 'P-2', 'page': 'Design', 'intro': 'Pick.', 'stage': 'design'},
                      question('Q-3', 'Third question?')]}
    spec.update(over)
    return spec


def put(tmp, spec, name='grow.json'):
    p = os.path.join(tmp, name)
    with open(p, 'w') as f:
        json.dump(spec, f)
    return p


def answers(tmp, stamp, answers, built=None, live=False, submitted=None):
    name = 'grow.answers.json' if live else f'grow.answers.{stamp}.json'
    with open(os.path.join(tmp, name), 'w') as f:
        json.dump({'deck': 'grow', 'submitted': submitted or f'2026-11-0{stamp[-1]}T10:00:00Z', 'built': {'at': built or f'2026-11-0{stamp[-1]}T09:00:00Z'},
                   'answers': answers}, f)


class Grows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def load(self, **over):
        return load_spec(put(self.tmp, base_spec(**over)))

    def errors(self, **over):
        return validate(self.load(**over))[0]

    def has(self, errs, text):
        self.assertTrue(any(text in e for e in errs), errs)

    # rounds
    def test_round_number_with_and_without_rounds_before(self):
        self.assertEqual(round_number(self.load()), 1)
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'a'}})
        answers(self.tmp, '2', {'Q-1': {'v': 'pick', 'pick': 'a'}})
        self.assertEqual(round_number(self.load()), 3)
        self.assertEqual(round_number(self.load(rounds_before=4)), 7)
        self.assertEqual([r['label'] for r in earlier_rounds(self.load(rounds_before=4))], ['Round 5', 'Round 6'])

    def test_a_submitted_file_not_yet_moved_aside_is_the_newest_earlier_round(self):
        answers(self.tmp, '1', {}, live=True)
        self.assertEqual(round_number(self.load()), 2)

    def test_copies_of_one_build_are_one_round(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'yes'}}, built='B1')
        answers(self.tmp, '2', {'Q-1': {'v': 'yes'}}, built='B1', submitted='2026-11-02T10:00:00Z')
        self.assertEqual(round_number(self.load()), 2)

    # answered
    def test_a_plain_earlier_answer_is_answered_and_shows_his_choice(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'b'}, 'Q-2': {'v': 'skip'}})
        spec = self.load()
        self.assertEqual(validate(spec)[0], [])
        steps = {s['id']: s for s in deck_data(spec, {})['steps']}
        self.assertEqual(steps['Q-1']['grow']['answered'], True)
        self.assertEqual((steps['Q-1']['grow']['round'], steps['Q-1']['grow']['answer']), ('Round 1', 'Second'))
        self.assertEqual(steps['Q-2']['grow']['answered'], False)
        self.assertEqual(deck_data(spec, {})['grows']['round'], 2)
        self.assertEqual([p['stage'] for p in deck_data(spec, {})['pages']], ['understanding', 'design'])

    def test_a_hand_written_answered_needs_no_earlier_file(self):
        st = base_spec()
        st['steps'][1]['answered'] = {'round': 'Round 4', 'answer': 'Yes', 'notes': ['his words']}
        spec = load_spec(put(self.tmp, st))
        self.assertEqual(validate(spec)[0], [])
        g = [s for s in deck_data(spec, {})['steps'] if s['id'] == 'Q-1'][0]['grow']
        self.assertEqual((g['answered'], g['round'], g['answer'], g['notes']), (True, 'Round 4', 'Yes', ['his words']))

    def test_reopened_step_is_open_and_carries_his_earlier_answers(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'a', 'note': 'make it bigger'}})
        st = base_spec(); st['steps'][1]['reopened'] = 'You asked for it bigger.'
        st['steps'][1]['trail'] = [{'round': 'Round 1', 'built': 'A small one.'}]
        spec = load_spec(put(self.tmp, st))
        self.assertEqual(validate(spec)[0], [])
        g = [s for s in deck_data(spec, {})['steps'] if s['id'] == 'Q-1'][0]['grow']
        self.assertFalse(g['answered'])
        self.assertEqual(g['line'], 'You asked for it bigger.')
        self.assertEqual((g['story'][0]['round'], g['story'][0]['notes']), ('Round 1', ['make it bigger']))

    # refusals
    def test_a_changed_answer_with_no_account_is_refused_and_quotes_him(self):
        answers(self.tmp, '3', {'Q-1': {'v': 'pick', 'pick': 'a', 'note': 'make it bigger'}})
        errs = self.errors()
        self.has(errs, 'Q-1: his round 1 answer on "First question?" asked for a change')
        self.has(errs, 'make it bigger'); self.has(errs, 'reopened'); self.has(errs, 'resolved')

    def test_resolved_keeps_it_answered_and_reopened_opens_it(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'other', 'note': 'no'}})
        st = base_spec(); st['steps'][1]['resolved'] = 'Made bigger in round 2.'
        spec = load_spec(put(self.tmp, st))
        self.assertEqual(validate(spec)[0], [])
        g = [s for s in deck_data(spec, {})['steps'] if s['id'] == 'Q-1'][0]['grow']
        self.assertTrue(g['answered']); self.assertEqual(g['resolved'], 'Made bigger in round 2.')

    def test_a_vanished_id_is_refused_unless_retired(self):
        answers(self.tmp, '1', {'Q-9': {'v': 'yes'}})
        self.has(self.errors(), 'Q-9: he answered this in round 1 but it is no longer in the deck')
        self.assertEqual(self.errors(retired={'Q-9': 'Folded into Q-1.'}), [])

    def test_a_trail_without_its_line_is_refused(self):
        st = base_spec(); st['steps'][1]['trail'] = [{'round': 'Round 1', 'built': 'x'}]
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'add "reopened" (or "past")')
        st['steps'][1]['past'] = 'It was built once.'
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    # field validation
    def test_field_errors_are_plain(self):
        def with_step(**kw):
            st = base_spec(); st['steps'][1].update(kw); return validate(load_spec(put(self.tmp, st)))[0]
        self.has(with_step(answered={'round': 'R'}), 'round and answer are required text')
        self.has(with_step(answered={'round': 'R', 'answer': 'Y'}, reopened='x'), 'answered or reopened, not both')
        self.has(with_step(reopened=' '.join(['w'] * 31)), 'reopened is 31 words (max 30)')
        self.has(with_step(resolved=' '.join(['w'] * 41)), 'resolved is 41 words (max 40)')
        self.has(with_step(reopened='a', resolved='b'), 'keep one')
        self.has(with_step(state='new'), 'sink to the bottom by themselves')

    def test_the_new_fields_mean_nothing_without_grows(self):
        st = base_spec(); del st['grows']; st['steps'][1]['reopened'] = 'x'; st['rounds_before'] = 1
        errs = validate(load_spec(put(self.tmp, st)))[0]
        self.has(errs, 'reopened belongs on a deck that grows'); self.has(errs, 'rounds_before belongs')

    def test_every_page_names_its_stage_in_order(self):
        st = base_spec(); del st['steps'][0]['stage']
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'names its stage')
        st = base_spec(); st['steps'][3]['stage'] = 'understanding'; st['steps'][0]['stage'] = 'before'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'stages go in order')
        st = base_spec(); st['steps'][0]['stage'] = 'later'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'stage is one of')

    # summaries and the gate
    def test_summary_leaves_out_answered_topics_unless_reopened(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'a'}})
        spec = self.load()
        state = {'answers': {'Q-2': {'v': 'yes'}}, 'built': {'at': 'NEW'}}
        text = summary(spec, state)
        self.assertNotIn('Q-1 ', text); self.assertIn('Q-2 yes', text)
        self.assertEqual(settled_ids(spec, state), {'Q-1'})
        state['reopened'] = {'Q-1': True}; state['answers']['Q-1'] = {'v': 'pick', 'pick': 'b'}
        self.assertIn('Q-1 pick b', summary(spec, state))

    def test_summary_does_not_treat_its_own_round_as_earlier(self):
        # The answers file being summed is the live one (just submitted) - it must not settle everything in it.
        answers(self.tmp, '2', {'Q-1': {'v': 'pick', 'pick': 'a'}}, built='THIS', live=True)
        spec = self.load()
        state = {'answers': {'Q-1': {'v': 'pick', 'pick': 'a'}}, 'built': {'at': 'THIS'}}
        self.assertIn('Q-1 pick a', summary(spec, state))

    def test_non_growing_deck_data_has_none_of_it(self):
        st = base_spec(); del st['grows']
        for s in st['steps']:
            s.pop('stage', None)
        data = deck_data(load_spec(put(self.tmp, st)), {})
        self.assertNotIn('grows', data)
        self.assertTrue(all('grow' not in s for s in data['steps']))
        self.assertTrue(all('stage' not in p for p in data['pages']))

    def test_gate_does_not_call_a_list_settled_earlier_unlooked(self):
        lst = {'id': 'W-1', 'words': True, 'surface': 'D', 'path': 'R', 'headline': 'Rows',
               'calls': [{'id': 'r1', 'call': 'One.', 'why': 'Yes.'}]}
        before = {'title': 't', 'key': 'k', 'out': 'k.html', 'steps': [{'id': 'W-1', 'calls': [{'id': 'save', 'call': 'A.', 'why': 'b', 'decided': 'x'}]}]}
        put(self.tmp, before, 'x.walkthrough.json')
        after = {'title': 't', 'key': 'k2', 'out': 'k2.html', 'grows': True, 'steps': [
            {'id': 'P-1', 'page': 'After', 'intro': 'i', 'stage': 'after'},
            {**lst, 'calls': [{'id': 'r1', 'call': 'One.', 'why': 'Yes.', 'from': 'W-1/save'}]}]}
        put(self.tmp, after, 'x.walkthrough.after.json')
        json.dump({'submitted': '2026-11-01T10:00:00Z', 'answers': {}}, open(os.path.join(self.tmp, 'x.walkthrough.answers.json'), 'w'))
        json.dump({'submitted': '2026-11-03T10:00:00Z', 'built': {'at': 'NOW'}, 'answers': {}}, open(os.path.join(self.tmp, 'x.walkthrough.after.answers.json'), 'w'))
        problems = check_gate(os.path.join(self.tmp, 'x.walkthrough.json'))[0]
        self.assertTrue(any('not looked at' in p for p in problems), problems)
        # settled in an earlier round of the after deck: no longer a problem
        json.dump({'submitted': '2026-11-02T10:00:00Z', 'built': {'at': 'OLD'}, 'answers': {'W-1': {'v': 'yes', 'ok': {'r1': True}}}},
                  open(os.path.join(self.tmp, 'x.walkthrough.after.answers.20261102.json'), 'w'))
        self.assertEqual(check_gate(os.path.join(self.tmp, 'x.walkthrough.json'))[0], [])


if __name__ == '__main__':
    unittest.main()
