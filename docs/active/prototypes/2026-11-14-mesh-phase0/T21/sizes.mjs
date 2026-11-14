// T21: attach blob sizes (git cat-file --batch-check, read-only) to rows. Usage: node sizes.mjs rows.json out.json
import fs from 'node:fs'; import { spawnSync } from 'node:child_process'; import os from 'node:os';
const rows = JSON.parse(fs.readFileSync(process.argv[2]));
const gd = os.homedir() + '/YouCoded/Personal/.youcoded/sync.git';
const r = spawnSync('git', ['--git-dir', gd, 'cat-file', '--batch-check'], { input: [...new Set(rows.map(x => x.blob))].join('\n') + '\n', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28, encoding: 'utf8' });
const sz = new Map(r.stdout.split('\n').filter(Boolean).map(l => { const [s, t, n] = l.split(' '); return [s, +n]; }));
for (const x of rows) x.size = sz.get(x.blob);
fs.writeFileSync(process.argv[3], JSON.stringify(rows));
const tot = rows.reduce((a, x) => a + (x.size || 0), 0);
console.log('rows', rows.length, 'missing', rows.filter(x => x.size == null).length, 'total GiB', (tot / 2 ** 30).toFixed(1));
