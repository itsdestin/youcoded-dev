---
status: draft
date: 2026-08-09
kind: investigation
scope: youcoded/desktop — native harness permissions, Claude Code bypass parity
---

# Skip Permissions for native sessions

> **STATUS 2026-08-26 — NOTHING FROM THIS DOCUMENT HAS BEEN BUILT OR TRACKED, 17 days on.**
> - Step 1 unbuilt: `NativePermissionMode` on `origin/master` is still
>   `'ask' | 'auto-edit' | 'full-auto'` (`shared/permission-types.ts:7`) — no `'bypass'`.
> - Steps 2–4 unbuilt and **absent from `ROADMAP.md`**: `grep -ni "sandbox|scratch workspace|rm
>   analyzer|PermissionOverrides|landlock" ROADMAP.md` returns no matching item.
> - **No document anywhere references this one** (`rg -l 2026-08-09-native-skip-permissions
>   --glob '*.md'` → only itself). Its source conversation `d964c1da` is tagged
>   `Follow-Up Needed` and has been idle since 2026-08-10.
> - **The §2 finding is a live user-facing falsehood, still shipping.**
>   `desktop/src/renderer/components/SkipPermissionsInfoTooltip.tsx:42` on master still reads
>   "Even with the toggle on, Claude will still stop and ask before doing the really risky stuff…",
>   which measurement against CC v2.1.226 showed to be false on the Claude Code path. That is a
>   `bug`, independent of the native feature, and it is on no list. **This is the single highest-
>   priority item in this document and should be filed on `ROADMAP.md` immediately.**
> - Not superseded by the full-auto external-read work
>   (`docs/active/plans/2026-08-21-full-auto-external-read-bypass.md`) — that plan lifts the
>   external-directory ask for three READ tools inside `full-auto`; it does not add a bypass mode,
>   an `rm` analyzer, or touch the stale overrides.
> - Frontmatter stays `draft`, which is honest: no code was written and no decision was taken.

**The ask:** make the "Skip Permissions" toggle work for native-runtime sessions, auto-approving
basically everything except a narrowly defined set of tool calls, matching Claude Code's
`--dangerously-skip-permissions`.

This document records what exists today, what Claude Code's bypass mode *actually* does (measured,
not recalled), the options considered, and a proposed sequencing. No code has been written.

---

## 1. What we implement today

### Claude Code path (PTY sessions)

`skipPermissions: true` on session create appends `--dangerously-skip-permissions` to the CLI args
and reports the session's `permissionMode` as `'bypass'`.

- `session-manager.ts:113` — the flag
- `session-manager.ts:151` — `permissionMode: opts.skipPermissions ? 'bypass' : 'normal'`
- `App.tsx:2539` — `canBypass` gates whether `bypass` appears in the Shift+Tab cycle

On top of that, `main.ts:286-327` classifies the `PermissionRequest` events CC still fires under
bypass into five categories (`titleHook`, `protectedConfigFiles`, `protectedDirectories`,
`compoundCdRedirect`, `compoundCdGit`), and `main.ts:930-957` auto-approves a category if the user
enabled the matching `PermissionOverrides` toggle under **Settings → Defaults → Skip Permissions →
Advanced**. `titleHook` is always auto-approved; `AskUserQuestion` is never auto-approved.

### Native path (harness sessions)

Entirely separate machinery. `NativeSessionHost` owns a real per-session
`NativePermissionMode` — `'ask' | 'auto-edit' | 'full-auto'` — and `permission-engine.ts` decides
each tool call over four layers, **last match wins**:

```
presetRules → modeRules → DESTRUCTIVE_DENY_LIST → rememberedRules
```

- `rulesForMode()` (`shared/permission-types.ts:54`) — `full-auto` is `{tool:'*', action:'allow'}`
- `DESTRUCTIVE_DENY_LIST` (`shared/permission-types.ts:33`) — 14 Bash patterns (`rm`, `rmdir`,
  `del`, `git push`, `git reset --hard`, `sudo`, `format`), all `action: 'ask'`. Because it sits
  *above* modeRules, these still prompt even in `full-auto`.
- Remembered rules sit above the deny-list by design: an explicit "Always allow" beats it, which
  is why the deny-list entries are `ask` and not `deny`.

Below **all** configuration are two tool-layer guards in `harness/tools/guards.ts`
(`checkPathGuard`), reachable by no mode, preset, or remembered rule:

1. **Secret hard-deny** — dotenv files, credential basenames, `.ssh` / `.gnupg` / `.aws` /
   `.config/gh` segments. Error text says *"This cannot be overridden."*
2. **cwd jail** — a path outside the session cwd returns `external`, which becomes an
   `external_directory` permission ask.

Both guards are documented in that file as **honest friction, not a sandbox**: `Bash` can still
`cat .env`, and symlinks are not resolved.

### The actual gap

`App.tsx:2360` hardcodes `skipPermissions: false` for native creates, commented *"native sessions
have no PTY permission flow."* The toggle is hidden in three places: the welcome form
(`App.tsx:3059`), the SessionStrip create form, and the ResumeBrowser per-row control. So the
feature is not broken — it was deliberately never wired, and the native engine has no `bypass`
concept at all.

---

## 2. What Claude Code's bypass mode actually does

**Measured 2026-08-09 against the real CLI, v2.1.226, Linux, in throwaway directories.** These
supersede any recollection.

| Probe (under `--dangerously-skip-permissions`) | Result |
|---|---|
| `cd <dir> && rm -rf ./*` | **BLOCKED**, hard — not a prompt, a refusal |
| `Read` a `.env` inside cwd | allowed, no prompt |
| `Write` a file outside the working directory | allowed, no prompt |
| `cd <dir> && echo hi > f.txt` (compound cd + redirect) | allowed |
| `cd <dir> && git status` (compound cd + git) | allowed |
| `Write` to `.git/config` | allowed |
| `Write` to `$HOME/<file>` | allowed |

The block message was verbatim:

> Dangerous rm operation detected: '…/probe/*'
> This command would remove a workspace directory (the working directory, an additional working
> directory, or one of their parent directories). **This requires explicit approval and cannot be
> auto-allowed by permission rules.**

`strings` on the binary shows six messages in this family — workspace directory, critical system
directory, removal target not statically resolvable, glob traversing non-enumerable directories,
`$UNSET` expanding to `/`, and cd-before-removal. There is also an `antBuiltinDenyRules` symbol
that was **not** inspected; that layer may be wider than the `rm` family.

### What this means

CC's bypass is not "allow everything." It has one hardcoded **`rm`-target analyzer** sitting below
the permission system that no rule can auto-allow. It has **no** secret-file guard and **no** cwd
jail — the exact inverse of what native implements.

### Finding: our `PermissionOverrides` categories are stale

Four of the five categories `main.ts` classifies (`protectedConfigFiles`, `protectedDirectories`,
`compoundCdRedirect`, `compoundCdGit`) now sail through CC bypass untouched. The Advanced settings
section is therefore toggling categories that no longer fire, and
`SkipPermissionsInfoTooltip.tsx:42` currently tells users:

> Even with the toggle on, Claude will still stop and ask before doing the really risky stuff —
> things that could scramble your project's save history…

That is false on the Claude Code path as of v2.1.226. This is a **pre-existing bug independent of
the native work**, and it matters here because the native design was about to be copied from it.

---

## 3. Options considered

### 3a. How skip-permissions surfaces for native — **DECIDED**

| Option | Pros | Cons |
|---|---|---|
| **A 4th mode `bypass`, gated on the create toggle** ✅ chosen | Exact mirror of the CC path (`canBypass`); one mental model covers both runtimes; mode is visible in the chip and reversible mid-session | Adds a value to `NativePermissionMode`, the cycle, and the chip's display map |
| Redefine `full-auto` as bypass | No new mode | `full-auto` would mean two different things depending on how the session was created; the chip label would lie |
| Create-time flag only, no mode change | Simplest | Cannot turn bypass off without recreating the session |

### 3b. What still prompts in native bypass — **premise invalidated, needs re-decision**

Originally chosen: "exact CC parity set" — i.e. a `BYPASS_RESIDUAL_LIST` of protected config files,
`.git/`, `.claude/`, compound cd+redirect, compound cd+git, replacing `DESTRUCTIVE_DENY_LIST`.

**That decision rested on the stale category list in §2.** Measured CC parity would mean shipping a
residual set that is very nearly *empty* — while native has no `rm` analyzer to fall back on. The
live options are now:

| Option | Pros | Cons |
|---|---|---|
| **Port CC's `rm`-target analyzer** as native's non-overridable floor | Protects against the failure users actually hit; platform-independent pure logic; genuine parity with what CC does *now*; closes the hole that today's `rm *` deny-list entry leaves (it is only an `ask`, and one "Always allow" click defeats it permanently) | Real work — needs command parsing, glob/variable resolution, and its own test suite. Larger than "wire up the toggle" |
| Keep `DESTRUCTIVE_DENY_LIST` active in bypass | Zero work; safest | Diverges from CC: `rm`/`sudo`/`git push` keep prompting, so "skip permissions" means something different per runtime, and the tooltip copy has to fork |
| Auto-approve everything below the tool guards | Simplest; most permissive | Strictly weaker than CC; the Advanced settings section becomes dead for native |

### 3c. The two native tool-layer guards under bypass

| Guard | Proposal | Reasoning |
|---|---|---|
| Secret hard-deny | **Keep** in bypass | Costs nothing legitimate (nothing real reads `~/.ssh` through the `Read` tool) and it is the only line that survives every setting. Note it is a half-truth while `Bash` is unrestricted |
| cwd jail (`external_directory` ask) | **Drop** in bypass | This is real CC parity — CC allows outside-cwd writes under bypass. Otherwise every cross-repo file touch prompts and the toggle feels broken |

### 3d. Sandboxing (raised in discussion, **not** proposed for this work)

What sandbox-backed harnesses do: run the agent's shell and file tools under an OS-enforced policy
the process cannot lift. Linux — **Landlock** (unprivileged, self-restricting, covers filesystem
and, on newer ABI, TCP), plus `bwrap` namespaces and `seccomp-bpf`. macOS — **Seatbelt**
(`sandbox-exec -p`), long-deprecated and still universally used. Windows — **AppContainer** /
Job Objects / restricted tokens, none of which gives a clean writable-subtree rule without native
code; the strong option is Windows Sandbox (a disposable VM, Pro/Enterprise + Hyper-V).
Codex CLI is the reference implementation (`read-only` / `workspace-write` / `danger-full-access`,
with `.git/` writes specifically denied in workspace-write).

*Verified on this machine 2026-08-09:* kernel 7.1.3-2-cachyos, `landlock` present in
`/sys/kernel/security/lsm`, unprivileged user namespaces enabled, `bwrap` and `docker` installed.
The macOS/Windows/Codex details above are recalled, not measured.

**What it buys:** the protections that do not depend on the model cooperating or the user paying
attention — no `~/.ssh` reads, no `~/.bashrc` writes, no reaching other repos, and with network
gating, no exfiltration. It is the only real defense against prompt injection, because every other
layer is exactly what an injected instruction is trying to talk its way past.

**What it does not buy:** protection for the project directory, which must stay writable for the
agent to work. A sandboxed agent can still destroy your repo. **A sandbox and an `rm` analyzer solve
disjoint problems.**

**Why it does not fit this work:**

- *Uneven coverage.* Real on Linux and macOS, free on Android (app-UID isolation already),
  effectively cosmetic on Windows without significant native work. A "Safe Mode" that is a kernel
  boundary on one device and a suggestion on another is arguably worse than none, and sync/remote
  access means one person really does span devices.
- *Wrong user.* Sandbox denials (`npm install` with egress off, a build that wants `~/.cache`) are
  confusing to developers and undiagnosable for the students and professionals in the accessibility
  pillar. Every escape hatch added under that pressure is a hole; the end state is a sandbox that
  allows everything plus a maintenance burden.
- *Two runtimes.* Sandboxing the native `Bash` tool is tractable — we own the spawn, and it is the
  exact hole that makes today's file-tool guards decorative. Sandboxing the CC path means confining
  the whole `claude` process including its `~/.claude/` writes, hook subprocesses, and the
  transcripts the app watches.

**Cheaper alternative with the same spirit — "scratch workspace".** Run risky sessions against a
git worktree (or a plain copy for non-git folders), then show a diff to accept or discard. No kernel
primitives, identical on all five platforms, explicable in one sentence to a non-developer. It
bounds *"my work got wrecked"* rather than *"secrets were exfiltrated"* — genuinely different fears,
and the first is the one users have. It is **not** a prompt-injection answer and should not be sold
as one.

**If sandboxing is pursued later,** the highest-value narrow slice is Landlock/Seatbelt around the
native `Bash` tool only: opt-in per session, closes the `cat .env` hole, and on Windows we say
plainly that it is unavailable rather than pretending.

---

## 4. Proposed sequencing

1. **Native bypass mode** — add `'bypass'` to `NativePermissionMode`, seed it from the create/resume
   Skip Permissions toggle, un-hide that toggle in the three native-gated spots, extend the chip
   cycle and display map, keep the secret hard-deny, drop the `external_directory` ask under bypass.
   Four-surface IPC parity applies (`preload` / `ipc-handlers` / `remote-shim` / `SessionService.kt`)
   — `ipc-channels.test.ts` will catch a miss.
2. **Port CC's `rm`-target analyzer** as the non-overridable floor beneath native's permission
   layers, replacing the pattern-matched `rm *` deny-list entry. Pure logic, its own test suite,
   platform-independent. *Open: same piece of work, or a follow-up?*
3. **Fix or retire the stale `PermissionOverrides` categories** and the tooltip copy they back. This
   is a correctness bug on the shipping Claude Code path, independent of the native work.
4. **ROADMAP** the sandbox and the scratch-workspace idea as separate design passes. Neither belongs
   in this branch.

## 5. Open questions

- Is step 2 (`rm` analyzer) in scope for this branch, or a follow-up?
- Do the `PermissionOverrides` Advanced toggles apply to native bypass at all, given that four of
  the five categories appear dead on the CC path? (Leaning: retire the categories rather than mirror
  them.)
- Should `bypass` be offered on Android native sessions? Android has no native-runtime Kotlin path
  today (`.claude/rules/native-runtime.md` → "Android has none of this"), so this may be moot.
- Not investigated: `antBuiltinDenyRules` in the CC binary. If it contains non-`rm` entries, the
  parity picture in §2 is incomplete.
