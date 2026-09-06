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
# The marker a GENERATOR leaves where a session has to write the copy. Any field still
# carrying it blocks the build (validate) — `selfie` writes the pictures, but only the session
# that made the change can say what moved and what Destin will notice (design §6.4).
TODO = 'TODO:'
BANNED = ['token', 'primitive', 'selector', 'ipc', 'prop', 'props', 'reducer', 'handler',
          'component', 'tailwind', 'css class', 'react', 'dom', 'z-index']
TEXT_FIELDS = ['headline', 'changed', 'measured', 'notice', 'risk', 'surface', 'path',
               # The three parts of a question (below) are copy Destin reads, so the
               # banned-word rule reaches them exactly as it reaches every other field.
               'today', 'problem', 'proposal']
VARIANT_TEXT_FIELDS = ['label', 'summary', 'measured', 'risk']
# A decide OPTION is words only — no picture — so `cost` carries what it would cost to take it.
OPTION_TEXT_FIELDS = ['label', 'summary', 'measured', 'cost']
# The three parts of a question: what exists, what goes wrong, what would change (design §3.2).
QUESTION_FIELDS = ('today', 'problem', 'proposal')
# WHY refused: every one of these labels is a FIELD now, and a session that types them into a
# sentence instead ("Today: … Pro: fast") hands Destin one grey paragraph to unpick — which is
# exactly what the questions decks of 2026-09-01..04 did. Refuse the sentence, name the field.
INLINE_LABELS = ('today:', 'proposal:', 'problem:', 'pro:', 'pros:', 'con:', 'cons:', 'downside:', 'upside:')
INLINE_TARGET = {'today:': "the step's today field", 'problem:': "the step's problem field",
                 'proposal:': "the step's proposal field", 'pro:': 'pros', 'pros:': 'pros',
                 'upside:': 'pros', 'con:': 'cons', 'cons:': 'cons', 'downside:': 'cons'}
# "(recommended)" typed into a label instead of the flag — the page cannot badge it, and the
# letter reads as part of the option's name.
RECOMMENDED_RE = re.compile(r'\(?recommended\)?', re.I)
COUNT_WORD = {2: 'two', 3: 'three', 4: 'four'}
HEADLINE_MAX = 25
# The only capture names a deck or a slide may use. `today` is one picture; `before`+`after` is a pair.
RUN_NAMES = ('today', 'before', 'after')
RISK_WARN = 40
# A contract row's `checkedBy` — who resolves it: a guard script, this deck's own answers,
# a running app probe, or a person. Task 4 reads this to pick its resolver.
CHECKED_BY = ('mechanical', 'deck', 'live-app', 'human')
# <deck key>#<step id> — the answered step a row's verdict comes from.
SOURCE_RE = re.compile(r'^[\w.-]+#[\w.-]+$')
# review:<path relative to the contract>#<finding id> — an ACCEPTED finding from the code
# reviewer's or UX tester's review file (feature-flow design §8e). WHY a second shape: those
# rows were never on a deck Destin answered, so they cannot point at a deck step; they point
# at the finding line instead, and contract.py checks that line says "accepted".
REVIEW_SOURCE_RE = re.compile(r'^review:[\w./-]+#[\w.-]+$')
# Each live pane boots its own copy of the app; four is the cap (spec: Non-goals).
MAX_LIVE_PANES = 4
# Wider than this and the row scrolls sideways, which defeats comparing the panes at all.
LIVE_FIT_WIDTH = 1600
AUTO_WARN_FRACTION = 0.6   # an auto-highlight covering more than this much of the crop is "whole surface"
# The live app writes the theme it is on to this file on every appearance change
# (desktop `appearance:set`). It is a plain file, never held open, so reading it is inside the
# live-app safety rule — and it is the only way a deck can know which palette Destin is looking
# at today. Overridable for tests; live_theme() re-reads the variable on every call.
APPEARANCE_FILE = os.environ.get('YOUCODED_APPEARANCE_FILE') or os.path.expanduser('~/.claude/youcoded-appearance.json')


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


def strip_comments(node):
    """Drop every `_comment` key, at every depth, from a spec just read off disk.

    WHY: a template (`scripts/ui-review/templates/`) explains each field in place, next to the
    field, because a session writing its first deck of that kind has nothing else to copy from —
    and JSON has no comment syntax. The explanation is for the AUTHOR, never deck content, so it
    is removed before anything reads the spec: a page marker refuses any key it does not know,
    and an un-stripped comment would otherwise reach the page and the answers file. A value may
    be one line or a list of lines; either way the key goes.

    Any key STARTING `_comment` goes, not just the bare one, so a template can explain a field
    right beside it (`"_comment_headline"` next to `"headline"`) instead of describing eight
    fields in one blob at the top of the object. Templates: design §6.5."""
    if isinstance(node, dict):
        return {k: strip_comments(v) for k, v in node.items() if not k.startswith('_comment')}
    if isinstance(node, list):
        return [strip_comments(v) for v in node]
    return node


def load_spec(path):
    """Read a deck spec and fill in everything downstream assumes.

    `"theme": "fixed"` at the top level pins the deck to its OWN theme order — for a deck whose
    point is one specific theme. Without it the deck opens on whatever theme the live app is on
    (apply_live_theme, called by the CLI, not here: contract-check and the tests want the
    spec's own order)."""
    with open(path) as f:
        spec = json.load(f)
    # Before every rule below: a `_comment` is documentation for the author, not spec content.
    spec = strip_comments(spec)
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
    bad = [r for r in spec['runs'] if r not in RUN_NAMES]
    if bad:
        raise SpecError('runs may only be named ' + ', '.join(RUN_NAMES) + ' — not ' + ', '.join(bad))
    if not spec['runs']:
        raise SpecError('runs must name at least one capture (today, or before and after)')
    spec['_base'] = os.path.dirname(os.path.abspath(path))
    spec['_stem'] = os.path.splitext(os.path.basename(path))[0]
    with open(os.path.join(UI_REVIEW, 'crops.json')) as f:
        shared = json.load(f)
    shared.pop('_comment', None)
    spec['_crops'] = {**shared, **spec.get('crops', {})}
    spec.setdefault('themes', list(DEFAULT_THEMES))
    # "fixed" is the only value this key takes; anything else is a typo that would otherwise be
    # ignored in silence, and the deck would open on a theme the author thought they had pinned.
    if 'theme' in spec and spec['theme'] != 'fixed':
        raise SpecError(f'spec has "theme": {json.dumps(spec["theme"])} — the only accepted value is "fixed", '
                        'which keeps the deck on its own theme order')
    return spec


def live_theme():
    """The theme Destin's app is on right now, or None when we cannot tell.

    WHY silent: a deck must still build on a machine with no YouCoded install, a first run
    before the app has ever saved its appearance, or a half-written file — the theme is a
    nicety, and a missing one just leaves the deck on the spec's own first theme."""
    path = os.environ.get('YOUCODED_APPEARANCE_FILE') or APPEARANCE_FILE
    try:
        with open(path) as f:
            t = json.load(f).get('theme')
    except (OSError, ValueError, AttributeError):
        return None
    return t if isinstance(t, str) and t else None


def captured(spec, theme):
    """True when every picture step in the deck already has its crop cut for `theme`, in every
    run. A deck with no picture steps is trivially captured. Mirrors build_page's existence
    check (a choice step's variants come from the LAST run only; a step with its own `themes`
    list is only checked in those), because that is the check that would fail the build if we
    opened on a theme nothing was shot in."""
    from .crops import image_name   # imported here: crops.py imports this module at load time
    base = os.path.join(spec['_base'], spec.get('images') or '')
    for st in spec['steps']:
        if is_page(st) or is_live(st) or is_words(st) or is_clip(st):
            continue   # no picture of its own — a marker, a running app, written words, a recording
        # Fix (review, 2026-09-05): a step with its OWN themes list (a real-app capture that
        # exists in one theme) is never rendered in any other theme — build_page only checks the
        # themes in step_themes(). Demanding its crop here refused the live theme on every deck
        # that mixes a broad theme list with one narrowly-themed step (chatsearch-gate has one).
        if st.get('themes') and theme not in st['themes']:
            continue
        runs = step_runs(spec, st)
        if is_choice(st):
            if not all(os.path.exists(os.path.join(base, image_name(v['crop'], theme, runs[-1]))) for v in st['variants']):
                return False
            continue
        if not all(os.path.exists(os.path.join(base, image_name(st['crop'], theme, r))) for r in runs):
            return False
    return True


def apply_live_theme(spec, override=None, log=lambda m: None):
    """Open the deck on the theme Destin is actually using, and say so when we cannot.

    Destin (2026-09-04): every deck opened on Midnight because specs list it first, while his
    app was on Golden Sunbreak — the deck showed him a palette he does not use. Returns the
    theme the deck opens on and moves it to the front of `spec['themes']`, which is what the
    page's first paint, its theme pills AND every live pane's address are built from
    (build.py `_live_step`).

    Order: `--theme` wins; `"theme": "fixed"` in the spec pins its own order; else the live
    app's theme, moved to the front when the deck lists it, added at the front when the deck
    has no pictures (nothing to shoot) or the crops for it already exist. A theme with no
    colours anywhere, or one nothing was shot in, is refused with a printed line rather than a
    silently wrong-looking deck."""
    first = spec['themes'][0]

    def settle(t):
        spec['_open_theme'] = t
        return t

    want = override
    if want is None:
        if spec.get('theme') == 'fixed':
            return settle(first)
        want = live_theme()
    if not want or want == first:
        return settle(first)
    # "live theme X" reads wrong when Destin typed --theme X himself, so name what we followed.
    what = 'theme' if override else 'live theme'
    from .build import theme_tokens   # imported here: build.py imports this module at load time
    try:
        theme_tokens([want])
    except SpecError:
        log(f'{what} {want} has no colours here — opening on {first}')
        return settle(first)
    if want in spec['themes']:
        spec['themes'].remove(want)
    elif not captured(spec, want):
        log(f'{what} {want} is not captured in these runs — opening on {first}')
        return settle(first)
    spec['themes'].insert(0, want)
    return settle(want)


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


def is_question(step):
    """A QUESTION step: a words step that asks something, keyed on `today` — the first of the
    three parts every question carries (what exists / what goes wrong / what would change).
    A contract is never one, and a STATEMENT to approve (yes/no relabels, `changed` +
    `notice`, no `today`) is deliberately exempt, so acceptance rows are unaffected."""
    return is_words(step) and not is_contract(step) and 'today' in step


PAGE_FIELDS = ('id', 'page', 'intro')


def is_page(step):
    """A PAGE MARKER, not a step: `{"id": "P-2", "page": "What we promise", "intro": "..."}`
    starts a new page of a question deck. It asks nothing, so it gets no answer row, no line in
    the summary and no contract source — every reader of `steps` skips it (design 3.1)."""
    return 'page' in step


def words_only(spec):
    """Every step is a question, a statement or a contract: no picture, no live pane. This is
    the deck that renders as PAGES; anything else keeps one step per screen."""
    return bool(spec['steps']) and all(is_page(st) or is_words(st) for st in spec['steps'])


def has_contract(spec):
    """This deck defines or grades done — a contract or acceptance deck (feature-flow design §3,
    §7). Picture-free like a question deck, but NOT a pages deck: see pages()."""
    return any(is_contract(st) for st in spec['steps'])


def pages(spec):
    """The pages of a question deck — [{id, title, intro, steps: [step...]}] — or None when the
    deck has pictures or defines done. Destin (2026-09-04): "my mindset should stay in the same
    place for each set of questions, and only shift when moving to a new set", so with NO marker
    every question shares one page, titled with the deck's own title."""
    if not words_only(spec):
        return None
    # Fix (2026-09-05): a CONTRACT deck is picture-free too, so words_only() was true for it and
    # pages() silently claimed it — the chatgpt-signin acceptance deck became ONE 5,884px scroll
    # at 1440x900 whose first question to answer started at y=3739, below a 3,611px contract
    # table, under a header reading "page 1 of 1 · 0 of 8 answered" — which invites a Done press
    # before he has scrolled. Pages are a QUESTION-deck behaviour (design §3.1); a deck that
    # defines or grades done keeps one step per screen.
    if has_contract(spec):
        return None
    out = []
    for st in spec['steps']:
        if is_page(st):
            out.append({'id': st['id'], 'title': st.get('page') or '', 'intro': st.get('intro') or '', 'steps': []})
            continue
        if not out:
            # No marker before the first question: the implicit first page, the deck's own title.
            out.append({'id': 'P-1', 'title': spec.get('title') or '', 'intro': '', 'steps': []})
        out[-1]['steps'].append(st)
    return out


def inline_label_errors(text, where, field, errors):
    """Refuse an inline "Today: …" / "Pro: …" label inside a field that has its own home for
    it. Matched case-insensitively at a word boundary, colon and all, so "professional" and
    "pro rata" are untouched."""
    low = (text or '').lower()
    for lab in INLINE_LABELS:
        if re.search(r'(?<![\w-])' + re.escape(lab), low):
            errors.append(f'{where}: {field} contains "{lab.capitalize()}" — put it in {INLINE_TARGET[lab]}')


def no_pictures(spec):
    """A deck with no picture steps at all — every step is live or words-only (a contract is
    words-only). It names no `images` folder and no `runs`; every code path that reaches for
    either bails out first (load_spec, crops.py, build.py, review-cards.py). Widens
    live.all_live."""
    # A page marker is not a step and has no picture of its own, so it never decides this.
    return bool(spec['steps']) and all(is_page(st) or is_live(st) or is_words(st) for st in spec['steps'])


def clip_files(spec, step):
    """{run: relative path to the .webm} for a clip step, and the same for posters (.webp)."""
    c = step['clip']
    runs = step_runs(spec, step)
    if isinstance(c, str):
        vids = {r: f"{spec['images']}/clips/{c}--{r}.webm" for r in runs}
    else:
        vids = {r: c.get(r) for r in runs}
    posters = {r: (re.sub(r'\.webm$', '.webp', v) if v else None) for r, v in vids.items()}
    return vids, posters


def run_names(spec):
    """Display order of the deck's runs: before then after when both exist, else as written."""
    r = list(spec['runs'].keys())
    return ['before', 'after'] if set(r) == {'before', 'after'} else r


def step_runs(spec, st):
    """Which captures THIS slide shows — its own `runs` list, or the deck's when it names none.

    WHY a slide may choose (Destin, 2026-09-06): `runs` used to be a property of the DECK, so a
    "here is today, build it?" point and a "here is before and after, keep it?" point could never
    sit together, and an author had to hand him two links for one ask. The run set is a property
    of the picture, not of the deck, so it lives on the slide. Kept in the deck's own order, so
    before still reads left of after however the slide lists them."""
    names = st.get('runs')
    if not names:
        return run_names(spec)
    order = run_names(spec)
    return [r for r in order if r in names]


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
    for i, st in enumerate(spec['steps']):
        # A slide may show fewer captures than the deck holds, so "is this a before/after?" is
        # asked per slide rather than once for the whole deck.
        two_runs = len(step_runs(spec, st)) == 2
        sid = st.get('id') or f'step {i + 1}'
        if not st.get('id'):
            errors.append(f'{sid}: missing id')
        elif st['id'] in ids:
            errors.append(f'{sid}: duplicate id')
        ids.add(st.get('id'))
        # A PLACEHOLDER, before any kind-specific rule: a generated deck must not be servable
        # until its descriptions are written. WHY (2026-09-05): `selfie` shipped every step with
        # the same two generic sentences, and Destin answered five of them "i have literally no
        # idea what i'm supposed to be looking at ... make this review deck more useful".
        for k, v in st.items():
            if isinstance(v, str) and v.strip().startswith(TODO):
                errors.append(f'{sid}: {k} is still a placeholder — replace the "{TODO} …" line '
                              'with what actually changed on this page and what Destin will notice')
        # A slide's own `runs` must be captures the deck actually holds, or its pictures would
        # be looked for in a folder nobody named.
        if 'runs' in st:
            if not isinstance(st['runs'], list) or not st['runs']:
                errors.append(f'{sid}: runs must be a list naming the captures this slide shows')
            else:
                unknown = [r for r in st['runs'] if r not in spec['runs']]
                if unknown:
                    errors.append(f'{sid}: runs names {", ".join(unknown)}, which the deck does not '
                                  f'capture (it has {", ".join(run_names(spec))})')
        # A PAGE MARKER first of all: it is not a step, so none of the step rules apply to it.
        if is_page(st):
            _validate_page(spec, st, sid, i, errors)
            continue
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
            errors.append(f'{sid}: one picture and nothing to compare it with — this slide needs a highlight (selector or text)')
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


def _validate_page(spec, st, sid, i, errors):
    """A page marker starts a new page of a QUESTION deck (design 3.1). It carries nothing but
    its title and one line of intro — anything else means its author meant to write a step —
    it belongs only in a deck with no pictures, and it must actually have questions under it."""
    if [k for k in st if k not in PAGE_FIELDS]:
        errors.append(f'{sid}: a page marker carries only page and intro')
    # Fix (2026-09-05): `is_page` is keyed on the KEY's presence, not its value, so
    # `{"id": "P-2", "page": ""}` was still a marker — and rendered a page with no eyebrow,
    # no header title, nothing to tell it apart from the page before it.
    if not (st.get('page') or '').strip():
        errors.append(f'{sid}: a page marker needs a title in "page"')
    if not words_only(spec):
        errors.append(f'{sid}: pages are for question decks — this deck has pictures')
    elif has_contract(spec):
        # Same rule from the other side: pages() refuses a contract deck, so a marker left in one
        # would be silently dropped rather than drawn. Say so at build time instead.
        errors.append(f'{sid}: pages are for question decks — this deck defines done (it has a contract step)')
    # Its page runs to the NEXT marker, so a marker followed straight by another one is empty
    # even though there are questions further down the deck.
    mine = 0
    for nxt in spec['steps'][i + 1:]:
        if is_page(nxt):
            break
        mine += 1
    if not mine:
        errors.append(f'{sid}: an empty page')


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
    recommended answer alone plus Other is exactly the shape Destin asked for (2026-09-01).
    Shared by both callers (a picture decide via _validate_decide, and a words question via
    _validate_question) — so every option-level rule below (the label refusals, the pros/cons
    shape, the recommended flag) holds for either kind. The `(recommended)`-in-a-label check
    and the inline-label scan of `summary` used to live only in _validate_question, which a
    picture decide step never reached — moved here 2026-09-05 because the design says "any
    option label", not "any words-question option label"."""
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
        if not o.get('label'):
            errors.append(f'{sid}/{oid}: missing label')
        elif RECOMMENDED_RE.search(o['label']):
            errors.append(f'{sid}/{oid}: "(recommended)" in a label — set "recommended": true on the option instead')
        # An option's body is now pros and cons (design §3.2); `summary` alone is still fine —
        # every deck written before this change has only that, and they must keep building.
        # Fix: a whitespace-only summary ("   ") must count as absent, or a blank-looking
        # option silently passes with nothing Destin can actually read (2026-09-05).
        summary = (o.get('summary') or '').strip()
        if not (o.get('pros') or o.get('cons') or summary):
            errors.append(f'{sid}/{oid}: an option needs pros, cons or a summary')
        inline_label_errors(o.get('summary'), f'{sid}/{oid}', 'summary', errors)
        for k in OPTION_TEXT_FIELDS:
            for w in banned_in(o.get(k)):
                errors.append(f'{sid}/{oid}: {k} uses banned word "{w}"')
        # Fix: pros/cons must be an actual list of short lines. A bare string used to slip
        # through here and iterate by CHARACTER in the loop below (banned_in on each letter),
        # and a blank line ("") in the list would render as a bullet with nothing on it.
        for k in ('pros', 'cons'):
            val = o.get(k)
            if val is None:
                continue
            if not (isinstance(val, list) and all(isinstance(line, str) and line.strip() for line in val)):
                errors.append(f'{sid}/{oid}: {k} must be a list of short lines')
                continue
            # A pro or a con is a sentence Destin reads, so it obeys the same vocabulary as the rest.
            for line in val:
                for w in banned_in(line):
                    errors.append(f'{sid}/{oid}: {k} uses banned word "{w}"')
        # Fix: `recommended` is read as a plain boolean everywhere it is used (page.js's
        # badge, the "at most one" count in _validate_question) — a truthy non-bool ("yes")
        # would badge silently, and a falsy non-bool ("no") would silently not.
        if o.get('recommended') is not None and not isinstance(o['recommended'], bool):
            errors.append(f'{sid}/{oid}: recommended must be true or false')
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
    # A words step with options is ALWAYS a question — there is no other reason to offer a
    # choice — so it owes the three parts even when its author forgot `today` entirely.
    elif is_question(st) or st.get('options'):
        _validate_question(st, sid, errors, warnings)
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


def _validate_question(st, sid, errors, warnings):
    """A words step that asks something (design §3.2). It says what exists, what goes wrong and
    what would change, each in its own field; its options carry their own pros and cons, and at
    most one of them is the recommended one — flagged, never written into the label."""
    for k in QUESTION_FIELDS:
        if not st.get(k):
            errors.append(f'{sid}: missing {k} (a question says what exists, what goes wrong, '
                          f'and what would change — today / problem / proposal)')
        else:
            inline_label_errors(st[k], sid, k, errors)
    if not st.get('options'):
        return
    _validate_options(st, sid, errors, warnings, minimum=1)
    # Fix: the label refusal and the summary inline-label scan moved into _validate_options
    # (2026-09-05), which a picture decide step now shares — so only the "at most one
    # recommended" count stays a words-question-only rule here.
    opts = st['options'] if isinstance(st['options'], list) else []
    recommended = sum(1 for o in opts if isinstance(o, dict) and o.get('recommended'))
    if recommended > 1:
        errors.append(f'{sid}: {COUNT_WORD.get(recommended, recommended)} options are recommended — at most one')


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
        if REVIEW_SOURCE_RE.match(src):
            pass  # a review file, not a deck — resolved by contract.py, never by `sources`
        elif not SOURCE_RE.match(src):
            errors.append(f'{sid}/{rid}: source must look like <deck key>#<step id> or review:<file>#<finding id>')
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
