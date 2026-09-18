// Violation fixture for workbench-document-checks-vite-workbench: the predicate
// checks only the dev flag, so the production site build folds it to false.
// A VITE_WORKBENCH mention in ANOTHER function does not count. Fires once.
declare const env: { DEV: boolean; VITE_WORKBENCH?: string };
export function isWorkbenchDocument(): boolean {
  return env.DEV;
}
export function other(): boolean {
  return env.VITE_WORKBENCH === '1';
}
