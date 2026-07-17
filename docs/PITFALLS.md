# Pitfalls — cross-repo invariants

This file now holds **only cross-repo invariants** — constraints that span two or more repos (the app, the registries, the bundled plugin) or the workspace itself. Subsystem invariants moved to path-scoped rules in `.claude/rules/` (injected automatically when you touch matching files) with depth in `youcoded/docs/` and `wecoded-marketplace/docs/`. Start any non-trivial task at `docs/MAP.md` (subsystem → entry points → rule → doc → guard tests; created in the follow-up task).

**Entry template — every entry names a guard.** *invariant (1–2 sentences) · why (1 sentence or a link) · guard (the test that pins it, or the mechanical check `/audit` runs).* An unguarded invariant is a standing request for a pinning test. New knowledge goes, in descending preference: a pinning test → a WHY comment at the edit site → a path-scoped rule → the rule's lazy doc. A new entry belongs **here** only if it's genuinely cross-repo; otherwise it belongs in a rule.

## Releases

- **Bump `versionCode` AND `versionName` in `youcoded/app/build.gradle.kts` BEFORE tagging** (currently `versionCode = 20`, `versionName = "1.2.4"`). *Why:* Play Store requires `versionCode` to be monotonically increasing, so CI cannot derive it from the tag. *Guard:* none mechanical — release-skill checklist (`youcoded-admin/skills/release`).
- **One `vX.Y.Z` tag on youcoded master ships all platforms.** It triggers both `android-release.yml` and `desktop-release.yml` → a single GitHub Release with APK/AAB + Win/Mac/Linux installers. *Why:* coordinated cross-platform release. *Guard:* CI workflows.
- **Desktop version comes from the git tag, not `package.json`.** CI extracts the version from the tag and patches `package.json` during build. *Guard:* `desktop-release.yml`.
- **youcoded-core auto-tags on `plugin.json` version change** on master — `youcoded-core/.github/workflows/auto-tag.yml` compares `HEAD` vs `HEAD~1` and creates the tag. There is one manifest (no layer-level `plugin.json`). *Guard:* `auto-tag.yml`.
- **Multi-repo release coordination lives in the `youcoded-admin` release skill** (`youcoded-admin/skills/release/SKILL.md`) across the app, `youcoded-core`, and admin. See build order + flows in `docs/build-and-release.md`. History: v2.3.0 lessons (fragile auto-tag, untested hooks, protocol-parity blind spots) — memory `project_release_lessons_2_3_0`.

## Cross-repo invariants

- **A message-type string must be byte-identical across `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, and `SessionService.kt`.** *Why:* a typo silently fails on one platform (the shared React UI crashes or a feature no-ops). *Guard:* `youcoded/desktop/tests/ipc-channels.test.ts`; depth in rule `.claude/rules/ipc-bridge.md` + `youcoded/docs/shared-ui-architecture.md`.
- **`preload.ts` and `remote-shim.ts` must expose the same SHARED `window.claude` shape** (intentional exceptions: `window.claude.window` Electron-only, `window.claude.android` Android-only). *Why:* a missing shared API crashes React on that platform. *Guard:* `ipc-channels.test.ts`.
- **When you add CC-coupled code, add an entry to `youcoded/docs/cc-dependencies.md`.** Coupling = parsing CC output (transcript JSONL, statusline JSON), consuming a CC file, depending on CLI behavior/flags/exit codes, or matching a CC text pattern (spinner glyphs, prompt markers). *Why:* that spine doc feeds the `review-cc-changes` release agent; an omitted touchpoint downgrades it to free-reasoning mode. *Guard:* the release-agent review.
- **The bundled-plugin list is two-way duplicated** — `BUNDLED_PLUGIN_IDS` in `youcoded/desktop/src/shared/bundled-plugins.ts` AND `youcoded/app/.../skills/BundledPlugins.kt`. Both must stay in sync; changing it requires an app release. *Why:* the list is intentionally hardcoded (offline-first launch can't fetch it; a remote list would grant the marketplace force-install authority). *Guard:* none mechanical — cross-file convention; depth in rule `.claude/rules/registries.md`.
- **The marketplace + theme registries are fetched at runtime from `raw.githubusercontent.com`, cached ~24h.** No CI rebuild on the app side; registry entries with `sourceMarketplace: "youcoded-core"` are never overwritten by upstream sync. *Why:* apps read live registry state, so a bad registry commit reaches users without an app release. *Guard:* registry-PR CI in `wecoded-marketplace`/`wecoded-themes`; depth in `docs/registries.md`.
- **The dev instance and the built app SHARE `~/.claude/` (and `~/YouCoded/`).** Every cross-process JSON write is lock-guarded (`mutateFileUnderLock` / mkdir-lock `casWrite`); `write-guard.sh` + `.sync-lock` mediate concurrency. *Why:* `run-dev.sh` runs against real state alongside Destin's live app — two writers is a normal state, not an edge case. *Guard:* `cas-write.test.ts` + the per-subsystem store tests.
- **Windows `git worktree remove` follows junctions.** If you junctioned `node_modules` into a worktree, delete the junction first (`cmd //c "rmdir <path>"`, NOT `rm -rf`) before `git worktree remove`, or it wipes the MAIN checkout's `node_modules`. *Why:* recursive delete traverses the junction to its target. *Guard:* none — see the fuller note in `CLAUDE.md` → Working Rules.

## Native harness (Phase 2 Plans A–C)

- **The Bash tool bypasses the file-tool guards** — secret-path denial and the
  cwd jail live in the file tools; `cat .env` through Bash defeats them, and the
  command-glob deny-list can't catch every phrasing. ACCEPTED limitation (CC has
  the same hole); the guards are honest friction, not a sandbox. Don't present
  them as a security boundary, and don't try to glob your way to one.
- **Permission precedence is two-tier:** tool-layer guards (secret paths,
  external_directory) sit BELOW all configuration and never yield; the
  destructive deny-list is CONFIG — an explicit remembered Always-allow beats
  it (by design, consequence-gated in UI). Guard: `permission-engine.test.ts`.
- **The read-before-edit registry resets on resume** (files change while a
  session is closed). Don't "optimize" it back from stored Read events.
- **HarnessSession's emit surface is FROZEN** — the tool loop only emits
  existing TranscriptEventType values. New loop states must map onto existing
  events (max_steps/doom_loop are permission asks, not new event types).
  Guard: `harness-session-loop.test.ts` + `tests/harness-sdk-toolcall-contract.test.ts`.
- **Tool-call/result pairing is an invariant EVERYWHERE** — the driver
  back-fills canceled/interrupted calls, `rebuildHistory` back-fills
  crash-truncated ones, and `fitToContext` trims pair-aware. *Why:* a dangling
  tool_call 400s on real providers and bricks the session. Guards:
  `harness-session-loop.test.ts` (canceled-ask regression) +
  `harness-history-rebuild.test.ts` (truncated-tail).
- **The driver emits ALL of a step's tool-use events BEFORE executing** (not
  interleaved). *Why:* `rebuildHistory` groups by event adjacency and relies on
  this ordering; "fixing" it back to interleaved silently breaks history
  reconstruction. Guard: `harness-session-loop.test.ts`.
- **WebFetch/WebSearch validate EVERY redirect hop** (scheme + literal IP + the
  DNS-resolved address) — redirects are followed MANUALLY because a public URL
  302ing to `http://192.168.1.1/` (or a hex-form `http://[::ffff:127.0.0.1]/`,
  which `new URL` normalizes to `::ffff:7f00:1`) is the classic SSRF bypass.
  Honest friction, not a security boundary (TOCTOU DNS-rebind remains possible);
  never "simplify" back to `redirect: 'follow'`. Guard: `net-guard.test.ts`.
- **WebFetch bounds extraction cost with a pre-parse complexity guard** — linkedom
  `parseHTML` + Readability run SYNCHRONOUSLY on the Electron main loop and
  `Readability.parse()` is ~quadratic in DOM depth, so the 5MB byte cap is not a
  cost bound. A tag-count + max-nesting-depth scan (`MAX_TAGS`/`MAX_DEPTH`) rejects
  pathological pages before parsing; `defineTool`'s catch CANNOT stop a synchronous
  hang. Don't remove the guard "because there's a size cap." Guard: `web-fetch-tool.test.ts`.
- **DDG's `202` is rate-limiting and is NEVER retried** — single attempt by
  design (the 2025 breakage waves came from clients hammering it). The chain
  moves to the next backend and reports honestly. Guard: `search-backends.test.ts`.
- **AskUserQuestion answers ride `decision.updatedInput` through the permission
  channel** — the broker must pass `updatedInput` through, and `formatAnswers`
  must be TOTAL (never throw on a non-string/array/missing answer from an
  untrusted renderer/remote client): a throw there escapes the "never throws"
  tool loop → dangling tool_call → bricked session. Guards:
  `native-permission-broker.test.ts` + `ask-user-question-tool.test.ts`.
- **Preset permission posture is the `modeFor` SEED, not presetRules** — mode
  rules outrank preset rules in the engine layering, so a preset's "edits allow"
  only works as a STARTING mode (`auto-edit` for Coder). `modeFor` is seeded once
  at create/resume and never overwritten by the preset afterward; an explicit
  `setPermissionMode` always wins. Legacy `harnessId:'chat'` maps to Assistant
  read-side — the stored header is never rewritten. Guard: `native-session-host.test.ts`.
- **`CORE_TOOLS` and the manifest's `NATIVE_TOOL_NAMES` must stay identical** —
  presets advertise their suite via the names, and the prompt bodies reference
  tools by them; advertising an unregistered tool makes a preset instruct the
  model to call something that doesn't exist. Guard: `tool-registry-manifest.test.ts`.
- **Compaction never drops a message; it only shrinks tool-result TEXT (prune)
  or replaces a span cut on a USER-message boundary (summarize)** — either path
  that split an assistant tool-call from its `role:'tool'` result would dangle a
  tool_call and brick the session. It also FAILS SAFE: a summary that throws or
  returns empty leaves the pruned history (`fitToContext` is the floor, never a
  `session-error`), and the summary stream is abort-raced + 30s-timeout-bounded —
  a bare `for await` there would reintroduce the exact un-interruptible hang
  `consumeStep` guards against. Guards: `compaction.test.ts`, `harness-compaction.test.ts`.
- **Capability profiles NEVER branch on a model-name string** — they resolve from
  provider TYPE + the real context window + a family-keyed regex registry; only
  that registry's matcher touches the modelId. Tools are removed only when the
  registry marks a model `supportsTools:false`. Guards: `capability-profile.test.ts`,
  `known-models.test.ts`.
- **A local model's context window is READ + enforced, never the catalog guess** —
  `effectiveContextWindow` reads llama-server `/props` and clamps to `min(loaded,
  GGUF-trained, registry ceiling)`; the SAME number feeds profile tiering, the
  compaction trigger, and the StatusBar chip (gauge and threshold can't disagree).
  Guard: `engine-context-window.test.ts`.

## Buddy Floater

- **The action bar window stays Electron-shown; visibility is CSS + `setIgnoreMouseEvents`.** Reveal/dismiss animates via the `buddy:bar-state` push. When CSS-hidden, main sets `setIgnoreMouseEvents(true)` so the invisible 164×60 window doesn't eat clicks. Don't "simplify" to window show/hide (kills the fade) and don't drop the ignore-mouse toggle (invisible click-eater).
- **The bar opens with the chat and nothing else** (`buddy-bar-visibility.ts`). Its actions are useless without an open chat, so hover was removed as an input on 2026-07-16 — along with the whole renderer→main hover IPC path. Don't re-add a hover reveal without re-deriving the need.
- **The bar window is bigger than the row it draws** — 164×60 window around a 148×44 content row (`BAR_PADDING = 8` per side), so button hover/pop scale has somewhere to grow. Sizes and all group math live in `buddy-bar-geometry.ts`; `main.ts` imports the constants rather than restating them.
- **Bar position is recomputed from live mascot bounds before EVERY reveal** (`showBar` + `applyBarVisible`). The original capture-icon bug was computing position only at window creation — a mascot drag while the bar was hidden stranded it. Geometry is pure + tested in `buddy-bar-geometry.ts`.
- **The mascot/chat/bar move as one rigid group, and the CHAT's fit constrains the MASCOT's position** — not the other way round. `computeGroupLayout` is a fixed point: chat x is mascot x + a constant offset, so keeping the chat onscreen means pinning the mascot's x, and when neither above nor below fits (a ~220px band on a 1440×852 work area — Destin's actual display) the chat pins to the work-area edge and the mascot is pushed to meet it. Stretching the offset instead put the chat on top of the mascot and made him unclickable (2026-07-17). Never clamp a buddy window independently. **Corollary:** because opening the chat can shove the mascot OFF his edge this way, returning to `peeking` (chat close / attention clear) must re-flush him — `peeking` is only positioned-flush when `moveMascot`'s live drag-peek enters it, so `syncEngagement` → `reconcilePeekPosition()` glides him back to the edge. A peek POSE (lean + sink + grip mittens) at a non-flush window leaves him "hanging off of nothing" (2026-07-17). Any new engage/disengage path must keep that reconcile.
- **Gaps between buddy windows are measured to the ARTWORK, not the window edge.** The rig's ink sits inside 5/30 headroom above and 2/30 below (raised-arm poses need the room), so equal window gaps look lopsided. `mascotInkRect` + `MASCOT_INK_*_INSET` carry this; `HANDS_CENTER_FRACTION` (0.583) is the same idea for lining the bar up with his hands.
- **Rig SVGs are third-party code — `sanitize-rig-svg.ts` is the security boundary.** Themes ship `mascot.rig` (and `companions` SVGs) and they are INLINED into renderer DOM. The sanitizer strips scripts/foreignObject/`<style>`/SMIL/`on*`/external URLs; only `#refs` and `data:image/*` survive. Never inline a theme SVG without routing through it. Registry-side CI validation does not exist yet — the app-side sanitizer carries the whole guarantee.
- **MascotRig indexes the rig DOM by ELEMENT IDENTITY (`ensureParts`), not effect timing.** React can recreate the host div with identical innerHTML (e.g., ThemeMascot re-parents into MascotScene when the async theme delivers companions) without `svgHtml` changing — an effect keyed on state then styles a detached svg and every animation silently dies. Any new rig surface must go through `ensureParts()`; don't "optimize" it back to a mount-time index.
- **Theme `companions` is a TOP-LEVEL manifest key, NOT inside `mascot`** — pre-companions app versions crash in `resolveAllAssetPaths` on non-string mascot values (`value.startsWith`). Keep new structured theme data out of `mascot` unless the installed-base resolver is known to guard it.
- **Mascot motion is transforms inside fixed-size windows; the ONLY window-bounds animation is the edge-snap glide.** Independent CSS properties compose (wrapper `scale` for hover/grab, sink `transform` translate, lean `rotate`) — but the side-peek lean MUST live on its own inner element: CSS resolves an element's `rotate` property BEFORE its `transform`, so combining them on one element swings the translated body out of the window. The dock/peek state machine is pure (`buddy-dock.ts`); BuddyWindowManager owns its timers.
- **`buddy:dismiss` hides for the run only** — `localStorage['youcoded-buddy-enabled']` stays `'1'`; the `dismissed` flag lives in BuddyWindowManager and every `show()` clears it. The Settings row's "Show now" is just `buddy.show()`. Don't make the hide button write the localStorage preference.

## Documentation Drift

- **Fix on sight.** A doc/rule/CLAUDE.md claim that contradicts current code gets fixed in the session you notice it — verify against code, cite the verification in the commit. There is no drift ledger to defer into. *Guard:* the fix + its commit message.
- **Unfixable this session → a ROADMAP `bug` tagged `#docs`** (in `ROADMAP.md`), captured the same session. Not a scratch note, not memory.
- **`/audit` is the periodic backstop** (run before releases / after major refactors). It is fix-executing and diff-scoped: it verifies claim anchors against code, applies corrections inline, and writes a dated report to `docs/audits/YYYY-MM-DD.md`. The report is an audit trail of applied fixes plus a **residue** of items needing a human decision (product-behavior questions, deletions of user content, privacy-copy wording). *Guard:* the report's `residue:` frontmatter count — the session-start hook warns when it's non-zero or the latest report is >60 days old. (`docs/knowledge-debt.md` is retired — the residue in the newest audit report is the only surviving drift ledger.)

## Working With Destin

The day-to-day working rules — **"merge" means merge AND push**, **always sync before working**, **annotate non-trivial edits with a WHY comment**, **verify fix consequences on both platforms** — live in `CLAUDE.md` → Working Rules and are not duplicated here. The overriding safety rule (**never touch Destin's live built app**; all runtime testing goes through `bash scripts/run-dev.sh`) is `.claude/rules/live-app-safety.md`.
