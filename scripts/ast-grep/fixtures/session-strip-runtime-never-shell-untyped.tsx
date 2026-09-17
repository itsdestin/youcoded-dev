// Violation fixture for session-strip-runtime-never-shell — the runtime state
// is not typed by the union (named only here: useState<Runtime>().
import { useState } from 'react';
export function useFormRuntime() {
  const [runtime, setRuntime] = useState<string>('claude');
  return { runtime, setRuntime };
}
