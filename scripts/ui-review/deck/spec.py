"""Deck spec: loading, crop-registry merge, and the writing rules the builder enforces.

WHY rules in code: on 2026-08-25 a taste argument went into a review as if it were a defect,
and prose reviews were rejected three times for being unreadable — so the deck's vocabulary
(headline · What changed · You'll notice · Risk) and its word limits are checked here, not
remembered. Spec: docs/archive/specs/2026-08-27-review-deck-v2-design.md §4–5."""
import json
import os
import re

from .live import PANE_WIDTH, is_live, pane_width

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
# A contract row's `checkedBy` — who resolves it: a guard script, this deck's own answers,
# a running app probe, or a person. Task 4 reads this to pick its resolver.
CHECKED_BY = ('mechanical', 'deck', 'live-app', 'human')
# <deck key>#<step id> — the answered step a row's verdict comes from.
SOURCE_RE = re.compile(r'^[\w.-]+#[\w.-]+$')
# Each live pane boots its own copy of the app; four is the cap (spec: Non-goals).
MAX_LIVE_PANES = 4
# Wider than this and the row scrolls sideways, which defeats comparing the panes at all.
LIVE_FIT_WIDTH = 1600
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
    for k in ('title', 'key', 'out', 'steps'):
        if k not in spec or spec[k] is None:
            raise SpecError(f'spec is missing "{k}"')
    # `images` and `runs` describe a screenshot sweep. A deck whose every step is LIVE, WORDS-ONLY or a
    # CONTRACT has no screenshots to point at, so requiring them would make the author invent a folder and a
    # run that nothing ever reads. Everything downstream still wants a run NAME, so default it.
    if no_pictures(spec):
        spec.setdefault('runs', {'today': None})
    else:
        for k in ('images', 'runs'):
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


def is_clip(step):
    """A CLIP step shows a RECORDING per run (before/after, or today) instead of a still: an
    animation, a hover, a transition, a bug that only shows in motion. `clip` is a scene name
    (files at <images>/clips/<name>--<run>.webm, made by record-pair.sh) or {run: path}."""
    return bool(step.get('clip'))


def is_contract(step):
    """A CONTRACT step is the rows that define done (feature-flow design §3), rendered as a
    table and answered yes/no/other as ONE step. It is a WORDS step (is_words is true for it)
    that carries `rows`; keyed on the key's PRESENCE so an empty `rows: []` still reaches the
    contract validator ("a contract with no rows defines nothing") instead of the picture
    one ("missing crop"). Validation and the page come in Task 3 of the plan."""
    return 'rows' in step


def is_words(step):
    """A WORDS-ONLY step has no picture at all — `"words": true`, an explicit flag rather than
    "no crop", so a step that merely forgot its crop is still an error and never renders
    silently pictureless. With `options` it is a decide (pick one of the written options, or
    Other); with `rows` a contract; otherwise a statement to approve (`changed` + `notice`
    are its body). Users: the QUESTIONS deck answered before anything is drawn, the contract,
    and the acceptance deck's human rows (feature-flow design §3, §5, §7)."""
    return step.get('words') is True or is_contract(step)


def no_pictures(spec):
    """A deck with no picture steps at all — every step is live or words-only (a contract is
    words-only). It names no `images` folder and no `runs`; every code path that reaches for
    either bails out first (load_spec, crops.py, build.py, review-cards.py). Widens
    live.all_live."""
    return bool(spec['steps']) and all(is_live(st) or is_words(st) for st in spec['steps'])


def clip_files(spec, step):
    """{run: relative path to the .webm} for a clip step, and the same for posters (.webp)."""
    c = step['clip']
    runs = run_names(spec)
    if isinstance(c, str):
        vids = {r: f"{spec['images']}/clips/{c}--{r}.webm" for r in runs}
    else:
        vids = {r: c.get(r) for r in runs}
    posters = {r: (re.sub(r'\.webm$', '.webp', v) if v else None) for r, v in vids.items()}
    return vids, posters


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


def _headline_and_words(st, sid, errors):
    """The two checks every step kind performs identically, verbatim, today.

    Deliberately NOT the themes-shape or risk-length checks, which only LOOK shared:
    _validate_clip takes no `warnings` argument and performs neither, so folding those in
    would quietly start validating clip steps that aren't validated today — a behaviour
    change wearing a refactor's clothes. That tidy-up, if wanted, is its own commit."""
    if word_count(st.get('headline')) > HEADLINE_MAX:
        errors.append(f'{sid}: headline is {word_count(st["headline"])} words (max {HEADLINE_MAX})')
    for k in TEXT_FIELDS:
        for w in banned_in(st.get(k)):
            errors.append(f'{sid}: {k} uses banned word "{w}"')


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
        # Live FIRST: both the choice path and the default path *require* a crop, and a live
        # step turns that requirement off rather than inheriting it.
        if is_live(st):
            _validate_live(spec, st, sid, errors, warnings)
            continue
        if is_words(st):
            _validate_words(spec, st, sid, errors, warnings)
            continue
        if is_choice(st):
            _validate_choice(spec, st, sid, errors, warnings)
            continue
        if is_decide(st):
            _validate_decide(spec, st, sid, errors, warnings)
            continue
        if is_clip(st):
            _validate_clip(spec, st, sid, errors)
            continue
        for k in ('surface', 'path', 'crop', 'headline', 'changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k}')
        if st.get('crop') and st['crop'] not in spec['_crops']:
            errors.append(f'{sid}: unknown crop "{st["crop"]}" (add it to crops.json or the spec\'s "crops")')
        _headline_and_words(st, sid, errors)
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
    _headline_and_words(st, sid, errors)
    hl = st.get('highlight')
    if hl is None:
        errors.append(f'{sid}: a decide step needs a highlight (it shows one picture, so there is nothing to diff)')
    elif not (isinstance(hl, dict) and any(k in hl for k in ('selector', 'text', 'box'))):
        errors.append(f'{sid}: highlight must have selector, text or box')
    elif 'box' in hl:
        warnings.append(f'{sid}: hand-placed box — prefer a selector so the rig measures it')
    _validate_options(st, sid, errors, warnings, minimum=2)
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')


def _validate_options(st, sid, errors, warnings, minimum):
    """The written options of a decide step. `minimum` is 2 for a picture decide (one option
    plus Other is a yes/no step in disguise) and 1 for a words-only question, where the
    recommended answer alone plus Other is exactly the shape Destin asked for (2026-09-01)."""
    opts = st['options']
    if not isinstance(opts, list) or len(opts) < minimum:
        errors.append(f'{sid}: a decide step needs at least {minimum} option{"s" if minimum > 1 else ""}')
        return
    if len(opts) > 3:
        warnings.append(f'{sid}: {len(opts)} options — more than three usually means two questions')
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


def _validate_words(spec, st, sid, errors, warnings):
    """No picture, so every picture field is refused rather than required — the same stance
    as _validate_live. The question shape is the existing one: `options` → pick one. A
    contract (`rows`) is validated by _validate_rows, which this dispatches to."""
    for k in ('surface', 'path', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    for k in ('crop', 'clip', 'highlight', 'variants', 'live'):
        if st.get(k):
            errors.append(f'{sid}: a words step has no {k} — there is no picture')
    _headline_and_words(st, sid, errors)
    if is_contract(st):
        _validate_rows(spec, st, sid, errors)
    elif st.get('options'):
        _validate_options(st, sid, errors, warnings, minimum=1)
    else:
        for k in ('changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k} (a words step with no options is a statement to approve; these are its body)')
    for k in ('yes', 'no'):
        if st.get(k) and word_count(st[k]) > 4:
            errors.append(f'{sid}: {k} label is {word_count(st[k])} words — a button, keep it under 5')
        # The label is button copy Destin reads — the banned-word rule applies to every
        # user-facing field, not just the ones with a word-count cap.
        for w in banned_in(st.get(k)):
            errors.append(f'{sid}: {k} label uses banned word "{w}"')
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')


def _validate_rows(spec, st, sid, errors):
    """The rows of a contract step (feature-flow design §3). Each row is one statement of what
    done means, who checks it, and the answered deck step it came from."""
    if st.get('options'):
        errors.append(f'{sid}: a contract step has no options — the rows are its body')
    rows = st['rows']
    if not isinstance(rows, list):
        errors.append(f'{sid}: rows must be a list')
        return
    sources = spec.get('sources') or {}
    seen = set()
    for i, r in enumerate(rows):
        rid = r.get('id') or f'row {i + 1}'
        if not r.get('id'):
            errors.append(f'{sid}: {rid} has no id')
        elif r['id'] in seen:
            errors.append(f'{sid}: duplicate row id "{r["id"]}"')
        seen.add(r.get('id'))
        if not r.get('statement'):
            errors.append(f'{sid}/{rid}: missing statement')
        # WHY: the statement becomes the acceptance deck's headline verbatim (feature-flow
        # design §5), which enforces HEADLINE_MAX on ITS OWN pass — a long statement sails
        # through contract-check, gets signed, then the acceptance deck refuses to build with
        # an error naming a field the contract's author never wrote. Catch it here instead.
        n = word_count(r.get('statement'))
        if n > HEADLINE_MAX:
            errors.append(f'{sid}/{rid}: statement is {n} words (max {HEADLINE_MAX}) — it becomes the acceptance deck\'s headline')
        for k in ('statement', 'threshold', 'note'):
            for w in banned_in(r.get(k)):
                errors.append(f'{sid}/{rid}: {k} uses banned word "{w}"')
        if r.get('checkedBy') not in CHECKED_BY:
            errors.append(f'{sid}/{rid}: checkedBy must be one of {", ".join(CHECKED_BY)}')
        if r.get('checkedBy') == 'mechanical' and not r.get('guard'):
            errors.append(f'{sid}/{rid}: a mechanical row needs a guard (a workspace-relative test or script path)')
        src = r.get('source') or ''
        if not SOURCE_RE.match(src):
            errors.append(f'{sid}/{rid}: source must look like <deck key>#<step id>')
        elif src.split('#')[0] not in sources:
            errors.append(f'{sid}/{rid}: source deck "{src.split("#")[0]}" is not in the spec\'s "sources"')
        if 'verdict' in r:
            if r['verdict'] not in ('pass', 'fail'):
                errors.append(f'{sid}/{rid}: verdict must be pass or fail')
            if not r.get('evidence'):
                errors.append(f'{sid}/{rid}: a verdict needs evidence (what was run or looked at)')
    if not rows:
        errors.append(f'{sid}: a contract with no rows defines nothing')


def _validate_choice(spec, st, sid, errors, warnings):
    for k in ('surface', 'path', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    _headline_and_words(st, sid, errors)
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


def _validate_live(spec, st, sid, errors, warnings):
    """A LIVE step's panes ARE its picture, so every picture field is refused rather than
    required. Its QUESTION shape is unchanged: `variants` still means pick-one, their absence
    still means yes/no — live is a new source of picture, not a third kind of question."""
    for k in ('surface', 'path', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    _headline_and_words(st, sid, errors)
    live = st['live']
    if not isinstance(live, dict):
        errors.append(f'{sid}: live must be an object with "surface" and "round"')
        return
    for k in ('surface', 'round'):
        if not live.get(k):
            errors.append(f'{sid}: live is missing {k}')
    # WHY round is required: candidate ids are unique only WITHIN a round and the registry
    # keeps every round forever — close-prompt-body reuses 'labelled' and 'one-line' across
    # its ten. An address without a round silently shows the wrong design.
    for k in ('crop', 'clip', 'highlight', 'options'):
        if st.get(k):
            errors.append(f'{sid}: a live step has no {k} — the pane IS the picture')
    if st.get('variants'):
        vs = st['variants']
        if not isinstance(vs, list) or not 2 <= len(vs) <= MAX_LIVE_PANES:
            errors.append(f'{sid}: a live pick-one needs 2 to {MAX_LIVE_PANES} variants '
                          f'(each pane boots its own copy of the app)')
            vs = vs if isinstance(vs, list) else []
        seen = set()
        for i, v in enumerate(vs):
            vid = v.get('id') or f'variant {i + 1}'
            if not v.get('id'):
                errors.append(f'{sid}: {vid} has no id')
            elif v['id'] in seen:
                errors.append(f'{sid}: duplicate variant id "{v["id"]}"')
            seen.add(v.get('id'))
            for k in ('label', 'candidate', 'summary'):
                if not v.get(k):
                    errors.append(f'{sid}/{vid}: missing {k}')
            if v.get('crop'):
                errors.append(f'{sid}/{vid}: a live variant has no crop — the pane IS the picture')
            for k in VARIANT_TEXT_FIELDS:
                for w in banned_in(v.get(k)):
                    errors.append(f'{sid}/{vid}: {k} uses banned word "{w}"')
            if v.get('measured') and not re.search(r'\d', v['measured']):
                warnings.append(f'{sid}/{vid}: measured has no number in it')
        panes = len(vs)
    else:
        # No variants: this is an approve step, and it needs the same words any approve step
        # needs — otherwise the right-hand column has nothing in it.
        for k in ('changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k}')
        if not live.get('candidate'):
            errors.append(f'{sid}: live is missing candidate (a step with no variants shows one pane)')
        panes = 1
    if not (spec.get('live') or {}).get('worktree'):
        errors.append(f'{sid}: the deck needs "live": {{"worktree": "<name>"}} — serve boots that '
                      f'worktree\'s workbench, and every candidate in a review comes from one build')
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')
    # A WARNING, never an error: the registry's real paneWidth lives in the other repo, so
    # this number is the spec's own `live.paneWidth` or the route's default — an estimate.
    # Panes WRAP now (page.js fitPanes: never wider than the stage, never a sideways scroll),
    # so a row of several is never the problem; one pane wider than any screen still is.
    width = pane_width(spec) if 'paneWidth' not in live else live['paneWidth']
    if width > LIVE_FIT_WIDTH:
        warnings.append(f'{sid}: a {width}px pane is wider than any screen the deck is read on '
                        f'and will scroll sideways — narrow the surface or make it fluid')


def _images_folder_warning(spec, warnings):
    # A live-only deck names no images folder — and this runs at the END of validate(), so a
    # bare spec['images'] here would KeyError after every rule had already passed.
    if 'images' not in spec:
        return
    # WHY: the crops are named after the step, not the deck, so two specs pointed at one images
    # folder silently overwrite each other's pictures — the second build leaves the first deck
    # showing the second deck's screenshots, with no error anywhere.
    if spec['_stem'] not in spec['images']:
        warnings.append(f'images "{spec["images"]}" does not contain the spec name "{spec["_stem"]}" '
                        '— two decks sharing one images folder overwrite each other\'s pictures')


def _validate_clip(spec, st, sid, errors):
    for k in ('surface', 'path', 'headline', 'changed', 'notice'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    for k in ('crop', 'highlight', 'variants', 'options'):
        if st.get(k):
            errors.append(f'{sid}: a clip step has no {k} — the recording IS the picture')
    _headline_and_words(st, sid, errors)
    c = st['clip']
    if isinstance(c, dict):
        for r in run_names(spec):
            if not c.get(r):
                errors.append(f'{sid}: clip has no file for run "{r}"')
    elif not isinstance(c, str) or not re.fullmatch(r'[\w.-]+', c):
        errors.append(f'{sid}: clip must be a scene name or {{run: path}}')
