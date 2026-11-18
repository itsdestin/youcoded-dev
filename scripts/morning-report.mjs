#!/usr/bin/env node
// Morning report: one short page saying which of YouCoded's checks are green and which need Destin.
//
//   node scripts/morning-report.mjs              # write the report, send the phone summary
//   node scripts/morning-report.mjs --no-notify  # write only (what tests and manual runs use)
//   node scripts/morning-report.mjs --print      # also print the report
//
// WHY (card/plan W-4, approved 2026-11-18): the nightly GitHub checks already run, but nothing
// said "all green" or "2 are red", and a check that quietly stops looks the same as a healthy
// one. This READS results (gh, git, the existing audit/prune/cards tools); it re-runs nothing
// expensive, uses no AI, changes nothing in any repo, never touches the running app, and
// deletes nothing. Any section that cannot be checked is YELLOW "could not check" — never a
// false green.
//
// Output (outside every repo, so nothing to commit or leak):
//   ~/.local/state/youcoded-morning/YYYY-MM-DD.md, latest.md, latest.json (30 days kept)
// Phone summary: ntfy topic from $NTFY_TOPIC or ~/.config/youcoded-morning/ntfy-topic. The topic
// exists today only as a GitHub secret (cannot be read back), so Destin stores it once; without
// it the report says so and skips the ping. The message carries counts only, never details
// (same rule as the GitHub alerts: anyone who knows the topic name can read it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scan, mainCheckoutOf } from './prune-worktrees.mjs';

// WHY mainCheckoutOf: the script may be run from a session worktree; the component checkouts and the
// timer's view of the world are the shared workspace, not whichever worktree holds this file.
const ROOT = mainCheckoutOf(fileURLToPath(new URL('..', import.meta.url)));
const DAY = 86400000;
export const stateDir = (home = os.homedir()) => path.join(home, '.local', 'state', 'youcoded-morning');
export const topicFile = (home = os.homedir()) => path.join(home, '.config', 'youcoded-morning', 'ntfy-topic');

// ---- pure helpers (unit-tested) -------------------------------------------------------------

/** How often a cron line fires, in days. Only needs to be good enough to say "overdue". */
export function cronIntervalDays(cron) {
  const [min, hour, dom, , dow] = cron.trim().split(/\s+/);
  if (hour === '*' || /^\*\/\d+$/.test(hour)) return 1 / 24;
  if (dow !== '*' && dow !== undefined) return 7;
  if (dom !== '*' && dom !== undefined) return 30;
  return 1;
}

/** Scheduled workflows declared in one repo's .github/workflows: [{ name, file, days }]. */
export function scheduledWorkflows(repoDir) {
  const dir = path.join(repoDir, '.github', 'workflows');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)); } catch { return []; }
  const out = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const cron = text.match(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/m);
    if (!cron) continue;
    const name = (text.match(/^name:\s*(.+)$/m)?.[1] ?? file).trim().replace(/^['"]|['"]$/g, '');
    out.push({ name, file, days: cronIntervalDays(cron[1]) });
  }
  return out;
}

/**
 * Judge each expected scheduled workflow against gh's run list.
 * red = newest finished scheduled run failed; yellow = no scheduled run lately (the schedule may
 * have been switched off by GitHub, which does that after 60 quiet days); green otherwise.
 */
export function judgeSchedules(expected, runs, now = Date.now()) {
  return expected.map((wf) => {
    const mine = runs.filter((r) => r.name === wf.name && r.event === 'schedule' && r.status === 'completed')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const last = mine[0];
    // Allow 2x the interval plus a day: scheduled runs on GitHub are routinely hours late.
    const allowed = Math.max(wf.days * 2, 0.25) + 1;
    if (!last) return { level: 'yellow', line: `${wf.name}: no scheduled run found (schedule may be switched off)` };
    const age = (now - Date.parse(last.createdAt)) / DAY;
    if (last.conclusion !== 'success') return { level: 'red', line: `${wf.name}: last scheduled run ${last.conclusion}` };
    if (age > allowed) return { level: 'yellow', line: `${wf.name}: last scheduled run ${Math.floor(age)} days ago (overdue)` };
    return { level: 'green', line: `${wf.name}: ok` };
  });
}

export function lastRunLine(repo, runs, now = Date.now()) {
  const newest = runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (!newest) return `${repo}: no checks have ever run`;
  const d = Math.floor((now - newest) / DAY);
  return `${repo}: last run ${d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`}`;
}

export const diskLevel = (usedPct) => (usedPct >= 92 ? 'red' : usedPct >= 85 ? 'yellow' : 'green');

const rank = { green: 0, yellow: 1, red: 2 };
export const worst = (levels) => levels.reduce((a, b) => (rank[b] > rank[a] ? b : a), 'green');

export function summarize(sections) {
  const count = { green: 0, yellow: 0, red: 0 };
  for (const s of sections) count[s.level]++;
  return count;
}

export function phoneMessage(count) {
  // WHY no details: the topic name is the only secret; anyone who knows it can read the message.
  const parts = [`${count.green} fine`];
  if (count.yellow) parts.push(`${count.yellow} to look at`);
  if (count.red) parts.push(`${count.red} red`);
  return count.red ? `Morning report: ${parts.join(', ')}. Open the report on your computer.` : `Morning report: ${parts.join(', ')}.`;
}

export function renderReport(sections, dateStr, footer = []) {
  const count = summarize(sections);
  const icon = { green: 'OK ', yellow: 'LOOK', red: 'RED ' };
  const head = count.red || count.yellow
    ? `# Morning report ${dateStr}: ${count.green} green, ${count.yellow} to look at, ${count.red} red`
    : `# Morning report ${dateStr}: all ${count.green} green`;
  const lines = [head, ''];
  for (const s of sections) {
    lines.push(`- ${icon[s.level]}  **${s.title}**: ${s.summary}`);
    if (s.level !== 'green') for (const d of s.details ?? []) lines.push(`    - ${d}`);
  }
  if (footer.length) lines.push('', ...footer.map((f) => `_${f}_`));
  return lines.join('\n') + '\n';
}

/** The one line the session start-up briefing prints. Null when there is no report at all. */
export function briefingLine(dir = stateDir(), now = Date.now()) {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8')); } catch { return null; }
  const age = Math.floor((now - Date.parse(meta.generatedAt)) / DAY);
  // WHY: a report that stopped being written must be loud, or silence reads as healthy.
  if (!Number.isFinite(age) || age >= 2) return `Morning report: STALE, last written ${Number.isFinite(age) ? `${age} days ago` : 'at an unknown time'} (timer may not be running). ${path.join(dir, 'latest.md')}`;
  const c = meta.count;
  const status = c.red || c.yellow ? `${c.green} green, ${c.yellow} to look at, ${c.red} red` : `all ${c.green} green`;
  return `Morning report (${meta.date}): ${status}. ${path.join(dir, 'latest.md')}`;
}

// ---- collectors (touch the machine; each returns { title, level, summary, details }) ---------

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const couldNot = (title, e) => ({ title, level: 'yellow', summary: 'could not check', details: [String(e.message ?? e).split('\n')[0].slice(0, 200)] });

export function collectGithub(root, inventory, now = Date.now(), ghFn = (args) => run('gh', args)) {
  const sections = [];
  const quiet = [];
  const levels = [];
  const details = [];
  let checked = 0;
  for (const [name, info] of Object.entries(inventory)) {
    if (name === 'youcoded-core') continue; // archived, read-only on GitHub
    const dir = name === 'workspace' ? root : path.join(root, name);
    if (!fs.existsSync(path.join(dir, '.git'))) { details.push(`${name}: checkout missing here, not checked`); levels.push('yellow'); continue; }
    const expected = scheduledWorkflows(dir);
    let runs = [];
    try {
      if (!expected.length) runs = JSON.parse(ghFn(['run', 'list', '-R', info.repository, '--limit', '20', '--json', 'name,conclusion,status,createdAt,event']));
      // WHY one query per workflow with --event schedule: a single "newest 200 runs" list is flooded by pull-request
      // runs and hourly watchers, which pushed daily checks out of view and produced a false "schedule switched off".
      for (const wf of expected) runs.push(...JSON.parse(ghFn(['run', 'list', '-R', info.repository, '--workflow', wf.file, '--event', 'schedule', '--limit', '3', '--json', 'name,conclusion,status,createdAt,event'])));
    } catch (e) { details.push(`${name}: could not ask GitHub (${String(e.message).split('\n')[0].slice(0, 80)})`); levels.push('yellow'); continue; }
    if (!expected.length) { quiet.push(lastRunLine(info.repository, runs, now)); continue; } // N-4: no new daily runs, only show age
    for (const j of judgeSchedules(expected, runs, now)) {
      checked++; levels.push(j.level);
      if (j.level !== 'green') details.push(`${name}: ${j.line}`);
    }
  }
  const level = worst(levels);
  sections.push({
    title: 'GitHub nightly checks', level,
    summary: level === 'green' ? `${checked} scheduled checks ran and passed` : `${checked} scheduled checks watched`,
    details,
  });
  if (quiet.length) sections.push({ title: 'Quiet repos', level: 'green', summary: quiet.join('; '), details: [] });
  return sections;
}

function collectAnchors(root) {
  try { run('node', [path.join(root, 'scripts', 'audit-anchors.mjs')], { cwd: root }); return { title: 'Workspace doc checks', level: 'green', summary: 'doc links and rules still point at real files', details: [] }; }
  catch (e) {
    if (e.status == null) return couldNot('Workspace doc checks', e);
    const tail = String(e.stdout ?? '').split('\n').filter(Boolean).slice(-5);
    return { title: 'Workspace doc checks', level: 'red', summary: 'the doc/anchor check fails here', details: tail };
  }
}

function collectCards(root) {
  try { const out = run('node', [path.join(root, 'scripts', 'cards.mjs'), 'check'], { cwd: root }).trim().split('\n').pop(); return { title: 'Cards', level: 'green', summary: out, details: [] }; }
  catch (e) {
    if (e.status == null) return couldNot('Cards', e);
    return { title: 'Cards', level: 'red', summary: 'cards fail their own consistency check', details: String(e.stdout ?? '').split('\n').filter(Boolean).slice(0, 5) };
  }
}

function collectDisk(root) {
  try {
    const row = run('df', ['-P', root]).trim().split('\n').pop().split(/\s+/);
    const used = parseInt(row[4], 10);
    let size = '';
    try { size = ` (worktrees folder ${run('du', ['-sh', path.join(root, 'worktrees')]).split('\t')[0].trim()})`; } catch { /* size is a nicety */ }
    const level = diskLevel(used);
    return { title: 'Disk', level, summary: `${used}% full${size}`, details: level === 'green' ? [] : ['Old worktrees are the usual cause; session start removes the merged idle ones.'] };
  } catch (e) { return couldNot('Disk', e); }
}

function collectWorktrees(root, inventory) {
  try {
    const rep = scan({ root, inventory });
    const now = Date.now();
    const atRisk = [], busy = [];
    for (const g of rep.notSafe) {
      const here = g.entries.reduce((n, e) => n + (e.onlyHere || 0), 0);
      const dirty = g.entries.some((e) => e.reasons?.includes('dirty'));
      const name = path.basename(g.dir);
      // Same cut-off as the session-start sweep: idle 1+ day means nobody is working in it.
      if ((here || dirty) && now - g.lastActive > DAY) atRisk.push(`${name} (${[dirty ? 'uncommitted files' : '', here ? `${here} commit(s) on no remote` : ''].filter(Boolean).join(', ')})`);
      else busy.push(name);
    }
    const level = atRisk.length ? 'red' : (rep.notes.length || rep.missing.length || rep.unregistered.length) ? 'yellow' : 'green';
    return {
      title: 'Unfinished work', level,
      summary: atRisk.length ? `${atRisk.length} folder(s) hold work that exists only on this computer` : `nothing stranded; ${rep.candidates.length} merged folder(s) await the automatic clean-up, ${busy.length} in progress`,
      details: [...atRisk.map((a) => `only here: ${a}`), ...rep.notes, ...rep.missing.map((m) => `registered but gone: ${m.path}`), ...rep.unregistered.map((u) => `leftover folder: ${u}`)],
    };
  } catch (e) { return couldNot('Unfinished work', e); }
}

function collectCheckouts(root, inventory) {
  const details = [];
  let n = 0, level = 'green';
  for (const [name, info] of Object.entries(inventory)) {
    if (name === 'youcoded-core') continue;
    const dir = name === 'workspace' ? root : path.join(root, name);
    if (!fs.existsSync(path.join(dir, '.git'))) continue;
    n++;
    try {
      const git = (...a) => run('git', ['-C', dir, ...a]).trim();
      const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
      const [behind, ahead] = git('rev-list', '--left-right', '--count', `origin/${info.branch}...HEAD`).split(/\s+/).map(Number);
      if (branch !== info.branch) { level = worst([level, 'yellow']); details.push(`${name}: shared checkout is on "${branch}", not ${info.branch}`); }
      else if (ahead) { level = worst([level, 'red']); details.push(`${name}: ${ahead} local commit(s) on ${info.branch} not on origin`); }
      else if (behind) details.push(`${name}: ${behind} behind origin (session start catches up; fine)`);
    } catch (e) { level = worst([level, 'yellow']); details.push(`${name}: could not compare with origin`); }
  }
  return { title: 'Shared checkouts', level, summary: level === 'green' ? `${n} checkouts match origin or are only behind` : 'a shared checkout is off master', details };
}

// ---- notify + write -------------------------------------------------------------------------

export function readTopic(home = os.homedir(), env = process.env) {
  if (env.NTFY_TOPIC) return env.NTFY_TOPIC.trim();
  try { return fs.readFileSync(topicFile(home), 'utf8').trim() || null; } catch { return null; }
}

export function sendPhone(count, topic, curl = (args) => execFileSync('curl', args, { stdio: 'ignore', timeout: 30000 })) {
  if (!topic) return 'phone summary skipped: no ntfy topic stored on this computer';
  const red = count.red > 0;
  try {
    // WHY args array + topic only in the URL: never printed or logged; high priority only when red.
    curl(['-fsS', '-H', `Title: YouCoded morning report`, '-H', `Priority: ${red ? 'high' : 'default'}`, '-H', `Tags: ${red ? 'warning' : 'white_check_mark'}`, '-d', phoneMessage(count), `https://ntfy.sh/${topic}`]);
    return `phone summary sent${red ? ' (high priority)' : ''}`;
  } catch { return 'phone summary FAILED to send'; }
}

export function writeReport(dir, dateStr, md, meta, keepDays = 30, now = Date.now()) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${dateStr}.md`), md);
  fs.writeFileSync(path.join(dir, 'latest.md'), md);
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(meta));
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) continue;
    if (now - Date.parse(f.slice(0, 10)) > keepDays * DAY) fs.rmSync(path.join(dir, f), { force: true });
  }
}

function main(argv) {
  const inventory = JSON.parse(fs.readFileSync(new URL('./workspace-repos.json', import.meta.url), 'utf8'));
  const now = Date.now();
  const sections = [];
  for (const collect of [
    () => collectGithub(ROOT, inventory, now),
    () => [collectAnchors(ROOT)],
    () => [collectWorktrees(ROOT, inventory)],
    () => [collectCheckouts(ROOT, inventory)],
    () => [collectCards(ROOT)],
    () => [collectDisk(ROOT)],
  ]) { try { sections.push(...collect()); } catch (e) { sections.push(couldNot('A check', e)); } }
  const count = summarize(sections);
  const d = new Date(now);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const notice = argv.includes('--no-notify') ? 'phone summary not requested' : sendPhone(count, readTopic());
  const md = renderReport(sections, dateStr, [notice]);
  writeReport(stateDir(), dateStr, md, { date: dateStr, generatedAt: new Date(now).toISOString(), count });
  if (argv.includes('--print')) console.log(md);
  console.log(`morning report written: ${path.join(stateDir(), 'latest.md')} (${notice})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
