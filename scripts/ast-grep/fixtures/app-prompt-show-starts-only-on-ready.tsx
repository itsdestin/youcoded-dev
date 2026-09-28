// Violation fixture for app-prompt-show-starts-only-on-ready (branch 1): the
// promptShow handler marks EVERY prompt as a started session.
declare const window: any;
declare function setInitializedSessions(f: (p: Set<string>) => Set<string>): void;
export function wire() {
  (window.claude.on as any).promptShow?.((payload: any) => {
    // VIOLATION: unconditional.
    setInitializedSessions((prev) => new Set(prev).add(payload.sessionId));
  });
}
