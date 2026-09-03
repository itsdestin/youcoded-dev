---
status: review
date: 2026-08-27
plan: docs/active/plans/2026-08-27-landing-page-rebuild.md
---

# Landing page copy — every string, old vs. new

This is every piece of visible text on the landing page (itsdestin.github.io/youcoded), old on the left, new on the right, in the order it appears on the page. Nothing has been built yet — this document is the plan for the words. Tasks 10–13 build the page from what's in the **New** column, so anything you change here should be changed before those tasks land (or corrected after, in Task 14).

**How to mark this up:**
- Edit the **New** column cell directly with your preferred wording, or
- Leave the row as-is and add a line under it starting with `**Destin:**` — a note, a question, a "no", whatever.

Either way works; I'll read the whole file for your edits when it comes back.

A few notes before the tables:
- `(unchanged)` in the New column means the plan keeps that exact old text.
- Blank in the Old column means this is a brand-new string with no predecessor (a new section or a new row).
- `(removed)` means this content is being cut entirely — the Old column shows what's going away.

---

## Meta (browser tab, search results, link previews)

| Old | New |
|---|---|
| `<title>YouCoded — Make Claude Yours</title>` | `<title>YouCoded Agent — AI for Everyone</title>` |
| Meta description: `The hyper-personalized AI assistant app. Sign in with your Claude Pro or Max plan, then make it yours with custom themes, skills, journaling, and a personal encyclopedia. Share with friends, play multiplayer games while Claude works. Windows, macOS, Linux, Android.` | `One app for Claude, hundreds of cloud models, or one that runs free on your own computer — working in your files, on every device you own. Windows, macOS, Linux, Android.` |
| `og:title`: `YouCoded — Make Claude Yours` | `YouCoded Agent — AI for Everyone` |
| `og:description`: `Make Claude yours — themes, skills, journaling, multiplayer, and a personal encyclopedia, all on top of your Claude Pro or Max plan. Windows, macOS, Linux, Android.` | Same new text as the meta description above (task brief groups "meta description / OG / Twitter description" as one string) |
| `twitter:title`: `YouCoded — Make Claude Yours` | `YouCoded Agent — AI for Everyone` |
| `twitter:description`: same as old `og:description` | Same new text as the meta description above |
| `og:image` URL: `https://itsdestin.github.io/youcoded/og-image.png` | (unchanged URL — Task 13 replaces the actual image file behind it, not the URL) |

---

## Nav

| Old | New |
|---|---|
| Wordmark: `You` + `Coded` (accent color) | (unchanged — same two-part wordmark, kept) |
| Sub-brand under wordmark: `For Claude Code by Anthropic` | `AI for Everyone.` |
| — | New: the word `Agent` added after the wordmark (dimmed, smaller): "You**Coded** Agent" |
| Nav links: `About` · `Features` · `Download` · `FAQ` | (unchanged — Task 10 brief doesn't touch nav link text) |

---

## Hero

| Old | New |
|---|---|
| Headline: `Make Claude` + cycling word | `Make AI` + cycling word |
| Cycling words (4, ending on): `Useful.` → `Fun.` → `Cute.` → `Yours.` | Cycling words (3, ending on): `Useful.` → `Fun.` → `Yours.` (`Cute.` is cut) |
| — | New subhead: `One app for Claude, hundreds of cloud models, or one that runs free on your own computer — working in your files, on every device you own.` |
| — | New button: `Download` (links to Get started) |
| — | New button: `See it work` (links to the new "Try it" embed section) |

---

## Try it (new embed section — no predecessor)

This entire section is new; the old page had no live demo, only static hand-built mockups further down.

| Old | New |
|---|---|
| — | Section label: `Try it` |
| — | Headline: `This is the app. Click around.` |
| — | Body: `Type a message, open the model picker, switch the look — it's the real interface running on a pretend computer. Nothing you do here leaves this page.` |
| — | Button: `Start the demo` |
| — | Theme swatch labels: `Midnight` · `Crème` · `Light` · `Dark` · `Halftone` · `Meadow Mist` · `Golden Sunbreak` |

---

## What is this?

| Old | New |
|---|---|
| Section label: `What is this?` | (unchanged — not respecified in Task 12 brief, so I'm carrying it forward as-is) |
| Section title: `More than a chatbot.` | (unchanged — not respecified in Task 12 brief) |
| Paragraph 1: `YouCoded is an add-on of sorts for Claude Code, a powerful agentic AI tool from Anthropic that can create and edit any type of file, search the web, run terminal commands, and navigate your screen. While Claude Code was designed for coding, YouCoded turns it into something else entirely — a fully capable and customizable agentic AI assistant that doesn't require you to know how to use AI or understand what "agentic" means. With YouCoded, you can teach Claude to navigate emails from any provider, read and summarize your texts, rebuild your spreadsheets, help you study, and more. You get the most intriguing and intuitive form of AI available today, all without needing to become a fratty tech-bro to do it.` | `Most AI lives in a chat box on someone else's website. YouCoded Agent lives on your computer and phone, working in your own files — with Claude, hundreds of other models, or one that runs free on your machine. The look, the plugins, and your data are all yours.` **draft 1 — Destin: "don't love any of these; fine for now"** |
| Paragraph 2: `YouCoded combines that powerful AI with a themeable chat UI, a community marketplace to share and download "skills"... multiplayer mini-games, custom integrations with external services, and remote access from any browser.` | (removed — folded into the single paragraph above) |
| Paragraph 3 (permission note): `Nothing happens without your permission. YouCoded will always ask before taking any action.` | `Nothing happens without your permission. YouCoded Agent asks before it acts.` |

---

## Row 1 — One app, any AI

*(New page structure — the nine showcase rows replace the old seven; there's no clean 1-to-1 mapping between old and new rows. See the "Removed" section at the bottom for everything from the old showcase that isn't carried forward.)*

| Old | New |
|---|---|
| — | Label: `One app, any AI` |
| — | Headline: `Pick the AI. Keep the conversation.` |
| — | Body: `Claude with your plan. Hundreds of models through OpenRouter. Or a model that runs on your own computer — free, offline, private. Switch mid-conversation; nothing is lost.` |

## Row 2 — It actually does things

| Old | New |
|---|---|
| — | Label: `It actually does things` |
| — | Headline: `Give it a folder. It asks before it touches anything.` |
| — | Body: `It reads your files, writes new ones, runs the steps, and searches the web. Every action that changes something shows up as a question first — and every "always allow" you grant is listed in one screen where you can take it back.` |

## Row 3 — Your projects, in one place

| Old | New |
|---|---|
| — | Label: `Your projects, in one place` |
| — | Headline: `Files, chats, and instructions — together.` |
| — | Body: `Open spreadsheets, PDFs, documents, and images without leaving the app. Edit a file next to the conversation about it. Search everything you've ever said in a project.` |

## Row 4 — Stay organized

| Old | New |
|---|---|
| — | Label: `Stay organized` |
| — | Headline: `Tags, notes, and one-tap shortcuts.` |
| — | Body: `Tag and annotate conversations, filter by tag, pin the ones that matter. Quick chips run the things you do every day in one tap. A project's instructions are a tab you can read and edit, not a hidden file.` |

## Row 5 — Follow you everywhere

| Old | New |
|---|---|
| — | Label: `Follow you everywhere` |
| — | Headline: `Start on your laptop. Finish on your phone.` |
| — | Body: `Windows, macOS, Linux, Android, and any browser. Your conversations and files stay in sync through your own private GitHub, so what you started here is waiting there.` |

## Row 6 — Make it yours

| Old | New |
|---|---|
| — | Label: `Make it yours` |
| — | Headline: `Describe a look. Install a plugin. Share both.` |
| — | Body: `Build a theme by describing it — wallpapers, colors, mascots. Browse 300+ plugins from the WeCoded marketplace: journaling, a personal encyclopedia, calendar and email integrations, and whatever your friends publish.` |

## Row 7 — Play while it works

| Old | New |
|---|---|
| — | Label: `Play while it works` |
| — | Headline: `Challenge a friend while it thinks.` |
| — | Body: `Long tasks take a minute. Play Connect Four with a friend in the side panel, see who's online, and get back to the answer when it's ready.` |

## Row 8 — For builders

| Old | New |
|---|---|
| — | Label: `For builders` |
| — | Headline: `Claude Code inside, your own agent beside it.` |
| — | Body: `Run Claude Code as a first-class session next to the app's own agent. Review, stage, and commit changes without leaving the window. Connect tools over MCP. Download and run local models with a GPU-fit check.` |

## Row 9 — Roadmap (new; marked "coming after 1.3", drawn as a sketch, not a real screenshot)

| Old | New |
|---|---|
| — | Label: `Roadmap` + chip `Coming after 1.3` |
| — | Headline: `Hand it off.` |
| — | Body: `Set up a job once — what to do, which tools it may use, where to stop and check with you — then run it on a schedule or send it from your phone. Results and approvals land in an inbox. First: run now and scheduled runs. Later: kick off from an incoming email or a changed file.` |

---

## Removed (old showcase content with no predecessor in the new nine rows)

The old page's "Everything the app gives you" section had 7 rows plus a 10-item accordion. None of the new 9 rows are a rename of an old row in the same slot — the whole section was rewritten. For completeness, here is every heading being cut, so you can confirm none of it needs to survive somewhere:

| Old | New |
|---|---|
| Section title: `Everything the app gives you.` | (removed — new section has no equivalent single headline above the 9 rows; Row 1 is the first thing shown after "What is this?") |
| Row: `Theme Builder` — "Build a theme just by describing it." | (removed as a standalone row — the theme-building idea now lives inside Row 6 "Make it yours") |
| Row: `WeCoded Marketplace` — "Browse, share, and download everything that makes the app yours." | (removed as a standalone row — folded into Row 6) |
| Row: `Journaling & Personal History` — "Talk about your day. The structure happens on its own." | (removed — no equivalent row; journaling is mentioned once, in Row 6's body, as a marketplace example) |
| Row: `Cross-Device Backup & Sync` — "Start anywhere. Pick up everywhere." | (removed as a standalone row — the sync idea now lives inside Row 5 "Follow you everywhere") |
| Row: `Multiplayer Games` — "Play with friends while Claude works." | (removed as a standalone row — replaced by Row 7 "Play while it works," same idea, new wording) |
| Row: `Integrations` — 18-tag wall (Google Drive, Google Docs, Google Sheets, Google Slides, Google Calendar, Gmail, Google Messages, iMessage, iCloud, Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Todoist, GitHub, Chrome, Safari, Canva) | (removed entirely — no per-service tag wall anywhere on the new page) |
| Row: `Other features` — "Everything else you get." — 10-item accordion (Claude Code on Android · Better-than-native Remote Access · Cross-Device Sync & Restore · Themes, Wallpapers & Buddies · WeCoded Community Marketplace · Skills & External Integrations · Multiplayer Mini-Games · Permission & Safety Controls · Quality of Life Features · Uses Your Existing Claude Subscription) | (removed entirely — no accordion on the new page; individual ideas are scattered across Rows 1–8 in short form) |

---

## Story

| Old | New |
|---|---|
| Section label: `Story` | (unchanged — not respecified in Task 13 brief) |
| Section title: `How we got here.` | (unchanged — not respecified in Task 13 brief) |
| Paragraph 1: `Honestly, I really just wanted a cooler and more efficient way to journal and track my own tasks/goals. ... And now we're here.` | (unchanged) |
| Paragraph 2: `Every line of YouCoded was written through conversation with Claude by me, someone who has never written code. ... without a single line typed by hand.` | (unchanged) |
| — | New paragraph 3: `YouCoded Agent is what that kind of AI looks like when it's built for everyone — not just the people who already know how to use it.` |
| Link: `Built by Destin →` | (unchanged) |

---

## Get started (was "Prerequisites")

| Old | New |
|---|---|
| Section label: `Get started` | (unchanged) |
| Section title: `You'll need a couple of accounts.` | `Two minutes of setup.` |
| Card 1 — `Anthropic` [Required] [Paid] — "A Claude Pro ($20/mo) or Max ($100–200/mo) subscription for Claude Code, which powers everything in YouCoded. The app itself is free — you're paying for the AI." → `Subscribe to Claude →` | Card, now 2nd — `Anthropic` **[Optional]** [Paid] — `A Claude Pro or Max plan lets you use Claude — the model YouCoded was built with.` → `See Claude plans →` |
| Card 2 — `Google or Apple` [Required] [Free] — "WeCoded marketplace skills store your personal data in your own Google Drive or iCloud account." → `Create Google Account →` | Card, now 4th, no link — `Google or Apple` **[Optional]** [Free] — `An extra copy of your data in Google Drive or iCloud, on top of GitHub.` (no link) |
| Card 3 — `GitHub` [Required] [Free] — "Required to receive marketplace updates. Sign up with your Google or Apple account." → `Create GitHub Account →` | Card, now 1st — `GitHub` **[Required]** [Free] — `Keeps your conversations and files in sync across devices and delivers marketplace updates. Sign up with your Google or Apple account.` → `Create a GitHub account →` |
| — | New card, 3rd — `OpenRouter` [Optional] [Pay as you go] — `One account, hundreds of models from every AI company. Pay only for what you use.` → `Create an OpenRouter account →` |
| — | New line under the cards: `Or skip the paid ones entirely — run a model on your own computer, free and offline.` |

**Note:** this is the accounts-required change flagged in the audit — GitHub moves from optional-ish to Required, Anthropic moves from Required to Optional, and Google/Apple moves from Required to Optional. This matches Destin's own framing in the audit (§5 "Hard facts for the new copy" table), not a judgment call by me.

---

## Download

| Old | New |
|---|---|
| Section title: `Download YouCoded` | `Download YouCoded Agent` |
| Download card labels: `Download for` / `Windows` · `macOS` · `Linux` · `Android` | (unchanged — not respecified in Task 13 brief) |
| Note line: `Free and open source. Just bring your Claude Pro or Max plan.` + `On iPhone? Use YouCoded from Safari by connecting to any computer running the app via remote access.` | `Free and open source. On iPhone? Use YouCoded Agent from Safari by connecting to any computer running the app.` |

---

## Install modal — "After install" (shared across all platforms)

| Old | New |
|---|---|
| Step 1: `Sign in with your Claude account. YouCoded uses your existing Claude Pro or Max subscription — the same account you use on claude.ai. No separate account, no API key. If you don't have a paid plan yet, you can sign up here.` | `Sign in with GitHub.` |
| Step 2: `Pick a starter theme and model. Both are changeable anytime from the settings panel, so don't overthink it.` | `Choose where your AI comes from — Claude, OpenRouter, or a model on this computer (Settings → Model Providers).` |
| Step 3: `Browse the marketplace. Skills (things that give Claude new abilities) and themes (visual overhauls) are a few taps away and shareable with friends.` | `Pick a theme and browse the marketplace.` |
| Android extra note: `On Android, expect one extra step: the first launch runs a one-time setup that downloads and unpacks the Claude Code runtime (~400–600MB depending on the package tier you pick). Keep the app open on the setup screen until it finishes — it's fast on Wi-Fi.` | `On Android, the first launch downloads the Claude Code runtime (~400–600 MB) — Android uses Claude only.` |

---

## FAQ

| Old | New |
|---|---|
| Section label: `Common questions` | (unchanged — not respecified in Task 13 brief) |
| Section title: `FAQ` | (unchanged) |
| **Q1:** `How is this different from claude.ai?` | `How is this different from ChatGPT or claude.ai?` |
| **A1:** `Claude.ai is a chat website. YouCoded is an app built on top of Claude Code — a more powerful form of Claude that can create files, run terminal commands, manage your computer, and interact more meaningfully with a wider range of external services. Think of claude.ai as texting Claude, and YouCoded as giving Claude hands (with themes, a marketplace, games, and remote access layered on top).` | `Those are chat websites. YouCoded Agent is an app on your computer and phone that works in your own files — it opens, edits, and organizes them, runs tasks, and searches the web — and you choose the AI behind it: Claude, hundreds of cloud models, or one that runs locally for free.` |
| **Q2:** `Is my data private?` | `Do I have to pay for anything?` the old Q2 (privacy) becomes new Q3; the new Q2 is a brand-new question about cost. See below. |
| **A2 (old):** `Everything YouCoded and your installed WeCoded skills create... is stored in your own Google Drive or iCloud account... YouCoded itself sends one anonymous daily ping... You can turn this off at any time in Settings → About → Privacy...` | Moved — see new Q3/A3 below |
| — | **New Q2:** `Do I have to pay for anything?` |
| — | **New A2:** `No. The app is free and open source. A model that runs on your own computer costs nothing. If you want Claude, that's a Claude Pro or Max plan from Anthropic; if you want other cloud models, OpenRouter bills per use.` |
| **Q3 (was Q2):** `Is my data private?` | (unchanged question text) |
| **A3:** old privacy answer above | `Your conversations, files, and settings live in your own GitHub (and, if you add them, your Google Drive or iCloud). Cloud models see what you send them while they work; a local model sends nothing anywhere. The app sends one anonymous daily ping — a hash of your device ID, the app version, platform, and rough region — so we can see how many people use it. No IP address, no username, no message content. Turn it off in Settings → About → Privacy.` |
| **Q4 (was Q3):** `What does the $20/month get me?` | (removed — replaced by new Q2 above, which answers cost more broadly) |
| **A4:** `The $20 goes to Anthropic for a Claude Pro subscription... You're paying for the AI, not the app.` | (removed) |
| **Q5 (was Q4):** `What platforms does it run on?` | `What platforms does it run on?` (unchanged question) |
| **A5:** `Windows, macOS, Linux, and Android are all fully supported with native apps. You can also access YouCoded remotely from any web browser. Apple ecosystem integrations (iMessage, Apple Notes, etc.) are only available on macOS.` | `Windows, macOS, Linux, and Android, plus any web browser by connecting to a computer running the app. Apple integrations (iMessage, Apple Notes, and so on) work on macOS only.` |
| **Q6 (was Q5):** `Do I need to know how to code?` | (unchanged question) |
| **A6:** `Not at all. YouCoded was built entirely by a non-developer using Claude Code itself. The app is designed for everyone... If you can use ChatGPT, you can use YouCoded.` | `No. The whole app was built by someone who has never written code, by talking to AI. If you can use ChatGPT, you can use this.` |
| **Q7 (was Q6):** `I've heard bad things about "agentic" AI. Is it safe?` | `Is "agentic" AI safe?` |
| **A7:** `YouCoded always asks for permission before taking actions... you should always monitor your AI assistant when in use... You should be especially cautious when taking advantage of "Bypass Permissions" mode, which allows Claude to act without your input.` | `The app asks before it changes anything, and every standing permission you grant is listed on one screen where you can revoke it. AI still makes mistakes, so keep an eye on what it's doing — and be careful with full-auto mode, which lets it act without asking.` |
| **Q8 (was Q7):** `Who built this?` | `Who built this?` (unchanged question) |
| **A8:** `So far, it's just me (Destin). However, my intention is for this open-source project to become something we all build together... No profit motive, no ulterior incentives — just people making cool shit and sharing it with other people :)` | (unchanged) |

**Net count:** 7 questions old, 7 questions new — one question (pricing/$20/month) is cut and a new, broader "Do I have to pay for anything?" question takes roughly its place, one question is added net-new in position, order is reshuffled so privacy moves from #2 to #3.

---

## Gallery

| Old | New |
|---|---|
| Section label: `Gallery` | (unchanged — not respecified in Task 13 brief) |
| Section title: `See what people have built.` | (unchanged) |
| 7 images, old alt text pattern: `YouCoded <surface> in the <Theme> theme` (e.g. `YouCoded chat view in the Devils Garden theme`) | `YouCoded Agent — <surface> in the <Theme> theme` (filenames come from the regenerated gallery; pattern fixed, names filled in by Task 13) |

---

## Footer

| Old | New |
|---|---|
| Wordmark: `You` + `Coded` | `YouCoded Agent` |
| Link: `GitHub` | (unchanged) |
| Link: `Built by Destin` | (unchanged) |
| Badge: `Open Source` | (unchanged) |
| Legal line: `MIT License · YouCoded is an independent, community-built project. Not affiliated with, endorsed by, or officially supported by Anthropic.` | (unchanged) |
| Floating pill: `Download ↓` | (unchanged) |
