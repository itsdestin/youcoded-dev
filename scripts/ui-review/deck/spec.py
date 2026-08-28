"""Deck spec: loading, crop-registry merge, and the writing rules the builder enforces.

WHY rules in code: on 2026-08-25 a taste argument went into a review as if it were a defect,
and prose reviews were rejected three times for being unreadable — so the deck's vocabulary
(headline · What changed · You'll notice · Risk) and its word limits are checked here, not
remembered. Spec: docs/archive/specs/2026-08-27-review-deck-v2-design.md §4–5."""
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
VARIANT_TEXT_FIELDS = ['label', 'summary', 'measured', 'risk']
# A decide OPTION is words only — no picture — so `cost` carries what it would cost to take it.
OPTION_TEXT_FIELDS = ['label', 'summary', 'measured', 'cost']
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


def step_themes(spec, step):
    """The themes a step is shown in: its own `themes` list when it has one, else the deck's.
    WHY: a real-app capture (the Electron pass — terminal, live session) exists in ONE theme, the
    profile's; without a per-step list that surface could never sit in a six-theme deck."""
    return list(step.get('themes') or spec['themes'])


def all_themes(spec):
    """Every theme any step uses, deck order first, in first-seen order."""
    seen = list(spec['themes'])
    for st in spec['steps']:
        for t in st.get('themes') or []:
            if t not in seen:
                seen.append(t)
    return seen


def is_choice(step):
    """A CHOICE step asks one question of several pictures — pick one. Destin (2026-08-27):
    three variants of the same thing should not each get their own yes/no; they are one
    question on one page. Its pictures come from the deck's LAST run (today, or after)."""
    return bool(step.get('variants'))


def is_decide(step):
    """A DECIDE step asks one question of ONE picture and several WRITTEN options — pick one.
    Destin (2026-08-27): a two-sided question ("open it, or leave it closed?") answered with
    "Yes, build it / No, leave it" is ambiguous — yes to which half? CHOICE cannot ask it,
    because CHOICE needs a photograph of every option and the alternatives do not exist yet.
    Two panels: the picture of how it is today on the left, the options merged into the
    decision column on the right."""
    return bool(step.get('options'))


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
        if is_choice(st):
            _validate_choice(spec, st, sid, errors, warnings)
            continue
        if is_decide(st):
            _validate_decide(spec, st, sid, errors, warnings)
            continue
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
        th = st.get('themes')
        if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
            errors.append(f'{sid}: themes must be a non-empty list of theme names')
        if word_count(st.get('risk')) > RISK_WARN:
            warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')
        if st.get('measured') and not re.search(r'\d', st['measured']):
            warnings.append(f'{sid}: measured has no number in it')
    _images_folder_warning(spec, warnings)
    return errors, warnings


def _validate_decide(spec, st, sid, errors, warnings):
    """Same picture rules as a normal step (one crop, one highlight), but the right-hand column
    is the options list instead of What changed / You'll notice."""
    for k in ('surface', 'path', 'crop', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    if st.get('crop') and st['crop'] not in spec['_crops']:
        errors.append(f'{sid}: unknown crop "{st["crop"]}" (add it to crops.json or the spec\'s "crops")')
    if word_count(st.get('headline')) > HEADLINE_MAX:
        errors.append(f'{sid}: headline is {word_count(st["headline"])} words (max {HEADLINE_MAX})')
    for k in TEXT_FIELDS:
        for w in banned_in(st.get(k)):
            errors.append(f'{sid}: {k} uses banned word "{w}"')
    hl = st.get('highlight')
    if hl is None:
        errors.append(f'{sid}: a decide step needs a highlight (it shows one picture, so there is nothing to diff)')
    elif not (isinstance(hl, dict) and any(k in hl for k in ('selector', 'text', 'box'))):
        errors.append(f'{sid}: highlight must have selector, text or box')
    elif 'box' in hl:
        warnings.append(f'{sid}: hand-placed box — prefer a selector so the rig measures it')
    opts = st['options']
    if not isinstance(opts, list) or len(opts) < 2:
        errors.append(f'{sid}: a decide step needs at least 2 options')
        return
    seen = set()
    for i, o in enumerate(opts):
        oid = o.get('id') or f'option {i + 1}'
        if not o.get('id'):
            errors.append(f'{sid}: {oid} has no id')
        elif o['id'] in seen:
            errors.append(f'{sid}: duplicate option id "{o["id"]}"')
        seen.add(o.get('id'))
        for k in ('label', 'summary'):
            if not o.get(k):
                errors.append(f'{sid}/{oid}: missing {k}')
        for k in OPTION_TEXT_FIELDS:
            for w in banned_in(o.get(k)):
                errors.append(f'{sid}/{oid}: {k} uses banned word "{w}"')
        if o.get('measured') and not re.search(r'\d', o['measured']):
            warnings.append(f'{sid}/{oid}: measured has no number in it')
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')


def _validate_choice(spec, st, sid, errors, warnings):
    for k in ('surface', 'path', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    if word_count(st.get('headline')) > HEADLINE_MAX:
        errors.append(f'{sid}: headline is {word_count(st["headline"])} words (max {HEADLINE_MAX})')
    for k in TEXT_FIELDS:
        for w in banned_in(st.get(k)):
            errors.append(f'{sid}: {k} uses banned word "{w}"')
    vs = st['variants']
    if not isinstance(vs, list) or len(vs) < 2:
        errors.append(f'{sid}: a choice step needs at least 2 variants')
        return
    seen = set()
    for i, v in enumerate(vs):
        vid = v.get('id') or f'variant {i + 1}'
        if not v.get('id'):
            errors.append(f'{sid}: {vid} has no id')
        elif v['id'] in seen:
            errors.append(f'{sid}: duplicate variant id "{v["id"]}"')
        seen.add(v.get('id'))
        for k in ('label', 'crop', 'summary'):
            if not v.get(k):
                errors.append(f'{sid}/{vid}: missing {k}')
        if v.get('crop') and v['crop'] not in spec['_crops']:
            errors.append(f'{sid}/{vid}: unknown crop "{v["crop"]}"')
        for k in VARIANT_TEXT_FIELDS:
            for w in banned_in(v.get(k)):
                errors.append(f'{sid}/{vid}: {k} uses banned word "{w}"')
        hl = v.get('highlight')
        if hl is not None and not (isinstance(hl, dict) and any(k in hl for k in ('selector', 'text', 'box'))):
            errors.append(f'{sid}/{vid}: highlight must have selector, text or box (or be omitted — the whole picture is the thing)')
        if v.get('measured') and not re.search(r'\d', v['measured']):
            warnings.append(f'{sid}/{vid}: measured has no number in it')
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')


def _images_folder_warning(spec, warnings):
    # WHY: the crops are named after the step, not the deck, so two specs pointed at one images
    # folder silently overwrite each other's pictures — the second build leaves the first deck
    # showing the second deck's screenshots, with no error anywhere.
    if spec['_stem'] not in spec['images']:
        warnings.append(f'images "{spec["images"]}" does not contain the spec name "{spec["_stem"]}" '
                        '— two decks sharing one images folder overwrite each other\'s pictures')
