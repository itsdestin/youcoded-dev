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
from deck.grows import earlier_rounds, previous_ids, round_number, settled_ids   # noqa: E402
from deck.serve import summary                                     # noqa: E402
from deck.spec import load_spec, validate                          # noqa: E402


def question(i, headline, **kw):
    return {'id': i, 'words': True, 'surface': 'Decks', 'path': 'Rows', 'headline': headline,
            'today': 'It is one way today.', 'problem': 'That is slow.', 'proposal': 'Do it the other way.',
            'options': [{'id': 'a', 'label': 'First', 'summary': 'The first way.', 'pros': ['Quick.'], 'cons': ['Plain.']},
                        {'id': 'b', 'label': 'Second', 'summary': 'The second way.', 'pros': ['Rich.'], 'cons': ['Slow.']}], **kw}


def base_spec(**over):
    # WHY both pages are Design (round 11): a deck is AT one stage; an open topic may not sit on an earlier stage's page.
    spec = {'title': 'Grow', 'key': 'grow', 'out': 'grow.html', 'themes': ['midnight'], 'grows': True, 'tag': 'feature', 'stage': 'design',
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

    # WHY (tidy): an old feature's earlier, separate decks live in an `earlier-rounds/` folder beside the growing deck. The build must
    # read earlier ROUNDS only from the dated `<stem>.answers.<stamp>.json` files right beside the spec, never from that folder
    # (nor from another deck's `<stem>.round3.answers.json`), or moving old decks would change the round number and the answered topics.
    def test_old_decks_in_an_earlier_rounds_folder_are_not_rounds(self):
        folder = os.path.join(self.tmp, 'earlier-rounds'); os.makedirs(folder)
        for name in ('grow.answers.20261101.json', 'grow.answers.json', 'grow.round2.answers.json'):
            with open(os.path.join(folder, name), 'w') as f:
                json.dump({'deck': 'grow', 'submitted': '2026-11-01T10:00:00Z', 'answers': {'Q-1': {'v': 'pick', 'pick': 'a'}}}, f)
        with open(os.path.join(self.tmp, 'grow.round2.answers.json'), 'w') as f:
            json.dump({'deck': 'grow', 'submitted': '2026-11-01T10:00:00Z', 'answers': {'Q-1': {'v': 'pick', 'pick': 'a'}}}, f)
        self.assertEqual(round_number(self.load()), 1)
        self.assertEqual(earlier_rounds(self.load()), [])
        self.assertEqual(settled_ids(self.load(), {}), set())

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

    def test_copies_of_one_build_are_one_round_when_the_later_one_is_a_resend(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'yes'}}, built='B1')
        answers(self.tmp, '2', {'Q-1': {'v': 'yes'}}, built='B1', submitted='2026-11-02T10:00:00Z')
        p = os.path.join(self.tmp, 'grow.answers.2.json'); d = json.load(open(p)); d['sent_before'] = '2026-11-01T10:00:00Z'; json.dump(d, open(p, 'w'))   # serve.py writes this on a same-build re-serve
        self.assertEqual(round_number(self.load()), 2)

    def test_two_files_with_one_build_stamp_are_two_rounds_when_nothing_says_resend(self):
        # WHY (round 12): his browser copied last round's build stamp into the new round's file, so a stamp alone cannot mean "the same round".
        answers(self.tmp, '1', {'Q-1': {'v': 'yes'}}, built='B1')
        answers(self.tmp, '2', {'Q-1': {'v': 'yes'}}, built='B1', submitted='2026-11-02T10:00:00Z')
        self.assertEqual(round_number(self.load()), 3)

    def test_stale_answers_in_a_round_file_are_dropped_from_that_round(self):
        answers(self.tmp, '1', {'Q-1': {'v': 'pick', 'pick': 'a'}, 'Q-2': {'v': 'pick', 'pick': 'a'}})
        answers(self.tmp, '2', {'Q-1': {'v': 'pick', 'pick': 'a'}, 'Q-2': {'v': 'pick', 'pick': 'b'}})   # Q-1 is last round's, copied by the browser
        spec = self.load(stale_answers={'2026-11-02T10:00:00Z': ['Q-1']})
        self.assertEqual(validate(spec)[0], [])
        steps = {s['id']: s for s in deck_data(spec, {})['steps']}
        self.assertEqual([e['round'] for e in steps['Q-1']['grow']['story']], ['Round 1'], 'said once')
        self.assertEqual([e['round'] for e in steps['Q-2']['grow']['story']], ['Round 1', 'Round 2'])
        self.has(validate(self.load(stale_answers={'x': 'Q-1'}))[0], 'stale_answers is')

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

    def test_a_growing_deck_names_its_kind_of_work(self):
        # Destin, 2026-11-18: the header reads "FEATURE: …", "BUG: …", "OPTIMIZATION: …" or a short custom word.
        st = base_spec(); del st['tag']
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'needs "tag"')
        for bad in ('', 'a: b', 'x' * 21, 3):
            st = base_spec(); st['tag'] = bad
            self.has(validate(load_spec(put(self.tmp, st)))[0], 'tag is one short word')
        st = base_spec(); st['tag'] = 'chore'
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])
        self.assertEqual(deck_data(load_spec(put(self.tmp, st)), {})['tag'], 'chore')

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
        after = {'title': 't', 'key': 'k2', 'out': 'k2.html', 'grows': True, 'tag': 'feature', 'steps': [
            {'id': 'P-1', 'page': 'After', 'intro': 'i', 'stage': 'after'},
            {**lst, 'calls': [{'id': 'r1', 'call': 'One.', 'why': 'Yes.', 'from': 'W-1/save'}]},
            # WHY: the after-build deck must carry this list (feature-flow step 5); ticked below so only W-1 is in question.
            {'id': 'W-7', 'words': True, 'surface': 'D', 'path': 'R', 'headline': 'What changed while building', 'list': 'changed-while-building',
             'calls': [{'id': 'b1', 'call': 'As drawn.', 'why': 'Nothing moved.', 'built': 'as planned'}]}]}
        put(self.tmp, after, 'x.walkthrough.after.json')
        json.dump({'submitted': '2026-11-01T10:00:00Z', 'answers': {}}, open(os.path.join(self.tmp, 'x.walkthrough.answers.json'), 'w'))
        json.dump({'submitted': '2026-11-03T10:00:00Z', 'built': {'at': 'NOW'}, 'answers': {'W-7': {'ok': {'b1': True}}}}, open(os.path.join(self.tmp, 'x.walkthrough.after.answers.json'), 'w'))
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
        for field, bad in (('call', 'Round 7 asked for this.'), ('call', 'See rounds 6-7.'), ('why', 'Same as Q-2.'), ('why', 'You said so in round 3.')):
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
        st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'more': {'change': 'Asked in round 7 (R-1).'}}], past='You asked in round 3.',
                                        trail=[{'round': 'Round 3', 'built': 'x'}], checked='Read round 4.')
        st['steps'][2]['headline'] = 'Round 4 said Q-9?'
        st['steps'][2]['answered'] = {'round': 'Round 1', 'answer': 'Yes'}
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    def test_a_page_intro_is_one_short_line(self):
        st = base_spec(); st['steps'][0]['intro'] = 'x' * 161
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'the page intro is 161 characters (max 160)')
        st['steps'][0]['intro'] = 'x' * 160
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    # ── round 13 (Destin, round 12): a row's More is labelled like a question; a change he would see needs a picture ──
    def test_more_on_an_open_row_he_can_change_is_labelled_like_a_question(self):
        for bad in ('A bare line.', {'does': 'It does a thing.', 'why': 'Because.'}, {'pros': ['Quick.']}):
            st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'more': bad}])
            self.has(validate(load_spec(put(self.tmp, st)))[0], 'more on a row he can change is labelled like a question')
        st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.',
                                                                   'more': {'today': 'One way.', 'problem': 'Slow.', 'change': 'Quicker.', 'pros': ['Fast.'], 'cons': ['New.']}}])
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])
        st['steps'][1]['calls'][0]['more'] = {'change': 'Quicker.', 'pros': 'not a list'}
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'more.pros is a short list')

    def test_an_old_style_more_still_passes_where_the_row_is_not_open_to_change(self):
        st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'more': 'Old wording.'}], answered={'round': 'Round 2', 'answer': 'Yes'})
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])
        st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'result': 'pass', 'more': {'does': 'A thing.'}}])
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])   # a results list is not his to change

    def test_an_open_visual_row_or_question_must_carry_a_picture(self):
        open(os.path.join(self.tmp, 'p.png'), 'wb').write(b'\x89PNG')
        more = {'change': 'Different.'}
        st = base_spec(); st['steps'][1] = self.rows_step(calls=[{'id': 'r1', 'call': 'Fine.', 'why': 'Fine.', 'more': more, 'visual': True}])
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'L-1/r1: this row is flagged visual but has no picture')
        st['steps'][1]['calls'][0]['picture'] = 'p.png'
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])
        st = base_spec(); st['steps'][1]['visual'] = True
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'is flagged visual but has no picture')
        st['steps'][1]['picture'] = 'p.png'
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])
        st['steps'][1]['visual'] = 'yes'
        self.has(validate(load_spec(put(self.tmp, st)))[0], 'visual is true or false')

    def test_an_answered_visual_row_needs_no_picture(self):
        st = base_spec(); st['steps'][1]['visual'] = True; st['steps'][1]['answered'] = {'round': 'Round 2', 'answer': 'Yes'}
        self.assertEqual(validate(load_spec(put(self.tmp, st)))[0], [])

    # ── round 15: a pick between PICTURES (options that each carry a picture) works in a growing deck, open and answered ──
    def pictured(self, **kw):
        open(os.path.join(self.tmp, 'a.png'), 'wb').write(b'\x89PNG'); open(os.path.join(self.tmp, 'b.png'), 'wb').write(b'\x89PNG')
        st = question('Q-1', 'Which look?', visual=True, **kw)
        st['options'][0].update(picture='a.png', caption='The first look.'); st['options'][1].update(picture='b.png', caption='The second look.')
        return st

    def test_a_pick_between_pictures_builds_in_a_growing_deck(self):
        # WHY (Destin, round 15 page): options with a picture each are the "pick between pictures" question; "visual" is satisfied by them.
        spec = base_spec(); spec['steps'][1] = self.pictured()
        self.assertEqual(validate(load_spec(put(self.tmp, spec)))[0], [])
        d = deck_data(load_spec(put(self.tmp, spec)), {})
        step = [s for s in d['steps'] if s['id'] == 'Q-1'][0]
        self.assertEqual([o['picture'] for o in step['options']], ['a.png', 'b.png'])
        spec['steps'][1]['options'][1]['picture'] = 'missing.png'
        self.has(validate(load_spec(put(self.tmp, spec)))[0], 'Q-1/b: picture missing.png does not exist')

    def test_an_answered_pick_between_pictures_keeps_his_pick_and_marks(self):
        given = {'v': 'pick', 'pick': 'b', 'marks': [{'pic': 'option a', 'x': 10, 'y': 10, 'w': 30, 'h': 30, 'text': 'too busy'}]}
        spec = base_spec(); spec['steps'][1] = self.pictured(answered=[{'round': 'Round 1', 'given': given}])
        self.assertEqual(validate(load_spec(put(self.tmp, spec)))[0], [])
        d = deck_data(load_spec(put(self.tmp, spec)), {})
        step = [s for s in d['steps'] if s['id'] == 'Q-1'][0]
        self.assertEqual(step['grow']['given']['pick'], 'b'); self.assertEqual(step['grow']['given']['marks'][0]['pic'], 'option a')
        self.assertTrue(step['options'][0]['picture'])


class NewTags(unittest.TestCase):
    """A topic is "new" when it is open and was not in the deck as he last saw it; a page is new when all its open topics are
    new and nothing on it was answered. (Destin, round 15, "New tags".)"""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def build(self, spec, built, **given):
        put(self.tmp, spec)
        answers(self.tmp, '1', given or {'Q-1': {'v': 'pick', 'pick': 'a'}}, built=None, live=True)
        path = os.path.join(self.tmp, 'grow.answers.json')
        with open(path) as f:
            saved = json.load(f)
        saved['built'] = built
        with open(path, 'w') as f:
            json.dump(saved, f)
        return deck_data(load_spec(os.path.join(self.tmp, 'grow.json')), {})

    def spec(self):
        s = base_spec()
        s['steps'] = [{'id': 'P-1', 'page': 'Old page', 'intro': 'Judge.', 'stage': 'design'}, question('Q-1', 'First question?'), question('Q-2', 'Second question?'),
                      {'id': 'P-2', 'page': 'Brand new page', 'intro': 'Pick.', 'stage': 'design'}, question('Q-3', 'Third question?'), question('Q-4', 'Fourth question?')]
        return s

    def test_new_topics_are_tagged_and_a_wholly_new_page_is_new(self):
        d = self.build(self.spec(), {'at': 'a', 'ids': ['Q-1', 'Q-2']})
        flags = {s['id']: bool((s.get('grow') or {}).get('new')) for s in d['steps']}
        self.assertEqual(flags, {'Q-1': False, 'Q-2': False, 'Q-3': True, 'Q-4': True})
        self.assertEqual([bool(p.get('new')) for p in d['pages']], [False, True])

    def test_a_page_with_an_answered_topic_is_not_new_but_its_new_card_is_tagged(self):
        s = self.spec(); s['steps'].insert(3, question('Q-5', 'Fifth question?'))   # joins the old page
        d = self.build(s, {'at': 'a', 'ids': ['Q-1', 'Q-2']})
        flags = {x['id']: bool((x.get('grow') or {}).get('new')) for x in d['steps']}
        self.assertTrue(flags['Q-5'] and not flags['Q-1'])
        self.assertFalse(d['pages'][0].get('new'), 'the old page has an answered topic and open old ones')

    def test_a_page_whose_only_topics_are_new_but_carries_an_answered_one_is_not_new(self):
        s = self.spec(); s['steps'][5:5] = []   # keep
        s['steps'] = [{'id': 'P-1', 'page': 'Mixed', 'intro': 'x', 'stage': 'design'}, question('Q-1', 'Old answered?'), question('Q-9', 'Brand new?')]
        d = self.build(s, {'at': 'a', 'ids': ['Q-1']})
        self.assertFalse(d['pages'][0].get('new'))
        self.assertTrue(next(x for x in d['steps'] if x['id'] == 'Q-9')['grow']['new'])

    def test_a_reopened_topic_is_not_new(self):
        s = self.spec(); s['steps'][2] = question('Q-2', 'Second question?', reopened='You asked for more.')
        d = self.build(s, {'at': 'a', 'ids': ['Q-1', 'Q-2']})
        self.assertFalse((next(x for x in d['steps'] if x['id'] == 'Q-2').get('grow') or {}).get('new'))

    def test_a_reopened_topic_missing_from_the_last_build_is_still_not_new(self):
        s = self.spec(); s['steps'][2] = question('Q-2', 'Second question?', reopened='You asked for more.')
        d = self.build(s, {'at': 'a', 'ids': ['Q-1']})
        self.assertFalse((next(x for x in d['steps'] if x['id'] == 'Q-2').get('grow') or {}).get('new'))

    def test_nothing_is_new_before_any_round_or_when_the_last_build_is_unknown(self):
        put(self.tmp, self.spec())
        d = deck_data(load_spec(os.path.join(self.tmp, 'grow.json')), {})
        self.assertFalse(any((x.get('grow') or {}).get('new') for x in d['steps']))
        d = self.build(self.spec(), {'at': 'a'})   # an old answers file: no ids, no commit
        self.assertFalse(any((x.get('grow') or {}).get('new') for x in d['steps']))

    def test_an_old_answers_file_reads_the_ids_from_its_commit(self):
        import subprocess
        g = lambda *a: subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *a], cwd=self.tmp, check=True, capture_output=True)
        old = self.spec(); old['steps'] = [x for x in old['steps'] if x.get('id') not in ('Q-3', 'Q-4')]
        put(self.tmp, old); g('init', '-q'); g('add', 'grow.json'); g('commit', '-qm', 'round 1')
        commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=self.tmp, capture_output=True, text=True).stdout.strip()
        d = self.build(self.spec(), {'at': 'a', 'commit': commit})
        self.assertEqual({x['id'] for x in d['steps'] if (x.get('grow') or {}).get('new')}, {'Q-3', 'Q-4'})
        self.assertEqual(previous_ids(load_spec(os.path.join(self.tmp, 'grow.json'))), {'Q-1', 'Q-2'})

    def test_the_build_stamp_records_the_topic_ids(self):
        d = deck_data(load_spec(put(self.tmp, self.spec())), {})
        self.assertEqual(d['built']['ids'], ['Q-1', 'Q-2', 'Q-3', 'Q-4'])


class AfterStageLists(unittest.TestCase):
    """A growing deck AT stage "after" is held to the two lists too (feature-flow step 5)."""
    def errs(self, extra):
        spec = {'title': 'Grow', 'key': 'grow', 'out': 'grow.html', 'themes': ['midnight'], 'grows': True, 'tag': 'feature', 'stage': 'after',
                'steps': [{'id': 'P-1', 'page': 'After', 'intro': 'Go through it.', 'stage': 'after'}] + extra}
        tmp = tempfile.mkdtemp()
        return validate(load_spec(put(tmp, spec)))[0]

    def test_refused_without_the_lists_and_accepted_with_them(self):
        built = {'id': 'A-1', 'words': True, 'surface': 'S', 'path': 'P', 'headline': 'What changed while building',
                 'list': 'changed-while-building', 'calls': [{'id': 'b1', 'call': 'Built it.', 'why': 'As drawn.', 'built': 'as planned'}]}
        self.assertTrue(any('What changed while building' in e for e in self.errs([])))
        self.assertEqual(self.errs([built]), [])

    def test_a_deck_at_an_earlier_stage_is_not_held_to_it(self):
        self.assertEqual(validate(load_spec(put(tempfile.mkdtemp(), base_spec())))[0], [])


if __name__ == '__main__':
    unittest.main()


class RowMarkTests(unittest.TestCase):
    """Round 14 (Destin, round 13): a comment left on a row's picture is that row's comment, like a pencil comment."""
    LIST = {'id': 'W-1', 'words': True, 'surface': 'S', 'path': 'P', 'headline': 'H',
            'calls': [{'id': 'a', 'call': 'Row A.', 'why': 'w'}, {'id': 'b', 'call': 'Row B.', 'why': 'w'}]}

    def test_a_mark_on_a_rows_picture_changes_that_row(self):
        from deck.spec import row_states, row_of_pic
        a = {'v': 'other', 'ok': {'b': True}, 'marks': [{'pic': 'row a', 'text': 'too quiet'}]}
        self.assertEqual(row_states(self.LIST, a), {'a': 'changed', 'b': 'ok'})
        self.assertEqual(row_states(self.LIST, {'ok': {}, 'marks': [{'pic': 'row a before', 'text': ''}]})['a'], 'changed')
        self.assertEqual(row_states(self.LIST, {'ok': {}, 'marks': [{'pic': 'row zzz'}]}), {'a': 'unlooked', 'b': 'unlooked'})
        self.assertIsNone(row_of_pic({**self.LIST, 'context': True}, 'row a'))   # a background list has no rows to answer

    def test_the_summary_reads_it_as_a_comment_on_the_row(self):
        from deck.grows import answer_view
        _, notes = answer_view(self.LIST, {'v': 'other', 'marks': [{'pic': 'row a', 'text': 'too quiet'}]})
        self.assertEqual(notes, ['Row A. — too quiet'])
