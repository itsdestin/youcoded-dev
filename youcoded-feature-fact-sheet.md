# YouCoded — Comprehensive Feature Fact Sheet

> **One-line idea:** YouCoded is a free, open, cross-platform AI assistant app that runs on desktop (Windows / macOS / Linux), Android, and remote browsers — with **any model backend** behind one polished, fully-featured, non-developer-friendly interface.
>
> **Strategic position (from the product's own vision doc, July 2026):** nobody currently combines (a) local-first multi-model freedom, (b) a friendly non-technical UI, (c) a social/marketplace layer, and (d) agent automations in one consumer app. Cowork/ChatGPT Work own "agentic assistant for normal people" but are closed, cloud-only, single-vendor. OpenClaw/Hermes own "own your agent" but are developer-hostile to set up. **That intersection is YouCoded's lane.**
>
> **Fast facts for marketing:** platform coverage (desktop + Android + remote in one product — no other harness ships all three) and the "every model, one UI" seam are the two headline differentiators today. The **WeCoded skills marketplace** (336 community plugins) and the **themes system** are the strongest "unique vs. harness" claims shipping right now. See §21 for planned differentiators being actively built.
>
> *Status note: compiled from the youcoded-dev workspace (source code, ROADMAP.md, native-runtime docs, vision roadmap, registry indexes) at v1.3.0-beta era, August 2026. Items in §18–§21 are explicitly labeled planned/aspirational, not shipped.*

---

## 1. Platforms — one product, four surfaces

**Desktop is not the app — one React UI ships everywhere.**

- **One shared React codebase** renders on Windows, macOS, Linux (Electron), **Android** (a WebView loading the same bundle), and **any phone/tablet browser** via the desktop's remote-access server. No other AI harness ships all four surfaces from one product.
- **Android runs a real local runtime**: on first run it installs a self-contained user-space Linux environment (node.js, npm, git, gh, python, ripgrep, curl, openssh, rclone, tmux, sqlite, openssl) and **Claude Code itself is npm-installed on the phone**. Sessions run on-device (Termux PTY), rendering through the same React chat/terminal UI.
- **Linux install formats**: the desktop installer builds as AppImage, `.deb`, `.rpm`, and `.pacman` from the same pipeline (rare).
- **In-app auto-update** — new versions surface as an update chip with a download link; no manual reinstall. Beta builds are distributed for dogfooding.

---

## 2. One app, every model — provider freedom

**The core model-freedom claim — pick a model, not a runtime.** YouCoded's model picker *derives the runtime from the model you pick*: you answer "which model?", never "which harness?".

Shipped provider types (Settings → Providers):

- **Claude subscription** — sign in with your Anthropic/Claude account and use your own subscription. (This is the headline sign-in and the product's credibility anchor with Anthropic.)
- **OpenRouter** — one key, hundreds of models, with app-attribution headers.
- **Local, built-in llama.cpp engine** — Ollama is never required. The app bundles and supervises `llama-server` in router mode: it **discovers GGUF files** you download or drop in, serves an OpenAI-compatible endpoint with tools, and unloads idle models.
- **Direct API keys** — Anthropic, OpenAI, Google (via the AI SDK), backed by a models.dev + OpenRouter model catalog (no hardcoded model lists).
- **OpenAI-compatible custom endpoints** — point it at Ollama, LM Studio, or any compatible server.
- **Mid-session model swap** is trivial natively — the next stream call uses the new model, no process restart, no new session.

---

## 3. The native harness — an agentic core of its own

YouCoded is not just a front-end for Claude Code. It ships a **first-party "native harness"**: a full agentic tool-loop under the AI SDK that drives the same chat UI, tool cards, approvals, artifacts, and projects. "Native session" = this harness; "Claude Code session" = an embedded CC CLI in a PTY. **Both render identically** because both speak one transcript-event protocol (8 event types: user-message, assistant-text, tool-use, tool-result, assistant-thinking, turn-complete, user-interrupt, compact-summary).

**Shipped native tools** (named exactly like Claude Code's — which is why the polished tool views light up for free):

- **Bash** — with **scoped CWD persistence**: a `cd` sticks across calls; a `cd` escaping the session root is reverted and announced. Env and aliases do not persist. This was a deliberate design choice (full statelessness cost ~6 failed tool calls in one real session).
- **Read / Write / Edit** — staleness-checked (mtime today, content-hash planned); a read-before-edit registry resets on resume.
- **Glob / Grep** — via the bundled ripgrep binary, with honest output bounds and path containment.
- **TodoWrite** — a live to-do list tool with a rendered card.
- **WebFetch** — SSRF-hardened (manual redirect following with re-validation at every hop; no private/loopback access).
- **WebSearch** — multi-backend chain (keyed → keyless → fallback), remotely refreshable, honest rate-limit handling.
- **AskUserQuestion** — Claude can ask you a question with typed answers, answered inline.
- **Skill** — loads installed marketplace skills at invocation time.
- **Task** — dispatch **specialist subagents** (see §8).
- **ModelSearch** — catalog lookup for per-hire model overrides.

**Context engineering (native):**

- **Real context-window awareness** — a capability profile per model (provider type + real window + curated family registry), never a guessed window. Local windows are read from llama-server `/props` and enforced.
- **Two-stage auto-compaction** (prune old tool output → summarize), triggered on the real last-step input token count, abort-safe and fail-safe.
- **Project instructions get OUTLINED, not tail-cut** — a huge CLAUDE.md/AGENTS.md over a small window keeps every heading with elided bodies, so the model always knows which sections exist to read.
- **Path-triggered rules** — repository `.claude/rules/*.md` with `paths:` frontmatter auto-inject after matching tool calls — the same convention Claude Code uses, so a repo set up for CC works natively with zero config.
- **MCP servers** attach whole-server, budget-gated (never a partial tool set), with dropped-server accounting surfaced (UI planned).
- **Image delivery is wire-correct** — native images on direct Anthropic, pixel-stripped for blind models, and swapped safely mid-session.

**Reliability wiring:**

- **A stalled provider parks instead of dying** — when a provider goes silent mid-stream the turn does not die: a red "Provider may have stalled" card counts up with Retry/Stop, and a chunk arriving minutes later still continues the turn (nothing to rebuild).
- **Tool-call/result pairing is an invariant everywhere** — full back-fills for canceled and crash-truncated tool calls, so dangling tool calls can't 400 a provider and brick a session.
- **Stall watchdog, prefill watchdog, auto-retry** for silent providers.

---

## 4. Permissions & approvals — trust as a feature

- **Permission modes on a chip** — ask-first / auto-edit / full-auto, visible and color-coded in the status bar (with a safety-stop footer on tool cards in full-auto).
- **Approval cards with Yes / No / Always-Allow** inline in the tool card, arrow-key navigable.
- **Remembered "Always allow" rules with real management UI** — list, revoke, per-project. A transparent rule store you can actually see and delete is genuinely rare in harnesses.
- **Bash "Always-allow" rule shapes** — exact-command, prefix, and branch-scoped grants (e.g., "any `git push` in this project"), with matchers that never silently over-grant across `&&`.
- **Two-tier permission engine** — hard tool-layer guards (secret paths, external-directory) sit below any configuration; a destructive deny-list is config you can consciously override.
- **Prompt hygiene** — guarded sends refuse a stray Enter that would answer a live Claude menu; "Send anyway" presses Esc first so it can never click a menu.
- **"Skip permissions" is explicit, danger-styled, gated, and explained** before you start a session.
- **Consent provenance** — a dismissed question ends the turn with honest copy ("Question closed — waiting for you"), distinct from a policy deny; permission cards describe the actual tool being approved, never a stale one.

---

## 5. The chat experience

**Streaming, rich, human-legible.**

- **Streaming replies** with markdown, tables, links, and **syntax-highlighted code blocks** with copy buttons + a per-reply copy picker.
- **Thinking/reasoning indicators** — an animated thinking bubble (braille spinner + flowing keywords), an extended-thinking heartbeat so long reasoning doesn't look hung, and a **tool-preparing card** that appears while a model streams a large tool argument (no more silent multi-minute gaps).
- **Tool cards** — each tool run renders as a card that expands to rich views: diffs, file contents, todo lists, subagent timelines. **Expand-all** toggle.
- **User-ask cards** — interactive question prompts with answer buttons.
- **Usage / cost / duration cards** inline in the timeline; context-% chip, model chip (provider-branded), and cost chips in the status bar.
- **Attention & status banners** — when Claude looks stuck, a session died, or a provider config error occurred, banners surface with a "fix it" jump straight to provider settings.
- **Stop / interrupt** button whenever a turn is in flight.
- **Queued messages strip** — messages sent while Claude is busy dock in a strip; entries are **cancelable and editable** (edit refills the composer).
- **Per-session draft memory** — composer text and attachments survive switching between session tabs.
- **Quick-prompt chips** (ultrathink, ultraplan, plan, brainstorm) with animated keyword styling.
- **Find in conversation** (Ctrl/Cmd+F) with ranked matches.
- **Clickable file-path tokens** in chat — every path Claude mentions opens the artifact; links are live.
- **Optional timestamps**, optional sound notifications, per-message show/hide.

---

## 6. Sessions & conversation management

- **Session strip / tabs** — multiple live sessions as tabs with live status dots; drag to reorder; Shift-hold for a quick switcher.
- **Resume browser** — browse past conversations to resume, with per-row filters, per-row model choice, and skip-permissions. (Performance-tuned: opens ~100 ms even at 1,600+ conversations via chunked reveal.)
- **Session tags & notes** — custom-colored tag set with a central **Tag Manager**, priority/complete flags, and an editable note per session.
- **Close-session prompt** — set flags/tags/note while closing, with "don't ask again."
- **Cross-device takeover** — a 3-state dialog (confirm / force / undeliverable) that honestly explains what happens to unsaved work when a conversation is opened on another device.
- **Moved-session gate** — if a session is taken over elsewhere, the local view is covered with Exit / Resume-here.
- **Open-tasks chip** — running/pending background task counts with a management popup.
- **Launch in new window** — detach a session into its own OS window.
- **Model pre-resume picker** for native sessions — resuming always confirms the model rather than silently auto-launching a stale binding.
- **Trust gate** — first contact with a new project folder asks for trust before starting a session.
- **First-run experience** — a guided first-launch view walks through setup.

---

## 7. Project View, the Files workspace & the artifact system

**The strongest "seam" between chat and your actual files — the app is built so the agent's work lands somewhere you can see, review, and edit.**

- **Project View** — a full-screen project browser (per-project hero, file tree, conversations list, context documents), homing to the current conversation's folder.
- **Files tab** — browse a project's tree with filters, add/import, and an in-pane viewer.
- **Conversations tab** — every past conversation in the project with previews, resume, and new-conversation.
- **Context tab** — view/edit the project's instruction documents (CLAUDE.md-style) with an intro explainer and a "how context works" popup.
- **Artifact side drawer** — files Claude touches open in a resizable right-hand panel with search (Ctrl+F), type filters, sort, rename, and per-artifact status (including deleted and merge-conflict markers).
- **Automatic version history** — every Write/Edit the agent makes is tracked as a version, browsable per file and per session. No git knowledge required.
- **Cross-file content search** — project-wide ripgrep content search (not just filenames), grouped per file with collapse and jump-to-hit.
- **A credible editor** — files open in a **CodeMirror 6** editor with syntax colors, dirty-tracking, and unsaved-changes prompts. Any text file is editable — the gate is a binary deny-list, not an allowlist.
- **In-app document viewers** — CSV, Excel, DOCX, PDF, images, and self-contained HTML preview (inline assets) all render inside the app.
- **Git review surface** — see the working-tree diff vs HEAD, stage/unstage, commit, and per-file "review this file's changes." (The "what did the agent do to my code" killer feature.)
- **Watched project directories** — external edits (git checkout, another editor, a rebase) are reflected in the pane.

---

## 8. Specialists — native subagents

**The Task tool is a real subagent manager, not a toy.**

- **Specialists** are short-lived child agent sessions the parent session's model can delegate a scoped brief to, with a narrow forced tool allowlist.
- **Charter scoping** — `read-only` vs `read-write`; a read-only child structurally cannot Write/Edit/Bash.
- **Foreground AND background delegation** — `background: true` detaches a Task; the parent keeps working, and the completion is delivered at an idle boundary — never spliced into a live turn.
- **Steer / resume / interrupt** — a running child can be steered; a finished or interrupted child can be resumed later by `task_id`, with details from its own transcript.
- **Durable ledger** — delegation state survives restarts; a crash between claim and delivery re-delivers the report exactly once (a lease, claim-and-confirm).
- **Routed consent** — a child that hits a permission need surfaces a real question on the **parent's** card (5-minute redirect), not a silent refusal; a late answer can still steer the live child.
- **Staleness flags, never kills** — a child silent ~2 min (or 5 min mid-tool) is flagged "may be stuck" in the status block; only an explicit interrupt ends it.
- **Delegated model tiers** — `budget` and `frontier` tiers, each bound to a concrete model by the user; unset tiers fall back to the parent's model with an honest note.
- **Named children** — every child gets an alliterative fun title ("Rowan the Relentless Researcher").
- **Real concurrency** — parallel-slot count read from the engine on local, profile-fixed (max 4) on cloud; at most one write-capable child per parent at a time.
- **Weak-model hardening** — placeholder briefs rejected, per-conversation spawn budget as a runaway backstop.

---

## 9. Skills, commands & the WeCoded marketplace

**The strongest community differentiator.**

- **The WeCoded skills marketplace** — **336 community skills/plugins** (development, productivity, database, deployment, security, monitoring, integrations, personal, …) plus prompt packs, browsed/installed/updated in-app with ratings, reviews, likes, favorites.
- **Skills run on every backend** — the same skill installs once and works in both Claude Code and native sessions. (The "marketplace serves every backend" moat.)
- **Side-slash commands that work on both runtimes** — `/clear`, `/compact`, `/model`, `/fast`, `/effort`, `/cost`, `/usage`, `/sync`, plus custom commands.
- **A live command drawer** — typing `/` (or the compass button) opens a searchable, filter-as-you-type drawer of skills and commands.
- **Bundled plugins** auto-install on launch — `wecoded-marketplace-publisher` (one-click publish), `wecoded-themes-plugin` (theme builder), `youcoded-chatsearch` (conversation search).
- **Publish from inside the app** — submit a skill/plugin or theme to the marketplace via fork + branch + PR, driven entirely from a UI (embedded `gh` on Android too).
- **Share links & deep links** — generate/import skills via encoded links and `youcoded://skill` / `youcoded://plugin` protocol handlers.
- **Chat Search** — a bundled CLI skill that searches across all your past conversations (index built locally: ~1,700+ Claude + native conversations, ~13.5k indexed user turns) with honest tombstone rows and Preview/Resume (phases 2–3 planned: writes + per-work-item digests).

---

## 10. Themes & personalization

**"Best-in-class" per the product's own competitive matrix — competitors are "nobody close."**

- **A full theme engine** — semantic color tokens, wallpaper, glassmorphism/blur chrome, effects layers, fonts, corner rounding, and **live switching**.
- **Chrome styles** — default vs. floating (detached pills) with macOS traffic-light repositioning; a `minimal` chrome style is planned.
- **Wallpapers & backdrop effects**, with reduced-effects + `prefers-reduced-motion` honoring.
- **Theme marketplace** — 7+ community themes (Golden Sunbreak, Halftone Dimension, Cotton Candy Sky, Devil's Garden, Kuromi Dreamer, Meadow Mist, Strawberry Kitty) browsed/installed in-app.
- **Mascot rigs** — each theme can bundle a custom animated mascot rig (SVG, poses, blink) that renders on the welcome screen, gates, settings, and panels.
- **Themeable chrome shape** — radius presets from "Heavily rounded" to "Minimal — brutalist," pushed through a shared token set.
- **Status-bar widget customization** — you choose which chips and gauges appear (usage, theme cycler, context, version, …).
- **Font picker + zoom controls.**
- **Local theme synthesis & publishing** — build a theme pack from a text description with `/theme-builder`, preview it, publish it.

---

## 11. Social & multiplayer games

- **Friends graph + presence** — add friends by handle, send/accept/decline/block/unblock, see who's online live (persistent presence socket with reconnect), last-seen persistence.
- **Multiplayer Connect Four** — play a real person over the network (board, moves, rematch, in-game chat) in a docked side panel beside the chat — **while the agent works** (the "social AI" pillar).
- **Game lobby & presence** — who's online, challenges, pending-challenge state on the header's gamepad button.
- **Incognito presence toggle.**
- **Marketplace account system** — sign-in (GitHub device-code OAuth), profile with display name/handle, data export, hard delete.

---

## 12. Sync, backup & cross-device

- **Cross-device sync of conversations, project files, and your Personal space** — pushed/pulled over a per-space git repo on GitHub. (Ships with a dual-device dogfood pass; 3 devices verified syncing against the remote.)
- **Instant signals between devices** — a SyncHub relay tells your other devices to pull immediately; the 120s poll is only the fallback (sync works even if the hub is down).
- **Devices & leases** — a "Your devices" registry with per-device last-synced times; cross-device takeover with lease semantics; honest device names on takeover dialogs.
- **Conflict handling** — conflicting edits become `(from <device>…)` copies rather than silent clobber; an in-app conflict resolver UI is planned.
- **Self-repair** — the sync engine classifies error modes (auth, offline, push failures) and quarantines corruption instead of wedging.
- **Additional backup backends** — Google Drive and GitHub (desktop and Android; iCloud on iOS/macOS), with a restore wizard (probe → list versions → preview diff → atomic swap with snapshot + undo).
- **Store economics** — conversation *records* (titles, flags, tags, model, device) are ~1 MB total and sync nearly free; transcript bytes are the bulk and have a known ceiling (see §21: YouCoded-managed cloud planned).
- **GitHub-connect modal** for one-time direct repo authentication (desktop).

---

## 13. Remote access & companion

- **The entire desktop app in a browser** — enable remote access and open the same React UI on your phone/tablet browser: chat, terminal, tool cards, everything, over WebSocket with password auth.
- **Instant hydration** — a joining browser receives the full serialized chat snapshot to catch up on the fly.
- **QR pairing from the phone** — scan a code to connect to the desktop's remote server (with Tailscale detection for LAN/zero-config use).
- **Honest degradation** — remote surfaces show "not available via remote access yet" notices instead of half-empty panels.

---

## 14. Buddy companion & mascot

- **A desktop mascot window** — an animated rig (drag, edge-dock, peek/lean animations) floats over your screen.
- **Mini chat from the buddy** — drive the active session from a compact floater with a compact tool strip.
- **Action bar** — an always-on-top slim bar with per-session pills and quick actions.
- **Screenshot-to-prompt** — one buddy action attaches a screenshot straight into the composer.
- **Welcome & new-session from the buddy** — it can create sessions on its own.
- **Auto-restore on launch** when enabled.

---

## 15. Terminal, keyboard & power ergonomics

- **Full terminal view per session** (xterm.js) with a touch-friendly toolbar (Esc/Tab/Ctrl/arrow keys) and scroll buttons on mobile.
- **Prompt detection** — the UI watches the terminal for Claude's inline menus/questions (Ink menus) and raises an interactive prompt card, so you never have to read the TUI.
- **Right-click context menus** — copy/paste, "Ask about this" (quotes the selection into the composer), file-pill actions (open, reveal in folder, copy path).
- **Keyboard-first** — Ctrl+` view toggle, Shift+Tab permission-mode cycle, Shift+Enter newline, ESC interrupt / close-overlay, arrow-key scroll, Shift-hold session nav, Ctrl+F find-in-chat.
- **Flick/momentum scrolling** on trackpads (tap to catch the glide).
- **Zoom overlay** (Ctrl+scroll) per pane.
- **Error containment** — per-panel error boundaries (chat / terminal / root), so a crash in one surfaces a card instead of blanking the app.
- **Announcements & update chips** — time-limited service announcements and in-app update status.

---

## 16. Android — the mobile story

- **Real local compute on the phone**: Claude Code CLI runs on-device (bundled user-space Linux), so sessions work on a phone without any desktop nearby.
- Full on-phone **chat + terminal**, permission prompts answered in-app, high-priority **approval notifications** that deep-link back to the session.
- **Conversation browser / resume** with complete/priority flags.
- **System file & folder pickers**; artifact viewer/editor with version history.
- **Sync / backup** engines on the phone (Drive + GitHub), guided setup wizards, and a full restore wizard.
- **Marketplace on the phone** — browse, install, update, and publish skills/themes; share-link and deep-link import.
- **Mobile-specific plumbing** — foreground service keeping sessions alive through screen-off, partial wake lock, `youcoded://` protocol handlers.
- **Explicitly NOT on mobile (honest list, not quiet gaps):** buddy floater · session tags & notes · Git staging/commit UI · Project View hub · native harness + custom API providers · local LLM engine/model manager · web-search provider keys · remembered-permission management · conversation leases/takeover · "Connect GitHub" modal (Android has its own gh flow) · marketplace integrations install/configure · voice input · share-to-app receiving · in-app self-update · serving as a remote-access *host*.

---

## 17. Security, privacy & error hygiene

- **OS keychain storage for all credentials** — Electron `safeStorage` / Android keystore; config files on disk hold only `secretRef` pointers to ciphertext. (*Note: desktop keys are machine-bound — syncing across devices intentionally requires re-entry on each device.*)
- **Keyless defaults where possible** — WebSearch works without keys on a fallback backend.
- **SSRF-hardened WebFetch** — validated redirects, no private/loopback/metadata access.
- **Honest error messages are a load-bearing design rule** — every user-facing error is (a) specific and accurate (real detail: subprocess stderr, HTTP status, failing path), or (b) honestly general with two actions: **Report bug** and **Diagnose with Claude**. The app never guesses a cause it hasn't verified.
- **Two-action error cards** are a reusable UI component (recoverable vs. general modes).
- **Theme sanitization** — community CSS/rig SVG are validated; no scripts, no `javascript:` URLs; reduced-motion is honored even for theme animations.
- **Trust gate** for new project folders.
- **In-app bug reporting** that creates a real issue, plus a Diagnose-with-Claude flow.
- **Analytics are device-hash based** with a privacy copy standard.

---

## 18. Engineering quality (for developer readers)

- **Multi-OS CI that is actually honest** — Windows + macOS + Ubuntu desktop test matrix, Android CI (tests + assemble + release), plus workspace doc/code-drift CI on a daily cron.
- **3,000+ unit/integration tests**; knip dead-code + jscpd duplication sweeps (measured 0.82% duplication, zero unreachable files).
- **A harness evaluator** — runs real cases across a matrix of code-version × instruction-file × model with dual grading (mechanical checks + an LLM judge that must quote evidence). It found **9 real defects** that thousands of passing unit tests missed.
- **Self-verifying documentation** — `/audit` mechanically verifies doc claims against code and fixes what it finds in the same run.
- A documented **live-app safety discipline** — all runtime verification happens in an isolated dev instance, never in the running product.
- **E2E-verified platform claims** — VM-testing flows on Windows / Ubuntu / macOS guests for first-run, installers, and sign-in.

---

## 19. Design principles (marketable)

- **Non-developer-first copy** — the product renouncs jargon where possible ("files" not "artifacts" in user-facing UI; menus explain themselves; a normal student should understand them).
- **Accessibility as a feature** — reduced-motion, keyboard navigation, hover-first interactions, clear status colors without color-only meaning.
- **No misleading dead-ends** — every surface is either real or honestly "not available on this device yet."
- **Honest numbers** — the app shows you real token/context/cost metadata instead of hiding them, and its error messages never lie about causes.
- **A UI workbench for building features** — the actual renderer against a fake backend, so every future menu is clickable and stateful in design; "the mockup becomes the app" with no translation step.

---

## 20. Deliberately not built (honest non-features)

- **A full LSP (real diagnostics / hover types / rename-symbol)** — considered; the cheap 80% (tree-sitter/ctags symbol navigation) is planned instead. A **debugger/breakpoints** is on record as "genuinely not this product's fight."
- **Third-party agent CLIs as bundled session providers** (running Codex / OpenCode / Cursor as backends) — a deliberate what-if, not a commitment; the direction is first-party harness reaching every *model*, not wrapping other *harnesses*.
- **Browser-use / embedded-browser tool inside the harness** — explicitly not built now ("add if demand").
- **DiffusionGemma support** — upstream-gated (llama.cpp can't serve it yet).
- **A knowledge graph** — consciously rejected; files + JSONL + sync spaces carry the data.

---

## 21. Planned & aspirational features

> **Moved out 2026-08-26:** *project descriptions* (synced, user-written) shipped —
> youcoded PR #330. Every project takes a short label that appears on its card and in
> the project list; it syncs for synced projects, stays local for plain folders, and
> never enters a session's prompt.


**In-flight (the Native Runtime Parity program — M1–M3, M5 shipped; M6–M9 open):** context truncation made visible to the user (a session-context transparency panel that accounts for what the assistant started with: system prompt, CLAUDE.md as-truncated, skill/tool lists, per-file "full vs supplied" diffs) · metadata sourcing + cost chip + capability tiering/step budgets · the cwd contract · MCP phase 2 (settings UI + server adoption + IPC) · subagents → orchestration · full Android harness parity · onboarding equality.

**Core product roadmap (from the July 2026 vision doc):**

- **Agents & Automations view** (Phase 4) — a third top-level view: named automations (harness + model binding + instructions + workspace + trigger), a **cron/one-time scheduler**, a **headless runner** with step/token/*cost* budgets, and a **run inbox** (`scheduled / running / needs-approval / completed / failed`). **Local models make 24/7 scheduled agents free** — the headline claim against cloud-metered competitors.
- **Custom harness builder** (Phase 3) — build/edit/duplicate a harness (prompt, tools, permission policy, model binding, skills/MCP selection) as a shareable JSON manifest, then publish to WeCoded. "Nobody ships a consumer-friendly harness builder today" is the stated differentiation.
- **Memory that compounds** (Phase 6) — promote journal/encyclopedia plugin patterns into a first-class, backend-agnostic memory layer.
- **Multi-channel reach** — notifications → Telegram/Discord/email bridges for agent results.
- **LAN model serving** (Phase 5) — desktop llama-server over LAN with QR pairing; Android consumes the desktop's models as a client; later, on-device ARM64 models.
- **YouCoded-managed cloud** (planned sync evolution) — zero-setup sync with client-side E2E encryption, likely a paid tier ("no GitHub needed").
- **Conversation transcript storage plan** — the GitHub ceiling is measured and acknowledged; the goal is "every transcript available on every device, always" (optionally via a first-party store).
- **Assistant-settings consolidated panel** — a tabbed refactor with live search.
- **Project-scoped skills** (repo `.claude/skills/` in native sessions).
- **Chat search phases 2 + 3** — writes (tag/note/flag from search results) and per-work-item digests.
- **Git surface phase 2** — branch ops, push/PR, repo-wide review, hunk-level staging.
- **Editor tabs** (multiple open files) · **persistent file tree** · **go-to-definition via tree-sitter/ctags** · **HTML preview url() chasing**.
- **Image context-menu actions** · **app-native hover tooltips** · whole-UI review pass · Backup & Sync popup follow-ups · conflict-resolution UI.
- **Resume-on-startup ("Welcome back")** rebuilt on the conversation store.
- **MCP phase 2** (settings UI + adopt flow) — non-technical users get MCP without editing files.

**Someday / ideas (product-defining if built):**

- **Context & knowledge as product surfaces** — grow the context popup into a real surface (per-item token cost, attribution, "why did it do that?"), **correction capture** ("no, don't do that" → one-tap "remember this?"), **share knowledge packs** through the marketplace (with provenance + complete-removal gate).
- **Per-helper token/cost accounting** on specialist cards · **promote a foreground hire to background mid-run** · **open a helper's own transcript in a viewer** · strict per-action approval toggle.
- **"Run in background" engine option** — keep local models serving OpenAI-compatible endpoints after the app closes.
- **Chrome-style: minimal ("bare")** · **documented "the model can show you an image in chat"** · **a synced SystemState** ("can my laptop run this model?" — AI-queryable device inventory) · **CC /goal completion-condition surface** · **DiffusionGemma when upstream lands** · **visual-regression harness for chrome invariants**.

---

## 22. Gap analysis — features competitors have that YouCoded doesn't (yet)

**Honest catch-up list** (from the documented July 2026 market scan + roadmap). These are things other agent/assistant products ship that YouCoded has not referenced or lacks today:

**Not referenced at all in the roadmap/codebase:**

- **Real-time multimodal chat** (audio/video/screen-share conversation with the model) — Claude apps and some mobile assistants have it; YouCoded is text + static images.
- **Computer vision / GUI automation** within the harness (controlling the OS UI).
- **Cloud-hosted agents** that keep running while your device is offline (ChatGPT Work, Antigravity-style); YouCoded's agents (current and planned) run on your own hardware.
- **IDE/extension surfaces** (VSCode/Cursor plugin, browser extension); YouCoded is a standalone app.
- **A marketplace of prebuilt named agents** (beyond skills) — the plan to publish agent *templates* is Phase 4, not shipped.
- **Voice input on desktop** (Android voice is also not implemented).

**Shipped but weaker than peers:**

- **Scheduled/triggered automations** — explicitly the *next* big phase (Agents & Automations); today you have a games lobby, not an agent inbox.
- **Approval inbox / "mission control"** — attention states + open-tasks chip today; a proper inbox is Phase 4.
- **Compounding memory** — encyclopedia/journal plugins exist; a first-class memory layer is Phase 6.
- **Teams/org features** — friends graph, not team spaces.

**Where YouCoded is strong but a competitor edge is worth watching:**

- **Agent app stores** — WeCoded is content/skills; competitors are working on agent-shaped stores with security scanning (the roadmap explicitly plans to apply ClawHub's skill-scanning lesson from day one).
- **Local-model UX** — the memory-guard bug class (dual-model OOM, Aug 2026) shows the fit-estimator needs a byte-budget repair; when that lands, the "second big model just works" story becomes true.

---

## 23. Pitches

**One-liners:**

> "YouCoded is the AI assistant that runs *any* model — Claude Code, local open models, OpenRouter — behind one polished chat UI, on desktop, Android, and remotely, with a community skills marketplace and themes."

> "One app on every device, model freedom, a marketplace, and an honest UI for non-developers — that's YouCoded."

**Three-sentence pitch (Reddit / students):**

> "YouCoded is a desktop + phone + browser assistant you own. It runs Claude Code, your own local open models (llama.cpp built in — no Ollama needed), or OpenRouter models, all behind the same chat. Conversations sync across your devices, it has a 336-skill community marketplace and themes, approvals instead of full-auto surprises, and a mascot sidekick — friendly enough for your parents, deep enough for real dev work."

**Five-sentence pitch (professionals / developers):**

> "YouCoded replaces your pile of AI terminals, tabs, and tools with one app. Your Claude subscription, an OpenRouter key, or a local GGUF model all live behind the same chat UI, tool cards, approvals, artifacts, and projects. The agent's work lands in a Files workspace with version history and a git review surface, so you can see, diff, and commit what it did instead of trusting a wall of chat. Everything syncs across desktop, Android, and a browser — and a 336-plugin community marketplace plus themes make it yours. It's the open, personal Cowork: the agentic assistant for people who want to own the stack, not rent it."

---

*Compiled from the youcoded-dev workspace: `ROADMAP.md`, `docs/active/specs/2026-07-09-platform-vision-roadmap.md`, `youcoded/docs/native-runtime.md`, `youcoded/docs/sync-spaces.md`, `youcoded/docs/engine-dependencies.md`, renderer/main/Android source sweeps, and registry indexes (wecoded-marketplace: 336 plugins + 14 prompt packs; wecoded-themes: 7 themes).*