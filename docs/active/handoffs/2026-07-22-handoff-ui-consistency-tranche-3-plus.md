---
status: active
date: 2026-07-22
owner: Destin (decisions) / Claude (execution)
subject: Resume the UI-consistency sweep — audit + plan for tranches 3–8
type: handoff
kind: plan-seed
roadmap: "ROADMAP.md — 'UI consistency system — shared primitives + the 51-change migration' (#ui, added 2026-07-16)"
supersedes-context: docs/active/handoffs/2026-07-19-ui-consistency-tranche-3-handoff.md
---

# Handoff — UI consistency, resuming at tranche 3

Unlike the other two workstreams, **the design is already fully specced and approved** — this is a
migration, not a design problem. Your job is **not to re-design** and **not to start editing**. It
is to (1) reconcile the spec's current state against master, (2) produce a verified per-site audit
for the next tranche the way §11.1 did for buttons, and (3) turn that audit into an implementation
plan. **The recurring failure mode of this workstream is trusting the spec's own scope numbers —
they have understated scope three times. First task of the session is an audit, not an edit.**

## What this is

A four-agent renderer audit (2026-07-16) found the app strong architecturally (overlay-layer system
adopted by ~40 components, 15-token theme contract enforced at runtime + CI, radii tokenized) but
with **no shared control primitives** — ~15 button treatments, 4 toggle geometries, 3 input focus
paradigms, 5 destructive-red idioms, 2 card species, zero automated enforcement. The fix is a set of
shared primitives (`components/ui/*`) plus a numbered change ledger migrating every hand-rolled
control onto them. Destin approved every change by number across seven design-review sessions.

## Current state (verify against master before trusting)

| Tranche | Scope | Status |
|---|---|---|
| 0 + 1 | tokens, primitives, buttons 1–14 | shipped — youcoded PR #164 `31900a2f` |
| 2 button half | changes 52–76 | shipped — PR #181 `2bf29a44` |
| 2 input half | 15–17, 19–21, 42, 77 | shipped — PR #183 `d0c646b7` |
| §12 contrast (raised alongside) | OKLCH solver + `fg-faint` migration | **shipped 2026-07-20** — wecoded-marketplace#50, wecoded-themes#19, youcoded#187 |
| Change 78 (folder picker) | — | **deferred** — it's a feature, not a migration (spec §11.10) |
| **Tranches 3–8** | cards, screens/nav, states, type/tokens, form controls, session-8 additions | **not started** |

The last handoff recorded master at `d0c646b7` (2026-07-19). **Re-baseline first** — a lot has
merged since (artifact code-editor #200, search #205, sync overhaul #201–203). Confirm what UI work
landed incidentally and whether any tranche-3 target files moved.

## The load-bearing lesson — READ THIS BEFORE ANY EDIT

**The spec has understated scope three times.** §10.7 said "~25–30 remaining hand-rolled buttons" —
it was ~153. It said "changes 1–14 are done" — four files still held ~21 hand-rolled buttons. §11.9
listed ~10 InputGroup sites — three didn't exist in that shape and one referenced a field that
doesn't exist. **Every one of those was found by reading code at the edit site, not by grepping.**

Tranche 3 (changes 22–25, cards) looks like a handful of named components (SkillCard,
MarketplaceCard, EngineCard) but raw greps suggest a much wider surface. Treat these as **upper
bounds, not counts**:

| change | what it says | grep upper bound (UNVERIFIED) |
|---|---|---|
| 22 | SkillCard/theme tiles/file cards `bg-panel border` → `.layer-surface` | ~58 `bg-panel`+border sites |
| 23 | hex strips `#4CAF50`/`#66AAFF`/`#f0ad4e` die | 21 occurrences |
| 24 | "one of the app's last 3 neutral stock-palette leaks" | 3 |
| 25 | EngineCard `bg-well` → the SettingsRow surface | ~54 `bg-well` sites |

**This app has a habit of THREE copies of a pattern; two is never the answer.** Change 62's third
Create button, `index.tsx`'s hardcoded blue, `App.tsx`'s third skip-permissions warning were all
"the third copy where two got migrated" — none findable by the greps in use.

## Where to read (do NOT read §1–§9 literally)

- **Spec:** `docs/active/specs/2026-07-16-ui-consistency-design-spec.md`. Start at **§10** — the
  head note warns that five recipes in §1–§9 are WRONG against the real codebase and following them
  reintroduces now-fixed, test-pinned bugs. Implementation logs: **§10** (tranche 0/1), **§11**
  (buttons), **§12** (contrast — shipped), **§13** (inputs). The remaining tranche ledger is **§2**
  (Sessions 3–8, changes 22–51) with §11/§13 as the model for how to actually execute one.
- **Prior handoff (still valid context):** `docs/active/handoffs/2026-07-19-ui-consistency-tranche-3-handoff.md`
  — carries the residue list (don't re-discover these), the queued Destin-eyeball items, and the
  process notes below.

## Process notes worth acting on

- **Parallel agents partitioned by file worked well** (6 agents, ~44 files, zero collisions). What
  made it work: each brief named its **exact file list**, said edits outside it would collide,
  carried the "never delete child content of a control you migrate" rule with the specific spinner
  incident, and told agents to **LEAVE anything ambiguous and report rather than guess**. Every
  agent used that escape hatch, and each time it was correct — that's where the §11.9 corrections
  came from. Reuse this shape.
- **The JSX comment trap:** `{/* … */}` between `cond && (` and its element is a **syntax error**,
  not a comment. It was in all six agent briefs and still made three times in one session. Put it in
  the briefs anyway, but expect it.
- **ESLint does not exist in this repo** (no config, no lint script — verified 2026-07-19). Spec §8
  lists an "ESLint guardrail" as if it's a rule to add; it is actually **adopt ESLint from zero**.
  The `audit-ui-tokens` grep-ban (§8) is still unapproved and would have caught three of the misses
  above — flag it to Destin as the highest-value guardrail, but it's a separate decision.

## Cross-workstream note (worth surfacing to Destin)

Tranche 5 (States, changes 31–34) is where the **ErrorState general mode** lives (§1.6 / spec change
33 — the neutral card + destructive dot + "Report bug / Diagnose with Claude" two-action component).
The ROADMAP's "Misleading error messages — full audit + replacement" item is **waiting on exactly
that component** to land. Sequencing tranche 5 unblocks the error-message audit — note it when you
propose tranche ordering.

## Deliverables

1. A **verified per-site audit for tranche 3** (changes 22–25) in the shape of §11.1 — real
   inventory, corrections to the ledger surfaced before any code moves. Append it to the spec as a
   §14-style implementation log, or as a standalone plan doc, matching the §11/§13 precedent.
2. An **implementation plan** (`docs/active/plans/…`) for tranche 3, and a proposed ordering for
   tranches 4–8 (call out the tranche-5 → error-audit dependency above).
3. Execute tranche 3 only after the audit is reconciled — parallel-agents-by-file, each with an
   exact file list and the escape hatch.

North star: **every user-facing control in the renderer renders through a shared primitive; no
hand-rolled button/card/input/toggle/state survives; the look is consistent across all 11 themes,
glass-composited.**
