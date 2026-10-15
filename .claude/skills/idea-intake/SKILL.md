---
name: idea-intake
description: Use when Destin dumps an idea for YouCoded — something he wants built, what it probably needs, or what it might unlock later ("i wanna…", "it'd be cool if…", "we should add…", "eventually i want…") — rather than asking for work on something already in progress. Proposes how to file it as work cards; files nothing until he says yes.
---

# Idea intake — Destin talks, you file

Destin never thinks in cards (2026-10-14: "i just want to be able to dump ideas as i have done previously,
and you figure out how to group/organize/rearrange things as cards and such and make suggestions"). Cards
are your bookkeeping: `cards/<n>-<name>.md`, managed by `scripts/cards.mjs`. Spec:
`docs/active/specs/2026-10-14-work-cards.md`.

## 1. Read what already exists

`node scripts/cards.mjs index` — every card (number, stage, title, tags, needs) and every open roadmap
entry. Match his idea against it **by meaning, not wording**: "agents that run while I sleep" is the
roadmap's "Agents that work while you're away".

## 2. Split it into pieces

An idea dump usually holds three kinds of thing. Keep them apart:

- **The idea itself** — what he wants now.
- **What it needs** — parts that must exist first. Each is either already a card (link it), already a
  roadmap entry (propose turning that entry into a card), or new.
- **What it unlocks later** — the "and then we could…" part. A card at Planning that needs the main one;
  nobody starts it yet.

Prefer fewer, bigger cards. One card = one piece of work a chat could finish and merge on one branch. Do not
split a thing he described as one unless its parts really ship separately.

## 3. Reply with ONE short filing proposal — and stop

Plain words; real terms when they are clearest (his rule: "merge to master" beats a paraphrase). Never
say "card" more than needed; say what happens. Shape:

> **How I'd file this:**
> - **<Name>** — new, Planning. <one line what it is>.
> - **<Name>** — already exists (#12, Agentic buildout). I'd link to it, not add another.
> - **<Name>** — on the roadmap (sync: "…"); I'd make it a card at Planning.
> - **Later: <name>** — saved as an idea that needs <name>; nothing starts.
>
> **Order:** <what has to come first and why, one line>.
> **Overlap I noticed:** <an existing item this duplicates or should fold into — or "none">.
> Say yes and I'll file it, or tell me what to change.

Four to six lines is right; never a wall. If the idea is a single small thing with no needs, one line:
"I'd file this as one new item at Planning: <name>. Yes?"

If something he said is genuinely ambiguous **and changes the filing**, ask that one question inside the
proposal. Do not ask about anything you can decide.

## 4. On his answer

- **Yes** (or "sure", "do it", "ok"): for each new card, in dependency order so `--needs` can name the
  numbers just made:
  `node scripts/cards.mjs new --title "<plain title>" --stage planning --tags <tags> --needs <ids> --why "<his words, short>" [--roadmap "<area>: <first words>"]`
  then `node scripts/cards.mjs check`. A finish line (`--finish`) only when he said what "done" means;
  otherwise leave it for the first chat that builds it. Commit the new files by explicit path on a branch,
  push, and reply with one line naming what was filed and their numbers.
- **Changes**: redo the proposal with the change; ask again.
- **Silence or a change of subject**: file nothing. It stays a suggestion in this chat only.

## Do not

- File anything before he says yes.
- Duplicate: if a card or roadmap entry already covers it, the answer is a link, not a new item.
- Turn this into a planning session. Intake ends at filing; building starts when he says to work on it.
- Edit or close roadmap entries here. Turning a roadmap entry into a card records `--roadmap`; moving the
  roadmap over is separate work.
