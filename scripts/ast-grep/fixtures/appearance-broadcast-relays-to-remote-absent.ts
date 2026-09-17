// Violation fixture for appearance-broadcast-relays-to-remote, branch 2: the
// RemoteServer is built without an onAppearanceBroadcast callback, so a phone's
// theme change never reaches the computer (fires once, on the whole file).
// onAppearanceBroadcast: a comment naming it does not count.
const remoteServer = new RemoteServer({ requestSnapshot: () => Promise.resolve({ sessions: [] }) });
ipcMain.on(IPC.APPEARANCE_BROADCAST, (evt, prefs) => {
  remoteServer.broadcast({ type: IPC.APPEARANCE_SYNC, payload: prefs });
});
