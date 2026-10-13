// Violation fixture for remote-server-no-address-check-or-disconnect: the address
// check is back in a comment (fires on the comment), the old disconnect handler is
// back (fires on the call) and the disconnect channel has a case again (fires on it).
declare function respond(v: unknown): void;
export function handle(this: any, type: string, payload: any) {
  switch (type) {
    // allowed only when client.ip === '127.0.0.1'
    case 'remote:disconnect-client': {
      this.disconnectClient(payload.clientId);
      respond({ ok: true });
      break;
    }
  }
}
