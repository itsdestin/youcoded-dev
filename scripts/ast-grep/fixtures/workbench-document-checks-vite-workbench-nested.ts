// Violation fixture for workbench-document-checks-vite-workbench: the exported
// predicate checks only the dev flag, and the VITE_WORKBENCH check lives in a
// same-name function NESTED inside another export, which must not satisfy the
// rule. Fires once, on the file.
declare const env: { DEV: boolean; VITE_WORKBENCH?: string };
export function isWorkbenchDocument(): boolean {
  return env.DEV;
}
export function wrapper(): () => boolean {
  function isWorkbenchDocument(): boolean {
    return env.VITE_WORKBENCH === '1';
  }
  return isWorkbenchDocument;
}
