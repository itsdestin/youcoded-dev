// Violation fixture for new-session-forms-use-default-runtime (fires once, on the
// file): a form that never closes with either form's close call (c).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setShowForm(open: boolean): void;
type Runtime = 'claude' | 'native';
export function StripForm() {
  const [, setRuntime] = useState<Runtime>(() => defaultRuntime());
  const create = () => {
    setShowForm(false);
    setRuntime(defaultRuntime());
  };
  return { create };
}
