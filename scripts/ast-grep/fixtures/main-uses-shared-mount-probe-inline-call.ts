// Violation fixture for main-uses-shared-mount-probe (call branch): the import is
// still there, but the watchdog evaluates an inline string instead of it.
import { MOUNT_PROBE_JS } from './dev-mount-probe';
declare const win: any;

export function watch(): void {
  void win.webContents.executeJavaScript('!!document.getElementById("root")');
  void MOUNT_PROBE_JS;
}
