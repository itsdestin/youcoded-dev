// Violation fixture for get-meta-marks-failed-read-unreadable (presence branch):
// no channel-table entry names IPC.SESSION_GET_META at all.
declare const defineChannel: any;
declare const IPC: any;
export const entries = [
  defineChannel({ name: IPC.SESSION_SET_NOTE, kind: 'handle', handler: async () => ({ ok: true }) }),
];
