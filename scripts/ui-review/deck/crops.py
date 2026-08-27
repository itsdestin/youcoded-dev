"""Cut the 1:1 crops for every step × theme × run and resolve each step's highlight box.
The spec never carries coordinates: a box comes from the rig's measurement of a named element
(manifest `measures`), or from the pixel difference between the before and after crops."""
import glob
import json
import os
import subprocess

from .boxes import diff_bbox, image_size, px_to_pct, rect_to_pct
from .spec import AUTO_WARN_FRACTION, is_choice, run_names, step_themes


def image_name(crop, theme, run):
    return f'{crop}--{theme}--{run}.png'


def measure_key(hl):
    return hl['selector'] if 'selector' in hl else f'text:{hl["text"]}'


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
        if is_choice(st):
            _crop_choice(spec, st, runs[-1], out_dir, boxes, missing, cut)
            continue
        plan, shot, geo = spec['_crops'][st['crop']]
        hl = st.get('highlight', 'auto' if two else None)
        boxes[st['id']] = {}
        for theme in step_themes(spec, st):
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
                    missing.append(f'{st["id"]}: nothing differs between before and after in {theme} — name an element instead of "auto"')
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


def _crop_choice(spec, st, run, out_dir, boxes, missing, cut):
    """boxes[step][theme][variant id] — a variant without a highlight simply has no box."""
    boxes[st['id']] = {}
    for theme in step_themes(spec, st):
        per = {}
        for v in st['variants']:
            plan, shot, geo = spec['_crops'][v['crop']]
            src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
            dst = os.path.join(out_dir, image_name(v['crop'], theme, run))
            if not os.path.exists(src):
                missing.append(f'{st["id"]}/{v["id"]}: {theme}/{run} — {src} not captured')
                continue
            if dst not in cut:
                subprocess.run(['magick', src, '-crop', geo, '+repage', dst], check=True)
                cut.add(dst)
            hl = v.get('highlight')
            if not hl:
                continue
            if 'box' in hl:
                per[v['id']] = hl['box']
                continue
            entry = newest_manifest_entry(spec['runs'][run], plan, shot, theme)
            rect = ((entry or {}).get('measures') or {}).get(measure_key(hl))
            if not rect:
                missing.append(f'{st["id"]}/{v["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — add a "measure" line to the "{shot}" shot of plans/{plan}.json and re-run it')
                continue
            pct = rect_to_pct(rect, geo)
            if pct is None:
                missing.append(f'{st["id"]}/{v["id"]}: {measure_key(hl)!r} lies outside crop "{v["crop"]}" in {theme}/{run}')
                continue
            per[v['id']] = pct
        boxes[st['id']][theme] = per
