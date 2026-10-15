---
date: 2026-10-14
status: draft
type: spec
topic: Work cards — one small file per piece of work, tied to one branch, done when that branch merges. The facts layer the management page reads.
origin: Destin's answers to the management-surface independent review deck, 2026-10-14
related: branch session/management-surface-20261012 → docs/active/design/2026-10-12-management-surface/management-surface.independent-review.{json,answers.json}, recommendations.md (layer 2)
---

# Work cards (build brief, draft)

**For the building session.** This is the agreed direction from Destin's deck answers, not a
contract. Destin said he is "still kinda confused about what we're doing here overall": open with a
short worked example (below) and confirm it before designing further. Questions to him go on a
questions deck.

## Why

No single name follows a piece of work from idea to chat to branch to merge to release, and nothing
stops two chats starting the same work. Evidence (2026-10-13): per-project skills appears in two
roadmap entries, a design folder, youcoded #571 + youcoded-dev #203 and a worktree idle since Sept
24; the management dashboard was designed three times (folders dated Sept 5, Sept 21, Oct 12); most of
the 16 session worktrees hold unsaved or unmerged work; 75 investigations and 18 handoffs are marked
active indefinitely. The management page cannot show "ready to merge", "waiting on you" or "why
isn't this done" because these facts are recorded nowhere.

## Decided (deck answers, 2026-10-14)

| Step | Decision |
|---|---|
| Q-16 | **One small file per card**, kept in the repo; the roadmap list is generated from the cards |
| Q-21 note | **A card is tied directly to a branch and is done only when that branch is fully merged** ("the card should probably be tied directly to a branch, and only pass when merge of that branch is fully completed") |
| Q-14 note | **Name = short number + words**: e.g. `142-project-skills`, used on the card, branch and merge. "Session" is ambiguous (a YouCoded chat vs a work branch); say **chat/conversation** for the first and **card** for the work |
| Q-15 note | Several chats may work on one card ("multiple sessions should be able to collaborate on the same card"). So the "claim" is the card's open branch, not an exclusive lock: a new chat about the same work joins the card instead of starting a duplicate |
| Q-17 note | No fixed areas: **free tags, combinable**, filterable and sortable ("android only is a useful distinction, but so is themes/speed. and these aren't always mutually exclusive") |
| Q-19 | Every card carries its **finish line** (1–3 sentences, plus how it is checked) before work starts |
| Q-20 | Every card carries a **short progress note** (done / next / blocked), updated at wrap-up |
| Q-18 | Anything untouched 30 days with no open card is listed for Keep / Archive; nothing deleted without his click |
| Q-22 | The page's facts rebuild at chat start and on merge (overnight later) |
| Q-3 | Each unfinished card shows why it is not done; Destin: "need to figure out how/when this would be updated" |
| S-1 | Copy ideas from Beads / Spec Kit / Claude agent teams; adopt none of the tools |
| Q-13 | **Not yet agreed** — Destin was confused by "one card = one session = one branch = one merge". Show the worked example |

## Destin never thinks in cards (decided 2026-10-14)

"i dont necessarily want to have to think in terms of cards. i just want to be able to dump ideas as i have
done previously, and you figure out how to group/organize/rearrange things as cards and such and make
suggestions." Cards are the assistant's bookkeeping. The interface is **idea intake**:

1. Destin talks as he does now: an idea, what it probably needs, what it might unlock later.
2. The chat recognises an idea dump and checks it against existing cards, the roadmap and the Big
   picture items (by meaning, not wording).
3. It replies with ONE short filing proposal: what becomes which card(s) and stage; what already
   exists and gets linked instead of duplicated; "needs" / "needed by" links; the order; overlaps it
   noticed. Later ideas the dump mentions become Big picture items that need the main one.
4. Destin says yes / changes it / says nothing. Silence keeps it as a suggestion, never filed.
5. Once filed it appears in Big picture at once, and in Today when a chat starts building it.
   Anything can be regrouped later.

Worked example he accepted: "agents that run overnight on whatever device is on; needs saved agent setups
and a scheduler; later a self-updating research page" → 3 linked items (one already being built, so
linked), the research page saved as an idea needing them, and a note that "work runs on whichever
device is on" already exists under Sync & Mesh.

Build order: idea intake first (the habit every chat follows), then the cards underneath, then the page
reading the cards, then moving the roadmap over.

## What the management page needs from every card (decided 2026-10-14)

Destin approved the Today tab built from these facts (branch `session/management-surface-20261012`,
`docs/active/design/2026-10-12-management-surface/today_tab.py`; decks `today-review.questions`,
`today-rebuild*.review` with their answers). A card must record or let the page derive:

| Fact | Values | Notes |
|---|---|---|
| **Stage** | Planning · Agentic buildout · Human polish & review · Merged | Destin's four words. No "ready to merge" stage: "something ready to merge should just be merged when ready". Merged is set automatically when the branch merges |
| **Problem markers** | Checks failing · Not backed up · Paused (with reason) · Working (a chat running now) | Separate from the stage; any stage can carry them. "Not backed up" = its copy has changes not committed or not pushed. "Working" only from a live signal, never guessed |
| **Chats** | every conversation that worked on it, with date, and a one-line result when one was written | Several chats per card, in turn or at once. Shown as a list under "View chats", with "Start another chat on this card" |
| **Next step** | derived: Unpause · Go to chat · Fix failing checks · Merge to master · Open review deck · Resume latest chat | The page's filled button; its hover says why |
| **Pause / Close** | Pause = mark paused with a reason, nothing else changes. Close = back up unsaved changes, close its pull request, remove its copy, mark closed; branch stays on GitHub | The only two stopping actions |

Copy rule from the same answers: plain words, but keep real terms when clearest ("Merge to master").

## Worked example to confirm with him first

Destin says "add project skills". A file `cards/142-project-skills.md` appears with the finish line
("each project can turn skills on and off; checks pass"), tags, and a progress note. Any chat
working on it uses branch `142-project-skills` (several chats may). A chat about to start the same
thing finds 142 already exists and joins it. When the branch merges, the card is marked done
automatically. The management page reads all cards.

## Open, for the building session

- Where cards live (`cards/` at the workspace root?) and their exact fields; reuse
  `scripts/roadmap-check.mjs`'s parser and `--vocab` lists rather than parsing markdown anew.
- Who hands out numbers: `workspace-start.mjs` already takes a lock while starting.
- Cross-repo: a card's branch may exist in both `youcoded` and `youcoded-dev` (paired PRs today).
- Migrating 143 bundled roadmap entries (one entry can hold several jobs) and the 150-entry cap.
- How existing session keys / worktrees map onto cards; `prune-worktrees.mjs` and
  `context-inject.sh` already compute merged/dirty/ahead per worktree.
- What sets "why not done" (conflict with master, failing checks, waiting on review, no finish line).
