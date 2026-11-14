// Named, hand-written minimal traces, each run under LITERAL (design text as written) and FIXED (proposed rules).
// usage: node scripts: node scenarios.mjs [name]
import { LITERAL, FIXED } from './profiles.mjs';
import { gen, makeWorld, applyEvent, settle, check, view, C, fmtEvent } from './sim.mjs';
const s6 = (x) => (x ? String(x).slice(0, 6) : x);
const mk = (n, copies, ranHere, rules) => ({ n, skews: [0, 86400000, 30 * 86400000, -86400000, 5 * 86400000].slice(0, n), copies: [null, ...copies], ranHere: [true, ...ranHere], rules });
const sc = {};
const add = (name, title, cfgf, events, show) => { sc[name] = { title, cfgf, events, show }; };

add('S1-loser-reply', 'Old claimant writes a reply before it hears a longer copy exists',
  (r) => mk(3, ['longer', 'none'], [false, false], r), [{ t: 'write', d: 0, k: 1, fin: true }]);
add('S2-three-claims', 'Shortest copy is a prefix of two copies that differ from each other',
  (r) => mk(3, ['longer', 'longer'], [false, false], r), []);
add('S3-split-forgotten', 'Two claims differ, then a takeover that has seen both',
  (r) => mk(3, ['diff', 'none'], [true, false], r),
  [{ t: 'sync', a: 0, b: 2, frac: 1, lines: true, full: true, seed: 1 }, { t: 'sync', a: 1, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'relate', d: 2 }, { t: 'part', groups: [0, 1, 1] }, { t: 'takeover', d: 2, why: 'off' }]);
add('S4-relation-by-removed', 'The only holder of the longer copy is removed; its relation is void',
  (r) => gen(80, { rules: r }).cfg,
  [{ t: 'remove', d: 0, target: 2 }, { t: 'sync', d: 3, a: 2, b: 0, frac: 1, lines: true, full: true, seed: 1 }, { t: 'sync', d: 2, a: 0, b: 1, frac: 0.7, lines: true, full: true, seed: 2 }, { t: 'remove', d: 1, target: 0 }]);
add('S5-pending-dead-end', 'Device sees two claims, holds neither longer copy, both holders away',
  (r) => mk(3, ['longer', 'none'], [false, false], r),
  [{ t: 'part', groups: [0, 1, 2] }, { t: 'heal' }, { t: 'sync', a: 0, b: 2, frac: 1, lines: false, seed: 1 }, { t: 'sync', a: 1, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'part', groups: [0, 1, 2] }, { t: 'takeover', d: 2, why: 'off' }], 'pending');
add('S6-delete-vs-split', 'Chat deleted on a device that did not know a second version existed',
  (r) => mk(3, ['diff', 'none'], [true, false], r), [{ t: 'delete', d: 0 }]);
add('S7-chip-vs-offline', 'Chip switch (host fenced) races a host-offline takeover from an older copy',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: true, full: true, seed: 1 }, { t: 'sync', a: 0, b: 2, frac: 1, lines: true, full: true, seed: 2 }, { t: 'write', d: 0, k: 2, fin: true }, { t: 'sync', a: 0, b: 1, frac: 1, lines: true, full: true, seed: 3 },
    { t: 'part', groups: [0, 0, 1] }, { t: 'takeover', d: 1, why: 'chip' }, { t: 'takeover', d: 2, why: 'off' }, { t: 'write', d: 2, k: 2, fin: true }]);
add('S8-id-instability', 'A version id seen in the middle is gone at the end (third concurrent claim arrives)',
  (r) => gen(45, { rules: r }).cfg, [{ t: 'sync', a: 1, b: 2, frac: 0.3, lines: false, seed: 1 }, { t: 'relate', d: 2 }], 'ids');
add('S9-add-voided', 'Remover had not seen the removed device\'s add of another device (tablet pairs through the old laptop)',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'remove', d: 1, target: 0 }, { t: 'sync', a: 2, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'sync', a: 1, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'sync', a: 2, b: 1, frac: 1, lines: false, seed: 3 }], 'members');
add('S10-restore-names-one', 'Two devices delete, a third restores after seeing both',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'sync', a: 0, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'delete', d: 1 }, { t: 'delete', d: 2 }, { t: 'sync', a: 1, b: 0, frac: 1, lines: false, seed: 3 }, { t: 'sync', a: 2, b: 0, frac: 1, lines: false, seed: 4 }, { t: 'restore', d: 0 }]);
add('S11-format-concurrent', 'Two concurrent minimum-app-version entries (1 and 3)',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'format', d: 0, v: 3 }, { t: 'format', d: 1, v: 1 }], 'format');
add('S12-takeover-from-behind', 'A device 2 lines behind takes over; the old host kept writing (the ordinary T13 case)',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'write', d: 0, k: 2, fin: true }, { t: 'write', d: 0, k: 2, fin: true }, { t: 'sync', a: 0, b: 1, frac: 1, lines: true, full: true, seed: 2 }, { t: 'write', d: 0, k: 2, fin: true }, { t: 'part', groups: [0, 1, 1] }, { t: 'takeover', d: 1, why: 'off' }, { t: 'write', d: 1, k: 2, fin: true }]);

add('S13-delete-vs-takeover', 'Chat deleted on the phone while the tablet takes over and the old host finishes a reply',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: true, full: true, seed: 1 }, { t: 'sync', a: 0, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'part', groups: [0, 1, 2] },
    { t: 'takeover', d: 1, why: 'off' }, { t: 'write', d: 0, k: 2, fin: true }, { t: 'delete', d: 2 }, { t: 'write', d: 1, k: 2, fin: true }]);
add('S14-restore-after-delete-race', 'Delete and restore of the same chat made on two devices at once',
  (r) => mk(3, ['none', 'none'], [false, false], r),
  [{ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'delete', d: 0 }, { t: 'sync', a: 0, b: 2, frac: 1, lines: false, seed: 2 }, { t: 'restore', d: 2 }, { t: 'delete', d: 1 }]);

export function runScenario(name, rules, quiet) {
  const { cfgf, events, show } = sc[name];
  const w = makeWorld(cfgf(rules));
  const mids = [];
  const memTrace = [];
  for (const ev of events) { applyEvent(w, ev); if (show === 'members') memTrace.push(JSON.stringify(view(w, w.devs[1]).members) + ' parked=' + view(w, w.devs[1]).parked.length); }
  const early = w.devs.map((d) => (d.active ? view(w, d) : null));
  const r = settle(w);
  const f = check(w);
  const v = view(w, w.devs[0]); const V = v.chats[C];
  const out = { settled: r >= 0, fails: [...new Set(f.map((x) => x.prop))], versions: Object.entries(V.versions).map(([k, x]) => [k === C ? 'main' : s6(k), x.tail ? 'tail-version up to ' + x.upTo : x.host === 'pending' ? 'PENDING' : 'host ' + x.host, x.deleted ? 'DELETED' : 'live', x.minVersion != null ? 'minApp ' + x.minVersion : undefined].filter(Boolean)), tails: V.tails.map((t) => [s6(t.entry), t.owner, t.loser ? 'loser' : 'prev-host', t.fate]), contradictions: V.contradictions.length };
  if (show === 'ids') out.idsSeenMidRun = [...w.seenVersionIds].map(s6);
  if (show === 'members') { out.membersAtEnd = v.members; out.phoneViewAfterEachEvent = memTrace; }
  if (show === 'pending') { const e = early[2]; out.deviceTwoView = e.chats[C].versions[C].host; out.deviceTwoCanTakeOver = !!w.devs[2].pool && [...w.devs[2].pool.values()].some((x) => x.kind === 'takeover'); }
  if (!quiet) console.log(JSON.stringify(out));
  return { out, w, f };
}
export const SC = sc;
if (process.argv[1].endsWith('scenarios.mjs')) {
  const only = process.argv[2];
  for (const name of Object.keys(sc)) {
    if (only && name !== only) continue;
    console.log('\n## ' + name + ': ' + sc[name].title);
    console.log(' events: ' + sc[name].events.map(fmtEvent).join(' ; '));
    process.stdout.write(' LITERAL '); runScenario(name, LITERAL);
    process.stdout.write(' FIXED   '); runScenario(name, FIXED);
  }
}
