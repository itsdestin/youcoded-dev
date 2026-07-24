---
status: superseded
created: 2026-07-22
superseded: 2026-07-22 (same day)
superseded-by: docs/active/plans/2026-07-22-native-runtime-parity-program.md
design-ref: docs/archive/specs/2026-07-18-native-sync-parity-design.md
note: Folded into the parity program as Milestone M2, content unchanged (all five phases + the resolved resume-picker/lastUsedModel decision carry forward in program §3).
---

# Native Sync Parity Plan — tags, transcripts, browse, takeover for native sessions

## Goal

Native (YouCoded-runtime) conversations become first-class citizens of the Conversation Store and space sync: taggable/flaggable/notable, synced and readable on every device, resumable anywhere with an explicit model pick, and takeover-capable. End state (Destin, 2026-07-22): **full parity — users should not feel any obvious distinction between CC and native session behavior.**

## The resolved design decision (this was the blocker)

Model bindings are device-local: user-added provider ids are per-device ULIDs, `providers.json` lives in the never-synced `~/.youcoded`, API keys are deliberately machine-bound, and local GGUF files don't sync. So a synced transcript cannot carry a usable binding — device B has the conversation but not the connection it ran on.

**Destin's ruling (2026-07-22): resuming a native session ALWAYS offers the model selector — on any device, including the originating one.** This mirrors how CC resume already works (you pick any alias on resume regardless of what the conversation used). Track a new synced **`lastUsedModel`** field in the conversation metadata (a *portable* descriptor — model id + provider type/label, NOT the device-local provider ULID) and pre-fill the selector with it; **never auto-launch the stored binding without asking.** This dissolves the cross-device continuation problem entirely: resume is device-local model selection *by design*, so there is no "device B can't continue" case and no silent-rebind cost surprise.

## Design basis

- Spec: `docs/archive/specs/2026-07-18-native-sync-parity-design.md` (Option C — thread provider through the store). Its §2.5 open question is resolved by the ruling above.
- The 2026-07-19 correction stands (verified on master `b832e299`, 2026-07-22): the read side is provider-locked in three places none of the original Option C list covered — `session:get-meta` reads `store.get('claude', …)` (`ipc-handlers.ts:2606`), the Resume Browser overlay lists `store.list('claude')` only (`session-browser.ts:377`), and `session:browse` maps `nativeHost.list()` to `PastSession` rows with no `flags`/`tags`/`note` fields (`ipc-handlers.ts:1412`). A correctly-written native record would never be read or displayed without Phase 2.
- youcoded#177 (merge `fe8529ba`) already shipped the correctness slice: single-writer guard in `resume()`/`create()`, awaited `destroyNative` in takeover + session-exit backstop, native lease acquire reverted (with an explicit "re-enable together with parity, NOT before" comment at `ipc-handlers.ts:545-570`), phantom-record gate + `nativeMetaRefusal` covering all write sites including remote-server. The takeover data-corruption class is closed; this plan builds the capability the lease implies.

## Phases

### Phase 1 — Store provider-awareness (writes)

- Native records written with `provider: 'native'`; `localJsonlPath`/`transcriptRef` become provider-aware (native transcripts live at `~/.youcoded/sessions/<slug>/<id>.jsonl`, `native-home.ts:115`).
- Route the native host's `transcript-event` emitter into `noteTranscriptEvent` — today the store's only transcript feeder is `TranscriptWatcher` over the CC projects dir, hardcoded `provider: 'claude'` (`ipc-handlers.ts:1917-1927`).
- Carry `provider` on the moved payload; write `lastUsedModel` on create, on `setBinding`, and on turn completion.

### Phase 2 — Read-side unlock

- Fix the three provider locks (get-meta, Resume overlay list, session:browse row mapping — native rows gain `flags`/`tags`/`note`).
- Retire the 2026-07-19 stopgap in the same pass: `nativeMetaRefusal` + `NATIVE_META_UNSUPPORTED` (`shared/types.ts`), the `metaDisabled` branch in `ResumeBrowser`, the `metaSupported`/`metaLoaded` gate in `CloseSessionPrompt`, and `desktop/tests/session-meta-native-refusal.test.ts` (replaced by parity tests, not just deleted).
- Android still reports `supported: false` with its own wording because its tag/note handlers are stubs — separate gap, unchanged by this plan.

### Phase 3 — Resume picker + `lastUsedModel`

- ResumeBrowser native rows present the model selector (provider-scoped catalog — same data source as ModelPickerPopup's native branch), pre-filled from `lastUsedModel`, on every resume. Selection becomes the session's binding; a device with no matching provider simply shows its own catalog with nothing pre-selected.

### Phase 4 — Space sync + takeover

- Native branches in `flushSessionToSpace`/`mirrorIn`/`materializeOne` (native-aware source paths; `materializeOne` currently bails on missing `transcriptRef` — Phase 1 makes the record exist).
- Re-enable the native lease acquire (the reverted block at `ipc-handlers.ts:545-570`) — only now does the lease guard a genuinely shared resource. Holder teardown already awaits `destroyNative`; substitute `nativeHost.interrupt` for the ESC byte in the quiesce step so the holder's turn actually stops streaming before the flush.
- The requester's post-takeover resume lands in the Phase 3 picker — never auto-binds.

### Phase 5 — Store-availability fix (absorbed :105 — NOT native-specific)

`noteFlagChanged`/`noteSessionNote` (`conversations/service.ts:267-273`) are `store?.setFlag(...)` optional-chains: null store → the write evaporates while `SESSION_SET_FLAG` still broadcasts META_CHANGED and returns `{ok:true}`. Affects CC sessions (e.g. tagging right after launch).

- First: bound the reachability — is the null window boot-only, or reachable in steady state (store stopped/restarted, failed start)?
- Then: buffer meta writes until `startConversationStore()` completes and flush in order; if the store never comes up, return an honest `ok:false` the renderer reverts on (revert pattern already exists from the native stopgap). Do this in the same pass as Phase 1's write changes — it's the same code.

## Tests

- Provider-aware store round-trip: native record write/read with flags/tags/note; no `provider:'claude'` seeding from native ids (keep the #177 pins green until Phase 2 replaces the refusal test).
- Native transcript events land in the store; `transcriptRef` resolves; `materializeOne` materializes a native record.
- Browse/meta parity: session:browse native rows carry meta; get-meta reads native records.
- `lastUsedModel`: written on create/rebind/turn; portable shape (no device ULIDs); picker pre-fill.
- Takeover contract: `holder-takeover.test.ts` gains real native flows (interrupt actually called, flush reads the native path) — the suite must not re-certify a no-op, the #177 lesson.
- Buffered meta writes: pre-store writes flush in order; never-started store → `ok:false` + renderer revert.

## Sequencing and dependencies

- Independent of the control plan (`2026-07-22-native-session-control-plan.md`); either can ship first.
- Phases 1→2→3 deliver desktop value alone (tags/notes/browse/resume-picker) even before sync; Phase 4 requires 1–3. Phase 5 can ship any time, earliest is best.
- Desktop-only for v1.3.1, sharing the milestone with Android sync (own ROADMAP item).

## Out of scope

Android tag/note handlers (stubs — separate gap); native `/clear`/`/compact`/skills/MCP (Phase 3 — the "Native session context management" ROADMAP entry); send queueing/stop affordance (control plan).
