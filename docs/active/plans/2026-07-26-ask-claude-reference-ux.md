---
status: draft
date: 2026-07-26
spec: docs/active/specs/2026-07-26-ask-claude-reference-ux-design.md
artifact: https://claude.ai/code/artifact/bed5f7ea-1a2e-431f-9d2c-563fd3bcdee4
repo: youcoded (desktop renderer only)
---

# "Ask Claude about this" — Native Reference UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 "Ask about this" behaviour — which pastes a raw prompt scaffold into the
composer — with a held reference: the source is pinned on screen behind a window-wide scrim with a
tracing accent outline, the composer holds only the user's words, and the scaffold is assembled at
send time.

**Architecture:** A small per-session React context (`PendingReference`) replaces the
`youcoded:compose-insert` CustomEvent. `build-menu.ts` stays a pure DOM-inspection module and hands
the reference to a callback supplied by `ContextMenuHost`. A single portalled `ReferenceOverlay`
owns the scrim, the trace SVG, and (chat only) a FLIP-animated clone of the source. `InputBar` reads
the reference for its placeholder and prepends `promptText` at send.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind v4 (theme tokens via CSS custom properties),
vitest 4 + @testing-library/react + jsdom.

## Global Constraints

- **All work happens in the `youcoded` sub-repo**, in a git worktree. Nothing in this plan touches
  `youcoded-dev`, the Android `app/` tree, or any other sub-repo.
- **Renderer code is shared with the Android WebView.** No `process.env`, no `require()`, no
  `fs`/`path`/`os`. ES imports and browser APIs only.
- **No literal colours.** Every colour derives from a theme token (`var(--accent)`,
  `var(--scrim)`, `var(--shadow-strength)`). A hex value in this feature is a bug.
- **`Overlay.tsx` is the only place a layer z-index is decided** (design rule 11, guarded by
  `tests/overlay-layer-authority.test.ts`). Never write `z-[NN]` in a `className`.
- **Every control goes through its `components/ui/` primitive.** Never hand-roll
  `bg-accent text-on-accent`. Guarded by `tests/primitive-adoption.test.ts`.
- **Every new visual effect needs a `reducedEffects` branch** (Task 9). No exceptions.
- **Annotate every non-trivial edit with a WHY comment.** Destin is a non-developer and reads
  comments to understand the code.
- Run tests with `cd youcoded/desktop && npx vitest run <path>`. Typecheck with `npx tsc --noEmit`.
- Commit after every task. Do not merge or push — Destin reviews first.

## Deviation from the spec — read before Task 6

Spec §6 proposes a **new L5 Reference band** at z-80/81/82. While planning, I read
`components/overlays/Overlay.tsx:13-23` and found `OverlayLayer` is a closed union `1 | 2 | 3 | 4`
with `SCRIM_Z = {1:40, 2:60, 3:70, 4:100}`. Adding `5: 80` would make the map non-monotonic (layer 5
painting *below* layer 4) — confusing, and it widens a type that several call sites switch on.

**This plan reuses L2 (Popup) instead**, which needs no new layer at all:

| Element | z-index | Source |
|---|---|---|
| Reference scrim | 60 | `SCRIM_Z[2]` |
| Lifted card | 61 | `CONTENT_Z[2]` |
| Composer (while a reference is held) | 62 | new `REFERENCE_COMPOSER_Z` export |

L3 (70/71) and L4 (100) still float above, as the spec intends. L1 drawers (40/50) sit *below* —
which is exactly the case the spec's "opening an L1–L3 overlay cancels the held reference"
invariant already handles (Task 6, Step 7).

`REFERENCE_COMPOSER_Z` is exported **from `Overlay.tsx`** and applied via inline `style`, not a
Tailwind class, so design rule 11 holds and the authority test stays green.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/renderer/state/reference-context.tsx` | **Create** — `PendingReference` type, provider, per-session park/restore | 1 |
| `src/renderer/state/reference-context.test.tsx` | **Create** — park/restore, replace, clear | 1 |
| `src/renderer/components/context-menu/build-reference.ts` | **Create** — pure `(target) => PendingReference \| null` | 2 |
| `src/renderer/components/context-menu/build-reference.test.ts` | **Create** — one case per `kind` | 2 |
| `src/renderer/components/context-menu/build-menu.ts` | **Modify** — move `describeArtifactSelection` out; delete `askAboutThis`/`scaffold`; `hint` field; streaming gate | 2, 3 |
| `src/renderer/components/context-menu/ContextMenu.tsx` | **Modify** — render `hint` as `title` | 3 |
| `src/renderer/components/context-menu/ContextMenuHost.tsx` | **Modify** — supply `setReference` to the builder | 3 |
| `src/renderer/components/AssistantTurnBubble.tsx` | **Modify** — `data-streaming` attribute | 3 |
| `src/renderer/components/ChatView.tsx` | **Modify** — pass `streaming` to the last turn | 3 |
| `src/renderer/components/InputBar.tsx` | **Modify** — placeholder, send assembly, delete compose-insert effect | 4 |
| `src/renderer/components/reference/reference-geometry.ts` | **Create** — pure `buildUnionPath` | 5 |
| `src/renderer/components/reference/reference-geometry.test.ts` | **Create** — geometry cases | 5 |
| `src/renderer/components/reference/ReferenceOverlay.tsx` | **Create** — scrim, cancel, trace, lift | 6, 7, 8 |
| `src/renderer/components/overlays/Overlay.tsx` | **Modify** — export `REFERENCE_COMPOSER_Z` | 6 |
| `src/renderer/hooks/use-esc-close.tsx` | **Modify** — add `useEscStackDepth()` | 6 |
| `src/renderer/styles/globals.css` | **Modify** — reference tokens, trace keyframes, reduced-effects branch | 7, 9 |
| `src/renderer/App.tsx` | **Modify** — mount `ReferenceProvider` + `ReferenceOverlay` | 1, 6 |

**Feature is functionally complete after Task 4** (reference held, placeholder swapped, scaffold
assembled at send — just no visuals). Tasks 5–9 are the visual layer. That boundary is deliberate:
if Destin wants to stop and dogfood the behaviour before the animation lands, Task 4 is the place.

---

### Task 1: `PendingReference` type + per-session context

**Files:**
- Create: `youcoded/desktop/src/renderer/state/reference-context.tsx`
- Test: `youcoded/desktop/src/renderer/state/reference-context.test.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx` (wrap `AppInner` subtree)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PendingReference = { kind: 'chat-text' | 'chat-code' | 'artifact'; label: string; promptText: string; anchor: ReferenceAnchor | null }`
  - `type ReferenceAnchor = { host: Element; range: Range | null }`
  - `function ReferenceProvider({ sessionId, children }: { sessionId: string; children: React.ReactNode }): JSX.Element`
  - `function useReference(): { reference: PendingReference | null; setReference: (r: PendingReference | null) => void; clearReference: () => void }`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/renderer/state/reference-context.test.tsx`:

```tsx
// @vitest-environment jsdom
// Pins the per-session parking contract: a held reference belongs to the session
// it was created in, exactly like InputBar's draftsRef (InputBar.tsx:132). Switching
// away must NOT leak the reference into another session's composer, and switching
// back must restore it.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ReferenceProvider, useReference, type PendingReference } from './reference-context';

const REF_A: PendingReference = {
  kind: 'chat-text', label: '"alpha"', promptText: 'Regarding alpha:\n', anchor: null,
};
const REF_B: PendingReference = {
  kind: 'artifact', label: 'lines 1-2 of x.ts', promptText: 'Referencing x.ts:\n', anchor: null,
};

let api: ReturnType<typeof useReference>;
function Probe() {
  api = useReference();
  return null;
}
function Harness({ sessionId }: { sessionId: string }) {
  return (
    <ReferenceProvider sessionId={sessionId}>
      <Probe />
    </ReferenceProvider>
  );
}

describe('reference-context', () => {
  it('starts with no reference', () => {
    render(<Harness sessionId="s1" />);
    expect(api.reference).toBeNull();
  });

  it('holds a reference that was set', () => {
    render(<Harness sessionId="s1" />);
    act(() => api.setReference(REF_A));
    expect(api.reference).toEqual(REF_A);
  });

  it('clearReference empties it', () => {
    render(<Harness sessionId="s1" />);
    act(() => api.setReference(REF_A));
    act(() => api.clearReference());
    expect(api.reference).toBeNull();
  });

  it('setting a second reference REPLACES the first (no multi-reference in v1)', () => {
    render(<Harness sessionId="s1" />);
    act(() => api.setReference(REF_A));
    act(() => api.setReference(REF_B));
    expect(api.reference).toEqual(REF_B);
  });

  it('parks the reference per session and restores it on return', () => {
    const { rerender } = render(<Harness sessionId="s1" />);
    act(() => api.setReference(REF_A));

    rerender(<Harness sessionId="s2" />);
    expect(api.reference).toBeNull();          // s2 must not inherit s1's reference

    act(() => api.setReference(REF_B));
    rerender(<Harness sessionId="s1" />);
    expect(api.reference).toEqual(REF_A);      // s1's is restored

    rerender(<Harness sessionId="s2" />);
    expect(api.reference).toEqual(REF_B);      // s2's is still there
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/renderer/state/reference-context.test.tsx`
Expected: FAIL — `Failed to resolve import "./reference-context"`

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/state/reference-context.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The "Ask Claude about this" held reference (spec 2026-07-26).
 *
 * Replaces the v1 approach of pasting a prompt scaffold straight into the
 * composer. The scaffold now lives HERE as `promptText` and is prepended at
 * send time, so the textarea only ever contains the user's own words.
 */
export type ReferenceAnchor = {
  /** The element the reference came from. Held directly — see the note below. */
  host: Element;
  /** Live Range over the selection, or null for a whole-element reference. */
  range: Range | null;
};

export type PendingReference = {
  kind: 'chat-text' | 'chat-code' | 'artifact';
  /** Placeholder copy, ALREADY truncated by the builder. */
  label: string;
  /** Prepended at send. Never rendered in the composer. */
  promptText: string;
  /**
   * How to re-find the source. Selectors, NOT a DOMRect[] snapshot: stored rects
   * go stale the moment the transcript scrolls, the window resizes, or a drawer
   * opens, so geometry is re-derived on every measure pass instead.
   */
  anchor: ReferenceAnchor | null;
};

type ReferenceApi = {
  reference: PendingReference | null;
  setReference: (r: PendingReference | null) => void;
  clearReference: () => void;
};

const ReferenceContext = createContext<ReferenceApi | null>(null);

export function ReferenceProvider({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  const [reference, setReferenceState] = useState<PendingReference | null>(null);

  // Per-session parking, mirroring InputBar's draftsRef (InputBar.tsx:132): a held
  // reference belongs to the session it was created in. Without this, switching
  // sessions would silently apply session A's reference to session B's next message.
  const parked = useRef<Map<string, PendingReference>>(new Map());
  const prevSession = useRef(sessionId);

  useEffect(() => {
    const prev = prevSession.current;
    if (prev === sessionId) return;
    // Park the outgoing session's reference, restore the incoming one.
    setReferenceState((current) => {
      if (current) parked.current.set(prev, current);
      else parked.current.delete(prev);
      return parked.current.get(sessionId) ?? null;
    });
    prevSession.current = sessionId;
  }, [sessionId]);

  const setReference = useCallback((r: PendingReference | null) => setReferenceState(r), []);
  const clearReference = useCallback(() => setReferenceState(null), []);

  // Memoized: this context changes only on set/clear, so consumers must not
  // re-render on unrelated parent renders (react-renderer rule).
  const value = useMemo(
    () => ({ reference, setReference, clearReference }),
    [reference, setReference, clearReference],
  );

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference(): ReferenceApi {
  const ctx = useContext(ReferenceContext);
  if (!ctx) throw new Error('useReference must be used inside a ReferenceProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/renderer/state/reference-context.test.tsx`
Expected: PASS — 5 tests

- [ ] **Step 5: Mount the provider**

In `youcoded/desktop/src/renderer/App.tsx`, add the import next to the other state imports:

```tsx
import { ReferenceProvider } from './state/reference-context';
```

Then wrap the `ArtifactProvider` subtree (around line 2621). Find:

```tsx
    <ArtifactProvider value={{ state: artifactState, dispatch: dispatchArtifact }}>
```

and wrap it:

```tsx
    {/* ReferenceProvider: holds the "Ask Claude about this" pending reference,
        parked per session so it can't leak between conversations. Outside
        ArtifactProvider because the artifact viewer is one of its two sources. */}
    <ReferenceProvider sessionId={sessionId ?? ''}>
    <ArtifactProvider value={{ state: artifactState, dispatch: dispatchArtifact }}>
```

and close it after the matching `</ArtifactProvider>`:

```tsx
    </ArtifactProvider>
    </ReferenceProvider>
```

> `sessionId` is the local already in scope — `App.tsx:2398` passes exactly `sessionId ?? ''` as
> `activeSessionId` into the view-state object, so this is the same value the composer receives.

- [ ] **Step 6: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/reference-context.tsx src/renderer/state/reference-context.test.tsx src/renderer/App.tsx
git commit -m "feat(reference): per-session PendingReference context

Holds the 'Ask Claude about this' reference as state instead of composer
text. Parked per session like InputBar's draftsRef so a reference cannot
leak from one conversation into another's next message.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `build-reference.ts` — the pure builder

**Files:**
- Create: `youcoded/desktop/src/renderer/components/context-menu/build-reference.ts`
- Test: `youcoded/desktop/src/renderer/components/context-menu/build-reference.test.ts`
- Modify: `youcoded/desktop/src/renderer/components/context-menu/build-menu.ts` (export
  `describeArtifactSelection`)

**Interfaces:**
- Consumes: `PendingReference`, `ReferenceAnchor` from Task 1.
- Produces:
  - `function buildChatReference(bubble: Element | null, target: HTMLElement): PendingReference | null`
  - `function buildCodeReference(pre: HTMLElement): PendingReference`
  - `function buildArtifactReference(container: HTMLElement): PendingReference | null`
  - `function truncateLabel(text: string, max?: number): string`

- [ ] **Step 1: MOVE the artifact line-describer into build-reference.ts**

`describeArtifactSelection` (`build-menu.ts:205-231`) must **move**, not be exported. Exporting it
would make the two modules circular — `build-menu.ts` imports the builders from
`build-reference.ts` (Task 3) while `build-reference.ts` imports the describer back. ES modules
tolerate that, but it is fragile and needless: after Task 3, `build-menu.ts` has no remaining
caller for it.

1. Cut the entire function **and its full comment block** (lines 192-231 — the comment explains the
   `textContent`-not-`innerText` and CM6-virtualization reasoning and must travel with the code)
   out of `build-menu.ts`.
2. Paste it into `build-reference.ts` as a module-private function (no `export`).
3. Move the import it depends on — `import { editorViewFor } from '../artifact-views/cm/editor-registry';`
   — to `build-reference.ts`. Delete it from `build-menu.ts` **only if** nothing else there uses it
   (check: `cmEditableMenu` does, so it stays in both — leave `build-menu.ts`'s import alone).

Do not otherwise edit the body. The line-number logic is correct as written and is pinned by
`build-menu-cm6.test.tsx`, which reaches it through the menu path either way.

- [ ] **Step 2: Write the failing test**

Create `youcoded/desktop/src/renderer/components/context-menu/build-reference.test.ts`:

```ts
// @vitest-environment jsdom
// Pins the reference BUILDER — the pure half of "Ask Claude about this".
// The strings here are the v1 scaffold strings, moved verbatim from
// build-menu.ts's askAboutThis()/scaffold() so the prompt Claude receives
// does not change; only where it lives does.
import { describe, it, expect, afterEach } from 'vitest';
import { buildChatReference, buildCodeReference, buildArtifactReference, truncateLabel } from './build-reference';

function mountBubble(cls: 'assistant-bubble' | 'user-bubble', text: string) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function selectWithin(node: Node, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node.firstChild!, start);
  range.setEnd(node.firstChild!, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('truncateLabel', () => {
  it('leaves short text alone', () => {
    expect(truncateLabel('alpha bravo')).toBe('alpha bravo');
  });

  it('truncates with an ellipsis at the limit', () => {
    expect(truncateLabel('a'.repeat(80), 10)).toBe('aaaaaaaaaa…');
  });

  it('collapses newlines so the placeholder stays one line', () => {
    expect(truncateLabel('alpha\nbravo')).toBe('alpha bravo');
  });
});

describe('buildChatReference', () => {
  it('quotes an assistant bubble with the assistant lead-in', () => {
    const el = mountBubble('assistant-bubble', 'the reducer preserves Map refs');
    const ref = buildChatReference(el, el)!;
    expect(ref.kind).toBe('chat-text');
    expect(ref.promptText).toBe(
      'In an earlier message, you said:\n"the reducer preserves Map refs"\n\nThe user has a follow-up: ',
    );
    expect(ref.label).toBe('"the reducer preserves Map refs"');
  });

  it('flips the lead-in for the user\'s own bubble', () => {
    const el = mountBubble('user-bubble', 'why does memo work');
    expect(buildChatReference(el, el)!.promptText).toBe(
      'Earlier I wrote:\n"why does memo work"\n\nThe user has a follow-up: ',
    );
  });

  it('stays neutral when the bubble class is unknown', () => {
    const el = document.createElement('div');
    el.textContent = 'floating text';
    document.body.appendChild(el);
    expect(buildChatReference(null, el)!.promptText).toBe(
      'Regarding this:\n"floating text"\n\nThe user has a follow-up: ',
    );
  });

  it('prefers the live selection over the whole bubble', () => {
    const el = mountBubble('assistant-bubble', 'alpha bravo charlie');
    selectWithin(el, 6, 11); // "bravo"
    const ref = buildChatReference(el, el)!;
    expect(ref.promptText).toContain('"bravo"');
    expect(ref.anchor?.range).not.toBeNull();
  });

  it('returns null when there is nothing to quote', () => {
    const el = mountBubble('assistant-bubble', '   ');
    expect(buildChatReference(el, el)).toBeNull();
  });
});

describe('buildCodeReference', () => {
  it('fences the code block and strips trailing newlines', () => {
    const pre = document.createElement('pre');
    pre.append(document.createTextNode('const x = 1;\n\n'));
    document.body.appendChild(pre);
    Object.defineProperty(pre, 'innerText', { value: 'const x = 1;\n\n', configurable: true });
    const ref = buildCodeReference(pre);
    expect(ref.kind).toBe('chat-code');
    expect(ref.promptText).toBe(
      'Earlier, you shared this code:\n```\nconst x = 1;\n```\n\nThe user has a follow-up: ',
    );
  });
});

describe('buildArtifactReference', () => {
  function mountViewer(body: string) {
    const container = document.createElement('div');
    container.setAttribute('data-artifact-viewer', 'true');
    container.setAttribute('data-doc-path', 'docs/notes.txt');
    container.setAttribute('data-artifact-source', 'raw');
    const pre = document.createElement('pre');
    pre.textContent = body;
    container.appendChild(pre);
    document.body.appendChild(container);
    return { container, pre };
  }

  it('cites source lines and labels them for the placeholder', () => {
    const { container, pre } = mountViewer('alpha\nbravo\ncharlie');
    selectWithin(pre, 6, 11); // "bravo" — line 2
    const ref = buildArtifactReference(container)!;
    expect(ref.kind).toBe('artifact');
    expect(ref.promptText).toBe(
      'The user is referencing line 2 from "docs/notes.txt". Respond to the following prompt accordingly:\n\n',
    );
    expect(ref.label).toBe('line 2 of notes.txt');
  });

  it('returns null with no selection — never reference a whole file', () => {
    const { container } = mountViewer('alpha\nbravo');
    expect(buildArtifactReference(container)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/context-menu/build-reference.test.ts`
Expected: FAIL — `Failed to resolve import "./build-reference"`

- [ ] **Step 4: Write the implementation**

Create `youcoded/desktop/src/renderer/components/context-menu/build-reference.ts`:

```ts
import { editorViewFor } from '../artifact-views/cm/editor-registry';
import type { PendingReference } from '../../state/reference-context';

// describeArtifactSelection MOVES here from build-menu.ts:205 (with its full
// comment block) — see Task 2 Step 1. Module-private on purpose: exporting it
// would make build-menu.ts and build-reference.ts circular.

/**
 * Builds the "Ask Claude about this" reference (spec 2026-07-26).
 *
 * This is v1's askAboutThis()/scaffold() INVERTED: the same prompt strings, but
 * RETURNED AS DATA instead of dispatched at the composer as text. Keeping it pure
 * is what makes it testable — and keeps build-menu.ts a pure DOM-inspection module.
 */

/**
 * Captures the live selection as a Range.
 *
 * NEVER mutate the DOM to mark a selection. An earlier draft of this wrapped the
 * selection in marker spans via Range.surroundContents(); that SPLITS the text
 * node it wraps, and chat bubbles are plain React-rendered children — React's
 * fiber still points at the original single text node, so the next reconcile of
 * that subtree throws NotFoundError: removeChild and takes the renderer down.
 *
 * A cloned live Range needs no mutation at all: it re-measures itself as the page
 * scrolls, and getClientRects() returns ONE RECT PER LINE BOX — exactly the shape
 * the union outline (Task 5) traces. If React ever does replace the nodes it
 * spans, it simply yields no rects and the overlay falls through to the
 * whole-host outline, which is the designed fallback (spec §7).
 */
function captureRange(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  // cloneRange: the live selection is cleared the moment focus moves to the
  // composer, which would empty a borrowed reference out from under us.
  return sel.getRangeAt(0).cloneRange();
}

/** One-line, bounded placeholder copy. Newlines collapse so it can't wrap. */
export function truncateLabel(text: string, max = 42): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max) + '…';
}

function scaffold(lead: string, body: string, fenced: boolean): string {
  const quoted = fenced ? '```\n' + body + '\n```' : `"${body}"`;
  return `${lead}\n${quoted}\n\nThe user has a follow-up: `;
}

function selectionText(): string {
  return window.getSelection()?.toString() ?? '';
}

function baseName(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || p;
}

export function buildChatReference(bubble: Element | null, target: HTMLElement): PendingReference | null {
  const quote = (selectionText().trim() || bubble?.textContent?.trim()) ?? '';
  if (!quote) return null;

  // "you said" reads right for an assistant message; flip it for the user's own
  // bubble, and stay neutral if we can't tell. (Moved verbatim from build-menu.ts.)
  const lead = bubble?.classList.contains('assistant-bubble')
    ? 'In an earlier message, you said:'
    : bubble?.classList.contains('user-bubble')
      ? 'Earlier I wrote:'
      : 'Regarding this:';

  const host = (bubble ?? target) as Element;
  const range = selectionText().trim() ? captureRange() : null;

  return {
    kind: 'chat-text',
    label: `"${truncateLabel(quote)}"`,
    promptText: scaffold(lead, quote, false),
    anchor: { host, range },
  };
}

export function buildCodeReference(pre: HTMLElement): PendingReference {
  const code = pre.innerText.replace(/\n+$/, '');
  return {
    kind: 'chat-code',
    label: truncateLabel(code),
    promptText: scaffold('Earlier, you shared this code:', code, true),
    anchor: { host: pre, range: null },
  };
}

export function buildArtifactReference(container: HTMLElement): PendingReference | null {
  // data-doc-path, not data-artifact-path: the latter stays reserved for the
  // deferred image sub-menu's absolute path on <img> elements.
  const path = container.getAttribute('data-doc-path') || '';
  const sel = selectionText().trim();
  // No selection → no reference. Falling back to the whole file would paste an
  // entire document (deliberate, carried over from v1).
  if (!sel || !path) return null;

  const ref = describeArtifactSelection(sel, container);

  return {
    kind: 'artifact',
    // `ref` is either "line 2" / "lines 2-4" or a quoted excerpt; only the
    // line form reads well with "of <file>".
    label: ref.startsWith('line') ? `${ref} of ${baseName(path)}` : truncateLabel(ref),
    promptText: `The user is referencing ${ref} from "${path}". Respond to the following prompt accordingly:\n\n`,
    anchor: { host: container, range: captureRange() },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/context-menu/build-reference.test.ts`
Expected: PASS — 12 tests

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/context-menu/build-reference.ts src/renderer/components/context-menu/build-reference.test.ts src/renderer/components/context-menu/build-menu.ts
git commit -m "feat(reference): pure PendingReference builder

Inverts v1's askAboutThis()/scaffold() — same prompt strings, returned as
data rather than dispatched at the composer as text. Tags the source element
and (where possible) the selected runs with marker attributes so the overlay
can re-measure geometry later without storing stale DOMRects.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the menu to the reference (and disable it on streaming turns)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/context-menu/build-menu.ts`
- Modify: `youcoded/desktop/src/renderer/components/context-menu/ContextMenu.tsx:144-160`
- Modify: `youcoded/desktop/src/renderer/components/context-menu/ContextMenuHost.tsx`
- Modify: `youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx:374`
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx:726`
- Modify: `youcoded/desktop/src/renderer/components/context-menu/build-menu.test.tsx:36-46`
- Modify: `youcoded/desktop/src/renderer/components/context-menu/build-menu-cm6.test.tsx:73,87`

**Interfaces:**
- Consumes: `buildChatReference`, `buildCodeReference`, `buildArtifactReference` (Task 2);
  `useReference` (Task 1).
- Produces:
  - `MenuEntry` item variant gains `hint?: string`
  - `buildContextMenu(target: HTMLElement, onReference: (r: PendingReference) => void): MenuEntry[] | null`

- [ ] **Step 1: Write the failing test — rewrite the compose-insert helper**

In `build-menu.test.tsx`, replace the helper at lines 36-46:

```tsx
// Runs the menu's "Ask about this" action and returns the reference it produces.
// (v1 delivered a string via the youcoded:compose-insert CustomEvent; that event
// is retired — the action now hands a PendingReference to the host's callback.)
function referenceFor(container: HTMLElement): PendingReference | null {
  let captured: PendingReference | null = null;
  const entries = buildContextMenu(container, (r) => { captured = r; });
  const ask = entries?.find((e) => e.type === 'item' && e.id === 'ask');
  if (!ask || ask.type !== 'item') return null;
  ask.run();
  return captured;
}
```

Add the import at the top:

```tsx
import type { PendingReference } from '../../state/reference-context';
```

Then update each assertion in that file from `expect(composedTextFor(container)).toBe(X)` to
`expect(referenceFor(container)?.promptText).toBe(X)`. Apply the identical change to
`build-menu-cm6.test.tsx` at its two spy sites (lines 73 and 87).

Add one new test at the end of `build-menu.test.tsx`:

```tsx
describe('streaming turns', () => {
  it('disables Ask about this with a hint while the turn is still writing', () => {
    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    bubble.setAttribute('data-streaming', 'true');
    bubble.textContent = 'partial resp';
    const scroll = document.createElement('div');
    scroll.className = 'chat-scroll';
    scroll.appendChild(bubble);
    document.body.appendChild(scroll);

    const entries = buildContextMenu(bubble, () => {})!;
    const ask = entries.find((e) => e.type === 'item' && e.id === 'ask');
    expect(ask).toBeDefined();                                  // disabled, NOT removed
    expect(ask!.type === 'item' && ask!.disabled).toBe(true);
    expect(ask!.type === 'item' && ask!.hint).toBe(
      'Unavailable while Claude is still writing this message',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/context-menu/`
Expected: FAIL — `buildContextMenu` takes 1 argument, `hint` is not a known property

- [ ] **Step 3: Add `hint` to the entry type and thread the callback**

In `build-menu.ts`, add to the item variant of `MenuEntry` (after `disabled?: boolean;`):

```ts
      /** Hover hint, rendered as `title`. Used to explain a DISABLED row.
       *  Native `title=` is the documented tool for plain hover hints;
       *  AnchorTip is for rich click-open info (AnchorTip.tsx:23-25). */
      hint?: string;
```

Delete `askAboutThis` and `scaffold` (lines 55-66) entirely — both move to `build-reference.ts`.
Add the imports:

```ts
import { buildChatReference, buildCodeReference, buildArtifactReference } from './build-reference';
import type { PendingReference } from '../../state/reference-context';

type OnReference = (r: PendingReference) => void;
```

Add the streaming probe near `closestBubble`:

```ts
// The lifted reference card is a static clone, so a still-streaming message
// would freeze mid-sentence inside it. Disabled (not hidden) per Destin
// 2026-07-26 — a vanishing row reads worse than a greyed one.
const STREAMING_HINT = 'Unavailable while Claude is still writing this message';
function isStreaming(el: Element | null): boolean {
  return el?.closest('[data-streaming="true"]') != null;
}
```

Thread `onReference` through the three menu builders and `buildContextMenu`. The three ask entries
become:

```ts
// codeMenu(pre, target, onReference)
{
  type: 'item', id: 'ask', label: 'Ask about this', icon: 'ask', primary: true,
  disabled: !code || isStreaming(target),
  hint: isStreaming(target) ? STREAMING_HINT : undefined,
  run: () => onReference(buildCodeReference(pre)),
},
```

```ts
// artifactMenu(container, onReference) — inside the existing `if (sel && path)` guard
entries.push({
  type: 'item', id: 'ask', label: 'Ask about this', icon: 'ask', primary: true,
  run: () => {
    const ref = buildArtifactReference(container);
    if (ref) onReference(ref);
  },
});
```

```ts
// textMenu(target, onReference) — replacing the existing `if (quote)` push
const bubble = closestBubble(target);
const streaming = isStreaming(target);
const quote = (selectionText().trim() || bubble?.textContent?.trim()) ?? '';
if (quote) {
  entries.push({
    type: 'item', id: 'ask', label: 'Ask about this', icon: 'ask', primary: true,
    disabled: streaming,
    hint: streaming ? STREAMING_HINT : undefined,
    run: () => {
      const ref = buildChatReference(bubble, target);
      if (ref) onReference(ref);
    },
  });
}
```

Update the signature and its four internal call sites:

```ts
export function buildContextMenu(target: HTMLElement, onReference: OnReference): MenuEntry[] | null {
```

> **Careful:** `finalize()` (line 315) drops a menu where every item is disabled. A streaming
> bubble's menu still has enabled Copy / Select-all entries, so the disabled ask row survives —
> which is the point. Do not change `finalize`.

- [ ] **Step 4: Render the hint**

In `ContextMenu.tsx`, add `title={entry.hint}` to the `<button>` at line 133:

```tsx
          <button
            key={entry.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            aria-disabled={entry.disabled || undefined}
            title={entry.hint}
            tabIndex={-1}
```

- [ ] **Step 5: Supply the callback from the host**

In `ContextMenuHost.tsx`, import and use the context:

```tsx
import { useReference } from '../../state/reference-context';
```

Inside the component, above the effect:

```tsx
  const { setReference } = useReference();
```

and change the build call:

```tsx
      const entries = buildContextMenu(target, setReference);
```

Add `setReference` to the effect's dependency array (it is `useCallback`-stable, so this does not
re-subscribe on every render).

- [ ] **Step 6: Tag streaming bubbles**

In `AssistantTurnBubble.tsx`, add to `interface Props` (line 13):

```tsx
  /** True only for the turn currently being written. Gates "Ask about this" —
   *  the reference card is a static clone and would freeze mid-sentence. */
  streaming?: boolean;
```

Destructure it in the component signature alongside `turn`, `toolGroups`, etc., then add the
attribute to the bubble div at line 374:

```tsx
            <div
              data-streaming={streaming ? 'true' : undefined}
              className={`assistant-bubble max-w-[85%] break-words rounded-2xl rounded-bl-sm bg-inset text-sm text-fg px-5 ${toolsOnly ? 'py-2.5' : hasTools ? 'pt-4 pb-3' : reasoningOnly ? 'py-2.5' : 'py-3.5'}`}
            >
```

In `ChatView.tsx` at the `<AssistantTurnBubble>` call site (line 726), pass it. The in-flight turn
is the last timeline entry while `state.isThinking` is true:

```tsx
                    <AssistantTurnBubble
                      turn={turn}
                      toolGroups={state.toolGroups}
                      toolCalls={state.toolCalls}
                      sessionId={sessionId}
                      provider={provider}
                      showTimestamps={showTimestamps}
                      // Only the LAST entry can be mid-stream; everything above
                      // it is complete and safe to reference.
                      streaming={state.isThinking && idx === state.timeline.length - 1}
                    />
```

> `idx` is the existing index parameter — `ChatView.tsx:706` reads
> `state.timeline.map((entry, idx) => {`. No signature change needed.

- [ ] **Step 7: Run the full context-menu suite**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/context-menu/`
Expected: PASS — all existing tests plus the new streaming test

- [ ] **Step 8: Verify the retired event is gone**

Run: `cd youcoded/desktop && rg -n "compose-insert" src/`
Expected: **only** the `InputBar.tsx` consumer remains (deleted in Task 4). Zero hits in
`context-menu/`.

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/renderer/components/context-menu/ src/renderer/components/AssistantTurnBubble.tsx src/renderer/components/ChatView.tsx
git commit -m "feat(reference): menu produces a PendingReference; disable on streaming turns

buildContextMenu now takes an onReference callback instead of dispatching
youcoded:compose-insert. Ask about this is DISABLED (not hidden) on the
in-flight turn, with a title hint explaining why — the reference card is a
static clone and would freeze a streaming message mid-sentence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: InputBar — placeholder, send assembly, delete the retired event

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/InputBar.tsx` (delete 301-315; edit 323, 774)
- Test: `youcoded/desktop/src/renderer/components/InputBar.reference.test.tsx` (create)

**Interfaces:**
- Consumes: `useReference` (Task 1).
- Produces: nothing downstream. **After this task the feature works end to end without visuals.**

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/renderer/components/InputBar.reference.test.tsx`:

```tsx
// @vitest-environment jsdom
// Pins the two composer contracts of the held reference (spec 2026-07-26 §3.5):
//  1. the placeholder announces the reference, and
//  2. promptText is prepended EXACTLY ONCE at send, then the reference clears —
//     while the user's own draft is never touched by a cancel.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ReferenceProvider, useReference, type PendingReference } from '../state/reference-context';
import { composeOutgoing, placeholderFor } from './InputBar';

const REF: PendingReference = {
  kind: 'chat-text',
  label: '"the reducer preserves…"',
  promptText: 'In an earlier message, you said:\n"x"\n\nThe user has a follow-up: ',
  anchor: null,
};

describe('placeholderFor', () => {
  it('falls back to the default with no reference', () => {
    expect(placeholderFor(null, false)).toBe('Message Claude...');
  });

  it('announces the held reference', () => {
    expect(placeholderFor(REF, false)).toBe('Ask Claude about "the reducer preserves…"');
  });

  it('the approval gate still wins over a held reference', () => {
    expect(placeholderFor(REF, true)).toBe('Waiting for approval...');
  });
});

describe('composeOutgoing', () => {
  it('returns the draft unchanged with no reference', () => {
    expect(composeOutgoing('why?', null)).toBe('why?');
  });

  it('prepends promptText exactly once', () => {
    expect(composeOutgoing('why?', REF)).toBe(REF.promptText + 'why?');
  });

  it('sends the scaffold alone when the draft is empty', () => {
    expect(composeOutgoing('', REF)).toBe(REF.promptText);
  });
});

describe('cancel does not touch the draft', () => {
  it('clearReference leaves composer state alone', () => {
    let api: ReturnType<typeof useReference>;
    function Probe() { api = useReference(); return null; }
    render(<ReferenceProvider sessionId="s1"><Probe /></ReferenceProvider>);
    act(() => api.setReference(REF));
    act(() => api.clearReference());
    // The context owns ONLY the reference — it has no draft to clobber.
    expect(api.reference).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/InputBar.reference.test.tsx`
Expected: FAIL — `composeOutgoing` / `placeholderFor` are not exported from `./InputBar`

- [ ] **Step 3: Add the two pure helpers**

In `InputBar.tsx`, above the component, add:

```tsx
/**
 * Composer placeholder. A held reference replaces "Message Claude..." so the
 * empty box states what the next message is about (spec 2026-07-26 §2.1).
 * The approval gate outranks it — that copy is a hard block, not a hint.
 */
export function placeholderFor(reference: PendingReference | null, disabled: boolean): string {
  if (disabled) return 'Waiting for approval...';
  if (reference) return `Ask Claude about ${reference.label}`;
  return 'Message Claude...';
}

/**
 * Assembles what actually goes to Claude. The scaffold lives in the reference,
 * NOT in the textarea — this is the whole point of the 2026-07-26 redesign, so
 * the user's draft is only ever their own words.
 */
export function composeOutgoing(draft: string, reference: PendingReference | null): string {
  return reference ? reference.promptText + draft : draft;
}
```

with the import:

```tsx
import { useReference, type PendingReference } from '../state/reference-context';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/InputBar.reference.test.tsx`
Expected: PASS — 8 tests

- [ ] **Step 5: Delete the retired compose-insert effect**

In `InputBar.tsx`, delete the entire `useEffect` block at lines 301-315 (its comment block starts
"External \"insert into composer\" entry point"). Also delete the now-stale sentence naming
`youcoded:compose-insert` in the ref-interface comment at lines 28-33.

> Leave the `buddy:attach-file` effect immediately above it alone — different event, unaffected.

- [ ] **Step 6: Wire the component**

Inside `InputBar`, near the other hooks:

```tsx
  const { reference, clearReference } = useReference();
```

At the `placeholder` prop (line 774), replace:

```tsx
            placeholder={disabled ? 'Waiting for approval...' : 'Message Claude...'}
```

with:

```tsx
            placeholder={placeholderFor(reference, !!disabled)}
```

In `sendMessage`, after the pending-interaction gate has passed and immediately before the text is
written to the session, wrap the outgoing text:

```tsx
      // The held reference's scaffold is prepended HERE, at send — it was never
      // in the textarea. On a refused send we return before this point, so the
      // reference survives alongside the draft (spec §7).
      const outgoing = composeOutgoing(message, reference);
```

Use `outgoing` in place of `message` for the session write, then clear the reference on the success
path, next to where the draft is cleared:

```tsx
      clearReference();
```

> The optimistic `USER_PROMPT` dispatch must keep using the **original** `message`, not `outgoing` —
> the chat bubble should show what the user typed, not the scaffold. `TRANSCRIPT_USER_MESSAGE`
> dedup matches on the pending flag, not content (see `desktop/CLAUDE.md` → Chat View Data Flow
> item 3), so the two differing strings do not break dedup.

- [ ] **Step 7: Verify the event is fully retired**

Run: `cd youcoded/desktop && rg -n "compose-insert" src/`
Expected: **zero hits**

- [ ] **Step 8: Run the full suite and typecheck**

Run: `cd youcoded/desktop && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/InputBar.tsx src/renderer/components/InputBar.reference.test.tsx
git commit -m "feat(reference): composer placeholder + send-time scaffold assembly

The composer now holds ONLY the user's words: placeholderFor() announces the
held reference, composeOutgoing() prepends its promptText at send, and the
youcoded:compose-insert CustomEvent is retired (0 producers, 0 consumers).
Feature is functionally complete here; Tasks 5-9 add the visual layer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `buildUnionPath` — the selection outline geometry

**Files:**
- Create: `youcoded/desktop/src/renderer/components/reference/reference-geometry.ts`
- Test: `youcoded/desktop/src/renderer/components/reference/reference-geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Box = { l: number; r: number; t: number; b: number }`
  - `function toBoxes(rects: DOMRect[], host: DOMRect, pad?: number): Box[]`
  - `function buildUnionPath(boxes: Box[]): string`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/src/renderer/components/reference/reference-geometry.test.ts`:

```ts
// Pure geometry for the traced selection outline (spec 2026-07-26 §5.6).
// getClientRects() on a multi-line selection returns ONE RECT PER LINE BOX;
// the outline is the stepped union of those boxes — down the right edges,
// back up the left. No DOM needed, so this runs in the default node env.
import { describe, it, expect } from 'vitest';
import { buildUnionPath, toBoxes, type Box } from './reference-geometry';

const box = (l: number, t: number, r: number, b: number): Box => ({ l, t, r, b });

describe('buildUnionPath', () => {
  it('returns empty string for no boxes', () => {
    expect(buildUnionPath([])).toBe('');
  });

  it('traces a single line box as a closed rectangle', () => {
    expect(buildUnionPath([box(10, 0, 90, 20)])).toBe(
      'M 90 0 L 90 20 L 10 20 L 10 0 Z',
    );
  });

  it('steps down the right edges then back up the left', () => {
    // Classic 3-line selection: starts mid-line, full middle, ends mid-line.
    const d = buildUnionPath([box(40, 0, 100, 20), box(0, 20, 100, 40), box(0, 40, 60, 60)]);
    expect(d).toBe(
      'M 100 0 L 100 20 L 100 20 L 100 40 L 60 40 L 60 60 ' +
      'L 0 60 L 0 40 L 0 40 L 0 20 L 40 20 L 40 0 Z',
    );
  });

  it('closes the path', () => {
    expect(buildUnionPath([box(0, 0, 10, 10)]).endsWith('Z')).toBe(true);
  });
});

describe('toBoxes', () => {
  const host = { left: 100, top: 50 } as DOMRect;
  const rect = (l: number, t: number, w: number, h: number) =>
    ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }) as DOMRect;

  it('converts to host-relative coordinates', () => {
    expect(toBoxes([rect(120, 70, 40, 20)], host, 0)).toEqual([box(20, 20, 60, 40)]);
  });

  it('applies padding outward on all four sides', () => {
    expect(toBoxes([rect(120, 70, 40, 20)], host, 2)).toEqual([box(18, 18, 62, 42)]);
  });

  it('drops zero-area rects (collapsed ranges produce them)', () => {
    expect(toBoxes([rect(120, 70, 0, 20), rect(120, 90, 40, 20)], host, 0)).toHaveLength(1);
  });

  it('sorts by top so unsorted input still steps downward', () => {
    const out = toBoxes([rect(120, 90, 40, 20), rect(120, 70, 40, 20)], host, 0);
    expect(out[0].t).toBeLessThan(out[1].t);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/reference/reference-geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./reference-geometry"`

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/components/reference/reference-geometry.ts`:

```ts
/**
 * Geometry for the traced selection outline (spec 2026-07-26 §5.6).
 *
 * Pure on purpose: this is the trickiest logic in the feature and the part most
 * likely to be silently wrong, so it must be testable without a DOM or a render.
 */

export type Box = { l: number; r: number; t: number; b: number };

/**
 * Host-relative, padded, sorted line boxes from raw client rects.
 * Zero-area rects are dropped — a collapsed range emits them and they would
 * add a degenerate spike to the outline.
 */
export function toBoxes(rects: DOMRect[], host: DOMRect, pad = 2): Box[] {
  return rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      l: r.left - host.left - pad,
      r: r.right - host.left + pad,
      t: r.top - host.top - pad,
      b: r.bottom - host.top + pad,
    }))
    .sort((a, b) => a.t - b.t);
}

/**
 * The stepped union outline: walk DOWN the right edges of every line box, then
 * back UP the left edges. For a selection that starts mid-line and ends
 * mid-line this produces the familiar notched shape rather than a bounding box.
 */
export function buildUnionPath(boxes: Box[]): string {
  if (boxes.length === 0) return '';
  const cmds: string[] = [];
  boxes.forEach((bx, i) => {
    cmds.push(`${i === 0 ? 'M' : 'L'} ${bx.r} ${bx.t}`, `L ${bx.r} ${bx.b}`);
  });
  for (let i = boxes.length - 1; i >= 0; i--) {
    cmds.push(`L ${boxes[i].l} ${boxes[i].b}`, `L ${boxes[i].l} ${boxes[i].t}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/renderer/components/reference/reference-geometry.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/reference/
git commit -m "feat(reference): pure stepped-union outline geometry

buildUnionPath walks down the right edges of every line box then back up the
left, giving a partial selection its real notched shape instead of a bounding
box. Pure so the trickiest logic in the feature is testable without a DOM.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `ReferenceOverlay` — scrim, layer, cancel

**Files:**
- Create: `youcoded/desktop/src/renderer/components/reference/ReferenceOverlay.tsx`
- Modify: `youcoded/desktop/src/renderer/components/overlays/Overlay.tsx` (export
  `REFERENCE_COMPOSER_Z`)
- Modify: `youcoded/desktop/src/renderer/hooks/use-esc-close.tsx` (add `useEscStackDepth`)
- Modify: `youcoded/desktop/src/renderer/components/InputBar.tsx` (composer z while held)
- Modify: `youcoded/desktop/src/renderer/App.tsx` (mount the overlay)
- Test: `youcoded/desktop/src/renderer/hooks/use-esc-close.test.tsx` (extend)

**Interfaces:**
- Consumes: `useReference` (Task 1), `Scrim` / `CONTENT_Z` (existing).
- Produces:
  - `export const REFERENCE_COMPOSER_Z: number` from `Overlay.tsx`
  - `function useEscStackDepth(): number` from `use-esc-close.tsx`
  - `function ReferenceOverlay(): JSX.Element | null`

- [ ] **Step 1: Write the failing test for stack depth**

Append to `youcoded/desktop/src/renderer/hooks/use-esc-close.test.tsx`, inside the existing
`describe('useEscClose', ...)`:

```tsx
  it('useEscStackDepth reports how many overlays are registered', () => {
    const captured: number[] = [];
    function Probe() {
      captured.push(useEscStackDepth());
      return null;
    }
    function Harness({ extra }: { extra: boolean }) {
      return (
        <EscCloseProvider>
          <Probe />
          <Overlay onClose={() => {}} />
          {extra && <Overlay onClose={() => {}} />}
        </EscCloseProvider>
      );
    }
    const { rerender } = render(<Harness extra={false} />);
    rerender(<Harness extra={true} />);
    // Depth grows when a second overlay opens on top — this is the signal the
    // reference overlay uses to cancel itself rather than paint under a drawer.
    expect(Math.max(...captured)).toBe(2);
  });
```

and add `useEscStackDepth` to the import at the top of that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run src/renderer/hooks/use-esc-close.test.tsx`
Expected: FAIL — `useEscStackDepth is not exported`

- [ ] **Step 3: Add `useEscStackDepth`**

In `use-esc-close.tsx`, next to the existing `useEscStackEmpty`, add:

```tsx
/**
 * How many overlays are currently registered.
 *
 * Added for the "Ask Claude about this" reference overlay: it reuses the L2
 * band (scrim z-60), so an L1 drawer at z-40/50 would open UNDERNEATH its
 * scrim. Rather than invent a new layer, the reference cancels itself when the
 * stack grows past its own registration depth — the two states become mutually
 * exclusive and the z-ordering question never arises.
 */
export function useEscStackDepth(): number {
  const store = useContext(EscStoreContext);
  // Same soft-fail + useSyncExternalStore shape as useEscStackEmpty above:
  // no provider (isolated component tests) means no stack, so depth 0.
  return useSyncExternalStore(
    useCallback((l) => (store ? store.subscribe(l) : () => {}), [store]),
    useCallback(() => (store ? store.depth : 0), [store]),
    useCallback(() => 0, []),
  );
}
```

and add the getter to `EscStore`, directly below the existing `isEmpty` getter (line 56):

```ts
  get depth(): number {
    return this.stack.length;
  }
```

> `EscStore` already calls `emit()` on every `push`/`remove`/`popTop`, so `depth` re-renders
> through the existing subscription with no new plumbing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run src/renderer/hooks/use-esc-close.test.tsx`
Expected: PASS — all existing tests plus the new one

- [ ] **Step 5: Export the composer z-index**

In `Overlay.tsx`, directly below the `CONTENT_Z` export (line 23), add:

```ts
// The composer stays LIVE and interactive above the reference scrim while an
// "Ask Claude about this" reference is held (spec 2026-07-26 §6) — you type
// your question while the source sits pinned behind the dim. One above L2
// content so it clears the lifted card without a magic number at the call site.
// Declared HERE because Overlay.tsx is the only place a layer number is decided
// (design rule 11, guarded by tests/overlay-layer-authority.test.ts).
export const REFERENCE_COMPOSER_Z = CONTENT_Z[2] + 1;
```

- [ ] **Step 6: Write the overlay**

Create `youcoded/desktop/src/renderer/components/reference/ReferenceOverlay.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Scrim } from '../overlays/Overlay';
import { CloseButton } from '../ui/CloseButton';
import { useReference } from '../../state/reference-context';
import { useEscClose, useEscStackDepth } from '../../hooks/use-esc-close';

/**
 * The held "Ask Claude about this" reference (spec 2026-07-26).
 *
 * One app-wide instance. Owns the window-wide dim; Tasks 7 and 8 add the traced
 * outline and the lifted clone on top of this shell.
 *
 * Window-wide, not pane-scoped — Destin's 10B call: "dim should apply to the
 * whole window so it's obvious what is being highlighted / what the user is
 * asking about." Both the chat and artifact surfaces share this one scrim.
 */
export function ReferenceOverlay() {
  const { reference, clearReference } = useReference();
  const depth = useEscStackDepth();
  const depthAtOpen = useRef<number | null>(null);

  // Esc cancels. LIFO, so if a drawer opened on top, Esc closes that first.
  useEscClose(!!reference, clearReference);

  useEffect(() => {
    if (!reference) { depthAtOpen.current = null; return; }
    if (depthAtOpen.current === null) { depthAtOpen.current = depth; return; }
    // Something opened ON TOP of us. We live in the L2 band, so an L1 drawer
    // (z-40/50) would render UNDER this scrim. Cancel instead of painting over
    // it — the two states are mutually exclusive by design (spec §6).
    if (depth > depthAtOpen.current) clearReference();
  }, [reference, depth, clearReference]);

  // Mark the document so the composer can lift above the scrim (globals.css).
  useEffect(() => {
    if (!reference) return;
    document.body.setAttribute('data-reference-held', 'true');
    return () => document.body.removeAttribute('data-reference-held');
  }, [reference]);

  if (!reference) return null;

  return createPortal(
    <Scrim layer={2} onClick={clearReference} className="reference-scrim">
      {/* Cancel affordance. Positioned by Task 8 against the lifted card; until
          then it parks top-right so the state is always escapable by mouse. */}
      <div className="absolute top-4 right-4">
        <CloseButton label="Cancel reference" onClick={clearReference} />
      </div>
    </Scrim>,
    document.body,
  );
}
```

- [ ] **Step 7: Lift the composer above the scrim**

In `InputBar.tsx`, import the constant:

```tsx
import { REFERENCE_COMPOSER_Z } from './overlays/Overlay';
```

and apply it to the container div (line 633) via inline style — **not** a `z-[NN]` class, which
`tests/overlay-layer-authority.test.ts` rejects:

```tsx
    <div
      className="input-bar-container shrink-0"
      // While a reference is held the composer must stay live ABOVE the dim —
      // you type your question while the source sits pinned behind it.
      style={reference ? { position: 'relative', zIndex: REFERENCE_COMPOSER_Z } : undefined}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
```

- [ ] **Step 8: Mount the overlay**

In `App.tsx`, next to `<ContextMenuHost />` (line 2634):

```tsx
      {/* Mount-only: the held "Ask Claude about this" reference — window-wide
          dim, traced outline, and the lifted source card. */}
      <ReferenceOverlay />
```

with the import beside the `ContextMenuHost` one:

```tsx
import { ReferenceOverlay } from './components/reference/ReferenceOverlay';
```

- [ ] **Step 9: Verify the layer authority test still passes**

Run: `cd youcoded/desktop && npx vitest run tests/overlay-layer-authority.test.ts`
Expected: PASS — no `z-[NN]` was added to any className

- [ ] **Step 10: Full suite, typecheck, commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/renderer/components/reference/ReferenceOverlay.tsx src/renderer/components/overlays/Overlay.tsx src/renderer/hooks/use-esc-close.tsx src/renderer/hooks/use-esc-close.test.tsx src/renderer/components/InputBar.tsx src/renderer/App.tsx
git commit -m "feat(reference): window-wide scrim + cancel affordances

Reuses the L2 band rather than inventing an L5, with REFERENCE_COMPOSER_Z
exported from Overlay.tsx so design rule 11 holds. Opening any overlay on top
cancels the reference (new useEscStackDepth), which makes the two states
mutually exclusive and sidesteps the z-ordering question entirely.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The traced outline

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/reference/ReferenceOverlay.tsx`
- Create: `youcoded/desktop/src/renderer/components/reference/use-reference-geometry.ts`
- Modify: `youcoded/desktop/src/renderer/styles/globals.css`

**Interfaces:**
- Consumes: `toBoxes`, `buildUnionPath` (Task 5); `ReferenceAnchor` (Task 1).
- Produces: `function useReferenceGeometry(anchor: ReferenceAnchor | null): { d: string; rects: DOMRect[] }`

- [ ] **Step 1: Add the theme tokens and trace CSS**

In `globals.css`, after the `.layer-surface` block (around line 871), add:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   "Ask Claude about this" held reference (spec 2026-07-26)
   All values derive from theme tokens so the glow re-themes with everything
   else — a literal colour here would break every community theme.
   ═══════════════════════════════════════════════════════════════════════════ */
.reference-scrim {
  --ref-stroke: var(--accent);
  --ref-wash: color-mix(in oklab, var(--accent) 12%, transparent);
  --ref-glow: color-mix(in oklab, var(--accent) 45%, transparent);
  /* 2.5x the standard overlay shadow: reads as lifted on light themes
     (0.2 -> 0.5) without going murky on dark ones (0.1 -> 0.25). */
  --ref-lift-shadow: 0 24px 64px rgba(0, 0, 0, calc(var(--shadow-strength, 0.15) * 2.5));
}

.reference-trace { position: fixed; inset: 0; pointer-events: none; overflow: visible; }
.reference-trace path.wash { fill: var(--ref-wash); stroke: none; }
.reference-trace path.outline {
  fill: none;
  stroke: var(--ref-stroke);
  stroke-width: 1.5;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 5px var(--ref-glow));
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: reference-trace-in 620ms 120ms cubic-bezier(.4, 0, .2, 1) forwards,
             reference-breathe 2800ms 740ms ease-in-out infinite;
}
@keyframes reference-trace-in { to { stroke-dashoffset: 0; } }
@keyframes reference-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
```

- [ ] **Step 2: Write the geometry hook**

Create `youcoded/desktop/src/renderer/components/reference/use-reference-geometry.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { toBoxes, buildUnionPath } from './reference-geometry';
import type { ReferenceAnchor } from '../../state/reference-context';

/**
 * Live geometry for the traced outline.
 *
 * Re-derives rects from the DOM on every measure pass rather than storing a
 * DOMRect[] snapshot — stored rects go stale the instant the transcript
 * scrolls, the window resizes, or the drawer opens (spec §3.1).
 *
 * Returns an empty path when the source is gone; the overlay falls back to a
 * non-anchored centred card in that case (spec §7).
 */
export function useReferenceGeometry(anchor: ReferenceAnchor | null): { d: string; rects: DOMRect[] } {
  const [geom, setGeom] = useState<{ d: string; rects: DOMRect[] }>({ d: '', rects: [] });

  const measure = useCallback(() => {
    if (!anchor) { setGeom({ d: '', rects: [] }); return; }
    const host = anchor.host;
    if (!host.isConnected) { setGeom({ d: '', rects: [] }); return; }

    // Trace the SELECTION when there is one (Destin's 9B call); fall back to
    // the whole host element's box when there isn't — which is exactly the
    // no-selection case that already references the entire message.
    // A live Range re-measures itself as the page scrolls — no stored rects, no
    // DOM mutation. If React ever replaces these nodes the Range yields no rects
    // and we fall through to the whole-host outline, which is the designed
    // fallback (spec 7).
    //
    // The containment check is load-bearing. The withdrawn surroundContents()
    // design REJECTED a selection spanning element boundaries (it throws), so a
    // cross-bubble drag produced a null anchor automatically. cloneRange()
    // accepts it happily, so that signal is gone and we must re-derive it here:
    // a Range escaping its host would otherwise trace an outline around content
    // the reference does not actually cover.
    const inHost = !!anchor.range && host.contains(anchor.range.commonAncestorContainer);
    const runRects = inHost ? [...anchor.range!.getClientRects()] : [];
    const rects = runRects.length ? runRects : [host.getBoundingClientRect()];

    // Viewport-relative: the trace SVG is position:fixed, so the "host" origin
    // for toBoxes is the viewport itself.
    const origin = { left: 0, top: 0 } as DOMRect;
    // rects is returned too — the artifact case re-draws the selected runs above
    // the scrim from these (Task 8), since the originals are behind the dim.
    setGeom({ d: buildUnionPath(toBoxes(rects as DOMRect[], origin)), rects: rects as DOMRect[] });
  }, [anchor]);

  useEffect(() => {
    measure();
    if (!anchor) return;
    window.addEventListener('resize', measure);
    // capture:true so scrolling ANY ancestor scroller (chat-scroll, the artifact
    // pane) re-measures — scroll does not bubble.
    window.addEventListener('scroll', measure, true);
    const ro = new ResizeObserver(measure);
    const host = anchor.host;
    if (host) ro.observe(host);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      ro.disconnect();
    };
  }, [anchor, measure]);

  return geom;
}
```

- [ ] **Step 3: Render the trace**

In `ReferenceOverlay.tsx`, add the imports:

```tsx
import { useReferenceGeometry } from './use-reference-geometry';
```

call the hook:

```tsx
  const { d, rects } = useReferenceGeometry(reference?.anchor ?? null);
```

and render the SVG inside the `<Scrim>`, above the cancel button:

```tsx
      {d && (
        <svg className="reference-trace" aria-hidden="true">
          <path className="wash" d={d} />
          <path className="outline" d={d} pathLength={100} />
        </svg>
      )}
```

- [ ] **Step 4: Verify in the dev instance**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh <branch> --label "Ask Reference"`

Select text in an assistant message, right-click, choose **Ask about this**. Confirm the outline
traces the *selection* (not the whole bubble), the window dims, and Esc cancels. Then repeat with
no selection and confirm the outline wraps the whole bubble instead.

> **Do not test against Destin's installed app.** Dev instance only — workspace rule.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/renderer/components/reference/ src/renderer/styles/globals.css
git commit -m "feat(reference): traced selection outline

Traces the real selection when there is one and the whole host element when
there isn't (Destin's 9B call). Geometry is re-derived from the live DOM on
scroll/resize rather than snapshotted, because stored rects go stale the
instant anything moves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The lift — FLIP travel to centre

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/reference/ReferenceOverlay.tsx`
- Modify: `youcoded/desktop/src/renderer/styles/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 6-7.
- Produces: nothing downstream.

- [ ] **Step 1: Add the lift CSS**

Append to the reference block in `globals.css`:

```css
/* The lifted clone. Chat references travel to centre; artifact references do
   NOT (their selection is already where the user is looking) — spec 2.2. */
.reference-lift {
  position: fixed;
  z-index: 61;                 /* CONTENT_Z[2]; the composer sits one above */
  pointer-events: none;
  transition: transform 460ms cubic-bezier(.22, 1, .36, 1);
  will-change: transform;
}
.reference-lift > * {
  box-shadow: var(--ref-lift-shadow);
  /* A message longer than the viewport must not overflow off-screen. */
  max-height: 70vh;
  overflow-y: auto;
  pointer-events: auto;
}
```

- [ ] **Step 2: Clone and animate**

In `ReferenceOverlay.tsx`, add the lift. Chat kinds only:

```tsx
  const liftRef = useRef<HTMLDivElement | null>(null);
  const travels = reference?.kind === 'chat-text' || reference?.kind === 'chat-code';

  // FLIP: place the clone exactly over the real element (First), then transform
  // it to the viewport centre (Last). Scroll-to-center is NOT an option — the
  // newest message sits directly above the composer with no scroll room beneath
  // it and can never reach centre (spec 2.1).
  useEffect(() => {
    const node = liftRef.current;
    if (!node || !reference?.anchor) return;
    const src = reference.anchor.host;
    if (!src) return;

    const s = src.getBoundingClientRect();
    node.style.left = `${s.left}px`;
    node.style.top = `${s.top}px`;
    node.style.width = `${s.width}px`;
    node.style.transform = 'translate(0, 0)';

    // [Step 2b's non-travelling branch goes here — see below.]

    // Next frame so the browser paints the First position before transitioning.
    const raf = requestAnimationFrame(() => {
      const h = node.offsetHeight;
      const dx = (window.innerWidth - s.width) / 2 - s.left;
      const dy = (window.innerHeight - h) / 2 - s.top;
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    return () => cancelAnimationFrame(raf);
  }, [reference, travels, d]);
```

Clone the source node itself, once, when the reference is set — so the card survives the original
unmounting:

```tsx
  const holderRef = useRef<HTMLDivElement | null>(null);

  // cloneNode(true), NOT innerHTML: no HTML re-parsing, no XSS surface, and
  // canvas/img/scroll state comes across intact. The clone is static, which is
  // safe because Task 3 disables the menu row on the still-streaming turn —
  // every other message is complete and will not change under us.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !reference?.anchor) return;
    const src = reference.anchor.host;
    if (!src) return;
    const copy = src.cloneNode(true) as HTMLElement;
    // (nothing to strip — the anchor never wrote attributes onto the source)
    holder.replaceChildren(copy);
    return () => holder.replaceChildren();
  }, [reference]);
```

and render the holder inside the `<Scrim>`:

```tsx
      <div ref={liftRef} className="reference-lift" data-travels={travels ? 'true' : undefined}>
        <div ref={holderRef} />
      </div>
```

Move the cancel button so it pins to the lifted card rather than the viewport corner when a card is
present — put the `<CloseButton>` inside the `.reference-lift` div, absolutely positioned at
`-top-3 -right-3`, and keep the viewport-corner one only for the artifact (non-travelling) case.

- [ ] **Step 2b: Keep the artifact selection bright above the dim**

Spec §2.2 requires the selected runs to stay at full `--fg` while everything around them dims, and
§5.4 requires the wash to sit *under* the glyphs. The artifact case does not travel, so it has no
lifted card — and the original text is behind a window-wide scrim.

Raising the original spans with `z-index` does **not** work: they live inside `.drawer-pane`, which
is `z-index: 11` and creates a stacking context, so a child at `z-61` is trapped at 11 — below the
scrim at 60.

The clone from Step 2 already solves this — it just needs to be **clipped to the selection**.
Because the artifact clone does not travel, it sits pixel-aligned over the original, so applying
`clip-path` with the same union path the outline traces reveals exactly the selected text at full
`--fg` and hides the rest of the file. Perfect glyph fidelity, no text re-drawing, and it reuses
`buildUnionPath` unchanged.

Extend the Step 2 positioning effect so non-travelling references pin to the source rect and clip:

```tsx
    if (!travels) {
      // Artifact reference: no travel. Pin the clone exactly over the original
      // and clip it to the selection, so only the selected lines read at full
      // --fg while the rest of the window dims. Clipping the clone beats
      // re-drawing the text: multi-line selections (the headline case —
      // "lines 12-18 of engine.ts") keep exact glyphs, fonts, and highlighting.
      node.style.transform = 'translate(0, 0)';
      node.style.clipPath = d ? `path('${d}')` : 'none';
      return;
    }
```

The `d` here is viewport-relative and the clone is `position: fixed`, so the coordinate systems
already agree — no offset conversion needed. `clip-path` re-applies on every re-measure because `d`
is a dependency of the effect, so it tracks scrolling.

Add to the reference CSS block in `globals.css`:

```css
/* Non-travelling (artifact) clone: pinned over the original and clipped to the
   selection, so only the referenced lines stay bright above the dim. */
.reference-lift:not([data-travels="true"]) > * {
  box-shadow: none;
  max-height: none;
  overflow: visible;
}
```

- [ ] **Step 3: Verify in the dev instance**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh <branch> --label "Ask Reference"`

Check all five: (a) the **newest** message — the one directly above the composer — travels to
centre correctly, since that is the case scroll-to-center could never handle; (b) a very long
message scrolls internally rather than overflowing; (c) an artifact selection does **not** travel
and its text stays bright above the dim; (d) a *multi-line* artifact selection clips correctly —
this is the headline case (`lines 12–18 of engine.ts`), so confirm the clip edges track the real
selection shape and keep tracking it while scrolling; (e) the composer stays clickable and typable
over the dim.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/renderer/components/reference/ReferenceOverlay.tsx src/renderer/styles/globals.css
git commit -m "feat(reference): FLIP the referenced message to screen centre

Clones the source and transforms it from its real rect to the viewport centre.
A clone rather than a scroll because the newest message — the most likely
right-click target — sits directly above the composer with no scroll room and
can never reach centre by scrolling.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Reduced effects / reduced motion

**Files:**
- Modify: `youcoded/desktop/src/renderer/styles/globals.css`
- Modify: `youcoded/desktop/src/renderer/components/reference/ReferenceOverlay.tsx`

**Interfaces:**
- Consumes: `reducedEffects` from `ThemeProvider` (existing).
- Produces: nothing.

- [ ] **Step 1: Add the CSS branch**

Append to the reference block in `globals.css`:

```css
/* Reduced effects: outline only. Kills the trace animation, the breathing
   pulse, the glow drop-shadow, and the travel easing — leaving a static
   accent border and the standard overlay shadow. Every new visual effect in
   this app gets one of these branches; no exceptions.

   Keyed off data-reduced stamped by the component, NOT an html attribute:
   verified 2026-07-26 that theme-engine.ts applies reducedEffects by zeroing
   the blur vars and never writes a data-reduced-effects attribute, so an
   attribute selector on <html> would be dead CSS. */
.reference-trace[data-reduced="true"] path.outline {
  animation: none;
  stroke-dashoffset: 0;
  stroke-width: 2;
  filter: none;
}
.reference-lift[data-reduced="true"] { transition: none; }
.reference-lift[data-reduced="true"] > * {
  box-shadow: 0 8px 32px rgba(0, 0, 0, var(--shadow-strength, 0.15));
}

@media (prefers-reduced-motion: reduce) {
  .reference-trace path.outline { animation: none; stroke-dashoffset: 0; }
  .reference-lift { transition: none; }
}
```

- [ ] **Step 2: Flag the elements from the theme setting**

In `ReferenceOverlay.tsx`, add the import:

```tsx
import { useTheme } from '../../state/theme-context';
```

read the setting (`useTheme` is exported at `theme-context.tsx:573`; `reducedEffects` is a boolean
on that context, declared at `:67`):

```tsx
  const { reducedEffects } = useTheme();
```

then add `data-reduced={reducedEffects ? 'true' : undefined}` to both the
`<svg className="reference-trace">` and the `<div className="reference-lift">`.

- [ ] **Step 3: Verify in the dev instance**

Run `bash scripts/run-dev.sh <branch> --label "Ask Reference"`, toggle **Reduced effects** in the
appearance settings, and confirm the trace appears instantly with a flat 2px border, no glow, and
the card appears at centre without travelling.

- [ ] **Step 4: Full suite, typecheck, commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/renderer/styles/globals.css src/renderer/components/reference/ReferenceOverlay.tsx
git commit -m "feat(reference): reduced-effects and reduced-motion fallback

Outline only — no trace animation, breathing pulse, glow, or travel easing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `cd youcoded/desktop && npx vitest run` — full suite green
- [ ] `npx tsc --noEmit` — clean
- [ ] `rg -n "compose-insert" src/` — zero hits
- [ ] `rg -n "#[0-9a-fA-F]{6}" src/renderer/components/reference/ src/renderer/state/reference-context.tsx` — zero hits (no literal colours)
- [ ] `npx vitest run tests/overlay-layer-authority.test.ts tests/primitive-adoption.test.ts` — green
- [ ] Dev-instance pass across **all five themes** (Light, Dark, Midnight, Crème, Halftone
      Dimension) — Halftone is the stress case: hot-pink accent, glass, 2-3x radii
- [ ] Destin's visual sign-off on travel timing and glow intensity

## Deferred (do NOT build in this plan)

Per spec §9: touch/long-press, narrow viewport below 640px, images, multiple simultaneous
references, and a structured transcript reply-to relationship.

---

## Amendment — 2026-07-26, during execution (after Task 2 review)

**The anchor must never mutate the DOM.** The original plan tagged the source
element with a `data-reference-host` attribute and wrapped the selection in marker
spans via `Range.surroundContents()`, storing CSS selectors in the anchor.

The Task 2 reviewer demonstrated empirically that this crashes the renderer:
`surroundContents()` splits the text node it wraps, and chat bubbles
(`UserMessage.tsx`, `AssistantTurnBubble.tsx`) render their text as plain
React-managed JSX children. React's fiber still references the original single text
node, so the next reconcile of that subtree throws
`NotFoundError: Failed to execute 'removeChild'` and takes down the chat view. The
reviewer also found repeated right-clicks produced *nested*, accumulating marker
spans, with no cleanup path anywhere in the renderer.

The defect was dormant in Task 2 (nothing called the builders yet) and would have
fired the moment Task 3 wired the menu.

**Corrected design:** `ReferenceAnchor = { host: Element; range: Range | null }` —
hold the element and a cloned live `Range` directly. This is renderer-local state
that is never serialized, persisted, or sent over IPC, so holding node references is
safe. A live Range re-measures itself across scrolls with no stored rects and no
mutation; `getClientRects()` still returns one rect per line box, which is what the
union outline traces. If React does replace the spanned nodes, the Range yields no
rects and the overlay falls through to the whole-host outline — the fallback §7
already specifies.

Tasks 1, 2, 7 and 8 above have been rewritten in place to match. The corresponding
spec section (§3.1) is amended in the same commit.
