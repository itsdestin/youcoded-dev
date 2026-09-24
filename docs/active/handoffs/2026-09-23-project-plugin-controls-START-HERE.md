---
status: active
date: 2026-09-24
---

# Project skills, plugins and tools — built, accepted, NOT merged; Destin's UI review next

**Where:** branch `session/plugin-project-controls` in the workspace and in `youcoded/`, both pushed,
each with an open DRAFT pull request marked do-not-merge (itsdestin/youcoded#571,
itsdestin/youcoded-dev#203). Resume with
`node scripts/workspace-start.mjs --session plugin-project-controls youcoded`. Merge only on
Destin's explicit word.

## What Destin asked for next (2026-09-24)

"i think i still want to review this ui further before we finalize … i will resume in a future
session with a review of all new ui before additional refinements." So the next session starts
with a **review of every new screen**, then refinements. It is not a merge session.

New screens and states to put in front of him (the workbench renders all of them from
`desktop/src/renderer/dev/workbench/fixtures/project-extensions.ts`; capture plans are
`scripts/ui-review/plans/project-plugin-*.json`, all verified 2026-09-24):
1. Projects → a project → **Skills & tools** tab: built-in group, installed plugin with parts,
   personal skills, needs-setup rows; desktop and 390 px phone.
2. The **risk popup** ("Turn on X?") when a change turns on a tool connection.
3. The **Set up here** popup (personal skill: Ask assistant / Choose skill file; tool connection:
   Ask assistant).
4. The **command drawer** chips (Automatic / Manual use / Unavailable), the dimmed Needs-setup
   cards, the "Project settings changed" line, and red-card navigation to the exact row.
5. **Marketplace post-install "Set up <plugin>"** from both the detail page and a grid card;
   desktop and phone.
Show them as a review deck (Before = master, After = branch). A real dev window (`run-dev.sh`)
would let him try real conversations, but it shares `~/.youcoded` and `~/YouCoded` with his
live app: it records this build's `featureFirstRunAt` early (plugins installed between then
and his real upgrade would start off) and seeds project records into his synced Personal
space. He declined it once (2026-09-24); ask again before starting one.

## Authority and record

- Decisions: `docs/active/specs/2026-09-23-project-extension-availability-decisions.md`.
- Technical design: `docs/active/specs/2026-09-24-project-plugin-controls-technical-design.md`.
- Build plan T1–T7: `docs/active/plans/2026-09-24-project-plugin-controls-build.md`.
- Contract (27 rows): signed, graded (12 deck rows pass), acceptance submitted all yes —
  `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.contract*.json`.
  A UI change after his review that contradicts an approved screen reopens it through a
  question deck (feature-flow rule), and the contract's affected rows must be re-graded.
- Reviews: `docs/active/reviews/2026-09-24-project-plugin-controls-*.md` (per-task, design ×3,
  code, UX ×2, final independent review — all triaged).

## Facts a new session needs

- Rule for new downloads: a marketplace plugin with no explicit project choice is off only if it
  was installed after this build first ran on that device (`featureFirstRunAt`,
  `~/.youcoded/project-extensions-feature.local.json`); everything older stays on.
- Conversations outside every project — including the "No folder" choice on the new-session
  form — get no automatic skills or tools (decision B-1). Release notes must say so.
- Not verified in a real app window: native enforcement and "Ask assistant to set it up" are
  covered by automated tests only; the workbench cannot start new conversations (same on master).
- Outside this feature but on the branch: master's Escape-registration fix for `use-esc-close.tsx`
  (kept during the 2026-09-24 merge of origin/master).
- Deferred, filed: Your Assistant locked switches (roadmap native-harness → skills-mcp); Android
  tab note (Android audit appendix); a pre-existing React warning on new conversations
  (roadmap user-interface).

On merge: archive these lifecycle docs, close the roadmap item with `roadmap-check --close`,
remove worktrees/branches per `docs/workspace-workflows.md`.
