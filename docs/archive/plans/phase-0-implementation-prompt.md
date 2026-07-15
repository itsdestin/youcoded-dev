---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-0-implementation-prompt.md
---

## Task: Unified Marketplace — Pre-Implementation Review & Phase 0

### Context

We're unifying YouCoded's three separate content systems (skill marketplace, theme marketplace, and YouCoded toolkit layers) into a single marketplace. Two documents in `wecoded-marketplace/docs/` contain the full plan:

1. `unified-marketplace-research-report.md` — Raw research documenting how all current systems actually work, corrected misunderstandings, and unchecked areas.
2. `unified-marketplace-plan.md` — The revised architecture and implementation plan. Contains 4 architecture decisions, an 8-phase implementation plan, known pitfalls, and priority ordering.

Read both documents thoroughly before doing anything else.

### What you need to do

**Step 1: Familiarize with the codebase.** Read the key files that the plan will modify. You need to understand how they work today before changing them. At minimum:

Desktop (youcoded/desktop/src/):
- `main/skill-provider.ts` — desktop install/uninstall flow
- `main/plugin-installer.ts` — how plugins get downloaded and placed
- `main/skill-config-store.ts` — how youcoded-skills.json is read/written
- `main/theme-marketplace-provider.ts` — theme install/uninstall/publish
- `main/ipc-handlers.ts` — where IPC channels are registered
- `main/preload.ts` — the IPC bridge (channel definitions)
- `renderer/components/Marketplace.tsx` — current skill marketplace UI
- `renderer/components/ThemeMarketplace.tsx` — current theme marketplace UI
- `renderer/components/SkillManager.tsx` — installed content management UI
- `renderer/components/SkillDetail.tsx` and `ThemeDetail.tsx` — detail views
- `renderer/state/theme-context.tsx` — how themes are applied
- `renderer/remote-shim.ts` — WebSocket IPC for Android/remote

Android (youcoded/app/src/main/kotlin/com/destin/code/):
- `skills/LocalSkillProvider.kt` — Android skill provider (note: install() throws for plugins)
- `skills/PluginInstaller.kt` — Android plugin installer (fully implemented but routing is wrong)
- `skills/SkillConfigStore.kt` — Android config store
- `runtime/SessionService.kt` — the big IPC dispatcher, especially lines 436-491 (skills:install and skills:uninstall handlers)
- `ui/WebViewHost.kt` — Android WebView setup (no theme-asset support)

Marketplace registry:
- `wecoded-marketplace/scripts/sync.js` — how upstream entries are imported
- `wecoded-marketplace/index.json` — current schema (sample a few entries of different types)

Toolkit:
- `youcoded-core/core/plugin.json` — Core plugin declaration
- `youcoded-core/life/plugin.json` and `youcoded-core/productivity/plugin.json` — layer declarations

**Step 2: Pre-implementation review.** After reading the plan AND the code, identify anything that would block or complicate implementation. Specifically:
- Are there assumptions in the plan that the code doesn't support?
- Are there files or patterns the plan doesn't mention that would be affected?
- Are there any ordering issues within phases?

Report findings briefly. Don't rewrite the plan — just flag issues.

**Step 3: Implement Phase 0 (Quick Wins).** Create a new branch from master and implement:

- **0a: Desktop /reload-plugins after install.** Find where the desktop IPC handler processes `skills:install`, and add a `/reload-plugins\r` write to the active PTY session after successful plugin install — matching what Android already does in SessionService.kt:450. Look at how the desktop app accesses the active terminal session.

- **0b: sync.js SHA preservation.** Modify sync.js to preserve Anthropic's SHA field for `url` and `git-subdir` entries instead of discarding it. The upstream `marketplace.json` includes these — map them through to the output index.

Use a worktree or branch. Commit each fix separately with clear messages. Do NOT push — just report what you did and what branch it's on.

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments explaining purpose (e.g., `// Fix: reload plugins after marketplace install to match Android behavior`)
- Don't change anything outside Phase 0 scope
- If you discover Phase 0 is blocked by something (e.g., desktop has no way to access the active PTY), report that instead of hacking around it
