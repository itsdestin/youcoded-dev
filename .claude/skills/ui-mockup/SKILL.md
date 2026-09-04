---
name: ui-mockup
description: Design and review YouCoded UI changes in the UI Workbench — the real renderer running against a fake backend. Use whenever Destin wants to see, iterate on, or approve UI/UX changes visually — "mock this up", "show me how X would look", "before/after of Y", "let me see it in the app's themes", or any design decision that needs his visual sign-off. Also use when building a new feature's UI before its backend exists.
---

# YouCoded UI Design Workflow

Process established with Destin during the 2026-07-16 UI-consistency sessions (7 rounds, 40
approved changes — see `docs/archive/specs/2026-07-16-ui-consistency-design-spec.md` for the
output format it produced). That process still holds. What changed on 2026-07-29 is **where the
rendering happens**.

## Before drawing anything: the questions deck

Step 2 of the feature flow (`docs/active/specs/2026-09-01-feature-flow-design.md` §5) is a
deck, not a chat. Write `docs/active/design/<date>-<feature>/<feature>.questions.json` — one
`"words": true` step per question, one to three options (the recommended one first, its why in
`summary`), no picture — and `serve` it in the background. Do not ask what the design guide or
the code already answers; do not ask what has an obvious answer (state it, the review deck
will show it). Draw only after it is submitted: its answers are the first source of the
contract.

**Hand Destin the `[deck] http://127.0.0.1:…` line from `serve`, never the `.html` path**, while
the server runs. The app opens a pasted path as a plain file, where Submit has no server and the
page falls back to a copy box; on 2026-09-04 that paste came back as one flattened line and the
deck read as "not submitted". If it happens anyway: `review-cards.py record <spec> '<paste>'`
writes the submitted answers file from the paste (both line-per-step and flattened forms).

## The mechanism: edit the real components

`bash scripts/run-workbench.sh` boots the **real renderer** in a browser tab at
`http://localhost:5233/?mode=workbench` — Vite only, no Electron, no PTY, no main process —
against a fake `window.claude`. You edit the actual component files; Vite HMR repaints in about
a second.

**There is no mockup to translate back into the app.** Fidelity is not a discipline problem any
more: same components, same `globals.css`, same theme engine, same primitives. Do not hand-write
HTML that imitates the app, do not re-declare Tailwind utilities, do not re-type token values.
If you catch yourself copying a class string somewhere to render it, stop — edit the component.

Use `run-dev.sh` instead only when the work needs real event ordering, a PTY, or main-process
behaviour.

### Controls (toolbar, above the app)

- **View** — `app`, or the `tool gallery` (every tool fixture as a real `<ToolCard>`; replaced
  the old `?mode=tool-sandbox`).
- **Scenario** — `default` · `empty` · `no-providers` · `refused` · `stress`. Reloads.
- **Latency** — `instant` / `150ms` / `2s` of fake IPC delay. Applies immediately.
- **Narrow (640px)** — hosts the app in a 390px iframe so `useNarrowViewport()` sees a real
  narrow viewport.
- **Themes** — use the app's own Settings → Appearance. It is the real control.

### Building UI before its backend exists

This is the workbench's main purpose, not a side effect. A channel the design needs but no
backend serves goes in `mock-shim.ts`'s `MOCK_ONLY` registry with the feature it belongs to.
`tests/workbench-mock-contract.test.ts` then enforces that every hand-written channel either
mirrors a real one in `preload.ts`/`remote-shim.ts` or is registered as unbuilt — so a fake can
never quietly ship as real, and the registry becomes the backend to-do list once a design is
approved.

## Review discipline (unchanged, and load-bearing)

- **Number every visible change** (`1`, `2`, …) with a one-line what/why plus the rule it locks
  in; end with a **change-ledger table**. Destin approves or rejects **by number** ("approve all
  except 4"). **Never renumber an approved change** — new feedback gets new numbers.
- **Before/after on real app surfaces**, not abstract component grids. He explicitly
  course-corrected toward this: he wants to see how actual menus and pages change under a
  proposal. In the workbench, "before" is the current component on `master` and "after" is your
  edit — so show him the surface, and say what to look at.
- **Halftone Dimension is the standard stress theme.** 2–3× radii, hot-pink accent, glass
  popups, `custom_css`, patterned background. If a change survives it, it survives.
- **Review under `stress` and `empty`, not just `default`, and at non-zero latency.** A surface
  only ever seen at instant-resolve has never shown its loading states; a surface only seen on
  five tidy rows has never been tested.
- **A new scrolling surface must be reviewed at a window height where it actually overflows.**
  The fixtures are small (the Files tab has 9 rows in `default` AND in `stress`, measured
  2026-09-03), so at a 900px capture height nothing scrolls and the whole overflow path goes
  unseen. The grid/list switch shipped to Destin's dev instance with three separate scroll
  defects — items past the fold clipped with no scrollbar, then the bar in the gutter outside
  the container, then the thumb crossing the rounded corners — none of which any 1440x900
  screenshot could have shown. Shrink the height until it overflows, and scroll to both ends. This is the workbench's one real gap: appearance is
  guaranteed identical, behaviour under real data is not.
- **Explicit fidelity notes — never let an approximation pass silently.** Community themes
  render in full, artwork included (two ship by default: Halftone Dimension and Meadow Mist).
  If you hit something the workbench genuinely cannot reproduce, say so in the review rather
  than letting Destin wonder whether it is the design or the harness.
- **On ambiguous feedback ("make them more consistent"), prefer the smallest literal reading and
  ask.** Over-extrapolating cost a full rework in the original session.
- When he picks among options (A/B/C), keep the rejected ones described in the ledger marked
  "decision: X" so the reasoning survives.

## Verification is Destin's

Per the workspace rule, do **not** script interactive verification. One-shot screenshots for
your own layout self-checks are fine; the interactive pass — hover, drag, timing, "does this
feel right" — is his, and he can usually eyeball it in 30 seconds. Tell him what to click.

## After approval

Decisions must not live only in chat — and the deck answers ARE the record (they are committed):

1. **Write the contract.** Dispatch a fresh agent with `scripts/ui-review/contract-agent.md`,
   the questions deck, every round's spec and answers, and the branch name. Serve
   `<feature>.contract.json`; it is the last thing Destin answers before the build. Run
   `review-cards.py contract-check` on it and paste the output into the handoff.
2. Turn the `MOCK_ONLY` entries the approved UI depends on into real handlers (main +
   `preload.ts` + `remote-shim.ts` + `SessionService.kt`, guarded by `ipc-channels.test.ts`),
   then drop them from the registry.
3. **Run the build stage** (design §8): a short technical design (backend, data shape, reuse)
   → adversarial review, one findings file per round under `docs/active/reviews/`, stop on a
   round with nothing accepted, cap three → task breakdown, descriptions by default and
   pre-written code only for cross-repo / stored-data / strict-order work → subagent-driven
   build with a reviewer per task. Destin is not in this stage; a contradiction with the
   approved UI is a reopen deck, never a silent change.
4. File a roadmap entry for every *fix later* note the contract agent listed (`docs/roadmap/<area>.md`
   — `ROADMAP.md` → "Filing an item"), and follow the workspace knowledge rules (pinning test >
   ast-grep rule > WHY comment > path-scoped rule) for anything durable.
5. At the end: write `<feature>.contract.verdicts.json` beside the contract, run
   `review-cards.py acceptance`, serve the acceptance deck; `bash scripts/close-out.sh <branch>`
   reports whether the contract holds, was signed, and was accepted.

Merging cannot shift appearance, because nothing was ever copied.
