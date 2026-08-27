---
status: active
date: 2026-08-27
topic: Landing page (itsdestin.github.io/youcoded) — staleness audit, feature diff, positioning inputs for the rebuild
---

# Landing page audit — what the site says vs. what the app is

Source of the site: `youcoded/docs/index.html` (4,377 lines, single file, no build step; GitHub Pages serves `/docs`).
Full-page captures of the current site (desktop 1440px + mobile 390px) were taken 2026-08-27 for the rebuild's "Before".

## 1. When the site was last really revised

| Date | Commit | What |
|---|---|---|
| 2026-04-15 | `76a0d666` | Site created (3,570 lines) |
| 2026-04-16 | `3c766c9a` | **Last content redesign**: demo mockups redesigned, features + integrations merged into one flow; gallery populated (`b550e4cd`) |
| 2026-04-22 | `aef47a8d`, `1dc67f5b`, `042ff0e3` | Install modal; tagline → "Make Claude Yours"; meta description |
| 2026-04-24 | `12610f0b` | One-line privacy FAQ edit |
| 2026-05-20 | `c878b214` | Linux install instructions (+17 lines) |
| 2026-07-15 | `20317009` | One-word privacy FAQ edit |
| 2026-07-16 | `e303a1bd` | Linux download routing (.deb/.rpm/.pacman) |

**Copy and mockups are frozen at 2026-04-22.** Since then `youcoded` master has taken **415 first-parent merges (2,273 commits)**.

## 2. The release gap (governs what the site may claim)

- Newest public release: **v1.2.4, tagged 2026-05-18**. Nothing newer. The site's download buttons fetch `releases/latest` → v1.2.4.
- v1.2.4 is the April-era product: Claude Code sessions only, no native harness, no local models, no Project View, no specialists.
- Everything in §4 dated 2026-06-12 or later exists **only on master / `1.3.0-beta.N` test builds**.
- Open v1.3 gates per `ROADMAP.md ## v1.3`: (3) Connect-GitHub live sign-in, (4) release mechanics.

Consequence: a site rewritten around the current product would, today, hand visitors a download that lacks most of what the page describes.

## 3. What the site says today (verbatim outline)

- **Nav sub-brand:** "For Claude Code by Anthropic". Links: About · Features · Download · FAQ · theme-cycle button.
- **Hero:** "Make Claude ___" cycling *Useful. / Fun. / Cute. / Yours.* over a theme crossfade midnight → halftone → strawberry-kitty → crème. No subhead, no CTA button.
- **About — "More than a chatbot."** Describes YouCoded as "an add-on of sorts for Claude Code". Ends: "Nothing happens without your permission."
- **What you get — "Everything the app gives you."** Seven showcase rows, each with a hand-built HTML/CSS mockup (960×600 `.mock-stage`, scaled by `transform: scale(calc(100cqw / 960px))`):
  1. Theme Builder (the only animated one — `runDemo()` swaps the frame to Golden Sunbreak on scroll-in)
  2. WeCoded Marketplace (static; Civic Report / Journaling Assistant / Todoist Inbox / Encyclopedia)
  3. Journaling & Personal History (static chat)
  4. Cross-Device Backup & Sync (static; "Reading backup manifest from Google Drive", "every 15m")
  5. Multiplayer Games (Connect 4 board drawn by JS, chat with "Jake")
  6. Integrations — 18 clickable service tags (Google ×7, Apple ×6, Todoist, GitHub, Chrome, Safari, Canva)
  7. "Everything else you get" — a 10-item accordion (Claude Code on Android, Better-than-native Remote Access, Sync & Restore, Themes/Wallpapers/Buddies, Marketplace, Skills & Integrations, Multiplayer, Permission & Safety, QoL, Uses Your Existing Claude Subscription)
- **Story — "How we got here."** Origin (journaling → friends → "kept adding things"); "someone who has never written code".
- **Get started — "You'll need a couple of accounts."** Anthropic [Required/Paid], Google or Apple [Required/Free], GitHub [Required/Free].
- **Download YouCoded** — Windows / macOS / Linux / Android cards → install modal (SmartScreen / Gatekeeper / distro picker / Play Protect), asset URLs + sizes from the GitHub releases API.
- **FAQ** (7): different from claude.ai? · data private? · what does $20/month get me? · platforms? · need to code? · agentic AI safe? · who built this?
- **Gallery — "See what people have built."** 7 screenshots (~12 MB of PNGs).
- **Footer:** MIT · "independent, community-built … not affiliated with … Anthropic".

Every mockup status bar reads `Opus 1M · Normal · 5h: 24% · Context: 76%`; composer says "Message Claude…".

## 4. Feature diff — v1.2.0 (2026-04-22) → master (2026-08-27)

### What the app WAS
A GUI for the Claude Code CLI on Windows/macOS/Linux/Android + browser remote access. One backend (Claude Pro/Max). Chat + terminal per session, tool cards, buddy floater, marketplace + skills, glass themes + `/theme-builder`, Google Drive/GitHub backup, Connect Four + presence, in-app updater.

### What was ADDED (all unreleased unless noted)
- **Native agent harness (Jul 2026):** the app runs its own agent loop — Bash/Read/Write/Edit/Glob/Grep/TodoWrite/AskUserQuestion/Skill/WebFetch/WebSearch with approvals (`5f423287`, `2fd316e1`); on by default (`f59a9976`); MCP servers (`448b2b0a`); images to the model (`f65fed18`); a stalled provider parks the turn instead of killing it (`28d3f82e`).
- **Any model:** bundled local llama.cpp engine — fully offline (`b5c30d01`); local model manager with catalog + Hugging Face search + GPU-fit warnings (`6cbf1ee8`); Settings → Model Providers: Claude Code / OpenRouter / Anthropic-OpenAI-Google keys / any OpenAI-compatible endpoint (Ollama, LM Studio) / local (`83ac53fb`, `provider-types.ts:4-8`).
- **Specialists (sub-agents):** hire a helper with a read-only or read-write charter (`8db46236`); helpers run in the background, survive restart, can be steered/resumed (`e5ec5b3c`); your own file-defined roster + Settings page (`62c1f182`).
- **Permissions:** Settings screen listing/revoking remembered "Always allow" rules (`0ec64427`); Bash grants exact / prefix / scoped (`542b7e23`); dismissing a question ends the turn honestly (`a2b23d1f`).
- **Sync spaces:** conversations + project files sync across devices over your own GitHub repos, instant relay, leases/"take over on this device" (`3bb8e878`…`61903850`); Google Drive / iCloud remain as an optional daily second copy.
- **Project View:** per-project hero with Artifacts / All files / Conversations / Context tabs; in-app xlsx/pdf/docx/csv/image viewers (`dd85cdfd`); real code editor in the artifact pane (`1cf9cbf2`); project-wide content search (`813a6c83`); in-app git review/stage/commit/discard (`3ceba774`); "Ask about this" from a selection (`a0478dea`); Deliverables card (`46fc331c`).
- **Chat Search:** local index over every past conversation, bundled `youcoded-chatsearch` plugin (`2f8b5671`).
- **Accounts & social:** profile/handle, friends, presence, block, data export (`3d62baa4`, `814365c4`); Connected Accounts row (`647bd242`).
- **UI overhaul:** 19 shared control primitives + full migration (`31900a2f`…`a5e6e8f1`); dialog/menu design system (`114f1591`); mobile pass at 640px (`f17d00cb`); design guide + review rig (2026-08-25); Phase A/C theme readability (`dbbb9139`, `885ac594`); mascot rigs (`bb2f468a`).
- **Sessions:** custom tags + notes (`af064d46`); send queue + real Stop (`e6d4ca3f`); unified model picker (`8db3d675`).
- **Released in v1.2.1–1.2.4:** Linux .deb/.rpm/.pacman (`4679cc89`), bug reports with environment snapshot, analytics rekeyed to a hardware-ID hash.

### Removed / renamed
- "Claude Code on every device" (README:3) and "an add-on for Claude Code" (site) no longer describe the product; Claude Code is now one provider among several.
- Sync model changed: **GitHub is now the primary** (conversations, projects, files in your own private repo, kept live on every device); **Google Drive / iCloud are an optional second copy** (daily dated backup via `sync-spaces/daily-backup.ts`; wording verified in `SyncPanel.tsx:33`). The old Drive-first backup path was demolished 2026-07-15 (`0a91850e`). **The site's "Google or Apple account [Required]" card, the Backup mockup ("Reading backup manifest from Google Drive … every 15m"), the Journaling "stored in your Google Drive, iCloud" line and FAQ 2 all describe the old model.**
- `youcoded-core` mid-deprecation (code-complete, unshipped) — do not claim gone.
- Bundled plugins 2 → 3 (+ chatsearch). Session drawer → "Session artifacts".
- Gemini CLI provider removed (Google discontinued it 2026-06-18).

### In flight (do not promise)
UI Phase D; context-truncation panel; Chat Search phase 2; resumable model downloads; Agents & Automations view (scheduler/run inbox); custom harness builder; LAN model serving; MCP settings UI; buddy floater on native Wayland (shelved).

## 5. Hard facts for the new copy

| Fact | Value |
|---|---|
| Platforms | Windows 10+, macOS 11+, Linux x64 (AppImage/.deb/.rpm/.pacman), Android 9+ arm64, any browser via remote |
| Sign-in / models | Claude Pro/Max · OpenRouter · Anthropic/OpenAI/Google keys · any OpenAI-compatible endpoint · bundled local engine (offline) |
| Accounts (Destin's framing for the site, 2026-08-27) | **GitHub required** (sync + marketplace); Anthropic optional; OpenRouter optional; Google / Apple optional (Drive / iCloud second-copy backup) |
| Site target | **1.3.0 — the first broad public release**; the site is rewritten pre-emptively for it (Destin, 2026-08-27) |
| Marketplace | **336 plugins** + 9 integrations + 14 prompt packs (site says "150+") |
| Themes | 7 community (Cotton Candy Sky, Devil's Garden, Golden Sunbreak, Halftone Dimension, Kuromi Dreamer, Meadow Mist, Strawberry Kitty) + 4 built-in (Light, Dark, Midnight, Crème) |
| Bundled plugins | themes builder, marketplace publisher, chat search |
| License | desktop MIT; Android GPLv3 |
| Privacy | one anonymous daily ping keyed by hardware-ID hash + region; opt-out Settings → About |
| Must keep | "independent, community-built … not affiliated with, endorsed by, or officially supported by Anthropic" |

## 6. Positioning inputs (from the workspace's own research)

Authority: `docs/active/specs/2026-07-09-platform-vision-roadmap.md` §2.2 and `docs/active/investigations/2026-08-26-native-tools-vs-other-harnesses.md`.

**The lane:** "nobody currently combines (a) local-first multi-model, (b) a friendly non-developer UI, (c) a social/marketplace layer, and (d) agent automations in one consumer app. Cowork/ChatGPT Work own 'agentic assistant for normal people' but are closed + cloud-only + single-vendor. OpenClaw/Hermes own 'own your agent' but are developer-hostile to set up." → **"the open, personal Cowork."**

**Claimable differentiators (with the doc that backs each):**
- Claude Code as a first-class session type *alongside* the app's own harness (vision §0/§7.1)
- Themes/personalization "best-in-class — nobody close"; social layer "unique"; WeCoded "a real moat"; desktop+Android+remote from one codebase "rare" (vision §2.2)
- Only harness whose Edit *and* Write refuse when a file changed since it was read (tools teardown §1)
- Only harness that lets the model delegate to a specific *priced* model by name (`ModelSearch`, §7.2)
- Persisted, resumable background specialists — "nobody has productized resumable multi-agent runs" (subagent research §2.7)
- Local models make scheduled agents free (vision §3.5) — *automations not built yet*
- Built entirely by a non-developer through conversation

**Honest gaps — never claim:** background/long-running commands (10-min kill), PDF/Word/Excel/notebook reading in the native harness, case-insensitive Grep, fuzzy Edit, semantic code search, LSP diagnostics, browser tool, scheduler/automations, custom harness builder, native runtime on Android (Phase 5), IDE features (explicit non-goal, ROADMAP:912).

**Competitors named but undescribed in our docs (make no factual claims):** T3 Code, Goose, Windsurf, Antigravity, Amp, Zed, Warp, OpenHands, Chatbox, Msty, TypingMind, AnythingLLM, LibreChat.

**Dependency caution:** headline sign-in relies on Anthropic goodwill (vision risk list) — comparative copy against Claude Code should stay respectful.

## 7. Site-specific defects found

- `og:image` points at `docs/og-image.png`, which does not exist (link previews are broken).
- Gallery is ~12 MB of PNG; several files 2–3.7 MB.
- Dead CSS: `.hero-tagline`, `.hero-btn`, `.steps-flow`, `.features-grid`, `.android-*` (JS un-hides a class no element has).
- Mockups show the April layout (no session tabs, no quick chips, `Opus 1M` chip, "Message Claude…"); the real app has session tabs, a quick-chip row, and a status bar of model · effort · permission mode · priority · theme.
- "$20/month" FAQ framing and "You'll need a couple of accounts" are wrong for local/OpenRouter users.
- HTML comment still calls the Sync mockup "Personal Librarian Brief".
