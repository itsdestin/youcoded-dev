---
status: draft
---

# Full-Auto Interrupted by External-Directory Asks on Read Tools — Design

**Date:** 2026-08-18
**Status:** DRAFT (brainstorming — no code changed, no decisions ratified)
**Parent:** `2026-07-15-phase2-native-harness-design.md` (§2.3 workspace jail, §2.4 permission engine)
**Repo:** `youcoded/desktop/` (main-process harness: `harness-session.ts`, `tools/guards.ts`, `specialists/child-permissions.ts`)

## Problem statement (as reported)

While running a **native session in Full Auto** the user saw **yes/no approval prompts for Grep and Read** tool calls during what read as an autonomous sub-task. Full Auto is supposed to let the model run autonomously (walk-away autonomy); being asked to approve every read tool call contradicts that promise and reads as a bug.

The equivalent operation — reading the same file — is already silently permitted in Full Auto through Bash. So the prompts are (in the reporter's framing) friction with no safety gained.

> **UNCONFIRMED — the exact triggering paths.** We have a screenshot showing a sub-task browsing
> `home/destin/ask-the-budget-az-worktrees/citation-locate/webapp/src/pdf/CitedTextPanel.tsx`, but no
> session logs. We have NOT confirmed whether the prompted paths lay **inside** or **outside** the
> session's `cwd`. That distinction separates the two hypotheses below and changes the fix. See
> [Confirmation needed](#confirmation-needed).

## Confirmed facts (from code)

These are read directly off `master` and are NOT in dispute:

1. **Full Auto's permission baseline is allow-everything.** `rulesForMode('full-auto')` returns
   `[{ tool: '*', action: 'allow' }]` (`src/shared/permission-types.ts`). Grep/Read/Glob are additionally
   in the always-allowed set of *every* mode. Pinned by `tests/permission-engine.test.ts`. A **rule-based**
   ask for Grep/Read in Full Auto is therefore impossible.

2. **There is exactly one non-rule path that forces an ask regardless of mode: the external-directory
   path guard.** `harness-session.ts` (`runOneTool`, step 4):
   ```ts
   const decision: PermissionDecision = externalAsk
     ? { action: 'ask', denyListed: false }
     : await (this.opts.decide?.(call.toolName, subject) ?? ...);
   ```
   `externalAsk` is set only when `checkPathGuard(subject, this.opts.cwd, this.opts.internalReadRoots)`
   returns `external` — i.e. the subject is **outside the session's cwd jail** (`tools/guards.ts`).

3. **Grep and Read both have file-path subjects.** `Grep.permissionSubject = (a) => a.path ?? '.'`,
   `Read.permissionSubject = (a) => a.file_path`. So they are path-guarded (they are NOT in
   `NON_PATH_SUBJECT_TOOLS`). This is why Grep/Read can hit the external guard while Bash cannot.

4. **A Full-Auto prompt for a non-deny-listed ask renders as the generic Yes/No row, not the Full-Auto
   safety-stop.** The Full-Auto "Run it / Skip it / Always Allow" footer triggers ONLY on
   `permissionMode === 'full-auto' && denyListed` (`ToolCard.tsx`). An external ask has
   `denyListed: false` (it is not on the destructive deny-list), so it renders the ordinary approval
   card — exactly the shape in the screenshot. So the presence of a generic Yes/No in Full Auto is
   consistent with, and diagnostic of, an external-directory ask (`denyListed` false).

5. **Bash is exempt from the path guard entirely.** It is in `NON_PATH_SUBJECT_TOOLS`
   (`harness-session.ts:48`), so `checkPathGuard` is skipped for it. Per spec §2.3 this is an accepted
   limitation — the guards are "honest friction, not a security boundary," and Bash can even `cat .env`.
   **Therefore: in Full Auto, the model can already read any file on the machine** (`Bash *` is allow).
   The jail is already porous to reads in this mode; Read/Grep/Glob just enforce it and Bash does not.

6. **A specialist child is jailed to its own `workDir`, not the parent's workspace.**
   `buildSpecialistSession` sets `cwd: workDir`, and `createChild` passes `opts.workDir` (the Task
   call's `work_dir`). The path guard runs against the child's own `cwd`. So a sub-agent spawned into
   `…/citation-locate/` is jailed to that subtree even though the work is part of a wider project.

7. **A child's defensive asks are not the leak.** `buildChildDecide` passes the parent's allow/ask
   through and only auto-allows on an *envelope-granted parent 'ask'* — but the external-directory
   verdict is computed *below* `decide()` in `runOneTool` and is not a rule at all, so it forces an ask
   on the child too regardless of the envelope. This is consistent with, not proof of, the reported
   symptom.

## The hard constraint: the jail is spec-pinned as mode-independent

`2026-07-15-phase2-native-harness-design.md` §2.3 (line 62), emphasis ours:

> Non-negotiable guards live here, below the permission config, **not overridable by any mode**:
> **secret-path denial** … and the **workspace jail** (`external_directory` synthetic permission: any
> path outside session cwd → ask, **regardless of mode**).

And §2.4 (line 81):

> The **tool-layer guards** (secret-path denial, `external_directory` jail, …) sit **BELOW all
> configuration** — **no preset, mode, or remembered rule overrides them**.

**Consequence:** none of the options below is a one-line fix. Each is a deliberate amendment to a
pinned, security-adjacent rule and must carry spec, tests (`guards`/`permission-engine`/specialist
suites), and a docs/ROADMAP note. This spec is that amendment proposal — it is not yet approved.

## Design options

### Option A — Full-Auto read-only exception to the external guard (L1)

In **Full Auto only**, auto-allow external subjects for the **read-only path tools** (`Read`, `Grep`,
`Glob`). External asks remain enforced for Write/Edit/Bash and in the other modes.

- **Rationale / consistency:** in Full Auto, Bash already permits the same reads with no ask. Auto
  allowing Read/Grep/Glob external adds **zero new capability** — it only stops the polite read tools
  from asking about what Bash already silently allows. It makes the read-only tools honest with the
  mode's actual posture.
- **Safety:** no new write ability; secret-path hard-denies still run first (`guards.ts` checks
  `isSensitivePath` / credential dirs **before** the external branch, and externalization happens only
  after those pass). No new reach.
- **Scope boundary that matters:** **do NOT touch auto-edit.** In auto-edit, Bash is *gated* (`*` =
  ask), so the jail is real; letting a model silently read arbitrary non-secret files there would be a
  genuine widening of reach. Full Auto is the only mode where the jail is already porous to reads.

> **OPEN QUESTION — confidence on "adds zero new capability".** "Bash can already read it" is true,
> but that is a *coarse* equivalence: Bash output is truncated/scrolled and readability differs. For
> *capability/security*, though, the equivalence holds — a model that wants a file can get it. If the
> goal is "Full Auto = walk away", that equivalence is the whole argument; if the goal is "reads are
> cheap and safe", Option A still works but the Bash rationale is secondary.

### Option B — Widen a child's read jail to the parent's cwd; keep write at work_dir (L2)

For **specialist children**, widen the **read** jail from the child's own `workDir` to the **parent's
`cwd`** (the actual project), while keeping **write** (Edit/Write/Bash) bounded to `workDir` as today.

- **Rationale:** the likely actual trigger. A sub-agent spawned into a subtree that needs to research
  across the wider repo hits an external ask on every Grep/Read. That is consent the user *already gave
  by spawning the task* ("work on this project"), being re-litigated per read over a scope the child
  never chose.
- **Consistency with mode:** this is a **read≠write scoping** change, orthogonal to mode. It applies
  in Ask/Auto-edit too, where reading the parent project is likewise not a new risk the user didn't
  sign up for. (Contrast Option A, which is mode-specific.)
- **Safety:** reads only; writes stay inside `work_dir`, so a child still cannot silently modify the
  parent repo.

> **UNCONFIRMED — is the child jail even the trigger?** Option B's entire premise is that the prompts
> fired on paths *outside* the child's `work_dir` but *inside* the parent project. If the prompts
> instead fired on paths *inside* the child's worktree, then either the jail is being applied to a path
> that should be `ok`, or the symptom is a display/state bug (chip shows FULL AUTO but the host never
> got the mode) — and Option B is moot. **This is the single most important thing to confirm before
> committing.**

### Option C — Full Auto: no-op ALL external asks (write too) (L3)

In Full Auto, make `external_directory` asks resolve to allow regardless of tool (including
Write/Edit/Bash external).

- **The most internally-consistent reading of "Bash already bypasses the jail in Full Auto."** If the
  model can always `bash -c 'cat …'` with no ask, then the external jail is already vacuous for reads
  in this mode, and one could argue it should be vacuous for file-tool writes too. **But C must NOT
  defeat the destructive deny-list at the rule layer:** Bash commands like `rm`/`git push` still ask
  through the deny-list (that is configuration, above the guard), and C must leave them intact. C would
  silently allow external *file-tool* writes (Write/Edit on a path outside cwd) — which the deny-list
  does not cover — and that is the part that is far more invasive than mere reads.
- **Most invasive; largest security surface change; unanimous-recommend-against-in-one-shot.** A model
  silently *writing* files outside the project it was asked to work on is a materially stronger consent
  question than reading, and conflating the two is a bad default. Held as an explicitly-decided,
  separate item only after A/B are confirmed.

## Recommendation (current, subject to confirmation)

> **UNCONFIRMED until [Confirmation needed](#confirmation-needed) resolves.**

1. **Confirm the trigger before choosing.** If the initiated prompts were on paths *outside* the
   child's `work_dir`, **Option B is the likely root cause and the better fix**: it fixes the *class*
   (sub-agent can't read its own project) rather than papering over a specific mode. Option A is then a
   legitimate follow-on consistency cleanup, best done only after confirming it isn't already resolved
   by B.
2. If the prompts were *not* path-related (or fired inside the jail), this becomes a **display/state
   bug** and this whole document's premise changes — see below.

Either way, because this amends a pinned security rule, the change belongs in a proper amendment to
§2.3/§2.4 with updated `guards`/`permission-engine` and child-permission tests, WHY comments, and a
docs/ROADMAP entry — not a drive-by code edit.

## Confirmation needed

The design forks on facts we have not verified. Do one or more of the following before implementing:

1. **Reproduce deterministically in a dev worktree** (`bash scripts/run-dev.sh`):
   - spawn a sub-agent in Full Auto; Grep/Read a path **inside** its `work_dir` → expect **no** ask;
   - Grep/Read a path **outside** `work_dir` but **inside** the parent workspace → expect the observed ask.
   - If a path *inside* `work_dir` still prompts, that is a different bug and this design's premise
     fails.
2. **Obtain a session log** (Destin) if the specific run is reproducibly available, to confirm whether
   the prompted subjects were inside or outside the child jail.
3. **Confirm the chip↔host mode coupling** is not the real issue: verify a native session displaying
   "FULL AUTO" actually has `modeFor.get(sessionId) === 'full-auto'` at ask time (the seed path and the
   IPC return path both feed the chip; a mismatch would be a display bug, not a policy one). The
   external-guard hypothesis is diagnostic via the generic (non-deny-listed) card in the screenshot, which
   is consistent with — not proof of — the external path.

## Open questions for Destin

1. **Desired Full-Auto posture:** is Full Auto meant to be "the user has walked away — only the
   destructive deny-list and secret/credential hard-denies interrupt"? If so, Options A and/or C align
   the jail with that promise. If Full Auto is still meant to pause on genuinely new *read* access
   outside the project, then the current behavior is *correct* and the fix is instead to (a) make the
   denial-list-style Full-Auto footer render for these asks too (better copy than a generic Yes/No), or
   (b) improve the child jail (Option B). This is a product decision, and it decides everything.
2. **Does a sub-agent belong to the whole project, or to its subtree?** The user-spawned-Task-as-consent
   argument implies the child should read the parent project (Option B). If instead a child should be
   walled to exactly its `work_dir`, then external reads staying as asks is *correct* and the only
   fixable part is the copy/UX (render Full-Auto styling for these asks).
3. **Is write-external ever to be silently allowed in Full Auto?** (Option C.) Recommended "no" —
   keep it a separate decision.

## Scope / non-goals

- No changes to `ask` or `auto-edit` external behavior are proposed by Options A/B beyond the child
  read-scope widening in B (and even that is orthogonal to mode; it only affects children).
- The destructive deny-list rule layer is untouched in every option.
- Secret/credential hard-denies (`.env`, `~/.ssh`, …) remain non-overridable in every option.
- Symlink/TOCTOU limitations of the jail (spec §2.3 KNOWN LIMITATIONS) are out of scope and unchanged.

## Testing considerations (when approved)

- **Guards:** new cases for external verdict under full-auto (read tools allow; write tools still ask).
- **Child scoping (B):** child reads within parent cwd allowed, writes outside `work_dir` still denied;
  root-session reads unaffected.
- **Permission engine:** no change expected (this is not a rule-layer change), but re-run to pin that
  full-auto's `*`-allow still does not unilaterally bypass the guard (i.e. the guard stays below config).
- **ToolCard:** if Option A/B surface asks at all, the Full-Auto safety-stop styling question for
  non-deny-listed external asks applies (see Open Q1).

## Undecided / explicitly parked

- Option C (external writes in Full Auto) — parked, held out of any first implementation.
- Whether to adjust the Full-Auto card styling for *non*-deny-listed asks (e.g. external reads) if any
  surface remains — depends on Open Q1.
