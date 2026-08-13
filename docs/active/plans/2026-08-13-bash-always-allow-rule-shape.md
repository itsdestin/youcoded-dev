---
status: active
created: 2026-08-13
type: plan
spec: docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
item: M5 2c — Bash always-allow rule shape
---

# Bash always-allow rule shape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an "Always allow" on a Bash command mean something the user chose and can read — an exact command, or a scoped widening (for `git push`, one branch) — and make "exact" actually exact.

**Architecture:** One new shared module (`bash-grant-shapes.ts`) derives the grant options for a Bash command and is the single source of both the sentence the user reads and the rule the engine stores. `PermissionRule` gains `match` (exact vs glob) and `except` (veto patterns); a new `ruleMatches()` in `subject-glob.ts` owns all three fields and replaces every direct `subjectMatches()` call in decision paths. The renderer sends only a rung selector; the main process re-derives the pattern.

**Tech Stack:** TypeScript, Electron main + React renderer (shared bundle, also runs in an Android WebView), Vitest, Vite. No new dependencies.

## Global Constraints

- **Everything runs in `youcoded/desktop`.** No Android work in this item (no native runtime there yet).
- **Never touch Destin's running app.** All runtime verification via `bash scripts/run-dev.sh` or `bash scripts/run-workbench.sh` from the workspace root. Rule: `.claude/rules/live-app-safety.md`.
- **No glob syntax on any user-facing surface.** No `*`, no `?`, in any string rendered in the confirm, the tool card, or Settings → Permissions. `describe-rule.ts`'s existing comment governs.
- **All user-facing copy for the confirm is Destin's.** Task 7 builds candidates in the workbench compare view; Task 8 implements only what he settles. Do not invent wording.
- **`src/shared/` must stay browser-safe.** No `process`, no `require()`, no Node built-ins — it is imported by the renderer, which also runs in a WebView.
- **Annotate every non-trivial edit with a WHY comment.** Destin is a non-developer and reads the comments to understand the code.
- **Rule identity is `(tool, pattern, action, match, except)`** everywhere after Task 4 — dedupe, disk removal, in-memory revocation filter.
- **Verification after every task:** `bash scripts/verify.sh <worktree-path>` from the workspace root (tsc + affected vitest + knip + eslint + ast-grep). It is **Linux-only**, and master is currently red on Windows from unrelated work (`harness-tools-core.test.ts > Bash > persistent_env`) — attribute any CI matrix failure before assuming it is yours.
- **Line numbers are not anchors.** `harness-session.ts` moved ~60 lines during planning. Locate code by symbol name and by the quoted snippets in each task.

---

## Task 0: Worktree

- [ ] **Step 1: Sync and create the worktree**

```bash
cd /home/destin/youcoded-dev && bash setup.sh
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git checkout master && git pull origin master
git worktree add ../worktrees/bash-grant-shape -b feat/bash-grant-shape
cd ../worktrees/bash-grant-shape/desktop && npm ci
```

- [ ] **Step 2: Confirm nobody else is in these files**

```bash
cd /home/destin/youcoded-dev/youcoded && git worktree list
```

Expected: the `slug-repair` / `slug-repair-android` worktrees may still be live. They rename `cwdToProjectSlug`, which `permission-store.ts` and `native-session-host.ts` (Task 4) both call. If they have landed, take their name; if not, whoever lands second updates the other. Note which is true before starting Task 4.

- [ ] **Step 3: Baseline the suite**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape --full
```

Expected: PASS. If it fails on Linux, stop — the failure is pre-existing and needs attributing before any of this work lands on top of it.

---

## Task 1: `match` / `except` on the rule, and one matcher that owns them

**Files:**
- Modify: `src/shared/permission-types.ts` (add fields to `PermissionRule`, add `normalizeRule` + `sameRule`)
- Modify: `src/shared/subject-glob.ts` (add `ruleMatches`)
- Modify: `src/main/harness/permission-engine.ts` (call `ruleMatches`)
- Modify: `src/renderer/components/permissions/deny-list-copy.ts` (call `ruleMatches`)
- Test: `tests/subject-glob.test.ts`, `tests/permission-engine.test.ts`, `tests/deny-list-copy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `PermissionRule.match?: 'exact' | 'glob'` and `PermissionRule.except?: string[]`
  - `ruleMatches(rule: PermissionRule, subject: string): boolean` from `src/shared/subject-glob`
  - `normalizeRule<T extends PermissionRule>(rule: T): T` and `sameRule(a: PermissionRule, b: PermissionRule): boolean` from `src/shared/permission-types`

- [ ] **Step 1: Write the failing tests**

Append to `tests/subject-glob.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subjectMatches, ruleMatches } from '../src/shared/subject-glob';
import type { PermissionRule } from '../src/shared/permission-types';

describe('ruleMatches', () => {
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

  it('a legacy rule with no match field still globs (nothing on disk changes meaning)', () => {
    expect(ruleMatches(bash({ pattern: 'git push*' }), 'git push origin x')).toBe(true);
  });

  it('except vetoes a pattern that would otherwise match', () => {
    const r = bash({ pattern: 'npm run*', match: 'glob', except: ['*&&*'] });
    expect(ruleMatches(r, 'npm run build')).toBe(true);
    expect(ruleMatches(r, 'npm run build && rm -rf /')).toBe(false);
  });

  it('except is ignored under match:exact', () => {
    const r = bash({ pattern: 'npm run build && x', match: 'exact', except: ['*&&*'] });
    expect(ruleMatches(r, 'npm run build && x')).toBe(true);
  });

  it('a rule with no pattern matches every subject (tool-wide grants)', () => {
    expect(ruleMatches({ tool: 'Read', action: 'allow' }, 'anything')).toBe(true);
  });

  it('match:exact with no pattern never matches — it is not a tool-wide grant', () => {
    expect(ruleMatches({ tool: 'Bash', action: 'allow', match: 'exact' }, 'x')).toBe(false);
  });
});
```

Append to `tests/permission-engine.test.ts`:

```ts
import { decidePermission } from '../src/main/harness/permission-engine';
import { DESTRUCTIVE_DENY_LIST, rulesForMode } from '../src/shared/permission-types';

describe('decidePermission with except', () => {
  it('a vetoed remembered rule falls through to the deny-list ask', () => {
    const remembered = [{
      tool: 'Bash', action: 'allow' as const, match: 'glob' as const,
      pattern: 'git push*origin feat/x', except: ['*&&*'],
    }];
    const layers = {
      presetRules: [], modeRules: rulesForMode('full-auto'),
      denyList: DESTRUCTIVE_DENY_LIST, rememberedRules: remembered,
    };
    expect(decidePermission('Bash', 'git push origin feat/x', layers))
      .toEqual({ action: 'allow', denyListed: false });
    // Not covered by the grant → the deny-list layer is the winner → still asks.
    expect(decidePermission('Bash', 'git push origin master', layers))
      .toEqual({ action: 'ask', denyListed: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/subject-glob.test.ts tests/permission-engine.test.ts
```

Expected: FAIL — `ruleMatches is not a function`, and TypeScript errors on `match` / `except` not existing on `PermissionRule`.

- [ ] **Step 3: Add the fields and the helpers**

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
   *  WHY the field instead of escaping '*' in the pattern: subjectMatches escapes
   *  '\' as a regex literal, so a backslash escape syntax would break Windows
   *  commands like `del C:\foo\*`. A discriminator sidesteps that entirely. */
  match?: 'exact' | 'glob';
  /** Glob patterns that VETO a match: the rule fires only if `pattern` matches and
   *  NO except entry does. It does not write a deny — a vetoed rule simply fails to
   *  match, so the decision falls back to the layer below (usually the deny-list's
   *  ask). Meaningful only under 'glob'. */
  except?: string[];
}

/** A rule read off disk, in the semantics it was WRITTEN with.
 *
 *  WHY: every rule ever persisted came from harness-session's `remember-rule`,
 *  which stored the raw tool subject — an exact command or path that was then
 *  evaluated as a glob. So `rm *.tmp` became a wildcard grant nobody asked for.
 *  Reading a match-less rule as 'exact' restores the promise the user was shown
 *  ("Always allow this exact command") and only ever ALLOWS LESS. */
export function normalizeRule<T extends PermissionRule>(rule: T): T {
  return rule.match ? rule : { ...rule, match: 'exact' };
}

/** Rule identity: the QUAD, not the old (tool, pattern, action) triple.
 *  Two grants that differ only in `match` or `except` are different grants —
 *  collapsing them makes Settings revoke the wrong one. `grantedAt` is
 *  deliberately excluded so re-approving does not look like a fresh grant. */
export function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  return a.tool === b.tool
    && a.pattern === b.pattern
    && a.action === b.action
    && (a.match ?? 'glob') === (b.match ?? 'glob')
    && sameExcept(a.except, b.except);
}

function sameExcept(a?: string[], b?: string[]): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
```

In `src/shared/subject-glob.ts`, add at the bottom:

```ts
import type { PermissionRule } from './permission-types';

/** The ONE function that knows what a whole rule means. `subjectMatches` above is
 *  the primitive; this owns `match` and `except` on top of it.
 *
 *  Every decision path must go through here — the engine AND the renderer's
 *  deny-list classifier — or the two will eventually disagree about what a rule
 *  covers, which is the bug the shared location of this file exists to prevent. */
export function ruleMatches(rule: PermissionRule, subject: string): boolean {
  // Exact: byte-for-byte, no regex, no metacharacter interpretation, and
  // case-SENSITIVE — the 'i' flag below is a widening the exact promise cannot
  // afford ('RM -rf /' is not 'rm -rf /' on the platforms Bash runs on).
  if (rule.match === 'exact') return rule.pattern !== undefined && subject === rule.pattern;
  if (!subjectMatches(subject, rule.pattern)) return false;
  return !(rule.except ?? []).some((e) => subjectMatches(subject, e));
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/subject-glob.test.ts tests/permission-engine.test.ts tests/deny-list-copy.test.ts
```

Expected: PASS, all three files.

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): rule-level match/except and one matcher that owns them

ruleMatches() is now the single decision-path matcher: it adds byte-exact
comparison (match:'exact') and veto patterns (except) on top of subjectMatches.
Both fields are absent on every rule that exists today, so the deny-list and
every stored rule keep their current meaning until Task 4 normalizes them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `bash-grant-shapes.ts` — the two rungs and the postcondition

**Files:**
- Create: `src/shared/bash-grant-shapes.ts`
- Test: `tests/bash-grant-shapes.test.ts` (new)

**Interfaces:**
- Consumes: `ruleMatches` (Task 1), `PermissionRule` + `DESTRUCTIVE_DENY_LIST` from `src/shared/permission-types`.
- Produces:
  - `type GrantScope = 'exact' | 'wide'`
  - `interface GrantOption { scope: GrantScope; rule: PermissionRule; label: string }`
  - `bashGrantOptions(command: string): GrantOption[]` — narrowest first; `[]` means no "Always allow" may be offered at all.
  - `OPERATOR_EXCEPT: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/bash-grant-shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bashGrantOptions } from '../src/shared/bash-grant-shapes';
import { ruleMatches } from '../src/shared/subject-glob';

const wideOf = (cmd: string) => bashGrantOptions(cmd).find((o) => o.scope === 'wide');
const exactOf = (cmd: string) => bashGrantOptions(cmd).find((o) => o.scope === 'exact');

describe('bashGrantOptions — exact rung', () => {
  it('stores the literal command with match:exact', () => {
    expect(exactOf('rm *.log')!.rule).toEqual({
      tool: 'Bash', pattern: 'rm *.log', action: 'allow', match: 'exact',
    });
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

  it('the label never contains rule syntax', () => {
    expect(wideOf('cargo test --release')!.label).not.toMatch(/[*?]/);
  });
});

describe('bashGrantOptions — the operator hole', () => {
  it('a wide rung does NOT grant a chained command', () => {
    const rule = wideOf('npm run build')!.rule;
    expect(ruleMatches(rule, 'npm run build')).toBe(true);
    expect(ruleMatches(rule, 'npm run build --prod')).toBe(true);
    for (const evil of [
      'npm run build && rm -rf /',
      'npm run build; sudo x',
      'npm run build | sh',
      'npm run build > /etc/passwd',
      'npm run build < /etc/passwd',
      'npm run build `id`',
      'npm run build $(id)',
      'npm run build\nrm -rf /',
    ]) {
      expect(ruleMatches(rule, evil), evil).toBe(false);
    }
  });

  it('a chained command gets no wide rung at all', () => {
    expect(wideOf('npm run build && git push')).toBeUndefined();
    expect(exactOf('npm run build && git push')).toBeDefined();
  });

  it('a redirect gets no wide rung — the rung could not cover its own command', () => {
    expect(wideOf('npm run build > log.txt')).toBeUndefined();
  });
});

describe('bashGrantOptions — deny-listed families', () => {
  it.each(['rm -rf build', 'rmdir old', 'sudo apt install x', 'format d:', 'git reset --hard HEAD~1'])(
    'offers no wide rung for %s', (cmd) => {
      expect(wideOf(cmd)).toBeUndefined();
      expect(exactOf(cmd)).toBeDefined();
    },
  );
});

describe('bashGrantOptions — the postcondition', () => {
  const corpus = [
    'npm run build', 'npm run build > log.txt', 'npm run build && git push',
    'ls -la /tmp', 'rm -rf build', 'sudo apt install x', 'cargo test --release',
    'git status', 'echo "hi there"', "grep -r 'x' .", 'node scripts/x.mjs',
  ];
  it('never offers an option that does not cover the command it was derived from', () => {
    for (const cmd of corpus) {
      for (const opt of bashGrantOptions(cmd)) {
        expect(ruleMatches(opt.rule, cmd), `${opt.scope} rung for ${cmd}`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
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

// Every wide rung carries these. WHY: subject-glob compiles '*' to [\s\S]* on
// purpose (so 'git push*' matches 'git push origin x'), which means a trailing
// '*' also crosses '&&', ';', '|' and newlines. Without this set, a rung labelled
// "any npm run command" would grant `npm run build && rm -rf /`.
//
// Deliberately over-broad: a command with a '>' redirect that the user wanted
// covered will merely ask again. An unnecessary ask is annoying; a wide grant
// that crosses '&&' is the failure that matters. Same trade DESTRUCTIVE_DENY_LIST
// states in its own header.
export const OPERATOR_EXCEPT: readonly string[] = [
  '*&&*', '*||*', '*;*', '*|*', '*`*', '*$(*', '*>*', '*<*', '*\n*',
];

interface CommandShape {
  /** Matched against `${program} ${subcommand}`. */
  key: string;
  /** False → NO "Always allow" of any kind for this command (not even exact). */
  grantable(tokens: string[]): boolean;
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

function isDenyListed(command: string): boolean {
  return DESTRUCTIVE_DENY_LIST.some((r) => ruleMatches(r, command));
}

function deriveWide(command: string, tokens: string[]): GrantOption | null {
  const program = tokens[0];
  const sub = tokens[1];
  const key = isSubcommand(sub) ? `${program} ${sub}` : program;

  const shape = COMMAND_SHAPES.find((s) => s.key === key);
  if (shape) {
    const scoped = shape.scope(tokens);
    return scoped
      ? { scope: 'wide', rule: { tool: 'Bash', pattern: scoped.pattern, action: 'allow', match: 'glob', except: [...OPERATOR_EXCEPT] }, label: scoped.label }
      : null;
  }

  // A deny-listed family with no shape row gets no widening: for rm / sudo /
  // format / git reset --hard the varying part IS the dangerous part, and there
  // is nothing that must precede an `rm` target the way a remote must precede a
  // push refspec, so it cannot be bounded to a single target.
  if (isDenyListed(command)) return null;

  const pattern = isSubcommand(sub) ? `${program} ${sub}*` : `${program}*`;
  return {
    scope: 'wide',
    rule: { tool: 'Bash', pattern, action: 'allow', match: 'glob', except: [...OPERATOR_EXCEPT] },
    label: `Any ${key} command`,
  };
}

/** Grant options for a Bash command, narrowest first.
 *
 *  An EMPTY array means no "Always allow" may be offered at all — the caller must
 *  suppress the button, not fall back to something. */
export function bashGrantOptions(command: string): GrantOption[] {
  const cmd = command.trim();
  const tokens = tokenize(cmd);
  if (tokens.length === 0) return [];

  const sub = tokens[1];
  const key = isSubcommand(sub) ? `${tokens[0]} ${sub}` : tokens[0];
  const shape = COMMAND_SHAPES.find((s) => s.key === key);
  if (shape && !shape.grantable(tokens)) return [];

  const options: GrantOption[] = [
    { scope: 'exact', rule: { tool: 'Bash', pattern: cmd, action: 'allow', match: 'exact' }, label: cmd },
  ];
  const wide = deriveWide(cmd, tokens);
  if (wide) options.push(wide);

  // THE POSTCONDITION: never offer a rung that cannot cover the command in front
  // of the user. Without it, `npm run build > log.txt` is offered "any npm run
  // command" — a rule its own operator exclusions immediately veto, so the user
  // saves a grant, gets asked again identically, and nothing explains why.
  return options.filter((o) => ruleMatches(o.rule, cmd));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): derive Bash grant options (exact + scoped wide rung)

One module owns both the sentence the user reads and the rule stored, so they
cannot drift. Every wide rung carries operator exclusions, because '*' crosses
'&&' by design — without them a rung labelled 'any npm run command' would grant
'npm run build && rm -rf /'.

The postcondition is the load-bearing part: an option is only offered if it
actually covers the command the user is looking at.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `git push` scopes to one branch

**Files:**
- Modify: `src/shared/bash-grant-shapes.ts` (fill `COMMAND_SHAPES`)
- Test: `tests/bash-grant-shapes.test.ts`

**Interfaces:**
- Consumes: `CommandShape`, `bashGrantOptions` (Task 2).
- Produces: no new exports. `bashGrantOptions('git push origin feat/x')` now returns a wide option whose `rule.pattern` is `git push*origin feat/x` and whose `label` is `Always allow pushing to feat/x`; `bashGrantOptions('git push')` returns `[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bash-grant-shapes.test.ts`:

```ts
describe('bashGrantOptions — git push scopes to one branch', () => {
  it('derives a remote-anchored pattern and a branch-named label', () => {
    const opt = wideOf('git push origin feat/x')!;
    expect(opt.rule.pattern).toBe('git push*origin feat/x');
    expect(opt.label).toBe('Always allow pushing to feat/x');
  });

  it('covers the flag forms of the same push', () => {
    const rule = wideOf('git push origin feat/x')!.rule;
    expect(ruleMatches(rule, 'git push origin feat/x')).toBe(true);
    expect(ruleMatches(rule, 'git push -u origin feat/x')).toBe(true);
    expect(ruleMatches(rule, 'git push --force origin feat/x')).toBe(true);
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

  it('strips refspec decoration from the LABEL only', () => {
    expect(wideOf('git push origin HEAD:feat/x')!.label).toBe('Always allow pushing to feat/x');
    expect(wideOf('git push origin HEAD:feat/x')!.rule.pattern).toBe('git push*origin HEAD:feat/x');
    expect(wideOf('git push origin +feat/x')!.label).toBe('Always allow pushing to feat/x');
  });

  it('a push with no explicit branch offers NOTHING — not even exact', () => {
    // Bare `git push` sends whatever branch is checked out AT RUN TIME. The
    // branch changes underneath the grant, so no grant can honestly name it.
    expect(bashGrantOptions('git push')).toEqual([]);
    expect(bashGrantOptions('git push --force')).toEqual([]);
    expect(bashGrantOptions('git push origin')).toEqual([]);
    expect(bashGrantOptions('git push origin master feat/x')).toEqual([]);
  });

  it('refuses to scope when the remote or refspec carries glob metacharacters', () => {
    expect(bashGrantOptions("git push 'o*' 'b*'")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts -t "git push"
```

Expected: FAIL — the wide rung is currently `undefined` for `git push …` because the deny-list branch in `deriveWide` returns null, and `bashGrantOptions('git push')` returns the exact rung instead of `[]`.

- [ ] **Step 3: Fill in the shape row**

In `src/shared/bash-grant-shapes.ts`, replace `const COMMAND_SHAPES: CommandShape[] = [];` with:

```ts
/** Positional arguments to `git push` — the remote and the refspec, with flags
 *  removed. `--opt=value` is one token so it filters out cleanly; a `--opt value`
 *  form would leave `value` looking positional, which is why a rung is produced
 *  ONLY at exactly two positionals (see grantable). */
function pushPositionals(tokens: string[]): string[] {
  return tokens.slice(2).filter((t) => !t.startsWith('-'));
}

/** The branch a refspec names, for the LABEL only. The stored pattern always
 *  keeps the refspec exactly as typed — stripping it there would widen the rule
 *  beyond the form the user actually approved. */
function branchOf(refspec: string): string {
  return refspec
    .replace(/^\+/, '')
    .replace(/^HEAD:/i, '')
    .replace(/^refs\/heads\//i, '');
}

const COMMAND_SHAPES: CommandShape[] = [
  {
    key: 'git push',
    // A bare `git push` pushes whatever branch is checked out AT RUN TIME, and
    // that branch changes underneath the grant — approve it on a feature branch
    // and next week it silently pushes master. Nothing here can name the target,
    // so no "Always allow" is offered at all; allow-once only.
    //
    // Two positionals exactly. Zero or one means no explicit target; three or
    // more means a multi-ref push, which cannot be bounded to one branch.
    grantable: (tokens) => {
      const pos = pushPositionals(tokens);
      // A '*' or '?' in the remote or refspec would become a WILDCARD in the
      // stored pattern rather than a literal. Git forbids both in ref names, so
      // this only fires on something adversarial — refuse rather than widen.
      return pos.length === 2 && !pos.some((p) => /[*?]/.test(p));
    },
    scope: (tokens) => {
      const [remote, refspec] = pushPositionals(tokens);
      // WHY the remote is in the pattern and not just the branch: `git push*feat/x`
      // also matches `git push origin master feat/x`, which pushes master TOO —
      // git takes any number of refspecs and this glob cannot count tokens. Pinning
      // the token that must immediately precede the refspec is the only way to
      // bound the command to a single ref. A grant named "pushing to feat/x" that
      // silently also pushes master is exactly what this item exists to prevent.
      return {
        pattern: `git push*${remote} ${refspec}`,
        label: `Always allow pushing to ${branchOf(refspec)}`,
      };
    },
  },
];
```

Then delete the now-unused placeholder comment `// Populated in Task 3.` above it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts
```

Expected: PASS, including the Task 2 postcondition test (which now also walks the git-push rows).

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): git push grants scope to one branch

Per-branch, no protected-branch policy: master and main are ordinary branches,
each asked about separately and stored separately, so 'always allow pushing to
master' is available and individually revocable.

The remote is in the pattern because 'git push*feat/x' alone also matches
'git push origin master feat/x' — which pushes master too.

A push with no explicit branch gets no Always-allow at all: its target is not in
the command and changes underneath the grant.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rule identity is the quad, and legacy rules read as exact

**Files:**
- Modify: `src/main/harness/permission-store.ts` (`rulesFor`, `remember`, `list`, `remove`)
- Modify: `src/main/harness/native-session-host.ts` (`revokeRule` filter, `remember-rule` dedupe in `wire`)
- Modify: `.claude/rules/native-permissions.md` (workspace repo — the identity invariant)
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

  it('two grants differing only in except are different grants', async () => {
    const a = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const, except: ['*&&*'] };
    const b = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const };
    await store.remember('/p', a);
    await store.remember('/p', b);
    expect(await store.rulesFor('/p')).toHaveLength(2);
    const slug = (await store.list())[0].slug;
    expect(await store.remove(slug, a)).toBe(true);
    expect(await store.rulesFor('/p')).toHaveLength(1);
    expect((await store.rulesFor('/p'))[0].except).toBeUndefined();
  });

  it('except order does not create a duplicate', async () => {
    const base = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const };
    await store.remember('/p', { ...base, except: ['*&&*', '*;*'] });
    await store.remember('/p', { ...base, except: ['*;*', '*&&*'] });
    expect(await store.rulesFor('/p')).toHaveLength(1);
  });
});
```

Append to `tests/native-session-host.test.ts`, inside the existing `revokeRule / revokeProject` describe:

```ts
  it('revokes only the matching quad from a live session', async () => {
    const wide = { tool: 'Bash', pattern: 'npm run*', action: 'allow' as const, match: 'glob' as const, except: ['*&&*'] };
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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
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
      // Identity is the QUAD (tool, pattern, action, match, except) — see
      // sameRule. Normalize the disk side so a legacy row is compared in the
      // semantics it is actually evaluated with. grantedAt stays excluded so
      // re-approving does not look like a fresh grant.
      const dup = rules.some((r) => sameRule(normalizeRule(r), rule));
```

In `list`, normalize the rules it hands out:

```ts
      rules: (entry?.rules ?? []).map(normalizeRule),
```

In `remove`, replace the filter predicate:

```ts
      const kept = rules.filter((r) => {
        // Normalize the disk side: the renderer round-trips what list() gave it,
        // which is already normalized, so an un-normalized comparison here would
        // silently fail to remove every pre-existing rule.
        const match = sameRule(normalizeRule(r), rule);
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
 *  The in-memory filter compares the (tool, pattern, action, match, except) QUINT
 *  via sameRule, not whole objects: a rule read back off disk carries a
 *  `grantedAt` key the in-memory copy never had, so an equality check would
 *  silently stop matching. `match` and `except` joined the identity when Bash
 *  grants gained a scoped wide shape — without them, "pushing to feat/x" and
 *  "pushing to master" would collapse and Settings would revoke the wrong one.
```

- [ ] **Step 5: Update the rule file**

In the **workspace repo** (`/home/destin/youcoded-dev`), edit `.claude/rules/native-permissions.md`. Replace the `remember() spreads the existing entry` invariant's second sentence:

```
**Invariant:** `remember()` writes `{ ...existingEntry, cwd, rules }`, never `{ rules }`.
Rule identity everywhere — dedupe, disk removal, in-memory filter — is
`sameRule(a, b)`: the `(tool, pattern, action, match, except)` quint, with a
missing `match` read as `'exact'` via `normalizeRule` on every disk read.
```

and add to the `verify:` block:

```yaml
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "sameRule"
  - path: youcoded/desktop/src/shared/bash-grant-shapes.ts
    contains: "OPERATOR_EXCEPT"
  - test: youcoded/desktop/tests/bash-grant-shapes.test.ts
```

Bump `last_verified:` to `2026-08-13`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/permission-store.test.ts tests/native-session-host.test.ts
```

Expected: PASS.

- [ ] **Step 7: Verify and commit (two repos)**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "fix(permissions): rule identity is the quad; legacy rules read as exact

Two grants that differ only in match or except are different grants — collapsing
them made Settings revoke the wrong one once Bash grants gained a scoped shape.

Every rule ever persisted stored a raw tool subject that was then evaluated as a
glob, so 'rm *.tmp' was a wildcard grant nobody asked for. Reading a match-less
rule as exact restores the promise the confirm made and only ever allows less.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"

cd /home/destin/youcoded-dev
git add .claude/rules/native-permissions.md
git commit -m "docs(rules): permission rule identity is the quint, not the triple

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Thread the rung selector from the card to the store

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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/native-permission-broker.test.ts tests/harness-session.test.ts
```

Expected: FAIL — `grantScope` is not on `AskDecision`; the emitted rule is the raw command with no `match`.

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
    // checked here AND re-derived at the host rather than trusted.
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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/native-permission-broker.test.ts tests/harness-session.test.ts tests/harness-session-loop.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): thread the grant-width selector, re-derive the rule in main

The card sends 'exact' or 'wide' and nothing else. The host re-derives the
pattern from the tool call it already holds, because remembered rules outrank the
destructive deny-list and a renderer that could name its own pattern could grant
itself anything.

Non-Bash grants gain match:'exact' too — a file path containing '*' was a
wildcard grant on the same code path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Settings → Permissions renders the three widths

**Files:**
- Modify: `src/shared/bash-grant-shapes.ts` (add `describeBashPattern`)
- Modify: `src/renderer/components/permissions/describe-rule.ts` (`RuleDescription.width` replaces `broad`)
- Modify: `src/renderer/components/PermissionsSection.tsx` (both `describeRule` call sites)
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
      tool: 'Bash', pattern: 'git push*origin master', action: 'allow',
      match: 'glob', except: ['*&&*'],
    });
    expect(d.width).toBe('wide');
    expect(d.verb).toBe('Pushing to master');
    expect(d.subject).toBeUndefined();
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
  renderWithRules([{ tool: 'Bash', pattern: 'git push*origin master', action: 'allow', match: 'glob', except: ['*&&*'] }]);
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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts tests/describe-rule.test.ts tests/permissions-section.test.tsx
```

Expected: FAIL — `describeBashPattern` is not exported; `width` is not on `RuleDescription`.

- [ ] **Step 3: Add the reverse direction**

Append to `src/shared/bash-grant-shapes.ts`:

```ts
/** Turn a stored Bash pattern back into the sentence the confirm showed.
 *
 *  WHY it lives beside bashGrantOptions rather than in describe-rule.ts: the two
 *  directions must agree, and the only way to guarantee that is to keep them in
 *  one module that changes together. Settings would otherwise start describing a
 *  grant in words that no longer match what it covers.
 *
 *  Returns null when the pattern is not one this module produces — the caller
 *  falls back to its generic rendering rather than inventing a sentence. */
export function describeBashPattern(pattern: string): string | null {
  const push = /^git push\*(\S+) (.+)$/.exec(pattern);
  if (push) return `Pushing to ${branchOf(push[2])}`;
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
  // normalizes to 'exact' on read.
  const width: RuleDescription['width'] =
    rule.pattern === undefined ? 'tool-wide' : rule.match === 'glob' ? 'wide' : 'exact';
```

Update the MCP early return:

```ts
    return { verb: `Use the ${mcp[2]} tool from the ${mcp[1]} connection`, width: 'exact' };
```

Update the three `Task` returns to carry `width` instead of `broad` (`'tool-wide'` for the pattern-less branch, `'exact'` for the other three).

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

- [ ] **Step 5: Update both call sites**

In `src/renderer/components/PermissionsSection.tsx`, find the two `describeRule(rule)` call sites. Replace the breadth-note line — currently:

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

Inspect the other call site and apply the same `broad` → `width === 'tool-wide'` change. Run `grep -n "\.broad" src/renderer/components/PermissionsSection.tsx` and confirm zero hits before moving on.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/bash-grant-shapes.test.ts tests/describe-rule.test.ts tests/permissions-section.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): Settings tells exact, scoped, and tool-wide grants apart

An exact grant and a scoped one both have a pattern but cover wildly different
amounts, so 'broad' could no longer carry the distinction. The scoped sentence
comes from the same module that built the rule, so the screen still never renders
an asterisk and the description cannot drift from what the rule covers.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Workbench compare surface — Destin settles the confirm

**Files:**
- Modify: `src/renderer/dev/workbench/compare/registry.tsx` (add surface, flip `ACTIVE_FIRST`)
- Modify: `src/renderer/dev/workbench/mock-shim.ts` only if a channel is missing

**Interfaces:**
- Consumes: `bashGrantOptions` (Tasks 2–3) so every candidate renders the REAL options.
- Produces: a settled decision recorded in the spec — no code contract.

> **This task ends in a decision, not a merge.** Do not implement the confirm in `ToolCard.tsx` here.

- [ ] **Step 1: Read the registry's own rules**

```bash
sed -n '1,80p' src/renderer/dev/workbench/compare/registry.tsx
```

The header states the compare-view conventions. Follow them exactly — 2b's `full-auto-ask` surface is the worked example to copy.

- [ ] **Step 2: Add the surface**

Add a surface with id `bash-grant-width`, with these variants, each rendered against the real `bashGrantOptions` output for the scenarios below:

Scenarios the surface must cover (one row each, so Destin sees them side by side):
1. `git push origin feat/login` — two options, deny-listed, Full auto (2b safety-stop band)
2. `git push origin master` — two options, deny-listed, Ask-first
3. `git push` — **no** Always-allow at all, allow-once only
4. `npm run build` — two options, not deny-listed, Ask-first (the ordinary path, which has no confirm today)
5. `rm -rf build` — one option (exact only), deny-listed
6. `npm run build > log.txt` — one option (exact only), not deny-listed

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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
node scripts/workbench-boot-check.mjs
```

Expected: all seven routes load with no console error. This has caught three boot crashes that the unit suite passed through — do not skip it.

- [ ] **Step 5: Hand it to Destin**

```bash
cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh
```

Tell him the surface is `?mode=workbench&view=compare` and that `bash-grant-width` is first. **Do not automate the visual review** — he can eyeball it in 30 seconds, and scripting multi-window interaction wastes time (workspace `CLAUDE.md`, "Flag final-stage visual verification").

Ask him for, specifically:
- which candidate shape wins;
- the confirm's header, now that "Always allow this exact command" is false for the wide rung;
- the wording of the wide option itself (the plan's `Always allow pushing to feat/x` is a placeholder label, not settled copy);
- what the card says for scenario 3, where there is no Always-allow to offer.

- [ ] **Step 6: Record the outcome and commit**

Append a `## Compare rounds` section to `docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md` in the workspace repo, recording each round and what he chose, the way 2b's spec records its four rounds. Commit the surface and the spec update.

---

## Task 8: Implement the settled confirm

**Files:**
- Modify: `src/renderer/components/ToolCard.tsx` (`PermissionButtons`)
- Test: `tests/permission-confirm-card.test.tsx`, `tests/tool-card-full-auto-stop.test.tsx`, new `tests/tool-card-grant-width.test.tsx`

**Interfaces:**
- Consumes: `bashGrantOptions`, `GrantOption` (Tasks 2–3); `AskDecision.grantScope` (Task 5).
- Produces: `respondToPermission` payloads carrying `grantScope`.

> **Blocked on Task 7.** The copy and layout below are mechanics only — every user-facing string comes from Destin's compare-round decision. Do not write copy in this task.

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
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/tool-card-grant-width.test.tsx
```

Expected: FAIL — no width control exists.

- [ ] **Step 3: Implement**

In `PermissionButtons`, compute the options once:

```tsx
  // The card shows what the SHARED derivation produced — it never builds a
  // pattern. Only native asks carry a real Bash command; CC asks keep their
  // existing suggestions-driven behavior untouched.
  const grantOptions = useMemo(
    () => (isNative && typeof command === 'string' ? bashGrantOptions(command) : []),
    [isNative, command],
  );
```

Gate `canAlwaysAllow` on it:

```tsx
  // A Bash ask whose command yields no options may not be always-allowed at all
  // (a bare `git push`: its target is not in the command and changes underneath
  // the grant). Non-Bash native asks have no options and are unaffected.
  const noGrantPossible = isNative && typeof command === 'string' && grantOptions.length === 0;
  const canAlwaysAllow = (hasSuggestions || isNative) && !suppressAlwaysAllow && !noGrantPossible;
```

Thread the chosen scope into the decision:

```tsx
  const alwaysAllowDecision = (scope: GrantScope = 'exact') =>
    hasSuggestions
      ? { decision: { behavior: 'allow' }, updatedPermissions: [suggestions![0]] }
      : { decision: { behavior: 'allow' }, updatedPermissions: [NATIVE_ALWAYS_ALLOW], grantScope: scope };
```

Render the chooser in the shape Task 7 settled, driven by `grantOptions` — each option's `label` is displayed verbatim, and its `scope` is what gets sent. Keep the exact rung preselected.

Update the arrow-key `actions.current` array so it still matches the VISUAL order (the existing comment above it explains why that matters).

- [ ] **Step 4: Update the two copy-pinning tests**

`tests/permission-confirm-card.test.tsx` and `tests/tool-card-full-auto-stop.test.tsx` pin the shipped copy verbatim. Update them to the settled strings from Task 7 — and only those strings; every behavioural assertion in them stays.

- [ ] **Step 5: Run the full suite**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run
```

Expected: PASS.

- [ ] **Step 6: Verify, boot-check, and commit**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
node scripts/workbench-boot-check.mjs
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape --full
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): the confirm offers the grant width the user picks

The card renders the options the shared derivation produced and sends back only
which one was chosen. A command that yields no options offers no Always-allow at
all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The vetoed-grant ask says why

**Files:**
- Modify: `src/main/harness/permission-engine.ts` (report the vetoed rule)
- Modify: `src/main/harness/permission-broker.ts` (`AskRequest`, ask payload)
- Modify: `src/renderer/state/hook-dispatcher.ts` (pass it through)
- Modify: `src/renderer/components/ToolCard.tsx` (render the reason)
- Test: `tests/permission-engine.test.ts`, `tests/tool-card-grant-width.test.tsx`

**Interfaces:**
- Consumes: `ruleMatches` (Task 1), the ask payload pattern from 2b's `permissionMode`.
- Produces: `PermissionDecision.vetoedGrant?: true`, `AskRequest.vetoedGrant?: boolean`.

> **Copy is Destin's.** Fold the wording question into Task 7's compare round rather than inventing it here; if Task 7 already ran, ask before implementing Step 3.

**Why this task exists:** a veto is silent — the rule simply fails to match and the layer below asks as if no grant existed. From the user's side that is indistinguishable from the app forgetting their approval. A user who granted "any `npm run`" and then sees `npm run build && echo hi` stop must be told the grant does not extend to chained commands.

- [ ] **Step 1: Write the failing test**

Append to `tests/permission-engine.test.ts`:

```ts
it('reports when a remembered rule matched the pattern but was vetoed', () => {
  const remembered = [{
    tool: 'Bash', action: 'allow' as const, match: 'glob' as const,
    pattern: 'npm run*', except: ['*&&*'],
  }];
  const layers = { presetRules: [], modeRules: rulesForMode('ask'), denyList: DESTRUCTIVE_DENY_LIST, rememberedRules: remembered };
  // NOT `&& rm -rf dist` — that also trips the deny-list's `* rm *`, so the
  // assertion would be testing two things at once and `denyListed` would be true.
  expect(decidePermission('Bash', 'npm run build && echo hi', layers))
    .toEqual({ action: 'ask', denyListed: false, vetoedGrant: true });
  // A command that never had a grant at all must NOT claim one was vetoed.
  expect(decidePermission('Bash', 'cargo test', layers))
    .toEqual({ action: 'ask', denyListed: false });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/permission-engine.test.ts -t vetoed
```

Expected: FAIL — `vetoedGrant` is not on `PermissionDecision`.

- [ ] **Step 3: Implement**

Add to `PermissionDecision` in `src/shared/permission-types.ts`:

```ts
  /** A remembered rule matched this subject's PATTERN but one of its `except`
   *  entries vetoed it, so the decision fell through to a lower layer. Purely
   *  informational: it exists so the card can say "your grant does not extend to
   *  this" instead of presenting as a question the user believes they answered. */
  vetoedGrant?: true;
```

In `decidePermission`, track it alongside the winner:

```ts
  let winner: { r: PermissionRule; deny: boolean } | null = null;
  // A remembered rule whose pattern matched but whose except vetoed it. Only the
  // remembered layer is tracked — preset/mode/deny rules carry no except today,
  // and a veto in a lower layer would not be a promise the user was ever made.
  let vetoed = false;
  for (const entry of ordered) {
    if (entry.r.tool !== '*' && entry.r.tool !== tool) continue;
    if (!ruleMatches(entry.r, subject ?? '')) {
      if (entry.r.except?.length && subjectMatches(subject ?? '', entry.r.pattern)) vetoed = true;
      continue;
    }
    winner = entry;
    vetoed = false; // a later rule covered it after all
  }
  if (!winner) return { action: 'ask', denyListed: false, ...(vetoed ? { vetoedGrant: true as const } : {}) };
  if (winner.r.action === 'ask') {
    return { action: 'ask', denyListed: winner.deny, ...(vetoed ? { vetoedGrant: true as const } : {}) };
  }
  return { action: winner.r.action, denyListed: winner.deny };
```

with `subjectMatches` added to the import.

Thread it through: `AskRequest.vetoedGrant?: boolean` in the broker, spread into the emitted payload the way `permissionMode` is (spread-omitted when false so the CC-path payload stays byte-identical); `harness-session` passes `vetoedGrant: decision.vetoedGrant` into `askUser`; `hook-dispatcher` reads `payload.vetoedGrant` alongside `denyListed`; `ToolCard` renders Destin's settled line when it is set.

- [ ] **Step 4: Run the tests**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape/desktop
npx vitest run tests/permission-engine.test.ts tests/tool-card-grant-width.test.tsx tests/native-permission-broker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape --full
cd youcoded/worktrees/bash-grant-shape
git add -A && git commit -m "feat(permissions): an ask that a grant almost covered says so

A veto is silent by construction — the rule fails to match and the layer below
asks as if no grant existed, which reads as the app forgetting an approval.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Ship

- [ ] **Step 1: Full verification on a fresh rebase**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape
git fetch origin && git rebase origin/master
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/bash-grant-shape --full
```

Expected: PASS. If `slug-repair` landed during this work, the rebase will surface the `cwdToProjectSlug` rename — take the new name.

- [ ] **Step 2: Offer the harness eval**

The Bash tool's permission path changed. Offer to run the harness evaluator (`youcoded/desktop/test-engine/harness-eval.mjs`) and let Destin decide — the paid path costs real money and must never be run unasked. `--dry-run` is free.

- [ ] **Step 3: Runtime check in a dev instance**

```bash
cd /home/destin/youcoded-dev && bash scripts/run-dev.sh bash-grant-shape --label "Bash grant width" --offset 70 --profile grantwidth
```

Start a native session, run `npm run build`, approve it wide, run it again with different arguments, and confirm no second prompt. Then run `git push origin <a branch>` and confirm the branch-scoped option appears and reads correctly. **Ask Destin to do the visual pass** rather than scripting it.

- [ ] **Step 4: PR**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/bash-grant-shape
git push -u origin feat/bash-grant-shape
gh pr create --title "M5 2c: Bash always-allow rule shape" --body "$(cat <<'EOF'
Spec: `youcoded-dev/docs/active/specs/2026-08-13-bash-always-allow-rule-shape.md`

Closes the last item in M5.

**What changes for a user.** "Always allow" on a Bash command now offers a
choice: this exact command, or a wider grant the app derived and named in plain
English. For `git push` the wider grant is one branch — master and main included,
each asked about separately and revocable on its own.

**Two over-grants fixed on the way.** "Always allow this exact command" stored
the raw command as a glob, so any command containing `*` or `?` became a wildcard
rule above the destructive deny-list. And `*` crosses shell operators by design,
so every wide grant carries operator exclusions — without them a grant labelled
"any npm run command" would cover `npm run build && rm -rf /`.

**Behaviour changes worth calling out in review:** existing grants are re-read as
byte-exact (allows strictly less); a bare `git push` can no longer be
always-allowed; rule identity is now the quad, so Settings revokes the row you
clicked.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge — archive**

Move the spec and this plan from `docs/active/{specs,plans}/` to `docs/archive/{specs,plans}/`, flip their `status:` to `shipped`, mark 2c done in `docs/active/plans/2026-08-11-native-sessions-remaining-work.md` §2, and archive `docs/active/handoffs/2026-08-12-native-sessions-m5-2c.md`. Remove the worktree and delete the branch locally and remotely. Commit and push the workspace repo.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §1.1 exact is not exact | 1 (`match`), 4 (normalization) |
| §1.2 `*` crosses shell operators | 2 (`OPERATOR_EXCEPT`) |
| §3 rule shape (`match`, `except`) | 1 |
| §3.2 veto falls through | 1 (test), 9 (surfaced) |
| §3.3 one matcher, two callers | 1 |
| §4.1–4.3 rungs + operator set | 2 |
| §4.4 postcondition | 2 |
| §4.5 vetoed ask says why | 9 |
| §5.1 `git push` branch scoping | 3 |
| §5.2 deny-listed families | 2 (generic suppression), 3 (the one row) |
| §5.3 trailing-flag gap | recorded, not implemented — by design |
| §6 trust boundary | 5 |
| §7 normalization to exact | 4, 5 (non-Bash) |
| §8 identity quad | 4 |
| §9 Settings three widths | 6 |
| §10 the confirm | 7 (settle), 8 (implement) |
| §11 testing | every task |
| §12 consequences | PR body, Task 10 |
