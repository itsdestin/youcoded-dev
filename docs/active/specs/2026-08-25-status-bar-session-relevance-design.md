---
status: draft
created: 2026-08-25
tags: [renderer, native-runtime, ux, status-bar]
---

# Status bar: hide what doesn't apply to the session you're in

## 1. The problem

The status bar shows 22 things. Six of them are wrong in a native session, and one
of those six states something false.

Every chip fed by Claude Code's `statusline.sh` is dead in a native session, because
a native session runs no Claude Code and writes no statusline files. Some chips got
native fallbacks on 2026-07-28 (In, Out, Cached, Reuse, Speed, Context). Six never did:

| Chip | What a native session shows today |
|---|---|
| 5h Usage | Your Claude **subscription** limit — an app-wide number that says nothing about this session |
| 7d Usage | Same |
| Session Cost | `--` forever. Backwards: an OpenRouter session costs real money per token; a Claude Code session on a subscription does not |
| Session Duration | `--` forever |
| Active Ratio | `--` forever |
| Code Changes | **"No changes"** — after the model has rewritten twenty files. Not blank, false |

Plus the **Fast mode chip**: a Claude Code toggle read from the app-wide
`~/.claude/youcoded-model-modes.json`. Leave Fast on and it renders over native
sessions, where nothing honours it.

The `/usage` card in chat has the same defect one layer over: `getUsageSnapshot`
(`App.tsx`) reads only `statusData.sessionStatsMap` with no native fallback, so a
native session gets a card whose every session field is `--` and whose only content
is the Claude subscription bars.

## 2. What the app knows, and what it doesn't

`SessionProvider` is `'claude' | 'native'` — two runtimes. "Local", "OpenRouter" and
"OpenAI key" are all *native*; what separates them is the `ProviderType` the bound
model belongs to (`local-engine`, `openrouter`, `anthropic`, `openai`, `google`,
`openai-compatible`).

**The status bar is never told the provider type.** `StatusBar.tsx` declares a
`modelProviderType` prop and uses it to pick the native model chip's brand colour,
but nothing passes it — verified: three references repo-wide, all inside
`StatusBar.tsx` itself. So the native chip's brand detection runs on the model id
alone, and the bar cannot currently distinguish a free local model from a metered
OpenRouter one.

**The resolver already exists.** `resolvePortableModel(sessionId)`
(`ipc-handlers.ts:2374`) returns `PortableModelRef { modelId, providerType,
providerLabel }` and is already called at exactly the three moments that matter:

- native session create and resume (`ipc-handlers.ts:731`)
- mid-session model swap (`NATIVE_SET_BINDING`, `ipc-handlers.ts:2586`)

Its result goes to the conversation store (`noteModelUsed`, for the resume selector)
and nowhere else. The whole plumbing job is routing that same value to `SessionInfo`.

## 3. Session kinds

| Kind | Condition | Meaning |
|---|---|---|
| **Claude Code** | `provider === 'claude'` | Subscription; 5h/7d limits apply |
| **Native · local** | `provider === 'native'` and `providerType === 'local-engine'` | Runs on this machine; free per token |
| **Native · metered** | `provider === 'native'`, any other provider type | Real per-token cost |

**Two facts, degraded separately — not one kind with one fallback.** The runtime
(`provider`) is known the instant a session exists and is never absent. The provider
type is resolved asynchronously and can be briefly or permanently unknown.

| Fact | Known when | If unknown |
|---|---|---|
| Runtime (`claude` / `native`) | Always — set at session creation | n/a |
| Provider type | After `resolvePortableModel` resolves; absent on a failed lookup | Treat as **metered** for menu copy; the Cost chip is still gated on a real price (§5), so nothing is invented |

Every rule in §4 except Session Cost keys on the **runtime alone**. That matters:
keying them on the session kind would make 5h/7d and the Fast chip flicker into view
for the moment between a native session appearing and its provider type resolving.
Only Session Cost consults the provider type, and it independently requires a real
price before it renders — so a slow or failed lookup produces a missing chip, never a
wrong number.

## 4. Relevance rules

Each widget gains an `appliesTo` declaration beside its existing `label` /
`description` / `bestFor` in `WIDGET_CATEGORIES` — one registry, one place to read.

| Chip | Claude Code | Native · local | Native · metered |
|---|---|---|---|
| 5h Usage | ● | ○ | ○ |
| 7d Usage | ● | ○ | ○ |
| Session Cost | ● | ○ | ● **newly working** |
| Code Changes | ● | ● **newly working** | ● **newly working** |
| Session Duration | ● | ○ | ○ |
| Active Ratio | ● | ○ | ○ |
| Git Branch | ● | ○ | ○ |
| Context, In, Out, Cached, Reuse, Speed | ● | ● | ● |
| Model, Permission, Tags, Open Tasks | ● | ● | ● |
| Sync, Theme, Version, Announcement | ● | ● | ● |

● shown · ○ hidden

**Git Branch stays hidden, and this is not a design statement.** It is hidden today
because nothing feeds it, not because it is irrelevant — a native coder session in a
repo has exactly the same need. Fixing it is tracked as its own ROADMAP item under
`## Features` (added 2026-08-25). Its `appliesTo` is written as **Claude Code only
with an explicit `TODO` naming that item**, so whoever lands the feed flips one line
rather than rediscovering the reasoning.

**Fast mode chip** is a fixed control, not a registry widget, so it takes a plain
runtime gate: rendered only for `provider === 'claude'`.

## 5. Session Cost, made real

A price exists for a model or it doesn't. `CatalogModel.pricing` (`{ in, out }`, USD
per 1M tokens) is populated for OpenRouter and models.dev-backed rows and absent for
local-engine models.

**The chip renders only when a price is known.** A local model produces no price and
therefore no chip — which lands on the same outcome as the kind table above, but for
a reason that stays true if a local provider ever starts reporting prices. Where the
price is unknown for a metered provider (a custom `openai-compatible` endpoint), the
chip is absent rather than showing `$0.00`. **A false zero is worse than a blank**
(`docs/error-message-standards.md`; never state an unverified number).

**Where it is computed.** In main, mirroring the established per-binding-fact
pattern: `NativeSessionHost` already takes `contextAndSlotsFor`, `providerTypeFor`
and `visionSupportFor` as injected resolvers, each resolving one catalog-derived fact
per binding on every create / resume / swap. `pricingFor(binding)` joins that family
as a fourth. The resolved price rides the session the same way `contextLength`
already does.

**What it reports.** A running total for the session, accumulated in `HarnessSession`
across turns and emitted on the existing `turn-complete` usage payload as `costUsd` —
the same event that already carries `tokensPerSecond`, `contextLength` and
`contextUsedTokens`. No new IPC channel.

**Two honesty constraints, both required:**

1. The price list has one input price and no cached-token discount, but the app's
   prompt caching genuinely reduces spend. The figure therefore runs **slightly
   high**. The tooltip says *"Estimated — actual cost is lower when prompt caching
   is working."*
2. The total covers **this session since it was opened**. A resumed session starts
   its count from zero, because prior turns' costs are not persisted. The tooltip
   says so. It must not imply a lifetime total it does not have.

## 6. Code Changes, made real

No backend work. Every native `Edit` and `Write` already returns a `structuredPatch`
(`tools/edit.ts:10`, `tools/write.ts:75`), the reducer already stores it on the tool
call (`chat-reducer.ts:1324-1335`) to draw the green/red diff in tool cards, and
`StructuredPatchHunk.lines` are prefixed `' '` / `'-'` / `'+'` by construction.

Counting them in the renderer is the same shape as the existing `buildTasksById`
derivation that already feeds the Open Tasks chip off `session.toolCalls`.

**Claude Code sessions keep the statusline number.** It is Claude Code's own count
and covers edits made through any path, including shell commands. The derived count
covers only what the Edit and Write tools did — a model that rewrites a file with
`sed` or `git apply` contributes nothing to it. Using the derived count for native
and the statusline count for Claude Code keeps each runtime on the most complete
number available to it. **They may disagree for identical work; they are not
comparable across runtimes**, and the tooltip on the native chip says the count
covers file edits made through the model's editing tools.

## 7. The Customize Status Bar menu

Inapplicable rows stay in the list, dimmed, with a one-line reason where the
checkbox would be:

| Situation | Reason line |
|---|---|
| 5h / 7d, Duration, Active Ratio, Git Branch in a native session | *Claude Code sessions only* |
| Session Cost on a local model | *Local models are free to run* |
| Session Cost with no price available | *No pricing available for this model* |

The user's on/off choice is untouched and returns the moment they switch to a session
where the widget applies. The menu therefore never contradicts the bar, and it
explains rather than hides.

`WidgetConfigPopup` currently takes no session context and needs the session kind
threaded in — the same value the bar itself reads, from one source, so the two cannot
disagree.

## 8. The `/usage` card

`/usage` is the escape hatch for the 5h/7d numbers the bar now hides, so **it keeps
showing them in every session** — that is the point of it. But `getUsageSnapshot`
must gain the same native fallbacks the status bar chips already have (tokens, cache,
context) plus the new cost and code-change figures, or the card stays a page of `--`
in exactly the sessions the bar just sent people to it for.

Same relevance rules apply to its per-session rows: a row that does not apply is
omitted from the card rather than rendered empty.

## 9. Surfaces

One React component covers desktop, the remote browser, and Android — verified: the
Android app renders the shared web UI and has no separate status bar (its
`statusBarsPadding()` refs are OS window insets). No IPC channel is added, so the
five-surface parity checklist does not apply and `SessionService.kt` needs nothing.

Threading `providerType` through `SessionInfo` as an **optional** field means an
Android or remote build that does not populate it degrades to Claude Code behaviour
per §3 — nothing hides that should not.

## 10. Guards

| Claim | Guard |
|---|---|
| A native session renders no 5h / 7d / Duration / Active Ratio / Fast chip | New `statusbar-session-relevance.test.tsx` |
| A local session renders no Cost chip; a metered one with pricing does | Same |
| A metered session with no price renders no Cost chip (never `$0.00`) | Same |
| Code Changes counts `+`/`-` lines from stored hunks, ignores context lines | New unit test on the derivation |
| An unresolved provider type never hides a runtime-gated chip (no 5h/7d flicker on a fresh native session) | Same |
| Every widget in the registry declares `appliesTo` | Registry completeness test — a new widget cannot be added without deciding |
| The bar and the Customize menu read the same session kind | Both derive from one exported helper; test asserts the menu's dimmed set equals the bar's hidden set |

## 11. What the user will experience — including what they won't like

1. **The bar visibly shortens when switching to a local session.** Up to six chips
   drop at once and everything to their right (Theme, Version) slides left. Intended,
   but it will read as "something broke" the first time.
2. **The Claude budget number disappears exactly when it is acted on.** Flipping to a
   local model *because* you are near your 5-hour limit removes the number you were
   watching. `/usage` still has it and the Customize menu says why — but this is a
   real cost of the decision, not a mitigated one.
3. **Cost runs slightly high** (§5). Right to within a few percent, not to the cent.
4. **Code-change counts differ between runtimes for the same work** (§6).
5. **The Customize menu looks busier on native sessions** — roughly six of eighteen
   rows dimmed.
6. **Git Branch stays missing in native sessions** — tracked, deliberately not fixed
   here.

## 12. Out of scope

- **Git Branch for native sessions.** ROADMAP `## Features`, added 2026-08-25, with
  the verified mechanism and the cheap path (the app already reads branches via
  `git:file-status`; the `.git` watcher for live updates already ships).
- **Session Duration and Active Ratio for native sessions.** Both default to off and
  are the least-used chips; the harness does not currently report turn wall-time.
  Not worth harness work at this ratio.
- **Slash-command and QuickChips relevance.** Verified: neither `CommandDrawer` nor
  `QuickChips` filters by provider, so Claude-Code-only commands are offered in
  native sessions. Same class of problem, different surface, own decision.

## 13. Open question for Destin — flagged, not decided

**In: and Out: currently mean two different things depending on the runtime, and
nothing says so.** For a Claude Code session they are cumulative session totals
(from the statusline). For a native session they are the **most recent completed turn
only** — `useNativeSessionUsage` walks backward to the last turn carrying usage and
returns that one turn's numbers. Same chip, same label, two different measurements.
`Cached:` and `Reuse:` have the same split.

This is not an irrelevance problem, so it sits outside the four changes approved for
this spec — but it is a chip that misleads rather than one that merely doesn't apply,
which makes it arguably more urgent than anything above. Two directions:

- **Make native cumulative** — accumulate in `HarnessSession` like the new cost total,
  so both runtimes mean "this session so far." Consistent, and the natural reading of
  an unlabelled number. Costs a small amount of harness state.
- **Label the difference** — leave the numbers alone and say which is which in the
  tooltip. Nearly free, but leaves two identical-looking chips meaning different
  things, which is the shape of problem this whole spec exists to remove.

Recommendation: make native cumulative, as a follow-on rather than a scope increase
here. Needs Destin's call before it goes anywhere.
