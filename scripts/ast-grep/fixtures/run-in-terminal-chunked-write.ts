// Violation fixture for run-in-terminal-chunked-write — the initial command
// goes out on ordinary input; the chunked call appears only in a string.
declare const worker: { send(m: unknown): void };
export function typeInitialCommand(command: string) {
  worker.send({ type: 'input', data: command });
  return "send({ type: 'input-chunked', data: command })";
}
