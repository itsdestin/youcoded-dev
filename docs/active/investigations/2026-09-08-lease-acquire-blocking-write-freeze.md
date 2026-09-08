---
date: 2026-09-08
status: active
type: investigation
topic: The whole app froze solid for 6+ minutes right after a lease acquire; a synchronous file write on the main process is the leading suspect
---

# App-wide freeze right after `[lease] acquire`

**Symptom.** On Destin's Z13 laptop, YouCoded (pid 300765) went completely unresponsive.
Its internal 15-20s heartbeat log (`[lease] renew ...`), which had ticked steadily for
hours, stopped dead at 01:12:20 — the same moment it logged a fresh `[lease] acquire
3cce892c: ok=true holder=7570a46c`. From that point, total silence across every
subsystem's logging (not just lease), no CPU spin (all youcoded processes stayed in
`S`/sleeping state, load average normal), no GPU-reset kernel messages, no crash, and
nothing written to the app's data directory at all for 6+ minutes. Destin force-quit and
reopened the app at 01:23:50; the new instance came up and ran normally.

Ruled out first: this is NOT the machine's known Strix Halo SMU power-wedge (a recurring
hardware issue on this laptop where a failed suspend pins every CPU core to ~607MHz until
reboot) — cores were boosting to 4.5-5.1GHz throughout, no
suspend/resume happened this boot, and none of that bug's kernel-log markers
(`deepest state`, `failed to resume async`, `amd_pmc`) were present. It is also not the
2026-08-25 `ksecretd`/`kwalletd6` CPU-spin bug — both daemons were idle and answered a
direct D-Bus ping instantly while the app was still frozen, which also argues against a
credential/keyring hang being the ongoing cause (a resolved dependency should have let
the app's event loop resume, and it never did).

**Mechanism (leading hypothesis, not yet proven live).** `hubLeaseRequest()` in
`youcoded/desktop/src/main/sync-spaces/service.ts` logs the exact `[lease] acquire ...`
line inside the `.then()` of the hub socket request:
<!-- claim: {"path": "youcoded/desktop/src/main/sync-spaces/service.ts", "contains": "console\\.log\\(`\\[lease\\] \\$\\{op\\}"} -->

Control then returns to `acquire()` in
`youcoded/desktop/src/main/conversations/lease-client.ts` (~line 304), which immediately
calls `writeLeaseFile()` — a local-disk backup of the lease, described in its own
comment as "best-effort... a nicety, not a correctness guarantee":
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/lease-client.ts", "contains": "fs\\.mkdirSync\\(path\\.dirname\\(file\\)"} -->
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/lease-client.ts", "contains": "fs\\.writeFileSync\\(file, JSON\\.stringify\\(body\\)\\)"} -->

`fs.mkdirSync`/`fs.writeFileSync` are true blocking syscalls on Node's single thread —
unlike everything else in this module, which is deliberately structured to "never
block" (see the surrounding `[[env-...]]` never-throw/never-block comments). If the
underlying disk stalls for any reason at that instant, this one write freezes every
timer and every log line in the entire process, which matches "total silence,
everywhere, starting right after this exact log line" precisely.

**Other candidates considered and their standing:**
- **The app's own log sink stalling** (console.log/console.error blocking on a full
  disk or a stuck consumer) would produce the identical "everything goes silent at
  once" signature and wouldn't require any YouCoded bug at all. Not confirmed or
  refuted — couldn't be checked after the fact.
- **`safeStorage` credential calls with no timeout** (`github-client.ts:181`,
  `providers/secrets-store.ts:115/126`) going through the OS keyring over D-Bus —
  checked live and ruled out as the *ongoing* cause (see above), though it remains a
  real, separate risk worth fixing on its own terms.
- Busy-loop, infinite retry, or heavy synchronous computation (e.g. huge JSON
  parsing) are ruled out — the process never burned CPU, it sat idle/sleeping the
  whole time.

**Same bug class elsewhere (lower confidence, not implicated tonight, worth a sweep):**
synchronous fs calls on hot/frequent main-process paths that share the same
disk-stall dependency:
- `youcoded/desktop/src/main/conversations/transcript-mirror.ts` —
  `copyFileSync`/`renameSync` on every transcript growth.
- `youcoded/desktop/src/main/sync-spaces/git-transport.ts` — recursive
  `readdirSync`/`statSync` every 120s to size the repo.
- `youcoded/desktop/src/main/conversations/conversation-store.ts`,
  `project-registry.ts`, `device-registry.ts` — smaller, less frequent
  synchronous JSON read/write/rename calls.

**Why this couldn't be fully proven.** Confirming it live would need attaching a
debugger or otherwise interrupting the frozen process, which is exactly what the
live-app-safety rule prohibits doing to Destin's running app (the same rule exists
because a "harmless" DevTools read crashed it once before, 2026-05-04). This
write-up is a strong, source-verified hypothesis from reading the code, not a captured
stack trace of the actual hang.

**Fix shape (not yet built).** Make `writeLeaseFile`/`deleteLeaseFile` genuinely
non-blocking (`fs.promises.writeFile`/`mkdir`, fire-and-forget, already wrapped in
try/catch so the error-swallowing behavior is unchanged) so a disk stall there can no
longer take down the whole app. If the sweep above turns up other hot-path synchronous
fs calls in the main process, the same async conversion applies to each.

**History.** First observed and diagnosed 2026-09-08. No prior report ties a freeze to
this specific write; it's a new finding, not a known recurring issue.
