# The 114 source-text test files, classified — data for Plan B

Generated 2026-09-16 by three read-only classifiers over section 3 of `2026-09-16-test-inventory.md`
(regenerate that list with `node scripts/test-inventory.mjs`; this classification is a snapshot).
Paths are under `youcoded/desktop/`. Columns: file · what it asserts · class · disposition · rule
or tool · cases that read source / total cases.

Classes: **A** JSX/className shape across renderer files · **B** exact implementation line pinned ·
**C** import present/absent · **D** forbidden API inside a named function body · **E** cross-file
parity · **F** hand-parsed config · **G** CSS↔TSX coupling · **H** non-vacuity budget · **M** mixed
with real behaviour tests · **X** not a source-text test at all.

## Group 0 — not source-text tests (false positives of the search). No work. 14 files.

| `tests/attention-classifier-parity.test.ts` | Runs classifyBuffer against shared JSON fixtures | X | keep | — | 0/1 |
| `tests/buddy-zoom.test.ts` | Transpiles preload.ts and executes it in a VM | X | keep | — | 0/2 |
| `tests/chatgpt-cache-summary.test.ts` | Executes the real summary script over real JSONL | X | keep | — | 0/2 |
| `tests/chatsearch-fixtures.test.ts` | Runs real parser over .jsonl gallery fixtures | X | keep | — | 0/3 |
| `tests/keychain-helper.test.ts` | Transpiles and executes helper in a vm; behaviour test | X | keep | — | 0/3 |
| `tests/kwin-helper.test.ts` | Loads shipped KWin script into VM; acorn-parses for ES5 | X | keep | — | 0/53 |
| `tests/pty-worker-writes.test.ts` | Evaluates real pty-worker.js with fakes; counts actual writes | X | keep | — | 0/9 |
| `tests/release-manifest-roundtrip.test.ts` | Extracts release key from source, then verifies signatures for real | X | keep | — | 0/5 |
| `tests/sanitize-rig-svg.test.tsx` | Sanitizer run over SVG fixtures and shipped drawings | X | keep | — | 0/12 |
| `tests/secret-storage-wiring.test.ts` | Transpiles secret-storage.ts and runs it with fake deps | X | keep | — | 0/1 |
| `tests/syntax-colors.test.ts` | Contrast sweep over theme JSON via the real function | X | keep | — | 0/2 |
| `tests/update-release-status.test.ts` | Release/manifest behaviour; duplicates names as literals only | X | keep | — | 0/6 |
| `tests/verify-mac-signature.test.ts` | Spawns the real signing-check script against stub codesign | X | keep | — | 0/6 |
| `tests/workbench-fixture-actions.test.ts` | Parses workbench fixture JSONL data files, not app source | X | keep | — | 0/12 |

## Group 1 — hand-parsed config: use a real parser. 3 files.

| `tests/installer-artifact-names.test.ts` | Hand-parses electron-builder.yml artifactName patterns | F | yaml-parse | — | 4/4 |
| `tests/app-icons.test.ts` | electron-builder.yml keys hand-parsed; theme icon fallback line pinned | F, B | yaml-parse | — | 1/5 (+5 it.each YAML) |
| `tests/android-manifest-voice.test.ts` | RECORD_AUDIO and RecognitionService strings present in manifest | F | yaml-parse (parse the XML, assert nodes) | — | 2/2 |

## Group 2 — pure implementation pins with no behaviour value: delete. 4 files.

| `tests/remote-place-app-wiring.test.ts` | Fourteen exact App.tsx regexes for remote session selection | B | delete | replace with a remote-mode render test | 14/14 |
| `tests/landing-demo-fade.test.ts` | Pins exact JS/CSS substrings inside docs/index.html | B | delete | — | 2/2 |
| `tests/remote-preview-gate.test.ts` | Pins exact SettingsPanel ternary substrings for Info gating | B | delete | — | 1/1 |
| `tests/remote-tailnet-bind.test.ts` | Pins listen() call shape and two error-message literals | B | delete (replace with a real bind/listen test) | — | 3/3 |

## Group 3 — whole file is one shape rule: replace with an ast-grep rule, delete the file. 19 files.

| `tests/html-view-sealed.test.ts` | iframe sandbox never gains allow-same-origin | A | ast-grep | `iframe-sandbox-no-allow-same-origin` | 1/1 |
| `tests/app-quit-routes.test.ts` | main.ts registers three quit routes and one idempotent teardown | B, D | ast-grep | `main-registers-all-quit-routes` | 2/2 |
| `tests/app-resume-session-listener.test.ts` | App.tsx resume listener guards detail, exact arg list | B, D | ast-grep | `resume-listener-guards-detail-before-call` | 4/4 |
| `tests/appearance-buddy-broadcast.test.ts` | APPEARANCE_BROADCAST handler body must reach all windows | D | ast-grep | `appearance-broadcast-reaches-all-windows` | 1/1 |
| `tests/background-layer-authority.test.ts` | No class string sets two unprefixed bg-* utilities | A, H | ast-grep | `no-two-bare-bg-utilities` | 1/3 |
| `tests/choice-group-authority.test.ts` | Retired segmented-control class fragments absent; SegmentedTabs has consumers | A, H | ast-grep | `no-hand-rolled-segmented-control` (+ `.ts` twin) — the consumer-count case is kept as text (cross-file existence count ast-grep cannot express; review of batch A, 2026-09-16, restored its original >=4 threshold and title) | 2/2 |
| `tests/dialog-chrome-authority.test.ts` | No view paints its own dialog header or back chevron | A | ast-grep | `no-hand-rolled-dialog-header` | 4/4 |
| `tests/field-error-adoption.test.ts` | Hand-written `text-2xs text-destructive-fg` markup, with counted exemptions | A | ast-grep | `no-hand-rolled-field-error` | 3/3 |
| `tests/item-list-authority.test.ts` | No bare ✕ glyph as a list-item action across renderer | A, H | ast-grep (keep the non-vacuity case) | `no-bare-glyph-item-action` | 4/4 |
| `tests/main-hot-path-no-sync-fs.test.ts` | No fs.*Sync inside named main-process hot functions | D | ast-grep | `no-sync-fs-in-main-hot-path` | 3/3 |
| `tests/main-read-path-no-sync-fs.test.ts` | No `fs.*Sync` inside four named read-path functions | D | ast-grep | `no-sync-fs-in-main-read-path` | 4/4 |
| `tests/menu-row-reachability.test.ts` | Props present/absent inside sliced component function bodies | D, B | ast-grep | `shortcuts-dialog-keeps-scroll-body` | 7/7 |
| `tests/overlay-layer-authority.test.ts` | No hardcoded z-index band, no hand-rolled bg-black scrim | A | ast-grep | `no-hardcoded-z-index-or-scrim` | 5/5 |
| `tests/perf-marks-renderer.test.ts` | performance.mark literals exist, ordered, near session.list() | B, D | ast-grep | `perf-mark-sessions-listed-inside-session-list` | 3/3 |
| `tests/permission-shell-context.test.ts` | decidePermission receives the powershell shell flag | B, D | ast-grep | `decide-permission-passes-powershell-flag` | 3/3 |
| `tests/section-label-authority.test.ts` | Every section label spells the canonical class set identically | A, H | ast-grep (keep the non-vacuity case) | `section-label-canonical-classes` | 3/3 |
| `tests/tooltip-adoption.test.ts` | Tooltip wraps only forwarding elements and owns the list key | A, H | ast-grep (keep the non-vacuity case) | `tooltip-wraps-forwarding-element` | 4/4 |
| `tests/type-scale-authority.test.ts` | Named size tokens declared; no arbitrary `text-[Npx]` anywhere | A, G | ast-grep | `no-arbitrary-text-size` | 2/2 |
| `tests/view-switch-stays-local.test.ts` | App never broadcasts or applies switch-view | C, B | ast-grep | `app-no-switch-view-broadcast` | 2/2 |

## Group 4 — mixed files: keep the behaviour cases, convert or delete the source-reading cases. 55 files.

A rule id in column 5 means "that case becomes this ast-grep rule"; `eslint …`/`tsc` means that tool
carries it; `—` means the source-reading case is deleted outright (nothing else needs it).

| `tests/accepted-history-privacy.test.ts` | Ciphertext sentinel absent from every reader; one file names private dir | M, D | split (keep the driven-session sentinel sweep) | `private-continuation-dir-single-owner` (+ `-tsx`, `-present`, `-devtools`; review of t6a 2026-09-16: widened to every src/ .ts/.tsx token spelling the name, owner presence branch added) | 1/1 |
| `tests/animation-frame-budget.test.ts` | CSS/inline animations carry steps(), no unbudgeted infinite; SessionStrip motion vocabulary | A, G | CORRECTION (t6a, 2026-09-16): the file held three blocks — "perpetual animations are frame-budgeted" (15 cases, moved to tests/animation-css-budget.test.ts), "motion vocabulary" (25 cases: easing/duration tokens in globals.css plus SessionStrip drag/hover/label pins) and "the microphone budgets every frame it presents" (5 cases — this IS frame-budget: 3 globals.css steps() pins + 2 VoiceButton inline-ring pins). REVIEW FIX (t6a, 2026-09-16): every component-side (.tsx/.ts) pin converted — 22 ast-grep rules (the session-strip-* family, index-no-arrival-scaffold, chatview-arrival-only-on-incoming, pill-label-reveals-with-motion-tokens, voice-button-level-ring-stepped) + no-unstepped-infinite-animation for the two sweeps; 17 cases deleted as converted, 4 trimmed to their stylesheet half. Kept as text: the stylesheet cases (CSS is not an ast-grep language in this rule set) and, in "lays the name out once and fades what does not fit", the LABEL_TAIL_PX read — its number is read from pill-label-style.ts at run time and looked for in globals.css, a cross-file comparison no single-file rule makes. animation-css-budget.test.ts: 2 inline-animation pins deleted (covered by no-unstepped-infinite-animation), 4 converted, 2 trimmed; its 7 remaining cases read stylesheets only | `no-unstepped-infinite-animation` + 22 per-case rules (animation-frame-budget) + 7 (animation-css-budget) | 45/45 (2 sweeps → rule; 13 moved, of which 6 converted/deleted and 7 CSS kept; 30 left in place, of which 17 converted, 4 trimmed, 9 CSS kept) |
| `tests/arcade-authority.test.ts` | Game files avoid attention APIs, palette classes, shared state | M, D, A | CORRECTION (t6a, 2026-09-16): 13 source-reading cases of 17 `it(` sites (the assistant-finishing rule is 1 site × 5). REVIEW FIX (t6a, 2026-09-16): every single-file pin converted — attention APIs (any reference shape), state.play ownership, shared-state vocabulary bans + presence, the four challenge-wiring links, ChatView's `[data-game-keys]` yield, arcade-handlers' no-ranking/formatting ban, and the stop-play effect's `[openGame]` deps (which also covers "the width helper is not in that effect"). 2 Class-H self-tests deleted earlier. Kept as text, each with a one-line WHY: the palette ban (its allowlist is read from globals.css at run time), the main-process GAME_WORDS ban (the list is built from the registry at run time), "a game that claims the arrow keys marks itself" (at least one of several files — a cross-file count) and the count half of "setPlaying(false) lives in an effect that depends on openGame alone" (exactly one such effect). The 4 registry-shape cases are behaviour | `arcade-no-forbidden-attention-apis`(-ts), `arcade-state-play-only-in-own-board`(-ts), `arcade-shared-state-no-connect4-vocabulary`, `arcade-shared-state-has-seat-vocabulary`, `arcade-challenge-game-{in-presence-hook,in-reducer,in-lobby,not-hardcoded}`, `chatview-yields-keys-to-game-board`, `arcade-handlers-no-ranking-or-formatting`, `arcade-stop-play-keyed-on-open-game` | 13/17 (11 converted or deleted, 1 trimmed to a count, 3 cross-file/runtime kept) |
| `tests/attention-banner.test.tsx` | Renders banner states; one case greps ChatView provider prop | M | split (render cases stay) | `chatview-passes-provider-to-attentionbanner` (review of t6a 2026-09-16: also the open/close tag, plus a whole-file branch when ChatView renders no banner) | 1/14 |
| `tests/auto-title-contract.test.ts` | Desktop/Android title hooks identical; pins many exact bash lines | E, B | split (keep the message-block parity case) | — | 8/8 |
| `tests/buddy-caption-channel.test.ts` | Window-move and setTitle calls occur only inside place() | M, D | CORRECTION (t6a, 2026-09-16): 4 cases read source, not 3. 2 ("no window-moving API is called outside place()", "setTitle is called in exactly one place, inside place()") converted to the named rule; the other 2 ("nine write sites and three creation sites", "windows built in exactly one place, inside create()") are exact call-COUNT assertions ast-grep's violation model can't express (a legitimate call being silently deleted isn't a "match", so nothing fires) — kept as text reads | `buddy-window-move-only-in-place` | 4/22 |
| `tests/buddy-consent-gate.test.ts` | Gate logic unit tests; six grep main.ts BUDDY_SHOW wiring | M | split (gate/cache cases stay). REVIEW FIX (t6a, 2026-09-16): all six main.ts cases gone — five converted (the refusal-before-show ORDER, the cache-only drag dependency, the conditional work-area resolver, the three debounced display events, and the handler's buddyManager.show() presence); the handler-brevity half of "found the show handler" only proved the old text slice was the handler, so it was deleted with the slice | `buddy-show-consults-refusal-gate`, `buddy-show-refuses-before-creating`, `buddy-drag-reads-cached-helper-status`, `buddy-work-area-only-where-needed`, `buddy-work-area-reresolved-on-display-change` | 6/20 |
| `tests/callout-authority.test.tsx` | Renders Callout; three count hand-rolled tinted blocks | M, A | CORRECTION (t6a, 2026-09-16): total is 8 `it(` sites, not 7 (5 render + 3 adoption). Of the 3 adoption cases: "this guard can see what it claims to cover" (Class H non-vacuity, deleted — the fixture pass now proves it) + "no in-scope file grows a new hand-rolled callout" (converted to the named rule) + "every exemption still exists and still applies" (kept — an exact per-file COUNT check `ignores:` can't express, same as field-error-adoption's precedent; now read through readSource). REVIEW FIX (t6a, 2026-09-16): the rule also catches a tint and a border split across one className attribute or mergeClasses call; its note now says plainly that the retired 150-character window also counted neighbouring attributes/elements, which the rule (one class string / one attribute) does not | `no-hand-rolled-callout-tint` | 2/8 converted-or-deleted; 6/8 kept (5 render + 1 exact-count exemption) |
| `tests/chatgpt-oauth.test.ts` | chatgpt-types.ts has no toLocaleString; StatusBar imports formatTime12 | M, C | split (keep OAuth/limit behaviour) | eslint `no-restricted-properties` + tsc — corrected in u1 (2026-09-16): lint is oxlint now (`.oxlintrc.json`, same rule); the import half became ast-grep `limit-sentence-uses-shared-time-format` + `status-bar-uses-shared-format-time12`, because tsc accepts a local re-implementation with the import deleted (the old `not.toMatch(/function formatTime12/)`) | 1/29 (29 sites, not 28; the one case is half behaviour — its source half is removed, the case stays) |
| `tests/close-prompt-meta-unreadable.test.tsx` | Renders prompt; two slice get-meta handlers for `unreadable` | M, D | split (render cases stay) | `get-meta-marks-failed-read-unreadable` (+ `-remote` twin: the two hosts are different shapes, one per file — u1, 2026-09-16) | 2/5 |
| `tests/create-session-feedback.test.ts` | Pins many exact App.tsx lines for first-run/start flow | M (B) | split (keep `showFirstRunWelcome` unit cases, drop App pins) | — | 7/11 |
| `tests/dev-load-recovery.test.tsx` | main.ts uses shared MOUNT_PROBE_JS rather than an inline copy | M, C | split (keep the two jsdom probe cases) | tsc (import presence) — corrected in u1 (2026-09-16): ast-grep `main-uses-shared-mount-probe`, because tsc accepts both evasions the case forbade (a same-name local `const MOUNT_PROBE_JS` with the import deleted — typecheck passed on exactly that inversion — and an inline-string call with the import left unused) | 1/3 |
| `tests/dialog-shell.test.tsx` | Renders Dialog; also scans renderer for hand-rolled OverlayPanel | M (A) | split (keep render+width cases) | `no-hand-rolled-dialog-shell` | 3/12 |
| `tests/explainer-shell.test.tsx` | Renders explainer; two scan hosts for chrome props/onBack | M, A | split (render cases stay) | `explainer-hosts-pass-onback-showinfo` | 2/5 |
| `tests/filter-chip.test.tsx` | MarketplaceFilterBar/CommandDrawer carry no local chip recipe | M, A | split (keep the three render cases — CORRECTION u2 2026-09-16: FOUR render cases, the MarketplaceFilterBar "draws no pick-any chips" render is one too) | `no-local-filter-chip-recipe` (+ `-command-drawer` twin) | 2/6 |
| `tests/filter-menu-chip.test.tsx` | Renders chips; three grep ResumeBrowser for shared primitives | M, A | split (render cases stay) | `resume-browser-uses-shared-filter-chips` | 3/9 |
| `tests/folders-service.test.ts` | Real service behaviour, plus two transports-call-the-service greps | M (C) | split (keep service cases) | `no-folders-json-outside-service` | 2/7 |
| `tests/primitive-adoption.test.ts` | ui/ primitives adopted; no hand-rolled toast or black/white wash | A, G | split (keep CSS coupling) | `no-hand-rolled-toast`, `no-literal-black-white-wash` | 5/5 |
| `tests/project-view-files-tab-stays-mounted.test.tsx` | ProjectView passes `hidden` instead of conditionally mounting FilesTab | M, A | split (keep the jsdom no-refetch case) | `filestab-mounted-with-hidden-prop` | 1/2 |
| `tests/project-watcher.test.ts` | Watcher behaviour; one pins SKIP_DIRS set parity | M, E | split (parity case stays) | — | 1/14 |
| `tests/prompt-assembly.test.ts` | Real prompt assembly; one case greps that assembleSystemPrompt joins parts | M (B) | split (keep 27 behaviour cases; delete the source pin) | — | 1/28 |
| `tests/read-pdf.test.ts` | PDF extraction behaviour; one bans path.sep in one function | M, D | split (ast-grep that case) | `pdfjs-asset-dirs-no-path-sep` | 1/17 |
| `tests/remote-appearance-relay.test.ts` | Server relay behaviour; two grep main.ts appearance wiring | M, B | split (server cases stay) | `appearance-broadcast-relays-to-remote` | 2/4 |
| `tests/remote-download.test.ts` | Download route dispatched before static handler and Vite proxy | M, B | split (keep the HTTP behaviour suite) | `download-route-before-static` | 1/31 |
| `tests/remote-host-admin-desktop-only.test.ts` | Admin channels refused; greps server cases and Unpair props | M, B | split (responseOutcome cases stay) | `remote-admin-case-refuses` | 2/4 |
| `tests/remote-page-source.test.ts` | main.ts passes exact serveBuiltPage expression | M, B | split (keep the three pure-function cases) | — | 1/4 |
| `tests/remote-rate-limit.test.ts` | Socket-budget behaviour; three grep server for absent idioms | M, B | split (socket-driving cases stay) | `no-ip-keyed-failure-bucket` | 3/5 |
| `tests/remote-readiness.test.ts` | Real WS hydrate/replay tests; one greps fallback timer constants | M (B) | split (keep the 13 WS behaviour cases) | — | 1/14 |
| `tests/remote-reconnect-reloads.test.tsx` | App.tsx contains two exact reconnect-wiring lines | M, B | split (keep the nine hook behaviour cases) | — | 1/10 |
| `tests/remote-shim-permission-inflight.test.ts` | Real shim in-flight test; one pins an App.tsx line | M (B) | split (keep shim case, delete App pin) | — | 1/2 |
| `tests/resume-browser-organize.test.tsx` | Card behaviour; one derives classNames from SessionDrawer source | M, G | split (interaction cases stay) | — | 1/10 |
| `tests/run-over-card.test.tsx` | Renders RunOverCard; also scans game files and ArcadeShell text | M (A, D) | split (keep render cases) | `solo-game-uses-run-over-card` | 4/12 |
| `tests/runtime-default.test.tsx` | One file owns the storage key; forms init from defaultRuntime() | M, D | split (keep the four defaultRuntime unit cases) | `runtime-default-key-single-owner` | 2/6 |
| `tests/session-drag-model.test.ts` | Model unit tests; three assert preload lacks drag decisions | M, C | split (model cases stay) | `preload-no-drag-model-decision` | 3/10 |
| `tests/session-drawer-skips-parent-rerenders.test.tsx` | Render-count test plus App.tsx useMemo/provider-value pin | M (B) | split (keep re-render case) | `artifact-provider-value-memoized` | 1/2 |
| `tests/session-meta-unreadable.test.tsx` | SessionDrawer guards note editor on previewMeta.unreadable | M, D | split (keep the four hook cases) | `note-editor-guarded-on-unreadable` | 1/5 |
| `tests/setting-row-authority.test.tsx` | Renders SettingRow; scans for retired row recipes, stray Toggles | M (A) | split (keep 8 render cases) | `no-hand-rolled-setting-row` | 5/13 |
| `tests/shell-session.test.ts` | Shell spawn behaviour; four grep main files for call shapes | M, B | split (spawn/validator cases stay) | `run-in-terminal-chunked-write` | 4/27 |
| `tests/shell-session-renderer.test.ts` | App.tsx/HeaderBar contain exact shell-session gating expressions | M, B, D | split (keep label/chip/pty-gate/slash-routing cases) | `shell-session-view-forced` | 13/22 |
| `tests/sound-preview.test.ts` | Select handler calls playPreview right after setSelectedPresetId | M, B | split (keep the STOCK_PRESETS desc case) | `select-preset-calls-playpreview` | 1/2 |
| `tests/specialist-delegation-ledger.test.ts` | Ledger behaviour; one counts mutateJson calls in source | M, D | split (ast-grep that case) | `ledger-single-mutatejson-call` | 1/34 |
| `tests/status-strip-authority.test.tsx` | Renders StatusStrip; scans centred status lines, hardcoded error fallbacks | M (A) | split (keep 4 render cases) | `no-hardcoded-error-fallback` | 5/9 |
| `tests/statusline-rate-limits.test.ts` | Shipped hook scripts never name credentials/bearer; Android copy identical | M, E | split (keep parity + cache-contract behaviour) | — | 4/14 |
| `tests/tag-list-host.test.ts` | Service behaviour plus two handler-body greps for empty-list fallback | M (D) | split (keep 3 behaviour cases) | `tags-list-no-empty-fallback` | 2/5 |
| `tests/tag-picker-unreadable.test.tsx` | ResumeBrowser checks registry.error before "No tags yet" | M, D | split (keep the two TagPicker render cases) | `tag-empty-state-guarded-on-error` | 1/3 |
| `tests/terminal-view-workbench-screen.test.tsx` | Terminal surface behaviour; one reads globals.css viewport rule | M, G | split (CSS case stays) | — | 1/17 |
| `tests/theme-protocol-cors.test.ts` | Protocol handler behaviour; one vm-evals main.ts registration | M | split (handler cases stay) | — | 1/4 |
| `tests/unselectable-chrome.test.ts` | @layer base select rules plus select-none className pins per file | G, A | split (keep the CSS cases) | `chrome-root-select-none` | 5/5 |
| `tests/useVoiceInput.test.ts` | Real voice-hook tests; two grep for isWorkbenchDocument/VITE_WORKBENCH | M (C, D) | split (keep 23 behaviour cases) | eslint `no-restricted-syntax` | 2/25 |
| `tests/voice-assets.test.ts` | Real install tests; two grep voice-assets.ts for child_process | M (C) | split (keep 15 install cases) | eslint `no-restricted-imports` | 2/17 |
| `tests/voice-rehear.test.ts` | voice-worker imports shared splitter, keeps no local copy | M, C | split (keep the VAD/rehear behaviour) | tsc + eslint `no-restricted-syntax` | 1/32 |
| `tests/welcome-bare-header.test.tsx` | Renders bare header; three pin App/HeaderBar source ordering | M, B | split (render cases stay) | — | 3/11 |
| `tests/workbench-mock-contract.test.ts` | Mock channels exist in preload/remote-shim; voice fake behaviour | M, E | split (channel parity stays) | — | 6/14 |
| `tests/shim-parity.test.ts` | preload session/on method names must exist in remote-shim | E | tsc | shared interface both bridges implement | 4/4 |

## Group 5 — keep: parity, CSS coupling, non-vacuity, and pins nothing else can express. 19 files.

These stay as text reads. The only change: every read goes through `readSource()` /
`readStripped()` in `tests/helpers/guard-scope.ts`, which strip `\r` (Plan B Task 2).

| `tests/ipc-channels.test.ts` | Channel strings must appear in preload/types/shim/handlers/Kotlin | E | keep | — | ~171/171 |
| `tests/remote-channel-parity.test.ts` | Shim-invoked channels must have a host case | E | keep | — | 7/7 |
| `tests/remote-message-kinds.test.ts` | Fired channels all classified; shim/preload `canSend` pins | E, B | keep | — | 5/5 |
| `tests/remote-rehydrate-channel.test.ts` | Channel constant/member parity across preload, types, shim | E, C | keep | — | 5/5 |
| `tests/session-selected-channel.test.ts` | session:selected present in both IPC maps and all surfaces | E, C | keep | — | 5/5 |
| `tests/transcript-event-surface-parity.test.ts` | App vs BubbleFeed handle same transcript case labels | E | keep | — | 5/5 |
| `tests/bundled-plugins-parity.test.ts` | Kotlin BundledPlugins.kt ids match TS list, same order | E | keep | — | 5/5 |
| `tests/claude-code-mcp-parity.test.ts` | Embedded MCP server byte-identical to Android asset; ids agree | E | keep | — | 4/4 |
| `tests/workbench-event-contract.test.ts` | Workbench-dispatched CustomEvents must also exist in product | E, H | keep | — | 2/2 |
| `tests/write-guard-contract.test.ts` | Two write-guard.sh copies identical; block path exits 2 | E, B | keep | — | 2/2 |
| `tests/theme-builtin-sources.test.ts` | builtin JSON tokens must equal globals.css theme blocks | G, E | keep | — | 1/7 |
| `tests/theme-preview-sync.test.ts` | theme-preview.css and globals.css share tokens and selectors | G, E | keep | — | 7/7 |
| `tests/drawer-card-glass.test.ts` | globals.css cancels backdrop-filter under .command-drawer | G | keep | — | 6/6 |
| `tests/brand-colour-modes.test.ts` | globals.css brand blocks, ordering, contrast; one engine line | G, B | keep | — | 5/5 |
| `tests/reduced-effects-animations.test.ts` | CSS `animation: none` gates plus two theme-engine name pins | G, B | keep | — | 5/5 |
| `tests/toggle-motion-policy.test.ts` | Toggle transition-duration 0ms under reduced effects/motion | G | keep | — | 3/3 |
| `tests/android-artifact-read-failure.test.ts` | Kotlin artifacts:get handler uses guarded read helpers | D (Kotlin) | keep (no Kotlin scan in check.sh) | — | 3/3 |
| `tests/android-honest-build.test.ts` | Kotlin/gradle/manifest/workflow lines pin Android parity fixes | B, D | keep (fragile) | — | 6/6 |
| `tests/perf-marks-placement.test.ts` | perfMark names, uniqueness and source order in main.ts | B, H | keep (fragile) | — | 9/9 |
| `tests/remote-phone-findings.test.ts` | Pins exact lines across seven renderer/main files | B | keep (fragile) | — | 13/13 |
