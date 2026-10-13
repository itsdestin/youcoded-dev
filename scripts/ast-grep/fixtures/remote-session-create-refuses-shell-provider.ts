// Violation fixture for remote-session-create-refuses-shell-provider — the
// entry's remoteGuard tests a different provider; the right condition is only
// in a comment:
// remoteGuard: (opts) => (opts?.provider === 'shell' ? refusal : undefined)
declare const defineChannel: any, IPC: any;
export const entries = [
  defineChannel({
    name: IPC.SESSION_CREATE, kind: 'handle',
    handler: (opts: unknown) => opts,
    remoteGuard: (opts: { provider?: string } | undefined) => (opts?.provider === 'claude' ? { ok: false } : undefined),
  }),
];
