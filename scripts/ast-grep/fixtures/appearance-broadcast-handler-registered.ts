// Violation fixture for appearance-broadcast-handler-registered: the whole
// appearance:broadcast channel-table entry is absent (only a comment names it).
// name: IPC.APPEARANCE_BROADCAST
declare const defineChannel: any, IPC: any;
export const entries = [
  defineChannel({ name: IPC.APPEARANCE_GET, kind: 'handle', handler: () => null }),
];
