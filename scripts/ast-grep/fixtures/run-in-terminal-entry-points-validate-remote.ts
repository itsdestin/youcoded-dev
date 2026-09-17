// Violation fixture for run-in-terminal-entry-points-validate-remote — the
// remote case validates the command but drops the bare-string fallback.
declare function prepareRunInTerminal(c: unknown): { command: string };
export function onRemoteRun(payload: { command?: string } | undefined) {
  return prepareRunInTerminal(payload?.command);
}
