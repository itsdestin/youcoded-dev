// Violation fixture for remote-admin-case-refuses, presence branch: the
// 'remote:devices:unpair' case is gone (fires once, on the whole file).
const HOST_ADMIN_REFUSAL = 'Change this on the computer itself.';
declare function respond(v: unknown): void;
export function handle(type: string) {
  switch (type) {
    case 'remote:get-config': {
      respond({ ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    case 'remote:set-password': {
      respond({ ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    case 'remote:set-config': {
      respond({ ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    case 'remote:devices:rename': {
      respond({ ok: false, error: HOST_ADMIN_REFUSAL });
      break;
    }
    // case 'remote:devices:unpair': is only a comment now
  }
}
