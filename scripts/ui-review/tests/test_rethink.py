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
        self.assertIn('class="qstate"', js)   # the answered mark: a status pill, never the finish circle
        self.assertNotRegex(js, r'<span class="tick"')            # `.tick` is the finish screen's 56px circle
        self.assertRegex(js, re.escape("(st.answer === 'words' ? ''"))   # no note box beside a typed answer
        self.assertRegex(js, re.escape("(listy(st) ? '' : `<div class=\"qrow\">"))   # a list has no answer row at all

    def test_round_three_rows(self):
        # Round 3 (2026-11-10): a row may be a before/after pair, a list may be a gallery, and
        # the summary carries general notes. Round 4: wording ROWS are refused; words are
        # retyped on a still copy of the real screen (a `screen` step) and arrive as {from, to}.
        from deck.serve import summary
        def add(r):
            r['steps'].append({**CALLS, 'gallery': True, 'calls': [
                {'id': 'w', 'call': 'Menu title', 'why': 'Top of the menu.'}]})
        self.assertEqual(self.errs(add), [])
        e = self.errs(lambda r: r['steps'].append({**CALLS, 'calls': [{'id': 'w', 'call': 'x', 'why': 'y', 'wording': 'Pick a game'}]}))
        self.assertTrue(any('wording rows are retired' in x for x in e), e)
        scr = {k: v for k, v in CALLS.items() if k != 'calls'}
        e = self.errs(lambda r: r['steps'].append({**scr, 'screen': 'nope.html'}))
        self.assertTrue(any('screen nope.html does not exist' in x for x in e), e)
        e = self.errs(lambda r: r['steps'].append({**scr, 'screen': '/etc/x.html'}))
        self.assertTrue(any('screen is an .html file beside the spec' in x for x in e), e)
        e = self.errs(lambda r: r['steps'].append({**CALLS, 'calls': [{'id': 'w', 'call': 'x', 'why': 'y', 'before': 'nope.png'}]}))
        self.assertTrue(any('before nope.png does not exist' in x for x in e), e)
        spec = {'key': 'k', 'steps': [{'id': 'K-1'}]}
        out = summary(spec, {'notes': 'header is busy', 'answers': {'K-1': {'v': 'other', 'edits': {'7': {'from': 'Pick a game', 'to': 'Choose a game'}}}}})
        self.assertIn('general notes — "header is busy"', out)
        out2 = summary({'key': 'k', 'steps': [{'id': 'P-1', 'page': 'Checks'}, {'id': 'K-1'}]},
                      {'pageNotes': {'P-1': 'pictures too small'}, 'answers': {'K-1': {'v': 'other', 'results': {'c4': 'pass'}}}})
        self.assertIn('about the page "Checks" — "pictures too small"', out2)
        self.assertIn('status c4 — he set it to Passed', out2)
        self.assertIn('reword "Pick a game" → "Choose a game"', out)


    # ── round 7 (2026-11-10) ────────────────────────────────────────────────────────────────
    def test_summary_prints_pasted_pictures_and_paths_under_their_box(self):
        # "attach/paste images/filepaths in these input boxes and have them work as pills": the session
        # reading the summary must see the path of every picture and file, tied to the box it sat under.
        spec = {'key': 'k', 'steps': [{'id': 'P-1', 'page': 'Checks'}, {'id': 'K-1'}]}
        img = {'kind': 'image', 'name': 'shot.png', 'path': '/d/r.attachments/a.png', 'url': '/r.attachments/a.png'}
        fil = {'kind': 'path', 'name': 'MAP.md', 'path': '/home/d/docs/MAP.md'}
        out = summary(spec, {
            'pageAttach': {'P-1': [fil]}, 'notesAttach': [img],
            'answers': {'K-1': {'v': 'other', 'changes': {'c1': 'x'}, 'attach': {'change:c1': [img], 'note': [fil]},
                                'marks': [{'pic': 'row c1', 'x': 1, 'y': 2, 'w': 3, 'h': 4, 'text': 't', 'attach': [fil]}]}}})
        self.assertIn('attached to change c1 — picture "shot.png" saved at /d/r.attachments/a.png', out)
        self.assertIn('attached to his note — file /home/d/docs/MAP.md', out)
        self.assertIn('attached to area 1 — file /home/d/docs/MAP.md', out)
        self.assertIn('about the page "Checks" attached — file /home/d/docs/MAP.md', out)
        self.assertIn('general notes attached — picture "shot.png" saved at /d/r.attachments/a.png', out)

    def test_attach_endpoint_keeps_only_pictures_under_a_server_made_name(self):
        import threading
        import urllib.error
        import urllib.request
        from deck.serve import ATTACH_MAX, make_server
        spec = load_spec(words_spec(self.tmp))
        srv, url = make_server(spec, 0, lambda state: None)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = url.rsplit('/', 1)[0]
        png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 40

        def post(body, ctype='image/png', name='../../evil name.png', host=None):
            req = urllib.request.Request(base + '/attach?name=' + urllib.request.quote(name), data=body, method='POST',
                                         headers={'content-type': ctype, **({'Host': host} if host else {})})
            try:
                r = urllib.request.urlopen(req, timeout=5)
                return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read() or b'{}')
        try:
            code, d = post(png)
            self.assertEqual(code, 200, d)
            folder = os.path.join(spec['_base'], spec['_stem'] + '.attachments')
            self.assertEqual(os.path.dirname(d['path']), folder, 'saved beside the spec, never where the browser said')
            self.assertRegex(os.path.basename(d['path']), r'^\d{8}-\d{6}-[0-9a-f]{8}\.png$')
            self.assertEqual(open(d['path'], 'rb').read(), png)
            self.assertNotIn('..', d['name']); self.assertNotIn('/', d['name'])
            self.assertEqual(urllib.request.urlopen(base + d['url'], timeout=5).read(), png, 'the pill thumbnail can be fetched')
            self.assertEqual(post(b'<svg onload=x>')[0], 415, 'a picture is judged by its bytes')
            self.assertEqual(post(png, ctype='text/plain')[0], 415, 'images only')
            self.assertEqual(post(b'\x89PNG\r\n\x1a\n' + b'\x00' * ATTACH_MAX)[0], 413, 'size-capped')
            self.assertEqual(post(png, host='evil.example')[0], 403, 'same origin check as the other POSTs')
        finally:
            srv.shutdown()


    def test_round_seven_page_source_pins(self):
        # Four things Destin asked for on 2026-11-10, each a one-line cause that is easy to undo:
        js = open(os.path.join(DECK, 'page.js')).read()
        css = open(os.path.join(DECK, 'page.css')).read()
        # 1. a row's pictures are an Attachments card; no thumbnails, no walking between pictures
        self.assertIn('class="attcard', js)
        self.assertNotRegex(js, r'class="callpics"|class="vnav"|class="vstrip"|viewStep')
        # 3. option-id chips are gone from written options; the one filled button is the foot's
        self.assertNotIn('chip(o.id)', js)
        self.assertRegex(css, r'\.btn\{border-color:var\(--edge-strong\)\}')
        self.assertNotRegex(css, r'\.ans\[data-v="yes"\]\{border-color:color-mix')
        # 4. "Not reviewed" is gone, and the state pill is not drawn as an outlined control
        self.assertNotIn("'Not reviewed'", js)
        self.assertRegex(css, r'\.qstate\{border:0;')
        self.assertRegex(css, r'\.qstate\{[^}]*pointer-events:none')
        self.assertRegex(css, r'\.card\.calls\.context \.call:first-child\{[^}]*dashed')


if __name__ == '__main__':
    unittest.main()
