---
status: shipped
created: 2026-08-12
type: spec
program: docs/archive/plans/2026-08-11-native-sessions-remaining-work.md
item: M5 · 2b — Full Auto prompt coherence
design-record: youcoded desktop/src/renderer/dev/workbench/compare/registry.tsx → surface `full-auto-ask` (4 rounds, 2026-08-12)
---

# Full Auto prompt coherence (M5 2b)

## Problem

Full auto's only remaining rule-based prompt is the stop before a destructive
command (`rulesForMode('full-auto')` is `*→allow`; only the `DESTRUCTIVE_DENY_LIST`
layer outranks it). But `PermissionButtons` (ToolCard.tsx) never consults the
mode, so that stop renders the identical generic "Yes / Always Allow / No" row
Ask mode uses. Nothing tells the user the mode that "works without checking with
you" stopped *on purpose, for one of the four promised reasons* — so the prompt
reads as noise and trains click-through, the failure the permission design
exists to avoid.

**Hard constraint (shipped promise):** Settings → Permissions states Full auto
still asks before deleting, `git push`/`reset --hard`, `sudo`, and formatting.
The four families keep asking. This spec changes presentation only — zero
change to which asks fire or what the engine decides.

## The settled card (compare view, 4 rounds)

When a **native session in `full-auto` mode** raises a **deny-listed** ask, the
tool card's footer becomes the mode's own surface instead of the generic row:

- Footer band tinted with the Full auto chip colors (`#F2B33D` at the
  StatusBar chip's alpha steps — `PERMISSION_DISPLAY['full-auto']`, to be
  exported from StatusBar.tsx rather than duplicated).
- **Header** (amber, `text-xs font-medium`): "Stopped before pushing code" —
  verb phrase varies by family (table below).
- **Subheader**, tight under the header (2px; the footer's only real gap is
  before the buttons): "YouCoded limits this action, even in Full Auto — it
  changes your published code." Consequence clause varies by family.
- **Buttons:** `Run it` (green) · `Skip it` (red) · `|` divider
  (`text-fg-faint`, the card header's pipe) · `Always Allow` (status orange,
  `bg-orange-600/60` family — a fourth member of the green/red/blue button
  grammar).

### Decision ledger

| Round | Question | Pick |
|---|---|---|
| 1 | Explain-only vs safety-stop vs checkpoint | **B** — safety stop (two verbs, mode-amber band) |
| 2 | Always Allow returns as a third button — which orange | **A** — status orange (`orange-600/60`) |
| 3 | Subline verb ("prohibits" vs "always stops") | Neither — owner supplied **"limits"** |
| 4 | — | Settled card recorded |

Rejected: R1·A (explain-only — still reads as a generic "may I?"), R1·C
(checkpoint — killed the card-level Always Allow, which Settings can't replace
since it only revokes), R2 mode-amber / outlined orange, R3 both verbs.

### Per-family copy

Classification reuses the same shared `DESTRUCTIVE_DENY_LIST` + `subjectMatches`
the engine used, first match in list order — the card can never name a different
reason than the engine had.

| Family (patterns) | Header | Consequence clause |
|---|---|---|
| Deleting files (`rm`, `rmdir`, `del`) | Stopped before deleting files | it permanently removes files. |
| Pushing code (`git push`) | Stopped before pushing code | it changes your published code. |
| Undoing commits (`git reset --hard`) | Stopped before undoing commits | it permanently discards saved work. |
| Admin command (`sudo`) | Stopped before an admin command | it runs with full control of this computer. |
| Formatting (`format`) | Stopped before formatting a drive | it erases everything on it. |
| Fallback (deny-listed but unclassified) | Stopped before a risky command | *(no clause — subline ends at "Full Auto.")* |

## Button semantics (unchanged decisions, new labels)

| Button | Sends | Same as today's |
|---|---|---|
| Run it | `{behavior:'allow'}` | Yes |
| Skip it | `{behavior:'deny'}` (same model-facing decline message) | No |
| Always Allow | opens the consequence confirm; on confirm, persists the exact-command rule | Always Allow → confirm |

- The **consequence confirm is the shared one** and keeps its two buttons
  ("Nevermind, allow once" green / "Always allow" red — the muscle-memory
  carve-out stands). Its body copy changes **globally** (all modes, one
  component): "It may delete files or change published code, and you won't be
  asked again during future sessions in this project." Owner accepted the
  known understatement: the grant also applies to the rest of the current
  session.
- Rule *shape* stays the exact command string — widening is item **2c**, out of
  scope here.
- Red sits mid-row (Run it / **Skip it** / Always Allow) in this footer, unlike
  every other row where red is rightmost — owner-approved deliberately (R2).
- Arrow-key roving selection covers all three buttons; Enter activates.
  Position 0 stays the plain-allow, matching the generic row.

## Scope guard — everything else keeps today's UI

Ask + Auto-edit modes (including their deny-listed asks with the blue Always
Allow), external-directory asks, `max_steps`/`doom_loop` "Continue?" gates, and
AskUserQuestion cards are untouched. Condition for the new footer, exactly:
`mode === 'full-auto' && denyListed`. (`denyListed` already implies a native
Bash ask; budget gates and external asks arrive with `denyListed: false`.)

## Plumbing

The renderer needs the session's mode at ask time. The broker's
`PERMISSION_REQUEST` payload (already carrying `denyListed`, `external`) gains
`permissionMode: NativePermissionMode`. No new IPC channel — no five-surface
parity work — but the remote WS relay must pass the field through untouched
(payload passthrough today; verify in plan). Android native sessions don't
exist yet (M8); the shared UI just works when they do.

## Tests

- `PermissionButtons`/ToolCard: full-auto + denyListed renders the safety-stop
  footer; full-auto without denyListed renders nothing (auto-allowed); ask/auto-
  edit + denyListed keeps the generic row + blue Always Allow.
- Family classifier: one case per family incl. compound (`cd x && rm y` →
  deleting files) and the unclassified fallback.
- Confirm copy: the new consequence line renders in ask-mode confirm too.
- Existing guards expected to trip and be updated: ToolCard permission tests.

## Out of scope

- 2c (Bash rule shape) — deliberately untouched.
- Runaway-gate presentation in full auto (possible future coherence pass).
- The Permissions screen copy — stays true as written; no edits needed.
