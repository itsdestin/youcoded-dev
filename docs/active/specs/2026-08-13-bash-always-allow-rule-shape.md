---
status: draft
created: 2026-08-13
type: spec
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
item: M5 2c — Bash always-allow rule shape
handoff: docs/active/handoffs/2026-08-12-native-sessions-m5-2c.md
---

# Bash always-allow rule shape (M5 2c)

The last item in M5. 2a shipped revocation; 2b shipped the Full-auto safety stop. This one
fixes what an "Always allow" on a Bash command actually grants.

## 1. The problem, restated

The program doc frames 2c as grants being too narrow: Bash's `permissionSubject` is the
literal full command (`tools/bash.ts:484`), `subjectMatches` anchors `^…$`, so
"always allow `git push origin main`" grants nothing for `git push origin dev`. Every
approval buys exactly one command string.

That is true, and it is only half the problem. Grant width today is not narrow — it is
**unspecified**, and in the cases that matter most it is far too wide.

### 1.1 "This exact command" is not exact

`harness-session.ts:1949` stores the raw subject as the rule's `pattern`, and
`subjectMatches` escapes every regex metacharacter *except* `*` and `?`, which it
compiles to `[\s\S]*` and `.`. A command that itself contains a glob metacharacter is
therefore stored as a wildcard rule. Verified against the shipped matcher:

```
grant "rm *.log"  matches  "rm *.log"              => true
grant "rm *.log"  matches  "rm secrets.log"        => true
grant "rm *.log"  matches  "rm -rf / #.log"        => true
grant "rm *.log"  matches  "rm ; curl x | sh .log" => true
grant "ls ?"      matches  "ls x"                  => true
```

`rm *.tmp`, `cp src/* dst/`, `grep foo *` are ordinary commands. Approve one with
"Always allow this exact command" — the shipped confirm copy — and the app persists a
wildcard rule at the top precedence layer, above the destructive deny-list. The confirm
tells the user something false, and the rule it writes is the shape the deny-list exists
to prevent.

### 1.2 `*` crosses shell operators

The root cause is the same one that makes 1.1 dangerous rather than merely sloppy:
`subject-glob.ts` compiles `*` to `[\s\S]*` **on purpose** — the header says so, because
`git push*` has to match `git push origin x`. The consequence is that any `*` in a Bash
pattern also crosses `&&`, `;`, `|`, and newlines. A pattern of the obvious shape

```
npm run build*      matches      npm run build && rm -rf /
```

This constrains the whole design: a naive "widen by appending `*`" would hand out
arbitrary command execution behind a sentence that says "any npm run build command."
Any wide rule shape must exclude shell operators explicitly.

### 1.3 Why widening is safe to design now, and only now

Remembered rules are the FINAL engine layer (`permission-engine.ts`, last match wins), so
they outrank `DESTRUCTIVE_DENY_LIST`. Their accidental narrowness has been the only limit
on blast radius. 2a shipped revocation, so a regretted grant is now recoverable — but this
is still a security change and is specified as one.

## 2. Decisions

| # | Decision | Owner |
|---|---|---|
| D1 | The **user** picks the grant width, from options the app computes. No free-text glob entry. | Destin, 2026-08-13 |
| D2 | **Two rungs** — exact, or program+subcommand. No whole-program third rung; that requires going to Settings. | Destin, 2026-08-13 |
| D3 | A **small table of command shapes** scopes the wide rung to the specific thing the command acts on. `git push` is the motivating entry: the wide rung is "any push to THIS branch". | Destin, 2026-08-13 |
| D4 | **Per-branch, no protected-branch policy.** master and main are ordinary branches. The user is asked separately for each branch and each grant is stored separately, so "always allow pushes to master" is available and is an explicit, visible, individually-revocable act. | Destin, 2026-08-13 |

D3/D4 supersede an earlier draft of this spec (commits `1f3b6ef`, `5da87e1`) in which the
`git push` wide rung was "any push EXCEPT to master or main". That shape was rejected:
it decides the policy on the user's behalf, it cannot express "I do want master to stop
asking", and its substring exclusions made `git push origin domain-fix` prompt forever
for a reason no one could guess. Per-branch scoping is strictly better on all three
counts and deletes the exclusion table entirely.

## 3. Rule shape

`PermissionRule` (`src/shared/permission-types.ts`) gains two optional fields:

```ts
export interface PermissionRule {
  tool: string;
  pattern?: string;
  action: PermissionAction;
  /** How `pattern` is compared. Absent = 'glob' — today's semantics, which every
   *  existing stored rule and every DESTRUCTIVE_DENY_LIST entry relies on. */
  match?: 'exact' | 'glob';
  /** Glob patterns that VETO a match. The rule fires only if `pattern` matches and
   *  no `except` entry does. Meaningful only under 'glob'; ignored under 'exact'. */
  except?: string[];
}
```

Both absent on every rule that exists today, so nothing already on disk or in the
deny-list changes meaning.

### 3.1 `match: 'exact'`

Byte-for-byte string equality against the subject. No regex, no metacharacter
interpretation. This is what makes the shipped promise true.

**Byte-equal, not case-insensitive.** `subjectMatches` carries the `'i'` flag, which for
an exact grant is strictly a widening — `RM -rf /` is not `rm -rf /` on the platforms
Bash runs on. The deny-list keeps its case-insensitive glob matching untouched, so
`RM *` still trips the deny-list layer.

**No escape syntax is added to `subjectMatches`.** A backslash escape (`\*`) was the
obvious alternative and is rejected: the matcher currently escapes `\` as a regex
literal, so backslash-as-escape would break Windows commands like `del C:\foo\*`. A
discriminator field sidesteps the question entirely and leaves the deny-list's own
matching bit-identical.

### 3.2 `except` vetoes; it does not block

An `except` entry does not write a deny. It makes the remembered rule **fail to match**,
which drops the decision back to whatever the layer below already said. For a deny-listed
family that is the deny-list's own `ask`; for anything else it is the mode baseline.

So a grant of "any `npm run` command" (§4.3's operator set) yields:

- `npm run build` → remembered rule matches → allowed.
- `npm run build && rm -rf dist` → vetoed by `*&&*` → the layer below is the winning rule
  → **still asks**.

The same fall-through is what lets a scoped grant coexist with the deny-list: a grant of
"pushing to feat/x" simply does not match `git push origin master`, so the deny-list's
`git push*` wins and master still asks — until the user separately approves master (D4).

No new engine layer, no negation in the matcher, no re-ordering of precedence, and
`DESTRUCTIVE_DENY_LIST` is not touched. This is the mechanism the whole design rests on.

### 3.3 One matcher function, two callers

`subjectMatches` stays as the primitive. A new exported `ruleMatches(rule, subject)` in
`src/shared/subject-glob.ts` owns `match` / `pattern` / `except`:

```ts
export function ruleMatches(rule: PermissionRule, subject: string): boolean {
  if (rule.match === 'exact') return rule.pattern !== undefined && subject === rule.pattern;
  if (!subjectMatches(subject, rule.pattern)) return false;
  return !(rule.except ?? []).some((e) => subjectMatches(subject, e));
}
```

`decidePermission` calls it instead of `subjectMatches`. So does
`components/permissions/deny-list-copy.ts` — its header already states why it must
classify with the same matcher the engine decided with, and that reason now covers
`except` too.

## 4. Deriving the two rungs

New shared module `src/shared/bash-grant-shapes.ts`. Shared for the same reason
`subject-glob.ts` is: the sentence the user reads in the confirm and the rule the engine
stores must come from one function, or they will eventually disagree.

```ts
export type GrantScope = 'exact' | 'wide';

export interface GrantOption {
  scope: GrantScope;
  rule: PermissionRule;      // exactly what gets persisted
  /** Plain-English label. Never contains '*' or any other rule syntax.
   *  Generic wide rung: 'Any npm run command'.
   *  Scoped wide rung (§5.1): 'Always allow pushing to feat/x'. */
  label: string;
}

/** Options to offer for a Bash command, narrowest first. Always at least one
 *  (the exact rung). Length 1 means no widening is offered for this command. */
export function bashGrantOptions(command: string): GrantOption[];
```

### 4.1 Exact rung

Always present. `{ tool: 'Bash', pattern: command, action: 'allow', match: 'exact' }`.
Label: the command itself, echoed verbatim (2b's confirm already does this).

### 4.2 Wide rung

Offered unless suppressed by §4.4. Derivation:

1. Tokenize on whitespace, respecting single and double quotes.
2. `program` = token 0.
3. `subcommand` = token 1, **if** it exists and does not start with `-` and contains no
   `/`, `\`, or `.` (i.e. is a word, not a flag and not a path).
4. Pattern = `` `${program} ${subcommand}*` `` if a subcommand was found, else
   `` `${program}*` ``.

So `git push origin feat/x` → `git push*`; `cargo test --release` → `cargo test*`;
`curl https://example.com` → `curl*`; `ls -la /tmp` → `ls*`.

**The wide rung is the verb the user typed, not a fixed token count.** For `git` the verb
is `git push`; for `curl` the verb is all of curl, because curl has no subcommands. These
are the same rule, and the confirm's wording must not imply otherwise.

**Known consequence for script runners.** `npm run build` derives `npm run*`, which covers
`npm run deploy` and every other script in `package.json`. The verb for `npm` is genuinely
two tokens deeper than for `git`, and the table (§5) is the mechanism that could pin that —
a row may carry a `depth` alongside its scoping. No such row ships in this item (D3
scopes the table to `git push`); this is recorded so the first person who finds `npm run*`
too wide knows where the fix goes, rather than reaching for a fourth rung.

### 4.3 The operator exclusion set

Every wide rung carries this baseline `except`, merged with any table entry (§5):

```ts
const OPERATOR_EXCEPT = ['*&&*', '*||*', '*;*', '*|*', '*`*', '*$(*', '*>*', '*<*', '*\n*'];
```

Without it, `npm run build*` grants `npm run build && rm -rf /` (§1.2). With it, that
command is vetoed and falls back to the layer below, which asks.

These are matched by `subjectMatches`, which escapes `|`, `$`, `(`, `.` — verified
against the escape class in `subject-glob.ts`. Backtick, `<`, `>`, `&`, `;`, and newline
are not regex-special and need no escaping.

This set is deliberately over-broad. A command containing a `>` redirect that the user
wanted covered will merely ask again — an unnecessary ask is annoying; a wide grant that
crosses `&&` is the failure that matters. Same fail-safe reasoning
`DESTRUCTIVE_DENY_LIST`'s header already states for its own over-matching.

### 4.4 When no wide rung is offered

**The governing invariant: never offer a rung that does not cover the command in front of
the user.** Formally — a `GrantOption` is emitted only if `ruleMatches(option.rule,
command)` is true. This is a hard postcondition of `bashGrantOptions`, pinned by a test
that runs it over a corpus and asserts every returned option matches its own input.

Without it the feature has a trapdoor. Concretely, all three of these would otherwise be
offered as a wide rung that can never fire for the very command being approved:

- **A command the operator set excludes.** `npm run build > log.txt` derives `npm run*`,
  whose `OPERATOR_EXCEPT` contains `*>*` — it vetoes the approving command itself.
- **A command the table cannot scope.** `git push origin master feat/x` pushes two refs;
  §5.1 derives `git push*origin feat/x`, which does not match it. Offering that rung
  would store a grant that cannot fire for the command the user was looking at, and
  would name only one of the two branches it was really about.
- **A chained command.** `npm run build && git push` derives `npm run*`, vetoed by `*&&*`.

The invariant kills all three with one rule, and subsumes the chained-command case that
would otherwise need its own list. Chaining stays independently worth naming, because a
rung named after the first verb of a multi-verb command would silently cover the rest —
the hole `DESTRUCTIVE_DENY_LIST`'s `* …` compound variants exist to close.

Also exact-only:

- The command matches a deny-listed family that has no table entry (§5.2).
- Tokenization yields no program (empty or whitespace-only command).

### 4.5 An ask the user thought they had answered must say so

A veto is silent by construction: the rule simply does not match, and the layer below asks
as if no grant existed. From the user's side that is indistinguishable from the app
forgetting their approval — the worst possible reading, and the one that costs trust.

The remaining vetoes are §4.3's operator set. A user who granted "any `npm run`" and then
sees `npm run build && rm -rf dist` stop must be told that the grant does not extend to
commands chained with another command — not shown a bare "may I?".

This rides the ask payload the way 2b's `permissionMode` does — validated at the
dispatcher, display-only, never persisted. Exact copy is Destin's (§10).

Per-branch scoping (§5.1) removed the large source of unexplained re-asks that an earlier
draft carried. What remains is the operator set and §5.3's trailing-flag gap.

## 5. The command-shape table — target scoping

A row does not supply exclusions. It supplies a **narrower wide rung**: instead of
generalising to the whole verb (`git push*`), it pins the specific thing the command acts
on and generalises everything else.

```ts
interface CommandShape {
  /** Matched against `${program} ${subcommand}`. */
  key: string;
  /** Returns the scoped rung, or null when this command cannot be scoped safely.
   *  Null means no wide rung at all — never a silent fallback to the generic one. */
  scope(command: string): { pattern: string; label: string } | null;
}
```

Returning `null` is load-bearing: a table row exists precisely because the generic rung is
too wide for that command, so falling back to it when scoping fails would grant more than
the unscoped case, not less.

### 5.1 `git push` — scope to the branch

For `git push`, the wide rung is **"always allow pushing to this branch"**. Nothing is
excluded and no branch is special. master, main, and `feat/login` are all ordinary
branches: each is asked about the first time, each gets its own stored grant, each shows
as its own row in Settings, and each is revocable on its own.

**Derivation.** Tokenize after `git push`; separate flags (leading `-`) from positional
arguments. A rung is produced **only when there are exactly two positional arguments** —
a remote and a refspec:

```
pattern = `git push*${remote} ${refspec}`      // end-anchored, refspec verbatim as typed
label   = `Always allow pushing to ${branch}`   // branch = refspec with +, HEAD:, refs/heads/ stripped
```

`git push origin feat/x` → pattern `git push*origin feat/x`, label "Always allow pushing
to feat/x". Verified against the shipped matcher:

| command | matches `git push*origin feat/x` |
|---|---|
| `git push origin feat/x` | yes |
| `git push -u origin feat/x` | yes |
| `git push --force origin feat/x` | yes |
| `git push origin feat/x-2` | **no** — a longer branch name is a different branch |
| `git push origin master feat/x` | **no** — see below |
| `git push origin feat/x master` | no |
| `git push origin master` | no |
| `git push origin feat/x --force` | no — trailing flags, see §5.3 |

**Why the remote is in the pattern and not just the branch.** The obvious shape,
`git push*feat/x`, leaks: it matches `git push origin master feat/x`, which pushes master
*and* feat/x. Git accepts any number of refspecs, and this glob cannot count tokens, so
the only way to bound the command to a single ref is to pin the token that must precede
it. Including the remote does that — verified above. A grant named "pushing to feat/x"
that silently also pushes master is the exact failure this item exists to prevent.

**No rung when the target is not in the command.** Bare `git push` (zero positional
arguments) pushes whatever branch is checked out *at the time it runs*. The app cannot
know which branch that is from the command string, and the branch changes underneath the
grant — approve it on `feat/x` today and it silently pushes `master` next week. Under a
per-branch model that is a hole that defeats the point.

So a `git push` with no explicit refspec gets **no "Always allow" button at all**, only
allow-once. `suppressAlwaysAllow` already exists on `PermissionButtons` for exactly this
class of ask (budget gates, external directories). This is a small removal of an existing
capability — today a bare `git push` can be always-allowed and then covers every future
bare push on any branch — and removing it is the whole reason per-branch means anything.

### 5.2 Deny-listed families: `git push` is scoped, the rest are exact-only

`rm`, `rmdir`, `del`, `sudo`, `format`, and `git reset --hard` offer no wide rung at all.

Target scoping does not transfer to them, and `rm` shows why concretely: a scoped rung of
`rm*build/` would match `rm -rf /home/me build/`, because `rm` takes any number of
targets and the trailing one is all the pattern pins. The remote-token trick that bounds
`git push` to a single ref has no analogue — there is nothing that must precede an `rm`
target. `sudo` is worse: its varying part IS its danger.

Implementation: a command is deny-listed if any `DESTRUCTIVE_DENY_LIST` entry matches it
(via `ruleMatches`). If so, a wide rung is offered only when the derived key has a table
row. This is a live check against the shared list, not a second hardcoded family list —
adding a deny-list entry must not silently open a wide rung for it.

### 5.3 What the scoped rung does not cover

`git push origin feat/x --force` — flags *after* the refspec — does not match, so it asks
again and, if approved, stores its own row. Git's own documentation and every common
invocation put flags before the refspec, and this glob cannot express "a flag, but not
another ref". The safe direction is an extra ask.

This is the one place the design produces a re-ask that §4.5 cannot explain, because it
is a non-match rather than a veto. It is recorded rather than solved; if it turns out to
bite, the fix is a second stored pattern per grant, which costs a second Settings row.

## 6. Trust boundary — the renderer never names a pattern

The confirm sends a **rung selector**, never a pattern string. A renderer that could name
its own pattern would be a renderer that could grant itself anything, and remembered
rules are the top precedence layer.

- `AskDecision` (`permission-broker.ts`) gains `grantScope?: 'exact' | 'wide'`.
- The broker validates it is exactly one of those two literals and drops anything else.
  Absent or invalid → `'exact'` (fail-narrow).
- `harness-session.ts`'s `remember-rule` emit calls `bashGrantOptions(command)` and picks
  the option whose `scope` matches, falling back to the exact rung if the requested scope
  was not offered for this command. The host re-derives from the tool call it already
  holds; the renderer's input is one enum value.
- Non-Bash tools ignore `grantScope` entirely and keep emitting today's rule — with
  `match: 'exact'` added (§7).

This follows 2b's `permissionMode` precedent (validated at the dispatcher, display-only)
with one difference stated plainly: `grantScope` **is** persisted, so it is validated at
the broker AND re-derived at the host rather than trusted.

## 7. Every remembered rule becomes `match: 'exact'`

`remember-rule` stores the raw `permissionSubject` for **every** tool
(`harness-session.ts:1949`), so every rule ever written to `permissions.json` is an
exact-subject grant that has been evaluated as a glob. Presets, mode baselines, and the
deny-list are code, not stored, and are unaffected.

Therefore:

- New grants: the exact rung writes `match: 'exact'`; the wide rung writes
  `match: 'glob'` (explicit, not absent) plus `except`.
- Existing grants: `PermissionStore` normalizes on read — any stored rule with no `match`
  field gets `match: 'exact'`. This is strictly fewer allows, restores the promise the
  user was given when they clicked, and needs no migration file. Rules that relied on
  accidental wildcarding are precisely the bug.
- The normalization is written back on the next `remember()` for that project, not
  eagerly — `remember()` already spreads the existing entry
  (`native-permissions.md` → "`remember()` spreads the existing entry").

## 8. Rule identity becomes a quad

`native-permissions.md` pins that rule identity everywhere — dedupe in `remember()`, disk
removal in `remove()`, and the in-memory `rememberedFor` filter in `revokeRule` — is the
`(tool, pattern, action)` triple. It becomes `(tool, pattern, action, match, except)`.

Without this, "any `git push` except master" and a hypothetical "any `git push`" collapse
on dedupe, and revoking one from Settings removes the other. `except` compares as a
set-equal over its entries, not by array identity or order.

Files: `permission-store.ts`, `native-session-host.ts`, and the invariant text in
`.claude/rules/native-permissions.md` — in the same commit.

## 9. Settings → Permissions

`describeRule` today reports two widths: a specific grant, or `broad` (no pattern at all).
There are now three.

```ts
export interface RuleDescription {
  verb: string;
  subject?: string;
  /** 'exact'    — one literal command / path
   *  'wide'     — a pattern grant, e.g. any `git push`
   *  'tool-wide'— no pattern; covers every use of the tool */
  width: 'exact' | 'wide' | 'tool-wide';
}
```

`broad: boolean` is replaced by `width`. Two call sites, both in `PermissionsSection.tsx`
(lines 303 and 728). `broadNote(tool)` keeps its current copy and fires only on
`'tool-wide'`.

A wide Bash rule renders from the same `GrantOption` label the confirm showed, so the
screen still never renders an asterisk: **"Pushing to feat/x"**, **"Pushing to master"**,
**"Run any `npm run` command"**. `describeRule` therefore needs the rule's `pattern` to be
reversible into that sentence — `bash-grant-shapes.ts` exports a `describeBashPattern()`
alongside `bashGrantOptions()` so one module owns both directions and they cannot drift.
The existing MCP and Task branches are unchanged; MCP stays non-broad for the reason its
comment already gives, and reports `'exact'`.

## 10. The confirm — deferred to the workbench

Two surfaces need the rung choice, and they behave differently today:

- **Deny-listed asks** already show a consequence confirm (`ToolCard.tsx:415-463`) with
  "Nevermind, allow once" / "Always allow", headed **"Always allow this exact command"**.
  That header becomes false for the wide rung.
- **Ordinary asks** have no confirm at all — "Always Allow" responds immediately.

Constraints the compare rounds must respect, whatever shape wins:

1. No asterisk, no glob syntax, on any screen a user reads. `describe-rule.ts`'s existing
   comment ("that is rule syntax, and the screen is written for people who have never
   seen a glob") governs the confirm too.
2. The exact rung is the default selection. Widening is always an explicit act.
3. The wide rung names the branch out loud — "Always allow pushing to **master**" — and is
   not hidden behind a tooltip. A grant the user cannot read is a grant they cannot judge.
   (`title=` is also dead on touch — `.claude/rules/narrow-viewport.md`.)
4. When only one option exists (§4.4), the confirm renders as it does today — no empty
   chooser, no disabled second rung.
5. The rule also applies to the rest of the current session; 2b's body copy understates
   this knowingly and that decision carries forward.
6. 2b's Full-auto safety stop keeps its band, header, and Run it / Skip it | Always Allow
   ordering. Only what happens after "Always Allow" changes.
7. §4.5's vetoed-grant ask needs its own line of copy — the user is being asked about
   something they believe they already allowed, and the card has to say why.

**All copy is Destin's.** 2b's subline took three owner iterations; this spec proposes no
wording. Candidates get built on a new compare surface in
`src/renderer/dev/workbench/compare/registry.tsx` with `ACTIVE_FIRST` flipped to it, the
way `full-auto-ask` ran.

## 11. Testing

Extend, in the same commit as the change each covers:

| Test | What it must newly pin |
|---|---|
| `subject-glob.test.ts` | `ruleMatches`: exact is byte-equal and case-SENSITIVE; `except` vetoes; `except` ignored under `'exact'`; a legacy rule with no `match` still globs |
| `permission-engine.test.ts` | A vetoed remembered rule falls through to the deny-list's `ask` — the §3.2 mechanism, with `git push origin master` as the named case |
| `bash-grant-shapes.test.ts` (new) | `npm run build*` does NOT grant `npm run build && rm -rf /`; no wide rung for chained commands; no wide rung for `rm`/`sudo`; subcommand-vs-flag-vs-path detection |
| `bash-grant-shapes.test.ts` (new) | **`git push` scoping (§5.1)**: `git push*origin feat/x` matches the bare, `-u`, and `--force` forms; does NOT match `origin feat/x-2`, `origin master feat/x`, `origin feat/x master`, or `origin master`. Bare `git push` and `git push origin` yield no wide rung AND suppress "Always allow" entirely. A push to master scopes to master like any other branch — no family is special |
| `bash-grant-shapes.test.ts` (new) | **The §4.4 postcondition**: over a corpus of commands, every returned option satisfies `ruleMatches(option.rule, command)` — no option is ever offered that cannot cover its own input. Named cases: `npm run build > log.txt`, `git push origin master feat/x`, `npm run build && git push` |
| `permission-store.test.ts` | Identity is the quad; legacy rules normalize to `match: 'exact'` on read; `except` set-equality in dedupe and `remove` |
| `native-session-host.test.ts` | `revokeRule` removes only the matching quad from `rememberedFor` |
| `describe-rule.test.ts` | Three widths; a scoped push rule renders "Pushing to <branch>"; no `*` in any returned string |
| `permissions-section.test.tsx` | A wide rule's row copy; `broadNote` fires only on `'tool-wide'` |
| `deny-list-copy.test.ts` | Classifier goes through `ruleMatches` and still names the same family |
| `tool-card-full-auto-stop.test.tsx`, `permission-confirm-card.test.tsx` | Updated to whatever copy the compare rounds settle — they pin it verbatim, so they change last |

An ast-grep rule is the right home for "no Bash pattern is stored without a `match`
field" if it turns out to be expressible; otherwise the store test carries it.

## 12. Consequences the user will feel

Stated plainly, because several are visible changes to a shipping app that nobody would
trace back to this item.

**Some existing approvals will start asking again.** §7 re-reads every stored rule as
byte-exact. Anyone who approved a command containing `*` or `?` — `rm *.tmp`,
`grep foo *` — had a wildcard rule they never asked for, and loses it. Anyone whose
approved command differed in capitalisation from what runs now also loses the match. The
direction is always "asks more, allows less", so nothing becomes less safe; it will read
as the app forgetting an approval. Whether that warrants a one-time notice is Destin's
call — this spec does not add one.

**Each branch is asked about once, then stops asking.** The first push to a branch
prompts; approving it covers every later push to that same branch in that project. A new
branch is a new question. For someone working in short-lived feature branches that is one
prompt per branch — the intended cost, against the alternatives of one prompt per command
string (today) or one blanket grant (rejected by D4).

**A push to a branch you approved becomes silent in Full Auto.** Today Full auto always
stops before any push. After approving master, pushes to master proceed with no prompt in
that project until revoked. That is the point of D4 — the user is allowed to decide master
is fine — and it is the largest single behavioural change in the item. It is also fully
visible: the grant reads "Always allow pushing to master" in Settings, on its own row,
with its own remove button.

**Pushes written a less common way ask again.** Flags after the branch
(`git push origin feat/x --force`) and the `HEAD:` / `+` refspec forms derive a different
rule than the plain form, so each prompts once and stores its own row (§5.3).

**Bare `git push` loses its "Always allow" button.** Today it can be always-allowed, and
that grant then covers every future bare push on any branch — the hole per-branch exists
to close. After this it is allow-once only. Existing bare-`git push` grants are NOT
retroactively removed; they keep working and stay visible in Settings, where they can be
revoked. Silently deleting them would be a bigger surprise than leaving them.

**Full Auto still asks for four of the five destructive families.** Full auto's baseline
is `{ tool: '*', action: 'allow' }`, so the ONLY things it ever asks about are deny-list
matches. §5.2 scopes `git push` alone, so `rm`, `sudo`, `format`, and `git reset --hard`
keep asking every time unless the exact command repeats. The program doc's done-condition
— "Full Auto no longer asks questions it has already answered" — is therefore met for
pushes and deliberately not met for the other four. That is the posture D2 and §5.2 chose,
recorded here so it is not discovered later as a gap.

**The wide rung mostly benefits Ask-first and Auto-edit.** Those are the modes where
ordinary commands prompt at all.

**Specialists inherit wide grants.** `buildDecide` feeds `parentDecide` for child sessions
(`native-session-host.ts`), so a widened grant widens what a spawned specialist may run,
exactly as exact grants already do. Broader latitude, same mechanism, no new seam.

**Settings can show two rows for one command.** Approve `git push origin feat/x` exactly,
then later approve "pushing to feat/x" — identity is a quad (§8), so both persist and both
list. Removing one leaves the other live. Suppressing a subsumed exact row is possible and
is NOT in this item; two honest rows beat a screen that hides a live grant.

**Push grants will accumulate a row per branch.** That is the design working, but a
long-lived project will grow a list. Grouping by project already exists (2a); grouping
several branch grants under one "Pushing" heading is a Settings-screen refinement, not
part of this item.

**Row copy does not mention the operator exclusions.** "Run any `npm run` command" omits
"…and not when chained with another command". Putting it in the row would bury the part
that matters; the Permissions explainer popup is the right home.

## 13. Out of scope

- **File-tool grant widening.** `Write`/`Edit` subjects are paths and have the same
  literal-only narrowness, but a directory-scoped file grant is its own design with its
  own blast radius. §7's normalization makes their existing grants honest, and that is
  all this item does for them.
- **A whole-program third rung** (D2). A user who wants all of `git` goes to Settings.
- **Editing a rule in Settings.** The screen lists and revokes; it does not author.
- **Android.** No native runtime there yet (M8).

## 14. Traps carried in from the handoff

- Never canonicalize `ctx.cwd`; removal keys by SLUG; `revokeRule`/`revokeProject` are the
  only revocation entry points. `.claude/rules/native-permissions.md`.
- `cwdToProjectSlug` is being renamed by the in-flight `slug-repair` worktrees. Whoever
  lands second updates the other.
- `verify.sh` is Linux-only and master is red on Windows from unrelated work
  (`harness-tools-core.test.ts > Bash > persistent_env`). Attribute before assuming.
- `tests/helpers/guard-scope.ts` does not scan `components/<subdir>/`.
- Five-surface IPC parity if any channel is added — none is expected here; `grantScope`
  rides the existing `respondToPermission` payload.

## 15. Amendments (2026-08-13, from the implementation plan)

The implementation plan (`docs/active/plans/2026-08-13-bash-always-allow-rule-shape.md`)
narrows five decisions above. Recorded here so the spec does not contradict its own plan
while the work is in flight. Each is a narrowing (allows less) or a simplification (fewer
moving parts).

| # | This spec said | The plan does | Why |
|---|---|---|---|
| A1 | §3.2/§4.3 — every wide rule stores an `except` array of shell operators | The matcher (`ruleMatches`) owns operator-crossing; no `except` field exists | Cannot be forgotten by a future rule-builder; removes a persisted array, a 5th identity field, and an order-insensitive comparison |
| A2 | §5.1 — the branch rung "covers the flag forms", `--force` included | A second matcher rule vetoes `--delete`, `-d`, `--prune`, `--mirror`, `--all`, `--force`, `-f`, `--force-with-lease`, `--hard` on any pattern with text after its wildcard | A grant reading "pushing to feat/x" that deletes feat/x — or every *other* branch, via `--prune` — is the lie this item exists to end. `-u`, `-q`, `--set-upstream` are still covered |
| A3 | §4.4 — a push that cannot be scoped is offered nothing | It still gets the **exact** rung; only the wide rung is suppressed | Remembering `git push origin master feat/x` byte-for-byte is exactly as safe as remembering `rm -rf build`, which §5.2 already allows. Refusing it means a repeated push that can never be answered permanently |
| A4 | §4.4/§5.2 — danger is judged from the approving command | Danger is judged from the approving command **and** from what the derived rule would admit (a fixed hostile corpus, one entry per deny-list family) | §5.2's check misses `git --no-pager log`: its second token is a flag, so the derived rung is `git*`, offered as "Any git command" — which covers pushes and hard resets and outranks the deny-list once stored |
| A5 | §4.5 — a vetoed ask tells the user why (a field threaded engine → broker → dispatcher → card) | Dropped from this item. The caveat is stated **up front in the option's own wording** (settled in the workbench round) and the after-the-fact explanation is logged to ROADMAP | It explained only one of the two re-ask causes — §5.3's flag-after-refspec case is a non-match, not a veto — so the user still could not rely on being told. Four files and a copy decision for half a promise |

Also new, not decided above:

- `git push origin HEAD` and `git push origin @` are treated exactly like a bare
  `git push` (no grant at any width). `HEAD` resolves to whatever branch is checked out
  when the command RUNS, so §5.1's "the branch changes underneath the grant" applies to
  them verbatim.
- `git push origin :feat/x` (delete form) and `git push origin +feat/x` (force form) get
  the exact rung but no branch rung: a rung labelled "pushing to feat/x" would misdescribe
  both.
- The hostile corpus of A4 deliberately does NOT contain a plain `git push origin master`.
  Pushing to master is something D4 says the user may grant, so it is not hostile
  regardless of intent — including it would refuse the very rung §5.1 exists to build.
  `git*` is still caught, by the `--delete`, `--prune` and `git reset --hard` entries.
- Commands are stored VERBATIM, never trimmed. `permissionSubject` hands the engine
  `args.command` unchanged, so a trimmed pattern would differ from the subject by a
  character the user cannot see and the grant would silently never fire again.
