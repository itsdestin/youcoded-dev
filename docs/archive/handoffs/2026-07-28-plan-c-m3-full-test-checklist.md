---
status: shipped
date: 2026-07-28
branch: feat/native-local-reliability-rebase (worktree `worktrees/plan-c`)
scope: Plan C (native local reliability) + M3 items 1, 2, 3, 5
dev: bash scripts/run-dev.sh plan-c --label "M3 Review" --profile plan-c
supersedes: 2026-07-28-plan-c-closeout-checklist.md, 2026-07-28-m3-dev-acceptance.md
---

# Full test checklist — every behavioral change on this branch

Window: **YouCoded - M3 Review**, Vite 5223, profile `youcoded-plan-c`.
Built from the branch's 38 code-bearing commits. Everything here is clicking and
typing in the dev window — no terminal needed.

**Two model sizes are needed.** Several checks only mean something on a small
local model (your Qwen 3.5 2B) versus a large one (the 122B or a cloud model).
Where it matters the item says which.

Order is deliberate: §1 is the fastest way to find a broken build, §7 is the
slowest. Stop and tell me at the first thing that looks wrong — later sections
assume earlier ones passed.

---

## 1. Smoke — is the build sane?

- [ ] **1.1** App launches, a **Claude Code** session works end to end: send, tool
      call, approval, interrupt. Plan C touches the shared harness; if CC is
      broken, nothing else matters.
- [ ] **1.2** A **native** session sends and receives.
- [ ] **1.3** No red console errors on boot beyond the one known
      `AppInner … while rendering` warning (pre-existing, §8).

---

## 2. Skills (M3 item 1)

### User-invoked — must work on EVERY model

- [ ] **2.1** Type `/theme-builder` in a native session. It starts the skill.
- [ ] **2.2** The timeline shows a **compact card**, right-aligned, on a real
      bubble surface — not 26,000 characters of instructions.
- [ ] **2.3** The card reads `Invoked skill: theme-builder` — the bare name, not
      `wecoded-themes-plugin:theme-builder`.
- [ ] **2.4** `theme-builder` is **dotted-underlined**; clicking it opens SKILL.md
      in the artifact viewer.
- [ ] **2.5** The **thinking indicator appears** and prompt-processing progress
      runs, exactly as if you had typed a normal message.
- [ ] **2.6** The model **starts the work** — it must not reply "Understood, I
      have loaded the theme-builder skill, this skill guides a multi-phase…".
- [ ] **2.7** `/theme-builder make it purple` — your words reach the model too.
- [ ] **2.8** Repeat **2.1 on the 2B**. The user-invoked path is deliberately not
      gated by model size.
- [ ] **2.9** `/definitely-not-a-skill` → one honest sentence, not silence, not a
      crash.
- [ ] **2.10** `/clear` still runs the **barrier**, never a skill lookup.

### Model-invoked — deliberately NOT on small models

- [ ] **2.11** On the **122B or a cloud model**: ask for something a skill covers
      *without naming it*. The model should pick the skill itself.
- [ ] **2.12** On the **2B**: ask "what skills do you have access to?". It should
      **not** have a Skill tool and should not recite a catalog. (This is the
      regression from your 2026-07-28 screenshot.)
- [ ] **2.13** Switch a session from the 122B to the 2B and back. The tool should
      disappear and reappear.

### Surfaces that used to be silent

- [ ] **2.14** **Settings → Appearance → ✦ Build New Theme with Claude** in a
      native session. Before this branch it did *nothing at all*. It should start
      the skill in the **current** session.
- [ ] **2.15** Same button in a **Claude Code** session — unchanged behavior.
- [ ] **2.16** Pick a command from the command drawer that has no native
      equivalent, in a native session → a toast naming it, not silence.
- [ ] **2.17** Pick a skill from the drawer whose prompt starts with `/`.

---

## 3. Project rules and nested instructions (M3 item 3)

Use a repo with `.claude/rules/*.md` carrying `paths:` frontmatter — this
workspace qualifies.

- [ ] **3.1** Ask Claude to read a file one of those rules matches. The rule text
      appears **once**, attributed to its file.
- [ ] **3.2** Have it read **another** matching file. The rule must **not** repeat.
- [ ] **3.3** Have it read a file no rule matches → nothing injected.
- [ ] **3.4** In a monorepo with a nested `CLAUDE.md` (a package subfolder),
      touching a file in that package surfaces those instructions.
- [ ] **3.5** The **root** `CLAUDE.md` is NOT re-injected — it is already in the
      system prompt.
- [ ] **3.6** On the **2B**: a long rule arrives **truncated with a visible
      notice**, not silently cut.

---

## 4. Context management (M3 item 2 + Plan C)

- [ ] **4.1** Context pill is **clickable** in a native session.
- [ ] **4.2** Popup toggle **Percentage ↔ Token counts** switches the pill; the
      colour band is identical in both modes.
- [ ] **4.3** The choice survives an app restart and syncs to a second window.
- [ ] **4.4** The popup does not describe the full window as "remaining".
- [ ] **4.5** `/compact` actually compacts and writes a marker.
- [ ] **4.6** `/compact` with nothing to compact → a **specific** refusal.
- [ ] **4.7** Esc during compaction → session survives, history intact.
- [ ] **4.8** `/clear` → the model no longer knows what you said before it, but
      the timeline above the barrier stays **visible**.
- [ ] **4.9** A refused `/clear` (try it mid-turn) leaves the conversation
      **untouched** — nothing is wiped optimistically.
- [ ] **4.10** Resume a cleared session — it comes back cleared, not resurrected.

---

## 5. Token accounting and the status bar

- [ ] **5.1** **In:** shows a real number in a native session — thousands on a
      first turn, since `CLAUDE.md` alone is ~5k. Not `--`, not `0`.
- [ ] **5.2** **Out:** and **Speed:** populate. There is **no separate "Tokens"
      chip** any more.
- [ ] **5.3** Hide **Speed** in the status-bar settings — it actually hides.
      (The native chip used to ignore that toggle.)
- [ ] **5.4** The **Context** pill grows across a conversation and does **not**
      reset to near-empty after each turn.
- [ ] **5.5** A **cloud** session shows In/Out/Speed exactly as before.
- [ ] **5.6** With the 122B at `-c 128000`, the popup reports the **full** window,
      not half.

---

## 6. Local-model reliability (Plan C)

- [ ] **6.1** Send a long prompt to a local model: the indicator reads
      `Reading your prompt — N% of M tokens, about Xs left` and counts up.
      ⚠️ Known: it still sits at 0% through the first batch.
- [ ] **6.2** No false *"this is taking a while, something may be wrong"* during
      normal slow prefill.
- [ ] **6.3** After a tool call the copy says **"Reading tool output"**, not
      "your prompt".
- [ ] **6.4** Kill the llama.cpp server mid-turn → you **do** get the stall
      warning. (The budget must still fire on a real death.)
- [ ] **6.5** **No spinner at all while text is streaming** — check a **cloud**
      session too, this is not local-only.
- [ ] **6.6** Spinner returns on a pause / first-token wait.
- [ ] **6.7** The chat view never goes blank (the ErrorBoundary catching the
      hooks crash).
- [ ] **6.8** `Read` a file large enough to have produced *"messages must not be
      empty"* → truncation notice, turn continues.
- [ ] **6.9** On the **2B**: tool descriptions are the short form (simplified
      presentation) and it does not emit parallel tool calls.

---

## 7. Remote web client

Nothing on this branch has been exercised over remote, and the program's exit
criteria require it.

- [ ] **7.1** Open the remote UI. A native session loads.
- [ ] **7.2** `/skill-name` works there, or refuses honestly.
- [ ] **7.3** `/clear` and `/compact` work there.
- [ ] **7.4** The context pill, In/Out/Speed chips render.

---

## 8. Known issues — expected, do not report as new

- **0% prefill plateau.** Progress sits at 0% through the first batch, then
  counts smoothly. Fix pending your call: remember a measured rate per model
  (my recommendation) vs show indeterminate until a rate exists.
- **`AppInner … while rendering a different component`** fires once at boot.
  Verified present BEFORE any M3 work on this branch; whether Plan C or master
  introduced it is not yet established. On the review list.
- **20 renderer test files can't LOAD in the worktree** — a shared-`node_modules`
  symlink artifact, not a failure. All pass with a widened `server.fs.allow`.
- **Qwen 3.5 2B registry entry carries two UNVERIFIED claims** — an inherited
  262,144 context ceiling and a capability judgment from parameter count. Both
  want a model-card check.
- **Slowness.** Your `CLAUDE.md` is 20,295 chars against a 20,000-char cap, so it
  is cut mid-file and eats ~5k tokens of every prompt. Now captured as a design
  question (program §7 item 3), not fixed here.
