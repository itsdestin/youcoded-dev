// HPKE (RFC 9180) base mode, one-shot Seal/Open, suite DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305
// built ONLY from Node built-ins (X25519, HMAC-SHA256, ChaCha20-Poly1305). ~70 lines, verified against RFC 9180 A.2.
// WHY not a library: the one-shot base mode is just three labelled HKDF calls and one DH; hpke-js (MIT, one maintainer,
// no published audit that we found) would add ~100 KB for the same thing. Interop with hpke-js is checked in interop-hpke.mjs.
import { createHmac, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, randomBytes } from 'node:crypto';

const PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const privKey = (raw) => createPrivateKey({ key: Buffer.concat([PKCS8, raw]), format: 'der', type: 'pkcs8' });
const pubKey = (raw) => createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' });
export const x25519Public = (sk) => createPublicKey(privKey(sk)).export({ format: 'der', type: 'spki' }).subarray(-32);
const dh = (sk, pk) => diffieHellman({ privateKey: privKey(sk), publicKey: pubKey(pk) }); // throws on all-zero output

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const i2osp2 = (n) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const SUITE_KEM = Buffer.concat([Buffer.from('KEM'), i2osp2(0x0020)]);
const SUITE = Buffer.concat([Buffer.from('HPKE'), i2osp2(0x0020), i2osp2(0x0001), i2osp2(0x0003)]);
const V1 = Buffer.from('HPKE-v1');
const labeledExtract = (salt, suite, label, ikm) => hmac(salt.length ? salt : Buffer.alloc(32), Buffer.concat([V1, suite, Buffer.from(label), ikm]));
function labeledExpand(prk, suite, label, info, L) {
  const full = Buffer.concat([i2osp2(L), V1, suite, Buffer.from(label), info]);
  let t = Buffer.alloc(0); const out = [];
  for (let i = 1; Buffer.concat(out).length < L; i++) { t = hmac(prk, Buffer.concat([t, full, Buffer.from([i])])); out.push(t); }
  return Buffer.concat(out).subarray(0, L);
}

function keySchedule(sharedSecret, info) {
  const pskIdHash = labeledExtract(Buffer.alloc(0), SUITE, 'psk_id_hash', Buffer.alloc(0));
  const infoHash = labeledExtract(Buffer.alloc(0), SUITE, 'info_hash', info);
  const ctx = Buffer.concat([Buffer.from([0]), pskIdHash, infoHash]); // mode 0 = base
  const secret = labeledExtract(sharedSecret, SUITE, 'secret', Buffer.alloc(0));
  return { key: labeledExpand(secret, SUITE, 'key', ctx, 32), nonce: labeledExpand(secret, SUITE, 'base_nonce', ctx, 12) };
}
function encapWith(skE, pkR) {
  const enc = x25519Public(skE);
  const kemCtx = Buffer.concat([enc, pkR]);
  const eaePrk = labeledExtract(Buffer.alloc(0), SUITE_KEM, 'eae_prk', dh(skE, pkR));
  return { enc, shared: labeledExpand(eaePrk, SUITE_KEM, 'shared_secret', kemCtx, 32) };
}
function aeadSeal(key, nonce, aad, pt) {
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  c.setAAD(aad); return Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
}
function aeadOpen(key, nonce, aad, ct) {
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAAD(aad); d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
}

export function hpkeSealDeterministic(pkR, info, aad, pt, skE) {
  const { enc, shared } = encapWith(skE, pkR);
  const { key, nonce } = keySchedule(shared, info);
  return { enc, ct: aeadSeal(key, nonce, aad, pt) };
}
/** Seal to a recipient's X25519 public key. Output = enc(32) || ciphertext||tag. A fresh ephemeral key is used each call. */
export function hpkeSeal(pkR, info, aad, pt) {
  const { enc, ct } = hpkeSealDeterministic(pkR, info, aad, pt, randomBytes(32));
  return Buffer.concat([enc, ct]);
}
export function hpkeOpen(skR, enc, info, aad, ct) {
  const pkR = x25519Public(skR);
  const eaePrk = labeledExtract(Buffer.alloc(0), SUITE_KEM, 'eae_prk', dh(skR, enc));
  const shared = labeledExpand(eaePrk, SUITE_KEM, 'shared_secret', Buffer.concat([enc, pkR]), 32);
  const { key, nonce } = keySchedule(shared, info);
  return aeadOpen(key, nonce, aad, ct);
}
export const hpkeOpenSealed = (skR, sealed, info, aad) => hpkeOpen(skR, sealed.subarray(0, 32), info, aad, sealed.subarray(32));
