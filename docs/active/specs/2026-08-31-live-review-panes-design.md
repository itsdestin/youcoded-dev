---
status: draft
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

### Pop-out

Every pane carries an **open full-window** link that opens that same candidate,
alone, in a new browser tab at full width. It is more room for the same
candidate, not the candidate embedded in a running app — an authored candidate
does not exist inside the app, so there is no app to put around it. When the
question genuinely needs the whole app, that is the workbench's job and a
separate link.

### One theme at a time

Deck steps can render in six themes. Live steps show **one**, with a theme
switcher on the step that re-points every pane in the row. Four candidates × six
themes is twenty-four running copies of the app on one page.

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

`?mode=workbench&view=live&surface=<id>&candidate=<id>&theme=<slug>`

Renders one candidate from the existing compare registry, in its declared frame
(`canvas` / `panel` / `inset`) at its declared `paneWidth`, with **no workbench
chrome** — no toolbar, no scenario picker. The mock backend boots as it does for
every other workbench route.

- Candidates come from `src/renderer/dev/workbench/compare/registry.tsx`,
  unchanged. A candidate authored for the compare view is usable here and vice
  versa.
- **`theme` must be readable from the address.** Today the active theme lives in
  `localStorage` under `youcoded-theme` (`state/theme-context.tsx:29`), which an
  embedding page cannot set across an origin. The live route reads `?theme=` and
  applies it before first paint, falling back to the stored value when absent.
  This is the only change to theming; nothing else reads the param.

### 2. `youcoded-dev` — the deck renders panes and boots the server

- `deck/spec.py` learns the `live` field and its validation.
- `deck/build.py` renders a live step's panes as sealed windows onto the route
  above, plus the theme switcher and the pop-out links. Answer handling is the
  existing pick-one / yes-no code, untouched.
- `deck/serve.py` boots the workbench for the deck's named worktree before
  serving, the same way `record-pair.sh` already does (one server on
  `5173 + YOUCODED_PORT_OFFSET`, refusing if a foreign tree is already serving
  that port), and stops it on exit. One command still produces a working review.

**Why sealed windows rather than mounting the app's code into the deck page:**
the app's theme styling and the deck's own styling would otherwise be in one
page fighting each other. That is precisely the class of bug that makes a design
look right in the harness and wrong in the app — the failure the compare view's
own header warns about. Isolation is worth more here than self-containment.

### 3. The join between them is a name

Candidates are code in `youcoded`, on the branch under review. The spec naming
them is a file in `youcoded-dev`. Nothing can check that join at spec-validation
time, because one side is TypeScript in another checkout. **Therefore the route
itself must report an unknown name loudly** (see Failure handling).

---

## Spec format

Deck level — one worktree per deck, because every candidate in a review comes
from one build:

```json
{
  "title": "Session strip motion",
  "key": "session-motion",
  "out": "deck.html",
  "images": "images/session-motion",
  "runs": { "today": "images/session-motion/today" },
  "themes": ["midnight", "light"],
  "live": { "worktree": "session-motion" }
}
```

Step level — **pick one**:

```json
{
  "id": "expand-curve",
  "surface": "Session strip",
  "path": "Header",
  "headline": "Which pill expand feels right?",
  "live": { "surface": "session-strip-expand", "height": 96 },
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
  "live": { "surface": "session-strip-drag", "candidate": "as-built", "height": 140 },
  "changed": "The pill itself lifts and follows your cursor…",
  "notice": "No jump when you let go.",
  "risk": "Widths freeze while you drag, so the row cannot repack under the cursor."
}
```

`live.height` is the pane's height in px; the width comes from the surface's
`paneWidth` in the registry, so a dialog-width candidate cannot be squeezed.

### Validation rules

- `live.worktree` is required at deck level as soon as any step carries `live`.
- A step with `live` must NOT carry `crop`, `clip`, `highlight` or `options` —
  "the pane is the picture" (same rule clip steps already have).
- `live` **with** `variants`: each variant needs `id`, `label`, `candidate`,
  `summary`; none may carry `crop`. 2–4 variants.
- `live` **without** `variants`: `live.candidate`, `changed` and `notice` are
  required — it is an approve step.
- Headline word cap and the banned-word list apply unchanged. `surface` and
  `path` are required, as for every step.

---

## Failure handling

Three failures, none of which may render a blank rectangle. Each follows
`docs/error-message-standards.md`: specific and accurate, never a guessed cause.

| Failure | What the pane shows |
|---|---|
| App server not reachable | That the server for this review is not running, and the exact command to start it. This is also the archived-review case. |
| Unknown `surface` or `candidate` | Which name was not found, in which surface, and the names that do exist. The route reports this — the spec cannot. |
| The candidate throws while rendering | The error, in the pane. A crashed variant must never be mistakable for a design choice. |

---

## Non-goals

- **Before/after across two code versions.** Rejected in brainstorming: two
  builds means two servers and a second mechanism. Recordings still cover it.
- **Live steps in every theme at once.** One theme with a switcher.
- **Moving `CompareView` into the deck.** It stays as the workbench's own view;
  the deck reuses its registry, not its harness.
- **Self-contained archives.** Accepted loss, stated above.
- **More than 4 panes.** Each pane boots the app; four is the cap.

---

## Testing

| What | Where |
|---|---|
| `live` validation: required fields, rejected fields, pane-count bounds, which shape a step resolves to | `scripts/ui-review/tests/test_spec.py` |
| The pane addresses the builder emits, the theme switcher's re-pointing, the pop-out links | `scripts/ui-review/tests/test_build.py` |
| The three failure messages each render their own text, and none renders empty | `scripts/ui-review/tests/test_build.py` + `deck-render.test.mjs` |
| `serve` boots and stops the worktree's workbench, and refuses a foreign server on the port | `scripts/ui-review/tests/test_serve.py` |
| The new route mounts with no console error | `scripts/workbench-boot-check.mjs` — extend its `ROUTES` array. **This is the guard that matters most**: it exists because the workbench crashed at boot three times while the unit suite was green. |

---

## Consequence for the session-strip review in flight

`feat/session-strip-motion` is built, committed and green, and was reviewed as
four clip steps that Destin found hard to judge. Under the rule agreed here —
pick-one is the default for animation work — that review is re-authored as live
pick-one steps, with **the built behaviour as one named candidate among real
alternatives**, not as the only option with two worse ones invented to surround
it. Alternatives that are genuinely worth having, or the step is a try-this
instead.
