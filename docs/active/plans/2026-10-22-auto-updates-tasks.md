---
status: active
card: 183
design: docs/active/specs/2026-10-22-auto-updates-design.md
---

# Automatic updates — build tasks

Run in order (they share `update-service.ts`). Each: one builder subagent, then one fresh
reviewer subagent; findings fixed before the next task. All app code in
`youcoded/desktop` on branch `session/183-auto-updates`. Every task ends green on
`bash scripts/verify.sh youcoded` (from the workspace root).

## T1 — The setting and its bridge
Design §1, §6 (settings half). `UpdateSettings.autoInstall` + in-memory cache; channels
`update:get-auto-install` / `update:set-auto-install` returning `{supported, enabled}`; preload,
remote-shim, backend-contract; `useAutoInstall` maps `supported:false`/absent/reject to null;
`channel-table-families.test.ts` phone-allowed list; drop the two settings rows from
`MOCK_ONLY` and make the workbench mock answer the new shape. Turning the switch on calls a
service hook that T2 fills (a no-op until then).

## T2 — One download owner, staging, status
Design §2, §3, rev 4 "staging moves to download time". `ensureDownloaded()`, `pending` +
`pending.json` (asset name, never a path), verify-then-stage (Mac stage, AppImage copy),
newer-release handling, beta-channel change clears `pending`, cleanup after first check,
`downloaded` / `needs_password` / install-refused computation, status push on `pending`
change, deferred first run, unpackaged never downloads. UpdatePanel: closing no longer cancels;
`get-cached-download` reports an in-flight job; reopen shows progress. Async fs everywhere.

## T3 — Installing: exit hook, quit install, Restart, brake
Design §4, §5, rev 4 amendments. Exit actions in `app-restart.ts` (`relaunch` / `install` /
`install-relaunch`), `internalQuit` flag on every internal `app.quit()`, prepare step in
`runShutdown`, brake fetch with HTTP status + 10-minute cache, `attempt.json`, failure count,
per-platform spawn (NSIS flags, Mac helper script + go file, AppImage rename, pkexec reuse),
Windows `session-end` / `powerMonitor` shutdown veto, `update:restart-to-update` with its own
close-request key, `settleAll` ⇒ Cancel for it, untrack after the gate, dropped-restart rule.
UpdatePanel "Update now" path. Remove the last `MOCK_ONLY` row.

## T4 — The admin brake procedure
youcoded-admin release skill: how to pull a release (delete `youcoded-release.json` and
`.sig`; optionally mark not-latest; announcement chip for a notice). File names taken from the
app's constants.

## Release gate (not a task here)
A real-Mac run before any release that carries this: an admin account and a non-admin account,
macOS 15 and 26, covering quit install, Restart, password cancel → disk image, and a pulled
release. No Mac is available in this workspace.
