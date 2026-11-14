// CPACE-X25519-SHA512, initiator-responder setting, exactly per draft-irtf-cfrg-cpace-21
// (https://datatracker.ietf.org/doc/draft-irtf-cfrg-cpace/). Our own ~100 lines over audited primitives:
//   X25519 + Elligator2 from @noble/curves (audited), SHA-512 from node:crypto.
// WHY our own layer instead of the npm `cpace-ts`: that package is v0.1.6, one maintainer, unaudited; a layer this
// small that we can prove against the draft's own test vectors (test-vectors.mjs) is easier to trust than a
// dependency nobody has reviewed. Verified against the draft's Appendix B.1 vectors.
import { createHash, randomBytes } from 'node:crypto';
import { x25519, _map_to_curve_elligator2_curve25519 } from '@noble/curves/ed25519.js';

const P = (1n << 255n) - 19n;
const DSI = Buffer.from('CPace255');
const DSI_ISK = Buffer.from('CPace255_ISK');
const S_IN_BYTES = 128; // SHA-512 input block size
const sha512 = (b) => createHash('sha512').update(b).digest();

// ---- string helpers (draft appendix A.1-A.3) ----
export function prependLen(data) {
  let len = data.length; const out = [];
  for (;;) { if (len < 128) out.push(len); else out.push((len & 0x7f) + 0x80); len >>= 7; if (len === 0) break; }
  return Buffer.concat([Buffer.from(out), data]);
}
export const lvCat = (...args) => Buffer.concat(args.map((a) => prependLen(Buffer.from(a))));
export const transcriptIR = (Ya, ADa, Yb, ADb) => Buffer.concat([lvCat(Ya, ADa), lvCat(Yb, ADb)]);
export function generatorString(prs, ci, sid) {
  const lenZpad = Math.max(0, S_IN_BYTES - 1 - prependLen(prs).length - prependLen(DSI).length);
  return lvCat(DSI, prs, Buffer.alloc(lenZpad), ci, sid);
}

// ---- field math (BigInt; only used on the public generator derivation) ----
const mod = (a) => ((a % P) + P) % P;
function pow(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; } return r; }
const inv = (a) => pow(a, P - 2n);
const leToBig = (b) => b.reduce((acc, v, i) => acc | (BigInt(v) << (8n * BigInt(i))), 0n);
function bigToLe(n) { const out = Buffer.alloc(32); for (let i = 0; i < 32; i++) out[i] = Number((n >> (8n * BigInt(i))) & 0xffn); return out; }

/** Reference Elligator2 written straight from the draft's appendix A.5 (z = 2 for Curve25519). */
export function elligator2Reference(r) {
  const A = 486662n, z = 2n;
  const v = mod(-A * inv(1n + z * mod(r * r)));
  let eps = pow(mod(v * v * v + A * v * v + v), (P - 1n) / 2n);
  if (eps === P - 1n) eps = -1n;
  const x = mod(eps * v - (1n - eps) * A * inv(2n));
  return bigToLe(x);
}
/** Same map, via noble's RFC 9380 map_to_curve_elligator2_curve25519 (its name is marked "may be renamed": pin the version). */
export function elligator2Noble(r) {
  const { xMn, xMd } = _map_to_curve_elligator2_curve25519(r);
  return bigToLe(mod(xMn * inv(xMd)));
}

export function calculateGenerator(prs, ci, sid, map = elligator2Noble) {
  const genHash = sha512(generatorString(prs, ci, sid)).subarray(0, 32);
  const u = Buffer.from(genHash); u[31] &= 0x7f; // decodeUCoordinate: clear bit 255
  return map(leToBig(u));
}

const ZERO = Buffer.alloc(32);
/** scalar_mult_vfy: X25519, returns null for the neutral element (draft: MUST abort). */
export function scalarMultVfy(y, g) {
  let k;
  try { k = Buffer.from(x25519.scalarMult(y, g)); } catch { return null; } // noble throws on all-zero output
  return k.equals(ZERO) ? null : k;
}

/** One party. role: 'initiator' (sends first) or 'responder'. */
export class CPace {
  constructor({ prs, ci, sid, role, ad = Buffer.alloc(0), scalar }) {
    this.role = role; this.ad = Buffer.from(ad); this.sid = Buffer.from(sid);
    this.g = calculateGenerator(Buffer.from(prs), Buffer.from(ci), this.sid);
    this.y = scalar ?? randomBytes(32); // G_X25519.sample_scalar()
    this.Y = Buffer.from(x25519.scalarMult(this.y, this.g));
  }
  /** The message to send: { Y, AD }. */
  message() { return { Y: this.Y, AD: this.ad }; }
  /** Feed the peer's message; returns the 64-byte ISK, or null if the peer sent a low-order point (abort). */
  finish(peer) {
    const K = scalarMultVfy(this.y, peer.Y);
    if (!K) return null;
    const [Ya, ADa, Yb, ADb] = this.role === 'initiator' ? [this.Y, this.ad, peer.Y, peer.AD] : [peer.Y, peer.AD, this.Y, this.ad];
    return sha512(Buffer.concat([lvCat(DSI_ISK, this.sid, K), transcriptIR(Ya, ADa, Yb, ADb)]));
  }
}
