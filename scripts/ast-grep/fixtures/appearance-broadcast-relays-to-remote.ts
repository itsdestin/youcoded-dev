// Violation fixture for appearance-broadcast-relays-to-remote, branch 1: the
// window relay reaches every window but no longer tells phones (fires once, on
// the ipcMain.on call). The remote callback is present, so branch 2 is quiet.
const remoteServer = new RemoteServer({
  onAppearanceBroadcast: (prefs: unknown) => { void prefs; },
});
ipcMain.on(IPC.APPEARANCE_BROADCAST, (evt, prefs) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.APPEARANCE_SYNC, prefs);
  }
  // remoteServer.broadcast({ type: IPC.APPEARANCE_SYNC, payload: prefs });
  remoteServer.broadcast({ type: IPC.STATUS_CHANGED, payload: prefs });
});
