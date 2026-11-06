---
status: draft
date: 2026-11-06
topic: YouCoded Mesh — conversations that work on every device at once (sync, live view, automatic runner choice)
related-cards: 64, 98, 119, 121, 125, 127
supersedes-direction-of: the per-finding patch list in the 2026-11-05 sync/handoff investigation
---

# YouCoded Mesh — suggested design (draft, for review)

**Nothing here is approved or built.** This is the current suggested design after one
session's discussion with Destin (2026-11-05/06) and three independent read-only reviews.
A reviewing session should check it against the code, challenge it, and explain it to
Destin in plain words. Destin directs product; the session makes technical calls; any
visible change still goes through a review deck.

## 1. What Destin wants (his goals, condensed)

- Use conversations "just like claude.ai, Gemini, ChatGPT", but hosted entirely on his own
  hardware (his tailnet etc.).
- Open a chat on one device and see/continue it on another **without closing it, without
  a deliberate handoff, without thinking about which device hosts it**.
- Messages **live-update** between devices that are open at the same time; two desktops +
  a phone should feel like one app on three screens.
- Devices sleep, turn off, lose internet. **One device going offline must never interrupt
  using the assistant or reduce what data he can reach.** Data is automatically safe on
  all devices.
- Simplest, most robust, least work; secure, reliable, consistent; future-proof — the
  backup store must be swappable (GitHub today; maybe Google Drive, iCloud, or a YouCoded
  store later).

### Decisions Destin has made so far
1. **Default runner = the device he's typing on** — and the agent must be made aware it
   runs in a multi-device harness.
2. **Phone runs a reply only when no computer can.**
3. Wanted the "referee" options explained (section 6) before deciding.
4. Accepted the idea of a per-conversation host, but rejected "deliberately switch the
   host" — handoff must be automatic.

### Still open for Destin (section 10)
- What happens when the runner vanishes **mid-reply** (wait for him vs auto-continue).
- Whether the phone fallback is limited to chats with no project folder.

## 2. Why today's system breaks

Evidence: the 2026-11-05 investigation, on branch `session/sync-rethink-investigation`:
`git -C /home/destin/youcoded-dev show origin/session/sync-rethink-investigation:docs/active/handoffs/2026-11-05-sync-handoff-rethink-START-HERE.md`
(real incidents from his laptop/desktop, 18 ranked code findings with file:line).

Today **each device runs its own copy** of a conversation (Claude Code's JSONL transcript).
Switching = stop on A → git-commit and push the whole file into a hidden per-space git repo
→ B pulls → B starts its own copy. Every reported symptom follows from that:

- Copies reconcile by **file size — bigger file wins** (`main/conversations/transcript-mirror.ts:112-158`).
  A stale resume + new turns lost a whole exchange with no conflict copy.
- Quit doesn't flush (`main/sync-spaces/engine.ts` `stop()`); copies only move at turn end.
- Handoff waits a fixed **25 s** (`handoff-attempt.ts:146,180`) for a ~13 MB push → false
  "may have newer messages" even when everything synced.
- Byte-exact prefix rule (`handoff-transcript.ts`) fails on trailing bookkeeping records.
- Conflict copies are invisible; one sentence for every failure; no per-chat sync state.

Conclusion: patching each finding leaves the root cause (two devices each owning a copy and
shipping a file back and forth) in place.

## 3. How others do it (the reference point)

- **claude.ai / ChatGPT / Gemini:** one record on their server, every reply runs there,
  devices are windows. No handoff because nothing moves.
- **Claude Code remote control:** the session stays on the user's computer; phone/web
  connect to it through a relay. Continue = connect, not move.

The Mesh keeps that experience, but the "server" is the user's own set of devices, and no
single device is required.

## 4. Core idea: a conversation is three things

| Part | What it is | Where it lives |
|---|---|---|
| **Record** | Every message, the chat's name and settings | Every device (list eagerly, full content on open); safe copy in the backup store |
| **Runner** | The device doing the thinking/tools for the current reply | One device at a time; chosen automatically, moves only at quiet points |
| **Environment** | Project folder files, running processes (dev servers, background commands, subagents), tools, MCP servers, local models | Physically on one machine; folders may be synced by project sync |

The first draft treated the record as the whole state. Review showed the **environment**
matters as much: a resumed agent on another machine assumes processes, files and tools that
aren't there. The design below is built around that.

## 5. The design

### 5.1 The record — one format, merged by message id
- **Keep Claude Code's JSONL as the only transcript format** (no new log format, no
  bidirectional translator). Records carry `uuid` / `parentUuid`.
- **Merge = union by `uuid`**, appending another device's missing records; never rewrite
  existing lines. A uuid-keyed set is already conflict-free (a CRDT in effect).
- **Merge only when no session is live on that file** (on open, before a turn, after a turn) —
  never touch a file Claude Code holds open (POSIX inode-detach hazard already documented in
  `docs/conversations.md`).
- **Cleanups at merge:** ignore/dedupe uuid-less Claude Code bookkeeping records
  (`cost-state`, `last-prompt`, `permission-mode`, …; titles already live in the naming store);
  before a resume, insert a synthetic "interrupted" result for any `tool_use` with no result.
- Helpers to reuse: `main/conversations/slug-repair.ts:29-88` (`uuidSet`,
  `uuidContentHashes`, `classifyPair`). Note `slug-repair.ts:3-4` warns that unioning
  transcripts is "undefined behaviour" because of parentUuid chains — the claim here is that
  **append-missing-records** (not line interleave) avoids that. **Must be proven** (section 9).
- `/compact` must land as new records, not an edit, so merge doesn't see a false fork.
- Native (YouCoded harness) sessions: same rule on its own session store format.
- **Names/flags/settings:** one value per conversation, last-writer-wins by timestamp —
  ends the "two devices show two names" problem (`naming-store.ts`, `naming-core.ts`).
- **Forks** (two devices both continued while unable to coordinate) are kept, never dropped.
  v1 shows a quiet note: "Another version of this chat exists — open it." No "< 1/2 >" UI yet.

### 5.2 Moving the record
- **v1: one transport** — the existing git sync (`main/sync-spaces/git-transport.ts`,
  `engine.ts`) plus SyncHub signals for instant pulls. Push after every turn, pull before a
  turn/open, **flush on quit and sleep, pull on wake**.
- **Not eager to every device.** Every device gets the chat list (title, last message, ids,
  where it last ran) immediately; full content downloads on open, newest part first; large
  tool outputs can be fetched lazily. The phone never replicates in the background.
  A reinstalled device has a usable list in seconds.
- Backup store only ever holds files → GitHub/Drive/iCloud/a YouCoded store are adapters.
  Encryption at rest can be added at the file level later (keys only on the user's devices).
- **Live view is separate from the record**: while a reply runs, other open devices watch it
  word-by-word through the existing remote protocol (`main/remote-server.ts` already
  broadcasts PTY/transcript events to many clients; `renderer/remote-shim.ts`). Over
  Tailscale/LAN in v1; a relay for non-Tailscale users later.
- **Do not stream tokens through the Cloudflare Durable Object** — it signals only
  ("chat X has new records; runner is D"). Streaming through it is costly and fragile.

### 5.3 Choosing the runner — sticky, moves only at quiet points
- **Sticky:** the chat stays on its current runner while **any** of these is true:
  a reply is running; it has running processes / background commands / subagents; it has
  files written there that haven't synced; the last reply was under ~5 minutes ago (keeps
  the prompt cache warm, see 5.6).
- During that window, typing on another device **sends the message to the current runner**
  (as the phone does today): instant, no re-read, no reload — "one app on three screens".
- **At a quiet point**, the next message runs on the device being typed on **if eligible**:
  has the project folder (verified, by project id — 5.5), Claude Code / the chat's model
  (local models matter), desktop-class. Otherwise → an eligible online computer. Phone only
  when no computer can (and probably only for chats with no project folder — open question).
- If nothing eligible is online: the message is **queued visibly** ("Will run when Desktop
  wakes"), never silently dropped.
- **Mid-reply runner loss — recommended default: no automatic takeover.** The chat is
  immediately usable everywhere, the cut-off reply is marked ("Laptop went offline"), and the
  next message from any device continues it, with the agent told exactly which step started
  but never finished. Reason: on bad wifi a "dead" runner may still be alive → duplicate side
  effects (pushes, file writes, commands) that a versions view cannot undo. Auto-continue
  after ~90 s is the alternative (Destin to decide).
- Detection: clean quit/lid close announces itself (instant); sudden drops ~60–90 s grace
  (30 s gives false alarms on flapping networks; today's lease is 300 s,
  `wecoded-marketplace/worker/src/sync/room.ts:42`).
- Message order: only the runner accepts a turn; a second device's message queues as the
  next turn and is shown in that order.
- Permission approvals from another device carry a request id; if the runner changed, show
  "that request expired" and re-ask, never silently approve nothing.

### 5.4 Making the agent multi-device aware
At the first turn on a new runner (and whenever relevant facts change), YouCoded injects a
short harness-generated block — never memory-based. Example:

> You're now running on DestinsLinuxPC (Linux, /home/destin/proj). The previous reply ran on
> destinsZ13. Processes started there (dev server :3000, subagent X) are not running here.
> MCP servers here: A, B. Files changed on the other device in the last few minutes may not
> be here yet. The user is currently on their phone. "Open in browser" acts on the machine
> you run on — put links in the chat instead.

Rules: may assume the conversation record is complete; may **not** assume a process is
alive, a port bound, a file present, a token valid, or that something "opened" reached the
user. Interrupted step: named explicitly. Later: "open this" actions routed to the device the
user is actually on. For caching, append this as a mid-conversation message, not an edit to
the system prompt (native harness already appends path-triggered rules this way,
`harness-session.ts:1468`).

### 5.5 Project identity
Identify projects by a **stable id** (synced project id / git remote + root commit / marker),
with a per-device table id → local folder. Compute Claude Code's path slug from the local
folder (`main/conversations/resolve-local-project.ts:30-45`; slug history in
`docs/conversations.md`). No local folder → read-only with a plain reason. Fix Android's
resume path, which reportedly still drops `resumeSessionId` (`docs/conversations.md:89`),
before relying on the phone as a runner.

### 5.6 Prompt caching across devices
- Anthropic's cache is server-side, per account/workspace, keyed by the **exact prompt
  prefix** (tools → system → messages); 5-min default life (1 h optional, 2× write);
  reads ≈0.05× input on Opus 5.5, writes 1.25×. It does not care which machine sends.
- **Claude Code** puts machine-specific content early (cwd, platform, OS version, date,
  git status snapshot) and may have per-device MCP/plugin tool lists → **switching machines
  = one cache miss**: the whole chat re-read at full price (≈$1 instead of ≈$0.04 for a
  ~200k-token chat on Opus 5.5; on a subscription it costs usage allowance) and a few
  seconds slower. We can't edit CC's prompt; accept it.
- The sticky 5-minute window avoids most misses; after 5 idle minutes the cache is gone
  anyway, so a switch then costs nothing extra.
- **Native harness** already puts `<env>` last (`harness/prompt-assembly.ts:190-208`); gaps:
  the per-project instruction part sits above `<env>`, and `Platform:` differs per OS.
- Make it visible (cache tokens are tracked in `harness/cache-usage.ts`): "switching re-read
  this chat".
- **Unverified:** exact CC system-prompt contents per machine — check with one real test.

## 6. The referee ("who is running chat X right now?")

| Option | Pros | Cons |
|---|---|---|
| **Existing SyncHub Durable Object leases** (per account; sees only ids/device names) | Built (`room.ts`, `lease-client.ts`); instant; works across networks | Needs internet; 300 s expiry today (shorten to ~60–90 s) |
| Devices vote over Tailscale | No server | 2–3 devices → frequent no-majority; most code, subtle failures |
| Fixed ranking ("desktop first") | Simple rule | Needs a shared view of who's online — same problem |
| No referee (everyone runs; merge keeps all) | Simplest | Two devices may answer the same message — double cost, confusing |

**Recommendation:** the DO lease as a **soft hint** + "no referee" fallback when it's
unreachable. Because merge never loses data, the worst case is a rare extra branch.
Dropped from the first draft: epoch fencing, peer voting.

## 7. Realistic timings (estimates, not measured)

| What | Time |
|---|---|
| Reply text appearing on other open devices | < 1 s |
| Message from another device reaching the runner | < 1 s |
| Finished reply in every device's saved copy | ~3–10 s |
| Open a chat not yet on this device | ~1–3 s LAN; 10–60 s huge chat on phone data (newest first) |
| Detect runner gone | instant (clean quit/lid); ~60–90 s sudden drop |
| First reply after a runner switch | a few seconds slower (cache miss) |
| Reinstalled device joins | list in seconds; old chats on open |

## 8. Scenario stress test (summary of the real-use review)

Holds up: lost-message incidents, "bigger wins", 25 s cap, live viewing reuse.
Needed the sticky rule / extra handling:
- Walk from laptop to desktop mid-reply → desktop watches live, messages go to the laptop
  runner; "Running on Laptop — your message is queued" + explicit "stop and run here".
- Lid closed mid-task → reply marked cut off; next message continues; interrupted step named.
- Train wifi flapping → long grace; never treat a runner still reporting activity as dead.
- Both computers off → phone shows everything; runs only general chats; project chats queue.
- Folder on one machine only → read-only elsewhere with reason.
- Local model only on one machine → chat's model is a runner requirement; offer
  "continue with Claude instead" explicitly, never silently.
- Background dev server / subagent running → sticky; never move.
- Agent "opened it in your browser" on another machine → location note + links in chat.
- Very long chat (13–50 MB) → tail-first loading; growth problem is card #98.
- Scheduled automations (card #64) → exactly-once run claims via the referee; "missed" shown;
  tie to a named runner + folder.

## 9. Must prove before building (cheap tests first)

1. Claude Code `--resume` works on a file built by append-missing-records union, including
   a fork whose newest leaf is not the last line.
2. CC resume behaviour with a `tool_use` lacking a result, and with our synthetic result.
3. Whether `/compact` rewrites the JSONL shorter (investigation finding 5).
4. Exact per-machine content in CC's system prompt (cache-miss cause), via
   `cache_read_input_tokens` on a switch.
5. Two-root reproduction of the stale-resume loss (pattern:
   `desktop/tests/handoff-freshness-integration.test.ts`, two roots + bare git remote).
6. Android resume path and backend session lifetime in the background.
7. Worker side `wecoded-marketplace/worker/src/sync/room.ts` was not audited in depth.

## 10. Build order

1. **Stop losing messages** (worth shipping alone): uuid merge replaces size reconcile and the
   byte-prefix rule; flush on quit/sleep, pull on wake; structured logging of every sync /
   lease / handoff step to `desktop.log`; visible conflict notes.
2. **One list everywhere:** every chat listed on every device, content on open, project ids.
3. **Live on every screen:** watch/type into a running chat from any device over Tailscale/LAN;
   sticky rule; "running on X" state.
4. **Automatic runner choice at quiet points** + the "you moved" note + queued states.
5. **Later:** relay without Tailscale (card #119), more backup adapters (Drive/iCloud/YouCoded,
   end-to-end encrypted), phone last-resort runner, Mesh automations + Cloud fallback (#64).

Retires (after 1–4 ship; callers not yet traced): `takeover.ts`, `handoff-attempt.ts`,
`handoff-transcript.ts`, `handoff-receipt.ts`, `handoff-transport.ts`, `reconciler.ts`,
`transcript-mirror.ts` (~1,600 lines), the takeover dialog, the 25 s wait, MovedGate, the
"may have newer messages" notice.

## 11. Security
- Per-device approval (QR from an existing device), revocable, using the device registry
  (`main/sync-spaces/device-registry.ts`, `main/device-identity.ts`). Note the two device ids
  (per-install for leases, per-machine for the registry) must not be merged.
- Only approved devices may submit turns to a runner (that means running things on a computer).
- Relay/backup traffic end-to-end encrypted when those land; one account key wrapped per device.
- Reinstalled machines get new install ids — leases/notices must not point at devices that will
  never answer.

## 12. Review lineage
- Draft v1 (per-device immutable piece log, per-reply runner, epoch fencing, peer voting, three
  transports, versions UI) was reviewed by three independent read-only agents (simplicity,
  fragility/cost/caching, real-use scenarios). Their findings produced this version: one format,
  sticky runner, no automatic mid-reply takeover, soft-hint referee, one transport first, lazy
  content, the environment-awareness note.
- Reviewer line counts and file:line references were spot-checked only by the reviewers
  themselves; a reviewing session should re-verify before relying on them.

## Where to look
- Code: `youcoded/desktop/src/main/{sync-spaces,conversations,harness}/`, `remote-server.ts`,
  `sync-hub-socket.ts`; worker `wecoded-marketplace/worker/src/sync/room.ts`.
- Depth docs: `youcoded/docs/{sync-spaces,conversations,shared-ui-architecture,android-runtime}.md`.
- Prior records: `docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md`,
  `docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md`,
  `docs/archive/investigations/2026-09-23-handoff-message-freshness.md`.
- Cards: #64 (Mesh/Cloud), #98 (sync growth, >50 MB chats), #119 (no Tailscale), #121
  (conflicts, panel wording), #125 (same chat on two computers), #127 (edge cases).
