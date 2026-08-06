---
status: draft
---

# Project-Scoped Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A skill committed into a project's `.claude/skills/` directory works in a YouCoded native session — runnable via the `Skill` tool and `/name`, and visible in the `/` drawer — the same way it already works in a Claude Code session.

**Architecture:** Discovery stays split in two. `scanSkills()` remains home-scoped and cacheable; a new `scanProjectSkills(cwd)` reads the project layer, and `mergeProjectSkills()` combines them with precedence plugin > project > user. The cwd travels from the renderer (the only place that knows which session is active) down through `skills:list` / `commands:list` to the main process, and separately into `NativeSessionHost`, which builds one skill catalog per session cwd.

**Tech Stack:** TypeScript, Electron main + React renderer, Vitest, Node `fs`.

**Spec:** `docs/active/specs/2026-08-05-project-scoped-skills-design.md`

> **Line numbers are indicative, symbol names are authoritative.** `youcoded` master moved during the writing of this plan (`aab7cfa5` / `48202704`, a dead-code sweep) and shifted several of these files. Every anchor below was re-verified against `48202704`, but with seven active worktrees this repo moves often — locate the *symbol* named in each step, and treat a mismatched line number as drift rather than as a signal that you are in the wrong file.

## Global Constraints

- **`scanSkills()` must stay home-scoped and argument-free.** `LocalSkillProvider.installedCache` memoizes it globally and invalidates only on install/uninstall; a cwd-dependent `scanSkills()` silently serves one folder's skills to another. Task 1 adds a test pinning this.
- **Precedence is plugin > project > user**, matching `command-provider.ts:74`'s `[...user, ...project, ...plugin]` + `byName.set` ordering.
- **Shadowing is always annotated, never silent** — the surviving entry records what it displaced via `shadows`.
- **No trust gate.** Project skills auto-load, matching Claude Code. The permission engine remains the boundary: `Skill` is deliberately not `interactive` (`skill.ts:8-11`), so everything a skill drives still passes `decide()`.
- **Android is out of scope.** Do not add a project pass to `app/.../skills/SkillScanner.kt`. Kotlin changes are limited to tolerating a new optional argument if the shared renderer sends one.
- **Project skills never enter global stores** — not favorites, not chips, not the marketplace screen. They are a property of a folder; the global stores have nowhere to record that.
- **Every non-trivial edit carries a WHY comment** (workspace `CLAUDE.md`).
- **Verification for every task:** `bash scripts/verify.sh` from the workspace root (tsc + affected vitest + knip + ast-grep). Individual test commands are given per task; `verify.sh` is the gate before each commit.

## File Structure

| File | Responsibility |
|---|---|
| `desktop/src/main/project-skills.ts` | **New.** `scanProjectSkills()` (the project discovery pass) and `mergeProjectSkills()` (precedence + shadow annotation). Pure of any cache or IPC concern. |
| `desktop/src/main/skill-scanner.ts` | One word changes: `readSkillMeta` becomes exported so the project pass reuses the frontmatter reader instead of duplicating it. No behavior change. |
| `desktop/src/shared/types.ts` | `SkillEntry.source` gains `'project'`; new optional `shadows` field. |
| `desktop/src/main/skill-provider.ts` | Applies the project layer per request on top of the memoized home layer. |
| `desktop/src/main/command-provider.ts` | Takes cwd per call instead of via a constructor accessor. |
| `desktop/src/main/main.ts` | Drops the wrong `sessions[0]?.cwd` accessor. |
| `desktop/src/main/ipc-handlers.ts`, `preload.ts`, `src/renderer/remote-shim.ts` | `cwd` argument on `skills:list` and `commands:list`. |
| `desktop/src/renderer/state/skill-context.tsx` | Learns which project it is scoped to; refetches when that changes. |
| `desktop/src/renderer/App.tsx` | Tells `SkillProvider` the active session's cwd; deletes a dead `skills` state. |
| `desktop/src/renderer/components/SkillCard.tsx` | "From this folder" badge, shadow note, favorite suppression. |
| `desktop/src/main/harness/native-session-host.ts` | One skill catalog per session cwd. |
| `desktop/src/main/harness/tools/skill.ts`, `harness/skills/skill-invocation.ts` | Origin attribution in the injected block. |

**Task order and independence.** Task 1 is the foundation. Tasks 2→3→4→5 are a chain (main-process layer → IPC → renderer state → renderer UI). Task 6 depends only on Task 1 and may be done in parallel with 2–5. Task 7 depends on Task 6.

---

### Task 1: Project discovery and merge

**Files:**
- Create: `desktop/src/main/project-skills.ts`
- Create: `desktop/tests/project-skills.test.ts`
- Modify: `desktop/src/shared/types.ts:324-350` (the `SkillEntry` interface)
- Modify: `desktop/src/main/skill-scanner.ts:219` (export `readSkillMeta`)
- Modify: `desktop/tests/skill-scanner.test.ts` (add the home-scoped pinning test)

**Interfaces:**
- Consumes: `SkillEntry` from `src/shared/types`.
- Produces:
  - `scanProjectSkills(projectDir: string): SkillEntry[]`
  - `mergeProjectSkills(home: SkillEntry[], project: SkillEntry[]): SkillEntry[]`
  - `SkillEntry.source` now includes `'project'`; `SkillEntry.shadows?: SkillEntry['source']`

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/project-skills.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanProjectSkills, mergeProjectSkills } from '../src/main/project-skills';
import type { SkillEntry } from '../src/shared/types';

describe('scanProjectSkills', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-project-skills-'));
  });

  afterEach(() => {
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
  });

  function mkdir(p: string) { fs.mkdirSync(p, { recursive: true }); }
  function write(p: string, content: string) { mkdir(path.dirname(p)); fs.writeFileSync(p, content); }

  function writeSkill(name: string, frontmatter: string) {
    write(
      path.join(projectDir, '.claude', 'skills', name, 'SKILL.md'),
      `---\n${frontmatter}\n---\n\nDo the thing.\n`,
    );
  }

  it('returns an empty list when the project has no .claude/skills directory', () => {
    expect(scanProjectSkills(projectDir)).toEqual([]);
  });

  it('returns an empty list for a directory that does not exist', () => {
    expect(scanProjectSkills(path.join(projectDir, 'nope'))).toEqual([]);
  });

  it('discovers a skill and reads its frontmatter', () => {
    writeSkill('ui-mockup', 'name: UI Mockup\ndescription: Design YouCoded UI changes');
    const found = scanProjectSkills(projectDir);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('ui-mockup');
    expect(found[0].displayName).toBe('UI Mockup');
    expect(found[0].description).toBe('Design YouCoded UI changes');
    expect(found[0].source).toBe('project');
    expect(found[0].skillDir).toBe(path.join(projectDir, '.claude', 'skills', 'ui-mockup'));
  });

  it('falls back to a title-cased directory name when frontmatter has no name', () => {
    writeSkill('code-review', 'description: Review the diff');
    expect(scanProjectSkills(projectDir)[0].displayName).toBe('Code Review');
  });

  it('skips a directory with no SKILL.md rather than listing a broken entry', () => {
    mkdir(path.join(projectDir, '.claude', 'skills', 'not-a-skill'));
    writeSkill('real-skill', 'description: A real one');
    expect(scanProjectSkills(projectDir).map((s) => s.id)).toEqual(['real-skill']);
  });

  it('accepts a symlinked skill directory', () => {
    // Monorepos legitimately symlink shared skills; unlike ~/.claude/skills there
    // are no toolkit-managed mirrors in a project dir to double-count.
    const real = path.join(projectDir, 'shared', 'linted');
    write(path.join(real, 'SKILL.md'), '---\ndescription: Shared\n---\n\nBody\n');
    mkdir(path.join(projectDir, '.claude', 'skills'));
    fs.symlinkSync(real, path.join(projectDir, '.claude', 'skills', 'linted'), 'dir');
    expect(scanProjectSkills(projectDir).map((s) => s.id)).toEqual(['linted']);
  });
});

describe('mergeProjectSkills', () => {
  function entry(id: string, source: SkillEntry['source']): SkillEntry {
    return {
      id,
      displayName: id,
      description: `${source} ${id}`,
      category: 'other',
      prompt: `/${id}`,
      source,
      type: 'plugin',
      visibility: 'published',
    };
  }

  it('appends a project skill that collides with nothing', () => {
    const merged = mergeProjectSkills([entry('alpha', 'plugin')], [entry('beta', 'project')]);
    expect(merged.map((s) => s.id).sort()).toEqual(['alpha', 'beta']);
  });

  it('lets a project skill beat a user skill, recording what it displaced', () => {
    const merged = mergeProjectSkills([entry('audit', 'self')], [entry('audit', 'project')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('project');
    expect(merged[0].shadows).toBe('self');
  });

  it('lets a plugin skill beat a project skill, recording what it displaced', () => {
    const merged = mergeProjectSkills([entry('theme-builder', 'plugin')], [entry('theme-builder', 'project')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('plugin');
    expect(merged[0].shadows).toBe('project');
  });

  it('treats marketplace and youcoded-core entries as plugin-tier winners', () => {
    const merged = mergeProjectSkills(
      [entry('a', 'marketplace'), entry('b', 'youcoded-core')],
      [entry('a', 'project'), entry('b', 'project')],
    );
    expect(merged.map((s) => s.source)).toEqual(['marketplace', 'youcoded-core']);
    expect(merged.map((s) => s.shadows)).toEqual(['project', 'project']);
  });

  it('leaves entries untouched when there is no project layer', () => {
    const home = [entry('alpha', 'plugin'), entry('beta', 'self')];
    const merged = mergeProjectSkills(home, []);
    expect(merged).toEqual(home);
    expect(merged.every((s) => s.shadows === undefined)).toBe(true);
  });

  it('preserves home ordering so the drawer does not reshuffle on session switch', () => {
    const home = [entry('a', 'plugin'), entry('b', 'self'), entry('c', 'plugin')];
    const merged = mergeProjectSkills(home, [entry('b', 'project'), entry('d', 'project')]);
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
```

Append to `desktop/tests/skill-scanner.test.ts`, inside the existing `describe('scanSkills', …)` block:

```ts
  it('takes no arguments — it is home-scoped by contract', () => {
    // Pinning the cache invariant, not a style preference: LocalSkillProvider
    // memoizes scanSkills() into a single global installedCache invalidated only
    // on install/uninstall. The moment scanSkills() depends on a cwd, that cache
    // serves one folder's skills to a session opened on another folder.
    // The project layer lives in project-skills.ts and is applied per request.
    expect(scanSkills.length).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/project-skills.test.ts tests/skill-scanner.test.ts
```

Expected: `tests/project-skills.test.ts` fails to resolve `../src/main/project-skills`; the `scanSkills.length` test passes already (it is a regression guard, not a driver).

- [ ] **Step 3: Add the type fields**

In `desktop/src/shared/types.ts`, in the `SkillEntry` interface (around line 331), change the `source` union and add `shadows` directly beneath it:

```ts
  source: 'youcoded-core' | 'self' | 'plugin' | 'marketplace' | 'project';
  /** Set when this entry won a name collision, naming the source of the entry it
   *  displaced. Rendered as a drawer note — silent shadowing is what produces
   *  "why doesn't my skill work" reports. */
  shadows?: SkillEntry['source'];
```

- [ ] **Step 4: Export the frontmatter reader**

In `desktop/src/main/skill-scanner.ts:219`, add `export` to the existing declaration so the project pass reuses it rather than duplicating the parser:

```ts
/** Minimal SKILL.md frontmatter reader — just `name` and `description`. */
export function readSkillMeta(skillMdPath: string): { name?: string; description?: string } {
```

- [ ] **Step 5: Write the implementation**

Create `desktop/src/main/project-skills.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { SkillEntry } from '../shared/types';
import { readSkillMeta } from './skill-scanner';

/**
 * The PROJECT skill pass: `<projectDir>/.claude/skills/<name>/SKILL.md`.
 *
 * WHY this is not a fourth pass inside scanSkills(): LocalSkillProvider memoizes
 * scanSkills() into one global installedCache, invalidated only on plugin
 * install/uninstall. A cwd-dependent scanSkills() would serve one folder's skills
 * to a session opened on a different folder. Keeping scanSkills() home-scoped and
 * pure preserves that memo; this pass is cheap enough to apply per request.
 *
 * Mirrors what Claude Code does for project skills, and what
 * command-provider.ts already does for `<cwd>/.claude/commands/`.
 */
export function scanProjectSkills(projectDir: string): SkillEntry[] {
  const skillsRoot = path.join(projectDir, '.claude', 'skills');

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    // No .claude/skills, or an unreadable cwd. Not an error — the overwhelming
    // majority of folders have no project skills.
    return [];
  }

  const skills: SkillEntry[] = [];
  for (const entry of entries) {
    // Symlinked dirs are ACCEPTED here, unlike scanSkills() Pass 3. That skip
    // exists only to avoid double-counting toolkit-managed mirrors in
    // ~/.claude/skills (see skill-scanner.ts:165 + symlink-cleanup.ts) — a legacy
    // concern with no analogue in a project folder, where monorepos legitimately
    // symlink shared skills. Do not "fix" this into consistency.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const skillDir = path.join(skillsRoot, entry.name);
    const skillMd = path.join(skillDir, 'SKILL.md');

    // A directory with no readable SKILL.md is NOT a skill. scanSkills() Pass 2
    // deliberately records unreadable plugin dirs ("installed but unreadable" is
    // honest for a plugin that genuinely is installed); here it would just put an
    // entry in the drawer that fails on click.
    if (!fs.existsSync(skillMd)) continue;

    const meta = readSkillMeta(skillMd);
    skills.push({
      id: entry.name,
      displayName: meta.name || titleCase(entry.name),
      description: meta.description || '',
      category: 'other',
      prompt: `/${entry.name}`,
      source: 'project',
      type: 'plugin',
      // Never published, never installable — a project skill is a property of the
      // folder you opened, not an artifact anyone can install.
      visibility: 'private',
      skillDir,
    });
  }
  return skills;
}

/**
 * Precedence: plugin > project > user.
 *
 * WHY this order: the command side already resolves collisions this way
 * (command-provider.ts:74 builds [...user, ...project, ...plugin] and
 * mergeCommandSources applies byName.set in array order). Skills and commands
 * land in the same drawer and already dedupe against each other, so two different
 * precedence orders in one list would be undebuggable.
 *
 * The winner records what it displaced in `shadows` so the drawer can say so.
 * Home ordering is preserved — a merge that reshuffled the list would make the
 * drawer jump on every session switch.
 */
export function mergeProjectSkills(home: SkillEntry[], project: SkillEntry[]): SkillEntry[] {
  const out = [...home];
  const indexById = new Map(home.map((e, i) => [e.id, i]));

  for (const candidate of project) {
    const i = indexById.get(candidate.id);
    if (i === undefined) {
      indexById.set(candidate.id, out.length);
      out.push(candidate);
      continue;
    }
    const existing = out[i];
    // 'self' is the only home tier a project skill outranks. Private prompt
    // skills can't reach this branch at all — their ids are `user:<ts>-<rand>`
    // (skill-config-store.ts:185), which no directory name can collide with.
    out[i] = existing.source === 'self'
      ? { ...candidate, shadows: 'self' }
      : { ...existing, shadows: 'project' };
  }
  return out;
}

function titleCase(dirName: string): string {
  return dirName.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/project-skills.test.ts tests/skill-scanner.test.ts
```

Expected: PASS, all tests in both files.

- [ ] **Step 7: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/main/project-skills.ts desktop/tests/project-skills.test.ts \
  desktop/src/shared/types.ts desktop/src/main/skill-scanner.ts desktop/tests/skill-scanner.test.ts
git commit -m "feat(skills): discover and merge project-scoped skills

scanProjectSkills() reads <cwd>/.claude/skills/, mergeProjectSkills() applies
plugin > project > user and records displaced entries in the new shadows field.
Deliberately NOT a fourth pass in scanSkills(), which stays home-scoped so
LocalSkillProvider's global installedCache remains correct — pinned by a test."
```

---

### Task 2: Apply the project layer in LocalSkillProvider

**Files:**
- Modify: `desktop/src/main/skill-provider.ts:148-197` (`getInstalled`)
- Create: `desktop/tests/skill-provider-project-layer.test.ts`

**Interfaces:**
- Consumes: `scanProjectSkills`, `mergeProjectSkills` from Task 1.
- Produces: `LocalSkillProvider.getInstalled(projectCwd?: string): Promise<SkillEntry[]>` — the home layer stays memoized in `installedCache`; the project layer is **not** cached.

**Why the project layer is uncached.** `LocalSkillProvider` has no `invalidateCache()` method — it assigns `this.installedCache = null` inline at ten sites (`skill-provider.ts:225, 261, 299, 321, 359, 375, 382, 397, 403, 410`), eight of them paired with `this.onCacheInvalidated?.()`. A per-cwd project cache would need clearing at every one of those, and none of them is even the right trigger: a project skill changes when *the project's files* change, not when a plugin installs. Caching it for the app's lifetime would mean a skill added to a repo never appears until restart — worse than Claude Code, where a new session picks it up. The pass is a `readdir` plus a few small frontmatter reads over a directory that typically holds zero to five entries, and `skills:list` is called on mount and on project switch, not on every drawer keystroke. Read it fresh.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/skill-provider-project-layer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The home layer is stubbed so this test is about layering, not about
// re-testing scanSkills() (tests/skill-scanner.test.ts owns that).
vi.mock('../src/main/skill-scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/main/skill-scanner')>();
  return {
    ...actual,
    scanSkills: () => [
      {
        id: 'theme-builder', displayName: 'Theme Builder', description: 'plugin one',
        category: 'other', prompt: '/theme-builder', source: 'plugin',
        type: 'plugin', visibility: 'published',
      },
    ],
  };
});

import { LocalSkillProvider } from '../src/main/skill-provider';

describe('LocalSkillProvider project layer', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-provider-project-'));
    fs.mkdirSync(path.join(projectDir, '.claude', 'skills', 'deploy'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'skills', 'deploy', 'SKILL.md'),
      '---\ndescription: Ship it\n---\n\nBody\n',
    );
  });

  afterEach(() => {
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
  });

  it('omits project skills when called without a cwd', async () => {
    const provider = new LocalSkillProvider();
    const ids = (await provider.getInstalled()).map((s) => s.id);
    expect(ids).toContain('theme-builder');
    expect(ids).not.toContain('deploy');
  });

  it('includes project skills when called with a cwd', async () => {
    const provider = new LocalSkillProvider();
    const ids = (await provider.getInstalled(projectDir)).map((s) => s.id);
    expect(ids).toContain('deploy');
  });

  it('does not leak one project cwd into another', async () => {
    const provider = new LocalSkillProvider();
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-provider-other-'));
    try {
      await provider.getInstalled(projectDir);
      const ids = (await provider.getInstalled(other)).map((s) => s.id);
      expect(ids).not.toContain('deploy');
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('picks up a project skill added after the first call, with no invalidation', async () => {
    // The project layer is read fresh every call — see the note above. A skill
    // added to the repo appears on the next fetch, not after an app restart.
    const provider = new LocalSkillProvider();
    await provider.getInstalled(projectDir);
    fs.mkdirSync(path.join(projectDir, '.claude', 'skills', 'later'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'skills', 'later', 'SKILL.md'),
      '---\ndescription: Added later\n---\n\nBody\n',
    );
    const ids = (await provider.getInstalled(projectDir)).map((s) => s.id);
    expect(ids).toContain('later');
  });
});
```

`LocalSkillProvider`'s constructor takes no arguments (`skill-provider.ts:69`) — it only ensures `CACHE_DIR` exists — so `new LocalSkillProvider()` is correct as written.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/skill-provider-project-layer.test.ts
```

Expected: FAIL — `getInstalled(projectDir)` currently ignores its argument, so `'deploy'` is missing.

- [ ] **Step 3: Implement the layering**

In `desktop/src/main/skill-provider.ts`, add the import at the top:

```ts
import { scanProjectSkills, mergeProjectSkills } from './project-skills';
```

Change the `getInstalled` signature and its return, leaving the whole existing cache-building body between them untouched. Add no new cache field — see the note above:

```ts
  async getInstalled(projectCwd?: string): Promise<SkillEntry[]> {
    if (!this.installedCache) {
      // ... existing body, unchanged ...
    }

    const overrides = this.configStore.getOverrides();
    const home = this.installedCache.map(skill => {
      const o = overrides[skill.id];
      if (!o) return skill;
      return { ...skill, ...o };
    });

    if (!projectCwd) return home;

    // Overrides are applied to the home layer BEFORE merging: an override is a
    // user's edit to a skill's metadata, keyed by id, and applying it after the
    // merge would let it repaint a project skill that merely shares a name.
    // Read fresh, deliberately uncached — a project's skills change when the
    // project's files change, which no existing invalidation trigger tracks.
    return mergeProjectSkills(home, scanProjectSkills(projectCwd));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/skill-provider-project-layer.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/main/skill-provider.ts desktop/tests/skill-provider-project-layer.test.ts
git commit -m "feat(skills): layer project skills over the memoized home list

getInstalled(projectCwd?) merges the project pass on top of installedCache.
Project results are cached per cwd, never in the global cache, so two sessions
on different folders cannot see each other's skills."
```

---

### Task 3: Carry the cwd across the IPC surfaces

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts:1161-1167` (the `IPC.SKILLS_LIST` and `IPC.COMMANDS_LIST` handlers)
- Modify: `desktop/src/main/preload.ts` (the `skills` and `commands` namespaces)
- Modify: `desktop/src/renderer/remote-shim.ts:846` and `:874`
- Modify: `desktop/src/main/command-provider.ts:44-79`
- Modify: `desktop/src/main/main.ts:192-198`
- Modify: `desktop/src/main/command-provider.test.ts`
- Modify: `desktop/tests/ipc-channels.test.ts`

**Interfaces:**
- Consumes: `LocalSkillProvider.getInstalled(projectCwd?)` from Task 2.
- Produces:
  - `window.claude.skills.list(cwd?: string): Promise<SkillEntry[]>`
  - `window.claude.commands.list(cwd?: string): Promise<CommandEntry[]>`
  - `CommandProvider` constructed as `new CommandProvider(getSkills)` where `getSkills: (cwd?: string) => Promise<SkillEntry[]>`; `getCommands(cwd?: string)`.

**Why `commands:list` changes too:** `main.ts:194-197` currently resolves the project cwd as `sessions[0]?.cwd ?? null` — the *first* session, not the active one — so with two sessions open on different folders, project commands already come from the wrong folder. Main has no active-session concept at all (`session-browser.ts` only ever takes an `activeSessionIds` **set**). The renderer is the only place that knows, so it must supply it. Leaving commands on the broken accessor while skills use the correct one would scope the two halves of one drawer list to two different folders.

- [ ] **Step 1: Write the failing test**

Replace the `CommandProvider` caching section of `desktop/src/main/command-provider.test.ts` — or append if none exists — with:

```ts
import { CommandProvider } from './command-provider';

describe('CommandProvider project scoping', () => {
  it('passes the per-call cwd through to the skills lookup', async () => {
    const seen: Array<string | undefined> = [];
    const provider = new CommandProvider(async (cwd?: string) => { seen.push(cwd); return []; });

    await provider.getCommands('/tmp/project-a');
    provider.invalidateCache();
    await provider.getCommands('/tmp/project-b');

    expect(seen).toEqual(['/tmp/project-a', '/tmp/project-b']);
  });

  it('caches per cwd so switching sessions does not serve the wrong folder', async () => {
    const provider = new CommandProvider(async () => []);
    const a1 = await provider.getCommands('/tmp/project-a');
    const b = await provider.getCommands('/tmp/project-b');
    const a2 = await provider.getCommands('/tmp/project-a');
    expect(a1).toBe(a2);       // same cwd → same cached array
    expect(b).not.toBe(a1);    // different cwd → its own entry
  });

  it('tolerates no cwd at all (folderless sessions)', async () => {
    const provider = new CommandProvider(async () => []);
    await expect(provider.getCommands()).resolves.toBeInstanceOf(Array);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run src/main/command-provider.test.ts
```

Expected: FAIL — the constructor still requires a second `getProjectCwd` argument and `getCommands()` takes none.

- [ ] **Step 3: Rewrite CommandProvider's caching for per-cwd scope**

In `desktop/src/main/command-provider.ts`, replace the class (lines 44-79) with:

```ts
export class CommandProvider {
  // Keyed by cwd ('' for folderless). WHY a Map instead of one field: the cwd now
  // arrives per call from the renderer, which is the only place that knows which
  // session is active — a single cache would serve session A's project commands
  // to session B. Lifetime is unchanged: cleared on plugin install/uninstall.
  private cache = new Map<string, CommandEntry[]>();
  private getSkills: (cwd?: string) => Promise<SkillEntry[]>;

  constructor(getSkills: (cwd?: string) => Promise<SkillEntry[]>) {
    this.getSkills = getSkills;
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  async getCommands(cwd?: string): Promise<CommandEntry[]> {
    const key = cwd ?? '';
    const cached = this.cache.get(key);
    if (cached) return cached;

    const home = os.homedir();
    const claudeDir = path.join(home, '.claude');

    const youcoded = expandWithAliases(YOUCODED_COMMANDS);

    // Filesystem: user + project + plugin commands
    const user = scanCommandsFromDir(path.join(claudeDir, 'commands'));
    const project = cwd ? scanCommandsFromDir(path.join(cwd, '.claude', 'commands')) : [];
    const plugin = scanAllPluginCommandDirs(claudeDir);
    const filesystem = [...user, ...project, ...plugin];

    // Skills are fetched for the SAME cwd: a project skill named `foo` must
    // suppress a `/foo` command, and a skill list from a different folder would
    // dedupe against the wrong names.
    const skills = await this.getSkills(cwd);
    const merged = mergeCommandSources(youcoded, filesystem, CC_BUILTIN_COMMANDS, skills);
    this.cache.set(key, merged);
    return merged;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run src/main/command-provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Drop the wrong accessor in main.ts**

Replace `desktop/src/main/main.ts:192-198` with:

```ts
// Fix: the project cwd now arrives per call from the renderer. It used to be
// resolved here as `sessions[0]?.cwd` — the FIRST session, not the active one —
// so with two sessions open on different folders, project commands came from
// whichever session happened to be first in the list.
const commandProvider = new CommandProvider((cwd?: string) => skillProvider.getInstalled(cwd));
```

- [ ] **Step 6: Thread the argument through the three IPC surfaces**

`desktop/src/main/ipc-handlers.ts:1161-1167`:

```ts
  ipcMain.handle(IPC.SKILLS_LIST, async (_event, cwd?: string) => {
    return skillProvider.getInstalled(cwd);
  });
  ipcMain.handle(IPC.COMMANDS_LIST, async (_event, cwd?: string) => {
    return commandProvider.getCommands(cwd);
  });
```

Keep whatever wrapping the existing handler bodies have (error handling, response shaping) — change only the signature and the forwarded argument.

`desktop/src/main/preload.ts`, in the `skills` and `commands` namespaces:

```ts
    list: (cwd?: string) => ipcRenderer.invoke(IPC.SKILLS_LIST, cwd),
```
```ts
    list: (cwd?: string) => ipcRenderer.invoke(IPC.COMMANDS_LIST, cwd),
```

`desktop/src/renderer/remote-shim.ts:846` and `:874`:

```ts
      list: (cwd?: string) => invoke('skills:list', cwd),
```
```ts
      list: (cwd?: string) => invoke('commands:list', cwd),
```

Update the `window.claude` type declaration wherever `skills.list` / `commands.list` are typed (search `skills: {` in the shared window typing) so both accept `cwd?: string`.

- [ ] **Step 7: Confirm four-surface parity still passes**

```bash
cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts
```

Expected: PASS. `ipc-channels.test.ts` pins channel *presence* per prefix, and no channel name changed — if it fails, the shim or `SessionService.kt` is out of sync and must be fixed, not the test. Confirm by reading `app/.../SessionService.kt`'s `skills:list` and `commands:list` handlers that an extra trailing argument is ignored rather than causing a parse failure; Android discovery stays home-scoped by decision, so no Kotlin behavior changes.

- [ ] **Step 8: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts \
  desktop/src/renderer/remote-shim.ts desktop/src/main/command-provider.ts \
  desktop/src/main/command-provider.test.ts desktop/src/main/main.ts
git commit -m "feat(skills): scope skills:list and commands:list to a cwd

The renderer is the only place that knows which session is active, so it now
supplies the cwd. Fixes a pre-existing bug: project commands were resolved from
sessions[0].cwd, the first session rather than the active one."
```

---

### Task 4: Teach the renderer which project it is scoped to

**Files:**
- Modify: `desktop/src/renderer/state/skill-context.tsx` (the `SkillActions` interface and both fetch effects in `SkillProvider`)
- Modify: `desktop/src/renderer/App.tsx` (add one effect in `AppInner`)
- Create: `desktop/tests/skill-context-project-scope.test.tsx`

**Interfaces:**
- Consumes: `window.claude.skills.list(cwd?)` / `window.claude.commands.list(cwd?)` from Task 3.
- Produces: `SkillContextValue.setProjectCwd(cwd: string | null): void`.

**Why a setter rather than a prop:** `SkillProvider` is mounted in `App` (`App.tsx:3658`), while `sessionId` / `sessions` live in `AppInner` (`App.tsx:165, 177-178`) — *below* the provider in the tree. The active cwd cannot be passed down as a prop without lifting session state above every provider, a large refactor of a 3,679-line file. A child telling its provider what scope it is in is the normal inversion and costs one effect.

**Already handled — do not redo.** An earlier draft of this plan deleted `App.tsx`'s dead `skills` state (set on mount, never read). Master's `aab7cfa5` ("remove dead state and dropped values found by an unused-code sweep") got there first; `App.tsx:1793-1795` is now a `// (Removed)` comment pointing at `state/skill-context.tsx` as the single skills provider. There is no dead state left to delete in this file.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/skill-context-project-scope.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import React from 'react';
import { SkillProvider, useSkills } from '../src/renderer/state/skill-context';

const listMock = vi.fn();

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  (window as any).claude = {
    skills: {
      list: listMock,
      getFavorites: async () => [],
      getChips: async () => [],
      getCuratedDefaults: async () => [],
      setFavorite: async () => {},
    },
    commands: { list: async () => [] },
  };
});

function Harness({ cwd }: { cwd: string | null }) {
  const { setProjectCwd } = useSkills();
  React.useEffect(() => { setProjectCwd(cwd); }, [cwd, setProjectCwd]);
  return null;
}

describe('SkillProvider project scope', () => {
  it('fetches with no cwd before a project is set', async () => {
    render(<SkillProvider><div /></SkillProvider>);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(listMock).toHaveBeenCalledWith(undefined);
  });

  it('refetches with the cwd when the active project changes', async () => {
    const { rerender } = render(
      <SkillProvider><Harness cwd="/tmp/project-a" /></SkillProvider>,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledWith('/tmp/project-a'));

    await act(async () => {
      rerender(<SkillProvider><Harness cwd="/tmp/project-b" /></SkillProvider>);
    });
    await waitFor(() => expect(listMock).toHaveBeenCalledWith('/tmp/project-b'));
  });

  it('does not refetch when the cwd is set to the same value again', async () => {
    render(<SkillProvider><Harness cwd="/tmp/project-a" /></SkillProvider>);
    await waitFor(() => expect(listMock).toHaveBeenCalledWith('/tmp/project-a'));
    const callsAfterFirst = listMock.mock.calls.length;

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(listMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
```

If `useSkills` is exported under a different name, read the bottom of `skill-context.tsx` and use the real one.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/skill-context-project-scope.test.tsx
```

Expected: FAIL — `setProjectCwd` is not on the context.

- [ ] **Step 3: Add project scope to SkillProvider**

In `desktop/src/renderer/state/skill-context.tsx`, add to the `SkillActions` interface:

```ts
  /** Set by whoever knows which session is active (AppInner). SkillProvider sits
   *  ABOVE the session state in the tree, so the scope has to be pushed in. */
  setProjectCwd: (cwd: string | null) => void;
```

Add the state inside `SkillProvider`:

```ts
  const [projectCwd, setProjectCwdState] = useState<string | null>(null);

  // Idempotent by value: AppInner re-runs its effect on every session-state
  // change, and refetching the whole skill list on each one would thrash the
  // drawer.
  const setProjectCwd = useCallback((cwd: string | null) => {
    setProjectCwdState((prev) => (prev === cwd ? prev : cwd));
  }, []);
```

Change the two fetch effects to depend on `projectCwd`. The commands effect:

```ts
  useEffect(() => {
    let cancelled = false;
    const api = (window as any).claude?.commands;
    if (!api?.list) return;
    api.list(projectCwd ?? undefined)
      .then((list: CommandEntry[]) => { if (!cancelled) setDrawerCommands(list ?? []); })
      .catch(() => { /* non-fatal — drawer works without commands */ });
    return () => { cancelled = true; };
  }, [projectCwd]);
```

In the initial-load effect, change the first call to `window.claude.skills.list(projectCwd ?? undefined)` and add `projectCwd` to its dependency array. The first-run favorites seeding inside it is guarded by `SEEDED_KEY` in localStorage, so re-running it on a project switch is a no-op — leave that logic untouched.

Change `refreshInstalled` to stay in scope:

```ts
  const refreshInstalled = useCallback(async () => {
    const inst = await window.claude.skills.list(projectCwd ?? undefined);
    setInstalled(inst);
  }, [projectCwd]);
```

Add `setProjectCwd` to the context value object.

- [ ] **Step 4: Push the active cwd from AppInner**

In `desktop/src/renderer/App.tsx`, inside `AppInner`, add:

```ts
  // Project-scoped skills: SkillProvider is mounted above AppInner and cannot
  // see session state, so the active session's folder is pushed up to it. Every
  // skills/commands fetch is then scoped to the folder the user is actually in.
  const { setProjectCwd } = useSkills();
  useEffect(() => {
    setProjectCwd(currentSession?.cwd ?? null);
  }, [currentSession?.cwd, setProjectCwd]);
```

`currentSession` already exists in `AppInner` as `sessions.find((s) => s.id === sessionId)`. Place the effect below that declaration; if you need it above, inline `sessions.find((s) => s.id === sessionId)?.cwd` rather than moving the existing one. Add `useSkills` to the existing import from `./state/skill-context`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/skill-context-project-scope.test.tsx
npx vitest run tests/marketplace-context-refreshes-skills.test.tsx
```

Expected: PASS both. The marketplace test must keep passing untouched — `marketplace-context.tsx:173` calls `skills.list()` with no argument and must continue to, since the marketplace screen deliberately excludes project skills.

- [ ] **Step 6: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/renderer/state/skill-context.tsx desktop/src/renderer/App.tsx \
  desktop/tests/skill-context-project-scope.test.tsx
git commit -m "feat(skills): scope the drawer to the active session's folder

SkillProvider mounts above the session state, so AppInner pushes the active cwd
in and every skills/commands fetch is scoped to it. Also deletes App.tsx's dead
skills state, which was set on mount and never read."
```

---

### Task 5: Show origin and shadowing in the drawer

**Files:**
- Modify: `desktop/src/renderer/components/SkillCard.tsx` — `SourceTag` (~`:57-68`), `SkillCardImpl` (~`:103`), and the memo comparator `skillCardPropsEqual` (~`:80`)
- Create: `desktop/tests/skill-card-project.test.tsx`

**Component facts you need** (verified against `48202704`): `SkillCard` is a **default** export (`export default SkillCard` at the file's end, wrapping `SkillCardImpl` in `React.memo`). Props are `{ skill, onClick, favorite?, pluginBadge? }`, where `favorite` is `{ filled: boolean; onToggle: () => void }` and renders `<FavoriteStar corner size="sm" …/>`. `onClick` is **required**.

**Interfaces:**
- Consumes: `SkillEntry.source === 'project'` and `SkillEntry.shadows` from Task 1.
- Produces: no new exports.

Copy rules (workspace `CLAUDE.md` — plain language, no jargon a college student would not know): the badge reads **`Folder`**; the shadow notes read **"Replaces your personal skill of the same name."** and **"A skill in this folder has this name too and isn't being used."** No mention of "precedence", "scope", or "shadowing" in user-facing text.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/skill-card-project.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SkillCard from '../src/renderer/components/SkillCard';
import type { SkillEntry } from '../src/shared/types';

function skill(over: Partial<SkillEntry> = {}): SkillEntry {
  return {
    id: 'deploy', displayName: 'Deploy', description: 'Ship it',
    category: 'other', prompt: '/deploy', source: 'project',
    type: 'plugin', visibility: 'private', ...over,
  };
}

const noop = () => {};

describe('SkillCard project skills', () => {
  it('labels a project skill with the folder badge', () => {
    render(<SkillCard skill={skill()} onClick={noop} />);
    expect(screen.getByText('Folder')).toBeTruthy();
  });

  it('says when a project skill replaced a personal one', () => {
    render(<SkillCard skill={skill({ shadows: 'self' })} onClick={noop} />);
    expect(screen.getByText(/Replaces your personal skill/i)).toBeTruthy();
  });

  it('says when a folder skill is being ignored', () => {
    render(<SkillCard skill={skill({ source: 'plugin', shadows: 'project' })} onClick={noop} />);
    expect(screen.getByText(/isn't being used/i)).toBeTruthy();
  });

  it('renders no favorite star for a project skill even when asked to', () => {
    const { container } = render(
      <SkillCard skill={skill()} onClick={noop} favorite={{ filled: false, onToggle: noop }} />,
    );
    // FavoriteStar is the only <button> this card renders — the root is a
    // <div role="button"> — so querying by tag is unambiguous.
    expect(container.querySelector('button')).toBeNull();
  });

  it('still renders the favorite star for a home skill', () => {
    const { container } = render(
      <SkillCard skill={skill({ source: 'self' })} onClick={noop} favorite={{ filled: false, onToggle: noop }} />,
    );
    expect(container.querySelector('button')).not.toBeNull();
  });
});
```

Read `SkillCard.tsx`'s real props before running this — the component takes `favorite` and `pluginBadge` objects built in `CommandDrawer.renderSkillCard` (`CommandDrawer.tsx:165-174`). Match the real prop shape and the real accessible name of the favorite control; adjust the test's queries to what the component actually renders, not to this sketch.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/skill-card-project.test.tsx
```

Expected: FAIL — no `Folder` badge exists.

- [ ] **Step 3: Implement the badge and notes**

In `desktop/src/renderer/components/SkillCard.tsx`, extend `SourceTag`:

```tsx
function SourceTag({ skill }: { skill: SkillEntry }) {
  // 'Folder' rather than 'Project': the app avoids developer vocabulary in menus
  // (workspace CLAUDE.md → Accessibility).
  const label = skill.source === 'project'
    ? 'Folder'
    : skill.source === 'youcoded-core'
      ? 'YC'
      : (typeLabels[skill.type] ?? 'Plugin');
  return (
    <span className={`text-4xs font-medium px-1 py-0.5 rounded-sm shrink-0 ${IDENTITY_BADGE}`}>
      {label}
    </span>
  );
}

// A displaced skill vanishing without explanation is what produces "why doesn't
// my skill work" reports — so the survivor says what it displaced.
function ShadowNote({ skill }: { skill: SkillEntry }) {
  if (!skill.shadows) return null;
  const text = skill.shadows === 'self'
    ? 'Replaces your personal skill of the same name.'
    : "A skill in this folder has this name too and isn't being used.";
  return <span className="text-4xs text-fg-muted">{text}</span>;
}
```

Render `<ShadowNote skill={skill} />` next to the existing description line, and gate the favorite control:

```tsx
  // Favorites are stored by id in the global ~/.claude/youcoded-skills.json, so
  // favoriting a project skill would pin it into sessions opened on folders where
  // it does not exist. Hide the affordance rather than let it fail quietly.
  {favorite && skill.source !== 'project' && ( /* ...existing favorite button... */ )}
```

Apply the same `source !== 'project'` guard wherever chips are assigned (search for the chip-assignment affordance in the drawer and the skill detail view).

**The memo comparator needs nothing new, but check it.** `skillCardPropsEqual` (~`:80`) already short-circuits on `prev.skill !== next.skill`, and every new render input (`source`, `shadows`) lives on that object, which `getInstalled` rebuilds by identity on each fetch. No comparator change is required — but read it before you assume so, because adding a field it compares by value would silently freeze the badge.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/skill-card-project.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/renderer/components/SkillCard.tsx desktop/tests/skill-card-project.test.tsx
git commit -m "feat(skills): show folder origin and name collisions in the drawer

Project skills get a Folder badge; whichever entry won a name collision says what
it displaced. Favorites and chips are hidden for project skills — both are stored
globally by id and would pin into folders where the skill does not exist."
```

---

### Task 6: One skill catalog per session cwd

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` — the constructor's `skillCatalog?` parameter (~`:173`), `toolWiring` (~`:307-319`), and `invokeSkill` (~`:673-682`)
- Modify: `desktop/src/main/ipc-handlers.ts` (~`:2213`, the comment on the 8th constructor argument)
- Create: `desktop/tests/native-project-skills.test.ts`

**`skillCatalog` names two different seams — only one of them changes.**

| Seam | Type | Who uses it | Changes? |
|---|---|---|---|
| `HarnessSessionOpts.skillCatalog` (`harness-session.ts:410`) | `SkillCatalog` | ~8 test files via `EMPTY_SKILL_CATALOG`, plus `skill-tool-gating.test.ts:17` | **No.** It already receives a per-session catalog; this task just makes the host build a better one. |
| `NativeSessionHost` constructor param 8 (~`:173`) | `SkillCatalog` → `SkillEntry[]` | `ipc-handlers.ts:2213` passes `undefined`; `mcp-startup-wiring.test.ts:159-162` pins arity | **Yes, type only.** |

Production has **never** wired the constructor param — `ipc-handlers.ts:2213` passes an explicit `undefined` with a comment saying it is "NOT wired yet — a different task's scope", present only so `mcpManager` lands in slot 9. So `this.skillCatalog` is undefined in every real session today, and `catalogFor` will always take the `scanSkills()` path in production.

**Interfaces:**
- Consumes: `scanProjectSkills`, `mergeProjectSkills` (Task 1); `createSkillCatalog(entries)` (`skill-catalog.ts:65`, unchanged).
- Produces: `NativeSessionHost` constructor parameter changes from `skillCatalog?: SkillCatalog` to `skillEntries?: SkillEntry[]`; new private `catalogFor(cwd: string): SkillCatalog`.

**Why the seam changes shape:** layering needs *entries*, not a finished catalog — a built `SkillCatalog` exposes only `list()`/`load()`, with no way to merge a project layer underneath. Both current consumers of the parameter are tests.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/native-project-skills.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanProjectSkills, mergeProjectSkills } from '../src/main/project-skills';
import { createSkillCatalog } from '../src/main/harness/skills/skill-catalog';
import type { SkillEntry } from '../src/shared/types';

describe('native session skill catalog, project-scoped', () => {
  let projectDir: string;

  const homeEntries: SkillEntry[] = [{
    id: 'theme-builder', displayName: 'Theme Builder', description: 'home one',
    category: 'other', prompt: '/theme-builder', source: 'plugin',
    type: 'plugin', visibility: 'published',
  }];

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-native-project-'));
    fs.mkdirSync(path.join(projectDir, '.claude', 'skills', 'deploy'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'skills', 'deploy', 'SKILL.md'),
      '---\nname: Deploy\ndescription: Ship it\n---\n\nRun the deploy checklist.\n',
    );
  });

  afterEach(() => {
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
  });

  it('lists a project skill alongside home skills', () => {
    const catalog = createSkillCatalog(mergeProjectSkills(homeEntries, scanProjectSkills(projectDir)));
    expect(catalog.list().map((s) => s.id).sort()).toEqual(['deploy', 'theme-builder']);
  });

  it('loads a project skill body with its frontmatter stripped', () => {
    const catalog = createSkillCatalog(mergeProjectSkills(homeEntries, scanProjectSkills(projectDir)));
    const loaded = catalog.load('deploy');
    expect(loaded.body).toBe('Run the deploy checklist.');
    expect(loaded.file).toBe(path.join(projectDir, '.claude', 'skills', 'deploy', 'SKILL.md'));
  });

  it('a catalog built for another folder does not know the project skill', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-native-other-'));
    try {
      const catalog = createSkillCatalog(mergeProjectSkills(homeEntries, scanProjectSkills(other)));
      expect(() => catalog.load('deploy')).toThrow(/No skill named 'deploy'/);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test — it should PASS before the rewire**

```bash
cd youcoded/desktop && npx vitest run tests/native-project-skills.test.ts
```

Expected: PASS. This is deliberately not a red-first test: it pins the *composition* (Task 1's functions feeding the existing, unmodified `createSkillCatalog`) so that if Step 3 breaks something, you know the composition was sound and the host wiring is at fault. Treat a failure here as a Task 1 defect, not a Task 6 one.

- [ ] **Step 3: Rewire the host**

In `desktop/src/main/harness/native-session-host.ts`, change the constructor parameter (`private skillCatalog?: SkillCatalog`, ~`:173`) to:

```ts
    // Entries, not a built catalog: layering a project pass underneath needs the
    // list, and a SkillCatalog only exposes list()/load(). Test seam only —
    // production passes nothing and the home layer is scanned on demand.
    private skillEntries?: SkillEntry[],
```

Add the per-cwd catalog factory as a private method:

```ts
  // One catalog per session folder. A single host-wide catalog cannot be right:
  // each session has its own cwd and therefore its own project skills. Memoized
  // per cwd — the filesystem work is small, but buildAiTools() reads the catalog
  // on every tool sync.
  private catalogCache = new Map<string, SkillCatalog>();

  private catalogFor(cwd: string | undefined): SkillCatalog {
    const key = cwd ?? '';
    const cached = this.catalogCache.get(key);
    if (cached) return cached;
    const home = this.skillEntries ?? scanSkills();
    const catalog = createSkillCatalog(cwd ? mergeProjectSkills(home, scanProjectSkills(cwd)) : home);
    this.catalogCache.set(key, catalog);
    return catalog;
  }
```

Add the imports:

```ts
import { scanSkills } from '../skill-scanner';
import { scanProjectSkills, mergeProjectSkills } from '../project-skills';
import type { SkillEntry } from '../../shared/types';
```

In `toolWiring` (~`:307`, which already receives `cwd` as its second parameter), replace the conditional spread at ~`:319`:

```ts
      // Was: ...(this.skillCatalog ? { skillCatalog: this.skillCatalog } : {})
      skillCatalog: this.catalogFor(cwd),
```

In `invokeSkill` (~`:682`), replace `(this.skillCatalog ?? createSkillCatalog())` with the session's own catalog. No helper is needed — `invokeSkill` has already resolved `const entry = this.live.get(sessionId)` two lines above, and `LiveEntry` carries `cwd` (`:64`):

```ts
      loaded = this.catalogFor(entry.cwd).load(skill);
```

`createSkillCatalog` may now be unused in this file; if so remove it from the import at `:31` and let `knip` confirm.

**Invalidation:** clear `catalogCache` wherever the host already responds to skill install/uninstall. If it does not listen for that today, leave it — the per-session snapshot at `skill.ts:26-28` means a new session picks up new skills, which is exactly Claude Code's behavior and what the spec specifies. Do not add an invalidation path that is not needed.

- [ ] **Step 4: Refresh the now-stale production comment**

`ipc-handlers.ts:2213` still says the 8th argument is "NOT wired yet — a different task's scope". The argument stays `undefined`, but the reason is now different, so replace that comment:

```ts
    // skillEntries (8th param): a TEST SEAM only. Production passes undefined so
    // the host scans on demand and layers each session's project skills on top
    // (see catalogFor). Passed explicitly so mcpManager lands in the 9th slot.
    undefined,
```

**No test changes are expected in this task.** `mcp-startup-wiring.test.ts:159-162` pins only the argument *count* and that index 7 is `undefined` — both still true. `skill-tool-gating.test.ts` and the `EMPTY_SKILL_CATALOG` users touch `HarnessSessionOpts.skillCatalog`, which is unchanged. If any of them fails, something in the table above was violated; fix the code, not the test.

- [ ] **Step 5: Run the affected tests**

```bash
cd youcoded/desktop && npx vitest run tests/native-project-skills.test.ts \
  tests/native-skill-invoke.test.ts tests/skill-tool-gating.test.ts \
  tests/skill-tool.test.ts tests/mcp-startup-wiring.test.ts
```

Expected: PASS, all five files.

- [ ] **Step 6: Verify and commit**

```bash
bash scripts/verify.sh
cd youcoded && git add desktop/src/main/harness/native-session-host.ts desktop/src/main/ipc-handlers.ts \
  desktop/tests/native-project-skills.test.ts
git commit -m "feat(native): build the skill catalog per session folder

Each native session has its own cwd and therefore its own project skills, so a
single host-wide catalog cannot be correct. The constructor seam takes entries
rather than a built catalog because layering needs the list."
```

---

### Task 7: Attribute project skills in the injected block

**Files:**
- Modify: `desktop/src/main/harness/tools/skill.ts:43-53`
- Modify: `desktop/src/main/harness/skills/skill-invocation.ts:13`
- Modify: `desktop/src/main/harness/skills/skill-catalog.ts:15-20, 94` (carry `source` on `LoadedSkill`)
- Modify: `desktop/tests/skill-tool.test.ts`, `desktop/tests/skill-invocation-display.test.ts`

**Interfaces:**
- Consumes: `SkillEntry.source` (Task 1), `catalog.load()` (Task 6).
- Produces: `LoadedSkill` gains `source: SkillEntry['source']`; `frameSkillInvocation(skillId, instructions, args?, origin?)`.

- [ ] **Step 1: Write the failing test**

Append to `desktop/tests/skill-tool.test.ts`:

```ts
  it('names the folder origin when the skill came from the project', async () => {
    const catalog = {
      list: () => [{ id: 'deploy', description: 'Ship it' }],
      load: () => ({
        id: 'deploy', displayName: 'Deploy', description: 'Ship it',
        body: 'Run the checklist.', file: '/proj/.claude/skills/deploy/SKILL.md',
        source: 'project' as const,
      }),
    };
    const tool = createSkillTool(catalog as any);
    const result = await tool.execute({ skill: 'deploy' }, {} as any);
    expect(result.text).toContain('origin="project"');
    expect(result.text).toContain('Run the checklist.');
  });

  it('omits the origin attribute for a home skill', async () => {
    const catalog = {
      list: () => [{ id: 'audit', description: 'Audit' }],
      load: () => ({
        id: 'audit', displayName: 'Audit', description: 'Audit',
        body: 'Audit body.', file: '/home/.claude/skills/audit/SKILL.md',
        source: 'self' as const,
      }),
    };
    const tool = createSkillTool(catalog as any);
    const result = await tool.execute({ skill: 'audit' }, {} as any);
    expect(result.text).not.toContain('origin=');
  });
```

Match the existing test file's import style and its way of invoking `execute` — read it first; the `ToolContext` argument may need real fields.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/skill-tool.test.ts
```

Expected: FAIL — no `origin=` in the output.

- [ ] **Step 3: Carry the source through the catalog**

In `desktop/src/main/harness/skills/skill-catalog.ts`, add to the `LoadedSkill` interface:

```ts
  /** Where the instructions came from. A project skill is content from the folder
   *  the user opened, and the injected block says so rather than presenting it as
   *  anonymous authority. */
  source: SkillEntry['source'];
```

And in the `return` at `:94`, add `source: entry.source,`.

- [ ] **Step 4: Attribute in both invocation paths**

In `desktop/src/main/harness/tools/skill.ts`, change the success return:

```ts
        const skill = catalog.load(args.skill);
        // Only project skills are attributed: everything else is the user's own
        // install, and an origin on every skill is noise the model pays for on
        // each turn.
        const origin = skill.source === 'project' ? ' origin="project"' : '';
        return { text: `<skill-instructions name="${skill.id}"${origin}>\n${skill.body}\n</skill-instructions>` };
```

In `desktop/src/main/harness/skills/skill-invocation.ts`, add an optional fourth parameter. The file's header says the wording *is* the entire mechanism and is pure so it stays testable — so add to it, do not restructure it. The whole function becomes:

```ts
export function frameSkillInvocation(
  skillId: string,
  instructions: string,
  args?: string,
  origin?: 'project',
): string {
  // The bare command name is what the user typed — "/theme-builder", not
  // "/wecoded-themes-plugin:theme-builder" — so that is what we echo back.
  const bare = skillId.includes(':') ? skillId.split(':').slice(-1)[0] : skillId;
  // Project skills are content from the folder the user opened, not something
  // they installed. Saying so keeps the model from treating a repo's committed
  // instructions as the app's own authority. Only project skills are labelled:
  // an origin line on every skill is per-turn noise for no gain.
  const attribution = origin === 'project'
    ? ' These instructions come from the project folder this session is open on.'
    : '';
  const parts = [
    `<skill-instructions name="${skillId}"${origin === 'project' ? ' origin="project"' : ''}>\n${instructions}\n</skill-instructions>`,
    `The user ran /${bare}.${attribution} Begin following these instructions now — do not summarize them back.`,
  ];
  // The user's own words go LAST so they are the most recent thing the model
  // reads: a skill that says "act on what the user asked" needs them in view.
  if (args) parts.push(args);
  return parts.join('\n\n');
}
```

Then pass the origin from `invokeSkill` in `native-session-host.ts` (the `frameSkillInvocation(loaded.id, fitted.text, args)` call, ~`:706`):

```ts
    const body = frameSkillInvocation(
      loaded.id, fitted.text, args,
      loaded.source === 'project' ? 'project' : undefined,
    );
```

Add a matching case to `desktop/tests/skill-invocation-display.test.ts` asserting the project sentence appears for `origin: 'project'` and is absent otherwise — that file already pins this function's exact wording, which is why it is listed in this task's files.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/skill-tool.test.ts tests/skill-invocation-display.test.ts \
  tests/skill-invocation-turn-start.test.ts tests/skill-catalog.test.ts
```

Expected: PASS, all four files.

- [ ] **Step 6: Full verification and commit**

```bash
bash scripts/verify.sh --full
cd youcoded && git add desktop/src/main/harness/tools/skill.ts \
  desktop/src/main/harness/skills/skill-invocation.ts \
  desktop/src/main/harness/skills/skill-catalog.ts desktop/tests/skill-tool.test.ts
git commit -m "feat(native): attribute project skills in the injected block

Instructions loaded from the folder the session is open on say where they came
from instead of arriving as anonymous authority. Home skills are unchanged — an
origin on every skill is per-turn noise."
```

---

## Manual verification

After Task 7, before opening the PR. Per the workspace rule, this is a **handoff to Destin**, not a scripted rig — it is interactive and visual:

1. `bash scripts/run-dev.sh <worktree> --label "Project Skills"` (never the production install).
2. Open a native session on `youcoded-dev`, which has real project skills (`.claude/skills/ui-mockup`, `.claude/skills/audit`).
3. Confirm: `/ui-mockup` runs; the drawer lists it with a **Folder** badge; the favorite star is absent on it.
4. Open a second native session on a folder with no `.claude/skills/`; confirm the drawer no longer lists `ui-mockup` and switching between the two sessions swaps the list.
5. Confirm the marketplace screen shows no project skills in Installed.

## Out of scope — do not implement

- Any project pass in `app/.../skills/SkillScanner.kt`. Android is deferred to M8 (`ROADMAP.md`), including its missing `~/.claude/skills/` user pass.
- Publishing, sharing, favoriting, or chip-pinning project skills.
- A trust prompt before project skills load.
