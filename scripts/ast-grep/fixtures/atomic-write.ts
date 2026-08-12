// Violation fixture for atomic-tmp-name-per-process. This file is NOT compiled
// into the app — check.sh scans it to prove the rule still fires on all three
// spellings of the fixed-temp-name shape, and stays silent on the good one.
import * as fs from 'fs';

export function badTemplate(file: string): void {
  // VIOLATION: fixed temp name — two processes sharing the dir race the same path.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, 'x');
  fs.renameSync(tmp, file);
}

export function badConcatSingle(file: string): void {
  // VIOLATION: the same fixed-name shape via single-quoted string concat.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, 'x');
  fs.renameSync(tmp, file);
}

export function badConcatDouble(file: string): void {
  // VIOLATION: the double-quoted concat variant.
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, 'x');
  fs.renameSync(tmp, file);
}

export function goodPidSuffixed(file: string): void {
  // OK — pid-suffixed temp name. Must NOT fire: check.sh compares the fixture
  // finding count exactly, so a false positive here fails the run loudly.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, 'x');
  fs.renameSync(tmp, file);
}
