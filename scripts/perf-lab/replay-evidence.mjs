import { completeIpcEvidence } from './stall-attribution.mjs';

const measured = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** WHY run AND comparison recheck raw evidence: a finite completed-response
 * maximum can hide a much longer pending ping. Unknown blame is legitimate;
 * incomplete observation cannot clear a gate, even if report.incomplete is empty.
 * This validates recorded replay evidence, NOT expected-repeat completeness. */
export function replayEvidenceProblems(replay) {
  if (replay == null) return [];
  const problems = [];
  for (const [size, section] of Object.entries(replay)) {
    const path = `replayStall.${size}`;
    if (!Array.isArray(section?.runs) || section.runs.length === 0) {
      problems.push(`${path}: no replay evidence rows`);
      continue;
    }
    for (const [i, run] of section.runs.entries()) {
      if (!completeIpcEvidence(run?.ipcEvidence)) {
        problems.push(`${path}.runs[${i}]: incomplete IPC coverage (pending, hidden, rejected or missing samples)`);
      }
      if (run?.longtaskSupported !== true
        || !['rendererLongtaskCount', 'rendererLongtaskTotalMs', 'rendererLongtaskMaxMs'].every(key => measured(run?.[key]))) {
        problems.push(`${path}.runs[${i}]: renderer long-task observation unavailable or invalid`);
      }
    }
  }
  return problems;
}
