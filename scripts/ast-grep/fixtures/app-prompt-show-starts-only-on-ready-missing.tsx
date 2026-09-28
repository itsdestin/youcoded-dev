// Violation fixture for app-prompt-show-starts-only-on-ready (branch 2): the
// guarded call is gone altogether, so Android would never start a session.
declare const window: any;
declare function dispatch(a: unknown): void;
export function wire() {
  (window.claude.on as any).promptShow?.((payload: any) => {
    dispatch({ type: 'SHOW_PROMPT', promptId: payload.promptId });
  });
}
