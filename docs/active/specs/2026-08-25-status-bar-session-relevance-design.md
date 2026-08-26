---
status: draft
created: 2026-08-25
updated: 2026-08-26
tags: [renderer, native-runtime, ux, status-bar]
---

# Status bar: numbers that are true, and that say what they count

## 1. The problem

The status bar shows 22 things. In a native session (a local model, or one reached
through OpenRouter or a direct API key) several of them are wrong — but not all in the
same way, and the differences decide the fix.

| Class | Chips | What's actually wrong |
|---|---|---|
| **Says something false** | Code Changes | Renders **"No changes"** after the model has rewritten twenty files. Not blank — false |
| **A control that can't act** | Fast mode | A Claude Code toggle read from the app-wide `~/.claude/youcoded-model-modes.json`. Leave it on and it renders over native sessions, where nothing honours it |
| **Missing where it matters most** | Session Cost | `--` forever. Backwards: a native session on OpenRouter spends real money per token; a Claude Code session on a subscription does not |
| **Blank** | Session Duration, Active Ratio | `--` forever. Ugly, not dishonest |
| **True, but about your subscription** | 5h Usage, 7d Usage | Correct numbers about your Claude **subscription** limits — which a native session neither consumes nor is constrained by |

Two further defects, found while verifying the above, are in scope because they are the
same disease:

- **In / Out / Cached / Reuse mean two different things under one label.** For a Claude
  Code session they are session totals. For a native session they are **the most recent
  completed turn only** — `useNativeSessionUsage` walks backward to the last turn carrying
  usage and returns that one turn. Same chip, same label, two measurements.
- **Nothing counts what a specialist did.** Specialist (subagent) token spend is already
  summed per run in `runSpecialist` (`native-session-host.ts:1619`, `SpecialistRunResult.usage`)
  and then **discarded** — no consumer. Specialist file edits live in
  `toolCall.subagentSegments`, not `session.toolCalls`, so any count over the latter misses
  them. Delegating heavy work would make every number go *down*.

The `/usage` card in chat has the same defects one layer over: `getUsageSnapshot`
(`App.tsx:2071`) reads only `statusData.sessionStatsMap`, so a native session gets a card
whose every session field is `--`.

## 2. The contract: what a number counts

This is the centre of the change. Every session-scoped number in the bar and in `/usage`
obeys one sentence, and says it in its tooltip:

> **Everything this session has done since you opened it — including work done by
> specialists.**

Three consequences, all stated to the user rather than hidden:

1. **Specialists are included**, in tokens, cost and code changes alike. A parent session
   is credited with what it delegated.
2. **Input tokens are counted per request.** A long turn re-sends its history on every
   step, and each send is counted, because that is what the provider bills. The number is
   "what you were charged for", not "how much you typed". (Context % is unaffected — it
   runs on a different measurement, `contextUsedTokens`, which deliberately does *not*
   re-count history.)
3. **Resuming a session restarts nothing that is on disk, and restarts everything that
   isn't.** Totals are derived from the session's own recorded events, which are replayed
   on resume — so a resumed session shows the same totals it showed before, provided the
   replay carries them. Verified so far: `turn-complete` (with its usage payload) and
   `tool-result` (with its `structuredPatch`) are both persisted and both flow through the
   same renderer handler on replay as when live. **Task 0 of the plan confirms this
   end-to-end**; if any piece turns out not to survive, the tooltip says so plainly rather
   than the chip quietly showing a smaller number.

## 3. Two mechanical rules, not a taxonomy

The draft of this spec sorted sessions into three "kinds" and gave every widget a
per-kind relevance table. That is more machinery than the problem needs, and it invented
its own edge cases (a chip flickering into view while a session's provider type resolves).
Two rules do the same job:

**Rule 1 — a chip with no value hides, instead of printing `--` or "No changes."**
This is already how Git Branch behaves (`show('git-branch') && gitBranch`), so it is the
house pattern rather than a new invention. It retires Duration, Active Ratio and Speed in
native sessions without anyone deciding they are "irrelevant", and it stays correct for
runtimes that don't exist yet.

**Rule 2 — what belongs to the other runtime does not render.**
One plain runtime gate, `provider === 'claude'`, on the three Claude-Code-only items: the
**5h Usage** and **7d Usage** chips, and the **Fast mode** chip. The first two describe a
subscription a native session neither spends nor is limited by; the third is a toggle
nothing in a native session honours. Fast mode is a fixed control rather than a registry
widget, so it takes the gate directly.

The `SessionProvider` runtime (`'claude' | 'native'`) is known the instant a session
exists and is never absent, so Rule 2 can never flicker. Provider type
(`local-engine`, `openrouter`, `anthropic`, …) is resolved asynchronously and is needed in
exactly one place — pricing — where a missing answer already means "no price, no chip".

**The cost of hiding 5h and 7d is real and is accepted, not mitigated.** Flipping to a
local model *because* you are near your 5-hour limit removes the number you were watching,
at the moment you were watching it. Two things carry that weight instead: `/usage` shows
the subscription bars in **every** session (§10), and the Customize menu says why the chips
are gone rather than leaving you to wonder (§9). That is the whole mitigation; the trade is
deliberate.

## 4. What each chip does, after this change

| Chip | Claude Code session | Native session |
|---|---|---|
| 5h Usage / 7d Usage | Shown | Hidden by Rule 2 — see `/usage` (§10) |
| Session Cost | Shown (Claude Code's own figure) | **Newly working** — shown whenever any counted work had a known price |
| Code Changes | Claude Code's statusline count | **Newly working** — derived, includes specialists |
| In / Out / Cached / Reuse | Session totals (Claude Code's) | **Session totals**, including specialists — no longer last-turn-only |
| Context % | Shown | Shown (unchanged) |
| Session Duration, Active Ratio | Shown | Hidden by Rule 1 (no data) |
| Speed | Shown | Shown when the last turn reported it |
| Git Branch | Shown | Already invisible today (no feed) — unchanged by this work |
| Fast mode | Shown | Hidden by Rule 2 |
| Model, Permission, Tags, Open Tasks, Sync, Theme, Version, Announcement | Shown | Shown |

**Git Branch is not a relevance decision.** It is missing because nothing feeds it, not
because a native coder session doesn't need it. It is tracked as its own ROADMAP item under
`## Features` (added 2026-08-25). This spec does not dim it, does not explain it away in
the Customize menu, and does not claim it is "Claude Code only" — that sentence would be
false, which is the exact error this document exists to remove.

## 5. Session Cost

**Priced per turn, at the model that ran that turn.** A session can change models
mid-flight (`NATIVE_SET_BINDING`), and a specialist can run on a different model from its
parent (`specialists/delegated-models.ts`). So a price is attached to each turn as it
completes, and to each specialist run as it finishes — never applied retroactively to
already-counted work.

**Cache rates are carried through, so the number is not knowingly high.** The draft
apologised in a tooltip for over-reporting, on the grounds that the price list has only one
input rate. It doesn't: the catalog payload carries `input_cache_read`, `input_cache_write`
and per-model `overrides` (documented at `harness/eval/estimate.ts:389`). What drops them is
the app's own copy — `CatalogModel.pricing` keeps only `{ in, out }`
(`shared/provider-types.ts:38`), populated in `providers/model-catalog.ts`. Every turn
already reports `cacheReadTokens` and `cacheCreationTokens` (`chat-types.ts:50`). Carrying
two more rates through the catalog mapper turns an apology into an accurate figure.

**It is still an estimate, and the tooltip says why in one line:** per-model price
overrides (some models cost more above a very large prompt) are not modelled, and providers
round. Expected to be right to within a few percent — the plan measures the real gap once
against a provider dashboard before this ships (§12).

**The chip renders when any counted work had a known price** — not "when the session's own
model is metered". This matters: a **local, free parent session that delegates to an
OpenRouter specialist is spending real money**, and the draft's local-model rule would have
hidden it. If some work was priced and some wasn't, the chip shows the priced total and the
tooltip says work with no published price is excluded.

**Never `$0.00` for "unknown".** A model with no published price (a custom
`openai-compatible` endpoint) contributes nothing and, if it is all there is, produces no
chip. A false zero is worse than a blank (`docs/error-message-standards.md`).

## 6. Tokens

In / Out / Cached / Reuse become **session totals** in native sessions, matching what the
same chips already mean in a Claude Code session, and including specialist spend. This
removes the worst remaining defect in the bar: two identical-looking chips that measure
different things depending on which runtime you happen to be in.

The tooltip states the contract from §2 — session-so-far, specialists included, input
counted per request.

## 7. Code Changes

No new backend work. Every native `Edit` and `Write` already returns a `structuredPatch`
(`tools/edit.ts`, `tools/write.ts:75`), the harness emits it on the `tool-result` event
(`harness-session.ts:1889`), the reducer stores it on the tool call
(`chat-reducer.ts:1324-1335`) to draw the diff in tool cards, and hunk lines are prefixed
`' '` / `'-'` / `'+'` by construction.

**The count walks two places, not one:** `session.toolCalls[].structuredPatch` *and*
`session.toolCalls[].subagentSegments[].structuredPatch` (`chat-reducer.ts:437-444`), which
is where both native specialists and Claude Code subagents put their tool results. Counting
only the first would miss every edit a specialist made — i.e. undercount hardest on the
biggest sessions.

**Claude Code sessions keep the statusline number.** It is Claude Code's own count and
covers edits made through any path, including shell commands. The derived count covers what
the Edit and Write tools did — a model that rewrites a file with `sed` or `git apply`
contributes nothing to it. Each runtime keeps the most complete number available to it.
They may disagree for identical work; they are not comparable across runtimes, and the
native tooltip says the count covers edits made through the model's editing tools.

## 8. Where the numbers come from

**One source, one summation, no new persistent state.** Every total is derived in the
renderer from the session record it already holds:

- **Per-turn usage and cost** ride the existing `turn-complete` payload, which already
  carries `tokensPerSecond`, `contextLength` and `contextUsedTokens`. Cost is computed in
  main, where the binding is known — `pricingFor(binding)` joins the family of injected
  per-binding resolvers `NativeSessionHost` already takes (`contextAndSlotsFor`,
  `providerTypeFor`, `visionSupportFor`).
- **Specialist usage and cost** arrive as **one new display-safe event on the parent's own
  stream**, emitted when a specialist run finishes, carrying the child's summed usage, its
  cost, its model, and the parent Task tool call it belongs to. The data already exists and
  is currently thrown away (§1). It must be a new event type rather than a forwarded child
  `turn-complete`: `SUBAGENT_DISPLAY_TYPES` (`native-session-host.ts:112`) deliberately
  excludes a child's `turn-complete`, because a stamped one would end the *parent's* turn in
  the reducer and misattribute the child's model. It is persisted on the parent, so replay
  restores it like any other card content — and a **background** specialist, which finishes
  outside any parent turn, delivers its numbers the moment it is done.
- **Code changes** are derived from stored patches (§7), the same shape as the existing
  `buildTasksById` derivation that already feeds the Open Tasks chip off `session.toolCalls`.

Because all three come from the replayed record, they agree with each other and behave
identically on resume — rather than cost living in harness memory while the others live in
the renderer, which is how the three would drift apart.

**No new IPC channel.** One new transcript event type on an existing stream; no
`SessionService.kt` work.

## 9. The Customize Status Bar menu

The menu lists 19 registry widgets. Under §3's rules only three ever need explaining
away, and the 5h/7d line is the one that matters — it is where someone goes to find out
where their limit numbers went:

| Situation | Reason line |
|---|---|
| 5h / 7d Usage in a native session | *Claude Code sessions only — see /usage* |
| Duration / Active Ratio in a native session | *Not measured in this kind of session yet* |
| Session Cost when no counted work had a published price | *No published price for this model* |

Rows stay in the list, dimmed, with the reason where the checkbox would be. The user's
on/off choice is untouched and returns the moment they switch to a session where the widget
applies, so the menu never contradicts the bar. `WidgetConfigPopup` takes no session context
today and needs the same value the bar reads, from one place, so the two cannot disagree.

Note that Model and Permission are **not** registry widgets — if either ever needs gating it
takes a plain runtime gate like Fast mode, not an entry here.

## 10. The `/usage` card

**`/usage` is the escape hatch for the numbers the bar now hides**, so it keeps showing the
Claude subscription bars in **every** session — that is the point of it — labelled as
account-wide rather than session-scoped, so the card can't recreate the confusion the bar is
shedding. If this card is broken in native sessions, hiding the chips is indefensible; the
two ship together.

`getUsageSnapshot` gains the same native sources as the chips (tokens, cache, context, cost,
code changes) — otherwise the card is a page of `--` in exactly the sessions it matters for.
A row that a session genuinely cannot fill is omitted rather than rendered empty. The §2
contract sentence appears once on the card.

## 11. Surfaces

One React component covers desktop, the remote browser, and Android — verified: the Android
app renders the shared web UI and has no separate status bar (its `statusBarsPadding()` refs
are OS window insets). No IPC channel is added, so the five-surface parity checklist does not
apply.

## 12. Checkpoints

**Design gate — before any main-process work.** Build the bar and the Customize menu in the
UI Workbench and produce theme sheets for Destin's sign-off:

1. Claude Code session (5h/7d and Fast chip present) — the reference shot
2. Native session on a local model, **side by side with (1)** — 5h, 7d and Fast gone, no cost, no Duration/Active Ratio. This pair is the one to look hardest at: it is the moment a user notices the bar shortened
3. Native session on a metered model with a price (cost present, tooltip visible)
4. Native session where no counted work had a price (no cost chip)
5. Local parent session that delegated to a metered specialist (cost present — the case
   §5 exists for)
6. The Customize menu in a native session, with its three reason lines
7. The `/usage` card in a native session, showing the subscription bars the bar dropped
8. Every tooltip's exact wording — this is user-facing prose, currently decided in a table

Backend work starts after sign-off.

**Numbers gate — before Cost ships.** Run one real metered session, compare the chip's total
against the provider's own dashboard, and state the measured gap in the tooltip. Ship the
chip only if it lands inside a tolerance Destin accepts. A cost chip that is wrong is worse
than no cost chip.

## 13. Guards

| Claim | Guard |
|---|---|
| A chip with no value renders nothing — never `--`, never "No changes" | New `statusbar-session-relevance.test.tsx` |
| The Fast chip renders only in a Claude Code session | Same |
| 5h / 7d render only in a Claude Code session | Same |
| `/usage` shows the subscription bars in **both** runtimes | `usage-card` test — the escape hatch cannot regress |
| Token totals are cumulative across turns in a native session | New unit test on the derivation |
| Token totals include a specialist run's reported usage | Same |
| Code Changes counts `+`/`-` lines from stored hunks, ignores context lines | Same |
| Code Changes includes patches from `subagentSegments` | Same — the specialist-undercount regression test |
| A turn is priced at the model in force for that turn, across a mid-session swap | New unit test on pricing |
| A specialist is priced at its own model, not its parent's | Same |
| A local parent that delegated to a metered specialist shows a cost | Same |
| No counted work with a published price → no Cost chip, never `$0.00` | Same |
| A resumed session reports the same totals it showed before resuming | New replay test |
| The bar and the Customize menu never disagree about a widget | Both derive from one exported helper; test asserts the menu's dimmed set equals the bar's hidden set |

## 14. What the user will experience — including what they won't like

1. **The bar shortens when you switch to a native session, and it will read as a bug the
   first time.** On a default install that is two chips — 5h and 7d — plus the Fast chip if
   it was on; everything to their right slides left. Users who opted into Duration or Active
   Ratio lose those too. This is intended, and it is the single most noticeable thing about
   the change.
2. **Your Claude budget number disappears exactly when you act on it.** Switching to a local
   model because you are near your limit takes away the number that prompted the switch.
   `/usage` still has it and the Customize menu says why — a real cost of the decision, not
   a mitigated one (§3).
3. **Numbers that were `--` start showing real values**, which will read as "new stuff
   appeared" the first time.
4. **In / Out jump upward in native sessions** — they now cover the whole session, not the
   last turn, and include specialists. Anyone who had internalised the old number will see a
   bigger one for the same work. The tooltip explains it; the chip does not.
5. **Cost is an estimate**, right to within a few percent, not to the cent (§5).
6. **Code-change counts differ between runtimes for the same work** (§7).
7. **The Customize menu looks busier in native sessions** — three rows dimmed with reasons.
8. **Git Branch stays missing in native sessions** — tracked, deliberately not touched here.

## 15. Out of scope

- **Git Branch for native sessions.** ROADMAP `## Features`, added 2026-08-25, with the
  verified mechanism and the cheap path (the app already reads branches via
  `git:file-status`; the `.git` watcher for live updates already ships).
- **Making Session Duration and Active Ratio work in native sessions.** The harness does not
  report turn wall-time; both are off by default and Rule 1 now hides them cleanly rather
  than showing `--`.
- **Slash-command and QuickChips relevance.** Verified: neither `CommandDrawer` nor
  `QuickChips` filters by provider, so Claude-Code-only commands are offered in native
  sessions. Same class of problem, different surface, its own decision.
- **Lifetime cost across resumes.** Totals cover the recorded session; nothing sums a
  conversation's whole history across separate runs.

## 16. Changed from the 2026-08-25 draft

For review — every substantive difference, so nothing lands unnoticed:

1. **5h / 7d hiding is retained from the draft**, confirmed by Destin 2026-08-26 after a
   relabel-instead alternative was raised and rejected. The trade it makes is now written
   down explicitly (§3, §14) rather than assumed.
2. **The three-kind session taxonomy is gone**, replaced by two mechanical rules (§3). Its
   only remaining consumer, pricing, already handles "unknown" correctly.
3. **Specialist work is counted** in tokens, cost and code changes (§2, §6, §7, §8) — at
   Destin's direction, and because the data already exists and was being discarded.
4. **Native token chips become cumulative** (§6). The draft flagged this as an open question
   and deferred it; including specialists in a last-turn-only number would have been
   incoherent, so it is now in scope.
5. **Cost models cache rates** instead of shipping a knowingly-high figure with an apology
   (§5) — the draft's stated reason for the inaccuracy was wrong about the price list.
6. **Cost appears whenever priced work happened**, including a free local session that
   delegated to a paid specialist (§5). The draft would have hidden real spend.
7. **Cost is priced per turn and per specialist**, at the model that actually ran (§5). The
   draft left a mid-session model swap undefined.
8. **All totals derive from the replayed session record** (§8), so they agree with each other
   and survive resume together, instead of cost living in harness memory.
9. **Git Branch is left entirely alone** (§4). The draft dimmed it with the reason "Claude
   Code sessions only", which is false, and it is already invisible today anyway.
10. **Design and numbers checkpoints added** (§12) — the draft had none.
11. **Corrections:** the registry holds 19 widgets, not 18; Model and Permission are not
    registry widgets; the draft's "up to six chips drop at once" overstated the default
    experience, since five of the six are off by default.
