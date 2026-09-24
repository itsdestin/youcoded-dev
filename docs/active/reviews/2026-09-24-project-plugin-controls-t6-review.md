# T6 (Marketplace post-install project setup) — code review

Commit reviewed: `3508c7c24`. Verify summary (`bash scripts/verify.sh youcoded`, full suite —
triggered by an unrelated `desktop/package.json` change on another concurrent branch):

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (full suite)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

All green — the bugs below are logic bugs the test suite does not currently exercise, not
failures it already caught.

## Findings

- F1 — `desktop/src/main/project-extensions/resolve.ts:109-120` (`defaultPluginOn`) fed by `store.ts:399-451` (`ensureSeeded`'s `seedReferenceInstant`) and its two callers `desktop/src/main/project-extensions/ipc-shell.ts:106-109` and `desktop/src/main/project-extensions/session-availability.ts:126-131` — **using the folder's `addedAt` as the seed reference instant turns OFF a marketplace plugin that is already installed and working, on any project whose folder was added before the plugin was installed and that has never been seeded before** — this is the exact regression the task asked me to check for question (c), and it is real, not just theoretical. Mechanism: `defaultPluginOn` returns `false` whenever `installedAt > seedInstant`. Before this commit `seedInstant` defaulted to `now` (the seed call's own timestamp), so `installedAt` (always ≤ now) could never exceed it and every existing install stayed ON. This commit replaces that with `resolveProjectAddedAt()` — the saved folder's one-time `addedAt`, which for almost every real project predates most of the plugins later installed into it. Any project that has simply never opened its Skills & tools tab or started a conversation since being added (i.e. most projects, right now, before this feature's own rollout) will seed **every marketplace plugin installed after the folder was added — not just "just-installed" ones — as OFF** the first time `ensureSeeded` runs for it, including plugins that have been installed and running fine for months. This directly breaks contract row **R4** ("An existing project's switches first show which skills and tools already work there today, rather than starting from a blank default") and the product's own "nothing that works today turns off" rule, and it hits BOTH seed trigger paths named in the commit message (`project-extensions:get` — the Marketplace panel itself — and native session creation, so a user's very first conversation in an untouched project can silently lose an already-working tool connection). **How confirmed:** traced `seedDefaultOn` → `defaultPluginOn`'s exact comparison, then reproduced empirically with a temporary vitest test calling the real `ensureSeeded()`: folder `addedAt` = 1 year ago, plugin `installedAt` = 3 months ago (a long-settled, ordinary install), `now` = today, never-seeded project → `ensureSeeded` returned `{ civic:report: { on: false } }`. Test file was written to `desktop/tests/zz-temp-seed-bug.test.ts`, run once (`npx vitest run`, confirmed failing/red as expected), then deleted — no trace left in the tree (`git status` on `desktop/tests/` is clean).

- F2 — `desktop/tests/project-extensions-store.test.ts:264-281` — the two new tests proving the "start-off guarantee" (R19) only ever set `installedAt` to ~1 second before the seed call, i.e. they test the "just installed a moment ago" case exclusively and never test an old, already-settled install (e.g. installed months ago, still after `addedAt`) landing on its FIRST seed — the exact shape that is broken (F1). The suite is 100% green while shipping a "don't turn off what works today" regression because no test represents "what works today." [PLAUSIBLE — this is a coverage-gap observation about test design rather than a separate code bug, but it is why F1 shipped past `verify.sh` clean.]

- F3 — `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx:74-79,166-176` — the commit's own message claims the post-install panel "resets on target change (targetKey)", and the code does implement that (`useEffect(() => setJustInstalled(null), [targetKey])`), but `desktop/tests/MarketplaceDetailOverlay.test.tsx` has no test that navigates to a second plugin (or a Related-item link) after an install and asserts the first plugin's `ProjectSetupPanel` is gone. Read the whole file — confirmed no `targetKey`/navigation-reset test exists. Low severity: I read the effect and it is correct as written, so this is a coverage gap, not a live bug. [PLAUSIBLE — could not find a hidden interaction that breaks it, only that nothing pins it.]

- F4 — `desktop/src/renderer/components/marketplace/ProjectSetupPanel.tsx:96-172` (`ProjectSetupRow`) — the row's own comment admits "a race between install finishing and this row's own fetch" can leave a freshly-installed plugin missing from a project's catalog scan, showing "Not available here yet," and claims "reopening the row re-fetches and self-heals" — but `useProjectExtensionsController`'s fetch gate (`shownForPathRef`) only re-fetches when `active` flips **from false to true** for a path it has not already loaded; collapsing and re-expanding the SAME already-loaded row does not trigger `load` again (`shownForPathRef.current === projectPath` short-circuits it), so the claimed self-heal requires navigating away and back to the whole panel (remount), not just toggling the row. A user who sees "Not available here yet" on the very first (auto-expanded, R20) row has no discoverable way to retry within the panel itself. [PLAUSIBLE — I read the gating logic and believe collapse/expand alone does not refetch, but did not write a DOM test to force the race and observe it live.]

## Not covered

- Did not audit Android parity for the new `artifacts:list-projects-index` / `project-extensions:get` consumers beyond confirming both already have `not-implemented-on-mobile` branches used by this code (pre-existing convention, not new in this diff).
- Did not review `PluginGroupRow`'s and `RiskDialog`'s pixel-level match against the approved screenshots (`docs/active/design/.../images/.../inbox-flow--*.png`) — only that the component tree and copy match the code's own WHY comments referencing them.
- Did not independently re-derive `useChunkedReveal`'s internal chunking/threshold correctness — relied on the existing 1,000+-project stress test in `ProjectSetupPanel.test.tsx` passing under `verify.sh`.
- Budget did not reach a full read of `desktop/src/main/project-extensions/candidates.ts`'s managed-project directory walk beyond the `addedAt` propagation path already needed for F1's investigation.

## Recommended fix for the seeding rule (F1)

The bug is that `addedAt` (a folder's one-time "when was this project first opened in YouCoded"
timestamp) is being used as a proxy for "was this specific plugin already running here," but
those are different questions — `addedAt` is almost always *older* than a plugin installed at
some arbitrary later date, so comparing `installedAt > addedAt` punishes ordinary installs that
happened, correctly, after the project already existed.

The fix criterion in the task brief — `seedReferenceInstant = min(projectAddedAt,
featureFirstRunAt)` — does not solve this: `min()` of two timestamps that are BOTH older than
`installedAt` still fails the same comparison (an install from 3 months ago is still `>` a
folder `addedAt` from a year ago, regardless of what `featureFirstRunAt` is or isn't). `min()`
only helps the *opposite*, already-safe case (no recorded `addedAt` at all, i.e. today's
fallback to `now`) by giving that case an earlier reference too — it does not touch F1's failure
mode, and would not turn any additional plugin OFF that isn't already broken by `addedAt` alone,
so it's not harmful, just insufficient on its own.

The comparison needs to be inverted to match its own stated intent ("has this install existed
long enough to be considered already-working, vs. arriving as part of THIS project's very first
setup"): a project's first-ever seed should treat **every already-completed install as
pre-existing and ON**, and reserve the "installed after seed, starts off" rule (R19/rule 2) for
installs that are provably newer than the *feature's own rollout* — i.e. compare `installedAt`
against a fixed, once-recorded "this build first ran at" timestamp (the `featureFirstRunAt` the
task brief already proposes), not against the project's `addedAt` at all. Concretely:
`seedReferenceInstant` for an unseeded project's first read should be `max(now, ...)`-safe by
simply defaulting to the ROLLOUT instant rather than the folder's age — i.e. keep `now` as today
does for every plugin that predates this feature's own shipped `featureFirstRunAt`, and only use
a real "since-when" comparison (`installedAt > featureFirstRunAt`) to catch a plugin installed
*after* this fix itself ships. `addedAt` is the wrong signal entirely: a folder's age has no
relationship to when a plugin was installed into it. Recommend reverting `ipc-shell.ts` and
`session-availability.ts` to pass `Date.now()` (i.e. drop `resolveProjectAddedAt` as the
seed-time signal) and instead adding the one-time `featureFirstRunAt` timestamp described in the
task brief as the ONLY new lower bound `seedDefaultOn` compares against, written once at first
launch after this feature ships and never moved earlier.

## Triage (implementing session)
- F1 accepted — fixed in 6ed6ae820: the reference is a per-device featureFirstRunAt; folder age no longer plays any part; the "installed months ago, after the folder was added" case is pinned.
- F2 accepted — covered by the same pins.
- F3 accepted — navigation reset test added.
- F4 accepted — collapse/expand retries after an error or a pre-install fetch; a never-expanded row no longer says "Loading…".
