// Violation fixture for shell-session-permission-cycle-guarded — the file has no
// `const cyclePermission` at all (renamed), so there is nothing to check.
declare const sessionId: string, window: any;
export function useCycle() {
  let cyclePermission = () => {
    window.claude.session.sendInput(sessionId, '\x1b[Z');
  };
  return cyclePermission;
}
