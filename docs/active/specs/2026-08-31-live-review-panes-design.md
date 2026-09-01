---
status: active
created: 2026-08-31
tags: [ui-review, deck, workbench, tooling]
---

# Live Review Panes

**Goal:** let a review deck carry panes of the running app that Destin can hover,
click and drag himself, so motion and interaction can be judged by feel instead
of from a recording.

**Decision that shapes everything else:** a live pane is a new *source of
picture*, not a new kind of step. It plugs into the two question shapes the deck
already has.

---

## Why

The 2026-08-31 session-strip review was four clip steps — a Before and an After
recording playing side by side. Destin's verdict: *"the videos are just rough to
compare."* That is the correct verdict for motion. A 200ms width animation on a
small pill is a thing you judge by doing it, not by watching two loops and
trying to hold the first in your head while the second plays.

The workbench's `CompareView` already renders live candidate designs side by
side against the real mock backend, with a pick recorded per round. What it
lacks is the review vocabulary — headline, What changed / You'll notice / Risk,
and a Submit that hands answers back to Claude. The deck has all of that and no
way to show anything live.

**The deck is the primary surface for building and reviewing UI features.** The
workbench stays as the fallback for when Destin specifically asks for a full
clickable build of the app's UI.

### What already exists that this reuses

This is assembly, not invention. Four pieces are already built and shipping:

| Piece | Where | What it gives us |
|---|---|---|
| Authored candidates with a frame and a real width | `compare/registry.tsx`, `compare/types.ts` | The panes' contents |
| A standalone, chrome-free workbench page | `renderer/index.tsx` `child=1` branch (`view=tools`, `view=compare`, `view=attachments`, …) | The route pattern to copy |
| Live theme swap of an embedded app, no reload | `__workbenchAppearanceSync({theme})` — used by the landing page's embed and by `docs/active/prototypes/landing-redesign-mockups/build.py` | The theme switcher |
| Booting a worktree's workbench on a guarded port | `record-pair.sh` | `serve`'s new job |

The landing-redesign prototype is the closest precedent: a Python script that
builds an HTML page embedding live workbench windows with a theme switcher over
them. This spec does the same thing inside the deck.

---

## What the reviewer sees

### Live is orthogonal to the question

A step's picture source (screenshot · recording · **live**) and its question
shape (**yes/no** · **pick one** · decide) are independent. Live panes attach to
both existing shapes rather than inventing a third:

| Shape | Panes | Answer | Use it for |
|---|---|---|---|
| **Pick one, live** | 2–4, side by side, each labelled with what differs | A / B / C / Other | **The default** for open-ended "build this" or "fix this animation" work |
| **Try this, live** | 1 | Yes / No / Other | Verifying something built to an agreed spec |

One review can mix a live pick-one, a picture yes/no and a live try-this, under
one Submit. That is the whole reason this lives in the deck.

### A pane

Each pane holds the piece being changed at its real size, with the app's real
primitives and real mock data behind it — for the session strip, actual session
pills with actual names on the actual header background. Not a shrunken app
window: three whole app windows across a screen makes a small pill animation
smaller, which is the opposite of the point.

Panes are interactive. Nothing is overlaid on them — no highlight ring, no crop
box. The pane IS the thing.

**Clicking inside a pane never answers the question.** On a picture step,
clicking a variant picks it; on a live step a click is an *interaction with the
candidate*, so picking happens only on the lettered card beside it or the answer
button below. The pane is not a pickable target.

**Zoom and the magnifier are off on live steps.** Both work by scaling a still
image; a pane has no image, and a pane at anything but real size is no longer
showing what it is there to show.

### Pop-out

Every pane carries an **Open in New Window** button that opens that same candidate,
alone, in a new browser tab. What it buys is *room and quiet* — a candidate
taller than the pane can be scrolled, and a drag or hover can be tried without
three other panes in the corner of your eye. It is not a wider candidate: pane
width is the registry's declared width in both places, because that width is
part of what is being judged. And it is not the candidate inside a running app —
an authored candidate does not exist inside the app, so there is no app to put
around it. When the question genuinely needs the whole app, that is the
workbench's job and a separate link.

### One theme at a time

Live steps show one theme, switched with **the deck's existing theme control** —
the same row of buttons every other step uses, rendered as plain labels instead
of thumbnails because a live step has no thumbnails. Switching theme re-themes
the deck's own chrome and every pane in the row **in place, without reloading
them**, so an animation mid-play or a half-finished drag survives the switch.

Four candidates × six themes would be twenty-four running copies of the app on
one page; one at a time is one to four.

### What is lost

An archived review does not replay. Reopen a live review months later and the
cards and recorded answers are all there, but each pane says the app server is
not running. Screenshot and recording steps do not have this problem, so a
review worth looking back at should carry a still or a clip alongside its live
steps.

---

## Architecture

Three parts, in two repos.

### 1. `youcoded` — a route that renders exactly one candidate

```
?mode=workbench&child=1&view=live&surface=<id>&round=<n>&candidate=<id>&theme=<slug>
```

Renders one candidate from the existing compare registry, in its declared frame
(`canvas` / `panel` / `inset`) at its declared `paneWidth`, with no workbench
chrome. `child=1` is not optional — without it the workbench's toolbar frame
renders instead of the page. Every `child=1` view already replaces the whole app
rather than mounting inside it, so "no chrome" is free.

- **`round` is part of the address, not an optimisation.** Candidate ids are
  unique only *within* a round, and the registry keeps every round forever by
  design. Measured 2026-08-31: `close-prompt-body` has ten rounds and reuses
  `labelled` (R1, R2) and `one-line` (R3, R5). Without `round`, a pane would
  silently show the wrong design and the reviewer would approve something they
  never saw. (`inline` also appears twice, but in two *different* surfaces —
  which `surface` already separates. It is not evidence for `round`.)
- Candidates come from `compare/registry.tsx`, unchanged. A candidate authored
  for the compare view is usable here and vice versa.
- **The route mounts the same providers the compare view does** — `ThemeProvider`
  and `ChatProvider`. The chat provider is not optional: candidates that borrow
  a real chat component crash without it, which is why `view=compare` already
  wraps in both.
- **The route owns an error boundary.** A component that throws during render
  takes down the entire page, not just its own subtree — without a boundary, one
  broken candidate blanks all four panes at once.
- **With no `surface`, the route renders an index** of every surface, round and
  candidate in the registry, each a link. That is the browse page, the
  "unknown name" error page's list, and a boot-check route that cannot rot when
  a candidate is renamed.
- **`theme` must be readable from the address.** Today the active theme lives in
  `localStorage` under `youcoded-theme` (`state/theme-context.tsx:30`), which an
  embedding page cannot set across an origin — the screenshot rig sets it by
  driving the browser, which a deck page cannot do. The live route reads
  `?theme=` and applies it in the theme state's initialiser (so a built-in theme
  is right at first paint), falling back to the stored value when absent. The
  workbench's mock returns `null` for stored appearance preferences, so nothing
  overwrites the parameter after mount.
- **Theme changes arrive by message, not by reload.** The route listens for
  `{ type: 'youcoded:theme', theme }` from a loopback origin and hands it to the
  already-shipping `__workbenchAppearanceSync({ theme })`, which is exactly the
  path the landing page's embed uses. Re-pointing the pane's address instead
  would reload it and throw away whatever state the reviewer had set up.

### 2. `youcoded-dev` — the deck renders panes and boots the server

- `deck/spec.py` learns the `live` field and its validation.
- `deck/crops.py` skips live steps, as it already skips clip steps — a live step
  has no crop to cut, and today's code would fail looking one up.
- `deck/build.py` renders a live step's panes as sealed windows onto the route
  above, plus the pop-out links. Answer handling is the existing pick-one /
  yes-no code, untouched.
- `deck/page.js` gets a live branch in three places: sizing (panes have a
  declared size, not an image's natural size), the theme row (labels, and a
  message to the panes instead of a full re-render), and zoom/magnifier (off).
- `deck/serve.py` boots the workbench for the deck's named worktree before
  serving and stops it on exit, the same way `record-pair.sh` already does — one
  server on a guarded port, refusing to film if a foreign tree is already
  serving it. One command still produces a working review.

**Why sealed windows rather than mounting the app's code into the deck page:**
the app applies its theme by writing colour values as *inline styles on the page
root*, which outranks every stylesheet rule the deck has. Mount the app into the
deck page and the app's theme silently repaints the deck's own headline, cards
and buttons — not a risk, a certainty. Isolation is worth more here than
self-containment.

**Live panes have square corners.** A rounded, clipped wrapper around an iframe
makes Chrome ignore the cutout on the app's glass surfaces, so wallpaper themes
(Meadow Mist) blur the entire pane — verified, and tracked as an open landing-
page bug. A thin border and no radius costs nothing and dodges it.

### 3. The join between them is a name

Candidates are code in `youcoded`, on the branch under review. The spec naming
them is a file in `youcoded-dev`. Nothing can check that join at spec-validation
time, because one side is TypeScript in another checkout. **Therefore the route
itself must report an unknown name loudly** (see Failure handling).

### Who owns the port

`build.py` bakes the panes' addresses into the page; `serve.py` starts the
server they point at. Both read the *same* value out of the spec —
`live.offset`, defaulting to a constant in `deck/live.py` — so they cannot
disagree, and `serve --no-build` still lines up with a page built earlier.

The default offset is **340** (port 5513), deliberately clear of `run-dev.sh`
(50), `run-workbench.sh` (60) and `record-pair.sh` (300), so a deck can be
served while any of those is running.

**File watching stays on.** `record-pair.sh` disables it because a recording is
a fixed artefact; a live review is the opposite. With watching on, Claude can
edit a candidate while Destin has the deck open and **the pane updates in front
of him** — which turns the deck from something you submit into something you
iterate in.

---

## Spec format

Deck level — one worktree per deck, because every candidate in a review comes
from one build:

```json
{
  "title": "Session strip motion",
  "key": "session-motion",
  "out": "deck.html",
  "themes": ["midnight", "light"],
  "live": { "worktree": "session-motion" }
}
```

`images` and `runs` are required only when the deck has at least one step that
needs a picture. A deck whose steps are all live names neither.

Step level — **pick one**:

```json
{
  "id": "expand-curve",
  "surface": "Session strip",
  "path": "Header",
  "headline": "Which pill expand feels right?",
  "live": { "surface": "session-strip-expand", "round": 1 },
  "variants": [
    { "id": "a", "label": "As built", "candidate": "as-built",
      "summary": "200ms, gentle overshoot at the end." },
    { "id": "b", "label": "Snappier", "candidate": "snappy",
      "summary": "140ms, stops dead — no overshoot." },
    { "id": "c", "label": "Softer", "candidate": "soft",
      "summary": "260ms, slows into place." }
  ]
}
```

Step level — **try this**:

```json
{
  "id": "drag",
  "surface": "Session strip",
  "path": "Header",
  "headline": "Does the drag feel right?",
  "live": { "surface": "session-strip-drag", "round": 2, "candidate": "as-built" },
  "changed": "The pill itself lifts and follows your cursor…",
  "notice": "No jump when you let go.",
  "risk": "Widths freeze while you drag, so the row cannot repack under the cursor."
}
```

Pane **width** is the surface's `paneWidth` from the registry (360px when the
surface does not declare one), so a dialog-width candidate cannot be squeezed.
Pane **height** is measured: the pane reports its own content height and the row
grows to fit, capped at the stage. `live.height` is an optional override, for
the rare case where a candidate should be judged inside a constrained box.

### Validation rules

- `live.worktree` is required at deck level as soon as any step carries `live`.
- Every step-level `live` needs `surface` and `round`.
- A step with `live` must NOT carry `crop`, `clip`, `highlight` or `options` —
  "the pane is the picture" (the same rule clip steps already have). Because both
  existing paths *require* a crop, live is checked first and turns that
  requirement off; it does not inherit it.
- `live` **with** `variants`: each variant needs `id`, `label`, `candidate`,
  `summary`; none may carry `crop`. 2–4 variants.
- `live` **without** `variants`: `live.candidate`, `changed` and `notice` are
  required — it is an approve step.
- Headline word cap and the banned-word list apply unchanged. `surface` and
  `path` are required, as for every step.
- **Warning** (not an error) when the panes cannot fit side by side: `n ×
  paneWidth` wider than 1600px means the row will scroll horizontally, which
  defeats comparing them. Use fewer candidates, or a narrower surface.

---

## Failure handling

Four failures, none of which may render a blank rectangle. Each follows
`docs/error-message-standards.md`: specific and accurate, never a guessed cause.

| Failure | What the pane shows | How it is detected |
|---|---|---|
| App server not reachable | That the server for this review is not running, and the exact command to start it. This is also the archived-review case. | The deck probes the base address once on entering a live step; a network failure is unambiguous. |
| Unknown `surface`, `round` or `candidate` | Which name was not found, at which level, and the names that do exist. | The route reports this — the spec cannot. |
| The candidate throws while rendering | The error, in the pane, with the other panes still alive. A crashed variant must never be mistakable for a design choice. | The route's error boundary. |
| The candidate is taller than the pane | Nothing — the pane grew to fit it. Only a `live.height` override can clip, and then the pane scrolls rather than cutting off. | Height is measured, not declared. |

---

## Non-goals

- **Before/after across two code versions.** Rejected in brainstorming: two
  builds means two servers and a second mechanism. Recordings still cover it.
- **Live steps in every theme at once.** One theme, the deck's existing switcher.
- **A theme control of the live step's own.** The deck already has one.
- **Moving `CompareView` into the deck.** It stays as the workbench's own view;
  the deck reuses its registry, not its harness.
- **Self-contained archives.** Accepted loss, stated above.
- **More than 4 panes.** Each pane boots a copy of the app; four is the cap.
- **Zooming a live pane.** Real size is the point.

---

## Testing

**First, a precondition.** The deck's seven Python suites and three Node suites
(`deck-render`, `coverage`, `shot-measure`) are invoked by nothing today — not
workspace CI, not a runner script, not the README (measured: `rg` for
`ui-review/tests`, `unittest` and `node --test` across the workspace finds the
files and no caller). Nor are they green: the documented `unittest discover`
command fails outright (`-t .` cannot import a directory with no `__init__.py`),
and once corrected, `test_tokens` reports eight theme colours where the deck's
inlined copy has drifted from the app's `globals.css`. Adding a dozen tests to a
suite nobody runs buys nothing, so wiring it into `workspace-ci.yml` — and
fixing what that exposes — comes before writing any of them. That is the failure
the CI file already names in a comment of its own: *"a check that stops checking
goes quiet, not red."*

| What | Where |
|---|---|
| `live` validation: required fields, rejected fields, pane-count bounds, the fit warning, which shape a step resolves to | `scripts/ui-review/tests/test_spec.py` |
| `crop_images` skips live steps instead of failing on a missing crop | `scripts/ui-review/tests/test_crops.py` |
| The pane addresses the builder emits (including `round` and `child=1`), and the pop-out links | `scripts/ui-review/tests/test_build.py` |
| A live step lays out at declared size, its theme row is labels, zoom and magnifier are off, a pane click does not record a pick | `scripts/ui-review/tests/deck-render.test.mjs` |
| The four failure messages each render their own text, and none renders empty | `test_build.py` + `deck-render.test.mjs` |
| `serve` boots and stops the worktree's workbench, and refuses a foreign server on the port | `scripts/ui-review/tests/test_serve.py` |
| The registry index route mounts with no console error | `scripts/workbench-boot-check.mjs` — extend its `ROUTES` array. **This is the guard that matters most**: it exists because the workbench crashed at boot three times while the unit suite was green. The index route is used rather than a named candidate so the guard cannot rot when a candidate is renamed. |

---

## Consequence for the session-strip review in flight

`feat/session-strip-motion` is built, committed and green, and was reviewed as
four clip steps that Destin found hard to judge. Under the rule agreed here —
pick-one is the default for animation work — that review is re-authored as live
pick-one steps, with **the built behaviour as one named candidate among real
alternatives**, not as the only option with two worse ones invented to surround
it. Alternatives that are genuinely worth having, or the step is a try-this
instead.
