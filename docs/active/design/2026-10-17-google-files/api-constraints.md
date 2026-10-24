---
status: draft
work_item: 155
---

# Selected-file API constraints — documentation check

Checked official Google documentation during design, 2026-10-17 local date.
This is documentation evidence, not live-account verification or an implementation contract.

## Supported scope

`drive.file` is supported by the Docs, Sheets and Slides scope guides and the
Sheets values.update reference. Combined with Picker, it supports operating on
selected/app-created files, not arbitrary whole-Drive access.

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/docs/api/auth
- https://developers.google.com/sheets/api/scopes
- https://developers.google.com/slides/api/scopes
- https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/update

Verify each concrete endpoint used by the implementation. Avoid adding broad scopes
merely because an older plugin or convenience client requested them.

## Account identity — correction to initial researcher finding

The researcher found that the OAuth authorization response does not itself identify
the account, then inferred additional identity scopes were necessary. The latter
inference is **not supported**: Drive `about.get` explicitly accepts `drive.file`,
returns the authenticated `user`, and that resource includes `displayName`,
`permissionId`, and `emailAddress`.

- https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get?hl=en
- https://developers.google.com/workspace/drive/api/reference/rest/v3/about?hl=en
- https://developers.google.com/workspace/drive/api/reference/rest/v3/User?hl=en

Candidate: request `fields=user(displayName,permissionId,emailAddress)` after token
exchange. Do not parse identity from the authorization code or assume a guessed
email. `emailAddress` can be omitted in some contexts according to the User docs;
handle missing values and verify this route with a test account before relying on it.
Do not add openid/email/profile to the desktop Picker request, whose docs require
`drive.file` alone.

## Removal, disconnect and Google file permissions

- Remove attachment: stop offering that file through this chat's connector access.
  Does not revoke Google authorization or erase content already in chat/context.
- Remove saved local account and revoke Google OAuth consent are distinct operations.
  A final implementation must choose the actual semantics and state them accurately.
- Drive collaborator permissions (`permissions.delete`) are **not** a substitute
  for revoking an app's per-file Picker grant. Never delete someone's sharing ACL
  when they merely remove a Google attachment or disconnect the app.
- Determine revocation's impact on other scopes/clients before designing per-service
  disconnect after Calendar/Gmail; do not assume those grants revoke independently.
  No claim of per-file Google-grant revocation has been established here.

Source for Google OAuth consent revocation:
https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works

## Write target and capability checks

Use current-user `capabilities.canEdit` and `canCopy`, not guessed roles. Copying
is not always permitted when editing is not. Original/copy controls must reflect
those actual capabilities. Target account follows the selected file's authorized
account, not whichever account the picker happens to display later.

- https://developers.google.com/drive/api/reference/rest/v3/files
- https://developers.google.com/drive/api/reference/rest/v3/files/copy

Do not promise copied files retain original links, sharing, comments, revision
history or folder placement. Verify actual copy behavior for the selected file type.

## Collaboration and stale edits

Slides `writeControl.requiredRevisionId` supports rejecting a stale revision.
Docs also needs its write-control behavior checked endpoint-by-endpoint before the
backend plan. Sheets batch validation/atomic application is not equivalent to an
optimistic concurrency precondition; the researched Sheets references do not
establish an equivalent revision fence. Do not promise race-free saves across all
three apps. Re-read/review and explicit stale-change handling require a technical
plan; a delayed approval must not blindly apply obsolete edits.

- https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate
- https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

## Research review disposition

Accepted: selected-file scope support; canEdit/canCopy distinction; no guaranteed
copy-sharing preservation; Sheets atomic batch is not general conflict protection.
Corrected: identity is not necessarily dependent on additional OAuth scopes; use
Drive about.get as documented, with missing-field handling and runtime verification.
Rejected as a UI action mapping: treating removal of a Picker grant as deleting a
Drive collaborator ACL. No such operation is authorized by this feature's UI.
