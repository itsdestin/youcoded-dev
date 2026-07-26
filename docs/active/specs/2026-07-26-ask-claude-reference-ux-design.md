---
status: draft
date: 2026-07-26
owner: Destin (decisions) / Claude (spec)
artifact: https://claude.ai/code/artifact/bed5f7ea-1a2e-431f-9d2c-563fd3bcdee4
supersedes: nothing
implements: ROADMAP.md:366 — "Ask about this" — native compose/quoted-reference version
---

# "Ask Claude about this" — native reference UX

**Status: design approved in chat 2026-07-26; spec pending Destin's review. Implementation not
started.**

Replaces the v1 "Ask about this" behaviour (shipped 2026-07-17, youcoded PR #169) — which pastes a
raw prompt scaffold into the composer — with a held, visible reference: the source is pinned on
screen behind a window-wide scrim with a tracing accent outline, the composer holds only the user's
own words, and the scaffold is assembled at send time.

---

## 1. Problem

Today the reference *is* the prompt text.

`build-menu.ts:59-66` builds a scaffold string and fires it at the composer:

```ts
function askAboutThis(text: string): void {
  window.dispatchEvent(new CustomEvent('youcoded:compose-insert', { detail: { text } }));
}
function scaffold(lead: string, body: string, fenced: boolean): string {
  const quoted = fenced ? '```\n' + body + '\n```' : `"${body}"`;
  return `${lead}\n${quoted}\n\nThe user has a follow-up: `;
}
```

`InputBar.tsx:301-315` prepends it to the draft and parks the caret after it. The user is then
looking at a textarea containing a quoted copy of something already on screen, which they must type
after and must not accidentally edit. Destin's word for it: "cheap/unrefined."

Two consequences beyond the aesthetics:

- **The reference is destructible.** It's ordinary text in an editable box. Backspace eats it.
- **There is no indication of what you're referencing** once the quote scrolls out of the visible
  textarea, and no way to cancel other than manually deleting the scaffold.

---

## 2. Approved behaviour

### 2.1 Chat message

Right-click an assistant or user bubble → **Ask about this**.

1. The whole message **lifts out of the chat flow** and travels to the centre of the window,
   over a scrim. It is a portalled clone, FLIP-animated from the bubble's real rect.
2. An accent outline **traces** around it on arrival, then settles into a slow breathing pulse.
3. The composer's placeholder becomes `Ask Claude about "…"`.
4. The state is **held until send or cancel**. The composer stays above the scrim and stays live.

**Why lift rather than scroll-to-center** (decided during brainstorm, 2026-07-26): the most likely
right-click target is the newest message, which sits directly above the composer with no scroll
room beneath it — it can never reach the vertical centre by scrolling. Same for the first message
of a short session. A portalled clone always can. Scroll-to-center would have worked for messages
in the middle of a long transcript and silently failed for the ones users reference most.

### 2.2 Artifact panel

Select text in a file view → right-click → **Ask about this**. Identical treatment **minus the
travel**: the selection stays where it is, the outline traces it in place, the window dims around
it. The placeholder cites lines (`Ask Claude about lines 12–18 of engine.ts`) rather than a quote,
reusing the existing `describeArtifactSelection` logic (`build-menu.ts:205-231`).

### 2.3 Decisions taken

| # | Question | Decision | Rationale |
|---|---|---|---|
| **9** | Outline traces the whole card, or the selection? | **Trace the selection whenever there is one.** Whole-card outline is the automatic fallback | One code path with a fallback. Fallback fires when there's no selection (right-clicking a bubble with nothing highlighted already references the whole message) or `getClientRects()` returns empty |
| **10** | Does the artifact dim cover the pane or the window? | **The whole window** | An unmissable reference beats a live transcript. Destin: "so it's obvious what is being highlighted / what the user is asking about". Accepted cost: an in-flight turn is behind the scrim while composing |
| **—** | Streaming messages | **Disabled, not hidden** — greyed row with a `title` hint | Matches the existing menu convention (Cut/Copy/Paste are `disabled` not removed, `build-menu.ts:110-114`). A vanishing row is worse than a greyed one |
| **—** | Android / touch | **Out of scope** | The context menu has no touch path at all today — pre-existing ROADMAP bug, not introduced here. Desktop + remote browser only |

**10 simplifies the build.** Because the dim is window-wide on both surfaces, they share **one
app-level scrim** rather than each region owning its own. It becomes a layer in the existing
overlay system rather than two bespoke per-pane overlays.

---

## 3. Architecture

Five pieces, four new.

### 3.1 `state/reference-context.tsx` (new)

```ts
export type PendingReference = {
  kind: 'chat-text' | 'chat-code' | 'artifact';
  /** Placeholder copy, already truncated: `"The chat reducer preserves…"` or `lines 12–18 of engine.ts` */
  label: string;
  /** Prepended at send. NEVER rendered in the composer. */
  promptText: string;
  /** How to re-find the source. Null when it was never anchorable. */
  anchor: { host: Element; range: Range | null } | null;
};
```

**The anchor stores live DOM handles, not rects and not selectors.** Rects are re-derived on every
measure pass, because a stored `DOMRect[]` goes stale the moment the transcript scrolls, the window
resizes, or a drawer opens.

Selectors were the original design and were **withdrawn during implementation (2026-07-26)**: they
required tagging the source element and wrapping the selection in marker spans via
`Range.surroundContents()`, which splits a text node inside React-managed chat bubbles and crashes
the renderer on the next reconcile (`NotFoundError: removeChild`). Holding the `Element` and a
cloned live `Range` needs no mutation at all, and the `Range` re-measures itself. This is
renderer-local state — never serialized, persisted, or sent over IPC — so node references are safe
to hold. When React does replace the spanned nodes the Range yields no rects, and the overlay falls
through to the whole-host outline (§7).

Provides `{ reference, setReference, clearReference }`. **Keyed by session internally**, the same
way `InputBar` already parks drafts (`draftsRef`, `InputBar.tsx:132`) — so switching sessions parks
the reference alongside the draft it belongs to, and switching back restores both. Context value is
`useMemo`'d; change frequency is low (set/clear only), so a plain context is correct here rather
than a `useSyncExternalStore` selector store.

### 3.2 `components/context-menu/build-reference.ts` (new)

Pure `(target: HTMLElement) => PendingReference | null`. This is `scaffold()` + `askAboutThis()`
inverted: the same strings, **returned as data instead of dispatched as an event**. Keeps
`build-menu.ts` a pure DOM-inspection module, which is what makes it unit-testable today.

### 3.3 `components/reference/ReferenceOverlay.tsx` (new)

One portalled instance, mounted beside `ContextMenuHost` in `App.tsx`. Owns:

- the app-level scrim,
- the trace SVG (union path or card rect),
- the lifted clone (chat only).

### 3.4 `components/reference/use-reference-geometry.ts` (new)

Captures rects at trigger time, re-measures on scroll + resize via `ResizeObserver`, and exports
`buildUnionPath(rects: DOMRect[]): string` as a **pure function** so the geometry is unit-testable
without a DOM.

### 3.5 `components/InputBar.tsx` (modified)

- Placeholder reads `reference.label` (replacing the literal at `InputBar.tsx:774`).
- `sendMessage` (`InputBar.tsx:323`) prepends `reference.promptText` to the outgoing message.
- `clearReference()` on successful send.
- **The `youcoded:compose-insert` effect (`InputBar.tsx:301-315`) is deleted.**

---

## 4. Data flow

```
right-click
  → buildContextMenu(target)            build-menu.ts:273
  → entry.run()  →  setReference(ref)   build-reference.ts
  → ReferenceOverlay mounts scrim, FLIPs the clone, traces the outline
  → InputBar swaps its placeholder
  → user types (reference untouched — it is not in the textarea)
  → Enter → sendMessage prepends promptText → clearReference()
  → overlay releases the clone home as the message posts
```

### 4.1 `youcoded:compose-insert` is retired

Verified 2026-07-26: the event has exactly **one producer** (`build-menu.ts:60`) and **one
consumer** (`InputBar.tsx:313`), both on the ask path. It is replaced outright, not left alongside
the new state. Three test call-sites assert against it and must be rewritten —
`build-menu.test.tsx:42`, `build-menu-cm6.test.tsx:73` and `:87`.

`buddy:attach-file` (`InputBar.tsx:292`) is a **different** event and is unaffected.

---

## 5. Visual specification

All values are theme-derived. No literal colours.

### 5.1 New tokens

Scoped to the reference overlay, computed from existing tokens:

```css
--ref-stroke: var(--accent);
--ref-wash:   color-mix(in oklab, var(--accent) 12%, transparent);
--ref-glow:   color-mix(in oklab, var(--accent) 45%, transparent);
--ref-lift-shadow: 0 24px 64px rgba(0, 0, 0, calc(var(--shadow-strength) * 2.5));
```

`--shadow-strength` is already computed per-theme by `theme-engine.ts:275` (0.2 on light themes,
0.1 on dark). The ×2.5 multiplier means the lift reads as elevated on Crème (0.5) without going
murky on Midnight (0.25) — one expression instead of a per-theme table.

### 5.2 Scrim

`var(--scrim)` — the exact token every existing overlay uses (`globals.css:844`). Under
`[data-wallpaper]` themes it inherits the same `blur(8px)` the theme engine injects for other
scrims, so Halftone Dimension et al. behave consistently without a special case.

### 5.3 Trace animation

| Property | Value |
|---|---|
| Geometry | SVG `<rect>` (card fallback) or `<path>` (selection union), `pathLength="100"` |
| Trace in | `stroke-dashoffset` 100 → 0, 620ms, `cubic-bezier(.4, 0, .2, 1)`, 120ms delay |
| Settle | opacity 1 → .5 → 1, 2.8s, `ease-in-out`, infinite |
| Stroke | `var(--ref-stroke)` at 1.5px, `drop-shadow(0 0 5px var(--ref-glow))` |
| Travel | `transform` 460ms `cubic-bezier(.22, 1, .36, 1)` |

### 5.4 Paint order

Wash must sit **under** the glyphs or it tints them; the outline sits over:

```
scrim (dim)  <  wash  <  referenced text  <  outline stroke
```

### 5.5 Reduced effects

`reducedEffects` (already in `ThemeProvider`) **and** `prefers-reduced-motion` each independently
disable: the trace animation, the breathing pulse, the glow `drop-shadow`, and the travel easing.
What remains is a 2px static accent border and the standard `0 8px 32px` overlay shadow. Every new
effect gets a `reducedEffects` branch — no exceptions.

### 5.6 Selection union geometry

`getClientRects()` on an inline range returns **one rect per line box**. The union outline walks
down the right edges then back up the left edges, producing the stepped shape (mid-line start, full
middle lines, mid-line end). Sort rects by `top` before walking; filter zero-area rects.

---

## 6. Layer placement

New **L5 Reference** band in the overlay system (`globals.css:831-837`):

```
L5 Reference:  scrim z-80, composer z-81, lifted card z-82
```

The composer must paint **above** the scrim — it stays live while the reference is held. Rather
than restructure the chrome stack, a `data-reference-held` attribute on `<body>` bumps
`.input-bar-container` to `z-index: 81` for the duration. One rule, one WHY comment, reverts
cleanly.

**L5 sits below L4 System (z-100)** so toasts and the shortcuts sheet still surface over a held
reference.

**Invariant that resolves the ordering question with L1–L3:** opening any drawer, popup, or
destructive dialog **cancels the held reference**. The states are mutually exclusive by rule, so
L5's position relative to L1–L3 never matters. Guard this with a test rather than leaving it to
z-index luck.

---

## 7. Edge cases

| Case | Behaviour |
|---|---|
| No selection | Whole-message reference + card outline (current v1 behaviour preserved) |
| `getClientRects()` empty | Card outline fallback |
| Source element unmounted (session switch, re-render, scrolled out) | Reference survives as state; overlay renders a **non-anchored** centred card from the stored text. The reference is never lost because its DOM went away |
| Message taller than viewport | Clone gets `max-height: 70vh` + internal scroll |
| Actively streaming message | Menu row **disabled** with `title="Unavailable while Claude is still writing this message"` |
| Second "Ask about this" while one is held | Replaces the held reference. No multi-reference support in v1 |
| Send fails the pending-interaction gate (`InputBar.tsx:325-334`) | Reference is **retained**, matching how the draft is retained |
| Cancel (Esc / scrim-click / ×) with text already typed | Clears **only** the reference. The draft is untouched — cancelling a reference is not a "discard my message" action |

---

## 8. Testing

Pinning tests, all on pure or jsdom-testable surfaces:

| Test | Asserts |
|---|---|
| `build-reference.test.ts` (new) | Builder returns correct `kind`/`label`/`promptText` per target type; null for non-referenceable targets |
| `reference-geometry.test.ts` (new) | `buildUnionPath` — single rect, stepped multi-line, unsorted input, empty input |
| `reference-context.test.tsx` (new) | Per-session park/restore; clear on send |
| `InputBar` send assembly (extend existing) | `promptText` prepended exactly once; reference cleared; draft preserved on refused send |
| `overlay-layer-authority.test.ts` (extend) | L5 band registered; opening an L1–L3 overlay cancels the reference |
| `build-menu.test.tsx`, `build-menu-cm6.test.tsx` (rewrite) | 3 `compose-insert` assertions repointed at the new return value |

**Not unit-testable:** the travel animation, trace timing, and how the glow reads per theme. Those
are Destin's dev-review pass (`bash scripts/run-dev.sh <branch> --label "Ask Reference"`), per the
workspace rule that final-stage visual verification is flagged rather than automated.

---

## 9. Out of scope

- **Touch / long-press.** The context menu has no touch handling at all — pre-existing ROADMAP
  item, unchanged by this work. Android users cannot reach this feature until that lands.
- **Narrow viewport (<640px).** Centring a lifted card on a 390px phone screen needs its own
  treatment; deferred with the touch work.
- **Images.** Still blocked on the deferred image sub-menu (needs `image:copy-to-clipboard` /
  `image:save-as` IPC and `data-artifact-path` tagging).
- **Multiple simultaneous references.**
- **A structured reply-to relationship in the transcript.** The original ROADMAP idea floated a
  real quoted-reference message type. This spec deliberately keeps the send payload as prepended
  prompt text, so nothing about the transcript format or native-runtime protocol changes.

---

## 10. Change ledger

Numbering matches the artifact.

| # | Change | Lands in |
|---|---|---|
| 1 | Scaffold leaves the composer; reference becomes state, assembled at send | `build-menu.ts`, `InputBar.tsx`, new `reference-context.tsx` |
| 2 | Placeholder `Ask Claude about "…"`, type-aware label | `InputBar.tsx:774` |
| 3 | Chat message lifts to centre over a scrim (never scroll-to-center) | new `ReferenceOverlay.tsx` |
| 4 | Tracing accent outline → breathing pulse | same |
| 5 | Lift shadow = `--shadow-strength × 2.5` | same |
| 6 | Held until send/cancel; composer above the scrim; Esc / scrim-click / × cancel | same + `InputBar.tsx` |
| 7 | Artifact variant: in place, no travel, window-wide dim | `build-menu.ts:233` branch |
| 8 | Reduced-effects / reduced-motion fallback: outline only | CSS |
| 9 | Trace the selection; card outline is the fallback | `use-reference-geometry.ts` |
| 10 | Dim covers the whole window; one shared app-level scrim | `ReferenceOverlay.tsx`, new L5 band |
| 11 | `MenuEntry` gains optional `hint?: string`, rendered as `title` on the row | `build-menu.ts`, `ContextMenu.tsx:144` |

Change 11 follows the documented tooltip policy in `AnchorTip.tsx:23-25`: native `title=` is for
plain hover hints, `AnchorTip` is for rich click-open info. A disabled menu row is the former.

---

## 11. Verification of claims in this spec

Everything asserted about current code was read on 2026-07-26 against `master`:

- `build-menu.ts:59-66` — scaffold + dispatch
- `InputBar.tsx:301-315` — the consumer being deleted; `:774` placeholder; `:132` per-session drafts
- `compose-insert` producer/consumer count — `rg` over `desktop/src`, 1 + 1, plus 3 test sites
- `globals.css:844-871` — `.layer-scrim` / `.layer-surface`; `:831-837` — layer bands
- `theme-engine.ts:262-326` — `--scrim`, `--shadow-strength` derivation
- `AnchorTip.tsx:23-25` — the `title` vs AnchorTip policy
- `AssistantTurnBubble.tsx:374`, `UserMessage.tsx:72` — bubble class strings used in the mockup
