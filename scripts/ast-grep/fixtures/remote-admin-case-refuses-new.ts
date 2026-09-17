// Violation fixture for remote-admin-case-refuses, whole-file backstop: the old
// disconnect spelling sits in a node kind the innermost branch does not list (a
// `new` expression) and the raw text still holds it (fires once, on the file).
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
declare function respond(v: unknown): void;
export function handle(this: any, type: string, payload: any) {
  switch (type) {
    case 'remote:get-config': { respond({}); break; }
    case 'remote:set-password': { respond({ ok: false, error: HOST_ADMIN_REFUSAL }); break; }
    case 'remote:set-config': { respond({ ok: false, error: HOST_ADMIN_REFUSAL }); break; }
    case 'remote:devices:rename': { respond({ ok: false, error: HOST_ADMIN_REFUSAL }); break; }
    case 'remote:devices:unpair': { respond({ ok: false, error: HOST_ADMIN_REFUSAL }); break; }
    default: respond(new this.disconnectClient(payload.clientId));
  }
}
