// Violation fixture for appearance-broadcast-relays-to-remote: the entry reaches
// every window but no longer tells phones (fires once, on the entry). The
// phone-side call is present, so only the missing sendToPhones is the cause.
declare const defineChannel: any, IPC: any, BrowserWindow: any;
export const entries = [
  defineChannel({
    name: IPC.APPEARANCE_BROADCAST, kind: 'on',
    handler: (prefs: unknown, ctx: any) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.APPEARANCE_SYNC, prefs);
      ctx.remote?.sendToWindows(IPC.APPEARANCE_SYNC, prefs);
      // ctx.desktop.sendToPhones({ type: IPC.APPEARANCE_SYNC, payload: prefs });
      ctx.desktop?.sendToPhones({ type: IPC.STATUS_CHANGED, payload: prefs });
    },
  }),
];
