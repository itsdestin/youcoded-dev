// Violation fixture for voice-worker-uses-shared-sentence-split, branch 2. The
// shared splitter IS imported (other specifiers and double quotes still count),
// so branch 1 stays quiet; the two hits are a local copy of the rule.
import { MIC_REFUSED_SENTENCE, splitAtLastSentenceEnd } from "../../shared/voice-types";
export const both = [MIC_REFUSED_SENTENCE, splitAtLastSentenceEnd];
export const isEnd = (ch: string) => ch === '!'; // fires once (a comparison)
// fires once — the retired read saw comments too: ch === '?'
