"""Serve a built deck on 127.0.0.1, open it in the browser, save every answer to
<spec-stem>.answers.json as it arrives, and exit when Destin submits.

WHY exit-on-submit: Claude runs `serve` as a background command and is re-invoked when it
exits — that exit IS the notification that the review is done, with the summary on stdout.
No copy, no paste, no "I'm done" message (spec §4.3)."""
import http.server
import json
import os
import re
import signal
import socketserver
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

from .live import VITE_BASE_PORT, has_live, live_offset
from .spec import SpecError, workspace_root


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
    counts = {'yes': 0, 'no': 0, 'other': 0, 'pick': 0, 'skip': 0}
    lines = []
    for st in spec['steps']:
        a = (state.get('answers') or {}).get(st['id']) or {}
        v = a.get('v') or 'skip'
        counts[v] = counts.get(v, 0) + 1
        note = (a.get('note') or '').strip()
        # A choice step answers with the variant it picked ("P-19 pick B"); "no" there means none of them.
        # "Don't know" is Other with a flag on it, so the file keeps three answers rather than
        # four — but the summary must say which of the two it was, or a session reads a shrug
        # as "he wants something else".
        what = (f'pick {a.get("pick", "?")}' if v == 'pick'
                else 'none' if v == 'no' and st.get('variants')
                else "don't know" if v == 'other' and a.get('dk') else v)
        # Fix: a note is a note (Destin, 2026-09-04) — no tag to print. An older answers
        # file may still carry a leftover per-note category alongside it; it is simply
        # never read here, so it has no effect on the summary.
        lines.append(f'{st["id"]} {what}' + (f' — "{note}"' if note else ''))
    when = (state.get('submitted') or '')[:16].replace('T', ' ')
    head = (f'{spec["key"]} · {"submitted " + when if when else "not submitted"} · '
            f'{counts["yes"]} yes · {counts["no"]} no · {counts["other"]} other · '
            + (f'{counts["pick"]} picked · ' if counts['pick'] else '') + f'{counts["skip"]} skipped')
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

        def _wrong_origin(self):
            """WHY: this server answers on the loopback interface with no authentication. A page
            on any other origin could otherwise forge a Submit with a form POST (which needs no
            preflight), and a DNS-rebinding name pointed at 127.0.0.1 could read the deck folder.
            Pinning both Host and Origin to our own address closes both."""
            port = self.server.server_address[1]
            # localhost is not rebindable in any current browser, so a hand-typed localhost URL may work too.
            mine = {f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'}
            origin = self.headers.get('origin')
            return (self.headers.get('host') or '') not in mine or (origin is not None and origin not in {f'http://{m}' for m in mine})

        def do_GET(self):
            if self._wrong_origin():
                return self._json(403, {'error': 'wrong host or origin'})
            path = self.path.split('?')[0]
            if path == '/answers':
                if os.path.exists(apath):
                    with open(apath) as f:
                        return self._json(200, json.load(f))
                return self._json(200, {})
            # WHY: the bare port (what a session tends to quote) used to show a folder listing of every
            # deck in the audit folder — Destin landed on it on 2026-08-27. The root now IS the deck.
            if path in ('/', '/index.html'):
                self.send_response(302)
                self.send_header('location', '/' + spec['out'] + (('?' + self.path.split('?', 1)[1]) if '?' in self.path else ''))
                self.send_header('content-length', '0')
                self.end_headers()
                return
            return super().do_GET()

        def list_directory(self, path):
            # Never list a folder: the deck folder holds other decks and their answers.
            self.send_error(404, 'not a page')
            return None

        def do_POST(self):
            if self._wrong_origin():
                return self._json(403, {'error': 'wrong host or origin'})
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


def already_served(spec):
    """{'pid', 'url'} of the live process holding this spec's lock, or None (no lock, stale
    lock, or an unreadable one). Checked BEFORE anything is built: a second `serve` used to
    rebuild the HTML and the crops out from under the first server and only then exit 3."""
    lock = lock_path(spec)
    if not os.path.exists(lock):
        return None
    try:
        with open(lock) as f:
            other = json.load(f)
        pid, other_url = other['pid'], other['url']
    except (OSError, ValueError, KeyError):
        return None   # unreadable/malformed lock file — treat as stale, proceed
    try:
        # WHY: kill(pid, 0) sends nothing; ProcessLookupError means dead,
        # PermissionError means alive but not ours — both are OSError, so
        # they must be told apart.
        os.kill(pid, 0)
    except ProcessLookupError:
        return None   # stale lock — the pid is dead
    except PermissionError:
        return {'pid': pid, 'url': other_url}   # alive, owned by someone else
    return {'pid': pid, 'url': other_url}


def rotate_submitted(spec, log=print):
    """If the answers file already carries `submitted`, move it aside and return its new name.
    WHY: on 2026-08-27 a deck was re-served after Destin had submitted an earlier version of it;
    the page loaded the old file, saw `submitted`, and locked every control — "I can't click
    through the pages". A new `serve` is a new review: the old answers stay as history next to
    the spec (<stem>.answers.<when>.json), the new review starts empty."""
    apath = answers_path(spec)
    try:
        with open(apath) as f:
            state = json.load(f)
    except (OSError, ValueError):
        return None
    when = state.get('submitted')
    if not when:
        return None
    stamp = ''.join(c for c in when[:16] if c.isdigit()) or 'submitted'
    dest = os.path.join(spec['_base'], f'{spec["_stem"]}.answers.{stamp}.json')
    os.replace(apath, dest)
    log(f'[deck] the previous review of this deck was submitted {when[:16].replace("T", " ")} — kept as {os.path.basename(dest)}; starting a fresh one')
    return dest


def resolve_worktree(name):
    """A worktree name, a path holding desktop/, or the main checkout — the same three shapes
    record-pair.sh accepts, so one spelling works everywhere."""
    ws = workspace_root()
    for candidate in (os.path.join(ws, 'worktrees', name), name, os.path.join(ws, name)):
        if candidate and os.path.isdir(os.path.join(candidate, 'desktop')):
            return os.path.abspath(candidate)
    return None


def _listener_cwd(port):
    """(pid, cwd) of whatever holds the port, or (None, None). Linux-only, like record-pair.sh."""
    try:
        out = subprocess.run(['ss', '-ltnp', f'sport = :{port}'], capture_output=True, text=True).stdout
    except (OSError, subprocess.SubprocessError):
        return None, None
    m = re.search(r'pid=(\d+)', out)
    if not m:
        return None, None
    pid = int(m.group(1))
    try:
        return pid, os.readlink(f'/proc/{pid}/cwd')
    except OSError:
        return pid, None


def _answers(port):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1).read(1)
        return True
    except urllib.error.HTTPError:
        return True          # it answered; a status code is still an answer
    except Exception:
        return False


def start_workbench(spec, log=print):
    """Boot the workbench the live panes point at, and say whether WE started it.

    WHY serve owns this: "one command produces a working review" is the whole point of the
    deck. Returns (proc_or_None, started) — only a server we started is ours to stop."""
    tree_name = (spec.get('live') or {}).get('worktree', '')
    tree = resolve_worktree(tree_name)
    if not tree:
        raise SpecError(f'live.worktree "{tree_name}" is not a checkout with a desktop/ folder '
                        f'(looked in {os.path.join(workspace_root(), "worktrees")}, as a path, and at the workspace root)')
    port = VITE_BASE_PORT + live_offset(spec)
    pid, cwd = _listener_cwd(port)
    if pid:
        # A FOREIGN server would show the wrong code in every pane with nothing visible to
        # say so — the same refusal record-pair.sh makes, for the same reason.
        if cwd != os.path.join(tree, 'desktop'):
            raise SpecError(f'REFUSING: port {port} is already served from {cwd or "an unreadable cwd"} '
                            f'(pid {pid}), not {os.path.join(tree, "desktop")} — stop it, or give this deck '
                            f'another "live": {{"offset": N}}')
        log(f'[deck] workbench for {tree_name} already running on :{port} — leaving it alone')
        return None, False
    log_path = os.path.join(spec['_base'], spec['_stem'] + '.workbench.log')
    env = {**os.environ, 'YOUCODED_PORT_OFFSET': str(live_offset(spec))}
    # NO VITE_NO_WATCH. record-pair.sh sets it because a recording is a fixed artefact; a live
    # review is the opposite — watching on is what lets a candidate be edited while the deck
    # is open and have the pane update in front of Destin.
    env.pop('VITE_NO_WATCH', None)
    with open(log_path, 'w') as lf:
        proc = subprocess.Popen(['bash', os.path.join(workspace_root(), 'scripts', 'run-workbench.sh'), tree],
                                stdout=lf, stderr=subprocess.STDOUT, cwd=tree, env=env,
                                start_new_session=True)
    log(f'[deck] starting the workbench for {tree_name} on :{port} (log: {log_path})')
    for _ in range(60):
        if _answers(port):
            return proc, True
        if proc.poll() is not None:
            raise SpecError(f'the workbench for "{tree_name}" exited before answering on :{port} — see {log_path}')
        time.sleep(1)
    stop_workbench(proc)
    raise SpecError(f'the workbench for "{tree_name}" did not answer on :{port} within 60s — see {log_path}')


def stop_workbench(proc):
    """Stop only a server WE started. run-workbench.sh spawns vite as a child, so the whole
    process group has to go — killing the shell alone leaves vite holding the port."""
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (OSError, ProcessLookupError):
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError):
            proc.kill()


def serve(spec, port=0, open_browser=True, timeout_min=240, log=print, live=True):
    """Blocks. Returns 0 after a submit (summary logged), 2 on timeout, 3 if this spec is already served.

    `live=False` (--no-live) leaves the app server alone, for when Destin already has the
    workbench up on that port and does not want it restarted underneath him."""
    lock = lock_path(spec)
    other = already_served(spec)
    if other is not None:
        log(f'REFUSING: {spec["_stem"]} is already served by pid {other["pid"]} at {other["url"]}')
        return 3
    rotate_submitted(spec, log)
    result = {}
    holder = {}
    # AFTER the already-served refusal above (which returns before the try/finally below), so
    # everything we start is covered by the cleanup that stops it.
    wb, wb_started = (None, False)
    if live and has_live(spec):
        wb, wb_started = start_workbench(spec, log)

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
    # A plain `kill` (SIGTERM) would end the process without running the finally below and leave
    # the lock file behind; turning it into SystemExit lets the cleanup run.
    if threading.current_thread() is threading.main_thread():   # signal handlers can only be set there (tests run serve() in a thread)
        signal.signal(signal.SIGTERM, lambda *a: sys.exit(143))
    try:
        srv.serve_forever()
    finally:
        timer.cancel()
        srv.server_close()
        try:
            os.remove(lock)
        except OSError:
            pass
        # Only a workbench WE started. One that was already running belongs to whoever
        # started it and is left exactly as we found it.
        if wb_started:
            log('[deck] stopping the workbench this review started')
            stop_workbench(wb)
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
