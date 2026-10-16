// verify.sh's second look at a failed test run: which FILES failed, and — after verify reruns
// just those files on their own — what that says.
//
// WHY (close-session friction, proposal 18): six full verifies to get one green, each failing a
// DIFFERENT test that passed alone; every one needed a manual rerun to tell "this change broke
// it" from "the machine was too busy". verify now reruns the failed files alone and says which
// they were. A failure that passes alone is STILL a failure (a test that a busy machine breaks is
// fixed, test-suite-hygiene.md) — it is reported as load-sensitive, never turned into a pass.
//
//   node verify-rerun.mjs files <vitest log>        → the failed test files, one per line
//   node verify-rerun.mjs verdict <first log> <alone log>  → the summary lines
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAIL = /^\s*(?:FAIL|×|✗)\s+(?:\|[^|]+\|\s+)?(\S+?\.(?:test|spec)\.[cm]?[jt]sx?)\b/;

/** The test files vitest reported failing in `log`, each once, in order. */
export function failedFiles(log) {
  const seen = new Set();
  for (const line of String(log).split('\n')) {
    const m = FAIL.exec(line.replace(/\x1b\[[0-9;]*m/g, ''));
    if (m) seen.add(m[1]);
  }
  return [...seen];
}

/** What the rerun says, as the lines verify prints under the FAIL. */
export function verdict(firstLog, aloneLog) {
  const first = failedFiles(firstLog);
  const still = new Set(failedFiles(aloneLog));
  const alonePassed = first.filter((f) => !still.has(f));
  const failsAlone = first.filter((f) => still.has(f));
  const out = [];
  if (!first.length) return ['could not tell which test files failed — read the full log'];
  if (failsAlone.length) out.push(`fails on its own too (a real failure): ${failsAlone.join(', ')}`);
  if (alonePassed.length) out.push(`passed when rerun alone — load-sensitive, STILL TO FIX (a busy machine breaks it): ${alonePassed.join(', ')}`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'files') console.log(failedFiles(readFileSync(a, 'utf8')).join('\n'));
  else if (cmd === 'verdict') console.log(verdict(readFileSync(a, 'utf8'), readFileSync(b, 'utf8')).join('\n'));
  else { console.error('usage: verify-rerun.mjs files <log> | verdict <first log> <alone log>'); process.exit(2); }
}
