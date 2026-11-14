// Deterministic CBOR subset (RFC 8949 section 4.2.1 "core deterministic encoding"), restricted so that
// canonical form is trivial and the DECODER REFUSES anything non-canonical. Allowed: unsigned integers (< 2^53),
// byte strings, text strings, arrays, maps with text keys, true/false/null. No floats, no negatives, no tags,
// no indefinite lengths. WHY: entry ids are SHA-256 of these bytes and every device (Windows, Mac, Linux, Android)
// must produce identical bytes; a decoder that accepts a second spelling of the same value would give two ids.
const isBytes = (v) => v instanceof Uint8Array;
function head(major, n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('cbor: integer out of range');
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  if (n < 0x100000000) { const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = (major << 5) | 27; b.writeBigUInt64BE(BigInt(n), 1); return b;
}
export function encode(v) {
  if (v === null) return Buffer.from([0xf6]);
  if (v === true) return Buffer.from([0xf5]);
  if (v === false) return Buffer.from([0xf4]);
  if (typeof v === 'number') return head(0, v);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (isBytes(v)) return Buffer.concat([head(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(encode)]);
  if (typeof v === 'object') {
    const ents = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [encode(k), encode(x)]);
    ents.sort((a, b) => Buffer.compare(a[0], b[0]));
    return Buffer.concat([head(5, ents.length), ...ents.flat()]);
  }
  throw new Error('cbor: unsupported value');
}
export function decode(buf) {
  buf = Buffer.from(buf); let o = 0;
  const need = (n) => { if (o + n > buf.length) throw new Error('cbor: truncated'); };
  function arg(info) {
    if (info < 24) return info;
    let n, min;
    if (info === 24) { need(1); n = buf[o++]; min = 24; }
    else if (info === 25) { need(2); n = buf.readUInt16BE(o); o += 2; min = 0x100; }
    else if (info === 26) { need(4); n = buf.readUInt32BE(o); o += 4; min = 0x10000; }
    else if (info === 27) { need(8); const big = buf.readBigUInt64BE(o); o += 8; if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: too large'); n = Number(big); min = 0x100000000; }
    else throw new Error('cbor: indefinite or reserved length not allowed');
    if (n < min) throw new Error('cbor: not shortest form');
    return n;
  }
  function item(depth) {
    if (depth > 64) throw new Error('cbor: too deep');
    need(1); const ib = buf[o++]; const major = ib >> 5, info = ib & 31;
    if (major === 7) { if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; throw new Error('cbor: simple/float not allowed'); }
    if (major === 6) throw new Error('cbor: tags not allowed');
    if (major === 1) throw new Error('cbor: negative integers not allowed');
    const n = arg(info);
    if (major === 0) return n;
    if (major === 2 || major === 3) { need(n); const b = buf.subarray(o, o + n); o += n; return major === 2 ? Buffer.from(b) : new TextDecoder('utf-8', { fatal: true }).decode(b); }
    if (major === 4) { if (n > buf.length) throw new Error('cbor: truncated'); const a = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a; }
    if (major === 5) {
      if (n > buf.length) throw new Error('cbor: truncated');
      const m = Object.create(null); let prev = null;
      for (let i = 0; i < n; i++) {
        const k0 = o; const k = item(depth + 1); const kb = buf.subarray(k0, o);
        if (typeof k !== 'string') throw new Error('cbor: map keys must be text');
        if (prev && Buffer.compare(prev, kb) >= 0) throw new Error('cbor: map keys not strictly sorted (or duplicate)');
        prev = Buffer.from(kb); m[k] = item(depth + 1);
      }
      return m;
    }
    throw new Error('cbor: bad item');
  }
  const v = item(0);
  if (o !== buf.length) throw new Error('cbor: trailing bytes');
  return v;
}
