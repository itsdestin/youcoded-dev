---
paths:
  - "youcoded/desktop/src/main/prerequisite-installer.ts"
  - "youcoded/desktop/src/main/first-run.ts"
  - "youcoded/desktop/src/main/remote-config.ts"
  - "youcoded/desktop/src/main/sync-setup-handlers.ts"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/prerequisite-installer.ts
    contains: "runCommand"
  - path: youcoded/desktop/src/main/prerequisite-installer.ts
    contains: "detectWinget"
  - path: youcoded/desktop/src/main/first-run.ts
---

# Prerequisite installer (desktop first-run)

The Windows-11 clean-machine install path. A real-user `spawn EINVAL` motivated these — don't regress. CC-coupling for the Claude installer is tracked in `youcoded/docs/cc-dependencies.md`.

- **Always spawn `.cmd`/`.bat` via `runCommand`, not raw `execFile`.** Node's CVE-2024-27980 mitigation makes `spawn`/`execFile` REFUSE `.cmd`/`.bat` on Windows unless `shell:true` → surfaces as `Error: spawn EINVAL`. `runCommand` auto-flips `shell:true` when `win32` AND the path matches `/\.(cmd|bat)$/i`; real `.exe` paths take the no-shell route (preserving the no-injection guarantee). Any new `execFile` in this file goes through `runCommand`; any new file spawning Node-CLI shims (npm, gh) on Windows replicates the condition.
- **`installClaude` uses Anthropic's native installer, not `npm i -g`** (`claude.ai/install.ps1`/`.sh`) — eliminates the `.cmd` shim chain (`npm.cmd` during install AND `claude.cmd` on every later `--version`/`auth`). Two-stage bootstrap (downloads the binary, runs `<binary> install` to register PATH). Don't reintroduce the npm path. **Native installer URL is CC-coupled** — if Anthropic moves distribution off `claude.ai/install.{ps1,sh}`, `installClaude` breaks; refresh cc-dependencies each CC review. (Android still installs CC via npm — the paths intentionally diverge; don't switch `Bootstrap.installClaudeCode`.)
- **Post-install detection failure means "PATH didn't propagate" — surface the message, don't loop.** `installClaude` returns a clear "Quit and reopen YouCoded" error; the binary is on disk but its dir hasn't reached the running Electron process's PATH. Restart is the deterministic fix — no polling loop, no forced PATH rebuild.
- **`getRegPath()` returns a QUOTED path; `getPowerShellPath()` returns UNQUOTED — do not unify.** `getRegPath` is interpolated into an `execSync` template routed through `cmd.exe` (parses the quotes). `getPowerShellPath` is passed to `runCommand → execFile(..., {shell:false})`, which hands the literal string to `CreateProcess` — embedded quotes become part of the filename → `ENOENT`. Rule: a path used as the `file` arg of `execFile`/`spawn` with `shell:false` must be UNQUOTED. (Verified 2026-05-21.)
- **`detectWinget()` is the upfront guard for winget-dependent installs — wire new callsites through it.** `winget.exe` is an MSIX alias, not a guaranteed Win32 binary (absent on Server, older LTSC, sandboxes, policy-disabled). Bare invocation → cryptic `spawn ENOENT`; `detectWinget()` probes `winget --version` and returns an actionable message. Current callers: `installNode`, `installGit`, `RemoteConfig.installTailscale` (`remote-config.ts`), `installRclone` (`sync-setup-handlers.ts`). Any new winget flow runs it first.

**Guard: none — candidate.** These are Windows-machine-state footguns with no unit test; verify by running the first-run flow on a clean box.
