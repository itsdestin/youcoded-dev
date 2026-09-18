// Violation fixture for remote-admin-case-refuses: every channel still has a
// case, but rename is PERFORMED (fires on that case), the address check is back
// in a comment (fires on the comment) and the old disconnect handler is back
// (fires on the call). The empty `unpair` label falls through to a refusing
// case, which is allowed.
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
export async function handle(client: any, type: string, id: string, payload: any, self: any) {
  switch (type) {
    case 'remote:get-config': {
      self.respond(client.ws, type, id, {});
      break;
    }
    case 'remote:set-password': {
      self.respond(client.ws, type, id, { ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    case 'remote:set-config': {
      self.respond(client.ws, type, id, { ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    // allowed only when client.ip === '127.0.0.1'
    case 'remote:disconnect-client': {
      this.disconnectClient(payload.clientId);
      break;
    }
    case 'remote:devices:rename': {
      self.renameDevice(payload.id, payload.name);
      self.respond(client.ws, type, id, { ok: true });
      break;
    }
    case 'remote:devices:unpair':
    case 'remote:devices:forget': {
      self.respond(client.ws, type, id, { ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
  }
}
// Review of u5: skipping a comment between an empty label and the next case must
// not skip past that case — here the next case PERFORMS, so the label fires (1).
export function handleAgain(type: string, payload: any, self: any) {
  switch (type) {
    case 'remote:devices:unpair':
    // falls through to the next arm
    case 'remote:devices:drop': {
      self.unpairDevice(payload.id);
      break;
    }
  }
}
