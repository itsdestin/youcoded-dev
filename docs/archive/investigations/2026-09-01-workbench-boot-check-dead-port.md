---
date: 2026-09-01
status: shipped
type: investigation
topic: workbench-boot-check.mjs reports every route "ok" when nothing is serving the port
---

# `workbench-boot-check.mjs` cannot tell "mounted" from "server absent"

**Symptom (verified 2026-08-27).** With no listener on 5233 (`ss -ltnp` confirmed), and again against
a deliberately dead port (`node scripts/workbench-boot-check.mjs 5999`), the script printed `ok` for
all 12 routes and exited 0. CLAUDE.md makes running it after any mock-shim change non-optional, and
its own premise is that the unit suite passed while the app crashed at boot three times — so a green
run that cannot distinguish the two restores exactly that blind spot.

**Mechanism (read from `scripts/workbench-boot-check.mjs`, unchanged on 2026-09-01).** `checkRoute`
sends `Page.navigate` without inspecting its result, sleeps 6 s, then probes the DOM for three things:
the error boundary's "failed to start" text, the `#boot` spinner, and any `Runtime.exceptionThrown`.
A refused connection produces Chrome's own error page — no boundary text, no `#boot` element, no
page-level exception — so all three probes read clean and the route is scored `ok`:
<!-- claim: {"path": "scripts/workbench-boot-check.mjs", "contains": "const bad = r\\.failedToStart \\|\\| r\\.stillBooting \\|\\| r\\.errors\\.length > 0;"} -->

**Fix shape.** Before scoring a route `ok`, assert the navigation actually resolved (the
`Page.navigate` frame result / `errorText`, or a non-4xx/5xx response) AND that a known root element
of the app exists in the DOM; fail loudly when the port refuses a connection. The rig also cannot see
anything reachable only by clicking into a panel (its header says it exercises MOUNT only) — see the
Backup & Sync workbench crash report for that class.

**FIXED 2026-09-02.** All three assertions from the fix shape landed, each proven to fire on its
own: a preflight HTTP request (dead port -> exit 2, "nothing is serving the workbench on port N",
before Chrome is even launched); the `Page.navigate` errorText plus the main document's HTTP status
(a server answering 500 -> "server answered HTTP 500 for the page"); and `#root`, which
`index.html` ships inline (a server that is up but is not the workbench -> "#root is not in the DOM").
Verified green against a real workbench: 16/16 routes, exit 0. Guarded by
`scripts/workbench-boot-check.test.mjs`, which needs no Chrome, and run by Workspace CI.

**History.** Filed 2026-08-27 (hit while building the download-resume UI); re-verified 2026-09-01;
fixed 2026-09-02.
