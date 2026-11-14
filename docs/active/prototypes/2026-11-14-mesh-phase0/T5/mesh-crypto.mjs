// The Phase 1 construction (T5 part C) as running code: identities, key derivation, frame sealing, roster entries,
// relay authentication, key generations. Node built-ins only (Ed25519, X25519, HKDF-SHA256, ChaCha20-Poly1305) plus
// our HPKE (hpke.mjs) and deterministic CBOR (cbor.mjs). Every label below is part of the wire format.
import { createHash, createHmac, createPrivateKey, createPublicKey, createCipheriv, createDecipheriv, generateKeyPairSync,
  hkdfSync, randomBytes, sign as edSign, verify as edVerify, timingSafeEqual } from 'node:crypto';
import { encode, decode } from './cbor.mjs';
import { hpkeSeal, hpkeOpenSealed, x25519Public } from './hpke.mjs';

export const L = 'youcoded-mesh/v1/';           // domain prefix on every hash, signature and KDF label
export const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest();
export const hkdf = (ikm, salt, info, len = 32) => Buffer.from(hkdfSync('sha256', ikm, salt, info, len));
export const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
export const ctEq = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };

// ---------- identity ----------
const ED_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export const edPub = (raw) => createPublicKey({ key: Buffer.concat([ED_SPKI, raw]), format: 'der', type: 'spki' });
export function newIdentity(name = 'device', platform = 'linux') {
  const { privateKey } = generateKeyPairSync('ed25519');
  const signSeed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const signKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
  const agreeSecret = randomBytes(32), agreeKey = x25519Public(agreeSecret);
  // deviceId is derived from the signing key: self-certifying, unrelated to the machine id and to analytics.
  const devId = sha256(L + 'device-id\0', signKey).subarray(0, 16);
  return { name, platform, signSeed, signKey: Buffer.from(signKey), agreeSecret, agreeKey: Buffer.from(agreeKey), devId };
}
export const signWith = (id, msg) => edSign(null, msg, createPrivateKey({ key: Buffer.concat([ED_PKCS8, id.signSeed]), format: 'der', type: 'pkcs8' }));
export const verifyWith = (pub, msg, sig) => { try { return edVerify(null, msg, edPub(pub), sig); } catch { return false; } };
export const fingerprint = (signKey, agreeKey) => sha256(L + 'fingerprint\0', signKey, agreeKey);

// ---------- key hierarchy: per generation, per purpose ----------
// S_G (32 random bytes) never encrypts anything directly. Everything is HKDF-SHA256(ikm=S_G, salt=setId, info=label...).
export const newSetSecret = () => randomBytes(32);
export const setIdFor = (firstSignKey) => sha256(L + 'room\0', firstSignKey);   // also the relay room name (5.6)
export function purposeKey(S, setId, gen, purpose, ...ctx) {
  return hkdf(S, setId, Buffer.concat([Buffer.from(L + purpose + '\0'), u32(gen), ...ctx.map(Buffer.from)]));
}
// purposes in use: 'frame' (ctx sender, session), 'register', 'roster-name', 'mailbox-hint'

// ---------- frames ----------
// outside header (readable, authenticated as AEAD associated data): everything the receiver needs to pick the key,
// and everything that must not be movable by a keeper. `seq` is NOT in it: the keeper assigns seq after sealing.
export function sealFrame({ S, setId, gen, id, session, counter, to = null, group, kind, body }) {
  const header = { v: 1, set: setId, to, group, gen, from: id.devId, session, counter, kind };
  const aad = encode(header);
  const bodyBytes = encode(body);
  // sign-then-encrypt: the signature covers header AND body, so a body cannot be lifted into another frame.
  const sig = signWith(id, Buffer.concat([Buffer.from(L + 'frame-sig\0'), u32(aad.length), aad, bodyBytes]));
  const key = purposeKey(S, setId, gen, 'frame', id.devId, session);
  const nonce = Buffer.concat([Buffer.alloc(4), u64(counter)]);      // key is unique per (generation, sender, session)
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(encode({ b: bodyBytes, s: sig })), c.final(), c.getAuthTag()]);
  return encode({ h: header, c: ct });
}
export class FrameReceiver {
  constructor({ setId, secrets, roster }) { this.setId = setId; this.secrets = secrets; this.roster = roster; this.seen = new Map(); }
  open(wire) {
    const { h, c } = decode(wire);
    if (!Buffer.from(h.set).equals(this.setId)) throw new Error('wrong set');
    const S = this.secrets.get(h.gen); if (!S) throw new Error('unknown generation');
    const signer = this.roster.get(Buffer.from(h.from).toString('hex')); if (!signer) throw new Error('signer not on roster (park)');
    const dupKey = Buffer.from(h.from).toString('hex') + '/' + Buffer.from(h.session).toString('hex');
    const sset = this.seen.get(dupKey) ?? new Set();
    if (sset.has(h.counter)) return { duplicate: true };
    const aad = encode(h);                                            // re-encode: deterministic, so it equals what was signed
    const key = purposeKey(S, this.setId, h.gen, 'frame', h.from, h.session);
    const d = createDecipheriv('chacha20-poly1305', key, Buffer.concat([Buffer.alloc(4), u64(h.counter)]), { authTagLength: 16 });
    d.setAAD(aad); d.setAuthTag(c.subarray(c.length - 16));
    const inner = decode(Buffer.concat([d.update(c.subarray(0, c.length - 16)), d.final()]));
    if (!verifyWith(signer.signKey, Buffer.concat([Buffer.from(L + 'frame-sig\0'), u32(aad.length), aad, inner.b]), inner.s)) throw new Error('bad signature');
    sset.add(h.counter); this.seen.set(dupKey, sset);                 // only AFTER authentication, so junk cannot poison the seen-set
    return { header: h, body: decode(inner.b) };
  }
}

// ---------- roster / control entries ----------
// id = SHA-256(label || canonical(fields without id and signature)); signature = Ed25519(label || id)
export function makeEntry(id, fields) {
  const rest = { ...fields, device: id.devId };
  const eid = sha256(L + 'entry\0', encode(rest));
  const signature = signWith(id, Buffer.concat([Buffer.from(L + 'entry-sig\0'), eid]));
  return { ...rest, id: eid, signature };
}
export function checkEntry(e, signKey) {
  const { id, signature, ...rest } = e;
  const want = sha256(L + 'entry\0', encode(rest));
  return ctEq(Buffer.from(id), want) && verifyWith(signKey, Buffer.concat([Buffer.from(L + 'entry-sig\0'), want]), Buffer.from(signature));
}

// ---------- sealing a secret to a device (generations) ----------
const keygenInfo = (setId, gen) => Buffer.concat([Buffer.from(L + 'keygen\0'), setId, u32(gen)]);
export const sealSecretTo = (agreeKey, setId, gen, S, fromDevId, toDevId) =>
  hpkeSeal(agreeKey, keygenInfo(setId, gen), Buffer.concat([fromDevId, toDevId]), S);
export const openSecret = (agreeSecret, sealed, setId, gen, fromDevId, toDevId) =>
  hpkeOpenSealed(agreeSecret, sealed, keygenInfo(setId, gen), Buffer.concat([fromDevId, toDevId]));

// ---------- relay authentication ----------
// Relay sends { aud, nonce }. Device checks aud === the host it dialled, then signs
//   L+'relay-auth\0' || canonical{ aud, room, nonce, dev }
// The relay checks: nonce is its own, unused, < 30 s old; room's roster holds `dev`'s key; signature valid.
export class RelayAuthServer {
  constructor(aud, rosters) { this.aud = aud; this.rosters = rosters; this.pending = new Map(); }
  challenge() { const nonce = randomBytes(32); this.pending.set(nonce.toString('hex'), Date.now()); return { aud: this.aud, nonce }; }
  verify(resp, now = Date.now()) {
    const k = Buffer.from(resp.nonce).toString('hex');
    const t = this.pending.get(k); this.pending.delete(k);              // single use, even on failure
    if (t === undefined || now - t > 30_000) return { ok: false, why: 'stale-or-unknown-nonce' };
    const roster = this.rosters.get(Buffer.from(resp.room).toString('hex'));
    const dev = roster?.get(Buffer.from(resp.dev).toString('hex'));
    if (!dev) return { ok: false, why: 'not-on-roster' };
    const msg = Buffer.concat([Buffer.from(L + 'relay-auth\0'), encode({ aud: this.aud, room: resp.room, nonce: resp.nonce, dev: resp.dev })]);
    return verifyWith(dev.signKey, msg, Buffer.from(resp.sig)) ? { ok: true, room: resp.room } : { ok: false, why: 'bad-signature' };
  }
}
export function answerRelayChallenge(id, dialledHost, room, ch) {
  if (ch.aud !== dialledHost) throw new Error('relay named a different host than the one dialled: abort');
  const msg = Buffer.concat([Buffer.from(L + 'relay-auth\0'), encode({ aud: ch.aud, room, nonce: ch.nonce, dev: id.devId })]);
  return { room, nonce: ch.nonce, dev: id.devId, sig: signWith(id, msg) };
}
