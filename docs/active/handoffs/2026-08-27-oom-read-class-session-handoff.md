---
title: Session handoff — the artifacts-sidecar OOM, the read-side bug class sweep, and the paused paged-history spec
date: 2026-08-27
status: active
tags: [artifacts, memory, crash, conversations, chat-reducer, android, handoff]
related:
  - docs/active/investigations/2026-08-27-artifacts-sidecar-oom-crash.md (the crash; status shipped)
  - docs/archive/specs/2026-08-27-paged-history-and-read-hardening-design.md (the rest; PAUSED, unreviewed)
  - ROADMAP.md → "The app still OOM-crashes on a long session" ([x]), "Paged conversation history" ([ ]), "Android artifact store has neither the write queue nor a read guard" ([ ])
---

# Session handoff — 2026-08-27, OOM read-side class

One session, one afternoon. Written so another device can pick this up cold.

## What was asked, in order

1. "Find today's OOM investigation; spec/implement the fix(es)."
2. "First thoroughly investigate the codebase for other areas hitting the same
   or similar bug class; fix everything together if others exist."
3. "Think about the most correct/robust long-term fix. I want to deal with
   transcript replay." → paged history approved: auto-fetch older messages
   when scroll reaches the top; evict pages after a while out of view.
4. "What is the simplest fix for now just to prevent the crash?"
5. "Just do that for now; add the spec minus the basic fix with a roadmap
   pointer, marked paused/unreviewed."

## What was DONE

### Shipped — youcoded PR #335, master `9dc0d9c7` (desktop only)

`readSidecarShared` in `desktop/src/main/artifacts/artifact-store.ts`: one
parsed copy of `<project>/.youcoded/artifacts.json` per project, validated by
size + mtime (a stat, not a read), concurrent callers share one in-flight
parse, a committed `writeSidecar` seeds it with the object it just wrote,
idle copies drop after 60 s. The read-only handlers (list-session,
list-project, get, save, check-existence, the binary-roots pass, the projects
index, the project watcher's id map, `ensureProject`) use it. The five
mutate-and-write paths (`appendVersionsDirect`, `removeArtifactRecord`,
`renameArtifact`, `runSidecarMigration`, the manual include/exclude handlers,
`import-project`) keep the private `readSidecar` — a writer mutating the
shared object would leak a never-committed state into every reader.

`casWrite` (`cas-write.ts`) reads its comparand from a 4 KB head probe with a
whole-file fallback; the store's extractor is now a regex, not `JSON.parse` of
6.4 MB per write.

**Reproduced, not assumed** — one Node process, the built `artifact-store.js`,
a copy of Destin's real sidecar (6.9 MB / 22,017 versions by then),
`--max-old-space-size=2800` (the app's ceiling):

```
old  N=60:   60 parses, peak heap 1,188 MB
old  N=477:  FATAL ERROR: Ineffective mark-compacts near heap limit   ← the journal's text; 477 = the core dump's copy count
new  N=477:  1 parse,   peak heap 25 MB
```

Guards: `tests/artifacts/sidecar-cache.test.ts` (8 cases), `cas-write.test.ts`
→ "head probe", `artifact-store.test.ts` → "zero JSON.parse on the CAS path".
`verify.sh` green: tsc, full suite (6,452), knip, eslint, ast-grep. Worktree
and branch removed.

**Not yet in Destin's installed app.** The installed build is 1.3.0-beta.16
(built Aug 15). The fix reaches it on his next build; until then the live app
can still die the same way.

### Documented

- Investigation doc → `status: shipped`, reproduction section filled in,
  "Fix shape" marked levers 1 + 3 shipped / lever 2 open.
- ROADMAP: the OOM entry flipped to `[x]` with the PR/sha; two new entries
  (paged history; Android store parity) pointing at the spec.
- The spec (below).
- `.claude/rules/artifacts.md` → Concurrency gains the shared-read bullet;
  `youcoded/docs/artifacts.md` → Concurrency gains the depth paragraph.

### The sweep (six parallel search agents; every claim below was re-verified by hand)

The bug class — "read a whole file into memory and unpack it, on a path that
fires often, with nothing stopping many copies existing at once" — was found in
five places. Sizes are from Destin's machine on 2026-08-27.

| Where | Size | Finding | Status |
|---|---|---|---|
| Artifacts sidecar, desktop | 6.4 MB | ~11 parses per Edit (investigation said 5 — it missed `artifacts:get` per visible tool card, check-existence, and every open tab at startup); CAS parsed 6.4 MB for one timestamp | **fixed** |
| Artifacts sidecar, Android | same | NO write queue (PR #318 never reached Kotlin); 3 full reads per tool event; every bridge message on its own `Dispatchers.IO` coroutine; pretty-printed writes; CAS full parse | ROADMAP bug, spec §3 |
| CC transcripts + subagents | 75 MB + 90 MB per session | reload replays every open tab whole and synchronously; resume re-reads the whole file through the live tailer from byte 0 PLUS a text-only "last 10"; phone `chat:hydrate` ships the desktop window's entire chat state | spec §2 (paged history) |
| Conversation list / last-model / history previews | 768 files, 25 MB | `Promise.all` over every file; an old-encoding folder (`PAF-574…,…&…`) never resolves and is fully re-read on every list open; whole-file reads for one line | spec §4 |
| Model catalog | 5 MB | memoised but not single-flight | spec §4 |

Verified clean: sync-spaces engine, hub sockets, remote-server buffers
(ring-trimmed, freed on exit), live transcript tailing (offset reads),
chat-search indexer (8 MB chunks, single-flight), renderer IPC listeners.

Renderer: no fan-out bug; retention only (every tool result kept in full per
open session, no virtualisation, `artifact-tracker.ts` never drops a closed
session's list, `seenUuids` cloned per event = O(n²) CPU on a big replay).

Disk-only, not memory: `~/.youcoded/repair-quarantine` is 194 MB / 25 dirs and
grows ~19 MB per DEV launch — the installed app (pre-slug-split) recreates
old-encoding folders at every start, and each dev instance run from master
quarantines them again. Stops when the installed app is upgraded. Nothing
deletes the directory.

## What was NOT done (and why)

- **Paged history, Android parity, the smaller readers** — designed, written
  up, and PAUSED by Destin after he asked for the simplest crash fix first.
  The spec has **not** had a spec review and has **no plan**. Do not implement
  from it directly; run a spec review, then `superpowers:writing-plans`.
- **Shrinking the sidecar** (39% is 107 deleted worktrees, 14% CC-resume
  re-records, 17% `read` events) — Destin's data decision, deliberately kept
  out of a bugfix, as PR #318 also chose.
- **Deleting the quarantine folder** — same; and it self-resolves on upgrade.
- **Capping tool-result bytes in the reducer / virtualising ChatView** — out of
  scope, listed in the spec's §6.
- **Dev-instance (Electron) verification** — the repro was a bare Node process
  against the built store module; nothing was launched. Sufficient for a
  memory claim; the paged-history work WILL need `run-dev.sh` and Destin's eyes
  on scroll anchoring (flag, don't script).

## Decisions Destin made (don't relitigate)

- Paged history over "stream + virtualise" or "stream + coalesce only".
- Auto-fetch on scroll-to-top (no button); evict after time out of view.
- Constants: 30 turns / 2 MB per page; evict after 5 min out of view once
  loaded history > 2 pages; never below one page.
- Ship the crash fix alone first; everything else waits.

## Picking this up on another device

```bash
bash setup.sh          # syncs every sub-repo and this workspace
```

Then read, in order: the investigation's **Summary**; the spec's **Status**
and **§2**; ROADMAP's three entries. If the goal is the paused work, start with
a spec review of the spec file — it was written from an approved conversation,
not reviewed as a document.

## Gotchas hit this session

- The main `youcoded/` checkout was 125 commits behind AND had another
  session's uncommitted edits (`Dialog.tsx`, `WorkbenchToolbar.tsx`, …), so
  `git pull` refused. Worked from a fresh worktree off `origin/master` and
  merged via `gh pr merge` instead of a local merge. `gh --delete-branch`
  then failed to check out `master` locally (held by the main checkout) —
  harmless; the remote branch was deleted by hand.
- `.claude/rules/artifacts.md` and `ipc-bridge.md` had another session's
  uncommitted wording-trim in the working tree. The shared-read bullet was
  committed against HEAD's version (via a staged blob) so the trim wasn't
  swept into my commit — but the follow-up step that re-inserted the bullet
  into the working-tree copy opened the file for WRITING before reading it
  and **emptied it, losing that session's uncommitted trim** (16 changed
  lines, semantic no-ops as far as the visible part showed). The file was
  restored to HEAD + bullet; the ~11 visible lines of the lost diff are in
  the untracked `.claude/rules/artifacts.md.recovered-trim.partial.patch`
  for whoever owns that trim. `ipc-bridge.md`'s pending trim was not touched.
  Lesson (also a memory): `open(p,'w')` truncates at evaluation time — read
  first, then write.
- A fresh worktree has no `node_modules`; `cp -al` from the main checkout
  (never a symlink — see CLAUDE.md) took seconds.
- `verify.sh` runs from the workspace root, not the worktree.
- The sidecar grew from 6.4 MB (01:46) to 6.9 MB (02:55) during the session —
  ~600 versions/day is real.
