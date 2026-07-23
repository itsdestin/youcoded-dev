---
status: superseded
date: 2026-07-22
owner: Destin (decisions) / Claude (execution)
subject: Seed a spec + plan for the buddy-floater one-window Wayland rewrite
type: handoff
kind: spec-seed
roadmap: "ROADMAP.md — 'Buddy floater: Wayland-native one-window rewrite' (#buddy #linux, added 2026-07-17)"
---

> **OUTCOME (2026-07-23):** merged DORMANT in youcoded PR #214 — the overlay is built and review-hardened, but `setIgnoreMouseEvents` proved a total no-op on native Wayland (the spec's I2 click-through evidence was a misread: the renderer received moves because the window was receiving ALL input, and clicks never passed through). `chooseBuddyStrategy` defaults to 'windows' everywhere; overlay reachable only via `YOUCODED_BUDDY_STRATEGY=overlay`. Live status, full evidence, and the XWayland next step: `docs/active/investigations/2026-07-23-buddy-overlay-wayland-presentation.md`.

# Handoff — Buddy floater: Wayland-native one-window rewrite

> **OUTCOME (2026-07-22, same day):** the investigation this handoff mandated ran
> its full course — see `docs/active/prototypes/2026-07-22-buddy-wayland-workbench/FINDINGS.md`
> (measured evidence, several of this handoff's premises corrected) and the
> resulting spec `docs/active/specs/2026-07-22-buddy-floater-one-window.md`
> (status: draft, awaiting Destin's approval). Key corrections to this document:
> electron#50541 is a FIX shipped in 41.2.0 (not a bug propagating to 41-x) — the
> smear dies with an Electron bump (PR opened separately); the one-window model
> does NOT dodge that bug class (it was version-, not architecture-bound); the
> XWayland stopgap was re-tested end-to-end and is dead on the repro machine for
> a new reason (ANGLE `EGL_CreateWindowSurface` SIGSEGV). The one-window
> direction itself SURVIVED prototyping — every primitive proven. Read FINDINGS
> before re-litigating anything here.

You are picking up a **bug that is architectural, not a code fix**. Your job this session is **not
to implement it** — it is to (1) verify the current state against master, (2) prototype the risky
mechanic in a workbench, and (3) produce a spec + implementation plan Destin can approve. Do the
brainstorming skill first if any design question is still open after your investigation.

## The problem (why this exists)

On native Wayland (Electron ≥38.2 default; repro env: CachyOS, KDE Plasma / KWin 6.7.3, single
1.5×-scaled panel) the buddy floater is **unusable**: it can't be dragged (stuck centered), and the
edge-anchored peek/sink/lean animations misfire inside the fixed 112×112 window.

Root cause is the floater's architecture, not a bug in it. Wayland **forbids** apps from
programmatically positioning windows (`setPosition` is a no-op, `getPosition` returns `[0,0]`) or
reading global window coordinates. The floater's entire drag model is:

    renderer pointermove → `buddy:move-mascot` IPC → main-process `setPosition` every frame

…across **three separate transparent frameless BrowserWindows** (mascot + chat + bar). On X11 this
works; on Wayland every `setPosition` silently drops. Confirmed against Electron docs + issues
#52204 / #48833 / #40886.

## The fix direction (already reasoned through — verify it still holds, don't re-litigate lightly)

Collapse the three windows into **ONE fullscreen transparent always-on-top window** and position
the mascot / chat / bar as **absolutely-positioned DOM inside it**. Dragging becomes a **local CSS
write** — no IPC, no platform permission, and it dodges the separate transparent-window smear bug
class (electron#50541) for free.

**Explicitly rejected (2026-07-17), do NOT ship as the fix:** the `--ozone-platform=x11` XWayland
stopgap. It blurs the whole app at 1.5× fractional scaling AND still needs an Electron bump for the
transparent-window smear bug. It is not the answer.

**This rewrite SUBSUMES** the separate ROADMAP item "Buddy floater scene-companion follow physics —
window padding redesign" (`#buddy #themes`). The padding/click-through problem disappears in a
one-window model — fold that item's intent into this spec and note it there.

### Scope decision (Destin, 2026-07-22): a Linux/Windows-macOS fork stays on the table

Earlier framing assumed one unified implementation across all desktop platforms. **That is no
longer a fixed requirement.** The sequencing is now:

1. **Land the one-window model on Linux first** (Wayland is the only platform that is broken, and
   the only one that gains anything). Get it genuinely working — draggable, peekable, dockable —
   before spending any thought on the other platforms.
2. **Then weigh, as an explicit decision with Destin:** port Windows/macOS to the one-window model
   too, or keep the existing three-window model there and carry a platform split.

Neither outcome is pre-approved. The trade being weighed is *one codebase with churn + regression
risk on three currently-working platforms* versus *two floater implementations to maintain
forever*. Do not silently collapse this into "unify everything" — it is Destin's call, made after
the Linux implementation exists and its real complexity is visible.

**What this means for the spec:** design the one-window model so a fork is *cheap if chosen* —
keep the platform-conditional seam explicit (a single branch point on platform, not one-window
assumptions leaking through the shared renderer), and keep `buddy-bar-geometry.ts`'s pure geometry
contract shared by both paths. Don't build the fork; just don't design it out.

## The hard parts (price these into the plan — this is where the risk is)

1. **Rewiring the 7 cross-webContents IPC pushes + session-subscription-by-`webContents.id`** into
   in-app React state. The current per-window design gets cross-window state sync from the main
   process; a one-window model has to move all of it into the renderer.
2. **Hand-managing dynamic click-through regions** across the now-large dead transparent area:
   `setIgnoreMouseEvents(forward: true)` + hover-region tracking, so clicks pass through the empty
   space but land on the mascot/chat/bar. This is the cursor-timing-sensitive debugging the current
   per-window design gets for free — it is the single biggest unknown. **Prototype it first**
   (see below) before committing the plan.

## First actions this session (investigate before you design)

1. **Re-verify the current architecture against master** — read `buddy-window-manager.ts`,
   `buddy-bar-geometry.ts`, `BuddyMascot.tsx`. Confirm the three-window structure, enumerate the
   real count of cross-webContents IPC pushes (the "7" is from 2026-07-17 — re-count), and map the
   session-subscription-by-`webContents.id` wiring.
2. **Check whether Electron has been bumped** since 2026-07-17 and whether that changes the smear
   bug calculus (electron#50541 was propagating to 41-x).
3. **Read `docs/PITFALLS.md` § Buddy Floater** — invariants were folded in there after the
   2026-07-16/17 rig+peek work. `buddy-bar-geometry.ts` is a **pure, tested** module (the bar's
   left/right flip was proven unreachable and removed) — the one-window rewrite must preserve its
   geometry contract or update its tests deliberately, not incidentally.
4. **Prototype the click-through + hover behavior in a standalone workbench first** — exactly the
   way the rig and peek work was prototyped (archived example:
   `docs/archive/prototypes/2026-07-16-buddy-rig-workbench.html`). Prove `setIgnoreMouseEvents` +
   dynamic hover regions behave on native Wayland *before* writing the migration plan. If the
   prototype surfaces that the click-through model won't hold, that changes the whole plan.

## Constraints that must survive

- **Live-app-safety rule:** all runtime verification happens in a dev instance (`bash
  scripts/run-dev.sh`), never Destin's live app.
- **Interactive/drag verification is Destin's eyeball, not a scripted CDP rig** (CLAUDE.md
  2026-07-16 buddy-peek lesson — CDP-scripting multi-window drag on his multi-monitor desktop burns
  huge time/tokens because his real cursor interferes). Ask before building any scripted drag rig;
  DOM-level assertions and one-shot static screenshots are still fine to automate.
- Desktop-only concern in origin, but the rewrite touches the shared renderer. Per the scope
  decision above, Windows/macOS are **not** required to adopt the one-window model — but they must
  not be *broken* by the Linux work either. Whatever ships first has to leave the existing
  three-window path intact and working on X11, Windows, and macOS until Destin decides otherwise.
- X11 is the ambiguous case: the current model works there, so it does not *need* the rewrite, but
  it's the same OS and likely the same build. Treat "does Linux mean Wayland-only or all of Linux"
  as a question to answer in the spec, not to assume.

## Deliverables

1. A **spec** at `docs/active/specs/2026-07-22-buddy-floater-one-window.md` (`status: draft`) —
   the one-window architecture, the click-through/hover model (validated by the prototype), the
   state-migration map (what moves from main → renderer), how it folds in the scene-companion
   follow-physics item, and **where the platform seam would sit** if the Windows/macOS fork is
   chosen later (including whether "Linux" means Wayland-only or all of Linux).
2. An **implementation plan** at `docs/active/plans/…` (writing-plans granularity — tasks, exact
   files, test-first) once the spec is approved.
3. The archived **prototype** under `docs/active/prototypes/` (moves to `docs/archive/` when the
   work ships).

Open the spec with the north star: **the floater is fully usable — draggable, peekable, dockable —
on native Wayland.** Behavioral parity across platforms is the *goal*, not a gate: users should not
be able to tell which implementation they're on, but the two implementations may legitimately
differ underneath (see the scope decision above). Cross-platform *code* unification is a separate,
later decision.
