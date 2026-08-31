---
status: active
date: 2026-08-31
tags: [codex, handoff, spec-review]
spec: docs/active/specs/2026-08-31-codex-session-provider-design.md
---

# Codex session-provider spec — review round (2026-08-31)

Verification pass over the draft, then a rewrite into an implementation-ready document.
This file holds what was cut and why, so it is not re-added.

## Verified true against `youcoded@master`

`SessionProvider` at `types.ts:35`; `TranscriptEventType` at `:98`; `ManagedSession.worker`
optional at `session-manager.ts:45`, native branch at `:82`; `prerequisite-installer.ts` =
1,141 lines; `Bootstrap.kt:27` pins `"2.1.112"`; `cc-dependencies.md` has exactly 39 `###`
touchpoint sections; `platform-vision-roadmap.md:320` is the Gemini removal;
`harness-session.ts:874` emits `transcript-event`; the `describe-rule.ts:22` and
`permission-broker.ts:31` quotes are verbatim; 23 files branch on provider with 16 in
`App.tsx`; `isNativeSessionId` has 10 call sites; `session-store.ts` header/events/partId
description is accurate; `chatsearch-index/refs-service.ts` and `outbox-drain.ts` branch on
provider.

## Corrections applied

| Draft said | Actual |
|---|---|
| Three tool-name tables, all in `describe-rule.ts` | **Four.** `friendlyToolDisplay` (`ToolCard.tsx:83`, `switch (toolName)`, `default: { label: toolName, detail: '' }`) draws the **live approval card in chat** — the one the user actually reads. The three named tables are the Settings screen only. |
| "Reuse `SessionStore` unchanged… the header fits as-is", then "the header must record that [thread] id" | Self-contradiction. `NativeSessionHeader` is `v: 1` with no such field. Now spec'd as an additive optional field or a v2 bump. |
| `binding: { providerId: 'codex', modelId }` fits as-is | `ModelBinding.providerId` is a **device-local ULID** resolving only via `~/.youcoded/providers.json` (`types.ts:38-40`). `'codex'` is a sentinel; `model-chip.ts`, `ModelPickerPopup.tsx`, resume pre-fill and the catalog each need a branch. Now an explicit Phase 2 decision (§4.3 item 2) with §4.4 as its other half. |
| 53 branch sites / 63 total | 54 / 64. |
| Both permission-mode vocabularies in `shared/types.ts` | `NativePermissionMode` is `shared/permission-types.ts:7`; `types.ts:489` and `:654` carry inline literal copies (a third duplication). |
| Interrupt listed as "free" in §2 | Contradicted §6 Phase 4. Native calls `nativeHost.interrupt` (`ipc-handlers.ts:2771`); CC sends an ESC byte (`:2214`). Codex needs a third arm. Moved to a "not free" row. |
| "No change to the shapes" for permission-broker | True of shapes, but answers route by a `'native-'` id prefix (`ipc-handlers.ts:2563`). Now flagged as a pick-one. |

## Added

- **Phase 0 Q5 — does `~/.codex/config.toml` override our `approvalPolicy`?** The largest
  hole in the draft: all of §4.2's safety reasoning (why full-auto must not map to
  `approvalPolicy: never`) is void if a user's own `approval_policy = "never"` wins.
- **Phase 0 Q6 — working directory.** Codex is folder-scoped; the draft never said what
  `cwd` a thread gets. Separate from `sandboxMode` (still a Phase 4 output).
- **Phase 0 Q3 extended** to cover concurrency: two Codex tabs mid-turn, do they queue?
- **§4.5 "what the compiler will NOT catch"** — the three default-to-Claude ternaries that
  stay type-correct while being wrong: `conversations/service.ts:368` (a Codex transcript
  filed under `ccProjectSlug`), `ipc-handlers.ts:3283`, `remote-server.ts:179`. The draft
  stated this risk abstractly; naming the sites makes it a checklist.
- **§4.4 model selection** — Codex has models; `ModelPickerPopup.tsx`/`model-chip.ts`
  branch on provider; the draft never mentioned it.
- **Kill switch** — `YOUCODED_CODEX=0`, mirroring `preload.ts:1213`'s `YOUCODED_NATIVE`.
- **Phase sizing table.** The draft superseded the ROADMAP's cost estimate and replaced it
  with nothing.
- **Favourable fact the draft omitted:** `ConversationRecord.provider` is already typed
  `SessionProvider | string`, commented "string-open for future providers".

## Removed

- **§0's 450 words of argument** that Codex is not a reversal of the 2026-07-10 Gemini
  decision. The three-row billing table carries the whole point; the prose was arguing with
  an imagined objector. Table + the one-sentence rule survive as §1.
- **§5.2 as a decision.** It decided the process model, then said Phase 0 might flip it —
  which is Phase 0 Q3. Now stated as a default with an explicit "do not build supervision
  until Q3 is answered".
- **§3.2's block quote arguing against an earlier draft of the same spec.** Compressed to
  one callout stating the must-not, no history.
- **The §2 / §6 duplication** — "explicitly does not work" and "screens to design in
  Phase 1" were the same content twice. Merged into one table in §1 with a "UI state to
  design" column.

## Not done

Nothing verified about the Codex protocol itself — every method name in §5.1 still comes
from OpenAI's prose docs, which is why Phase 0 Q2 exists. T3 Code's source was read by the
draft's author, not re-verified here.

Original draft preserved at
`/tmp/claude-1000/-home-destin-youcoded-dev/f022a177-265e-491b-aa48-4b25ff0d05a0/scratchpad/codex-spec-v1-backup.md`
(session scratchpad — not durable).
