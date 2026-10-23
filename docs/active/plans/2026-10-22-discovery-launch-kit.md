---
status: active
created: 2026-10-22
owner: search discovery — getting YouCoded mentioned where people and AI tools look
---

# Getting YouCoded found: the launch kit

Every draft below is ready to paste. Edit freely; nothing here has been posted. Posts and
listings go out under Destin's name, so each one waits for his go-ahead. The ones marked
**I can do it** only need a yes (and, for some, a one-time sign-in).

**Why this matters more than site tweaks:** the only measured study found (112 products,
2,240 ChatGPT questions, 2026) saw no link between on-site "AI optimization" and ChatGPT
recommending a product. Links from other sites and a presence on Reddit were the strongest
predictors. Perplexity and ChatGPT search quote GitHub lists, Reddit threads, directories and
comparison articles, so YouCoded has to exist in those places.

**One rule for every post:** lead with what YouCoded *becomes* (pages, features, looks you
ask for), not with "a GUI for Claude Code." The narrow hook gets the click; the bigger idea
is what makes someone install it.

## Order to do them in

| # | Where | Effort | Why |
|---|---|---|---|
| 1 | awesome-claude-code list | 5 min form | ~56k stars; AI tools quote it constantly. Has an "Alternative Clients" section |
| 2 | AlternativeTo | 15 min | Ranks for "alternative to Claude desktop / ChatGPT / LM Studio" searches |
| 3 | SourceForge | 10 min | Mirrors GitHub; it already ranks for "Claude Code Android" searches |
| 4 | AUR (Arch Linux) | **I can do it** after you make an AUR account | You run Arch (CachyOS); one file, updated each release |
| 5 | winget (Windows) | **I can do it** — a pull request from your GitHub | `winget install YouCoded`; Windows search tools list it |
| 6 | r/LocalLLaMA | 1 post | The local-model crowd; the built-in engine is the hook |
| 7 | Show HN (Hacker News) | 1 post + answer comments for ~3 hours | Biggest single spike; HN links count heavily for Google |
| 8 | r/ClaudeAI, r/SideProject, r/opensource | 1 post each, spaced a week apart | Each one is a lasting page AI tools find |
| 9 | Product Hunt | Plan a launch day | Worth more with some stars and users first; do after 6–8 |

**Not yet:** Homebrew (Mac) needs 75+ GitHub stars before it accepts a self-submitted app
(YouCoded has 11). Flathub's sandbox fights an app that runs a terminal and edits your files,
so it needs real work. F-Droid requires every part to be built from source, which the bundled
Claude Code install breaks. Google Play is already card #31.

---

## 1. awesome-claude-code

Submitted through the repo's issue form ("Recommend a new resource"), not a pull request.
https://github.com/hesreallyhim/awesome-claude-code/issues/new/choose

- **Name:** YouCoded
- **Category:** Alternative Clients
- **Link:** https://github.com/itsdestin/youcoded
- **Description:** An open-source desktop and Android app that wraps Claude Code in a full
  chat interface (tool cards, approvals, file panel, version history) and adds its own
  agent that runs on any model, local or cloud. Runs Claude Code on-device on Android.
  Skills install once and work on both. Windows, macOS, Linux, Android.
- **Author:** Destin (itsdestin)

## 2. AlternativeTo

https://alternativeto.net (sign in → "Suggest new application")

- **Name:** YouCoded
- **Short description:** A fully customizable AI assistant and open-source everything app.
- **Description:** YouCoded is an AI assistant that turns into what you ask for. Ask in the
  chat for a control panel for your house, a page for your money, a game, or a whole new
  look, and it builds it inside the app. It works on your files (Word, Excel, PowerPoint,
  PDFs, spreadsheets) with a version history of every change, asks before it acts, and runs
  on whichever AI you choose: Claude or ChatGPT on your own plan, hundreds of models
  through OpenRouter, or a free model running offline on your own computer. Conversations
  sync across Windows, macOS, Linux and Android. Free and MIT-licensed.
- **Alternative to:** Claude (desktop app), ChatGPT, Jan, LM Studio, Open WebUI, AnythingLLM
- **Platforms:** Windows, Mac, Linux, Android, Web (self-hosted remote access)
- **License:** Free, Open Source
- **Tags:** ai-assistant, ai-agent, local-llm, claude, chatgpt, customizable, no-code

## 3. SourceForge

https://sourceforge.net/p/add_project (choose "Import from GitHub", repo
`itsdestin/youcoded`). Use the AlternativeTo description.

## 4. AUR — I can do it

You make an account at https://aur.archlinux.org/register and add your SSH key (I'll walk
you through it). I write a `youcoded-bin` package that installs the official AppImage or
`.pacman` build, test it on this machine, and publish it. Each release then needs one small
update, which I add to the release checklist. Afterwards, anyone on Arch types `paru -S youcoded-bin`.

## 5. winget — I can do it

I generate the manifest for `YouCoded-Installer-1.3.2.exe` and open a pull request to
`microsoft/winget-pkgs` from your GitHub. Microsoft's bots test the installer; a human
merges within a few days. Afterwards: `winget install YouCoded`. New releases need one
small pull request each, which can be automated later.

---

## 6. r/LocalLLaMA

Check the sub's self-promotion rule before posting; it allows project posts when the poster
answers questions and isn't only advertising.

**Title:** I built an open-source agent app with llama.cpp built in — no Ollama, works on
your files, switch to a cloud model mid-conversation

**Body:**

I've been building YouCoded, a free, MIT-licensed AI assistant for Windows, macOS, Linux
and Android. The part this sub might care about: it ships its own llama.cpp engine. Drop a
GGUF in (or download one in the app) and it serves it with tool calling, so a local model
gets the same agent as the cloud ones: reading and editing your files, running commands,
web search, skills, and approval cards before it touches anything.

A few things I haven't seen elsewhere:

- You can switch models mid-conversation. Start on a local Qwen, hand the hard part to
  Claude or an OpenRouter model, then switch back, all in the same chat.
- It reads the model's real context window from the engine instead of guessing, and when
  instructions are too long for a small window it keeps every heading and trims the bodies,
  so the model still knows what exists.
- Idle models unload on their own.

Frankly, the more interesting part to me is what it does with a model: you can ask it for
a page (a smart-home panel, a budget tracker, a game) and it builds that into the app
itself. On a local model, that costs nothing.

Fair warning: small local models still struggle with long agent tasks, and I'd love to hear
which ones you've had the best luck with for tool use.

Site: https://youcoded.ai · Code: https://github.com/itsdestin/youcoded

## 7. Show HN

Post on a weekday morning (US Eastern). Stay for the first ~3 hours to answer comments;
that is most of what decides whether it stays on the front page.

**Title (80 characters max):** Show HN: YouCoded – an open-source AI "everything app" built by a non-programmer

**URL:** https://youcoded.ai

**First comment (post right after submitting):**

I've never written a line of code. I started using Claude Code to build myself a journaling
system, and it worked well enough that I wanted my friends to try it. They took
one look at a terminal and declined. So I kept asking Claude to make it friendlier, and
that turned into YouCoded: a desktop and Android app where you ask an assistant for what
you want and it builds it, whether that's work on your files, a page for your house or your
money, a new feature, or a new look for the app itself.

To be clear about how it was made: every line was written by AI through conversation. I
direct the product and review what it ships. I know HN has opinions about that, and I'd
honestly like to hear them. The repo is public, so you can judge the code directly.

What it does today:

- Runs on any model: Claude or ChatGPT on your own plan, OpenRouter, direct API keys, or a
  bundled llama.cpp engine for free offline models. Switch mid-conversation.
- Its own agent (files, shell, web, subagents) with approval cards and a screen listing
  every standing permission. It can also run Claude Code itself, including on-device on
  Android.
- "Pages": small apps inside YouCoded you make by asking. The two on the site, a home
  control panel and a page of every account, are ones I made and use daily.
- Office files edited in place, version history for everything the agent writes, git review.
- Sync across devices through your own private GitHub repo; remote access from any browser.
- Themes you describe in a sentence, a skills marketplace, and multiplayer chess/Connect
  Four for when a task takes a while.

It's MIT-licensed and free. I'm intrigued to see whether "software owned by nobody,
improved by everybody, no coding required" holds up once people other than me start
building on it.

## 8a. r/ClaudeAI

**Title:** I've never coded. I used Claude to build an open-source app that lets Claude
build pages and features into itself

**Body:**

A few months ago my friends refused to touch my Claude Code journaling setup because it
lived in a terminal. So I asked Claude to fix that. YouCoded is the result: a free desktop
and Android app with Claude (sign in with your Pro/Max plan) behind a real chat interface.
Tool cards instead of terminal output, approvals you click, files that open beside the
chat, and a version history of everything it changes.

The part I didn't expect to build: you can ask it for a page, and it makes one inside the
app. I have a control panel for my house and a page with every bank account and bill on
it. Neither existed until I asked for them.

It also runs ChatGPT, OpenRouter models or free local models, and the Android app runs
Claude Code on the phone itself. Every line was written by AI. I'd love feedback from
people who use Claude Code daily.

https://youcoded.ai

## 8b. r/SideProject

**Title:** My side project: an AI app that becomes whatever you ask it for (built with zero
coding experience)

Body: the first two paragraphs of the Show HN comment, then the site link.

## 8c. r/opensource

**Title:** YouCoded: an MIT-licensed AI assistant meant to be "owned by nobody, improved by
everybody"

**Body:**

I believe one of the best things AI can do is make open-source software something anyone
can contribute to, not just programmers. YouCoded is my attempt at that: a free AI
assistant for Windows, macOS, Linux and Android that you shape by asking. New pages, new
features, new looks. Skills and themes people make can be published to a shared
marketplace from inside the app.

I built it without knowing how to code, entirely through conversation with AI, which is
also the point: if I could, anyone can help improve it. It runs on any model, including
free local ones. Issues, ideas and pull requests are all welcome.

https://github.com/itsdestin/youcoded

## 9. Product Hunt (later)

- **Tagline (60 max):** The AI assistant that becomes whatever you ask for
- **Description:** use the AlternativeTo description.
- **Gallery:** the site's existing loops (theme change, home page, money page, sync,
  arcade) plus the share image.
- **First comment:** the Show HN comment, trimmed to the story and three bullets.
- Launch on a Tuesday–Thursday. Line up 10–20 people who will try it that day; Product
  Hunt rewards early activity.

---

## Things only Destin can do (one-time, ~10 minutes, I can guide in the browser panel)

- **Google Search Console** (search.google.com/search-console): add `youcoded.ai` as a
  domain. Because the domain is on Cloudflare, Google offers a one-click verify. Then
  submit `https://youcoded.ai/sitemap.xml`. This shows exactly which searches find the
  site.
- **Bing Webmaster Tools** (bing.com/webmasters): "Import from Google Search Console."
  Bing's index feeds ChatGPT search and Copilot.
- **Cloudflare:** leave "Block AI bots" / AI Crawl Control **off**. Checked 2026-10-22:
  GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Googlebot and Bingbot all load the site.
