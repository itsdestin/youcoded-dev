// Violation fixture for artifact-provider-value-memoized (fires once, on the file):
// App no longer renders <ArtifactProvider> at all; this comment and the string below
// do not count.
declare function useMemo<T>(f: () => T, deps: unknown[]): T;
declare const artifactState: unknown;
export const note = '<ArtifactProvider value={artifactContextValue}>';
export function App() {
  const artifactContextValue = useMemo(() => ({ state: artifactState }), [artifactState]);
  return <div data-value={artifactContextValue ? 1 : 0} />;
}
