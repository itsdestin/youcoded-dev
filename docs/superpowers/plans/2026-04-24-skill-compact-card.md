# Skill Compact Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `Skill` tool cards with a simplified header-only visual, outside any tool group, at the end of their assistant message bubble. Iterate the visual in the dev sandbox first.

**Architecture:** View-layer only (reducer untouched). `ToolCard` gains a `toolName === 'Skill'` branch that skips the body and uses thinner styling. `ToolGroupInline` filters Skill toolIds out of its render. `AssistantTurnBubble` extracts Skill toolIds across all groups in the turn and renders a trailing row of standalone cards on the turn's last bubble.

**Tech Stack:** React, TypeScript, Vite (HMR), Vitest + @testing-library/react.

**Repo:** `youcoded/` (branch `skill-compact-card`, worktree already created at `C:/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card/`).

---

## Task 1: Sandbox reorder + new fixture

**Files:**
- Modify: `desktop/src/renderer/dev/ToolSandbox.tsx`
- Create: `desktop/src/renderer/dev/fixtures/group-bash-read-skill.jsonl`

This is visible-feedback work. After this task, the sandbox will reorder Skill blocks to the end within any multi-block fixture so we can iterate on the simplified visual (Task 2) against a realistic turn layout.

- [ ] **Step 1.1: Add the fixture**

Create `desktop/src/renderer/dev/fixtures/group-bash-read-skill.jsonl`:

```
{"type":"text","text":"Let me invoke the brainstorming skill, but first pull a bit of context."}
{"type":"tool_use","id":"toolu_01SKL1","name":"Skill","input":{"skill":"superpowers:brainstorming"}}
{"tool_use_id":"toolu_01SKL1","type":"tool_result","content":"Launching skill: superpowers:brainstorming","is_error":false}
{"type":"tool_use","id":"toolu_01B","name":"Bash","input":{"command":"git status","description":"Repo status"}}
{"tool_use_id":"toolu_01B","type":"tool_result","content":"On branch skill-compact-card\nnothing to commit, working tree clean","is_error":false}
{"type":"tool_use","id":"toolu_01R","name":"Read","input":{"file_path":"/workspace/README.md","limit":5}}
{"tool_use_id":"toolu_01R","type":"tool_result","content":"     1→# YouCoded\n     2→\n     3→Hyper-personalized AI assistant.\n","is_error":false}
```

**Note the source order** — Skill first, then Bash, then Read. After the sandbox reorder in Step 1.2, the rendered output should show Bash → Read → Skill (Skill pushed to end).

- [ ] **Step 1.2: Reorder Skill blocks in the sandbox renderer**

Edit `desktop/src/renderer/dev/ToolSandbox.tsx`. Current `result.blocks.map(renderBlock)` renders in source order. Add a reorder step before rendering (ONLY when there are multiple blocks — single-tool fixtures unchanged).

Find the section body render (around lines 85–95 in the current file):

```tsx
) : wrap ? (
  <div style={{ ... }}>
    {result.blocks.map(renderBlock)}
  </div>
) : (
  result.blocks.map(renderBlock)
)}
```

Replace the inner `result.blocks.map(renderBlock)` call with a helper that reorders:

```tsx
// Skills float to the end of the turn in real chat (see
// AssistantTurnBubble extraction); mirror that here so the sandbox
// shows the real layout outcome.
function orderedBlocks(blocks: FixtureBlock[]): FixtureBlock[] {
  const skillBlocks: FixtureBlock[] = [];
  const otherBlocks: FixtureBlock[] = [];
  for (const b of blocks) {
    if (b.kind === 'tool' && b.tool.toolName === 'Skill') {
      skillBlocks.push(b);
    } else {
      otherBlocks.push(b);
    }
  }
  return [...otherBlocks, ...skillBlocks];
}
```

Define `orderedBlocks` at module scope above `ToolSandbox`. Then replace both `result.blocks.map(renderBlock)` sites with `orderedBlocks(result.blocks).map(renderBlock)`.

- [ ] **Step 1.3: Typecheck + visual verify manually**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card/desktop && npx tsc --noEmit
```

Expected: clean exit. No visual verification needed at this step — Task 2 builds the simplified visual that makes the reordering visible. (Today the Skill card still looks like every other card; after reorder, nothing obviously changes until Task 2 lands.)

- [ ] **Step 1.4: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card
git add desktop/src/renderer/dev/ToolSandbox.tsx desktop/src/renderer/dev/fixtures/group-bash-read-skill.jsonl
git commit -m "feat(dev): sandbox reorders Skill blocks to end of turn

Mirrors the planned AssistantTurnBubble extraction (trailing Skill
cards). Adds group-bash-read-skill.jsonl where Skill appears first in
source order and renders last after reorder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Simplified Skill variant in ToolCard (TDD)

**Files:**
- Modify: `desktop/src/renderer/components/ToolCard.tsx`
- Create: `desktop/src/renderer/components/ToolCard.test.tsx`

When `tool.toolName === 'Skill'`, render a header-only card: no body dispatcher call, no expand chevron, no click-to-expand. Thinner dashed border in `var(--edge-dim)`. Non-interactive.

- [ ] **Step 2.1: Write the failing test**

Create `desktop/src/renderer/components/ToolCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChatProvider } from '../state/chat-context';
import ToolCard from './ToolCard';
import type { ToolCallState } from '../../shared/types';

function makeTool(overrides: Partial<ToolCallState>): ToolCallState {
  return {
    toolUseId: 'toolu_test',
    toolName: 'Bash',
    input: {},
    status: 'complete',
    ...overrides,
  };
}

describe('ToolCard — Skill compact variant', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders Skill without an expand chevron', () => {
    const tool = makeTool({
      toolName: 'Skill',
      input: { skill: 'superpowers:brainstorming' },
      response: 'Launching skill: superpowers:brainstorming',
    });
    render(
      <ChatProvider>
        <ToolCard tool={tool} />
      </ChatProvider>
    );
    // Chevron has a data-testid="tool-card-chevron" per the main card; Skill variant does not render it.
    expect(screen.queryByTestId('tool-card-chevron')).toBeNull();
  });

  it('renders Skill without a tool body even when expanded state would normally apply', () => {
    const tool = makeTool({
      toolName: 'Skill',
      input: { skill: 'superpowers:brainstorming' },
      response: 'Launching skill: superpowers:brainstorming',
    });
    render(
      <ChatProvider>
        <ToolCard tool={tool} />
      </ChatProvider>
    );
    // Body has a data-testid="tool-card-body" in the compact variant should never render one.
    expect(screen.queryByTestId('tool-card-body')).toBeNull();
    // But the header label IS visible:
    expect(screen.getByText(/Running \/superpowers:brainstorming/)).toBeInTheDocument();
  });

  it('renders non-Skill tool normally (chevron present)', () => {
    const tool = makeTool({ toolName: 'Bash', input: { command: 'ls' } });
    render(
      <ChatProvider>
        <ToolCard tool={tool} />
      </ChatProvider>
    );
    // Non-Skill tools still have the chevron.
    expect(screen.queryByTestId('tool-card-chevron')).not.toBeNull();
  });
});
```

**Note on testids:** the plan assumes `tool-card-chevron` and `tool-card-body` testids exist. If they don't already, the implementer adds them in Step 2.2 as part of the render change — they serve both test hooks AND don't affect production behavior.

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
cd desktop && npx vitest run src/renderer/components/ToolCard.test.tsx
```

Expected: the two Skill-specific tests FAIL (chevron/body still render), the non-Skill test may PASS or FAIL depending on whether testids exist today.

- [ ] **Step 2.3: Implement the Skill branch in ToolCard**

Open `desktop/src/renderer/components/ToolCard.tsx`. Two changes:

**(a)** In the header render (around line 590–615), add a `data-testid="tool-card-chevron"` to the chevron element. If the chevron is currently an `<svg>` or similar, the testid goes on the outermost element of the chevron.

**(b)** In the body render (around line 618–665), wrap the `<ToolBody />` in a Skill guard. Before rendering `<ToolBody>`, check `tool.toolName === 'Skill'` — if true, render nothing for the body AND skip the expand chevron in the header.

Suggested shape (adapt to real file layout):

```tsx
const isCompactSkill = tool.toolName === 'Skill';

// ...header render:
{!isCompactSkill && (
  <svg
    data-testid="tool-card-chevron"
    className={`... ${expanded ? 'rotate-180' : ''}`}
    // ...
  />
)}

// ...also in the header: suppress the click-to-expand behavior when isCompactSkill.
// If the whole header is wrapped in <button onClick={toggleExpanded}>, either:
//   - Render as <div> (non-interactive) when isCompactSkill, OR
//   - Keep the button but remove onClick when isCompactSkill.
// Prefer rendering as <div> so focus ring and hover affordance also disappear.

// ...body render:
{!isCompactSkill && expanded && (
  <div data-testid="tool-card-body">
    <ToolBody tool={tool} sessionId={sessionId} />
  </div>
)}
```

**Border styling:** the outer card `<div>` that wraps header+body already has a border class. Add a `toolName === 'Skill'` variant that uses a thinner dashed border. Suggested:

```tsx
const cardClassName = isCompactSkill
  ? 'rounded-md border border-dashed border-edge-dim/60 bg-panel/30'
  : 'rounded-md border border-edge bg-panel'; // existing baseline — read the actual current class first
```

**IMPORTANT:** Read the real classes used today before writing the replacement. The sketch above uses plausible token names; match the actual file. The Skill variant should read LIGHTER than the default, that's the only requirement.

- [ ] **Step 2.4: Run tests — verify pass**

```bash
cd desktop && npx vitest run src/renderer/components/ToolCard.test.tsx
```

Expected: 3/3 passing.

- [ ] **Step 2.5: Typecheck + full test suite**

```bash
cd desktop && npx tsc --noEmit
cd desktop && npx vitest run --reporter=dot
```

Expected: `tsc` clean, full suite passes (no regressions from the testid additions or the Skill branch).

- [ ] **Step 2.6: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card
git add desktop/src/renderer/components/ToolCard.tsx desktop/src/renderer/components/ToolCard.test.tsx
git commit -m "feat(chat): Skill tool cards render header-only with lighter border

Skill invocations always return 'Launching skill: X' with success; the
expanded body is pure ceremony. Compact variant renders header only,
no expand chevron, non-interactive, dashed border in edge-dim — reads
as an annotation rather than an expandable tool card.

Adds data-testid hooks on chevron and body for unit coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Production reorder — extract Skills in AssistantTurnBubble

**Files:**
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.tsx`
- Create: `desktop/src/renderer/components/AssistantTurnBubble.test.tsx`

Extract Skill toolIds from every tool group in a turn; render them as a trailing row of `<ToolCard inGroup={false} />` at the end of the turn's last bubble. `ToolGroupInline` filters Skills out so they don't render twice.

- [ ] **Step 3.1: Filter Skills out of ToolGroupInline**

Open `desktop/src/renderer/components/AssistantTurnBubble.tsx`. Find `ToolGroupInline` around line 287–320. Extend the tool-resolution `.filter()` to skip Skills:

```tsx
const tools = group.toolIds
  .map((id) => toolCalls.get(id))
  // Skip undefined AND skip Skill tools — Skills are rendered as a trailing
  // standalone row outside any group by AssistantTurnBubble (see Task 3.2).
  .filter((t): t is ToolCallState => t !== undefined && t.toolName !== 'Skill');

if (tools.length === 0) return null;
```

Note: the `if (tools.length === 0) return null;` guard is important — if a group contained ONLY Skill calls, filtering them all out leaves the group empty and we should render nothing for it. Add that guard if not present.

- [ ] **Step 3.2: Add trailing-Skills render**

In `AssistantTurnBubble` (not `ToolGroupInline`), compute the Skill tools for the turn and render them as a trailing row on the last bubble.

Find the bubble map (around line 188–230). The trailing-skills row renders **only on the last bubble**. Pseudocode:

```tsx
function collectTurnSkills(turn: AssistantTurn, toolGroups: Map<string, ToolGroupState>, toolCalls: Map<string, ToolCallState>): ToolCallState[] {
  const skills: ToolCallState[] = [];
  for (const seg of turn.segments) {
    if (seg.type !== 'tool-group') continue;
    const group = toolGroups.get(seg.groupId);
    if (!group) continue;
    for (const id of group.toolIds) {
      const t = toolCalls.get(id);
      if (t && t.toolName === 'Skill') skills.push(t);
    }
  }
  return skills; // in invocation order across the whole turn
}
```

Define `collectTurnSkills` at module scope above the component. Call it once per render:

```tsx
const turnSkills = React.useMemo(
  () => collectTurnSkills(turn, toolGroups, toolCalls),
  [turn, toolGroups, toolCalls]
);
```

Render the trailing row inside the LAST bubble's render path, after the group-map closes:

```tsx
{isLastBubble && turnSkills.length > 0 && (
  <div className="mt-1 space-y-0.5">
    {turnSkills.map((skill) => (
      <ToolCard key={skill.toolUseId} tool={skill} sessionId={sessionId} inGroup={false} />
    ))}
  </div>
)}
```

The `isLastBubble` flag is the existing boolean at line 188 (`const isLastBubble = index === bubbles.length - 1`). Confirm exact variable name in the file.

**Edge case:** a turn with only Skill tools and no text/plan might not produce any bubble in `splitIntoBubbles` (walk the function to confirm). If so, add a branch: when `turn.segments` is only tool-groups AND `collectTurnSkills(turn)` is non-empty AND `splitIntoBubbles(turn)` returns no bubbles, synthesize a single bubble just for the trailing Skills.

- [ ] **Step 3.3: Write the tests**

Create `desktop/src/renderer/components/AssistantTurnBubble.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, within, cleanup } from '@testing-library/react';
import { ChatProvider } from '../state/chat-context';
import AssistantTurnBubble from './AssistantTurnBubble';
import type { AssistantTurn, ToolGroupState, ToolCallState } from '../../shared/types';

function skillTool(id: string, skill: string): ToolCallState {
  return {
    toolUseId: id,
    toolName: 'Skill',
    input: { skill },
    status: 'complete',
    response: `Launching skill: ${skill}`,
  };
}

function bashTool(id: string, command: string): ToolCallState {
  return { toolUseId: id, toolName: 'Bash', input: { command }, status: 'complete' };
}

describe('AssistantTurnBubble — Skill extraction', () => {
  beforeEach(() => cleanup());

  it('renders Skill cards after non-Skill tool groups within the turn', () => {
    const turn: AssistantTurn = {
      id: 'turn-1',
      segments: [
        { type: 'text', content: 'Setting up', messageId: 'm1' },
        { type: 'tool-group', groupId: 'g1' },
      ],
      // ... other turn fields as required by AssistantTurn type
    } as AssistantTurn;
    const toolGroups = new Map<string, ToolGroupState>([
      ['g1', { id: 'g1', toolIds: ['s1', 'b1'] }], // Skill listed first to prove reorder
    ]);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
      ['b1', bashTool('b1', 'git status')],
    ]);

    const { container } = render(
      <ChatProvider>
        <AssistantTurnBubble
          turn={turn}
          toolGroups={toolGroups}
          toolCalls={toolCalls}
          sessionId="test"
          // other required props — read the component's prop shape
        />
      </ChatProvider>
    );

    // Grab all cards and assert ordering: Bash before Skill.
    const toolElements = within(container).getAllByTestId(/tool-card-/);
    // Implementation detail: may need to adjust testid matcher to what the real card exposes.
    // Alternative — match by tool name text:
    const html = container.innerHTML;
    const bashIdx = html.indexOf('git status');
    const skillIdx = html.indexOf('superpowers:brainstorming');
    expect(bashIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeGreaterThan(bashIdx);
  });

  it('renders only Skill trailing row when turn has no non-Skill tools', () => {
    const turn: AssistantTurn = {
      id: 'turn-2',
      segments: [{ type: 'tool-group', groupId: 'g1' }],
    } as AssistantTurn;
    const toolGroups = new Map<string, ToolGroupState>([
      ['g1', { id: 'g1', toolIds: ['s1'] }],
    ]);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
    ]);

    const { container } = render(
      <ChatProvider>
        <AssistantTurnBubble
          turn={turn}
          toolGroups={toolGroups}
          toolCalls={toolCalls}
          sessionId="test"
        />
      </ChatProvider>
    );
    expect(container.innerHTML).toContain('superpowers:brainstorming');
  });

  it('stacks multiple Skills in invocation order at the end', () => {
    const turn: AssistantTurn = {
      id: 'turn-3',
      segments: [{ type: 'tool-group', groupId: 'g1' }],
    } as AssistantTurn;
    const toolGroups = new Map<string, ToolGroupState>([
      ['g1', { id: 'g1', toolIds: ['s1', 'b1', 's2'] }],
    ]);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'one')],
      ['b1', bashTool('b1', 'ls')],
      ['s2', skillTool('s2', 'two')],
    ]);

    const { container } = render(
      <ChatProvider>
        <AssistantTurnBubble
          turn={turn}
          toolGroups={toolGroups}
          toolCalls={toolCalls}
          sessionId="test"
        />
      </ChatProvider>
    );
    const html = container.innerHTML;
    const oneIdx = html.indexOf('superpowers:one');
    const twoIdx = html.indexOf('superpowers:two');
    const lsIdx = html.indexOf("'ls'");
    expect(lsIdx).toBeLessThan(oneIdx);
    expect(oneIdx).toBeLessThan(twoIdx);
  });
});
```

**Before submitting:** verify the `AssistantTurn` type shape from `chat-types.ts` and supply all required fields. If the component reads data from a context provider that the tests don't seed, mock or extend the ChatProvider as needed. Real prop requirements may necessitate adjusting the test setup — that's fine, don't skip the tests.

- [ ] **Step 3.4: Run tests — verify pass**

```bash
cd desktop && npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx
```

Expected: 3/3 passing.

- [ ] **Step 3.5: Run the full test suite**

```bash
cd desktop && npx vitest run --reporter=dot
cd desktop && npx tsc --noEmit
```

Expected: no regressions (the overall pass count should go up by 6 from Task 2 + Task 3 new tests; no failures).

- [ ] **Step 3.6: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card
git add desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "feat(chat): Skill tool cards render outside groups at turn end

AssistantTurnBubble extracts Skill toolIds across the turn and renders
them as a trailing row of inGroup=false cards on the last bubble.
ToolGroupInline filters Skills out so they don't render twice. Reducer
state is untouched — this is a pure view-layer reorder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Manual sandbox verification

**Files:** n/a (runtime check)

- [ ] **Step 4.1: Stop any running dev server**

```bash
netstat -ano | grep ':5223' | grep LISTENING | awk '{print $NF}' | while read pid; do powershell -Command "Stop-Process -Id $pid -Force" 2>/dev/null; done
```

- [ ] **Step 4.2: Launch the sandbox from the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card/desktop && YOUCODED_PORT_OFFSET=50 YOUCODED_PROFILE=dev YOUCODED_DEV_URL='http://localhost:5223/?mode=tool-sandbox' npm run dev
```

Wait for "YouCoded Dev" window to open at the sandbox route.

- [ ] **Step 4.3: Verify visual outcomes**

In the sandbox:
1. **Skill group** — both `skill` and `skill-failed` fixtures render with the thin dashed border, no chevron, no body.
2. **Grouped turns group** — the new `group-bash-read-skill` fixture shows Bash → Read → Skill order (Skill moved to end despite appearing first in source).
3. **HMR cycle** — edit the Skill border style in `ToolCard.tsx`, save, confirm update within ~1s.

- [ ] **Step 4.4: Push the branch for review**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/skill-compact-card && git push -u origin skill-compact-card
```

Leave the branch open; decision about merge-vs-hold comes after user review.

---

## Self-review notes

- **Spec coverage:** Every section of the spec maps to a task. Visual design (Task 2), ordering rule (Task 3), sandbox enabling work (Task 1), verification (Task 4).
- **No placeholders:** All tests contain real assertions. All code sketches label their adapt-to-real-file spots explicitly.
- **Type consistency:** `ToolCallState`, `ToolGroupState`, `AssistantTurn` used consistently. `inGroup` is the existing prop at `ToolCard.tsx:577`.
- **Known hedges:**
  - Exact border classes in ToolCard — implementer reads the current file before writing the new variant.
  - Exact `isLastBubble` variable name in AssistantTurnBubble — implementer confirms before referencing.
  - `AssistantTurn` type fields beyond `segments` — implementer reads `chat-types.ts` to supply required fields in tests.
