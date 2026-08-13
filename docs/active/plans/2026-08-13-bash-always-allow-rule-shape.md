---
status: active
created: 2026-08-13
revised: 2026-08-13
type: plan
spec: docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
item: M5 2c — Bash always-allow rule shape
---

# Bash always-allow rule shape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an "Always allow" on a Bash command mean something the user chose and can read — an exact command, or a scoped widening (for `git push`, one branch) — and make "exact" actually exact.

**Architecture:** One new shared module (`bash-grant-shapes.ts`) derives the grant options for a Bash command and is the single source of both the sentence the user reads and the rule the engine stores. `PermissionRule` gains one field, `match` (exact vs glob). A new `ruleMatches()` in `subject-glob.ts` is the only function that knows what a whole rule means, and it owns **two safety rules that no rule-builder can forget** (§ "Two safety rules" below). The renderer sends only a rung selector; the main process re-derives the pattern.

**Tech Stack:** TypeScript, Electron main + React renderer (shared bundle, also runs in an Android WebView), Vitest, Vite. No new dependencies.

---

## Two safety rules the matcher owns

Both live in `ruleMatches` and apply **only** to a Bash rule that (a) grants (`action: 'allow'`), (b) has a pattern, and (c) that pattern contains a wildcard. Deny-list rules (`action: 'ask'`), mode/preset rules (no pattern), and exact rules are untouched.

1. **A wildcard never swallows a second command.** `subjectMatches` compiles `*` to "any characters at all", which crosses `&&`, `;`, `|`, backtick, `$(`, `>`, `<`, and newline. That is correct for the deny-list (`* rm *` must catch `cd x && rm -rf y`) and catastrophic for a grant: without this rule, a grant labelled "any `npm run` command" covers `npm run build && rm -rf /`.

2. **A wildcard in the *middle* never swallows a destructive flag.** A pattern with text after its wildcard (`git push*origin feat/x`) is claiming a bounded target — that is the whole point of scoping to a branch. But the gap where flags go is unbounded, and `git push --delete origin feat/x` matches it. So does `--prune` (deletes every *other* branch on the remote) and `--all` (pushes branches the grant never named). A pattern that ENDS in its wildcard (`npm run*`) is honestly open-ended and is exempt.

**Why in the matcher and not on each rule** (this is a deliberate change from the spec, see Amendments): the earlier design stored the exclusion list as an `except` array on every rule. That put the same nine constants on disk over and over, added a fifth field to rule identity, needed order-insensitive comparison, and — the real cost — had to be *remembered* at every place a rule is built. A second command-shape row added in a year that forgets it ships an over-grant silently. A rule inside the matcher cannot be forgotten.

## The two postconditions on a derived option

`bashGrantOptions` never returns an option unless BOTH hold:

- **It covers the command in front of the user.** Otherwise the user saves a grant, is asked the identical question next time, and nothing explains why.
- **It admits nothing from the hostile corpus.** A fixed list of known-destructive commands, one per destructive deny-list family. This is the check the earlier draft was missing, and it is what stops `git --no-pager log` (second token is a flag, so the derived rung is the program alone) from offering **"Any git command"** — a rule that then covers `git push origin master` and `git reset --hard` and outranks the deny-list.

---

## Global Constraints

- **Everything runs in `youcoded/desktop`.** No Android work in this item (no native runtime there yet).
- **Never touch Destin's running app.** All runtime verification via `bash scripts/run-dev.sh` or `bash scripts/run-workbench.sh` from the workspace root. Rule: `.claude/rules/live-app-safety.md`.
- **No glob syntax on any user-facing surface.** No `*`, no `?`, in any string rendered in the confirm, the tool card, or Settings → Permissions. `describe-rule.ts`'s existing comment governs.
- **All user-facing copy for the confirm is Destin's.** Task 4 builds candidates in the workbench compare view; Task 8 implements only what he settles. Do not invent wording.
- **`src/shared/` must stay browser-safe.** No `process`, no `require()`, no Node built-ins — it is imported by the renderer, which also runs in a WebView.
- **Annotate every non-trivial edit with a WHY comment.** Destin is a non-developer and reads the comments to understand the code.
- **Rule identity is the quad `(tool, pattern, action, match)`** everywhere after Task 5 — dedupe, disk removal, in-memory revocation filter. One name, one field list, everywhere: `sameRule`.
- **Commands are never trimmed.** The exact rung stores the command byte-for-byte as `permissionSubject` hands it over (`tools/bash.ts:484` → `(a) => a.command`). Trimming it would store a pattern one character different from the subject the engine compares against, and the grant would silently never fire again.
- **Verification after every task:** `bash scripts/verify.sh bash-grant-shape` from the workspace root (tsc + affected vitest + knip + eslint + ast-grep). It is **Linux-only**, and master is currently red on Windows from unrelated work (`harness-tools-core.test.ts > Bash > persistent_env`) — attribute any CI matrix failure before assuming it is yours.
- **`tsc --noEmit` does NOT type-check `tests/`** (verify.sh header says so: tsconfig `include` is `src/**/*`; vitest strips test types with esbuild without checking them). So a test referencing a field that does not exist yet fails at **runtime assertion**, not at compile time. Do not write "expected: TypeScript error" for a test file.
- **Line numbers are not anchors.** `harness-session.ts` moved ~60 lines during planning. Locate code by symbol name and by the quoted snippets in each task.
- **Worktrees live at `/home/destin/youcoded-dev/worktrees/<name>`**, NOT under `youcoded/`. `verify.sh <name>` resolves the short name for you.

---

## Amendments to the spec

This plan deviates from `docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md` in five places. Task 0 records them in the spec so the two documents do not contradict each other mid-flight. Each is a narrowing (allows less) or a simplification (fewer moving parts).

| # | Spec said | This plan does | Why |
|---|---|---|---|
| A1 | §3.2/§4.3 — every wide rule stores an `except` array of shell operators | The matcher owns operator-crossing; no `except` field exists | Cannot be forgotten by a future rule-builder; removes a persisted array, a 5th identity field, and an order-insensitive comparison |
| A2 | §5.1 — the branch rung "covers the flag forms", `--force` included | The bounded-rung rule vetoes `--delete`, `--prune`, `--mirror`, `--all`, `--force`, `-f`, `-d`, `--hard`, `--force-with-lease` | A grant reading "pushing to feat/x" that deletes feat/x — or every *other* branch, via `--prune` — is exactly the lie this item exists to end. `-u`, `-q`, `--set-upstream` etc. are still covered |
| A3 | §4.4 — a push that cannot be scoped is offered nothing | It is still offered the **exact** rung; only the wide rung is suppressed | Remembering `git push origin master feat/x` byte-for-byte is exactly as safe as remembering `rm -rf build`, which the spec already allows. Refusing it means a repeated push that can never be answered permanently |
| A4 | §4.4/§5.2 — danger is judged from the approving command | Danger is judged from the approving command **and** from what the derived rule would admit (hostile corpus) | The spec's check misses `git --no-pager log` → "Any git command", which covers pushes and hard-resets and outranks the deny-list |
| A5 | §4.5 — a vetoed ask tells the user why (a new field threaded engine → broker → dispatcher → card) | Dropped from this item. The caveat is stated **up front in the option's own wording** (settled in Task 4) and logged to ROADMAP | It explained only one of the two re-ask causes (§5.3's flag-after-refspec case is a non-match, not a veto), so the user still could not rely on being told. Four files and a copy decision for half a promise |

Also new, not in the spec: `git push origin HEAD` and `git push origin @` are treated exactly like bare `git push` (no grant of any width), because `HEAD` resolves to whatever branch is checked out when the command *runs*, not when it is approved. And `git push origin :feat/x` (the delete form) and `git push origin +feat/x` (the force form) get the exact rung but no branch rung, because a rung named "pushing to feat/x" would misdescribe both.

---

## Task 0: Worktree and spec amendments

- [ ] **Step 1: Sync and create the worktree**

```bash
cd /home/destin/youcoded-dev && bash setup.sh
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git checkout master && git pull origin master
git worktree add ../worktrees/bash-grant-shape -b feat/bash-grant-shape
# Hardlink deps rather than reinstalling (workspace CLAUDE.md: cp -al, NEVER a symlink
# or junction — npm ci follows those and empties the main checkout's node_modules).
cp -al /home/destin/youcoded-dev/youcoded/desktop/node_modules \
       /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop/node_modules
```

If `cp -al` fails (cross-device, or master's deps are stale), fall back to `cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop && npm ci`. Do NOT run `npm ci` after a `cp -al` — it rewrites the hardlinked tree.

- [ ] **Step 2: Confirm nobody else is in these files**

```bash
cd /home/destin/youcoded-dev/youcoded && git worktree list
```

Expected: the `slug-repair` / `slug-repair-android` worktrees may still be live. They rename `cwdToProjectSlug`, which `permission-store.ts` and `native-session-host.ts` (Task 5) both call. If they have landed, take their name; if not, whoever lands second updates the other. Note which is true before starting Task 5.

- [ ] **Step 3: Baseline the suite**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape --full
```

Expected: PASS. If it fails on Linux, stop — the failure is pre-existing and needs attributing before any of this work lands on top of it.

- [ ] **Step 4: Record the amendments (workspace repo)**

In `/home/destin/youcoded-dev`:

1. Append an `## Amendments (2026-08-13, from the implementation plan)` section to `docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md` carrying the A1–A5 table above verbatim, plus the `HEAD` / `:branch` / `+branch` note. A spec that contradicts its own plan mid-flight is how a later session implements the wrong thing.
2. Add a ROADMAP entry for the dropped §4.5 work — type `feature`, tagged `#permissions`, dated 2026-08-13, worded as: *"Tell the user when a saved permission almost covered a command (both causes: operator veto and flag-after-refspec non-match)."* Dedup against existing entries first.

```bash
cd /home/destin/youcoded-dev
git add docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md ROADMAP.md
git commit -m "docs(spec): 2c amendments — matcher-owned safety rules, hostile-corpus check

The implementation plan narrows five spec decisions. Recorded here so the spec
does not contradict the plan while the work is in flight.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: `match` on the rule, and one matcher that owns the safety rules

**Files:**
- Modify: `src/shared/permission-types.ts` (add `match` to `PermissionRule`, add `normalizeRule` + `sameRule`)
- Modify: `src/shared/subject-glob.ts` (add `ruleMatches`, `SHELL_OPERATORS`, `BOUNDED_RUNG_VETO`)
- Modify: `src/main/harness/permission-engine.ts` (call `ruleMatches`)
- Modify: `src/renderer/components/permissions/deny-list-copy.ts` (call `ruleMatches`)
- Test: `tests/subject-glob.test.ts`, `tests/permission-engine.test.ts`, `tests/deny-list-copy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `PermissionRule.match?: 'exact' | 'glob'`
  - `ruleMatches(rule: PermissionRule, subject: string): boolean`, `SHELL_OPERATORS`, `BOUNDED_RUNG_VETO` from `src/shared/subject-glob`
  - `normalizeRule<T extends PermissionRule>(rule: T): T` and `sameRule(a: PermissionRule, b: PermissionRule): boolean` from `src/shared/permission-types`

- [ ] **Step 1: Write the failing tests**

Append to `tests/subject-glob.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subjectMatches, ruleMatches } from '../src/shared/subject-glob';
import type { PermissionRule } from '../src/shared/permission-types';

describe('ruleMatches — exact', () => {
  const bash = (over: Partial<PermissionRule>): PermissionRule =>
    ({ tool: 'Bash', action: 'allow', ...over });

  it('match:exact is byte-equal — a command containing * is NOT a wildcard', () => {
    const r = bash({ pattern: 'rm *.log', match: 'exact' });
    expect(ruleMatches(r, 'rm *.log')).toBe(true);
    expect(ruleMatches(r, 'rm secrets.log')).toBe(false);
    expect(ruleMatches(r, 'rm -rf / #.log')).toBe(false);
  });

  it('match:exact is case-SENSITIVE, unlike the glob path', () => {
    expect(ruleMatches(bash({ pattern: 'rm -rf x', match: 'exact' }), 'RM -rf x')).toBe(false);
    expect(subjectMatches('RM -rf x', 'rm -rf x')).toBe(true); // the glob path stays 'i'
  });

  it('match:exact does not trim — whitespace is part of the command', () => {
    expect(ruleMatches(bash({ pattern: 'ls', match: 'exact' }), 'ls\n')).toBe(false);
  });

  it('a legacy rule with no match field still globs (nothing on disk changes meaning)', () => {
    expect(ruleMatches(bash({ pattern: 'git push*' }), 'git push origin x')).toBe(true);
  });

  it('a rule with no pattern matches every subject (tool-wide grants)', () => {
    expect(ruleMatches({ tool: 'Read', action: 'allow' }, 'anything')).toBe(true);
  });

  it('match:exact with no pattern never matches — it is not a tool-wide grant', () => {
    expect(ruleMatches({ tool: 'Bash', action: 'allow', match: 'exact' }, 'x')).toBe(false);
  });
});

describe('ruleMatches — safety rule 1: a wildcard never swallows a second command', () => {
  const grant = (pattern: string): PermissionRule =>
    ({ tool: 'Bash', pattern, action: 'allow', match: 'glob' });

  it.each([
    'npm run build && rm -rf /',
    'npm run build || rm -rf /',
    'npm run build; sudo x',
    'npm run build | sh',
    'npm run build > /etc/passwd',
    'npm run build < /etc/passwd',
    'npm run build `id`',
    'npm run build $(id)',
    'npm run build\nrm -rf /',
  ])('refuses %s', (evil) => {
    expect(ruleMatches(grant('npm run*'), evil)).toBe(false);
  });

  it('still covers the plain forms', () => {
    expect(ruleMatches(grant('npm run*'), 'npm run build')).toBe(true);
    expect(ruleMatches(grant('npm run*'), 'npm run build --prod')).toBe(true);
  });

  it('does NOT apply to ask/deny rules — the deny-list must keep crossing operators', () => {
    const denyEntry: PermissionRule = { tool: 'Bash', pattern: '* rm *', action: 'ask' };
    expect(ruleMatches(denyEntry, 'cd repo && rm -rf x')).toBe(true);
  });

  it('does NOT apply to a pattern-less grant — a tool-wide grant is a separate choice', () => {
    expect(ruleMatches({ tool: '*', action: 'allow' }, 'a && b')).toBe(true);
    expect(ruleMatches({ tool: 'Bash', action: 'allow' }, 'a && b')).toBe(true);
  });
});

describe('ruleMatches — safety rule 2: a middle wildcard never swallows a destructive flag', () => {
  const bounded: PermissionRule =
    { tool: 'Bash', pattern: 'git push*origin feat/x', action: 'allow', match: 'glob' };

  it('covers the harmless flag forms of the same push', () => {
    expect(ruleMatches(bounded, 'git push origin feat/x')).toBe(true);
    expect(ruleMatches(bounded, 'git push -u origin feat/x')).toBe(true);
    expect(ruleMatches(bounded, 'git push --set-upstream origin feat/x')).toBe(true);
    expect(ruleMatches(bounded, 'git push -q origin feat/x')).toBe(true);
  });

  it.each([
    'git push --delete origin feat/x',        // deletes the branch the grant is named after
    'git push -d origin feat/x',
    'git push --prune origin feat/x',         // deletes every OTHER branch on the remote
    'git push --mirror origin feat/x',
    'git push --all origin feat/x',           // pushes branches the grant never mentioned
    'git push --force origin feat/x',
    'git push -f origin feat/x',
    'git push --force-with-lease=origin/x origin feat/x',
  ])('refuses %s', (evil) => {
    expect(ruleMatches(bounded, evil)).toBe(false);
  });

  it('an OPEN-ENDED rung is exempt — "any npm run command" says what it means', () => {
    const open: PermissionRule = { tool: 'Bash', pattern: 'npm run*', action: 'allow', match: 'glob' };
    expect(ruleMatches(open, 'npm run build --force')).toBe(true);
  });
});
```

Append to `tests/permission-engine.test.ts`:

```ts
import { decidePermission } from '../src/main/harness/permission-engine';
import { DESTRUCTIVE_DENY_LIST, rulesForMode } from '../src/shared/permission-types';

describe('decidePermission with the matcher safety rules', () => {
  const remembered = [{
    tool: 'Bash', action: 'allow' as const, match: 'glob' as const,
    pattern: 'git push*origin feat/x',
  }];
  const layers = {
    presetRules: [], modeRules: rulesForMode('full-auto'),
    denyList: DESTRUCTIVE_DENY_LIST, rememberedRules: remembered,
  };

  it('the grant covers its own branch', () => {
    expect(decidePermission('Bash', 'git push origin feat/x', layers))
      .toEqual({ action: 'allow', denyListed: false });
  });

  it('another branch is not covered — the deny-list layer wins and it still asks', () => {
    expect(decidePermission('Bash', 'git push origin master', layers))
      .toEqual({ action: 'ask', denyListed: true });
  });

  it('a destructive flag on the granted branch still asks', () => {
    expect(decidePermission('Bash', 'git push --delete origin feat/x', layers))
      .toEqual({ action: 'ask', denyListed: true });
  });

  it('Full-auto still allows an ordinary command with no grant at all', () => {
    expect(decidePermission('Bash', 'ls -la && pwd', layers))
      .toEqual({ action: 'allow', denyListed: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/subject-glob.test.ts tests/permission-engine.test.ts
```

Expected: FAIL — `ruleMatches is not a function`. (Not a type error: `tests/` is not type-checked. See Global Constraints.)

- [ ] **Step 3: Add the field and the helpers**

In `src/shared/permission-types.ts`, replace the `PermissionRule` interface with:

```ts
export interface PermissionRule {
  /** Tool name or '*'; also the synthetic subjects 'doom_loop' | 'max_steps' | 'external_directory'. */
  tool: string;
  /** Glob over the SUBJECT (Bash: command string; file tools: relative path). Absent = matches any. */
  pattern?: string;
  action: PermissionAction;
  /** How `pattern` is compared. ABSENT MEANS 'glob' — that default is load-bearing:
   *  every DESTRUCTIVE_DENY_LIST entry and every mode/preset rule omits this field
   *  and must keep globbing. Only remembered rules ever set it.
   *
   *  WHY a field instead of escaping '*' inside the pattern: subjectMatches escapes
   *  '\' as a regex literal, so a backslash escape syntax would break Windows
   *  commands like `del C:\foo\*`. A discriminator sidesteps that entirely. */
  match?: 'exact' | 'glob';
}

/** A rule read off disk, in the semantics it was WRITTEN with.
 *
 *  WHY: every rule ever persisted came from harness-session's `remember-rule`,
 *  which stored the raw tool subject — an exact command or path that was then
 *  evaluated as a glob. So `rm *.tmp` became a wildcard grant nobody asked for.
 *  Reading a match-less rule as 'exact' restores the promise the user was shown
 *  ("Always allow this exact command") and only ever ALLOWS LESS.
 *
 *  Apply this to REMEMBERED rules only. A deny-list or mode rule has no `match`
 *  on purpose (see the field's doc) and must never be run through here. */
export function normalizeRule<T extends PermissionRule>(rule: T): T {
  return rule.match ? rule : { ...rule, match: 'exact' };
}

/** Rule identity: the QUAD (tool, pattern, action, match). Two grants that differ
 *  only in `match` are different grants — collapsing them makes Settings revoke
 *  the wrong one. `grantedAt` is deliberately excluded so re-approving something
 *  does not look like a fresh grant.
 *
 *  Normalizes BOTH sides, so a rule read straight off disk (no `match`) compares
 *  equal to the same rule after a read through PermissionStore (`match: 'exact'`).
 *  Callers therefore never have to remember to normalize first — one default for
 *  an absent `match`, in one place. */
export function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  const x = normalizeRule(a);
  const y = normalizeRule(b);
  return x.tool === y.tool && x.pattern === y.pattern && x.action === y.action && x.match === y.match;
}
```

In `src/shared/subject-glob.ts`, add at the bottom:

```ts
import type { PermissionRule } from './permission-types';

/** Each one starts a SECOND command, or redirects the first one's output.
 *  subjectMatches compiles '*' to [\s\S]* on purpose — that is what lets the
 *  deny-list's '* rm *' catch 'cd repo && rm -rf x' — which means a trailing '*'
 *  in a GRANT would cross them too. */
export const SHELL_OPERATORS: readonly string[] = ['&&', '||', ';', '|', '`', '$(', '>', '<', '\n'];

/** Flags that change WHAT a bounded grant does rather than how it does it.
 *  `git push --delete origin feat/x` matches a rule built for
 *  `git push origin feat/x` — the wildcard sits between them — and deletes the
 *  branch the grant is named after. `--prune` deletes every OTHER branch on the
 *  remote; `--all` and `--mirror` push refs the grant never mentioned; `--force`
 *  and `--hard` destroy history rather than adding to it. */
export const BOUNDED_RUNG_VETO: readonly string[] = [
  '--delete', '-d', '--prune', '--mirror', '--all',
  '--force', '-f', '--force-with-lease', '--hard',
];

/** The ONE function that knows what a whole rule means. `subjectMatches` above is
 *  the primitive; this owns `match` and the two safety rules on top of it.
 *
 *  Every decision path must go through here — the engine AND the renderer's
 *  deny-list classifier — or the two will eventually disagree about what a rule
 *  covers, which is the bug the shared location of this file exists to prevent. */
export function ruleMatches(rule: PermissionRule, subject: string): boolean {
  // Exact: byte-for-byte, no regex, no metacharacter interpretation, and
  // case-SENSITIVE — the 'i' flag in subjectMatches is a widening the exact
  // promise cannot afford ('RM -rf /' is not 'rm -rf /' on the platforms Bash
  // runs on). No trimming either: the stored pattern IS the approved command.
  if (rule.match === 'exact') return rule.pattern !== undefined && subject === rule.pattern;
  if (!subjectMatches(subject, rule.pattern)) return false;

  const pattern = rule.pattern;
  // The safety rules below narrow WILDCARD BASH GRANTS only:
  //  * action !== 'allow' — the deny-list is 'ask' and MUST keep crossing
  //    operators, or '* rm *' stops catching 'cd x && rm -rf y'.
  //  * no pattern — a tool-wide grant ('*' in Full-auto) is a separate, explicit
  //    choice the Settings screen already flags as broad. Not our business here.
  //  * no wildcard — a literal pattern already matches exactly one string.
  //  * tool !== 'Bash' — every other subject is a path or an id, not a shell line.
  if (rule.action !== 'allow' || rule.tool !== 'Bash' || pattern === undefined) return true;
  if (!pattern.includes('*') && !pattern.includes('?')) return true;

  // SAFETY RULE 1 — a wildcard never swallows a second command.
  if (SHELL_OPERATORS.some((op) => subject.includes(op) && !pattern.includes(op))) return false;

  // SAFETY RULE 2 — a wildcard in the MIDDLE never swallows a destructive flag.
  // Text after the wildcard means the rule is naming a bounded target ("pushing
  // to feat/x"); the flags that would unbind it are vetoed. A pattern that ENDS
  // in its wildcard ('npm run*') is honestly open-ended and is exempt.
  const bounded = !/[*?]$/.test(pattern);
  if (bounded) {
    for (const raw of subject.split(/\s+/)) {
      const token = raw.split('=')[0]; // --force-with-lease=origin/x
      if (BOUNDED_RUNG_VETO.includes(token) && !pattern.includes(token)) return false;
    }
  }
  return true;
}
```

In `src/main/harness/permission-engine.ts`, change the import and the loop test:

```ts
import { ruleMatches } from '../../shared/subject-glob';
```

```ts
    if (!ruleMatches(entry.r, subject ?? '')) continue;
```

In `src/renderer/components/permissions/deny-list-copy.ts`, change the import and the classify loop:

```ts
import { ruleMatches } from '../../../shared/subject-glob';
```

```ts
      if (!ruleMatches(rule, command)) continue;
```

Its behaviour is unchanged: it classifies against `DESTRUCTIVE_DENY_LIST`, whose entries are `action: 'ask'`, which both safety rules skip. It goes through `ruleMatches` so that the renderer and the engine can never drift.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/subject-glob.test.ts tests/permission-engine.test.ts tests/deny-list-copy.test.ts
```

Expected: PASS, all three files.

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): one matcher owns rule meaning, plus two safety rules

ruleMatches() is now the single decision-path matcher. It adds byte-exact
comparison (match:'exact') and two narrowings that apply only to wildcard Bash
GRANTS: a wildcard never swallows a second command, and a wildcard in the middle
of a pattern never swallows a destructive flag.

Both live in the matcher rather than on each rule, so a rule built somewhere new
cannot forget them. Deny-list and mode rules are untouched — the deny-list still
needs its wildcards to cross '&&'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `bash-grant-shapes.ts` — the two rungs and the two postconditions

**Files:**
- Create: `src/shared/bash-grant-shapes.ts`
- Test: `tests/bash-grant-shapes.test.ts` (new)

**Interfaces:**
- Consumes: `ruleMatches` (Task 1), `PermissionRule` + `DESTRUCTIVE_DENY_LIST` from `src/shared/permission-types`.
- Produces:
  - `type GrantScope = 'exact' | 'wide'`
  - `interface GrantOption { scope: GrantScope; rule: PermissionRule; label: string }`
  - `bashGrantOptions(command: string): GrantOption[]` — narrowest first; `[]` means no "Always allow" may be offered at all.
  - `HOSTILE_CORPUS: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/bash-grant-shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bashGrantOptions, HOSTILE_CORPUS } from '../src/shared/bash-grant-shapes';
import { ruleMatches } from '../src/shared/subject-glob';
import { DESTRUCTIVE_DENY_LIST } from '../src/shared/permission-types';

const wideOf = (cmd: string) => bashGrantOptions(cmd).find((o) => o.scope === 'wide');
const exactOf = (cmd: string) => bashGrantOptions(cmd).find((o) => o.scope === 'exact');

describe('bashGrantOptions — exact rung', () => {
  it('stores the literal command with match:exact', () => {
    expect(exactOf('rm *.log')!.rule).toEqual({
      tool: 'Bash', pattern: 'rm *.log', action: 'allow', match: 'exact',
    });
  });

  it('does NOT trim — the stored pattern is the subject the engine will compare', () => {
    // permissionSubject hands over args.command verbatim (tools/bash.ts). A
    // trimmed pattern would be one character off and never fire again.
    expect(exactOf('ls -la\n')!.rule.pattern).toBe('ls -la\n');
  });

  it('an empty or whitespace command offers nothing', () => {
    expect(bashGrantOptions('')).toEqual([]);
    expect(bashGrantOptions('   ')).toEqual([]);
  });
});

describe('bashGrantOptions — wide rung derivation', () => {
  it('program + subcommand when the second token is a word', () => {
    expect(wideOf('cargo test --release')!.rule.pattern).toBe('cargo test*');
    expect(wideOf('npm run build')!.rule.pattern).toBe('npm run*');
  });

  it('program only when the second token is a flag or a path', () => {
    expect(wideOf('ls -la /tmp')!.rule.pattern).toBe('ls*');
    expect(wideOf('node scripts/x.mjs')!.rule.pattern).toBe('node*');
  });

  it('a quoted second token is an argument, not a subcommand', () => {
    expect(wideOf('echo "hi there"')!.rule.pattern).toBe('echo*');
  });

  it('the label never contains rule syntax', () => {
    expect(wideOf('cargo test --release')!.label).not.toMatch(/[*?]/);
  });
});

describe('bashGrantOptions — postcondition 1: an option covers its own command', () => {
  const corpus = [
    'npm run build', 'npm run build > log.txt', 'npm run build && git push',
    'ls -la /tmp', 'rm -rf build', 'sudo apt install x', 'cargo test --release',
    'git status', 'echo "hi there"', "grep -r 'x' .", 'node scripts/x.mjs',
    '  npm run build', 'git push origin feat/x',
  ];
  it('never offers an option that does not cover the command it was derived from', () => {
    for (const cmd of corpus) {
      for (const opt of bashGrantOptions(cmd)) {
        expect(ruleMatches(opt.rule, cmd), `${opt.scope} rung for ${JSON.stringify(cmd)}`).toBe(true);
      }
    }
  });

  it('a chained or redirected command gets no wide rung — safety rule 1 vetoes it', () => {
    expect(wideOf('npm run build && git push')).toBeUndefined();
    expect(exactOf('npm run build && git push')).toBeDefined();
    expect(wideOf('npm run build > log.txt')).toBeUndefined();
    expect(exactOf('npm run build > log.txt')).toBeDefined();
  });

  it('leading whitespace costs the wide rung, never the exact one', () => {
    expect(wideOf('  npm run build')).toBeUndefined();
    expect(exactOf('  npm run build')!.rule.pattern).toBe('  npm run build');
  });
});

describe('bashGrantOptions — postcondition 2: an option admits nothing hostile', () => {
  it('refuses a program-wide git rung — it would cover pushes and hard resets', () => {
    // The second token is a flag, so the derived key is the program alone. Without
    // this postcondition the user is offered "Any git command", which outranks the
    // destructive deny-list once stored.
    expect(wideOf('git --no-pager log')).toBeUndefined();
    expect(wideOf('git -C some/repo status')).toBeUndefined();
    expect(exactOf('git --no-pager log')).toBeDefined();
  });

  it('leaves innocent program-wide rungs alone', () => {
    expect(wideOf('ls -la /tmp')!.rule.pattern).toBe('ls*');
    expect(wideOf('node scripts/x.mjs')!.rule.pattern).toBe('node*');
    expect(wideOf('git status')!.rule.pattern).toBe('git status*');
  });

  it('does NOT withhold the branch rung for master — that grant is the point', () => {
    // The corpus must not contain a plain push to master, or postcondition 2
    // would refuse the very rung §5.1 exists to build.
    expect(wideOf('git push origin master')!.rule.pattern).toBe('git push*origin master');
  });

  it('no wide rung anywhere admits a hostile command', () => {
    const commands = [
      'git --no-pager log', 'git -C x status', 'git status', 'npm run build',
      'ls -la', 'node x.mjs', 'cargo test', 'docker ps', 'echo hi',
    ];
    for (const cmd of commands) {
      const wide = wideOf(cmd);
      if (!wide) continue;
      for (const hostile of HOSTILE_CORPUS) {
        expect(ruleMatches(wide.rule, hostile), `${wide.rule.pattern} admits ${hostile}`).toBe(false);
      }
    }
  });

  it('every destructive deny-list family has a corpus entry (adding a family fails here)', () => {
    // Only the base patterns: the '* …' compound variants exist to catch chained
    // commands, which safety rule 1 already keeps out of every grant.
    const families = DESTRUCTIVE_DENY_LIST.filter((r) => !r.pattern!.startsWith('* '));
    for (const family of families) {
      expect(
        HOSTILE_CORPUS.some((c) => ruleMatches(family, c)),
        `no HOSTILE_CORPUS entry matches ${family.pattern}`,
      ).toBe(true);
    }
  });
});

describe('bashGrantOptions — deny-listed families', () => {
  it.each(['rm -rf build', 'rmdir old', 'sudo apt install x', 'format d:', 'git reset --hard HEAD~1'])(
    'offers exact only for %s', (cmd) => {
      expect(wideOf(cmd)).toBeUndefined();
      expect(exactOf(cmd)).toBeDefined();
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/shared/bash-grant-shapes"`.

- [ ] **Step 3: Write the module**

Create `src/shared/bash-grant-shapes.ts`:

```ts
// The grant options offered when the user picks "Always allow" on a Bash command.
//
// WHY this is in shared/ and not in main/: the sentence the user reads in the
// confirm and the rule the engine stores must come from ONE function. Two
// derivations would eventually disagree, and the disagreement would be a grant
// that is wider than the sentence describing it — the exact failure this item
// exists to fix. Same reasoning as subject-glob.ts's own header.
import { DESTRUCTIVE_DENY_LIST } from './permission-types';
import type { PermissionRule } from './permission-types';
import { ruleMatches } from './subject-glob';

export type GrantScope = 'exact' | 'wide';

export interface GrantOption {
  scope: GrantScope;
  /** Exactly what gets persisted. The renderer never constructs this — it sends
   *  the `scope` selector and the main process re-derives from the tool call. */
  rule: PermissionRule;
  /** Plain-English label. MUST NOT contain '*' or '?' — this string is rendered
   *  in the confirm and in Settings, on a screen written for people who have
   *  never seen a glob. */
  label: string;
}

// Commands a wide rung must never admit. One entry per destructive deny-list
// FAMILY, pinned by a test that fails if a family is added without one.
//
// WHY this exists at all: isDenyListed() below asks "is the command in front of
// the user dangerous?" — but the rule being offered covers commands nobody
// tested. `git --no-pager log` is not deny-listed and derives the rung `git*`,
// which then covers `git push origin master` and `git reset --hard` and, once
// stored, OUTRANKS the deny-list. Checking the rung against this corpus is the
// mirror image of the self-coverage postcondition, and the only thing standing
// between a mild-sounding button and a silent force-push.
//
// NOT in the corpus: a plain `git push origin master`. Pushing to master is
// something the user is deliberately allowed to grant (spec D4 — master is an
// ordinary branch), so it is not "hostile regardless of intent". Putting it here
// would refuse the very branch rung §5.1 exists to build. `git*` is still caught,
// by the --delete and --prune and reset --hard entries.
export const HOSTILE_CORPUS: readonly string[] = [
  'git push --delete origin master',
  'git push --prune origin master',
  'git reset --hard HEAD~1',
  'rm -rf /',
  'sudo rm -rf /',
  'rmdir /s /q C:\\Windows',
  'del /f /q C:\\boot.ini',
  'sudo apt-get install anything',
  'format c:',
];

interface CommandShape {
  /** Matched against `${program} ${subcommand}`. */
  key: string;
  /** False → NO "Always allow" of any kind, not even exact. Reserve this for the
   *  one situation an exact grant cannot honour either: the command text does not
   *  say what it will act on, because that resolves when it RUNS (bare
   *  `git push`). A command that is merely too complex to widen still gets its
   *  exact rung — remembering it byte-for-byte is as safe as any other exact
   *  grant, and refusing it means a repeated command that can never be answered
   *  permanently. */
  rememberable(tokens: string[]): boolean;
  /** The scoped wide rung, or null for "exact only". Never falls back to the
   *  generic rung: a shape exists precisely because the generic one is too wide
   *  for this command, so falling back would grant MORE, not less. */
  scope(tokens: string[]): { pattern: string; label: string } | null;
}

// Populated in Task 3.
const COMMAND_SHAPES: CommandShape[] = [];

/** Whitespace split that keeps quoted runs together. */
function tokenize(command: string): string[] {
  return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

/** A word, as opposed to a flag, a path, or a quoted argument — i.e. plausibly a
 *  subcommand. The quote test matters: without it `echo "hi there"` derives a
 *  rung labelled `Any echo "hi there" command`, which is an argument masquerading
 *  as a verb. */
function isSubcommand(token: string | undefined): boolean {
  return !!token && !token.startsWith('-') && !/^["']/.test(token) && !/[/\\.]/.test(token);
}

/** `program sub` when the second token is a verb, else `program`. */
function shapeKey(tokens: string[]): string {
  return isSubcommand(tokens[1]) ? `${tokens[0]} ${tokens[1]}` : tokens[0];
}

function isDenyListed(command: string): boolean {
  return DESTRUCTIVE_DENY_LIST.some((r) => ruleMatches(r, command));
}

function wideRule(pattern: string): PermissionRule {
  return { tool: 'Bash', pattern, action: 'allow', match: 'glob' };
}

function deriveWide(command: string, tokens: string[]): GrantOption | null {
  const key = shapeKey(tokens);
  const shape = COMMAND_SHAPES.find((s) => s.key === key);
  if (shape) {
    const scoped = shape.scope(tokens);
    return scoped ? { scope: 'wide', rule: wideRule(scoped.pattern), label: scoped.label } : null;
  }

  // A deny-listed family with no shape row gets no widening: for rm / sudo /
  // format / git reset --hard the varying part IS the dangerous part, and there
  // is nothing that must precede an `rm` target the way a remote must precede a
  // push refspec, so it cannot be bounded to a single target.
  if (isDenyListed(command)) return null;

  return { scope: 'wide', rule: wideRule(`${key}*`), label: `Any ${key} command` };
}

/** Grant options for a Bash command, narrowest first.
 *
 *  An EMPTY array means no "Always allow" may be offered at all — the caller must
 *  suppress the button, not fall back to something. */
export function bashGrantOptions(command: string): GrantOption[] {
  const tokens = tokenize(command);
  if (tokens.length === 0) return [];

  const shape = COMMAND_SHAPES.find((s) => s.key === shapeKey(tokens));
  if (shape && !shape.rememberable(tokens)) return [];

  // The command is stored VERBATIM — never trimmed. permissionSubject hands the
  // engine args.command unchanged, so a trimmed pattern would differ from the
  // subject by a character the user cannot see and would never match again.
  const options: GrantOption[] = [
    { scope: 'exact', rule: { tool: 'Bash', pattern: command, action: 'allow', match: 'exact' }, label: command },
  ];
  const wide = deriveWide(command, tokens);
  if (wide) options.push(wide);

  return options.filter((o) => {
    // POSTCONDITION 1 — never offer a rung that cannot cover the command in front
    // of the user. Without it, `npm run build > log.txt` is offered "any npm run
    // command", a rule safety rule 1 immediately refuses, so the user saves a
    // grant, gets asked again identically, and nothing explains why.
    if (!ruleMatches(o.rule, command)) return false;
    // POSTCONDITION 2 — never offer a rung that admits a known-destructive
    // command. An exact rung is exempt: it covers exactly the string the user is
    // looking at, so approving `rm -rf build` is a decision, not a surprise.
    if (o.scope === 'exact') return true;
    return !HOSTILE_CORPUS.some((hostile) => ruleMatches(o.rule, hostile));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): derive Bash grant options (exact + scoped wide rung)

One module owns both the sentence the user reads and the rule stored, so they
cannot drift, and it applies two postconditions before offering anything:

  1. the option must cover the command in front of the user, and
  2. a wide option must admit nothing from a corpus of destructive commands.

(2) is what stops `git --no-pager log` — whose second token is a flag, so the
derived rung is the program alone — from offering 'Any git command', a rule that
covers pushes and hard resets and outranks the deny-list once stored.

Commands are stored verbatim, never trimmed: permissionSubject hands the engine
args.command unchanged, so a trimmed pattern would silently never match again.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `git push` scopes to one branch

**Files:**
- Modify: `src/shared/bash-grant-shapes.ts` (fill `COMMAND_SHAPES`)
- Test: `tests/bash-grant-shapes.test.ts`

**Interfaces:**
- Consumes: `CommandShape`, `bashGrantOptions` (Task 2).
- Produces: no new exports. `bashGrantOptions('git push origin feat/x')` now returns a wide option whose `rule.pattern` is `git push*origin feat/x` and whose `label` is `Always allow pushing to feat/x` (placeholder copy — Task 4 settles the real wording); `bashGrantOptions('git push')` returns `[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bash-grant-shapes.test.ts`:

```ts
describe('bashGrantOptions — git push scopes to one branch', () => {
  it('derives a remote-anchored pattern and a branch-named label', () => {
    const opt = wideOf('git push origin feat/x')!;
    expect(opt.rule.pattern).toBe('git push*origin feat/x');
    expect(opt.label).toBe('Always allow pushing to feat/x');
  });

  it('covers the harmless flag forms of the same push', () => {
    const rule = wideOf('git push origin feat/x')!.rule;
    expect(ruleMatches(rule, 'git push origin feat/x')).toBe(true);
    expect(ruleMatches(rule, 'git push -u origin feat/x')).toBe(true);
    expect(ruleMatches(rule, 'git push --set-upstream origin feat/x')).toBe(true);
  });

  it('does NOT cover the flags that would unbind it (safety rule 2)', () => {
    const rule = wideOf('git push origin feat/x')!.rule;
    expect(ruleMatches(rule, 'git push --delete origin feat/x')).toBe(false);
    expect(ruleMatches(rule, 'git push --prune origin feat/x')).toBe(false);
    expect(ruleMatches(rule, 'git push --force origin feat/x')).toBe(false);
    expect(ruleMatches(rule, 'git push --all origin feat/x')).toBe(false);
  });

  it('does NOT leak to another branch, a longer branch name, or a multi-ref push', () => {
    const rule = wideOf('git push origin feat/x')!.rule;
    expect(ruleMatches(rule, 'git push origin feat/x-2')).toBe(false);
    expect(ruleMatches(rule, 'git push origin master')).toBe(false);
    // The whole reason the remote is in the pattern: this pushes master TOO.
    expect(ruleMatches(rule, 'git push origin master feat/x')).toBe(false);
    expect(ruleMatches(rule, 'git push origin feat/x master')).toBe(false);
  });

  it('master is an ordinary branch — it scopes like any other', () => {
    const opt = wideOf('git push origin master')!;
    expect(opt.rule.pattern).toBe('git push*origin master');
    expect(opt.label).toBe('Always allow pushing to master');
  });

  it('reads the destination out of a HEAD: refspec for the LABEL only', () => {
    expect(wideOf('git push origin HEAD:feat/x')!.label).toBe('Always allow pushing to feat/x');
    expect(wideOf('git push origin HEAD:feat/x')!.rule.pattern).toBe('git push*origin HEAD:feat/x');
  });

  it('a push with no target of its own offers NOTHING — not even exact', () => {
    // These send whatever branch is checked out AT RUN TIME. The branch changes
    // underneath the grant, so no grant — however narrow — can honestly name it.
    expect(bashGrantOptions('git push')).toEqual([]);
    expect(bashGrantOptions('git push --force')).toEqual([]);
    expect(bashGrantOptions('git push origin')).toEqual([]);
    expect(bashGrantOptions('git push origin HEAD')).toEqual([]);
    expect(bashGrantOptions('git push origin @')).toEqual([]);
  });

  it('a push it cannot scope still gets its exact rung', () => {
    // Amendment A3: "cannot widen" is not "cannot remember". Each of these names
    // its target in the command text, so byte-exact is honest and safe.
    for (const cmd of [
      'git push origin master feat/x',   // two refs — cannot bound to one branch
      'git push origin +feat/x',         // force form — a "pushing to" label would lie
      'git push origin :feat/x',         // delete form — ditto
      "git push 'o*' 'b*'",              // metacharacters would become wildcards
    ]) {
      expect(wideOf(cmd), `wide for ${cmd}`).toBeUndefined();
      expect(exactOf(cmd)!.rule, `exact for ${cmd}`).toEqual({
        tool: 'Bash', pattern: cmd, action: 'allow', match: 'exact',
      });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts -t "git push"
```

Expected: FAIL — the wide rung is `undefined` for every `git push …` (the deny-list branch in `deriveWide` returns null), and `bashGrantOptions('git push')` returns the exact rung instead of `[]`.

- [ ] **Step 3: Fill in the shape row**

In `src/shared/bash-grant-shapes.ts`, replace `// Populated in Task 3.` and `const COMMAND_SHAPES: CommandShape[] = [];` with:

```ts
/** Positional arguments to `git push` — the remote and the refspecs, with flags
 *  removed. `--opt=value` is one token so it filters out cleanly; a `--opt value`
 *  form would leave `value` looking positional, which is why the branch rung is
 *  produced ONLY at exactly two positionals. */
function pushPositionals(tokens: string[]): string[] {
  return tokens.slice(2).filter((t) => !t.startsWith('-'));
}

/** The branch a refspec ends up writing to, ignoring decoration. `HEAD:feat/x`
 *  and `+feat/x` and `:feat/x` all end at feat/x. */
function refDestination(refspec: string): string {
  const afterColon = refspec.includes(':') ? refspec.slice(refspec.indexOf(':') + 1) : refspec.replace(/^\+/, '');
  return afterColon.replace(/^refs\/heads\//i, '');
}

/** Does the command TEXT fix where this ref goes? `HEAD` and `@` do not — they
 *  resolve to whatever is checked out when the command runs, which is a different
 *  branch next week. Nothing can be remembered about them, at any width. */
function namesItsTarget(refspec: string): boolean {
  const dest = refDestination(refspec);
  return dest.length > 0 && !/^(HEAD|@)$/i.test(dest);
}

const COMMAND_SHAPES: CommandShape[] = [
  {
    key: 'git push',
    // A bare `git push` pushes whatever branch is checked out AT RUN TIME, and
    // that branch changes underneath the grant — approve it on a feature branch
    // and next week it silently pushes master. Nothing here can name the target,
    // so no "Always allow" is offered at all; allow-once only. Same for
    // `git push origin` and `git push origin HEAD`.
    //
    // Everything else IS remembered, at least exactly (amendment A3): a two-ref
    // push or a `+`/`:` refspec cannot be widened honestly, but it names its own
    // targets, so a byte-exact grant is as safe as any other.
    rememberable: (tokens) => {
      const pos = pushPositionals(tokens);
      return pos.length >= 2 && pos.slice(1).every(namesItsTarget);
    },
    scope: (tokens) => {
      const pos = pushPositionals(tokens);
      // Exactly one remote + one refspec. Zero or one positional never reaches
      // here (rememberable already returned false); three or more is a multi-ref
      // push, which cannot be bounded to a single branch.
      if (pos.length !== 2) return null;
      const [remote, refspec] = pos;
      // A '*' or '?' would become a WILDCARD in the stored pattern rather than a
      // literal. Git forbids both in ref names, so this only fires on something
      // adversarial — refuse to widen rather than widen wrongly.
      if (/[*?]/.test(remote) || /[*?]/.test(refspec)) return null;
      // '+feat/x' force-pushes and ':feat/x' DELETES the branch. A rung labelled
      // "pushing to feat/x" would describe neither. Exact only.
      if (refspec.startsWith('+') || refspec.startsWith(':')) return null;
      // WHY the remote is in the pattern and not just the branch: `git push*feat/x`
      // also matches `git push origin master feat/x`, which pushes master TOO —
      // git takes any number of refspecs and this glob cannot count tokens. Pinning
      // the token that must immediately precede the refspec is the only way to
      // bound the command to a single ref. A grant named "pushing to feat/x" that
      // silently also pushes master is exactly what this item exists to prevent.
      //
      // The trailing text after the wildcard is also what makes safety rule 2 fire
      // on this rule, keeping `--delete` / `--prune` / `--force` out of it.
      return {
        pattern: `git push*${remote} ${refspec}`,
        label: `Always allow pushing to ${refDestination(refspec)}`,
      };
    },
  },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts
```

Expected: PASS, including both Task 2 postcondition suites (which now also walk the git-push rows).

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): git push grants scope to one branch

Per-branch, no protected-branch policy: master and main are ordinary branches,
each asked about separately and stored separately, so 'always allow pushing to
master' is available and individually revocable.

The remote is in the pattern because 'git push*feat/x' alone also matches
'git push origin master feat/x' — which pushes master too. That trailing text is
also what makes safety rule 2 apply, so the grant does not cover --delete,
--prune, --all or --force on the branch it is named after.

A push whose target is not in the command text (bare push, 'git push origin',
'git push origin HEAD') gets no Always-allow at all. A push that merely cannot be
widened (two refs, '+ref', ':ref') still gets its exact rung.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Workbench compare surface — Destin settles the confirm

> **Moved ahead of the plumbing on purpose.** It only needs Tasks 2–3, and it ends in a question to Destin. Asking it now means Tasks 5–7 proceed while he decides, instead of the whole plan stalling. **Task 8 is the only task blocked on the answer.**

**Files:**
- Modify: `src/renderer/dev/workbench/compare/registry.tsx` (add surface, flip `ACTIVE_FIRST`)
- Modify: `src/renderer/dev/workbench/mock-shim.ts` only if a channel is missing

**Interfaces:**
- Consumes: `bashGrantOptions` (Tasks 2–3) so every candidate renders the REAL options.
- Produces: a settled decision recorded in the spec — no code contract.

> **This task ends in a decision, not a merge.** Do not implement the confirm in `ToolCard.tsx` here.

- [ ] **Step 1: Read the registry's own rules**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
sed -n '1,80p' src/renderer/dev/workbench/compare/registry.tsx
```

The header states the compare-view conventions. Follow them exactly — 2b's `full-auto-ask` surface is the worked example to copy.

- [ ] **Step 2: Add the surface**

Add a surface with id `bash-grant-width`, each variant rendered against the real `bashGrantOptions` output for the scenarios below (one row each, so Destin sees them side by side):

1. `git push origin feat/login` — two options, deny-listed, Full auto (2b safety-stop band)
2. `git push origin master` — two options, deny-listed, Ask-first
3. `git push` — **no** Always-allow at all, allow-once only
4. `npm run build` — two options, not deny-listed, Ask-first (the ordinary path, which has no confirm today)
5. `rm -rf build` — one option (exact only), deny-listed
6. `npm run build > log.txt` — one option (exact only), not deny-listed
7. `git --no-pager log` — one option (exact only), not deny-listed. **This row is the point of postcondition 2** — the wide rung is withheld because "Any git command" would cover pushes.

Candidate shapes to render (at minimum — add others if a better one occurs):
- **A: two buttons.** "Allow once" / "Always allow this command" / "Always allow pushing to feat/login" as three buttons in the confirm.
- **B: choice then confirm.** The existing confirm gains a two-row radio (exact preselected) above the existing Cancel/Always-allow pair.
- **C: inline widen.** The button stays "Always Allow"; the confirm that follows offers the widening as a second, visually secondary action.

- [ ] **Step 3: Flip `ACTIVE_FIRST`**

```tsx
const ACTIVE_FIRST = 'bash-grant-width';
```

- [ ] **Step 4: Boot-check the workbench**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
node scripts/workbench-boot-check.mjs
```

Expected: all seven routes load with no console error. This has caught three boot crashes that the unit suite passed through — do not skip it.

- [ ] **Step 5: Hand it to Destin**

```bash
cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh
```

Tell him the surface is `?mode=workbench&view=compare` and that `bash-grant-width` is first. **Do not automate the visual review** — he can eyeball it in 30 seconds, and scripting multi-window interaction wastes time (workspace `CLAUDE.md`, "Flag final-stage visual verification").

Ask him for, specifically:

1. **Which candidate shape wins.**
2. **The confirm's header**, now that "Always allow this exact command" is false for the wide rung.
3. **The wording of the wide option itself.** `Always allow pushing to feat/x` and `Any npm run command` are placeholders, not settled copy.
4. **The caveat wording, and whether it appears at all.** A wide grant does not cover the command chained with another one (`npm run build && …`), and a branch grant does not cover `--delete` / `--force` / `--prune`. This item deliberately does NOT explain that *after the fact* when a command asks again (see amendment A5) — so if it is going to be said, it is said here, before the grant is made. Options worth showing him: a one-line note under the wide option, a shorter option label that implies it ("…run on its own"), or nothing at all.
5. **What the card says for scenario 3**, where there is no Always-allow to offer.
6. **Whether the one-time "some approvals will start asking again" notice is worth building.** Spec §12: re-reading old grants as byte-exact means anyone who approved a command containing `*` or `?` loses that grant. It is always the safe direction, but it will read as the app forgetting an approval. His call; if yes, it becomes a ROADMAP item, not part of this item.

- [ ] **Step 6: Record the outcome and commit**

Append a `## Compare rounds` section to `docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md` in the workspace repo, recording each round and what he chose, the way 2b's spec records its four rounds. Commit the surface (sub-repo) and the spec update (workspace repo) separately.

---

## Task 5: Rule identity is the quad, and legacy rules read as exact

**Files:**
- Modify: `src/main/harness/permission-store.ts` (`rulesFor`, `remember`, `list`, `remove`)
- Modify: `src/main/harness/native-session-host.ts` (`revokeRule` filter, `remember-rule` dedupe in `wire`)
- Modify: `.claude/rules/native-permissions.md` and `docs/MAP.md` (workspace repo)
- Test: `tests/permission-store.test.ts`, `tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: `normalizeRule`, `sameRule` (Task 1).
- Produces: no new exports. `PermissionStore.rulesFor` and `.list` now return rules that always carry `match`; `.remove`, `.remember`, and `NativeSessionHost.revokeRule` compare with `sameRule`.

- [ ] **Step 1: Check for the in-flight rename first**

```bash
cd /home/destin/youcoded-dev/youcoded && git worktree list && git log --oneline origin/master -5
```

If `slug-repair` has landed, `cwdToProjectSlug` may have a new name. Use whatever the file imports — do not rename anything in this task.

- [ ] **Step 2: Write the failing tests**

Append to `tests/permission-store.test.ts` (reuse the file's existing `NativeHome` fake and store construction — follow the setup already at the top of that file):

```ts
describe('legacy normalization and quad identity', () => {
  it('a stored rule with no match field reads back as exact', async () => {
    // Written before this feature existed: the raw command, evaluated as a glob.
    await store.remember('/p', { tool: 'Bash', pattern: 'rm *.log', action: 'allow' });
    const rules = await store.rulesFor('/p');
    expect(rules[0].match).toBe('exact');
  });

  it('normalization also applies to the management list', async () => {
    await store.remember('/p', { tool: 'Bash', pattern: 'rm *.log', action: 'allow' });
    const projects = await store.list();
    expect(projects[0].rules[0].match).toBe('exact');
  });

  it('remove() matches a normalized rule against an un-normalized disk row', async () => {
    await store.remember('/p', { tool: 'Bash', pattern: 'rm *.log', action: 'allow' });
    const listed = (await store.list())[0];
    // The renderer round-trips exactly what list() gave it — which now carries
    // match:'exact' while the disk row does not.
    expect(await store.remove(listed.slug, listed.rules[0])).toBe(true);
    expect(await store.rulesFor('/p')).toEqual([]);
  });

  it('two grants differing only in match are different grants', async () => {
    const exact = { tool: 'Bash', pattern: 'npm run build', action: 'allow' as const, match: 'exact' as const };
    const wide = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const };
    await store.remember('/p', exact);
    await store.remember('/p', wide);
    expect(await store.rulesFor('/p')).toHaveLength(2);
    const slug = (await store.list())[0].slug;
    expect(await store.remove(slug, wide)).toBe(true);
    const left = await store.rulesFor('/p');
    expect(left).toHaveLength(1);
    expect(left[0].pattern).toBe('npm run build');
  });

  it('re-approving the same grant does not duplicate it or reset its date', async () => {
    const rule = { tool: 'Bash', pattern: 'npm run build', action: 'allow' as const, match: 'exact' as const };
    await store.remember('/p', rule);
    const first = (await store.list())[0].rules[0].grantedAt;
    await store.remember('/p', rule);
    const after = (await store.list())[0].rules;
    expect(after).toHaveLength(1);
    expect(after[0].grantedAt).toBe(first);
  });
});
```

Append to `tests/native-session-host.test.ts`, inside the existing `revokeRule / revokeProject` describe:

```ts
  it('revokes only the matching quad from a live session', async () => {
    const wide = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const };
    const exact = { tool: 'Bash', pattern: 'npm run build', action: 'allow' as const, match: 'exact' as const };
    // (Use the same helper this describe already uses to seed rememberedFor for a
    // live session — seed both rules, revoke `wide`, assert `exact` survives.)
    seedRemembered(sessionId, [wide, exact]);
    await host.revokeRule(slugFor(cwd), wide);
    expect(rememberedOf(sessionId)).toEqual([exact]);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/permission-store.test.ts tests/native-session-host.test.ts
```

Expected: FAIL — `match` is `undefined` on read; the two-grants test finds one rule because the triple collapses them.

- [ ] **Step 4: Implement**

In `src/main/harness/permission-store.ts`, change the import line to include the helpers:

```ts
import { normalizeRule, sameRule } from '../../shared/permission-types';
import type { PermissionRule, StoredProject, StoredRule } from '../../shared/permission-types';
```

Then change the four methods:

```ts
  /** Remembered rules for the project owning `cwd`, or [] if none stored. */
  async rulesFor(cwd: string): Promise<PermissionRule[]> {
    const data = (this.home.readJson(FILE) as PermFile | null) ?? EMPTY;
    // normalizeRule: a rule written before this feature carries no `match` and
    // would otherwise be evaluated as a glob, which is how "always allow this
    // exact command" turned `rm *.log` into a wildcard grant. Reading it as
    // exact restores the promise the user was actually shown.
    return (data.projects?.[cwdToProjectSlug(cwd)]?.rules ?? []).map(normalizeRule);
  }
```

In `remember`, replace the `dup` computation:

```ts
      // Identity is the QUAD (tool, pattern, action, match) — see sameRule, which
      // normalizes both sides so a legacy disk row compares in the semantics it is
      // actually evaluated with. grantedAt stays excluded so re-approving does not
      // look like a fresh grant.
      const dup = rules.some((r) => sameRule(r, rule));
```

In `list`, normalize the rules it hands out:

```ts
      rules: (entry?.rules ?? []).map(normalizeRule),
```

In `remove`, replace the filter predicate:

```ts
      const kept = rules.filter((r) => {
        // sameRule normalizes both sides. The renderer round-trips what list()
        // gave it (already normalized) against disk rows that are not, and an
        // un-normalized comparison here would silently fail to remove every
        // pre-existing rule.
        const match = sameRule(r, rule);
        if (match) hit = true;
        return !match;
      });
```

In `src/main/harness/native-session-host.ts`, add `sameRule` to the `permission-types` import, then replace the in-memory filter in `revokeRule`:

```ts
      this.rememberedFor.set(sessionId, mem.filter((r) => !sameRule(r, rule)));
```

and the dedupe in the `remember-rule` handler inside `wire`:

```ts
      if (!mem.some((r) => sameRule(r, rule))) {
```

Update the doc comment above `revokeRule` — the paragraph beginning "The in-memory filter compares the (tool, pattern, action) TRIPLE" — to:

```
 *  The in-memory filter compares the (tool, pattern, action, match) QUAD via
 *  sameRule, not whole objects: a rule read back off disk carries a `grantedAt`
 *  key the in-memory copy never had, so an equality check would silently stop
 *  matching. `match` joined the identity when Bash grants gained a scoped wide
 *  shape — without it, "this exact command" and "any command of this kind"
 *  collapse into one row and Settings revokes the wrong one.
```

- [ ] **Step 5: Update the workspace docs**

In `/home/destin/youcoded-dev`:

**a.** `.claude/rules/native-permissions.md` — replace the `remember() spreads the existing entry` invariant's second sentence:

```
**Invariant:** `remember()` writes `{ ...existingEntry, cwd, rules }`, never `{ rules }`.
Rule identity everywhere — dedupe, disk removal, in-memory filter — is
`sameRule(a, b)`: the `(tool, pattern, action, match)` quad, with a missing
`match` read as `'exact'` (sameRule normalizes both sides itself).
```

Add a second invariant:

```
**Invariant:** `ruleMatches` in `src/shared/subject-glob.ts` is the ONLY function
that decides whether a rule covers a subject. It owns two narrowings that apply
to wildcard Bash GRANTS only — a wildcard never swallows a shell operator, and a
wildcard with text after it never swallows a destructive flag. They live in the
matcher rather than on each rule so a new rule-builder cannot forget them.
Guard: `tests/subject-glob.test.ts`, `tests/bash-grant-shapes.test.ts`.
```

Add to the `verify:` block:

```yaml
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "sameRule"
  - path: youcoded/desktop/src/shared/subject-glob.ts
    contains: "BOUNDED_RUNG_VETO"
  - path: youcoded/desktop/src/shared/bash-grant-shapes.ts
    contains: "HOSTILE_CORPUS"
  - test: youcoded/desktop/tests/bash-grant-shapes.test.ts
```

Bump `last_verified:` to `2026-08-13`.

**b.** `docs/MAP.md` — the "Native permissions (Always-allow grants)" row lists the subsystem's entry points and does not yet know about the matcher or the derivation module. Add to its entry-points cell:

```
youcoded/desktop/src/shared/subject-glob.ts
youcoded/desktop/src/shared/bash-grant-shapes.ts
youcoded/desktop/src/main/harness/permission-engine.ts
```

and add `youcoded/desktop/tests/bash-grant-shapes.test.ts` and `youcoded/desktop/tests/subject-glob.test.ts` to its guard-tests cell.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/permission-store.test.ts tests/native-session-host.test.ts
```

Expected: PASS.

- [ ] **Step 7: Verify and commit (two repos)**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "fix(permissions): rule identity is the quad; legacy rules read as exact

Two grants that differ only in match are different grants — collapsing them made
Settings revoke the wrong one once Bash grants gained a scoped shape.

Every rule ever persisted stored a raw tool subject that was then evaluated as a
glob, so 'rm *.tmp' was a wildcard grant nobody asked for. Reading a match-less
rule as exact restores the promise the confirm made and only ever allows less.

sameRule normalizes both sides, so an absent 'match' has ONE meaning at every
call site instead of one per caller.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"

cd /home/destin/youcoded-dev
git add .claude/rules/native-permissions.md docs/MAP.md
git commit -m "docs(rules): permission rule identity is the quad; the matcher owns the safety rules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Thread the rung selector from the card to the store

**Files:**
- Modify: `src/main/harness/permission-broker.ts` (`AskDecision`, `respond`)
- Modify: `src/main/harness/harness-session.ts` (the `remember-rule` emit in the tool-call gate)
- Test: `tests/native-permission-broker.test.ts`, `tests/harness-session.test.ts`

**Interfaces:**
- Consumes: `bashGrantOptions`, `GrantScope` (Tasks 2–3).
- Produces:
  - `AskDecision.grantScope?: GrantScope` — always populated on a resolved ask, defaulting to `'exact'`.
  - `harness-session` emits `remember-rule` with the derived rule, or emits nothing when `bashGrantOptions` returns `[]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/native-permission-broker.test.ts`:

```ts
describe('grantScope', () => {
  it('passes a valid selector through', async () => {
    const p = broker.ask({ sessionId: 's', toolName: 'Bash', toolInput: { command: 'npm run build' }, denyListed: false });
    const id = capturedRequestId();
    broker.respond(id, { decision: { behavior: 'allow' }, updatedPermissions: ['x'], grantScope: 'wide' });
    await expect(p).resolves.toMatchObject({ behavior: 'allow', always: true, grantScope: 'wide' });
  });

  it('fails narrow on anything that is not the literal "wide"', async () => {
    for (const bad of [undefined, 'WIDE', 'tool-wide', 42, { scope: 'wide' }, null]) {
      const p = broker.ask({ sessionId: 's', toolName: 'Bash', toolInput: {}, denyListed: false });
      broker.respond(capturedRequestId(), { decision: { behavior: 'allow' }, updatedPermissions: ['x'], grantScope: bad });
      await expect(p).resolves.toMatchObject({ grantScope: 'exact' });
    }
  });
});
```

Append to `tests/harness-session.test.ts` (follow the file's existing harness for driving one tool call with a scripted `askUser`):

```ts
describe('remember-rule derivation', () => {
  it('an exact grant stores the literal command with match:exact', async () => {
    const rules = await runToolAndCaptureRules({
      command: 'rm *.log',
      decision: { behavior: 'allow', always: true, grantScope: 'exact' },
    });
    expect(rules).toEqual([{ tool: 'Bash', pattern: 'rm *.log', action: 'allow', match: 'exact' }]);
  });

  it('a wide grant stores the derived scoped rule, not the raw command', async () => {
    const rules = await runToolAndCaptureRules({
      command: 'git push origin feat/x',
      decision: { behavior: 'allow', always: true, grantScope: 'wide' },
    });
    expect(rules[0].pattern).toBe('git push*origin feat/x');
  });

  it('a renderer asking for "wide" on a command with no wide rung gets exact', async () => {
    const rules = await runToolAndCaptureRules({
      command: 'rm -rf build',
      decision: { behavior: 'allow', always: true, grantScope: 'wide' },
    });
    expect(rules[0]).toEqual({ tool: 'Bash', pattern: 'rm -rf build', action: 'allow', match: 'exact' });
  });

  it('a renderer asking for "wide" on a command whose rung is withheld gets exact', async () => {
    // Postcondition 2 withholds "Any git command" here.
    const rules = await runToolAndCaptureRules({
      command: 'git --no-pager log',
      decision: { behavior: 'allow', always: true, grantScope: 'wide' },
    });
    expect(rules[0].match).toBe('exact');
    expect(rules[0].pattern).toBe('git --no-pager log');
  });

  it('nothing is remembered when the command offers no grant at all', async () => {
    const rules = await runToolAndCaptureRules({
      command: 'git push',
      decision: { behavior: 'allow', always: true, grantScope: 'exact' },
    });
    expect(rules).toEqual([]);
  });

  it('a non-Bash grant gains match:exact and is otherwise unchanged', async () => {
    const rules = await runToolAndCaptureRules({
      tool: 'Write', input: { file_path: 'src/a.ts', content: 'x' },
      decision: { behavior: 'allow', always: true },
    });
    expect(rules).toEqual([{ tool: 'Write', pattern: 'src/a.ts', action: 'allow', match: 'exact' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/native-permission-broker.test.ts tests/harness-session.test.ts
```

Expected: FAIL — `grantScope` is absent from the resolved decision; the emitted rule is the raw command with no `match`.

- [ ] **Step 3: Implement the broker half**

In `src/main/harness/permission-broker.ts`, add to `AskDecision`:

```ts
  /** Which grant width the user picked, when they picked "Always allow".
   *  A SELECTOR, never a pattern: the renderer must not be able to name the rule
   *  it is granting itself — remembered rules are the top precedence layer.
   *  Always populated on a resolved ask; defaults to the narrow option. */
  grantScope?: GrantScope;
```

with the import:

```ts
import type { GrantScope } from '../../shared/bash-grant-shapes';
```

In `respond`, after the `always` computation:

```ts
    // Validate to the two literals and FAIL NARROW on anything else. This value
    // is persisted (unlike permissionMode, which is display-only), so it is
    // checked here AND re-derived at the session rather than trusted.
    const grantScope: GrantScope = decision.grantScope === 'wide' ? 'wide' : 'exact';
```

and add it to the resolve call:

```ts
    entry.resolve({ behavior, always, grantScope, ...(updatedInput ? { updatedInput } : {}) });
```

- [ ] **Step 4: Implement the harness-session half**

In `src/main/harness/harness-session.ts`, add the import:

```ts
import { bashGrantOptions } from '../../shared/bash-grant-shapes';
import type { GrantScope } from '../../shared/bash-grant-shapes';
```

Add this module-level function next to the other helpers near the top of the file:

```ts
/** The rule an "Always allow" persists.
 *
 *  The RENDERER never supplies a pattern — only a scope selector — and this
 *  re-derives from the tool call the session already holds. A renderer that could
 *  name its own pattern could grant itself anything, because remembered rules are
 *  the final precedence layer, above the destructive deny-list.
 *
 *  Returns null when nothing may be remembered for this call. */
function rememberedRuleFor(
  toolName: string,
  subject: string | undefined,
  scope: GrantScope | undefined,
): PermissionRule | null {
  if (toolName === 'Bash' && typeof subject === 'string') {
    // The subject is passed through untouched — bashGrantOptions does not trim,
    // so the exact rung is byte-identical to what the engine will compare later.
    const options = bashGrantOptions(subject);
    // Empty means no grant of any width may be offered (a bare `git push`, whose
    // target is not in the command and changes underneath the grant). Fail closed.
    if (options.length === 0) return null;
    // Fall back to the narrowest option when the requested width was not offered
    // for this command — never widen past what bashGrantOptions produced.
    return (options.find((o) => o.scope === (scope ?? 'exact')) ?? options[0]).rule;
  }
  if (subject === undefined) return { tool: toolName, action: 'allow' };
  // Non-Bash subjects are literal paths / ids. match:'exact' makes them mean what
  // the confirm always claimed — a path containing '*' was a wildcard grant.
  return { tool: toolName, pattern: subject, action: 'allow', match: 'exact' };
}
```

Replace the `remember-rule` emit line — currently:

```ts
      if (d.always && !externalAsk) this.emit('remember-rule', { tool: call.toolName, ...(subject !== undefined ? { pattern: subject } : {}), action: 'allow' });
```

with:

```ts
      if (d.always && !externalAsk) {
        const rule = rememberedRuleFor(call.toolName, subject, d.grantScope);
        if (rule) this.emit('remember-rule', rule);
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/native-permission-broker.test.ts tests/harness-session.test.ts tests/harness-session-loop.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): thread the grant-width selector, re-derive the rule in main

The card sends 'exact' or 'wide' and nothing else. The session re-derives the
pattern from the tool call it already holds, because remembered rules outrank the
destructive deny-list and a renderer that could name its own pattern could grant
itself anything. A requested width that was not offered falls back to the
narrowest one that was.

Non-Bash grants gain match:'exact' too — a file path containing '*' was a
wildcard grant on the same code path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Settings → Permissions renders the three widths

**Files:**
- Modify: `src/shared/bash-grant-shapes.ts` (add `describeBashPattern`)
- Modify: `src/renderer/components/permissions/describe-rule.ts` (`RuleDescription.width` replaces `broad`)
- Modify: `src/renderer/components/PermissionsSection.tsx` (the breadth-note site)
- Test: `tests/describe-rule.test.ts`, `tests/permissions-section.test.tsx`, `tests/bash-grant-shapes.test.ts`

**Interfaces:**
- Consumes: `bashGrantOptions` internals (Tasks 2–3).
- Produces:
  - `describeBashPattern(pattern: string): string | null` from `src/shared/bash-grant-shapes`
  - `RuleDescription.width: 'exact' | 'wide' | 'tool-wide'` (replaces `broad: boolean`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/bash-grant-shapes.test.ts`:

```ts
import { describeBashPattern } from '../src/shared/bash-grant-shapes';

describe('describeBashPattern — the reverse direction', () => {
  it('reads a scoped push pattern back as the sentence the confirm showed', () => {
    expect(describeBashPattern('git push*origin feat/x')).toBe('Pushing to feat/x');
    expect(describeBashPattern('git push*origin master')).toBe('Pushing to master');
    expect(describeBashPattern('git push*origin HEAD:feat/x')).toBe('Pushing to feat/x');
  });

  it('reads a generic wide pattern back', () => {
    expect(describeBashPattern('npm run*')).toBe('Any npm run command');
    expect(describeBashPattern('curl*')).toBe('Any curl command');
  });

  it('returns null for anything it cannot phrase', () => {
    expect(describeBashPattern('rm -rf build')).toBeNull();
  });

  it('never emits rule syntax', () => {
    for (const p of ['git push*origin feat/x', 'npm run*', 'curl*']) {
      expect(describeBashPattern(p)).not.toMatch(/[*?]/);
    }
  });

  it('round-trips every wide rung this module can produce', () => {
    // The two directions MUST agree. Living in one file is not a guarantee — this
    // is. Any new command shape that produces a pattern this cannot phrase fails
    // here rather than showing a raw glob in Settings.
    const commands = [
      'git push origin feat/x', 'git push origin master', 'git push origin HEAD:feat/x',
      'npm run build', 'cargo test --release', 'ls -la /tmp', 'node scripts/x.mjs',
    ];
    for (const cmd of commands) {
      const wide = bashGrantOptions(cmd).find((o) => o.scope === 'wide');
      if (!wide) continue;
      expect(describeBashPattern(wide.rule.pattern!), `no phrase for ${wide.rule.pattern}`).not.toBeNull();
    }
  });
});
```

Append to `tests/describe-rule.test.ts`:

```ts
describe('width', () => {
  it('a pattern-less rule is tool-wide', () => {
    expect(describeRule({ tool: 'Bash', action: 'allow' }).width).toBe('tool-wide');
  });

  it('an exact rule is exact', () => {
    expect(describeRule({ tool: 'Bash', pattern: 'ls -la', action: 'allow', match: 'exact' }).width).toBe('exact');
  });

  it('a scoped push rule is wide and reads as a sentence', () => {
    const d = describeRule({
      tool: 'Bash', pattern: 'git push*origin master', action: 'allow', match: 'glob',
    });
    expect(d.width).toBe('wide');
    expect(d.verb).toBe('Pushing to master');
    expect(d.subject).toBeUndefined();
  });

  it('a specialist grant keeps its own sentence and is not tool-wide', () => {
    expect(describeRule({ tool: 'Task', pattern: 'read-only:/home/x/proj', action: 'allow' }).width).toBe('exact');
    expect(describeRule({ tool: 'Task', action: 'allow' }).width).toBe('tool-wide');
  });

  it('an MCP grant reports exact, not tool-wide', () => {
    expect(describeRule({ tool: 'mcp__srv__tool', action: 'allow' }).width).toBe('exact');
  });

  it('no description ever contains rule syntax', () => {
    const rules = [
      { tool: 'Bash', pattern: 'git push*origin master', action: 'allow' as const, match: 'glob' as const },
      { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const },
      { tool: '*', action: 'allow' as const },
    ];
    for (const r of rules) {
      const d = describeRule(r);
      expect(`${d.verb} ${d.subject ?? ''}`).not.toMatch(/[*?]/);
    }
  });
});
```

Append to `tests/permissions-section.test.tsx`:

```ts
it('renders a scoped push grant as a branch sentence, with no breadth note', () => {
  renderWithRules([{ tool: 'Bash', pattern: 'git push*origin master', action: 'allow', match: 'glob' }]);
  expect(screen.getByText(/Pushing to master/)).toBeInTheDocument();
  expect(screen.queryByText(/Covers every command/)).not.toBeInTheDocument();
});

it('still shows the breadth note on a genuinely tool-wide grant', () => {
  renderWithRules([{ tool: 'Bash', action: 'allow' }]);
  expect(screen.getByText(/Covers every command/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts tests/describe-rule.test.ts tests/permissions-section.test.tsx
```

Expected: FAIL — `describeBashPattern` is not exported; `width` is `undefined` on every description.

- [ ] **Step 3: Add the reverse direction**

Append to `src/shared/bash-grant-shapes.ts`:

```ts
/** Turn a stored Bash pattern back into the sentence the confirm showed.
 *
 *  WHY it lives beside bashGrantOptions rather than in describe-rule.ts: the two
 *  directions must agree, and keeping them in one module that changes together is
 *  half of that. The other half is the round-trip test — proximity is a habit,
 *  the test is the guarantee.
 *
 *  Returns null when the pattern is not one this module produces — the caller
 *  falls back to its generic rendering rather than inventing a sentence. */
export function describeBashPattern(pattern: string): string | null {
  const push = /^git push\*(\S+) (.+)$/.exec(pattern);
  if (push) return `Pushing to ${refDestination(push[2])}`;
  const generic = /^([^*?]+?)\*$/.exec(pattern);
  if (generic) return `Any ${generic[1].trim()} command`;
  return null;
}
```

- [ ] **Step 4: Switch `describe-rule.ts` to three widths**

In `src/renderer/components/permissions/describe-rule.ts`, replace the `RuleDescription` interface:

```ts
export interface RuleDescription {
  /** Plain-language action, e.g. "Run" or "Create or overwrite". For a scoped
   *  Bash grant this carries the WHOLE sentence ("Pushing to master") and
   *  `subject` is absent. */
  verb: string;
  /** The thing acted on. Absent for a tool-wide grant, for MCP tools (whose
   *  subject is folded into `verb`), and for a scoped Bash grant. */
  subject?: string;
  /** How much this rule covers.
   *  'exact'     — one literal command or path, byte-for-byte
   *  'wide'      — a pattern grant, e.g. pushes to one branch
   *  'tool-wide' — no pattern at all; every use of that tool
   *  The UI must render 'tool-wide' as visibly broader than the other two. */
  width: 'exact' | 'wide' | 'tool-wide';
}
```

Replace the first line of `describeRule`:

```ts
  // WHY not just `pattern === undefined`: an exact grant and a scoped wide grant
  // both HAVE a pattern but cover wildly different amounts, and the screen has to
  // tell them apart. A missing `match` means a legacy rule, which PermissionStore
  // normalizes to 'exact' on read — so anything still missing it here is exact too.
  const width: RuleDescription['width'] =
    rule.pattern === undefined ? 'tool-wide' : rule.match === 'glob' ? 'wide' : 'exact';
```

Then replace `broad` with `width` at **all six** return sites — confirm the count first:

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
grep -c "broad" src/renderer/components/permissions/describe-rule.ts
```

They are: the MCP early return (`width: 'exact'`), **four** `Task` returns (`'tool-wide'` for the pattern-less branch, `'exact'` for the three charter branches), and the final return (`width`).

Add the Bash scoped branch immediately before the final `const base = ...` line:

```ts
  // A scoped Bash grant already IS a sentence — "Pushing to master" — built by
  // the same module that built the rule. Rendering it as verb+subject would put
  // the raw pattern (asterisk and all) on a screen written for people who have
  // never seen a glob.
  if (rule.tool === 'Bash' && width === 'wide' && rule.pattern !== undefined) {
    const phrase = describeBashPattern(rule.pattern);
    if (phrase) return { verb: phrase, width };
  }
```

with the import at the top:

```ts
import { describeBashPattern } from '../../../shared/bash-grant-shapes';
```

And the final return:

```ts
  return { verb, subject: rule.pattern, width };
```

- [ ] **Step 5: Update the consumer**

`PermissionsSection.tsx` calls `describeRule` in two places (around lines 303 and 728) but only **one** of them reads the breadth flag. Find it:

```bash
grep -n "\.broad" src/renderer/components/PermissionsSection.tsx
```

Replace that line — currently:

```tsx
  const detail = [described.broad ? broadNote(rule.tool) : null, grantedLabel(rule.grantedAt)]
```

with:

```tsx
  // Only a genuinely tool-wide grant gets the breadth note. A scoped grant is
  // narrow by construction and its own sentence already says what it covers —
  // putting the scary note on it would teach the user to ignore the note where
  // it is true.
  const detail = [described.width === 'tool-wide' ? broadNote(rule.tool) : null, grantedLabel(rule.grantedAt)]
```

Re-run the grep and confirm zero hits before moving on. The other call site uses `verb`/`subject` only and needs no change.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts tests/describe-rule.test.ts tests/permissions-section.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): Settings tells exact, scoped, and tool-wide grants apart

An exact grant and a scoped one both have a pattern but cover wildly different
amounts, so 'broad' could no longer carry the distinction. The scoped sentence
comes from the same module that built the rule and is pinned by a round-trip
test, so the screen never renders an asterisk and the description cannot drift
from what the rule covers.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Implement the settled confirm

**Files:**
- Modify: `src/renderer/components/ToolCard.tsx` (`PermissionButtons`)
- Test: `tests/permission-confirm-card.test.tsx`, `tests/tool-card-full-auto-stop.test.tsx`, new `tests/tool-card-grant-width.test.tsx`

**Interfaces:**
- Consumes: `bashGrantOptions`, `GrantOption` (Tasks 2–3); `AskDecision.grantScope` (Task 6).
- Produces: `respondToPermission` payloads carrying `grantScope`.

> **Blocked on Task 4.** The copy and layout below are mechanics only — every user-facing string comes from Destin's compare-round decision. Do not write copy in this task.

- [ ] **Step 1: Write the failing tests**

Create `tests/tool-card-grant-width.test.tsx`. Follow the setup in `tests/tool-card-full-auto-stop.test.tsx` (same render helpers, same fake `window.claude`).

```tsx
it('sends grantScope:"exact" when the narrow option is chosen', async () => {
  renderNativeAsk({ command: 'npm run build', denyListed: false });
  await chooseAlwaysAllow('exact');
  expect(respondSpy).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ grantScope: 'exact' }),
  );
});

it('sends grantScope:"wide" when the scoped option is chosen', async () => {
  renderNativeAsk({ command: 'git push origin feat/x', denyListed: true });
  await chooseAlwaysAllow('wide');
  expect(respondSpy).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ grantScope: 'wide' }),
  );
});

it('offers no widening when the command has only one option', () => {
  renderNativeAsk({ command: 'rm -rf build', denyListed: true });
  expect(wideOptionControl()).toBeNull();
});

it('offers no widening when the wide rung was withheld as unsafe', () => {
  // Postcondition 2: "Any git command" would cover pushes and hard resets.
  renderNativeAsk({ command: 'git --no-pager log', denyListed: false });
  expect(wideOptionControl()).toBeNull();
  expect(alwaysAllowControl()).not.toBeNull();
});

it('offers no Always-allow at all when the command yields no options', () => {
  renderNativeAsk({ command: 'git push', denyListed: true });
  expect(alwaysAllowControl()).toBeNull();
});

it('renders no rule syntax anywhere in the card', () => {
  const { container } = renderNativeAsk({ command: 'git push origin feat/x', denyListed: true });
  // The command itself is echoed verbatim and may legitimately contain '*';
  // only the app's OWN copy is checked here.
  expect(appCopyOf(container)).not.toMatch(/[*?]/);
});

it('a CC-path ask is unchanged — no width chooser, no grantScope', async () => {
  renderCcAsk({ suggestions: ['Bash(npm run build:*)'] });
  expect(wideOptionControl()).toBeNull();
  await clickAlwaysAllow();
  expect(respondSpy.mock.calls[0][1]).not.toHaveProperty('grantScope');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run tests/tool-card-grant-width.test.tsx
```

Expected: FAIL — no width control exists.

- [ ] **Step 3: Implement**

In `PermissionButtons` (`ToolCard.tsx:301`), compute the options once:

```tsx
  // The card shows what the SHARED derivation produced — it never builds a
  // pattern. Only native asks carry a real Bash command; CC asks keep their
  // existing suggestions-driven behavior untouched.
  const grantOptions = useMemo(
    () => (isNative && typeof command === 'string' ? bashGrantOptions(command) : []),
    [isNative, command],
  );
```

Gate `canAlwaysAllow` on it (currently `ToolCard.tsx:335`):

```tsx
  // A Bash ask whose command yields no options may not be always-allowed at all
  // (a bare `git push`: its target is not in the command and changes underneath
  // the grant). Non-Bash native asks have no options and are unaffected.
  const noGrantPossible = isNative && typeof command === 'string' && grantOptions.length === 0;
  const canAlwaysAllow = (hasSuggestions || isNative) && !suppressAlwaysAllow && !noGrantPossible;
```

Thread the chosen scope into the decision (currently the ternary at `ToolCard.tsx:370`):

```tsx
  const alwaysAllowDecision = (scope: GrantScope = 'exact') =>
    hasSuggestions
      ? { decision: { behavior: 'allow' }, updatedPermissions: [suggestions![0]] }
      : { decision: { behavior: 'allow' }, updatedPermissions: [NATIVE_ALWAYS_ALLOW], grantScope: scope };
```

Render the chooser in the shape Task 4 settled, driven by `grantOptions` — each option's `label` is displayed verbatim, and its `scope` is what gets sent. Keep the exact rung preselected.

Update the arrow-key `actions.current` array (around `ToolCard.tsx:393`) and the `buttonsRef` indices (around 555–558) so they still match the VISUAL order — the existing comment above them explains why that matters, and adding a control silently shifts every index below it.

- [ ] **Step 4: Update the two copy-pinning tests**

`tests/permission-confirm-card.test.tsx` and `tests/tool-card-full-auto-stop.test.tsx` pin the shipped copy verbatim. Update them to the settled strings from Task 4 — and only those strings; every behavioural assertion in them stays.

- [ ] **Step 5: Run the full suite**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
npx vitest run
```

Expected: PASS.

- [ ] **Step 6: Verify, boot-check, and commit**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape/desktop
node scripts/workbench-boot-check.mjs
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape --full
cd worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): the confirm offers the grant width the user picks

The card renders the options the shared derivation produced and sends back only
which one was chosen. A command that yields no options offers no Always-allow at
all; a command whose wide rung was withheld as unsafe offers only the exact one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Ship

- [ ] **Step 1: Full verification on a fresh rebase**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape
git fetch origin && git rebase origin/master
cd /home/destin/youcoded-dev && bash scripts/verify.sh bash-grant-shape --full
```

Expected: PASS. If `slug-repair` landed during this work, the rebase will surface the `cwdToProjectSlug` rename — take the new name.

- [ ] **Step 2: Offer the harness eval**

The Bash tool's permission path changed. Offer to run the harness evaluator (`youcoded/desktop/test-engine/harness-eval.mjs`) and let Destin decide — the paid path costs real money and must never be run unasked. `--dry-run` is free.

- [ ] **Step 3: Runtime check in a dev instance**

```bash
cd /home/destin/youcoded-dev && bash scripts/run-dev.sh bash-grant-shape --label "Bash grant width" --offset 70 --profile grantwidth
```

Start a native session and walk these, then **ask Destin to do the visual pass** rather than scripting it:

1. `npm run build` → approve wide → run it again with different arguments → no second prompt.
2. `npm run build && echo hi` → prompts again (safety rule 1). This is the case the dropped §4.5 explanation would have narrated; confirm the option's own wording from Task 4 already prepared him for it.
3. `git push origin <a branch>` → the branch-scoped option appears and reads correctly → approve → push again → no prompt.
4. `git push --force origin <same branch>` → prompts (safety rule 2).
5. `git push` (bare) → no Always-allow button at all.
6. Settings → Permissions shows the branch grant as its own row, with its own remove button, and no asterisk anywhere on screen.

- [ ] **Step 4: PR**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-grant-shape
git push -u origin feat/bash-grant-shape
gh pr create --title "M5 2c: Bash always-allow rule shape" --body "$(cat <<'EOF'
Spec: `youcoded-dev/docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md`

Closes the last item in M5.

**What changes for a user.** "Always allow" on a Bash command now offers a
choice: this exact command, or a wider grant the app derived and named in plain
English. For `git push` the wider grant is one branch — master and main included,
each asked about separately and revocable on its own.

**Three over-grants fixed on the way.**

1. "Always allow this exact command" stored the raw command as a glob, so any
   command containing `*` or `?` became a wildcard rule above the destructive
   deny-list.
2. `*` crosses shell operators by design, so a grant labelled "any npm run
   command" would have covered `npm run build && rm -rf /`.
3. A grant scoped to one branch would still have covered `git push --delete`,
   `--prune` (which deletes every *other* remote branch) and `--force` on it.

(2) and (3) are enforced inside the matcher rather than stored on each rule, so a
command shape added later cannot forget them.

**And one the earlier draft would have shipped.** Danger was judged from the
command being approved, never from the rule being written. `git --no-pager log`
is not deny-listed and derives the rung `git*`, so the user would have been
offered "Any git command" — covering pushes and hard resets, above the deny-list.
Every wide option is now also tested against a corpus of destructive commands and
withheld if it admits one.

**Behaviour changes worth calling out in review:** existing grants are re-read as
byte-exact (allows strictly less); a bare `git push`, `git push origin` and
`git push origin HEAD` can no longer be always-allowed at all; rule identity is
now the quad, so Settings revokes the row you clicked.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge — archive**

Move the spec and this plan from `docs/active/{specs,plans}/` to `docs/archive/{specs,plans}/`, flip their `status:` to `shipped`, mark 2c done in `docs/active/plans/2026-08-11-native-sessions-remaining-work.md` §2, and archive `docs/active/handoffs/2026-08-12-native-sessions-m5-2c.md`. Confirm the ROADMAP entry from Task 0 Step 4 (the deferred "tell the user when a grant almost covered a command" work) is still there and accurate. Remove the worktree and delete the branch locally and remotely. Commit and push the workspace repo.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §1.1 exact is not exact | 1 (`match`), 5 (normalization) |
| §1.2 `*` crosses shell operators | 1 (safety rule 1 — amended, A1) |
| §3 rule shape (`match`) | 1 |
| §3.2 veto falls through | 1 (safety rules fail the match; the layer below asks) |
| §3.3 one matcher, two callers | 1 |
| §4.1–4.3 rungs + operator set | 1 (matcher), 2 (rungs) |
| §4.4 postcondition | 2 (both postconditions — A4 adds the second) |
| §4.5 vetoed ask says why | **dropped — A5.** Caveat moves into the option's own wording (Task 4 Q4); the after-the-fact explanation becomes a ROADMAP item (Task 0) |
| §5.1 `git push` branch scoping | 3 (amended by A2 — destructive flags excluded) |
| §5.2 deny-listed families | 2 (generic suppression + hostile corpus), 3 (the one row) |
| §5.3 trailing-flag gap | recorded, not implemented — by design |
| §6 trust boundary | 6 |
| §7 normalization to exact | 5, 6 (non-Bash) |
| §8 identity quad | 5 |
| §9 Settings three widths | 7 |
| §10 the confirm | 4 (settle), 8 (implement) |
| §11 testing | every task |
| §12 consequences | PR body, Task 4 Q6, Task 9 |
