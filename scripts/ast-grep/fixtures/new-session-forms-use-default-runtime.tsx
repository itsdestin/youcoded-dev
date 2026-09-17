// Violation fixture for new-session-forms-use-default-runtime (fires 2 times): a
// strip form seeding a second runtime with the literal (a), and resetting to the
// literal after its close statement (d — the same node is also the file's second
// literal, f, and is reported once).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setShowNewForm(open: boolean): void;
type Runtime = 'claude' | 'native';
export function StripForm(again: boolean) {
  const [, setRuntime] = useState<Runtime>(() => defaultRuntime());
  const [other] = useState<Runtime>('claude');
  const applyModelChoice = () => { setRuntime('claude'); };
  const create = () => {
    setShowNewForm(false);
    setRuntime(defaultRuntime());
    if (again) setRuntime('claude');
  };
  return { other, applyModelChoice, create };
}
