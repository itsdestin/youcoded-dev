---
status: active
---

# Remote access — first secure, reliable milestone

## Decision and scope

Destin approved narrowing the assignment on 2026-09-09. Keep Tailscale near term.
Deliver secure, reliable remote access plus conversation restoration and file reading;
stop for acceptance before uploads, editing, or other feature batches. This is an
approved scope brief, **not an approved UI contract or implementation design**.

First prove private HTTPS/WSS through Tailscale Serve with a locally bound YouCoded
backend is suitable. Tailscale is approved; this particular integration is not yet
proven. Reference: https://tailscale.com/docs/features/tailscale-serve.
If it cannot meet the requirements, or needs disruptive configuration changes, return
with short options and pros/cons rather than silently substituting an approach.

Communication: short, plain language. Explain user decisions, not the full engineering
inventory. Keep technical evidence below the milestone summary.

UI correction (Destin, round-1 review 2026-09-09): preserve the existing Remote Access
panel and its Enabled toggle, password field, Keep awake controls and Add Device.
Secure setup is contextual, not a replacement wizard; no unfamiliar bottom-left
primary action or technical wall of text. Both initial visual steps were not approved.
See `docs/archive/design/2026-09-09-remote-access/remote-access.review.answers.json`.

## Deliver in reviewed batches

**Batch 1 merged 2026-09-10.** Tailscale Serve turned out to be unnecessary: the host binds
its tailnet address directly, which gives Tailscale-only access with no Serve route, no
certificate and no admin password. Certificates became an optional second level (approved,
unbuilt). Design and record: `docs/archive/specs/2026-09-09-remote-access-batch1-technical-design.md`,
`docs/archive/design/2026-09-09-remote-access/`. Batches 2 and 3 are open roadmap items.

1. **Secure connection and recovery:** secure setup, actual listener-health status,
   durable device revocation, bounded authentication/liveness, safe reconnect and
   action recovery. Establish secure access before enabling blocked capabilities.
2. **Conversation restoration:** readiness/snapshot/event ordering, authoritative
   state after reconnect, session selection and multi-window ownership parity.
3. **File reading:** session/project file lists, previews, downloads, project reading,
   and refresh after reconnect. Large transfers must not block chat.

Share underlying desktop/remote operations only where these batches need them;
no bridge-wide rewrite or automatic exposure of every IPC handler. Define explicit
allowed capabilities and a small versioned protocol. Reinventory current channels
rather than assuming an old unsupported-namespace list remains accurate.

## First checkpoint — transport feasibility, before implementation

Record evidence and remaining limits for:

- Supported desktop host platforms, Android pairing and browser clients; distinguish
  documented support from local runtime proof and platforms not tested.
- Certificate issuance/setup consent, Tailscale authentication confirmation,
  WebSocket upgrades, restart recovery, and phone wake/network-change recovery.
- Coexistence with existing Serve routes and ownership of configuration changes.
  Never enable public Funnel, reset Serve globally, or overwrite unrelated routes.
- Locally bound backend, authenticated file endpoints, origin validation, durable
  device revocation, and rejection of direct insecure bypass. Do not trust tailnet
  membership or a source-IP range as app-level pairing authorization.
- Migration of saved addresses and existing pairings; explicit version negotiation
  and old-client behavior. A clear update/re-pair requirement is acceptable where
  secure compatibility is impossible. Silent insecure fallback is not.
- Development isolation: token/config paths as well as Electron userData. Audit
  shared native/Claude state and startup side effects before any app launch.

Use read-only research/source inspection first. Real configuration changes and an
interactive/repeated-launch verification rig need separate permission. No live-app
attachment, IPC, signalling, settings changes, or experiments.

## Acceptance requirements

The first end-to-end path is: securely connect, open a conversation and its files,
lose the connection, reconnect, and continue safely.

- Restore authoritative conversation and file state after reconnect. Never silently
  discard an unsent action or automatically repeat one that may already have executed.
  If execution outcome cannot be established, show uncertainty and a safe next step.
  Do not promise automatic exactly-once recovery across every host failure.
- Distinguish connection recovery from action recovery. Expired queued requests must
  not execute later; stale socket callbacks must not corrupt a newer connection.
- Revoking a device blocks reconnection and file access, including after host restart.
- Connection status reflects verified listener/connection health, not saved enablement.
- Replace fixed hydration delays with a readiness/snapshot/event-ordering contract.
- File access reuses canonical, symlink-resolved authorization and protected-path
  policies. Bound transfers, support cancellation, and isolate active file content
  from the authenticated app origin.
- Retain app-level pairing. Do not advertise a read-only security mode while the
  device can command an agent that reads or writes through tools.
- Restrict host administration and credentials explicitly.

Test outage before send; outage after execution but before reply; host restart;
expired/revoked credentials; phone backgrounding and network changes; concurrent
host file changes; interrupted downloads; slow-client backpressure; and old clients.
After writes are separately approved, add interrupted-upload/import and conflict tests.

## Design and implementation gates

Technical investigation and tests may precede UI approval; changed interfaces and
their feature backend follow the workspace's feature-flow gates:
questions deck → mockups → fresh UX tester → Before/After review → signed contract →
technical design and capped review → task breakdown → small implementation batches.
Use regression tests before fixes. Afterwards use fresh code review, UX testing,
grading and the acceptance deck. Destin's scope approval here does not substitute
for the signed UI contract. Do not reopen agreed scope questions unnecessarily.

Run relevant tests plus `bash scripts/verify.sh` for desktop changes, and separate
Android/paired-client checks. Inspect actual SDK/JDK availability rather than copying
old environment notes. Ask before paid evaluations. No commit, push, merge, release,
or worktree deletion without the applicable explicit instruction.

## Next milestones — not this batch

- Uploads/imports and attachments: coordinate upload → authorization → import →
  acknowledgment; unique transfer IDs, limits, cancellation, partial-file cleanup,
  duplicate protection and attachment metadata end-to-end.
- Safe editing: reuse write restrictions and conflict checks; no silent overwrite of
  newer host edits. Add rename/move/delete deliberately. Uploading from a browser
  never implies deleting the phone's original file.
- Project editing; social/presence/games using existing account/arcade support;
  remote-device themes distinct from host appearance; marketplace browsing separate
  from privileged installation/authentication; browser audio bridged to host speech.
  HTTPS is a prerequisite for voice, not its implementation.
- Around v1.4, not a release commitment: account-based access without Tailscale,
  YouCoded Mesh device selection, optional potentially paid YouCoded Cloud fallback.
  Keep today's protocol reusable; build no relay, scheduler, Mesh, or cloud service.
  Future execution needs consent, budgets, available files/tools/credentials and
  duplicate-safe handoff. Existing roadmap entries retain this direction.

## Technical appendix — inherited findings, not current reproductions

The previous review inspected app HEAD `37340a29`. Recheck each claim against the
current component and pin verified defects with regression tests before fixes.
Paths below are relative to `youcoded/desktop/src/`; old line numbers are locators,
not evidence that current code is unchanged.

| Review target | Starting point |
|---|---|
| Timed-out requests remain queued and can execute after reconnect | `renderer/remote-shim.ts` 115–161 |
| Browser reconnect exhaustion enters Android-local fallback, clears credentials, can send android-local as password | `renderer/remote-shim.ts` 646–665 |
| Disconnect closes socket but retains token, despite password re-entry help | `main/remote-server.ts` 467–475; `renderer/remote-shim.ts` 626–635; `renderer/components/SettingsPanel.tsx` 69 |
| Profile-scoped config but shared pairing-token file | `main/remote-config.ts` 21–25; `main/remote-server.ts` 174, 261–275 |
| Setup success before authentication confirmation; mishandled error/status | `main/remote-config.ts` 285–314; `renderer/components/SettingsPanel.tsx` 2327–2349 |
| Connected derives from settings/VPN, bind failures only log | `renderer/components/SettingsPanel.tsx` 1262–1275; `main/main.ts` 1742–1745 |
| Remote config save bypasses desktop lifecycle and keep-awake effects | `main/remote-server.ts` 2272–2289; `main/ipc-handlers.ts` 1754–1789 |
| Hydration before listeners, whole-state replacement overlaps live events, fixed replay delay | `main/remote-server.ts` 828–922; `renderer/remote-shim.ts` 308–314, 565–586; `renderer/App.tsx` 1675; `renderer/state/chat-reducer.ts` 761–779 |
| Snapshot main-window dependency and session ownership | `main/main.ts` 283–286; `renderer/components/RemoteSnapshotExporter.tsx` (locate current path) |
| Duplicated defaults/folder behavior; unsafe folder persistence | `main/remote-server.ts` 1967–2157; `main/ipc-handlers.ts` 1344–1475 |
| Attachment metadata dropped at server call (later batch) | `renderer/remote-shim.ts` 1827; `main/remote-server.ts` 1046 |
| HTTP reachable beyond tailnet; IP-based passwordless trust | `main/remote-server.ts` 312–389, 747–767; `main/remote-config.ts` 102–111 |

Also investigate authentication/liveness bounds, phone wake/network changes, stale
socket callbacks and slow-client backpressure; these are review targets, not reproduced
defects. The inherited review says per-boot turn/group IDs and chunked PTY replay storage
are already fixed. Verify against current code and reconcile old backlog entries;
do not blindly redo their fixes or call source review a runtime pass.

Further starting points: `docs/roadmap/remote-access.md`,
`docs/active/investigations/2026-09-01-remote-unbridged-channels.md`,
`.claude/rules/artifacts.md`, `youcoded/docs/artifacts.md`, and
`youcoded/desktop/src/main/artifacts/read-binary-access.ts`.

## Preparation record — 2026-09-09

- Resumed `remote-mesh-roadmap` at
  `/home/destin/youcoded-dev/worktrees/sessions/remote-mesh-roadmap`; created its app
  component through workspace-start. App baseline: `de69d60a`; clean at inspection.
- The four inherited dirty files were present: `ROADMAP.md`,
  `docs/roadmap/remote-access.md`, `docs/roadmap/native-harness.md`, `docs/wrap-ups.md`.
  Preserve them. The earlier close-out's landed verdict did not account for these
  uncommitted edits; do not delete this workspace or branch on that basis.
- `node`, `npm`, `tailscale`, and `java` are on PATH. App `desktop/node_modules` is
  absent; provision isolated dependencies safely before running app tests.
- `/home/destin/.android-sdk` exists, contrary to the resumed workspace's older
  no-SDK note. This directory check does not establish usable build tools or JDK;
  verify versions/components before claiming Android readiness.
- No application code, runtime configuration or UI has been changed in preparation.
  Transport feasibility, current-code defect verification, UI contract and technical
  implementation plan remain pending; this brief must not be described as build-ready.
