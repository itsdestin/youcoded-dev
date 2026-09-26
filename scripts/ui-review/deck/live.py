"""Live panes: where a pane's address comes from, and who serves what it points at.

A live step shows the RUNNING app instead of a screenshot — one authored candidate out of
`compare/registry.tsx`, in its own frame, that Destin can hover, click and drag. Motion is
judged by doing it; two recordings side by side is how the 2026-08-31 session-strip review
failed. Spec: docs/archive/specs/2026-08-31-live-review-panes-design.md.

WHY this is its own module: `build.py` bakes the pane addresses into the page and `serve.py`
serves what they point at. Both read the SAME spec through here, so a page built earlier and
a server started later cannot disagree about the address — which is what makes
`serve --no-build` safe.

WHY relative addresses (2026-09-26, docs/active/specs/2026-09-24-shoot-and-explore.md → "Review
decks"): a live pane used to point at a FIXED port (`run-workbench.sh` on 5173+340), which
collided between sessions and lost its panes whenever the deck itself was restarted. The deck
now serves the practice app itself, under its own address, as `/app/index.html` — so a pane
survives a restart along with the rest of the page. `live.base` remains as an explicit escape
hatch: a test binds a stub server on an ephemeral port, which is not this deck's own address,
and making a fixture do arithmetic against a constant it does not care about is a trap."""

from urllib.parse import urlencode

# Must match PANE_WIDTH in youcoded's compare/Frame.tsx: the route falls back to it for a
# surface that declares no paneWidth, and the deck sizes the row on the same number. This
# repo cannot read the registry, so the two constants are pinned by comment, not by import.
PANE_WIDTH = 360


def is_live(step):
    """A LIVE step shows running app panes instead of stills. `live` names the surface and
    round in the compare registry; the candidate comes from `live.candidate` (try-this) or
    from each variant's `candidate` (pick-one)."""
    return bool(step.get('live'))


def has_live(spec):
    return any(is_live(st) for st in spec['steps'])


def all_live(spec):
    """A deck with no pictures at all: it names no `images` folder and no `runs`, so every
    code path that reaches for either has to bail out before it does (spec.py, crops.py,
    build.py, review-cards.py).
    Superseded by `spec.no_pictures` for every production path; kept because `test_live.py`
    pins it."""
    return bool(spec['steps']) and all(is_live(st) for st in spec['steps'])


def live_base(spec):
    """The origin a pane's address is written against. `live.base` wins when set — the tests
    bind a stub server on an ephemeral port, and page.js treats a spec that sets this as
    pointing at an EXTERNAL server it did not start (the old "is it running?" card still
    applies there). Empty otherwise: the address is root-relative, so it resolves against
    whatever this deck's own server is running on — no arithmetic, no fixed port to collide."""
    explicit = (spec.get('live') or {}).get('base')
    return explicit.rstrip('/') if explicit else ''


def pane_width(spec):
    """What the deck believes a pane is wide. The registry is the authority and lives in the
    other repo, so a spec may declare `live.paneWidth` to match it; absent that, the route's
    own default is the honest guess."""
    return (spec.get('live') or {}).get('paneWidth', PANE_WIDTH)


# The workbench routes a pane may point at instead of an authored candidate, from the same
# table `scripts/workbench-boot-check.mjs` mounts on every run. Allow-listed so a typo is caught
# at build time rather than painting an empty pane nobody can explain.
# WHY they exist as pane targets (Destin, 2026-09-06): a candidate is a SKETCH somebody wrote
# into compare/registry.tsx for one comparison. Asking him to operate a real screen of the app —
# the actual chat, the actual settings — had no shape at all, so a live slide could only ever
# offer drafts.
APP_SCENARIOS = ('default', 'empty', 'no-providers', 'refused', 'stress', 'site',
                 # The status-bar scenarios: the ONLY ones that push a status:data
                 # fixture, so the cost / tokens / cache / lines chips have figures
                 # and render at all. Everything they carry is invisible in 'default'
                 # — the chips bail when they have no value (spec §3, rule 1).
                 'statusbar-cc', 'statusbar-local', 'statusbar-metered',
                 'statusbar-unpriced', 'statusbar-delegated',
                 # Welcome back (2026-09-24): a cold start after a crash — empty
                 # strip, four conversations to offer back. The screen exists in
                 # no other scenario.
                 'welcome-back')
APP_VIEWS = ('tools', 'compare', 'assistant-final', 'attachments', 'session-pills')
# A whole screen of the app at the registry's 360px would render its narrow phone layout, which
# is not what "show me the real screen" means. Panes wrap, so a wide one costs nothing.
APP_PANE_WIDTH = 900
# A whole screen reports no height of its own (only an authored candidate's frame does),
# so without this it fell back to the 160px "never reported" floor and showed the top inch.
APP_PANE_HEIGHT = 620


def is_app_pane(d):
    """True when this pane (or step-level `live`) names a screen of the app rather than an
    authored candidate."""
    return bool(d.get('app') or d.get('view'))


def pane_url(spec, live, pane, theme):
    """The one place a pane address is spelled.

    `/app/index.html` is where THIS deck serves the practice app it just built (serve.py) —
    root-relative, so it resolves against whatever address the deck itself is running on.
    `live_base(spec)` prefixes it only when a spec names an explicit `live.base` (a test's
    stub server, standing in for a server this deck did not start).

    Always `child=1` — without it the workbench renders its toolbar frame instead of the page.
    A CANDIDATE pane always carries `round` too: candidate ids are unique only within a round
    (`close-prompt-body` reuses `labelled` and `one-line` across its ten rounds), so an address
    without one silently shows the wrong design. An APP pane names a scenario or a view instead,
    and carries neither.

    `pane` is the thing being shown: `{"candidate": id}`, `{"app": scenario}` or
    `{"view": name}`. The step's own `live` supplies whatever the pane does not."""
    d = {**live, **pane}
    q = {
        'mode': 'workbench',
        'child': '1',
        'theme': theme,
        # The workbench fakes 150ms on every mocked IPC by default — a knob for loading
        # states, not for motion. In a live pane it delayed the drop of a dragged session
        # pill by 150ms (the drop waits on a round trip that takes ~1 frame in the app), so
        # the pane showed a release the app never has. A pane is the app's motion: no latency.
        'latency': '0',
    }
    if is_app_pane(d):
        if d.get('view'):
            q['view'] = d['view']
        else:
            q['scenario'] = d['app']
        if d.get('stalled'):
            q['stalled'] = '1'
    else:
        q.update({'view': 'live', 'surface': d['surface'], 'round': d['round'], 'candidate': d['candidate']})
    return f'{live_base(spec)}/app/index.html?{urlencode(q)}'
