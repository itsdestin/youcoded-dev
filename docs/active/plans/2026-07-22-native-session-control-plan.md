---
status: active
created: 2026-07-22
supersedes-roadmap-entries: [native-runtime-interruption-queueing, guardedptysend-silent-discard]
---

# Native Session Control Plan — send queueing, honest sends, stop affordance

## Goal

A user in a native (YouCoded-runtime) session should not be able to tell the difference from a Claude Code session in day-to-day chat mechanics: sending while a response streams **queues** the message; stopping a response is a **visible affordance** on every platform; and every button either works, is hidden, or says honestly that it isn't available yet. Nothing silently fakes success.

This is the *control* half of full CC/native parity (Destin's stated north star, 2026-07-22). The *sync* half is `2026-07-22-native-sync-parity-plan.md`. The *ecosystem* half (native `/clear`, `/compact`, skills) is deliberately a separate future workstream — see the ROADMAP Features entry.

## Decisions (Destin, 2026-07-22)

- **Send during a live native turn: QUEUE.** Buffer and drain in order when the turn completes — matches CC's type-ahead feel.
- **CC-only affordances are hidden for native sessions:** the StatusBar `/sync` action and the Preferences "Advanced" `/config` flow control Claude Code itself and have no native meaning.
- **Future-parity commands** (`/clear`, `/compact`, drawer commands) show the honest *"…isn't available for YouCoded-runtime sessions yet"* message (the wording InputBar's typed path already uses) until the ecosystem-parity workstream builds native equivalents. Building those equivalents is explicitly OUT of this plan.
- **Drawer skills that are plain text prompts** route through the provider-aware send and genuinely work in native sessions — this is a routing fix, not new capability.

## Verified current state (master `b832e299`, 2026-07-22)

- `guardedPtySend` (`App.tsx:520-524`) calls `window.claude.session.sendInput` and returns `true` unconditionally — it only consults the pending-prompt gate, never the send result.
- `SessionManager.sendInput` (`session-manager.ts:248-253`) returns `false` for any worker-less session — every native session, and any destroyed/unknown id. The return value dies at `guardedPtySend`.
- `nativeHost.send` (`native-session-host.ts:373`) returns `false` while a turn is in flight (`HarnessSession.send` hard-throws on re-entrancy; the host swallows it). Both callers discard the promise (`void nativeHost.send(...)` at `ipc-handlers.ts:2081` and in `remote-server.ts`). InputBar dispatches the optimistic USER_PROMPT bubble *before* sending, so an overlapping native send silently drops, leaving a phantom bubble that never confirms. **No queue exists anywhere.**
- Native interrupt EXISTS and works: `NativeSessionHost.interrupt()` (`native-session-host.ts:384`) cancels pending permission asks then aborts the stream; wired via `NATIVE_INTERRUPT` (`ipc-handlers.ts:2084`) to the ESC handler's native branch (`App.tsx:2305`) and the remote shim. **ESC is the only affordance** — there is no stop button, so touch/phone-remote users cannot interrupt a native turn. (The old roadmap claim that interrupt was a no-op cited `interrupt-worker.ts`, a file that has never existed.)

### guardedPtySend caller audit (all 9 sites, from the 2026-07-22 verification)

| Site | Sends | Native today | Fix in this plan |
|---|---|---|---|
| `App.tsx:1792` cycleModel | `/model <alias>` | Already gated (`supportsAliasCycling`, #185) | none |
| `App.tsx:3035` picker onSelectModel | `/model <alias>` | Unreachable — popup renders a separate native branch (`native.setBinding`) | none |
| `App.tsx:3045` sendPtyCommand | `/fast`, `/effort` | Unreachable — CC branch only | none |
| `App.tsx:2003` command drawer | `<command>\r` + optimistic bubble | Phantom bubble, nothing runs | honest "not yet" toast |
| `App.tsx:2059` skill drawer (text prompt) | prompt + `\r` + bubble | Phantom bubble — bypasses `sendChatMessage`, which is one file away and correct | route via `sendChatMessage` → **works** |
| `App.tsx:1991,2044` drawer `alsoSendToPty` | `/clear`, `/compact` side-sends | Reducer effects fire but command never runs — `/clear` clears the visible timeline while native context is untouched; `/compact` strands `compactionPending` until the 180s watchdog | honest toast, no reducer side-effects for native |
| `App.tsx:2782` StatusBar onDispatch | `/compact`, `/clear` | Same divergence as above | same |
| `App.tsx:2745` StatusBar onRunSync | `/sync\r` + bubble | Phantom `/sync` bubble | hide for native |
| `App.tsx:2962` SettingsPanel→ThemeScreen | theme prompt + `\r` | Silently dropped, no bubble at all | route via provider-aware send (it's a plain prompt — same fix as skills) |
| `App.tsx:3019` PreferencesPopup Advanced | view→terminal + `/config\r` | Switches a native session to terminal view AND drops the command | hide for native |

All 9 sites are equally silently dead for destroyed/unknown session ids on any provider.

## Phases

### Phase 1 — Honest send helper + surface fixes (small, independent, ship first)

1. `guardedPtySend` consults the session's `provider` and existence from renderer session state and returns `false` for native/unknown ids **without IPC changes** — the raw PTY keystroke path stays fire-and-forget (terminal-view perf; converting `SESSION_INPUT` to invoke would put an IPC round-trip on every keystroke). Every `if (!guardedPtySend(...)) return;` failure branch becomes reachable for the first time: audit each one — skip the optimistic writes (already the pattern), and toast where the action was user-initiated.
2. Skill drawer + ThemeScreen sends route through `sendChatMessage` (the provider-aware helper InputBar's typed path already uses). Plain text prompts work in native sessions immediately.
3. Hide `/sync` and `/config` Advanced for native sessions. Drawer commands and StatusBar-dispatched `/clear`/`/compact` show the honest "not yet" toast for native — and must NOT fire their reducer side-effects (`CLEAR_TIMELINE`, `COMPACTION_PENDING`) when the command can't run.

### Phase 2 — Native send queue (main process)

1. Per-session FIFO inside `NativeSessionHost.send`: turn in flight → enqueue; drain sequentially on turn end. Bounded (suggest 10) with honest refusal past the cap.
2. `NATIVE_SEND` becomes an invoke returning `{ status: 'sent' | 'queued' | 'failed', reason? }` so the renderer can mark the bubble "queued"; the existing exact-content transcript dedup confirms delivery and clears the marker. Update BOTH callers (`ipc-handlers.ts` and `remote-server.ts`) — the remote path must carry the same ack shape through the shim.
3. Define + pin interrupt-vs-queue semantics. Recommendation: interrupt aborts the current turn only; queued messages still send next (matches CC ESC feel). Revisit after dogfood.

### Phase 3 — Stop affordance

Visible stop control while a turn is streaming, both providers: CC → ESC byte to the PTY; native → `native.interrupt`. This gives touch and phone-remote users interrupt capability for the first time. Placement/appearance is Destin's visual call — flag for his eyeball review per the workspace verification rule; don't build a CDP rig for it.

## Tests

- Queue: send-during-turn queues; drains in order; cap refusal; interrupt/queue policy pinned.
- `guardedPtySend`: returns false for native + unknown ids; per-caller failure branches skip optimistic writes (extend the pattern `model-chip.ts` pinned).
- Drawer skill + ThemeScreen native routing: `sendChatMessage` called, no PTY write, no phantom bubble.
- Gating: `/sync`/`/config` affordances absent for native; `/clear`/`/compact` paths toast without reducer side-effects.
- Stop control dispatches the right interrupt per provider.

## Risks / notes

- The renderer-side provider check in Phase 1 duplicates truth main holds, but `SessionInfo.provider` is push-updated and immutable per session — acceptable. The queue path (Phase 2) is where real async acks matter, and it gets them.
- Interaction with the pending-prompt gate: the gate is PTY-only and already skipped for native in InputBar — keep it that way in `guardedPtySend`'s native branch (refusal reason should be "native", not "prompt pending").
- Android's native provider is desktop-only today; the shared web UI picks up Phases 1–3 automatically wherever native sessions appear.

## Out of scope

Native `/clear`/`/compact`/skills (ecosystem-parity workstream); sync parity (sibling plan); local-model stall messaging (own ROADMAP entry).
