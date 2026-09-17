// Violation fixture for app-no-switch-view-receiver: the retired uiAction
// branch that let a received 'switch-view' change the current session's
// view mode — reintroduced here, alongside the one relay App still applies.
function uiActionHandler(action: any) {
  if (!action.type && !action.action) return;
  if (action.type === '_SESSION_INITIALIZED' && action.sessionId) {
    markInitialized(action.sessionId);
  }
  if (action.action === 'switch-view' && action.mode) {
    setViewMode(action.mode);
  }
}
