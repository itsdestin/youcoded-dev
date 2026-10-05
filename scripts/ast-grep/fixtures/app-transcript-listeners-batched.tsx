// Violation fixture for app-transcript-listeners-batched: a transcript listener that
// applies an action straight to the store instead of the frame batcher.
declare const dispatch: (a: unknown) => void;
function reintroducedBug() {
  (window as any).claude.on.transcriptShrink?.((payload: { sessionId: string }) => {
    dispatch({ type: 'COMPACTION_COMPLETE', sessionId: payload.sessionId });
  });
}
