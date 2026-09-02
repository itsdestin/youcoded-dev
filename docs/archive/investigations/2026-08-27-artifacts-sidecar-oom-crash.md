---
title: YouCoded main-process OOM — the artifacts sidecar is now 6.4 MB and every read parses all of it
date: 2026-08-27
status: shipped
tags: [artifacts, memory, crash, conversations]
related:
  - ROADMAP.md line 234 (PR #318, FIXED 2026-08-15 — the write-side burst)
  - ROADMAP.md line 238 (open — CC resume re-records, keyed by desktop session id)
  - docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md (unrelated: GPU/system OOM, not V8 heap)
---

# Main-process V8 heap OOM, 2026-08-27 01:01:56 MST

Destin's live app died after 12 h 32 m of use. This is the **third** distinct
instance of the same crash family and the **second** since PR #318 was supposed
to have closed it.

---

## Summary (read this first)

The app records every file an agent touches into `<project>/.youcoded/artifacts.json`.
Nothing ever prunes it. In `youcoded-dev` it is now **6.4 MB / 3,917 artifacts /
21,311 versions**, and **one `Edit` re-reads all of it five times**. Under a busy
session those reads pile up — the core dump shows **477 simultaneously parsed
copies ≈ 3.0 GB** against V8's 2,825 MB ceiling. The process traps and dies.

PR #318 (2026-08-15) fixed the *write* side of exactly this bug and left all 20
*read* sites unguarded. The file has grown 4.4 → 6.4 MB in the 12 days since.

**The fix that stops the crash — SHIPPED 2026-08-27, youcoded PR #335 (master
`9dc0d9c7`):** `readSidecarShared` — one parsed copy per project, validated by
size + mtime, concurrent callers share one in-flight parse, a committed write
seeds it — plus a 4 KB head probe for the CAS timestamp. No data touched.
Reproduced first: the old path at N=477 concurrent reads of the real file dies
with the journal's exact `Ineffective mark-compacts near heap limit`; the new
path at N=477 is one parse and 25 MB peak. Trimming the file alone would only
have postponed it.

**The rest of the bug class** (a six-lens sweep found it in five places —
transcript replay at 75 MB + 90 MB per session on every reload being the
largest, and Android's artifact store having never received #318's write
queue) is designed and PAUSED in
`docs/archive/specs/2026-08-27-paged-history-and-read-hardening-design.md`.

**Composition of the 6.4 MB:** 39% is 107 worktrees that no longer exist on
disk; 14% is the same edits re-recorded on each CC resume (open ROADMAP item,
now confirmed on disk); 17% of all records are mere file *reads*.

## Picking this up on another machine

```bash
bash setup.sh                 # sync every sub-repo + this workspace
```

Then, in order:

1. Read **Verdict** → **Evidence** → **The cost of one file edit** below. That is
   the whole case; nothing else needs re-deriving.
2. Levers 1 and 3 of **Fix shape** shipped in youcoded PR #335. Lever 2 (the
   data decisions) and the wider bug class live in the paused spec above.
3. Do the work in a worktree (`youcoded/`, desktop only) and finish with
   `bash scripts/verify.sh <worktree>`.
4. **Do not test against the live app** — `bash scripts/run-dev.sh` only
   (`.claude/rules/live-app-safety.md`).
5. The reproduction is done — see **Reproduction** at the bottom for the
   numbers and the command shape to re-run it against a bigger file.

ROADMAP entries for this work: search `ROADMAP.md` for
`PR #318 queued the sidecar WRITER` (this bug) and `Six small per-session
structures` (the minor cleanup found alongside).

---

## Verdict

`appendVersion` was queued by PR #318. **No read path was.** The sidecar has
since grown from 4.4 MB to 6.4 MB, and a replay burst now floats ~477
simultaneously-parsed copies of it — ~3.0 GB — through the *read* side.

The 2026-08-15 fix bounded the writer and left the reader untouched. The file it
deliberately declined to trim is what made the reader fatal.

## Evidence

### The crash itself

```
Aug 27 01:01:56 youcoded[185608]: <--- Last few GCs --->
Aug 27 01:01:56 youcoded[185608]: 45010482 ms: Mark-Compact (reduce) 2801.7 (2825.0) -> 2801.7 (2824.7) MB
                                  … last resort; GC in old space requested
Aug 27 01:01:56 youcoded[185608]: OOM error in V8: CALL_AND_RETRY_LAST Allocation failed
                                  - JavaScript heap out of memory
Aug 27 01:01:56 kernel: traps: youcoded[185608] trap int3
Aug 27 01:03:46 systemd[1753]: app-youcoded@….service: Main process exited, code=dumped, status=5/TRAP
```

Two consecutive last-resort Mark-Compacts freed **0 bytes** of 2,801 MB — the
live set really was ~2.8 GB. Machine had 68 GB free; this is the V8 old-space
ceiling, not system pressure.

### What was in the heap (read from the core dump, not inferred)

```bash
coredumpctl dump 185608 | strings -n 32 > core-strings.txt   # 2.0 GB of text
grep -c 'sessionId' core-strings.txt                          # 9,903,122
grep -o '"ver_[A-Z0-9]\{26\}"' core-strings.txt | sort -u | wc -l   # 20,742 distinct
```

9,903,385 occurrences / 20,742 distinct ≈ **477 copies of one index**.

Those ids are **not** `~/.youcoded/artifacts.json` (1,511 versions; only 8 ids in
common). They are `~/youcoded-dev/.youcoded/artifacts.json` — **6.4 MB, 3,917
artifacts, 21,311 versions**.

    477 × 6.4 MB ≈ 3.0 GB.

### Why 477 copies are alive at once

Only the **write** path is queued (`artifact-store.ts:152` `appendQueues`) and
only `ensureProject` / `applyGitTreatment` are coalesced
(`project-manager.ts:98,113`). Every **read** is unguarded — 20 call sites:

```
rg -n "readSidecar\(" src/main | wc -l    # 20
rg -n "Coalesced|appendQueues|readQueue" src/main/artifacts/*.ts
#   → appendQueues (write) + ensureProjectCoalesced + applyGitTreatmentCoalesced only
```

`LIST_SESSION` (`ipc-handlers.ts:3573`) is the hot one — the code's own comment
at `artifact-store.ts:333` says it "fires after every tracked write":

```ts
const sidecar = await readSidecar(projectRoot);          // full 6.4 MB read + JSON.parse
const result = sidecar.artifacts.filter((a) =>            // walks 3,917 artifacts …
  a.versions.some((v) => v.sessionId === sessionId)       // … and 21,311 versions
);
```

N concurrent calls ⇒ N parsed sidecars alive simultaneously. Nothing caps N.

`listProjectsIndex` (`projects-index.ts:144`) is the same shape at project
granularity: `Promise.all(projects.map(…))` parses **every** project's sidecar
in parallel and holds them all until the slowest resolves.

### The cost of one file edit

A single `Edit` tool call currently costs **five** full passes over 6.4 MB —
~35 MB of transient string plus four complete 3,917-object / 21,311-sub-object
graphs. Every one of those strings is >16 KB, so V8 allocates them directly in
**old space** — the space that filled.

| Step | Site | Cost |
|---|---|---|
| `readSidecar` | `artifact-store.ts:15`, from `:214` | 6.4 MB string + object graph |
| `JSON.stringify(next, null, 2)` | `artifact-store.ts:85` | ~9 MB string |
| CAS re-read + **full parse for one field** | `cas-write.ts:180`, via `artifact-store.ts:88` | 6.4 MB string + object graph |
| `LIST_SESSION` | `ipc-handlers.ts:3573` | 6.4 MB string + object graph |
| watcher `resolveArtifactId` (cache just invalidated by the write) | `project-watcher.ts:126`, invalidated `:112` | 6.4 MB string + object graph |

The CAS re-parse is the most gratuitous — it parses 6.4 MB to read one ISO
timestamp and discards the result:

```ts
expectedUpdatedAt === null ? undefined : (raw) => JSON.parse(raw).updatedAt
```

### The code already confesses this failure mode

`ipc-handlers.ts:3470`, written as part of the PR #318 fix:

> "…appendVersion queues per project and applies the whole burst in a few
> read/write cycles instead of a thousand, **each of which used to pin a parsed
> 4.4 MB sidecar in memory until the app OOM'd**."

Same allocators, same message, now on the slow path instead of the burst path.

### The design assumption is 7.6× out of date

`artifact-store.ts:333`, unchanged since the sizing it describes:

> "the pure pass over a **2,800-record** array is cheap"

Actual: **21,311**.

## Why the file got this big

Growth is ~592 versions/day over 36 active days; **2,333 on 2026-08-26** alone.
It was 4.4 MB on 2026-08-15 and is 6.4 MB now — **+2 MB in 12 days**.

**Nothing prunes it.** Repo-wide:

```bash
rg "versions\.(splice|slice|shift|length\s*=)|MAX_VERSIONS|pruneVersions|trimVersions" src/
#   → no matches
```

Three compounding sources, measured on the live file:

| Source | Versions | ≈ Size | Note |
|---|---:|---:|---|
| Deleted worktrees | **8,416** | 2.5 MB | 107 of 117 recorded worktrees no longer exist on disk |
| CC-resume re-records | **2,951** | 0.9 MB | same `toolUseId`, re-recorded under a new desktop session id |
| Everything else | 9,944 | 3.0 MB | genuine history |

By event type: `edit` 15,282 (72%) · `read` **3,602 (17%)** · `create` 2,423
(11%) · `delivered` 10. The 3,602 `read` events exist only to make a tool card
clickable and are the cheapest candidate to stop recording or to prune first.

- **Worktrees are 44% of all records** (1,726 of 3,917 artifacts; 9,627 of 21,311
  versions). Following the workspace's own "delete the worktree after merging"
  rule removes the folder and *keeps* the history forever.
- **The re-record count is a floor, not a total** — only 32% of versions carry a
  `toolUseId` at all, so pre-field duplicates are unmeasurable by this method.
  This is the open ROADMAP item at line 238, now confirmed on disk.

## History of this crash family

| Date | Shape | Time to OOM | Status |
|---|---|---|---|
| 2026-08-15 (×8) | ~1,000 concurrent *writes* on transcript replay | ~30 s | **Fixed** — PR #318 queued the writer |
| 2026-08-23 | slow *read*-side accumulation | 60 h | not diagnosed at the time |
| 2026-08-27 | slow *read*-side accumulation | 12.5 h | this document |

Every crash of the installed app in journal history (since 2026-08-03) is this
same V8 heap OOM. There are no other crash causes on record.

## Ruled out

- **Sync leases.** 6,617 `[lease] renew … null (hub gave no answer)` dominated
  the log and look damning. They are not it: the 2026-08-23 crash hit the same
  ceiling with leases returning `ok=true` throughout. A full audit of
  `lease-client.ts` / `sync-hub-socket.ts` found every per-attempt allocation
  released and exactly one timer rescheduled per tick.
- **Hub reconnect fan-out.** Only 3 `hub connected` events in the whole run.
- **System memory.** 121 GB total, 68 GB free at the moment of death.
- **A fresh instance leaking on its own.** Sampled the relaunched app every 10 s
  for 10 minutes under light use: flat, 860–1030 MB, no upward drift. The leak
  requires sustained agent file-writing.

## Fix shape (levers 1 + 3 shipped in PR #335; lever 2 open)

Two independent levers; the first is the real fix.

1. **Cap concurrent sidecar parses.** A read-side coalescer mirroring
   `appendQueues`: in-flight reads for the same project root share one parse.
   This bounds memory to *one* parsed sidecar per project regardless of burst
   size — the same guarantee PR #318 gave the writer, which is what made the
   writer safe. Cheapest, highest-value, no data touched.
2. **Stop the file growing.** (a) Close the CC-resume re-record — ROADMAP line
   238 already has the design shape (`conversationId` + dual-id matching in
   `LIST_SESSION` and the drawer) and warns that a naive dedupe would *empty*
   the drawer for resumed sessions. (b) Decide what happens to records for
   worktrees that no longer exist — 39% of the file. Deleting them is a
   data-touching call on Destin's own project history and must be his decision,
   not a bugfix side effect (PR #318 made exactly this call and it should
   stand).

3. **Kill the CAS re-parse** (`cas-write.ts:180`) — extract `updatedAt` with a
   bounded regex over the first few hundred bytes instead of `JSON.parse` on
   6.4 MB. One line, removes a whole parse from every write.

A read coalescer alone makes the crash stop. Trimming alone only postpones it.

## Secondary findings (real, but not the cause)

Found while sweeping main for unbounded growth. None is >1% of the sidecar cost;
all are genuine misses worth a small cleanup PR.

- **Four per-session maps with no teardown**, all keyed by session id and never
  deleted: `lastModelSeen` (`ipc-handlers.ts:2178`), `lastSessionModelState`
  (`:2655`), `specialistSpawnCounts` (`native-session-host.ts:329`),
  `childApprovedAsks` (`:397`). Their neighbours *are* cleaned in the
  `session-exit` handler (`ipc-handlers.ts:2976-2981`) and
  `NativeSessionHost.destroy()` (`:3596-3622`) — these four were simply missed.
- **`WindowRegistry.subscriptions`** (`window-registry.ts:104`) — `releaseSession()`
  (`:95`) clears `ownership` only, so a dead session's subscription entry
  survives until its subscriber window closes.
- **`SubagentIndex.unmatchedParents`** (`subagent-index.ts:49`) — no TTL sweep,
  unlike the sibling `pending` map which has `pruneExpired` (`:123`). A `Task`
  whose subagent JSONL never materialises is retained for the session's life.
- **`pendingOutput`** (`ipc-handlers.ts:1637`) — uncapped PTY buffer, but only
  for a session that never mounts a `TerminalView`; drains within a second on
  the normal path. Worth a cap, not a suspect.
- **`attentionReports` inner map** (`main.ts:426`) — per-session entries clear
  only when the renderer volunteers `{ clear: true }`; no main-side
  `session-exit` cleanup.

Explicitly checked and **clean**: `ModelCatalog.memo` (single instance, 24 h
TTL — the 5 MB `provider-catalog-cache.json` is not duplicated),
`RemoteServer.ptyBuffers`/`hookBuffers` (ring-trimmed + deleted on exit),
`TranscriptWatcher` (bounded dedupe sets, `stopWatching` deletes),
`HarnessSession.history` (two-stage compaction), `hook-relay` `pendingSockets`,
`McpConnection.stderrBuffer`, `sync-spaces` `recentEvents` (capped at 50),
`pty-worker.js` (separate process; its one buffer capped at 50,000 chars).

## Guards to add

- `artifact-store.test.ts`: a burst of N concurrent `LIST_SESSION`-shaped reads
  against one project performs **one** parse (mirror of the existing "burst
  coalescing" write test).
- A pinning test that fails when the sizing comment's assumption and the
  structure's real cost diverge, or at minimum update `artifact-store.ts:333`.

## Reproduction (done 2026-08-27, with the fix)

Never against the live app. A copy of the real sidecar (by then 6.9 MB /
22,017 versions) in a scratch project, one Node process running the built
`artifact-store.js` with `--max-old-space-size=2800` (the app's ceiling), and a
`Promise.all` burst of N reads:

```
old  N=60:   60 parses, peak heap 1,188 MB, 622 ms
old  N=477:  FATAL ERROR: Ineffective mark-compacts near heap limit
             Allocation failed - JavaScript heap out of memory
new  N=477:  1 parse,   peak heap 25 MB,    15 ms
```

The 477 is the copy count from the core dump; the failure text is the
journal's. Guards: `tests/artifacts/sidecar-cache.test.ts`,
`cas-write.test.ts` ("head probe"), `artifact-store.test.ts` ("zero
JSON.parse on the CAS path").
