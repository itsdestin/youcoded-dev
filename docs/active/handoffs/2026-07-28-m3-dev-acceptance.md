---
status: active
date: 2026-07-28
milestone: M3 items 1, 3, 5 + Plan C
branch: feat/native-local-reliability-rebase (worktree `worktrees/plan-c`)
dev: bash scripts/run-dev.sh plan-c --label "M3 Skills" --profile plan-c
---

# Dev acceptance — Plan C + M3 items 1, 3, 5

Window: **YouCoded - M3 Skills**, Vite 5223, profile `youcoded-plan-c`.
Nothing here needs a terminal — it is all clicking and typing in the dev window.

Two sections. **A** is Plan C (was already on the branch). **B** is new today.

---

## A. Plan C — unchanged from the earlier checklist

- [ ] **A1** Context pill clickable in a local session; the Percentage ↔ Token counts
      toggle switches format while the colour band stays the same; the choice survives
      a restart.
- [ ] **A2** `/compact` actually compacts; a nothing-to-compact case gives a specific
      refusal, not a crash.
- [ ] **A3** `/clear` — afterwards the model doesn't know what you said before it, but
      the timeline above the barrier stays visible.
- [ ] **A4** `Read` a file big enough to have produced *"messages must not be empty"* —
      expect a truncation notice and a turn that continues.
- [ ] **A5** The 122B at `-c 128000` reports the FULL window, not half.
- [ ] **A5b** **In:** shows a real number in a local session (thousands on a first turn —
      `CLAUDE.md` alone is ~5k). No separate "Tokens" chip. Context climbs across a
      conversation instead of resetting each turn.
- [ ] **A6** Prefill progress counts up; no false "taking a while" on a slow local model;
      "Reading tool output" after a tool call. ⚠️ Known: still sits at 0% through the
      first batch.
- [ ] **A7** No spinner at all while text is streaming — **check a cloud session too**.
- [ ] **A8** One ordinary Claude Code session end to end. Plan C touches the shared harness.

---

## B. M3 — new today

### B1. The dead buttons (this is the fastest, most visible check)

- [ ] In a **native** session, open Settings → Appearance → **✦ Build New Theme with
      Claude**. Before today this did **nothing at all** — no toast, no message, no
      session. It should now start the theme-builder skill **in the current session**.
- [ ] In a native session, pick any command from the command drawer that has no native
      equivalent. You should get a toast naming it, not silence.
- [ ] Same in a Claude Code session — everything should behave exactly as it always has.
      This is the regression that matters most; the dispatcher changed underneath.

> **Fixed 2026-07-28 after your first attempt** (`be1ac312`): `/theme-builder` reported
> "That isn't an installed skill". `scanSkills` namespaces plugin skills as
> `<plugin>:<skill>`, so the real id was `wecoded-themes-plugin:theme-builder` — but the
> button and you both type the bare name, which is what Claude Code accepts. Exact-match
> lookup meant **all 16** installed skills on your machine were unreachable, not just this
> one. Bare names now resolve; an ambiguous one is refused with both qualified ids rather
> than guessing.

### B2. `/skill-name`

- [ ] Type `/` in a native session and run an installed skill. Its instructions should
      land and the model should follow them.
- [ ] Type `/definitely-not-a-skill`. Expect one honest sentence saying it is neither an
      installed skill nor a supported command — **not** a silent drop and not a crash.
- [ ] Type `/clear`. It must still be the **barrier**, never a skill lookup, even though
      skills are resolved by the same path.
- [ ] Try `/skill-name` on a **small** local model too — this path is the whole reason
      small models are not cut off from skills.

### B3. The Skill tool (large models only, by design)

- [ ] On a **large-window** model (the 122B, or a cloud model), ask for something one of
      your installed skills covers *without naming the skill*. The model should choose it
      on its own.
- [ ] On a **small** local model, that should NOT happen — the tool is deliberately
      withheld there because its catalog would ride every single turn. `/skill-name`
      still works.
- [ ] Switch models mid-session from large to small and back. The tool should disappear
      and reappear.

### B4. Project rules and nested instructions

- [ ] Open a native session in a repo that has `.claude/rules/*.md` with `paths:`
      frontmatter (this workspace does). Have Claude read a file one of those rules
      matches. The rule text should appear once, attributed to its file.
- [ ] Have it read another matching file. The rule must **not** repeat.
- [ ] Have it read a file no rule matches — nothing should be injected.
- [ ] If you have a repo with a nested `CLAUDE.md` (a monorepo package), touching a file
      in that package should surface those instructions too.

### B5. Remote web client

- [ ] Open the remote UI and repeat **B2** there. Every native command must work or
      refuse honestly over remote — a desktop-only native command is exactly what the
      program's exit criteria forbid, and until today nothing tested it.

---

## Known console warning — not from M3, origin not yet established

On boot the dev console logs once:

> `Cannot update a component (AppInner) while rendering a different component (AppInner).`

I verified this is **present in the pre-M3 dev run on this same branch**, so today's
work did not introduce it. What I have NOT established is whether Plan C introduced it
or it is already on master. It is distinct from the ThinkingIndicator ref-during-render
warning fixed in `57e39248` (that one was ThinkingIndicator → AppInner; this is
AppInner → AppInner). It fires once at startup and nothing visibly misbehaves, but a
setState-during-render can cause real ordering bugs, so it is on the whole-branch review
list rather than dismissed.

## What I still owe after your pass

- Whole-branch review (never done against current master).
- MAP rows + program §4 flip + ROADMAP — these describe *master*, so they land with the
  merge, not before.
- ROADMAP capture: window-blind tool caps (`Read`'s hardcoded 100k chars / 2,000 lines),
  and `HarnessManifest.tools` having no consumer at all.
- The 0% prefill plateau decision (I recommend persisting a measured rate per model).
- The slowness leads: your `CLAUDE.md` is 20,295 chars against a 20,000-char truncation,
  so it is cut mid-file *and* eats ~5k tokens of every prompt.
