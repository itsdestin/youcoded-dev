// Violation fixture for main-auto-approve-through-should-auto-approve: an
// approve-all shortcut that answers "allow" without asking shouldAutoApprove —
// the shape that auto-allowed ExitPlanMode before 2026-09-23.
hookRelay.on('hook-event', (event) => {
  const requestId = event.payload._requestId;
  if (requestId && shouldAutoApprove(event.payload.tool_name, event.payload.tool_input, permissionOverrides)) {
    hookRelay.respond(requestId, { decision: { behavior: 'allow' } });
    return;
  }
  if (permissionOverrides.approveAll) {
    hookRelay.respond(requestId, { decision: { behavior: 'allow' } });
  }
});
