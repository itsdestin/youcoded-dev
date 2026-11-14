---
status: draft
date: 2026-11-14
topic: Chats on every device (YouCoded Mesh) — the design, for a builder with no prior context
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248, 253, 258
code-read-at: youcoded e73b41347, wecoded-marketplace 830ff8e (sections 3 and 7.1 re-checked at youcoded 4c6ac0055, wecoded-marketplace 60766a5 on 2026-11-14, Phase 0 S3)
phase0-amended: 2026-11-14 — engineering sections 3 to 13 carry the Phase 0 findings, each tagged "(Phase 0: <report> <item>)"; reports are in docs/active/investigations/2026-11-14-mesh-phase0/; Destin's questions from them are in round-15-choices.md; section 2 is untouched
---

# Chats on every device (YouCoded Mesh)

## 0. How to use this document

This is what to build, how the parts fit, and in what order. No application code has been
changed yet.

- **Section 2 is decided by Destin Moss, the product owner.** Do not change anything in it
  without asking him. Two lines there, marked "(unconfirmed reading)", are the designing
  session's reading of his answers and still need his yes. Where each rule came from is in `decided-sources.md`; his exact words
  are in `README.md`.
- **Sections 4 to 12 are engineering.** A builder may change them when a test or the code
  says so, provided nothing in section 2 changes. Record why.
- **Section 13 is what is still open.** Do not build an open item on a guess; ask.

Reading path: sections 1, 2, 4, 10 for the whole picture. To build a part: its subsection of
5, its contract in 6, its rows in 7, 9 and 10. Section 3 is reference.

**Rules that bind the builder.**

1. Anything a user can experience (screens, wording, flows) is approved by Destin before it
   ships, pictures first, through the review-deck flow in `.claude/rules/feature-flow.md`.
2. Never experiment on Destin's running app (`.claude/rules/live-app-safety.md`). **Every
   instance with the mesh switched on runs with its own home folder.** Dev instances share
   his real `~/.claude` chat folder, and this feature rewrites chat files. Building that
   rig is test T1 and comes before any other code.
3. A key is never synced to GitHub or stored on any server.
4. The old and new sync systems never run side by side on a device.
5. Destin is not a developer. Speak to him in plain words, with pros, cons and a
   recommendation. Four or more questions go on a questions deck. Never suggest merging.

---

## 1. Goal and words

It feels like claude.ai, but the user's own devices are the server, and nothing in the
middle is required or trusted. It is for any mix of Windows, Mac, Linux and Android.

"Mesh" means four properties, not a networking technology:

1. Devices pair with each other.
2. Keys live only on the user's devices.
3. Any device can catch another one up.
4. Whatever sits in the middle cannot read contents and can be swapped for another.

| Word | Meaning |
|---|---|
| Device set | The devices one user has paired together. |
| Host | The one device where a chat's assistant actually runs. |
| Watcher | Any other device showing that chat live and typing into it. |
| Keeper | Something always on that holds locked data while devices sleep: the relay or a super-host. |
| Relay | The keeper YouCoded runs. It cannot read contents. |
| Super-host | The user's own always-on device running a complete YouCoded with no window. It is a device, and can read contents. |
| Line | One line of a chat's transcript file. |
| Extras | Files saved for one chat outside its lines: helper working files, saved long outputs, the plan, the to-do list. |
| Used | A chat was "used" when its last line was added. |
| Talk-only | A chat continued where its project folder is absent: it can talk but not touch files. |
| Chat version | One of two or more continuations of a chat that share an earlier part. |
| Control log | A small signed record per chat: who hosts it, takeovers, deletion, versions. |
| Head | Where a copy of a chat version ends: segment, line count, chain hash. |
| Segment | An append-only run of lines. A new one starts only if the runtime rewrote its file. |
| Reply end | A line at which a reply finished. Takeovers always happen at one. |
| Host entry | The `claim` or `takeover` entry that currently makes a device the host. |
| Tail | Lines a previous host wrote beyond a takeover point. |
| Set aside | Kept on disk, hidden, not part of the chat, until its fate is known. |
| Parked | Received but not yet usable (a hole before it, or a signer not yet known). |
| Void | A control entry that `decide` ignores. |
| Fenced | A host that has agreed to hand a chat over and refuses new messages for it. |
| Register | A small value a keeper holds per chat or project, changed by compare-and-swap. |
| Generation | A numbered edition of the set's secret. A removal makes a new one. |
| Sealed | Encrypted so only devices of the set can read it. |

---

## 2. What the user experiences (decided)

Wording in quotes is approved example wording; final wording is confirmed when each screen
is reviewed.

### 2.1 One list, one host per chat

- One list of chats on every device. Every project is listed on every device.
- One device hosts each chat. Every other device shows it live and you type into it as if
  it ran there. A chip in the status bar names the host.
- A watcher shows the chat as its host does: YouCoded's own ("native") chats word by word,
  Claude Code chats a block at a time. Making Claude Code chats word by word is separate
  work.
- The host never changes by itself. It changes when you tap the chip, or when the host is
  offline and you tap Continue here.
- You can start a chat on one device that runs on another, if that device is on. Devices
  that are off or asleep are greyed and marked "offline".
- A phone that is not in use shows as offline to your other devices and catches up when
  the app is opened.
- The phone is a full host, equal to a computer, and opening a chat on it works exactly as
  on a computer. Features it still lacks are named in the notice until they are built.
- Permission requests can be approved from any device. The request shows wherever the chat
  is open and disappears everywhere once answered.
- A message sent just as the host drops stays in the box, marked "Not sent. Desktop went
  offline", with the Continue here offer. Never thrown away, never delivered late.
- A watcher has the limits a phone has today (no assistant browser, no Office documents,
  no image paste, no dragging files in), on a computer too. The limits live in one list
  and each shows: "X is not currently supported from a remote client."
- Renaming and marking complete apply everywhere. A chat marked complete closes on every
  device.
- Deleting a chat deletes it everywhere and stops a reply running in it. It stays 30 days
  in "Recently deleted" on each device. A device returning after weeks obeys a deletion it
  missed.

### 2.2 How much each device holds

- One setting per device: **keep everything**, or **keep recent chats and fetch the rest
  on opening**. Computers and a super-host start on "keep everything", phones on "recent".
  Every chat is listed either way. A user with one device has no such setting; it appears
  once a second device is paired.
- "Recent" means used in the last 30 days, the same clock everywhere. Such a chat is whole on every device, extras
  included, unless the relay was full and let it go; then it arrives when the device meets
  one that has it.
- On "recent", an older chat cannot be read offline until it has been opened there once.
  If the only device holding its extras is off, the notice says the helpers' reports are
  kept but unfinished helper work cannot be continued.
- A chat hosted on a phone is never cleared from that phone by "recent".

### 2.3 What travels

- A chat's lines, whole, pictures included, and its extras.
- Project files, on the same locked system (2.8).
- On mobile data a phone syncs everything, always.
- Not carried: undo history; the assistant's setup (skills, plugins, connected tools,
  global instructions; card 248).
- (Unconfirmed reading.) He dropped "pasted images" in one answer and kept images in sync
  in a later one. Read together: a picture sent in a chat travels, because it is stored
  inside the chat's lines; only the device's separate scratch copy of pasted images is
  left behind.

### 2.4 Pairing, devices and security

- Everything that syncs is locked so only the user's devices can read it. (Unconfirmed
  reading.) A keeper can still see how many devices and chats there are, their sizes and
  when they are active; the product must not claim otherwise.
- A device joins only by pairing with a device already in the set. No account is needed.
- Pairing: scan a QR code, or type a short code when there is no camera. The code expires
  after a few minutes. The device already in the set shows the new device's name and asks
  "Add this device?" before anything is shared.
- Any device may add or remove another, after passing its own unlock (fingerprint, PIN or
  password). Other devices show "Laptop was added by Phone".
- When both devices already hold chats and projects, pairing first shows what each holds
  ("This device: 212 chats, 4 projects. Desktop: 630 chats, 9 projects") and offers:
  combine everything, or cancel. Pairing never deletes anything.
- A project with the same name on both is asked about, one at a time: "Is this the same
  project?" Same: combined, and a file that differs keeps both copies. Different or not
  sure: both kept, one renamed, for example "Website (from Laptop)".
- Pairing a device that is already paired with others joins the two sets into one. The
  screen names every device that will end up together.
- Removing a device locks it out of everything new and frees the chats it was hosting. It
  keeps what it already holds and can be paired again. Anything it wrote and had not sent
  is lost unless it is paired again.
- A device not seen for 30 days triggers a one-time offer on the others to remove it.
  Nothing is removed without a yes.
- If every device is lost at once, chats without a cloud backup are gone for good; nobody,
  including YouCoded, can recover them.
- A device restored from a cloud backup is the first of a fresh device set.
- Different app versions: an older device can read and watch, but must update before
  hosting or continuing a chat a newer one changed ("Update YouCoded on Phone to continue
  this chat"). A device too old to watch live still shows the chat as each block is saved,
  but cannot type into it.
- A device is identified by the id the app already gives each machine.

### 2.5 Keepers

- Both are offered: the YouCoded relay, and the user's own super-host. No keeper at all is
  also supported: devices catch each other up whenever two are on together.
- The relay is on from the first pairing, with a line saying so and a switch to turn it
  off. No sign-in; one is added only if abuse appears. It is free at the limits below
  (payment is open, O2).
- The relay is a waiting room, not an archive:
  - It holds a chat's waiting lines until every device has them, or until 30 days after
    that chat's last line, whichever comes first.
  - At most 1 GB per device set, covering everything waiting: lines, extras and project
    file changes. Data passing straight between two devices that are both on is not stored
    and does not count.
  - At 1 GB it lets go of whole chats, least recently used first, and the host says:
    "Relay full. 3 older chats are kept only on Desktop until Phone and Desktop are on
    together."
  - Lines the relay has let go of exist only on the device that wrote them until another
    device collects them. If that device is lost first, they are gone.
  - With no time limit it keeps one wordless note per chat (latest line number and which
    device has it) and one per project (latest change).
  - It erases what it holds for a set after 90 days with no device connecting. Nothing on
    the devices is touched; they register again by themselves.
- Devices on the same wifi talk directly, with the same locking. Others on that wifi can
  see that a YouCoded device is there, nothing more. This path needs its own security
  review before release.
- A super-host is a complete YouCoded with no window, on a device at home (a desktop left
  on, a Mac mini, a Raspberry Pi). It pairs like any device, holds every chat and project
  with no limit, hosts chats, catches devices up, passes live words, and opens in a
  browser. It holds keys, so it must be hardware the user trusts. A rented server is not
  offered.
- With a super-host the relay stores nothing for that user, except while the super-host
  cannot be reached; the user can switch that fallback off.
- Away from home, a super-host syncs through the relay by default, or through the user's
  own front door (open, O1).

### 2.6 When the host goes away

- **Awake.** A computer holds itself awake while a reply it is running is unfinished, for
  at most 2 hours per reply. Closing a laptop lid still sleeps it. There is no permanent
  keep-awake.
- **Phone as host.** The phone stays awake for each reply with the screen off. A setting
  the user opts into exempts the app from Android's battery limits and explains the cost.
- **Sleep.** Nothing special is sent, because every line was sent as it was written. A
  file change from the last couple of seconds may not have gone; it sends on waking. On
  waking, the host checks it is still the host before a reply does anything further.
- **Quitting the host.**
  - The normal close menu appears (flags, mark complete).
  - The app quits at once provided every finished reply has reached another device, the
    relay or the super-host. It never waits for a running reply; that half is dropped.
  - Unsent project file changes are sent first, for a few seconds at most.
  - If anything is left, or the device is offline, it quits anyway and says: "Offline -
    some chats may not have synced."
  - A one-device user never sees that line. With two or more devices it appears only when
    something has not left the device. With no relay, no super-host and the other
    devices off, where it would show on every quit, it is explained once and afterwards
    the chat list's "waiting" label carries it.
  - On other devices the chat stays listed: host disconnected, host it here?

### 2.7 Taking over, and the notice

- The "host is offline, continue here?" notice appears when you open or type in that chat,
  not the moment the host drops.
- Tapping Continue here adds a visible divider to the chat, like today's "Model switched
  to" divider, and the assistant can read it. (Example: "Now hosted on Phone".)
- The unfinished reply is dropped; the chat carries on from the last finished one. Files
  that reply already changed stay changed, and the notice says so.
- When the old host returns it learns it is no longer the host and discards its half.
- If two devices tap Continue here at once, the first to be heard becomes host; the second
  shows "Phone just took over this chat" and stays a watcher.
- With no connection at all, Continue here still works, with a warning.
- A continued chat keeps its exact model, provider and project settings.
- Chats continued on the phone come back one at a time, by opening each and tapping its
  chip.

**The notice.** When several situations apply they appear together in one box.

| Situation | What it says |
|---|---|
| You tap the chip, host is on | "Host this chat on this device instead of Desktop?" The switch waits for a running reply to end. |
| Host off, nothing missing | "This chat was hosted on Desktop, which is offline. Continue here?" |
| Host went off mid-reply | "Desktop went offline partway through a reply. If you continue here, that unfinished reply is dropped and the chat carries on from the last finished one." Plus: files it already changed stay changed. |
| This device may be behind | "Desktop is offline and may have newer messages or files than this device. Continuing here could create a second version." |
| This device is known to be behind | "Desktop has 120 newer lines and is offline." Button: "Continue from here as a new version". |
| Files known to be behind | "Desktop has newer files and is offline." |
| Project folder not here | Stops to ask: turn on sync for this project and fetch it first (what is missing, why, storage needed), or continue talk-only. |
| Secrets or skipped folders | "These stay on Desktop: .env, node_modules, …" |
| Sign-in missing here | Stops to ask. A Claude Code chat waits for sign-in to Claude. A native chat shows the model picker. |
| Features this device lacks | "You may continue here, but this chat will not have: …" naming only what is really missing. Adds, when the chat is really using it: "If this chat needs hardware or files that exist only on Desktop, it may be best to wait." |
| On the old host, when it returns | "This chat continued on Phone while this computer was offline. Its unfinished reply here was discarded." |
| Two versions found | "This chat was continued on both Desktop and Phone while they could not reach each other. There are now two versions. Keep both, or archive the older one?" |
| Host was removed | "Phone was removed from your devices. Continue this chat here?" |
| Chat's body is on no device that is on | "This chat is stored on Desktop, which is offline. It will open when Desktop is on." |
| Older app version | "Update YouCoded on Phone to continue this chat." |

**Talk-only.** A note saying the chat cannot touch files is added at the end; nothing
earlier is edited. When the chat later moves to a device that has the project, a note tells
the user and the assistant that files can be used again.

**Versions.** Accidental duplicates are prevented. The one unavoidable case is two devices
continuing the same chat while neither can reach the other or a keeper; it is caught when
they meet and the older one is offered for archiving. Deliberate forks are equals, grouped
in the resume browser. "Continue from here as a new version" is a deliberate fork: both
stay, with no archive prompt, including when the old host later turns out to hold finished
replies. A better versions screen is card 243.

### 2.8 Project files

- Files travel on the same locked system as chats, through the same keepers.
- The hidden version history each synced project already keeps
  (`<project>/.youcoded/sync.git`) stays as the version store. Only the carrier changes:
  device to device, in place of GitHub. Nothing new is built for browsing old versions.
- A project is listed everywhere and downloaded to a device when sync is turned on for it
  there, once, from the notice or the project list. If the only device holding it is off, it cannot be fetched until that device is on.
- Changes go out about 2 seconds after the last edit (15 today), tuned during the build; a
  burst is one send.
- The moment a project's files change, the host sends its note; the keeper keeps the
  latest per project.
- Two devices may host chats in the same project at once, with no notice. Changes to
  different files, or different parts of one file, combine by themselves. When both changed
  the same lines, both are kept: one under the file's name, the other as
  "name (from Device, date)". Which keeps the name follows one fixed rule on every device.
  When one device edited a file and another deleted it, the edit is kept.
- If two devices' copies of a project share no history, the project shows "These copies
  have diverged" and is not combined automatically.
- As today: huge and generated folders are skipped; secrets never leave the device.

### 2.9 What is replaced, and the switch-over

- Today's remote access is replaced inside the apps: no Connect screen, no Tailscale for
  chats. The open-in-a-browser view stays, through Tailscale, and is how a super-host is
  looked at.
- There is no self-run relay. Self-hosting means a super-host.
- The current handoff and takeover code is replaced, not patched. The conflict copies from
  2026-11-05 are left alone.
- **One release, not staged.** There are about 5 to 10 users.
- **A device switches when it is updated,** paired or not. From then GitHub two-way sync
  is off on that device and every user's backup, whichever service, is one-way. Uploading
  to GitHub as a backup continues until the backup rebuild. All syncing between devices
  goes through the new system. Existing chats need no moving. A one-time message says what
  changed.
- GitHub's one-time "restore to a new device" keeps working until the backup rebuild.
- On day one, devices that already share chats through GitHub are combined quietly where
  one copy is simply longer; real differences are listed once, together.
  Projects already synced through GitHub are recognised as the same project without asking.
- A user with one device is asked to set up a backup or to say plainly they want none,
  with all three services offered. Until the backup rebuild only a GitHub backup can be
  restored (Drive and iCloud copies gain restore with the rebuild); the app says so.
- Alerts across devices are not part of this work (card 242).

### 2.10 Cloud backup (built after the mesh, with its own design)

Order: everything else in the mesh build first, then the backup rebuild, including any
needed GitHub changes. Decided so far:

- One backup feature: Google Drive, iCloud or GitHub, same contents and same restore.
  Never a YouCoded server.
- It holds everything, with switches for chats, the assistant's setup and each project.
- Unlocked by default; a passphrase lock can be switched on. Turning on an unlocked backup
  asks: "This backup is not locked. Anyone who gets into your Google account can read your
  chats and files. Lock it with a passphrase instead?" Buttons "Lock it" and "Back up
  without a lock".
- A new device offers two ways in: pair, or restore from the cloud backup.
- It sends only what changed, as often as each cloud allows, at least daily. A phone waits
  for wifi and charging unless "Back up now" is tapped. Dated restore points as today.
- Any one device that can reach the cloud backs up for all. The screen names chats never
  yet on a backing-up device: "212 chats are not backed up yet. They are on Desktop."
- Backups leave out pictures and duplicate file text; sync never does. A chat restored
  from backup lacks its pictures, and the assistant no longer knows what it knew only from
  them.
- Open: making every backup choice work on every device (O10). For later: backups hosted
  by YouCoded (card 253); storage growth (card 98).

---

## 3. What exists today (read this before designing against it)

Facts read in the code at the commits in the header. Paths are under
`youcoded/desktop/src/` unless noted. Android runs this same backend headless, so the
backend modules exist once. The start-up wiring exists twice: `main/main.ts` for desktop
and `main/headless/headless-boot.ts` (330 lines, "Keep it in step with main.ts"; was 307 when
first read; Phase 0: S3) for the phone. Anything wired at start-up must be wired in both.

### 3.1 Where chats live

| | Claude Code chats | Native (YouCoded's own) chats |
|---|---|---|
| File | `~/.claude/projects/<ccProjectSlug(cwd)>/<claudeSessionId>.jsonl` | `~/.youcoded/sessions/<nativeStoreSlug(cwd)>/<sessionId>.jsonl` |
| Written by | Claude Code itself; YouCoded only reads | `harness/session-store.ts`, plain append |
| Id | Minted by Claude Code; linked to the app's own session id in `sessionIdMap` at the first `SessionStart` hook | The app's id is the chat id |
| Grows only? | Always so far: 391 compactions in 1,364 chats, a 25-minute live watch with one real automatic compaction, none removed or changed an earlier byte; compaction appends a boundary line, a summary and a re-written copy of the recent lines; `/clear` starts a new id (Phase 0: T2 finding 7, 9, 13; T3 F9). The watcher's shrink handling (`transcript-watcher.ts:998-1003`; the comment at :989 wrongly says `/compact` rewrites) stays as defence in depth. **But** T21 found same-device rewrites in Claude Code chats (5b7f12b0 and 26d919ff named; T21 section 4 counts 3) and 2 native chats (tool-result lines with images edited after the fact), which T2 did not see: the two reports disagree, so whether segments are built is RESOLVED 2026-11-14 (segments-decision, see 5.3: none of these was a runtime rewrite; no segments are built). Also: lines are not unique by uuid (6,440 repeats in 11 chats), line timestamps are not increasing (1,322 of 1,364 chats), 20 lines in 2 chats are not valid JSON, Claude Code writes raw U+2028/U+2029 inside strings: copy bytes, never re-serialise, split on the byte 0x0a only, take "used" from arrival time (Phase 0: T2 finding 5, 8, 9, 10). | Yes, strictly by the app's own writer (`NativeHome.appendSessionLine`); compaction and `/clear` append marker events (Phase 0: T2 finding 15) — but see T21 for two native chats whose image fields changed in place. |
| Helper files | `<slugdir>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json` | Ordinary session files with `parentSessionId`; big reports in `specialist-reports/` |
| Rendering | `transcript-watcher.ts` tails by byte offset and emits whole blocks | `HarnessSession` emits token pieces; the store merges them into one line per part |

Slug rules are in `main/slug-encoding.ts`; `nativeStoreSlug` is frozen. `conversations/
slug-repair.ts` repairs duplicates once per launch and never deletes.

Claude Code's saved tool outputs, plans (`~/.claude/plans/`) and to-dos are not read or
written by app code today. Their exact paths were measured on Claude Code 2.1.325 (Linux) and
are in 5.3's extras table; the proposed `cc-dependencies.md` entry is in T3's report section 7
and still has to be applied (Phase 0: T3 F6). A chat file is found by `--resume` by id across
every project folder, so its folder does not have to match (T3 F2).

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

The `conversations/` folder is 6,372 lines (Phase 0: S3). The handoff, takeover and lease code inside and
around it (about 2,500 lines: `handoff-*.ts`, `takeover.ts`, `lease-client.ts`,
`resume-admission.ts`, `ipc/handoff.ts`, the pending-handoff UI, the lease gate, and the
lease half of the Worker room) is what this design replaces. Counted: 1,979 lines in the main
process, 471 in the renderer, plus the lease half of the Worker room (`sync/room.ts`); the
deletion is also a spread of edits through `App.tsx`, `remote-shim.ts`, `ipc-handlers.ts`,
`preload.ts`, `SyncPanel.tsx`, `BuddyResumeList.tsx` and `session-manager.ts`
(`stopSessionForHandoff`), not only file deletions (Phase 0: S3).

Reusable model: `handoff-transcript.ts` already extends a copy only when the existing copy is
a byte prefix of the source, with a SHA-256 receipt.

### 3.3 How devices connect today

- `main/remote-server.ts` serves the whole app of one computer to a phone or browser over a
  plain WebSocket on port 9900, bound to the Tailscale address only. No encryption of its
  own. Sign-in is a password, then a saved per-device secret.
- A client connects to one computer at a time and sees all of its sessions. There is no
  per-chat host.
- An Electron desktop cannot be a client (`renderer/index.tsx:119-120`: Electron always
  renders the local app; moved from :104-117, Phase 0: S3). Only Android and a browser can, through `renderer/remote-shim.ts`.
- Every feature is one entry in `main/ipc/channel-table.ts`, served through two doors:
  windows (`registerDesktopChannels`, line 151) and remote (`serveRemoteChannel`, line 195).
  Phone policy sits on the entry (`desktopOnly`, `remoteAllowed`, `refusal`, `remoteGuard`).
  `ChannelCtx.door` is `'desktop' | 'remote'` (`shared/backend-contract.ts:890`) and about 25
  handler sites in 11 files branch on it (recounted: 25 code uses, the same at both commits; Phase 0: S3). Windows have positive audience ids, phones negative
  (`ipc/session.ts:406, 466`). The remote door already has a second way in: `serveRemoteChannel(…, {owner:
  true})` is the Android app talking to its own backend, with refusals lifted. Parity tests
  guard the table (`tests/remote-channel-parity.test.ts` and neighbours).
- What a remote screen lacks is data in `shared/capabilities.ts`
  (`REMOTE_SCREEN_CAPABILITIES`); friendly names in `renderer/remote-unsupported.ts`.
  Only the assistant browser is a capability key and is enforced for a phone. Image paste and
  file drag are NOT refused: on a phone they silently do nothing (`saveClipboardImage` returns
  null; a browser `File` has no `path`). Office is refused at the host and hidden. The
  sentence "X is not currently supported from a remote client" exists nowhere in the code. On
  a computer used as a watcher none of the four is enforced (an Electron window never goes
  through `remote-shim.ts`). Read from code only, not run (Phase 0: T9 findings 3.1, 3.2).
  A phone's real capability set is the one in the `auth:ok` handshake
  (`remote-server.ts:193-203` overrides `sessionRecord`, `nativeSessions`, `chatgptAccount`),
  not the constant.
- Capabilities are per window, not per chat: one set on `window.claude.capabilities`,
  45 read sites in 36 files, about 19 of them inside the chat screen (Phase 0: T9 3.3).
- The channel table has 478 entries; 99 are session-scoped (26 forward as they are, 29 need a
  design answer, 44 must not be forwarded), but the table has no marker for "session-scoped"
  (Phase 0: T9 3.4). A separate older-page refusal exists for the fill protocol
  (`shared/fill-protocol.ts`, close code 4005); it is the precedent for 5.11 (Phase 0: S3).

### 3.4 The Worker

`wecoded-marketplace/worker/src/sync/room.ts`: one `SyncGroupRoom` Durable Object per signed-in
account. It passes `space-updated` signals (replay ring of 32) and holds session leases. It
stores no chat data, has no list of which devices are on (it does keep each device's last-sync
time, not whether it is on now), and relays no bytes. Route
`GET /sync/hub` requires a GitHub-backed account token. Deployed by CI on master (Phase 0: S3).
Durable Objects here are already SQLite-backed (`new_sqlite_classes`, migrations v1 to v3),
there is no R2 binding, `SyncGroupRoom` uses hibernating sockets and no alarms, and the same
Worker serves sign-in, the marketplace, themes, games and analytics, so it shares one account
quota with any relay (Phase 0: T7 3.1). The Connect 4 and Chess rooms (migration v3,
`games/tickets.ts` short-lived sign-in tickets for socket joins, `[env.test]` bindings) are the
template for a new relay object, which takes migration tag `v4` (Phase 0: S3).

### 3.5 Devices, keys, lifecycle

- Device id: `main/device-identity.ts` (a per-install UUID and a per-machine id). A device
  registry lives in the Personal space (`sync-spaces/device-registry.ts`). A device's display
  name must come from `selfDeviceName()` (env `YOUCODED_DEVICE_NAME`; the phone passes its
  name), not `os.hostname()`; `upsertSelf` heals a row still named "localhost" (Phase 0: S3 4.1).
  In a headless boot `getDeviceIdentity` and `getMachineIdentity` read the same
  `<userData>/device-id.json`; in the desktop boot the machine id is the built app's file,
  read-only, so a dev profile has none (Phase 0: T1 finding 6). The mesh does not use either
  id for its own device id (5.1).
- Crypto in the app today: Node `crypto` and `bcryptjs` only. No key-exchange library.
- Secret storage: Electron `safeStorage` on desktop; on Android an AES-256-GCM shim keyed
  from the Android Keystore (`headless/electron-headless.ts:153`). Weak spots measured in
  Phase 0 (T5 finding 17, 18): the Android key store silently falls back to ordinary
  `SharedPreferences` when `EncryptedSharedPreferences` cannot be created
  (`PairedDeviceStore.kt:50-52`); the key is a software key held in memory; blobs carry no
  context; on Linux without a keyring `safeStorage` is "encrypted via hardcoded plaintext
  password" (`getSelectedStorageBackend()` is `basic_text`) and `github-client.ts` writes its
  token as a plain 0600 file in that case while `chatgpt-auth.ts` refuses.
- Quit: `window-all-closed` quits (`main.ts:2074`). No background mode, no auto-launch, no
  windowless desktop mode. The Android backend (`headless/headless-boot.ts`) is the only
  windowless boot, and it runs under plain Node with Electron stand-ins.
- Keep-awake: `powerSaveBlocker` is used only for "keep awake for remote access". Android has
  a `keepAwake` host call (partial wake lock, 4 hour cap). No battery-exemption request, no
  wifi lock, no local network discovery anywhere.
- Versions: `PROTOCOL_VERSION` is sent to remote clients but nothing acts on a mismatch.
  (A separate refusal exists: `shared/fill-protocol.ts`, `FILL_PROTOCOL_VERSION = 2`, close
  code 4005, "This app is older than your computer's YouCoded"; Phase 0: S3.)
- Android already shows an always-on "N working, N waiting, N done" foreground notification
  (`main/background-status.ts`, `StatusNotifier.kt`, `host-bridge.ts`) and reads which chats
  are "watched" from `windowRegistry.getSocketWatchers`, which the session proxy (5.5) will
  change. Remote devices now expire and show a "signed out" row (`remote-server.ts`
  `devices.expireStale`); the mesh device list must say what becomes of that older list and
  reuse its wording (Phase 0: S3 4.2, 4.3).

### 3.6 Project files and backup

- `main/sync-spaces/`: `engine.ts` watches with chokidar, waits 15 s (`debounceMs`, line
  143; Phase 0: S3), polls every 120 s, then pulls and pushes each space through a `SyncTransport`
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
  (`git-transport.ts:895`; Phase 0: S3).
- No chat can be deleted or archived today; only renamed and flagged complete or priority.
  Delete is new.
- No per-project change counter exists; the git commit is the version.
- Guards (`guards.ts`): secrets list `NEVER_SYNC`, skipped folders `DEFAULT_IGNORES`, 50 MiB
  file cap. They are applied when staging OUTGOING files only, match the file's base name
  case-sensitively (`.ENV` is not matched) and the list is short (`.npmrc`, `.netrc`, cloud
  credentials, key stores and others are absent); nothing checks what ARRIVES (Phase 0:
  threat model G-7, 4.8). Git calls carry `core.hooksPath`, `fsmonitor`, `sshCommand` and
  `protocol.ext` overrides (`git-transport.ts:62-71`) but not the user's global or system git
  config.
- Backup: `daily-backup.ts` copies every space, chats included, to Google Drive (through
  `rclone`) or iCloud once a day. No restore exists. A "GitHub" backup type exists in the
  settings but copies nothing. `rclone` is not shipped on Android.
- A new device restores today by turning sync on: the first pull adopts GitHub's history, the
  registry downloads every project, and `materializeSweep` copies transcripts back.

### 3.7 Test rigs

- `scripts/run-dev.sh --offset N --profile name --label "…"` runs separate dev instances side
  by side. **Outdated as first written (Phase 0: T1 finding 14):** each launch now gets a
  private home (`~/.cache/youcoded-test-copies/<profile>/home`, card #17), but it needs a
  window and a profile has no machine id, so it still cannot run three windowless devices.
  The Phase 0 rig (`docs/active/prototypes/2026-11-14-mesh-phase0/T1/rig.mjs`) runs N
  windowless backends, each jailed with bubblewrap (the real home replaced by an empty
  decoy), with its own device id, hostname, clock and links; it passes T1 on Linux. It needs
  `bwrap` (Linux only); a Windows or macOS rig is a separate job. Run folders belong outside
  the real home where possible (the app reads `CLAUDE.md` and `.git` in every parent of a
  chat's folder). A device takes its peer addresses from a config input when present (5.2).
  The headless boot hard-codes the platform `android` (`headless-boot.ts:139`, `:306`): the
  proposed `YOUCODED_HEADLESS_PLATFORM` override is in 5.10 and is not applied.
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
 │  Project carrier (git over mesh) ──────────────┤                    │
 │                                                ▼                    │
 │  Device set & keys ─────────►  Link layer (one interface)           │
 └───────────────────────────────┬───────────┬───────────┬────────────┘
                          same-wifi direct   relay    super-host
```

| Part | Job | Replaces |
|---|---|---|
| Device set & keys | Device identity, pairing, the set's secret, removal | — |
| Link layer | "Send this sealed frame to that device or the keeper" over whichever path works; presence | — |
| Relay | Blind waiting room, registers, presence, pass-through, pairing meeting point | A new Durable Object beside `SyncGroupRoom` |
| Chat store | This device's durable copy of each chat: lines, hash chain, extras, control log, summary | `transcript-mirror`, `ConversationRecord` |
| Replicator | "Everything after line N" between any two devices or a keeper | The Personal-space chat lane |
| Control log + host control | Who hosts, takeovers, delete, versions, names, flags | Leases, `takeover.ts`, `handoff-*`, `resume-admission.ts`, `ConversationNames/` |
| Session router + proxy | Makes a chat hosted elsewhere look local to the renderer | The remote shim, for app use |
| Project carrier | Moves git history between devices | GitHub as the remote |
| Notices | One pure function from facts to the rows in 2.7 | — |
| Storage policy | Keep everything / recent; Recently deleted | — |
| Lifecycle | Awake per reply, quit rule, launch and wake checks | — |
| Super-host | The headless boot, on a desktop OS | — |
| Interim backup lane | Upload-only GitHub copy and one-time restore, until the backup rebuild | — |

### 4.2 Five ideas the rest depends on

1. **Two lanes.** The **durable lane** carries lines, extras, control entries, roster
   entries and project history: stored, signed, verified by hash, retried until
   acknowledged, held by keepers, and safe to receive twice or out of order. The **live
   lane** carries token-by-token words, "reply running" and open permission prompts: sent
   only to devices with the chat open, never stored by a keeper, rebuilt from a fresh
   snapshot after a gap. Every live event names the line it belongs to, so a device knows
   how far behind its durable copy is. Live events and beats are signed like every other
   frame, and a watcher accepts them only from the device `decide` names as host
   (Phase 0: T5 G4; threat model L-6, S-8).
2. **The chat store is the truth; runtime files are working copies.** Claude Code and the
   native runtime keep writing their own files as today. On the host an adapter copies each
   new line into the store. The store always holds its own bytes, on every device,
   because Claude Code deletes old transcript files (`cleanupPeriodDays`). On other devices
   no working file is read. A device that becomes host writes a fresh working file from
   the store. A device that stops being host never touches a working file a process might
   still be writing; it is replaced the next time that device becomes host. **Exception to
   "no working file is read" (Phase 0: data-loss D-6, D-7, INV-7, INV-8, INV-16):** work done
   in a terminal on a device that is not the host writes lines the store never saw, so the
   adapter also watches runtime files of chats this device does not host, and always runs
   once over a working file before it is replaced; unknown lines become a tail or version,
   with a notice. Slug repair, the launch sweep and project moves also rewrite working files
   on the host, so the adapter treats a moved or replaced file as an ordinary event, and the
   store is keyed by chat id, never by path (Phase 0: T20 4.2; T2 finding 6).
3. **Nothing is deleted or merged on a guess.** Hash chains decide whether one copy
   extends another. One pure function over the control log and roster decides who hosts.
   Lines that might be an abandoned half reply are set aside until the device that wrote
   them says what they were. When no single answer exists the result is "two versions",
   shown to the user. Everything set aside (damaged copies, `not-a-prefix` copies, tails,
   old segments, void lines) follows ONE retention rule: never deleted while it holds a
   reply end the live chain lacks (Phase 0: data-loss INV-9, K-2).
4. **A split in the record is not a split in the chat.** Two devices may both write "I am
   the host". That is two versions only if their lines differ. If one copy is a longer or
   equal copy of the other, it is one chat.
5. **A keeper is never the only copy and never the authority.** A device does not clear
   its copy of anything until another device has it (a super-host is a device). What a
   keeper says is checked against device signatures, and no outcome depends on what
   reached a keeper first. "Another device" means an anchor: a keep-everything device or a
   super-host currently on the roster that has re-proved it holds the bytes (5.8); a device
   that may itself evict, or that was wiped, never counts (Phase 0: data-loss D-1, INV-1).

### 4.3 Walk-throughs

**A. First device, then pairing a phone.**
1. First run: the device creates its keys and a set of one, and contacts no relay. Every
   chat on disk is indexed and gets a `claim` naming this device as host, the head it
   holds, and whether the chat was last run here. No chip while the set has one device.
2. Devices → Add device → unlock. It opens a meeting point and shows the QR and code.
3. The phone scans; the key exchange runs; the computer shows "Add this device?".
4. On yes: roster entry exchanged; set secret sent sealed. The phone takes the computer's
   signed table of chat heads directly, before trusting any keeper.
5. If both hold data, combine-or-cancel runs on counts first. A chat both hold has two
   `claim` entries, and `decide` (5.4) settles it: a longer copy stands and its holder
   hosts; identical copies, the device that last ran the chat hosts; different copies are
   listed once as two versions. Copies are compared by the conversation chain (user and
   assistant lines only), not the raw chain: with raw bytes 5 of Destin's chats would show a
   false second version, because opening and closing a chat on a second computer appends
   bookkeeping lines (5.3; Phase 0: T21 finding 6A). "Last ran here" has a weak source
   today: the conversation record's `device` field, which holds a hostname, not a device id
   (the phone says "localhost"; 113 of 3,058 records are empty; 1,299 native chats have no
   record at all). At first run the claim records the real device id, compared with this
   machine's host name once; chats whose record has no device are "not last run here".
   Real code must write the device id beside `device` at each turn end (Phase 0: T21
   finding 9, 4.5).
6. Both connect to the relay unless it is switched off.
7. Catch-up: control logs and summaries first (the list fills in seconds); then lines of
   chats used in the last 30 days, newest first; then extras. No project is downloaded to
   the phone until sync is turned on for it there.

**B. The phone watches a chat; the desktop loses power mid-reply; the phone continues; the
desktop returns.**
1. Heartbeats stop; presence says the desktop is gone. Nothing shows until the user opens
   or types in the chat.
2. The phone works out the notice facts: host offline; whether its last durable line is a
   reply end; how far behind it is (from the live lane's highest line, and the keeper's
   register if reachable). The rows that apply are shown together.
3. On yes the phone reserves the host role (5.4), appends a `takeover` naming the last
   reply end it holds, writes the working file from the store, and resumes.
4. The desktop starts. Before any chat continues, it fetches control logs from whatever it
   can reach. It is no longer host: it stops the chat's process if the app owns it and
   appends `released`, stating what it had beyond the takeover point.
   - Only an unfinished reply: set aside (to the user, dropped); "continued on Phone" row.
     "Unfinished" is concluded only for a recognised mid-reply state; any doubt counts as
     finished (5.4; Phase 0: data-loss INV-5). About 1 in 10 native chats and 3% of Claude
     Code chats end mid-reply on real data (Phase 0: T2 finding 18).
   - Finished replies the phone never had: a second version; "two versions" row on both.
     The rules that decide this are being re-written (PENDING (T12b decide rules), 5.4).
     If the phone's user chose "Continue from here as a new version", it is a deliberate
     fork and no archive prompt shows.
5. If the desktop can reach nothing, it carries on as host. That too can end in a second
   version.

If the chat's project is not on the phone, the notice stops to ask. Fetching needs a
device holding the project to be on; otherwise the choice is shown as unavailable and the
user may continue talk-only (5.4).

**C. Two devices tap Continue here at once.**
- A keeper is reachable: each tries to reserve the host role in the keeper's register. One
  succeeds and publishes its takeover. The other publishes nothing, shows "Phone just took
  over this chat", and stays a watcher.
- No keeper, but they reach each other: the same, with the lowest-id online device as
  arbiter.
- Neither reaches anything: both publish. When they meet, `decide` settles it.

**D. Removing a stolen phone that hosted three chats.**
1. Devices → Remove → unlock. The removal lists, per chat, the last entry and line from the
   phone the computer had seen. Each remaining device then adds what it already held. What
   the phone signs or sends beyond the furthest of these is void everywhere. The removal
   screen first says what the phone hosted, when it was last seen and that anything it never
   sent is set aside, not deleted; void means hidden and kept, and is offered back as
   versions if the phone is paired again (Phase 0: data-loss D-10, INV-11; the wording needs
   a deck). A device that learns of the removal from any peer never witnesses later
   arrivals, so a relay that delays the notice cannot widen the cut-off (5.1; Phase 0:
   threat model R-2).
2. The computer creates the next key generation and sends it sealed to each remaining
   device, directly and through the keeper's per-device mailbox. The keeper refuses the
   phone at once; devices compare roster heads before serving each other.
3. The three chats have no host. Opening one shows the "host was removed" row.
4. If a device holds a tail from the phone, the removing device appends `released` on the
   phone's behalf, naming the longest tail any reachable device holds.

**E. An older chat on a "recent" device.** The list row is there; the lines are not; the
relay let them go at 30 days. The replicator asks every online peer. If none has it:
"stored on Desktop, which is offline".

---

## 5. The subsystems

### 5.1 Device set, keys and pairing

- **Identity.** ~~The existing per-machine id (`getMachineIdentity`), hashed.~~ Replaced
  (Phase 0: T5 G9, C2): a device's id is the first 16 bytes of
  `SHA-256("youcoded-mesh/v1/device-id\0" ‖ its public signing key)`. It is self-certifying
  and the machine id is not used by the mesh at all. Why: the machine id is sent in clear to
  the existing sync hub (`sync-hub-socket.ts:80`), so a plain hash of it is computable by
  whoever holds that data, and the analytics id uses an HMAC salt shipped in the open-source
  app (`analytics-service.ts:192`); a hash would not keep a set unlinkable from an analytics
  record. Reinstalling with data intact keeps the keys and therefore the id, which gives
  "same machine replaces its entry" without any machine id. **This contradicts the last line
  of section 2.4 ("identified by the id the app already gives each machine"); section 2 is
  not changed and the question is in round-15-choices.md (P-11). OPEN until he answers.**
  Relay-visible ids must not be linkable across two sets paired from one machine
  (Phase 0: threat model Y-6). A rig device gets its id by writing `device-id.json` before
  boot only for the registry, not for the mesh id (Phase 0: T1 finding 6). The device name
  shown comes from `selfDeviceName()`.
- **Keys.** Each device creates an Ed25519 signing pair and an X25519 key-agreement pair on
  first mesh start, stored in ONE file per device (for example `<userData>/mesh/keys.bin`),
  written 0600 from the first byte, atomically, sealed by `safeStorage` (desktop) or the
  Keystore-backed shim (Android), and excluded by an ast-grep rule and a test from every
  synced folder, backup and log (Phase 0: T5 C11, G19). **Android must never fall back to
  plaintext:** the backend asks "was the Keystore really used" and refuses to start the mesh
  otherwise, because `PairedDeviceStore.kt:50-52` today silently falls back to ordinary
  preferences; mesh blobs also carry their own label as associated data (T5 finding 17).
  **Linux with no secret store** (`getSelectedStorageBackend()` is `basic_text` or
  `unknown`): the proposal is that the mesh refuses to switch on and explains how to set a
  keyring up, following `chatgpt-auth.ts`, not `github-client.ts` (T5 finding 18); this is a
  visible behaviour, OPEN until Destin answers (round-15 P-3). The same refusal applies to a
  super-host on `basic_text` (threat model B-1). Each device's agreement key is rotated at
  every generation change (signed roster entry; T5 G20).
- **Set secret and key hierarchy** (Phase 0: T5 C1, C3, C4). One cipher suite, no
  negotiation: Ed25519, X25519, HKDF-SHA256, HMAC-SHA256, SHA-256/512 and ChaCha20-Poly1305
  (96-bit nonce) from Node `crypto`; a version byte `v` in every header, an unknown `v`
  refused, never downgraded. The set secret `S_G` is 32 random bytes made by the first
  device, never used directly, and a new generation's secret is fresh random bytes, never
  derived from the old one. `K = HKDF-SHA256(ikm = S_G, salt = setId, info =
  "youcoded-mesh/v1/" ‖ purpose ‖ 0x00 ‖ u32(G) ‖ context, 32)` with purposes `frame`
  (context = sender id and session) and `roster-name`; registers reuse `frame` (T5 G17).
  The frame key is therefore **per (generation, sender, session)**. `setId` = `SHA-256("youcoded-mesh/v1/room\0" ‖ the first
  device's public signing key)`, and is also the relay room name; it is derived from a public
  key, never from the set secret, and nothing displayed to the user is the room id (threat
  model Y-2). The set secret reaches a new device only during pairing, sealed to it (HPKE,
  below).
- **Nonces** (Phase 0: T5 C4, G2; threat model L-2). The 12-byte nonce is `00 00 00 00 ‖
  u64 counter`; the sender is NOT in the nonce because it is in the key. (1) `session` is
  16 fresh random bytes on **every process start** and the counter starts at 0; (2) a
  sender **never saves or restores its own counter or session** (the old line "session
  saved with the counter" applies to receivers' duplicate tables only), because a restored
  backup or a virtual-machine snapshot that rewinds a saved counter would reuse a nonce under
  one key, which for this cipher leaks the XOR of two plaintexts and the authentication key
  (shown in T5's `test-mesh.mjs`); with a fresh random session a rewind gives a new key and
  is harmless; (3) a sender refuses to seal at counter 2^32. A static check bans random
  96-bit nonces under a shared key; a unit test proves two devices at the same counter use
  different keys.
- **Generations.** A removal creates the next generation, sealed separately to each
  remaining device. Frames name their generation; devices keep old ones to read old
  frames, and a newly paired device is given every generation still in use. Secrecy from a
  removed device begins with the first frame sealed under the next generation.
  - The `remove` entry and the next generation's `keygen` travel as ONE signed bundle; a
    device that knows of a removal seals nothing more under the old generation, and the
    removal screen lists "devices that had not yet confirmed" so the real exposure window is
    shown (Phase 0: T5 G7; threat model R-5).
  - There is no forward secrecy between generations: whoever records what a keeper holds and
    later gets the set secret from one device can read that generation. A hash ratchet is NOT
    adopted (an offline device must catch up). A scheduled new generation (for example every
    90 days) made exactly like a removal's would bound the exposure; whether to build it is
    OPEN (O17). Honest product statement: the relay cannot read your chats; if someone both
    copies what the relay holds and later steals one unlocked device, they can read the last
    weeks of what passed through it (Phase 0: T5 C12, G10; threat model R-4).
  - The sealed secret for each device is sent with HPKE base mode (RFC 9180, X25519 /
    HKDF-SHA256 / ChaCha20-Poly1305), built from Node primitives and proved against the
    RFC's Appendix A.2 vector; `info = "youcoded-mesh/v1/keygen\0" ‖ setId ‖ u32(G)`, `aad` =
    sender id ‖ recipient id; because base mode does not authenticate the sender, a sealed
    secret always travels inside a signed frame (Phase 0: T5 C6).
- **Signing.** EVERY frame is signed by its sender, with no exceptions: durable lines,
  control, roster, forwarded calls and results, device-to-device acknowledgements, **live
  events, beats and `hello`** (Phase 0: T5 G4, G18; threat model L-6, X-2). A watcher
  accepts a live event or beat only from the device `decide` names as host for the named
  host entry, and a `call-result` only from the device it was addressed to. Frames are
  **sign-then-encrypt with the signature bound to the outside header**: `header =
  {v, set, to, group, gen, from, session, counter, kind}`, `aad = canonical(header)`, `sig =
  Ed25519("youcoded-mesh/v1/frame-sig\0" ‖ u32(len aad) ‖ aad ‖ canonical(body))`,
  `ciphertext = ChaCha20-Poly1305(key = K(frame, gen, from, session), nonce, aad,
  canonical{b: body, s: sig})`, wire = `canonical{h: header, c: ciphertext}`. The header
  fields a receiver needs to pick the key and nonce (`from`, `gen`, `session`, `counter`) are
  therefore OUTSIDE and readable by a keeper (the old layout put them inside the seal and
  could not be decrypted: T5 G1). A keeper's `seq` is NOT in the header: it is added after
  sealing and is routing only; order and duplicate protection come from
  `(sender, session, counter)`, and the group in the associated data stops a relay moving a
  frame between groups (T5 G3; threat model L-1). Receivers authenticate first and record
  `(sender, session, counter)` only afterwards so junk cannot poison the duplicate table; a
  previously seen session id never starts a fresh record (threat model L-3). Registers are
  ordinary signed frames in group `reg:<key>` whose associated data includes the key name
  and the previous value's hash (T5 G17). Measured cost: about 250 bytes of overhead per
  frame; sign+seal 0.38 ms and open+verify 0.52 ms for a tiny frame, 14 ms each way for 1 MB.
- **Canonical encoding** (Phase 0: T5 C5, C8). Entries and headers are encoded as
  deterministic CBOR (RFC 8949 section 4.2.1), a restricted subset with a decoder that
  refuses non-shortest integers, indefinite lengths, floats, tags, negatives, unsorted or
  duplicate keys and trailing bytes. An entry's `id = SHA-256("youcoded-mesh/v1/entry\0" ‖
  canonical(fields except id and signature))` and `signature = Ed25519("youcoded-mesh/v1/entry-sig\0" ‖ id)`;
  `witness` and `cutoff` use the same rule. The CBOR layer is id-critical and gets the same
  pinning tests as the crypto.
- **Roster.** A signed append-only log of `add`, `remove`, `rename`. Entries name the
  entries they have seen, so order never depends on clocks. The relay holds only hashed
  ids and public keys; names are sealed.
  - Devices exchange roster heads first and bring each other up to date before serving
    anything.
  - An entry from a signer not yet known is parked, never refused.
  - A removal voids what the removed device signs or sends beyond the cut-off, including
    roster entries, so it cannot add or remove devices afterwards. The cut-off is the
    furthest point any remaining device held when it learned of the removal (each signs a
    `witness`), so work another device already built on stays valid.
    - **The cut-off cannot be gamed by a delaying relay** (Phase 0: threat model R-2): removal
      notices go on every path at once (mailbox, direct, live lane); a device that has heard of
      the removal from any peer never witnesses later arrivals; a witness covers only entries
      the witness had received BEFORE it first saw the removal, proven by a receive record,
      not by claim; no entry from a removed device that changes host, deletes or edits the
      roster is honoured past the removal entry's own position (only plain lines and
      summaries may be extended by a witness); a device whose roster head is older than 24
      hours with no peer confirmation shows "may be out of date" and refuses peer calls that
      delete, create sessions or change the roster. A forged `seen` list from a removed
      device is void (threat model R-1).
    - The cut-off is a deterministic function of the roster log (maximum over witnesses
      present in the log at a stated point), and a witness is itself a signed entry with `seen`,
      taken at the instant the device first holds the removal, so it is cut off like any other
      entry of its signer. `cutoff` and `witness` carry `backed`: the host entries whose head
      lines the signer holds, because a line count on one chain says nothing about another
      chain. A removed device's host entry counts only if a remaining device backs it,
      otherwise it is void for hosting (Phase 0: T5 G8; T12 F7). "Void" is not permanent for
      the user: it means hidden and kept, and the removed device's unsent work is offered back
      as versions when it is paired again (Phase 0: data-loss INV-11, K-1).
    - After removal another device can look "unknown" until it reconnects (a newer device the
      remover had not heard of): it is shown as "checking", not gone (Phase 0: T12 F7e); this
      is visible and goes to Destin (round-15 C-13).
  - **Two removals at once: OPEN, three positions** (Phase 0: T5 G6 vs T12 F8 vs threat model
    R-3). Design as first written: "Removals from two devices at once both stand. Two devices
    removing each other: the one in the set longer stands, whichever removal reached a keeper
    first." Findings: (a) T5 G6: "longer" has no clock-free definition and a device can inflate
    any count it controls; define it as the causal depth of the device's own `add` entry, ties
    by lowest entry id. (b) T12 F8: the sentences contradict each other; replay removals in
    one fixed order by (tenure of the signer, entry id), each accepted removal final; a
    device you did not mean to remove can vanish until re-added. (c) Threat model R-3: never
    resolve by age; both removals stand, both devices become removed, a third device stands,
    and with exactly two devices the set splits into two sets of one that can be re-paired;
    optionally with three or more devices a removal needs a second device's confirmation.
    Positions (b) and (c) can both lose a legitimately removed device; (a) lets a thief of the
    oldest device win. This is visible, so it goes to Destin (round-15 P-10). Not decided here.
  - A void entry loses only its own effect; entries that had seen it remain valid.
  - A device refuses a removed device as soon as it holds the removal.
  - Two generations made at once: the remaining device with the lowest id makes one more.
  - A removed device paired again gets a fresh `add`, which stands.
- **Reinstalling.** If the app's data survives, the device keeps its keys and therefore its
  id; pairing again from it replaces the old entry for that id (it is the same keys, so no
  machine id is involved; Phase 0: T5 C2). Threat model R-8 asked for an existing-device
  confirmation and unlock even then and for the old keys to be revoked as of the new `add`;
  with key-derived ids, "same keys" is proof of possession, so R-8's worry (someone claiming
  a slot by learning a machine id) does not arise, but a re-pair with NEW keys for a known
  machine name is shown as "this looks like Laptop reinstalled" and needs the usual
  confirmation. If the data was wiped (always, after an Android uninstall) it is a new
  device and a new incarnation: acknowledgements from the old entry stop counting at once and
  other devices mark the old entry "wiped" within one round trip of the new device's `hello`,
  not after 30 days (Phase 0: data-loss D-12, INV-13). The old entry goes by removal or the
  30-day offer, after which its chats can be continued elsewhere. On first run after a
  reinstall the app asks "restore from your other devices or cloud backup?" (a screen, so
  it needs a deck).
- **Unseen for 30 days.** Each device notes when it last heard each other device; at 30
  days the others show the one-time offer, but only on a device whose own clock agrees with
  the relay's within an hour (Phase 0: threat model R-10). Removal is never automatic.
- **Unlock** for adding and removing (Phase 0: T11 findings 4-17, none run here): Android
  `BiometricPrompt` with `BIOMETRIC_STRONG | DEVICE_CREDENTIAL` (the phone's screen lock as
  fallback); on Android 10 and older (minSdk is 28) the older screen-lock confirmation, which
  needs `KeyguardManager.isDeviceSecure()`; neither is used anywhere in the app today and
  `androidx.biometric` is not a dependency, and the Node backend must ask the Kotlin app
  through a new host call, as `keepAwake` does. macOS: Electron's `promptTouchID` is
  fingerprint or Apple Watch only with NO password fallback, so a Mac without Touch ID gets
  nothing; the password version needs a small native add-on or helper built on a Mac. Windows:
  Windows Hello through `IUserConsentVerifierInterop` (needs a small native add-on built in
  CI; `koffi` is not a good fit); no-Hello fallback `CredUIPromptForWindowsCredential`.
  Linux: a CUSTOM polkit action cannot work without a root-installed `.policy` file (proved:
  `pkcheck` returns "not registered"); deb/rpm/pacman could ship one, an AppImage cannot; the
  built-in `org.freedesktop.policykit.exec` action (`pkexec`) needs no install, shows the
  system's own generic window and asks for an ADMINISTRATOR account. The unlock is a gate for
  people, not for programs: software running as the user can use the keys without it
  (Phase 0: T5 G11). So the admin key that authorises roster entries should be separate from
  the frame-signing key and stored where the platform can require user presence, where it can
  (threat model P-10). What a computer with no unlock does is O4, now narrowed to three
  choices (section 13, O4; round-15 P-5). Windows, macOS and the Android prompts are UNPROVEN: only Linux
  is available for testing.
- **Library.** An audited one; no home-made cipher (Phase 0: T5). Node's `crypto` supplies
  Ed25519, X25519, HKDF-SHA256, HMAC and ChaCha20-Poly1305. The typed code uses CPace
  (`CPACE-X25519-SHA512`, draft-irtf-cfrg-cpace-21), about 90 lines of our own glue over
  `@noble/curves` (audited by Trail of Bits, Cure53 and Kudelski per its README; our glue is
  not), pinned to an exact version, proved against the draft's published test vectors
  including the 12 low-order-point cases (34 checks pass), with `cpace-ts` as an independent
  cross-check in tests only. No maintained, audited, ready-made PAKE exists for JavaScript;
  OPAQUE and SPAKE2 packages were rejected (wrong shape or unmaintained). Sealing a secret to
  a device uses HPKE built from Node primitives. These layers (CPace glue, HPKE glue, CBOR)
  are in scope for the pre-Phase-7 outside review. `@noble/curves` 2.x is ES-module-only:
  the desktop main process compiles to CommonJS and must `require()` it (supported from Node
  22.12); Electron 44's Node was not checked, so Phase 1 proves it with one test in the real
  main process. Both noble packages become new production dependencies (40 KB minified for
  the whole pairing stack, 2.3 MB if the packages are copied whole: say which way "under 1
  MB" is measured). If noble renames its Elligator2 export, switch to our reference function
  (tested). Proved on LINUX only; Windows, macOS and Android runs are UNPROVEN (they need
  only the packaging check). 6 ms of CPU per pairing here; the phone figure "under 3 s" is a
  prediction, not a measurement.
- **Duplicates** are recognised by `(sender, session, counter)`; `session` is 16 random bytes
  per process start and the sender never saves it or the counter (see Nonces above).
  Receivers keep what they have seen per `(sender, session)` for as long as the sender is on
  the roster plus 30 days. Parked roster entries from unknown signers are bounded per sender
  (for example 8 MB and 30 days) and accepted only if sealed under a generation this device
  holds (Phase 0: T5 C4; threat model L-3, R-7).
- **No frame body is ever logged.** Pairing codes and any key material are never passed to
  any logger (a lint rule bans logger calls in the identity and pairing modules); a canary
  test greps every log, crash report, diagnostics export and bug-report payload (Phase 0:
  threat model D-1).

**Pairing.**

- **One protocol for the QR and the typed code** (Phase 0: T5 findings 7-12). Both run CPace
  with the secret as the password. The QR carries the meeting point, the existing device's
  key fingerprint (`SHA-256("youcoded-mesh/v1/fingerprint\0" ‖ signKey ‖ agreeKey)`, all 32
  bytes, checked by the new device) and a 128-bit one-time secret. The typed code is a
  relay-chosen random meeting point of at least 4 characters plus a **6-character secret**
  from a 32-letter alphabet without look-alikes (for example `K7QD-4MXW9R`), valid 5 minutes,
  3 tries: a stranger on the pipe guesses it with chance about 1 in 358 million per code (8
  digits would be 1 in 33 million). The exact format is visible and goes to Destin (round-15
  P-1). The meeting point is a random value the relay hands out, in a separate namespace from
  rooms, never derived from the secret (otherwise the relay could test guesses against the
  room name; threat model P-3).
- **Order:** the new device proves it knows the key first; the existing device checks it
  (this is where a guess is counted, BEFORE evaluating, so 50 simultaneous connections still
  evaluate only 3); the existing device proves itself; only then does the new device send
  its name and keys, sealed under the session key; only then does "Add this device?" appear
  (asserted in the prototype: `pake1 -> confirm-ok -> prompt -> welcome-sent`). A successful
  pairing also spends the code. A connection that never completes the first round counts
  nothing against the code and is rate-limited per address instead. Failed attempts are
  counted on the existing device (and survive a restart), not by the relay; the code burns
  after three. The relay is only a pipe here and is assumed hostile; in the test a pipe saw
  none of the name, code or set secret, forged or replayed messages were ignored, and a
  man in the middle cost 1 failure and revealed nothing.
- The existing device sends the set secret (sealed to the new device inside the session-key
  layer) and the roster only after "yes"; a test asserts no frame sealed under the set
  secret leaves before the confirmation (Phase 0: threat model P-8).
- **A matching number on both screens** (Phase 0: T5 G15; threat model P-4): both devices
  show the same short number derived from the session key and the user confirms they match,
  so someone who read a typed code over a shoulder cannot get a device added. It is a
  visible extra step: PROPOSED, not in section 2, goes to Destin (round-15 P-2). A second
  party connecting to a meeting point that already authenticated a joiner cancels with
  "Someone else tried to use this code". The "Add this device?" prompt shows platform and a
  short key fingerprint with the name; names from peers are length-capped (40) and stripped
  of control and bidi characters (threat model P-4, P-5). "Code expired" can be an attack and
  the screen says so (T5 G14).
- Pairing starts only from the in-app scanner or the typed code on the Devices screen: no
  `youcoded://` link, clipboard watcher or notification action may start or complete it;
  the listener refuses any request carrying an `Origin` header and allows one session at a
  time; a meeting point carries at most 64 KiB (threat model P-6, P-9, P-12).
- The meeting point is on the relay, or on the local network once same-wifi exists. It
  stores nothing and is separate from using the relay as a keeper.
- **Joining two sets.** The pairing device joins the other set in the ordinary way. It
  then signs an `add` for each of its former companions (it holds their public keys) and
  leaves each a sealed message, in the old set's mailbox and directly when they meet: "we
  have joined this set; here is its secret and roster". A companion that was off moves
  over when it next comes on. Data combines by the usual rules. The old set's relay room
  empties as its devices move and is erased by the 90-day rule. **Phase 0 (threat model
  P-7, rated Critical) says one side's tap must never merge two sets:** it needs unlock and
  an explicit confirmation on BOTH sides, each screen listing every device of both sets with
  name, platform and fingerprint; an absent companion is asked on its next start ("Your
  devices joined another set that includes: ...") and may refuse, staying in the old set with
  a fresh roster. Section 2.4 only says "the screen names every device that will end up
  together": this is stricter and goes to Destin (round-15 P-12). The old set's mailbox keeps
  the joining message at least 400 days and never less than the old room's life; a stranded
  companion shows in the new set as "has not joined yet" (data-loss D-11 seq. 4, INV-12c).
- **Leaving.** A device can remove itself. An empty roster is erased by the relay after a
  delay.

### 5.2 Link layer and presence

Three paths, tried in this order: same-wifi direct; super-host; relay. A frame is
byte-identical on all three. One connection per path per device.

- **Same-wifi direct.** Devices announce themselves on the local network and connect
  straight to each other. The announcement reveals only presence. A peer is checked
  against the roster before any frame is accepted or served. No local discovery exists in
  the app today; Android needs a multicast lock (T6). A device takes its peer addresses from
  a config input (a file in userData or an environment variable) when present, instead of
  discovery, so the test rig can substitute cuttable proxies; that is the only app-side
  requirement of the rig (Phase 0: T1 3.9). The announcement carries only a rotating token
  `HMAC(set secret, 15-minute slot)` and a generic service name, never a device name, id, key
  hash or version; identity is proven only by a mutually authenticated handshake before any
  application byte is parsed (one fixed-size pre-auth message, 5 s deadline, per-address and
  global limits, fuzzed); the listener rejects any `Origin` header and plain HTTP, binds only
  to private-range interfaces, and discovery has an off setting (Phase 0: threat model W-1 to
  W-5, W-8; these are the starting list for the dedicated review).
- **Presence.** A device is "on" for another when a heartbeat arrived recently on any path.
  Offline means 30 seconds with no heartbeat and a failed reconnect on every path (tuned
  by V3). The 30-second rule needs a numbered beat about every 10 seconds from a device only
  while it is being watched or is hosting; idle devices every 30 to 60 seconds. The relay
  cannot tell a silently dead socket from a quiet one (the free automatic ping never wakes
  it), so presence cannot rely on the relay noticing; whether Cloudflare closes dead sockets
  promptly is UNVERIFIED (Phase 0: T7 5.2 change, finding 11). The rig must be able to shrink
  the 30 seconds to a setting read from one place (Phase 0: T1 3.9). If the
  host reappears before the user answers a notice, the notice is withdrawn.
- **A phone is "on" only while the app is in front, or it is hosting a running reply, or
  the battery exemption is enabled.** Android cuts a backgrounded app's network and there
  is no push channel (T18).
- **Clocks.** The relay's clock times its 30-day rule. Control entries are ordered by what
  they have seen. ~~Correctness never depends on comparing two devices' clocks; only two
  display matters do.~~ Narrowed (Phase 0: data-loss D-16, K-4, INV-17; threat model X-5):
  `decide` never reads a clock (scrambling every `at` never changed an output in 20,000
  runs), but a tie broken by "lower id" depends on the clock text through the id and that is
  fine, so nobody "fixes" it (T12 F14). **Every irreversible clock-driven removal** (Recently
  deleted bodies, tails, old segments, "recent" eviction, the unseen-30-days offer) **needs
  two agreeing time sources** (the device's clock and a relay or peer attested date sent at
  connect and in `hello`) **and a count of days the app actually ran**. If the clocks
  disagree by more than 1 hour, or a launch jumps more than a day, ALL these timers pause
  and a notice says "This device's clock looks wrong". Entry `at` values are display-only;
  "recent" uses the device's own first-seen time of the last line, not `lastLineAt`; the
  30-day timers are never trusted to one device's clock. T12 requires "identical delete
  dates everywhere" although the rule uses first-seen time, which is local: what T12 compares
  must be restated before Phase 5 (data-loss K-4; OPEN, engineering). A clock jump of a year and a
  month in each direction must remove no body early (test LT-14).

### 5.3 Chat store and copying

**Which chats.** Every transcript the app tracks today: Claude Code files under
`~/.claude/projects` (including ones started in a terminal) and native files under
`~/.youcoded/sessions`.

- **A chat the app does not run** (started in a terminal) is listed and copied, but the app
  cannot stop its process. It can be taken over only when its host is offline. Whatever
  its process finishes after a takeover becomes a second version. If it is reopened from a
  terminal on a device that no longer hosts it, the app's hooks tell that session "this
  chat is now hosted on Phone". That hook is advice, not enforcement (a user may ignore it),
  so work done anyway is not allowed to vanish: see INV-7 and INV-8 in 5.4 (Phase 0:
  data-loss D-7). A terminal-only chat is indexed when first seen and the adapter keeps
  watching, because Claude Code deletes files by age (`cleanupPeriodDays`, default 30, by
  file modification time, at its own start) and could delete one before a one-time first-run
  index reached it; the start-up check warns when `cleanupPeriodDays` is shorter than 30 on a
  device that is the only holder of lines (Phase 0: data-loss D-15, INV-16; T3 F10). The
  app seeds 365 only when the key is absent.
- **A chat that ran in a folder that is not a synced project** can only be talk-only
  elsewhere, AND the device that holds the folder offers to make it a synced project. Answered
  by Destin 2026-11-14, round 14 Q-1 ("talk-only-plus-offer") (O16 answered; Phase 0).
- **A chat with no real folder** ("No folder" sessions, card #213) has no project slug: the
  store and the project-files rows must handle it. **A chat running a local model** cannot
  be taken over on a device without that model: the chip and takeover need a "model not
  available here" case (Phase 0: S3 4.5, 4.6).

**Identity.**

- `chat id = provider + ":" + the runtime's session id`. `--resume` keeps the id and file.
  `/clear` in Claude Code starts a new id: a new chat.
- A chat has one or more versions. The main version's id is the chat id. Other ids are
  computed the same on every device: `SHA-256(chat id ‖ winning host entry ‖ losing host
  entry)` for an accidental split; `SHA-256(chat id ‖ takeover id ‖ "tail")` for finished
  replies found in a tail; `SHA-256(chat id ‖ fork entry id)` for a deliberate fork.
- A version stores its own lines from the split point and reads earlier ones from its
  parent, EXCEPT after Claude Code's fork-on-resume, which rewrites every earlier line (new
  `sessionId`, `cwd` rewritten to the current folder, new `promptId`, bookkeeping lines
  de-duplicated, 0 of 77 lines byte-identical): a forked version stores ALL its lines;
  lines keep their uuids (Phase 0: T3 F3). A chat is keyed by chat id, never by path
  (slug repair moves and replaces files; Phase 0: T2 finding 6).
- **Version ids are not stable as first written** (Phase 0: T12 F6): ids come from the
  winning and losing host entries, so a third concurrent entry or a takeover changes them
  (1,504 of 20,000 fuzz runs even with every other fix on), and the chain's first value used
  the version id, so every chain hash would change. Adopted for the store: the first chain
  value never uses a version id. The rest (the store keys lines by chain, `decide` returns
  the host entries that define each version and an alias list so an id change is a rename)
  belongs to the decide rules and is PENDING (T12b decide rules).
- When a non-main version is first hosted, the runtime gives it a session id of its own
  (Claude Code's fork-on-resume); a `bound` entry records it.
- Each version is its own list row, grouped with its relatives. Deleting one version does
  not delete another.

**The store** lives under the app's data folder, never in a synced space. Per version:

> RESOLVED 2026-11-14 (segments-decision): **no segments are built.** T2 and T21 were both
> right about what they measured. Every apparent rewrite in T21 was something else: a
> one-off hand image repair (2 native chats), the old sync swapping in a different file
> (5b7f12b0), one chat id filed in two project folders (26d919ff), and two computers writing
> at once (301cfe19). No runtime rewrote a line. Report:
> `docs/active/investigations/2026-11-14-mesh-phase0/segments-decision.md`.

- Lines are one append-only run per version, chained from line one. If a host's adapter
  reports that its runtime rewrote, shrank, replaced or deleted its file, copying of that
  version stops at its last good head (which stays as it was, everywhere), a diagnostic is
  recorded, and the new content is stored as a **new version whose parent is the old one
  from line zero**. Nothing is retained for 30 days and nothing is deleted: the old version
  keeps all its copies (this satisfies data-loss D-9 and INV-10 without segment storage).
  The user sees the existing "two versions" display. The `segment` argument stays in S2 and
  on the wire but is always 0, so a later format can add segments without a wire change
  (Phase 0: segments-decision 4, 5; T2).
- **The mesh never replaces or rewrites a chat file a runtime has open or may append to**;
  it only appends through the adapter while it is the host, and writes whole files only for
  chats no runtime on this device holds (Phase 0: segments-decision 5; this is what the old
  size-only sync did to 5b7f12b0).
- **A hash chain** per segment: `h[0] = SHA-256(chat id ‖ segment)` (not the version id;
  Phase 0: T12 F6), `h[n] = SHA-256(h[n-1] as 32 raw bytes ‖ raw bytes of line n)`,
  `uint32be` for the segment (the encodings of `‖` are pinned by the T1 inventory tool and
  must become the Phase 2 spec; Phase 0: T1 finding 30). Chain values are kept even when a
  line's bytes are evicted.
  - **Only newline-terminated lines are hashed and copied.** A line is the bytes through
    0x0a; an unterminated final line is not a line yet (2 of 410 native mirror files were
    torn copies; Phase 0: T21 finding 7).
  - **Split on the byte 0x0a only**, never on U+2028 or U+2029 (Node's `readline` cuts
    there and Claude Code writes them raw inside JSON strings), and **copy bytes, never
    re-serialise** (20 malformed lines in 2 real chats; the app silently skips them) (Phase
    0: T2 finding 5, 8).
  - **A second chain over conversation lines only** (the conversation chain): `c[n] =
    SHA-256(c[n-1] ‖ raw bytes)` over only the lines whose type is `user` or `assistant`
    (native: its own list of message, tool and turn-complete types, to be fixed from the
    native writer's source; not yet derived). The raw chain is for copying and damage
    checks; `decide` and the first-run combine compare conversation chains. Bookkeeping
    lines (`last-prompt`, `cost-state`, `ai-title`, `mode`, `permission-mode`,
    `session-owner`, `atis-latch`, `tools-used`, `file-history-*`, `queue-operation`,
    `api-request*`, `pr-link`, `bridge-session`) never make two copies "differ". With the
    allow-list 22 of 22 disk and 22 of 22 history bookkeeping-tail pairs become identical or
    prefix and 28 of 28 real splits stay diverged (a deny-list missed `bridge-session`: use
    the allow-list). Heads carry both chain values (Phase 0: T21 finding 6A, 4.1, 4.2).
- **An index of reply ends**, from the rule in S1, not from the app's `turn-complete`
  (Phase 0: T2 finding 17; T3 F8). Claude Code writes one line per content block and EACH
  carries the message's final `stop_reason`: 31,685 lines carry a non-`tool_use` reason but
  belong to only 21,238 messages, so a cut after the first line (usually a thinking block)
  would leave the answer text on the old host. A line is a reply end only when a later line
  shows its message is complete (a different `message.id`, any user line, or the `system`
  `turn_duration` line; `turn_duration` is written only by interactive sessions and is not
  usable alone); the confirmed end may name an EARLIER line than the one just read; this
  is the "one-line-lookahead tracker" (`replyEndStepCC`: 21,832 confirmed ends over 1,360
  chats; bookkeeping lines neither confirm nor cancel). Native: a persisted `turn-complete`
  or `user-interrupt` line, immediately (`session-error` is never written). User interrupts
  (359 lines, all with a `promptId`) are reply ends. Whether an API-error line counts as a
  finished reply is a product question (224 of 1,364 chats): round-15 C-2; proposed no.
  Queue and background-result lines (`queue-operation`, `queued_command`) are bookkeeping.
  About 1 in 10 native chats and 3% of Claude Code chats end mid-reply (a takeover offered
  on them goes back to the last confirmed reply end). Classification fails toward keeping:
  a tail is "unfinished" only for a recognised mid-reply state, anything else is finished
  (Phase 0: data-loss D-4, INV-5).
- The head (both chain values), the control log, the latest summary, and a manifest of
  extras. T12 proposes that each line also records which host entry it arrived under; that
  belongs to the decide rules and is PENDING (T12b decide rules) (Phase 0: T12 F5, F15).

**Copying.**

- The host sends each new line as written, to every online device and the keeper.
- Control logs are exchanged before lines, always. Lines for a deleted chat are neither
  requested nor accepted.
- A device asks any peer or the keeper: "version V, segment S: I have N lines ending in
  hash H". Answers: the lines after N; `gap` (I lack the lines just after N); `moved` (a
  newer segment exists; here is its entry; only if segments are kept, PENDING
  (segments-decision)); or `not-a-prefix`, with the answerer's hash at N. Any device can
  answer **but lines are accepted only with the host's signature** (Phase 0: threat model C-1,
  Critical): the chain is unkeyed, so a third device could otherwise serve fabricated lines
  that connect, and a resumed chat treats a forged "user" line as the user's own earlier
  instruction. Durable `lines` are accepted for a version only if covered by a **head
  signature `(version, segment, lines, hash)` from the device that was host for that range**;
  relaying devices forward signed heads unchanged; a store never advances its head past what
  a valid host signature covers; after a takeover the new host signs from its takeover
  point. A `not-a-prefix` answer without a valid host head signature is ignored (C-8).
  **Chat lines are therefore keyed/host-signed so that a paired non-host device cannot forge
  them.** Line and frame maxima apply (for example 64 MB per line, 16 MB per frame; a line
  over the limit is stored raw and flagged, never parsed whole; threat model C-4).
- Lines join the chain only when they connect to it; lines with a hole before them are
  parked. A device acknowledges only "everything through line N, without holes".
- When two devices meet they exchange a table of heads for every chat.
- **`not-a-prefix` is never settled by guessing.** The device re-hashes its own bytes; if
  they no longer match its chain, the copy is damaged: set aside and recopied. Otherwise
  the control log decides: an old host's tail, or a second version. If the log explains
  nothing, a non-host sets its copy aside, recopies from the host, and records a
  diagnostic. **Every set-aside copy follows one retention rule** (Phase 0: data-loss D-8,
  INV-9, K-2; applies to damaged copies, `not-a-prefix` copies, tails, old segments and void
  lines): kept until (a) an anchor device has the same lines or a longer chain containing
  them, AND (b) the user can see them in "Check sync", AND (c) at least 90 days have passed on
  trusted time (5.2); never deleted while they contain a reply end the live chain lacks; lines
  unique to a set-aside copy that form a complete reply are offered as a version. The device
  records a diagnostic; "the host" for the recopy must be a device whose host entry is
  resolved, not `pending`.
- A device acknowledges, and the store acknowledges, only after the write is fsynced; on
  `ENOSPC` it refuses to acknowledge and the host shows "Out of space. New messages may not be
  saved" instead of dropping lines (Phase 0: data-loss D-17, INV-18).
- Order: control logs and summaries; lines, most recently used first; extras last.
- **The read side serves five shapes** for the 12 files that read through the store (Phase
  0: T20 4): pages by LINE NUMBER, not byte offset; the Resume list's title, model and counts;
  a chat's folder; search turns; and helper-file history. The chat-search index is fed from
  lines as they arrive so an evicted body is not needed later, and the Resume list and
  search need something that replaces the conversation record as their list of chats: the
  roster plus the per-chat summary (6.5).
- **Import validation** (Phase 0: threat model C-2, C-5, H-3): every destination path is
  computed on the receiving host from validated ids (a session id must match the UUID or
  ULID pattern; extras kinds are fixed; never a peer-supplied path), created with exclusive
  create, no symlink following (`O_NOFOLLOW`; reject any existing symlink in the chain), and
  never overwrites a file whose content does not match the previous store content. A plan
  name taken from line text is reduced to `[a-z0-9-]{1,60}` and prefixed with a hash. Peer
  strings (titles, project names, device names) are rendered as text, never HTML, length
  capped, stripped of control and bidi characters. The one-time GitHub restore uses the same
  validators.
- Finished extras (saved outputs, the plan) move by content hash. Helper working files
  grow, so they are copied like lines ("everything after byte N") and sent when a reply
  ends. Extras that belong only to a set-aside tail are set aside with it.

**Extras, by location** (measured on Claude Code 2.1.325, Linux; Phase 0: T3 F6, T20 3.6):

| Extra | Claude Code chat | Native chat |
|---|---|---|
| Helper working files | `<slugdir>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json`; a helper can be followed up after a move (T3 F7) | Child session files with `parentSessionId` |
| Saved long outputs | `<slugdir>/<sessionId>/tool-results/<8-char id>.txt`; referenced by ABSOLUTE path in the chat lines (`persistedOutputPath`, "Full output saved to: ...") | `specialist-reports/`; Bash overflow is in the temp folder today and must move somewhere durable |
| Plan | `~/.claude/plans/<slug>.md`; `plan_mode.planFilePath` in the lines is absolute; the plan text is also the chat's `Write` tool input | In the chat's lines |
| To-do list | **`~/.claude/tasks/<sessionId>/<n>.json` plus `.lock`, `.highwatermark`**, keyed by session id (29 such folders in Destin's data). `~/.claude/todos/` does NOT exist; `TodoWrite` appears in 0 real transcripts. Listing them in print mode was not possible: UNVERIFIED either way | In memory only today |
| Workflow files | `<slugdir>/<sessionId>/workflows/` (10 folders in real data; not produced in the tests: UNVERIFIED) | — |
| Native sidecars | — | `<id>.shells.json` (background commands the chat started) and `<id>.delegations.json` (helper bookkeeping), written beside the chat file; added to this table (Phase 0: T20 rows 28, 29). A new host cannot have those processes, so recorded shells read as ended, not "maybe still running": PROPOSED, to confirm in a Phase 5 test, OPEN with the builder (O19) |
| Not required for resume | `file-history/<sessionId>/` (rewind snapshots; resume worked without them in print mode, interactive rewind UNVERIFIED); `session-env/<sessionId>/` (empty) | Native `private-continuation/` (deliberately private; a new host falls back to a full rebuild, to be confirmed in a test; T20 row 27) |
| Outside the store | Claude Code's per-project `memory/` folder (read by `project-context.ts`; not a chat) | — |

**Paths in extras.** Absolute paths in the chat lines cannot be rewritten (the hash chain).
On a device with a different home or slug the model's first read fails (it recovered by
luck in T3) and a missing plan file is not recreated. So `becomeHost` also (a) places the
plan file at `~/.claude/plans/<slug>.md`, regenerating it from the chat's `Write` line if it
was not copied, (b) places each saved output under the new device's `tool-results/` and
sends the assistant ONE note, as hook context, "Earlier saved outputs and plans from this
chat are now under <new path>" (Phase 0: T3 4.4). Tasks and shell sidecars are copied as
extras by session id (T3 F6, T20).

### 5.4 Control log and host control

The control log is a set of signed entries per chat (shapes in 6.2). Each entry lists the
entries its author had seen, so the log's meaning never depends on arrival order or clocks.

**`decide(entries, roster)`**: pure; the same answer for the same entries in any order;
answers per version.

> PENDING (T12b decide rules): the rules below were executed and fuzzed in T12 / T13
> (`decide.mjs`, 20,000 random runs, a 4,374-case grid for late lines from the old host) and
> **fail as written**; a separate agent is settling the replacement rules, so the bullets
> below are NOT rewritten here. Known problems, from `T12-T13-decide.md`: (F1) "later = had
> seen" lets a later takeover erase a split (host candidates should be the lineage tips,
> making `parent` load-bearing); (F2) "a prefix means one chat" is not transitive (882 of
> 20,000 runs contradict themselves with three concurrent claims); (F3) a host entry that
> stops hosting for any reason other than "was the parent of a takeover" owes a `released`
> nobody is told to write, so its finished replies are lost (4,114 of 20,000 runs; 1,323 of
> 4,374 grid cases): every device whose latest host entry is off the winning lineage must
> append `released`; (F4) `released` needs an `owner` field; (F5) "set aside under the
> takeover's id" breaks while a takeover is `pending`, when it loses, and for lines that are not
> the previous host's; (F6) version ids are not stable; (F7) cut-off and `witness` need
> `backed` and `seen` (see 5.1); (F8) the two removal sentences contradict (see 5.1, OPEN);
> (F10) `pending` has no way out for the user and a takeover of a takeover while pending
> re-opens the question (a shortcut of naming every candidate as `parent` is UNSAFE, 3 of
> 1,000 runs lost a reply); (F11) `restored` must undo every `deleted` in its own causal
> past; (F12) a delete concurrent with a second version the deleter never saw leaves the
> second version live; (F13) concurrent `format` entries should take the highest value
> (the lower-id rule lets the older minimum win half the time); (F14) a "lower id" tie depends
> on the clock text through the id and that is fine. T21 adds: copies are compared by the
> conversation chain, and a copy whose extra lines are all bookkeeping counts as a prefix. With
> T12's fixes 3 of 20,000 runs still lose a reply (F9, unexplained). Visible consequences that
> need Destin are in round-15 C-9 to C-12. Until the replacement lands, a builder must not
> implement the bullets below as written.

- **Order.** An entry that had seen another is later. Otherwise they are concurrent.
- **Void.** Entries from a removed device beyond the cut-off.
- **Host.** Follow the host entries (`claim`, `takeover`); the latest hosts. If that
  device is removed, the version has no host and any device may take over.
- **Concurrent host entries.** A device holding the longer copy checks whether the other's
  stated head lies on its chain and appends a `relation` entry. Until then the answer is
  `pending`: the chat shows its last known host, a message typed there goes to that host
  if reachable, and no notice is raised.
  - One copy is a prefix of the other: one chat; the author of the longer copy hosts.
  - Identical copies: a `claim` marked as last run on its device hosts; otherwise the
    lower entry id. In both cases the other entry is void and its author is a watcher.
  - The copies differ: two versions; the lower entry id keeps the chat id.
- **Name, flags, talk-only, minimum app version, segment:** the latest entry of that kind;
  concurrent ones, the lower entry id.
- **Deleted** is per version. `restored` names the `deleted` it undoes; a concurrent
  delete and restore resolve to deleted.

**Reserving the host role.** Each version has a host register on the keeper holding the
latest host entry. A device taking over checks the register holds the parent it knows and
swaps in its own entry. Success: it publishes. Failure: it publishes nothing and shows "…
just took over this chat". If the register is behind (an earlier takeover happened
offline), the device first puts in the missing entries. With no keeper but peers in reach,
the lowest-id online device plays the register. With nothing in reach the device publishes
directly. This is what delivers "first to be heard wins"; `decide` gives the same answer
whatever a register said.

**Takeover reasons.** `chip` (tapped while the host was on); `host-offline` (the host
unreachable, something else reachable); `host-removed`; `no-connection` (nothing
reachable). A takeover
made with "Continue from here as a new version" carries `knowing: true`, and any second
version it leads to is a deliberate fork.

**The takeover point and the tail.** A takeover names the segment, line count and chain
hash of the last reply end in the taking device's store. First it fetches durable lines up
to the highest line its live lane mentioned, if anything has them. Lines the previous host
wrote beyond the point are its tail, set aside on every device under the takeover's id
until the previous host appends `released {tail line count, tail hash, last reply end in
the tail}`.

| The tail holds | Result on every device | The user sees |
|---|---|---|
| Nothing (chip switch) | No tail | The divider |
| Only an unfinished reply | Set aside 30 days, then removed | "…unfinished reply … was discarded" on the old host |
| One or more finished replies | They become a second version | "Two versions" on both |
| Unknown (old host has not spoken) | Set aside, waiting | Nothing |

- When it learns of the takeover, the previous host stops the chat's process, then
  appends `released`.
- Lines in the tail after its last reply end are an unfinished reply and stay set aside.
- A tail holding a finished reply is never thrown away.
- A device holding fewer tail lines than `released` names fetches the rest; one holding
  more or different lines refetches.
- If the previous host is removed without speaking, the remover appends `released` on its
  behalf. If it never returns and is never removed, its tail stays set aside; the 30-day
  offer is what ends that.
- Tails of a deleted version are removed with it.
- **Retention of tails** (Phase 0: data-loss D-4, INV-5, K-5, K-6): removal of a tail
  requires that the device that wrote it has acknowledged the `released` naming it, or 90
  days have passed on trusted time (5.2); the writer of a tail never deletes its own original
  until all roster devices have it or its owner chooses; a tail whose last line is not a
  positively recognised mid-reply state is classified FINISHED (fail toward keeping). This
  replaces "set aside 30 days, then removed" in the table above and reconciles 2.7 ("the
  unfinished reply is dropped") with "a finished reply is never thrown away": both hold only
  if classification is complete, so it fails toward keeping. When the previous host is
  removed and only IT held the tail, the tail stays "unknown" and unreachable; the removal
  screen says so (5.1) and the lines stay on the removed device for a re-pair (INV-11).
  Test LT-3 enumerates every way each runtime ends a turn on the real transcripts and in the
  rig (interrupt, error, overload, kill -9 after the last text).
- A command already approved before a sleep can still finish after wake; it counts as written
  by the old host, and T12/T13 include such a write (Phase 0: T19 finding 4).

**Becoming host** (`becomeHost`): make sure lines to the takeover point and the extras are
in the store; replace the working file from the store, keeping any old one aside (for
Claude Code, `~/.claude/projects/<ccProjectSlug(local folder)>/<runtime id>.jsonl` plus
its extras; `resolve-local-project.ts` maps the chat to a local folder); resume. A crash
at any step is safe: the log still says this device hosts, and the steps run again.
Phase 0 additions:

- **Never overwrite terminal work on a non-host device** (data-loss D-6, D-7, INV-7, INV-8):
  before any working file is replaced or any `becomeHost` step, the adapter runs once over
  the file; lines not in the store (or `not-a-prefix`) are ingested as a tail or version on
  this device, never silently merged, and a notice says "Lines written here outside the app
  were kept as a separate version" (wording needs a deck, round-15 C-8). The old file is
  moved to `~/.youcoded/mesh/aside/<version>/<timestamp>/`, OUTSIDE `~/.claude/projects` (which
  Claude Code's age cleanup deletes from and which the app scans as chats), listed in "Check
  sync", and never deleted automatically. On a non-host device a watcher (size and mtime
  poll) ingests growth of a runtime file for a chat in the store as above. A kept-aside old
  copy must not end in `.jsonl` inside `~/.claude/projects` (a second file with the same id
  would make Claude Code's lookup ambiguous; untested).
- **Claude Code looks a chat up by id across ALL project folders** of the home folder, so the
  working file may sit in the local project's slug folder as designed, and resume works from
  any folder (T10 Linux half PASS) (Phase 0: T3 F2).
- **Check that Claude Code is signed in on this device BEFORE the first resume**: a resume
  without sign-in loads the chat, then appends a failed prompt and a synthetic error line to
  it (24 lines in the test). Set the placed file's modification time to the moment of
  placement (the age cleanup deletes by modification time; a copy keeping an old mtime would
  be deleted at the old age). A second device signs in with its own sign-in, or with a
  long-lived token from `claude setup-token` read from `CLAUDE_CODE_OAUTH_TOKEN`, which
  Destin chose for test devices on 2026-11-14 (round 14 Q-4, "token"); account mismatch is
  UNVERIFIED (T3 F12). The "sign in to Claude on this device first" step is visible and needs
  a deck.
- Two processes resuming one id interleave whole lines and fork the parent chain, and the
  late process writes after the early one: the old host's tail can hold lines whose
  `parentUuid` points at a line another process already extended; T13 includes one (T3 F11).
- A first-resume on a device failing at any step leaves the old file aside and the store
  intact; crash-resume repair (card #163) annotates tool calls "completion unknown, inspect
  state before retrying" and a takeover relies on the same path (Phase 0: S3 4.7).

**Chip switch while the host is on.** The old host waits for a running reply to end (the
tapping device shows it is waiting and can cancel), then fences the chat, on disk: it
refuses forwarded messages with "handed over". It replies with its last reply end; the
takeover names that point, so there is no tail.

**Talk-only.** The chat runs in a scratch folder under the app's data folder with
file-writing and command tools switched off (Claude Code's tool restrictions; the native
runtime's binding). A `talk-only on` entry is appended. Back on a device with the project
it resumes in the real folder and appends `talk-only off`. This needs Claude Code to
resume a chat in a different folder from the one it was written in (T3, T10): PROVED on
Linux (Phase 0: T3 F2, T10). The mechanism is **`--tools ""` plus a prompt-hook note**, not
flags alone: with `--disallowedTools` the model still tried `Glob` and `Read` of the old
path (refused); with `--tools ""` alone it tried `Edit` once and got "No such tool
available"; with `--tools ""` plus the hook note it made 0 attempts (one sample each).
`--tools ""` removes every built-in tool; MCP tools also need `--strict-mcp-config`
(untested), and a Read restricted to the scratch folder in interactive mode is UNVERIFIED
(Phase 0: T3 F4).

**The divider and the notes to the assistant.** The renderer draws the divider from the
takeover entry, reusing the model-switch marker (`MODEL_SWITCH_MARKER`,
`renderer/state/transcript-event-actions.ts:361`) with the takeover's id. The assistant is
told at the next message: native chats get a transcript event; Claude Code chats get the
note as hook context on the next prompt. ~~so nothing is written into Claude Code's file~~
**That is false** (Phase 0: T3 F5, 4.1): Claude Code records the note as a
`hook_additional_context` attachment line (plus a rendered system-reminder) in its own file,
so the note travels with the chat, is replayed on every later resume (verified in a folder
with no hook), and **is sent once** (sending it with every prompt would add a line each
time). The app does not draw that line (it reads `attachment` lines only for
`queued_command`; rendered UI UNVERIFIED).

**Summary.** The host appends a `summary` at creation and at most once per finished reply;
only the latest is kept. The chat list is drawn from summaries and `decide`.

**Names and flags.** `renamed` (the user's choice) beats the summary's title and replaces
`Personal/ConversationNames/`. Existing names and flags are converted at the switch. Tags
stay where they are. A `complete` flag reaching the host closes the chat there.

**Deleting.** A `deleted` entry, also held in a `del:` register on the keeper so that a
device returning after any length of time learns of it before sending anything; that
register is removed when the 30 days are up. The host stops any running reply, as if the
chat were closed. The deleting device tells the relay to drop the
version's waiting lines. Each device removes the body 30 days after the later of the
entry's time and the moment it first saw it, and keeps the entry. A device returning with
unsent lines for a deleted chat keeps them in its own Recently deleted and sends nothing.
Until the backup rebuild, a deleted chat stays in the GitHub backup's history.
Phase 0 additions (data-loss D-5, INV-6; threat model C-3):

- **Bulk-delete guard:** a bulk delete (more than 5 chats from one device within 10 minutes,
  or any delete of a chat used within 7 days) is held 24 hours on other devices behind an
  "Undo" notice ("Phone deleted 212 chats. Undo?") before the relay `drop` or any body
  removal begins. This changes 2.1's "deleting a chat deletes it everywhere" timing for
  such deletes, so it goes to Destin (round-15 C-6).
- Recently deleted is per device and never shorter than the longest hold any online
  keep-everything device chooses. `restored` brings back the late lines held in each
  device's own Recently deleted; when no peer has the body the chat shows "stored on
  <devices>, offline", not an empty chat. The `del:` register is kept until every roster
  device has acknowledged the `deleted` entry, or 400 days (it was removed after 30 days, so
  a device returning on day 31 could resurrect a deleted chat). Delete never touches runtime
  files or extras of other versions: it removes only what the mesh itself wrote (marked by a
  sidecar record), and the adapter ignores any runtime file of a version marked deleted so
  the chat does not reappear. Tests LT-4.
- The relay honours a signed `drop` only for a chat whose `deleted` entry it holds or a
  project the roster says is removed; otherwise it treats `drop` as a release (5.6).

### 5.5 Watching: session router and proxy

- In the main process a **session router** inspects each session-scoped call. A local chat
  goes to `SessionManager` or the native host. A chat hosted elsewhere goes to a **session
  proxy**, which forwards the call to the host and republishes the host's events for that
  chat on the same local channels. The renderer is unchanged apart from the chip and the
  capability limits.
- **On the host** forwarded calls are served by `serveRemoteChannel` with `door: 'remote'`
  and a new `peer` field. Each paired device gets an audience id in a new range. One new
  flag on channel entries, `peerAllowed`, says whether a paired device may call it. (A
  literal third door would touch about 25 handler sites; each must handle `peer` or fail
  closed; Phase 0: S3.)
- **The peer door is an allow-list and FAILS CLOSED** (Phase 0: threat model S-2, Critical).
  The first draft said "every session-scoped channel is `peerAllowed` or has a refusal",
  which is fail-open for any channel added later, and today's `serveRemoteChannel` is default
  allow. `peerAllowed` is an explicit allow-list kept in a test file; adding a channel to
  the table never makes it peer-callable; the parity test fails if a channel not on the list
  is reachable. Initial list: `session:claude-control` (`send-text`, `stop`), `permission:respond`
  (with the limits below), the `session:open` read path, reads inside the chat's own
  project, and a filtered `session:create`. Refused for peers: `settings:set`, `defaults:*`,
  `engine:set-config`, `skills:install*`, `permissions:remove*`, `session:set-flag`, file
  writes, plugin install, model and mode changes, `modes:set`. The 26 channels T9 marks "forward"
  are plainly forwardable; 29 need a design answer in five clusters (paths that assume one
  disk; reads of chat files, T20; renames, flags and tags, which become control-log entries
  not forwards; terminal input and resize from several watchers; a password and shell
  sessions that should never cross the mesh); 44 are not forwarded (Phase 0: T9 3.4).
- **`session:input` is never peer-callable** (threat model S-1, Critical): it is raw terminal
  input (Shift+Tab cycles permission mode toward bypass, `!` runs bash, `/permissions`),
  so a peer never calls it, nor `terminal-ready`, `resize` or any raw terminal channel. Peers
  type through `session:claude-control` `send-text` only (the typed-message path with a
  `sendId`), which rejects any control character except newline and tab inside peer text. A
  leading `!` or `/` from a peer is a product question (peers may send slash commands unless
  the host rules otherwise); whether `send-text` can reach `!` or slash commands is
  UNVERIFIED and S-1 requires a test. `session:resize` (two watchers would fight), and
  `native:submit-admin-password` are not forwarded.
- **`session:create` from a peer is rebuilt from a closed schema** (threat model S-3,
  Critical; the code's own comment says today's payload is unfiltered): `projectId`
  (resolved through the registry to a host-local, downloaded synced project), `provider` and
  `model` from the host's own allowed list, nothing else. NO `cwd`, NO `skipPermissions`
  (always the host's own default), `resumeSessionId` only as a chat version id that exists in
  the host's store, any unknown field refused, path traversal refused. It carries a
  host-issued one-time nonce.
- **No permission-mode cycling and no bash from a peer** (S-5): the permission mode is a
  host-local property that never travels with a chat and cannot be set, cycled or read-and-
  acted-on by a peer; a chat continued on another device starts in that device's own default
  mode and the notice says so. A peer's `permission:respond` accepts only "allow once" and
  "deny"; "always allow" and project-wide grants need the host's own window (S-4; visible,
  round-15 P-6). The prompt on the watcher shows the exact command or path in full, which
  device the chat runs on, and the host's own window shows "Approved from Phone"; request
  ids are at least 128 random bits and a peer may answer only for chats it has open (S-9).
  When the host is in bypass mode or has Bash allow-all, a peer's `send-text` is refused
  unless the host switched "Let my other devices type into this chat" on (S-6; visible,
  round-15 P-7). Remote approval of commands touching paths outside the project, downloads
  piped to a shell, credential files or the `.claude` folder needs an extra tap (S-12;
  visible, round-15 P-8). The host appends a local note per peer-initiated action naming the
  device (S-13) and rate-limits each peer (S-14). Peer file reads are limited to the chat's
  project root with symlinks and `..` resolved first (S-10). Each decided limit in 2.1 is
  enforced on the HOST by a refusal on the channel entry and a test calls the channel
  directly as a peer (S-11).
- Opening a watched chat uses the existing fill path (`session:open`): a snapshot, then
  numbered live events. A gap triggers a fresh snapshot.
- **Capabilities become per chat** (Phase 0: T9 3.3, replaces "a watched chat gets the
  remote-screen set"). Three requirements: (1) a chat argument on the capability read
  (`getCapabilities()` takes none, is not a hook and notifies nobody; about 19 of its 45 call
  sites in 36 files are inside the chat screen and most are plain functions with no session in
  scope, so each needs a session id threaded in or a `capabilitiesFor(sessionId)` lookup);
  (2) new keys for image paste, file drop and Office, which are not capability keys today
  (only `assistantBrowser` is), plus attach if decided; (3) a subscription (for example
  `useSyncExternalStore`) so screens redraw when a chat's host changes, since nothing
  re-renders on a capability change today. The per-chat set is the window's own set MINUS the
  chat limits, NOT the `REMOTE_SCREEN_CAPABILITIES` constant (its `sessionRecord` is false and
  a phone's real set overrides it in the handshake). Some readers ask the bridge directly
  (`office.status()` cached once per run, `window.claude.browser` presence, three direct
  reads at `remote-shim.ts:1497, 3412, 3487`) and must become chat-aware too. The host still
  refuses on its side so a stale or modified watcher cannot get through. Each channel entry
  gets a marker `scope: 'session'` (the table has none; 99 of 478 are session-scoped by T9's
  count) so the parity test can be written. All four decided limits, and the sentence "X is
  not currently supported from a remote client", are NEW work on every device: on a phone
  paste and drag silently do nothing today, and on a computer nothing is enforced.
  **Attach (the paperclip) from a computer that is only watching:** a phone uploads the file
  to the host (`pickAndUploadFiles`, `file:upload`); a computer's picker returns paths on
  its own disk that the host cannot open. Upload like the phone, or list it as a limit: not
  in 2.1, OPEN, goes to Destin (round-15 C-4). A drag into the message box may already do
  nothing on desktop (Electron 44 removed `File.path`; UNVERIFIED at runtime): a possible
  existing bug, reported separately. **Per-chat capabilities also carry the session-scoped
  channel marker** and the other per-chat items T9 found; a chat-level "Let other devices
  type here" switch (P-7) is a per-chat capability.
- **Permission prompts** have unique ids. The host accepts the first answer for an id and
  tells later answerers it is settled.
- **A message typed on a watcher** is a signed call carrying a call id, the host entry it
  was aimed at, and the number of the last heartbeat received from the host. The host
  refuses a call aimed at a superseded host entry, or naming a heartbeat more than a few
  beats old by its own count. It remembers call ids on disk for longer than that window
  (bounded by time, more than the beat window and for example 24 hours, and by count; a call
  older than the window is refused regardless of id). The signature covers `{set, generation,
  to: host device id, callId, kind, version, hostEntry, afterBeat, channel, payload hash}`
  (Phase 0: threat model S-7); a replay at the same host, another host, after a restart and
  after the used-id store is cleared is tested.
  The watcher shows "sent" when the host confirms the line; otherwise the box keeps the
  text. Live events name their host entry; a watcher ignores a superseded host's.
- **Starting a chat on another device** is a forwarded `session:create` naming a project
  that device has downloaded.
- **Version mismatch.** Devices exchange app versions at connect. A watcher too old for
  the host's live protocol shows the chat from the durable lane as lines arrive, cannot
  type into it, and shows the update notice.

### 5.6 The relay

One Durable Object per device set, named by a hash of the first device's public key.
Operations are in 6.4.

1. **Authenticate** by a signed challenge against the public roster (Phase 0: T5 C9, G16).
   The relay sends `{aud, nonce}` (its own host name and 32 random bytes, single use, valid 30
   seconds); the device first checks `aud` equals the host it actually dialled, then signs
   `"youcoded-mesh/v1/relay-auth\0" ‖ canonical{aud, room, nonce, dev}`; the relay checks the
   nonce is its own, unused and fresh, `dev` is on that room's roster, and the signature is
   valid. The room is NAMED inside the signed response and verified against that room's
   roster, never trusted from the client (a device in two sets during a join cannot have one
   room "from its key"); replays across connections, rooms and relays all fail (tested). No
   Durable Object is instantiated before a valid signature: a stateless Worker verifies the
   signed challenge first (threat model Y-7). Connections are `wss://` only (L-9).
2. **Pass through** frames between connected devices: not stored, not counted.
3. **Hold** durable frames in groups: one per chat version, one per project, one mailbox
   per device.
   - A frame is at most 1 MiB; larger things are chunked by the sender (256 KiB to 1 MiB).
     Billing is per row, not per byte, so devices send fewer, larger frames where they can; a
     hold writes 3 rows (about 6 once deleted) (Phase 0: T7 3.5, 3.4 finding 13).
   - Each device tells the relay how far it has received each group (unsealed, so the
     relay can read it, but SIGNED by the claiming device and verified against the roster;
     after a removal the removed key's counters are ignored; threat model Y-10, K-8); a frame
     is dropped once every roster device has. A "recent" device says so for a chat it does not
     want, by reporting `throughSeq = head` (a roster device that has said nothing blocks the
     drop; T7 finding 9). "Every device" means every device that wants the chat (data-loss
     K-7). For a project only devices that have it downloaded count. This is separate from the
     signed acknowledgement between devices, which is the only kind that permits eviction.
   - A chat's group is dropped 30 days after its last line.
   - At 1 GB it releases whole groups, least recently used first, never the group being
     written while another remains. Every release is announced and kept as a mark on the
     group, so the writer treats those lines as undelivered again. New lines for a
     released chat are accepted; a device asking for the missing stretch gets `gap`.
   - Never held: a project's first full download, or any group larger than the limit (a
     chat over 1 GB). The host says so with the "Relay full" wording.
   - A signed "drop this group" from a roster device empties it at once ONLY for a chat whose
     `deleted` entry the relay holds or a project the roster says is removed; otherwise it
     is treated as a release (announced and marked). After the relay erases or restores a room,
     every writer re-offers every line without a signed anchor acknowledgement, as if
     released (Phase 0: data-loss D-2, INV-2, INV-3). A single device may not push another
     device's group out by filling its own: release prefers the writer's own oldest groups
     (threat model Y-9). The relay storing sequence numbers is a hint only; completeness is
     judged by hash chains and head tables, never by `seq`, so a relay restored to an older
     snapshot cannot make a device skip a frame (Y-4).
4. **Registers**, with no time limit, changed by compare-and-swap: per version `head`,
   `host`, `del`; per project `tip`. Values are sealed and signed by the device that wrote
   them, and include the hash of the value they replaced (they are ordinary signed frames,
   group `reg:<key>`, so a relay cannot swap values between keys; Phase 0: T5 G17). `reg-list`
   takes the revision it last saw and returns only what changed (a full list of 6,000
   registers is 3 MB and about 100 ms); a register over 16 KiB is refused (Phase 0: T7 3.4
   finding 7). A tip that does not connect to local history is ignored and logged; only two
   roster devices presenting genuinely unrelated histories produce "diverged" (threat model
   Y-12). The `del:` register is kept as long as any roster device could still be unaware
   (5.4).
5. **Presence**: read from the open authenticated connections, nothing stored. **State lives
   in storage** (Phase 0: T7 3.5): the relay's object is evicted when idle (verified after 25
   s), so it keeps nothing only in memory; after an erase the tables are recreated at once
   (a prototype bug: after `deleteAll()` every request hung); keep-alive uses the platform's
   automatic ping, which costs nothing.

Also: pairing meeting points; roster updates; erase after 90 idle days or an empty roster.
One alarm does both the 30-day and the 90-day rule (tested with a skewed clock; an early alarm
is harmless; an alarm held over 7 days at a spending limit is deleted, so it re-arms on every
wake; Phase 0: T7 finding 12). When an erased room is re-registered the relay accepts only a
roster chain that extends the longest chain any connecting roster device presents and bans any
key a `remove` in that chain names (threat model R-6). A change of the relay address or keeper
is a signed roster-level entry that needs unlock and raises the same notice as `add` (R-11).
Pairing meeting points are capped (64 KiB, the code's lifetime, per-address rate limit; P-9).
The relay never logs IPs beyond rate-limit windows (24 hours) and never logs device ids; group
names on the wire are `HMAC(set secret, id)` truncated, never raw runtime session ids or
provider prefixes (L-5, Y-6, Y-11). Frame length leaks content (an attack recovered the topic
of 55% of encrypted assistant replies from packet sizes): live-lane frames are padded to fixed
buckets and sent on a fixed cadence while a reply streams (threat model L-4); the cost and the
exact buckets are a Phase 3 decision and the claim "zero-knowledge" is not allowed (see 8).

- **With a super-host** devices send durable frames to it and use the relay's `hold` only
  while it is unreachable and the fallback is on. Registers and presence are used either
  way.
- **If the relay misbehaves** it can delay, withhold or replay an old register. It cannot
  read, forge or alter anything. A device never accepts a head older than one it has seen,
  and takes its first heads from a paired device.
  The worst outcomes, a device wrongly thinking it is up to date or two devices both told
  they reserved the host role, are caught when devices exchange control logs.
- **Limits with no account** (Phase 0: T7 3.8, threat model Y-7, Y-8): a new set starts with a
  small allowance (proposed 100 MiB) until a second device has completed pairing, then 1 GB;
  a global ceiling on sets and bytes (suggested 100 GB, about $20 a month) refuses new sets
  and feeds the existing hourly attack alarms (`src/security/alarms.ts`); new sets are
  rate-limited per network address with the existing `ratelimit` binding (approximate, per
  location; soft limits so users behind a shared network are not locked out) plus a small
  proof-of-work to create a set; unproven sets are purged after 7 idle days; during the
  build only an allow-list of test sets is accepted. **Allowance versus a sign-in is a
  visible choice** (round-15 R-2). At the free plan's 5 GB account cap only 5 sets fit
  and the safe per-set cap is about 900 MiB.
- **Cost and plan** (Phase 0: T7 1, 3.2, 3.7): the design's "free plan today" does NOT hold
  past a handful of users: the free plan's first limit is rows written per day (100,000), then
  the 5 GB account storage cap; 5 heavy users, or about 50 medium or 224 light ones, are the
  ceiling. The relay and the sign-in and marketplace API share ONE account quota, so when the
  free daily allowance runs out the relay stops for everyone until 00:00 UTC AND the sign-in
  and marketplace go down with it. Paid plan ($5 a month minimum): about $5 for one heavy
  user, about $5 to $20 up to 1,000 mixed users ($16 modelled), about $76 if every set
  parks its cap, and about $199 a month if an attacker parks 1 TB in 1,000 sets. The plan
  the account is really on is UNVERIFIED (no account access). Move to the paid plan before
  the relay is public: visible to Destin as a cost, round-15 R-1; O2 stays open. Live words
  batched about every quarter second cost 720 billed requests per hour of continuous streaming
  (about 12 per 60-second reply; outgoing is free). The Durable Object holds everything;
  object storage (R2) was compared and rejected for now (needs a checkout subscription, two
  stores, orphan risk) and stays a later option for project bundles. A new relay object needs
  its binding mirrored into `[env.test]` and the next migration tag `v4`. Not measurable
  here: real billing, the 128 MB limit, production latency, quota-exhaustion errors.

### 5.7 Project files over the mesh

Keep `GitTransport`'s staging, guards and repair. Change where history travels and how a
clash is settled.

- **Carrier.** Each synced folder gets a second hidden repository
  (`.youcoded/mesh-remote.git`) used as the remote; `GitTransport` already works against a
  local path. Incoming history is unpacked into it; outgoing history leaves it as
  incremental git bundles in durable frames.
- **The same merge on every device.** Today the incoming version keeps the file's name,
  which settles only because GitHub orders the pushes. Between equal devices:
  - both edited the same lines: the side with the lower git blob id keeps the name; the
    other becomes `name (from <device>, <date>)`, with device and date (in UTC) read from
    the commit that made it, never from the merging device;
  - one edited, one deleted: the edit is kept;
  - both renamed the same file differently: both names are kept;
  - merge commits use a fixed author and message, the later parent's date, and parents in
    a fixed order, so two devices merging the same histories produce the same commit. With
    three or more histories devices may pass through different merge commits, but end on
    the same tree, and on the same commit once nothing new is being written.
  This changes `GitTransport`'s conflict code and its "remote-wins" contract test.
  **~~As written above, this does NOT converge~~** (Phase 0: T4 verdict PARTIAL): with these
  rules alone three devices keep producing merge commits for ever (68 of 150 dense schedules
  never settled; one hand-built case made 405 commits from 3 edits and was still going).
  **With the four changes below it passes: 1,000 of 1,000 random three-device schedules, 300
  of 300 with four devices, 200 of 200 with five, 300 of 300 with each device matching lines
  differently, and 24 of 24 with two hosts writing every 2 seconds** (identical trees and
  identical commit ids everywhere, bounded commit count, no lost content). O14's fixed
  sequencer is NOT needed. Prototype: `prototypes/2026-11-14-mesh-phase0/T4/` (real git
  2.56.0 only; no other version, no Windows, macOS or Android git tried).
  1. **The merge is the app's own code over git plumbing** (`merge-base`, `diff-tree
     --no-renames`, `ls-tree`, `read-tree`, `update-index --index-info`, `write-tree`,
     `commit-tree`, `merge-file -p`; NOT `git merge`; do not pass `--diff-algorithm`, take
     git's default) and runs on a clean work folder after the usual snapshot commit. Per file,
     against the merge base: changed on one side only, take it; both changed different lines,
     take the text merge; both changed the same lines, or both added the same name with
     different content, or the text merge fails or the file is binary: the lower blob id keeps
     the name and the other becomes `name (from <device>, <date>)`; one edited and one
     deleted: keep the edit (write the copy first, as today's code does at
     `git-transport.ts:935-945`); both renamed differently: both kept (renames are never
     detected, a rename is a delete plus an add); **a file on one side and a folder of the
     same name on the other: the folder keeps the name, the file becomes a copy** (new, not in
     the first draft); a copy name taken by different content gets "Device 2", "Device 3".
  2. **Several merge bases:** merge the bases into one shared ancestor, leaving out any file
     they disagree on (never choose a winner among them). Git's own virtual base lost a user's
     line in 4 of 1,000 schedules. Cost: about half again as many conflict copies (6,948
     against 4,600 over the same schedules); the fallback is one real base (lowest id),
     8,986 copies, nothing lost.
  3. **Which head to merge:** a head whose non-merge commits are all inside another head is
     ignored ("covered") and adopted outright with no new commit; a merge commit is made only
     when each head has user commits the other lacks; on a content tie the head with more
     history wins, then the lower commit id (lower id alone deadlocked in 3 of 500 schedules).
     A device that adopts a head that is not a descendant of its own moves its own `main`
     there and force-updates its tip in the carrier repository: `types.ts` documents
     `maybeGc` as "never rewrites history" and `GitTransport.push` assumes fast-forward, so
     both change; user commits are never dropped. Merge commits keep the fixed author,
     message, later parent's date and sorted parents (harmless; no longer needed).
  4. **Duplicate copies:** a conflict copy whose bytes equal its original, or an earlier-named
     copy of the same original, stays in history but is NOT written to the work folder and not
     shown; staging (`stageAll`, `git-transport.ts:1006`) restores its entry instead of
     recording a deletion, and checkout skips it; it appears again once it stops being
     identical. Never delete it (deleting lost a user's line, seed 892).
  Known user-visible results (round-15 F-2, F-3): more conflict copies in three-device
  catch-ups; a rename on one device with an edit on another leaves TWO files (old name with
  the edit, new name with the old text). The existing contract tests `divergent edits
  converge: remote wins canonical, local kept as conflict copy` (`sync-transport-contract.ts:68`)
  and the first-sync test (about lines 127-136, "remote/A wins canonical") encode today's rule
  and must be REWRITTEN; the secrets rule (`isNeverSyncPath`, `git-transport.ts:911-925`:
  never make a "(from ...)" copy of a secret) is not in the prototype and must be re-applied
  inside the new merge (UNVERIFIED how). The new rule must not fight Office's own
  keep-the-old-version behaviour on an autosave over a change made outside the app (Phase 0:
  S3 4.8; how Office names and places that version was not read: UNVERIFIED).
- **Sequencer, for traffic only.** Devices send to one place first when they can: the
  keeper's tip register, else the lowest-id online device. Correctness does not depend on
  it.
- **Safety.** Upload the bundle, then change the tip. ~~Adopt a tip only if it connects to
  local history; otherwise the project is "diverged".~~ (Phase 0: T4 3.4, 3.7) A tip whose
  commits are not here yet is **waiting** (keep it, retry, ask the device: an out-of-order
  bundle looks the same); a tip whose commits ARE here and share no root commit with ours is
  **diverged**, and a diverged sender is ignored for that project; nothing is merged then
  (except at pairing, on the user's "same project", and for the Personal space, which is
  always combined). Each message carries the sender's tip; a device that already contains a
  received tip answers ONCE with its own tip and answers are not answered (without this a
  lost message made a device re-send for ever). A bundle whose prerequisites are missing is
  parked and retried after any later import, and local commits are also written into the
  carrier repository so they can be named as prerequisites. A tip that does not connect is
  ignored and logged, not "diverged" (threat model Y-12). Cut bundles from the oldest tip any
  device has acknowledged; if an earlier bundle was released, fetch straight from a device.
  Retry with random back-off. Measured on a 5,000-file project: a one-line edit makes a
  459-byte bundle; a full round is about 0.2 s of git work; a re-zipped 5 MB Office-style
  file makes a 5.2 MB bundle (UNVERIFIED on real Office files).
- **Inbound files are checked before anything is written** (Phase 0: threat model G-1 to G-8,
  G-10, G-12, G-14; data-loss D-11, INV-12), because the work folder is the user's project and
  a tree entry is a file the app writes into it:
  - **Path traversal and unsafe names:** reject (report as "diverged: unsafe paths") any
    entry with a component equal, case-insensitively and after Unicode normalisation, to
    `.git`, `.youcoded`, a gitfile named `.git`, `git~1` or NTFS and HFS+ look-alikes, or to
    a directory in `DEFAULT_IGNORES`.
  - **Symlinks and gitlinks** (mode 160000) in incoming trees are rejected, never
    materialised; `core.symlinks=false` on the carrier repository; the app requires a git
    version at or above the fixed ones for CVE-2024-32002 (2.45.1 and the backports) and
    refuses to import below it (Android's bundled git version was not checked: UNVERIFIED); a
    pre-write walk resolves every path component with `lstat`.
  - **Case-folding and collisions:** a pre-check computes a normalised key per entry (case,
    NFC/NFD, Windows reserved names, trailing dots and spaces, alternate streams, 8.3 names,
    paths past 260); colliding or unrepresentable entries are written under distinct safe
    names (`name (collision 1)`), never overwritten, and listed in the project's notice. An
    import never overwrites an existing path and no carrier call discards working-tree
    changes; the engine commits local edits before it merges (a test edits a file during a
    merge window).
  - **`NEVER_SYNC` is applied INBOUND too**, case-insensitively and normalised: an incoming
    `.env` or `Prod.ENV` is dropped, never written. The list is extended (at least `.npmrc`,
    `.pypirc`, `.netrc`, `.pgpass`, `.git-credentials`, `.dockercfg`, `.docker/config.json`,
    `.aws/credentials`, `.ssh/`, `.kube/config`, `*.pfx`, `*.p12`, `*.jks`, `*.keystore`,
    `*.kdbx`, `*.tfstate`, `*.tfvars`, `service-account*.json`, `secrets.*`, `.envrc`,
    `.claude/settings.local.json`, `.mcp.json`, `*.ovpn`, `.htpasswd`, `credentials*`, `id_*`
    key types), documented as a versioned file with a test per entry, plus a blocking
    CONTENT scan on outgoing text files for private-key headers and well-known token formats
    (listed to the user as "not shared: contains what looks like a secret"), and a one-time
    scan of the existing hidden history before the first bundle (a secret committed before
    the list grew is in every future bundle).
  - **Files that execute** (`.claude/**` including `settings.json` hooks, `.mcp.json`,
    `.vscode/**`, `.envrc`, `.husky/**`, `.githooks/**`, `.gitattributes`, `.gitmodules`,
    and Pages arriving in the Personal space): not applied automatically from another
    device; stored beside as `name (from Device, date)` with a notice; at minimum the FIRST
    arrival of a change to these paths needs an unlock-protected confirmation. One crafted
    `.claude/settings.json` is command execution on the host with no prompt. This is a visible
    product change that contradicts 2.8's "changes combine by themselves": section 2 is not
    changed; the question is round-15 F-1. OPEN.
  - **Bundles are bounded:** size caps per chunk, bundle and day per sender; exclusive temp
    files in a private folder with a quota; `git index-pack --strict --fsck-objects
    --max-input-size`; refs outside `refs/mesh/*` refused; the 50 MiB blob cap applies on
    IMPORT; tree entry count and depth caps; wall-clock and memory limit on the git
    subprocess. Every carrier git call sets `GIT_CONFIG_GLOBAL=<empty>`, `GIT_CONFIG_SYSTEM=<empty>`
    (or `GIT_CONFIG_NOSYSTEM=1`), `GIT_ATTR_NOSYSTEM=1` and neutralises `core.attributesFile`,
    `merge.*`, `diff.external`, `filter.*`, `core.pager`, `core.editor`, `core.askPass` and
    `url.*`, and never runs `git submodule`, `git lfs` or `gc --auto` hooks; a test plants each
    key and asserts no program starts. A first full download from a device is authenticated
    with roster keys and encrypted (G-15).
  - **Copy names** use the roster name of the commit's verified sender (from the signed bundle
    frame), sanitised and length-capped, and a date formatted from a validated UTC
    timestamp, never raw commit text (G-8). The lower-blob-id rule can be ground by an
    attacker (G-9): accepted as part of the paired-device trust model.
  - **A removed device's merged commits:** the device records per merged commit the verified
    sender and receive time; on a removal it quarantines the files that device's
    post-cut-off commits changed (restores the pre-merge version, keeps theirs as "(from
    Device)" copies) and says so (G-10).
- ~~**If T4 fails:** one fixed sequencer per project~~ T4 did not fail with the four changes;
  O14's first half is not needed (Phase 0: T4 verdict). If the amended rules were rejected it
  would still change what users experience and go to Destin first; a cheaper middle option
  (send to the lowest-id online device first) is already in the design as traffic only and
  was not simulated.
- **The note** is the tip register plus the number of commits in the tip's history. Each
  message carries the sender's tip (above).
- **Project id** is minted at creation and stored in the registry record (existing
  projects get one at the switch). Two folders are
  the same project when their histories share a root commit; when the user says two
  unrelated folders are the same, the lower id stays and the other becomes an alias.
- **Listed versus downloaded.** Which projects are downloaded is a local per-device set,
  replacing download-everything in `materialization-planner.ts`. Projects already on a
  device at the switch stay. A newly paired device starts with none. A first download
  comes straight from a device that has the project and is on.
- **The wait** is about 2 s for the mesh carrier (`engine.ts:143`; Phase 0: S3).
- **The Personal space** (project registry, tags, Pages) rides this carrier.
  `Conversations/`, `ConversationNames/`, `Handoffs/` and `Devices/` stop being written.

### 5.8 Storage policy

- "Recent": lines and extras of chats not used for 30 days may be evicted; the summary,
  control log and chain values stay.
- Never evicted: a chat hosted here; any line no other device has acknowledged. The
  relay's acknowledgement does not permit eviction, though it counts for the quit rule and
  the "waiting" label.
- **An acknowledgement permits eviction only from an anchor** (Phase 0: data-loss D-1,
  INV-1, K-13; replaces "another device"): a keep-everything device or a super-host that is
  currently on the roster. Two "recent" devices acknowledging each other's copy, then both
  evicting, then the only host being lost, loses the chat; and an acknowledging device that
  was wiped (an Android uninstall) stays "valid" on the roster for up to 30 days. So at
  eviction time the evicting device sends the anchor a random range `[a,b]` of the chat and
  the anchor returns the SHA-256 of its own bytes for it under a fresh nonce
  (re-proof of possession). If no anchor is reachable the device does NOT evict and disk
  pressure is shown to the user. Acknowledgements from removed or reinstalled devices (a new
  `hello` session with an empty head table, or a reinstall `add`) never count and are void for
  that incarnation. A device with only "recent" peers shows "N chats exist only on this
  device" in the "waiting" slot instead of a silence that looks like safe (visible; round-15
  C-5). A phone hosting a chat is still never cleared (2.2). Extras evicted with a chat are
  named in the notice (2.2), since a helper's partial working file is not in the lines.
- **"Waiting"** means: lines here that neither another device nor a keeper has acknowledged.
  The quit rule counts "reached the relay" as "waiting" until an anchor collects it: the
  relay alone can release at 1 GB overnight while the phone is off (INV-4); the label says
  what exists where (round-15 C-14; Phase 0: data-loss D-3, K-12).

### 5.9 Lifecycle

All of this runs only when the switch (7.2) is on, wired in both `main.ts` and
`headless-boot.ts`.

- **Awake per reply.** `powerSaveBlocker` on desktop, capped at 2 hours per reply; the
  existing `keepAwake` host call on Android (already capped at 4 hours).
- **Battery exemption.** A new Android setting the user opts into.
- **Quit.** Compare each hosted chat's head with what a keeper or peer has acknowledged.
  All reply ends acknowledged: quit at once. Otherwise allow a few seconds for project
  changes, then quit and show the line in 2.6.
- **Launch and wake.** Before any hosted chat continues or is resumed: connect, fetch control logs from
  whatever is reachable, run `decide`. Taken over: stop the process and append `released`.
  Nothing reachable: carry on as host.
- **Holding a reply across sleep.** A reply running when the computer slept carries on the
  instant it wakes, before the network is back. So:
  1. Claude Code already asks the app before each file change or command (the blocking
     hook used for permissions). From the sleep signal until the wake check completes, or
     about 10 seconds pass with nothing reachable, the app answers "wait". The reply may
     produce words but cannot touch a file or run a command. The native runtime is simply
     paused.
  2. ~~Where the operating system allows, the process is also paused at the sleep signal.~~
  **Dropped** (Phase 0: T19 finding 7): freezing the process group is not a reliable hold (a
  child that put itself in its own group kept running; keys typed while frozen were
  delivered afterwards).

  **Phase 0 rule, replaces "the first is the one relied on"** (T19, simulation on LINUX only;
  no real suspend was run anywhere): the hold is "sleep signal AND tick gap", checked on the
  once-a-second tick and again whenever a pre-action ask is handled (the second check fixed
  the first run's slips). The sleep signal alone is never relied on: with the signal always
  delivered 0 of 50 trials slipped, with a quarter of signals lost 28 of 100 slipped (6,433
  writes), and signal plus tick gap gave 0 slips in 100 (gap alone 0 in 200). Release took
  0.1 to 1.8 s after wake. **A command already approved before sleep can still finish after
  wake ("straddle", 12 to 19 trials per 100): the hold cannot stop it; it counts as written by
  the old host** and is a case in the T12/T13 rig. The wall clock against the since-boot clock
  catches a real suspend only where that clock stops during sleep; a clock set back by the
  network time service is caught by neither (harmless). Real sleeps on Windows, macOS, Linux
  (the user's desktop, see 9) and Android, whether each system delivers its sleep signal
  before freezing the app, and whether Claude Code's real pre-action ask waits indefinitely
  for "wait" (the stand-in does) are UNPROVEN; the hold on Windows and macOS is unproven
  until a test device exists. Risk 12.5 stays open.
- **Timers use trusted time** (5.2): the 2-hour awake cap and all 30-day rules obey the
  two-source rule (Phase 0: data-loss D-16, INV-17).
- **Android already shows a foreground notification** and a "watched" signal read from the
  socket watchers; both must be reconciled with the mesh's watcher and host chip (Phase 0:
  S3 4.3).

### 5.10 Super-host

- The phone's backend already boots the whole app with no window under plain Node
  (`headless/headless-main.ts`, `headless-boot.ts`, `electron-headless.ts`). A super-host
  is that boot on Windows, Mac or Linux, started at login.
- To generalise: the owner token and secret key arrive on stdin from the Android service;
  secret storage is a shim keyed by that key (a desktop super-host needs the OS keychain);
  `headless-boot.ts:133, :139, :306` (moved from 132-134) hard-code Android (analytics
  `platform: 'android'`, `setAndroidId`, and the device-registry row), so a rig device or
  a desktop super-host would appear in the roster as an Android phone; a
  `YOUCODED_HEADLESS_PLATFORM` environment override (default `android`) is proposed in T1's
  report and NOT applied; `RemoteServer` in local mode binds loopback only
  (`remote-server.ts:382-385`), so the Tailscale browser view needs the non-local mode
  started in the headless boot (read from code, not tested); `powerSaveBlocker` is a call to
  a host app that does nothing in a headless boot; `getPath('downloads')` is `<home>/Download`;
  keep-awake has no desktop stand-in (Phase 0: T1 3.3). The super-host refuses to start, or
  shows a loud red notice and refuses pairing, when the key store backend is `basic_text` or
  the shim key lives beside the data; supported: OS keychain, TPM-backed, or a passphrase at
  start; full-disk encryption is recommended in setup (threat model B-1). The browser view
  is NOT a peer: a separate door with its own allow-list, off by default, enabling it
  needs unlock on a roster device and shows a persistent indicator; it checks `Origin` and
  `Host`, limits password attempts per address and globally, refuses any bind that is not a
  Tailscale-range address or loopback, is never reachable through `tailscale funnel`, uses
  `SameSite=Strict` cookies and no static pairing secret in a URL (B-2, B-3); a super-host
  auto-updates by default (B-4).
- It needs: start at login; pairing without a screen (it prints a code, or is paired from
  its browser view); the existing remote server in Tailscale mode as its browser view.
- It is an ordinary roster device on "keep everything". Outside access and locking its
  browser view are O1. Whether a Raspberry Pi is enough is T8.

### 5.11 Versions

Devices exchange app and mesh protocol versions at connect, inside a sealed signed `hello`
(a relay must not be able to alter them; a minimum protocol version is enforced by the
roster-level `format` entry, not a peer's claim; Phase 0: threat model L-8). The existing
fill-protocol refusal (close code 4005) is the precedent. A `format` entry names the minimum
app version that may host or continue a chat; concurrent `format` entries take the HIGHEST
value and never go down (the lower-id rule let the older minimum win in 21 of 40 trials;
Phase 0: T12 F13, part of PENDING (T12b decide rules)). Unknown entry and frame kinds are
kept and passed on, never dropped, up to a bound per sender (maximum frame size, maximum
unknown-kind bytes, rate limits per sender and path; threat model L-7).

---

## 6. Contracts and shapes

Engineering proposals, precise enough to write tests from. Field names may be refined.

### 6.1 Seams

| # | Seam | Contract |
|---|---|---|
| S1 | Runtime file → store (source adapter) | `poll(path, state) → {lines[], replyEnds[], state} \| rewritten`. A **line** is the bytes up to and including 0x0a (split on that byte only); a trailing partial line is not ingested. `state` holds byte offset, line count, chain hash (and conversation-chain hash), file identity (dev and inode; inode is unreliable on some Windows file systems, a `fileId` fallback needs a Windows test), a hash of the last 64 KiB before the offset, **a hash of the first 4 KiB of the file** (the 64 KiB check alone misses a compaction-style rewrite from line 1 that grows past the old offset and leaves the last 64 KiB equal) and a per-runtime reply state. A full re-hash happens only when the cheap check fails, plus `scrub()` when a chat becomes host-ready, after the host process restarts, and when idle (3 s per 300 MB), not on a timer for huge files; the one remaining blind spot, a same-size edit in the middle, is caught by `scrub()`. **`replyEnd(state, line) → {state, confirmed[]}` replaces `isReplyEnd(line)`** (per runtime; a confirmed end may name an EARLIER line than the one just read; rule in 5.3). Runs on the host and, to keep terminal work, on every runtime file of a chat in the store (5.4). A moved, replaced or deleted file is an ordinary event (`replaced`, `missing`), and `replaced` may first run the full re-hash and continue when the old prefix is intact. First ingest streams in batches (it holds a whole 327 MB chat in memory otherwise). Tests: append, partial write, truncate, truncate then regrow past the old size, in-place rewrite in the last 64 KiB and the first 4 KiB, file replaced by rename, file deleted, 13 MB append across the read chunk equals the from-scratch chain, 300 MB file polled in under 50 ms when unchanged (measured: 0.17 ms median, p99 1.5 ms at 311 MB; 11 of 11 unit tests pass; Phase 0: T2 findings 1-4; prototype `T2/adapter.mjs`). |
| S2 | Chat store | `head(version)`; `hashAt(version, segment, n)`; `read(version, segment, from, to) → lines \| evicted`; `append(version, segment, fromLine, lines) → ok \| parked \| not-a-prefix`, idempotent; `setAsideTail(takeoverId, version, fromLine)`, `tail(takeoverId)`, `setAsideDamaged(version)`; `replyEnds(version)`; `controlLog(chat)`; `appendControl(entry) → ok \| parked \| duplicate`; `summary(version)`; `listVersions()`; `hasExtra / readExtra / putExtra(hash)`; `evictBody / restoreBody`. Every write is atomic, fsynced before any acknowledgement, and survives a kill at any point. The `segment` argument is always 0 (segments-decision, 5.3). The read side serves five shapes (pages by line number, list metadata, a chat's folder, search turns, helper history; Phase 0: T20 4). |
| S3 | Replicator ↔ link layer | `sendDurable(target, frame) → Promise<Ack>` where `Ack` means the target has stored it durably; kept and retried until then; order kept per group. `sendLive(target, frame)`: best effort; dropped when more than 1 MB is queued for that target. A frame is at most 1 MiB (Phase 0: T7). `target` is a device id or `keeper`. `onFrame(handler)`. `presence()` and a change event. |
| S4 | Link layer ↔ relay | Operations and results in 6.4. Tests: a relay built with a shim that records every byte it stores, asserting none decrypts with any key in the test; a static check that the Worker imports nothing from the app's key code; register compare-and-swap under concurrency. |
| S5 | `decide` | `decide(entries, roster) → per version {host \| none \| pending, segment, deleted, name, flags, talkOnly, minVersion}`, plus `versions[{id, from, atLines}]`, `tails[{takeover, fate}]` and `void[]`. Inputs include `relation` and `released` entries, so no line data is needed. Property test: every permutation and duplication of the same entries gives the same output on every device (holds by construction because the function sorts by id first; Phase 5 must keep the permutation test as the guard). Its rules are PENDING (T12b decide rules): added properties "no finished reply that a remaining device holds is ever outside every version, a set-aside tail or a deleted chat" and "a version id shown at any time still exists at the end or has an alias" (Phase 0: T12 4). |
| S6 | Session router ↔ channel table | A `call` frame (6.3) is served through `serveRemoteChannel` with `{door:'remote', peer}`. Host events for the chat are forwarded as `live-event` frames with rising numbers. **Parity test, fail-closed (Phase 0: threat model S-2; T9 3.4):** the peer allow-list is an explicit list in a test file and the test fails if any channel not on it is peer-reachable; it needs a `scope: 'session'` marker on each channel entry (the table has none; 99 of 478 entries are session-scoped). `session:input` and `session:create` are served through a filter (5.5). Every `mesh` channel is `desktopOnly`, accepted only from the main window's top frame (`event.senderFrame` origin and URL), and no channel returns key or secret material (threat model M-1). |
| S7 | Host control ↔ runtimes | `isReplyRunning(version)`; `stopForSwitch(version) → {replyEnd} \| failed(busy \| gone \| cancelled)`, after which the chat is fenced; `becomeHost(version, uptoLine, mode: normal \| talk-only) → ok \| failed(lines-missing \| extras-missing \| no-folder \| sign-in \| runtime-error)`; `releaseHost(version) → {tailLines, tailHash, lastReplyEndInTail}`, which stops the process if the app owns it and marks the working file stale; the file is never moved while a process may still be writing it. |
| S8 | Project carrier ↔ GitTransport | `GitTransport` runs against `mesh-remote.git` as its remote. The carrier's own interface: `importBundle(bytes) → tips`, `exportBundle(since) → bytes`, `tip()`. The clash rule compares git blob ids, with the four T4 changes of 5.7 (own merge code over plumbing, conservative base, covered heads and tie-break, hidden duplicate copies). The existing contract suite (11 tests) runs against it with TWO tests rewritten (`sync-transport-contract.ts:68` and the first-sync test around 127-136), plus T4's assertions and `fuzz.mjs` schedule generator; `GitTransport.push` and `maybeGc` change to allow a forced tip (Phase 0: T4 4). |
| S9 | Storage policy ↔ store | `mayEvict(version) → bool` (false when hosted here, when any line lacks an ANCHOR acknowledgement re-proved at eviction time (5.8), when no anchor is reachable, or when used in the last 30 days; Phase 0: data-loss INV-1); `ensureBody(version) → ok \| unavailable(holders[])`. |
| S10 | Notices | `notice(facts) → rows[]`, pure. `facts`: trigger (opened, typed, chip tap, launch); host device and whether online or removed; whether the last durable line is a reply end; lines behind (`0`, a number, or `unknown`; a number may come from the host, a register, or the highest line the live lane mentioned); files behind (`no`, `yes`, `unknown`); project present; secrets and skipped folders; sign-in present; features missing; version ok; body available and who holds it; versions found; continued elsewhere while this device was off; talk-only. **Lines behind is `unknown`** when neither the host nor a register newer than the host's last known activity has been read. Each row of the table in 2.7 has one rule naming the facts that turn it on; rows come out in the table's order. The rules are written out in the test file, and every combination of facts is snapshot-tested. |
| S11 | Mesh ↔ interim backup lane | The lane reads the store through S2. It writes only in the one-time restore, which is offered only on a device not paired with any other, and only adds: where the store already has a chat, the prefix rule decides, and nothing is overwritten. |

### 6.2 Control and roster entries

```
entry      { id = SHA-256(rest), chat, version, kind, body, device, seen: id[], at, signature }
claim      { host, head: {segment, lines, hash}, ranHere }   // first host of a chat
takeover   { parent, to, segment, atLines, atHash, knowing?,
             reason: chip | host-offline | host-removed | no-connection }
released   { takeover, segment, tailLines, tailHash, lastReplyEndInTail, onBehalfOf? }
relation   { a, b, prefix: true | false }             // a and b are concurrent host entries
version    { from, atLines, deliberate, splitBy: id[] }   // id is deterministic (5.3)
bound      { runtimeSessionId }
segment    { segment, previousHead }
summary    { title, projectId, projectName, lastLineAt, lines, replyEndLines, model }
renamed    { title }      flag { name, on }      talk-only { on }      format { minAppVersion }
deleted    { }            restored { deleted: id }

roster     { id, kind: add | remove | rename, device, name, platform, signKey, agreeKey,
             by, seen: id[], at, signature,
             cutoff?: { version → { lastEntry, segment, lines } } }   // remove only
witness    { removal, held: { version → { lastEntry, segment, lines } }, device, signature }
```

Phase 0 changes to the shapes (Phase 0: T5 C5, C8; T12 4):

- Entries are encoded as deterministic CBOR; `id = SHA-256("youcoded-mesh/v1/entry\0" ‖
  canonical(fields except id and signature))`; `signature = Ed25519("youcoded-mesh/v1/entry-sig\0" ‖ id)`
  (the first draft left open whether "rest" included the signature: T5 G5).
- `witness` becomes an ordinary signed entry with `seen`; `cutoff` and `witness` gain
  `backed` (host-entry ids whose head lines the signer holds), since line counts on one
  chain say nothing about another; `released` gains `owner`; `takeover.parent` is required
  and may be null only for `host-removed` with no host entry left; `restored` undoes every
  `deleted` in its causal past; the `version` entry is never written by any rule and is
  either given a role (the natural home for version aliases) or deleted. These come
  from T12 and belong to the decide rules: PENDING (T12b decide rules). `claim` and `takeover`
  carry both chain values (T21), and `claim.ranHere` is a device id, not a hostname.
- The removal bundle is `remove` + `keygen` as one signed unit (5.1). A roster `add` for a
  re-paired device carries the removed device's chain heads for offering back as versions.

### 6.3 Frames

```
outside (readable by a keeper; EVERYTHING except `bytes` and `seq` is authenticated as
associated data; Phase 0: T5 G1, C7):
  { v, set, to: device | "all", group: "chat:<id>" | "project:<id>" | "device:<id>" | "live" | "reg:<key>",
    gen, from, session, counter, kind, seq, bytes }
  -- `seq` is added by the keeper after sealing: routing only, NOT authenticated.
  -- `group` ids are HMAC(set secret, id) truncated, never raw runtime ids (threat model L-5).
sealed (generation G): canonical{ b: body, s: Ed25519 signature over the header and body },
  key = K(frame, gen, from, session), nonce = 0^4 ‖ u64 counter. EVERY kind below is signed.
  (The first draft put `from`, `generation`, `session` and `counter` inside the seal: a receiver
  needs them to choose the key before it can decrypt, so that layout could not be built.)

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
*call         { callId, version, hostEntry, afterBeat, channel, payload }
*call-result  { callId, ok, payload | refusal }
*live-event   { version, hostEntry, n, lineNo, channel, payload }   // signed now (T5 G4)
*beat         { n }                                       // host heartbeat, numbered; signed
*hello        { appVersion, meshVersion, rosterHead }     // signed (T5 G18)
*received     { group, throughSeq }                       // signed by the device (threat model Y-10)
pairing       pake-1 | pake-2 | confirm | welcome{roster, secretSealed}   // own key, not G (T5 7)
```

Line frames also carry the host's head signature `(version, segment, lines, hash)` (5.3).
`ChatHead { version, segment, lines, hash, conversationHash }`. Tails are stored apart from the version, keyed
by the takeover entry's id, and never appear in a head.

### 6.4 Relay operations

```
auth        {aud, nonce} → signature{aud, room, nonce, dev} → ok | not-on-roster   // 5.6
hold        frame (≤ 1 MiB)                           → stored{seq} | over-limit{frame|group|set|register}
fetch-after { group, seq }                            → frames[] (bursts ≤ 4 MiB, then more) | gap{through}
received    { group, throughSeq }                     // readable by the relay, signed by the device
released    { group, throughSeq }                     // relay → devices; also kept per group
reg-get     { key } | reg-list { sinceRev }           → { key, value, token }[]  /  { rev, regs[] }
reg-set     { key, expectToken, value }               → ok{token} | conflict{value, token}
presence                                              → device[] + change events
meet-open / meet-join / meet-relay / meet-close       // pairing pipe; nothing stored
roster-put  entry                                     → ok | bad-signature
```

Register keys: `head:<version>`, `host:<version>`, `del:<version>`, `tip:<project>`.
`value` is opaque sealed bytes (for `host` and `del`, the signed control entry itself);
`token` is the relay's own counter for that key. A device reads the value, checks it is what
it expects, and swaps using the token.

### 6.5 A chat-list row and where each part comes from

| Shown | Source |
|---|---|
| Title | Latest `renamed`; else latest `summary.title` |
| Project, last used, model | Latest `summary` |
| Host device name | `decide().host` looked up in the roster |
| Chip | Shown when the set has more than one device; "pending" shows the last known host |
| "Behind by N" | `summary.lines` or the head register (from `reg-list`) or a peer's head table, minus this device's head |
| "Waiting" | Lines here that no device and no keeper has acknowledged |
| Version grouping | `decide().versions` |
| "Stored on Desktop" | Body evicted here; holders known from head tables |

---

## 7. Changes to existing code

### 7.1 By area

The old system keeps working, untouched, until Phase 7.

| Area | Add (Phases 1 to 6, behind the switch) | Remove or change (Phase 7 and after) |
|---|---|---|
| `main/mesh/` (new) | identity, link, store, replicator, control, host, proxy, policy, carrier | — |
| `main/conversations/` | — | Delete `handoff-*.ts`, `takeover.ts`, `lease-client.ts`, `resume-admission.ts`, the handoff glue in `service.ts:887-1042`, `transcript-mirror` into the Personal space, `ConversationRecord` syncing. Keep naming logic, tags, slug repair, `resolve-local-project`. |
| `main/ipc/` | A `mesh` channel family; `peer` context, a fail-closed `peerAllowed` allow-list and a `scope: 'session'` marker in `channel-table.ts`; what a phone may call stays pinned in `tests/phone-open-set.test.ts` and its fixture, and changing it is Destin's decision (Phase 0: S3 section 5) | Delete `handoff.ts` and the `HANDOFF_*` channels |
| Renderer | Host chip, the notice, Devices and pairing, storage setting, delete and Recently deleted, project "sync on this device", keeper settings, "Check sync". Hidden while the switch is off. | Delete the pending-handoff views, `resume-lease-gate.ts`, `takeover-dialog-copy.ts`, the MovedGate |
| Remote access | — | Remove the Android "Connect to Desktop" screen and desktop "Remote access" pairing for app use. Keep `RemoteServer` in Tailscale mode for the browser view and in local mode for the Android app's own screen. |
| `main/sync-spaces/` | The mesh carrier; per-device downloaded set; 2 s wait and the new clash rule, for the mesh carrier only | Stop GitHub pull; exclude `Conversations/`, `ConversationNames/`, `Handoffs/`, `Devices/` |
| `main/session-manager.ts`, native host | Seam S7; awake per reply; the hold across sleep | `stopSessionForHandoff` |
| `main/main.ts`, `headless/headless-boot.ts` | Mesh start-up, quit rule, launch and wake checks, in both. Wiring lives in NEW files with a one-line hook, or the line-budget tests for `main.ts`, `headless-boot.ts`, `remote-shim.ts` and `backend-contract.ts` fail (Phase 0: S3 section 5) | Lease wiring (`main.ts:1017`, `headless-boot.ts:195`; moved from 1014 and 186, Phase 0: S3) |
| `main/headless/` | Desktop super-host boot (Phase 8) | — |
| Android (`app/`) | Battery-exemption setting; multicast lock; an `unlock` host call with `androidx.biometric` (not a dependency today); a "was the Keystore really used" answer so the mesh refuses a plaintext fallback (`PairedDeviceStore.kt:50-52`). QR scanning exists (`QrScannerOverlay.kt`). Small native unlock helpers per desktop OS (macOS password-capable add-on or helper; Windows Hello add-on; Linux `pkexec`) (Phase 0: T11; T5 17) | `PairedDeviceStore.kt` for app use |
| Chat list, Resume and "Check sync" | One-time "restore after reinstall?" screen; "N chats exist only on this device"; set-aside copies and aside folder listed with sizes and a button to free them; chat-level "Let other devices type here" switch; settings menus and (i) popups that adequately explain the risks of the sync system (Destin 2026-11-14, round 14 U-11, a requirement on every one of these screens and its deck) | — |
| Worker | New Durable Object and route, allow-listed; template: the Connect 4 / Chess rooms and their sign-in tickets; binding mirrored into `[env.test]`, migration tag `v4`; a stateless pre-check that verifies the signed challenge before any object is instantiated; a tiny registry object for the global ceiling (Phase 0: S3 4.4; T7; threat model Y-7) | Lease operations in `SyncGroupRoom`, once no shipped version uses them |
| Everything that reads chat files directly | **29 source files read or write chat files directly** (23 touch Claude Code's folder, 6 more only the native folder) and 13 more reach them through those; found by `rg -l "ccProjectSlug\|'\.claude', 'projects'\|PROJECTS_DIR\|projectsDir\|claudeConfigDir\|claudeProjects\b\|CLAUDE_PROJECTS"` (28 files) plus the native-folder pattern (31, union 46) and judgement (Phase 0: T20 verdict PASS; S3's own pattern gave 29 files at both commits). The earlier "about 26" was close to the 28 of the first pattern alone. **12 must read through the chat store** (`transcript-page.ts`, `transcript-page-source.ts`, `transcript-cwd.ts`, `transcript-utils.ts`, `session-browser.ts`, `ipc/session.ts`, `ipc/model.ts`, and the five `chatsearch-index` files); **10 are host-only and stay** (`transcript-watcher.ts`, `subagent-watcher.ts`, `claude-queue-evidence.ts`, `slug-repair.ts`, `symlink-sweep.ts`, `import-project.ts`, `session-store.ts`, `native-home.ts`, `native-session-host.ts`, `accepted-history-store.ts`); **3 are deleted anyway** (`service.ts` mirror and record syncing, `handoff-transcript.ts`, `transcript-mirror.ts`). **The four that needed a design answer** (T20 ASK 1-4; decided here as engineering, the builder confirms): (1) `ipc-handlers.ts` is split by part: launch and watcher parts stay host-only, the transcript-page closure (about 1687-1731) goes through the store, the handoff glue (1410-1463) is deleted; (2) `conversations/reconciler.ts` (scans `~/.claude/projects`, creates a record per file) is REPLACED: "a chat exists" comes from the S1 adapter on whichever device sees the file, because records are no longer synced; (3) and (4) the native sidecars `<id>.shells.json` and `<id>.delegations.json` become extras (5.3), OPEN with the builder (O19). The chat-search index and the Resume list also need something to replace the conversation record as their list of chats (the roster plus the per-chat summary); the `youcoded-chatsearch` plugin reads only the app's own index, so it needs no change as long as the app keeps writing that index on every device. `transcript:read-meta` and `model:read-last` look dead (no caller; the second reads a whole file up to 300 MB): if confirmed they are removed instead of re-sourced. Slug repair, the launch sweep and project moves rewrite working files on the host (5.3). | — |
| Docs | — | Rewrite the changed parts of `youcoded/docs/conversations.md`, `sync-spaces.md`, `native-runtime.md` |

### 7.2 The switch

One local setting, off by default, in the app's own settings file, read by both boots, read from the device's own home or `userData` only, never a path outside HOME (the test rig writes it into each device's home before boot; Phase 0: T1 4). Off: the app behaves exactly as
today; nothing in `main/mesh/` starts; no new screen, setting or lifecycle behaviour is
visible. On, before Phase 7, only in test-rig and dev instances with their own home folder; in such
an instance the mesh runs and the Personal-space chat lane is off.
The Phase 7 release ships with it on for everyone; that update is what "a device switches
when it is updated" means. The old code is removed in a later release.

### 7.3 The interim GitHub lane (from Phase 7 until the backup rebuild)

Today there is no upload-only GitHub mode and chats are part of the two-way Personal
repository. So:

- When a device switches it runs one last ordinary sync, then never pulls again.
- From then on it pushes branches only it ever writes, so nothing can clash:
  `mesh-backup/<device id>` in the Personal repository (the chats it holds, plus the
  Personal space without chats) and the same branch name in each project's repository. The
  old `main` branches are left as they were. Git stores identical files once.
- **One-time restore** is offered on any device not yet paired with another: at first run
  when it has no chats, and from settings otherwise. It fetches the old `main` and every
  backup branch, compares copies of each chat by hash chain (a prefix: keep the longer;
  different: keep both as versions), adds to the store without overwriting, then fetches
  each project once. Chats over 50 MiB were never uploaded; it says which are missing.
- Not slimmed, so the repositories keep growing (4.28 GB on 2026-11-12).
- **Google Drive and iCloud daily backups keep carrying chats after the switch** (confirmed
  by Destin 2026-11-14, round 14 U-18, a gap the builder found; engineering added in Phase 0).
  Today `daily-backup.ts` copies every space, chats included, from `~/YouCoded/Personal/`;
  once `Conversations/` stops being written (5.7) chats would silently drop out of those
  backups. So the daily backup also exports from the chat store through S2, in the existing
  `Conversations/<provider>/...` layout, so today's dated snapshots stay readable and no
  restore tooling changes. A chat whose body is evicted on this device is not exported by
  it; any device that holds the body can back up for all, and the screen names chats never
  yet on a backing-up device (2.10 wording). `rclone` is not shipped on Android. **What the
  backup screens say about this change is user-visible and needs a deck** (and the settings
  and (i) text must explain the risks, per U-11). The Drive/iCloud copy stays unlocked
  by default, so the product must not claim backups are private (threat model H-1, X-1).
- **A failed push is never silent** (data-loss D-13, INV-14): "never pull" begins only after a
  SUCCESSFUL last sync, else the device stays on the old system and says so; the one-time
  restore is available on any device at any time, paired or not (it only adds, by the prefix
  rule, S11) and states "N chats on GitHub are not on this device"; backup status shows "last
  successful upload" and turns amber after 48 hours. The lane checks repository visibility on
  every push and refuses a public repository; the branch name uses the per-set random id, not
  a device id; the removal screen says a removed device may still hold the GitHub sign-in; the
  delete confirmation names the GitHub history while the lane exists; the one-time restore
  validates like live paths (5.3, 5.7) (threat model H-1 to H-5).

**Devices that update at different times.** An updated device no longer reads GitHub; one
not yet updated still does. Until all of a user's devices are updated and paired, the two
groups do not exchange new chats or file changes. Nothing is lost: when a late device
updates and is paired, the ordinary combine runs, and a chat continued on both sides
appears as two versions. A not-yet-updated device cannot show the new message, so the
updated device reads the old device registry and names the devices that still need
updating and pairing. The one-time message must say all of this plainly.

**Rollback** is for the whole release, never one device, and is for emergencies: a later
release turns the switch off, each device writes its store back into
`Personal/Conversations/` (records rebuilt from control logs; deleted chats left out), and
ordinary GitHub sync resumes with its conflict-copy behaviour, so users get conflict
copies. A single device cannot go back alone; that would break rule 4. Rehearse it in
Phase 7. **Rule (Phase 0: data-loss D-14, INV-15, LT-12):** rollback writes a chat file only if
it is at least as long as, and has as a prefix, what the destination has; evicted chats are
SKIPPED, not stubbed (a stub would replace the full file on `main` for every old-system
device); versions go out under the old conflict naming; deleted chats are listed in a report
file for the user (the old system has no tombstones, so omitting them would bring them back).

---

## 8. Security

**Promise.** Contents that sync are readable only on the user's devices. A keeper sees
sizes, counts, timing and public keys. Cloud backup is separate, and locked only if the
user turns the lock on.

**Must be true.**

1. No private key or set secret is written to a synced folder, a backup or a log, or sent
   to any server.
2. A device is accepted only if on the signed roster; a keeper's say-so is never enough.
3. The relay picks the room from the authenticated key. Phase 0 (T5 G16): the room is named
   inside the signed challenge response and verified against that room's roster.
4. ~~Durable frames, calls and device-to-device acknowledgements are sealed and signed.~~
   EVERY frame (durable, live, beats, `hello`, acknowledgements, `received`) is sealed and
   signed, the signature covers its header, and a sender never reuses a `(session, counter)`.
   Duplicates are recognised and ignored. Chat lines are accepted only with the host's head
   signature (Phase 0: T5 C7; threat model C-1, L-6, X-2).
5. Pairing cannot be completed by someone who only controls the relay.
6. From the first frame sealed under the generation a removal creates, the removed device
   can read nothing, and what it signs or sends beyond the cut-off is void everywhere.
7. Same-wifi direct accepts and serves nothing before the roster check.
8. No frame body in any log.
9. A keeper that lies can cause delay or a visible "two versions", never a silent loss or
   a forged line.
10. No device clears its only copy of a line on a keeper's word alone, or on an
    acknowledgement from a device that may itself evict or be wiped (Phase 0: data-loss INV-1).
11. (Phase 0: threat model and data-loss reviews.) The peer door is deny-by-default and
    filters `session:input` and `session:create`; a peer cannot cycle permission mode, run `!`
    bash, set `skipPermissions`, `cwd` or `resumeSessionId`; inbound project files are
    checked for traversal, symlinks, case-folding, execution config and `NEVER_SYNC`;
    every irreversible clock-driven removal needs two time sources; nothing set aside is
    deleted while it holds a reply end the live chain lacks; no log, crash report,
    diagnostics export or bug report carries a pairing code, key material or chat content
    (canary test).

**Every paired device is fully trusted, bounded** (Phase 0: threat model section 1 verdict
PARTIAL: "fully trusted" is too coarse in four places, now fixed by rules in 5.5, 5.3, 5.7
and 6.3). Any one can add a device, remove the others, and type into chats on the others,
whose assistants can run commands there; that stays true, but a paired device can no longer
send raw terminal input, create chats with its own options, forge another device's lines or
live events, or have its project files that execute applied without a look. The protections
are the unlock on adding and removing, the notice other devices show when one is added,
and the relay's delay before erasing an emptied set. **The unlock is a gate for people, not
for programs**: software running as the user on a device (including an assistant, or anything
a web page tricks it into running) can use that device's keys, because DPAPI and libsecret
hand them to any process of the user; the admin key is kept apart where the platform can
require user presence, and where not the Devices screen says so (Phase 0: T5 G11, threat
model P-10, M-2).

**Reviews.** A written threat model before Phase 1 is accepted. A dedicated review of
same-wifi direct before it ships. "End-to-end encrypted" may be used from launch on
condition of extensive reviews and audits of our own, based on external best practices:
before Phase 7, the pairing, key and relay code is audited against published standards by
reviewers who did not write it, with findings recorded and closed.

**Reviews, as extended by Destin on 2026-11-14 (round 14 U-17: "check it against standards and
also do basic whitehat styling pen-testing"):** the pre-release audit is written against
OWASP ASVS and MASVS (the threat model names them; this resolves the earlier unconfirmed
reading of "audits of our own") AND includes **basic white-hat penetration testing**
by fresh reviewers who did not write the code, with these questions at least: can a
bad actor intercept user messages, on the relay, on the wifi, on a device, between a
watcher and its host; can malicious assistant instructions be injected into a reply or a
resumed chat (forged lines C-1, forged live events L-6, a crafted `.claude/settings.json`
G-1, a prompt-injected command approved from a phone S-12, hostile extras and plan
paths C-2); and can the system be used to steal information or do other harm (secrets
in chats and files, quota exhaustion Y-7, parked data Y-8, a hostile same-wifi
peer W-*, a hostile web page reaching a local listener W-4, M-1). Every MUST in the threat
model has a test or an audit line; findings are recorded and closed. No outside firm is
used (U-17). Phase 1 acceptance names the tests for P-1 to P-4, P-6 to P-8, R-1 to R-3, R-5,
R-6, L-1 to L-3, L-6, Y-1, Y-3, Y-4, Y-7, Y-8, Y-10, X-2, X-5, D-1 and M-1; the S, C and G rows
become exit lines of Phases 2 to 4 (Phase 0: threat model section 8). Same-wifi (W-*)
is its own review. Supply-chain compromise of the app update is OUT OF SCOPE and
the product's security page says so.

**Wording and screens.** Every settings menu and (i) popup of the sync system must adequately
explain its risks (Destin 2026-11-14, round 14 U-11: a requirement on every screen deck).
What "end-to-end encrypted" may honestly claim, once the MUSTs for L-1, L-2, L-6, C-1, P-1,
P-4 and P-7 are met and the audit has closed its findings: "Your chats and project files are
encrypted on your devices with keys that never leave them. YouCoded's servers and Cloudflare
store only encrypted data and cannot read it." Not allowed: "zero-knowledge", "forward
secret", "a removed device can't read anything", "safe if your phone is stolen", "your
backups are private", "audited" before it is true, "nobody can run commands on your
computer" (threat model section 6; the wording is round-15 P-4).

**Limits to state honestly.** A stolen device keeps what it had. A thief holding the
longest-standing device, unlocked, can remove the others (the rule for two devices removing
each other is OPEN, 5.1). The browser view is protected by Tailscale only. A keeper sees the
full list in T5 C13: which room each connection belongs to, IP addresses and connection times,
public keys and device ids, roster entry sizes and timing, per frame its group name, sender,
recipient, generation, session, counter, size and time, acknowledgement positions (which tell
it which device is behind on which chat), which devices hold which project, register keys;
it does not see chat text, titles, project names, device names or file names. Live-frame sizes
can leak topics unless padded (5.6). Software running as you on a device can use its keys.
Anyone who copies what the relay holds and later steals one device can read what passed
through it in the last weeks (no forward secrecy). The interim GitHub copy and unlocked cloud
backups are plaintext to their hosts. Secrets pasted or printed into a chat travel to every
device and backup; an optional per-chat "keep this chat on this device only" is round-15 P-9
(Phase 0: threat model C-6). Chat and project files are stored readable on every device,
owner-only (0600/0700, Windows ACL), and a second OS user on a shared machine must not be able
to read the store or keys (threat model C-7, M-3).

---

## 9. Before building: tests and evaluations

**Run first, before anything else, because each can change the design:** T3 and T10 (can
Claude Code continue a chat on another computer), T4 (do project files settle between
equal devices), T19 (can a reply be held across sleep), and T21 (are real copies of a chat
identical).

Phase 0 ran T1 to T5, T7, T9 to T13 and T19 to T21 on 2026-11-14 (results in 9.1; T6, T8 and
T14 to T18 are not run). Phase 0 runs these as investigations, outside the product, on throwaway code. Where a row
says "again in Phase N", the same check is repeated against the real implementation as part
of that phase's exit.

| # | Question | How | Pass |
|---|---|---|---|
| T1 | Can real "devices" be run for tests? | A rig: N backend instances with separate home folders (dev instances share `~/.claude` and the machine id, so profiles are not enough); an in-process relay that can be made to lie; a distinct device id per instance; the ability to cut any link and skew any clock; an **inventory tool** listing every chat version, line count and chain hash per device. | One command runs 3 devices and a relay; two inventories can be diffed. |
| T2 | Do chats only grow? | A throwaway adapter over every chat on Destin's desktop; then `/compact`, `/clear`, resume-from-summary and a kill mid-write. Again in Phase 2. | 100% of non-append events reported as `rewritten`; none pass silently. |
| T3 | Claude Code facts | From the installed version: `--resume` keeps the id; resume in a different folder and on a different computer; fork-on-resume gives a new id, and whether it rewrites earlier lines; tool restrictions give a talk-only run; a prompt hook adds context; where tool outputs, plans and to-dos live; what marks the end of a reply. Record in `youcoded/docs/cc-dependencies.md`. | A chat moved by hand to a second home folder follows up a helper, rereads a saved output, sees its plan, and repeats back a note. Each fact has a written yes or no. |
| T4 | Does project history converge? | A throwaway carrier with the new clash rule and fixed merge commits. Three devices; clashing edits; bundles in every order; chain topology (A sees B, B sees C); two hosts editing every 2 s; a tip pointing at a missing or unrelated bundle. 1,000 random schedules. Again in Phase 4. | Identical trees everywhere, and identical commit ids once writing stops; commit count bounded; no clash repeats; no file lost; a bad tip raises "diverged". |
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
| T18 | Phone in the background | How long a backgrounded phone keeps its connection, with and without the exemption, screen off. | Numbers written down; 5.2's statement confirmed or corrected; the numbers are reported to Destin. |

| T19 | Holding a reply across sleep | On Windows, macOS, Linux and Android: with a reply running, sleep and wake the machine; answer Claude Code's pre-action asks with "wait" from the sleep signal until released; separately try pausing the process. | No file change or command happens between wake and release, on every system; where pausing the process works is listed. |
| T20 | Who reads chat files | List every source file that reads Claude Code's or the native chat folder, and what it does on a device that is not the host. | A table with a decision per file. |
| T21 | Are copies of the same chat really identical? | Read-only, on Destin's real data: compare each chat's copies across his four devices (the synced Personal folder, its history and its `(from device)` copies hold them) by hash chain. Look for line-ending or other byte differences in copies that should match. Also check whether each device can tell which chats it last ran. | Every pair is identical, a clean prefix, or a real split. Any other difference (for example line endings) is listed with a fix, before any building. |

### 9.1 Phase 0 results (2026-11-14)

All run on ONE Linux machine (no phone, Windows or Mac attached; Destin's devices available for
testing are Linux only: this laptop, a Linux desktop, and a phone "in theory", round 14 Q-7).
**Anything that names Windows, macOS or Android below is UNPROVEN** and stays labelled so
wherever the design claims it. Reports: `docs/active/investigations/2026-11-14-mesh-phase0/`.

| # | Verdict | What it settled |
|---|---|---|
| T1 | PASS | Rig: `rig.mjs up --hold` starts 3 jailed headless backends and a relay stub in about 3 s; isolation proved with a positive control (empty decoy home; 0 leaks); `diff A B` compares inventories; needs `bwrap` (Linux only); relay lies built, links by a TCP proxy per path, clock skew by a `Date` shift only (not mtimes, git or child processes). Not built: real link layer, frame-level faults, a unix-socket bridge for `--offline`. NOTE: the workspace `.gitignore` line 37 `*-phase*/` ignores the Phase 0 folders (the lead must force-add or rename them). |
| T2 | PARTIAL | No file ever lost or changed an earlier byte (see 3.1); adapter passes 11 of 11 tests, 0.17 ms unchanged poll at 311 MB; reply end cannot be a per-line check (5.3); `/compact`, `/clear`, resume-from-summary and kill mid-write were left to T3 (T3 ran `/compact` and `/clear`; see F9). Disagreement with T21 on segments RESOLVED (segments-decision): no segments. |
| T3 | PARTIAL, leaning PASS | Claude Code 2.1.325 on Linux: resume by id from any folder keeps id and file (YES); fork rewrites every line (YES); talk-only works with `--tools ""` plus a hook note; hook note IS written to the transcript; extras paths measured; to-dos live in `~/.claude/tasks/<sessionId>/`; one reply = one line per content block; two processes on one id interleave; `cleanupPeriodDays` deletes by mtime. Not proven: a second SIGNED-IN home folder, a Windows- or Android-written chat. |
| T4 | PARTIAL | 5.7 as written FAILS; with four changes 1,000/1,000 (5.7). Real git 2.56.0 only. |
| T5 | PARTIAL | CPace layer proved against published vectors, 34 checks; lockout after 3 tries; sizes; Linux only (5.1). |
| T6 | NOT RUN | Needs a phone and three routers. |
| T7 | PARTIAL | Fits platform limits on the paid plan; free plan breaks past a handful of users; not safe against abuse without an allowance (5.6). Nothing deployed. |
| T8 | NOT RUN | Needs a Raspberry Pi. |
| T9 | PASS (code reading only) | Of four limits, one enforced, one half, two silent; none shows the 2.1 sentence (3.3, 5.5). |
| T10 | PASS on Linux | Resume in a new folder edits correctly; talk-only does not. Windows- and Android-written chats UNPROVEN. |
| T11 | PARTIAL (research only) | Works out of the box on none of the four systems; O4 narrowed to three choices (5.1, 13). |
| T12 / T13 | PARTIAL | `decide` as written fails; replacement rules PENDING (5.4). |
| T14 to T18 | NOT RUN | Need the real relay, store and phone. |
| T19 | PARTIAL (simulation, Linux) | Hold = sleep signal AND tick gap (5.9). No real sleep on any system. The user's desktop is the intended sleep rig, set up by ssh and wake-over-network (round-15 S-1). |
| T20 | PASS | 29 files read chat files directly (7.1). |
| T21 | PARTIAL | 99.4% of 1,795 chats identical or clean prefix; 11 flagged in three families, each with a tested fix (5.3). |

### 9.2 Loss tests and invariants added by Phase 0 (data-loss review, INV-1 to INV-18)

Invariants (statement; where it lives): INV-1 anchor and re-proof before eviction (5.8). INV-2
`drop` honoured only for a deleted chat or removed project (5.6). INV-3 writers re-offer after a
relay erase or restore (5.6). INV-4 "reached the relay" is "waiting", not safe (5.8). INV-5 a
tail is removed only after its writer acknowledged the release, fail toward finished (5.4).
INV-6 bulk-delete hold, restore with late lines, `del:` retention, runtime files untouched
(5.4). INV-7 ingest terminal lines before replacing a working file, old file aside outside
Claude Code's folder (5.4). INV-8 watch runtime files of chats not hosted here (5.3, 5.4). INV-9
one retention rule for everything set aside (5.3). INV-10 old segments replicated, never
deleted (5.3). INV-11 void means hidden and kept, offered back as versions on re-pair (5.1).
INV-12 imports never overwrite; commit before merge; joining mailbox retention (5.7, 5.1).
INV-13 a reinstall is a new incarnation (5.1). INV-14 never pull after a failed last sync; restore
always available; backup status (7.3). INV-15 rollback never writes a shorter file (7.3).
INV-16 the adapter runs continuously on every runtime file it sees (5.3). INV-17 two time
sources and days-actually-run for every removal timer (5.2). INV-18 fsync before
acknowledging; refuse on a full disk (5.3).

Loss tests, run in the T1 rig: LT-1 two "recent" devices evict, the anchor is wiped; assert a
copy survives or eviction never happened (and the variant with an uninstalled device) (Phase 2).
LT-2 a signed `drop` of a live chat; relay erase then re-register; assert writers resend
(Phase 2). LT-3 enumerate every way each runtime ends a turn on real transcripts and in the rig;
none ends in "removed" (Phase 5). LT-4 delete then restart each device (no reappearing); delete
212 chats and nothing is removed for 24 hours; restore with late lines (Phase 5). LT-5 a
terminal resume on a non-host writes two finished replies, become host, both appear as a
version everywhere (Phase 2). LT-6 a forged `not-a-prefix` leaves the good copy listed;
truncate a store file at every byte offset of the last line (Phase 2). LT-7 truncate a runtime
file, append a line, the old segment is on an anchor and still there after 31 simulated days
(Phase 2). LT-8 remove a device holding unsent finished replies and re-pair it; the replies
return as versions, a forged line beyond the cut-off only on explicit choice (Phase 5). LT-9 a
case-insensitive file system with `A.txt` and `a.txt`, NFC/NFD pairs, Windows reserved names,
edits during a merge; every file's bytes found somewhere (Phase 4; the case-insensitive part
runs on a SIMULATED file system because Windows and macOS are not available). LT-10 reinstall
rig; old acknowledgements ignored (Phase 1). LT-11 rehearse A-then-B updates with the old
system active on B, kill the last sync midway (Phase 7). LT-12 rollback rehearsal with a recent
device, a deleted chat and two versions (Phase 7). LT-13 `cleanupPeriodDays` set to 1, a
terminal chat, mtime advanced two days; the chat is in the store first (Phase 2). LT-14 a clock
jump of 400 days each way at each step of D-4, D-5, D-9; no body removed early (Phase 5).
LT-15 fill the disk during a reply (Phase 2). Also: type at every millisecond of a chip
hand-over and assert exactly one of delivered or kept in the box.

### 9.3 Contradictions inside the first draft (data-loss review K-1 to K-13), each resolved or OPEN

| K | Resolution |
|---|---|
| K-1 (2.4 "lost unless paired again" vs void) | Engineering resolved: void = hidden and kept, offered back as versions (INV-11). 2.4's sentence is Destin's and is NOT edited: the question is round-15 P-13. OPEN until he answers. |
| K-2 (nothing cleared on a keeper's word vs timers) | Resolved by INV-9 and INV-10: one retention rule; the deliberate exceptions are delete and nothing else. |
| K-3 ("lines, whole" vs segment deletion) | Resolved by INV-10; the segment question is RESOLVED (segments-decision): no segments. |
| K-4 (no clocks vs timers) | Resolved by INV-17 (5.2); what T12 compares for delete dates is OPEN, engineering. |
| K-5, K-6 (unfinished dropped vs finished kept; "unknown" tails) | Resolved by INV-5 (5.4): fail toward keeping. |
| K-7 ("every device" for the relay) | Resolved: every device that wants the chat; the "Relay full" wording is round-15 R-3. |
| K-8, K-8b (unsealed `received`, the `del:` register) | Resolved: `received` is signed (5.6); the `del:` register holds the signed entry; bulk friction (INV-6, round-15 C-6). |
| K-9 (pairing never deletes vs collisions) | Resolved by INV-12(a) (5.7). |
| K-10 (identical copies vs T21) | Resolved: the conversation chain (5.3); the "opened and closed on a second device" outcome is round-15 C-3. |
| K-11 (GitHub off vs restore only unpaired) | Resolved: the restore is available at any time (7.3). |
| K-12 (quit wording vs eviction) | Resolved in engineering (5.8); the wording is round-15 C-14. |
| K-13 (phone hosted chats vs uninstall) | Resolved by INV-13 plus the "only on this device" count (round-15 C-5). |

The threat model's 112 rows are the audit list; Phase 1 acceptance, and the rows S-, C-, G- as
Phases 2 to 4 exit lines, are in section 8.

---

## 10. Build order

The mesh first, the backup rebuild after; the relay before the super-host. Everything
reaches users in one release, at Phase 7. ~~Phases 1 to 6 change nothing for users (7.2).~~
**Order changed by Destin on 2026-11-14 (round 14 Q-3, "wait"): Phase 8 (super-host) comes
BEFORE the one release.** The labels stay (Phase 7 is still "the release", Phase 8 is still
"the super-host", so every reference elsewhere holds) but the order of work is **0, 1, 2, 3, 4,
5, 6, 8, 7, 9**. Phases 1 to 6 and 8 change nothing for users (7.2). An O1 comparison of
Tailscale, tunnels and opening the router, in plain words, is owed to Destin BEFORE Phase 8
starts (O1). Everything below that a phase says "needs O1" waits for it.

| Phase | Builds | Destin reviews | Done when |
|---|---|---|---|
| 0 | T1 to T21 as investigations, the five named in section 9 first | A plain report and any decision they force | Each pass line met, or the design amended with his agreement where he can see the change. **Done 2026-11-14 for the tests listed in 9.1; his choices are in `round-15-choices.md`; the decide rules and the segments question are PENDING** |
| 1. Devices (needs O4 settled; the choices P-1 to P-5, P-10 to P-13 answered) | Keys, roster, generations, pairing (QR and code, relay meeting point, joining two sets), adding and removing with unlock, link layer over the relay, relay (authenticate, pass-through, presence, mailboxes, limits, allow-list, no sign-in allowance) | Devices screen, pairing, removing, the 30-day offer | Three rig devices and a real phone pair; T15 passes; threat model written and its Phase 1 MUSTs (section 8) pass as tests; the ES-module packaging proved in the real main process and the Android backend |
| 2. Chats copy | Chat store, adapters, chains, reply ends, control log (`claim`, `summary`, `renamed`, `flag`, `segment`), replicator, relay holding and releases, the 30-day and 1 GB rules, registers, storage setting, the chat list, relay on/off | Chat list on a second device (reading only), storage and relay settings | A chat written on A is readable on B in under 2 s, and after B was off a day; inventories match; T2, T14, T16 pass |
| 3. Watching | Session router and proxy, peer context, per-chat capabilities, host chip, permission from any device, signed calls (host entries are `claim` only in this phase), start on another device, version fallback | Watching and typing into a chat hosted elsewhere | A watcher drives a full reply on a remote host, desktop and phone; parity tests green; T17 passes |
| 4. Project files | Mesh carrier, clash rule, sequencer, tip register, per-device download, 2 s wait, combining projects at pairing | Project list with "sync on this device"; the same-project question | T4 passes AGAINST `GitTransport` itself (Phase 0 passed only a prototype, with the four changes in 5.7); a project edited on two hosts converges; inbound-file checks and LT-9 pass |
| 5. Host changes | `takeover`, `released`, `relation`, `version`, `bound`, `talk-only`, `deleted`, `restored`; full `decide`; combining chats at pairing; reservations; seam S7; divider and notes to the assistant; notices; delete; awake per reply; quit rule; launch and wake checks; the hold across sleep | Every notice row, the divider, quitting, deleting | Every row in 2.7 reproduced in the rig, with walk-throughs B to D and a kill between every step of a takeover; T12, T13 (with the replacement decide rules, PENDING), T16, T19 pass; LT-3, LT-4, LT-8, LT-14 pass; real sleep on the user's Linux desktop (Windows and macOS UNPROVEN) |
| 6. Same wifi | Discovery, direct path, local meeting point, peer arbiter | Nothing new on screen | Its security review passes; Phases 2 to 5 pass with the relay off; T15 passes |
| 7. Switch-over | Interim GitHub lane, last sync, one-time restore, one-time message, backup prompt, removal of in-app remote access, rollback, the security audit (standards-based AND basic white-hat penetration testing by fresh reviewers; section 8) | The one-time message and prompts; every settings menu and (i) popup explaining the risks (U-11) | Rehearsed on copies of Destin's four devices, updated one at a time: the inventory tool shows every chat once on every device; rollback rehearsed. Then, on his say and with him, a trial on his real devices, because copies cannot show Android backgrounding, real sleep or Windows key storage. Then the release |
| 8. Super-host | Desktop headless boot, start at login, pairing without a screen, relay fallback, outside access (needs O1) | Super-host setup | A super-host keeps two sleeping devices current with the relay off. **Runs BEFORE Phase 7 (Destin, 2026-11-14).** Needs the O1 comparison answered first; only Linux (the user's desktop, a Raspberry Pi in T8) can be tested, so a Windows or macOS super-host is UNPROVEN |
| 9. Backup rebuild | Its own design first (cards 241, 98, 121, 253; O10; O2 if payment touches it): one backup, slimming, restore, locking, GitHub fresh start; deletes the interim lane | New Backup screen | Separate acceptance |

Project files (4) come before host changes (5) because several notice rows need project
notes and fetching. Same wifi (6) comes before the switch-over (7) because "no keeper at
all" only works once devices can talk directly. ~~Phase 8 can move later without blocking
7.~~ Phase 8 now comes before 7 and blocks it (Destin, 2026-11-14, round 14 Q-3); Phase 8
depends on Phase 6 only for same-wifi talk, and on O1 for outside access. Nothing is
released before the super-host is done and tested on Linux. Pairing in Phase 1 joins devices; combining the data they already hold arrives with
the carrier (projects, Phase 4) and the full store (chats, Phase 5).

---

## 11. After building: what to measure

V1 to V5 are thresholds; a miss is a bug. V6 to V12 are numbers reported to Destin with a
recommendation.

| # | Measure | Target or report |
|---|---|---|
| V1 | Word on host to word on watcher | Under 0.3 s same wifi; under 1 s through the relay |
| V2 | Catch-up after a device was off | 1 MB chat under 2 s; a 300 MB chat completes with the app responsive |
| V3 | "Host offline" | No false notice across 100 wifi blips of under 10 s; a real loss detected within 45 s (needs a numbered beat about every 10 s while watched or hosting; a little phone battery, about nothing for the platform; Phase 0: T7 5) |
| V4 | Takeover, tap to ready | Under 5 s when lines are already here |
| V5 | File change to arrival | Under 5 s; during a burst of 200 edits, at most one send per 2 s |
| V6 | Relay storage and requests per user per day | Report; restate cost per 1,000 users |
| V7 | Phone battery | Report: per hour watching, per hour hosting, per day in the background, with and without the exemption |
| V8 | Phone mobile data per day | Report (card 258) |
| V9 | First pairing with hundreds of chats | Chat list complete in under 30 s; app usable throughout |
| V10 | Memory, start-up and disk added | Report against `.claude/rules/performance.md` |
| V11 | Hidden history growth at 2 s with two hosts | Report after a week |
| V12 | How often "two versions" appears, and why | Report; any case not caused by a real offline split is a bug |

**Experience checks** (the context-free tester in `scripts/ui-review/ux-tester.md`, then
Destin):

- Leave home with the computer asleep, continue two chats on the phone (one with its
  project, one talk-only), come home, bring them back.
- A first-time user pairs two devices without instructions.
- Each notice is understood; a four-row notice is readable.
- In talk-only, the assistant stays sensible about files it described earlier.
- "Both copies kept" files are noticed and understood.
- A watcher on a desktop understands why image paste is refused.
- "Relay full", "stored on Desktop, which is offline", and a pocketed phone showing as
  offline are understood.
- A user whose devices update at different times understands the one-time message.
- (Phase 0.) A settings menu or (i) popup of the sync system explains its risks adequately
  (round 14 U-11); the "Code expired can be an attack" line, the matching number on
  pairing, the removal screen's "last seen / may hold work that never synced", "N chats exist
  only on this device", and the clock-looks-wrong notice are each understood by a tester.
- (Phase 0.) Every claim that names Windows, macOS or Android is labelled UNPROVEN until it has
  been run on that system; the release readiness report lists them (round-15 S-2).

**After launch.** Settings → Devices → "Check sync" compares this device with each
reachable device (the inventory tool from T1) and says plainly whether they match. The app
counts warning signs locally (a rewritten chat file; an inventory mismatch; a repeated file
clash; a parked entry that never resolves; a second version) and includes the counts when a
user chooses to send a bug report.

---

## 12. Risks, in order of concern

1. **Project files between equal devices** (5.7). T4 first. Phase 0: the risk is now "did the
   real code match the prototype", not "can it converge"; T4 repeats on `GitTransport` in Phase 4.
2. **Claude Code is someone else's product.** Its file layout, resume, forking and hooks
   can change. ~~If T3 or T10 shows a Claude Code chat cannot be resumed on another
   computer, "Continue here" has no mechanism for those chats.~~ Softened (Phase 0: T3 4.7):
   resume across folders and file placement work on Linux. What remains: a sign-in per device
   (`CLAUDE_CODE_OAUTH_TOKEN`; Destin's own sign-in on this machine ends between 20 and 23
   November), absolute paths in extras, a failed resume writing junk lines, hook notes that
   are recorded in the file, and any layout change. The T3 prototype is re-run on each Claude
   Code bump (proposed `cc-dependencies.md` entry in T3 section 7, not yet applied).
3. **The switch-over.** Devices update at different times, and syncing stops between them
   until they are paired by hand. Day one also depends on copies of a chat that should be
   identical really being byte-for-byte identical (T21).
4. **The everyday case without a super-host.** The host is often asleep, a pocketed phone
   looks offline, and nothing alerts a phone that a chat is waiting for a permission
   answer.
5. **Waking from sleep.** If T19 finds a system where the hold has a gap, a reply could
   act before the check (watched by V12). Phase 0: simulated on Linux only; a command approved
   before sleep can still finish after wake; real sleeps are unproven everywhere (OPEN until
   run on the user's desktop; Windows and macOS stay UNPROVEN).
6. **Phone as host.** Android may stop a long reply (the opt-in exemption; V7; T18).
7. **Relay cost, abuse and filling up.** One rarely-opened device makes up to 30 days of
   chats pile up toward 1 GB; no sign-in lets anyone park data. ~~T7 reports before the
   limits are treated as fixed~~ T7 reported: the free plan does not hold past a handful of
   users, one flood stops sign-in and the marketplace for the UTC day, and 1,000 stored 1 GB
   sets would cost about $199 a month; the allowance, a global ceiling and the paid plan are in
   5.6 and round-15 R-1, R-2; a sign-in is held in reserve (Phase 0: T7).
8. **Every paired device is fully trusted, bounded** (section 8; Phase 0: threat model).
   15 Critical rows were found and are fixed by rules; the worst were raw terminal input from
   a watcher, an unfiltered `session:create`, unsigned live events, and forged lines.
9. **One release for everyone, hard to undo.** The protection is the Phase 7 rehearsal and
   the trial on real devices.
10. **Start-up wiring exists twice** (`main.ts`, `headless-boot.ts`); S3 found more evidence
    (the launch-settings retry gained wiring in both).
11. **Eviction without an anchor** (Phase 0: data-loss D-1): two "recent" devices acknowledging
    each other, then both evicting, then the only host lost, loses a chat. Fixed by INV-1.
12. **Clock-driven deletion** (Phase 0: data-loss D-16, threat model X-5): one wrong clock
    removed tails, Recently deleted bodies and old segments early. Fixed by INV-17.
13. **Windows, macOS and Android are unproven** (Phase 0, Destin round 14 Q-7): only Linux can
    be tested; the unlock prompts, key storage, case-insensitive file systems, real sleep and
    the phone's behaviour are all unrun. Every such claim carries the label.

---

## 13. Open

| # | Item | State |
|---|---|---|
| O1 | Reaching a super-host from outside the home (Tailscale, tunnels, router), and locking its browser view | A plain comparison is owed to Destin **before Phase 8, which now runs BEFORE the one release** (his answer 2026-11-14, round 14 Q-3). Not yet written. (Phase 0) |
| O2 | Payment | Destin: decide later for users paying. Separately, the relay must move to the $5-a-month Cloudflare plan before it is public (T7); that is round-15 R-1 |
| O4 | Adding or removing a device on a desktop with no OS unlock | **Narrowed by T11 (research only; no system run except Linux checks): the app's unlock works out of the box on none of the four systems.** Three plain choices ("ask in the app and warn the others", "make a YouCoded password", "refuse"), recommendation: the first, with the real OS unlock wherever there is one. Asked 2026-11-14 (Q-2); he answered "kinda confused about what the point even is of the password thing on some devices with option a?" so it is NOT decided and is re-asked plainly in round-15 P-5 |
| O10 | Backup choices that work on every device | For the backup rebuild's design |
| O14 | ~~If T4 fails: files move only while one chosen device is on.~~ ~~If T3 or T10 fails: no way to continue a Claude Code chat on another computer~~ | **NOT NEEDED (Phase 0).** T4 passes with four changes (5.7), so one fixed sequencer is not needed; T3 and T10 passed on Linux (resume by id from any folder works). Reopens only if the real transport repeats T4 and fails, or Windows- or Android-written chats cannot resume (UNPROVEN) |
| O15 | The relay's 1 GB, free, no-sign-in terms | **Reported by T7 (Phase 0), still OPEN for Destin:** free only for about 5 heavy users; 100 MiB starting allowance versus a sign-in; "Relay full" shows at about 900 MB on the free plan; round-15 R-1 to R-3 |
| O16 | A chat that ran in a folder that is not a synced project: what "Continue here" says and offers elsewhere | **ANSWERED 2026-11-14 (round 14 Q-1): "talk-only-plus-offer"**: talk-only on devices without the folder, and the device that holds the folder offers to make it a synced project |
| O17 | Whether to build a scheduled new key generation (for example every 90 days) to bound what a leaked secret exposes | OPEN, engineering with a visible effect only if a device is offline across a generation (T5 C12; R-4) |
| O18 | Linux with no secret store: refuse to turn the mesh on, or turn it on and warn | OPEN, goes to Destin (round-15 P-3); proposed: refuse |
| O19 | Native sidecars `<id>.shells.json` and `<id>.delegations.json`: do they follow a chat to a new host (proposed: yes, and recorded shells read as ended) | OPEN, builder confirms in a Phase 5 test (T20 ASK 4); goes to Destin only if it changes what he sees after Continue here |
| O20 | Segments: do they exist at all (T2 says no, T21 and the data-loss review say yes) | RESOLVED 2026-11-14: no segments; a rewrite becomes a new version (5.3) |
| O21 | The replacement `decide` rules, version-id aliases, `pending` handling, `format` maximum, `restored` undoing all deletes | PENDING (T12b decide rules); F9 (3 of 20,000 runs still lose a reply) is unexplained |
| O22 | Two devices removing each other: three positions (T5 G6, T12 F8, threat model R-3) | OPEN, goes to Destin (round-15 P-10) |
| O23 | What T12 compares for "identical delete dates everywhere" when the rule uses first-seen time (data-loss K-4) | OPEN, engineering, before Phase 5 |
| O24 | Whether a peer may send a leading `!` or a slash command through `send-text`, and whether `send-text` can reach bash mode at all | OPEN; S-1 requires a test; UNVERIFIED (threat model section 9) |
| O25 | Padding live-lane frames to fixed sizes and a fixed cadence (threat model L-4): cost and battery | OPEN, a Phase 3 measurement |
| O26 | Case-insensitive file systems, Windows Hello, Touch ID, real sleep, Android Keystore and the phone's background behaviour | UNPROVEN: no Windows, Mac or (for now) phone; Destin's testing devices are Linux only (round 14 Q-7) |

**Answered on 2026-11-14 (round 14, `mesh-sync.questions-14.answers.json`):** O16 (Q-1); the
order of Phase 8 (Q-3, "wait"); the sign-in for test devices (Q-4, "token": a separate
long-lived Claude sign-in, made by him once with `claude setup-token`); a locked-down test
relay may go online once a separate reviewer has checked it, and he is told afterwards (Q-5,
"yes-reviewed"); the sleep tests run on his Linux desktop, not this laptop, once ssh and
wake-over-network are set up there (Q-6; round-15 S-1); the devices available for testing (Q-7).
His note on U-7 ("does straight over the same wifi mean tailscale-backed live syncing for
free?") is answered in chat, not here: no, it is direct on the home network and does not use
Tailscale.

Confirmed by Destin 2026-11-14 (round 14): what a keeper can see (U-16; the unconfirmed
reading in 2.4), Drive and iCloud daily backups keep carrying chats (U-18), the reading of
section 8's audits as against published standards, now with hands-on attack testing (U-17).
**Still not confirmed:** the reading in 2.3 that a picture sent in a chat travels and only the
scratch copy stays (U-15: he answered "kinda confused about the risks/benefits here?"; re-asked
plainly in round-15 C-1). Section 2's text itself is unchanged and still carries the "(unconfirmed
reading)" marks.

---

## 14. Phase 0 record (2026-11-14)

What was done: investigations S3, T1, T2, T3/T10 (Linux), T4, T5, T7, T9, T11, T12/T13, T19,
T20, T21, a written threat model (112 rows: 15 Critical, 56 High, 32 Medium, 9 Low) and an
independent data-loss review (17 paths, 18 invariants, 15 loss tests, 14 contradictions), in
`docs/active/investigations/2026-11-14-mesh-phase0/`, with throwaway code in
`docs/active/prototypes/2026-11-14-mesh-phase0/`. Not run: T6, T8, T14 to T18. Two decisions
were being settled elsewhere when this was written (segments; the decide rules) and carry
`PENDING` blocks in 5.3 and 5.4. Section 2 was not edited; every finding that touches it is a
question in `round-15-choices.md`: the device id (2.4), "limits a phone has" and the
paperclip (2.1), "free" relay (2.5), the timing of deletes (2.1), void and "lost unless paired
again" (2.4), joining two sets (2.4), "changes combine by themselves" for files that execute
(2.8), "approved from any device" (2.1), the quit wording (2.6) and the unconfirmed reading in
2.3. Open numbered items are in section 13; invariants and loss tests in 9.2; the first draft's
contradictions in 9.3. Findings from the reports not carried into a section because they are
reports of fact: the T2 and T21 scans (counts), the T7 cost tables, and the T4 performance
table (kept in the reports).
