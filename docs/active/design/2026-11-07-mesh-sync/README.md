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
| `mesh-sync.questions-4.json` + `.answers.json` | Deck round 4 (2 statements + 17 questions), submitted 2026-11-09. A second session's whole-design review: one copying system, keepers, pairing, closing the host, retired devices, viewer gaps. Supersedes round 3's Q-1 to Q-4 and Q-8. |
| `mesh-sync.questions-5.json` + `.answers.json` | Deck round 5 (16 statements + 7 questions), submitted 2026-11-10. Restated his round-4 rules; decided relay first, files on the same system, offline behaviour; reviewed ten Continue-here states. |
| `mesh-sync.questions-6.json` | Deck round 6: the three questions held over from round 3 (helper transcripts, smaller pieces, phone awake). |
| `mesh-sync.questions-8.json` | Deck round 8: what travels with a chat, setup sync, remote access, self-run relay. |
| `mesh-sync.questions-7.json` | Deck round 7: catch-up, what happens at the 1 GB limit, the super-host, self-hosting the relay, who pays. Written in answer to Destin's two comments on `design.md`. |
| `design.md` | DRAFT of the full design, written from the answers, each rule tagged with its source. Not yet read by Destin. |
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

### Round 4 (2026-11-09), a second session's review
- The goal: it feels like claude.ai, but the user's own devices are the server, and nothing in the middle is required or trusted. — D4 S-1 Holds.
- "Mesh" means four properties, not a networking technology: devices pair with each other; keys live only on devices; any device can catch another up; whatever sits in the middle is blind and replaceable. — D4 S-2 Holds.
- One copying system: the host sends each new line; a device catches up by asking for everything after the last line it has. The separate slow GitHub copy stops being how devices stay current. — D4 Q-1 pick one-system.
- Keepers (something always on that holds sealed lines): build to offer both the user's own always-on device and an optional YouCoded relay. Which is built first is undecided; he asked for architecture, cost and speed of each. — D4 Q-2: "we should build to offer either a or c … if users cont have a device or just prefer, they can use youcoded relay".
- The new sync is end-to-end encrypted. Sealing cloud backups is a follow-up after the new system exists; the user separately chooses whether chats are backed up to a cloud at all, and whether backups are sealed with a passphrase. — D4 Q-3: "this should be a later follow up … a user should separately be able to decide both 1) whether chats are backed up to cloud at all, or just stored on their own devices, and 2) whether backed up chats are encrypted with a passphrase".
- A new device joins by pairing with an existing device; no account is needed for sync (the relay may ask for sign-in against abuse). — D4 Q-4 pick pair-only.
- A computer stays awake while a reply it is running is unfinished. — D4 Q-5 yes.
- Closing the host shows the normal close menu. A chat marked complete closes on every device. Otherwise the app quits at once provided every finished reply is on the other devices; it does not wait for a running reply, whose half is dropped; the chat stays listed on other devices with a notice that the host disconnected and an offer to host it there. — D4 Q-6 note (verbatim in the answers file).
- Removing a device locks it out and frees its chats to be continued elsewhere. — D4 Q-9 pick remove-frees.
- A chat opened without its folder can talk only; the note saying so is added at the end of the chat on the new device, and nothing earlier is cut or edited. — D4 Q-11 pick talk-only + note.
- A continued chat keeps its exact model, provider and project settings. Only when the sign-in is genuinely missing on this device: block until the user signs in (Claude Code), or offer the model picker before resuming. — D4 Q-12 note.
- Today's in-app notifications are enough for this work; cross-device alerts and user-customizable notifications for automations are recorded as one unified card. — D4 Q-13 note.
- A viewing device has the same limits a phone has today; the gaps are recorded in one central place and each shows a plain message such as "x is not currently supported from a remote client." — D4 Q-14 pick same-as-phone + note.
- A chat can be started from one device to run on another. — D4 Q-15 yes.
- Not settled in round 4: the full list of Continue-here warning states and wording (Q-7: "i'd want to see all of the specific warning states/causes/messages"); how duplicates are prevented (Q-8: "there's a smarter way to do this"); how project files travel (Q-10: "is there a simpler or more unified/robust system we could build?"). All three are asked again in round 5.

### Round 5 (2026-11-10)
- The round-4 restatements all hold: closing the host (D5 S-1), talk-only note added at the end (S-3), viewer limits in one list with plain messages (S-4).
- A missing sign-in or a missing project folder is a stop-and-ask before continuing; Claude Code chats wait for sign-in, native chats show the model picker. — D5 S-2 Holds: "sign in missing or project folder missing should be a stop to ask".
- The relay is built first, the own-device keeper after. He wants the costs understood first. — D5 Q-1 pick relay-first: "i want to understand potential costs and such first though".
- Continue here works with no connection to anything, with a clear warning. — D5 Q-4 pick allow-warn.
- Closing the host while offline quits and says so, in simple words. — D5 Q-5 pick quit-and-tell: "should simplify. offline - some chats may not have synced."
- Project files travel on the same system as chats; GitHub becomes optional backup. — D5 Q-6 pick same-system.
- The missing-folder state is framed as turning on sync for that project on this device and fetching it, after which the project syncs continuously. — D5 N-5: "enable sync for this project and fetch the folder first".
- Continue-here states N-1, N-2, N-3, N-5, N-7, N-8, N-9, N-10 hold as drafted.
- Cards filed on his word: #241 cloud-backup choices (D5 S-5), #242 alerts on every device (D5 S-6; filed beside #232, which is mid-build, rather than rewriting it), #243 better view for forked-chat versions (D5 N-10).
- The relay holds a chat's locked lines until 48 hours after the last line was added to that chat (so a chat still being worked on stays fully held), and deletes sooner once every device has them. Devices catch each other up directly for anything older. — chat 2026-11-10: "we can definitely just leave the live-sync relay to like 48h then" and "the 48 hours should start when the last line from that conversation is added. that way a conversation i'm still actively working on, but started a day or two before, will still sync if i open my phone tomorrow".
- The relay holds at most 1 GB per user, as a safety limit. — chat 2026-11-10: "fine to keep the 1gb cap".
- A takeover is recorded as a divider in the chat, built like the existing "Model switched to …" divider, visible to the user, and it carries a message the assistant can read. — chat 2026-11-10: "yes the takeover should be a divider and a message/notification readable by the model, that's what i was asking for originally"; visible: "yese". Review cautions accepted with it: YouCoded keeps the line beside Claude Code's own file; a waking host checks for it before letting a reply continue; the notice says files already changed by a dropped reply stay changed.
- States N-4 and N-6 are merged into one notice: "Desktop is offline and may have newer messages or files than this device. Continuing here could create a second version." — chat 2026-11-10: "ok".
- (Superseded wording kept for the record) Round 5 left open: how long the relay holds lines (Q-2: 30 days is too much; "something more like 24h from when the conversation was last active?"); whether a takeover is written into the chat (Q-3: "open to it … review this for fragility/errors/unintended consequences"); states N-4 and N-6 ("confusing").

### Destin's two comments on `design.md` (2026-11-10), kept here because he asked for the comments themselves to be removed
- On "The host sends each new line … everything after the last line I have": "i think i'm still at least a little confused about how exactly the catch up would work, and how various devices will handle chats that are outdated but don't have available lines on the relay after the 48hr expiration."
- On "A home device cannot be reached from outside the home without something in the middle": "why is a relay needed? what would it take to allow any and every user to fully self-host their own youcoded data/connections/etc? the goal would be to offer fully equivalent central-hosted and self-hosted options for users who don't want to use oour services or, eventually, pay me since we can't financially support the servers ourselves forever."
- In chat the same day: what happens past the 1 GB threshold needs fleshing out; the self-hosted keeper should be "its own fully self-contained youcoded instance/super-host or something like that".
- All four are answered in chat and asked as choices in round 7. **Do not reply on document comments; answers go in chat or a deck** (Destin, 2026-11-10).

### Round 6 (answered 2026-11-11)
- Phone-hosted chat, screen off: the phone stays awake for each reply, plus an opt-in setting to exempt the app from battery limits. — D6 Q-3: picked "lock-plus-toggle".
- Helper transcripts, NOT decided. — D6 Q-1: "idek what option A means or how that would work? the primary issue with helpers is that active sessions may rely on them and their transcripts to copmlete work, so syncing a conversation without its help transcripts would directly lead to significant lost work/effort."
- Smaller pieces that travel, NOT decided. — D6 Q-2: "i think we're underthinkging/undersonsidering this. with option a, what would that actually look like for a typical session? how would we determine what consistutes a syncable plan vs any other normal document? i'm fine to drop images and such. just want to understand what a session/chat actually needs to continue working on a range of project types across devices"
- Measured 2026-11-11 on this session's own chat (Claude Code, desktop): the main chat file holds each helper's task and, once it finishes, its final report; the helper's own working file (1 to 2 MB each here) is needed only to see its steps or to send that helper a follow-up. Plans sit in Claude Code's own `~/.claude/plans/` folder, outside any project. Memory, skills and settings are backup-only today (`youcoded/docs/sync-spaces.md`), not synced between devices.

### Round 7 (answered 2026-11-11)
- The relay keeps, with no time limit, one small note per chat: its latest line number and which device has it; no words of the chat. A device then knows for certain when it is behind. — D7 Q-1: yes.
- Continue here on a chat this device knows is behind: allowed, named honestly. Button "Continue from here as a new version"; the other device's newer lines stay as the other version. — D7 Q-2: "fork-knowingly".
- At the 1 GB limit the relay releases whole chats, least recently used first; host shows "Relay full. 3 older chats will reach Phone when both are on." — D7 Q-3: "release-oldest-chat".
- A one-time prompt offers to remove a device not seen for 30 days; nothing is removed without a yes. — D7 Q-4: yes.
- Super-host: a complete YouCoded with no window, pairs like any device, holds everything with no limit, hosts chats, catches devices up, passes live words, openable in a browser; it holds keys. — D7 S-1: yes.
- A super-host lives on a device at home. A rented server was NOT picked. — D7 Q-5: picked "home" only.
- Payment: no decision; free for everyone at the fixed limits for now. — D7 Q-8: "decide-later", note: "i think i'd definitely be leaning toward option a, with some support from donations, but idk. i think for the time being it's just going to be free for everyone at our current fixed limits, and we may reopen the cost/payment conversation after i begin actually encountering issues"
- Reaching a home super-host from outside, NOT decided. — D7 Q-6: "i think i'm a bit confused as to where this begins to overlap or replace our existing remote access system? and the pros/cons of alternative options for how this superhost thing would work? i think the premise of the super-host offering is that it should allow self hosting and also reduce load/strain on our servers/relay when possible."
- Self-hosted relay, NOT decided. — D7 Q-7: "i'm extremely confused".

### Chat, 2026-11-11
- Reaching a home super-host from outside: offer both, through our relay as the default and the user's own front door. — "i think this is generally fine? though, when we get to it, i will want to better understand the different methods like tailscale vs tunnels". Owed when that piece is designed: a plain comparison of Tailscale, tunnels and the router method.
- Devices on the same wifi talk directly, locked end to end like every other path; needs its own security review before release. — "okay that's fine." on "Direct on wifi, locked (recommended)." Earlier the same day he asked: "is that safe though? i'm pretty sure there were reasons we moved remote access away from wifi to a tailscale-only function...". The recorded reason (`youcoded/desktop/src/shared/cleartext-hosts.ts`, 2026-10-30 security audit A1): the phone sent its pairing password and conversations in plain text to whatever address was saved, including a café's wifi.

### Round 8 (answered 2026-11-11)
- What travels with a chat: its lines plus the files saved for that one chat (helper working files, saved long outputs, its plan and to-do list). Chats active in the last 48 hours are complete on every device; older chats fetch those files when opened. Pasted images and undo history are dropped. — D8 Q-1: picked "recent-complete", with the note: "you keep saying \"folder\". what folder? what are you talking about? i need more context". The pick stands but the word "folder" was unclear; explained in chat, and he may revise.
- Syncing the assistant's setup (skills, plugins, connected tools, global instructions) is a separate card, built after chats sync: card #248. — D8 Q-2: "separate-card".
- The new system replaces today's remote access inside the apps; the open-in-a-browser view stays (still Tailscale). — D8 Q-3: "replace-keep-browser".
- No self-run relay. Self-hosting means running a super-host. — D8 Q-4: "drop".

### Chat, 2026-11-11 (later)
- When the new system arrives, chat sync through GitHub stops and the new system takes over; the existing GitHub copy is left untouched, with a one-time message. Existing chats need no moving. — "fine to stop github sync and swap."
- Browsing replaced file versions, NOT decided. — "confused."

### Decisions from the 2026-11-06 proposal that Destin later overturned
The proposal's section 1 lists four "decisions so far". Three no longer hold:
1. "Default runner = the device he's typing on" → replaced by host-stays-until-offline-or-chip (D1 Q-4, Q-5, Q-15).
2. "Phone runs a reply only when no computer can" → replaced by full phone parity (D1 Q-1, Q-11; D2 Q-7).
3. "Rejected deliberately switch the host; handoff must be automatic" → reversed: switches happen only on explicit approval (D1 Q-15); automatic switching is rejected.
The reviewing session's own suggestion to limit the phone to folder-less chats was likewise rejected (D1 Q-11).

## Open items (nothing below is decided)

2. Never asked: how the 30 days of replaced file versions are shown.
3. Owed when that piece is designed: a plain comparison of Tailscale, tunnels and the router method.
4. `design.md` needs Destin's read once the above are settled.

## Research facts (checked against code at youcoded `8ffa0a421`, worker `0aed74e`, 2026-11-07)

- Today: each device keeps its own copy of a chat; whole files sync through the user's private GitHub repositories (`~/YouCoded/Personal/`, `~/YouCoded/Projects/<name>/`), readable by GitHub; conflicts produce `<id> (from <device>, <date>)` copies; 50 MiB per-file cap (25 of Destin's chats exceed it); the store is 9.2 GB of conversations plus 12 GB of history.
- Live link today: Tailscale-only remote server; only the phone has a client; no desktop-to-desktop; home wifi refused since the 2026-10-30 audit.
- Account service: Cloudflare Worker with a per-account `SyncGroupRoom` carrying only `space-updated` signals and session leases; free plan; audited 2026-10-30.
- Sleep: shutdown caps teardown at 6 s; a git push cycle is a dozen subprocesses and often 10 to 30 s; Android's power events never reach the engine.
- Phone: runs the same engine and sync, has synced project folders; lacks the assistant browser, Office, admin commands, folder picker, shared storage, local models, Python and friends; no per-reply wake lock; Doze cuts the network for all apps.
- Session context sizes on Destin's desktop: main transcripts median 1.1 MB (p90 11 MB, max 312 MB); helper transcripts 8.4 GB across 327 chats; saved long outputs 510 MB; undo history 488 MB across 537 sessions; memory 200 KB; plans 52 KB. Only the main transcript, names, tags and handoff notes sync today.
- Conflict copies analysed 2026-11-07: of 26, 13 identical, 10 subsets, 3 true forks.
- Prompt cache on Destin's plan lasts about an hour, not the 5 minutes the proposal assumed; compaction never shrinks a transcript (re-checked 2026-11-09 against 295 compactions, 125 automatic and 170 manual, in the Claude Code chats on Destin's desktop: every line before the compaction marker is still in the file; `youcoded/docs/cc-dependencies.md` says compact 'rewrites the SAME transcript file', which means same file and id, not a shorter file); newest-name-wins already exists; the phone "drops resume" bug the proposal cites was in code deleted 2026-10-14.
- Toolkits for a true mesh: Syncthing (model), Hyperswarm (JavaScript, runs in Node), Iroh (Rust, no official Node bindings). Android path untested for any of them.

## Stale documentation found (reported, not edited)

`docs/sync-spaces.md` (lines ~60, 117, 185), `docs/conversations.md` (~77-89), `docs/native-runtime.md`, the fact sheet and `.claude/rules/native-runtime.md:68` still describe the phone as lacking sync or projects, or describe handoff behaviour that no longer matches the code. Not corrected; outside the authorized scope.

## Constraints that bind every session on this work

- Read-only on application code until Destin approves a design and then a build.
- Never touch his live, built YouCoded app (`.claude/rules/live-app-safety.md`).
- Destin is not a developer: plain words, no jargon, pros and cons with a recommendation, what users will experience. Four or more questions go on a questions deck. Files are handed over as plain paths.
- Never suggest merging.
