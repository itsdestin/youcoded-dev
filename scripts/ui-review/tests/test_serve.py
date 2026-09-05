import json, os, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
from unittest import mock
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec
from deck.serve import answers_path, make_server, rotate_submitted, serve, summary, wait_for_submit, write_atomic

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
    def test_root_is_the_deck_and_folders_never_list(self):
        srv, url = make_server(self.spec, 0, lambda state: None)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            base = url.rsplit('/', 1)[0]
            r = urllib.request.urlopen(base + '/', timeout=5)                       # the bare port lands on the deck
            self.assertEqual(r.geturl(), url); self.assertIn(b'deck', r.read())
            r = urllib.request.urlopen(base + '/?step=2', timeout=5); self.assertEqual(r.geturl(), url + '?step=2')
            os.makedirs(os.path.join(self.spec['_base'], 'images'), exist_ok=True)
            with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(base + '/images/', timeout=5)
            self.assertEqual(cm.exception.code, 404)                                 # no folder listing, ever
        finally:
            srv.shutdown(); srv.server_close()
    def test_summary_names_the_pick(self):
        self.spec['steps'].append({'id': 'C-1', 'surface': 'Home', 'path': 'Chat', 'headline': 'Which?', 'variants': [{'id': 'A', 'label': 'a', 'crop': 'c', 'summary': 'x'}, {'id': 'B', 'label': 'b', 'crop': 'c', 'summary': 'y'}]})
        s = summary(self.spec, {'submitted': '2026-08-27T18:40:00Z', 'answers': {'C-1': {'v': 'pick', 'pick': 'B', 'note': 'bigger'}}}).split('\n')
        self.assertIn('1 picked', s[0]); self.assertEqual(s[-1], 'C-1 pick B — "bigger"')
        s = summary(self.spec, {'answers': {'C-1': {'v': 'no'}}}).split('\n'); self.assertEqual(s[-1], 'C-1 none')
    def test_summary_format(self):
        state = {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'other', 'note': ' bigger '}}}
        s = summary(self.spec, state).split('\n')
        self.assertEqual(s[0], 'fixture · submitted 2026-08-27 18:40 · 1 yes · 0 no · 1 other · 1 skipped')
        self.assertEqual(s[1:], ['S-1 yes', 'S-2 other — "bigger"', 'S-3 skip'])
    def test_serve_returns_0_on_submit_and_prints_summary(self):
        out = []; result = {}
        def run(): result['code'] = serve(self.spec, port=0, timeout_min=1, log=out.append)
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
        out = []; self.assertEqual(serve(self.spec, port=0, timeout_min=1, log=out.append), 3); self.assertTrue(any('REFUSING' in l for l in out))
    def test_live_lock_owned_by_someone_else_still_refuses(self):
        # pid 1 is init — alive, not ours, so os.kill(1, 0) raises PermissionError for a
        # normal user (or succeeds for root, in which case the lock is just "alive" too).
        json.dump({'pid': 1, 'url': 'http://127.0.0.1:1/x'}, open(os.path.join(self.spec['_base'], 'deck.serve.json'), 'w'))
        out = []
        self.assertEqual(serve(self.spec, port=0, timeout_min=1, log=out.append), 3)
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
    def test_a_submitted_answers_file_is_kept_aside_and_the_review_starts_fresh(self):
        # Re-serving a deck after its submit must not load the old file: the page would see `submitted` and lock every control.
        self.assertIsNone(rotate_submitted(self.spec, log=lambda *a: None))                                   # no file: nothing to do
        write_atomic(answers_path(self.spec), {'answers': {'S-1': {'v': 'yes'}}})
        self.assertIsNone(rotate_submitted(self.spec, log=lambda *a: None))                                   # saved but not submitted: keep going
        self.assertTrue(os.path.exists(answers_path(self.spec)))
        write_atomic(answers_path(self.spec), {'submitted': '2026-08-27T10:10:30.568Z', 'answers': {'S-1': {'v': 'yes'}}})
        out = []; dest = rotate_submitted(self.spec, log=out.append)
        self.assertEqual(os.path.basename(dest), 'deck.answers.202608271010.json'); self.assertTrue(os.path.exists(dest))
        self.assertFalse(os.path.exists(answers_path(self.spec))); self.assertTrue(any('starting a fresh one' in l for l in out))
        # and serve() does it before it starts (the lock check in test_second_serve_of_same_spec_refuses runs first)
        write_atomic(answers_path(self.spec), {'submitted': '2026-08-27T11:00:00Z', 'answers': {}})
        result = {}
        def run(): result['code'] = serve(self.spec, port=0, timeout_min=1, log=out.append)
        t = threading.Thread(target=run, daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        self.assertFalse(os.path.exists(answers_path(self.spec))); self.assertTrue(os.path.exists(os.path.join(self.spec['_base'], 'deck.answers.202608271100.json')))
        url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
        post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}}); t.join(5); self.assertEqual(result['code'], 0)
    def test_wait_returns_0_when_the_file_says_submitted_and_2_on_timeout(self):
        out = []
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)   # ~0.12 s, no file
        write_atomic(answers_path(self.spec), {'answers': {'S-1': {'v': 'yes'}}})                           # saved, not submitted
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)
        write_atomic(answers_path(self.spec), {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}}})
        out.clear(); self.assertEqual(wait_for_submit(self.spec, timeout_min=1, poll_s=0.05, log=out.append), 0)
        self.assertTrue(any('1 yes' in l and '2 skipped' in l for l in out))
    def test_serve_never_opens_a_browser(self):
        # WHY: Destin's instruction (2026-09-05) is that a session puts the printed link in
        # chat instead of a model auto-launching a browser window on his desktop. Patching
        # both the process-spawn route (xdg-open/open) and the stdlib fallback (webbrowser)
        # to explode proves neither is reachable from serve() any more — a regression here
        # would raise inside the thread below instead of quietly reopening a window.
        def boom(*a, **k):
            raise AssertionError('a deck must not open a browser')
        out = []; result = {}
        def run(): result['code'] = serve(self.spec, port=0, timeout_min=1, log=out.append)
        with mock.patch('subprocess.Popen', side_effect=boom), mock.patch('webbrowser.open', side_effect=boom):
            t = threading.Thread(target=run, daemon=True); t.start()
            for _ in range(50):
                if any(l.startswith('[deck] http') for l in out): break
                time.sleep(0.1)
            url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
            post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}})
            t.join(5)
        self.assertEqual(result['code'], 0)

if __name__ == '__main__': unittest.main()


class RecordTests(unittest.TestCase):
    """`record`: the copy box's summary, pasted back, becomes the submitted answers file."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp))
        from deck.serve import parse_pasted, record
        self.parse, self.record = parse_pasted, record
    def test_one_line_paste_reads_the_same_as_one_per_line(self):
        ids = [st['id'] for st in self.spec['steps']]
        lines = f'fixture · not submitted · 1 yes · 0 no · 1 other · 0 skipped\n{ids[0]} yes\n{ids[1]} other — "make it bigger" [fix later]'
        flat = lines.replace('\n', ' ')                       # what a chat paste did on 2026-09-04
        a, pa = self.parse(self.spec, lines); b, pb = self.parse(self.spec, flat)
        self.assertEqual(pa, []); self.assertEqual(pb, []); self.assertEqual(a, b)
        self.assertEqual(a['answers'][ids[0]], {'v': 'yes'})
        # A leftover [fix later] from a deck written before 2026-09-05 parses and is dropped —
        # the tags are gone (Destin), and an old paste must still record rather than refuse.
        self.assertEqual(a['answers'][ids[1]], {'v': 'other', 'note': 'make it bigger'})
    def test_pick_must_name_a_real_option_and_unknown_words_refuse(self):
        ids = [st['id'] for st in self.spec['steps']]
        _, problems = self.parse(self.spec, f'{ids[0]} maybe')
        self.assertTrue(problems and ids[0] in problems[0])
        _, problems = self.parse(self.spec, 'nothing here at all')
        self.assertTrue(problems and 'no step answers' in problems[0])
    def test_record_writes_a_submitted_file_and_keeps_an_earlier_one(self):
        ids = [st['id'] for st in self.spec['steps']]
        write_atomic(answers_path(self.spec), {'answers': {ids[0]: {'v': 'no'}}, 'submitted': '2026-09-01T10:00:00Z'})
        logs = []
        self.assertEqual(self.record(self.spec, f'{ids[0]} yes {ids[1]} skip', log=logs.append), 0)
        got = json.load(open(answers_path(self.spec)))
        self.assertTrue(got['submitted']); self.assertEqual(got['answers'], {ids[0]: {'v': 'yes'}})   # skip is absent, as the page leaves it
        self.assertTrue(any(f.startswith(self.spec['_stem'] + '.answers.2026') for f in os.listdir(self.spec['_base'])))   # the old submit is history, not overwritten
        self.assertEqual(self.record(self.spec, f'{ids[0]} pick zz', log=logs.append), 1)                  # a refused paste writes nothing new
        self.assertIn('refused', ''.join(logs))
