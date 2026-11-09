import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { step } from '../scenario-artifacts.mjs';
import { completeIpcEvidence } from '../stall-attribution.mjs';
import { ipcRow } from '../scenario-terminal.mjs';
import { summariseLeg } from '../scenario-native-stream.mjs';
import { legacyEvidenceProblems } from '../legacy-evidence.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';

// Literal producer shape, deliberately NOT generated from completeness contracts.
const ipc = () => ({ revision: 2, pings: 3, openStallMs: null, observedMs: 101,
  tickSamples: 2, maxTickDelayMs: 0, sawHidden: false, rejectedPings: 0,
  maxMs: 1, totalStallMs: 0 });
const search = () => ({ samples: [1, 2, 3, 4, 5, 6, 7], dropped: 0, medianMs: 4, p95Ms: 7 });

test('terminal/native producers preserve missing and invalid coverage, including errors and pending lower bounds', () => {
  for (const field of ['openStallMs', 'rejectedPings', 'sawHidden', 'tickSamples', 'observedMs', 'maxTickDelayMs']) {
    const input = ipc(); delete input[field];
    const terminal = ipcRow(input, 50);
    const native = summariseLeg({ ipcRead: input, pingMs: 50 }).ipc;
    assert.equal(completeIpcEvidence(terminal), false, field);
    assert.equal(completeIpcEvidence(native), false, field);
  }
  const pending = ipcRow({ ...ipc(), error: 'drain deadline', openStallMs: 900 }, 50);
  assert.equal(pending.openStallMs, 900);
  assert.equal(pending.sawHidden, false);
});

test('actual project search producer has samples/dropped, not count', () => {
  const r = validLegacyReport(['projects']);
  r.projects.runs.forEach(row => { row.search.keystroke = search(); });
  assert.deepEqual(legacyEvidenceProblems(r), []);
  for (const mutate of [k => k.samples.pop(), k => { delete k.samples[3]; }, k => { k.samples[3] = NaN; }, k => { k.dropped = 1; }]) {
    const broken = structuredClone(r); mutate(broken.projects.runs[2].search.keystroke);
    assert.ok(legacyEvidenceProblems(broken).length);
  }
});

for (const [phase, path] of [['artifacts', 'create.ipc'], ['projects', 'search.ipc'], ['native-resume', 'turn.ipc'], ['terminal', 'switches.0.ipc'], ['native-stream', 'hidden.ipc']]) {
  test(`${phase} requires every strict coverage field from actual IPC producer`, () => {
    const r = validLegacyReport([phase]);
    const row = r[phase === 'native-stream' ? 'nativeStream' : phase === 'native-resume' ? 'nativeResume' : phase].runs[2];
    const parts = path.split('.'), key = parts.pop(), parent = parts.reduce((a, k) => a[k], row);
    parent[key] = ipc();
    assert.deepEqual(legacyEvidenceProblems(r), []);
    for (const field of ['openStallMs', 'rejectedPings', 'sawHidden', 'tickSamples', 'observedMs', 'maxTickDelayMs', 'maxMs']) {
      const saved = parent[key]; parent[key] = { ...ipc() }; delete parent[key][field];
      assert.ok(legacyEvidenceProblems(r).length, field); parent[key] = saved;
    }
    parent[key] = { ...ipc(), sawHidden: true };
    assert.ok(legacyEvidenceProblems(r).length);
  });
}

// Execute emitted probe JS with a virtual page clock. No browser/app/process launch.
function page({ replyMs = 1, stuck = false } = {}) {
  let time = 0, next = 1;
  const jobs = new Map(), marks = new Map();
  const schedule = (fn, ms, interval = false) => { const id = next++; jobs.set(id, { fn, at: time + ms, ms, interval }); return id; };
  const context = vm.createContext({ performance: { now: () => time }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => jobs.delete(id),
    setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: id => jobs.delete(id) });
  context.window = { claude: { getPlatform: () => new Promise(resolve => { if (!stuck) schedule(resolve, replyMs); }) },
    __perfProbe: { mark: label => marks.set(label, time) } };
  const advance = async ms => {
    const end = time + ms;
    while (true) {
      const entry = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, job] = entry; time = job.at;
      if (job.interval) job.at += job.ms; else jobs.delete(id);
      job.fn(); await Promise.resolve(); await Promise.resolve();
    }
    time = end; await Promise.resolve(); await Promise.resolve();
  };
  const cdp = { async evaluate(expr) {
    if (expr.includes('const inWin =')) return { windowMs: marks.get('op:end') - marks.get('op:start'), longtaskSupported: true, longtaskMaxMs: 0 };
    return vm.runInContext(expr, context);
  } };
  return { cdp, advance, marks, context, time: () => time };
}
async function drive(p, promise) {
  let settled = false, value, error;
  promise.then(v => { value = v; settled = true; }, e => { error = e; settled = true; });
  for (let i = 0; i < 600 && !settled; i++) {
    // Flush controller/CDP promise chains before advancing the page clock; otherwise
    // the driver itself adds artificial time inside operation marks.
    for (let j = 0; j < 30; j++) await Promise.resolve();
    if (!settled) await p.advance(5);
  }
  assert.ok(settled, 'bounded page handshake must settle');
  if (error) throw error;
  return value;
}

test('exported actual step gives fast operation timer-ready complete coverage outside operation latency', async () => {
  const p = page();
  const out = await drive(p, step(p.cdp, 'op', async () => ({ ok: true, operationMs: 0 }), { pingMs: 50 }));
  assert.equal(out.operationMs, 0);
  assert.ok(p.marks.get('op:start') >= 50, 'timer readiness must precede operation');
  assert.equal(completeIpcEvidence(out.ipc), true);
});

test('exported actual step drains a normal reply pending at operation end without changing latency', async () => {
  const p = page({ replyMs: 30 });
  const out = await drive(p, step(p.cdp, 'op', async () => { await p.advance(21); return { ok: true, operationMs: 21 }; }, { pingMs: 50 }));
  assert.equal(out.operationMs, 21);
  assert.equal(completeIpcEvidence(out.ipc), true);
  assert.equal(out.ipc.openStallMs, null);
  assert.ok(out.ipc.boundary.elapsedMs > 0, 'normal pending reply must actually drain');
  assert.ok(out.ipc.observedMs > out.probe.windowMs, 'setup/drain must not enter renderer operation window');
  assert.match(out.ipc.boundary.scope, /exclude setup\/drain/);
});

test('actual exported step observations satisfy artifact/project/native-resume evidence without synthesized validity', async () => {
  const p = page();
  const produced = await drive(p, step(p.cdp, 'op', async () => { await p.advance(1); return { ok: true }; }, { pingMs: 50 }));
  for (const [phase, section, path] of [['artifacts', 'artifacts', 'create'], ['projects', 'projects', 'search'], ['native-resume', 'nativeResume', 'turn']]) {
    const r = validLegacyReport([phase]);
    const row = r[section].runs[2];
    row[path] = { ...row[path], ipc: produced.ipc, probe: produced.probe, ok: produced.ok };
    assert.deepEqual(legacyEvidenceProblems(r), [], phase);
  }
});

test('exported actual step never credits a stuck initial reply as fast coverage', async () => {
  const p = page({ stuck: true }); let ran = false;
  const out = await drive(p, step(p.cdp, 'op', async () => { ran = true; return { ok: true }; }, { pingMs: 50 }));
  assert.equal(ran, false);
  assert.notEqual(out.ok, true);
  assert.equal(completeIpcEvidence(out.ipc), false);
});

test('exported actual step preserves a genuinely stuck operation-boundary ping and fails drain', async () => {
  const p = page();
  const out = await drive(p, step(p.cdp, 'op', async () => {
    p.context.window.claude.getPlatform = () => new Promise(() => {});
    await p.advance(60);
    return { ok: true, operationMs: 60 };
  }, { pingMs: 50 }));
  assert.equal(out.operationMs, 60);
  assert.equal(completeIpcEvidence(out.ipc), false);
  assert.match(out.ipc.error, /deadline/);
  assert.ok(out.ipc.openStallMs >= 1000);
});

test('successful immediate reply is not timer readiness; missing timer callbacks prevent operation', async () => {
  const p = page();
  p.context.setInterval = () => 123;
  let ran = false;
  const out = await drive(p, step(p.cdp, 'op', async () => { ran = true; return { ok: true }; }, { pingMs: 50 }));
  assert.equal(ran, false);
  assert.equal(out.ipc.pings, 1); // initial void ping exists and completed
  assert.equal(out.ipc.tickSamples, 0);
  assert.equal(completeIpcEvidence(out.ipc), false);
});
