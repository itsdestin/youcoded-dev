# scripts/ui-review/deck/build.py
"""Assemble one self-describing HTML page: page.html.tmpl + page.css + page.js + the theme tokens
+ the deck data as one JSON object. Refuses when a picture or a box is missing, or a writing
rule is broken — a deck with a hole in it is worse than no deck (spec §5)."""
import html
import json
import os

from .crops import image_name
from .live import has_live, is_live, live_base, live_offset, pane_url, pane_width
from .spec import SpecError, all_themes, is_choice, is_decide, run_names, step_themes, validate, workspace_root, is_clip, clip_files

HERE = os.path.dirname(os.path.abspath(__file__))
NICE = {'midnight': 'Midnight', 'dark': 'Dark', 'light': 'Light', 'creme': 'Crème', 'halftone-dimension': 'Halftone', 'meadow-mist': 'Meadow'}
TOKEN_KEYS = ['canvas', 'panel', 'inset', 'well', 'accent', 'on-accent', 'fg', 'fg-2', 'fg-dim', 'fg-muted', 'fg-faint', 'edge', 'link']
RADIUS_KEYS = ['radius-sm', 'radius-md', 'radius-lg']


def theme_tokens(themes):
    """Built-ins from tokens.json; community themes from their manifest (tokens + shape radii + dark flag)."""
    with open(os.path.join(HERE, 'tokens.json')) as f:
        builtin = json.load(f)
    # Community themes live in the wecoded-themes checkout at the WORKSPACE root — a worktree has none.
    theme_dirs = [os.path.join(workspace_root(), 'wecoded-themes', 'themes')]
    out = {}
    for t in themes:
        if t in builtin:
            out[t] = builtin[t]
            continue
        for d in theme_dirs:
            mf = os.path.join(d, t, 'manifest.json')
            if os.path.exists(mf):
                with open(mf) as f:
                    m = json.load(f)
                tok = {k: v for k, v in m.get('tokens', {}).items() if k in TOKEN_KEYS}
                tok.setdefault('link', tok.get('accent', '#58A6FF'))
                for k in RADIUS_KEYS:
                    if k in (m.get('shape') or {}):
                        tok[k] = m['shape'][k]
                tok['_dark'] = bool(m.get('dark', True))
                out[t] = tok
                break
        else:
            raise SpecError(f'no tokens for theme "{t}" (not built in, no manifest under {theme_dirs})')
    return out


def tokens_css(tokens):
    lines = []
    for t, tok in tokens.items():
        decl = ';'.join(f'--{k}:{v}' for k, v in tok.items() if not k.startswith('_'))
        # Fix: page.css's defaults live on a bare `:root{...}` (specificity 0,1,0) and match <html> too,
        # so a plain `[data-theme]` selector (also 0,1,0) tied on specificity — later-in-source page.css
        # won — and a community theme's radius (e.g. Halftone's 16px) never applied. `:root[data-theme]`
        # is 0,2,0, so the theme tokens always outrank the page defaults regardless of <style> order.
        lines.append(f':root[data-theme="{t}"]{{{decl};color-scheme:{"dark" if tok.get("_dark", True) else "light"}}}')
    return '\n'.join(lines)


def _choice_step(spec, st, boxes, run):
    return {
        'id': st['id'], 'kind': 'choice', 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
        'notice': st.get('notice', ''), 'risk': st.get('risk', ''),
        'variants': [{'id': v['id'], 'label': v['label'], 'summary': v['summary'], 'measured': v.get('measured', ''), 'risk': v.get('risk', '')} for v in st['variants']],
        'images': {t: {v['id']: f'{spec["images"]}/{image_name(v["crop"], t, run)}' for v in st['variants']} for t in step_themes(spec, st)},
        'boxes': boxes.get(st['id'], {}),
        **({'themes': list(st['themes'])} if st.get('themes') else {}),
    }


def _decide_step(spec, st, boxes, runs):
    """One picture (the last run — how it is today) and the written options beside it."""
    return {
        'id': st['id'], 'kind': 'decide', 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
        'notice': st.get('notice', ''), 'risk': st.get('risk', ''),
        'options': [{'id': o['id'], 'label': o['label'], 'summary': o['summary'],
                     'measured': o.get('measured', ''), 'cost': o.get('cost', '')} for o in st['options']],
        'images': {t: {r: f'{spec["images"]}/{image_name(st["crop"], t, r)}' for r in runs} for t in step_themes(spec, st)},
        'boxes': boxes.get(st['id'], {}),
        **({'themes': list(st['themes'])} if st.get('themes') else {}),
    }


def _clip_step(spec, st, runs):
    """Before | After (or Today) as recordings. No boxes: motion is the highlight."""
    vids, posters = clip_files(spec, st)
    return {'id': st['id'], 'kind': 'clip', 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
            'changed': st['changed'], 'measured': st.get('measured', ''), 'notice': st['notice'], 'risk': st.get('risk', ''),
            'clips': {r: vids[r] for r in runs},
            'posters': {r: (posters[r] if posters[r] and os.path.exists(os.path.join(spec['_base'], posters[r])) else '') for r in runs}}


def _live_step(spec, st):
    """Panes onto the RUNNING app instead of pictures. One pane for a try-this, one per
    variant for a pick-one — the question shape is the existing one, only the picture is new.

    `url` is both the pane's address and its pop-out link: "open on its own" is this same
    candidate in a new tab, which is room and quiet, not a different rendering."""
    live = st['live']
    theme = spec['themes'][0]   # first paint; every later theme change goes by message, not by reload
    if st.get('variants'):
        panes = [{'id': v['id'], 'label': v['label'], 'summary': v['summary'],
                  'measured': v.get('measured', ''), 'risk': v.get('risk', ''),
                  'url': pane_url(spec, live, v['candidate'], theme)} for v in st['variants']]
    else:
        panes = [{'id': live['candidate'], 'label': '', 'summary': '', 'measured': '', 'risk': '',
                  'url': pane_url(spec, live, live['candidate'], theme)}]
    return {
        'id': st['id'], 'kind': 'live',
        # `kind` is spent on where the picture comes from, so the QUESTION shape rides
        # separately: `variants` in the spec still means pick-one, their absence still means
        # yes/no. Without this the page falls through to the approve branch and a pick-one
        # renders Yes/No buttons over panes nobody can choose between.
        'shape': 'choice' if st.get('variants') else 'approve',
        'surface': st['surface'], 'path': st['path'],
        'headline': st['headline'], 'changed': st.get('changed', ''), 'measured': st.get('measured', ''),
        'notice': st.get('notice', ''), 'risk': st.get('risk', ''),
        'panes': panes,
        'width': live.get('paneWidth', pane_width(spec)),
        'height': live.get('height'),
        **({'themes': list(st['themes'])} if st.get('themes') else {}),
    }


def deck_data(spec, boxes):
    runs = run_names(spec)
    steps = [_live_step(spec, st) if is_live(st)
             else _choice_step(spec, st, boxes, runs[-1]) if is_choice(st)
             else _decide_step(spec, st, boxes, runs) if is_decide(st)
             else _clip_step(spec, st, runs) if is_clip(st) else {
        'id': st['id'], 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
        'changed': st['changed'], 'measured': st.get('measured', ''), 'notice': st['notice'], 'risk': st.get('risk', ''),
        'images': {t: {r: f'{spec["images"]}/{image_name(st["crop"], t, r)}' for r in runs} for t in step_themes(spec, st)},
        'boxes': boxes.get(st['id'], {}),
        # Only when the step narrows the deck's list — page.js falls back to DECK.themes otherwise.
        **({'themes': list(st['themes'])} if st.get('themes') else {}),
    } for st in spec['steps']]
    every = all_themes(spec)
    # `command` is spelled HERE, where the offset and the worktree are both known, so the
    # "server isn't running" card can name the exact thing to run instead of guessing.
    tree = (spec.get('live') or {}).get('worktree', '')
    live = {'live': {
        'base': live_base(spec),
        'worktree': tree,
        'command': f'YOUCODED_PORT_OFFSET={live_offset(spec)} bash scripts/run-workbench.sh {tree}',
    }} if has_live(spec) else {}
    return {**live, 'title': spec['title'], 'key': spec['key'], 'runs': runs,
            'runLabels': {'before': 'Before', 'after': 'After', 'today': 'Today', **spec.get('labels', {})},
            'themes': spec['themes'], 'themeNames': {t: NICE.get(t, t.replace('-', ' ').title()) for t in every},
            'steps': steps}


def build_page(spec, boxes):
    errors, warnings = validate(spec)
    runs = run_names(spec)
    for st in spec['steps']:
        if is_live(st):
            continue   # nothing on disk to check — the pane is a running app; page.js probes the server
        if is_clip(st):
            vids, _ = clip_files(spec, st)
            for r in runs:
                if not vids[r] or not os.path.exists(os.path.join(spec['_base'], vids[r])):
                    errors.append(f'{st["id"]}: no recording for {r} ({vids[r]}) — run `scripts/ui-review/record-pair.sh <scene> <before> <after> {os.path.join(spec["images"], "clips")}`')
            continue
        for t in step_themes(spec, st):
            if is_choice(st):
                for v in st['variants']:
                    if not os.path.exists(os.path.join(spec['_base'], spec['images'], image_name(v['crop'], t, runs[-1]))):
                        errors.append(f'{st["id"]}/{v["id"]}: no picture for {t} — check coverage.md for that shot')
                    if v.get('highlight') and v['id'] not in (boxes.get(st['id'], {}).get(t) or {}):
                        errors.append(f'{st["id"]}/{v["id"]}: no highlight box for {t} — `crop` could not resolve it (see its output)')
                continue
            for r in runs:
                if not os.path.exists(os.path.join(spec['_base'], spec['images'], image_name(st['crop'], t, r))):
                    errors.append(f'{st["id"]}: no picture for {t}/{r} — run `crop` (and check coverage.md for that shot)')
            have = boxes.get(st['id'], {}).get(t) or {}
            if not all(r in have for r in runs):
                errors.append(f'{st["id"]}: no highlight box for {t} — `crop` could not resolve it (see its output)')
    if errors:
        raise SpecError('\n'.join(errors))

    def read(name):
        with open(os.path.join(HERE, name)) as f:
            return f.read()
    page = read('page.html.tmpl')
    page = page.replace('/*TOKENS*/', tokens_css(theme_tokens(all_themes(spec)))).replace('/*CSS*/', read('page.css')).replace('/*JS*/', read('page.js'))
    # `</` inside the JSON would end the <script>; escaping it keeps the JSON valid.
    # Fix: first paint was always Midnight regardless of the spec's own theme order — the template
    # hardcoded data-theme="midnight" on <html>, so any deck whose first theme isn't Midnight flashed
    # the wrong palette before page.js's render() ran. Substitute the spec's actual first theme.
    page = page.replace('__TITLE__', html.escape(spec['title'])).replace('__THEME__', html.escape(spec['themes'][0]))
    page = page.replace('__DECK__', json.dumps(deck_data(spec, boxes)).replace('</', '<\\/'))
    return page, warnings
