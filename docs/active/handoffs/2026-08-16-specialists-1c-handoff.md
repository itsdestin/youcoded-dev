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
