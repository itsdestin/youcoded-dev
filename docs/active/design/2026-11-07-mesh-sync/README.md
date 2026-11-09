---
status: active
date: 2026-11-09
topic: Chats on every device (YouCoded Mesh) — where the design stands, with every decision traced to Destin's words
related-cards: 64, 98, 119, 121, 125, 127
branch: session/mesh-sync-design (youcoded-dev); no app code changed
---

# Chats on every device — START HERE

This folder is the record of a design interview between Destin and a Claude session, held
2026-11-06 to 2026-11-09. **No application code was changed.** Everything below is either a
decision Destin made in his own words (traced to a deck step or a dated chat message) or a
research fact checked against the code. Nothing else is approved.

## Read in this order

| File | What it is |
|---|---|
| `../../specs/2026-11-06-youcoded-mesh-sync-design.md` | The ORIGINAL proposal (2026-11-06), reviewed against the code the next day. Its status block lists what the review found wrong and which of its decisions Destin later overturned. Read it as "what was proposed", not as the design. |
| `mesh-sync.questions.json` + `.answers.json` | Deck round 1 (18 steps), submitted 2026-11-07. Vision and behaviour rules. |
| `mesh-sync.questions-2.json` + `.answers.json` | Deck round 2 (4 statements + 13 questions), submitted 2026-11-08. Confirmed round 1; decided several mechanics; asked for deeper explanation on connection, cost, what travels, wake and sleep. |
| `connection-options.md` | The explainer written in answer: three pipes with prices, the sleep reframe, what travels with measured sizes, Android sleep, security failure stories, pairing options, the true mesh, side-by-side negatives, and the standing-decisions list. |
| `mesh-sync.questions-3.json` + `.answers.json` | Deck round 3 (7 statements + 9 questions). **Not submitted.** Saved progress: all seven statements marked Holds; Q-1 to Q-4 skipped; Q-5 onward unanswered. Treat the statements as provisional until submitted. |
| `preview/` | Contact sheets of the decks, for checking rendering. |

Serve a deck for Destin with `python3 scripts/ui-review/review-cards.py serve <spec.json> --no-build --timeout 1440` from the workspace root; put the printed link in chat as the last line. Never rebuild an answered deck.

## Decisions, each traced to Destin's words

Format: rule — source. "D1 Q-5" = deck round 1, step Q-5. Quotes are verbatim from the answers files.

### Who this is for, and how to work
- The design is for every user's devices, any mix of Windows, Mac, Linux and Android; Destin's machines are only the test case. — D1 Q-2: "this is an app intended for a much broader audience … it needs to work for everyone"; D2 S-1 Holds.
- Design first, phasing later; do not patch the current system. — D1 Q-16: "figure out the actual design first before you start trying to think about phasing … don't want to waste time fixing/changing the current system if we're just going to toss those same changes".
- The current handoff/takeover code (~1,600 lines) is replaced, not patched; the Nov 5 conflict copies are left alone. — D2 S-4 Holds; D1 Q-17 "no" to recovering the Nov 5 exchanges now.
- Nothing changes without Destin's explicit approval; every rule must trace to his vocabulary. — chat 2026-11-07 ("everything should require my direct vocabulary"), restated 2026-11-09 ("don't change anything i havent explicitly approved").

### How a chat behaves
- One device hosts a chat. Every other device shows it live, word by word, identical except a status-bar chip naming the host. — D1 Q-4: "it should feel like i'm typing into a normal session running on this device, but continue running on the original host device unless that device goes offline or i explicitly request a switch"; D1 Q-14 word-by-word; D2 S-2 Holds.
- The host changes only when the user taps the chip, or when the host is offline and the user taps Continue here. Never automatically. — D1 Q-5: "always stay on its current host device until 1) the host device disappears or goes offline, or 2) the user clicks the status bar chip"; D1 Q-15: "only switch hosts when directly approved by the user and only try to offer proactively when the originating device is no longer reachable"; D2 S-3 Holds.
- The Continue-here notice names what the new device lacks. — D1 Q-8, including his draft wording: "This session was hosted on "XX". That device has since gone offline. You may continue here, but note that the session will not have (commands, files, etc)…".
- On takeover the unfinished reply is dropped on both sides; the old host discards its half when it returns. — D1 Q-9: "drop the incomplete/unsynced reply"; D2 Q-6 pick discard-tail; D3 S-3 Holds (provisional).
- The host keeps running the chat; the chat's files sync underneath; no portable bundle, no container. — D2 Q-4 pick host-stays-plus-sync; D3 S-2 Holds (provisional). (D1 Q-3 had asked to explore containers; D2 Q-4 settled it.)
- Accidental forks are eliminated; a deliberate fork feature exists; rare unavoidable splits reconcile automatically. — D1 Q-6: "our system should really eliminate the case where a user somehow accidentally ends up with two different copies".
- Deliberate forks are equals. Splits caused by network gaps or device moves warn and offer to archive the older one. Forks are grouped in the resume browser. — D2 Q-12: "both should be treated as equals IFF forked manually/intentionally … it should warn with the archive offer on the old version"; D1 Q-7; D3 S-7 Holds (provisional).

### The phone
- The phone is a full host at parity with the desktop; parity gaps are separate work and the Continue-here notice names them meanwhile. — D1 Q-1 and Q-11: "the phone should be at full parity with the desktop"; D2 Q-7 pick assume-parity; D3 S-4 Holds (provisional).
- Opening a chat on the phone works exactly as on PC. — D1 Q-13: "should work exactly the same as pc".
- Upload on sleep is wanted, per platform, with no permanent keep-awake. — D1 Q-10.

### Projects and what travels
- Every project appears on every device (as today). — D2 Q-8 pick everything.
- A chat must be openable on a device that lacks its project folder. — D2 Q-8 note: "there may be some circumstances where i just need the context/feedback of a chat and dont entirely care if the folder is on this device"; D3 S-5 Holds (provisional).
- Tapping the chip toward a device missing the project fetches it first, after a confirmation showing what is missing, why, and the storage needed. — D2 Q-11 pick fetch-then-switch with note; D3 S-6 Holds (provisional).

### Security and connection
- Everything sent between devices is encrypted end to end. — D2 Q-2 pick end-to-end; D3 S-1 Holds (provisional).
- **A key is never synced to GitHub or stored on any server.** — chat 2026-11-08: "syncing the key to github is a terrible idea … syncing a key is just bad bad bad".
- Cloudflare costs nothing today; the earlier "$5 base" was an assumption, corrected in the explainer. — chat 2026-11-08.
- The dream is to work without any central server or service of ours, in the spirit of open source and forkability. — D2 Q-1: "the dream would be for this to be able to function entirely without a central server or host service".
- Neither the server relay nor Tailscale feels like the mesh he envisions. — chat 2026-11-08: "neither of these yet sound or feel like the true 'mesh' i've been envisioning".

### Decisions from the 2026-11-06 proposal that Destin later overturned
The proposal's section 1 lists four "decisions so far". Three no longer hold:
1. "Default runner = the device he's typing on" → replaced by host-stays-until-offline-or-chip (D1 Q-4, Q-5, Q-15).
2. "Phone runs a reply only when no computer can" → replaced by full phone parity (D1 Q-1, Q-11; D2 Q-7).
3. "Rejected deliberately switch the host; handoff must be automatic" → reversed: switches happen only on explicit approval (D1 Q-15); automatic switching is rejected.
The reviewing session's own suggestion to limit the phone to folder-less chats was likewise rejected (D1 Q-11).

## Open items (nothing below is decided)

1. **The pipe:** relay through our server, Tailscale, or a true mesh (devices pair directly; dumb replaceable helpers in the middle). Destin skipped D3 Q-1. The mesh cannot be chosen honestly without a measured spike (explainer §8); the spike is new code and needs his word.
2. **Pairing method** for getting a key onto a new device: pair by code, passphrase, or both (explainer §6).
3. **Whether the GitHub sync copy gets sealed too**, which would make a recovery phrase mandatory (explainer §6).
4. **Mailbox:** does something hold undelivered words for a device that was asleep (D3 Q-2).
5. **Self-host address setting** (D3 Q-3), **who pays** (D3 Q-4).
6. **Helper transcripts** on demand or always (D3 Q-5); **which smaller pieces always travel** (D3 Q-6).
7. **Phone wake** behaviour (D3 Q-7; D2 Q-9 "we'll need to think this through a bit further").
8. **How a chat opens without its folder** (D3 Q-8).
9. **How "accidental forks are eliminated" is actually achieved** given a single host, and how rare splits reconcile automatically (D1 Q-6 states the goal; no mechanism is agreed).
10. **A multi-device-aware assistant** (proposal §5.4) was never put to Destin as a question.
11. **The design document itself** is not yet rewritten from the answers; that was to follow deck 3.

## Research facts (checked against code at youcoded `8ffa0a421`, worker `0aed74e`, 2026-11-07)

- Today: each device keeps its own copy of a chat; whole files sync through the user's private GitHub repositories (`~/YouCoded/Personal/`, `~/YouCoded/Projects/<name>/`), readable by GitHub; conflicts produce `<id> (from <device>, <date>)` copies; 50 MiB per-file cap (25 of Destin's chats exceed it); the store is 9.2 GB of conversations plus 12 GB of history.
- Live link today: Tailscale-only remote server; only the phone has a client; no desktop-to-desktop; home wifi refused since the 2026-10-30 audit.
- Account service: Cloudflare Worker with a per-account `SyncGroupRoom` carrying only `space-updated` signals and session leases; free plan; audited 2026-10-30.
- Sleep: shutdown caps teardown at 6 s; a git push cycle is a dozen subprocesses and often 10 to 30 s; Android's power events never reach the engine.
- Phone: runs the same engine and sync, has synced project folders; lacks the assistant browser, Office, admin commands, folder picker, shared storage, local models, Python and friends; no per-reply wake lock; Doze cuts the network for all apps.
- Session context sizes on Destin's desktop: main transcripts median 1.1 MB (p90 11 MB, max 312 MB); helper transcripts 8.4 GB across 327 chats; saved long outputs 510 MB; undo history 488 MB across 537 sessions; memory 200 KB; plans 52 KB. Only the main transcript, names, tags and handoff notes sync today.
- Conflict copies analysed 2026-11-07: of 26, 13 identical, 10 subsets, 3 true forks.
- Prompt cache on Destin's plan lasts about an hour, not the 5 minutes the proposal assumed; compaction never shrinks a transcript; newest-name-wins already exists; the phone "drops resume" bug the proposal cites was in code deleted 2026-10-14.
- Toolkits for a true mesh: Syncthing (model), Hyperswarm (JavaScript, runs in Node), Iroh (Rust, no official Node bindings). Android path untested for any of them.

## Stale documentation found (reported, not edited)

`docs/sync-spaces.md` (lines ~60, 117, 185), `docs/conversations.md` (~77-89), `docs/native-runtime.md`, the fact sheet and `.claude/rules/native-runtime.md:68` still describe the phone as lacking sync or projects, or describe handoff behaviour that no longer matches the code. Not corrected; outside the authorized scope.

## Constraints that bind every session on this work

- Read-only on application code until Destin approves a design and then a build.
- Never touch his live, built YouCoded app (`.claude/rules/live-app-safety.md`).
- Destin is not a developer: plain words, no jargon, pros and cons with a recommendation, what users will experience. Four or more questions go on a questions deck. Files are handed over as plain paths.
- Never suggest merging.
