---
status: draft
date: 2026-08-17
tags: [renderer, chat, ui, reliability]
---

# Spec: Never render a bare assistant bubble — timestamp-only bubble above permission cards

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

> **Source:** investigation `docs/active/investigations/2026-08-17-timestamp-only-assistant-bubble.md`
> (CONFIRMED 2026-08-17, code-verified). ROADMAP Bugs entry 2026-08-17.
> Scope chosen by Destin: view-layer fix (primary) **+** reducer guard (defense-in-depth) **+** pinning tests.

## Motivation

The user occasionally sees a small, bare rounded box in the chat view containing
**only a timestamp** (e.g. `4:21 PM`), with a permission card (Yes / Always
Allow / No) directly below it. The box is an assistant bubble.

**Confirmed mechanism (code-verified):**

1. `splitIntoBubbles()` (`AssistantTurnBubble.tsx:194-271`) creates a
   **tools-only visual bubble** (no text/plan/reasoning) when a turn's first
   segment is a `tool-group`, or when a tool-group opens a NEW bubble after
   interleaved reasoning (the BUG A fix at 248-256).
2. `PERMISSION_REQUEST` (`chat-reducer.ts:1557-1634`) flips the tool to
   `awaiting-approval` but **leaves it in its group** — the group segment stays
   on the turn.
3. `ToolGroupInline` (`AssistantTurnBubble.tsx:506-521`) returns `null` when
   every remaining tool in the group is `awaiting-approval` (520-521), and
   filters Skills the same way (509-515).
4. The bubble render loop (`AssistantTurnBubble.tsx:374-411`) gates only on the
   raw segment count (`hasTools = bubble.toolGroupIds.length > 0`, line 375) —
   **it never checks whether any group actually rendered content.** The wrapper
   survives with no children.
5. The timestamp renders on the turn's **last** bubble (`AssistantTurnBubble.tsx:431-435`),
   and an awaiting-approval tool is the last thing in its turn — so the bare
   wrapper receives the timestamp.
6. `ChatView.tsx:890-904` renders `awaitingTools` (derived at 174-189 from
   `activeTurnToolIds`) as standalone assistant-style bubbles at the bottom of
   the timeline — the Yes / Always Allow / No card directly beneath the bare
   bubble.

This exactly matches the reported symptom. The reducer state is **correct**
(the tool IS in the group, it IS `awaiting-approval`, the pop-out card IS the
same tool) — the defect is purely in the view layer.

**The invariant:** *a rendered bubble must always have at least one visible
child — never a bare wrapper with just a timestamp.*

The fix is a single source of truth in the view layer (Change 1), a defensive
reducer guard for the empty-text class (Change 2), and pinning tests
(Change 3). The buddy surface is covered by the same component.

---

## User checkpoints — decide before implementation (Destin)

The bug itself is unambiguous, but the fix surfaces three small product
decisions about what the user SEES. Each has a recommended default; each is
Destin's call before Change 1 is built. The chosen answers are mirrored into
Change 1 and pinned by Change 3 tests.

> **Checkpoint RESOLVED 2026-08-17 (Destin):** all three answers are the
> recommended defaults — C1: permission card unchanged; C2: relocate timestamp
> / stop-reason footer / metadata to the last RENDERED bubble; C3: a running
> tool's spinner remains visible content for the gate. Changes 1–3 are green-lit
> as specified.

**C1 — Permission-card context (recommended: no change — the card already
shows what's being approved).** The pop-out card renders the ToolCard, which
displays the tool name + the command/question plus the Yes / Always Allow / No
buttons — so after the bare bubble is removed, the user still knows what they
are approving. Recommended default: leave the card exactly as it is.
Alternative: add a one-line "Claude is waiting for your permission" context
header above the card for extra clarity.

**C2 — Turn timestamp / stop-reason footer / metadata while a permission ask
is open (recommended: relocate to the last RENDERED bubble).** These render on
the turn's LAST bubble. While an ask is open, the last bubble is the skipped
tools-only wrapper — so the turn's timestamp (and, for abnormal endings, the
stop-reason footer / metadata strip) would vanish for the whole ask, and be
lost forever if the turn ends while the ask is still open. Recommended: treat
skipped bubbles as invisible when finding "last," so these land on the last
bubble that actually rendered. Alternative: drop them for such turns (simplest;
they reappear when later content arrives).

**C3 — A running tool's spinner is content (recommended: yes — keep today's
behavior).** A tools-only bubble holding a still-RUNNING tool renders its
spinner card and must keep rendering: the spinner card is currently the ONLY
in-timeline progress indicator while a tool executes (the thinking indicator
deliberately suppresses itself while tools run — ChatView.tsx:905-909).
Recommended default: the gate treats a running tool as visible content.
Alternative: also skip running-only bubbles (hides tool progress — not
recommended).

---

## Change 1 — View layer: gate bubble render on actual rendered content (`AssistantTurnBubble.tsx`)

### Goal

A bubble with no text, no plan, no reasoning, AND no tool group that actually
renders content is **skipped entirely** — no wrapper, no timestamp, no empty
space. A bubble with any visible child (including a running tool's spinner
card, or a collapsed-reasoning disclosure row) still renders.

### Design

**1a. One gate, on the actual rendered content.** The gate must answer "does
this bubble have anything visibly rendered inside it?" — not "does its segment
list look non-empty?" A single exported pure function encodes the render rules
the bubble already applies (Skills are trailing-row content, not group content;
awaiting-approval tools render as pop-outs, not inline), so the gate and the
renderer cannot drift:

```ts
/**
 * Would AssistantTurnBubble visibly render ANYTHING inside this bubble?
 * Mirrors the render rules already in place: Skills render as a trailing
 * row (not group content), awaiting-approval tools render as pop-out cards
 * (not inline), and missing tool entries render nothing. Text, plan, and
 * reasoning are intrinsic. The gate skips a bubble when this is empty, so
 * "does it draw?" is answered by the same rules that draw it.
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

The predicate encodes exactly the rules already applied at the render site —
Skills are trailing-row content (collectTurnSkills), awaiting-approval tools
pop out (ChatView awaitingTools), `undefined` tools render nothing.

**1b. Gate each bubble on the predicate.** In the render loop (374-411):

```ts
if (!bubbleHasVisibleContent(bubble, toolGroups, toolCalls)) return null;
```

No other render-loop changes: `ToolGroupInline` stays exactly as it is (its
three `null` conditions already match the predicate), the `hasTools`/`toolsOnly`
padding and `isLastBubble` bookkeeping stay, and the timestamp / stop-reason
footer / metadata strip remain `isLastBubble`-gated — but now "last" means the
last bubble that ACTUALLY renders (see **C2**), because a skipped bubble is
invisible to the user AND to the timestamp/stop-reason logic.

Per **C2**, when skipping a bubble we must not leave the timestamp stranded.
Two sibling changes, both small:

- `isLastBubble` becomes `isLastRenderedBubble`: derive it after filtering out
  to-be-skipped bubbles, so timestamp / stop-reason / metadata land on the last
  bubble the user actually sees.
- The trailing-Skills row (`turnSkills`, line 416) has the same problem — if
  the turn's last bubble is a skipped tools-only wrapper, Skills currently
  never render anywhere (they only render on the last bubble). Gate it the same
  way: render the Skills row on the last RENDERED bubble, so skipped wrappers
  cannot strand Skill cards either.

C1 default (permission card unchanged) needs no code; C2 and C3 do, and both
are pinned by Change 3 tests.

### Why this covers every trigger

The predicate checks the **actual** renderable content, not the raw segment
list. So the same gate covers:

- awaiting-approval-only groups (the reported bug);
- Skill-only groups whose Skill state is unresolvable (`collectTurnSkills`
  returns empty AND `ToolGroupInline` filters the group → no tools render);
- missing/empty groups (replay/hydration/event-race transients — the group
  segment exists but its group/tool entries are absent);
- the permission-race synthetic tool (a `PERMISSION_REQUEST` that beats its
  `TRANSCRIPT_TOOL_USE` creates a synthetic tool entry — if it is
  `awaiting-approval` and lives in no group, the predicate sees no content and
  the bubble is skipped; only the pop-out card renders, which is correct).

Because the gate encodes exactly the render rules the bubble already applies,
they cannot drift: whatever the gate considers "content" is exactly what
renders.

### Non-goals

- Do NOT prune segments in the reducer for this (the reducer state is correct;
  the awaiting-approval tool must keep its group segment — the pop-out card's
  timeline placement is separate, but the group is still the tool's home).
- Do NOT reorder the timeline / merge bubbles — visual structure of `bubbles`
  is untouched; we only skip rendering empty members.

---

## Change 2 — Reducer guard: skip whitespace-only text/reasoning segments (`chat-reducer.ts`)

### Goal

Defense-in-depth: an empty text/reasoning segment can never enter a turn's
`segments`, closing the "future emitter sends empty content" class
(verified: CC path already strips at `transcript-watcher.ts:156-165, 202-213`;
native path already guards at `harness-session.ts:2197-2219` — the reducer
guard makes the invariant hold even if a new emitter forgets).

### Design

The guard MUST sit at the very top of each case — ABOVE the
`getOrCreateTurn(session)` call. That placement is what makes "no empty turn
is created" hold (returning early before `getOrCreateTurn` means a
whitespace-only delta can never create or extend a turn). It also sits below
the `seenUuids` dedup check (981-991), so a whitespace-only line is dropped
BEFORE it is recorded — a later legitimate copy of the same uuid is still
processed, which is exactly what we want (an empty line should never block a
real line on replay).

At the top of the `TRANSCRIPT_ASSISTANT_TEXT` case (981-1038) and the
`TRANSCRIPT_ASSISTANT_REASONING` case (1044-1080), before any segment mutation:

```ts
// Skip whitespace-only deltas — a rendered bubble must have visible content.
// Matches the upstream guards (transcript-watcher stripSystemTags,
// harness-session's `if (!t) break`). A whitespace delta adds nothing to an
// existing segment either, so the early return is safe on both the CC
// whole-block path and the native partId-merge path.
if (!action.text || !action.text.trim()) return state;
```

- `return state` (no new object): the dedup bookkeeping in the shared wrapper
  (seenUuids etc.) is not updated — harmless, because an empty line carries no
  state; repeated empty lines are no-ops. Keeps `lastActivityAt`/`lastOutputAt`
  untouched (no visible output arrived).
- The partId-merge branch (1004-1006 / 1053-1060) is never reached with empty
  text after this guard — a `""` delta that would have been a no-op append is
  now a no-op skip. Same result, one less path.

### Why both changes

Change 1 is the actual fix (renders never produce a bare wrapper regardless of
state). Change 2 is cheap insurance against the empty-text path producing one
*via the text branch* — including from a future emitter or a replay path that
bypasses the two upstream guards.

---

## Change 3 — Tests

### `AssistantTurnBubble.test.tsx` (pin the bug + the gate)

Reuse the existing fixture helpers (`makeTurn`, `bashTool`, `skillTool`).

- **Pin the bug:** a turn with a single tool-group segment whose tool is
  `awaiting-approval` renders **no `.assistant-bubble`** and no
  `.bubble-timestamp` (assert the bubble container is empty / the wrapper is
  absent).
- **Text + awaiting-approval group:** the text still renders (group filtered,
  wrapper kept — it has content). Assert the text is present and no bare
  bubble is added.
- **Tools-only + `running` tool (C3):** still renders a ToolCard (spinner is
  content).
- **Tools-only + only Skills with no resolvable Skill state:** no bare wrapper
  (group renders nothing AND trailing-skills row is empty).
- **Mixed group (running + awaiting-approval):** renders the running tool only.
- **Gate/renderer agreement:** for each fixture, assert the gate decision
  (`bubbleHasVisibleContent(...)`) equals what actually rendered — pins the
  single-source-of-truth property.
- **C2 — timestamp relocation:** a turn whose ONLY content is a skipped
  tools-only wrapper (e.g. text followed by an awaiting-approval group) still
  shows the turn's timestamp on the last RENDERED (text) bubble, and the
  stop-reason footer / metadata strip likewise land on the last rendered
  bubble. Pins that skipping never strands or silently drops them.
- **C2 — Skills relocation:** a turn whose last bubble is a skipped
  tools-only wrapper still renders its trailing Skills row on the last
  rendered bubble (not stranded).
- **Mid-turn awaiting-approval group (no Skills):** an awaiting-approval
  group with text/plan AFTER it — the group's bubble is skipped, later text
  renders normally, no empty space and no orphaned skills.
- **Permission-race synthetic tool:** a tool entry with no group, status
  `awaiting-approval` — the timeline renders no bare bubble (only the pop-out
  card is responsible).

### `chat-reducer.test.ts` (the guard)

- `TRANSCRIPT_ASSISTANT_TEXT` with whitespace-only content appends **no**
  segment (turn's `segments` unchanged, no new turn created if none existed).
- `TRANSCRIPT_ASSISTANT_REASONING` with whitespace-only content appends no
  segment.
- A real (non-whitespace) delta still appends/merges normally (no regression).
- Guard-below-dedup: a whitespace-only line with a uuid does NOT consume the
  uuid in `seenUuids` — a later legit copy of the same uuid still processes.
- Guard-above-turn: the guard fires before `getOrCreateTurn`, so an
  empty-session id + whitespace-only delta creates no turn at all.

---

## Delivery order

1. **Checkpoint:** Destin confirms C1–C3 answers before Change 1 is built
   (they are cheap to flip, but the defaults need a decision — two of them,
   C2 and C3, are baked into Change 3 tests).
2. Single change set — **Changes 1 + 2 + 3 ship together** (they are one
   invariant enforced at two layers, and the tests pin both). No chunking; the
   blast radius is one component file, one reducer file, and two test files.

## Verification

1. `cd youcoded/desktop && bash scripts/verify.sh <worktree>` — tsc, vitest
   (new + affected tests), knip, eslint, ast-grep invariant scan.
2. Visual check in a dev instance (`bash scripts/run-dev.sh --label "Bare bubble fix"`):
   drive a tool to `awaiting-approval` and confirm the bare bubble is gone while
   the permission card remains — and, per C2, the turn's timestamp now sits on
   the last RENDERED bubble, not on a skipped wrapper. The workbench fixture
   loader (`fixture-loader.ts:168-197`) already synthesizes the exact
   `PERMISSION_REQUEST` action for this; the compare registry
   (`dev/workbench/compare/registry.tsx:1785+`) has awaiting-approval ToolCard
   shells if a workbench visual is preferred. One-shot workbench screenshots
   are scriptable; anything interactive (hovering the pop-out, watching the
   card while approving) goes to Destin.
3. Confirm the buddy mirror (`buddy/BubbleFeed.tsx:396` renders the same
   `AssistantTurnBubble`) shows the same behavior — it is covered by the same
   component, no separate change. (Buddy's OWN user-message path is the one
   gap — see Out of scope below.)

## Out of scope (recorded for later)

- **`UserMessage`** — the same unconditional-timestamp shape exists
  (`UserMessage.tsx:70-80`), but its body cannot currently be empty: InputBar's
  send gate disables submission when there is no text AND no attachments
  (`InputBar.tsx:839`), and attachment pills always render. Not reachable
  today; if a host-injected or replay user message with empty content ever
  becomes possible, apply the same gate there.
- **Buddy's OWN user-message path** — `BubbleFeed.tsx:388-389` renders
  `UserMessage` → `SpecialistReportCard` for host-injected turns; an injected
  report card with empty content would be the buddy's own bare timestamp
  bubble, one window away from the main fix. Not reachable today (injected
  cards always carry report content); apply the same gate there if an
  empty-injection path ever appears.
- **The `bubbles` array structure** (`splitIntoBubbles`) — unchanged; the turn's
  visual structure still reflects its segments. We only skip rendering empty
  members.
- **Reducer segment-pruning of the awaiting-approval group** — deliberately NOT
  done; the group segment is the tool's correct home and the pop-out card's
  placement is independent.
- **Hook/emit-side guards** — `transcript-watcher.ts` and `harness-session.ts`
  already strip/guard empty content; no change needed there.
