---
title: Performance rebuild - fix each class of slowness once, at its root, and make it fail a test if it returns
status: active
date: 2026-11-27
revised: 2026-11-27 (independent review, amendments B1-B3, S1-S9, N1-N6 applied)
evidence: docs/active/investigations/2026-11-27-hitch-audit.md
cards: 94, 96, 100, 101, 106 fully addressed; 104 recorder half and 109 keychain half only (those cards stay open for the rest)
---

# Performance rebuild

## Principle

Every slowdown found belongs to one of six classes. Each class gets **one mechanism** that removes it at the root and **one enforcement** that fails a test if it returns.

The plan prefers deleting work over adding machinery. The review showed that several first-draft fixes would have rebuilt things the code already does well, so **every fix is now gated on a measurement or a proven cause**, and nothing is built speculatively.

## The six classes

| Class | Root fix | Enforcement |
|---|---|---|
| **C1 Engine blocks** | The per-event and per-timer paths do no synchronous disk or process work. Blocking calls that the lane or trap test show to be hot are converted; every other allowlisted call is reviewed and regrouped with a reason (install, sync and startup paths keep their lock and ordering semantics). | Trap test (call counts, not time), and `SessionRecords.note/summaries/facts` added to `PROTECTED` in `main-blocking-calls.test.ts` |
| **C2 Work out of proportion to change and audience** | Fix only what is measured. The status and summary pushes are already async, diffed, audience-gated and event-driven, and stay as they are. | Trap test asserts the work does not grow with history size or event count |
| **C3 Continuous motion on the busy page thread** | Chrome-geometry diffing first (certain). Particles in a worker only if a lane A/B shows it removes the stutter. | Existing `mascot-rig-pauses-when-hidden` and `no-unstepped-infinite-animation`; a motion-loop lint rule if the worker lands |
| **C4 Paint-expensive stacking** | `dropdown-in` becomes transform plus opacity; the per-row stagger is removed; one cached session-info read for all rows. A shared Popover primitive is optional and goes through the deck gate. | Stylesheet test: no keyframes on layout properties, no per-row stagger in a blurred panel |
| **C5 Heavy compute on the page thread** | Sheet and docx parsing in a worker | Lane long-frame budget |
| **C6 Measurement blind to real use** | Field loop plus realistic lane (Phase 0) | Release gate reads the owner's field log, locally only |

## Phases

### Step 1 - land now: the folder-scan fix (invisible)

- **Change:** `create-runtime.ts:667` asks `nativeHost.isNative(id)` (live sessions, in memory) instead of `isNativeSessionId(id)` (which falls back to a disk scan). The live source only returns a native session's queue and mode, which are empty for anything not live.
- **What stays on the disk check:** callers that need "was this ever native" stay where they are, because all are click paths: the phantom-record gate (`ipc/session.ts:517-553`), `namingIdentity` and browse.
- **Also fixed:** `ipc/session.ts:349` runs one synchronous scan per live session on every browse open. It moves to one async listing per open.
- **Guards:**
  - a unit test: `records.note()` for an unknown Claude Code id makes **0** directory reads;
  - `note`, `summaries` and `facts` join `PROTECTED`.
  - The guard is proven red with the fix reverted.
- **Expected effect:** most engine stalls disappear, especially with many Claude Code chats open. This fix brings the biggest benefit on Windows, where folder scans cost more.

### Phase 0 - see the real thing (in parallel with Step 1)

1. **`hitch-report.mjs`:**
   - per-launch phase histogram;
   - rhythm detection;
   - attribution of stalls to the nearest timer, plus the stalls with no recent request;
   - launch-to-launch comparison;
   - a headline naming the worst repeating stall.
   - Step 1 is its first before/after.
2. **Trap test** (vitest, built like `create-runtime.test.ts`):
   - settle startup;
   - count `readdirSync`/`lstatSync`/`child_process` calls during N `records.note()` calls for **Claude Code-kind** ids, plus one summaries tick;
   - assert 0;
   - assert the count is the same for a 100-file and a 2,000-file fake history, and for 100 and 1,000 events.
   - No wall-clock assertions.
3. **Realistic lane**, reusing `real-scale-startup.mjs`'s safety model:
   - **Privacy:**
     - reflink copy into gitignored `scratch/` on /home;
     - deleted unless `--keep`;
     - startup sweep of leftover copies;
     - real history never opened for writing;
     - sync and chatsearch copies excluded;
     - no network and no sync settings in the fixture HOME;
     - nothing leaves the machine.
   - **Sessions:** 16 **Claude Code-kind** sessions, 4 streaming through `fake-claude.cjs`.
   - **Workload:** heavy theme; typing in a fresh session; every dropdown opened 10 times.
   - **Metrics:** engine stall counts, long frames with attribution, Event Timing at 16 ms, trace frames where available.
   - **Gate:** the engine hitch must reproduce as a count. The paint and GPU hitches may be "not reproducible under software drawing" and proceed on trace checks.
   - **Scheduling:** run on request, never automatically while Destin is using the machine.
4. **Recorder:**
   - counters only for 20-50 ms frames (no per-frame lines);
   - numeric "sessions streaming" and "menu open" fields;
   - frames are not recorded while no window is visible;
   - the stall profiler saves profiles of short stalls only when a defined signal fires (an engine stall of 100 ms or more in the last minute), instead of only for stalls of 2 s or more.
   - The field log stays local and is never uploaded.

### Phase 1 - engine, the measured remainder (invisible)

- **Keychain:** cache the answer (launch freeze).
- **Git status:** cut `git:file-status` from three processes per call to one batched call (1,044 stalls followed it in one launch).
- **Stall profiler:** lower its rotation cost.
- **Queue length:** add a "queue changed" notify, so the 10 s timer is no longer its only carrier.
- **Blocking-call review:** the trap test or lane names the hot allowlisted calls, and only those are converted. Every remaining "unreviewed" entry is regrouped with a written reason.
- **Unexplained stalls:** any unexplained stall cluster left in the per-launch histogram after Step 1 is profiled through the recorder change and fixed by cause.

### Phase 2 - window (invisible)

- **Chrome geometry:** `useChromeGeometry` skips unchanged rectangles (certain, tiny).
- **App root:** a status push updates only the fields it draws, through a selector store, guarded by the busy-app test (stops redrawing the 4,777-line shell).
- **Session info:** one shared session-info store (menu chips appear at once).
- **Documents:** sheet and docx parsing moves to a worker (#101).
- **Measured A/B only:**
  - particles in an OffscreenCanvas worker, with a fallback where the browser lacks it (Android WebView), stopped by Reduced Effects;
  - cut-outs under every glass surface;
  - lowering `HIDDEN_RATE` for hidden terminals if the lane shows hidden parsing costs frames.
  - Look changes, if any, go on a deck.

### Phase 3 - menus

- **3a (CSS, visible but tiny):** `dropdown-in` becomes transform plus opacity, and the 20 ms row stagger is removed. Shown to Destin before and after.
- **3b (optional):** a shared Popover primitive, only if 3a leaves real duplication. It must respect `session-strip-motion.md` (Shift-hold switcher, drag reorder), the existing `Overlay.tsx` and `anchor-position.ts`, and the one-blur rule. Deck gate.

### Phase 4 - lock it in

- The trap test runs in `verify.sh`.
- Stylesheet guard.
- Motion lint rule, if the worker landed.
- The release skill reads the owner's field log locally with `hitch-report` before go/no-go.
- `performance.md` is reorganised around the six classes, each pointing at its guard.

## Dropped after review (and why)

- **Making engine screen-parsing conditional, or moving it into the pty worker.** It was measured at 2-4% of one core for 8 streaming sessions (`session-screens.ts` header). An earlier conditional version missed dialogs in idle sessions. Its synchronous reads feed the send gate. It does nothing for Android.
- **A new "parse on show" mechanism for hidden terminals.** `terminal-feeder.ts` already rate-limits hidden terminals and flushes on show. Their buffer feeds prompt and plan-menu detection. Freezing them moves the cost into the click. If measurement shows a cost, tune `HIDDEN_RATE` instead.
- **Replacing the 10 s status and summary timers.** They are async, diffed, audience-gated and event-driven, and they carry data no event announces (statusline files, usage cache, announcements, sync markers). After Step 1 they are cheap.
- **"Clear all 581 blocking calls."** Most are install, sync and startup paths where converting them to async changes lock and ordering semantics, for no benefit to users.
- **"Store the provider in the session record."** One line (live-only check) does the job without a second copy of the truth that can drift.

## Decision: the engine stays in the Electron main process for now

Moving the core into a `utilityProcess` would guarantee that input never waits on the engine, but it is the largest and riskiest option.

**Trigger to revisit**, measured as a count on the fixed lane fixture: after Phases 1-2, more than N engine stalls of 100 ms or more per hour of the lane workload. N is set from the post-Step-1 baseline.

## Correction to the audit

The "60% of stalls at one phase of a 10 s cycle" figure holds for launch `85e4545d` only. In launch `eb127c8e` the top phase holds 19%. Stalls per minute were flat across 16-20 sessions in this data, so "worse with more sessions" is not shown by it. `terminal-ack` as the "last request" is uninformative: it is simply the most frequent message.

## How each change is kept correct

For each change:
1. A red test or a lane count comes first.
2. The fix is made.
3. Green test, plus before/after numbers.
4. A fresh reviewer.
5. `verify.sh`.

Invisible fixes land under the invisible-fix rule, and Destin is told afterwards. Visible ones (3a, 3b, any look change) wait for his approval.

## Not in this plan

- #98 sync growth and missed edits.
- #99 phone, after this plan, on the same lane.
- #173, #286.
- #104 privacy choices.
- The rest of #109.
- Windows and macOS measurement.
- Real-GPU numbers beyond what the lane's display allows.
