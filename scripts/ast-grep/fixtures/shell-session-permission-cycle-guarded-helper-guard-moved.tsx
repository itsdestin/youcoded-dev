// SILENT fixture for shell-session-permission-cycle-guarded (re-review of u8,
// 2026-09-16): the raw write and the shell guard both moved into a later helper,
// guard first — the retired text slice passed this, so the rule must too. It
// contributes 0 findings; the exact EXPECTED_VIOLATIONS count fails if it fires.
declare const sessionId: string, sessionsRef: any, window: any;
declare function useCallback<T>(f: T, deps: unknown[]): T;
export function useCycle() {
  const cyclePermission = useCallback(() => {
    sendShiftTab();
  }, [sessionId]);
  const sendShiftTab = () => {
    if (sessionsRef.current.find((x) => x.id === sessionId)?.provider === 'shell') return;
    window.claude.session.sendInput(sessionId, '\x1b[Z');
  };
  return cyclePermission;
}
