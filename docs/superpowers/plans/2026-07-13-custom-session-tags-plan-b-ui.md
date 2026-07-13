# Custom Session Tags — Plan B: UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-facing tag + note UI on top of Plan A's data layer — a shared Tag Picker, tag chips, a note editor, a fixed in-session StatusBar element, and the Resume Browser + close-prompt surfaces — and finish removing `helpful`.

**Architecture:** All new UI lives under `src/renderer/components/tags/` + two hooks. The registry is read through a `useTagRegistry` hook (live via the `tags:changed` push); a session's applied tags + note come from `useSessionMeta` (via `session:get-meta`, refetched on `session:meta-changed`). Tag colors are 10 fixed CSS custom properties tinted per-chip with `color-mix`, so they read legibly on every theme with no per-theme definitions. The StatusBar element is a fixed control (not a toggleable widget) that also appears locked in the widget-config menu.

**Tech Stack:** TypeScript, React, Tailwind utility classes + the app's semantic CSS tokens, Vitest.

**Prerequisite:** **Plan A must be merged first** (`docs/superpowers/plans/2026-07-13-custom-session-tags-plan-a-data-layer.md`). This plan imports the types and channels Plan A locks: `TagRecord`/`TagColor`/`TAG_COLORS`/`tagFlagKey` from `src/shared/tags.ts`, `PastSession.tags?`/`note?`, and `window.claude.tags.*` + `session.setTag/setNote/getMeta` + `on.tagsChanged`.

**Companion spec:** `docs/superpowers/specs/2026-07-13-custom-session-tags-design.md`.

**Working directory:** Same `youcoded` worktree conventions as Plan A (Session Bootstrap section there). Continue on the same feature branch as Plan A so the two ship together — do NOT release Plan A without Plan B (the retired `helpful` button would otherwise fail silently in the interim). Run tests/build from `<worktree>/desktop`.

---

## File Structure

**Create (youcoded/desktop):**
- `src/renderer/hooks/useTagRegistry.ts` — loads/creates/updates/deletes tags; live via `tags:changed`.
- `src/renderer/hooks/useSessionMeta.ts` — a session's applied tag ids + note; live via `session:meta-changed`.
- `src/renderer/components/tags/TagChip.tsx` — one colored tag chip.
- `src/renderer/components/tags/NoteEditor.tsx` — note textarea with the 8000-char cap.
- `src/renderer/components/tags/TagPicker.tsx` — search / create / apply / inline edit (rename, recolor, archive, delete).
- `src/renderer/components/tags/SessionTagsChip.tsx` — the fixed StatusBar element + popup.

**Modify (youcoded/desktop):**
- `src/renderer/styles/globals.css` — add the 10 `--tag-*` color tokens.
- `src/renderer/components/StatusBar.tsx` — render `SessionTagsChip`; add the locked widget-config row.
- `src/renderer/components/resume-browser-filters.ts` — drop `helpful`; custom-tag filter + note/label search.
- `src/renderer/components/ResumeBrowser.tsx` — replace flag pills with Priority/Complete toggles + Tag Picker + note; chips after the name; custom-tag filter.
- `src/renderer/components/CloseSessionPrompt.tsx` — Priority/Complete + Tag Picker + note.
- `src/renderer/App.tsx` — wire the close-prompt confirm to set tags + note.
- `tests/resume-browser-filters.test.ts` — extend for tag filter + note/label search.

---

## Task 1: Tag color tokens

**Files:**
- Modify: `youcoded/desktop/src/renderer/styles/globals.css`

Ten fixed mid-tone hues in `:root`. TagChip tints them with `color-mix`, so a single definition works on every theme (no per-`[data-theme]` blocks).

- [ ] **Step 1: Add the tokens**

In `globals.css`, inside the top-level `:root { ... }` block (beside the other base color custom properties), add:

```css
  /* Custom session-tag palette (design §"Color palette"). Fixed mid-tone hues
     that read legibly on both light and dark themes; TagChip tints them via
     color-mix so they sit on any theme surface without per-theme overrides. */
  --tag-red: #E5484D;
  --tag-orange: #E8730C;
  --tag-amber: #C99700;
  --tag-green: #2E9B57;
  --tag-teal: #12A594;
  --tag-blue: #3B82C4;
  --tag-indigo: #5B5BD6;
  --tag-purple: #8E4EC6;
  --tag-pink: #D6409F;
  --tag-gray: #7A7F87;
```

- [ ] **Step 2: Verify build**

Run: `cd youcoded/desktop && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/globals.css
git commit -m "feat(tags): 10 fixed tag color tokens"
```

---

## Task 2: useTagRegistry hook

**Files:**
- Create: `youcoded/desktop/src/renderer/hooks/useTagRegistry.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/renderer/hooks/useTagRegistry.ts
// Live view of the tag registry. Loads via window.claude.tags.list() and
// refetches whenever a tags:changed push arrives (any window/device mutation).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TagRecord, TagColor } from '../../shared/tags';

export interface TagRegistryApi {
  tags: TagRecord[];                 // non-deleted; includes archived
  byId: Map<string, TagRecord>;
  loading: boolean;
  reload: () => void;
  create: (label: string, color: TagColor) => Promise<TagRecord | null>;
  update: (id: string, patch: { label?: string; color?: TagColor; archived?: boolean }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useTagRegistry(): TagRegistryApi {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    Promise.resolve((window as any).claude.tags.list())
      .then((list: TagRecord[]) => setTags(Array.isArray(list) ? list : []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    const off = (window as any).claude.on?.tagsChanged?.(() => reload());
    return () => { if (typeof off === 'function') off(); };
  }, [reload]);

  const create = useCallback(async (label: string, color: TagColor) => {
    const res: any = await (window as any).claude.tags.create(label, color);
    reload();
    return res?.ok ? (res.tag as TagRecord) : null;
  }, [reload]);

  const update = useCallback(async (id: string, patch: { label?: string; color?: TagColor; archived?: boolean }) => {
    await (window as any).claude.tags.update(id, patch); reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await (window as any).claude.tags.delete(id); reload();
  }, [reload]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  return { tags, byId, loading, reload, create, update, remove };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/renderer/hooks/useTagRegistry.ts
git commit -m "feat(tags): useTagRegistry hook (live registry via tags:changed)"
```

---

## Task 3: useSessionMeta hook

**Files:**
- Create: `youcoded/desktop/src/renderer/hooks/useSessionMeta.ts`

Reads the ACTIVE session's applied tags + note. Refetches on any `session:meta-changed` for that session (robust to whether the push carries a `flag` or a `note` field).

- [ ] **Step 1: Write the hook**

```ts
// src/renderer/hooks/useSessionMeta.ts
import { useCallback, useEffect, useState } from 'react';

export interface SessionMetaApi {
  tags: Set<string>;   // applied tag ids
  note: string;
  setTag: (tagId: string, next: boolean) => void;
  setNote: (text: string) => void;
}

export function useSessionMeta(sessionId: string | null): SessionMetaApi {
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [note, setNoteState] = useState('');

  const refetch = useCallback(() => {
    if (!sessionId) { setTags(new Set()); setNoteState(''); return; }
    Promise.resolve((window as any).claude.session.getMeta(sessionId))
      .then((m: { tags: string[]; note: string }) => {
        setTags(new Set(m?.tags ?? []));
        setNoteState(m?.note ?? '');
      })
      .catch(() => { setTags(new Set()); setNoteState(''); });
  }, [sessionId]);

  useEffect(() => {
    refetch();
    // sessionMetaChanged cb is (sessionId, payload) on both preload + remote-shim.
    const off = (window as any).claude.on?.sessionMetaChanged?.((sid: string) => {
      if (sid === sessionId) refetch();
    });
    return () => { if (typeof off === 'function') off(); };
  }, [sessionId, refetch]);

  const setTag = useCallback((tagId: string, next: boolean) => {
    if (!sessionId) return;
    setTags((prev) => { const s = new Set(prev); if (next) s.add(tagId); else s.delete(tagId); return s; });
    try { (window as any).claude.session.setTag(sessionId, tagId, next); } catch { /* backend logs */ }
  }, [sessionId]);

  const setNote = useCallback((text: string) => {
    if (!sessionId) return;
    setNoteState(text);
    try { (window as any).claude.session.setNote(sessionId, text); } catch { /* backend logs */ }
  }, [sessionId]);

  return { tags, note, setTag, setNote };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add src/renderer/hooks/useSessionMeta.ts
git commit -m "feat(tags): useSessionMeta hook (live-session tags/note via get-meta)"
```

---

## Task 4: TagChip component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/tags/TagChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/tags/TagChip.tsx
import React from 'react';
import type { TagRecord } from '../../../shared/tags';

// A colored, plain-word tag chip (no status glyphs — per user preference). The
// color is a slot key (e.g. 'tag-blue') → var(--tag-blue); color-mix tints the
// fill/border so it reads on any theme surface.
export function TagChip({ tag, onRemove, className = '' }: {
  tag: Pick<TagRecord, 'label' | 'color'>;
  onRemove?: () => void;
  className?: string;
}) {
  const c = `var(--${tag.color})`;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm text-[10px] leading-none border ${className}`}
      style={{
        color: c,
        backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
      }}
    >
      {tag.label}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-60 hover:opacity-100 leading-none"
          aria-label={`Remove ${tag.label}`}
        >×</button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add src/renderer/components/tags/TagChip.tsx
git commit -m "feat(tags): TagChip component"
```

---

## Task 5: NoteEditor component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/tags/NoteEditor.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/tags/NoteEditor.tsx
import React, { useEffect, useState } from 'react';

export const NOTE_MAX = 8000;

// Freeform per-session note. maxLength hard-caps at 8000 chars (design); a
// remaining-count appears near the limit. Saves on blur (only when changed).
export function NoteEditor({ value, onSave, placeholder = 'Add a note…' }: {
  value: string;
  onSave: (text: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const remaining = NOTE_MAX - draft.length;
  const commit = () => { if (draft !== value) onSave(draft); };
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        maxLength={NOTE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-sm bg-inset text-fg text-[11px] px-2 py-1.5 border border-edge-dim focus:border-accent outline-none"
      />
      {remaining < 500 && (
        <span className="text-[9px] self-end text-fg-faint">{remaining} left</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add src/renderer/components/tags/NoteEditor.tsx
git commit -m "feat(tags): NoteEditor component (8000-char cap)"
```

---

## Task 6: TagPicker component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/tags/TagPicker.tsx`

Search + create-and-apply + apply/remove + inline rename/recolor/archive/delete + show-archived. Reused by every tagging surface.

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/tags/TagPicker.tsx
import React, { useMemo, useState } from 'react';
import type { TagRecord } from '../../../shared/tags';
import { TAG_COLORS, DEFAULT_TAG_COLOR, TagColor } from '../../../shared/tags';
import { TagRegistryApi } from '../../hooks/useTagRegistry';
import { TagChip } from './TagChip';

export function TagPicker({ appliedIds, onToggle, registry }: {
  appliedIds: Set<string>;
  onToggle: (tagId: string, next: boolean) => void;
  registry: TagRegistryApi;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => registry.tags
    .filter((t) => showArchived || !t.archived)
    .filter((t) => !q || t.label.toLowerCase().includes(q)), [registry.tags, q, showArchived]);

  const exactExists = registry.tags.some((t) => t.label.toLowerCase() === q && !t.archived);
  const canCreate = q.length > 0 && !exactExists;

  const handleCreate = async () => {
    const tag = await registry.create(query.trim(), DEFAULT_TAG_COLOR);
    if (tag) { onToggle(tag.id, true); setQuery(''); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); handleCreate(); } }}
        placeholder="Search or create a tag…"
        className="w-full rounded-sm bg-inset text-fg text-[11px] px-2 py-1 border border-edge-dim focus:border-accent outline-none"
      />
      <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        {canCreate && (
          <button onClick={handleCreate}
            className="text-left px-2 py-1 text-[11px] rounded-sm hover:bg-inset text-accent">
            + Create “{query.trim()}”
          </button>
        )}
        {visible.map((t) => (
          <TagRow key={t.id} tag={t} applied={appliedIds.has(t.id)}
            editing={editing === t.id}
            onToggle={() => onToggle(t.id, !appliedIds.has(t.id))}
            onEdit={() => setEditing(editing === t.id ? null : t.id)}
            registry={registry} />
        ))}
        {visible.length === 0 && !canCreate && (
          <div className="px-2 py-1 text-[10px] text-fg-faint">No tags yet — type a name to create one.</div>
        )}
      </div>
      <button onClick={() => setShowArchived((v) => !v)}
        className="self-start text-[9px] text-fg-faint hover:text-fg-muted">
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>
    </div>
  );
}

function TagRow({ tag, applied, editing, onToggle, onEdit, registry }: {
  tag: TagRecord; applied: boolean; editing: boolean;
  onToggle: () => void; onEdit: () => void; registry: TagRegistryApi;
}) {
  const [label, setLabel] = useState(tag.label);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-1 py-1 rounded-sm hover:bg-inset">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left min-w-0">
          <span className="w-3 h-3 shrink-0 rounded-sm border"
            style={{ backgroundColor: applied ? `var(--${tag.color})` : 'transparent',
                     borderColor: `var(--${tag.color})` }} />
          <TagChip tag={tag} />
          {tag.archived && <span className="text-[9px] text-fg-faint shrink-0">archived</span>}
        </button>
        <button onClick={onEdit} className="text-fg-faint hover:text-fg-muted text-[10px] shrink-0" title="Edit tag" aria-label="Edit tag">✎</button>
      </div>
      {editing && (
        <div className="ml-5 mr-1 mb-1 flex flex-col gap-1.5 p-2 rounded-sm bg-inset border border-edge-dim">
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            onBlur={() => { if (label.trim() && label !== tag.label) registry.update(tag.id, { label: label.trim() }); }}
            className="rounded-sm bg-canvas text-fg text-[11px] px-1.5 py-1 border border-edge-dim outline-none" />
          <div className="flex flex-wrap gap-1">
            {TAG_COLORS.map((c) => (
              <button key={c} onClick={() => registry.update(tag.id, { color: c as TagColor })}
                className={`w-4 h-4 rounded-full border ${tag.color === c ? 'ring-2 ring-offset-1 ring-offset-inset ring-fg-dim' : ''}`}
                style={{ backgroundColor: `var(--${c})`, borderColor: `var(--${c})` }}
                aria-label={c} title={c} />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => registry.update(tag.id, { archived: !tag.archived })}
              className="text-[10px] text-fg-muted hover:text-fg">{tag.archived ? 'Unarchive' : 'Archive'}</button>
            <button onClick={() => registry.remove(tag.id)}
              className="text-[10px] text-[#DD4444] hover:brightness-125">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build + commit**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/renderer/components/tags/TagPicker.tsx
git commit -m "feat(tags): shared TagPicker (search/create/apply/inline edit)"
```

---

## Task 7: SessionTagsChip (StatusBar element + popup)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/tags/SessionTagsChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/tags/SessionTagsChip.tsx
// The fixed in-session StatusBar element: colored tag dots + a notebook icon,
// or an "Add tags" button when the session has none. Opens a popup with the
// shared TagPicker + NoteEditor.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from '../overlays/Overlay';
import { useEscClose } from '../../hooks/use-esc-close';
import { useTagRegistry } from '../../hooks/useTagRegistry';
import { useSessionMeta } from '../../hooks/useSessionMeta';
import type { TagRecord } from '../../../shared/tags';
import { TagPicker } from './TagPicker';
import { NoteEditor } from './NoteEditor';

export function SessionTagsChip({ sessionId }: { sessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const registry = useTagRegistry();
  const meta = useSessionMeta(sessionId);
  useEscClose(open, () => setOpen(false));

  const appliedTags = [...meta.tags]
    .map((id) => registry.byId.get(id))
    .filter((t): t is TagRecord => !!t);
  const hasContent = appliedTags.length > 0 || meta.note.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!sessionId}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-edge-dim hover:bg-inset transition-colors max-w-[220px] disabled:opacity-50"
        title="Tags & note for this session"
      >
        {hasContent ? (
          <span className="flex items-center gap-1 overflow-hidden">
            {appliedTags.slice(0, 3).map((t) => (
              <span key={t.id} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: `var(--${t.color})` }} />
            ))}
            {meta.note && <NotebookIcon className="w-3 h-3 text-fg-muted shrink-0" />}
            {appliedTags.length > 0 && (
              <span className="truncate text-fg-2">
                {appliedTags[0].label}{appliedTags.length > 1 ? ` +${appliedTags.length - 1}` : ''}
              </span>
            )}
          </span>
        ) : (
          <span className="text-fg-muted">Add tags</span>
        )}
      </button>
      {open && createPortal(
        <>
          <Scrim layer={2} onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
            <OverlayPanel
              layer={2}
              className="w-full max-w-[360px] max-h-[80vh] flex flex-col pointer-events-auto"
              style={{ position: 'relative', zIndex: 'auto' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
                <h2 className="text-sm font-bold text-fg">Tags &amp; note</h2>
                <button onClick={() => setOpen(false)}
                  className="text-fg-muted hover:text-fg-2 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-sm hover:bg-inset">×</button>
              </div>
              <div className="px-4 py-3 space-y-3 overflow-y-auto">
                <TagPicker appliedIds={meta.tags} onToggle={meta.setTag} registry={registry} />
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Note</label>
                  <NoteEditor value={meta.note} onSave={meta.setNote} />
                </div>
              </div>
            </OverlayPanel>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function NotebookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add src/renderer/components/tags/SessionTagsChip.tsx
git commit -m "feat(tags): SessionTagsChip (fixed StatusBar element + popup)"
```

---

## Task 8: Wire SessionTagsChip into StatusBar + locked config row

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/StatusBar.tsx`

- [ ] **Step 1: Imports**

Add near the top imports:

```ts
import { getPlatform } from '../remote-shim';
import { SessionTagsChip } from './tags/SessionTagsChip';
```

- [ ] **Step 2: Render the fixed element**

In the `StatusBar` render, immediately AFTER the permission-mode chip block (the `{permissionMode && ( ... )}` block that ends ~line 703), add:

```tsx
      {/* Session tags & note — fixed control (design §"In-session surface").
          Hidden on Android (touch UI deferred); shown on desktop + remote. */}
      {getPlatform() !== 'android' && <SessionTagsChip sessionId={sessionId ?? null} />}
```

- [ ] **Step 3: Add `locked` to WidgetDef + the WidgetId + a "Session" category**

Add `'session-tags'` to the `WidgetId` union (line ~170):

```ts
  | 'open-tasks'
  | 'session-tags'
  | 'restore-progress';
```

Add `locked?: boolean` to `WidgetDef` (line ~180):

```ts
interface WidgetDef {
  id: WidgetId;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;     // core control — always on, non-toggleable in the config menu
  description: string;
  bestFor: string;
}
```

Add a new category to `WIDGET_CATEGORIES` (place it first, before 'Rate Limits'):

```ts
  {
    name: 'Session',
    widgets: [
      {
        id: 'session-tags',
        label: 'Tags & Note',
        defaultVisible: true,
        locked: true,
        description: 'Tag the current session and attach a freeform note. Always shown next to the model and permission controls.',
        bestFor: 'Everyone. Organize and annotate sessions so they\'re easy to find and resume later.',
      },
    ],
  },
```

- [ ] **Step 4: Render locked rows as always-on in WidgetConfigPopup**

In `WidgetConfigPopup`, inside the `cat.widgets.map((w) => { ... })` row, replace the toggle `<button onClick={() => toggle(w.id)} ...>` with a version that is non-interactive and force-checked when `w.locked`. Change the opening of that button to:

```tsx
                          {/* Toggle checkbox — locked widgets (fixed controls)
                              render always-checked and non-interactive. */}
                          <button
                            onClick={() => { if (!w.locked) toggle(w.id); }}
                            disabled={w.locked}
                            className={`flex items-center gap-2 flex-1 text-left ${w.locked ? 'cursor-default' : ''}`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                                (w.locked || visible.has(w.id))
                                  ? 'bg-accent border-accent text-on-accent'
                                  : 'border-edge-dim'
                              }`}
                            >
                              {(w.locked || visible.has(w.id)) && (
                                <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                </svg>
                              )}
                            </span>
                            <span className="text-[11px] text-fg">{w.label}</span>
                            {w.locked && <span className="text-[9px] text-fg-faint">always on</span>}
                          </button>
```

- [ ] **Step 5: Typecheck + build**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/StatusBar.tsx
git commit -m "feat(tags): render SessionTagsChip in StatusBar + locked config row"
```

---

## Task 9: Resume-browser filters — custom-tag filter + note/label search

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/resume-browser-filters.ts`
- Test: `youcoded/desktop/tests/resume-browser-filters.test.ts`

Drop `helpful`; the filter's tag selection becomes custom-tag ids; search also matches note text and applied-tag labels.

- [ ] **Step 1: Write the failing test**

Add to `tests/resume-browser-filters.test.ts`:

```ts
import { applyFilters, FilterState, PastSessionLike } from '../src/renderer/components/resume-browser-filters';

const s = (over: Partial<PastSessionLike>): PastSessionLike => ({
  sessionId: 'a', name: 'Session', projectSlug: 'p', projectPath: '/p',
  lastModified: 1, size: 0, ...over,
});
const base: FilterState = {
  search: '', showComplete: true, stickyComplete: new Set(),
  selectedProjects: new Set(), selectedTagIds: new Set(), tagLabelById: {},
};

describe('custom-tag filter', () => {
  it('keeps only sessions carrying a selected tag', () => {
    const list = [s({ sessionId: 'a', tags: ['tag_1'] }), s({ sessionId: 'b', tags: ['tag_2'] })];
    const out = applyFilters(list, { ...base, selectedTagIds: new Set(['tag_1']) });
    expect(out.map((x) => x.sessionId)).toEqual(['a']);
  });
});

describe('search over note + tag labels', () => {
  it('matches the note text', () => {
    const list = [s({ sessionId: 'a', note: 'oauth callback bug' }), s({ sessionId: 'b' })];
    expect(applyFilters(list, { ...base, search: 'oauth' }).map((x) => x.sessionId)).toEqual(['a']);
  });
  it('matches an applied tag label via tagLabelById', () => {
    const list = [s({ sessionId: 'a', tags: ['tag_1'] }), s({ sessionId: 'b' })];
    const out = applyFilters(list, { ...base, search: 'auth', tagLabelById: { tag_1: 'Auth rewrite' } });
    expect(out.map((x) => x.sessionId)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/resume-browser-filters.test.ts`
Expected: FAIL — `selectedTagIds`/`tagLabelById` not on `FilterState`; `tags`/`note` not on `PastSessionLike`.

- [ ] **Step 3: Edit `resume-browser-filters.ts`**

Change the flag type and extend the interfaces:

```ts
export type FlagName = 'priority' | 'complete';

export interface PastSessionLike {
  sessionId: string;
  name: string;
  projectSlug: string;
  projectPath: string;
  lastModified: number;
  size: number;
  flags?: Partial<Record<FlagName, boolean>>;
  tags?: string[];      // applied custom-tag ids
  note?: string;
}

export interface FilterState {
  search: string;
  showComplete: boolean;
  stickyComplete: Set<string>;
  selectedProjects: Set<string>;
  selectedTagIds: Set<string>;          // custom-tag ids (replaces the old flag-tag set)
  tagLabelById: Record<string, string>; // id → label, for search
}
```

Replace the `tagFiltered` block and the search block in `applyFilters`:

```ts
  const tagFiltered = state.selectedTagIds.size === 0
    ? projectFiltered
    : projectFiltered.filter((s) => (s.tags ?? []).some((id) => state.selectedTagIds.has(id)));

  if (!state.search.trim()) return tagFiltered;
  const q = state.search.toLowerCase();
  return tagFiltered.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true;
    if (s.projectPath.toLowerCase().includes(q)) return true;
    if ((s.note ?? '').toLowerCase().includes(q)) return true;
    // Applied-tag labels (resolved via the id→label map).
    return (s.tags ?? []).some((id) => (state.tagLabelById[id] ?? '').toLowerCase().includes(q));
  });
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/resume-browser-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/resume-browser-filters.ts tests/resume-browser-filters.test.ts
git commit -m "feat(tags): resume-browser filter by custom tags + note/label search"
```

---

## Task 10: ResumeBrowser — tags & note surfaces

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx`

Remove `helpful`; use the shared Tag Picker + note in the expanded row; show chips + reserved indicators AFTER the name; convert the "Tags" filter to custom tags. This is the largest edit — work through the sub-steps.

- [ ] **Step 1: Flag constants → reserved only**

Replace the flag constants (lines ~146-162):

```ts
const FLAG_ORDER: FlagName[] = ['priority', 'complete'];
const FLAG_LABEL: Record<FlagName, string> = {
  priority: 'Priority',
  complete: 'Complete',
};
```

Delete `FLAG_BADGE` and `TAG_FILTER_OPTIONS` (both are replaced below). Remove `helpful` from the local `PastSession` interface's `flags` comment and add `tags?: string[]; note?: string;` fields to it (mirroring `PastSessionLike`).

- [ ] **Step 2: Registry hook + filter state**

Near the other hooks at the top of the component, add:

```ts
  const registry = useTagRegistry();
```

(import it: `import { useTagRegistry } from '../hooks/useTagRegistry';` plus `import { TagPicker } from './tags/TagPicker';`, `import { TagChip } from './tags/TagChip';`, `import { NoteEditor } from './tags/NoteEditor';`.)

Replace the `selectedTags` state (line ~235) with:

```ts
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
```

Wherever `applyFilters`/filter state is assembled, pass the new fields:

```ts
    selectedTagIds,
    tagLabelById: Object.fromEntries(registry.tags.map((t) => [t.id, t.label])),
```

(and remove the old `selectedTags` from that object.)

- [ ] **Step 3: Per-session tag/note handlers**

Add alongside `toggleFlag` (line ~375):

```ts
  // Apply/remove a custom tag on a past session (optimistic + persist).
  const toggleTag = async (sessionId: string, tagId: string, next: boolean) => {
    setSessions((prev) => prev.map((s) =>
      s.sessionId === sessionId
        ? { ...s, tags: next ? [...new Set([...(s.tags ?? []), tagId])] : (s.tags ?? []).filter((t) => t !== tagId) }
        : s));
    try { await (window as any).claude.session.setTag(sessionId, tagId, next); } catch { /* logged */ }
  };

  const saveNote = async (sessionId: string, note: string) => {
    setSessions((prev) => prev.map((s) => s.sessionId === sessionId ? { ...s, note } : s));
    try { await (window as any).claude.session.setNote(sessionId, note); } catch { /* logged */ }
  };
```

In the existing `session:meta-changed` subscription (line ~401), extend it to route tag + note changes (in addition to reserved flags):

```ts
    const off = sub((sid: string, meta: { flag?: string; value?: boolean; note?: string }) => {
      setSessions((prev) => prev.map((s) => {
        if (s.sessionId !== sid) return s;
        let next = s;
        if (meta.flag && meta.flag.startsWith('tag:')) {
          const id = meta.flag.slice(4);
          const tags = meta.value ? [...new Set([...(s.tags ?? []), id])] : (s.tags ?? []).filter((t) => t !== id);
          next = { ...next, tags };
        } else if (meta.flag === 'priority' || meta.flag === 'complete') {
          next = { ...next, flags: { ...(next.flags || {}), [meta.flag]: !!meta.value } };
        }
        if (typeof meta.note === 'string') next = { ...next, note: meta.note };
        return next;
      }));
    });
```

- [ ] **Step 4: Expanded row — reserved toggles + Tag Picker + note**

Replace the "Flags" pill block (lines ~486-513) with:

```tsx
        {/* Reserved flags — Priority pins to top; Complete hides from the menu. */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Flags</label>
          <div className="flex gap-1">
            {FLAG_ORDER.map((flag) => {
              const active = !!s.flags?.[flag];
              return (
                <button
                  key={flag}
                  onClick={(e) => { e.stopPropagation(); toggleFlag(s.sessionId, flag, !active); }}
                  className={`flex-1 px-1 py-1 rounded-sm text-[10px] transition-colors ${
                    active ? 'bg-accent text-on-accent font-medium' : 'bg-inset text-fg-dim hover:bg-edge'
                  }`}
                  aria-pressed={active}
                >
                  {FLAG_LABEL[flag]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom tags */}
        <div onClick={(e) => e.stopPropagation()}>
          <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Tags</label>
          <TagPicker
            appliedIds={new Set(s.tags ?? [])}
            onToggle={(tagId, next) => toggleTag(s.sessionId, tagId, next)}
            registry={registry}
          />
        </div>

        {/* Note */}
        <div onClick={(e) => e.stopPropagation()}>
          <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Note</label>
          <NoteEditor value={s.note ?? ''} onSave={(text) => saveNote(s.sessionId, text)} />
        </div>
```

- [ ] **Step 5: Collapsed row — chips + indicators AFTER the name**

In `renderSessionRow`, remove the pre-name badge block (lines ~549-557). After the name element (the `<div className="text-sm truncate ...">{name}</div>` region), add:

```tsx
            {/* Reserved-flag indicators + custom-tag chips, AFTER the name. */}
            {(s.flags?.priority || s.flags?.complete || (s.tags && s.tags.length > 0)) && (
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {s.flags?.priority && <span className="text-[9px] text-accent" title="Priority">Priority</span>}
                {s.flags?.complete && <span className="text-[9px] text-fg-faint" title="Complete">Complete</span>}
                {(s.tags ?? []).map((id) => {
                  const t = registry.byId.get(id);
                  return t ? <TagChip key={id} tag={t} /> : null;
                })}
                {s.note && <span className="text-[9px] text-fg-faint" title={s.note}>📝 note</span>}
              </div>
            )}
```

(Keep the name element itself intact — only the badge placement moves from before to after.)

- [ ] **Step 6: Filter bar — custom-tag multi-select**

Replace the "Tags" `FilterPill` + dropdown block (lines ~705-762) so the dropdown lists the registry's non-archived tags instead of `TAG_FILTER_OPTIONS`:

```tsx
              <FilterPill
                buttonRef={tagsTriggerRef}
                active={selectedTagIds.size > 0}
                hasPopup
                expanded={openPill === 'tags'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (openPill === 'tags') { setOpenPill(null); setTagsDropdownPos(null); }
                  else { setTagsDropdownPos(measureDropdown(tagsTriggerRef, 200)); setOpenPill('tags'); }
                }}
              >
                <span>{selectedTagIds.size === 0 ? 'Tags' : `${selectedTagIds.size} tag${selectedTagIds.size > 1 ? 's' : ''}`}</span>
                <span className="text-fg-faint text-[9px]">▾</span>
              </FilterPill>
              {openPill === 'tags' && tagsDropdownPos && createPortal(
                <div
                  ref={tagsDropdownRef}
                  className="layer-surface w-52 max-w-[calc(100vw-1rem)] max-h-64 overflow-y-auto"
                  style={{ position: 'fixed', top: tagsDropdownPos.top, left: tagsDropdownPos.left, zIndex: 60 }}
                >
                  {registry.tags.filter((t) => !t.archived).length === 0 && (
                    <div className="px-2.5 py-1.5 text-xs text-fg-faint">No tags yet.</div>
                  )}
                  {registry.tags.filter((t) => !t.archived).map((t) => {
                    const checked = selectedTagIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTagIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                          return next;
                        })}
                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-inset transition-colors text-fg-2"
                      >
                        <span className={`w-3 h-3 shrink-0 rounded-sm border ${checked ? 'bg-accent border-accent' : 'border-edge'}`} />
                        <TagChip tag={t} />
                      </button>
                    );
                  })}
                </div>,
                document.body,
              )}
```

Also update the "reset filters on open" effect (line ~251 area) to reset `setSelectedTagIds(new Set())` instead of `setSelectedTags`.

- [ ] **Step 7: Typecheck + build**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: PASS. (Fix any remaining `selectedTags`/`FLAG_BADGE`/`helpful`/`TAG_FILTER_OPTIONS` references the compiler flags.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/ResumeBrowser.tsx
git commit -m "feat(tags): ResumeBrowser — Tag Picker + note, chips after name, custom-tag filter"
```

---

## Task 11: CloseSessionPrompt + App wiring

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/CloseSessionPrompt.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

Let the close prompt set reserved flags, apply tags, and add a note in one step.

- [ ] **Step 1: Rework CloseSessionPrompt**

Replace the flag constants + `FlagName` (lines ~5-12):

```ts
type FlagName = 'priority' | 'complete';
const FLAG_ORDER: FlagName[] = ['priority', 'complete'];
const FLAG_LABEL: Record<FlagName, string> = { priority: 'Priority', complete: 'Complete' };
```

Change the confirm contract (lines ~18-21) to carry tags + note:

```ts
  // onConfirm receives the reserved flags to set true, the tag ids to apply,
  // and the note text (empty = none). App fires the corresponding IPC calls.
  onConfirm: (result: { flags: FlagName[]; tagIds: string[]; note: string }) => void;
```

Add registry + tag/note state (beside the existing `sel` state):

```ts
  const registry = useTagRegistry();
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
```

(imports: `useTagRegistry`, `TagPicker`, `NoteEditor` from the same relative paths as elsewhere — `../hooks/useTagRegistry`, `./tags/TagPicker`, `./tags/NoteEditor`.)

Reset them when the prompt opens (extend the existing `if (open)` effect ~line 44):

```ts
      setSel({ priority: false, complete: false });
      setTagIds(new Set());
      setNote('');
```

In the flag pill row (lines ~83-107), iterate the new `FLAG_ORDER` (Priority/Complete only), then AFTER that row add the Tag Picker + note:

```tsx
          <div className="flex flex-col gap-1.5 mt-2">
            <label className="text-[10px] uppercase tracking-wider text-fg-muted">Tags</label>
            <TagPicker
              appliedIds={tagIds}
              onToggle={(id, next) => setTagIds((prev) => { const s = new Set(prev); if (next) s.add(id); else s.delete(id); return s; })}
              registry={registry}
            />
            <label className="text-[10px] uppercase tracking-wider text-fg-muted mt-1">Note</label>
            <NoteEditor value={note} onSave={setNote} />
          </div>
```

Update the confirm button handler to pass the new shape:

```ts
    onConfirm({ flags: FLAG_ORDER.filter((f) => sel[f]), tagIds: [...tagIds], note });
```

(Adjust the `sel` state type to `Record<FlagName, boolean>` = `{ priority, complete }`.)

- [ ] **Step 2: Update App.tsx confirm wiring**

Replace the `onConfirm` handler (lines ~2599-2610):

```tsx
        onConfirm={(result) => {
          const id = closePromptFor;
          if (!id) return;
          // Reserved flags (priority/complete), custom tags, and the note — each
          // fire-and-forget; main resolves the desktop id to the Claude id.
          for (const flag of result.flags) {
            try { (window as any).claude.session.setFlag(id, flag, true); } catch {}
          }
          for (const tagId of result.tagIds) {
            try { (window as any).claude.session.setTag(id, tagId, true); } catch {}
          }
          if (result.note) { try { (window as any).claude.session.setNote(id, result.note); } catch {} }
          try { window.claude.session.destroy(id); } catch {}
          setClosePromptFor(null);
        }}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/CloseSessionPrompt.tsx src/renderer/App.tsx
git commit -m "feat(tags): CloseSessionPrompt sets tags + note; App wires the calls"
```

---

## Task 12: Sweep for `helpful` + full verification

**Files:**
- Possibly modify: any renderer file still referencing `helpful`.

- [ ] **Step 1: Find stragglers**

Run: `cd youcoded && git grep -n "helpful" -- desktop/src | grep -iv "helpfulness"`
Expected: no matches in renderer code. Fix any that remain (they'd be leftover comments or a missed `FLAG_LABEL.helpful`).

- [ ] **Step 2: Full test suite**

Run: `cd youcoded/desktop && npm test`
Expected: PASS (filters + all existing).

- [ ] **Step 3: Full typecheck + build**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Runtime smoke test (per live-app-safety rule — dev instance only)**

Run: `bash scripts/run-dev.sh` from the workspace root. In the **YouCoded Dev** window, verify:
- StatusBar shows an "Add tags" button beside the model/permission pills; clicking opens the popup; creating + applying a tag updates the button to show colored dots; adding a note shows the notebook icon.
- Widget config menu (gear) shows "Tags & Note" under a "Session" group, checked and locked ("always on").
- Resume Browser: expanded row has Priority/Complete + Tag Picker + note; chips render AFTER the name; the Tags filter lists your custom tags; search matches note text.
- Close a session → the prompt offers tags + a note.
- Rename/recolor/archive a tag from the picker; confirm chips update everywhere.

Shut the dev server down when done (per the workspace "pushing to master green-lights closing the dev server" rule — here, when the smoke test passes).

- [ ] **Step 5: Commit any smoke-test fixes, then open the PR**

The feature branch now carries BOTH Plan A and Plan B. Open a single PR to `youcoded` master containing the whole feature (data layer + UI), so `helpful` removal and its replacement ship together.

```bash
git push -u origin feat/session-tags-data-layer
gh pr create --repo itsdestin/youcoded --title "Custom session tags & notes" --body "Implements docs/superpowers/specs/2026-07-13-custom-session-tags-design.md (Plans A + B). Replaces the fixed helpful flag with first-class custom tags + per-session notes."
```

---

## Self-review notes (author)

- **Spec coverage:** shared Tag Picker with search-to-create + inline rename/recolor/archive/delete + show-archived (T6); colored chips, plain words, no glyphs (T4); note editor with 8000-char cap (T5); fixed StatusBar element with "Add tags" empty state + locked config row (T7–T8); chips/indicators AFTER the name (T10-S5); custom-tag filter + note/label search (T9–T10); close-prompt tagging (T11); reserved Priority/Complete retained, `helpful` removed (T9–T12); Android hidden on touch (T8 `getPlatform() !== 'android'`), data still syncs via Plan A.
- **Type consistency:** consumes Plan A's `TagRecord`/`TagColor`/`TAG_COLORS`/`DEFAULT_TAG_COLOR` (`src/shared/tags.ts`), `PastSession.tags?`/`note?`, `window.claude.tags.*`, `session.setTag/setNote/getMeta`, `on.tagsChanged`. `useTagRegistry`/`useSessionMeta` APIs are referenced identically across TagPicker, SessionTagsChip, ResumeBrowser, CloseSessionPrompt.
- **Deferred (future extensions, per spec):** dedicated "Manage tags" view; free color picker; Android tagging UI; orphaned-application cleanup after tag delete.
