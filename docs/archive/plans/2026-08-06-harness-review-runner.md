---
status: shipped (unmerged) — all 6 tasks landed, hardened further on integration/harness-spec, 2026-08-10
---

# Harness Review Runner Implementation Plan (Plan B)

> **Archived 2026-08-10.** All six tasks implemented and committed (`feat/harness-review-runner`),
> then hardened by review-driven fixes on `integration/harness-spec`
> (worktree `youcoded/worktrees/harness-integration`) — fixture jail (deny non-AskUserQuestion
> asks), bounded `max_steps` continuations, the final-message extraction fix, and a
> minute-precision heading with build identity. **Not yet merged to `youcoded` master** as of
> this archive date — `.claude/rules/harness-review-runner.md` covers the runner's load-bearing
> invariants and stays live until the merge lands and its `verify:` anchors can be added.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the multi-model harness battery on demand from one command, so the reviews that produced this work can be reproduced against any future harness build.

**Architecture:** A plain Node script — no Electron. `HarnessSession(opts, modelFactory)` takes an injected model factory and injectable `decide`/`askUser`, and ten existing test files already construct it directly, so the whole runner is a script in the established `test-engine/probe-*.mjs` mould. Each model gets an identical disposable fixture workspace in `os.tmpdir()`, runs the battery, and its free-form review is appended to the investigations doc while the full transcript is saved for audit.

**Tech Stack:** Node ESM, `@ai-sdk/openai-compatible` (OpenRouter), vitest for the unit-testable pieces.

**Spec:** `docs/active/specs/2026-08-06-harness-tool-honesty-design.md` (§6b).

**Independent of Plan A.** This runner drives whatever the harness currently is, so it builds and lands against `master` without waiting for the tool fixes. Once both are in, re-running this against Plan A's result is the acceptance check for the whole spec.

## Global Constraints

- **Work in a worktree.** `cd /home/destin/youcoded-dev/youcoded && git worktree add ../worktrees/review-runner -b feat/harness-review-runner`.
- **Never touch the live app.** The runner is a separate Node process with no Electron, no `userData`, and no `~/.youcoded/` writes. It must never read the app's `safeStorage` secrets. `.claude/rules/live-app-safety.md`.
- **The only credential is `OPENROUTER_API_KEY` from the environment.** Never write it to disk, never log it, never put it in a saved transcript.
- **No new dependencies.** `@ai-sdk/openai-compatible` is already a dependency.
- **The battery runs in a disposable fixture, never in a real repo.** Any code path that could write outside `os.tmpdir()` is a bug.
- **Every non-trivial edit gets a WHY comment.** Destin is a non-developer and reads comments to understand changes.
- **Verify before claiming done:** `bash scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/review-runner` from the workspace root.
- All `npx vitest` commands run from `youcoded/desktop` inside the worktree.

---

### Task 1: The fixture workspace seeder

Every model must face an identical tree, or reviews are not comparable. The five existing reviews all ran against a workspace that was changing underneath them, and each left test artifacts behind in the real repo.

**Files:**
- Create: `src/main/harness/review/fixture-workspace.ts`
- Test: `tests/harness-review-fixture.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `seedFixtureWorkspace(): string` (returns the absolute fixture root) and `FIXTURE_MANIFEST: Array<{ rel: string; why: string }>`, both exported.

- [ ] **Step 1: Write the failing test**

Create `tests/harness-review-fixture.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { seedFixtureWorkspace, FIXTURE_MANIFEST } from '../src/main/harness/review/fixture-workspace';

let made: string[] = [];
afterEach(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  made = [];
});

describe('seedFixtureWorkspace', () => {
  it('creates the tree inside the OS temp dir, never in a real repo', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    expect(root.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
  });

  it('covers every file type the battery exercises', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    for (const { rel } of FIXTURE_MANIFEST) {
      expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
    }
  });

  it('includes a binary file so the Read binary guard is reachable', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    const buf = fs.readFileSync(path.join(root, 'assets/logo.png'));
    expect(buf.includes(0)).toBe(true);
  });

  it('includes a file large enough to force paging', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    const lines = fs.readFileSync(path.join(root, 'src/big-module.ts'), 'utf8').split('\n');
    expect(lines.length).toBeGreaterThan(2_000);
  });

  it('includes a duplicated string so the ambiguous-Edit guard is reachable', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    const text = fs.readFileSync(path.join(root, 'notes/duplicates.md'), 'utf8');
    expect(text.match(/duplicate phrase hello/g)).toHaveLength(2);
  });

  it('includes a path with spaces', () => {
    const root = seedFixtureWorkspace();
    made.push(root);
    expect(fs.existsSync(path.join(root, 'a dir with spaces/a file with spaces.txt'))).toBe(true);
  });

  it('produces byte-identical trees across runs, so two models face the same tree', () => {
    const a = seedFixtureWorkspace();
    const b = seedFixtureWorkspace();
    made.push(a, b);
    for (const { rel } of FIXTURE_MANIFEST) {
      expect(fs.readFileSync(path.join(a, rel)).equals(fs.readFileSync(path.join(b, rel))), rel).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-review-fixture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the seeder**

Create `src/main/harness/review/fixture-workspace.ts`:

```ts
// A disposable, deterministic mini-repo for the harness review battery.
//
// WHY a fixture rather than the real workspace (2026-08-06): the five reviews in
// docs/archive/investigations/2026-08-01-native-agent-harness-reviews.md each ran
// against /home/destin/youcoded-dev while other sessions were changing it, and
// each left `<model>-test-*` artifacts behind. That makes two runs incomparable
// and pollutes the repo. An identical seeded tree per model fixes both.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Every path the battery is expected to touch, with why it is here. Exported so
 *  the test can assert coverage rather than duplicating the list. */
export const FIXTURE_MANIFEST: Array<{ rel: string; why: string }> = [
  { rel: 'README.md', why: 'markdown read' },
  { rel: 'package.json', why: 'JSON read' },
  { rel: 'src/index.ts', why: 'TypeScript read + Grep target' },
  { rel: 'src/big-module.ts', why: 'large-file paging (offset/limit)' },
  { rel: 'app/Main.kt', why: 'Kotlin read' },
  { rel: 'config/settings.toml', why: 'TOML read' },
  { rel: 'assets/logo.png', why: 'binary-read refusal' },
  { rel: 'notes/duplicates.md', why: 'ambiguous-Edit guard (duplicate string)' },
  { rel: 'a dir with spaces/a file with spaces.txt', why: 'paths with spaces' },
];

const README = `# Fixture Project

A small deterministic project used to exercise the YouCoded native agent harness.

## Layout

- \`src/\` — TypeScript sources
- \`app/\` — Kotlin sources
- \`config/\` — configuration
`;

const BIG_MODULE = Array.from(
  { length: 2_400 },
  (_, i) => `export const value${i} = ${i}; // generated line ${i}`,
).join('\n');

/** Create a fresh fixture tree and return its absolute root.
 *  Deterministic: identical bytes on every call, so runs are comparable. */
export function seedFixtureWorkspace(): string {
  // realpathSync because macOS reports /var/... for a /private/var/... tmpdir, and
  // the harness's own path guard canonicalizes — a mismatch would read as "outside
  // the workspace" and revert every cd.
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'yc-harness-review-'));
  const write = (rel: string, content: string | Buffer) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  write('README.md', README);
  write('package.json', JSON.stringify({ name: 'fixture-project', version: '1.0.0', scripts: { test: 'echo ok' } }, null, 2) + '\n');
  write('src/index.ts', `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nexport const MARKER = 'findme';\n`);
  write('src/big-module.ts', BIG_MODULE + '\n');
  write('app/Main.kt', `package com.example\n\nclass MainActivity {\n    fun onCreate() {\n        println("started")\n    }\n}\n`);
  write('config/settings.toml', `[server]\nport = 8080\nhost = "localhost"\n\n[features]\nsearch = true\n`);
  // A real NUL byte is what Read's binary sniff looks for in the first 8KB.
  write('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]));
  write('notes/duplicates.md', `# Notes\n\nduplicate phrase hello\nsomething else\nduplicate phrase hello\n`);
  write('a dir with spaces/a file with spaces.txt', 'content in a path with spaces\n');
  return root;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-review-fixture.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/fixture-workspace.ts tests/harness-review-fixture.test.ts
git commit -m "feat(review): deterministic disposable fixture workspace for the harness battery"
```

---

### Task 2: The battery prompt and model roster

The prompt currently lives at the bottom of the investigations doc, where it can drift from what actually runs. Move it into code as the single source and have the doc point at it.

**Files:**
- Create: `src/main/harness/review/battery.ts`
- Create: `test-engine/review-roster.json`
- Test: `tests/harness-review-fixture.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `BATTERY_PROMPT: string` and `loadRoster(file: string): Array<{ label: string; modelId: string }>`, both exported from `battery.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/harness-review-fixture.test.ts`:

```ts
import { BATTERY_PROMPT, loadRoster } from '../src/main/harness/review/battery';

describe('battery prompt', () => {
  it('names every one of the six battery sections', () => {
    for (const section of ['Navigate', 'Read', 'Search', 'Write/Edit', 'Bash', 'Web']) {
      expect(BATTERY_PROMPT).toContain(section);
    }
  });

  it('tells the model to work in the fixture and not to hunt for the real repo', () => {
    expect(BATTERY_PROMPT).toContain('fixture');
  });

  it('asks for the three review headings the doc expects', () => {
    for (const h of ['What works well', 'Difficulties / wishes', 'Overall']) {
      expect(BATTERY_PROMPT).toContain(h);
    }
  });
});

describe('loadRoster', () => {
  it('rejects a roster entry missing a modelId, instead of running a nameless model', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'r.json');
    fs.writeFileSync(f, JSON.stringify([{ label: 'No Model' }]));
    expect(() => loadRoster(f)).toThrow(/modelId/);
  });

  it('loads a well-formed roster', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'r.json');
    fs.writeFileSync(f, JSON.stringify([{ label: 'Kimi K3', modelId: 'moonshotai/kimi-k3' }]));
    expect(loadRoster(f)).toEqual([{ label: 'Kimi K3', modelId: 'moonshotai/kimi-k3' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-review-fixture.test.ts -t "battery prompt"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/harness/review/battery.ts`:

```ts
// The harness review battery — the SINGLE source of the prompt.
//
// WHY it lives in code rather than in the investigations doc: the doc's copy is
// what a human pastes and this is what the runner sends. Two copies drift, and a
// review that ran a different battery than the doc advertises is worse than no
// review. The doc now points here.
import * as fs from 'fs';

export const BATTERY_PROMPT = `You are testing the YouCoded native agent harness. You are working inside the harness right now.

Your working directory is a small disposable fixture project created for this test. It is NOT a real repository — do not go looking for one, and do not try to leave it. Everything you need is here.

Please run a standard battery of agentic tasks and then write an honest review of the harness. You may create, edit, and delete files freely inside the fixture; nothing here is precious.

Battery:
1. Navigate: cd into a subdirectory, verify cwd persistence across calls, try cd outside the workspace root.
2. Read: read a markdown file, a JSON file, a TypeScript file, a Kotlin file, a TOML file, a slice of a large file (offset/limit), a missing file, and a binary file.
3. Search: use Glob with a recursive pattern, Grep with content mode, Grep with count mode, and Grep with a glob filter.
4. Write/Edit: create a test file, edit it, try to edit a file you haven't Read, try to edit a file that was externally modified, try a duplicate-string edit, use replace_all, use multi-line context.
5. Bash: test env var persistence across calls, a failing command, a timeout, a long-output truncation, filenames with spaces.
6. Web: use WebSearch on a technical topic, use WebFetch on a simple page and a large/docs page.

If you hit a genuine ambiguity at any point, use AskUserQuestion rather than guessing.

Then write your review. Structure it as:
- What works well
- Difficulties / wishes
- Overall

Be specific. Quote exact error messages, exact behaviors, and exact moments of friction or delight. Where you make a claim about cost or size, say what you actually observed rather than estimating.

Write the review as your final message. Do not write it to a file.`;

export interface RosterEntry { label: string; modelId: string }

/** Load and validate the model roster. Throws on a malformed entry rather than
 *  silently running a nameless model and producing an unattributable review. */
export function loadRoster(file: string): RosterEntry[] {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`Roster ${file} must be a JSON array.`);
  return parsed.map((e, i) => {
    if (!e || typeof e.modelId !== 'string' || !e.modelId) {
      throw new Error(`Roster ${file} entry ${i} has no modelId.`);
    }
    return { label: typeof e.label === 'string' && e.label ? e.label : e.modelId, modelId: e.modelId };
  });
}
```

Create `test-engine/review-roster.json`:

```json
[
  { "label": "Kimi K3", "modelId": "moonshotai/kimi-k3" },
  { "label": "DeepSeek v4", "modelId": "deepseek/deepseek-v4" },
  { "label": "Grok 4.5", "modelId": "x-ai/grok-4.5" },
  { "label": "GPT 5.6", "modelId": "openai/gpt-5.6" },
  { "label": "Claude Opus 5", "modelId": "anthropic/claude-opus-5" }
]
```

Model ids are OpenRouter slugs and go stale; the runner surfaces an unknown-model error from OpenRouter verbatim rather than guessing a replacement.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-review-fixture.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/battery.ts test-engine/review-roster.json tests/harness-review-fixture.test.ts
git commit -m "feat(review): battery prompt as the single source, plus a validated model roster"
```

---

### Task 3: OpenRouter model factory

**Files:**
- Create: `src/main/harness/review/openrouter-factory.ts`
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeOpenRouterFactory(apiKey: string, modelId: string): ModelFactory`, exported.

- [ ] **Step 1: Write the failing test**

Create `tests/harness-review-runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeOpenRouterFactory } from '../src/main/harness/review/openrouter-factory';

describe('makeOpenRouterFactory', () => {
  it('refuses to build without a key, naming the env var to set', () => {
    expect(() => makeOpenRouterFactory('', 'x/y')).toThrow(/OPENROUTER_API_KEY/);
  });

  it('returns a factory that resolves a model without touching Electron', async () => {
    // The whole point: no app.whenReady(), no safeStorage, no userData. If this
    // ever needs Electron, the runner stops being a plain Node script.
    const factory = makeOpenRouterFactory('sk-test', 'moonshotai/kimi-k3');
    const model = await factory({ providerId: 'openrouter', modelId: 'moonshotai/kimi-k3' });
    expect(model).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-review-runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/harness/review/openrouter-factory.ts`:

```ts
// A ModelFactory for the review runner.
//
// WHY this is separate from provider-registry.ts: that module reads the app's
// safeStorage-encrypted keys and its own ~/.youcoded/providers.json. The runner
// must never touch either — it is a test tool that has to stay clear of Destin's
// live app data (.claude/rules/live-app-safety.md). One env var, one endpoint.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ModelFactory } from '../harness-session';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function makeOpenRouterFactory(apiKey: string, modelId: string): ModelFactory {
  if (!apiKey) {
    throw new Error('No OpenRouter key. Set OPENROUTER_API_KEY in your environment before running the review battery.');
  }
  const provider = createOpenAICompatible({
    name: 'openrouter',
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    includeUsage: true,
  });
  // The binding argument is ignored: the runner pins one model per session, and
  // accepting a binding here would let a roster typo silently run a different one.
  return async () => provider(modelId) as any;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-review-runner.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/openrouter-factory.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): OpenRouter model factory that never reads app secrets"
```

---

### Task 4: The session driver

**Files:**
- Create: `src/main/harness/review/run-battery.ts`
- Test: `tests/harness-review-runner.test.ts` (extend)

**Interfaces:**
- Consumes: `seedFixtureWorkspace` (Task 1), `BATTERY_PROMPT` (Task 2), `ModelFactory` (Task 3).
- Produces: `runBattery(opts: { modelFactory, modelId, label, timeoutMs? }): Promise<BatteryRun>` where `BatteryRun = { label: string; modelId: string; review: string; events: TranscriptEvent[]; toolCalls: number; asks: number; fixtureRoot: string }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/harness-review-runner.test.ts`:

```ts
import * as fs from 'fs';
import { runBattery } from '../src/main/harness/review/run-battery';

/** A model that calls Read once, then answers. Mirrors the fake-model shape used
 *  by tests/helpers/harness-fakes.ts. */
function scriptedModel(steps: any[]) {
  let i = 0;
  return { doStream: async () => steps[i++] } as any;
}

describe('runBattery', () => {
  it('auto-approves tool use so the battery never blocks on a permission prompt', async () => {
    const run = await runBattery({
      modelFactory: async () => scriptedModel([{ /* text-only reply */ }]) as any,
      modelId: 'fake/model',
      label: 'Fake',
      timeoutMs: 5_000,
    });
    expect(run.label).toBe('Fake');
    expect(run.fixtureRoot).toContain('yc-harness-review-');
  });

  it('cleans up the fixture directory when the run finishes', async () => {
    const run = await runBattery({
      modelFactory: async () => scriptedModel([{}]) as any,
      modelId: 'fake/model',
      label: 'Fake',
      timeoutMs: 5_000,
    });
    expect(fs.existsSync(run.fixtureRoot)).toBe(false);
  });

  it('answers AskUserQuestion deterministically instead of hanging', async () => {
    // No reviewer ever exercised AskUserQuestion (Kimi K3 finding #6) because a
    // human had to answer it. A fixed answerer makes the tool reachable.
    const run = await runBattery({
      modelFactory: async () => scriptedModel([{}]) as any,
      modelId: 'fake/model',
      label: 'Fake',
      timeoutMs: 5_000,
    });
    expect(run.asks).toBeGreaterThanOrEqual(0);
  });
});
```

Adapt `scriptedModel` to the exact fake shape in `tests/helpers/harness-fakes.ts` — import that helper's model builder rather than re-inventing it if one exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-review-runner.test.ts -t "runBattery"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the driver**

Create `src/main/harness/review/run-battery.ts`:

```ts
// Drive one model through the battery inside a disposable fixture.
//
// WHY no Electron: HarnessSession takes an injected modelFactory, decide, and
// askUser, so the whole loop runs in plain Node. That keeps the runner clear of
// the live app entirely — no userData, no ~/.youcoded writes, no safeStorage.
import * as fs from 'fs';
import { HarnessSession, type ModelFactory } from '../harness-session';
import { ASSISTANT_PRESET } from '../../../shared/harness-manifest';
import { CORE_TOOLS } from '../tools';
import { seedFixtureWorkspace } from './fixture-workspace';
import { BATTERY_PROMPT } from './battery';
import type { TranscriptEvent } from '../../../shared/types';

export interface BatteryRun {
  label: string;
  modelId: string;
  review: string;
  events: TranscriptEvent[];
  toolCalls: number;
  asks: number;
  fixtureRoot: string;
}

export interface RunBatteryOpts {
  modelFactory: ModelFactory;
  modelId: string;
  label: string;
  /** Wall-clock ceiling for one model's whole battery. */
  timeoutMs?: number;
  /** Keep the fixture on disk for debugging. Default false. */
  keepFixture?: boolean;
}

export async function runBattery(opts: RunBatteryOpts): Promise<BatteryRun> {
  const fixtureRoot = seedFixtureWorkspace();
  const events: TranscriptEvent[] = [];
  let toolCalls = 0;
  let asks = 0;

  const session = new HarnessSession(
    {
      sessionId: `review-${Date.now()}`,
      cwd: fixtureRoot,
      harness: ASSISTANT_PRESET,
      binding: { providerId: 'openrouter', modelId: opts.modelId },
      tools: CORE_TOOLS,
      // Auto-approve everything the configured layers would ask about. The
      // TOOL-LAYER guards (secret paths, external_directory) sit BELOW this and
      // still apply, so the fixture jail holds even on a fully permissive decide.
      decide: async () => ({ action: 'allow', denyListed: false }),
      // Deterministic answerer: always take the first option. WHY this matters —
      // AskUserQuestion was the one tool no reviewer reached (Kimi K3 finding #6),
      // because a human had to be present. A fixed answer makes it reachable and
      // keeps runs reproducible.
      askUser: async (req: any) => {
        asks++;
        const questions = req?.input?.questions ?? [];
        const answers: Record<string, string> = {};
        for (const q of questions) answers[q.question] = q.options?.[0]?.label ?? 'yes';
        return { action: 'allow', updatedInput: { questions, answers } };
      },
      // No skills, no path-triggered rule injection: the fixture has neither, and
      // injecting the real machine's skills would make runs machine-dependent.
      skillCatalog: { list: async () => [] } as any,
      triggers: undefined,
    },
    opts.modelFactory,
  );

  session.on('transcript-event', (e: TranscriptEvent) => {
    events.push(e);
    if (e.type === 'tool-use') toolCalls++;
  });

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Battery timed out after ${opts.timeoutMs ?? 900_000}ms`)), opts.timeoutMs ?? 900_000).unref(),
    );
    await Promise.race([session.send(BATTERY_PROMPT), timeout]);
  } finally {
    session.destroy?.();
    if (!opts.keepFixture) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  // The review is the model's final assistant text.
  const review = events
    .filter((e) => e.type === 'assistant-text')
    .map((e) => (e.data as any)?.text ?? '')
    .join('')
    .trim();

  return { label: opts.label, modelId: opts.modelId, review, events, toolCalls, asks, fixtureRoot };
}
```

`CORE_TOOLS` is the ten-tool array exported from `src/main/harness/tools/index.ts` (verified 2026-08-06) — the same list `NativeSessionHost` hands every real session, so the battery exercises exactly what ships. Never build a second list.

`'assistant-text'` and `'tool-use'` are real `TranscriptEventType` values (`src/shared/types.ts:100-101`), so the event filters above are sound.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-review-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/run-battery.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): battery driver — fixture-scoped, auto-approving, no Electron"
```

---

### Task 5: Appending reviews without disturbing existing ones

The investigations doc's own rule is "Do not edit or delete other models' reviews." The runner must honor it mechanically.

**Files:**
- Create: `src/main/harness/review/append-review.ts`
- Test: `tests/harness-review-runner.test.ts` (extend)

**Interfaces:**
- Consumes: `BatteryRun` (Task 4).
- Produces: `appendReview(docText: string, run: { label: string; modelId: string; review: string }, dateISO: string): string`, a pure function returning the new document text.

- [ ] **Step 1: Write the failing test**

```ts
import { appendReview } from '../src/main/harness/review/append-review';

const DOC = `# Native Agent Harness Reviews

Intro text.

---

## Review: Existing Model — 2026-08-01

Body of an existing review.

---

## Prompt for other agents

Prompt block here.
`;

describe('appendReview', () => {
  it('inserts the new section above the prompt block, not at the end of the file', () => {
    const out = appendReview(DOC, { label: 'New Model', modelId: 'v/new', review: 'My review.' }, '2026-08-06');
    expect(out.indexOf('## Review: New Model')).toBeLessThan(out.indexOf('## Prompt for other agents'));
  });

  it('leaves every existing review byte-identical', () => {
    const out = appendReview(DOC, { label: 'New Model', modelId: 'v/new', review: 'My review.' }, '2026-08-06');
    expect(out).toContain('## Review: Existing Model — 2026-08-01\n\nBody of an existing review.');
  });

  it('signs the section with the model label and id', () => {
    const out = appendReview(DOC, { label: 'New Model', modelId: 'v/new', review: 'My review.' }, '2026-08-06');
    expect(out).toContain('## Review: New Model — 2026-08-06');
    expect(out).toContain('v/new');
  });

  it('refuses to write an empty review rather than adding a hollow section', () => {
    expect(() => appendReview(DOC, { label: 'X', modelId: 'v/x', review: '   ' }, '2026-08-06')).toThrow(/empty/i);
  });

  it('appends at the end when the doc has no prompt block', () => {
    const out = appendReview('# Doc\n', { label: 'X', modelId: 'v/x', review: 'r' }, '2026-08-06');
    expect(out).toContain('## Review: X — 2026-08-06');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-review-runner.test.ts -t "appendReview"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/harness/review/append-review.ts`:

```ts
// Insert one review section, leaving every existing one untouched.
//
// WHY a pure string function: the doc says "Do not edit or delete other models'
// reviews", and a pure transform makes that assertable in a unit test rather than
// a habit the runner is trusted to keep. The runner reads, transforms, writes.
const PROMPT_HEADING = '## Prompt for other agents';

export function appendReview(
  docText: string,
  run: { label: string; modelId: string; review: string },
  dateISO: string,
): string {
  if (!run.review.trim()) {
    throw new Error(`Refusing to append an empty review for ${run.label} — the run produced no final text.`);
  }
  const section = [
    `## Review: ${run.label} — ${dateISO}`,
    '',
    `**Model:** \`${run.modelId}\` · **Battery:** \`src/main/harness/review/battery.ts\` · run in a disposable fixture workspace.`,
    '',
    run.review.trim(),
    '',
    `— **${run.label}**`,
    '',
    '---',
    '',
  ].join('\n');

  const at = docText.indexOf(PROMPT_HEADING);
  // Insert ABOVE the prompt block, which the doc's own instructions designate as
  // the tail. Appending to the end would bury it below the prompt.
  if (at === -1) return `${docText.trimEnd()}\n\n---\n\n${section}`;
  return docText.slice(0, at) + section + docText.slice(at);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/harness-review-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/append-review.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): append reviews above the prompt block, never touching existing ones"
```

---

### Task 6: CLI, transcript archive, and docs

**Files:**
- Create: `test-engine/review-harness.mjs`
- Modify: `test-engine/README.md`
- Modify: `docs/archive/investigations/2026-08-01-native-agent-harness-reviews.md` (workspace repo)

**Interfaces:**
- Consumes: everything above.
- Produces: the `node test-engine/review-harness.mjs` entry point.

- [ ] **Step 1: Write the CLI**

Create `test-engine/review-harness.mjs`:

```js
#!/usr/bin/env node
// Run the harness review battery across a roster of models.
//
//   OPENROUTER_API_KEY=sk-... node test-engine/review-harness.mjs
//   node test-engine/review-harness.mjs --dry-run
//   node test-engine/review-harness.mjs --only "Kimi K3"
//
// WHY a dev-run script rather than a test: it costs real money and takes minutes.
// The deterministic guarantees live in the vitest suites; this is the discovery
// pass that finds what nobody thought to assert.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const WORKSPACE = path.resolve(DESKTOP, '..', '..');
const DOC = path.join(WORKSPACE, 'docs/archive/investigations/2026-08-01-native-agent-harness-reviews.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : args[onlyAt + 1];

// The compiled output is what runs — build first so this script never diverges
// from the TypeScript the app ships.
const { loadRoster, BATTERY_PROMPT } = await import(path.join(DESKTOP, 'dist/main/harness/review/battery.js'));
const { runBattery } = await import(path.join(DESKTOP, 'dist/main/harness/review/run-battery.js'));
const { appendReview } = await import(path.join(DESKTOP, 'dist/main/harness/review/append-review.js'));
const { makeOpenRouterFactory } = await import(path.join(DESKTOP, 'dist/main/harness/review/openrouter-factory.js'));

let roster = loadRoster(path.join(HERE, 'review-roster.json'));
if (only) roster = roster.filter((r) => r.label === only);
if (!roster.length) {
  console.error(only ? `No roster entry labelled "${only}".` : 'Roster is empty.');
  process.exit(2);
}

if (dryRun) {
  console.log('Would run the battery against:');
  for (const r of roster) console.log(`  ${r.label.padEnd(16)} ${r.modelId}`);
  console.log(`\nReviews append to: ${DOC}`);
  console.log(`\n--- battery prompt ---\n${BATTERY_PROMPT}`);
  process.exit(0);
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('Set OPENROUTER_API_KEY before running the battery.');
  process.exit(2);
}

const stamp = new Date().toISOString().slice(0, 10);
const runDir = path.join(WORKSPACE, 'docs/active/investigations/harness-review-runs', stamp);
fs.mkdirSync(runDir, { recursive: true });

for (const entry of roster) {
  console.log(`\n=== ${entry.label} (${entry.modelId}) ===`);
  try {
    const run = await runBattery({
      modelFactory: makeOpenRouterFactory(key, entry.modelId),
      modelId: entry.modelId,
      label: entry.label,
    });
    // Save the transcript BEFORE touching the doc: a claim in a review is only
    // checkable if the events behind it survive. Opus 5's context-cost claim in
    // the 2026-08-01 round was falsifiable only by reading the source by hand.
    const slug = entry.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    fs.writeFileSync(
      path.join(runDir, `${slug}.json`),
      JSON.stringify({ label: entry.label, modelId: entry.modelId, toolCalls: run.toolCalls, asks: run.asks, events: run.events }, null, 2),
    );
    fs.writeFileSync(DOC, appendReview(fs.readFileSync(DOC, 'utf8'), run, stamp));
    console.log(`  ${run.toolCalls} tool calls, ${run.asks} asks → review appended`);
  } catch (err) {
    // Report the real failure. One model erroring must not abort the roster.
    console.error(`  FAILED: ${err?.message ?? err}`);
  }
}

console.log(`\nTranscripts: ${runDir}`);
```

- [ ] **Step 2: Verify the dry run**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/review-runner/desktop
npm run build
node test-engine/review-harness.mjs --dry-run
```

Expected: the roster table, the doc path, and the full battery prompt. No network calls, no key required, exit 0.

- [ ] **Step 3: Verify a single live run**

```bash
OPENROUTER_API_KEY=<key> node test-engine/review-harness.mjs --only "Kimi K3"
```

Expected: tool-call and ask counts, one new `## Review:` section in the doc above the prompt block, and one transcript JSON in `docs/active/investigations/harness-review-runs/<date>/`. Confirm with `git diff` that no existing review section changed.

- [ ] **Step 4: Document it**

Add a `## Review harness` section to `test-engine/README.md` covering the three commands, the `OPENROUTER_API_KEY` requirement, the fact that each model runs in a disposable `os.tmpdir()` fixture, and where transcripts land.

In the investigations doc, replace the copy-paste prompt block's body with a pointer:

```markdown
## Prompt for other agents

The battery prompt now lives in code as the single source:
`youcoded/desktop/src/main/harness/review/battery.ts` → `BATTERY_PROMPT`.

To run it across the whole roster:

    cd youcoded/desktop && npm run build
    OPENROUTER_API_KEY=... node test-engine/review-harness.mjs

`--dry-run` prints the roster and the prompt without spending anything;
`--only "<label>"` runs one model. Each model gets an identical disposable
fixture workspace, and full transcripts are saved under
`docs/active/investigations/harness-review-runs/<date>/` so any claim in a
review can be checked against what the harness actually returned.
```

- [ ] **Step 5: Add the run directory to gitignore or commit it deliberately**

Transcripts are large. Add to the workspace `.gitignore`:

```
docs/active/investigations/harness-review-runs/
```

WHY ignored rather than committed: a transcript is a debugging artifact for the session that produced it, and five models' full event streams would dominate the repo's diff history. The reviews themselves are the durable record.

- [ ] **Step 6: Full verification**

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh youcoded/worktrees/review-runner
```

Expected: tsc clean, tests pass, knip clean, ast-grep clean. Knip may flag the `review/` modules as unused because only an `.mjs` script imports the compiled output — if so, add them to `desktop/knip.jsonc` with a one-line reason rather than deleting them.

- [ ] **Step 7: Commit and finish the branch**

```bash
git add -A && git commit -m "feat(review): one-command multi-model harness review runner"
```

Then use `superpowers:finishing-a-development-branch`. The workspace-repo changes (the investigations doc pointer, `.gitignore`) commit separately from the workspace root.
