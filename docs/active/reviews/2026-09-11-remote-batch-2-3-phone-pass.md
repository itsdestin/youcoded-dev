---
status: active
branch: session/remote-first-connect
---

# Remote access batches 2/3 — phone pass (Destin, 2026-09-11)

Run against the dev window (offset 50, `http://100.111.147.124:9950`) on the merged branch,
before the code reviewer and UX tester run 2 (batch 1's lesson). One line per finding;
status is `fixed <commit>`, `open`, or `filed <roadmap entry>`.

## Fixed during the pass

- Rapid messages and replies interleaved in different orders on phone vs desktop. Sender
  confirmed pending bubbles in place; now pending bubbles stay the timeline tail and a
  confirm moves the bubble to its recorded place. Predates the branch. — fixed `cc154f17`
- Phone kept an old theme until reloaded (dev on Meadow Mist, phone on Golden Sunbreak).
  `appearance.onSync`/`broadcast` were no-ops over remote. Predates the branch. — fixed `3185b6a0`

## Filed

- Native sessions unusable from a phone; provider/local-model/search-key pages hidden;
  picker offers native models that clear on tap. `native.supported` is a July placeholder on
  the remote shim. Destin: "remote access should be identical to the desktop" — next batch.
  — filed `docs/roadmap/remote-access.md`
- Android Settings Remove does not unpair while connected; remote "No folder" session skips
  the No-folder swap (both found by the batch 3 builder). — filed `docs/roadmap/remote-access.md`

## Open — file pills in the session drawer (found 2026-09-11)

Evidence from a read-only probe of `projectAllFiles('/home/destin/youcoded-dev')` on the host:
3,090 records, `truncated: true`, ~1.0 MB of JSON.

1. **Wrong file for a same-named path.** `/home/destin/youcoded-dev/wecoded-themes/CLAUDE.md`
   matches the workspace root `CLAUDE.md` through `findBestMatch`'s suffix fallback
   (`norm.endsWith('/' + p)`), because `wecoded-themes/` is a nested git repo the search
   skips. Both platforms. Destin saw it "not open" on the phone.
2. **A file the search skipped cannot open on a phone.** After (1) is fixed the lookup falls to
   artifactify, which calls `artifacts:append-version` — a write, not bridged over remote — so
   the phone gets the "wasn't found in this project" note for a file that exists.
3. **Slow.** Resolving one tapped path downloads the whole project file list (~1 MB here) to
   the phone before anything shows. Destin: "it eventually popped in. just took forever".
4. **No loading state.** While the lookup runs the drawer shows "Nothing here yet", which
   contradicts the file just tapped.
5. Destin reported the opened file "disappeared again after my phone sleep/wake". The dev log
   shows a Vite page reload at 04:52 caused by a diagnostic edit (HMR reaches the phone through
   the remote proxy), and no code closes the drawer on reconnect. Not reproduced since —
   recheck once without edits in flight.
