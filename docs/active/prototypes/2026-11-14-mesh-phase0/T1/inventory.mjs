#!/usr/bin/env node
// T1 rig: the INVENTORY TOOL. Lists, per device, every chat version with its segment, complete-line
// count, chain hash and reply-end count; diffs two inventories (or two homes) into one verdict per chat.
//
//   node inventory.mjs <home> [--json]           inventory of one device home (a rig <dev>/home)
//   node inventory.mjs diff <homeA|a.json> <homeB|b.json> [--json]
//
// TODAY the source is the runtime files (no chat store exists yet): Claude Code transcripts under
// <home>/.claude/projects/<slug>/<sessionId>.jsonl and native chats under <home>/.youcoded/sessions/<slug>/.
// Phase 2 adds source 'store' (S2: listVersions/head/hashAt) with the SAME output shape, so the same diff
// judges real replication. Reads only; never writes. Streams each file (no whole-file load).
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Chain per design 5.3, with the encoding the design leaves open pinned here (proposal for Phase 2):
//   h[0] = SHA-256( utf8(versionId) || uint32be(segment) )      h[n] = SHA-256( h[n-1] (32 raw bytes) || line n raw bytes )
// A line is the bytes up to and including "\n"; a trailing partial line is NOT counted (S1).
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
const seg4 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
export const chainStart = (versionId, segment = 0) => sha(Buffer.from(versionId, 'utf8'), seg4(segment));

/** Stream complete lines of a file as Buffers (each including its "\n"). Returns the partial tail size. */
async function* lineStream(file) {
  let carry = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let from = 0, i;
    while ((i = buf.indexOf(0x0a, from)) !== -1) { yield buf.subarray(from, i + 1); from = i + 1; }
    carry = buf.subarray(from);
  }
  return carry.length; // generator return value: partial tail bytes
}

export async function headOf(file, versionId, { segment = 0, upTo = Infinity, provider = 'claude' } = {}) {
  let h = chainStart(versionId, segment), lines = 0, replyEnds = 0, bytes = 0;
  const it = lineStream(file);
  for (;;) {
    const r = await it.next();
    if (r.done) return { lines, bytes, chain: h.toString('hex'), replyEnds: provider === 'claude' ? replyEnds : null, partialTailBytes: r.value ?? 0 };
    if (lines >= upTo) return { lines, bytes, chain: h.toString('hex'), replyEnds: provider === 'claude' ? replyEnds : null, partialTailBytes: 0, stoppedEarly: true };
    h = sha(h, r.value); lines++; bytes += r.value.length;
    // reply end = the event the app treats as turn-complete: assistant line whose stop_reason is not tool_use (transcript-watcher.ts:219)
    if (provider === 'claude' && r.value.includes('"assistant"')) { try { const o = JSON.parse(r.value.toString('utf8')); if (o.type === 'assistant' && o.message?.stop_reason && o.message.stop_reason !== 'tool_use') replyEnds++; } catch { /* torn line */ } }
  }
}

function* chatFiles(home) {
  const roots = [['claude', join(home, '.claude', 'projects')], ['native', join(home, '.youcoded', 'sessions')]];
  for (const [provider, root] of roots) {
    if (!existsSync(root)) continue;
    for (const slug of readdirSync(root)) {
      const dir = join(root, slug);
      let st; try { st = statSync(dir); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of readdirSync(dir)) if (f.endsWith('.jsonl')) yield { provider, slug, file: join(dir, f), session: f.slice(0, -6), extrasDir: join(dir, f.slice(0, -6)) };
    }
  }
}

/** Count and fingerprint "extras" (<session>/subagents, tool-results): design 5.3 table. Names+sizes only. */
function extrasOf(dir) {
  if (!existsSync(dir)) return null;
  const items = [];
  const walk = (d) => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else items.push(`${relative(dir, p)}:${statSync(p).size}`); } };
  walk(dir); items.sort();
  return { files: items.length, manifestHash: createHash('sha256').update(items.join('\n')).digest('hex').slice(0, 16) };
}

export async function inventory(home, { deviceId = null } = {}) {
  const chats = [];
  for (const c of chatFiles(home)) {
    const chat = `${c.provider}:${c.session}`;           // chat id = provider ":" session id (5.3)
    const head = await headOf(c.file, chat, { provider: c.provider });
    chats.push({ chat, version: chat /* main version id = chat id */, segment: 0, provider: c.provider, slug: c.slug, path: relative(home, c.file), ...head, extras: extrasOf(c.extrasDir) });
  }
  chats.sort((a, b) => a.chat.localeCompare(b.chat));
  return { schema: 1, source: 'runtime-files', device: deviceId, chats };
}

/** One verdict per chat id present on either side. */
export async function diffInventories(A, B, { homeA, homeB } = {}) {
  const by = (inv) => new Map(inv.chats.map((c) => [c.chat, c]));
  const a = by(A), b = by(B), out = [];
  for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(id), y = b.get(id);
    if (!x) { out.push({ chat: id, verdict: 'only-in-B', b: y.lines }); continue; }
    if (!y) { out.push({ chat: id, verdict: 'only-in-A', a: x.lines }); continue; }
    if (x.lines === y.lines && x.chain === y.chain) { out.push({ chat: id, verdict: 'identical', lines: x.lines }); continue; }
    const row = { chat: id, a: x.lines, b: y.lines };
    if (!homeA || !homeB) { out.push({ ...row, verdict: 'differs (heads only; pass homes to classify)' }); continue; }
    // Heads differ: is the shorter one a clean prefix of the longer? Compare the longer side's hash at the shorter count.
    const [short, long, longHome, shortName] = x.lines <= y.lines ? [x, y, homeB, 'A'] : [y, x, homeA, 'B'];
    const at = await headOf(join(longHome, long.path), long.chat, { upTo: short.lines });
    if (at.chain === short.chain && short.lines < long.lines) { out.push({ ...row, verdict: `${shortName}-is-prefix-of-${shortName === 'A' ? 'B' : 'A'}`, behind: long.lines - short.lines }); continue; }
    if (at.chain === short.chain && short.lines === long.lines) { out.push({ ...row, verdict: 'identical' }); continue; }
    // Not a prefix: find the first differing line, and say whether only line endings differ (T21's question).
    const li = lineStream(join(homeA, x.path)), lj = lineStream(join(homeB, y.path));
    let n = 0, eolOnly = true;
    for (;;) {
      const [p, q] = await Promise.all([li.next(), lj.next()]); n++;
      if (p.done || q.done) break;
      if (!p.value.equals(q.value)) { const strip = (v) => Buffer.from(v.toString('latin1').replace(/\r?\n$/, ''), 'latin1'); eolOnly = strip(p.value).equals(strip(q.value)); break; }
    }
    out.push({ ...row, verdict: 'split', firstDifferingLine: n, lineEndingsOnly: eolOnly });
  }
  return out;
}

async function load(arg) {
  if (arg.endsWith('.json')) return { inv: JSON.parse(readFileSync(arg, 'utf8')), home: null };
  return { inv: await inventory(arg), home: arg };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), json = args.includes('--json'), pos = args.filter((x) => !x.startsWith('--'));
  if (pos[0] === 'diff') {
    const [A, B] = await Promise.all([load(pos[1]), load(pos[2])]);
    const rows = await diffInventories(A.inv, B.inv, { homeA: A.home, homeB: B.home });
    if (json) console.log(JSON.stringify(rows, null, 2)); else for (const r of rows) console.log(`${r.verdict.padEnd(18)} ${r.chat.slice(0, 16).padEnd(16)} A=${r.a ?? '-'} B=${r.b ?? '-'}${r.firstDifferingLine ? ` first-diff-line=${r.firstDifferingLine} eol-only=${r.lineEndingsOnly}` : ''}`);
    process.exit(rows.every((r) => r.verdict === 'identical') ? 0 : 1);
  }
  const inv = await inventory(pos[0]);
  if (json) console.log(JSON.stringify(inv, null, 2)); else for (const c of inv.chats) console.log(`${c.chat.slice(0, 16)}  seg ${c.segment}  lines ${String(c.lines).padStart(6)}  replies ${c.replyEnds ?? '-'}  chain ${c.chain.slice(0, 12)}  ${c.path}`);
}
