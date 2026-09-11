---
status: active
date: 2026-09-10
contract: docs/active/design/2026-09-08-error-states-development/error-states.contract.json
---

# Unit A — technical design

Contract signed 2026-09-10 11:55 (`C yes`), 23 rows. This says HOW those rows get built. It is
not a second contract: where this document and the contract disagree, the contract wins and
this document is wrong.

## The shape of the change

The approved screens already exist as real renderer components — `ReportDesign.tsx`,
`ContributionDesign.tsx`, `ContributionWalkthrough.tsx`. They are gated behind
`?mode=workbench` by a one-line check in each legacy popup
(`BugReportPopup.tsx:32–34`, and the same idiom in `ContributePopup.tsx`).

**So "make the screens real" is not a rewrite.** It is: give the design components their
backend, then delete the gate and the legacy screens behind it. The gate comes out LAST, once
the new screen does everything the old one did.

Nothing in the legacy flow is deleted before its replacement is proven, because the legacy
flow is the only working reporting path Destin has today.

## What the renderer can already call

`window.claude.dev`, from the legacy flow (`BugReportPopup.tsx:66–110`):

| Call | Returns | Used by |
|---|---|---|
| `diagnostics()` | env snapshot string | A1 |
| `logTail(n)` | recent log text | A2 |
| `summarizeIssue({kind, description, log})` | `{title, summary, flagged_strings}` | A2, now optional |
| `submitIssue({kind, title, summary, description, log, label})` | `{ok, url}` or `{ok:false, fallbackUrl}` | A3 |
| `installWorkspace()` | `{path, alreadyInstalled}` or `{error}` | A4 |
| `onInstallProgress(cb)` | unsubscribe fn | A4 |
| `openSessionIn({cwd, initialInput})` | — | A4 |

Two are missing and must be added:

- **`dev.environment()`** → `{version, platform, arch, electron}`. R22 requires the ticket to
  show the real app version. Today only the main process knows it — `submitIssue` composes the
  Environment line internally, so the renderer has no way to display what it is about to send.
  Showing a version the user cannot see before sending is the defect R22 names.
- **`dev.reportContext()`** or an argument path for the originating error (A1). See below.

## A6 · Widen the error primitive — FIRST, and the hinge to unit B

`ui/states.tsx:90–108` is a discriminated union: `recoverable` carries `message` + `onRetry`;
`general` carries `title` + `explainer` + `onReportBug` + `onDiagnose`. The two cannot combine,
so an app-side fault that is BOTH worth retrying and worth reporting cannot be expressed.

Widen it so the actions are independent, with two hard constraints:

1. **All 14 existing call sites in 7 files keep working unchanged.** This is a widening, not a
   migration; unit B does the migration.
2. **The type must still refuse an error with no action at all.** The old union enforced that
   structurally and it is the reason the primitive is trustworthy. A plain optional-everything
   props type would silently permit a dead-end error, which is the exact defect this whole
   feature exists to remove. Keep it enforced at the type level, or pin it with a test that
   fails on an actionless `<ErrorState>` — decide when writing it, and say which was used.

`docs/error-message-standards.md` still governs the copy: specific and accurate, or general and
non-committal. Widening which ACTIONS may appear together changes nothing about never guessing
a cause.

## A1 · The originating error reaches the ticket

`BugReportPopup.tsx:12–15` takes `{open, onClose}` only, and `:30–38` starts from an empty
description — so the failure being reported is gone the moment the user clicks Report. The
report must accept the error that caused it.

Carry it as a value the caller passes when opening the report, not as a global. The renderer's
existing chain is `Settings → DevelopmentPopup.onOpenBug()` (`DevelopmentPopup.tsx:47`), which
today takes no arguments; widen that one callback. `ErrorState`'s `onReportBug` becomes the
second caller once unit B migrates surfaces onto it, which is why A6 lands first.

**The user reviews it before it is sent** — the context is shown in the ticket, editable or at
minimum removable (R11: recent logs are only included when chosen). Never attach an error the
user has not seen.

## A2 · Consent before transmission

`dev-tools.ts:411–455` sends collected log text to Claude. Two rows bind here:

- **R17** — AI help appears only on the review step, behind a disclosure the user opens. So
  `summarizeIssue` is called from that disclosure's button and from nowhere else. The legacy
  `onContinue` call at `BugReportPopup.tsx:80` does not survive.
- **R12** — a ticket can be written, reviewed and sent with no AI call at all. This is a
  guard, not a preference: assert that submitting never invokes the provider.

Redaction at `dev-tools.ts:51–60` covers the home path and GitHub/Anthropic token patterns
only. **It is not comprehensive and no UI text may imply it is.** The user-facing promise is
the editable review, not the filter.

## A3 · Submission, failure, attachments

- **R23** — a failed submission keeps the title, description and chosen details in the draft
  and offers a retry. `onSubmit` (`:89–110`) is a `try/finally` with **no `catch`**, so a
  rejection today shows nothing at all. Same defect in `onContinue` (`:66–88`).
- **R14** — before attaching, the screen says GitHub uploads a file immediately, before the
  ticket is submitted. Copy already exists in `ReportDesign.tsx`'s `Callout`; it must survive.
- **R13** — the user prepares and reviews in YouCoded, then finishes attaching in GitHub. The
  browser hand-off is `submitIssue`'s `fallbackUrl` path. `dev-tools.ts:133–168` can truncate
  issue text on that path: preserve the full local draft and disclose truncation rather than
  silently dropping evidence.

## A4 · Contribution as a managed project

Destin, 2026-09-10: *"the workspace already has it's own startup/sync scripts, so i don't think
we need to build anything special. just install the folder as a youcoded managed workspace."*

`installWorkspace()` (`dev-tools.ts:588–616`) already clones and runs the workspace's own
`setup.sh` (`:614`). Two changes, no new subsystem:

1. **Target a managed project path** rather than the fixed `~/youcoded-dev` (`:589`), and
   register it as a space. `sync-spaces` already has this: `createProject` / `importProject`
   (`preload.ts:953–956`), `registerProject` (`service.ts:588–612`), and `backfillRegistry()`
   is create-if-absent and idempotent. **`importProject` MOVES a folder — it is not the call to
   use here**, because R9 forbids touching what is already on disk.
2. **R9** — an existing folder is left untouched and the screen says the new project is
   separate. The legacy branch at `:596–606` throws on a foreign folder and *pulls* on a
   recognised one; both are ruled out.

R10 — setup finishes and the project opens with backup unavailable. Local-only is a normal
outcome, not an error state. **Nothing on this screen mentions backup or sync in any case**
(questions-2, 2026-09-10); the sync settings page keeps sole ownership of that status.

`ContributePopup.tsx:91–98` offers Done on failure. Replace with recovery that shows real state
and does not discard partial progress.

## A5 · Remote access

`remote-shim.ts:1585–1592` calls the dev report channels; `remote-server.ts:2725–2728` returns
unsupported for unmatched channels and no `dev:*` handlers exist there, so the shim rejects
(`:265–269`) into a report that never catches it. Either serve the channels remotely or refuse
them with an honest message — **not a silent hang, which is what happens today.**

After any IPC change check desktop/Android parity (`youcoded/CLAUDE.md` → protocol parity);
`ipc-channels.test.ts` guards the bridge.

## Order, and why

1. **A6** — nothing else can use both actions until it exists, and unit B is a migration onto it.
2. **A1** — the report's inputs, which A2 and A3 both operate on.
3. **A2**, **A3** — the ticket's behaviour.
4. **A4** — independent of the ticket; can run in parallel with 2–3.
5. **A5** — needs A1–A3 settled to know what it must serve.
6. **Remove the `?mode=workbench` gate and the legacy screens.** Last, and only once the new
   screen does everything the old one did.

## Verification

`bash scripts/verify.sh ./youcoded` after each task. Android is unchanged by unit A but has an
SDK on this machine if it becomes relevant (`~/.android-sdk`, `JAVA_HOME=java-21-openjdk`,
`-x bundleWebUi`).

Eight contract rows are `human` today and are behaviour a test can settle — R12, R20, R22, R23
in particular. **Each gets a real guard during the build, and the row is upgraded to
`mechanical` when its guard exists.** The contract has zero mechanical rows right now because
nothing was built when it was written; ending the build with zero is the failure mode the
2026-09-05 retrospective recorded, and is not acceptable here.

Per test-suite hygiene: a guard you did not break is a guard you did not test. Break each new
guard, paste the red, restore.
