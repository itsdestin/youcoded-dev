// Violation fixture for get-meta-marks-failed-read-unreadable-remote (presence
// branch): the router has no `case 'session:get-meta':` at all.
export function route(type: string): unknown {
  switch (type) {
    case 'session:set-note':
      return { ok: true, unreadable: 'n/a' };
    default:
      return null;
  }
}
