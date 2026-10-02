---
paths:
  - "**/desktop/src/main/prerequisite-installer.ts"
  - "**/desktop/src/main/first-run.ts"
  - "**/desktop/src/main/remote-config.ts"
  - "**/desktop/src/main/sync-setup-handlers.ts"
last_verified: 2026-10-02
verify:
  - path: youcoded/desktop/src/main/prerequisite-installer.ts
    contains: "runCommand"
  - path: youcoded/desktop/src/main/prerequisite-installer.ts
    contains: "detectWinget"
  - path: youcoded/desktop/src/main/first-run.ts
  - test: youcoded/desktop/tests/prerequisite-installer-pins.test.ts
---

# Prerequisite installer (desktop first-run)

The Windows-11 clean-machine install path. A real-user `spawn EINVAL` motivated these — don't regress. CC-coupling for the Claude installer is tracked in `youcoded/docs/cc-dependencies.md`.

- **Always spawn `.cmd`/`.bat` via `runCommand`, not raw `execFile`.** Node's CVE-2024-27980 mitigation makes `spawn`/`execFile` REFUSE `.cmd`/`.bat` on Windows unless `shell:true` → surfaces as `Error: spawn EINVAL`. `runCommand` auto-flips `shell:true` when `win32` AND the path matches `/\.(cmd|bat)$/i`; real `.exe` paths take the no-shell route (preserving the no-injection guarantee). Any new `execFile` in this file goes through `runCommand`; any new file spawning Node-CLI shims (npm, gh) on Windows replicates the condition.
- **`installClaude` uses Anthropic's native installer, not `npm i -g`** (`claude.ai/install.ps1`/`.sh`) — eliminates the `.cmd` shim chain (`npm.cmd` during install AND `claude.cmd` on every later `--version`/`auth`). Two-stage bootstrap (downloads the binary, runs `<binary> install` to register PATH). Don't reintroduce the npm path. **Native installer URL is CC-coupled** — if Anthropic moves distribution off `claude.ai/install.{ps1,sh}`, `installClaude` breaks; refresh cc-dependencies each CC review. (Android still installs CC via npm — the paths intentionally diverge; don't switch `Bootstrap.installClaudeCode`.)
- **Claude Code is NOT a setup prerequisite any more (2026-09-14).** `installMissing()` installs Node and Git only; Claude Code installs when the user presses *Log in with Claude* (`handleOAuthLogin`) or *Install Claude Code* in Settings (`claude-code:install`). Local-model, ChatGPT and API-key users never wait for it. Spawns after an in-process install go through `resolveClaudeCommand()` (PATH, else `~/.local/bin/claude`) — the running app's PATH predates the install. Don't re-add `claude` to the setup list. Guard: `ipc-channels.test.ts` (`claude-code:install` parity).
- **Post-install detection failure means "PATH didn't propagate" — surface the message, don't loop.** `installClaude` returns a clear "Quit and reopen YouCoded" error; the binary is on disk but its dir hasn't reached the running Electron process's PATH. Restart is the deterministic fix — no polling loop, no forced PATH rebuild.
- **`getRegPath()` returns a QUOTED path; `getPowerShellPath()` returns UNQUOTED — do not unify.** `getRegPath` is interpolated into an `execSync` template routed through `cmd.exe` (parses the quotes). `getPowerShellPath` is passed to `runCommand → execFile(..., {shell:false})`, which hands the literal string to `CreateProcess` — embedded quotes become part of the filename → `ENOENT`. Rule: a path used as the `file` arg of `execFile`/`spawn` with `shell:false` must be UNQUOTED. (Verified 2026-05-21.)
- **`detectWinget()` guards the winget-dependent installs that remain — wire new callsites through it.** `winget.exe` is an MSIX alias, not a guaranteed Win32 binary (absent on Server, older LTSC, sandboxes, policy-disabled). Bare invocation → cryptic `spawn ENOENT`; `detectWinget()` probes `winget --version` and returns an actionable message. Callers are now ONLY `RemoteConfig.installTailscale` (`remote-config.ts`) and `installRclone` (`sync-setup-handlers.ts`) (plus `github-auth.ts`). **Node and Git no longer use winget (2026-10-02)** — `installWithWinget` is deleted; don't bring it back.
- **Node and Git install by direct download, sha256-pinned, no admin (2026-10-02).** Node `v24.21.0` everywhere (`nodeAsset`): Windows zip into `%LOCALAPPDATA%\YouCoded\node` via `System32\tar.exe` (PATH `tar` may be Git's GNU tar); Windows Git is Portable Git (`gitWindowsAsset`; MinGit has no bash) in `...\YouCoded\git`, so `git\cmd\git.exe` keeps bash.ts's `cmd\git.exe -> bin\bash.exe` derivation working. Verify sha256 BEFORE extract/run (`downloadVerified`); extract to `.staging`, then rename. An existing Node/Git is used as-is. PATH is set in-process, in HKCU via PowerShell (`mergeUserPath`, keeps REG_EXPAND_SZ) and by `main.ts` at launch. A version bump needs new hashes for ALL assets.
- **macOS Git waits for Apple's installer.** `installGit` runs `xcode-select --install`, polls `detectGit()` every 5 s for 30 min, shows `PrerequisiteState.note` via `describeStep`; only a timeout errors. `macGitWait` prevents a second poll.

- **`refreshPath()` must expand `%VARS%` and keep the launch-time PATH (`buildRefreshedPath`).** The registry's Path values are REG_EXPAND_SZ; copied in raw, `%SystemRoot%\system32` and `%USERPROFILE%\...\WindowsApps` vanish from PATH, so winget (an alias in WindowsApps) went `ENOENT` right after installing Node and setup dead-ended at Git (clean Win11 VM, 2026-10-02).

**Guard:** `youcoded/desktop/tests/prerequisite-installer-pins.test.ts` pins `buildRefreshedPath`, the pinned assets/sha check, `mergeUserPath`, the Windows layout, `pollUntilInstalled` and the two decision-level invariants — the `runCommand` shell-flag decision (via the extracted pure `shouldUseShell(cmd, platform)`) and the `getRegPath` quoted / `getPowerShellPath` unquoted asymmetry (win32-guarded, since they read System32). The remaining machine-state footguns (real Windows download/extract/PATH-write, the 7-Zip extractor with spaces in the path, Apple's dialog) have no unit test — verify those by running the first-run flow on a clean Windows box.
