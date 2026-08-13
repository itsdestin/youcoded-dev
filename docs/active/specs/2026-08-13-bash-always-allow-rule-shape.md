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
| D3 | A **small table of command shapes** supplies per-command exclusions where the varying part is separable from the dangerous part. `git push` is the motivating entry. | Destin, 2026-08-13 |
| D4 | Exclusions are **fixed defaults the user reads**, not editable in the confirm. | Destin, 2026-08-13 |

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

So a grant of "any `git push`, except to master or main" yields:

- `git push origin feat/login` → remembered rule matches → allowed.
- `git push origin master` → remembered rule vetoed → deny-list's `git push*` is the
  winning rule → **still asks**, and still renders 2b's safety stop in Full auto.

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
  /** Plain-English label. Never contains '*' or any other rule syntax. */
  label: string;
  /** Plain-English exclusion clause, or undefined. */
  exceptNote?: string;
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
a row may carry a `depth` alongside its exclusions. No such row ships in this item (D3
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

`bashGrantOptions` returns the exact rung only when:

- The command contains a shell operator (`&&`, `||`, `;`, `|`, backtick, `$(`, newline).
  A chained command has more than one verb in it, and a rung named after the first would
  silently cover the rest — the hole `DESTRUCTIVE_DENY_LIST`'s `* …` compound variants
  exist to close. (Such a rung would also be vetoed by its own operator exclusion set,
  which is absurd on its face.)
- The command matches a deny-listed family that has no table entry (§5.2).
- Tokenization yields no program (empty or whitespace-only command).

## 5. The command-shape table

```ts
interface CommandShape {
  /** Matched against `${program} ${subcommand}` or `${program}`. */
  key: string;
  label: string;              // e.g. 'Any git push'
  except: string[];           // merged with OPERATOR_EXCEPT
  exceptNote: string;         // e.g. 'except to master or main'
}
```

### 5.1 Entries

| key | label | except | note |
|---|---|---|---|
| `git push` | Any `git push` | `git push*master*`, `git push*main*` | except to master or main |

One entry to start. A row earns its place only when the varying part of the command is
separable from the dangerous part. Anything without a row falls through to the generic
derivation with `OPERATOR_EXCEPT` alone.

**Why the exclusions are substring patterns over the whole command rather than a parsed
branch argument.** Verified against the shipped matcher: `git push*master*` vetoes
`git push origin master`, `git push --force origin master`, `git push origin HEAD:master`,
and `git push origin +master`, while `git push origin feat/login` and `git push -u origin
feat/x` still match. A positional parse, or a space-anchored `git push* master*`, misses
the `HEAD:master` and `+master` refspec forms — which are exactly the shapes a
force-push-to-master takes.

The cost is over-veto: `git push origin maintenance` and `git push origin domain-fix`
contain the substrings and will keep asking. That is the same fail-safe trade §4.3 makes
and `DESTRUCTIVE_DENY_LIST`'s own header states — an unnecessary ask is annoying, a missed
push to master is the failure that matters.

### 5.2 Deny-listed families are exact-only, except `git push`

`rm`, `rmdir`, `del`, `sudo`, `format`, and `git reset --hard` offer no wide rung. For
each of them the varying part *is* the dangerous part; there is no honest exclusion list
for "any `sudo`". `git push` is the one deny-listed family where the branch separates
cleanly from the risk, which is the entire reason the table mechanism exists.

Implementation: a command is deny-listed if any `DESTRUCTIVE_DENY_LIST` entry matches it
(via `ruleMatches`). If so, a wide rung is offered only when the derived key has a table
row. This is a live check against the shared list, not a second hardcoded family list —
adding a deny-list entry must not silently open a wide rung for it.

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
  /** Plain-English exclusion clause for a 'wide' rule, e.g. 'except to master or main'. */
  exceptNote?: string;
}
```

`broad: boolean` is replaced by `width`. Two call sites, both in `PermissionsSection.tsx`
(lines 303 and 728). `broadNote(tool)` keeps its current copy and fires only on
`'tool-wide'`.

A wide Bash rule renders as **"Run any `git push` command, except to master or main"** —
the sentence comes from the same `GrantOption` the confirm showed, so the screen still
never renders an asterisk. The existing MCP and Task branches are unchanged; MCP stays
non-broad for the reason its comment already gives, and reports `'exact'`.

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
3. The exclusion clause is shown, not hidden behind a tooltip — a grant the user cannot
   read is a grant they cannot judge. (`title=` is also dead on touch —
   `.claude/rules/narrow-viewport.md`.)
4. When only one option exists (§4.4), the confirm renders as it does today — no empty
   chooser, no disabled second rung.
5. The rule also applies to the rest of the current session; 2b's body copy understates
   this knowingly and that decision carries forward.
6. 2b's Full-auto safety stop keeps its band, header, and Run it / Skip it | Always Allow
   ordering. Only what happens after "Always Allow" changes.

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
| `bash-grant-shapes.test.ts` (new) | `npm run build*` does NOT grant `npm run build && rm -rf /`; no wide rung for chained commands; no wide rung for `rm`/`sudo`; a wide rung for `git push` carrying both table and operator exclusions; the four force-push-to-master refspec forms (`origin master`, `--force origin master`, `HEAD:master`, `+master`) are all vetoed while `feat/…` is not; subcommand-vs-flag-vs-path detection |
| `permission-store.test.ts` | Identity is the quad; legacy rules normalize to `match: 'exact'` on read; `except` set-equality in dedupe and `remove` |
| `native-session-host.test.ts` | `revokeRule` removes only the matching quad from `rememberedFor` |
| `describe-rule.test.ts` | Three widths; the exclusion clause; no `*` in any returned string |
| `permissions-section.test.tsx` | A wide rule's row copy; `broadNote` fires only on `'tool-wide'` |
| `deny-list-copy.test.ts` | Classifier goes through `ruleMatches` and still names the same family |
| `tool-card-full-auto-stop.test.tsx`, `permission-confirm-card.test.tsx` | Updated to whatever copy the compare rounds settle — they pin it verbatim, so they change last |

An ast-grep rule is the right home for "no Bash pattern is stored without a `match`
field" if it turns out to be expressible; otherwise the store test carries it.

## 12. Out of scope

- **File-tool grant widening.** `Write`/`Edit` subjects are paths and have the same
  literal-only narrowness, but a directory-scoped file grant is its own design with its
  own blast radius. §7's normalization makes their existing grants honest, and that is
  all this item does for them.
- **A whole-program third rung** (D2). A user who wants all of `git` goes to Settings.
- **Editing a rule in Settings.** The screen lists and revokes; it does not author.
- **Android.** No native runtime there yet (M8).

## 13. Traps carried in from the handoff

- Never canonicalize `ctx.cwd`; removal keys by SLUG; `revokeRule`/`revokeProject` are the
  only revocation entry points. `.claude/rules/native-permissions.md`.
- `cwdToProjectSlug` is being renamed by the in-flight `slug-repair` worktrees. Whoever
  lands second updates the other.
- `verify.sh` is Linux-only and master is red on Windows from unrelated work
  (`harness-tools-core.test.ts > Bash > persistent_env`). Attribute before assuming.
- `tests/helpers/guard-scope.ts` does not scan `components/<subdir>/`.
- Five-surface IPC parity if any channel is added — none is expected here; `grantScope`
  rides the existing `respondToPermission` payload.
