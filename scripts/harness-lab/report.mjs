#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeRuns, compareRuns } from './metrics.mjs';
import { analyzeContinuationEpisodes } from './continuation-metrics.mjs';

const display = value => value == null ? 'unknown' : String(value);
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
export function renderReport(runs, baseline, candidate) {
  const lines = ['# Harness lab report', '',
    'Descriptive results only. Completion is an external verdict; a finished agent turn is not proof of quality.',
    'Unknown usage is not zero. Word counts describe length, not clarity. Synthetic smoke results are not model benchmarks.', '',
    '| Arm | Attempts | Verified successes | Ungraded | Success rate | Total tokens | Complete token runs | Cost/success USD | Median attempt ms | Median success ms |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const arm of [...new Set(runs.map(r => r.arm))].sort()) {
    const s = summarizeRuns(runs.filter(r => r.arm === arm));
    lines.push(`| ${cell(arm)} | ${s.attempts} | ${s.successes} | ${s.ungraded} | ${display(s.successRate)} | ${display(s.totalTokens)} | ${s.completeTokenRuns}/${s.attempts} | ${display(s.costPerSuccessUsd)} | ${display(s.medianAttemptMs)} | ${display(s.medianSuccessMs)} |`);
  }
  if (baseline && candidate) {
    const comparison = compareRuns(runs, baseline, candidate);
    lines.push('', `## Paired differences: ${cell(candidate)} minus ${cell(baseline)}`, '',
      '| Task | Repeat | Success difference | Token difference | Time difference ms | Both succeeded |',
      '|---|---:|---:|---:|---:|---|');
    for (const p of comparison.pairs) lines.push(`| ${cell(p.taskId)} | ${p.repetition} | ${display(p.successDelta)} | ${display(p.tokenDelta)} | ${p.wallClockDeltaMs} | ${p.baselineSuccess === true && p.candidateSuccess === true ? 'yes' : 'no'} |`);
    lines.push('', `Missing paired cells: ${comparison.missing.length}. Common-success pairs: ${comparison.commonSuccessPairs.length}.`, comparison.interpretation);
    for (const missing of comparison.missing) lines.push(`- Missing ${cell(missing.missingArm)}: ${cell(JSON.stringify(missing.cell))}`);
  }
  const continuationRuns = runs.filter(r => r.continuation?.episode);
  if (continuationRuns.length) {
    // WHY: score runtime receipts, never final-answer wording or the post-turn ledger delivered flag.
    const scored = analyzeContinuationEpisodes(continuationRuns.map(r => r.continuation.episode));
    const s = scored.summary;
    lines.push('', '## No-nudge continuation (fixture-verified)', '',
      `Eligible: ${s.eligible}. Assessed: ${s.assessed}. Successes: ${s.successes}. Failures: ${s.failures}. Unknown: ${s.unknown} (censored: ${s.censored}).`,
      `Success rate among assessed: ${display(s.successRate)}. Bounds across all eligible: ${s.successRateBounds ? `${s.successRateBounds.lower}–${s.successRateBounds.upper}` : 'unknown'}. Runs without continuation receipts: ${runs.length - continuationRuns.length}.`, '',
      '| Episode | No-nudge outcome | Stage | Completion to injection ms | Injection to request ms | Ready to useful ms | Actionable idle ms |',
      '|---|---|---|---:|---:|---:|---:|');
    for (const e of scored.episodes) lines.push(`| ${cell(e.id)} | ${e.noNudgeContinuation} | ${e.classification} | ${display(e.completionToReportMs)} | ${display(e.deliveryToParentStartMs)} | ${display(e.readyToUsefulProgressMs)} | ${display(e.actionableIdleMs)} |`);
    for (const gap of new Set(continuationRuns.flatMap(r => r.continuation.coverageGaps ?? []))) lines.push(`- Coverage limit: ${cell(gap)}`);
    lines.push('- Outcomes flag fixture symptoms, not production root causes. Background notices are not human nudges.');
  }
  lines.push('', '## Human review (not automatically scored)', '',
    '- Correct and complete: all requirements met; evidence supports claims; files work.',
    '- Clear: answer is easy to locate, terminology fits the intended reader, next action is unambiguous.',
    '- Concise: no redundant narration or repeated conclusions; necessary caveats remain.',
    '- Follow-through: no unsupported background-work claims or avoidable user nudges.',
    '- Blind product labels and randomize presentation order; record reviewer identity and rubric version separately.', '');
  return lines.join('\n');
}

function readRuns(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(value) ? value : [value];
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length || args.includes('--help')) {
      console.log('Usage: node scripts/harness-lab/report.mjs [--compare BASE CANDIDATE] run.json [run2.json ...]\nOffline only. Prints Markdown; never calls a model.');
    } else {
      let baseline, candidate;
      if (args[0] === '--compare') { args.shift(); baseline = args.shift(); candidate = args.shift(); }
      if (!args.length || (baseline && !candidate)) throw new Error('Provide result files and two comparison arms');
      console.log(renderReport(args.flatMap(readRuns), baseline, candidate));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
