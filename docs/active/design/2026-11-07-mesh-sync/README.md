---
status: active
date: 2026-11-12
topic: Chats on every device (YouCoded Mesh) — where the design stands, with every decision traced to Destin's words
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248
branch: session/mesh-sync-design (youcoded-dev); no app code changed
---

# Chats on every device — START HERE

This folder is the record of a design interview between Destin and a Claude session, held
2026-11-06 to 2026-11-12. **No application code was changed.** Everything below is either a
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
| `mesh-sync.questions-6.json` + `.answers.json` | Deck round 6, submitted 2026-11-11: helper transcripts, smaller pieces, phone awake. Only phone awake was decided. |
| `mesh-sync.questions-7.json` + `.answers.json` | Deck round 7, submitted 2026-11-11: catch-up, the 1 GB limit, the super-host, self-hosting, who pays. Written in answer to Destin's two comments on `design.md`. |
| `mesh-sync.questions-8.json` + `.answers.json` | Deck round 8, submitted 2026-11-11: what travels with a chat, setup sync, remote access, self-run relay. |
| `mesh-sync.questions-9.json` + `.answers.json` | Deck round 9, submitted 2026-11-12: what the 2026-11-11 checkpoint review found. Every item answered. |
| `mesh-sync.questions-10.json` + `.answers.json` | Deck round 10, submitted 2026-11-12: relay time limit, the files-changed note, and the cloud backup outline. |
| `mesh-sync.questions-11.json` + `.answers.json` | Deck round 11, submitted 2026-11-12: pairing devices that both hold data, backup frequency and which device backs up, the 15-second wait, cards. |
| `design.md` | **The full design document** (rewritten 2026-11-13): decided behaviour, today's code, architecture, contracts, tests before building, build order, validation after, and everything not decided. Written for a builder with no prior context. |
| `decision-outline.md` | The earlier outline `design.md` replaced. History only. |
| `preview/` | Contact sheets of the decks, for checking rendering. |

Serve a deck for Destin with `python3 scripts/ui-review/review-cards.py serve <spec.json> --no-build --timeout 1440` from the workspace root; put the printed link in chat as the last line. Never rebuild an answered deck.

## Decisions, each traced to Destin's words

Format: rule — source. "D1 Q-5" = deck round 1, step Q-5. Quotes are from the answers files; the D1 Q-5 note is garbled at both ends in the file and is tidied here. Round 3 was never submitted, so "D3 … (provisional)" is supporting colour only, never the sole source.

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
- Keepers (something always on that holds sealed lines): build to offer both the user's own always-on device and an optional YouCoded relay. Which is built first was undecided here (decided in round 5: relay first); he asked for architecture, cost and speed of each. — D4 Q-2: "we should build to offer either a or c … if users cont have a device or just prefer, they can use youcoded relay".
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
- Helper transcripts, not decided in this round (decided in round 8 Q-1). — D6 Q-1: "idek what option A means or how that would work? the primary issue with helpers is that active sessions may rely on them and their transcripts to copmlete work, so syncing a conversation without its help transcripts would directly lead to significant lost work/effort."
- Smaller pieces that travel, not decided in this round (decided in round 8 Q-1). — D6 Q-2: "i think we're underthinkging/undersonsidering this. with option a, what would that actually look like for a typical session? how would we determine what consistutes a syncable plan vs any other normal document? i'm fine to drop images and such. just want to understand what a session/chat actually needs to continue working on a range of project types across devices"
- Measured 2026-11-11 on this session's own chat (Claude Code, desktop): the main chat file holds each helper's task and, once it finishes, its final report; the helper's own working file (1 to 2 MB each here) is needed only to see its steps or to send that helper a follow-up. Plans sit in Claude Code's own `~/.claude/plans/` folder, outside any project. Memory, skills and settings are backup-only today (`youcoded/docs/sync-spaces.md`), not synced between devices.

### Round 7 (answered 2026-11-11)
- The relay keeps, with no time limit, one small note per chat: its latest line number and which device has it; no words of the chat. A device then knows for certain when it is behind. — D7 Q-1: yes.
- Continue here on a chat this device knows is behind: allowed, named honestly. Button "Continue from here as a new version"; the other device's newer lines stay as the other version. — D7 Q-2: "fork-knowingly".
- At the 1 GB limit the relay releases whole chats, least recently used first; host shows "Relay full. 3 older chats will reach Phone when both are on." — D7 Q-3: "release-oldest-chat".
- A one-time prompt offers to remove a device not seen for 30 days; nothing is removed without a yes. — D7 Q-4: yes.
- Super-host: a complete YouCoded with no window, pairs like any device, holds everything with no limit, hosts chats, catches devices up, passes live words, openable in a browser; it holds keys. — D7 S-1: yes.
- A super-host lives on a device at home. A rented server was NOT picked. — D7 Q-5: picked "home" only.
- Payment: no decision; free for everyone at the fixed limits for now. — D7 Q-8: "decide-later", note: "i think i'd definitely be leaning toward option a, with some support from donations, but idk. i think for the time being it's just going to be free for everyone at our current fixed limits, and we may reopen the cost/payment conversation after i begin actually encountering issues"
- Reaching a home super-host from outside, not decided in this round (decided in chat 2026-11-11). — D7 Q-6: "i think i'm a bit confused as to where this begins to overlap or replace our existing remote access system? and the pros/cons of alternative options for how this superhost thing would work? i think the premise of the super-host offering is that it should allow self hosting and also reduce load/strain on our servers/relay when possible."
- Self-hosted relay, not decided in this round (dropped in round 8 Q-4). — D7 Q-7: "i'm extremely confused".

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
- Browsing replaced file versions: he answered "confused."; closed by the next entry.
- On keeping replaced file versions for 30 days, Destin challenged the premise: "i thought basically everything was backed by git? doesnt that offer the version history already basically? seems like we're potentially overengineering or recreating systems that already exist within the app, and also introducing some additional fragiility, but i could be mistaken?" Checked: he is right. Every synced project already has a hidden version history on each device (`<project>/.youcoded/sync.git`, `youcoded/docs/sync-spaces.md`), not only on GitHub. Proposal put to him in chat: keep that history as the file version store and conflict handler, and change only the carrier from GitHub to the locked device-to-device system. Approved: "okay, that sounds good". This replaces the round 5 wording "each device keeps replaced versions for 30 days", and closes the question about browsing replaced versions (nothing new is built for it).

### Decisions from the 2026-11-06 proposal that Destin later overturned
The proposal's section 1 lists four "decisions so far". Three no longer hold:
1. "Default runner = the device he's typing on" → replaced by host-stays-until-offline-or-chip (D1 Q-4, Q-5, Q-15).
2. "Phone runs a reply only when no computer can" → replaced by full phone parity (D1 Q-1, Q-11; D2 Q-7).
3. "Rejected deliberately switch the host; handoff must be automatic" → reversed: switches happen only on explicit approval (D1 Q-15); automatic switching is rejected.
The reviewing session's own suggestion to limit the phone to folder-less chats was likewise rejected (D1 Q-11).

## Checkpoint review, 2026-11-11 (Destin asked for it)

A fresh reviewer checked `design.md` against every answers file. Fixed in the documents: stale statuses, missing rows and rules, overstated sources. Found and NOT decidable without Destin, all asked on round 9 (answers in the next section):
- Word by word is not true for Claude Code chats today (D1 Q-14 was answered before this was known).
- How much each device stores: round 7's page text said a full copy everywhere; D1 Q-13 picked "list-then-open" with "should work exactly the same as pc".
- Projects: D2 Q-8 picked "everything everywhere"; D5 N-5's note implies turning sync on per project per device.
- Closing the host: his words require replies on "the other devices"; the draft had added "or a keeper". Unsent file changes at quit were never covered.
- The 1 GB / 48 hours were agreed for chat lines only; helper files and project files were added later.
- After GitHub chat sync stops, chats have no off-device copy until card 241. The assistant's chat remark that the relay would serve was wrong: the relay holds lines for 48 hours and is not a backup.
- Lost or stolen devices; two devices taking over at once; whether "new version" is a fork or a split; notices stacking and his round 1 "may be best to wait" line; whether upload-on-sleep (D1 Q-10) is replaced by line-by-line sending.
- Card 242 was filed beside card 232 although D5 S-6 approved widening 232 (232 was mid-build).

Follow-ups he asked for, answered in chat but not recorded before now: how other services handle holding messages (WhatsApp 30 days undelivered, by policy; iMessage 30 days, per a blog only; Signal unconfirmed); cost of an own-device keeper (a Raspberry Pi about $60 to $100 once, or nothing for a computer already owned; a rented server about $2 to $6 a month, not picked).

## Round 9 (answered 2026-11-12)

- Each device has one storage setting: keep everything, or keep recent chats and fetch the rest on opening. Computers and a super-host start on "keep everything", phones on "recent". — D9 Q-1: picked "per-device-default". Replaces D1 Q-13's pick and round 7's "full copy everywhere".
- Projects are listed everywhere and downloaded to a device when sync is turned on for it there. — D9 Q-2: picked "turn-on-per-device". Replaces D2 Q-8's "everything".
- A watching device shows a chat as its host does; Claude Code chats in blocks, not word by word. — D9 S-1: yes.
- Quitting the host with no other device on: reaching the relay or super-host counts as sent. — D9 Q-3: picked "keeper-counts".
- Quitting with unsent project file changes: send first for a few seconds at most, then quit and say so. — D9 Q-4: picked "brief-wait", with the note: "kinda confused about this flow still. how would another device learn if it may not have newer files from the host? and how would we reconcile". Answer owed.
- GitHub chat sync is not stopped until the cloud backup choices exist. — D9 Q-5: picked "backup-first", with the note: "i think our final design should include at least a general outline for the future plan for cloud data backup. what do we currently offer as far as google/icloud go, how does that differ from the existing github/sync implementation, the new implementation we're building, and how should we consolidate/reorganize cloud backups after the relay/mesh system is built?"
- All devices lost means chats without a cloud backup are gone; a stolen device keeps what it had. — D9 S-2: yes, with the note: "we need to ensure users have a mechanism to set up and recover from their own cloud backup tho (drive/icloud/github)".
- The relay's 1 GB and 48 hours cover everything waiting on it; pass-through does not count. — D9 S-3: yes, with the note: "can you explain the benefit of keeping the 48h limit in place when hte 1gb limit exists? could it make more sense to do 30d 1gb? would it cost us the same roughly?" Answer owed; the time limit is open again.
- Two devices taking over at once: first heard wins, second is told "Phone just took over this chat". — D9 S-4: yes.
- "Continue from here as a new version" is a fork made on purpose. — D9 S-5: yes.
- Notices stack in one box; his round 1 "may be best to wait" line is restored. — D9 S-6: yes.
- Nothing special at sleep; replaces D1 Q-10's upload-on-sleep. — D9 S-7: yes.
- What travels with a chat (round 8 pick) confirmed now that "folder" is explained. — D9 S-8: yes.
- Anything else missed: "don't know", no note. — D9 Q-6. Pairing screen, relay abuse limits and the Nov 5 conflict copies stay with the build unless he says otherwise.

## Round 10 (answered 2026-11-12)

- The relay holds waiting data 30 days, not 48 hours; the 1 GB limit stays. — D10 Q-1: picked "thirty-days".
- The host sends a tiny files-changed note per project; the relay keeps the latest. — D10 Q-2: picked "send-note", asking: "why is there a 15s dleay on the file changes?"
- One backup feature: Google Drive, iCloud or GitHub, same contents and same restore. — D10 Q-3: picked "one-backup".
- A backup holds everything, with switches. — D10 Q-4: picked "all-with-switches", note: "switches for individual/specific projects. also may want to think this through a bit more thoroughly and how to optimize/compress storage or deal with long-term chat accrual or improve backup/restoration flows. but this is somewhat tangential"
- Not locked is preselected. — D10 Q-5: picked "unlocked-first", note: "just with honest warnings and confirmation when a user utilizes unencrypted backups"
- Backup frequency NOT decided. — D10 Q-6: "probably depends on the service? i'd imagine there was a reason we decided on once a day initially, so i wouldnt want to change this without consideration. it should be as frequent as plausible without financial/performance/other costs"
- A new device offers pairing or restore from backup. — D10 S-1: yes, note: "i am realizing we are also going to need to think through what we offer to users who try to pair two existing devices with their own unique histories/projects/etc. probably need to offer confirmations and prefernces and such,as we'd need to figure out if the user wants to cancel, merge all data from both devices in a 2-way sync, delete some data, etc"
- Single-device users are asked to set up a backup at the switch. — D10 S-2: yes.
- "A device only offers the choices that work on it", and filing the three faults as cards: NOT approved. — D10 S-3: "we should probably be a bit more creative in designing ways to get backups to work more consistently across all devices, and also investigate/explore backups hosted by youcoded at some point in the future"
- Checked in code 2026-11-12: the daily backup is a whole dated copy per day (`sync-service.ts`, `sync-spaces/daily-backup.ts`); an earlier 15-minute overwrite loop was deleted. The 15-second pause (`sync-spaces/engine.ts`) has no recorded reason; it bundles a burst of edits into one send, and a GitHub send takes 10 to 30 seconds.

## Round 11 (answered 2026-11-12)

- Pairing two devices that both hold data: show what each holds; combine everything, or cancel; nothing deleted. — D11 Q-1: picked "combine-or-cancel", note: "need to be weary of potential data loss or duplication".
- Same-named project on both: ask "Is this the same project?" per clash. — D11 Q-2: picked "ask".
- Backup sends only what changed, as often as each cloud allows, at least daily. — D11 S-1: yes.
- Any one device that can reach the cloud backs up for all. — D11 Q-3: picked "any-device".
- Unlocked backup: confirmation with the example warning. — D11 S-2: yes.
- File changes wait about 2 seconds, not 15. — D11 Q-4: picked "short".
- File as cards: the three backup faults, YouCoded-hosted backups, backup storage and long-term growth. — D11 Q-5: all three, note: "some of these may already exist or have related items. please group related features together on cards if it makes most sense to build things at the same time".

## Chat, 2026-11-12

- GitHub size: wait; no fresh start now. Build order, first statement of it: the mesh is built first, the backup rebuild follows and carries any GitHub changes. — "okay we can wait on github. we should finish everything else in the mesh build first, then follow-up with the backup rebuild including any needed github changes"
- The two systems never sync side by side: GitHub two-way chat sync is switched off when the mesh is deployed; uploading to GitHub as a backup continues. This refines D9 Q-5. — "well we should switch github syncing off at the same time hte mesh is deployed. we can continue backing up to github, but we absolutely should NOT allow both systems to continue trying to sync simultaneously. that's bound to break a bunch of htings."
- Sync carries chats whole; long-term backups are slimmed. — "i think for syncing we should keep the full chat with images and such, but the long-term backups to drive/icloud/github should drop the images and duplicate content"
- For phasing: in the period before the backup rebuild, the GitHub upload is still unslimmed, so that repository keeps growing; which device does the uploading in that period is not settled.

## Open items (nothing below is decided)

1. Owed when that piece is designed: a plain comparison of Tailscale, tunnels and the router method.
2. Never measured: real relay usage per user; whether YouCoded runs on a Raspberry Pi.
3. Slimming (from `docs/active/plans/2026-11-02-slim-synced-chats.md`, card 98): decided in chat 2026-11-12, backups only.
   Resume test run 2026-11-12 on his word ("yeah lits test this out"): a slimmed throwaway chat resumed in Claude Code 2.1.323 and edited a previously read file without re-reading; the assistant then said it had never seen the picture and withdrew its earlier description of it. Test files: session scratch folder, not kept.
   GitHub fresh start (card 98, approved 2026-11-12: "yes. just manage this yourself wiht a subagent or something"): researched read-only, NOT carried out. Each device would merge the replaced history with its own (`git-transport.ts:896`, `--allow-unrelated-histories`) and push the old history back, so it cannot be done safely without either a manual step on all four devices or a small app change. GitHub reported 4.28 GB the same day; its documentation describes no automatic block at 5 GB, only that Support may get in touch.
4. Destin's read of the finished `design.md`; build order only after he agrees the design is complete.

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

## 2026-11-13: second review of design.md, and round 12

Destin pasted a review from another session that read `design.md` cold (not checked against
this record or the code). Its points were checked against the design and hold.

- Fixed in `design.md` without a new decision, because his earlier answers already settle
  them: the stale intro; "every project appears everywhere" (now D9 Q-2's wording); "the
  only difference is a chip" (section 9's limits named); pictures (pictures inside chat
  lines travel, only the scratch copy of pasted images does not; marked My reading); the
  lock promise scoped to sync, with the unlocked backup named; what the middle can see
  (sizes, counts, times; marked My reading); how the divider is kept beside the chat file
  (marked My reading); payment and the relay-deletion line marked Open; section 12b
  renumbered.
- Technical guards added to section 13 (my calls, not user-facing): prefix check on every
  catch-up, fingerprint in the per-chat note, one judge for simultaneous takeover.
- Everything needing his decision is on deck round 12 (`mesh-sync.questions-12.json`),
  15 questions and 6 statements. Not yet answered.

## 2026-11-13: round 12 answered

Answers file: `mesh-sync.questions-12.answers.json`. Picks, with his notes verbatim:

- Q-1 one clock, 30 days everywhere. Note: "with exception of full 1gb relay storage obviously"
- S-1 yes (relay deletes once every device has the lines, or at 30 days). S-2 yes (honest
  limit of "nothing is lost").
- Q-2 deleted everywhere, 30 days in Recently deleted. Q-3 approve permissions from any
  device. Q-4 unsent message stays in the box. S-3 yes (start only on a device that is on).
- Q-5 allow two hosts in one project with no notice. Note: "shouldn't git resolve any
  encountered duplication or nah? how will users notice duplicate file versions?" (answered
  in chat; behaviour read in `youcoded/docs/sync-spaces.md`).
- Q-6 one at a time, as now. Note: "this is confusing. why would this be tedious? it should
  be any more difficult than resuming a normal conversation?"
- S-4 yes, S-5 yes.
- Q-7 other, undecided. Note: "what? this is confusing? it seems like this should be
  different dependent on whether you're a 1-device no-sync user or a user who does have
  multiple devices? and what marks are you talking about?"
- Q-8 everything, always. Note: "we shuold probably add a card for eventual
  configurability" → card 258.
- Q-9 any device after its own unlock. Q-10 QR, or typed code. Q-11 no sign-in at launch.
  Q-12 older device reads and watches, must update to continue. Q-13 relay as fallback for
  super-host users.
- Q-14 keep GitHub one-time restore through the gap. Q-15 settle obvious cases quietly.
- S-6 other, undecided. Note: "this seems a bit janky. i think we need to think through the
  really data/logic flow a bit more here. would my \"only device\" even have a sync setting
  like recent if i'm not using sync on other devices\" does it matter if older data exists
  on a specific device after the first sync or two? wouldnt we just be sending minor
  updates/additions?"

## 2026-11-13: the full design document, three review rounds, round 13

Destin, in chat: "i would like you to conduct a few rounds of review/refinement to help turn
this current design (which reads as more of a rough outline/decision history) into a
slightly more focused and comprehensive design document. more detail on how the various
systems/subsystems interrelate and interact, where the seams are, what needs
testing/evaluation before build, possible performance/ux considersations that will need
validation after the build is complete, etc. the \"build order\" discussion you mentioned can
be folded into this. i want a single document that a new agent with absolutely no prior
context could follow end-to-end and get the feature/functionality we've described and
decided on in our various rounds of decks"

- Three read-only researchers mapped today's code (youcoded `e73b41347`, worker `830ff8e`).
  Findings that affect his decisions: no upload-only GitHub mode exists and chats ride the
  two-way Personal repository; no chat can be deleted today; no "listed but not downloaded"
  project state exists.
- `design.md` rewritten as the full document; the old outline is `decision-outline.md`.
- Review round 1 (cold builder; fidelity and code facts), round 2 (cold builder; failure
  modes and security), round 3 (verification). Each round's findings were applied. None
  changed a decision of his. They changed engineering: tails set aside and settled by the
  old host's `released` entry; a control log ordered by what entries have seen; host
  reservations; removal cut-offs; relay release notices and "a keeper's acknowledgement
  never lets a device clear its only copy"; a fixed file-clash rule so equal devices
  converge; per-device GitHub backup branches for the interim.
- Tags corrected after the fidelity review: D10 S-2 (one-device backup prompt) is now Open
  because its premise changed; "relay stores nothing with a super-host" is the question's
  description, not his pick; the picture rule is marked My reading; D10 S-3 is listed Open.
- Decisions the reviews surfaced are on deck round 13 (`mesh-sync.questions-13.json`): 7
  questions and 12 statements. Not yet answered.

## 2026-11-13: round 13 answered

Answers file: `mesh-sync.questions-13.answers.json`. Notes verbatim:

- S-1 yes (quit warning by number of devices). S-2 yes (any device backs up; no storage
  setting for one device).
- Q-1 a device switches when it is updated. "it should switch to github 1-way backup.
  whether a second device is paired has no bearing on the fact that we should stop offering
  github 2-way sync"
- Q-2 other: "this is confusing as fuck brother. why are you making this so complicated. i
  feel like the prior discussions and deck answers we've gone through should be more than
  sufficient for this to be clear. ALL USERS will move to 1-way backup that doesnt give a
  damn whether you utilize github, icloud, or google drive. all cross-device live syncing
  happens through the new system. the framing of this question make literally no sense.
  what are you asking." Read as: at the switch everyone's backup is one-way, whichever
  service; no service is treated specially.
- Q-3 relay on from first pairing. Q-4 erase an unused set after 90 days. Q-5 unlock to add
  a device, and other devices are told.
- S-3 other: "what?" Not decided; to be explained plainly and asked again.
- S-4 yes. Q-6 "end-to-end encrypted" from launch: "but we will need to conduct extensive
  reviews/audits of our own. based on external best-practices"
- S-5 to S-9 yes. Q-7 two hours. S-10, S-11, S-12 yes.

## 2026-11-13: fourth review (pasted by Destin), engineering fixes

A further session read `design.md` cold. Checked against the code and applied where it is
engineering: the chat store always keeps its own bytes (Claude Code deletes old transcripts
after `cleanupPeriodDays`; `youcoded/docs/conversations.md:9, 80`); working files are never
moved while a process may write them; chats started in a terminal cannot be chip-switched;
a removal's cut-off covers the device list too, with a rule for two devices removing each
other; device names are sealed from the relay; the Personal space is always combined at
pairing and a project gets an id of its own; helper files copy like lines; pausing a
running reply on wake (T19); an audit of everything that reads chat files (T20); a hard
rule that mesh dev instances use a separate home folder; a "Check sync" tool in the app.
Left for Destin: U9, a reinstall prompt (O12), a staged release (O13). Conditional on test
results: O14, O15.

## Chat, 2026-11-13 (after the fourth review)

- A device already paired with others: "i'm kinda confused about why this is
  complicated/different? i feel like we're overthinking/overengineering this?" Recorded as:
  pairing simply moves the device to the new set; no group-joining feature, no "leave
  first" step. (My reading of the simplest behaviour.)
- Reinstalls: "yeah i want to do this in the smartest/simplest way possible. it should be
  pretty simple to identify devices? we already identify unique devices with a device id
  for our analytics." Recorded as: the mesh uses the existing per-machine id
  (`getMachineIdentity`); the same id pairing again replaces its old entry with no question.
- Release: "this should not be staged or phased. we should just fix this all at once and
  swap everyone in a single release. we only have like 5-10 users, so i don't want you to
  overcomplicate this"

## Chat, 2026-11-14

- Pairing a device that is already paired with others JOINS THE TWO SETS; it does not move
  the one device. This replaces my 2026-11-13 reading, which he rejected: "this sounds
  worse. i feel like there is no additional difficulty from pairing two \"sets\" of devices
  as opposed to just pairing a singular new device into an existing \"set\". why would
  merging the two sets be hard? it seems like that would honestly be the simpler and less
  convoluted behavior, since hte device being paired would already have the downloaded data
  from the other sync network and try re-uploading to the new network anyway?"
- Reinstalls by the existing machine id: "ok". One unstaged release: "ok".

## 2026-11-14: end-to-end contradiction read, and a fifth review

Destin asked for one clean read-through for contradictions. A fresh reader and the
designing session each read the whole document; findings merged and applied (stale wording
left by earlier edits: "named testers", the restore rule stated two ways, the clash rule
called "unchanged", walk-through D against `decide`, risk numbering, test order, dates).
He also pasted a fifth review. Applied as engineering: at identical copies the device that
last ran a chat hosts it; a hold on every file change and command from sleep until the
wake check; removal never cancels work another device already holds (`witness`); the
clash copy's name is read from the commit so every device writes the same name; mutual
removal settled by seniority only; the mesh id is a hash of the machine id; delete tells
the relay to drop; a chat over the relay limit travels device to device; T21 (read-only
comparison of real chat copies) and a run-first list; a trial on his real devices before
release, on his say. Left for him: O16 (chats in folders that are not synced projects).
