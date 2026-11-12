"""walkthrough-check: the done / not-done gate for the walkthrough flow (deck/gate.py).
Picture-free: specs here are bare JSON with rows, and answers files are written by hand in the
shape serve.py saves (answers[step] = {v, changes, results, ...}, plus `submitted`)."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.gate import also_check, changes_requested, check_gate   # noqa: E402


def w(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f)


BEFORE = {'title': 't', 'key': 'k', 'out': 'k.html', 'steps': [
    {'id': 'W-1', 'calls': [
        {'id': 'save', 'call': 'A search can be saved.', 'why': 'A star.', 'decided': 'i run the same search every monday'},
        {'id': 'extra', 'call': 'Star is big.', 'why': 'Easy to hit.'}]},
    {'id': 'W-5', 'calls': [
        {'id': 'c1', 'call': 'Reviewer reads it.', 'why': 'Rules.', 'result': 'run'},
        {'id': 'c2', 'call': 'Phone check.', 'why': 'Narrow.', 'result': 'skip'}]}]}
AFTER = {'title': 't', 'key': 'k2', 'out': 'k2.html', 'steps': [
    {'id': 'W-1', 'calls': [{'id': 'a', 'call': 'Built.', 'why': 'Yes.', 'from': 'W-1/save'}]},
    {'id': 'W-5', 'calls': [{'id': 'r1', 'call': 'Reviewer found nothing.', 'why': 'Read.', 'from': 'W-5/c1', 'result': 'pass'}]}]}
SUB = {'submitted': '2026-11-11T10:00:00Z', 'answers': {}}


class Gate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.b = os.path.join(self.tmp, 'x.walkthrough.json')
        self.a = os.path.join(self.tmp, 'x.walkthrough.after.json')

    def put(self, before=BEFORE, after=AFTER, b_ans=SUB, a_ans=SUB):
        w(self.b, before)
        if after is not None: w(self.a, after)
        if b_ans is not None: w(os.path.join(self.tmp, 'x.walkthrough.answers.json'), b_ans)
        if a_ans is not None: w(os.path.join(self.tmp, 'x.walkthrough.after.answers.json'), a_ans)

    def problems(self, **kw):
        self.put(**kw)
        return check_gate(self.b)[0]

    def has(self, ps, text):
        self.assertTrue(any(text in p for p in ps), ps)

    def test_finished_passes(self):
        self.assertEqual(self.problems(), [])

    def test_before_not_submitted(self):
        self.has(self.problems(b_ans={'answers': {}}), 'before-build walkthrough has not been submitted')

    def test_before_answers_missing(self):
        self.has(self.problems(b_ans=None), 'before-build walkthrough has not been submitted')

    def test_no_after_walkthrough(self):
        self.has(self.problems(after=None), 'no after-build walkthrough yet')

    def test_request_without_row_refused(self):
        after = json.loads(json.dumps(AFTER)); del after['steps'][0]['calls'][0]['from']
        self.has(self.problems(after=after), 'request W-1/save')

    def test_dropped_request_with_reason_counts_and_blank_reason_refused(self):
        after = json.loads(json.dumps(AFTER)); after['steps'][0]['calls'][0]['dropped'] = 'cut for time'
        self.assertEqual(self.problems(after=after), [])
        after['steps'][0]['calls'][0]['dropped'] = ' '
        self.has(self.problems(after=after), '"dropped" needs the reason')

    def test_commented_row_is_a_request(self):
        ans = {'submitted': 'x', 'answers': {'W-1': {'v': 'other', 'changes': {'extra': 'make it smaller'}}}}
        self.has(self.problems(b_ans=ans), 'request W-1/extra')

    def test_bad_link_refused(self):
        after = json.loads(json.dumps(AFTER)); after['steps'][0]['calls'][0]['from'] = 'W-9/nope'
        self.has(self.problems(after=after), 'not a row of the before-build walkthrough')

    def test_switched_on_check_needs_a_result(self):
        after = json.loads(json.dumps(AFTER)); after['steps'][1]['calls'][0]['result'] = 'run'
        self.has(self.problems(after=after), 'check W-5/c1')
        del after['steps'][1]['calls'][0]['result']
        self.has(self.problems(after=after), 'check W-5/c1')

    def test_a_failed_check_still_counts_as_run(self):
        after = json.loads(json.dumps(AFTER)); after['steps'][1]['calls'][0]['result'] = 'fail'
        self.assertEqual(self.problems(after=after), [])

    def test_skipped_check_needs_no_row_but_his_switch_wins(self):
        # He switched c2 ON in the deck: the spec said skip, his answer wins.
        ans = {'submitted': 'x', 'answers': {'W-5': {'v': 'other', 'results': {'c2': 'run'}}}}
        self.has(self.problems(b_ans=ans), 'check W-5/c2')
        # He switched c1 OFF: no result row required.
        ans = {'submitted': 'x', 'answers': {'W-5': {'v': 'other', 'results': {'c1': 'skip'}}}}
        after = json.loads(json.dumps(AFTER)); del after['steps'][1]
        self.assertEqual(self.problems(b_ans=ans, after=after), [])

    def test_after_not_submitted(self):
        self.has(self.problems(a_ans={'answers': {}}), 'after-build walkthrough has not been submitted')

    def test_after_changes_requested(self):
        for ans in ({'W-1': {'v': 'other', 'changes': {'a': 'no'}}},
                    {'W-5': {'v': 'other', 'results': {'r1': 'fail'}}},
                    {'W-1': {'v': 'other', 'marks': [{'pic': 'p', 'text': 'x'}]}},
                    {'W-1': {'v': 'other', 'edits': {'k': {'from': 'a', 'to': 'b'}}}},
                    {'W-1': {'v': 'yes', 'note': 'hmm'}}):
            self.has(self.problems(a_ans={'submitted': 'x', 'answers': ans}), 'not finished')

    def test_accepted_and_passed_rows_are_not_changes(self):
        ans = {'W-1': {'v': 'yes', 'accepted': True}, 'W-5': {'v': 'yes', 'results': {'r1': 'pass'}}}
        self.assertEqual(self.problems(a_ans={'submitted': 'x', 'answers': ans}), [])

    def test_page_and_general_notes_are_changes(self):
        self.has(self.problems(a_ans={'submitted': 'x', 'answers': {}, 'pageNotes': {'p1': 'one more thing'}}), 'page p1')
        self.has(self.problems(a_ans={'submitted': 'x', 'answers': {}, 'notes': 'hi'}), 'general note')

    def test_comment_on_a_check_is_passed_on(self):
        ans = {'submitted': 'x', 'answers': {'W-5': {'v': 'other', 'changes': {'c1': 'look at the empty state'}}}}
        self.put(b_ans=ans)
        self.assertEqual(also_check(BEFORE, ans), {'W-5/c1': 'look at the empty state'})
        self.assertIn('also check (W-5/c1): look at the empty state', check_gate(self.b)[1][-1])

    def test_changes_requested_empty(self):
        self.assertEqual(changes_requested(SUB), [])


class Cli(unittest.TestCase):
    def test_exit_codes(self):
        sys.path.insert(0, os.path.dirname(HERE))
        import importlib.util
        spec = importlib.util.spec_from_file_location('rc', os.path.join(os.path.dirname(HERE), 'review-cards.py'))
        rc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)
        tmp = tempfile.mkdtemp(); b = os.path.join(tmp, 'x.walkthrough.json')
        w(b, BEFORE)
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertEqual(rc.main(['walkthrough-check', b]), 1)
        self.assertIn('NOT FINISHED', err.getvalue())
        w(os.path.join(tmp, 'x.walkthrough.after.json'), AFTER)
        w(os.path.join(tmp, 'x.walkthrough.answers.json'), SUB)
        w(os.path.join(tmp, 'x.walkthrough.after.answers.json'), SUB)
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(rc.main(['walkthrough-check', b]), 0)
        self.assertTrue(out.getvalue().startswith('ok: '))


if __name__ == '__main__':
    unittest.main()
