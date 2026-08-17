---
status: active
created: 2026-08-16
related:
  - docs/active/specs/2026-08-16-native-specialists-plan-1c-design.md
  - docs/active/plans/2026-08-16-native-specialists-plan-1c-implementation.md
  - docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md
---

# Specialists 1c — hands-on testing checklist

Plan 1c changes how a hired helper looks and is managed: everything about one
helper lives on one card and in one popup, helpers can be defined by dropping
in a file, and there's a new Settings page for them. This checklist walks
through all of it.

Read this top to bottom. Each check says **what to do**, **what you should
see**, and **what would be wrong**. There's a column to write your result in.
Budget ~35 minutes for the easy checks; the awkward ones (marked below) can
wait for whenever suits you.

**A few of these can only really be judged with a real model doing real
work** — a genuine hire, a real permission question, a real five-minute wait.
Those are marked **(real model)** below. If you skip one, leave its result
blank rather than guessing — a blank row is honest; a guessed "pass" isn't.

## Before you start (2 min)

1. Find the window titled **`YouCoded - Specialists 1c`** in your taskbar.
   That's the dev build. Your normal YouCoded is untouched — leave it alone.
2. In the dev window, open **Settings** and confirm you're on a cloud model
   (OpenRouter or Anthropic), or one of the few strong local ones. A small
   local model won't hire a specialist at all — that's expected, not a bug.
3. Start a new native conversation in a folder with real files in it —
   specialists read files, so an empty folder gives them nothing to do.
4. Leave permission mode on **Ask** (the default).

Terminology: the main assistant is the **parent**; a specialist it hires is a
**helper**. Every hire gets a **task_id**, a ticket number the parent uses to
talk about that helper later.

---

## Part 1 — do these in one sitting (no waiting, no reload)

### 1. Background hire — the card and the chip **(real model)**

**Say:**
> Hire a specialist in the background to research what this folder is for and write a short summary. While it works, count from 1 to 10 for me, one number per line.

**You should see:**
- A permission card, then a Task card appears with a spinning icon and the
  line **"Working in the background · "** followed by a running clock
  (e.g. "Working in the background · 12s").
- In the status bar, a chip reading **"1 specialist"**.
- The parent counts to 10 without waiting for the helper.
- When the helper finishes, the card's status line changes to something like
  **"Finished in 43s · 6 steps"**, and the chip changes to **"1 finished"**.

**Wrong if:** no chip appears; the status line still says "Working" after the
helper is clearly done; the parent waits for the helper before counting.

| Result | Notes |
|---|---|
| | |

---

### 2. A helper asks you something — card and popup stay in sync **(real model)**

Set up a case the helper can't decide on its own — hire the **worker**
specialist (the only one with a shell) and ask it to do something that needs
a card, e.g.:

> Hire the worker specialist in the background to create a temp file called probe.tmp in this folder, then delete it with rm.

**You should see:**
- A row appears **on the Task card itself**, inside its activity list, with
  Yes / Always Allow / No buttons — same as any other permission ask.
- Click the chip. The same ask appears **again**, in a card of its own, in
  the popup, with the same three buttons.
- Answer it from **the popup** (not the card). Both places clear at once —
  the row disappears from the card too, without you touching it.

**Wrong if:** the ask only shows in one place; answering in the popup leaves
the card's row stuck with live buttons; a fresh permission card is asked for
in a different window/place instead of nesting into the existing Task card.

| Result | Notes |
|---|---|
| | |

---

### 4. Sending a note to a running helper

Start any background hire, then while it's running:

**From the card:** click **"Send \<name\> a note"** on the Task card, type a
short note ("Only check the top-level files"), click Send.

**You should see:** a new row in the card's activity reading
**"You sent \<name\> a note: \<your text\>"**.

**From the popup:** open the chip, find the same helper, click **Note**, type
another note, send.

**You should see:** the same kind of row appears — and it shows up on **both**
the card and the popup (they're the same helper, so the note appears in both
places once you look).

**Then paste 2,001 characters into either note box.**

**You should see:** the character counter reads **"2,001 / 2,000"**, and the
**Send** button turns grey and does nothing when clicked or when you press
Enter — it refuses rather than sending a cut-off note.

**Wrong if:** the note never appears as a row; a note sent from one place
doesn't show up when you check the other; the over-length note sends anyway.

| Result | Notes |
|---|---|
| | |

---

### 5. Stopping a helper

While a helper is running, click **Stop** (on the card or in the popup).

**You should see:** the status line changes to something like
**"Stopped after 1m 4s — the assistant can pick this back up"**, and the
chip's count drops it out of "working".

**Wrong if:** it keeps running after Stop; the status line still says
"Working"; no report/note explains it stopped.

| Result | Notes |
|---|---|
| | |

---

### 7. A file you drop in becomes a hireable specialist

1. Create `~/.youcoded/specialists/docs-writer.md` with valid frontmatter
   (name, description, `tools:`, etc — see the starter `example.md` already
   in that folder for the format).
2. Open **Settings → Specialists**, click **Refresh**. Your new specialist
   should appear under the **"Your specialists"** group, showing its
   filename underneath its name and description (just the filename, e.g.
   "docs-writer.md" — the group heading above it already says where it's
   from, so the row doesn't repeat "Your specialists").
3. In the same conversation (no restart needed), ask the assistant to hire
   `docs-writer`. **You should see:** a consent card listing exactly the
   tools you gave it in the file, and a line under the helper's name reading
   just the filename — **"docs-writer.md"** (not a longer phrase — see the
   note below the table).
4. While that hire is running, edit the file's `tools:` line (add or remove
   one). **You should see:** the running card is unaffected — same tools it
   started with. Hire it again fresh, and the new hire uses the edited list.

**Wrong if:** Settings doesn't show the file after Refresh; the very next
message can't hire it; the running helper's tools change mid-run; the
edited file's changes never show up on a fresh hire.

> **Note on the card text:** the plan this checklist was originally written
> against expected the consent card to say "Your specialists folder ·
> docs-writer.md". That phrase does not exist anywhere in the shipped code —
> both the Settings row and the consent card use the same one-line "where
> this came from" function, and for your own files it deliberately drops the
> folder name (the reasoning: under the "Your specialists" heading in
> Settings, repeating "Your specialists folder" on every row was noise). The
> card has no heading above it, so the same shortening leaves it with just
> the bare filename and no context words at all. That may be worth a second
> look — flagging it rather than quietly fixing it, since it's a small
> present-or-not judgment call, not a functional bug.

| Result | Notes |
|---|---|
| | |

---

### 8. A Claude Code agent file, with tools that don't translate

1. In this project's folder, create `.claude/agents/code-reviewer.md` with:
   ```
   ---
   name: Code Reviewer
   tools: Read, Grep, MultiEdit, mcp__x__y
   permissionMode: bypassPermissions
   ---
   Review code for bugs.
   ```
2. Open **Settings → Specialists**, Refresh. Expand the new row. **You
   should see two warnings**: one saying **"MultiEdit was removed — Edit
   covers it"**, and one naming the removed `mcp__x__y` tool ("1 tool this
   file asked for isn't available to helpers here … removed: mcp__x__y").
   A third warning should say **"permissionMode is ignored — helpers ask
   through the assistant, and approving the hire is the grant"**.
3. Hire it. **You should see** the consent card say
   **"This project's .claude/agents/code-reviewer.md"** under its name.

**Wrong if:** any of the three warnings is missing or worded so vaguely you
can't tell which tool was dropped; the card doesn't name the file; the
helper somehow gets MultiEdit, the mcp tool, or bypassed permissions anyway.

| Result | Notes |
|---|---|
| | |

---

### 9. A filename collision with a built-in

Create `.claude/agents/worker.md` (any valid content, `name: Worker`).

**You should see:** in Settings, it's listed as skipped, with a warning
naming what took the id first — something like **`"worker" is already the
name of a built-in specialist — rename this file's name/id`**. Hiring the
built-in Worker still works normally, unaffected by the file sitting there.

**Wrong if:** the file silently replaces the built-in Worker; nothing in
Settings explains why your file didn't load.

| Result | Notes |
|---|---|
| | |

---

### 9b. Approvals don't cross helpers, even in the same folder

1. Hire the built-in **Worker** in this folder and click **Always allow**.
2. Now hire the project's `code-reviewer` (from check 8) — a **different**,
   read-write helper in the same folder.
3. **You should see** a consent card appear again for `code-reviewer`, with
   **no Always-allow button offered at all** — its card says "This project's
   .claude/agents/code-reviewer.md" as before.
4. Hire the built-in Worker a second time. **You should see** it go through
   with no card — the earlier Always-allow still covers it.

**Wrong if:** step 3's card offers Always-allow, or worse, doesn't appear at
all (that means the Worker's earlier grant leaked to a different helper —
tell whoever's handling this immediately, it's a security-relevant one).

| Result | Notes |
|---|---|
| | |

---

### 9d. Two conversations sharing a folder

Open a **second** conversation in the same project folder (don't close the
first one). Hire a specialist in it. **You should see** the same roster —
including this project's `code-reviewer` — available to hire from. Close the
first conversation. Go back to the second and hire again. **You should see**
the roster still lists the project's helpers — closing the other conversation
didn't take them away.

**Wrong if:** the second conversation's roster is missing the project's own
helpers, either before or after the first conversation closes.

| Result | Notes |
|---|---|
| | |

---

## Part 2 — needs a wait, a reload, a phone, or an unusual model

Do these whenever it's convenient. Each note says why it can't be a quick
one-sitting check.

### 3. The five-minute hold **(real model, ~5+ minute wait)**

Hire a helper the way check 2 did, so a permission ask lands on its card.
**Do not answer it.** Leave it alone for at least 5 minutes — go do something
else, or keep chatting in a different conversation.

**You should see:** after 5 minutes, the ask's row turns amber and reads
**"No answer for 5 minutes, so \<name\> carried on without this. Yes still
works — it lands as a follow-up."** The Yes/No buttons are still there and
still work.

Then click **Yes**. If the helper had already finished by the time you
answer, the row instead should have read
**"\<name\> has finished; a Yes now tells the assistant, which can send
\<name\> out again with your answer."** — worth watching for, since which of
the two you see depends on timing.

**Wrong if:** the row just vanishes after 5 minutes instead of changing to
this wording; the buttons stop working; a finished helper's row still
implies it can resume mid-step.

*Why this can't be sped up:* the 5-minute wait is a fixed number in the code
with no test-only override — there's no way to fast-forward it from the UI.

| Result | Notes |
|---|---|
| | |

---

### 6. Reload the window mid-run **(dev window only — Ctrl+R)**

Start a background hire. While it's clearly running, press **Ctrl+R** in the
**dev window** (never your regular YouCoded window). Reopen the same
conversation once it reloads.

**You should see:** the Task card is still there with its status and any
notes it had, picking up where it left off (not reset to "just started"). If
there was an unanswered permission ask on screen before the reload, it
should come back with its Yes/No buttons still live and answerable.

**Wrong if:** the card is gone or reset after reload; a pending ask comes
back with no buttons, or as if it were a brand-new question.

*Why this waits:* it needs a window reload, which briefly interrupts
whatever else is happening in that window.

| Result | Notes |
|---|---|
| | |

---

### 9c. Reload with a held ask on screen **(dev window only, plus a wait)**

Combine checks 3 and 6: get an ask into the "held" state (5-minute wait,
check 3), then reload the dev window (Ctrl+R) before answering it.

**You should see:** after reload, the row still reads the "carried on"
wording from check 3 — not reset to looking like a fresh, never-timed-out
question.

**Wrong if:** the reload makes it look like a brand-new ask, hiding that the
helper already moved on without an answer.

| Result | Notes |
|---|---|
| | |

---

### 10. Setting a model tier

Open **Settings → Specialists**. Under **"Specialist intelligence tiers"**,
pick a model for **Budget**. Then hire a specialist and ask for it to run on
the budget tier, e.g.:

> Hire a specialist on the budget model to list the files here.

**You should see:** the helper's card shows **"· on \<the model you picked\>"**
next to its name.

**Wrong if:** the card doesn't mention a model at all; it shows a different
model than the one you picked.

*Why this waits:* it's an interactive Settings interaction plus a live hire —
easy to do, just grouped here since it needs your own model choice rather
than a scripted check.

| Result | Notes |
|---|---|
| | |

---

### 11. A helper's own reasoning **(real model — needs a reasoning-capable model)**

Hire a specialist while using a model that shows its reasoning/thinking (not
every model does this). **You should see:** a collapsed **"Thinking"**
section inside the helper's own card. The parent's own message bubble should
stay clean — no sign of the helper's reasoning leaking into it.

**Wrong if:** the helper's reasoning shows up in the parent's own thinking
display instead of, or in addition to, its own card.

*Why this waits:* it only shows up with specific reasoning models — not
something you can force with an ordinary hire.

| Result | Notes |
|---|---|
| | |

---

### 12. Android — desktop-only message **(needs an Android debug build)**

On an Android debug APK, open **Settings → Specialists**.

**You should see:** a plain message —
**"Specialists run on the desktop app. Open Settings there to add or edit
them."** — not an empty list, a spinner, or an error.

**Wrong if:** the screen looks broken, empty, or stuck loading instead of
explaining that this feature isn't on the phone yet.

*Why this waits:* needs a separate Android device/build, not the desktop dev
window this checklist otherwise uses.

| Result | Notes |
|---|---|
| | |

---

## When you're done

Tell whoever's handling this which numbered checks passed, which didn't, and
paste anything that looked wrong. Flag check 9b first if it fails — that one
is about permissions leaking between helpers, which is worth stopping for
immediately rather than batching with everything else.
