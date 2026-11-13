// Run: node --test pages/tasks/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../src/core.js');

const TODAY = '2026-11-13'; // a Friday
const parse = (text, extra = {}) => C.parseQuickAdd(text, { today: TODAY, projects: [{ id: 'p1', name: 'Home' }, { id: 'p2', name: 'Work Stuff' }], ...extra });

test('plain words stay a plain title', () => {
  const r = parse('Call the dentist');
  assert.equal(r.title, 'Call the dentist');
  assert.equal(r.due, null);
  assert.equal(r.priority, 4);
});

test('day, time, priority, project and label are all read and removed from the title', () => {
  const r = parse('Pay rent tomorrow 5pm p1 #Home @bills');
  assert.equal(r.title, 'Pay rent');
  assert.deepEqual(r.due, { date: '2026-11-14', time: '17:00' });
  assert.equal(r.priority, 1);
  assert.equal(r.projectId, 'p1');
  assert.deepEqual(r.labels, ['bills']);
});

test('day words', () => {
  assert.equal(parse('x today').due.date, TODAY);
  assert.equal(parse('x monday').due.date, '2026-11-16');
  assert.equal(parse('x friday').due.date, '2026-11-20', 'today is Friday, so "friday" is next week');
  assert.equal(parse('x next week').due.date, '2026-11-16');
  assert.equal(parse('x in 3 days').due.date, '2026-11-16');
  assert.equal(parse('x in 2 weeks').due.date, '2026-11-27');
  assert.equal(parse('x weekend').due.date, '2026-11-14');
  assert.equal(parse('x next month').due.date, '2026-12-01');
});

test('calendar dates; a passed date with no year means next year', () => {
  assert.equal(parse('x Dec 5').due.date, '2026-12-05');
  assert.equal(parse('x 5th of december').due.date, '2026-12-05');
  assert.equal(parse('x jan 2').due.date, '2027-01-02');
  assert.equal(parse('x 12/25').due.date, '2026-12-25');
  assert.equal(parse('x 3/1/2028').due.date, '2028-03-01');
  assert.equal(parse('x feb 30').due, null);
});

test('times', () => {
  assert.deepEqual(parse('x at 9am').due, { date: TODAY, time: '09:00' });
  assert.deepEqual(parse('x 14:30').due, { date: TODAY, time: '14:30' });
  assert.deepEqual(parse('x tomorrow noon').due, { date: '2026-11-14', time: '12:00' });
  assert.deepEqual(parse('x 12am').due.time, '00:00');
  assert.deepEqual(parse('x 12:15pm').due.time, '12:15');
});

test('repeats', () => {
  assert.deepEqual(parse('water plants every 3 days').repeat, { every: 3, unit: 'day' });
  assert.deepEqual(parse('standup every weekday').repeat, { every: 1, unit: 'week', days: [1, 2, 3, 4, 5] });
  assert.deepEqual(parse('gym every mon, wed and fri').repeat, { every: 1, unit: 'week', days: [1, 3, 5] });
  assert.equal(parse('gym every mon, wed and fri').due.date, TODAY, 'starts on the first matching day, today included');
  assert.equal(parse('bins every tuesday').due.date, '2026-11-17');
  assert.deepEqual(parse('rent monthly').repeat, { every: 1, unit: 'month', anchor: 13 });
  assert.deepEqual(parse('filter every other week').repeat, { every: 2, unit: 'week' });
  assert.equal(parse('haircut every! 6 weeks').repeat.after, true);
  assert.equal(parse('standup every weekday').title, 'standup');
});

test('unknown #project stays in the title; a project with a space in its name matches', () => {
  assert.equal(parse('thing #Nowhere').title, 'thing #Nowhere');
  assert.equal(parse('thing #Work Stuff today').projectId, 'p2');
  assert.equal(parse('thing #workstuff').projectId, 'p2');
});

test('a word the person un-picked is left alone', () => {
  const r = parse('Read Tomorrow and tomorrow', { ignore: ['tomorrow'] });
  assert.equal(r.due, null);
  assert.equal(r.title, 'Read Tomorrow and tomorrow');
});

test('words that only look like shortcuts are not eaten', () => {
  assert.equal(parse('Buy p1 tickets').priority, 1);
  assert.equal(parse('Email sam@example.com').labels.length, 0);
  assert.equal(parse('Maybe buy a sundial').due, null);
  assert.equal(parse('Tomato soup').due, null);
});

test('next due day for repeats', () => {
  assert.equal(C.nextDue('2026-11-13', { every: 1, unit: 'day' }, '2026-11-13'), '2026-11-14');
  assert.equal(C.nextDue('2026-11-10', { every: 1, unit: 'day' }, '2026-11-13'), '2026-11-14', 'overdue daily comes back tomorrow');
  assert.equal(C.nextDue('2026-11-20', { every: 1, unit: 'week' }, '2026-11-13'), '2026-11-27', 'done early still skips ahead');
  assert.equal(C.nextDue('2026-11-13', { every: 1, unit: 'week', days: [1, 3, 5] }, '2026-11-13'), '2026-11-16');
  assert.equal(C.nextDue('2026-11-13', { every: 2, unit: 'week', days: [5] }, '2026-11-13'), '2026-11-27');
  assert.equal(C.nextDue('2027-01-31', { every: 1, unit: 'month', anchor: 31 }, '2027-01-31'), '2027-02-28');
  assert.equal(C.nextDue('2027-02-28', { every: 1, unit: 'month', anchor: 31 }, '2027-02-28'), '2027-03-31', 'the 31st is remembered');
  assert.equal(C.nextDue('2026-11-01', { every: 10, unit: 'day', after: true }, '2026-11-13'), '2026-11-23');
  assert.equal(C.nextDue('2024-02-29', { every: 1, unit: 'year', anchor: 29 }, '2024-02-29'), '2025-02-28');
});

test('describeRepeat reads like a sentence', () => {
  assert.equal(C.describeRepeat({ every: 1, unit: 'day' }), 'Every day');
  assert.equal(C.describeRepeat({ every: 1, unit: 'week', days: [1, 2, 3, 4, 5] }), 'Every weekday');
  assert.equal(C.describeRepeat({ every: 1, unit: 'week', days: [1, 3] }), 'Every Mon, Wed');
  assert.equal(C.describeRepeat({ every: 2, unit: 'month', anchor: 15 }), 'Every 2 months on the 15th');
});

test('due labels and lateness', () => {
  const now = { day: TODAY, time: '10:00' };
  assert.deepEqual(C.dueInfo({ date: TODAY, time: null }, now, true), { text: 'Today', tone: 'today', diff: 0 });
  assert.equal(C.dueInfo({ date: TODAY, time: '09:00' }, now, true).tone, 'overdue');
  assert.equal(C.dueInfo({ date: TODAY, time: '17:30' }, now, true).text, 'Today 5:30 PM');
  assert.equal(C.dueInfo({ date: '2026-11-12' }, now).text, 'Yesterday');
  assert.equal(C.dueInfo({ date: '2026-11-17' }, now).text, 'Tue');
  assert.equal(C.dueInfo({ date: '2027-02-03' }, now).text, 'Feb 3, 2027');
});

test('normalize turns anything into a valid state', () => {
  assert.deepEqual(C.normalize(null).tasks, []);
  const s = C.normalize({
    tasks: [
      { title: 'Only a title' },
      { title: '  ' },
      { id: 'a', title: 'Parent', projectId: 'nope', due: '2026-12-01', labels: ['x y', 'X-Y'], priority: 9 },
      { id: 'b', title: 'Child', parentId: 'a', projectId: 'p' },
      { id: 'b', title: 'Same id twice' },
      { title: 'Orphan', parentId: 'gone', repeat: { unit: 'day' } },
    ],
    projects: [{ id: 'p', name: 'P', color: 'neon', sections: [{ name: 'S' }] }, { name: '' }],
    settings: { dailyGoal: 500 },
  });
  assert.equal(s.tasks.length, 5);
  assert.equal(s.tasks[0].priority, 4);
  const parent = s.tasks.find((t) => t.title === 'Parent');
  assert.equal(parent.projectId, null, 'unknown project falls back to Inbox');
  assert.deepEqual(parent.due, { date: '2026-12-01', time: null });
  assert.deepEqual(parent.labels, ['x-y']);
  assert.equal(parent.priority, 4);
  assert.equal(s.tasks.find((t) => t.title === 'Child').projectId, null, 'a sub-task lives where its parent lives');
  assert.equal(new Set(s.tasks.map((t) => t.id)).size, 5, 'ids are unique');
  const orphan = s.tasks.find((t) => t.title === 'Orphan');
  assert.equal(orphan.parentId, null);
  assert.equal(orphan.repeat, null, 'no repeat without a due day');
  assert.equal(s.projects.length, 1);
  assert.equal(s.projects[0].color, 'grey');
  assert.equal(s.projects[0].sections.length, 1);
  assert.equal(s.settings.dailyGoal, 99);
  // Normalizing twice changes nothing.
  assert.deepEqual(C.normalize(JSON.parse(JSON.stringify(s))), s);
});

test('ticking: plain, with sub-tasks, repeating, and undoing', () => {
  const s = C.emptyState();
  const now = { day: TODAY, iso: '2026-11-13T10:00:00.000Z' };
  const a = C.addTask(s, { title: 'A' }, now.iso);
  const sub = C.addTask(s, { title: 'A1', parentId: a.id }, now.iso);
  const r = C.addTask(s, { title: 'R', due: { date: TODAY }, repeat: { every: 1, unit: 'day' } }, now.iso);
  assert.equal(sub.parentId, a.id);

  assert.deepEqual(C.completeTask(s, a.id, now), { repeated: false });
  assert.ok(a.done && sub.done, 'sub-tasks finish with their parent');
  assert.equal(s.stats.days[TODAY], 1);

  assert.deepEqual(C.completeTask(s, r.id, now), { repeated: true, next: '2026-11-14' });
  assert.equal(r.done, false);
  assert.equal(s.log.length, 1);
  assert.equal(s.stats.days[TODAY], 2);

  C.reopenTask(s, sub.id);
  assert.ok(!sub.done && !a.done, 'reopening a sub-task reopens its parent');

  C.deleteTask(s, a.id);
  assert.deepEqual(s.tasks.map((t) => t.title), ['R']);
});

test('moving a task re-numbers its new neighbours and takes sub-tasks along', () => {
  const s = C.emptyState();
  const [a, b, c] = ['A', 'B', 'C'].map((title) => C.addTask(s, { title }, 'x'));
  const kid = C.addTask(s, { title: 'kid', parentId: c.id }, 'x');
  C.moveTask(s, c.id, { projectId: null }, a.id);
  assert.deepEqual(C.sortTasks(s.tasks.filter((t) => !t.parentId), 'manual').map((t) => t.title), ['C', 'A', 'B']);
  C.moveTask(s, c.id, { projectId: 'px', sectionId: 'sx' });
  assert.equal(kid.projectId, 'px');
  assert.equal(kid.sectionId, 'sx');
  assert.deepEqual(C.sortTasks(s.tasks.filter((t) => !t.parentId && !t.projectId), 'manual').map((t) => t.title), ['A', 'B']);
});

test('filters, search and streak', () => {
  const s = C.emptyState();
  const now = { day: TODAY, time: '10:00' };
  const a = C.addTask(s, { title: 'Alpha report', priority: 1, due: { date: '2026-11-10' }, labels: ['work'] }, 'x');
  const b = C.addTask(s, { title: 'Beta', due: { date: '2026-11-18' } }, 'x');
  const c = C.addTask(s, { title: 'Gamma', notes: 'see the report' }, 'x');
  const pick = (q) => s.tasks.filter((t) => C.matchesFilter(t, q, now)).map((t) => t.title);
  assert.deepEqual(pick({ due: 'overdue' }), ['Alpha report']);
  assert.deepEqual(pick({ due: 'week' }), ['Alpha report', 'Beta']);
  assert.deepEqual(pick({ due: 'none' }), ['Gamma']);
  assert.deepEqual(pick({ priorities: [1], labels: ['work'] }), ['Alpha report']);
  assert.deepEqual(pick({ projects: ['inbox'] }).length, 3);
  assert.deepEqual(C.searchTasks(s, 'REPORT').map((t) => t.title), ['Alpha report', 'Gamma']);
  assert.deepEqual(C.searchTasks(s, '@work').map((t) => t.title), ['Alpha report']);
  assert.deepEqual(C.sortTasks([c, b, a], 'due').map((t) => t.title), ['Alpha report', 'Beta', 'Gamma']);

  s.settings.dailyGoal = 2;
  s.stats.days = { '2026-11-13': 1, '2026-11-12': 2, '2026-11-11': 5, '2026-11-09': 9 };
  assert.equal(C.streak(s, TODAY), 2, 'today is not over yet, so it does not break the run');
});
