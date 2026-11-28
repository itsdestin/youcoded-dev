---
title: Performance rebuild - fix each class of slowness once, at its root, and make it fail a test if it returns
status: draft
date: 2026-11-27
evidence: docs/active/investigations/2026-11-27-hitch-audit.md
cards: 94, 96, 100, 101, 104 (recorder half), 106, 109 (keychain half)
---

# Performance rebuild

## Why this is not another patch round

Every slowdown found in the audit belongs to one of six classes. Each class gets **one mechanism** that removes it at the root, and **one enforcement** that fails a test the day it comes back.

Measurement comes first, so every fix is proven against the real conditions (16 busy sessions, a large history, a heavy theme) rather than the calm lab world that hid these problems.

**What makes it simplest and smallest:** the plan prefers deleting work over adding guards around it.
- A fact remembered instead of re-read.
- An event-driven push instead of a timer that rebuilds everything.
- One shared store instead of a fetch per row.
- One menu primitive instead of four hand-rolled ones.

## The six classes

| Class | What it is today | Root fix (one mechanism) | Enforcement (fails on recurrence) |
|---|---|---|---|
| **C1 Engine blocks** | Per-event folder scan; sync keychain; 581 blocking calls marked "unreviewed hot-path candidate"; profiler rotation | Engine steady state does no synchronous disk or process work. Facts are stored when they become true, never re-derived from disk. The 581 list is cleared: each call is made async, proven startup-only or user-rare, or deleted | **Steady-state trap test:** boot the core with 17 fake sessions and a 2,000-file history, stream 1,000 events, run every timer. Fail on ANY sync fs/child_process call, or any engine task over 50 ms. It catches dynamic call paths that static checks miss |
| **C2 Work not proportional to change and audience** | 10 s timers rebuild every session's summary; background sessions parsed twice; hidden terminals fed 512K chars/s; menu rows fetch their own data | One principle: **cost follows change × who is looking.** Pushes are sent when something changes, never by polling. Hidden terminals keep raw bytes and parse on show. Engine screen-parsing runs only for sessions that need a screen read. Data many lists read comes from one store | Scale assertions in the trap test (events × sessions × history ⇒ constant work per event). The busy-app render test is extended to cover hidden terminals: 0 bytes parsed while hidden. A census of main-process timers: every `setInterval` is registered with a reason and an audience gate |
| **C3 Continuous motion on the busy page thread** | Particles and mascot ticked by JS every 33 ms beside 16 sessions of work | **One motion host:** continuous animation runs as compositor CSS (transform/opacity) or in an OffscreenCanvas worker. The page thread never ticks ambient motion | Lint rule: no timer or rAF loop that drives visuals outside the motion host (drag is exempt) |
| **C4 Paint-expensive stacking** | Menus animate layout under blur; staggered rows in a masked, blurred list; particles under glass bubbles | **One Popover primitive** for every dropdown and menu: it measures position once, enters with transform/opacity, and does blur once. Animated theme layers are cut out under every glass surface | Stylesheet test: no keyframes on layout properties, no per-row stagger, `glass-overlay` only through the primitive |
| **C5 Heavy compute on the page thread** | Sheet/Office parse 1.8 s; hidden terminal parsing | One worker for document parsing (sheets, docx) | The realistic lane's long-frame budget |
| **C6 Measurement blind to the real world** | Software GPU, quiet machine, small fixtures, no menu coverage, 50/100 ms floors, medians, field log never read | **Field loop + realistic lane** (Phase 0) | Release gate reads the owner's field log; lane budgets come from the baseline |

## Phases

### Phase 0 - See the real thing (tooling first)

1. **`hitch-report.mjs` upgrades:**
   - rhythm detection (stalls that lock to a timer phase);
   - attribution to the nearest timer;
   - launch-to-launch comparison;
   - a one-line headline naming the worst repeating stall.
2. **Realistic lane** (built on `real-scale-startup.mjs` and `realism.mjs`):
   - **Setup:** a copy-on-write copy of the real `~/.youcoded/sessions`, 16 sessions with 4 streaming via the fake provider, and the heavy theme.
   - **Actions:** typing in a fresh session; opening the session menu and every dropdown 10 times each.
   - **Metrics:** engine lag, long animation frames with script attribution plus small-task counts, Event Timing at 16 ms, and presented frames from the trace where the display allows.
   - **Validity check:** the lane must reproduce both reported hitches on current master. If it cannot, the lane is wrong and gets fixed before any app fix.
3. **Steady-state trap test** (C1/C2 enforcement above): written first and red on master.
4. **Recorder changes:**
   - keep 20-50 ms frames as counted buckets;
   - add "sessions streaming now" and "menu open" context;
   - add a small-task count per long frame;
   - make the stall profiler rotate only after an early warning.

### Phase 1 - Engine: nothing blocks, nothing re-derived (invisible)

- Session records keep each session's provider. The per-event disk lookup is deleted (#106, 17+ chats lag).
- The 10 s status and summary rebuild timers are replaced by change-driven, diffed pushes.
- The keychain answer is cached (#109, launch freeze).
- PTY screen parsing runs only for sessions that need it, inside the existing pty worker.
- **The 581 unreviewed blocking calls are cleared, one by one.** The trap test says which are hot. Each call is converted to async, regrouped with proof, or deleted, so the list ends with only startup and user-rare entries.

### Phase 2 - Window: hidden costs nothing, motion off the busy thread

- **Terminals:** hidden terminals keep a raw backlog and parse on show (#106).
- **Session menu data:** one shared session-info store, so menu chips appear instantly.
- **Theme motion (#100):** particles move to an OffscreenCanvas worker; the mascot's idle motion becomes CSS; the cut-outs cover all glass; the chrome geometry update skips when nothing changed. Intended to look identical.
- **Documents (#101):** sheet and docx parsing moves into a worker.
- **App root:** the root subscribes only to the status fields it draws, so a status push stops redrawing the 4,777-line app shell.

### Phase 3 - One menu primitive (users see this: deck first)

- Every dropdown (session menu, model picker, folder picker, ||| menu, context menus) moves onto one Popover primitive. Motion is a transform/opacity fade with no row stagger.
- **Before-walkthrough deck** goes to Destin before building. **After-walkthrough deck** goes to Destin once built.

### Phase 4 - Lock it in

- Add the stylesheet guard, the motion-host lint rule and the timer census.
- Add the trap test to `verify.sh`.
- Run the realistic lane nightly (it needs a display).
- Release skill: read the owner's field log with `hitch-report` before go/no-go.
- `performance.md` shrinks to the six classes, each pointing at its guard.

## Decision: the engine stays in the Electron main process (for now)

**Alternative considered:** run the whole core as a `utilityProcess`, the same headless-boot the phone runs. That would guarantee that no engine mistake ever freezes the window's input.

**Why not now:**
- It is the largest, riskiest option: 56 engine files call window-system APIs that would need a bridge.
- It does not fix late chat updates if the core still blocks, so C1 is needed either way.
- The measured causes are fully removable without it.

**Trigger to revisit:** if, after Phases 1-2, the realistic lane still shows engine tasks over 50 ms reaching input, do the split. At that point it also removes the duplicated boot code between `main.ts` and `headless-boot.ts`.

## How every change is kept correct

For each fix:
1. A failing test or lane reproduction comes first.
2. The fix is made.
3. Green test, plus lane before/after numbers.
4. A fresh reviewer who did not write it.
5. `verify.sh`.

Invisible fixes land under the invisible-fix rule, and Destin is told what landed. Visible changes (Phase 3, and any theme look change) wait for his approval on decks.

## Not in this plan (honest scope)

- **#98 sync growth and missed edits:** a correctness problem, not a frame problem.
- **#99 phone watching:** after this plan, using the same lane on the phone.
- **#173, #286:** separate.
- **#104 privacy choices:** Destin's decision.
- **Windows and macOS:** not measured here.
- **Real-GPU numbers:** only where the lane can get a real display.
