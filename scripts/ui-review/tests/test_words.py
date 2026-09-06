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
from fixture import shapes_spec, words_spec                      # noqa: E402
from deck.build import build_page, deck_data                     # noqa: E402
from deck.crops import crop_images                               # noqa: E402
from deck.spec import SpecError, is_page, is_words, load_spec, no_pictures, pages, validate   # noqa: E402


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
        s = spec_with(self.tmp, lambda r: r['steps'][3].pop('notice'))
        self.assertTrue(any('Q-3: missing notice' in e for e in errs(s)))

    def test_words_step_obeys_the_writing_rules(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'summary': 'Uses a new reducer'}))
        self.assertTrue(any('banned word "reducer"' in e for e in errs(s)))

    def test_words_step_yes_no_labels_obey_the_writing_rules(self):
        # The yes/no labels are button copy Destin reads — the same banned-word rule
        # that already covers headline/options/etc must reach them too.
        s = spec_with(self.tmp, lambda r: r['steps'][3].update({'yes': 'Uses the reducer'}))
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

    # ── the question step: today / the problem / the proposal, and options that carry
    # their own pros and cons (design §3.2). The refusals exist because sessions kept
    # cramming all of that into one summary paragraph, which Destin then had to unpick.
    def test_question_needs_today_problem_proposal(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].pop('today'))
        self.assertIn('Q-1: missing today (a question says what exists, what goes wrong, '
                      'and what would change — today / problem / proposal)', errs(s))

    def test_recommended_in_a_label_is_refused(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update(
            {'label': 'In the friends list (recommended)'}))
        self.assertIn('Q-1/a: "(recommended)" in a label — set "recommended": true on the option instead', errs(s))

    def test_inline_labels_are_refused(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update(
            {'summary': 'Today: nothing. Pro: fast.'}))
        e = errs(s)
        self.assertIn('Q-1/a: summary contains "Today:" — put it in the step\'s today field', e)
        self.assertIn('Q-1/a: summary contains "Pro:" — put it in pros', e)

    def test_one_recommended_at_most(self):
        def two(r):
            r['steps'][1]['options'][0]['recommended'] = True
            r['steps'][1]['options'][1]['recommended'] = True
        s = spec_with(self.tmp, two)
        self.assertIn('Q-2: two options are recommended — at most one', errs(s))

    def test_option_needs_pros_cons_or_summary(self):
        s = spec_with(self.tmp, lambda r: r['steps'][1]['options'].__setitem__(1, {'id': 'b', 'label': 'Two'}))
        self.assertIn('Q-2/b: an option needs pros, cons or a summary', errs(s))

    def test_whitespace_only_summary_counts_as_missing(self):
        # A summary of only spaces reads as blank on the page — it must not satisfy the
        # "needs pros, cons or a summary" rule any more than an actually-empty one does.
        s = spec_with(self.tmp, lambda r: r['steps'][1]['options'].__setitem__(
            1, {'id': 'b', 'label': 'Two', 'summary': '   '}))
        self.assertIn('Q-2/b: an option needs pros, cons or a summary', errs(s))

    def test_pros_must_be_a_list_not_a_string(self):
        # A bare string used to iterate by CHARACTER in the banned-word scan below it.
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'pros': 'fast and simple'}))
        self.assertIn('Q-1/a: pros must be a list of short lines', errs(s))

    def test_cons_rejects_a_blank_line(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'cons': ['a real line', '']}))
        self.assertIn('Q-1/a: cons must be a list of short lines', errs(s))

    def test_recommended_must_be_a_boolean(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'recommended': 'no'}))
        self.assertIn('Q-1/a: recommended must be true or false', errs(s))

    def test_recommended_label_refused_on_a_picture_decide_too(self):
        # This refusal used to live only inside _validate_question, which a picture decide
        # step's _validate_decide never calls into — moved into the shared _validate_options
        # (2026-09-05) so a picture decide is held to the same "any option label" rule.
        from deck.spec import _validate_options
        st = {'options': [{'id': 'a', 'label': 'Denser layout (recommended)', 'summary': 'x'}]}
        errors, warnings = [], []
        _validate_options(st, 'D-1', errors, warnings, minimum=1)
        self.assertIn('D-1/a: "(recommended)" in a label — set "recommended": true on the option instead', errors)

    def test_statement_is_exempt(self):
        # Q-3 is a statement to approve, not a question: no today, and no complaint about it.
        s = load_spec(words_spec(self.tmp))
        self.assertNotIn('today', s['steps'][3])
        self.assertEqual([e for e in errs(s) if e.startswith('Q-3')], [])

    def test_deck_data_carries_the_parts(self):
        s = load_spec(words_spec(self.tmp))
        d = deck_data(s, {})
        q1, q4 = d['steps'][0], d['steps'][3]
        self.assertEqual(q1['today'], 'Your friends are a list you open from the games screen.')
        self.assertTrue(q1['problem'] and q1['proposal'])
        self.assertEqual(q1['options'][0]['pros'], ['One place for everything about a friend.',
                                                    'Nothing new to find — the list is already open.'])
        self.assertEqual(q1['options'][0]['cons'], ['The row gets a little busier.'])
        self.assertIs(q1['options'][0]['recommended'], True)
        # A question with no options is answered Yes / No / Don't know, so it gets its own kind.
        self.assertEqual(q4['kind'], 'question')
        self.assertTrue(q4['today'] and q4['problem'] and q4['proposal'])

    def test_legacy_answer_without_v_is_unanswered(self):
        # An answers file written by the RETIRED plain questions page stored the option's
        # label prose under "pick" and carried no "v" at all. The deck's contract is
        # {"v": "pick", "pick": "<option id>"}, so such an entry has no answer — and the
        # summary must SAY so rather than coerce it, because a session converting a deck to
        # the new spec has to convert its answers file too (the mascot deck, 2026-09-05).
        from deck.serve import summary
        s = load_spec(words_spec(self.tmp))
        state = {'submitted': '2026-09-04T10:00:00Z', 'answers': {
            'Q-1': {'pick': 'In the friends list'},          # legacy: label prose, no "v"
            'Q-2': {'v': 'pick', 'pick': 'b'}, 'Q-3': {'v': 'yes'}, 'Q-4': {'v': 'other'}}}
        out = summary(s, state).split('\n')
        self.assertIn('1 skipped', out[0])
        self.assertEqual(out[1], 'Q-1 skip')

    def test_summary_prints_dont_know(self):
        # "Don't know" rides as Other with a flag, so the file keeps three answers, not four —
        # but both summaries must SAY don't know, or the session reads it as "something else".
        from deck.serve import summary
        s = load_spec(words_spec(self.tmp))
        state = {'submitted': '2026-09-04T10:00:00Z',
                 'answers': {'Q-4': {'v': 'other', 'dk': True, 'note': 'ask me later'}}}
        lines = summary(s, state).split('\n')
        self.assertEqual(lines[4], 'Q-4 don\'t know — "ask me later"')

    # ── pages: a question deck is a scrolling page per SET of questions, not a screen per
    # question (design §3.1). Destin (2026-09-04): "my mindset should stay in the same place
    # for each set of questions, and only shift when moving to a new set."
    def test_pages_default_is_one_page(self):
        # No marker at all: every question shares one page, titled with the deck's own title.
        s = spec_with(self.tmp, lambda r: r['steps'].pop(2))   # drop the fixture's marker
        p = pages(s)
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]['id'], 'P-1')
        self.assertEqual(p[0]['title'], 'Questions fixture')
        self.assertEqual(p[0]['intro'], '')
        self.assertEqual([st['id'] for st in p[0]['steps']], ['Q-1', 'Q-2', 'Q-3', 'Q-4'])

    def test_marker_splits_pages(self):
        s = load_spec(words_spec(self.tmp))
        p = pages(s)
        self.assertEqual([q['id'] for q in p], ['P-1', 'P-2'])
        self.assertEqual([[st['id'] for st in q['steps']] for q in p],
                         [['Q-1', 'Q-2'], ['Q-3', 'Q-4']])
        self.assertEqual(p[1]['title'], 'What we promise')
        self.assertEqual(p[1]['intro'], 'Statements, not questions.')
        self.assertEqual(errs(s), [])

    def test_marker_carries_only_page_and_intro(self):
        s = spec_with(self.tmp, lambda r: r['steps'][2].update({'headline': 'Not here'}))
        self.assertIn('P-2: a page marker carries only page and intro', errs(s))

    def test_marker_needs_a_title(self):
        # is_page() is keyed on the KEY's presence, not its value — an empty "page" is still a
        # marker, so it must be refused here rather than rendering a page with no name.
        s = spec_with(self.tmp, lambda r: r['steps'][2].update({'page': ''}))
        self.assertIn('P-2: a page marker needs a title in "page"', errs(s))
        s2 = spec_with(self.tmp, lambda r: r['steps'][2].update({'page': '   '}))
        self.assertIn('P-2: a page marker needs a title in "page"', errs(s2))

    def test_marker_refused_in_a_deck_with_pictures(self):
        s = spec_with(self.tmp, lambda r: r['steps'].append(
            {'id': 'S-9', 'surface': 'Games', 'path': 'Board', 'crop': 'bubble',
             'headline': 'Bigger?', 'changed': 'x', 'notice': 'y', 'highlight': {'text': 'Send'}}),
            images='images/questions', runs={'today': '/nowhere'})
        self.assertIn('P-2: pages are for question decks — this deck has pictures', errs(s))

    def test_contract_deck_is_not_a_pages_deck(self):
        # A contract is picture-free, so words_only() was true for it and pages() claimed it —
        # turning the acceptance deck into ONE 5,884px scroll whose first question started at
        # y=3739, under the contract table, while the header read "page 1 of 1 · 0 of 8
        # answered" (measured 2026-09-05). Pages are a QUESTION-deck behaviour (design §3.1).
        s = spec_with(self.tmp, lambda r: r['steps'].append(
            {'id': 'C-1', 'words': True, 'surface': 'Games', 'path': 'Contract',
             'headline': 'This is what done means.',
             'rows': [{'id': 'R-1', 'statement': 'A game you leave keeps running.',
                       'checkedBy': 'a person', 'source': 'Q-3'}]}))
        self.assertIsNone(pages(s))

    def test_question_deck_still_has_pages(self):
        s = load_spec(words_spec(self.tmp))
        self.assertIsNotNone(pages(s))

    def test_a_marker_with_nothing_after_it_is_refused(self):
        def to_the_end(r):
            r['steps'].append(r['steps'].pop(2))
        s = spec_with(self.tmp, to_the_end)
        self.assertIn('P-2: an empty page', errs(s))

    def test_deck_data_has_pages_and_steps_exclude_markers(self):
        s = load_spec(words_spec(self.tmp))
        d = deck_data(s, {})
        # A marker answers nothing, so it is not in `steps` — no answer row, no summary line,
        # nothing a contract row could ever cite as its source.
        self.assertEqual([st['id'] for st in d['steps']], ['Q-1', 'Q-2', 'Q-3', 'Q-4'])
        self.assertEqual([p['steps'] for p in d['pages']], [['Q-1', 'Q-2'], ['Q-3', 'Q-4']])
        self.assertEqual([p['title'] for p in d['pages']], ['Questions fixture', 'What we promise'])

    def test_deck_opening_with_a_marker_has_no_implicit_page(self):
        # A marker as the very FIRST step means there is never an unlabelled stretch before it —
        # pages() must not invent a "P-1" nobody wrote; the marker's own id and title lead, and
        # (with no other marker in the deck) it is the deck's only page.
        def marker_first(r):
            r['steps'].insert(0, r['steps'].pop(2))   # move P-2 to the front
        s = spec_with(self.tmp, marker_first)
        p = pages(s)
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]['id'], 'P-2')
        self.assertNotEqual(p[0]['id'], 'P-1')
        self.assertEqual(p[0]['title'], 'What we promise')
        self.assertEqual([st['id'] for st in p[0]['steps']], ['Q-1', 'Q-2', 'Q-3', 'Q-4'])

    def test_a_picture_deck_has_no_pages(self):
        # Pages are for question decks: a deck with any picture keeps one step per screen.
        s = spec_with(self.tmp, lambda r: r['steps'].__setitem__(2, {
            'id': 'S-9', 'surface': 'Games', 'path': 'Board', 'crop': 'bubble',
            'headline': 'Bigger?', 'changed': 'x', 'notice': 'y', 'highlight': {'text': 'Send'}}),
            images='images/questions', runs={'today': '/nowhere'})
        self.assertIsNone(pages(s))
        self.assertNotIn('pages', deck_data(s, {}))

    def test_is_words_is_the_flag_not_a_guess(self):
        # A step that merely FORGOT its crop is still an error, not a silent words step.
        self.assertFalse(is_words({'id': 'x', 'headline': 'h'}))
        self.assertTrue(is_words({'id': 'x', 'words': True}))
        # A contract step (rows) is a words step too — even with no rows yet, so the empty
        # contract gets the contract error in Task 3, not "missing crop".
        self.assertTrue(is_words({'id': 'x', 'rows': []}))


class AnswerShapeTests(unittest.TestCase):
    """How he answers, rather than what he is looking at: several at once, and words he types.
    Both asked for by Destin on 2026-09-06 — "A and C, drop B" and "call it this" had nowhere
    to go but the note box, which nothing reads as a decision."""
    def setUp(self): self.d = tempfile.mkdtemp()

    def _q(self, **over):
        st = {'id': 'Q-1', 'words': True, 'surface': 'Home', 'path': 'Chat', 'headline': 'A question?',
              'today': 'Now.', 'problem': 'Bad.', 'proposal': 'Better.'}
        st.update(over)
        spec = {'title': 'T', 'key': 't', 'out': 't.html', 'themes': ['midnight'], 'steps': [st]}
        p = os.path.join(self.d, 't.json')
        with open(p, 'w') as f:
            json.dump(spec, f)
        return load_spec(p)

    OPTS = [{'id': 'a', 'label': 'One', 'pros': ['Good.']}, {'id': 'b', 'label': 'Two', 'cons': ['Bad.']}]

    def test_several_reaches_the_page(self):
        s = self._q(pick='several', options=self.OPTS)
        self.assertEqual(validate(s), ([], []))
        self.assertEqual(deck_data(s, {})['steps'][0]['pick'], 'several')

    def test_one_is_the_default_and_says_nothing_to_the_page(self):
        s = self._q(options=self.OPTS)
        self.assertNotIn('pick', deck_data(s, {})['steps'][0])

    def test_several_needs_something_to_pick_between(self):
        errors, _ = validate(self._q(pick='several'))
        self.assertTrue(any('needs options or variants' in e for e in errors), errors)

    def test_an_unknown_pick_shape_is_refused(self):
        errors, _ = validate(self._q(pick='two', options=self.OPTS))
        self.assertTrue(any('pick must be' in e for e in errors), errors)

    def test_a_written_answer_reaches_the_page_with_its_prompt(self):
        s = self._q(answer='words', prompt='What should it be called?')
        self.assertEqual(validate(s), ([], []))
        step = deck_data(s, {})['steps'][0]
        self.assertEqual(step['answer'], 'words')
        self.assertEqual(step['prompt'], 'What should it be called?')

    def test_a_written_answer_and_a_list_to_pick_from_are_two_questions(self):
        errors, _ = validate(self._q(answer='words', options=self.OPTS))
        self.assertTrue(any('two different' in e for e in errors), errors)

    def test_a_prompt_without_a_written_answer_is_refused(self):
        errors, _ = validate(self._q(prompt='Name it'))
        self.assertTrue(any('prompt is the placeholder' in e for e in errors), errors)

    def test_the_fixture_builds_on_both_layouts(self):
        for paged in (True, False):
            s = load_spec(shapes_spec(tempfile.mkdtemp(), paged=paged))
            self.assertEqual(validate(s)[0], [], f'paged={paged}')
            self.assertEqual(bool(pages(s)), paged)


class StageChecklistTests(unittest.TestCase):
    """A deck says WHICH STAGE it is at, and the tool checks the slide that stage needs is
    there. A stage never says which other slides are allowed — that is what forced one ask
    into several decks (Destin, 2026-09-06)."""
    def setUp(self): self.d = tempfile.mkdtemp()

    def _deck(self, stage, steps):
        spec = {'title': 'T', 'key': 't', 'out': 't.html', 'themes': ['midnight'], 'stage': stage, 'steps': steps}
        p = os.path.join(self.d, 't.json')
        with open(p, 'w') as f:
            json.dump(spec, f)
        return load_spec(p)

    QUESTION = {'id': 'Q-1', 'words': True, 'surface': 'Home', 'path': 'Chat', 'headline': 'A question?',
                'today': 'Now.', 'problem': 'Bad.', 'proposal': 'Better.'}
    CONTRACT = {'id': 'C', 'words': True, 'surface': 'Home', 'path': 'Chat', 'headline': 'What done means.',
                'rows': [{'id': 'R1', 'statement': 'It works.', 'checkedBy': 'human',
                          'threshold': 'pass/fail', 'source': 't#Q-1'}]}

    def test_an_ask_deck_with_a_question_passes(self):
        self.assertEqual(validate(self._deck('ask', [self.QUESTION]))[0], [])

    def test_an_ask_deck_with_no_question_is_refused(self):
        spec = {'title': 'T', 'key': 't', 'out': 't.html', 'themes': ['midnight'], 'stage': 'ask',
                'sources': {'t': 't.json'}, 'branch': 'b', 'steps': [self.CONTRACT]}
        p = os.path.join(self.d, 'c.json')
        with open(p, 'w') as f:
            json.dump(spec, f)
        errors, _ = validate(load_spec(p))
        self.assertTrue(any('needs a question' in e for e in errors), errors)

    def test_a_deck_naming_no_stage_is_checked_against_nothing(self):
        spec = {'title': 'T', 'key': 't', 'out': 't.html', 'themes': ['midnight'], 'steps': [self.QUESTION]}
        p = os.path.join(self.d, 'n.json')
        with open(p, 'w') as f:
            json.dump(spec, f)
        self.assertEqual(validate(load_spec(p))[0], [])

    def test_an_unknown_stage_is_refused(self):
        errors, _ = validate(self._deck('shipping', [self.QUESTION]))
        self.assertTrue(any('is not one of' in e for e in errors), errors)

    def test_a_stage_never_forbids_a_slide_it_did_not_ask_for(self):
        # The whole point: an "ask" deck may also carry the contract it leads to.
        spec = {'title': 'T', 'key': 't', 'out': 't.html', 'themes': ['midnight'], 'stage': 'ask',
                'sources': {'t': 't.json'}, 'branch': 'b', 'steps': [self.QUESTION, self.CONTRACT]}
        p = os.path.join(self.d, 'both.json')
        with open(p, 'w') as f:
            json.dump(spec, f)
        self.assertEqual(validate(load_spec(p))[0], [])


if __name__ == '__main__':
    unittest.main()
