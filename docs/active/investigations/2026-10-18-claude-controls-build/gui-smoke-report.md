# Real Electron GUI smoke

status: active

## Isolation and setup

- Real renderer, Electron backend and unmodified Claude Code 2.1.302, launched using `run-dev.sh`, offset 481 / profile `dev-cc-direct-smoke`.
- Disposable HOME and private account bus. A private CLI launcher supplies only a dummy key and the loopback scripted API after `dev-isolation.sh` correctly removes inherited provider secrets. No real-model calls in this GUI test.
- Earlier fixture attempts failed onboarding because inherited dummy keys were stripped. This was not an unsupported auth-status format. The fixture also initially seeded global CLI state at the wrong path when `CLAUDE_CONFIG_DIR` was absent; corrected to `HOME/.claude.json`.
- Run evidence: `app-smoke-run-KODb6b/`; screenshots and numbered interaction log: workspace `scratch/explore/20261018-234308/`.

## Observed results before final Stop fix

| Action | Observation |
|---|---|
| Text | `GUI_DIRECT_HELLO café 日本語` appears once in chat and once in its native user transcript record; scripted response appears in chat. |
| Clear | App command selection produces `Conversation cleared`; native terminal shows `/clear`; next direct prompt succeeds, proving bridge survives clear. |
| Stop | Cancels the actual streamed reply and returns native terminal to idle, but chat remains busy. **Failed UI lifecycle; not accepted.** |
| Model | Model picker switches Sonnet to Haiku; actual terminal reports `Set model to Haiku 5.5`; subsequent local compact request uses `claude-haiku-5-5`. |
| Compact | Context dialog's Compact conversation action produces a native completed `/compact` and chat's `Conversation compacted` summary marker. |
| Legacy Escape comparison | Same session, another slow prompt, Terminal-view Escape: chat immediately clears busy state and displays `Interrupted.` |

The Stop A/B isolates a real integration gap: direct `$.turn.abort` writes a partial assistant record but no native interrupt/stop-summary/turn-duration record. Legacy Escape writes the interrupt marker consumed by the existing lifecycle. A narrow target-scoped Stop completion is being implemented; transcript observation remains authoritative for content and history.

Warm-model confirmation/cancellation is separately covered by actual production-bridge CLI smoke; this GUI run's model change did not require confirmation.

## Final GUI run after Stop fixes — 2026-10-19

Evidence: `app-smoke-run-lyWJbw/final-gui.{json,png}`, its dummy-auth request log, and `scratch/explore/20261019-005218/` numbered actions. No renderer page errors were reported. The dev instance and explorer were stopped afterward.

- Slow Unicode prompt → chat Stop: partial reply preserved, Stop button/spinner gone, remained idle.
- Next text message: received a normal local reply, exactly once in the visible conversation.
- Warm `/model` request: actual native `Switch model?` prompt shown; chat Escape cancelled it and reconciled chip to Sonnet.
- Context dialog Compact: completed summary marker.
- Context dialog Clear: clear marker and subsequent text/reply succeeded.
- Second warm model change: existing prompt-card Yes button accepted Haiku. A following local request used Haiku.
- Fast Stop immediately after the next Submit: partial reply retained and chat returned idle. The delayed-watcher ordering itself is pinned deterministically by unit tests, not claimed solely from click timing.

The fix carries the plugin's exact opening transcript UUID through the addressed Stop and waits for that row when the watcher is behind. No artificial transcript/history content is written. A fresh read-only reviewer reported no outstanding Critical/Important findings, including late partial text and newer-turn protection.

## Packaging

First packaging attempt failed with `ENOSPC` on the nearly full home filesystem. Repackaging the already compiled application to `/tmp/youcoded-cc-controls-test-build` succeeded (exit 0). The independent copy at `/home/destin/YouCoded-Test-Builds/claude-direct-controls-20261018` was subsequently refreshed from the successful final `1.3.1-cc-controls.2` build. Archive/executable checksums passed; packaged bridge/plugin/receipts/live-state/preload bytes matched final compiled output. Linux PTY prebuild and Office converter are present. Its actual isolated launcher booted the finished copy to onboarding, externally photographed in `final/cc-controls-packaged-window.png`, then the exact test process was stopped. Launcher credential/path isolation was additionally verified using a stub executable. Full final desktop verification passed; logs are retained under `final/`. Source remains uncommitted and unshipped.
