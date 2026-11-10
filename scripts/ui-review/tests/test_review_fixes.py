"""Pins for the defects three reviews found in the deck tool (2026-11-10): concurrent saves,
malformed bodies, bad Content-Length, frozen-screen safety, JSON embedded in the page, the voice
watchdog, archive names, attachment caps, and symlinks out of the deck folder."""
import json, os, socket, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec, live_code_in
from deck import serve as S
from deck.build import embed_json


def raw(port, request):
    """One raw HTTP exchange, so a bad header can be sent exactly as written."""
    c = socket.create_connection(('127.0.0.1', port), timeout=3); c.sendall(request); c.shutdown(socket.SHUT_WR)
    out = b''
    try:
        while True:
            d = c.recv(65536)
            if not d: break
            out += d
    except socket.timeout:
        pass
    c.close(); return out


class Running:
    def __enter__(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp))
        open(os.path.join(self.spec['_base'], 'fixture.html'), 'w').write('<p>deck</p>')
        self.srv, self.url = S.make_server(self.spec, 0, lambda st: None)
        self.port = self.srv.server_address[1]; self.base = f'http://127.0.0.1:{self.port}'
        threading.Thread(target=self.srv.serve_forever, daemon=True).start(); return self
    def post(self, path, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, headers={'content-type': ctype}, method='POST')
        try:
            r = urllib.request.urlopen(req, timeout=5); return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}')
    def __exit__(self, *a):
        self.srv.shutdown(); self.srv.server_close()


class ServerFixes(unittest.TestCase):
    def test_overlapping_saves_all_get_a_reply_and_leave_a_whole_file(self):
        with Running() as r:
            big = {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes', 'note': 'x' * 200000}}}
            codes = []
            def hit():
                for _ in range(8):
                    try: codes.append(r.post('/answers', big)[0])
                    except Exception as e: codes.append(repr(e))
            ts = [threading.Thread(target=hit) for _ in range(6)]
            [t.start() for t in ts]; [t.join() for t in ts]
            self.assertEqual(set(codes), {200}, codes[:5])
            self.assertEqual(json.load(open(S.answers_path(r.spec)))['answers']['S-1']['v'], 'yes')
            self.assertEqual([f for f in os.listdir(r.spec['_base']) if f.endswith('.tmp')], [])
    def test_a_late_autosave_never_removes_submitted(self):
        with Running() as r:
            st = {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}}}
            r.post('/submit', dict(st))
            code, _ = r.post('/answers', dict(st))   # a stale tab autosaving afterwards
            self.assertEqual(code, 200)
            self.assertTrue(json.load(open(S.answers_path(r.spec))).get('submitted'))
    def test_bodies_that_are_not_objects_get_a_400(self):
        with Running() as r:
            for path in ('/answers', '/submit', '/voice'):
                for body in (b'5', b'[1]', b'"x"', b'null'):
                    self.assertEqual(r.post(path, body)[0], 400, (path, body))
            self.assertFalse(os.path.exists(S.answers_path(r.spec)))
    def test_a_bad_content_length_is_refused_not_hung(self):
        with Running() as r:
            for cl in (b'-1', b'abc'):
                out = raw(r.port, b'POST /attach HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nContent-Type: image/png\r\nContent-Length: %s\r\n\r\n' % (r.port, cl))
                self.assertIn(b' 400 ', out.split(b'\r\n')[0], out[:80])
    def test_attachment_count_is_capped(self):
        with Running() as r:
            folder = os.path.join(r.spec['_base'], r.spec['_stem'] + '.attachments'); os.makedirs(folder)
            for i in range(S.ATTACH_COUNT_MAX): open(os.path.join(folder, f'{i}.png'), 'wb').write(b'x')
            code, body = r.post('/attach', b'\x89PNG\r\n\x1a\n' + b'0' * 20, 'image/png')
            self.assertEqual(code, 413); self.assertIn('no more', body['error'])
    def test_a_symlink_out_of_the_deck_folder_is_not_served(self):
        with Running() as r:
            outside = os.path.join(tempfile.mkdtemp(), 'secret.txt'); open(outside, 'w').write('secret')
            os.symlink(outside, os.path.join(r.spec['_base'], 'link.txt'))
            with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(r.base + '/link.txt', timeout=3)
            self.assertEqual(cm.exception.code, 404)
            self.assertIn(b'deck', urllib.request.urlopen(r.url, timeout=3).read())   # a normal file still serves
    def test_rotate_submitted_never_overwrites_within_a_minute(self):
        tmp = tempfile.mkdtemp(); spec = load_spec(make_fixture(tmp)); made = []
        for _ in range(3):
            S.write_atomic(S.answers_path(spec), {'deck': 'fixture', 'answers': {}, 'submitted': '2026-11-10T10:00:00Z'})
            made.append(S.rotate_submitted(spec, log=lambda *_: None))
        self.assertEqual(len(set(made)), 3); self.assertTrue(all(os.path.exists(m) for m in made))
    def test_close_stops_the_voice_helper_and_cancels_first(self):
        sent = []
        class P:
            def poll(self): return None
            def terminate(self): sent.append('terminate')
            class stdin:
                @staticmethod
                def write(x): sent.append(x.strip())
                @staticmethod
                def flush(): pass
        v = S.VoiceBridge(); v.proc = P(); v.close()
        self.assertEqual(sent, ['cancel', 'terminate'])
    def test_a_recording_whose_page_went_away_is_cancelled(self):
        sent = []
        class P:
            def poll(self): return None
            class stdin:
                @staticmethod
                def write(x): sent.append(x.strip())
                @staticmethod
                def flush(): pass
        v = S.VoiceBridge(); v.VOICE_QUIET_S = 0.3; v.proc = P(); v.state['status'] = 'recording'; v.last_seen = time.monotonic()
        try:
            for _ in range(40):
                if v.state['status'] == 'idle': break
                time.sleep(0.1)
            self.assertEqual(v.state['status'], 'idle'); self.assertIn('cancel', sent)
        finally:
            v.stopping = True
    def test_an_error_from_the_helper_also_cancels_it(self):
        sent = []
        class P:
            stdout = iter([json.dumps({'type': 'error', 'message': 'boom'}) + '\n'])
            def poll(self): return None
            class stdin:
                @staticmethod
                def write(x): sent.append(x.strip())
                @staticmethod
                def flush(): pass
        v = S.VoiceBridge(); v.stopping = True; p = P(); v.proc = p; v._read(p)
        self.assertIn('cancel', sent)


class EmbeddedJson(unittest.TestCase):
    def test_a_comment_opener_and_script_tag_cannot_break_out(self):
        blob = embed_json({'headline': '<!-- <script> </script> <\/x'})
        self.assertNotIn('<', blob); self.assertEqual(json.loads(blob)['headline'], '<!-- <script> </script> <\/x')


class FrozenScreens(unittest.TestCase):
    def check(self, html):
        return live_code_in('<html data-frozen="1x1"><body>' + html + '</body></html>')
    def test_validator_rejects_what_can_run_or_load(self):
        for bad in ('<script>1</script>', '<a onclick="x()">', '<a href="javascript:x">', '<meta http-equiv="refresh" content="0">',
                    '<object data=x></object>', '<embed src=x>', '<style>@import url(http://x/a.css);</style>', '<iframe src=x></iframe>'):
            self.assertTrue(self.check(bad), bad)
        self.assertEqual(self.check('<p>on click = fine in words</p><style>a{color:red}</style>'), '')
    def test_the_screens_already_saved_with_the_deck_still_pass(self):
        d = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'docs', 'active', 'design', '2026-11-09-review-deck-rethink', 'screens')
        if not os.path.isdir(d): self.skipTest('no saved screens here')
        for f in os.listdir(d):
            if f.endswith('.html'): self.assertEqual(live_code_in(open(os.path.join(d, f), encoding='utf-8').read()), '', f)


if __name__ == '__main__':
    unittest.main()
