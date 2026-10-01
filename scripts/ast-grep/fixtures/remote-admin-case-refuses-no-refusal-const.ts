// Violation fixture for remote-admin-case-refuses: the hostAdminRefusal constant no
// longer holds the sentence's name (fires once, on the whole file).
declare const defineChannel: any, IPC: any;
const hostAdminRefusal = { kind: 'reply', payload: { ok: true } };
export const entries = [
  defineChannel({ name: IPC.REMOTE_SET_PASSWORD, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_SET_CONFIG, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_RENAME, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_UNPAIR, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_GET_CONFIG, kind: 'handle', handler: () => ({}) }),
];
declare function renameDevice(id: string, name: string): boolean;
