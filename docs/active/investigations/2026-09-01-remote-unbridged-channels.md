---
date: 2026-09-01
status: active
type: investigation
topic: most window.claude channels are not bridged over remote access — and which ones should be is a scoping decision
---

# Remote access: the unbridged channels

**Symptom.** Over remote access, whole features are visibly missing or fail with an
"X isn't available via remote access yet" notice: the artifact pane cannot open ANY file
(not a 4 KB note), Project View tabs are thin, the game lobby signs in but stays empty,
"+ Add file" uploads the file and then fails, and a handful of buttons throw at the
call site.

**Mechanism.** `youcoded/desktop/src/main/remote-server.ts` handles WebSocket requests in
one `switch` over the channel name. Since youcoded `f17d00cb` (2026-07-20) it has a
`default:` case that answers immediately with `{ ok: false, unsupported: true, channel }`;
the shim (`youcoded/desktop/src/renderer/remote-shim.ts`) maps the channel to a feature
name and `RemoteUnsupportedNotice` shows it, deduped by FEATURE (load-bearing:
`useAttentionClassifier` polls an unbridged channel every second). Pinned by
`tests/remote-shim-unsupported.test.ts` + `tests/remote-server.test.ts`.
<!-- claim: {"path": "youcoded/desktop/src/main/remote-server.ts", "contains": "unsupported: true,"} -->

**Still unbridged, 2026-09-01** (from the `case '…'` inventory of the switch): all of
`social:*` · every `artifacts:*` except `list-projects-index` (so neither `artifacts:get`
nor `artifacts:read-binary` — the artifact pane's two read paths — nor
`artifacts:import-file`) · `project:*` · `theme:*` · `theme-marketplace:*` ·
`marketplace:*` · `integrations:*` · `dialog:*` · `dev:*` · `terminal:get-screen-text` ·
`commands:list` · `performance:*` · `analytics:*` · `app:restart` · `platform:get` ·
`session:set-flag` · `update:changelog`. (`appearance:get/set` came off the list
2026-08-12.) Bridged since the item was filed, for orientation: `specialists:*`,
`permissions:*`, `chatsearch:*`, `transcript:page`, `arcade:*`, `git:*` is shimmed.

**"+ Add file" case (old L604).** In remote mode `dialog.openFile()` maps to
`pickAndUploadFiles()` (shim ~line 1058) — it uploads the picked file to the host and
returns a host path. The renderer then calls `artifacts.importFile`, which the shim sends
as `invoke('artifacts:import-file', …)`; the server has no case, so it falls into
`default:` and the import fails AFTER the upload already landed on the host. Not a
regression — the button was already broken this way before the upload step existed —
but it is now a filesystem mutation, so it rides the scoping decision below. Either
bridge it deliberately or hide the button in remote mode.

**Six methods with no shim entry at all** (`preload.ts` has them, `remote-shim.ts` does
not, counted 2026-09-01): `remote.installTailscale`, `remote.authTailscale`,
`detach.detachLive`, `detach.dragWindowMove`, `buddy.captureDesktop`,
`buddy.onAttachFile`. These fail as `undefined` TypeErrors at the call site, not as
notices — and `buddy.onAttachFile` is a subscribe helper, so its caller crashes on mount.

**Why this is not a mechanical "add the cases" task — the decision for Destin.** The
remote channel is password-authenticated but NOT TLS-encrypted
(`youcoded/desktop/CLAUDE.md` → Remote Access). Bridging the mutating channels —
`artifacts:delete-project`, `artifacts:import-file`, `account:delete`,
`account:sign-out`, `dialog:open-folder`, `marketplace:install` — exposes host
filesystem and account mutation over it. Needed first: which namespaces are safe to
expose, and whether any are read-only over remote. The read-only artifact channels
(`artifacts:get`, `artifacts:read-binary`) are the highest-value, lowest-risk first
slice; every size/preview refinement for remote is unreachable until they exist (the
ask-before-a-large-download design in
`docs/archive/specs/2026-08-25-artifact-pane-size-limits-design.md` §4.6 was cancelled
for exactly this reason).

**History.** Added 2026-07-20 (found debugging empty Project View + signed-out games on
a phone); the "+ Add file" case added 2026-07-23 (auditing the Files-tab merge); the
artifact-pane consequence measured 2026-08-25. Re-checked against `master` 2026-09-01.
