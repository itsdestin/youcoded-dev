---
date: 2026-08-31
status: active
type: review
---

# Open roadmap items — full difficulty ranking

**258 open items** (`- [ ]`) in `ROADMAP.md`, against 150 shipped.
Section split: v1.3 = 3 · v1.3.1 = 15 · Bugs = 111 · Features = 87 · Someday/ideas = 42.

Numbers in `L####` are the ROADMAP.md line the item starts on.

Ordering inside a tier is rough. Tiers are the real signal.

---

## ⚠️ First: four entries are already done (stale roadmap)

Found while spot-checking the "easy" list. Closing these costs nothing and shrinks the count to ~254.

| Entry | Reality |
|---|---|
| L187 "Two doc anchors can never resolve" | Both fixed. `docs/MAP.md` no longer contains `.claude/agents/*.md`; `engine-dependencies.md:237` now carries the `youcoded/` prefix. |
| L944 `curated-defaults.json` points at a dead id | Registry side fixed — the file now reads `wecoded-themes-plugin`. Only the app-side question (prune the dead `theme-builder` string from existing `~/.claude/youcoded-skills.json` favourites) is still open. |
| L214 `conversation-triage.mjs` is not in version control | **Worse than filed — the file is gone.** It is not in git and not on disk. Either re-create it or delete the entry. |
| L211 Workspace CI anchor cron red since 2026-08-16 | Was mostly unmerged-branch noise, and the two named anchors above now resolve. Needs one `node scripts/audit-anchors.mjs` run to confirm, then close or re-scope. |

---

## Tier 0 — fix today, a handful of lines each (18 items)

Each of these is a small, contained edit with a known file and no design question. **Verified against current code today** unless marked.

| # | Item | The change |
|---|---|---|
| 1 | **L18** Terminal Opacity slider floors at 30% where 80% is the real floor | `ThemeScreen.tsx:565` — `min={0.3}` → conditional `min` (0.8 under wallpaper/gradient themes). ✅verified |
| 2 | **L173** `<Button className="hidden …">` never hides | Add a display group to `CONFLICT_GROUPS` in `Button.tsx:113-132` (one regex), then fix the one live caller `LibraryScreen.tsx:176`. ✅verified — no display group exists today |
| 3 | **L184** Audit-staleness reminder has never fired | `.claude/hooks/context-inject.sh:191` — `ls docs/audits/[0-9]*.md \| sort \| tail -1` picks the July *baseline* file. Filter out `scope: baseline`. ✅verified — still picks `2026-07-15-phase3-baseline.md` |
| 4 | **L235** Kotlin `removeProject` is test-only | Delete `CentralIndex.kt:72` + the test that calls it. ✅verified — only caller is `ArtifactStoreTest.kt:129` |
| 5 | **L168** Two concurrent UI-review sweeps deadlock | Widen/probe the CDP port base in `run-review.sh` (or derive from pid). Today's workaround is offsets ≥100 apart. |
| 6 | **L150** Wrangler v3 warns on every invocation | Bump `wecoded-marketplace/worker/package.json:23` `^3.80.0` → `^4`. Deliberately kept separate from the catalog change; that change is now live. ✅verified |
| 7 | **L161** Retire the hand-copied `MEASURED_ROSTER_SPEND_USD = 3.46` | One line: `metadataExtractor: openRouterCostExtractor` in `eval/openrouter-factory.ts`, plus surfacing the summed cost on `run.metrics`. |
| 8 | **L205** Skip-Permissions tooltip promises a safety net that does not exist | `SkipPermissionsInfoTooltip.tsx:42` — copy rewrite only. Measured false against the real CLI. |
| 9 | **L91** `sync-spaces.md` "the ONE sanctioned status-color use" is over-broad | Reword one sentence to scope it to sync status. Your call on wording. |
| 10 | **L93** Should `*.tmp` join sync-spaces `DEFAULT_IGNORES`? | One line if yes. **Decision, not work** — cost is a user file genuinely named `.tmp` stops syncing. |
| 11 | **L1253** Three hand-rolled badges should use the shared `Badge` | `SpecialistsChip.tsx` + `SessionStrip.tsx` (×2) → `components/ui/Badge.tsx`. Mechanical. |
| 12 | **L924** Marketplace comment threads truncate silently at 50 | Return `total` beside `comments`; render "showing the 50 most recent of N". |
| 13 | **L918** Plugin installed mid-session isn't votable until restart | Call `reconcileInstalls()` after a successful install (or report skill ids too). |
| 14 | **L921** Theme installs never reported to the Worker | Step 1 only: have `installTheme()` call `marketplaceApi.install()`. Steps 2–3 are Tier 1. |
| 15 | **L927** A held comment is invisible to its author | Show the held state on the plugin page; the data already ships in `/auth/export`. |
| 16 | **L944** Prune the dead `theme-builder` favourite from existing profiles | Registry already fixed; this is the one-line cleanup pass. |
| 17 | **L598** Nothing detects an artifact repair that over-reclassifies | A counter/log line. `chore`-sized. |
| 18 | **L732** `sendChatMessage` overloads reject a non-literal provider arg | Type-signature widening. |

**Runners-up — small, but bigger than "a handful of lines":** L171 (workbench boot check reports ok against a dead port — needs a real navigation assertion), L451 (resolve the unverified marketplace pre-blur claim — investigation first, then a one-line fix on whichever side is wrong), L1307 (nested brace globs — parser work, and deliberately deferred).

---

## Tier 1 — small: one focused sitting (≈45 items)

Contained, known file, but more than a few lines — or a mechanical sweep across many call sites.

**Docs / tooling hygiene**
- L169 Four knowledge files over word budget, so `/audit` fails every run — **worse than filed today**: artifacts 888/600, chat-reducer 833/600, sync-spaces 799/600, PITFALLS 3118/2500. Prose migration across four subsystems.
- L190 Main `youcoded/` checkout stuck behind (currently 0 — re-verify and close)
- L193 107 unique commits across 12 branches exist on one disk only
- L196 Sweep worktrees for uncommitted work + add a guard
- L782 `native-runtime.md` depth doc is missing all of Phase 2
- L1339 Census pass over `youcoded/desktop/docs/`
- L1371 Review-deck test hygiene (bare `open()`, an 800ms sleep)
- L1369 Workbench serves community theme folders
- L1370 Attach your own screenshot to a review-deck step

**Tests**
- L180 `harness-eval-orchestrator.test.ts` red on master (bisect + one assertion)
- L606 `ipc-handlers.test.ts` flakes at import time
- L845 Intermittent flake in three named suites
- L152 ~100 fixed sleeps stand in for signals
- L549 verify.sh related-tests fail in symlinked-node_modules worktrees (workaround proven)
- L465 `desktop/tests/` (347 files) is neither type-checked nor linted
- L623 `sync-spaces-engine.test.ts` debounce — recurring macOS CI failure
- L737 `PresenceClient.kt` has no JVM test harness

**UI / renderer small**
- L1150 Adopt the `FieldError` primitive — 25 hand-rolled copies (mechanical, 25 sites)
- L477 The `bg-inset` FIELD surface is invisible on `bg-inset` hosts
- L836 "Jump to bottom" overlay collides with other menu layers
- L1367 Session switcher should use the theme's rounding rules
- L136 Provider brand colours unreadable on the four light community themes
- L231 Chat file chips refuse extensions the artifact pane can display (28-entry allowlist + a pinned test to update)
- L457 Resumed native sessions show `Resuming…` until the next turn
- L262 Specialist Activity notes appended at the end rather than interleaved
- L264 `missedSteers` stores unclamped text in a capped ledger file
- L259 Stale `SPECIALIST_RUN_CHANGED` can flip a completed card back to running

**Marketplace / worker**
- L930 Delete your own comment
- L936 Report a comment
- L933 Revisit the low-vote-count card label (one workbench deck answers it)
- L897 Installed prompts are a permanent snapshot, and `update()` lies about it
- L1198 Two theme previews render blank in Electron

**Main / harness**
- L586 Native turn teardown leaves an unhandled promise rejection
- L575 `CLAUDE_DESKTOP_SESSION_ID` leaks into every PTY descendant
- L573 Android `EventBridge` maps session ids with no gate
- L577 Transcript replay has no size ceiling
- L579 Conversation-store title and topic file disagree
- L595 Artifact records escaping the project root with `..` are refused, never repaired
- L671 Artifact sidecar `versions[]` grows unbounded
- L696 Concurrent sidecar creation can clobber a record (CAS off on create)
- L239 Live-vs-rebuilt divergence for whitespace-only empty steps
- L241 Orphaned "Preparing…" card spins until turn end
- L1199 Shared settings register a `SessionStart` hook the app now deletes
- L570 Every `tsc`-emitted file ships inside `app.asar`
- L1350 Local Models panel: render orphaned `.partial` rows
- L717 Verify the mobile keyboard fix on the packaged APK (verification task, needs a device)

---

## Tier 2 — medium: a day to a few days (≈70 items)

Real work with a known shape, no unresolved design question.

**Native runtime / harness**
- L55 Tell the user when a saved permission almost covered a command
- L57 Project-scoped skills in native sessions (plan already written, carries a real cwd bug)
- L1012 Tell the user when context files were truncated
- L1020 Move Write/Edit staleness from mtime to a content hash
- L867 Edit: one-pass tolerance for near-miss `old_string`
- L869 Diagnostics after Edit/Write (Coder preset)
- L871 Bash visible window is 7–12× smaller than every peer
- L864 Background Bash follow-ups
- L873 PDF reading needs a packaged-build smoke test
- L220 A bare Grep/Glob can hang a turn and searches from the wrong root
- L217 Full Auto still asks permission for *reading* outside the project
- L965 Native sessions have no bypass permission mode
- L968 Port CC's `rm`-target analyzer as the permission floor
- L345 A trimmed-for-the-wire image is claimed "already visible" by the dedupe cache
- L409 A resumed session shows tool calls still "running"
- L395 Pasting a bare filepath eaten as a slash command (class still open)
- L292 Thinking-bubble flicker on a very slow native stream (`needs-repro`)
- L850 Timestamp-only assistant bubble (spec + plan already written)
- L995 Git Branch chip missing in native sessions

**Cost / pricing**
- L158 A metadata-only save keeps a session's old last-used model
- L159 Cost self-check dilutes a per-model error across a model swap
- L160 Session-cost chip is systematically low once compaction starts
- L163 Swapping models mid-turn bills the whole turn at the new rate
- L245 Cache efficiency — cloud + local sessions leaving cache hits on the table

**Sync / remote**
- L102 `remote-server.ts` re-implements the saved-folders store inline
- L199 Remote hydrate still corrupts history via `turn-`/`group-` id collisions
- L202 Replayed bubbles stamped with the replay moment
- L233 Phone-originated set-tag/set-note never notifies the desktop renderer
- L558 Sync recency counts loop iterations, not contact with the remote
- L564 A corrupt sync repo that is also offline never heals
- L604 Remote "+ Add file" uploads then fails the import
- L608 Takeover holder can't detect lease loss while the SyncHub is down
- L611 Same-machine takeover handoff without the hub
- L617 `NativeSessionHost` needs a `quiescing` refuse-flag
- L688 Remote first-connect is slow — real bottleneck not fixed
- L714 `isTouchDevice()` returns false on remote browsers
- L677 Sync dead-ends on any machine without `gh`
- L1053 No in-app way to resolve a sync conflict copy

**Android**
- L34 Android never reads `youcoded-skills.json` after first run (**can now be reproduced locally — SDK exists**)
- L312 Android artifact store has neither write queue nor read guard
- L321 Android terminal mode hides the wallpaper for a terminal that no longer exists
- L471 `SessionService.kt` dereferences `bootstrap!!` in ~18 handlers
- L593 Android never receives the artifact-path repair, symptom is silent
- L663 Android `layoutInsets` flow emitted into but never collected
- L768 Android permission-mode chip drops `auto` and guesses `normal`
- L825 Android bare-phrase screen scans can false-fire prompt cards
- L743 Presence: decide what Online means on mobile
- L1226 Android Library doesn't show locally-built themes
- L1234 Android PtyBridge echo-driven submit

**UI / performance**
- L66 App-native hover tooltips (replace browser `title=`)
- L315 Six per-session structures in main never torn down
- L318 A resumed CC conversation re-records its files once per resume
- L600 Opening a session replays its whole transcript and re-records every file
- L435 Buddy chat forces a layout reflow per streamed token
- L437 Perf rig cannot see native per-token streaming
- L440 Perf rig `native-chat` screen is non-deterministic
- L442 Perf rig artifacts drawer is flaky
- L445 Community themes can inject arbitrary `@keyframes`
- L448 Animation frame-budget cost ships to Android/remote unmeasured
- L487 Window-resize lag has a second, unidentified cause
- L493 Audit other repeated `.layer-surface` grids for per-tile blur
- L225 Window-resize black bars — fix committed, never eyeballed
- L228 Installed app holds ~247k inotify watches
- L474 Model favourites are localStorage-only
- L461 Adopt the deferred ESLint rules (79 floating promises, 43 deps hits)
- L172 Decide the app-wide GB convention (needs an inventory first)
- L1161 Folder picker becomes a Select with a recents list
- L1081 Right-click menu — image sub-menu
- L1083 Right-click menu — Android long-press

**Other**
- L87 Git surface: `core.quotePath` paths
- L89 Git surface: rewrite-staleness residual
- L529 Buddy chat's input bar never consults the PTY gate
- L532 `HookRelay` can drop a permission expiry
- L538 Plan-approval buttons send arrows+Enter in one write
- L668 `artifacts:save` bypasses write-guard in both directions
- L762 The app installs plugins into a directory CC owns and re-clones
- L765 Session names revert to "New Session" after a renderer crash
- L784 Theme Update badge has no working action
- L800 Five latent bugs from the tranche-2 input migration (2 remain)
- L818 Pending-prompt clear gaps not covered by #165
- L853 Nothing sequences the `transcript:event` handlers writing artifact state
- L337 `review-harness.mjs`'s API-key scrub doesn't stop the model reading the key
- L326 Slug-repair follow-ups
- L329 Settings → Backup & Sync kills the workbench
- L756 `/theme-builder` never run end to end since the Kit rewrite
- L1214 Custom theme icons: wire `theme.icons[slot]` through
- L1224 Icon override system: wire it or remove it
- L1236 Sign + size-cap the announcement payload
- L1256 Connect 4 not keyboard-playable (board markup rework)
- L1099 HTML preview: chase `url()` refs inside inlined CSS

---

## Tier 3 — large, or needs a design pass first (≈45 items)

The work is understood but multi-day, or the *decision* is unmade.

- L17 Terminal text stops two-thirds across the pane (undiagnosed PTY sizing)
- L164 Chat panel vanished from a live session — **undiagnosed**, you said ignore for now
- L268 Loading a second large local model takes the whole machine down
- L417 Sustained UI sluggishness in real use
- L425 Spikes when editing files / navigating HTML in the artifact viewer
- L432 The transcript mirror is larger than the original and writes back over it
- L856 A dev instance OOMed again (~2.8 GB main) — cause not determined
- L40 Specialist child-transcript GC (blocked on a general delete-conversation feature)
- L70 Misleading error messages — full audit + replacement
- L72 Buddy floater on Linux Wayland — native Wayland attempt
- L73 Landing-page live embed goes fully blurred under framed wallpaper themes
- L74 Chat Search phase 3 — digests
- L496 Transcript storage has no long-term plan
- L504 Permission asks expire after 5 min and wedge the session (built, unmerged)
- L514 Native MCP phase 2 — settings UI, adopt flow, IPC
- L704 ~100 `window.claude` channels not bridged to remote
- L720 Finish the remote-hydration work
- L729 Queued-message polish
- L746 Presence: periodic snapshot reconciliation
- L357 Presence can wedge OFF permanently (spec exists)
- L365 Any 401 silently destroys the local account session
- L900 Put the Worker on a custom domain (also the fix for L939 rate limiting)
- L939 `checkRateLimit` is a no-op in production
- L909 Marketplace: send only what changed
- L912 Marketplace: split card data from detail data
- L915 Marketplace: nothing warns you when an installed plugin becomes unsafe
- L947 WeCoded as a public sub-registry (Layer E)
- L950 Chat Search — session references
- L956 Consolidate Defaults + Permissions + Providers into "Assistant settings" (mockup exists)
- L959 Perf lab + autonomous optimization loop
- L962 Multi-model cwd contract (plan written)
- L971 Finish the harness event log
- L974 Agent memory — chatsearch as a native tool
- L977 Bash containment / OS sandboxing
- L980 Harness eval CI gate + failure taxonomy
- L983 Goal layer
- L986 Formalize the remote protocol
- L989 Workspace guardrails from the 2026-07-28 retrospective
- L992 Dependency upgrade projects — five majors
- L1036 Android toolchain migration (Kotlin 2.4 + AGP 9)
- L1043 Worker test-infra migration (vitest 4 + wrangler 4)
- L1048 Resume-on-startup ("Welcome back")
- L1064 Session-switch motion (draft PR, 1076 behind)
- L1103 Editor tabs — multiple open files
- L1106 Persistent file tree for the artifact pane
- L1112 Git surface phase 2
- L1117 Git surface: profiling checkpoint
- L1120 Go-to-definition without a full LSP
- L1123 "Ask about this" — native reference UX (spec + plan + mockup approved; worktree 27 commits ahead)
- L1171 Whole-UI review pass
- L1207 Buddy floater scene-companion follow physics
- L1210 Backup & Sync popup redesign follow-ups
- L1212 `Onboarding.tsx` first-run screen
- L1228 Android integrations install/connect/uninstall
- L1230 Legacy conversation-index full retirement
- L1232 Android artifact Project View (mobile v2)
- L1238 Accounts Phase 2 deferred follow-ups
- L1240 Remote access system rework
- L1243 Staged AppInner decomposition (tranches 2–4)
- L1246 VM testing flow for first-run install
- L1250 Workbench screenshot rig
- L124 314 Docker MCP listings browsable but not installable
- L127 Ingest ignores `sourceGitRef`
- L132 "What this can do" panel under-reports capable plugins
- L119 `game-forfeit` writes a permanent record on one client's say-so
- L111 Settings says OpenRouter is "Connected" when it has never asked (spec written this week)
- L1269 Rename a conversation
- L1273 Search what was actually said, not just titles/tags
- L1278 Conversation organizing: the rest of the parity gap
- L1285 Android has no session tags and no notes
- L1289 The organizing story is a marketing asset nobody is using

---

## Tier 4 — programs, not items (3)

- **L32 Native Runtime Parity Program** — consolidates 22 prior entries; the single plan is `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md`. Remaining: context truncation → M6 metadata → M6 tiering → M4 leftovers → cwd contract → MCP phase 2 → M7 orchestration → M8 Android → M9 onboarding.
- **L15 Ship v1.3** — gates (3) GitHub sign-in confirmation (yours to answer) and (4) release mechanics (`/audit`, version bumps, CHANGELOG, tag).
- **L68 Android sync + Android-resume fixes**

---

## Tier 5 — Someday / ideas: undesigned (42)

Not ranked — none has a design, and most are one decision away from being a Tier 2/3 item. L1297 sandboxing vs scratch workspace · L1301 six specialist follow-ons · L1304 WebFetch thresholds · L1310 context & knowledge as product surfaces · L1313 run local engine in background · L1316 full LSP · L1319 debugger · L1322 `chrome-style: minimal` · L1328 model-shows-an-image capability · L1334 visual-regression harness · L1336 2026-07-10 review leftovers · L1338 Project View Roadmap tab · L1341 restore-from-backup redesign · L1342 YouCoded Cloud sync transport · L1344 unified synced SystemState · L1346 buddy hotkey · L1348 DiffusionGemma · L1352 xterm scrollback chrome · L1354 PostToolUse `updatedToolOutput` · L1356 CC `/goal` completion · L1358 CC-style agent view · L1360 third-party agent CLIs as providers · L1363 fork-subagent dev toggle · L1365 better switcher animations · plus the small ones already promoted into Tier 0/1 above.

---

## Suggested order if you want a productive afternoon

1. Close the four stale entries (5 min, no code).
2. Tier 0 items 1–4 — all four are single-file, all four verified today, all four ship in one PR.
3. Tier 0 items 11–16 — one marketplace PR.
4. Tier 0 item 9 + 10 — two decisions from you, then one-line edits.

That is ~14 items closed, one desktop PR and one worker/marketplace PR.
