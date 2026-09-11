---
status: active
date: 2026-09-09
handoff-for: error-states-development session
---

# Error states, reporting, contribution setup — handoff

**Read this first, then:** `docs/MAP.md` (relevant: Settings/Development, sync/spaces, IPC bridge,
remote server), `docs/error-message-standards.md`,
`docs/active/investigations/2026-09-08-error-states-development-audit.md` (the audit),
`docs/active/design/2026-09-08-error-states-development/` (questions `.answers.json`,
`ui-design-ledger.md`, `error-states.review*.json`),
`docs/active/reviews/2026-09-09-error-states-development-ux-review-1.md` and `-1b.md`
(UX tester runs), `.claude/rules/feature-flow.md` (question → mockup → deck → contract → build →
reviewer/tester → grader), `.claude/rules/review-deck.md` + `scripts/ui-review/deck/AUTHORING.md`
(deck authoring, crops, serve), `.claude/rules/react-renderer.md` + `.claude/rules/ipc-bridge.md`
(shared UI invariants), and `docs/PITFALLS.md`.

## Goal (from Destin, 2026-09-08)

1. Review **ALL error states** across all screens/chats/settings/menus; make them consistent,
   user-friendly, actionable. Retry when recoverable; Report bug when app-side; GitHub issue in
   `itsdestin/youcoded` with logs/images where possible. Existing roadmap item:
   `docs/roadmap/user-interface.md` line 35, "Error messages still guess at causes in many
   places" (there is no "UI-change 33" — an earlier draft of this handoff cited a number the
   file does not use). It stays OPEN: nothing here is implemented. Also
   `docs/active/investigations/2026-09-01-misleading-error-audit.md`).
2. Improve **Settings → Development**: make “Contribute to YouCoded” install the workspace as a
   **youcoded-managed/synced project**, and add an **(i) explainer** walking through development
   flows even for non-developers.
3. Improve the **bug report / feature request UI/usefulness** (other errors link into it).
4. If possible, get an **always-updated copy of ROADMAP pinned at the top of the GitHub Issues
   page**.

## State summary

**UI-only design work is complete and being reviewed; nothing has shipped or been implemented.**

- Audit evidence: source-level, backend/Android review partially completed, capture evidence with a
  current synthetic error plan. **No app-wide implementation yet.** See audit doc and its “Next
  gates”.
- Design scope (approved in questions and clarifications, committed in
  `error-states.questions.answers.json` / `error-states.workspace-questions.answers.json`):
  - Full scope accepted.
  - Minimal report evidence: error details/version selected; logs opt-in; **AI optional** and
    reviewed before transmission.
  - Attachments finished by user in GitHub browser flow (GitHub uploads on attach, before submit).
  - Contribution walks through conversation → design → checks → explicit public proposal.
    **Private backup is not publishing.**
  - Existing workspaces left untouched; local-only contribution work allowed with honest warning.
  - Roadmap: pin a canonical link (no mirrored issue). **No pin has been created.**
- First review deck submitted (`error-states.review.json` → answers): S1,S2,S3,S5,S7 yes;
  S4,S6 other (layout critique).
- Second review (`error-states.review-2.json` → answers): R2-8, R2-10, R2-12, R2-13 yes; R2-9 other
  (delete gray warning, remove “Workspace details,” name button **“Set up development workspace”**);
  R2-11 other (evidence layout still cluttered); R2-14 other (confused); R2-15 **no** (links must
  never be unavailable).
- **Round-2 feedback is applied** (revisions 16–19, ledger “Revision — 2026-09-09, second round”),
  and the **third deck is built but not answered** (`error-states.review-3.json` / `.html`, four
  approve steps). R2-14 remains an open question — the answer recorded confusion about the slide,
  not a direction.

## Critical process requirement

**Never Read a `contact.png` (giant sheet) or any prior worker/agent transcript containing
oversized images** — this repeatedly crashed workers with
“requires 49868 patches… exceeding the limit of 30000.” Always inspect images as individual
bounded PNGs ≤1280×900 (a mounted/worksheet montage is fine only if bounded ≤1600×1200 px and not
a deck contact sheet). This same failure killed two specialist sessions in this work.

## Where things stand (files and evidence)

- Isolated session workspace (resume with workspace-start, same key):
  `worktrees/sessions/error-states-development`
- Desktop worktree: `worktrees/sessions/error-states-development/youcoded`
- Investigation: `docs/active/investigations/2026-09-08-error-states-development-audit.md`
- Design ledger (rev numbers 1–23, all approved): `docs/active/design/2026-09-08-error-states-development/ui-design-ledger.md`
- Second deck: `error-states.review-2.json` + `error-states.review-2.answers.json`.
- Third deck: `error-states.review-3.json` / `.html` + `.answers.json` (submitted).
  Sources `scratch/error-r3-before/` and `scratch/error-r4-after/`.
- Fourth deck: `error-states.review-4.json` / `.html` + `.answers.json` — **all four yes**.
  Before = `scratch/error-r4-after/` (what he saw
  last round), after = `scratch/error-r5-after/` + `scratch/error-r5-narrow/`, assembled into
  `scratch/error-r5-deck/`; bounded previews in `scratch/error-r5-preview/`.
- Screens taken: `scratch/error-audit-current/` (10 synthetic states; 8 covered, 2 known gaps),
  `scratch/error-design-after-fixed/`, `scratch/error-design-narrow/`, `scratch/error-design-scroll/`,
  `scratch/error-revision-*` (matched Before/After 1440×900), `scratch/error-review2-preview/`.
- Running workbench: **verified 2026-09-09 14:30 — Vite 5557 only**, pid confirmed against this
  worktree’s `desktop` by `readlink -f /proc/<pid>/cwd`. 5558 is gone.
  **Other sessions own 5343, 5513 and 5528** (5528 is another session’s *deck server*, not a dead
  one — an earlier draft of this handoff said it had expired). Never signal another session’s
  process, and derive any pid from the port inside the kill command itself.
  Verify with `ss -ltnp` + `readlink -f /proc/<pid>/cwd` before using anything; if the workbench is
  absent, launch your own with a shifted offset (e.g. `YOUCODED_PORT_OFFSET=386`).
  Capture plans hardcode `127.0.0.1:5233` in `base`; **`WB_PORT=<port>` rewrites it** —
  `WB_PORT=5557 CDP_PORT=18471 node scripts/ui-review/shot.mjs <plan> <out> midnight`. Do not
  copy the plan to change the port (this handoff said to, wrongly; `scratch/error-r4-*.json`
  and `error-r5-*` are those needless copies).

## What is uncommitted

Stage explicit paths; **never** worktree-wide. Full inventory (`git status --short` in both repos):

- Workspace, untracked: `docs/active/design/2026-09-08-error-states-development/`,
  `docs/active/investigations/2026-09-08-error-states-development-audit.md`,
  `docs/active/reviews/2026-09-09-error-states-development-ux-review-1.md` and `-1b.md`,
  this handoff, `scripts/ui-review/plans/error-audit-current.json`
- App, modified: `desktop/src/renderer/components/development/BugReportPopup.tsx`,
  `ContributePopup.tsx`, `DevelopmentPopup.tsx` — each routes to a design component behind
  `?mode=workbench` and leaves the legacy screen untouched
- App, **untracked and easy to miss** (four files an earlier draft of this handoff omitted):
  `ContributionDesign.tsx`, `ContributionWalkthrough.tsx`, `ReportDesign.tsx`,
  `DevelopmentDesign.test.tsx`
- No commits at all on either branch (`git log origin/master..HEAD` is empty in both).

## Next steps (in order)

> **Superseded for the build.** Destin chose to build this out on 2026-09-09. The ordered plan
> is `docs/active/plans/2026-09-09-error-states-development-build.md` — start there. The list
> below is kept as the record of how the design stage ran.


1. **If the new session is not the parent**: read the four docs above; verify state —
   `git status --short`, `ss -ltnp` for workbenches, `git -C youcoded diff --check`.
2. ~~Apply round-2 feedback~~ **done** — revisions 16–19, ledger “Revision — 2026-09-09, second
   round”. Focused tests 19/19; `bash scripts/verify.sh ./youcoded` all green.
3. ~~Build the third deck~~ **done and self-reviewed** — `error-states.review-3.json`, four approve
   steps, previews inspected as bounded pages. **Waiting on Destin’s answers.**
4. **Read `error-states.review-3.answers.json` when it appears** and triage R3-16…R3-19. R2-14 is
   still unanswered and needs re-asking in whatever round comes next.
5. **Fresh UX tester** (`ux-tester.md`, context-free, `tester-kit.md`) — not run against rounds 2
   or 3. Destin was reviewing drafts live on 2026-09-09, and per his standing instruction the
   fresh-eyes pass is skipped while he is watching; run it before the *implementation* deck.
6. **Contract deck** (`contract-agent.md`) once Destin approves the designs; serve it; run
   `contract-check`. Only after that, build stage: real backend for reporting/managed project,
   per `.claude/rules/feature-flow.md`.
7. **Implementation (backend, not started)** will need: report draft persistence; originating
   error handoff into the report; opt-in logs/AI with review; GitHub text submission (existing
   `dev:submit-issue`-family in `dev-tools.ts`/`ipc-handlers.ts`) kept separate from browser
   attachments; contribution workspace as managed project per sync-spaces rules, leaving existing
   folders intact; roadmap pin on GitHub via pinned issue (a small, separate change).
8. **App-wide error migration**: implement per-surface, per-classification (recoverable /
   user-resolvable / app-side / uncertain-mutation / intentional-degradation), starting with the
   confirmed high-risk findings; add rejection/result-shape tests; re-run UI review after each
   surface group.

## Decisions already guaranteed

- Contribution setup: **Set up development workspace**, existing folders untouched, local-only
  allowed with honest warning, private backup distinct from publishing.
- Report: **Submit a ticket**, Bug/Feature tabs, editable title/description, optional error
  details + logs, logs/AI reviewed before transmission, browser-finished attachments.
- Roadmap: canonical link pinned (not mirrored body).
- Walkthrough inside Contribute, warning removed, links never unavailable.
- One noun for the ticket everywhere: Review ticket / Review your ticket / Submit public ticket
  (revision 19, offered on the third deck as a correction he can reject).
- Ticket draft screen content and hierarchy: **approved** (R3-18 yes).
- **No prototype captions on any design screen, ever** (R3-16/R3-19). The workbench must look
  like the real app; dialog actions use the app's own full-width `w-full py-2.5` treatment.

## Key audit findings (all source-verified, no runtime test yet)

Use the audit doc as canonical; this list is the executive summary.

- E-01/E-02/E-03: report loses originating error; report Continue/Submit lack catch/explanation/
  retry; logs go to Claude before user review.
- E-04: redaction is narrow (home path + GH/Anthropic tokens) — not comprehensive sanitization.
- E-05: no attachment payload in current report flow.
- E-07: browser fallback can truncate issue text; keep local draft/export + disclose.
- E-08/E-09: contribute failure offers Done; existing install updates a fixed working checkout —
  must not adopt/move/update an in-use workspace.
- E-11: uninstall/update errors labelled as install failures (`InstallingFooterStrip.tsx:55`).
- E-12: backup Retry can display “Uploaded!” after failed push (`SyncPanel.tsx:655–656` ignores
  result).
- E-13: failed edit-start refresh can bypass modification-time conflict check
  (`ActiveArtifactView.tsx:300–301,324–325`).
- E-14: reporting flow unavailable over remote server (no `dev:*` handlers in remote-server.ts).
- Backend/Android: timeouts can leave queued mutations that execute after reconnect
  (remote-shim), provider upsert/remove/set-key exceptions resolve rather than reject, Android
  service-start outside error state, `BindException` labeled only “port in use,” no
  render-process-gone recovery, no Android WebView failure handler. Full list: audit doc.
- Worker: mixed error shapes (HTTPException vs JSON 500 `onError`) not a defect; Android parser
  loses some server detail; reuse `extractMessage()`.
- Two capture-gap findings (report summary/submit rejection) remain—form shows no error;
  corroborates E-02.
- Stale claims in Sep 1 audit: `ipc-error.ts` helper now exists and is adopted in four places;
  `FieldError` is adopted; `RatingSubmitModal` no longer exists (only stale comments).

## Verification recipes (from this session)

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/error-states-development
git diff --check && git -C youcoded diff --check
# focused:
(cd youcoded/desktop && npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx tests/development-popup.test.tsx)
# full desktop:
bash scripts/verify.sh ./youcoded
# deck build/preview (bounded previews only):
python3 scripts/ui-review/review-cards.py preview docs/active/design/2026-09-08-error-states-development/error-states.review-2.json --sizes 1280x800 --themes midnight --out scratch/error-review2-preview
# serve (last deck server on :5528 expired and is gone):
python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-09-08-error-states-development/<deck>.json --port 5528 --timeout 180
# capture a current error-state surface (synthetic injection plan lives in scripts/ui-review/plans/):
UI_REVIEW_PLANS=error-audit-current YOUCODED_PORT_OFFSET=790 UI_REVIEW_JOBS=8 \
  bash scripts/ui-review/run-review.sh ./youcoded scratch/error-audit-current
```

## Explicitly out of scope until Destin approves

- Creating the GitHub pinned roadmap issue (tiny; do later with explicit approval).
- Moving/modifying any owned workspace or cloned repo; remote private/public publication.
- Backend reporting/installation implementation, subscription/live config changes, shipping.
- Any live-app interaction (`.claude/rules/live-app-safety.md`).

## Ending a session

Run the workspace wrap-up skill; do not assume merges or pushes. This handoff is not merge
permission, and the branch has uncommitted design work that needs Destin’s deck decisions before
implementation.