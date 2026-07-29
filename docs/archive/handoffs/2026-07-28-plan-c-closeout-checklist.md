---
status: shipped
date: 2026-07-28
milestone: Plan C (native local reliability) — pre-merge close-out
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md
repos: [youcoded]
branch: feat/native-local-reliability-rebase (worktree `worktrees/plan-c`, 29 commits, never pushed)
verified_against: youcoded `57e39248`; origin/master +31 ahead
---

# Plan C close-out checklist

Two lists. **Part A** is Destin, in the dev window (`YouCoded - Local Reliability`,
Vite 5223, profile `youcoded-plan-c`). **Part B** is Claude, in code.

Nothing merges until Part A passes and Part B is clear.

---

## Part A — acceptance in the dev window

Every item names the commit it guards, so a failure points straight at the change.

### A1. Context pill + popup (`45bd4e70`, `55fcd502`)

- [ ] In a **local/native** session, click the context pill — the popup opens.
      (Before this branch it was inert in native sessions.)
- [ ] Toggle **Percentage ↔ Token counts**. The pill switches format; the **colour band
      is the same in both modes** (both driven by the percentage).
- [ ] The popup's token line reads `~X of Y tokens` — it must not present the whole
      window as remaining.
- [ ] The choice persists across an app restart, and syncs to a second window.

### A2. `/compact` (`9fd07bd0`, `03ad97a8`, `52ec8f73`)

- [ ] Run `/compact` mid-conversation in a local session — it actually compacts, and
      the summary lands in the timeline.
- [ ] Run `/compact` when there is nothing worth compacting — you get a **specific
      refusal that explains why**, not a crash and not a silent no-op.
- [ ] Interrupt (Esc) during a compaction — the session survives and the pre-compaction
      history is intact.

### A3. `/clear` as a barrier (`55fcd502`)

- [ ] Run `/clear`, then ask about something said earlier — **the model should not
      know it**.
- [ ] The timeline itself stays visible above the barrier (the conversation is whole
      on disk; only the model's view is cut).
- [ ] If `/clear` is ever refused, the timeline must **not** have been wiped. (The UI
      deliberately does not clear optimistically.)

### A4. Oversized tool output (`5f5b6ef9`)

- [ ] `Read` a file large enough to blow past the window — the same shape of file that
      produced *"Invalid prompt: messages must not be empty"*.
- [ ] You get a **truncation notice**, and the turn continues.

### A5. Real context window in router mode (`1da8e91f`, `bcdbf112`)

- [ ] With the 122B at `-c 128000`, the context popup reports the **full window**, not
      half of it. This is the bug where every local session silently ran at 32k.

### A5b. Token counts are real (`8607b1da`)

Until this commit every native turn recorded `inputTokens: 0` and both on-screen
numbers were chars/4 guesses.

- [ ] **In:** shows a real number in a local session — no longer `--`, no longer 0.
      It should be *thousands* on a first turn, because `CLAUDE.md` alone is ~5k.
- [ ] **Out:** and **Speed:** populate from the same source. There is no separate
      "Tokens" chip any more.
- [ ] Hide **Speed** in the status-bar settings — it actually hides now. (The native
      chip used to ignore that toggle.)
- [ ] The **Context** pill grows across a conversation and does **not** reset to near-empty
      after each turn. That reset is what made it read `367 / 128.0k`.
- [ ] Cloud sessions still show In/Out/Speed exactly as before — the shared chips
      prefer the Claude Code statusline when it's there.

### A6. Prefill progress, ETA, and no false stall (`4a759895`, `709486d7`, `e7578e7d`)

- [ ] Send a long prompt to a local model. The indicator reads
      `Reading your prompt — N% of M tokens, about Xs left`.
- [ ] It **counts up smoothly** rather than jumping 0 → 29 → 57 → 100.
      ⚠️ **Known remaining defect:** it still sits at 0% through the first batch. See B3.
- [ ] During normal (slow) local prefill you do **not** see *"This is taking a while,
      something may be wrong"*.
- [ ] After a tool call, the copy says **"Reading tool output"**, not "your prompt".
- [ ] Kill the llama.cpp server mid-turn — you *do* get the stall warning. (The budget
      must still fire on a real death; it was inert once already.)

### A7. Thinking indicator suppression (`3e03bb02`, `57e39248`)

- [ ] While text is **actively streaming**, there is no spinner at all — check this on a
      **cloud** session too, the change is not local-only.
- [ ] On a pause, or during the first-token wait, the spinner returns.
- [ ] The chat view never hits the ErrorBoundary. (This is the "Rendered fewer hooks
      than expected" crash — if it comes back, it comes back as a blank chat pane.)

### A8. Cloud regression sweep

- [ ] Run an ordinary Claude session end to end: tools, approvals, interrupt, resume.
      Plan C touches the shared harness, and not breaking the normal path is the point.

---

## Part B — Claude's remaining work

### B1. Merge master forward (blocking)
`origin/master` is **+31** ahead. Last merge-forward is stale; three heavily-churned
files (harness-session, chat-reducer, StatusBar) are the likely conflict sites again.

### B2. Fresh whole-branch review (blocking)
Never done against current master — the original review judged this code against a
master 400+ commits ago. **Review this specifically:** three times on this branch a fix
shipped inert with passing tests (`bcdbf112`, `e7578e7d`, and the `includeUsage` miss in
`8607b1da`), each because a value was *assumed* to reach the code under test rather than
asserted end to end. Look for the same shape elsewhere — especially anywhere a
provider-reported number is consumed without a test that it is nonzero.

### B2b. Re-check compaction against real numbers (blocking)
`maybeCompact` was fed `inputTokens: 0` on every turn until `8607b1da`, so the two-stage
compaction has **never run on a measured token count** — only on the chars/4 fallback.
Its trigger thresholds were tuned in that blind state and need re-verifying now that a
real number reaches them.

### B3. 0% plateau decision (blocking A6)
Either (a) persist a measured prefill rate per model and extrapolate through the first
batch, or (b) show indeterminate until a rate exists. **Recommendation: (a).**

### B4. Slowness investigation (not blocking merge)
Two untested leads:
- Workspace `CLAUDE.md` is **20,295 chars** against `prompt-assembly`'s 20,000-char
  truncation — so it is being cut mid-file, *and* it accounts for ~5,000 of a 7,149-token
  "hi" prompt.
- `-c 128000` on the 122B. Benchmark prefill tok/s at 32k vs 128k.

### B5. Test integrity before merge (blocking)
17 test files fail to load in the worktree (symlinked `node_modules` + newer Vite
refusing `highlight.js` CSS through the symlink). They pass in the main checkout.
**Confirm green in CI, not on my word.** Suite is otherwise 3,424 passing / 0 failing,
plus one known error — an unhandled rejection with reason `undefined` that reproduces on
master alone, already captured on the ROADMAP and out of scope here.

### B6. ROADMAP capture
Window-blind tool caps: `Read`'s hardcoded 100,000 chars / 2,000 lines take no account
of the model's actual context window.

### B7. Land it
PR → merge → **push** → archive these docs to `docs/archive/` → flip the ROADMAP item and
Native Runtime Parity Program §4 → shut the dev server down → remove the worktree
(**delete the `node_modules` symlink first**) → delete the branch local and remote.

### B8. Incidental
`youcoded/desktop/package.json` in the main checkout has an uncommitted `allowScripts`
block (npm-generated, not from this branch). Decide whether it should be committed
separately — it does not belong in the Plan C PR.
