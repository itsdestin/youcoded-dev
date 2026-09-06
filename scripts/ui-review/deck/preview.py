"""The built deck as pictures, before Destin is handed the link.

WHY this exists: on 2026-09-04 four sessions in one day served a deck carrying a header
defect that was plainly visible on the page — nobody had looked, because nothing turned a
built deck into pictures a session could read. `preview` opens every page of the deck
headless (deck/render.mjs), at several window sizes and in the themes it will open on, and
lays them out on one contact sheet a session reads in a single glance.

Nothing here opens a browser window and nothing takes the serve lock: the server it starts
lives for the length of the render and is stopped again, so previewing a deck never blocks
the `serve` that follows it."""
import json
import os
import shutil
import subprocess
import threading

from .serve import make_server
from .spec import is_page, pages

HERE = os.path.dirname(os.path.abspath(__file__))
# Three widths, because that is where the deck's own layout rules switch (see page.js): a
# wide desktop window, a laptop, and the narrowest window Destin actually uses.
DEFAULT_SIZES = ['1440x900', '1280x800', '1024x768']
CHROME = 'google-chrome-stable'


def can_render(log=print):
    """False, with the reason logged, when this machine has no browser to render with.

    The CLI asks this BEFORE it builds the deck: cutting every crop and writing the page only
    to refuse afterwards wastes minutes and leaves a half-done job behind."""
    if shutil.which(CHROME) is None:
        log(f'preview needs {CHROME} on PATH')
        return False
    return True


def page_count(spec):
    """How many `?step=` values the page answers to. A words-only deck renders one screen per
    PAGE; every other deck one screen per step. A page marker is not a step (spec.is_page)."""
    p = pages(spec)
    if p is not None:
        return len(p)
    return sum(1 for st in spec['steps'] if not is_page(st))


def preview(spec, sizes=None, themes=None, out=None, log=print):
    """Write one PNG per page x size x theme plus contact.png. Returns 0, 1 if the page logged
    an error while being shot (they are printed), or 2 if this machine has no Chrome.

    Assumes the deck is already built — the CLI calls build() first and stops if that fails."""
    # Refuse FIRST, before anything is started: a missing browser must not cost a server or a
    # half-written preview folder. (The CLI asks the same question before it builds.)
    if not can_render(log):
        return 2
    sizes = list(sizes) if sizes else list(DEFAULT_SIZES)
    # The deck opens on spec['themes'][0] and its `?theme=` switch only knows spec['themes'],
    # so the default is simply the first two it lists — after apply_live_theme has moved the
    # theme Destin's app is on to the front.
    themes = list(themes) if themes else list(spec['themes'][:2])
    unknown = [t for t in themes if t not in spec['themes']]
    if unknown:
        # Fix: the page ignores a `?theme=` it does not carry, so without this check the shot
        # would be named for a theme it is not in — a picture that lies about itself.
        log('this deck has no ' + ', '.join(unknown) + ' — it carries ' + ', '.join(spec['themes']))
        return 2
    out = out or os.path.join(spec['_base'], 'preview')
    os.makedirs(out, exist_ok=True)

    srv, url = make_server(spec, 0, lambda state: None)
    # A daemon thread, not serve(): serve() blocks until a submit and takes the deck's lock,
    # which would then refuse the real `serve` that follows this preview.
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        r = subprocess.run(
            ['node', os.path.join(HERE, 'render.mjs'), '--url', url, '--out', out,
             '--sizes', ','.join(sizes), '--themes', ','.join(themes),
             '--pages', str(page_count(spec))],
            capture_output=True, text=True)
    finally:
        # Both halves, in a finally: a render that throws must not leave a loopback server
        # holding a port for the rest of the session.
        srv.shutdown()
        srv.server_close()

    try:
        result = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        # Never guess at the cause — show what the renderer actually said.
        log(f'the renderer did not finish (exit {r.returncode}): {r.stderr.strip() or r.stdout.strip()}')
        return 1
    for f in result['files']:
        log(f)

    sheet = os.path.join(out, 'contact.png')
    if shutil.which('magick') is None:
        log('no contact sheet: magick (ImageMagick) is not on PATH — the pictures above are still there')
        return 1
    # Themes across, so the same page in two themes sits side by side and a colour-only
    # difference is one glance rather than two.
    m = subprocess.run(['magick', 'montage', *result['files'], '-tile', f'{len(themes)}x',
                        '-geometry', '+6+6', '-background', '#111', sheet],
                       capture_output=True, text=True)
    if m.returncode != 0:
        log('could not build the contact sheet: ' + (m.stderr.strip() or f'magick exit {m.returncode}'))
        return 1
    log('contact: ' + sheet)
    if result['errors']:
        log('the page logged an error while being shot:')
        for e in result['errors']:
            log('  ' + e)
        return 1
    return 0
