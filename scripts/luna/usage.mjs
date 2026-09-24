const FIELDS = new Set([
  'arm', 'repetition', 'session', 'phase', 'turn', 'sequence', 'purpose', 'outcome',
  'inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWriteTokens',
  'durationMs', 'expectedRebuild', 'inputIncludesCached', 'usageSource',
  'clientVersion', 'model', 'providerRoute',
]);
const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWriteTokens'];
const PHASES = new Set(['compatibility', 'pre-restart', 'post-restart']);
const OUTCOMES = new Set(['success', 'failed', 'aborted', 'unknown']);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}
function inspectPlainRecord(record, label) {
  if (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null) throw new TypeError(`${label} must be a plain object`);
  if (Object.getOwnPropertySymbols(record).length) throw new TypeError(`${label} cannot contain symbol properties`);
  for (const key of Reflect.ownKeys(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !('value' in descriptor)) throw new TypeError(`${label} cannot contain accessor properties`);
  }
}
function safeLabel(value, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)) throw new TypeError(`${name} must be a bounded sanitized label`);
}
function nullableCount(value, name) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError(`${name} must be null or a nonnegative safe integer`);
}

/** Validate and copy only the explicitly permitted fields of already-sanitized synthetic records. */
export function normalizeUsageRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  return records.map((record, index) => {
    object(record, `record ${index}`);
    inspectPlainRecord(record, `record ${index}`);
    for (const key of Reflect.ownKeys(record)) if (!FIELDS.has(key)) throw new TypeError(`Unexpected field: ${String(key)}`);
    for (const key of ['arm', 'repetition', 'session', 'phase', 'turn', 'sequence', 'purpose', 'outcome', 'inputIncludesCached', 'usageSource', 'clientVersion', 'model', 'providerRoute']) {
      if (!(key in record)) throw new TypeError(`Missing field: ${key}`);
    }
    if (!['youcoded', 'opencode'].includes(record.arm)) throw new TypeError('arm must be youcoded or opencode');
    if (!Number.isSafeInteger(record.repetition) || record.repetition < 1) throw new TypeError('repetition must be a positive safe integer');
    if (typeof record.session !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.session)) throw new TypeError('session must be an opaque experiment-local label');
    if (!PHASES.has(record.phase)) throw new TypeError('invalid phase');
    for (const key of ['turn', 'sequence']) if (!Number.isSafeInteger(record[key]) || record[key] < 1) throw new TypeError(`${key} must be a positive safe integer`);
    if (typeof record.purpose !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(record.purpose)) throw new TypeError('purpose must be a normalized label');
    if (!OUTCOMES.has(record.outcome)) throw new TypeError('invalid outcome');
    for (const key of TOKEN_FIELDS) {
      if (!(key in record)) throw new TypeError(`Missing field: ${key}`);
      nullableCount(record[key], key);
    }
    if (record.cacheReadTokens !== null && record.inputTokens !== null && record.cacheReadTokens > record.inputTokens) throw new TypeError('cacheReadTokens cannot exceed inputTokens');
    if (record.durationMs !== undefined) nullableCount(record.durationMs, 'durationMs');
    if (record.expectedRebuild !== undefined && record.expectedRebuild !== null && typeof record.expectedRebuild !== 'boolean') throw new TypeError('expectedRebuild must be boolean or null');
    if (typeof record.inputIncludesCached !== 'boolean') throw new TypeError('inputIncludesCached must be boolean');
    if (typeof record.usageSource !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(record.usageSource)) throw new TypeError('usageSource must be a normalized source label');
    for (const key of ['clientVersion', 'model', 'providerRoute']) safeLabel(record[key], key);
    // WHY: prefix classifications have no approved closed vocabulary yet; omit rather than carry opaque provider data.
    const normalized = Object.fromEntries(Reflect.ownKeys(record).map((key) => [key, record[key]]));
    normalized.usageKnown = record.inputTokens !== null && record.outputTokens !== null;
    return Object.freeze(normalized);
  });
}

const keyOf = (r) => `${r.arm}:${r.repetition}:${r.session}`;
const operationalOf = (rows) => ({
  observedRequests: rows.length,
  inputTokens: rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
  outputTokens: rows.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
  unknownInputRequests: rows.filter((r) => r.inputTokens === null).length,
  unknownOutputRequests: rows.filter((r) => r.outputTokens === null).length,
});
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Score normalized synthetic rows; completedScoredTurns is keyed by arm:repetition:session. */
export function scoreUsage(records, { completedScoredTurns = {} } = {}) {
  const rows = normalizeUsageRecords(records);
  const repetitions = [];
  for (const [key, group] of Map.groupBy(rows, keyOf)) {
    const [arm, repetitionText, session] = key.split(':');
    const repetition = Number(repetitionText);
    const roots = group.filter((r) => r.purpose === 'root-chat' && r.phase !== 'compatibility');
    const detailed = roots.filter((r) => r.inputTokens !== null && r.cacheReadTokens !== null);
    // WHY: cold-start cost is reported elsewhere; warm reuse begins after each session's first successful root request.
    const cold = roots.filter((r) => r.outcome === 'success').sort((a, b) => a.turn - b.turn || a.sequence - b.sequence)[0];
    const excluded = { compatibility: group.filter((r) => r.phase === 'compatibility').length, coldFirst: 0, auxiliary: 0, failed: 0, unknownUsage: 0 };
    let clean = [];
    for (const r of group) {
      if (r.phase === 'compatibility') continue;
      if (r.purpose !== 'root-chat') { excluded.auxiliary++; continue; }
      if (r.outcome !== 'success') { excluded.failed++; continue; }
      if (r.inputTokens === null || r.cacheReadTokens === null) { excluded.unknownUsage++; continue; }
      if (cold && r === cold) { excluded.coldFirst++; continue; }
      clean.push(r);
    }
    const input = clean.reduce((sum, r) => sum + r.inputTokens, 0);
    const cached = clean.reduce((sum, r) => sum + r.cacheReadTokens, 0);
    const completed = completedScoredTurns[key] ?? 0;
    if (!Number.isSafeInteger(completed) || completed < 0) throw new TypeError(`completedScoredTurns[${key}] must be a nonnegative safe integer`);
    const observed = group.filter((r) => r.phase !== 'compatibility');
    const operational = operationalOf(observed);
    repetitions.push({ arm, repetition, session, rootRequests: roots.length, rootCacheDetailCoverage: roots.length ? detailed.length / roots.length : 0,
      cleanRequests: clean.length, completedScoredTurns: completed, warmReuseRate: input > 0 ? cached / input : null,
      freshInputPerCompletedTurn: completed > 0 ? clean.reduce((sum, r) => sum + r.inputTokens - r.cacheReadTokens, 0) / completed : null,
      operational, excluded, rows: group });
  }
  const arms = {};
  // WHY: compatibility probes are not observations of the scored arms' token semantics.
  const inputSemantics = new Set(rows.filter((r) => r.phase !== 'compatibility').map((r) => r.inputIncludesCached));
  const semanticsComparable = inputSemantics.size <= 1;
  for (const arm of ['youcoded', 'opencode']) {
    const runs = repetitions.filter((r) => r.arm === arm);
    const valid = runs.filter((r) => r.cleanRequests > 0 && r.warmReuseRate !== null && r.completedScoredTurns > 0);
    const rootTotal = runs.reduce((sum, r) => sum + r.rootRequests, 0);
    const coverage = rootTotal ? runs.reduce((sum, r) => sum + r.rootCacheDetailCoverage * r.rootRequests, 0) / rootTotal : 0;
    const reasons = [];
    if (coverage < 0.70) reasons.push('root-cache-detail-coverage-below-70%');
    if (valid.length < 2) reasons.push('fewer-than-two-valid-repetitions');
    if (!semanticsComparable) reasons.push('incompatible-input-token-semantics');
    arms[arm] = { repetitions: runs.length, validRepetitions: valid.length, rootCacheDetailCoverage: coverage, medianWarmReuseRate: median(valid.map((r) => r.warmReuseRate)), medianFreshInputPerCompletedTurn: median(valid.map((r) => r.freshInputPerCompletedTurn)), verdict: reasons.length ? 'inconclusive' : 'scoreable', inconclusiveReasons: reasons };
  }
  // WHY: the unscored probe still consumes plan allowance, even though it
  // must not be charged to any scored repetition's clean warm subset.
  return Object.freeze({ sourceSemantics: 'Records are already allowlisted synthetic per-provider-request records; usageSource and inputIncludesCached describe provenance/meaning. This normalizer does not read raw SDK/session exports and does not make up OpenCode per-request usage.', repetitions, arms,
    probeOperational: operationalOf(rows.filter((r) => r.phase === 'compatibility')),
    allObservedOperational: operationalOf(rows) });
}
