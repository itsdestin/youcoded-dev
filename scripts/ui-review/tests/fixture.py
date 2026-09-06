"""The deck specs every test builds on, over the synthetic screenshot run in
deck/fixture/make_runs.py — flat 1440x900 'shots' with a known rectangle that changes, and a
manifest with known measurements. Lets every deck test run without Chrome or the workbench.

The RUN itself is not made here any more: `review-cards.py selfie` needs the same pictures, and
one generator with two callers cannot drift the way two copies would."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # scripts/ui-review
from deck.fixture.make_runs import GEO, make_clips, make_runs   # noqa: E402  (GEO re-exported: tests import it from here)
# A 90-character `path` for the header-overflow test (Task 4) — measured at 1440x900 to be
# exactly long enough that .top's flex row runs out of room and #prev/.steps (the progress
# bar) get squeezed toward zero width, sliding backward to sit under the path text, unless the
# CSS fix holds. Padded with '.', not spaces, to stay exactly 90 chars if this phrase is ever
# shortened — a trailing run of SPACES collapses under CSS whitespace rules even with
# `white-space:nowrap`, which silently shortened an earlier version of this string to 82
# rendered characters and made the test pass even against the un-fixed CSS (2026-09-05).
LONG_PATH_BASE = 'Settings > Appearance > Advanced options > Debug tools > Diagnostics > Experimental flags.'
LONG_PATH = (LONG_PATH_BASE + '.' * 90)[:90]

def make_fixture(tmp, themes=('midnight', 'light'), clip=False, long_path=False):
    make_runs(os.path.join(tmp, 'runs'), themes)
    deck = os.path.join(tmp, 'deck'); os.makedirs(deck, exist_ok=True)
    spec = {'title': 'Fixture review', 'key': 'fixture', 'out': 'fixture.html', 'images': 'images/deck',   # images/<spec stem>, the convention validate() warns about breaking
            'runs': {'before': os.path.join(tmp, 'runs', 'before'), 'after': os.path.join(tmp, 'runs', 'after')},
            'themes': list(themes), 'crops': {'c': ['main', 'home', GEO]},
            'steps': [
                {'id': 'S-1', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'headline': 'A red block appeared.',
                 'changed': 'A red block was painted.', 'measured': '120 px wide', 'notice': 'You see red.', 'risk': 'None really.'},
                {'id': 'S-2', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'selector': '#send'},
                 'headline': 'The send button moved.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'},
                {'id': 'S-3', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'text': 'Send'},
                 'headline': 'Same, by text.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'}]}
    # A CLIP step: two 1-second recordings, where record-pair.sh would put them. make_clips
    # returns False (and the step is left out) when this machine has no ffmpeg — as CI has not.
    if clip and make_clips(os.path.join(deck, 'images', 'deck', 'clips')):
        spec['steps'].append({'id': 'S-4', 'surface': 'Home', 'path': 'Chat', 'clip': 'blink',
                              'headline': 'The block now blinks.', 'changed': 'It animates.', 'notice': 'Motion.', 'risk': 'None.'})
    if long_path:
        # Fix (2026-09-05): stresses both Task 4 fixes in one deck — a long `path` on every
        # step (so #wsub can genuinely overflow the top bar at 1440px if the eyebrow's flex-
        # shrink regresses) and a picture DECIDE step whose three option summaries plus a Risk
        # card outgrow the side column (so the third card and Risk card would slice off, and
        # the answer row would scroll away with them, without the col-right CSS fix). Kept
        # behind this flag so the default fixture — every other test in this suite — never
        # moves a byte.
        for st in spec['steps']:
            st['path'] = LONG_PATH
        spec['steps'].append({
            'id': 'S-5', 'surface': 'Home', 'path': LONG_PATH, 'crop': 'c',
            'highlight': {'selector': '#send'}, 'headline': 'Which layout should the button use?',
            'risk': 'A longer risk sentence, so the Risk card itself adds real height to the column, the way a genuine review often does.',
            'options': [
                {'id': 'a', 'label': 'Keep it on one row', 'summary':
                 'This keeps the button exactly where it sits today, in the same row as everything else on the screen, so nothing about the surrounding layout changes and nobody has to relearn where to look. It costs nothing to build and matches every screenshot already in the help pages. The row does get busier every time a new action joins it, and on a narrow window two labels already start to touch, leaving no room to add anything else here without shrinking what is already crowded.'},
                {'id': 'b', 'label': 'Move it to its own row', 'summary':
                 'This drops the button onto a row of its own, underneath everything else, so it always has plenty of open space around it no matter how many other actions get added later. Nothing above it ever gets more crowded, and a narrow window never forces two labels to touch. The page grows a little taller because of the extra row, which pushes everything below it down slightly, and on a very short window that extra row can push the next section further out of view.'},
                {'id': 'c', 'label': 'Let it wrap on its own', 'summary':
                 'This lets the button move to a second row on its own whenever the window gets narrow, without anyone deciding the exact width in advance. At a wide window it behaves like keeping it on one row, and at a narrow window it behaves like giving it a row of its own, so both benefits arrive without a separate setting. The tradeoff is that the exact moment it wraps depends on how long the neighboring labels happen to be that day.'},
            ],
        })
    p = os.path.join(deck, 'deck.json'); json.dump(spec, open(p, 'w'), indent=1); return p


# ── live panes ──────────────────────────────────────────────────────────────────────────
# A LIVE-only deck needs no screenshots at all, which is exactly why the live tests live in
# test_live.py: no ImageMagick, no ffmpeg, no workbench — so they are the deck coverage that
# actually runs in CI, where none of those binaries exist.
STUB_PANE = """<!doctype html><meta charset="utf-8"><title>stub pane</title>
<body style="margin:0">
<div id="c" style="height:%(h)dpx">candidate %(id)s</div>
<script>
  // What the real route does, in miniature: report a height on load, and swap theme IN PLACE
  // when the deck asks — never by reloading.
  //
  // Everything is reported back by postMessage because the deck and the panes are on
  // different ports, so the test (which drives the deck's frame) cannot read into this
  // document at all. `id` is minted per LOAD: if a theme click ever reloaded the pane, the
  // id in its acknowledgement would differ from the one it announced at load. That is the
  // no-reload proof.
  window.__id = 'p' + Math.random().toString(36).slice(2);
  window.__lastTheme = null;
  // Reports a WIDTH the deck spec did not declare (the fixture leaves paneWidth unset, so
  // the deck starts at its 360 default) — that is how the test proves the measured width
  // wins over the guessed one.
  parent.postMessage({type:'youcoded:pane-height', height:%(h)d, width:%(w)d, candidate:'%(id)s'}, '*');
  parent.postMessage({type:'stub:loaded', candidate:'%(id)s', id:window.__id}, '*');
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'youcoded:theme') {
      window.__lastTheme = e.data.theme;
      parent.postMessage({type:'stub:theme', theme:e.data.theme, candidate:'%(id)s', id:window.__id}, '*');
    }
  });
</script>
"""


class LivePaneServer:
    """One stub page per candidate on an ephemeral port, standing in for the workbench."""

    def __init__(self, height=220, width=420):
        import http.server
        import socketserver
        import threading
        page_height, page_width = height, width

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                from urllib.parse import parse_qs, urlparse
                cand = (parse_qs(urlparse(self.path).query).get('candidate') or [''])[0]
                body = (STUB_PANE % {'h': page_height, 'w': page_width, 'id': cand}).encode()
                self.send_response(200)
                self.send_header('content-type', 'text/html; charset=utf-8')
                self.send_header('content-length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True
            allow_reuse_address = True

        self.srv = S(('127.0.0.1', 0), H)
        self.port = self.srv.server_address[1]
        self.base = f'http://127.0.0.1:{self.port}'
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()


def live_spec(tmp, base=None, **over):
    """A live-only deck: no `images`, no `runs`, one pick-one step and one try-this step."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    spec = {
        'title': 'Live fixture', 'key': 'live-fixture', 'out': 'live.html',
        'themes': ['midnight', 'light'],
        # `base` beats `offset` so a fixture can point at an ephemeral port without doing
        # arithmetic against a constant it does not care about.
        'live': {'worktree': 'live-tree', **({'base': base} if base else {})},
        'steps': [
            {'id': 'L-1', 'surface': 'Session strip', 'path': 'Header',
             'headline': 'Which pill expand feels right?',
             'live': {'surface': 'strip-expand', 'round': 1},
             'variants': [
                 {'id': 'a', 'label': 'As built', 'candidate': 'as-built', 'summary': 'Gentle overshoot.'},
                 {'id': 'b', 'label': 'Snappier', 'candidate': 'snappy', 'summary': 'Stops dead.'},
             ]},
            {'id': 'L-2', 'surface': 'Session strip', 'path': 'Header',
             'headline': 'Does the drag feel right?',
             'live': {'surface': 'strip-drag', 'round': 2, 'candidate': 'as-built'},
             'changed': 'The pill follows your cursor.', 'notice': 'No jump on release.',
             'risk': 'Widths freeze while you drag.'},
        ],
    }
    spec.update(over)
    p = os.path.join(deck, 'live.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p


# ── words-only decks ────────────────────────────────────────────────────────────────────
def words_spec(tmp, **over):
    """A QUESTIONS deck: no pictures anywhere. Two questions written the way a question is
    written now — today / the problem / the proposal as their own fields, options carrying
    their own pros and cons, the preferred one flagged rather than labelled "(recommended)"
    — one statement to approve with relabelled buttons, and one yes/no/don't-know question
    with no options at all. Picture-free on purpose, like live_spec — this is CI coverage."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    spec = {
        'title': 'Questions fixture', 'key': 'questions-fixture', 'out': 'questions.html',
        'themes': ['midnight', 'light'],
        'steps': [
            {'id': 'Q-1', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'Where does the invite live?',
             'today': 'Your friends are a list you open from the games screen.',
             'problem': 'There is nowhere on that list to start a game, so you go looking for the friend twice.',
             'proposal': 'Put the invite next to the friend it is for.',
             'options': [{'id': 'a', 'label': 'In the friends list', 'recommended': True,
                          'summary': 'The invite sits on the friend it is for.',
                          'pros': ['One place for everything about a friend.',
                                   'Nothing new to find — the list is already open.'],
                          'cons': ['The row gets a little busier.']}]},
            {'id': 'Q-2', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'How many boards on screen at once?',
             'today': 'One game fills the window, and a second game replaces it.',
             'problem': 'You lose sight of the first game the moment you open another.',
             'proposal': 'Show more than one board at a time.',
             'options': [{'id': 'a', 'label': 'One', 'summary': 'Simplest.',
                          'pros': ['Nothing to take in but the game you are playing.'],
                          'cons': ['You cannot watch two games at once.']},
                         {'id': 'b', 'label': 'Two', 'summary': 'Mine and theirs.',
                          'pros': ['You can see both games without switching.'],
                          'cons': ['Each board is half the size.']},
                         {'id': 'c', 'label': 'As many as fit', 'summary': 'Costs a layout rule.',
                          'pros': ['Nothing is ever hidden from you.'],
                          'cons': ['Boards get small fast.']}]},
            # A PAGE MARKER, not a step: it answers nothing and gets no line in the summary.
            # Everything after it sits on its own page, because the thinking shifts here from
            # "which design do we pick" to "is this statement true" (design §3.1).
            {'id': 'P-2', 'page': 'What we promise', 'intro': 'Statements, not questions.'},
            {'id': 'Q-3', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'A game you leave keeps running for the other player.',
             'changed': 'Stated, not asked: the alternative would surprise the friend who stayed.',
             'notice': 'Nothing yet — this becomes a row of the contract.',
             'yes': 'Holds', 'no': 'Fails'},
            {'id': 'Q-4', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'Should a game keep its sound when you switch away from it?',
             'today': 'A game goes quiet the moment you look at something else.',
             'problem': 'You miss your turn, because nothing tells you the other player moved.',
             'proposal': 'Yes keeps the game audible while you are elsewhere; No leaves it silent.'},
        ],
    }
    spec.update(over)
    p = os.path.join(deck, 'questions.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p


# ── contract ────────────────────────────────────────────────────────────────────────────
def contract_spec(tmp, **over):
    """A contract deck plus the two source decks its rows point at, each with a SUBMITTED
    answers file — so contract-check has something real to resolve. Picture-free."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    # Source deck 1: a words question, answered. Source deck 2: a picture step, answered.
    q = {'title': 'Q', 'key': 'arcade-questions', 'out': 'q.html', 'themes': ['midnight'],
         'steps': [{'id': 'Q-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Where does the invite live?',
                    'options': [{'id': 'a', 'label': 'Friends list', 'summary': 'One place.'}]}]}
    r1 = {'title': 'R1', 'key': 'arcade-r1', 'out': 'r1.html', 'images': 'images/r1', 'runs': {'today': '/nowhere'},
          'crops': {'c': ['main', 'home', '10x10+0+0']},
          'steps': [{'id': 'S-1', 'surface': 'Board', 'path': 'Games', 'crop': 'c', 'highlight': {'text': 'Send'},
                     'headline': 'Boards are told apart.', 'changed': 'A colour band.', 'notice': 'Two boards.'},
                    {'id': 'S-2', 'surface': 'Board', 'path': 'Games', 'crop': 'c', 'highlight': {'text': 'Send'},
                     'headline': 'Skipped one.', 'changed': 'x', 'notice': 'y'}]}
    for name, s in (('q', q), ('r1', r1)):
        with open(os.path.join(deck, f'{name}.json'), 'w') as f:
            json.dump(s, f, indent=1)
    with open(os.path.join(deck, 'q.answers.json'), 'w') as f:
        json.dump({'deck': 'arcade-questions', 'submitted': '2026-09-01T09:00:00Z',
                   'answers': {'Q-1': {'v': 'pick', 'pick': 'a', 'seconds': 12}}}, f)
    with open(os.path.join(deck, 'r1.answers.json'), 'w') as f:
        json.dump({'deck': 'arcade-r1', 'submitted': '2026-09-01T09:30:00Z',
                   'answers': {'S-1': {'v': 'yes', 'note': 'band could be thinner', 'seconds': 20},
                               'S-2': {'v': 'skip', 'seconds': 1}}}, f)
    spec = {
        # Fix: `out` must share the contract's stem (arcade.contract.html, not contract.html) —
        # two contracts in one folder would otherwise overwrite each other's built page.
        'title': 'Arcade — contract', 'key': 'arcade-contract', 'out': 'arcade.contract.html', 'themes': ['midnight'],
        'branch': 'feat/arcade-fixture',
        'sources': {'arcade-questions': 'q.json', 'arcade-r1': 'r1.json'},
        'steps': [{'id': 'C', 'surface': 'Games arcade', 'path': 'Contract', 'headline': 'This is what done means.',
                   'rows': [
                       {'id': 'R1', 'statement': 'The invite lives in the friends list.', 'checkedBy': 'deck',
                        'threshold': 'pass/fail', 'source': 'arcade-questions#Q-1'},
                       {'id': 'R2', 'statement': "A second player's board is tellable from mine at a glance.",
                        'checkedBy': 'human', 'threshold': 'pass/fail', 'source': 'arcade-r1#S-1', 'note': 'band could be thinner'},
                       # The guard must exist under workspace_root() — which from a WORKTREE is the main
                       # checkout, so it has to be a file already on master, not one this branch adds.
                       {'id': 'R3', 'statement': 'The board fills the pane at every width.', 'checkedBy': 'mechanical',
                        'guard': 'scripts/ui-review/tests/test_spec.py', 'threshold': 'the named test passes',
                        'source': 'arcade-r1#S-1'},
                   ]}],
    }
    spec.update(over)
    # `<feature>.contract.json` — the `.contract` in the stem is what close-out.sh globs for.
    p = os.path.join(deck, 'arcade.contract.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p
