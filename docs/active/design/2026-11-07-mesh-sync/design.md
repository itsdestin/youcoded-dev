---
status: draft
date: 2026-11-10
topic: Chats on every device (YouCoded Mesh) — the design, written from Destin's answers
related-cards: 64, 98, 119, 121, 125, 127, 241, 242, 243, 248
---

# Chats on every device — the design (draft for Destin's read)

Every rule here comes from an answer Destin gave. The source is in brackets: "D4 Q-6" means
deck round 4, question 6; "chat" means a dated chat message. `README.md` in this folder holds
the quotes. Where I had to fill a gap myself, the line starts with **My reading** so it can be
struck. Nothing here is built. Build order is not part of this document.

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
- **The host never changes by itself.** It changes when you tap the chip, or when the host is
  offline and you tap Continue here. [D1 Q-5, Q-15]
- **You can start a chat on one device that runs on another.** [D4 Q-15]
- **The phone is a full host,** equal to a computer. Features it still lacks are named in the
  notice until they are built. [D1 Q-1, Q-11; D2 Q-7]

## 3. How a chat travels

- **One copying system.** The host sends each new line as it is written. A device that was
  away asks for "everything after the last line I have". [D4 Q-1]
- **Checked fact:** chats only ever grow. In 25 sampled Claude Code chats on Destin's desktop
  holding compactions, every earlier line was still in the file; native chats add a marker
  line when they compact. So "everything after line N" is safe for both.
- **What travels with a chat:** its lines, plus the files saved for that one chat: each
  helper's working file, long outputs the assistant saved, and the chat's plan and to-do
  list. A chat active in the last 48 hours is complete on every device. An older chat fetches
  those files when it is opened on a device; if the only device holding them is off, the
  notice says the helpers' reports are kept but unfinished helper work cannot be continued.
  Pasted images and undo history do not travel. [D8 Q-1]
- **The assistant's setup does not travel** in this design (skills, plugins, connected
  tools, global instructions). Card 248. [D8 Q-2]
- **Everything is locked end to end.** Only your devices can read it. [D2 Q-2]
- **A new device joins by pairing with one you already have.** No account is needed for sync;
  our relay may ask for a sign-in to stop abuse. [D4 Q-4]
- **Devices on the same wifi talk directly,** with the same locking as every other path, so
  home use needs no relay. Others on a shared wifi can see that a YouCoded device is there,
  nothing more. This path needs its own security review before release. [chat 2026-11-11]
- **A home super-host is reached from outside** through our relay by default, or through the
  user's own front door. [chat 2026-11-11]
- **Removing a device locks it out** and frees the chats it was hosting to be continued
  elsewhere. [D4 Q-9]

## 4. Keepers: what holds lines while devices sleep

A keeper is something always on that holds locked lines it cannot read.

- **Both kinds are offered:** an optional YouCoded relay, and your own always-on device (a
  desktop left on, a Mac mini, a Raspberry Pi). [D4 Q-2]
- **The relay is built first.** A home device cannot be reached from outside the home without
  something in the middle, so the relay is needed either way. [D5 Q-1]
- **The relay is a waiting room, not an archive.**
  - It holds a chat's lines until 48 hours after the last line was added to that chat. An
    active chat stays fully held. [chat 2026-11-10]
  - Lines are deleted sooner, once every device has them.
  - It holds at most 1 GB per user. [chat 2026-11-10]
  - Anything older, a device gets from your other devices when both are on.
  - It keeps, with no time limit, one small note per chat: the latest line number and which
    device has it. No words of the chat. So a device knows for certain when it is behind.
    [D7 Q-1]
  - At 1 GB it releases whole chats, least recently used first. The host shows: "Relay full.
    3 older chats will reach Phone when both are on." Nothing is lost. [D7 Q-3]
- **Catching up.** Whenever two of your devices are on together they compare every chat and
  the one ahead fills in the other. Any device can do this, not only the host. [D7 P-1 as
  described; Q-1]
- **A device known to be behind** can still read the chat as far as it has it. Continuing
  there is allowed under an honest name: "Continue from here as a new version". [D7 Q-2]
- **A device not seen for 30 days** triggers a one-time prompt on your other devices offering
  to remove it. Nothing is removed without a yes. [D7 Q-4]
- **Your own device as keeper is a super-host:** a complete YouCoded with no window, on a
  device at home. It pairs like any device, holds every chat and project with no time or
  size limit, hosts chats, catches devices up, passes live words, and opens in a browser. It
  holds your keys, so it must be hardware you trust. [D7 S-1, Q-5]
- **Payment** is undecided; the relay is free for everyone at the fixed limits. [D7 Q-8]
- **Cost of the relay** (estimate from Cloudflare's price list and a guessed usage, not
  measured): free today and up to a few hundred heavy users; about $25 a month at 1,000.
- **Cloud backup is separate and later.** The user will choose whether chats are backed up to
  a cloud at all and whether that backup is passphrase-locked. Card 241. [D4 Q-3]

## 5. When the host goes away

**Staying awake.** A computer holds itself awake while a reply it is running is unfinished,
and lets go when it ends. Closing a laptop lid still sleeps it. [D4 Q-5]

**A phone as host.** The phone stays awake for each reply with the screen off. A setting,
off by default, exempts the app from Android's battery limits for users who host from the
phone; it explains the battery cost. [D6 Q-3]

**Closing the host.** [D4 Q-6; D5 S-1]
- The normal close menu appears. You set flags or mark chats complete.
- A chat marked complete closes on every device.
- Otherwise the app quits at once, as long as every finished reply has reached your other
  devices or a keeper. It does not wait for a running reply; that half is dropped.
- The chat stays in the list on other devices: host disconnected, host it here?
- Closing while offline still quits, and says: "Offline - some chats may not have synced."
  [D5 Q-5]

**Taking over.** [D1 Q-8, Q-9; D2 Q-6; chat 2026-11-10]
- Tapping Continue here adds a divider to the chat, built like today's "Model switched to …"
  divider: "Now hosted on Phone". You see it, and the assistant can read it.
- The unfinished reply is dropped. The chat carries on from the last finished one.
- When the old host returns, it reads the divider, knows it is no longer the host, and
  discards its unfinished half.
- A host waking from sleep checks for that divider before letting a reply carry on.
- Files an unfinished reply had already changed stay changed; the notice says so.
- YouCoded keeps the divider beside Claude Code's own chat file, never inside it.

**With no connection at all,** Continue here still works, with a warning. [D5 Q-4] This is the
one case where two versions can arise; see section 7.

## 6. The Continue here notice

More than one can apply; they stack in one notice. [D5 N-1 to N-10; chat 2026-11-10]

| Situation | What it says |
|---|---|
| You tap the chip, host is on | "Host this chat on this device instead of Desktop?" The switch waits for a running reply to end. |
| Host off, nothing missing | "This chat was hosted on Desktop, which is offline. Continue here?" |
| Host went off mid-reply | "Desktop went offline partway through a reply. If you continue here, that unfinished reply is dropped and the chat carries on from the last finished one." Plus: files it already changed stay changed. |
| This device may be behind | "Desktop is offline and may have newer messages or files than this device. Continuing here could create a second version." |
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
- **Deliberate forks are equals,** grouped together in the resume browser. [D2 Q-12; D1 Q-7]
- A better screen for managing versions is card 243. [D5 N-10]

## 8. Project files

- **Files travel on the same system as chats,** locked, through the same keepers. GitHub
  becomes an optional backup. [D5 Q-6]
- At takeover the files and the chat arrive together.
- Each device keeps replaced versions for 30 days. The same file changed on two devices shows
  as two versions to pick from, never a silent overwrite. [D5 Q-6, as described in the option
  chosen]
- Huge and generated folders are skipped, as today.
- This is the biggest and riskiest piece: a mistake here could damage project files, so it
  needs the most testing.
- **My reading:** sync is turned on per project per device (from D5 N-5), while every project
  is still listed on every device (D2 Q-8).

## 9. A device watching a chat

- It has the same limits a phone has today: no assistant browser, no Office documents, no
  image paste, no dragging files in. [D4 Q-14]
- The limits are kept in one central list, and each shows: "X is not currently supported from
  a remote client." [D5 S-4]

## 10. Alerts

Today's in-app notifications are enough for this work. Alerts across devices and customisable
notifications are card 242. [D4 Q-13; D5 S-6]

## 11. What gets replaced

Today's remote access is replaced inside the apps: no Connect screen and no Tailscale for
chats. The open-in-a-browser view stays, still through Tailscale; it is also how a super-host
is looked at. [D8 Q-3]

Chat sync through GitHub stops when the new system arrives. Existing chats need no moving,
because each device already holds its copies. The GitHub copy is left untouched, and a
one-time message says what changed. [chat 2026-11-11]

There is no self-run relay. Self-hosting means running a super-host. [D8 Q-4]

The current handoff and takeover code (about 1,600 lines) is replaced, not patched. The
conflict copies from November 5 are left alone. [D1 Q-16, Q-17; D2 S-4]

## 12. Still open

2. Never asked: how the 30 days of replaced file versions are shown to the user.
3. Owed: a plain comparison of Tailscale, tunnels and the router method, for the "own front
   door" setup.
4. Never measured: real relay usage per user; whether YouCoded runs on a Raspberry Pi.

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
