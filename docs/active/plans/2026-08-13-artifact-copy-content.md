# Artifact Copy-Content Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy file content" button to both artifact viewer toolbars that copies the open file's raw text to the clipboard — the hand-off for pasting into Discord, Teams, email, or a text message — with honest feedback and no dead states.

**Architecture:** A single reusable `CopyContentButton` component, rendered in the SessionDrawer header and the FilesTab ArtifactDetail header. It copies the file's raw text via the existing `copyText()` helper (`components/context-menu/clipboard.ts`), which already handles the insecure-origin/remote case with an `execCommand` fallback and returns a boolean — so the button can report real success/failure instead of silently swallowing errors. No new IPC, no Kotlin change, no Android build step, no parity test. The component takes a `variant` so it renders correctly in both toolbars (bare icon square in SessionDrawer, labeled pill in Project View), and is hidden for binary files.

**Tech Stack:** React/TypeScript (renderer only) · `copyText()` (existing, `components/context-menu/clipboard.ts`) · no new IPC

## Global Constraints

- **Use the existing `copyText()` helper — NEVER call `navigator.clipboard?.writeText(...).catch(() => {})` inline.** `copyText` (context-menu/clipboard.ts:8-18) falls back to a hidden textarea + `execCommand('copy')` on insecure origins (plain-http remote access) and **returns `boolean`** — the button must surface that result. Precedent for consuming it: `build-menu.ts:2,79,135`.
- **Honest feedback, no silent failures.** Button label/tooltip flips to **Copied** on success and **"Couldn't copy"** on failure, reverting after ~1500ms — the same pattern as FilesTab's existing Copy-path button (`FilesTab.tsx:754-757`, `ShareSheet.tsx:47,57`). Do not fire-and-forget.
- **Text-like files only.** If the artifact is binary (`contentInfo.binary === true`), the button is **hidden entirely** (image/PDF/docx/xlsx content is `null`; copying would be binary garbage). If `content === null` for a non-binary reason (still loading / missing), the button renders **disabled**.
- **No new IPC channel.** Copying to clipboard is renderer-side on all platforms (desktop, Android WebView, remote browser). `copyText` covers the remote insecure-origin gap. Do not add `shell:mail-to` or any IPC for this round — deferred to the follow-up.
- **Per-toolbar styling, not one hardcoded look.** SessionDrawer uses bare 28px icon squares (`IconBtn`, `SessionDrawer.tsx:99-112`). FilesTab uses labeled pills (`TOOL_BTN_NEUTRAL` in `detail-tool-icons.tsx:13-14`). The `variant` prop (`'icon' | 'pill'`) drives the look so the control doesn't look foreign in either surface.
- **File content is already in the renderer** on both hosts: `useArtifactContent(...).content` at `SessionDrawer.tsx:173` and `FilesTab.tsx:717`, plus `contentInfo.binary` for gating.
- **Reuse, don't invent glyphs.** Use the existing `check` path (`SessionDrawer.tsx:72`, `M20 6 9 17l-5-5`) for the copied state. Write the copy-document glyph as ordinary `<path>` elements — do **not** use the `PATHS`-string-split trick, and do not import the SessionDrawer-local icon map into Project View.
- **No verification task that proves nothing.** The workbench boot check only opens pages and doesn't click — it cannot verify this button. Do not frame it as verification. Use a focused component test (with `vi.mock` of `copyText`) for behavior, and offer Destin interactive visual verification at the end.
- Sub-repo change goes to `youcoded/`, in a worktree. Plan lives at `docs/active/plans/2026-08-13-artifact-copy-content.md`. After merge, archive the plan and update ROADMAP in the same session.

## Deferred follow-up (do NOT build now — documented for a later round)

The original ask also included "launch the email/text client." That is deferred because, on desktop, `mailto:` is the *only* built-in way to open an email composer but can't attach files (it only pastes a bounded snippet into an address), and the correct native mechanism (`ACTION_SEND` system share sheet with attachments) only exists on Android. Shipping copy-content now gives universal "paste into any app" with honest feedback; proper email/native-share is its own piece of work. When that round happens, use the native Android `ACTION_SEND` share sheet (reaches email-with-attachment, Signal, Drive, etc.) and on desktop a mechanism that can actually carry the file (attach or reveal), not a mailto snippet. This plan deliberately leaves that scope out.

---

### Task 1: Create the shared `CopyContentButton` component (test-first)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/CopyContentButton.tsx`
- Test: `youcoded/desktop/src/renderer/components/artifact-views/CopyContentButton.test.tsx`

**Interfaces:**
- Consumes: `copyText(text: string): Promise<boolean>` (existing, `../context-menu/clipboard`)
- Produces: `<CopyContentButton content: string | null; binary?: boolean; variant?: 'icon' | 'pill'; />` — a button that copies `content` and flips to Copied/"Couldn't copy", hidden when `binary`, disabled when `content` is null.

- [ ] **Step 1: Write the failing test**

  `CopyContentButton.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import CopyContentButton from './CopyContentButton';
  import * as clipboard from '../context-menu/clipboard';

  vi.mock('../context-menu/clipboard', () => ({
    copyText: vi.fn(),
    readText: vi.fn(),
  }));

  const copyText = vi.mocked(clipboard.copyText);
  beforeEach(() => { copyText.mockReset(); });

  describe('CopyContentButton', () => {
    it('copies content and shows Copied on success', async () => {
      copyText.mockResolvedValue(true);
      render(<CopyContentButton content="line1\nline2" />);
      fireEvent.click(screen.getByTitle('Copy file content'));
      await waitFor(() => expect(copyText).toHaveBeenCalledWith('line1\nline2'));
      expect(await screen.findByTitle('Copied')).toBeTruthy();
    });

    it('shows "Couldn\'t copy" when the copy fails', async () => {
      copyText.mockResolvedValue(false);
      render(<CopyContentButton content="abc" />);
      fireEvent.click(screen.getByTitle('Copy file content'));
      expect(await screen.findByTitle("Couldn't copy")).toBeTruthy();
    });

    it('is hidden for binary files', () => {
      const { container } = render(<CopyContentButton content={null} binary />);
      expect(container.querySelector('button')).toBeNull();
    });

    it('is disabled when content is null (non-binary)', () => {
      render(<CopyContentButton content={null} binary={false} />);
      expect(screen.getByTitle('Copy file content').closest('button')?.disabled).toBe(true);
    });

    it('renders a labeled pill in pill variant', () => {
      render(<CopyContentButton content="x" variant="pill" />);
      expect(screen.getByText('Copy file content')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd youcoded/desktop && npx vitest src/renderer/components/artifact-views/CopyContentButton.test.tsx`
  Expected: FAIL — `CopyContentButton` module does not exist

- [ ] **Step 3: Implement `CopyContentButton`**

  ```tsx
  // CopyContentButton — copies the open artifact's raw TEXT to the clipboard.
  // WHY a dedicated button rather than reusing the existing "Copy path": this
  // copies CONTENT, not the path — the hand-off for pasting the file into
  // Discord/Teams/email/a text.
  // WHY copyText() instead of raw navigator.clipboard: it falls back to a
  // hidden textarea + execCommand for insecure origins (plain-http remote
  // access) and RETURNS a boolean, so we can report real success/failure
  // instead of silently swallowing errors. Binary files are hidden entirely
  // (their content is null and copying would be binary garbage).
  import React, { useCallback, useEffect, useRef, useState } from 'react';
  import { copyText } from '../context-menu/clipboard';

  type Variant = 'icon' | 'pill';
  type Feedback = 'idle' | 'copied' | 'error';

  interface Props {
    content: string | null;
    /** binary files never render the button */
    binary?: boolean;
    /** 'icon' = SessionDrawer square; 'pill' = Project View labeled button */
    variant?: Variant;
  }

  export default function CopyContentButton({ content, binary = false, variant = 'icon' }: Props) {
    const [feedback, setFeedback] = useState<Feedback>('idle');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    if (binary) return null; // never usable — hide rather than offer garbage copy

    const canCopy = content !== null;

    const handleClick = useCallback(async () => {
      if (content === null) return;
      // copyText covers desktop/Android AND the remote insecure-origin fallback,
      // and returns false rather than throwing when it can't — surface that.
      const ok = await copyText(content);
      if (timerRef.current) clearTimeout(timerRef.current);
      setFeedback(ok ? 'copied' : 'error');
      timerRef.current = setTimeout(() => setFeedback('idle'), 1500);
    }, [content]);

    const label = feedback === 'copied' ? 'Copied'
      : feedback === 'error' ? "Couldn't copy" : 'Copy file content';
    const icon = feedback === 'copied'
      ? <path d="M20 6 9 17l-5-5" /> // existing check glyph
      : (<>
          <path d="M7 3h8a1 1 0 0 1 1 1v1" />
          <path d="M4 6h9a1 1 0 0 1 1 1v8" />
          <rect x="4" y="6" width="9" height="8" rx="1" />
          <path d="M11 14v-3" />
          <path d="m9 11 2-2 2 2-2-2v3" />
        </>);

    if (variant === 'pill') {
      return (
        <button
          type="button"
          disabled={!canCopy}
          onClick={handleClick}
          title={label}
          className="px-3 py-1.5 rounded-md bg-inset text-fg-2 hover:text-fg border border-edge-dim hover:border-edge text-[12.5px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
          {label}
        </button>
      );
    }

    // icon variant — SessionDrawer header square, feedback via glyph swap + tooltip
    return (
      <button
        type="button"
        disabled={!canCopy}
        onClick={handleClick}
        title={label}
        className={`w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0 border transition-colors ${
          feedback === 'error'
            ? 'text-destructive-fg bg-well border-edge'
            : feedback === 'copied'
              ? 'text-fg bg-well border-edge'
              : 'text-fg-dim border-transparent hover:text-fg hover:bg-well hover:border-edge'
        } disabled:opacity-40 disabled:cursor-default`}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
      </button>
    );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd youcoded/desktop && npx vitest src/renderer/components/artifact-views/CopyContentButton.test.tsx`
  Expected: PASS

- [ ] **Step 5: Confirm `copyText` is imported by reference so the mock intercepts it**

  The implementation imports `{ copyText }` as a named binding (column-style import at top), and the test `vi.mock`s the module. Run the test again — it must still pass (this catches the case where an inline `import * as` or a re-export would bypass the mock).

  Run: `cd youcoded/desktop && npx vitest src/renderer/components/artifact-views/CopyContentButton.test.tsx`
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add youcoded/desktop/src/renderer/components/artifact-views/CopyContentButton.tsx \
          youcoded/desktop/src/renderer/components/artifact-views/CopyContentButton.test.tsx
  git commit -m "feat(ui): add shared CopyContentButton with honest feedback
  Copies the artifact's raw text via existing copyText() (remote insecure-origin
  fallback included) and reports Copied/Couldn't copy instead of swallowing
  failures. Hidden for binary files, disabled while content unread. Per-toolbar
  variant styling (icon square / labeled pill)."
  ```

---

### Task 2: Wire CopyContentButton into the SessionDrawer header

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionDrawer.tsx` (content at line 173, header tools at ~line 664-666)

**Interfaces:**
- Consumes: `CopyContentButton` (Task 1), local `content` + `contentInfo` (`SessionDrawer.tsx:173`)
- Produces: a copy-content icon in the SessionDrawer toolbar

- [ ] **Step 1: Import the component (icon variant)**

  Add near the other artifact-view imports:
  ```typescript
  import CopyContentButton from './artifact-views/CopyContentButton';
  ```

- [ ] **Step 2: Render it in the header between Open-external and Copy-path**

  Replace (~line 664-666):
  ```tsx
        {isElectron && <IconBtn name="external" title="Open with the default app" onClick={handleOpenExternal} />}
        <CopyContentButton content={content} binary={contentInfo?.binary === true} variant="icon" />
        <IconBtn name="copypath" title="Copy path" onClick={handleCopyPath} />
        {isElectron && <IconBtn title="Reveal in folder" glyph={<RevealFolderIc />} onClick={handleReveal} />}
  ```

- [ ] **Step 3: Run the component test + a render check**

  Run: `cd youcoded/desktop && npx vitest src/renderer/components/artifact-views/CopyContentButton.test.tsx`
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add youcoded/desktop/src/renderer/components/SessionDrawer.tsx
  git commit -m "feat(ui): wire CopyContentButton into SessionDrawer toolbar"
  ```

---

### Task 3: Wire CopyContentButton into the FilesTab ArtifactDetail header

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/project-view/tabs/FilesTab.tsx` (content at line 717, tools block ~line 761-799)

**Interfaces:**
- Consumes: `CopyContentButton` (Task 1), local `content` + `contentInfo` (`FilesTab.tsx:717-718`)
- Produces: a labeled copy-content button in the Project View artifact-detail header

- [ ] **Step 1: Import the component (pill variant)**

  Add import:
  ```typescript
  import CopyContentButton from '../../artifact-views/CopyContentButton';
  ```

- [ ] **Step 2: Render it in the tools block, after the existing Copy-path button**

  Inside the `tools` fragment (after the `Copy path` button, ~line 794-797), add:
  ```tsx
      <CopyContentButton content={content} binary={contentInfo?.binary === true} variant="pill" />
  ```

- [ ] **Step 3: Run the component test + a render check**

  Run: `cd youcoded/desktop && npx vitest src/renderer/components/artifact-views/CopyContentButton.test.tsx`
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add youcoded/desktop/src/renderer/components/project-view/tabs/FilesTab.tsx
  git commit -m "feat(ui): wire CopyContentButton into Project View artifact header"
  ```

---

### Task 4: Full verification, interactive handoff, and cleanup

**Files:**
- None modified — verification only. Do NOT add a false workbench-boot "verification": the boot check only opens pages and never clicks, so it cannot exercise this button.

- [ ] **Step 1: Run the desktop verify suite**

  Run: `bash scripts/verify.sh <worktree>` (tsc, vitest, knip, eslint, ast-grep)
  Expected: exit 0. Ensure `CopyContentButton` is reported as USED in both call sites (not dead code).

- [ ] **Step 2: Confirm knip sees both call sites**

  Run: `cd youcoded/desktop && npx knip`
  Expected: `CopyContentButton` appears in the used set (referenced from SessionDrawer + FilesTab).

- [ ] **Step 3: Android build smoke check**

  Because the shared React UI renders on Android, the WebView bundle must rebuild.
  Run: `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew :app:assembleDebug`
  Expected: builds. No Kotlin change is needed this round (clipboard is renderer-side).

- [ ] **Step 4: Offer Destin interactive visual verification**

  Per the live-app-safety rule, flag the interactive check rather than scripting it:
  `bash scripts/run-dev.sh <worktree> --label "Copy Content"` so Destin can eyeball the button in both toolbars (dev window) and on the dev APK. Confirm the Copied/"Couldn't copy" feedback and that the button is hidden for a binary file like a PNG.

- [ ] **Step 5: Merge + cleanup**

  Merge to master, push, then remove the worktree and branch. Confirm the commit landed on master before deleting the branch.
  ```bash
  git branch --contains <sha>   # must list master
  git worktree remove <path>
  git push origin --delete <branch>
  git branch -D <branch>
  ```

- [ ] **Step 6: Archive the plan + update ROADMAP**

  In the SAME session as the merge (workspace rule), move this plan to `docs/archive/plans/` and flip/append the ROADMAP item for artifact share (status: copy-content shipped; email/native `ACTION_SEND` open as a documented follow-up). Commit to `youcoded-dev`.
