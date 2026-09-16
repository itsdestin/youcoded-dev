# Permission Prompt Composer Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep keyboard focus on an approval prompt when Enter selects Yes, No, or Always allow, instead of briefly focusing the message composer.

**Architecture:** The composer’s existing window-level keyboard listener will ignore events whose target is an interactive control. The permission cards keep their own keyboard handling unchanged; this makes the composer shortcut respect every focused control consistently rather than depending on permission-card-specific exceptions.

**Tech Stack:** React, TypeScript, Vitest, DOM APIs.

## Global Constraints

- Modify only the composer’s auto-focus guard in `desktop/src/renderer/components/InputBar.tsx`.
- Preserve normal composer focus when typing in an unfocused, non-interactive document area.
- Continue protecting text fields and CodeMirror through `isTypingTarget`.
- Treat native interactive controls and explicit interactive ARIA roles as keyboard owners.
- Do not add a regression test; the user explicitly declined one.
- Do not interact with the live app; any manual check must use the isolated dev worktree.
- Add a WHY comment for the non-trivial behavior change.

---

## File Structure

- Modify `desktop/src/renderer/components/InputBar.tsx`: add a local predicate for interactive keyboard targets and use it in the composer’s existing global keydown guard.
- No new files, APIs, IPC, or state are needed.

### Task 1: Protect focused interactive controls from composer auto-focus

**Files:**
- Modify: `desktop/src/renderer/components/InputBar.tsx:358-393`
- Test: No new test by explicit user direction.

**Interfaces:**
- Consumes: `isTypingTarget(el: Element | null | undefined): boolean` from `../utils/is-typing-target`.
- Produces: A local `isInteractiveTarget(el: Element | null | undefined): boolean` predicate used only by the composer’s window-level `keydown` handler.

- [ ] **Step 1: Add the interactive-control predicate immediately above the auto-focus effect**

```ts
  const isInteractiveTarget = (el: Element | null | undefined): boolean => {
    const target = el as HTMLElement | null;
    if (!target) return false;
    return !!target.closest(
      'button, a[href], input, textarea, select, summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]',
    );
  };
```

- [ ] **Step 2: Change the window-level keydown guard to leave focused controls alone**

Replace:

```ts
      if (isTypingTarget(e.target as Element)) return;
```

with:

```ts
      // WHY: a focused prompt/menu control owns Enter and arrows. Taking focus
      // here briefly moves it to the composer before that control can respond.
      if (isTypingTarget(e.target as Element) || isInteractiveTarget(e.target as Element)) return;
```

- [ ] **Step 3: Run focused renderer checks**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/prompt-enter-focus/youcoded/desktop
npx tsc --noEmit
npm run lint -- --quiet src/renderer/components/InputBar.tsx
```

Expected: both commands exit with code 0. If the repository’s lint command does not accept a file argument, run the project’s documented lint command unchanged and report that scope.

- [ ] **Step 4: Run the required desktop verification script**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/prompt-enter-focus/youcoded
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/prompt-enter-focus/youcoded
```

Expected: all applicable desktop checks pass. Report any pre-existing or environment-specific failure separately; do not claim the change is complete until its relevant checks pass.

- [ ] **Step 5: Inspect and commit the focused change**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/prompt-enter-focus/youcoded
git diff --check
git diff -- desktop/src/renderer/components/InputBar.tsx
git add desktop/src/renderer/components/InputBar.tsx
git diff --cached --check
git commit -m "fix(composer): keep focus on prompt controls" -m "Submitted via YouCoded Assistant"
```

Expected: one commit containing only the approved `InputBar.tsx` behavior change. The existing design and plan documents remain separate commits.

## Plan Self-Review

- **Spec coverage:** Task 1 protects permission buttons and all focused interactive controls while retaining the existing non-interactive auto-focus behavior and text-editor guard. No error behavior, IPC, or cross-platform API changes are needed.
- **Placeholder scan:** No incomplete tasks, TODOs, or unspecified code paths remain.
- **Type consistency:** `isInteractiveTarget` accepts the same `Element | null | undefined` shape as `isTypingTarget`; it is local to `InputBar` and used only in the keydown listener.
