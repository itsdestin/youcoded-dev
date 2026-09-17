// Violation fixture for voice-assets-runs-no-other-program. Four hits, marked.
// A comment naming bzip2 must NOT fire: branch C skips comments, as the retired case did.
import { execFileSync } from 'child_process'; // fires once: branch A (the import)
export const unpack = (f: string) => execFileSync('gzip', ['-d', f]); // fires once: branch B (the call)
// fires once: branch B in a comment — the retired check read comments too: spawnSync(
export const tool = 'lbzip2'; // fires once: branch C (a string)
