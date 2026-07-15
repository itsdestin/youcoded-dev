# YouCoded Roadmap

Single planning surface for the whole product (app + registries + worker + plugins).
Format: checkbox items with backtick tokens — type (`bug`|`feature`|`idea`, default `feature`),
milestone (`vX.Y.Z`), tags (`#kebab-case`, same vocabulary as custom session tags),
issue link (`repo#N`), `(added YYYY-MM-DD)`. Section headers pass their tokens down;
an item's own tokens win. Unknown tokens degrade to tags. `[x]` = shipped (note the
commit/PR in the detail line) — shipped items collect in ## Shipped.

## v1.3 — sync release

- [ ] Ship v1.3: all master content + desktop-only sync `feature` (added 2026-07-15)
  Gated on sync being entirely complete (incl. Phase 2 conversation sync). Plan 2c (legacy demolition) + the Backup & Sync popup redesign MERGED 2026-07-15 (youcoded PR #126, merge `0a91850e`); Task 10 (dead legacy backup repo `destin-claude-config`) deleted. Remaining gates: two-device dogfood + Connect-GitHub live sign-in, then release. Status: docs/active/handoffs/2026-07-10-sync-completion-handoff.md.

## v1.3.1 — Android + polish `v1.3.1`

- [ ] Android sync + Android-resume fixes `feature` `#android` (added 2026-07-15)
  Port longest-first walkSlugParts, thread resumeSessionId through the bridge + cwd guard, store/basename resolver; Android restore-backend demolition follow-up from Plan 2c.
- [ ] Misleading error messages — full audit + replacement `bug` (added 2026-07-15)
  Per docs/error-message-standards.md; committed as a v1.3.1 followup in CLAUDE.md. Engine sub-fix (cachedir mkdir + stderr drain) already shipped in youcoded PR #123; open scope = workspace-wide audit of every user-facing throw/toast/banner/IPC error string (desktop + Android + worker) + a reusable two-action fallback component. (from knowledge-debt 2026-07-14)

## Bugs

- [ ] ModelPickerPopup `/fast` + `/effort` sends bypass the stray-Enter prompt gate `bug` `#pty-writes` (added 2026-07-09)
  ModelPickerPopup.tsx calls session.sendInput directly (~lines 181/200) without a hasPendingInteraction check, so toggling fast/effort mid-prompt could answer a live Ink menu. Thread a guarded sender like onSelectModel (the `/model` send was already fixed). Small blast radius. (from knowledge-debt)

## Features

- [ ] Backup & Sync popup redesign — follow-up tweaks `feature` `#sync` (added 2026-07-15)
  Redesign SHIPPED in youcoded PR #126 (unified status box with dot·title·sub·toggle derived across off/setting-up/waiting-on-GitHub/error/syncing/synced; Devices·Projects·Conversations count tabs; Additional-backups box with a permanent master toggle + per-backend green/gray/red status lights + cog menu). Deferred tweaks: (1) a real persisted "additional backups enabled" flag — the master toggle currently DERIVES on/off from `backends.some(syncEnabled)` and maps to pause-all/resume-all as a non-destructive proxy; (2) prefetch/cache the Conversations count (session.browse() runs on popup open, so the pill reads 0 for a beat); (3) decide the "Waiting on GitHub" toggle checked-state (currently bound to real `enabled`, reads OFF); (4) surface an error line in the not-enabled + error + GitHub-authed case (currently collapses to plain "off").
- [ ] StatusBar usage chips not fed for native sessions `feature` `#native-runtime` (added 2026-07-13)
  Native turn `usage` reaches the per-turn metadata strip but NOT the StatusBar chips (context/tokens/speed), which buildStatusData() builds from CC-hook files native sessions never write. Add a renderer→main IPC pushing the reducer's turn.usage into main (mirror remote:attention-changed → lastAttentionBySession) and fold into status:data. Natural to land WITH Phase 2 native runtime. youcoded PR #119. (from knowledge-debt)
- [ ] Onboarding.tsx first-run screen `feature` (added 2026-04-12)
  Decomposition v3 §7.12/§9.10 spec a React onboarding screen (name/comfort/output-style + install curated defaults) replacing the conversational setup-wizard as the primary first-run path. Backend helpers (skills:install-many, :apply-output-style, :get-curated-defaults, :get-integration-info) exist and are bridged; the React screen is unbuilt (verified absent 2026-07-15 — App.tsx shows only FirstRunView). Must have a skip button. (from knowledge-debt)
- [ ] Icon override system: wire it or remove it `bug` `#themes` (added 2026-04-12)
  `theme.icons[slot]` manifest overrides load end-to-end but ZERO components consume them (verified 2026-07-15 — every UI icon is hardcoded inline SVG); golden-sunbreak's `send` override is dead data. Either wire each icon component to check theme.icons[slot] (and expand slots), or delete the field from theme-types.ts + manifest schema + theme-builder SKILL.md. (from knowledge-debt)
- [ ] Android Library doesn't show locally-built themes `feature` `#android` (added 2026-04-25)
  Desktop synthesizes local-theme entries (local-theme-synthesizer.ts); Android SessionService.themeMarketplaceList() reads the external registry only, so `~/.claude/wecoded-themes/<slug>/` user themes are invisible in the Library until published. Port the synthesizer to Kotlin (LocalThemeSynthesizer.kt, same fixtures). Also PITFALLS "Theme Marketplace Entries" parity-gap. (from knowledge-debt)
- [ ] Android integrations install/connect/uninstall not implemented `feature` `#android` `youcoded#78` (added 2026-04-28)
  Only integrations:list is wired on Android; Install/Connect/Uninstall hit a not-implemented stub in SessionService.kt. Port integration-installer.ts (plugin-wrapped install via PluginInstaller), OAuth via EncryptedSharedPreferences (start with Google Workspace), then uninstall+status. (from knowledge-debt)
- [ ] Legacy conversation-index full retirement `feature` `#sync` (added 2026-07-15)
  After Plan 2c the index is frozen/read-only (store is authoritative for titles+flags). Full retirement = delete the read path (readIndexMeta, getAllSessionFlags, the CONVERSATION_INDEX_PATH reader, the readTopic index fallback) and the on-disk file, once residual legacy-only rows are confirmed unneeded. PITFALLS "Legacy sync demolition (Plan 2c)". (from knowledge-debt + PITFALLS sweep)
- [ ] Native/local runtime has no Android parity `feature` `#native-runtime` `#android` (added 2026-05-19)
  The native/local provider is desktop-only — Android SessionService.kt has no native provider branch, no engine/Ollama detection, no native:* / local:* handlers. Roughly the size of the original desktop work; out of MVP scope by decision. (from knowledge-debt, opencode-MVP era — the Android-parity gap carries to the native harness)
- [ ] Native (PTY-less) session stuck-detection `feature` `#native-runtime` (added 2026-05-19)
  useAttentionClassifier reads the xterm PTY buffer, which native sessions don't have — a hung native model never trips the "stuck" attention banner. Add a transcript-driven heuristic (isThinking && idle>~90s && !hasRunningTools → attentionState:'stuck'), gated on provider; don't reuse the CC-spinner-specific regex. (from knowledge-debt, carries to native harness)
- [ ] Native session image / multimodal input `feature` `#native-runtime` (added 2026-05-19)
  No UI to attach an image to a native/local prompt — InputBar builds text parts only, so vision-capable local models can't receive images from chat. Add an image picker emitting file-part data + render attached images in the user bubble. (from knowledge-debt, carries to native harness)
- [ ] Android artifact Project View (mobile v2) `feature` `#android` (added 2026-07-15)
  Android artifacts:list-project / :list-all-files / :list-projects-index / :include-external / :exclude / :delete-project / :rename / :remove-record and the project:* channels are `not-implemented-on-mobile` stubs; mobile Project View is v2. PITFALLS "Artifact Viewer". (from PITFALLS sweep)
- [ ] Amendment K2: router hot-reload of `--models-dir` after boot `feature` `#local-models` (added 2026-07-15)
  The engine discovers GGUFs at boot; a model downloaded AFTER boot may not appear in catalogModels() (new-session picker Local group) until an engine restart. Verify router hot-reload on a dev machine, or add a scanGgufCache fallback to the local catalog source. PITFALLS "Phase 1 Plan C". (from PITFALLS sweep)
- [ ] Android PtyBridge echo-driven submit `feature` `#android` `#pty-writes` (added 2026-07-15)
  Android PtyBridge.writeInput still uses the 600ms enter-split for >56-byte sends; desktop moved to echo-driven CR (no timing assumption). Mirror the desktop approach on Android. PITFALLS "PTY Writes → Android". (from PITFALLS sweep)
- [ ] Sign + size-cap the announcement payload `feature` `#security` `#announcements` (added 2026-04-21)
  AnnouncementService fetches announcements.txt over unauthenticated/unsigned HTTPS — a repo/file compromise could push arbitrary banner text to every client, and length is unbounded. Sign with a static committed public key + verify (fail-closed) in both fetchers, cap parsed length (~512 chars) before persisting, document the trust model. Defense-in-depth; no current incident. (from knowledge-debt)
- [ ] Accounts Phase 2 deferred follow-ups `feature` `#accounts` (added 2026-07-09)
  Open, non-blocking: (1) two-person verification never ran — run the spec §7 checklist on a released build post-release (the one real risk); (2) remote browsers can't invoke social:*/account:* request-response channels (remote-server routing); (3) decommission the dead PartyKit lobby room; (4) statusLabel "Last seen" has no ticking timer; (5) extract FriendsScreen/FriendRowMenu from GameLobby.tsx. (from knowledge-debt)
- [ ] Remote access system rework (5 review findings) `feature` `#remote` (added 2026-07-15)
  From the 2026-07-10 full-codebase review: (1) chat:hydrate ID collision corrupts remote chat history (reseed/namespace counters in deserializeChatState); (2) rolling PTY replay buffer does an O(4MB) string copy per chunk with zero clients connected (chunk array + join-at-connect + broadcast early-return); (3) ~14 hand-rolled remote-server pref handlers duplicate ipc-handlers.ts and have 3 live drift bugs (defaults/folders); (4) live/replay ordering gap at connect double-applies events; (5) replayed events stamped Date.now() not transcript time. Full findings + fix shapes: docs/active/handoffs/2026-07-10-remote-access-review-handoff.md. (from master-review handoff)

## Someday / ideas

- [ ] Deferred perf + simplification opportunities from the 2026-07-10 master review `idea` (added 2026-07-15)
  Net-improvement work the review surfaced but deliberately didn't ship: App-root useChatStateMap subscription refactor (biggest re-render win), hidden-xterm WebGL detach, sync-spaces 120s idle-poll backoff, and the big-file decompositions (ipc-handlers.ts ~2,674 lines / SessionService.kt ~2,700 / App.tsx ~2,500 / SettingsPanel.tsx ~2,489) plus small cleanups (buildStatusData dedup, FOLDERS_LIST canonicalize, ConfigForm/ProjectManager dead-code pruning). Full catalog: docs/active/handoffs/2026-07-10-review-followups.md. (from master-review handoff)
- [ ] Project View Roadmap tab — render any project's ROADMAP.md, same discovery pattern as context files `idea` `#project-view` (added 2026-07-15)
- [ ] Rolling ROADMAP cleanup-by-release (archive ## Shipped tail per release) `idea` (added 2026-07-15)
- [ ] Restore-from-backup redesign (removed in Plan 2c; redesign around local-models/accounts/platform) `idea` `#sync` (added 2026-07-15)
- [ ] YouCoded Cloud sync transport (second SyncTransport) `idea` `#sync` (added 2026-07-03)
  Deliberate roadmap commitment: R2 content-addressed chunked storage + client-side E2E encryption + accounts, likely a paid tier ("zero-setup sync, no GitHub needed"). Must slot in below the SyncTransport contract-test seam with no changes above it. Spec §16. (from knowledge-debt)
- [ ] Unified synced SystemState for cross-device hardware/software tracking `idea` `#sync` (added 2026-07-14)
  A per-device `~/YouCoded/Personal/SystemState/<deviceId>.json` (CPU/GPU/RAM/storage, OS, dev-tool versions, local models, ports, integrations, last-seen) synced via Personal space, with an AI-accessible query IPC so Claude can answer "what machines do I have" / "can my laptop run this model." Optional Settings → System View topology dashboard. Speculative; natural to scope after Phase 2c. (from knowledge-debt)
- [ ] Copilot/AI-key hotkey to toggle the buddy floater `idea` `#games` (added 2026-07-14)
  Bind the dedicated Copilot/AI keyboard key (Windows laptops + others) via Electron globalShortcut to open/close the multiplayer games panel. May need Windows-specific keycode detection. (from knowledge-debt)
- [ ] DiffusionGemma support (upstream-gated) `idea` `#local-models` (added 2026-07-13)
  Block-diffusion model the bundled llama-server can't run — llama.cpp support is unmerged PR #24427 and needs a separate llama-diffusion-cli runner, not llama-server. Deliberately excluded from Plan C v1. Revisit only when mainline llama.cpp AND llama-server can serve it; then add a curated-catalog entry (refresh-from-GitHub, no app release) and scope any engine spawn-flag changes. (from knowledge-debt)
- [ ] Surface `.partial` orphans from previous app runs `idea` `#local-models` (added 2026-07-15)
  Model-manager v1 surfaces only THIS-session download partials; a `.partial` orphaned by an app restart isn't listed. Needs a cache-scan-for-`.partial` IPC. PITFALLS "Phase 1 Plan C". (from PITFALLS sweep)
- [ ] xterm scrollback duplicate-chrome mitigation `idea` `#android` (added 2026-05-18)
  CC's full-TUI redraws push duplicate banner chrome into xterm scrollback (PITFALLS "Vendored Termux terminal-emulator"). Two candidate approaches: bump xterm `scrollback` to 5000+ so history coexists with the duplicates, OR set CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 at launch (needs a test-conpty probe — alt-screen also affects getScreenText buffer reads). CC v2.1.120/121 also fixed some scrollback-dup cases upstream; re-verify current behavior first. (from knowledge-debt + PITFALLS sweep)
- [ ] Adopt PostToolUse `updatedToolOutput` for tool-output rewriting `idea` `#hooks` (added 2026-04-29)
  CC v2.1.121 made hookSpecificOutput.updatedToolOutput work for ALL tools (was MCP-only). Bundled hooks (write-guard, hook-relay) could use it to redact secrets/PII or normalize paths at the tool-output boundary. Additive; no current coupling. (from knowledge-debt)
- [ ] Wrap `claude ultrareview` CLI in the youcoded-admin release skill `idea` (added 2026-04-29)
  CC v2.1.120 added a non-interactive `claude ultrareview [target]` (--json, exit 0/1). Wrapping it lets the admin /ultrareview run headlessly in the release pipeline / CI / PR bots. Small effort. (from knowledge-debt)
- [ ] Surface CC `/goal` completion-condition in the YouCoded UI `idea` (added 2026-05-18)
  CC v2.1.139 added /goal (a completion condition Claude works toward across turns with a live elapsed/turns/tokens overlay). Could surface as a status-bar widget/banner atop the existing per-turn-metadata + attention-banner systems. Additive; medium UI effort. (from knowledge-debt)
- [ ] Surface a CC-style agent view / background-session model in the multi-session UI `idea` `#sessions` (added 2026-05-18)
  CC v2.1.139 added "agent view" (`claude agents`) — one list of every CC session. If YouCoded ever wants CC-daemon-managed background sessions, it integrates with the SessionRegistry/SessionStrip model here. Large, speculative. (from knowledge-debt)
- [ ] Developer-mode toggle for CLAUDE_CODE_FORK_SUBAGENT `idea` (added 2026-04-21)
  CC v2.1.117 added CLAUDE_CODE_FORK_SUBAGENT=1 to enable forked subagents on external builds; could become a settings-panel dev toggle. No coupling today; small effort. (from knowledge-debt)
- [ ] install-prereq: probe `bash --version` before assuming /bin/bash `idea` `#install` (added 2026-04-29)
  Residual of a CC-verification item: prerequisite-installer.ts installClaude's POSIX branch assumes /bin/bash exists. The curl→wget fallback (v1.2.4, 8abcdd6d) and dynamic reg.exe path resolution (2026-05-22) are already RESOLVED; only the optional bash probe remains. (from knowledge-debt)

## Shipped
