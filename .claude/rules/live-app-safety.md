---
paths:
  - "**"
last_verified: 2026-05-04
---

# Live App Safety Rule

**This rule overrides anything else when in conflict.** All Claude sessions in this workspace must read and follow it.

## The rule

**Never experiment on the running built app.** Development and runtime tests use isolated `bash scripts/run-dev.sh`. **Exception (Destin, 2026-09-22):** on his explicit request, replace only installed theme files under `~/.claude/wecoded-themes/<slug>/` while the app runs. Back up first; verify the published version, write assets before the manifest, and verify the installed result. No app process, IPC, settings, or DevTools access.

## Why

The built YouCoded app on Destin's machine is his **working environment** — the assistant he uses for actual work. Touching it is exactly equivalent to running experiments on production. On 2026-05-04 a "harmless" DevTools console read crashed his app mid-session.

## Specifically forbidden against the live app

- Running JavaScript in DevTools — even ostensibly read-only operations. The DevTools attach itself can stall the renderer; some DOM queries trigger layout/paint; querySelector + style mutation runs synchronously in the React render loop.
- Sending IPC messages, modifying DOM/CSS/localStorage, dispatching reducer actions
- Killing, restarting, or signalling its Electron processes (main, renderer, GPU, utility)
- Touching files Electron has open, other than the explicit theme-file exception above: `Local Storage/leveldb/*`, `Cookies`, `settings.json`, `.claude.json`, anything under `AppData/Roaming/youcoded/`
- Installing, uninstalling, enabling, or disabling plugins or hooks (themes: exception above)
- Any code change that requires the running app to reload it
- Pressing keys in the running app's window (Ctrl+R, Ctrl+Shift+I, etc.)

## Workspace files are not the running app

Ordinary workspace documentation, guidance, roadmap and source edits are allowed under
the usual authorization/worktree rules; they do not require closing YouCoded or launching
a dev instance. Editing this document does not change an already-running session's instructions.

Judge effects, not directories: except for requested theme files, no live reload,
active-state change, held-open file edit or process stop. Hook/plugin/integration
changes are not docs. Verify consumers before claiming disruption; ancestry is
not proof of a crash.

## Allowed (read-only, from outside)

- `Get-Process`, Task Manager observation, GPU performance counters
- Reading log files the app has written (but not held-open ones)
- Reading the `.claude/` directory state (it's shared with Claude Code, not exclusive to the running app)
- Inspecting source code, git history, build outputs

## What to do when you need to verify runtime behavior

The workflow is **always**:

1. Set up a worktree (or use the existing one this session is operating in).
2. `bash scripts/run-dev.sh` — launches a separate "YouCoded Dev" Electron window on shifted ports (Vite 5223, remote 9950) with its own `userData` profile, so the dev instance coexists with Destin's live app.
3. Make the test edit in dev source. Vite HMR or Electron restart picks it up.
4. Inspect/probe the dev window, not the live app.
5. When the change ships, shut down the dev window per the existing "Pushing to master green-lights closing the dev server" rule.

If `run-dev.sh` doesn't fit (e.g., testing a built artifact), use `assembleReleaseTest` for Android (installs as a side-by-side APK with `.releasetest` suffix, separate data) or build a fresh installer in a temp dir for desktop. Never test against the production install.

## What to ask for

If a verification genuinely requires live-app state (e.g., reproducing a bug only reproducible with Destin's exact session), ask Destin to capture the relevant artifact (screenshot, log, exported state) and work from that. Do not say "open DevTools and run X" against his live app.
