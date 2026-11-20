"""The hands-off route (Destin, 2026-11-18: "I just tell a session: do all of this without me ... I just want to see it at the very end"):
the one growing deck at stage after, marked "hands_off", its required lists and its done gate. Source: deck/grows.py hands_off_errors, deck/gate.py check_hands_off."""
import copy
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.build import deck_data                         # noqa: E402
from deck.gate import check_gate                         # noqa: E402
from deck.spec import load_spec, validate                # noqa: E402

WORDS = 'do all of this without me, I do not want to be asked anything'


def lst(sid, headline, kind, calls, **kw):
    return {'id': sid, 'words': True, 'surface': 'App', 'path': 'Somewhere', 'headline': headline, 'list': kind, 'calls': calls, **kw}


def spec(**over):
    s = {'title': 'Saved searches', 'key': 'saved', 'out': 'saved.html', 'themes': ['midnight'], 'grows': True, 'tag': 'feature',
         'stage': 'after', 'hands_off': WORDS, 'branch': 'session/saved',
         'steps': [
             {'id': 'P-1', 'page': 'What you asked for', 'intro': 'Your words, then what you asked for.', 'stage': 'after'},
             lst('L-1', 'What you asked for', 'asked-for', [{'id': 'a1', 'call': 'Searches can be saved.', 'why': 'A star saves them.'}]),
             {'id': 'P-2', 'page': 'Choices I made for you', 'intro': 'Everything I decided in your place.', 'stage': 'after'},
             lst('L-2', 'Choices I made for you', 'choices-made', [{'id': 'c1', 'call': 'The star sits at the right of the box.', 'why': 'It matches the other buttons.'}]),
             {'id': 'P-3', 'page': 'What changed', 'intro': 'What moved from the plan, and what the review found.', 'stage': 'after'},
             lst('L-3', 'What changed while building', 'changed-while-building', [{'id': 'b1', 'call': 'Star at the right.', 'why': 'As planned.', 'built': 'as planned'}]),
             lst('L-4', 'Found in review', 'found-in-review', [{'id': 'f1', 'call': 'Nothing found.', 'why': 'Read every file.', 'none_found': True}]),
             {'id': 'L-5', 'words': True, 'surface': 'App', 'path': 'Somewhere', 'headline': 'Checks', 'calls': [
                 {'id': 'r1', 'call': 'Code review ran.', 'why': 'Read the change.', 'result': 'pass', 'check': 'code-review'}]}]}
    s.update(over)
    return s


def step(s, sid):
    return next(x for x in s['steps'] if x['id'] == sid)


class Refusals(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def errors(self, s):
        p = os.path.join(self.tmp, 'saved.json')
        with open(p, 'w') as f:
            json.dump(s, f)
        return validate(load_spec(p))[0]

    def has(self, errs, text):
        self.assertTrue(any(text in e for e in errs), errs)

    def test_complete_deck_has_no_errors(self):
        self.assertEqual(self.errors(spec()), [])

    def test_only_at_stage_after(self):
        s = spec(stage='before'); s['steps'][0]['stage'] = 'before'
        self.has(self.errors(s), 'only ever the after-build deck')

    def test_no_earlier_stage_pages(self):
        s = spec(); s['steps'].insert(0, {'id': 'P-0', 'page': 'Design', 'intro': 'x.', 'stage': 'design'})
        self.has(self.errors(s), 'has no Design page')

    def test_hands_off_must_be_words(self):
        self.has(self.errors(spec(hands_off='  ')), 'his exact words')

    def test_asked_for_required_on_first_page(self):
        s = spec(); s['steps'].remove(step(s, 'L-1'))
        self.has(self.errors(s), '"What you asked for"')
        s = spec(); a = step(s, 'L-1'); s['steps'].remove(a); s['steps'].insert(s['steps'].index(step(s, 'L-3')), a)
        self.has(self.errors(s), 'first page')

    def test_choices_required(self):
        s = spec(); s['steps'].remove(step(s, 'L-2'))
        self.has(self.errors(s), '"Choices I made for you"')

    def test_none_made_is_one_row_only(self):
        s = spec(); step(s, 'L-2')['calls'] = [{'id': 'n', 'call': 'I made no choices for you.', 'why': 'Everything was asked.', 'none_made': True}]
        self.assertEqual(self.errors(s), [])
        step(s, 'L-2')['calls'].append({'id': 'c2', 'call': 'Another.', 'why': 'Yes.'})
        self.has(self.errors(s), 'none_made')

    def test_a_choice_he_sees_needs_a_picture(self):
        s = spec(); step(s, 'L-2')['calls'][0]['visual'] = True
        self.has(self.errors(s), 'flagged visual but has no picture')

    def test_after_build_lists_still_required(self):
        s = spec(); s['steps'].remove(step(s, 'L-3'))
        self.has(self.errors(s), 'What changed while building')
        s = spec(); s['steps'].remove(step(s, 'L-4'))
        self.has(self.errors(s), 'Found in review')

    def test_lists_without_hands_off_refused(self):
        s = spec(); del s['hands_off']
        self.has(self.errors(s), 'belongs on a hands-off deck')

    def test_hands_off_needs_grows(self):
        s = spec(); del s['grows']
        self.has(self.errors(s), 'deck that grows')

    def test_build_hands_the_page_his_words(self):
        p = os.path.join(self.tmp, 'saved.json')
        with open(p, 'w') as f:
            json.dump(spec(), f)
        self.assertEqual(deck_data(load_spec(p), {})['grows']['hands_off'], WORDS)


class Gate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.p = os.path.join(self.tmp, 'saved.json')

    def put(self, s=None, ans='ok', fingerprint=True):
        s = s or spec()
        raw = json.dumps(s).encode()
        with open(self.p, 'wb') as f:
            f.write(raw)
        if ans == 'ok':
            ans = {'submitted': '2026-11-18T10:00:00Z', 'answers': {
                'L-1': {'ok': {'a1': True}}, 'L-2': {'ok': {'c1': True}}, 'L-3': {'ok': {'b1': True}}, 'L-4': {'ok': {'f1': True}}}}
        if ans is not None:
            if fingerprint:
                ans = {**ans, 'built': {'spec_sha256': hashlib.sha256(raw).hexdigest()}}
            with open(os.path.join(self.tmp, 'saved.answers.json'), 'w') as f:
                json.dump(ans, f)
        return self

    def problems(self, **kw):
        self.put(**kw)
        return check_gate(self.p)[0]

    def has(self, ps, text):
        self.assertTrue(any(text in p for p in ps), ps)

    def answered(self, **edit):
        a = {'submitted': '2026-11-18T10:00:00Z', 'answers': {
            'L-1': {'ok': {'a1': True}}, 'L-2': {'ok': {'c1': True}}, 'L-3': {'ok': {'b1': True}}, 'L-4': {'ok': {'f1': True}}}}
        for sid, v in edit.items():
            a['answers'][sid.replace('_', '-')] = v
        return a

    def test_finished_passes(self):
        self.assertEqual(self.problems(), [])

    def test_not_submitted(self):
        self.has(self.problems(ans=None), 'has not been submitted')
        self.has(self.problems(ans={'answers': {}}), 'has not been submitted')

    def test_choice_not_looked_at(self):
        a = self.answered(L_2={})
        self.has(self.problems(ans=a), 'was not looked at')

    def test_asked_for_not_looked_at(self):
        a = self.answered(L_1={})
        self.has(self.problems(ans=a), 'L-1/a1')

    def test_a_comment_means_another_round(self):
        a = self.answered(L_2={'ok': {}, 'changes': {'c1': 'put it on the left'}})
        self.has(self.problems(ans=a), 'he asked for a change')

    def test_a_note_means_another_round(self):
        a = self.answered(); a['pageNotes'] = {'P-2': 'hmm'}
        self.has(self.problems(ans=a), 'left a note')

    def test_spec_edited_after_submit(self):
        self.put()
        s = spec(); step(s, 'L-2')['calls'][0]['call'] = 'Changed afterwards.'
        with open(self.p, 'w') as f:
            json.dump(s, f)
        self.has(check_gate(self.p)[0], 'cannot tell what he saw')

    def test_missing_lists_fail_the_gate(self):
        s = spec(); s['steps'].remove(step(s, 'L-2'))
        self.has(self.problems(s=s), 'Choices I made for you')
        s = spec(); s['steps'].remove(step(s, 'L-4'))
        self.has(self.problems(s=s), 'Found in review')

    def test_a_check_left_as_a_suggestion_fails(self):
        s = spec(); step(s, 'L-5')['calls'].append({'id': 'r2', 'call': 'Phone check.', 'why': 'Narrow.', 'result': 'run'})
        self.has(self.problems(s=s), 'check L-5/r2')

    def test_a_status_he_set_to_fail_fails(self):
        a = self.answered(L_5={'results': {'r1': 'fail'}})
        self.has(self.problems(ans=a), 'set it to fail')

    def test_old_answers_without_fingerprint_pass_with_a_note(self):
        self.put(fingerprint=False)
        problems, notes = check_gate(self.p)
        self.assertEqual(problems, [])
        self.assertTrue(any('could not be checked' in n or 'fingerprint' in n for n in notes), notes)


if __name__ == '__main__':
    unittest.main()
