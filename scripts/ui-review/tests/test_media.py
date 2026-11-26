"""Players with sound: `media` (and `mediaLayout`) on a words step — validation, what the page
gets, build's on-disk check, and serve's byte ranges (a player cannot seek without them).
Picture-free and binary-free (the "recordings" are a few bytes), so CI runs it.
WHY the feature: Destin, 2026-11-25 — "we should use the proper review deck format from now on.
dont create unique deck styling" — music and film had to be reviewed on hand-made pages."""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import words_spec                                   # noqa: E402
from deck.build import build_page, deck_data                     # noqa: E402
from deck.serve import byte_range, make_server                   # noqa: E402
from deck.spec import load_spec, media_type, validate            # noqa: E402

TWO = [{'label': 'Mix A', 'src': 'media/a.mp3'}, {'label': 'Mix B', 'src': 'media/b.mp3', 'summary': 'Adds strings.'}]


def spec_with(tmp, mutate, files=('media/a.mp3', 'media/b.mp3', 'media/cut.mp4', 'media/cut.png')):
    p = words_spec(tmp)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    for rel in files:
        full = os.path.join(os.path.dirname(p), rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'wb') as f:
            f.write(bytes(range(256)) * 4)   # 1024 bytes: enough for a range to mean something
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


def media_on(i, media, **extra):
    return lambda r: r['steps'][i].update({'media': media, **extra})


class MediaValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_a_question_with_two_mixes_is_fine(self):
        self.assertEqual(errs(spec_with(self.tmp, media_on(0, TWO))), [])

    def test_a_statement_and_a_yes_no_question_carry_media_too(self):
        s = spec_with(self.tmp, lambda r: [r['steps'][i].update({'media': TWO[:1]}) for i in (3, 4)])
        self.assertEqual(errs(s), [])

    def test_type_comes_from_the_extension(self):
        self.assertEqual([media_type(x) for x in ('a.MP3', 'b.m4a', 'c.mp4', 'd.webm', 'e.mov', 'f')],
                         ['audio', 'audio', 'video', 'video', None, None])

    def test_one_to_four_players(self):
        five = [{'label': f'Take {i}', 'src': 'media/a.mp3'} for i in range(5)]
        for bad in ([], five, 'media/a.mp3'):
            with self.subTest(media=bad):
                self.assertTrue(any('Q-1: media is a list of 1 to 4' in e for e in errs(spec_with(self.tmp, media_on(0, bad)))))

    def test_every_player_needs_a_label_and_labels_differ(self):
        e = errs(spec_with(self.tmp, media_on(0, [{'src': 'media/a.mp3'}, {'label': 'B', 'src': 'media/b.mp3'}, {'label': 'b', 'src': 'media/a.mp3'}])))
        self.assertTrue(any('media 1 needs a label' in x for x in e))
        self.assertTrue(any('label "b" is used twice' in x for x in e))

    def test_label_and_summary_obey_the_writing_rules(self):
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'The reducer mix', 'src': 'media/a.mp3', 'summary': 'A new component'}])))
        self.assertTrue(any('label uses banned word "reducer"' in x for x in e))
        self.assertTrue(any('summary uses banned word "component"' in x for x in e))
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'one two three four five six seven', 'src': 'media/a.mp3'}])))
        self.assertTrue(any('label is 7 words' in x for x in e))

    def test_src_stays_inside_the_spec_folder(self):
        for bad in ('/home/x/a.mp3', '../a.mp3', 'media/../../a.mp3', 'https://example.com/a.mp3', 'file:///a.mp3', 'media\\a.mp3'):
            with self.subTest(src=bad):
                e = errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': bad}])))
                self.assertTrue(any('must be a path relative to this spec' in x for x in e), e)

    def test_a_type_the_deck_cannot_play_is_refused(self):
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/a.mov'}])))
        self.assertTrue(any('not a recording the deck plays' in x and '.mov to .mp4' in x for x in e))

    def test_poster_is_for_video_only(self):
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/a.mp3', 'poster': 'media/cut.png'}])))
        self.assertTrue(any('poster is for a video' in x for x in e))
        self.assertEqual(errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/cut.mp4', 'poster': 'media/cut.png'}]))), [])
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/cut.mp4', 'poster': 'media/cut.gif'}])))
        self.assertTrue(any('poster must be' in x for x in e))

    def test_unknown_fields_on_a_player_are_refused(self):
        e = errs(spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/a.mp3', 'autoplay': True}])))
        self.assertTrue(any('carries only label, src, poster, summary (not autoplay)' in x for x in e))

    def test_layout_is_row_or_stack_and_needs_players(self):
        self.assertEqual(errs(spec_with(self.tmp, media_on(0, TWO, mediaLayout='row'))), [])
        self.assertTrue(any('mediaLayout must be' in x for x in errs(spec_with(self.tmp, media_on(0, TWO, mediaLayout='grid')))))
        self.assertTrue(any('this step has none' in x for x in errs(spec_with(self.tmp, lambda r: r['steps'][0].update({'mediaLayout': 'row'})))))

    def test_media_is_refused_off_a_words_step(self):
        # A picture step owns its stage; a contract or try-it slide is about something else.
        s = spec_with(self.tmp, lambda r: r.update(images='images/questions', runs={'today': 'runs/today'}, steps=[
            {'id': 'C-1', 'surface': 'Chat', 'path': 'Top', 'clip': {'today': 'x.webm'}, 'headline': 'Moves.',
             'changed': 'It slides.', 'notice': 'Smoother.', 'media': TWO}]))
        self.assertTrue(any('C-1: media rides on a words step' in x for x in errs(s)))
        s = spec_with(self.tmp, lambda r: r['steps'].append(
            {'id': 'T-1', 'words': True, 'surface': 'Chat', 'path': 'Top', 'headline': 'Does it work?',
             'changed': 'It runs.', 'notice': 'It opens.', 'dev': {'worktree': 'x'}, 'media': TWO}))
        self.assertTrue(any('T-1: media rides on a words step' in x for x in errs(s)))


class MediaPageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_the_page_gets_players_by_path_never_inlined(self):
        s = spec_with(self.tmp, media_on(0, TWO + [{'label': 'Cut', 'src': 'media/cut.mp4', 'poster': 'media/cut.png'}], mediaLayout='stack'))
        q1 = deck_data(s, {})['steps'][0]
        self.assertEqual(q1['media'], [
            {'label': 'Mix A', 'src': 'media/a.mp3', 'type': 'audio', 'poster': '', 'summary': ''},
            {'label': 'Mix B', 'src': 'media/b.mp3', 'type': 'audio', 'poster': '', 'summary': 'Adds strings.'},
            {'label': 'Cut', 'src': 'media/cut.mp4', 'type': 'video', 'poster': 'media/cut.png', 'summary': ''}])
        self.assertEqual(q1['mediaLayout'], 'stack')
        page, _ = build_page(s, {})
        self.assertIn('"src": "media/a.mp3"', page)
        self.assertNotIn('base64', page)

    def test_a_step_without_media_says_nothing_about_it(self):
        q1 = deck_data(load_spec(words_spec(self.tmp)), {})['steps'][0]
        self.assertNotIn('media', q1); self.assertNotIn('mediaLayout', q1)

    def test_a_question_deck_with_players_is_still_pages(self):
        s = spec_with(self.tmp, media_on(0, TWO))
        self.assertIn('pages', deck_data(s, {}))

    def test_build_refuses_a_missing_recording(self):
        s = spec_with(self.tmp, media_on(0, [{'label': 'A', 'src': 'media/gone.mp3'}]))
        with self.assertRaises(Exception) as cm:
            build_page(s, {})
        self.assertIn('Q-1: no recording at media/gone.mp3', str(cm.exception))

    def test_a_muted_clip_is_untouched(self):
        # The loop that already existed keeps its meaning: muted, looping, no sound controls added.
        with open(os.path.join(os.path.dirname(HERE), 'deck', 'page.js')) as f:
            js = f.read()
        self.assertIn('muted loop playsinline controls preload="auto"', js)


class RangeTests(unittest.TestCase):
    def test_byte_range_shapes(self):
        self.assertEqual(byte_range('bytes=0-', 100), (0, 99))
        self.assertEqual(byte_range('bytes=10-19', 100), (10, 19))
        self.assertEqual(byte_range('bytes=90-500', 100), (90, 99))
        self.assertEqual(byte_range('bytes=-10', 100), (90, 99))
        self.assertIsNone(byte_range(None, 100)); self.assertIsNone(byte_range('items=0-1', 100))
        self.assertEqual(byte_range('bytes=100-', 100), 'bad')

    def test_serve_answers_a_range_so_the_player_can_seek(self):
        tmp = tempfile.mkdtemp()
        s = spec_with(tmp, media_on(0, TWO))
        srv, url = make_server(s, 0, lambda state: None)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            base = url.rsplit('/', 1)[0]
            r = urllib.request.urlopen(urllib.request.Request(base + '/media/a.mp3', headers={'Range': 'bytes=256-511'}), timeout=5)
            self.assertEqual(r.status, 206)
            self.assertEqual(r.headers['content-range'], 'bytes 256-511/1024')
            self.assertEqual(r.headers['content-type'], 'audio/mpeg')
            self.assertEqual(r.read(), bytes(range(256)))
            r = urllib.request.urlopen(base + '/media/cut.mp4', timeout=5)
            self.assertEqual((r.status, r.headers['accept-ranges'], len(r.read())), (200, 'bytes', 1024))
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(urllib.request.Request(base + '/media/a.mp3', headers={'Range': 'bytes=5000-'}), timeout=5)
            self.assertEqual(cm.exception.code, 416); cm.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(base + '/media/missing.mp3', timeout=5)
            self.assertEqual(cm.exception.code, 404); cm.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as cm:   # never outside the spec's folder
                urllib.request.urlopen(base + '/../../etc/x.mp3', timeout=5)
            self.assertEqual(cm.exception.code, 404); cm.exception.close()
        finally:
            srv.shutdown(); srv.server_close()


if __name__ == '__main__':
    unittest.main()
