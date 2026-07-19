---
status: draft
date: 2026-07-18
tags: [native-runtime, sync, leases, takeover, parity]
repos: [youcoded]
supersedes_recommendation_in: docs/active/investigations/2026-07-18-native-session-takeover-gap.md
---

# Native sessions and cross-device sync

**Goal, in Destin's words (2026-07-18):** *"Native sessions [must] work identically to Claude
Code sessions as far as cross-device sync goes. Tags, transcripts, takeovers, etc. for native
sessions should work identically to Claude sessions."*

**Scope ruling (revised 2026-07-18, after design review).** This spec originally promoted full
parity (Option C) into a **v1.3 release gate**. The design review in §11 found that the parity
plan, as written, would ship a takeover the native runtime cannot honor — see §2.5, the model
binding is device-local by deliberate security design. Destin re-scoped on 2026-07-18:

- **v1.3 ships §3 only** — three correctness fixes. No parity work.
- **v1.3.1 ships §§4–6** — the parity work, gated on the §2.5 design decision being made first.

That ordering is not a timeline concession; it is the sequencing the evidence supports. Do not
re-litigate it without reading §2.5 and §11.

Everything below builds on the verified findings in
`docs/active/investigations/2026-07-18-native-session-takeover-gap.md`. Read that first; this
spec does not repeat its evidence, but §11 does correct two of its claims.

---

## 1. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **v1.3 = correctness only (§3). Parity (§§4–6) = v1.3.1.** | §2.5 — the parity plan cannot deliver a working cross-device resume until the binding question is answered. Shipping it as a gate would replace a loud bug with a quiet one. |
| D2 | **Full parity, when it happens, means records *and* transcripts** — not the cheaper record-only variant (investigation §6, decision point 3). | Destin's requirement names transcripts explicitly, and §11.3 verified transcript mirroring is safe. Record-only leaves the Resume Browser advertising rows you cannot open. |
| D3 | **`provider` becomes a required parameter**, not one defaulting to `'claude'` (decision point 4). | The compiler then enumerates every call site. A default silently misses sites, and silent misses are exactly how #176 happened. See §4.0 on naming it something other than `provider`. |
| D4 | **Desktop only.** Android sync remains v1.3.1. | `docs/active/handoffs/2026-07-10-sync-completion-handoff.md:111` — "release scope is settled: v1.3 ships desktop-only sync… do not re-litigate." Parity means *native behaves like Claude on desktop*. (Note: the parity work now also lands in v1.3.1, alongside Android sync.) |
| D5 | **The two transcript lanes stay disjoint.** A native record must never materialize into a CC path, or vice versa. | The formats are not interchangeable (investigation §2): native is `header + TranscriptEvent[]`, CC is raw API-shaped records. §11.4 adds a second reason: the separate `native/` directory is *what makes older app versions safe*. |
| D6 | **Option B (native-aware teardown) is folded into §6**, not shipped separately. | Investigation §5: shipping B alone "converts a loud bug into a quiet one" — tidy destruction of a session that still loses its work. |
| D7 | **The v1.3 work includes gating the native lease acquire** (investigation Option A). | With parity deferred, the app must stop advertising a takeover it cannot perform. This is the honest state per investigation §4. |

---

## 2. Scope

### 2.1 v1.3 — in scope

Three correctness fixes, detailed in §3. All are defects on their own terms, independent of
parity, and all are reviewable under release pressure.

### 2.2 v1.3.1 — in scope

A native session, on desktop, with sync enabled, behaves indistinguishably from a Claude Code
session for:

- appearing in the Resume Browser on every signed-in device
- carrying its title, flags, notes, and **tags** cross-device
- having its transcript mirrored into the space and materialized on other devices
- lease acquisition, holder teardown, and the MovedGate flow

**Resume and takeover on a second device are conditional on §2.5** and are not promised until
that decision is made.

### 2.3 Out of scope (explicit non-goals)

- Android native sync (D4).
- Converting between the two transcript formats, in either direction (D5).
- Backfilling native sessions that predate this change. New and future sessions enroll; a
  migration, if ever wanted, is separate work. **This does not cover cleaning up the
  mislabeled records already on disk — that is in scope, see §3.2.**
- Native stuck-detection (`ROADMAP.md` item). It overlaps this work's surface but is a distinct
  feature. Revisit after this lands.

### 2.5 The blocker for v1.3.1 — a native session's execution context does not travel

**This is the finding that re-scoped the release.** Read it before planning §§4–6.

A CC session resumes anywhere because the thing that runs it — the `claude` binary against
Anthropic's API — is present on every device. A native session's runtime is not.

`resume()` rebuilds the session from the stored header's `binding`
(`native-session-host.ts:310, 315`), which is `ModelBinding { providerId, modelId }`
(`provider-types.ts:20`). Every part of what that names is device-local **on purpose**:

| What | Where | Syncs? |
|---|---|---|
| `providerId` for a user-added provider | a per-device ULID — `const id = input.id ?? ulid()` (`provider-registry.ts:91`) | no — minted independently on each device |
| Provider config | `~/.youcoded/providers.json` (`provider-registry.ts:19`) | no — `~/.youcoded/` is in `DEFAULT_IGNORES` (`sync-spaces/guards.ts:21`) and outside the space root |
| API keys | `userData/native-secrets.json`, safeStorage-encrypted | **deliberately never** — `secrets-store.ts:1-5`: *"machine-bound ciphertext must never enter a syncable home; a restore on another machine couldn't decrypt it anyway"* |
| Local-engine model | multi-GB GGUF on device A's disk | no |

The transcript IS sufficient to rebuild *history* — `rebuildHistory` is a pure function of the
event array (`history-rebuild.ts:32-86`), and no index or sidecar exists. So the conversation
hydrates correctly and then **dies on the first send**: `modelFactory` is called lazily
(`harness-session.ts:293`) and `provider-registry.ts:183` throws
`Provider '<ulid>' is not configured.` — an error naming an id the user has never seen.

**Consequence for the parity claim.** Records, tags, notes, titles and transcript *viewing* can
reach full parity. Resume and takeover cannot, without a design decision. Sketch of the options,
to be chosen before §§4–6 are planned:

1. **Rebind on resume.** Materialize, detect the binding is unresolvable locally, and prompt the
   user to pick an available model before the first turn. Most honest; most UI work.
2. **Built-in providers only.** `'local'` and `'openrouter'` have stable ids
   (`provider-registry.ts:21-24`), so a session bound to those is portable if the key/model is
   present. Narrow but cheap.
3. **View-only cross-device.** Sync records + transcripts, drop takeover from the parity claim,
   and make the Resume Browser say so.

Nothing checks binding resolvability at resume time today. Whichever option wins, that check is
new work.

---

## 3. The v1.3 work — three correctness fixes

**Status: ✅ SHIPPED — youcoded PR #177, merged to master 2026-07-19 (merge `fe8529ba`,
commit `6498a732`).** All three fixes plus their pins landed together; both CI builds green,
full suite green (2651 passed). This section is history now — §§4–6 are the remaining work.

Independently shippable, independently reviewable. None depends on any parity work.

### 3.1 The orphaned harness (investigation Break 4)

**The defect.** `conversations/takeover.ts:80-83` calls `sessionManager.destroySession`
directly, skipping the `await nativeHost.destroy(sessionId)` that the sanctioned path
(`ipc-handlers.ts:589-593`) performs first. The orphaned `HarnessSession` keeps its
`transcript-event` listener attached and keeps appending.

**Why fixing `takeover.ts` alone is insufficient.** `resume()`
(`native-session-host.ts:302-327`) never consults `this.live` and never calls `destroy()`. It
builds a fresh entry and wires it, while the orphan's listener — closed over the *old* entry —
keeps writing. `wire()` overwrites the map entry (`:236-237`) but the host's own `destroy()`
comment is explicit that this is not enough (`:408-411`): *"the listener closes over `entry`, so
deleting the map entry alone would NOT stop re-enqueue mid-stream."* Two live writers on one
JSONL, unordered against each other, violating the single-writer invariant asserted at
`native-home.ts:5-7`. `session-exit` (`ipc-handlers.ts:2322-2344`) also skips `nativeHost.destroy`.

**Tasks.**

1. `resume()` destroys any existing live entry for that session id before wiring a new one.
   This is the load-bearing fix — it closes the class regardless of which caller orphaned the
   session.
2. `takeover.ts` gains a `destroy(desktopId): Promise<void>` injected dependency and awaits it
   in step 8. (Injected rather than a direct `nativeHost` import, to preserve the module's
   fake-collaborator test style.)
3. `session-exit` routes through the same teardown.
4. Pinning test: resuming a native session id that is already live must not leave two
   listeners appending. Assert on append calls, not on map state — the map entry is not what
   keeps the orphan alive.

### 3.2 Phantom `claude/` records (found in the 2026-07-18 design review — NOT in the investigation)

**The defect.** `SESSION_SET_FLAG` (`ipc-handlers.ts:2353`) carries a "phantom-record gate" whose
own comment describes precisely this hazard: *"Without this gate, flagging a LIVE session before
its SessionStart hook establishes the mapping would seed a flag-only record keyed by the desktop
randomUUID — UUID-shaped (passes the store's id guard), synced to every device, and never
pruned."* The gate is `if (sessionIdMap.has(sessionId) || !sessionManager.getSession(sessionId))`.

PR #176 added `sessionIdMap.set(info.id, info.id)` for native sessions
(`ipc-handlers.ts:541`) — which **defeats that gate for native**. `setFlag` / `setTitle` /
`setNote` all seed a record when none exists (`conversation-store.ts:349-380`), each with a
hardcoded `'claude'` (`service.ts:197, 201, 205`).

**VERIFIED on disk, 2026-07-18** — `~/YouCoded/Personal/Conversations/claude/e0a23b35-7fcd-4907-b0b0-5ba31a9020cd.json`:

```json
{ "schema": 1, "id": "e0a23b35-…", "provider": "claude",
  "projectName": "", "originalPath": "", "transcriptRef": "",
  "lastActive": "1970-01-01T00:00:00.000Z",
  "flags": { "complete": { "value": true, "updatedAt": "2026-07-19T06:23:21.324Z" } } }
```

That id is a **native** transcript in `~/.youcoded/sessions/-home-destin-youcoded-dev/`. No CC
transcript exists for it. Flagged records are deliberately never pruned, so it syncs to every
device permanently.

**Tasks.**

1. Fix the gate so a native session cannot seed a `provider:'claude'` record. (The gate's intent
   is "only write when `resolved` is a real CC id" — native ids never are.)
2. **A cleanup pass for records already written.** This is why the §2.3 "no backfill" non-goal
   does not cover it: once §5 lands, the same native session gets a legitimate record at
   `native/<id>.json` while the mislabeled `claude/<id>.json` survives → two Resume Browser rows
   for one conversation, one of them unopenable. Identify by: `provider:'claude'`, blank
   `transcriptRef`, EPOCH `lastActive`, and an id that matches a file under `~/.youcoded/sessions/`.
3. Pinning test: flagging/noting a live native session writes no record under `claude/`.

### 3.3 Gate the native lease acquire (D7 / investigation Option A)

Wrap `ipc-handlers.ts:543-551` so the lease is taken only once native transcripts participate in
sync. `leaseQuery` then answers `held:false` for native, the resume gate never offers a handoff,
and device A keeps running — restoring pre-#176 behavior.

**Decision, reversing investigation decision point 1:** **keep** `sessionIdMap.set` +
`noteSessionStarted`. The investigation recommended dropping them so that "native is not in the
sync system" became a single enforceable statement. §3.2 shows that statement was never true —
native was already writing into the store, incorrectly — so dropping the mapping does not buy
the invariant it was supposed to buy, and `noteSessionStarted` is what §§4–6 need anyway. Fix the
gate in §3.2 instead; that is the enforceable statement.

---

## 4. v1.3.1 Phase 1 — provider threading

**Gated on §2.5.** Per D3, make the parameter required and let the compiler produce the work
list. Known call sites that hardcode `'claude'` today: `conversations/service.ts:148, 197, 201,
205, 237, 297`; `reconciler.ts:115, 182, 188`; `service.ts:123` (`spaceTranscriptPath`);
`session-browser.ts:377`; `ipc-handlers.ts:2480`; `remote-server.ts:789`.

### 4.0 Name the parameter something other than `provider`

`provider` in the store means `SessionProvider = 'claude' | 'native'` (`types.ts:35`). But
`providerId` and the entire `PROVIDER_*` IPC surface mean the **model** provider
(openai / ollama / a per-device ULID) — and both meanings already appear in
`native-session-host.ts`. Threading a bare `provider` through ~15 more call sites entrenches the
collision. D3's compiler-driven sweep is the cheapest moment this name will ever be changeable:
prefer `runtime` or `sessionProvider`.

### 4.1 Tasks

1. Thread the parameter through `noteTranscriptEvent`, `materializeOne` / `materializeSweep`,
   `flushSessionToSpace`, `setTitle` / `setFlag` / `setNote`, and the browse/meta readers. The
   store schema is already provider-open (`store-core.ts:18`) — a call-site sweep, not a schema
   migration. Note `session-browser.ts:417/452` already passes `rec.provider` through to the row,
   so the renderer surface is provider-aware; only the enumeration is not.
2. `localJsonlPath` becomes provider-aware: `~/.claude/projects/<slug>/` vs
   `~/.youcoded/sessions/<slug>/`. **But see §4.2 — the slug functions are not identical.**
3. `transcriptRef` gains a `native/transcripts/<projectKey>/<id>.jsonl` lane beside the existing
   `claude/` prefix. Never cross-materialize (D5).
4. **Add a containment guard to `transcriptRef` before doing any of the above.** `service.ts:263`
   does `path.join(s.root(), rec.transcriptRef)` with no escape check, unlike `providerDir` /
   `recordPath` which both refuse escapes explicitly. Today it is only reachable via
   `list('claude')`; generalizing the sweep across providers widens that surface to any record.
   Small, security-shaped, and it must land first.

### 4.2 Correction — `ccProjectSlug` ≠ `cwdToProjectSlug`

The earlier draft of this spec justified item 2 as cheap because "the slug function is already
shared and deliberately identical (`session-store.ts:10-12`)". **That is wrong**, and so is the
WHY comment at that location.

- The native store imports **raw** `cwdToProjectSlug` (`harness/session-store.ts:12`).
- The conversation/sync layer and `pushMoved` (`ipc-handlers.ts:1881`) use **`ccProjectSlug`**,
  which uppercases the Windows drive letter *first* (`project-conversations.ts:26-29`) — with a
  comment explaining that without it, *"project-filtered conversations come back EMPTY on Windows."*

On Windows with a lowercase-drive canonical path (which the artifact canonicalizer produces),
`c:/Users/…` slugs to `c--Users-…` natively but `C--Users-…` through the CC path. **This is live
for the two-device dogfood configuration** (Windows GalaxyBook ↔ Linux Z13).

Resolve by either adopting `ccProjectSlug` in the native store, or encoding the divergence in the
§7 test rather than asserting equality. Fix the misleading comment at `session-store.ts:10-11`
on sight regardless.

---

## 5. v1.3.1 Phase 2 — route native events into the store

The native listener at `ipc-handlers.ts:1974-1981` is the CC listener at `:1917-1928` *minus*
the `noteTranscriptEvent` call. Add it, with the native runtime tag.

This is the single line that makes native conversations exist in the store at all. Everything
in §4 is what makes that line correct rather than mislabeling.

**Keep the live-session materialize guard for native — for the opposite reason it exists for CC.**
The guard (`service.ts:250-258`, `sessions.has(rec.id)`) exists because renaming over a transcript
CC has open detaches the inode and loses turns. Native has no long-lived fd —
`appendSessionLine` opens by path per call (`native-home.ts:126-148`) — so that failure mode does
not apply. Instead, a mid-session `materializeOut` would silently **redirect** subsequent appends
into the newly-materialized file, interleaving space content with live local appends. Same guard,
different failure. This deserves a WHY comment, because the existing rule's reasoning does not
transfer.

---

## 6. v1.3.1 Phase 3 — the resume and browse paths

**Gated on §2.5** — the shape of items 1 and 5 depends on which option is chosen there.

1. **Moved payload carries the runtime.** `pushMoved` (`ipc-handlers.ts:1882`) stamps
   `{ sessionId, device, claudeSessionId, projectSlug, projectPath }` — no provider. The
   MovedGate calls `handleResumeSession` with three positional args (`App.tsx:2675-2676`), but
   `provider` is the **seventh** parameter (`App.tsx:2120`), so the native branch at
   `App.tsx:2170` is never taken. Control falls through to `session.create()` with no provider →
   `session-manager.ts:56` defaults to `'claude'` → spawns `claude --resume <nativeUuid>` against
   a native-format file. **VERIFIED.** The payload needs the runtime, and the branch needs to
   honor it.
2. **Native cwd resolution — missing entirely.** For CC, cwd is where the process spawns and CC
   finds its own transcript. **For native, cwd is how the transcript is *located*** —
   `readHeader`/`readEvents` resolve `~/.youcoded/sessions/<cwdToProjectSlug(cwd)>/<id>.jsonl`.
   But `session-manager.ts:57-69` silently rewrites a nonexistent cwd to `os.homedir()`, so on
   device B the chain is: homedir → wrong slug → `readHeader` returns null → `resume` returns
   false. Native rows also bypass all of CC's hard-won resolution machinery — they pass `r.cwd`
   straight from the header (`ipc-handlers.ts:1363-1375`), never touching `walkSlugParts` or
   `resolveLocalProject`. This is the same bug class as the `bea0de3e` / `57be5e14` dogfood fixes,
   unported to native. Phase 3 needs a native analogue of `resolveLocalProject` **and** a gate
   that refuses to resume rather than silently resolving to `$HOME`.
3. **Split the resume-failure error message.** `ipc-handlers.ts:508` reports *"This conversation
   could not be resumed — its saved data is missing."* for every native resume failure — missing
   file, wrong cwd, torn header alike. In the cross-device case the data is not missing; we looked
   in the wrong directory. That is a guessed-and-wrong cause per
   `docs/error-message-standards.md`, and it would make §7's end-to-end acceptance criterion
   uninterpretable — you could not distinguish a slug bug from a sync bug from the message.
4. **Browse/meta.** `session-browser.ts:427/439` probes a CC path to decide `notSyncedYet`, so a
   native record would permanently read "not synced to this device yet." Make the probe
   runtime-aware. **Remote browse** (`remote-server.ts:601-606`) omits native rows entirely.
5. **Native-aware teardown (Option B, per D6).** `takeover.ts` branches on the runtime for step 3:
   `nativeHost.interrupt(sessionId)` (`native-session-host.ts:354-362`) instead of the ESC byte
   via `sendInput`, which returns `false` for native and is a silent no-op (investigation
   Break 1). `sendInput`'s return contract conflates unknown-id / native / dead-worker — consider
   splitting it so callers can distinguish "not applicable" from "failed."
6. **Local-engine model availability.** `ipc-handlers.ts:558-559` eagerly `loadModel`s on session
   open; on device B the GGUF likely is not downloaded and the failure lands in a swallowed catch.
   Part of the §2.5 decision.

---

## 7. Test plan

**The existing suite actively certifies the bug.** `holder-takeover.test.ts` passes on a native
session that was never interrupted, because its fake `sendInput` records the call and cannot
express "returned false and did nothing." A green run is currently evidence of nothing here.
The provider-aware fake must land *with* the fix, or the next change re-opens the same hole
against a green suite.

**For v1.3 (§3):**

- The §3.1 orphan pin (assert on append calls, not map state).
- The §3.2 phantom-record pin: flagging/noting a live native session writes nothing under `claude/`.
- Coverage of native lease *registration* — `grep -rn "leaseWiring" tests/` returns zero hits
  today; `ipc-handlers.ts:541-551` shipped entirely unguarded. Nothing currently constructs
  `registerIpcHandlers`.
- An arithmetic pin on the three coupled handoff constants (`QUIESCE_MAX_MS` 6s +
  `HANDOFF_SYNC_TIMEOUT_MS` 15s < `MAX_MS` 25s). Documented in comments at all three sites,
  pinned by no test. Cheap, worth adding while in here.

**For v1.3.1 (§§4–6):**

- A provider-aware `sendInput` fake that can express the false/no-op return.
- Native cases in `holder-takeover.test.ts` and `requester-takeover.test.ts`.
- `flushSessionToSpace` / `materializeSweep` against a **missing local source file**, as
  distinct from a missing session. `mirrorIn` returns `{copied:false}` silently on a missing
  source (`transcript-mirror.ts:24-29`, `:65-79`) and the result is discarded by the caller —
  so the observable is the discarded return, not a thrown error. Adding logging to that
  `catch` would do nothing; control never reaches it.
- A slug test that **encodes the `ccProjectSlug` / `cwdToProjectSlug` divergence** (§4.2) rather
  than asserting equality — including a lowercase-Windows-drive case.
- A `transcriptRef` containment test (§4.1 item 4): a record whose `transcriptRef` escapes the
  space root must be refused, not followed.

**End-to-end acceptance** (two devices, both dev builds): create a native session on A, confirm
it appears in B's Resume Browser with its tags; take it over from B; confirm A's turn actually
interrupts, A's session tears down cleanly with no orphan, and **B resumes A's transcript**,
not its own stale local copy. **Note: the last clause is gated on §2.5** — until that decision
ships, "B resumes A's transcript" means B can *read* it, not continue it.

---

## 8. Load-bearing — do not undo

PR #176's primary fixes are correct and independent of the native gap. Investigation §8 lists
all seven; the ones most likely to be disturbed by this work:

- `syncSpacesSyncNowAwaited` at both barrier sites (`service.ts:357`, `main.ts:715`).
  Reverting either silently restores the lost-turns bug.
- The per-holder loop in `takeover.ts:60` and `:80` — a create+resume pair can map two desktop
  ids to one claude id. Flush and release stay **outside** the loop.
- `held.has()` as the victim/attacker discriminator (`lease-client.ts:305`). The `taken` frame
  carries no `deviceId`; keying off a payload field tears down the wrong device.
- `pushMoved` before `destroySession`, each independently try/caught.
- **The `claude/` vs `native/` directory split** (D5). §11.4 — that split is what makes older app
  versions structurally unable to touch native data. Never write native records under `claude/`.

---

## 9. Release impact

**v1.3** now carries the original three gates (two-device dogfood, GitHub sign-in confirmation,
release mechanics) plus §3 — three bounded correctness fixes, not a design pass. Two of them
(§3.1, §3.2) fix damage that is happening today: §3.2 is confirmed on disk, and §3.1 is a
data-corruption class.

**v1.3.1** carries §§4–6, gated on the §2.5 decision.

The empirical case for this ordering: 26 native sessions exist on the primary dev machine and the
conversation store holds 1,522 records, so the §3 fixes have real value now. Cross-device native
*resume* has no user value until §2.5 is answered, whichever release it lands in.

---

## 10. Open questions

1. **§2.5 — which of the three binding options?** This is the gate on all of §§4–6. Nothing else
   should be planned until it is answered.
2. Under D3, does the parameter become required on the *store* API only, or also on the
   renderer-facing IPC surface? The former is the smaller blast radius; the latter is more honest.
3. ~~Does the space layout need a version bump to introduce the `native/transcripts/` prefix?~~
   **ANSWERED 2026-07-18 — no.** See §11.4.
4. ~~Under Option A, were `sessionIdMap.set` + `noteSessionStarted` already dropped for native?~~
   **ANSWERED — moot.** §3.3 keeps them, and explains why the reasoning for dropping them did
   not survive §3.2.
5. §4.2 — does the native store adopt `ccProjectSlug`, or does the divergence get encoded and
   documented? A change to the native slug is a **path change**, so it needs a read-both /
   write-new migration or it orphans existing native transcripts on Windows.

---

## 11. Design review findings (2026-07-18)

Recorded so the next session does not re-derive them. Items 11.1 and 11.2 drove the re-scope;
11.3 and 11.4 de-risk the v1.3.1 work; 11.5 corrects the investigation.

### 11.1 The binding problem
See §2.5. The single most important finding — it is why parity moved to v1.3.1.

### 11.2 The phantom-record regression
See §3.2. A live defect on master, confirmed on disk, missed by the investigation. It also
falsifies the investigation's framing that "native is not in the sync system" — native was
already writing into it, mislabeled.

### 11.3 Transcript mirroring is safe — verified, and more safely than for CC

The plan's biggest unknown was whether native files can ride the size-comparison mirror. They
can, more strictly than CC files:

- `NativeHome.appendSessionLine` (`native-home.ts:148`) is the **sole** writer and only appends.
  A grep for `writeFile` / `createWriteStream` / `truncate` / `rename` against the sessions tree
  returns zero hits.
- Streaming parts are accumulated **in memory** and written once on flush
  (`harness/session-store.ts:52, 91-96, 125-132`) — no partial line is ever written and then
  rewritten. One streaming message produces exactly one appended line.
- The header is written once at `create()` and **never rewritten on resume**
  (`native-session-host.ts:307-308`).
- No compaction, pruning, or retention sweep exists over `~/.youcoded/sessions/`.

So the mirror's assumptions (monotonic growth; equal size ⇒ equal content —
`transcript-mirror.ts:1-11, 73-77`) hold absolutely. Its `shrunk` branch is dead code for native.
Size is also not a near-term concern: the largest native transcript on the primary dev machine is
672 KB against the 50 MB `MAX_SYNC_FILE_BYTES` cap.

### 11.4 Space-layout forward compatibility — no version bump needed

Records are keyed as `<root>/<provider>/<id>.json` (`conversation-store.ts:81-97`), so `native/`
is a new sibling directory. Every enumeration path is scoped by a string literal
(`list('claude')`, `get('claude', …)`, `heal()`, `reconciler.ts:115`), and **there is no GC
anywhere** in the store, reconciler, or engine — the only `git rm` (`git-transport.ts:284`) fires
solely to propagate a real peer deletion. `git add -A` with a denylist-only `info/exclude` that
does not match `native/` means it syncs automatically.

An older app version therefore **structurally ignores** native records — it cannot corrupt or
delete them. Two caveats:

- Old clients never heal conflict copies under `native/` (they accumulate; the fold is idempotent
  so nothing is lost, but a native-aware client must eventually read them).
- `store-core.ts:56` rejects any record whose `schema !== 1` outright. Adding new **optional
  fields** at schema 1 is the backward-compatible move; a schema bump is a hard cut.

### 11.5 Corrections to the investigation and the earlier draft

- **The slug functions are not identical** (§4.2). Both the investigation (§2 table, "the same
  function, imported deliberately") and the earlier draft of this spec asserted they were.
- **Investigation decision point 1's recommendation to drop `sessionIdMap.set` is reversed**
  (§3.3), because §3.2 shows the invariant it was buying never held.
- The investigation's §6 open question — *"is a two-device native session a real user path?"* —
  is partly answered: 26 native sessions exist on the primary dev machine, so native is a real
  and used path. Whether it is used across two devices remains unanswered, but §3.2's phantom
  records are written by a **single** device, so that fix's urgency does not depend on the answer.

---

## Related

- `docs/active/investigations/2026-07-18-native-session-takeover-gap.md` — the evidence base
- `docs/active/handoffs/2026-07-10-sync-completion-handoff.md` — the v1.3 gate list
- `ROADMAP.md` — the v1.3 safety-fix item and the v1.3.1 parity item
