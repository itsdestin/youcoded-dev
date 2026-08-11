---
status: draft
milestone: M4
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md
plan: docs/active/plans/2026-08-10-m4-reliability-tranche.md
---

# Images in native sessions — what shipped, what's open

**One-line status:** you handing the model a picture now works everywhere (youcoded PR #290). The model going and fetching a picture by path does not, and whether to build that is undecided.

## Where this came from

**Not from Destin's dogfood.** The three bugs he reported on 2026-08-09/10 were the stuck tool cards on resume, the permission prompt naming the wrong tool, and the pasted filepath being deleted — all fixed and merged in youcoded PR #287.

This item came off M4's July list (`§5 item 6`), and the first description of it in this session was **wrong in a way that cost real time**. Recorded because the correction is the useful part:

- §5 called it two separate gaps — "InputBar builds text parts only" and "Read refuses images" — and the M4 plan's first draft repeated that.
- Destin pushed back twice: first that the two sounded like the same issue, then that the whole analysis was overcomplicated. Both were right.
- They are one issue, and the fix was in neither place the list named.

## What the problem actually was

When you attach or paste an image, the app saves it to a file and puts the **file path** into your message. It never sent the picture. The model had to go open that file itself.

That works with Claude, whose file-reader hands back images. In a native session — a local model, or anything through OpenRouter — the file-reader refused and told the model the file was "binary", which is a different fact and sends it hunting for a text workaround that does not exist.

**This was never a native-only choice.** The app has always sent a path rather than a picture, for Claude Code sessions too. Claude's reader papered over it, so nobody noticed the app had taken the hard route.

## What shipped — youcoded PR #290

Images now travel **in the user message**, which is what every other harness does for a pasted image and what works on every provider we ship.

| | Before | After |
|---|---|---|
| Attach an image, Claude session | path only, Claude reads the file | path + picture in the message |
| Attach an image, native session | path only, reader refuses it | path + picture in the message |
| Attach an image, text-only model | reader refuses, blames "binary" | honest refusal naming the real reason |

Supporting decisions in the same PR:

- **A model that cannot see images is never sent one.** Handing an image to a text-only model fails the whole turn rather than degrading, so it is gated.
- **The app assumes a model cannot see unless it knows otherwise.** Wrong in the safe direction: a wrong "no" means the model is told it cannot see; a wrong "yes" kills the message.
- **The file path stays in the message text** alongside the picture. That string is what matches your chat bubble to the real message; removing it would leave bubbles stuck pending forever.
- **Attachments survive the send queue** — a message typed while a turn is still running would otherwise lose its pictures.
- **A vanished or oversized file is skipped, never fatal** — temp files get cleaned up, and the path is still in the text.

Also in that PR, unrelated: the cache stats at the bottom of the screen, which read `--` in native sessions while the numbers sat one function away.

## What is still open

Everything above covers **the user handing over a picture**. It does not cover **the model fetching one by path** — "the image is at `/a/b.png`, go look."

That case still fails, and it is the one that matters when the model is working on its own: it runs a command, sees `error-screenshot.png`, and wants to look without being babysat.

### Why it is hard at all

A tool's answer goes back to the model in a slot that, on three of our four provider paths, can only hold text. Verified against our installed dependencies rather than from memory:

| Our path | Package | Image in a tool result |
|---|---|---|
| Direct Anthropic | `@ai-sdk/anthropic` | works — native image block |
| OpenRouter | `@ai-sdk/openai-compatible` | `JSON.stringify` (`dist/index.js:305-308`) |
| Local llama.cpp | `@ai-sdk/openai-compatible` | same |
| Custom endpoint | `@ai-sdk/openai-compatible` | same |

Three of four would hand the model a wall of base64 text and call it a picture.

## The options

### 1. Detect image paths in the user's text

You mention a path, the app attaches the picture before sending.

- **For:** tiny (~20 lines), works everywhere today, is the literal case Destin described, no new mechanism.
- **Against:** only covers paths *you* type. A model discovering a file on its own still gets nothing.

### 2. Tool says "coming up", harness delivers the picture as the next message — RECOMMENDED

The model asks for the image; the tool returns plain text; the picture arrives immediately behind it as an injected message.

- **For:** covers the model-initiated case, works on every provider (the picture never enters the slot that cannot carry it), **and the mechanism already exists and ships today.** `injectPathTriggers` (`harness-session.ts:457`) pushes a `role:'user'` message into history right after tool results, tagged `<project-rule source="...">`, emitting no transcript event so it never renders as a fake bubble from the user. An image would use the identical shape with a different payload.
- **The ordering question is already answered empirically.** The loop does `history.push({role:'tool', ...})` then `injectPathTriggers(...)` — a tool result immediately followed by an injected user message, on every provider, every time a path rule fires. If that sequence were rejected anywhere, native sessions with project rules would be broken today.
- **Against — all in the tail:**
  - **Reopening a session** would show a note saying "image attached" with no image behind it, unless the rebuild re-reads the file. Fixable (the Read call and its path *are* persisted), but real work — and if the file changed meanwhile the model sees a different picture than it did originally.
  - **Compaction** could drop the picture and leave the text referring to it — the same dangling reference in a different costume.
  - **Cost:** each image is ~1–1.5k tokens. A model that lists a folder and looks at nine screenshots spends a chunk of context on its own initiative.

### 3. Picture directly in the tool's answer

What Claude Code and OpenCode do.

- **For:** elegant, and correct on Anthropic.
- **Against:** dead on three of our four paths. OpenCode shipped it — documented experimental and Anthropic-only — and carries a run of open bugs from exactly this ([#11304](https://github.com/anomalyco/opencode/issues/11304), [#15728](https://github.com/anomalyco/opencode/issues/15728), [#11306](https://github.com/anomalyco/opencode/issues/11306)). The AI SDK tracks the gap as [#10850](https://github.com/vercel/ai/issues/10850). **Recommend skipping.**

### 4. Describe the picture in words

A vision model writes a description; the model gets that text.

- **For:** works literally everywhere, including text-only local models that can never see.
- **Against:** lossy, and costs an extra call per image. A last resort, not a main path.

## Why the other harnesses chose differently

**Claude Code** talks to exactly one API, where the native slot works properly. Option 2 would be more moving parts for zero gain. Correct choice for their situation.

**OpenCode** built the native slot, hit the OpenAI-compatible wall, and has treated it as an upstream limitation to wait out. Likely a layering call: in most harness designs a tool returns a result and that is the end of its authority, so a tool that also causes a *message* to appear violates that boundary. **We crossed that line deliberately in M3 and normalized it**, which is why this is cheap for us and expensive for them.

There is a fair argument that the correct fix is upstream in the AI SDK. But it can only ever be fixed for providers whose API can carry images in tool results, and OpenAI's fundamentally cannot — so the universal path keeps its value regardless of what upstream does.

## What remains to be decided

1. **Do the model-initiated case at all, or stop here?** What shipped covers the user handing over an image, which is probably the common case day to day.
2. **If yes: option 1 first, or straight to option 2?** Option 1 lands immediately and covers the phrasing Destin used. Option 2 is the real answer but drags in resume, compaction, and a cost cap — **and those three get handled in the same pass or it should not ship.** A half-built version leaves the model holding a reference to a picture that is not there, which is the exact failure class that made five of seven M4 items wrong.
3. **Does a cost ceiling matter?** Should a model pull in images on its own initiative without asking, and if so how many per turn. Claude Code has no limit; that is a choice, not a standard.

**Recommendation:** option 1 now (small, independent, immediately useful), option 2 as its own planned piece of work rather than bolted onto this milestone.
