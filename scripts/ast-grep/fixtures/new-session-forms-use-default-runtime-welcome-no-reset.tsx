// Violation fixture for new-session-forms-use-default-runtime (fires 2 times): the
// welcome form's close is never followed by setWelcomeRuntime(defaultRuntime())
// (e, on the file — the one after the Cancel arrow is no close STATEMENT's tail),
// and a second literal setWelcomeRuntime('claude') (f).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setWelcomeFormOpen(open: boolean): void;
declare const Button: (p: any) => any;
type Runtime = 'claude' | 'native';
export function Welcome() {
  const [, setWelcomeRuntime] = useState<Runtime>(() => defaultRuntime());
  const applyWelcomeModelChoice = () => { setWelcomeRuntime('claude'); };
  const reset = () => { setWelcomeRuntime('claude'); };
  return (
    <>
      <Button onClick={() => setWelcomeFormOpen(false)}>Cancel</Button>
      <Button onClick={() => setWelcomeRuntime(defaultRuntime())}>Reset</Button>
      <Button onClick={() => { setWelcomeFormOpen(false); applyWelcomeModelChoice(); reset(); }}>Create</Button>
    </>
  );
}
