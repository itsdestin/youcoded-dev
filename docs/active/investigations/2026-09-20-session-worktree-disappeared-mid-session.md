---
status: active
created: 2026-09-20
feature: workspace session worktrees — a mid-session disappearance and what it proves about uncommitted work
---

# A session worktree vanished mid-session, and took the only copy of the work with it

Destin asked for a one-line cursor fix on the buddy mascot. The fix was made, tested and
verified in a session worktree. He then said **"my pc crashed. however, that data loss seems
like a separate youcoded bug we should investigate."**

This is that investigation. The work was rebuilt and shipped (`youcoded` 70830d672), so the
loss cost one session's re-do — roughly the edit, a test, a verify run and a dev launch. The
point of writing it down is the mechanism, because it will happen again.

## What happened, in order

| Time (MST) | Event | Evidence |
|---|---|---|
| 16:25:32 | `workspace-start --session buddy-cursor youcoded` creates the worktree; manifest written | sync report `1789946732448-1905466` |
| 16:27 | Fix made, 3 tests added, `verify.sh` green, guard shown red-then-green | session transcript |
| **19:16:02** | **`kwin_wayland` dumped core (SIGABRT). The whole desktop session died** | `journalctl -b 0`: `systemd-coredump[252774]: Process 1773 (kwin_wayland) … signal 6/ABRT` |
| 19:16:22 | YouCoded relaunched — Plasma coming back, **not a reboot** | `ps -eo lstart`; uptime continuous since 14:23:47 |
| 19:23:16 | The app repo's shared checkout fast-forwarded to current master | `git reflog show master` (youcoded) |
| 19:41:11 | Another session's `workspace-start` ran | `worktrees/sessions` mtime; sync report `1789958470494` |
| ~21:48 | Next turn: the worktree is gone — directory, git admin dir, `session/buddy-cursor` branch **and** its manifest | `git worktree list`, `ls .git/youcoded-sessions/`, `git branch` |

## The crash is a red herring

**No reboot occurred.** `uptime -s` reads 14:23:47 and the boot id is unchanged, so the
machine never went down. What crashed was the display server, and it took the app with it.

More decisively: **the loss was a clean, coordinated removal, not a torn write.** All four
artifacts vanished together — the worktree directory, its `.git/worktrees/<name>` admin dir,
the branch in the app repo, and the registry manifest. A crash damages files; it does not
un-register a worktree and delete a branch. `git worktree prune -n -v` reports nothing to
prune, so nothing was left half-removed either.

## Why there was no second copy

Three independent gaps, any one of which would have saved the work:

1. **Uncommitted work has no other copy.** The edits existed only in that directory. There is
   no auto-stash, no WIP commit, and no backup of a dirty worktree.
2. **`workspace-start` records the session branch, not a safety ref.** A worktree that has
   committed *nothing* holds no ref anywhere — its branch points at the same commit as master
   and is indistinguishable from it. (Correcting a claim made mid-session: the manifest does
   record `branch: session/buddy-cursor`, not master — `repositories.workspace.branch`. But a
   branch with zero commits on it preserves nothing, which is the actual gap.)
3. **`workspace-start` reuses a natural key silently.** With the manifest gone, re-running
   `--session buddy-cursor` created a **fresh** worktree at today's master with no warning.
   That is how the work was rebuilt — and it means a session that lost work and retried the
   same key would see a clean, empty worktree rather than a hint that anything was lost. The
   guard at `scripts/workspace-start.mjs:350` ("Missing recorded worktree … it will not be
   recreated automatically") can only fire when the *manifest* survives — the manifest is the
   one file whose loss silences the alarm.

## What could not be established

**What issued the removal.** Searched, with results:

- `scripts/` — nothing removes a worktree or a manifest. `workspace-start.mjs` only writes
  one; `close-out.sh` *reports* a still-registered worktree as a TODO but never removes it.
- The app (`youcoded/desktop/src`) — `git-service.ts` and `git-watcher.ts` only *read*
  worktree state (`worktreeAddCounts`, file counts). No removal path, no branch deletion.
- `feat/dev-dashboard` — has a "Safe to delete" pill, but `DevDashboard.tsx:217` is explicit
  that it is **clipboard only**: "No delete button lives on this page."
- `.claude/hooks/context-inject.sh` — *detects* leftovers and unregistered dirs and tells the
  session to prune; it never runs `git worktree prune` itself.
- Journal — no command line, no `worktree` mention anywhere this boot.

The one documented path that does run `git worktree remove` + `prune` is the
`superpowers:finishing-a-development-branch` skill (`SKILL.md:178-179`), whose own docs list
known failure modes including removal from inside the worktree being removed. Whether it ran
here is **not established** and is not asserted. A parallel session was active on this machine
at 19:41 and may have been cleaning up.

## The narrow ask

Whatever removed it, the durable gap is the same: **a session worktree can be reaped while it
holds the only copy of its work, and nothing notices.** The cheapest useful shape, not
specified here: `close-out.sh` refuses (or warns loudly) when the worktree it is about to
remove has uncommitted files, and `workspace-start` says something when it recreates a key
whose manifest disappeared recently.

Filed in `docs/roadmap/dev-workspace.md` → knowledge.
