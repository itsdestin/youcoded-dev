---
status: draft
created: 2026-09-26
topic: How to rebuild Google, Microsoft, Apple, browser and computer-use integrations for simplicity and reach
---

# Rebuilding integrations: Google, Microsoft, Apple, browser, computer

Raw research, with every source link, is in `research/`:
`01-current-integrations.md` (our code), `02-competitors.md`, `03-google.md`,
`04-microsoft-apple.md`, `05-browser-computer-use.md`.

## The short version

1. **Today's Google setup is the biggest problem, and it's worse than it looks.** A user downloads
   ~500 MB of Google developer tools, makes ~4 trips to the browser, clicks through ~20 fields on
   three Google Cloud admin pages, and then must **sign in again every 7 days**. It works only in
   Claude Code sessions (not our own assistant, not Android). The app also shows "Needs auth" forever,
   even after setup succeeds.
2. **Almost every competitor that isn't a big company does the same painful thing** (Hermes, OpenClaw,
   the popular open-source Google tools). The products with smooth "Sign in with Google" (ChatGPT,
   claude.ai, Manus, Google's own tools) all **own one approved Google app** that every user clicks
   through. No shortcut avoids that trade.
3. **Google's rules split into a cheap half and an expensive half.**
   - **Cheap:** Calendar, *sending* email, and files the assistant creates. These need only Google's
     free review, which takes roughly 4–6 weeks and asks for a homepage, a privacy policy and a demo video.
   - **Expensive:** *reading* or organizing email, and reading all of Drive. These additionally need a
     paid outside security audit ("CASA"), redone every year. Estimates run about $540–$3,000+ a year.
4. **Microsoft is actually easier than Google.** One free Microsoft app registration covers Outlook
   mail, calendar and OneDrive, with no paid audit. The catch: some work/school accounts block
   unapproved apps until an IT admin says yes, and getting Microsoft's "verified" badge runs through
   the same business checks the LLC already struggled with for code signing.
5. **Apple can finally work on Windows, Linux and Android.** iCloud Calendar, Contacts and Mail can be
   reached with an "app-specific password" the user makes once at account.apple.com. No approval
   process at all. Reminders and Notes stay Mac-only.
6. **Phones give calendars away free.** On Android, one permission prompt lets the app read and write
   every calendar and contact the phone already syncs (Google, Outlook, Samsung…), with no sign-in at all.
7. **Browser: adopt, don't build — at first.** Microsoft's new "Playwright CLI" is designed exactly for
   assistants with a Bash tool like ours. It works without an image-reading model and uses 4–10× less
   of the model's memory than the popular alternative. Full "control my whole computer" is still
   unreliable, and on Linux with Wayland (your laptop) the common method is blocked outright.
   Skip it for now.
8. **Bash vs. building app pieces:** build the *front door* (signing in, permissions, status, safety
   confirmations) as real app screens. Build a *small* set of app-owned actions for the everyday things
   (today's calendar, find an email, draft or send). Leave the long tail (Sheets formulas, Slides,
   rare features) to bash and skills. Details in "Build app pieces, or let it use Bash?" below.

**My recommendation:** a staged plan. First fix what's broken this week. Then launch a YouCoded-owned
Google sign-in for Calendar + sending + created files; that removes the Google Cloud setup and the
7-day re-sign-in for everyone. Add Microsoft, iCloud and Android calendars on the same "Connections"
screen. Decide separately whether full inbox reading is worth a yearly paid audit. Four decisions for
you are at the bottom.

---

## 1. What we have today

| Area | State | What users experience |
|---|---|---|
| Google | Plugin; each user builds their own Google Cloud project; bash + 23 skills around the `gws` tool | Long, technical setup; "Google hasn't verified this app" warning; sign-in lapses every 7 days; Claude Code only |
| Apple | Mac-only plugin; small Swift helper + AppleScript | Works on Mac only. Probably broken on stock Macs: it uses two commands (`timeout`, `flock`) Macs don't include. Unverified — needs a Mac to confirm |
| Microsoft | Nothing | — |
| iMessage | Anthropic's plugin listed | Shows "Connected" immediately, but can't actually read messages without a Mac permission we never ask for |
| Todoist | Listed as available | **Install fails** — the app doesn't support its setup type |
| Google Messages | Plugin | Ships only a Windows program, so it looks broken on Mac and Linux |
| Browser | Only third-party marketplace plugins | Works only in Claude Code sessions; our own assistant has no browser |
| Computer control | Two "planned" tiles | Nothing behind them |
| Android | Integrations listed | Can't install any |
| App status badge | — | Google and Apple say "Needs auth" forever, even when working |

Why it's like this: in April we chose "each user brings their own Google project" to avoid Google's
review and to avoid you being "the sole owner of an app every user depends on." Owning a YouCoded app
was parked "until v1 has measurable usage." The plugins haven't been touched since spring, and most of
their fix history is shell-script portability (Windows vs Mac vs Linux quirks). That kind of upkeep
goes away if the app does the work itself instead of shell scripts.

## 2. What other assistants do

| Product | Google sign-in | Microsoft | Apple | Browser | Style |
|---|---|---|---|---|---|
| Hermes Agent | User's own Google project | — | — | Browser Use | Many built-in tools + MCP |
| Pi | None (out of scope) | — | — | — | "Just Bash": 4 tools |
| OpenClaw | User's own project (`gog` tool) | — | Deep Mac tools (iMessage, Reminders) | Separate agent browser; opt-in real Chrome | Bash + skills + MCP |
| Codex / ChatGPT | OpenAI's own approved app, one click | Yes | iMessage (Mac) | Built-in | Built-in connectors |
| Claude.ai / Claude Code | Anthropic's approved app on claude.ai, but **not in the Claude Code terminal tool** | Yes | — | Claude in Chrome (paid plans only) | MCP + skills |
| Manus | Own approved app | Deepest Microsoft deal | — | Cloud computer | Hosted |
| Goose | Generic MCP | — | — | — | MCP-first |

Lessons:
- **Smooth sign-in = owning an approved app.** Nobody has found a way around it; the ones that
  skipped it (Hermes, OpenClaw) have the same painful setup we do.
- **None of the big products use a middleman service** (Composio, Arcade, Pipedream) for their main
  integrations. Those services charge per action and hold users' tokens on their servers. With many
  free users, the free tiers (a few thousand actions a month) run out almost immediately.
- **OpenClaw's skill store was used to spread Mac malware** (341 bad skills found in February 2026;
  the only gate was a week-old GitHub account). A warning for our marketplace: integrations that touch
  email and files should be ones we ship and vet, not open community uploads.
- **The "tools vs. Bash" debate settled into "both":** Bash plus skills for power and long-tail work;
  a small number of well-defined tools where identity, safety and small models matter. Evidence
  shows small models fall apart when handed dozens of tools at once, and our app supports small local models.

(Some competitor claims came through secondary sources; see "Things not verified" at the end.)

## 3. Google options

Ordered from least to most work for us.

| # | Option | User setup | Our work | Ongoing burden | Covers | Verdict |
|---|---|---|---|---|---|---|
| G0 | Fix today's plugin (badge, bump `gws`, dead references) | Same painful setup | Days | Same | Everything | Do the bug fixes regardless; not a real answer |
| G1 | **Phone and Mac calendars** (Android calendar access; Mac Calendar already syncs Google if the user added it in Mac settings) | One permission prompt | Small (Android); nearly free on Mac (the Apple helper already reads these) | Low | Calendar only; no Gmail/Drive; no Windows equivalent | **Do it** — free calendar for many users |
| G2 | **YouCoded-owned Google app, "cheap half" scopes** (Calendar, send email, files it creates) | Click "Sign in with Google" once | Medium: sign-in inside the app (we already do this for OpenRouter/ChatGPT) + Google's free review | Low; privacy policy and homepage must stay accurate | Calendar full; send mail; its own Docs/Sheets. **Cannot read the inbox** | **Recommended core** |
| G2a | Same, before approval arrives ("published but unverified") | Click sign-in + click past a "not verified" warning | Same | — | Anything, even inbox reading, but **capped at 100 users ever** and shows a scary warning | Good bridge for beta testers while review runs |
| G3 | Add **inbox reading** to G2 via the yearly security audit | Same one click | Paperwork + audit (~$540–$3,000+/yr, redone yearly) | Yearly re-audit; LLC responsible for Gmail data handling | Full Gmail | Decide once usage justifies it |
| G4 | **Apps Script bridge**: user signs in through Google's own developer tool, and a small script is placed in *their own* Google account to do the work | Sign in, flip one Google setting, click Allow | Medium | Unknown: rests on an unofficial community technique Google could close | Full Gmail/Calendar/Drive; limits ~100 emails sent/day | **Worth a small experiment** for inbox reading without the audit; not a foundation |
| G5 | Gmail **app password** (email only) | Turn on 2-step verification, create a 16-letter password, paste it | Small–medium (standard email protocols) | Low | Read/send/search mail; no Calendar/Drive; some work accounts block it | Fallback for inbox reading, same UX as the iCloud plan |
| G6 | Middleman service (Composio/Arcade/Pipedream) | One click | Small | **Per-action bills grow with users**; third party holds tokens | Broad | Not recommended |
| G7 | Keep "bring your own project" as an **advanced** option | Painful | Already built | Current | Everything | Keep for power users who want full inbox access without us |

What each option means for users:
- **G2 is the big quality-of-life jump:** no 500 MB download, no Cloud admin pages, no weekly
  re-sign-in, and it works in our own assistant and on Android, not just Claude Code.
- **The honest limit of G2:** "What's in my inbox?" won't work until we pick G3, G4 or G5. Users could
  ask the assistant to send an email but not to read one. We should say that plainly on the sign-in
  screen rather than let it fail mid-chat.
- **Owning the app means the LLC is the name on the Google consent screen.** If Google ever suspends
  it, every user's Google connection stops at once. That's the risk the April decision named. It's
  the same risk ChatGPT and Claude carry, and the review exists to keep it manageable.
- **Unverified:** whether an app that keeps tokens only on the user's computer (never on our servers)
  can skip the paid audit. A Google forum thread asks exactly this and has no answer. Worth asking
  Google directly before paying for G3.

## 4. Microsoft options

| # | Option | User setup | Our work | Burden | Verdict |
|---|---|---|---|---|---|
| M1 | **YouCoded-owned Microsoft app** (free registration) using Microsoft Graph, one API for mail, calendar, OneDrive, To Do | Click "Sign in with Microsoft" | Medium (same app sign-in machinery as G2) | Low; no paid audit | **Recommended.** Personal Outlook/Hotmail works fully. Some work/school accounts need IT approval |
| M2 | M1 + Microsoft's "verified publisher" badge | Fewer warnings; more work accounts allowed | Business verification through Microsoft's partner program — the pipeline that already gave the LLC trouble | Low once done | Later; timeline uncertain |
| M3 | Adopt Softeria's open-source `ms-365-mcp-server` | One click | Small | Depends on their volunteers; uses **their** app unless we plug in ours | Good *code* to reuse with our own app ID; don't ride their ID |
| M4 | Borrow Microsoft's own well-known app IDs | — | — | Microsoft deleted one of these without warning in 2024, breaking everyone | **No** |
| M5 | Email passwords | — | — | Microsoft shut these off for Outlook in April 2026 | **Dead** |
| M6 | Windows' own Calendar app / Outlook automation | — | — | Windows-only; "new Outlook" dropped automation | **No** |

Technical gotcha to remember: personal and work accounts need slightly different sign-in addresses.
Using one address for both makes personal-account sign-ins expire after about an hour. That's a known
trap in Softeria's own notes.

## 5. Apple options

| # | Option | Platforms | User setup | Verdict |
|---|---|---|---|---|
| A1 | Keep the Mac helper; fix the likely `timeout`/`flock` bug; sign and notarize the helper so macOS stops re-asking permissions after updates | Mac | Permission prompts | **Do it** (deepest Apple access: Reminders, Notes, Mail app) |
| A2 | **iCloud via app-specific password** (Calendar + Contacts + Mail over standard protocols; the `tsdav` library covers calendar/contacts) | **All**, including Windows, Linux, Android | Make one 16-letter password at account.apple.com, paste it once | **Do it.** The only way iPhone users on Windows get their calendar. Say plainly that Reminders and Notes are Mac-only |
| A3 | iMessage | Mac | Grant "Full Disk Access" | Careful. ChatGPT's iMessage plugin was widely criticized in August 2026 because that permission also exposes mail, browsing history and backups, and it allowed sending without asking. If we ship it: explain the permission honestly, and never allow sending without a confirmation |
| A4 | Android phone calendars/contacts | Android | One permission prompt | Same as G1 — covers iCloud too if the phone syncs it |

## 6. Browser and computer control

| # | Option | Our work | Works with small/local models? | Verdict |
|---|---|---|---|---|
| B1 | **Bundle Microsoft's Playwright CLI + a skill** (assistant runs it through Bash; separate browser profile) | Small | Yes — reads page structure as text, no image model needed; 4–10× cheaper than the MCP version | **Do first** |
| B2 | Playwright MCP / Chrome DevTools MCP / browser-use (already in marketplace) | None | Heavier; browser-use wants an image-reading model | Keep listed; don't make default |
| B3 | **"Watch it browse" pane inside YouCoded** (the app's own built-in browser, driven by the assistant, visible to the user) | Large; no ready-made open-source version found; known Electron crash bugs to work around | Yes | The standout "hard" option; users see exactly what it's doing. Later |
| B4 | Use the user's **real, logged-in Chrome** | Medium (browser extension) | Yes | Opt-in only, per tab. Chrome now blocks the simple method on the main profile, and that method hands over the whole browser session |
| B5 | Full desktop control | Large, three separate platform builds | Needs strong image models | **Skip for now.** Top systems still fail about a quarter of realistic tasks, and on Linux/Wayland the common method is blocked. If revisited: Windows-MCP (Windows), Peekaboo (Mac) |

Safety, whichever we pick: web pages can contain hidden instructions aimed at assistants ("pay this
invoice"). Research in 2026 says no defense stops all of these. So **anything that spends money,
sends, posts or deletes must stop and ask the user**, enforced by the app, not left to the model's judgment.

## 7. Build app pieces, or let it use Bash?

Split it into layers:

| Layer | Build it into the app? | Why |
|---|---|---|
| **Signing in, accounts, permissions, "connected" status** | **Yes — real screens** | This is where non-developers get stuck today. Bash can't show a sign-in button, keep tokens in the system's secure password store, or say "your Google sign-in expired — reconnect." Works the same on desktop, phone and remote |
| **Safety confirmations** (send, delete, pay) | **Yes** | Must be enforced by the app. A skill can only *ask* the model to ask |
| **Everyday actions** (calendar today/this week, create event, search/read email, draft, send, find a file) | **Yes — a small set, about 10–15 app-owned tools**, one version regardless of provider ("calendar" means Google, Outlook or iCloud) | Works with small local models (few tools, clear shapes); works in our assistant, Claude Code and Android alike; no shell-script portability bugs; "what's on my calendar" can cover every account at once |
| **Long tail** (Sheets formulas, Slides, Drive permissions, filters, rare API calls) | **No — Bash + skills** | Frontier models handle this well; building tools for every corner is endless upkeep |
| **Browser** | Start with Bash + skill (B1); app pane later (B3) | Cheapest route that works now |

Unintended effects to plan for:
- Our own tools will go through **Claude Code too** (as an app-provided MCP server). We must retire the
  old Google plugin's skills at the same time, or Claude will see two ways to send email and may pick
  the old, broken one.
- Existing Google-plugin users would need a one-time "reconnect with the new sign-in" and cleanup of
  the old tools. It must be offered, never forced silently.
- A built-in "calendar" tool means small-model users suddenly get working calendar access. Good, but
  more mistaken event creation too, so event creation should show a confirmation card.

## 8. Recommended plan

**Easy track (low upkeep, big wins):**
1. **Fix what's broken now** (days): "Needs auth" badge, Todoist install, Google Messages
   Mac/Linux, likely Apple Mac bug, bump `gws`, iMessage's false "Connected".
2. **Browser via Playwright CLI + skill** (days–a week), with app-enforced confirmation for purchases, sends and posts.
3. **Android calendars and contacts** (about a week, plus parity work).
4. **Start Google's free review now** for Calendar + send + created files. It needs a privacy page and
   homepage on the site, plus a demo video; about 4–6 weeks of waiting, mostly idle time.

**Core build (medium):**
5. **A "Connections" screen** in Settings: Sign in with Google / Microsoft, add iCloud (app password),
   status and reconnect, per-account on/off. Designed through the usual decks.
6. **App-owned everyday tools** (calendar, email, contacts, files) behind that screen, for our
   assistant, Claude Code and Android. Old plugin retired with a migration.
7. **Microsoft sign-in (M1)** and **iCloud (A2)** plugged into the same tools.

**Hard track (max capability, more upkeep):**
8. **Full inbox reading**: yearly Google audit (G3), OR an Apps Script experiment (G4), OR Gmail app password (G5).
9. **"Watch it browse" pane** inside the app (B3), then opt-in real-Chrome (B4).
10. **Microsoft verified publisher** (M2) once the LLC's business verification is sorted.
11. Desktop control: revisit in 2027.

## 9. Decisions for Destin

1. **Should the LLC own a "YouCoded" Google sign-in?** This reverses the April decision. Pro: one-click
   setup, no weekly re-sign-in, works everywhere. Con: the LLC is responsible for users' Google access,
   needs a privacy policy, and a Google suspension would disconnect everyone at once.
   *I recommend yes.*
2. **How should inbox reading work?** (a) pay the yearly audit, ~$540–$3,000+; (b) try the Apps
   Script trick; (c) Gmail app password (clunky, like iCloud's); (d) leave reading to the advanced
   bring-your-own-project path for now. *I recommend (d) at launch plus a small (b) experiment, and
   (a) once people are using it.*
3. **Build the app-owned everyday tools, or keep everything as Bash skills?** *I recommend the
   layered split in section 7.*
4. **Browser first step:** Playwright CLI (easy), or go straight to the in-app pane (hard)?
   *I recommend the CLI first.*

## Things not verified

- CASA audit prices ($540–$3,000+/yr) come from third-party write-ups, not Google.
- Whether local-only token storage exempts an app from CASA: unanswered by Google.
- The Apps Script bridge: confirmed it exists and how it signs in (`github.com/sam-ent/google-automation-mcp`,
  MIT); not tested; its future depends on Google's developer tool policy.
- Some competitor claims (e.g. Gemini CLI "retired June 2026", ChatGPT browser rebuild history, star
  counts) came through secondary sources and may be wrong; none of the recommendations rest on them.
- The Apple `timeout`/`flock` bug is read from code; needs a Mac to confirm.
- Computer-use benchmark numbers are third-party leaderboard reports.
