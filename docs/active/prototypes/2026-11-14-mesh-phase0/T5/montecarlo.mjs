// Monte Carlo of the 3-guess attack with the REAL protocol on tiny codes. Run: node montecarlo.mjs
import { Existing, NewDevice } from './pairing.mjs';
import { newIdentity, newSetSecret, setIdFor, makeEntry } from './mesh-crypto.mjs';
const id = newIdentity('Desktop'); const setId = setIdFor(id.signKey);
const mk = () => new Existing(id, { setId, secrets: new Map([[1, newSetSecret()]]), roster: [] }, { onAddPrompt: () => true });
for (const [digits, trials] of [[1, 2000], [2, 6000]]) {
  const space = 10 ** digits; let hits = 0;
  for (let t = 0; t < trials; t++) {
    const E = mk(); E.openInvite('code', digits);
    const g = new Set(); while (g.size < Math.min(3, space)) g.add(String(Math.floor(Math.random() * space)).padStart(digits, '0'));
    let i = 0;
    for (const guess of g) {
      const A = new NewDevice(newIdentity('x'), { room: E.room, secret: Buffer.from(guess) }, 'code'); let msgs = [A.start()];
      for (let k = 0; k < 6 && msgs.length; k++) { const nx = []; for (const m of msgs) for (const r of E.onMessage('a' + i, m)) nx.push(...A.onMessage(r)); msgs = nx; }
      i++; if (E.events.includes('confirm-ok')) break;
    }
    if (E.events.includes('confirm-ok')) hits++;
  }
  const p = 3 / space, exp = p * trials, sd = Math.sqrt(trials * p * (1 - p));
  console.log(`${digits}-digit code: ${trials} trials, attacker won ${hits}; theory 3/${space} -> ${exp.toFixed(0)} +/- ${sd.toFixed(1)} (${((hits - exp) / sd).toFixed(2)} sigma)`);
}
