"""A reopened topic shows what changed since Destin answered it and keeps what he settled (deck/reopen_diff.py).
Source: Destin, 2026-11-18: "It feels like it keeps resetting rows/questions on me with no clear indication of what (if anything) actually changed."
"""
import hashlib
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.build import build_page                       # noqa: E402
from deck.reopen_diff import compute                    # noqa: E402
from deck.spec import load_spec                         # noqa: E402


def row(i, call, pic='pictures/a.png', why='Because.', more=None):
    return {'id': i, 'call': call, 'why': why, 'picture': pic, 'visual': True, **({'more': more} if more else {})}


def lst(rows, **kw):
    return {'id': 'L-1', 'words': True, 'surface': 'S', 'path': 'P', 'headline': 'List', 'calls': rows, **kw}


def pick(options, **kw):
    return {'id': 'Q-1', 'words': True, 'surface': 'S', 'path': 'P', 'headline': 'Which?', 'today': 't', 'problem': 'p', 'proposal': 'x',
            'options': options, **kw}


def opt(i, label, summary='s'):
    return {'id': i, 'label': label, 'summary': summary, 'pros': ['good'], 'cons': ['bad']}


def statement(headline='It holds', **kw):
    return {'id': 'T-1', 'words': True, 'surface': 'S', 'path': 'P', 'headline': headline, 'changed': 'c', 'notice': 'n', 'yes': 'Holds', 'no': 'Fails', **kw}


def deck(steps):
    return {'title': 'D', 'key': 'd', 'out': 'd.html', 'themes': ['midnight'], 'grows': True, 'tag': 'f', 'stage': 'design',
            'steps': [{'id': 'P-1', 'page': 'Design', 'intro': 'Pick.', 'stage': 'design'}] + steps}


class ReopenDiff(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def answered(self, old_steps, answer, sid, with_copy=True):
        """Write the deck as he saw it (as-built copy) and a submitted answers file for it."""
        raw = json.dumps(deck(old_steps)).encode()
        sha = hashlib.sha256(raw).hexdigest()
        if with_copy:
            with open(os.path.join(self.tmp, f'd.as-built.{sha[:12]}.json'), 'wb') as f:
                f.write(raw)
        with open(os.path.join(self.tmp, 'd.answers.20261101.json'), 'w') as f:
            json.dump({'deck': 'd', 'submitted': '2026-11-01T10:00:00Z', 'built': {'at': '2026-11-01T09:00:00Z', 'spec_sha256': sha},
                       'answers': {sid: answer}}, f)

    def now(self, steps):
        p = os.path.join(self.tmp, 'd.json')
        with open(p, 'w') as f:
            json.dump(deck(steps), f)
        return load_spec(p)

    def test_each_kind_of_list_row(self):
        old = lst([row('same', 'Kept as is.'), row('pic', 'Picture row.'), row('word', 'Old wording.'), row('gone', 'Dropped row.')])
        self.answered([old], {'v': 'other', 'ok': {'same': True, 'pic': True}, 'changes': {'word': 'no, redo it'}}, 'L-1')
        new = lst([row('same', 'Kept as is.'), row('pic', 'Picture row.', pic='pictures/b.png'), row('word', 'New wording.'), row('fresh', 'Brand new.')], reopened='You asked for changes.')
        d, warns = compute(self.now([new]))
        self.assertEqual(warns, [])
        r = d['L-1']['rows']
        self.assertEqual(r['same'], {'tag': 'same', 'carried': True})            # unchanged + ticked: carried
        self.assertEqual(r['pic'], {'tag': 'changed', 'parts': ['New picture']})  # only the picture changed
        self.assertEqual(r['word']['tag'], 'changed')
        self.assertEqual(r['word']['before'], 'Old wording.')
        self.assertEqual(r['word']['said'], 'no, redo it')                        # what he wrote on it
        self.assertEqual(r['fresh'], {'tag': 'new'})
        self.assertEqual(d['L-1']['removed'], ['Dropped row.'])
        self.assertEqual(d['L-1']['summary'], '1 new · 2 changed · 1 unchanged')

    def test_an_unchanged_row_he_did_not_tick_is_not_carried(self):
        old = lst([row('a', 'One.'), row('b', 'Two.')])
        self.answered([old], {'v': 'other', 'ok': {'a': True}, 'changes': {'b': 'hmm'}}, 'L-1')
        d, _ = compute(self.now([lst([row('a', 'One.'), row('b', 'Two.')], reopened='again')]))
        self.assertTrue(d['L-1']['rows']['a'].get('carried'))
        self.assertFalse(d['L-1']['rows']['b'].get('carried'))
        self.assertEqual(d['L-1']['rows']['b']['said'], 'hmm')

    def test_a_row_whose_more_changed_is_changed(self):
        old = lst([row('a', 'One.', more={'today': 'x'})])
        self.answered([old], {'v': 'yes', 'ok': {'a': True}}, 'L-1')
        d, _ = compute(self.now([lst([row('a', 'One.', more={'today': 'y'})], reopened='again')]))
        self.assertEqual(d['L-1']['rows']['a'], {'tag': 'changed', 'parts': ['Details changed']})

    def test_a_question_says_what_he_picked_and_marks_options(self):
        old = pick([opt('a', 'Alpha'), opt('b', 'Beta')])
        self.answered([old], {'v': 'pick', 'pick': 'a', 'note': 'close one'}, 'Q-1')
        new = pick([opt('a', 'Alpha'), opt('b', 'Beta', summary='reworded'), opt('c', 'Gamma')], reopened='more options')
        d, _ = compute(self.now([new]))
        self.assertEqual(d['Q-1']['lines'], ['You picked before: Alpha', 'You said: “close one”'])
        self.assertEqual(d['Q-1']['options'], {'a': 'yourpick', 'b': 'changed', 'c': 'new'})   # never preselected: only marked

    def test_a_question_whose_options_are_all_new_says_so(self):
        old = pick([opt('a', 'Alpha')])
        self.answered([old], {'v': 'other', 'note': 'want more'}, 'Q-1')
        d, _ = compute(self.now([pick([opt('x', 'Xray'), opt('y', 'Yank')], reopened='new set')]))
        self.assertEqual(d['Q-1']['options'], {})
        self.assertEqual(d['Q-1']['lines'][0], 'You did not pick one of the options before')
        self.assertIn('None of these options were in the version you answered.', d['Q-1']['lines'])

    def test_a_statement_says_what_he_marked_and_whether_it_changed(self):
        self.answered([statement()], {'v': 'no'}, 'T-1')
        d, _ = compute(self.now([statement(headline='It holds, reworded', reopened='again')]))
        self.assertEqual(d['T-1'], {'kind': 'statement', 'lines': ['You marked it before: Fails'], 'changed': True, 'before': 'It holds'})
        d2, _ = compute(self.now([statement(reopened='again')]))
        self.assertFalse(d2['T-1']['changed'])

    def test_a_missing_old_version_is_a_warning_and_no_diff(self):
        old = lst([row('a', 'One.')])
        self.answered([old], {'v': 'yes', 'ok': {'a': True}}, 'L-1', with_copy=False)
        d, warns = compute(self.now([lst([row('a', 'One.')], reopened='again')]))
        self.assertEqual(d, {})
        self.assertEqual(len(warns), 1)
        self.assertIn('L-1: cannot show what changed since he answered it', warns[0])

    def test_a_topic_that_is_not_reopened_gets_nothing(self):
        old = lst([row('a', 'One.')])
        self.answered([old], {'v': 'yes', 'ok': {'a': True}}, 'L-1')
        d, warns = compute(self.now([lst([row('a', 'One.')])]))
        self.assertEqual((d, warns), ({}, []))

    def test_the_build_carries_the_diff_to_the_page_and_the_warning_out(self):
        os.makedirs(os.path.join(self.tmp, 'pictures'))
        with open(os.path.join(self.tmp, 'pictures', 'a.png'), 'wb') as f:
            f.write(b'\x89PNG\r\n')
        old = lst([row('a', 'One.')])
        self.answered([old], {'v': 'yes', 'ok': {'a': True}}, 'L-1')
        page, warns = build_page(self.now([lst([row('a', 'One.'), row('n', 'Two.')], reopened='again')]), {})
        self.assertIn('"diff"', page)
        self.assertIn('1 new', page)
        self.answered([old], {'v': 'yes', 'ok': {'a': True}}, 'L-1', with_copy=False)
        os.remove(os.path.join(self.tmp, [f for f in os.listdir(self.tmp) if 'as-built' in f][0]))
        _, warns = build_page(self.now([lst([row('a', 'One.')], reopened='again')]), {})
        self.assertTrue(any('L-1: cannot show what changed' in w for w in warns), warns)


if __name__ == '__main__':
    unittest.main()
