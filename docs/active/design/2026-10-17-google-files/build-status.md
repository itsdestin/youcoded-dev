---
status: active
work_item: 155
---

# Google files — PAUSED, reconsider implementation

## Pause decision — end of this session

Destin: "we're putting this work on hold ... i just don't know if i think this is
the best implementation ... we still basically require the user to access the
browser on every use ... explore just fully utilizing rclone for all google drive
work instead of our own oauth app."

Card #155 is paused on master. The next step is comparative exploration, NOT
continuing this implementation or automatically replacing it with rclone. Check
actual setup/reauth/browser frequency, whole-Drive browsing, Google-native editing
versus export/import, fidelity and collaboration, approvals, multiple accounts,
platform support and maintenance. Do not assume rclone eliminates OAuth or provides
native Docs/Slides/Sheets editing. The complaint is recorded as the user's experience,
not a verified claim that previously granted files require a browser on every read.

Preserve current code, submitted decisions and company setup. No deletion, revoke,
commit, merge or push authorized. App and design work remain uncommitted/local in
`session/155-google-files`; planning card updates are saved to master by cards.mjs.
The Google Files dev instance was stopped with run-dev.sh --stop --offset 170;
its ports are free. The installed app was not stopped.

The latest requested UI cleanup was interrupted before its agent could report.
User's specific UI requirement is unresolved: signed-out picker must show a concise
sign-in-first card, no search/account dropdown/disabled Add controls or redundant
nested empty boxes; other Google surfaces must follow the app design guide. Do not
represent the current UI as accepted. Original screenshot:
`/tmp/claude-desktop-attachments/paste-1792294889903.png` (temporary).

## User direction

After the two submitted choice decks, Destin explicitly requested stopping further
mockup rounds and building a working testable feature. Choices remain per-chat
attachment, original edits by default (copy option), external browser opening.
No commit, merge or public deployment permission was given.

## Company Google setup

User created Cloud Identity Free under youcoded.ai and reported automatic domain
verification through Cloudflare. Existing email routing stays with Cloudflare;
no mail DNS changes made by this session.

CLI verified:
- Project ID: `youcoded`; project number: `558270007163`.
- Organization: `youcoded.ai`, ID `425799930819`.
- `admin@youcoded.ai` holds project Owner.
- Enabled Drive, Docs, Sheets, Slides and Picker APIs. Billing remains disabled.
- Google Cloud CLI 589.0.0 installed locally, official SHA256 verified, using
  isolated CLOUDSDK_CONFIG at ~/.config/youcoded-google-admin.
- User downloaded Desktop OAuth client JSON; validated installed-client shape and
  project without printing its secret. Private 0600 copy at
  ~/.config/youcoded-google-admin/desktop-oauth-client.json, never in either repo.
- Dev launch reads that file through YOUCODED_GOOGLE_CLIENT_FILE. No user Drive
  grant has yet been verified. Admin CLI authorization is not user Drive access.

## Actual implementation, not mock behavior

- Main GoogleFilesService: loopback Picker OAuth/PKCE, profile-specific encrypted
  tokens via SecretsStore, account metadata, selected-file metadata, per-chat
  attachments, reads, local edit/create proposals and user-approved cloud saves.
- GoogleFiles native assistant tool can list/read/propose/create drafts, never
  approve or attach. Native chat ID mapped consistently from UI tab ID.
- Real renderer provider replaces fixtures outside workbench; pending changes
  fetched on explicit Review Google changes, no background polling.
- Drafts have one-shot approvals; exact replacement text/cell data shown for review.
- First working slice is desktop native assistant only. Android/remote feature
  capability is false; wire methods exist but table refuses them. Claude Code tool
  relay is not implemented. Do not present this slice as full cross-platform parity.
- Advanced formatting is not implemented. Initial operations: Docs/Slides text
  replacement, Sheets literal cell writes, and bounded initial new-file content.

## Verification and runtime

Parent typecheck passed. Focused real-flow/guard run: 9 files, 90 tests passed.
Earlier full verify found small channel-declaration line overruns, refusal-list
mismatch and missing scroll fade; fixes applied. The subsequent full desktop verify
passed after the security fixes (log below); no fresh verification of an interrupted
UI cleanup is claimed.

Dev instance launched by scripts/run-dev.sh: label Google Files, profile google-files,
offset170, Vite5343, DevTools9392. Initial process disappeared; relaunched once and
verified through the marked dev-only explore connection, no page errors. Opened
Settings → Account → Connected services; real Connect Google button visible.
User asked to click it and choose a non-sensitive test file. No live installed-app
probe or direct live-state modification was performed.

## Static review received

Reviewer 705cfba4-e62a-4f67-8821-c09a105ab4b1:
- Accepted: copy must verify edit-relevant contents after copying, not trust new snapshot.
- Accepted: multi-range Sheets changes should be one batch, not a partial PUT loop.
- Accepted: one deleted selected file must not prevent listing remaining good files.
- Reviewer approved exact small declaration-only budget increases; feature logic
  is in separate modules and preload requires its inlined bridge.

Worker 8811ffec-072f-4a2e-be56-8057ad2193a1 implemented the three backend fixes
with regression tests (45 service tests passed). Parent ran full desktop verify
against the combined tree after integration: exit 0; types, related tests, knip,
lint/design lint, invariants, screens and journeys all pass. Logs:
`scratch/verify-20261017-203521-1296306`.

The dev main process predated these three fixes and has now been stopped at the
user's pause request. Do not restart until work resumes. No authenticated Google
document read or write is yet verified. Android and Worker not tested.
