// Violation fixture for remote-admin-case-refuses: every entry is present, but the
// rename entry is PERFORMED for a phone (no remoteAllowed:false, no refusal: fires on
// that entry) and the get-config entry is made desktop-only (fires on it).
declare const defineChannel: any, IPC: any;
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
const hostAdminRefusal = { kind: 'reply', payload: { ok: false, error: HOST_ADMIN_REFUSAL } };
export const entries = [
  defineChannel({ name: IPC.REMOTE_SET_PASSWORD, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_SET_CONFIG, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_DEVICES_RENAME, kind: 'handle', handler: ({ deviceId, name }: any) => renameDevice(deviceId, name) }),
  defineChannel({ name: IPC.REMOTE_DEVICES_UNPAIR, kind: 'handle', remoteAllowed: false, refusal: hostAdminRefusal, handler: () => false }),
  defineChannel({ name: IPC.REMOTE_GET_CONFIG, kind: 'handle', desktopOnly: true, handler: () => ({}) }),
];
declare function renameDevice(id: string, name: string): boolean;
