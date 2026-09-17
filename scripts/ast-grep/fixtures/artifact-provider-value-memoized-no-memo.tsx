// Violation fixture for artifact-provider-value-memoized (fires once, on the file):
// the provider's value is no longer a useMemo result.
declare const ArtifactProvider: (p: any) => any;
declare const artifactState: unknown;
export function App() {
  const artifactContextValue = { state: artifactState };
  return <ArtifactProvider value={artifactContextValue}>x</ArtifactProvider>;
}
