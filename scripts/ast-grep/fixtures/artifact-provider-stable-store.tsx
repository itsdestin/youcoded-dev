// Violation fixture for artifact-provider-stable-store (fires 3 times): an inline
// value object on the provider, a self-closing provider handed some other store,
// and the right store with a value prop beside it.
declare function useState<T>(f: () => T): [T, (v: T) => void];
declare function createArtifactStore(): unknown;
declare const ArtifactProvider: (p: any) => any;
declare const artifactState: unknown;
export function App() {
  const [artifactStore] = useState(() => createArtifactStore());
  const other = createArtifactStore();
  return (
    <>
      <ArtifactProvider value={{ state: artifactState }}>x</ArtifactProvider>
      <ArtifactProvider store={other} />
      <ArtifactProvider store={artifactStore} value={{ state: artifactState }}>y</ArtifactProvider>
    </>
  );
}
