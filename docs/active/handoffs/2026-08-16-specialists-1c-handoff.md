# Handoff: native specialists — plan 1c

Native specialists shipped plans **1a** (foreground) and **1b** (background,
durability, steering, permissions) to youcoded master. **Plan 1c is the last
piece and is unwritten.** Your job is to brainstorm it into a spec, then a plan,
then implement — figure out the scope yourself from the sources below.

**Start here (don't take my word for the scope — read them):**
- `docs/active/specs/2026-08-11-native-specialists-design.md` — the approved
  design; 1c is called out as "definitions folder / CC-compat mapping / chat UI."
- `ROADMAP.md` — every open `#specialists` item is 1c work. Read all of them.
- `docs/archive/plans/2026-08-12-...-plan-1b-...md` and
  `docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md` — what
  already shipped, and where the interim UI is a known stopgap.

**The one directive from Destin's 1b hands-on that must land in 1c** (a ROADMAP
item spells it out): a *background* hire should render exactly like a
*foreground* one — the child's routed permission ask nests under the launching
**Task card**, and the report folds back into that **same Task card** instead of
the standalone interim card that ships today. Everything else about 1c is open.

**Norms:** `bash setup.sh` first; start non-trivial work at `docs/MAP.md`; use the
brainstorming → writing-plans skills before coding; work in a worktree; verify
with `bash scripts/verify.sh`. The `youcoded/.superpowers/sdd/progress.md` ledger
has the full 1b run history if you want it.

Explore, propose a scope, and confirm it with Destin before building.

---

## Addendum 2026-08-16 — what happened after this handoff (for the next agent)

**Scope was settled with Destin, then the UI was designed workbench-first before any
backend.** Spec: `docs/active/specs/2026-08-16-native-specialists-plan-1c-design.md`
(rules R1–R12 + the channel contract). Branch: youcoded `feat/specialists-1c-ui`,
worktree `worktrees/specialists-1c` — the real renderer against `MOCK_ONLY` channels;
seeded workbench session "specialists demo" (`wb-3`) drives review.

### Review-round history (so it is not re-proposed)

| Round | What was shown | Destin's verdict |
|---|---|---|
| 1 | Nested ask + folded report on the Task card; cards with a pending ask **hoisted to the bottom** of the timeline; chip + list popup; Settings page | Asks deep in cards "impossible to navigate" — must be centrally manageable in the popup |
| 2 | Popup gets the asks + Note/Stop; hoisting dropped | — |
| 3 | Popup restyled as flat rows in the Open-Tasks-popup language | "Still ugly and shallow" — wants cards with clear hierarchy |
| 4 | One card per helper: who → what → how far (elapsed, steps, last three actions) → ask band → footer | Better; then a series of edits |
| 5 | Two-row compression of the cards | **Reverted at Destin's request** — do not re-propose |
| 6 | Name in-line with role/model; no "Needs you" pill; request + buttons on one line; ask band at the bottom | Approved |
| 7 | Name is the out-link (dotted underline); Note/Stop top-right; charter copy dropped | Approved |
| 8 | Role tag dropped from popup cards | Approved |
| 9 | Popup cards render the chat card's own Briefing/Activity/Report (`AgentSections`) instead of a summary band | Approved |
| 10 | Those sections collapsed, accordion | "Good enough for now" |

### Independent review of the spec (another session), and what was done with it

Accepted: name the ledger's eleven write methods and put the change emitter **in the
ledger** (not a host wrapper — the steer methods live outside the host's spawn path);
write down the roster loading strategy (in-memory catalog per cwd, read on attach, Task
tool built only after); a running helper keeps its spawn-time definition; Android gets
the "desktop only" state; starter `example.md` + visible parse errors; note cap; move
this history out of the spec; drop `specialists:openFolder` (list returns folder paths;
Settings uses `shell:open-path`; the personal folder is created on visiting Settings →
Specialists — a deliberate bend of the "`~/.youcoded/` on first write" convention);
drop the project-level *native* folder for now (`.claude/agents/` covers "travels with
the project"); ship the reload-bug fix as its own change ahead of 1c.

Pushed back, with the code: (a) "a Yes after the helper finished is a promise the card
can't keep" — 1b already delivers a late answer to the assistant as a follow-up note
naming the `task_id`, so it is kept; only the copy changed (R3). (b) "replay on attach
is uncapped" — bounded by 1b's `SPECIALIST_SPAWN_BUDGET_PER_SESSION` (30) per
conversation; cited, no machinery added.

### Next step

Destin has read the spec (revised). Next: `superpowers:writing-plans` → the 1c
implementation plan (backend + the §7 renderer edits + docs), then implement in the
existing worktree/branch.
