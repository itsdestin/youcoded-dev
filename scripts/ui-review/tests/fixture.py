"""A synthetic screenshot run for the deck tests: flat 1440x900 'shots' with a known
rectangle that changes, and a manifest with known measurements. Lets every deck test run
without Chrome or the workbench."""
import json, os, subprocess

GEO = '400x200+500+250'

def make_fixture(tmp, themes=('midnight', 'light'), clip=False):
    for run in ('before', 'after'):
        for theme in themes:
            d = os.path.join(tmp, 'runs', run, 'shots-main', theme); os.makedirs(d, exist_ok=True)
            cmd = ['magick', '-size', '1440x900', 'xc:#202020' if theme == 'midnight' else 'xc:#EEEEEE']
            if run == 'after':
                cmd += ['-fill', 'red', '-draw', 'rectangle 560,260 679,299', '-fill', 'blue', '-draw', 'rectangle 20,20 29,29']
            subprocess.run(cmd + [os.path.join(d, 'home.png')], check=True)
        mf = [{'name': 'home', 'theme': t, 'verified': True, 'run': '1', 'file': f'{t}/home.png',
               'measures': {'#send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}, 'text:Send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}}} for t in themes]
        json.dump(mf, open(os.path.join(tmp, 'runs', run, 'shots-main', 'manifest-main-x.json'), 'w'))
    deck = os.path.join(tmp, 'deck'); os.makedirs(deck, exist_ok=True)
    spec = {'title': 'Fixture review', 'key': 'fixture', 'out': 'fixture.html', 'images': 'images/deck',   # images/<spec stem>, the convention validate() warns about breaking
            'runs': {'before': os.path.join(tmp, 'runs', 'before'), 'after': os.path.join(tmp, 'runs', 'after')},
            'themes': list(themes), 'crops': {'c': ['main', 'home', GEO]},
            'steps': [
                {'id': 'S-1', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'headline': 'A red block appeared.',
                 'changed': 'A red block was painted.', 'measured': '120 px wide', 'notice': 'You see red.', 'risk': 'None really.'},
                {'id': 'S-2', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'selector': '#send'},
                 'headline': 'The send button moved.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'},
                {'id': 'S-3', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'text': 'Send'},
                 'headline': 'Same, by text.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'}]}
    # A CLIP step: two 1-second recordings (a gray frame, then one with the red block) made
    # with ffmpeg, where record-pair.sh would put them. Skipped if ffmpeg is absent.
    clips = os.path.join(deck, 'images', 'deck', 'clips')
    if clip: os.makedirs(clips, exist_ok=True)
    try:
        if not clip: raise FileNotFoundError('clip step not requested')
        for run, colour in (('before', 'gray'), ('after', 'red')):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c={colour}:s=320x200:d=1:r=12',
                            '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', os.path.join(clips, f'blink--{run}.webm')], check=True)
            subprocess.run(['magick', '-size', '320x200', f'xc:{colour}', os.path.join(clips, f'blink--{run}.webp')], check=True)
        spec['steps'].append({'id': 'S-4', 'surface': 'Home', 'path': 'Chat', 'clip': 'blink',
                              'headline': 'The block now blinks.', 'changed': 'It animates.', 'notice': 'Motion.', 'risk': 'None.'})
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    p = os.path.join(deck, 'deck.json'); json.dump(spec, open(p, 'w'), indent=1); return p


# ── live panes ──────────────────────────────────────────────────────────────────────────
# A LIVE-only deck needs no screenshots at all, which is exactly why the live tests live in
# test_live.py: no ImageMagick, no ffmpeg, no workbench — so they are the deck coverage that
# actually runs in CI, where none of those binaries exist.
STUB_PANE = """<!doctype html><meta charset="utf-8"><title>stub pane</title>
<body style="margin:0">
<div id="c" style="height:%(h)dpx">candidate %(id)s</div>
<script>
  // What the real route does, in miniature: report a height on load, and swap theme IN PLACE
  // when the deck asks — never by reloading.
  //
  // Everything is reported back by postMessage because the deck and the panes are on
  // different ports, so the test (which drives the deck's frame) cannot read into this
  // document at all. `id` is minted per LOAD: if a theme click ever reloaded the pane, the
  // id in its acknowledgement would differ from the one it announced at load. That is the
  // no-reload proof.
  window.__id = 'p' + Math.random().toString(36).slice(2);
  window.__lastTheme = null;
  // Reports a WIDTH the deck spec did not declare (the fixture leaves paneWidth unset, so
  // the deck starts at its 360 default) — that is how the test proves the measured width
  // wins over the guessed one.
  parent.postMessage({type:'youcoded:pane-height', height:%(h)d, width:%(w)d, candidate:'%(id)s'}, '*');
  parent.postMessage({type:'stub:loaded', candidate:'%(id)s', id:window.__id}, '*');
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'youcoded:theme') {
      window.__lastTheme = e.data.theme;
      parent.postMessage({type:'stub:theme', theme:e.data.theme, candidate:'%(id)s', id:window.__id}, '*');
    }
  });
</script>
"""


class LivePaneServer:
    """One stub page per candidate on an ephemeral port, standing in for the workbench."""

    def __init__(self, height=220, width=420):
        import http.server
        import socketserver
        import threading
        page_height, page_width = height, width

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                from urllib.parse import parse_qs, urlparse
                cand = (parse_qs(urlparse(self.path).query).get('candidate') or [''])[0]
                body = (STUB_PANE % {'h': page_height, 'w': page_width, 'id': cand}).encode()
                self.send_response(200)
                self.send_header('content-type', 'text/html; charset=utf-8')
                self.send_header('content-length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True
            allow_reuse_address = True

        self.srv = S(('127.0.0.1', 0), H)
        self.port = self.srv.server_address[1]
        self.base = f'http://127.0.0.1:{self.port}'
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()


def live_spec(tmp, base=None, **over):
    """A live-only deck: no `images`, no `runs`, one pick-one step and one try-this step."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    spec = {
        'title': 'Live fixture', 'key': 'live-fixture', 'out': 'live.html',
        'themes': ['midnight', 'light'],
        # `base` beats `offset` so a fixture can point at an ephemeral port without doing
        # arithmetic against a constant it does not care about.
        'live': {'worktree': 'live-tree', **({'base': base} if base else {})},
        'steps': [
            {'id': 'L-1', 'surface': 'Session strip', 'path': 'Header',
             'headline': 'Which pill expand feels right?',
             'live': {'surface': 'strip-expand', 'round': 1},
             'variants': [
                 {'id': 'a', 'label': 'As built', 'candidate': 'as-built', 'summary': 'Gentle overshoot.'},
                 {'id': 'b', 'label': 'Snappier', 'candidate': 'snappy', 'summary': 'Stops dead.'},
             ]},
            {'id': 'L-2', 'surface': 'Session strip', 'path': 'Header',
             'headline': 'Does the drag feel right?',
             'live': {'surface': 'strip-drag', 'round': 2, 'candidate': 'as-built'},
             'changed': 'The pill follows your cursor.', 'notice': 'No jump on release.',
             'risk': 'Widths freeze while you drag.'},
        ],
    }
    spec.update(over)
    p = os.path.join(deck, 'live.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p
