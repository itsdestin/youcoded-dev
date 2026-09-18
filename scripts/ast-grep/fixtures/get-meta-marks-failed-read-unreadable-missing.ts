// Violation fixture for get-meta-marks-failed-read-unreadable (presence branch):
// no ipcMain.handle(IPC.SESSION_GET_META, …) is registered at all.
declare const ipcMain: any;
declare const IPC: any;
export function register(): void {
  ipcMain.handle(IPC.SESSION_SET_NOTE, async () => ({ ok: true }));
}
