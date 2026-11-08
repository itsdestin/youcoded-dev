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

**Cost to us.** We pay Cloudflare. Chat words are tiny, so this is cheap:

| Item | Published rate | What a heavy user costs |
|---|---|---|
| Base plan | $5 per month for the whole server, already paid | nothing extra |
| Messages into the room | 20 messages count as 1 request; 1,000,000 requests included, then $0.15 per million | about 150,000 requests a month, 2 cents |
| Messages out to your other devices | free | nothing |
| Server time | 400,000 seconds-of-memory included, then $12.50 per million | inside the included amount |
| Mailbox storage | $0.20 per GB per month | pennies |

A heavy user is 200 replies a day streamed word by word. A thousand such users would be
roughly $20 to $40 a month on top of the $5. Light users round to zero.

**How we could charge.** The app has no payment system today. Choices: keep it free and absorb
the cost (it is pennies per user), add a donation prompt (a Buy Me a Coffee page exists), or
sell a paid tier later through a card processor (needs company accounts and tax handling).

**Self-hosting.** The server code is already open source in the `wecoded-marketplace`
repository. A fork can deploy its own copy to its own Cloudflare account for the same $5. If
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
| Our monthly cost | $5 plus pennies per user | $0 | $5 plus pennies |
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

## Sources

- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing
- Cloudflare TURN pricing: https://developers.cloudflare.com/realtime/turn/faq/ and https://www.cloudflare.com/plans/
- Tailscale plan limits (secondary): https://costbench.com/software/business-vpn/tailscale/free-plan/ and https://www.ssdnodes.com/learn/is-tailscale-free-plan-limits
- Android Doze and the exemption rules: https://developer.android.com/training/monitoring-device-state/doze-standby
- Headscale: https://github.com/juanfont/headscale
