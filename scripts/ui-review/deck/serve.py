"""Serve a built deck on 127.0.0.1, open it in the browser, save every answer to
<spec-stem>.answers.json as it arrives, and exit when Destin submits.

WHY exit-on-submit: Claude runs `serve` as a background command and is re-invoked when it
exits — that exit IS the notification that the review is done, with the summary on stdout.
No copy, no paste, no "I'm done" message (spec §4.3)."""
import http.server
import json
import os
import socketserver
import subprocess
import threading
import time
import webbrowser


def answers_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.answers.json')


def lock_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.serve.json')


def write_atomic(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, path)


def summary(spec, state):
    """One line per step, ledger id first, in spec order (spec §4.5)."""
    counts = {'yes': 0, 'no': 0, 'other': 0, 'skip': 0}
    lines = []
    for st in spec['steps']:
        a = (state.get('answers') or {}).get(st['id']) or {}
        v = a.get('v') or 'skip'
        counts[v] = counts.get(v, 0) + 1
        note = (a.get('note') or '').strip()
        lines.append(f'{st["id"]} {v}' + (f' — "{note}"' if note else ''))
    when = (state.get('submitted') or '')[:16].replace('T', ' ')
    head = (f'{spec["key"]} · {"submitted " + when if when else "not submitted"} · '
            f'{counts["yes"]} yes · {counts["no"]} no · {counts["other"]} other · {counts["skip"]} skipped')
    return head + '\n' + '\n'.join(lines)


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(spec, port, on_submit):
    apath = answers_path(spec)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=spec['_base'], **k)

        def log_message(self, *a):   # quiet; the CLI prints what matters
            pass

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.split('?')[0] == '/answers':
                if os.path.exists(apath):
                    with open(apath) as f:
                        return self._json(200, json.load(f))
                return self._json(200, {})
            return super().do_GET()

        def do_POST(self):
            n = int(self.headers.get('content-length') or 0)
            try:
                state = json.loads(self.rfile.read(n) or b'{}')
            except (ValueError, TypeError):
                # WHY: a non-JSON body must get a reply, not a dropped connection —
                # json.loads raising unhandled here leaves the client hanging.
                return self._json(400, {'error': 'body is not JSON'})
            if self.path == '/answers':
                write_atomic(apath, state)
                return self._json(200, {'ok': True})
            if self.path == '/submit':
                state['submitted'] = state.get('submitted') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                write_atomic(apath, state)
                self._json(200, {'ok': True})
                on_submit(state)
                return
            return self._json(404, {'error': 'unknown path'})

    srv = _Server(('127.0.0.1', port), Handler)
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/{spec["out"]}'


def open_url(url):
    for cmd in (['xdg-open', url], ['open', url]):
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except FileNotFoundError:
            continue
    return webbrowser.open(url)


def serve(spec, port=0, open_browser=True, timeout_min=240, log=print):
    """Blocks. Returns 0 after a submit (summary logged), 2 on timeout, 3 if this spec is already served."""
    lock = lock_path(spec)
    if os.path.exists(lock):
        try:
            with open(lock) as f:
                other = json.load(f)
            pid, other_url = other['pid'], other['url']
        except (OSError, ValueError, KeyError):
            other = None   # unreadable/malformed lock file — treat as stale, proceed
        if other is not None:
            try:
                # WHY: kill(pid, 0) sends nothing; ProcessLookupError means dead,
                # PermissionError means alive but not ours — both are OSError, so
                # they must be told apart.
                os.kill(pid, 0)
            except ProcessLookupError:
                pass   # stale lock — the pid is dead
            except PermissionError:
                log(f'REFUSING: {spec["_stem"]} is already served by pid {pid} at {other_url}')
                return 3
            else:
                log(f'REFUSING: {spec["_stem"]} is already served by pid {pid} at {other_url}')
                return 3
    result = {}
    holder = {}

    def on_submit(state):
        result['state'] = state
        # WHY: shutdown() blocks until serve_forever() returns, so calling it on the
        # thread that runs serve_forever (the handler thread is one of its children in
        # ThreadingMixIn) would deadlock — it must run on a throwaway thread.
        threading.Thread(target=holder['srv'].shutdown, daemon=True).start()
    srv, url = make_server(spec, port, on_submit)
    holder['srv'] = srv
    with open(lock, 'w') as f:
        json.dump({'pid': os.getpid(), 'url': url}, f)
    log(f'[deck] {url}')
    if open_browser:
        open_url(url)
    # WHY: shutdown() blocks until serve_forever() returns, so calling it on the thread
    # that runs serve_forever (the handler thread is one of its children in
    # ThreadingMixIn) would deadlock — it must run on a throwaway thread.
    timer = threading.Timer(timeout_min * 60, lambda: threading.Thread(target=srv.shutdown, daemon=True).start())
    timer.daemon = True
    timer.start()
    try:
        srv.serve_forever()
    finally:
        timer.cancel()
        srv.server_close()
        try:
            os.remove(lock)
        except OSError:
            pass
    if 'state' in result:
        log(summary(spec, result['state']))
        return 0
    log(f'[deck] no submit after {timeout_min} min — answers so far are in {answers_path(spec)}')
    return 2


def wait_for_submit(spec, timeout_min=240, poll_s=2, log=print):
    """Block until the answers file carries `submitted`; 0 with the summary logged, 2 on timeout.
    WHY a second way to wait: `serve` runs as a background command and its exit is the signal —
    but a session that was compacted, restarted or lost that process still needs to know when
    Destin is done. This reads only the file, so it works whether or not `serve` is alive."""
    deadline = time.monotonic() + timeout_min * 60
    apath = answers_path(spec)
    while True:
        try:
            with open(apath) as f:
                state = json.load(f)
            if state.get('submitted'):
                log(summary(spec, state))
                return 0
        except (OSError, ValueError):
            pass   # not written yet, or mid-write (write_atomic renames, so this is rare)
        if time.monotonic() >= deadline:
            log(f'[deck] no submit after {timeout_min} min — answers so far are in {apath}')
            return 2
        time.sleep(poll_s)
