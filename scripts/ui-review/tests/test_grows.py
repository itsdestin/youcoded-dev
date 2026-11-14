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
    # WHY both pages are Design (round 11): a deck is AT one stage; an open topic may not sit on an earlier stage's page.
    spec = {'title': 'Grow', 'key': 'grow', 'out': 'grow.html', 'themes': ['midnight'], 'grows': True, 'stage': 'design',
            'steps': [{'id': 'P-1', 'page': 'Understanding', 'intro': 'Judge.', 'stage': 'design'},
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
        self.assertEqual([p['stage'] for p in deck_data(spec, {})['pages']], ['design', 'design'])

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

    # round 11: a deck is AT one stage
    def test_the_deck_names_the_stage_it_is_at(self):
        st = base_spec(); del st['stage']
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'stage is required on a deck that grows')
        st = base_spec(); st['stage'] = 'later'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'stage is required on a deck that grows')

    def test_a_deck_with_no_page_at_its_stage_is_refused(self):
        st = base_spec(); st['stage'] = 'before'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'no page of the Before build stage')

    def test_a_page_later_than_the_deck_is_refused(self):
        st = base_spec(); st['steps'][3]['stage'] = 'before'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'later than the deck (Design)')

    def test_an_open_topic_on_an_earlier_stage_is_refused(self):
        st = base_spec(); st['steps'][0]['stage'] = 'understanding'
        errs = validate(load_spec(put(self.tmp, st)))[0]
        self.has(errs, 'Q-1: "First question?" is still open but sits on the Understanding page')
        self.has(errs, 'answer it first, or move it to a Design page')
        # answered by hand, it is a record and the build accepts it
        st['steps'][1]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    def test_a_topic_answered_in_an_earlier_round_is_a_record_too(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'a'}, 'Q-2': {'v': 'pick', 'pick': 'a'}})
        st = base_spec(); st['steps'][0]['stage'] = 'understanding'
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    def test_reopened_topics_live_in_the_current_stage_only(self):
        st = base_spec(); st['steps'][0]['stage'] = 'understanding'
        st['steps'][1]['reopened'] = 'Asked again.'; st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'reopened topics live on a Design page')

    def test_the_page_data_marks_the_record(self):
        st = base_spec(); st['steps'][0]['stage'] = 'understanding'
        st['steps'][1]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}; st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        d = deck_data(load_spec(put(self.tmp, st)), {})
        self.assertEqual([bool(p.get('record')) for p in d['pages']], [True, False])
        self.assertEqual(d['grows']['stage'], 'design')

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

    # round 12 (Destin's round-11 answers): a topic answered in several rounds keeps every round; what he is asked must stand on its own
    def rows_step(self, **kw):
        return {'id': 'L-1', 'words': True, 'surface': 'D', 'path': 'R', 'headline': 'Rows', **kw,
                'calls': kw.get('calls') or [{'id': 'r1', 'call': 'One row.', 'why': 'Because it helps.'}, {'id': 'r2', 'call': 'Two row.', 'why': 'Because.'}]}

    def test_an_answer_in_several_rounds_keeps_each_round_oldest_first_with_his_saved_answer(self):
        st = base_spec()
        st['steps'][1]['answered'] = [{'round': 'Round 2', 'answer': 'Something else', 'notes': ['first thoughts']},
                                      {'round': 'Round 5', 'given': {'v': 'pick', 'pick': 'b', 'note': 'a long note ' * 30, 't': 1, 'seconds': 9}}]
        st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        spec = load_spec(put(self.tmp, st))
        self.assertEqual(validate(spec)[0], [])
        g = [s for s in deck_data(spec, {})['steps'] if s['id'] == 'Q-1'][0]['grow']
        self.assertEqual([e['round'] for e in g['story']], ['Round 2', 'Round 5'])
        self.assertEqual((g['round'], g['answer']), ('Round 5', 'Second'))
        self.assertEqual(g['story'][1]['notes'], ['a long note ' * 30 and ('a long note ' * 30).strip()])   # in full, never cut
        self.assertEqual(g['given'], {'v': 'pick', 'pick': 'b', 'note': 'a long note ' * 30})              # exactly as saved, minus the timing

    def test_a_tick_or_change_list_answered_by_hand_says_how_many_rows_were_ticked(self):
        st = base_spec(); st['steps'][1] = self.rows_step(answered=[{'round': 'Round 3', 'given': {'v': 'other', 'ok': {'r1': True}, 'changes': {'r2': 'no'}}}])
        spec = load_spec(put(self.tmp, st))
        self.assertEqual(validate(spec)[0], [])
        g = [s for s in deck_data(spec, {})['steps'] if s['id'] == 'L-1'][0]['grow']
        self.assertEqual((g['ticked'], g['rows']), (1, 2))
        self.assertEqual(g['story'][0]['ticked'], 1)

    def test_an_answered_list_needs_a_round_and_an_answer(self):
        st = base_spec(); st['steps'][1]['answered'] = [{'round': 'Round 1'}]
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'round and answer are required text')
        st['steps'][1]['answered'] = []
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'at least one round')

    def test_a_later_answers_file_round_is_added_after_the_hand_written_ones(self):
        answers(self.tmp, '3', {'Q-1': {'v': 'pick', 'pick': 'a'}})
        st = base_spec(); st['steps'][1]['answered'] = [{'round': 'Round 1', 'answer': 'Yes'}]
        g = [s for s in deck_data(load_spec(put(self.tmp, st)), {})['steps'] if s['id'] == 'Q-1'][0]['grow']
        self.assertEqual([e['round'] for e in g['story']], ['Round 1', 'Round 1'])   # (hand round 1, then the file's first round: the author numbers them)

    def test_an_open_row_may_not_point_at_a_round_or_a_step_number(self):
        for field, bad in (('call', 'Round 7 asked for this.'), ('call', 'See rounds 6-7.'), ('why', 'Same as R-1.'), ('why', 'You said so in round 3.')):
            st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', field: bad}])
            errs = validate(load_spec(put(self.tmp, st)))[0]
            self.has(errs, 'say it in plain words here and put where it came from in "more"')
            self.has(errs, 'L-1/r1')

    def test_the_title_and_the_page_intro_may_not_cite_either(self):
        st = base_spec(); st['steps'][1]['headline'] = 'The Q-3 idea again?'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'the title says "Q-3"')
        st = base_spec(); st['steps'][0]['intro'] = 'What you said in round 4.'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'the page intro says "round 4"')

    def test_background_lines_and_answered_topics_may_cite_rounds(self):
        st = base_spec()
        st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'more': 'Asked in round 7 (R-1).'}], past='You asked in round 3.',
                                        trail=[{'round': 'Round 3', 'built': 'x'}], checked='Read round 4.')
        st['steps'][2]['headline'] = 'Round 4 said Q-9?'
        st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    def test_a_page_intro_is_one_short_line(self):
        st = base_spec(); st['steps'][0]['intro'] = 'x' * 161
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'the page intro is 161 characters (max 160)')
        st['steps'][0]['intro'] = 'x' * 160
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])


if __name__ == '__main__':
    unittest.main()
