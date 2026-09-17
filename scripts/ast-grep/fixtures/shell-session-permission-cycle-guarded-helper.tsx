// Violation fixture for shell-session-permission-cycle-guarded, branch (c) — the
// raw Shift+Tab write moved into a helper declared AFTER cyclePermission, and the
// shell guard was deleted, so the first cyclePermission holds neither.
declare const sessionId: string, window: any;
declare function useCallback<T>(f: T, deps: unknown[]): T;
export function useCycle() {
  const cyclePermission = useCallback(() => {
    if (!sessionId) return;
    sendShiftTab();
  }, [sessionId]);
  const sendShiftTab = () => {
    window.claude.session.sendInput(sessionId, '\x1b[Z');
  };
  return cyclePermission;
}
