---
status: draft
date: 2026-11-12
topic: Chats on every device (YouCoded Mesh) — the design, written from Destin's answers
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248
---

# Chats on every device — the design (draft for Destin's read)

Every rule here comes from an answer Destin gave. The source is in brackets: "D4 Q-6" means
deck round 4, question 6; "chat" means a dated chat message. `README.md` in this folder holds
the quotes. Where I had to fill a gap myself, the line starts with **My reading** so it can be
struck. Lines starting **Open** are NOT decided. A checkpoint review on 2026-11-11 found
lines unsupported by, or in conflict with, his answers; he settled them on deck round 9
(2026-11-12), marked "D9". Nothing here is built. Build order is not part of this document.

## 1. The goal

It feels like claude.ai, but your own devices are the server, and nothing in the middle is
required or trusted. [D4 S-1]

"Mesh" means four things, not a networking technology [D4 S-2]:

1. Your devices pair with each other.
2. Keys live only on your devices, never on a server or in GitHub. [chat 2026-11-08]
3. Any device can catch another one up.
4. Whatever sits in the middle cannot read anything and can be swapped for another.

It is for every user's devices, any mix of Windows, Mac, Linux and Android. [D1 Q-2]

## 2. What you see

- **One list of chats on every device.** Every project appears everywhere. [D2 Q-8]
- **One device hosts each chat.** Every other device shows it live, word by word, and you type
  into it as if it ran there. The only difference is a chip in the status bar naming the host.
  [D1 Q-4, Q-14; D2 S-2]
- **A watching device shows a chat exactly as its host does.** YouCoded's own chats appear
  word by word. Claude Code chats appear a block at a time today, even on the host, so a
  watcher sees the same blocks at the same moments. Making Claude Code chats word by word
  is separate work on the app, not part of this design. [D9 S-1, replacing the blanket
  "word by word" of D1 Q-14] Sections 6 and 9 list the other differences for a watcher.
- **The host never changes by itself.** It changes when you tap the chip, or when the host is
  offline and you tap Continue here. [D1 Q-5, Q-15]
- **You can start a chat on one device that runs on another.** [D4 Q-15]
- **The phone is a full host,** equal to a computer. Features it still lacks are named in the
  notice until they are built. [D1 Q-1, Q-11; D2 Q-7]

## 3. How a chat travels

- **One copying system.** The host sends each new line as it is written. A device that was
  away asks for "everything after the last line I have". [D4 Q-1]
- **How much each device stores is one setting per device:** keep everything, or keep
  recent chats and fetch the rest on opening. It works the same on every device; only the
  starting choice differs. Computers and a super-host start on "keep everything", phones on
  "recent". Every chat is listed everywhere either way. On "recent", an older chat cannot be
  read offline until it has been opened there once. [D9 Q-1, replacing D1 Q-13's
  "list-then-open" and round 7's "full copy everywhere"]
- **Checked fact:** chats only ever grow. Destin's desktop holds 295 compactions in Claude
  Code chats; in the 25 chats sampled, every earlier line was still in the file. Native chats
  add a marker line when they compact (read in the code, 2026-11-09). So "everything after
  line N" is safe for both. He approved a throwaway test [D4 Q-16]; existing chats were
  checked instead, which spent none of his allowance.
- **What travels with a chat:** its lines, plus the files the app saved for that one chat in
  its own hidden storage: each helper's working file, long outputs the assistant saved, and
  the chat's plan and to-do list (the plan is kept in Claude Code's own plans store and is
  matched to the chat that wrote it). Documents inside a project are project files. A chat active in the last 48 hours is complete on every device. An older chat fetches
  those files when it is opened on a device; if the only device holding them is off, the
  notice says the helpers' reports are kept but unfinished helper work cannot be continued.
  Pasted images and undo history do not travel. [D8 Q-1; his note asked what "folder" meant;
  explained in chat 2026-11-11; confirmed D9 S-8]
- **The assistant's setup does not travel** in this design (skills, plugins, connected
  tools, global instructions). Card 248. [D8 Q-2]
- **Everything is locked end to end.** Only your devices can read it. [D2 Q-2]
- **A new device joins by pairing with one you already have.** No account is needed for sync;
  our relay may ask for a sign-in to stop abuse. [D4 Q-4]
- **Devices on the same wifi talk directly,** with the same locking as every other path, so
  home use needs no relay. Others on a shared wifi can see that a YouCoded device is there,
  nothing more. This path needs its own security review before release. [chat 2026-11-11:
  "okay that's fine." to the option as described, including both cautions]
- **A home super-host is reached from outside** through our relay by default, or through the
  user's own front door. [chat 2026-11-11: "i think this is generally fine?"; he wants the
  front-door methods compared before that piece is designed]
- **Removing a device locks it out** and frees the chats it was hosting to be continued
  elsewhere. [D4 Q-9]

## 4. Keepers: what holds lines while devices sleep

A keeper is something always on that holds locked lines it cannot read.

- **Both kinds are offered:** an optional YouCoded relay, and your own always-on device (a
  desktop left on, a Mac mini, a Raspberry Pi). [D4 Q-2]
- **The relay is built first.** [D5 Q-1]
- **No keeper at all is a supported way to run:** devices catch each other up whenever two
  are on together, with no service of ours. [D2 Q-1 "the dream"; D8 Q-4 as described]
- **The relay is a waiting room, not an archive.**
  - It holds a chat's lines until 48 hours after the last line was added to that chat. An
    active chat stays fully held. [chat 2026-11-10]
  - Lines are deleted sooner, once every device has them. [as described to him in chat
    2026-11-10; not his own words]
  - It holds at most 1 GB per user. [chat 2026-11-10]
  - The 1 GB and the 48 hours cover everything waiting on the relay: chat lines, helper
    files and project file changes. Data passing straight through while both devices are on
    is not stored and does not count. So a large project reaches a new device only while a
    device that has it is on. [D9 S-3]
  - **Open:** he asked whether 48 hours is still worth having beside the 1 GB limit, or
    whether 30 days would do. [D9 S-3 note]
  - Anything older, a device gets from your other devices when both are on.
  - It keeps, with no time limit, one small note per chat: the latest line number and which
    device has it. No words of the chat. So a device knows for certain when it is behind.
    [D7 Q-1]
  - At 1 GB it releases whole chats, least recently used first. The host shows: "Relay full.
    3 older chats will reach Phone when both are on." Nothing is lost. [D7 Q-3]
- **Catching up.** Whenever two of your devices are on together they compare every chat and
  the one ahead fills in the other. Any device can do this, not only the host. [D4 S-2,
  third property; mechanics as described on round 7's page text]
- **A device known to be behind** can still read the chat as far as it has it. Continuing
  there is allowed under an honest name: "Continue from here as a new version". The notice
  is exact, for example "Desktop has 120 newer lines and is offline", and the chat list marks
  the chat as waiting. [D7 Q-1, Q-2]
- **A device not seen for 30 days** triggers a one-time prompt on your other devices offering
  to remove it. Nothing is removed without a yes. [D7 Q-4]
- **Your own device as keeper is a super-host:** a complete YouCoded with no window, on a
  device at home. It pairs like any device, holds every chat and project with no time or
  size limit, hosts chats, catches devices up, passes live words, and opens in a browser. It
  holds your keys, so it must be hardware you trust. A rented server was offered and not
  picked. [D7 S-1, Q-5] Its purpose, in his words: "allow self hosting and also reduce
  load/strain on our servers/relay when possible" [D7 Q-6]. With a super-host our relay stores
  nothing for that user.
- **Payment** is undecided; the relay is free for everyone at the fixed limits. He leans
  toward free at the basic limits with bigger ones paid, plus donations. [D7 Q-8]
- **Cost of the relay** (estimate from Cloudflare's price list and a guessed usage, not
  measured): free today and up to a few hundred heavy users; about $25 a month at 1,000.
- **Cloud backup comes before the switch.** GitHub chat sync is not stopped until the cloud
  backup choices exist, so no user is ever without a copy off their own devices. The user
  chooses whether chats are backed up to a cloud at all and whether that backup is
  passphrase-locked. Card 241. [D4 Q-3; D9 Q-5] See section 12.

## 5. When the host goes away

**Staying awake.** A computer holds itself awake while a reply it is running is unfinished,
and lets go when it ends, with a hard limit so it can never stick. Closing a laptop lid still
sleeps it. [D4 Q-5; D1 Q-10: no permanent keep-awake]

**Going to sleep.** Nothing special happens, because every line was already sent as it was
written. One exception: a file change from the last 15 seconds may not have gone; it sends
when the device wakes. [D9 S-7, replacing D1 Q-10's upload-on-sleep]

**A phone as host.** The phone stays awake for each reply with the screen off. A setting,
off by default, exempts the app from Android's battery limits for users who host from the
phone; it explains the battery cost. [D6 Q-3]

**Closing the host.** [D4 Q-6; D5 S-1]
- The normal close menu appears. You set flags or mark chats complete.
- A chat marked complete closes on every device.
- Otherwise the app quits at once, as long as every finished reply has reached your other
  devices. It does not wait for a running reply; that half is dropped. (He picked the option
  labelled "finish then quit" but his note said not to wait; the note is followed.)
- When none of your other devices is on, reaching the relay or your super-host counts as
  sent. Your other devices collect the lines when they wake. [D9 Q-3]
- Unsent project file changes are sent first, for a few seconds at most. Then the app quits
  and, if anything is left, shows the same "some chats may not have synced" line. [D9 Q-4]
- **Open:** how another device learns that its files may be older than the chat describes,
  and how that is put right. [D9 Q-4 note]
- The chat stays in the list on other devices: host disconnected, host it here?
- Closing while offline still quits, and says: "Offline - some chats may not have synced."
  [D5 Q-5]

**Taking over.** [D1 Q-8, Q-9; D2 Q-6; chat 2026-11-10]
- Tapping Continue here adds a divider to the chat, built like today's "Model switched to …"
  divider. You see it, and the assistant can read it. (Example wording, mine: "Now hosted on
  Phone".)
- The unfinished reply is dropped. The chat carries on from the last finished one.
- When the old host returns, it reads the divider, knows it is no longer the host, and
  discards its unfinished half.
- A host waking from sleep checks for that divider before letting a reply carry on.
- Files an unfinished reply had already changed stay changed; the notice says so.
- YouCoded keeps the divider beside Claude Code's own chat file, never inside it. (Round 5
  asked about "no separate record"; this caution came from the review he requested and was
  put to him in chat 2026-11-10 before he said yes.)
- If two devices tap Continue here at the same moment, the first to be heard (by the relay,
  the super-host or the other device) becomes the host. The second shows "Phone just took
  over this chat" and stays a watcher; a message typed there goes to the new host. If
  neither can reach anything, it is the two-versions case in section 7. [D9 S-4]

**With no connection at all,** Continue here still works, with a warning. [D5 Q-4] This is the
one case where two versions can arise; see section 7.

## 6. The Continue here notice

[D5 N-1 to N-10; chat 2026-11-10] When several situations apply they appear together in one
notice, not one box after another. When the chat is really using something this device
lacks, the notice adds: "If this chat needs hardware or files that exist only on Desktop, it
may be best to wait." [D9 S-6; the line is his from D1 Q-8]

| Situation | What it says |
|---|---|
| You tap the chip, host is on | "Host this chat on this device instead of Desktop?" The switch waits for a running reply to end. |
| Host off, nothing missing | "This chat was hosted on Desktop, which is offline. Continue here?" |
| Host went off mid-reply | "Desktop went offline partway through a reply. If you continue here, that unfinished reply is dropped and the chat carries on from the last finished one." Plus: files it already changed stay changed. |
| This device may be behind | "Desktop is offline and may have newer messages or files than this device. Continuing here could create a second version." |
| This device is known to be behind | "Desktop has 120 newer lines and is offline." Button: "Continue from here as a new version". [D7 Q-1, Q-2] |
| Project folder not here | Stops to ask: turn on sync for this project and fetch it first (shows what is missing, why, and the storage needed), or continue talk-only. The project then syncs continuously on this device. [D2 Q-11; D5 N-5] |
| Sign-in missing here | Stops to ask. A Claude Code chat waits until you sign in to Claude. A native chat shows the model picker. [D4 Q-12; D5 S-2] |
| Features this device lacks | "You may continue here, but this chat will not have: …" naming only what is really missing. [D1 Q-8] |
| On the old host, when it returns | "This chat continued on Phone while this computer was offline. Its unfinished reply here was discarded." |
| Two versions found | "This chat was continued on both Desktop and Phone while they could not reach each other. There are now two versions. Keep both, or archive the older one?" |

A continued chat otherwise keeps its exact model, provider and project settings. [D4 Q-12]

**Talk-only.** A chat opened without its folder can talk but not touch files. The note saying
so is added at the end of the chat; nothing earlier is cut or edited. [D4 Q-11; D5 S-3]

## 7. Duplicates and forks

- **Accidental duplicates are prevented** by the takeover divider: every device learns who
  hosts from the chat itself. [D1 Q-6; chat 2026-11-10]
- **The one case that cannot be prevented:** two devices continue the same chat while neither
  can reach the other or a keeper. It is caught when they meet, shown, and the older version
  is offered for archiving. [D2 Q-12; D5 Q-4]
- **Deliberate forks are equals,** grouped together in the resume browser. A way to fork or
  duplicate a chat on purpose exists. [D2 Q-12; D1 Q-6, Q-7]
- **"Continue from here as a new version" is a fork made on purpose:** both versions stay,
  grouped together, with no archive prompt. [D9 S-5]
- A better screen for managing versions is card 243. [D5 N-10]

## 8. Project files

- **Files travel on the same locked system as chats,** through the same keepers. GitHub
  becomes an optional backup. [D5 Q-6]
- **The existing hidden version history stays.** Every synced project already keeps a full
  history on each device. It remains the version store and the handler for a file changed on
  two devices (both copies kept, never a silent overwrite). Only the carrier changes: device
  to device, locked, in place of GitHub. [chat 2026-11-11: "okay, that sounds good"]
- This replaces the earlier idea of keeping replaced versions for 30 days. Nothing new is
  built for browsing old versions.
- Carried over from today's system (read in `youcoded/docs/sync-spaces.md`, and told to him
  in the chat proposal he approved): huge and generated folders are skipped; secrets never
  leave the device; a file changed on two devices keeps both copies.
- File changes go out about 15 seconds after the last edit or every 2 minutes, as today, not
  word by word. At takeover the notice may say files are still arriving.
- Known weaknesses carried over: the history grows without limit on every device, and has
  been damaged by power loss before (a repair exists).
- Chats do not use this history; they move to the line-by-line system in section 3.
- **Every project is listed on every device, and downloaded to a device when sync is turned
  on for it there,** once, from the Continue here notice or the project list. It stays in
  sync from then on. If the only device holding the project is off, it cannot be fetched
  until that device is on. [D9 Q-2, replacing D2 Q-8's "everything everywhere"]

## 9. A device watching a chat

- It has the same limits a phone has today: no assistant browser, no Office documents, no
  image paste, no dragging files in. [D4 Q-14]
- The limits are kept in one central list, and each shows: "X is not currently supported from
  a remote client." [D5 S-4]

## 10. Alerts

Today's in-app notifications are enough for this work. Alerts across devices and customisable
notifications are card 242. [D4 Q-13; D5 S-6] He approved widening card 232; because 232 was
already being built, 242 was filed beside it and linked instead.

## 11. What gets replaced

Today's remote access is replaced inside the apps: no Connect screen and no Tailscale for
chats. The open-in-a-browser view stays, still through Tailscale; it is also how a super-host
is looked at. [D8 Q-3]

Chat sync through GitHub stops once the new system AND the cloud backup choices both exist,
not before. Existing chats need no moving, because each device already holds its copies. The
GitHub copy is left untouched, and a one-time message says what changed. [chat 2026-11-11;
D9 Q-5] The relay is not a backup; it holds lines for a limited time.

**Losing devices.** If every device is lost at once, chats without a cloud backup are gone
for good; nobody, including us, can recover them. Removing a stolen device stops it receiving
anything new and stops it hosting, but cannot erase what it already holds. [D9 S-2] His
condition: "we need to ensure users have a mechanism to set up and recover from their own
cloud backup tho (drive/icloud/github)".

There is no self-run relay. Self-hosting means running a super-host. [D8 Q-4]

The current handoff and takeover code (about 1,600 lines) is replaced, not patched. The
conflict copies from November 5 are left alone. [D1 Q-16, Q-17; D2 S-4]

## 12. Still open

1. **Cloud backup outline.** He wants the final design to include "at least a general
   outline for the future plan for cloud data backup", and users must be able to set up
   and recover from their own cloud backup. [D9 Q-5 and S-2 notes] Today's facts are in
   section 14; the choices are on deck round 10.
2. Relay time limit: 48 hours or 30 days beside the 1 GB limit. [D9 S-3 note; round 10]
3. How a device learns its files may be behind the chat, and how that is put right.
   [D9 Q-4 note; round 10]
4. Owed: a plain comparison of Tailscale, tunnels and the router method, for the "own front
   door" setup.
5. Never measured: real relay usage per user; whether YouCoded runs on a Raspberry Pi.
6. Not designed, left to the build unless he says otherwise (asked D9 Q-6; he answered
   "don't know"): how pairing looks on screen; how the relay limits abuse when no account
   is needed; a later plan for the November 5 conflict copies.

## 13. What has to be true in the code (for the building session, not for Destin)

Checked against youcoded `8ffa0a421`:

- Remote mode today is whole-app, one host at a time (`desktop/src/renderer/platform.ts`,
  `remote-shim.ts`); per-chat hosts need session ids that carry their host.
- An Electron desktop cannot be a client today (`renderer/index.tsx`); only Android and a
  browser can.
- The remote server binds Tailscale addresses only and does not encrypt
  (`main/remote-server.ts`, `shared/cleartext-hosts.ts`).
- Claude Code chats render whole blocks, not word by word, even locally; native chats stream.
- The Worker room (`wecoded-marketplace/worker/src/sync/room.ts`) carries signals and leases,
  stores no lines, and has no roster of which devices are on.
- `main/conversations/handoff-transcript.ts` already does byte-prefix plus hash receipts; it
  is the model for "everything after line N".
- No sleep blocker tied to replies; `window-all-closed` quits; no windowless desktop mode
  (exists for Android under `main/headless/`).
- Android: no per-reply wake lock, no Doze handling; its server is loopback-only.
- The existing "Model switched to" divider is `kind: 'model-switch'` in
  `shared/session-live-types.ts`, with a deterministic id so a replay cannot draw it twice.

## 14. Cloud backup today (facts only; nothing here is a decision)

Read in the code at youcoded `e73b41347`, 2026-11-12; nothing was run.

| | Sync across devices (GitHub) | Additional backups (Google Drive, iCloud) |
|---|---|---|
| Direction | Both ways, automatic | Upload only |
| Holds | Chats, the Personal folder, synced projects | Those, plus memory, the user's skills, settings, plans. No plugins or themes |
| When | 15 s after a change, and every 2 minutes | Once a day at most; "Back up now" exists |
| Restore | Yes: a new device signs in to GitHub and everything is pulled | None. Restore was removed earlier |
| Locked | No. Private repositories, readable by whoever can open the account | No. Readable in the user's cloud |
| Old copies | Full history kept | Thinned: daily for 7 days, weekly to 28, monthly to 90 |

Faults found (reported, not fixed; application code is read-only for this work):
- The phone offers GitHub backup, which copies nothing there.
- The phone offers Google Drive, but the tool it needs is not shipped in the phone app
  (inferred from code, not tried on a phone).
- The setup switch says "Back up automatically after changes"; it runs once a day.
- iCloud is offered only on Mac and on Windows with iCloud installed.
