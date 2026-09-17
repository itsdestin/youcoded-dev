// Violation fixture for run-in-terminal-entry-points-validate — the handler
// validates something else, and names the right call only in a comment:
// prepareRunInTerminal(command)
declare function prepareRunInTerminal(c: unknown): { command: string };
export function onRunInTerminal(command: string, other: string) {
  return prepareRunInTerminal(other);
}
