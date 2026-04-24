# Skill Compact Card — Design

**Date:** 2026-04-24
**Status:** Approved — ready for implementation plan
**Repo:** `youcoded/`

## Problem

The `Skill` tool card in the chat view consumes the same vertical space as a full tool card (Bash, Read, Edit) despite carrying no meaningful information in its expanded body. Our 126-transcript investigation confirmed every Skill invocation returns `success: true` with exactly `"Launching skill: <name>"`. The real signal (which skill ran) is already in the header. Today's card is pure ceremony occupying ~160 px.

## Goals

Produce a Skill render that:
1. **Keeps the tool-card visual idiom** — still looks like a card, not a pill or chip.
2. **Visually simplifies** to read as a one-line status annotation rather than an expandable tool card.
3. **Renders outside any tool group** — sits as a standalone card, even when Claude invoked it inside a group.
4. **Floats to the end of the message bubble** — within an assistant turn, any Skill invocation appears after all other tool groups and non-Skill tools, regardless of the order Claude invoked it.

## Non-goals

- Changing the reducer's group-tracking logic. Skill tools continue to be added to `currentGroupId` at the state level; extraction happens at the view layer.
- Surfacing unrecognized-skill errors (separate composer-preflight concern; see prior investigation).
- Applying the same treatment to Agent, MCP, or other low-info tools. Skill-only for this pass.
- Mutating historical message layout for a Skill invoked in a prior turn — only the invocation's own turn bubble reorders; turn boundaries remain respected.

## Approach

### Render-layer extraction (not reducer)

The recon established that tool groups carry no DOM wrapper — `<ToolCard inGroup={true}>` applies `bg-inset` styling, but there is no `<ToolGroup>` component framing a group. So "outside the group" means simply rendering a Skill `<ToolCard>` with `inGroup={false}` in a new position in the turn layout, while removing its id from any `ToolGroupInline` that would have rendered it.

In `AssistantTurnBubble`, after `splitIntoBubbles` builds the turn's segment/bubble structure, we:

1. Walk every `ToolGroupState` referenced by the turn, collect all `toolIds` whose tool is a Skill invocation, and filter them out of their groups (view-only, leaving reducer state untouched).
2. Render a trailing row of Skill cards at the end of the last bubble in the turn, with `inGroup={false}` and the new simplified variant styling.
3. If a turn has only Skill invocations, the trailing row becomes the bubble's only content.

Multiple skills in one turn stack in invocation order at the bottom (no re-sort among themselves). Turn boundaries are respected — Skills from an earlier turn never migrate down into a later turn.

### Simplified visual

`ToolCard` gains a narrow code path for `toolName === 'Skill'`:

- Body is never rendered (no expand affordance, no body dispatcher call).
- Border is a thin dashed line in `var(--edge-dim)` to read lighter than a normal solid-border card.
- Header content (via `friendlyToolDisplay`) is unchanged — that's the only information worth showing.
- Height is ~36 px vs the current ~48 px collapsed height, closer to a log line.

The exact dashed/border treatment is tuned in the sandbox via HMR before the production change lands.

### Sandbox instrumentation (enabling work)

The current sandbox passes bare `<ToolCard tool={tool} />` with no `inGroup` prop, so our existing multi-tool fixtures don't exercise real group styling. Two small sandbox additions unlock faithful visual iteration:

1. **`inGroup` passthrough**: in multi-block fixtures (bubble-frame case), pass `inGroup={true}` on non-Skill tools and `inGroup={false}` on Skill tools.
2. **Reorder in sandbox**: within a multi-block fixture's tool list, reorder Skill blocks to render after non-Skill blocks — matches the production behavior so the visual tests what users will see.
3. **New fixture** `group-bash-read-skill.jsonl`: a realistic turn where Skill appears *before* Read in source order, and we verify it visually floats to the end.

## Architecture

```
┌───────────────────────────────────────────────┐
│ AssistantTurnBubble (view)                    │
│  ├─ splitIntoBubbles() → segments             │
│  ├─ extract Skill toolIds from groups (new)   │
│  ├─ render ToolGroupInline for each group     │
│  │    with Skill ids filtered out             │
│  └─ render trailing Skill cards (new)         │
│       as <ToolCard inGroup={false} /> row     │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ ToolCard (component)                          │
│  ├─ friendlyToolDisplay() — unchanged         │
│  ├─ if toolName === 'Skill':                  │
│  │    render simplified header-only variant   │
│  └─ else:                                     │
│       existing expandable card                │
└───────────────────────────────────────────────┘
```

## Testing

### Unit
- New test in `AssistantTurnBubble.test.tsx` (or closest equivalent): given a turn where Claude invoked Bash, Skill, Read (in that order), assert the render order is `[Bash, Read, Skill]` — Skill at end.
- Test case: a turn with only a Skill call renders as a single trailing card.
- Test case: multiple Skill calls stack in invocation order at the end.

### Visual
- Sandbox shows the existing `skill.jsonl` and `skill-failed.jsonl` with the simplified variant.
- New `group-bash-read-skill.jsonl` in the sandbox reproduces the end-to-end ordering + styling outcome.

### No new test types
- No e2e or screenshot tests; the sandbox is the visual-confirmation surface.

## Edge cases

| Case | Behavior |
|---|---|
| Skill invoked as the only tool in a turn | Single trailing Skill card, no groups above |
| Turn interrupted mid-invocation (Skill in `running` status) | Still extracted and rendered at the end, with running spinner |
| Skill fails (`is_error: true` in the synthetic case) | Extracted, rendered with `failed` status styling on the simplified card |
| Turn crosses a reducer group boundary (two non-Skill groups with Skills in each) | Each turn's Skills collected and rendered as one trailing row per turn |
| Skill permission flow (`awaiting-approval`) | Out of scope for this pass; approval cards render in-group as today. We can revisit if users report confusion. |

## Open questions

None blocking. A few items to consider during implementation:
- **Hover/click affordance on the simplified card**: should it be clickable at all? Today's ToolCard toggles expand on click. Skills have nothing to expand. Consider rendering the simplified variant as non-interactive (no hover highlight, no cursor change). Decide in sandbox.
- **`awaiting-approval` treatment**: if a Skill ever enters this state today, the current card would render Yes/No buttons in its body. The simplified card has no body. Flag if the reducer ever emits a Skill with this status in practice.

## Next

Hand off to `writing-plans` for the implementation plan.
