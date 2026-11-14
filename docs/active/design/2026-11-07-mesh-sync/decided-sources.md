---
status: active
date: 2026-11-14
topic: Chats on every device — where each decided rule came from
---

# Decided behaviour, with sources

This is section 2 of `design.md` as it stood on 2026-11-14, with the source of every rule
in brackets. `design.md` states the same rules without the brackets, for a builder.

- `[D9 Q-2]` means deck round 9, question 2. `[chat 2026-11-12]` is a dated chat message.
  The quotes are in `README.md`; the raw answers are in `mesh-sync.questions*.answers.json`.
- **My reading** marks a line where the designing session fitted two of his answers
  together and he has not confirmed it.
- If this file and `design.md` ever disagree about what was decided, this file and
  `README.md` are right and `design.md` must be corrected.

Decided in chat and stated in `design.md` section 2, but not in the body below:

- A device is identified by the id the app already gives each machine. [chat 2026-11-13:
  "it should be pretty simple to identify devices? we already identify unique devices with
  a device id for our analytics"]
- Pairing a device that is already paired with others joins the two sets into one. [chat
  2026-11-14: "there is no additional difficulty from pairing two 'sets' of devices as
  opposed to just pairing a singular new device into an existing 'set' … it seems like
  that would honestly be the simpler and less convoluted behavior"]
- One release, not staged. [chat 2026-11-13: "this should not be staged or phased. we
  should just fix this all at once and swap everyone in a single release. we only have
  like 5-10 users"]

Add later decisions here, dated, when they are made.

## What the user experiences

Everything in this section is decided unless marked. Wording in quotes is approved example
wording; final wording is confirmed on the review decks when each screen is built.

### 2.1 One list, one host per chat

- One list of chats on every device. Every project is listed on every device. [D2 Q-8; D9 Q-2]
- One device hosts each chat. Every other device shows it live and you type into it as if it
  ran there. A chip in the status bar names the host. [D1 Q-4, Q-14; D2 S-2]
- A watcher shows the chat exactly as its host does. YouCoded's own ("native") chats appear
  word by word. Claude Code chats appear a block at a time, as they do on the host today.
  Making Claude Code chats word by word is separate work. [D9 S-1]
- The host never changes by itself. It changes when you tap the chip, or when the host is
  offline and you tap Continue here. [D1 Q-5, Q-15]
- You can start a chat on one device that runs on another, but only on a device that is on.
  Devices that are off or asleep are greyed and marked "offline". [D4 Q-15; D12 S-3]
- The phone is a full host, equal to a computer. Features it still lacks are named in the
  notice until they are built. Opening a chat on the phone works exactly as on a computer.
  [D1 Q-1, Q-11, Q-13; D2 Q-7]
- Permission requests can be approved from any device. The request shows wherever the chat
  is open and disappears everywhere once answered. [D12 Q-3]
- A message sent just as the host drops stays in the box, marked "Not sent. Desktop went
  offline", with the Continue here offer. Never thrown away, never delivered late. [D12 Q-4]
- A watcher has the limits a phone has today (no assistant browser, no Office documents, no
  image paste, no dragging files in), on a computer as well as a phone. The limits live in
  one central list and each shows: "X is not currently supported from a remote client."
  [D4 Q-14; D5 S-4]
- Deleting a chat deletes it everywhere, and it stays 30 days in "Recently deleted" on each
  device. Renaming and marking complete apply everywhere. A device returning after weeks
  obeys a deletion it missed. [D12 Q-2]
- A chat marked complete closes on every device. [D4 Q-6]
- Deleting a chat stops a reply running in it, on whichever device hosts it. [D13 S-7]
- The "host is offline, continue here?" notice appears when you open or type in that chat,
  not the moment the host drops. [D13 S-5]
- A phone that is not in use shows as offline to your other devices and catches up when the
  app is opened. [D13 S-6]

### 2.2 How much each device holds

- One setting per device: **keep everything**, or **keep recent chats and fetch the rest on
  opening**. Computers and a super-host start on "keep everything", phones on "recent".
  Every chat is listed either way. [D9 Q-1]
- "Recent" means used in the last 30 days. A chat used in the last 30 days is whole on every
  device, extras included. One clock everywhere. His exception: "with exception of full 1gb
  relay storage obviously", meaning a chat the full relay has let go of reaches a device only
  when it meets a device that has it. [D12 Q-1]
- On "recent", an older chat cannot be read offline until it has been opened there once. If
  the only device holding its extras is off, the notice says the helpers' reports are kept
  but unfinished helper work cannot be continued. [D9 Q-1; D8 Q-1]
- A user with only one device has no such setting; it appears once a second device is
  paired. [D13 S-2]
- A chat hosted on a phone is never cleared from that phone by "recent". [D13 S-9]

### 2.3 What travels

- A chat's lines, whole, pictures included. [chat 2026-11-12: "for syncing we should keep
  the full chat with images and such"]
- The chat's extras: each helper's working file, long outputs the assistant saved, the plan
  and the to-do list. [D8 Q-1; D9 S-8]
- Not carried: undo history. [D8 Q-1]
- **My reading:** D8 Q-1 also dropped "pasted images"; his later words keep images in sync.
  The two fit if a picture sent in a chat travels (it is stored inside the chat's lines, so
  it shows on other devices and the assistant still knows it) and only the device's separate
  scratch copy of pasted images is left behind.
- Not carried in this design: the assistant's setup (skills, plugins, connected tools, global
  instructions). Card 248. [D8 Q-2]
- Project files, on the same locked system (section 2.8). [D5 Q-6]
- On mobile data a phone syncs everything, always. A setting to hold large items for wifi is
  card 258. [D12 Q-8]

### 2.4 Pairing, devices and security

- Everything that syncs is locked end to end. Only the user's devices can read it. [D2 Q-2]
  **My reading:** a keeper in the middle can still see how many devices and chats there are,
  their sizes and when they are active; the product must not claim otherwise.
- A new device joins only by pairing with a device already in the set. No account is needed.
  [D4 Q-4]
- Pairing method: scan a QR code, or type a short code when there is no camera. The code
  expires after a few minutes. The device already in the set shows the new device's name and
  asks "Add this device?" before anything is shared. [D12 Q-10]
- When both devices already hold chats and projects, pairing first shows what each holds
  ("This device: 212 chats, 4 projects. Desktop: 630 chats, 9 projects") and offers: combine
  everything, or cancel. Pairing never deletes anything. [D11 Q-1]
- A project with the same name on both is asked about, one clash at a time: "Is this the same
  project?" Same: combined, and a file that differs keeps both copies. Different or not sure:
  both kept, one renamed, for example "Website (from Laptop)". [D11 Q-2]
- Any device may remove another, after passing its own unlock (fingerprint, PIN or
  password). Removing a device locks it out of everything new and frees the chats it was
  hosting. It keeps what it already holds and can be paired again. [D4 Q-9; D12 Q-9]
- A device not seen for 30 days triggers a one-time prompt on the others offering to remove
  it. Nothing is removed without a yes. [D7 Q-4]
- If every device is lost at once, chats without a cloud backup are gone for good; nobody,
  including YouCoded, can recover them. [D9 S-2]
- A device restored from a cloud backup is the first of a fresh device set. [D10 S-1]
- Devices on different versions of YouCoded: the older device can read and watch, but must
  update before hosting or continuing a chat the newer one changed. "Update YouCoded on Phone
  to continue this chat". [D12 Q-12] A device too old to watch live still shows the chat,
  updating as each block is saved, but cannot type into it. [D13 S-8]
- Adding a device needs the acting device's unlock, like removing one, and the other
  devices show "Laptop was added by Phone". [D13 Q-5]
- Anything a removed device wrote and had not sent is not recoverable unless it is paired
  again. [D13 S-4]

### 2.5 Keepers

- Both kinds are offered: the optional YouCoded relay, and the user's own super-host. The
  relay is built first. No keeper at all is also supported: devices catch each other up
  whenever two are on together. [D4 Q-2; D5 Q-1; D2 Q-1]
- The relay is a waiting room, not an archive:
  - It holds a chat's waiting lines until every device has them, or until 30 days after the
    last line was added to that chat, whichever comes first. [D10 Q-1; D12 S-1]
  - At most 1 GB per device set, covering everything waiting: chat lines, extras and project
    file changes. Data passing straight through between two devices that are both on is not
    stored and does not count. [chat 2026-11-10; D9 S-3; D12 Q-11]
  - At 1 GB it lets go of whole chats, least recently used first, and the host says: "Relay
    full. 3 older chats are kept only on Desktop until Phone and Desktop are on together."
    [D7 Q-3; D12 S-2]
  - Lines the relay has let go of exist only on the device that wrote them until another
    device collects them. If that device is lost first, they are gone. [D12 S-2]
  - With no time limit it keeps one note per chat (latest line number and which device has
    it) and one per project (latest change). No words. [D7 Q-1; D10 Q-2]
  - No sign-in at launch. A sign-in is added only if abuse appears. [D12 Q-11]
- Devices on the same wifi talk directly, with the same locking, so home use needs no relay.
  Others on that wifi can see that a YouCoded device is there, nothing more. This path needs
  its own security review before release. [chat 2026-11-11: "okay that's fine." to the
  option as described, both cautions included]
- A super-host is a complete YouCoded with no window, on a device at home (a desktop left on,
  a Mac mini, a Raspberry Pi). It pairs like any device, holds every chat and project with no
  limit, hosts chats, catches devices up, passes live words, and opens in a browser. It holds
  keys, so it must be hardware the user trusts. A rented server was offered and not picked.
  [D7 S-1, Q-5]
- While a super-host cannot be reached, the relay holds waiting data in its place; the user
  can switch that off. [D12 Q-13] Otherwise the relay stores nothing for a super-host user
  (as the question described it to him; its purpose in his words: "allow self hosting and
  also reduce load/strain on our servers/relay when possible", D7 Q-6 note).
- The relay is on from the first pairing, with a line saying so and a switch to turn it
  off. [D13 Q-3]
- The relay erases what it holds for a device set after 90 days with no device connecting.
  Nothing on the devices is touched; they register again by themselves. [D13 Q-4]
- A super-host's syncing with the user's devices away from home goes through the relay by
  default, or through the user's own front door. (Its browser view is a separate thing and
  stays on Tailscale, 2.9.) Destin wants Tailscale, tunnels and the router method compared
  before that piece is designed. [chat 2026-11-11] **Open.**
- Payment: **Open.** The relay is free for everyone at the fixed limits. [D7 Q-8]

### 2.6 When the host goes away

- **Awake.** A computer holds itself awake while a reply it is running is unfinished, for
  at most 2 hours per reply [D13 Q-7]. Closing a laptop lid still sleeps it. No permanent keep-awake.
  [D4 Q-5; D1 Q-10]
- **Sleep.** Nothing special is sent at sleep, because every line was sent as it was
  written. A file change from the last couple of seconds may not have gone; it sends on
  waking. [D9 S-7] On waking, the host checks it is still the host before a reply does
  anything further (2.7; mechanism in 5.9).
- **Phone as host.** The phone stays awake for each reply with the screen off. A setting
  the user opts into exempts the app from Android's battery limits and explains the cost.
  [D6 Q-3]
- **Quitting the host.** [D4 Q-6; D5 S-1, Q-5; D9 Q-3, Q-4]
  - The normal close menu appears (flags, mark complete).
  - The app quits at once provided every finished reply has reached another device, the
    relay or the super-host. It never waits for a running reply; that half is dropped.
  - Unsent project file changes are sent first, for a few seconds at most.
  - If anything is left, or the device is offline, it quits anyway and says: "Offline - some
    chats may not have synced."
  - On other devices the chat stays listed: host disconnected, host it here?
- A one-device user never sees that line. With two or more devices it appears only when something has not left the device. In
  the one case where it would appear on every quit (no relay, no super-host, other devices
  off), it is explained once and afterwards the chat list's "waiting" label carries it.
  [D13 S-1]

### 2.7 Taking over, and the notice

- Tapping Continue here adds a visible divider to the chat, like today's "Model switched to"
  divider, and the assistant can read it. (Example wording: "Now hosted on Phone".)
  [chat 2026-11-10]
- The unfinished reply is dropped; the chat carries on from the last finished one. Files that
  reply already changed stay changed, and the notice says so. [D1 Q-9; D2 Q-6]
- When the old host returns it learns it is no longer the host and discards its half. A host
  waking from sleep checks this before letting a reply carry on. [chat 2026-11-10]
- If two devices tap Continue here at once, the first to be heard becomes host; the second
  shows "Phone just took over this chat" and stays a watcher. [D9 S-4]
- With no connection at all, Continue here still works, with a warning. [D5 Q-4]
- A continued chat keeps its exact model, provider and project settings. [D4 Q-12]
- Chats continued on the phone come back to the computer one at a time, by opening each and
  tapping its chip. [D12 Q-6]

**The notice.** When several situations apply they appear together in one box. [D9 S-6]

| Situation | What it says |
|---|---|
| You tap the chip, host is on | "Host this chat on this device instead of Desktop?" The switch waits for a running reply to end. |
| Host off, nothing missing | "This chat was hosted on Desktop, which is offline. Continue here?" |
| Host went off mid-reply | "Desktop went offline partway through a reply. If you continue here, that unfinished reply is dropped and the chat carries on from the last finished one." Plus: files it already changed stay changed. |
| This device may be behind | "Desktop is offline and may have newer messages or files than this device. Continuing here could create a second version." |
| This device is known to be behind | "Desktop has 120 newer lines and is offline." Button: "Continue from here as a new version". [D7 Q-1, Q-2] |
| Files known to be behind | "Desktop has newer files and is offline." [D10 Q-2] |
| Project folder not here | Stops to ask: turn on sync for this project and fetch it first (what is missing, why, storage needed), or continue talk-only. [D2 Q-11; D5 N-5] |
| Secrets or skipped folders | "These stay on Desktop: .env, node_modules, …" [D12 S-5] |
| Sign-in missing here | Stops to ask. A Claude Code chat waits for sign-in to Claude. A native chat shows the model picker. [D4 Q-12; D5 S-2] |
| Features this device lacks | "You may continue here, but this chat will not have: …" naming only what is really missing. Adds, when the chat is really using it: "If this chat needs hardware or files that exist only on Desktop, it may be best to wait." [D1 Q-8; D9 S-6] |
| On the old host, when it returns | "This chat continued on Phone while this computer was offline. Its unfinished reply here was discarded." [D5 N-9] |
| Two versions found | "This chat was continued on both Desktop and Phone while they could not reach each other. There are now two versions. Keep both, or archive the older one?" [D5 N-10] |
| Host was removed | "Phone was removed from your devices. Continue this chat here?" [D13 S-12] |
| Chat's body is not on any device that is on | "This chat is stored on Desktop, which is offline. It will open when Desktop is on." [D13 S-12] |
| Older app version | "Update YouCoded on Phone to continue this chat." [D12 Q-12] |

**Talk-only.** A chat opened without its folder can talk but not touch files. A note saying
so is added at the end; nothing earlier is edited. When it later moves to a device that has
the project, a note tells the user and the assistant that files can be used again.
[D4 Q-11; D5 S-3; D12 S-4]

**Versions.** Accidental duplicates are prevented by the control log. The one unavoidable
case is two devices continuing the same chat while neither can reach the other or a keeper;
it is caught when they meet and the older one is offered for archiving. Deliberate forks are
equals, grouped in the resume browser. "Continue from here as a new version" is a deliberate
fork: both stay, no archive prompt, including when the old host later turns out to hold
finished replies (the user already chose to make a new version). A better versions screen is card 243.
[D1 Q-6, Q-7; D2 Q-12; D5 Q-4; D9 S-5]

### 2.8 Project files

- Files travel on the same locked system as chats, through the same keepers. [D5 Q-6]
- The hidden version history each synced project already keeps (`<project>/.youcoded/sync.git`)
  stays as the version store and as the handler for a file changed on two devices. Only the
  carrier changes: device to device, in place of GitHub. Nothing new is built for browsing
  old versions. [chat 2026-11-11]
- A project is listed on every device and downloaded to a device when sync is turned on for
  it there, once, from the notice or the project list. If the only device holding it is off,
  it cannot be fetched until that device is on. [D9 Q-2]
- Changes go out about 2 seconds after the last edit (15 today), tuned during the build; a
  burst is one send. [D11 Q-4]
- The moment a project's files change, the host sends its note; the keeper keeps the latest
  per project. [D10 Q-2]
- Two devices may host chats in the same project at once, with no notice. [D12 Q-5]
  As today, changes to different files, or different parts of one file, combine by
  themselves, and when both changed the same lines both are kept, one under the file's name
  and the other as "name (from Device, date)". He asked "how will users notice duplicate
  file versions?"; the honest answer is only by seeing that extra file. He has not asked
  for more.
- When two devices changed the same lines, which copy keeps the file's name follows one
  fixed rule on every device; when one edited a file and another deleted it, the edit is
  kept. [D13 S-10]
- If two devices' copies of a project share no history, the project shows "These copies
  have diverged" and is not combined automatically. [D13 S-11]
- Carried over unchanged, as he was told when approving the carrier change: huge and
  generated folders are skipped; secrets never leave the device. [chat 2026-11-11]

### 2.9 What is replaced, and the switch-over

- Today's remote access is replaced inside the apps: no Connect screen, no Tailscale for
  chats. The open-in-a-browser view stays, still through Tailscale, and is how a super-host is
  looked at. [D8 Q-3]
- There is no self-run relay. Self-hosting means a super-host. [D8 Q-4]
- The current handoff and takeover code is replaced, not patched. The conflict copies from
  2026-11-05 are left alone. [D1 Q-16, Q-17; D2 S-4]
- GitHub two-way chat sync is switched off the moment the mesh is deployed (on each device,
  when it updates; see below). Uploading to
  GitHub as a backup continues until the backup rebuild. Existing chats need no moving. A
  one-time message says what changed. [chat 2026-11-12]
- GitHub's one-time "restore to a new device" keeps working until the backup rebuild.
  [D12 Q-14]
- On day one, devices that already share chats through GitHub are combined quietly where one
  copy is simply longer; real differences are listed once, together. Projects already synced
  through GitHub are recognised as the same project without asking. [D12 Q-15]
- **A device switches when it is updated,** whether or not it is paired with anything.
  From then it uses GitHub only as a one-way backup. In his words: "it should switch to
  github 1-way backup. whether a second device is paired has no bearing on the fact that we
  should stop offering github 2-way sync". [D13 Q-1]
- **At the switch every user moves to one-way backup, whichever service they use.** His
  words: "ALL USERS will move to 1-way backup that doesnt give a damn whether you utilize
  github, icloud, or google drive. all cross-device live syncing happens through the new
  system." [D13 Q-2] A user with one device is asked to set up a backup or to say plainly
  they want none [D10 S-2], with all three services offered. A fact to show honestly until
  the backup rebuild: only a GitHub backup can be restored; Drive and iCloud copies gain
  restore with the rebuild (section 3.6).
- Alerts: today's in-app notices are enough. Alerts across devices are card 242. [D4 Q-13]

### 2.10 Cloud backup (built after the mesh)

Order, in his words: "finish everything else in the mesh build first, then follow-up with the
backup rebuild including any needed github changes". [chat 2026-11-12] Decided so far:

- One backup feature: Google Drive, iCloud or GitHub, same contents and same restore. Never a
  YouCoded server. [D10 Q-3]
- It holds everything, with switches: chats, the assistant's setup, each project. [D10 Q-4]
- Not locked is the starting choice; a passphrase lock can be switched on. Turning on an
  unlocked backup asks: "This backup is not locked. Anyone who gets into your Google account
  can read your chats and files. Lock it with a passphrase instead?" Buttons "Lock it" and
  "Back up without a lock". [D10 Q-5; D11 S-2]
- A new device offers two ways in: pair, or restore from the cloud backup. [D10 S-1]
- It sends only what changed, as often as each cloud allows, at least daily; a phone waits
  for wifi and charging unless "Back up now" is tapped; dated restore points as today.
  [D11 S-1]
- Any one device that can reach the cloud backs up for all. [D11 Q-3]
- Backups are slimmed: no pictures and no duplicate file text. A chat restored from backup
  lacks its pictures, and the assistant no longer knows what it knew only from them (tested
  2026-11-12). Sync is never slimmed. [chat 2026-11-12]
- Any device may back up what is new; the backup screen names chats that have never been on a backing-up device ("212 chats
  are not backed up yet. They are on Desktop."). [D13 S-2]
- **Open (O10).** He did not approve "a device only offers the choices that work on it".
  His words: "be a bit more creative in designing ways to get backups to work more
  consistently across all devices". [D10 S-3] The backup rebuild's own design must answer it.
- For later: backups hosted by YouCoded (card 253); storage growth (card 98).
