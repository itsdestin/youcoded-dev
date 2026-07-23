---
status: active
opened: 2026-07-23
subsystem: buddy overlay (Linux Wayland), PR itsdestin/youcoded#214
verdict: ARCHITECTURE BLOCKED — click-through primitive does not exist on native Wayland
---

# Buddy overlay Wayland presentation — open investigation

## FINAL VERDICT (2026-07-23, second session — supersedes the open questions below)

**`setIgnoreMouseEvents` is a TOTAL no-op on native Wayland** (Electron 41.10.3, KWin,
probe-verified twice with Destin's live clicks): with `(true, {forward:true})` AND with plain
`(true)`, the "ignored" fullscreen window received the complete pointer stream — pointerdown/
up/click at every screen coordinate — and nothing reached the desktop beneath. This is the
plan's Open Question 1 STOP condition. The workbench's I2 "PASS — counter kept climbing" was a
misread: the renderer received moves because the window was receiving ALL input natively, not
because forward-while-ignored worked. Task 3 Step 0 (the 20-second click-through eyeball gated
exactly on this) was deferred by the controller at execution start and never run — the entire
evening's click-eating incidents were this missing primitive.

Secondary: the EvictionThrottlesDraw switch (da1f0238) was derived from an XWayland-backend
probe and actively FREEZES native-Wayland transparent surfaces — reverted in f05a70cf. The
persist-before-init poisoning (5ea5789e) explains the recurring behind-the-panel spawn.
Whether the real app page PRESENTS on native Wayland remains unconfirmed (trivial pages do)
— moot until an input mechanism exists.

**Fallback option space (Destin's decision):**
- **(A) XWayland for the app** (`--ozone-platform=x11`): FINDINGS Round 3 — setPosition,
  always-on-top, transparency, and X11 input shapes all work; the EXISTING three-window
  floater would work unchanged, no overlay needed. Blocker: Round-4 ANGLE null-deref GPU
  crash in the full app; untested workaround list (--use-angle=gl, --disable-gpu-sandbox,
  --in-process-gpu). Worktree `worktrees/xwayland-floater` already exists.
- **(B) Merge PR #214 with Wayland defaulting to 'windows'** (flip chooseBuddyStrategy):
  preserves the BuddyManager seam + all 5 real fixes, zero behavior change anywhere, buddy
  stays absent on Wayland exactly as on master today (no regression). Overlay code stays
  dormant behind the env override for future work.
- (C) KWin-scripted input regions: not scriptable. Dead.
- (D) Small movable interactive window: Wayland forbids positioning. Dead.
- (E) Upstream ext-zones/layer-shell: years out.

Recommendation: **B now** (salvage the merge), **A as the follow-up investigation** (it is the
only path to an actually-working Wayland floater and reuses the shipped three-window code).

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

## SEVERITY UPGRADE (2026-07-23, late): invisible mascot = roaming phantom click-eater

The presentation bug is NOT cosmetic. `setIgnoreMouseEvents(true, {forward:true})` still
delivers pointer moves to the renderer (that is the designed hover mechanism, FINDINGS I2).
With the mascot INVISIBLE but its DOM box live at bottom-right — overlapping the panel/clock
corner — any cursor visit to that corner fires pointerenter → `overlaySetInteractive(true)` →
the screen-sized overlay starts eating every click until the cursor happens to exit the
invisible 112px box (+60ms). Destin had to kill the dev app to use his desktop. **Do not run
the overlay strategy on this machine again until presentation is confirmed fixed** — for
unrelated dev work on this branch, launch with `YOUCODED_BUDDY_STRATEGY=windows`. Candidate
hardening regardless of the fix: the renderer should refuse to request interactivity until it
has evidence it is actually visible (e.g. gate the very FIRST setInteractive(true) on a
successful IntersectionObserver/paint heuristic — needs design; or main-side: cap any
interactive period not followed by a real click at N seconds).

## Instrument notes (hard-won tonight — do not relearn)

- **pgrep/grep self-matching:** every diagnostic shell whose command line contains the search
  pattern (e.g. `pgrep -f "…electron/dist"`) matches ITSELF and its wrapper zsh — this session
  chased phantom "respawning electrons" twice that were its own probes. Verify by ancestry
  (`/proc/PID/stat` ppid chain) before believing a match; a real electron's ancestor chain ends
  in run-dev, not in `claude`.

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
