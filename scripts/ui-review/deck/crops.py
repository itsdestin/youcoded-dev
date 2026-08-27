"""Cut the 1:1 crops for every step × theme × run and resolve each step's highlight box.
The spec never carries coordinates: a box comes from the rig's measurement of a named element
(manifest `measures`), or from the pixel difference between the before and after crops."""
import glob
import json
import os
import subprocess

from .boxes import diff_bbox, image_size, px_to_pct, rect_to_pct
from .spec import AUTO_WARN_FRACTION, run_names


def image_name(crop, theme, run):
    return f'{crop}--{theme}--{run}.png'


def measure_key(hl):
    return hl['selector'] if 'selector' in hl else f'text:{hl["text"]}'


def _images_identical(a, b):
    """True when two same-size PNGs are pixel-identical.
    WHY: diff_bbox trims the thresholded diff to find a bounding box; when EVERY pixel in the
    crop changed (a whole-surface edit with no untouched border anywhere), ImageMagick's trim
    can't find a border to shrink from and reports the same degenerate "no box" result it uses
    for truly-identical images. `compare -metric AE` (exit 0 = identical, 1 = differs) tells
    the two apart so a whole-surface change warns instead of being misreported as "missing"."""
    r = subprocess.run(['magick', 'compare', '-metric', 'AE', a, b, 'null:'], capture_output=True, text=True)
    return r.returncode == 0


def newest_manifest_entry(run_dir, plan, shot, theme):
    """The latest manifest entry for (plan, shot, theme) in a run dir. Entries are ordered by
    run id first (the sweep's UI_REVIEW_RUN stamp, Task 9), then file time — the same rule as
    coverage.mjs — so an earlier sweep's late-finishing shard cannot outrank a newer sweep."""
    found, best = None, (-1, -1.0)
    for f in glob.glob(os.path.join(run_dir, f'shots-{plan}', 'manifest-*.json')):
        mtime = os.path.getmtime(f)
        with open(f) as fh:
            for e in json.load(fh):
                if e.get('name') == shot and e.get('theme') == theme:
                    key = (int(e['run']) if str(e.get('run') or '').isdigit() else -1, mtime)
                    if key >= best:
                        found, best = e, key
    return found


def crop_images(spec, log=print):
    out_dir = os.path.join(spec['_base'], spec['images'])
    os.makedirs(out_dir, exist_ok=True)
    runs = run_names(spec)
    two = len(runs) == 2
    boxes, missing, warnings, cut = {}, [], [], set()
    for st in spec['steps']:
        plan, shot, geo = spec['_crops'][st['crop']]
        hl = st.get('highlight', 'auto' if two else None)
        boxes[st['id']] = {}
        for theme in spec['themes']:
            per_run = {}
            for run in runs:
                src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
                dst = os.path.join(out_dir, image_name(st['crop'], theme, run))
                if not os.path.exists(src):
                    # A missing picture is a capture bug (see coverage.md), never a blank in the deck.
                    missing.append(f'{st["id"]}: {theme}/{run} — {src} not captured')
                    continue
                if dst not in cut:   # steps sharing a crop share the file — cut it once
                    subprocess.run(['magick', src, '-crop', geo, '+repage', dst], check=True)
                    cut.add(dst)
                if isinstance(hl, dict) and 'box' in hl:
                    per_run[run] = hl['box']
                elif isinstance(hl, dict):
                    entry = newest_manifest_entry(spec['runs'][run], plan, shot, theme)
                    rect = ((entry or {}).get('measures') or {}).get(measure_key(hl))
                    if not rect:
                        want = json.dumps([measure_key(hl) if 'selector' in hl else {'text': hl['text']}])
                        missing.append(f'{st["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — add to the '
                                       f'"{shot}" shot of plans/{plan}.json:  "measure": {want}  and re-run that plan')
                        continue
                    pct = rect_to_pct(rect, geo)
                    if pct is None:
                        missing.append(f'{st["id"]}: {measure_key(hl)!r} lies outside crop "{st["crop"]}" in {theme}/{run}')
                        continue
                    per_run[run] = pct
            paths = [os.path.join(out_dir, image_name(st['crop'], theme, r)) for r in runs]
            if hl == 'auto' and all(os.path.exists(p) for p in paths):
                box = diff_bbox(paths[0], paths[1])
                if box is None:
                    if _images_identical(paths[0], paths[1]):
                        missing.append(f'{st["id"]}: nothing differs between before and after in {theme} — name an element instead of "auto"')
                    else:
                        # The pictures differ but diff_bbox still returned None: a whole-surface
                        # edit with no untouched border anywhere (see _images_identical). Report
                        # it as the maximal share so it goes through the warning path below.
                        warnings.append(f'{st["id"]}: the change covers 100% of the crop in {theme} — whole-surface change, name an element instead')
                        per_run = {r: [0.0, 0.0, 100.0, 100.0] for r in runs}
                else:
                    size = image_size(paths[0])
                    share = box['w'] * box['h'] / (size[0] * size[1])
                    if share > AUTO_WARN_FRACTION:
                        warnings.append(f'{st["id"]}: the change covers {round(share * 100)}% of the crop in {theme} — whole-surface change, name an element instead')
                    pct = px_to_pct(box, size)
                    per_run = {r: pct for r in runs}
            boxes[st['id']][theme] = per_run
    for m in missing:
        log('missing: ' + m)
    return {'boxes': boxes, 'missing': missing, 'warnings': warnings, 'count': len(cut)}
