// Analysis only: never calls a model or reads the user's app state.
const FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'costUsd'];
const ROLES = new Set(['main', 'specialist', 'compaction', 'judge']);
const STATUSES = new Set(['completed', 'failed', 'timeout', 'interrupted']);

function validNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function validateRequest(row) {
  if (!row || typeof row.id !== 'string' || !row.id || !ROLES.has(row.role) || !STATUSES.has(row.status))
    throw new Error('Invalid request identity, role or status');
  for (const key of FIELDS) {
    const value = row.usage?.[key];
    if (value != null && !validNumber(value)) throw new Error(`Invalid ${key} on ${row.id}`);
  }
  const u = row.usage ?? {};
  // Normalized input includes caches; reasoning is included in output. Never sum subsets twice.
  if ((u.inputTokens != null && (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0) > u.inputTokens)
    || (u.outputTokens != null && (u.reasoningTokens ?? 0) > u.outputTokens))
    throw new Error(`Invalid token subset on ${row.id}`);
}
function totals(rows) {
  const result = { requestCount: rows.length };
  for (const key of FIELDS) {
    const values = rows.map(r => r.usage?.[key]).filter(v => v != null);
    const observed = values.reduce((a, b) => a + b, 0);
    result[key] = { total: rows.length > 0 && values.length === rows.length ? observed : null,
      observed, known: values.length, missing: rows.length - values.length };
  }
  result.totalTokens = result.inputTokens.total == null || result.outputTokens.total == null
    ? null : result.inputTokens.total + result.outputTokens.total;
  return result;
}
export function aggregateRequests(requests) {
  if (!Array.isArray(requests)) throw new Error('Requests must be an array');
  const seen = new Set();
  for (const row of requests) {
    validateRequest(row);
    if (seen.has(row.id)) throw new Error(`Duplicate request: ${row.id}`);
    seen.add(row.id);
  }
  return { agent: totals(requests.filter(r => r.role !== 'judge')),
    judge: totals(requests.filter(r => r.role === 'judge')) };
}

export function validateRun(run) {
  if (run?.schemaVersion !== 1 || !run.arm || !run.taskId || !run.comparisonKey
    || !Number.isInteger(run.repetition) || run.repetition < 0 || !STATUSES.has(run.status)
    || ![true, false, null].includes(run.success) || (run.wallClockMs !== null && !validNumber(run.wallClockMs)))
    throw new Error('Invalid run: require schemaVersion, arm, taskId, repetition, comparisonKey, status, success and wallClockMs');
  if (run.success === true && run.status !== 'completed') throw new Error('Invalid success on incomplete run');
  aggregateRequests(run.requests);
  return run;
}
const completeSum = values => values.length && values.every(v => v != null) ? values.reduce((a, b) => a + b, 0) : null;
const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = values.filter(v => v != null).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] : null;
};

export function summarizeRuns(runs) {
  runs.forEach(validateRun);
  const usage = runs.map(r => aggregateRequests(r.requests).agent);
  const successes = runs.filter(r => r.success === true).length;
  const ungraded = runs.filter(r => r.success === null).length;
  const cost = completeSum(usage.map(u => u.costUsd.total));
  return { attempts: runs.length, successes, ungraded,
    successRate: runs.length && !ungraded ? successes / runs.length : null,
    totalTokens: completeSum(usage.map(u => u.totalTokens)),
    observedTokens: usage.reduce((n, u) => n + u.inputTokens.observed + u.outputTokens.observed, 0),
    completeTokenRuns: usage.filter(u => u.totalTokens != null).length,
    costUsd: cost, costPerSuccessUsd: successes && !ungraded && cost != null ? cost / successes : null,
    timedRuns: runs.filter(r => r.wallClockMs != null).length,
    medianAttemptMs: quantile(runs.map(r => r.wallClockMs), 0.5),
    p90AttemptMs: quantile(runs.map(r => r.wallClockMs), 0.9),
    medianSuccessMs: quantile(runs.filter(r => r.success === true).map(r => r.wallClockMs), 0.5),
    finalAnswerWords: runs.map(r => ({ taskId: r.taskId, repetition: r.repetition,
      words: r.finalTextAvailable === false ? null : (r.finalText ?? '').trim().split(/\s+/u).filter(Boolean).length })),
  };
}

export function compareRuns(runs, baseline, candidate) {
  if (!baseline || !candidate || baseline === candidate) throw new Error('Choose two distinct arms');
  const cells = new Map();
  for (const run of runs.filter(r => r.arm === baseline || r.arm === candidate)) {
    validateRun(run);
    const key = JSON.stringify([run.taskId, run.repetition]);
    const pair = cells.get(key) ?? {};
    if (pair[run.arm]) throw new Error(`Duplicate cell ${run.arm}/${key}`);
    pair[run.arm] = run;
    cells.set(key, pair);
  }
  const pairs = [], missing = [];
  for (const [key, cell] of cells) {
    const a = cell[baseline], b = cell[candidate];
    if (!a || !b) { missing.push({ cell: JSON.parse(key), missingArm: a ? candidate : baseline }); continue; }
    if (a.comparisonKey !== b.comparisonKey) throw new Error(`Comparison declaration mismatch for ${key}`);
    if (a.timingScope !== b.timingScope) throw new Error(`Timing scope mismatch for ${key}`);
    if (!!a.synthetic !== !!b.synthetic) throw new Error(`Synthetic/live mismatch for ${key}`);
    const au = aggregateRequests(a.requests).agent, bu = aggregateRequests(b.requests).agent;
    pairs.push({ taskId: a.taskId, repetition: a.repetition,
      baselineSuccess: a.success, candidateSuccess: b.success,
      successDelta: a.success == null || b.success == null ? null : Number(b.success) - Number(a.success),
      tokenDelta: au.totalTokens == null || bu.totalTokens == null ? null : bu.totalTokens - au.totalTokens,
      costDeltaUsd: au.costUsd.total == null || bu.costUsd.total == null ? null : bu.costUsd.total - au.costUsd.total,
      wallClockDeltaMs: a.wallClockMs == null || b.wallClockMs == null ? null : b.wallClockMs - a.wallClockMs });
  }
  // WHY: selecting each arm's own successes changes task difficulty and can reverse the verdict.
  return { baseline, candidate, baselineSummary: summarizeRuns(runs.filter(r => r.arm === baseline)),
    candidateSummary: summarizeRuns(runs.filter(r => r.arm === candidate)), pairs, missing,
    commonSuccessPairs: pairs.filter(p => p.baselineSuccess === true && p.candidateSuccess === true),
    interpretation: 'Descriptive paired results, not a significance claim. Inspect failures and telemetry coverage before comparing efficiency.' };
}
