// Violation fixture for appearance-broadcast-relays-to-remote, the other half:
// a window's change reaches the phones but a phone's change never reaches the
// computer's windows (fires once, on the entry). sendToWindows named only in a
// comment does not count:
// ctx.remote.sendToWindows(IPC.APPEARANCE_SYNC, prefs);
declare const defineChannel: any, IPC: any;
export const entries = [
  defineChannel({
    name: IPC.APPEARANCE_BROADCAST, kind: 'on',
    handler: (prefs: unknown, ctx: any) => {
      ctx.desktop?.sendToPhones({ type: IPC.APPEARANCE_SYNC, payload: prefs });
    },
  }),
];
