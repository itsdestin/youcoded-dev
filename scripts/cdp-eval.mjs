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
//   - No dependency: Node's built-in WebSocket (22+) is used. Runs from any
//     directory — it used to import the `ws` package, which the workspace
//     root does not have, so it failed with "Cannot find package 'ws'" the
//     one time a session reached for it (2026-09-04) and got rewritten from
//     scratch in a scratchpad instead.
//
// History: written during the Tier 2 android-xterm-webview dogfood pass to
// inspect xterm scrollback live and capture the byte stream into xterm. See
// the Tier 2 spec/plan under `docs/archive/`.
if (typeof globalThis.WebSocket !== 'function') {
  console.error('cdp-eval needs Node 22+ (built-in WebSocket); this is ' + process.version);
  process.exit(1);
}

const wsUrl = process.argv[2];
const expr = process.argv[3];
if (!wsUrl || !expr) {
  console.error('usage: node scripts/cdp-eval.mjs <wsurl> <expr>');
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
let id = 1;
ws.onopen = () => {
  ws.send(JSON.stringify({
    id: id++,
    method: 'Runtime.evaluate',
    params: { expression: expr, returnByValue: true, awaitPromise: true },
  }));
};
ws.onmessage = (ev) => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (msg.id) {
    if (msg.result?.exceptionDetails) {
      console.log(JSON.stringify(msg.result.exceptionDetails, null, 2));
    } else {
      console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2));
    }
    ws.close();
  }
};
ws.onerror = (e) => { console.error('ws error:', e.message ?? String(e)); process.exit(2); };
