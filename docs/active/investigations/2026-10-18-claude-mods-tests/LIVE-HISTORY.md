# Item 4 — direct live events without replacing conversation storage

status: draft

## Answer to Destin's question

Replacing how the screen receives live updates does not require replacing Claude's transcript or resume mechanism. The narrow candidate is **read-only observation**: leave Claude's recording untouched, keep existing history readers and resume paths, and compare mod events against the file-derived feed. Do not make two feeds authoritative simultaneously.

**Benefit:** avoid relying on file-watcher timing and private records for live activity. **Cost:** introduce a second representation that must reconcile with saved history, and a new failure mode when the mod disappears. The storage-format dependency remains for history and resume, so this is a partial simplification, not its elimination.

This item remains held for design review. No app event source has been replaced. Cross-engine portability belongs to separate exploration #164, not this experiment.

## Couplings that an apparently display-only change would reach

Source paths below are relative to the isolated `youcoded/` checkout; inspected 2026-10-18.

| Coupling | Evidence | Consequence to verify |
|---|---|---|
| Conversation metadata and sync | `desktop/src/main/conversations/service.ts:408–454` updates activity on events and mirrors the file on `turn-complete` | A completion event received before disk flush could trigger an early snapshot. This is a migration risk, not a reproduced current bug. Need an explicit persisted boundary or retained disk-driven mirroring. |
| Naming, recovery list and last model | `desktop/src/main/ipc-handlers.ts:1533–1574` feeds the store, Welcome back tracking, namer and model metadata | Moving only the renderer feed would omit these consumers; feeding both paths could duplicate naming/activity work. |
| Initial history and scroll-back | `desktop/src/main/transcript-page-source.ts:15–39,64–115` remembers a file across startup/exit and captures the pre-resume byte boundary | A bridge handshake does not replace history availability before it loads or after Claude exits. Keep the authoritative file locator. |
| Clear/resume identity | `desktop/src/main/session-id-mapping.ts:25–40` remaps conversation IDs only from suitable classic SessionStart events | Mod `session.start` has different semantics; using it as a drop-in replacement can leave an old mapping after clear/resume. |
| Avoiding duplicate live sessions | `desktop/src/main/session-id-mapping.ts:43–64` finds an existing live writer before resume | Preserve the one-live-writer lookup. A new bridge ID is not a new conversation ID. |
| Background helpers | `desktop/src/shared/transcript-event-types.ts:101–108` ties subagent events to parent tool calls | Stream coverage must include child identity, late results and interrupted work, not just the main reply. |
| Durable device transfer | `desktop/src/main/conversations/transcript-mirror.ts` and `handoff-transcript.ts` | A displayed final answer is not proof that the engine's resumable file is complete and transferable. Keep existing stopped-writer/fingerprint protections. |

## Required comparisons before adoption

1. **Live → reopen:** each visible message/tool result corresponds to saved history with stable identity; repeated identical prompts remain distinct.
2. **Reconnect:** disconnect mid-reply, reconnect, merge saved history with any unpersisted tail without missing or duplicated text.
3. **Mod absent/unloaded:** history stays readable; missed events are recovered; no silent automatic resend.
4. **Clear and in-session resume:** old and new conversation IDs stay distinct; files, names, tags and activity target the right conversation.
5. **Compaction:** saved resume context, visible earlier history and the compaction marker agree; no falsely completed active tools.
6. **Background work:** a helper completing after the parent turn is still attributed to its original launch.
7. **End and handoff:** end-of-turn notification must not cause a stale durable copy to be treated as a complete resume checkpoint.
8. **Remote clients:** main window, buddy and phone receive the same normalized events through existing session records, not separate interpretations.

## What the generated 2.1.302 contract clarifies

`evidence/generated-claude-code.d.ts:10986–11111` now gives stronger evidence than the initial web survey: `session.append` carries a pinned `uuid` documented as the same ID in the transcript, plus `agentId`, the row kind and origin. Its `next(e)` result returns the stored row and UUID. These are promising reconciliation keys, though not an external replay cursor or explicit filesystem-flush acknowledgment.

The same contract explicitly omits structured tool-result records, timestamps, parent links and attachment payloads from the event input. Those omissions matter for rich tool cards and saved history; a full-fidelity replacement may need additional event families or retained file reads.

A replay of the actual synthetic mod transcript through the unchanged app parser (`parser-check/check.mjs`, exit 0) found two command differences: the `/model` row produced no command event because it lacked `promptId`; `/compact` first produced ordinary user text rather than a slash-command event. Direct repeated/Unicode prompts and the compact summary were recognized. This is concrete evidence that direct control calls can work while the current history interpretation is not drop-in compatible.

## Most conservative experiment

Collect mod events into a separate evidence log while the existing watcher remains the sole authority. Compare identities, ordering and persistence timing. Do not rewrite `session.append` content, synthesize engine transcript rows, replace history readers, or change cross-engine identity. If the comparison succeeds, return with a focused choice about replacing only the live feed.

Official contract references: https://code.claude.com/docs/en/plugins/mods/reference#session (append before storage, lifecycle differences); https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn ; https://code.claude.com/docs/en/plugins/mods/troubleshoot (worker failure/unloading). Current-build runtime evidence is required before deciding equivalence.
