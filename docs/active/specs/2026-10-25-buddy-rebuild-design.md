---
status: active
date: 2026-10-25
decisions: docs/active/design/2026-10-25-buddy-rebuild/buddy-rebuild.questions.answers.json
---

# Buddy rebuild — technical design

Destin's answers (`buddy-rebuild-questions`): Q-2 small main chat, tuned to the small window
(less spacing, more visible text); S-1 dots match the main window exactly; S-2 one shared
connection; Q-3 all four abilities (cards may look smaller in the buddy before they are
expanded); Q-4 the main window's session menu, narrowed; Q-5 button placement shown visually;
Q-6 two sizes; Q-7 all four kinds of smoothness; Q-8 all three card-85 items; Q-9 route
"somewhere between": one review round, stay tight.

Route chosen from Q-9: questions → build the renderer in the workbench → ONE review deck
(before/after + Q-5 choice) → contract → build the rest → one code review + one UX run →
acceptance deck. No pre-deck UX tester, one design-review round at most.

## 1. Chat window = the main chat, hosted

`BuddyChat` stops composing its own feed. It hosts the real pieces the main window uses:

| Today (buddy-only) | After |
|---|---|
| `BubbleFeed` | `ChatView` with `compact` (no drawer, no game pane, no preview listener) inside an `ArtifactProvider` of its own |
| `CompactToolStrip` (Allow/Deny only, wrong dot colours) | ChatView's own bottom `ToolCard`s: permission, question and plan cards |
| `AttentionStrip` (text pill) | ChatView's `AttentionBanner` with its buttons |
| `SessionPill` + own list | the main window's `SessionStrip` in the buddy header (packs to the room it has; the All sessions menu narrows to the window) |
| `InputBar compact` with no blocked-send path | `InputBar compact` + `useBlockedSend` (card 85a: refuses into a menu, offers Send anyway) |

`BubbleFeed`, `CompactToolStrip`, `AttentionStrip`, `SessionPill` are deleted once nothing
imports them (knip is the authority).

**Compact density** is CSS only, scoped to `html[data-mode="buddy-chat"]`: tighter bubble
padding, narrower side gutters, smaller gaps between entries, wider max bubble width, tool
groups and skill cards collapsed to one line until pressed. The main window is untouched.

**No remount on show.** `BuddyChatApp` keys the whole tree on every show (`replayKey`), so
every open re-fills the conversation. The enter/exit animation moves to the panel's class only;
the tree stays mounted while the window is hidden, and is idle while hidden (performance rule 2:
its chat read paused, the panel `hidden`).

## 2. One connection

- The buddy follows a session the way a torn-off window does: `session:open` fills it and
  registers it as a watcher, so live pushes AND newly raised asks (`hook-window-route.ts`)
  reach it. `buddy:subscribe` / `buddy:unsubscribe` and the churn effect go; `buddy:set-session`
  stays only as "which session the buddy shows" (persisted choice).
- Status dots: the buddy pulls `attention:get-summary` on mount (today it only listens, so it
  shows grey until something changes) and renders the main window's `SessionDot`/`StatusPill`
  through SessionStrip. "Response ready" is judged for the buddy as a viewer: a session the
  buddy is showing is seen.

## 3. Window and buttons

- Two sizes: `CHAT_SIZE` (320×480) and a large size; a header button toggles; main re-runs
  `computeGroupLayout` with the new size (the group rule: never clamp a buddy window
  independently). Remembered in the buddy settings.
- Q-5 alternatives shown visually on the deck: buttons in the chat header (bar window
  deleted), kept beside him, or screenshot beside attach + a small menu.

## 4. Motion

- Chat open/close: grows from the mascot's side (transform-origin at the mascot), ~180 ms in,
  ~120 ms out; transform/opacity only.
- Mascot breathing gets `steps()` like every other infinite animation (performance rule 6).
- Reactions follow the same colour the dots show for the session the buddy is watching:
  green → a "working" pose, blue → a short "happy" beat once, red/amber → today's attention
  bounce. Idle moments (card 85c): glance/stretch after a quiet while, the approved `sleep`
  pose after a few quiet minutes, woken by any status change; never while red/amber/blue.
- Drag: verify on the dev instance; no window-bounds animation beyond the edge glide.

## Tests

Pins to add: buddy dot = main dot for every status (one source), buddy renders ChatView's
question card for AskUserQuestion, buddy does not remount on show, blocked-send in buddy,
attention pull on mount, mascot reaction table. Existing buddy-window-manager and geometry
tests must stay green.
