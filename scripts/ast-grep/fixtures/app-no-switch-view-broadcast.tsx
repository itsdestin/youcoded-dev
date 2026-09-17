// Violation fixture for app-no-switch-view-broadcast: the old Android-only
// broadcast that moved the desktop and every other client. Mirrors the real
// call site's receiver chain, not a bare call.
function reintroducedBug(mode: string) {
  (window as any).claude?.remote?.broadcastAction?.({ action: 'switch-view', mode });
}
