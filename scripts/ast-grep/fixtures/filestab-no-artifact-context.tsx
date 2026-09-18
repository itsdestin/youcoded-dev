// Violation fixture for filestab-no-artifact-context: one line per branch.
// Expected: 3 findings.
import { useContext } from 'react';
import { ArtifactContext, useArtifact, useArtifactOptional } from '../../../state/ArtifactContext';

export function FilesTabImpl() {
  const { state } = useArtifact();
  const maybe = useArtifactOptional();
  const raw = useContext(ArtifactContext);
  return state && maybe && raw ? null : null;
}
