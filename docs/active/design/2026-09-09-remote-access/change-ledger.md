# Remote access — proposed visual changes

Status: mockups in progress; no UI contract signed. Questions submitted 2026-09-09:
guided setup, offline drafts require explicit send, independent phone selection.

| ID | Proposed change | Why / rule | Decision |
|---|---|---|---|
| 1 | Replace the host's scattered setup controls with guided prerequisites, name disclosure, checking and ready states | Q-1 guided; G-4 one primary; accurate verified status | Not approved in round 1; revise preserving existing layout/controls |
| 2 | Show a secure address and remembered online/offline devices with explicit revoke confirmation | Pairing stays required; revocation is not temporary disconnect | Not approved in round 1; revise preserving existing layout/controls |
| 3 | Show reconnect/auth/uncertain-action status above the phone composer while keeping editable drafts | Q-2 draft; StatusStrip; never repeat uncertain actions | Presentation component tested; composer integration and mockup pending |
| 4 | Preserve the phone's selected conversation instead of following desktop navigation | Q-3 independent; shared content, independent selection | Pending mockup/behavior review |

Rejected question alternatives: Q-1 manual-first setup, Q-2 explicit offline send queue,
Q-3 follow a desktop window. Do not silently add those behaviors.

## Round 2 correction

Destin rejected both round-1 steps: unfamiliar bottom-left actions, confusing technical
setup, and loss of Keep awake and Enabled/Disabled. Preserve the familiar panel,
password controls, keep-awake presets, Enabled toggle and Add Device. Put secure setup
in a contextual status/action row, not a replacement wizard. Round-1 answers remain
intact in `remote-access.review.answers.json`. A new `remote-access.review-2.json`
will show the corrected proposal; no backend contract exists yet.

## Fidelity

The mockups use the real renderer and a fake backend. No real certificate, network
connection, revocation or filesystem operation occurs. The host setup preview is
explicitly gated on a mock-only API until the signed contract defines the real backend.
A successful fake check is not evidence that Tailscale Serve works on a real device.

## Review coverage to collect

Host before/after: Midnight, Light, Halftone Dimension; ready, setup, consent, checking,
conflict/error, remembered-device revoke confirmation, empty list. Phone width and
short-height scrolling must be examined. Recovery mockup follows as a separate slice,
not a reason to delay a focused host setup review.
