# Competitor/adjacent agent research — integrations, browser/computer use, tool philosophy

Compiled 2026-09-26 for YouCoded's integration-rebuild research. Six parallel research
passes were run (five background agents + the coordinator). NOTE ON THIS FILE'S HISTORY:
five agents wrote to this same path in parallel and a race condition meant only the last
writer's section (Hermes/Pi) survived on disk; the sections below for Claude Code, Codex,
OpenClaw, and the Goose/Gemini/Manus/Comet/Open Interpreter group were reconstructed from
each agent's own detailed final report text (not re-fetched), since that full detail is
not otherwise recoverable. Treat any nuance lost in that reconstruction as a risk; the
source URLs themselves are preserved from the original reports.

---

## Broader 2025-2026 debate: MCP vs CLI vs code-execution (coordinator research)

### The flashpoint
Eric Holmes ("MCP is dead. Long live the CLI", ejholmes.github.io, 2026-02-28) argued
LLMs are already good at using stable, well-documented CLIs (git, docker, kubectl) and
that MCP is often the wrong abstraction when a good CLI/API already exists. Bottom line
quote: "Ship a good API and a good CLI. The agents will figure it out." Hit #1 on Hacker
News, 400+ points, ~300 comments. https://ejholmes.github.io/2026/02/28/mcp-is-dead-long-live-the-cli.html

Counter-argument (enterprise/identity camp): CLI tool calls run under one shared
service-account identity — no per-user attribution, no selective revocation, audit trail
is just bash history. MCP's per-call auth model solves this, which is why regulated/
enterprise deployments keep MCP even as solo-developer tooling drifts to CLI+skills.
Discussed in: https://www.firecrawl.dev/blog/mcp-vs-cli ,
https://allen.hutchison.org/2026/03/14/mcp-isnt-dead-you-just-arent-the-target-audience/ ,
https://arize.com/blog/mcp-vs-cli-skills-for-agents-what-our-eval-found-and-which-you-should-use/

Emerging synthesis (multiple 2026 posts converge here): CLI for developer/solo workflows,
MCP for customer-facing/compliance-sensitive multi-tenant products; Claude Skills treated
as a third, complementary layer. Simon Willison reportedly called Skills "maybe a bigger
deal than MCP" (cited secondhand across several posts — Willison's original post not
independently re-fetched by coordinator, flag as **unverified primary source**).
See also: https://dev.to/trashwbin/cli-vs-mcp-vs-skills-the-whole-debate-is-asking-the-wrong-question-nc1

### Context bloat: the concrete numbers
- Anthropic, "Code execution with MCP: building more efficient agents" (anthropic.com/engineering, published **2025-11-04**): loading many MCP servers' tool defs upfront can burn ~150,000 tokens before a task starts (their Drive→Salesforce example). Fix: instead of calling tools directly, the agent explores a generated filesystem of typed code APIs (`servers/google-drive/getDocument.ts`, etc.) and writes code to orchestrate calls; intermediate results are processed in a sandboxed execution environment rather than round-tripping through the model. Result: 150,000 → 2,000 tokens (98.7% reduction) on that example. Anthropic's own guidance: use direct MCP tool calls for simple/low-tool-count cases; use code execution once you have many tools, large intermediate payloads, or multi-step orchestration; use **Skills** for persistent, reusable capability that accumulates as code over time (distinct from either raw MCP or ad hoc code-exec). https://www.anthropic.com/engineering/code-execution-with-mcp
- Independent reproduction scaled the pattern to 112 GitHub tools: ~150,000 → ~1,200 tokens (99.2% reduction). https://particula.tech/blog/code-execution-mcp-token-reduction-pattern
- Anthropic's separate "Tool Search Tool" (progressive tool discovery instead of loading everything) claims 85% token reduction while keeping the full tool library reachable. Discussed alongside code-exec and Cloudflare's approach: https://mcp.directory/blog/mcp-context-bloat-fix-2026-tool-search-code-mode-progressive-disclosure , https://medium.com/ai-software-engineer/anthropic-just-solved-ai-agent-bloat-150k-tokens-down-to-2k-code-execution-with-mcp-8266b8e80301
- Cloudflare "Code Mode" (blog.cloudflare.com/code-mode/ and /code-mode-mcp/): exposes only `search()` and `execute()` to the model; the model writes JS/TS against a generated typed SDK, executed in a sandboxed V8 "Dynamic Worker" isolate (no filesystem, no env vars, outbound calls only via explicit handlers). Claim: 2,500+ API endpoints, 1.17M → ~1,000 tokens (~99.9% reduction) because chained calls' intermediate outputs never have to pass back through the model. This is architecturally the closest published analog to what YouCoded would need if it wants an MCP-compatible but token-cheap integration layer. https://blog.cloudflare.com/code-mode-mcp/

### Evidence specifically for small/local models (directly relevant to YouCoded's llama.cpp support)
- MCP-Bench (ICLR 2026 / arXiv 2508.20453): weak/small models (e.g. Llama-3.1-70B-class) degrade steadily as task complexity and tool/server count rise, while frontier models (o3, GPT-5-class) stay flat. Multi-server settings hurt weak models specifically: one cited model's score fell from 0.438 (single server) to 0.415 (multi-server) — a real but modest single-model drop; do not over-read as a universal law. https://arxiv.org/pdf/2508.20453
- A separate benchmark (cited via search summary, not independently re-fetched — **flag as secondary-source, verify before quoting exact numbers**) reported a "cliff" rather than gradual decay: ~perfect success at 10 tools, 19/20 at 20 tools, complete collapse for both large and small models at 107 tools. This "cliff not slope" framing recurs across multiple 2026 MCP-tooling posts and matches Anthropic's and Cloudflare's own stated motivation for code-mode/tool-search, so directionally credible even though the exact source benchmark wasn't independently verified.
- "Beyond Fluent Generation: A CPU Reliability Benchmark for MCP-Style Tool Calling in Sub-2B Small Language Models for Edge Deployment" (arXiv 2609.07370, 2026) — purpose-built benchmark for sub-2B models on CPU/edge, i.e. exactly YouCoded's local-llama.cpp use case. Not deeply read by coordinator; **flag for follow-up read** if we need hard numbers for small local models specifically. https://arxiv.org/html/2609.07370
- Practical upshot for YouCoded: our smallest local models are far more tool-count-sensitive than Anthropic/OpenAI's own frontier models, which is the strongest argument in this whole research pass for NOT shipping "one MCP server per integration, all loaded always" — favor either (a) a small, curated set of always-on built-in tools per platform (Gmail/Calendar/Drive/Outlook each as ~3-5 tools, not 30), or (b) code-exec/code-mode style access where the model sees a tiny `search()`/`execute()` surface and only pulls in a tool's full schema when it actually needs it, or (c) skills that wrap the integration behind a single instruction file + a couple of CLI calls, closer to the CLI-first camp's approach. This maps directly onto the OpenClaw/Pi "CLI+skills" pattern found below.

### Third-party OAuth/integration brokers (Composio, Pipedream Connect, Arcade)
Relevant to YouCoded because these are the "don't build your own OAuth plumbing" option:
- **Composio**: largest catalog (~1,000+ APIs / 250+ deep integrations), TypeScript SDK, fastest time-to-first-tool-call; handles token storage/refresh but (per comparison sites) "stops short of enforcing who's actually allowed to do what" — i.e. thinner permission model. https://composio.dev/content/agent-connectors , https://www.pkgpulse.com/guides/composio-vs-arcade-vs-pipedream-connect-ai-agent-tools-2026
- **Arcade**: founded by ex-Okta people; positions itself on proper per-user OAuth delegation (agent acts *as* the specific user, not a bot/service account) plus a CI-style eval framework for testing tool-calling before deploy. ~112 integrations across 9 categories — narrower catalog, stronger auth story. https://www.pkgpulse.com/guides/composio-vs-arcade-vs-pipedream-connect-ai-agent-tools-2026
- **Pipedream Connect**: 2,800+ apps, native MCP server support, best if you already use Pipedream for workflow automation. Note: per the Goose/Manus/etc. research pass, Pipedream was **acquired by Workday** in 2026 — its long-term neutrality/independence as an infra vendor is now an open question. https://nango.dev/blog/best-mcp-servers-for-agent-api-integrations/
- All three are commercial SaaS with a free tier; none of the three is something YouCoded would self-host/fork — they'd be a "pay a vendor to run the OAuth broker" decision, not a code-reuse decision. **Not independently verified: exact pricing/free-tier limits for a self-hosted open-source app like YouCoded** — would need direct vendor contact before committing.
- Cross-check from the wider survey: of the six flagship products researched (Goose, Gemini CLI, ChatGPT/Codex, Manus, Comet, Open Interpreter), **none use a third-party broker for their own flagship integrations — all use direct vendor OAuth**, which suggests brokers are more of a "build your own agent fast" tool for smaller/indie projects than something the major players themselves rely on.

### Why "bring your own GCP project" is the default and why it hurts non-developers
Cross-checked across three sources — Google's own Workspace MCP config docs, an independent MCP server (`taylorwilsdon/google_workspace_mcp`), and a first-person "OAuth humbled me" writeup:
- **Google Workspace's own documented default is "bring your own OAuth client in your own Google Cloud project."** There is no Google-hosted generic "connect any third-party agent" OAuth app the way claude.ai has for its own product. https://developers.google.com/workspace/guides/configure-mcp-servers
- `taylorwilsdon/google_workspace_mcp` (GitHub, **MIT license, ~3.2k stars, ~1.0k forks** — active, popular, directly reusable): 120+ tools across 12 Google services (Gmail 15, Drive 16, Calendar 7, Docs 19, Sheets 14, Slides 7, Forms 6, Tasks 6, Contacts 8, Chat 6, Custom Search 2, Apps Script 15). Requires the end user to create their own GCP project and OAuth client; credentials never leave the user's environment. Strong reuse candidate for a self-hosted, non-broker YouCoded integration, **but it inherits the same non-developer friction described below** since it doesn't solve the OAuth-app-ownership problem, only the "which API calls to make" problem. https://github.com/taylorwilsdon/google_workspace_mcp
- First-person account (dev.to, "I thought giving my group chat AI assistant Google Calendar would take 5 minutes, and then OAuth humbled me"): framed as "infrastructure work disguised as a simple API call." Concrete pain points — creating a GCP project, configuring the OAuth consent screen, picking scopes, managing refresh-token lifecycle, and Google's quota limits (10,000 req/min per project, 600 req/min per user). Explicit advice: use a dedicated bot account rather than the human's personal Google account (a personal calendar leaks meetings/health/travel info to the agent), start read-only, and expect ongoing operational cost (backoff, caching, quota monitoring) — this is NOT a "click once and forget" integration once you're off a fully managed platform. https://dev.to/lars_winstand/i-thought-giving-my-group-chat-ai-assistant-google-calendar-would-take-5-minutes-and-then-oauth-93d
- A separate explainer site, openclaw.direct, describes a similar OpenClaw Google-Workspace setup flow using a CLI it calls `gws`, with the same bring-your-own-GCP-project model, plus OAuth "Testing" mode friction (only pre-listed test-user accounts can authorize the app; refresh tokens expire after ~7 days in Testing mode until the app passes Google's verification review). **The OpenClaw-focused research pass (see below) independently confirmed OpenClaw's actual Google tool is named `gog` (github.com/openclaw/gogcli), not `gws`** — so openclaw.direct's specific tool name is contradicted by the primary-source research and should be disregarded; the general OAuth-friction pattern it describes still matches the primary findings though.

**Implication for YouCoded:** every path that avoids a broker (Composio/Arcade/Pipedream) or a vendor-hosted OAuth app (like claude.ai's own Google connectors) pushes GCP-project creation onto the end user — a multi-step, jargon-heavy flow ("OAuth consent screen," "test users," "scopes," "verification") that is hostile to a self-declared non-developer audience. The only ways to avoid this: (1) YouCoded ships its own verified OAuth client (Anthropic/Google-style vendor-owned app) and eats the Google app-verification process itself once, centrally; or (2) YouCoded integrates a broker (Arcade looks like the best per-user-auth fit; Composio the broadest catalog) and eats their vendor fee/dependency instead; or (3) YouCoded punts to browser-session-based automation (see Perplexity Comet note below) which needs no OAuth app at all but is fragile and ToS-risky.

---

## Hermes Agent (Nous Research) & Pi (badlogic pi-mono coding agent)

Full section preserved verbatim from its original research pass — see
`02-hermes-pi-section.md` in this scratchpad for the complete ~110-line writeup with all
sources. Key points:

**Hermes Agent**: MIT-licensed, `NousResearch/hermes-agent`, viral growth since Feb 2026
launch (star/contributor counts unverified via raw GitHub API, rate-limited during
research — treat as directional). Ships 40+ built-in tools (web search, browser
automation, vision, image gen, TTS) plus cron scheduler and subagent spawning; explicitly
hybrid on MCP (bundles tools AND supports attaching any MCP server) — opposite of Pi's
approach. Browser automation built on open-source **Browser Use CLI 3.0**, attaching to
local Chromium via CDP or falling back to cloud providers (Browserbase, Firecrawl) or
alternative engines (Lightpanda, Camoufox). Skills follow the **agentskills.io open
standard**, near drop-in compatible with Claude Code's SKILL.md. Messaging gateway covers
Telegram/Discord/Slack/WhatsApp/Signal/Teams. **Key finding: Google Workspace integration
requires the end user to personally create a Google Cloud project and OAuth client ID —
no vendor-hosted flow, no broker** — exactly the non-developer-hostile pattern to avoid.
Documented GitHub issues (#5910, #47950, #44710) show real OAuth/auth reliability bugs in
Nous's own login layer. Sources: https://github.com/NousResearch/hermes-agent ,
https://hermes-agent.nousresearch.com/docs/integrations/ ,
https://hermes-agent.nousresearch.com/docs/user-guide/skills/google-workspace

**Pi (badlogic/pi-mono)**: confirmed this is Mario Zechner's coding-agent harness (the
engine behind OpenClaw), not Inflection's chatbot. MIT-licensed, very active (6,548+
commits). Primary-source-verified (Zechner's Nov 2025 blog, corroborated by Armin
Ronacher's Jan 2026 post and a Syntax.fm episode with both): Pi ships **exactly four
tools — read, write, edit, bash** — sub-1,000-token system prompt, **zero MCP support in
core**. Direct quote: Playwright MCP and Chrome DevTools MCP "dump their entire tool
descriptions into your context... That's 7-9% of your context window gone before you even
start working." Alternative: CLI tools + READMEs read on demand (progressive disclosure).
MCP available only via third-party extension (`pi-mcp-adapter`) proxying MCP through a
single ~200-token tool with lazy/on-demand connections — a good design pattern to borrow
regardless of where YouCoded lands on MCP. **No Google/Microsoft/Apple/browser-automation
capability exists anywhere in the Pi ecosystem** — this whole integration problem is
simply out of scope for the project, consistent with "just use bash."
Sources: https://mariozechner.at/posts/2025-11-30-pi-coding-agent/ ,
https://lucumr.pocoo.org/2026/1/31/pi/ , https://pi.dev/packages/pi-mcp-adapter

---

## Claude Code / Claude.ai / Claude in Chrome / Cowork

**claude.ai Connectors (Google Workspace).** Real, vendor-owned, one-click OAuth
connectors on all plans including Free: `+` → Connectors → toggle Gmail/Calendar/Drive →
Google sign-in → approve. https://support.claude.com/en/articles/10166901-use-google-workspace-connectors
**BUT these largely don't work from Claude Code CLI** — three separate open GitHub
issues confirm connectors show only auth-stub tools or don't load at all in the CLI:
https://github.com/anthropics/claude-code/issues/71711 ,
https://github.com/anthropics/claude-code/issues/29345 ,
https://github.com/anthropics/claude-code/issues/62479 . A real bridge exists but is
developer-grade: Google's own remote MCP servers (`gmailmcp.googleapis.com`,
`calendarmcp.googleapis.com`) addable via `claude mcp add --transport http`, requiring
your own OAuth client and a paid plan — not a one-click flow. Also broken: no re-auth
action, only disconnect/reconnect (issue #81020); missing write ops like move/rename/
delete (issue #51040).

**Microsoft 365.** Confirmed real, Anthropic-hosted proxy connector (Outlook/SharePoint/
OneDrive/Teams), now on all plans. https://www.uctoday.com/productivity-automation/anthropic-expands-claude-microsoft-365-integration-for-all-user-plans/ ,
https://support.claude.com/en/articles/12542951-set-up-the-microsoft-365-connector

**Claude in Chrome.** Real extension, paid plans only, screenshot+click+form-fill+
navigate. Serious disclosed vuln "ShadowPrompt" — zero-click prompt injection via
wildcard origin allowlist + third-party XSS, patched v1.0.41 Feb 19 2026, could steal
Gmail tokens/exfiltrate Drive data. https://thehackernews.com/2026/03/claude-extension-flaw-enabled-zero.html
(also covered by SOCRadar and SecurityWeek). No primary Reddit threads on day-to-day
breakage were found — flagged as a research gap.

**Computer use.** Still a live API tool; screenshot+coordinate-action loop, recommended
XGA resolution, runs in a sandboxed VM/container. Anthropic publishes the full reusable
pattern in the quickstart repo — no proprietary library needed:
https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/README.md

**Cowork — CONFIRMED REAL**, not speculative. Launched Jan 12 2026 (Max-only, macOS, VM
sandbox via Apple Virtualization Framework), Windows added Feb 10 2026 (needs Hyper-V,
absent on Windows Home), no native Linux app, expanded to web/mobile July 7 2026, merged
into main chat UI Sept 16 2026. Access tier evolved from Max-only to "all paid plans, not
Free" over the year — a genuine timeline shift, not a contradiction between sources.

**MCP philosophy.** Anthropic's Nov 4 2025 post "Code execution with MCP" (see broader
debate section above for full detail): loading all tool defs upfront doesn't scale; fix
is having the agent write code to discover/call tools via a filesystem-like tree, cutting
one example from 150k→2k tokens (98.7%). Skills (SKILL.md) are explicitly framed as
complementary, not competing: MCP = connectivity, Skills = methodology, with a three-tier
progressive-disclosure design (name/description → full body → bundled files).
https://www.anthropic.com/engineering/code-execution-with-mcp

**Apple/iCloud.** No first-party Anthropic connector exists — confirmed gap. Only
community self-hosted MCP servers found (epinethrone/icloud-mcp, MrGo2/icloud-mcp,
apple-reminders-mcp).

**Flagged as unverified/uncertain:** exact current computer-use tool-type string
(secondary-sourced only); a second vulnerability nicknamed "ClaudeBleed" (single-source,
not cross-confirmed like ShadowPrompt); no primary Reddit complaint threads found for
Claude-in-Chrome despite two search attempts.

---

## OpenAI Codex (CLI + Codex app / ChatGPT connectors)

**Connectors/Apps setup (non-dev UX).** Two overlapping generations exist. "Connectors"
(legacy, 8 services: Dropbox/Gmail/Calendar/Drive/Teams/Outlook×2/SharePoint) are
vendor-owned OAuth — user clicks Connect, signs in, no API keys needed. `connector_id` is
being deprecated for models released after 2026-09-01 in favor of MCP-based "Apps."
https://developers.openai.com/api/docs/guides/tools-connectors-mcp . Setup is ~3 clicks +
OAuth screen; in Codex CLI it's `/plugins` → connect → **must restart session** before
tools appear (a real, concrete failure point). Consumer Gmail accounts can't use
Workspace-admin setup. A June 2026 scope expansion means pre-6/15 connections need manual
reconnect to get write access. https://www.usecarly.com/blog/chatgpt-work-google-workspace-integration/

**MCP.** TOML config at `~/.codex/config.toml`, `[mcp_servers.<name>]` tables, STDIO or
Streamable HTTP, shared across ChatGPT desktop/CLI/IDE extension.
https://learn.chatgpt.com/docs/extend/mcp?surface=cli . OpenAI caps `instructions` at 512
chars and offers enable/disable/approval knobs — aware of context bloat, but GitHub issues
(#3441, #27844, #20710) show real reliability gaps (servers silently not loading,
"installed" UI lying about connection state).

**Skills.** Codex mirrors SKILL.md directly — `.agents/skills` directories (not
`.claude/skills`), YAML frontmatter, plus an OpenAI-specific `agents/openai.yaml` for
UI/invocation metadata. https://learn.chatgpt.com/docs/build-skills

**Computer use/browser.** Rebuilt three times in ~18 months — Operator (shut down Aug
2025) → Atlas browser (shut down Aug 2026) → "ChatGPT agent" (removed without notice, Aug
2026 — this framing came from a search summary, not a direct primary-source fetch, flag
accordingly) → now folded into ChatGPT/Codex proper, powered by GPT-6 Astra (shipped
2026-09-03). `computer-use-preview` API model was shut down 2026-07-23.
https://openai.com/index/gpt-6-astra/

**Plugins.** Name returned July 2026 as bundles of Apps+Skills; Apps SDK explicitly
framed as "here to stay."

**Apple.** No iCloud Mail/Calendar/Contacts found. Only iMessage (Mac, Apple Silicon only,
Work/Codex plans only, local AppleScript-based, shipped ~Aug 2026) — Proton called it "a
backdoor." https://proton.me/blog/chatgpt-apple-messages

**Underlying libraries.** OpenAI's own connectors are closed/first-party — no reusable CLI
found. But independent open-source Gmail MCP servers exist that YouCoded could adopt
directly: GongRzhe/Gmail-MCP-Server, navbuildz/gmail-mcp-server, BreazyLabs/OutreachEmailMCP.

**Flagged as unverified/secondary-source:** the Gmail "one email per prompt" safety-rail
claim, the "ChatGPT agent removed without notice" framing, and an MCP "method not found
causes fatal crash" claim.

---

## OpenClaw (formerly Clawdbot/Moltbot)

**It's real, and it's huge.** Created by Austrian dev Peter Steinberger. Launched
2025-11-24 as "Warelay" (earlier personal project "Clawd"), renamed "Clawdbot," then
"Moltbot" (2026-01-27, after an Anthropic trademark complaint), then "OpenClaw" three days
later (2026-01-30). Steinberger left for OpenAI on 2026-02-14; stewardship moved to the
nonprofit **OpenClaw Foundation**. GitHub: github.com/openclaw/openclaw, MIT license
(verified by reading the raw LICENSE file directly — GitHub's API metadata oddly shows
"NOASSERTION" but the file itself is standard MIT). Live-verified via `gh api`:
**390,575 stars, 82,158 forks, 8,703 open issues, pushed within the hour** — extremely
active. https://en.wikipedia.org/wiki/OpenClaw ,
https://www.cnbc.com/2026/02/02/openclaw-open-source-ai-agent-rise-controversy-clawdbot-moltbot-moltbook.html ,
https://www.forbes.com/sites/kateoflahertyuk/2026/02/06/what-is-openclaw-formerly-moltbot--everything-you-need-to-know/

**Google.** The tool is `gog` (github.com/openclaw/gogcli, MIT, Go binary for Gmail/
Calendar/Drive/Docs/Sheets). **No shared OAuth client** — each user must create their own
Google Cloud project, enable APIs individually, make a Desktop OAuth client, and register
it via `gog auth`. Multiple independent guides confirm this is genuinely painful for
non-developers, plus a known gotcha: leaving the OAuth consent screen in "Testing" mode
causes Google to silently expire tokens after 7 days.

**Apple.** `imsg` (github.com/openclaw/imsg) — OpenClaw's own Swift CLI for iMessage, not
a wrapper of a third-party tool; talks to Messages.app's database directly and drives it
via AppleScript. Needs Full Disk Access + Automation permissions; advanced features need a
"private API probe" that involves **disabling SIP** — flagged in OpenClaw's own docs as
beyond typical user comfort. `remindctl` (github.com/openclaw/remindctl) handles Reminders
via Apple's public EventKit API. Both MIT, both original OpenClaw creations (NOT
icalBuddy-based, contrary to the initial research hypothesis).

**Browser automation.** CDP-based, with Playwright for advanced actions — sourced from
OpenClaw's own docs via a secondary summary, not independently re-fetched, so treat as
likely-correct-but-secondary.

**ClawHub — the security story is real and well-documented, not vibes:**
- **Koi Security** (2026-02-01/02, https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html):
  found 341 malicious skills out of 2,857 audited, dubbed "ClawHavoc." 335 skills used
  fake "prerequisite" instructions to drop **Atomic Stealer (AMOS)**, a real macOS
  infostealer; others carried reverse shells and keyloggers. One skill, "What Would Elon
  Do?," was downloaded thousands of times.
- **Antiy Labs'** deeper retrospective (antiy.net) puts the cumulative historical count at
  1,184 malicious skills — not contradicting Koi's 341 (point-in-time sample vs. full
  cumulative campaign total), but worth citing both carefully.
- **Snyk** (2026-02-10, snyk.io) found a fake Google-integration skill using the same
  "install this prerequisite" social-engineering trick to deliver reverse-shell malware,
  plus "widespread credential leaks" across the registry generally.
- **Cisco** built a proof-of-concept demonstrating the "What Would Elon Do?" skill
  silently exfiltrating data via prompt injection (blogs.cisco.com/ai/) — this is Cisco's
  general security blog, not confirmed as Cisco Talos specifically.
- **Root cause:** ClawHub's only publish gate was a GitHub account at least one week old —
  no code review, no scanning. Response has been reactive (crowd-reporting, auto-hide
  after 3 reports), not preventive. **No CVE numbers found** for any of this.
- Separately, a "MoltMatch" incident (an agent autonomously creating dating profiles using
  other people's photos) and reported Chinese government restrictions are alignment/
  autonomy issues, distinct from the ClawHub supply-chain problem.

**Tool philosophy.** CLI+skills-first (SKILL.md, six-source loading hierarchy), **plus
first-class MCP support** — not either/or. Skills wrap CLIs like `gog`/`imsg`/`remindctl`
with the user's full OS permissions, which is exactly the privilege level the ClawHavoc
attacks exploited.

**Gaps not closed:** no direct Reddit/HN complaint threads found (only blog/press
coverage); Apple Mail/Calendar/Contacts CLI tools beyond `gog`/`imsg`/`remindctl`
unconfirmed; browser-automation docs not directly re-fetched; several secondary figures
(gog/imsg/remindctl star counts, contributor counts) came from AI-summarized fetches
rather than independent verification.

---

## Other agents: Goose, Gemini CLI, ChatGPT agent, Manus, Perplexity Comet, Open Interpreter

**Goose (Block → Agentic AI Foundation).** Apache-2.0, ~54.5k stars, MCP-native (70+
extensions), governance moved from Block to the Linux Foundation's new Agentic AI
Foundation in 2026. Google Drive access comes via a generic MCP extension, not a
dedicated "Workspace" product; no confirmed Microsoft 365 extension. Non-developer setup
is "click to install extension" in the desktop app; no specific user-complaint threads
found. https://block.xyz/inside/block-open-source-introduces-codename-goose ,
https://github.com/aaif-goose/goose

**Gemini CLI.** Major twist: **Gemini CLI was retired June 18, 2026**, replaced by
"Antigravity CLI/2.0" as Google consolidated its dev-tool branding. While it existed,
Google shipped a first-party Workspace extension (Gmail/Drive/Docs/Sheets/Slides/Calendar/
Chat) with smooth Google-account OAuth (confirms the "smooth since it's Google's own
ecosystem" assumption for the normal case; headless machines needed a manual URL-copy
flow). No Microsoft/Apple support found.
https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ ,
https://github.com/gemini-cli-extensions/workspace

**ChatGPT agent/Connectors (web/app, distinct from Codex CLI covered above).** The
standalone "agent" mode was itself removed in **August 2026**, folded into "ChatGPT Work"
(GPT-5.6, launched July 2026, ~1,400 connectors). Connectors use real vendor OAuth
(Google's/Microsoft's own consent screens), not a broker — confirmed via multiple
secondary sources (OpenAI's own help page returned 403 on direct fetch). Gained write
actions in 2026 (send email since June 8). Gap: connectors reportedly work only in the
**web app**, not Windows/Mac desktop apps. Complaint: Gmail connector called "OpenAI's
next flop." https://www.usecarly.com/blog/chatgpt-connectors/ ,
https://4sysops.com/archives/chatgpt-gmail-connector-openais-next-flop/

**Manus.** Wild ownership year — Meta agreed to buy for ~$2B (Dec 2025), China's regulator
blocked it (Apr 27, 2026), Meta cut ties (June 2026), Manus is independent again (Aug 11,
2026). Still active/shipping. Architecture: sandboxed cloud "virtual computer"
(browser+terminal+files) plus an optional local "My Computer" mode (Mar 2026). Has real
Google Drive/Gmail/Calendar connectors AND a Microsoft partnership (Agent 365, Nov 2025)
plus OneDrive — the deepest Microsoft story of any product surveyed.
https://www.cnbc.com/2026/04/27/meta-manus-china-blocks-acquisition-ai-startup.html ,
https://manus.im/blog/manus-microsoft-agent365

**Perplexity Comet.** The "just uses the logged-in browser session, no OAuth" assumption
was only half right — ad hoc browsing does ride the session, but Gmail/Calendar
connectors require an explicit OAuth grant (per Perplexity's help center). Security
research here is serious and real: Zenity Labs found a **zero-click** calendar-invite
attack exfiltrating local files/1Password creds (fixed by blocking `file://` access);
Trail of Bits, LayerX, Brave, and STAR Labs each found separate prompt-injection exploits,
including one that silently wipes Google Drive. OpenAI reportedly said this bug class may
never be fully solved. Usability complaints: laggy, confusing sidebar, "5-minute uninstall"
reports. https://labs.zenity.io/p/perplexedbrowser-perplexity-s-agent-browser-can-leak-your-personal-pc-local-files ,
https://blog.trailofbits.com/2026/02/20/using-threat-modeling-and-prompt-injection-to-audit-comet/

**Open Interpreter — biggest surprise of this whole survey.** The original "let an LLM
run code on your machine" Python project has been superseded by a ground-up **Rust
rewrite forked from OpenAI Codex**, repositioned as a coding agent for cheap open models
(Kimi K3, GLM 5.3). The classic project now survives only as an unofficial community fork
(`endolith/open-interpreter`). New philosophy favors shared standards (AGENTS.md, MCP,
ACP) over raw bash access; no Google/Microsoft integration at all.
https://github.com/openinterpreter/openinterpreter

**Other 2026 entrants noted in passing.** Cognition merged Windsurf into "Devin Desktop"
(June 2026), using the cross-vendor Agent Client Protocol (ACP) plus bidirectional MCP;
Zed added native parallel-agent threads; Cursor 3's agent-first UI is polarizing among
users.

**Flagged as unverified/uncertain:** OpenAI help-center pages returned 403 on direct
fetch (secondary sources relied on instead); no primary Reddit/HN threads surfaced for
Goose or ChatGPT complaints (blog aggregation only); Comet's Zenity fix date (Feb 13)
slightly predates its own disclosure date (Mar 3) in the sourcing found, reported as-is.
