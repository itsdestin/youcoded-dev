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
    crop = crop_key(crop)
    # A shoot screen name carries "/" ("settings/sound") — flattened here (shoot.mjs's own
    # `compare/` composite names do the same) so every cut/copied file stays directly under the
    # deck's flat `images/<deck>` folder; no crop name has ever needed a nested one.
    # "#" too (2026-10-02): a screen STATE (`first-run#authenticate`) kept its "#" in the file
    # name, and in the page's <img src> a "#" starts a URL fragment, so the browser asked for a
    # file that does not exist and the deck never finished laying out.
    return f'{crop.replace("/", "__").replace("#", "~")}--{theme}--{run}.png'


def is_composite(crop):
    """A crop that is a LIST of pictures laid side by side into one (see compose_pieces)."""
    return isinstance(crop, list)


def piece_crop(piece):
    """One piece of a composite: a crop name, or {"crop": name, "label": words}."""
    return piece['crop'] if isinstance(piece, dict) else piece


def piece_label(piece):
    return (piece.get('label') or '') if isinstance(piece, dict) else ''


def crop_key(crop):
    """The one string a crop is filed under. A composite joins its pieces with "+"; labels are
    part of the picture, so they change the key too (a short hash, never the words themselves).
    WHY a hash past 120 characters: three region crops spelled out can pass a file system's
    255-byte name limit once the theme and run are added."""
    if not is_composite(crop):
        return crop
    import hashlib
    names = '+'.join(piece_crop(p) for p in crop)
    labels = [piece_label(p) for p in crop]
    tag = hashlib.sha1(json.dumps([names, labels]).encode()).hexdigest()[:8]
    if len(names) > 120:
        return f'compose-{tag}'
    return names + (f'~{tag}' if any(labels) else '')


def is_focus_crop(crop):
    """A region close-up or a composite: the picture itself is already the focus, so a
    one-picture slide needs no box drawn over it (and none is drawn by default)."""
    return is_composite(crop) or split_region(crop)[1] is not None


# Gap between composed pieces and the height of a label strip, in CSS pixels (scaled with the
# picture). 16 is the guide's "between groups" step; 14px label text is the app's body size.
COMPOSE_GAP, LABEL_STRIP, LABEL_PT = 16, 30, 14


def _label_colour(theme):
    """The theme's own text colour for a composite's labels. The gaps and label strips are
    see-through, so the deck page (drawn in the same theme) shows between the pieces — a
    solid strip in the theme's canvas read as a white band over a wallpaper theme (2026-10-05)."""
    try:
        from .build import theme_tokens   # build.py imports this module; import at call time
        return theme_tokens([theme])[theme].get('fg') or '#808080'
    except Exception:
        return '#808080'


_FONT = []


def _label_font():
    """A plain sans-serif for labels: ImageMagick's own default is a serif italic that looks
    like nothing in the app. fc-match names the system's sans; without it, magick's default."""
    if not _FONT:
        try:
            out = subprocess.run(['fc-match', '-f', '%{file}', 'sans-serif:medium'], capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:
            out = ''
        _FONT.append(out if out and os.path.exists(out) else None)
    return _FONT[0]


def _cut_one(spec, name, theme, run, dst):
    """Cut ONE named picture (legacy crop, shoot screen, or shoot screen@region) to `dst`.
    Returns (scale, None) or (None, reason) — the same lookups the single-crop path makes."""
    if name in spec['_crops']:
        plan, shot, geo = spec['_crops'][name]
        src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
        if not os.path.exists(src):
            return None, f'{src} not captured'
        subprocess.run(['magick', src, '+repage', '-crop', geo, '+repage', dst], check=True)
        return 1, None
    run_dir = spec['runs'][run]
    screen, region = split_region(name)
    entry = shoot_entry(run_dir, screen, theme) if is_shoot_run(run_dir) else None
    if not entry or not entry.get('ok'):
        if entry:
            return None, entry.get('reason') or 'shoot did not take this picture'
        if is_shoot_run(run_dir):
            return None, f'no picture for "{name}" in {theme} — see {os.path.join(run_dir, "manifest.json")}'
        return None, f'{run_dir} has no manifest.json (not a shoot run), and "{name}" is not a name in crops.json either'
    copy_shoot_picture(entry, dst, region)
    return entry.get('scale') or 1, None


def compose_pieces(spec, crop, theme, run, dst):
    """Lay several pictures side by side into ONE picture at `dst`, top-aligned, a see-through
    gap between them, and an optional label over each (in the theme's text colour). Returns a list of reasons
    for pieces that could not be cut (empty when the picture was written).

    WHY (games-social friction, proposal 4): three rounds running needed hand-cut composites —
    three connection states side by side, and each concept as a folded + opened pair — cut by
    a throwaway script into a fake `shots-<plan>` folder and named through `crops`. A list crop
    does it from the screens themselves, so the pieces are re-cut whenever the run is re-shot."""
    import tempfile
    bg, fg, font = 'none', _label_colour(theme), _label_font()
    reasons, parts, scale = [], [], 1
    with tempfile.TemporaryDirectory() as tmp:
        for i, piece in enumerate(crop):
            part = os.path.join(tmp, f'{i}.png')
            k, why = _cut_one(spec, piece_crop(piece), theme, run, part)
            if why:
                reasons.append(f'piece {i + 1} ("{piece_crop(piece)}"): {why}')
                continue
            scale = max(scale, k)
            parts.append((part, piece_label(piece)))
        if reasons:
            return reasons
        if any(label for _, label in parts):
            # Every piece gets the strip (empty or not), so the pictures under it stay level.
            strip, pt = round(LABEL_STRIP * scale), round(LABEL_PT * scale)
            for part, label in parts:
                cmd = ['magick', part, '-background', bg, '-gravity', 'North', '-splice', f'0x{strip}']
                if label:
                    cmd += (['-font', font] if font else []) + ['-fill', fg, '-pointsize', str(pt),
                                                                '-annotate', f'+0+{round((strip - pt) / 2)}', label]
                subprocess.run(cmd + [part], check=True)
        gap = round(COMPOSE_GAP * scale)
        cmd = ['magick']
        for i, (part, _) in enumerate(parts):
            if i:
                cmd += ['-size', f'{gap}x1', f'xc:{bg}']
            cmd.append(part)
        subprocess.run(cmd + ['-background', bg, '-gravity', 'North', '+append', '+repage', dst], check=True)
    return []


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


def split_region(crop):
    """`"<shoot screen>@WxH+X+Y"` → (screen, geometry), else (crop, None).
    WHY (marketplace-detail friction, proposal 9a): a choice between four like buttons showed
    four whole 1440×900 windows with a 40px difference in each; the author had to cut close-ups
    by hand into a `shots-<plan>` folder. A region after the screen name crops the shoot picture
    itself. The geometry is in the screen's CSS pixels (the 1440×900 shot's own coordinates),
    whatever density the picture was taken at."""
    if '@' in crop:
        name, geo = crop.rsplit('@', 1)
        if geo and geo[0].isdigit():
            return name, geo
    return crop, None


def _scaled_geo(geo, scale):
    """WxH+X+Y in CSS pixels → the same region in picture pixels at `scale`."""
    import re
    m = re.fullmatch(r'(\d+)x(\d+)\+(\d+)\+(\d+)', geo)
    if not m:
        raise ValueError(f'region "{geo}" is not WxH+X+Y')
    w, h, x, y = (round(int(v) * scale) for v in m.groups())
    return f'{w}x{h}+{x}+{y}'


def scaled_panel(entry):
    """A shoot entry's panel box in PICTURE pixels. shoot measures it in CSS pixels; a picture
    taken at 1.5× (shoot's default for review pictures since 2026-10-05) is 1.5× larger, so an
    unscaled box would be drawn in the wrong place. Old manifests carry no `scale` and were 1×."""
    panel = entry.get('panel')
    if not panel:
        return None
    k = entry.get('scale') or 1
    return {key: panel[key] * k for key in ('x', 'y', 'w', 'h')}


def panel_in_region(entry, region):
    """A shoot entry's panel in the PIXELS of a close-up cut at `region` (WxH+X+Y, CSS pixels),
    clipped to the close-up; 'outside' when they do not overlap; None with no panel recorded.
    WHY (submit-ticket friction, proposal 11): a close-up of one popup is exactly where "the
    panel" is the element, yet it was refused there while "auto" warned "whole-surface"."""
    import re
    p = entry.get('panel')
    m = re.fullmatch(r'(\d+)x(\d+)\+(\d+)\+(\d+)', region or '')
    if not p or not m:
        return None
    w, h, x, y = (int(v) for v in m.groups())
    left, top = max(p['x'], x), max(p['y'], y)
    right, bottom = min(p['x'] + p['w'], x + w), min(p['y'] + p['h'], y + h)
    if right <= left or bottom <= top:
        return 'outside'
    k = entry.get('scale') or 1
    return {'x': (left - x) * k, 'y': (top - y) * k, 'w': (right - left) * k, 'h': (bottom - top) * k}


def copy_shoot_picture(entry, dst, region):
    """Copy a shoot picture into the deck's images, or cut the named region out of it."""
    if not region:
        shutil.copy2(entry['file'], dst)
        return
    geo = _scaled_geo(region, entry.get('scale') or 1)
    subprocess.run(['magick', entry['file'], '+repage', '-crop', geo, '+repage', dst], check=True)


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
            _crop_choice(spec, st, runs[-1], out_dir, boxes, missing, cut, warnings)
            continue
        if is_clip(st):
            continue   # a recording, not a still — checked for existence in build_page
        # A LEGACY name resolves in the deck's own crops.json/`crops` block, exactly as before —
        # anything else is presumed to be a shoot screen name (`"settings/sound"`), checked for
        # real against each run's own manifest below. Nothing about a step's shape changes.
        composite = is_composite(st['crop'])
        legacy = not composite and st['crop'] in spec['_crops']
        if legacy:
            plan, shot, geo = spec['_crops'][st['crop']]
        hl = st.get('highlight', 'auto' if two else None)
        boxes[st['id']] = {}
        for theme in step_themes(spec, st):
            per_run = {}
            for run in runs:
                dst = os.path.join(out_dir, image_name(st['crop'], theme, run))
                panel = None   # a shoot screen's own panel box, in PIXELS of the whole picture
                region_panel = None   # on a close-up: that panel in the close-up's own pixels, or 'outside'
                if composite:
                    # Several pictures side by side: no single panel to box; the picture is the focus.
                    if dst not in cut:
                        why = compose_pieces(spec, st['crop'], theme, run, dst)
                        if why:
                            missing.extend(f'{st["id"]}: {theme}/{run} — {w}' for w in why)
                            continue
                        cut.add(dst)
                elif legacy:
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
                    screen, region = split_region(st['crop'])
                    entry = shoot_entry(run_dir, screen, theme) if is_shoot_run(run_dir) else None
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
                        copy_shoot_picture(entry, dst, region)
                        cut.add(dst)
                    # A region is already the focus: no default panel box drawn over it — but
                    # "panel" asked for on a close-up boxes the panel inside it (below).
                    panel = None if region else scaled_panel(entry)
                    region_panel = panel_in_region(entry, region) if region else None
                if isinstance(hl, dict) and 'box' in hl:
                    per_run[run] = hl['box']
                elif isinstance(hl, dict):
                    if composite:
                        missing.append(f'{st["id"]}: a picture made of several screens has no element to '
                                       f'measure — drop "highlight", use "auto" on two runs, or a hand-placed "box"')
                        continue
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
                elif hl == 'panel':
                    # The screen's own panel in every run — a whole-page change, said plainly.
                    if panel and os.path.exists(dst):
                        per_run[run] = px_to_pct(panel, image_size(dst))
                    elif region_panel == 'outside':
                        missing.append(f'{st["id"]}: {theme}/{run} — the screen\'s panel lies outside the close-up "{st["crop"]}"')
                    elif region_panel and os.path.exists(dst):
                        per_run[run] = px_to_pct(region_panel, image_size(dst))
                    else:
                        missing.append(f'{st["id"]}: {theme}/{run} has no panel box to draw (a region crop, or an old picture)')
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
                        warnings.append(f'{st["id"]}: the change covers {round(share * 100)}% of the crop in {theme} — whole-surface change: '
                                        f'use "highlight": "panel" (boxes the screen\'s own panel, on a close-up too) or a hand-placed "box"')
                    pct = px_to_pct(box, size)
                    per_run = {r: pct for r in runs}
            boxes[st['id']][theme] = per_run
    for m in missing:
        log('missing: ' + m)
    return {'boxes': boxes, 'missing': missing, 'warnings': warnings, 'count': len(cut)}


def _crop_choice(spec, st, run, out_dir, boxes, missing, cut, warnings):
    """boxes[step][theme][variant id] — a variant without a highlight simply has no box, UNLESS
    its picture is a shoot screen, which defaults to its own panel (same rule as a still step)."""
    boxes[st['id']] = {}
    for theme in step_themes(spec, st):
        per = {}
        for v in st['variants']:
            composite = is_composite(v['crop'])
            legacy = not composite and v['crop'] in spec['_crops']
            dst = os.path.join(out_dir, image_name(v['crop'], theme, run))
            panel = None
            if composite:
                if dst not in cut:
                    why = compose_pieces(spec, v['crop'], theme, run, dst)
                    if why:
                        missing.extend(f'{st["id"]}/{v["id"]}: {theme}/{run} — {w}' for w in why)
                        continue
                    cut.add(dst)
            elif legacy:
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
                screen, region = split_region(v['crop'])
                entry = shoot_entry(run_dir, screen, theme) if is_shoot_run(run_dir) else None
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
                    copy_shoot_picture(entry, dst, region)
                    cut.add(dst)
                panel = None if region else scaled_panel(entry)
            hl = v.get('highlight')
            if not hl:
                if panel and os.path.exists(dst):
                    per[v['id']] = px_to_pct(panel, image_size(dst))
                continue
            if 'box' in hl:
                per[v['id']] = hl['box']
                continue
            if not legacy:   # a shoot screen or a composite: nothing was measured
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
        _warn_choice_overflow(st, theme, [os.path.join(out_dir, image_name(v['crop'], theme, run)) for v in st['variants']], warnings)


def _warn_choice_overflow(st, theme, paths, warnings):
    """A choice slide's pictures sit in ONE row, every one drawn at the same scale — and the page
    picks that scale from the FIRST picture's width. So a later picture wider than the first
    makes the row wider than the screen: the first and last pictures are cut off at the edges,
    silently. WHY (games-social friction, proposal 6): round 4's three drafts were 340 / 420 /
    420 wide and the deck cut two of them; nothing said so until the preview was read."""
    sizes = [image_size(p) for p in paths if os.path.exists(p)]
    if len(sizes) < 2:
        return
    first = sizes[0][0]
    total = sum(w for w, _ in sizes)
    if total > first * len(sizes) * 1.02:
        over = round((total / (first * len(sizes)) - 1) * 100)
        shown = ', '.join(f'{w}x{h}' for w, h in sizes)
        warnings.append(f'{st["id"]}: its pictures are different widths in {theme} ({shown}) — the page sizes the row '
                        f'by the first one, so the row is about {over}% too wide and the outer pictures get cut off. '
                        f'Crop every design to one size, or put the widest first')
