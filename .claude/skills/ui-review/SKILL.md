---
name: ui-review
description: Autonomous whole-app UI review — screenshot every YouCoded surface in every theme with self-verifying capture, then judge the sheets against the design guide and write numbered findings/proposals. Use when Destin asks to "review the UI", "look at every screen", "find the ugliest surfaces", "check the themes", or before/after a UI change lands. Works without any human clicking.
---

# /ui-review — autonomous UI review

Pictures come from `shoot` and click-throughs from `explore` (`scripts/shoot/README.md`);
decks from `scripts/ui-review/` (README there). This skill is the procedure around them.
Standard: `docs/active/design/2026-08-25-ui-design-guide.md`. Last full review and its
ledger: `docs/active/design/2026-08-25-ui-audit-findings.md`.

## 1. Capture (no judgement yet)

1. A worktree for the branch under review (`node scripts/workspace-start.mjs --session <key> youcoded`).
   Never the main checkout, never the live app.
2. `node scripts/shoot/shoot.mjs --all --themes all --contrast --worktree <worktree>` — every
   named screen in all six themes (~2.5 min), plus a contact sheet per theme and `contrast.md`,
   under `scratch/shoot/<time>/`. Two themes (the default, meadow-mist + halftone-dimension)
   take ~77 s. `--tag <tag>` or names/globs (`settings/*`) for part of the app; `--list` names
   every screen.
3. **Read the summary.** A picture counts only when its screen proved it is showing; every
   miss is listed with its reason, and a `LOOK-ALIKE` pair means two names drew the same
   picture. A missed or look-alike screen is *unreviewed* — fix its opener or mark and re-run
   it, or list it as unreviewed. Do not write a finding about a screen that did not show.
4. What a picture cannot show — hover, drag, menus inside menus, a result after a click, a game
   played out — walk it with `node scripts/shoot/explore.mjs start`, numbered steps, pictures
   per step. The terminal, a live session or real sync need the real app:
   `bash scripts/run-dev.sh <branch>` then `explore start --dev`.

## 2. Judge

- Work from the **contact sheets** (one per theme), then open full-res PNGs
  (`<out>/<screen>/<theme>.png`) for anything you are about to cite. Halftone Dimension and Meadow Mist are the stress themes; a
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
  fidelity gaps (the misses from `shoot`'s summary, verbatim), ranked worst surfaces, same-thing-drawn-N-
  ways table, per-theme contrast, what's good, then a **numbered ledger P-n** Destin
  approves by number (visible change · surfaces touched · what users will notice).
- Copy the contact sheets into `docs/active/design/<date>-ui-audit/` (images
  git-ignored by the existing rule; a README naming the `shoot` command regenerates them).
- Update the design guide only for rules that changed; new rules get the next `G-n`.
- Roadmap entry: the whole-UI review item (in `docs/roadmap/dev-workspace.md` → `## rigs`) gets an update line pointing at the docs.

## 4. Improve (when asked, or as the follow-up)

Work phase by phase (findings §5 groups them). Per phase: worktree, edits, `verify.sh`,
then a **review page** — never a gallery, never a chat summary:

1. Capture both sides: `node scripts/shoot/shoot.mjs <screens> --before <base branch> --after <worktree> --out docs/active/design/<audit>/runs`
   (writes `runs/before` and `runs/after`; each side builds its own checkout on a free port).
   A second variant is a second worktree and its own `--after` run.
2. Write `docs/active/design/<audit>/<phase>-review.json` (copy `phase-c-review-v2.json`): one
   step per point with `surface`, `path`, `crop` (a `shoot` screen name), `highlight` (`"auto"`
   for before/after; one run defaults to the screen's own panel), and the four texts — **headline** (≤ 25 words, what a
   user sees), **changed** (what was edited, plain words, with `measured` when there is a number),
   **notice** (what changes for users — intended and side effects), **risk** (what could look
   wrong, or is not shown faithfully). The builder refuses jargon (token, primitive, selector,
   IPC, prop, reducer, handler, component…), a missing picture, or an unresolved box. **Several designs for one thing are ONE choice step** (`variants: [...]` — one page, pick one; see the README), never a yes/no step per design (`phase-d-mockups.json`). **Anything that has to MOVE — an animation, a drag, a hover — is a LIVE step, not a clip** (`live: {surface, round}` + `variants` with a `candidate` each): panes of the running app Destin can operate himself. Four clip steps were rejected on 2026-08-31 as "just rough to compare"; a 200 ms animation is judged by doing it. `serve` serves the worktree's practice app for the panes itself, under the deck's own `/app/`.
3. `python3 scripts/ui-review/review-cards.py preview <spec>` and READ `preview/contact.png`, then
   `python3 scripts/ui-review/review-cards.py serve <spec>` **in the background** (it builds
   first; fix every `missing:` line it prints — a missing picture is a screen that did not show). It never opens a browser. **The address to give Destin is the `[deck] http://127.0.0.1:<port>/<out>.html` line `serve` prints** (also in `<spec>.serve.json` next to the spec) — quote it whole, in chat, as the last line of your turn; the bare port now redirects to the deck, but never guess a URL you have not read. Destin answers
   Yes / No / Other per step with an optional note and presses Submit; the background command
   exits with the summary (exit 0 = submitted, summary on stdout; 2 = nobody submitted before the
   timeout; 3 = another process already serves this spec — neither 2 nor 3 carries answers, do not
   invent a result) (`wait <spec>` if you lost the process). Never ask him to paste anything.
4. Act on the summary exactly (`Other` + note = change it as described); record decisions in the
   findings ledger row, the guide, the roadmap entry. Merge, archive, clean up.

## Red flags

- A picture that looks like the plain chat window under another name → the screen's mark is in
  the wrong place (`shoot` should have refused it) — fix the mark, never file it.
- "Reads as a crash" on a workbench surface → check for a mock gap (no PTY, no registry,
  `undefined` in copy) before calling it an app bug.
- A count you did not measure ("13 pills", "six primaries") → count on the full-res PNG.
- A proposal whose "problem" has no number and no broken behaviour → it is `judgment`; say so,
  show the baseline neutrally, and expect a no.
- Pictures that show something not on the branch → wrong `--worktree`; `shoot` builds exactly the
  checkout it is given (it says which), so check the flag, not a server.
