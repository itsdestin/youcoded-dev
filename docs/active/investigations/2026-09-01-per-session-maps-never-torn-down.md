---
date: 2026-09-01
status: active
type: investigation
topic: Six small per-session structures in the desktop main process are never torn down on session exit
---

# Per-session maps in main that outlive their session

**Symptom.** Memory held per session in the desktop main process is never released when the session ends. Not the sidecar-OOM cause (each is a few hundred bytes; together <1% of the sidecar cost) — but all genuine misses, and one small cleanup PR.

## Mechanism (re-checked against master 2026-09-01)

**Four maps keyed by session id with no removal anywhere.** Their neighbours are cleaned on `session-exit` (`lastAttentionBySession`, `lastContextByDesktopId`, `lastGitBranchByDesktopId`, `lastSessionStatsByDesktopId` in `ipc-handlers.ts`) and `NativeSessionHost.destroy()` explicitly deletes its sibling maps — these four were simply never added to those lists:

- `lastModelSeen` — `youcoded/desktop/src/main/ipc-handlers.ts:2244` (set at `:2289`, never deleted)
<!-- claim: {"path": "youcoded/desktop/src/main/ipc-handlers.ts", "contains": "const lastModelSeen = new Map<string, string>\\(\\);"} -->
- `lastSessionModelState` — `ipc-handlers.ts:2899`
- `specialistSpawnCounts` — `youcoded/desktop/src/main/harness/native-session-host.ts:359` (the "never decremented" comment there is about the counter VALUE, not the map entry)
- `childApprovedAsks` — `native-session-host.ts:441`, cleared only inside `resumeSpecialist` (`:972`), so a child that is never resumed keeps its entry for the life of the process

`rg 'lastModelSeen\.delete|lastSessionModelState\.delete|specialistSpawnCounts\.delete|childApprovedAsks\.delete' desktop/src` on 2026-09-01 returns only the `resumeSpecialist` line.

**Two with the wrong cleanup scope.**

- `WindowRegistry.subscriptions` (`youcoded/desktop/src/main/window-registry.ts:104`) — `releaseSession()` (`:95`) clears `ownership` only, so a dead session's subscriber set survives until the subscribing window closes.
- `attentionReports`' inner per-session map (`youcoded/desktop/src/main/main.ts:460`) — entries clear only when the renderer volunteers `{ clear: true }` (`:1921`); there is no main-side `session-exit` path.

**Worth capping while in there.**

- `SubagentIndex.unmatchedParents` (`youcoded/desktop/src/main/subagent-index.ts:49`) has no TTL sweep, unlike the sibling `pending` map's `pruneExpired` (`:123`), so a `Task` whose subagent JSONL never materialises is retained for the session's life.
- `pendingOutput` (`ipc-handlers.ts`) is an uncapped PTY string buffer for any session that never mounts a `TerminalView` (the normal path drains within ~1 s, so low risk).

## Fix shape

Add the four maps to the existing `session-exit` / `destroy()` delete lists; make `releaseSession()` also drop the session's subscriber set; give `attentionReports` a main-side per-session clear on exit; add a `pruneExpired`-style sweep to `unmatchedParents`.

## History

Added 2026-08-27 (found sweeping main during the sidecar-OOM investigation — full list, including the structures verified CLEAN, in `docs/active/investigations/2026-08-27-artifacts-sidecar-oom-crash.md` → Secondary findings). Re-verified against master 2026-09-01 (line numbers updated; nothing fixed since).
