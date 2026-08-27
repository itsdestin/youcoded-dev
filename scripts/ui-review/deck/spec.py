"""Deck spec: loading, crop-registry merge, and the writing rules the builder enforces.

WHY rules in code: on 2026-08-25 a taste argument went into a review as if it were a defect,
and prose reviews were rejected three times for being unreadable — so the deck's vocabulary
(headline · What changed · You'll notice · Risk) and its word limits are checked here, not
remembered. Spec: docs/active/specs/2026-08-27-review-deck-v2-design.md §4–5."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
UI_REVIEW = os.path.dirname(HERE)
DEFAULT_THEMES = ['midnight', 'light', 'creme', 'dark', 'halftone-dimension', 'meadow-mist']
# Whole-word, case-insensitive. "px" and numbers are fine — measurements are wanted.
BANNED = ['token', 'primitive', 'selector', 'ipc', 'prop', 'props', 'reducer', 'handler',
          'component', 'tailwind', 'css class', 'react', 'dom', 'z-index']
TEXT_FIELDS = ['headline', 'changed', 'measured', 'notice', 'risk', 'surface', 'path']
HEADLINE_MAX = 25
RISK_WARN = 40
AUTO_WARN_FRACTION = 0.6   # an auto-highlight covering more than this much of the crop is "whole surface"


class SpecError(Exception):
    pass


def workspace_root():
    """The directory that holds the sub-repo checkouts (youcoded/, wecoded-themes/).
    WHY walk up: this package usually runs from a worktree (worktrees/<name>/scripts/…), and a
    worktree holds only the workspace repo — the sub-repos are cloned once, at the root above
    worktrees/. Resolving relative to the package silently found nothing on 2026-08-27."""
    if os.environ.get('YOUCODED_WORKSPACE'):
        return os.environ['YOUCODED_WORKSPACE']
    d = HERE
    while True:
        if os.path.isdir(os.path.join(d, 'wecoded-themes', 'themes')):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise SpecError('no workspace root above ' + HERE + ' holds wecoded-themes/themes (set YOUCODED_WORKSPACE)')
        d = parent


def load_spec(path):
    with open(path) as f:
        spec = json.load(f)
    for k in ('title', 'key', 'out', 'images', 'runs', 'steps'):
        if k not in spec or spec[k] is None:
            raise SpecError(f'spec is missing "{k}"')
    if not 1 <= len(spec['runs']) <= 2:
        raise SpecError('runs must have one entry (today) or two (before, after)')
    spec['_base'] = os.path.dirname(os.path.abspath(path))
    spec['_stem'] = os.path.splitext(os.path.basename(path))[0]
    with open(os.path.join(UI_REVIEW, 'crops.json')) as f:
        shared = json.load(f)
    shared.pop('_comment', None)
    spec['_crops'] = {**shared, **spec.get('crops', {})}
    spec.setdefault('themes', list(DEFAULT_THEMES))
    return spec


def run_names(spec):
    """Display order of the runs: before then after when both exist, else as written."""
    r = list(spec['runs'].keys())
    return ['before', 'after'] if set(r) == {'before', 'after'} else r


def word_count(s):
    # A curly apostrophe (’, pasted from a word processor) must stay inside its word, or "it’s" counts as two.
    return len(re.findall(r"[\w'’-]+", s or ''))


def banned_in(text):
    low = (text or '').lower()
    return [w for w in BANNED if re.search(r'(?<![\w-])' + re.escape(w) + r'(?![\w-])', low)]


def validate(spec):
    """Returns (errors, warnings) as 'step-id: message' lines. Errors block crop/build."""
    errors, warnings, ids = [], [], set()
    two_runs = len(spec['runs']) == 2
    for i, st in enumerate(spec['steps']):
        sid = st.get('id') or f'step {i + 1}'
        if not st.get('id'):
            errors.append(f'{sid}: missing id')
        elif st['id'] in ids:
            errors.append(f'{sid}: duplicate id')
        ids.add(st.get('id'))
        for k in ('surface', 'path', 'crop', 'headline', 'changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k}')
        if st.get('crop') and st['crop'] not in spec['_crops']:
            errors.append(f'{sid}: unknown crop "{st["crop"]}" (add it to crops.json or the spec\'s "crops")')
        if word_count(st.get('headline')) > HEADLINE_MAX:
            errors.append(f'{sid}: headline is {word_count(st["headline"])} words (max {HEADLINE_MAX})')
        for k in TEXT_FIELDS:
            for w in banned_in(st.get(k)):
                errors.append(f'{sid}: {k} uses banned word "{w}"')
        hl = st.get('highlight', 'auto' if two_runs else None)
        if hl is None:
            errors.append(f'{sid}: a one-run deck needs a highlight (selector or text)')
        elif hl == 'auto':
            if not two_runs:
                errors.append(f'{sid}: "auto" highlight needs a before and an after run')
        elif isinstance(hl, dict):
            if not any(k in hl for k in ('selector', 'text', 'box')):
                errors.append(f'{sid}: highlight must be "auto" or have selector, text or box')
            elif 'box' in hl:
                warnings.append(f'{sid}: hand-placed box — prefer a selector so the rig measures it')
        else:
            errors.append(f'{sid}: highlight must be "auto" or an object')
        if word_count(st.get('risk')) > RISK_WARN:
            warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')
        if st.get('measured') and not re.search(r'\d', st['measured']):
            warnings.append(f'{sid}: measured has no number in it')
    return errors, warnings
