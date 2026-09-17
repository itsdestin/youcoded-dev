// Violation fixture for get-meta-marks-failed-read-unreadable: both failure paths
// answer blanks (the handler fires once). The presence branch is exercised by
// get-meta-marks-failed-read-unreadable-missing.ts.
declare const ipcMain: any;
declare const IPC: any;
declare const store: any;

export function register(): void {
  ipcMain.handle(IPC.SESSION_GET_META, async (_e: unknown, id: string) => {
    if (!store) return { tags: [], note: '', supported: true };
    try {
      return await store.get(id);
    } catch (e) { return { tags: [], note: '', supported: true }; }
  });
}
