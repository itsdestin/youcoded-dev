// Violation fixture: a .ts game file reading the thinking state.
declare const status: { isThinkingNow: boolean };
export function badCheck(): boolean {
  return status.isThinkingNow;
}
