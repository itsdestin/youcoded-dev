---
status: shipped (unmerged) — all 19 tasks landed on integration/harness-spec, 2026-08-10
---

# Harness Tool Honesty Implementation Plan (Plan A)

> **Archived 2026-08-10.** All 19 tasks (the original 17 plus two added during execution:
> Task 18 context-fit truncation, Task 19 tool-owned widening vocabulary) verified against
> the commit history on `integration/harness-spec` (worktree
> `youcoded/worktrees/harness-integration`) — the bounds contract, every per-tool fix
> (Read/Bash/Grep/Glob/WebSearch/WebFetch), the manifest test + schema cross-check, the
> ast-grep rule (`scripts/ast-grep/rules/tool-bounds-not-hand-rolled.yml`, this workspace
> repo), and the conformance suite are all present. **Not yet merged to `youcoded` master**
> as of this archive date.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every native harness tool result state honestly what it omitted and how to widen it, so a model can never mistake a bounded view for a complete one.

**Architecture:** Tools declare a structured `bounds` fact; `defineTool` is the single place that renders it into prose. Advice text moves from a shared hardcoded string into a per-tool `moreHint`, so a tool structurally cannot suggest a parameter it does not accept. Four guard layers (pinning tests, a manifest test, a schema cross-check, an ast-grep rule) make the contract self-enforcing for tools added later.

**Tech Stack:** TypeScript, Electron main process, vitest, zod, ripgrep (`@vscode/ripgrep`), linkedom + `@mozilla/readability` + turndown, ast-grep.

**Spec:** `docs/active/specs/2026-08-06-harness-tool-honesty-design.md` (§3, §4, §5, §6a).

## Global Constraints

- **Work in a worktree.** `cd /home/destin/youcoded-dev/youcoded && git worktree add ../worktrees/tool-honesty -b fix/harness-tool-honesty`. Never edit the main checkout.
- **Never touch the live app.** Nothing in this plan requires a running YouCoded instance. `.claude/rules/live-app-safety.md`.
- **No new dependencies.** Everything needed is already in `youcoded/desktop/package.json`.
- **Every non-trivial edit gets a WHY comment** naming what broke or what it prevents. Destin is a non-developer and reads comments to understand changes. Match the density already in these files.
- **Error messages follow `docs/error-message-standards.md`:** specific and accurate, or general and non-committal. Never a guessed cause.
- **Scope is `youcoded/desktop/src/main/harness/tools/**` and its tests.** No renderer changes, no Android work (Android has no harness-tool code).
- **Serena cannot see your worktree** — it answers about `master`. Branch truth is `bash scripts/verify.sh <worktree>`.
- **Verify before claiming done:** `bash scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/tool-honesty` from the workspace root.
- All `npx vitest` commands run from `youcoded/desktop` inside the worktree.

---

### Task 1: The `bounds` contract and its renderer

The foundation. Tools declare a fact; the pipeline renders prose. Until this lands, no other task can declare anything.

**Files:**
- Modify: `src/main/harness/tools/types.ts:35-41` (add `bounds` to `ToolResultPayload`)
- Modify: `src/main/harness/tools/truncate.ts:29-33` (drop the hardcoded advice; add `composeNotice`)
- Modify: `src/main/harness/tools/registry.ts:15-27` (render the composed notice)
- Test: `tests/harness-truncate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ResultBounds` (exported from `types.ts`), `composeNotice(bounds, cap)` and `truncateOutput(text, opts)` returning `{ text, truncated, totalChars }` (exported from `truncate.ts`). Every later task uses `ResultBounds`.

- [ ] **Step 1: Write the failing test**

Append to `tests/harness-truncate.test.ts`:

```ts
import { truncateOutput, composeNotice } from '../src/main/harness/tools/truncate';
import type { ResultBounds } from '../src/main/harness/tools/types';

describe('composeNotice', () => {
  const bounds: ResultBounds = { shown: 500, total: 1200, unit: 'matches', moreHint: 'narrow the pattern' };

  it('renders nothing when neither a tool bound nor a cap fired', () => {
    expect(composeNotice(undefined, null)).toBe('');
  });

  it('renders a declared bound with the tool\'s own hint', () => {
    expect(composeNotice(bounds, null)).toBe(
      '\n[showing 500 of 1200 matches — narrow the pattern]',
    );
  });

  it('renders an unknown total as "at least", never as a fabricated number', () => {
    const open: ResultBounds = { shown: 2000, total: null, unit: 'files', moreHint: 'narrow the glob' };
    expect(composeNotice(open, null)).toBe(
      '\n[showing 2000 of at least 2000 files — narrow the glob]',
    );
  });

  it('names both facts in ONE line when a tool bound and a cap both fire', () => {
    const out = composeNotice(bounds, { shown: 30_000, total: 4_200_000 });
    expect(out.split('\n').filter(Boolean)).toHaveLength(1);
    expect(out).toContain('30000 of 4200000 chars');
    expect(out).toContain('500 of 1200 matches');
    expect(out).toContain('narrow the pattern');
  });

  it('never invents advice when a cap fires and the tool declared no bounds', () => {
    const out = composeNotice(undefined, { shown: 30_000, total: 90_000 });
    expect(out).toBe('\n[output truncated: showing 30000 of 90000 chars]');
    expect(out).not.toContain('offset');
    expect(out).not.toContain('limit');
  });
});

describe('truncateOutput reports the true input size', () => {
  it('returns totalChars of the ORIGINAL text, not the retained slice', () => {
    const big = 'x'.repeat(50_000);
    const r = truncateOutput(big, { maxChars: 10_000 });
    expect(r.truncated).toBe(true);
    expect(r.totalChars).toBe(50_000);
  });

  it('no longer appends its own advice string', () => {
    const big = 'x'.repeat(50_000);
    const r = truncateOutput(big, { maxChars: 10_000 });
    expect(r.text).not.toContain('offset/limit');
    expect(r.text).not.toContain('[truncated —');
  });
});
```

Also update the two existing assertions in this file that expect the removed trailer. Replace, in `'keeps head + tail and appends an actionable trailer'`:

```ts
    expect(r.text).toContain('[truncated');
    expect(r.text).toContain('50000 chars total');
```

with:

```ts
    // The trailer moved to composeNotice (rendered by defineTool). truncateOutput
    // now only reports the fact; it never writes advice into the text itself.
    expect(r.totalChars).toBe(50_000);
```

and in `'caps line count too'` replace `expect(r.text).toContain('[truncated');` with `expect(r.truncated).toBe(true);`. In `'never grows the output at tiny caps'`, the two `r.text.indexOf('\n[truncated')` measurements no longer apply — replace both blocks with a direct length check:

```ts
    const big = 'y'.repeat(100);
    const r = truncateOutput(big, { maxChars: 3 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(big.length);

    const many = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const r2 = truncateOutput(many, { maxChars: 1_000_000, maxLines: 2 });
    expect(r2.truncated).toBe(true);
    expect(r2.text.length).toBeLessThan(many.length);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-truncate.test.ts`
Expected: FAIL — `composeNotice is not a function`, and `r.totalChars` is `undefined`.

- [ ] **Step 3: Add `ResultBounds` to the tool contract**

In `src/main/harness/tools/types.ts`, add above `ToolResultPayload`:

```ts
/** What a tool omitted from its own result, and how to see more.
 *
 *  WHY this is structured instead of a string the tool writes itself: the single
 *  shared advice string in truncate.ts used to tell EVERY tool's caller to "use
 *  offset/limit" — advice that is correct for Read and meaningless for Bash and
 *  WebSearch, which have no such parameters. A tool now declares the FACT and the
 *  pipeline renders the prose, so a tool structurally cannot suggest a parameter
 *  it does not accept. See the 2026-08-01 multi-model harness review. */
export interface ResultBounds {
  /** Units actually represented in `text`. */
  shown: number;
  /** Units that exist. `null` = genuinely unknown, e.g. a walk that stopped early.
   *  Rendered as "at least N" — never as a number we did not measure. */
  total: number | null;
  unit: 'lines' | 'chars' | 'bytes' | 'files' | 'matches' | 'results';
  /** How to widen, in THIS tool's vocabulary: "| head -n 100", "offset=2390",
   *  "narrow the glob". The pipeline never supplies a default. */
  moreHint: string;
}
```

Then add the field to `ToolResultPayload`:

```ts
export interface ToolResultPayload {
  /** What the model sees (post-truncation). */
  text: string;
  isError?: boolean;
  /** Edit/Write attach jsdiff hunks so the existing diff card renders. */
  structuredPatch?: StructuredPatchHunk[];
  /** Declared by any tool that bounded its own output. Rendered by defineTool —
   *  never hand-written into `text`, or advice drifts from capability again. */
  bounds?: ResultBounds;
}
```

- [ ] **Step 4: Rewrite `truncate.ts`**

Replace the whole file:

```ts
// ONE truncation policy for every tool (spec §2.3): head+tail preservation and
// an explicit notice telling the model HOW to get more — never silent cuts.
//
// WHY the advice string left this file (2026-08-06): it was hardcoded to
// "Use offset/limit or a narrower query", which is correct for Read and WRONG for
// Bash and WebSearch — neither accepts offset or limit. Two reviewing models
// followed that advice into a dead end. Tools now declare a `moreHint` in their
// own vocabulary and composeNotice renders it; this module only reports facts.
import type { ResultBounds } from './types';

export interface TruncateOpts { maxChars: number; maxLines?: number }
export interface TruncateResult {
  text: string;
  truncated: boolean;
  /** Length of the ORIGINAL input, always — the number a caller needs to decide
   *  whether re-running with a narrower query is worth it. */
  totalChars: number;
}

export function truncateOutput(text: string, opts: TruncateOpts): TruncateResult {
  let out = text;
  let truncated = false;
  if (opts.maxLines) {
    const lines = out.split('\n');
    if (lines.length > opts.maxLines) {
      const head = lines.slice(0, Math.ceil(opts.maxLines * 0.8));
      // Guard slice(-0): Math.floor(maxLines*0.2)===0 (maxLines<=4) would make
      // slice(-0) return the WHOLE array, blowing output past the input size.
      const tailN = Math.floor(opts.maxLines * 0.2);
      const tail = tailN > 0 ? lines.slice(-tailN) : [];
      out = [...head, `[... ${lines.length - opts.maxLines} lines omitted ...]`, ...tail].join('\n');
      truncated = true;
    }
  }
  if (out.length > opts.maxChars) {
    const head = out.slice(0, Math.ceil(opts.maxChars * 0.8));
    // Same slice(-0) guard as the line path: an empty tail when maxChars<=4.
    const tailN = Math.floor(opts.maxChars * 0.2);
    const tail = tailN > 0 ? out.slice(-tailN) : '';
    out = `${head}\n[...]\n${tail}`;
    truncated = true;
  }
  return { text: out, truncated, totalChars: text.length };
}

/** Render at most ONE notice line from the two independent bounds that can apply:
 *  what the TOOL cut (`bounds`) and what the PIPELINE cap cut (`cap`).
 *
 *  WHY one line and not two: a result carrying two competing notices reads as if
 *  something went wrong twice, and the model has to reconcile them. One line
 *  states both facts and carries exactly one piece of advice — the tool's. */
export function composeNotice(
  bounds: ResultBounds | undefined,
  cap: { shown: number; total: number } | null,
): string {
  if (!bounds && !cap) return '';
  if (!bounds) {
    // A cap fired on a tool that declared nothing. Report the fact WITHOUT advice —
    // we have no idea what this tool's widening vocabulary is, and guessing is the
    // exact bug this refactor removes. tool-registry-manifest.test.ts fails the
    // build for this case, so it should be unreachable in shipped code.
    return `\n[output truncated: showing ${cap!.shown} of ${cap!.total} chars]`;
  }
  const total = bounds.total === null ? `at least ${bounds.shown}` : String(bounds.total);
  const toolPart = `${bounds.shown} of ${total} ${bounds.unit}`;
  if (!cap) return `\n[showing ${toolPart} — ${bounds.moreHint}]`;
  return `\n[showing ${cap.shown} of ${cap.total} chars, and ${toolPart} — ${bounds.moreHint}]`;
}
```

- [ ] **Step 5: Render the notice in `defineTool`**

Replace the `execute` body in `src/main/harness/tools/registry.ts`:

```ts
      try {
        const raw = await def.execute(args, ctx);
        const t = truncateOutput(raw.text, caps);
        // The tool's own bound and the pipeline cap are independent; composeNotice
        // folds both into one line and uses the TOOL's widening advice, never a
        // default of ours. See the WHY block in truncate.ts.
        const notice = composeNotice(raw.bounds, t.truncated ? { shown: t.text.length, total: t.totalChars } : null);
        return { ...raw, text: t.text + notice };
      } catch (err: any) {
```

and update the import line to `import { truncateOutput, composeNotice, type TruncateOpts } from './truncate';`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/harness-truncate.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Run the full harness suite to catch trailer-dependent assertions elsewhere**

Run: `npx vitest run tests/harness-tools-core.test.ts tests/web-fetch-tool.test.ts tests/web-search-tool.test.ts`
Expected: any failure here is an existing test asserting the removed `[truncated —` string. Update those assertions to check `bounds`/`composeNotice` output instead. Do not weaken an assertion to make it pass — if a test expected a trailer, it should now expect the composed notice.

- [ ] **Step 8: Commit**

```bash
git add src/main/harness/tools/types.ts src/main/harness/tools/truncate.ts src/main/harness/tools/registry.ts tests/harness-truncate.test.ts
git commit -m "feat(harness): tools declare bounds, the pipeline renders them

Replaces the single hardcoded 'Use offset/limit or a narrower query' advice
string — correct for Read, meaningless for Bash and WebSearch — with a per-tool
moreHint. truncateOutput now reports the true input length instead of writing
prose."
```

---

### Task 2: Read migrates to the contract

Read is the best-behaved tool in the harness; migrating it first proves the contract against known-good behavior before touching anything broken.

**Files:**
- Modify: `src/main/harness/tools/read.ts:76-80`
- Test: `tests/harness-tools-core.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe` in `tests/harness-tools-core.test.ts`:

```ts
  it('Read declares bounds with an offset hint when a page is partial', async () => {
    const f = path.join(dir, 'big.txt');
    fs.writeFileSync(f, Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'));
    const r = await ReadTool.execute({ file_path: f, offset: 1, limit: 20 }, ctx);
    expect(r.text).toContain('[showing 20 of 100 lines — use offset=21 to continue]');
  });

  it('Read declares no bounds when the whole file fits', async () => {
    const f = path.join(dir, 'small.txt');
    fs.writeFileSync(f, 'a\nb\nc');
    const r = await ReadTool.execute({ file_path: f }, ctx);
    expect(r.text).not.toContain('[showing');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tools-core.test.ts -t "Read declares bounds"`
Expected: FAIL — the current trailer reads `[showing lines 1-20 of 100 — use offset=21 to continue]`, which does not match the contract format.

- [ ] **Step 3: Replace Read's hand-rolled trailer with a declaration**

In `src/main/harness/tools/read.ts`, replace the `trailer` const and the return:

```ts
    // WHY a declared bound instead of the hand-written trailer this used to carry:
    // every tool now reports paging the same way, and the "use offset=N" advice is
    // Read's own vocabulary rather than a shared string other tools inherited.
    const more = offset - 1 + limit < totalLines;
    return {
      text: numbered,
      bounds: more
        ? { shown: slice.length, total: totalLines, unit: 'lines' as const, moreHint: `use offset=${offset + limit} to continue` }
        : undefined,
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tools-core.test.ts`
Expected: PASS. If an older Read assertion expected `[showing lines 1-20 of 100`, update it to the contract format — the information is identical.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/read.ts tests/harness-tools-core.test.ts
git commit -m "refactor(harness): Read reports paging through the bounds contract"
```

---

### Task 3: Bash reports true byte totals

The highest-severity fix in the plan. Bash currently announces a fabricated number.

**Files:**
- Modify: `src/main/harness/tools/bash.ts:238-276`
- Test: `tests/harness-tools-core.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
  it('Bash reports the TRUE output size, not the size of its retained buffer', async () => {
    // 400k of output — past the old 200k accumulator ceiling. The old code
    // reported the CAPPED buffer's length as "chars total", i.e. a number it
    // invented. Regression pin for the 2026-08-01 review finding.
    const r = await BashTool.execute(
      { command: `node -e "process.stdout.write('z'.repeat(400000))"` },
      ctx,
    );
    expect(r.bounds?.unit).toBe('bytes');
    expect(r.bounds?.total).toBe(400_000);
    expect(r.bounds?.moreHint).toContain('head');
    expect(r.text).not.toContain('204800');
  }, 30_000);

  it('Bash declares no bounds for small output', async () => {
    const r = await BashTool.execute({ command: 'echo hi' }, ctx);
    expect(r.bounds).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tools-core.test.ts -t "TRUE output size"`
Expected: FAIL — `r.bounds` is `undefined`.

- [ ] **Step 3: Replace the accumulator**

In `src/main/harness/tools/bash.ts`, replace the `out`/`tail`/`cap` block:

```ts
      // Bounded head + rolling tail + an UNCONDITIONAL byte counter.
      //
      // WHY this replaced a flat 200KB accumulator (2026-08-06): the old buffer
      // retained 200KB only for defineTool to cut it to 30k, and — worse — the
      // truncation notice reported the CAPPED buffer's length as the original
      // size. A 5MB command was announced as "204800 chars total", a number
      // nothing had measured. Counting every chunk whether or not we keep it makes
      // the reported total true, and drops peak retention ~7x.
      const HEAD_CHARS = 24_000;
      const TAIL_CHARS = 6_000;
      let head = '';
      let tailBuf = '';
      let totalChars = 0;
      // Separate uncapped 4KB tail purely for the cwd sentinel: a chatty command
      // ("cd sub && <huge output>") would otherwise push the sentinel out of the
      // retained text and silently lose the cd.
      let probeTail = '';
      const cap = (s: string) => {
        totalChars += s.length;
        if (head.length < HEAD_CHARS) head += s;
        else tailBuf = (tailBuf + s).slice(-TAIL_CHARS);
        if (probe) probeTail = (probeTail + s).slice(-4096);
      };
      const joined = () => (tailBuf ? `${head}\n[...]\n${tailBuf}` : head);
```

Then in `finish`, replace `let body = out;` with `let body = joined();` and `const parsed = extractCwd(out);` with `const parsed = extractCwd(joined());`, and `extractCwd(tail).cwd` with `extractCwd(probeTail).cwd`.

Finally, replace the `resolve(...)` at the end of `finish`:

```ts
        const text = (`${prefix}${body}`.trim() + notice).trim();
        // Only declare a bound when we actually dropped something. `total` is the
        // true byte count, `shown` what survived the head/tail retention.
        const dropped = totalChars > body.length;
        resolve({
          text: text || `(no output, exit ${code ?? '?'})`,
          isError,
          bounds: dropped
            ? {
                shown: body.length,
                total: totalChars,
                unit: 'bytes' as const,
                moreHint: 'pipe through head -n 100, tail -n 100, or wc -l to narrow it',
              }
            : undefined,
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tools-core.test.ts`
Expected: PASS. Pay attention to the existing "scoped cwd persistence" tests — they must still pass, which proves the sentinel survived the accumulator rewrite.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/bash.ts tests/harness-tools-core.test.ts
git commit -m "fix(harness): Bash reported a fabricated output total

The accumulator stopped at 200k chars and the truncation notice then reported
that capped buffer's length as the original size, so any output over 200KB was
announced as '204800 chars total' — a number nothing measured. Counts every
chunk whether or not it is retained, and drops peak retention ~7x."
```

---

### Task 4: Bash metadata line

**Files:**
- Modify: `src/main/harness/tools/bash.ts` (the `finish` function)
- Test: `tests/harness-tools-core.test.ts`

**Interfaces:**
- Consumes: the `joined()`/`totalChars` locals from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
  it('Bash always states the cwd and exit code', async () => {
    const r = await BashTool.execute({ command: 'echo hi' }, ctx);
    expect(r.text).toContain(`[cwd: ${dir} · exit 0]`);
  });

  it('Bash states a non-zero exit in the metadata line, not as a prefix', async () => {
    const r = await BashTool.execute({ command: 'exit 42' }, ctx);
    expect(r.text).toContain('· exit 42]');
    expect(r.text).not.toContain('(exit code 42)');
  });

  it('Bash reports the tracked cwd after a cd, so the model never has to guess', async () => {
    fs.mkdirSync(path.join(dir, 'sub'));
    let tracked: string | undefined;
    const c: ToolContext = { ...makeCtx(dir), shellCwd: undefined, setShellCwd: (n) => { tracked = n; } };
    const r = await BashTool.execute({ command: 'cd sub' }, c);
    expect(tracked).toBe(path.join(dir, 'sub'));
    expect(r.text).toContain(`[cwd: ${path.join(dir, 'sub')} · exit 0]`);
  });

  it('Bash still reports the cwd when the command timed out', async () => {
    const r = await BashTool.execute({ command: 'sleep 5', timeout: 500 }, ctx);
    expect(r.text).toContain('Command timed out after 500ms.');
    expect(r.text).toContain('[cwd:');
  }, 15_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tools-core.test.ts -t "always states the cwd"`
Expected: FAIL — no `[cwd:` in the output.

- [ ] **Step 3: Emit the metadata line**

Replace everything in `finish` from `let body = joined();` to the end of the function with this complete block, so the metadata line, the `dropped` calculation, and the single `resolve` all live in one place:

```ts
        let body = joined();
        let notice = '';
        // Track what the cwd ENDED as, so the metadata line can state it. Two
        // separate facts: where the shell actually landed, and whether the scope
        // guard pulled it back.
        let reportedCwd: string | null = null;
        let resetTo: string | null = null;
        if (probe) {
          const parsed = extractCwd(joined());
          body = parsed.text;
          // Sentinel past the retention window → recover it from the uncapped tail.
          const reported = parsed.cwd ?? extractCwd(probeTail).cwd;
          if (reported && path.resolve(reported) !== path.resolve(startCwd)) {
            if (isInside(ctx.cwd, reported)) {
              reportedCwd = path.resolve(reported);
              ctx.setShellCwd?.(reportedCwd);
            } else {
              // Scope guard: don't let the session wander out of the workspace,
              // and TELL the model — a silent revert is the exact failure mode
              // the Claude Code issues (#35058 et al.) complain about.
              ctx.setShellCwd?.(ctx.cwd);
              resetTo = ctx.cwd;
              notice = `\nShell cwd was reset to ${ctx.cwd} (${reported} is outside the workspace).`;
            }
          }
        }
        // ONE metadata line, always. Four of five reviewing models independently
        // asked for this (2026-08-01): file tools resolve relative paths from the
        // workspace root while Bash resolves from its own persistent cwd, and with
        // no cwd echoed back the only safe habit was prefixing every single call
        // with `cd <root> &&`. This line costs ~15 tokens and removes that ritual.
        // It ABSORBS the old `(exit code N)` prefix rather than adding to it.
        const dropped = totalChars > body.length;
        const effectiveCwd = resetTo ?? reportedCwd ?? startCwd;
        const meta = [`cwd: ${effectiveCwd}`, `exit ${code ?? '?'}`];
        if (dropped) meta.push(`${totalChars} bytes output, showing ${body.length}`);
        const text = (`${prefix}${body}`.trim() + notice).trim() + `\n[${meta.join(' · ')}]`;
        resolve({
          text,
          isError,
          bounds: dropped
            ? {
                shown: body.length,
                total: totalChars,
                unit: 'bytes' as const,
                moreHint: 'pipe through head -n 100, tail -n 100, or wc -l to narrow it',
              }
            : undefined,
        });
```

Note `prefix` stays in the text — it now only ever carries the timeout and cancellation messages, since the next change removes the exit-code prefix.

Then remove the exit-code prefix at the call site — change the `close` handler to `child.on('close', (code) => finish('', code !== 0, code));`. The timeout and abort handlers keep their prefixes, since those messages are not exit codes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tools-core.test.ts`
Expected: PASS. Existing tests asserting `(exit code 42)` must be updated to `· exit 42]` — the information is preserved, the location changed.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/bash.ts tests/harness-tools-core.test.ts
git commit -m "feat(harness): every Bash result states its cwd and exit code

Absorbs the old (exit code N) prefix and the cwd-reset notice into one line."
```

---

### Task 5: Bash strips ANSI

**Files:**
- Modify: `src/main/harness/tools/bash.ts` (spawn env + `finish`)
- Test: `tests/harness-tools-core.test.ts`

**Interfaces:**
- Consumes: `joined()` from Task 3.
- Produces: `stripAnsi(s: string): string`, exported from `bash.ts` for the conformance suite.

- [ ] **Step 1: Write the failing test**

```ts
  it('Bash strips ANSI colour codes from output', async () => {
    const r = await BashTool.execute(
      { command: `node -e "process.stdout.write('\\u001b[32m✓\\u001b[39m passed')"` },
      ctx,
    );
    expect(r.text).toContain('✓ passed');
    expect(r.text).not.toContain('\x1b[');
  });

  it('Bash sets NO_COLOR so tools emit plain output in the first place', async () => {
    const r = await BashTool.execute({ command: 'echo "NO_COLOR=$NO_COLOR FORCE_COLOR=$FORCE_COLOR"' }, ctx);
    expect(r.text).toContain('NO_COLOR=1');
    expect(r.text).toContain('FORCE_COLOR=0');
  });

  it('ANSI stripping does not disturb the cwd sentinel', async () => {
    fs.mkdirSync(path.join(dir, 'coloured'));
    let tracked: string | undefined;
    const c: ToolContext = { ...makeCtx(dir), setShellCwd: (n) => { tracked = n; } };
    await BashTool.execute(
      { command: `node -e "process.stdout.write('\\u001b[31mred\\u001b[0m')" && cd coloured` },
      c,
    );
    expect(tracked).toBe(path.join(dir, 'coloured'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tools-core.test.ts -t "strips ANSI"`
Expected: FAIL — raw escape codes present.

- [ ] **Step 3: Set the env and strip**

Add near the top of `bash.ts`:

```ts
/** Strip CSI (colour, cursor) and OSC (window title, hyperlink) sequences.
 *
 *  WHY both an env hint AND a strip: NO_COLOR/FORCE_COLOR cover most tools, but
 *  not all honour them — a vitest run rendered as
 *  `[1m[30m[46m RUN [49m[39m[22m` in the 2026-08-01 review. That is noise in every
 *  test result the model reads, and it looks like corruption to a non-developer
 *  reading the transcript. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}
```

In the `spawn` options replace `env: process.env,` with:

```ts
          // Ask tools to emit plain output rather than stripping it after the fact
          // where possible — cleaner, and it keeps byte counts honest.
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
```

In `finish`, apply the strip **after** `extractCwd` so the sentinel is parsed from raw bytes first:

```ts
        if (probe) {
          const parsed = extractCwd(joined());
          body = stripAnsi(parsed.text);
          ...
        } else {
          body = stripAnsi(joined());
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tools-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/bash.ts tests/harness-tools-core.test.ts
git commit -m "fix(harness): strip ANSI from Bash output and set NO_COLOR

Stripping runs after extractCwd so the __YC_CWD__ sentinel is parsed from raw
bytes and cannot be mangled."
```

---

### Task 6: Grep derives its error advice

**Files:**
- Modify: `src/main/harness/tools/grep.ts:96-99`
- Test: `tests/harness-tool-bounds.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `grepErrorMessage(stderr: string, resolvedPath: string, cwd: string): string`, exported from `grep.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/harness-tool-bounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { grepErrorMessage } from '../src/main/harness/tools/grep';

describe('grepErrorMessage', () => {
  const P = '/ws/youcoded/desktop/src/main';
  const CWD = '/ws';

  it('keeps regex advice when ripgrep actually reported a regex parse error', () => {
    const err = 'rg: regex parse error:\n  (?:ipcMain\\.handle(()\n                    ^\nerror: unclosed group';
    const out = grepErrorMessage(err, P, CWD);
    expect(out).toContain('unclosed group');
    expect(out).toContain('Check the regex syntax.');
  });

  it('names the path and workspace root when ripgrep reported a missing directory', () => {
    const err = `rg: ${P}: IO error for operation on ${P}: No such file or directory (os error 2)`;
    const out = grepErrorMessage(err, P, CWD);
    expect(out).toContain(P);
    expect(out).toContain(CWD);
    // The wrong path was the whole problem. Never send the model regex-hunting.
    expect(out).not.toContain('Check the regex syntax.');
  });

  it('offers NO advice when the failure matches neither shape', () => {
    const out = grepErrorMessage('rg: something entirely unexpected', P, CWD);
    expect(out).toContain('something entirely unexpected');
    expect(out).not.toContain('Check the regex syntax.');
    expect(out).not.toContain('does not exist');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tool-bounds.test.ts`
Expected: FAIL — `grepErrorMessage is not exported`.

- [ ] **Step 3: Implement derived advice**

Add to `src/main/harness/tools/grep.ts`:

```ts
/** Build the failure message from what ripgrep ACTUALLY said.
 *
 *  WHY (2026-08-01 review): the old code appended "Check the regex syntax." to
 *  every exit-2, including a missing-path IO error. A reviewing model got
 *  "No such file or directory ... Check the regex syntax." for a perfectly valid
 *  regex and a mistyped path. Per docs/error-message-standards.md an error is
 *  either specific and accurate or general and non-committal — never a guessed
 *  cause bolted onto a real one. */
export function grepErrorMessage(stderr: string, resolvedPath: string, cwd: string): string {
  const raw = stderr.trim() || 'ripgrep error';
  if (/regex parse error|error: (unclosed|repetition|unrecognized)/i.test(stderr)) {
    return `Grep failed: ${raw}. Check the regex syntax.`;
  }
  if (/No such file or directory|IO error for operation/i.test(stderr)) {
    return `Grep failed: ${resolvedPath} does not exist. Paths resolve from the workspace root (${cwd}); pass a path relative to it, or omit \`path\` to search the whole workspace.`;
  }
  return `Grep failed: ${raw}`;
}
```

Then in the `close` handler replace the exit-2 branch:

```ts
        if (code === 2) resolve({ text: grepErrorMessage(err, resolvedTarget, ctx.cwd), isError: true });
```

and hoist the resolved path into a local above the `spawn` so the message can name it: replace `rgArgs.push('--', args.pattern, resolveP(args.path ?? '.', ctx.cwd));` with

```ts
    const resolvedTarget = resolveP(args.path ?? '.', ctx.cwd);
    rgArgs.push('--', args.pattern, resolvedTarget);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tool-bounds.test.ts tests/harness-tools-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/grep.ts tests/harness-tool-bounds.test.ts
git commit -m "fix(harness): Grep advice is derived from ripgrep's stderr

A missing path no longer produces 'Check the regex syntax.'"
```

---

### Task 7: Grep emits workspace-relative paths

**Files:**
- Modify: `src/main/harness/tools/grep.ts` (the spawn target)
- Test: `tests/harness-tool-bounds.test.ts`

**Interfaces:**
- Consumes: `resolvedTarget` from Task 6.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `tests/harness-tool-bounds.test.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GrepTool } from '../src/main/harness/tools/grep';
import { GlobTool } from '../src/main/harness/tools/glob';
import type { ToolContext } from '../src/main/harness/tools/types';

function makeCtx(cwd: string): ToolContext {
  return { sessionId: 'test', cwd, signal: new AbortController().signal, readRegistry: new Map(), todos: [] };
}

describe('Grep and Glob agree on path format', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grep-paths-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const marker = 1;\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('Grep returns workspace-relative paths for targets inside the workspace', async () => {
    const r = await GrepTool.execute({ pattern: 'marker', output_mode: 'files_with_matches' }, makeCtx(dir));
    expect(r.text).toContain('src/a.ts');
    expect(r.text).not.toContain(dir);
  });

  it('Glob returns the same shape for the same file', async () => {
    const r = await GlobTool.execute({ pattern: '**/*.ts' }, makeCtx(dir));
    expect(r.text).toContain('src/a.ts');
  });
});
```

Add `beforeEach, afterEach` to the vitest import at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tool-bounds.test.ts -t "workspace-relative"`
Expected: FAIL — Grep returns absolute paths because it is handed an absolute target.

- [ ] **Step 3: Pass a relative target when it is inside the workspace**

In `grep.ts`, after computing `resolvedTarget`:

```ts
    // WHY a relative target: rg echoes back whatever form it was given, so an
    // absolute target made Grep print absolute paths while Glob printed relative
    // ones — the same file, two shapes, unpipeable between tools (2026-08-01
    // review). rg already runs with `cwd: ctx.cwd`, so a relative target is
    // equivalent. Targets OUTSIDE the workspace (reachable via the
    // external_directory ask) stay absolute, which is the truthful form there.
    const rel = path.relative(ctx.cwd, resolvedTarget);
    const searchTarget = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : resolvedTarget;
    rgArgs.push('--', args.pattern, searchTarget);
```

Add `import * as path from 'path';` to the file's imports. Note `path.relative` returns `''` when the target *is* `cwd`; the `rel &&` guard falls through to the absolute form in that case, so add `'.'` handling: use `const searchTarget = rel === '' ? '.' : (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : resolvedTarget);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tool-bounds.test.ts tests/harness-tools-core.test.ts`
Expected: PASS. The existing Grep cwd-regression test in `harness-tools-core.test.ts` asserts `spawn` options, not the target form, so it is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/grep.ts tests/harness-tool-bounds.test.ts
git commit -m "fix(harness): Grep emits workspace-relative paths, matching Glob"
```

---

### Task 8: Grep discloses its caps

**Files:**
- Modify: `src/main/harness/tools/grep.ts` (stdout accumulator + close handler)
- Test: `tests/harness-tool-bounds.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` from Task 1.
- Produces: `filesAtMaxCount(out: string, mode: string, maxCount: number): string[]`, exported from `grep.ts`.

- [ ] **Step 1: Write the failing test**

```ts
describe('filesAtMaxCount', () => {
  it('names files whose count-mode tally sits exactly at the cap', () => {
    const out = 'src/a.ts:500\nsrc/b.ts:12\nsrc/c.ts:500\n';
    expect(filesAtMaxCount(out, 'count', 500)).toEqual(['src/a.ts', 'src/c.ts']);
  });

  it('names files with exactly maxCount returned lines in content mode', () => {
    const out = Array.from({ length: 500 }, (_, i) => `src/a.ts:${i + 1}:hit`).join('\n')
      + '\n' + Array.from({ length: 3 }, (_, i) => `src/b.ts:${i + 1}:hit`).join('\n');
    expect(filesAtMaxCount(out, 'content', 500)).toEqual(['src/a.ts']);
  });

  it('never reports a cap in files_with_matches mode, where -l stops at the first hit', () => {
    expect(filesAtMaxCount('src/a.ts\nsrc/b.ts\n', 'files_with_matches', 500)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tool-bounds.test.ts -t "filesAtMaxCount"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement detection and declare the bound**

Add to `grep.ts`:

```ts
const MAX_COUNT = 500;

/** Which files hit `--max-count`, i.e. whose results are silently short.
 *
 *  WHY per-mode: --max-count means something different in each output mode, and
 *  in files_with_matches it cannot bind at all (`-l` stops at the first match).
 *  Reporting a cap there would be a false alarm; not reporting it in the other
 *  two modes is the silent truncation the 2026-08-01 review missed. */
export function filesAtMaxCount(out: string, mode: string, maxCount = MAX_COUNT): string[] {
  if (mode === 'files_with_matches') return [];
  const perFile = new Map<string, number>();
  for (const line of out.split('\n')) {
    if (!line) continue;
    if (mode === 'count') {
      const at = line.lastIndexOf(':');
      if (at === -1) continue;
      const n = Number(line.slice(at + 1));
      if (Number.isFinite(n)) perFile.set(line.slice(0, at), n);
    } else {
      const at = line.indexOf(':');
      if (at === -1) continue;
      const f = line.slice(0, at);
      perFile.set(f, (perFile.get(f) ?? 0) + 1);
    }
  }
  return [...perFile.entries()].filter(([, n]) => n >= maxCount).map(([f]) => f);
}
```

Replace the literal `'500'` in `rgArgs` with `String(MAX_COUNT)`.

Replace the stdout accumulator with the same head/tail + true-total scheme as Bash:

```ts
      // Same honest-total scheme as Bash: count every byte, retain a bounded
      // head + tail. The old flat 200k ceiling made the reported total a lie.
      let head = '';
      let tailBuf = '';
      let totalChars = 0;
      child.stdout.on('data', (d) => {
        const s = String(d);
        totalChars += s.length;
        if (head.length < 24_000) head += s;
        else tailBuf = (tailBuf + s).slice(-6_000);
      });
```

and in the `close` handler's success branch:

```ts
        const out = (tailBuf ? `${head}\n[...]\n${tailBuf}` : head).trim();
        const capped = filesAtMaxCount(out, mode);
        const dropped = totalChars > out.length;
        if (!out) { resolve({ text: 'No matches found.' }); return; }
        resolve({
          text: capped.length
            ? `${out}\n\nNote: these files hit the ${MAX_COUNT}-matches-per-file limit and have more: ${capped.join(', ')}`
            : out,
          bounds: dropped
            ? { shown: out.length, total: totalChars, unit: 'chars' as const, moreHint: 'narrow the pattern, add a glob filter, or use output_mode: "count"' }
            : undefined,
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tool-bounds.test.ts tests/harness-tools-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/grep.ts tests/harness-tool-bounds.test.ts
git commit -m "fix(harness): Grep discloses its per-file and output caps"
```

---

### Task 9: Glob stops lying about "newest first"

**Files:**
- Modify: `src/main/harness/tools/glob.ts:53-83`
- Test: `tests/harness-tool-bounds.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
describe('Glob completeness', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-cap-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns the genuinely newest N when it caps, not an arbitrary N', async () => {
    // 2,100 files. The NEWEST is written last and lives in a directory the walk
    // reaches late, so the old implementation — which aborted the walk at 2,000
    // hits BEFORE sorting by mtime — could not have included it, while still
    // claiming "newest first". Regression pin for that false claim.
    fs.mkdirSync(path.join(dir, 'a'));
    fs.mkdirSync(path.join(dir, 'z'));
    for (let i = 0; i < 2_050; i++) fs.writeFileSync(path.join(dir, 'a', `f${i}.ts`), '');
    const newest = path.join(dir, 'z', 'newest.ts');
    fs.writeFileSync(newest, '');
    fs.utimesSync(newest, new Date(), new Date(Date.now() + 60_000));

    const r = await GlobTool.execute({ pattern: '**/*.ts' }, makeCtx(dir));
    expect(r.text.split('\n')[0]).toBe('z/newest.ts');
  }, 60_000);

  it('declares how many files it withheld', async () => {
    for (let i = 0; i < 2_050; i++) fs.writeFileSync(path.join(dir, `f${i}.ts`), '');
    const r = await GlobTool.execute({ pattern: '*.ts' }, makeCtx(dir));
    expect(r.bounds?.unit).toBe('files');
    expect(r.bounds?.shown).toBe(2_000);
    expect(r.bounds?.total).toBe(2_050);
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-tool-bounds.test.ts -t "genuinely newest"`
Expected: FAIL — the first line is one of the `a/f*.ts` files; the walk stopped before reaching `z/`.

- [ ] **Step 3: Complete the walk, then sort, then cap**

In `glob.ts` replace the constants and executor body:

```ts
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
/** How many matches we RETURN. */
const RESULT_LIMIT = 2_000;
/** How many we are willing to hold in memory while walking. Far above any real
 *  query; purely a runaway guard. */
const WALK_CEILING = 50_000;
```

and in `execute`:

```ts
    const root = resolveP(args.path ?? '.', ctx.cwd);
    const rx = fileGlobToRegex(args.pattern);
    const hits: Array<{ rel: string; mtime: number }> = [];
    let ceilingHit = false;
    const walk = (dir: string, rel: string) => {
      if (ctx.signal.aborted || hits.length >= WALK_CEILING) {
        if (hits.length >= WALK_CEILING) ceilingHit = true;
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
          continue;
        }
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (rx.test(r)) {
          try {
            hits.push({ rel: r, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs });
          } catch {
            /* raced delete */
          }
        }
      }
    };
    walk(root, '');
    // WHY the walk now completes before the cap is applied (2026-08-06): it used
    // to abort at 2,000 hits BEFORE this sort, so a capped result was an arbitrary
    // 2,000 files in directory order — while the tool description promised
    // "sorted by modification time, newest first". That promise was false on any
    // large tree, and nothing in the output said the list was partial.
    hits.sort((a, b) => b.mtime - a.mtime);
    const shown = hits.slice(0, RESULT_LIMIT);
    // Paths are relative to the SEARCH ROOT above; re-base onto the workspace root
    // so Glob and Grep return the same shape for the same file.
    const base = path.relative(ctx.cwd, root);
    const rebase = (r: string) => (base && !base.startsWith('..') ? `${base}/${r}` : r);
    return {
      text: shown.length ? shown.map((h) => rebase(h.rel)).join('\n') : 'No files matched.',
      bounds: hits.length > shown.length
        ? {
            shown: shown.length,
            // A ceiling hit means we stopped counting, so the total is unknown —
            // report it as unknown rather than as the number we happened to reach.
            total: ceilingHit ? null : hits.length,
            unit: 'files' as const,
            moreHint: 'narrow the glob pattern or pass a more specific path',
          }
        : undefined,
    };
```

Add `caps: { maxChars: 30_000 },` to the `defineTool` call so the cap is explicit rather than inherited.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-tool-bounds.test.ts tests/harness-tools-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/glob.ts tests/harness-tool-bounds.test.ts
git commit -m "fix(harness): Glob sorted AFTER capping, so 'newest first' was false

The walk aborted at 2,000 hits before the mtime sort, making a capped result an
arbitrary 2,000 files in directory order while still claiming newest-first.
Completes the walk, sorts, then caps, and declares what it withheld."
```

---

### Task 10: WebSearch caps snippets and dedups

**Files:**
- Modify: `src/main/harness/tools/web-search.ts:26-30`
- Test: `tests/web-search-tool.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `tests/web-search-tool.test.ts` (reuse the file's existing fake-service helper; if it builds a service inline, mirror that shape):

```ts
  it('caps each snippet so one query cannot dump 30k of page text', async () => {
    const long = 'word '.repeat(5_000);
    const svc = { search: async () => ({ results: [{ title: 'T', url: 'https://a.example', snippet: long }], source: 'fake' }) };
    const r = await WebSearchTool.execute({ query: 'q' }, { ...baseCtx, services: { search: svc } } as any);
    expect(r.text.length).toBeLessThan(2_000);
    expect(r.text).toContain('…');
  });

  it('dedups results that share a URL', async () => {
    const mk = (u: string) => ({ title: 'T', url: u, snippet: 's' });
    const svc = { search: async () => ({ results: [mk('https://a.example/x'), mk('https://a.example/x/'), mk('https://b.example')], source: 'fake' }) };
    const r = await WebSearchTool.execute({ query: 'q' }, { ...baseCtx, services: { search: svc } } as any);
    expect(r.text.match(/a\.example/g)).toHaveLength(1);
  });

  it('declares how many results it withheld, with an advice string it can honour', async () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, url: `https://x${i}.example`, snippet: 's' }));
    const svc = { search: async () => ({ results, source: 'fake' }) };
    const r = await WebSearchTool.execute({ query: 'q' }, { ...baseCtx, services: { search: svc } } as any);
    expect(r.bounds?.shown).toBe(8);
    expect(r.bounds?.total).toBe(20);
    // WebSearch has neither an offset nor a limit parameter — it must never say so.
    expect(r.bounds?.moreHint).not.toContain('offset');
    expect(r.bounds?.moreHint).not.toContain('limit');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/web-search-tool.test.ts -t "caps each snippet"`
Expected: FAIL — the full 25k snippet comes through.

- [ ] **Step 3: Cap, dedup, declare**

In `web-search.ts`, replace the body of the `try` block:

```ts
      const { results, source } = await ctx.services.search.search(args.query, ctx.signal);
      // Result fields are UNTRUSTED web content interpolated into a numbered
      // markdown list. Collapse internal whitespace/newlines so a title like
      // "\n\n2. **fake**" can't fabricate extra list items or inject
      // instruction-shaped lines into the model-facing text.
      const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
      // WHY a snippet cap (2026-08-01 review): the exa backend returns near-complete
      // page bodies, and one contextBridge query came back at 34,377 chars carrying
      // the same type-support table three times. Deep results are the point; 25k of
      // one page is not.
      const SNIPPET_CHARS = 500;
      const trim = (s: string) => (s.length > SNIPPET_CHARS ? `${s.slice(0, SNIPPET_CHARS)}…` : s);
      // Dedup by normalized URL — backends routinely return the same page twice
      // under a trailing-slash or scheme variant.
      const key = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
      const seen = new Set<string>();
      const unique = results.filter((r) => {
        const k = key(r.url);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const shown = unique.slice(0, 8);
      const lines = shown.map((r, i) =>
        `${i + 1}. **${clean(r.title)}**\n   ${clean(r.url)}${r.snippet ? `\n   ${trim(clean(r.snippet))}` : ''}`);
      return {
        text: `Web search results for "${args.query}" (via ${source}):\n\n${lines.join('\n\n')}`,
        bounds: unique.length > shown.length
          ? { shown: shown.length, total: unique.length, unit: 'results' as const, moreHint: 'narrow the query, or WebFetch a result to read it in full' }
          : undefined,
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/web-search-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/web-search.ts tests/web-search-tool.test.ts
git commit -m "fix(harness): cap WebSearch snippets, dedup by URL, declare withheld results"
```

---

### Task 11: WebFetch falls back instead of dead-ending

**Files:**
- Modify: `src/main/harness/tools/web-fetch.ts:162-169`
- Test: `tests/web-fetch-tool.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `stripToText(html: string): string`, exported from `web-fetch.ts`.

- [ ] **Step 1: Write the failing test**

```ts
  it('falls back to plain text instead of refusing when the page is too complex', async () => {
    // 200 nested divs — past MAX_DEPTH 150, so Readability must not run. The old
    // code hard-failed here, leaving the model with nothing (Kimi K3 finding #1).
    const deep = '<div>'.repeat(200) + 'THE CONTENT' + '</div>'.repeat(200);
    const r = await fetchWith(`<html><body>${deep}</body></html>`);
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain('THE CONTENT');
    expect(r.text).toContain('simplified extraction');
  });
```

Use whichever fetch-stubbing helper the file already defines for `__setWebFetchTestHooks`; name it `fetchWith` locally if none exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/web-fetch-tool.test.ts -t "falls back to plain text"`
Expected: FAIL — `isError` is true and the text is the refusal.

- [ ] **Step 3: Implement the fallback**

Add to `web-fetch.ts`:

```ts
/** Tag-strip to readable text. O(n) on the raw string, so it is safe on input
 *  that would hang Readability's ~quadratic parse. */
export function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
```

Replace the complexity-guard branch:

```ts
    // DoS guard: never run the synchronous ~quadratic Readability parse on
    // pathological HTML. But WHY this no longer hard-fails (2026-08-06): the guard
    // is specifically about Readability's cost, and tag-stripping is O(n) and safe
    // on any input — so we can still return honest content. The old refusal left
    // the model with nothing and no way forward (2026-08-01 review, finding #1).
    const tooComplex = tooComplexToExtract(raw);
    if (tooComplex) {
      return {
        text: `${header}\n\n[This page is too large or deeply nested for structured extraction, so this is a simplified extraction: plain text with no headings, links, or code formatting.]\n\n${stripToText(raw)}`,
      };
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/web-fetch-tool.test.ts`
Expected: PASS. An existing test asserting the refusal text must be updated — the guard still fires, but its outcome changed from a refusal to a degraded success. Keep an assertion that `Readability` was not invoked (the DoS guard is the point).

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/web-fetch.ts tests/web-fetch-tool.test.ts
git commit -m "fix(harness): WebFetch degrades to plain text instead of refusing

The complexity guard exists to keep Readability's quadratic parse off the main
loop; tag-stripping is O(n) and safe, so a rejected page can still return content."
```

---

### Task 12: WebFetch discloses JavaScript-rendered pages

**Files:**
- Modify: `src/main/harness/tools/web-fetch.ts`
- Test: `tests/web-fetch-tool.test.ts`
- Create: `tests/fixtures/web/vitest-config.html`, `tests/fixtures/web/asyncio.html`

**Interfaces:**
- Consumes: `stripToText` from Task 11.
- Produces: `looksJsRendered(html: string): boolean`, exported from `web-fetch.ts`.

- [ ] **Step 1: Save the fixtures**

```bash
mkdir -p tests/fixtures/web
curl -sL "https://vitest.dev/config/" -o tests/fixtures/web/vitest-config.html
curl -sL "https://docs.python.org/3/library/asyncio.html" -o tests/fixtures/web/asyncio.html
```

These are the two pages that made the failure diagnosable: the first is the false negative, the second is a structurally similar page that works. Pinning both is what stops a future threshold change from "fixing" one by breaking the other.

- [ ] **Step 2: Write the failing test**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { looksJsRendered } from '../src/main/harness/tools/web-fetch';

const fixture = (n: string) => fs.readFileSync(path.join(__dirname, 'fixtures', 'web', n), 'utf8');

describe('looksJsRendered', () => {
  it('flags the VitePress page whose content never reaches an HTTP client', () => {
    // 98KB of HTML carrying 5.2KB of text, __VP_HASH_MAP__, and an empty app root.
    // A reviewing model asked this page about `include`, got a confident preamble,
    // and concluded the docs do not document it. id="include" appears nowhere.
    expect(looksJsRendered(fixture('vitest-config.html'))).toBe(true);
  });

  it('does NOT flag a server-rendered docs page of similar shape', () => {
    // Same tool, same extraction ratio (69% vs 70%) — the discriminator has to be
    // text density plus framework markers, not coverage.
    expect(looksJsRendered(fixture('asyncio.html'))).toBe(false);
  });

  it('does not flag a small plain page', () => {
    expect(looksJsRendered('<html><body><h1>Hi</h1><p>Some words here.</p></body></html>')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/web-fetch-tool.test.ts -t "looksJsRendered"`
Expected: FAIL — not exported.

- [ ] **Step 4: Implement detection**

```ts
/** Markers of a client-rendered app shell. */
const JS_APP_MARKERS = /__VP_HASH_MAP__|__NEXT_DATA__|__NUXT__|__remixContext|__sveltekit|window\.__INITIAL_STATE__/;
const EMPTY_ROOT = /<div id="(?:root|app|__next)"\s*>\s*<\/div>/i;
/** Visible-text-to-bytes ratio below which a page is mostly scaffolding.
 *  Measured 2026-08-06: vitest.dev/config 5.3%; docs.python.org asyncio 16.0%;
 *  nodejs.org/api/fs 24.2%; example.com 25.4%. 10% sits in the gap. */
const TEXT_DENSITY_FLOOR = 0.10;

/** True when the served HTML looks like an app shell whose content arrives via
 *  JavaScript. We CANNOT know what is missing — from the response's point of view
 *  nothing is — so callers must phrase the disclosure non-committally per
 *  docs/error-message-standards.md. */
export function looksJsRendered(html: string): boolean {
  const hasMarker = JS_APP_MARKERS.test(html) || EMPTY_ROOT.test(html);
  if (!hasMarker) return false;
  const density = stripToText(html).length / Math.max(html.length, 1);
  return density < TEXT_DENSITY_FLOOR;
}
```

In `execute`, after `htmlToMarkdown`:

```ts
    const { title, markdown } = htmlToMarkdown(raw);
    // Honest, non-committal disclosure: state what was observed, never guess what
    // is absent. Without this a JS-rendered docs page returns a confident preamble
    // and the model reports "the docs do not document X" (2026-08-01 review).
    const jsNote = looksJsRendered(raw)
      ? `\n\n[This page is a JavaScript-rendered app. The server sent ${(stripToText(raw).length / 1024).toFixed(1)} KB of text; content that loads in a browser is not included. If a section you expected is absent, it is likely rendered client-side.]`
      : '';
    return { text: `${header}${title ? `\nTitle: ${title}` : ''}\n\n${markdown}${jsNote}${truncated ? '\n\n[body truncated at 5MB]' : ''}` };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/web-fetch-tool.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/harness/tools/web-fetch.ts tests/web-fetch-tool.test.ts tests/fixtures/web/
git commit -m "feat(harness): WebFetch discloses JavaScript-rendered pages

Thresholds pinned against two real fixtures: the page that produced a false
negative and a server-rendered page of near-identical extraction ratio."
```

---

### Task 13: WebFetch resolves URL fragments

**Files:**
- Modify: `src/main/harness/tools/web-fetch.ts`
- Test: `tests/web-fetch-tool.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 12.
- Produces: `resolveFragment(rawHtml, markdown, fragment)` returning `{ kind: 'found'; section: string } | { kind: 'dropped' } | { kind: 'absent' }`, exported from `web-fetch.ts`.

- [ ] **Step 1: Write the failing test**

```ts
describe('resolveFragment', () => {
  const html = fixture('vitest-config.html');

  it('reports a fragment the served HTML never contained', () => {
    // id="include" appears nowhere in the 98KB. This is the exact case that
    // produced a confident false negative in the 2026-08-01 review.
    expect(resolveFragment(html, '## Config Options\n\ntext', 'include').kind).toBe('absent');
  });

  it('reports a fragment present in the HTML but missing from the extraction', () => {
    expect(resolveFragment(html, '# Nothing relevant here', 'config-options').kind).toBe('dropped');
  });

  it('returns the section when the fragment survived extraction', () => {
    // Heading text carries a trailing anchor link in VitePress output
    // (`## Config Options [​](#config-options)`), so matching MUST go through the
    // anchor href, not a slug of the heading text. Verified 2026-08-06.
    const md = '## Intro\n\nfirst\n\n## Config Options [​](#config-options)\n\nthe body\n\n## After\n\nlast';
    const r = resolveFragment(html, md, 'config-options');
    expect(r.kind).toBe('found');
    if (r.kind === 'found') {
      expect(r.section).toContain('the body');
      expect(r.section).not.toContain('last');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/web-fetch-tool.test.ts -t "resolveFragment"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement resolution**

```ts
/** Locate a URL fragment's section in the extracted markdown.
 *
 *  WHY this exists at all: a #fragment is never sent to a server, so refetching
 *  with one returns identical bytes — correct HTTP that reads like a bug. The
 *  fixable part is resolving it AFTER extraction, which turns a silent false
 *  negative into an explicit statement.
 *
 *  WHY matching goes through anchor hrefs and not heading text: VitePress emits
 *  `## Config Options [​](#config-options)`, so slugifying the heading text yields
 *  "config-options-config-options" and misses. The `id="..."` attributes in the raw
 *  HTML are authoritative and independent of markdown rendering. */
export function resolveFragment(
  rawHtml: string,
  markdown: string,
  fragment: string,
): { kind: 'found'; section: string } | { kind: 'dropped' } | { kind: 'absent' } {
  const frag = fragment.toLowerCase();
  const ids = new Set(
    [...rawHtml.matchAll(/\sid="([^"]+)"/gi)].map((m) => m[1].toLowerCase()),
  );
  if (!ids.has(frag)) return { kind: 'absent' };
  const lines = markdown.split('\n');
  const start = lines.findIndex(
    (l) => /^#{1,6} /.test(l) && (l.toLowerCase().includes(`(#${frag})`) || slugify(l) === frag),
  );
  if (start === -1) return { kind: 'dropped' };
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return { kind: 'found', section: lines.slice(start, end).join('\n').trim() };
}

/** Heading text → slug, with any trailing anchor link removed first. */
function slugify(heading: string): string {
  return heading
    .replace(/^#+\s*/, '')
    .replace(/\[.*?\]\(#.*?\)\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Wire it into `execute`, after the `jsNote` computation:

```ts
    // A fragment on the request URL is a question about ONE section. Answer it
    // directly, and be explicit when we cannot.
    let fragmentNote = '';
    let body = markdown;
    const hash = (() => { try { return new URL(finalUrl).hash.replace(/^#/, ''); } catch { return ''; } })();
    if (hash) {
      const f = resolveFragment(raw, markdown, hash);
      if (f.kind === 'found') {
        body = f.section;
        fragmentNote = `\n\n[Showing the "#${hash}" section only. Refetch without the fragment for the whole page.]`;
      } else if (f.kind === 'dropped') {
        fragmentNote = `\n\n[The page has an anchor named "#${hash}", but article extraction did not keep that section. The full text above is what was extracted.]`;
      } else {
        fragmentNote = `\n\n[The HTML served for this URL contains no anchor named "#${hash}".]`;
      }
    }
    return { text: `${header}${title ? `\nTitle: ${title}` : ''}\n\n${body}${fragmentNote}${jsNote}${truncated ? '\n\n[body truncated at 5MB]' : ''}` };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/web-fetch-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/web-fetch.ts tests/web-fetch-tool.test.ts
git commit -m "feat(harness): WebFetch resolves URL fragments against anchor ids

Three outcomes — found, dropped in extraction, absent from the served HTML —
so a fragment that was never there produces a statement instead of a preamble."
```

---

### Task 14: Manifest test and schema cross-check

The guard that makes the contract apply to tools nobody has written yet.

**Files:**
- Modify: `tests/tool-registry-manifest.test.ts`
- Test: same file

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `tests/tool-registry-manifest.test.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Tools that CANNOT exceed their cap, with the reason. Keeping exemptions listed
// (rather than implicit) is the point: the list is reviewable, a silent gap is not.
const BOUNDS_EXEMPT: Record<string, string> = {
  AskUserQuestion: 'interactive; defineTool never wraps it and execute() never runs',
  TodoWrite: 'returns a fixed-size acknowledgement, never file or process output',
  Write: 'returns a one-line confirmation; the diff rides structuredPatch',
  Edit: 'returns a one-line confirmation; the diff rides structuredPatch',
  Skill: 'returns catalog text already bounded by the injection budget',
};

describe('every bounded tool declares its bounds', () => {
  it('exemptions are all real tools, so the list cannot rot', () => {
    const known = new Set([...NATIVE_TOOL_NAMES, ...CONDITIONAL_TOOL_NAMES]);
    for (const name of Object.keys(BOUNDS_EXEMPT)) expect(known).toContain(name);
  });

  it('Bash, Grep, Glob, Read and WebSearch all declare bounds when they cut', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bounds-manifest-'));
    try {
      for (let i = 0; i < 2_100; i++) fs.writeFileSync(path.join(dir, `f${i}.ts`), 'needle\n');
      const ctx = { sessionId: 't', cwd: dir, signal: new AbortController().signal, readRegistry: new Map(), todos: [] } as any;

      const glob = await GlobTool.execute({ pattern: '*.ts' }, ctx);
      expect(glob.bounds, 'Glob').toBeDefined();

      const big = path.join(dir, 'big.txt');
      fs.writeFileSync(big, Array.from({ length: 5_000 }, (_, i) => `l${i}`).join('\n'));
      const read = await ReadTool.execute({ file_path: big, limit: 10 }, ctx);
      expect(read.bounds, 'Read').toBeDefined();

      const bash = await BashTool.execute({ command: `node -e "process.stdout.write('q'.repeat(300000))"` }, ctx);
      expect(bash.bounds, 'Bash').toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it('no tool advises a parameter its own schema does not accept', () => {
    // The generalized form of the bug this whole change exists to fix: the shared
    // truncation string told every caller to "use offset/limit", which Bash and
    // WebSearch do not accept. Two reviewing models followed it into a dead end.
    for (const tool of CORE_TOOLS) {
      const shape = (tool.inputSchema as any)?._def?.shape?.() ?? {};
      const params = new Set(Object.keys(shape));
      const advice = `${tool.description} ${tool.shortDescription ?? ''}`;
      for (const word of ['offset', 'limit']) {
        if (advice.includes(word) && !params.has(word)) {
          throw new Error(`${tool.name} mentions "${word}" but its schema has no such parameter (has: ${[...params].join(', ')})`);
        }
      }
    }
  });
});
```

`CORE_TOOLS` (from `../src/main/harness/tools`) is already imported by this file for its existing lockstep assertions — reuse it rather than rebuilding the list. Add `GlobTool`, `ReadTool`, `BashTool` imports for the per-tool checks.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool-registry-manifest.test.ts`
Expected: PASS if Tasks 3–10 are complete. If run before them, the bounds assertions fail — that is the guard working.

- [ ] **Step 3: Commit**

```bash
git add tests/tool-registry-manifest.test.ts
git commit -m "test(harness): pin the bounds contract and the schema cross-check

Fails the build if a tool truncates without declaring, or advises a parameter
its own schema does not accept."
```

---

### Task 15: ast-grep rule against hand-rolled notices

**Files:**
- Create: `scripts/ast-grep/rules/tool-bounds-not-hand-rolled.yml`
- Create: `scripts/ast-grep/fixtures/harness-tool.ts`
- Modify: `scripts/ast-grep/check.sh` (`EXPECTED_VIOLATIONS`)

All paths in this task are relative to the **workspace root**, not `youcoded/desktop`.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the violation fixture**

Create `scripts/ast-grep/fixtures/harness-tool.ts`:

```ts
// Violation fixture for tool-bounds-not-hand-rolled. This file is NOT compiled
// into the app — check.sh scans it to prove the rule still fires.
export const BadTool = defineTool({
  name: 'Bad',
  async execute(args, ctx) {
    const out = 'some output';
    // VIOLATION: hand-rolled truncation prose instead of a declared `bounds`.
    return { text: out + '\n[truncated — use offset/limit to see more]' };
  },
});
```

- [ ] **Step 2: Write the rule**

Create `scripts/ast-grep/rules/tool-bounds-not-hand-rolled.yml`:

```yaml
id: tool-bounds-not-hand-rolled
language: typescript
severity: error
message: >-
  Harness tools must DECLARE what they omitted via the `bounds` field, not write
  truncation prose into `text`. The pipeline (defineTool → composeNotice) renders
  it, using the tool's own `moreHint`.
note: |
  Invariant source: .claude/rules/native-runtime.md → "Native tools".
  Guard: youcoded/desktop/tests/tool-registry-manifest.test.ts
         → "every bounded tool declares its bounds"

  WHY: a single shared advice string used to tell EVERY tool's caller to "use
  offset/limit" — correct for Read, meaningless for Bash and WebSearch, which
  accept neither. Two models in the 2026-08-01 harness review followed that
  advice into a dead end. Declaring the fact and rendering it centrally means a
  tool structurally cannot suggest a parameter it does not have.
files:
  - "**/harness/tools/*.ts"
  - "**/fixtures/harness-tool.ts"
rule:
  regex: "\\[truncated|\\[output truncated|use offset/limit|offset/limit or a narrower"
  kind: string_fragment
```

- [ ] **Step 3: Run the check to verify the rule fires on the fixture and not on real source**

```bash
cd /home/destin/youcoded-dev
sed -i 's/^EXPECTED_VIOLATIONS=3$/EXPECTED_VIOLATIONS=4/' scripts/ast-grep/check.sh
bash scripts/ast-grep/check.sh youcoded/worktrees/tool-honesty/desktop/src
```

Expected: fixture pass reports 4 violations; source scan reports 0. If the source scan fires, a tool still hand-writes a notice — fix the tool, not the rule.

- [ ] **Step 4: Commit**

```bash
git add scripts/ast-grep/rules/tool-bounds-not-hand-rolled.yml scripts/ast-grep/fixtures/harness-tool.ts scripts/ast-grep/check.sh
git commit -m "chore(ast-grep): fail hand-rolled truncation prose in harness tools"
```

Note: this commit lands in the **workspace repo** (`youcoded-dev`), not `youcoded`. Commit it from the workspace root.

---

### Task 16: Conformance suite

**Files:**
- Create: `tests/harness-tool-conformance.test.ts`

**Interfaces:**
- Consumes: every tool change above.
- Produces: nothing.

- [ ] **Step 1: Write the suite**

```ts
// Contract-level conformance. Asserts PROPERTIES of the bounds contract rather
// than exact prose, so wording can change without breaking the suite, but a tool
// that stops declaring — or starts inventing advice — fails.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BashTool } from '../src/main/harness/tools/bash';
import { GlobTool } from '../src/main/harness/tools/glob';
import { GrepTool } from '../src/main/harness/tools/grep';
import { ReadTool } from '../src/main/harness/tools/read';
import type { ToolContext } from '../src/main/harness/tools/types';

let dir: string;
let ctx: ToolContext;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-'));
  ctx = { sessionId: 't', cwd: dir, signal: new AbortController().signal, readRegistry: new Map(), todos: [] };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('bounds contract conformance', () => {
  it('a declared total is never smaller than what was shown', async () => {
    fs.writeFileSync(path.join(dir, 'f.txt'), Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n'));
    const r = await ReadTool.execute({ file_path: 'f.txt', limit: 10 }, ctx);
    expect(r.bounds!.total).toBeGreaterThanOrEqual(r.bounds!.shown);
  });

  it('every declared moreHint is non-empty and names no parameter the tool lacks', async () => {
    for (let i = 0; i < 2_100; i++) fs.writeFileSync(path.join(dir, `g${i}.ts`), '');
    const r = await GlobTool.execute({ pattern: '*.ts' }, ctx);
    expect(r.bounds!.moreHint.trim().length).toBeGreaterThan(0);
    // Glob accepts only `pattern` and `path`.
    expect(r.bounds!.moreHint).not.toMatch(/offset|limit/);
  }, 60_000);

  it('no tool result ever contains the old shared advice string', async () => {
    fs.writeFileSync(path.join(dir, 'x.txt'), 'hello');
    const results = [
      await ReadTool.execute({ file_path: 'x.txt' }, ctx),
      await GlobTool.execute({ pattern: '*.txt' }, ctx),
      await GrepTool.execute({ pattern: 'hello' }, ctx),
      await BashTool.execute({ command: 'echo hi' }, ctx),
    ];
    for (const r of results) expect(r.text).not.toContain('offset/limit');
  }, 30_000);

  it('a result that shows everything declares no bounds at all', async () => {
    fs.writeFileSync(path.join(dir, 'small.txt'), 'one\ntwo');
    const r = await ReadTool.execute({ file_path: 'small.txt' }, ctx);
    expect(r.bounds).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npx vitest run tests/harness-tool-conformance.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/harness-tool-conformance.test.ts
git commit -m "test(harness): contract-level conformance suite for the bounds contract"
```

---

### Task 17: Documentation

**Files:**
- Modify: `.claude/rules/native-runtime.md` (workspace repo)
- Modify: `youcoded/docs/native-runtime.md`
- Modify: `docs/archive/investigations/2026-08-01-native-agent-harness-reviews.md` (workspace repo)
- Modify: `docs/active/specs/2026-08-06-harness-tool-honesty-design.md` → `status: shipped`

- [ ] **Step 1: Add the invariant to the rule file**

Under "## Native tools (Plan A)" in `.claude/rules/native-runtime.md`:

```markdown
- **Tools DECLARE what they omitted (`bounds`); `defineTool` renders it** — never truncation prose written into `text`, and the widening advice (`moreHint`) is the tool's own vocabulary. *Why:* one shared string told every caller to "use offset/limit" — a parameter Bash and WebSearch do not have; two models in the 2026-08-01 review followed it into a dead end. Guards: `tool-registry-manifest.test.ts` ("every bounded tool declares its bounds"), `harness-tool-conformance.test.ts`, ast-grep `tool-bounds-not-hand-rolled`.
```

- [ ] **Step 2: Add depth to the sub-repo doc**

Add a "Tool output honesty" section to `youcoded/docs/native-runtime.md` covering the `ResultBounds` shape, the two-bounds composition rule, the per-tool `moreHint` values, and the WebFetch JS-shell thresholds with the four measured densities.

- [ ] **Step 3: Append the correction note to the investigations doc**

Add a `## Correction note — 2026-08-06` section above the "Prompt for other agents" block recording §1 and §2 of the spec: which review claims did not reproduce, that WebFetch's root cause is client-rendered content rather than truncation, that Bash's context cost was overstated ~7x, and the three defects no reviewer found. Do not edit any model's review section — the doc's own rule forbids it.

- [ ] **Step 4: Full verification**

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh youcoded/worktrees/tool-honesty
```

Expected: tsc clean, all affected tests pass, knip clean, ast-grep source scan 0 findings.

- [ ] **Step 5: Commit and finish the branch**

```bash
git add -A && git commit -m "docs(harness): record the bounds contract and the review corrections"
```

Then use `superpowers:finishing-a-development-branch`. Flip the spec's `status:` to `shipped` and move both spec and plan to `docs/archive/` in the same session the branch merges, per the workspace document-lifecycle rule.

---

### Task 18: The context-fit truncation path

**Added mid-execution (2026-08-06), found by the Task 1 review.** `fitToContext` in
`harness-session.ts` is a SECOND truncation path, independent of `defineTool`'s: it fires
when a single tool result alone exceeds the model's context window, and it appends
`Re-run with offset/limit, or use Grep, to see the rest.` to **any** tool's result —
including Bash and WebSearch, which accept neither parameter. Without this task the spec's
contract ("never advise an action the tool does not support") stays violated after all 17
other tasks land, on the exact path that fires when output is largest.

This task deliberately reaches outside the plan's stated `tools/**` scope, because the
defect is the same one and leaving it would make the branch's central claim false.

**Files:**
- Modify: `src/main/harness/harness-session.ts:150-168` (`fitToContext`'s per-result trim)
- Test: `tests/harness-tool-bounds.test.ts` — NO. Use `tests/harness-compaction.test.ts`,
  which already covers `fitToContext`. Confirm with `rg -n "fitToContext" tests/` first and
  use whichever file already exercises it, to avoid a second home for the same subject.

**Interfaces:**
- Consumes: nothing from other tasks. `harness-session.ts` is touched by no other task in
  this plan, so this runs fully in parallel.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Find the existing test home**

Run: `rg -n "fitToContext" tests/ src/main/harness/harness-session.ts`
Use the test file that already covers it. Do not create a new file if one exists.

- [ ] **Step 2: Write the failing test**

```ts
it('does not advise offset/limit for a tool that has neither parameter', () => {
  // fitToContext trims ONE oversized tool result. The advice it appends used to be
  // hardcoded "Re-run with offset/limit, or use Grep" regardless of which tool
  // produced the result — the same defect the bounds contract removed from the
  // defineTool path, on the path that fires when output is LARGEST.
  const msg = {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolName: 'Bash',
      output: { type: 'text', value: 'x'.repeat(50_000) },
    }],
  } as any;
  const out = trimOversizedToolResults(msg, 1_000);
  const value = (out as any).content[0].output.value;
  expect(value).toContain('truncated');
  expect(value).not.toContain('offset/limit');
  expect(value).toMatch(/head|tail|narrower/i);
});

it('still advises offset for Read, which does accept it', () => {
  const msg = {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolName: 'Read',
      output: { type: 'text', value: 'y'.repeat(50_000) },
    }],
  } as any;
  const value = (trimOversizedToolResults(msg, 1_000) as any).content[0].output.value;
  expect(value).toContain('offset');
});

it('states the true dropped count', () => {
  const msg = {
    role: 'tool',
    content: [{ type: 'tool-result', toolName: 'Bash', output: { type: 'text', value: 'z'.repeat(10_000) } }],
  } as any;
  const value = (trimOversizedToolResults(msg, 2_000) as any).content[0].output.value;
  // 10,000 in, `per` characters kept — the notice must name the real difference,
  // never a rounded or invented figure.
  expect(value).toMatch(/[\d,]+ more characters/);
});
```

The function may currently be unexported or differently named — export it (or the smallest
testable unit) and use its real name. Do not rename it.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run <the test file> -t "does not advise offset/limit"`
Expected: FAIL — the message contains `offset/limit` for a Bash result.

- [ ] **Step 4: Derive the advice from the tool that produced the result**

The `tool-result` part carries `toolName`. Use it. Add a small lookup beside the function:

```ts
/** Widening advice per tool, in that tool's OWN vocabulary.
 *
 *  WHY (2026-08-06): this path appended "Re-run with offset/limit, or use Grep" to
 *  EVERY oversized tool result, including Bash and WebSearch, which accept neither
 *  parameter. It is the same defect the bounds contract removed from the
 *  defineTool path — and it fires precisely when output is largest, so it was the
 *  most likely advice a model would ever act on. Tools absent from this map get a
 *  bare statement with no advice, which is the honest fallback per
 *  docs/error-message-standards.md — never a guess. */
const FIT_MORE_HINT: Record<string, string> = {
  Read: 'Re-run with a narrower offset/limit window',
  Bash: 'Re-run piping through head, tail, or wc -l',
  Grep: 'Re-run with a narrower pattern or output_mode: "count"',
  Glob: 'Re-run with a narrower glob pattern',
  WebSearch: 'Re-run with a narrower query',
  WebFetch: 'Fetch a more specific URL or section',
};
```

Then build the notice from `FIT_MORE_HINT[p.toolName]`, appending `. ${hint}.` only when a
hint exists, and nothing when it does not.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run <the test file>`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/harness/harness-session.ts tests/<the test file>
git commit -m "fix(harness): context-fit truncation advised offset/limit for every tool

fitToContext appends its own notice, independent of defineTool's, and hardcoded
'Re-run with offset/limit, or use Grep' regardless of which tool produced the
result. Derives the advice from toolName, and says nothing when it has nothing
accurate to say."
```

---

### Task 19: Widening vocabulary belongs to the tool, not to the moment it truncates

**Added mid-execution (2026-08-06), found by three independent reviews converging.** Task 1
split truncation into two independent events: what the TOOL dropped (`bounds`) and what the
PIPELINE cap dropped (`defineTool`'s `caps`). It assumed those coincide. They do not.

Measured cases where the pipeline cap fires while the tool declares nothing:
- **Grep**, one file, 400 matching lines, 6,691 chars, `output_mode:'content'` — the binding
  cap is `maxLines: 250`, `bounds` is `undefined`, and the model receives
  `[output truncated: showing 4169 of 6691 chars]` with **no widening advice at all**, in
  *chars* when the actual constraint was lines.
- **Glob**, 2,000 paths exceeding `maxChars: 30_000` with `hits.length <= RESULT_LIMIT`.
- **Bash**, the 30k–71.5k retention window (closed separately, but by per-tool arithmetic
  that the next constant change can silently reopen).

`composeNotice`'s no-`bounds` branch carries a comment calling it "a bounds declaration bug";
in practice it is now the *common* path for content-mode Grep. Fixing this per tool means
每 tool must keep its retention arithmetic under its own cap forever — three places to get
wrong. The advice is a static property of a tool, so it should live with the tool.

**Files:**
- Modify: `src/main/harness/tools/types.ts` (add `moreHint` to `NativeTool`)
- Modify: `src/main/harness/tools/registry.ts` (pass it to `composeNotice`)
- Modify: `src/main/harness/tools/truncate.ts` (`composeNotice` takes a fallback hint)
- Modify: each tool that can be capped — `bash.ts`, `grep.ts`, `glob.ts`, `read.ts`,
  `web-search.ts`, `web-fetch.ts` — to declare its static hint
- Test: `tests/harness-truncate.test.ts`, `tests/harness-tool-conformance.test.ts`

**Interfaces:**
- Consumes: `ResultBounds` (Task 1), and every tool's existing `bounds.moreHint` strings —
  reuse the exact wording already shipped rather than inventing second versions.
- Produces: `NativeTool.moreHint?: string`. Task 14's manifest guard asserts every
  non-exempt tool declares it.

- [ ] **Step 1: Write the failing test**

In `tests/harness-truncate.test.ts`:

```ts
it('uses the tool\'s static hint when the pipeline cap fires and the tool declared no bounds', () => {
  // The gap three reviews found: `bounds` describes what the TOOL dropped, but the
  // pipeline cap is a separate event. When only the cap fires, the model used to get
  // a bare "[output truncated: showing N of M chars]" with no way to widen — and for
  // content-mode Grep that was the COMMON case, not an edge.
  const out = composeNotice(undefined, { shown: 4169, total: 6691 }, 'narrow the pattern');
  expect(out).toContain('4169 of 6691 chars');
  expect(out).toContain('narrow the pattern');
});

it('still emits no advice when neither a bound nor a static hint is available', () => {
  // Honest fallback preserved: we never invent advice we do not have.
  expect(composeNotice(undefined, { shown: 10, total: 20 }, undefined))
    .toBe('\n[output truncated: showing 10 of 20 chars]');
});

it('prefers the bound\'s own hint over the static one when both exist', () => {
  const b = { shown: 5, total: 9, unit: 'files' as const, moreHint: 'specific hint' };
  expect(composeNotice(b, null, 'static hint')).toContain('specific hint');
  expect(composeNotice(b, null, 'static hint')).not.toContain('static hint');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-truncate.test.ts -t "static hint"`
Expected: FAIL — `composeNotice` takes two arguments.

- [ ] **Step 3: Thread the static hint through**

Add to `NativeTool` in `types.ts`:

```ts
/** How to widen THIS tool's output, in its own vocabulary — a static property,
 *  independent of whether the tool or the pipeline did the cutting.
 *
 *  WHY static (2026-08-06): `bounds.moreHint` only exists when the TOOL bounded its
 *  own output. The pipeline cap in defineTool is a separate event that fires on its
 *  own schedule — for content-mode Grep it is the common one — and without a hint to
 *  fall back on the model was told content vanished and given no way to get it back. */
moreHint?: string;
```

`composeNotice(bounds, cap, fallbackHint?)` uses `bounds.moreHint` when a bound exists,
else `fallbackHint`, else emits no advice. `defineTool` passes `def.moreHint`.

Each tool declares the hint it already uses in its `bounds`, verbatim — do not write a
second wording. For tools whose only cap is the pipeline's (`web-fetch.ts`), supply the
hint that fits: fetching a more specific URL or section.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-truncate.test.ts tests/harness-tools-core.test.ts tests/harness-tool-bounds.test.ts tests/web-search-tool.test.ts tests/web-fetch-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the regression cases the reviews measured**

In `tests/harness-tool-conformance.test.ts`, assert that a content-mode Grep exceeding
`maxLines: 250` and a Glob exceeding `maxChars` both produce advice, and that **no** tool
result in the suite ever contains the bare no-advice string.

- [ ] **Step 6: Commit**

```bash
git commit -o src/main/harness/tools tests/harness-truncate.test.ts tests/harness-tool-conformance.test.ts -m "fix(harness): a capped result with no bounds gave the model no way to widen

bounds describes what the TOOL dropped; defineTool's cap is a separate event.
When only the cap fired the model got a bare byte count and no advice — the
common case for content-mode Grep. Widening advice is now a static property
of each tool."
```
