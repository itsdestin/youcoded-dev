// Offline validation against the INSTALLED build, not the repaired source tree.
// Loads pure compiled helpers from the archive into memory with all filesystem
// mutation and non-pure imports blocked. Never attaches to the running app.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPairedHistory } from './repair-transcript-pairs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'youcoded/desktop/package.json'));
const asar = require('@electron/asar');
const archive = '/opt/YouCoded/resources/app.asar';
const cache = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readOnlyFs = new Proxy(fs, { get(target, key) {
  if (key === 'promises') return new Proxy(fs.promises, { get(t, k) {
    if (['readFile', 'stat', 'lstat', 'access', 'readdir', 'readlink', 'realpath'].includes(k)) return t[k].bind(t);
    throw new Error(`Forbidden filesystem method ${String(k)}`);
  } });
  if (typeof target[key] !== 'function') return target[key];
  if (['readFileSync', 'existsSync', 'statSync', 'lstatSync', 'realpathSync', 'readdirSync', 'readlinkSync'].includes(key)) return target[key].bind(target);
  return () => { throw new Error(`Forbidden filesystem method ${String(key)}`); };
} });
function load(name) {
  name = path.posix.normalize(name);
  if (!name.endsWith('.js')) name += '.js';
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} };
  cache.set(name, module);
  const source = asar.extractFile(archive, name).toString();
  const localRequire = specifier => {
    if (specifier === 'fs' || specifier === 'node:fs') return readOnlyFs;
    if (specifier.startsWith('.')) return load(path.posix.join(path.posix.dirname(name), specifier));
    if (['path', 'crypto', 'util', 'os', 'events', 'buffer', 'url', 'async_hooks'].includes(specifier.replace(/^node:/, ''))) return require(specifier);
    throw new Error(`Blocked non-pure dependency: ${specifier} from ${name}`);
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', source)(
    localRequire, module, module.exports, name, path.posix.dirname(name));
  return module.exports;
}
const { rebuildHistoryWithOrigins, restorePortableHistory } = load('dist/main/harness/history-rebuild');
const { messagesTokens } = load('dist/main/harness/message-size');
const { planContextBudget } = load('dist/main/harness/compaction');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const version = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version;
const reports = [];
for (const entry of manifest.entries) {
  const original = fs.readFileSync(entry.backup);
  const candidate = fs.readFileSync(entry.candidate);
  if (sha(original) !== entry.originalSha256 || sha(candidate) !== entry.candidateSha256) throw new Error('Staged checksum mismatch');
  const parse = bytes => bytes.toString().trim().split('\n').slice(1).map(JSON.parse);
  const before = parse(original); const after = parse(candidate);
  const portable = restorePortableHistory(after);
  if (after.some(event => event.type === 'compact-summary') && !portable)
    throw new Error(`Summary not restored for ${entry.target}`);
  const withoutImages = portable ?? rebuildHistoryWithOrigins(after);
  // WHY: fixed-cost image placeholders exercise the installed estimator without
  // reading private image files or pretending to verify their availability.
  const imageReader = () => ({ ok: true, data: Buffer.from([1]), mediaType: 'image/png' });
  const withImages = restorePortableHistory(after, imageReader) ?? rebuildHistoryWithOrigins(after, imageReader);
  const history = withImages.messages;
  assertPairedHistory(history);
  const historyTokens = messagesTokens(history);
  const assumedFixedOverhead = 100_000;
  const plan = planContextBudget({ contextLength: 872_000, fixedCost: assumedFixedOverhead,
    summaryOverhead: 0, maxTokens: 16_000, estimatedInput: historyTokens + assumedFixedOverhead });
  if (plan.replyCap < 16_000) throw new Error(`Insufficient conservative context headroom for ${entry.target}`);
  reports.push({ target: entry.target, installedVersion: version,
    beforePortable: !!restorePortableHistory(before), afterPortable: !!portable,
    historyTokensWithoutImages: messagesTokens(withoutImages.messages),
    historyTokensWithImagePlaceholders: historyTokens, assumedFixedOverhead, replyCap: plan.replyCap,
    messages: history.length, sourceBytes: original.length, candidateBytes: candidate.length,
    originalSha256: entry.originalSha256, candidateSha256: entry.candidateSha256 });
}
console.log(JSON.stringify({ installedVersion: version, reports,
  limitations: 'Offline structural/estimator validation only; no provider request or actual image availability check.' }, null, 2));
