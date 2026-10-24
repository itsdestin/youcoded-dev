---
status: draft
work_item: 155
---

# Google files — design context

## Agreed direction (conversation, 2026-10-17)

Simple YouCoded-owned Google sign-in and selected Drive files, including creating,
reading, editing and saving Docs, Sheets and Slides. First milestone is the complete
connect → select/create → ask for changes → approve as required → save-to-Drive path.
Build reusable accounts; Calendar follows (#156); Gmail is separate (#157).
Microsoft/Apple (#158) and contacts/tasks (#159) are later work.

Carry forward the recovered September direction: multiple accounts, per-device
credentials, prepare/finalize separation, restrictive configurable permissions,
and preserving useful old plugin capabilities. Do not silently replace all add-ons.
Whole-Drive search and an embedded Google editor are outside the agreed first scope.
Card #155 indexes the complete historical recovery, including other existing cards.

## Questions before drawing

`google-files.questions.json` asks only:

1. Chat-specific file selection versus automatic reuse across chats.
2. Default save target: original versus copy (both remain available where permitted).
3. Open the file in Google versus a read-only in-app preview for the first release.

Submitted answers (`google-files.questions.answers.json`, submitted 2026-10-18
01:02 UTC): attach per chat; update original by default; open in Google. The user
also asked whether Google could open in YouCoded's assistant browser. That is a
possibility to evaluate, not approval to grant the browser broader Google access.

Google authorization and YouCoded's per-chat access policy are distinct. Removing
an attachment must not be described as revoking Google authorization or erasing
content already in chat/model context.

## Verified Google picker constraints

Official documentation fetched 2026-10-17:
https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker?hl=en
(page marked updated 2026-10-12).

- Desktop/mobile picker opens in the default system browser and returns via the
  OAuth callback, not a custom YouCoded browser panel.
- Picker authorization uses `drive.file` alone; this flow cannot combine it with
  other scopes. Reusing account infrastructure for Calendar does NOT mean merging
  Calendar scopes into this picker request.
- Required URL parameters include `prompt=consent` and `trigger_onepick=true`.
  Do not promise no consent screen when selecting additional files.
- Multiple selection is supported (`allow_multiple=true`). Returned file IDs and
  a new authorization code must be handled and validated by the app.
- Previously granted files can be accessed later with a valid appropriately scoped
  token; access remains subject to revocation and the user's current file rights.
- Separate platform OAuth client IDs are required. The page also documents a
  distinct AI-agent client setting; evaluate it before choosing client registration.
- Picking a folder is NOT evidence of recursive access to its children. No such
  capability is promised by the initial design.

Google Drive scope classification checked in this conversation:
https://developers.google.com/workspace/drive/api/guides/api-specific-auth
`drive.file` is non-sensitive. This is not a waiver of all verification/privacy/AI
policy obligations. Verify the exact complete endpoint/scope set before build.
No live Google connection, client registration, domain verification, paid audit,
account modification or end-to-end API test has been performed in this session.

## Built-in browser option: additional decision

Source inspected after the submitted note:
- `youcoded/desktop/src/main/ipc/browser.ts:215-246` has user-driven URL opening
  and page input, gated desktop-only.
- `youcoded/desktop/src/main/assistant-browser/browser-service.ts:10-12,350-363`
  uses one persistent browser profile shared between chats (tabs have chat owners).
- `browser-tool-specs.ts:104-109` discloses remembered website sign-ins across chats;
  the agent can operate websites through Browser tools and their separate policy.
- `docs/archive/specs/2026-10-13-assistant-browser-design.md` → As built confirms
  the user can click/type in the live browser panel.

An optional desktop action could open the Google document URL there, but connector
OAuth authorization is not a website login. Google website sign-in in that browser
would be separate and is not constrained by drive.file or per-chat attachments.
Do not silently promise file-scoped isolation while also signing the assistant's
shared browser into the full Google website. Google login and Docs editing in this
browser have not been exercised here. Keep connector OAuth and Picker in the system
browser regardless. The submitted `google-files.browser-question.answers.json`
(2026-10-18 01:06 UTC) chooses **external-only**: no built-in-browser action in this
release. Do not reopen this choice without a new user request.

## Existing UI references inspected

- `youcoded/desktop/src/renderer/components/InputBar.tsx:997-1006`: the current
  attachment action opens the local file dialog and adds selected paths. Google
  selection must preserve this local-file path, not replace it.
- `youcoded/desktop/src/renderer/components/ConnectedAccounts.tsx:62-140`:
  Accounts label, explanatory card, nested GitHub connection row, account identity,
  connect/disconnect and explicit disconnect consequences. Reuse this pattern for
  Google instead of creating another unrelated account-management surface.
- `youcoded/desktop/src/renderer/components/AccountSection.tsx:175-190,218-226`:
  existing Connected services subpage (`settings/account/connections`) under Account;
  service sign-in is separate from YouCoded profile sign-in.

Baseline `chat` and `settings/account/connections` were captured with `shoot` in
light, midnight, meadow-mist and halftone-dimension: **8/8 verified**. Contact sheets
for light and halftone-dimension were opened. Pictures are under `runs/before/`.
They are current product references, not pictures of the proposed Google UI.

## State

Both questions decks submitted. Real-renderer UI-only mockup work is in progress;
no backend/OAuth implementation or live account changes authorized by this stage.
The questions were reviewed for plain-language clarity: persistent access applies
to selected files, revocation can end it, and viewing does not add an embedded editor.

Dependency setup: startup reported 19 missing/outdated packages; the initial shoot
build failed on missing `dompurify` (full error captured outside the repo). Moved
this session's hardlinked node_modules aside, installed isolated dependencies with
`npm ci --ignore-scripts --no-audit --no-fund` (exit 0), and moved the original links
to `scratch/google-deps-start`. No shared dependency inodes were modified. Shoot then
built and captured 8/8 baseline pictures. Electron postinstall was intentionally
not run; renderer-only tooling is available, but an Electron launch may still need
its binary provisioned separately.
