import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions, coversAction, assessMixed, assessIpc, assessVisiblePane, assessIdle, assessStreamDisplay, assessToolCard, assessControl, assessCadence, admitLiveControl, assessMixedProgress, cpuSeconds, prepareMixedFixture, cleanupMixedFixture, validateRoleMapping, preflightMixed, portFree } from '../mixed-activity.mjs';

const roles = ['stream-1', 'stream-2', 'stream-3', 'tool-1', 'tool-2', 'idle'];
test('CLI refuses implicit display, missing package, unsafe output, and unbounded runtime', () => {
  const base = ['--checkout', '/private/checkout', '--app-dir', '/private/package', '--out', '/private/worktree/scratch/perf-lab/mixed.json', '--real-display', ':1'];
  assert.equal(parseOptions(base, '/private/worktree').maxMinutes, 5);
  assert.equal(parseOptions([...base.slice(0, -1), ':0'], '/private/worktree').realDisplay, ':0');
  assert.equal(parseOptions([...base,'--history','long','--files','open'],'/private/worktree').files,'open');
  assert.throws(()=>parseOptions([...base,'--files','open'],'/private/worktree'),/files open requires long/);
  assert.throws(()=>parseOptions([...base,'--history','typo'],'/private/worktree'),/files open requires long/);
  assert.throws(() => parseOptions([...base, '--stream-seconds', '18'], '/private/worktree'), /protocol/);
  assert.throws(() => parseOptions([...base, '--stream-seconds', '19', '--tool-seconds', '19'], '/private/worktree'), /protocol/);
  for (const invalid of [base.slice(0, -2), [...base, '--max-minutes', '11'], [...base, '--max-minutes', '0'], [...base.slice(0, 5), '/tmp/unowned.json', ...base.slice(6)], [...base.slice(0, 3), 'relative', ...base.slice(4)], [...base.slice(0, -1), ':99']]) assert.throws(() => parseOptions(invalid, '/private/worktree'));
});
test('five producers must cover every mixed switch, not simply overlap each other', () => {
  assert.equal(coversAction({ start: 10, end: 40 }, { start: 20, end: 30 }), true);
  assert.equal(coversAction({ start: 10, end: 25 }, { start: 20, end: 30 }), false);
  assert.equal(assessMixed({ completed: false, reason: 'tool-2 never started' }).status, 'incomplete');
  const actions = Array.from({ length: 12 }, (_, i) => ({ from: roles[(i + 5) % 6], to: roles[i % 6], beforeId: `id-${(i + 5) % 6}`, afterId: `id-${i % 6}`, start: 20 + i * 1600, end: 21 + i * 1600, focus: true, visible: true, content: true, rafMs: 2, ipcMs: 3, phase: 'mixed' }));
  const record = { completed: true, roles: Object.fromEntries(roles.map((role, i) => [role, `id-${i}`])), actions, streams: Object.fromEntries(roles.slice(0, 3).map(role => [role, { start: 10, end: 30000, exact: true, persistedExact: true, complete: true, deltasSent: 1500, plannedDeltas: 1500, visibleExact: true, achievedPerSec: 50, userExact: true }])), tools: Object.fromEntries(roles.slice(3, 5).map(role => [role, { start: 9, end: 40000, continuous: true, resultExact: true, ackExact: true, callExact: true, cardConfirmed: true, persistedExact: true, userExact: true }])), idle: { noRequests: true, visible: true, noTimelineOrTurns: true }, control: { verified: true }, cleanup: { sessionsClosed: true, appStopped: true }, environment: { focus: true, visibility: 'visible', viewport: { width: 1400, height: 900 }, gpu: 'software' }, cpu: { totalSeconds: 1 }, memory: { totalMb: 1 }, longTasks: { longtaskCount: 0, longtaskSupported: true }, ipc: { pings: 4, rejectedPings: 0, openStallMs: null, medianMs: 2, p95Ms: 4, maxMs: 5, observedMs: 400 } };
  record.mixedProgress = { early: { at: 22, streams: { 'stream-1': 1, 'stream-2': 1, 'stream-3': 1 }, tools: { 'tool-1': 1, 'tool-2': 1 } }, late: { at: 17622, streams: { 'stream-1': 880, 'stream-2': 880, 'stream-3': 880 }, tools: { 'tool-1': 7, 'tool-2': 7 } } };
  record.control = { verified: true, firstWriteAt: 1, lastWriteAt: 3000, actions: [{ phase: 'control', from: 'idle', to: 'stream-1', start: 10, end: 20, beforeId: 'id-5', afterId: 'id-0', visible: true, content: true }, { phase: 'control', from: 'stream-1', to: 'idle', start: 40, end: 50, beforeId: 'id-0', afterId: 'id-5', visible: true, content: true }], otherProducersStarted: false, persistedExact: true };
  record.cpu = { totalSeconds: 1, hz: 100 };
  assert.equal(assessMixed(record).status, 'measured');
  const failedProvider = assessMixed({ ...record, providerCleanupError: 'provider socket still open' });
  assert.equal(failedProvider.status, 'incomplete');
  assert.ok(failedProvider.reasons.some(reason => reason.includes('provider cleanup failed')));
  assert.equal(assessMixed({ ...record, actions: actions.map((a, i) => ({ ...a, start: 20 + i * 100, end: 21 + i * 100 })) }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, mixedProgress: { ...record.mixedProgress, late: { ...record.mixedProgress.late, streams: { ...record.mixedProgress.late.streams, 'stream-3': 200 } } } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, control: { ...record.control, lastWriteAt: 30 } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, control: { ...record.control, actions: record.control.actions.map(a => ({ ...a, afterId: 'wrong-id' })) } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, control: { ...record.control, otherProducersStarted: true } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, cpu: { totalSeconds: 1, hz: null } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, tools: { ...record.tools, 'tool-2': { ...record.tools['tool-2'], start: 23 } } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, streams: { ...record.streams, 'stream-3': { ...record.streams['stream-3'], persistedExact: false } } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, tools: { ...record.tools, 'tool-1': { ...record.tools['tool-1'], cardConfirmed: false } } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, cleanup: { sessionsClosed: false, appStopped: false } }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, actions: actions.slice(0, 11) }).status, 'incomplete');
  assert.equal(assessMixed({ ...record, idle: { noRequests: false } }).status, 'incomplete');
  const long={...record, calibration:{status:'calibrated'},mixedCadence:{status:'calibrated'},options:{history:'long',files:'open'},providerRequests:[{role:'stream-1',followup:false},{role:'stream-1',followup:false},...roles.slice(1,5).map(role=>({role,followup:false})),...roles.slice(3,5).map(role=>({role,followup:true}))],providerRejected:[],histories:Object.fromEntries(roles.map(role=>[role,{integrity:true,newTurn:{ok:true},loaded:{ok:true},latestArrival:{ok:true},finalArrival:{ok:true},filesRegistered:true,bytes:50000,bodyChars:30000,historyProfile:'bounded-turns',turns:200}])),drawerSetup:{'stream-1':{verified:true},'tool-1':{verified:true}},actions:actions.map(a=>({...a,historyOk:true,drawerOk:true,drawerExpected:['stream-1','tool-1'].includes(a.to),geometry:{chatWidth:800,drawerWidth:400}}))};
  assert.equal(assessMixed(long).status,'measured');
  assert.equal(assessMixed({...long,actions:long.actions.map((a,i)=>i===7?{...a,drawerOk:false}:a)}).status,'incomplete');
  assert.equal(assessMixed({...long,histories:{...long.histories,'idle':{...long.histories.idle,loaded:{ok:false}}}}).status,'incomplete');
  assert.equal(assessMixed({...long,providerRejected:[{message:'summary not marked'}]}).status,'incomplete');
  assert.equal(assessMixed({...long,calibration:{status:'uncontrolled'}}).status,'incomplete');
  assert.equal(assessMixed({...long,mixedCadence:{status:'uncontrolled'}}).status,'incomplete');
});
test('rAF calibration at 1Hz is uncontrolled, not proof of fast/healthy rendering', () => {
  const healthy={observedMs:2100,frames:120,framesPerSec:57,focus:true,visibility:'visible',longtaskSupported:true};
  assert.equal(assessCadence(healthy).status,'calibrated');
  for(const sample of [{...healthy,frames:2,framesPerSec:1},{...healthy,focus:false},{...healthy,visibility:'hidden'}, {...healthy,framesPerSec:null},{...healthy,observedMs:100}]) assert.equal(assessCadence(sample).status,'uncontrolled');
  assert.equal(assessCadence(null).status,'uncontrolled');
});
test('control admission does not await native persisted assistant delta; completion refuses admission', () => {
  const live = { role: 'stream-1', firstWriteAt: 100, endedAt: null, deltasSent: 1 };
  assert.equal(admitLiveControl(live, [], []), true); // coalesced assistant text may not persist until turn end
  assert.equal(admitLiveControl(live, [{ type: 'user-message', data: { text: 'MIXED_ROLE:stream-1' } }], []), true);
  assert.equal(admitLiveControl({ ...live, endedAt: 200 }, [], []), false);
  assert.equal(admitLiveControl({ ...live, firstWriteAt: null }, [], []), false);
  assert.equal(admitLiveControl(live, [], [{ role: 'tool-1' }]), false);
  assert.equal(admitLiveControl({ ...live, role: 'stream-2' }, [], []), false);
  const src = readFileSync(new URL('../mixed-activity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src.slice(src.indexOf("const controlRec ="), src.indexOf("const controlActions =")), /assistant-text|first persisted delta/);
});
test('control requires real two switches during only its single stream, mixed progress advances across phase', () => {
  assert.equal(assessControl({ firstWriteAt: 0, lastWriteAt: 2000, actions: [{ from: 'idle', to: 'stream-1', start: 100, end: 120, visible: true, content: true }, { from: 'stream-1', to: 'idle', start: 500, end: 520, visible: true, content: true }], otherProducersStarted: false, persistedExact: true }), true);
  assert.equal(assessControl({ firstWriteAt: 0, lastWriteAt: 200, actions: [{ from: 'idle', to: 'stream-1', start: 100, end: 120 }, { from: 'stream-1', to: 'idle', start: 500, end: 520 }] }), false);
  assert.equal(assessMixedProgress({ early: { at: 1, streams: { 'stream-1': 1, 'stream-2': 1, 'stream-3': 1 }, tools: { 'tool-1': 1, 'tool-2': 1 } }, late: { at: 18000, streams: { 'stream-1': 751, 'stream-2': 751, 'stream-3': 751 }, tools: { 'tool-1': 6, 'tool-2': 6 } } }), true);
  assert.equal(assessMixedProgress({ early: { at: 1, streams: { 'stream-1': 1, 'stream-2': 1, 'stream-3': 1 }, tools: { 'tool-1': 1, 'tool-2': 1 } }, late: { at: 18000, streams: { 'stream-1': 751, 'stream-2': 751, 'stream-3': 751 }, tools: { 'tool-1': 1, 'tool-2': 6 } } }), false);
  assert.equal(cpuSeconds(new Map([[1, 100]]), new Map([[1, 200]]), 250), .4);
  const src = readFileSync(new URL('../mixed-activity.mjs', import.meta.url), 'utf8');
  for (const role of ['stream-1', 'tool-1', 'tool-2']) assert.ok(src.includes(`'${role}'`) && src.includes('report.roleScreenshots[role] = dest'));
  assert.throws(() => cpuSeconds(new Map([[1, 100]]), new Map([[1, 200]]), 0), /HZ/);
  assert.match(readFileSync(new URL('../mixed-activity.mjs', import.meta.url), 'utf8'), /textContent/);
  assert.doesNotMatch(readFileSync(new URL('../mixed-activity.mjs', import.meta.url), 'utf8'), /p\.querySelector\('\.chat-scroll'\)\?\.innerText/);
});
test('IPC requires actual completed non-rejected replies with finite latency', () => {
  const good = { pings: 4, rejectedPings: 0, openStallMs: null, medianMs: 2, p95Ms: 4, maxMs: 5, observedMs: 400 };
  assert.equal(assessIpc(good), true);
  assert.equal(assessIpc({ ...good, observedMs: undefined }), true); // real readIpcStallProbe returns no observedMs
  for (const bad of [{ ...good, pings: 0 }, { ...good, rejectedPings: 1 }, { ...good, openStallMs: 1000 }, { ...good, p95Ms: null }, { ...good, medianMs: NaN }, null]) assert.equal(assessIpc(bad), false);
});
test('visible pane identity never uses SessionStrip index and idle may contain context text', () => {
  const panes = [{ id: 'hidden-id', hidden: true, hasScroll: true, timelineCount: 1 }, { id: 'actual-id', hidden: false, hasScroll: true, timelineCount: 0, text: 'Context banner' }];
  assert.equal(assessVisiblePane(panes, 'actual-id'), true);
  assert.equal(assessVisiblePane(panes, 'hidden-id'), false);
  assert.equal(assessVisiblePane([{ ...panes[1], hasScroll: false }], 'actual-id'), false);
  assert.equal(assessIdle({ pane: panes[1], events: [], requests: [] }), true);
  assert.equal(assessIdle({ pane: { ...panes[1], timelineCount: 1 }, events: [], requests: [] }), false);
  assert.equal(assessIdle({ pane: panes[1], events: [{ type: 'turn-complete' }], requests: [] }), false);
  assert.equal(assessIdle({ pane: panes[1], events: [], requests: [{ role: 'idle' }] }), false);
});
test('collapsed tool card uses real call ID and completed header, not hidden stdout', () => {
  const card = { id: 'mixed-tool-1-token', text: 'Ran a command · "Run owned tool-1 progress fixture"' };
  assert.equal(assessToolCard(card, 'tool-1', 'token'), true);
  assert.equal(assessToolCard({ ...card, id: 'mixed-tool-2-token' }, 'tool-1', 'token'), false);
  assert.equal(assessToolCard({ ...card, text: 'Running a command · "Run owned tool-1 progress fixture"' }, 'tool-1', 'token'), false);
});
test('stream visibility uses role-specific first and end markers, not exact Markdown innerText', () => {
  assert.equal(assessStreamDisplay('MIXED_TEXT:stream-1:0000 MIXED_TEXT:stream-1:1499', 'stream-1', 1500), true);
  assert.equal(assessStreamDisplay('MIXED_TEXT:stream-2:0000 MIXED_TEXT:stream-2:1499', 'stream-1', 1500), false);
  assert.equal(assessStreamDisplay('MIXED_TEXT:stream-1:0000 only', 'stream-1', 1500), false);
});
test('stamp, hash, foreign process and occupied CDP port fail before fixture/launch', async () => {
  const o = { checkout: '/private/checkout', appDir: '/private/package', cdpPort: 9592 };
  const calls = [];
  const deps = { loadStamp: async () => { calls.push('stamp'); return { sha: 'abc' }; }, refuse: () => calls.push('process'), portCheck: async () => calls.push('port'), hash: async () => { calls.push('hash'); return 'digest'; } };
  assert.equal((await preflightMixed(o, deps)).executableSha256, 'digest');
  assert.deepEqual(calls, ['stamp', 'process', 'port', 'hash']);
  await assert.rejects(preflightMixed(o, { ...deps, refuse: () => { throw Error('foreign package process'); } }), /foreign/);
  await assert.rejects(preflightMixed(o, { ...deps, loadStamp: async () => { throw Error('stale stamp'); } }), /stale/);
  const server = createServer();
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  try { await assert.rejects(portFree(server.address().port), /EADDRINUSE/); }
  finally { await new Promise(ok => server.close(ok)); }
});

test('roles have six distinct IDs; owned cleanup preserves uncertain app fixture', async () => {
  assert.throws(() => validateRoleMapping(Object.fromEntries(roles.map(role => [role, 'same']))));
  const parent = await mkdtemp(join(tmpdir(), 'mixed-controller-'));
  try {
    const fixture = await prepareMixedFixture(parent, { fixtureFactory: (root) => ({ home: join(root, 'home'), projects: { alpha: join(root, 'project') } }) });
    assert.equal((await readFile(join(fixture.root, 'owner'), 'utf8')).trim(), 'mixed-activity');
    assert.equal(await cleanupMixedFixture(fixture.root, { appStopped: false }), false);
    assert.equal((await readFile(join(fixture.root, 'owner'), 'utf8')).trim(), 'mixed-activity');
    const foreign = await mkdtemp(join(parent, 'foreign-'));
    await writeFile(join(foreign, 'owner'), 'foreign');
    await assert.rejects(cleanupMixedFixture(foreign, { appStopped: true }), /unowned/);
    assert.equal(await cleanupMixedFixture(fixture.root, { appStopped: true }), true);
    await assert.rejects(readFile(join(fixture.root, 'owner')), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); }
});
