#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRun } from './metrics.mjs';

export function fromHarbor(result, identity) {
  const start = Date.parse(result.agent_execution?.started_at);
  const end = Date.parse(result.agent_execution?.finished_at);
  const elapsed = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const usage = result.agent_result;
  const reward = result.verifier_result?.rewards?.reward;
  const failed = !!result.exception_info;
  const run = { schemaVersion: 1, ...identity, model: result.agent_info?.model_info?.name ?? 'unknown',
    status: failed ? 'failed' : 'completed', success: failed ? false : reward === 1 ? true : reward === 0 ? false : null,
    wallClockMs: elapsed, finalText: '', finalTextAvailable: false,
    synthetic: result.agent_result?.metadata?.youcoded_lab?.synthetic === true,
    timingScope: 'harbor-agent-execution', accountingGranularity: 'adapter-run-total', costSource: 'adapter-reported; may be estimated, not verified billing',
    provenance: { agent: result.agent_info, taskChecksum: result.task_checksum, trialId: result.id,
      exception: result.exception_info ?? null, rewards: result.verifier_result?.rewards ?? null },
    requests: [{ id: `${identity.arm}:${identity.taskId}:${identity.repetition}:adapter-total`, role: 'main',
      status: failed ? 'failed' : 'completed', model: result.agent_info?.model_info?.name ?? 'unknown',
      usage: usage ? { inputTokens: usage.n_input_tokens ?? null, outputTokens: usage.n_output_tokens ?? null,
        cacheReadTokens: usage.n_cache_tokens ?? null, cacheWriteTokens: null, reasoningTokens: null,
        costUsd: usage.cost_usd ?? null } : null }],
  };
  // This is an explicitly labeled aggregate, NOT an invented per-request trajectory.
  return validateRun(run);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv.includes('--help')) {
      console.log('Usage: node scripts/harness-lab/harbor-import.mjs manifest.json NEW_OUTPUT.json\nManifest is an array of {path, arm, taskId, repetition, comparisonKey}. Offline only.');
    } else {
      const manifestPath = path.resolve(process.argv[2]);
      const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const runs = entries.map(({ path: file, ...identity }) => fromHarbor(
        JSON.parse(fs.readFileSync(path.resolve(path.dirname(manifestPath), file), 'utf8')), identity));
      fs.writeFileSync(process.argv[3], JSON.stringify(runs, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(`Imported ${runs.length} trials. Preserve the original Harbor files.`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
