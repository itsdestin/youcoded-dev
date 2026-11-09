# Bounded lifecycle batch — actual CLI 2.1.302

Investigation only; no app implementation. Actual unmodified CLI against localhost scripted model/approval services, not SDK or subscription behavior.

## Commands and actual outcomes

From `/home/destin/youcoded-dev/worktrees/sessions/cc-reliability-options`:

`node docs/active/investigations/2026-10-18-claude-mods-tests/probe/lifecycle-probe.mjs --launch lifecycle-batch`

Exit 0. Final output: `{"exit":0,"preserved":true,"remaining":[]}`. Full command, allowlisted environment, wall timing, binary hash, preservation hashes and process cleanup are in `launch.json`; each case JSON records exact CLI args, policy, requests, timestamps, output, transcript snapshots and file effects. All CLI children were deliberately stopped at idle synthetic boundaries (exit 129); services closed.

`node docs/active/investigations/2026-10-18-claude-mods-tests/probe/lifecycle-check.mjs`

Exit 0. Output:

`PASS: isolation, preservation, cleanup; 30s ceiling deny; malformed deny + distinct restart recovery; bounded 36s polling allow; same-ID resume without duplicate users; absent/empty handshake controls. Worker unload remains unverified.`

`git diff --check` exited 0 with no output. `git -C youcoded status --short` exited 0 with no output. New fixture/driver/checker diffs were read back. No desktop source changes, installs, dependency modifications, rollout overrides, real credentials or paid calls.

## Result matrix

| Case | Result in this environment | Evidence |
|---|---|---|
| HTTP stall | Service withheld response for a scheduled 35 seconds. Actual fetch aborted at 30000 ms; response connection closed exactly 30000 ms after service receipt. Explicit catch denied; no `stall.txt`; model received error denial. Synthetic turn completed in 30291 ms. Scheduled late response was cancelled during cleanup, not allowed to run indefinitely. | `stall.json` |
| Missing decision + restart | Valid JSON `{synthetic:true, approved:true}` was rejected because it lacked explicit allow/deny. Catch denied; no `malformed.txt`. Server closed and rebound the same port. A distinct subsequent request reached generation 2 and created exact `SYNTHETIC lifecycle recovered\n` bytes. Exactly one service request per file; no old-request retry. | `recovery.json` |
| Bounded long polling | Three separate 12-second pending responses, then fourth explicit allow. Total hook wait 36013 ms; own budget still 9997/10000 ms. Exact `SYNTHETIC lifecycle poll\n` bytes created. Four attempts maximum in fixture. | `poll.json` |
| Stop/resume | First synthetic turn completed and transcript existed; exact owned idle CLI stopped. Same binary/profile/mod restarted with `--resume 2c6bdfb6-6bb3-41f2-8a42-86f6e03aa1df`. Fresh mod handshake, same session identity. Second prompt reached fake API with each prior/new user marker exactly once; saved transcript contained one before and one after prompt. No transcript/private-state rewriting; only public fixture service metadata changed to select the next prompt. | `resume.json`, both resume debug logs |
| Absent mod | No plugin launch arg; no startup handshake and no fake-model requests in bounded 6.5-second observation window. | `absent.json` |
| Empty mod | Debug log confirms worker loaded/admitted with `events: none`, but no startup handshake or fake-model requests in same bounded window. Loaded does not establish bridge readiness. | `empty.json`, `empty-first-debug.log` |

Every actual Write check had underlying `ask`, default mode and no Write allow rule. Allowed/denied tools were scoped to the named disposable project files. All runs shared disconnected bubblewrap network/PID isolation, readonly host, fresh HOME/config/XDG and writable only owned sandbox/evidence. Prior investigation file hashes remained unchanged during the run. Synthetic profiles remain under `/tmp/cc-lifecycle-rJvifR` for inspection; no owned namespace children remained at launcher cleanup.

## Limits

This proves a bounded 36-second external-wait mechanism, not indefinite/two-hour waiting. Restart recovery covers one malformed request followed by one distinct request, not arbitrary outages or multi-client races. Resume covers a short synthetic text exchange, not real model history, images, compaction or cross-engine parity. The empty/absent controls measure readiness absence only within their bounded window. Mid-flight worker removal/unload remains unverified: the previously tested documented reload queued behind the turn, and this batch did not manipulate private workers or invent an unsafe removal trigger. No hot-unload or crash-resilience guarantee is claimed.
