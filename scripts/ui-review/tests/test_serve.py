import json, os, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec
from deck.serve import answers_path, make_server, serve, summary, wait_for_submit, write_atomic

def post(url, obj):
    req = urllib.request.Request(url, data=json.dumps(obj).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req, timeout=5).read())

class ServeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp))
        open(os.path.join(self.spec['_base'], 'fixture.html'), 'w').write('<p>deck</p>')
    def test_round_trip_and_submit_stops_the_server(self):
        got = {}
        srv, url = make_server(self.spec, 0, lambda state: got.update(state) or threading.Thread(target=srv.shutdown, daemon=True).start())
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        base = url.rsplit('/', 1)[0]
        self.assertEqual(json.loads(urllib.request.urlopen(base + '/answers', timeout=5).read()), {})
        self.assertIn(b'deck', urllib.request.urlopen(url, timeout=5).read())
        post(base + '/answers', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}}})
        self.assertEqual(json.load(open(answers_path(self.spec)))['answers']['S-1']['v'], 'yes')
        self.assertFalse(os.path.exists(answers_path(self.spec) + '.tmp'))
        post(base + '/submit', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'other', 'note': 'bigger'}}})
        t.join(5); self.assertFalse(t.is_alive())
        self.assertTrue(got['submitted']); self.assertTrue(json.load(open(answers_path(self.spec)))['submitted'])
        srv.server_close()   # shutdown() stops serve_forever but leaves the listening socket open — unclosed, it is what the suite warns about at exit
    def test_summary_format(self):
        state = {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'other', 'note': ' bigger '}}}
        s = summary(self.spec, state).split('\n')
        self.assertEqual(s[0], 'fixture · submitted 2026-08-27 18:40 · 1 yes · 0 no · 1 other · 1 skipped')
        self.assertEqual(s[1:], ['S-1 yes', 'S-2 other — "bigger"', 'S-3 skip'])
    def test_serve_returns_0_on_submit_and_prints_summary(self):
        out = []; result = {}
        def run(): result['code'] = serve(self.spec, port=0, open_browser=False, timeout_min=1, log=out.append)
        t = threading.Thread(target=run, daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
        post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}})
        t.join(5); self.assertEqual(result['code'], 0); self.assertTrue(any('3 skipped' in l for l in out))
        self.assertFalse(os.path.exists(os.path.join(self.spec['_base'], 'deck.serve.json')))
    def test_second_serve_of_same_spec_refuses(self):
        json.dump({'pid': os.getpid(), 'url': 'http://127.0.0.1:1/x'}, open(os.path.join(self.spec['_base'], 'deck.serve.json'), 'w'))
        out = []; self.assertEqual(serve(self.spec, port=0, open_browser=False, timeout_min=1, log=out.append), 3); self.assertTrue(any('REFUSING' in l for l in out))
    def test_live_lock_owned_by_someone_else_still_refuses(self):
        # pid 1 is init — alive, not ours, so os.kill(1, 0) raises PermissionError for a
        # normal user (or succeeds for root, in which case the lock is just "alive" too).
        json.dump({'pid': 1, 'url': 'http://127.0.0.1:1/x'}, open(os.path.join(self.spec['_base'], 'deck.serve.json'), 'w'))
        out = []
        self.assertEqual(serve(self.spec, port=0, open_browser=False, timeout_min=1, log=out.append), 3)
        self.assertTrue(any('REFUSING' in l for l in out))
    def test_bad_json_post_gets_a_400(self):
        srv, url = make_server(self.spec, 0, lambda state: None)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            base = url.rsplit('/', 1)[0]
            req = urllib.request.Request(base + '/answers', data=b'not json', headers={'content-type': 'application/json'}, method='POST')
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(req, timeout=5)
            self.assertEqual(cm.exception.code, 400)
            self.assertFalse(os.path.exists(answers_path(self.spec)))
        finally:
            srv.shutdown(); srv.server_close()
    def test_a_foreign_origin_or_host_is_refused(self):
        # WHY: the server has no authentication, so the only thing separating Destin's browser
        # from a page on evil.example is that the browser tells us where the request came from.
        srv, url = make_server(self.spec, 0, lambda state: None)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            base = url.rsplit('/', 1)[0]
            req = urllib.request.Request(base + '/submit', data=json.dumps({'answers': {}}).encode(),
                                         headers={'content-type': 'application/json', 'origin': 'http://evil.example'}, method='POST')
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(req, timeout=5)
            self.assertEqual(cm.exception.code, 403)
            self.assertFalse(os.path.exists(answers_path(self.spec)))   # a forged submit writes nothing
            g = urllib.request.Request(base + '/answers', headers={'host': 'evil.example'})
            with self.assertRaises(urllib.error.HTTPError) as cm2:
                urllib.request.urlopen(g, timeout=5)
            self.assertEqual(cm2.exception.code, 403)
        finally:
            srv.shutdown(); srv.server_close()

    def test_write_atomic(self):
        p = os.path.join(self.tmp, 'a.json'); write_atomic(p, {'x': 1}); self.assertEqual(json.load(open(p)), {'x': 1})
    def test_wait_returns_0_when_the_file_says_submitted_and_2_on_timeout(self):
        out = []
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)   # ~0.12 s, no file
        write_atomic(answers_path(self.spec), {'answers': {'S-1': {'v': 'yes'}}})                           # saved, not submitted
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)
        write_atomic(answers_path(self.spec), {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}}})
        out.clear(); self.assertEqual(wait_for_submit(self.spec, timeout_min=1, poll_s=0.05, log=out.append), 0)
        self.assertTrue(any('1 yes' in l and '2 skipped' in l for l in out))

if __name__ == '__main__': unittest.main()
