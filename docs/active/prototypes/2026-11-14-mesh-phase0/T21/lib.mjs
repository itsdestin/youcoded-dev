// T21 prototype: streaming hash-chain + pair classification for chat copies.
// Read-only. Never prints line contents; callers only ever see counts, sizes, hashes, categories.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const NL = 0x0a;
const SEED = crypto.createHash('sha256').update('T21-seed').digest(); // stands in for h[0]

// WHY: design 5.3 chain is h[n] = SHA-256(h[n-1] || raw bytes of line n), raw bytes
// include the newline. We keep only 16 bytes per line in memory (enough to compare
// prefixes; collision odds are 2^-64 per comparison) and the full 32 bytes for the final.
export async function chainStream(readable) {
  let prev = SEED;
  let cap = 1024;
  let chains = Buffer.allocUnsafe(cap * 16);
  let lines = 0, bytes = 0, crlf = 0, loneCr = 0;
  let bom = false, first = true;
  let carry = [];       // pieces of the current unfinished line
  let carryLen = 0;
  let endsNL = true;    // true for empty files too
  const push = (lineBuf) => {
    const h = crypto.createHash('sha256').update(prev).update(lineBuf).digest();
    prev = h;
    if (lines >= cap) { cap *= 2; const n = Buffer.allocUnsafe(cap * 16); chains.copy(n, 0, 0, lines * 16); chains = n; }
    h.copy(chains, lines * 16, 0, 16);
    lines++;
  };
  const finishLine = (buf) => {
    const L = buf.length;
    if (L >= 2 && buf[L - 2] === 0x0d) crlf++;
    push(buf);
  };
  for await (const chunk of readable) {
    bytes += chunk.length;
    if (first) { first = false; if (chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) bom = true; }
    let start = 0;
    for (;;) {
      const i = chunk.indexOf(NL, start);
      if (i === -1) break;
      let line;
      if (carryLen) { carry.push(chunk.subarray(start, i + 1)); line = Buffer.concat(carry); carry = []; carryLen = 0; }
      else line = chunk.subarray(start, i + 1);
      finishLine(line);
      start = i + 1;
    }
    if (start < chunk.length) { carry.push(Buffer.from(chunk.subarray(start))); carryLen += chunk.length - start; }
  }
  // WHY: an unterminated last line is a write in progress (or a torn copy). It is NOT chained;
  // only complete lines count. Its byte length is kept so identical-vs-torn is still visible.
  let partial = false, partialBytes = 0;
  if (carryLen) { partial = true; endsNL = false; partialBytes = carryLen; }
  return { lines, bytes, final: prev.toString('hex'), chains: chains.subarray(0, lines * 16), endsNL, partial, partialBytes, bom, crlf };
}

export function fileStream(p) { return fs.createReadStream(p, { highWaterMark: 1 << 20 }); }

export function gitBlobStream(gitDir, sha) {
  const cp = spawn('git', ['--git-dir', gitDir, 'cat-file', 'blob', sha], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  return cp.stdout;
}

const eq16 = (a, i, b, j) => a.compare(b, j * 16, j * 16 + 16, i * 16, i * 16 + 16) === 0;

// Compare two chain results. Returns { rel, n?, N? }
//  identical: same chain end. prefix: `a` is a prefix of `b` (or reverse: 'b-prefix-of-a').
//  diverged: first differing line N (1-based).
export function relate(a, b) {
  if (a.lines === b.lines && a.final === b.final) {
    if (a.partialBytes === b.partialBytes) return { rel: 'identical' };
    // same complete lines, one copy also carries an unterminated tail (write in progress / torn copy)
    return a.partialBytes < b.partialBytes ? { rel: 'prefix', tornTail: true } : { rel: 'b-prefix-of-a', tornTail: true };
  }
  const m = Math.min(a.lines, b.lines);
  if (m === 0) return a.lines === 0 && b.lines === 0 ? { rel: 'identical' } : { rel: a.lines === 0 ? 'prefix' : 'b-prefix-of-a', empty: true };
  if (eq16(a.chains, m - 1, b.chains, m - 1)) {
    if (a.lines < b.lines) return { rel: 'prefix' };      // a is a clean prefix of b
    if (b.lines < a.lines) return { rel: 'b-prefix-of-a' };
    return { rel: 'identical' }; // same count and same 16B end
  }
  // chains are cumulative, so equality is monotone: find first index where they differ
  let lo = 0, hi = m - 1; // invariant: chain differs at hi
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (eq16(a.chains, mid, b.chains, mid)) lo = mid + 1; else hi = mid;
  }
  return { rel: 'diverged', N: lo + 1 };
}

// Read raw bytes of line N (1-based) from a readable. Returns Buffer incl. newline (or null).
export async function readLineN(readable, N) {
  let cur = 1, carry = [];
  for await (const chunk of readable) {
    let start = 0;
    for (;;) {
      const i = chunk.indexOf(NL, start);
      if (i === -1) break;
      if (cur === N) { carry.push(chunk.subarray(start, i + 1)); readable.destroy?.(); return Buffer.concat(carry); }
      cur++; start = i + 1;
    }
    if (cur === N && start < chunk.length) carry.push(Buffer.from(chunk.subarray(start)));
  }
  return cur === N && carry.length ? Buffer.concat(carry) : null;
}

// Second pass for a diverged pair: multiset of per-line content hashes and "normalised" whole-file hash.
export async function lineSets(readable) {
  const m = new Map();
  let norm = crypto.createHash('sha256');
  let buf = Buffer.alloc(0);
  const add = (line) => {
    const k = crypto.createHash('sha256').update(line).digest('hex').slice(0, 16);
    m.set(k, (m.get(k) || 0) + 1);
    // normalised: strip BOM on first line, CRLF->LF, canonical JSON re-serialisation if parseable
    let s = line.toString('utf8').replace(/^﻿/, '').replace(/\r?\n$/, '');
    let out = s;
    try { out = JSON.stringify(sortKeys(JSON.parse(s))); } catch { /* keep text */ }
    norm.update(out + '\n');
  };
  for await (const chunk of readable) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    let start = 0;
    for (;;) {
      const i = buf.indexOf(NL, start);
      if (i === -1) break;
      add(buf.subarray(start, i + 1)); start = i + 1;
    }
    buf = Buffer.from(buf.subarray(start));
  }
  if (buf.length) add(buf);
  return { m, norm: norm.digest('hex') };
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

export function deepEq(a, b) { return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b)); }

function multisetEqual(x, y) {
  if (x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

// Diagnose a diverged pair. `openA/openB` return fresh readables. Returns a category string + facts.
export async function diagnose(openA, openB, ca, cb, N) {
  const la = await readLineN(openA(), N), lb = await readLineN(openB(), N);
  const facts = { N, aLines: ca.lines, bLines: cb.lines, aTailAfterN: ca.lines - N + 1, bTailAfterN: cb.lines - N + 1 };
  if (!la || !lb) return { cat: 'other:missing-line', ...facts };
  // truncated partial last line: one side's last line (no newline) is a byte prefix of the other's line N
  const shorter = ca.lines < cb.lines ? [la, ca] : cb.lines < ca.lines ? [lb, cb] : null;
  const strip = (b) => b.toString('utf8').replace(/^﻿/, '').replace(/\r?\n$/, '');
  if (la.length !== lb.length || !la.equals(lb)) {
    if ((ca.partial && N === ca.lines && lb.subarray(0, la.length).equals(la)) ||
        (cb.partial && N === cb.lines && la.subarray(0, lb.length).equals(lb))) return { cat: 'truncated-partial-last-line', ...facts };
    if (strip(la) === strip(lb)) {
      const bomDiff = (la[0] === 0xef) !== (lb[0] === 0xef);
      const crDiff = la.includes(0x0d) !== lb.includes(0x0d);
      return { cat: bomDiff ? 'bom' : crDiff ? 'crlf-vs-lf' : 'trailing-newline-only', ...facts };
    }
    let ja, jb;
    try { ja = JSON.parse(strip(la)); jb = JSON.parse(strip(lb)); } catch { ja = jb = undefined; }
    if (ja !== undefined && deepEq(ja, jb)) return { cat: 'reserialised-json', ...facts };
  }
  // whole-file level: reordered lines? normalisation makes them equal?
  const [sa, sb] = await Promise.all([lineSets(openA()), lineSets(openB())]);
  if (multisetEqual(sa.m, sb.m)) return { cat: 'reordered-lines', ...facts };
  if (sa.norm === sb.norm) return { cat: 'normalisation-equal(other)', ...facts };
  // is one side a superset of the other's lines (e.g. lines inserted in the middle)?
  let aInB = 0, bInA = 0, aT = 0, bT = 0;
  for (const [k, v] of sa.m) { aT += v; aInB += Math.min(v, sb.m.get(k) || 0); }
  for (const [k, v] of sb.m) { bT += v; bInA += Math.min(v, sa.m.get(k) || 0); }
  facts.sharedFracA = +(aInB / aT).toFixed(4); facts.sharedFracB = +(bInA / bT).toFixed(4);
  // Structure only (type + uuid fields, never content): do the two copies tell the same conversation?
  const [ta, tb] = await Promise.all([structure(openA()), structure(openB())]);
  const cv = (t) => t.conv; // uuids of user/assistant lines in order
  let k = 0; const ma = Math.min(cv(ta).length, cv(tb).length);
  while (k < ma && cv(ta)[k] === cv(tb)[k]) k++;
  facts.convA = cv(ta).length; facts.convB = cv(tb).length; facts.convCommonPrefix = k;
  facts.typeAtN = [ta.types[N - 1] ?? null, tb.types[N - 1] ?? null];
  const tailTypes = (t) => { const h = {}; for (const x of t.types.slice(N - 1)) h[x] = (h[x] || 0) + 1; return h; };
  facts.tailTypesA = tailTypes(ta); facts.tailTypesB = tailTypes(tb);
  const sameConvo = k === ma; // one conversation sequence is a prefix of the other
  if (aInB === aT || bInA === bT) return { cat: 'one-contains-other-but-not-prefix' + (sameConvo ? '(same-conversation)' : ''), ...facts };
  return { cat: sameConvo ? 'bytes-differ-same-conversation' : 'real-split', ...facts };
}

// Structure of a transcript: per-line "type" and, for user/assistant lines, the uuid. No content kept.
export async function structure(readable) {
  const types = [], conv = [];
  let buf = '';
  const one = (line) => {
    let t = '?', u = null;
    try { const j = JSON.parse(line); t = typeof j.type === 'string' ? j.type : (j.role ?? '?'); u = j.uuid ?? j.id ?? null; } catch { t = 'unparseable'; }
    types.push(t);
    if ((t === 'user' || t === 'assistant') && u) conv.push(u);
  };
  readable.setEncoding?.('utf8');
  for await (const chunk of readable) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) { one(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  if (buf.length) one(buf);
  return { types, conv };
}

// ---- Alternative chain inputs (T21 proposal evaluation) ----
// Bookkeeping line types seen in Claude Code transcripts that carry no conversation (observed in tails, T21 report).
export const BOOKKEEPING = new Set(['last-prompt', 'cost-state', 'ai-title', 'mode', 'permission-mode', 'session-owner', 'atis-latch', 'tools-used', 'file-history-snapshot', 'file-history-delta', 'queue-operation', 'api-request', 'api-request-blob', 'api-request-shape', 'pr-link']);
// Chain over only the lines for which keep(type) is true. Raw bytes of each kept line (incl newline). Complete lines only.
export async function chainFiltered(readable, keep) {
  let prev = SEED, cap = 1024, chains = Buffer.allocUnsafe(cap * 16), lines = 0, buf = '', total = 0;
  const one = (line) => {
    total++;
    let t = '?'; try { const j = JSON.parse(line); t = typeof j.type === 'string' ? j.type : (j.role ?? '?'); } catch { t = 'unparseable'; }
    if (!keep(t)) return;
    const h = crypto.createHash('sha256').update(prev).update(line + '\n').digest(); prev = h;
    if (lines >= cap) { cap *= 2; const n = Buffer.allocUnsafe(cap * 16); chains.copy(n, 0, 0, lines * 16); chains = n; }
    h.copy(chains, lines * 16, 0, 16); lines++;
  };
  readable.setEncoding?.('utf8');
  for await (const chunk of readable) { buf += chunk; let i; while ((i = buf.indexOf('\n')) !== -1) { one(buf.slice(0, i)); buf = buf.slice(i + 1); } }
  return { lines, bytes: 0, final: prev.toString('hex'), chains: chains.subarray(0, lines * 16), partialBytes: 0, total };
}
