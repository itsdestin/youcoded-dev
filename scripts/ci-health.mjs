#!/usr/bin/env node
// CI health at a glance — what the 2026-09-16 review had to reconstruct by hand
// (about 25 `gh run list/view` calls) and four earlier sessions each redid.
//
//   node scripts/ci-health.mjs [--repo itsdestin/youcoded] [--workflow "Desktop CI"] [--limit 60] [--logs 6]
//
// Prints, per workflow, pass/fail counts and the mean duration over the last
// --limit runs, then reads the failed-step logs of the newest --logs failed runs
// of --workflow and tallies which tests failed on which operating system. A run
// still in progress is reported as such — `gh run view --log-failed` returns an
// EMPTY log for one, which cost two wasted calls twice on 2026-09-16.
//
// WHY the ^[ handling: gh prints colour codes as the literal two characters ^[
// (caret, bracket), not an ESC byte; a plain ANSI strip leaves every line
// coloured and every FAIL line unmatched.
import { execFileSync } from 'node:child_process';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const repo = arg('--repo', 'itsdestin/youcoded');
const workflow = arg('--workflow', 'Desktop CI');
const limit = Number(arg('--limit', '60'));
const logs = Number(arg('--logs', '6'));
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
const strip = (s) => s.replace(/(\x1b|\^\[)\[[0-9;]*[A-Za-z]/g, '');

const runs = JSON.parse(gh(['run', 'list', '-R', repo, '--limit', String(limit), '--json', 'databaseId,name,conclusion,status,createdAt,updatedAt,headBranch,event']));
const byName = new Map();
for (const r of runs) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r); }
console.log(`${repo} — last ${runs.length} runs (${runs.at(-1)?.createdAt.slice(0, 10)} → ${runs[0]?.createdAt.slice(0, 10)})`);
for (const [name, list] of [...byName].sort((a, b) => b[1].length - a[1].length)) {
  const done = list.filter((r) => r.status === 'completed');
  const ok = done.filter((r) => r.conclusion === 'success').length;
  const fail = done.filter((r) => r.conclusion === 'failure').length;
  const mins = done.length ? (done.reduce((a, r) => a + (Date.parse(r.updatedAt) - Date.parse(r.createdAt)), 0) / done.length / 60000).toFixed(1) : '-';
  const master = list.filter((r) => r.headBranch === 'master' && r.status === 'completed');
  const mOk = master.filter((r) => r.conclusion === 'success').length;
  console.log(`  ${name.padEnd(28)} ok=${String(ok).padStart(3)} fail=${String(fail).padStart(3)} running=${list.length - done.length}  avg ${mins} min   master: ${mOk}/${master.length} green`);
}

const failed = (byName.get(workflow) ?? []).filter((r) => r.conclusion === 'failure').slice(0, logs);
const inProgress = (byName.get(workflow) ?? []).filter((r) => r.status !== 'completed');
if (inProgress.length) console.log(`\n${workflow}: ${inProgress.length} run(s) still in progress — their logs are not readable yet (ids ${inProgress.map((r) => r.databaseId).join(', ')})`);
if (!failed.length) { console.log(`\n${workflow}: no failed runs in the window.`); process.exit(0); }
console.log(`\n${workflow}: failing tests in the newest ${failed.length} failed run(s) — count · leg · file › test`);
const tally = new Map();
for (const r of failed) {
  let log = '';
  try { log = strip(gh(['run', 'view', '-R', repo, String(r.databaseId), '--log-failed'], { stdio: ['ignore', 'pipe', 'ignore'] })); } catch { continue; }
  for (const line of log.split('\n')) {
    const m = line.match(/^([^\t]+)\t[^\t]+\t\S+\s+FAIL\s+(tests\/\S+)(?:\s*>\s*(.*))?/);
    if (!m) continue;
    const leg = m[1].replace(/^build \(|-latest\)$/g, '');
    const name = (m[3] ?? '').trim().startsWith('[') ? '(whole file)' : (m[3] ?? '').trim().slice(0, 90);
    const key = `${leg} · ${m[2]} › ${name}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
}
for (const [k, c] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)} · ${k}`);
console.log(`\nRead a log yourself with: gh run view -R ${repo} <id> --log-failed`);
