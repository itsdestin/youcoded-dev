// Violation fixture for artifact-provider-stable-store (fires once, on the file):
// App no longer renders <ArtifactProvider> at all; this comment and the string below
// do not count.
declare function useState<T>(f: () => T): [T, (v: T) => void];
declare function createArtifactStore(): unknown;
export const note = '<ArtifactProvider store={artifactStore}>';
export function App() {
  const [artifactStore] = useState(() => createArtifactStore());
  return <div data-store={artifactStore ? 1 : 0} />;
}
