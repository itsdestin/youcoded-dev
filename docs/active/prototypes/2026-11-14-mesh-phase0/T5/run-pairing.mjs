// Pairing over a hostile in-memory pipe. Run: node run-pairing.mjs
// The pipe sees every message and may read, drop, replay, reorder and inject; E counts failures; nothing else is trusted.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { decode, encode } from './cbor.mjs';
import { Existing, NewDevice, MAX_FAILURES, typedCode } from './pairing.mjs';
import { newIdentity, newSetSecret, setIdFor, makeEntry, sealFrame, FrameReceiver } from './mesh-crypto.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { CPace } from './cpace.mjs';
const ciForTest = (mode) => Buffer.from(encode(['youcoded-mesh/v1/pair', mode]));
const sidForTest = (room) => createHash('sha256').update(Buffer.concat([Buffer.from('youcoded-mesh/v1/pair/sid\0'), room])).digest().subarray(0, 16);

const tOf = (b) => { try { return decode(b).t; } catch { return '?'; } };
const out = [];
const say = (s = '') => { console.log(s); out.push(s); };
const ok = (c, msg) => { assert.ok(c, msg); say('  ok  ' + msg); };

function makeSet(prompt = () => true) {
  const id = newIdentity('Desktop', 'linux');
  const setId = setIdFor(id.signKey);
  const state = { setId, secrets: new Map([[1, newSetSecret()]]), roster: [] };
  state.roster.push(makeEntry(id, { chat: null, kind: 'add', body: { name: id.name, platform: id.platform, signKey: id.signKey, agreeKey: id.agreeKey }, seen: [], at: 1 }));
  const prompts = [];
  const E = new Existing(id, state, { onAddPrompt: (info) => { prompts.push(info); return prompt(info); } });
  return { id, state, E, prompts };
}

/** Run N against E through a pipe. adv.mangle(item, ctx) -> items to actually deliver (default: pass through). */
function pipeRun(E, N, adv = {}) {
  const log = []; const q = [{ dir: 'N2E', conn: 'n1', bytes: N.start() }];
  let steps = 0;
  while (q.length && steps++ < 200) {
    const item = q.shift(); log.push(item);
    const deliver = adv.mangle ? adv.mangle(item, { log, q }) : [item];
    for (const d of deliver) {
      if (d.dir === 'N2E') for (const r of E.onMessage(d.conn, d.bytes)) q.push({ dir: 'E2N', conn: d.conn, bytes: r });
      else if (d.conn === 'n1') for (const r of N.onMessage(d.bytes)) q.push({ dir: 'N2E', conn: 'n1', bytes: r });
    }
  }
  return log;
}
/** The pipe-only attacker plays N itself against E with a guessed code. */
function attackerAttempt(E, guessSecret, mode, tag) {
  const A = new NewDevice(newIdentity('attacker'), { room: E.room, secret: guessSecret }, mode);
  let msgs = [A.start()];
  for (let i = 0; i < 10 && msgs.length; i++) { const next = []; for (const m of msgs) for (const r of E.onMessage(tag, m)) next.push(...A.onMessage(r)); msgs = next; }
  return A;
}

say('# T5 pairing prototype: output of run-pairing.mjs\n');

// ---------------- 1. honest typed-code pairing through a passive recording pipe ----------------
say('## 1. Typed code, honest devices, a pipe that records everything');
{
  const { E, state, prompts } = makeSet();
  const invite = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone', 'android'), { room: invite.room, secret: invite.secret }, 'code');
  const log = pipeRun(E, N);
  ok(N.result?.ok === true, 'pairing completes');
  ok(Buffer.from(N.result.isk).equals(E.sessionKeyForTest) && N.result.isk.length === 64, 'both sides derived the same 64-byte session key');
  ok(E.events.join(',') === 'pake1,confirm-ok,prompt,welcome-sent', 'event order on E: ' + E.events.join(' -> '));
  ok(E.events.indexOf('confirm-ok') < E.events.indexOf('prompt'), 'key confirmation happens BEFORE "Add this device?" is raised');
  ok(prompts.length === 1 && prompts[0].name === 'Phone', 'prompt shows the name only after confirmation');
  ok(N.result.secrets.get(1).equals(state.secrets.get(1)), 'set secret (generation 1) arrived, HPKE-sealed to the new device and opened');
  ok(N.result.roster.length === 2, 'roster delivered (genesis entry + the add for the new device), all signatures verified by N');
  const rx = new FrameReceiver({ setId: N.result.setId, secrets: N.result.secrets, roster: new Map([[state.roster[0].device.toString('hex'), { signKey: state.roster[0].body.signKey }]]) });
  const f = sealFrame({ S: state.secrets.get(1), setId: state.setId, gen: 1, id: E.id, session: randomBytes(16), counter: 0, group: 'chat:x', kind: 'lines', body: { ok: 1 } });
  ok(rx.open(f).body.ok === 1, 'a first real frame sealed by E opens on N with the delivered secret');
  const seen = Buffer.concat(log.map((l) => Buffer.from(l.bytes)));
  ok(!seen.includes(Buffer.from('Phone')) && !seen.includes(invite.secret) && !seen.includes(state.secrets.get(1)), 'the recording pipe saw none of: the device name, the code, the set secret');
  ok(E.used && !E.budgetLeft(), 'the code is single-use: spent after one success');
  const again = attackerAttempt(E, invite.secret, 'code', 'late');
  ok(again.result?.ok === false, 'the correct code replayed after use is refused');
}

// ---------------- 2. QR ----------------
say('\n## 2. QR pairing (128-bit secret + key fingerprint)');
{
  const { E, state } = makeSet(); const inv = E.openInvite('qr');
  const N = new NewDevice(newIdentity('Laptop'), inv, 'qr');
  pipeRun(E, N);
  ok(N.result?.ok && N.result.secrets.get(1).equals(state.secrets.get(1)), 'QR pairing completes and delivers the secret');
  const { E: E2 } = makeSet(); const inv2 = E2.openInvite('qr');
  const wrongFp = { ...inv2, fp: randomBytes(32) };   // QR shown for a different device than the one answering
  const N2 = new NewDevice(newIdentity('Laptop'), wrongFp, 'qr'); pipeRun(E2, N2);
  ok(N2.result?.ok === false && N2.result.why === 'fingerprint mismatch', 'a QR whose fingerprint does not match the answering device is refused by N');
}

// ---------------- 3. hostile pipe actions ----------------
say('\n## 3. A pipe that drops, replays, reorders and injects');
{ // drop the confirmation: nothing is ever shown to the user
  const { E, prompts } = makeSet(); const inv = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone'), inv, 'code');
  pipeRun(E, N, { mangle: (it) => (it.bytes && tOf(it.bytes) === 'cN' ? [] : [it]) });
  ok(prompts.length === 0 && N.result === null, 'dropping the confirmation: no prompt on E, no result on N (it just stays unpaired)');
}
{ // reorder: hello delivered before confirmation, confirmation delivered twice
  const { E, prompts } = makeSet(); const inv = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone'), inv, 'code'); const held = [];
  pipeRun(E, N, { mangle: (it) => { const t = tOf(it.bytes); if (t === 'cN') { held.push(it); return []; } return [it]; } });
  // inject the held confirmation twice, then a stale pake1 copy
  for (const h of held) { E.onMessage(h.conn, h.bytes); E.onMessage(h.conn, h.bytes); }
  ok(E.events.filter((e) => e === 'confirm-ok').length === 1 && prompts.length === 0 && N.result === null, 'a confirmation held back, then delivered late and twice: accepted exactly once (no double use)');
}
{ // inject garbage and a forged welcome into N
  const { E } = makeSet(); const inv = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone'), inv, 'code');
  pipeRun(E, N, { mangle: (it, { q }) => { if (it.dir === 'E2N' && tOf(it.bytes) === 'cE') { q.push({ dir: 'E2N', conn: 'n1', bytes: encode({ t: 'welcome', ct: randomBytes(300) }) }); q.push({ dir: 'E2N', conn: 'n1', bytes: randomBytes(50) }); } return [it]; } });
  ok(N.result?.ok === true, 'forged welcome and random bytes injected: ignored, the real welcome still completes pairing');
}
{ // replay a whole recorded honest session against a fresh code and against the same code
  const { E } = makeSet(); const inv = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone'), inv, 'code'); const log = pipeRun(E, N);
  const before = E.failures;
  for (const l of log.filter((x) => x.dir === 'N2E')) E.onMessage('replay', l.bytes);
  ok(E.failures === before && E.events.filter((e) => e === 'prompt').length === 1, 'replaying every recorded message to the (spent) code raises no second prompt');
  const { E: E2 } = makeSet(); E2.openInvite('code', 8);
  for (const l of log.filter((x) => x.dir === 'N2E')) E2.onMessage('replay', l.bytes);
  ok(E2.failures === 1 && !E2.events.includes('prompt') && !E2.events.includes('confirm-ok'), 'replaying a recorded session at a different fresh code counts 1 failure, shows nothing');
}

// ---------------- 4. online guessing ----------------
say('\n## 4. A pipe-only attacker guesses; the code burns after ' + MAX_FAILURES + ' failures counted on E');
{
  const { E, prompts } = makeSet(); const inv = E.openInvite('code', 8);
  const wrong = ['00000000', '11111111', '22222222'].filter((g) => g !== inv.secret.toString());
  const r = wrong.map((g, i) => attackerAttempt(E, Buffer.from(g), 'code', 'evil' + i));
  ok(r.every((a) => a.result?.ok === false), 'three wrong guesses all fail');
  ok(E.failures === MAX_FAILURES && E.burned, 'E counted ' + E.failures + ' failures and burned the code');
  const legit = new NewDevice(newIdentity('Phone'), { room: inv.room, secret: inv.secret }, 'code'); pipeRun(E, legit);
  ok(legit.result?.ok === false && legit.result.why === 'closed' && prompts.length === 0, 'afterwards even the CORRECT code is refused (burned); no prompt ever shown');
  ok(E.evaluated === 3, 'E evaluated exactly 3 confirmations in total (no 4th guess is ever checked)');
}
{ // parallel attempts cannot beat the budget
  const { E } = makeSet(); const inv = E.openInvite('code', 6);
  const attackers = Array.from({ length: 50 }, (_, i) => ({ A: new NewDevice(newIdentity('a'), { room: E.room, secret: Buffer.from(String(100000 + i)) }, 'code'), tag: 'p' + i }));
  const replies = attackers.map(({ A, tag }) => ({ A, tag, r: E.onMessage(tag, A.start()) })); // 50 opened at once
  const second = replies.map(({ A, tag, r }) => ({ tag, r: r.flatMap((m) => A.onMessage(m)) }));
  second.forEach(({ tag, r }) => r.forEach((m) => E.onMessage(tag, m)));
  ok(E.evaluated <= MAX_FAILURES, '50 simultaneous connections: only ' + E.evaluated + ' confirmations were ever evaluated');
  void inv;
}
{ // full MitM between a legitimate N and E; the attacker has no code
  const { E, prompts } = makeSet(); const inv = E.openInvite('code', 8);
  const N = new NewDevice(newIdentity('Phone'), inv, 'code');
  const mitmCp = new CPace({ prs: Buffer.from('99999999'), ci: ciForTest('code'), sid: sidForTest(inv.room), role: 'responder' });
  pipeRun(E, N, { mangle: (it) => {
    if (it.dir === 'N2E' && tOf(it.bytes) === 'pake1') {                       // intercept N: answer it ourselves with a guess ...
      mitmCp.finish({ Y: Buffer.from(decode(it.bytes).Y), AD: Buffer.alloc(0) });
      attackerAttempt(E, Buffer.from('12345678'), 'code', 'mitm-to-E');              // ... and try our own guess against E
      return [{ dir: 'E2N', conn: 'n1', bytes: encode({ t: 'pake2', Y: mitmCp.Y }) }];
    }
    return [];                                                                       // everything else N sends goes nowhere
  } });
  ok(E.failures === 1 && prompts.length === 0 && N.stage === 'await-cE', 'MitM with guessed codes: E counted 1 failure; N is stuck waiting for E\'s proof and has revealed nothing; no prompt');
}

// ---------------- 5. how big must the typed code be ----------------
say('\n## 5. Monte Carlo of the 3-guess attack on a deliberately tiny code (checks the theory with the real protocol)');
{
  const digits = 2, space = 10 ** digits, trials = 3000; let hits = 0; const t0 = performance.now();
  for (let t = 0; t < trials; t++) {
    const { E } = makeSet(); E.openInvite('code', digits);
    const guesses = new Set(); while (guesses.size < 3) guesses.add(String(Math.floor(Math.random() * space)).padStart(digits, '0'));
    let i = 0; for (const g of guesses) attackerAttempt(E, Buffer.from(g), 'code', 'mc' + i++);
    if (E.events.includes('confirm-ok')) hits++;
  }
  const exp = (3 / space) * trials, sd = Math.sqrt(trials * (3 / space) * (1 - 3 / space));
  say(`  ${digits}-digit code, ${trials} trials x 3 real protocol attempts: attacker won ${hits} times; theory 3/${space} = ${(100 * 3 / space).toFixed(2)}% -> ${exp.toFixed(0)} +/- ${sd.toFixed(1)} (${((performance.now() - t0) / (trials * 3)).toFixed(2)} ms per attempt)`);
  ok(Math.abs(hits - exp) < 4 * sd, 'measured win rate matches 3/N within 4 sigma');
}
say('\n  Probability that ONE attacker-visible code is guessed in 3 tries, by code size (3 / N):');
for (const [name, N_] of [['6 digits', 1e6], ['8 digits', 1e8], ['10 digits', 1e10], ['6 chars of the 32-letter alphabet (30 bits)', 32 ** 6], ['8 chars of the 32-letter alphabet (40 bits)', 32 ** 8]]) say(`    ${name.padEnd(46)} N=${N_.toExponential(2)}  P=${(3 / N_).toExponential(2)}  (1 in ${Math.round(N_ / 3).toLocaleString('en-US')})`);

// ---------------- 6. timing ----------------
say('\n## 6. Timing (this machine, node ' + process.version + '; both sides in one process, no network)');
function timeRuns(mode, n) {
  const tot = [], eT = [], nT = [];
  for (let i = 0; i < n; i++) {
    const { E } = makeSet(); const inv = E.openInvite(mode, 8); const N = new NewDevice(newIdentity('P', 'android'), inv, mode);
    let te = 0, tn = 0; const tStart = performance.now();
    let t = performance.now(); let msgs = [N.start()]; tn += performance.now() - t;
    const q = msgs.map((b) => ({ d: 'E', b }));
    while (q.length) { const it = q.shift(); const t1 = performance.now();
      if (it.d === 'E') { const r = E.onMessage('c', it.b); te += performance.now() - t1; r.forEach((b) => q.push({ d: 'N', b })); }
      else { const r = N.onMessage(it.b); tn += performance.now() - t1; r.forEach((b) => q.push({ d: 'E', b })); } }
    assert.ok(N.result?.ok); tot.push(performance.now() - tStart); eT.push(te); nT.push(tn);
  }
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { total: med(tot), existing: med(eT), newer: med(nT), max: Math.max(...tot) };
}
timeRuns('code', 20); // warm-up
for (const mode of ['code', 'qr']) { const r = timeRuns(mode, 200); say(`  ${mode.padEnd(4)} 200 pairings: median ${r.total.toFixed(1)} ms total (existing device ${r.existing.toFixed(1)} ms, new device ${r.newer.toFixed(1)} ms), worst ${r.max.toFixed(1)} ms`); }
{ // time-to-prompt cost excluding creating identities
  const t = performance.now(); for (let i = 0; i < 200; i++) newIdentity(); say(`  creating a device identity (Ed25519 + X25519 keys): ${((performance.now() - t) / 200).toFixed(2)} ms each`);
}
import('node:fs').then((fs) => fs.writeFileSync(new URL('./run-pairing.output.txt', import.meta.url), out.join('\n') + '\n'));
