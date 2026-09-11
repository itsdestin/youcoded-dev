---
status: active
date: 2026-09-09
supersedes-next-steps-in: docs/active/handoffs/2026-09-09-error-states-development-HANDOFF.md
---

# Error states, reporting and contribution — the build plan

**Read this first, then the handoff** (`docs/active/handoffs/2026-09-09-error-states-development-HANDOFF.md`)
for evidence locations, and the audit
(`docs/active/investigations/2026-09-08-error-states-development-audit.md`) for every finding
cited by ID below. The design record with Destin's own words per decision is
`docs/active/design/2026-09-08-error-states-development/ui-design-ledger.md`.

## UNIT A SHIPPED — 2026-09-11

Merged to master. The Development screens are real for every user: the ticket flow
carries the error that opened it, shows every piece of evidence before it leaves the
machine, works with no AI, reports three honest submission outcomes, and keeps the draft
through a failure; setup creates a managed workspace that never touches an existing
folder and survives the dialog closing. `<ErrorState>` was widened first, so retry and
report are independent — **unit B migrates onto that.**

Records that survive: `docs/archive/design/2026-09-08-error-states-development/` (the
ledger, every deck and answer, the signed contract and its verdicts), and the three
acceptance reviews in `docs/archive/reviews/`.

**Units B and C have not started.** Everything below from "Step 3" is the remaining work,
and the audit it cites is still in `docs/active/investigations/`.

Two decisions from unit A that bind unit B:
- The **assistant is named by `utils/assistant-name.ts`**, never spelled in a string.
  Product names ("Claude Code", "Claude Pro/Max", the account) stay.
- A screen must not branch on `?mode=workbench` — `scripts/ast-grep/rules/
  no-workbench-gate-in-shipped-ui.yml` fails the build. Design UI ahead of its backend by
  registering the CHANNEL in `mock-only.ts`, so there is only ever one screen.

## Where this stood at the start (2026-09-09)

Session key `error-states-development`; workspace
`worktrees/sessions/error-states-development`; branch `session/error-states-development` in
both `youcoded-dev` and `youcoded`, **both pushed, neither merged**.

**Done:** the UI design stage for the Development screens. Four review decks, changes 1–23,
all approved or superseded. The screens render only behind `?mode=workbench`
(`ContributionDesign.tsx`, `ContributionWalkthrough.tsx`, `ReportDesign.tsx`, pinned by
`DevelopmentDesign.test.tsx`); the legacy screens are untouched and no user sees any of it.

**Not done:** everything that makes it work. No backend, no IPC, no install, no GitHub call,
and not one of the app-wide error findings is fixed.

## Split the work — do not build this as one thing

Destin asked for four things. They are not one feature and must not share a contract:

| Unit | Goal | Size | Gate it needs |
|---|---|---|---|
| **A** | Development screens made real (goals 2 + 3) | ~1 build stage | Contract deck, signed |
| **B** | App-wide error states (goal 1) | Much larger; per-surface programme | Its own contract, per surface group |
| **C** | Roadmap pinned on GitHub Issues (goal 4) | ~30 min | **Destin's explicit approval — it writes to his public repo** |

A is the one the approved designs cover. B is the biggest of the four and currently at zero.
C is trivial but touches a live public repo, so it never happens unasked.

---

## Step 0 — close the one open design question

**R2-14** (the failed-backup example) was answered "confused?", which records confusion about
the slide rather than a direction. It has never been re-asked.

Serve a one-step **question** deck (`.claude/rules/review-deck.md`): does a labelled example of
a failed backup belong on the Contribute screen at all, or should the screen show only real
state? Do not guess; the answer decides whether unit A builds a backup-status surface.

## Step 1 — the contract, written by a fresh agent

Per `.claude/rules/feature-flow.md`, the contract is written by a **fresh agent** from
`scripts/ui-review/contract-agent.md` — never from this plan, the spec, or a transcript.

- One-step `rows` deck at `error-states.contract.json`, scoped to **unit A only**.
- Every row's `source` is `<deck key>#<step id>` of a submitted answer
  (`error-states.questions.answers.json`, `.workspace-questions.answers.json`,
  `error-states.review{,-2,-3,-4}.answers.json`) or `review:<file>#<id>` of an accepted finding
  in `docs/active/reviews/2026-09-09-error-states-development-ux-review-1{,b}.md`.
- Prefer `mechanical` rows. The 2026-09-05 retrospective recorded a contract where no row was
  mechanically checkable, leaving ~2,800 lines of tests attached to no promise. Do not repeat it.
- Serve it, get it signed, then `python3 scripts/ui-review/review-cards.py contract-check`.
  **Implementation does not start before that exits 0.**

## Step 2 — build unit A

Technical design → reviewer rounds → task breakdown → subagent build with a reviewer per task
(`feature-flow.md` → "The build stage is reviewed, capped, recorded"). The work itself:

### A1 · The originating error reaches the report — E-01, E-02

`BugReportPopup.tsx:12–15` accepts only open/close and `:30–38` starts from an empty
description, so the failure you were reporting is lost the moment you click Report. Give the
report an error-context parameter, sanitized and shown to the user before anything is sent.

`:57–109` is a `try/finally` with **no `catch`** — Continue and Submit can reject and show
nothing. Reporting needs its own recovery path, independent of the operation that failed.
Add rejection tests; per `docs/error-message-standards.md` a failure here is specific-and-
accurate or general-and-non-committal, never a guessed cause.

### A2 · Consent before transmission — E-03, E-04, E-06

`dev-tools.ts:411–455` sends collected log text to Claude. The approved design reviews logs
**before** any provider call, and AI is optional: a ticket must stay editable and submittable
with no AI at all (`dev-tools.ts:411–434` already has the text fallback).

Redaction at `dev-tools.ts:51–60` covers the home path and GitHub/Anthropic token patterns
only. **Do not describe it as sanitization anywhere in the UI.** The user-facing promise is
the editable review, not the filter.

### A3 · Submission and attachments — E-05, E-07

Keep the existing `dev:submit-issue` text path separate from browser-finished attachments
(the approved decision: GitHub uploads a file the moment you attach it, before submit).
`dev-tools.ts:133–168` can truncate issue text on the browser fallback — preserve the full
local draft and disclose truncation rather than silently dropping evidence.

### A4 · Contribution as a managed project — E-08, E-09

`dev-tools.ts:588–616` pulls and sets up a **fixed checkout in the home directory**. The
approved design says existing folders stay untouched, so this must never adopt, move or update
an in-use workspace. Build managed setup as a new path under the sync-spaces rules; leave the
legacy installer where it is. `ContributePopup.tsx:91–98` offers Done on failure — replace with
scoped recovery that shows real state and does not discard partial progress.

Keep the guard that exists: the design must never reach the legacy installer
(`DevelopmentDesign.test.tsx` → "never connects managed setup to the old installer").

### A5 · Remote access parity — E-14

`remote-shim.ts:1585–1592` calls the dev report channels; `remote-server.ts:2725–2728` returns
unsupported for unmatched channels and no `dev:*` handlers exist there, so the shim rejects
(`:265–269`) into a report that never catches it. Either serve the channels remotely or refuse
them with an honest message. After any IPC change, check desktop/Android parity per
`youcoded/CLAUDE.md` → Cross-platform protocol parity.

### A6 · The error primitive — E-10

`ui/states.tsx:90–108` forces a recoverable/general split. Recoverability and reportability are
independent: an app fault can need both a Retry and a Report. Widen the primitive before unit B
depends on it — B is a migration onto this component.

## Step 3 — unit B, the app-wide migration

Its own contract, and **one surface group at a time**, each classified by the audit's five
categories (transient read · user-resolvable · app-side/unknown · uncertain mutation ·
intentional fallback). Start with the confirmed high-risk findings, which are already
independently verified:

- **E-12** — `SyncPanel.tsx:655–656` ignores the resolved result, so backup Retry can say
  "Uploaded!" after `sync-state.ts:675,685` returned `{success:false}`. The sibling handler at
  `:603–604` checks correctly; copy it. **Highest user-visible severity: it lies about data.**
- **E-11** — `InstallingFooterStrip.tsx:55` says "Failed to install" for uninstall and update
  failures too (`marketplace-context.tsx:270–271,330–331,354–355`).
- **E-13** — `ActiveArtifactView.tsx:300–301,324–325`: a failed edit-start refresh can leave no
  modification-time token, and `write-authorization.ts:143–146` then saves without the conflict
  check. Path authorization still holds; scope the claim to that.
- Backend: `remote-shim.ts:135–161` (a timed-out request stays queued and can execute after
  reconnect — a timeout cannot promise nothing happened), `session-manager.ts:381–387` (worker
  exit reports code zero instead of the real code/signal), `handler-utils.ts:17–23` (status zero
  covers parse failures as well as network ones — **zero is not proof of offline**).
- Android: `SessionService.kt:318–321,934–958` unguarded coroutine handlers,
  `ServiceBinder.kt:40–54` startup outside the catch, `SessionService.kt:3715–3719` turning a
  read exception into successful empty content. Android has an SDK on this machine
  (`~/.android-sdk`, `JAVA_HOME=java-21-openjdk`, `-x bundleWebUi`) — the "no SDK" line in
  `CLAUDE.md` is stale. Verify Android separately; shared React is not proof of parity.

The renderer sweep in the audit lists seven surface families for the migration ledger. **No
family in that list is complete** — it is a starting inventory, not coverage.

E-16 is **rejected**: `RatingSubmitModal` does not exist. Do not migrate it.

## Step 4 — unit C, the roadmap pin

Only on Destin's explicit go-ahead. Approved shape: pin a canonical **link**, not a mirrored
copy of the roadmap body. Nothing here touches the public repo before he says so.

## Step 5 — acceptance

Per `feature-flow.md`: a fresh code reviewer and the UX tester's second run report in parallel
to `docs/active/reviews/`, the implementing session triages, a **fresh grader** writes
`error-states.contract.verdicts.json`, then the acceptance deck asks one yes/no per human row.
Destin makes the merge call. **A UX-tester run against the current designs has never happened** —
two runs exist, both against round 1.

## Verification, every time

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/error-states-development
bash scripts/verify.sh ./youcoded     # desktop only: types, tests, knip, lint, ast-grep
node scripts/audit-anchors.mjs        # docs, rules, MAP, budgets
```

`audit-anchors.mjs` is **red on origin/master already**, for two reasons belonging to no current
branch: `docs/active/{plans,specs}/2026-09-07-permission-prompt-composer-focus*.md` are
byte-identical duplicates of their `docs/archive/` copies, and `.claude/rules/native-specialists.md`
is 624 words against a 600 limit. Three sessions have now inherited this. Do not read those two
as your own, and do not let a standing red teach you to skip the check.

## Standing constraints

- Never touch Destin's running app (`.claude/rules/live-app-safety.md`). Runtime checks go
  through `bash scripts/run-dev.sh`; **announce before it paints a window on his desktop.**
- Stage explicit paths; other sessions keep untracked work in this workspace.
- Merge only on his explicit instruction; never end a turn suggesting one.
- The workbench must look like the real app: no prototype captions, no greyed-out primary
  actions, dialog actions full-width `w-full py-2.5` primary over secondary
  (`.claude/skills/ui-mockup/SKILL.md`, and Destin 2026-09-09).
- `WB_PORT=<port>` repoints a capture plan; do not copy the plan to change its port.

## Order decided — 2026-09-10

Destin, after asking where the app-wide error work was: **"finish the screens, but we will
continue on to do the rest of this work."**

So: **unit A to completion, then unit B.** Unit B is not deferred and not optional — it is his
goal 1 and the larger half of what he asked for. Do not close this branch, wrap up, or treat
the feature as delivered when A lands.

**Why A got the whole design stage, recorded so the next session does not repeat it:** the deck
/ review-round process attaches to NEW screens. Goals 2 and 3 were new screens and consumed the
design stage; goal 1 is existing screens made honest, which needs a thin contract and code, not
deck rounds. Two days went into the smaller half of the ask.

**Measured 2026-09-10, the size of unit B** (`youcoded/desktop/src/renderer`): 294 `.tsx` files,
99 containing a `catch`, **7 using `<ErrorState>`** (14 call sites), 622 `catch` blocks total.
The standard component is the exception, not the rule.

A6 (widen `ui/states.tsx:90–108` so recoverable and reportable are independent) is the hinge
between the two units: unit B is a migration onto that component, so A6 lands in unit A and
unit B builds on it.

Unit B opens on the three findings that state something false to the user, in this order:
E-12 (backup says "Uploaded!" after `{success:false}`), E-11 (uninstall and update failures
labelled "Failed to install"), remote-shim timeout (`:135–161` — a timed-out request stays
queued and can execute after reconnect, so "nothing happened" is not true).
