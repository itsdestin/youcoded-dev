// Violation fixture for voice-assets-runs-no-other-program. Six hits, marked.
// A comment naming bzip2 must NOT fire: branch C skips comments, as the retired case did.
import { execFileSync } from 'child_process'; // fires once: branch A (the import)
export const unpack = (f: string) => execFileSync('gzip', ['-d', f]); // fires once: branch B (the call)
// fires once: branch B in a comment — the retired check read comments too: spawnSync(
export const tool = 'lbzip2'; // fires once: branch C (a string)
export const mapped = [1].map(function spawn(x) { return x; }); // fires once: branch B (a named function expression)
export const gen = function* exec() {}; // fires once: branch B (a named generator expression)
// 2026-11-10 (card #15(g)): the forms the first version missed. Nine more hits, marked.
export const sync = (c: string) => execSync(c); // fires once: branch B (execSync)
export const child = (f: string) => fork(f); // fires once: branch B (fork)
export const cp1 = require('child_process'); // fires once: branch A (require)
export const cp2 = require("child_process"); // fires once: branch A (double quotes)
export const cp3 = require('node:child_process'); // fires once: branch A (node: spelling)
export const cp4 = () => import('child_process'); // fires once: branch A (dynamic import)
export const cp5 = require(`child_process`); // fires once: branch A (template string)
import { execSync as run } from 'node:child_process'; // fires once: branch A (the node: import)
export const cp6 = await import("node:child_process"); // fires once: branch A (dynamic node: import, double quotes)
