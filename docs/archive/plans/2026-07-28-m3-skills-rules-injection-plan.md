---
status: shipped
date: 2026-07-28
milestone: M3 items 1, 3, 5 (Native Runtime Parity Program §4)
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md
handoff: docs/active/handoffs/2026-07-24-m3-context-skills-commands-handoff.md
repos: [youcoded]
branch: feat/native-local-reliability-rebase
verified_against: branch `f65245ae` (master merged 2026-07-28)
---

# M3 — Skills, path-scoped rules, and capability-gated injection

> **SHIPPED 2026-07-29 — youcoded PR #268, merge `12f71d07`.** All nine tasks
> complete, including Task 9's post-merge half (MAP rows, program §4 flip, rule
> banner + restored `verify:` anchors, docs archived).
>
> **What happened between task 8 and the merge, none of it in this plan.** Destin
> dogfooded it and eight more fixes landed:
> the skill catalog had to accept a BARE name (`scanSkills` namespaces plugin
> skills as `<plugin>:<skill>`, so ALL 16 installed skills were unreachable by the
> name a user types); a user-invoked skill became a compact CARD instead of 26k
> characters of user message; that card needed a real bubble surface; the
> injection needed imperative framing or the model narrated the skill instead of
> running it; the invocation had to register as a TURN START so the thinking
> indicator ran; the skill name became the link to its SKILL.md; the capability
> gate had to add a capability conjunction (a 2B at `-c 128000` has room but is
> not fit to choose skills); and `/clear` had to stop wiping the visible timeline.
> Two audit agents over the progress/token chain then found six more, and CI
> caught a machine-dependent test that passed on three of four platforms.
>
> **The honest read on this plan: tasks 1–8 were the smaller half of the work.**
> Everything above came from using the feature, not from planning it.
>
> Four deviations from this plan, each forced by something the plan did not know
> and each recorded in its commit:
> 1. **Task 2** — `Skill` is NOT added to `NATIVE_TOOL_NAMES`. The registry↔manifest
>    guard rejected it, correctly: whether Skill exists depends on the model, so
>    advertising it statically is the exact sin that guard exists to catch. It is
>    a `CONDITIONAL_TOOL_NAME` instead.
> 2. **Task 3** — frontier hosted providers are exempt from window-based sizing.
>    The plan's flat "derive from the window" would have stripped the skill
>    catalog from every cloud session, since we never discover Anthropic's window
>    and `null` there means "not measured", not "small".
> 3. **Task 5** — no `knownSkillIds` plumbing. An unrecognized slash command rides
>    the existing `handled: false` branch carrying an invoke-skill intent, so
>    Claude Code is untouched and the harness (which owns the catalog) resolves it.
> 4. **Task 6** — `routeSlashResult` extracted, because deviation 3 broke BOTH
>    callers at once (each checked `handled` before `nativeAction`).
>
> Two things found while implementing, both now fixed and pinned:
> - `ipc-channels.test.ts` covers remote-shim/Android **per-prefix**, and `native:*`
>   had no block — so "four-surface parity" was two-thirds true for the whole
>   native runtime. Verified by deleting a channel from the shim and watching the
>   file stay green.
> - `HarnessManifest.tools` has **no consumer anywhere**; every session gets
>   `CORE_TOOLS` regardless of what a preset declares. Pre-existing, out of scope
>   here, worth a ROADMAP entry.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YouCoded's own ecosystem — skills, project rules, nested project
instructions — work in a native session, sized to what the model can actually hold.

**Architecture:** Three M3 items collapse into **one mechanism plus one tool.** Items 3
(path-scoped rules + nested `CLAUDE.md`) and 5 (capability-gated injection) are the same
thing viewed twice: *content discovered from a path, delivered as a message, bounded by
what the profile says the window can afford.* Item 1 adds a `Skill` tool on top of that
mechanism, plus the user-invoked `/skill-name` path and the three UI surfaces that are
silent today. Nothing touches the system prompt — it is byte-stable by construction and
every injection arrives as a message, exactly as Claude Code does it.

**Tech Stack:** TypeScript, Electron main process, Vercel AI SDK v7 (`ai@7`), Zod schemas,
Vitest.

## Answers that scope this plan

Destin, 2026-07-28:

- **Q1 — skill invocation:** *profile-gated both.* `/skill-name` always works;
  the model-invoked `Skill` tool is attached only when the profile says the window can
  afford a catalog of skill descriptions on every turn.
- **Q2 — `/clear`:** *barrier* (answered 2026-07-25, already shipped in `55fcd502`).
- **Q3 — `/compact`:** *Plan C first* — landed. Item 2 is done; item 5 now has a real
  `CapabilityProfile` to gate on instead of a placeholder.
- **Q5 — ThemeScreen:** *invoke the skill in the current session.* Not a new session.
- **Q4 — MCP (item 4):** deferred to its own design pass and PR. **Out of scope here.**
- **Q6 — manifest `skills`/`mcp` fields:** resolved in Task 2 (`skills` becomes a real
  per-preset allowlist) and Task 9 (`mcp` documented as reserved, not deleted, because the
  MCP pass lands next).

## Global Constraints

Copied verbatim from the handoff §4. Every task's requirements implicitly include these.

1. **Byte-stable system prompt.** Injection is messages, never mid-session prompt mutation.
2. **Append-only session JSONL, header written once.** Every new persisted concept is a new
   event type on lines 2+.
3. **Four-surface IPC parity** — `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`,
   `SessionService.kt` — Android stubs honest, `desktop/tests/ipc-channels.test.ts` green.
4. **Fakes must be able to express failure** — the #177 lesson. A fake skill store must be
   able to fail, and a test must exercise that failure.
5. **Every user-facing error follows `docs/error-message-standards.md`** — specific and
   accurate, or general and non-committal with Report-bug / Diagnose-with-Claude. Never a
   guessed cause.
6. **WHY comments on non-trivial edits** (Destin is a non-developer and reads them).
7. **Never touch the live built app.** Dev testing only via
   `bash scripts/run-dev.sh plan-c --label "M3 Skills" --profile m3`.
8. **Flag interactive/visual verification for Destin** instead of building a CDP rig.
9. **The remote web client is in scope.** Whatever ships must work over remote access or
   degrade honestly — never silently no-op.
10. **No new "not available yet" shims.** This milestone deletes shims; it does not add them.

---

## Verified starting state (branch `f65245ae`, checked against the tree)

Do not trust the handoff's file:line refs — they were taken against a master 250+ commits
back. These were re-verified today:

- **Ten native tools, no `Skill` tool.** `NATIVE_TOOL_NAMES`
  (`desktop/src/shared/harness-manifest.ts:27`) = Read, Write, Edit, Bash, Glob, Grep,
  WebFetch, WebSearch, TodoWrite, AskUserQuestion.
- **`HarnessManifest.skills` / `.mcp` still have zero consumers** anywhere under
  `src/main/harness/`.
- **`scanSkills()` does not return skill content.** It returns `SkillEntry` whose `prompt`
  is the string `` `/${id}` `` — a slash command, not the SKILL.md body — and it **discards
  the skill's directory**. On-disk layout is `<root>/skills/<name>/SKILL.md`; the scanner
  already parses that file's frontmatter via `readSkillMeta` (`skill-scanner.ts:203`) and
  throws the path away. This is the single biggest gap between "discovery is solved" (the
  handoff's claim, true for the UI) and what a native execution path needs.
- **`CapabilityProfile` exists now** (`src/main/harness/capability-profile.ts:9`) with
  `maxToolPresentation`, `promptVariant`, `doomLoopThreshold`, `supportsParallelToolCalls`,
  `constrainToolArgs`, `supportsTools`. **It carries no size budget** — item 5 must add one.
- **`prompt-assembly.ts:32` takes the FIRST `AGENTS.md`-or-`CLAUDE.md` walking cwd → git
  root, truncated at 20 000 chars.** Nested discovery is genuinely absent. (Note for Destin:
  this workspace's own `CLAUDE.md` is 20 295 chars, so it is being cut mid-file today.)
- **The three silent surfaces are still silent for everything except `/clear` and
  `/compact`,** which Plan C routed through `runSlashResult`:

  | Path | Code | Today |
  |---|---|---|
  | Typed in the input bar | `InputBar.tsx:376-384` | native action, else honest toast |
  | Command drawer | `App.tsx:2135-2146` | native action, else `guardedPtySend` → **silent false** |
  | Skill whose prompt starts `/` | `App.tsx:2191-2205` | same → **silent** |
  | ThemeScreen "Build New Theme" | `ThemeScreen.tsx:242` → `App.tsx:3158-3161` | return value **ignored** → fully dead |

- **Interactive tools are driver-routed** (`harness-session.ts:1172`): `tool.interactive`
  skips guards/decide and calls `askUser()`. `Skill` is **not** interactive — it has a real
  side effect (injecting instructions) and must go through the normal permission path.
- **`buildAiTools()`** (`harness-session.ts`) already honors
  `profile.maxToolPresentation === 'simplified'` by swapping `shortDescription` for
  `description`. The Skill tool's catalog gating hooks in beside that.

---

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `desktop/src/main/harness/skills/skill-catalog.ts` | Resolve skill id → directory → `SKILL.md` body + frontmatter. The one place that knows the on-disk layout. |
| `desktop/src/main/harness/tools/skill.ts` | The `Skill` tool. Thin: validate id, ask the catalog, return the body as tool output. |
| `desktop/src/main/harness/injection/path-triggers.ts` | Discover path-scoped rules and nested project instructions; match a touched path to the content it triggers. Shared by items 3a and 3b. |
| `desktop/src/main/harness/injection/injection-budget.ts` | Fit injected content to the profile's budget; honest truncation notice. |

**Modify:**

| File | Change |
|---|---|
| `desktop/src/main/skill-scanner.ts` | Carry the resolved skill directory on `SkillEntry`. |
| `desktop/src/shared/types.ts` | `SkillEntry.skillDir?: string`. |
| `desktop/src/shared/harness-manifest.ts` | Add `'Skill'` to `NATIVE_TOOL_NAMES`; make `skills` a real per-preset allowlist. |
| `desktop/src/main/harness/capability-profile.ts` | Add `exposeSkillCatalog` + `injectionBudgetTokens`; derive both from the real window. |
| `desktop/src/main/harness/harness-session.ts` | Attach `Skill` under the gate; inject path-triggered content after tool results. |
| `desktop/src/renderer/state/slash-command-dispatcher.ts` | `/skill-name` → a native action. |
| `desktop/src/renderer/App.tsx` | Stop the two silent paths; wire ThemeScreen's button. |
| `desktop/src/renderer/components/ThemeScreen.tsx` | Route through the dispatcher, not raw PTY text. |

**Why `injection/` is its own directory:** items 3 and 5 are one mechanism, and the harness
session file is already the most-churned file on this branch. Keeping discovery, matching,
and budgeting out of it means a reviewer can read the whole mechanism in two small files.

---

## Task sequence

Tasks 1–2 are the skill spine. Task 3 is item 5 and gates task 4. Tasks 5–6 are the
surfaces. Tasks 7–8 are item 3. Task 9 is close-out. Each ends with a green test run and a
commit.

---

### Task 1: Skill catalog — id → SKILL.md body

**Files:**
- Create: `desktop/src/main/harness/skills/skill-catalog.ts`
- Modify: `desktop/src/main/skill-scanner.ts` (thread the skill dir through `addSkill`)
- Modify: `desktop/src/shared/types.ts` (`SkillEntry.skillDir?: string`)
- Test: `desktop/tests/skill-catalog.test.ts`

**Interfaces:**
- Consumes: `scanSkills()` from `src/main/skill-scanner.ts`.
- Produces:
  ```ts
  export interface LoadedSkill { id: string; displayName: string; description: string; body: string }
  export interface SkillCatalog {
    list(): Array<{ id: string; description: string }>;
    load(id: string): LoadedSkill;      // throws SkillNotFound / SkillUnreadable
  }
  export class SkillNotFound extends Error { constructor(public readonly id: string, public readonly known: string[]) }
  export class SkillUnreadable extends Error { constructor(public readonly id: string, public readonly cause: string) }
  export function createSkillCatalog(entries?: SkillEntry[]): SkillCatalog
  ```

- [ ] **Step 1: Write the failing test**

`desktop/tests/skill-catalog.test.ts`:

```ts
// The catalog is the ONE place that knows skills live at
// <root>/skills/<name>/SKILL.md. scanSkills() finds them but returns
// `prompt: '/<id>'` — a slash command, not the instructions — and throws the
// directory away, so a native execution path has nothing to load. This closes
// that gap without inventing a second registry.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createSkillCatalog, SkillNotFound, SkillUnreadable } from '../src/main/harness/skills/skill-catalog';
import type { SkillEntry } from '../src/shared/types';

function fixture(body: string): { dir: string; entry: SkillEntry } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
  return {
    dir,
    entry: { id: 'demo', displayName: 'Demo', description: 'A demo skill', category: 'other',
             prompt: '/demo', source: 'plugin', type: 'plugin', visibility: 'published',
             skillDir: dir } as SkillEntry,
  };
}

describe('skill catalog', () => {
  it('loads a skill body from its directory', () => {
    const { entry } = fixture('---\nname: demo\n---\nStep one. Step two.');
    const skill = createSkillCatalog([entry]).load('demo');
    expect(skill.body).toContain('Step one');
    expect(skill.displayName).toBe('Demo');
  });

  it('strips frontmatter — the model gets instructions, not YAML', () => {
    const { entry } = fixture('---\nname: demo\ndescription: x\n---\nActual instructions.');
    expect(createSkillCatalog([entry]).load('demo').body.trim()).toBe('Actual instructions.');
  });

  it('lists id + description for the tool schema, nothing heavier', () => {
    const { entry } = fixture('---\nname: demo\n---\nbody');
    expect(createSkillCatalog([entry]).list()).toEqual([{ id: 'demo', description: 'A demo skill' }]);
  });

  it('SkillNotFound names what IS available — a bare "not found" strands the model', () => {
    const { entry } = fixture('---\nname: demo\n---\nbody');
    const err = (() => { try { createSkillCatalog([entry]).load('nope'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(SkillNotFound);
    expect((err as SkillNotFound).known).toEqual(['demo']);
  });

  it('an entry with no directory is unreadable, not silently empty', () => {
    // The failure the #177 lesson demands be representable: a skill the UI can
    // see but the harness cannot read must SAY so, not return "".
    const entry = { id: 'ghost', displayName: 'Ghost', description: 'd', category: 'other',
                    prompt: '/ghost', source: 'plugin', type: 'plugin', visibility: 'published' } as SkillEntry;
    expect(() => createSkillCatalog([entry]).load('ghost')).toThrow(SkillUnreadable);
  });

  it('a directory without SKILL.md is unreadable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-empty-'));
    const entry = { id: 'empty', displayName: 'E', description: 'd', category: 'other',
                    prompt: '/empty', source: 'plugin', type: 'plugin', visibility: 'published',
                    skillDir: dir } as SkillEntry;
    expect(() => createSkillCatalog([entry]).load('empty')).toThrow(SkillUnreadable);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/skill-catalog.test.ts`
Expected: FAIL — `Failed to resolve import ".../skills/skill-catalog"`.

- [ ] **Step 3: Add `skillDir` to `SkillEntry`**

In `desktop/src/shared/types.ts`, inside `export interface SkillEntry`, after `sourceSubdir?: string;`:

```ts
  // Absolute path to the skill's own directory (the one holding SKILL.md).
  // Populated by scanSkills for filesystem-discovered skills. The native harness
  // needs it because `prompt` is only the slash-command string — it carries no
  // instructions — and the scanner otherwise discards the path it already knew.
  // Absent for registry-only entries the user has not installed.
  skillDir?: string;
```

- [ ] **Step 4: Thread the directory through `scanSkills`**

In `desktop/src/main/skill-scanner.ts`, add a parameter to `addSkill` and pass it at every
call site. Change the signature:

```ts
  function addSkill(
    id: string,
    fallbackName: string,
    fallbackDesc: string,
    inferredSource: 'youcoded-core' | 'self' | 'plugin',
    pluginName?: string,
    // The directory holding this skill's SKILL.md. We already computed it to read
    // the frontmatter; keeping it lets the native harness load the instructions
    // instead of re-deriving the layout in a second place.
    skillDir?: string,
  ) {
```

and in BOTH branches of the function body add `skillDir` to the pushed object:

```ts
      skills.push({ id, ...curated, type: curated.type || 'plugin',
                    visibility: curated.visibility || 'published', pluginName, skillDir } as SkillEntry);
```
```ts
      skills.push({ id, displayName: /* unchanged */, description: fallbackDesc || `Run the ${fallbackName} skill`,
                    category: 'other', prompt: `/${id}`, source: inferredSource,
                    type: 'plugin', visibility: 'published', pluginName, skillDir });
```

Then at each `addSkill(...)` call site, pass the `skillDir` variable already in scope (the
directory whose `SKILL.md` `readSkillMeta` was handed). Search for `addSkill(` — there are
three call sites (plugin scan, marketplace `installPath` scan, user `~/.claude/skills`).

- [ ] **Step 5: Write the catalog**

`desktop/src/main/harness/skills/skill-catalog.ts`:

```ts
// Skill loading for the native harness.
//
// WHY this exists: scanSkills() solves DISCOVERY — it finds every skill across
// three roots and parses each SKILL.md's frontmatter. But it returns
// `prompt: '/<id>'` (a slash command for the UI to send to Claude Code) and drops
// the directory, so nothing in the app can actually READ a skill's instructions.
// Claude Code does that step itself; the native harness has to.
//
// One place knows the on-disk layout (<skillDir>/SKILL.md). Do not add a second.
import * as fs from 'fs';
import * as path from 'path';
import { scanSkills } from '../../skill-scanner';
import type { SkillEntry } from '../../../shared/types';

export interface LoadedSkill { id: string; displayName: string; description: string; body: string }

export interface SkillCatalog {
  /** id + description only — this is what rides in the tool schema on EVERY turn,
   *  so it must stay small. Never include bodies here. */
  list(): Array<{ id: string; description: string }>;
  load(id: string): LoadedSkill;
}

export class SkillNotFound extends Error {
  constructor(public readonly id: string, public readonly known: string[]) {
    // Naming what IS available turns a dead end into a next step — a bare
    // "not found" leaves the model guessing at ids.
    super(`No skill named '${id}'. Available skills: ${known.length ? known.join(', ') : '(none installed)'}.`);
    this.name = 'SkillNotFound';
  }
}

export class SkillUnreadable extends Error {
  constructor(public readonly id: string, public readonly cause: string) {
    // Specific and accurate per docs/error-message-standards.md — surface the real
    // reason (missing path, unreadable file), never a guess.
    super(`The skill '${id}' is installed but its instructions could not be read: ${cause}`);
    this.name = 'SkillUnreadable';
  }
}

/** Drop YAML frontmatter. The model needs the instructions; the metadata is ours. */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  return end === -1 ? raw : raw.slice(raw.indexOf('\n', end + 1) + 1);
}

export function createSkillCatalog(entries: SkillEntry[] = scanSkills()): SkillCatalog {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return {
    list: () => entries.map((e) => ({ id: e.id, description: e.description })),
    load(id: string): LoadedSkill {
      const entry = byId.get(id);
      if (!entry) throw new SkillNotFound(id, [...byId.keys()]);
      if (!entry.skillDir) throw new SkillUnreadable(id, 'it has no installed directory on this machine');
      const file = path.join(entry.skillDir, 'SKILL.md');
      let raw: string;
      try {
        raw = fs.readFileSync(file, 'utf8');
      } catch (err: any) {
        throw new SkillUnreadable(id, `${file} could not be read (${err?.code ?? err?.message ?? 'unknown error'})`);
      }
      return { id, displayName: entry.displayName, description: entry.description, body: stripFrontmatter(raw).trim() };
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd desktop && npx vitest run tests/skill-catalog.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Verify the scanner change didn't break its own suite**

Run: `cd desktop && npx vitest run tests/skill-scanner.test.ts tests/skill-provider.test.ts`
Expected: PASS. If either asserts on a full `SkillEntry` deep-equal, update the fixture to
include `skillDir` — do not remove the field.

- [ ] **Step 8: Mutation-verify**

Change `stripFrontmatter` to `return raw;`, re-run — the "strips frontmatter" test must
FAIL. Restore. Change `SkillNotFound`'s `known` to `[]`, re-run — the "names what IS
available" test must FAIL. Restore.

- [ ] **Step 9: Commit**

```bash
git add desktop/src/main/harness/skills/skill-catalog.ts desktop/src/main/skill-scanner.ts \
        desktop/src/shared/types.ts desktop/tests/skill-catalog.test.ts
git commit -m "feat(native): skill catalog — load a skill's actual instructions

scanSkills() solved discovery but returns '/<id>' as the prompt and discards the
skill directory, so nothing could read a skill's SKILL.md. Claude Code performs
that step itself; the native harness had no equivalent. One module now owns the
on-disk layout, with both failure modes representable and tested."
```

---

### Task 2: The `Skill` tool

**Files:**
- Create: `desktop/src/main/harness/tools/skill.ts`
- Modify: `desktop/src/main/harness/tools/index.ts`
- Modify: `desktop/src/shared/harness-manifest.ts`
- Test: `desktop/tests/skill-tool.test.ts`

**Interfaces:**
- Consumes: `createSkillCatalog`, `SkillNotFound`, `SkillUnreadable` (Task 1);
  `defineTool` from `../registry`; `NativeTool`, `ToolContext` from `../types`.
- Produces: `export function createSkillTool(catalog: SkillCatalog): NativeTool<{ skill: string }>`

**Design notes for the implementer:**

- **`Skill` is NOT `interactive`.** Interactive routing (`harness-session.ts:1172`) skips
  guards and permission entirely, which is right for AskUserQuestion (asking permission to
  ask a question is absurd) and wrong here — loading instructions is a real effect.
- **`permissionSubject` returns the skill id.** That makes "always allow the `journal`
  skill" expressible as a permission rule, same as a Bash command string.
- **Errors return as tool results, not throws.** `defineTool` would relabel a throw as
  `Skill failed: …`, losing the actionable text. Catch and return `isError: true`.

- [ ] **Step 1: Write the failing test**

`desktop/tests/skill-tool.test.ts`:

```ts
// The Skill tool hands the model a skill's instructions as tool output — the
// same shape Claude Code produces by reading SKILL.md itself. It rides
// defineTool() so it inherits truncation and abort labeling like every other tool.
import { describe, it, expect } from 'vitest';
import { createSkillTool } from '../src/main/harness/tools/skill';
import { SkillNotFound, SkillUnreadable, type SkillCatalog } from '../src/main/harness/skills/skill-catalog';

const ctx = { sessionId: 's', cwd: '/tmp', signal: new AbortController().signal,
              readRegistry: new Map(), todos: [] } as any;

function catalogOf(body: string): SkillCatalog {
  return {
    list: () => [{ id: 'journal', description: 'Write a journal entry' }],
    load: (id) => { if (id !== 'journal') throw new SkillNotFound(id, ['journal']);
                    return { id, displayName: 'Journal', description: 'd', body }; },
  };
}

describe('Skill tool', () => {
  it('returns the skill body so the model can follow it', async () => {
    const res = await createSkillTool(catalogOf('1. Open the journal.')).execute({ skill: 'journal' }, ctx);
    expect(res.text).toContain('1. Open the journal.');
    expect(res.isError).toBeFalsy();
  });

  it('an unknown skill is an actionable tool result, not a throw', async () => {
    // defineTool relabels a throw as "Skill failed: …", which would bury the list
    // of skills that DO exist — the one thing that lets the model recover.
    const res = await createSkillTool(catalogOf('x')).execute({ skill: 'nope' }, ctx);
    expect(res.isError).toBe(true);
    expect(res.text).toContain('journal');
  });

  it('an unreadable skill says why, and never returns empty instructions', async () => {
    const broken: SkillCatalog = {
      list: () => [{ id: 'broken', description: 'd' }],
      load: () => { throw new SkillUnreadable('broken', 'SKILL.md could not be read (ENOENT)'); },
    };
    const res = await createSkillTool(broken).execute({ skill: 'broken' }, ctx);
    expect(res.isError).toBe(true);
    expect(res.text).toContain('ENOENT');
    expect(res.text).not.toBe('');
  });

  it('the permission subject is the skill id, so rules can name one skill', () => {
    expect(createSkillTool(catalogOf('x')).permissionSubject({ skill: 'journal' })).toBe('journal');
  });

  it('is NOT interactive — loading instructions is a real effect and must be gated', () => {
    // Interactive tools skip guards AND permission entirely (harness-session.ts).
    expect(createSkillTool(catalogOf('x')).interactive).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/skill-tool.test.ts`
Expected: FAIL — cannot resolve `../src/main/harness/tools/skill`.

- [ ] **Step 3: Write the tool**

`desktop/src/main/harness/tools/skill.ts`:

```ts
// Skill — load a named skill's instructions into the conversation.
//
// Claude Code performs this step implicitly: it reads the skill's SKILL.md and
// follows it. The native harness has no such step, so a skill is exposed as a
// tool whose output IS the instructions. The model then follows them the same way
// it follows any tool result.
//
// Deliberately NOT `interactive`: that flag skips guards AND the permission
// decision (correct for AskUserQuestion, wrong here — a skill can instruct real
// side effects, so it goes through the normal decide() path like every other tool).
import { z } from 'zod';
import { defineTool } from './registry';
import type { NativeTool, ToolContext, ToolResultPayload } from './types';
import type { SkillCatalog } from '../skills/skill-catalog';

const schema = z.object({
  skill: z.string().describe('The id of the skill to load, exactly as listed in this tool\'s description.'),
});

export function createSkillTool(catalog: SkillCatalog): NativeTool<z.infer<typeof schema>> {
  return defineTool<z.infer<typeof schema>>({
    name: 'Skill',
    description:
      'Load a named skill\'s instructions and follow them. Use this when the user asks for '
      + 'something a skill covers. Available skills:\n'
      + catalog.list().map((s) => `- ${s.id}: ${s.description}`).join('\n'),
    shortDescription: 'Load a named skill\'s instructions. Skills: '
      + catalog.list().map((s) => s.id).join(', '),
    inputSchema: schema,
    // The skill id is the permission subject, so "always allow the journal skill"
    // is expressible as a rule — same as a Bash command string.
    permissionSubject: (a) => a.skill,
    async execute(args, _ctx: ToolContext): Promise<ToolResultPayload> {
      try {
        const skill = catalog.load(args.skill);
        return { text: `<skill-instructions name="${skill.id}">\n${skill.body}\n</skill-instructions>` };
      } catch (err: any) {
        // Returned, not thrown: defineTool's catch would prefix "Skill failed:" and
        // bury the recovery information (the list of skills that DO exist, or the
        // real filesystem reason) that these errors carry.
        return { text: err?.message ?? String(err), isError: true };
      }
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd desktop && npx vitest run tests/skill-tool.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Register the tool name and make the manifest `skills` field real**

In `desktop/src/shared/harness-manifest.ts`, add `'Skill'` to `NATIVE_TOOL_NAMES`:

```ts
export const NATIVE_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'AskUserQuestion',
  // M3: loads a named skill's instructions as tool output. Attached only when the
  // capability profile says the window can afford the catalog (see Task 3).
  'Skill',
] as const;
```

Resolve Q6 for `skills` in the same file — replace the placeholder declaration's comment:

```ts
  /** Per-preset skill allowlist. `undefined` = every installed skill is offered;
   *  an array restricts the catalog to those ids. Consumed by
   *  harness-session.buildAiTools via the skill catalog (M3 Task 3). */
  skills?: string[];
  /** RESERVED — no consumer yet. The MCP pass (M3 item 4, its own plan) lands the
   *  consumer. Left declared rather than deleted so that plan does not have to
   *  re-litigate the manifest shape. */
  mcp?: string[];
```

- [ ] **Step 6: Run the manifest and IPC parity guards**

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts tests/harness-manifest.test.ts`
Expected: PASS. If a test enumerates `NATIVE_TOOL_NAMES` by length or exact array, update it
to include `'Skill'` — the tool genuinely exists now.

- [ ] **Step 7: Mutation-verify**

Set `interactive: true` on the tool, re-run — the "is NOT interactive" test must FAIL.
Restore. Change the catch to `return { text: '', isError: true }`, re-run — the
"never returns empty instructions" and "unknown skill" tests must FAIL. Restore.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/harness/tools/skill.ts desktop/src/shared/harness-manifest.ts \
        desktop/tests/skill-tool.test.ts
git commit -m "feat(native): Skill tool — the model can load a skill's instructions

Rides defineTool like every other tool, so it inherits truncation and abort
labeling. Not interactive: that flag skips guards AND permission, which is right
for AskUserQuestion and wrong for a tool that can instruct real side effects.
Errors return as results rather than throws so the recovery information (which
skills DO exist, or the real filesystem reason) survives.

Also resolves the manifest's dead `skills` field into a real per-preset allowlist."
```

---

### Task 3: Capability-gated injection budget (M3 item 5)

**Files:**
- Modify: `desktop/src/main/harness/capability-profile.ts`
- Create: `desktop/src/main/harness/injection/injection-budget.ts`
- Test: `desktop/tests/injection-budget.test.ts`
- Test: `desktop/tests/capability-profile.test.ts` (extend existing)

**Interfaces:**
- Consumes: `CapabilityProfile`, `resolveProfile`, `DiscoveredModel` (existing).
- Produces:
  ```ts
  // added to CapabilityProfile
  exposeSkillCatalog: boolean;
  injectionBudgetTokens: number;
  // injection-budget.ts
  export function fitInjection(text: string, budgetTokens: number): { text: string; truncated: boolean }
  ```

**Design note:** the gate is the *window*, not the provider. A 128k local model should get
the catalog; a 32k cloud model should not get an unbounded rule dump. `resolveProfile`
already receives `contextLength` on `DiscoveredModel` and currently throws it away after
computing the other fields — this is where it earns its keep.

Thresholds, and why: the `Skill` tool's description carries every skill's id and one-line
description **on every turn**. With ~40 installed skills that is roughly 1 200–2 000 tokens
of permanent overhead. On a 128k window that is noise; on a 32k window shared with a large
`CLAUDE.md` it is real; below 32k it is unaffordable.

- [ ] **Step 1: Write the failing tests**

`desktop/tests/injection-budget.test.ts`:

```ts
// A 600-word rule can blow a small model's window (program §4 item 5). Injected
// content is therefore bounded by the profile, and when it is cut the model is
// TOLD it was cut — silently truncated instructions are worse than none, because
// the model follows half a procedure believing it has the whole thing.
import { describe, it, expect } from 'vitest';
import { fitInjection } from '../src/main/harness/injection/injection-budget';

describe('fitInjection', () => {
  it('passes short content through untouched', () => {
    const r = fitInjection('short', 1000);
    expect(r.text).toBe('short');
    expect(r.truncated).toBe(false);
  });

  it('cuts content that exceeds the budget', () => {
    const r = fitInjection('x'.repeat(40_000), 1_000);   // ~10k tokens vs a 1k budget
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(40_000);
  });

  it('SAYS it was cut — a silent cut makes the model follow half a procedure', () => {
    const r = fitInjection('x'.repeat(40_000), 1_000);
    expect(r.text).toMatch(/truncated/i);
  });

  it('a zero or negative budget still yields the notice, never a bare empty string', () => {
    const r = fitInjection('x'.repeat(1000), 0);
    expect(r.text).toMatch(/truncated/i);
    expect(r.truncated).toBe(true);
  });
});
```

Append to `desktop/tests/capability-profile.test.ts`:

```ts
import { resolveProfile, CLOUD_DEFAULT } from '../src/main/harness/capability-profile';

describe('capability profile — injection sizing (M3 item 5)', () => {
  it('a large local window gets the skill catalog', () => {
    const p = resolveProfile({ providerType: 'local-engine', modelId: 'qwen3.6-122b', contextLength: 128_000 });
    expect(p.exposeSkillCatalog).toBe(true);
    expect(p.injectionBudgetTokens).toBeGreaterThan(10_000);
  });

  it('a small local window does NOT — the catalog rides every turn', () => {
    const p = resolveProfile({ providerType: 'local-engine', modelId: 'gemma-3n', contextLength: 8_192 });
    expect(p.exposeSkillCatalog).toBe(false);
    expect(p.injectionBudgetTokens).toBeLessThan(4_000);
  });

  it('an UNKNOWN window is treated as small — never assume room we cannot verify', () => {
    const p = resolveProfile({ providerType: 'openai-compatible', modelId: 'mystery', contextLength: null });
    expect(p.exposeSkillCatalog).toBe(false);
  });

  it('the cloud default carries the catalog and a large budget', () => {
    expect(CLOUD_DEFAULT.exposeSkillCatalog).toBe(true);
    expect(CLOUD_DEFAULT.injectionBudgetTokens).toBeGreaterThan(10_000);
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `cd desktop && npx vitest run tests/injection-budget.test.ts tests/capability-profile.test.ts`
Expected: FAIL — unresolved import, and `exposeSkillCatalog` undefined.

- [ ] **Step 3: Extend the profile**

In `desktop/src/main/harness/capability-profile.ts`, add to `CapabilityProfile`:

```ts
  /** May the model-invoked Skill tool be attached? Its description carries every
   *  skill's id + one-liner on EVERY turn (~1-2k tokens with a normal install), so
   *  a small window cannot afford it — those sessions use /skill-name instead. */
  exposeSkillCatalog: boolean;
  /** Ceiling for content injected as messages mid-session (skill bodies, rule text,
   *  nested project instructions). Derived from the REAL window, not the provider:
   *  a 128k local model has more room than a 32k cloud one. */
  injectionBudgetTokens: number;
```

Add to `CLOUD_DEFAULT`:

```ts
  exposeSkillCatalog: true,
  injectionBudgetTokens: 20_000,
```

Inside `resolveProfile`, after the existing fields are computed, derive both from the
window. `d.contextLength` is already a parameter and was previously unused past the
registry lookup:

```ts
  // Sizing is a function of the WINDOW, not the provider — a 128k local model has
  // more room than a 32k cloud one. An unknown window is treated as small: we never
  // assume room we could not verify (the same conservative posture the three-layer
  // profile resolution takes everywhere else).
  const window = effectiveContextForModel(d.contextLength, d.modelId, registry);
  const exposeSkillCatalog = window != null && window >= 32_000;
  const injectionBudgetTokens = window == null ? 2_000
    : window >= 100_000 ? 20_000
    : window >= 32_000 ? 6_000
    : 2_000;
```

and include both in the returned object.

- [ ] **Step 4: Write the budget module**

`desktop/src/main/harness/injection/injection-budget.ts`:

```ts
// Bounding injected content (program §4 item 5).
//
// A 600-word rule, a long SKILL.md, or a nested CLAUDE.md can consume a
// meaningful slice of a small model's window. Everything injected as a message
// passes through here first.
//
// WHY it always announces the cut: a silently truncated procedure is worse than
// no procedure. The model follows the half it received believing it has the
// whole thing, and there is no signal anywhere that it is operating on a fragment.
const APPROX_CHARS_PER_TOKEN = 4;
const NOTICE = '\n\n[...truncated to fit this model\'s context window. Ask for the rest if you need it.]';

export function fitInjection(text: string, budgetTokens: number): { text: string; truncated: boolean } {
  const budgetChars = Math.max(0, budgetTokens) * APPROX_CHARS_PER_TOKEN;
  if (text.length <= budgetChars) return { text, truncated: false };
  // Reserve room for the notice itself, so the thing announcing the cut is never
  // the thing that gets cut. A budget too small to hold even the notice yields the
  // notice alone — honest, and never a bare empty string.
  const room = Math.max(0, budgetChars - NOTICE.length);
  return { text: text.slice(0, room) + NOTICE, truncated: true };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd desktop && npx vitest run tests/injection-budget.test.ts tests/capability-profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm nothing else constructs a CapabilityProfile**

Run: `cd desktop && npx tsc -p tsconfig.json --noEmit`
Expected: exit 0. Two required fields were added to an interface — `tsc` is the oracle for
every construction site, in `src/` and in test fixtures alike. Fix each site it names by
giving it a deliberate value, not by making the fields optional.

- [ ] **Step 7: Mutation-verify**

Change `exposeSkillCatalog` to `window == null || window >= 32_000`, re-run — the
"unknown window is treated as small" test must FAIL. Restore. Delete the `NOTICE` append,
re-run — the "SAYS it was cut" test must FAIL. Restore.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/harness/capability-profile.ts \
        desktop/src/main/harness/injection/injection-budget.ts \
        desktop/tests/injection-budget.test.ts desktop/tests/capability-profile.test.ts
git commit -m "feat(native): size injected content to the model's real window (M3 item 5)

The profile gains exposeSkillCatalog + injectionBudgetTokens, both derived from
the REAL window rather than the provider — a 128k local model has more room than
a 32k cloud one, and an unknown window is treated as small because we never
assume room we could not verify.

Truncation always announces itself: a silently cut procedure is worse than none,
since the model follows the fragment believing it is whole."
```

---

### Task 4: Attach the Skill tool under the gate

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts`
- Test: `desktop/tests/skill-tool-gating.test.ts`

**Interfaces:**
- Consumes: `createSkillTool` (Task 2), `profile.exposeSkillCatalog` (Task 3),
  `manifest.skills` allowlist (Task 2), existing `buildAiTools()`.
- Produces: no new exports. Behavior: `Skill` appears in `buildAiTools()` output iff
  `profile.supportsTools && profile.exposeSkillCatalog`.

- [ ] **Step 1: Write the failing test**

`desktop/tests/skill-tool-gating.test.ts`:

```ts
// The Skill tool's description carries every skill's id and one-liner on EVERY
// turn. That is affordable on a large window and not on a small one, so its
// attachment is a profile decision — the same three-layer profile Plan C landed.
import { describe, it, expect } from 'vitest';
import { HarnessSession } from '../src/main/harness/harness-session';
import { makeOpts } from './helpers/harness-fakes';
import { CLOUD_DEFAULT } from '../src/main/harness/capability-profile';

function toolNames(session: HarnessSession): string[] {
  return Object.keys((session as any).buildAiTools());
}

describe('Skill tool attachment is profile-gated', () => {
  it('a large window gets Skill', () => {
    const s = new HarnessSession(makeOpts({ profile: { ...CLOUD_DEFAULT, exposeSkillCatalog: true } }), async () => ({} as any));
    expect(toolNames(s)).toContain('Skill');
  });

  it('a small window does NOT — /skill-name still works there', () => {
    const s = new HarnessSession(makeOpts({ profile: { ...CLOUD_DEFAULT, exposeSkillCatalog: false } }), async () => ({} as any));
    expect(toolNames(s)).not.toContain('Skill');
  });

  it('a tool-less model gets no tools at all, Skill included', () => {
    const s = new HarnessSession(makeOpts({ profile: { ...CLOUD_DEFAULT, supportsTools: false, exposeSkillCatalog: true } }), async () => ({} as any));
    expect(toolNames(s)).toEqual([]);
  });

  it('gating Skill does not disturb the other ten tools', () => {
    const s = new HarnessSession(makeOpts({ profile: { ...CLOUD_DEFAULT, exposeSkillCatalog: false } }), async () => ({} as any));
    expect(toolNames(s)).toEqual(expect.arrayContaining(['Read', 'Write', 'Bash']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/skill-tool-gating.test.ts`
Expected: FAIL — `Skill` is never in the list.

- [ ] **Step 3: Attach it in `buildAiTools`**

In `desktop/src/main/harness/harness-session.ts`, inside `buildAiTools()`, after the
`simplified` line and before the loop:

```ts
    // Skill rides the SAME loop as every other tool (so it inherits simplified
    // presentation), but it is only ADDED to the set when the profile says the
    // window can afford its catalog. A small local model still reaches skills
    // through the user-invoked /skill-name path — this gates model-invoked only.
    if (this.profile.exposeSkillCatalog && !this.toolByName.has('Skill')) {
      const allow = this.opts.harness.skills;
      const catalog = createSkillCatalog();
      const scoped = allow
        ? { list: () => catalog.list().filter((s) => allow.includes(s.id)), load: catalog.load }
        : catalog;
      if (scoped.list().length > 0) this.toolByName.set('Skill', createSkillTool(scoped));
    }
```

Add the imports at the top of the file:

```ts
import { createSkillTool } from './tools/skill';
import { createSkillCatalog } from './skills/skill-catalog';
```

**Note the empty-catalog guard:** with no skills installed, attaching a tool whose
description says "Available skills:" followed by nothing invites the model to call it with
an invented id. No skills → no tool.

- [ ] **Step 4: Run to verify pass**

Run: `cd desktop && npx vitest run tests/skill-tool-gating.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the harness suites for regressions**

Run: `cd desktop && npx vitest run tests/harness-session-loop.test.ts tests/harness-hardening.test.ts tests/native-profile-driver.test.ts`
Expected: PASS.

- [ ] **Step 6: Mutation-verify**

Remove the `exposeSkillCatalog` condition (attach unconditionally), re-run — the "small
window does NOT" test must FAIL. Restore. Remove the `scoped.list().length > 0` guard and
run with an empty catalog fixture — confirm a test covers it; if none does, add one.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/harness/harness-session.ts desktop/tests/skill-tool-gating.test.ts
git commit -m "feat(native): attach Skill only when the window can afford its catalog

Model-invoked skill selection costs every skill's id and description on every
turn. Large windows get it; small ones reach skills through /skill-name instead.
No skills installed means no tool at all — a catalog listing nothing invites the
model to invent ids."
```

---

### Task 5: `/skill-name` as a native slash action

**Files:**
- Modify: `desktop/src/renderer/state/slash-command-dispatcher.ts`
- Modify: `desktop/src/renderer/state/native-slash-actions.ts`
- Modify: `desktop/src/main/harness/native-session-host.ts` (host entry point)
- Modify: the four IPC surfaces (`preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, `SessionService.kt`)
- Test: `desktop/tests/native-skill-invoke.test.ts`
- Test: `desktop/tests/ipc-channels.test.ts` (extend)

**Interfaces:**
- Consumes: `runNativeSlashAction` and the `nativeAction` result field (both from Plan C's
  `55fcd502`), `createSkillCatalog` (Task 1).
- Produces: `native:invoke-skill` IPC channel; `nativeAction: { kind: 'invoke-skill'; skill: string }`.

**Design note:** this is the path that must work on a small local model, so it does **not**
depend on the Skill tool. The host loads the skill body and sends it as a user-turn
message. That is one injection, once, rather than a catalog on every turn.

- [ ] **Step 1: Write the failing test**

`desktop/tests/native-skill-invoke.test.ts`:

```ts
// /skill-name is the path that must work on EVERY model, including the small
// local ones that never get the Skill tool. It loads one skill's body and sends
// it as a turn — a single injection, not a per-turn catalog.
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashCommand } from '../src/renderer/state/slash-command-dispatcher';

describe('/skill-name dispatch', () => {
  it('produces an invoke-skill native action', () => {
    const r = dispatchSlashCommand({
      raw: '/journal', sessionId: 's', view: 'chat', files: [], dispatch: vi.fn(), timeline: [],
      knownSkillIds: ['journal'],
    } as any);
    expect(r.handled).toBe(true);
    expect(r.nativeAction).toEqual({ kind: 'invoke-skill', skill: 'journal' });
  });

  it('leaves unknown slash commands alone — not every / is a skill', () => {
    const r = dispatchSlashCommand({
      raw: '/definitely-not-a-skill', sessionId: 's', view: 'chat', files: [], dispatch: vi.fn(),
      timeline: [], knownSkillIds: ['journal'],
    } as any);
    expect(r.nativeAction).toBeUndefined();
  });

  it('does not shadow a built-in — /clear stays the barrier, never a skill lookup', () => {
    const r = dispatchSlashCommand({
      raw: '/clear', sessionId: 's', view: 'chat', files: [], dispatch: vi.fn(), timeline: [],
      knownSkillIds: ['clear'],   // adversarial: a skill named 'clear' is installed
    } as any);
    expect(r.nativeAction?.kind).toBe('clear');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/native-skill-invoke.test.ts`
Expected: FAIL — `nativeAction` undefined for `/journal`.

- [ ] **Step 3: Extend the dispatcher**

In `desktop/src/renderer/state/slash-command-dispatcher.ts`, add `knownSkillIds?: string[]`
to the input type, and add the skill branch **at the end of the command switch**, after
every built-in has had its chance:

```ts
  // Skills resolve LAST so an installed skill can never shadow a built-in — a
  // marketplace skill named `clear` must not be able to take over /clear.
  const skillId = raw.trim().slice(1).split(/\s+/)[0];
  if (input.knownSkillIds?.includes(skillId)) {
    return { handled: true, nativeAction: { kind: 'invoke-skill', skill: skillId } };
  }
```

Extend the `nativeAction` union with `| { kind: 'invoke-skill'; skill: string }`.

- [ ] **Step 4: Handle the action in `native-slash-actions.ts`**

Add to the `runNativeSlashAction` switch, alongside the existing `compact` and `clear`
cases, following their exact refusal-copy pattern:

```ts
    case 'invoke-skill': {
      const res = await window.claude.native.invokeSkill(ctx.sessionId, action.skill);
      // Same shape as COMPACT_REFUSAL / CLEAR_REFUSAL: a coded reason maps to copy
      // that says what happened, never a guessed cause.
      if (!res?.ok) ctx.onToast?.(SKILL_REFUSAL[res?.reason ?? 'unknown'] ?? SKILL_REFUSAL.unknown);
      return;
    }
```

with:

```ts
const SKILL_REFUSAL: Record<string, string> = {
  'not-found': 'That skill isn\'t installed. Open the skill marketplace to add it.',
  'unreadable': 'That skill is installed but its instructions couldn\'t be read. Try reinstalling it.',
  'busy': 'Claude is still working — wait for the current turn to finish, then try again.',
  'unknown': 'Couldn\'t run that skill.',
};
```

- [ ] **Step 5: Add the host method and the four IPC surfaces**

In `native-session-host.ts`, add `invokeSkill(sessionId, skillId)`: load via
`createSkillCatalog()`, apply `fitInjection(body, profile.injectionBudgetTokens)`, then
`session.send()` the fitted body. Map `SkillNotFound` → `{ok:false, reason:'not-found'}`,
`SkillUnreadable` → `'unreadable'`, a running turn → `'busy'`.

Add `native:invoke-skill` to all four surfaces. Android's `SessionService.kt` gets an
**honest stub** — Android's native runtime is M8, so it returns a refusal, not a silent
success.

- [ ] **Step 6: Extend the IPC parity guard**

Add `native:invoke-skill` to the channel list in `desktop/tests/ipc-channels.test.ts`.

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts tests/native-skill-invoke.test.ts`
Expected: PASS.

- [ ] **Step 7: Mutation-verify**

Move the skill branch ABOVE the built-in switch, re-run — the "does not shadow a built-in"
test must FAIL. Restore.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(native): /skill-name invokes a skill on any model

The path that must work everywhere, including small local models that never get
the Skill tool: one skill body injected once, bounded by the profile's budget,
rather than a catalog riding every turn.

Skills resolve LAST in the dispatcher so an installed skill named 'clear' can
never shadow the /clear barrier."
```

---

### Task 6: The three silent surfaces

**Files:**
- Modify: `desktop/src/renderer/App.tsx` (drawer path ~`:2146`, skill path ~`:2205`, `onSendInput` ~`:3158`)
- Modify: `desktop/src/renderer/components/ThemeScreen.tsx:242`
- Test: `desktop/tests/native-slash-surfaces.test.tsx`

**Interfaces:**
- Consumes: `runSlashResult` (Plan C), the `invoke-skill` action (Task 5).
- Produces: no new exports.

**Per Q5:** ThemeScreen invokes the skill in the **current** session. Do not open a new one.

- [ ] **Step 1: Write the failing test**

`desktop/tests/native-slash-surfaces.test.tsx`:

```tsx
// Three entry points sent slash commands to a PTY that native sessions do not
// have. guardedPtySend returned false and every caller ignored it, so a native
// user clicking a drawer command or "Build New Theme with Claude" got NOTHING —
// no toast, no message, no session (handoff §2.3). Silence is the bug.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ThemeScreen from '../src/renderer/components/ThemeScreen';

describe('native slash surfaces never fail silently', () => {
  it('ThemeScreen\'s build button routes a command instead of raw PTY text', () => {
    const onRunCommand = vi.fn();
    render(<ThemeScreen onRunCommand={onRunCommand} onSendInput={vi.fn()} {...({} as any)} />);
    fireEvent.click(screen.getByText(/Build New Theme/i));
    // The assertion that matters: it goes through the command path, which knows
    // about native sessions — not onSendInput, which pipes to a PTY that isn't there.
    expect(onRunCommand).toHaveBeenCalledWith('/theme-builder');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/native-slash-surfaces.test.tsx`
Expected: FAIL — `onRunCommand` is not a prop yet.

- [ ] **Step 3: Give ThemeScreen a command path**

In `ThemeScreen.tsx`, add `onRunCommand?: (cmd: string) => void` to its props and change
line 242:

```tsx
            // Route through the command path, not onSendInput: onSendInput pipes raw
            // text to a PTY, and a native session has none — guardedPtySend returned
            // false and this button did nothing at all (handoff §2.3, Destin's "most
            // visible instance of the gap"). Per Q5 this runs in the CURRENT session.
            onClick={() => onRunCommand?.('/theme-builder')}
```

- [ ] **Step 4: Wire it in App.tsx and stop the two silent returns**

Pass `onRunCommand` down to `ThemeScreen` (through `SettingsPanel` if that is the parent),
implemented as: build a `DispatcherResult` via `dispatchSlashCommand` and hand it to
`runSlashResult`.

At the drawer path (`App.tsx:2146`) and the skill path (`:2205`), replace the bare
`if (!guardedPtySend(...)) return;` with a branch that toasts when the send is refused:

```ts
      // Was a silent `return`: guardedPtySend refuses for native sessions and its
      // toast only fires for the pending-interaction case, so a native user got no
      // feedback at all. No new shim — say plainly that this command has no native
      // equivalent yet, which is true and actionable.
      if (!guardedPtySend(sessionId, `${entry.name}\r`)) {
        setToast(`${entry.name} isn't available in YouCoded-runtime sessions yet.`);
        return;
      }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd desktop && npx vitest run tests/native-slash-surfaces.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `cd desktop && npx tsc -p tsconfig.json --noEmit && npx vitest run`
Expected: tsc exit 0; zero test failures. (The renderer suites that fail to LOAD in this
worktree are the shared-`node_modules` symlink artifact — re-run those with a widened
`server.fs.allow` to confirm, per the branch's merge commit.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "fix(native): the drawer, skill, and theme buttons no longer fail silently

Three call sites piped slash commands to a PTY native sessions don't have and
ignored the false return. Clicking 'Build New Theme with Claude' in a native
session did nothing whatsoever. Per Q5 it now runs in the current session."
```

---

### Task 7: Nested project instructions (M3 item 3a)

**Files:**
- Create: `desktop/src/main/harness/injection/path-triggers.ts`
- Test: `desktop/tests/path-triggers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PathTrigger { id: string; source: string; body: string }
  export interface TriggerIndex { match(touchedPath: string): PathTrigger[] }
  export function buildTriggerIndex(cwd: string): TriggerIndex
  ```

**Design note — the key insight of item 3:** nested `CLAUDE.md` and path-scoped rules are
the same mechanism. Both say *"when work touches this path, the model should know this
text."* One index answers both; only the discovery differs. Build the index once per
session (it is filesystem state, and rebuilding it per tool call would stat the tree on
every call).

`prompt-assembly.ts` is **not** touched. The root instructions stay in the byte-stable
system prompt; nested ones arrive as messages. That split is Global Constraint 1.

- [ ] **Step 1: Write the failing test**

`desktop/tests/path-triggers.test.ts`:

```ts
// Nested CLAUDE.md and path-scoped rules are ONE mechanism: content the model
// should see once work touches a matching path. prompt-assembly.ts takes only the
// FIRST instructions file walking cwd -> git root, so a monorepo's per-package
// CLAUDE.md is invisible today.
//
// The root file stays in the system prompt (byte-stable, Global Constraint 1);
// nested ones arrive as messages.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildTriggerIndex } from '../src/main/harness/injection/path-triggers';

function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'triggers-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'root rules', 'utf8');
  fs.mkdirSync(path.join(root, 'packages', 'api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages', 'api', 'CLAUDE.md'), 'api package rules', 'utf8');
  return root;
}

describe('nested project instructions', () => {
  it('a file inside a nested package triggers that package\'s CLAUDE.md', () => {
    const root = repo();
    const hits = buildTriggerIndex(root).match(path.join(root, 'packages', 'api', 'server.ts'));
    expect(hits.map((h) => h.body)).toContain('api package rules');
  });

  it('does NOT re-trigger the root file — it is already in the system prompt', () => {
    const root = repo();
    const hits = buildTriggerIndex(root).match(path.join(root, 'packages', 'api', 'server.ts'));
    expect(hits.map((h) => h.body)).not.toContain('root rules');
  });

  it('a file outside the nested package triggers nothing', () => {
    const root = repo();
    expect(buildTriggerIndex(root).match(path.join(root, 'README.md'))).toEqual([]);
  });

  it('a repo with no nested instructions yields an empty index, not a crash', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-'));
    fs.mkdirSync(path.join(root, '.git'));
    expect(buildTriggerIndex(root).match(path.join(root, 'x.ts'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/path-triggers.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the index (nested-instructions half)**

`desktop/src/main/harness/injection/path-triggers.ts`:

```ts
// Path-triggered content: text the model should see once work touches a matching
// path. TWO sources feed one index —
//   1. nested AGENTS.md / CLAUDE.md below the session cwd (this task), and
//   2. .claude/rules/*.md with `paths:` frontmatter (Task 8).
// They are the same mechanism; only discovery differs.
//
// The ROOT instructions file is deliberately excluded: prompt-assembly.ts already
// puts it in the byte-stable system prompt, and injecting it again would waste
// window and contradict itself.
//
// Built ONCE per session — this is filesystem state, and re-statting the tree on
// every tool call would be a real cost on a large repo.
import * as fs from 'fs';
import * as path from 'path';

export interface PathTrigger {
  /** Stable identity, so a trigger is injected at most once per session. */
  id: string;
  /** Human-readable origin, shown to the model so it knows where the text came from. */
  source: string;
  body: string;
}

export interface TriggerIndex { match(touchedPath: string): PathTrigger[] }

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'target', 'vendor']);
const MAX_DEPTH = 4;   // deep enough for a monorepo package, shallow enough to stay cheap

function findNested(root: string): Array<{ dir: string; file: string }> {
  const found: Array<{ dir: string; file: string }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const sub = path.join(dir, e.name);
      for (const name of INSTRUCTION_FILES) {
        const p = path.join(sub, name);
        if (fs.existsSync(p)) { found.push({ dir: sub, file: p }); break; }
      }
      walk(sub, depth + 1);
    }
  };
  walk(root, 1);   // depth 1 = children of root, so the ROOT file is never collected
  return found;
}

export function buildTriggerIndex(cwd: string): TriggerIndex {
  const nested = findNested(cwd).map(({ dir, file }) => ({
    dir,
    trigger: {
      id: `instructions:${file}`,
      source: path.relative(cwd, file),
      body: (() => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } })(),
    } as PathTrigger,
  })).filter((n) => n.trigger.body.length > 0);

  return {
    match(touchedPath: string): PathTrigger[] {
      const abs = path.resolve(touchedPath);
      // Deepest-first: a package's own instructions are more specific than an
      // intermediate directory's, and the model should read the specific one last.
      return nested
        .filter((n) => abs.startsWith(n.dir + path.sep))
        .sort((a, b) => a.dir.length - b.dir.length)
        .map((n) => n.trigger);
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd desktop && npx vitest run tests/path-triggers.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mutation-verify**

Change `walk(root, 1)` to `walk(root, 0)` and add the root dir itself to the scan — the
"does NOT re-trigger the root file" test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/harness/injection/path-triggers.ts desktop/tests/path-triggers.test.ts
git commit -m "feat(native): nested project instructions (M3 item 3a)

prompt-assembly takes only the FIRST AGENTS.md/CLAUDE.md walking cwd to git root,
so a monorepo package's own instructions were invisible. Nested files now arrive
as messages when work touches their directory; the root file stays in the
byte-stable system prompt rather than being injected twice."
```

---

### Task 8: Path-scoped rules + injection into the turn (M3 item 3b)

**Files:**
- Modify: `desktop/src/main/harness/injection/path-triggers.ts` (add rule discovery)
- Modify: `desktop/src/main/harness/harness-session.ts` (inject after tool results)
- Test: `desktop/tests/path-triggers.test.ts` (extend)
- Test: `desktop/tests/rule-injection.test.ts`

**Interfaces:**
- Consumes: `buildTriggerIndex` (Task 7), `fitInjection` (Task 3),
  `tool.permissionSubject(args)` for the touched path.
- Produces: no new exports.

**Design note:** rules live at `<cwd>/.claude/rules/*.md` with `paths:` frontmatter — the
same convention this workspace uses on Claude Code, so a repo already set up for CC works
natively with no new configuration. Injection happens **once per trigger per session**: a
rule repeated after every `Read` would dominate the conversation.

- [ ] **Step 1: Write the failing tests**

Append to `desktop/tests/path-triggers.test.ts`:

```ts
describe('path-scoped rules', () => {
  it('a rule with a matching paths: glob triggers on a touched file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'rules', 'api.md'),
      '---\npaths:\n  - "src/api/**"\n---\nAlways validate input.', 'utf8');
    const hits = buildTriggerIndex(root).match(path.join(root, 'src', 'api', 'users.ts'));
    expect(hits.map((h) => h.body).join()).toContain('Always validate input');
  });

  it('a rule whose glob does not match stays out of the conversation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rules2-'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'rules', 'api.md'),
      '---\npaths:\n  - "src/api/**"\n---\nAlways validate input.', 'utf8');
    expect(buildTriggerIndex(root).match(path.join(root, 'src', 'ui', 'Button.tsx'))).toEqual([]);
  });

  it('a rule with NO paths: frontmatter is ignored, never treated as global', () => {
    // An eager rule would ride every turn — exactly the cost item 5 exists to
    // control. The workspace's own rules README calls omitting `paths:` a mistake.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rules3-'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'rules', 'loose.md'), 'No frontmatter here.', 'utf8');
    expect(buildTriggerIndex(root).match(path.join(root, 'anything.ts'))).toEqual([]);
  });
});
```

`desktop/tests/rule-injection.test.ts`:

```ts
// Injection happens ONCE per trigger per session. A rule re-sent after every Read
// of a matching file would dominate the conversation and blow the window it was
// sized against.
import { describe, it, expect } from 'vitest';
import { HarnessSession } from '../src/main/harness/harness-session';
import { makeOpts, fakeTool } from './helpers/harness-fakes';
import { textChunks, toolCallChunk, finishChunk, stream, scriptedModel } from './helpers/scripted-model';
import type { PermissionDecision } from '../src/shared/permission-types';

const ALLOW: PermissionDecision = { action: 'allow', denyListed: false };

describe('rule injection into the turn', () => {
  it('a matched rule reaches the model as a message, not a prompt edit', async () => {
    // Global Constraint 1: the system prompt is byte-stable. Verify the injected
    // text lands in the MESSAGE list and the system string is untouched.
    const seen: any[] = [];
    const read = fakeTool('Read');
    const model = scriptedModel([
      stream(...textChunks('a', 'reading'), toolCallChunk('c1', 'Read', { file_path: 'src/api/x.ts' }), finishChunk('tool-calls')),
      stream(...textChunks('b', 'done'), finishChunk('stop')),
    ], seen);
    const session = new HarnessSession(
      makeOpts({ tools: [read], decide: async () => ALLOW, triggers: { match: () => [{ id: 'r1', source: '.claude/rules/api.md', body: 'Always validate input.' }] } }),
      async () => model as any,
    );
    await session.send('go');
    expect(JSON.stringify(seen)).toContain('Always validate input');
  });

  it('the same rule is injected only ONCE per session', async () => {
    const seen: any[] = [];
    const read = fakeTool('Read');
    const model = scriptedModel([
      stream(toolCallChunk('c1', 'Read', { file_path: 'src/api/a.ts' }), finishChunk('tool-calls')),
      stream(toolCallChunk('c2', 'Read', { file_path: 'src/api/b.ts' }), finishChunk('tool-calls')),
      stream(...textChunks('b', 'done'), finishChunk('stop')),
    ], seen);
    const session = new HarnessSession(
      makeOpts({ tools: [read], decide: async () => ALLOW, triggers: { match: () => [{ id: 'r1', source: 'r', body: 'RULE-TEXT-MARKER' }] } }),
      async () => model as any,
    );
    await session.send('go');
    const occurrences = JSON.stringify(seen).split('RULE-TEXT-MARKER').length - 1;
    expect(occurrences).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd desktop && npx vitest run tests/path-triggers.test.ts tests/rule-injection.test.ts`
Expected: FAIL — rules are not discovered; `triggers` is not an option.

- [ ] **Step 3: Add rule discovery to the index**

In `path-triggers.ts`, add a frontmatter reader and a glob matcher, and merge rule triggers
into the same `match()` result. Reuse the existing glob helper at
`desktop/src/main/harness/tools/subject-glob.ts` rather than adding a dependency — check
its exported matcher signature first and adapt.

```ts
/** Read a rule's `paths:` list. NO paths: means the rule is skipped entirely —
 *  an eager rule would ride every turn, the exact cost item 5 exists to control
 *  (and the workspace's own .claude/rules/README.md calls omitting it a mistake). */
function readRulePaths(file: string): { globs: string[]; body: string } | null {
  let raw: string;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const front = raw.slice(3, end);
  const body = raw.slice(raw.indexOf('\n', end + 1) + 1).trim();
  const globs: string[] = [];
  let inPaths = false;
  for (const line of front.split('\n')) {
    if (/^paths:/.test(line)) { inPaths = true; continue; }
    if (inPaths) {
      const m = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
      if (m) { globs.push(m[1]); continue; }
      if (/^\S/.test(line)) inPaths = false;
    }
  }
  return globs.length ? { globs, body } : null;
}
```

- [ ] **Step 4: Inject in the driver**

In `harness-session.ts`, add `triggers?: TriggerIndex` to the options type. After the tool
results are pushed to history (the `this.history.push({ role: 'tool', content: resultParts })`
sites), append any newly-matched triggers as a user message:

```ts
        // Path-triggered content (M3 item 3): a rule or nested CLAUDE.md the touched
        // path matches. Sent as a MESSAGE — the system prompt is byte-stable by
        // construction (prompt-assembly.ts) and a mid-session edit would throw away
        // the KV cache prefix every local model depends on.
        //
        // Once per trigger per session: re-sending a rule after every Read of a
        // matching file would dominate the conversation.
        const fresh = touchedPaths
          .flatMap((p) => this.opts.triggers?.match(p) ?? [])
          .filter((t) => !this.injectedTriggerIds.has(t.id));
        for (const t of fresh) {
          this.injectedTriggerIds.add(t.id);
          const fitted = fitInjection(t.body, this.profile.injectionBudgetTokens);
          this.history.push({ role: 'user', content:
            `<project-rule source="${t.source}">\n${fitted.text}\n</project-rule>` });
        }
```

Declare `private readonly injectedTriggerIds = new Set<string>();` on the class, and
collect `touchedPaths` from each executed call's `tool.permissionSubject(args)` (skipping
`Bash`, whose subject is a command string, not a path).

- [ ] **Step 5: Run to verify pass**

Run: `cd desktop && npx vitest run tests/path-triggers.test.ts tests/rule-injection.test.ts`
Expected: PASS.

- [ ] **Step 6: Mutation-verify**

Delete the `injectedTriggerIds` filter, re-run — the "only ONCE per session" test must FAIL.
Restore. Make `readRulePaths` return `{globs:['**'], body}` when `paths:` is absent, re-run
— the "NO paths: is ignored" test must FAIL. Restore.

- [ ] **Step 7: Full suite + typecheck**

Run: `cd desktop && npx tsc -p tsconfig.json --noEmit && npx vitest run`
Expected: tsc exit 0; zero test failures.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(native): path-scoped rules injected on a match (M3 item 3b)

Rules at <cwd>/.claude/rules/*.md with paths: frontmatter — the same convention
this workspace already uses on Claude Code, so a repo set up for CC works
natively with no new config.

Injected as messages, never as a prompt edit: the system prompt is byte-stable by
construction and a mid-session change throws away the KV cache prefix every local
model depends on. Once per trigger per session, and bounded by the profile's
budget. A rule with no paths: is skipped rather than treated as global."
```

---

### Task 9: Documentation and close-out

**Files:**
- Modify: `.claude/rules/native-runtime.md`
- Modify: `youcoded/docs/native-runtime.md`
- Modify: `docs/MAP.md`
- Modify: `docs/active/plans/2026-07-22-native-runtime-parity-program.md` (§4 status)
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the rule, respecting its word budget**

`.claude/rules/native-runtime.md` is already **2 140 words against a 600 budget** (handoff
§7). Add only the invariant lines, in the established
*invariant · why · guard* format, and put depth in the lazy doc:

```markdown
**Injection is messages, never prompt mutation.** Skills, path-scoped rules and nested
project instructions arrive as messages; `prompt-assembly.ts` stays byte-stable.
· A mid-session prompt edit discards the KV cache prefix every local model reuses.
· Guard: `desktop/tests/rule-injection.test.ts`.

**Injected content is bounded by the profile.** `injectionBudgetTokens` and
`exposeSkillCatalog` derive from the REAL window; an unknown window is treated as small.
· A 600-word rule can blow a small model's window. · Guard: `desktop/tests/injection-budget.test.ts`.

**A rule with no `paths:` is skipped.** Never treated as global.
· An eager rule rides every turn. · Guard: `desktop/tests/path-triggers.test.ts`.
```

Add matching `verify:` anchors to the frontmatter for each new test path.

- [ ] **Step 2: Update MAP and the depth doc**

Add the `injection/` and `skills/` directories to `docs/MAP.md` under the native-runtime
subsystem, with their rule and guard tests. **MAP maps master only** — this is legitimate
because these files will be on master when the PR merges, but do not add anything that
stays on an unmerged branch.

- [ ] **Step 3: Flip the program and roadmap**

In the program doc §4, mark items 1, 3 and 5 shipped with the PR number. Leave **item 4
(MCP) open** and note that it has its own plan. Flip the corresponding `ROADMAP.md` entry.

- [ ] **Step 4: Archive**

```bash
git mv docs/active/plans/2026-07-28-m3-skills-rules-injection-plan.md docs/archive/plans/
git mv docs/active/handoffs/2026-07-24-m3-context-skills-commands-handoff.md docs/archive/handoffs/
```

Do this **only after** the PR merges — "merge means merge AND push AND archive AND flip",
in the same session.

- [ ] **Step 5: Dogfood pass (Destin)**

Per Global Constraint 8, hand these to Destin rather than scripting them:

- A native session on a large local model offers `Skill`; on a small one it does not, and
  `/skill-name` works on both.
- The command drawer, a skill whose prompt starts with `/`, and ThemeScreen's
  "Build New Theme with Claude" all do something visible in a native session.
- Editing a file under a directory with its own `CLAUDE.md` surfaces those instructions once.
- The same over the **remote web client** — program §9 exit criterion (c).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs(native): M3 items 1, 3, 5 — rule invariants, MAP, program status"
```

---

## Self-review

**Spec coverage.** Program §4 item 1 → Tasks 1, 2, 4, 5, 6. Item 3 → Tasks 7, 8. Item 5 →
Task 3, consumed in Tasks 4 and 8. Item 2 shipped already (`9fd07bd0`, `55fcd502`). **Item 4
(MCP) has no task here by decision** — Destin scoped it to its own pass, and Task 9 leaves
the program entry open rather than claiming M3 complete.

**Handoff §4 constraints.** (1) byte-stable prompt — Tasks 7, 8 inject as messages and Task
7 explicitly leaves `prompt-assembly.ts` alone. (2) append-only JSONL — no task writes a new
persisted concept; skill invocation reuses `send()`, which already persists a user message.
(3) four-surface IPC — Task 5, with an honest Android stub. (4) fakes express failure —
Task 1 tests both `SkillNotFound` and `SkillUnreadable`; Task 2 drives the tool with a
catalog that throws. (5) error standards — the refusal maps in Task 5 and the catalog's
error classes. (6) WHY comments — present in every code block. (7)/(8) live-app safety and
handing interactive verification to Destin — Task 9 Step 5.

**Placeholder scan.** No TBDs. Two steps intentionally direct the implementer to read
existing code before writing (Task 1 Step 4's three `addSkill` call sites, Task 8 Step 3's
`subject-glob.ts` signature) rather than guessing at a signature this plan has not verified
line-by-line — stating the exact requirement while being honest about what was not read is
better than inventing a call that may not typecheck.

**Type consistency.** `SkillCatalog` (`list`/`load`) is used identically in Tasks 1, 2, 4.
`PathTrigger` (`id`/`source`/`body`) in Tasks 7 and 8. `fitInjection(text, budgetTokens)`
returns `{text, truncated}` in Tasks 3 and 8. `exposeSkillCatalog` and
`injectionBudgetTokens` are named the same in Tasks 3, 4 and 8. `nativeAction` gains exactly
one variant, `{kind:'invoke-skill', skill}`, produced in Task 5 Step 3 and consumed in Step 4.

**One known risk, flagged rather than hidden.** Task 8 Step 4 modifies `harness-session.ts`,
already the most-churned file on this branch and the site of two inert-fix incidents. Its
mutation-verification step is not optional, and the whole-branch review should read that
hunk specifically.
