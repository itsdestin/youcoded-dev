---
status: shipped
created: 2026-08-11
type: plan
spec: docs/active/specs/2026-08-11-harness-cross-platform-path-vocabulary.md
---

# Harness Cross-Platform Path Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every native harness tool emit one path vocabulary on every platform, so the four tests that have kept `master` red on Windows and macOS since `eba51705` pass **unmodified**.

**Architecture:** Two independent defects, both "a tool emits a path in a vocabulary the model was never given." Defect 1: `bash.ts` compares the shell's reported cwd against `ctx.cwd` lexically, so two spellings of one directory (macOS `/var`→`/private/var`, Windows 8.3 `RUNNER~1`→`runneradmin`) read as a change and the canonical form leaks into the `[cwd: …]` metadata line — fixed by rebasing the reported path back into `ctx.cwd`'s spelling. Defect 2: Glob normalizes separators and Grep prints ripgrep's stdout verbatim, so Windows gets `src/a.ts` from one and `src\a.ts` from the other — fixed by giving rg `--path-separator=/` and normalizing Glob's one remaining unnormalized branch, so the contract becomes *forward slashes everywhere*.

**Tech Stack:** TypeScript, Node `fs`/`path`, vitest, ripgrep 15.0.0 via `@vscode/ripgrep`.

## Global Constraints

- **The four failing tests are NOT to be modified.** `harness-tools-core.test.ts:468`, `:491`, `:521` and `harness-tool-bounds.test.ts:53` are correct as written. If a change requires relaxing them, the change is wrong. See "The trap in the same file" below.
- **Every user-visible path the harness emits uses forward slashes, on every platform.** One rule, no per-case exceptions.
- **Bash reports its cwd in the workspace root's spelling**, never the physical/canonical one.
- **`ctx.cwd` itself is never canonicalized.** The permission store is keyed by cwd (`permission-store.ts:32` `rulesFor(cwd)`, `native-session-host.ts:398` `remember(cwd, rule)`); changing its spelling silently orphans every remembered "Always allow".
- **Annotate every non-trivial edit with a WHY comment** (workspace `CLAUDE.md`). Destin is a non-developer and reads comments to understand changes.
- **Never reuse `canonicalize()` (`guards.ts:25`) for output.** It lowercases the whole path on win32 — correct for the sensitive-path sets it feeds, destructive for anything read back.
- Verification command for the whole checkout: `bash scripts/verify.sh <worktree-path>` from the workspace root. It covers `youcoded/desktop` only and runs on Linux, so **a green run is not evidence about Windows or macOS**.

### The trap in the same file

`harness-tools-core.test.ts:580` already defines a `canon()` helper that realpaths both sides before comparing, and the whole `scoped cwd persistence` block uses it — which is precisely why those tests pass on all three platforms while the four failing ones, written with a bare `path.join(dir, …)`, do not.

Adding `canon()` to the four failing tests would turn CI green in about five minutes and is **the wrong fix**. It would leave the product behavior untouched: the model still gets told one workspace root by the file tools and a different spelling by Bash. The spec's decision is to fix the product so the tests pass as written. Expect a reviewer to suggest `canon()`; the answer is this paragraph.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `desktop/src/main/harness/tools/guards.ts` | Modify | Gains `toPosix()` — the single output-path normalizer, deliberately distinct from `canonicalize()` |
| `desktop/src/main/harness/tools/grep.ts` | Modify (`:246`) | Hands ripgrep `--path-separator /` so rg emits forward slashes on every platform |
| `desktop/src/main/harness/tools/glob.ts` | Modify (`:229`) | Normalizes its external-directory branch through `toPosix()` |
| `desktop/src/main/harness/tools/bash.ts` | Modify (`:162-187`, `:498-511`) | `realPath()` lifted to module scope; `isInside()` replaced by `rebaseReportedCwd()`; call site rewired |
| `desktop/tests/harness-tool-guards.test.ts` | Modify | Unit tests for `toPosix`, incl. the not-`canonicalize()` pin |
| `desktop/tests/harness-tool-bounds.test.ts` | Modify (`:70-83`) | Glob-external expectation updated; missing Grep-external counterpart added |
| `desktop/tests/harness-tools-core.test.ts` | Modify (append to `Bash` describe) | `rebaseReportedCwd` unit tests + the symlink integration test |
| `youcoded-dev/.claude/rules/native-runtime.md` | Modify | Records the path-vocabulary invariant next to the sentinel one |
| `youcoded-dev/ROADMAP.md` | Modify (`:64`) | Entry closed |
| `youcoded-dev/docs/active/specs/2026-08-11-…` | Modify | `status: shipped` |

---

## Task 0: Worktree setup

**Files:** none (environment only)

- [ ] **Step 1: Create the worktree**

Run from `/home/destin/youcoded-dev/youcoded`:

```bash
git fetch origin && git pull origin master
git worktree add worktrees/path-vocabulary -b fix/harness-path-vocabulary
```

- [ ] **Step 2: Confirm the four tests fail for the documented reason on Linux — they do not**

Run from `/home/destin/youcoded-dev/youcoded/worktrees/path-vocabulary/desktop`:

```bash
npx vitest run tests/harness-tools-core.test.ts tests/harness-tool-bounds.test.ts
```

Expected: **PASS**. This is the point — Linux cannot reproduce three of the four. The only local proof available is the symlink test added in Task 3. Record this baseline so the Task 3 test's failure is unambiguous.

---

## Task 1: `toPosix()` — the single output-path normalizer

**Files:**
- Modify: `desktop/src/main/harness/tools/guards.ts:33` (append after `resolveP`)
- Test: `desktop/tests/harness-tool-guards.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export function toPosix(p: string): string` — pure, no fs access, no resolution, no case folding. Task 2 imports it into `glob.ts`.

- [ ] **Step 1: Write the failing test**

Append to `desktop/tests/harness-tool-guards.test.ts`, and add `toPosix` to the existing import on line 2 so it reads `import { checkPathGuard, canonicalize, toPosix } from '../src/main/harness/tools/guards';`

```typescript
describe('toPosix', () => {
  it('converts Windows separators to forward slashes', () => {
    expect(toPosix('src\\a.ts')).toBe('src/a.ts');
  });

  it('leaves an already-posix path untouched', () => {
    expect(toPosix('src/a.ts')).toBe('src/a.ts');
  });

  it('normalizes an absolute Windows path', () => {
    expect(toPosix('C:\\Users\\Dev\\a.ts')).toBe('C:/Users/Dev/a.ts');
  });

  // Regression pin (2026-08-11): toPosix is NOT canonicalize(). canonicalize()
  // ALSO resolves against a cwd, collapses `..`, and lowercases the whole path
  // on win32 — correct for the sensitive-path comparison sets it feeds, and
  // silently destructive for anything a user or model reads back. Anyone
  // reaching for "the path normalizer" must land on the right one.
  it('does not resolve, absolutize, or case-fold — it is not canonicalize()', () => {
    expect(toPosix('SRC/README.md')).toBe('SRC/README.md');
    expect(toPosix('a\\..\\b')).toBe('a/../b');
    expect(toPosix('rel/path.ts')).not.toBe(canonicalize('rel/path.ts', CWD));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `desktop/`:

```bash
npx vitest run tests/harness-tool-guards.test.ts -t "toPosix"
```

Expected: FAIL — `toPosix is not a function` (or a TypeScript error that `toPosix` is not exported).

- [ ] **Step 3: Write the implementation**

Insert into `desktop/src/main/harness/tools/guards.ts` immediately after `resolveP` (currently ending at `:33`):

```typescript
/** Normalize a path for OUTPUT: backslashes → forward slashes, nothing else.
 *
 *  NOT `canonicalize()` above. That one also resolves against a cwd, collapses
 *  `..`, and LOWERCASES the whole path on win32 — right for the sensitive-path
 *  comparison sets it feeds, and destructive for anything a user or model reads
 *  back (every path the model sees would arrive lowercased on Windows).
 *
 *  Why this exists (2026-08-11): every harness tool must emit ONE path
 *  vocabulary on every platform. Glob normalized its separators; Grep printed
 *  ripgrep's stdout verbatim, so on Windows the same file came back as
 *  `src/a.ts` from one tool and `src\a.ts` from the other — the two are
 *  unpipeable between tools, which is the exact contract
 *  `harness-tool-bounds.test.ts` → "Grep and Glob agree on path format" pins. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/harness-tool-guards.test.ts -t "toPosix"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/harness/tools/guards.ts desktop/tests/harness-tool-guards.test.ts
git commit -m "feat(harness): add toPosix, the one output-path normalizer

Distinct from canonicalize(), which lowercases on win32 and is only safe
for the sensitive-path comparison sets. Pinned so the two can't be confused."
```

---

## Task 2: Forward slashes everywhere — Grep and Glob

**Files:**
- Modify: `desktop/src/main/harness/tools/grep.ts:246`
- Modify: `desktop/src/main/harness/tools/glob.ts:7` (import), `:229` (external branch), `:232` (reuse helper)
- Test: `desktop/tests/harness-tool-bounds.test.ts:70-83`

**Interfaces:**
- Consumes: `toPosix(p: string): string` from `./guards` (Task 1)
- Produces: nothing later tasks depend on

**This task is atomic — do not split it.** Adding `--path-separator` to Grep alone fixes the in-workspace case and *breaks* the external-directory case, where Grep and Glob currently agree (Glob does `path.join(root, r)` → backslashes on Windows; Grep echoes back an absolute target → also backslashes). Nothing tests that agreement today, so a split would ship a silent regression between commits.

- [ ] **Step 1: Write the failing tests**

Replace `desktop/tests/harness-tool-bounds.test.ts:70-83` (the whole `Glob returns absolute paths when the search root is outside the workspace, matching Grep` test) with the two tests below. Note the assertions test the **contract** (no backslashes, correct tail) rather than recomputing the implementation, so they cannot pass tautologically.

```typescript
  it('Glob returns absolute paths when the search root is outside the workspace, matching Grep', async () => {
    // Regression pin for Important 3: `base` (search-root-relative to cwd)
    // starts with '..' here since `dir` (the search root) is OUTSIDE the
    // workspace passed as ctx.cwd. The buggy rebase() returned the
    // search-root-relative string unchanged ("src/a.ts"), which reads as a
    // workspace file when it is not one.
    // Widened 2026-08-11: the absolute form is now forward-slashed too, so the
    // whole harness speaks one path vocabulary instead of two.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-workspace-'));
    try {
      const r = await GlobTool.execute({ pattern: '**/*.ts', path: dir }, makeCtx(workspace));
      expect(r.text).not.toContain('\\');
      expect(r.text.endsWith('/src/a.ts')).toBe(true);
      expect(r.text.startsWith(dir.replace(/\\/g, '/'))).toBe(true);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  // Added 2026-08-11: the external-directory agreement was asserted for Glob
  // only, so `--path-separator` could have silently split the two tools apart
  // on Windows with every test still green. Pins BOTH directions.
  it('Grep returns absolute paths when the search root is outside the workspace, matching Glob', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'grep-workspace-'));
    try {
      const r = await GrepTool.execute(
        { pattern: 'marker', output_mode: 'files_with_matches', path: dir },
        makeCtx(workspace),
      );
      expect(r.text).not.toContain('\\');
      expect(r.text.endsWith('/src/a.ts')).toBe(true);
      expect(r.text.startsWith(dir.replace(/\\/g, '/'))).toBe(true);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run the tests and understand why they pass**

```bash
npx vitest run tests/harness-tool-bounds.test.ts -t "outside the workspace"
```

Expected on Linux: **both PASS, before any source change.** This is not a mistake and not a reason to stop — it is the defining property of Defect 2. Linux already emits forward slashes from both tools, so every assertion in this task is satisfied trivially here. These two tests are **Windows-only guards**; their entire value is that they would now catch a separator split on the windows-latest leg, which nothing did before.

This is the one task in the plan with no local red-to-green cycle. Do not manufacture one by weakening the assertions to something Linux fails — the honest sequence is: write the contract, make the source satisfy it, and let Windows CI be the proof. Tasks 1 and 3 both have real local failures; use those to confirm your harness is actually running.

- [ ] **Step 3: Give ripgrep the separator**

In `desktop/src/main/harness/tools/grep.ts`, replace line 246:

```typescript
    const rgArgs = ['--no-config', '--hidden', '--glob', '!.git'];
```

with:

```typescript
    // `--path-separator /` (2026-08-11): rg prints paths with the PLATFORM
    // separator, so Windows returned `src\a.ts` while Glob returned `src/a.ts`
    // for the same file — one file, two shapes, unpipeable between the tools.
    // Set here at construction so it covers every output_mode. Do NOT
    // hand-normalize rg's stdout instead: in content mode a line is
    // `path:line:text` and the MATCHED TEXT can itself contain backslashes and
    // colons, so string surgery would corrupt real matches. Inert on
    // Linux/macOS, which already print '/'.
    const rgArgs = ['--no-config', '--hidden', '--glob', '!.git', '--path-separator', '/'];
```

- [ ] **Step 4: Normalize Glob's remaining branch**

In `desktop/src/main/harness/tools/glob.ts`, change line 7 from:

```typescript
import { resolveP } from './guards';
```

to:

```typescript
import { resolveP, toPosix } from './guards';
```

Then change line 229 from:

```typescript
      if (base.startsWith('..') || path.isAbsolute(base)) return path.join(root, r);
```

to:

```typescript
      // toPosix (2026-08-11): path.join emits the PLATFORM separator, so this
      // external-directory branch was the last place Glob still returned
      // backslashes on Windows. Grep's absolute output is forward-slashed now
      // (--path-separator), so without this the two tools would disagree here
      // instead of in the in-workspace case — moving the bug, not fixing it.
      if (base.startsWith('..') || path.isAbsolute(base)) return toPosix(path.join(root, r));
```

And change line 232 from:

```typescript
      return `${base.split(path.sep).join('/')}/${r}`;
```

to:

```typescript
      return `${toPosix(base)}/${r}`;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/harness-tool-bounds.test.ts
```

Expected: PASS, all tests in the file including both `outside the workspace` cases and `Grep returns workspace-relative paths for targets inside the workspace`.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/harness/tools/grep.ts desktop/src/main/harness/tools/glob.ts desktop/tests/harness-tool-bounds.test.ts
git commit -m "fix(harness): Grep and Glob emit forward slashes on every platform

Grep printed ripgrep's stdout verbatim and rg uses the platform separator,
so Windows returned src\\\\a.ts from Grep and src/a.ts from Glob for one file.
--path-separator fixes it without touching matched text. Glob's external
branch normalized in the same commit, because the flag alone would have
broken the external case where the two tools already agreed — untested
until now, so it would have gone silently wrong."
```

---

## Task 3: Bash reports its cwd in the workspace root's spelling

**Files:**
- Modify: `desktop/src/main/harness/tools/bash.ts:162-187` (replace `isInside`), `:498-511` (call site)
- Test: `desktop/tests/harness-tools-core.test.ts` (append a new `describe` after the `Bash` block)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `export function rebaseReportedCwd(root: string, reported: string): string | null` — returns the reported directory re-expressed in `root`'s spelling, or `null` when it is not inside `root`. Exported solely so the unit tests can reach it.

- [ ] **Step 1: Write the failing tests**

Append to `desktop/tests/harness-tools-core.test.ts`, and add `rebaseReportedCwd` to the existing `bash` import so line 26 reads `import { BashTool, rebaseReportedCwd } from '../src/main/harness/tools/bash';`

```typescript
// Defect 1 (2026-08-11): `pwd` prints the PHYSICAL path, so on a symlinked
// workspace root (macOS /var → /private/var; any symlinked project dir) or a
// Windows 8.3 short root (RUNNER~1 → runneradmin) the shell named the same
// directory a different way than ctx.cwd did. bash.ts compared the two with
// path.resolve, which follows neither symlinks nor 8.3 names, so one directory
// read as a change and the canonical spelling leaked into setShellCwd and the
// [cwd: …] metadata line — handing the model a workspace root it was never
// given, which is the exact confusion that line exists to remove.
describe('Bash cwd vocabulary', () => {
  let real: string;
  let link: string;

  beforeEach(() => {
    real = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-real-'));
    link = path.join(os.tmpdir(), `cwd-link-${process.pid}-${Math.random().toString(36).slice(2)}`);
    fs.symlinkSync(real, link);
    fs.mkdirSync(path.join(real, 'sub'));
  });

  afterEach(() => {
    try { fs.unlinkSync(link); } catch { /* best-effort */ }
    try { fs.rmSync(real, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('rebaseReportedCwd returns the ROOT spelling when the shell reports the resolved one', () => {
    expect(rebaseReportedCwd(link, real)).toBe(link);
  });

  it('rebaseReportedCwd keeps the root spelling for a subdirectory', () => {
    expect(rebaseReportedCwd(link, path.join(real, 'sub'))).toBe(path.join(link, 'sub'));
  });

  it('rebaseReportedCwd returns null for a path outside the root, so the scope guard still fires', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-outside-'));
    try {
      expect(rebaseReportedCwd(link, outside)).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('the metadata line names the workspace root the model was given, not the resolved one', async () => {
    const r = await BashTool.execute({ command: 'echo hi' }, makeCtx(link));
    expect(r.text).toContain(`[cwd: ${link} · exit 0]`);
    expect(r.text).not.toContain(real);
  });

  it('a cd inside a symlinked root tracks in the root spelling, and emits no reset notice', async () => {
    let tracked: string | undefined;
    const c: ToolContext = { ...makeCtx(link), shellCwd: undefined, setShellCwd: (n) => { tracked = n; } };
    const r = await BashTool.execute({ command: 'cd sub' }, c);
    expect(tracked).toBe(path.join(link, 'sub'));
    expect(r.text).not.toMatch(/Shell cwd was reset/);
  });

  it('a cd OUTSIDE a symlinked root is still reverted with a notice', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-outside-'));
    try {
      const c: ToolContext = { ...makeCtx(link), shellCwd: undefined, setShellCwd: () => {} };
      const r = await BashTool.execute({ command: `cd ${JSON.stringify(outside)}` }, c);
      expect(r.text).toMatch(/Shell cwd was reset to/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/harness-tools-core.test.ts -t "Bash cwd vocabulary"
```

Expected: FAIL. The three `rebaseReportedCwd` cases fail with `rebaseReportedCwd is not a function`; `the metadata line names the workspace root` fails with the resolved `/tmp/cwd-real-…` path received where the `/tmp/cwd-link-…` path was expected. **This runs on Linux and has real teeth** — it is the only local proof of Defect 1 available.

- [ ] **Step 3: Replace `isInside` with `rebaseReportedCwd`**

In `desktop/src/main/harness/tools/bash.ts`, replace lines 162-187 in full (the `isInside` doc comment through its closing brace) with:

```typescript
/** Canonical on-disk form: expands Windows 8.3 short names AND resolves
 *  symlinks, so two spellings of ONE directory compare equal.
 *  .native FIRST: plain realpathSync does NOT expand Windows 8.3 short names.
 *  ctx.cwd arrives short (C:\Users\RUNNER~1\...) while `pwd -W` may report the
 *  SAME directory long (C:\Users\runneradmin\...), so startsWith() judged a
 *  plain `cd sub` "outside the workspace" and the scope guard reverted EVERY
 *  cd on Windows — persistence looked broken and each call emitted a bogus
 *  reset notice. .native canonicalizes both sides via GetFinalPathNameByHandle.
 *  Confirmed on windows-latest 2026-07-19 (short/long forms observed side by side). */
function realPath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    /* not on disk (yet) — fall back */
  }
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Re-express the cwd the shell reported in the SPELLING the model was given,
 *  or null when it is not inside `root`.
 *
 *  `pwd` prints the PHYSICAL path. On a symlinked root (macOS /var →
 *  /private/var, or any symlinked project directory) or a Windows 8.3 short
 *  root, that names the same directory a different way than ctx.cwd does.
 *  Reporting it raw hands the model a workspace root it was never told about,
 *  which defeats the whole point of the `[cwd: …]` metadata line below — that
 *  line exists so the model can relate Bash's cwd to the file tools' root, and
 *  it only works if both speak one vocabulary.
 *
 *  The containment check runs BEFORE the rebase and that order is load-bearing:
 *  an outside path yields a `..`-prefixed relative, and path.join would quietly
 *  pull it back inside the root — silently turning the scope guard into a
 *  no-op. Never reorder these. */
export function rebaseReportedCwd(root: string, reported: string): string | null {
  const realRoot = realPath(root);
  const realReported = realPath(reported);
  if (realReported !== realRoot && !realReported.startsWith(realRoot + path.sep)) return null;
  const rel = path.relative(realRoot, realReported);
  return rel ? path.join(root, rel) : root;
}
```

- [ ] **Step 4: Rewire the call site**

In `desktop/src/main/harness/tools/bash.ts`, replace lines 498-511 (from `const reported =` through the closing brace of the `if (reported && …)` block) with:

```typescript
          const reported = parsed.cwd ?? extractCwd(probeTail).cwd;
          if (reported) {
            // Rebase FIRST, compare after: the old code compared
            // path.resolve(reported) against path.resolve(startCwd), and
            // resolve() follows neither symlinks nor Windows 8.3 names — so two
            // spellings of one directory read as a change and the canonical form
            // was stored and printed. Comparing the REBASED value means a
            // spelling difference is correctly a no-op and only a real `cd`
            // registers.
            const rebased = rebaseReportedCwd(ctx.cwd, reported);
            if (rebased === null) {
              // Scope guard: don't let the session wander out of the workspace,
              // and TELL the model — a silent revert is the exact failure mode
              // the Claude Code issues (#35058 et al.) complain about.
              // The notice names the RAW reported path on purpose: it is outside
              // the root, so there is no root-relative spelling of it, and the
              // physical path is the truthful thing to show.
              ctx.setShellCwd?.(ctx.cwd);
              resetTo = ctx.cwd;
              notice = `\nShell cwd was reset to ${ctx.cwd} (${reported} is outside the workspace).`;
            } else if (rebased !== startCwd) {
              reportedCwd = rebased;
              ctx.setShellCwd?.(reportedCwd);
            }
          }
```

- [ ] **Step 5: Run the new tests to verify they pass**

```bash
npx vitest run tests/harness-tools-core.test.ts -t "Bash cwd vocabulary"
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole file to verify nothing regressed**

```bash
npx vitest run tests/harness-tools-core.test.ts
```

Expected: PASS, all tests. Pay attention to the `scoped cwd persistence` block (`:557` onward) — it uses its own `canon()` helper on both sides of every comparison, so it is unaffected by the spelling change, but a failure there means `rebaseReportedCwd` broke real `cd` tracking.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/harness/tools/bash.ts desktop/tests/harness-tools-core.test.ts
git commit -m "fix(harness): Bash reports its cwd in the workspace root's spelling

pwd prints the physical path, so a symlinked root (macOS /var, any symlinked
project dir) or a Windows 8.3 short root made one directory read as a change
and leaked the canonical spelling into setShellCwd and the [cwd:] metadata
line — telling the model about a root it was never given.

isInside() is replaced by rebaseReportedCwd(), which canonicalizes for the
containment test and then re-expresses the result in ctx.cwd's vocabulary.
Containment still runs first; reversing it would let path.join pull an escaped
path back inside and silently disable the scope guard.

ctx.cwd itself is deliberately NOT canonicalized: the permission store is
keyed by cwd, so changing its spelling would orphan every remembered grant."
```

---

## Task 4: Verify, document, and open the PR

**Files:**
- Modify: `youcoded-dev/.claude/rules/native-runtime.md`
- Modify: `youcoded-dev/ROADMAP.md:64`
- Modify: `youcoded-dev/docs/active/specs/2026-08-11-harness-cross-platform-path-vocabulary.md` (frontmatter)

- [ ] **Step 1: Run the full local verification**

From `/home/destin/youcoded-dev`:

```bash
bash scripts/verify.sh youcoded/worktrees/path-vocabulary
```

Expected: PASS — `tsc --noEmit`, affected vitest, knip, eslint, ast-grep. Watch knip specifically: `isInside` was deleted and `rebaseReportedCwd` added as a new export, so a knip complaint here means the export is genuinely unreferenced outside tests and needs `knip.jsonc` treatment rather than being silenced.

**This green run proves nothing about Windows or macOS.** Say so in the PR body.

- [ ] **Step 2: Record the invariant in the rule**

In `youcoded-dev/.claude/rules/native-runtime.md`, in the `## Native tools (Plan A)` section, immediately after the existing `**Bash cwd is SCOPED-PERSISTENT; the file tools are not**` bullet, add:

```markdown
- **Every harness tool emits FORWARD SLASHES, and Bash reports its cwd in the workspace root's SPELLING** — `toPosix()` (`tools/guards.ts`) is the one output normalizer; Grep gets `--path-separator /` because rg prints the platform separator; Bash rebases the shell's physical `pwd` back into `ctx.cwd`'s vocabulary via `rebaseReportedCwd()` (containment check FIRST — reversing it lets `path.join` pull an escaped path back inside and disables the scope guard). *Why:* one file must not come back as `src/a.ts` from Glob and `src\a.ts` from Grep, and the `[cwd: …]` line can only relate Bash to the file tools if both name the root the same way. **`toPosix()` is NOT `guards.ts`'s `canonicalize()`**, which lowercases on win32 for the sensitive-path sets and would silently lowercase every path the model reads. **`ctx.cwd` is never canonicalized** — the permission store is keyed by it, so a spelling change orphans remembered grants. Guards: `harness-tool-guards.test.ts` ("toPosix"), `harness-tool-bounds.test.ts` ("Grep and Glob agree on path format"), `harness-tools-core.test.ts` ("Bash cwd vocabulary"). Note all three are **vacuous on Linux except the symlink block** — Windows/macOS CI is the real guard.
```

- [ ] **Step 3: Flip the spec to shipped**

In `youcoded-dev/docs/active/specs/2026-08-11-harness-cross-platform-path-vocabulary.md`, change `status: active` to `status: shipped`. Leave it in `docs/active/` until the PR merges; Task 4 Step 7 moves it.

- [ ] **Step 4: Commit the worktree changes and open the PR**

From the worktree:

```bash
git push -u origin fix/harness-path-vocabulary
gh pr create --title "fix(harness): one path vocabulary across platforms" --body "$(cat <<'EOF'
Closes the four tests that have kept master RED on Windows and macOS since eba51705.

Two independent defects, both real product bugs — neither is a test defect:

1. **bash.ts** compared the shell's reported cwd against ctx.cwd with
   `path.resolve`, which follows neither symlinks nor Windows 8.3 short names.
   Two spellings of one directory read as a change, and the canonical form
   leaked into `setShellCwd` and the `[cwd: …]` metadata line — telling the
   model about a workspace root it was never given. Reproduced on **Linux**
   with a symlinked root, so this was never CI-only.

2. **grep.ts** printed ripgrep's stdout verbatim and rg uses the platform
   separator, so Windows returned `src\a.ts` from Grep and `src/a.ts` from
   Glob for the same file. The sibling Glob test passing on Windows is the
   proof Grep was the outlier.

**The four originally-failing tests are unmodified.** One currently-GREEN test
changes: `harness-tool-bounds.test.ts` "Glob returns absolute paths when the
search root is outside the workspace" now expects the forward-slash form. That
reads like loosening a passing test; it is bringing it under the widened
contract. Its missing Grep counterpart is added in the same commit, because
`--path-separator` alone would have split the two tools apart in the external
case — where they agreed, untested — and gone silently wrong.

**Verification honesty:** `verify.sh` runs on Linux, so its green says nothing
about the two platforms this broke on. The only local proof is the new
"Bash cwd vocabulary" symlink block, which fails against the pre-fix code.
Everything else is proved by the Windows and macOS legs of this PR's matrix.

Spec: `youcoded-dev/docs/active/specs/2026-08-11-harness-cross-platform-path-vocabulary.md`
Plan: `youcoded-dev/docs/active/plans/2026-08-11-harness-cross-platform-path-vocabulary.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch the CI matrix — this is the actual acceptance gate**

```bash
gh pr checks --watch
```

Expected: `build (ubuntu-latest)`, `build (windows-latest)`, and `build (macos-latest)` all **pass**. Do not merge on ubuntu alone. If Windows or macOS still fails, read the assertion before changing anything — and do not reach for `canon()` in the failing tests (see Global Constraints → "The trap in the same file").

- [ ] **Step 6: Merge, then confirm master's own matrix is green**

```bash
gh pr merge --merge
gh run list --branch master --workflow "Desktop CI" --limit 1
```

Expected: the newest master run goes green on all three legs. That, not the PR check, is what closes the ROADMAP entry — the entry is about `master` being red.

- [ ] **Step 7: Close the ROADMAP entry, archive the docs, clean up**

In `youcoded-dev/ROADMAP.md:64`, flip `- [ ]` to `- [x]` and append to the entry's first line: `(FIXED 2026-08-11 — youcoded PR #<n>, merge <sha>; all three CI legs green on master)`.

Then:

```bash
cd /home/destin/youcoded-dev
git mv docs/active/specs/2026-08-11-harness-cross-platform-path-vocabulary.md docs/archive/specs/
git mv docs/active/plans/2026-08-11-harness-cross-platform-path-vocabulary.md docs/archive/plans/
git add ROADMAP.md .claude/rules/native-runtime.md
git commit -m "docs: harness path-vocabulary fix shipped; archive spec + plan"
git push origin master

cd youcoded
git worktree remove worktrees/path-vocabulary
git push origin --delete fix/harness-path-vocabulary
git branch -D fix/harness-path-vocabulary
```

---

## Notes for the implementer

- **Do not "fix" the four failing tests.** If you find yourself editing `harness-tools-core.test.ts:468`, `:491`, `:521` or `harness-tool-bounds.test.ts:53`, stop and re-read Global Constraints.
- **Do not canonicalize `ctx.cwd`.** It is the obvious simplification and it silently orphans users' remembered permission grants.
- **Do not hand-normalize ripgrep's stdout.** Content-mode lines are `path:line:text` and matched text can contain backslashes and colons.
- The `Bash always states the cwd` Windows/macOS asymmetry (passes on Windows, fails on macOS) is **unexplained and out of scope** — likely MSYS canonicalizing on an explicit `cd` while bash's startup `$PWD` inherits the Win32 cwd as-set. Both spellings rebase identically, so the fix does not depend on the answer.
