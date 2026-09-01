---
status: draft
created: 2026-08-31
spec: docs/active/specs/2026-08-31-live-review-panes-design.md
tags: [ui-review, deck, workbench, tooling]
---

# Live Review Panes — implementation plan

Design: `docs/active/specs/2026-08-31-live-review-panes-design.md`. This plan is
the build order; the spec is the reason for each piece.

Two repos, two branches. Neither half needs the other to *pass its own tests* —
the deck's tests point at a stub server, and the route's tests are unit tests —
so most of the work parallelises. Two steps are genuinely serial and are called
out in [Order](#order-and-parallelism): **B9** (wiring the test runner) comes
first, and **B10** (the boot guard) can only *pass* once Part A's route exists.

| Branch | Repo | Worktree |
|---|---|---|
| `feat/live-candidate-route` | `youcoded` | `worktrees/live-route` |
| `feat/deck-live-panes` | `youcoded-dev` | `worktrees/deck-live` |

Both halves get a worktree. `youcoded-dev` takes them too — `worktrees/retrieval-repair`
is one right now — and the main checkout currently carries five modified and a dozen
untracked files from other sessions, over the same `scripts/ui-review/` tree Part B
rewrites.

```bash
# youcoded
cd youcoded && git fetch origin
git worktree add ../worktrees/live-route -b feat/live-candidate-route origin/master
cp -al desktop/node_modules ../worktrees/live-route/desktop/node_modules

# youcoded-dev
cd .. && git fetch origin
git worktree add worktrees/deck-live -b feat/deck-live-panes origin/master
```

## Known state before starting

`scripts/ui-review/tests` is red today, and has been invisibly red because
nothing runs it. B9 deals with this before anything else — see B9.

---

## Part A — `youcoded`: the one-candidate route

### A1 · Extract the frame wrapper  ·  no behaviour change

`CompareView.tsx:39` holds a local `Frame` that renders `canvas` / `panel` /
`inset`. The live route needs the identical wrapper, and two copies would drift.

- New `src/renderer/dev/workbench/compare/Frame.tsx` — move the function
  verbatim, export it.
- `CompareView.tsx` imports it and drops its local copy.

**Also export the pane-width default.** `CompareView` writes
`width: surface.paneWidth ?? 360` at its call site; the live route and the deck
both need the same number. Put `export const PANE_WIDTH = 360;` beside `Frame`
and have `CompareView` use it, so there is one place that says 360.

**Done when:** `tsc --noEmit` clean and the compare view renders unchanged.

### A2 · Address a candidate by (surface, round, candidate)

New `src/renderer/dev/workbench/compare/lookup.ts`:

```ts
export type Lookup =
  | { ok: true; surface: CompareSurface; round: Round; candidate: Candidate }
  | { ok: false; level: 'surface' | 'round' | 'candidate'; asked: string; available: string[] };

export function findCandidate(surfaceId?: string, round?: string | number, candidateId?: string): Lookup
```

Each failure carries the names that *do* exist at that level, because the deck
cannot check this join and the route is the only place that can say so.

**WHY round is required** (put this as the comment on the function): candidate
ids are unique only within a round, and the registry keeps every round forever.
Measured on 2026-08-31: `close-prompt-body` has ten rounds and reuses `labelled`
(R1, R2) and `one-line` (R3, R5). Without a round in the address, a pane silently
shows the wrong design and the reviewer approves something they never saw.
(`inline` also appears twice, but in two *different* surfaces — `close-prompt-body`
and `bash-grant-width` — which the surface parameter already separates. It is not
evidence for `round`; don't cite it as such.)

**Test** `tests/compare-lookup.test.ts`:
- resolves a known triple;
- each of the three failure levels returns its own `level` and a non-empty
  `available`.

No test pins the registry's *content*. A test asserting "some surface still
reuses a candidate id" would go red the day someone tidies `close-prompt-body`,
and the round parameter stays either way — so that fact belongs in the WHY
comment above, not in a suite.

### A3 · The error boundary

New `src/renderer/dev/workbench/compare/CandidateBoundary.tsx` — a class
component with `componentDidCatch`, rendering the error message and stack head
inside the pane.

**WHY a class component:** a render throw unmounts the whole React root, so
without a boundary one broken candidate blanks every pane on the page, and
function components cannot catch.

Wire it into `CompareView` too — the compare view has the same exposure today.

### A4 · The route body

New `src/renderer/dev/workbench/LiveCandidate.tsx`:

1. **No `surface` param → the index.** Every surface, its rounds, and each
   round's candidates, as links carrying `round`. This is the browse page and
   the boot-check route.
2. **`findCandidate` failure → the message** for that level plus `available`.
3. **Success →** `<CandidateBoundary><Frame frame={surface.frame}
   width={surface.paneWidth ?? PANE_WIDTH}>{candidate.render()}</Frame></CandidateBoundary>`,
   with nothing else on the page — no header, no label, no border. The deck
   draws the caption; the pane is only the thing. The `?? PANE_WIDTH` is not
   optional: a surface that declares no width would otherwise stretch to the
   iframe, and the deck sizes its row on the same number.
4. **Height reporting.** `ResizeObserver` on the content wrapper →
   `parent.postMessage({ type: 'youcoded:pane-height', height, candidate }, '*')`
   on mount and on every change. **Carry the candidate id**: the deck shows two
   to four panes and a bare `{type, height}` cannot say which one grew. `'*'` is
   correct for the target here — the message carries no secret and the deck's
   port is not knowable at build time.
5. **Theme messages.** `window.addEventListener('message', …)` accepting only
   `http://127.0.0.1:*` / `http://localhost:*` / `http://[::1]:*` origins, for
   `{ type: 'youcoded:theme', theme }` → `window.__workbenchAppearanceSync({ theme })`.

   **WHY not re-point the address:** reloading the pane restarts the animation
   and discards whatever the reviewer had set up. `__workbenchAppearanceSync`
   (`mock-shim.ts:1272`) is the same live-swap path the landing page's embed
   already uses.

The **pop-out** needs nothing here: "open on its own" is this same address in a
new tab, so it is a link the deck draws (B4/B5) around the URL it already has.

### A5 · Mount the route, and seed its theme

Both changes are in `src/renderer/index.tsx`.

**The route**, in the `isChild` block beside `view === 'compare'` (line 259):

```tsx
if (__view === 'live') {
  const [{ LiveCandidate }, { ThemeProvider }, { ChatProvider }] = await Promise.all([...]);
  __mount.render(<ThemeProvider><ChatProvider><LiveCandidate /></ChatProvider></ThemeProvider>);
  return;
}
```

Both providers, for the reason `view === 'compare'` already documents: a
candidate that borrows a real chat component crashes without `ChatProvider`.

**The theme**, at module top level, immediately **above** the anti-FOUC read at
line 23:

```tsx
// A live-candidate pane is addressed purely by URL: the deck embeds it from
// another origin and cannot reach this origin's localStorage. Seeding the stored
// value HERE — above the anti-FOUC read below, which is the first paint, and
// which reads the same key ThemeProvider's initialiser reads
// (theme-context.tsx:171) — is what makes a pane arrive already wearing its
// theme. Scoped to this exact three-parameter address so no other surface gains
// a URL theme override; the remote web app has real URLs and must not.
const __q = new URLSearchParams(location.search);
const __liveTheme = __q.get('theme');
if (__liveTheme && __q.get('mode') === 'workbench' && __q.get('child') === '1' && __q.get('view') === 'live') {
  try { localStorage.setItem('youcoded-theme', __liveTheme); } catch {}
}
const storedTheme = localStorage.getItem('youcoded-theme') || 'midnight';
```

**WHY here and not in the theme system.** The obvious alternative — teaching
`theme-context.tsx`'s `activeSlug` initialiser to read `?theme=` — changes the
app's real theme code on every surface for the sake of a dev-only tool, and makes
`?theme=` live on the remote web surface where URLs are real. This does the same
job in four lines of a file that already reads that exact key two lines later,
and cannot reach any address but the pane's.

Ordering matters and is the whole trick: line 23 runs at bundle evaluation,
while the `view === 'live'` branch is inside an `await`ed dynamic import. Writing
the theme in the branch would be too late — the first frame would already be
painted in the previously stored theme.

Two consequences to know rather than discover:
- The write persists on that origin, so the last theme a pane used becomes the
  default for a plain `?mode=workbench` tab on the same port. Dev-only, and the
  deck always passes an explicit theme.
- Nothing else changes: the workbench's mock returns `null` from
  `appearance.get()` (`mock-shim.ts:1261`), so the on-mount preferences load
  cannot overwrite it, and a community slug still falls back exactly as any
  stored slug does today. **Re-check that `get()` still returns `null` before
  writing the line.**

### A6 · Verify Part A

```bash
bash scripts/verify.sh worktrees/live-route
bash scripts/run-workbench.sh worktrees/live-route      # announce before launching
```

Then by hand, in the dev window:
- the index at `?mode=workbench&child=1&view=live`;
- one candidate, and the same address with `&theme=light` and `&theme=creme` —
  correct on the **first** frame, no flash of the previous theme;
- three deliberately wrong addresses (bad surface, bad round, bad candidate),
  each naming what was not found and listing what exists.

---

## Part B — `youcoded-dev`: live panes in the deck

### B9 · Make the deck's tests actually run  ·  do this first

**Measured 2026-08-31:** `rg` across the workspace for `ui-review/tests`,
`unittest` and `node --test` finds the seven `test_*.py` files and the **three**
`.test.mjs` files (`deck-render`, `coverage`, `shot-measure`) and **nothing that
invokes any of them** — not `workspace-ci.yml`, not a runner script, not the
README. `scripts/perf-lab/` documents its command; the deck does not. These
suites are green only in the sense that nobody has ever asked.

Asked, they are not green. Three things have to be fixed before a CI step can
be honest:

**1. The documented command does not work.**
```
$ python3 -m unittest discover -s scripts/ui-review/tests -p 'test_*.py' -t .
ImportError: Start directory is not importable: '…/scripts/ui-review/tests'
```
`tests/` has no `__init__.py`, so `-t .` cannot name the modules. The working
form makes the start directory the top level, which is what the tests' own
`sys.path.insert` already assumes:
```bash
python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'
```
That runs **69 tests in ~11 s**.

**2. `test_tokens` is red — eight drifted values.** The deck inlines the app's
theme colours (`deck/tokens.json`) and that suite pins them to
`youcoded/desktop/src/renderer/styles/globals.css`. The app is the authority
and the deck is stale, so the deck's own chrome currently draws secondary text
slightly wrong in four of six themes:

| Token | deck says | app says |
|---|---|---|
| `light.fg-dim` | `#656565` | `#535353` |
| `light.fg-muted` | `#797979` | `#5E5E5E` |
| `dark.fg-muted` | `#6C6C6C` | `#898989` |
| `midnight.fg-dim` | `#8B949E` | `#919AA4` |
| `midnight.fg-muted` | `#6E7681` | `#858D97` |
| `creme.fg-2` | `#564938` | `#504333` |
| `creme.fg-dim` | `#695E4D` | `#564C3D` |
| `creme.fg-muted` | `#7D7161` | `#615648` |

Copy the app's values into `deck/tokens.json` in this same commit. Wiring a red
suite into CI teaches everyone to ignore it, which is the disease being cured.

**3. Scope the CI step to suites that need no external binary.** That is
`test_spec`, `test_tokens`, and the new `test_live` (B8) — **not** `test_boxes`,
which shells out to `magick` four times (lines 23, 24, 36, 41).
`test_build`, `test_crops`, `test_cli` and `test_serve` build screenshots
through ImageMagick too; they stay local, as do all three `.test.mjs` suites
(Chrome, and ffmpeg for the clip fixture).

- **`.github/workflows/workspace-ci.yml`** — a step beside "Test the workspace
  hooks". The sub-repo clone step above it already provides `wecoded-themes`
  and `youcoded`, which `workspace_root()` and `test_tokens` both need:
  ```yaml
  - name: Test the review deck
    if: ${{ !cancelled() }}
    run: |
      python3 -m unittest -v \
        -t scripts/ui-review/tests \
        tests.test_spec tests.test_tokens tests.test_live
  ```
  (Use whichever of the explicit-module or `discover` form runs clean from the
  repo root — the point is that the three named suites run and the
  binary-dependent ones do not.)
- **`scripts/ui-review/README.md`** — the full local command, the way
  `scripts/perf-lab/README.md` carries its own, with a line saying which suites
  need `magick`, `ffmpeg` or Chrome and therefore never run in CI.

This plan adds roughly a dozen tests to that suite. Wiring it up first is what
makes them worth writing — and it is the exact failure the CI file already names
in a comment: *"a check that stops checking goes quiet, not red."*

Related open item, not this plan's job: ROADMAP already tracks "Review-deck test
hygiene" (bare `open()` warnings, a sleep instead of a port poll). Leave it.

### B1 · `deck/live.py` — one place that knows the port

```python
LIVE_OFFSET = 340          # 5513. Clear of run-dev (50), run-workbench (60), record-pair (300).
PANE_WIDTH  = 360          # must match compare/Frame.tsx's PANE_WIDTH

def is_live(step)                      # bool(step.get('live'))
def live_offset(spec)                  # spec['live'].get('offset', LIVE_OFFSET)
def live_base(spec)                    # spec['live']['base'] if set, else 'http://127.0.0.1:<5173+offset>'
def pane_url(spec, live, candidate, theme)   # the full ?mode=workbench&child=1&view=live&… address
```

`build.py` and `serve.py` both read the spec, so a page built earlier and a
server started later cannot disagree — which is what makes `serve --no-build`
safe.

`pane_url` is the only place the address is spelled. It always emits `child=1`
and always emits `round`.

**`live.base` exists for the tests.** B8's stub server binds an ephemeral port,
which is not `5173 + <a sane offset>`. Letting the spec name a base outright
avoids fixtures doing arithmetic against a constant they don't care about.
`offset` stays as the thing `serve.py` hands to `run-workbench.sh`.

### B2 · `deck/spec.py` — validation, and decks with no pictures

1. `load_spec`: require `title`, `key`, `out`, `steps`. Require `images` and
   `runs` only when some step is not live; default `runs` to `{'today': None}`
   so `run_names`, `step_themes` and `validate`'s `two_runs` keep working
   unchanged.
2. **Guard `_images_folder_warning`.** It ends `validate()` with a bare
   `spec['images']`, so a live-only deck raises `KeyError` before any live code
   runs. Return early when the key is absent. (This is one of three such sites —
   see B3 and B4.)
3. Dispatch **live first**, before `is_choice`:
   ```python
   if is_live(st): _validate_live(spec, st, sid, errors, warnings); continue
   ```
   Live must come first because both the choice path and the default path
   *require* a crop; live turns that requirement off rather than inheriting it.
4. Extract only what is provably identical across all four existing validators:
   the headline word cap and the banned-word sweep over `TEXT_FIELDS`, as
   `_headline_and_words(st, sid, errors)`. **Do not fold in the `themes`-shape
   or `risk`-length checks.** They look shared but are not: `_validate_clip`
   takes no `warnings` argument and performs neither, so routing it through a
   common helper would *add* validation clip steps do not have today — a
   behaviour change wearing a refactor's clothes. If that wider tidy-up is
   wanted, it is its own commit with its own reasoning.
5. `_validate_live` enforces the spec's rules: `live.surface` and `live.round`
   present; no `crop` / `clip` / `highlight` / `options`; with `variants`, 2–4
   of them each carrying `id`/`label`/`candidate`/`summary` and no `crop`;
   without `variants`, `live.candidate` + `changed` + `notice`; deck-level
   `live.worktree` present.
6. The fit warning: `n × paneWidth > 1600` → *"the panes will not fit side by
   side and the row will scroll — use fewer candidates or a narrower surface"*.
   The registry's real `paneWidth` is not knowable from this repo, so read an
   optional `live.paneWidth` and fall back to `PANE_WIDTH` (360), which is the
   route's own default for a surface that declares none. **Warning, never an
   error** — the registry is the authority, and this repo is estimating.

**Test** `test_live.py` (B8): every rule above, plus a live-only deck with no
`images`/`runs` validating clean.

### B3 · `deck/crops.py` — skip live steps, and skip live-only decks

Two changes, not one:

```python
def crop_images(spec, log=print):
    # A deck whose every step is live has no pictures and names no images folder;
    # this function's first line would otherwise KeyError on spec['images'].
    if all(is_live(st) for st in spec['steps']):
        return {'boxes': {}, 'missing': [], 'warnings': [], 'count': 0}
    out_dir = os.path.join(spec['_base'], spec['images'])
    ...
    for st in spec['steps']:
        if is_live(st):
            continue   # a running app, not a still — nothing to cut
```

Without the loop guard, `spec['_crops'][st['crop']]` raises `KeyError` on the
first live step of a mixed deck. Without the early return, `spec['images']`
raises on a live-only deck before the loop is even reached.

**Tests:** the mixed case goes in `test_crops.py` (it needs the ImageMagick
fixture, so it stays local); the live-only case goes in `test_live.py`.

### B4 · `deck/build.py` — emit the panes

- `_live_step(spec, st)` → `{'id', 'kind': 'live', 'surface', 'path', 'headline',
  … , 'panes': [{'id', 'label', 'summary', 'measured', 'risk', 'url'}],
  'height': live.get('height'), 'width': live.get('paneWidth', PANE_WIDTH)}`.
  One pane for a try-this, one per variant for a pick-one; `url` from `pane_url`.
- `deck_data` gains `'live': {'base': live_base(spec), 'worktree': …}` when any
  step is live, so `page.js` can probe the server.
- `build_page`'s picture-existence loop skips live steps (as it already skips
  clips).
- Pane URLs carry the deck's **first** theme (`spec['themes'][0]`, the same one
  the template stamps on `<html>`); the page rewrites nothing — theme changes go
  by message.
- **Guard the third `spec['images']` site.** `review-cards.py`'s `build()` prints
  `f'{r["count"]} crops → {os.path.join(spec["_base"], spec["images"])}'`
  unconditionally. Skip that line when the deck names no images folder.

**Test** `test_live.py`: the emitted URLs contain `child=1`, `view=live`, the
surface, the round and the candidate; every pane carries a `url` the pop-out can
use; a live step produces no image lookups; `DECK.live.base` matches the spec.

### B5 · `deck/page.js` — the live branch

Six touch points. Each is small; together they are the bulk of the work.

1. **`media(st, f)`** — for `kind === 'live'`, an
   `<iframe src=… loading="eager" data-pane="<id>">` plus the pop-out link
   (`<a href="<same url>" target="_blank" rel="noopener">open on its own</a>`)
   in the figure's caption row, instead of `<img>` + box.
2. **`frames(st)`** — one frame per pane, and live panes are **not** `pickable`.
   Picking stays on the lettered card and the answer button, because a click
   inside a pane is an interaction with the candidate, not an answer.
3. **`layout()`** — it opens `const img = $('#inner img, #inner video'); if (!img) return;`
   and the **only** place `window.__deckReady = true` is set is its last line.
   A live step therefore has to return from its own branch *after* setting both:
   ```js
   document.body.dataset.layout = 'live';   // the render test reads this
   window.__deckReady = true;               // …and waits on this before reading anything
   ```
   Miss the second line and every live case in B8 fails on a 10 s timeout with
   nothing to explain it (`deck-render.test.mjs:49,67` poll that flag). Panes are
   laid out in one row at the step's `width × measuredHeight`; the stage already
   scrolls when the row is wider than it is.
4. **`#thumbs`** — for a live step, buttons with the theme name and no `<img>`.
   Their click handler does **not** call `render()` (which would rebuild the
   iframes and reload them): it sets `theme`, updates
   `document.documentElement.dataset.theme`, repaints the `.on` classes and
   posts `{type:'youcoded:theme', theme}` to every pane.
5. **Zoom is hidden on a live step** (`#zoom` hidden, the `+`/`-`/`0` keys inert).
   The magnifier needs no work — its handler already searches `$$('#inner img')`
   and hides itself when it finds none, so it is inert on a live step today.
   Confirm that rather than re-implementing it.
6. **A focus hint under the pane row**: *"Click the page outside a pane to use
   ← → again."* The deck binds `keydown` on its own `document`; once a click
   lands inside a pane, focus is in the iframe's document and arrow-key
   navigation, `l` and the zoom keys stop reaching the deck. On a step whose
   whole purpose is clicking and dragging inside the pane, that is the normal
   case, not an edge case. Prev / Next / the answer buttons all still work by
   mouse, so a one-line hint is the proportionate fix; trying to steal focus back
   would fight the candidate for its own clicks.

Two more listeners:

- **Height:** `message` handler for `youcoded:pane-height`. Accept only
  `e.origin === DECK.live.base` — the route validates the origin of what it
  receives (A4.5) and the deck must be symmetric — and match the message's
  `candidate` to the pane, since two to four panes report independently. Set that
  pane's iframe height, capped at the stage height (then the pane scrolls). Give
  every pane a **minimum height** so a pane whose script never runs is visibly
  empty rather than a zero-pixel line. A `live.height` override skips the
  measurement.
- **Server probe:** on entering a live step,
  `fetch(DECK.live.base + '/', {mode: 'no-cors', cache: 'no-store'})` once. A
  rejection means the server is not running: render the "not running" card with
  the exact command instead of the iframes. This is also how an archived deck
  reports itself, and it is reliable where an iframe `load` event is not —
  Chrome fires `load` on its own error page.

### B6 · `deck/page.css`

```css
.pic iframe { display:block; border:1px solid var(--edge); background:var(--canvas); }
```

**No `border-radius`, no clipping wrapper.** A rounded, clipped iframe makes
Chrome ignore the cutout on the app's glass surfaces, so Meadow Mist blurs the
whole pane — verified, and tracked as an open landing-page bug. Rounding from
inside the pane is the known fix if it ever matters; square is free.

### B7 · `deck/serve.py` — boot the app server

Placed **after** the `already_served` check (which returns 3 before the
`try/finally`) and before `make_server`, when any step is live and
`live.worktree` is set:

1. Resolve the worktree the way `record-pair.sh` does (`worktrees/<name>`, a
   path with `desktop/`, or `youcoded`).
2. Guard the port: if something already listens on it, read
   `/proc/<pid>/cwd`; if it is not this worktree's `desktop/`, **refuse with the
   two spellings and the fix**, exactly as `record-pair.sh:45` does. A foreign
   server would show the wrong code with no visible sign.
3. Otherwise `nohup bash scripts/run-workbench.sh <tree>` with
   `YOUCODED_PORT_OFFSET=<offset>`, poll `curl -sf` for up to 60s, fail loudly
   with the log path if it never answers.
4. **Do not set `VITE_NO_WATCH`.** Watching on is what lets Claude edit a
   candidate while the deck is open and have the pane update in front of Destin.
   (It also means a Vite watcher lives for the length of the review; close the
   deck when done — a stack of watchers is what exhausted this machine's inotify
   budget before.)
5. Stop it in the same `finally` that removes the lock — only if *we* started
   it, never a server that was already running.

Add `--no-live` to `review-cards.py serve` for the case where Destin already has
the workbench up and wants it left alone.

**Test** `test_live.py`: with a stub `run-workbench.sh` on `PATH`, serve starts
it, the lock clears and the stub is stopped on exit; a foreign listener on the
port makes serve refuse with a non-zero exit and the two paths in the message.
Uses a live-only spec, so it needs no picture fixture and rides into CI.

### B8 · Tests: `test_live.py` and the stub pane server

**A new module rather than cases spread across the existing suites.** B9 can only
run suites that need no `magick`, and `test_build` / `test_crops` / `test_serve`
all build screenshots in `setUp`. Splitting the new coverage across them would put
it permanently outside CI. Everything live-only goes in `tests/test_live.py`; only
the *mixed* deck case (B3) stays in `test_crops.py`, where it belongs and where it
already needs pictures.

`tests/fixture.py` gains `make_live_fixture(tmp)`: a live-only spec plus a
`http.server` thread on an ephemeral port serving one stub HTML page that posts a
height on load and answers `youcoded:theme` by recording it on
`window.__lastTheme`. The spec's `live.base` is set to that server's address (B1).
No ImageMagick, no ffmpeg, no workbench.

**`tests/deck-render.test.mjs`** — local only (it launches Chrome) — then asserts,
on a live step:
- `document.body.dataset.layout === 'live'` and the pane is at its declared width;
- the theme row is labels, and clicking one changes `__lastTheme` inside the
  pane **without the iframe reloading** (compare a marker set on the pane's
  `contentWindow` before and after);
- clicking the pane records no answer; clicking the card does;
- the pop-out link points at the same address as the pane;
- zoom controls hidden;
- with the stub server stopped, the "not running" card renders with text in it.

### B10 · Boot guard  ·  `youcoded-dev`, but it needs Part A running

`scripts/workbench-boot-check.mjs` lives in **this** repo, not in `youcoded`
(`find . -name workbench-boot-check.mjs` returns only `./scripts/…`), so the
route's guard is a Part B edit even though the route is a Part A file. Add to
`ROUTES`:

```js
['live candidate index', '&child=1&view=live'],
```

The index rather than a named candidate, so the guard cannot rot when a candidate
is renamed. Write it with the rest of Part B; it can only **pass** once Part A's
branch is what `run-workbench.sh` is serving, which is Part C.

### B11 · Docs

- `scripts/ui-review/README.md`: a "Live panes" section — when to reach for one,
  the two step shapes, and the one-command flow — plus the test command from B9
  and which suites need which binary.
- `review-cards.py`'s module docstring: the step kinds line becomes five, and
  names the live variants.
- `docs/MAP.md` row 19: add `deck/live.py` to the deck's entry points, and
  replace `manual` in its guard-tests column with the command from B9.

---

## Part C — end to end

1. Author one throwaway two-candidate surface in the route branch's
   `compare/registry.tsx`. **It does not get merged** — that file's header says
   rounds are never deleted, so a throwaway left in it becomes permanent record
   of a comparison that never happened. Drop the commit before the PR.
2. Write a two-step deck spec against it — one live pick-one, one ordinary
   screenshot step — to prove they mix under one Submit.
3. `python3 scripts/ui-review/review-cards.py serve <spec>` in the background.
   **Tell Destin before it opens a browser window.**
4. `node scripts/workbench-boot-check.mjs 5513` against that server, so B10's
   route is exercised for real.
5. Destin's pass: hover, click, drag, switch theme mid-animation, pop one out,
   then click the page and check ← → still work.
6. While he watches, edit a candidate and confirm the pane updates in place.

**Then hand the interactive verification to Destin rather than scripting it** —
per the workspace rule, this is exactly the "launch it and look at it" case.

**Not in this plan:** re-authoring the in-flight `feat/session-strip-motion`
review as live pick-one steps. The spec names that as the motivating outcome, but
it needs real alternatives authored as candidates, which is a design session, not
a build step. It is the next session's job and should be a ROADMAP item, not a
silent omission.

---

## Verification

```bash
# youcoded
bash scripts/verify.sh worktrees/live-route

# youcoded-dev — note -t, and note these are `unittest`, not pytest
python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'
node --test scripts/ui-review/tests/deck-render.test.mjs

# end to end, with run-workbench.sh serving the route branch on 5513
node scripts/workbench-boot-check.mjs 5513
```

The full Python sweep runs 69 tests in ~11 s but needs `magick` locally
(`test_boxes`, `test_build`, `test_crops`, `test_cli`, `test_serve`);
`deck-render.test.mjs` needs Chrome, and the clip fixture needs `ffmpeg`. All
three are present on this machine. CI runs only `test_spec`, `test_tokens` and
`test_live`.

## Order and parallelism

- **B9 first, alone.** Wiring the runner, fixing the eight drifted tokens and
  correcting the command are what make everything after it verifiable rather
  than assumed.
- **A1–A3 and B1–B3 in parallel** (foundations, no cross-dependency).
- **A4–A5 and B4–B8 in parallel** (the two halves proper).
- **A6 and B10–B11**, then **Part C serial** — Part C is where B10's route first
  has something real to mount, and it is the only step that needs both branches
  at once.

## Risks

| Risk | Mitigation |
|---|---|
| `layout()` is the deck's core sizing engine and every step kind runs through it | The live branch returns before the image maths rather than threading a special case through it — but it must set `__deckReady` on the way out (B5.3), or the tests that would catch a regression never run at all |
| Wiring a suite into CI that has never run | B9 fixes the one standing failure (eight token values) in the same commit and scopes the step to suites with no binary dependency, so the first CI run is green for a real reason |
| Four running app copies on one page is heavy | Cap of 4 is a validation error, not advice; panes are one candidate each, not whole app windows |
| A candidate renamed in `youcoded` silently breaks a deck in `youcoded-dev` | Cannot be checked at build time (different checkout) — which is why the route reports the unknown name with the list of real ones, and why the boot-check uses the index |
| A pane swallows the keyboard once clicked | Disclosed with a hint under the row (B5.6) rather than fought for; every navigation and answer control remains reachable by mouse |
| Two sessions editing `scripts/ui-review/` at once | Part B works in `worktrees/deck-live`; the main checkout currently holds other sessions' uncommitted work over the same files |
