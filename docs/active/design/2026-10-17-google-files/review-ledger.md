---
status: draft
work_item: 155
---

# Google files — first UI review ledger

The two submitted questions decks settle the direction; these visual changes are
not yet approved. Keep these numbers stable across review rounds.

| Change | Proposed UI | Reason / approved boundary | Decision |
|---|---|---|---|
| G-1 | Google accounts inside existing Connected services, including disconnected, connected and reconnect states | Separate service authorization from YouCoded profile; reuse existing nested provider-card pattern | Await visual review |
| G-2 | Existing paperclip opens a menu: local file or Google Drive | Keep local attachments; make Google available where files are added | Await visual review |
| G-3 | Add previously selected Google files to this chat, with account choice and Add from Google Drive | `Q-reuse=attach-per-chat`; own list is not the full Drive; new grants happen through Google's external picker | Await visual review |
| G-4 | Google attachment tiles show file identity/type/account and can be removed before sending | Selection belongs to this chat; removal does not claim to revoke Google authorization or erase past content | Await visual review |
| G-5 | Review proposed save, original by default with copy option | `Q-save-target=original`; approval before external changes by default; target account must follow the selected file | Await visual review |
| G-6 | Save result with Open in Google using normal system browser | `Q-view=google`, `Q-browser=external-only`; no assistant-browser website login or embedded editor | Await visual review |

## Fidelity requirements for the deck

- These are real renderer components using fake accounts/files/operations. OAuth,
  Google's picker, Google save and external opening are not connected yet.
- No fake Google webpage, generated screenshot of Google, or self-labelled
  "prototype" notice inside the proposed app UI. Describe limits in deck risk fields.
- A before/after view uses the verified baseline under `runs/before/` for the
  existing chat and Connected services screens. New states use their actual named
  screen in the real renderer; no standalone gallery.
- References: chat paperclip/attachment tiles, Account → Connected services nested
  provider cards, existing shared dialogs and approval controls.
- Check empty and failure states, visible selection/account boundaries, delayed
  responses, list overflow, phone width, and light/dark/wallpaper themes.
- The fresh UX tester operates the mock flow before Destin gets the visual deck.

## First draft triage

The first delegated draft is rejected before user review: standalone workbench
page rather than integration into existing screens; on-screen fixture buttons;
non-closing dialog and add/cancel behavior; raw select and technical target IDs;
no named screenshot registration or chunk bound; no established RED test run.
Typecheck and two helper tests passing were not sufficient evidence of usability.
A replacement is being built in the actual integration points with behavioral tests.
