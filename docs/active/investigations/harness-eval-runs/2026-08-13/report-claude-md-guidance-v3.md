# Harness eval — claude-md-guidance-v3

**Started** 2026-08-13 07:36 UTC · **Build** `50920aee+dirty` · **Judge** `x-ai/grok-4.5` · **2 of 2** planned cells produced a run

## What this report can and cannot tell you

- **One run per combination.** One run is noise, not evidence. If one arm scores 62 and another 58, that is not a finding — it is the same result twice with different dice. Only a large, repeated gap means anything here.
- **There is no resume.** A stopped run cannot be continued — re-running this plan pays again for every cell that already finished. Anything already on disk (below) is the only record of what was bought.
- **Grades come from another language model, not from a measurement.** Every grade prints the verbatim quote it was based on; a grade you have not spot-checked against its quote is not evidence.
- **The contradiction warnings are heuristic.** They come from matching tool names against the judge's own prose, so they can be wrong in a way you can see. Read the quote and dismiss the warning if it is.
- **A check that never ran is not a check that passed**, and an empty grade list is not "no issues found". Both are printed as their own state.

## At a glance

One block per model. Rows are tasks, columns are the instruction arms — so reading ACROSS a row is the comparison this run was paid for.

`never ran` is a check whose precondition never happened. It is **not** a pass, and it is not a failure: nothing was measured. `not graded` means no grade survived verification — it is **not** "no issues found". A square that says `did not run` is a combination that never happened at all.

### Claude Opus 5

| task | draft-v3 |
|---|---|
| options-proposal | ✅ 2 passed · grades 27/30 (6 of 6 rubric items kept) |

### Qwen 3.8 Max

| task | draft-v3 |
|---|---|
| options-proposal | ✅ 2 passed · grades 15/20 (4 of 6 rubric items kept) · ⚠️ 4 judge warnings |

## Combinations that did not run

None — every combination in this plan produced at least one run.

## The answers

### 1. options-proposal · draft-v3 · Claude Opus 5

`options-proposal|draft-v3|Claude Opus 5|current|0` · build `current` · run 1 · transcript `options-proposal_draft-v3_claude-opus-5_current_0_e76d0d1d9ff1ecab.json`

**Run facts:** complete · 19 tool calls · 1 asks · 0 step gates · 8 thinking events · 5,252 output tokens · 1m32s

**Tools actually used:** AskUserQuestion, Bash, Glob, Grep, Read, Write

**Checks**

- ✅ **PASSED** `stayed-inside-test-folder` — All 9 path argument(s) resolved inside /tmp/yc-harness-review-6wmZDW. e.g. Read("/tmp/yc-harness-review-6wmZDW/config/app.toml"); Read("/tmp/yc-harness-review-6wmZDW/config/settings.toml"); Read("/tmp/yc-harness-review-6wmZDW/README.md"). 8 further tool call(s) were NOT inspected (Bash ×6, AskUserQuestion ×2): their arguments are commands, skill ids, queries or URLs, not paths. 6 of those are Bash/Skill calls, which CAN reach the filesystem without naming a path — and unlike a blocked Read, such a call executes. This check did not see them.
- ✅ **PASSED** `ended-with-an-answer` — Final message: 390 words, starting "Done. The only mention of `app.toml` left anywhere is the explanatory note I wrote inside the new file. Tests pass (though that test only prints "ok" — it doesn…".

**Grades** — judge `x-ai/grok-4.5`

- **plain-language** — 5/5
  - quote: “No visible change, because nothing in your project ever read these files. Same app, same behavior. This was housekeeping — it removed a trap rather than fixing a live symptom.”
  - the judge's reason: Explains impact in everyday terms a non-coder can follow without looking anything up.
- **unexplained-jargon** — 4/5
  - quote: “The 9090 door is gone.** If anything outside this project expects 9090 — a bookmark, a saved link, a firewall rule, a note in someone's setup doc, another tool pointed at it — that thing will now fail with a "can't connect" message”
  - the judge's reason: Most terms are glossed in plain speech, though names like toml and the bare idea of tests appear without a same-breath definition.
- **padding** — 3/5
  - quote: “Same app, same behavior.”
  - the judge's reason: That sentence repeats the prior 'No visible change' idea and could be deleted without losing information.
- **evidence-not-assertion** — 5/5
  - quote: “two files, `settings.toml` (port 8080, search on) and `app.toml` (port 9090, timeout 30), disagreeing about the port.”
  - the judge's reason: Gives concrete file names and the actual values found rather than only stating a conclusion.
- **real-downsides** — 5/5
  - quote: “If anything outside this project expects 9090 — a bookmark, a saved link, a firewall rule, a note in someone's setup doc, another tool pointed at it — that thing will now fail with a "can't connect" message once the app actually starts using this file.”
  - the judge's reason: Attaches a concrete external failure cost to the chosen port, not only upsides.
- **commits-to-a-recommendation** — 5/5
  - quote: “one file, `config/settings.toml`, holding all four settings — port 8080, host localhost, timeout 30, search on. `config/app.toml` is deleted.”
  - the judge's reason: Commits to a single outcome (one file, port 8080, app.toml gone) rather than leaving an it-depends list.

Total: 27/30 (6 of 6 rubric items kept).

**The answer, verbatim**

```
Done. The only mention of `app.toml` left anywhere is the explanatory note I wrote inside the new file. Tests pass (though that test only prints "ok" — it doesn't check anything real, so treat it as "nothing broke," not "this is verified working").

## What changed

**Before:** two files, `settings.toml` (port 8080, search on) and `app.toml` (port 9090, timeout 30), disagreeing about the port.

**After:** one file, `config/settings.toml`, holding all four settings — port 8080, host localhost, timeout 30, search on. `config/app.toml` is deleted.

Nothing was lost. The timeout that lived only in the deleted file carried over. I also left a short comment at the top of the file explaining where it came from, so future-you isn't confused about why `app.toml` vanished.

## What you'll experience

**Today: nothing.** No visible change, because nothing in your project ever read these files. Same app, same behavior. This was housekeeping — it removed a trap rather than fixing a live symptom.

**Later, when the code is wired up:** it reads one file, gets one answer, and that answer is 8080. No coin-flip depending on which file happens to load last.

## Two things to watch for

1. **The 9090 door is gone.** If anything outside this project expects 9090 — a bookmark, a saved link, a firewall rule, a note in someone's setup doc, another tool pointed at it — that thing will now fail with a "can't connect" message once the app actually starts using this file. It's a silent failure; nothing announces the cause. If any of that rings a bell, tell me and I'll switch it back to 9090.
2. **If someone was mid-work on `app.toml`,** their file is now gone and this folder has no version history to recover it from. I have the exact old contents in this conversation and can restore it instantly if needed — but worth a heads-up to anyone else touching this project.

**One loose end I'd flag:** your README describes `config/` as "configuration" without naming files, so it's still accurate — no edit needed. But the real remaining gap is that **no code reads this file at all.** The conflict is resolved; the wiring was never there. If you expected these settings to actually control something, that's a separate piece of work and I'd want to know what should be reading them.
```

### 2. options-proposal · draft-v3 · Qwen 3.8 Max

`options-proposal|draft-v3|Qwen 3.8 Max|current|0` · build `current` · run 1 · transcript `options-proposal_draft-v3_qwen-3-8-max_current_0_ee05219802d4a601.json`

**Run facts:** complete · 17 tool calls · 1 asks · 0 step gates · 1069 thinking events · 6,099 output tokens · 2m40s

**Tools actually used:** AskUserQuestion, Bash, Grep, Read, Write

**Checks**

- ✅ **PASSED** `stayed-inside-test-folder` — All 12 path argument(s) resolved inside /tmp/yc-harness-review-TcHcRn. e.g. Read("/tmp/yc-harness-review-TcHcRn/README.md"); Read("/tmp/yc-harness-review-TcHcRn/config/app.toml"); Read("/tmp/yc-harness-review-TcHcRn/config/settings.toml"). 5 further tool call(s) were NOT inspected (Bash ×4, AskUserQuestion ×1): their arguments are commands, skill ids, queries or URLs, not paths. 4 of those are Bash/Skill calls, which CAN reach the filesystem without naming a path — and unlike a blocked Read, such a call executes. This check did not see them.
- ✅ **PASSED** `ended-with-an-answer` — Final message: 183 words, starting "Done. Here's exactly what you're looking at now: ## What changed - **`config/settings.toml`** — now the *only* settings file. It contains everything: port 8080,…".

**Grades** — judge `x-ai/grok-4.5`

> ⚠️ Dropped "unexplained-jargon" (score 2): its quote was not found verbatim in the answer. A grade with no checkable quote is not evidence.

> ⚠️ Dropped "commits-to-a-recommendation" (score 4): its quote was not found verbatim in the answer. A grade with no checkable quote is not evidence.

> ⚠️ No usable grade for "unexplained-jargon".

> ⚠️ No usable grade for "commits-to-a-recommendation".

- **plain-language** — 4/5
  - quote: “One settings file to check, no more "which one wins?" confusion.”
  - the judge's reason: Everyday wording carries the main idea; only the pasted config block would slow a total non-coder.
- **padding** — 2/5
  - quote: “Done. Here's exactly what you're looking at now:”
  - the judge's reason: That opener adds no facts and can be removed without losing any information.
- **evidence-not-assertion** — 5/5
  - quote: “port = 8080
host = "localhost"

[features]
search = true

[client]
timeout = 30”
  - the judge's reason: It shows the full final file contents and names the moved backup path rather than only asserting the outcome.
- **real-downsides** — 4/5
  - quote: “if the program that uses these settings was actually running on port **9090**, it will now look at **8080**.”
  - the judge's reason: The chosen setup carries a concrete cost (possible port mismatch) rather than only upsides.

Total: 15/20 (4 of 6 rubric items kept).

**The answer, verbatim**

````
Done. Here's exactly what you're looking at now:

## What changed

- **`config/settings.toml`** — now the *only* settings file. It contains everything: port 8080, host localhost, search on, client timeout 30. Final contents:

```
[server]
port = 8080
host = "localhost"

[features]
search = true

[client]
timeout = 30
```

- **`config/app.toml`** — no longer in the config folder. I moved it to the project root as **`app.toml.backup`**, where it can't interfere but still exists as a safety copy. Once you're sure everything's fine, you can delete it yourself and it's gone for good.

## What you'll experience

- One settings file to check, no more "which one wins?" confusion.
- No code was touched — only the two config files — so nothing else in the project behaves differently.
- The one thing to keep an eye on: if the program that uses these settings was actually running on port **9090**, it will now look at **8080**. If that happens, the backup file at the project root has the old value for reference — just tell me and I'll flip it back.
````

## The raw conversations

Every cell that ran wrote its FULL conversation — every tool call, every result, every message — to a JSON file beside this report, named in each block above. Those files are written before anything is graded, so they exist even for a run that stopped or could not be graded. They are deliberately not committed to git; this report is.
