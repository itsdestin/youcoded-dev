"""Cut the 1:1 crops for every step × theme × run and resolve each step's highlight box.
The spec never carries coordinates: a box comes from the rig's measurement of a named element
(manifest `measures`), the pixel difference between the before and after crops, or (a shoot
screen) the screen's own panel.

WHY two run shapes (2026-09-26): `run-review.sh` and its `plans/*.json` are gone, replaced by
`node scripts/shoot/shoot.mjs`, whose output is `<run>/<screen name>/<theme>.png` plus ONE
`<run>/manifest.json` — no per-crop sub-rectangle, because the picture already IS the named
screen. A step names a shoot screen exactly the way it names a legacy crop — `"crop":
"settings/sound"` instead of `"crop": "send"` — so nothing about the deck's own grammar had to
grow a second field: whichever shape is found decides what a name means. Old decks, old runs,
old crop names all still resolve exactly as before (`test_crops.py` pins it)."""
import glob
import json
import os
import shutil
import subprocess

from .boxes import diff_bbox, image_size, px_to_pct, rect_to_pct
from .live import is_live
from .spec import AUTO_WARN_FRACTION, is_choice, is_page, is_words, no_pictures, step_runs, step_themes, is_clip


def image_name(crop, theme, run):
    # A shoot screen name carries "/" ("settings/sound") — flattened here (shoot.mjs's own
    # `compare/` composite names do the same) so every cut/copied file stays directly under the
    # deck's flat `images/<deck>` folder; no crop name has ever needed a nested one.
    return f'{crop.replace("/", "__")}--{theme}--{run}.png'


def measure_key(hl):
    return hl['selector'] if 'selector' in hl else f'text:{hl["text"]}'


def _plan_path(plan):
    """Where a legacy sweep's plan file lives now. WHY (2026-09-26): run-review.sh and its
    plans/*.json were replaced by shoot; every plan except site-gallery.json (still run) moved
    to plans/archive/ when the old sweep was deleted, so a message naming the old location goes
    stale the moment that happens. Named here once, so it can't drift between the two call
    sites below."""
    return 'plans/site-gallery.json' if plan == 'site-gallery' else f'plans/archive/{plan}.json'


def newest_manifest_entry(run_dir, plan, shot, theme):
    """The latest LEGACY manifest entry for (plan, shot, theme) in a run dir. Entries are
    ordered by run id first (the sweep's UI_REVIEW_RUN stamp, Task 9), then file time — the
    same rule as coverage.mjs — so an earlier sweep's late-finishing shard cannot outrank a
    newer sweep. Only ever called for a run this deck already knows is NOT shoot-shaped."""
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


def is_shoot_run(run_dir):
    """A run `shoot`/`shoot --before/--after` made names its own manifest.json AT ITS ROOT —
    the one thing an old run-review.sh run (`shots-<plan>/manifest-*.json`, one level under a
    plan folder) never has. That is the only signal; nothing else has to say which kind of run
    a folder is."""
    return bool(run_dir) and os.path.exists(os.path.join(run_dir, 'manifest.json'))


def shoot_manifest(run_dir):
    with open(os.path.join(run_dir, 'manifest.json')) as f:
        return json.load(f)


def shoot_entry(run_dir, name, theme):
    """The shoot manifest's entry for a screen name in one theme, or None. Only ever called
    after `is_shoot_run(run_dir)` — a missing manifest.json is the caller's job to check first."""
    for e in shoot_manifest(run_dir):
        if e.get('name') == name and e.get('theme') == theme:
            return e
    return None


def crop_images(spec, log=print):
    # A deck whose every step is LIVE or WORDS-ONLY has no stills and names no `images` folder
    # — the very next line would KeyError on it before the loop below ever gets a chance to skip anything.
    if no_pictures(spec):
        return {'boxes': {}, 'missing': [], 'warnings': [], 'count': 0}
    out_dir = os.path.join(spec['_base'], spec['images'])
    os.makedirs(out_dir, exist_ok=True)
    boxes, missing, warnings, cut = {}, [], [], set()
    for st in spec['steps']:
        # Per slide, not per deck: one deck may hold a one-picture slide and a before/after one.
        runs = step_runs(spec, st)
        two = len(runs) == 2
        # LIVE FIRST, before is_choice: a live pick-one has `variants` too, so is_choice()
        # claims it and _crop_choice then dies on the crop those variants deliberately lack.
        # (Same reason validate() dispatches live first.)
        if is_page(st):
            continue   # a page marker, not a step — no crop to look up
        if is_live(st):
            continue   # a running app, not a still — nothing to cut, and no `crop` to look up
        if is_words(st):
            continue   # words only (a question, a statement, a contract) — nothing to cut, no `crop` to look up
        if is_choice(st):
            _crop_choice(spec, st, runs[-1], out_dir, boxes, missing, cut)
            continue
        if is_clip(st):
            continue   # a recording, not a still — checked for existence in build_page
        # A LEGACY name resolves in the deck's own crops.json/`crops` block, exactly as before —
        # anything else is presumed to be a shoot screen name (`"settings/sound"`), checked for
        # real against each run's own manifest below. Nothing about a step's shape changes.
        legacy = st['crop'] in spec['_crops']
        if legacy:
            plan, shot, geo = spec['_crops'][st['crop']]
        hl = st.get('highlight', 'auto' if two else None)
        boxes[st['id']] = {}
        for theme in step_themes(spec, st):
            per_run = {}
            for run in runs:
                dst = os.path.join(out_dir, image_name(st['crop'], theme, run))
                panel = None   # a shoot screen's own panel box, in PIXELS of the whole picture
                if legacy:
                    src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
                    if not os.path.exists(src):
                        # A missing picture is a capture bug (see coverage.md), never a blank in the deck.
                        missing.append(f'{st["id"]}: {theme}/{run} — {src} not captured')
                        continue
                    if dst not in cut:   # steps sharing a crop share the file — cut it once
                        subprocess.run(['magick', src, '+repage', '-crop', geo, '+repage', dst], check=True)  # +repage FIRST: a hand-made picture (a film still, a crop of a crop) can carry a page offset, and -crop then misses the whole image ("geometry does not contain image") — three builds on 2026-09-10
                        cut.add(dst)
                else:
                    run_dir = spec['runs'][run]
                    entry = shoot_entry(run_dir, st['crop'], theme) if is_shoot_run(run_dir) else None
                    if not entry or not entry.get('ok'):
                        if entry:
                            reason = entry.get('reason') or 'shoot did not take this picture'
                        elif is_shoot_run(run_dir):
                            reason = f'no picture for "{st["crop"]}" in {theme} — see {os.path.join(run_dir, "manifest.json")}'
                        else:
                            reason = f'{run_dir} has no manifest.json (not a shoot run), and "{st["crop"]}" is not a name in crops.json either'
                        missing.append(f'{st["id"]}: {theme}/{run} — {reason}')
                        continue
                    if dst not in cut:   # steps sharing a crop share the file — copy it once
                        shutil.copy2(entry['file'], dst)
                        cut.add(dst)
                    panel = entry.get('panel')
                if isinstance(hl, dict) and 'box' in hl:
                    per_run[run] = hl['box']
                elif isinstance(hl, dict):
                    if legacy:
                        entry = newest_manifest_entry(spec['runs'][run], plan, shot, theme)
                        rect = ((entry or {}).get('measures') or {}).get(measure_key(hl))
                        if not rect:
                            want = json.dumps([measure_key(hl) if 'selector' in hl else {'text': hl['text']}])
                            missing.append(f'{st["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — add to the '
                                           f'"{shot}" shot of {_plan_path(plan)}:  "measure": {want}  and re-run that plan')
                            continue
                        pct = rect_to_pct(rect, geo)
                        if pct is None:
                            missing.append(f'{st["id"]}: {measure_key(hl)!r} lies outside crop "{st["crop"]}" in {theme}/{run}')
                            continue
                        per_run[run] = pct
                    else:
                        # A shoot picture names a SCREEN, not an element — there is no `measures`
                        # dict to look a selector or text up in, ever, so there is nothing a
                        # re-run of anything would fix; only the whole panel (the default below)
                        # or a hand-placed "box" apply to a shoot crop.
                        missing.append(f'{st["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — a shoot '
                                       f'picture names a screen, not an element; drop "highlight" (the screen\'s own '
                                       f'panel is boxed automatically) or give a hand-placed "box"')
                        continue
                elif hl is None and panel and os.path.exists(dst):
                    # The step gave no highlight at all: default to the screen's own panel,
                    # converted from the pixels shoot measured to percent of the picture it
                    # copied — the same conversion "auto" already does with its diff box.
                    per_run[run] = px_to_pct(panel, image_size(dst))
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
    """boxes[step][theme][variant id] — a variant without a highlight simply has no box, UNLESS
    its picture is a shoot screen, which defaults to its own panel (same rule as a still step)."""
    boxes[st['id']] = {}
    for theme in step_themes(spec, st):
        per = {}
        for v in st['variants']:
            legacy = v['crop'] in spec['_crops']
            dst = os.path.join(out_dir, image_name(v['crop'], theme, run))
            panel = None
            if legacy:
                plan, shot, geo = spec['_crops'][v['crop']]
                src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
                if not os.path.exists(src):
                    missing.append(f'{st["id"]}/{v["id"]}: {theme}/{run} — {src} not captured')
                    continue
                if dst not in cut:
                    subprocess.run(['magick', src, '+repage', '-crop', geo, '+repage', dst], check=True)  # +repage FIRST: a hand-made picture (a film still, a crop of a crop) can carry a page offset, and -crop then misses the whole image ("geometry does not contain image") — three builds on 2026-09-10
                    cut.add(dst)
            else:
                run_dir = spec['runs'][run]
                entry = shoot_entry(run_dir, v['crop'], theme) if is_shoot_run(run_dir) else None
                if not entry or not entry.get('ok'):
                    if entry:
                        reason = entry.get('reason') or 'shoot did not take this picture'
                    elif is_shoot_run(run_dir):
                        reason = f'no picture for "{v["crop"]}" in {theme} — see {os.path.join(run_dir, "manifest.json")}'
                    else:
                        reason = f'{run_dir} has no manifest.json (not a shoot run), and "{v["crop"]}" is not a name in crops.json either'
                    missing.append(f'{st["id"]}/{v["id"]}: {theme}/{run} — {reason}')
                    continue
                if dst not in cut:
                    shutil.copy2(entry['file'], dst)
                    cut.add(dst)
                panel = entry.get('panel')
            hl = v.get('highlight')
            if not hl:
                if panel and os.path.exists(dst):
                    per[v['id']] = px_to_pct(panel, image_size(dst))
                continue
            if 'box' in hl:
                per[v['id']] = hl['box']
                continue
            if not legacy:
                missing.append(f'{st["id"]}/{v["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — a shoot '
                               f'picture names a screen, not an element; drop "highlight" (the panel is boxed '
                               f'automatically) or give a hand-placed "box"')
                continue
            entry = newest_manifest_entry(spec['runs'][run], plan, shot, theme)
            rect = ((entry or {}).get('measures') or {}).get(measure_key(hl))
            if not rect:
                missing.append(f'{st["id"]}/{v["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — add a "measure" line to the "{shot}" shot of {_plan_path(plan)} and re-run it')
                continue
            pct = rect_to_pct(rect, geo)
            if pct is None:
                missing.append(f'{st["id"]}/{v["id"]}: {measure_key(hl)!r} lies outside crop "{v["crop"]}" in {theme}/{run}')
                continue
            per[v['id']] = pct
        boxes[st['id']][theme] = per
