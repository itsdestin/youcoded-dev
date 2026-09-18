// Violation fixture for shell-session-permission-cycle-guarded, branch (c) — the
// raw Shift+Tab write moved into a later helper, and the shell guard moved there
// too but AFTER the write, so the first cyclePermission holds neither and the
// first later write is unguarded. Fires once, on the declaration.
declare const sessionId: string, sessionsRef: any, window: any;
declare function useCallback<T>(f: T, deps: unknown[]): T;
export function useCycle() {
  const cyclePermission = useCallback(() => {
    sendShiftTab();
  }, [sessionId]);
  const sendShiftTab = () => {
    window.claude.session.sendInput(sessionId, '\x1b[Z');
    if (sessionsRef.current.find((x) => x.id === sessionId)?.provider === 'shell') return;
  };
  return cyclePermission;
}
