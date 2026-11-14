// T2 throwaway: seam S1 (design 6.1) — runtime file -> store source adapter.
//
//   poll(path, state, opts) -> { lines[], replyEnds[], state } | { rewritten: reason, state }
//
// WHY this shape: the mesh store must NEVER silently absorb a file that stopped being
// append-only. Every way the file can stop being a pure extension of what we already ingested
// must come back as `rewritten` (the caller then starts a new segment). A partial trailing line
// (writer mid-append) is never ingested; it waits for its newline.
//
// State (JSON-safe):
//   offset      bytes ingested (always ends just after a newline)
//   lines       number of lines ingested (absolute line number of the next line)
//   chain       hex SHA-256 chain: h[n] = SHA-256(h[n-1] || raw bytes of line n, newline included)
//   dev, ino    file identity (a rename-over / delete-and-recreate changes ino)
//   tailHash    SHA-256 of the last TAIL bytes (<= 64 KiB) before `offset`
//   headHash    SHA-256 of the first HEAD bytes (<= 4 KiB) of the file (ADDITION to the design: a
//               compaction/rewrite from line 1 changes the head even when size grows past the old
//               offset; see report finding on the cheap-check blind spot)
//
// Cheap check = identity + size + tailHash + headHash: 2 small preads, independent of file size.
// Full re-hash (re-reading 0..offset) happens ONLY when the cheap check fails, and then decides
// between "false alarm" (chain still matches: keep going) and `rewritten`.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const TAIL = 64 * 1024;
export const HEAD = 4 * 1024;
const CHUNK = 8 * 1024 * 1024;

const sha = (...bufs) => { const h = createHash('sha256'); for (const b of bufs) h.update(b); return h; };
const hex = (...bufs) => sha(...bufs).digest('hex');

export function initState(seed) {
  // seed = version id || segment, as in design 5.3: h[0] = SHA-256(version id || segment)
  return { offset: 0, lines: 0, chain: hex(Buffer.from(String(seed))), dev: null, ino: null, tailHash: null, headHash: null };
}

function pread(fd, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, b, got, len - got, pos + got);
    if (n === 0) break;
    got += n;
  }
  return got === len ? b : b.subarray(0, got);
}

/** Re-hash 0..offset line by line; returns {chain, lines} or null if the prefix is not whole lines. */
function rehash(fd, seed, offset) {
  let chain = hex(Buffer.from(String(seed)));
  let pos = 0, carry = Buffer.alloc(0), lines = 0;
  while (pos < offset) {
    const want = Math.min(CHUNK, offset - pos);
    const buf = pread(fd, pos, want);
    if (buf.length === 0) return null; // file shorter than offset after all
    pos += buf.length;
    let data = carry.length ? Buffer.concat([carry, buf]) : buf;
    let start = 0, nl;
    while ((nl = data.indexOf(0x0a, start)) !== -1) {
      chain = hex(Buffer.from(chain, 'hex'), data.subarray(start, nl + 1));
      lines++;
      start = nl + 1;
    }
    carry = data.subarray(start);
  }
  if (carry.length) return null; // offset did not end on a newline
  return { chain, lines };
}

/**
 * @param {string} path
 * @param {object} state  from initState() or a previous poll()
 * @param {{seed:string, isReplyEnd?:(line:Buffer)=>boolean}} opts
 */
export function poll(path, state, opts) {
  const seed = opts.seed;
  // Reply-end detection. Two forms:
  //   opts.isReplyEnd(line) -> bool               (stateless; fine for native lines)
  //   opts.replyEndStep(rs, line, lineNo) -> {rs, confirmed:[lineNo...]}   (needs lookahead: Claude Code
  //     writes one assistant API message as several lines that each carry the final stop_reason, so a
  //     line is a reply end only once the NEXT relevant line shows the message is finished; `rs` is
  //     carried in state.rs, so it survives restarts. confirmed numbers may point at EARLIER lines.)
  const isReplyEnd = opts.isReplyEnd ?? (() => false);
  const step = opts.replyEndStep ?? null;
  let rs = state.rs ?? null;
  let fd;
  try { fd = fs.openSync(path, 'r'); }
  catch (e) { return { rewritten: e.code === 'ENOENT' ? 'missing' : 'unreadable:' + e.code, state }; }
  try {
    const st = fs.fstatSync(fd, { bigint: true });
    const size = Number(st.size);
    const dev = String(st.dev), ino = String(st.ino);

    let prevTail = Buffer.alloc(0);
    if (state.offset > 0) {
      // ---- cheap check ----
      if (state.ino !== null && (state.ino !== ino || state.dev !== dev)) return { rewritten: 'replaced', state };
      if (size < state.offset) return { rewritten: 'shrunk', state };
      const tl = Math.min(TAIL, state.offset);
      prevTail = pread(fd, state.offset - tl, tl);
      const hl = Math.min(HEAD, state.offset);
      const head = pread(fd, 0, hl);
      const cheapOk = prevTail.length === tl && head.length === hl
        && hex(prevTail) === state.tailHash && hex(head) === state.headHash;
      if (!cheapOk) {
        // ---- expensive path: full re-hash, the only place we read the whole prefix ----
        const r = rehash(fd, seed, state.offset);
        if (!r || r.chain !== state.chain || r.lines !== state.lines) return { rewritten: 'rewritten', state };
        // false alarm: chain intact, so the stored cheap hashes were stale. Carry on; they are
        // refreshed below.
      }
    }

    const lines = [], replyEnds = [];
    let chain = state.chain, offset = state.offset, lineNo = state.lines;
    // window of the most recent ingested bytes, built from what we actually read so the stored
    // tail hash describes exactly the bytes the chain covers (no read-after-write race)
    let window = prevTail;
    let carry = Buffer.alloc(0);
    let pos = state.offset;
    while (pos < size) {
      const buf = pread(fd, pos, Math.min(CHUNK, size - pos));
      if (buf.length === 0) break;
      pos += buf.length;
      const data = carry.length ? Buffer.concat([carry, buf]) : buf;
      let start = 0, nl;
      while ((nl = data.indexOf(0x0a, start)) !== -1) {
        const line = Buffer.from(data.subarray(start, nl + 1)); // copy: do not alias the read buffer
        chain = hex(Buffer.from(chain, 'hex'), line);
        lines.push(line);
        if (step) { const o = step(rs, line, lineNo); rs = o.rs; for (const c of o.confirmed) replyEnds.push(c); }
        else if (isReplyEnd(line)) replyEnds.push(lineNo);
        lineNo++;
        offset += line.length;
        start = nl + 1;
      }
      carry = Buffer.from(data.subarray(start));
      // keep only the last TAIL ingested bytes
      const ingested = data.subarray(0, start);
      if (ingested.length) {
        window = Buffer.concat([window, ingested]);
        if (window.length > TAIL) window = window.subarray(window.length - TAIL);
      }
    }
    // carry (partial trailing line) is deliberately NOT ingested.

    let headHash = state.headHash;
    if (offset > 0 && (headHash === null || state.offset < HEAD)) {
      const hl = Math.min(HEAD, offset);
      headHash = hex(pread(fd, 0, hl)); // first ever ingest, or head still growing
    }
    const next = {
      offset, lines: lineNo, chain, dev, ino,
      tailHash: offset > 0 ? hex(window) : null,
      headHash, rs,
    };
    return { lines, replyEnds, state: next };
  } finally { fs.closeSync(fd); }
}

/** Slow-cadence scrub: full re-hash regardless of the cheap check. Returns true when intact. */
export function scrub(path, state, opts) {
  const fd = fs.openSync(path, 'r');
  try {
    const r = rehash(fd, opts.seed, state.offset);
    return !!r && r.chain === state.chain && r.lines === state.lines;
  } finally { fs.closeSync(fd); }
}
