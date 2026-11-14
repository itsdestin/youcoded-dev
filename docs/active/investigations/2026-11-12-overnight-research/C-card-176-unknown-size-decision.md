---
status: active
date: 2026-11-12
cards: [176]
---
# Card #176 decision write-up: custom models of unknown size

## Check of the existing explanation against current code
`docs/active/investigations/2026-11-10-unknown-model-size-explained.md` checked against master `56167222b` (2026-11-12). Verdict: accurate; nothing needs correcting.
- `UNKNOWN_CLOUD_WINDOW = 250_000`, `UNKNOWN_LOCAL_WINDOW = 32_768` at `desktop/src/main/harness/compaction.ts:11-12`. Chosen in `harness/capability-profile.ts:525-526`: 32k for the app's own local engine and for a custom endpoint on this computer; 250k otherwise.
- Summary starting point: from `planContextBudget` (`compaction.ts:48`): 250k minus 16k reply room, minus 2.5k margin, minus a small overhead gives about 231k; a 128k assumption gives about 110.7k. The explanation's 231k and 111k match.
- There is no size field when adding a model (`renderer/components/ProvidersSection.tsx` only shows a size chip when one is known). Nothing learns a size from a failure.
- The "too long" error recognised for custom endpoints is only the exact code `context_length_exceeded` (`providers/context-overflow.ts`, last changed `7a369486a`, 2026-10-21). Other wording gets the plain error card with no Summarise button. Still parked.
- One nuance to add: OpenRouter and ChatGPT sizes come from their own lists, with the user's context setting on top (`providers/cloud-context.ts`, default 500k). The assumption only affects custom hosted endpoints that publish no size.

## Deck-ready decision

**Today.** When you add your own AI service, and the app cannot find a model's size, it assumes a hosted model holds about 250,000 tokens (roughly 190,000 words). It starts summarising old messages near 231,000. Models run on your own computer assume 32,000.

**Problem.** Most hosted models hold less than 250,000: about 128,000 (GPT-4o, Llama 3, Mistral Large), about 200,000 (Claude), 64,000 (DeepSeek, some Qwen) or 32,000 (small or budget ones). In a long chat, such a model refuses your message before the app summarises. If the service reports it in the standard way you get a "Summarise and continue" button. If it words the error its own way, you get a plain error and a dead-end chat. File-heavy work reaches 128,000 in one sitting.

**Proposal.** Lower the guess for unknown hosted models from 250,000 to 128,000 now (one number). Summaries would start near 111,000. Later add a size box when adding a model.

**Options**

A. Keep 250,000.
- Pro: nothing changes; very large models keep full detail longest.
- Con: models of 200,000 or less keep failing in long chats, which is most models.

B. Lower to 128,000. (Recommended)
- Pro: long chats stop failing for 128,000 and 200,000 models and everything bigger.
- Con: million-size models get summarised at about 111,000 instead of 231,000, so in a very long chat the assistant may re-read a file and you wait a few seconds per summary. Chats you already have will start summarising sooner. 64,000 and 32,000 models still fail. The saved chat itself loses nothing.

C. Lower to 64,000 or 32,000.
- Pro: almost nothing fails.
- Con: every unknown model, including million-size ones, summarises after a short working session (about 47,000 at 64,000); heavy file work would summarise constantly.

D. A size box when adding a model (with 128,000 as the blank default).
- Pro: exact for any model, no guessing.
- Con: you must know the number, a wrong one fails the same way; needs a small design round for the add-model screen.

E. Learn from the first failure and remember it per model.
- Pro: fixes itself, any size.
- Con: the first long chat on each model still errors once; only works for errors the app recognises (the parked second half of this card).

F. Ask the service more thoroughly for its size.
- Pro: more models get their true size, no guess.
- Con: every service answers differently, so it helps one at a time.

**Recommendation.** B now, then D. A failed chat is a dead end; an early summary is a short wait. E and F can follow later and make the guess matter less. C trades a rare failure for a constant annoyance. B visibly changes when summaries appear for existing custom models, so it needs his yes before building.
