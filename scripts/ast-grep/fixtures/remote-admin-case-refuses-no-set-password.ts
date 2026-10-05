// Violation fixture for remote-admin-case-refuses, presence branch: the entry for
// IPC.REMOTE_SET_PASSWORD is gone (fires once, on the whole file).
declare const defineChannel: any, IPC: any;
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
const hostAdminRefusal = { kind: 'reply', payload: { ok: false, error: HOST_ADMIN_REFUSAL } };
export const entries = [
  // defineChannel({ name: IPC.REMOTE_SET_PASSWORD }) is only a comment now
  defineChannel({ name: IPC.REMOTE_SET_CONFIG, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_RENAME, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_UNPAIR, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_GET_CONFIG, kind: 'handle', handler: () => ({}) }),
];
declare function renameDevice(id: string, name: string): boolean;
