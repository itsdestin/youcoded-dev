# scripts/ui-review/deck/build.py
"""Assemble one self-describing HTML page: page.html.tmpl + page.css + page.js + the theme tokens
+ the deck data as one JSON object. Refuses when a picture or a box is missing, or a writing
rule is broken — a deck with a hole in it is worse than no deck (spec §5)."""
import html
import json
import os

from .crops import image_name
from .spec import SpecError, run_names, validate, workspace_root

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
        lines.append(f'[data-theme="{t}"]{{{decl};color-scheme:{"dark" if tok.get("_dark", True) else "light"}}}')
    return '\n'.join(lines)


def deck_data(spec, boxes):
    runs = run_names(spec)
    steps = [{
        'id': st['id'], 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
        'changed': st['changed'], 'measured': st.get('measured', ''), 'notice': st['notice'], 'risk': st.get('risk', ''),
        'images': {t: {r: f'{spec["images"]}/{image_name(st["crop"], t, r)}' for r in runs} for t in spec['themes']},
        'boxes': boxes.get(st['id'], {}),
    } for st in spec['steps']]
    return {'title': spec['title'], 'key': spec['key'], 'runs': runs,
            'runLabels': {'before': 'Before', 'after': 'After', 'today': 'Today', **spec.get('labels', {})},
            'themes': spec['themes'], 'themeNames': {t: NICE.get(t, t.replace('-', ' ').title()) for t in spec['themes']},
            'steps': steps}


def build_page(spec, boxes):
    errors, warnings = validate(spec)
    runs = run_names(spec)
    for st in spec['steps']:
        for t in spec['themes']:
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
    page = page.replace('/*TOKENS*/', tokens_css(theme_tokens(spec['themes']))).replace('/*CSS*/', read('page.css')).replace('/*JS*/', read('page.js'))
    # `</` inside the JSON would end the <script>; escaping it keeps the JSON valid.
    page = page.replace('__TITLE__', html.escape(spec['title'])).replace('__DECK__', json.dumps(deck_data(spec, boxes)).replace('</', '<\\/'))
    return page, warnings
