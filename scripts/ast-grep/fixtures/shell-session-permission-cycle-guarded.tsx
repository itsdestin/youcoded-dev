// Violation fixture for shell-session-permission-cycle-guarded — the shell guard
// comes AFTER the raw Shift+Tab write (nested in a helper, as in App.tsx).
declare const sessionId: string, sessionsRef: any, window: any;
declare function useCallback<T>(f: T, deps: unknown[]): T;
export function useCycle() {
  const cyclePermission = useCallback(() => {
    if (!sessionId) return;
    const apply = () => {
      window.claude.session.sendInput(sessionId, '\x1b[Z');
    };
    apply();
    if (sessionsRef.current.find((x) => x.id === sessionId)?.provider === 'shell') return;
  }, [sessionId]);
  return cyclePermission;
}
