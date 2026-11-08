---
status: draft
date: 2026-11-07
for: Destin, answering deck 2 follow-ups Q-1, Q-3, Q-5, Q-9, Q-10
---

# Chats on every device: how devices could connect, and what it costs

Written to answer your deck 2 follow-ups. Numbers marked *measured* come from your desktop
today. Prices are the providers' published rates as of 2026-11-07 (sources at the end).

## 1. Three ways your phone could watch a chat your desktop is hosting

### A. Through a YouCoded server (the "hub")

**What exists.** Every signed-in account already has a private room on our Cloudflare server.
Today it only passes tiny "something changed" notices between your devices.

**What would be new.** The room forwards the chat's words from the host to your other devices
as they are typed, and keeps undelivered words for a device that is asleep (a mailbox).

**What you experience.** Sign in to the app. That is the whole setup. Works on home wifi,
cellular, hotel and office networks.

**Privacy.** With the end-to-end encryption you chose, the server sees only sizes and timing,
never a word of a chat.

**Cost to us.** Correction (Destin, 2026-11-08): the server runs on Cloudflare's free plan today
and costs nothing. Chat words are tiny, so the free plan goes a long way, but not forever:

| Item | Free plan allows | Paid plan ($5 a month) |
|---|---|---|
| Messages into the room | 100,000 requests a day; 20 messages count as 1 request, so 2,000,000 words-chunks a day across all users | 1,000,000 requests a month included, then $0.15 per million |
| Messages out to your other devices | free | free |
| Server time | 13,000 seconds-of-memory a day | 400,000 a month included, then $12.50 per million |
| Mailbox storage | 1 to 5 GB (Cloudflare's own pages disagree) | 10 GB, then $0.20 per GB a month |

A heavy user is 200 replies a day streamed word by word, about 100,000 chunks. Sent one chunk
at a time that is 5,000 requests a day, so about 20 heavy users fill the free plan. Sending a
chunk every quarter second instead (still looks live) cuts that five to ten times, so a few
hundred heavy users fit for free. Beyond that, the paid plan is $5 a month plus roughly 2 cents
per heavy user. Light users round to zero.

**How we could charge.** The app has no payment system today. Choices: keep it free and absorb
the cost (it is pennies per user), add a donation prompt (a Buy Me a Coffee page exists), or
sell a paid tier later through a card processor (needs company accounts and tax handling).

**Self-hosting.** The server code is already open source in the `wecoded-marketplace`
repository. A fork can deploy its own copy to its own Cloudflare account, free at small scale. If
the app gets a "server address" setting, a user can point it at their own copy and need nothing
of ours. Sync itself already works this way: it uses the user's own GitHub repositories.

### B. Over Tailscale (the user's own private network)

**What exists.** The phone can already reach the desktop over Tailscale for remote access.
Desktop-to-desktop is not built. Chats do not stream over it yet.

**What would be new.** Desktop-to-desktop links, word-by-word streaming over the link, and a
way for your devices to find which of them are on.

**What you experience.** Install the Tailscale app on every device, create a Tailscale account,
sign in on each. On Android, Tailscale takes the phone's single VPN slot, so it conflicts with
any other VPN. Free for personal use (currently up to 6 people, unlimited devices, non-commercial
only; secondary sources, check tailscale.com/pricing). A business user pays about $8 per user
per month.

**Cost to us.** Zero.

**Limits.** Live only while both devices are on at the same time. There is no mailbox, so a
device that was asleep catches up only through the slow git upload (section 2) or when the host
wakes. "No central server" is not quite true: Tailscale Inc. runs the coordination service that
introduces your devices, and relays traffic when a direct path fails (encrypted so they cannot
read it). Headscale is an open-source, self-hostable version of that coordination service;
pointing the phone app at it is possible but fiddly.

**Fit.** Matches the "nothing of ours required" dream. Fails "works for everyone": most users
will never install a second app and sign in to a second service on every device.

### C. Direct device to device, introduced by a meeting point

Devices swap addresses through a small meeting point, then talk straight to each other (the way
video calls work). It gets through roughly 80 to 90 percent of home routers and phone networks;
the rest need a relay. Cloudflare's address-finding service is free; its relay costs $0.05 per GB
after 1,000 GB a month free, and chat words would never approach that.

**Fit.** The meeting point is still a server, so this does not remove the server, it only lowers
its load. Since our load is already tiny, the extra work (hard on Android and hard to debug) buys
little. Not recommended now.

### D. Same wifi, directly

Refused on purpose since the Oct 30 security review. Could be reopened later as a speed-up for
devices in the same room. Not needed for the design to work.

### Side by side

| | A. Hub | B. Tailscale | C. Direct + meeting point |
|---|---|---|---|
| Setup for a user | sign in | install and sign in to Tailscale on every device | sign in |
| Works on any network | yes | yes, once Tailscale is on | mostly, relay for the rest |
| Reaches a device that was asleep | yes, mailbox | no | no, unless the meeting point also stores |
| Our monthly cost | $0 until a few hundred heavy users, then $5 plus pennies per user | $0 | same as A |
| Nothing of ours required | yes, if the server address is a setting | yes | no |
| New work | medium | medium | high |

**My recommendation.** A, with the server address as a setting so anyone can run their own.
Keep Tailscale for what it does today (remote access) and do not build a second live path
until a real need appears. Two paths means two systems to keep working.

## 2. Sleep: you were right, with one catch

With word-by-word streaming, your other devices already have every word the moment the host
sleeps. Nothing big is left to send. What I measured as "far longer" is today's upload: a git
commit and push of the whole chat file (*measured*: typical chat 1.1 MB, one in ten over 11 MB,
largest 312 MB), a dozen program launches, often 10 to 30 seconds. That upload does not fit in
the 2 to 5 seconds sleep allows.

The catch is a device that is off or disconnected at that moment, such as a phone in a pocket.
It was not listening, so it has nothing. It can only catch up from:

- a mailbox on the hub holding the undelivered words (option A), or
- the git upload, which happens when the host is next awake and connected.

With a mailbox, sleep needs only a one-word "host going to sleep" note, which fits easily. Git
becomes the permanent archive and can run whenever convenient. Without a mailbox (Tailscale
only), sleep stays a real gap.

## 3. What a chat is made of beyond its messages

*Measured* on your desktop, across all your chats:

| Piece | What it is | Size on your disk | If it does not travel | Suggestion |
|---|---|---|---|---|
| Main chat file | the conversation itself | typical 1.1 MB, biggest 312 MB | nothing works | always travels (today) |
| Helper transcripts | the work of helpers the assistant spawned | 8.4 GB across 327 chats, half your 16 GB store | chat reads fine; opening a helper's details shows nothing until fetched | fetch when you expand one |
| Saved long outputs | big command results the assistant saved to files and reads back | 510 MB total | a new host cannot reread them and may redo work | travel with the chat |
| Undo history | copies of files before each edit | 488 MB, about 1 MB per chat | undo of past edits unavailable on the new host | fetch on demand; only useful when the project is in the same place |
| Memory notes and plans | what the assistant remembers about a project; its plans | 250 KB total | assistant forgets project habits on the new host | always travel |
| Pasted images and files | things you dropped into the chat, kept in a temp folder | up to 32 MB each | broken images in the chat | travel with the chat |
| Permission rules | what the assistant may do without asking | tiny | per machine by design | stay per machine |
| Running programs, browser tabs, unanswered permission prompts | live state | none | cannot move; the "what this device lacks" notice covers it | never |

**Real-use effects.** Words stream live; the extra pieces follow in the background and only matter
when you switch hosts. Storage grows only where you choose: a device that fetches helper
transcripts on demand stores a few MB per chat you dig into, not 8 GB. A first-ever download of
your whole store is 9.2 GB, which is why you chose list-then-open.

## 4. The phone staying awake

Android lets our background service run with the screen off, but after the phone has been still
and dark for a while it enters "Doze": the network is cut for every app, including ours, except
for short maintenance windows, and wake requests are ignored. A user can exempt an app from
battery optimization; an exempt app keeps network and processor. Google allows an app to ask for
that exemption only when its core function needs it; a chat hosted on the phone arguably does.

What each choice means for a user:

- **Hold the phone awake per reply.** The answer finishes with the screen off. Does not survive
  deep Doze. No permission needed. Battery cost only while replying.
- **Offer the exemption once, in settings, with an explanation.** Phone-hosted chats keep going
  when the phone is pocketed. Costs battery; the user opts in.
- **Rely on the mailbox.** Viewers see "phone asleep" and may wait or Continue here. No battery
  cost; the phone just becomes an unreliable host.

## 5. Opening a chat on a device that lacks its project folder

Today that chat cannot be opened there. Ways around it:

- **Open in a scratch folder with a banner.** The assistant can talk, read the history and write
  files into a temporary folder. The banner says the project is missing and offers to fetch it.
- **Read and talk only.** The assistant answers from history but cannot run anything or write.
- **Always fetch first.** The confirmation popup you asked for (what is missing, why, how much
  storage), then the project downloads.

## 6. Security: the horror stories, what they have in common, and what we can honestly promise

### First, where your chats already go

Every chat already travels over the internet today: Backup & Sync commits each chat file to a
private repository on GitHub, readable by GitHub, over an encrypted connection. The live path
would send *less* readable material than that to *one more* party (our server), and with
end-to-end sealing that party sees nothing readable. So the question is not "do messages go
online for the first time" but "do we add a second server, and can we make it blind".

### The horror stories, and the one mistake behind each

| Story | What actually went wrong | Does the same trap exist for us |
|---|---|---|
| Zoom, 2020, settled with the FTC | Marketed "end-to-end encryption" while Zoom's own servers held the keys and could read meetings. The term has one accepted meaning: only the user's devices hold keys. | Yes, if the key ever touches our server. Guard: the key is created on the user's devices and never sent to us; a test proves the server code has no path to it. |
| Tea app, 2025 | A storage bucket with no access rules; 72,000 photos and a million private messages readable by anyone who found the address. | Our server has no public buckets; the mailbox would hold only sealed messages. Sealing is exactly what makes a leak harmless. |
| Moltbook, 2026, and 16,000 exposed Supabase databases | AI-written apps shipped the database's master key inside the app, or left the database's row rules off, so any user could read every row. | Our app ships no server secret; each device gets its own sign-in token after GitHub sign-in. Rows are read by server code that checks the token, which the Oct 30 audit reviewed. |
| Countless small apps | One account can read another's data by changing an ID in a request. | The relay room is per account, chosen by the server from the verified token, never from an ID the device sends. A reviewer must test this one specifically. |
| Many "encrypted" apps | Message bodies written into server logs or analytics in the clear. | Must be a rule with a test: no frame body is ever logged. Sealed bodies make a slip unreadable anyway. |
| Home-made encryption | Reusing a number that must never repeat, or sealing without a check that the message was not altered or replayed. | Avoided by using a standard library's authenticated sealing with a fresh random number per message, and putting the sender and a sequence number inside the sealed part. |
| Stolen sign-in token | A token copied from a device lets a stranger join the account's room. | Today a token lives 90 days idle. With sealing, a thief gets sealed blobs and timing only. Settings must let the user remove a device, which kills its token. |
| GitHub account taken over | The attacker signs in to the app on a new device, which then downloads the sync repository. | Already true today: the repository holds every chat readable. Device pairing keeps the live path closed to that device, and sealing the repository too would close the gap entirely. |

What they have in common: the builder either promised a word with a strict meaning, or trusted a
default they did not understand. None of them were broken ciphers.

### What we could reuse instead of inventing

- **The sealing itself.** The encryption library built into Electron and Node (WebCrypto) and
  libsodium are the two standard choices; both are used by far bigger apps. We write no cipher.
- **The pipe.** Cloudflare's encrypted connections, the per-account room and the sign-in token
  check already exist and were audited on Oct 30.
- **Rule (Destin, 2026-11-08): a key is never synced to GitHub or stored on any server.** A
  key is made on a device and reaches another device only through a step the user performs.
  The earlier "key file in the sync repository" idea is rejected.
- **The key, three ways that respect the rule.**
  1. *Pair by code.* A new device shows a short code or QR; an existing device scans or types
     it and hands over the account key sealed so only that new device can open it. The server
     relays sealed handshakes it cannot read; the code is what stops a stranger or the server
     from slipping in. This is how WhatsApp and Signal link devices. Needs one existing device
     awake. Standard libraries cover the sealing; the screens are ours.
  2. *Passphrase.* The user types one sync passphrase on each device; the key is derived from it
     on the device and never sent. No second device needed. Costs: a forgotten passphrase ends
     live sync on new devices until reset; a weak passphrase is guessable by anyone holding the
     sealed messages; one more thing to explain at setup.
  3. *Both.* Pair by code normally; the passphrase as the recovery path when no other device
     is reachable.
- **Reuse.** Sealing, key pairs and derivation from a passphrase all come from libsodium or the
  built-in library. The full Signal protocol (forward secrecy between devices) is far more than
  a person's own devices need and would be the heaviest thing in the app.
- **The same rule applied to Backup & Sync.** Once keys live only on devices, the chat files
  on GitHub could be sealed the same way, closing today's "readable on GitHub" gap. That is a
  larger change: GitHub becomes blind, and losing every device with no passphrase means the
  chats are gone, so a recovery phrase step becomes mandatory.
- **Option B reuses the most.** Tailscale is WireGuard, audited for years, and has a setting
  ("Tailnet lock") that stops even Tailscale from adding a device. Our part is the remote-access
  server that already passed the Oct 30 audit.

### What we can honestly promise, and when

- Today, truthfully: "Your chats sync through your own private GitHub repository."
- With device pairing: "Live updates pass through our server sealed by keys that exist only on
  your devices; the server relays and stores sealed messages it cannot read. Your GitHub
  repository holds your chats as it does today."
- "End-to-end encrypted" as a headline claim only after an outside review by a person. A written
  design, open code and a test that the server has no path to the key are the minimum before
  saying it anywhere. Zoom's lesson is that the word gets checked.

## 7. A versus B: real effort and what users feel

Most of the work is the same either way: the live viewer, the host chip, switching, takeover,
dropped half replies, fork handling, streaming the chat's tail, phone wake. Only the pipe differs.

| | A. Our server | B. Tailscale |
|---|---|---|
| New server work | relay frames, mailbox, device removal: moderate, in one codebase we deploy | none |
| New app work | sealing and key file; the pipe client | desktop-to-desktop client (none exists), finding which devices are on, streaming over the existing link, Tailscale install and sign-in guidance on four platforms |
| Rough share of the whole project | about a quarter | about a quarter, similar |
| Security surface we own | sealing code and server auth, both reviewable | almost none beyond today |
| Setup a user does | sign in to the app | install Tailscale on every device, create its account, sign in on each; phone loses its VPN slot |
| Reaches a device that was asleep | yes, mailbox | no; git upload only |
| Business users | fine | Tailscale's free plan is personal, non-commercial; a business pays per user |
| Support load | ours: a server we must keep up | theirs, mostly; but "my devices don't see each other" questions land on us |
| Self-hosting | address setting, free at small scale | nothing of ours |
| Cost | free until a few hundred heavy users | free |

A middle path exists: build A with the pipe behind a small interface, so B can be added later
for users who have Tailscale, without redoing the viewer and switching work.

## Sources

- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing
- Cloudflare TURN pricing: https://developers.cloudflare.com/realtime/turn/faq/ and https://www.cloudflare.com/plans/
- Tailscale plan limits (secondary): https://costbench.com/software/business-vpn/tailscale/free-plan/ and https://www.ssdnodes.com/learn/is-tailscale-free-plan-limits
- Android Doze and the exemption rules: https://developer.android.com/training/monitoring-device-state/doze-standby
- Headscale: https://github.com/juanfont/headscale
- Cloudflare free plan limits: https://workers.cloudflare.com/plans
- Zoom FTC settlement: https://www.ftc.gov/news-events/news/press-releases/2020/11/ftc-requires-zoom-enhance-its-security-practices-part-settlement
- Tea app breach: https://akashmenon.substack.com/p/not-a-hack-just-bad-defaults
- Moltbook and exposed Supabase databases: https://cybernews.com/news/16000-supabase-databases-exposed/ and https://blog.ogwilliam.com/post/moltbook-hack-supabase-vibe-coding
