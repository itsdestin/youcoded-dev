---
name: ui-review
description: Autonomous whole-app UI review — screenshot every YouCoded surface in every theme with self-verifying capture, then judge the sheets against the design guide and write numbered findings/proposals. Use when Destin asks to "review the UI", "look at every screen", "find the ugliest surfaces", "check the themes", or before/after a UI change lands. Works without any human clicking.
---

# /ui-review — autonomous UI review

The rig is `scripts/ui-review/` (README there). This skill is the procedure around it.
Standard: `docs/active/design/2026-08-25-ui-design-guide.md`. Last full review and its
ledger: `docs/active/design/2026-08-25-ui-audit-findings.md`.

## 1. Capture (no judgement yet)

1. `bash setup.sh`, then a worktree for the branch under review (`cp -al` its
   `node_modules`). Never the main checkout, never the live app.
2. `bash scripts/ui-review/run-review.sh <worktree>` — ~5 min. It boots the
   workbench, runs every plan × 6 themes, verifies each shot, builds sheets, `coverage.md`,
   `contrast.md`, `gallery.html` under `scratch/ui-review-<date>/`.
3. **Read the first log line** — it must say `workbench :<port> serves <your worktree>/desktop`;
   the rig aborts otherwise. Then **read `coverage.md`.** Every `MISSED`/`partial` row is either a selector to fix
   (add a `dump` action, find the control, add an `expect`, re-run that one plan) or a
   genuine gap to list as *unreviewed*. Do not write a finding about a surface that is not
   `covered`. Do not stop at "one dev-instance session away" — fix the selector.
4. If the change touches the terminal, marketplace data, sync or a live session, run the
   Electron pass from the README as well (`electron-welcome`, `electron-live-session`).

## 2. Judge

- Work from the **sheets** (all themes side by side), then open full-res PNGs for anything
  you are about to cite. Halftone Dimension and Meadow Mist are the stress themes; a
  surface that survives them survives.
- For scale, fan out: one reviewer agent per family (settings, chat/composer/status bar,
  screens/drawers, tool cards/states/narrow), each told the exact file paths and asked for
  ranked findings citing files. Then verify their top claims yourself before repeating them
  — reviewers have called mock data an app bug and a missing PTY a crash.
- Use `contrast.md` for numbers, not conclusions: it over-reports on glass and on
  sliding-indicator tabs. Cite a ratio only after looking at the pixel.
- Separate three buckets every time: **app bug** (hardcoded colour, wrong primitive),
  **token/guide gap** (the rule doesn't exist yet), **theme-pack problem** (the pack
  violates a guarantee). Different owners, different fixes.

## 3. Write

- Findings doc under `docs/active/design/<date>-ui-audit-findings.md`: how captured +
  fidelity gaps (from `coverage.md`, verbatim), ranked worst surfaces, same-thing-drawn-N-
  ways table, per-theme contrast, what's good, then a **numbered ledger P-n** Destin
  approves by number (visible change · surfaces touched · what users will notice).
- Copy the gallery + sheets into `docs/active/design/<date>-ui-audit/` (images
  git-ignored by the existing rule; README says how to regenerate).
- Update the design guide only for rules that changed; new rules get the next `G-n`.
- ROADMAP entry: the whole-UI review item gets an update line pointing at the docs.

## 4. Improve (when asked, or as the follow-up)

Work phase by phase (findings §5 groups them). Per phase: worktree, edits, `verify.sh`,
then a **review page** — never a gallery, never a chat summary:

1. Capture the branch: `bash scripts/ui-review/run-review.sh <worktree> scratch/<phase>`
   (it starts its own server on Vite 5473 and refuses if that port serves another worktree).
   For a second variant, a second worktree + run dir.
2. Write `docs/active/design/<audit>/<phase>-review.json` (copy `phase-c-review-v2.json`): one
   step per point with `surface`, `path`, `crop`, `highlight` (`"auto"` for before/after, else
   `{"selector": …}` measured by the rig), and the four texts — **headline** (≤ 25 words, what a
   user sees), **changed** (what was edited, plain words, with `measured` when there is a number),
   **notice** (what changes for users — intended and side effects), **risk** (what could look
   wrong, or is not shown faithfully). The builder refuses jargon (token, primitive, selector,
   IPC, prop, reducer, handler, component…), a missing picture, or an unresolved box.
3. `python3 scripts/ui-review/review-cards.py serve <spec>` **in the background** (it builds
   first; fix every `missing:` line it prints — a measurement that is missing means the plan
   needed a `measure` line before the Before run). The browser opens itself. **The address to give Destin is the `[deck] http://127.0.0.1:<port>/<out>.html` line `serve` prints** (also in `<spec>.serve.json` next to the spec) — quote it whole; the bare port now redirects to the deck, but never guess a URL you have not read. Destin answers
   Yes / No / Other per step with an optional note and presses Submit; the background command
   exits with the summary (exit 0 = submitted, summary on stdout; 2 = nobody submitted before the
   timeout; 3 = another process already serves this spec — neither 2 nor 3 carries answers, do not
   invent a result) (`wait <spec>` if you lost the process). Never ask him to paste anything.
4. Act on the summary exactly (`Other` + note = change it as described); record decisions in the
   findings ledger row, the guide, the ROADMAP entry. Merge, archive, clean up.

## Red flags

- A sheet that looks like the plain chat window under another name → the capture missed;
  the rig should have caught it — check `coverage.md`, fix the plan, never file it.
- "Reads as a crash" on a workbench surface → check for a mock gap (no PTY, no registry,
  `undefined` in copy) before calling it an app bug.
- A count you did not measure ("13 pills", "six primaries") → count on the full-res PNG.
- A proposal whose "problem" has no number and no broken behaviour → it is `judgment`; say so,
  show the baseline neutrally, and expect a no.
- A sweep whose shots show something not on the branch (a card, a feature) → wrong server;
  the ownership check exists because this happened for 40 minutes on 2026-08-25.
