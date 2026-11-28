# Browser & Computer Use for YouCoded — Research Findings (2026-09-26)

Scope: web-only research, read-only. Today is 2026-09-26. Flagging anything that looks
unverified or vendor-marketing rather than confirmed fact.

## 1. Browser automation options

### 1.1 Ranked table

| Option | Approach | Plausibility for YouCoded | Difficulty | Maintenance | Token cost | Model reqs | Security | Setup UX |
|---|---|---|---|---|---|---|---|---|
| **Playwright MCP** (microsoft/playwright-mcp) | Bundled Chromium/Firefox/WebKit driven via MCP, accessibility-tree snapshots (no screenshots needed) | High — official, mature, works with any tool-calling model | Low (drop-in MCP server) | Low (Microsoft-maintained, active) | **High** — full a11y tree resent every call; real-world: ~114K tokens/task vs 27K for CLI equivalent | No vision required; needs decent tool-calling | Runs a separate/bundled browser, not user's logged-in Chrome by default | Easy — `npx @playwright/mcp` |
| **Playwright CLI** (microsoft/playwright-cli, new 2026) | Same engine, but exposed as shell commands + a Claude/Codex "skill" instead of MCP tool schemas; writes results to disk, agent reads only what it needs | High — Microsoft's own recommended path for "coding agents," fits YouCoded's Bash-tool model well | Low-Medium (needs a Bash tool + skill install) | Low (new, actively shipped by MS in 2026) | **Low** — ~4-10x fewer tokens than MCP per Microsoft/community benchmarks | Works with weaker/local models since it needs less context per step | Same browser isolation properties as Playwright MCP | Easy; `playwright-cli install --skills` |
| **Vercel agent-browser** | Rust/Node CLI, three modes: headless Chromium, **real Chrome with profile support**, or cloud remote browser | High — directly supports the "use the user's logged-in Chrome" need | Low-Medium | Medium (young project, Vercel-backed) | Very low — vendor claims up to 93% less context than "traditional solutions" (self-reported, unverified) | Model-agnostic, no vision needed | Real-profile mode raises the isolation questions below | Easy npm install |
| **Chrome DevTools MCP** (Google, ChromeDevTools/chrome-devtools-mcp) | MCP server over CDP/Puppeteer against a real local Chrome instance; strong devtools/perf/network introspection | Medium-High for dev/debug workflows, less suited as the general "browse the web for me" tool | Low | Low (Google, weekly release cadence, v0.21 by April 2026) | Medium-High (screenshots + DOM/network dumps) | Vision helpful for screenshot flows | Can attach to a real profile via CDP — same relay risk noted below | Easy |
| **browser-use (Python)** | Open-source agent loop (not just driver) that plans+acts on top of Chromium; has a paid Cloud tier (hosted agents/browsers) | High for "give it a goal, it browses" style tasks | Medium (Python dependency, own agent loop competes with YouCoded's harness) | Medium — large OSS project (~108k GitHub stars per late-2026 reports), fast-moving | Medium (vision-based reasoning loop, higher token use than a CLI) | **Works best with vision-capable models**; weaker with small local models | Own sandboxing model; cloud tier adds stealth/anti-bot proxies (raises its own trust questions) | Medium — Python env, API keys for cloud |
| **Stagehand (Browserbase)** | SDK layer (act/extract/observe/agent) over Playwright with natural-language step resolution; Browserbase is the paired cloud browser host | Medium — good for "site changed, don't break" resilience, less needed if YouCoded already has an agent loop | Medium | Medium (backed by funded startup, v3 shipped 2026) | Medium (LLM calls per act/extract) | Needs decent instruction-following; TS/Python/Go/Rust/Java SDKs by 2026 | Cloud-hosted option means page content leaves the device unless self-hosted | Medium |
| **Steel / Hyperbrowser** | Cloud/self-hostable "browser infrastructure" (anti-bot, proxies, concurrency) aimed at scraping/agents at scale | Low-Medium for YouCoded's use case (personal assistant, not scraping at scale) | Medium (Steel self-hosts; Hyperbrowser is pure SaaS) | Medium | N/A (infra, not a reasoning layer) | N/A | Cloud SaaS = third-party sees traffic unless self-hosted (Steel) | Medium-High (accounts, billing) |
| **dev-browser skill** (SawyerHood/dev-browser, forked widely) | A Claude Skill: persistent Chrome controlled via short **sandboxed QuickJS/WASM** scripts, no host FS/network access from the script itself | Medium-High — designed exactly for "Claude agent + Bash tool" setups like YouCoded's harness | Low (it's literally a skill you drop in) | Unknown/low — small community project, several forks, unclear long-term maintenance | Low (persistent state avoids re-navigating each turn) | No vision required | Sandboxed script execution is a plus; browser itself still needs profile-isolation decisions | Easy (skill install) |
| **Claude in Chrome extension** | Anthropic's own extension, GA on paid claude.ai plans since Aug 26, 2026 | **Low for YouCoded** — it authenticates against claude.ai/Claude Code login, not API keys; explicitly does **not** work with Bedrock/Vertex/Foundry or API-key/long-lived-token auth, so a multi-provider app like YouCoded can't wrap it | N/A (not embeddable by a third-party app) | N/A | N/A | N/A | Anthropic-controlled, out of YouCoded's control | N/A — not usable as a component |

### 1.2 The core architectural question: real Chrome profile vs. bundled browser

Three concrete patterns showed up repeatedly across vendor docs and independent writeups:

1. **CDP relay** — launch Chrome with `--remote-debugging-port`, forward that socket to the agent. This is how Playwright/Puppeteer "attach to my browser" flows work. Caveat found in multiple sources: **since Chrome 136, `--remote-debugging-port` is ignored for the *default* profile directory** — you get a fresh, logged-out profile unless you point at a copied/alternate profile dir. The CDP token is described as "a full-session credential" — whoever holds it can read every page and keystroke; no read-only mode exists.
2. **Browser extension** — a real Chrome extension (MV3) with the `debugger` permission gets CDP-equivalent power but scoped to tabs it's explicitly attached to, running natively inside the user's real, logged-in browser with device-bound 2FA/passkeys intact. Multiple sources (OpenClaw docs, an independent "extension vs CDP relay vs cloud browser" writeup) converge on this as the safer pattern **when you need the user's actual logged-in identity**, because scope is inspectable and nothing leaves the device over a network relay.
3. **Cloud/bundled browser** — either a fully separate Chromium (agent-browser headless mode, Browserbase/Steel/Hyperbrowser cloud sessions) or a **dedicated local profile that's never the user's real one** (OpenClaw's default `openclaw` profile). Safer by default (blast radius = a throwaway profile) but can't act as the user's logged-in self on sites like banking, university portals, or social media unless the user separately logs into that dedicated profile.

**OpenClaw's own architecture is instructive** (read via its docs): default behavior is a *dedicated* agent-only browser profile, with an *opt-in* "user profile" mode that goes through Chrome DevTools MCP to reach the real signed-in browser, plus explicit cookie-import restrictions (macOS: only selected cookies transfer, localStorage/IndexedDB stay isolated). This is close to the shape I'd recommend for YouCoded.

### 1.3 Electron-specific: `webContents.debugger` as a built-in browser pane

This is real, documented, and already used by others:

- Electron's `webContents.debugger` API is an official, first-class API — "an alternate transport for the remote debugging protocol," attachable to any `BrowserWindow`/`WebContentsView`'s webContents from the main process. Confirmed via Electron's own docs.
- This means YouCoded could embed a visible `BrowserWindow`/`WebContentsView` as an "assistant browser" pane, drive it via CDP through `webContents.debugger` (no external Chrome process, no relay, no network exposure), and the user watches it live — closest analogue to what ChatGPT Atlas / browser-embedded agents do, but self-contained inside YouCoded's own Electron process.
- Caveats found: known Electron bugs/issues around debugger-attached webviews (a main-process crash issue #53819 on destroying a `<webview>` with an attached debugger session, filed against recent Electron; and issue #27768 about CDP Fetch domain breaking across Electron versions). Also, `webContents` **stops emitting `unresponsive` events while a debugger is attached** (issue #54323) — meaning YouCoded's own hang-detection would need a workaround for this pane specifically. There is a small open-source wrapper, `electron-cdp` (ntoskrnl7), but I found **no mature, widely-adopted open-source project that packages "Electron BrowserWindow as an agent-driven browser pane"** end-to-end — this appears to be a gap YouCoded would be building somewhat from scratch, not adopting. *(Flag: I did not find a named prior-art project doing exactly this; absence of evidence isn't proof none exists, but nothing surfaced across several targeted searches.)*
- Using Electron's own embedded Chromium sidesteps the "real Chrome profile" problem differently: it wouldn't be the user's actual Chrome (no existing Google/bank logins), but the user could log into sites *inside that pane* once, and YouCoded's own `userData` partition would persist that — effectively a fourth pattern: a dedicated, app-owned, persistent profile, visible and pausable, rather than either "your real Chrome" or "an invisible headless browser."

### 1.4 CLI vs MCP for browser tools — token evidence

Multiple independent sources (Playwright's own docs, testcollab, bug0, oodle.ai, joanmedia) converge on the same shape of numbers for Playwright specifically:
- MCP (accessibility-tree-in-context) ≈ 114K tokens/task vs CLI (writes-to-disk, agent reads selectively) ≈ 27K tokens/task on one benchmark — a 4-10x reduction cited across sources.
- Rationale given everywhere: MCP tool schemas + full accessibility-tree snapshots get **re-sent into context on every single call**; a CLI/skill approach persists state on disk and lets the agent pull only what it needs, Bash-tool style.
- Vercel's agent-browser makes the identical argument for its own CLI-over-MCP design (self-reported "up to 93% less context").
- **This maps directly onto YouCoded's own architecture**: since YouCoded already has a Bash tool and supports skills, a CLI+skill browser tool (Playwright CLI, agent-browser, or dev-browser) is a much better token-cost fit than adding an MCP server — especially for small local llama.cpp models where every saved token matters and where large repeated JSON tool-schemas eat a disproportionate share of a small context window.
- Small/local models: no source suggested vision is required for the CLI/accessibility-tree approaches (Playwright, agent-browser, dev-browser) — they're text/structure-based, which is good news for non-vision local models. Vision *is* effectively required for screenshot-driven approaches (Chrome DevTools MCP's screenshot flows, browser-use's default reasoning loop, and all computer-use/GUI approaches below).

## 2. Computer / desktop use options

### 2.1 Ranked table

| Option | Platform | Plausibility | Difficulty | Vision needed? | Reliability signal (2026) |
|---|---|---|---|---|---|
| **Anthropic Computer Use tool** | Cross-platform (screenshot+coords, model-side) | High if using Claude models — official, now GA | Low API integration, but needs a VM/sandboxed desktop or real desktop access | Yes, required | Anthropic's own "Claude Fable/Mythos 5" system scored ~85% on OSWorld-Verified (Sept 2026 leaderboard); GA since Aug 20 2026 with a merged "computer_toolset" + browser-use tool |
| **OpenAI Computer Use (CUA) / GPT-5.4+ native computer use** | Cross-platform | High if using OpenAI models | Low-Medium | Yes | GPT-5.4 (per OpenAI) is described as first general-purpose model with "state-of-the-art" native computer use; independent OSWorld-Verified leaderboard (Sept 2026) shows Qwen3.8-Max leading at 86.1%, Claude variants close behind — field is clustered near-saturation at the top |
| **Simular Agent-S / "Sai"** | Windows/Mac/Linux, model-agnostic (works with Anthropic/OpenAI/open-weight) | Medium-High — open framework, not tied to one vendor | Medium | Yes | Reported to exceed human-level OSWorld performance (~72.6%, vs ~72.36% human baseline) in 2025; hosted "Sai" agent reached ~73% on OSWorld 2.0 by Aug 2026 |
| **UI-TARS (ByteDance, open-weight)** | Cross-platform, self-hosted | Medium — good if YouCoded wants a fully local/open computer-use model | Medium-High (need to host a VLM) | Yes (VLM) | UI-TARS-1.5 reported ~22-25% on original OSWorld (lower than frontier closed models, but usable and fully open/self-hostable) |
| **Windows-MCP (CursorTouch)** | Windows only | Medium for a Windows-specific feature | Low (MIT-licensed MCP server) | **No** — explicitly model-agnostic, no CV/fine-tuned model required; works with any LLM | Latency 0.2-0.5s/action cited; no OSWorld-style score found (not an OSWorld participant, just a control surface) |
| **Peekaboo / mcp-server-macos-use (steipete)** | macOS only | Medium for a macOS-specific feature | Low (Homebrew/npm, MCP + CLI + menubar app) | Optional — can do VQA via local/remote models but core control uses accessibility tree, not just pixels | No formal benchmark found; positioned as a control/inspection layer, not a benchmarked "agent" |
| **xdotool/pyautogui/XTEST-based Linux control** | Linux (X11 only) | **Low as a general solution** | Low on X11, but broken on Wayland | N/A | Explicitly documented as broken on Wayland: "silently stop working," since Wayland's security model prevents reading other windows' pixels or injecting synthetic input into them |
| **ydotool / agent-sh/computer-use-linux (AT-SPI + GNOME Shell + Wayland portals)** | Linux, Wayland-aware | Medium — this is the only real path forward for Wayland (which is what Destin's own CachyOS machine likely runs, per his repo's `run.fish`/system notes) | Medium-High (portal permission prompts, AT-SPI accessibility-tree wiring, GNOME-specific) | Depends — some (deskwright/agent-sh) use AT-SPI to click actual accessible widgets rather than guessing pixel coordinates, avoiding vision entirely | As of Aug 2026, ydotool's `type` still only reliably supports US-ASCII (a UTF-8 patch was unmerged as of July 2026) — a real limitation for non-English text entry |

### 2.2 Notable pattern: accessibility-tree > pixel-guessing, everywhere

Across both browser automation (Playwright's a11y snapshots) and desktop automation (Windows-MCP's UI-state tool, macOS Peekaboo/AT-SPI, Linux AT-SPI-based tools like deskwright), the field has converged on **driving software via its accessibility tree** rather than raw screenshots + pixel coordinates wherever an accessibility tree exists. This is cheaper in tokens, doesn't require a vision model, and is more reliable across window scaling/theming — directly relevant to YouCoded's stated concern about small non-vision local llama.cpp models.

### 2.3 OSWorld / reliability numbers, with caveats

- OSWorld went from "~20% for the best agent a year ago" to a top-tier cluster around 85-86% on **OSWorld-Verified** by September 2026 (Qwen3.8-Max 86.1%, Claude Fable/Mythos 5 at 85%, described by one tracker as "nearing saturation").
- **OSWorld 2.0** (a harder, longer-horizon variant — 108 tasks, ~318 tool calls each, 69.6% take a human over an hour) is far from saturated: leading system (Claude Fable 5.1 per one tracker) scores ~77.9%, and Simular's hosted "Sai" scores ~73%.
- *(Flag: these leaderboard names — "Claude Fable 5," "Claude Fable 5.1," "Claude Mythos 5," "Qwen3.8 Max" — read as unusual/possibly-informal model naming from third-party leaderboard sites, not confirmed against an official Anthropic/Alibaba release page. Treat the specific model names and exact percentages as third-party-reported, not independently verified against a primary source.)*
- Directionally reliable takeaway regardless of exact numbers: computer-use agents got dramatically better through 2026, but the *harder, more realistic* benchmark (OSWorld 2.0) still sits meaningfully below the easier one — i.e., long, multi-app, real-world desktop tasks remain the frontier, not a solved problem.

## 3. How competitors expose this

- **Claude Code's `/chrome`** integration (via Claude in Chrome extension): requires a claude.ai paid plan login; explicitly refuses to work with API-key or Bedrock/Vertex/Foundry auth. Not adoptable as a component by a third-party multi-provider app like YouCoded — it's a product feature of Anthropic's own client, not a library.
- **OpenAI Codex**: gained native computer-use through the underlying GPT-5.4+ models rather than a bolted-on tool; ships as part of the Codex desktop app and API model capability.
- **OpenClaw**: dedicated/isolated agent browser profile by default, opt-in real-profile access via Chrome DevTools MCP with explicit cookie-import restriction; large open ecosystem (300k+ GitHub stars per one May-2026 snapshot), local-first self-hosted philosophy closest to YouCoded's own model.
- **Hermes Agent**: competing open framework, emphasizes persistent memory/self-generated skills and offers 5 sandbox backends (local/Docker/SSH/Singularity/Modal) for stronger isolation than OpenClaw's app-level checks — worth studying for YouCoded's own sandboxing model even outside the browser question.
- **Claude Cowork**: Anthropic's own hosted "let it act as a coworker" product — trades self-hosting for pushing security/runtime burden onto Anthropic's platform. Not something YouCoded can wrap either, but useful as a UX reference for "visible, pausable, confirmable agent action."

## 4. Safety findings

- Indirect prompt injection from web content is a **live, unsolved** problem as of 2026: documented cases embedded fully-specified payment instructions in ordinary web pages, aimed at agents with payment integration, designed to execute without user confirmation. A public red-team competition saw 60,000+ successful policy-violation injections out of 1.8M attempts.
- "Current defenses don't solve the problem — adaptive attacks bypass essentially every published defense" is the blunt consensus from the sources reviewed (Sysdig, multiple arXiv papers on cross-site prompt injection, phishing-style indirect injection, and untrusted-content masking).
- In May 2026, Five Eyes cybersecurity agencies (CISA/NSA + UK/Canada/Australia/NZ counterparts) issued joint guidance specifically on agentic AI risk — signals this is now treated as infrastructure-level risk, not a hypothetical.
- Practical implication for YouCoded: **any web-browsing tool needs a hard confirmation gate before any consequential action** (purchases, form submissions with personal data, sending messages/emails, anything involving money or irreversible state) — this can't be left to the model's judgment given documented bypass rates. This aligns with YouCoded's own existing pattern of explicit confirmation gates elsewhere in the app.
- Profile isolation is the other big lever: give the agent a **dedicated browser profile/pane by default** (its own YouCoded-owned Electron partition, or a separate agent-only Chrome profile), never automatically the user's main logged-in Chrome; require explicit, scoped opt-in (extension-style, tab-by-tab) if/when the user wants it to act as their real logged-in self on a specific site.

## 5. Recommendation for a small team

**Build, adopt-thin:**

1. **Browser tool: adopt Playwright CLI (or the conceptually identical dev-browser skill) as a Bash-tool + Skill**, not an MCP server. This fits YouCoded's existing harness (Bash tool + skills already supported), costs far fewer tokens per task (helps small/local models most), needs no vision, and is Microsoft-maintained with an active 2026 release cadence. Avoid Playwright MCP itself as the primary path — it's fine as an optional add-on for users who already run other MCP-based tools, but its token cost is 4-10x worse for the same job.
2. **Identity/profile model: default to a dedicated, YouCoded-owned browser profile** (either a bundled Chromium via the CLI tool, or — more ambitiously — an Electron `BrowserWindow`/`WebContentsView` pane driven via `webContents.debugger`, so the user watches the assistant browse inside the app itself). This is a genuine build, not an adopt — no mature open-source project does this specific "visible in-app CDP-driven pane" pattern today, so budget real engineering time and expect to work around the known Electron debugger-attach bugs (crash-on-detach, lost `unresponsive` hang detection).
3. **"Use my real, logged-in Chrome" should be an explicit, opt-in, scoped feature**, not the default — modeled on OpenClaw's cookie-import restrictions or the MV3-extension pattern (per-tab attach, inspectable scope), never a bare CDP relay to the user's default profile (which is also technically blocked by Chrome 136+ anyway for the default profile dir).
4. **Skip computer-use/"full desktop control" for v1.** The token/complexity/reliability cost is much higher than browser automation, Linux/Wayland support is genuinely broken for the common xdotool-style approach (and YouCoded needs Linux — Destin's own daily machine is Wayland), and even frontier models sit well under saturation on the harder, more realistic OSWorld 2.0 benchmark. If desktop control is wanted later, prefer accessibility-tree-based tools per platform (Windows-MCP on Windows, Peekaboo/AT-SPI on macOS, AT-SPI+portals like agent-sh/computer-use-linux on Linux) over screenshot+pixel-coordinate approaches, since they don't need a vision model and are more robust — but treat this as a v2+ investment requiring per-OS work, not a single cross-platform library.
5. **Wire mandatory confirmation gates for anything consequential** (payments, sending, posting, irreversible submits) regardless of which browser tool is chosen — the prompt-injection research is unambiguous that model-side judgment alone is not a sufficient safeguard in 2026.

## Sources

Browser automation:
- https://github.com/microsoft/playwright-mcp
- https://playwright.dev/mcp/introduction
- https://playwright.dev/agent-cli/introduction
- https://github.com/microsoft/playwright-cli
- https://playwright.dev/agent-cli/skills
- https://www.oodle.ai/guides/mcp/playwright
- https://testcollab.com/blog/playwright-cli
- https://bug0.com/blog/playwright-cli-vs-playwright-mcp-ai-browser-testing-2026
- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://addyosmani.com/blog/devtools-mcp/
- https://github.com/vercel-labs/agent-browser
- https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md
- https://isagentready.com/en/blog/vercel-agent-browser-why-a-cli-beats-mcp-for-browser-automation
- https://github.com/browser-use/browser-use
- https://michaellivs.com/blog/state-of-browser-use-2026/
- https://www.browserbase.com/stagehand
- https://github.com/browserbase/stagehand
- https://www.browserbase.com/blog/stagehand-v3
- https://github.com/steel-dev/steel-browser
- https://www.hyperbrowser.ai/
- https://github.com/SawyerHood/dev-browser
- https://mcpmarket.com/tools/skills/dev-browser-1
- https://code.claude.com/docs/en/chrome
- https://github.com/electron/electron/issues/27768
- https://github.com/electron/electron/issues/53819
- https://github.com/electron/electron/issues/54323
- https://www.electronjs.org/docs/latest/api/debugger
- https://github.com/ntoskrnl7/electron-cdp
- https://dev.to/todoforai/how-an-ai-agent-works-in-your-logged-in-browser-extension-vs-cdp-relay-vs-cloud-browser-40m5
- https://docs.openclaw.ai/tools/browser
- https://dev.to/eliofbm/existing-chrome-profiles-are-becoming-a-product-primitive-for-agents-2oi

Computer use / desktop control:
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://claude.com/blog/computer-use-skills-api-files-api
- https://openai.com/index/introducing-gpt-5-5/
- https://en.wikipedia.org/wiki/OpenAI_Codex_(AI_agent)
- https://github.com/CursorTouch/Windows-MCP
- https://github.com/steipete/Peekaboo
- https://github.com/agent-sh/computer-use-linux
- https://github.com/tristanmuzzu/deskwright
- https://gadgeteer.co.za/ydotool-is-an-alternative-to-xdotool-that-works-on-both-x11-and-wayland/
- https://github.com/bytedance/ui-tars
- https://leaderboard.steel.dev/leaderboards/osworld/
- https://leaderboard.steel.dev/leaderboards/osworld-2/
- https://benchlm.ai/benchmarks/osworld-verified
- https://www.simular.ai/articles/simulars-computer-use-agent-outperforms-humans
- https://github.com/simular-ai/agent-s
- https://www.simular.ai/articles/agent-s3

Competitors / ecosystem:
- https://composio.dev/content/openclaw-vs-hermes-agent
- https://www.contextstudios.ai/blog/openclaw-vs-hermes-agent-an-honest-2026-comparison
- https://hermes-agent.nousresearch.com/docs/user-guide/features/browser

Safety:
- https://www.sysdig.com/learn-cloud-native/prompt-injection
- https://atlan.com/know/prompt-injection-attacks-ai-agents/
- https://arxiv.org/pdf/2607.08147 (Prismata)
- https://arxiv.org/pdf/2608.04741 (LoginTrap)
- https://ghchinoy.medium.com/sandboxing-browser-agents-isolation-options-for-go-chrome-0c1bf3afbfbf
- https://blaxel.ai/blog/browser-sandboxing-for-coding-agents

Local/small-model context:
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- https://www.mindstudio.ai/blog/add-vision-to-local-ai-agent-low-vram
