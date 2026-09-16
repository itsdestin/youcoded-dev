# Code intelligence: branch-local search and executable invariants

Search the isolated worktree you are changing. Use its absolute paths with file tools
and run shell commands from that worktree, not from the shared checkout. This keeps
orientation, edits, and verification about the same version of the code.

## Choose the smallest query that answers the question

| Question | Tool | Scope / limitation |
|---|---|---|
| "Where is this exact name, IPC channel, or CSS class?" | Grep (`literal: true`) or `rg -n -F 'exact text' <repo>` | Search each relevant repo explicitly before narrowing; includes comments and strings |
| "Where does this code shape appear?" | `ast-grep` | Use the right language (TS, TSX, or Kotlin) and worktree root |
| "What does this function do?" | Focused Read (`offset` + `limit`) after locating it | Read the body and relevant surrounding definitions, not the whole large file |
| "Is this dead / typed / in parity?" | `npm run knip`, `tsc --noEmit`, `ipc-channels.test.ts` | Prefer a verdict over interpreting search hits; inspect warnings and tool scope |

Stop when the question is answered. Whole-file reads are for files you need to edit,
not initial orientation; even before editing large files, prefer focused ranges.
Delegate broad sweeps to a read-only search subagent, requesting paths and evidence.

## Scope and reference searches

A text search is not a resolved call graph. For "who calls this?", search the symbol
name and imports repo-wide, inspect candidate calls, then follow aliases and re-exports.
A zero-hit query alone does not prove dead code or an absent platform implementation.
Use the appropriate verdict tool when available.

The workspace ignores its component repos, so a workspace-root query is not a complete
cross-repo search. Search the returned app worktree explicitly (both `desktop/` and
`app/` for platform parity), and each other relevant repo. Default ignores and hidden
file filtering also matter: use explicit paths or deliberate `--hidden`/`--no-ignore`
scope when the target requires it, not an indiscriminate scan of caches and dependencies.
Quote shell patterns and every glob.

For example, from the app worktree:

```bash
rg -n -F 'ConversationRecord' .
rg -n -F 'artifacts:read' desktop app
```

Use the resulting line numbers for a focused Read. Treat hits as candidates to inspect,
not a count of resolved references; distinguish comments, definitions, and real calls.

## Verification reads the branch

Run `bash scripts/verify.sh <app-worktree>` from the workspace worktree for desktop
verification: TypeScript, related tests plus source-scanning guards, knip, ESLint, and
ast-grep. For a specific question, run the corresponding verdict tool directly from
`youcoded/desktop/`. Read its findings as well as the exit code; knip's configured
warning categories are not all release gates.

Desktop verification does not replace Android or worker tests. Follow
`docs/build-and-release.md` and the subsystem's MAP guard when those surfaces change.
<!-- verify: {"path": "scripts/verify.sh"} -->
<!-- verify: {"path": "youcoded/desktop/tests/ipc-channels.test.ts"} -->

---

## ast-grep — invariants that execute

Several invariants in `.claude/rules/` are prose an agent has to read and honor:
*"always use the `endTurn()` helper"*, *"`SPINNER_RE` is `^`-anchored — DO NOT remove
it"*. Prose requires the assistant to notice and follow it. ast-grep converts the
mechanically-checkable subset into a scan that fails.

This is the tier between a unit test (best, but many invariants aren't unit-testable) and
a sentence in a rule file (worst).

### Run it

```bash
bash scripts/ast-grep/check.sh
```

Optional faster binary: `sudo pacman -S ast-grep`. Without it the script falls back to
`npx --package @ast-grep/cli`, which works but re-resolves on every call.

### Why it scans in two directions

The script asserts **both** that no rule fires on real source *and* that every rule fires
on a deliberate violation fixture in `scripts/ast-grep/fixtures/`.

The second half is the important half. A rule that silently stops matching is
indistinguishable from a rule that passes — which is exactly how this workspace lost the
worktree reporting in its `SessionStart` hook: the `find` matched nothing for weeks and
printed no section, so the absence looked like an empty result. Fixtures make a dead rule
fail loudly.

Verified 2026-07-28: 3/3 rules fire on fixtures, 0 fire on `youcoded/desktop/src`, and
introducing a typo into one rule's constraint correctly fails the fixture half.

### Example rules

| Rule | Invariant |
|---|---|
| `toolcalls-never-cleared` | The `toolCalls` Map is never `.clear()`ed — ToolCards render earlier turns' results |
| `spinner-re-anchored` | `SPINNER_RE` keeps its leading `^`, else bullets and echoed prompts false-match |
| `no-seenuuids-on-tool-use` | No `seenUuids` guard inside the `TRANSCRIPT_TOOL_USE` case |

The third one is the instructive case. `seenUuids` **is** legitimate and load-bearing on
the `TRANSCRIPT_USER_MESSAGE` path (replay/live dedup). A naive "ban `seenUuids`" rule
would false-positive on correct code; the rule is scoped with `inside: { kind: switch_case
… }` so it fires only on the prohibited path. The fixture carries both usages so a false
positive fails as loudly as a false negative.

### Adding a rule

1. Write `scripts/ast-grep/rules/<id>.yml`. Set `files:` to match **both** the real path
   and `**/fixtures/**/<name>.ts`, so one rule covers source and fixture.
2. Add the violation to the matching fixture in `scripts/ast-grep/fixtures/`.
3. Bump `EXPECTED_VIOLATIONS` in `check.sh`.
4. Run `bash scripts/ast-grep/check.sh` — it must report `N/N` on fixtures and `0` on source.
5. Point the source rule in `.claude/rules/` at it, and delete the prose the scan now enforces.

Step 5 is the point of the exercise. Every invariant promoted to a scan is one less
sentence an agent has to read and choose to honor.

### Where it runs

The workspace CI runs the invariant scan; desktop branch verification also invokes it
through `scripts/verify.sh`. Rules and fixtures remain workspace-owned under `scripts/ast-grep/`.
The table above illustrates rule shapes, not a complete inventory: inspect that directory
and `EXPECTED_VIOLATIONS` in `check.sh` for the current fixture expectations.
<!-- verify: {"path": ".github/workflows/workspace-ci.yml", "contains": "scripts/ast-grep/check.sh"} -->
