// VIOLATION fixture: the pair the way ipc-handlers.ts wrote it before R5-1 — windows by hand, then phones by hand,
// the phone leg nested in an `if (remoteServer)` (the shape that is easiest to miss).
declare const sendForSession: (id: string, channel: string, ...args: unknown[]) => void;
declare const remoteServer: { broadcast(m: { type: string; payload: unknown }): void } | undefined;
declare const nativeHost: { on(e: string, cb: (event: { sessionId: string }) => void): void };

nativeHost.on('transcript-event', (event) => {
  sendForSession(event.sessionId, 'transcript:event', event);
  if (remoteServer) {
    remoteServer.broadcast({ type: 'transcript:event', payload: event });
  }
});
