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
- **Proposed** or **Open.** Not decided. Section 13 lists every one. Do not build an Open item
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
  built (section 7.3).

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
| Relay | Blind waiting room, registers, presence, pass-through, pairing meeting point | New Durable Object beside `SyncGroupRoom` |
| Chat store | This device's canonical record of each chat: lines, hash chain, extras, control log, summary | New |
| Replicator | "Everything after line N" between any two devices or a keeper | New; replaces `transcript-mirror` and the Personal-space chat lane |
| Control log | Host, takeovers, delete, versions, names, flags, per chat | New; replaces leases, `ConversationRecord`, `ConversationNames/` |
| Host control | Who hosts, takeover, the set-aside half reply | New; replaces `takeover.ts`, `handoff-*`, `lease-client.ts`, `resume-admission.ts` |
| Session router + proxy | Makes a chat hosted elsewhere look local to the renderer | New; reuses the channel table |
| Project carrier | Moves git history between devices in place of GitHub | New, around the existing `GitTransport` |
| Storage policy | Keep everything / recent 30 days; Recently deleted | New |
| Lifecycle | Awake per reply, quit rule, launch and wake checks | Extends `main.ts`, `headless-boot.ts`, `BackendService.kt` |
| Super-host | The headless boot, on a desktop OS | Extends `main/headless/` |
| Interim backup lane | Upload-only GitHub copy and one-time restore | New, temporary (7.3) |

### 4.2 Five ideas the rest depends on

**1. Two lanes.**

- **Durable lane.** Chat lines, extras, control entries, roster entries, project history.
  Stored, signed, verified by hash, retried until acknowledged, held by keepers. Handling is
  idempotent: receiving the same frame twice, or out of order across two paths, is harmless.
- **Live lane.** Token-by-token words, "reply running", open permission prompts. Sent only
  to devices that have the chat open, never stored by a keeper, rebuilt from a fresh
  snapshot after any gap.

A watcher's screen is the live lane while connected. Its offline reading and its ability to
take over come from the durable lane. The live lane may be ahead of the durable lane; every
live event names the line number it belongs to, so a device always knows how far behind its
durable copy is.

**2. The chat store is the truth; runtime files are working copies.** Claude Code and the
native runtime keep writing their own files exactly as today. On the host, an adapter
indexes each new line of that working file into the chat store (for a chat hosted here the
store holds the index and hash chain and points at the working file, so nothing is stored
twice). On every other device the bytes live in the store and no working file is read. When
a device becomes host it writes the working file out from the store. When it stops being
host it copies any bytes the store only pointed at, then moves the working file aside.

**3. Nothing is deleted or merged on a guess.** Whether one copy extends another is decided
by hash chains. Who hosts is decided by one pure function over the control log and the
roster. Lines that might be an abandoned half reply are **set aside**, never deleted, until
the device that wrote them says what they were. When no single answer exists, the result is
"two versions", shown to the user.

**4. A split in the record is not a split in the chat.** Two devices may both write
"I am now the host". That becomes two versions only if their lines actually differ. If one
copy is simply a longer or equal copy of the other, it is one chat and one of them hosts.

**5. A keeper's word is never the only copy and never the authority.** A device does not
clear its own copy of anything until another *device* has it. Anything a keeper says is
checked against signatures from devices.

### 4.3 How the parts act together: six walk-throughs

**A. First device, then pairing a phone.**
1. First run: the device creates its keys and a device set of one. It contacts no relay.
   Every existing chat on disk is indexed (the same transcripts today's reconciler scans)
   and gets a `claim` entry naming this device as host. No chip is shown while the set has
   one device.
2. Devices → Add device → this device's unlock (U7). It opens a meeting point and shows the
   QR and code.
3. The phone scans. The key exchange runs. The computer shows "Add this device?".
4. On yes: the roster entry is signed and exchanged; the set secret is sent sealed. The
   phone takes the computer's signed table of chat heads directly, before trusting any
   keeper.
5. If the phone holds chats or projects of its own, the combine-or-cancel step runs on
   counts first. On combine, chats both hold are compared by hash chain: where one is a
   prefix of the other, the longer one stands and its holder hosts; where they differ, they
   are listed once as two versions. [D12 Q-15]
6. Both connect to the keeper, if one is in use (O8).
7. Catch-up: control logs and summaries of every chat first (the list fills within
   seconds); then lines of chats used in the last 30 days, newest first; then their extras.
   A "keep everything" device continues with older chats. No project is downloaded to the
   phone until sync is turned on for it there.

**B. The phone watches a chat on the desktop; the desktop loses power mid-reply; the phone
continues; the desktop returns.**
1. Watching: the session proxy holds a live subscription. Lines arrive on the durable lane
   as they are written.
2. Power loss: heartbeats stop. After the offline rule (5.2) presence says the desktop is
   gone. Nothing is shown until the user opens or types in that chat.
3. The phone works out the notice facts: host offline; whether its last durable line is the
   end of a reply; and how far behind it is (from the highest line number the live lane
   mentioned, and from the keeper's register if one is reachable). The rows that apply are
   shown together: "went offline partway through a reply", and either "may have newer
   messages" (unknown) or "Desktop has N newer lines" (known), in which case the button
   reads "Continue from here as a new version".
4. On yes the phone reserves the host role with the keeper if one is reachable (5.4),
   appends a takeover entry naming the last finished reply it holds, writes the working
   file from the store up to that point, and resumes. The chip changes everywhere.
5. The desktop starts again. Before any chat continues or resumes, at launch and on wake,
   it fetches control logs from whatever it can reach. For this chat it is no longer host.
   It stops the chat's process if one is still running, appends a `released` entry stating
   exactly what it had beyond the takeover point, and moves its working file aside.
   - Only an unfinished reply beyond the point: set aside; "continued on Phone" row.
   - Finished replies the phone never received: they become a second version; "two
     versions" row on both devices.
6. If the desktop can reach nothing when it wakes, it carries on as host. That is the
   decided offline behaviour and the one way a second version can arise.

**C. The same, for a chat whose project is not on the phone.**
1. The notice adds the "project folder not here" row and stops to ask.
2. "Turn on sync and fetch" needs a device holding the project to be on. The desktop is
   off, so that choice is shown as unavailable, with the reason.
3. "Continue talk-only": the phone runs the chat in a scratch folder with file and command
   tools switched off (5.4) and adds the talk-only note.
4. When the chat later moves to a device that has the project, it resumes in the real
   folder and the "files can be used again" note is added.

**D. Two devices tap Continue here at once.**
- **A keeper is reachable:** each tries to reserve the host role in the keeper's register.
  One succeeds and publishes its takeover. The other never publishes one; it shows "Phone
  just took over this chat" and stays a watcher. [D9 S-4]
- **No keeper, but the two can reach each other:** the same reservation is made with the
  online device that has the lowest id acting as arbiter.
- **Neither can reach anything:** both publish. When they meet, the entry that sorts first
  (5.4) hosts. If the other device wrote no lines, it simply becomes a watcher. If it did,
  those lines are a second version.

**E. Removing a stolen phone that was hosting three chats.**
1. On the computer: Devices → Remove → the computer's unlock.
2. The removal entry lists, for every chat, the last control entry from the phone that the
   computer had seen. Anything the phone signs beyond that is void on every device.
3. The computer creates the next key generation and sends it sealed to each remaining
   device, directly and through the keeper's per-device mailbox. The keeper refuses the
   phone at once. Other devices refuse it as soon as they hold the removal; devices compare
   roster heads before serving each other anything.
4. Those three chats now have no host. Opening one shows the "host was removed" row.
5. Lines the phone wrote and never sent are not recoverable unless the phone is paired
   again.

**F. An older chat on a "recent" device.** The phone opens a chat last used 60 days ago. Its
list row is there; its lines are not; the relay let go of them at 30 days. The replicator
asks every online peer. If one has it, lines stream in. If none is on: "stored on Desktop,
which is offline".

---

## 5. The subsystems

### 5.1 Device set, keys and pairing

**Keys (engineering call).**

- Each device creates a signing key pair and a key-agreement key pair on first run. Private
  halves are stored with `safeStorage` (desktop) or the Keystore-backed shim (Android). A
  reinstall is a new device.
- The set has a **set secret** (32 random bytes) made by the first device. Frames are sealed
  with keys derived from it. It reaches a new device only during pairing, sealed to that
  device.
- The set secret has **generations**. A removal creates the next one, sealed separately to
  each remaining device. Frames name their generation; devices keep old generations to read
  old frames. A removed device can still read what was sealed under generations it holds;
  secrecy from it begins with the first frame sealed under the next generation.
- Every durable frame, every forwarded call and every acknowledgement between devices is
  **signed by the sending device**.
- The **roster** is a signed append-only log: `add` (signed by a member), `remove` (signed by
  a member; carries the cut-off described in walk-through E), `rename`. Entries name the
  entries they have seen, so order does not depend on clocks. Removals from two devices at
  once both stand. Two generations created at once: the first device to see both creates one
  more for the merged roster.
- An entry signed by a device not yet known is **parked** until the roster catches up,
  never refused.
- Devices exchange roster heads in their first message and bring each other up to date
  before anything else is served.
- An audited library; no home-made cipher. Node's `crypto` covers X25519, Ed25519, HKDF and
  ChaCha20-Poly1305. The typed-code path needs a password-authenticated key exchange (T5).
- Duplicate frames are recognised by `(sender, session, counter)`. `session` is a random
  value made at each start and saved with the counter, so a restart never looks like a
  replay and a replay never looks new.
- No frame body is ever logged.

**Pairing.** As walk-through A. Details:

- The QR carries the meeting point, the existing device's key fingerprint and a one-time
  secret that dies on first use. The typed code carries the meeting point and a short
  secret used in the password-authenticated exchange. [D12 Q-10]
- Failed attempts are counted **on the existing device**, not by the relay; the code is
  burned after three. The relay is only a pipe here and is assumed hostile.
- "Add this device?" is shown only after an exchange that the secret has authenticated, so
  the name on screen belongs to whoever holds the code.
- The meeting point is on the relay, or on the local network once same-wifi exists. Using
  the relay as a meeting point stores nothing and is separate from using it as a keeper.
- **A device that already belongs to a set of two or more must leave it before joining
  another** (U9). Pairing a set of one into another set is the ordinary case and covers
  "both devices hold data" and "a device restored from backup".
- **Leaving.** A device can remove itself. When the roster is empty the relay erases the
  set after a delay. Erasing a set nobody has used for a long time is O6.

**Removing and adding a device** both require the acting device's own unlock: Android
`BiometricPrompt`; macOS Touch ID or password; Windows Hello; a polkit prompt on Linux.
Removal is decided [D12 Q-9]; requiring it for adding is U7. A desktop with no such prompt
is O4 (T11).

### 5.2 Link layer and presence

One interface, three paths, tried in this order for a given peer:

1. **Same-wifi direct.** Devices announce themselves on the local network and connect
   straight to each other. The announcement reveals only that a YouCoded device is present.
   A peer is checked against the roster before any frame is accepted or served. Its own
   security review before release. [chat 2026-11-11] No local discovery exists in the app
   today; Android needs a multicast lock (T6).
2. **Super-host**, when the set has one and it is reachable.
3. **Relay**, when the user has it on.

- A frame is byte-identical on all three paths.
- One connection per path per device; every chat is multiplexed over it.
- With no keeper and no shared wifi, two devices cannot reach each other until they next
  share a network. That is the decided "no keeper" behaviour.

**Presence.** A device is "on" for another when a heartbeat arrived recently on any path.

- Offline rule (engineering call; V3 tunes it): offline after 30 seconds with no heartbeat
  **and** a failed reconnect on every path. A notice is worked out only when the user opens
  or types in a chat (U1). If the host reappears before the user answers, the notice is
  withdrawn.
- **A phone is "on" only while the app is in front, or it is hosting a running reply, or the
  battery exemption is enabled** (U2). Android cuts a backgrounded app's network after a
  while and this design has no push channel. T15 measures it.
- Clocks: the relay's clock times its 30-day rule. Control entries are ordered by what they
  have seen, not by clocks. An entry dated more than a day ahead is parked.

### 5.3 Chat store and the copying system

**Which chats.** Every transcript the app tracks today: Claude Code files under
`~/.claude/projects` (including ones started in a terminal) and native files under
`~/.youcoded/sessions`. A chat enters the store when its first line exists.

**Identity.**

- `chat id = provider + ":" + the runtime's session id`. `--resume` keeps the id and file.
  `/clear` in Claude Code starts a new id: a new chat, as today.
- A chat has one or more **versions**. The main version's id is the chat id. Any other
  version's id is `SHA-256(chat id ‖ the two entry ids that split it)` for an accidental
  split, or `SHA-256(chat id ‖ the fork entry's id)` for a deliberate fork, so every device
  computes the same id. A version stores only its own lines from the split point; reading
  earlier lines falls through to the version it came from.
- When a non-main version is first hosted, the runtime gives it a session id of its own
  (Claude Code's fork-on-resume; T3). A `bound` entry records that id.
- Each version is its own row in the list, grouped with its relatives. Deleting one version
  does not delete another.

**The store** (under the app's data folder, never inside a synced space). Per version:

- Lines in **segments**. A segment is an append-only run. A new segment starts only when
  the host's adapter reports that the runtime rewrote or shrank its file. The new segment
  is the whole chat again from its first line; the old segment is kept on the host for 30
  days and not copied anywhere. This has not been observed in Destin's chats; T2 checks it.
- A **hash chain** per segment: `h[0] = SHA-256(version id ‖ segment)`,
  `h[n] = SHA-256(h[n-1] ‖ raw bytes of line n)`. The chain value of every line is kept even
  when the line's bytes have been evicted (32 bytes a line), so a "recent" device can still
  answer "what was your hash at line N".
- An index of **reply ends**: the line numbers where a reply finished. Each adapter decides
  this from its runtime's own end-of-reply marker (the event the app treats as
  `turn-complete` today). The takeover point is always a reply end.
- The **head**: `{version, segment, line count, chain hash}`.
- The control log, the latest summary, and a manifest of extras by content hash.

**Copying.** One system for live sending and catching up [D4 Q-1]:

- The host sends each new line as written, to every online device and to the keeper.
- Devices exchange control logs **before** lines, always. Lines for a chat whose log says
  "deleted" are not requested and not accepted.
- A device asks any peer or the keeper: "version V, segment S: I have N lines ending in hash
  H". Answers: the lines after N; `gap` (I do not have the lines just after N); `moved`
  (there is a newer segment; here is its entry); `not-a-prefix` with the answerer's hash at
  N.
- Lines are added to the chain only when they connect to it. Lines that arrive with a hole
  before them are parked and added when the hole is filled.
- A device acknowledges only "everything through line N, without holes".
- Any device can answer, not only the host. [D4 S-2]
- When two devices meet they exchange a table of heads for every chat.
- **`not-a-prefix` is never settled by guessing.** The device first re-hashes its own
  stored bytes; if they no longer match its own chain, its copy is damaged: the bytes are
  set aside and recopied. Otherwise the control log decides (5.4): the lines are an old
  host's tail (set aside until its `released` entry arrives) or a second version.
- Order of catch-up: control logs and summaries; then lines, most recently used first; then
  extras. Lines never wait behind extras.
- Extras move by content hash. Extras that belong only to a set-aside tail are set aside
  with it.

**Extras, by location** (confirm in T3):

| Extra | Claude Code chat | Native chat |
|---|---|---|
| Helper working files | `<slugdir>/<sessionId>/subagents/` | Child session files with `parentSessionId` |
| Saved long outputs | `<slugdir>/<sessionId>/tool-results/` | `specialist-reports/`; Bash overflow goes to the temp folder today and must move somewhere durable to travel |
| Plan | The file in `~/.claude/plans/` named in the chat's lines | In the chat's lines |
| To-do list | `~/.claude/todos/` entries for the session | In memory only today; nothing to carry until saved |

### 5.4 Control log and host control

The control log is a short, append-only set of signed entries per chat (shapes in 6.2).
Each entry lists the entries its author had seen. That makes the log a small history graph
whose meaning does not depend on arrival order or clocks.

**`decide(entries, roster)`** (seam S5). Pure. Same answer for the same set of entries in
any order.

- **Ordering two entries.** If one had seen the other, it is later. If neither had seen the
  other they are concurrent, and a fixed tie-break orders them: lower entry id first.
- **Void entries.** Entries signed by a removed device beyond the removal's cut-off;
  entries by an unknown signer stay parked.
- **Host.** Follow `claim` and `takeover` entries from the start. The latest in order
  hosts. If that device is removed, the chat has no host and any device may take over at
  once.
- **Concurrent claims or takeovers** (same parent). The first in order hosts. For each
  other one: if its author's lines are a prefix of, or equal to, the winner's version, it
  is simply void and its author is a watcher. If its author's lines differ, they are a
  second version, with the deterministic id from 5.3.
- **Name, flags, talk-only, minimum app version:** the latest entry of that kind in order.
- **Deleted.** A `restored` entry names the `deleted` entry it undoes. A delete and a
  restore that are concurrent resolve to deleted.

**Reserving the host role, so races are settled before anything is published.**

- Each chat has a host register on the keeper holding the id of the latest claim or
  takeover. A device taking over swaps the register from the parent it knows to its own
  intended entry. Success: it publishes the entry. Failure: someone else got there; it
  publishes nothing and shows "… just took over this chat".
- If the keeper's register is older than the parent the device knows (the previous takeover
  happened offline), the device first replays the missing swaps in order, then makes its
  own.
- With no keeper but peers in reach, the online device with the lowest id plays the
  register. With nothing in reach, the device publishes directly; `decide` sorts it out
  later.
- A register is an optimisation and a courtesy. `decide` gives the same answer on every
  device whatever a register said.

**The takeover point and the tail.** A takeover names `{line count, chain hash}` of the last
reply end in the taking device's store. Before choosing it, the device fetches durable
lines up to the highest line its live lane has mentioned, if any peer or keeper has them.

Lines the previous host wrote beyond that point are its **tail**. On every device the tail
is set aside (kept on disk, hidden, not counted as part of the chat) and nothing more is
done until the previous host speaks:

- When the previous host learns of the takeover it stops the chat's process, then appends
  `released {tail line count, tail hash, last reply end within the tail}`.
- If the tail contains a finished reply, the lines up to that reply end become a second
  version (deterministic id), and "two versions" is shown. Anything after it is an
  unfinished reply and stays set aside.
- If the tail contains no finished reply, it is the dropped half reply. It stays set aside
  for 30 days and is then removed.
- If the previous host is removed from the roster without ever speaking, the tail is
  removed 30 days later.

So every device reaches the same result, because only the device that wrote the tail says
what it was.

**Becoming host** (`becomeHost`, seam S7):

1. Make sure the lines up to the takeover point and the extras are in the store.
2. Write the working file from the store: for Claude Code,
   `~/.claude/projects/<ccProjectSlug(local folder)>/<runtime id>.jsonl` plus `subagents/`
   and the other extras; for native, its session folder. `resolve-local-project.ts` maps
   the chat to a local folder.
3. Resume. The adapter continues from the store's head.
4. A crash anywhere in 1 to 3 is safe: on next launch the log still says this device hosts,
   and the steps run again.

**Chip switch while the host is on.** The new host calls `stopForSwitch` on the old host.
The old host waits for a running reply to end (decided; the tapping device shows it is
waiting and can cancel), then **fences** the chat: from that instant it refuses forwarded
messages for it, answering "moved". It replies with its last reply end. The takeover names
that point, so there is no tail.

**Talk-only.** The chat runs in a scratch folder under the app's data folder, with
file-writing and command tools switched off for that run (Claude Code's tool restrictions;
the native runtime's binding). A `talk-only on` entry is appended and the note is given to
the assistant. Returning to a device with the project: `becomeHost` in the real folder,
`talk-only off`, and the "files can be used again" note. T3 and T10 must show Claude Code
resumes a chat in a different folder from the one it was written in.

**Showing the divider and telling the assistant.**

- The renderer draws the divider from the takeover entry at its line, reusing the system
  marker of the model-switch divider (`MODEL_SWITCH_MARKER`,
  `renderer/state/transcript-event-actions.ts:361`). Its id is the takeover entry's id, so
  it can never be drawn twice.
- The assistant is told at the next message. Native: append a transcript event. Claude
  Code: add the note as hook context on the next prompt, through the app's hook scripts, so
  nothing is written into Claude Code's file (T3).

**Summary.** The host appends a `summary` entry when a chat is created and at most once per
finished reply: title, project, last line time, line count, line count at the last reply
end, model label. The chat list is drawn from summaries and `decide`.

**Names.** A `renamed` entry (the user's choice) beats the summary's automatic title.
`renamed` replaces `Personal/ConversationNames/`; existing names are converted at the
switch. Tags stay where they are.

**Deleting.**

- A `deleted` entry. The keeper's never-expiring register for the chat also carries a
  deleted mark, so a device returning after any length of time learns of it before sending
  anything.
- When the entry reaches the host, the host stops any running reply, as if the chat were
  closed (U3).
- Each device removes the body 30 days after the later of the entry's time and the moment
  that device first saw it, and keeps the entry for good. So a device that was away, or
  whose clock is wrong, still gives its user 30 days in Recently deleted.
- A device that returns holding unsent lines for a deleted chat keeps them in its own
  Recently deleted and sends nothing.

### 5.5 Watching: session router and proxy

Goal: the renderer does not know whether a chat runs here or elsewhere, apart from the chip
and the capability limits.

- Today the remote client is a renderer-side shim that replaces the whole backend. That
  cannot give per-chat hosts and cannot run inside Electron.
- New, in the main process: a **session router** inspects each session-scoped call. A local
  chat goes to `SessionManager` or the native host as now. A chat hosted elsewhere goes to a
  **session proxy**, which forwards the call to the host and republishes the host's events
  for that chat on the same local channels.
- **On the host** forwarded calls are served by `serveRemoteChannel` with a peer context,
  not by a literal third door (a third `door` value would touch 29 handler sites). The
  context stays `door: 'remote'`, gains `peer: deviceId`, and each paired device gets an
  audience id in a new range, so the existing "send to this audience" logic works. One new
  flag on channel entries, `peerAllowed`, says whether a paired device may call it.
- Opening a watched chat uses the existing fill path (`session:open`): a snapshot, then live
  events numbered in order. A gap triggers a fresh snapshot.
- **Capabilities become per chat.** A watched chat gets the remote-screen set
  (`shared/capabilities.ts`). The refused-feature list stays in
  `renderer/remote-unsupported.ts`, extended to the limits in 2.1.
- **Permission prompts.** Each has a unique id. Every device with the chat open shows it.
  The host accepts the first answer for that id and tells any later answerer it is already
  settled. An answer can never apply to a different prompt.
- **A message typed on a watcher** is a signed call carrying a call id, the host term it
  was aimed at, and a deadline a few seconds ahead. The host refuses a call whose term is
  stale or whose deadline has passed, so a message can never arrive late. The host
  remembers recent call ids on disk, so a retry after a restart cannot send twice. The
  watcher shows the message as sent when the host confirms the line; otherwise the box
  keeps the text with "Not sent. Desktop went offline". [D12 Q-4]
- **Starting a chat on another device** is a forwarded `session:create` naming a project
  that device has downloaded.
- **Version mismatch.** Devices exchange app versions at connect. A watcher too old for the
  host's live protocol falls back to the durable lane: the chat appears as its lines
  arrive, it cannot be typed into, and the update notice shows (U4).

### 5.6 The relay

A new Durable Object class beside `SyncGroupRoom`. One object per device set, named by a
hash of the first device's public key.

It does five things, all blind:

1. **Authenticate** a device by a signed challenge against the public roster. The room comes
   from the authenticated key, never from an id the client sends.
2. **Pass through** frames between connected devices. Not stored, not counted.
3. **Hold** durable frames in groups: one per chat version (lines and extras), one per
   project (bundles), one mailbox per device (key generations, roster entries).
   - Each device tells the relay how far it has acknowledged each group (an unsealed
     "through sequence N" the relay can read). A frame is dropped once every roster device
     has acknowledged it. A "recent" device acknowledges a chat it does not want.
   - A chat's group is dropped 30 days after its last line, by the relay's clock.
   - Bytes held count toward 1 GB per set. At the limit it releases whole groups, least
     recently used first, never the group being written while another remains.
   - **Every release is announced** to the devices: "group G released through sequence N".
     The device that wrote those lines then treats them as not yet delivered again, and
     shows the decided "Relay full" message.
   - New lines for a released chat are accepted again; a device asking for the missing
     stretch gets `gap`.
   - A project's first full download is never held.
4. **Registers**, kept with no time limit, each an opaque value changed by compare-and-swap:
   per chat version a head register and a host register; per project a tip register. One
   call returns all of a set's registers, which is how a device fills the "behind" marks in
   its chat list. Register contents are sealed and signed by the device that wrote them and
   include the hash of the value they replaced.
5. **Presence.**

Also: pairing meeting points; roster updates; delayed erase on empty roster.

**If the relay misbehaves.** It can delay, withhold, or replay an old register. It cannot
read, forge or alter anything. A device never accepts a head older than one it has seen,
and takes its first heads from a paired device, not from the relay. The worst outcomes are
a device wrongly believing it is up to date, or two devices both told they reserved the
host role. Both are caught when devices exchange control logs.

**Limits with no account** [D12 Q-11]: new sets rate-limited per network address; 1 GB and
a frame rate per set. During the build only an allow-list of test sets is accepted.

**Cost** (`connection-options.md`): free plan today. Live words batched about every quarter
second. Storage is the cost that grows; large frames may belong in Cloudflare's object
storage with the Durable Object as index (T7).

### 5.7 Project files over the mesh

Keep `GitTransport`'s staging, guards and repair. Change two things: where history comes
from and goes to, and how a clash is settled.

**The carrier.** Each synced folder gets a second hidden repository beside the first
(`.youcoded/mesh-remote.git`), used as the "remote". `GitTransport` already works against a
local path; its contract tests use one. Incoming history is unpacked into that repository;
outgoing history is read from it and sent to peers and the keeper as incremental git
bundles in durable frames. `GitTransport` fetches from and pushes to it as it does with
GitHub today.

**Making merges the same on every device.** Today the incoming version keeps the file's
name and this device's becomes the copy, which settles only because GitHub orders
everyone's pushes. Between equal devices that rule would give each device a different
result. So (engineering call; T4 must prove it):

- A clash is settled by a rule that depends only on the two versions, not on who is
  merging: the version with the lower content hash keeps the name; the other becomes
  `name (from <its device>, <date>)`.
- Merge commits are built with fixed author, fixed message, the later of the two parents'
  dates, and parents in a fixed order. Two devices merging the same two histories then
  produce the identical commit, and neither has to merge again.
- This changes `GitTransport`'s conflict code and its "remote-wins" contract test.

**Sequencer, as a traffic rule only.** To cut down on merges, devices send to one place
first when they can: the keeper's tip register if reachable, else the online device with
the lowest id. Correctness does not depend on it; devices that disagree about the
sequencer still converge.

**Safety rules.**

- Upload the bundle first, then change the tip register.
- A device adopts a tip only after checking it descends from, or can be merged with, what it
  has. A tip with no shared history is never merged in automatically; it raises a "these
  have diverged" state for that project. (The one exception is the user's explicit "yes,
  the same project" at pairing.)
- Bundles are cut from the oldest tip any roster device has acknowledged. If a needed
  earlier bundle was released by the relay, fall back to fetching straight from a device
  that has the project.
- Sends are bundled and retried with a random back-off, so two hosts editing every two
  seconds cannot chase each other.
- **If T4 fails:** one fixed sequencer per project, files moving only while it is on.

**Other points.**

- **The note** is the tip register plus a counter that rises with each change; the counter
  is what the notice quotes. [D10 Q-2]
- **Project id** is the root commit of the project's hidden history.
- **Listed versus downloaded.** The project registry lists every project. Which are
  downloaded here is a local per-device set, replacing download-everything in
  `materialization-planner.ts`. Projects already on a device at the switch stay on. A newly
  paired device starts with none.
- **First download** comes straight from a device that has the project and is on. [D9 S-3]
- **The wait** drops from 15 s to about 2 s for the mesh carrier only (`engine.ts:142`).
- **The Personal space** (project registry, tags, Pages) rides this carrier.
  `Conversations/`, `ConversationNames/`, `Handoffs/` and `Devices/` stop being written and
  are excluded.
- **Same project or not** at pairing: the same when the two hidden histories share a root
  commit (true for anything already synced through GitHub) (U5); otherwise the question in
  2.4.

### 5.8 Storage policy

- "Keep everything": every chat's lines and extras stay.
- "Recent": lines and extras of chats not used for 30 days may be evicted; the summary,
  control log and chain values stay.
- **Never evicted:** a chat hosted here (U6); any line that no other **device** has
  acknowledged. A keeper's acknowledgement does not count for eviction, though it does
  count for the quit rule and the "waiting" mark as decided [D9 Q-3].
- "Waiting" in the chat list means: this device holds lines that neither another device nor
  a keeper has acknowledged.
- "Recently deleted": 30 days on each device (5.4).

### 5.9 Lifecycle

All of this runs only when the switch (7.2) is on.

- **Awake per reply.** `powerSaveBlocker` (desktop) or the existing `keepAwake` host call
  (Android, capped at 4 hours) while a reply runs on this host; a hard cap on desktop too
  (U8 sets the figure).
- **Battery exemption.** A new Android setting the user opts into. [D6 Q-3]
- **Quit.** Compare each hosted chat's head with what a keeper or any peer has
  acknowledged. All reply ends acknowledged: quit at once. Otherwise allow a few seconds
  for project changes, then quit and show the line in 2.6. Today's shutdown already caps
  teardown at about 6 seconds.
- **Launch and wake.** Before any hosted chat continues or is resumed: connect, fetch
  control logs from whatever is reachable, run `decide`. Taken over: stop the process,
  `released`, set the working file aside. Nothing reachable: carry on as host. Wire it in
  both `main.ts` and `headless-boot.ts`.

### 5.10 Super-host

- The phone's backend already boots the whole app with no window under plain Node
  (`headless/headless-main.ts`, `headless-boot.ts`, stand-ins in `electron-headless.ts`). A
  super-host is that boot on Windows, Mac or Linux, started at login.
- Phone-specific parts to generalise: the owner token and secret key arrive on stdin from
  the Android service; secret storage is a shim keyed by that supplied key and calls itself
  the Android keystore (a desktop super-host needs a real key source such as the OS
  keychain); `headless-boot.ts:132-134` hard-codes the platform as Android; keep-awake has
  no desktop stand-in.
- It needs: start at login on each OS; pairing without a screen (it prints a code, or is
  paired from its browser view); the existing remote server in Tailscale mode as its
  browser view.
- It is an ordinary roster device on "keep everything". Its acknowledgement counts as a
  device's.
- Outside access and locking its browser view: O1. Raspberry Pi: T8.

### 5.11 Versions

- The link layer exchanges app version and mesh protocol version at connect.
- A `format` entry names the minimum app version that may host or continue a chat. An older
  device may read and watch. [D12 Q-12]
- Unknown entry kinds and frame kinds are kept and passed on, never dropped.

---

## 6. Contracts and shapes

Engineering proposals, precise enough to write tests from. Field names may be refined.

### 6.1 Seams

| # | Seam | Contract |
|---|---|---|
| S1 | Runtime file → store (source adapter) | `poll(path, state) → {lines[], replyEnds[], state} \| rewritten`. A **line** is the bytes up to and including a newline; a trailing partial line is not ingested. `state` holds byte offset, chain hash, file identity and a hash of the last 64 KiB before the offset; a full re-hash happens only when that cheap check fails. `isReplyEnd(line)` is per runtime. Runs only on the host. Tests: append, partial write, truncate, rewrite, file replaced, 300 MB file polled in under 50 ms when unchanged. |
| S2 | Chat store | `head(version)`; `hashAt(version, segment, n)`; `read(version, segment, from, to) → lines \| evicted`; `append(version, segment, fromLine, lines) → ok \| parked \| not-a-prefix`, idempotent; `setAside(version, fromLine, reason)`; `replyEnds(version)`; `controlLog(chat)`; `appendControl(entry) → ok \| parked \| duplicate`; `summary(version)`; `listVersions()`; `hasExtra / readExtra / putExtra(hash)`; `evictBody / restoreBody`. Every write is atomic and survives a kill at any point. |
| S3 | Replicator ↔ link layer | `sendDurable(target, frame) → Promise<Ack>` where `Ack` means the target has stored it durably; kept and retried until then; order kept per group. `sendLive(target, frame)`: best effort; dropped when more than 1 MB is queued for that target. `target` is a device id or `keeper`. `onFrame(handler)`. `presence()` and a change event. |
| S4 | Link layer ↔ relay | Operations and results in 6.4. Tests: a relay built with a shim that records every byte it stores, asserting none decrypts with any key in the test; a static check that the Worker imports nothing from the app's key code; register compare-and-swap under concurrency. |
| S5 | `decide` | `decide(entries, roster) → {host \| none, versions[{id, from, atLines}], deleted, name, flags, talkOnly, minVersion, void[]}`. Property test: every permutation and duplication of the same entries gives the same output on every device. |
| S6 | Session router ↔ channel table | A `call` frame (6.3) is served through `serveRemoteChannel` with `{door:'remote', peer}`. Host events for the chat are forwarded as `live-event` frames with rising numbers. Parity test: every session-scoped channel is `peerAllowed`, or has a refusal message. |
| S7 | Host control ↔ runtimes | `isReplyRunning(version)`; `stopForSwitch(version) → {replyEnd} \| failed(busy \| gone \| cancelled)`, after which the chat is fenced; `becomeHost(version, uptoLine, mode: normal \| talk-only) → ok \| failed(lines-missing \| extras-missing \| no-folder \| sign-in \| runtime-error)`; `releaseHost(version) → {tailLines, tailHash, lastReplyEndInTail}`, which stops the process, copies pointed-at bytes into the store and moves the working file aside. |
| S8 | Project carrier ↔ GitTransport | `GitTransport` runs against `mesh-remote.git` as its remote. The carrier's own interface: `importBundle(bytes) → tips`, `exportBundle(since) → bytes`, `tip()`. The existing contract suite runs against it with the conflict test rewritten for the new rule, plus T4. |
| S9 | Storage policy ↔ store | `mayEvict(version) → bool` (false when hosted here, when any line lacks a device acknowledgement, or when used in the last 30 days); `ensureBody(version) → ok \| unavailable(holders[])`. |
| S10 | Notices | `notice(facts) → rows[]`, pure. `facts`: trigger (opened, typed, chip tap, launch); host device and whether online or removed; whether the last durable line is a reply end; lines behind (`0`, a number, or `unknown`); files behind (`no`, `yes`, `unknown`); project present; secrets and skipped folders; sign-in present; features missing; version ok; body available and who holds it; versions found; continued elsewhere while this device was off; talk-only. **Lines behind is `unknown`** when neither the host nor a register newer than the host's last known activity has been read. Rows come out in the order of the table in 2.7. Snapshot-tested over the full table of fact combinations listed in the test file. |
| S11 | Mesh ↔ interim backup lane | The lane reads the store through S2. It writes only in the one-time restore, and only when `listVersions()` is empty. |

### 6.2 Control and roster entries

```
entry      { id = SHA-256(rest), chat, version, kind, body, device, seen: id[], at, signature }
claim      { host }                      // first host of a chat; replaces "created"
takeover   { parent, to, atLines, atHash, reason: chip | host-offline | host-removed | offline }
released   { takeover, tailLines, tailHash, lastReplyEndInTail }
version    { from, atLines, deliberate, splitBy: id[] }   // id is deterministic (5.3)
bound      { runtimeSessionId }
segment    { segment, previousHead }
summary    { title, projectId, projectName, lastLineAt, lines, replyEndLines, model }
renamed    { title }      flag { name, on }      talk-only { on }      format { minAppVersion }
deleted    { }            restored { deleted: id }

roster     { id, kind: add | remove | rename, device, name, platform, signKey, agreeKey,
             by, seen: id[], at, signature,
             cutoff?: { chat → last entry id seen from the removed device } }   // remove only
```

### 6.3 Frames

```
outside (readable by a keeper):
  { v, set, to: device | "all", group: "chat:<version>" | "project:<id>" | "device:<id>" | "live",
    seq, bytes }
sealed (generation G) + signature of the sender where marked *:
  { kind, from, generation, session, counter, sentAt, body }

*lines        { version, segment, from, lines[] }
*extra-chunk  { hash, index, of, bytes }
*control      { entries[] }
*roster       { entries[] }
*keygen       { generation, secretSealedTo: { device → bytes } }
*bundle-chunk { project, bundleId, index, of, bytes, baseTip, newTip }
*head-table   { heads: ChatHead[], rosterHead }
*want         { version, segment, haveLines, haveHash }
*answer       lines | gap{from,to} | moved{segmentEntry} | not-a-prefix{hashAtYourCount}
*ack          { group, throughSeq }                       // device to device
*call         { callId, version, term, validUntil, channel, payload }
*call-result  { callId, ok, payload | refusal }
 live-event   { version, n, lineNo, channel, payload }
 hello        { appVersion, meshVersion, rosterHead }
pairing       pake-1 | pake-2 | confirm | welcome{roster, secretSealed}   // own key, not G
```

`ChatHead { version, segment, lines, hash }`. A host **term** is not a stored field: it is
the number of valid claims and takeovers on that version so far, as `decide` counts them.

### 6.4 Relay operations

```
auth        challenge → signature                     → ok | not-on-roster
hold        frame                                     → stored{seq} | over-limit
fetch-after { group, seq }                            → frames[] | gap{through}
ack         { group, throughSeq }                     // unsealed; the relay reads it
released    { group, throughSeq }                     // relay → devices
reg-get     { key } | reg-list                        → { key, value, token }[]
reg-set     { key, expectToken, value }               → ok{token} | conflict{value, token}
presence                                              → device[] + change events
meet-open / meet-join / meet-relay / meet-close       // pairing pipe; nothing stored
roster-put  entry                                     → ok | bad-signature
```

Register keys: `head:<version>`, `host:<version>`, `tip:<project>`. `value` is opaque sealed
bytes; `token` is the relay's own counter for that key.

### 6.5 A chat-list row and where each part comes from

| Shown | Source |
|---|---|
| Title | Latest `renamed`; else latest `summary.title` |
| Project, last used, model | Latest `summary` |
| Host device name | `decide().host` looked up in the roster |
| Chip | Shown when the set has more than one device |
| "Behind by N" | `summary.lines` or the head register (from `reg-list`) or a peer's head table, minus this device's head |
| "Waiting" | Lines here that no device and no keeper has acknowledged |
| Version grouping | `decide().versions` |
| "Stored on Desktop" | Body evicted here; holders known from head tables |

---

## 7. Changes to existing code

### 7.1 By area

The old system keeps working, untouched, until Phase 7.

| # | Area | Add (Phases 1 to 6, behind the switch) | Remove or change (Phase 7 and after) |
|---|---|---|---|
| 1 | `main/mesh/` (new) | identity, link, store, replicator, control, host, proxy, policy, carrier | — |
| 2 | `main/conversations/` | — | Delete `handoff-*.ts`, `takeover.ts`, `lease-client.ts`, `resume-admission.ts`, the handoff glue in `service.ts:887-1042`, `transcript-mirror` into the Personal space, `ConversationRecord` syncing. Keep naming logic, tags, slug repair, `resolve-local-project`. |
| 3 | `main/ipc/` | A `mesh` channel family; `peer` context and `peerAllowed` in `channel-table.ts` | Delete `handoff.ts` and the `HANDOFF_*` channels |
| 4 | Renderer | Host chip, the notice, Devices and pairing, storage setting, Recently deleted and delete, project "sync on this device", keeper settings. Hidden while the switch is off. All through review decks. | Delete the pending-handoff views, `resume-lease-gate.ts`, `takeover-dialog-copy.ts`, the MovedGate |
| 5 | Remote access | — | Remove the Android "Connect to Desktop" screen and desktop "Remote access" pairing for app use. Keep `RemoteServer` in Tailscale mode for the browser view and in local mode for the Android app's own screen. |
| 6 | `main/sync-spaces/` | The mesh carrier; per-device downloaded set; 2 s wait for the mesh carrier; the new clash rule, used only by the mesh carrier | Stop GitHub pull; exclude `Conversations/`, `ConversationNames/`, `Handoffs/`, `Devices/` |
| 7 | `main/session-manager.ts`, native host | Seam S7; awake per reply | `stopSessionForHandoff` |
| 8 | `main/main.ts`, `headless/headless-boot.ts` | Mesh start-up, quit rule, launch and wake checks, in both, only when the switch is on | Lease wiring (`main.ts:1014`, `headless-boot.ts:186`) |
| 9 | `main/headless/` | Desktop super-host boot (Phase 8) | — |
| 10 | Android (`app/`) | Battery-exemption setting; multicast lock; QR scanning exists (`QrScannerOverlay.kt`) | `PairedDeviceStore.kt` for app use |
| 11 | Worker | New Durable Object and route, allow-listed | Lease operations in `SyncGroupRoom`, once no shipped version uses them |
| 12 | Docs | — | `youcoded/docs/conversations.md`, `sync-spaces.md`, `native-runtime.md`: rewrite the parts that change; they are already stale in places |

### 7.2 The switch

One local setting, off by default, in the app's own settings file, read by both boots. Off:
the app behaves exactly as today; nothing in `main/mesh/` starts; no new screen, setting or
lifecycle behaviour is visible. On (dev instances and named testers only, until Phase 7):
the mesh runs and, in that instance, the Personal-space chat lane is off. Phase 7 turns it
on for users. The old code is removed in a later release, once rollback is no longer wanted.

### 7.3 The interim GitHub lane (engineering call; from Phase 7 until the backup rebuild)

His rule: GitHub chat sync off at mesh deploy; GitHub backup continues; one-time restore
keeps working; never both systems syncing. Today there is no upload-only mode and chats are
part of the two-way Personal repository. So:

- **When a device switches** it runs one last ordinary sync, then never pulls again.
- From then on it pushes its own branches, which no other device ever writes, so nothing
  can clash: `mesh-backup/<device id>` in the Personal repository (a snapshot of the chats
  it holds, plus the Personal space without chats) and the same branch name in each
  project's repository. The old `main` branches are left exactly as they were.
- Git stores identical files once, so several devices holding the same chats cost little.
- **One-time restore**, offered only when the store is empty: fetch the old `main` and every
  backup branch; for each chat compare copies by hash chain; where one is a prefix of
  another keep the longer; where they differ keep both as versions; load the store; then
  fetch each project once. Chats over 50 MiB were never uploaded; the restore says which
  are missing. [D12 Q-14]
- Known cost: not slimmed, so the repositories keep growing (4.28 GB on 2026-11-12).

**Devices that switch at different times.** A device still on the old system keeps syncing
with GitHub and with other old devices. A switched device no longer reads GitHub. Until all
of a user's devices have switched and are paired, the two groups do not see each other's
new chats. Nothing is lost: when a late device switches and is paired, the combine step in
walk-through A runs. A chat that was continued on both sides in the meantime has really
diverged, and is listed as two versions. The one-time message must say all this plainly.
Whether a device switches when it is updated or when it is paired is O11; the second
shortens this window to the time the user takes to pair.

**Rollback** is for the whole release, not one device. While the old code is still shipped,
a later release can turn the switch off: on each device the store is written back into
`Personal/Conversations/` (records rebuilt from control logs; deleted chats left out), the
device stops using the mesh, and ordinary GitHub sync resumes with its existing
conflict-copy behaviour. Rehearse it in Phase 7. A single device cannot go back alone; it
would break rule 4.

---

## 8. Security

**Promise.** Contents that sync are readable only on the user's devices. A keeper sees
sizes, counts, timing and public keys. Cloud backup is separate and locked only if the user
turns the lock on.

**Must be true.**

1. No private key or set secret is written to a synced folder, a backup, a log, or sent to
   any server.
2. A device is accepted only if on the signed roster; a keeper's say-so is never enough.
   Devices compare roster heads before serving each other.
3. The relay picks the room from the authenticated key.
4. Durable frames, calls and device acknowledgements are sealed and signed by the sender.
   Duplicates are recognised and ignored; they are never treated as new.
5. Pairing cannot be completed by someone who only controls the relay. Attempts are counted
   on the existing device; the code burns after three and expires in minutes.
6. From the first frame sealed under the generation created by a removal, the removed
   device can read nothing. Anything it signs beyond the removal's cut-off is void on every
   device.
7. Same-wifi direct accepts and serves nothing before the roster check, and announces only
   presence.
8. No frame body in any log.
9. A keeper that lies can cause delay or a visible "two versions", never a silent loss or a
   forged line.
10. No device clears its only copy of a line on a keeper's word alone.

**Stated plainly: every paired device is fully trusted.** Any one of them can add a device,
remove the others, and type into chats on the others, whose assistants can run commands on
those machines. That is what the feature is. The protections are: adding and removing need
the device's own unlock; every other device is told when a device is added (U7); the relay
erases an emptied set only after a delay.

**Reviews.** A written threat model before Phase 1 is accepted. The decided review of
same-wifi direct. **O5:** an outside review by a person before "end-to-end encrypted" is
used as a headline; until then, "locked so only your devices can read it".

**Other limits to state honestly.** A stolen device keeps what it had. The browser view is
protected by Tailscale only.

---

## 9. Before building: tests and evaluations

Phase 0 runs these as investigations, outside the product, on throwaway code. Where a row
says "again in Phase N", the same check is repeated against the real implementation as part
of that phase's exit.

| # | Question | How | Pass |
|---|---|---|---|
| T1 | Can real "devices" be run for tests? | A rig: N backend instances with separate home folders (dev instances share `~/.claude` and the machine id, so profiles are not enough); an in-process relay that can be made to lie; the ability to cut any link and skew any clock; an **inventory tool** listing every chat version, line count and chain hash per device. | One command runs 3 devices and a relay; two inventories can be diffed. |
| T2 | Do chats only grow? | A throwaway adapter over every chat on Destin's desktop; then `/compact`, `/clear`, resume-from-summary and a kill mid-write. Again in Phase 2. | 100% of non-append events reported as `rewritten`; none pass silently. |
| T3 | Claude Code facts | From the installed version: `--resume` keeps the id; resume in a different folder; fork-on-resume gives a new id; tool restrictions give a talk-only run; a prompt hook adds context; where tool outputs, plans and to-dos live; what marks the end of a reply. Record in `youcoded/docs/cc-dependencies.md`. | A chat moved by hand to a second home folder follows up a helper, rereads a saved output, sees its plan, and repeats back a note. Each fact has a written yes or no. |
| T4 | Does project history converge? | A throwaway carrier with the new clash rule and fixed merge commits. Three devices; clashing edits; bundles in every order; chain topology (A sees B, B sees C); two hosts editing every 2 s; a tip pointing at a missing or unrelated bundle. 1,000 random schedules. Again in Phase 4. | Identical trees **and identical commit ids** everywhere; commit count bounded; no clash repeats; no file lost; a bad tip raises "diverged". |
| T5 | Key-exchange library | Shortlist audited libraries; pair a desktop with the Android headless backend through a hostile pipe. | Pairs on Windows, macOS, Linux, Android; under 3 s on the phone; under 1 MB added; a pipe that guesses is locked out after 3 tries. |
| T6 | Same-wifi discovery on Android | Foreground service, multicast lock, screen on and off, three ordinary routers. | Found within 5 s with the screen on, on all three; screen-off results written down. |
| T7 | Relay fit and cost | Prototype hold, ack, release, registers, `reg-list` for 2,000 chats, 1 GB of frames, one 300 MB chat, batched live words; Durable Object storage against object storage. | Inside platform limits; monthly cost per heavy user and per 1,000 mixed users as numbers. |
| T8 | Super-host hardware | Headless backend on a plain desktop and a Raspberry Pi 5; host a chat. | 48 hours without restart; memory and idle load written down; if the Pi fails, say so. |
| T9 | What a remote screen refuses today | Try image paste, file drag, Office, browser from a phone client; read `InputBar.tsx`. | A table: each decided limit in 2.1 is enforced today, or needs building. |
| T10 | Different folder paths | Resume a Windows-written chat on Linux and Android with the project present; then talk-only. | The assistant edits a file correctly on the new device; in talk-only it does not try. |
| T11 | OS unlock prompts | Each desktop OS. | Works, or O4 goes to Destin. |
| T12 | Control-log fuzz | `decide` alone: 3 to 5 devices, partitions, clocks skewed by a day and by a month, removal mid-flight, takeover, delete, restore, rename; every permutation with duplicates. Again in Phase 5. | Identical output, version ids, host and delete dates everywhere; no entry from a not-yet-known signer is lost. |
| T13 | Late lines from the old host | A takeover at every line boundary, a third device behind at every count, old lines arriving in every order. Again in Phase 5. | The same set-aside or second-version result on all devices; no line lost. |
| T14 | Relay release against quit and eviction | A phone quits right after the relay acknowledges; the relay is filled to 1 GB; the desktop wakes 31 days later; holes in held ranges. Again in Phase 2. | Some device still holds every finished reply; acknowledgements never cover a hole. |
| T15 | Removal and insider | A removed device beside an unaware same-wifi peer; a device offline through two generations; forged entries after removal; forged calls and acknowledgements. Again in Phase 1 and 6. | Entries beyond the cut-off are void everywhere; the removed device reads nothing sealed after; forgeries rejected. |
| T16 | A lying relay | Replay old registers, drop frames, tell two devices they both reserved. Again in Phase 2 and 5. | No device shows wrong content; every case ends in catch-up or a "two versions" row. |
| T17 | Mixed versions | One device on protocol N, one on N+1. Again in Phase 3. | The older reads and watches, or falls back to lines only, and never damages a chat. |
| T18 | Phone in the background | How long a backgrounded phone keeps its connection, with and without the exemption, screen off. | Numbers written down; 5.2's statement confirmed or corrected; U2 goes to Destin. |

---

## 10. Build order

Destin's order: mesh first, backup rebuild after [chat 2026-11-12]; relay before the
own-device keeper [D5 Q-1]. The phases within that are an engineering call. Phases 1 to 6
change nothing for users (7.2).

| Phase | Builds | Destin sees (review decks) | Needs decided first | Done when |
|---|---|---|---|---|
| 0 | T1 to T18 as investigations | A plain report and any decision they force | — | Each pass line met, or the design amended with his agreement where he can see the change |
| 1. Devices | Keys, roster with cut-offs, generations, pairing (QR and code, relay meeting point), adding and removing with unlock, link layer over the relay, relay (auth, pass-through, presence, mailboxes, limits, allow-list) | Devices screen, pairing, removing | U7, U9, O4 | Three rig devices and a real phone pair; T15 passes; threat model written |
| 2. Chats copy | Chat store, adapters, chains, reply ends, control log (`claim`, `summary`, `renamed`, `flag`, `segment`), replicator, relay holding and release notices, registers, 30-day and 1 GB rules, storage setting, the chat list, relay on/off setting | Chat list on a second device (reading only), storage setting, relay setting | O8, P2 | A chat written on A is readable on B in under 2 s, and after B was off a day; inventories match; T2, T14, T16 pass |
| 3. Watching | Session router and proxy, peer context, per-chat capabilities, host chip, permission from any device, signed calls with term and deadline, start on another device, `format` and the version fallback | Watching and typing into a chat hosted elsewhere | U4 | A watcher drives a full reply on a remote host, desktop and phone; parity tests green; T17 passes |
| 4. Project files | Mesh carrier, clash rule, sequencer, tip register, per-device download, 2 s wait, same-project question | Project list with "sync on this device"; pairing with data on both sides | U5 | T4 passes; a project edited on two hosts converges |
| 5. Host changes | `takeover`, `released`, `version`, `bound`, `talk-only`, `deleted`, `restored`; `decide`; reservations; seam S7; divider and assistant note; notices; delete and Recently deleted; awake per reply; quit rule; launch and wake checks | Every notice row, the divider, quitting, deleting | P1, P3, U1, U3, U6, U8 | Every row in 2.7 reproduced in the rig, with walk-throughs B to E and a kill between every step of a takeover; T12, T13, T16 pass |
| 6. Same wifi | Discovery, direct path, local meeting point, peer arbiter | Nothing new on screen | — | Its security review passes; Phases 2 to 5 pass with the relay off; T15 passes |
| 7. Switch-over | Interim GitHub lane, last sync, one-time restore, combine, one-time message, backup prompt, removal of in-app remote access, rollback | The one-time message and prompts | O9, O11, O5, O6, U2 | Rehearsed on copies of Destin's four devices, switched one at a time: the inventory tool shows every chat once on every device; rollback rehearsed; then the switch is turned on for users |
| 8. Super-host | Desktop headless boot, start at login, pairing without a screen, relay fallback, outside access | Super-host setup | O1 | A super-host keeps two sleeping devices current with the relay off |
| 9. Backup rebuild | Its own design pass first (cards 241, 98, 121, 253; O10): one backup, slimming, restore, locking, GitHub fresh start; deletes the interim lane | New Backup screen | O10, O2 if payment touches it | Separate acceptance |

Why this order: project files (4) before host changes (5) because several notice rows need
project notes and fetching. Same wifi (6) before the switch-over (7) because "no keeper at
all" only works once devices can talk directly. Phase 8 can move later without blocking 7.

---

## 11. After building: what to measure and watch

V1 to V5 are thresholds; a miss is a bug. V6 to V12 produce numbers reported to Destin with
a recommendation.

| # | Measure | Target or report |
|---|---|---|
| V1 | Word on host to word on watcher | Under 0.3 s same wifi; under 1 s through the relay |
| V2 | Catch-up after a device was off | 1 MB chat under 2 s; a 300 MB chat completes with the app responsive |
| V3 | "Host offline" | No false notice across 100 wifi blips of under 10 s; a real loss detected within 45 s |
| V4 | Takeover, tap to ready | Under 5 s when lines are already here |
| V5 | File change to arrival | Under 5 s; during a burst of 200 edits, at most one send per 2 s |
| V6 | Relay storage and requests per user per day | Report from Destin's real use; restate cost per 1,000 users |
| V7 | Phone battery | Report: per hour watching, per hour hosting, per day in the background, with and without the exemption |
| V8 | Phone mobile data per day | Report; feeds card 258 |
| V9 | First pairing with hundreds of chats | Chat list complete in under 30 s; app usable throughout; total time reported |
| V10 | Memory, start-up and disk added | Report against `.claude/rules/performance.md`; chain values and set-aside tails included |
| V11 | Hidden history growth at 2 s with two hosts | Report after a week |
| V12 | How often "two versions" appears in real use, and why | Report; any case not caused by a real offline split is a bug |

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
- A user whose devices switch at different times understands the one-time message.

**Keep watching after launch.** Any `rewritten` event; any inventory mismatch between
devices; any repeated file clash; any parked entry that never resolves.

---

## 12. Risks, in order of concern

1. **Project history between equal devices** (5.7). T4 first; a named fallback.
2. **Claude Code is someone else's product.** Layout, resume, forking and hooks can change.
   Seam S1 isolates it; T2, T3; `youcoded/docs/cc-dependencies.md`.
3. **The switch-over.** Real users, devices switching at different times. The last sync,
   the rehearsal with the inventory tool, rollback.
4. **The everyday case without a super-host** is the weakest experience, and phones look
   offline when pocketed. As decided; test it and bring results to Destin.
5. **A waking host can finish a reply in the seconds before it learns it was taken over,**
   producing a real but surprising second version. Measured by V12.
6. **Phone as host.** Android may stop a long reply. The opt-in exemption; V7; T18.
7. **Relay cost and abuse with no account.** Limits; T7; V6; sign-in in reserve.
8. **Every paired device is fully trusted** (section 8). Unlock on add and remove; U7.
9. **Unslimmed GitHub growth until the backup rebuild.** Keep the gap short.
10. **Start-up wiring exists twice** (`main.ts`, `headless-boot.ts`). Every phase checks both.

---

## 13. Not decided

**Proposed to Destin, awaiting his answer.**

| # | Item |
|---|---|
| P1 | Quit warning rework (2.6) |
| P2 | Any device backs up what is new; no storage setting for one-device users (2.2, 2.10) |
| P3 | Wording of two new notice rows: host was removed; chat stored on a device that is off (2.7) |

**Things a user would notice that follow from engineering choices.** Each needs his yes
before its phase (the table in section 10 says which).

| # | Item | Where |
|---|---|---|
| U1 | The "host is offline" notice appears when you open or type in a chat, not as a pop-up the moment the host drops | 5.2 |
| U2 | A phone in a pocket shows as offline to other devices and cannot be chosen to start a chat on | 5.2 |
| U3 | Deleting a chat stops a reply that is running in it | 5.4 |
| U4 | A device on an older app version sees a chat update as lines arrive but cannot type into it | 5.5 |
| U5 | Folders already synced through GitHub are combined at pairing without asking "same project?" (extends D12 Q-15) | 5.7 |
| U6 | A chat hosted on a phone is never cleared from that phone by the "recent" setting | 5.8 |
| U7 | Adding a device needs the same unlock as removing one, and other devices are told when one is added | 5.1, 8 |
| U8 | The longest a computer holds itself awake for one reply | 5.9 |
| U9 | A device already in a set of two or more must leave it before joining another | 5.1 |

**Open.**

| # | Item | State |
|---|---|---|
| O1 | Reaching a super-host from outside (Tailscale, tunnels, router); locking its browser view | Comparison owed before Phase 8 |
| O2 | Payment | Destin: decide later; free at fixed limits |
| O3 | A plan for the 2026-11-05 conflict copies | Left alone by his word |
| O4 | Adding or removing a device on a desktop with no OS unlock | Needs Destin if T11 finds one |
| O5 | Outside security review before the headline claim | Needs Destin |
| O6 | When the relay erases a device set nobody has used | Needs Destin |
| O7 | Interim period: GitHub upload is unslimmed and grows | Known; follows from his order |
| O8 | Is the relay on from the first pairing, or switched on by the user? | Needs Destin |
| O9 | What the one-device backup prompt offers at the switch, before the new backup exists | Needs Destin |
| O10 | Backup choices that work on every device (D10 S-3) | For the backup rebuild's design |
| O11 | Does a device switch when it is updated, or when it is paired? | Needs Destin |
