---
status: draft
date: 2026-08-17
tags: [renderer, chat, ui, reliability]
plan-of: docs/active/specs/2026-08-17-timestamp-only-assistant-bubble-design.md
---

# Never render a bare assistant bubble — implementation plan

> ## Status 2026-08-26 — NOT BUILT; the two 2026-08-21 empty-bubble commits did NOT solve this
>
> Verified against `youcoded` `origin/master` (`dbbb9139`) on 2026-08-26:
>
> - `git grep -n 'bubbleHasVisibleContent' origin/master` → **no output**. The plan's
>   central deliverable does not exist.
> - The defective gate this doc names is still verbatim on master, only moved down the
>   file: `AssistantTurnBubble.tsx:413` is `const hasTools = bubble.toolGroupIds.length > 0;`
>   (this doc cites it at :375), and the timestamp/metadata/stop-reason chrome still keys off
>   `isLastBubble` (:466–:470) with no rendered-content check. `restTools` at :558 still
>   filters `awaiting-approval` tools out of the group — step 3 of the confirmed chain.
> - No reducer whitespace guard: `chat-reducer.ts:982` (`TRANSCRIPT_ASSISTANT_TEXT`) goes
>   straight from the `seenUuids` dedup to `getOrCreateTurn` with no `trim()` check.
> - **Commits `a04a30f2` and `e3c64532` (2026-08-21) are a different bug and push the other
>   way.** They make *segment-less* turns RENDER an `empty_response` / stop-reason footer that
>   was previously dropped by the ChatView/BubbleFeed gates, and make the segment-less mint
>   uuid-idempotent. Neither touches `splitIntoBubbles`, the `hasTools` gate, or the
>   awaiting-approval pop-out path. This bug — a bubble that HAS a tool-group segment whose
>   only tool has popped out to a permission card — is untouched by both.
> - No branch or worktree was ever started: `git worktree list` and `git branch -a` show no
>   `bare-bubble-fix` (the path the 2026-08-18 planning session assumed).
>
> Last activity: 2026-08-18 (plan review round, conversation `27c3` — corrections applied,
> plan left implementation-ready). **Next step: build work only — no open questions.** The
> three user checkpoints were resolved by Destin 2026-08-17.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the occasional bare assistant bubble containing only a timestamp (seen above permission cards) by (1) gating each bubble's render on a single source-of-truth predicate over its actual visible content, (2) relocating per-turn chrome (timestamp / stop-reason footer / metadata / trailing-Skills row) to the last *rendered* bubble, and (3) adding a reducer guard that rejects whitespace-only text/reasoning deltas — all pinned by tests.

**Architecture:** The view-layer gate has two levels. `bubbleHasVisibleContent` encodes exactly the INLINE render rules the bubble already applies — placeholders are not content: awaiting-approval tools pop out, `undefined` tools render nothing, and text/plan/reasoning (plus a running tool's spinner, C3) are intrinsic. The render loop additionally counts the trailing-Skills row as content on the last rendered bubble (C4) — a Skill-only bubble draws its cards there, so it is not empty. "Does this bubble draw?" is thus answered by the same rules that draw it — a skipped bubble is invisible to the user AND to the timestamp/stop-reason logic (C2). A reducer guard drops whitespace-only `TRANSCRIPT_ASSISTANT_TEXT`/`TRANSCRIPT_ASSISTANT_REASONING` deltas above `getOrCreateTurn`, closing the empty-content emitter class as defense-in-depth.

**Tech Stack:** TypeScript; React; Vitest + Testing Library (jsdom); `@testing-library/jest-dom`; existing `ChatProvider` test harness.

## Global Constraints

- **Repo/location:** all changes in the `youcoded/` sub-repo `desktop/` tree; commit to a **git worktree** of `youcoded` (never the main checkout), branched from a synced `master`. Never link `node_modules` — copy with `cp -al` if needed. See caveats: `docs/PITFALLS.md` → Cross-repo invariants.
- **This change is desktop-renderer-only.** No `app/**` (Android Kotlin), no `src/main/**` host changes, no `wecoded-*` sub-repos. The Android WebView runs the SAME React bundle, so `desktop/src/renderer/` changes automatically cover it — do NOT touch `app/`.
- **Five confirmed product decisions (Destin, 2026-08-17 — RECORDED, not optional). C1–C3 are the three green-lit in the spec; C4–C5 are the two review findings folded in for correctness — documented here so nobody treats them as silent implementation choices:**
  - **C1 — permission card unchanged** (it already shows tool name + command/question; no code).
  - **C2 — timestamp / stop-reason footer / metadata strip relocate to the last RENDERED bubble** (skipped bubbles are invisible to that logic).
  - **C3 — a running tool's spinner is visible content** (a tools-only bubble with a `running` tool keeps rendering; only `awaiting-approval`/empty/unresolvable groups are skipped).
- **C4 — Skill cards are visible content (recorded review finding, Destin 2026-08-17):** a Skill-only bubble is NOT empty — `collectTurnSkills` renders the Skill as a trailing-row ToolCard (a visible child), and `AssistantTurnBubble.test.tsx:141-152` pins it. The gate therefore treats resolvable Skills as content, exactly as the renderer does: `turnSkills.length > 0` is a content term. The C2 relocation applies to the Skills row (it moves to the last RENDERED bubble, so a skipped trailing wrapper can't strand it) — but when a turn's only content is Skills, the trailing row IS the content and the bubble renders. (The alternative — C2 also dropping Skills on skipped turns — was rejected: it deletes visible content, which the plan's own "cannot drift" claim would have shipped as a regression.)
- **C5 — timestamp/stop-reason/metadata may appear on a mid-turn bubble while the ask is open (recorded review finding, Destin 2026-08-17):** relocating chrome to the last RENDERED bubble means a still-open ask moves the turn timestamp onto the last bubble that renders *before* it. If that's mid-turn (text follows later), the timestamp appears there — and moves to the final bubble when the turn ends. That is the accepted consequence of C2, not a bug. Tests pin the final state; the visual handoff (Task 5) confirms it feels right.
- **Bubbles array untouched:** `splitIntoBubbles` and the segment structure stay as-is. We only skip rendering empty members — never prune segments, never reorder/merge bubbles. The awaiting-approval tool **keeps its group segment** (it is the tool's home; the pop-out card at ChatView.tsx:898 is a separate render path).
- **Memo comparator unchanged:** the `assistantTurnPropsAreEqual` comparator keys on the turn reference + this turn's reachable tool/group entries. The gate/test draws on `bubbles = splitIntoBubbles(turn)` (pure over `turn`) and `turnSkills = collectTurnSkills(turn, toolGroups, toolCalls)` / `bubble.toolGroupIds` — all covered by that comparator, so no memo change is needed. A tool leaving `awaiting-approval` flips the gate because it changes this turn's reachable tool entry, which the comparator already watches.
- **Renderer boundary:** no `process`/`fs`/`node` APIs in `src/renderer/` (WebView has no Node).
- **Comments:** annotate non-trivial edits with a WHY comment (Destin is a non-developer; the codebase practice).
- **Verification:** from the workspace root: `bash scripts/verify.sh bare-bubble-fix` (verify.sh is workspace-root; takes the worktree name/path) must pass: tsc --noEmit (full suite when test infra changes — the reducer test file is existing, but adding a new `describe` block doesn't touch test infra, so affected-tests mapping applies), `vitest related`, `knip`, `eslint`, ast-grep. Visual check is via dev instance ONLY (`bash scripts/run-dev.sh --label "Bare bubble fix"`), never Destin's live app (`docs/local-dev.md`, live-app-safety rule).
- **Error-message standard:** not applicable (no new user-facing error copy).

---

### Task 1: Worktree + baseline

**Files:** none (setup only).

**Interfaces:** none.

- [ ] **Step 1: Sync the sub-repo and create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
cd /home/destin/youcoded-dev
git -C youcoded worktree add ../worktrees/bare-bubble-fix -b feat/bare-bubble-fix
```

> Worktree root: `/home/destin/youcoded-dev/worktrees/bare-bubble-fix` (the JSONL watcher + reducer paths below are relative to it).

- [ ] **Step 2: Verify the worktree is clean and on the new branch**

Run: `git -C /home/destin/youcoded-dev/worktrees/bare-bubble-fix status --short && git -C /home/destin/youcoded-dev/worktrees/bare-bubble-fix branch --show-current`
Expected: empty status; `feat/bare-bubble-fix`.

- [ ] **Step 3: Confirm baseline tests pass for the two files we'll touch**

Run (from `/home/destin/youcoded-dev/worktrees/bare-bubble-fix/desktop`):
```bash
npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx src/renderer/state/__tests__/chat-reducer.test.ts
```
Expected: all pass (baseline green before any change).

---

### Task 2: View-layer gate + last-rendered-bubble relocation (`AssistantTurnBubble.tsx`)

**Files:**
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.tsx`

**Interfaces:**
- Produces (used by Task 4's tests):
  - `export function bubbleHasVisibleContent(bubble: VisualBubble, toolGroups: Map<string, ToolGroupState>, toolCalls: Map<string, ToolCallState>): boolean` — `true` iff the bubble has non-empty `text`/`plan`/`reasoning`, OR any tool in its groups is a resolvable non-Skill tool whose status is **not** `'awaiting-approval'`. A `running` tool returns `true` (C3). This is the per-bubble INLINE predicate; it deliberately excludes Skills (they render as a trailing row, not inline) and awaiting-approval tools (they render as pop-out cards).
  - C4 (Skills are content) lives at the RENDER site, not in the predicate: the render loop's filter keeps a bubble if `bubbleHasVisibleContent(bubble)` OR it is the turn's original LAST bubble carrying a non-empty trailing-Skills row (see Task 2 Step 4). The existing `collectTurnSkills(turn, toolGroups, toolCalls)` (renderer `AssistantTurnBubble.tsx:278-294`) supplies the row's cards — the gate tests reuse it (via the local `gateFor` helper) so the tests and the renderer read the SAME Skills list.
  - No predicate signature change vs. the spec's `VisualBubble`-only predicate; the Skills term is expressed where the row renders, keeping the predicate a pure function of (bubble, maps).

- [ ] **Step 1: Write the failing tests first (TDD)**

Add a new `describe` block to `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` (after the existing `stop reason footer` block, ~line 386). Reuse the existing helpers `skillTool`, `bashTool`, `makeTurn`, and `formatBubbleTime`. First EXTEND the `renderTurn` fixture (lines 98–114) with a `showTimestamps` option so the C2 relocation tests in Task 4 can see the timestamp (default stays `false` — existing tests are untouched):

```tsx
function renderTurn(opts: {
  turn: AssistantTurn;
  toolGroups: Map<string, ToolGroupState>;
  toolCalls: Map<string, ToolCallState>;
  showTimestamps?: boolean;
}) {
  return render(
    <ChatProvider>
      <AssistantTurnBubble
        turn={opts.turn}
        toolGroups={opts.toolGroups}
        toolCalls={opts.toolCalls}
        sessionId="test"
        showTimestamps={opts.showTimestamps ?? false}
      />
    </ChatProvider>
  );
}
```

Each gate test asserts BOTH what renders AND (for the gate) the predicate's verdict, pinning the single-source-of-truth property.

```tsx
describe('AssistantTurnBubble — empty-bubble gate (timestamp-only bubble)', () => {
  beforeEach(() => cleanup());

  // Helpers for an awaiting-approval tool and a group rendering no inline tools
  // (Skill-only group with a resolvable Skill — group renders nothing inline,
  // the Skill renders in the trailing row on the LAST bubble).
  function makeGroup(bubbleTurn: AssistantTurn, groupId: string, toolIds: string[]): Map<string, ToolGroupState> {
    return new Map([[groupId, { id: groupId, toolIds }]]);
  }
  // Compute the render decision the SAME way the render loop's filter does
  // (Task 2 Step 4): inline content via bubbleHasVisibleContent, OR this is
  // the turn's original LAST bubble AND it carries the trailing-Skills row
  // (C4). turnSkills comes from collectTurnSkills — the same list the renderer
  // uses — so gate and renderer cannot drift.
  function gateFor(bubble: VisualBubble, turn: AssistantTurn, toolGroups: Map<string, ToolGroupState>, toolCalls: Map<string, ToolCallState>) {
    const bubbles = splitIntoBubbles(turn);
    const turnSkills = collectTurnSkills(turn, toolGroups, toolCalls);
    const isLastOfTurn = bubble === bubbles[bubbles.length - 1];
    return bubbleHasVisibleContent(bubble, toolGroups, toolCalls)
      || (turnSkills.length > 0 && isLastOfTurn && bubble.toolGroupIds.length > 0);
  }

  it('renders NO bare bubble when a turn is a single awaiting-approval group (pin: the bug)', () => {
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['b1']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.querySelector('.assistant-bubble')).toBeNull();
    expect(container.querySelector('.bubble-timestamp')).toBeNull();
    // Gate agrees with the renderer:
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, toolCalls)).toBe(false);
  });

  it('renders a text bubble even when it is followed by an awaiting-approval group', () => {
    const turn = { ...makeTurn({ groupIds: ['g1'] }), segments: [
      { type: 'text', content: 'I can remove that for you.', messageId: 'm1' },
      { type: 'tool-group', groupId: 'g1' },
    ] };
    const toolGroups = makeGroup(turn, 'g1', ['b1']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('I can remove that for you.');
    const bubbles = splitIntoBubbles(turn);
    expect(bubbles).toHaveLength(1);
    expect(gateFor(bubbles[0], turn, toolGroups, toolCalls)).toBe(true); // text is content
  });

  it('keeps rendering a tools-only bubble whose tool is RUNNING (C3 spinner is content)', () => {
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['b1']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'npm test' }, status: 'running' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('npm test');
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, toolCalls)).toBe(true);
  });

  it('renders NO bare bubble for a Skill-only group with an unresolvable Skill state', () => {
    // ToolGroupInline filters the only tool (Skill); collectTurnSkills finds
    // nothing (tool entry is missing) → the bubble has zero visible children.
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['s1']); // s1 absent from toolCalls
    const { container } = renderTurn({ turn, toolGroups, toolCalls: new Map() });
    expect(container.querySelector('.assistant-bubble')).toBeNull();
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, new Map())).toBe(false);
  });

  it('KEEPS rendering a Skill-only group with a RESOLVABLE Skill (C4 regression pin — trailing row is content)', () => {
    // The Skill renders as a trailing-row ToolCard (the ONLY visible child), so
    // the bubble must NOT be skipped — this pins the review finding that a gate
    // checking `toolName !== 'Skill'` would DELETE the existing Skill-only render
    // (AssistantTurnBubble.test.tsx:141-152 passes today).
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['s1']);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('Invoked skill: brainstorming'); // trailing row rendered
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, toolCalls)).toBe(true);
  });

  it('renders only the running tool from a mixed running + awaiting-approval group', () => {
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['b1', 'b2']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'npm test' }, status: 'running' }],
      ['b2', { toolUseId: 'b2', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('npm test');
    expect(container.textContent).not.toContain('rm -rf /tmp/x'); // awaiting-approval pop-out is ChatView's job
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, toolCalls)).toBe(true);
  });

  it('renders the group from a mixed running + awaiting-approval + Skill group', () => {
    // C4/C3 in one group: running Bash renders inline, the Skill renders in the
    // trailing row, the awaiting-approval Bash pops out (not inline).
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = makeGroup(turn, 'g1', ['b1', 's1', 'b2']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'npm test' }, status: 'running' }],
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
      ['b2', { toolUseId: 'b2', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('npm test');
    expect(container.textContent).toContain('Invoked skill: brainstorming');
    expect(container.textContent).not.toContain('rm -rf /tmp/x');
    expect(gateFor(splitIntoBubbles(turn)[0], turn, toolGroups, toolCalls)).toBe(true);
  });

  it('renders no bare bubble for a permission-race synthetic tool (awaiting-approval, no group)', () => {
    // PERMISSION_REQUEST can beat TRANSCRIPT_TOOL_USE → a synthetic tool entry
    // with no group. It must never produce a bare bubble of its own.
    const turn = makeTurn({ groupIds: [] }); // no group segment at all
    const { container } = renderTurn({ turn, toolGroups: new Map(), toolCalls: new Map() });
    // splitIntoBubbles yields NO bubbles for a turn with zero segments relevant
    // to bubble construction; the component renders nothing → no bare wrapper.
    expect(container.querySelector('.assistant-bubble')).toBeNull();
  });

  it('skips a LEADING awaiting-approval-only group while text after it still renders (no empty space)', () => {
    // splitIntoBubbles behavior (verified): a separate tools-only bubble is
    // constructible ONLY as the LEADING bubble ([tool-group] first) or via a
    // reasoning separator (which attaches reasoning — content). So the one
    // genuinely skippable bare bubble is the leading one. [awaiting-approval
    // group, text] → {tools-only g1}, {text}; the leading bubble is skipped
    // and must leave no empty space, while the text still renders.
    const turn = { ...makeTurn({ groupIds: ['g1'] }), segments: [
      { type: 'tool-group', groupId: 'g1' },          // awaiting-approval → skipped
      { type: 'text', content: 'On it.', messageId: 'm1' },
    ] };
    const toolGroups = makeGroup(turn, 'g1', ['b1']);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'ls' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('On it.');
    const bubbles = splitIntoBubbles(turn);
    expect(bubbles).toHaveLength(2); // [{tools-g1}, {text}]
    // The leading tools-only bubble is not inline content and is NOT the last
    // bubble, so the C4 carrier term can't save it — the render filter drops it.
    expect(gateFor(bubbles[0], turn, toolGroups, toolCalls)).toBe(false);
    const rendered = bubbles.filter((b) => gateFor(b, turn, toolGroups, toolCalls));
    expect(rendered).toHaveLength(1);
    expect(rendered[0].text?.content).toBe('On it.');
    // One rendered bubble — no leading empty wrapper / gap.
    expect(container.querySelectorAll('.assistant-bubble')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they FAIL for the intended reason**

Run (worktree, `desktop/`): `npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx`
Expected: the new tests fail — `bubbleHasVisibleContent is not defined` (import error) for the predicate asserts, and the render assertions do NOT yet hold (unimplemented gate). Existing tests remain green but the file's import of `bubbleHasVisibleContent` from `./AssistantTurnBubble` must compile: **add the import line first**, then the module fails to resolve until Task 2 Step 3 defines the export.

- [ ] **Step 3: Write the gate — a per-bubble predicate PLUS a turn-level Skills carrier**

The gate has two levels, because the trailing-Skills row is turn-wide while the empty-bubble check is per-bubble:

**3a. `bubbleHasVisibleContent` — the per-bubble inline predicate.** This answers "does this bubble render any INLINE content?" (text/plan/reasoning, or a resolvable non-Skill tool that isn't awaiting-approval — including a running tool's spinner, C3). Skills and awaiting-approval tools render OUTSIDE the bubble (trailing row / pop-out card), so they are not inline content:

```ts
/**
 * Would AssistantTurnBubble visibly render ANYTHING inline inside this
 * bubble? Mirrors the render rules already in place: Skills render as a
 * trailing row (not group content), awaiting-approval tools render as
 * pop-out cards (not inline), and missing tool entries render nothing
 * (ToolGroupInline returns null at 507 + 517). Text, plan, and reasoning
 * are intrinsic content. A RUNNING tool renders its spinner card inline
 * and IS content (C3).
 */
export function bubbleHasVisibleContent(
  bubble: VisualBubble,
  toolGroups: Map<string, ToolGroupState>,
  toolCalls: Map<string, ToolCallState>,
): boolean {
  if (bubble.text || bubble.plan || bubble.reasoning) return true;
  return bubble.toolGroupIds.some((gid) =>
    (toolGroups.get(gid)?.toolIds ?? [])
      .map((id) => toolCalls.get(id))
      .some((t) => t && t.toolName !== 'Skill' && t.status !== 'awaiting-approval'));
}
```

**3b. The render loop keeps a bubble if `bubbleHasVisibleContent(bubble)` OR it is the C4 Skills carrier** — the carrier is the turn's original last bubble exactly when it carries a non-empty trailing-Skills row (computed as `skillsCarrierIsLast` in Step 4). A Skill-only group renders no inline tools but still draws its Skill cards there (C4); skipping it would DELETE visible content (the plan's review finding — `AssistantTurnBubble.test.tsx:141-152` passes today). Inside the map, `isSkillsCarrier` (true for the last rendered bubble with a non-empty row) renders the row. Step 4 gives the concrete filter + row gate.

- [ ] **Step 4: Gate the render loop on the predicate and relocate "last" to the last RENDERED bubble**

Replace the current render loop (currently lines 374–439, mirror `splitIntoBubbles`/`bubbles.map` in the component) with a two-phase version: (a) compute the filter ONCE into `renderedBubbles` (single O(n) pass — the predicate returns the same verdict for every bubble until a tool's status changes), (b) render the filtered sequence, deriving `isLastRenderedBubble` from the filtered index. Concretely, replace the body starting at:

```tsx
      {bubbles.map((bubble, i) => {
        const hasTools = bubble.toolGroupIds.length > 0;
```

…through the end of the map callback (`</div>\n        );`), with:

```tsx
      // Empty-bubble gate, computed ONCE per render: a bubble whose ONLY
      // content is an awaiting-approval tool (or an unresolvable group) must
      // not render — otherwise the user sees a bare rounded box containing
      // just the turn timestamp floating above the permission card (the
      // reported bug). The predicate mirrors the inline render rules below;
      // see its doc comment for why they cannot drift.
      //
      // C4 (Skills are content): the trailing-Skills row renders on the LAST
      // RENDERED bubble of the turn. A bubble that carries no inline content
      // but WILL render that row (this turn's last rendered bubble, e.g. a
      // Skill-only group) must NOT be skipped — skipping it would delete the
      // Skill cards (review finding; AssistantTurnBubble.test.tsx:141-152).
      // `isSkillsCarrier` mirrors the row's own render condition:
      //   renderedBubble && turnSkills.length > 0
      //   — the "last rendered" part is what makes exactly ONE bubble carry it.
      //
      // A bubble rendered here is RE-RENDERED on every status change of its
      // tools, so a tool that leaves awaiting-approval (approved) flips the
      // gate back on and the bubble appears inline — correct, since approval
      // returns the tool to the timeline before the pop-out card dismisses.
      //
      // C4 (Skills are content), precise form: the ONLY bubble that may render
      // without inline content is the turn's ORIGINAL last bubble, and ONLY if
      // it is a tool-group bubble with a non-empty trailing-Skills row — that
      // bubble must survive the gate so the row can draw there (Skill-only
      // group; the row is its only content). Every OTHER tool-group bubble
      // without inline content (mid-turn Skills group, mid-turn awaiting-
      // approval group, unresolvable group) is still skipped — keeping it
      // would reintroduce the bare-bubble bug. There is at most ONE such
      // carrier, so the filter keeps exactly it.
      const lastBubble = bubbles[bubbles.length - 1];
      const skillsCarrierIsLast = turnSkills.length > 0 && lastBubble.toolGroupIds.length > 0;
      const renderedBubbles = bubbles.filter(
        (b) => bubbleHasVisibleContent(b, toolGroups, toolCalls) || (skillsCarrierIsLast && b === lastBubble),
      );
      // One O(n) pass — no re-filtering per bubble. Chrome lands on the LAST
      // RENDERED bubble (C2): a skipped trailing wrapper (awaiting-approval
      // ask still open) never carries — or strands — the timestamp, stop-
      // reason footer, metadata strip, or trailing-Skills row.
      {renderedBubbles.map((bubble, i) => {
        const hasTools = bubble.toolGroupIds.length > 0;
        const hasContent = !!(bubble.text || bubble.plan);
        const hasReasoning = !!bubble.reasoning;
        const toolsOnly = hasTools && !hasContent && !hasReasoning;
        const reasoningOnly = hasReasoning && !hasContent && !hasTools;
        const isLastRenderedBubble = i === renderedBubbles.length - 1;
        const isSkillsCarrier = isLastRenderedBubble && turnSkills.length > 0;
        return (
          <div key={bubble.key} className="flex justify-start px-4 py-0.5">
            <div className={`assistant-bubble max-w-[85%] break-words rounded-2xl rounded-bl-sm bg-inset text-sm text-fg px-5 ${toolsOnly ? 'py-2.5' : hasTools ? 'pt-4 pb-3' : reasoningOnly ? 'py-2.5' : 'py-3.5'}`}>
              {bubble.reasoning && (
                <ReasoningSection content={bubble.reasoning.content} />
              )}
              {bubble.text && (
                // Pass sessionId so MarkdownContent can render inline FilepathToken chips
                // for detected file paths in this session's artifact set.
                <MarkdownContent content={bubble.text.content} sessionId={sessionId} />
              )}
              {bubble.plan && (
                <PlanBubbleContent
                  content={bubble.plan.content}
                  planFilePath={bubble.plan.planFilePath}
                  allowedPrompts={bubble.plan.allowedPrompts}
                />
              )}
              {hasTools && (
                <div className={bubble.text ? 'mt-1' : ''}>
                  {bubble.toolGroupIds.map((groupId) => (
                    <ToolGroupInline
                      key={groupId}
                      groupId={groupId}
                      toolGroups={toolGroups}
                      toolCalls={toolCalls}
                      sessionId={sessionId}
                    />
                  ))}
                </div>
              )}
              {/* Trailing-Skills row: Skills are reordered to the end of the turn's
                  last RENDERED bubble so they read as a status footer rather than
                  co-mingled with substantive tool output. ToolGroupInline filters
                  Skills out upstream so this is the only place they render.
                  `isSkillsCarrier` = C4: the bubble that renders the row survives
                  the gate BECAUSE of it (Skill-only group), and the row itself
                  draws there — never stranded, never deleted. */}
              {isSkillsCarrier && (
                <div className="mt-1 space-y-0.5">
                  {turnSkills.map((skill) => (
                    <ToolCard key={skill.toolUseId} tool={skill} sessionId={sessionId} />
                  ))}
                </div>
              )}
              {/* Opt-in metadata strip. Renders once per turn (last rendered bubble
                  only) and only when the user has enabled `showTurnMetadata`. Placed
                  above the stopReason footer so a truncated turn still shows both,
                  in that order. */}
              {isLastRenderedBubble && showTurnMetadata && <TurnMetadataStrip turn={turn} />}
              {/* Render stopReason explainer only once per turn — on the last rendered
                  bubble. Gate out `end_turn` (normal completion) — it reaches the reducer but
                  carries no abnormal signal worth surfacing to the user. */}
              {isLastRenderedBubble && turn.stopReason && turn.stopReason !== 'end_turn' && <StopReasonFooter reason={turn.stopReason} provider={provider} />}
              {showTimestamps && isLastRenderedBubble && turn.timestamp && (
                <div className="bubble-timestamp text-4xs text-fg-muted/60 text-right mt-1 -mb-0.5 select-none leading-none">
                  {formatBubbleTime(turn.timestamp)}
                </div>
              )}
            </div>
          </div>
        );
      })}
```

> **C2 note + honest simplification (review finding, verified):** `renderedBubbles` is the filter result — computed ONCE per render (one O(n) pass; bubbles per turn are 1–5, and the component is memoized against tool churn). `isLastRenderedBubble = i === renderedBubbles.length - 1` so the LAST rendered bubble always carries the chrome; a skipped wrapper never reaches the map. This relocates all four last-bubble chrome items (timestamp, stop-reason footer, metadata strip, trailing-Skills row) to the last bubble the user actually sees — and because the filtered array is single-source, the C4 Skills carrier is the same bubble that renders the row, so the gate, the row, and the chrome cannot disagree about which bubble is "last."
>
> **Why "last RENDERED" is still the right rule even though a bare trailing wrapper is barely constructible today:** `splitIntoBubbles` merges `[text, tool-group]` into ONE bubble, and a tools-only bubble only becomes a *separate* trailing wrapper via a reasoning separator — which gives it reasoning content (not bare). So today, whenever a real bubble exists, the last RENDERED bubble IS the last bubble, and C2 is effectively a no-op. The gate alone fixes the reported bug. We keep the `renderedBubbles` derivation anyway because it is (a) free (single filter), (b) makes the invariant *robust* to any future change in `splitIntoBubbles` that could produce a bare trailing wrapper, and (c) is what makes C4 (Skills carrier on the last rendered bubble) collapse into the same filtered index. It is cheap insurance, not load-bearing for the symptom.
>
> **Behavior change (C5):** with the chrome on the last RENDERED bubble, a turn whose ask is still open shows its timestamp on the last bubble rendered BEFORE the ask — mid-turn if text follows later — and it moves to the final bubble when the turn completes. That is the accepted consequence of C2 (recorded in Global Constraints, C5); the visual handoff confirms it feels right.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx`
Expected: all new gate tests pass — including the two C4 Skill-content pins (Skill-only group renders + gate agrees; mixed running+awaiting+Skill group); the EXISTING `Skill extraction` tests (incl. `AssistantTurnBubble.test.tsx:141-152` "renders only the Skill trailing row when turn has no non-Skill tools") stay green — that passing test is the regression the C4 fix protects; the two existing `splitIntoBubbles` BUG A tests still pass; `stop reason footer` tests still pass. (The `mdRenders` memo tests are unaffected — the memo comparator never changes.)

- [ ] **Step 6: Run the full component test file + the reducer file (regression sweep)**

Run: `npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx src/renderer/state/__tests__/chat-reducer.test.ts`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "fix(chat): never render a bare assistant bubble — gate on visible content, relocate turn chrome to last rendered bubble (C1-C5)"
```

---

### Task 3: Reducer guard — skip whitespace-only text/reasoning deltas (`chat-reducer.ts`)

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`

**Interfaces:**
- Consumes: the existing `TRANSCRIPT_ASSISTANT_TEXT` and `TRANSCRIPT_ASSISTANT_REASONING` case structure (dedup at 991–994, `getOrCreateTurn` at 996 / 1048).
- Produces: no new exports. Behavior: whitespace-only `action.text` returns `state` unchanged (no new object) WITHOUT touching `seenUuids` or `getOrCreateTurn`.

- [ ] **Step 1: Write the failing reducer tests first (TDD)**

Add a new `describe` block to `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`.

> **Harness reality (verified, review finding):** this file does NOT export `initialState`/`apply` — the existing tests build sessions with the local `stateWithInFlightTurn()` helper (`chat-reducer.test.ts:7-37`) and call `chatReducer(state, action)` directly. The reducer's return type is a `Map<string, SessionChatState>` (there is no sessionless state object; `getOrCreateTurn` runs only when a session already exists). So the plan's `apply(initialState, …)` shape does not exist as written. Use `createSessionChatState()` from `../chat-types` + `new Map([['s1', session]])` as the baseline, mirroring `stateWithInFlightTurn`. The assertions below are unchanged in meaning; the two actions marked *(fixture-note)* are written loosely and MUST be adapted to the real `ChatAction` union at implementation time (read the `TRANSCRIPT_ASSISTANT_TEXT`/`_REASONING` case shapes in `chat-reducer.ts` and match them — the plan shows the assertion shape, not a refactor of the harness).

```ts
describe('chatReducer whitespace-only TEXT/REASONING guard', () => {
  // Baseline: an empty session for the id under test (mirrors the file's
  // stateWithInFlightTurn helper; see harness note above).
  function emptySession(sessionId = 's1') {
    const session = createSessionChatState();
    session.currentTurnId = null;
    return new Map([[sessionId, session]]);
  }

  it('TRANSCRIPT_ASSISTANT_TEXT with whitespace-only content appends NO segment and creates no turn', () => {
    // Empty session → getOrCreateTurn must never run for a whitespace delta.
    const result = chatReducer(emptySession(), {
      type: 'TRANSCRIPT_ASSISTANT_TEXT',
      sessionId: 's1',
      text: '   \n\t ', // (fixture-note: match the real ChatAction field names)
    });
    expect(result.get('s1')!.assistantTurns.size).toBe(0);
    expect(result.get('s1')!.timeline.length).toBe(0);
  });

  it('TRANSCRIPT_ASSISTANT_TEXT whitespace-only does not consume a uuid — and the guard placement is what makes it true', () => {
    const withSession = chatReducer(emptySession(), {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: 's1', text: 'hello',
    });
    const before = withSession.get('s1')!.seenUuids;
    const result = chatReducer(withSession, {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: 's1', text: '   ', uuid: 'u1',
    });
    // Whitespace dropped BEFORE dedup bookkeeping → u1 is NOT recorded. The
    // Set is returned UNTOUCHED (referentially the same object): a guard placed
    // BELOW the dedup check would have created a NEW Set that contains u1, so
    // this assertion discriminates the placement. (A content-equal has() check
    // would pass either way — that was the review finding.)
    expect(result.get('s1')!.seenUuids).toBe(before);
    // …so a later legit copy of u1 still processes:
    const result2 = chatReducer(result, {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: 's1', text: 'real content', uuid: 'u1',
    });
    const turn = result2.get('s1')!.assistantTurns.get(result2.get('s1')!.currentTurnId!);
    expect(turn).toBeDefined();
    expect(turn!.segments.filter((s) => s.type === 'text')).toHaveLength(2); // hello + real content
  });

  it('TRANSCRIPT_ASSISTANT_REASONING with whitespace-only content appends NO segment', () => {
    const withTurn = chatReducer(emptySession(), {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: 's1', text: 'Before',
    });
    const before = withTurn.get('s1')!.assistantTurns.get(withTurn.get('s1')!.currentTurnId!)!.segments.length;
    const result = chatReducer(withTurn, {
      type: 'TRANSCRIPT_ASSISTANT_REASONING', sessionId: 's1', text: ' \n ',
    });
    expect(result.get('s1')!.assistantTurns.get(result.get('s1')!.currentTurnId!)!.segments.length).toBe(before);
  });

  it('a real (non-whitespace) delta still appends normally (no regression)', () => {
    const result = chatReducer(emptySession(), {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: 's1', text: 'real words',
    });
    const turn = result.get('s1')!.assistantTurns.get(result.get('s1')!.currentTurnId!)!;
    expect(turn.segments.some((s) => s.type === 'text' && s.content === 'real words')).toBe(true);
  });
});
```

> **Test-harness note:** the assertions above are the shape; match the file's real helper style (`stateWithInFlightTurn` + `chatReducer(state, action)`) and the real `ChatAction` field names at implementation time. The key invariants to pin: whitespace creates no turn and no segment; the `seenUuids` Set is returned untouched (referential equality — discriminates guard placement); a real delta still appends.

- [ ] **Step 2: Run the new tests to verify they FAIL**

Run: `npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts`
Expected: new tests fail — whitespace currently creates a segment/turn. (The "real delta appends" test would pass trivially, which is the no-regression baseline; the two whitespace-shape tests plus the uuid-placement test fail.)

- [ ] **Step 3: Add the guard**

In `desktop/src/renderer/state/chat-reducer.ts`, at the TOP of the `TRANSCRIPT_ASSISTANT_TEXT` case (line 981, BEFORE the `applySubagentEvent` route and BEFORE the `getOrCreateTurn` call), and at the TOP of the `TRANSCRIPT_ASSISTANT_REASONING` case (line 1044, BEFORE `getOrCreateTurn`):

```ts
    case 'TRANSCRIPT_ASSISTANT_TEXT': {
      // Skip whitespace-only deltas — a rendered bubble must have visible content.
      // Matches the upstream guards (transcript-watcher stripSystemTags,
      // harness-session's `if (!t) break`). Returning `state` (not a new object)
      // keeps seenUuids/lastActivityAt/lastOutputAt untouched, so a whitespace
      // line can never consume a uuid (a later legit copy still processes) nor
      // create a turn (getOrCreateTurn below never runs). MUST precede the
      // seenUuids dedup check (line 991) AND the getOrCreateTurn call (996) —
      // the guard is what makes "dropped BEFORE recorded" hold.
      if (!action.text || !action.text.trim()) return state;
      // Subagent event: route into the parent Agent tool's nested timeline.
      if (action.parentAgentToolUseId) return applySubagentEvent(state, action);
      const session = next.get(action.sessionId);
```

```ts
    case 'TRANSCRIPT_ASSISTANT_REASONING': {
      // Same whitespace-only guard as the TEXT case — reasoning must also be
      // substantive to become a segment; see WHY comment there.
      if (!action.text || !action.text.trim()) return state;
      const session = next.get(action.sessionId);
```

> **Placement invariant (from the spec):** the guard sits ABOVE `getOrCreateTurn` (line 996), so a whitespace-only delta can never create or extend a turn; and ABOVE the `seenUuids` dedup check (line 991) in the TEXT case, so the line is dropped BEFORE it is recorded — a later legitimate copy of the same uuid still processes. (Corrected review finding: the original plan said "BELOW the dedup check" and put the guard after the `applySubagentEvent` route at 983 — that placement makes the whitespace `return state` happen after `seenUuids` was already consumed. The guard must precede BOTH the dedup check AND the subagent route. The route check is a pure function of `parentAgentToolUseId`, so the guard can sit at the very top of the case, before it — order between the two is arbitrary, but the whitespace guard must precede the `seenUuids` bookkeeping.) Pinned by the referential-equality assertion in Task 3 Step 1.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts`
Expected: all new guard tests pass; the existing suite stays green (no behavior change for real deltas — the `chat-reducer.test.ts` suite is 1,049 lines today; the four new tests touch only the whitespace path).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-reducer.ts desktop/src/renderer/state/__tests__/chat-reducer.test.ts
git commit -m "fix(chat): reducer guard — drop whitespace-only TEXT/REASONING deltas before turn creation (defense-in-depth)"
```

---

### Task 4: C2/C4 pinning tests — the bug, chrome placement, and Skill-content survival

**Files:**
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.test.tsx`

**Interfaces:**
- Consumes: `splitIntoBubbles`, the `gateFor` helper (Task 2), `renderTurn` fixture (extended with `showTimestamps` in Task 2), `makeTurn`/`bashTool`/`skillTool` helpers.

- [ ] **Step 1: Write the C2 relocation tests (TDD)**

Append to the gate `describe` block added in Task 2 (same file). The `beforeAll` Intl freeze noted in the timestamp test belongs at the top of this describe block:

```tsx
  it('C2 pin (the bug): an awaiting-approval-ONLY turn renders NO bubble and NO timestamp', () => {
    // Turn = [awaiting-approval group] only — the single tools-only bubble has
    // no inline content AND no other bubble exists to carry the chrome, so the
    // whole turn renders nothing (timestamp included). This is the reported bug
    // pinned at the component level.
    const turn = { ...makeTurn({ groupIds: ['g1'] }), timestamp: 1_712_821_441_532 };
    const toolGroups = new Map<string, ToolGroupState>([['g1', { id: 'g1', toolIds: ['b1'] }]]);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls, showTimestamps: true });
    expect(container.querySelector('.assistant-bubble')).toBeNull();
    expect(container.querySelector('.bubble-timestamp')).toBeNull();
  });

  it('C2: timestamp + stop-reason land on the rendered bubble, not a bare wrapper', () => {
    // turn = [text, awaiting-approval group] — splitIntoBubbles MERGES these
    // into ONE bubble (verified), so exactly one rendered bubble carries the
    // text, the timestamp, and the stop-reason footer. Pins that no separate
    // bare wrapper is produced and the chrome isn't stranded.
    const turn = { ...makeTurn({ groupIds: ['g1'] }), timestamp: 1_712_821_441_532, segments: [
      { type: 'text', content: 'I can remove that for you.', messageId: 'm1' },
      { type: 'tool-group', groupId: 'g1' },
    ], stopReason: 'max_tokens' };
    const toolGroups = new Map<string, ToolGroupState>([['g1', { id: 'g1', toolIds: ['b1'] }]]);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls, showTimestamps: true });
    const bubbles = container.querySelectorAll('.assistant-bubble');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toContain('I can remove that for you.');
    expect(bubbles[0].textContent).toContain('Response truncated — Claude hit the output token limit.');
    // formatBubbleTime is locale/timezone-dependent (toLocaleTimeString), so a
    // bare `toContain(formatBubbleTime(...))` comparison is flaky across
    // machines/CI (review finding). Freeze Intl for the describe block:
    //   beforeAll(() => vi.spyOn(Intl.DateTimeFormat.prototype, 'format')
    //     .mockImplementation(() => '4:21 PM'));
    // then assert the fixed string:
    expect(bubbles[0].textContent).toContain('4:21 PM');
  });

  it('C2: a leading awaiting-approval group is skipped; later text + timestamp still render', () => {
    // turn = [awaiting-approval group, text] — splitIntoBubbles makes this TWO
    // bubbles: a leading bare tools-only bubble and a text bubble. The leading
    // one is skipped; the text bubble is the last RENDERED bubble and carries
    // the timestamp (already the last bubble — C2 is a no-op here, but the
    // assertion pins the invariant).
    const turn = { ...makeTurn({ groupIds: ['g1'] }), timestamp: 1_712_821_441_532, segments: [
      { type: 'tool-group', groupId: 'g1' },
      { type: 'text', content: 'On it.', messageId: 'm1' },
    ] };
    const toolGroups = new Map<string, ToolGroupState>([['g1', { id: 'g1', toolIds: ['b1'] }]]);
    const toolCalls = new Map<string, ToolCallState>([
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'ls' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls, showTimestamps: true });
    const bubbles = container.querySelectorAll('.assistant-bubble');
    expect(bubbles).toHaveLength(1); // the leading bare wrapper is gone
    expect(bubbles[0].textContent).toContain('On it.');
  });

  it('C2: trailing-Skills row + chrome coexist on the ONE rendered bubble when a group renders nothing inline', () => {
    // NOTE (accurate splitIntoBubbles behavior, review finding): [text,
    // tool-group] MERGES into a SINGLE bubble (no new bubble opens for a
    // tool-group after an open text bubble without pendingReasoning). So this
    // fixture renders one bubble; the group inside renders nothing inline
    // (awaiting-approval Bash pops out, Skill is filtered), but the bubble is
    // kept by its text — and the Skills row + chrome must land on it, not be
    // stranded. This pins the coexistence of "kept bubble" + "Skills row on
    // the last rendered bubble."
    const turn = { ...makeTurn({ groupIds: ['g1'] }), segments: [
      { type: 'text', content: 'On it.', messageId: 'm1' },
      { type: 'tool-group', groupId: 'g1' },
    ] };
    const toolGroups = new Map<string, ToolGroupState>([['g1', { id: 'g1', toolIds: ['s1', 'b1'] }]]);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
      ['b1', { toolUseId: 'b1', toolName: 'Bash', input: { command: 'ls' }, status: 'awaiting-approval' }],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    // Exactly one bubble renders, and the Skill card is INSIDE it.
    const bubbles = container.querySelectorAll('.assistant-bubble');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toContain('On it.');
    expect(bubbles[0].textContent).toContain('Invoked skill: brainstorming');
  });

  it('C2: a Skill-ONLY turn still renders its trailing row (C4) — the row IS the content, not a relocation side-effect', () => {
    // No text, only a Skill group: gate must keep the bubble (C4) AND the row
    // must render (it's the only content). Guards against a "relocate" that
    // skips the bubble and deletes the card.
    const turn = makeTurn({ groupIds: ['g1'] });
    const toolGroups = new Map<string, ToolGroupState>([['g1', { id: 'g1', toolIds: ['s1'] }]]);
    const toolCalls = new Map<string, ToolCallState>([
      ['s1', skillTool('s1', 'superpowers:brainstorming')],
    ]);
    const { container } = renderTurn({ turn, toolGroups, toolCalls });
    expect(container.textContent).toContain('Invoked skill: brainstorming');
    expect(container.querySelectorAll('.assistant-bubble')).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests — verify they FAIL before the Task 2 change and PASS after**

Run: `npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx`
Expected after Task 2: all C2/C4 tests pass — the awaiting-approval-only turn renders nothing (the bug pin), the merged and leading-group cases render exactly one bubble with the chrome on it, and the Skill-only tests (Task 2 gate block + Task 4) keep their cards. (If running this file in isolation after Task 2, they pass; before Task 2's gate they'd fail — the gate is what makes them pass. The C4 tests would ALSO fail if the gate over-skips Skill-only bubbles — that failure mode is what they exist to catch.)

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "test(chat): pin C2/C4 — no bare bubble; chrome on the rendered bubble; Skill cards survive the gate"
```

---

### Task 5: Verify, review, and hand off

**Files:** none new.

- [ ] **Step 1: Run the full desktop verification suite in the worktree**

Run (from `/home/destin/youcoded-dev` — `verify.sh` is a WORKSPACE-root script, not desktop's):
```bash
bash scripts/verify.sh bare-bubble-fix
```
Expected: exit 0 — tsc --noEmit, `vitest related` (new + affected tests), knip, eslint, ast-grep invariant scan all green. (`verify.sh` covers `youcoded/desktop` only; Android/worker need their own commands — but this change is renderer-only and Android consumes the same bundle, so no separate check is required beyond confirming `desktop/src/renderer/` compiles.)

- [ ] **Step 2: Self-review the diff against the spec**

Run: `git diff master --stat && git diff master`
Checklist:
- `splitIntoBubbles` untouched (non-goal).
- No segment pruning in the reducer; the awaiting-approval tool keeps its group.
- `chat-reducer.ts` guard sits ABOVE `getOrCreateTurn` (996) AND ABOVE the `seenUuids` dedup check (991) in TEXT — the corrected placement (review finding); the whitespace `return state` precedes BOTH the subagent route and the dedup bookkeeping.
- `bubbleHasVisibleContent` mirrors `ToolGroupInline`'s null rules (Skill excluded from INLINE content, awaiting-approval excluded, undefined excluded) + C3 (running included) — and the render gate adds the C4 Skills-carrier term (`turnSkills.length > 0` on the last rendered bubble) so Skill-only bubbles keep their trailing row.
- The render loop maps over ONE filtered `renderedBubbles` array; `isLastRenderedBubble` and `isSkillsCarrier` derive from it — no per-bubble re-filtering, no O(n²).
- All four last-bubble chrome items (Skills row, metadata, stop-reason, timestamp) now use `isLastRenderedBubble` / `isSkillsCarrier`.
- WHY comments on both non-trivial edits.

- [ ] **Step 3: Worktree-independent sanity — run the two test files from the MAIN checkout's dependency tree**

Only if the worktree's `node_modules` is absent/copied: run the same two vitest invocations. If the worktree lacks deps, `cp -al` the main checkout's `node_modules` (hardlinks — NEVER `ln -s`; see PITFALLS) and re-run. Expected: green.

- [ ] **Step 4: Open a PR to `youcoded` master**

```bash
cd /home/destin/youcoded-dev/worktrees/bare-bubble-fix
git push -u origin feat/bare-bubble-fix
```
Open PR `itsdestin/youcoded` feat/bare-bubble-fix → master. Title: "fix(chat): never render a bare assistant bubble; relocate turn chrome to last rendered bubble (C1–C5 confirmed)". PR body: paste the "Confirmed mechanism" from the spec + the five decisions + verification output.

- [ ] **Step 5: Flag the visual handoff to Destin (do NOT automate interactive verification)**

Per the live-app-safety rule and the spec's Verification section:
- Offer a dev instance: `bash scripts/run-dev.sh --label "Bare bubble fix"` — drive a tool to `awaiting-approval` and confirm: (a) the bare bubble is gone, (b) the permission card remains, (c) the timestamp sits on the last RENDERED bubble — INCLUDING the mid-turn case where text follows the ask (C5: the timestamp appears there and moves when the turn completes — confirm this feels right, it is the accepted consequence of C2), and (d) a Skill-only turn (e.g. `/theme-builder` alone) still shows its Skill card (C4 regression check). This is the interactive step Destin eyeballs in ~30s.
- Optionally capture one-shot workbench screenshots via the compare registry (`dev/workbench/compare/registry.tsx:1785+`) — scriptable, non-interactive.
- The buddy mirror (`buddy/BubbleFeed.tsx:396`) renders the same `AssistantTurnBubble` — covered by the same component, no separate change; visually confirm in the dev instance.
- Do NOT touch Destin's live built app; do NOT leave the dev instance running after the PR lands.

- [ ] **Step 6: After merge — archive the spec + plan, flip the roadmap item, clean the worktree**

Per workspace lifecycle rules:
```bash
git mv docs/active/specs/2026-08-17-timestamp-only-assistant-bubble-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-17-timestamp-only-assistant-bubble.md docs/archive/plans/
# flip ROADMAP.md bug item to [x] in the SAME session as the merge
git -C youcoded worktree remove /home/destin/youcoded-dev/worktrees/bare-bubble-fix
git -C youcoded push origin --delete feat/bare-bubble-fix   # skip if the PR auto-deleted it
git -C youcoded branch -D feat/bare-bubble-fix
```

---

## Self-Review

**Spec coverage:**
- Change 1 (view-layer gate) → Task 2.
- Change 2 (reducer guard) → Task 3.
- Change 3 (tests) → Task 2 Step 1 (gate tests), Task 4 (C2 relocation tests), Task 3 Step 1 (reducer guard tests).
- C1 (card unchanged) → no code; documented in Global Constraints.
- C2 (relocate chrome) → Task 2 Step 4 + Task 4.
- C3 (running spinner is content) → predicate + pinning test in Task 2.
- C4 (Skill cards are content) → the render-gate carrier term in Task 2 Step 4 + regression pins in Task 2 Step 1 and Task 4.
- C5 (chrome may land mid-turn while an ask is open) → documented in Global Constraints + Task 2 Step 4 C2 note; confirmed visually at handoff.
- Buddy mirror → covered via shared component; flagged in Task 5 Step 5.
- Delivery order (single change set, no chunking) → Tasks 2–4 are one branch; Tasks 2/3/4 each commit independently, matching the spec's "ship together" while keeping commits reviewable.
- Verification (verify.sh + dev-instance visual) → Task 5.
- Non-goals (no segment pruning, no timeline reorder, no hook changes) → enforced in Global Constraints + Task 5 Step 2 checklist.

**Gaps found during review (this revision):**
- The reducer test harness DOES NOT export `initialState`/`apply` (verified) — the plan's original tests assumed exports that don't exist. Rewritten to use `createSessionChatState()` + `new Map([...])` (mirroring the file's own `stateWithInFlightTurn`), with a fixture-note to match the real `ChatAction` shape at implementation time.
- The uuid test originally asserted content-equality (`has('u1') === false`), which passes even with a mis-placed guard. Rewritten to assert `seenUuids` referential identity — discriminates guard placement (original plan also said "BELOW dedup"; corrected to ABOVE, and the guard code was re-ordered to the top of the case).
- The C2 timestamp test originally asserted `toContain(formatBubbleTime(turn.timestamp!))` — locale/TZ-dependent, flaky in CI. Rewritten with a frozen-Intl approach + fixed '4:21 PM' string.
- The gate (as designed in the original plan) would have DELETED the visible Skill-only render (`toolName !== 'Skill'` never counts Skills, yet the trailing row is visible content; `AssistantTurnBubble.test.tsx:141-152` passes today). Fixed with the C4 carrier term + a regression-pin test.
- The permutation-race test uses a turn with `groupIds: []` — `splitIntoBubbles` yields no bubbles for a segment-less turn, so the assertion is on `.assistant-bubble` being absent (a component-level check), and the gate test covers the group-less `awaiting-approval` case at the predicate level via a no-tools bubble. Marked explicitly in the test comment.
- No placeholders: every step has concrete code or an exact command.

**Type consistency:**
- `bubbleHasVisibleContent(bubble, toolGroups, toolCalls)` — 3-arg per-bubble inline predicate, defined in Task 2 Step 3a and used identically across Tasks 2/4. The C4 carrier is expressed at the RENDER site (`renderedBubbles` filter), not inside the predicate — so the predicate stays a pure function of (bubble, maps), and the "Skills are content" decision lives where the Skills row renders.
- `isLastRenderedBubble` + `isSkillsCarrier` — used consistently in Task 2 Step 4 (replaces `isLastBubble` at the four chrome sites); both derive from the single filtered `renderedBubbles` array.
- `VisualBubble`, `ToolGroupState`, `ToolCallState` — all existing types from `chat-types.ts` / `shared/types.ts`, imported already in the component and test.
- `collectTurnSkills(turn, toolGroups, toolCalls)` — existing function; the gate tests reuse it (via `gateFor`) to compute the same Skills list the renderer uses, keeping gate and renderer in agreement.
- `formatBubbleTime` — imported already in the component; the C2 timestamp test renders with `showTimestamps: true` via the extended `renderTurn` fixture (Task 2 Step 1), so `.bubble-timestamp` is visible — with the Intl freeze applied for determinism.
- The `renderTurn` fixture gained a `showTimestamps?: boolean` option (default `false`) — existing call sites are unaffected.