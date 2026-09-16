# Remote Access — beta-tester UX review (run 2)

Tester: fresh session, no design docs read. Browser: headless Chrome at 1440x900 (plus one 900x620
and one 420x860 check), simulated backend, `midnight` theme only. Every state visited via
`?remotePreview=<name>`; every clickable control inside the Remote Access panel was clicked.
Not tested: touch input, 1.5x display scale, themes other than midnight.

Screenshots: `/home/destin/youcoded-dev/worktrees/sessions/remote-mesh-roadmap/docs/archive/reviews/2026-09-10-remote-access-ux-review-2-shots/`

## Findings

- U1 accepted — fixed. A listening `checked` now enables Add Device. The button was disabled for every stage but `ready`, so the one screen that says "pair one below" was the one screen that would not let you.

  ORIGINAL: after "This computer is listening at http://100.82.14.7:9900. No device has connected yet — pair one below to try it." I expected to be able to pair a device / the only pairing control, **Add Device, is greyed out and unclickable**, with no tooltip or line saying why — the screen tells me to do the one thing it won't let me do — Remote Access, `checked` — `/home/destin/youcoded-dev/worktrees/sessions/remote-mesh-roadmap/docs/archive/reviews/2026-09-10-remote-access-ux-review-2-shots/s-checked.png`
- U2 accepted — fixed. `plainReason()` translates the codes we recognise (EADDRINUSE, EACCES, EADDRNOTAVAIL) into a sentence and keeps the original after it. Unrecognised text passes through untouched rather than being described with a guess. Applied to the check, the enable error and the status line.

  ORIGINAL: I expected a plain-English failure I could act on / I got the raw programmer error **"listen EADDRINUSE: address already in use 100.82.14.7:9900"** with only a Retry button; nothing says what is using it or what to do — propose "Something else on this computer is already using this address. Close it, or let YouCoded pick another." — Remote Access, `checked-failed` — `…-shots/s-checked-failed.png`
- U3 accepted — fixed. The address is a row in the Tailscale section now, replacing the bare IP, which was never the address anyway (the port is half of it).

  ORIGINAL: when it is finally working I expected the panel to say so and show the address I type on my phone / in the working state (`ready`) **the status area disappears completely** — no "working", no address, no last-connected time; the address only ever appears in states that aren't finished yet, so once it works there is nowhere to look it up — Remote Access, `ready` vs `checked` — `…-shots/s-ready.png`
- U4 accepted — fixed, and it was a real bug in this session's own code: one label for `checked` called a failed check "Setup checked". The row now reads Connected or Not running from the answer.

  ORIGINAL: I expected the Settings list to warn me that remote access is broken / the row reads **"Setup checked"** while the panel inside shows the EADDRINUSE failure (and the same neutral row text appears for `checked-silent`, which says "Remote access isn't listening yet") — from the settings list a broken setup looks finished — Settings list row — `…-shots/s-checked-failed.png`
- U5 accepted — the mock was contradicting itself; devices can no longer read Online while the listener is off.

  ORIGINAL: with remote access switched off I expected the paired devices to look unreachable / **"My phone" still shows a green dot and "Online"** under the banner "Remote access is off." — Remote Access, `disabled` — `…-shots/s-disabled.png`
- U6 accepted — same cause. The mock now derives Enabled, the password, the IP and the hostname from the state instead of hardcoding them, so the three controls agree.

  ORIGINAL: I expected "Not set up yet." to mean nothing is connected / the same screen shows **"Status: Connected · home-laptop"** and an IP, and in `not-installed` the "Enabled" switch is already ON while the text says Tailscale isn't even installed — three controls disagree about whether this is set up — Remote Access, `setup` / `not-installed` — `…-shots/s-setup.png`, `…-shots/s-not-installed.png`
- U7 accepted — fixed. Add Device scrolls itself into view; it is appended at the bottom of a panel taller than the dialog.

  ORIGINAL: I expected Add Device to open something I could see / the QR panel is **appended at the very bottom of the dialog, below the fold, and the dialog does not scroll to it** — at 1440x900 the click looks like it did almost nothing until you scroll — Remote Access, `ready` → Add Device — `…-shots/i2-add-device.png`, scrolled: `…-shots/j1-add-device-scrolled.png`
- U8 accepted — the mock answered a bare IP in one place and a tailnet hostname in the other. One address throughout now, and a test asserts the two agree.

  ORIGINAL: I expected one address for my phone / the status line gives **`http://100.82.14.7:9900`** and the Add Device panel gives a completely different **`https://home-laptop.example-tailnet.ts.net`**, with nothing explaining that they are the same thing — Remote Access, `checked` vs Add Device — `…-shots/j1-add-device-scrolled.png`
- U9 accepted — the status badge reads "Saved". Two controls labelled Set, one of which did nothing when clicked.

  ORIGINAL: I expected one control for the password / there are **two things labelled "Set"** side by side: a small green "Set" (a status word meaning a password exists — not clickable) and a "Set" button inside the field (the action) — propose the badge read "Password saved" or a lock icon — Remote Access, all states — `…-shots/k5-password.png`
- U10 deferred (filed) — password rules, a confirm field and a reveal are their own piece of work, not a copy change. docs/roadmap/remote-access.md.

  ORIGINAL: I expected a password rule and a confirmation / **"abc" was accepted**, there is no minimum length, no second "confirm" box, no show-password eye, and the only feedback is a bare **"✓"** while the field resets to empty — I cannot tell what the password now is, or whether my phone will need it (nothing in the panel says the phone is asked for it) — Remote Access, `ready` — `…-shots/k5-password.png`
- U11 accepted — the mock forced hasPassword true in every state. Fixed there; the panel already had the right placeholder for both cases.

  ORIGINAL: before any password exists I expected the field to invite me to make one / the placeholder says **"Change password..."** even in `setup`/`not-installed` where nothing has been set — propose "Create a password" until one exists — Remote Access, all states — `…-shots/s-setup.png`
- U12 accepted — fixed. The primary action sat under the scroll region's 36px bottom fade and was cut off. `pb-9` clears it.

  ORIGINAL: I expected the consent button to sit inside the dialog / **"I understand — continue" hangs over the dialog's bottom edge** and is half cut off at 1440x900, and at a 900x620 window both it and the toggle it belongs to are entirely off-screen (the region scrolls only ~25px, so it is reachable but invisible until you find that out) — Remote Access → Browser encryption, `consent` — `…-shots/i5-consent-enc.png`, `…-shots/n4-short-consent.png`
- U13 accepted — fixed. The warning reads "Already done:" once the choice is made, in the past tense.

  ORIGINAL: after switching Browser encryption on I expected the warning to change tense / the orange box still reads **"This cannot be undone: This computer's name **is added** to a public list…"** as if the choice were still ahead of me — propose "Your computer's name is now on the public certificate list. Turning this off does not remove it." — Remote Access → Browser encryption, `encrypted` — `…-shots/m4-encrypted-screen.png`
- U14 partly accepted (the fixed half only). "VPN not active" and the About copy are fixed; TAILSCALE stays, because it is the name of the thing being installed and hiding it would leave a user unable to find the app they just signed into. The jargon that is genuinely ours to remove is in the optional level — see U25.

  ORIGINAL: I expected words I know / the panel is full of terms a normal student would not know: a whole section headed **"TAILSCALE"**, **"VPN not active"**, **"certificate"**, **"issued certificates"**, **"tailnet"** in the URL, **"listening at"** — the only explanation of Tailscale is one sentence at the very bottom of `not-installed`, below the button that installs it — Remote Access, all states — `…-shots/s-not-installed.png`
- U15 REJECTED — "Unpair" is Destin's own decision (questions-2 Q-4), and it is contract row R8, signed. Recorded here rather than changed.

  ORIGINAL: I expected "Remove" for getting rid of a device / the button says **"Unpair"** and the confirmation says **"Unpair this device? It must pair again to reconnect."** — propose "Remove" and "Remove this device? You'll have to set it up again to use it." — Remote Access → Devices, `ready` — `…-shots/j3-unpair-scrolled.png`
- U16 deferred (filed) — needs a line of copy Destin has not seen. docs/roadmap/remote-access.md.

  ORIGINAL: I expected to know what "Keep awake" does before choosing 4h / there is **no explanation at all** next to it, no hint of what happens when it runs out, and 4h is pre-selected without saying why — propose "Stop this computer sleeping for: (so your phone can still reach it)" — Remote Access, all states — `…-shots/s-ready.png`
- U17 accepted — fixed. The sentence claimed Add Device opens YouCoded on the phone, which it does not.

  ORIGINAL: I expected the (i) button to explain the feature / **"Connect your other device to Tailscale, then use Add Device to open YouCoded and pair"** is ungrammatical (Add Device does not open YouCoded on the phone) and the panel keeps its full ~590px height for four lines of text, leaving a huge empty area — propose "On your phone: install Tailscale and sign in to the same account. Then tap Add Device here and scan the code." — Remote Access → About Remote Access — `…-shots/i1-info.png`
- U18 accepted — the mock showed an IP while signed out. It has no address until the network is up now.

  ORIGINAL: I expected an address only once the network is up / `sign-in-required` shows **"Status: VPN not active"** and directly under it **"IP: 100.82.14.7"** — Remote Access, `sign-in-required` — `…-shots/s-sign-in-required.png`
- U19 deferred (filed, needs a deck) — a step count changes an approved screen, so it is Destin's call, not mine. docs/roadmap/remote-access.md.

  ORIGINAL: I expected to know how many steps setup takes / it is **three separate buttons in the same spot, one at a time** — "Install Tailscale" → "Sign in" → "Set up" — with no "step 1 of 3", so each time I think I am finished a new demand appears — Remote Access, `not-installed` → `sign-in-required` → `setup` — `…-shots/i8-install.png`, `…-shots/i10-signin.png`
- U20 accepted (fixed via U3), and mostly the mock: pressing Set up jumped straight to `ready`, where the banner is hidden by design because devices are listed. The real flow lands on `checked`, which stays on screen — and with U3 the address no longer leaves with the banner.

  ORIGINAL: after pressing "Set up" I expected a "you're all set" message / **the whole banner just vanishes**, silently, and the address vanishes with it; the only clue anything happened is that Add Device stops being greyed out — Remote Access, `setup` → after Set up — `…-shots/i7-setup-btn.png`
- U21 deferred (filed) — an undo for unpairing is new behaviour, not a fix. docs/roadmap/remote-access.md.

  ORIGINAL: after "Confirm unpair" I expected a short "Removed — undo" / **the row simply disappears** with no message and no way back; the removal itself worked correctly and instantly — Remote Access → Devices, `ready` — `…-shots/m1-confirm-unpair.png`
- U22 accepted — fixed. "A few seconds. Leave YouCoded open." replaces the instruction that read like it was for later.

  ORIGINAL: while it is checking I expected the greyed-out controls to say why / everything (password Set, Add Device) is disabled with **no note that it is temporary**, and the only hint is a small **"Keep YouCoded open"** under the spinner, which reads like an instruction for later, not for now — propose "Checking… this takes a few seconds. Leave YouCoded open." — Remote Access, `checking` — `…-shots/s-checking.png`
- U23 rejected as a change, recorded as observed. The sentence lives in the setup banner, which is hidden once a device is paired — that is the banner doing its job. Changing it means moving the sentence out of the banner, which is a deck question.

  ORIGINAL: I expected the intro sentence to be there or not / **"Remote access lets you use YouCoded from any device — phone, tablet, or another computer."** appears in ten states and is missing from the three finished ones, so the panel visibly changes shape depending on state — Remote Access, all states — `…-shots/s-ready.png` vs `…-shots/s-setup.png`
- U24 accepted — fixed. Both now read "We don't know why yet. Diagnose sends the log to Claude to find out."

  ORIGINAL: the two "we don't know why" errors are longer than they need to be / **"The server didn't report a reason. Diagnosing will collect the setup log so Claude can look at what happened."** (and the near-identical "The check didn't report a reason. Diagnosing will collect the connection log…") — propose "We don't know why yet. Diagnose sends the log to Claude to find out." — Remote Access, `checked-silent` / `error` — `…-shots/s-checked-silent.png`, `…-shots/s-error.png`
- U25 deferred to Destin (needs a deck) — the sharpest finding here, and it goes to him rather than into the code. The name was his round-4 decision, and the tester is right that it describes privacy while the setting buys the microphone, copy buttons and font picker. A rename changes meaning, not length, so it belongs on a deck.

  ORIGINAL: I expected "Browser encryption" to be about privacy / the first line of its own page says **"Your connection is already private either way"**, so the name describes something the setting does not do — it actually turns on the microphone, copy buttons and font picker on a phone — propose naming the row "Phone microphone & copy buttons" — Remote Access → Browser encryption — `…-shots/i4-encryption.png`
- U26 REJECTED, with the reason. docs/error-message-standards.md gives a general error Report bug + Diagnose precisely BECAUSE there is nothing to retry — offering Retry for an unknown cause invites the same failure. The two that offer Retry have a real reason to retry.

  ORIGINAL: the two error states offer only "Report bug" and "Diagnose with Claude" / **there is no Retry**, even though `checked-failed` and `conflict` (which are also failures) both have one — the inconsistency makes it look as if these two are unrecoverable — Remote Access, `checked-silent` / `error` — `…-shots/s-error.png`
- U27 accepted — fixed with U3; the address row copies on click.

  ORIGINAL: I expected the address to be copyable where it is shown / **"This computer is listening at http://100.82.14.7:9900"** is plain text with no copy button, while the other address (in Add Device) has one — Remote Access, `checked` — `…-shots/s-checked.png`
- U28 REJECTED — verified false. Settings IS reachable at 420px: the gear collapses into the ||| menu, which lists Settings, Projects, Session Files and Games. Probed at 420x860 on this branch. The tester flagged their own uncertainty, and was right to.

  ORIGINAL: outside the panel, but it blocked one of my checks: at a **420px-wide window there is no Settings gear in the title bar** (the settings drawer itself is still in the page, parked off-screen at x = -45), so Remote Access cannot be opened at all at that width — App title bar — no screenshot (the panel never opened; recorded as a failed shot, not evidence)

## Could I finish the task?

Yes — I set remote access up from scratch, reached the QR code, and removed "My phone" from the device
list; the removal worked immediately and correctly, and the confirm step ("Cancel / Confirm unpair") was
the clearest thing on the screen. But I only knew it had worked because a row vanished. The single most
confusing moment was the `checked` state: the app told me in a green message to "pair one below to try
it" while the Add Device button directly below was greyed out and gave no reason — I clicked it four
times before accepting it was dead. Close behind that: after pressing "Set up" the entire status message
disappeared, so at the exact moment I most wanted to be told "this is working, here is the address for
your phone", the app went silent and took the address away with it.
