---
status: active
opened: 2026-07-23
subsystem: buddy overlay (Linux Wayland), PR itsdestin/youcoded#214
---

# Buddy overlay Wayland presentation — open investigation

**State: PR #214 merge is ON HOLD.** Five real bugs were found and fixed during the first live
dev-loop session (all pushed to `feat/buddy-overlay`), but the mascot has still never been
eyeball-confirmed on screen, and two questions remain open.

## Fixed and pushed (2026-07-23)

| Commit | Bug | Proof |
|---|---|---|
| `b3c1627d` | KWin fires `display-metrics-changed` (changedMetrics=[]) 3× just from SHOWING a window → destroy/recreate self-loop at ~2Hz → full-screen black strobe → V8 fatal SIGTRAP. Rebuild now guarded on real geometry change. | standalone event probe |
| `53952865` | dev-only: renderer load recovery had a 5-retry budget a network flap could exhaust → permanent stuck spinner. Now unbounded, backoff capped 5s. | log forensics (5/5 retries during outage) |
| `c647911c` | `BUDDY_OVERLAY_INIT` push at did-finish-load raced React mount (dropped before subscribe) → overlay rendered null forever. Init is now a renderer PULL (`overlayReady`). | CDP: initialized=false, DOM empty pre-fix |
| `da1f0238` | (a) `EvictionThrottlesDraw` froze transparent surfaces on their first blank commit — content mounted after load never presented (A/B probe: 0 px → 201,601 px); switch disabled when overlay strategy active. (b) `document.title` clobbered the 'YouCoded Buddy' caption → Task 8's KWin keep-above matched nothing; now preventDefault'd. (c) Wayland minimize→restore wipes the empty input region → restored overlay ate every desktop click; region re-asserted on restore/show. | delayed-content probe; KWin caption probe; live incident |
| (env, no commit) | Main checkout `node_modules` held **Electron 41.0.3** (the known transparent-window smear version) against package.json `^41.10.3` — the worktree symlinks those deps, so the whole evening's first wave of smear/garbage was the already-fixed upstream bug. `npm ci` + install-scripts approvals (electron, node-pty, koffi, electron-winstaller). npm's allowScripts policy SILENTLY skips postinstalls — the electron binary was missing until `node_modules/electron$ node install.js`. | probe banner printed 41.0.3; red-square probe 0 px on 41.0.3 vs 201,601 px on 41.10.3 |

## OPEN QUESTION A — app overlay presents zero pixels; identical probes present

Facts (all verified on the target machine):
- App overlay renderer-side is perfect: DOM mounted at the right coords, mascot SVG rasterizes
  to 3,028 colored px via canvas, rAF ~165Hz, `visibilityState: 'visible'`, every ancestor
  opacity-1/visible, theme vars sane. KWin maps the window (1707×1067, caption fixed).
- Whole-screen pixel sweeps (spectacle) never found the mascot's color signature anywhere, even
  with KWin keepAbove applied to the exact captioned window.
- Standalone probes with the SAME url (`localhost:5223/?mode=buddy-overlay` + stub preload),
  SAME construction flags (buddyExtras verbatim), SAME GPU switch, detached DevTools attached,
  and a second opaque window present — ALL presented the mascot on screen.

**Late-discovered caveat that may dissolve the whole mystery: the probes ran XWayland**
(KWin `w.surface == null` for the probe window; `npx electron` defaults to the X11 ozone
backend). The app's backend was never ground-truthed — the socket/libwayland heuristics are
debunked (workbench FINDINGS 5b: "ozone log lines are the ground truth"). The workbench's
Round-3 table says transparency is 10/10 live under XWayland and was 0/10 under native Wayland
pre-bump; the 5d "fixed by Electron bump" eyeball may itself have been an XWayland run.

**Next steps (in order, ~15 min total):**
1. Ground-truth the app's ozone backend: relaunch dev with `--enable-logging` and grep for the
   ozone platform line. Same for a probe.
2. Re-run the delayed-content probe with explicit `--ozone-platform=wayland` on 41.10.3 (with
   and without the EvictionThrottlesDraw switch). If it fails → native-Wayland late-content
   transparency is broken on 41.10.3, full stop, and every "working probe" tonight was X11.
3. If (2) fails, same probe on electron 43.2.0 (`npx -y electron@43.2.0`, already cached) —
   the version the 5d eyeball actually blessed. If 43 works native-Wayland → bump the app.
4. If nothing presents native-Wayland on any version: consider (i) first-commit hack — paint a
   1px opaque pixel in index.html for overlay mode so the surface never commits empty;
   (ii) XWayland for the whole app — blocked by the Round-4 ANGLE null-deref crash, which has
   its own workaround list (--use-angle=gl, --disable-gpu-sandbox, --in-process-gpu).

## OPEN QUESTION B — something calls hide() on the overlay ~1 min after boot (unverified)

At 11:05 the 'YouCoded Buddy' window existed in KWin's list; by 11:14 it was gone while its
renderer stayed alive on CDP (= `win.hide()`, not destroy). Hypothesis: the MAIN window's
renderer applies the buddy-enabled preference (`localStorage['youcoded-buddy-enabled']` in the
**dev profile**, which may be false from earlier sessions' chaos) once it finishes booting, and
hides the buddy. This would also explain "visible early in KWin, gone by the time anyone
looks." The instance churned before the localStorage read could run.

**Next step:** boot dev, immediately CDP the MAIN window: read
`localStorage.getItem('youcoded-buddy-enabled')` and `buddy.getStatus()`. If false/dismissed —
Question B is working-as-designed, flip the pref (Settings → show buddy), and re-evaluate
Question A only after. **Do this check FIRST next session — it gates everything else.**

## Instrument notes (hard-won tonight — do not relearn)

- `Page.captureScreenshot` (CDP) on transparent pages returns all-alpha-0 regardless of actual
  paint. Useless for this bug class.
- spectacle: transparent REGIONS read alpha-0 (known), but OPAQUE CONTENT inside transparent
  windows captures fine (201k red px) — valid for content-presence checks.
- KWin scripting (`qdbus6 … loadScript/run/unloadScript` + `journalctl --user` for `print()`)
  is reliable read-only window inspection: caption, class, geometry, keepAbove, minimized,
  opacity. Load scripts from files, JSON-stringify anything matched by caption.
- The worktree's `node_modules` is a SYMLINK to the main checkout — pkill patterns matching the
  worktree path MISS the electron binary (it resolves to `youcoded/desktop/...`). Kill by
  resolved binary path AND verify `/proc/PID/cwd` — three sessions' dev instances coexisted
  tonight (buddy-overlay, git-surface:5273, m2-conversations-sync ×2) and cross-killing is easy.
- Two browser processes of the same app stack TWO overlay windows; a stale frozen one visually
  masks the healthy one. Verify exactly ONE instance before any eyeball test.
- After any `npm ci`: check `npm install-scripts ls` — silently skipped postinstalls leave
  native deps (electron binary!) missing while everything looks installed.

## Destin-visible symptoms this explains

- Black full-screen strobing + unusable desktop (flash loop, commit `b3c1627d`).
- Keystrokes landing in the wrong window (overlay focus — plan Open Question 3 — still
  unverified; a chat-open `focus:true` fix is drafted in conversation but NOT yet applied).
- Stuck spinner after network flaps (commit `53952865`).
- Windows smearing through the transparent surface / glitchy minimize (stale Electron 41.0.3).
- Desktop hostage: fullscreen click-eating overlay after a KWin minimize/restore poke
  (commit `da1f0238` part c).
