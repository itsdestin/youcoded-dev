---
status: active
---

# Session launch / resume UX — open items

**Date:** 2026-07-31
**Branch:** `feat/session-launch-ux` — worktree `youcoded-dev/worktrees/session-ux`, 17 commits ahead of master, **unmerged and unpushed**.
**Why this doc:** work paused mid-iteration to build the workbench comparison view. This is the ledger of what is done, what is still open, and what has been deliberately left alone — so the thread survives the pause.

---

## Done and verified

Every commit below passes `scripts/verify.sh` (types, related tests, knip, ast-grep) and the workbench boot check.

**Model selection — complete.** One `ModelPicker` replaces the Runtime toggle, the provider/model `Select` pair and the Claude alias rows across all four surfaces (SessionStrip, welcome form, Resume Browser row, pre-resume modal). `NativeModelSelect.tsx` and `RuntimeBindingFields` are deleted — **the Runtime toggle no longer exists anywhere in the app**. Users pick a model; the runtime follows.

**Resume Browser.** Expandable cards on `bg-inset`; the expanded pane is launch-only; tags + note live in an in-card sheet behind a mirrored tag icon; Complete is a one-click check on the card; Priority is a built-in, undeletable tag; timestamp bottom-right; folder + model + size on one dotted trail; runtime badges gone; resume pane and tag sheet mutually exclusive.

**Tags.** `TagPicker` is apply-only; the new `TagManagerPopup` owns rename/recolor/archive/delete, reachable from all four picker hosts and the Tags filter.

**Close prompt + status-bar chip.** Rebuilt to the same vocabulary: Priority is a built-in tag in both, Complete is a toggle at the bottom of the close prompt, and the tag/note editor is collapsed behind a summary. `session.getMeta` now returns reserved flags; the close prompt's `onConfirm` contract became a **delta** so un-toggling a preloaded Priority clears it.

**Backend.** Claude Code sessions record their model two ways — a transcript tail read at browse time (existing history, zero added IO) and a deduped store write on `assistant-text` (rows synced from other devices).

**Guard tests added:** `resume-browser-organize.test.tsx` (7), `close-session-prompt.test.tsx` (5), four in `session-browser.test.ts`, plus the existing `resume-browser-native-picker.test.tsx` (4).

---

## Open

1. **Final review of every changed surface.** Nothing on this branch has had a full visual pass. Changed surfaces: Resume Browser (cards, filters, tag sheet, tag manager), SessionStrip new-session form, welcome form, pre-resume modal, close prompt, StatusBar tags chip. Destin's call, not scriptable.

2. **Close-session menu — more work wanted.** Round 1 of the comparison view (`?mode=workbench&view=compare`) is seeded with three treatments of its body. Pick one and ask for round 2.

3. **Resume Browser load time.** Diagnosed, not fixed — 948ms to open at ~1,642 rows, 278ms per keystroke, because the list is not windowed. File IO is ruled out at 0.06s. Own handoff: `2026-07-31-resume-browser-load-time-handoff.md`. Start from THIS branch; the row markup was rewritten here.

4. **Model favourites are localStorage-only.** They are now the picker's default view, so a fresh device opens it empty. A real synced channel is the backend to-do.

5. **Android shows no model chip and no tags.** `SessionBrowser.PastSession` there is a thin mirror with no Conversation Store behind it. Pre-existing divergence, not introduced here, not roadmapped yet.

6. **Pre-existing anchor drift**, unrelated to this work but flagged on every `/audit`: nine `native-runtime.md` anchors and three MAP paths point at `harness/mcp/*` files absent from the checkout; six rule files exceed the 600-word budget.

---

## Deliberately left alone

- **`CloseSessionPrompt` does not preload `complete` as "already complete"** — it does now read it, but the dialog still reads as a fresh decision each close. If that ever feels wrong, the preload is one line.
- **The status-bar chip does not offer Complete.** A session you are sitting in is not finished; the close prompt owns that decision.
- **`useScrollFade`, grouped-mode headers and per-keystroke filtering** were all left as-is — they are constraints on the windowing work, documented in the perf handoff rather than pre-emptively changed.

---

## Conventions in play

- Never touch the live app; all runtime checks go through `run-workbench.sh` / `run-dev.sh` (`.claude/rules/live-app-safety.md`).
- `bash scripts/verify.sh worktrees/session-ux` and `node scripts/workbench-boot-check.mjs` (8 routes) before claiming anything is done.
- Design alternatives now go through the comparison view's registry, **not** through `utils/design-variant.ts` — that file was added and deleted three times and should stay deleted.
