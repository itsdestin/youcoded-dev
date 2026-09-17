// Violation fixture for new-session-forms-use-default-runtime (fires once): the
// welcome form's Create handler resets to the literal after its close, nested in a
// callback (d — also the file's second literal, f; reported once).
declare function useState<T>(init: T | (() => T)): [T, (v: T) => void];
declare function defaultRuntime(): Runtime;
declare function setWelcomeFormOpen(open: boolean): void;
declare const Button: (p: any) => any;
type Runtime = 'claude' | 'native';
export function Welcome() {
  const [, setWelcomeRuntime] = useState<Runtime>(() => defaultRuntime());
  const applyWelcomeModelChoice = () => { setWelcomeRuntime('claude'); };
  return (
    <>
      <Button onClick={() => setWelcomeFormOpen(false)}>Cancel</Button>
      <Button
        onClick={() => {
          setWelcomeFormOpen(false);
          setWelcomeRuntime(defaultRuntime());
          queueMicrotask(() => { setWelcomeRuntime('claude'); });
          applyWelcomeModelChoice();
        }}
      >
        Create
      </Button>
    </>
  );
}
