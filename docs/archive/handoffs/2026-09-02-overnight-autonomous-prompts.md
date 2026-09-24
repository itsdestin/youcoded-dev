---
status: active
created: 2026-09-02
kind: handoff
---

# Three overnight autonomous session prompts (2026-09-02)

Paste each block into its own fresh session. They are file-disjoint by design:
A = desktop renderer/main + Android prune · B = marketplace worker + marketplace-facing
app code · C = tests, tooling, CI, workspace hooks.

Shared contention points, already mitigated in the prompts:
`ROADMAP.md` (all three flip items — one small final commit each, rebase-and-retry),
`SessionStrip.tsx` (A touches it last, in a droppable commit — `worktrees/session-motion`
has 14 unmerged commits there), `LibraryScreen.tsx` (A and B may both touch — take both sides).

---

## Session A — Desktop Tier-0 bug fixes + UI primitive adoption

```
Autonomous overnight session. Destin is asleep and will not answer anything. Never ask a
question — if an item needs a decision or turns out bigger than filed, SKIP it, write down
why, and move to the next one. Do not stop early; work the whole list, then keep going down
the Tier 1 "UI / renderer small" list in
docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md.

Setup:
- bash setup.sh (it may skip dirty repos — that is fine, other sessions own them)
- git -C youcoded worktree add ../worktrees/tier0-desktop -b fix/tier0-desktop-batch origin/master
- cp -al youcoded/desktop/node_modules worktrees/tier0-desktop/desktop/node_modules
  (hardlinks — NEVER a symlink or junction; do not run npm ci or gradle bundleWebUi in there)
- Work only in worktrees/tier0-desktop. Do not touch any other worktree or branch.

Hard rules for tonight:
- HEADLESS ONLY. Do not run scripts/run-dev.sh, do not launch any Electron window, do not
  open anything on Destin's desktop while he sleeps. The workbench (run-workbench.sh) and
  the ui-review rig are headless and allowed.
- The difficulty ranking is 2 days old. Re-verify each item against current code before
  editing; if reality disagrees with the note, trust the code and say so in your report.
- bash scripts/verify.sh worktrees/tier0-desktop must pass before you call anything done.
- One commit per item, with a WHY comment at each non-obvious edit site.

The work, in order:

1. Button `hidden` never hides — add a display conflict group (hidden|block|inline-flex|
   flex|grid|inline-block|...) to CONFLICT_GROUPS in components/ui/Button.tsx (~:113-132),
   then rg every `Button` caller passing a display class and fix the live ones (at least
   LibraryScreen.tsx ~:176). Add a pinned test for the merge behaviour.
2. Kotlin `removeProject` is test-only — delete the declaration in CentralIndex.kt (~:72)
   and the ArtifactStoreTest.kt case that calls it. Verify with:
   cd worktrees/tier0-desktop && JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
   ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi
   (-x bundleWebUi is mandatory in a worktree — it runs npm ci, which is destructive
   against hardlinked node_modules.)
3. sendChatMessage overloads reject a non-literal provider arg — widen the type signature.
4. Nothing detects an artifact repair that over-reclassifies — add the counter/log line.
5. Terminal Opacity slider floors at 30% where 80% is the real floor — ThemeScreen.tsx
   ~:565, make `min` conditional (0.8 under wallpaper/gradient themes).
6. Skip Permissions tooltip promises a safety net that does not exist —
   SkipPermissionsInfoTooltip.tsx ~:42. Copy rewrite only, and it must follow
   docs/error-message-standards.md (specific-and-accurate, or general-and-non-committal).
   The measured truth is in docs/active/investigations/2026-08-09-native-skip-permissions.md.
7. Adopt the FieldError primitive — 25 hand-rolled copies across 14 files (ROADMAP "Adopt
   the `FieldError` primitive"). Mechanical sweep; keep the rendered text identical.
8. LAST, in its own separate commit so it can be dropped: three hand-rolled badges move to
   components/ui/Badge.tsx — SpecialistsChip.tsx and SessionStrip.tsx (x2). Note in the PR
   body that worktrees/session-motion has 14 unmerged commits on SessionStrip.tsx and this
   commit may need to be dropped or rebased.

Shipping policy (no human awake to sign off):
- Push the branch and open a PR for the whole batch.
- MERGE to master only once CI is green AND the change is invisible to the eye — items 1-4
  qualify. Merge means merge AND push, then remove the worktree and delete the branch.
- Items 5-8 change something a user can SEE. Split them onto a second branch
  (fix/tier0-desktop-visible), open a PR, and LEAVE IT OPEN for Destin. Do not merge them.
  For those, also build a review deck with scripts/ui-review/review-cards.py (one step per
  change, Before | After, headline + What changed / You'll notice / Risk) and put the deck
  path in the PR body. Before/After shots come from the headless ui-review rig, and if you
  run it use YOUCODED_PORT_OFFSET=400 so you don't deadlock another sweep.

Bookkeeping at the end:
- Flip the ROADMAP.md items you actually closed to [x] with a one-line note of what shipped
  and the PR number. Do this as ONE small final commit in a TEMP worktree of youcoded-dev at
  origin/master, cherry-picking only your own commits, and push from there — the shared
  youcoded-dev checkout is dirty and behind and belongs to other sessions. Stage by explicit
  path only; never `git add -A`. If the push is rejected, rebase that one commit and retry.
- Write docs/active/handoffs/2026-09-02-session-a-report.md: what merged, what is waiting in
  a PR, what you skipped and why, and anything you found that was filed wrong.
```

---

## Session B — Marketplace + Worker Tier-0 and dependency triage

```
Autonomous overnight session. Destin is asleep and will not answer anything. Never ask a
question — if an item needs a decision or turns out bigger than filed, SKIP it, write down
why, and move to the next one. Do not stop early.

Setup:
- bash setup.sh (it may skip dirty repos — fine, other sessions own them)
- Two worktrees, both off origin/master:
  git -C wecoded-marketplace worktree add ../worktrees/mkt-tier0 -b fix/tier0-marketplace origin/master
  git -C youcoded worktree add ../worktrees/mkt-app -b fix/tier0-marketplace-app origin/master
  cp -al youcoded/desktop/node_modules worktrees/mkt-app/desktop/node_modules (hardlinks, NEVER a symlink)
- Do not touch any other worktree or branch. Another session is working desktop UI tonight
  in worktrees/tier0-desktop — if you both edit LibraryScreen.tsx, keep both changes.

Hard rules: HEADLESS ONLY — no run-dev.sh, no Electron window on Destin's desktop while he
sleeps. Never tell anyone to run `wrangler deploy`; the Worker auto-deploys from master via
.github/workflows/worker-deploy.yml, so shipping a Worker change means PR -> merge.
bash scripts/verify.sh worktrees/mkt-app must pass for the app side; run the worker's own
test suite for the worker side. The difficulty ranking is 2 days old — re-verify each item
against current code before editing.

The work, in order:

1. Bump wecoded-marketplace/worker/package.json wrangler ^3.80.0 -> ^4, fix whatever the
   major surfaces (config schema, deprecated flags), get the worker tests green.
2. Marketplace comment threads truncate silently at 50 — return `total` alongside
   `comments` from the worker, and render "showing the 50 most recent of N" in the app.
3. A plugin installed mid-session isn't votable until restart — call reconcileInstalls()
   after a successful install (or report skill ids too). Pin it with a test.
4. Theme installs are never reported to the Worker — STEP 1 ONLY: have installTheme() call
   marketplaceApi.install(). Do not do steps 2-3 of that ROADMAP entry.
5. A held comment is invisible to its author — surface the held state on the plugin page;
   the data already ships in /auth/export.
6. Prune the dead `theme-builder` favourite from existing ~/.claude/youcoded-skills.json
   profiles (the registry side is already fixed — this is the one-line app-side cleanup).
7. Then, from Tier 1: "Delete your own comment" and "Report a comment" (worker + UI), and
   "Installed prompts are a permanent snapshot, and update() lies about it".

Dependency PRs (do this after the code work, it is bounded):
- Merge the two GREEN ones: youcoded #370 (desktop minor/patch group) and wecoded-themes #26.
  Read the actual check output before merging — do not merge on a grep that matched a FAIL
  line. Only merge if every check is genuinely passing.
- For the ~12 red dependency PRs (youcoded #338 #337 #271 #270 #242 #237 #236 #235,
  marketplace #63 #61 #60), read WHY each check fails and write one line per PR in your
  report: real breakage vs. a pre-existing unrelated CI failure. Fix and merge the ones that
  are trivially fixable and low-risk. Do NOT touch the two majors (TypeScript 5->7, AGP 8->9)
  beyond diagnosing them.

Shipping policy: open a PR per repo. Merge to master once CI is green — everything on this
list is behaviour/data correctness, not visual taste, so merging is right; the exception is
anything that changes wording or layout a user will notice, which stays an open PR with a
review deck (scripts/ui-review/review-cards.py) linked in the body. Merge means merge AND
push, then remove the worktree and delete the branch both remotely and locally.

Bookkeeping: flip the ROADMAP.md items you closed to [x] with the PR number, as ONE final
commit made in a TEMP worktree of youcoded-dev at origin/master (cherry-pick only your own
commits, push from there — the shared checkout is dirty and owned by other sessions; stage
by explicit path only, never `git add -A`; rebase and retry if the push is rejected).
Write docs/active/handoffs/2026-09-02-session-b-report.md with what merged, what is open,
what you skipped, and the dependency-PR triage table.
```

---

## Session C — Test suite, tooling and CI health

```
Autonomous overnight session. Destin is asleep and will not answer anything. Never ask a
question — if an item needs a decision or turns out bigger than filed, SKIP it, write down
why, and move on. Do not stop early. This session's whole job is to make the verification
tooling honest, because three separate false-greens have already cost real time.

Setup:
- bash setup.sh (may skip dirty repos — fine)
- git -C youcoded worktree add ../worktrees/test-health -b fix/test-and-tooling-health origin/master
- cp -al youcoded/desktop/node_modules worktrees/test-health/desktop/node_modules
  (hardlinks — NEVER a symlink; a symlinked node_modules makes verify.sh silently skip suites)
- Do not touch other worktrees. Two other sessions are working tonight in
  worktrees/tier0-desktop (desktop UI) and worktrees/mkt-app (marketplace) — stay out of
  their files; yours are tests/, scripts/, config, and .claude/hooks/.

Hard rules: HEADLESS ONLY — no run-dev.sh, no window on Destin's desktop while he sleeps.
Every claim you make about a test being fixed must be backed by pasted command output.
Reproduce each bug on a clean checkout FIRST, before changing anything.

The work, in order:

1. workbench-boot-check.mjs reports "All 12 workbench routes mount cleanly" when NOTHING is
   serving the port — verified false-green against a dead port. Make it assert the
   navigation actually resolved (Page.navigate frame result / non-4xx-5xx response) AND that
   a known root element exists in the DOM, and fail loudly when the port refuses a
   connection. This is the highest-value item on the list: CLAUDE.md tells every session to
   trust this check.
2. harness-eval-orchestrator.test.ts is red on master (tests/harness-eval-orchestrator.test.ts
   ~:1747 expects 2 transcript files, gets 1; plus a second case "does not advertise models a
   --only run will not touch" that times out under full-suite load). git bisect that ONE test
   to find the commit that turned it red, then decide from the commit whether the assertion
   or the orchestrator is wrong — the comment above it reads like it was fitted to an
   observed run, so do not assume the test is right.
3. ipc-handlers.test.ts flakes at import time — diagnose and fix.
4. The intermittent flakes in the three named suites (ROADMAP "#tests" entries) — find the
   shared cause if there is one; these are timing-sensitive on loaded runners, not
   Windows-specific.
5. desktop/tests/ (347 files) is neither type-checked nor linted — wire it into tsconfig and
   eslint and fix the fallout. Expect this to be the biggest item; if the fallout is huge,
   land the config change with a scoped ignore list and file the remainder.
6. The session-start audit-staleness reminder has never fired — .claude/hooks/context-inject.sh
   picks the July *baseline* file via `ls docs/audits/[0-9]*.md | sort | tail -1`. Filter out
   reports whose `scope:` is `baseline`, or require `residue:` and select on that. Then prove
   it fires by running the hook. (This one is in youcoded-dev, not the app — see the
   bookkeeping note below for how to push it.)
7. Run `node scripts/audit-anchors.mjs` and close or re-scope the ROADMAP entry claiming the
   workspace CI anchor cron is red, and the three other entries the difficulty ranking flags
   as already-done (the two doc anchors; the curated-defaults dead id). For the entry about
   conversation-triage.mjs: the file is gone from git AND from disk — either re-create it
   from what the ROADMAP entry describes or delete the entry, your call, and say which.
8. Then, from Tier 1: verify.sh related-tests failing in symlinked-node_modules worktrees
   (the workaround is proven — make it a real fix or a loud refusal), and the ~100 fixed
   sleeps standing in for signals (convert the worst offenders, not all 100).

Shipping policy: everything here is invisible to users. Open a PR, and once CI is green,
merge it and push. Merge means merge AND push, then remove the worktree and delete the
branch both remotely and locally. If item 5 balloons, split it onto its own PR so the rest
can land.

Bookkeeping: flip the ROADMAP.md items you closed to [x] with the PR number. The hook fix
(item 6) and the ROADMAP edits both live in youcoded-dev — make them in a TEMP worktree of
youcoded-dev at origin/master and push from there; the shared checkout is dirty, 20+ commits
behind, and owned by other sessions. Stage by explicit path only, never `git add -A`, and
never stash/reset the shared checkout. Rebase and retry if the push is rejected.
Write docs/active/handoffs/2026-09-02-session-c-report.md: every bug reproduced, the bisect
result, what is green now that was not, and what you left behind.
```
