---
status: shipped
milestone: M4
program: docs/archive/plans/2026-07-22-native-runtime-parity-program.md
plan: docs/archive/plans/2026-08-11-native-image-delivery-plan.md
research_date: 2026-08-11
shipped: 2026-08-11
shipped_in: youcoded#293 (merge f65fed18)
---

# Images in native sessions — decision and design

**One-line status: SHIPPED** in youcoded#293 (merged `f65fed18`, 2026-08-11). You handing the model a picture already worked (PR #290, `9a2d8af7`); the model now fetches one by path too — the Read tool delivers it, stored canonically in the tool result, split into a follow-up message only for providers that can't carry it. The three #290 follow-up fixes shipped with it. Implementation plan: `docs/archive/plans/2026-08-11-native-image-delivery-plan.md`.

**Two things changed between design and delivery, both discovered by review or live testing:**

1. **Vision detection had to be fixed for the feature to be reachable at all.** This spec assumed `supportsVision` was already accurate. It was not: OpenRouter is deliberately excluded from the vision-provider allowlist (it is a transport), so it fell back to a 7-entry hand-maintained registry and nearly every OpenRouter model resolved to `false`. A live smoke test showed Read refusing on a vision-capable model. The catalog already cached OpenRouter's `architecture.input_modalities` and the parser skipped it — now it doesn't. Not in the original scope; the feature was unreachable on the main cloud path without it.
2. **The UI work in the plan's Task 9 was never needed.** The Read tool card already thumbnails document-category files (images included) and opens them in the artifact viewer, and the path is runtime-agnostic. See the archived plan's Task 9 for the traced evidence.

## The decision

1. **Build the model-initiated case** — "the image is at `error-screenshot.png`, go look" — as the *only* path-based mechanism. No path detection in the user's text: if you type a path, the model reads it in context and decides whether to go look, which is better judgment than any regex ("delete old-logo.png" contains an image path and is not a request to see it). If you want the picture seen for certain, attach or paste it — that already works after #290.
2. **Architecture: the image lives inside the tool result; the wire format adapts per provider.** Not the earlier draft's "inject a message into history" — see below for why.
3. **Three #290 follow-up fixes land first on the same branch** (token sizing, resume, extension mismatch — real bugs on master today, amplified tomorrow; #290 merged before they could land in it).

This supersedes the four-option draft of the same date. Options 1 (path detection) and 4 (describe the image in words) are dropped; the shipped design is a merge of options 2 and 3 — native where the provider allows, split where it doesn't.

## Why this shape — what the research showed

We surveyed how Cline, Roo Code, Goose, Aider, OpenAI Codex CLI, Gemini CLI, and Continue handle exactly this (2026-08-11; citations at the bottom).

- **The split pattern is the industry standard, not a hack.** Cline (on its third deliberate implementation of it), Goose, and Roo all ship the same wire shape for OpenAI-compatible providers: tool result says "image in the next message," a synthetic user message carries the picture. Cline's source documents the failure it prevents: stringified base64 in a tool result makes the model *hallucinate what the image shows*.
- **But the mature ones don't inject into history.** Cline and Goose store the image canonically *inside the tool result* and do the split **at request-build time, per provider**. Goose even marks synthetic messages so history round-trips cleanly. This placement is what we're adopting.
- **The "native slot is dead on three of four paths" claim has a shelf life.** It's true of our installed `@ai-sdk/openai-compatible` (JSON.stringify, `dist/index.js:308`) — but OpenAI's Responses API, OpenRouter's Responses beta, and Gemini 3 all now accept images in tool outputs natively. The only hard text-only path is llama.cpp (no images in tool-role messages at all — llama.cpp #20319). Build-time splitting means each provider that gains native support later deletes a split case; a history mechanism would have to be unwound.
- **Nobody describes images in words as a fallback.** Zero of seven harnesses. Degradation is always an honest refusal, a skip notice, or a placeholder. Option 4 is deleted, not deferred.
- **Caps are table stakes, unlimited is the outlier.** Cline: 5 MiB/image, 8 MiB/request. Roo: 5 MB/file, 20 MB/task, human-readable skip notices. Codex is the only one that downscales (2048 px max dimension). Claude Code's no-limit is a single-provider luxury.

## What already exists (PR #290 — merged to master, `9a2d8af7`)

Attach/paste an image → it travels in the user message on every provider; text-only models get an honest refusal; the file path stays in the message text (bubble matching depends on it); attachments survive the send queue; a vanished/oversized file is skipped, never fatal. Vision capability lives in `capability-profile.ts` (`supportsVision`, conservative default `false`; transports default `false`, known-model registry can say `true`).

## Fixes required as #290 follow-ups

These are live bugs on master today. Model-initiated fetching multiplies all three, but they bite user attachments already:

1. **Token sizing counts image bytes ~4–5× each.** Every sizing path (`fitToContext`, `salvageOversizedTail`, `estimateContextTokens`, compaction's `estimateTokens`/`protectedFrom`) uses `JSON.stringify(content).length / 4`, and stringifying a Buffer yields `{"type":"Buffer","data":[137,80,...]}`. A 1 MB PNG estimates as ~1.1M "tokens", so **the turn that attaches an image silently drops the entire prior conversation from the context window** and wrecks the context-% chip. Fix: size image parts by byte length (or a fixed per-image estimate, as Codex does), never by JSON length.
2. **Images vanish on resume — even user-attached ones.** The `user-message` transcript event carries only text; rebuild coerces to a plain string. Fix: persist `attachments: string[]` on the event and re-read the files at rebuild (skip-if-gone, same semantics as send time). This is also the prerequisite for fetched images surviving resume.
3. **Extension mismatch.** Read's image list has `.bmp`/`.svg`/`.avif`; the attachment pipeline's `IMAGE_MEDIA_TYPES` doesn't. Today that's a wrong hint; once the tool *promises* an image, it's a silent dead end. Fix: one shared extension→media-type table.

## The design: image in the tool result, split at the wire

### Tool layer

Read, called on an image path by a vision-capable model, returns a tool result whose canonical content is `[text, image]` — via the AI SDK's `toModelOutput` content parts, which our installed `ai@7.0.36` supports. Rules:

- **Resolve before promising.** Read the file, check caps — *then* write the result text. The text and the pixels are decided by the same code path; there is no "image coming" followed by nothing. **Known gap (not built):** the plan's original rationale for skipping decode validation — "Electron `nativeImage` can't decode gif/webp reliably" — conflates *decoding* with *sniffing*: PNG/JPEG/GIF/WEBP all have stable 4–12 byte magic-number signatures, and `readImageFromDisk` in `image-support.ts` already has the buffer in hand, so a ~6-line signature table was skippable, not ruled out. Consequence today: a text file renamed `.png` passes the extension+size gate, gets base64'd to the provider, and comes back as a non-transient 400 — a dead turn instead of a named skip.
- **Text part points forward** on split providers: "image follows in the next message" — classic Cline found the explicit cross-reference measurably outperforms alternatives.
- **Vision gate at the tool**: a text-only model gets today's honest refusal (`supportsVision` exposed on `ToolContext`). The refusal must name the real reason, per error-message standards.
- **The tool description advertises image reading — dynamically.** Vision model: "can read images." Text-only: today's "text only" wording. Roo shipped without this and models simply never tried to read images (their issue #10440). Since this is now the *only* path-based mechanism, the description is core work, not polish.

### Provider layer (request-build time)

| Path | Wire shape |
|---|---|
| Direct Anthropic | Image blocks **natively inside `tool_result`** — `@ai-sdk/anthropic@4.0.18` already maps content parts; no split (Cline explicitly forbids splitting here as strictly worse) |
| OpenRouter / llama.cpp / custom (openai-compatible) | Placeholder text in the tool message + **synthetic follow-up user message** carrying the image |
| Any provider, model can't see (e.g. swapped mid-session) | Image parts replaced with a named placeholder text — never sent |

The split is a transform over the built prompt (AI SDK middleware / a pass in our request build), mirroring Cline's `split-tool-images.ts`. Requirements:

- **Synthetic messages are marked** (recognizable shape, à la Goose's `is_image_only_user_message`) so history round-trips don't duplicate them and they never render as a bubble.
- **Vision is re-checked at build time, every request** — this closes the mid-session model-swap leak (image pushed under a vision model, request built for a blind one). Canonical history keeps the real image, so swapping back to a vision model restores it (Cline's behavior).
- **Prompt-caching check**: fragmented user messages can hurt OpenRouter caching (classic Cline's noted trade-off). Verify cache hit behavior with the injected-message shape before calling this done.

### Budgets

Starting numbers, tunable: per-image cap stays at the existing 10 MB (`MAX_ATTACHMENT_BYTES`); new **per-turn budget of ~20 MB or 8 images**, whichever hits first; over-budget reads return a *named* skip ("image omitted: over the NN MB turn budget"), never silence. A per-session dedupe (path + mtime) stops the re-fetch loop: same unchanged file re-read → "already shown above" text, no second copy in context. Token cost is charged per fix #1 above, so budgets and context math agree.

### Resume, compaction, UI

- **Resume:** the tool result's persisted record carries the image *path*, not bytes (same as fix #2's attachment persistence). Rebuild re-reads from disk; a changed/vanished file becomes a named placeholder in the rebuilt result. The model never holds a reference to a picture that silently isn't there — the failure class that sank five of seven M4 items.
- **Compaction:** injected/synthetic messages and image-bearing tool results must not count as user turns in `summarizeCutIndex` — today every injected `role:'user'` message shifts the protected last-2-turns window, so a few images could push the actual user request out of protection. **Not built:** the summary naming what was dropped ("viewed error-screenshot.png"). `summarizePrompt()` in `compaction.ts` is a fixed instruction string with no mention of images — the summarized span is adapted with images replaced by named placeholders first (so the summarizer model *sees* the names and *could* name them), but nothing in the prompt tells it to. Stage-1 prune, separately, does name what it drops (`[image pruned — re-run … if you need to see it again]`) — only the stage-2 summarize path is silent.
- **UI:** the emit surface is frozen (no new event types). Recommended: surface the fetched image inside the **existing Read tool card** (e.g. a second result payload on the same `toolUseId`) rather than as a fake user bubble or nothing at all. This is the one genuinely open sub-decision — Destin should see the options in the workbench before it's locked.

### Ships together or not at all

Resolve-before-promise, build-time vision gate, budgets + dedupe, resume re-read, compaction accounting, and the dynamic tool description are one unit. A partial version leaves the model holding references to pictures that aren't there, which is the exact failure class this milestone exists to kill.

## Explicitly not building

- **Path detection in user text** (old option 1) — subsumed by the model's own judgment via Read; avoids a false-positive regex we'd own forever. Goose does auto-detect paths, so this stays *possible* later if real usage shows models failing to take the hint; nothing in this design blocks it.
- **Describe-the-image fallback** (old option 4) — no harness surveyed does it; refusal is more honest than lossy prose.
- **Native-slot-everywhere** (old option 3 alone) — still dead on llama.cpp and on Chat-Completions wires; OpenCode's open bug trail (#11304, #15728, #11306) stands as the warning.

## Watch items (→ `youcoded/docs/cc-dependencies.md`)

- **vercel/ai PR #12621** (unmerged 2026-08-11): implements exactly our split inside `@ai-sdk/openai-compatible`. If it merges, our split transform shrinks to config.
- **vercel/ai #10850** (open): the tracking issue for the above.
- OpenRouter Responses API beta + OpenAI Responses API: native image tool-outputs if we ever move wires off Chat Completions.

## Sequencing

1. The three follow-up fixes, as the first commits of the implementation branch (#290 merged before they could ride it).
2. Model-initiated fetch on the same branch — both are planned in `docs/active/plans/2026-08-11-native-image-delivery-plan.md`.

## Research provenance

Three-agent investigation, 2026-08-11: (a) harness survey — Cline `split-tool-images.ts` / `file-read.ts` / `media.ts`, Roo `openai-format.ts` / PR #9401 / issue #10440, Goose `formats/openai.rs`, Codex `view_image.rs` / image lib, Gemini CLI `generateContentResponseUtilities.ts` + issues #16135/#16741, Aider `base_coder.py`, Continue `readFile.ts`; (b) upstream state — vercel/ai #10850 + PR #12621, OpenAI Responses function-call outputs, OpenRouter Responses tool-calling docs, llama.cpp #20319/#12947, Anthropic tool_result image blocks, Gemini 3 multimodal functionResponse; (c) our harness — `harness-session.ts` (`injectPathTriggers` :443, tool-result push :1132, `imagePartsFor` :1004, `fitToContext` :633), `compaction.ts`, `history-rebuild.ts:44`, `capability-profile.ts:203`, branch `read.ts`. Line numbers as of eba51705 (master) / fba930e7 (#290 head).
