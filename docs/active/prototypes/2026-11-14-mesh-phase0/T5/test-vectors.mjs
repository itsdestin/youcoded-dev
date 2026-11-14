// Checks our crypto layers against PUBLISHED test vectors. Run: node test-vectors.mjs
//  - CPace draft-irtf-cfrg-cpace-21 Appendix B.1 (X25519 + SHA-512) incl. low-order-point vectors B.1.10
//  - RFC 9180 Appendix A.2 (HPKE base mode, DHKEM(X25519,HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305)
//  - RFC 8949 Appendix A samples for the deterministic CBOR subset
import assert from 'node:assert/strict';
import { CPace, calculateGenerator, elligator2Reference, elligator2Noble, generatorString, lvCat, prependLen, scalarMultVfy, transcriptIR } from './cpace.mjs';
import { hpkeSealDeterministic, hpkeOpen, hpkeSeal, hpkeOpenSealed, x25519Public } from './hpke.mjs';
import { encode, decode } from './cbor.mjs';
import { randomBytes } from 'node:crypto';

const hex = (h) => Buffer.from(h.replace(/\s+/g, ''), 'hex');
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// ---------- CPace B.1 ----------
const PRS = Buffer.from('Password');
const CI = hex('0b415f696e69746961746f720b425f726573706f6e646572');
const sid = hex('7e4b4791d6a8ef019b936c79fb7f2c57');
ok('B.1.1 generator_string (170 bytes)', () => {
  const gs = generatorString(PRS, CI, sid);
  assert.equal(gs.length, 170);
  assert.equal(gs.subarray(0, 28).toString('hex'), '0843506163653235350850617373776f72646d000000000000000000'.slice(0, 56));
});
ok('B.1.1 generator g (noble Elligator2)', () => {
  assert.equal(calculateGenerator(PRS, CI, sid).toString('hex'), 'd04bf6d41f6a289632a2e929fa29bebd51092512a7829fdde7d314b62f05a73f');
});
ok('B.1.1 generator g (reference Elligator2 from draft A.5)', () => {
  assert.equal(calculateGenerator(PRS, CI, sid, elligator2Reference).toString('hex'), 'd04bf6d41f6a289632a2e929fa29bebd51092512a7829fdde7d314b62f05a73f');
});
ok('Elligator2: noble == reference on 2000 random inputs', () => {
  for (let i = 0; i < 2000; i++) {
    const r = BigInt('0x' + randomBytes(32).toString('hex')) & ((1n << 255n) - 1n);
    assert.equal(elligator2Noble(r).toString('hex'), elligator2Reference(r).toString('hex'));
  }
});
const ya = hex('21b4f4bd9e64ed355c3eb676a28ebedaf6d8f17bdc365995b319097153044080');
const yb = hex('848b0779ff415f0af4ea14df9dd1d3c29ac41d836c7808896c4eba19c51ac40a');
const A = new CPace({ prs: PRS, ci: CI, sid, role: 'initiator', ad: Buffer.from('ADa'), scalar: ya });
const B = new CPace({ prs: PRS, ci: CI, sid, role: 'responder', ad: Buffer.from('ADb'), scalar: yb });
ok('B.1.2 Ya', () => assert.equal(A.Y.toString('hex'), '1d13c89278cdadd826f6d8d7f887701430f8380ddc17611cdd6dc989ce0c9f32'));
ok('B.1.3 Yb', () => assert.equal(B.Y.toString('hex'), '248cccf6d5cdc3646f0ad593f9e6cef4e69d4945f8372e623512ecea32185623'));
ok('B.1.4 K both ways', () => {
  const k = '5b067effbdc0b2a0e1d907b21ebb25cfedb96a852179a847c37e43ee71322c6b';
  assert.equal(scalarMultVfy(ya, B.Y).toString('hex'), k);
  assert.equal(scalarMultVfy(yb, A.Y).toString('hex'), k);
});
ok('B.1.5 transcript_ir', () => assert.equal(transcriptIR(A.Y, Buffer.from('ADa'), B.Y, Buffer.from('ADb')).toString('hex'),
  '201d13c89278cdadd826f6d8d7f887701430f8380ddc17611cdd6dc989ce0c9f320341446120248cccf6d5cdc3646f0ad593f9e6cef4e69d4945f8372e623512ecea3218562303414462'));
ok('B.1.5 ISK (both parties, 64 bytes)', () => {
  const want = '6e19b875f7a561d6b3ca3dbb9ef42ac55de3e717881018204b8922b4d5e53bb2aa82c300bea7b65d2b671da71922ddf6472301b79bc270adfa8bf413285f2263';
  assert.equal(A.finish(B.message()).toString('hex'), want);
  assert.equal(B.finish(A.message()).toString('hex'), want);
});
ok('A.1 prepend_len / lv_cat vectors', () => {
  assert.equal(prependLen(Buffer.alloc(0)).toString('hex'), '00');
  assert.equal(prependLen(Buffer.from('1234')).toString('hex'), '0431323334');
  assert.equal(prependLen(Buffer.from([...Array(128).keys()])).subarray(0, 3).toString('hex'), '800100');
  assert.equal(lvCat(Buffer.from('1234'), Buffer.from('5'), Buffer.alloc(0), Buffer.from('678')).toString('hex'), '043132333401350003363738');
});
ok('B.1.10 low-order points: q0..qb exact, abort on u0-u5,u7', () => {
  const s = hex('af46e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449aff');
  const u = ['0000000000000000000000000000000000000000000000000000000000000000', '0100000000000000000000000000000000000000000000000000000000000000',
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
    '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157', 'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'daffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'dbffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'd9ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    'cdeb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b880', '4c9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f11d7'];
  const q = [null, null, null, null, null, null, 'd8e2c776bbacd510d09fd9278b7edcd25fc5ae9adfba3b6e040e8d3b71b21806', null,
    'c85c655ebe8be44ba9c0ffde69f2fe10194458d137f09bbff725ce58803cdb38', 'db64dafa9b8fdd136914e61461935fe92aa372cb056314e1231bc4ec12417456',
    'e062dcd5376d58297be2618c7498f55baa07d7e03184e8aada20bca28888bf7a', '993c6ad11c4c29da9a56f7691fd0ff8d732e49de6250b6c2e80003ff4629a175'];
  u.forEach((h, i) => {
    const got = scalarMultVfy(s, hex(h));
    assert.equal(got ? got.toString('hex') : null, q[i], 'u' + i.toString(16));
  });
});
ok('a malicious low-order Y makes finish() abort', () => {
  const a = new CPace({ prs: PRS, ci: CI, sid, role: 'initiator' });
  assert.equal(a.finish({ Y: Buffer.alloc(32), AD: Buffer.alloc(0) }), null);
});
ok('different password gives a different ISK', () => {
  const a = new CPace({ prs: Buffer.from('1234'), ci: CI, sid, role: 'initiator' });
  const b = new CPace({ prs: Buffer.from('1235'), ci: CI, sid, role: 'responder' });
  assert.notEqual(a.finish(b.message()).toString('hex'), b.finish(a.message()).toString('hex'));
});

// ---------- HPKE RFC 9180 A.2 ----------
ok('RFC 9180 A.2.1 base mode: enc, shared secret path, ct for seq 0 (deterministic ephemeral)', () => {
  const info = hex('4f6465206f6e2061204772656369616e2055726e');
  const skEm = hex('f4ec9b33b792c372c1d2c2063507b684ef925b8c75a42dbcbf57d63ccd381600');
  const pkRm = hex('4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a');
  const skRm = hex('8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb');
  const pt = hex('4265617574792069732074727574682c20747275746820626561757479');
  const aad = hex('436f756e742d30');
  const { enc, ct } = hpkeSealDeterministic(pkRm, info, aad, pt, skEm);
  assert.equal(enc.toString('hex'), '1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a');
  assert.equal(ct.toString('hex'), '1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28');
  assert.equal(hpkeOpen(skRm, enc, info, aad, ct).toString('hex'), pt.toString('hex'));
});
ok('HPKE random round trip + tamper / wrong AAD / wrong key rejected', () => {
  const sk = randomBytes(32), pk = x25519Public(sk);
  const sealed = hpkeSeal(pk, Buffer.from('info'), Buffer.from('aad'), Buffer.from('secret'));
  assert.equal(hpkeOpenSealed(sk, sealed, Buffer.from('info'), Buffer.from('aad')).toString(), 'secret');
  const t = Buffer.from(sealed); t[40] ^= 1;
  assert.throws(() => hpkeOpenSealed(sk, t, Buffer.from('info'), Buffer.from('aad')));
  assert.throws(() => hpkeOpenSealed(sk, sealed, Buffer.from('info'), Buffer.from('other')));
  assert.throws(() => hpkeOpenSealed(randomBytes(32), sealed, Buffer.from('info'), Buffer.from('aad')));
});

// ---------- deterministic CBOR (RFC 8949 Appendix A samples) ----------
ok('CBOR: RFC 8949 Appendix A samples (ints, bytes, text, arrays, maps)', () => {
  const s = [[0, '00'], [1, '01'], [10, '0a'], [23, '17'], [24, '1818'], [25, '1819'], [100, '1864'], [1000, '1903e8'], [1000000, '1a000f4240'],
    [4294967296, '1b0000000100000000'], [Buffer.from('01020304', 'hex'), '4401020304'], ['', '60'], ['a', '6161'], ['IETF', '6449455446'],
    ['ü', '62c3bc'], [[], '80'], [[1, 2, 3], '83010203'], [[1, [2, 3], [4, 5]], '8301820203820405'], [false, 'f4'], [true, 'f5'], [null, 'f6']];
  for (const [v, h] of s) assert.equal(encode(v).toString('hex'), h, JSON.stringify(v));
  assert.equal(encode({ a: 1, b: [2, 3] }).toString('hex'), 'a26161016162820203');
  // keys are sorted bytewise-lexicographically by encoding, regardless of insertion order:
  assert.equal(encode({ b: 1, a: 2 }).toString('hex'), encode({ a: 2, b: 1 }).toString('hex'));
  assert.equal(encode({ aa: 1, b: 2 }).toString('hex'), 'a2616202626161' + '01'); // shorter key first: "b" (0x61 62) < "aa" (0x62 61 61)
});
ok('CBOR: decoder rejects every non-canonical form', () => {
  const bad = ['1800', '1900ff', '1a000000ff', 'a2616202616101', 'a1616101616101', '9f01ff', 'fb3ff0000000000000', 'f97e00', 'c11a514b67b0', '5f4101ff', '3800'];
  for (const h of bad) assert.throws(() => decode(hex(h)), undefined, h);
  assert.throws(() => decode(hex('0100')), /trailing/);
  assert.deepEqual({ ...decode(encode({ x: [1, 'a', Buffer.from('ff', 'hex')], y: null })) }, { x: [1, 'a', Buffer.from('ff', 'hex')], y: null });
});

console.log(`\n${passed} checks passed`);
