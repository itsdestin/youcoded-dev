---
status: active
---

# Remote transport preflight

## Verdict

Private Tailscale Serve HTTPS → loopback HTTP backend is a suitable candidate,
not yet a runtime-verified YouCoded transport. No Serve configuration changes,
certificates, live-app interactions or Electron launches were performed.

## Documented transport facts

Official references inspected 2026-09-09:

- https://tailscale.com/docs/features/tailscale-serve — private reverse proxy,
  tailnet access controls, automatic certificate provisioning and web consent;
  Serve and Funnel on the same port are mutually exclusive, last configuration wins.
  The consent flow can enable Funnel capability: do not confuse that with permission
  to publish a listener. Verify the resulting YouCoded route is private.
- https://tailscale.com/docs/how-to/set-up-https-certificates — MagicDNS/HTTPS
  prerequisites; certificate transparency permanently publishes the full machine
  and tailnet DNS name, not chats/files. Explain this before issuance; renaming later
  does not erase the append-only record.
- https://tailscale.com/docs/reference/tailscale-cli/serve — background Serve
  persists across reboot/down-up, not the YouCoded backend. Targeted removal must
  use the owned route's flags; never reset all Serve configuration.
- https://tailscale.com/docs/concepts/macos-variants — the macOS sandbox restriction
  is file/directory serving, not port proxying. Pre-login availability differs by variant.
- https://tailscale.com/docs/install/android and
  https://tailscale.com/docs/features/client/android-app-split-tunneling — Android
  needs VPN consent/sign-in; excluding YouCoded/browser breaks tailnet routing/DNS.

Researcher Fenn found no explicit WebSocket fidelity/longevity guarantee in the
reviewed official documentation. Isolated WSS tests remain necessary: upgrade/auth,
headers/query fidelity, streaming, idle periods, phone wake and reconnect.
`serve get-config/set-config` documentation concerns Tailscale Services, not a proven
ordinary-device configuration backup/restore contract. Record route ownership,
refuse conflicts and re-read before removing an unchanged owned route.

## Source review — app baseline de69d60a

Read-only specialist Nova identified these launch/security blockers; no runtime
reproduction is implied. Paths are relative to `youcoded/desktop/src/` unless noted.

- `main/remote-config.ts:12–25` separates remote config by profile, but
  `main/remote-server.ts:167–175,261–274` uses shared `~/.claude/.remote-tokens.json`.
  Pairing/password updates can modify another profile's token store. Isolate before launch.
- `main/remote-server.ts:352–367,1903–1909` shares temporary upload storage/cleanup.
  Scope cleanup to the instance, even while uploads remain a later milestone.
- `main/main.ts:243–262,1620–1644,1701–1711` contains shared plugin/hook/MCP startup
  mutations outside the own-install-hooks profile guard. A shifted port/userData alone
  is insufficient isolation. Use fake-backend Workbench for UI; isolate all shared
  state/startup side effects before real process verification.
- `main/remote-server.ts:312–389` listens on HTTP without a loopback bind restriction.
  Keep app pairing mandatory; remove IP-range password bypass from secure remote access.
- `renderer/components/SettingsPanel.tsx:1825–1833` loses QR scheme/path and defaults
  omitted port to 9900; `renderer/remote-shim.ts:761–780` forces `ws:` for paired hosts.
  Preserve a validated canonical HTTPS endpoint, with explicit migration and no downgrade.
- Android `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:97–109,1784–1806`
  stores the host/port/password schema and falls back from encrypted preferences to
  ordinary private preferences. Secure pairing must not silently downgrade storage.

Existing tests to extend: `remote-config.test.ts`, `remote-server.test.ts`,
`remote-shim-send-queue.test.ts`, `remote-shim-voice-gate.test.ts`,
`remote-shim-reject.test.ts`, `remote-shim-unsupported.test.ts`, `ipc-channels.test.ts`.
Add behavioral tests for profile isolation, HTTPS endpoint round-trip, durable revocation,
unsent versus unknown-outcome recovery and browser exhaustion without Android fallback.

## Local tooling, observed

- `tailscale version`: 1.98.9. CLI help exposes Serve/status, HTTPS selection and background mode.
  Only version/help were run; no daemon configuration inspected or changed.
- SDK paths: platform android-35, build-tools 34.0.0 and 35.0.0, cmdline-tools/latest;
  JDK directories java-21-openjdk and java-26-openjdk. Build readiness is not yet proven.
- Chrome is available at `/usr/bin/google-chrome-stable`; questions deck preview passed.
- Dependencies were provisioned as a hardlink copy for the isolated app checkout.
  Fake-backend Workbench runs on localhost:5537; a one-shot probe returned title
  YouCoded with no console errors. This is not an Electron or transport test.
- Recovery-strip presentation tests: initial stub produced three assertion failures;
  implementation then passed four tests, with a fifth reconnect-label test added and
  passing. This tests display/callback semantics only; actual recovery is not implemented.
  `bash scripts/verify.sh <app-worktree>` passed types, related tests plus source guards,
  knip, lint and ast-grep after the live setup candidate was added. Test types still
  report 57 excluded files; Android/Worker are not covered. Boot check passed all
  16 Workbench routes on port 5537. None of these prove backend transport/security.

## Verified against current code — 2026-09-09, app HEAD de69d60a

The three launch blockers below were re-read line by line in this worktree, not carried
over from the earlier review. Each is present today. No fix is applied: the UI contract and
technical design gates come first.

- **Profile isolation is half-done.** `main/remote-config.ts:21-25` gives every
  `YOUCODED_PROFILE` its own config file, precisely so a dev instance cannot clobber the
  built app. `main/remote-server.ts:174` then hardcodes `~/.claude/.remote-tokens.json`
  with no profile in the name, so pairing tokens are still shared. A dev instance that
  pairs or unpairs writes the built app's token store.
- **The server listens on every interface.** `main/remote-server.ts:389` calls
  `server.listen(this.config.port, cb)` with no host argument, so Node binds all
  addresses. The plain-HTTP server is reachable from any network the machine is on, not
  only the tailnet.
- **A source IP can replace the password.** `main/remote-server.ts:757` — when
  `trustTailscale` is on and the peer address is inside 100.64.0.0/10, the server mints a
  token, calls `markPaired()` and returns `auth:ok` with no password exchanged.

**These last two compound, and the earlier review did not say so.** 100.64.0.0/10 is the
carrier-grade NAT range, not a range Tailscale owns; because the listener is not bound to
loopback, any host that can reach the port *from* such an address is auto-paired. Fixing
the bind alone, or the bypass alone, leaves the hole open.

## Approved UI direction

Submitted answers at
`docs/archive/design/2026-09-09-remote-access/remote-access.questions.answers.json`:
Q-1 guided setup; Q-2 keep offline messages as drafts for explicit Send; Q-3 independent
phone selection preserved on reconnect. Next gate is real-renderer Before/After mockups,
fresh UX test and signed UI contract. These answers authorize design, not live setup.
