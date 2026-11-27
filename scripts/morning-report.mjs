#!/usr/bin/env node
// Morning report: which of YouCoded's own health checks are green, yellow or red.
// Runs on GitHub (.github/workflows/morning-report.yml, about 06:30 Arizona), not on any one computer.
//
//   node scripts/morning-report.mjs              # print the report and the phone line; sends nothing
//   node scripts/morning-report.mjs --ci         # what the workflow runs: report to the run's summary
//                                                #   page, phone line to the job output (never sends)
//
// WHY it exists: the nightly GitHub checks already run, but nothing said "all green" or "2 are red",
// and a check that quietly stops looks the same as a healthy one.
//
// WHY only these checks: the app and the workspace being functional and consistent is what the
// report is about. So it reads (1) every repo's scheduled GitHub workflows, (2) the doc/anchor check
// and (3) the cards consistency check. Anything that is only true of one computer (disk, unfinished
// work, shared checkouts) is NOT here: it cannot be seen from GitHub, and the session start-up
// report already covers it. Reading GitHub is cheap, needs no checkout and only the default token.
//
// Never a false green: anything that cannot be checked (a private repo the token cannot read, a
// GitHub error, a tool that did not run) is YELLOW "could not check".
//
// The phone message is built here but SENT by the workflow, in a separate job that holds the ntfy
// topic secret and runs none of this code. It carries counts only: anyone who knows the topic name
// can read it, so details live only in the run's summary page.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const DAY = 86400000;
// WHY skipped by name: this report's own workflow is mid-run while it reads, and its first night
// would read "no scheduled run yet" (a false yellow). Its own silence shows up as a missing phone message.
const SELF_WORKFLOW = 'Morning report';

// ---- pure helpers (unit-tested) -------------------------------------------------------------

/** How often a cron line fires, in days. Only needs to be good enough to say "overdue". */
export function cronIntervalDays(cron) {
  const [, hour, dom, , dow] = cron.trim().split(/\s+/);
  if (hour === '*' || /^\*\/\d+$/.test(hour)) return 1 / 24;
  if (dow !== '*' && dow !== undefined) return 7;
  if (dom !== '*' && dom !== undefined) return 30;
  return 1;
}

/** The first cron line in a workflow file's text, as days between runs, or null when it has none. */
export function scheduleDays(text) {
  // WHY quotes optional: an unquoted `- cron: 30 13 * * *` is valid YAML; missing it would skip a
  // scheduled check and read green.
  const cron = text.match(/^\s*-\s*cron:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/m);
  if (cron) return cronIntervalDays(cron[1]);
  // A `schedule:` with no readable cron is unknown, not "unscheduled": fall back to daily so it is still judged.
  return /^\s*schedule:/m.test(text) ? 1 : null;
}

/**
 * Judge one scheduled workflow against its recent scheduled runs (newest first or not).
 * red = newest finished scheduled run failed; yellow = no recent run (GitHub switches a schedule
 * off after 60 quiet days), or the newest run was cancelled/skipped; green otherwise.
 */
export function judgeSchedule(wf, runs, now = Date.now()) {
  const last = runs.filter((r) => r.status === 'completed')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  // Scheduled runs on GitHub are routinely hours late: allow twice the interval plus a day.
  const allowed = Math.max(wf.days * 2, 0.25) + 1;
  if (!last) return { level: 'yellow', line: `${wf.name}: no scheduled run found (schedule may be switched off)` };
  const age = (now - Date.parse(last.createdAt)) / DAY;
  if (['failure', 'timed_out', 'startup_failure'].includes(last.conclusion)) return { level: 'red', line: `${wf.name}: last scheduled run ${last.conclusion}` };
  if (last.conclusion !== 'success') return { level: 'yellow', line: `${wf.name}: last scheduled run ${last.conclusion}` };
  if (age > allowed) return { level: 'yellow', line: `${wf.name}: last scheduled run ${Math.floor(age)} days ago (overdue)` };
  return { level: 'green', line: `${wf.name}: ok` };
}

const rank = { green: 0, yellow: 1, red: 2 };
export const worst = (levels) => levels.reduce((a, b) => (rank[b] > rank[a] ? b : a), 'green');

export function summarize(sections) {
  const count = { green: 0, yellow: 0, red: 0 };
  for (const s of sections) count[s.level]++;
  return count;
}

export function phoneMessage(count) {
  const parts = [`${count.green} fine`];
  if (count.yellow) parts.push(`${count.yellow} to look at`);
  if (count.red) parts.push(`${count.red} red`);
  return count.red || count.yellow ? `Morning report: ${parts.join(', ')}. Open the report on GitHub.` : `Morning report: ${parts.join(', ')}.`;
}

export function renderReport(sections, dateStr) {
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
  return lines.join('\n') + '\n';
}

// ---- collectors (each returns one { title, level, summary, details }) ------------------------

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
// WHY stderr first: execFileSync's own message is just "Command failed: ..."; gh's reason (404, rate limit) is on stderr.
const firstLine = (e) => String(e.stderr || e.message || e).trim().split('\n')[0].slice(0, 160);
const couldNot = (title, e) => ({ title, level: 'yellow', summary: 'could not check', details: [firstLine(e)] });
const ghApi = (args) => run('gh', ['api', ...args]);

/**
 * One repo's scheduled workflows, read entirely from GitHub (no checkout): list its workflows, keep
 * the ones whose file has a cron line, and look at each one's last scheduled runs.
 * `ghFn(args)` returns gh's stdout; injected so tests never touch the network.
 */
export function collectRepoSchedules(label, repository, now = Date.now(), ghFn = ghApi) {
  const title = `GitHub nightly checks: ${label}`;
  try {
    const listed = JSON.parse(ghFn([`repos/${repository}/actions/workflows?per_page=100`])).workflows ?? [];
    const levels = [], details = [];
    let watched = 0;
    for (const w of listed) {
      if (w.name === SELF_WORKFLOW || w.state === 'deleted' || w.state === 'disabled_manually') continue; // manually off = on purpose
      // WHY: GitHub also lists its own built-in jobs (e.g. "dynamic/dependabot/...") that have no file to read.
      if (!w.path.startsWith('.github/workflows/')) continue;
      let days;
      try { days = scheduleDays(ghFn(['-H', 'Accept: application/vnd.github.raw', `repos/${repository}/contents/${w.path}`])); }
      catch (e) {
        // WHY: a listed workflow whose file is gone from the default branch can no longer run on a schedule, so a
        // 404 is "nothing to watch". Any other failure is unknown, which is yellow, never skipped.
        if (/404|Not Found/i.test(firstLine(e))) continue;
        levels.push('yellow'); details.push(`${w.name}: could not read its file (${firstLine(e)})`); watched++; continue;
      }
      if (days == null) continue;
      watched++;
      const wf = { name: w.name, days };
      // WHY the schedule is judged by its own runs only (event=schedule, one query per workflow): a repo-wide
      // run list is flooded by pull-request runs and hourly watchers, which once hid a daily check.
      if (w.state === 'disabled_inactivity') { levels.push('yellow'); details.push(`${w.name}: GitHub switched the schedule off after a quiet spell`); continue; }
      const runs = JSON.parse(ghFn([`repos/${repository}/actions/workflows/${w.id}/runs?event=schedule&per_page=3`])).workflow_runs ?? [];
      const j = judgeSchedule(wf, runs.map((r) => ({ status: r.status, conclusion: r.conclusion, createdAt: r.created_at })), now);
      levels.push(j.level);
      if (j.level !== 'green') details.push(j.line);
    }
    const level = worst(levels);
    if (!watched) return { title, level: 'green', summary: 'no scheduled checks here', details: [] };
    return { title, level, summary: level === 'green' ? `${watched} scheduled check(s) ran and passed` : `${watched} scheduled check(s) watched`, details };
  } catch (e) {
    // A 404 from a private repo the default token cannot see lands here: yellow, never green.
    return { title, level: 'yellow', summary: 'could not check', details: [`${repository}: GitHub would not answer (${firstLine(e)}). A private repo needs a token with read access to its Actions.`] };
  }
}

export function collectAnchors(root = ROOT, exec = run) {
  const title = 'Workspace doc checks';
  try {
    const out = String(exec('node', [path.join(root, 'scripts', 'audit-anchors.mjs'), '--no-diff'], { cwd: root }));
    // WHY say so: the checker exits 0 but skips anchors that point into a repo that is not cloned here
    // (youcoded-admin is private), and that gap must be visible rather than silently fine.
    const gap = /not on disk \(unverifiable/.test(out) ? '; anchors into repos not cloned here (the private one) were not checked' : '';
    return { title, level: 'green', summary: `doc links and rules still point at real files${gap}`, details: [] };
  } catch (e) {
    if (e.status == null) return couldNot(title, e);
    // WHY from the first FAIL: the failures print first; the last lines are unrelated summary lines.
    const lines = String(e.stdout ?? '').split('\n').filter(Boolean);
    const from = Math.max(0, lines.findIndex((l) => l.startsWith('FAIL')));
    return { title, level: 'red', summary: 'the doc/anchor check fails', details: lines.slice(from, from + 15) };
  }
}

export function collectCards(root = ROOT, exec = run) {
  const title = 'Cards';
  try { return { title, level: 'green', summary: exec('node', [path.join(root, 'scripts', 'cards.mjs'), 'check'], { cwd: root }).trim().split('\n').pop(), details: [] }; }
  catch (e) {
    if (e.status == null) return couldNot(title, e);
    return { title, level: 'red', summary: 'cards fail their own consistency check', details: String(e.stderr || e.stdout || '').split('\n').filter(Boolean).slice(0, 5) };
  }
}

// ---- main -------------------------------------------------------------------------------------

function main(argv) {
  const inventory = JSON.parse(fs.readFileSync(new URL('./workspace-repos.json', import.meta.url), 'utf8'));
  const now = Date.now();
  const sections = [];
  // youcoded-core is archived (read-only, no runs); everything else in the inventory is watched.
  // WHY youcoded-admin is skipped too (Destin, 2026-11-27): it is private, so reading it needs an extra
  // stored key, and it holds only release tools with almost no checks of its own. Without this skip it
  // would show "could not check" every morning and the phone would never say "all fine".
  const SKIPPED = new Set(['youcoded-core', 'youcoded-admin']);
  for (const [name, info] of Object.entries(inventory)) {
    if (SKIPPED.has(name)) continue;
    sections.push(collectRepoSchedules(name === 'workspace' ? 'youcoded-dev' : name, info.repository, now));
  }
  sections.push(collectAnchors(), collectCards());
  const count = summarize(sections);
  const dateStr = new Date(now).toISOString().slice(0, 10);
  const md = renderReport(sections, dateStr);
  const message = phoneMessage(count);
  if (argv.includes('--ci')) {
    // WHY files, not stdout: the summary page and job outputs are how the workflow gets them.
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `message=${message}\nred=${count.red}\n`);
  }
  console.log(md);
  console.log(`Phone message (not sent from here): ${message}`);
  // WHY exit 1 on red (CI only): the outputs above are already written, so the phone still hears the counts, and the
  // run itself goes red (GitHub emails the owner) even if the ntfy secret is missing. A local dry run stays exit 0.
  if (argv.includes('--ci') && count.red > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
