---
status: active
date: 2026-08-20
branch: youcoded feat/native-specialists-background @ 240c4ea5
dev-instance: "YouCoded - Specialists 1b" (bash scripts/run-dev.sh spec-bg --label "Specialists 1b")
---

# Specialists 1b — hands-on testing checklist

Read this top to bottom. Each test says **what to do**, **what you should see**, and **what would be a bug**. Do them in order — later ones build on earlier ones. Budget ~40 minutes.

## Before you start (2 min)

1. Find the window titled **`YouCoded - Specialists 1b`** in your taskbar. That's the dev build. Your normal YouCoded is untouched — leave it alone.
2. In the dev window, open **Settings** and confirm you are on a **cloud model** (OpenRouter or Anthropic). Specialists are only offered on cloud models and a few strong local ones (Qwen 3.6 MoE, Qwen 3.5 large, Gemma 4). A small local model will simply never delegate — that is by design, not a bug.
3. Start a **new native conversation** (not a Claude Code one) in a **folder with some real files** — a code project or a docs folder. Specialists read files, so an empty folder gives them nothing to do.
4. Leave the permission mode on **Ask** (the default). Several tests depend on it.

Terminology in this doc: the main assistant is the **parent**; a specialist it hires is a **child** or **helper**. Every hire gets a **task_id** — a ticket number the parent uses to talk about it later.

---

## Test 1 — Foreground hire (this already worked in 1a; a sanity check)

**Say:**
> Use a specialist to find every file in this folder that mentions the word "config" and tell me which one looks like the main entry point. Wait for it to finish before you answer.

**You should see:**
- A permission card asking to approve the hire (something like "Let a read-only specialist work in `<folder>`"). Click **Yes** (not "Always Allow").
- A tool card for the Task, with the child's tool calls (Grep, Read…) nested under it.
- The parent's answer arrives *after* the child finishes.

**Bug if:** no permission card at all; the child's activity appears as top-level bubbles instead of nested under the Task card; the parent answers before the child is done.

---

## Test 2 — Background hire (the centrepiece)

**Say:**
> Hire a specialist to research what this folder is for and write a short summary. Run it in the background. While it works, count from 1 to 10 for me, one number per line.

**You should see:**
1. Permission card → **Yes**.
2. The parent gets an immediate acknowledgment mentioning **"is now working in the background (task_id: …)"** and telling it not to poll.
3. The parent **counts to 10 without waiting**.
4. When the child finishes, a new message appears in the parent's conversation containing **"[Background specialist finished]"** and the report — **only after** the parent's counting turn ended, never spliced into the middle of it.

**Bug if:** the parent waits for the child before counting; the report appears mid-count; the report never arrives (give it a couple of minutes — a slow model is not a bug); the report arrives twice.

**Known cosmetic gap (not a bug):** the injected report currently renders as a plain **user-style bubble**, indistinguishable from something you typed. Styling it is 1c's job.

---

## Test 3 — The status block (parent never forgets)

Right after Test 2's hire is acknowledged and **before** its report lands, **say:**
> What are you working on right now?

**You should see:** the parent mentions the running specialist by name — the harness gives it a status line every turn like `Nadia (researcher): running — 34s`. It should NOT say "I'm not doing anything" or claim to have no helpers.

After the report has landed, ask again. Now it should say nothing is running.

**Bug if:** it doesn't know about a running helper; it still reports one after delivery.

---

## Test 4 — Steer a running child

Start a slow background job:
> Hire a specialist in the background to read every file in this folder one at a time and describe each one in detail.

Then, **while it's still running**, say:
> Tell the specialist to only cover the three largest files and skip everything else.

**You should see:** the parent uses the task_id and gets back **"Steer delivered to <name>."** The child's later behaviour narrows (fewer files).

**Bug if:** the parent claims it can't communicate with the child; the parent starts a brand-new hire instead of steering the existing one.

---

## Test 5 — Interrupt a child

While a background child is running (start another if needed), say:
> Stop that specialist, I don't need it any more.

**You should see:** a typed result naming what it was doing; the status block stops listing it; **no report** arrives later.

**Bug if:** it keeps running / a report shows up after you stopped it.

---

## Test 6 — Resume a finished child

After Test 2's report arrived, say:
> Ask that same specialist to also tell me which file was most recently modified.

**You should see:** the parent resumes the **same task_id** (not a new hire), and you get a second report. Crucially it must be a **new** report about modification dates — **not a re-delivery of the first summary**.

**Bug if:** you get the first report again; the second report never arrives; a fresh permission card appears (a resume re-uses the earlier approval).

---

## Test 7 — Restart survival (the durability promise)

1. Start a background hire with a genuinely long brief (e.g. "read and summarise every file, thoroughly").
2. Wait ~10 seconds — enough that it's clearly running.
3. **Close the dev window** (just the dev one — `YouCoded - Specialists 1b`).
4. Relaunch it: in this chat tell me "relaunch dev" and I'll do it. (Or ask me for the command.)
5. Reopen the same conversation.

**You should see:**
- The Task card and the child's work under it are **still visible** (card replay).
- The status block (ask "what are you working on?") reports that specialist as **interrupted** — honestly, because it did stop.
- The parent can **resume it by task_id** ("pick that back up") and it continues.

If the child had *finished* just before you closed the app but its report hadn't landed yet, the report should be delivered on your **first message after reopening**.

**Bug if:** the card is gone; the child is reported as still running; a finished-before-close report never arrives.

---

## Test 8 — A child asks YOU for permission (routed asks + the 5-minute redirect)

Set up a case the child can't decide itself. **Say:**
> Hire a background specialist to run `git log --oneline -5` in this folder and report the last five commits.

(The Worker specialist can run commands, but a shell command needs your OK.)

**You should see:**
- A permission card appears **in your conversation** — for a request the *child* made — labelled with the specialist's name/type.
- **Don't answer it.** Leave it for 5+ minutes. Keep chatting if you like.
- After ~5 minutes the child is told the user hasn't responded and to continue anything that doesn't depend on it, and to **not** work around the block. It will finish with whatever it has.
- **The card is still on screen and still answerable.** Now click **Yes**. Because the child already finished, the parent gets a note like **"[Specialist follow-up] The user approved …after the specialist finished. Use task_id … to continue"** — and can resume it to actually run the command.

Then repeat the hire and this time click **Deny** promptly. **You should see:** the child is told the user declined (plain wording, no "hasn't responded" language) and finishes without running it.

**Bug if:** the card never appears (auto-denied silently); the card vanishes at timeout; the child runs the command anyway after a deny; the deny message says the user "declined" when you actually just hadn't answered yet.

---

## Test 9 — "Always allow" for a specialist can't widen YOUR permissions (security-critical)

1. Repeat Test 8's hire. When the child's card appears, click **Always allow** (pick the narrowest option if it offers a width).
2. Open **Settings → Permissions**. **You should see** the new rule described as being for **the Worker specialist** — plain language like "Let the Worker specialist run…" — not as a rule for you.
3. Now, in the **parent** conversation, ask the parent itself to run the exact same command:
   > Run `git log --oneline -5` yourself, don't delegate.

   **You should see a permission card.** The specialist's grant must **not** carry over to you.
4. Back in Settings → Permissions, click the ✕ to **revoke** the specialist rule. It should disappear and stay gone after reopening Settings.

**Bug if:** the parent runs the command with no card in step 3 (a leak — stop and tell me immediately); the rule can't be removed; the rule is described in jargon or without naming the specialist.

---

## Test 10 — Steering call can't grant blanket delegation (security-critical, quick)

1. With a background child running, tell the parent to steer it (as in Test 4). If a permission card appears for that steer, look at it: it should offer **Allow once / Deny**, but any **Always allow** should either be **absent** or, if clicked, must **not** result in future hires skipping their card.
2. To verify: after allowing, start a completely new hire (Test 1's prompt). **A permission card must appear.**

**Bug if:** a fresh hire sails through with no card after an Always-allow on a steer. That's a leak — tell me immediately.

---

## Test 11 — Budget/frontier model tiers (your ruling)

There's no Settings picker yet (that's 1c), so today both tiers are unset. **Say:**
> Hire a specialist on the "budget" model to list the files here.

**You should see:** the child runs on the conversation's own model and the ack includes **"(No budget model is designated — using this conversation's model.)"** — honest about the fallback.

Now: > Use ModelSearch to find a Claude model, then hire a specialist on that exact model id to list the files.

**You should see:** the model calls the ModelSearch tool, gets a short price-sorted list, picks an id, and the hire runs on that model. If it invents a bogus id, the hire is **refused** with "is not an available model" — never silently switched to something else.

**Bug if:** an unknown id gets silently substituted; ModelSearch says the catalog is unavailable on a cloud provider (that means the wiring is broken).

---

## Test 12 — Big report spills to a file

> Hire a specialist to read every file in this folder and paste the full contents of each into its report.

**You should see:** the report the parent gets is truncated with a footer like **"[Truncated to fit. Full report saved to: <path> — Read it if you need the rest.]"** and, if you ask the parent to read that path, it does so **without** an "outside the project" permission card (the spill folder is exempt — but only that folder).

Then ask: > Read `~/.youcoded/sessions/` and list what's in there.

**You should see:** a permission card. The exemption must NOT cover the wider sessions directory.

**Bug if:** the footer names a file that doesn't exist; reading the spill file prompts; reading the wider directory does *not* prompt.

---

## Test 13 — Refusals read as real refusals

- Ask the parent to steer a made-up id: > Send a note to specialist task_id abc123.
  **You should see:** "Refused: that task_id does not belong to a specialist of this session." Same wording whether the id is fake or belongs to another conversation.
- Ask it to hire with a placeholder brief: > Hire a specialist with the prompt "TODO".
  **You should see:** a refusal saying the prompt looks like an unexpanded placeholder.
- Hire a **second** Worker while a first Worker is running: **You should see:** "Refused: another specialist with write access is running…" (only one writer at a time; read-only ones can run in parallel).

---

## When you're done

Tell me which numbered tests passed, which failed, and paste anything that looked wrong. Anything marked **security-critical** that fails, tell me first. Then I'll fix, re-verify, and we push.
