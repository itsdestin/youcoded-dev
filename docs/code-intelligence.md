# Code intelligence: Serena (symbols) and ast-grep (executable invariants)

Two tools that replace expensive LLM reading with cheap deterministic queries.

**Why they exist here:** `ipc-handlers.ts` is 3,906 lines and `App.tsx` is 3,679, so a
single whole-file read costs roughly **10x the entire always-on `CLAUDE.md`**, and a
conventional IPC-parity sweep (preload + remote-shim + ipc-handlers + `SessionService.kt`
+ the parity test) runs ~90k tokens. The `youcoded` repo has 938 tracked TypeScript/TSX
and 84 Kotlin files. Reading is the dominant cost of every task; injected context is a
rounding error next to it.
<!-- verify: {"path": "youcoded/desktop/src/main/ipc-handlers.ts"} -->

The escalation ladder — stop as soon as the question is answered:

| Layer | Answers | Tool | Scope |
|---|---|---|---|
| Graph | "who calls / implements / defines this?" | **Serena** (`find_symbol`, `find_referencing_symbols`) | **`youcoded/` TypeScript on the *main checkout* only** — not Kotlin, not other sub-repos, **not your worktree** |
| Structural | "where does this code *shape* appear?" | **ast-grep** | Any repo, TS **and** Kotlin |
| Lexical | "where does this exact text appear?" | **`rg`** | Everything |
| Verdict | "is this dead / typed / in parity?" | `npm run knip`, `tsc --noEmit`, `ipc-channels.test.ts` | Definitive — prefer over all of the above |

Read the Scope column before trusting a negative result. Serena's reach is narrower than
it looks, and it reports "no references" the same way whether it searched and found
nothing or never looked — see [Where it stops](#where-it-stops--verified-2026-07-28).

Whole-file reads are for files you are about to **edit**, not files you are trying to
understand.

---

## Serena

An MCP server that runs real language servers (LSP) and exposes symbol-level tools, so an
agent can fetch one function body instead of a 3,906-line file, and get resolved call
graphs instead of grep hits that include comments and strings.

### It answers about `master`, not your worktree — read this first

**This is the constraint that decides whether Serena is the right tool for what you are
about to do.** It went unnoticed for the first week and is the main reason the server sat
unused: 18 tool calls total, all on install day (2026-07-28), zero since.

The server is started once per session with `--project /home/destin/youcoded-dev/youcoded`
— **the main checkout**. It resolves every `relative_path` against that single root
(`project.py:230`: `abs_path = os.path.join(self.project_root, relative_path)`) and
rejects anything outside it (`is_path_in_project`, which logs *"not relative to the
project root and was therefore ignored"*).

But `CLAUDE.md` mandates worktrees for any non-trivial work. So in the common case:

- Your worktree's files are **unreachable** — Serena cannot be pointed at them.
- A query for `desktop/src/foo.ts` **silently returns master's copy**. It looks like a
  correct answer. It is not an answer about your branch.

**The division of labor that follows:**

| Question | Tree it's about | Tool |
|---|---|---|
| "What's the shape of this file?" / "Who calls this?" | the shipped codebase = `master` | **Serena** ✅ |
| "Does my branch typecheck / pass / have dead code?" | your worktree | **`bash scripts/verify.sh`** |
| "Did my branch change this function?" | your worktree | `git diff`, Read |

Orientation and reference-finding are questions *about the code that already exists* —
master is the right tree for them, so this is a real role, not a consolation prize.

**Serena is read-only here** (`read_only: true` in `youcoded/.serena/project.yml`,
enforced at `agent.py:1100` → `tool_set.without_editing_tools()`). That drops 11 of the
21 tools — the 7 file/symbol editors and the 4 memory writers — leaving 7 exposed:
`initial_instructions`, `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`,
`find_implementations`, `find_declaration`, `get_diagnostics_for_file`.

Read-only is deliberate and load-bearing: an edit tool aimed at `desktop/src/foo.ts`
during worktree work would have **written to the main checkout** while the session
believed it was editing the worktree — corrupting master and losing the edit. Reference-aware
refactors (`rename_symbol`, `safe_delete_symbol`) are the real casualty; to use them you
must be working *in the main checkout* and flip `read_only` back yourself.
<!-- verify: {"path": "youcoded/.serena/project.yml", "contains": "read_only: true"} -->

`get_diagnostics_for_file` is also master-only, so it cannot check your branch — but it
is still additive on master, because LSP diagnostics include tsserver hints (unused
locals and imports, unreachable code) that `tsc --noEmit` does not emit.

### Prerequisites

- **`uv` / `uvx`** — already installed (`uv 0.11.24`). Otherwise:
  `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **TypeScript needs nothing extra.**
- **Kotlin needs JDK 21 specifically, and is currently OFF.** See
  [Kotlin is disabled](#kotlin-is-disabled) — do not assume `.kt` files are indexed.

### Install (already done on this machine — this is the recipe for a new one)

```bash
cd /path/to/youcoded-dev

claude mcp add serena -s project -- \
  uvx --from git+https://github.com/oraios/serena serena start-mcp-server \
  --context claude-code --project /path/to/youcoded-dev/youcoded
```

That writes `.mcp.json` at the workspace root, which **is** committed (dev tooling is a
workspace artifact per `CLAUDE.md`).

Then create the project config and build the symbol index, non-interactively:

```bash
cd /path/to/youcoded-dev/youcoded
uvx --from git+https://github.com/oraios/serena serena project create \
  --language typescript --index
```

Indexing takes ~12 seconds and produces a ~42 MB cache under `youcoded/.serena/cache/`
(self-gitignored). A warm start reloads it in well under a second.

**TypeScript only — do not add `--language kotlin` here.** It is not an oversight; see
below.

**Restart Claude Code afterwards** — MCP servers load at startup. You'll get a permission
prompt for the new server on first launch.

### Three things that will bite you

1. **Point it at `youcoded/`, never at the workspace root.** Serena honors `.gitignore`,
   and the workspace `.gitignore` excludes *every* sub-repo (`youcoded/`,
   `wecoded-themes/`, …) **and `worktrees/`**. Aimed at `/youcoded-dev` it indexes
   essentially nothing while appearing to succeed. The other sub-repos are then
   unreachable for the whole session — this build has no `activate_project` (see
   [Where it stops](#where-it-stops--verified-2026-07-28)); use `rg`/`ast-grep` for them.
   <!-- verify: {"path": ".gitignore", "contains": "worktrees/"} -->

   Do **not** "fix" the worktree blind spot by aiming it at the workspace root with
   gitignore disabled: that indexes the main checkout *plus* every worktree, so each
   symbol returns one hit per tree and `find_referencing_symbols` inflates its counts
   ~8x. A wrong number is worse than a missing one.

2. **Use `--context claude-code`.** Older guides say `--context ide-assistant`; that
   context no longer exists. `uvx --from git+https://github.com/oraios/serena serena
   context list` prints the current set.

3. **`serena project index` alone is interactive** — it prompts for which language
   servers to enable and dies on EOF in a script. `project create --language … --index`
   is the non-interactive path.

### Kotlin is disabled

`.kt` files are **not indexed**. `youcoded/.serena/project.yml` lists `typescript` only.

Why it is off rather than broken-and-ignored: JetBrains' `kotlin-lsp` cancels its
`initialize` request (`-32800`) for this workspace, and **Serena treats any
language-server failure as fatal**. A failing Kotlin server tears down the healthy
TypeScript one and disables *every* Serena tool. Half-working is not an option here; it is
all or nothing.
<!-- verify: {"path": "youcoded/.serena/project.yml", "contains": "language_servers"} -->

**The JDK is not the cause — do not chase it.** An earlier revision of this doc blamed
JDK 26 and prescribed installing JDK 17/21. That was wrong, and it cost a pointless
package install on 2026-07-28. `kotlin-lsp.sh` hard-codes
`JAVA_BIN="$DIR/jre/bin/java"` and runs on its own bundled JetBrains Runtime **21.0.8**,
ignoring `JAVA_HOME` and `PATH`. Confirmed by installing `jdk21-openjdk` and re-running
the index with both `JAVA_HOME` and `PATH` forced at it — byte-identical `-32800`.

What is actually known: the binary is healthy — running `kotlin-lsp.sh` by hand starts it
cleanly and it waits on stdin — so the cancellation happens while it processes
`initialize` against *this* workspace, most likely the root Gradle/Android model import
(`settings.gradle.kts` + the Android plugin), not the Kotlin sources.

Do not re-add `- kotlin` speculatively. Reproduce a green
`serena project index` first; a failure disables every Serena tool for the whole session.

The practical consequence: **the cross-platform parity question — "is there an Android
mirror of this?" — is not a Serena question, and is not blocked on making it one.**
Answer it with `desktop/tests/ipc-channels.test.ts` (a verdict over all three surfaces),
`ast-grep` (which supports Kotlin), or `rg`. That path is better than a Kotlin LSP would
have been anyway.

### Using it

| Tool | Use for |
|---|---|
| `get_symbols_overview` | The shape of an unfamiliar file, without reading it |
| `find_symbol` | One function/class body by name path |
| `find_referencing_symbols` | **"Who calls this?"** — resolved, no comment/string noise |
| `find_implementations` / `find_declaration` | Interface → implementors; call site → definition |
| `get_diagnostics_for_file` | Master-only type errors + tsserver hints (unused locals/imports) for one file |
| ~~`rename_symbol` / `safe_delete_symbol` / `replace_in_files`~~ | **Removed** — `read_only: true`. They would have written to the main checkout during worktree work |

`find_referencing_symbols` is the one that changes how the workspace works. The
`never assert a negative from a single search` rule exists because grep cannot establish
its own completeness — a language server can. "Is this the only call site" and "is this
dead" become answerable instead of inferable **for TypeScript on master**. (Android-mirror
questions are *not* in scope — Kotlin is unindexed; that's `ipc-channels.test.ts`.)

### Where it stops — verified 2026-07-28

Serena answers **typed TypeScript symbol** questions. It does not answer the other three,
and each boundary has produced a wrong answer here:

1. **Not symbol-shaped → Serena is blind.** `ipcMain.handle('foo', …)` has no symbol
   named `foo`, just a string argument. `find_symbol` on `registerIpcHandlers` with
   `depth=1` returns ~250 children, most of them anonymous `ipcMain.handle() callback`
   — a large token bill and no channel names. For IPC channels use `ipc-channels.test.ts`
   (a verdict) or `rg` on the literal string. Never `depth=1` on a god-function.

2. **Only the active project.** This build exposes **no `activate_project` and no
   `search_for_pattern`** — earlier revisions of this doc listed both; neither exists.
   Serena is locked to `youcoded/` for the whole session. `wecoded-marketplace/`,
   `wecoded-themes/`, and `youcoded-core/` are reachable only by `rg`/`ast-grep`.

3. **Only files inside a TypeScript program.** A file no `tsconfig.json` includes is
   invisible, and Serena reports zero references for it *without saying it did not look*.
   `desktop/tests/` was in exactly this state until `desktop/tests/tsconfig.json` was
   added — `find_referencing_symbols('ErrorState')` returned only the barrel re-export
   while three real call sites sat in `tests/ui-primitives.test.tsx`.
   <!-- verify: {"path": "youcoded/desktop/tests/tsconfig.json", "contains": "include"} -->

Boundary 3 is the dangerous one: it is a **silent false negative** in the exact shape the
`never assert a negative from a single search` rule exists to catch. Before concluding
"dead" or "no mirror", confirm the file is in a program — or use `npm run knip`, which
reads its own config and does not share this blind spot.

### Honest cost

Serena's tools are **deferred** in this harness — only the bare names appear in the
session's tool list; the JSONSchema loads on demand via `ToolSearch`. An earlier revision
of this section said the descriptions cost tokens on *every* request and used that to
argue against reaching for the server; that overstated the standing cost. Trimming to 7
tools (`read_only` + `excluded_tools`) cuts the name-list noise further.

The real cost is a **`ToolSearch` round-trip before the first call**, which is why `rg`
still wins one-line lookups. The published token-savings figures in this space are one
unreplicated study plus vendor claims — the durable argument for Serena here is
**correctness** (resolved references beat pattern matches), not the token number.

### Maintenance

- The index is a cache; it goes stale as code changes. Re-run `serena project index` after
  large refactors. Serena falls back to live LSP for anything uncached.
- **`youcoded/desktop/tests/tsconfig.json` is load-bearing for search correctness, not for
  the build.** It is what puts the test tree into a TypeScript program so reference search
  can see it. Deleting it does not fail any test or break any build — it silently
  reintroduces the false negative described above. Any new top-level source directory
  outside `src/**` needs the same treatment.
  <!-- verify: {"path": "youcoded/desktop/tests/tsconfig.json", "contains": "language-server"} -->
- A future `tsc --noEmit` CI gate must keep using `-p tsconfig.json` (the build config).
  The tests project carries 44 pre-existing type errors and is not gated.
- `youcoded/.serena/` self-manages a `.gitignore` covering `cache/` and
  `project.local.yml`. **`project.yml` is tracked in the `youcoded` sub-repo**
  (`git ls-files .serena` → `.serena/.gitignore`, `.serena/project.yml`), so changes to
  `read_only` / `excluded_tools` / `language_servers` are a sub-repo PR, not a local tweak.
  A side effect worth knowing: because it's tracked, every worktree inherits a
  `.serena/project.yml` it will never use — the running server is pinned to the main
  checkout regardless.
- **Config changes need a Claude Code restart.** `read_only` and `excluded_tools` are read
  when the MCP server starts, which is once per session.

---

## ast-grep — invariants that execute

Several invariants in `.claude/rules/` are prose an agent has to read and honor:
*"always use the `endTurn()` helper"*, *"`SPINNER_RE` is `^`-anchored — DO NOT remove
it"*. Prose is the weakest available guard, and instruction-file edits are the one harness
change measured to make agents *worse*. ast-grep converts the mechanically-checkable
subset into a scan that fails.

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

### Current rules

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

### Not yet done

The scan is not wired into CI. It currently lives in the workspace repo (`scripts/` is the
sanctioned home for dev tooling); moving the rules into `youcoded/` and gating
`desktop-ci.yml` on them would make the invariants binding on every PR rather than
advisory. That's a sub-repo change and a separate decision.
