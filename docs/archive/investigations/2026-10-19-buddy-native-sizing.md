---
status: shipped
date: 2026-10-19
work_item: 85
branch: session/85-buddy-floater-regression
---

# Buddy chat growth and rapid reopening

## Finding

Destin reported that the official Linux 1.3.1 floater worked well, while Direct Controls .4 grew its chat window during repeated opening/closing and felt janky.

The packaged buddy manager, geometry and stylesheet were byte-identical between those two builds. The test launcher removed desktop-session variables; external X-window inspection identified that test process as XWayland. This exposed a native size-preservation problem rather than implicating the recent Windows pointer-handling repair. The exact official release binary was not separately reproduced under matching XWayland conditions.

In an isolated master-based dev run at 150% scaling, XWayland chat width increased from about 325.33 to 355.33 logical pixels over 20 open/close cycles. Height stayed 480 and the settled CSS transform stayed `none`. Native Wayland chat stayed 320×480.

## Corrections

- `BuddyWindowManager.place()` supplies the fixed role dimensions with the requested position through `setBounds`, rather than retaining rounded native dimensions through `setPosition`. The caption/KWin branch is unchanged.
- `toggleChat()` uses open intent rather than native visibility during the 140 ms exit fade. The pending hide timer is owned and cancelled on reopening/full teardown, preventing an old close from cutting short a later one.
- Three manager regressions were observed failing before their respective corrections and passing afterward: cumulative size drift, reopening during the fade, and a subsequent close receiving its own full fade.
- A full-suite Office print-relay assertion failed after a fixed microtask flush and passed alone in both this branch and a pristine master checkout. Only that test assertion was changed to await its actual RPC result; Office production code and timeouts are unchanged.

## Native runtime evidence

All measurements below used isolated test environments, not either of Destin's running apps.

| Environment | Exercised path | Observed result |
|---|---|---|
| Linux XWayland, DPR 1.5 | Real renderer and full mascot/chat/bar group, final source, 20 open/close cycles | Constant 321.33×480 chat; no cumulative growth. A 21.1 ms reopen produced close→open state and remained visible beyond the obsolete hide deadline. |
| Linux native Wayland, DPR 1.5 | Real renderer, chat-only path, 20 cycles | Constant 320×480, before and after the sizing correction. No live helper installation or modification. |
| Windows 11 Pro, build 26200; Electron 41.10.7 | Actual final manager and native frameless windows on Quickemu's interactive Session 1; 20 move/close/reopen cycles | Mascot 112×112, chat 320×480 and bar 164×60; requested positions matched within the probe tolerance. Reopen at 31 ms remained visible; no recorded errors; zero visible windows after teardown. |
| macOS 26.7.1 (25G241), Darwin 25.6.0; Electron 41.10.7; DPR 1 | Actual final manager and native windows; 20 hide/reanchor/reopen cycles | Exact role sizes and requested positions; 66 native bounds calls; zero errors. A 30 ms rapid reopen stayed visible; a subsequent close was still visible at 95 ms and hidden after 175 ms. |

The small, constant XWayland size difference is reported rather than compensated with an unsupported platform offset. Manager-source SHA256 for the final runtime checks: `89fa4647a5d89b3f0a2062a31169cd060361a35653c5cf8ec1c25c5a3389a5e0`.

The Windows and macOS tests use static probe pages with the actual manager and Electron windows, not the full application renderer. They prove native placement/size/timer behavior, not complete pointer/drag or chat-feature acceptance. Mixed-DPI monitor transitions, arm64 macOS and live KWin-helper full-group behavior are not certified by these runs.

## Verification and retained evidence

- Full desktop verification: **20,612 passed, 47 skipped**, including types, dead-code checks, lint, design lint and invariants. Fresh wrap-up verification also passed **2,261 related tests, 36 skipped**, with all gates. Final source review found no actionable findings; VM tooling guards passed 15/15.
- Linux measurements, inspected captures, red-test proof and final/full verification logs are retained privately under `~/.cache/yc85-floater-evidence/` (evidence files recorded in its SHA256 manifest). Dev profiles were not copied. The scratch originals may be removed with this session's merged worktree.
- Windows final native report and inspected capture: `~/.cache/yc85-win-final/evidence/native-result-final.json` and `native-chat-final.png`. The report identifies the source hash, Electron version, fixture user and actual Session ID.
- Windows boot recovery: the saved RAM state expected `pc-q35-11.0`, while generic `q35` had become `pc-q35-11.1`. An independent disk/state/firmware/TPM copy restored successfully after pinning the saved machine version. The original guest launcher was backed up as `~/.cache/yc85-win-final/evidence/windows-11-launch-before-repair.sh`, then received that tested one-line pin. Its baseline disk was not changed. The private Windows guest and HTTP server were stopped, and disposable disk/state copies removed after process checks.
- macOS native results, source/bundle mapping, inspected desktop screenshot and verified repaired offline state: `~/.cache/yc85-mac-final/`. The canonical launcher backup is `evidence/macos-tahoe.sh.before-recovery-detach`; its only change was removing the external Recovery attachment, preserving existing host shares. No baseline disk, OpenCore or NVRAM state was promoted. The recovered boot selected Macintosh HD and required Enter; unattended picker behavior is unproven.
- All 22 manifest-listed files in the durable Mac copy matched their recorded checksums. The duplicate `/tmp` copy was removed after those checks; the repaired offline copy and evidence remain. Both guests and all owned servers are stopped. These maintenance changes do not require either running user app to close.

## State

After explicit merge authorization, app PR [#648](https://github.com/itsdestin/youcoded/pull/648) merged to remote master as `bbcadbe9054fde689c1a2fceeb3cdd9cc481f071`. Required Linux desktop and Android PR checks passed. The explicit full Linux/Windows/macOS CI run [39272273978](https://github.com/itsdestin/youcoded/actions/runs/39272273978) passed on head `63407aff772f39819653be3237ba051208a9273a`; the merged app tree was verified identical to that tested head.

Neither the installed app nor the existing Direct Controls .4 binary/launcher was replaced, and no new release was published. Work item #85's three original unrelated requests remain open; this closes only the sizing/toggle subtask and its investigation.
