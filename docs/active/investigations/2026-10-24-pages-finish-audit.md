---
status: active
date: 2026-10-24
related: cards/90-youcoded-pages-let-people-create.md; docs/active/plans/2026-09-16-youcoded-pages-phasing.md; docs/active/specs/2026-09-15-youcoded-pages-scope.md
---

# Pages — what is general, what is one-off, and what Phases 3–4 build on

Read-only audit of origin/master as of 2026-10-24 (youcoded `954ddce1e`, wecoded-marketplace Page
Builder 0.3.0). Three parallel researchers plus spot checks. Paths are relative to
`youcoded/desktop/src/` unless noted. Destin's goal (2026-10-24): "they should be able to build
almost any application you can imagine inside of YouCoded itself … without a bunch of niche one off
connections that I have to build separately each time … our permissions framework … needs to be
aware of that and support that." He chose to finish Phases 3 and 4 in full.

## 1. Connection kinds today

| Kind | General? | Tailored to | General form |
|---|---|---|---|
| `public` | yes | — | merge into "web service" |
| `key` | mostly — one secret, one placement | — | web service with an auth block (api key / basic / multi-secret / OAuth2) and `allow` rules |
| `open` | yes, deliberately blunt; never combined with a credential (`main/pages/page-connections.ts:263-268`) | — | keep |
| `youcoded` | no — fixed `api.youcoded.ai` (`page-connections.ts:384`); `writePaths` exists for one campaign page (`:178`) | YouCoded worker | a bundled web-service definition; `writePaths` becomes a general `allow` rule for every kind |
| `github` | no — fixed host (`:385`), the app's own token (`pages-service.ts:631`) | GitHub | bundled OAuth2 definition that reuses the app's sign-in |
| `device` (HTTP) | mostly — any private/Tailscale address the person types | Home Assistant examples, default socket path `/api/websocket` (`pages-service.ts:593`) | "local network" connection |
| `device` live socket | half — caps/lease/redaction generic (`page-live-socket.ts`) | messages must be JSON `{type}` (`page-socket.ts:105-113`), deny floor `auth/ config/auth person/` (`:89`), hello/ready/authFailed modelled on HA | protocol profile: message shape any/json/text, deny list from the profile |
| `device` camera video | no — Nest transceivers + `dataSendChannel` hard-coded (`renderer/components/pages/page-video-host.ts:327-330`), `domain.` entity rule (`page-live-video.ts:127`) | Nest via Home Assistant | profile supplies transceivers/data channels; SDP filtering stays |
| `plaid` | no — 516-line `plaid.ts`, Plaid types in shared, own `window.youcoded.plaid` door, own approval wording | Plaid | bundled definition built from two general mechanisms: multi-secret body injection + a host-held per-account token store, and a generic browser sign-in (OAuth2 code or open-URL-then-poll) |
| `session`, `chats` | yes — app abilities | — | an "app abilities" family, one registry entry each |
| `program` | yes; full computer access, hash-bound approval (`page-program.ts`) | — | keep as the explicit escape hatch |

**Missing abstraction:** no registry of kinds. Each kind is a `switch` case in `parseConnections`,
`fingerprint`, `covers`, `methodAllowed`, `credentialFor`, plus approval wording, frame API, host
handler, IPC, phone fixture, workbench shim — ~9–12 files per kind. `session`/`chats`/`program`
need hand-written `false` branches in `covers`/`methodAllowed`.

**Permission model (keep):** per-line fingerprints in `<userData>/page-connections.json`, never
synced; adding/widening re-asks only that line; removal never asks; keys in SecretsStore; programs
re-ask on file hash. **Weak points:** a code-only change never re-asks (quiet note, deck-3 decision);
no warning when a page holds both private data (chats, files, bank) and a way out; any two
credentialed kinds may combine.

## 2. Security gaps found

- **Popup leak (verified 2026-10-24).** The page frame keeps `allow-popups`
  (`renderer/components/pages/PageHost.tsx:710`) and the window's open handler sends every http(s)
  URL to the OS browser (`main/main.ts:747-750`). A page holding chats, a key or (later) files can
  put data in a URL and open it. No approval covers this.
- **Form submission (unverified).** `allow-forms` is on and CSP `form-action` does not fall back
  to `default-src`; a form posting to an outside address may navigate the frame. Check during build.
- **Hostile name server (known, card #90 (c)).** `net-guard.ts:6-7` checks the DNS answer then
  fetches by hostname; an `open` page could reach a home device by re-binding. Fix needs a package.

## 3. Phase 3 foundations

**Files.** Dialogs: `dialog:open-file`/`open-folder` (`main/ipc/shell.ts:57,83`, desktop only); save
dialogs with overwrite confirm (`main/office/office-dialogs.ts:21-37,91-110`). Opaque per-document
handles, never paths (`main/office/office-pictures.ts:14-60`) — the model for one-off picks. Known
roots and secret deny list (`main/ipc/file-gates.ts`, `main/artifacts/read-service.ts:459-491`,
`main/phone-read-deny.ts`). Missing: any page file channel, a folder-grant kind, a scoped write
primitive, combined-access wording.

**Assistant tasks.** One-shot model call with no session: `generate()` (`main/create-runtime.ts:611`).
Hidden owned sessions precedent: specialists (`sessionKind`/`parentSessionId`,
`main/harness/session-store.ts:34-35`, excluded from `list()` at `:446-461`) — but they need a live
parent. Full native surface: `NativeSessionHost.create/send/interrupt`. Session creation itself is a
closure tangled into `main/ipc-handlers.ts:605` — no reusable factory. Permission asks render in the
session's own chat (`permission-broker.ts:208`), so a hidden task would wait forever on an ask.
**No spending limit exists anywhere** (only a step-count guard and display pricing); the plan's
"existing spending limit" is wrong. Claude Code (subscription) sessions are PTY-only; no quiet lane.

## 4. Phase 4 foundations

Themes are the template: registry fetch + cache, validated install with size cap and manifest-last
write, `recordPackageInstall`, version-based updates, community-only uninstall
(`main/theme-marketplace-provider.ts`). Publishing is GitHub-PR only (`main/github-fork-publish.ts`);
the worker has no upload endpoint. Catalog scan status is keyed to commit + rules version
(`wecoded-marketplace/docs/catalog.md`) — the model for "reviewed status attaches to a version";
"verified" today means mirrored from Anthropic's list, not human review. Theme `contentHash` is never
verified at install. Pages lack a `version` field (`pages-store.ts:205-226`), an origin record, a
registry, scanner rules for html + page.json + program files, and a rule for local edits of an
installed page. `data.json`, approvals, keys and the device address already live outside what would
ship; a `chats` scope can name private projects/tags.

## 5. Outside practice worth copying

- Service = data file + one generic engine (Power Platform custom connectors, n8n credential types,
  Nango providers): host, auth type, where the secret goes, a harmless test request, allowed operations.
- Desktop OAuth = PKCE + loopback `127.0.0.1:<port>`; all scopes asked up front. Google/Microsoft
  bring-your-own is impractical for non-developers; integration platforms run a verified shared app
  (Google restricted scopes need an annual security assessment unless personal/testing use).
- Chrome disables an extension whose update adds a warning-level permission until re-approved.
- Nobody found warns users in plain words about combined read-private + send-out access — original design.
- AI access by apps: Raycast asks before an AI tool runs; cost/quota explanation is unsolved elsewhere.
