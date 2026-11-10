# Workspace-repo worktree triage (2026-11-08, ~17:40 local)

Scope: 50 registered workspace worktrees (worktrees/sessions/*), 4 unregistered leftover dirs, worktrees/cards-master.
Method: worktrees.txt numbers + `git cherry`, per-file comparison of every changed/dirty file against origin/master (afa9345d7),
PR list (gh), cards grep (by branch in `work:`, else by topic), /proc cwd scan for live processes. Read-only throughout.
Notes: "unpushed=0" everywhere, so every COMMIT exists on a remote branch. Only UNCOMMITTED files exist solely on this disk.
"Possibly active" = live process with cwd there, or files touched today.
Component (youcoded/ etc.) worktrees nested inside these were not examined.

## Recommendation counts (50)
CLEAN UP 20 | SALVAGE-THEN-CLEAN 8 | FINISH (land small/doc work) 7 | FINISH (active build/design) 6 | ASK DESTIN 6 | ABANDON 3

## A. CLEAN UP (merged, nothing unsaved) — 20
| branch | card(s) | state / evidence | why still open |
|---|---|---|---|
| session/2-message-timestamps-wrapup | #19 (not in work:), card #2 merged | ahead=0, um=0, clean; PR #298 MERGED | merged, never removed |
| session/207-wrapup | #207 merged (no link) | ahead 0, clean; PR #327 MERGED | same |
| session/29-full-ci-source-probe | #29 (work:) planning | ahead 0, clean (scratch/ ignored dir only) | experiment finished, evidence is in card #29 |
| session/29-linux-ci-winner | #29 (work:) | ahead 0, clean | same |
| session/79-website-everything-app | #79 merged | ahead 0, clean; PR #294 MERGED | same |
| session/93-batcher-counters | #93 merged (work:) | ahead 0, clean | same |
| session/analytics-proposals | #211 merged (work:) | PR #330 MERGED | same |
| session/browser-open-window | none | PR #302 MERGED | same |
| session/first-run-fixes | #214 (topic; explore) | ahead 0, clean: no unique commits ever | session opened, nothing landed on branch |
| session/fix-anthropic-many-image-brick | #62, #106 (work:) | PR #293 MERGED | merged, not cleaned |
| session/jump-bottom-button | none | PR #313 MERGED | same |
| session/nightly-test-fixes | none (#13 topic) | ahead 0, clean | no unique commits |
| session/office-icon | none | PR #307 MERGED | merged |
| session/readme-models | none | ahead 0, clean | no unique commits |
| session/readme-screenshots | none | ahead 0, clean | no unique commits |
| session/reddit-screenshot | none | ahead 0; tip is merge of PR #303 | merged |
| session/release-1-3-1-android-licensing | #147 mention only | ahead 0, clean | no unique commits |
| session/security-apparatus | #195, #212 (topic) | PR #344 MERGED | merged |
| session/bg-tracking-audit | none (#93 topic) | PR #301 MERGED; dirty = 1 untracked dir `docs/archive/design/2026-10-22-background-status/runs/` = 166 before/after screenshots, NOT on master | the deck itself was archived by the PR; the screenshot runs are regenerable noise. Low-value loss. |
| session/ui-closeout-fixes-2 (dir ui-consistency-audit) | none (#135 topic) | PR #264 MERGED; dirty 80 untracked review-image folders (600 files) under docs/active/design/2026-09-23-ui-element-review/images, absent from master; 1 popup-cards review html | regenerated review pictures from a finished review; no unique tracked work. Low-value. |
Caveat: all 20 are 90-1500 commits behind master, so none carries work master lacks. Ignored `scratch/` dirs may still hold test logs (disposable).

## B. SALVAGE-THEN-CLEAN — 8
| branch | card | state | uncommitted detail | why open | what to save |
|---|---|---|---|---|---|
| session/11-claude-direct-controls | #11 planning (work:) | ahead 0 (code landed app PR #657) | M docs/wrap-ups.md (+8 lines); untracked 263 files: build plan, code review, A/B evidence under docs/active/investigations/2026-10-18-claude-controls-build/ — none on master | plan/review/evidence never archived | plan + code-review md (2 files) maybe archive; rest evidence |
| session/163-crash-resume-repair | #163 MERGED | ahead 0 | 7 STAGED-not-committed files: crash-resume plan, 3 recovery scripts + tests (apply-session-recovery, repair-transcript-pairs, validate-installed-session-recovery), wrap-ups.md edit. None on master | app fix shipped (PR #662, ws #287); these one-shot repair tools were never committed | decide if the repair scripts are wanted; else drop |
| session/29-android-build-bench | #29 | ahead 0 | 1 untracked plan: docs/active/plans/2026-10-18-android-ci-speed-experiments.md (not on master) | experiment plan unsaved | archive the plan or drop |
| session/29-android-paired-bench | #29 | ahead 0 | 1 untracked plan 2026-10-19-android-matched-runner-trial.md | same | same |
| session/29-linux-build-bench | #29 | ahead 0 | 1 untracked plan 2026-10-18-five-minute-ci-experiments.md | same | same |
| session/cc-reliability-options | none (#11/#7/#10 topic) | ahead 0 | 2 untracked dirs, 199 files: Claude-reliability questions deck WITH Destin's answers (.answers.json) + "claude-mods-tests" investigation (PLAN/RESULTS/LIVE-HISTORY md). Not on master | Destin's answers + results never committed | commit/archive the deck answers and RESULTS.md |
| session/93-list-stream-fix | #170? no card file (commit says "#170 progress") | ahead 0 | 185 dirty: 34 modified perf-lab files (stale base) + untracked. 176 files byte-identical to master, 12 differ (probably older copies, master newer: not individually verified), 3 absent: perf-reports/pathlist-stream/*.json | work merged via other PR; leftovers are stale copies | save the 3 perf-report JSONs if wanted; verify 12 differing |
| session/release-1-3-2 | #28, #29 (work:) | ahead 6, um 6 (pushed) | 4 staged: archive moves of 1.3.1 preflight/verification docs | 1.3.1 release records + close-out.sh/cards-master tweaks never merged; 1.3.1 and 1.3.3 have since shipped (PR #317 release-1-3-3 merged) | release archive docs; check if close-out.sh "verify backups by ancestry" fix is still needed (master's close-out.sh has since changed: 26 diff lines) |

## C. FINISH — land small / finished docs work (7)
| branch | card | state | why open | recommendation detail |
|---|---|---|---|---|
| session/85-windows-131-regressions | #85 merged, #93 | ahead 5, um 3, PR #271 OPEN | docs-only close-out never merged | land PR #271 (archives docs/archive/plans/2026-10-18-windows-131-regressions.md, ABSENT on master) then clean up |
| session/93-session-freezes | #93 merged | ahead 1, um 1, PR #267 OPEN | contains a CODE fix (scripts/perf-lab/hitch-report.mjs "report hitch uncertainty") that master lacks (0 matches) + archive plan | land #267 then clean up |
| session/analytics-phone-wording | #211 (topic) | ahead 1 (pushed), behind 90 | one-line rule fix: master's worker-backend.md still says phones on 1.3.1-1.3.3 "checked in as desktop" (now known wrong: counted as Linux) | land it (tiny, doc-only) |
| session/analytics-day-detail | #211 (topic) | ahead 1, behind 0, committed today 14:52 | adds Destin's 2026-11-08 `/day` geography exception to worker-backend rule; not on master. POSSIBLY ACTIVE | land when its session finishes |
| session/one-branch-per-workstream | none | ahead 1, pushed | CLAUDE.md rule "one workstream = one branch per repo (Destin, 2026-11-01)" is NOT in master's CLAUDE.md | land it - it is a stated Destin rule that master lacks |
| session/sync-slim-history | #98 | ahead 1 (plan doc, pushed) | plan for "slim synced chats (piece 1)", never merged | land plan to docs/active/plans when #98 resumes |
| session/sync-rethink-investigation | #121/#125 (topic) | ahead 1: handoff brief (lost messages, false takeover alarm); pushed | brief for a future session, not landed | land the handoff or start that session |

## D. FINISH — active build/design (6) (several POSSIBLY ACTIVE)
| branch | card | state | notes |
|---|---|---|---|
| session/90-pages-finish | #90 build | ahead 62, um 59; files today 16:43; dirty 8 entries (282 files: plan answers json, runs-*/ screenshots); live deck server processes (pid 409591, 3116783). POSSIBLY ACTIVE | leave alone |
| session/android-ux-test | #213 build (+#57, #96) | ahead 28; dirty 34 entries (474 files, retest screenshots modified/added); files 17:26 today; live deck server + adb. POSSIBLY ACTIVE | leave alone |
| session/mesh-sync-design | none (#64 topic) | ahead 8, 7k lines of design; untracked answers-3 json; deck server running (pid 1439483). POSSIBLY ACTIVE | leave alone; not linked to a card |
| session/test-suite-rethink | none (#13/#15/#16 topic) | ahead 61; files 15:04; running `manage.mjs` pid 3471218. POSSIBLY ACTIVE; untracked questions html + mockup.html | leave alone; not linked to a card |
| session/local-model-hardening | #226 planning | ahead 1 (doc, committed 16:48 today). POSSIBLY ACTIVE | leave alone |
| session/148-harness-performance-lab | #148 planning ("blocked: ledger $9.73 of $10 cap") | ahead 0 (nothing committed on branch), dirty 40 entries = 205 untracked investigation docs (148-*.md etc.) NOT on master and not on any remote. Last file 10-22 | paused on budget; RISK: only copy of 205 files is on this disk. At minimum commit+push (standing authorization) |

## E. ASK DESTIN — 6
| branch | card | state | decision |
|---|---|---|---|
| session/155-google-files | #155 planning, `paused:` by Destin | ahead 1 (136 design/review docs, pushed) | Already waiting on Destin: rclone vs our own Google sign-in. Keep until decided; then archive or resume |
| session/29-ci-fastpaths | #29 | ahead 5, um 4, PR #272 OPEN, 932 behind; scripts/ci-workspace.mjs it edits is not on master at all | Is the "faster card-only CI" experiment wanted? Land (needs rebase) or close PR #272 and drop |
| session/74-specialists-plans | #74 explore | ahead 7 (workflow-builder specs/reviews, pushed, 262 behind) | Is the workflow-builder design a keeper? If yes land the docs as a design record; if not archive |
| session/persona-prompt-eval | none | ahead 5 draft-spec commits + 2 untracked eval-run report dirs (unsaved) | Is the hybrid assistant prompt adopted or dropped? Reports exist only locally |
| session/user-notify | none (#205 only in a commit) | ahead 12, um 12, round-4 answers "approved", plan decided; 137 untracked deck-run images; idle since 10-26 | Approved notify-user design was never built or landed. Build it, or archive the deck |
| session/narrow-screen-proposals | none (#139/#222 topic) | ahead 9, round-4 answers recorded 11-05; 4 untracked live decks | Phone/narrow layout decisions made but not built; does Destin want it built (feeds #213/#225) or archive? |

## F. ABANDON (superseded) — 3
| branch | state | evidence |
|---|---|---|
| session/auto-update-roadmap-20261014 | ahead 1 (roadmap edit; pushed) | ROADMAP.md and docs/roadmap/* no longer exist on master (commit abb06a95b "work cards replace the roadmap"); card #28 merged, #183 merged |
| session/browser-wrapup-20261014 | ahead 1 (workspace-start dependency advice + wrap-up + roadmap) | roadmap gone; workspace-start now auto-provisions node_modules (CLAUDE.md); advice text is obsolete. Only a wrap-ups.md ledger line could be worth saving |
| session/release-1-3-1-dependencies | ahead 1 (workspace dependency provisioning) | the scripts it changes (scripts/workspace-dependencies.mjs) are not on master; superseded by current auto-provisioning. Medium confidence - unverified beyond file absence |

## G. Unregistered / special dirs
- worktrees/sessions/{open-models-docs, readme-rewrite, release-050, scratch}: all four are EMPTY directories (0 bytes, no files, not in `git worktree list`). Safe to remove.
- worktrees/cards-master: detached HEAD at master tip, clean. This is the tool worktree cards.mjs writes through. KEEP; not leftover.

## Patterns
1. Merged-but-never-removed: 20 worktrees (PR merged or zero unique commits).
2. Cards rarely link branches: 28 of 50 have no card in `work:`; many linked ones are only via topic. Mesh, test-rethink, user-notify, narrow-screens, persona-eval, analytics, sync have no linked card.
3. Wrap-up / docs-only branches (85, 93, 29-ci, release-1-3-2, analytics-*, one-branch) sit with open PRs or unmerged because "merge" is only on Destin's word.
4. Design decks reach "approved" and stop (user-notify, narrow-screens, mesh, 74, persona): approved decisions are never built or landed, so docs live only on side branches.
5. Untracked/staged files never committed (11, 148, 163, cc-reliability, 29-*): the only real data-loss risk. Largest: 148 (205 files), cc-reliability (199 files incl Destin's deck answers), 11 (263 files).
