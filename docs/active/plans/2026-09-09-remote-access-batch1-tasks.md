---
status: draft
---

# Remote access batch 1 — task breakdown

From `docs/active/specs/2026-09-09-remote-access-batch1-technical-design.md` revision 4,
after three review rounds (45 findings, all accepted).

**Built: T1–T11, all eleven, on `session/remote-mesh-roadmap`** (2026-09-10). Both opening
gates closed first: the contract was signed 2026-09-09, and `remote-access-questions-3`
answered Q-6 Tailscale-only and Q-7 offline devices stay listed. Q-6 going that way is what
kept tasks 6–9 in the batch.

What remains is not building: a fresh code reviewer, a context-free UX tester, a fresh
grader, then the acceptance deck. Nothing is merged.

One thing the tests cannot cover: **no real phone has connected to a real computer through
the app.** The transport was proven with a throwaway echo server on one machine. That needs
a second device.

Each task: one reviewer, one branchable unit, its own tests. Desktop tasks end with
`bash scripts/verify.sh <worktree>`; Android tasks need their own build check.

## Independent of Q-6 — can start once the contract is signed

**T1 · Store seams and profile scoping** (§2)
One helper builds the config and device-store paths and takes the profile as an argument
instead of reading `process.env` at module load; the server accepts a store path.
*Tests:* two profiles in one process do not share a store; no test writes `os.homedir()`.
*Blocks:* T2, and every test in T2–T5.

**T2 · Device records replace tokens** (§1)
The record shape, SHA-256 secrets, reuse on re-auth, `revokedAt`, the new auth message, the
two id spaces kept apart. Retire the old token file rather than migrating it.
*Tests:* pair → unpair → restart → refused; unpair A leaves B valid across a restart; a
retired credential is refused with the terminal close code T8 needs.
*Depends:* T1.

**T3 · Remove the password bypass** (§4)
`trustTailscale` and its whole surface, across main, preload, shim, renderer, workbench mock,
Kotlin, and the tests that assert it.
*Tests:* a 100.64/10 peer must authenticate; a saved `trustTailscale: true` grants nothing;
`knip` reports `isTailscaleIp` gone; a source guard fails if the identifier survives.
*Independent of everything else.*

**T4 · Host administration leaves the remote socket** (§0)
`remote:set-password`, `remote:set-config`, `remote:disconnect-client` refused remotely with
`{ ok: false, code, message }`; the shim rejects rather than resolving; the panel disables
those controls on a remote client with one line of explanation.
*Tests:* each channel refused over the remote transport; the shim rejects; the renderer shows
disabled controls, not failing ones.
*Depends:* T2 for the device identity in log lines. *Note:* removes `remote:disconnect-client`
outright, so it must land with T5's device list, not before it.

**T5 · Device list, rename and unpair** (§1, Cross-platform)
`remote:devices:list|rename|unpair` with payloads, `preload.ts`, `remote-shim.ts` listener,
`SessionService.kt` cases, and the renderer rows (contract R7, R8).
*Tests:* IPC parity for the three channels; a Kotlin case exists for each; the confirmation
reads Unpair and says the device must pair again.
*Depends:* T2, T4.

**T6 · Rate limiting per socket and per host** (§0 decision)
Five auth attempts per socket then close; a host-wide failure ceiling that slows new
connections instead of locking anyone out; post-auth limits key on device id.
*Tests:* six attempts on one socket closes it; a second socket is unaffected; the host ceiling
slows rather than locks; upgrade-day mass failure locks nobody out.
*Depends:* T2. *Note:* only becomes load-bearing with the loopback bind (T8), but is correct
on its own and should not wait.

**T7 · Listener status** (§5)
`remote:status` request and push, relay, preload, shim listener, Kotlin case; the indicator
reads it instead of `config.enabled`.
*Tests:* reported state follows a failed start; the indicator reads the reported state; IPC
parity. No duplicate EADDRINUSE test — `tests/remote-server.test.ts:410` already covers it.
*Independent.*

## Gated on Q-6 answering "Tailscale only"

**T8 · Loopback bind, endpoint and origin policy** (§3)
`listen(port, '127.0.0.1')`; the `http` test mock updated in the same change or every
`start()` test breaks; canonical HTTPS endpoint replacing `ws://host:port` in shim, QR and
Android; protocol negotiation with no downgrade; the Origin policy — tailnet origin and
`null` accepted, everything else refused.
*Tests:* bound host argument; foreign origin refused; `null` accepted; endpoint round-trip.
*Depends:* T4 and T6 must already be in, or the bind creates the hole round 1 found.
*Also gated on:* the transport feasibility checkpoint, which is not passed.

**T9 · Setup flow and consent** (§7)
Prerequisite states in the existing banner; the certificate-transparency consent box; the
end-of-setup check that reports `listening` or the reason and never claims the phone was
tested.
*Depends:* T7, T8. R6's consent step disappears with T8 if Q-6 goes the other way.

## Recovery — independent of Q-6, but the largest unit

**T10 · Message classification and drafts** (§6 decisions R3-3, R3-2)
The channel-kind table plus its build guard; `fire()` returns a boolean; the shim publishes
connection state; `InputBar` refuses and keeps the draft using the mechanism it already has;
`REHYDRATE_ON_RECONNECT` replaces the flush queue, with a test that every entry is a read.
*Tests:* a draft survives a drop and is not auto-sent; the rehydration set is re-issued;
an unclassified channel fails the guard.

**T11 · Outcome unknown, generations and liveness** (§6)
`<deviceId>:<generation>:<n>` ids; the host's 200-id, 10-minute ring; `remote:request-outcome`;
the unknown state on the affected card; ping/pong with a deadline; the generation guard;
terminal close codes including credential-retired; the local-bridge fallback keyed on
capability.
*Tests:* a sent request with no reply reads unknown; unknown after a host restart; a late
`auth:ok` from an old generation is ignored; a missed pong closes the socket; a revoked and a
retired client each stop retrying.
*Depends:* T2 (device ids), T10 (classification).

## Order

T1 → T2 → (T3, T7 in parallel) → T4 → T5 → T6 → T10 → T11, with T8 → T9 inserted after T6
if Q-6 says Tailscale only. T3 and T7 can be picked up by a second worker at any point.

## After the build

Fresh code reviewer and the context-free UX tester in parallel, triage, then a fresh grader
writes the verdicts and the acceptance deck goes to Destin. No merge without his word.
