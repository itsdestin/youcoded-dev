// Violation fixture for main-uses-shared-mount-probe: the probe is an inlined
// copy under the shared name — no import from './dev-mount-probe' (import branch;
// the call branch is main-uses-shared-mount-probe-inline-call.ts).
declare const win: any;
const MOUNT_PROBE_JS = '!!document.getElementById("root")?.childElementCount';

export function watch(): void {
  void win.webContents.executeJavaScript(MOUNT_PROBE_JS);
}
