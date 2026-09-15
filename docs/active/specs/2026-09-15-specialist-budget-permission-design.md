---
status: active
date: 2026-09-15
owner: Destin (product decisions) / YouCoded Assistant (design)
component: youcoded/desktop
related:
  - docs/active/specs/2026-08-11-native-specialists-design.md
  - youcoded/docs/native-runtime.md
---

# Specialist budget permission gate

## Purpose

YouCoded currently refuses every new specialist after a native conversation has launched 30 specialists. The limit is a runaway-delegation safeguard, but an intentional long-running conversation can legitimately need more help. The user must be able to approve one additional specialist or waive the cap for the rest of the live session without turning the safeguard into a permanent permission.

This change also prevents normal use from falling back to titles such as `Worker 15`: the randomized specialist-name pool must be much larger than the normal 30-launch allowance.

## Approved user experience

The 31st attempted new specialist launch raises a native permission card through the existing permission rail. It uses the standard three colored permission actions and the existing keyboard behavior, beginning on the one-time **Yes** action.

Card copy:

> **The Assistant has used 30 specialists this session and is trying to hire another.**
>
> YouCoded limits specialist calls to 30 per session to help save your tokens. Continue?

Actions, in visual and keyboard order:

1. **Yes, just this specialist**
   - Approves only the pending specialist.
   - Keeps the cap active.
   - A later additional hire raises a new permission prompt.
2. **Waive cap for this session**
   - Approves the pending specialist.
   - Removes the specialist launch cap for the remainder of this live session.
   - Occupies the existing “Always allow” visual position, but does not create a remembered permission rule or a row in Settings → Permissions.
3. **No, continue inline**
   - Refuses only the pending specialist.
   - Keeps the cap active.
   - Returns model-facing guidance:

     > The user declined another specialist. Continue the work inline. Do not attempt to use additional specialists unless the user explicitly asks you to.

   - A later attempt still raises a fresh permission prompt. The refusal is not remembered or used to suppress future prompts.

The card keeps the standard permission-card interaction model: it has no separate close or dismiss control. The user answers with one of the three actions above, or interrupts the session through the existing cancellation path.

The short feature route is approved: reuse the existing permission-card anatomy and show the affected Before/After state in a UI review deck before backend implementation. The full questions-deck and UX-review cycle are skipped.

## Scope and definitions

- **Session** means the currently live parent native session. The count and waiver are host memory scoped by parent session id and clear when that live session is destroyed or the app runtime restarts.
- **Launch** means successful creation of a new specialist child.
- Starting a new foreground or background specialist is subject to the budget.
- Resuming, steering, interrupting, or listing an existing specialist is not a launch and never invokes this gate.
- The ordinary allowance remains `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30`.
- Hosted/local concurrency ceilings and the single-writer invariant remain independent and unchanged.
- A specialist child still cannot delegate specialists of its own.

## Architecture

### 1. A dedicated native budget ask

Replace the Task tool’s synchronous hard-refusal check with an asynchronous host service that authorizes a new specialist launch. While fewer than 30 specialists have successfully launched, it returns immediately without showing UI. Once the session has successfully created 30 children, it raises a `PermissionBroker` ask under a dedicated synthetic tool name such as `specialist_budget`.

The ask travels through the existing native permission path:

`Task` → host launch authorization → `PermissionBroker` → `PermissionRequest` → shared reducer/`ToolCard` → `permission:respond` → `PermissionBroker` decision → pending Task call.

This preserves desktop, remote-browser, and shared-renderer behavior without introducing a new IPC channel or transcript event type.

The budget ask is not a permission-engine rule. The broker’s `always` decision is interpreted locally as “waive this live session’s cap,” never persisted through `PermissionStore`.

### 2. Decision model

The host maps the existing three permission decisions onto budget-specific outcomes:

- ordinary `allow` → allow this launch only;
- `allow` with the native Always-allow marker → mark this parent session waived and allow this launch;
- `deny` → refuse this launch and return the approved corrective model message;
- session interrupt/cancellation → unwind the pending Task call through the existing cancellation behavior.

`ToolCard` recognizes `specialist_budget` as a synthetic budget gate and supplies its dedicated copy and labels. The chat reducer must classify it as a synthetic gate in both permission-resolution paths: the local `PERMISSION_RESPONDED` path and the remote/replay `PERMISSION_RESOLVED_ELSEWHERE` path. Both close the card as complete because no real tool execution corresponds to the synthetic ask. Unlike `max_steps` and `doom_loop`, this budget gate intentionally exposes the Always-allow position with the session-scoped label.

### 3. State and ordering

The host owns per-parent launch state:

- committed successful-launch count;
- reserved-but-not-yet-created launch count;
- cap-waived boolean;
- at most one active over-cap authorization decision for that parent.

Every new launch atomically evaluates and updates the budget state before returning a budget reservation. The decision uses `committed + reserved` so parallel calls crossing 29 → 30 → 31 cannot all observe the same remaining allowance and let launch 31 slip through without a prompt. A successful child creation commits its reservation to the launch count; denial, cancellation, or pre-creation failure releases it. This atomic reservation is brief and does not serialize the specialists’ actual work.

Over-cap authorizations for the same parent are serialized. This prevents parallel Task calls from presenting duplicate budget cards or racing the one-time/waived state:

- if the first pending call chooses **Waive cap for this session**, queued calls proceed without another budget prompt;
- if it chooses **Yes, just this specialist**, the next queued over-cap launch presents its own prompt;
- if it chooses **No, continue inline**, that launch is refused and the next distinct attempt may present another prompt.

Concurrency reservation happens before a budget reservation or over-cap permission is requested, so a call that cannot run because the session is already at its concurrency ceiling never consumes launch allowance or bothers the user with a budget question. Denial, cancellation, or failure before child creation releases both reservations. After child creation commits the budget reservation, a later execution failure releases only the concurrency reservation and the successful launch remains counted.

The successful-launch count increments only after the child session has actually been created. Invalid calls, permission-envelope refusals, capacity refusals, denied budget asks, and failures before child creation do not consume the normal allowance. Once the cap is waived, counting may continue for diagnostics but no further budget prompt is raised during that live session.

Parent teardown clears every associated count, reservation, waiver, queue, and pending authorization even when the parent has no currently live children. Cleanup belongs in the unconditional parent-destroy path rather than relying on `destroyChildrenOf()`, whose no-children early return cannot provide this guarantee.

### 4. Run roster beyond 30

The current `specialistRunsFor()` replay path truncates the delegation ledger to `SPECIALIST_SPAWN_BUDGET_PER_SESSION` records. Remove that truncation and return every run recorded for the parent. Specialists 31+ must retain their title, status, report association, and management controls after session switching, renderer reconnect, and remote reconnect; waiving the launch cap must not make later specialists disappear from the run roster.

### 5. Specialist names

Keep the existing random draw without replacement per parent session. Expand `name-pools.json` to at least 128 distinct, neutral first names so ordinary and realistically extended sessions continue receiving human-readable names.

The numbered fallback remains defensive for truly exhausted or malformed state, but a test must enforce both:

- every configured first name is unique;
- `POOL_SIZE` is comfortably greater than the normal allowance (at least four times `SPECIALIST_SPAWN_BUDGET_PER_SESSION`).

Descriptors remain role-specific and randomized as they are today.

## User-interface requirements

- Reuse `PermissionButtons` and the permission-card layout; do not create a separate dialog or custom button row.
- Preserve the standard permission colors: one-time Yes, session waiver in the Always-allow position, No last.
- Keep all three actions together when wrapping, including below the 640 px narrow breakpoint.
- Default keyboard focus remains on **Yes, just this specialist**, never on the session-wide waiver.
- The session-wide action must say **Waive cap for this session**, not the generic **Always allow**, because no permanent permission is stored.
- The completed synthetic card must not be left “running” or later fail as “Turn ended.”
- The Before/After review deck must show the wide and narrow card before backend implementation begins.

## Failure and lifecycle behavior

- If the session is interrupted while the permission card is open, the broker cancels the ask, the reservation is released, and no specialist launches.
- If the renderer disconnects, the existing broker heartbeat/held-ask replay keeps the card recoverable on reconnect.
- If the approved specialist fails before its child session is created, the launch count does not increase and the reservation is released.
- If child creation succeeds and later specialist execution fails, the launch counts because a specialist was in fact created.
- The session waiver is intentionally non-durable. Restarting the app/runtime or destroying the parent session restores the ordinary cap for a newly live session.
- Destroying and then recreating or resuming the same session id starts with no stale count, reservations, authorization queue, or waiver from the destroyed live instance.
- No choice creates, modifies, or revokes an entry in `permissions.json`.

## Verification

Pin the following mechanically:

1. Launches 1–30 proceed without a budget ask.
2. Launch 31 raises the dedicated native permission ask with count 30.
3. **Yes, just this specialist** launches one child, keeps the cap active, and causes the next additional launch to ask again.
4. **Waive cap for this session** launches the pending child and allows later launches without more budget asks.
5. **No, continue inline** launches no child, keeps the cap active, and returns the approved model-facing instruction.
6. A later attempt after No raises another prompt rather than being suppressed.
7. The standard card has no separate dismiss action; session interruption follows cancellation behavior.
8. Resumes, steers, interrupts, and list calls neither spend budget nor ask.
9. Capacity and single-writer refusals happen without spending the launch allowance or raising a budget prompt.
10. A failure before child creation does not spend the allowance; a failure after creation does.
11. Parallel launches crossing 29 → 30 → 31 reserve allowance atomically, and launch 31 cannot proceed without a decision.
12. Parallel over-cap attempts serialize and respect one-time versus session-wide approval.
13. Destroying a parent clears all launch-budget state even with no live children; recreating the same id starts clean.
14. The synthetic card closes after both local and remote/replayed responses and uses the approved labels/copy on wide and narrow renderers.
15. Specialists 31+ remain present with correct status and management data after session switching and renderer/remote reconnect.
16. No budget decision reaches `PermissionStore`.
17. The first-name pool is unique, randomized without replacement, and at least four times the normal allowance.
18. Existing specialist, native permission, reducer, remote permission, and IPC parity suites remain green.

Before claiming the desktop change complete, run `bash scripts/verify.sh <worktree>`. Because this changes a native harness tool and its model-facing refusal text, offer the harness evaluator after implementation; never run a paid evaluation without explicit approval.

## Out of scope

- Changing the default allowance of 30.
- Persisting a waiver across app restarts.
- Adding a Settings control for the allowance.
- Removing concurrency or single-writer safeguards.
- Giving specialist children delegation capability.
- Recording budget choices as permanent permission rules.
