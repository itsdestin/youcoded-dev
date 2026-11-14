import { ablate as profile } from './profiles.mjs';
import { gen, makeWorld, applyEvent, fmtEvent, view, C } from './sim.mjs';
import { shrink } from './shrink.mjs';
const seed = Number(process.argv[2]); const prop = process.argv[3]; const rules = profile(process.argv); const wide = process.argv.includes('--wide');
const { cfg, events } = gen(seed, { rules, wide }); const min = shrink(cfg, events, prop);
const w = makeWorld(cfg);
for (const ev of min) { applyEvent(w, ev); console.log(fmtEvent(ev)); for (const d of w.devs) console.log('   ', d.id, d.chain.map(l=>l.id).join(' '), '| tails', JSON.stringify(Object.entries(d.tails).map(([k,t])=>[k.slice(0,4),t.map(l=>l.id).join('/')])), '| lost', JSON.stringify(Object.entries(d.lost||{}).map(([k,t])=>[k.slice(0,4),t.map(l=>l.id).join('/')]))); }
