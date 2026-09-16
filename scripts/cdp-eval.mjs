// scripts/cdp-eval.mjs — one-shot Chrome DevTools Protocol eval helper.
//
// Connect to a CDP target's Page WebSocket and evaluate one JS expression in
// its execution context. Prints the returned value as JSON. Used during dev
// to inspect or poke a live React renderer (Electron OR Android WebView)
// without spinning up the full DevTools UI.
//
// Usage:
//   node scripts/cdp-eval.mjs '<webSocketDebuggerUrl>' '<js-expression>'
//
// Where to find the WebSocket URL:
//   - Electron: dev DevTools may expose a CDP port; otherwise prefer
//     desktop's existing tooling (this script is mostly used for Android).
//   - Android WebView: needs USB debugging enabled and the WebView built
//     with `WebView.setWebContentsDebuggingEnabled(true)` (debug builds
//     have this set automatically). Then forward the per-process socket
//     and list the inspectable pages:
//
//        adb shell ps -A | grep <package>            # find the PID
//        adb forward tcp:9222 \
//          localabstract:webview_devtools_remote_<PID>
//        curl -s http://localhost:9222/json
//        # → look for the entry whose `url` is your bundle and copy its
//        #   `webSocketDebuggerUrl`.
//
// Notes:
//   - Set `awaitPromise: true` so async expressions resolve before printing.
//   - Long expressions can be wrapped in an IIFE: `(() => { ... })()` or
//     `(async () => { ... })()`. Multi-line is fine if shell-quoted.
//   - The target page's globals (`window.claude`, React/xterm internals
//     reachable via fiber walk, etc.) are evaluable directly — useful for
//     dumping `__terminalRegistry`, monkey-patching `terminal.write`, etc.
//   - NO DEPENDENCIES. It used to import the `ws` package, which the workspace
//     root does not have, so running it from where this file lives — the only
//     place anyone finds it — died on `Cannot find package 'ws'` before doing
//     anything (hit 2026-09-10; the docs' own workaround was to cd elsewhere or
//     symlink, which nobody does). Node has had a global WebSocket since v22 and
//     this repo runs v26, so the dependency was pure friction.
//
// History: written during the Tier 2 android-xterm-webview dogfood pass to
// inspect xterm scrollback live and capture the byte stream into xterm. See
// the Tier 2 spec/plan under `docs/archive/`.
const wsUrl = process.argv[2];
const expr = process.argv[3];
if (!wsUrl || !expr) {
  console.error('usage: node scripts/cdp-eval.mjs <wsurl> <expr>');
  process.exit(1);
}

// Global WebSocket is the browser API, so it is addEventListener/onmessage
// rather than ws's EventEmitter, and `event.data` is already a string.
const ws = new WebSocket(wsUrl);
let id = 1;
ws.onopen = () => {
  ws.send(JSON.stringify({
    id: id++,
    method: 'Runtime.evaluate',
    params: { expression: expr, returnByValue: true, awaitPromise: true },
  }));
};
ws.onmessage = (event) => {
  const msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
  if (msg.id) {
    if (msg.result?.exceptionDetails) {
      console.log(JSON.stringify(msg.result.exceptionDetails, null, 2));
    } else {
      console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2));
    }
    ws.close();
  }
};
ws.onerror = (e) => { console.error('ws error:', e.message ?? 'connection failed'); process.exit(2); };
