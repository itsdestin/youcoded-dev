// Violation fixture for remote-server-no-address-check-or-disconnect, whole-file backstop: the old
// disconnect spelling sits in a node kind the innermost branch does not list (a
// `new` expression) and the raw text still holds it (fires once, on the file).
declare function respond(v: unknown): void;
export function handle(this: any, type: string, payload: any) {
  switch (type) {
    default: respond(new this.disconnectClient(payload.clientId));
  }
}
