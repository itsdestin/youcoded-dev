// Cross-checks our two small layers against independent third-party libraries (dev-only, never shipped):
//  - CPace: ours vs `cpace-ts` (draft-21 X25519/SHA-512), both role assignments
//  - HPKE : ours vs `@hpke/core` (hpke-js), both directions
import assert from 'node:assert/strict';
import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { CPaceSession, G_X25519, sha512 } from 'cpace-ts';
import { randomBytes } from 'node:crypto';
import { CPace } from './cpace.mjs';
import { hpkeSeal, hpkeOpenSealed, x25519Public } from './hpke.mjs';

const prs = Buffer.from('48151623'), ci = Buffer.from('mesh-ci'), sid = randomBytes(16), ad = Buffer.alloc(0);
const suite = { name: 'CPACE-X25519-SHA512', group: G_X25519, hash: sha512 };
const mk = (role) => new CPaceSession({ prs, suite, mode: 'initiator-responder', role, ci, sid });
{ // theirs initiates, ours responds
  const t = mk('initiator'), o = new CPace({ prs, ci, sid, role: 'responder' });
  const m1 = await t.start();
  const iskO = o.finish({ Y: Buffer.from(m1.payload), AD: Buffer.from(m1.ad) });
  await t.receive({ type: 'msg', payload: o.Y, ad });
  assert.equal(Buffer.from(t.exportISK()).toString('hex'), iskO.toString('hex'));
  console.log('  ok  CPace: cpace-ts initiator <-> our responder: same 64-byte ISK');
}
{ // ours initiates, theirs responds
  const t = mk('responder'), o = new CPace({ prs, ci, sid, role: 'initiator' });
  const reply = await t.receive({ type: 'msg', payload: o.Y, ad });
  const iskO = o.finish({ Y: Buffer.from(reply.payload), AD: Buffer.from(reply.ad) });
  assert.equal(Buffer.from(t.exportISK()).toString('hex'), iskO.toString('hex'));
  console.log('  ok  CPace: our initiator <-> cpace-ts responder: same 64-byte ISK');
}
const hs = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Chacha20Poly1305() });
{ // ours seals, theirs opens
  const sk = randomBytes(32), pk = x25519Public(sk);
  const sealed = hpkeSeal(pk, Buffer.from('i'), Buffer.from('a'), Buffer.from('hello'));
  const priv = await hs.kem.importKey('raw', new Uint8Array(sk), false);
  const rctx = await hs.createRecipientContext({ recipientKey: priv, enc: new Uint8Array(sealed.subarray(0, 32)), info: Buffer.from('i') });
  const pt = await rctx.open(new Uint8Array(sealed.subarray(32)), Buffer.from('a'));
  assert.equal(Buffer.from(pt).toString(), 'hello');
  console.log('  ok  HPKE: ours seals -> hpke-js opens');
}
{ // theirs seals, ours opens
  const sk = randomBytes(32), pk = x25519Public(sk);
  const pub = await hs.kem.importKey('raw', new Uint8Array(pk), true);
  const sctx = await hs.createSenderContext({ recipientPublicKey: pub, info: Buffer.from('i') });
  const ct = await sctx.seal(Buffer.from('world'), Buffer.from('a'));
  assert.equal(hpkeOpenSealed(sk, Buffer.concat([Buffer.from(sctx.enc), Buffer.from(ct)]), Buffer.from('i'), Buffer.from('a')).toString(), 'world');
  console.log('  ok  HPKE: hpke-js seals -> ours opens');
}
