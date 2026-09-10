# Remote Access UX review 1 — resumed successfully

## Current findings

- U2 accepted — Added the one-sentence Tailscale explanation. Expected to know why another app is required / “Tailscale” is unexplained beside “Install Tailscale.” Add “Tailscale privately connects your devices.” — Setup — `scratch/remote-ux-panel/midnight/settings.png`; `scratch/remote-ux-direct/light/install.png`
- U3 accepted — Replaced private-address wording with connection address. Expected consistent privacy wording / “private secure address” precedes disclosure that its full name becomes public. Replace “Next, approve a private secure address” with “Next, approve your connection address.” — Setup and disclosure — `scratch/remote-ux-panel/light/settings.png`; `scratch/remote-ux-disclosure/midnight/disclosure.png`
- U4 accepted — Applied shorter Tailscale prompt instruction. Expected an actionable instruction / “Any Tailscale approval happens before a check succeeds” is indirect. Shorter: “Approve any Tailscale prompt to continue.” — Disclosure — `scratch/remote-ux-disclosure/midnight/disclosure.png`
- U5 rejected — Retain Revoke for this review because it explicitly removes authorization, not the device or its data; confirmation explains loss of access and re-pairing. Destin can revise the label in the deck. Expected everyday removal wording / “Revoke” and “Confirm revoke” are less direct than “Remove device” and “Remove.” — Remembered devices — `scratch/remote-ux-ready/midnight/ready.png`; `scratch/remote-ux-remove/midnight/removed.png` (confirmation label verified by control dump only)

## Retry coverage

**U1 below is resolved environment history, not a product issue.** Resumed for approximately five minutes after restart. No source read, app code edited, servers started/stopped, or commits made.

Desktop: navigated Settings → Remote Access → Continue → public-name approval → Ready to connect. I understood that the complete computer/network name becomes public, not chats/files, and that Tailscale plus YouCoded pairing remains required. Found the connection address; Copy address changed to Copied. Revoke opened confirmation; Confirm revoke removed My phone while retaining My tablet (explicit assertion passed). No actual second-device connection was attempted.

390px direct panel: simulated Install Tailscale → Sign in to Tailscale → Continue → approval → ready completed in midnight/light. No password/keep-awake controls encountered. Narrow full-app Settings navigation was not verified: desktop Settings selector was absent, so used the supplied direct panel instead.

Visually examined desktop setup midnight/light, desktop disclosure/ready midnight, narrow install midnight/light and narrow sign-in midnight. No clipping noticed in these examined panels. Further images hit the tool's `over the 8-images-per-turn budget`: light desktop ready, removal confirmation/result and narrow ready were captured and control-tested but **not visually reviewed**. Touch/high-density testing remains untested. No product dead end established in completed flows.

Commands and actual output:

```text
CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-complete.json scratch/remote-ux-ready midnight,light
2/2 shots verified.
CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-remove.json scratch/remote-ux-remove midnight
1/1 shots verified.
CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-confirm.json scratch/remote-ux-confirm midnight
ok   midnight/removed (7 contrast fails)
1/1 shots verified.
```

`CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-narrow-ready.json scratch/remote-ux-narrow-ready midnight,light` completed; its manifest `scratch/remote-ux-narrow-ready/manifest-remote-ux-narrow-ready-midnight-light-s0of1-1788944869229.json` was read through Node: both themes reported `verified: true`, `errors: []`, `reasons: []`, with Copy address, Show QR code and Revoke controls. Final removal capture: `scratch/remote-ux-confirm/midnight/removed.png`. Narrow captures: `scratch/remote-ux-narrow-ready/{midnight,light}/narrow-ready.png`. Contrast totals include dimmed background app and are not treated as remote-panel findings without visual corroboration.

## Earlier blocked attempt — superseded (U1 resolved)


- U1 — Expected the supplied setup and ready previews to open / Both addresses refused the connection (`ERR_CONNECTION_REFUSED`), including a setup retry after the host-stable message; could not reach Settings or Remote Access. This is a review-environment blocker, not an established product defect. — Browser entry, desktop 1440×900 and narrow 390×844 — `scratch/remote-ux-initial/midnight/initial.png`; `scratch/remote-ux-ready-narrow/midnight/_unverified/ready-entry.png`; `scratch/remote-ux-ready-narrow/light/_unverified/ready-entry.png`

## Coverage and evidence

Read only the tester kit as project documentation; no source inspected. Dumped each attempted screen before interaction. Examined the three screenshots above: all show Chrome's connection-refused page, not the product. The narrow midnight/light runs therefore do not establish theme coverage. No app starts, stops, code edits, or commits.

Stopped before Settings: device setup, public-name disclosure, connection address, remembered-device removal, wording, clipping, and password/keep-awake controls could not be assessed. Touch and high-density input/display were not tested.

Commands and actual output:

```text
CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-initial.json scratch/remote-ux-initial midnight
ok   midnight/initial (0 contrast fails)
1/1 shots verified.

CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-initial.json scratch/remote-ux-retry midnight
ok   midnight/initial (0 contrast fails)
1/1 shots verified.
```

Those initial checks only asserted `body`, so their verification is not evidence that the app opened. Their dumps contained Chrome's Reload/Details controls.

```text
curl --max-time 5 -I 'http://127.0.0.1:5537/?mode=workbench&child=1&remotePreview=setup&latency=150'
curl --max-time 5 -I 'http://127.0.0.1:5537/?mode=workbench&child=1&remotePreview=ready&latency=150'
curl: (7) Failed to connect to 127.0.0.1:5537 after 0 ms: Could not connect to server
curl: (7) Failed to connect to 127.0.0.1:5537 after 0 ms: Could not connect to server

CDP_PORT=19349 node scripts/ui-review/shot.mjs scratch/remote-ux-ready-narrow.json scratch/remote-ux-ready-narrow midnight,light
MISS midnight/ready-entry — expect failed: js:document.body.textContent.includes('Remote Access')
MISS light/ready-entry — expect failed: js:document.body.textContent.includes('Remote Access')
0/2 shots verified.
```
