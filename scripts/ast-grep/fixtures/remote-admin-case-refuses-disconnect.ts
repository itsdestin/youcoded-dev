// Violation fixture for remote-admin-case-refuses: remote:disconnect-client was given an
// entry, which must stay absent so it falls to the door's unsupported answer (fires once, on the pair).
declare const defineChannel: any, IPC: any;
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
const hostAdminRefusal = { kind: 'reply', payload: { ok: false, error: HOST_ADMIN_REFUSAL } };
export const entries = [
  defineChannel({ name: IPC.REMOTE_SET_PASSWORD, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_SET_CONFIG, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_RENAME, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_UNPAIR, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_GET_CONFIG, kind: 'handle', handler: () => ({}) }),
  defineChannel({ name: IPC.REMOTE_DISCONNECT_CLIENT, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
];
declare function renameDevice(id: string, name: string): boolean;
