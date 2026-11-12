"""Serve a built deck on 127.0.0.1, print its address, save every answer to
<spec-stem>.answers.json as it arrives, and exit when Destin submits.

WHY it never opens a browser (Destin, 2026-09-05): a session runs inside the YouCoded app,
which opens any link pasted into chat — a model launching its own browser window on his
desktop is a surprise, not a convenience. `serve` prints the address; the session's job is
to put it in chat as the last line of its turn.

WHY exit-on-submit: Claude runs `serve` as a background command and is re-invoked when it
exits — that exit IS the notification that the review is done, with the summary on stdout.
No copy, no paste, no "I'm done" message (spec §4.3)."""
import http.server
import json
import mimetypes
import os
import re
import secrets
import shutil
import signal
import socketserver
import subprocess
import sys
import threading
import time

from .live import has_live
from .spec import UI_REVIEW, SpecError, is_page, pages as spec_pages, workspace_root

# WHY not workspace_root() (2026-09-26): that is where the SUB-REPO checkouts are cloned once
# (youcoded/, wecoded-themes/) and shared across every worktree — it is NOT where this deck
# tooling's own scripts/ lives, which is versioned per-worktree/branch like any other source
# file. `scripts/shoot/build.mjs` is a sibling of scripts/ui-review/, always — a worktree still
# on an older branch must use ITS OWN copy, not a shared one that may not have this tool yet
# (the shared checkout at workspace_root() had none, mid-migration). A module global, not a
# call inlined in build_app(), so a test can point it at a stand-in script.
SHOOT_BUILD_SCRIPT = os.path.join(os.path.dirname(UI_REVIEW), 'shoot', 'build.mjs')

# Matches app-server types in scripts/shoot/engine.mjs's `serve()` — the reference for both
# types and the SPA fallback, since that is the other place this same built folder is served
# from (a standalone `shoot`/`explore` run, with no deck around it).
APP_TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
             '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
             '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
             '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.jsonl': 'application/json'}


def answers_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.answers.json')


def lock_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.serve.json')


def write_atomic(path, obj):
    # WHY a temp name of its own per write (review 2026-11-10): every writer used the same
    # "<path>.tmp", so two overlapping saves (autosave plus Submit, or two tabs) shared one
    # file and one of them died with no reply — a lost Submit. mkstemp gives each its own.
    import tempfile
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(path) + '.', suffix='.tmp', dir=os.path.dirname(path) or '.')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(obj, f, indent=1)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


# WHY one lock around check-then-write (review 2026-11-10): the stale-page guard reads the saved
# file and then writes it; two requests interleaving between those steps defeated the guard.
_SAVE_LOCK = threading.Lock()


def save_state(apath, state, submit=False):
    """Guard and write one answers state under the lock. Returns (status, body).
    A saved `submitted` is never removed: a late autosave from a tab that has not seen the
    submit carries it forward instead of erasing it."""
    with _SAVE_LOCK:
        dropped = dropped_answers(apath, state)
        if dropped:
            return 409, {'error': 'refused: this page would drop the saved answers for '
                          + ', '.join(dropped) + ' — reload the page to pick up what is on disk'}
        try:
            with open(apath) as f:
                saved = json.load(f)
        except (OSError, ValueError):
            saved = None
        if isinstance(saved, dict) and saved.get('submitted') and saved.get('deck') == state.get('deck'):
            state['submitted'] = saved['submitted']
        if submit:
            state['submitted'] = state.get('submitted') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        write_atomic(apath, state)
    return 200, {'ok': True}


def dropped_answers(apath, incoming):
    """Step ids whose saved answer the incoming state would erase — the reason a write is refused.
    A step counts as answered when its entry is non-empty; an empty file, a missing file, or a
    file for a different deck never blocks anything."""
    try:
        with open(apath) as f:
            saved = json.load(f)
    except (OSError, ValueError):
        return []
    if not isinstance(saved, dict) or saved.get('deck') != (incoming or {}).get('deck'):
        return []
    have = {k for k, v in (saved.get('answers') or {}).items() if v}
    keep = {k for k, v in ((incoming or {}).get('answers') or {}).items() if v}
    return sorted(have - keep)


# WHY (Destin, 2026-11-10, round 7: "i need to be able to attach/paste images/filepaths in these input
# boxes and have them work as pills like youcoded"): a picture pasted into a deck box is kept beside
# the spec, in `<spec stem>.attachments/`, so the session reading the answers can open it by path.
# Images only, size-capped, and named by the SERVER — the browser's own file name is never used on
# disk, so a hostile name ("../../x") has nowhere to go.
ATTACH_MAX = 10 * 1024 * 1024
# WHY a count cap (review 2026-11-10): a paste loop could otherwise fill the disk.
ATTACH_COUNT_MAX = 200
_IMAGE_MAGIC = ((b'\x89PNG\r\n\x1a\n', '.png'), (b'\xff\xd8\xff', '.jpg'), (b'GIF87a', '.gif'), (b'GIF89a', '.gif'))


def image_ext(data):
    """The file extension for these bytes if they are a picture we accept, else None. Judged by the
    bytes, not by what the browser claimed."""
    for magic, ext in _IMAGE_MAGIC:
        if data.startswith(magic):
            return ext
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return '.webp'
    return None


def save_attachment(spec, data, client_name=''):
    """Write one pasted picture to `<spec stem>.attachments/`. Returns (status, body): 200 with
    {ok, name, path, url}, 413 too large, 415 not a picture."""
    if len(data) > ATTACH_MAX:
        return 413, {'error': f'that picture is larger than {ATTACH_MAX // (1024 * 1024)} MB'}
    ext = image_ext(data)
    if not ext:
        return 415, {'error': 'only pictures (png, jpeg, gif, webp) can be attached'}
    folder = os.path.join(spec['_base'], spec['_stem'] + '.attachments')
    os.makedirs(folder, exist_ok=True)
    if len(os.listdir(folder)) >= ATTACH_COUNT_MAX:
        return 413, {'error': f'this deck already holds {ATTACH_COUNT_MAX} attached pictures — no more can be added'}
    saved = time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(4) + ext
    with open(os.path.join(folder, saved), 'wb') as f:
        f.write(data)
    # The name he sees on the pill: the browser's name with any folders and odd characters taken off.
    shown = re.sub(r'[^\w. -]', '', os.path.basename((client_name or '').replace('\\', '/')))[:60].strip() or 'picture' + ext
    return 200, {'ok': True, 'name': shown, 'path': os.path.join(folder, saved),
                 'url': '/' + spec['_stem'] + '.attachments/' + saved}


def pill_words(p):
    """One pasted picture or file path, as the summary words it (page.js pillWords is the twin)."""
    return f'picture "{p.get("name")}" saved at {p.get("path")}' if p.get('kind') == 'image' else f'file {p.get("path")}'


def attach_label(k):
    return 'his note' if k == 'note' else 'his typed answer' if k == 'text' else 'change ' + k[7:] if k.startswith('change:') else k


def extras(a):
    """What an answer carries beyond its button and note (Destin, 2026-11-09, rethink Q-5 and
    Q-10): the lines of a "calls I made" list he marked for change, each with his own words, and
    the areas he dragged on a picture, each with where it is and what he said about it. Printed
    under the step's line so a session reading the summary cannot miss them."""
    out = []
    # A check status HE set (round 4): every status pill is his to change.
    names = {'pass': 'Passed', 'fail': 'Failed', 'unclear': 'Unclear', 'todo': 'Not tried', 'run': 'Will run', 'skip': 'Skip'}
    for k, v in (a.get('results') or {}).items():
        out.append(f'\n    status {k} — he set it to {names.get(v, v)}')
    for k, t in (a.get('changes') or {}).items():
        out.append(f'\n    change {k} — "{(t or "").strip()}"')
    for k in a.get('asks') or []:
        out.append(f'\n    more context wanted on {k}')
    # A wording row he retyped (round 3, S-3): the row's id and the words he wants instead.
    # {from, to} from a screen he retyped words on (round 4); a plain string from a wording row.
    for k, t in (a.get('edits') or {}).items():
        if isinstance(t, dict):
            # `state` (round 7b): what was open on the screen when he made the change — a session
            # re-opens the screen in that state to see the words in place.
            seen = f' — seen with: {t["state"]}' if t.get('state') else ''
            out.append(f'\n    reword "{t.get("from", "")}" → "{t.get("to", "")}"{seen}')
        else:
            out.append(f'\n    reword {k} — "{(t or "").strip()}"')
    for i, m in enumerate(a.get('marks') or []):
        out.append(f'\n    area {i + 1} on {m.get("pic")} (left {m.get("x")}%, top {m.get("y")}%, '
                   f'{m.get("w")}% wide, {m.get("h")}% tall) — "{(m.get("text") or "").strip()}"')
    # Pictures and file paths he pasted into a box (round 7): the path is what a session opens.
    for k, lst in (a.get('attach') or {}).items():
        for p in lst or []:
            out.append(f'\n    attached to {attach_label(k)} — {pill_words(p)}')
    for i, m in enumerate(a.get('marks') or []):
        for p in m.get('attach') or []:
            out.append(f'\n    attached to area {i + 1} — {pill_words(p)}')
    return ''.join(out)


def summary(spec, state):
    """One line per step, ledger id first, in spec order (spec §4.5)."""
    counts = {'yes': 0, 'no': 0, 'other': 0, 'pick': 0, 'picks': 0, 'wrote': 0, 'skip': 0}
    lines = []
    for st in spec['steps']:
        if is_page(st):
            continue   # a page marker asks nothing — no answer, so no line
        if st.get('context'):
            continue   # a background-only list asks nothing either (review 2026-11-10): never counted, never a line
        a = (state.get('answers') or {}).get(st['id']) or {}
        v = a.get('v') or 'skip'
        counts[v] = counts.get(v, 0) + 1
        note = (a.get('note') or '').strip()
        # A choice step answers with the variant it picked ("P-19 pick B"); "no" there means none of them.
        # "Don't know" is Other with a flag on it, so the file keeps three answers rather than
        # four — but the summary must say which of the two it was, or a session reads a shrug
        # as "he wants something else".
        # `picks` is several chosen at once and `wrote` is an answer he typed — both are
        # answers in their own right, so they print as themselves rather than as a bare verb.
        what = (f'pick {a.get("pick", "?")}' if v == 'pick'
                else 'picks ' + ', '.join(a.get('picks') or []) if v == 'picks'
                else 'wrote "' + (a.get('text') or '').strip() + '"' if v == 'wrote'
                else 'none' if v == 'no' and st.get('variants')
                else "don't know" if v == 'other' and a.get('dk') else v)
        # Fix: a note is a note (Destin, 2026-09-04) — no tag to print. An older answers
        # file may still carry a leftover per-note category alongside it; it is simply
        # never read here, so it has no effect on the summary.
        lines.append(f'{st["id"]} {what}' + (f' — "{note}"' if note else '') + extras(a))
    when = (state.get('submitted') or '')[:16].replace('T', ' ')
    head = (f'{spec["key"]} · {"submitted " + when if when else "not submitted"} · '
            f'{counts["yes"]} yes · {counts["no"]} no · {counts["other"]} other · '
            + (f'{counts["pick"]} picked · ' if counts['pick'] else '')
            + (f'{counts["picks"]} multi-picked · ' if counts['picks'] else '')
            + (f'{counts["wrote"]} written · ' if counts['wrote'] else '') + f'{counts["skip"]} skipped')
    # Notes tied to no question (round 3): first, so a session reading the summary meets them.
    general = (state.get('notes') or '').strip()
    # A comment box sits at the foot of every page (round 4); its words print first, by PAGE ORDER.
    # WHY page order and an implicit-page title (review 2026-11-10): the page printed these in page
    # order and this in saved order, so the two summaries disagreed; both now follow the deck's pages,
    # then any key the deck no longer has a page for.
    pg = spec_pages(spec) or []
    ids = [p['id'] for p in pg]
    titles = {p['id']: p['title'] for p in pg}
    for st in spec.get('steps', []):
        if isinstance(st, dict) and 'page' in st:
            titles.setdefault(st['id'], st.get('page') or st['id'])
        ids = ids + [st['id']] if (isinstance(st, dict) and 'page' in st and st['id'] not in ids) else ids

    def keys_of(d):
        d = d or {}
        return [k for k in ids if k in d] + [k for k in d if k not in ids]
    pn = state.get('pageNotes') or {}
    paged = ''.join(f'about the page "{titles.get(k, k)}" — "{(pn[k] or "").strip()}"\n' for k in keys_of(pn) if (pn[k] or '').strip())
    pa = state.get('pageAttach') or {}
    for k in keys_of(pa):
        paged += ''.join(f'about the page "{titles.get(k, k)}" attached — {pill_words(p)}\n' for p in pa[k] or [])
    general = (state.get('notes') or '').strip()
    gattached = ''.join(f'general notes attached — {pill_words(p)}\n' for p in state.get('notesAttach') or [])
    return head + '\n' + paged + (f'general notes — "{general}"\n' if general else '') + gattached + '\n'.join(lines)


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def port_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.serve-port')


def preferred_ports(spec):
    """The ports a deck tries, in order: the one it used last, then its own home port and the
    49 after it. WHY a steady address (2026-09-25): the page keeps a backup of every answer in
    the browser, and a browser keys that backup by address. A random port per `serve` put a
    restarted deck on a new address, where the backup from before a crash could not be read —
    one of the three ways answers were lost on 2026-09-23."""
    import zlib
    home = 20000 + zlib.crc32(os.path.abspath(os.path.join(spec['_base'], spec['_stem'])).encode()) % 20000
    ports = [home + i for i in range(50)]
    try:
        with open(port_path(spec)) as f:
            last = int(f.read().strip())
        if last not in ports:
            ports.insert(0, last)
        else:
            ports.remove(last); ports.insert(0, last)
    except (OSError, ValueError):
        pass
    return ports


def make_server(spec, port, on_submit, serve_app=True, log=print):
    apath = answers_path(spec)
    # One dev window per try-it slide, so pressing the button twice does not leave two apps
    # fighting over the same profile. Keyed by step id; a dead entry is forgotten.
    dev_windows = {}
    voice = VoiceBridge()   # one speech helper per served deck, started on first use
    # The practice app's built folder for /app/* — filled in by `_ensure_app`, which (re)builds
    # it (cheap: ensureBuild reuses the cache when nothing changed) at server start and again
    # every time the pane page itself is asked for, so an edit to a candidate shows on the next
    # reload of a pane instead of needing `serve` restarted.
    app_dir = {'path': None}

    def _ensure_app(rebuild):
        if rebuild or not app_dir['path']:
            try:
                app_dir['path'] = build_app(spec, log=log)
            except SpecError as e:
                log(f'[deck] {e}')
                return None
        return app_dir['path']

    if serve_app and has_live(spec) and not (spec.get('live') or {}).get('base'):
        _ensure_app(True)

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

        def _serve_app(self, path):
            # Rebuild-check ONLY on the pane page itself (never on its assets, one per pane per
            # load) — a candidate's edit shows on the next reload without a `serve` restart.
            dist = _ensure_app(path in ('/app', '/app/', '/app/index.html'))
            if dist is None:
                return self._json(503, {'error': 'the practice app for this deck\'s live panes failed to '
                                        'build — see the terminal that ran `serve`, then reload'})
            rel = (path[len('/app'):] or '/').lstrip('/') or 'index.html'
            file = os.path.normpath(os.path.join(dist, rel))
            # Path-escape guard (a dotted-up path) and the SPA fallback (a workbench route like
            # ?view=live has nothing on disk but index.html) are the same case: serve the app's
            # own page and let its JS route from the query string.
            if os.path.commonpath([file, dist]) != dist or not os.path.isfile(file):
                file = os.path.join(dist, 'index.html')
            ctype = APP_TYPES.get(os.path.splitext(file)[1]) or mimetypes.guess_type(file)[0] or 'application/octet-stream'
            with open(file, 'rb') as f:
                body = f.read()
            self.send_response(200)
            self.send_header('content-type', ctype)
            self.send_header('content-length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self._wrong_origin():
                return self._json(403, {'error': 'wrong host or origin'})
            path = self.path.split('?')[0]
            if serve_app and has_live(spec) and (path == '/app' or path.startswith('/app/')):
                return self._serve_app(path)
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
            # WHY (review 2026-11-10): a symlink inside the deck folder was served even when it
            # points outside it. Resolve the real file and refuse anything beyond the folder.
            root = os.path.realpath(spec['_base'])
            real = os.path.realpath(self.translate_path(self.path))
            if os.path.commonpath([real, root]) != root:
                return self._json(404, {'error': 'not a page'})
            return super().do_GET()

        def list_directory(self, path):
            # Never list a folder: the deck folder holds other decks and their answers.
            self.send_error(404, 'not a page')
            return None

        def do_POST(self):
            if self._wrong_origin():
                return self._json(403, {'error': 'wrong host or origin'})
            # WHY (review 2026-11-10): a negative Content-Length passed the size cap and then
            # read(-1) hung a thread until the client left. Anything not a plain count is refused.
            try:
                n = int(self.headers.get('content-length') or 0)
            except ValueError:
                n = -1
            if n < 0:
                self.close_connection = True
                return self._json(400, {'error': 'bad content-length'})
            if self.path.split('?')[0] == '/attach':
                # A pasted picture arrives as the raw bytes (never JSON). The same Host/Origin check
                # as every other POST ran above. Too large is refused before the body is read.
                if n > ATTACH_MAX:
                    # Read and throw away a modest oversize body first, so the browser receives the
                    # reason instead of a dropped connection; a body far beyond that is just cut off.
                    left = n if n <= 3 * ATTACH_MAX else 0
                    while left > 0:
                        chunk = self.rfile.read(min(left, 1 << 20))
                        if not chunk:
                            break
                        left -= len(chunk)
                    self.close_connection = True
                    return self._json(413, {'error': f'that picture is larger than {ATTACH_MAX // (1024 * 1024)} MB'})
                if not (self.headers.get('content-type') or '').startswith('image/'):
                    return self._json(415, {'error': 'only pictures (png, jpeg, gif, webp) can be attached'})
                from urllib.parse import parse_qs, urlparse
                nm = (parse_qs(urlparse(self.path).query).get('name') or [''])[0]
                return self._json(*save_attachment(spec, self.rfile.read(n), nm))
            try:
                state = json.loads(self.rfile.read(n) or b'{}')
            except (ValueError, TypeError):
                # WHY: a non-JSON body must get a reply, not a dropped connection —
                # json.loads raising unhandled here leaves the client hanging.
                return self._json(400, {'error': 'body is not JSON'})
            # WHY (review 2026-11-10): `5` or `[1]` as a body used to be written into the answers
            # file, or crashed the handler with no reply. Every JSON route wants an object.
            if not isinstance(state, dict):
                return self._json(400, {'error': 'body must be a JSON object'})
            if self.path in ('/answers', '/submit'):
                # WHY refuse rather than overwrite (2026-09-16, dev-workspace.md → rigs): a deck
                # page left open across a server restart posts ITS state, which can be older
                # than the file — the exact accident that erased a finished set of Destin's site
                # edits in site-copy-editor.py on 2026-09-10. The deck is the surface he answers
                # every UI review on, so a stale page here loses review answers. A write may add
                # or change answers; it may never make a saved answer disappear.
                code, reply = save_state(apath, state, submit=self.path == '/submit')
                if code != 200:
                    return self._json(code, reply)
                if self.path == '/answers':
                    return self._json(200, reply)
                self._json(200, reply)
                on_submit(state)
                return
            if self.path == '/voice':
                return self._json(200, voice.handle(state))
            if self.path == '/dev':
                return self._json(*launch_dev(spec, dev_windows, state.get('step')))
            return self._json(404, {'error': 'unknown path'})

    srv = _Server(('127.0.0.1', port), Handler)
    srv.voice = voice   # so serve() can stop the helper when the deck closes
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/{spec["out"]}'


class VoiceBridge:
    """Voice typing: one `voice-helper.mjs` process per served deck, started the first time a
    microphone button is pressed (loading the speech model takes about a second and ~700 MB of
    memory, so a deck nobody speaks to never pays for it).

    WHY it lives in the server (Destin, 2026-11-09): he answers decks by voice. The page cannot
    use the browser's microphone when the deck is shown inside the YouCoded app (the app refuses
    it to every page but its own), so the page only presses start/stop and the helper listens
    on this computer's microphone itself. The state the page polls is a plain dict; `seq` rises
    with every change so a poll can tell new words from old ones."""

    def __init__(self):
        self.lock = threading.Lock()
        self.proc = None
        self.state = {'status': 'off', 'text': '', 'error': '', 'seq': 0}
        self.last_seen = time.monotonic()
        self.stopping = False
        # WHY a watchdog (review 2026-11-10): a tab closed mid-recording sent nothing, so the
        # microphone stayed open for minutes. The page polls while it records; when the polls
        # stop for VOICE_QUIET_S the recording is cancelled here.
        threading.Thread(target=self._watch, daemon=True).start()

    VOICE_QUIET_S = 5

    def _watch(self):
        while not self.stopping:
            time.sleep(1)
            with self.lock:
                live = self.state['status'] in ('recording', 'finishing')   # not 'loading': start() blocks on it, sending no polls
                quiet = time.monotonic() - self.last_seen > self.VOICE_QUIET_S
            if live and quiet:
                self._send('cancel')
                self._set(status='idle', text='')

    def _set(self, **kw):
        with self.lock:
            self.state.update(kw)
            self.state['seq'] += 1

    def _read(self, proc):
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            kind = ev.get('type')
            if kind == 'ready':
                self._set(status='idle', error='')
            elif kind == 'level':
                # Ten a second while listening: no `seq` bump — it is not new words, and the
                # page reads it on every poll anyway.
                with self.lock:
                    self.state['level'] = ev.get('v', 0)
            elif kind == 'partial':
                self._set(text=ev.get('text', ''))
            elif kind == 'final':
                self._set(status='idle', text=ev.get('text', ''), final=True)
            elif kind == 'error':
                # WHY also cancel (review 2026-11-10): the helper may still be recording when it
                # reports an error; "idle" on the page must never mean a live microphone.
                self._send('cancel')
                self._set(status='idle', error=ev.get('message', 'voice input failed'))
        with self.lock:
            if self.proc is proc:
                self.proc = None
                # The helper is gone: without an error of its own, say only that — never a guess.
                self.state.update(status='off', error=self.state['error'] or 'voice input stopped unexpectedly')
                self.state['seq'] += 1

    def _ensure(self):
        with self.lock:
            if self.proc and self.proc.poll() is None:
                return True
        node = shutil.which('node')
        if not node:
            self._set(status='off', error='voice input needs Node.js, which was not found on this computer')
            return False
        proc = subprocess.Popen([node, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice-helper.mjs')],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        with self.lock:
            self.proc = proc
            self.state.update(status='loading', error='', text='')
            self.state['seq'] += 1
        threading.Thread(target=self._read, args=(proc,), daemon=True).start()
        return True

    def _send(self, word):
        with self.lock:
            proc = self.proc
        if proc and proc.poll() is None:
            try:
                proc.stdin.write(word + '\n')
                proc.stdin.flush()
            except OSError:
                pass

    def handle(self, body):
        with self.lock:
            self.last_seen = time.monotonic()
        cmd = body.get('cmd')
        if cmd == 'start':
            if self._ensure():
                # Wait for the model the first time, so "start" never races the load.
                deadline = time.monotonic() + 20
                while self.state['status'] == 'loading' and time.monotonic() < deadline:
                    time.sleep(0.05)
                if self.state['status'] == 'idle':
                    self._set(status='recording', text='', error='', final=False)
                    self._send('start')
        elif cmd == 'stop':
            if self.state['status'] == 'recording':
                self._set(status='finishing')
                self._send('stop')
        elif cmd == 'cancel':
            self._send('cancel')
        with self.lock:
            return dict(self.state)

    def close(self):
        self.stopping = True
        self._send('cancel')   # the helper stops parec itself rather than relying on a closed pipe
        with self.lock:
            proc, self.proc = self.proc, None
        if proc and proc.poll() is None:
            proc.terminate()


def launch_dev(spec, windows, step_id):
    """Open the dev window a TRY-IT slide names. Returns (status, body).

    WHY the page may not send a command (Destin, 2026-09-06 asked for a button instead of a line
    to copy): the request names a STEP, and the command is rebuilt here from the spec on disk.
    A page that could post a command to run would be a shell on a loopback port — the deck is
    served to a browser, and the browser is not a thing this process trusts.

    It launches `run-dev.sh`, which is the dev instance on shifted ports with its own profile —
    never Destin's own running app, which nothing in this workspace may touch."""
    from .build import dev_command   # imported here: build.py imports this module at load time
    step = next((st for st in spec['steps'] if st.get('id') == step_id), None)
    if not step or 'dev' not in step:
        return 404, {'error': f'no try-it slide called "{step_id}" on this deck'}
    live = windows.get(step_id)
    if live and live.poll() is None:
        return 200, {'ok': True, 'already': True, 'pid': live.pid}
    root = workspace_root()
    script = os.path.join(root, 'scripts', 'run-dev.sh')
    if not os.path.exists(script):
        return 500, {'error': f'{script} is not here — run the deck from the workspace'}
    dev = step['dev']
    argv = ['bash', script, dev['worktree'], '--label', dev.get('label') or dev['worktree']]
    if dev.get('offset') is not None:
        argv += ['--offset', str(dev['offset'])]
    if dev.get('profile'):
        argv += ['--profile', dev['profile']]
    log_path = os.path.join(spec['_base'], spec['_stem'] + f'.dev-{step_id}.log')
    try:
        with open(log_path, 'w') as lf:
            # start_new_session: the window outlives this server, so submitting the deck (which
            # exits the server) does not kill the app he is still looking at.
            proc = subprocess.Popen(argv, stdout=lf, stderr=subprocess.STDOUT, cwd=root,
                                    stdin=subprocess.DEVNULL, start_new_session=True)
    except OSError as e:
        return 500, {'error': f'could not start it: {e}'}
    windows[step_id] = proc
    return 200, {'ok': True, 'pid': proc.pid, 'command': dev_command(dev), 'log': log_path}


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


def _built_at(spec):
    """When the deck page on disk was built (its build stamp), or None."""
    try:
        with open(os.path.join(spec['_base'], spec['out'])) as f:
            m = re.search(r'"built":\s*\{[^}]*"at":\s*"([^"]+)"', f.read())
        return m.group(1) if m else None
    except OSError:
        return None


def rotate_submitted(spec, log=print, resume=False):
    """If the answers file already carries `submitted`, move it aside and return its new name.
    WHY `resume` (Destin, 2026-11-11, round 9, Q-3: "Your answers, still editable, with a line saying
    when you sent them"): reopening a deck he had answered showed it empty, which looked like lost
    answers. When the page on disk is the SAME build he answered (its build stamp matches the one saved
    with his answers), the dated copy is still kept, and the live file keeps his answers, unlocked, with
    `sent_before` saying when he sent them; a second Submit replaces the first. A deck REBUILT since he
    answered still starts empty: its questions may have changed under the old answers.
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
    # WHY a free-name check (review 2026-11-10): minute precision let two submits in one minute
    # overwrite the earlier history file. The minute name is kept when free (what older notes
    # point at); otherwise seconds, then a counter, are added.
    stamp = ''.join(c for c in when[:16] if c.isdigit()) or 'submitted'
    full = ''.join(c for c in when[:19] if c.isdigit()) or stamp
    dest = os.path.join(spec['_base'], f'{spec["_stem"]}.answers.{stamp}.json')
    n = 1
    while os.path.exists(dest):
        n += 1
        dest = os.path.join(spec['_base'], f'{spec["_stem"]}.answers.{full}.json' if n == 2 else f'{spec["_stem"]}.answers.{full}-{n}.json')
    os.replace(apath, dest)
    same_build = resume and isinstance(state.get('built'), dict) and state['built'].get('at') and state['built']['at'] == _built_at(spec)
    if same_build:
        again = dict(state); again.pop('submitted', None); again['sent_before'] = when
        write_atomic(apath, again)
        log(f'[deck] this deck was submitted {when[:16].replace("T", " ")} — that copy is kept as {os.path.basename(dest)}; reopening it with those answers, still editable')
        return dest
    log(f'[deck] the previous review of this deck was submitted {when[:16].replace("T", " ")} — kept as {os.path.basename(dest)}; starting a fresh one')
    return dest


def parse_pasted(spec, text):
    """The deck's copy box, pasted back → the state the server would have written.

    WHY: when the page is opened as a plain file (the browser open failed, or Destin opened the
    html path from the chat) Submit has no server to reach, so the page shows its summary in a
    copy box and he pastes it into the chat. On 2026-09-04 that paste arrived as ONE line — the
    chat flattened the newlines — and nothing on this side could turn it back into an answers
    file, so a fully answered deck read as "not submitted". This parser accepts both shapes
    (one step per line, or everything on one line) by splitting the text at the spec's own
    step ids, never at whitespace; the header before the first id is ignored.
    Returns (state, problems): problems is a list of strings, empty when every segment parsed."""
    ids = [st['id'] for st in spec['steps']]
    by_id = {st['id']: st for st in spec['steps']}
    alt = '|'.join(re.escape(i) for i in sorted(ids, key=len, reverse=True))
    parts = re.split(rf'(?:(?<=\s)|^)({alt})(?=\s|$)', text.strip())
    # parts = [header, id, segment, id, segment, …]
    state = {'deck': spec['key'], 'answers': {}}
    problems = []
    seg_re = re.compile(r'^(?P<what>yes|no|other|skip|none|pick\s+\S+)'
                        # A trailing [tag] is accepted and DROPPED: decks written before
                        # 2026-09-05 carried "fix now / fix later / just noting" after a note,
                        # and their paste must still record rather than be refused.
                        r'(?:\s+—\s+"(?P<note>.*)"(?:\s+\[[^\]]+\])?)?\s*$', re.S)
    for i in range(1, len(parts) - 1, 2):
        sid, seg = parts[i], parts[i + 1].strip()
        m = seg_re.match(seg)
        if not m:
            problems.append(f'{sid}: could not read "{seg[:60]}" — expected yes / no / other / skip / none / pick <id>, optionally — "note"')
            continue
        what = m.group('what')
        if what == 'skip':
            continue
        a = {}
        if what.startswith('pick'):
            a['v'], a['pick'] = 'pick', what.split(None, 1)[1]
            opts = [o['id'] for o in by_id[sid].get('options') or by_id[sid].get('variants') or []]
            if not opts:
                problems.append(f'{sid}: "pick {a["pick"]}" but this step has no options — it answers yes / no / other')
            elif a['pick'] not in opts:
                problems.append(f'{sid}: picked "{a["pick"]}" but the options are {", ".join(opts)}')
        elif what == 'none':
            a['v'] = 'no'
        else:
            a['v'] = what
        if m.group('note'):
            a['note'] = m.group('note')
        state['answers'][sid] = a
    if not state['answers'] and not problems:
        problems.append('no step answers found — expected lines like "Q-1 pick a" or "P-3 yes" using this deck\'s step ids (' + ', '.join(ids) + ')')
    return state, problems


def record(spec, text, log=print):
    """Write a pasted copy-box summary as the submitted answers file. Exit code: 0 recorded, 1 refused."""
    state, problems = parse_pasted(spec, text)
    if problems:
        for p in problems:
            log('refused: ' + p)
        return 1
    rotate_submitted(spec, log)
    state['submitted'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    write_atomic(answers_path(spec), state)
    log(f'[deck] recorded {len(state["answers"])} answers from the paste → {os.path.basename(answers_path(spec))}')
    log(summary(spec, state))
    return 0


def resolve_worktree(name):
    """A worktree name, a SESSION name, a path holding desktop/, or the main checkout.

    WHY the session shape is in here (2026-09-10): `workspace-start` puts a session's app
    checkout at `worktrees/sessions/<name>/youcoded`, which none of the other three shapes
    matches — so a deck could only reach the branch its own session was working on by
    spelling that path out, and the obvious names (the session key, the branch) both
    failed. `scripts/lib/resolve-checkout.sh` learned this on 2026-09-09 for run-workbench
    and run-dev; this resolver is the second copy and did not."""
    ws = workspace_root()
    bare = name[len('session/'):] if name.startswith('session/') else name
    candidates = (
        os.path.join(ws, 'worktrees', name),
        os.path.join(ws, 'worktrees', 'sessions', bare, 'youcoded'),
        name,
        os.path.join(ws, name),
    )
    for candidate in candidates:
        if candidate and os.path.isdir(os.path.join(candidate, 'desktop')):
            return os.path.abspath(candidate)
    return None


def build_app(spec, log=print):
    """Build (or reuse) the practice app this deck's live panes point at, and return its
    folder — where `/app/*` is served from. `scripts/shoot/build.mjs` does the actual work
    (and the caching: unchanged source answers in well under a second).

    WHY serve owns this: "one command produces a working review" is the whole point of the
    deck — the app used to be a SEPARATE server (`run-workbench.sh` on a fixed port) that had
    to be started by hand, or by this same function; now the deck serves it itself, so a
    restarted deck's panes come back with it instead of pointing at a dead port."""
    tree_name = (spec.get('live') or {}).get('worktree', '')
    tree = resolve_worktree(tree_name)
    if not tree:
        raise SpecError(f'live.worktree "{tree_name}" is not a checkout with a desktop/ folder '
                        f'(looked in {os.path.join(workspace_root(), "worktrees")}, as a path, and at the workspace root)')
    if not os.path.exists(SHOOT_BUILD_SCRIPT):
        raise SpecError(f'{SHOOT_BUILD_SCRIPT} is not here — run the deck from a worktree that has scripts/shoot/build.mjs')
    r = subprocess.run(['node', SHOOT_BUILD_SCRIPT, tree], capture_output=True, text=True)
    if r.returncode != 0:
        raise SpecError(f'building the practice app for "{tree_name}" failed:\n{(r.stderr or r.stdout).strip()}')
    dist = r.stdout.strip()
    if not dist or not os.path.isdir(dist):
        raise SpecError(f'building the practice app for "{tree_name}" printed no folder — see: {r.stderr.strip()}')
    log(f'[deck] the practice app for {tree_name} is at {dist} — served at /app/')
    return dist


_DECK_BLOB_RE = re.compile(r'(const DECK=)(\{.*?\})(;)', re.S)


def rewrite_stale_live(html, log=print):
    """An old-built page's live panes point at `<live.base>/?…` — the workbench's fixed port,
    which this deck no longer starts. Every page built since 2026-09-26 points its panes at
    `/app/index.html?…` instead (this deck's own address, whether or not `live.base` is set —
    a base only ever changes the ORIGIN a pane is prefixed with, never the path), so a pane
    address with no `/app/` in it is what tells an old page apart from a new one — never the
    shape of `live.base` alone, which an explicit test stub can share with the old fixed port.

    `serve --no-build` of an old page would otherwise show empty panes forever (a dead address
    never comes back). Rewrites the baked `DECK.live.base` and every pane's `url` onto this
    deck's own `/app/` in place, on disk, so the page behaves exactly as if it had just been
    rebuilt. Returns the html unchanged when there is nothing stale to fix."""
    m = _DECK_BLOB_RE.search(html)
    if not m:
        return html
    try:
        data = json.loads(m.group(2).replace('<\\/', '</'))
    except ValueError:
        return html
    panes = [p for st in data.get('steps', []) for p in (st.get('panes') or [])]
    if not panes or all('/app/' in (p.get('url') or '') for p in panes):
        return html   # no live panes, or every one already addresses this deck's own /app/
    data['live'] = data.get('live') or {}
    data['live']['base'] = ''
    data['live'].pop('command', None)
    for p in panes:
        query = (p.get('url') or '').split('?', 1)
        p['url'] = '/app/index.html' + ('?' + query[1] if len(query) > 1 else '')
    from .build import embed_json
    blob = embed_json(data)
    log('[deck] this page\'s live panes pointed at the old fixed workbench port — rewritten onto '
        'this deck\'s own /app/ address; reload any pane that was already open')
    return html[:m.start(2)] + blob + html[m.end(2):]


def serve(spec, port=0, timeout_min=1440, log=print, live=True):
    """Blocks. Returns 0 after a submit (summary logged), 2 on timeout, 3 if this spec is already served.

    `live=False` (--no-live) never builds or serves `/app/*` for this deck's live panes — for
    a spec that points its panes at a server of its own (an explicit `live.base`, which is
    what a test's stub server is) and has nothing here to build."""
    lock = lock_path(spec)
    other = already_served(spec)
    if other is not None:
        log(f'REFUSING: {spec["_stem"]} is already served by pid {other["pid"]} at {other["url"]}')
        return 3
    rotate_submitted(spec, log, resume=True)
    # A page built before this deck served its own live panes still bakes the old fixed-port
    # address — fix it on disk once, so it behaves like a freshly built page from here on.
    out_path = os.path.join(spec['_base'], spec['out'])
    try:
        with open(out_path) as f:
            html = f.read()
        fixed = rewrite_stale_live(html, log)
        if fixed != html:
            with open(out_path, 'w') as f:
                f.write(fixed)
    except OSError:
        pass   # no page on disk yet (a first `build` still runs before this in review-cards.py)
    result = {}
    holder = {}

    def on_submit(state):
        result['state'] = state
        # WHY: shutdown() blocks until serve_forever() returns, so calling it on the
        # thread that runs serve_forever (the handler thread is one of its children in
        # ThreadingMixIn) would deadlock — it must run on a throwaway thread.
        threading.Thread(target=holder['srv'].shutdown, daemon=True).start()
    if port:
        srv, url = make_server(spec, port, on_submit, serve_app=live, log=log)
    else:
        # A steady address per deck (preferred_ports); a busy one moves to the next, and the
        # one it lands on is remembered so the next serve comes back to it.
        srv = url = None
        for p in preferred_ports(spec):
            try:
                srv, url = make_server(spec, p, on_submit, serve_app=live, log=log)
                break
            except OSError:
                continue
        if srv is None:
            srv, url = make_server(spec, 0, on_submit, serve_app=live, log=log)
        try:
            with open(port_path(spec), 'w') as f:
                f.write(str(srv.server_address[1]))
        except OSError:
            pass
    holder['srv'] = srv
    with open(lock, 'w') as f:
        json.dump({'pid': os.getpid(), 'url': url}, f)
    log(f'[deck] {url}')
    # Fix (Destin, 2026-09-05): never launch a browser ourselves — print the link and let
    # the session paste it into chat, where the YouCoded app opens it for him.
    log('[deck] not opened — put this link in chat as the last line of your turn')
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
        # WHY (review 2026-11-10): nothing ever called close(), so a library caller was left with
        # the speech helper (and a possibly recording microphone) running after serve() returned.
        srv.voice.close()
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


def wait_for_submit(spec, timeout_min=1440, poll_s=2, log=print):
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
