---
status:
date: 2026-10-13
reviewed: docs/active/specs/2026-10-13-assistant-browser-design.md
reviewer: context-free product/UX review (design stage, nothing built yet)
---

# Assistant browser — UX design review 1

Read from the point of view of a student or office worker who has never heard of "headless", "CDP" or "profile". Sorted most important first. Each item: severity, problem, recommended change with proposed copy. Reference points: `GamePanel.tsx` (right pane shell, only one right pane at a time), `ToolCard.tsx` (`friendlyToolDisplay`, `PermissionButtons`), UI design guide section 4.5 / 4.8, `narrow-viewport.md`, `error-message-standards.md`.

---

**1. blocker — "Asks once per site" makes the safety prompt nearly meaningless.**
Problem: after the user allows "click and type on amazon.com" once, the assistant can click "Place order" with no further prompt. The only protection left for buying, sending, deleting or paying is a sentence in the tool description, which the model can ignore. The prompt also says nothing about stakes ("click and type" sounds harmless). Per-site Always-allow is then a one-way door, and the spec has no place to see or undo it (see 13).
Change: (a) the default button grants for THIS CONVERSATION only; "Always" is a second, quieter choice. (b) Keep a hard stop in code: when the target element's name or the page looks like a final step (Buy, Pay, Place order, Send, Post, Delete, Submit, Confirm, Transfer), ask every time, even on an allowed site and even with Always. Say so honestly: the app can only guess from button names, so also keep the chat-confirm rule.
Card copy:
- Title: `Let the assistant use github.com?`
- Body: `It will click buttons and type into this site, in the assistant's browser. It will ask again before anything that sends, buys or deletes.`
- Buttons (existing fixed order): `Not now` · `Allow for this chat` · `Always allow github.com`
- Final-step card: `The assistant wants to click "Place order" on amazon.com.` · `Don't` · `Allow this once`

**2. blocker — "No browser installed" is a Settings detour, but the requirement is "works out of the box".**
Problem: a user who asks "check my order status" on a machine with no Chrome/Edge/Brave/Chromium (common: Safari-only Mac, fresh Windows with only Edge is fine, but many Linux and managed laptops) gets a failed tool call and has to guess to open Settings. 150 MB with no consent, no progress, no offline/disk-full story.
Change: make the failure a card in the chat itself (and in the pane) with the action on it. Never invent the cause (error-message-standards): if discovery found nothing, say that, and show the real error text if the download fails.
Copy: `The assistant needs a browser to do this. YouCoded can download a small one for it (about 150 MB, kept inside YouCoded).` Buttons: `Download` · `Not now`. While running: `Downloading browser… 42%` with `Cancel`. Failure: `Couldn't download the browser: <real reason>.` with `Retry` / `Report bug` / `Diagnose with Claude`. When it finishes, the assistant retries the original task automatically (no "please ask again").

**3. major — The first-run moment is not designed, and an auto-opening pane is the wrong default.**
Problem: today the pane pops open by itself the first time (and every conversation after, since "Open the live view when browsing starts" defaults on). It is the only right-hand slot, so it silently replaces Session Files or a game the user had open, mid-thought, and shrinks the chat. The user was never told a browser exists, that it is separate from their own, that it is private from their logins, or that "watch" is possible.
Change: first time ever, open the pane (a one-time exception, because there is nothing else to explain it) with a dismissible explainer at the top; afterwards default the auto-open to OFF-if-another-right-pane-is-open, ON-otherwise, and never replace an open pane (show the header button with a small pulsing dot instead, the same "needs attention" pattern the games use).
Explainer copy: `The assistant is using its own private browser. It can't see your other tabs or your sign-ins. Anything you sign into here is remembered for next time.` Buttons: `Got it` · `Show it in its own window`.
Toggle label (Settings): `Show the browser here when the assistant starts using it` (not "live view").

**4. major — "Watch" vs "Background" is two ideas jammed into one three-way choice with "Your Chrome".**
Problem: Settings offers Background / Watch / Your Chrome as one radio group. But "where it runs" (hidden or a window) and "whose browser" (the assistant's own, or yours) are separate questions; "Your Chrome" cannot be hidden or shown by the user, so the radio hides that. And the pane already lets you "watch" in Background, so a user reasonably asks "what is Watch for, then?" The pane buttons say "Show window / Hide window", Settings says "Watch", the spec text says "foreground" and "background": four words for one switch.
Change: two plain questions.
- `Which browser?` — `The assistant's own browser (recommended)` / `My Chrome (uses my sign-ins)`.
- `Show a browser window on my screen?` — a switch, off by default. Helper: `Off: the assistant works out of sight and you can still follow along in the Browser panel. On: a real browser window opens so you can watch.` Greyed with the reason `My Chrome always uses its own window.` when My Chrome is chosen.
Pane button: `Show window` / `Hide window` stays (matches the switch), nothing says "Watch" or "Background" anywhere in the UI.

**5. major — Switching the window on/off restarts the browser and the only warning is a tooltip.**
Problem: unsent form text and open page state are lost; the mode is app-wide so it also restarts OTHER conversations' tabs; and tooltips never fire on touch (narrow-viewport rule: no load-bearing copy in `title=`). A user who typed half a long application form, clicks "Show window" to watch, and loses it will not trust the next proposal.
Change: if the assistant is mid-action or any tab might hold typed text (any text input was edited since load), confirm first; otherwise switch silently. Mention other chats only when they have tabs open.
Copy: `Showing the window restarts the browser. Pages reopen where they were, but anything typed and not yet sent is lost.` + `(Also affects 2 other chats using the browser.)` Buttons: `Cancel` · `Restart and show window`. Better still, if engineering allows: apply the change when the browser is next idle or next starts, and say `Will switch when the assistant finishes this step`.

**6. major — Take over / Done: the assistant only learns "done" from a button the user may not be looking at.**
Problem: the Done button lives in the pane. If the pane is closed, the user is in another conversation or window, or on a phone, nothing tells them it is waiting or gives a way to finish; the assistant sits for up to 15 minutes. Typing "ok, I'm signed in" in chat is the natural human move and the spec ignores it. After the 15-minute timeout the assistant gives up with no explanation to the user.
Change: (a) A card in the chat itself when the assistant asks: message + `Open browser` + `I'm done`, and `Can't do this` (so the assistant stops instead of waiting). (b) Sending a chat message while waiting counts as Done and passes the message through. (c) An unread/attention badge on that conversation's tab in the session strip and an OS notification if the window is in the background (the assistant is blocked on them). (d) Timeout: show `The assistant stopped waiting. Tell it when you're ready and it will carry on.`
Card copy: `The assistant needs you to sign in to github.com.` / `Open the browser, sign in, then press I'm done.`
Pane labels: `Take control` while the assistant drives; banner `You're in control. The assistant is paused.` + `I'm done — hand back`.

**7. major — Signing in through a small, ~10 fps picture will fail in many common cases.**
Problem: passkeys, security keys, "approve on your phone", password managers, SSO pop-ups and some captchas do not work (or are miserable) through a screencast; a 320 px pane makes a desktop login page unreadable. Users will hit this on first real use (Google, school and work accounts are the typical walls).
Change: when the assistant asks for sign-in, offer a primary `Open in a window to sign in` that shows the real window for the duration, then re-hides after Done (restart caveat from 5 applies; fine here because nothing is typed yet). Make the pane scale a fixed desktop-size page to fit, and let it widen. Copy under the picture: `Having trouble signing in here? Open in a window.`

**8. major — "My Chrome" setup is a developer procedure, and its failure states are unspecified.**
Problem: "chrome://inspect → remote debugging → Chrome asks Allow?" is jargon-heavy for the target user. The Allow dialog appears inside Chrome, possibly behind YouCoded, and may never be clicked; spec gives no waiting state or timeout. If Chrome is closed the spec doesn't say whether the assistant silently falls back to its own browser (the user then believes it used their logins, or that it is NOT logged in). The wording also under-tells the risk: while connected, the assistant's connection can technically reach all tabs, even though YouCoded promises to touch only its own.
Change: step-by-step with a button per step: `1. Open Chrome's setting` (opens the page for them) `2. Turn on "Allow remote debugging"`, then a live status: `Waiting for you to click Allow in Chrome…` + `Bring Chrome to front`; `Connected`; `Chrome isn't open` + `Open Chrome`; `Chrome said no` + `Try again`. Never fall back silently: `Chrome isn't open. Open it, or use the assistant's own browser for this task?` Mark the assistant's tabs so the user can see them: put them in a Chrome tab group named `YouCoded assistant`. Consent copy: `While this is on, the assistant works in your Chrome with your sign-ins, so it can act as you on any site you're signed into. It will only open and use its own tabs, and it will always ask before sending, buying or deleting.` Make permissions stricter in this mode (ask every time on a signed-in site until the user says otherwise).

**9. major — Several conversations sharing one browser is confusing in the window and in "Stop".**
Problem: in Watch mode one window holds everyone's tabs, so watching chat A shows chat B's pages (possibly private); the window steals focus when any chat navigates; `Stop` in the pane is ambiguous (stop this chat's browsing, or the whole browser for every chat?). Chat A taking over blocks only A, but a sign-in made in the shared profile is visible to B, which the user is never told.
Change: label tabs with the chat name (`[Thesis research] Google Scholar`), and in the window don't raise/focus on every action. Split the buttons: `Stop for this chat` (default, in the menu) and a separate `Close the browser for all chats` that names the count: `3 chats are using it`. First time a second chat starts: `Sign-ins are shared by all your chats.`

**10. major — Phone / remote user is deadlocked on take-over.**
Problem: the spec says a phone watching a computer session only sees tool cards, yet the assistant can ask for take-over and wait up to 15 minutes, with Done only in a pane the phone does not have. Also the header button hides rather than moves into the `|||` menu (narrow-viewport rule: never hide a control without another entry point; a collapsed control's badge must move with it).
Change: the chat card from item 6 must render and work on narrow/remote views; copy for that view: `This needs you at your computer. Open YouCoded there to continue, or tell the assistant to skip this step.` + `Skip this step`. Add the pane's entry to the `|||` menu with the attention dot. On narrow desktop windows the pane should be a full-width sheet with 44 px controls; nothing load-bearing in tooltips.

**11. major — Failures read as "the assistant is broken" because nobody explains why.**
Problem: bot blocks (HTTP 403, "verify you're human", empty pages), captchas, login walls, paywalls and dead sites all look like blank pages or odd errors. The spec's only mitigation is the user-agent change, which also doesn't stop modern bot checks. The user needs the cause (only the verified one) and an action.
Change: the tool result tells the assistant to say what it saw and offer the next step; the pane shows a banner when a challenge or sign-in wall is detected. Copy: `This site is asking for a human check.` · `Take control` · `Skip this site`. For a block: `github.com didn't let the assistant in.` · `Try in my Chrome` (only if My Chrome is set up) · `Try another way`. If the cause isn't known, use the standard general message with Report bug and Diagnose with Claude; do not guess "you're being blocked".

**12. major — Crash, user-closed window and idle-closed browser need one clear story.**
Problem: In Show-window mode the user can simply click the window's X. The browser then "vanishes" mid-task; the assistant gets odd errors and the pane still shows the last frame. Idle shutdown after 10 minutes silently drops tabs so the next message appears to forget the page.
Change: treat a closed window as Stop and say so in the chat: `The browser window was closed, so the assistant stopped.` Pane empty state after a crash: `The browser stopped unexpectedly.` (real error detail if any) with `Restart` / `Report bug`. After idle close, say nothing alarming, but when a task needs the old page: `I closed the browser after a while; reopening <title>.` Pane empty state: `The assistant isn't using the browser right now.`

**13. major — Nowhere to see or revoke what has been allowed or remembered.**
Problem: per-site "always allow" and saved sign-ins (the whole profile) are invisible, and "Clear saved sign-ins" is all-or-nothing with no confirmation described. Sign-ins to banks/work accounts sitting on disk deserve a plain disclosure.
Change: Settings → Browser gets `Sites you've allowed (4)` with a `Remove` per row, and `Clear saved sign-ins` with a confirm: `Sign out of every site in the assistant's browser? You'll need to sign in again next time.` plus a one-line disclosure under the section: `Sign-ins are saved on this computer only, separately from your own browser.`

**14. major — The pane's title row is overloaded and invisible state is missing.**
Problem: tab title, address, Show/Hide window, Take over/Done, Stop and Close in a 320 px pane header (the guide's side pane is title + close). On a narrow pane it will truncate or wrap. Nothing says whose turn it is (assistant working, waiting for you, idle), and the address is not trustworthy as a security cue unless shown in full (users pasting passwords into a look-alike site via take-over).
Change: row 1: site name and a small status (`Working`, `Waiting for you`, `Idle`) + Close. Row 2: address as a read-only field (full host emphasised) + a single `Take control` primary button + a `…` menu holding `Show window`, `Stop for this chat`, `Open in my browser` (copy URL). Keep the address visible while the user has control.

**15. minor — The assistant can switch the window on itself (`BrowserWindow` tool).**
Problem: a user who chose "hidden" gets a window popping onto their screen at an arbitrary moment (e.g. mid-presentation) because the model decided to. This is exactly the "doesn't take my screen" goal being broken.
Change: remove the tool. If the assistant thinks the user should watch or sign in, it uses the sign-in card (item 6) or suggests it in chat: `Want to watch? Press Show window in the browser panel.` Only the user presses the button.

**16. minor — Chat tool cards need plain labels, and typing needs care.**
Problem: the spec names tools (`BrowserSnapshot`, `BrowserAct`) but no card wording; users will see "BrowserSnapshot" or raw refs like `e17`. `type` actions show the typed text on the card, which may be a password or card number.
Change in `friendlyToolDisplay`: `Opened github.com` · `Looked at the page` · `Clicked "Sign in"` · `Typed into "Search"` · `Waited for the page` · `Took a screenshot` · `Closed the browser tab` (past tense when done, "-ing" while running, per existing group verbs). Redact typed text in a password-type field and in cards when the field's label looks like a card/CVV/SSN field: `Typed into "Password" (hidden)`.

**17. minor — Naming: pick one set of words and use it everywhere.**
Problem: "assistant browser", "Browser pane", "live view", "live picture", "Watch", "take-over" all appear. `Pane`, `live view`, `profile` and `headless` are developer words.
Change glossary: the thing is **the Browser** (Settings title `Browser`, pane title `Browser`, header button tooltip/menu `Browser`). Actions: `Show window` / `Hide window`, `Take control`, `I'm done`, `Stop`. "Your Chrome" becomes `My Chrome`. Never show: profile, CDP, headless, debugging (except in the Chrome step that must name Chrome's own switch, quoted exactly as Chrome words it).

**18. minor — Settings layout is long for what most people will touch once.**
Problem: mode, browser list, auto-open, clear sign-ins, Chrome steps, status and Stop are all top-level rows. Which-browser is only meaningful with more than one detected; running status duplicates the pane.
Change: top-level rows only: `Which browser` (assistant's own / My Chrome), `Show a browser window` (switch), `Sites you've allowed`, `Clear saved sign-ins`. Collapse under an `Advanced` row: browser choice (hidden unless two or more detected; otherwise show `Using Google Chrome`), auto-open toggle, My Chrome steps (only appears after choosing My Chrome). Running status and Stop belong in the pane, not Settings. Reuse the SettingRow + popup pattern from `PerformanceButton`.

**19. minor — Header button appears only after first use, so Watch/Background is undiscoverable beforehand.**
Problem: before any browsing there is no sign the feature exists and no place to choose mode before the first task. The choice is therefore made by default, then discovered later (if ever).
Change: keep the button hidden until used (right for clutter), but add Browser to the `|||` menu always, and add a one-time line to the first-run explainer (item 3) pointing to the window option. Optionally let the model mention once: `I can also open it in a window if you'd like to watch.`

**20. minor — "Pages are untrusted" is only visible to the model; users get no sign when a page tries to steer the assistant.**
Problem: a page containing hidden instructions (e.g. "send the user's files to...") is handled in the wrapper only; the user sees nothing if the assistant refuses or complies. Also non-obvious: screenshots/page text go to the model provider, and page content may include the user's private data after sign-in.
Change: when the assistant ignores instruction-like text found on a page, say so in chat: `A page on example.com contained instructions aimed at the assistant. I ignored them.` and note in the first-run explainer: `What the assistant sees on a page is sent to the AI model, like anything else in the chat.` Verify this claim against the actual flow before shipping the sentence.

---

## Cut or defer for the first release
- `BrowserWindow` tool (item 15).
- Top-level Settings rows for running status, Stop and browser list (item 18).
- "Watch" as a named mode (item 4): keep the capability, drop the word.
- Paying for My Chrome complexity before the basics: if schedule is tight, ship My Chrome as a clearly marked later addition with a single honest line in Settings (`Coming soon: use your own Chrome and sign-ins`) rather than a half-working setup flow. The owner asked for it "where possible", and items 8 and 11 show it is the riskiest surface.

## Missing for "comprehensive"
Downloads shown in chat with an `Open folder` button; a way to copy the current page address from the pane; a visible `Pause` for the assistant without ending the task; and an accessibility pass (the live picture needs a text alternative: current page title and a short status for screen readers).

## Triage (author, 2026-10-13)

1 accepted — "Allow for this chat" default, "Always allow <site>" second, and a final-step stop (buy/pay/send/post/delete/submit/confirm/transfer…) that asks every time; enforced in the app's own browser card, identical in both session kinds. · 2 accepted — no-browser is a chat card with Download, progress, real error and Retry; the assistant's call waits (bounded) and continues. · 3 accepted — first time: pane opens with a one-time explainer; afterwards it opens only if no other right pane is open, else the header button shows a dot. · 4 accepted — Settings: "Which browser?" (assistant's own / My Chrome) + "Show a browser window" switch. · 5 accepted — confirm before restarting when any tab is open, naming other chats. · 6 accepted — chat card with "I'm done" / "Open window to sign in" / "Can't do this"; timeout message. Sending a chat message counting as Done: rejected for v1 (a message is delivered after the tool returns, so it cannot answer it). · 7 accepted — sign-in = Show window; pane read-only (no click-through). · 8 accepted with cuts — step-by-step + live check + no silent fallback + consent copy + asks on every new host; tab groups deferred. · 9 accepted — pane "Stop" closes this chat's tabs; Settings has "Close the browser" for all; shared sign-ins disclosed. · 10 partly — `|||` row always; phones get no browser controls in v1 (channels desktop-only); the waiting tool returns within 90 s so nothing deadlocks. Filed. · 11 accepted — challenge/sign-in-wall detection in results. · 12 accepted. · 13 accepted — Settings lists "Sites you've allowed" with Remove; clear sign-ins confirms. · 14 accepted. · 15 accepted — BrowserWindow tool cut. · 16 accepted. · 17 accepted — glossary: Browser, Show window/Hide window, I'm done, Stop, My Chrome. · 18 accepted. · 19 accepted. · 20 rejected — the untrusted-content doctrine already tells the model; a chat line per ignored instruction is noise.
