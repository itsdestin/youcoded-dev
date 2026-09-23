import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const safeCount = (v) => v === null || (Number.isSafeInteger(v) && v >= 0);
const OUTCOMES = new Set(['success', 'failed', 'aborted', 'expired']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** WHY: YouCoded diagnostic JSONL includes linkable real session/request IDs.
 * Read only from the private profile and return only allowlisted usage/counts. */
export async function readNativeDiagnostics({ directory, sessionId, seen }) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)
    || typeof sessionId !== 'string' || !sessionId || !(seen instanceof Set)) {
    throw new TypeError('A private diagnostic directory, session identity and in-memory seen-set are required.');
  }
  let dir;
  try { dir = await lstat(directory); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid()
    || (dir.mode & 0o777) !== 0o700 || await realpath(directory) !== directory) {
    throw new Error('Native diagnostics directory is not private.');
  }
  const rows = [];
  for (const filename of ['requests.previous.jsonl', 'requests.jsonl']) {
    const file = path.join(directory, filename);
    let info;
    try { info = await lstat(file); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
      || (info.mode & 0o777) !== 0o600 || info.size > MAX_FILE_BYTES) {
      throw new Error('Native diagnostics file is not private or exceeds its bound.');
    }
    const raw = await readFile(file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { throw new Error('Native diagnostics contains malformed JSON.'); }
      if (row?.sessionId !== sessionId || row.version !== 1) continue;
      if (typeof row.attemptId !== 'string' || !row.attemptId || seen.has(row.attemptId)) continue;
      if (typeof row.model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(row.model)
        || typeof row.purpose !== 'string' || !/^[a-z][a-z-]{0,31}$/.test(row.purpose)
        || !OUTCOMES.has(row.outcome)
        || !safeCount(row.inputTokens) || !safeCount(row.outputTokens) || !safeCount(row.cachedInputTokens)
        || !Number.isSafeInteger(row.durationMs) || row.durationMs < 0
        || typeof row.cacheDetailPresent !== 'boolean') {
        throw new Error('Native diagnostic record has invalid usage.');
      }
      seen.add(row.attemptId);
      rows.push({ model: row.model, purpose: row.purpose, outcome: row.outcome,
        inputTokens: row.inputTokens, outputTokens: row.outputTokens,
        cachedInputTokens: row.cacheDetailPresent ? row.cachedInputTokens : null,
        cacheDetailPresent: row.cacheDetailPresent, durationMs: row.durationMs });
    }
  }
  return rows;
}
