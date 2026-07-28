# Code intelligence: Serena (symbols) and ast-grep (executable invariants)

Two tools that replace expensive LLM reading with cheap deterministic queries.

**Why they exist here:** `ipc-handlers.ts` is 3,809 lines and `App.tsx` is 3,544, so a
single whole-file read costs roughly **10x the entire always-on `CLAUDE.md`**, and a
conventional IPC-parity sweep (preload + remote-shim + ipc-handlers + `SessionService.kt`
+ the parity test) runs ~90k tokens. The workspace has 871 TypeScript and 88 Kotlin
source files. Reading is the dominant cost of every task; injected context is a rounding
error next to it.

The escalation ladder — stop as soon as the question is answered:

| Layer | Answers | Tool | Scope |
|---|---|---|---|
| Graph | "who calls / implements / defines this?" | **Serena** (`find_symbol`, `find_referencing_symbols`) | **`youcoded/` TypeScript only** — not Kotlin, not other sub-repos |
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
agent can fetch one function body instead of a 3,809-line file, and get resolved call
graphs instead of grep hits that include comments and strings.

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

Indexing 959 files takes ~12 seconds and produces a ~43 MB cache.

**TypeScript only — do not add `--language kotlin` here.** It is not an oversight; see
below.

**Restart Claude Code afterwards** — MCP servers load at startup. You'll get a permission
prompt for the new server on first launch.

### Three things that will bite you

1. **Point it at `youcoded/`, never at the workspace root.** Serena honors `.gitignore`,
   and the workspace `.gitignore` excludes *every* sub-repo (`youcoded/`,
   `wecoded-themes/`, …). Aimed at `/youcoded-dev` it indexes essentially nothing while
   appearing to succeed. Reach other repos at runtime with `activate_project`.
   <!-- verify: {"path": ".gitignore", "contains": "youcoded/"} -->

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
| `get_diagnostics_for_file` | Type errors for one file without a full `tsc` run |
| `rename_symbol` / `safe_delete_symbol` | Reference-aware refactors — they update all call sites atomically |
| `replace_in_files` | Bulk edits; `dry_run: true` first returns per-occurrence diffs you can select |

`find_referencing_symbols` is the one that changes how the workspace works. The
`never assert a negative from a single search` rule exists because grep cannot establish
its own completeness — a language server can. "Is there an Android mirror of this",
"is this the only call site", and "is this dead" become answerable instead of inferable.

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

Registering any MCP server adds its tool descriptions to **every** request. Net win on
long sessions over large subsystems; net loss on one-line lookups. Use `rg` for those.
The published token-savings figures in this space are one unreplicated study plus vendor
claims — the durable argument for Serena here is **correctness** (resolved references
beat pattern matches), not the token number.

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
  `project.local.yml`, so only `project.yml` would ever be tracked. Whether to commit it
  to the `youcoded` sub-repo is an open call — it's the same shape as the
  `.claude/rules/` already tracked there.

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
