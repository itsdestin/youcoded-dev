// scripts/perf-lab/summarise-profile.mjs — rank a V8 .cpuprofile by self time.
//
//   node scripts/perf-lab/summarise-profile.mjs <file.cpuprofile> [--top 25] [--grep <regex>]
//
// The same fold profile-open.mjs uses (selfTimes + subsystem buckets), for a
// profile any scenario wrote — today scenario-native-stream's PERF_LAB_PROFILE_LEGS.
// Two profiles of the same leg on two builds, read side by side, name the function
// a busy-time delta came from; the counters alone cannot.
import { readFileSync } from 'node:fs';
import { buckets, selfTimes } from './profile-open.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: node scripts/perf-lab/summarise-profile.mjs <file.cpuprofile> [--top N] [--grep regex]'); process.exit(2); }
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const top = Number(opt('top', 25));
const grep = opt('grep', null);

const profile = JSON.parse(readFileSync(file, 'utf8'));
const rows = selfTimes(profile);
const total = rows.reduce((s, r) => s + r.ms, 0);
const wallMs = (profile.endTime - profile.startTime) / 1000;
console.log(`${file}\n  ${Math.round(wallMs)} ms wall, ${Math.round(total)} ms sampled\n  by subsystem:`);
for (const b of buckets(rows)) console.log(`    ${b.name.padEnd(48)} ${String(Math.round(b.ms)).padStart(7)} ms  ${String(Math.round(b.ms / total * 100)).padStart(3)}%`);
console.log(`  top ${top} by self time${grep ? ` matching /${grep}/` : ''}:`);
const shown = (grep ? rows.filter((r) => new RegExp(grep, 'i').test(r.name)) : rows).slice(0, top);
for (const r of shown) console.log(`    ${String(Math.round(r.ms)).padStart(7)} ms  ${r.name}`);
