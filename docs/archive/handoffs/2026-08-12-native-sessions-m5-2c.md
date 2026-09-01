---
status: shipped
created: 2026-08-12
type: handoff
program: docs/archive/plans/2026-08-11-native-sessions-remaining-work.md
supersedes: docs/archive/handoffs/2026-08-12-native-sessions-m5-2bc.md
---

# Handoff — M5 permissions maturity, item 2c (the last one)

Paste the block at the bottom into a fresh session, or just read this file.

## Where things stand

**2a shipped 2026-08-12** (youcoded #311 + #312): every "Always allow" is listable and revocable
in Settings → Permissions, and revocation reaches running sessions.

**2b shipped 2026-08-12** (youcoded #313, merge `cfb3124d`): in Full auto, the deny-list stop now
renders as a mode-branded safety stop — amber band, per-family copy, **Run it / Skip it | Always
Allow** — instead of the generic row. Settled over four compare-view rounds (workbench surface
`full-auto-ask`; its rounds are the record). Spec + plan:
`docs/archive/{specs,plans}/2026-08-12-full-auto-prompt-coherence.md`.

**2c is all that remains in M5.** Master was `cfb3124d` at the time of writing.

## Read first

- `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md` §2 — the program statement
- `.claude/rules/native-permissions.md` — the 2a invariants you must not break
- `desktop/src/main/harness/permission-engine.ts` — ~40 lines, the whole decision function
- `desktop/src/shared/subject-glob.ts` — **moved by 2b** (was `main/harness/tools/`), 15 lines
  of matcher that constrain everything; the renderer now imports it too

**Pull before anything.** Master moves several times a day.

---

## 2c — Bash always-allow rule shape

**The problem.** Bash's permission subject is the literal full command string
(`tools/bash.ts` — `permissionSubject: (a) => a.command`), and `subjectMatches` anchors
`^…$`. So "always allow `git push origin main`" grants **nothing** for `git push origin dev`.
Every grant is one exact command string.

**Why it was last.** Remembered rules are the FINAL engine layer (last match wins), so they
outrank the destructive deny-list; the accidental narrowness was the only blast-radius limit.
Revocation (2a) exists now, so widening is safe to design — **but it is a genuine security
change; treat it as one.**

**The design space**, per the program doc: prefix rules, argv-head matching, or a user-editable
pattern at confirm time. Standing considerations from the 2bc handoff, still true:

- `subject-glob.ts`'s `*` deliberately crosses separators, and `*` matches empty — a bare
  `git push` already matches `git push*`. Read the file before designing.
- The deny-list's `* …` compound variants exist BECAUSE the matcher anchors. Any anchoring
  change requires re-checking every `DESTRUCTIVE_DENY_LIST` entry — over- and under-match both
  have real consequences there.
- A user-editable pattern keeps the user sovereign but puts glob syntax in front of a
  non-developer; whatever shape wins must survive `components/permissions/describe-rule.ts`
  (plain-English rendering) or the management UI starts showing syntax it exists to hide.

**New constraints 2b added (not in the old handoff):**

- The deny-listed "Always allow" confirm (both the generic row's and the full-auto safety
  stop's — one shared component in `ToolCard.tsx`) says **"Always allow this exact command"**
  and echoes `input.command` verbatim, and its body copy is owner-set
  ("…you won't be asked again during future sessions in this project"). A widened rule shape
  makes "this exact command" FALSE — the confirm copy is part of 2c's surface, and copy is
  Destin's call (2b's subline went through three owner iterations; do not invent wording).
- `permissionMode` now rides the broker ask payload and the tool entry
  (`full-auto && denyListed` → safety-stop footer). If 2c adds anything to the ask payload,
  follow that pattern (validated at the dispatcher, display-only, never persisted).
- The renderer classifies deny-listed commands by re-matching against the shared list
  (`components/permissions/deny-list-copy.ts`). If rule shape changes how deny-list patterns
  are written, that classifier's family mapping must move in the same commit.

**Guard tests you will trip or must extend:** `permission-engine.test.ts`,
`permission-store.test.ts`, `native-session-host.test.ts`, `permissions-section.test.tsx`,
`describe-rule.test.ts`, `subject-glob.test.ts`, and 2b's new
`tool-card-full-auto-stop.test.tsx` + `permission-confirm-card.test.tsx` (both pin the confirm
copy verbatim).

**Design workflow:** Destin settles visual/copy decisions in the workbench compare view
(`?mode=workbench&view=compare`, authored in `dev/workbench/compare/registry.tsx` — its header
states the rules; `ACTIVE_FIRST` currently points at `full-auto-ask`, flip it to your new
surface). Brainstorm → spec (`docs/active/specs/`) → plan → worktree, the way 2a and 2b ran.

## Traps carried forward (verified still true 2026-08-12 end of day)

- **Never canonicalize `ctx.cwd`**; removal keys by SLUG; host `revokeRule`/`revokeProject` are
  the only revocation entry points; a `false` return means nothing matched — full statements in
  `.claude/rules/native-permissions.md`.
- **`verify.sh` is Linux-only; master is red on Windows** — `harness-tools-core.test.ts > Bash >
  persistent_env`, inherited from `a2b0e35f`, reconfirmed on #313's matrix tonight. macOS
  `sync-warning-self-clear` is a known flake. Attribute before assuming.
- **Five-surface IPC parity** if you add a channel (`ipc-handlers`, `preload`, `remote-shim`,
  `remote-server` WS case, `SessionService.kt`) — pinned by `ipc-channels.test.ts`.
- **`tests/helpers/guard-scope.ts` does not scan `components/<subdir>/`** — UI you add there is
  invisible to `item-list-authority` / `setting-row-authority`.

## Do not collide (as of this writing — `git worktree list` first, this moves)

- **`cwdToProjectSlug` split still in flight**: `slug-repair` + `slug-repair-android` worktrees
  (plan `docs/active/plans/2026-08-12-project-slug-encoding-repair.md`) rename the function the
  permission store keys on; `.claude/rules/native-permissions.md` anchors the current name.
  Whoever lands second updates the other. NOT merged yet — reconfirmed tonight.
- **`feat/preparing-tool-cards` appeared tonight** — someone is already on the tool-streaming
  visibility work (`docs/active/handoffs/2026-08-12-tool-streaming-visibility.md`). It touches
  `harness-session.ts`, `ToolCard.tsx`, and the reducer — the same files 2c's confirm-copy work
  grazes. Coordinate or land fast.
- Other live worktrees tonight: `ask-reference`, `perm-timeout`, `harness-eval`,
  `project-description`, `session-switch-animation`, `xwayland-floater`, `resize-paint-race`,
  `native-specialists-background` (+ two specialists lanes).
- **youcoded #278 (perm-timeout) is NOT this work** — stale CC-path permissions PR, judge
  separately.

## Known bugs already captured (do not re-file)

- Settings → Backup & Sync crashes the workbench (`mock-shim.ts` has no `sync` namespace). In
  `ROADMAP.md`.
- `NativeSessionHost.askPermission` has zero callers (live path is `askUser` → `broker.ask`).
  In `ROADMAP.md`.
- An orphaned Vite from an old session may still hold port 5223 out of the MAIN checkout
  (pid was 3896313 tonight) — if `run-dev.sh` fails to bind, that's why; use `--offset 70
  --profile <name>` or kill it after checking ownership.

---

## Paste-into-a-new-session prompt

> Continue the YouCoded native-sessions program — M5 item 2c, the last one. Start by reading
> `docs/active/handoffs/2026-08-12-native-sessions-m5-2c.md`, then
> `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md` §2.
>
> **2a and 2b are shipped** (revocation UI; full-auto safety stop). What remains: **Bash's
> always-allow grants exactly one literal command string** — subject is the full command,
> matcher anchors `^…$`. Design a wider rule shape (prefix rules, argv-head matching, or a
> user-editable pattern at confirm time). Remembered rules outrank the destructive deny-list,
> so **treat widening as the security change it is**.
>
> Brainstorm and spec before code. Settle any visual/copy choice in the workbench compare view
> (`dev/workbench/compare/registry.tsx`), not by handing over URLs — and note the shipped
> confirm says "Always allow this exact command", which a wider shape makes false; that copy is
> Destin's to set. Before anything: `cd youcoded && git fetch origin && git pull origin master`,
> use a worktree, and check `git worktree list` — the slug-encoding repair (renames
> `cwdToProjectSlug`) and a tool-streaming-visibility branch are in flight nearby.
>
> `scripts/verify.sh` is Linux-only and master is red on Windows from unrelated work
> (`persistent_env`); attribute any matrix failure before assuming it is yours.
