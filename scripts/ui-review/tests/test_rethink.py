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

    def test_summary_lists_ticks_and_rows_not_looked_at_never_as_approved(self):
        # Round 10, R-2: a row he neither ticked nor changed is reported as "not looked at".
        s = spec_with(self.tmp, lambda r: r['steps'].append(dict(CALLS)))
        out = summary(s, {'answers': {'K-1': {'ok': {'size': True}}}})
        self.assertIn('ticked as fine — 1 row', out)
        self.assertIn('not looked at — "A win plays no sound."', out)
        self.assertNotIn('not looked at — "The board', out)
        everything = summary(s, {'answers': {'K-1': {'v': 'yes', 'ok': {'size': True, 'sound': True}}}})
        self.assertIn('ticked as fine — 2 rows', everything); self.assertNotIn('not looked at', everything)
        untouched = summary(s, {'answers': {}})
        self.assertEqual(untouched.count('not looked at'), 2)

    def test_a_deck_answered_the_old_way_still_prints_without_inventing_unlooked_rows(self):
        s = spec_with(self.tmp, lambda r: r['steps'].append(dict(CALLS)))
        old = summary(s, {'answers': {'K-1': {'v': 'yes', 'accepted': True}}})
        self.assertNotIn('not looked at', old)
        old2 = summary(s, {'answers': {'K-1': {'v': 'other', 'changes': {'sound': 'x'}}}})
        self.assertNotIn('not looked at', old2); self.assertIn('change sound', old2)

    def test_a_hand_made_mockup_in_a_mock_folder_can_be_a_screen_step(self):
        # Destin, round 15: he may ask to edit words/elements EARLY, on a mockup, outside the normal order. A screen step takes any
        # frozen .html file beside the spec (a subfolder is fine), so the mockup is just such a file: `data-frozen` marker, no code.
        base = os.path.dirname(words_spec(self.tmp))
        os.makedirs(os.path.join(base, 'mock'), exist_ok=True)
        page = '<!doctype html><html data-frozen="600x400" data-frozen-panel="20,20,300,200"><head><meta charset="utf-8"></head><body><div><p>Pick a game</p></div></body></html>'
        with open(os.path.join(base, 'mock', 'menu.html'), 'w') as f:
            f.write(page)
        with open(os.path.join(base, 'mock', 'code.html'), 'w') as f:
            f.write(page.replace('<div>', '<div><script>1</script>'))
        scr = {k: v for k, v in CALLS.items() if k != 'calls'}
        self.assertEqual(self.errs(lambda r: r['steps'].append({**scr, 'screen': 'mock/menu.html'})), [])
        e = self.errs(lambda r: r['steps'].append({**scr, 'screen': 'mock/code.html'}))
        self.assertTrue(any('cannot be shown for editing' in x for x in e), e)

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


    # ── round 7 (2026-11-10): trail / state / fold, More, Built from, video proof ──────────────
    TRAIL = [{'round': 'Round 3', 'asked': 'there is no notes button', 'built': 'A Notes button.', 'said': 'i wanted a box at the foot'}]

    def test_a_row_trail_and_state_reach_the_page_and_are_checked_in_plain_words(self):
        calls = [{'id': 'a', 'call': 'One.', 'why': 'Because.', 'state': 'changed', 'trail': self.TRAIL},
                 {'id': 'b', 'call': 'Two.', 'why': 'Because.', 'state': 'settled'}]
        s = spec_with(self.tmp, lambda r: r['steps'].append({**CALLS, 'fold_settled': True, 'calls': calls}))
        self.assertEqual(validate(s)[0], [])
        st = [x for x in deck_data(s, {})['steps'] if x['id'] == 'K-1'][0]
        self.assertEqual(st['calls'][0]['trail'], self.TRAIL)
        self.assertEqual([c.get('state') for c in st['calls']], ['changed', 'settled'])
        self.assertTrue(st['fold_settled'])
        def bad(**kw):
            return self.errs(lambda r: r['steps'].append({**CALLS, 'calls': [{'id': 'a', 'call': 'One.', 'why': 'Because.', **kw}]}))
        self.assertTrue(any('state is new, changed or settled' in x for x in bad(state='done')))
        self.assertTrue(any('trail step 1 needs at least one of asked' in x for x in bad(trail=[{'round': 'Round 3'}])))
        self.assertTrue(any('trail is a list of steps' in x for x in bad(trail='Round 3')))
        self.assertTrue(any('trail step 1: said is' in x and 'words (max' in x for x in bad(trail=[{'said': 'word ' * 61}])))
        self.assertTrue(any('trail step 1 has "when"' in x for x in bad(trail=[{'said': 'x', 'when': 'now'}])))
        e = self.errs(lambda r: r['steps'].append({**CALLS, 'fold_settled': 'yes'}))
        self.assertTrue(any('fold_settled is true or false' in x for x in e), e)

    def test_a_question_carries_a_state_and_a_trail(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'state': 'new', 'trail': self.TRAIL}))
        self.assertEqual(validate(s)[0], [])
        q = deck_data(s, {})['steps'][0]
        self.assertEqual((q['state'], q['trail']), ('new', self.TRAIL))
        self.assertTrue(any('Q-1: state is new, changed or settled' in x for x in self.errs(lambda r: r['steps'][0].update({'state': 'old'}))))

    def test_more_is_optional_but_a_run_or_skip_switch_must_explain_itself(self):
        row = lambda **kw: {'id': 'c', 'call': 'Check it.', 'why': 'Because.', **kw}
        def errs(r):
            return self.errs(lambda raw: raw['steps'].append({**CALLS, 'calls': [r]}))
        self.assertEqual(errs(row(more={'does': 'Opens it.', 'returns': 'A row.', 'why': 'Because.'})), [])
        self.assertEqual(errs(row(more='Just a plain explanation.')), [])
        self.assertEqual(errs(row(result='run', more={'does': 'Opens it.', 'why': 'Suggested on.'})), [])
        e = errs(row(result='run'))
        self.assertTrue(any('K-1/c: a check he switches on or off needs "more"' in x for x in e), e)
        e = errs(row(result='skip', more={'does': 'Opens it.'}))
        self.assertTrue(any('needs more.does and more.why' in x for x in e), e)
        e = errs(row(result='skip', more='A plain string has no why.'))
        self.assertTrue(any('needs more.does and more.why' in x for x in e), e)
        self.assertTrue(any('more has "because"' in x for x in errs(row(more={'does': 'x', 'because': 'y'}))))
        self.assertTrue(any('more.does is' in x and 'words (max 120)' in x for x in errs(row(more={'does': 'word ' * 121}))))
        s = spec_with(self.tmp, lambda raw: raw['steps'].append({**CALLS, 'calls': [row(result='run', more={'does': 'a', 'why': 'b'})]}))
        self.assertEqual([c['more'] for c in [x for x in deck_data(s, {})['steps'] if x['id'] == 'K-1'][0]['calls']], [{'does': 'a', 'why': 'b'}])

    def test_reuse_rides_on_an_option_a_row_and_a_picture_step(self):
        reuse = {'from': ['Settings About popup'], 'new': ['The star button'], 'note': 'Only the star is drawn new.'}
        def mut(r):
            r['steps'][0]['options'][0]['reuse'] = reuse
            r['steps'].append({**CALLS, 'calls': [{**CALLS['calls'][0], 'reuse': reuse}]})
        s = spec_with(self.tmp, mut)
        self.assertEqual(validate(s)[0], [])
        steps = {x['id']: x for x in deck_data(s, {})['steps']}
        self.assertEqual(steps['Q-1']['options'][0]['reuse'], reuse)
        self.assertEqual(steps['K-1']['calls'][0]['reuse'], reuse)
        # a picture step keeps it too (make_fixture's S-1 is a screenshot step)
        from fixture import make_fixture
        fx = make_fixture(tempfile.mkdtemp())
        with open(fx) as f:
            raw2 = json.load(f)
        raw2['steps'][0]['reuse'] = reuse
        with open(fx, 'w') as f:
            json.dump(raw2, f)
        s2 = load_spec(fx)
        self.assertEqual(validate(s2)[0], [])
        self.assertEqual(deck_data(s2, {})['steps'][0]['reuse'], reuse)
        for bad, msg in (({'from': 'popup'}, 'reuse.from is a short list'), ({'from': []}, 'reuse.from is a short list'),
                         ({'new': ['x'], 'extra': 1}, 'reuse is {'), ({'note': 'only a note'}, 'names at least one'), ('popup', 'reuse is {')):
            e = self.errs(lambda r, b=bad: r['steps'][0]['options'][0].update({'reuse': b}))
            self.assertTrue(any(msg in x for x in e), (bad, e))

    def test_related_decks_may_say_how_they_relate(self):
        def mut(r):
            r['related'] = [{'title': 'Round 6', 'path': os.path.basename(self.fixture_path()), 'how': 'Where you picked the trail.'}]
        s = spec_with(self.tmp, mut)
        self.assertEqual(validate(s)[0], [])
        self.assertEqual(deck_data(s, {})['related'][0]['how'], 'Where you picked the trail.')
        e = self.errs(lambda r: r.update({'related': [{'title': 'Round 6', 'path': os.path.basename(self.fixture_path()), 'how': ' '}]}))
        self.assertTrue(any('how is one plain line' in x for x in e), e)

    def fixture_path(self):
        return words_spec(self.tmp)

    def test_round_seven_trail_page_source_pins(self):
        js = open(os.path.join(DECK, 'page.js')).read()
        css = open(os.path.join(DECK, 'page.css')).read()
        # Round 8 (Destin, round 7: "VERYY busy… badges don't really make much sense… we don't use the
        # bare > dropdowns anywhere, nor the linked underline text"): groups, one fold, tiles.
        for needle in ('class="grph"', 'storyLines', 'moreLines', 'class="kindline"', 'vabout', 'class="since"', 'class="reltop"', 'reuseTip', 'class="atttile"', 'isVideo', 'STATE_GROUPS'):
            self.assertIn(needle, js, needle)
        # Round 9 (K-1): the Details fold is gone.
        for gone in ('stpill', 'metatog', 'sincepart', 'settledhead', 'attmarks', 'detailsFold', 'fold details'):
            self.assertNotIn(gone, js, gone)
            self.assertNotIn(gone, css, gone)
        self.assertRegex(css, r'\.atttile\{[^}]*width:224px')
        self.assertNotRegex(css, r'text-decoration:underline')

    def test_a_card_holds_one_kind_of_row(self):
        # Destin, round 8: "why is it the only row in this card that has the unclear/etc dropdown chip?"; round 9, K-1.
        row = lambda i, **kw: {'id': i, 'call': 'A thing.', 'why': 'A reason.', **kw}
        lst = lambda calls, **kw: {'id': 'L-9', 'words': True, 'surface': 'Decks', 'path': 'Rows', 'headline': 'A list', 'calls': calls, **kw}
        errs = lambda step: self.errs(lambda r: r['steps'].append(step))
        self.assertTrue(any('one kind of row' in x and 'b' in x for x in errs(lst([row('a', result='pass'), row('b')]))))
        self.assertTrue(any('for your information' in x for x in errs(lst([row('a', result='pass')], context=True))))
        self.assertFalse(any('one kind' in x for x in errs(lst([row('a', result='pass'), row('b', result='skip', more='Not needed here.')]))))
        self.assertFalse(any('one kind' in x for x in errs(lst([row('a'), row('b')]))))

    # ── the running screen behind a frozen one (round 7b) ───────────────────────────────────
    def test_live_screen_field_is_validated_in_plain_words(self):
        # Destin, 2026-11-10: "the dropdown menus in that about popup should probably still work" — a
        # screen step may name the app's own screen, which the served deck runs and freezes.
        scr = {k: v for k, v in CALLS.items() if k != 'calls'}
        def add(**kw):
            return lambda r: (r.update({'live': {'worktree': 'w'}}), r['steps'].append({**scr, **kw}))
        self.assertEqual(self.errs(add(liveScreen='settings/about')), [])           # live alone is fine
        e = self.errs(add(liveScreen='Settings About'))
        self.assertTrue(any('liveScreen is a screen name' in x and '"settings/about"' in x for x in e), e)
        e = self.errs(lambda r: r['steps'].append({**scr, 'liveScreen': 'settings/about'}))   # no live.worktree
        self.assertTrue(any('needs "live": {"worktree"' in x for x in e), e)

    def test_live_screen_reaches_the_page_and_ships_the_freeze_function(self):
        from deck.live import has_live
        scr = {k: v for k, v in CALLS.items() if k != 'calls'}
        s = spec_with(self.tmp, lambda r: (r.update({'live': {'worktree': 'w'}}), r['steps'].append({**scr, 'liveScreen': 'settings/about'})))
        self.assertTrue(has_live(s))   # so serve builds the practice app through the live-pane path
        d = deck_data(s, {})
        st = [x for x in d['steps'] if x['id'] == 'K-1'][0]
        self.assertEqual((st['kind'], st['screen'], st['liveScreen']), ('screen', '', 'settings/about'))
        self.assertIn('data-frozen', d['live']['freeze'])
        self.assertIn('document.styleSheets', d['live']['freeze'])
        # a deck with no live step carries no freeze function and starts no practice app
        plain = spec_with(self.tmp, lambda r: None)
        self.assertFalse(has_live(plain))
        self.assertNotIn('live', deck_data(plain, {}))

    def test_summary_prints_what_was_open_when_a_word_was_changed(self):
        spec = {'key': 'k', 'steps': [{'id': 'K-1'}]}
        edits = {'Pick a game': {'from': 'Pick a game', 'to': 'Choose a game', 'state': 'About, Your account (optional) open'},
                 '7': {'from': 'Start', 'to': 'Go'}}                                  # an old position-keyed edit still reads
        out = summary(spec, {'answers': {'K-1': {'v': 'other', 'edits': edits}}})
        self.assertIn('reword "Pick a game" → "Choose a game" — seen with: About, Your account (optional) open', out)
        self.assertIn('reword "Start" → "Go"\n', out + '\n')
        js = open(os.path.join(DECK, 'page.js')).read()
        self.assertIn("' — seen with: ' + t.state", js)   # page.js prints the same line in its own summary
        for needle in ('USER_STATE', 'data-entry-key', '.quick-chip', '.status-bar', 'editOf', 'liveframe', "'/app/probe.txt'"):
            self.assertIn(needle, js, needle)

    def _png(self, name, w, h):
        # A real, tiny PNG of the asked size (solid colour), written without any picture library.
        import struct, zlib
        def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        raw = b''.join(b'\x00' + b'\x80' * w for _ in range(h))
        data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
        os.makedirs(os.path.join(self.tmp, 'deck'), exist_ok=True)
        with open(os.path.join(self.tmp, 'deck', name), 'wb') as f:
            f.write(data)

    def test_a_very_wide_picture_gets_a_warning_not_a_refusal(self):
        # WHY (Destin, round 14): a 1400x85 strip is unreadable in its tile; the author is told to shoot a taller area.
        self._png('strip.png', 1400, 85); self._png('normal.png', 400, 300)
        def add(r):
            r['steps'].append({**CALLS, 'calls': [{**CALLS['calls'][0], 'picture': 'strip.png'}, {**CALLS['calls'][1], 'picture': 'normal.png'}]})
        errs, warns = validate(spec_with(self.tmp, add))
        self.assertEqual(errs, [])
        wide = [w for w in warns if 'strip.png' in w]
        self.assertEqual(len(wide), 1, warns)
        self.assertIn('shoot a taller area', wide[0])
        self.assertFalse(any('normal.png' in w for w in warns), warns)

    def test_a_wide_but_not_extreme_picture_gets_no_warning(self):
        self._png('banner.png', 1000, 250)   # ratio 4: cropped in its tile, but not worth a warning
        def add(r):
            r['steps'].append({**CALLS, 'calls': [{**CALLS['calls'][0], 'picture': 'banner.png'}, CALLS['calls'][1]]})
        self.assertFalse(any('banner.png' in w for w in validate(spec_with(self.tmp, add))[1]))

    def test_page_script_crops_wide_tiles_and_compacts_the_bars(self):
        # The page script and stylesheet carry the round-14 rules (behaviour is measured in deck-render.test.mjs).
        js = open(os.path.join(DECK, 'page.js')).read(); css = open(os.path.join(DECK, 'page.css')).read()
        self.assertIn("classList.toggle('wide'", js)
        self.assertIn('.tilepv.wide img{object-fit:cover;object-position:left top}', css)
        self.assertIn('id="stepsum"', open(os.path.join(DECK, 'page.html.tmpl')).read())


BUILT = {'id': 'A-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'What changed while building', 'list': 'changed-while-building',
         'calls': [{'id': 'b1', 'call': 'The board is five rows tall.', 'why': 'As drawn.', 'built': 'as planned'},
                   {'id': 'b2', 'call': 'A win plays no sound.', 'why': 'The sound clashed with music playing.', 'built': 'adjusted'}]}
FOUND = {'id': 'A-2', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Found in review', 'list': 'found-in-review',
         'calls': [{'id': 'f1', 'call': 'An empty name could be saved.', 'why': 'Fixed: it now asks for a name.'}]}
REVIEW = {'id': 'A-3', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Checks I ran',
          'calls': [{'id': 'c1', 'call': 'A fresh reviewer read the change.', 'why': 'Read every changed file.', 'result': 'pass', 'check': 'code-review'}]}


class AfterBuildLists(unittest.TestCase):
    """feature-flow step 5: an after-build deck carries "What changed while building" and, when the code review
    ran, "Found in review". Only an after-build deck is held to it."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def errs(self, *steps, **top):
        def m(r):
            r['steps'] = list(steps); r.update(top)
        return validate(spec_with(self.tmp, m))[0]

    def has(self, errs, text):
        self.assertTrue(any(text in e for e in errs), errs)

    def test_a_complete_after_build_deck_builds(self):
        self.assertEqual(self.errs(BUILT, REVIEW, FOUND, build='after'), [])

    def test_a_before_build_deck_is_not_held_to_it(self):
        self.assertEqual(self.errs(REVIEW, build='before'), [])
        self.assertEqual(self.errs(REVIEW), [])

    def test_missing_changed_while_building_is_refused(self):
        self.has(self.errs(FOUND, REVIEW, build='after'), 'What changed while building')

    def test_a_row_must_say_as_planned_or_adjusted(self):
        bad = dict(BUILT, calls=[{'id': 'b1', 'call': 'Five rows.', 'why': 'As drawn.'}])
        self.has(self.errs(bad, REVIEW, FOUND, build='after'), '"built": "as planned"')

    def test_an_adjusted_row_needs_a_reason(self):
        bad = dict(BUILT, calls=[{'id': 'b1', 'call': 'Five rows.', 'why': 'Ok.', 'built': 'adjusted'}])
        self.has(self.errs(bad, REVIEW, FOUND, build='after'), 'says why it was adjusted')

    def test_found_in_review_is_required_once_the_review_ran(self):
        self.has(self.errs(BUILT, REVIEW, build='after'), 'Found in review')

    def test_a_review_that_was_skipped_needs_no_found_list(self):
        skipped = dict(REVIEW, calls=[dict(REVIEW['calls'][0], result='skip', more={'does': 'Reads the change.', 'why': 'Not suggested here.'})])
        self.assertEqual(self.errs(BUILT, skipped, build='after'), [])

    def test_a_review_that_found_nothing_says_so_in_one_row(self):
        none = dict(FOUND, calls=[{'id': 'f0', 'call': 'The review found nothing.', 'why': 'It read every changed file.', 'none_found': True}])
        self.assertEqual(self.errs(BUILT, REVIEW, none, build='after'), [])
        both = dict(FOUND, calls=none['calls'] + FOUND['calls'])
        self.has(self.errs(BUILT, REVIEW, both, build='after'), 'none_found')

    def test_a_results_or_context_list_is_not_a_list_he_ticks(self):
        ctx = dict(BUILT, context=True)
        self.has(self.errs(ctx, build='after'), 'ticks or changes')

    def test_unknown_list_kind_and_build_value_are_refused(self):
        self.has(self.errs(dict(BUILT, list='other'), build='after'), 'list must be one of')
        self.has(self.errs(REVIEW, build='later'), 'build is "before" or "after"')

    def test_the_after_file_name_marks_it_too(self):
        p = words_spec(self.tmp)
        with open(p) as f: raw = json.load(f)
        raw['steps'] = [REVIEW]
        q = os.path.join(self.tmp, 'x.walkthrough.after.json')
        with open(q, 'w') as f: json.dump(raw, f)
        self.has(validate(load_spec(q))[0], 'What changed while building')


if __name__ == '__main__':
    unittest.main()
