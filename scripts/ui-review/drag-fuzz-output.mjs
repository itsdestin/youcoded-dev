// What drag-fuzz.mjs keeps and writes, split out so a test can feed it 60 fake scenarios
// without a browser.
//
// WHY (card #18(f)): every scenario used to carry its whole frame log and marks inside the
// result, and the end of the run did ONE JSON.stringify of all of them. Measured on
// synthetic frames (12 pills + bar + twin per frame, 3 s per drag): 60 scenarios is about
// 9 MB at 60 Hz and about 26 MB at 180 Hz (UNLIMITED=1). That is held in memory twice
// (objects, then the string) and written in one call, so a long run is where a crash would
// show. The crash itself was NOT reproduced; this removes the cause that is measurable:
// frames are not retained, and are written only for scenarios that failed, one line each,
// as they happen. A clean scenario needs only its scores.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The five checks the header of drag-fuzz.mjs defines; any non-zero one is a defect.
// (longFrame is context, not a defect.)
export const DEFECT_KEYS = ['contact', 'continuity', 'reversal', 'others', 'blink'];
export const isFailing = (m) => DEFECT_KEYS.some((k) => m[k] > 0);

export const FRAMES_FILE = 'drag-fuzz-frames.ndjson';

// Called once per scenario as it finishes. Returns the SMALL result to retain (scores only).
// If the scenario failed, its frames go to disk now, then the caller's copy is dropped.
export function retainScenario(r, outDir) {
  const { log, marks, ...kept } = r;
  if (isFailing(kept.m)) {
    appendFileSync(join(outDir, FRAMES_FILE), JSON.stringify({ n: kept.desc.n, desc: kept.desc, where: kept.where, log, marks }) + '\n');
    kept.framesFile = FRAMES_FILE;
  }
  return kept;
}

// End of run: the table and the scores. No frames in either.
export function writeSummary(outDir, { url, DPR, unlimited, results }) {
  writeFileSync(join(outDir, 'drag-fuzz.json'), JSON.stringify({ url, DPR, unlimited: !!unlimited, results }));
  writeFileSync(join(outDir, 'drag-fuzz.md'), results.map((r) => `#${r.desc.n} ${JSON.stringify(r.desc)} → ${JSON.stringify(r.m)} ${JSON.stringify(r.where)}`).join('\n') + '\n');
}
