---
status: active
date: 2026-09-24
---

# Project skills, plugins and tools — built, accepted, awaiting merge

**State (2026-09-24):** built and accepted; NOT merged. Branch `session/plugin-project-controls` in both
the workspace and `youcoded/`, both pushed. Merge only on Destin's explicit word.

- Decisions: `docs/active/specs/2026-09-23-project-extension-availability-decisions.md` (incl. the
  2026-09-24 combined-review and build-question answers).
- Technical design (three review rounds): `docs/active/specs/2026-09-24-project-plugin-controls-technical-design.md`.
- Build plan T1–T7: `docs/active/plans/2026-09-24-project-plugin-controls-build.md`.
- Contract (27 rows) signed; graded (12 deck rows pass); acceptance submitted all yes —
  `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.contract*.json`.
  `review-cards.py contract-check` reports all three facts ok.
- Reviews and triage: `docs/active/reviews/2026-09-24-project-plugin-controls-*.md`.

Not verified: a real dev/app window (the workbench cannot start new conversations; "Ask assistant to
set it up" and native enforcement are covered by automated tests only). Out of scope, deliberately:
Your Assistant locked switches (Q-1), Android app (B-2), Claude Code sessions, personal-skill sync.
Outside this feature but on the branch: `use-esc-close.tsx` Escape-registration race fix (f56817bc7).

On merge: archive these lifecycle docs, close the roadmap item, remove worktrees/branches per
`docs/workspace-workflows.md`; release notes must say conversations outside any project now get no
automatic skills or tools (decision B-1).
