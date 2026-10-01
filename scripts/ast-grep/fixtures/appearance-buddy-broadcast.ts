// Violation fixture for appearance-broadcast-reaches-all-windows: the entry's
// handler no longer reaches Buddy floaters via BrowserWindow.getAllWindows().
declare const defineChannel: any, IPC: any, sessionPeers: () => any[];
export const entries = [
  defineChannel({
    name: IPC.APPEARANCE_BROADCAST, kind: 'on',
    handler: (prefs: unknown) => {
      for (const peer of sessionPeers()) {
        peer.send(IPC.APPEARANCE_SYNC, prefs);
      }
    },
  }),
];
