// A run folder's manifest.json: one record per picture (screen × theme). Kept apart from
// shoot.mjs (a CLI that runs on import) so the merge rule below can be tested on its own.
import { existsSync, readFileSync } from 'node:fs';

/**
 * The manifest to write into `outDir` after a run: this run's records, plus every record an
 * EARLIER run left in the same folder for a picture this run did not take — when that
 * picture's file is still there.
 *
 * WHY (project-switcher friction, proposal 5): re-shooting one screen with `--out` into an
 * existing run folder rewrote manifest.json with only that screen, so every other picture —
 * still on disk — vanished from the review deck that reads the manifest, silently. A re-shot
 * screen × theme replaces its old record; nothing else is lost.
 *
 * Returns `{ records, kept }` (`kept` = how many earlier records were carried over).
 */
export function mergeManifest(previous, results) {
  const key = (r) => `${r.name}|${r.theme}`;
  const now = new Set(results.map(key));
  const kept = (Array.isArray(previous) ? previous : []).filter((r) =>
    r && typeof r.name === 'string' && !now.has(key(r))
    // A picture deleted since is not carried over; a not-taken record had no file to keep.
    && r.ok && r.file && existsSync(r.file));
  return { records: [...kept, ...results], kept: kept.length };
}

/** The records already in `file`, or [] when there is none (or it cannot be read). */
export function readManifest(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}
