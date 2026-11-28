---
status: active
---
# Custom models of unknown size: what the choice is (card #176)

Written for Destin on 2026-11-10. Nothing has been changed in the app.

## The idea in one paragraph

Every AI model can only hold so much conversation at once. Call that its **size**. A size of "128k" means roughly 95,000 words (about a 300-page book); "250k" is roughly 190,000 words. Everything counts toward it: your messages, the replies, files you attach, and everything the assistant reads while working. When a chat gets close to the model's size, YouCoded writes a **summary** of the older part and carries on with that summary plus the recent messages. If the app does not summarise in time, the model refuses the next message with a "too long" error.

To summarise in time, the app has to know the model's size.

## How the app finds the size today

For a model you add yourself (Settings, add your own provider), the app tries two things, in order:

1. **A public directory of AI services.** If the address you typed belongs to a service the directory knows, the app reads each model's size from there. Most well-known services are in it.
2. **Asking the provider.** Otherwise the app asks your provider for its list of models. Some providers include each model's size in that list. Many do not: the most common list format has no place for it.

If neither gives a size, the size is **unknown**, and the app has to assume one:

- A model running **on this computer**: assumes 32k (small, because home-run models usually are).
- A model **hosted somewhere else**: assumes **250k**. This is the number in question.

You cannot type a size yourself, and the app does not learn it from a failure.

So this choice only affects: a hosted provider that is not in the directory **and** does not report sizes. In practice that is a company's own gateway, a self-run relay that passes requests on to other services, or a small or new service.

## What happens today, with real models

With the 250k assumption, the app starts summarising when the chat reaches about 231k.

These sizes are what the makers publish, from my own knowledge as of mid-2026. They change often, and a relay can impose a smaller limit than the maker's, so treat them as typical, not exact.

| Model family (typical published size) | What happens in a long chat today |
|---|---|
| Small or older hosted models, about 32k (many open models as served by budget hosts) | Fails at about 32k. The app would not have summarised until 231k, so it never gets the chance. |
| DeepSeek, some Qwen and Mistral models, about 64k | Fails at about 64k, same reason. |
| GPT-4o family, Llama 3 family, Mistral Large, about 128k | Fails at about 128k, same reason. |
| Claude models, about 200k | Fails at about 200k. Closer, but still before the 231k summary point. |
| Newer GPT, Gemini and Grok models, 1 million or more | Works. Summarised at 231k, which is earlier than the model needs but harmless. |

"Fails" means: you send a message and get an error instead of a reply. What you see next depends on the provider:

- If it reports the error in the standard way, the error card offers **Summarise and continue**, and the chat recovers.
- If it words the error its own way, you get a plain error with no way forward in that chat. You would have to start a new chat or switch to a bigger model. (This second case is the other half of card #176 and is parked until we capture a real provider's wording.)

How long is "a long chat"? Plain talking takes a long time to reach 128k. Work with files gets there fast: a few large documents, or an assistant reading through a project, can pass 128k in one sitting.

## The options

### A. Keep 250k

- **Benefit:** nothing changes. Chats on very large models keep full detail as long as possible.
- **Risk:** every unknown model of 200k or smaller keeps failing on long chats, as in the table. That is most models.

### B. Lower the assumption to 128k (summaries would start near 111k)

- **Benefit:** long chats stop failing for the 128k and 200k families and anything bigger. That covers most hosted models people actually use.
- **Risk 1, earlier summaries on big models.** A model that is really 1 million would be summarised at 111k instead of 231k. A summary keeps the gist and the recent messages but drops exact wording of older parts, so in a very long chat the assistant may need to re-read a file it saw earlier, and you wait a few seconds for each summary. Nothing is lost from the saved chat itself; you can still scroll back and read everything.
- **Risk 2, it changes without you doing anything.** Custom models you already added would start summarising sooner from their next chat.
- **Risk 3, still not small enough for some.** 64k and 32k models would still fail.

### C. Lower it further, to 64k or 32k

- **Benefit:** almost nothing fails.
- **Risk:** every unknown model, including million-size ones, gets summarised after a fairly short working session (around 47k for a 64k assumption). Heavy file work would trigger summaries constantly. This trades a rare hard failure for a frequent mild annoyance.

### D. Let you type the size when adding a model

- **Benefit:** exact for any model, large or small. No guessing.
- **Risk:** you have to know the number, and a wrong number causes the same failures. It is a new field on the add-provider screen, so it needs a small design round. Best paired with a sensible default (B) for people who leave it blank.

### E. Learn from the first failure

When a model refuses a message as too long, the app could remember "this model is smaller than I assumed", lower its assumption for that model, and summarise.

- **Benefit:** fixes itself with no setting. Works for any size.
- **Risk:** the first long chat on each model still hits one failure before the app learns. It only works when the app can recognise the "too long" error, which is exactly the parked second half of this card. Some providers state the real size in the error text, which the app could read, but each words it differently.

### F. Ask the provider more thoroughly

The app already asks (see above). It could also try the other places some services publish sizes, such as a per-model details page.

- **Benefit:** more models get their true size with no guessing.
- **Risk:** each service does this differently, so it helps provider by provider, not across the board. The assumption is still needed for whoever is left.

## How they fit together

B is a one-number change and removes most failures now. D, E and F are the real cures and can be added later without undoing B; each makes the assumption matter less. A and C are the two ends of the same dial as B.

My recommendation stays **B now, then D** (a size field with 128k as the blank default): a failed chat is a dead end, an early summary is a short wait.

## Where this lives in the code

- The two assumed sizes: `youcoded/desktop/src/main/harness/compaction.ts` (lines 11–12).
- Which one applies: `youcoded/desktop/src/main/harness/capability-profile.ts`.
- Directory lookup and asking the provider: `youcoded/desktop/src/main/providers/model-catalog.ts`.
- Recognising the "too long" error: `youcoded/desktop/src/main/providers/context-overflow.ts`.
