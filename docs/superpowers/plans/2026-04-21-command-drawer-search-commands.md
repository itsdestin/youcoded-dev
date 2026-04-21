# Command Drawer Search — Include Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface slash commands alongside skills in the `CommandDrawer`'s search results — YouCoded-handled, filesystem-scanned user/project/plugin, and CC built-ins — while keeping the browse-mode (empty query) view skill-only.

**Architecture:** New `command-provider.ts` merges three sources (YouCoded-handled hardcoded, filesystem-scanned `.md` files, CC built-in hardcoded list) into a `CommandEntry[]` exposed via a new `commands:list` IPC handler on desktop and Android. The renderer's `CommandDrawer` pulls the merged list via `window.claude.commands.list()` through a new `drawerCommands` field on `SkillContext`, filters them in search mode only, and renders them alongside skills. CC built-ins render as disabled cards with a "Please run in Terminal View" note.

**Tech Stack:** TypeScript, React, Electron IPC, Vitest (desktop tests), Kotlin (Android parity).

**Reference spec:** `docs/superpowers/specs/2026-04-21-command-drawer-search-commands-design.md`

---

## File Structure

### New files
- `youcoded/desktop/src/main/youcoded-commands.ts` — hardcoded list of the 9 dispatcher-backed commands
- `youcoded/desktop/src/main/cc-builtin-commands.ts` — hardcoded list of 18 CC built-ins (all `clickable: false`)
- `youcoded/desktop/src/main/command-scanner.ts` — filesystem scan for user/project/plugin `.md` commands
- `youcoded/desktop/src/main/command-provider.ts` — merges the three sources with dedup
- `youcoded/desktop/src/main/cc-builtin-commands.test.ts`
- `youcoded/desktop/src/main/youcoded-commands.test.ts`
- `youcoded/desktop/src/main/command-scanner.test.ts`
- `youcoded/desktop/src/main/command-provider.test.ts`
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/CommandProvider.kt`

### Modified files
- `youcoded/desktop/src/shared/types.ts` — add `CommandEntry` type
- `youcoded/desktop/src/main/ipc-handlers.ts` — add `commands:list` handler, inject `commandProvider`
- `youcoded/desktop/src/main/main.ts` (or wherever `ipc-handlers.ts` is registered) — instantiate `CommandProvider`
- `youcoded/desktop/src/main/preload.ts` — expose `window.claude.commands.list()`; add `COMMANDS_LIST` channel constant
- `youcoded/desktop/src/renderer/remote-shim.ts` — expose `commands.list()` over WebSocket
- `youcoded/desktop/src/renderer/state/skill-context.tsx` — add `drawerCommands` field + fetch
- `youcoded/desktop/src/renderer/components/CommandDrawer.tsx` — render commands in search mode
- `youcoded/desktop/src/renderer/App.tsx` — new `handleSelectCommand` callback
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — add `commands:list` case
- `youcoded/docs/cc-dependencies.md` — add "CC built-in command list" coupling entry

---

## Task 1: Add `CommandEntry` shared type

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`

- [ ] **Step 1: Add the type definition**

Open `youcoded/desktop/src/shared/types.ts`. After the existing `SkillEntry` type, add:

```ts
// Command drawer entry — represents a slash command that can appear
// in the CommandDrawer's search results. Distinct from SkillEntry
// because commands may be unclickable (e.g. CC built-ins without a
// native UI in YouCoded).
export type CommandEntry = {
  name: string                   // '/compact', '/superpowers:brainstorm'
  description: string
  source: 'youcoded' | 'filesystem' | 'cc-builtin'
  clickable: boolean
  disabledReason?: string        // populated when clickable=false
  aliases?: string[]             // e.g. /clear → ['/reset', '/new']
}
```

- [ ] **Step 2: Commit**

```bash
cd youcoded
git add desktop/src/shared/types.ts
git commit -m "feat(types): add CommandEntry shared type"
```

---

## Task 2: Create CC built-ins hardcoded list

**Files:**
- Create: `youcoded/desktop/src/main/cc-builtin-commands.ts`
- Create: `youcoded/desktop/src/main/cc-builtin-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/main/cc-builtin-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CC_BUILTIN_COMMANDS, DISABLED_REASON } from './cc-builtin-commands';

describe('cc-builtin-commands', () => {
  it('exports a non-empty list', () => {
    expect(CC_BUILTIN_COMMANDS.length).toBeGreaterThan(0);
  });

  it('every entry is marked unclickable and sourced to cc-builtin', () => {
    for (const entry of CC_BUILTIN_COMMANDS) {
      expect(entry.clickable).toBe(false);
      expect(entry.source).toBe('cc-builtin');
      expect(entry.disabledReason).toBe(DISABLED_REASON(entry.name));
    }
  });

  it('every name starts with "/"', () => {
    for (const entry of CC_BUILTIN_COMMANDS) {
      expect(entry.name.startsWith('/')).toBe(true);
    }
  });

  it('every entry has a non-empty description', () => {
    for (const entry of CC_BUILTIN_COMMANDS) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('names are unique', () => {
    const names = CC_BUILTIN_COMMANDS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/main/cc-builtin-commands.test.ts`
Expected: FAIL with module-not-found error for `./cc-builtin-commands`.

- [ ] **Step 3: Create the list module**

Create `youcoded/desktop/src/main/cc-builtin-commands.ts`:

```ts
// Hardcoded list of Claude Code built-in slash commands.
//
// Why hardcoded: Claude Code ships as a compiled binary with no filesystem-
// discoverable manifest for its built-in commands. The SDK init message
// (`system/init.slash_commands`) omits most core meta commands (/help,
// /status, /permissions, etc.) and provides name-only data for the rest.
// Maintaining the list by hand with a `cc-dependencies.md` audit entry is
// the least-fragile path for this data. When CC adds, renames, or removes
// a built-in, the `review-cc-changes` release agent flags the drift.
//
// Every entry is unclickable: its UI is a terminal-only TUI panel that
// does not render in chat view. Promoting a built-in to clickable means
// moving it into youcoded-commands.ts and adding a dispatcher case in
// slash-command-dispatcher.ts.

import type { CommandEntry } from '../shared/types';

export const DISABLED_REASON = (name: string): string =>
  `Please run ${name} in Terminal View.`;

export const CC_BUILTIN_COMMANDS: CommandEntry[] = [
  { name: '/help',            description: 'Show Claude Code help',                            source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/help') },
  { name: '/status',          description: 'Show session, config, and auth status',            source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/status') },
  { name: '/permissions',     description: 'Manage tool permissions',                          source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/permissions') },
  { name: '/memory',          description: 'Edit CLAUDE.md memory files',                      source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/memory') },
  { name: '/agents',          description: 'Manage subagents',                                 source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/agents') },
  { name: '/mcp',             description: 'Manage MCP servers',                               source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/mcp') },
  { name: '/plugin',          description: 'Manage plugins',                                   source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/plugin') },
  { name: '/hooks',           description: 'Manage hooks',                                     source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/hooks') },
  { name: '/doctor',          description: 'Diagnose the installation',                        source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/doctor') },
  { name: '/logout',          description: 'Sign out of your Anthropic account',               source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/logout') },
  { name: '/context',         description: 'Show current context-window usage',                source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/context') },
  { name: '/review',          description: 'Review a pull request',                            source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/review') },
  { name: '/security-review', description: 'Review pending changes for security issues',       source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/security-review') },
  { name: '/init',            description: 'Initialize a CLAUDE.md file',                      source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/init') },
  { name: '/extra-usage',     description: 'Show detailed usage data',                         source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/extra-usage') },
  { name: '/heapdump',        description: 'Dump a heap snapshot',                             source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/heapdump') },
  { name: '/insights',        description: 'Show session insights',                            source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/insights') },
  { name: '/team-onboarding', description: 'Team setup flow',                                  source: 'cc-builtin', clickable: false, disabledReason: DISABLED_REASON('/team-onboarding') },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/main/cc-builtin-commands.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/main/cc-builtin-commands.ts desktop/src/main/cc-builtin-commands.test.ts
git commit -m "feat(commands): add CC built-in command list"
```

---

## Task 3: Create YouCoded-handled commands hardcoded list

**Files:**
- Create: `youcoded/desktop/src/main/youcoded-commands.ts`
- Create: `youcoded/desktop/src/main/youcoded-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/main/youcoded-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { YOUCODED_COMMANDS, expandWithAliases } from './youcoded-commands';

describe('youcoded-commands', () => {
  it('exports every dispatcher-backed command', () => {
    const names = YOUCODED_COMMANDS.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        '/compact', '/clear', '/model', '/fast', '/effort',
        '/copy', '/resume', '/config', '/cost',
      ]),
    );
  });

  it('every entry is clickable and sourced to youcoded', () => {
    for (const entry of YOUCODED_COMMANDS) {
      expect(entry.clickable).toBe(true);
      expect(entry.source).toBe('youcoded');
      expect(entry.disabledReason).toBeUndefined();
    }
  });

  it('expandWithAliases flattens aliases into standalone entries', () => {
    const expanded = expandWithAliases(YOUCODED_COMMANDS);
    const names = expanded.map((e) => e.name);
    // /clear aliases to /reset, /new
    expect(names).toContain('/reset');
    expect(names).toContain('/new');
    // /config aliases to /settings
    expect(names).toContain('/settings');
    // /cost aliases to /usage
    expect(names).toContain('/usage');
  });

  it('expanded entries carry the primary description and are clickable', () => {
    const expanded = expandWithAliases(YOUCODED_COMMANDS);
    const reset = expanded.find((e) => e.name === '/reset');
    expect(reset?.clickable).toBe(true);
    expect(reset?.source).toBe('youcoded');
    expect(reset?.description.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/main/youcoded-commands.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create the list module**

Create `youcoded/desktop/src/main/youcoded-commands.ts`:

```ts
// YouCoded-handled slash commands. Each has native UI implemented in
// `src/renderer/state/slash-command-dispatcher.ts`. Keep this list in
// sync with the `switch` cases in that file.

import type { CommandEntry } from '../shared/types';

export const YOUCODED_COMMANDS: CommandEntry[] = [
  { name: '/compact', description: 'Compact conversation with native spinner card', source: 'youcoded', clickable: true },
  { name: '/clear',   description: 'Clear conversation timeline with native marker', source: 'youcoded', clickable: true, aliases: ['/reset', '/new'] },
  { name: '/model',   description: 'Open native model picker',                        source: 'youcoded', clickable: true },
  { name: '/fast',    description: 'Toggle fast mode',                                source: 'youcoded', clickable: true },
  { name: '/effort',  description: 'Open effort-level picker',                        source: 'youcoded', clickable: true },
  { name: '/copy',    description: 'Copy assistant response to clipboard',            source: 'youcoded', clickable: true },
  { name: '/resume',  description: 'Open native Resume Browser',                      source: 'youcoded', clickable: true },
  { name: '/config',  description: 'Open Preferences popup',                          source: 'youcoded', clickable: true, aliases: ['/settings'] },
  { name: '/cost',    description: 'Show native Usage card',                          source: 'youcoded', clickable: true, aliases: ['/usage'] },
];

// Flatten primary entries + aliases so each is an independently
// searchable row in the drawer. Aliases inherit description + click
// behavior from the primary.
export function expandWithAliases(entries: CommandEntry[]): CommandEntry[] {
  const out: CommandEntry[] = [];
  for (const entry of entries) {
    out.push({ ...entry, aliases: undefined });
    for (const alias of entry.aliases ?? []) {
      out.push({ ...entry, name: alias, aliases: undefined });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/main/youcoded-commands.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/main/youcoded-commands.ts desktop/src/main/youcoded-commands.test.ts
git commit -m "feat(commands): add YouCoded-handled command list"
```

---

## Task 4: Create filesystem command scanner

**Files:**
- Create: `youcoded/desktop/src/main/command-scanner.ts`
- Create: `youcoded/desktop/src/main/command-scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/main/command-scanner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanCommandsFromDir, scanPluginCommandsDir } from './command-scanner';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yc-cmd-test-'));
}

describe('command-scanner', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('returns [] when directory does not exist', () => {
    const out = scanCommandsFromDir(path.join(tmp, 'missing'));
    expect(out).toEqual([]);
  });

  it('returns [] when directory is empty', () => {
    const out = scanCommandsFromDir(tmp);
    expect(out).toEqual([]);
  });

  it('reads .md files and extracts frontmatter description', () => {
    fs.writeFileSync(path.join(tmp, 'foo.md'),
      '---\ndescription: Does the foo thing\n---\n\nbody');
    fs.writeFileSync(path.join(tmp, 'bar.md'),
      '---\ndescription: "Does the bar thing"\n---\n\nbody');
    const out = scanCommandsFromDir(tmp).sort((a, b) => a.name.localeCompare(b.name));
    expect(out).toEqual([
      { name: '/bar', description: 'Does the bar thing', source: 'filesystem', clickable: true },
      { name: '/foo', description: 'Does the foo thing', source: 'filesystem', clickable: true },
    ]);
  });

  it('handles .md files with no frontmatter (empty description)', () => {
    fs.writeFileSync(path.join(tmp, 'nofm.md'), 'just body, no frontmatter');
    const out = scanCommandsFromDir(tmp);
    expect(out).toEqual([
      { name: '/nofm', description: '', source: 'filesystem', clickable: true },
    ]);
  });

  it('ignores non-.md files', () => {
    fs.writeFileSync(path.join(tmp, 'readme.txt'), 'not a command');
    const out = scanCommandsFromDir(tmp);
    expect(out).toEqual([]);
  });

  it('scanPluginCommandsDir namespaces entries with plugin slug', () => {
    const pluginCmds = path.join(tmp, 'commands');
    fs.mkdirSync(pluginCmds);
    fs.writeFileSync(path.join(pluginCmds, 'brainstorm.md'),
      '---\ndescription: Brainstorm with Claude\n---\n');
    const out = scanPluginCommandsDir(tmp, 'superpowers');
    expect(out).toEqual([
      { name: '/superpowers:brainstorm', description: 'Brainstorm with Claude', source: 'filesystem', clickable: true },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/main/command-scanner.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the scanner**

Create `youcoded/desktop/src/main/command-scanner.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { CommandEntry } from '../shared/types';

// Scans `.md` files in a single directory and returns one CommandEntry per
// file. The command name is the file stem with a leading slash; the
// description is pulled from the YAML frontmatter `description:` field
// (or empty string if no frontmatter / no description).
export function scanCommandsFromDir(dir: string): CommandEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: CommandEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const stem = entry.name.slice(0, -3);
    let description = '';
    try {
      const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      description = extractFrontmatterDescription(raw);
    } catch {
      // ignore unreadable files
    }
    out.push({
      name: `/${stem}`,
      description,
      source: 'filesystem',
      clickable: true,
    });
  }
  return out;
}

// Scans a plugin's `commands/` subdirectory and namespaces each entry with
// the plugin slug (e.g. `superpowers/commands/brainstorm.md` →
// `/superpowers:brainstorm`). The caller passes `pluginDir` (the plugin
// root) and `pluginSlug` (the namespace prefix).
export function scanPluginCommandsDir(pluginDir: string, pluginSlug: string): CommandEntry[] {
  const commandsDir = path.join(pluginDir, 'commands');
  const raw = scanCommandsFromDir(commandsDir);
  return raw.map((entry) => ({
    ...entry,
    name: `/${pluginSlug}:${entry.name.slice(1)}`, // strip leading '/' then re-add with namespace
  }));
}

// Parse the `description:` field out of a YAML frontmatter block. Not a
// full YAML parser — we only need this one field and it's always a simple
// scalar in existing plugin command files. Returns '' if absent.
function extractFrontmatterDescription(content: string): string {
  if (!content.startsWith('---')) return '';
  const end = content.indexOf('\n---', 3);
  if (end === -1) return '';
  const block = content.slice(3, end);
  const match = block.match(/^\s*description\s*:\s*(.+?)\s*$/m);
  if (!match) return '';
  let value = match[1].trim();
  // Strip surrounding quotes if present.
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/main/command-scanner.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/main/command-scanner.ts desktop/src/main/command-scanner.test.ts
git commit -m "feat(commands): add filesystem scanner for user/project/plugin commands"
```

---

## Task 5: Create `CommandProvider` that merges the three sources

**Files:**
- Create: `youcoded/desktop/src/main/command-provider.ts`
- Create: `youcoded/desktop/src/main/command-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/main/command-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeCommandSources } from './command-provider';
import type { CommandEntry } from '../shared/types';
import type { SkillEntry } from '../shared/types';

const youcoded: CommandEntry[] = [
  { name: '/compact', description: 'yc compact', source: 'youcoded', clickable: true },
];
const filesystem: CommandEntry[] = [
  { name: '/compact', description: 'fs compact (should lose)', source: 'filesystem', clickable: true },
  { name: '/announce', description: 'fs announce',              source: 'filesystem', clickable: true },
];
const ccBuiltin: CommandEntry[] = [
  { name: '/help', description: 'cc help', source: 'cc-builtin', clickable: false, disabledReason: 'Please run /help in Terminal View.' },
  { name: '/compact', description: 'cc compact (should lose)', source: 'cc-builtin', clickable: false },
];

describe('mergeCommandSources', () => {
  it('applies precedence youcoded > filesystem > cc-builtin', () => {
    const merged = mergeCommandSources(youcoded, filesystem, ccBuiltin, []);
    const compact = merged.find((e) => e.name === '/compact');
    expect(compact?.source).toBe('youcoded');
    expect(compact?.description).toBe('yc compact');
  });

  it('keeps entries with unique names from all sources', () => {
    const merged = mergeCommandSources(youcoded, filesystem, ccBuiltin, []);
    const names = merged.map((e) => e.name);
    expect(names).toContain('/compact');
    expect(names).toContain('/announce');
    expect(names).toContain('/help');
  });

  it('drops a command whose name matches an existing skill', () => {
    const skills: SkillEntry[] = [
      { id: 'announce', displayName: 'announce', description: '', category: 'other', prompt: '/announce' } as any,
    ];
    const merged = mergeCommandSources(youcoded, filesystem, ccBuiltin, skills);
    expect(merged.find((e) => e.name === '/announce')).toBeUndefined();
  });

  it('skill-dedup is name-keyed on the command name (with /) vs skill.displayName (no /)', () => {
    const skills: SkillEntry[] = [
      { id: 'x', displayName: 'help', description: '', category: 'other', prompt: '' } as any,
    ];
    const merged = mergeCommandSources([], [], ccBuiltin, skills);
    expect(merged.find((e) => e.name === '/help')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/main/command-provider.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the provider**

Create `youcoded/desktop/src/main/command-provider.ts`:

```ts
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { CommandEntry, SkillEntry } from '../shared/types';
import { YOUCODED_COMMANDS, expandWithAliases } from './youcoded-commands';
import { CC_BUILTIN_COMMANDS } from './cc-builtin-commands';
import { scanCommandsFromDir, scanPluginCommandsDir } from './command-scanner';

// Precedence for name collisions: YouCoded (native UI) beats filesystem,
// which beats CC built-in. A command whose name matches an existing skill
// is dropped entirely (avoids double-listing skill-backed CC commands like
// /review, /init, /security-review that ship as skills).
export function mergeCommandSources(
  youcoded: CommandEntry[],
  filesystem: CommandEntry[],
  ccBuiltin: CommandEntry[],
  skills: SkillEntry[],
): CommandEntry[] {
  // Build the skill-name set (names normalized with leading slash for
  // comparison against CommandEntry.name).
  const skillNames = new Set<string>(skills.map((s) => `/${s.displayName}`));

  const byName = new Map<string, CommandEntry>();
  // Insert in reverse precedence so higher-precedence sources overwrite.
  for (const entry of ccBuiltin)  byName.set(entry.name, entry);
  for (const entry of filesystem) byName.set(entry.name, entry);
  for (const entry of youcoded)   byName.set(entry.name, entry);

  // Drop anything that collides with a skill name.
  for (const skillName of skillNames) byName.delete(skillName);

  return Array.from(byName.values());
}

// Stateful provider. Caches the merged list for the session lifetime,
// invalidated via `invalidateCache()` when plugin install/uninstall changes
// the filesystem. Mirrors the LocalSkillProvider caching pattern.
export class CommandProvider {
  private cache: CommandEntry[] | null = null;
  private getSkills: () => SkillEntry[];
  private getProjectCwd: () => string | null;

  constructor(
    getSkills: () => SkillEntry[],
    getProjectCwd: () => string | null,
  ) {
    this.getSkills = getSkills;
    this.getProjectCwd = getProjectCwd;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  getCommands(): CommandEntry[] {
    if (this.cache) return this.cache;

    const home = os.homedir();
    const claudeDir = path.join(home, '.claude');

    const youcoded = expandWithAliases(YOUCODED_COMMANDS);

    // Filesystem: user + project + plugin commands
    const user = scanCommandsFromDir(path.join(claudeDir, 'commands'));
    const cwd = this.getProjectCwd();
    const project = cwd ? scanCommandsFromDir(path.join(cwd, '.claude', 'commands')) : [];
    const plugin = scanAllPluginCommandDirs(claudeDir);
    const filesystem = [...user, ...project, ...plugin];

    const skills = this.getSkills();
    this.cache = mergeCommandSources(youcoded, filesystem, CC_BUILTIN_COMMANDS, skills);
    return this.cache;
  }
}

// Walk `~/.claude/plugins/marketplaces/*/plugins/*/commands/` and collect
// every plugin's namespaced commands.
function scanAllPluginCommandDirs(claudeDir: string): CommandEntry[] {
  const marketplacesRoot = path.join(claudeDir, 'plugins', 'marketplaces');
  const out: CommandEntry[] = [];

  let marketplaces: fs.Dirent[];
  try {
    marketplaces = fs.readdirSync(marketplacesRoot, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const mp of marketplaces) {
    if (!mp.isDirectory()) continue;
    const pluginsRoot = path.join(marketplacesRoot, mp.name, 'plugins');
    let plugins: fs.Dirent[];
    try {
      plugins = fs.readdirSync(pluginsRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(pluginsRoot, plugin.name);
      out.push(...scanPluginCommandsDir(pluginDir, plugin.name));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/main/command-provider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/main/command-provider.ts desktop/src/main/command-provider.test.ts
git commit -m "feat(commands): add CommandProvider merging three sources"
```

---

## Task 6: Wire `commands:list` IPC handler on desktop

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts` (add channel constant only — exposure comes in Task 7)
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: main-process bootstrap file that calls `registerIpcHandlers()` (search the codebase — likely `src/main/main.ts` or similar)

- [ ] **Step 1: Add `COMMANDS_LIST` channel constant to preload.ts**

In `youcoded/desktop/src/main/preload.ts`, find the block of `IPC` constants (starts around line 9). Add a new line alongside `SKILLS_LIST`:

```ts
COMMANDS_LIST: 'commands:list',
```

Exact placement: keep it in alphabetical-ish order near the other `SKILLS_*` constants.

- [ ] **Step 2: Find the bootstrap that constructs providers and calls `registerIpcHandlers`**

Run: `cd youcoded/desktop && grep -rn "registerIpcHandlers\|new LocalSkillProvider" src/main/ | head -20`
Expected: one call site where `LocalSkillProvider` is instantiated and passed into `registerIpcHandlers`.

- [ ] **Step 3: Instantiate `CommandProvider` in the bootstrap**

In the file identified in Step 2, near where `LocalSkillProvider` is constructed, add:

```ts
import { CommandProvider } from './command-provider';

// After sessionManager and skillProvider are constructed:
const commandProvider = new CommandProvider(
  () => skillProvider.getInstalled(),
  () => {
    const sessions = sessionManager.listSessions();
    // Use the most recently active session's cwd for project commands.
    // Commands in different sessions with different cwds is a rare case —
    // the drawer is per-app-window so one cwd at a time is fine.
    return sessions[0]?.cwd ?? null;
  },
);
```

Then pass `commandProvider` into `registerIpcHandlers(..., commandProvider)`.

- [ ] **Step 4: Update `registerIpcHandlers()` signature and add handler**

In `youcoded/desktop/src/main/ipc-handlers.ts`:

- Update the function signature to accept `commandProvider: CommandProvider`.
- At the top, import: `import { CommandProvider } from './command-provider';`
- Near the existing `ipcMain.handle(IPC.SKILLS_LIST, ...)` (around line 743), add:

```ts
ipcMain.handle(IPC.COMMANDS_LIST, async () => {
  return commandProvider.getCommands();
});
```

- [ ] **Step 5: Add cache invalidation hooks on plugin install/uninstall**

In `youcoded/desktop/src/main/skill-provider.ts`, wherever `this.installedCache = null` is set (lines 214, 249, 339, 358, 363, 369 per earlier mapping), the `CommandProvider` also needs invalidation because a plugin install changes the filesystem scan. Since `CommandProvider` is external to `SkillProvider`, wire it via a simple callback.

In `skill-provider.ts`, add a field:

```ts
private onCacheInvalidated?: () => void;

setCacheInvalidationListener(cb: () => void): void {
  this.onCacheInvalidated = cb;
}
```

Call `this.onCacheInvalidated?.()` immediately after each `this.installedCache = null` line.

In the bootstrap (from Step 3), wire:

```ts
skillProvider.setCacheInvalidationListener(() => commandProvider.invalidateCache());
```

- [ ] **Step 6: Run desktop build to catch wiring errors**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds. If it fails, fix the typing/import errors (likely an import path for `CommandProvider` or a missing `commandProvider` argument).

- [ ] **Step 7: Commit**

```bash
cd youcoded
git add desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/main/skill-provider.ts desktop/src/main/main.ts
git commit -m "feat(commands): wire commands:list IPC handler and cache invalidation"
```

(Substitute the actual bootstrap filename from Step 2 if it's not `main.ts`.)

---

## Task 7: Expose `window.claude.commands.list()` in preload

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts`

- [ ] **Step 1: Add the `commands` namespace**

Find the `skills: { ... }` block in `preload.ts` (around line 321–350). After it, add:

```ts
commands: {
  list: (): Promise<any[]> => ipcRenderer.invoke(IPC.COMMANDS_LIST),
},
```

- [ ] **Step 2: Verify by rebuilding renderer type surface**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd youcoded
git add desktop/src/main/preload.ts
git commit -m "feat(commands): expose window.claude.commands.list() in preload"
```

---

## Task 8: Expose `commands.list()` in remote shim

**Files:**
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Add the `commands` namespace**

Find the `skills: { list: () => invoke('skills:list'), ... }` block in `remote-shim.ts`. After it, add:

```ts
commands: {
  list: () => invoke('commands:list'),
},
```

- [ ] **Step 2: Commit**

```bash
cd youcoded
git add desktop/src/renderer/remote-shim.ts
git commit -m "feat(commands): expose commands.list() over WebSocket shim"
```

---

## Task 9: Fetch `drawerCommands` in `skill-context`

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/skill-context.tsx`

- [ ] **Step 1: Extend the context interface**

Near line 32 where `drawerSkills: SkillEntry[]` is declared, add:

```ts
drawerCommands: CommandEntry[];
```

Add the import at the top: `import type { SkillEntry, CommandEntry } from '../../shared/types';` (merge with the existing import line).

- [ ] **Step 2: Add state and fetch**

In the provider body, after the existing skill-fetch `useEffect` (lines 51–87), add:

```ts
const [drawerCommands, setDrawerCommands] = useState<CommandEntry[]>([]);

useEffect(() => {
  let cancelled = false;
  const api = (window as any).claude?.commands;
  if (!api) return; // older shim without commands namespace
  api.list()
    .then((list: CommandEntry[]) => { if (!cancelled) setDrawerCommands(list ?? []); })
    .catch(() => { /* tolerate fetch failures — drawer falls back to skills only */ });
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 3: Include in the context value**

In the `value` memo (around line 146), add `drawerCommands` to both the returned object and the dependency array.

- [ ] **Step 4: Verify build**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/renderer/state/skill-context.tsx
git commit -m "feat(commands): expose drawerCommands from skill-context"
```

---

## Task 10: Render commands in `CommandDrawer` search mode

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/CommandDrawer.tsx`

- [ ] **Step 1: Update props and imports**

In `CommandDrawer.tsx`, update the `Props` interface:

```ts
import type { SkillEntry, CommandEntry } from '../../shared/types';

interface Props {
  open: boolean;
  searchMode: boolean;
  externalFilter?: string;
  onSelect: (skill: SkillEntry) => void;
  onSelectCommand: (entry: CommandEntry) => void;  // NEW
  onClose: () => void;
  onOpenManager: () => void;
  onOpenMarketplace: () => void;
  onOpenLibrary?: () => void;
}
```

Destructure the new prop in the component signature.

- [ ] **Step 2: Pull `drawerCommands` from context**

Update line 25:

```ts
const { drawerSkills, drawerCommands, favorites, setFavorite } = useSkills();
```

- [ ] **Step 3: Add command filter memo**

After the existing `searchFiltered` memo (line 62), add:

```ts
const commandSearchFiltered = useMemo(() => {
  if (!isSearching) return [];
  const q = effectiveQuery.toLowerCase();
  return drawerCommands
    .filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}, [drawerCommands, effectiveQuery, isSearching]);
```

- [ ] **Step 4: Add command card renderer**

Near `renderDrawerCard` (line 102), add:

```tsx
const renderCommandCard = (entry: CommandEntry) => {
  const clickable = entry.clickable;
  return (
    <button
      key={`cmd:${entry.name}`}
      type="button"
      onClick={clickable ? () => onSelectCommand(entry) : undefined}
      disabled={!clickable}
      title={!clickable ? entry.disabledReason : undefined}
      className={`rounded-lg p-3 text-left border border-edge-dim flex flex-col
        ${clickable
          ? 'bg-panel/80 hover:bg-inset hover:border-edge transition-colors cursor-pointer'
          : 'bg-panel/40 opacity-50 cursor-not-allowed'}`}
    >
      <span className="font-mono text-sm text-fg">{entry.name}</span>
      <span className="text-xs text-fg-muted mt-1 line-clamp-2">
        {entry.description || (clickable ? '' : entry.disabledReason)}
      </span>
    </button>
  );
};
```

- [ ] **Step 5: Render commands in the search-mode grid**

In the `isSearching` branch of the render (around line 199), change:

```tsx
<div className="px-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
  {searchFiltered.map((skill) => renderDrawerCard(skill))}
  <AddSkillsCard onClick={() => { onClose(); onOpenMarketplace(); }} />
</div>
```

To:

```tsx
<div className="px-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
  {searchFiltered.map((skill) => renderDrawerCard(skill))}
  {commandSearchFiltered.map((entry) => renderCommandCard(entry))}
  <AddSkillsCard onClick={() => { onClose(); onOpenMarketplace(); }} />
</div>
```

- [ ] **Step 6: Verify build**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds (TypeScript will complain that `onSelectCommand` is unpassed at App.tsx — fixed in Task 11).

- [ ] **Step 7: Commit**

```bash
cd youcoded
git add desktop/src/renderer/components/CommandDrawer.tsx
git commit -m "feat(drawer): render commands in search mode"
```

---

## Task 11: Wire `handleSelectCommand` in `App.tsx`

**Files:**
- Modify: `youcoded/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Add the handler**

Near `handleSelectSkill` (line 1317), add:

```ts
const handleSelectCommand = useCallback(
  (entry: CommandEntry) => {
    if (!entry.clickable) return; // defensive — disabled cards should never fire
    if (!sessionId) return;
    setDrawerOpen(false);
    setDrawerFilter(undefined);
    inputBarRef.current?.clear();

    const currentView = viewModes.get(sessionId) || 'chat';

    // YouCoded-handled commands route through the dispatcher (same path as
    // typed slash commands). Filesystem commands forward to PTY as
    // `/name\r` — treating them as skill-style commands that Claude Code
    // handles natively.
    if (entry.source === 'youcoded') {
      const result = dispatchSlashCommand({
        raw: entry.name,
        sessionId,
        view: currentView,
        files: [],
        dispatch: chatDispatchRef.current!,
        timeline: chatStateMapRef.current.get(sessionId)?.timeline ?? [],
        callbacks: {
          onResumeCommand: () => setResumeRequested(true),
          getUsageSnapshot,
          onOpenPreferences: () => setPreferencesOpen(true),
          onToast: (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); },
          getSessionState: (sid) => chatStateMapRef.current.get(sid),
          onOpenModelPicker: () => setModelPickerOpen(true),
        },
      });
      if (result.handled && result.alsoSendToPty) {
        window.claude.session.sendInput(sessionId, result.alsoSendToPty);
      } else if (!result.handled) {
        // Dispatcher didn't handle it (missing callback) — fall through to PTY.
        window.claude.session.sendInput(sessionId, `${entry.name}\r`);
      }
      return;
    }

    // Filesystem source: forward to PTY.
    window.claude.session.sendInput(sessionId, `${entry.name}\r`);
  },
  [sessionId, viewModes, getUsageSnapshot],
);
```

Add import at top if not already present:

```ts
import type { CommandEntry } from '../shared/types';
```

- [ ] **Step 2: Pass to `CommandDrawer`**

In the `<CommandDrawer ... />` mount (line 1766), add the `onSelectCommand` prop:

```tsx
<CommandDrawer
  open={drawerOpen}
  searchMode={drawerSearchMode}
  externalFilter={drawerFilter}
  onSelect={handleSelectSkill}
  onSelectCommand={handleSelectCommand}
  onClose={handleCloseDrawer}
  onOpenManager={() => openMarketplace('installed')}
  onOpenMarketplace={() => openMarketplace()}
  onOpenLibrary={() => setActiveView('library')}
/>
```

- [ ] **Step 3: Verify build**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke test (desktop)**

1. Run `cd youcoded-dev && bash scripts/run-dev.sh`
2. Open a chat session in the YouCoded Dev window.
3. Type `/` in the input — drawer opens.
4. Type `com` — expect `/compact` card (clickable) and `/context` card (disabled with tooltip).
5. Click `/compact` — expect the native compaction spinner to appear in chat.
6. Click `/context` — expect nothing happens; hovering shows the "Please run /context in Terminal View." tooltip.
7. Close the drawer, reopen it without `/` (via the compass icon) — expect NO command cards (browse mode).

Take notes of any UI bugs; fix before committing.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/renderer/App.tsx
git commit -m "feat(drawer): wire handleSelectCommand from App"
```

---

## Task 12: Add Android Kotlin `CommandProvider`

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/CommandProvider.kt`

- [ ] **Step 1: Create the Kotlin provider**

Create `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/CommandProvider.kt`:

```kotlin
package com.youcoded.app.runtime

import com.youcoded.app.skills.LocalSkillProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Mirrors desktop/src/main/command-provider.ts. Kept in sync manually —
// see docs/cc-dependencies.md entry "CC built-in command list" and
// docs/superpowers/specs/2026-04-21-command-drawer-search-commands-design.md.
class CommandProvider(
  private val homeDir: File,
  private val skillProvider: LocalSkillProvider,
  private val getProjectCwd: () -> String?,
) {
  private var cache: JSONArray? = null

  fun invalidateCache() {
    cache = null
  }

  fun getCommands(): JSONArray {
    cache?.let { return it }

    val claudeDir = File(homeDir, ".claude")
    val entries = mutableListOf<JSONObject>()

    // Source 1: YouCoded-handled (hardcoded)
    entries.addAll(YOUCODED_COMMANDS)

    // Source 2: filesystem — user + project + plugin
    entries.addAll(scanCommandsFromDir(File(claudeDir, "commands"), null))
    getProjectCwd()?.let { cwd ->
      entries.addAll(scanCommandsFromDir(File(File(cwd), ".claude/commands"), null))
    }
    entries.addAll(scanPluginCommands(claudeDir))

    // Source 3: CC built-ins (hardcoded)
    entries.addAll(CC_BUILTIN_COMMANDS)

    // Dedup by name with precedence youcoded > filesystem > cc-builtin.
    // A command whose name matches an existing skill is dropped.
    val sourcePriority = mapOf("youcoded" to 0, "filesystem" to 1, "cc-builtin" to 2)
    val byName = linkedMapOf<String, JSONObject>()
    for (entry in entries) {
      val name = entry.getString("name")
      val existing = byName[name]
      if (existing == null ||
          sourcePriority[entry.getString("source")]!! < sourcePriority[existing.getString("source")]!!) {
        byName[name] = entry
      }
    }

    // Drop commands that collide with skills by name.
    val skillNames = mutableSetOf<String>()
    val skillList = skillProvider.getInstalled()
    for (i in 0 until skillList.length()) {
      val s = skillList.getJSONObject(i)
      skillNames.add("/" + s.getString("displayName"))
    }
    for (name in skillNames) byName.remove(name)

    val result = JSONArray()
    for (entry in byName.values) result.put(entry)
    cache = result
    return result
  }

  private fun scanCommandsFromDir(dir: File, pluginSlug: String?): List<JSONObject> {
    if (!dir.isDirectory) return emptyList()
    val out = mutableListOf<JSONObject>()
    for (file in dir.listFiles { f -> f.isFile && f.name.endsWith(".md") } ?: return emptyList()) {
      val stem = file.nameWithoutExtension
      val description = extractFrontmatterDescription(file.readText())
      val name = if (pluginSlug != null) "/$pluginSlug:$stem" else "/$stem"
      out.add(JSONObject().apply {
        put("name", name)
        put("description", description)
        put("source", "filesystem")
        put("clickable", true)
      })
    }
    return out
  }

  private fun scanPluginCommands(claudeDir: File): List<JSONObject> {
    val marketplaces = File(claudeDir, "plugins/marketplaces")
    if (!marketplaces.isDirectory) return emptyList()
    val out = mutableListOf<JSONObject>()
    for (mp in marketplaces.listFiles { f -> f.isDirectory } ?: return emptyList()) {
      val plugins = File(mp, "plugins")
      if (!plugins.isDirectory) continue
      for (plugin in plugins.listFiles { f -> f.isDirectory } ?: continue) {
        out.addAll(scanCommandsFromDir(File(plugin, "commands"), plugin.name))
      }
    }
    return out
  }

  private fun extractFrontmatterDescription(content: String): String {
    if (!content.startsWith("---")) return ""
    val end = content.indexOf("\n---", 3)
    if (end == -1) return ""
    val block = content.substring(3, end)
    val match = Regex("(?m)^\\s*description\\s*:\\s*(.+?)\\s*$").find(block) ?: return ""
    var value = match.groupValues[1].trim()
    if ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1)
    }
    return value
  }

  companion object {
    private val YOUCODED_COMMANDS: List<JSONObject> = listOf(
      youcoded("/compact",  "Compact conversation with native spinner card"),
      youcoded("/clear",    "Clear conversation timeline with native marker"),
      youcoded("/reset",    "Clear conversation timeline with native marker"),
      youcoded("/new",      "Clear conversation timeline with native marker"),
      youcoded("/model",    "Open native model picker"),
      youcoded("/fast",     "Toggle fast mode"),
      youcoded("/effort",   "Open effort-level picker"),
      youcoded("/copy",     "Copy assistant response to clipboard"),
      youcoded("/resume",   "Open native Resume Browser"),
      youcoded("/config",   "Open Preferences popup"),
      youcoded("/settings", "Open Preferences popup"),
      youcoded("/cost",     "Show native Usage card"),
      youcoded("/usage",    "Show native Usage card"),
    )

    private val CC_BUILTIN_COMMANDS: List<JSONObject> = listOf(
      ccBuiltin("/help",            "Show Claude Code help"),
      ccBuiltin("/status",          "Show session, config, and auth status"),
      ccBuiltin("/permissions",     "Manage tool permissions"),
      ccBuiltin("/memory",          "Edit CLAUDE.md memory files"),
      ccBuiltin("/agents",          "Manage subagents"),
      ccBuiltin("/mcp",             "Manage MCP servers"),
      ccBuiltin("/plugin",          "Manage plugins"),
      ccBuiltin("/hooks",           "Manage hooks"),
      ccBuiltin("/doctor",          "Diagnose the installation"),
      ccBuiltin("/logout",          "Sign out of your Anthropic account"),
      ccBuiltin("/context",         "Show current context-window usage"),
      ccBuiltin("/review",          "Review a pull request"),
      ccBuiltin("/security-review", "Review pending changes for security issues"),
      ccBuiltin("/init",            "Initialize a CLAUDE.md file"),
      ccBuiltin("/extra-usage",     "Show detailed usage data"),
      ccBuiltin("/heapdump",        "Dump a heap snapshot"),
      ccBuiltin("/insights",        "Show session insights"),
      ccBuiltin("/team-onboarding", "Team setup flow"),
    )

    private fun youcoded(name: String, description: String) = JSONObject().apply {
      put("name", name); put("description", description)
      put("source", "youcoded"); put("clickable", true)
    }

    private fun ccBuiltin(name: String, description: String) = JSONObject().apply {
      put("name", name); put("description", description)
      put("source", "cc-builtin"); put("clickable", false)
      put("disabledReason", "Please run $name in Terminal View.")
    }
  }
}
```

- [ ] **Step 2: Verify Kotlin compiles**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin`
Expected: success (or green compile on Android tooling; if gradlew isn't available locally, the Android CI will catch it — flag and move on).

- [ ] **Step 3: Commit**

```bash
cd youcoded
git add app/src/main/kotlin/com/youcoded/app/runtime/CommandProvider.kt
git commit -m "feat(android): add CommandProvider for commands:list IPC"
```

---

## Task 13: Wire `commands:list` case in `SessionService.kt`

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Instantiate `CommandProvider` on service init**

In `SessionService.kt`, find the line `skillProvider = LocalSkillProvider(bs.homeDir, applicationContext)` (around line 188). Immediately after it, add:

```kotlin
commandProvider = CommandProvider(
  homeDir = bs.homeDir,
  skillProvider = skillProvider!!,
  getProjectCwd = {
    // Use the most recently registered session's cwd; null if no sessions.
    registry.allSessions().firstOrNull()?.cwd?.absolutePath
  },
)
```

Add a field declaration near the top of the class (alongside `skillProvider`):

```kotlin
private var commandProvider: CommandProvider? = null
```

(Exact insertion point: the same declaration pattern as `skillProvider`.)

- [ ] **Step 2: Add the `commands:list` case in `handleBridgeMessage()`**

Find the `"skills:list"` case (around line 711). After it, add:

```kotlin
"commands:list" -> {
  val result = commandProvider?.getCommands() ?: org.json.JSONArray()
  msg.id?.let { bridgeServer.respond(ws, msg.type, it, result) }
}
```

- [ ] **Step 3: Invalidate command cache on plugin install/uninstall**

Find the spots in `SessionService.kt` where `skillProvider.invalidateInstalledCache()` (or equivalent) is called after a plugin install/uninstall. After each, add:

```kotlin
commandProvider?.invalidateCache()
```

- [ ] **Step 4: Verify Kotlin compiles**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin`
Expected: success.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(android): wire commands:list IPC handler in SessionService"
```

---

## Task 14: Add entry to `cc-dependencies.md`

**Files:**
- Modify: `youcoded/docs/cc-dependencies.md`

- [ ] **Step 1: Add the coupling entry**

Open `youcoded/docs/cc-dependencies.md`. Under the `## Touchpoints` section, in alphabetical or logical order, add:

```markdown
### CC built-in command list

- **Files:** `desktop/src/main/cc-builtin-commands.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/CommandProvider.kt` (the `CC_BUILTIN_COMMANDS` companion block)
- **Depends on:** Claude Code's set of built-in slash commands — names and behaviors baked into the compiled `claude` binary. These lists are hand-maintained; the SDK init message's `slash_commands` array omits core meta commands so automated discovery is not viable.
- **Break symptom:** New CC built-ins don't appear in the YouCoded CommandDrawer search; removed CC built-ins still appear (but remain unclickable with a "Run in Terminal View" note, so user impact is minor — they just don't work when clicked from Terminal View). Renamed built-ins show with their old name.
```

- [ ] **Step 2: Commit**

```bash
cd youcoded
git add docs/cc-dependencies.md
git commit -m "docs(cc-dependencies): add CC built-in command list coupling"
```

---

## Task 15: End-to-end verification

**Files:** (verification only, no changes)

- [ ] **Step 1: Desktop verification**

1. `cd youcoded-dev && bash scripts/run-dev.sh`
2. Open a chat session. Type `/` in the input.
3. **Browse mode check:** without typing anything else, expect the drawer to show ONLY skills + category chips + favorites. No command cards.
4. **Search mode checks** — type each and observe:
   - `/comp` → `/compact` card (clickable, YouCoded-handled, bg-panel), `/context` card (disabled, muted, tooltip "Please run /context in Terminal View.")
   - `/hel` → `/help` card (disabled, tooltip)
   - `/rel` → project commands (e.g. `/release` if your project has one) + any skills containing "rel"
   - `/nonexistent` → empty grid with only the "Add Skills +" tile
5. **Click checks:**
   - Click `/compact` → native compaction card appears in chat.
   - Click `/resume` → Resume Browser modal opens.
   - Click `/help` → nothing happens (disabled). Hovering shows tooltip.

- [ ] **Step 2: Android verification**

1. Build the Android APK with the React bundle: `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug`.
2. Install the APK on a device.
3. Repeat the browse-mode and search-mode checks from Step 1. Expect identical behavior.
4. Verify the "Add Skills +" tile still appears as the trailing grid item.

- [ ] **Step 3: Run the full test suite**

Run: `cd youcoded/desktop && npm test`
Expected: all tests pass (including the four new test files from Tasks 2, 3, 4, 5).

- [ ] **Step 4: Run the audit for documentation drift**

Run: `/audit` (from the workspace root via Claude Code).
Expected: no drift reports related to this feature; the PITFALLS.md and cc-dependencies.md entries are in sync with the code.

- [ ] **Step 5: Commit verification notes if any changes surfaced**

If verification caught bugs that required small fixes, commit them each as separate commits referencing the task they clean up. Do not pile fixes into one amorphous "polish" commit.

---

## Self-review complete

- **Spec coverage:** every section of the spec maps to a task. CommandEntry (T1), three sources (T2/T3/T4), merge with dedup (T5), IPC + cache invalidation (T6), preload (T7), remote shim (T8), skill-context (T9), CommandDrawer (T10), App.tsx wiring (T11), Android parity (T12/T13), cc-dependencies (T14), verification (T15).
- **Placeholder scan:** no TBDs, no "fill in details," every code block is complete.
- **Type consistency:** `CommandEntry` fields (`name`, `description`, `source`, `clickable`, `disabledReason`, `aliases`) are used identically across all modules. IPC channel name `commands:list` is used identically in preload, handler, remote-shim, and SessionService.kt.
