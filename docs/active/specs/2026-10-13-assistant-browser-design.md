---
status: active
date: 2026-10-13
revised: 2026-10-13 (after design review 1 — engineering + UX; triage in docs/active/reviews/2026-10-13-assistant-browser-*-review-1.md)
---

# Browser (the assistant's web browser) — design

Destin's direction (2026-10-12/13, chat): give the assistant a real web browser; it must work
**identically in Claude Code sessions and native sessions**; offer **foreground (watch it)** and
**background (hidden, not sharing the user's screen)** on Linux/Windows/macOS; "your Chrome" where
possible; "comprehensive, works out of the box". He delegated the design calls and sees the result
at the end, so the decisions below are the implementing session's, shown on the acceptance deck.

Glossary used in every user-facing string: **Browser**, **Show window / Hide window**, **I'm done**,
**Stop**, **My Chrome**. Never shown: headless, CDP, profile, debugging (except quoting Chrome's
own switch name), "live view", "pane".

## 1. What the user experiences

- Asks "find X on that site / fill this form / check my order". The assistant opens the Browser
  and works in it. A computer with Chrome, Edge, Chromium or Brave needs no setup. With none, a
  card in the chat offers **Download** (about 150 MB, kept inside YouCoded) with progress, the real
  error + Retry on failure; the assistant's call continues once it finishes.
- **Hidden (default):** no window appears. The **Browser** panel (right side of the chat, like
  Session Files) shows a live picture of what the assistant sees, the page address and its status
  (Working / Waiting for you / Idle). The very first time ever it opens by itself with a one-time
  explainer; afterwards it opens by itself only if no other right-side panel is open (otherwise the
  header Browser button shows a dot). Always reachable from the `|||` menu.
- **Show window:** a real browser window. The panel button / Settings switch restart the browser in
  the other mode; when any tab is open a confirm explains that pages reopen but unsent typing is
  lost (and names other chats using it). Only the person can show/hide the window.
- **The assistant needs you** (sign in, captcha): a card in the chat — the assistant's message +
  **Open window to sign in** + **I'm done** + **Can't do this**. Signing in happens in a real
  window (passkeys, password managers and 2FA work there); the panel picture is view-only.
- **Asking first — one policy for both session kinds**, enforced by the app (not by the session's
  own permission system):
  - Opening and reading pages never asks (same as the existing web-fetch tool).
  - Clicking/typing/choosing on a site asks once per site per chat: **Allow for this chat** /
    **Always allow <site>** / **Not now**.
  - **Final steps ask every time**, even on allowed sites: an action whose target reads like buy,
    pay, order, checkout, send, post, publish, delete, remove, submit, confirm, transfer, sign up,
    subscribe — "The assistant wants to click "Place order" on amazon.com." **Allow this once** /
    **Don't**. A guess from button names, so the tool descriptions also tell the assistant to confirm
    in chat before such steps.
  - Opening a page on this computer or the home network (localhost, 192.168…, router addresses)
    asks once per chat.
  - These asks happen in every permission mode (they are the browser's own rules).
  - An unanswered ask is withdrawn after 90 seconds and the action is NOT done.
- **Sign-ins are remembered** in the Browser's own storage on this computer, separate from the
  person's own browser and shared by all their chats (Settings says so; Clear saved sign-ins asks
  first and stops the browser).
- **My Chrome (opt-in, Settings):** the assistant opens its own tabs in the person's running Chrome
  (their sign-ins). Steps with buttons, a live status (Waiting for you to click Allow in Chrome /
  Connected / Chrome isn't open / Chrome said no), consent copy naming the risk, and stricter asks:
  every new site asks, no Always-allow. It never falls back to the assistant's own browser silently.
- **Downloads** land in YouCoded's own folder for that chat; the assistant hands them over with the
  existing file card. Programs are flagged.
- Phones and Android: not in this release (no panel or controls; tools absent on Android).

## 2. Architecture

```
native session ──(in-process tool adapters)──┐
                                             ├─► main: BrowserClient (proxy) ─► utilityProcess: BrowserService ─► playwright-core ─► Chrome/Edge/…
Claude Code ──stdio MCP relay──local socket──┘            │
                                                          └─► Browser panel (state + frames over IPC, desktop only)
```

- **Engine:** `playwright-core` 1.64.0 (Apache-2.0, no bundled browsers, no install scripts),
  public APIs: `launchPersistentContext`, `connectOverCDP`, `page.ariaSnapshot({mode:'ai'})`,
  `page.getByRef()`, CDP `Page.startScreencast`. Runs in an **Electron utilityProcess** so CDP
  traffic, snapshots and Playwright's state never run on the main thread; quitting the app kills it.
- **One owner:** `BrowserService` (Electron-free) owns the browser; tools are defined ONCE
  (`browser-tools.ts`: zod schema, description, runner) and produce final text/images. Native
  adapters and the Claude Code relay only transport — identical results by construction.
- **Browser discovery** (async): Chrome → Edge → Chromium → Brave at standard per-OS paths, then a
  Chromium downloaded with playwright-core's installer into `userData/assistant-browser/browsers`.
- **Storage (per install, never synced):** `userData/assistant-browser/` → `profile/`, `settings.json`
  (`showWindow`, `useMyChrome`, `preferredBrowser`, `alwaysAllowedSites[]`, `explainerSeen`),
  `shots/` (screenshots, deleted after 7 days), `downloads/<conversation>/`.
- **Conversations share one browser** and own their tabs (popups join their opener). Per-conversation
  calls are serialized. A conversation's tabs close 30 min after its last browser call or when it
  ends (native destroy, Claude Code exit); the browser closes 5 min after its last tab.
- **Restart (show/hide window):** waits up to 10 s for in-flight calls, reopens every tab by
  address, and the next result says element refs are stale.
- **Pages are untrusted:** every result carrying page text is wrapped by the shared
  `wrapUntrusted()`, which neutralises tag look-alikes inside the text (the same fix is applied to
  `registry.ts`, whose WebFetch wrapper had the hole). Each tool description carries the doctrine
  sentence because Claude Code sessions never see the native prompt.
- **Navigation:** http/https only; model-initiated navigation to loopback/private/link-local/
  metadata addresses asks (net-guard's classification); a main-frame landing on another scheme or an
  unapproved private address is stopped and reported. This is friction, not a sandbox.
- **Headless user agent:** a hidden browser presents the normal Chrome user agent for its real
  version and drops `--enable-automation`, so sites that reject the literal "HeadlessChrome" serve
  normal pages. Results flag pages that look like human checks or sign-in walls so the assistant
  asks for help instead of guessing.
- **Every Playwright call** has an explicit timeout and honours the call's abort signal.

### Tools (same names, schemas, descriptions and results in both runtimes)

| Tool | Does |
|---|---|
| BrowserNavigate | open an address (optionally in a new tab), or go back/forward; returns the outline |
| BrowserSnapshot | the page outline with element refs (`[ref=e12]`) |
| BrowserAct | click / double_click / hover / type / select / press_key on a ref; returns the outline |
| BrowserScreenshot | a picture of the page (JPEG, ≤1280 px wide; full page capped at 6000 px tall) |
| BrowserTabs | list / select / close this conversation's tabs, or close them all |
| BrowserWait | wait up to 30 s for text to appear/disappear, or N seconds |
| BrowserAskUser | show the "needs you" card; waits ≤90 s per call, the card stays until answered |

Native: conditional tools (profile-gated like Skill), `permissionSubject` undefined and listed in
every mode's always-allowed set (the app's own asks replace them). Screenshots return as `images`
paths; non-vision models get the outline instead. Claude Code: random server id + token per
session; all seven tools pre-approved with `--allowedTools`; screenshots as MCP image content;
relay socket in a short per-user 0700 directory (Unix) or a per-pid named pipe (Windows), token
checked with `timingSafeEqual`.

### Screens
- **Browser panel** (`chat/browser`): third right-slot panel (only one at a time). Row 1: site name,
  status, close. Row 2: address (read-only), **Show window / Hide window**, menu (Stop for this chat,
  Copy address). Body: the picture (frames only while the panel is visible; ≤10/s, ack-paced),
  marked "paused" when stale; states: idle, starting, running, needs you, error (ErrorState).
- **Ask card** in the chat above the input: site-permission, final-step, local-network, needs-you,
  no-browser/download.
- **Settings → Browser** (`settings/browser`): "Which browser?" (The assistant's own browser /
  My Chrome), "Show a browser window" switch, Sites you've allowed (Remove), Clear saved sign-ins,
  disclosure line; "Using Google Chrome" (a picker only when 2+ are found); My Chrome steps when
  chosen; Close the browser.

## 3. Out of scope (filed)
Phone/remote controls and picture; Android; cloud browsers; specialist children using the browser;
file upload; clicking/typing through the panel picture; Chrome tab groups for My Chrome; separate
sign-in storage per chat; OS-level hidden desktops (Windows CreateDesktop is flagged by antivirus
and breaks GPU drawing; macOS has no API; Wayland has no portable one — a hidden browser is the
cross-platform equivalent).

## 4. Revisions from design review 2 (triage in `docs/active/reviews/2026-10-13-assistant-browser-design-review-2.md`)

- **Ask path:** asks are raised inside the worker's tool runner and drawn from the conversation's
  `browser:state` (worker → main → screen); answers go back the same way.
- **One deadline per call:** 100 s including queue wait. A call that would exceed it returns
  "still waiting for the person" / "the browser is downloading (n%)" and the card or progress stays.
- **Declined vs unanswered** read differently, and the same action on the same site is refused for
  2 minutes after either.
- **Final steps** also trigger structurally: submit buttons, Enter/submit inside a form (not search
  forms), links whose path reads like checkout/confirm/delete.
- **Private network:** main-frame navigations and redirects are classified by resolved IP and
  stopped BEFORE the request when not approved; approvals per host:port; cloud metadata addresses
  are never allowed. Requests made by a page's own scripts/images are not covered (stated).
- **Restarts:** a call waiting on the person never holds one; the card survives; other chats'
  interrupted calls say so; reopened pages may have lost their state (said in the note).
- **Worker:** `asarUnpack` playwright-core; worker logs reach the app log; request ids + cancel;
  a crashed worker fails pending calls and restarts on the next call (guarded).
- **My Chrome** is labelled **Experimental**, off by default; tools can't see tabs they didn't open.
- **Plan mode** (Claude Code) does not block browser actions — the relay can't see the mode.
