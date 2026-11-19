---
status: active
---
# How often a follow-up message re-reads the whole chat at full price (card #69)

Measured 2026-11-11 by the chat-engine batch, free, from the saved chats on Destin's
computer (numbers only; no message text was read out). Nothing in the app was changed.

## Why this matters
Cloud model providers charge about a tenth as much for the part of a chat they have already
seen. When that memory is lost (a "miss"), the next message re-reads the whole conversation
at full price and starts more slowly. Card #69 said this had been measured for ChatGPT only.

## What the saved chats show
| Provider | Follow-up messages measured | Misses with no visible reason | Rough extra cost |
|---|---|---|---|
| ChatGPT, before the September fixes | 941 | over half of all follow-ups missed | large |
| ChatGPT, since 25 Sep | 1,949 | 4% | about 2% of the input bill |
| Anthropic direct (20 Oct to 2 Nov) | 124 | 1% | negligible |
| OpenRouter, since 11 Sep | 132 (27 chats, mostly DeepSeek) | 18% of quick follow-ups | about 11% of the input bill |
| Local models | 26 | too few to judge | unknown |

- **The September fixes worked** for ChatGPT (app PRs #461, #464, #553, #554).
- **Reopening a chat is not what costs money; time away is.** ChatGPT misses 3% of the time
  after under 5 minutes, 6% after 5 to 60 minutes, 41% after more than an hour, restart or not.
- **OpenRouter forgets after about 5 minutes** (60% miss after a 5 to 60 minute pause) and
  still misses about 1 in 5 quick follow-ups for no visible reason. Small sample.
- **Switching models always re-reads the whole chat** (6 of 6 switches, every provider).
- **Summaries are cheap** on ChatGPT (2 of 21 missed, and the request after one is small).

## What it cannot show
- Why OpenRouter misses: the app does not save which underlying company served each request,
  so "sent to a different one" cannot be told apart from a model name being repointed.
- Local models with helpers: no saved local chat has ever used a helper.
- OpenRouter after a restart: no OpenRouter chats since restarts started being recorded.

## What a paid run would add
About 500 OpenRouter requests (3 models, 40 chats, 4 turns each, realistic length) recording
which company served each one would say how much of the 18% is routing. About 150 more would
pin down how long each model remembers. The local-helper question needs no money: one helper
run on a local model in a dev copy.

## Where this disagrees with card #69
1. "Resumed cloud chats miss cheaper cached pricing": on ChatGPT it is the idle time, not the
   resume.
2. "Local models re-read the whole conversation each helper turn": no data either way; the
   only earlier measurement (12 Aug, older engine) pointed the other way.
3. Not on the card: in ChatGPT helper chats, requests that changed earlier parts of the
   conversation missed 66% of the time (125 requests, about 2.5% of helper requests).
4. The ChatGPT routing fix the card calls "on a branch" shipped in app PR #553.

## Method, briefly
A turn counts as a miss when it re-billed at full price at least half of the previous turn's
context, after allowing for new content. A miss is "unexplained" when it follows no model
switch, summary, clear, app launch or idle gap longer than the provider's memory (5 minutes
OpenRouter and Anthropic, 30 ChatGPT, 15 local). Checks: the detector fired on 0 of 73 quick
Anthropic follow-ups, and ChatGPT's own per-request log (11,414 records) agrees at 1%.
Before/after dates are when the installed app received each fix. Full tables: `tables.md`;
scripts: `measure.py`, `extra.py` (they read `~/.youcoded/sessions` read-only).
