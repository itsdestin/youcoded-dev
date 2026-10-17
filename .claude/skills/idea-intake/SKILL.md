---
name: idea-intake
description: Use when Destin dumps an idea for YouCoded — something he wants built, what it probably needs, or what it might unlock later ("i wanna…", "it'd be cool if…", "we should add…", "eventually i want…") — rather than asking for work on something already in progress. Proposes how to file it as work cards; files nothing until he says yes.
---

# Idea intake — Destin talks, you file

Destin never thinks in cards (2026-10-14: "i just want to be able to dump ideas as i have done previously,
and you figure out how to group/organize/rearrange things as cards and such and make suggestions"). Cards
are your bookkeeping: `cards/<n>-<name>.md`, managed by `scripts/cards.mjs`. Spec:
`docs/archive/specs/2026-10-14-work-cards.md`.

## 1. Read what already exists

`node scripts/cards.mjs index` — every card (number, stage, title, tags, needs). The old roadmap's
open entries were all moved into cards on 2026-10-15 (a card's `roadmap:` line names the entry it came from).
Match his idea against it **by meaning, not wording**: "agents that run while I sleep" is the card
"Agents that work while you're away".

## 2. Pick the stage: exploring or planning

Two early stages (Destin, 2026-10-15):

- **Preliminary exploration** — the default for an idea dump. "Sometimes i just say shit … just something i
  want on paper." Exploration items **may overlap or contradict each other**: a feature he has described
  six ways over months is six exploration items, linked with `--related`, not forced into one.
- **Planning** — only when he is ready to think through building it. Planning items **never overlap**:
  moving an idea to Planning means consolidating its related exploration items into one card (say which).
  `cards.mjs check` refuses two overlapping Planning-or-later cards.

When a new dump overlaps an existing exploration item, propose a new exploration item **related** to it
(his new framing is kept), not a merge, unless he says it replaces the old one.

## 3. Split it into pieces

An idea dump usually holds three kinds of thing. Keep them apart:

- **The idea itself** — what he wants now.
- **What it needs** — parts that must exist first. Each is either already a card (link it) or new.
- **What it unlocks later** — the "and then we could…" part. An exploration item that needs the main one;
  nobody starts it yet.

Prefer fewer, bigger cards. One card = one piece of work a chat could finish and merge on one branch. Do not
split a thing he described as one unless its parts really ship separately.

## 4. Reply with ONE short filing proposal — and stop

Plain words; real terms when they are clearest (his rule: "merge to master" beats a paraphrase). Never
say "card" more than needed; say what happens. Shape:

> **How I'd file this:**
> - **<Name>** — new, exploring. <one line what it is>.
> - **<Name>** — already exists (#12, Agentic buildout). I'd link to it, not add another.
> - **Later: <name>** — saved as an idea that needs <name>; nothing starts.
> - **Overlaps:** <exploration items this one relates to, kept side by side>.
>
> **Order:** <what has to come first and why, one line>.
> Say yes and I'll file it, or tell me what to change.

Four to six lines is right; never a wall. **Leave out any line with nothing to say** (no "Later: none",
no "Overlap: none"). If the idea is a single small thing with no needs, one line: "I'd file this as one new
item: <name>. Yes?"

If something he said is genuinely ambiguous **and changes the filing**, ask that one question inside the
proposal. Do not ask about anything you can decide.

## 5. On his answer

- **Yes** (or "sure", "do it", "ok"): for each new card, in dependency order so `--needs` can name the
  numbers just made:
  `node scripts/cards.mjs new --title "<plain title>" --stage explore --tags <tags> --needs <ids> --related <ids> --vision <part ids> --why "<his words, short>"`
  — `--vision` names the parts of his vision it builds (ids from `pages/work-board/renderer/vision-options/facts.json` → `nodes`; the most specific part, usually 1–3; none for pure housekeeping), so the Work board's Big picture shows it (2026-10-16). Once master carries the items, `new` saves straight to master.
  then `node scripts/cards.mjs check`. A finish line (`--finish`) only when he said what "done" means;
  otherwise leave it for the first chat that builds it. Commit the new files by explicit path on a branch,
  push, and reply with one line naming what was filed and their numbers.
- **Changes**: redo the proposal with the change; ask again.
- **Silence or a change of subject**: file nothing. It stays a suggestion in this chat only.

## Do not

- File anything before he says yes.
- Duplicate: if a card already covers it, the answer is a link, not a new item.
- Turn this into a planning session. Intake ends at filing; building starts when he says to work on it.
- Offer "roadmap only" or edit the old roadmap. **Cards replace the roadmap** (Destin, 2026-10-15: "thought
  we were obsoleting old roadmap?"). Everything becomes a card, even a one-line fix; "add it to the
  roadmap" in his words means "file it". The old roadmap's entries all became cards on 2026-10-15 and
  its files were deleted.
