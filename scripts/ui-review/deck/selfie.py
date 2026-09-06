"""The review deck, reviewed on a review deck.

WHY this exists: every change to the APP reaches Destin as a Before | After deck with the
changed region boxed. Every change to the DECK ITSELF reached him as a sentence in chat — which
is exactly the prose description the deck was built to replace. `selfie` closes that hole.

What it does, in one run:
  1. builds the synthetic screenshot run (deck/fixture/make_runs.py) that the fixture decks show;
  2. copies the three fixture decks — one carrying EVERY kind of step, a one-picture brief, and
     a two-page question deck — beside it, pointed at that run;
  3. checks the workspace out a second time at `--before` (origin/master by default) and builds
     all three decks TWICE: once with that copy's deck code, once with this worktree's;
  4. shoots every page of both builds with THIS worktree's renderer (one driver for both runs,
     so the driver is never the thing that differs) at two window sizes in two palettes;
  5. writes a review deck whose steps are the pages that actually MOVED, boxed by pixel diff,
     and serves it.

Two rules the shape follows. The built page inlines page.css and page.js, so a page built by the
old copy keeps the old look no matter who serves it — that is what makes one server and one
renderer safe. And a page that did not move gets no step: `highlight: "auto"` refuses to build a
box around nothing, so emitting every page would fail the build on the first unchanged one."""
import json
import os
import shutil
import subprocess
import threading

from .boxes import diff_bbox
from .fixture.make_runs import make_clips, make_runs
from .preview import CHROME, page_count
from .serve import make_server
from .spec import load_spec, workspace_root

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'fixture')
UI_REVIEW = os.path.dirname(HERE)
# The plan name the review deck's own crops are filed under, and the two window sizes and two
# palettes every page is shot in. Two of each is the smallest set that can catch a change that
# only shows at one width, or only in one palette.
PLAN = 'selfie'
SIZES = ['1440x900', '1024x768']
# Longer than the renderer's own default: a page holding a RECORDING keeps Chrome's spinning
# loading ring on screen until the video has fetched, and that ring is at a different angle in
# every shot — which the pixel diff then boxes as a change (measured 2026-09-05).
SETTLE_MS = 2000
THEMES = ['midnight', 'light']
RUNS = ['before', 'after']
# Every fixture deck, and the plain-words name its pages carry into the review.
DECKS = [('selfie', 'Review deck'), ('selfie-brief', 'Brief deck'), ('selfie-questions', 'Questions deck')]
REVIEW_STEM = 'selfie-review'


def _child_env():
    """The environment every `review-cards.py build` child runs in.

    Two things are pinned. `build` opens a deck on whatever theme Destin's app is on right now,
    which would make the two runs differ because of his app rather than because of the code — so
    both are pointed at an appearance file that does not exist and fall back to the spec's own
    order. And the second checkout sits in a temp folder with no sub-repos above it, so the walk
    up for the workspace root finds nothing and the build dies before it starts (measured
    2026-09-05); it is told where the real workspace is instead."""
    env = dict(os.environ)
    env['YOUCODED_APPEARANCE_FILE'] = os.path.join(HERE, 'no-such-appearance.json')
    env['YOUCODED_WORKSPACE'] = workspace_root()
    return env


def _lay_out_fixture(out, log):
    """The synthetic run plus the three fixture decks beside it. Returns {stem: spec path}."""
    runs = make_runs(os.path.join(out, 'runs'))
    deck = os.path.join(out, 'deck')
    os.makedirs(deck, exist_ok=True)
    specs = {}
    for stem, _ in DECKS:
        with open(os.path.join(FIXTURE, stem + '.json')) as f:
            s = json.load(f)
        # `runs` in the fixture file is written relative and unresolvable; point every name at
        # the synthetic folders just built. A one-run brief reads the AFTER run: "today" is the
        # app as it stands, which is what the after shots are.
        if 'runs' in s:
            s['runs'] = {name: runs['after' if name == 'today' else name] for name in s['runs']}
        p = os.path.join(deck, stem + '.json')
        with open(p, 'w') as f:
            json.dump(s, f, indent=1)
        specs[stem] = p
    # The clip step's recordings, where the spec says they are. No ffmpeg on this machine means
    # no recordings, and a clip step whose files are missing refuses to build — so drop it.
    if not make_clips(os.path.join(deck, 'images', PLAN, 'clips')):
        log('no ffmpeg here: the moving-picture step is left out of the fixture')
        _drop_clip_step(specs['selfie'])
    return specs


def _drop_clip_step(path):
    with open(path) as f:
        s = json.load(f)
    s['steps'] = [st for st in s['steps'] if 'clip' not in st]
    with open(path, 'w') as f:
        json.dump(s, f, indent=1)


def shot_name(stem, page, size):
    """What one rendered page is called inside the review deck's run folders. It is both the
    shot name and the crop name, so `crops.image_name` resolves the picture with no copying."""
    return f'{stem}-p{page}-{size}'


def _plan_pages(specs, log):
    """[(deck stem, its plain-words name, page number)] for every page of every fixture deck."""
    plan = []
    for stem, label in DECKS:
        for n in range(1, page_count(load_spec(specs[stem])) + 1):
            plan.append((stem, label, n))
    log(f'{len(plan)} pages across {len(DECKS)} decks, at {len(SIZES)} sizes in {len(THEMES)} palettes')
    return plan


def _render_run(tree, run, specs, out, log):
    """Build all three decks with `tree`'s OWN deck code, then shoot every page with this
    worktree's renderer. Returns the set of deck stems that built (and so were shot).

    A deck the older copy cannot build (its code predates a field the fixture uses) is logged
    and skipped, not fatal: a selfie of the kinds BOTH copies can draw is still the review."""
    rc = os.path.join(tree, 'scripts', 'ui-review', 'review-cards.py')
    built = []
    for stem, _ in DECKS:
        r = subprocess.run(['python3', rc, 'build', specs[stem]], capture_output=True, text=True, env=_child_env())
        if r.returncode != 0:
            last = (r.stderr.strip() or r.stdout.strip()).splitlines()
            log(f'{stem}: the copy at {run} could not build it — its pages are left out of the review')
            log('  ' + (last[-1] if last else f'exit {r.returncode}'))
            continue
        built.append(stem)
    if not built:
        return built

    # ONE server for the whole run: all three built pages sit in the same folder, and the page
    # carries its own look inside it, so the server never decides what a page looks like.
    srv, url = make_server(load_spec(specs[built[0]]), 0, lambda state: None)
    base = url.rsplit('/', 1)[0]
    # A daemon thread, never serve(): serve() blocks until a submit and takes the deck's lock.
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        for stem in built:
            sp = load_spec(specs[stem])
            shots = os.path.join(out, 'shots', run, stem)
            r = subprocess.run(
                ['node', os.path.join(HERE, 'render.mjs'), '--url', f'{base}/{sp["out"]}', '--out', shots,
                 '--sizes', ','.join(SIZES), '--themes', ','.join(THEMES), '--pages', str(page_count(sp)),
                 '--settle', str(SETTLE_MS)],
                capture_output=True, text=True)
            try:
                result = json.loads(r.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                # Never guess at the cause — show what the renderer actually said.
                log(f'{stem} at {run}: the renderer did not finish (exit {r.returncode}): '
                    f'{r.stderr.strip() or r.stdout.strip()}')
                continue
            for e in result['errors']:
                log(f'{stem} at {run}: {e}')
            _file_shots(result['files'], stem, run, out)
    finally:
        # Both halves, in a finally: a render that throws must not leave a loopback server
        # holding a port for the rest of the session.
        srv.shutdown()
        srv.server_close()
    return built


def _file_shots(files, stem, run, out):
    """render.mjs writes `p<n>-<theme>-<w>x<h>.png` into one flat folder. Move each into the
    run layout the deck rig reads — `<run>/shots-selfie/<theme>/<shot>.png` — so the review deck
    can point at it with an ordinary crop instead of anything bespoke."""
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        # Split from both ends, never by index: a theme name may carry a dash of its own.
        bits = name.split('-')
        page, theme, size = bits[0][1:], '-'.join(bits[1:-1]), bits[-1]
        d = os.path.join(out, 'selfie-runs', run, f'shots-{PLAN}', theme)
        os.makedirs(d, exist_ok=True)
        shutil.move(f, os.path.join(d, shot_name(stem, page, size) + '.png'))


def _run_dir(out, run):
    return os.path.join(out, 'selfie-runs', run)


def _moved(out, stem, page, size, theme):
    """True when this page's picture differs between the two runs. `diff_bbox` is the same
    measurement the deck itself uses for an "auto" highlight, so a page that passes here is a
    page whose box the build can actually resolve."""
    paths = [os.path.join(_run_dir(out, r), f'shots-{PLAN}', theme, shot_name(stem, page, size) + '.png') for r in RUNS]
    if not all(os.path.exists(p) for p in paths):
        return False
    return diff_bbox(paths[0], paths[1]) is not None


def _steps(out, plan, before_ref, dry_run, log, nothing_built=False):
    """One approve step per page that moved — or, on a dry run, per page that WOULD be shot.

    WHY only the pages that moved: `highlight: "auto"` boxes the pixels that differ, and a page
    where nothing differs has no box, which fails the build. Most pages do not move on most
    changes, so emitting them all would mean the selfie almost never builds."""
    changed = "The deck's own code on this branch, against " + before_ref + '.'
    steps = []
    for stem, label, page in plan:
        for size in SIZES:
            w, h = size.split('x')
            themes = list(THEMES) if dry_run else [t for t in THEMES if _moved(out, stem, page, size, t)]
            if not themes:
                continue
            palette = f'the {themes[0]} palette' if len(themes) == 1 else 'both palettes'
            steps.append({
                'id': shot_name(stem, page, size),
                'surface': label,
                'path': f'Page {page}, in a {w} by {h} window',
                'crop': shot_name(stem, page, size),
                'themes': themes,
                'highlight': 'auto',
                'headline': f'The {label.lower()}, page {page}, in a {w} by {h} window, in {palette}.',
                'changed': changed,
                'notice': 'Anything boxed is what moved.',
            })
    if steps or dry_run:
        return steps
    if nothing_built:
        # NOT the all-clear: no page was ever compared, so "nothing moved" would be a lie.
        return [{
            'id': 'NONE', 'words': True, 'surface': 'Review deck', 'path': 'Every page',
            'headline': 'Nothing could be compared: the older copy built none of the three decks.',
            'changed': 'Every deck failed to build with the code at ' + before_ref + '.',
            'notice': 'The reasons are in the log above this deck.',
            'yes': 'Understood', 'no': 'Looks wrong',
        }]
    # Nothing moved anywhere. That is a real, useful answer — say it as a step he can agree
    # with, rather than handing back a deck with no pages in it.
    log('nothing moved: every page looks the same on this branch as at ' + before_ref)
    return [{
        'id': 'NONE', 'words': True, 'surface': 'Review deck', 'path': 'Every page',
        'headline': 'Nothing moved: every page looks the same here as at ' + before_ref + '.',
        'changed': 'The deck code changed, but nothing it draws on screen did.',
        'notice': 'Nothing to look at — this one is the all-clear.',
        'yes': 'Understood', 'no': 'Looks wrong',
    }]


def _write_review(out, plan, steps, missing, before_ref):
    """The review deck itself. Its runs ARE the two folders of rendered pages, and each crop is
    a whole page — so the deck's ordinary machinery cuts the pictures and boxes the difference,
    with nothing about this deck special-cased anywhere else in the rig."""
    title = 'The review deck, reviewed on itself'
    if missing:
        # Say it on the deck, not only in the log: a reader must not take a short deck for
        # "only these pages moved" when some pages were never in the running.
        names = ', '.join(sorted(dict.fromkeys(m.lower() for m in missing)))
        title += f' — the {names} is left out, the copy at {before_ref} could not build it'
    crops = {}
    for stem, _, page in plan:
        for size in SIZES:
            crops[shot_name(stem, page, size)] = [PLAN, shot_name(stem, page, size), size + '+0+0']
    spec = {
        'title': title,
        'key': 'deck-selfie-review',
        'out': REVIEW_STEM + '.html',
        # `images/<stem>` because two decks sharing one images folder overwrite each other's
        # pictures — the rule validate() warns about.
        'images': os.path.join('images', REVIEW_STEM),
        # The deck is about how the deck LOOKS, so it keeps its own palette order rather than
        # following whichever theme Destin's app happens to be on.
        'theme': 'fixed',
        'runs': {r: _run_dir(out, r) for r in RUNS},
        'labels': {'before': before_ref, 'after': 'This branch'},
        'themes': list(THEMES),
        'crops': crops,
        'steps': steps,
    }
    path = os.path.join(out, REVIEW_STEM + '.json')
    with open(path, 'w') as f:
        json.dump(spec, f, indent=1)
    return path


def _add_worktree(out, before_ref, log):
    tree = os.path.join(out, 'before')
    root = workspace_root()
    r = subprocess.run(['git', '-C', root, 'worktree', 'add', '--detach', tree, before_ref],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'could not check {before_ref} out beside this one: {r.stderr.strip() or r.stdout.strip()}')
    log(f'{before_ref} checked out at {tree}')
    return tree


def _remove_worktree(out, log):
    tree = os.path.join(out, 'before')
    if not os.path.exists(tree):
        return
    r = subprocess.run(['git', '-C', workspace_root(), 'worktree', 'remove', '--force', tree],
                       capture_output=True, text=True)
    if r.returncode != 0:
        # Say so rather than leaving a second checkout on disk silently — `git worktree list`
        # will keep showing it until someone prunes it.
        log(f'could not remove the second checkout at {tree}: {r.stderr.strip() or r.stdout.strip()}')


def can_render(log=print):
    """False, with the reason logged, when this machine cannot shoot the pages."""
    for tool in (CHROME, 'node', 'magick'):
        if shutil.which(tool) is None:
            log(f'selfie needs {tool} on PATH')
            return False
    return True


def selfie(before_ref, out, log=print, dry_run=False, finish=None):
    """Returns 0, or 2 when this machine cannot render. `finish(spec path)` is what builds and
    serves the review deck — passed in rather than imported, because the thing that does it is
    review-cards.py, which imports this module."""
    os.makedirs(out, exist_ok=True)
    specs = _lay_out_fixture(out, log)
    plan = _plan_pages(specs, log)
    # The two run folders exist from the start, even on a dry run, so a session can see the
    # shape of what is about to be filled in.
    for r in RUNS:
        for t in THEMES:
            os.makedirs(os.path.join(_run_dir(out, r), f'shots-{PLAN}', t), exist_ok=True)

    missing = []
    if not dry_run:
        if not can_render(log):
            return 2
        try:
            tree = _add_worktree(out, before_ref, log)
            before_built = _render_run(tree, 'before', specs, out, log)
            # THIS worktree second, so the deck folder is left holding the pages this branch
            # builds — the ones a session would look at next.
            after_built = _render_run(os.path.dirname(os.path.dirname(UI_REVIEW)), 'after', specs, out, log)
            # A deck is in the review only if BOTH copies drew it — one picture cannot be
            # compared with a missing one.
            built = [s for s in before_built if s in after_built]
        finally:
            # Before the serve, not after: serving blocks for as long as Destin takes, and a
            # second checkout of the workspace must not sit on disk for that whole time.
            _remove_worktree(out, log)
        missing = [label for (stem, label) in DECKS if stem not in built]
        plan = [p for p in plan if p[0] in built]

    steps = _steps(out, plan, before_ref, dry_run, log, nothing_built=not dry_run and not plan)
    path = _write_review(out, plan, steps, missing, before_ref)
    log(f'wrote {path} — {len(steps)} step(s)')
    if dry_run:
        log('dry run: nothing was checked out, rendered or served')
        return 0
    return finish(path) if finish else 0
