// Violation fixture for new-session-forms-use-default-runtime (fires 2 times): a
// strip form with no `useState<Runtime>(() => defaultRuntime())` (b, on the file),
// and a second literal setRuntime('claude') outside any close's block (f).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setShowNewForm(open: boolean): void;
type Runtime = 'claude' | 'native';
export function StripForm() {
  const [, setRuntime] = useState<Runtime>(defaultRuntime());
  const applyModelChoice = () => { setRuntime('claude'); };
  const pickAgain = () => { setRuntime('claude'); };
  const create = () => {
    setShowNewForm(false);
    setRuntime(defaultRuntime());
  };
  return { applyModelChoice, pickAgain, create };
}
