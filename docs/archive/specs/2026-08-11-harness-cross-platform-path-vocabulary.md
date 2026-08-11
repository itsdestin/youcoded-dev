---
status: shipped
created: 2026-08-11
type: spec
---

# Harness tools: one path vocabulary across platforms

**Why now:** `master` has been RED on Windows and macOS since `eba51705` (2026-08-10). Four
distinct test cases fail across six platform/case combinations. Ubuntu is green, which is why
`scripts/verify.sh` — which runs on a Linux box — reported nothing. Two PRs (#289, #290) were
merged over the red check on 2026-08-11.

The four failures are **two independent defects**, both of the same family: a harness tool emits
a path in a different vocabulary than the one the model was given. Neither is a test defect.
`ROADMAP.md` (Bugs, added 2026-08-11) attributes the cluster to the `__YC_CWD__` sentinel
readback; that hypothesis is **disproven** below — the sentinel works correctly on all three
platforms.

## The failures

| Test | File | Fails on |
|---|---|---|
| `Bash always states the cwd and exit code` | `harness-tools-core.test.ts:468` | macOS |
| `Bash reports the tracked cwd after a cd, so the model never has to guess` | `harness-tools-core.test.ts:491` | Windows, macOS |
| `ANSI stripping does not disturb the cwd sentinel` | `harness-tools-core.test.ts:521` | Windows, macOS |
| `Grep returns workspace-relative paths for targets inside the workspace` | `harness-tool-bounds.test.ts:53` | Windows |

The first three are Defect 1; the fourth is Defect 2.

---

## Defect 1 — Bash reports a cwd spelling the model was never given

### Mechanism

`bash.ts:499` decides whether the shell moved:

```
if (reported && path.resolve(reported) !== path.resolve(startCwd))
```

`reported` comes from the shell's own `pwd`, which prints the **physical** path. `path.resolve`
neither follows symlinks nor expands Windows 8.3 short names, so two spellings of one directory
compare as a change. `reportedCwd` is then set to the canonical form (`bash.ts:501`) and flows
into both `ctx.setShellCwd()` and the `[cwd: …]` metadata line (`bash.ts:573`).

- **macOS:** `os.tmpdir()` is `/var/folders/…`, a symlink to `/private/var/folders/…`. This
  fires on every call — including `harness-tools-core.test.ts:468`, which contains no `cd` at all.
- **Windows:** `os.tmpdir()` returns the 8.3 short name `C:\Users\RUNNER~1\…` while the shell
  reports `runneradmin`.

### Evidence

Reproduced on Linux by modelling the macOS symlink shape (temp dir + symlink to it, `ctx.cwd`
set to the symlink):

```
ctx.cwd                        : /tmp/link-1786465895069
realpath                       : /tmp/real-bWg15i
Bash metadata line             : [cwd: /tmp/real-bWg15i · exit 0]
after `cd sub`, setShellCwd got: /tmp/real-bWg15i/sub
```

This is **not** a test-only artifact. It reproduces on every platform whenever the workspace root
is reached through a symlink, which on macOS is any session under `/tmp` and on Linux is any
symlinked project directory.

### Why it matters

The metadata line exists specifically so the model knows where Bash sits relative to the file
tools' workspace root (`bash.ts:568-573` records the reasoning — four of five reviewing models
asked for it). On a symlinked root it now names that root in a vocabulary the model was never
given, which is the exact confusion the line was added to remove. It self-stabilizes after one
call (the canonical form is persisted, so later calls compare equal), so it is a first-call wart
rather than ongoing churn.

Note that the canonicalization this needs **already exists one layer down**: `isInside()`
(`bash.ts:164`) canonicalizes both sides via `realpathSync.native`, added 2026-07-19 after this
same 8.3 mismatch made the scope guard revert every `cd` on Windows. Its comment describes the
failure verbatim. It was simply never applied to the *reported* value.

### Decision

Compare canonically, then **rebase the result into `ctx.cwd`'s vocabulary** before storing it:

```
rel = path.relative(real(ctx.cwd), real(reported))
reportedCwd = rel ? path.join(ctx.cwd, rel) : ctx.cwd
```

Lift the `real()` helper out of `isInside()` (`bash.ts:165`) to module scope so there is one
canonicalization path, not two.

**Ordering is load-bearing.** The containment check must stay ahead of the rebase. Reversed, an
escape outside the root yields a `..`-prefixed relative path and `path.join` rebases it back
inside — silently converting the scope guard into a no-op. The `else` branch keeps printing the
**raw** `reported` path in its notice; "`/private/var/other` is outside the workspace" is the
truthful thing to say there, and rebasing an outside path is meaningless.

### Rejected alternative — canonicalize `ctx.cwd` at session start

Simpler on its face: make the root canonical once, and `pwd` matches by construction. **Rejected.**
The permission store is keyed by cwd (`permission-store.ts:32` `rulesFor(cwd)`,
`native-session-host.ts:398` `remember(cwd, rule)`). Changing the root's spelling changes that key,
so every remembered "Always allow" a user has already granted stops matching — silently, with no
error and no migration. That is a worse bug than the one being fixed, and it lands on the exact
surface the M5 permissions-management UI is about to be built against.

---

## Defect 2 — Grep and Glob disagree on the path separator on Windows

### Mechanism

`glob.ts:232` normalizes explicitly (`base.split(path.sep).join('/')`). `grep.ts` has no separator
handling anywhere — it prints ripgrep's stdout verbatim, and rg uses the platform separator. On
Windows: Glob emits `src/a.ts`, Grep emits `src\a.ts`.

### Evidence

The sibling test is the proof. `Glob returns the same shape for the same file`
(`harness-tool-bounds.test.ts:65`) asserts `toContain('src/a.ts')` and **passes on Windows**, while
the Grep case in the same `describe` block ("Grep and Glob agree on path format") fails. Glob is
correct; Grep is the outlier. The CI assertion reads `expected 'src\a.ts' to be 'src/a.ts'`.

This pair has now had three rounds of "make Grep and Glob agree": absolute-vs-relative
(2026-08-01), the `./` prefix and mixed `src\sub/a.ts` (2026-08-06), and now the separator. Each
round fixed a case and left the next one open, because each was reasoned about on Linux where the
separator question is invisible.

### Decision

Use ripgrep's `--path-separator=/`. **Do not hand-normalize rg's stdout** — in `content` mode a
line is `path:line:text` and the matched text can itself contain backslashes and colons, so string
surgery risks corrupting the match. `--path-separator` touches only printed paths.

Verified against the bundled binary (ripgrep 15.0.0, `@vscode/ripgrep`): the flag exists and is
accepted and inert on Linux (exit 0, `src/a.ts`).

Apply it **unconditionally**, and normalize Glob's external branch to match, so the contract is one
rule — *every harness tool emits forward slashes, on every platform, for every path* — rather than
a fourth case-by-case patch. Forward slashes are valid input to every Node path API and to Git Bash
on Windows, so nothing the model feeds back breaks.

### The trap this must avoid

Grep and Glob currently **agree** in the external-directory case: Glob does `path.join(root, r)`
(`glob.ts:229`) → backslashes on Windows, and Grep passes an absolute target that rg echoes back →
also backslashes. Adding `--path-separator=/` alone fixes the in-workspace case and **breaks the
external case**, which no test covers — the `describe` block has a Grep-relative test, a
Glob-relative test, and a Glob-external test, but no Grep-external test. It would go silently
wrong. That is why `glob.ts:229` must be normalized in the same change.

### Rejected alternative — apply the flag only for in-workspace targets

Smallest diff, changes only what is broken. **Rejected:** it leaves Grep itself with two
conventions depending on target, which is a rule nobody will remember and the next reviewer will
have to rediscover.

---

## Implementation

### `src/main/harness/tools/bash.ts`

1. Lift `real()` (currently nested at `:165`) to module scope; keep its `.native`-first comment,
   which documents why the order matters.
2. Replace the lexical comparison at `:499` with a canonical one.
3. Rebase inside the `isInside()` true branch at `:501` per the formula above.
4. Leave the `else` branch's notice untouched — it must keep naming the raw reported path.
5. WHY comment at the rebase site: the model is told one workspace root; Bash must report inside
   that vocabulary or the metadata line defeats its own purpose.

### `src/main/harness/tools/guards.ts`

Add and export `toPosix(p: string): string` — `p.replace(/\\/g, '/')`, matching the convention
already used in `theme-watcher.ts:34`, `transcript-watcher.ts:26`, and elsewhere. `guards.ts` is
the right home: both `grep.ts:8` and `glob.ts:7` already import from it.

**Do not reuse `canonicalize()` (`guards.ts:25`) for this.** It forward-slashes *and lowercases the
whole path on Windows* — correct for the sensitive-path comparison sets it feeds, and silently
destructive for anything displayed, since it would lowercase every path the model sees. The two
must stay separate functions with that distinction stated in a comment.

### `src/main/harness/tools/grep.ts`

Add `--path-separator=/` to `rgArgs` at construction (`:246`) so it applies to every output mode.

### `src/main/harness/tools/glob.ts`

Wrap the external-directory return at `:229` in `toPosix()`. Optionally re-express `:232`'s
existing `split(path.sep).join('/')` through the same helper so there is one normalizer.

### `docs/` and rules

- Update the `ROADMAP.md` Bugs entry to replace the sentinel hypothesis and point here.
- `.claude/rules/native-runtime.md` documents the sentinel as load-bearing; add the path-vocabulary
  invariant alongside it (one rule: harness tools emit forward slashes; Bash reports its cwd in the
  workspace root's spelling).

---

## Tests

Two layers, because **every integration-level guard for this is vacuous on Linux**.

### Layer 1 — unit tests with real teeth locally

These are what `verify.sh` will actually exercise, and they must fail on Linux if the code is wrong:

- `toPosix()` fed a literal `'src\\a.ts'` returns `'src/a.ts'`; fed `'src/a.ts'` it is a no-op.
- `toPosix()` is **not** `canonicalize()`: fed `'SRC/A.ts'` it preserves case. Pin this — it is the
  trap above.
- The rebase logic fed a canonical/non-canonical pair returns the non-canonical spelling. Extract
  the rebase into a testable function rather than leaving it inline in the stream handler.
- The existing symlink reproduction, promoted into a real test: `ctx.cwd` set to a symlink pointing
  at a real temp dir, assert the metadata line and `setShellCwd` both report the **symlink**
  spelling. This one runs on Linux and has teeth on all three platforms, and is the closest thing
  to a local proof of Defect 1.

### Layer 2 — the existing four cases

No changes to `harness-tools-core.test.ts:468`, `:491`, `:521` or `harness-tool-bounds.test.ts:53`.
They are correct as written and must go green unmodified. Treat any urge to relax them as a signal
the fix is wrong.

`harness-tool-bounds.test.ts:79` (`Glob returns absolute paths when the search root is outside the
workspace`) asserts `path.join(dir, 'src', 'a.ts')` and **currently passes**. Its expectation must
change to the forward-slash form. Flag this in the PR body: the diff will look like a
currently-green test is being loosened, when it is being brought under the widened contract.

Add the missing **Grep-external** case as its counterpart, so the agreement that was previously
untested is pinned in both directions.

---

## Consequences and risks

- **No downstream breakage from Defect 1's fix.** `shellCwd` is read in exactly two places outside
  `bash.ts` — `harness-session.ts:1621` and `:1623`, which store it and hand it back. No guard, no
  permission check, no UI reads it. Verified across all of `src/`.
- **One visible discrepancy is introduced deliberately.** A user who runs `pwd` themselves sees
  `/private/var/…` in the body while the metadata line says `/var/…` — one directory, two spellings,
  in one result. Accepted: the metadata line's job is to locate Bash *relative to the file tools*,
  which only works if both use one root.
- **Two extra `realpathSync` calls** on any call where the spellings differ — on a symlinked root
  that is every call, versus only on a real `cd` today. Microseconds. The root's canonical form is
  constant per session and can be memoized if it ever surfaces.
- **Degrades safely.** If the directory disappears mid-session, `real()` already falls through to
  `path.resolve` and behavior reverts to exactly what ships today.
- **Case-insensitive filesystems** are unaffected: `real()` returns the on-disk canonical case and
  the rebase re-joins onto `ctx.cwd`, preserving the user's spelling.
- **The integration proof exists only on Windows and macOS CI.** There is no local evidence
  available for the separator change beyond the unit tests. Do not call this fixed on a green
  `verify.sh`.

## Done when

1. All four originally-failing cases pass **unmodified** on all three CI legs.
2. The Layer 1 unit tests pass on Linux and would fail against the pre-fix code.
3. `desktop-ci.yml`'s full matrix (`ubuntu`, `windows`, `macos` — `desktop-ci.yml:32`) is green on
   `master`, restoring the check's signal value.
4. The `ROADMAP.md` entry is closed with the corrected mechanism recorded, and the
   `native-runtime.md` rule carries the path-vocabulary invariant.

## Out of scope

- Any other cross-platform difference in the harness tools not covered by the four failing cases.
- The `Bash always states the cwd` Windows/macOS asymmetry — the no-`cd` case passes on Windows but
  fails on macOS, implying `pwd -W` matched the short form at startup and returned the long form
  after an explicit `cd`. Most likely MSYS canonicalizing on `cd` while bash's startup `$PWD`
  inherits the Win32 cwd as-set. **Unverified**, and it does not change the fix — both spellings
  rebase identically.
- Changing `ctx.cwd` itself, for the permission-key reason recorded above.
