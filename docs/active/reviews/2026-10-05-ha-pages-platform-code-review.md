# Code review: HA pages platform slice (branch session/ha-pages-connection)

Scope: `youcoded/desktop/src/{main,shared,renderer}` (not `renderer/dev/workbench`), `youcoded/app/**`, and their tests. No contract file exists; correctness only.

## verify.sh summary
`bash scripts/verify.sh youcoded`: types PASS, types in tests PASS, knip PASS, oxlint PASS, design lint PASS, ast-grep PASS, shoot --check PASS, journeys PASS. Related tests: 5047 passed, 1 failed: `tests/files-tab-list-view.test.tsx` "says why a huge folder stopped..." timed out at 30 s under load (the machine was busy). Rerun of that file alone: 20/20 pass. File is untouched by this branch. Verdict: load flake, nothing to fix here. Also noted by the script: master has 8 newer commits touching files this branch changed (merge before shipping).

Android: the only app change is seven `pages:*` names added to the not-implemented list in `SessionService.kt`; not built here (Android SDK not exercised).

## Findings (most severe first)

- F1 (medium) — `desktop/src/main/pages/page-live-video.ts:136` — A video start has no "10 seconds to open" timer. `defaultConnect` deliberately has no `handshakeTimeout` (page-live-socket.ts:79 says the module's own open timer owns that), and the live socket arms one (page-live-socket.ts:255) but the video path never does: its only timers are the lease, the 5-minute max, and `ready` (armed only AFTER `open`). A device that accepts the TCP connection but never finishes the upgrade (or a black-holed LAN address) leaves the video "starting" for up to 5 minutes (until the max timer; the page keeps pinging), holding one of the page's 4 / app's 6 video slots. The host's no-picture timer (page-video-host.ts:~377) only starts after `videoStart` resolves and `start()` resolves `{ok:true}` immediately, so it ends the card after ~18 s on the host side and calls `videoStop`, which frees main. So the practical effect is bounded for a live host; on a host that stops pinging or a remote client that drops, it relies on the lease. Confirmed by reading both files; not run. PLAUSIBLE as a user-visible bug, confirmed as a missing guard in main.

- F2 (medium) — `desktop/src/renderer/components/pages/page-socket-host.ts:107-120` and `:83` — The socket hub drops any main event whose id it has no mapping for yet, and ignores the result of `socketPing`. The video hub next to it handles both (an `early` buffer for "main can push before the start's own reply reaches us", and it reads the ping answer, page-video-host.ts:~150 and ~330) so the authors know the push can beat the reply. For sockets: if main ends a socket right after `open()` returns (first-attempt ECONNREFUSED, 1009, flood, auth refused, all on a LAN in ~1 ms) the `closed` push can arrive before `byMain.set`, is dropped, and the page's handle stays `connecting`/`open` for good: the later pings get `{ok:false}` (main already deleted it) and are swallowed. Confirmed by reading; ordering of an Electron invoke reply vs `webContents.send` was not measured. PLAUSIBLE. Fix shape: copy the video hub's two mechanisms.

- F3 (low-medium, security hardening) — `desktop/src/main/pages/page-fetch.ts:256-266` — `as:'picture'` trusts the Content-Type header only; `as:'video'` additionally checks the `ftyp` magic bytes. Base64 carries bytes past the text redaction, so a device endpoint that reflects request data under `image/png` would let a page read its own key back; the video path closes that, the picture path does not. Requires a device endpoint that echoes; hence low. Confirmed by reading; no test pins a non-image body served as image/png.

- F4 (low, PLAUSIBLE) — `desktop/src/main/pages/pages-service.ts:~440` (`videoAccess`) with `page-socket.ts:144` — The video access check finds the connection named by id, but then calls `checkDeviceSocketAccess`, which picks the FIRST connection that `covers` the address, not the named one. A page with two device lines at the same address (different service/profile) can get the first one's hello, key, deny list and video profile when it named the second. Both were approved at that address, so no new reach, but the id the page supplied is not what is used. Confirmed by reading.

- F5 (low) — `desktop/src/main/harness/tools/net-guard.ts` (`assertHomeHttpUrl`) / `shared/page-device-address.ts:isHomeIpv4` — `100.64.0.0/10` is accepted wholesale as "home", and that range holds `100.100.100.200` (Alibaba cloud metadata), which `neverDialV4` in the same diff already treats as never-dial for video. A device address of `100.100.100.200` is therefore allowed on approval. The person must type or accept it, so low. Also `assertHomeHttpUrl` resolves the name once and `ws`/`fetch` resolve again (DNS rebind window; the branch documents this as the accepted limit).

- F6 (low) — `desktop/src/main/pages/page-live-video.ts:149-170` — If the device never sends the `ready` reply type, the video waits `readyWaitMs` (10 s), fine; but a device that sends it twice is ignored. No bug. What IS missing: no per-owner cap for videos (sockets have 4 per window/client; videos only 4 per page / 6 per app), so one window can take all 6 app slots. Design choice; noting because the spec-table "per owner" rule was applied to sockets only.

- F7 (low) — `desktop/src/main/pages/page-video-sdp.ts:12` (`usableAddress`) — the candidate filter blocks loopback/link-local/multicast/metadata only, so the device (or whatever is between) can still make the app dial any other IP, including public ones and other LAN hosts, with media. The header comment promises only the never-dial list, so this matches intent; flagged because a public address means video traffic to the internet from a "home only" connection. Confirmed by reading `isNeverDialIp`.

## Checked and found sound
- Owner model: ids are generated in main; `owned()` requires owner key + page + frame to match; one answer for "no such" and "not yours". Window owner is `event.sender`, remote owner is `client:<id>`. Remote drop, server shutdown, window destroy / main-frame navigation / renderer crash all call `closeOwner`, which stops sockets AND videos.
- Message validation: outgoing text is parsed, deny floor applied, and the RE-SERIALISED text is what is sent; key only enters via the approved hello; every received message is redacted (twice for video after parse); binary frames dropped/counted; flood ring buffer is constant cost per message; every timer is cleared in `finish`/`stopWire`; generation counter makes stale callbacks inert.
- Approval changes (approve, remove connection, delete saved key, page edit/removal) close sockets and videos via one function; page's own `data.json` saves do not (signature uses html mtime + manifest only).
- Remote cannot paste a key, and `addresses` are re-checked in main with the same rule as the card.
- Main-process blocking: no sync I/O added; parse work is bounded (1 MB socket frame, 4 KB parse window, 256 KB video reply).
- Parity: channels present in preload (inlined strings pinned by ipc-channels.test), pages-ipc, pages-remote, remote shim + `pages:socket-event` push, Android not-implemented list. Remote shim reports `closed`/`video-stopped` locally when its own connection drops.
- See-through flag: one source (`paneIsGlass`: wallpaper AND not `data-pages-solid` AND chrome-style floating/float); the document is built with the value at that moment, then `watchThemeCss` pushes `{css, seeThrough}` on any html/body attribute change, `usePaneGlass` follows the same attributes only while the view is open; Office reads the same attribute; the LookSettings toggle's "framed" test matches the chrome styles the CSS uses. `persistAppearance` is key-agnostic, so the new `pagesSeeThrough` key persists and restores on both paths in theme-context.

## Not covered
- Did not run the live socket / video against a real Home Assistant or Nest camera, and did not measure Electron's invoke-reply vs push ordering (F2).
- Not read in depth: `home-page-*` tests and `renderer/dev/workbench/**` (other reviewer's slice), `use-pages.ts`, `PageApproval` second step layout, narrow-viewport behaviour of the new Appearance row, render-cost of PageHost (no lists added), `tests/` bodies for page-live-socket / page-live-video (only skimmed names).
- Android: SessionService change read only; no Gradle run.
- Time: stopped at about 45 minutes of the 60.

## Disagreement with design (one line)
Keeping an unencrypted ws:// connection that carries the key to a home device is as approved by the card text; no change asked.

## Triage (implementing session, 2026-10-05)

- F1 accepted — video start gets the 10 s open timer — fixed in b68f78cf9
- F2 accepted — socket hub buffers early events and reads ping refusals, like the video hub — fixed in b68f78cf9
- F3 accepted — as:picture checks image magic bytes too — fixed in b68f78cf9
- F4 accepted — video access uses the named connection — fixed in b68f78cf9
- F5 accepted — 100.100.100.200 refused as a device address — fixed in b68f78cf9
- F6 rejected — 4 per page / 6 per app was set deliberately in the spec (Cameras tab); a per-owner video cap adds nothing a single owner can abuse beyond the app cap
- F7 rejected — Nest WebRTC media legitimately comes from Google's public relays; restricting candidates to home addresses would break the cameras. The never-dial list is the intended boundary
