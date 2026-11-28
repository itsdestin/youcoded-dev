# Triage: workspace remote-only branches, other repos, shared-checkout leftovers (2026-11-08, read-only)

Evidence method: `git log origin/master..origin/<b>`, `git diff --name-only origin/master...origin/<b>` checked against files on origin/master (same path or same filename moved to docs/archive), `grep cards/`, `gh pr view`. ROADMAP.md shows as "missing" on master everywhere because it was retired into cards; ignore that line.
Key fact: youcoded master has NO code for usage-stats, X-ray, or model-picker tags (git grep on desktop/src empty), so those designs never shipped.

## (a) Workspace remote-only branches (no local worktree)

| Branch | What it is (plain) | Card | On master? | Rec |
|---|---|---|---|---|
| design/dev-dashboard (3 commits, 09-05) | Design + 9-task plan for a "dev dashboard" | none (#147 mentions it) | design folder was archived on master (docs/archive/design/2026-09-05-dev-dashboard); plan/MAP row not. Old dashboard since retired (youcoded-admin #23 "retire-old-dashboard") | CLEAN UP |
| rescue/shared-checkout-2026-09-09 (219 files) and -09-11 (192 files) | Emergency snapshots of uncommitted work found in the shared checkout | none | Unknown; they are copies of loose work (e.g. color-test.html, back-to-chat-hint deck, recovered patch files). Likely superseded by later commits but NOT verified file by file | ASK DESTIN (or SALVAGE-THEN-CLEAN: diff against master once, keep anything missing) |
| backup/2026-09-11-model-picker-tags-workspace (8) | Snapshot of the model-picker-tags design docs | #47 (via session/model-picker-tags) | 0/10 files on master; same content as session/model-picker-tags | CLEAN UP after salvaging session/model-picker-tags |
| backup/2026-09-11-resume-preview-hide-header-workspace | Empty snapshot (0 file changes, 0 unmerged patches) | none | nothing to keep | CLEAN UP |
| session/2026-09-11-wrap-up-open-work (1) | Wrap-up hook fix (zsh word-split refusal) | none | The glob-guard hook in use today refuses exactly those shapes, so landed in another form | CLEAN UP |
| session/correctness-batch-sep07 (1) | Close-out docs for a bug batch | none | 12 of 14 files on master (archive); rest is ROADMAP/plan | CLEAN UP |
| session/prerelease-sep07 (1) | One handoff note: "Write tool echo garbling" hypothesis | none | not on master; unverified hypothesis, 2 months old | CLEAN UP (low value) |
| session/files-drawer-honesty (4) | Before/after deck + answers ("all four kept") for honest labels in the Files drawer; rules note | none (#96/#87 mention files) | Code side unknown (youcoded repo not checked); deck + answers not on master | SALVAGE-THEN-CLEAN: confirm the honest-labels code shipped; archive deck |
| session/model-picker-tags (10) | Approved design (chips, sentence case) for speed/cost tags in model picker, plus backend map | #47 (planning) | docs not on master; feature not built | SALVAGE (merge docs or link from card #47) |
| session/sync-safety-audit-20260908 (1, 39 files) | Spec, plans, reviews, approved conflict-copy deck | #121 (planning) | 0/21 on master | SALVAGE |
| session/agent-lint-tooling (2) | verify.sh to tsgo/oxlint; design-check element collector | none | 6/7 files on master; only a review html missing | CLEAN UP |
| session/offline-auth-bypass (1) | Answered deck: offline use, sign-in expiry, startup menu | #216 (phone sign-in expiry) related | 0/3 on master; decisions only exist here | SALVAGE (link to #216) |
| session/onedrive-no-auto-download (1; PR #97 DRAFT, youcoded #476 DRAFT) | Paused OneDrive "don't download cloud-only files without asking" work: design + handoff + known regressions | #93 mentions | 2/21 on master; PR #97 draft since 09-15 | ASK DESTIN: resume or park. If park, merge docs-only PR #97 then close #476 |
| session/theme-plugin-update (3; marketplace twin) | Morning Rounds theme mascot decisions, handoff | #130, #51 related | Mascot archive exists on master (docs/archive/design/2026-09-22-morning-rounds-mascot); 9/19 present | CLEAN UP (marketplace twin: PR #99 landed) |
| session/marketing-ads (1) | Investigation: first Google Search + YouTube ads plan | none | not on master. Loose file docs/active/plans/2026-10-27-google-ads-beginner-experiment.html in root is the follow-on | SALVAGE (keep with the root HTML; ask where ads work lives) |
| session/integrations-research (8) | "Everyday actions" proposal, Destin's answers, integrations research files | #155,#156,#157,#158 | research + proposal not on master (15 files, 6 present) | SALVAGE |
| session/dev-xray-tools (5) | Dev-tools questions + two X-ray review decks answered | none (#17/#147 mention dev tools) | 5/13; feature unbuilt | SALVAGE (file card) |
| backup/performance-stream-attribution-wip (1) | hook-candidate.ts + scratch patch from perf work | #94 (planning) | not on master | ASK DESTIN / SALVAGE: perf card #94 still open |
| session/chatsearch-card-roadmap (1) | Roadmap line: manage a past chat from its search card | none | ROADMAP retired; idea not in cards | SALVAGE as a card then CLEAN UP |
| session/master-plan-20261006 (9; youcoded twin 1) | "Command center" whole-page concepts, 106 files/40k lines, Destin's verdict recorded | none | 5/65 on master | SALVAGE (large; archive docs) or ASK |
| session/plugin-project-controls (32; PR #203 DRAFT, youcoded #571 DRAFT) | Per-project skills/tools: built, accepted, "awaiting merge" per handoff (09-24); 427 files | #75 (polish) | 15/217 on master | FINISH decision: ASK DESTIN (merge now or abandon; card at polish) |
| session/refactor-plans-20260924 (1) | Two phone-record/abilities question decks | none | not on master | SALVAGE then CLEAN UP |
| session/specialists-plans-wrapup (1) | Scripts: ui-review/journey tweaks, a callout lint rule | none | unknown; WIP backup | ASK / CLEAN UP after diff check |
| session/usage-visibility-20260929 (7; youcoded 3) | Usage-stats design, two review decks answered, contract, WIP backup (225 files) | none | 10/21 present; feature unbuilt | SALVAGE (file card) |
| docs/specialists-plans-decisions (60 commits, 506 files) | The decision record for Helper Plans (40 decisions, decks, reviews) | #74 lists it as work | master has only 4 files of that folder; this is the ONLY copy | SALVAGE, do NOT delete. Card #74 plan: bring built branch to master |
| session/linux-update-0920 | 0 commits ahead | none | fully merged | CLEAN UP (delete branch) |

### Open workspace PRs
- #272 (29-ci-fastpaths, 4 unique patches): card-only CI validation. Its logic (ci-workspace card-only) is NOT on master (grep 0). Checks pass. FINISH or ABANDON: ASK (card #29 planning; 932 commits behind).
- #271 (85-windows-131-regressions): docs closing Windows work; archived plan file not on master; checks pass; card #85 already merged. FINISH (merge as docs) or CLEAN UP.
- #267 (93-session-freezes): hitch-report "uncertainty" fix not on master; card #93 merged. FINISH or CLEAN UP.
- #203 DRAFT / #97 DRAFT: see rows above.
- Dependabot #334, #335, #336 (scripts/promo, all checks green): FINISH (merge) when Destin okays.
Pattern: 29/85/93 branches are 930-1030 commits behind; merging needs updating first.

## (b) Other repos

wecoded-marketplace
- master shared checkout: 66 behind, 5 dirty (see c).
- session/90-pages-finish (6 ahead, 4 unique): page-builder 0.5.0/0.6.0 — card #90 (build). FINISH with the app branch.
- session/analytics-day-detail (1): /admin/analytics/day endpoint. No card. Pushed 2026-11-08 (fresh). FINISH (active).
- session/analytics-phone-wording (1, also youcoded-admin twin): corrects wording that phones on 1.3.1-1.3.3 count as Linux. Not on master. No card; the original shipped in PR #113 (card #211 merged). FINISH (small) or CLEAN UP if wording judged unimportant.
- session/android-ux-test (1): hosts Connect 4/Chess relay rooms in the worker (relay-room.ts, wrangler change). NOT on master. Needs deploy thinking (worker). Cards #213/#57/#96 tied to the branch. SALVAGE/FINISH: ASK.
- session/theme-plugin-update (3): version-bump CI check -> already on master as PR #99 (61a5d46). CLEAN UP.
- Worktrees with 0 unique patches (safe to remove): analytics-proposals (card #211 merged), release-1-3-2, security-apparatus, ui-consistency-audit.
- Dependabot: #119 (worker minor/patch, MERGEABLE, all green) merge-ready; #115 (golang x/crypto 0.52, bundled-version-bump FAILED) needs a plugin version bump; #89 (vitest 5.0.0, 09-10, CONFLICTING, tests FAILING) CLEAN UP/close or fix.
wecoded-themes
- main: 4 behind, clean. release-1-3-2 and security-apparatus worktrees: 0 unique patches, clean. Dependabot #39 (playwright 1.64.1): only CodeQL (neutral), no real test run; mergeability UNKNOWN; opened 10-15. ASK/merge.
youcoded-admin
- master clean. session/analytics-phone-wording (1): same wording fix. session/test-suite-rethink (1): release gate "real-app walk-through before go/no-go" (3 files); not on master; tied to the test-suite-rethink workstream (no card). FINISH with that workstream. Worktrees analytics-proposals, release-1-3-2: 0 unique, clean.

## (c) Uncommitted/loose items

wecoded-marketplace shared checkout (5 modified theme-builder files: SKILL.md, kit-presets.json, manifest-template.jsonc, sync-check.cjs, theme-preview.css; edited 2026-09-21 01:05-01:10):
- First four are byte-identical to commit 1121ed2 "offer the Minimalist chrome style" (2026-09-24), which is on origin/master. Already upstream.
- theme-preview.css is an EARLIER draft of the same block; master has the later approved version ("matches the approved look, not the first draft"). Master is the superset.
- Rec: CLEAN UP (discard local edits, then fast-forward) after Destin okay. Nothing to salvage.

Workspace root /home/destin/youcoded-dev (all untracked unless noted):
- flappy-bird.html (MODIFIED, tracked): committed once by accident in a 2026-07-28 sweep; working copy is a 625-line mobile rewrite dated 2026-09-11. A game, not YouCoded. ~/flappy-bird/index.html (2026-08-11) also exists. Rec: ASK DESTIN: move to ~/flappy-bird (or delete) and `git rm` from the workspace.
- "Untitled document/spreadsheet/presentation" files (10, dated 2026-10-05 to 10-23, made by Google-Docs-style tools): empty templates 1.5-4.6 KB (docs 4,5,7; both xlsx; pptx) and larger ones: "Untitled document 3" (27.8 KB, begins as a personal statement about government), "Untitled document 6" (gibberish test text), "Untitled document" (25 KB, text empty), "Untitled document 2" (27 KB, near-copy of the essay: differs from it). Not YouCoded. Rec: ASK DESTIN, move to ~/Documents. Empty ones are CLEAN UP.
- "anthropic govt affairs lead why anthropic essay.docx" (27,012 B, 2026-10-05 18:12): personal; contents not opened. Related drafts exist in ~ (anthropic-why-working-draft.md). Rec: MOVE to ~/Documents (not delete). Do not commit.
- docs/active/design/2026-10-03-buddy-tray-toggle/ (416 KB): only two before-screenshots (runs/before/settings/buddy/*.png), no deck or notes. Card #210 (buddy tray icon, explore) covers the topic; design archived at docs/archive/design/2026-10-02-buddy-tray. Rec: SALVAGE under card #210 or CLEAN UP.
- docs/active/plans/2026-10-27-google-ads-beginner-experiment.html (23 KB, 2026-10-27): "Google Ads, round 1" plan page. No card; session/marketing-ads has the earlier investigation. Rec: ASK DESTIN: is ads work YouCoded work? If yes, card + commit with the investigation; if not, move out (CLAUDE.md: marketing for the app is OK; confirm).
- docs/active/prototypes/landing-redesign-mockups/ (141 MB, 178 files, 2026-08-30..09-03): leftover. The tracked copy was archived 2026-10-16 (31b22187a, docs/archive/prototypes/landing-redesign-mockups, 51 files). The untracked remainder is the gitignored screenshots (140 MB), mockups, __pycache__. Rec: CLEAN UP (delete: archive holds the sources, screenshots regenerable) after Destin okay.

## Patterns
1. About 12 of 26 remote-only branches are one-commit "backup/WIP before removing local copy" snapshots or design-doc-only branches; deleting them loses answered review decks unless merged first.
2. Approved-but-unbuilt designs with NO card: usage-stats, X-ray/dev tools, offline+sign-in, sync-safety (has #121), command center, phone abilities, ads. Cards would prevent the loss.
3. Old PR branches (#267/#271/#272) are 900+ commits behind and stale.
4. Shared checkout dirt is from stale pre-merge drafts; master already has the final version.
