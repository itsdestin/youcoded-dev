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

## Native harness (Phase 2 Plans A–B)

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

## Documentation Drift

- **Fix on sight.** A doc/rule/CLAUDE.md claim that contradicts current code gets fixed in the session you notice it — verify against code, cite the verification in the commit. There is no drift ledger to defer into. *Guard:* the fix + its commit message.
- **Unfixable this session → a ROADMAP `bug` tagged `#docs`** (in `ROADMAP.md`), captured the same session. Not a scratch note, not memory.
- **`/audit` is the periodic backstop** (run before releases / after major refactors). It is fix-executing and diff-scoped: it verifies claim anchors against code, applies corrections inline, and writes a dated report to `docs/audits/YYYY-MM-DD.md`. The report is an audit trail of applied fixes plus a **residue** of items needing a human decision (product-behavior questions, deletions of user content, privacy-copy wording). *Guard:* the report's `residue:` frontmatter count — the session-start hook warns when it's non-zero or the latest report is >60 days old. (`docs/knowledge-debt.md` is retired — the residue in the newest audit report is the only surviving drift ledger.)

## Working With Destin

The day-to-day working rules — **"merge" means merge AND push**, **always sync before working**, **annotate non-trivial edits with a WHY comment**, **verify fix consequences on both platforms** — live in `CLAUDE.md` → Working Rules and are not duplicated here. The overriding safety rule (**never touch Destin's live built app**; all runtime testing goes through `bash scripts/run-dev.sh`) is `.claude/rules/live-app-safety.md`.
