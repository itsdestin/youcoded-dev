// CLEAN fixture: one publish call; a windows-only send (the session list's own pushes are not a pair); a phones-only
// send; and a pair whose halves sit in DIFFERENT functions (the split-delivery case, which publish does not cover yet).
declare const publish: (id: string, type: string, payload: unknown) => void;
declare const sendForSession: (id: string, channel: string, ...args: unknown[]) => void;
declare const remoteServer: { broadcast(m: { type: string; payload: unknown }): void } | undefined;
declare const nativeHost: { on(e: string, cb: (event: { sessionId: string }) => void): void };

nativeHost.on('transcript-event', (event) => {
  publish(event.sessionId, 'transcript:event', event);
});
nativeHost.on('session-created', (info) => {
  sendForSession(info.sessionId, 'session:created', info);
});
nativeHost.on('status', (data) => {
  remoteServer?.broadcast({ type: 'status:data', payload: data });
});
nativeHost.on('split', (event) => {
  sendForSession(event.sessionId, 'x:y', event);
  nativeHost.on('later', () => { remoteServer?.broadcast({ type: 'x:y', payload: event }); });
});
