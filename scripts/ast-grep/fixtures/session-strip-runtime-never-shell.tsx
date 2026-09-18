// Violation fixture for session-strip-runtime-never-shell — each of the three
// lines after the useState call spells the banned call in a different node kind
// (fixtures are not type-checked).
import { useState } from 'react';
type Runtime = 'claude' | 'native';
export function useFormRuntime(pickShell: boolean) {
  const [runtime, setRuntime] = useState<Runtime>('claude');
  if (pickShell) setRuntime('shell');
  // a comment: setRuntime('shell')
  const HINT = "never call setRuntime('shell')";
  return { runtime, HINT };
}
