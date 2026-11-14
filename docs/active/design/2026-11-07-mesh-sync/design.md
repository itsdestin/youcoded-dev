---
status: draft
date: 2026-11-14
topic: Chats on every device (YouCoded Mesh) — the design, for a builder with no prior context
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248, 253, 258
code-read-at: youcoded e73b41347, wecoded-marketplace 830ff8e
---

# Chats on every device (YouCoded Mesh)

## 0. How to use this document

This is what to build, how the parts fit, and in what order. No application code has been
changed yet.

- **Section 2 is decided by Destin Moss, the product owner.** Do not change anything in it
  without asking him. Where each rule came from is in `decided-sources.md`; his exact words
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
  Claude Code chats a block at a time.
- The host never changes by itself. It changes when you tap the chip, or when the host is
  offline and you tap Continue here.
- You can start a chat on one device that runs on another, if that device is on. Devices
  that are off or asleep are greyed and marked "offline".
- A phone that is not in use shows as offline to your other devices and catches up when
  the app is opened.
- The phone is a full host, equal to a computer. Features it still lacks are named in the
  notice.
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
  Every chat is listed either way. A user with one device has no such setting.
- "Recent" means used in the last 30 days. Such a chat is whole on every device, extras
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
- Not carried: undo history; the device's scratch copy of pasted images; the assistant's
  setup (skills, plugins, connected tools, global instructions; card 248).

### 2.4 Pairing, devices and security

- Everything that syncs is locked so only the user's devices can read it. A keeper can
  still see how many devices and chats there are, their sizes and when they are active;
  the product must not claim otherwise.
- A device joins only by pairing with a device already in the set. No account is needed.
- Pairing: scan a QR code, or type a short code when there is no camera. The code expires
  after a few minutes. The device already in the set shows the new device's name and asks
  "Add this device?" before anything is shared.
- Adding and removing a device both need the acting device's own unlock (fingerprint, PIN
  or password). Other devices show "Laptop was added by Phone".
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
- If every device is lost at once, chats without a cloud backup are gone for good.
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
  with no limit, hosts chats, catches devices up, and opens in a browser. It holds keys.
- With a super-host the relay stores nothing for that user, except while the super-host
  cannot be reached; the user can switch that fallback off.
- Away from home, a super-host syncs through the relay by default, or through the user's
  own front door (open, O1).

### 2.6 When the host goes away

- **Awake.** A computer holds itself awake while a reply it is running is unfinished, for
  at most 2 hours per reply. Closing a laptop lid still sleeps it.
- **Phone as host.** The phone stays awake for each reply with the screen off. A setting
  the user opts into exempts the app from Android's battery limits and explains the cost.
- **Sleep.** Nothing special is sent, because every line was sent as it was written. On
  waking, the host checks it is still the host before a reply does anything further.
- **Quitting the host.**
  - The normal close menu appears (flags, mark complete).
  - The app quits at once provided every finished reply has reached another device, the
    relay or the super-host. It never waits for a running reply; that half is dropped.
  - Unsent project file changes are sent first, for a few seconds at most.
  - If anything is left, or the device is offline, it quits anyway and says: "Offline -
    some chats may not have synced."
  - A one-device user never sees that line. With no relay, no super-host and the other
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
stay, with no archive prompt.

### 2.8 Project files

- Files travel on the same locked system as chats, through the same keepers.
- The hidden version history each synced project already keeps
  (`<project>/.youcoded/sync.git`) stays as the version store. Only the carrier changes:
  device to device, in place of GitHub.
- A project is listed everywhere and downloaded to a device when sync is turned on for it
  there. If the only device holding it is off, it cannot be fetched until that device is on.
- Changes go out about 2 seconds after the last edit (15 today); a burst is one send.
- The moment a project's files change, the host sends its note.
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
  is off on that device and every user's backup, whichever service, is one-way. All
  syncing between devices goes through the new system. A one-time message says what
  changed.
- GitHub's one-time "restore to a new device" keeps working until the backup rebuild.
- When devices that already share chats through GitHub are paired, they are combined
  quietly where one copy is simply longer; real differences are listed once, together.
  Projects already synced through GitHub are recognised as the same project without asking.
- A user with one device is asked to set up a backup or to say plainly they want none.
  Until the backup rebuild only a GitHub backup can be restored; the app says so.
- Alerts across devices are not part of this work (card 242).

### 2.10 Cloud backup (built after the mesh, with its own design)

Decided so far: one backup feature (Google Drive, iCloud or GitHub; same contents, same
restore; never a YouCoded server). It holds everything, with switches for chats, the
assistant's setup and each project. Unlocked by default, with a passphrase lock available
and this confirmation: "This backup is not locked. Anyone who gets into your Google account
can read your chats and files. Lock it with a passphrase instead?" ("Lock it" / "Back up
without a lock"). A new device offers pairing or restoring. It sends only what changed, as
often as each cloud allows and at least daily; a phone waits for wifi and charging. Any
device may back up; the screen names chats never yet backed up ("212 chats are not backed
up yet. They are on Desktop."). Backups leave out pictures and duplicate file text; sync
never does. Open: making every backup choice work on every device (O10).

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
  (`ipc/session.ts:406, 466`). The remote door already has a second way in: `serveRemoteChannel(…, {owner:
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
   how far behind its durable copy is.
2. **The chat store is the truth; runtime files are working copies.** Claude Code and the
   native runtime keep writing their own files as today. On the host an adapter copies each
   new line into the store. The store always holds its own bytes, on every device,
   because Claude Code deletes old transcript files (`cleanupPeriodDays`). On other devices
   no working file is read. A device that becomes host writes a fresh working file from
   the store. A device that stops being host never touches a working file a process might
   still be writing; it is replaced the next time that device becomes host.
3. **Nothing is deleted or merged on a guess.** Hash chains decide whether one copy
   extends another. One pure function over the control log and roster decides who hosts.
   Lines that might be an abandoned half reply are set aside until the device that wrote
   them says what they were. When no single answer exists the result is "two versions",
   shown to the user.
4. **A split in the record is not a split in the chat.** Two devices may both write "I am
   the host". That is two versions only if their lines differ. If one copy is a longer or
   equal copy of the other, it is one chat.
5. **A keeper is never the only copy and never the authority.** A device does not clear
   its copy of anything until another device has it (a super-host is a device). What a
   keeper says is checked against device signatures, and no outcome depends on what
   reached a keeper first.

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
   listed once as two versions.
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
   - Finished replies the phone never had: a second version; "two versions" row on both.
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
   the phone signs or sends beyond the furthest of these is void everywhere.
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

- **Identity.** The existing per-machine id (`getMachineIdentity`, `main/device-identity.ts`).
  The roster and relay see a one-way hash of it, so a device set cannot be tied to an
  analytics record. That id is empty where the built app never ran, so the test rig (T1)
  assigns its own.
- **Keys.** Each device creates a signing key pair and a key-agreement key pair on first
  run, stored with `safeStorage` (desktop) or the Keystore-backed shim (Android).
- **Set secret.** 32 random bytes made by the first device. Frames are sealed with keys
  derived from it. It reaches a new device only during pairing, sealed to that device.
- **Generations.** A removal creates the next generation, sealed separately to each
  remaining device. Frames name their generation; devices keep old ones to read old
  frames, and a newly paired device is given every generation still in use. Secrecy from a
  removed device begins with the first frame sealed under the next generation.
- **Signing.** Every durable frame, forwarded call and device-to-device acknowledgement is
  signed by its sender.
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
  - Two devices removing each other: the one in the set longer stands.
  - Two generations made at once: the remaining device with the lowest id makes one more.
  - A removed device paired again gets a fresh `add`, which stands.
- **Reinstalling.** If the app's data survives, the machine keeps its id and keys and
  nothing changes. If the data was wiped (always, after an Android uninstall) it is a new
  device; the old entry goes by removal or the 30-day offer.
- **Unseen for 30 days.** Each device notes when it last heard each other device; at 30
  days the others show the one-time offer.
- **Unlock** for adding and removing: Android `BiometricPrompt`; macOS Touch ID or
  password; Windows Hello; a polkit prompt on Linux. A desktop with none is O4.
- **Library.** An audited one; no home-made cipher. Node's `crypto` covers X25519, Ed25519,
  HKDF and ChaCha20-Poly1305. The typed code needs a password-authenticated key exchange,
  which Node lacks (T5).
- **Duplicates** are recognised by `(sender, session, counter)`; `session` is random per
  start and saved with the counter.
- **No frame body is ever logged.**

**Pairing.**

- The QR carries the meeting point, the existing device's key fingerprint and a one-time
  secret. The typed code carries the meeting point and a short secret for the
  password-authenticated exchange.
- Failed attempts are counted on the existing device, not by the relay; the code burns
  after three. The relay is only a pipe here and is assumed hostile.
- The meeting point is on the relay, or on the local network once same-wifi exists. It
  stores nothing and is separate from using the relay as a keeper.
- **Joining two sets.** The pairing device joins the other set in the ordinary way. It
  then signs an `add` for each of its former companions (it holds their public keys) and
  leaves each a sealed message, in the old set's mailbox and directly when they meet: "we
  have joined this set; here is its secret and roster". A companion that was off moves
  over when it next comes on. Data combines by the usual rules.
- **Leaving.** A device can remove itself. An empty roster is erased by the relay after a
  delay.

### 5.2 Link layer and presence

Three paths, tried in this order: same-wifi direct; super-host; relay. A frame is
byte-identical on all three. One connection per path per device.

- **Same-wifi direct.** Devices announce themselves on the local network and connect
  straight to each other. The announcement reveals only presence. A peer is checked
  against the roster before any frame is accepted or served. No local discovery exists in
  the app today; Android needs a multicast lock (T6).
- **Presence.** A device is "on" for another when a heartbeat arrived recently on any path.
  Offline means 30 seconds with no heartbeat and a failed reconnect on every path. If the
  host reappears before the user answers a notice, the notice is withdrawn.
- **A phone is "on" only while the app is in front, or it is hosting a running reply, or
  the battery exemption is enabled.** Android cuts a backgrounded app's network and there
  is no push channel (T18).
- **Clocks.** The relay's clock times its 30-day rule. Control entries are ordered by what
  they have seen. Correctness never depends on comparing two devices' clocks; only two
  display matters do (which version is "older", and whether a chat is "recent").

### 5.3 Chat store and copying

**Which chats.** Every transcript the app tracks today: Claude Code files under
`~/.claude/projects` (including ones started in a terminal) and native files under
`~/.youcoded/sessions`.

- **A chat the app does not run** (started in a terminal) is listed and copied, but the app
  cannot stop its process. It can be taken over only when its host is offline. Whatever
  its process finishes after a takeover becomes a second version. If it is reopened from a
  terminal on a device that no longer hosts it, the app's hooks tell that session "this
  chat is now hosted on Phone".
- **A chat that ran in a folder that is not a synced project** can only be talk-only
  elsewhere (O16).

**Identity.**

- `chat id = provider + ":" + the runtime's session id`. `--resume` keeps the id and file.
  `/clear` in Claude Code starts a new id: a new chat.
- A chat has one or more versions. The main version's id is the chat id. Other ids are
  computed the same on every device: `SHA-256(chat id ‖ winning host entry ‖ losing host
  entry)` for an accidental split; `SHA-256(chat id ‖ takeover id ‖ "tail")` for finished
  replies found in a tail; `SHA-256(chat id ‖ fork entry id)` for a deliberate fork.
- A version stores its own lines from the split point and reads earlier ones from its
  parent, unless Claude Code's fork rewrote them (T3), in which case it stores them all.
- When a non-main version is first hosted, the runtime gives it a session id of its own
  (Claude Code's fork-on-resume); a `bound` entry records it.
- Each version is its own list row, grouped with its relatives.

**The store** lives under the app's data folder, never in a synced space. Per version:

- Lines in segments. A new segment starts only when the host's adapter reports the runtime
  rewrote or shrank its file; it is the whole chat again from line one. The old segment is
  kept on the host for 30 days.
- A hash chain per segment: `h[0] = SHA-256(version id ‖ segment)`,
  `h[n] = SHA-256(h[n-1] ‖ raw bytes of line n)`. Chain values are kept even when a line's
  bytes are evicted.
- An index of reply ends, from each runtime's own end-of-reply marker (the event the app
  treats as `turn-complete`).
- The head, the control log, the latest summary, and a manifest of extras.

**Copying.**

- The host sends each new line as written, to every online device and the keeper.
- Control logs are exchanged before lines, always. Lines for a deleted chat are neither
  requested nor accepted.
- A device asks any peer or the keeper: "version V, segment S: I have N lines ending in
  hash H". Answers: the lines after N; `gap`; `moved` (a newer segment exists); or
  `not-a-prefix`. Any device can answer.
- Lines join the chain only when they connect to it; lines with a hole before them are
  parked. A device acknowledges only "everything through line N, without holes".
- When two devices meet they exchange a table of heads for every chat.
- **`not-a-prefix` is never settled by guessing.** The device re-hashes its own bytes; if
  they no longer match its chain, the copy is damaged: set aside and recopied. Otherwise
  the control log decides: an old host's tail, or a second version. If the log explains
  nothing, a non-host sets its copy aside, recopies from the host, and records a
  diagnostic.
- Order: control logs and summaries; lines, most recently used first; extras last.
- Finished extras (saved outputs, the plan) move by content hash. Helper working files
  grow, so they are copied like lines ("everything after byte N") and sent when a reply
  ends.

**Extras, by location** (confirm in T3):

| Extra | Claude Code chat | Native chat |
|---|---|---|
| Helper working files | `<slugdir>/<sessionId>/subagents/` | Child session files with `parentSessionId` |
| Saved long outputs | `<slugdir>/<sessionId>/tool-results/` | `specialist-reports/`; Bash overflow is in the temp folder today and must move somewhere durable |
| Plan | The file in `~/.claude/plans/` named in the chat's lines | In the chat's lines |
| To-do list | `~/.claude/todos/` entries for the session | In memory only today |

### 5.4 Control log and host control

The control log is a set of signed entries per chat (shapes in 6.2). Each entry lists the
entries its author had seen, so the log's meaning never depends on arrival order or clocks.

**`decide(entries, roster)`**: pure; the same answer for the same entries in any order;
answers per version.

- **Order.** An entry that had seen another is later. Otherwise they are concurrent.
- **Void.** Entries from a removed device beyond the cut-off.
- **Host.** Follow the host entries (`claim`, `takeover`); the latest hosts. If that
  device is removed, the version has no host and any device may take over.
- **Concurrent host entries.** A device holding the longer copy checks whether the other's
  stated head lies on its chain and appends a `relation` entry. Until then the answer is
  `pending`: the chat shows its last known host and behaves as before.
  - One copy is a prefix of the other: one chat; the author of the longer copy hosts.
  - Identical copies: a `claim` marked as last run on its device hosts; otherwise the
    lower entry id.
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

**Takeover reasons.** `chip`; `host-offline`; `host-removed`; `no-connection`. A takeover
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

A device holding fewer tail lines than `released` names fetches the rest; one holding more
or different lines refetches. If the previous host is removed without speaking, the
remover appends `released` on its behalf.

**Becoming host** (`becomeHost`): make sure lines to the takeover point and the extras are
in the store; replace the working file from the store, keeping any old one aside (for
Claude Code, `~/.claude/projects/<ccProjectSlug(local folder)>/<runtime id>.jsonl` plus
its extras; `resolve-local-project.ts` maps the chat to a local folder); resume. A crash
at any step is safe: the log still says this device hosts, and the steps run again.

**Chip switch while the host is on.** The old host waits for a running reply to end (the
tapping device shows it is waiting and can cancel), then fences the chat, on disk: it
refuses forwarded messages with "handed over". It replies with its last reply end; the
takeover names that point, so there is no tail.

**Talk-only.** The chat runs in a scratch folder under the app's data folder with
file-writing and command tools switched off (Claude Code's tool restrictions; the native
runtime's binding). A `talk-only` entry is appended. Back on a device with the project it
resumes in the real folder.

**The divider and the notes to the assistant.** The renderer draws the divider from the
takeover entry, reusing the model-switch marker (`MODEL_SWITCH_MARKER`,
`renderer/state/transcript-event-actions.ts:361`) with the takeover's id. The assistant is
told at the next message: native chats get a transcript event; Claude Code chats get the
note as hook context on the next prompt, so nothing is written into Claude Code's file.

**Summary.** The host appends a `summary` at creation and at most once per finished reply;
only the latest is kept. The chat list is drawn from summaries and `decide`.

**Names and flags.** `renamed` (the user's choice) beats the summary's title and replaces
`Personal/ConversationNames/`. Existing names and flags are converted at the switch. Tags
stay where they are. A `complete` flag reaching the host closes the chat there.

**Deleting.** A `deleted` entry, also held in a never-expiring `del:` register on the
keeper. The host stops any running reply. The deleting device tells the relay to drop the
version's waiting lines. Each device removes the body 30 days after the later of the
entry's time and the moment it first saw it, and keeps the entry. A device returning with
unsent lines for a deleted chat keeps them in its own Recently deleted and sends nothing.
Until the backup rebuild, a deleted chat stays in the GitHub backup's history.

### 5.5 Watching: session router and proxy

- In the main process a **session router** inspects each session-scoped call. A local chat
  goes to `SessionManager` or the native host. A chat hosted elsewhere goes to a **session
  proxy**, which forwards the call to the host and republishes the host's events for that
  chat on the same local channels. The renderer is unchanged apart from the chip and the
  capability limits.
- **On the host** forwarded calls are served by `serveRemoteChannel` with `door: 'remote'`
  and a new `peer` field. Each paired device gets an audience id in a new range. One new
  flag on channel entries, `peerAllowed`, says whether a paired device may call it. (A
  literal third door would touch 29 handler sites.)
- Opening a watched chat uses the existing fill path (`session:open`): a snapshot, then
  numbered live events. A gap triggers a fresh snapshot.
- **Capabilities become per chat.** A watched chat gets the remote-screen set
  (`shared/capabilities.ts`); refused features stay listed in
  `renderer/remote-unsupported.ts`.
- **Permission prompts** have unique ids. The host accepts the first answer for an id and
  tells later answerers it is settled.
- **A message typed on a watcher** is a signed call carrying a call id, the host entry it
  was aimed at, and the number of the last heartbeat received from the host. The host
  refuses a call aimed at a superseded host entry, or naming a heartbeat more than a few
  beats old by its own count. It remembers call ids on disk for longer than that window.
  The watcher shows "sent" when the host confirms the line; otherwise the box keeps the
  text. Live events name their host entry; a watcher ignores a superseded host's.
- **Starting a chat on another device** is a forwarded `session:create` naming a project
  that device has downloaded.
- **Version mismatch.** A watcher too old for the host's live protocol shows the chat from
  the durable lane as lines arrive and cannot type into it.

### 5.6 The relay

One Durable Object per device set, named by a hash of the first device's public key.
Operations are in 6.4.

1. **Authenticate** by a signed challenge against the public roster. The room comes from
   the authenticated key, never from an id the client sends.
2. **Pass through** frames between connected devices: not stored, not counted.
3. **Hold** durable frames in groups: one per chat version, one per project, one mailbox
   per device.
   - Each device tells the relay how far it has received each group; a frame is dropped
     once every roster device has. A "recent" device says so for a chat it does not want.
     For a project only devices that have it downloaded count. This is separate from the
     signed acknowledgement between devices, which is the only kind that permits eviction.
   - A chat's group is dropped 30 days after its last line.
   - At 1 GB it releases whole groups, least recently used first, never the group being
     written while another remains. Every release is announced and kept as a mark on the
     group, so the writer treats those lines as undelivered again.
   - Never held: a project's first full download, or any group larger than the limit.
   - A signed "drop this group" from a roster device empties it at once.
4. **Registers**, with no time limit, changed by compare-and-swap: per version `head`,
   `host`, `del`; per project `tip`. Values are sealed and signed by the device that wrote
   them. One call returns all of a set's registers.
5. **Presence.**

Also: pairing meeting points; roster updates; erase after 90 idle days or an empty roster.

- **With a super-host** devices send durable frames to it and use the relay's `hold` only
  while it is unreachable and the fallback is on.
- **If the relay misbehaves** it can delay, withhold or replay an old register. It cannot
  read, forge or alter anything. A device never accepts a head older than one it has seen.
  The worst outcomes, a device wrongly thinking it is up to date or two devices both told
  they reserved the host role, are caught when devices exchange control logs.
- **Limits with no account:** new sets rate-limited per network address; 1 GB and a frame
  rate per set. During the build only an allow-list of test sets is accepted.
- **Cost:** free plan today. Live words are batched about every quarter second. Large
  frames may belong in Cloudflare's object storage with the Durable Object as index (T7).

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
    other becomes `name (from <device>, <date>)`, with device and date read from the
    commit that made it, never from the merging device;
  - one edited, one deleted: the edit is kept;
  - both renamed the same file differently: both names are kept;
  - merge commits use a fixed author and message, the later parent's date, and parents in
    a fixed order, so two devices merging the same histories produce the same commit.
  This changes `GitTransport`'s conflict code and its "remote-wins" contract test.
- **Sequencer, for traffic only.** Devices send to one place first when they can: the
  keeper's tip register, else the lowest-id online device. Correctness does not depend on
  it.
- **Safety.** Upload the bundle, then change the tip. Adopt a tip only if it connects to
  local history; otherwise the project is "diverged" and nothing is merged (except at
  pairing, on the user's "same project", and for the Personal space, which is always
  combined). Cut bundles from the oldest tip any device has acknowledged; if an earlier
  bundle was released, fetch straight from a device. Retry with random back-off.
- **If T4 fails:** one fixed sequencer per project, files moving only while it is on. That
  changes what users experience and goes to Destin first.
- **The note** is the tip register plus the number of commits in the tip's history.
- **Project id** is minted at creation and stored in the registry record. Two folders are
  the same project when their histories share a root commit; when the user says two
  unrelated folders are the same, the lower id stays and the other becomes an alias.
- **Listed versus downloaded.** Which projects are downloaded is a local per-device set,
  replacing download-everything in `materialization-planner.ts`. Projects already on a
  device at the switch stay. A newly paired device starts with none.
- **The wait** is about 2 s for the mesh carrier (`engine.ts:142`).
- **The Personal space** (project registry, tags, Pages) rides this carrier.
  `Conversations/`, `ConversationNames/`, `Handoffs/` and `Devices/` stop being written.

### 5.8 Storage policy

- "Recent": lines and extras of chats not used for 30 days may be evicted; the summary,
  control log and chain values stay.
- Never evicted: a chat hosted here; any line no other device has acknowledged. The
  relay's acknowledgement does not permit eviction, though it counts for the quit rule and
  the "waiting" label.
- "Waiting" means: lines here that neither another device nor a keeper has acknowledged.

### 5.9 Lifecycle

All of this runs only when the switch (7.2) is on, wired in both `main.ts` and
`headless-boot.ts`.

- **Awake per reply.** `powerSaveBlocker` on desktop, capped at 2 hours per reply; the
  existing `keepAwake` host call on Android (already capped at 4 hours).
- **Battery exemption.** A new Android setting the user opts into.
- **Quit.** Compare each hosted chat's head with what a keeper or peer has acknowledged.
  All reply ends acknowledged: quit at once. Otherwise allow a few seconds for project
  changes, then quit and show the line in 2.6.
- **Launch and wake.** Before any hosted chat continues: connect, fetch control logs from
  whatever is reachable, run `decide`. Taken over: stop the process and append `released`.
  Nothing reachable: carry on as host.
- **Holding a reply across sleep.** A reply running when the computer slept carries on the
  instant it wakes, before the network is back. So:
  1. Claude Code already asks the app before each file change or command (the blocking
     hook used for permissions). From the sleep signal until the wake check completes, or
     about 10 seconds pass with nothing reachable, the app answers "wait". The reply may
     produce words but cannot touch a file or run a command. The native runtime is simply
     paused.
  2. Where the operating system allows, the process is also paused at the sleep signal.
  T19 proves the first on every system.

### 5.10 Super-host

- The phone's backend already boots the whole app with no window under plain Node
  (`headless/headless-main.ts`, `headless-boot.ts`, `electron-headless.ts`). A super-host
  is that boot on Windows, Mac or Linux, started at login.
- To generalise: the owner token and secret key arrive on stdin from the Android service;
  secret storage is a shim keyed by that key (a desktop super-host needs the OS keychain);
  `headless-boot.ts:132-134` hard-codes Android; keep-awake has no desktop stand-in.
- It needs: start at login; pairing without a screen (it prints a code, or is paired from
  its browser view); the existing remote server in Tailscale mode as its browser view.
- It is an ordinary roster device on "keep everything".

### 5.11 Versions

Devices exchange app and mesh protocol versions at connect. A `format` entry names the
minimum app version that may host or continue a chat. Unknown entry and frame kinds are
kept and passed on, never dropped.

---

## 6. Contracts and shapes

Engineering proposals, precise enough to write tests from. Field names may be refined.

### 6.1 Seams

| # | Seam | Contract |
|---|---|---|
| S1 | Runtime file → store (source adapter) | `poll(path, state) → {lines[], replyEnds[], state} \| rewritten`. A **line** is the bytes up to and including a newline; a trailing partial line is not ingested. `state` holds byte offset, chain hash, file identity and a hash of the last 64 KiB before the offset; a full re-hash happens only when that cheap check fails. `isReplyEnd(line)` is per runtime. Runs only on the host. Tests: append, partial write, truncate, rewrite, file replaced, 300 MB file polled in under 50 ms when unchanged. |
| S2 | Chat store | `head(version)`; `hashAt(version, segment, n)`; `read(version, segment, from, to) → lines \| evicted`; `append(version, segment, fromLine, lines) → ok \| parked \| not-a-prefix`, idempotent; `setAsideTail(takeoverId, version, fromLine)`, `tail(takeoverId)`, `setAsideDamaged(version)`; `replyEnds(version)`; `controlLog(chat)`; `appendControl(entry) → ok \| parked \| duplicate`; `summary(version)`; `listVersions()`; `hasExtra / readExtra / putExtra(hash)`; `evictBody / restoreBody`. Every write is atomic and survives a kill at any point. |
| S3 | Replicator ↔ link layer | `sendDurable(target, frame) → Promise<Ack>` where `Ack` means the target has stored it durably; kept and retried until then; order kept per group. `sendLive(target, frame)`: best effort; dropped when more than 1 MB is queued for that target. `target` is a device id or `keeper`. `onFrame(handler)`. `presence()` and a change event. |
| S4 | Link layer ↔ relay | Operations and results in 6.4. Tests: a relay built with a shim that records every byte it stores, asserting none decrypts with any key in the test; a static check that the Worker imports nothing from the app's key code; register compare-and-swap under concurrency. |
| S5 | `decide` | `decide(entries, roster) → per version {host \| none \| pending, segment, deleted, name, flags, talkOnly, minVersion}`, plus `versions[{id, from, atLines}]`, `tails[{takeover, fate}]` and `void[]`. Inputs include `relation` and `released` entries, so no line data is needed. Property test: every permutation and duplication of the same entries gives the same output on every device. |
| S6 | Session router ↔ channel table | A `call` frame (6.3) is served through `serveRemoteChannel` with `{door:'remote', peer}`. Host events for the chat are forwarded as `live-event` frames with rising numbers. Parity test: every session-scoped channel is `peerAllowed`, or has a refusal message. |
| S7 | Host control ↔ runtimes | `isReplyRunning(version)`; `stopForSwitch(version) → {replyEnd} \| failed(busy \| gone \| cancelled)`, after which the chat is fenced; `becomeHost(version, uptoLine, mode: normal \| talk-only) → ok \| failed(lines-missing \| extras-missing \| no-folder \| sign-in \| runtime-error)`; `releaseHost(version) → {tailLines, tailHash, lastReplyEndInTail}`, which stops the process if the app owns it and marks the working file stale; the file is never moved while a process may still be writing it. |
| S8 | Project carrier ↔ GitTransport | `GitTransport` runs against `mesh-remote.git` as its remote. The carrier's own interface: `importBundle(bytes) → tips`, `exportBundle(since) → bytes`, `tip()`. The clash rule compares git blob ids. The existing contract suite runs against it with the conflict test rewritten for the new rule, plus T4. |
| S9 | Storage policy ↔ store | `mayEvict(version) → bool` (false when hosted here, when any line lacks a device acknowledgement, or when used in the last 30 days); `ensureBody(version) → ok \| unavailable(holders[])`. |
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
*call         { callId, version, hostEntry, afterBeat, channel, payload }
*call-result  { callId, ok, payload | refusal }
 live-event   { version, hostEntry, n, lineNo, channel, payload }
 beat         { n }                                       // host heartbeat, numbered
 hello        { appVersion, meshVersion, rosterHead }
pairing       pake-1 | pake-2 | confirm | welcome{roster, secretSealed}   // own key, not G
```

`ChatHead { version, segment, lines, hash }`. Tails are stored apart from the version, keyed
by the takeover entry's id, and never appear in a head.

### 6.4 Relay operations

```
auth        challenge → signature                     → ok | not-on-roster
hold        frame                                     → stored{seq} | over-limit
fetch-after { group, seq }                            → frames[] | gap{through}
received    { group, throughSeq }                     // unsealed; lets the relay drop frames
released    { group, throughSeq }                     // relay → devices; also kept per group
reg-get     { key } | reg-list                        → { key, value, token }[]
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
| `main/ipc/` | A `mesh` channel family; `peer` context and `peerAllowed` in `channel-table.ts` | Delete `handoff.ts` and the `HANDOFF_*` channels |
| Renderer | Host chip, the notice, Devices and pairing, storage setting, delete and Recently deleted, project "sync on this device", keeper settings, "Check sync". Hidden while the switch is off. | Delete the pending-handoff views, `resume-lease-gate.ts`, `takeover-dialog-copy.ts`, the MovedGate |
| Remote access | — | Remove the Android "Connect to Desktop" screen and desktop "Remote access" pairing for app use. Keep `RemoteServer` in Tailscale mode for the browser view and in local mode for the Android app's own screen. |
| `main/sync-spaces/` | The mesh carrier; per-device downloaded set; 2 s wait and the new clash rule, for the mesh carrier only | Stop GitHub pull; exclude `Conversations/`, `ConversationNames/`, `Handoffs/`, `Devices/` |
| `main/session-manager.ts`, native host | Seam S7; awake per reply; the hold across sleep | `stopSessionForHandoff` |
| `main/main.ts`, `headless/headless-boot.ts` | Mesh start-up, quit rule, launch and wake checks, in both | Lease wiring (`main.ts:1014`, `headless-boot.ts:186`) |
| `main/headless/` | Desktop super-host boot (Phase 8) | — |
| Android (`app/`) | Battery-exemption setting; multicast lock. QR scanning exists (`QrScannerOverlay.kt`). | `PairedDeviceStore.kt` for app use |
| Worker | New Durable Object and route, allow-listed | Lease operations in `SyncGroupRoom`, once no shipped version uses them |
| Everything that reads chat files directly | About 26 source files reference Claude Code's chat folder (chat search, the resume browser, transcript paging, the reconciler, slug repair). On a device that is not the host that file does not exist, so each must read through the chat store (T20). | — |
| Docs | — | Rewrite the changed parts of `youcoded/docs/conversations.md`, `sync-spaces.md`, `native-runtime.md` |

### 7.2 The switch

One local setting, off by default, read by both boots. Off: the app behaves exactly as
today; nothing in `main/mesh/` starts; no new screen, setting or lifecycle behaviour is
visible. On, before Phase 7, only in test-rig and dev instances with their own home folder.
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

**Devices that update at different times.** An updated device no longer reads GitHub; one
not yet updated still does. Until all of a user's devices are updated and paired, the two
groups do not exchange new chats or file changes. Nothing is lost: when a late device
updates and is paired, the ordinary combine runs, and a chat continued on both sides
appears as two versions. A not-yet-updated device cannot show the new message, so the
updated device reads the old device registry and names the devices that still need
updating and pairing.

**Rollback** is for the whole release, never one device, and is for emergencies: a later
release turns the switch off, each device writes its store back into
`Personal/Conversations/` (records rebuilt from control logs; deleted chats left out), and
ordinary GitHub sync resumes with its conflict-copy behaviour. Rehearse it in Phase 7.

---

## 8. Security

**Promise.** Contents that sync are readable only on the user's devices. A keeper sees
sizes, counts, timing and public keys. Cloud backup is separate, and locked only if the
user turns the lock on.

**Must be true.**

1. No private key or set secret is written to a synced folder, a backup or a log, or sent
   to any server.
2. A device is accepted only if on the signed roster; a keeper's say-so is never enough.
3. The relay picks the room from the authenticated key.
4. Durable frames, calls and device-to-device acknowledgements are sealed and signed.
   Duplicates are recognised and ignored.
5. Pairing cannot be completed by someone who only controls the relay.
6. From the first frame sealed under the generation a removal creates, the removed device
   can read nothing, and what it signs or sends beyond the cut-off is void everywhere.
7. Same-wifi direct accepts and serves nothing before the roster check.
8. No frame body in any log.
9. A keeper that lies can cause delay or a visible "two versions", never a silent loss or
   a forged line.
10. No device clears its only copy of a line on a keeper's word alone.

**Every paired device is fully trusted.** Any one can add a device, remove the others, and
type into chats on the others, whose assistants can run commands there. The protections
are the unlock on adding and removing, the notice other devices show when one is added,
and the relay's delay before erasing an emptied set.

**Reviews.** A written threat model before Phase 1 is accepted. A dedicated review of
same-wifi direct before it ships. "End-to-end encrypted" may be used from launch on
condition of extensive reviews and audits of our own, based on external best practices:
before Phase 7, the pairing, key and relay code is audited against published standards by
reviewers who did not write it, with findings recorded and closed.

**Limits to state honestly.** A stolen device keeps what it had. A thief holding the
longest-standing device, unlocked, can remove the others. The browser view is protected by
Tailscale only.

---

## 9. Before building: tests and evaluations

**Run first, before anything else, because each can change the design:** T3 and T10 (can
Claude Code continue a chat on another computer), T4 (do project files settle between
equal devices), T19 (can a reply be held across sleep), and T21 (are real copies of a chat
identical).

Phase 0 runs these as investigations, outside the product, on throwaway code. Where a row
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
---

## 10. Build order

The mesh first, the backup rebuild after; the relay before the super-host. Everything
reaches users in one release, at Phase 7. Phases 1 to 6 change nothing for users (7.2).

| Phase | Builds | Destin reviews | Done when |
|---|---|---|---|
| 0 | T1 to T21 as investigations, the five named in section 9 first | A plain report and any decision they force | Each pass line met, or the design amended with his agreement where he can see the change |
| 1. Devices | Keys, roster, generations, pairing (QR and code, relay meeting point, joining two sets), adding and removing with unlock, link layer over the relay, relay (authenticate, pass-through, presence, mailboxes, limits, allow-list) | Devices screen, pairing, removing, the 30-day offer | Three rig devices and a real phone pair; T15 passes; threat model written |
| 2. Chats copy | Chat store, adapters, chains, reply ends, control log (`claim`, `summary`, `renamed`, `flag`, `segment`), replicator, relay holding and releases, registers, storage setting, the chat list, relay on/off | Chat list on a second device (reading only), storage and relay settings | A chat written on A is readable on B in under 2 s, and after B was off a day; inventories match; T2, T14, T16 pass |
| 3. Watching | Session router and proxy, peer context, per-chat capabilities, host chip, permission from any device, signed calls, start on another device, version fallback | Watching and typing into a chat hosted elsewhere | A watcher drives a full reply on a remote host, desktop and phone; parity tests green; T17 passes |
| 4. Project files | Mesh carrier, clash rule, sequencer, tip register, per-device download, 2 s wait, combining projects at pairing | Project list with "sync on this device"; the same-project question | T4 passes; a project edited on two hosts converges |
| 5. Host changes | `takeover`, `released`, `relation`, `version`, `bound`, `talk-only`, `deleted`, `restored`; full `decide`; combining chats at pairing; reservations; seam S7; divider and notes to the assistant; notices; delete; awake per reply; quit rule; launch and wake checks; the hold across sleep | Every notice row, the divider, quitting, deleting | Every row in 2.7 reproduced in the rig, with walk-throughs B to D and a kill between every step of a takeover; T12, T13, T16, T19 pass |
| 6. Same wifi | Discovery, direct path, local meeting point, peer arbiter | Nothing new on screen | Its security review passes; Phases 2 to 5 pass with the relay off |
| 7. Switch-over | Interim GitHub lane, last sync, one-time restore, one-time message, backup prompt, removal of in-app remote access, rollback, the security audit | The one-time message and prompts | Rehearsed on copies of Destin's four devices, updated one at a time: the inventory tool shows every chat once on every device; rollback rehearsed. Then, on his say and with him, a trial on his real devices. Then the release |
| 8. Super-host | Desktop headless boot, start at login, pairing without a screen, relay fallback, outside access (needs O1) | Super-host setup | A super-host keeps two sleeping devices current with the relay off |
| 9. Backup rebuild | Its own design first (cards 241, 98, 121, 253; O10); deletes the interim lane | New Backup screen | Separate acceptance |

Project files (4) come before host changes (5) because several notice rows need project
notes and fetching. Same wifi (6) comes before the switch-over (7) because "no keeper at
all" only works once devices can talk directly.

---

## 11. After building: what to measure

V1 to V5 are thresholds; a miss is a bug. V6 to V12 are numbers reported to Destin with a
recommendation.

| # | Measure | Target or report |
|---|---|---|
| V1 | Word on host to word on watcher | Under 0.3 s same wifi; under 1 s through the relay |
| V2 | Catch-up after a device was off | 1 MB chat under 2 s; a 300 MB chat completes with the app responsive |
| V3 | "Host offline" | No false notice across 100 wifi blips of under 10 s; a real loss detected within 45 s |
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
- "Relay full", "stored on Desktop, which is offline", and a pocketed phone showing as
  offline are understood.
- A user whose devices update at different times understands the one-time message.

**After launch.** Settings → Devices → "Check sync" compares this device with each
reachable device (the inventory tool from T1) and says plainly whether they match. The app
counts warning signs locally (a rewritten chat file; an inventory mismatch; a repeated file
clash; a parked entry that never resolves; a second version) and includes the counts when a
user chooses to send a bug report.

---

## 12. Risks, in order of concern

1. **Project files between equal devices** (5.7). T4 first.
2. **Claude Code is someone else's product.** Its file layout, resume, forking and hooks
   can change. If T3 or T10 shows a Claude Code chat cannot be resumed on another
   computer, "Continue here" has no mechanism for those chats.
3. **The switch-over.** Devices update at different times, and syncing stops between them
   until they are paired by hand. Day one also depends on copies of a chat that should be
   identical really being byte-for-byte identical (T21).
4. **The everyday case without a super-host.** The host is often asleep, a pocketed phone
   looks offline, and nothing alerts a phone that a chat is waiting for a permission
   answer.
5. **Waking from sleep.** If T19 finds a system where the hold has a gap, a reply could
   act before the check.
6. **Phone as host.** Android may stop a long reply.
7. **Relay cost, abuse and filling up.** One rarely-opened device makes up to 30 days of
   chats pile up toward 1 GB; no sign-in lets anyone park data. T7 reports before the
   limits are treated as fixed.
8. **Every paired device is fully trusted** (section 8).
9. **One release for everyone, hard to undo.** The protection is the Phase 7 rehearsal and
   the trial on real devices.
10. **Start-up wiring exists twice** (`main.ts`, `headless-boot.ts`).

---

## 13. Open

| # | Item | State |
|---|---|---|
| O1 | Reaching a super-host from outside the home (Tailscale, tunnels, router), and locking its browser view | A plain comparison is owed to Destin before Phase 8 |
| O2 | Payment | Destin: decide later; free at the fixed limits |
| O4 | Adding or removing a device on a desktop with no OS unlock | Needs Destin if T11 finds one |
| O10 | Backup choices that work on every device | For the backup rebuild's design |
| O14 | If T4 fails: files move only while one chosen device is on. If T3 or T10 fails: no way to continue a Claude Code chat on another computer | Arise only if those tests fail |
| O15 | The relay's 1 GB, free, no-sign-in terms | Provisional until T7 reports |
| O16 | A chat that ran in a folder that is not a synced project: what "Continue here" says and offers elsewhere | Asked 2026-11-14 |

Three lines in section 2 are the designing session's reading and not confirmed by Destin
(marked in `decided-sources.md`): pictures sent in a chat travel while the scratch copy of
pasted images does not; the product must say a keeper can see counts, sizes and timing; and
the security audit before Phase 7 as the meaning of "extensive reviews/audits of our own".
