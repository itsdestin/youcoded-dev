---
status: shipped
---

# Native harness D2 — DNS wait cancellation/deadline (2026-09-28)

Scope: D2 only in the preserved worktree. No commits/push, installed-app contact, real network/provider calls, new dependencies, new permissions/retries/restrictions or timeout changes. Existing A/B/C/D1 changes remain uncommitted; denied C2/Q10 untouched.

## Change

`youcoded/desktop/src/main/harness/tools/net-guard.ts`: `assertPublicHttpUrl(raw, lookup, signal?)` accepts an **optional third argument**; existing two-argument callers retain their behavior. The DNS wait races a per-hop abort listener against the lookup, removes the listener on settlement, consumes late resolution/rejection, and distinguishes genuine DNS errors (`NetGuardError`) from abort/deadline reasons (`AbortError`/`TimeoutError`). `guardedFetch` passes the same originally composed caller signal + one total deadline to every redirect hop and checks it immediately before HTTP dispatch. Literal and DNS-based private-address checks and all existing credential/redirect policy remain. This settles *our wait*; it does **not** cancel OS DNS resolution.

`youcoded/desktop/tests/net-guard.test.ts` covers never-settling DNS with Stop/deadline, already-aborted signal, late successful/failed DNS, listener cleanup, redirect DNS sharing the deadline, real DNS failure, and a private redirect answer. `web-fetch-tool.test.ts` pins Stop during a pending lookup through the tool wrapper. Only the superseded DNS observation was removed from `native-boundaries-audit-probe.test.ts`; its changed-file-read observation remains.

## Red / green

- RED before production change: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/net-guard.test.ts -t 'caller abort settles pending DNS'` — **2 failed, 41 skipped**, exit 1; caller abort did not settle until lookup released (`/tmp/d2-red.log`). Tests release the gate in `finally` to avoid an abandoned handle.
- GREEN final: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/net-guard.test.ts tests/web-fetch-tool.test.ts` — **117 passed, 2 files**, exit 0 (`/tmp/d2-owning-final.log`). The interim run `/tmp/d2-green-first.log` failed two controlled-deadline tests because Node's native `AbortSignal.timeout()` did not follow Vitest fake timers; using an injected controlled `AbortSignal.timeout` return signal fixed the test clock without changing production timing.
- Import search of `desktop/src` found `web-fetch.ts` and `pages/page-fetch.ts` as `net-guard.ts` consumers; web search uses its own backend. `node node_modules/vitest/vitest.mjs run tests/net-guard.test.ts tests/web-fetch-tool.test.ts tests/page-fetch.test.ts tests/web-search-tool.test.ts tests/search-backends.test.ts tests/search-service.test.ts tests/pages-connections-service.test.ts` — **188 passed, 7 files**, exit 0 (`/tmp/d2-all-named.log`, before the last WebFetch Stop test, whose final owning suite is above).
- Scoped import-graph verification: `npx vitest related --run src/main/harness/tools/net-guard.ts tests/net-guard.test.ts tests/web-fetch-tool.test.ts tests/page-fetch.test.ts` — **1355 passed, 40 files**, exit 0 (`/tmp/d2-scoped-related.log`). This traversed much more than expected because the shared harness imports WebFetch; it was run **once**, not repeated as a default full-suite loop. `npm run typecheck` — both tsgo projects completed, exit 0 (`/tmp/d2-type-ultimate.log`). `npm run lint -- src/main/harness/tools/net-guard.ts tests/net-guard.test.ts tests/web-fetch-tool.test.ts tests/native-boundaries-audit-probe.test.ts` — 0 errors/warnings, exit 0 (`/tmp/d2-lint-final.log`). `node node_modules/vitest/vitest.mjs run tests/line-budgets.test.ts tests/main-blocking-calls.test.ts` — **42 passed**, exit 0 (`/tmp/d2-guards.log`). `git -C youcoded diff --check` exited 0. No full workspace `verify.sh --full` run was requested or performed.

## Limit

Aborting the DNS *wait* does not prove the operating-system resolver canceled its lookup. A resolved or rejected lookup after abort is ignored and consumed, not dispatched as HTTP. As before, DNS rebinding between validation and hostname fetch is not eliminated by this task.
