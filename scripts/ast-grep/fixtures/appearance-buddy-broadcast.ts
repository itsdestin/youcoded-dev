// Violation fixture for appearance-broadcast-reaches-all-windows: the handler
// no longer reaches Buddy floaters via BrowserWindow.getAllWindows().
ipcMain.on(IPC.APPEARANCE_BROADCAST, (evt, prefs) => {
  for (const peer of sessionPeers()) {
    peer.send(IPC.APPEARANCE_SYNC, prefs);
  }
});
