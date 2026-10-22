// Offline: lane F's app-side seams with injected runners/CDP/fs. Real file work uses disposable temp directories only; no app is launched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOUND } from '../bounded-exec.mjs';
import { buildDiffStrings, backgroundIndexHook, buildLaneManifest, createWorkloadDeps, diffStateSource, diffTranscriptLines, generateRung, generationStatus, groupLimits,
  largeDiffAction, memoryBoundRecord, readIndexEvidence, readMarks, runChild, writeSpecCase } from '../scenario-workloads.mjs';
import { copyVerified, runChildOp } from '../ladder-child.mjs';
import { CSV_FULLREAD_STATE_SOURCE, CSV_FULLREAD_CLICK_SOURCE, findSessionTranscript, pathListStateSource, pathListTranscriptLine, validateDocumentManifest } from '../scenario-document-stalls.mjs';
import { ORIGINAL_JPEG, ladderGroups } from '../workload-lane.mjs';
import { jpegSize } from '../image-encode.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const okRun = (value) => async () => ({ status: 'ok', bound: BOUND.systemd, memoryMaxMb: 1, stdout: JSON.stringify(value) + '\n', stderr: '' });

test('generationStatus: a bound kill keeps its own status; any other child failure is an instrument failure', () => {
  assert.equal(generationStatus({ status: 'ok' }), 'ok');
  assert.equal(generationStatus({ status: 'failed:memory-bound' }), 'failed:memory-bound');
  assert.equal(generationStatus({ status: 'failed:no-memory-bound' }), 'failed:no-memory-bound');
  assert.equal(generationStatus({ status: 'failed:timeout' }), 'failed:generation-exit');
  assert.equal(generationStatus({ status: 'failed:exit' }), 'failed:generation-exit');
});

test('runChild: ok parses the last JSON line; a bound kill and a child-reported error are recorded with detail', async () => {
  const ok = await runChild({ op: 'x' }, { bound: BOUND.systemd, memoryMaxMb: 64, run: okRun({ ok: true, cases: [1] }) });
  assert.equal(ok.status, 'ok'); assert.deepEqual(ok.value.cases, [1]);
  const killed = await runChild({ op: 'x' }, { bound: BOUND.systemd, memoryMaxMb: 64, run: async () => ({ status: 'failed:memory-bound', signal: 'SIGKILL', code: null, stdout: '', stderr: '' }) });
  assert.equal(killed.status, 'failed:memory-bound'); assert.match(killed.detail, /SIGKILL/);
  const said = await runChild({ op: 'x' }, { bound: BOUND.systemd, memoryMaxMb: 64, run: okRun({ ok: false, error: 'boom' }) });
  assert.deepEqual([said.status, said.detail], ['failed:generation-exit', 'boom']);
  const garbage = await runChild({ op: 'x' }, { bound: BOUND.systemd, memoryMaxMb: 64, run: async () => ({ status: 'ok', stdout: 'not json', stderr: '' }) });
  assert.equal(garbage.status, 'failed:generation-exit');
});

test('generateRung: each source goes through bounded children with the right bound size, images are read back in a second child', async () => {
  const jobs = [];
  const run = async ({ argv, memoryMaxMb }) => {
    const spec = JSON.parse(argv.at(-1)); jobs.push([spec.op, memoryMaxMb]);
    if (spec.op === 'doc') return { status: 'ok', stdout: JSON.stringify({ ok: true, cases: [{ id: spec.id }] }), stderr: '' };
    if (spec.op === 'image') return { status: 'ok', stdout: JSON.stringify({ ok: true, cases: [{ id: spec.spec.id, file: '/r/x.png', sha256: 'a'.repeat(64) }] }), stderr: '' };
    if (spec.op === 'verify-image') return { status: 'ok', stdout: JSON.stringify({ ok: true }), stderr: '' };
    if (spec.op === 'copy-original') return { status: 'ok', stdout: JSON.stringify({ ok: true, copy: { file: '/r/wealth-game.jpg', bytes: 416168, sha256: ORIGINAL_JPEG.sha256, source: ORIGINAL_JPEG.source } }), stderr: '' };
  };
  const g = Object.fromEntries(ladderGroups().flatMap((x) => x.rungs).map((r) => [r.source, r]));
  const doc = await generateRung(g.doc, '/r', { checkout: '/c', bound: BOUND.systemd, run });
  assert.deepEqual(doc.cases, [{ id: g.doc.id }]);
  const img = await generateRung(g.image, '/r', { checkout: '/c', bound: BOUND.systemd, run });
  assert.equal(img.status, 'ok');
  const orig = await generateRung(g.original, '/r', { checkout: '/c', bound: BOUND.systemd, run });
  assert.equal(orig.original.verifiedIdentical, true); assert.equal(orig.cases[0].shape.width, ORIGINAL_JPEG.width); assert.equal(orig.cases[0].kind, 'image-jpeg');
  assert.deepEqual(jobs.map((j) => j[0]), ['doc', 'image', 'verify-image', 'copy-original', 'verify-image']);
  assert.ok(jobs.every(([, mb]) => mb >= 64));
  // a verify child killed by the bound turns an otherwise generated image into a recorded memory-bound row
  const killVerify = async (j) => (JSON.parse(j.argv.at(-1)).op === 'verify-image' ? { status: 'failed:memory-bound', stdout: '', stderr: '' } : run(j));
  assert.equal((await generateRung(g.image, '/r', { checkout: '/c', bound: BOUND.systemd, run: killVerify })).status, 'failed:memory-bound');
  // no bound available -> refused, recorded
  const real = await generateRung(g.doc, '/r', { checkout: '/c', bound: BOUND.none });
  assert.equal(real.status, 'failed:no-memory-bound');
});

test('spec rungs get a hashed identity file; the manifest for each group kind passes the document harness validator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wl-spec-'));
  try {
    const rung = ladderGroups().find((g) => g.id === 'large-diff').rungs[1];
    const c = writeSpecCase(rung, root);
    assert.equal(c.sha256, sha(await readFile(c.file))); assert.deepEqual(c.shape, { lines: 5000 });
    assert.throws(() => writeSpecCase(rung, root), /EEXIST/, 'exclusive create: never overwrites');
    const m = buildLaneManifest(ladderGroups().find((g) => g.id === 'large-diff'), root, [c]);
    assert.equal(validateDocumentManifest(m, { extraKinds: ['large-diff', 'bg-index'] }).length, 1);
    assert.throws(() => validateDocumentManifest(m), /Unsupported document fixture kind/, 'custom kinds are refused unless the caller declares them');
    const img = { id: 'image-png-16x16', kind: 'image-png', marker: 'm', file: join(root, 'i.png'), bytes: 10, sha256: 'a'.repeat(64), shape: { width: 16, height: 16 } };
    assert.equal(validateDocumentManifest(buildLaneManifest({ mode: 'images' }, root, [img]), { images: true }).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('csv-fullread and the other ladder document kinds are accepted by the harness manifest validator', () => {
  const c = { id: 'csv-fullread-5120kib', kind: 'csv-fullread', marker: 'm', file: '/r/a.csv', bytes: 5 * 1024 * 1024, sha256: 'a'.repeat(64), shape: { rows: 2900 } };
  assert.equal(validateDocumentManifest({ schema: 1, root: '/r', cases: [c] }).length, 1);
});

test('copyVerified: byte copy, hash-checked, read-only, source untouched; a changed source or an existing destination is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wl-copy-'));
  try {
    const src = join(root, 'src.jpg'), body = Buffer.from('original image bytes'); await writeFile(src, body); await chmod(src, 0o644);
    const before = await stat(src);
    const r = await copyVerified({ source: src, destDir: join(root, 'out'), expectedSha256: sha(body) });
    assert.equal(r.sha256, sha(body)); assert.equal((await stat(r.file)).mode & 0o777, 0o444); assert.deepEqual(await readFile(r.file), body);
    const after = await stat(src); assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.mode & 0o777, 0o644);
    await assert.rejects(copyVerified({ source: src, destDir: join(root, 'out') }), /EEXIST/);
    await assert.rejects(copyVerified({ source: src, destDir: join(root, 'out2'), expectedSha256: 'f'.repeat(64) }), /source changed/);
    const viaOp = await runChildOp({ op: 'copy-original', source: src, destDir: join(root, 'out3'), name: 'c.jpg', expectedSha256: sha(body) });
    assert.equal(viaOp.copy.mode, '444');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the owner\'s original JPEG, when present, is the pinned file: hash, size and baseline 1620x1640 (read-only check, no copy)', async (t) => {
  let data; try { data = await readFile(ORIGINAL_JPEG.source); } catch { t.diagnostic('original JPEG not present on this machine; pin is checked where it exists'); return; }
  assert.equal(sha(data), ORIGINAL_JPEG.sha256); assert.equal(data.length, ORIGINAL_JPEG.bytes);
  const size = jpegSize(data); assert.deepEqual([size.width, size.height, size.baseline], [ORIGINAL_JPEG.width, ORIGINAL_JPEG.height, true]);
});

test('ladder-child doc and image ops write real fixtures in a shared root (exclusive), and verify-image checks size and hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wl-child-'));
  try {
    const doc = await runChildOp({ op: 'doc', root, checkout: '/unused-for-csv', id: 'csv-rows-64kib', profile: 'ladder' });
    assert.equal(doc.cases.length, 1); assert.equal(doc.cases[0].bytes > 60000, true);
    const full = await runChildOp({ op: 'doc', root, checkout: '/unused', id: 'csv-fullread-5120kib', profile: 'ladder' });
    assert.ok(full.cases[0].bytes >= 5 * 1024 * 1024 && full.cases[0].shape.rows > 2000);
    const prefixRows = Math.floor(3 * 1024 * 1024 / (full.cases[0].bytes / full.cases[0].shape.rows));
    assert.ok(prefixRows < 2000 && full.cases[0].shape.rows > 2000, `partial view must hold < 2000 rows (${prefixRows}) and the whole file > 2000`);
    const img = await runChildOp({ op: 'image', root, spec: { id: 'image-png-64x48', format: 'png', width: 64, height: 48, seed: 1 } });
    const c = img.cases[0];
    assert.equal((await runChildOp({ op: 'verify-image', file: c.file, format: 'png', width: 64, height: 48, sha256: c.sha256 })).ok, true);
    await assert.rejects(runChildOp({ op: 'verify-image', file: c.file, format: 'png', width: 65, height: 48, sha256: c.sha256 }), /expected 65x48/);
    await assert.rejects(runChildOp({ op: 'verify-image', file: c.file, format: 'png', width: 64, height: 48, sha256: 'e'.repeat(64) }), /differ/);
    await assert.rejects(runChildOp({ op: 'doc', root, checkout: '/x', id: 'csv-rows-64kib', profile: 'ladder' }), /EEXIST/);
    await assert.rejects(runChildOp({ op: 'nope' }), /unknown op/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('large diff: strings differ on every 10th line incl. the first, the transcript lines are a tool_use + tool_result pair', () => {
  const { oldStr, newStr } = buildDiffStrings(30, 'MARK');
  const o = oldStr.trimEnd().split('\n'), n = newStr.trimEnd().split('\n');
  assert.equal(o.length, 30); assert.deepEqual(n.map((l, i) => l !== o[i]).map(Number).reduce((a, b) => a + b, 0), 3); assert.match(n[0], /^MARK changed 0/);
  const [a, u] = diffTranscriptLines({ sessionId: 's', cwd: '/c', toolUseId: 'toolu_x', oldStr, newStr }).map(JSON.parse);
  assert.equal(a.type, 'assistant'); assert.equal(a.message.content[0].type, 'tool_use'); assert.equal(a.message.content[0].name, 'Edit'); assert.equal(a.message.content[0].input.old_string, oldStr);
  assert.equal(u.message.content[0].tool_use_id, 'toolu_x'); assert.equal(u.parentUuid, a.uuid);
});

test('large diff action: appends the lines, opens the collapsed card inside the window, returns a proof only once rows with the change are drawn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wl-diff-'));
  try {
    const rung = ladderGroups().find((g) => g.id === 'large-diff').rungs[0], c = writeSpecCase(rung, root);
    const appended = []; let toggled = 0, phase = 0;
    const cdp = { evaluate: async (src) => {
      if (src.includes('b.click()')) { toggled++; return { ok: true }; }
      phase++; return phase === 1 ? { open: false, rows: 0, hasChange: false } : { open: toggled > 0, rows: 15, hasChange: toggled > 0 };
    } };
    const waitUntil = async (fn) => { for (let i = 0; i < 5; i++) { const v = await fn(); if (v) return v; } throw new Error('never ready'); };
    const proof = await largeDiffAction({ f: c, cdp, transcript: () => ({ path: '/t.jsonl', sessionId: 's' }), waitUntil, unmountedBefore: true, manifest: { root: '/m' } }, { append: (p, t) => appended.push([p, t]) });
    assert.equal(appended[0][0], '/t.jsonl'); assert.equal(appended[0][1].trim().split('\n').length, 2);
    assert.equal(toggled, 1); assert.equal(proof.viewer, 'edit-diff'); assert.equal(proof.diffLines, 500); assert.equal(proof.rowsDrawn, 15);
    // already-open card is not toggled again
    toggled = 0; phase = 99; const opened = { evaluate: async (src) => (src.includes('b.click()') ? (toggled++, { ok: true }) : { open: true, rows: 15, hasChange: true }) };
    await largeDiffAction({ f: c, cdp: opened, transcript: () => ({ path: '/t', sessionId: 's' }), waitUntil, manifest: { root: '/m' } }, { append: () => {} }); assert.equal(toggled, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('page-side sources parse and behave against a minimal fake DOM (path list, CSV full read bar, diff card)', () => {
  const run = (src, ctx) => { const v = vm.runInNewContext(src, ctx); return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; };
  const bubble = (text, tokens) => ({ textContent: text, closest: () => null, querySelectorAll: () => Array(tokens).fill({}) });
  const doc = (bubbles) => ({ document: { querySelectorAll: () => bubbles } });
  assert.equal(run(pathListStateSource('MARK', '/p/last.txt'), doc([bubble('other', 0)])), null);
  const s = run(pathListStateSource('MARK', '/p/last.txt'), doc([bubble('x MARK /p/last.txt', 3)]));
  assert.deepEqual([s.tokens, s.hasLastPath], [3, true]);
  const btn = (t) => ({ textContent: t, disabled: false, click() { this.clicked = true; } });
  const pane = (buttons, text) => { const root = { querySelectorAll: () => buttons }; return { closest: () => root, parentElement: root, textContent: text, querySelector: (q) => (q === 'table' ? {} : null) }; };
  const win = (p) => ({ window: { __perfArt: { contentPane: () => p } } });
  assert.deepEqual(run(CSV_FULLREAD_STATE_SOURCE, win(pane([btn('Load the whole file')], 'cells'))), { banner: true, note: false, hasTable: true });
  assert.equal(run(CSV_FULLREAD_STATE_SOURCE, win(pane([], 'Large sheet — showing the first 2,000 rows'))).note, true);
  const b = btn('Load the whole file'); assert.equal(run(CSV_FULLREAD_CLICK_SOURCE, win(pane([b], ''))).ok, true); assert.equal(b.clicked, true);
  assert.equal(run(CSV_FULLREAD_CLICK_SOURCE, win(pane([], ''))).ok, false);
  const card = { querySelector: (q) => (q.includes('tool-card-body') ? { querySelectorAll: () => [1, 2], textContent: 'MARK changed 0' } : null) };
  const ds = run(diffStateSource('toolu_1', 'MARK'), { document: { querySelector: () => card } });
  assert.deepEqual([ds.open, ds.rows, ds.hasChange], [true, 2, true]);
});

test('path-list transcript line and session transcript lookup use the Claude Code shapes the app tails', () => {
  const line = JSON.parse(pathListTranscriptLine({ sessionId: 's1', cwd: '/c', text: '/a/b.txt\n/a/c.txt', now: new Date('2026-10-22T00:00:00Z') }));
  assert.deepEqual([line.type, line.sessionId, line.isMeta, line.message.role, line.message.content], ['user', 's1', false, 'user', '/a/b.txt\n/a/c.txt']);
  assert.ok(line.uuid && line.promptId);
  const t = findSessionTranscript('/home', '/work/dir', { readdir: () => ['old.jsonl', 'new.jsonl', 'x.txt'], stat: (p) => ({ mtimeMs: p.endsWith('new.jsonl') ? 2 : 1 }) });
  assert.equal(t.sessionId, 'new'); assert.equal(t.path, '/home/.claude/projects/-work-dir/new.jsonl');
  assert.throws(() => findSessionTranscript('/h', '/w', { readdir: () => [], stat: () => ({}) }), /No fake-Claude transcript/);
});

test('background index hook: marks and index evidence are read defensively; run() proves the refresh finished and the index holds conversations', async () => {
  const marks = [{ name: 'bg:chatsearch-refresh:start', t: 1 }, { name: 'bg:chatsearch-refresh:done', t: 2 }];
  const log = marks.map((m) => JSON.stringify(m)).join('\n');
  assert.deepEqual(readMarks('/x', { read: () => log + '\n{"partial' }).map((m) => m.t), [1, 2], 'a partial trailing line is skipped');
  assert.deepEqual(readMarks('/missing', { read: () => { throw new Error('ENOENT'); } }), []);
  const ev = readIndexEvidence('/h', { list: () => ['claude-meta.json', 'claude-turns.jsonl', 'other'], read: () => '{"conversations":{"a":1,"b":2}}', stat: () => ({ size: 99 }) });
  assert.deepEqual(ev, { conversations: 2, turnsBytes: 99 });
  assert.deepEqual(readIndexEvidence('/h', { list: () => { throw new Error('ENOENT'); } }), { conversations: 0, turnsBytes: 0 });
  const home = await mkdtemp(join(tmpdir(), 'wl-idx-'));
  try {
    const perfLog = join(home, 'perf-marks.jsonl'), destroyed = [];
    const t = Date.now() + 5000;
    await writeFile(perfLog, [{ name: 'bg:chatsearch-refresh:start', t }, { name: 'bg:chatsearch-refresh:done', t: t + 800 }].map((m) => JSON.stringify(m)).join('\n'));
    const ctx = { f: { marker: 'M' }, cdp: { evaluate: async (src) => destroyed.push(src) }, fixture: { perfLog, home }, waitUntil: async (fn) => (await fn()) || Promise.reject(new Error('not ready')), prepared: { triggerId: 'sess-9' }, unmountedBefore: true };
    await assert.rejects(backgroundIndexHook.run(ctx), /did not exercise indexing.*0 conversations/);
    await mkdir(join(home, '.youcoded', 'chatsearch'), { recursive: true });
    await writeFile(join(home, '.youcoded', 'chatsearch', 'claude-meta.json'), JSON.stringify({ conversations: { a: {}, b: {} } }));
    const proof = await backgroundIndexHook.run(ctx);
    assert.match(destroyed[0], /session\.destroy\("sess-9"\)/);
    assert.equal(proof.viewer, 'background-index-refresh'); assert.equal(proof.indexRefresh.conversationsIndexed, 2); assert.equal(proof.indexRefresh.workerWallMs, 800);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('limits per group, memory bound record, and deps wiring pass the app-facing options through', async () => {
  assert.deepEqual(groupLimits({ id: 'csv' }), { timeoutMs: 15000, maxRssMb: 1536 });
  assert.equal(groupLimits({ id: 'background-indexing' }).timeoutMs, 60000);
  assert.match(memoryBoundRecord({ bound: BOUND.prlimit, systemdUser: false, prlimit: true }).note, /looser/);
  assert.match(memoryBoundRecord({ bound: BOUND.none }).note, /NO bound/);
  const seen = [];
  const deps = createWorkloadDeps({ checkout: '/c', build: { binary: '/b' }, makeFixtureBase: (g) => ({ home: `/h/${g.id}` }), withBoot: async (f, fn, g) => fn({ g }), getRenderer: () => ({ source: 'SystemInfo' }),
    boundInfo: { bound: BOUND.systemd, systemdUser: true, prlimit: true }, recordInterference: () => {}, runCasesImpl: async (app, fixture, manifest, opts) => { seen.push(opts); return { cases: [] }; } });
  const imageGroup = ladderGroups().find((g) => g.mode === 'images'), diffGroup = ladderGroups().find((g) => g.id === 'large-diff');
  await deps.runCases({ app: {}, fixture: {}, group: imageGroup, manifest: {}, caseIds: ['a'] });
  await deps.runCases({ app: {}, fixture: {}, group: diffGroup, manifest: {}, caseIds: ['b'] });
  assert.equal(seen[0].images, true); assert.deepEqual(seen[0].imageRenderingEvidence, { source: 'SystemInfo' }); assert.equal(seen[0].timeoutMs, 15000);
  assert.equal(seen[1].images, false); assert.equal(seen[1].timeoutMs, 30000); assert.deepEqual(Object.keys(seen[1].custom).sort(), ['bg-index', 'large-diff']);
  assert.equal(await deps.boot({}, async (a) => a.g.id, diffGroup), 'large-diff');
});
