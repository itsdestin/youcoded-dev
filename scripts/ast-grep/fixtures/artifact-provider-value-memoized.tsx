// Violation fixture for artifact-provider-value-memoized (fires 3 times): an inline
// value object on the provider, a self-closing provider handed some other value, and
// a memoised value whose dependency array misses artifactState (a frozen context).
declare function useMemo<T>(f: () => T, deps: unknown[]): T;
declare const ArtifactProvider: (p: any) => any;
declare const artifactState: unknown;
declare const dispatchArtifact: unknown;
export function App() {
  const artifactContextValue = useMemo(() => ({ state: artifactState, dispatch: dispatchArtifact }), [dispatchArtifact]);
  const other = { state: artifactState };
  return (
    <>
      <ArtifactProvider value={{ state: artifactState }}>x</ArtifactProvider>
      <ArtifactProvider value={other} />
      <ArtifactProvider value={artifactContextValue}>y</ArtifactProvider>
    </>
  );
}
