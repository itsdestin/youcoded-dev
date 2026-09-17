// Violation fixture for new-session-forms-use-default-runtime (fires once, on the
// file): the strip form resets to the default only BEFORE its close, so no close
// statement is followed by the reset (e).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setShowNewForm(open: boolean): void;
type Runtime = 'claude' | 'native';
export function StripForm() {
  const [, setRuntime] = useState<Runtime>(() => defaultRuntime());
  const create = () => {
    setRuntime(defaultRuntime());
    setShowNewForm(false);
  };
  return { create };
}
