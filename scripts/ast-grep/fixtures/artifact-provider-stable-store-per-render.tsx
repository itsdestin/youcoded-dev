// Violation fixture for artifact-provider-stable-store (fires once, on the file):
// the store is built in the render body, so it is a new identity every render.
declare function createArtifactStore(): unknown;
declare const ArtifactProvider: (p: any) => any;
export function App() {
  const artifactStore = createArtifactStore();
  return <ArtifactProvider store={artifactStore}>x</ArtifactProvider>;
}
