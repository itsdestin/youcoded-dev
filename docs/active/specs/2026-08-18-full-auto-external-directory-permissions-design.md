---
status: active
---

# Full-Auto Interrupted by External-Directory Asks on Read Tools — Design

> **STATUS (verified 2026-08-26): ratified, unbuilt.** Destin ratified the direction 2026-08-21 and
> the implementation plan (`docs/active/plans/2026-08-21-full-auto-external-read-bypass.md`) was
> finalized 2026-08-23, but **zero code exists**: `git grep -n isWalkAwayRead origin/master --
> desktop/src` → no hits, and `NON_PATH_SUBJECT_TOOLS` on master is still
> `new Set(['Bash', 'Skill', 'Task'])` (`harness-session.ts:48`) — WebSearch/WebFetch were never
> added. The "UI checkpoint" below **was never held**: no workbench session on the surviving
> approval cards ever ran, so Destin has not signed off on any card copy. The worktree
> `worktrees/full-auto-reads` (`feat/full-auto-read-bypass`) exists with 0 commits ahead of master.
> The ROADMAP carries no item for this work.

**Date:** 2026-08-18 · **Decided:** 2026-08-21 (Destin ratified the direction — see [Decision](#decision))
**Parent:** `2026-07-15-phase2-native-harness-design.md` (§2.3 workspace jail, §2.4 permission engine) — this doc is the amendment proposal for those sections
**Repo:** `youcoded/desktop/` (main-process harness: `harness-session.ts`, `tools/guards.ts`, `specialists/child-permissions.ts`)

## What this means for users (plain language)

You put the app in **Full Auto** — "walk away, don't interrupt me" — and it still popped up
Yes/No cards asking permission to *look at* files. Helper sub-assistants were boxed into one
small folder, so every glance at the rest of your own project triggered a prompt. Meanwhile the
terminal side could already silently read anything on the machine — so the interruptions bought
no protection, just friction. A related quirk: an ordinary **web search** could trip the same
file-permission card, because the search text got mistaken for a file location.

**The change:** in Full Auto, the app stops interrupting for *reading* — anywhere. Every
checkpoint that involves *changing* things (deleting, editing outside the project, pushing code,
sudo) stays exactly as strict as today, and secrets (`.env`, SSH keys) stay locked up in every
mode. Walk-away mode finally behaves like walk-away mode; cautious modes don't loosen at all.
The surviving approval cards get plainer wording, reviewed by Destin before ship.

## Problem statement

While running a **native session in Full Auto** the user saw **yes/no approval prompts for Grep
and Read** tool calls during what read as an autonomous sub-task. Full Auto promises walk-away
autonomy; per-read approval cards contradict that promise.

The equivalent operation — reading the same file — is already silently permitted in Full Auto
through Bash, so the prompts are friction with no safety gained.

> **UNCONFIRMED — the exact triggering paths.** We have a screenshot showing a sub-task browsing
> `home/destin/ask-the-budget-az-worktrees/citation-locate/webapp/src/pdf/CitedTextPanel.tsx`, but no
> session logs. We have NOT confirmed whether the prompted paths lay **inside** or **outside**
> the session's cwd. The ratification below does not depend on resolving this (A is a deliberate
> posture change either way), but confirmation still hunts for a SECOND bug hiding underneath —
> see [Confirmation needed](#confirmation-needed).

## Confirmed facts (from code)

Read directly off `master`; verified against source 2026-08-21:

1. **Full Auto's permission baseline is allow-everything.** `rulesForMode('full-auto')` returns
   `[{ tool: '*', action: 'allow' }]` (`src/shared/permission-types.ts`). Read/Glob/Grep are
   additionally in the always-allowed set of *every* mode. Pinned by `tests/permission-engine.test.ts`.
   A **rule-based** ask for Grep/Read in Full Auto is therefore impossible.

2. **There is exactly one non-rule path that forces an ask regardless of mode: the external-directory
   path guard.** `harness-session.ts` (`runOneTool`):
   ```ts
   const decision: PermissionDecision = externalAsk
     ? { action: 'ask', denyListed: false }
     : await (this.opts.decide?.(call.toolName, subject) ?? ...);
   ```
   `externalAsk` is set only when `checkPathGuard(subject, this.opts.cwd, this.opts.internalReadRoots)`
   returns `external` — i.e. the subject is **outside the session's cwd jail** (`tools/guards.ts`).
   Note the branch **replaces** `decide()` rather than flooring it — consequence in fact 8.

3. **Grep and Read both have file-path subjects.** `Grep.permissionSubject = (a) => a.path ?? '.'`,
   `Read.permissionSubject = (a) => a.file_path`. They are NOT in `NON_PATH_SUBJECT_TOOLS`
   (`harness-session.ts:48` — exactly `['Bash', 'Skill', 'Task']`), which is why they hit the
   external guard while Bash cannot.

4. **A Full-Auto prompt for a non-deny-listed ask renders as the generic Yes/No row, not the
   Full-Auto safety-stop.** The safety-stop footer triggers ONLY on
   `permissionMode === 'full-auto' && denyListed` (`ToolCard.tsx:343`). An external ask short-circuits
   BEFORE `decide()` runs, so the deny-list is never consulted and `denyListed` is hardcoded false —
   hence the ordinary approval card seen in the screenshot.

5. **Bash is exempt from the path guard entirely** (`NON_PATH_SUBJECT_TOOLS`), an accepted Phase-2
   limitation (parent spec §2.3: guards are "honest friction, not a security boundary"; Bash can
   `cat .env`). **Therefore in Full Auto the model can already read any file on the machine.**
   The jail is porous to reads in this mode; Read/Grep/Glob enforce it and Bash does not.

6. **A specialist child is jailed to its own `workDir`, not the parent's workspace**, and a child's
   defensive asks are not the leak: the external verdict is computed below `decide()` in
   `runOneTool`, so it forces an ask on the child too regardless of the launch envelope
   (`buildSpecialistSession` sets `cwd: workDir`; `buildChildDecide` never sees the verdict).
   Consistent with — not proof of — the reported symptom.

7. **The renderer already knows which asks are external.** `askUser({…, external: externalAsk})`
   flows broker → reducer → `ToolCard.tsx:1073`, where it suppresses "Always Allow" (correct: a
   remembered rule can never fire on an external path). Any redesign of the surviving cards has an
   existing hook to key off; any option changing HOW MANY external asks fire changes what that
   suppression is worth.

8. **A remembered DENY on an external path currently yields `ask`, not `deny`** — because the
   external branch replaces `decide()` (fact 2), the user's deny rule is never consulted. Pre-existing
   quirk, out of scope to fix here, but the amendment below must not widen it into
   "external + full-auto beats a deny."

9. **An invented-path interception sits between the verdict and the ask** (`harness-session.ts`,
   `REQUIRES_EXISTING_TARGET = {Read, Edit}`): an outside path that doesn't exist but whose workspace
   twin does gets a corrective error naming the real path — no ask at all. Reproduction of the bug
   must use an outside path that EXISTS (see Confirmation matrix). The amendment must preserve this.

10. **`internalReadRoots` is a third verdict besides inside/outside** (`guards.ts`): specialist-report
    spill dirs are exempted to `ok`. Wired for root sessions only — children never inherit it
    (`native-session-host.ts` `toolWiring` comment). Relevant context for the parked Option B.

11. **WebSearch/WebFetch can falsely trip the path guard.** Their subjects are a query string and a
    URL (`web-search.ts`, `web-fetch.ts`) and they are NOT in `NON_PATH_SUBJECT_TOOLS`, so
    `canonicalize("../etc/passwd", cwd)` resolves a search term into a real outside path → external
    ask on a web search. `eval/assertions.ts` documents exactly this category error. **Fix folded
    into this change** (ratified 2026-08-21).

## The hard constraint: the jail is spec-pinned as mode-independent

Parent spec §2.3: the workspace jail is a non-negotiable guard "**not overridable by any mode**";
§2.4: tool-layer guards sit "**BELOW all configuration**." §2.3's stated known limitation is the
Bash bypass (fact 5) — the guards are honest friction, not a security boundary.

**Consequence:** Option A is a deliberate amendment to a pinned, security-adjacent rule. It must
carry a parent-spec edit, tests, WHY comments, and a docs/ROADMAP note. This document is that
amendment proposal, now ratified.

## Decision (ratified by Destin, 2026-08-21)

**Adopt Option A — Full-Auto read-only exception to the external guard — plus the web-subject fix.**

1. **In Full Auto, auto-allow external subjects for the read-only path tools (`Read`, `Grep`,
   `Glob`).** Rationale: Bash already permits the same reads silently in this mode (fact 5), so
   this adds zero new capability — it stops the polite read tools from asking about what the
   terminal already does quietly. External asks remain enforced for Write/Edit, and in `ask` /
   `auto-edit` modes.
2. **WebSearch/WebFetch leave the path-guarded population** (their subjects are not paths). Exact
   mechanism — a per-tool "subject is a path" flag vs. extending `NON_PATH_SUBJECT_TOOLS` — is an
   implementation detail; the invariant to pin is *a web search can never produce an
   external_directory ask*. Check remembered-rule implications when choosing (web tools are
   baseline-allowed everywhere, so subject-keyed grants should be moot — verify, don't assume).
3. **Guard-order contract (the fine print the implementation must preserve):**
   secret/credential hard-denies → `internalReadRoots` exemption → invented-path interception
   (fact 9) → **[NEW] full-auto read bypass** → external ask. The bypass may never fire ahead of
   the secret denies, and never for a write tool.
4. **Deny semantics:** a remembered/explicit deny on an external path continues to resolve to
   `ask` (today's behavior, fact 8) — the amendment upgrades nothing past an ask and never lets
   full-auto convert a deny into an allow. Pinned by test (below).

**Parked / rejected:**

- **Option B** (widen a child's read jail to the parent's cwd in ALL modes) — parked as its own
  future product decision. Full Auto covers the reported symptom without it; B would additionally
  loosen `ask`/`auto-edit`, which was NOT ratified. Revisit only if post-ship verification shows
  children in cautious modes are still prompt-storming on their own project.
- **Option C** (silent external writes in Full Auto) — rejected for v1. A model writing files
  outside the project is a consent question reads don't have.

## Confirmation needed (regression-hunting, no longer option-picking)

The decision above stands regardless; these checks now look for a SECOND bug underneath:

| # | Check | Expected | If it fails |
|---|---|---|---|
| 1 | Dev worktree (`bash scripts/run-dev.sh --label "ext-guard repro"`): child in Full Auto, Read/Grep a path **inside** its `work_dir` | no ask | Different bug — the jail misfires on inside paths; file separately, A ships anyway |
| 2 | Same, path **outside** `work_dir`, **inside** parent project, file exists | the observed ask | Confirms the reported trigger |
| 3 | Same, outside path that does NOT exist but a workspace twin does | corrective error, no ask (fact 9) | Interception broken — separate ticket |
| 4 | Chip↔host coupling: a session showing FULL AUTO has `modeFor.get(sessionId) === 'full-auto'` at ask time | holds | Display/state bug — file separately; A still ships as posture alignment |

Session log from the original run (Destin) remains welcome but is no longer blocking.

## UI checkpoint (before merge — ratified 2026-08-21)

Some approval cards survive every option; their copy is not yet designed. Before the backend
amendment merges: mock the surviving Full-Auto cards in the workbench (`bash scripts/run-workbench.sh`;
the fake IPC payload already carries `external: true` and `permissionMode`) and get Destin's
sign-off on wording/layout. Surviving surfaces to cover:

- **External WRITE asks in Full Auto** (Write/Edit outside the project) — currently the generic
  Yes/No row; prime candidate for plainer copy ("wants to modify a file outside this project").
- **Deny-listed safety-stop** — exists today; confirm it reads correctly next to the new copy.
- Fact 7's `external` flag is the available hook; suppressAlwaysAllow behavior carries over.

## Scope / non-goals

- No changes to `ask` or `auto-edit` external behavior (Option B parked, not included).
- The destructive deny-list rule layer is untouched. Secret/credential hard-denies remain
  non-overridable and first in order. Symlink/TOCTOU caveats of the jail are unchanged and
  uncited here (the parent spec pins only the Bash-bypass limitation).
- The fact-8 deny-yields-ask quirk is documented, not fixed, in this pass.

## Testing considerations

Real suites touched (names verified against `desktop/tests/`):

- `tests/harness-tool-guards.test.ts` — external verdict under full-auto: read tools allow,
  Write/Edit still ask; **secret path under full-auto still hard-denies**; **remembered deny on an
  external path still yields `ask`** (fact 8 pin); **interception still fires** (fact 9 pin);
  **WebSearch/WebFetch subjects never produce an external verdict**.
- `tests/specialist-child-permissions.test.ts` / `tests/specialist-child-ask-router.test.ts` —
  child external reads in Full Auto flow through the same bypass; envelope logic untouched.
- `tests/permission-engine.test.ts` — no rule-layer change expected; re-run to pin that the guard
  stays below config.
- ToolCard tests — surviving-card rendering per the UI checkpoint.

## Post-ship verification

The ask payload already carries `external` + `permissionMode` (fact 7). After release, confirm in
real usage that full-auto external asks drop to ~zero for read tools (session logs or a temporary
debug counter). This converts "we believe A fixes the report" into a measured claim, and feeds the
parked-Option-B decision with data.

## Lifecycle

On implementation: the amendment text lands in the parent spec (§2.3/§2.4 gain the full-auto
read exception + the non-path-subject tool set), this doc moves to `docs/archive/specs/`, and the
ROADMAP item flips `[x]` in the same session the merge pushes.
