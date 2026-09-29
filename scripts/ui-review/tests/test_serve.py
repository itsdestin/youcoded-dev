import json, os, re, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
from unittest import mock
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture, live_spec
from deck.spec import load_spec
from deck.serve import answers_path, build_app, make_server, preferred_ports, rewrite_stale_live, rotate_submitted, serve, summary, wait_for_submit, write_atomic

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
    def _serve_once(self):
        """Serve the fixture, submit at once, return the address it printed."""
        out = []
        t = threading.Thread(target=lambda: serve(self.spec, port=0, timeout_min=1, log=out.append), daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
        post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}})
        t.join(5)
        return url
    def test_a_deck_comes_back_on_the_same_address(self):
        # The browser keeps its backup of the answers per address; a new address per serve hid it.
        first = self._serve_once(); second = self._serve_once()
        self.assertEqual(first, second)
        self.assertIn(int(first.split(':')[2].split('/')[0]), preferred_ports(self.spec)[:1])
    def test_a_busy_home_port_moves_to_the_next_and_is_remembered(self):
        import socket
        home = preferred_ports(self.spec)[0]
        blocker = socket.socket(); blocker.bind(('127.0.0.1', home)); blocker.listen(1)
        try:
            url = self._serve_once()
            port = int(url.split(':')[2].split('/')[0])
            self.assertNotEqual(port, home)
            self.assertEqual(preferred_ports(self.spec)[0], port)   # remembered: the next serve tries it first
        finally:
            blocker.close()
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
    def test_a_stale_page_cannot_drop_saved_answers(self):
        # A deck page left open across a server restart posts ITS state; if that is older than the
        # file it must be refused, never written — the accident that erased site edits on 2026-09-10.
        srv, url = make_server(self.spec, 0, lambda state: None)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            base = url.rsplit('/', 1)[0]
            post(base + '/answers', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'no'}}})
            with self.assertRaises(urllib.error.HTTPError) as cm:
                post(base + '/answers', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}}})   # a page that never saw S-2
            self.assertEqual(cm.exception.code, 409); self.assertIn(b'S-2', cm.exception.read())
            self.assertEqual(json.load(open(answers_path(self.spec)))['answers']['S-2']['v'], 'no')   # untouched
            with self.assertRaises(urllib.error.HTTPError) as cm:                                    # submit is held to the same rule
                post(base + '/submit', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}}})
            self.assertEqual(cm.exception.code, 409); self.assertNotIn('submitted', json.load(open(answers_path(self.spec))))
            # Changing an answer, adding one, or clearing one to an EMPTY entry are all still writes.
            post(base + '/answers', {'deck': 'fixture', 'answers': {'S-1': {'v': 'other'}, 'S-2': {'v': 'no'}, 'S-3': {'v': 'x'}}})
            self.assertEqual(json.load(open(answers_path(self.spec)))['answers']['S-1']['v'], 'other')
        finally:
            srv.shutdown(); srv.server_close()
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


class StaleLiveRewriteTests(unittest.TestCase):
    """A page built before 2026-09-26 bakes its pane addresses as `<live.base>/?…` — the
    workbench's fixed port, which this deck no longer starts. Every page built since then
    addresses its panes as `/app/index.html?…` instead (whether or not `live.base` is set — a
    base only changes the ORIGIN a pane is prefixed with, never the path), so that is what
    tells an old page apart from a new one, not the shape of `live.base` alone (an explicit
    test stub can share the exact `http://127.0.0.1:<port>` shape the old fixed port had)."""

    def _page(self, base, path):
        deck = {
            'live': {'base': base, 'worktree': 'live-tree',
                     **({'command': 'bash scripts/run-workbench.sh live-tree'} if base else {})},
            'steps': [{'id': 'L-1', 'kind': 'live', 'panes': [
                {'id': 'a', 'url': f'{base}{path}?mode=workbench&child=1&view=live&surface=s&round=1&candidate=c&theme=midnight'},
            ]}],
        }
        return 'PREFIX<script>const DECK=' + json.dumps(deck).replace('</', '<\\/') + ';</script>SUFFIX'

    def _old_page(self, base='http://127.0.0.1:5513'):
        return self._page(base, '/')   # the shape serve.py used to bake: <fixed workbench origin>/?…

    def test_an_old_page_is_rewritten_onto_this_decks_own_app(self):
        html = self._old_page()
        out = []
        fixed = rewrite_stale_live(html, log=out.append)
        self.assertNotEqual(fixed, html)
        self.assertTrue(any('rewritten' in l for l in out), out)
        blob = json.loads(re.search(r'const DECK=(\{.*?\});', fixed, re.S).group(1).replace('<\\/', '</'))
        self.assertEqual(blob['live']['base'], '')
        self.assertNotIn('command', blob['live'])
        self.assertEqual(blob['steps'][0]['panes'][0]['url'],
                         '/app/index.html?mode=workbench&child=1&view=live&surface=s&round=1&candidate=c&theme=midnight')
        self.assertTrue(fixed.startswith('PREFIX') and fixed.endswith('SUFFIX'), 'only the DECK blob changed')

    def test_a_page_already_addressing_this_decks_own_app_is_left_alone(self):
        # The DEFAULT shape every page has built since 2026-09-26: relative, no live.base at all.
        html = self._page('', '/app/index.html')
        self.assertEqual(rewrite_stale_live(html, log=lambda m: (_ for _ in ()).throw(AssertionError('should not log'))), html)

    def test_an_explicit_test_stub_base_is_left_alone_when_it_already_addresses_app(self):
        # A NEW page can also carry an explicit live.base (a test fixture) — its pane still
        # addresses /app/index.html at that origin, and that is the signal that leaves it alone,
        # never the shape of live.base (which an old page and this one can share exactly).
        html = self._page('http://127.0.0.1:41234', '/app/index.html')
        self.assertEqual(rewrite_stale_live(html, log=lambda m: (_ for _ in ()).throw(AssertionError('should not log'))), html)

    def test_a_page_with_no_live_panes_is_left_alone(self):
        html = 'PREFIX<script>const DECK=' + json.dumps({'steps': [{'id': 'S-1'}]}) + ';</script>SUFFIX'
        self.assertEqual(rewrite_stale_live(html, log=lambda m: (_ for _ in ()).throw(AssertionError('should not log'))), html)

    def test_serve_rewrites_an_old_page_on_disk_once_at_start(self):
        tmp = tempfile.mkdtemp()
        spec = load_spec(make_fixture(tmp))
        with open(os.path.join(spec['_base'], spec['out']), 'w') as f:
            f.write(self._old_page())
        out = []
        result = {}
        def run(): result['code'] = serve(spec, port=0, timeout_min=1, log=out.append, live=False)
        t = threading.Thread(target=run, daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
        post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}})
        t.join(5)
        self.assertTrue(any('rewritten onto' in l for l in out), out)
        with open(os.path.join(spec['_base'], spec['out'])) as f:
            self.assertIn('/app/index.html?', f.read())


class AppServingTests(unittest.TestCase):
    """The deck serves the practice app it builds, at /app/*, from its own address — no fixed
    port, no separate process to start or restart alongside the deck (spec: docs/active/specs/
    2026-09-24-shoot-and-explore.md → "Review decks")."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def _live_spec_for_this_worktree(self):
        # This worktree IS a real checkout with desktop/ — resolve_worktree finds it by its own
        # session name, so build_app runs the REAL scripts/shoot/build.mjs (cached: near-instant
        # when nothing changed, which is the case here).
        return load_spec(live_spec(self.tmp, live={'worktree': 'ui-review-infra'}))

    def test_a_served_deck_answers_app_index_and_an_asset_with_the_right_type(self):
        spec = self._live_spec_for_this_worktree()
        dist = build_app(spec, log=lambda m: None)
        asset = next(f for f in os.listdir(os.path.join(dist, 'assets')) if f.endswith('.js'))
        out = []
        result = {}
        def run(): result['code'] = serve(spec, port=0, timeout_min=1, log=out.append)
        t = threading.Thread(target=run, daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        base = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1].rsplit('/', 1)[0]
        try:
            r = urllib.request.urlopen(base + '/app/index.html', timeout=10)
            self.assertEqual(r.status, 200)
            self.assertIn('text/html', r.headers.get('content-type'))
            self.assertIn(b'<html', r.read()[:200].lower())
            r2 = urllib.request.urlopen(base + '/app/assets/' + asset, timeout=10)
            self.assertEqual(r2.status, 200)
            self.assertEqual(r2.headers.get('content-type'), 'text/javascript')
            # The SPA fallback: a workbench route with nothing on disk but index.html.
            r3 = urllib.request.urlopen(base + '/app/?view=live&surface=s&round=1&candidate=c', timeout=10)
            self.assertIn(b'<html', r3.read()[:200].lower())
        finally:
            post(base + '/submit', {'deck': 'live-fixture', 'answers': {}})
            t.join(10)

    def test_no_live_never_builds_or_serves_app(self):
        # `--no-live`: a spec whose panes point at a server of their own (an explicit live.base)
        # has nothing here to build — /app/* must fall through untouched, never a 503.
        spec = load_spec(live_spec(self.tmp, base='http://127.0.0.1:1'))   # nothing listens here
        with mock.patch('subprocess.run', side_effect=AssertionError('--no-live must never build')):
            srv, url = make_server(spec, 0, lambda state: None, serve_app=False)
            t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
            try:
                base = url.rsplit('/', 1)[0]
                with self.assertRaises(urllib.error.HTTPError) as cm:
                    urllib.request.urlopen(base + '/app/index.html', timeout=5)
                self.assertEqual(cm.exception.code, 404)   # the deck's OWN directory has no 'app' folder
            finally:
                srv.shutdown(); srv.server_close()
