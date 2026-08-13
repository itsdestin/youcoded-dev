---
status: superseded
created: 2026-08-12
type: handoff
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
---

# Handoff — M5 permissions maturity, items 2b and 2c

Paste the block at the bottom into a fresh session, or just read this file.

## Where things stand

**2a is shipped.** youcoded **#311** (management UI + store `list`/`remove`/`removeProject` +
host revocation + five-surface IPC) and **#312** (external-path always-allow consent fix) both
merged on 2026-08-12. Master was `70117da4` at the time of writing.

A user can now see every "Always allow" they granted to a native session and revoke it, and the
revocation reaches sessions that are **already running** — not just the file on disk. Spec, plan
and the previous handoff are archived under `docs/archive/`. The invariants live in
`.claude/rules/native-permissions.md`, which auto-loads on the permission files.

**2b SHIPPED 2026-08-12** (youcoded #313, merge `cfb3124d`) — the deny-list stop in full auto now
renders as a mode-branded safety stop (Run it / Skip it | Always Allow); spec + plan under
`docs/archive/`. The §2b section below is retained as the record of the problem statement only.

**2c is all that remains in M5.** **The ordering constraint that blocked it is
now lifted** — it was blocked on revocation existing, and it does. Note 2b added
`permissionMode` to the ask payload and moved `subject-glob` to `src/shared/` — the 2c design
should read the shipped safety-stop confirm (`ToolCard.tsx`) before changing rule shape, since
whatever pattern shape wins must survive being echoed in that confirm and in `describe-rule.ts`.

## Read first

- `docs/active/plans/2026-08-11-native-sessions-remaining-work.md` §2 Step 2 — the full statement
- `.claude/rules/native-permissions.md` — the 2a invariants you must not break
- `desktop/src/main/harness/permission-engine.ts` — 40 lines, the whole decision function

**Pull before anything.** Master moves several times a day.

---

## 2b — Full Auto prompt coherence

**The problem.** Full Auto means approve-everything, but the mode still surfaces a two-button
"Nevermind, allow once / Allow Always" prompt. Asking a question the mode has already answered
trains the user to click through prompts, which is the failure mode the whole permission design
exists to avoid.

**Where to look.** `PermissionButtons` in `src/renderer/components/ToolCard.tsx:285`, whose
`canAlwaysAllow` gate is at `:314` and the button itself at `:462`. The mode lives on the host —
`NativePermissionMode` is validated at `native-session-host.ts:290`.

**The decision to make**, per the program doc: auto-approve-plus-log, or a single acknowledge
card. That is a real design choice, not an implementation detail — **use the UI Workbench's
compare view for it** (`?mode=workbench&view=compare`), the way 2a's mode control was settled
over three rounds. `dev/workbench/compare/registry.tsx` is the file you edit; its header states
the authoring rules. Do NOT iterate by handing Destin a series of URLs — he asked for the compare
view explicitly, and the rounds are the record of how a design got where it did.

**What must stay true.** Full Auto is *not* absolute: `DESTRUCTIVE_DENY_LIST` entries are `ask`,
and they still fire in Full Auto. So whatever you build has to keep asking about those four
things — deleting, `git push`/`reset --hard`, `sudo`, `format` — while not asking about anything
else. The shipped Permissions screen already tells the user exactly that, so its copy and your
behaviour must agree.

---

## 2c — Bash always-allow rule shape

**The problem.** Bash's permission subject is the literal full command string
(`tools/bash.ts:484` — `permissionSubject: (a) => a.command`), and the matcher anchors
`^…$` (`tools/subject-glob.ts`). So "always allow `git push origin main`" grants **nothing**
for `git push origin dev`. Every grant is one exact command string.

**Why this was deliberately last.** Remembered rules are the **final** layer
(`permission-engine.ts:33` — last match wins, and the header says so explicitly), which means they
outrank the destructive deny-list. That accidental narrowness has been the only thing limiting
blast radius. Now that revocation exists, widening is safe to design — but a wider rule shape is
a genuine security change, so treat it as one.

**The design space**, per the program doc: prefix rules, argv-head matching, or a user-editable
pattern at confirm time. Things worth weighing:

- `subject-glob.ts`'s `*` deliberately crosses separators, and a bare `git push` already matches
  the pattern `git push*` because `*` matches empty. Read that file before designing — it is 15
  lines and it constrains everything.
- The deny-list's compound `* …` variants exist *because* the matcher anchors. If you change
  anchoring, re-check every `DESTRUCTIVE_DENY_LIST` entry — a widened matcher could make
  `* rm *`-style patterns over-match, or a narrowed one could let `cd repo && git push` slip.
- A user-editable pattern at confirm time is the option that keeps the user sovereign, but it puts
  glob syntax in front of a non-developer. The shipped screen renders rules in plain English via
  `components/permissions/describe-rule.ts` — whatever shape you pick has to survive being
  described there, or the management UI starts showing syntax it was built to hide.

**Guard tests you will trip:** `tests/permission-engine.test.ts`, `tests/permission-store.test.ts`,
`tests/native-session-host.test.ts`, `tests/permissions-section.test.tsx`.

---

## Traps specific to this work

- **Never canonicalize `ctx.cwd`.** The permission store is keyed by its slug; changing the
  spelling orphans every remembered grant a user has.
- **Removal keys by SLUG, never by cwd**, and the host's `revokeRule`/`revokeProject` are the only
  entry points — the store's `remove`/`removeProject` are disk-only and must never be called from
  IPC, or a running session keeps a grant the user just revoked.
- **A `false` return means nothing matched** — the caller's list was stale. The renderer keeps the
  row and says so. Never report success.
- **`verify.sh` is Linux-only.** The three-platform matrix on the PR is the real gate. As of
  2026-08-12 **master itself is red on Windows** with
  `desktop/tests/harness-tools-core.test.ts > Bash > persistent_env` — inherited from `a2b0e35f`,
  unrelated to permissions. `tests/sync-warning-self-clear.test.ts` is **flaky on macOS**
  (an `atomicWrite` rename ENOENT); it passed on re-run for #312. Attribute before assuming.
- **Five-surface IPC parity** if you add a channel: `ipc-handlers.ts`, `preload.ts`,
  `remote-shim.ts`, `remote-server.ts` (explicit WS case — there is no generic passthrough), and
  `SessionService.kt`. Pinned by `tests/ipc-channels.test.ts`.
- **Some guards do not scan every directory.** `tests/helpers/guard-scope.ts` has
  `IN_SCOPE_DIRS = ['', 'development', 'ui']`, so a component under `components/<subdir>/` is NOT
  seen by `item-list-authority` or `setting-row-authority`. If you build UI in a subdirectory,
  those guards are silently not protecting it.

## Do not collide

**`cwdToProjectSlug` is being split right now.** `worktrees/slug-repair` and
`worktrees/slug-repair-android` are implementing
`docs/active/plans/2026-08-12-project-slug-encoding-repair.md`, which replaces it with
`ccProjectSlug` + `nativeStoreSlug`. The frozen half preserves the collapse behaviour so 2a's
invariant survives, but the **name** changes in `permission-store.ts` and
`native-session-host.ts`, and `.claude/rules/native-permissions.md` anchors on the current name.
Whoever lands second updates the other. **Check whether that has merged before you start**, and
if it has, expect the rule's `verify:` anchor to be failing until someone repoints it.

Other live worktrees at time of writing — `git worktree list` first, this moves:
`ask-reference`, `perm-timeout`, `project-description`, `session-switch-animation`,
`xwayland-floater`, `eval-checks`, `eval-judge`, `harness-eval`, `spec-probes`, `spec-t3`,
`spec-t4`, `spec-t55`, `specialists-core`.

**youcoded #278 is NOT this work.** It is a permissions PR on the *Claude Code* hook-relay path,
stale since 2026-07-31 with conflicts, still on `worktrees/perm-timeout`. It never gated M5.
Judge it separately.

## Known bugs already captured (do not re-file)

- **Settings → Backup & Sync crashes the workbench.** `mock-shim.ts` has no `sync` namespace, so
  `sync.getStatus()` falls through the catch-all proxy and returns `[]`, which is truthy — then
  `SyncPanel.tsx:1479` reads `.length` off `undefined`. Pre-existing on master. In `ROADMAP.md`.
- **`NativeSessionHost.askPermission` has zero callers** — the live path is `askUser` →
  `this.broker.ask(req)`. Dead code. In `ROADMAP.md`.

---

## Paste-into-a-new-session prompt

> Continue the YouCoded native-sessions program. Start by reading
> `docs/active/handoffs/2026-08-12-native-sessions-m5-2bc.md`, then
> `docs/active/plans/2026-08-11-native-sessions-remaining-work.md` §2 Step 2.
>
> **M5 item 2a shipped on 2026-08-12** (youcoded #311 and #312) — a user can now see and revoke
> every "Always allow", and revocation reaches already-running sessions. What remains is **2b**
> (Full Auto still shows an allow-once/allow-always prompt, which is incoherent in a mode meaning
> approve-everything) and **2c** (Bash's always-allow grants exactly one literal command string,
> because the subject is the full command and the matcher anchors `^…$`).
>
> 2c was deliberately blocked behind 2a because remembered rules outrank the destructive
> deny-list, so their narrowness was the only thing limiting blast radius. **That block is now
> lifted** — but treat widening as the security change it is.
>
> Brainstorm and spec before writing code. For 2b's design choice, **use the UI Workbench's
> compare view** (`?mode=workbench&view=compare`, authored in
> `dev/workbench/compare/registry.tsx`) rather than handing over a series of URLs.
>
> Before anything: `cd youcoded && git fetch origin && git pull origin master`. Use a worktree,
> and check `git worktree list` first — a slug-encoding repair is in flight that renames
> `cwdToProjectSlug`, which the permission store keys on.
>
> Note `scripts/verify.sh` is Linux-only and master is currently red on Windows from unrelated
> work, so attribute any matrix failure before assuming it is yours.
