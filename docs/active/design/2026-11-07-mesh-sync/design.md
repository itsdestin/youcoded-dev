---
status: draft
date: 2026-11-12
topic: Chats on every device (YouCoded Mesh) — the design, written from Destin's answers
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248, 253, 258
---

# Chats on every device — the design (draft for Destin's read)

Every rule here comes from an answer Destin gave. The source is in brackets: "D4 Q-6" means
deck round 4, question 6; "chat" means a dated chat message. `README.md` in this folder holds
the quotes. Where I had to fill a gap myself, the line starts with **My reading** so it can be
struck. Lines starting **Open** are NOT decided. A checkpoint review on 2026-11-11 found
lines unsupported by, or in conflict with, his answers; he settled them on deck round 9
(2026-11-12), marked "D9". Rounds 10 and 11 (same day) covered backup and pairing. A second
review on 2026-11-13 found gaps and contradictions; the wording ones are fixed below, and
the ones needing his decision went on deck round 12, answered the same day and marked "D12"; two remain open (section 12b). Nothing here
is built. The only build-order statement is his own, at the end of section 12.

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

- **One list of chats on every device.** Every project is listed everywhere, and downloaded
  to a device only where sync is switched on for it (section 8). [D2 Q-8; D9 Q-2]
- **One device hosts each chat.** Every other device shows it live, word by word, and you type
  into it as if it ran there. A chip in the status bar names the host. A watching device also
  has the limits in section 9 (for example no image paste), on a computer as well as a phone.
  [D1 Q-4, Q-14; D2 S-2]
- **A watching device shows a chat exactly as its host does.** YouCoded's own chats appear
  word by word. Claude Code chats appear a block at a time today, even on the host, so a
  watcher sees the same blocks at the same moments. Making Claude Code chats word by word
  is separate work on the app, not part of this design. [D9 S-1, replacing the blanket
  "word by word" of D1 Q-14] Sections 6 and 9 list the other differences for a watcher.
- **The host never changes by itself.** It changes when you tap the chip, or when the host is
  offline and you tap Continue here. [D1 Q-5, Q-15]
- **You can start a chat on one device that runs on another.** [D4 Q-15] Only on a device
  that is on: devices that are off or asleep are greyed, marked "offline". [D12 S-3]
- **Deleting a chat deletes it everywhere,** and it stays 30 days in "Recently deleted" on
  each device. Renaming and marking complete apply everywhere. A device returning after
  weeks obeys a deletion it missed. [D12 Q-2]
- **Permission requests can be approved from any of your devices.** The request shows
  wherever the chat is open and disappears everywhere once answered. [D12 Q-3]
- **A message sent just as the host drops** stays in the box, marked "Not sent. Desktop
  went offline", with the Continue here offer. It is never thrown away and never delivered
  late by surprise. [D12 Q-4]
- **Chats continued on the phone come back one at a time,** by opening each and tapping its
  chip, as any chat is moved. No bulk button. [D12 Q-6]
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
- **"Recent" means used in the last 30 days.** One clock everywhere: a chat used in the
  last 30 days is whole on every device, helper files included, and waits on the relay for
  the same 30 days. His exception: "with exception of full 1gb relay storage obviously".
  [D12 Q-1, replacing the 48 hours of D8 Q-1]
- **Checked fact:** chats only ever grow. Destin's desktop holds 295 compactions in Claude
  Code chats; in the 25 chats sampled, every earlier line was still in the file. Native chats
  add a marker line when they compact (read in the code, 2026-11-09). So "everything after
  line N" is safe for both. He approved a throwaway test [D4 Q-16]; existing chats were
  checked instead, which spent none of his allowance.
- **What travels with a chat:** its lines, plus the files the app saved for that one chat in
  its own hidden storage: each helper's working file, long outputs the assistant saved, and
  the chat's plan and to-do list (the plan is kept in Claude Code's own plans store and is
  matched to the chat that wrote it). Documents inside a project are project files. A chat used in the last 30 days is complete on every device [D12 Q-1]. An older chat fetches
  those files when it is opened on a device; if the only device holding them is off, the
  notice says the helpers' reports are kept but unfinished helper work cannot be continued.
  Undo history does not travel, and neither does the device's separate scratch copy of
  pasted images. [D8 Q-1; his note asked what "folder" meant;
  explained in chat 2026-11-11; confirmed D9 S-8]
- **Between devices a chat travels whole,** pictures and all: a picture you sent is stored
  inside the chat's lines, so it shows on your other devices and the assistant still knows
  it. (**My reading** of how the two rules fit: only the scratch copy above is left behind.)
  Only long-term backups are slimmed (section 12). [chat 2026-11-12: "for syncing we should keep the full chat with
  images and such"]
- **The assistant's setup does not travel** in this design (skills, plugins, connected
  tools, global instructions). Card 248. [D8 Q-2]
- **Everything that syncs is locked end to end.** Only your devices can read it. [D2 Q-2]
  This does not cover a cloud backup, which is locked only if the user switches the lock on
  (section 12), and until the backup rebuild the GitHub backup stays unlocked as today.
  **My reading:** whatever sits in the middle cannot read contents, but it can see how many
  devices and chats there are, their sizes, and when they are active.
- **A new device joins by pairing with one you already have.** No account is needed for sync;
  our relay may ask for a sign-in to stop abuse. [D4 Q-4]
- **When both devices already hold chats and projects,** pairing first shows what each
  holds (for example "This device: 212 chats, 4 projects. Desktop: 630 chats, 9 projects")
  and offers two choices: combine everything, or cancel. Pairing never deletes anything.
  Chats cannot clash; each has its own identity. His caution: "need to be weary of
  potential data loss or duplication". [D11 Q-1]
- **A project with the same name on both devices** is asked about, one clash at a time: "Is
  this the same project?" Same: combined into one, and a file that differs keeps both
  copies. Different, or not sure: both kept, one renamed, for example "Website (from
  Laptop)". No file is overwritten. [D11 Q-2]
- **Devices on the same wifi talk directly,** with the same locking as every other path, so
  home use needs no relay. Others on a shared wifi can see that a YouCoded device is there,
  nothing more. This path needs its own security review before release. [chat 2026-11-11:
  "okay that's fine." to the option as described, including both cautions]
- **A home super-host is reached from outside** through our relay by default, or through the
  user's own front door. [chat 2026-11-11: "i think this is generally fine?"; he wants the
  front-door methods compared before that piece is designed]
- **Removing a device locks it out** and frees the chats it was hosting to be continued
  elsewhere. [D4 Q-9] Any device may remove another, after passing its own unlock
  (fingerprint, PIN or password). A removed device keeps the chats already on it and can be
  paired again. [D12 Q-9]
- **Pairing method:** scan a QR code, or type a short code when there is no camera. The
  code expires after a few minutes. The device you already have shows the new device's name
  and asks "Add this device?" before anything is shared. The look of the screen is reviewed
  as pictures when built. [D12 Q-10]
- **Devices on different versions of YouCoded:** the older device can read and watch, but
  must update before hosting or continuing a chat the newer one changed. Notice: "Update
  YouCoded on Phone to continue this chat". [D12 Q-12]
- **On mobile data a phone syncs everything, always.** A setting to hold large items for
  wifi is card 258. [D12 Q-8: "we shuold probably add a card for eventual configurability"]

## 4. Keepers: what holds lines while devices sleep

A keeper is something always on that holds locked lines it cannot read.

- **Both kinds are offered:** an optional YouCoded relay, and your own always-on device (a
  desktop left on, a Mac mini, a Raspberry Pi). [D4 Q-2]
- **The relay is built first.** [D5 Q-1]
- **No keeper at all is a supported way to run:** devices catch each other up whenever two
  are on together, with no service of ours. [D2 Q-1 "the dream"; D8 Q-4 as described]
- **The relay is a waiting room, not an archive.**
  - It holds waiting data until 30 days after the last line was added to that chat. An
    active chat stays fully held. [D10 Q-1, replacing the 48 hours of chat 2026-11-10]
  - It deletes a chat's lines once every one of your devices has them, or after 30 days,
    whichever comes first. [D12 S-1]
  - It holds at most 1 GB per user. [chat 2026-11-10]
  - The 1 GB and the 30 days cover everything waiting on the relay: chat lines, helper
    files and project file changes. Data passing straight through while both devices are on
    is not stored and does not count. So a large project reaches a new device only while a
    device that has it is on. [D9 S-3]
  - Anything older, a device gets from your other devices when both are on.
  - It keeps, with no time limit, one small note per chat: the latest line number and which
    device has it. No words of the chat. So a device knows for certain when it is behind.
    [D7 Q-1]
  - At 1 GB it releases whole chats, least recently used first. The host shows: "Relay full.
    3 older chats are kept only on Desktop until Phone and Desktop are on together."
    Lines the relay has let go of exist only on the device that wrote them until another
    device collects them; if that device is lost first, they are gone. [D7 Q-3; D12 S-2]
  - **No sign-in at launch.** The 1 GB is counted per paired set of devices. A sign-in is
    added only if abuse appears. [D12 Q-11]
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
  nothing for that user, with one exception: while the super-host cannot be reached, the
  relay holds waiting data in its place. The user can switch that off. [D12 Q-13]
- **Open: payment** is undecided; the relay is free for everyone at the fixed limits. He leans
  toward free at the basic limits with bigger ones paid, plus donations. [D7 Q-8]
- **Cost of the relay** (estimate from Cloudflare's price list and a guessed usage, not
  measured): free today and up to a few hundred heavy users; about $25 a month at 1,000.
- **GitHub never stops being a backup.** Two-way chat sync through GitHub is switched off
  the moment the mesh is deployed; uploading to GitHub as a backup carries on until the
  backup rebuild, so no user is ever without a copy off their own devices. The user
  chooses whether chats are backed up to a cloud at all and whether that backup is
  passphrase-locked. Card 241. [D4 Q-3; D9 Q-5 as refined in chat 2026-11-12] See section 12.

## 5. When the host goes away

**Staying awake.** A computer holds itself awake while a reply it is running is unfinished,
and lets go when it ends, with a hard limit so it can never stick. Closing a laptop lid still
sleeps it. [D4 Q-5; D1 Q-10: no permanent keep-awake]

**Going to sleep.** Nothing special happens, because every line was already sent as it was
written. One exception: a file change from the last couple of seconds may not have gone; it sends
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
- **The files-changed note.** The moment a project's files change, the host sends a tiny
  note ("this project is now at change number 57", no names or contents) with the chat
  lines. The relay keeps the latest one per project. A device then knows for certain when
  its files are behind, and the notice says "Desktop has newer files and is offline". When
  the other device returns, the existing hidden history combines the changes; a file changed
  on both keeps both copies. [D10 Q-2]
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
- YouCoded keeps the divider beside Claude Code's own chat file, never inside it. **My
  reading** of how that works: the divider lives in a small companion record that travels
  with the chat like its lines do. The app draws the divider from it, devices learn the
  host from it, and the assistant is told at the start of the next message. (Round 5
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
so is added at the end of the chat; nothing earlier is cut or edited. [D4 Q-11; D5 S-3] When
it later moves to a device that has the project, a note tells you and the assistant that
files can be used again. [D12 S-4]

**Secrets and skipped folders.** When the project has them, the notice names them: "These
stay on Desktop: .env, node_modules, …". [D12 S-5]

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
- File changes go out about 2 seconds after the last edit, with the exact figure tuned
  during the build; a burst of edits is still bundled into one send. (Today it is 15
  seconds, sized for GitHub, where one send takes 10 to 30 seconds.) [D11 Q-4] At takeover
  the notice may say files are still arriving.
- Known weaknesses carried over: the history grows without limit on every device, and has
  been damaged by power loss before (a repair exists).
- **Two devices may host chats in the same project at the same time,** with no notice.
  [D12 Q-5] The hidden history combines changes to different files, or different parts of
  one file, by itself. Only when both changed the same lines does it keep both: the
  incoming version keeps the name and this device's version becomes "name (from Device,
  date)" beside it.
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
is looked at. [D8 Q-3] **Open:** that view is not locked today beyond Tailscale itself; it is
settled with the front-door comparison in section 12b.

Chat sync through GitHub is switched off at the same moment the mesh is deployed. The two
systems never sync side by side. Uploading to GitHub as a backup continues. In his words:
"we should switch github syncing off at the same time hte mesh is deployed. we can continue
backing up to github, but we absolutely should NOT allow both systems to continue trying to
sync simultaneously." Existing chats need no moving, because each device already holds its
copies, and a one-time message says what changed. GitHub's one-time "restore to a new
device" keeps working until the backup rebuild, so nobody holds a backup they cannot use;
it is a single pull onto an empty device, not ongoing sync. [D12 Q-14] On day one, devices
that already share chats through GitHub are combined quietly where one copy is simply
longer; real differences are listed once, together. Projects already synced through GitHub
are recognised as the same project without asking. [D12 Q-15] [chat 2026-11-12, refining chat 2026-11-11
and D9 Q-5] The relay is not a backup; it holds waiting data for a limited time.

**Losing devices.** If every device is lost at once, chats without a cloud backup are gone
for good; nobody, including us, can recover them. Removing a stolen device stops it receiving
anything new and stops it hosting, but cannot erase what it already holds. [D9 S-2] His
condition: "we need to ensure users have a mechanism to set up and recover from their own
cloud backup tho (drive/icloud/github)".

There is no self-run relay. Self-hosting means running a super-host. [D8 Q-4]

The current handoff and takeover code (about 1,600 lines) is replaced, not patched. The
conflict copies from November 5 are left alone. [D1 Q-16, Q-17; D2 S-4]

## 12. Cloud backup (outline)

Decided:
- **One backup feature.** Sync is between your devices; backup is an optional spare copy in
  your own cloud. Pick Google Drive, iCloud or GitHub: same contents and same restore
  whichever you pick. Never a server of ours. [D10 Q-3]
- **It holds everything, with switches:** chats, the assistant's setup, and each project
  individually. [D10 Q-4: "switches for individual/specific projects"]
- **Not locked is the starting choice;** the user can switch the passphrase lock on. An
  unlocked backup shows an honest warning and asks for confirmation. [D10 Q-5: "just with
  honest warnings and confirmation when a user utilizes unencrypted backups"]
- **A new device offers two ways in:** pair with a device you have, or restore from your
  cloud backup (sign in, passphrase if locked; chats, projects and setup come back). The
  restored device is the first of a fresh set. [D10 S-1]
- **At the switch,** a user with one device is asked to set up a backup or to say plainly
  they want none; with two or more it is optional. Existing GitHub users keep GitHub as
  their backup without doing anything. [D10 S-2]
- **Backups are slimmed; sync is not.** Long-term backups to Drive, iCloud and GitHub leave
  out the pictures and the duplicate file text stored inside chat lines. Chats restored
  from a backup therefore come back without their pictures, and the assistant will not
  remember what it knew only from them (tested 2026-11-12). [chat 2026-11-12: "the long-term
  backups to drive/icloud/github should drop the images and duplicate content"]
- Until this rebuild exists, GitHub keeps receiving uploads as a backup; it is no longer
  synced from. [chat 2026-11-12]

- **How often:** a backup sends only what changed since last time, as often as each cloud
  allows without slowing the device, and at least daily. Exact timing is set per service
  during the build and shown truthfully ("Backed up 20 minutes ago"). On a phone it waits
  for wifi and charging unless you tap "Back up now". Dated restore points stay as today:
  daily for a week, then weekly, then monthly. [D11 S-1; his wording D10 Q-6]
- **Which device backs up:** any one of your devices that can reach your cloud backs up for
  all of them, so there is one backup, not one per device. The screen says which device
  last backed up and when. A device that is your only device must have at least one cloud
  that works on it. [D11 Q-3]
- **Turning on an unlocked backup asks for confirmation.** Example wording he approved:
  "This backup is not locked. Anyone who gets into your Google account can read your chats
  and files. Lock it with a passphrase instead?" Buttons: "Lock it" and "Back up without a
  lock". The line stays visible beside the backup in settings. [D11 S-2]

For later, his words: explore "backups hosted by youcoded at some point in the future"
[D10 S-3]; "how to optimize/compress storage or deal with long-term chat accrual or improve
backup/restoration flows ... somewhat tangential" [D10 Q-4]. Filed as cards on his word
[D11 Q-5].

**Order, in his words** [chat 2026-11-12]: "finish everything else in the mesh build first,
then follow-up with the backup rebuild including any needed github changes". The GitHub
history fresh start waits for that rebuild.

## 12b. Still open

1. **Open from round 12, his notes need a rethink before he decides:**
   - The quit warning (Q-7). His note: "it seems like this should be different dependent on
     whether you're a 1-device no-sync user or a user who does have multiple devices? and
     what marks are you talking about?"
   - Which device backs up (S-6). His note: "this seems a bit janky ... would my 'only
     device' even have a sync setting like recent if i'm not using sync on other devices
     does it matter if older data exists on a specific device after the first sync or two?
     wouldnt we just be sending minor updates/additions?"
2. Owed: a plain comparison of Tailscale, tunnels and the router method, for the "own front
   door" setup, including locking the browser view.
3. Never measured: real relay usage per user; whether YouCoded runs on a Raspberry Pi.
4. Left to the build unless he says otherwise (asked D9 Q-6; he answered "don't know"): a
   later plan for the November 5 conflict copies. The look of the pairing screen goes
   through the normal picture review when it is built.

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
- Fragile points named by the 2026-11-13 review, to be designed in, not assumed:
  - "Chats only grow" is checked on every catch-up (hash of the shared prefix). On a
    mismatch the whole chat is recopied, never patched.
  - The per-chat note carries a fingerprint of the last line as well as its number, so two
    devices at the same line number with different content are detected.
  - Simultaneous takeover needs one judge per chat: the keeper when one is reachable,
    otherwise the lower device id; a later-heard conflicting claim loses.
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
