// Behavioural tests of the part C construction. Run: node test-mesh.mjs
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv } from 'node:crypto';
import { encode, decode } from './cbor.mjs';
import { newIdentity, newSetSecret, setIdFor, sealFrame, FrameReceiver, makeEntry, checkEntry, sealSecretTo, openSecret,
  RelayAuthServer, answerRelayChallenge, purposeKey, sha256 } from './mesh-crypto.mjs';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const A = newIdentity('A'), B = newIdentity('B'), C = newIdentity('C'), X = newIdentity('removed');
const setId = setIdFor(A.signKey), S1 = newSetSecret();
const roster = new Map([A, B, C, X].map((d) => [d.devId.toString('hex'), d]));
const sessA = randomBytes(16);
const mk = (o = {}) => sealFrame({ S: S1, setId, gen: 1, id: A, session: sessA, counter: 0, group: 'chat:v1', kind: 'lines', body: { lines: ['hello'] }, ...o });
const rx = () => new FrameReceiver({ setId, secrets: new Map([[1, S1]]), roster });

ok('frame round trip, signer authenticated', () => { const r = rx().open(mk()); assert.deepEqual(r.body.lines, ['hello']); });
ok('duplicate (sender, session, counter) is recognised and ignored', () => { const r = rx(); const f = mk(); r.open(f); assert.equal(r.open(f).duplicate, true); });
ok('keeper moves a frame to another group: AEAD associated data catches it', () => {
  const { h, c } = decode(mk()); const moved = encode({ h: { ...h, group: 'chat:v2' }, c });
  assert.throws(() => rx().open(moved));
});
ok('keeper changes recipient / generation / counter / kind: all rejected', () => {
  const { h, c } = decode(mk());
  for (const t of [{ to: Buffer.alloc(16, 1) }, { counter: 1 }, { kind: 'control' }, { session: randomBytes(16) }]) assert.throws(() => rx().open(encode({ h: { ...h, ...t }, c })), undefined, JSON.stringify(Object.keys(t)));
});
ok('same ciphertext replayed into a different set is rejected', () => {
  const other = new FrameReceiver({ setId: sha256('other'), secrets: new Map([[1, S1]]), roster });
  assert.throws(() => other.open(mk()));
});
ok('a member (holds S) cannot forge a frame in another device\'s name', () => {
  // B knows S1 and builds a frame claiming to be from A: header.from=A but signed by B
  const forged = sealFrame({ S: S1, setId, gen: 1, id: { ...B, devId: A.devId }, session: sessA, counter: 5, group: 'chat:v1', kind: 'lines', body: { lines: ['evil'] } });
  assert.throws(() => rx().open(forged), /bad signature/);
});
ok('unknown signer is reported as parkable, not accepted', () => {
  const Z = newIdentity('Z'); assert.throws(() => rx().open(sealFrame({ S: S1, setId, gen: 1, id: Z, session: sessA, counter: 0, group: 'g', kind: 'k', body: {} })), /park/);
});
ok('bit flip anywhere in the ciphertext is rejected; junk does not poison the seen-set', () => {
  const r = rx(); const f = Buffer.from(mk()); f[f.length - 3] ^= 1; assert.throws(() => r.open(f));
  assert.deepEqual(r.open(mk()).body.lines, ['hello']); // the genuine frame with the same counter still opens
});
ok('after a removal: new generation unreadable to the removed device; keygen sealed only to the remaining', () => {
  const S2 = newSetSecret();
  const sealedB = sealSecretTo(B.agreeKey, setId, 2, S2, A.devId, B.devId);
  const sealedC = sealSecretTo(C.agreeKey, setId, 2, S2, A.devId, C.devId);
  assert.deepEqual(openSecret(B.agreeSecret, sealedB, setId, 2, A.devId, B.devId), S2);
  assert.throws(() => openSecret(X.agreeSecret, sealedB, setId, 2, A.devId, B.devId));          // removed device cannot open B's blob
  assert.throws(() => openSecret(B.agreeSecret, sealedC, setId, 2, A.devId, C.devId));          // nor can B open C's
  assert.throws(() => openSecret(B.agreeSecret, sealedB, setId, 2, A.devId, C.devId));          // blob bound to recipient id
  const f2 = sealFrame({ S: S2, setId, gen: 2, id: A, session: sessA, counter: 0, group: 'g', kind: 'k', body: { n: 1 } });
  const removedView = new FrameReceiver({ setId, secrets: new Map([[1, S1]]), roster });
  assert.throws(() => removedView.open(f2), /unknown generation/);
  // S2 is independent random bytes, not derived from S1:
  assert.notDeepEqual(S2, purposeKey(S1, setId, 2, 'next'));
});
ok('per-purpose keys are all different, per generation too', () => {
  const ks = new Set(['frame', 'register', 'roster-name'].flatMap((p) => [1, 2].map((g) => purposeKey(S1, setId, g, p, A.devId, sessA).toString('hex'))));
  assert.equal(ks.size, 6);
});
ok('roster entry: id covers fields, signature covers id; any edit invalidates', () => {
  const e = makeEntry(A, { chat: null, kind: 'add', body: { name: 'B', signKey: B.signKey, agreeKey: B.agreeKey }, seen: [], at: 1 });
  assert.equal(checkEntry(e, A.signKey), true);
  assert.equal(checkEntry({ ...e, at: 2 }, A.signKey), false);
  assert.equal(checkEntry(e, B.signKey), false);
  // identical entry built twice has the identical id (Ed25519 is deterministic, but the id does not even depend on it)
  const e2 = makeEntry(A, { chat: null, kind: 'add', body: { name: 'B', signKey: B.signKey, agreeKey: B.agreeKey }, seen: [], at: 1 });
  assert.deepEqual(Buffer.from(e.id), Buffer.from(e2.id));
});
ok('relay auth: valid; replayed nonce; other room; other relay; non-member; stale', () => {
  const room = setId; const rosters = new Map([[room.toString('hex'), roster]]);
  const srv = new RelayAuthServer('relay.example', rosters);
  const resp = answerRelayChallenge(A, 'relay.example', room, srv.challenge());
  assert.equal(srv.verify(resp).ok, true);
  assert.equal(srv.verify(resp).why, 'stale-or-unknown-nonce');                                   // replay of a captured response
  const r2 = answerRelayChallenge(A, 'relay.example', room, srv.challenge());
  assert.equal(srv.verify({ ...r2, room: sha256('another room') }).ok, false);                    // cross-room confusion
  const evil = new RelayAuthServer('evil.example', rosters);
  assert.throws(() => answerRelayChallenge(A, 'relay.example', room, evil.challenge()));           // device refuses a relay that names another host
  const srv2 = new RelayAuthServer('relay.example', rosters);
  const r3 = answerRelayChallenge(A, 'relay.example', room, srv2.challenge());
  const wrongAud = new RelayAuthServer('relay2.example', rosters); wrongAud.pending = srv2.pending;
  assert.equal(wrongAud.verify(r3).ok, false);                                                     // signature made for one relay is useless at another
  const N = newIdentity('stranger'); const r4 = answerRelayChallenge(N, 'relay.example', room, srv.challenge());
  assert.equal(srv.verify(r4).why, 'not-on-roster');
  const r5 = answerRelayChallenge(A, 'relay.example', room, srv.challenge());
  assert.equal(srv.verify(r5, Date.now() + 31_000).why, 'stale-or-unknown-nonce');
});
ok('DEMONSTRATION: why the sender must NOT persist and restore (session, counter): nonce reuse leaks plaintext', () => {
  const key = randomBytes(32), nonce = Buffer.concat([Buffer.alloc(4), Buffer.alloc(8)]);
  const enc = (pt) => { const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 }); return Buffer.concat([c.update(pt), c.final()]); };
  const p1 = Buffer.from('attack at dawn!!'), p2 = Buffer.from('retreat at dusk!');
  const c1 = enc(p1), c2 = enc(p2);
  const xor = Buffer.from(c1.map((b, i) => b ^ c2[i])), want = Buffer.from(p1.map((b, i) => b ^ p2[i]));
  assert.deepEqual(xor, want); // ciphertext XOR = plaintext XOR: a restored counter after a backup restore would do exactly this
});
console.log(`\n${n} checks passed`);
