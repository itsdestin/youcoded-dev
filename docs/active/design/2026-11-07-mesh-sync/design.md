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
  notice until they are built. [D1 Q-1, Q-11; D2 Q-7]
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
  device, extras included. One clock everywhere. [D12 Q-1]
- On "recent", an older chat cannot be read offline until it has been opened there once. If
  the only device holding its extras is off, the notice says the helpers' reports are kept
  but unfinished helper work cannot be continued. [D9 Q-1; D8 Q-1]
- **Proposed** (from his round 12 note, awaiting his yes): a user with only one device has no
  such setting; it appears once a second device is paired.

### 2.3 What travels

- A chat's lines, whole, pictures included. A picture sent in a chat is stored inside its
  lines, so it shows on other devices and the assistant still knows it. [chat 2026-11-12]
- The chat's extras: each helper's working file, long outputs the assistant saved, the plan
  and the to-do list. [D8 Q-1; D9 S-8]
- Not carried: undo history, and the device's scratch copy of pasted images. [D8 Q-1]
- Not carried in this design: the assistant's setup (skills, plugins, connected tools, global
  instructions). Card 248. [D8 Q-2]
- Project files, on the same locked system (section 2.8). [D5 Q-6]
- On mobile data a phone syncs everything, always. A setting to hold large items for wifi is
  card 258. [D12 Q-8]

### 2.4 Pairing, devices and security

- Everything that syncs is locked end to end. Only the user's devices can read it. [D2 Q-2]
  A keeper in the middle can still see how many devices and chats there are, their sizes and
  when they are active; the product must not claim otherwise.
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
  its own security review before release. [chat 2026-11-11]
- A super-host is a complete YouCoded with no window, on a device at home (a desktop left on,
  a Mac mini, a Raspberry Pi). It pairs like any device, holds every chat and project with no
  limit, hosts chats, catches devices up, passes live words, and opens in a browser. It holds
  keys, so it must be hardware the user trusts. A rented server was offered and not picked.
  [D7 S-1, Q-5]
- With a super-host the relay stores nothing for that user, except while the super-host
  cannot be reached; the user can switch that fallback off. [D7 Q-6; D12 Q-13]
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
- **Phone as host.** The phone stays awake for each reply with the screen off. A setting, off
  by default, exempts the app from Android's battery limits and explains the cost. [D6 Q-3]
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
| On the old host, when it returns | "This chat continued on Phone while this computer was offline. Its unfinished reply here was discarded." |
| Two versions found | "This chat was continued on both Desktop and Phone while they could not reach each other. There are now two versions. Keep both, or archive the older one?" |
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
- Two devices may host chats in the same project at once, with no notice. [D12 Q-5] Changes
  to different files, or different parts of one file, combine by themselves. When both
  changed the same lines, both are kept: one keeps the name, the other becomes
  "name (from Device, date)".
- Carried over unchanged: huge and generated folders are skipped; secrets never leave the
  device.

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
- At the switch, a user with one device is asked to set up a backup or to say plainly they
  want none. [D10 S-2]
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
- For later: backups hosted by YouCoded (card 253); storage growth (card 98).

---

## 3. What exists today (read this before designing against it)

Facts read in the code at the commits in the header. Paths are under
`youcoded/desktop/src/` unless noted. Android runs this same backend headless, so there is no
second implementation to keep in step.

### 3.1 Where chats live

| | Claude Code chats | Native (YouCoded's own) chats |
|---|---|---|
| File | `~/.claude/projects/<ccProjectSlug(cwd)>/<claudeSessionId>.jsonl` | `~/.youcoded/sessions/<nativeStoreSlug(cwd)>/<sessionId>.jsonl` |
| Written by | Claude Code itself; YouCoded only reads | `harness/session-store.ts`, plain append |
| Id | Minted by Claude Code; linked to the app's own session id in `sessionIdMap` at the first `SessionStart` hook | The app's id is the chat id |
| Grows only? | Usually. The watcher handles the file shrinking (`transcript-watcher.ts:989`), and `/clear` starts a new id. Destin's 295 compactions never removed a line. Treat as "almost always", and verify (section 5.3). | Yes, strictly. Compaction and `/clear` append marker events. |
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
  built (section 6.11).

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
- An Electron desktop cannot be a client (`renderer/index.tsx:104`). Only Android and a
  browser can, through `renderer/remote-shim.ts`.
- Every feature is one entry in `main/ipc/channel-table.ts`, served through two doors:
  windows (`registerDesktopChannels`) and remote (`serveRemoteChannel`). Phone policy sits on
  the entry (`desktopOnly`, `remoteAllowed`, `refusal`). Parity tests guard it
  (`tests/remote-channel-parity.test.ts` and neighbours).
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
  downloaded automatically (`materialization-planner.ts`, `service.ts:319`).
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
 │  Session router ── local session ──► SessionManager / NativeHost    │
 │     │                                                               │
 │     └─ remote session ─► Session proxy ─┐                           │
 │                                         │                           │
 │  Host control ◄─► Control logs          │      Notices (2.7)        │
 │       │                                 │                           │
 │  Chat store ◄─► Replicator ─────────────┤                           │
 │  (lines, extras, chain)                 │                           │
 │  Project carrier (git over mesh) ───────┤                           │
 │                                         ▼                           │
 │  Device set & keys ─────────►  Link layer (one interface)           │
 └───────────────────────────────┬───────────┬───────────┬────────────┘
                                 │           │           │
                          same-wifi direct   relay    super-host
                                          (blind DO)  (a full device)
```

| Part | Job | New or existing |
|---|---|---|
| Device set & keys | Device identity, pairing, the set's secret, removing a device | New (`main/mesh/identity/`) |
| Link layer | One interface for "send this sealed frame to that device / to the keeper", over whichever path works | New (`main/mesh/link/`) |
| Relay | Blind waiting room, notes, who-is-on list, pass-through | New Durable Object beside `SyncGroupRoom` |
| Chat store | Each chat's lines, hash chain, extras, on this device | New, fed by the existing transcript files |
| Replicator | "Everything after line N" between any two devices or a keeper | New; replaces `transcript-mirror` and the Personal-space chat lane |
| Control log | Host, takeovers, delete, fork, per chat | New; replaces leases and `ConversationRecord` host fields |
| Host control | Who hosts, takeover, dropping the half reply | New; replaces `takeover.ts`, `handoff-*`, `lease-client.ts`, `resume-admission.ts` |
| Session router + proxy | Makes a chat hosted elsewhere look local to the renderer | New; reuses the channel table |
| Project carrier | Moves git history between devices in place of GitHub | New `SyncTransport` carrier around the existing `GitTransport` |
| Storage policy | Keep everything / recent 30 days; Recently deleted | New |
| Lifecycle | Awake per reply, quit rules | Extends `main.ts`, `BackendService.kt` |
| Super-host | The headless boot, on a desktop OS | Extends `main/headless/` |
| Interim backup lane | Upload-only GitHub copy and one-time restore | New, temporary (section 6.11) |

### 4.2 Two lanes, kept separate

Everything that moves between devices is in one of two lanes. Mixing them is the commonest
way this kind of system goes wrong.

- **Durable lane.** Chat lines, extras, control-log entries, project history. Stored, ordered,
  verified by hash, retried until delivered, held by keepers. Losing a frame is a bug.
- **Live lane.** Token-by-token words, typing state, open permission prompts, "reply
  running". Sent only to devices that have the chat open, never stored by a keeper, and
  rebuilt from the durable lane plus a fresh snapshot after any gap. Losing a frame costs a
  moment of smoothness and nothing else.

A watcher's screen is the live lane when connected. Its offline reading and its ability to
take over come from the durable lane.

### 4.3 The seams (where one part meets another)

Each row is an interface a builder should define first and test alone.

| # | Seam | Contract |
|---|---|---|
| S1 | Chat source → Chat store | Given a transcript file path, yield lines in order with stable byte ranges; report "file is no longer an extension of what I indexed". One adapter for Claude Code files, one for native files. Nothing above this seam knows the two formats. |
| S2 | Chat store ↔ Replicator | `head(chat) → {line count, chain hash, epoch}`; `read(chat, fromLine, toLine)`; `append(chat, lines, expectedPrevHash)` refusing on mismatch; the same three for extras by content hash. |
| S3 | Replicator ↔ Link layer | `send(peer or keeper, sealed frame)`, `onFrame`, `peersOnline()`. The replicator never knows whether the path is wifi, relay or super-host. |
| S4 | Link layer ↔ Relay | Authenticated WebSocket; opaque frames; mailbox put / get-after / acknowledge; notes; presence. The relay never sees a key or plaintext. Proven by a test that the Worker has no code path to any key. |
| S5 | Host control ↔ Control log | Append-only signed entries; a pure function from the entries to "current host, epoch, cut line, deleted?, versions". All host decisions are made by that function, nowhere else. |
| S6 | Session router ↔ channel table | For a chat hosted elsewhere, each channel entry is served by forwarding to the host through a third door, `mesh`, beside `desktop` and `remote`. Policy flags on the entry decide what a watcher may call. |
| S7 | Host control ↔ SessionManager / NativeHost | `stopForTakeover(chat) → last finished line`; `resumeHere(chat, fromLine)`; `isReplyRunning(chat)`. Replaces `stopSessionForHandoff`. |
| S8 | Project carrier ↔ GitTransport | The carrier supplies "the tip and objects I heard from peers" as the remote; `GitTransport`'s merge and conflict code is reused. The existing contract suite must pass against it, plus the new convergence tests (T4). |
| S9 | Storage policy ↔ Chat store | "May evict this chat's body" and "fetch body now"; the chat list never depends on bodies being present. |
| S10 | Notices ↔ everything | One pure function from facts (host online? behind by N? project here? sign-in? version? features) to the list of notice rows in 2.7. The UI only draws its output. |
| S11 | Mesh ↔ interim backup lane | The backup lane reads the chat store and pushes; it never writes to the chat store except in the one-time restore on an empty device. |

---

## 5. The subsystems

### 5.1 Device set, keys and pairing

**Keys (engineering call).**

- Each device creates, on first run, a signing key pair and a key-agreement key pair. Private
  halves are stored with `safeStorage` (desktop) or the Keystore-backed shim (Android) and
  never leave the device.
- The device set has one **set secret** (32 random bytes), created by the first device. Chat
  and file frames are sealed with keys derived from it. It moves to a new device only during
  pairing, sealed to that device's key.
- The set secret has a version (an **epoch**). Removing a device makes the remover create a
  new epoch and send it, sealed, to every remaining device. Frames name their epoch. The
  removed device keeps what it already decrypted but can open nothing sealed afterwards.
- The **roster** (device id, name, platform, public keys, added-by, removed-at) is a signed,
  append-only list every device holds. The relay holds the public part to authenticate
  connections. A roster change is valid only when signed by a device already on it.
- Use an audited library for sealing and key agreement; write no cipher. Node's built-in
  `crypto` covers X25519, Ed25519, HKDF and ChaCha20-Poly1305. The typed-code path needs a
  password-authenticated key exchange, which Node lacks; choosing that library is pre-build
  item T5.
- Every sealed frame carries sender device id, epoch and a counter inside the sealed part,
  and a fresh random nonce, so frames cannot be altered, replayed or re-ordered unnoticed.
- No frame body is ever logged, on a device or on the relay. Pin this with a test.

**Pairing flow.**

1. On the device already in the set: Settings → Devices → Add device. It opens a short-lived
   meeting point on the relay (or on the local network when both are on the same wifi) and
   shows a QR code and a short code.
2. The QR carries the meeting point, the existing device's public key fingerprint and a
   one-time secret. Scanning it gives the new device everything needed to run an
   authenticated key exchange with no typing.
3. The typed code carries only the meeting point and a short secret; the two devices run the
   password-authenticated exchange over it. The meeting point allows a small number of tries
   and expires in minutes. [D12 Q-10]
4. The existing device shows the new device's name: "Add this device?" Only after yes does it
   send the set secret and roster, sealed.
5. If both sides already hold data, the combine-or-cancel step (2.4) runs before any chat or
   project data is exchanged. Both sides count chats and projects from their own stores and
   exchange only the counts and project names first.
6. Two existing sets pairing: the scanning side joins the other side's set. Its own other
   devices, if any, must be told the new secret by it. (Engineering call; rare. Test it.)

**Removing a device.** Requires the acting device's own unlock [D12 Q-9]. Android has
`BiometricPrompt`. macOS has Touch ID or password prompts. Windows and Linux need a native
route (Windows Hello; a polkit prompt). **Open:** what to do on a desktop that offers no
unlock at all (section 13, O4).

### 5.2 Link layer

One interface, three paths, tried in this order for a given peer:

1. **Same-wifi direct.** Devices announce themselves on the local network and connect
   straight to each other. The announcement reveals only that a YouCoded device is present.
   All frames are sealed exactly as on other paths, and the peer is authenticated against
   the roster before any frame is accepted. Built after the relay, behind its own security
   review [chat 2026-11-11]. Nothing like local discovery exists in the app today; Android
   needs a multicast lock (T6).
2. **Super-host**, when the set has one and it is reachable.
3. **Relay.**

Rules:

- The paths differ only below seam S3. A chat frame is byte-identical on all three.
- A device keeps at most one connection per path and multiplexes every chat over it.
- Presence ("which of my devices are on") is the union of what each path reports, and is what
  greys out devices in pickers (2.1) and decides "host is offline".
- "Host is offline" must not flap. Engineering call: a host is offline after no heartbeat on
  any path for a set time (start at 30 s; tune in validation V3), and the notice is offered
  only when the user opens or types in that chat.

### 5.3 Chat store and the copying system

**The chat store** is this device's copy of every chat it holds, independent of where Claude
Code or the native runtime keep their working files.

- Location (engineering call): under the app's own data folder, not inside the Personal
  space, so it can never be picked up by the git engine again.
- Per chat: the lines; a **hash chain** (`h[n] = SHA-256(h[n-1] ‖ line n)`), so any two
  devices can compare one small value to learn whether one copy is an extension of the
  other; the control log; a manifest of extras by content hash.
- The source adapter (seam S1) tails the live transcript on the host and appends to the
  store. For Claude Code chats this follows `transcript-watcher.ts`'s byte-offset method; for
  native chats it follows `session-store.ts`.
- **"Chats only grow" is verified, not assumed.** If the adapter finds the file is no longer
  an extension of what it indexed (the watcher's `transcript-shrink` case), the host starts a
  new **segment** for that chat and other devices recopy from the start of that segment. No
  device ever patches a copy in the middle.

**Copying.** One system for live sending and for catching up [D4 Q-1]:

- The host sends each new line as it is written, to every online device and to the keeper.
- A device that was away asks any peer or the keeper: "chat X, I have N lines ending in hash
  H". The answer is the lines after N, or "your copy is not a prefix of mine".
- Any device can answer, not only the host. [D4 S-2]
- Whenever two devices are on together they compare heads for every chat (one small table
  exchange) and the one ahead fills in the other.
- "Not a prefix" is resolved by the control log (5.4), never by guessing: either the asker is
  on a dropped half reply (cut it), or there are two versions (2.7), or the copy is damaged
  (recopy from a peer).
- Extras move by content hash: a device asks only for the hashes it lacks. They are large
  (helper files run 1 to 2 MB each; Destin's desktop holds 8.4 GB of them), so they are sent
  after lines and never block them.
- Line and extras frames are chunked to fit the relay's limits (T7).

**Notes.** For each chat the keeper keeps `{chat id, line count, chain hash, device that has
it, epoch}` with no time limit and no content [D7 Q-1]. A device compares its head with the
note to say, exactly, "Desktop has 120 newer lines and is offline". The chain hash in the
note also catches two devices at the same line count with different content.

**What counts as the chat's extras, by location** (confirm paths in T3):

| Extra | Claude Code chat | Native chat |
|---|---|---|
| Helper working files | `<slugdir>/<sessionId>/subagents/` | Child session files with `parentSessionId` |
| Saved long outputs | `<slugdir>/<sessionId>/tool-results/` | `specialist-reports/`, and Bash overflow now written to the temp folder (must move somewhere durable to travel) |
| Plan | The file in `~/.claude/plans/` named by the chat's lines | In the chat's lines |
| To-do list | `~/.claude/todos/` entries for the session | In memory only today; nothing to carry until it is persisted |

### 5.4 Control log and host control

**The control log** is a short, append-only list of signed entries per chat. It is how every
device learns who hosts without asking a server, and it is where the divider lives, because
YouCoded must not write inside Claude Code's own file [chat 2026-11-10].

Entry kinds: `created {host}`, `takeover {from, to, at line, chain hash at that line,
reason}`, `renamed`, `flag {complete | priority}`, `deleted {at}`, `restored`,
`fork {from chat, at line, deliberate}`, `segment {starts at line}`, `format {min app
version}`, `talk-only {on | off}`.

Rules (all decisions come from one pure function over these entries, seam S5):

- **Current host** is the `to` of the latest valid takeover, else the creator.
- **A takeover is valid** when it names the latest takeover it knew of (its parent). Two
  takeovers with the same parent conflict.
- **Conflict with a judge.** When a keeper is reachable, the keeper orders them: it accepts a
  takeover only if the parent matches the latest it holds (a blind compare-and-swap on an
  opaque value). First heard wins [D9 S-4]; the loser is told and stays a watcher.
- **Conflict with no judge.** Two devices that could reach nothing both proceed. When they
  meet, the function reports "two versions" and the notice in 2.7 appears. Nothing is merged
  automatically.
- **The cut.** A takeover names the last finished reply's line. Lines after it written by the
  old host are the dropped half reply. Every device discards them; the old host discards
  them when it sees the entry, and checks for the entry on waking before letting a reply
  continue.
- **Deletion** is an entry, so a device that returns after weeks obeys it. Bodies are kept 30
  days after the entry's time, then removed; the entry itself is kept so the chat cannot come
  back. [D12 Q-2]
- **Deliberate fork** creates a new chat id whose log starts with `fork`; the resume browser
  groups by that link.

**How the divider is shown and read.**

- The renderer draws the divider from the takeover entry at its line, reusing the system
  marker used for the model-switch divider (`MODEL_SWITCH_MARKER`, deterministic id so a
  replay cannot draw it twice; `renderer/state/transcript-event-actions.ts:361`).
- The assistant is told at the next message. Native chats: append a transcript event (the
  file is ours). Claude Code chats: add the note as hook context on the next prompt, through
  the app's existing hook scripts, so nothing is written into Claude Code's file. Confirm the
  hook route in T3.
- Talk-only notes use the same two routes.

**Taking over, step by step** (seam S7):

1. The new host checks the notice facts (seam S10) and shows the notice.
2. On yes it appends the takeover entry and sends it (to the keeper first, when reachable,
   for the compare-and-swap).
3. It makes sure the lines up to the cut and the extras are in the place the runtime expects:
   for Claude Code, `~/.claude/projects/<ccProjectSlug(local folder)>/<id>.jsonl` and the
   `subagents/` folder beside it; for native, its session folder. The existing
   `resolve-local-project.ts` and slug code map the chat to a local folder.
4. It resumes the chat (`--resume <id>` for Claude Code).
5. The chip changes on every device as the entry arrives.

A chip switch while the host is on is the same flow, except the old host first finishes or
is asked to stop its running reply ("The switch waits for a running reply to end").

### 5.5 Watching: session router and proxy

Goal: the renderer does not know whether a chat runs here or elsewhere, except for the chip
and the capability limits.

- Today the remote client is a renderer-side shim that replaces the whole backend
  (`remote-shim.ts`). That cannot give per-chat hosts and cannot run inside Electron.
- New: in the main process, a **session router** looks at each session-scoped call. A local
  chat goes to `SessionManager` / the native host as now. A chat hosted elsewhere goes to a
  **session proxy**, which forwards the call to the host over the link layer and republishes
  the host's events on the same local channels (`transcript:event`, `session:live`,
  `hook:event`, and so on).
- On the host, forwarded calls enter through a third door on the channel table, `mesh`,
  beside `desktop` and `remote`. Each channel entry's policy decides whether a watcher may
  call it. This reuses the one-entry-per-feature rule and its parity tests.
- Opening a watched chat uses the existing fill path (`session:open`, `session-record.ts`):
  a snapshot, then live events. A gap in live events triggers a fresh snapshot.
- **Capabilities become per chat.** A watched chat gets the remote-screen set
  (`shared/capabilities.ts`); local chats keep the device's own. The single list of refused
  features and their message lives where it does today (`renderer/remote-unsupported.ts`),
  extended to the decided limits in 2.1.
- Permission prompts are live-lane state. The host holds the pending request; every device
  with the chat open shows it; the first answer wins and the prompt is withdrawn everywhere.
  This path already exists for one remote client (`permission:respond`).
- A message typed on a watcher is a forwarded call. If the host does not acknowledge it
  within a short time and presence says the host is gone, the box keeps the text and shows
  "Not sent. Desktop went offline" with the Continue here offer. [D12 Q-4]
- Starting a chat on another device is a forwarded `session:create` naming a project that
  device has.

### 5.6 The relay

A new Durable Object class beside `SyncGroupRoom` (engineering call: do not extend the
account room; this one has no account). One object per device set, named by the set's public
identifier.

It does five things, all blind:

1. **Authenticate** a connecting device by a signed challenge against the roster it holds.
2. **Pass through** frames between devices that are both connected. Not stored, not counted.
3. **Hold** durable frames for devices that are not connected, per chat or per project, in
   order, until each roster device acknowledges them or 30 days pass since that chat's last
   line. Count bytes toward 1 GB. At the limit, release whole chats, least recently used
   first, and tell the sender which.
4. **Keep notes**, with no time limit: per chat and per project. Notes change by
   compare-and-swap so the relay can order takeovers and project tips without understanding
   them.
5. **Presence**: which roster devices are connected.

Also: pairing meeting points (short-lived, few tries); roster updates signed by a member;
erasing everything when the last device leaves.

Limits with no account [D12 Q-11]: creation of new sets is rate-limited per network address;
each set is capped at 1 GB and at a frame rate; a set untouched for a long period is erased
(period to be set with Destin, section 13 O6). A sign-in is the fallback if abuse appears.

Cost notes from the earlier research (`connection-options.md`): the Worker is on Cloudflare's
free plan today. Live words should be batched (about every quarter second) to stay inside
request limits. Storage is the cost that grows; real waiting data per user has never been
measured (V6).

### 5.7 Project files over the mesh

Keep `GitTransport`'s staging, guards, merge and repair. Replace only "talk to GitHub".

- **Carrier.** A device sends a peer the commits it lacks as an incremental git bundle; the
  receiver unpacks it into the hidden repository as the "remote" tip and runs the existing
  merge. Nothing like this exists in the app today (no `git bundle` use); prove it in T4.
- **Order without GitHub.** Today's conflict rule ("the remote version keeps the name")
  converges only because GitHub puts pushes in one order. Between equal devices two
  simultaneous merges would each call the other "remote" and never settle. So:
  - When a keeper is reachable, the project's note is the order: a device advances the tip by
    compare-and-swap, exactly like a push that can be rejected, then merges and retries.
  - With no keeper, the merge must be deterministic: both sides pick the same winner for a
    clashing file (engineering call: by a fixed order of device ids) and build the identical
    merge commit, so they arrive at the same tip whichever merges first.
  - This is the riskiest engineering piece in the design. T4 must pass before anything else
    in this subsystem is built.
- **The note.** `{project id, tip, counter}`; the counter is a plain number that rises with
  each change, which is what the notice quotes. Sent the moment files change. [D10 Q-2]
- **Listed versus downloaded.** The project registry (already synced in the Personal space)
  lists every project. Which projects are downloaded on this device becomes a per-device
  setting stored locally, replacing today's download-everything rule in
  `materialization-planner.ts`. Projects already on a device at the switch stay on.
- **First download** comes from a device that has the project and is on, passing straight
  through; it is too large for the relay's waiting room by design. [D9 S-3]
- **The wait** before sending drops from 15 s to about 2 s (`engine.ts:142`), tuned in V5.
- **The Personal space** (names, tags, the project registry, Pages) is a space like any
  other and rides this same carrier. Its `Conversations/` and `Handoffs/` folders stop being
  written and are excluded from it.
- **Same project or not** at pairing: two folders are the same project when their hidden
  histories share a root commit; otherwise the "Is this the same project?" question (2.4).

### 5.8 Storage policy

- "Keep everything": bodies and extras of every chat stay.
- "Recent": bodies and extras of chats not used for 30 days may be evicted; the list entry,
  control log and head stay. Opening an evicted chat fetches it from any peer or keeper that
  has it; if none is on, say so.
- Eviction never touches a chat this device hosts, or one with lines that have not reached
  another device or a keeper.
- "Recently deleted" holds deleted chats for 30 days on each device.

### 5.9 Lifecycle

- **Awake per reply.** Take a `powerSaveBlocker` (desktop) or the existing `keepAwake` host
  call (Android) when a reply starts on this host; release when it ends; hard cap so it can
  never stick. Android already caps at 4 hours.
- **Battery exemption.** New Android setting, off by default, that requests exemption from
  battery optimisation and explains the cost. [D6 Q-3]
- **Quit.** Before quitting, compare each hosted chat's head with what the keeper or any peer
  has acknowledged. All finished replies acknowledged: quit at once. Otherwise wait a few
  seconds for project changes, then quit and show the line in 2.6. The existing shutdown
  already caps teardown at about 6 seconds.
- **Wake.** On resume, reconnect the link layer and check each hosted chat's control log
  before any reply continues.

### 5.10 Super-host

- The Android backend already boots the whole app with no window under plain Node
  (`headless/headless-boot.ts`, with stand-ins in `headless/electron-headless.ts`). A
  super-host is that boot on Windows, Mac or Linux, started at login.
- It needs: an installer or command that sets it to start at login; pairing without a screen
  (it prints a code, or is paired from its browser view); the existing remote server in
  Tailscale mode as its browser view.
- It is an ordinary device on the roster with "keep everything". It answers catch-up like any
  device and can host chats.
- The relay fallback (2.5) means a device talks to the relay as keeper only while the
  super-host is unreachable.
- Reaching it from outside the home, and locking its browser view beyond Tailscale, are
  **Open** (O1).
- Whether it runs acceptably on a Raspberry Pi is unmeasured (T8).

### 5.11 Versions

- The link layer exchanges an app version and a mesh protocol version at connect.
- A chat's control log carries `format {min app version}` when a newer app writes something
  an older one cannot safely continue. An older device may still read and watch it; hosting
  or continuing shows the update notice. [D12 Q-12]
- Unknown control-log entry kinds are kept and passed on, never dropped.

---

## 6. Changes to existing code, by area

A builder's checklist. "Delete" means after the replacement is live and tested.

| # | Area | Change |
|---|---|---|
| 6.1 | `main/conversations/` | Delete `handoff-*.ts`, `takeover.ts`, `lease-client.ts`, `resume-admission.ts`; remove the handoff glue in `service.ts:887-1042`; stop `transcript-mirror` writing into the Personal space. Keep naming, tags, slug repair, `resolve-local-project`. |
| 6.2 | `main/ipc/` | Delete `handoff.ts` and the `HANDOFF_*` channels. Add a `mesh` family (devices, pairing, host, storage). Add the `mesh` door to `channel-table.ts`. |
| 6.3 | Renderer | Delete the pending-handoff views, `resume-lease-gate.ts`, `takeover-dialog-copy.ts`, the MovedGate. Add: host chip, the notice, Devices screen with pairing, storage setting, Recently deleted, project "sync on this device" switch, relay and super-host settings. All through review decks. |
| 6.4 | Remote access | Remove the Android "Connect to Desktop" screen and the desktop "Remote access" pairing for app use. Keep `RemoteServer` in Tailscale mode for the browser view, and in local mode for the Android app's own screen. |
| 6.5 | `main/sync-spaces/` | New carrier; `engine.ts` wait to 2 s; per-device downloaded set; exclude `Conversations/` and `Handoffs/`; stop GitHub pull. |
| 6.6 | `main/session-manager.ts`, native host | `stopForTakeover`, `resumeHere`, `isReplyRunning`; awake-per-reply hooks. |
| 6.7 | `main/main.ts` | Quit rule; wake check; no change to `window-all-closed` for normal desktops. |
| 6.8 | `main/headless/` | Desktop super-host boot; start at login. |
| 6.9 | Android (`app/`) | Battery-exemption setting; multicast lock for same-wifi; QR scanning already exists (`QrScannerOverlay.kt`). |
| 6.10 | Worker | New Durable Object and route; remove the lease operations from `SyncGroupRoom` once no shipped version uses them. |
| 6.11 | Interim GitHub lane | See below. |
| 6.12 | Docs | `youcoded/docs/conversations.md`, `sync-spaces.md`, `native-runtime.md` are already stale in places; rewrite the affected parts with the build. |

**6.11 The interim GitHub lane (engineering call; exists only until the backup rebuild).**

Destin's rule is: GitHub chat sync off at mesh deploy, GitHub backup continues, one-time
restore keeps working, never both systems syncing. Today there is no upload-only mode, and
chats are part of the two-way Personal repository. So:

- From the mesh version on, no device pulls from GitHub during normal running.
- Each device pushes its own branch of the Personal repository (for example
  `mesh-backup/<device id>`) holding a snapshot of the chats it has. A device's branch is
  only ever written by that device, so there is nothing to merge and nothing to conflict.
  Git stores identical files once, so several devices holding the same chats cost little.
- Spaces (Personal without chats, and projects) keep pushing their mesh-converged history to
  GitHub as a plain upload; a rejected push is skipped and retried later, never resolved by
  pulling.
- One-time restore, offered only on a device with no chats: fetch the branches, take the
  longest copy of each chat, load the chat store, then pull each project once. [D12 Q-14]
- Known cost: this upload is not slimmed, so the repository keeps growing until the rebuild
  (it stood at 4.28 GB on 2026-11-12). Chats over 50 MiB are still not uploaded.
- The backup rebuild deletes this lane.

---

## 7. Security

**What is promised.** Contents that sync are readable only on the user's devices. A keeper in
the middle sees sizes, counts, timing and device public keys. Cloud backup is a separate
thing and is locked only if the user turns the lock on.

**What must be true.**

1. No private key or set secret is ever written to a synced folder, a backup, a log, or sent
   to any server. Test: search the Worker and the backup code paths; a unit test that the
   relay's code has no import that could reach a key.
2. A device is accepted only if it is on the signed roster. The relay's own say-so is never
   enough: devices verify each other end to end.
3. The relay picks the room from the authenticated device key, never from an id the client
   sends.
4. Frames are authenticated, carry sender, epoch and counter, and are rejected on replay.
5. Pairing cannot be completed by someone who only sees the relay traffic. The typed code
   allows few tries and expires.
6. Removing a device rotates the epoch before anything new is sealed.
7. Same-wifi direct accepts nothing before roster authentication, and announces nothing but
   presence.
8. No frame body in any log.

**Reviews.** A written threat model before P1 is merged. A dedicated review of same-wifi
direct before it ships (decided). **Proposed:** an outside review by a person before the
words "end-to-end encrypted" are used as a headline claim; until then describe it as "locked
so only your devices can read it" (O5).

**Known limits to state honestly.** A stolen device keeps what it had. A thief who knows a
device's unlock can remove other devices. The browser view is protected by Tailscale only.

---

## 8. Before building: tests and evaluations

Each is small, done outside the product or behind a flag, and has a pass line. Do them
first; several can change the design.

| # | Question | How | Pass |
|---|---|---|---|
| T1 | Can two real "devices" be run for tests? | Build a rig: two backend instances with separate home folders (not just profiles, because dev instances share `~/.claude` and the machine id), plus a fake relay in-process. | One command starts two devices and a relay; used by every later test. |
| T2 | Do chats really only grow? | Run the source adapter over every chat on Destin's desktop and a week of live use; exercise `/compact`, `/clear`, resume-from-summary, and a crash mid-write. | Every non-append event is detected and produces a new segment; none passes silently. |
| T3 | Where does Claude Code keep extras, and can a note reach the assistant without editing its file? | Read the installed Claude Code's on-disk layout; resume a chat on a second home folder with and without each extra; deliver a note by prompt hook. Record in `cc-dependencies.md`. | A chat resumed elsewhere can follow up a helper, reread a saved output and see its plan; the assistant repeats the takeover note back. |
| T4 | Does git history converge between equal devices? | Extend `sync-transport-contract.ts`: three devices, clashing edits, bundles exchanged in every order, with and without the keeper's compare-and-swap. Property-test it. | All devices reach the identical tree and tip; no clash repeats; no file lost. The existing 11 tests still pass. |
| T5 | Which key-exchange library, and does it run on Android's Node? | Shortlist audited libraries; run pairing between a desktop and the Android headless backend. | Works on all four platforms; bundle size and start-up cost acceptable. |
| T6 | Does same-wifi discovery work from the Android backend? | Spike discovery under the foreground service with a multicast lock, screen off and on. | Devices find each other within a few seconds on ordinary home wifi; record where it fails. |
| T7 | Does the relay design fit Durable Object limits and cost? | Prototype hold / acknowledge / release with 1 GB of frames, 300 MB single chat, token batching. | Within value-size and request limits; cost per heavy user written down. |
| T8 | Does a super-host run on a Raspberry Pi and a plain desktop? | Boot the headless backend on each; host a chat; measure memory and idle load. | Runs for 48 hours; numbers recorded; Pi model named. |
| T9 | What does a remote screen really refuse today? | Read and try image paste, file drag, Office, browser from a phone client. | The central list matches the decided limits in 2.1, or the gap is listed. |
| T10 | How does a resumed chat behave when folders are at a different path? | Resume a Windows-hosted chat on Linux and on the phone, with the project present. | The assistant works on files without confusion, or the needed path note is designed. |
| T11 | Can each desktop OS ask for the user's unlock? | Try the OS prompt on Windows, macOS, Linux. | Works, or O4 is put to Destin. |

---

## 9. Build order

Destin's order: the mesh first, the backup rebuild after [chat 2026-11-12]; the relay before
the own-device keeper [D5 Q-1]. Within that, the phases are an engineering call, ordered so
that each one can be tested alone and the risky parts come early. Everything ships dark
behind one switch until Phase 7; while the switch is on in a dev instance, the GitHub chat
lane is off in that instance.

| Phase | Builds | Destin sees | Done when |
|---|---|---|---|
| 0 | T1 to T11 | A short plain report of results and any decision they force | Every pass line met or the design amended |
| 1. Devices | Keys, roster, pairing (QR and code), removal, link layer over the relay, relay skeleton (authenticate, pass-through, presence) | Devices screen and pairing, on review decks | Two computers and a phone pair; a sealed test frame crosses; threat model written |
| 2. Chats copy | Chat store, hash chain, source adapters, control log (created, renamed, flags, deleted), replicator, relay holding / notes / limits, storage setting, Recently deleted, one chat list | Chat list on a second device (read-only), storage setting, Recently deleted | A chat written on A is readable on B within seconds, and after B was off for a day; 1 GB and 30-day rules proven in tests |
| 3. Watching | Session router and proxy, `mesh` door, per-chat capabilities, host chip, permission from any device, unsent-message handling, start a chat on another device | Watching and typing into a chat hosted elsewhere | A watcher drives a full reply on a remote host, on desktop and phone; parity tests green |
| 4. Host changes | Takeover entries, the cut, divider and assistant note, notice function and UI, two-versions, forks grouping, talk-only, awake-per-reply, quit rule, version rule | Every notice row, the divider, quitting | Every row of the notice table reproduced in the two-device rig; old handoff code deleted |
| 5. Project files | Git carrier, ordering, notes, per-device download, 2 s wait, same-project question at pairing | Project list with "sync on this device", pairing with data on both sides | T4 properties hold in the product; a project edited on two hosts converges |
| 6. Same wifi | Discovery and direct path | Nothing new on screen | Its security review passes; works with the relay switched off |
| 7. Switch-over | Interim GitHub lane, one-time restore, day-one combine, one-time message, single-device backup prompt, remove in-app remote access | The one-time message, backup prompt | Destin's four devices migrate without a lost or duplicated chat; then the switch is turned on for users |
| 8. Super-host | Desktop headless boot, start at login, pairing without a screen, relay fallback, outside access (after O1) | Super-host setup | A super-host keeps two sleeping devices current with the relay off |
| 9. Backup rebuild | Its own design pass first (cards 241, 98, 121, 253): one backup feature, slimming, restore, locking, GitHub fresh start; deletes the interim lane | New Backup screen | Separate acceptance |

Phases 6 and 8 can move later without blocking 7. Phase 7 must not start until 1 to 5 are
done, because it is the point of no return for each user's GitHub chat sync.

---

## 10. After building: what must be measured and watched

Targets are starting points to confirm with Destin where they are user-visible.

**Performance.**

| # | Measure | Starting target |
|---|---|---|
| V1 | Delay from a word appearing on the host to appearing on a watcher | Under 0.3 s on the same wifi; under 1 s through the relay |
| V2 | Catch-up after a device was off | 1 MB chat in under 2 s; 300 MB chat completes without stalling the app |
| V3 | "Host offline" detection | No false alarms during a normal wifi blip; real loss shown within about 30 s |
| V4 | Takeover, from tap to first reply possible | Under 5 s when lines are already here |
| V5 | File change to arrival on another device | About 2 to 4 s; no pile-up during a burst of edits |
| V6 | Relay storage and requests per user per day | Recorded for Destin's real use; cost per 1,000 users restated |
| V7 | Phone battery | Per hour watching, per hour hosting, per day idle with the app in the background |
| V8 | Phone mobile data per day | Recorded; feeds card 258 |
| V9 | First pairing of two devices with hundreds of chats | Progress shown; app stays usable; time recorded |
| V10 | Memory and start-up cost added to the app | Recorded; within `.claude/rules/performance.md` |
| V11 | Hidden history growth with the 2 s wait and two hosts | Recorded over a week |

**Experience** (the context-free UX tester in `scripts/ui-review/ux-tester.md`, then Destin):

- The everyday case: leave home with the computer asleep, continue two chats on the phone,
  one with its project and one talk-only, come home, bring them back. Is every step
  understood without help?
- Does a first-time user pair two devices without instructions?
- Is each notice understood, and is the stacked notice readable when four rows apply?
- Does talk-only confuse the assistant about files it described earlier?
- Do "both copies kept" files get noticed and understood when two hosts edit one project?
- Does a watcher on a desktop understand why image paste is refused?
- Is "Relay full" understood?

**Correctness to keep watching after launch.** Any non-append transcript event; any "two
versions" not caused by a real offline split; any repeat of a git clash; any chat present on
one device and absent from the list on another.

---

## 11. Risks, in order of concern

1. **Git between equal devices** (5.7). Mitigation: T4 first; the keeper's compare-and-swap as
   the normal path.
2. **Claude Code is someone else's product.** Its file layout, resume behaviour and hooks can
   change. Mitigation: seam S1 isolates it; T2 and T3; the watch list in
   `youcoded/docs/cc-dependencies.md`.
3. **The switch-over is one-way per user** (Phase 7). Mitigation: rehearse on copies of
   Destin's four devices; keep the one-time restore.
4. **The everyday case without a super-host** is the weakest experience: host offline,
   project often not fetchable. It is as decided; watch it in the UX test and bring results
   to Destin.
5. **Phone as host**: Android may still stop a long reply. Mitigation: the opt-in exemption;
   measure V7.
6. **Relay cost and abuse with no account.** Mitigation: limits in 5.6; V6; sign-in held in
   reserve.
7. **Security claims.** Mitigation: section 7 reviews; careful wording.
8. **Unslimmed GitHub growth until the backup rebuild.** Mitigation: keep the gap short.

---

## 12. Cards

64, 98 (growth; GitHub fresh start waits for the backup rebuild), 119, 121 (backup faults),
125, 127 (five known sync problems), 241 (cloud backup choices), 242 (alerts on every
device), 243 (versions screen), 248 (assistant setup sync), 253 (YouCoded-hosted backups),
258 (mobile-data setting).

---

## 13. Not decided

| # | Item | State |
|---|---|---|
| P1 | Quit warning rework (2.6) | Proposed 2026-11-13; awaiting Destin |
| P2 | Which device backs up, and no storage setting for one-device users (2.2, 2.10) | Proposed 2026-11-13; awaiting Destin |
| O1 | Reaching a super-host from outside: Tailscale, tunnels or the router method; locking its browser view | Comparison owed to Destin before Phase 8 |
| O2 | Payment | Destin: decide later; free at fixed limits for now |
| O3 | A later plan for the 2026-11-05 conflict copies | Left alone by his word |
| O4 | Removing a device on a desktop that has no OS unlock | Needs Destin if T11 finds such a platform |
| O5 | Outside security review before the headline claim | Proposed; needs Destin |
| O6 | When the relay erases a device set nobody has used | Needs Destin |
| O7 | Interim period: GitHub upload is unslimmed and grows | Known; accepted by the build order unless he says otherwise |
