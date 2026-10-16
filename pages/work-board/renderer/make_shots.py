#!/usr/bin/env python3
"""Makes shots/: one picture per screen, sized for the Screens tab's tiles and its picture popup.

WHY (Destin, 2026-10-13: "the actual images are too small"): thumbs/ are 520px pictures of the
WHOLE window, so a 340px popup was a 120px smudge in the middle of a grey app. Here a popup, menu
or side panel is cut out at its real size using the rectangle the screenshot run recorded for it
(manifest.json `panel`), and a full screen is kept whole at 1000px wide. The real version runs
this after every screenshot run. Inputs: the run's manifest + full-size PNGs, and screen-defs.json
(the workbench screen list dumped from desktop/src/renderer/dev/workbench/screens/*.ts).
"""
import json, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1] if len(sys.argv) > 1 else '/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/shoot/20261012-141521'
man = json.load(open(os.path.join(RUN, 'manifest.json')))
defs = {d['name']: d for d in json.load(open(os.path.join(HERE, 'screen-defs.json')))}
out = os.path.join(HERE, 'shots'); os.makedirs(out, exist_ok=True)
meta = {}
for m in man:
    n = m['name']; f = m.get('file')
    if not m.get('ok') or not f or not os.path.exists(f): continue
    im = Image.open(f).convert('RGB')
    W, H = im.size
    p = m.get('panel')
    # WHY 0.6: a panel covering most of the window IS the screen (chat, marketplace); a smaller
    # one is something that opened over it, so the picture is cut to it.
    crop = bool(p) and (p['w'] * p['h']) < 0.6 * W * H
    if crop:
        pad = 8
        box = (max(0, p['x'] - pad), max(0, p['y'] - pad), min(W, p['x'] + p['w'] + pad), min(H, p['y'] + p['h'] + pad))
        im = im.crop(box)
    if im.width > 1000: im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
    dst = os.path.join(out, n.replace('/', '__') + '.jpg')
    im.save(dst, quality=74, optimize=True, progressive=True)
    meta[n] = dict(w=im.width, h=im.height, crop=crop, win=[W, H])
json.dump(meta, open(os.path.join(HERE, 'shots', 'sizes.json'), 'w'), indent=0)
print(len(meta), 'pictures')
