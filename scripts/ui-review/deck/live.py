"""Live panes: where a pane's address comes from, and who owns the port it points at.

A live step shows the RUNNING app instead of a screenshot — one authored candidate out of
`compare/registry.tsx`, in its own frame, that Destin can hover, click and drag. Motion is
judged by doing it; two recordings side by side is how the 2026-08-31 session-strip review
failed. Spec: docs/archive/specs/2026-08-31-live-review-panes-design.md.

WHY this is its own module: `build.py` bakes the pane addresses into the page and `serve.py`
starts the server those addresses point at. Both read the SAME spec through here, so a page
built earlier and a server started later cannot disagree about the port — which is what makes
`serve --no-build` safe."""

from urllib.parse import urlencode

VITE_BASE_PORT = 5173
# 5513. Deliberately clear of run-dev.sh (50), run-workbench.sh (60) and record-pair.sh /
# run-review.sh (300), so a deck can be served while any of those is already running.
LIVE_OFFSET = 340
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
    build.py, review-cards.py)."""
    return bool(spec['steps']) and all(is_live(st) for st in spec['steps'])


def live_offset(spec):
    return (spec.get('live') or {}).get('offset', LIVE_OFFSET)


def live_base(spec):
    """The origin the panes are served from. `live.base` wins when set — the tests bind a stub
    server on an ephemeral port, which is not `5173 + <any sane offset>`, and making a fixture
    do that arithmetic against a constant it does not care about is a trap. `offset` remains
    the thing serve.py hands to run-workbench.sh."""
    explicit = (spec.get('live') or {}).get('base')
    if explicit:
        return explicit.rstrip('/')
    return f'http://127.0.0.1:{VITE_BASE_PORT + live_offset(spec)}'


def pane_width(spec):
    """What the deck believes a pane is wide. The registry is the authority and lives in the
    other repo, so a spec may declare `live.paneWidth` to match it; absent that, the route's
    own default is the honest guess."""
    return (spec.get('live') or {}).get('paneWidth', PANE_WIDTH)


def pane_url(spec, live, candidate, theme):
    """The one place a pane address is spelled. Always `child=1` (without it the workbench
    renders its toolbar frame instead of the page) and always `round` (candidate ids are
    unique only within a round — `close-prompt-body` reuses `labelled` and `one-line` across
    its ten rounds, so an address without a round silently shows the wrong design)."""
    q = urlencode({
        'mode': 'workbench',
        'child': '1',
        'view': 'live',
        'surface': live['surface'],
        'round': live['round'],
        'candidate': candidate,
        'theme': theme,
    })
    return f'{live_base(spec)}/?{q}'
