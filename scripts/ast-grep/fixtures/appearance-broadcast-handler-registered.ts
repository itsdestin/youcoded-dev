// Violation fixture for appearance-broadcast-handler-registered: the whole
// ipcMain.on(IPC.APPEARANCE_BROADCAST, …) registration is absent.
export function noop(): void {
  // nothing here reaches IPC.APPEARANCE_BROADCAST at all
}
