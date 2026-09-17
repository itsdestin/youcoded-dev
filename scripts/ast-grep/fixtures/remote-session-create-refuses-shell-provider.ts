// Violation fixture for remote-session-create-refuses-shell-provider — the
// check tests a different provider; the right condition is only in a comment:
// if (payload?.provider === 'shell')
export function onCreate(payload: { provider?: string } | undefined) {
  if (payload?.provider === 'claude') return false;
  return true;
}
