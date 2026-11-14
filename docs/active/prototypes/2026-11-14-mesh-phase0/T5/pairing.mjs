// Pairing: QR (one-time 128-bit secret + key fingerprint) and typed short code, one protocol for both.
// Both run CPace (cpace.mjs) with PRS = the secret; the QR just has a secret too long to guess.
// Flow (N = new device, E = existing device in the set):
//   N->E pake1 {Y}        E->N pake2 {Y}
//   N->E confirmN {mac}   E checks mac (guess counted HERE, on E, before anything else is shown) -> E->N confirmE {mac}
//   N->E hello  (sealed under the session key: name, keys, proof of possession)       E asks the user "Add this device?"
//   E->N welcome (sealed under the session key: roster + set secret(s) HPKE-sealed to N's agreement key)
// Failure budget: 3 evaluated confirmations per code, counted on E, burn the code. A success also uses the code up.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { encode, decode } from './cbor.mjs';
import { CPace } from './cpace.mjs';
import { L, sha256, hkdf, hmac, ctEq, newIdentity, signWith, verifyWith, fingerprint, makeEntry, checkEntry, sealSecretTo, openSecret, setIdFor } from './mesh-crypto.mjs';

export const MAX_FAILURES = 3;
const te = (s) => Buffer.from(s);
const pairKeys = (isk, sid) => ({
  kcN: hkdf(isk, sid, te(L + 'pair/confirm-N')), kcE: hkdf(isk, sid, te(L + 'pair/confirm-E')),
  kNE: hkdf(isk, sid, te(L + 'pair/enc-N2E')), kEN: hkdf(isk, sid, te(L + 'pair/enc-E2N')),
});
const confirmMac = (k, who) => hmac(k, te(L + 'pair/confirm/' + who));
function seal(key, sid, dir, obj) {
  const c = createCipheriv('chacha20-poly1305', key, Buffer.alloc(12), { authTagLength: 16 }); // one message per key per direction
  c.setAAD(Buffer.concat([sid, te(dir)]));
  return Buffer.concat([c.update(encode(obj)), c.final(), c.getAuthTag()]);
}
function open(key, sid, dir, ct) {
  const d = createDecipheriv('chacha20-poly1305', key, Buffer.alloc(12), { authTagLength: 16 });
  d.setAAD(Buffer.concat([sid, te(dir)])); d.setAuthTag(ct.subarray(ct.length - 16));
  return decode(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]));
}
const sidFor = (room) => sha256(L + 'pair/sid\0', room).subarray(0, 16);
const ciFor = (mode) => Buffer.from(encode([L + 'pair', mode]));
// Proofs of possession, bound to THIS session through a hash of the PAKE output, so a signed blob cannot be reused elsewhere.
// N signs only its own keys (it does not know E's yet); E signs both, so E's proof also pins which new device it admitted.
const popNBytes = (isk, n) => Buffer.concat([te(L + 'pair-pop-N\0'), sha256(isk), n.signKey, n.agreeKey]);
const popEBytes = (isk, n, e) => Buffer.concat([te(L + 'pair-pop-E\0'), sha256(isk), n.signKey, n.agreeKey, e.signKey, e.agreeKey]);

/** The existing device. `state.secrets` is Map gen -> 32-byte set secret; `state.roster` is an array of entries. */
export class Existing {
  constructor(id, state, { onAddPrompt }) { this.id = id; this.state = state; this.onAddPrompt = onAddPrompt; this.events = []; this.conns = new Map(); }
  /** Make a one-time invite. mode 'qr' -> 128-bit secret; mode 'code' -> `digits` random decimal digits. */
  openInvite(mode, digits = 8) {
    this.mode = mode; this.failures = 0; this.burned = false; this.used = false; this.evaluated = 0;
    this.room = mode === 'qr' ? randomBytes(16) : randomBytes(4);   // meeting point: random, NEVER derived from the secret
    this.secret = mode === 'qr' ? randomBytes(16) : Buffer.from(typedCode(digits)); // uniform digits: see typedCode()
    return { room: this.room, secret: this.secret, fp: fingerprint(this.id.signKey, this.id.agreeKey) };
  }
  budgetLeft() { return !this.burned && !this.used && this.failures < MAX_FAILURES; }
  /** Feed one message from a connection (any connection: the pipe is hostile). Returns messages for that connection. */
  onMessage(conn, bytes) {
    let m; try { m = decode(bytes); } catch { return []; }
    let c = this.conns.get(conn);
    if (m.t === 'pake1') {
      if (!this.budgetLeft()) return [encode({ t: 'closed' })];
      if (this.conns.size >= 16) return [encode({ t: 'busy' })];        // bound memory; failures are counted only at confirmation
      const sid = sidFor(this.room);
      const cp = new CPace({ prs: this.secret, ci: ciFor(this.mode), sid, role: 'responder' });
      const isk = cp.finish({ Y: Buffer.from(m.Y), AD: Buffer.alloc(0) });
      if (!isk) { this.fail('low-order point'); return [encode({ t: 'rejected' })]; }
      this.conns.set(conn, { stage: 'await-confirm', sid, k: pairKeys(isk, sid), isk });
      this.events.push('pake1');
      return [encode({ t: 'pake2', Y: cp.Y })];
    }
    if (!c) return [];                                                  // out-of-order / injected: ignored, not counted
    if (m.t === 'cN' && c.stage === 'await-confirm') {
      if (!this.budgetLeft()) { this.conns.delete(conn); return [encode({ t: 'closed' })]; } // checked BEFORE evaluating: no 4th guess
      this.evaluated++;
      if (!ctEq(Buffer.from(m.mac), confirmMac(c.k.kcN, 'N'))) { this.conns.delete(conn); this.fail('bad confirmation'); return [encode({ t: 'rejected' })]; }
      this.used = true; this.sessionKeyForTest = c.isk;                  // (test hook only) one successful pairing per code
      c.stage = 'await-hello'; this.events.push('confirm-ok');
      return [encode({ t: 'cE', mac: confirmMac(c.k.kcE, 'E') })];
    }
    if (m.t === 'hello' && c.stage === 'await-hello') {
      let hi; try { hi = open(c.k.kNE, c.sid, 'N2E', Buffer.from(m.ct)); } catch { this.conns.delete(conn); return []; }
      const n = { signKey: Buffer.from(hi.signKey), agreeKey: Buffer.from(hi.agreeKey) };
      if (!verifyWith(n.signKey, popNBytes(c.isk, n), Buffer.from(hi.pop))) { this.conns.delete(conn); return []; }
      this.events.push('prompt');                                        // <- the only place "Add this device?" can be raised
      const approved = this.onAddPrompt({ name: hi.name, platform: hi.platform });
      this.conns.delete(conn);
      if (!approved) return [encode({ t: 'declined' })];
      const devId = sha256(L + 'device-id\0', n.signKey).subarray(0, 16);
      const add = makeEntry(this.id, { chat: null, kind: 'add', body: { name: hi.name, platform: hi.platform, signKey: n.signKey, agreeKey: n.agreeKey }, seen: this.state.roster.map((e) => e.id), at: Date.now() });
      this.state.roster.push(add);
      const secrets = {}; for (const [g, S] of this.state.secrets) secrets[g] = sealSecretTo(n.agreeKey, this.state.setId, g, S, this.id.devId, devId);
      const welcome = { setId: this.state.setId, roster: this.state.roster, secrets, signKey: this.id.signKey, agreeKey: this.id.agreeKey, name: this.id.name, platform: this.id.platform,
        pop: signWith(this.id, popEBytes(c.isk, n, this.id)) };
      this.events.push('welcome-sent');
      return [encode({ t: 'welcome', ct: seal(c.k.kEN, c.sid, 'E2N', welcome) })];
    }
    return [];
  }
  fail(why) { this.failures++; this.events.push('fail:' + why); if (this.failures >= MAX_FAILURES) { this.burned = true; this.events.push('burned'); } }
}

/** Uniform decimal code: rejection sampling so every digit is exactly 1/10. */
export function typedCode(digits) { let s = ''; while (s.length < digits) { const b = randomBytes(1)[0]; if (b < 250) s += String(b % 10); } return s; }

/** The new device. `invite` = what it got from the QR (room, secret, fp) or from the typed text (room, secret; fp undefined). */
export class NewDevice {
  constructor(id, invite, mode) { this.id = id; this.invite = invite; this.mode = mode; this.sid = sidFor(invite.room); this.cp = new CPace({ prs: invite.secret, ci: ciFor(mode), sid: this.sid, role: 'initiator' }); this.stage = 'start'; this.result = null; }
  start() { this.stage = 'await-pake2'; return encode({ t: 'pake1', Y: this.cp.Y }); }
  onMessage(bytes) {
    let m; try { m = decode(bytes); } catch { return []; }
    if (m.t === 'rejected' || m.t === 'closed' || m.t === 'busy') { this.stage = 'failed'; this.result = { ok: false, why: m.t }; return []; }
    if (m.t === 'pake2' && this.stage === 'await-pake2') {
      this.isk = this.cp.finish({ Y: Buffer.from(m.Y), AD: Buffer.alloc(0) });
      if (!this.isk) { this.stage = 'failed'; this.result = { ok: false, why: 'low-order' }; return []; }
      this.k = pairKeys(this.isk, this.sid); this.stage = 'await-cE';
      return [encode({ t: 'cN', mac: confirmMac(this.k.kcN, 'N') })];
    }
    if (m.t === 'cE' && this.stage === 'await-cE') {
      if (!ctEq(Buffer.from(m.mac), confirmMac(this.k.kcE, 'E'))) { this.stage = 'failed'; this.result = { ok: false, why: 'E failed confirmation' }; return []; }
      this.stage = 'await-welcome';
      // Only now, with the other side proven to hold the code, does this device reveal its name and keys.
      const pubs = { signKey: this.id.signKey, agreeKey: this.id.agreeKey };
      return [encode({ t: 'hello', ct: seal(this.k.kNE, this.sid, 'N2E', { name: this.id.name, platform: this.id.platform, ...pubs, pop: signWith(this.id, popNBytes(this.isk, pubs)) }) })];
    }
    if (m.t === 'declined' && this.stage === 'await-welcome') { this.stage = 'failed'; this.result = { ok: false, why: 'declined' }; return []; }
    if (m.t === 'welcome' && this.stage === 'await-welcome') {
      let w; try { w = open(this.k.kEN, this.sid, 'E2N', Buffer.from(m.ct)); } catch { return []; } // injected junk: ignored, still waiting
      const e = { signKey: Buffer.from(w.signKey), agreeKey: Buffer.from(w.agreeKey) };
      const fail = (why) => { this.stage = 'failed'; this.result = { ok: false, why }; return []; };
      if (this.invite.fp && !this.invite.fp.equals(fingerprint(e.signKey, e.agreeKey))) return fail('fingerprint mismatch');   // QR pin
      if (!verifyWith(e.signKey, popEBytes(this.isk, this.id, e), Buffer.from(w.pop))) return fail('E proof of possession');
      const entries = w.roster; const byDev = new Map();
      const eDev = sha256(L + 'device-id\0', e.signKey).subarray(0, 16).toString('hex'); byDev.set(eDev, e.signKey);
      for (const en of entries) { const signer = byDev.get(Buffer.from(en.device).toString('hex')); if (!signer || !checkEntry(en, signer)) return fail('bad roster entry'); if (en.kind === 'add') byDev.set(sha256(L + 'device-id\0', en.body.signKey).subarray(0, 16).toString('hex'), Buffer.from(en.body.signKey)); }
      if (!entries.some((en) => en.kind === 'add' && Buffer.from(en.body.signKey).equals(this.id.signKey))) return fail('roster does not contain me');
      const setId = Buffer.from(w.setId); const secrets = new Map();
      for (const [g, sealed] of Object.entries(w.secrets)) secrets.set(Number(g), openSecret(this.id.agreeSecret, Buffer.from(sealed), setId, Number(g), sha256(L + 'device-id\0', e.signKey).subarray(0, 16), this.id.devId));
      this.stage = 'done'; this.result = { ok: true, setId, secrets, roster: entries, isk: this.isk, ePub: e }; return [];
    }
    return [];
  }
}
void newIdentity; void setIdFor;
