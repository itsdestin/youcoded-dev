// Violation fixture for voice-worker-uses-shared-sentence-split, branch 1: the
// worker imports something else from the shared file, never the splitter.
// Fires once, on the file.
import { MIC_REFUSED_SENTENCE } from '../../shared/voice-types';
export const said = MIC_REFUSED_SENTENCE;
