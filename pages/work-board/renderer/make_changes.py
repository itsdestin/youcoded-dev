#!/usr/bin/env python3
"""Makes <run>/board/: the pictures and facts the Screens tab needs to show "Changed since <release>".

WHY (Destin, 2026-11-04: "we already have a screenshots page in the dev board that should've gotten you 90%
there"): the comparison lives in the work board's own Screens tab and picture popup, not a page of its own.
A what-changed run (scripts/shoot/what-changed.mjs) photographs every screen on the release and on today's
code; this turns that run into what the tab already reads, the same way make_shots.py does for a plain run:
  board/shots/<f>.jpg       today's picture, cut to its popup or panel (make_shots.py's rule), for the tiles
  board/thumbs/<f>.jpg      today's whole window, for the popup's "see the whole window"
  board/sizes.json          each tile picture's size and whether it was cut out
  board/cmp/<theme>/<f>.before.jpg / .after.jpg   both sides at the window's real size (1440 wide), so a
                            change's box (CSS pixels, FORMAT.md) lands on the picture with no rescaling
  board/changes.json        per screen and theme: status and its changes, from the run's changes.json
  board/screen-defs.json    the screen list with tags, from `shoot --list` (new screens get their kind)
Usage: python3 make_changes.py <run folder> [--tile-theme meadow-mist]
"""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
RUN = os.path.abspath(sys.argv[1])
TILE_THEME = sys.argv[sys.argv.index('--tile-theme') + 1] if '--tile-theme' in sys.argv else 'meadow-mist'
OUT = os.path.join(RUN, 'board')

# WHY (Destin, 2026-11-07: "ONLY include real, built-in pages that are intended to ship with the app"): the
# same rule as what-changed.mjs's NOT_SHIPPED, so a run taken before that rule shows the same list
NOT_SHIPPED = [re.compile(r'^pages/(page|focus)/page-'), re.compile(r'^dev/(icons|pills|open-tasks)(#|$)')]
def shipped(n): return not any(r.search(n) for r in NOT_SHIPPED)

def fname(n):  # make_shots.py's rule; the page asks for '#' as %23, which the server reads back as '#'
    return n.replace('/', '__') + '.jpg'

def tile(m):
    """make_shots.py's cut, with the run's 1.5x pictures: the panel box is in CSS pixels."""
    im = Image.open(m['file']).convert('RGB')
    W, H = im.size
    s = m.get('scale') or 1
    p = m.get('panel')
    crop = bool(p) and (p['w'] * p['h'] * s * s) < 0.6 * W * H
    win = im.resize((1000, round(H * 1000 / W)), Image.LANCZOS) if W > 1000 else im
    if crop:
        pad = 8 * s
        im = im.crop((max(0, int(p['x'] * s - pad)), max(0, int(p['y'] * s - pad)), min(W, int((p['x'] + p['w']) * s + pad)), min(H, int((p['y'] + p['h']) * s + pad))))
    if im.width > 1000: im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
    f = fname(m['name'])
    im.save(os.path.join(OUT, 'shots', f), quality=78, optimize=True, progressive=True)
    win.save(os.path.join(OUT, 'thumbs', f), quality=78, optimize=True, progressive=True)
    return m['name'], dict(w=im.width, h=im.height, crop=crop, win=[W, H])

def side_pic(src, dst, scale):
    im = Image.open(src).convert('RGB')
    css_w = round(im.width / scale)
    if im.width != css_w: im = im.resize((css_w, round(im.height * css_w / im.width)), Image.LANCZOS)
    im.save(dst, quality=80, optimize=True, progressive=True)

def screen_defs():
    """`shoot --list` prints 'name   tag, tag  [scenario x]'; the tab's kind rules read the tags."""
    old = {d['name']: d for d in json.load(open(os.path.join(HERE, 'screen-defs.json')))}
    try:
        out = subprocess.run(['node', os.path.join(WS, 'scripts', 'shoot', 'shoot.mjs'), '--list'], cwd=WS, capture_output=True, text=True, timeout=600).stdout
    except Exception:
        return list(old.values())
    for line in out.splitlines():
        m = re.match(r'^(\S+)\s+(.*?)(\s+\[scenario [^\]]+\])?$', line)
        if not m or '/' not in m.group(1) and not re.match(r'^[a-z][\w#-]*$', m.group(1)): continue
        tags = [t.strip() for t in m.group(2).split(',') if t.strip()]
        old.setdefault(m.group(1), dict(name=m.group(1), tags=tags, viewport=None, open=None))['tags'] = tags
    return list(old.values())

def main():
    for d in ('shots', 'thumbs'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
    ch = json.load(open(os.path.join(RUN, 'changes.json')))
    ch['screens'] = [x for x in ch['screens'] if shipped(x['name'])]
    man = [m for m in json.load(open(os.path.join(RUN, 'after', 'manifest.json'))) if m.get('ok') and m['theme'] == TILE_THEME and os.path.exists(m.get('file') or '')]
    jobs = []
    for s in ch['screens']:
        if s['status'] == 'failed': continue
        d = os.path.join(OUT, 'cmp', s['theme']); os.makedirs(d, exist_ok=True)
        f = fname(s['name'])[:-4]
        # WHY the window's CSS size: boxes are CSS pixels (FORMAT.md), so they land with no rescaling (a phone
        # screen keeps its phone width)
        for k in ('before', 'after'):
            if s.get(k): jobs.append((os.path.join(RUN, s[k]), os.path.join(d, f + '.' + k + '.jpg'), s.get('scale') or 1.5))
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        sizes = dict(ex.map(tile, man))
        list(ex.map(lambda j: side_pic(*j), jobs))
    json.dump(sizes, open(os.path.join(OUT, 'sizes.json'), 'w'), indent=0)
    keep = ('kind', 'role', 'name', 'oldText', 'newText', 'words', 'styleChanges', 'box', 'beforeBox', 'side', 'field')
    by = {}
    for s in ch['screens']:
        vw = vh = None
        pic = s.get('after') or s.get('before')
        if pic and s['status'] != 'failed' and os.path.exists(os.path.join(RUN, pic)):
            with Image.open(os.path.join(RUN, pic)) as im: vw, vh = round(im.width / (s.get('scale') or 1.5)), round(im.height / (s.get('scale') or 1.5))
        by.setdefault(s['name'], {})[s['theme']] = dict(vw=vw, vh=vh,
            status=s['status'], reason=s.get('reason'), unstable=s.get('unstable', 0),
            shift=s.get('shift'),
            before=bool(s.get('before')) and s['status'] != 'failed', after=bool(s.get('after')) and s['status'] != 'failed',
            changes=[{k: c[k] for k in keep if c.get(k) is not None} for c in s.get('changes', [])])
    json.dump(dict(before=ch['before'], after=ch['after'], themes=ch['themes'], tileTheme=TILE_THEME, screens=by),
              open(os.path.join(OUT, 'changes.json'), 'w'))
    json.dump(screen_defs(), open(os.path.join(OUT, 'screen-defs.json'), 'w'))
    print(f'{len(sizes)} tile pictures, {len(jobs)} comparison pictures → {OUT}')

if __name__ == '__main__':
    main()
