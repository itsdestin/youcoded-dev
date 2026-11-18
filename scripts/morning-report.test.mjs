// Tests for scripts/morning-report.mjs. Run: node --test scripts/morning-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cronIntervalDays, scheduledWorkflows, judgeSchedules, lastRunLine, diskLevel, summarize, phoneMessage, renderReport, briefingLine, sendPhone, readTopic, writeReport, collectGithub } from './morning-report.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'morning-'));
const NOW = Date.parse('2026-11-18T12:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const wf = { name: 'Daily', file: 'd.yml', days: 1 };
const run = (o) => ({ name: 'Daily', event: 'schedule', status: 'completed', conclusion: 'success', createdAt: ago(0.5), ...o });

test('cron lines map to hourly, daily, weekly', () => {
  assert.equal(cronIntervalDays('37 * * * *'), 1 / 24);
  assert.equal(cronIntervalDays('17 6 * * *'), 1);
  assert.equal(cronIntervalDays('17 6 * * 1'), 7);
});

test('scheduled workflows are read from the workflow files; unscheduled files are ignored', () => {
  const d = tmp(); fs.mkdirSync(path.join(d, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(d, '.github', 'workflows', 'a.yml'), "name: Nightly A\non:\n  schedule:\n    - cron: '17 6 * * *'\n");
  fs.writeFileSync(path.join(d, '.github', 'workflows', 'b.yml'), 'name: Only PRs\non: [pull_request]\n');
  assert.deepEqual(scheduledWorkflows(d), [{ name: 'Nightly A', file: 'a.yml', days: 1 }]);
});

test('a failed scheduled run is red', () => {
  assert.equal(judgeSchedules([wf], [run({ conclusion: 'failure' })], NOW)[0].level, 'red');
});
test('a schedule that went quiet is yellow, never green (GitHub switches idle schedules off)', () => {
  assert.equal(judgeSchedules([wf], [run({ createdAt: ago(6) })], NOW)[0].level, 'yellow');
  assert.equal(judgeSchedules([wf], [], NOW)[0].level, 'yellow');
});
test('pull-request runs never count as the nightly run', () => {
  assert.equal(judgeSchedules([wf], [run({ event: 'pull_request' })], NOW)[0].level, 'yellow');
});
test('a recent successful scheduled run is green', () => {
  assert.equal(judgeSchedules([wf], [run()], NOW)[0].level, 'green');
});

test('quiet repos only show how long ago they last ran', () => {
  assert.equal(lastRunLine('r/x', [{ createdAt: ago(6) }], NOW), 'r/x: last run 6 days ago');
  assert.equal(lastRunLine('r/x', [], NOW), 'r/x: no checks have ever run');
});

test('gh unavailable gives yellow, never a false green', () => {
  const root = tmp(); fs.mkdirSync(path.join(root, '.git')); fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'a.yml'), "name: A\non:\n  schedule:\n    - cron: '1 1 * * *'\n");
  const sections = collectGithub(root, { workspace: { repository: 'o/r', branch: 'master' } }, NOW, () => { throw new Error('gh: not found'); });
  assert.equal(sections[0].level, 'yellow');
});

test('disk thresholds are 85 and 92', () => {
  assert.deepEqual([84, 85, 91, 92].map(diskLevel), ['green', 'yellow', 'yellow', 'red']);
});

test('phone message carries counts only', () => {
  assert.equal(phoneMessage({ green: 9, yellow: 1, red: 0 }), 'Morning report: 9 fine, 1 to look at.');
  assert.match(phoneMessage({ green: 9, yellow: 0, red: 2 }), /2 red/);
});

test('phone ping is high priority only when something is red, and the topic is only in the URL', () => {
  const calls = [];
  sendPhone({ green: 3, yellow: 0, red: 1 }, 'secret-topic', (a) => calls.push(a));
  sendPhone({ green: 3, yellow: 1, red: 0 }, 'secret-topic', (a) => calls.push(a));
  assert.ok(calls[0].includes('Priority: high'));
  assert.ok(calls[1].includes('Priority: default'));
  assert.ok(calls[0].at(-1).endsWith('/secret-topic'));
  assert.ok(!calls[0].slice(0, -1).some((a) => a.includes('secret-topic')));
});
test('no topic means no ping and the report says so; a failed send is reported, not thrown', () => {
  assert.match(sendPhone({ green: 1, yellow: 0, red: 0 }, null, () => assert.fail('must not send')), /skipped/);
  assert.match(sendPhone({ green: 1, yellow: 0, red: 0 }, 't', () => { throw new Error('x'); }), /FAILED/);
});
test('topic comes from env first, then the file', () => {
  const h = tmp(); fs.mkdirSync(path.join(h, '.config', 'youcoded-morning'), { recursive: true });
  fs.writeFileSync(path.join(h, '.config', 'youcoded-morning', 'ntfy-topic'), 'from-file\n');
  assert.equal(readTopic(h, {}), 'from-file');
  assert.equal(readTopic(h, { NTFY_TOPIC: 'from-env' }), 'from-env');
  assert.equal(readTopic(tmp(), {}), null);
});

test('a green morning is one headline line; details only for non-green sections', () => {
  const md = renderReport([{ title: 'A', level: 'green', summary: 'fine', details: ['hidden'] }, { title: 'B', level: 'red', summary: 'bad', details: ['why'] }], '2026-11-18');
  assert.match(md, /1 green, 0 to look at, 1 red/);
  assert.ok(!md.includes('hidden') && md.includes('why'));
  assert.match(renderReport([{ title: 'A', level: 'green', summary: 's' }], 'd'), /all 1 green/);
});

test('briefing line: fresh, stale (timer stopped) and absent', () => {
  const d = tmp();
  assert.equal(briefingLine(d, NOW), null);
  writeReport(d, '2026-11-18', 'x', { date: '2026-11-18', generatedAt: ago(0.2), count: { green: 5, yellow: 0, red: 0 } }, 30, NOW);
  assert.match(briefingLine(d, NOW), /all 5 green/);
  assert.match(briefingLine(d, NOW + 3 * 86400000), /STALE/);
});

test('reports older than 30 days are removed, newer kept', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, '2026-09-01.md'), 'old'); fs.writeFileSync(path.join(d, '2026-11-10.md'), 'new');
  writeReport(d, '2026-11-18', 'x', { generatedAt: ago(0), count: summarize([]) }, 30, NOW);
  assert.deepEqual(fs.readdirSync(d).filter((f) => f.endsWith('.md')).sort(), ['2026-11-10.md', '2026-11-18.md', 'latest.md']);
});

test('session start prints the briefing line, only in text mode', () => {
  const src = fs.readFileSync(new URL('./workspace-start.mjs', import.meta.url), 'utf8');
  assert.match(src, /briefingLine\(\)/);
  assert.ok(src.indexOf('briefingLine()') < src.indexOf("Session: ${result.session}"));
});

test('the timer unit runs at 06:30 local and catches up after sleep', () => {
  const t = fs.readFileSync(new URL('./systemd/youcoded-morning-report.timer', import.meta.url), 'utf8');
  assert.match(t, /OnCalendar=\*-\*-\* 06:30:00/);
  assert.match(t, /Persistent=true/);
});
