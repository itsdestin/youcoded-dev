---
status: draft
date: 2026-11-13
topic: Chats on every device (YouCoded Mesh) — the full design, for a builder with no prior context
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248, 253, 258
code-read-at: youcoded e73b41347, wecoded-marketplace 830ff8e (2026-11-13)
---

# Chats on every device (YouCoded Mesh) — full design

## 0. How to use this document

**Who it is for.** An agent or developer who has never seen this work. Followed end to end, it
produces the feature Destin Moss (product owner, not a developer) decided over twelve rounds
of questions. No application code has been changed yet.

**What is in the folder.**

| File | Role |
|---|---|
| `design.md` (this file) | The single source for what to build, how the parts fit, and in what order. |
| `README.md` | The decision record: every rule below traced to Destin's own words. Read a tag like `[D9 Q-2]` as "deck round 9, question 2"; `[chat 2026-11-12]` is a dated chat message. Look the quote up there. |
| `decision-outline.md` | The earlier, shorter outline this file replaces. History only. |
| `connection-options.md` | Earlier research: prices, other products, security failure stories. Background only. |
| `mesh-sync.questions*.json` + `.answers.json` | The decks and his answers. Never rebuild an answered deck. |

**Three kinds of statement in this file.** Keep them apart when building.

- **Decided.** Carries a tag such as `[D12 Q-9]`. It is Destin's decision. Do not change it
  without asking him on a questions deck.
- **Engineering.** Carries no tag, or says "engineering call". It is the designing session's
  technical choice for delivering a decided behaviour. A builder may change it when a
  measurement or the code says so, provided no decided behaviour changes. Record why.
- **Proposed** or **Open.** Not decided. Section 14 lists every one. Do not build an Open item
  on a guess; ask.
- **My reading.** The designing session's way of fitting two of his answers together. He has
  not confirmed it. Treat as Proposed.

**Rules that bind the builder** (from the workspace `CLAUDE.md` and Destin's standing words):

1. Anything a user can experience (new screens, wording, changed flows) is approved by Destin
   before it ships. Screens go through the workspace's review-deck flow
   (`.claude/rules/feature-flow.md`), pictures first.
2. Never experiment on Destin's running, built app (`.claude/rules/live-app-safety.md`). Use
   `bash scripts/run-dev.sh` with its own `--profile`, `--offset` and `--label`.
3. **A key is never synced to GitHub or stored on any server.** [chat 2026-11-08]
4. The two sync systems never run side by side. [chat 2026-11-12]
5. Destin is spoken to in plain words, with pros, cons and a recommendation. Four or more
   questions go on a deck. Never suggest merging.

---

## 1. Goal, in one page

It feels like claude.ai, but the user's own devices are the server, and nothing in the middle
is required or trusted. [D4 S-1]

"Mesh" is four properties, not a networking technology [D4 S-2]:

1. Devices pair with each other.
2. Keys live only on the user's devices.
3. Any device can catch another one up.
4. Whatever sits in the middle cannot read contents and can be swapped for another.

It is for every user's devices, any mix of Windows, Mac, Linux and Android. Destin's four
machines are only the test case. [D1 Q-2]

**Vocabulary used throughout.**

| Word | Meaning |
|---|---|
| Device set | The devices one user has paired together. |
| Host | The one device where a given chat's assistant actually runs. |
| Watcher | Any other device showing that chat live and typing into it. |
| Keeper | Something always on that holds locked data while devices sleep: the YouCoded relay, or the user's own super-host. |
| Relay | The keeper YouCoded runs. It cannot read contents. |
| Super-host | The user's own always-on device running a complete YouCoded with no window. It can read contents, because it is the user's. |
| Line | One line of a chat's transcript file. |
| Extras | Files saved for one chat outside its lines: helper working files, saved long outputs, the plan, the to-do list. |
| Control log | A small record that travels with each chat: who hosts it, takeovers, deletion, forks. New in this design. |
| Note | The tiny, wordless marker a keeper holds per chat or project so a device knows for certain whether it is behind. |
| Talk-only | A chat continued on a device that lacks its project folder: it can talk but not touch files. |
| Version | One of two or more continuations of the same chat that share an earlier part. |
| Used | A chat was "used" when its last line was added. The 30-day clocks all count from then. |

---

## 2. What the user experiences (the product contract)

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
- **Proposed** (from his round 12 note, awaiting his yes): a user with only one device has no
  such setting; it appears once a second device is paired.

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
  to continue this chat". [D12 Q-12]

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
- **Open:** whether the relay is on from the first pairing or must be switched on (O8).
- A super-host is reached from outside the home through the relay by default, or through the
  user's own front door. Destin wants Tailscale, tunnels and the router method compared
  before that piece is designed. [chat 2026-11-11] **Open.**
- Payment: **Open.** The relay is free for everyone at the fixed limits. [D7 Q-8]

### 2.6 When the host goes away

- **Awake.** A computer holds itself awake while a reply it is running is unfinished, with a
  hard time limit. Closing a laptop lid still sleeps it. No permanent keep-awake.
  [D4 Q-5; D1 Q-10]
- **Sleep.** Nothing special happens, because every line was sent as it was written. A file
  change from the last couple of seconds may not have gone; it sends on waking. [D9 S-7]
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
- **Proposed** (rework of round 12 Q-7, awaiting his yes): a one-device user never sees that
  line. With two or more devices it appears only when something has not left the device. In
  the one case where it would appear on every quit (no relay, no super-host, other devices
  off), it is explained once and afterwards the chat list's "waiting" label carries it.

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
| Host was removed (**Proposed** wording) | "Phone was removed from your devices. Continue this chat here?" |
| Chat's body is not on any device that is on (**Proposed** wording) | "This chat is stored on Desktop, which is offline. It will open when Desktop is on." |
| Older app version | "Update YouCoded on Phone to continue this chat." [D12 Q-12] |

**Talk-only.** A chat opened without its folder can talk but not touch files. A note saying
so is added at the end; nothing earlier is edited. When it later moves to a device that has
the project, a note tells the user and the assistant that files can be used again.
[D4 Q-11; D5 S-3; D12 S-4]

**Versions.** Accidental duplicates are prevented by the control log. The one unavoidable
case is two devices continuing the same chat while neither can reach the other or a keeper;
it is caught when they meet and the older one is offered for archiving. Deliberate forks are
equals, grouped in the resume browser. "Continue from here as a new version" is a deliberate
fork: both stay, no archive prompt. A better versions screen is card 243.
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
  What then happens is today's behaviour, unchanged (engineering fact, not a new decision):
  changes to different files, or different parts of one file, combine by themselves; when
  both changed the same lines, both are kept, one under the file's name and the other as
  "name (from Device, date)". He asked "how will users notice duplicate file versions?";
  the honest answer is only by seeing that extra file. He has not asked for more.
- Carried over unchanged, as he was told when approving the carrier change: huge and
  generated folders are skipped; secrets never leave the device. [chat 2026-11-11]

### 2.9 What is replaced, and the switch-over

- Today's remote access is replaced inside the apps: no Connect screen, no Tailscale for
  chats. The open-in-a-browser view stays, still through Tailscale, and is how a super-host is
  looked at. [D8 Q-3]
- There is no self-run relay. Self-hosting means a super-host. [D8 Q-4]
- The current handoff and takeover code is replaced, not patched. The conflict copies from
  2026-11-05 are left alone. [D1 Q-16, Q-17; D2 S-4]
- GitHub two-way chat sync is switched off the moment the mesh is deployed. Uploading to
  GitHub as a backup continues until the backup rebuild. Existing chats need no moving. A
  one-time message says what changed. [chat 2026-11-12]
- GitHub's one-time "restore to a new device" keeps working until the backup rebuild.
  [D12 Q-14]
- On day one, devices that already share chats through GitHub are combined quietly where one
  copy is simply longer; real differences are listed once, together. Projects already synced
  through GitHub are recognised as the same project without asking. [D12 Q-15]
- **Open (O9).** He approved: at the switch, a user with one device is asked to set up a
  backup or to say plainly they want none [D10 S-2]. That was approved when the switch was
  going to wait for the new backup. He later moved the switch ahead of the backup rebuild,
  so at the switch the only backups are today's (GitHub, and daily Drive or iCloud copies
  with no restore). What that prompt offers must be put to him.
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
- **Proposed** (rework of round 12 S-6, awaiting his yes): any device may back up what is
  new; the backup screen names chats that have never been on a backing-up device ("212 chats
  are not backed up yet. They are on Desktop.").
- **Open (O10).** He did not approve "a device only offers the choices that work on it".
  His words: "be a bit more creative in designing ways to get backups to work more
  consistently across all devices". [D10 S-3] The backup rebuild's own design must answer it.
- For later: backups hosted by YouCoded (card 253); storage growth (card 98).

---

## 3. What exists today (read this before designing against it)

Facts read in the code at the commits in the header. Paths are under
`youcoded/desktop/src/` unless noted. Android runs this same backend headless, so the
backend modules exist once. The start-up wiring exists twice: `main/main.ts` for desktop
and `main/headless/headless-boot.ts` (307 lines, "Keep it in step with main.ts") for the
phone. Anything wired at start-up must be wired in both.

### 3.1 Where chats live

| | Claude Code chats | Native (YouCoded's own) chats |
|---|---|---|
| File | `~/.claude/projects/<ccProjectSlug(cwd)>/<claudeSessionId>.jsonl` | `~/.youcoded/sessions/<nativeStoreSlug(cwd)>/<sessionId>.jsonl` |
| Written by | Claude Code itself; YouCoded only reads | `harness/session-store.ts`, plain append |
| Id | Minted by Claude Code; linked to the app's own session id in `sessionIdMap` at the first `SessionStart` hook | The app's id is the chat id |
| Grows only? | Usually. The watcher handles the file shrinking (`transcript-watcher.ts:989`), and `/clear` starts a new id. Destin's 295 compactions never removed a line. Treat as "almost always", and verify (5.3 and T2). | Yes, strictly. Compaction and `/clear` append marker events. |
| Helper files | `<slugdir>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json` | Ordinary session files with `parentSessionId`; big reports in `specialist-reports/` |
| Rendering | `transcript-watcher.ts` tails by byte offset and emits whole blocks | `HarnessSession` emits token pieces; the store merges them into one line per part |

Slug rules are in `main/slug-encoding.ts`; `nativeStoreSlug` is frozen. `conversations/
slug-repair.ts` repairs duplicates once per launch and never deletes.

Claude Code's saved tool outputs, plans (`~/.claude/plans/`) and to-dos are not read or
written by app code today. Their exact paths must be confirmed against the installed Claude
Code and recorded in `youcoded/docs/cc-dependencies.md` (pre-build item T3).

### 3.2 How chats sync today

There is no separate chat sync. Chats ride the **Personal space**, a folder
(`~/YouCoded/Personal/`) synced as one hidden git repository to the user's private GitHub
repo `youcoded-sync-personal`:

- `Conversations/<provider>/<id>.json` (the record) and
  `Conversations/<provider>/transcripts/<projectBasename>/<id>.jsonl` (a mirror of the
  transcript, copied in by `conversations/transcript-mirror.ts`).
- The same repository also carries `Devices/`, `ProjectSync/` (the project registry),
  `Tags/`, `ConversationNames/`, `Handoffs/` and Pages.
- A finished reply triggers mirror-in and an immediate sync (`conversations/service.ts:436`).
- Files over 50 MiB never sync. Conflicts produce `<id> (from <device>, <date>)` copies.
- **There is no switch for chat sync alone, and no upload-only GitHub mode.** Both must be
  built (section 7.11).

The `conversations/` folder is 6,362 lines. The handoff, takeover and lease code inside and
around it (about 2,500 lines: `handoff-*.ts`, `takeover.ts`, `lease-client.ts`,
`resume-admission.ts`, `ipc/handoff.ts`, the pending-handoff UI, the lease gate, and the
lease half of the Worker room) is what this design replaces.

Reusable model: `handoff-transcript.ts` already extends a copy only when the existing copy is
a byte prefix of the source, with a SHA-256 receipt.

### 3.3 How devices connect today

- `main/remote-server.ts` serves the whole app of one computer to a phone or browser over a
  plain WebSocket on port 9900, bound to the Tailscale address only. No encryption of its
  own. Sign-in is a password, then a saved per-device secret.
- A client connects to one computer at a time and sees all of its sessions. There is no
  per-chat host.
- An Electron desktop cannot be a client (`renderer/index.tsx:104-117`: Electron always
  renders the local app). Only Android and a browser can, through `renderer/remote-shim.ts`.
- Every feature is one entry in `main/ipc/channel-table.ts`, served through two doors:
  windows (`registerDesktopChannels`, line 151) and remote (`serveRemoteChannel`, line 195).
  Phone policy sits on the entry (`desktopOnly`, `remoteAllowed`, `refusal`, `remoteGuard`).
  `ChannelCtx.door` is `'desktop' | 'remote'` (`shared/backend-contract.ts:890`) and 29
  handler sites branch on it. Windows have positive audience ids, phones negative
  (`ipc/session.ts:406, 466`). A third mode already exists: `serveRemoteChannel(…, {owner:
  true})` is the Android app talking to its own backend, with refusals lifted. Parity tests
  guard the table (`tests/remote-channel-parity.test.ts` and neighbours).
- What a remote screen lacks is data in `shared/capabilities.ts`
  (`REMOTE_SCREEN_CAPABILITIES`); friendly names in `renderer/remote-unsupported.ts`.
  Whether image paste and file drag are refused for a remote screen today was not confirmed
  in code (pre-build item T9).
- Capabilities are per window, not per chat.

### 3.4 The Worker

`wecoded-marketplace/worker/src/sync/room.ts`: one `SyncGroupRoom` Durable Object per signed-in
account. It passes `space-updated` signals (replay ring of 32) and holds session leases. It
stores no chat data, has no list of which devices are on, and relays no bytes. Route
`GET /sync/hub` requires a GitHub-backed account token. Deployed by CI on master.

### 3.5 Devices, keys, lifecycle

- Device id: `main/device-identity.ts` (a per-install UUID and a per-machine id). A device
  registry lives in the Personal space (`sync-spaces/device-registry.ts`).
- Crypto in the app today: Node `crypto` and `bcryptjs` only. No key-exchange library.
- Secret storage: Electron `safeStorage` on desktop; on Android an AES-256-GCM shim keyed
  from the Android Keystore (`headless/electron-headless.ts:153`).
- Quit: `window-all-closed` quits (`main.ts:2068`). No background mode, no auto-launch, no
  windowless desktop mode. The Android backend (`headless/headless-boot.ts`) is the only
  windowless boot, and it runs under plain Node with Electron stand-ins.
- Keep-awake: `powerSaveBlocker` is used only for "keep awake for remote access". Android has
  a `keepAwake` host call (partial wake lock, 4 hour cap). No battery-exemption request, no
  wifi lock, no local network discovery anywhere.
- Versions: `PROTOCOL_VERSION` is sent to remote clients but nothing acts on a mismatch.

### 3.6 Project files and backup

- `main/sync-spaces/`: `engine.ts` watches with chokidar, waits 15 s (`debounceMs`, line
  142), polls every 120 s, then pulls and pushes each space through a `SyncTransport`
  (`types.ts:65`). `git-transport.ts` is the only implementation.
- The transport seam is real: the interface takes any git URL, and its contract suite
  (`tests/sync-transport-contract.ts`, 11 tests) runs against a local bare repository.
  GitHub-specific code sits around it (`ensureProvisioned`, the repo-visibility check,
  credentials).
- Conflict rule today: the remote version keeps the file's name; the local version becomes
  `name (from <device>, <date>).ext`. It converges because GitHub orders the pushes.
- No "listed but not downloaded" state exists: every active project in the registry is
  downloaded automatically (`materialization-planner.ts`; `runDiscovery` in `service.ts`).
- A device that already has content merges with `--allow-unrelated-histories`
  (`git-transport.ts:887`).
- No chat can be deleted or archived today; only renamed and flagged complete or priority.
  Delete is new.
- No per-project change counter exists; the git commit is the version.
- Guards (`guards.ts`): secrets list `NEVER_SYNC`, skipped folders `DEFAULT_IGNORES`, 50 MiB
  file cap.
- Backup: `daily-backup.ts` copies every space, chats included, to Google Drive (through
  `rclone`) or iCloud once a day. No restore exists. A "GitHub" backup type exists in the
  settings but copies nothing. `rclone` is not shipped on Android.
- A new device restores today by turning sync on: the first pull adopts GitHub's history, the
  registry downloads every project, and `materializeSweep` copies transcripts back.

### 3.7 Test rigs

- `scripts/run-dev.sh --offset N --profile name --label "…"` runs separate dev instances side
  by side. **They share `~/.claude` and the machine id**, so two dev instances on one
  computer are not two devices. A two-device rig does not exist (pre-build item T1).
- `bash scripts/verify.sh` runs types, related tests, knip, lint and ast-grep for desktop.
  Android and the Worker have their own checks.

---

## 4. Architecture

### 4.1 The parts

```
 ┌──────────────────────────── one device ────────────────────────────┐
 │  Renderer (unchanged shape)                                         │
 │     │  same IPC channels as today                                   │
 │  Session router ── local chat ─────► SessionManager / NativeHost    │
 │     │                                    ▲ working files            │
 │     └─ chat hosted elsewhere ─► Session proxy ─┐                    │
 │                                                │                    │
 │  Host control ◄─► Control logs      Notices    │                    │
 │       │                                        │                    │
 │  Chat store ◄─► Replicator ────────────────────┤                    │
 │  (lines, extras, chains, summaries)            │                    │
 │  Project carrier (git over mesh) ──────────────┤                    │
 │                                                ▼                    │
 │  Device set & keys ─────────►  Link layer (one interface)           │
 └───────────────────────────────┬───────────┬───────────┬────────────┘
                                 │           │           │
                          same-wifi direct   relay    super-host
                                          (blind)   (a full device)
```

| Part | Job | New or existing |
|---|---|---|
| Device set & keys | Device identity, pairing, the set's secret, removing a device | New (`main/mesh/identity/`) |
| Link layer | One interface for "send this sealed frame to that device or to the keeper", over whichever path works; presence | New (`main/mesh/link/`) |
| Relay | Blind waiting room, registers, presence, pass-through | New Durable Object beside `SyncGroupRoom` |
| Chat store | This device's canonical copy of each chat: lines, hash chain, extras, control log, summary | New |
| Replicator | "Everything after line N" between any two devices or a keeper | New; replaces `transcript-mirror` and the Personal-space chat lane |
| Control log | Host, takeovers, delete, versions, names, flags, per chat | New; replaces leases, `ConversationRecord`, `ConversationNames/` |
| Host control | Who hosts, takeover, the dropped half reply | New; replaces `takeover.ts`, `handoff-*`, `lease-client.ts`, `resume-admission.ts` |
| Session router + proxy | Makes a chat hosted elsewhere look local to the renderer | New; reuses the channel table |
| Project carrier | Moves git history between devices in place of GitHub | New carrier around the existing `GitTransport` |
| Storage policy | Keep everything / recent 30 days; Recently deleted | New |
| Lifecycle | Awake per reply, quit rules, wake checks | Extends `main.ts`, `headless-boot.ts`, `BackendService.kt` |
| Super-host | The headless boot, on a desktop OS | Extends `main/headless/` |
| Interim backup lane | Upload-only GitHub copy and one-time restore | New, temporary (7.11) |

### 4.2 Three ideas the rest depends on

**1. Two lanes.** Everything that moves between devices is in one of two lanes.

- **Durable lane.** Chat lines, extras, control-log entries, roster entries, project history.
  Stored, ordered, signed, verified by hash, retried until acknowledged, held by keepers.
  Losing a frame is a bug.
- **Live lane.** Token-by-token words, "reply running", open permission prompts, typing.
  Sent only to devices that have the chat open, never stored by a keeper, and rebuilt from a
  fresh snapshot after any gap. Losing a frame costs a moment of smoothness.

A watcher's screen is the live lane while connected. Its offline reading and its ability to
take over come from the durable lane.

**2. The chat store is the truth; runtime files are working copies.** Claude Code and the
native runtime keep writing their own transcript files exactly as today. On the host, an
adapter copies each new line from that working file into the chat store. On every other
device the working file is not read at all. When a device becomes host, it writes the
working file out from the chat store (moving any old one aside, never deleting it). This is
what lets a half reply be dropped without ever editing Claude Code's file in place.

**3. Nothing is merged or discarded by guesswork.** Whether one copy of a chat extends
another is decided by comparing hash chains. Who hosts is decided by one pure function over
the control log and the roster. When that function cannot give one answer, the result is
"two versions", shown to the user (2.7), never a silent choice.

### 4.3 How the parts act together: six walk-throughs

These are the interactions a builder most needs. Section 5 has the detail of each part.

**A. First device, then pairing a phone.**
1. First run: the device creates its keys and a device set of one. It talks to no keeper;
   there is nothing to sync. Every existing chat on disk is indexed into the chat store with
   this device as host (the same set of transcripts today's reconciler scans).
2. The user opens Devices → Add device. The device opens a meeting point (on the relay, or
   on the local network once same-wifi exists) and shows the QR and code.
3. The phone scans. The two run the key exchange. The computer shows "Add this device?".
4. On yes: roster entry signed and exchanged; set secret sent sealed. If the phone holds
   chats or projects of its own, the combine-or-cancel step runs on counts only.
5. Both connect to the keeper, if one is in use (O8), under the set's identifier.
6. Catch-up starts: control logs and summaries for every chat first (small; this fills the
   chat list within seconds), then lines of chats used in the last 30 days, newest first,
   then their extras. A "keep everything" device continues with older chats.

**B. Phone watches a native chat; the desktop loses power mid-reply; the phone continues;
the desktop returns.**
1. Watching: the phone's session proxy holds a live-lane subscription. Words arrive
   token by token. Lines arrive on the durable lane as each is written and are acknowledged.
2. Power loss: heartbeats stop on every path. After the offline rule (5.2) presence says
   the desktop is gone. Nothing is shown until the user opens or types in that chat.
3. The notice function sees: host offline; last durable line was mid-reply. It shows the
   "went offline partway through a reply" row. If the keeper's register says the desktop got
   further than the phone has, it shows the exact "N newer lines" row instead and the button
   reads "Continue from here as a new version".
4. On yes the phone appends a takeover entry naming the last finished reply it holds, sends
   it (keeper first, for ordering), writes the native working file from the chat store up to
   that point, and resumes. The chip changes everywhere.
5. The desktop restarts. Before any chat is resumed, at launch and on wake, it reads the
   control logs. For this chat it is no longer host. It compares its own lines with the
   takeover point:
   - Only an unfinished reply beyond it: those lines are dropped from its chat store, its
     working file is moved aside, and it shows the "continued on Phone" row.
   - One or more finished replies beyond it that the phone never received: those become a
     second version (5.4), and the "two versions" row appears on both devices.

**C. The same, for a Claude Code chat whose project is not on the phone.**
1. The notice adds the "project folder not here" row and stops to ask.
2. "Turn on sync and fetch": only possible if a device holding the project is on. The
   desktop is off, so the choice is shown as unavailable with the reason.
3. "Continue talk-only": the phone runs the chat in a scratch folder made for that chat,
   with file and command tools switched off (5.4), and adds the talk-only note.
4. When the chat later moves to a device that has the project, it resumes in the real
   folder and the "files can be used again" note is added.

**D. Two devices, both offline, continue the same chat, then meet.**
1. Each appends a takeover entry with the same parent. Neither reaches a keeper.
2. On meeting, control logs are exchanged. The function finds two takeovers with one parent.
3. The version whose takeover sorts first (5.4) keeps the chat's id. The other becomes a
   new version linked to it. Both keep all their lines.
4. Both devices show the "two versions" row.

**E. Removing a stolen phone that was hosting three chats.**
1. On the computer: Devices → Remove → the computer's own unlock.
2. A roster entry removes the phone. The computer creates a new key generation and sends it
   sealed to each remaining device, directly and through the keeper's per-device mailbox.
   The keeper stops accepting the phone at once.
3. The host function now reports those three chats as having no host. Opening one shows the
   "host was removed" row; continuing appends a takeover whose reason is `host-removed`.
4. Lines the phone wrote and never sent are not recoverable unless the phone is paired
   again.

**F. An "older" chat on a "recent" device.** The phone opens a chat last used 60 days ago.
Its list entry and summary are there; its lines are not. The relay dropped them at 30 days.
The replicator asks every online peer. If one has it, lines stream in and the chat opens.
If none is on, the "stored on Desktop, which is offline" row shows.

### 4.4 The seams

Each row is an interface to define first and test alone. Shapes are in section 6.

| # | Seam | Contract |
|---|---|---|
| S1 | Runtime file → Chat store (source adapter) | Input: a transcript path and the last indexed byte offset and chain hash. A **line** is the bytes up to and including a newline; a trailing partial line is never ingested. Output: new lines in order, each with its byte range; or `not-an-extension` when the bytes before the offset no longer hash to the stored chain. One adapter for Claude Code files, one for native. Runs only on the chat's host. Tests: append, partial write, truncate, rewrite, file replaced. |
| S2 | Chat store API | `head(chat, version) → ChatHead`; `read(chat, version, from, to) → lines`; `append(chat, version, lines, prevHash) → ok \| prefix-mismatch`, idempotent when the lines are already present; `hasExtra(hash)`, `readExtra(hash)`, `putExtra(hash, bytes)` verified against the hash; `appendControl(entry) → ok \| bad-signature \| duplicate`. Every write is atomic and survives a crash mid-write. |
| S3 | Replicator ↔ Link layer | `sendDurable(target, frame) → Promise<acked>`: kept and retried until the target acknowledges; order kept per chat and per project. `sendLive(target, frame)`: best effort, dropped under back-pressure. `onFrame(handler)`. `presence() → {device, path, since}[]` and a change event. The replicator never learns which path was used. |
| S4 | Link layer ↔ Relay | An authenticated WebSocket carrying opaque frames. Operations: `hold`, `fetch-after`, `ack`, `register-set` (compare-and-swap), `register-get`, `presence`, `meet` (pairing). Tests: a relay built with a logging shim records every byte it stores, and the test asserts none of it decrypts with any key in the test; a static check that the Worker imports no key-handling module from the app. |
| S5 | Host control ↔ Control log | `decide(entries, roster) → {host \| none, term, versions[], deleted, name, flags, talkOnly, minVersion}`. Pure, total, order-independent: any permutation of the same entries gives the same answer. Property-tested. No other code reads control entries to make a decision. |
| S6 | Session router ↔ channel table | For a chat hosted elsewhere, a channel call is serialised `{channel, payload, callId}` to the host, served there through `serveRemoteChannel` with a peer context, and answered. Host events for that chat are forwarded in the order emitted, each with a sequence number; a gap makes the watcher ask for a fresh `session:open` snapshot. Which channels a peer may call is the entry's existing policy plus one new flag. Parity test: every session-scoped channel is either forwardable or has a refusal. |
| S7 | Host control ↔ runtimes | `isReplyRunning(chat)`; `lastFinishedLine(chat)`; `stopForSwitch(chat) → {lastFinishedLine} \| failed(reason)` (host is on, user tapped the chip); `becomeHost(chat, uptoLine, mode: normal \| talk-only) → ok \| failed(reason)`, which writes the working file from the chat store and resumes; `releaseHost(chat)`, which moves the working file aside. When the old host is offline nothing is called on it; it runs `releaseHost` itself when it next reads the control log. |
| S8 | Project carrier ↔ GitTransport | The carrier gives `GitTransport` a remote that behaves like GitHub: `fetch` returns the sequencer's tip and the objects needed; `push` succeeds only as a fast-forward of that tip. `GitTransport`'s merge, conflict and repair code is unchanged. The existing contract suite runs against the carrier, plus the tests in T4. |
| S9 | Storage policy ↔ Chat store | `mayEvict(chat) → bool` (false when hosted here, when any line is unacknowledged by another device or keeper, or when used in the last 30 days); `evictBody(chat)`; `ensureBody(chat) → ok \| unavailable(holder)`. The chat list reads only summaries and control logs. |
| S10 | Notices | `notice(facts) → rows[]`, pure. `facts` is one record: host device and whether online, whether a reply was running at the last durable line, lines behind (known number, unknown, or zero), files behind, project present, secrets and skipped folders, sign-in present, features missing, version ok, host removed, body available. Rows come out in the fixed order of the table in 2.7. The UI only draws them. Snapshot-tested for every combination that can occur. |
| S11 | Mesh ↔ interim backup lane | The lane reads the chat store. It writes to it only in the one-time restore, and only when the store is empty. |

---

## 5. The subsystems

### 5.1 Device set, keys and pairing

**Keys (engineering call).**

- Each device creates, on first run, a signing key pair and a key-agreement key pair. Private
  halves are stored with `safeStorage` (desktop) or the Keystore-backed shim (Android) and
  never leave the device. A reinstall creates a new device.
- The device set has a **set secret** (32 random bytes), created by the first device. Durable
  and live frames are sealed with keys derived from it. It moves to a new device only during
  pairing, sealed to that device's key.
- The set secret has **generations**. Removing a device makes the remover create the next
  generation and send it, sealed separately to each remaining device's key. Frames name
  their generation. A device keeps every generation it was given, to read older frames.
- Every durable frame is also **signed by the sending device**, so one paired device cannot
  forge another's lines or control entries.
- The **roster** is a signed, append-only log: `add` (signed by a device already on it),
  `remove`, `rename`. Removals from two devices at once both stand (removal only ever
  shrinks the set). If two generations are created at once, the device that first sees both
  creates one more, covering the merged roster. Devices never seal new frames under a
  generation that a since-removed device holds.
- The relay holds only the public roster, to authenticate connections.
- Use an audited library; write no cipher. Node's `crypto` covers X25519, Ed25519, HKDF and
  ChaCha20-Poly1305. The typed-code path needs a password-authenticated key exchange, which
  Node lacks (T5).
- No frame body is ever logged, on a device or on the relay. Pinned by a test.

**Pairing flow.** As walk-through A. Details:

- The QR carries the meeting point, the existing device's key fingerprint and a one-time
  secret. The typed code carries the meeting point and a short secret, used in the
  password-authenticated exchange. Few tries; expires in minutes. [D12 Q-10]
- Until same-wifi direct exists, the meeting point is always on the relay, even for a user
  who will use no keeper.
- Two existing sets pairing: the scanning side joins the other side's set and hands the new
  secret to its own other devices. Rare; test it.
- **Leaving.** A device can remove itself. When the roster is empty the relay erases the
  set. Erasing a set nobody has used for a long time is O6.

**Removing a device.** Requires the acting device's own unlock [D12 Q-9]: Android
`BiometricPrompt`; macOS Touch ID or password; Windows Hello; a polkit prompt on Linux. A
desktop with none of these is O4 (T11 finds out).

### 5.2 Link layer and presence

One interface, three paths, tried in this order for a given peer:

1. **Same-wifi direct.** Devices announce themselves on the local network and connect
   straight to each other. The announcement reveals only that a YouCoded device is present.
   A peer is authenticated against the roster before any frame is accepted. Its own security
   review before release [chat 2026-11-11]. Nothing like local discovery exists in the app
   today; Android needs a multicast lock (T6).
2. **Super-host**, when the set has one and it is reachable.
3. **Relay**, when the user has it on.

Rules:

- A frame is byte-identical on all three paths. Paths differ only below seam S3.
- One connection per path per device; every chat is multiplexed over it.
- With no keeper and no shared wifi, two devices cannot reach each other. That is the
  decided "no keeper" behaviour: they catch up when next on the same network.

**Presence.** A device is "on" for another device when a heartbeat has arrived on any path
recently.

- Offline rule (engineering call, tuned in V3): a peer is offline after 30 seconds without a
  heartbeat **and** a failed reconnect on every path. A notice is offered only when the user
  opens or types in a chat. If the host reappears before the user answers, the notice is
  withdrawn.
- **A phone is "on" only while the app is in front, or is hosting a running reply, or the
  battery exemption is enabled.** Android cuts the network of a backgrounded app after a
  while, and there is no push channel in this design. A phone in a pocket therefore shows as
  offline to other devices, cannot be picked to start a chat on, and catches up when opened.
  This matches "devices that are off or asleep are greyed" but is worth stating to Destin
  after V7 measures it.
- Clocks: the relay's own clock times its 30-day rule. Device clocks time control entries.
  An entry dated more than a day in the future is refused. Nothing depends on two devices
  agreeing to better than a day.

### 5.3 Chat store and the copying system

**Which chats.** Every transcript the app already tracks: Claude Code files under
`~/.claude/projects` (including ones started in a terminal, as today's reconciler does) and
native files under `~/.youcoded/sessions`. A chat enters the store when its first line
exists. For Claude Code that is after the `SessionStart` hook has supplied the id.

**Identity.** `chat id = provider + ":" + the runtime's own session id`. `--resume` keeps the
id and the file. `/clear` in Claude Code starts a new id, which is a new chat, as today.

**The store** (engineering call: under the app's data folder, never inside a synced space).
Per chat and version:

- The lines, in **segments**. A segment is an append-only run. A new segment starts only
  when the host's adapter reports `not-an-extension` (the runtime rewrote or shrank its
  file). Other devices then recopy that chat from the new segment's start.
- A **hash chain** per segment: `h[0] = SHA-256(chat id ‖ segment number)`,
  `h[n] = SHA-256(h[n-1] ‖ raw bytes of line n)`.
- The **head**: `{version, segment, line count, chain hash}`. Comparing two heads, plus one
  lookup of "what was your hash at my line count", tells whether one copy extends the other.
- The control log, the summary (5.4) and a manifest of extras by content hash.

**Copying.** One system for live sending and catching up [D4 Q-1]:

- The host sends each new line as it is written, to every online device and to the keeper,
  on the durable lane.
- A device that was away asks any peer or the keeper: "chat X, version V: I have N lines
  ending in hash H". The answer is the lines after N; or `gap` (the keeper no longer has
  the lines just after N: get them from a device); or `not-a-prefix`.
- Any device can answer, not only the host. [D4 S-2]
- When two devices meet they exchange one table of heads for every chat and each fills in
  the other where it is ahead.
- `not-a-prefix` is settled by `decide` (S5), never by guessing. The asker is on a dropped
  half reply (drop it), or holds a second version (keep both), or has a damaged copy
  (recopy; the old bytes are moved aside, not deleted).
- **Order of catch-up:** control logs and summaries of all chats; then lines, most recently
  used chat first; then extras. Lines never wait behind extras.
- Extras move by content hash; a device asks only for hashes it lacks.
- Frames are chunked to fit the relay's limits (T7).

**Extras, by location** (confirm in T3):

| Extra | Claude Code chat | Native chat |
|---|---|---|
| Helper working files | `<slugdir>/<sessionId>/subagents/` | Child session files with `parentSessionId` |
| Saved long outputs | `<slugdir>/<sessionId>/tool-results/` | `specialist-reports/`; Bash overflow is written to the temp folder today and must move somewhere durable to travel |
| Plan | The file in `~/.claude/plans/` named in the chat's lines | In the chat's lines |
| To-do list | `~/.claude/todos/` entries for the session | In memory only today; nothing to carry until it is saved |

When a device becomes host, `becomeHost` writes these back to where the runtime expects
them, for the local project folder.

### 5.4 Control log and host control

The control log is a short, append-only list of signed entries per chat (shapes in 6.3). It
is how every device learns who hosts without asking a server, and where the divider lives.

**`decide(entries, roster)`** (seam S5):

- **Host.** The `to` of the latest valid takeover on the main version, else the creator. If
  that device has been removed from the roster, the chat has **no host**, and any device may
  take over at once.
- **Term.** The number of takeovers so far. Lines carry the term they were written in.
- **Valid takeover.** It names its parent: the previous takeover's id, or `created`. Two
  takeovers with the same parent are a split.
- **Ordering a split.** If a keeper accepted one (its register changed by compare-and-swap
  from the parent to that takeover), that one is first. If no keeper saw either, the one
  from the lower device id is first. The first keeps the chat id; the other becomes a
  version with its own id, linked by a `version` entry. Both keep every line.
- **Deleted, name, flags, talk-only, minimum app version:** last entry of each kind wins,
  ordered by term then by time.

**The takeover point and what happens to lines beyond it.** A takeover names
`{line count, chain hash}` of the last *finished reply* in the taking device's copy. A reply
is finished at the runtime's own end-of-reply marker (the event the app already treats as
`turn-complete`).

On every device, lines of the previous term beyond that point are sorted into two kinds:

- **A trailing unfinished reply.** Dropped from the chat store. This is the decided "half
  reply is dropped on both sides".
- **Finished replies the new host never had.** These are not dropped. They form a second
  version, and the "two versions" row is shown. This is the decided "may be behind … could
  create a second version" case coming true.

The old host never edits its runtime's file in place. `releaseHost` moves the working file
aside (a quarantine folder, as slug repair does today) and the chat store holds the truth.

**Becoming host** (`becomeHost`, seam S7):

1. Make sure lines up to the takeover point and the extras are in the chat store (fetch if
   needed; if they cannot be fetched, the notice already said so).
2. Write the working file from the store: for Claude Code,
   `~/.claude/projects/<ccProjectSlug(local folder)>/<id>.jsonl` plus `subagents/`; for
   native, its session folder. `resolve-local-project.ts` maps the chat to a local folder.
3. Resume (`--resume <id>` for Claude Code). The source adapter starts from the store's head.
4. A crash between the entry and the resume is safe: on next launch the device is host by
   the log and simply runs steps 1 to 3 again.

**Chip switch while the host is on.** The new host asks the old host to `stopForSwitch`. The
old host waits for a running reply to end (decided), stops, replies with its last finished
line, and the takeover names that point. No lines are beyond it.

**Talk-only.** The chat runs in a scratch folder created for it under the app's data folder,
with file-writing and command tools switched off for that run (Claude Code's own tool
restrictions; the native runtime's binding). A `talk-only on` entry is appended and the note
is given to the assistant. Returning to a device with the project: `becomeHost` in normal
mode in the real folder, `talk-only off`, and the "files can be used again" note. T3 and T10
must show Claude Code resumes a chat in a different folder than it was written in.

**Showing the divider and telling the assistant.**

- The renderer draws the divider from the takeover entry at its line, reusing the system
  marker of the model-switch divider (`MODEL_SWITCH_MARKER`, deterministic id;
  `renderer/state/transcript-event-actions.ts:361`). The id is the takeover entry's id.
- The assistant is told at the next message. Native chats: append a transcript event (the
  file is ours). Claude Code chats: add the note as hook context on the next prompt, through
  the app's hook scripts, so nothing is written into Claude Code's file (T3).

**Versions as data.** The store key is `(chat id, version id)`. The main version's id is the
chat id. A deliberate fork and an accidental split both create a new version id with a
`version` entry `{from, at line, deliberate}`. The resume browser groups by that link.
Deliberate forks of Claude Code chats use its own fork-on-resume so the runtime assigns the
new id (T3).

**Summary.** The host appends a `summary` entry at most once per finished reply:
`{title, project id and name, last line time, line count, model label}`. The chat list on
every device is drawn from summaries and `decide`, so it never needs a chat's lines.

**Deleting.** A `deleted` entry. When it reaches the host, the host stops any running reply
as if the chat were closed, and keeps the body in Recently deleted. Lines that arrive after
the entry are kept with the body. Deleting a chat whose host is offline takes effect on the
other devices at once and on the host when it returns. After 30 days from the entry's time
each device removes the body and keeps the entry. `restored` within 30 days undoes it
everywhere. Whether deleting a chat that is mid-reply asks for confirmation is a screen
decision for its review deck.

**Names.** `renamed` entries replace `Personal/ConversationNames/`. Existing names are
converted on day one. Tags stay where they are.

### 5.5 Watching: session router and proxy

Goal: the renderer does not know whether a chat runs here or elsewhere, apart from the chip
and the capability limits.

- Today the remote client is a renderer-side shim that replaces the whole backend
  (`remote-shim.ts`). That cannot give per-chat hosts and cannot run inside Electron.
- New: in the main process a **session router** inspects each session-scoped call. A local
  chat goes to `SessionManager` or the native host as now. A chat hosted elsewhere goes to a
  **session proxy**, which forwards the call to the host on the live lane and republishes
  the host's events for that chat on the same local channels (`transcript:event`,
  `session:live`, `hook:event`, and the rest).
- **On the host** (engineering call, from the code check): forwarded calls are served by
  `serveRemoteChannel` with a peer context, not by a literal third door. Adding a third value
  to `ChannelCtx.door` would touch 29 handler sites. Instead: the context stays
  `door: 'remote'`, gains a `peer` field, and each paired device gets its own audience id in
  a new range, so the existing "send to this audience" logic in `ipc/session.ts` works. One
  new policy flag on channel entries says whether a paired device may call it. The existing
  `owner: true` mode is the precedent.
- Opening a watched chat uses the existing fill path (`session:open`): a snapshot, then live
  events with sequence numbers. A gap triggers a fresh snapshot.
- **Capabilities become per chat.** A watched chat gets the remote-screen set
  (`shared/capabilities.ts`); local chats keep the device's own. The refused-feature list and
  message stay in `renderer/remote-unsupported.ts`, extended to the limits in 2.1.
- **Permission prompts** are live-lane state held by the host. Every device with the chat
  open shows it; the first answer wins; the prompt is withdrawn everywhere. The path exists
  today for one remote client (`permission:respond`).
- **A message typed on a watcher** is a forwarded call with a call id. No acknowledgement
  within a few seconds while presence says the host is gone: the box keeps the text and
  shows "Not sent. Desktop went offline" with the Continue here offer. If the host did
  receive it, the call id stops it being sent twice. (Typed text is kept; a running reply is
  not. The two are different on purpose: the first is the user's words, the second can be
  asked for again.)
- **Starting a chat on another device** is a forwarded `session:create` naming a project
  that device has.
- **Version mismatch.** Devices exchange app versions at connect. If the watcher is too old
  for the host's live protocol, it falls back to the durable lane only: the chat appears as
  its lines arrive, without typing into it, and shows the update notice.

### 5.6 The relay

A new Durable Object class beside `SyncGroupRoom` (do not extend the account room; this one
has no account). One object per device set, named by the set's public identifier (a hash of
the first device's public key, fixed for the life of the set).

It does five things, all blind:

1. **Authenticate** a device by a signed challenge against the public roster. The room is
   chosen from the authenticated key, never from an id the client sends.
2. **Pass through** frames between connected devices. Not stored, not counted.
3. **Hold** durable frames in groups: one group per chat (lines and extras), one per
   project (history bundles), one mailbox per device (key generations, roster entries).
   - A frame is dropped when every device on the roster has acknowledged it. A device set to
     "recent" that does not want an old chat acknowledges it as not wanted.
   - A chat's group is dropped 30 days after that chat's last line, by the relay's clock.
   - Bytes held count toward 1 GB per set. At the limit it releases whole groups, least
     recently used first, never the group being written while any other remains, and tells
     the sender which. New lines for a released chat are accepted again; a device asking for
     the missing stretch gets `gap`.
   - A project's first full download is never held (too large by design).
4. **Registers**, kept with no time limit, each an opaque value changed by compare-and-swap:
   per chat a **head register** (the note: sealed and signed by the device that wrote it)
   and a **host register** (the id of the latest takeover); per project a **tip register**.
   The relay compares opaque values for equality and nothing else.
5. **Presence**: which roster devices are connected.

Also: pairing meeting points (short-lived, few tries); roster updates; erase on empty roster.

**What the relay can and cannot do if it misbehaves.** It can delay, withhold, or replay an
old register. It cannot read, forge or alter anything: registers and frames are signed by
devices and checked on arrival, and a device never accepts a head older than one it has
already seen. The worst outcome is a device wrongly believing it is up to date, or two
takeovers both being told they were first. Both are caught when the devices next exchange
control logs, and surface as "two versions". This is what "nothing in the middle is trusted"
means in practice.

**Limits with no account** [D12 Q-11]: new sets are rate-limited per network address; each
set is capped at 1 GB and at a frame rate. During the build the relay accepts only an
allow-list of test sets (section 10). A sign-in is the fallback if abuse appears.

**Cost** (from `connection-options.md`): the Worker is on Cloudflare's free plan. Live words
are batched (about every quarter second). Storage is the cost that grows. Large frames may
be better kept in Cloudflare's object storage with the Durable Object as the index; T7
decides.

### 5.7 Project files over the mesh

Keep `GitTransport`'s staging, guards, merge, conflict copies and repair exactly as they
are. Replace only "GitHub" with something that behaves the same way.

**Why order matters.** Today's rule ("the incoming version keeps the name, this device's
becomes the copy") converges only because GitHub puts everyone's pushes in one order. Two
equal devices merging each other at the same moment would each treat the other as incoming
and never settle.

**The sequencer (engineering call).** For each project there is always exactly one
sequencer among the devices that can currently reach each other:

- the keeper, when one is reachable (the relay's tip register, or the super-host);
- otherwise the online device with the lowest device id.

A device sends its new history to the sequencer as a fast-forward only. If the sequencer's
tip has moved, the send is refused; the device fetches, merges with the existing code, and
tries again. That is exactly the push-rejected path that exists and is tested today. Two
groups of devices that were apart each had their own sequencer; when they meet, the group
whose sequencer loses its role merges, as an ordinary device would.

- **Carrier.** History moves as incremental git bundles in durable frames. Nothing like this
  exists in the app today (no `git bundle` use). T4 proves it.
- **If T4 fails:** fall back to one fixed sequencer per project (a device the user's set
  names), accepting that files move only while it is on. Do not build peer merging by hand.
- **The note** is the tip register plus a counter that rises with each change; the counter
  is what the notice quotes. Sent the moment files change. [D10 Q-2]
- **Listed versus downloaded.** The project registry (in the Personal space) lists every
  project. Which are downloaded on this device becomes a local, per-device set, replacing
  download-everything in `materialization-planner.ts`. Projects already on a device at the
  switch stay on.
- **First download** comes straight from a device that has the project and is on. [D9 S-3]
- **The wait** drops from 15 s to about 2 s for the mesh carrier only (`engine.ts:142`); V5.
- **The Personal space** (project registry, tags, Pages) is a space like any other and rides
  this carrier. `Conversations/`, `ConversationNames/`, `Handoffs/` and `Devices/` stop being
  written and are excluded; the roster replaces the device registry.
- **Same project or not** at pairing: the same when the two hidden histories share a root
  commit (true for anything already synced through GitHub); otherwise the question in 2.4.
- **With the relay unreachable and not on the same wifi,** two devices' files do not move
  until a path exists. Nothing is lost; the note cannot be read either, so the "may be
  behind" row applies.

### 5.8 Storage policy

- "Keep everything": every chat's lines and extras stay.
- "Recent": lines and extras of chats not used for 30 days may be evicted; the summary and
  control log stay. Opening one calls `ensureBody` (walk-through F).
- Never evicted: a chat hosted here; a chat with lines no other device or keeper has
  acknowledged.
- "Recently deleted" holds deleted chats for 30 days on each device.

### 5.9 Lifecycle

- **Awake per reply.** Take a `powerSaveBlocker` (desktop) or the existing `keepAwake` host
  call (Android, already capped at 4 hours) when a reply starts on this host; release when
  it ends; a hard cap on desktop too.
- **Battery exemption.** A new Android setting the user opts into. [D6 Q-3]
- **Quit.** Compare each hosted chat's head with what a keeper or any peer has
  acknowledged. All finished replies acknowledged: quit at once. Otherwise allow a few
  seconds for project changes, then quit and show the line in 2.6. Today's shutdown already
  caps teardown at about 6 seconds.
- **Launch and wake.** Before any hosted chat continues or is resumed, read its control log
  (walk-through B step 5). Wire this in both `main.ts` and `headless-boot.ts`.

### 5.10 Super-host

- The phone's backend already boots the whole app with no window under plain Node
  (`headless/headless-main.ts`, `headless-boot.ts`, stand-ins in `electron-headless.ts`). A
  super-host is that boot on Windows, Mac or Linux, started at login.
- What is phone-specific in that boot today and must be generalised: the owner token and
  secret key arrive on stdin from the Android service; secret storage is a shim keyed by
  that supplied key and reports itself as the Android keystore (a desktop super-host needs a
  real key source, such as the OS keychain); `headless-boot.ts:132-134` hard-codes the
  platform as Android; the host-call socket is Android's (calls answer locally when it is
  absent, which is fine); keep-awake has no desktop stand-in.
- It needs: a way to start at login on each OS; pairing without a screen (it prints a code,
  or is paired from its browser view); the existing remote server in Tailscale mode as its
  browser view.
- It is an ordinary roster device on "keep everything", and the preferred sequencer.
- Reaching it from outside the home, and locking its browser view beyond Tailscale: O1.
- Whether it runs acceptably on a Raspberry Pi: T8.

### 5.11 Versions

- The link layer exchanges app version and mesh protocol version at connect.
- A `format` control entry names the minimum app version that may host or continue a chat.
  An older device may read and watch. [D12 Q-12]
- Unknown control-entry kinds and unknown frame kinds are kept and passed on, never dropped.

---

## 6. Data shapes

Engineering proposals, precise enough to start; a builder may refine field names. Sizes
matter: registers and control entries must stay small.

**6.1 Frame envelope** (what a keeper sees is only the outside):

```
outside:  { v, set, toDevice | "all", group: "chat:<id>" | "project:<id>" | "device:<id>" | "live",
            seq, bytes }                      // routing and accounting only
sealed:   { kind, fromDevice, generation, counter, sentAt, body }
          + signature by fromDevice           // durable frames
kinds:    lines | extra-chunk | control | roster | keygen | bundle-chunk | head-table |
          want | ack | live-event | call | call-result | hello
```

**6.2 Chat head and catch-up**

```
ChatHead    { chat, version, term, segment, lines, hash }
want        { chat, version, segment, haveLines, haveHash }
answer      lines{ from, lines[] } | gap{ from, to } | not-a-prefix{ theirHashAtMyCount }
head-table  ChatHead[]                        // exchanged when two devices meet
```

**6.3 Control entry**

```
{ id, chat, version, kind, body, device, at, signature }
created    { host, provider, projectId }
takeover   { parent, to, atLines, atHash, reason: chip | host-offline | host-removed | offline }
version    { from: versionId, atLines, deliberate }
segment    { segment, startsAtLines }
summary    { title, projectId, projectName, lastLineAt, lines, model }
renamed    { title }       flag { name, on }       deleted { }       restored { }
talk-only  { on }          format { minAppVersion }
```

**6.4 Registers on a keeper** (opaque to it)

```
head  chat:<id>     sealed+signed { ChatHead, heldBy: device, counter }
host  chat:<id>     takeover entry id
tip   project:<id>  sealed+signed { tip commit, counter, device }
```

**6.5 Roster entry**

```
{ id, kind: add | remove | rename, device, name, platform, signKey, agreeKey, by, at,
  parent, signature }
```

**6.6 Chat-list row** (derived, never stored remotely): `decide` output + latest `summary` +
local facts (body present? lines behind? waiting to send?).

---

## 7. Changes to existing code, by area

The old system keeps working until Phase 7. Nothing in the "Remove" column is touched
before then.

| # | Area | Add (Phases 1 to 6, behind the switch) | Remove or change (Phase 7 and after) |
|---|---|---|---|
| 7.1 | `main/conversations/` | — | Delete `handoff-*.ts`, `takeover.ts`, `lease-client.ts`, `resume-admission.ts`, the handoff glue in `service.ts:887-1042`, `transcript-mirror` into the Personal space, `ConversationRecord` syncing. Keep naming logic, tags, slug repair, `resolve-local-project`. |
| 7.2 | `main/mesh/` (new) | identity, link, store, replicator, control, host, proxy, policy | — |
| 7.3 | `main/ipc/` | A `mesh` channel family (devices, pairing, host, storage); the peer context and flag in `channel-table.ts` | Delete `handoff.ts` and the `HANDOFF_*` channels |
| 7.4 | Renderer | Host chip, the notice, Devices screen and pairing, storage setting, Recently deleted, project "sync on this device", keeper settings, delete chat. All through review decks. | Delete the pending-handoff views, `resume-lease-gate.ts`, `takeover-dialog-copy.ts`, the MovedGate |
| 7.5 | Remote access | — | Remove the Android "Connect to Desktop" screen and desktop "Remote access" pairing for app use. Keep `RemoteServer` in Tailscale mode for the browser view and in local mode for the Android app's own screen. |
| 7.6 | `main/sync-spaces/` | The mesh carrier beside `GitTransport`'s GitHub remote; per-device downloaded set; 2 s wait for the mesh carrier | Stop GitHub pull; exclude `Conversations/`, `ConversationNames/`, `Handoffs/`, `Devices/` |
| 7.7 | `main/session-manager.ts`, native host | Seam S7; awake-per-reply | `stopSessionForHandoff` |
| 7.8 | `main/main.ts`, `headless/headless-boot.ts` | Mesh start-up, quit rule, launch and wake checks, in both | Lease wiring (`main.ts:1014`, `headless-boot.ts:186`) |
| 7.9 | `main/headless/` | Desktop super-host boot (Phase 8) | — |
| 7.10 | Android (`app/`) | Battery-exemption setting; multicast lock; QR scanning exists (`QrScannerOverlay.kt`) | `PairedDeviceStore.kt` for app use |
| 7.11 | Interim GitHub lane | See below | Deleted by the backup rebuild |
| 7.12 | Worker | New Durable Object and route | Lease operations in `SyncGroupRoom`, once no shipped version uses them |
| 7.13 | Docs | — | `youcoded/docs/conversations.md`, `sync-spaces.md`, `native-runtime.md` rewritten for the parts that change; they are already stale in places |

**The switch.** One local setting, off by default, in the app's own settings file, readable
by both boots. Off: the app behaves exactly as today and none of `main/mesh/` starts. On
(dev instances and testers only, until Phase 7): the mesh runs and, in that instance, the
Personal-space chat lane is off. Phase 7 turns it on for everyone and removes the old code
in a later release, once no rollback is needed.

**7.11 The interim GitHub lane (engineering call; lives from Phase 7 to the backup rebuild).**

His rule: GitHub chat sync off at mesh deploy; GitHub backup continues; one-time restore
keeps working; never both systems syncing. Today there is no upload-only mode and chats are
part of the two-way Personal repository. So:

- **At the moment a device switches** it does one last ordinary sync, so nothing sitting on
  GitHub is missed, then stops pulling for good.
- From then on each device pushes its own branch of the Personal repository (for example
  `mesh-backup/<device id>`) holding a snapshot of the chats it has. Only that device ever
  writes its branch, so there is nothing to merge. Git stores identical files once, so
  several devices holding the same chats cost little. This answers "which device uploads":
  every device that has GitHub connected.
- Spaces (Personal without chats, and projects) keep pushing their history to GitHub as a
  plain upload. A refused push is skipped and retried later, never settled by pulling.
- One-time restore, offered only when the chat store is empty: fetch the branches (and the
  old main branch), take the longest copy of each chat, load the store, pull each project
  once. [D12 Q-14]
- Known costs: not slimmed, so the repository keeps growing (4.28 GB on 2026-11-12); chats
  over 50 MiB are still not uploaded.

**Devices that have not switched yet.** A user's devices update at different times. A device
still on the old version keeps syncing with GitHub and with other old devices; a switched
device no longer reads GitHub. Until every device is updated and paired, the two groups do
not see each other's new chats. Nothing is lost: when a late device updates, its last sync
runs, it is paired, and its chats flow over the mesh. The one-time message must say this
plainly. Whether the switch should instead happen when a device is *paired* rather than
when it is *updated* is put to Destin (O11).

**Rollback.** Until the old code is removed, turning the switch off on a device restores
the old lane: the chat store is copied back into `Personal/Conversations/` and ordinary
GitHub sync resumes, with the existing conflict-copy behaviour for anything that diverged.
Rehearse this in Phase 7.

---

## 8. Security

**Promise.** Contents that sync are readable only on the user's devices. A keeper sees
sizes, counts, timing and public keys. Cloud backup is separate and locked only if the user
turns the lock on.

**Must be true.**

1. No private key or set secret is written to a synced folder, a backup, a log, or sent to
   any server.
2. A device is accepted only if on the signed roster; the relay's say-so is never enough.
3. The relay picks the room from the authenticated key.
4. Durable frames are sealed, signed by the sender, carry generation and counter, and are
   refused on replay.
5. Pairing cannot be completed by someone who only sees relay traffic; the typed code allows
   few tries and expires.
6. Removing a device creates a new generation before anything new is sealed.
7. Same-wifi direct accepts nothing before roster authentication and announces only
   presence.
8. No frame body in any log.
9. A relay that lies can cause delay or a visible "two versions", never a silent loss or a
   forged line (5.6).

**Reviews.** A written threat model before Phase 1 is accepted. The decided review of
same-wifi direct. **Proposed (O5):** an outside review by a person before "end-to-end
encrypted" is used as a headline; until then, "locked so only your devices can read it".

**Limits to state honestly.** A stolen device keeps what it had. Someone who knows a
device's unlock can remove other devices. The browser view is protected by Tailscale only.

---

## 9. Before building: tests and evaluations

Small, outside the product or behind the switch, each with a pass line that can be checked.

| # | Question | How | Pass |
|---|---|---|---|
| T1 | Can real "devices" be run for tests? | A rig: N backend instances with separate home folders (not just profiles: dev instances share `~/.claude` and the machine id), a relay in-process, the ability to cut any link, and an **inventory tool** that lists every chat id, version, line count and chain hash per device. | One command runs 3 devices and a relay; the inventory of two devices can be diffed. |
| T2 | Do chats only grow? | Run the source adapter over every chat on Destin's desktop; then exercise `/compact`, `/clear`, resume-from-summary and a kill mid-write. | 100% of non-append events are reported as `not-an-extension`; zero pass silently. |
| T3 | Claude Code facts | Read the installed version's on-disk layout. Check: `--resume` keeps the id; resume in a different folder works; fork-on-resume gives a new id; tool restrictions make a run talk-only; a prompt hook can add context; where tool outputs, plans and to-dos live. Record all in `youcoded/docs/cc-dependencies.md`. | A chat moved to a second home folder follows up a helper, rereads a saved output, sees its plan, and repeats back a takeover note. Each fact has a written yes or no. |
| T4 | Does project history converge? | Extend `sync-transport-contract.ts`: three devices, clashing edits, bundles in every delivery order, sequencer changes mid-way, a partition and rejoin. Property-test 1,000 random schedules. | Every schedule ends with identical trees and tips on all devices, no repeated clash, no file lost. The existing 11 tests pass against the carrier. |
| T5 | Key-exchange library | Shortlist audited libraries; run pairing between a desktop and the Android headless backend. | Pairs on Windows, macOS, Linux and Android; under 3 s on the phone; under 1 MB added. |
| T6 | Same-wifi discovery on Android | Under the foreground service with a multicast lock, screen on and off, on three ordinary routers. | Found within 5 s with the screen on, on all three; failures with the screen off written down. |
| T7 | Relay fit and cost | Prototype hold, ack, release and registers with 1 GB of frames, one 300 MB chat, batched live words; compare Durable Object storage with object storage. | Inside platform limits; a monthly cost per heavy user and per 1,000 mixed users, stated as numbers. |
| T8 | Super-host hardware | Boot the headless backend on a plain desktop and a Raspberry Pi 5; host a chat. | 48 hours without restart; memory and idle load written down; if the Pi fails, say so. |
| T9 | What a remote screen refuses today | Try image paste, file drag, Office and the browser from a phone client; read `InputBar.tsx`. | A table of each decided limit in 2.1: enforced today, or needs building. |
| T10 | Different folder paths | Resume a Windows-hosted chat on Linux and on the phone with the project present; then talk-only. | The assistant edits a file correctly on the new device; in talk-only it does not try to. |
| T11 | OS unlock prompts | Try each desktop OS. | Works, or O4 goes to Destin. |
| T12 | A misbehaving relay | In the rig, make the relay replay old registers, drop frames, and accept two takeovers. | No device shows wrong content; every case ends in catch-up or a "two versions" row. |
| T13 | Key generations | Remove a device while another is off for a day; two removals at once. | Every remaining device reads everything sent after; the removed device reads nothing sent after. |
| T14 | Mixed versions | Rig with one device on protocol N and one on N+1. | The older reads and watches (or falls back to lines only) and never corrupts a chat. |
| T15 | Phone in the background | Measure how long a backgrounded phone keeps its connection, with and without the exemption, screen off. | Numbers written down; 5.2's statement about phones confirmed or corrected. |

---

## 10. Build order

Destin's order: mesh first, backup rebuild after [chat 2026-11-12]; relay before the
own-device keeper [D5 Q-1]. The phases within that are an engineering call. Each can be
tested alone in the T1 rig. Phases 1 to 6 change nothing for users: the switch (section 7)
is off, old code is untouched, and the new relay accepts only an allow-list of test sets.

| Phase | Builds | Destin sees (review decks) | Done when |
|---|---|---|---|
| 0 | T1 to T15 | A plain report of results and any decision they force | Each pass line is met, or the design is amended and he has agreed to anything he can see |
| 1. Devices | Keys, roster, generations, pairing (QR and code, relay meeting point), removal, link layer over the relay, relay (authenticate, pass-through, presence, mailboxes, rate limits, allow-list) | Devices screen, pairing, removing | Three rig devices and a real phone pair; T13 passes in the product; threat model written |
| 2. Chats copy | Chat store, adapters, hash chain, control log (`created`, `summary`, `renamed`, `flag`, `deleted`, `restored`, `segment`), replicator, relay holding, registers, 30-day and 1 GB rules, storage setting, Recently deleted, the chat list | Chat list on a second device (reading only), storage setting, deleting | A chat written on A is readable on B in under 2 s, and after B was off for a day; inventories match; T2 and T12 pass in the product |
| 3. Watching | Session router and proxy, peer context, per-chat capabilities, host chip, permission from any device, unsent message, start on another device, version fallback | Watching and typing into a chat hosted elsewhere | A watcher drives a full reply on a remote host, desktop and phone; parity tests green; T14 passes |
| 4. Project files | Mesh carrier, sequencer, tip register, per-device download, 2 s wait, same-project question | Project list with "sync on this device"; pairing with data on both sides | T4 passes in the product; a project edited on two hosts converges |
| 5. Host changes | `takeover`, `version`, `talk-only`, `format` entries; `decide`; seam S7; divider and assistant note; notice function and screen; awake per reply; quit rule; launch and wake checks | Every notice row, the divider, quitting | Every row in 2.7 reproduced in the rig, including walk-throughs B to E and a crash between each step of a takeover |
| 6. Same wifi | Discovery, direct path, local meeting point | Nothing new on screen | Its security review passes; phases 2 to 5 pass with the relay switched off |
| 7. Switch-over | Interim GitHub lane, last sync, one-time restore, day-one combine, one-time message, backup prompt (O9), removal of in-app remote access, rollback | The one-time message and prompts | Rehearsed on copies of Destin's four devices, updated one at a time: the inventory tool shows every chat present once on every device; rollback works; then the switch is turned on for users |
| 8. Super-host | Desktop headless boot, start at login, pairing without a screen, relay fallback, outside access (after O1) | Super-host setup | A super-host keeps two sleeping devices current with the relay off (T8 numbers hold) |
| 9. Backup rebuild | Its own design pass first (cards 241, 98, 121, 253; O10): one backup, slimming, restore, locking, GitHub fresh start; deletes the interim lane | New Backup screen | Separate acceptance |

Why this order: project files (4) come before host changes (5) because several notice rows
need project notes and fetching. Same wifi (6) comes before the switch-over (7) because "no
keeper at all" only works once devices can talk directly. Phase 8 can move later without
blocking 7. Old code is deleted in a release after Phase 7, when rollback is no longer
needed.

---

## 11. After building: what to measure and watch

Targets are starting points. V1 to V5 are thresholds; a miss is a bug. V6 to V11 produce
numbers that are reported to Destin with a recommendation.

| # | Measure | Target or report |
|---|---|---|
| V1 | Word on host to word on watcher | Under 0.3 s same wifi; under 1 s through the relay |
| V2 | Catch-up after a device was off | 1 MB chat under 2 s; a 300 MB chat completes with the app staying responsive |
| V3 | "Host offline" | Zero false notices across 100 wifi blips of under 10 s; a real loss detected within 45 s |
| V4 | Takeover, tap to ready | Under 5 s when lines are already here |
| V5 | File change to arrival | Under 5 s; during a burst of 200 edits, sends stay under one per 2 s |
| V6 | Relay storage and requests per user per day | Report from Destin's real use; restate cost per 1,000 users |
| V7 | Phone battery | Report: per hour watching, per hour hosting, per day in the background, with and without the exemption |
| V8 | Phone mobile data per day | Report; feeds card 258 |
| V9 | First pairing with hundreds of chats | Chat list complete in under 30 s; app usable throughout; total time reported |
| V10 | Memory and start-up added | Report against `.claude/rules/performance.md` |
| V11 | Hidden history growth at 2 s with two hosts | Report after a week |

**Experience** (the context-free tester in `scripts/ui-review/ux-tester.md`, then Destin):

- The everyday case: leave home with the computer asleep, continue two chats on the phone,
  one with its project and one talk-only, come home, bring them back.
- A first-time user pairs two devices without instructions.
- Each notice is understood; a four-row notice is readable.
- Talk-only: does the assistant stay sensible about files it described earlier?
- "Both copies kept" files after two hosts edit one project: noticed and understood?
- A watcher on a desktop understands why image paste is refused.
- "Relay full", "stored on Desktop, which is offline", and a phone showing as offline while
  in a pocket: understood?
- A user whose devices update at different times understands the one-time message.

**Keep watching after launch.** Any `not-an-extension` event; any "two versions" not caused
by a real offline split; any repeated file clash; any inventory mismatch between devices.

---

## 12. Risks, in order of concern

1. **Project history between equal devices** (5.7). T4 first; the sequencer; a named
   fallback.
2. **Claude Code is someone else's product.** Layout, resume and hooks can change. Seam S1
   isolates it; T2, T3; `youcoded/docs/cc-dependencies.md`.
3. **The switch-over.** One device at a time, real users. The last sync, the rehearsal with
   the inventory tool, rollback.
4. **The everyday case without a super-host** is the weakest experience, and phones look
   offline when pocketed. As decided; test it and bring results to Destin.
5. **Phone as host.** Android may stop a long reply. The opt-in exemption; V7; T15.
6. **Relay cost and abuse with no account.** Limits; T7; V6; sign-in held in reserve.
7. **Security claims.** Section 8; careful wording.
8. **Unslimmed GitHub growth until the backup rebuild.** Keep the gap short.
9. **Start-up wiring exists twice** (`main.ts` and `headless-boot.ts`). Every phase checks
   both.

---

## 13. Cards

64, 98 (growth; GitHub fresh start waits for the backup rebuild), 119, 121 (backup faults),
125, 127 (five known sync problems), 241 (cloud backup choices), 242 (alerts on every
device), 243 (versions screen), 248 (assistant setup sync), 253 (YouCoded-hosted backups),
258 (mobile-data setting).

---

## 14. Not decided

| # | Item | State |
|---|---|---|
| P1 | Quit warning rework (2.6) | Proposed 2026-11-13; awaiting Destin |
| P2 | Any device backs up what is new; no storage setting for one-device users (2.2, 2.10) | Proposed 2026-11-13; awaiting Destin |
| P3 | Wording of two new notice rows: host was removed; chat stored on a device that is off (2.7) | Proposed; awaiting Destin |
| O1 | Reaching a super-host from outside (Tailscale, tunnels, router); locking its browser view | Comparison owed before Phase 8 |
| O2 | Payment | Destin: decide later; free at fixed limits |
| O3 | A plan for the 2026-11-05 conflict copies | Left alone by his word |
| O4 | Removing a device on a desktop with no OS unlock | Needs Destin if T11 finds one |
| O5 | Outside security review before the headline claim | Needs Destin |
| O6 | When the relay erases a device set nobody has used | Needs Destin |
| O7 | Interim period: GitHub upload is unslimmed and grows | Known; follows from his order |
| O8 | Is the relay on from the first pairing, or switched on by the user? | Needs Destin |
| O9 | What the one-device backup prompt offers at the switch, before the new backup exists | Needs Destin |
| O10 | Backup choices that work on every device (D10 S-3) | For the backup rebuild's design |
| O11 | Does a device switch when it is updated, or when it is paired? | Needs Destin |
| O12 | Telling Destin that a pocketed phone shows as offline (5.2), after T15 | Report, then his call |
