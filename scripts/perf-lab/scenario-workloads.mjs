// scripts/perf-lab/scenario-workloads.mjs — the app/IO side of lane F (workload-lane.mjs holds the pure orchestration).
//
// Real wiring only: bounded fixture-generation children, the document lab's runDocumentStallCases for every rung, and the two
// custom workloads (large diff, background index refresh) that ride on that same harness so they get the same calibration
// controls, probes, provenance and watchdog. Not runnable offline end to end (needs a booted app); the logic it feeds is covered by
// workload-lane.test.mjs / scenario-workloads.test.mjs with injected seams.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOUND, detectBound, runBounded } from './bounded-exec.mjs';
import { runDocumentStallCases, MEMORY_BASIS, pathListTranscriptLine } from './scenario-document-stalls.mjs';
import { IMAGE_LIMITS } from './stall-fixtures.mjs';
import { GENERATION_BOUND_MB, ORIGINAL_JPEG } from './workload-lane.mjs';

export const LANE_CALIBRATION_ATTEMPTS = 3;
const CHILD = fileURLToPath(new URL('./ladder-child.mjs', import.meta.url));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── memory-bounded generation ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Map a bounded child's outcome onto a rung status: a bound kill is `failed:memory-bound`; any other child failure is an instrument failure. */
export function generationStatus(result) {
  if (result.status === 'ok') return 'ok';
  if (result.status === 'failed:memory-bound' || result.status === 'failed:no-memory-bound') return result.status;
  return 'failed:generation-exit';
}
function lastJson(stdout) {
  const line = String(stdout).trim().split('\n').filter(Boolean).at(-1);
  try { return JSON.parse(line); } catch { return null; }
}

// WHY the spec travels in the environment, not on the command line: the app teardown (launch.mjs sweep) SIGTERMs every process whose command
// line contains the fixture HOME, and all lane F fixtures share one HOME path (scratch/perf-lab/home). A generation child carries that path
// in its JSON spec, so a late sweep from the previous group's app killed it ("failed:exit (SIGTERM)"). It only ever hit the first child after
// a group that had needed a second boot. With the spec in the environment the child's command line names nothing a sweep looks for.
export const CHILD_SPEC_ENV = 'PERF_LAB_CHILD_SPEC';
// A child killed by a signal that is not our own timeout and not the memory bound came from outside. Retry it (bounded) and say so.
export const FOREIGN_SIGNAL_RETRIES = 2;
const foreignSignal = (r) => r.status === 'failed:exit' && (r.signal === 'SIGTERM' || r.signal === 'SIGINT' || r.signal === 'SIGHUP' || r.code === 143);

/** One bounded child. Returns { status:'ok', value } or { status:<failed:...>, detail }. */
export async function runChild(spec, { bound, memoryMaxMb, timeoutMs = 120_000, run = runBounded, retries = FOREIGN_SIGNAL_RETRIES } = {}) {
  const attempts = [];
  let result;
  for (let attempt = 0; attempt <= retries; attempt++) {
    result = await run({ argv: [process.execPath, CHILD], env: { ...process.env, [CHILD_SPEC_ENV]: JSON.stringify(spec) }, memoryMaxMb, timeoutMs, bound });
    attempts.push(`${result.status}${result.signal ? ` (${result.signal})` : result.code != null ? ` (exit ${result.code})` : ''} after ${result.elapsedMs ?? '?'} ms`);
    if (!foreignSignal(result)) break;
    await sleep(500 * (attempt + 1));
  }
  const status = generationStatus(result);
  const retried = attempts.length > 1 ? ` [attempts: ${attempts.join('; ')}]` : '';
  if (status !== 'ok') return { status, detail: `${result.status}${result.signal ? ` (${result.signal})` : result.code != null ? ` (exit ${result.code})` : ''}: ${String(result.stderr || result.stdout).trim().split('\n').pop()?.slice(0, 200) ?? ''}${retried}`, bound: result.bound, memoryMaxMb };
  const value = lastJson(result.stdout);
  if (!value?.ok) return { status: 'failed:generation-exit', detail: value?.error ?? 'child printed no result' };
  return { status: 'ok', value, bound: result.bound, memoryMaxMb, ...(attempts.length > 1 ? { attempts } : {}) };
}

/** Generate one rung's file(s) in `root` under the external memory bound; verify images by reading them back (also bounded). */
export async function generateRung(rung, root, { checkout, bound, run = runBounded, specWriter = writeSpecCase }) {
  const opts = (mb) => ({ bound, memoryMaxMb: mb, run });
  if (rung.source === 'doc') {
    const r = await runChild({ op: 'doc', root, checkout, id: rung.id, profile: 'ladder' }, opts(GENERATION_BOUND_MB.document));
    return r.status === 'ok' ? { status: 'ok', cases: r.value.cases } : r;
  }
  if (rung.source === 'image') {
    const made = await runChild({ op: 'image', root, spec: rung.spec }, opts(GENERATION_BOUND_MB.image));
    if (made.status !== 'ok') return made;
    const c = made.value.cases[0];
    // WHY a separate bounded read-back: "image decode" is the other thing that can blow memory; proving the file parses (size + hash)
    // in its own bounded child means a corrupt or oversized fixture is a recorded row before the app ever sees it.
    const seen = await runChild({ op: 'verify-image', file: c.file, format: rung.spec.format, width: rung.spec.width, height: rung.spec.height, sha256: c.sha256 }, opts(GENERATION_BOUND_MB.verify));
    return seen.status === 'ok' ? { status: 'ok', cases: [c] } : seen;
  }
  if (rung.source === 'original') {
    const o = rung.original;
    const copied = await runChild({ op: 'copy-original', source: o.source, destDir: root, name: 'wealth-game.jpg', expectedSha256: o.sha256 }, opts(GENERATION_BOUND_MB.copy));
    if (copied.status !== 'ok') return copied;
    const copy = copied.value.copy;
    const seen = await runChild({ op: 'verify-image', file: copy.file, format: 'jpeg', width: o.width, height: o.height, sha256: copy.sha256 }, opts(GENERATION_BOUND_MB.verify));
    if (seen.status !== 'ok') return seen;
    return { status: 'ok', original: { source: o.source, sourceSha256: o.sha256, copy, verifiedIdentical: copy.sha256 === o.sha256 },
      cases: [{ id: rung.id, kind: 'image-jpeg', marker: `stall-lab-${rung.id}`, file: copy.file, bytes: copy.bytes, sha256: copy.sha256, shape: { width: o.width, height: o.height, pixels: o.width * o.height, source: 'owner-original', baseline: true } }] };
  }
  if (rung.source === 'spec') return { status: 'ok', cases: [specWriter(rung, root)] };
  return { status: 'failed:generation-exit', detail: `unknown rung source ${rung.source}` };
}

/** Rungs with no file of their own (large diff, background index) still need a hashed identity file so the harness can pin what ran. */
export function writeSpecCase(rung, root) {
  mkdirSync(root, { recursive: true });
  const body = Buffer.from(JSON.stringify({ rung: rung.id, kind: rung.kind, params: rung.params }, null, 1));
  const file = join(root, `${rung.id}.json`);
  writeFileSync(file, body, { flag: 'wx' });
  return { id: rung.id, kind: rung.kind, marker: `stall-lab-${rung.id}`, file, bytes: body.length, sha256: sha256(body), shape: { ...rung.params } };
}

export function buildLaneManifest(group, root, cases) {
  if (group.mode === 'images') {
    return { schema: 2, imagesRevision: 1, profile: 'images-opt-in', root, aggregateBytes: cases.reduce((n, c) => n + c.bytes, 0), cases, limits: IMAGE_LIMITS,
      generationPolicy: 'Each file generated or copied in its own memory-bounded child (bounded-exec.mjs)' };
  }
  return { schema: 1, root, profile: 'ladder', cases };
}

// ── custom workload 1: large diff ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Two versions of a `lines`-line file in which every 10th line differs; the FIRST line differs so it lands in the 15-row preview. */
export function buildDiffStrings(lines, marker) {
  const a = [], b = [];
  for (let i = 0; i < lines; i++) {
    const base = `line ${String(i).padStart(6, '0')} const value${i} = compute(${i}, 'stall lab diff row');`;
    a.push(base);
    b.push(i % 10 === 0 ? `${marker} changed ${i / 10} -> const value${i} = recompute(${i});` : base);
  }
  return { oldStr: a.join('\n') + '\n', newStr: b.join('\n') + '\n' };
}
/** The two transcript lines (assistant Edit tool_use, user tool_result) the app's TranscriptWatcher renders as an Edit tool card. */
export function diffTranscriptLines({ sessionId, cwd, toolUseId, oldStr, newStr, now = new Date() }) {
  const common = { sessionId, cwd, version: '2.1.229', gitBranch: '', userType: 'external' };
  const a = randomUUID();
  return [
    JSON.stringify({ type: 'assistant', uuid: a, parentUuid: null, ...common, timestamp: now.toISOString(),
      message: { role: 'assistant', model: 'claude-sonnet-4-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: toolUseId, name: 'Edit', input: { file_path: '/stall-lab/large-diff.txt', old_string: oldStr, new_string: newStr } }] } }),
    JSON.stringify({ type: 'user', uuid: randomUUID(), parentUuid: a, ...common, timestamp: new Date(now.getTime() + 1000).toISOString(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'The file /stall-lab/large-diff.txt has been updated.' }] } }),
  ];
}
export const diffStateSource = (toolUseId, marker) => `(() => {const c=document.querySelector('[data-tool-use-id="${toolUseId}"]');if(!c)return null;
  const body=c.querySelector('[data-testid="tool-card-body"]');
  return {open:!!body,rows:body?body.querySelectorAll('div.flex.items-start').length:0,hasChange:!!body&&body.textContent.includes(${JSON.stringify(marker)}),loading:!!body&&/Loading|Calculating/i.test(body.textContent)&&body.querySelectorAll('div.flex.items-start').length===0};})()`;
export const diffToggleSource = (toolUseId) => `(() => {const c=document.querySelector('[data-tool-use-id="${toolUseId}"]');const b=c?.querySelector('button');if(!b)return {ok:false};b.click();return {ok:true};})()`;

export async function largeDiffAction({ f, cdp, transcript, waitUntil, unmountedBefore, manifest }, { append = appendFileSync } = {}) {
  const { lines } = JSON.parse(readFileSync(f.file, 'utf8')).params;
  const { oldStr, newStr } = buildDiffStrings(lines, f.marker);
  const t = transcript(), toolUseId = `toolu_${sha256(f.id).slice(0, 20)}`;
  // WHY a plain user message first: two Edit calls with no user prompt between them are ONE assistant turn, and the app draws 2+ tool calls
  // of a turn as a collapsed "N edits" group whose cards are not in the page until it is opened. The second rung in a boot (5000 lines
  // after 500) therefore never found its card and timed out, while rungs that ran first in a boot (500, 20000) measured. A user message
  // between them starts a new turn, so every rung is the single Edit card the 500-line rung already measured.
  append(t.path, pathListTranscriptLine({ sessionId: t.sessionId, cwd: manifest.root, text: `stall lab: show the ${lines}-line change` }) + '\n');
  append(t.path, diffTranscriptLines({ sessionId: t.sessionId, cwd: manifest.root, toolUseId, oldStr, newStr }).join('\n') + '\n');
  // The card appears collapsed; opening it is part of what the user does to look at the change, so it is inside the measured window.
  const card = await waitUntil(async () => (await cdp.evaluate(diffStateSource(toolUseId, f.marker))) ?? false);
  if (!card.open) {
    const opened = await cdp.evaluate(diffToggleSource(toolUseId));
    if (!opened?.ok) throw new Error('Edit tool card has no header button to open');
  }
  const ready = await waitUntil(async () => { const s = await cdp.evaluate(diffStateSource(toolUseId, f.marker)); return s?.open && s.rows > 0 && s.hasChange ? s : false; }, { timeoutMs: 25_000 });
  return { attempted: true, correctTarget: true, correctResult: true, unmountedBefore, viewer: 'edit-diff', marker: f.marker, diffLines: lines, rowsDrawn: ready.rows };
}

// ── custom workload 2: background index refresh ──────────────────────────────────────────────────────────────────────────────

export function readMarks(perfLog, { read = (p) => readFileSync(p, 'utf8') } = {}) {
  const out = [];
  let text = ''; try { text = read(perfLog); } catch { return out; }
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { const m = JSON.parse(line); if (typeof m.name === 'string' && Number.isFinite(m.t)) out.push(m); } catch { /* partial line */ } }
  return out;
}
/** What the index actually contains after a refresh: a refresh that indexed nothing is not a workload. */
export function readIndexEvidence(home, { list = readdirSync, read = (p) => readFileSync(p, 'utf8'), stat = statSync } = {}) {
  const dir = join(home, '.youcoded', 'chatsearch');
  let conversations = 0, turnsBytes = 0;
  try {
    for (const name of list(dir)) {
      if (name.endsWith('-meta.json')) { try { conversations += Object.keys(JSON.parse(read(join(dir, name))).conversations ?? {}).length; } catch { /* unreadable meta counts as zero */ } }
      if (name.endsWith('-turns.jsonl')) turnsBytes += stat(join(dir, name)).size;
    }
  } catch { /* directory not created yet */ }
  return { conversations, turnsBytes };
}

/** Click the session's pill in the strip, then report whether ITS chat (and no other) is the visible one. Same checks as the harness' own session select. */
export const selectSessionSource = (sessionId) => `(() => {const id=${JSON.stringify(sessionId)};
  const pill=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(p=>p.dataset.sessionId===id);pill?.click();
  const visible=[...document.querySelectorAll('[data-chat-session-id]')].filter(x=>!x.closest('[aria-hidden="true"]'));
  return visible.length===1&&visible[0].dataset.chatSessionId===id;})()`;

export const backgroundIndexHook = {
  // A second private session, created BEFORE the measured window: destroying it is the app's own "session ended -> index refresh" trigger.
  async prepare({ cdp, manifest, waitUntil, fixture, sessionId }) {
    await waitUntil(async () => readMarks(fixture.perfLog).some((m) => m.name === 'bg:chatsearch-refresh:done'), { timeoutMs: 60_000 });
    const made = await cdp.evaluate(`window.claude.session.create(${JSON.stringify({ name: 'stall-index-trigger', cwd: manifest.root, skipPermissions: true, provider: 'claude' })})`);
    if (!made?.id) throw new Error('Trigger session create returned no id');
    await sleep(3000);   // let its own start-up churn (and any refresh it causes) finish before the window opens
    await waitUntil(async () => { const ms = readMarks(fixture.perfLog); const done = ms.filter((m) => m.name === 'bg:chatsearch-refresh:done').length, start = ms.filter((m) => m.name === 'bg:chatsearch-refresh:start').length; return done >= start; }, { timeoutMs: 60_000 });
    // WHY re-select the private session: creating the trigger session makes IT the visible chat. The window's first keystroke then landed
    // while the trigger session was on screen (receipt.correctTarget=false) and destroying it switched the view back mid-window, so the
    // input proof was rejected as "Missing/invalid viewer proof" although the refresh itself had been measured. The private session is
    // put back in front, and proven in front, BEFORE the window opens, so every key lands on the session the proof names.
    if (sessionId) await waitUntil(async () => cdp.evaluate(selectSessionSource(sessionId)), { timeoutMs: 15_000 });
    return { triggerId: made.id };
  },
  async run({ f, cdp, fixture, waitUntil, prepared, unmountedBefore }) {
    const t0 = Date.now();
    await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(prepared.triggerId)})`);
    const done = await waitUntil(async () => readMarks(fixture.perfLog).find((m) => m.name === 'bg:chatsearch-refresh:done' && m.t >= t0) ?? false, { timeoutMs: 55_000 });
    const start = readMarks(fixture.perfLog).filter((m) => m.name === 'bg:chatsearch-refresh:start' && m.t >= t0).at(0);
    const index = readIndexEvidence(fixture.home);
    if (index.conversations < 1) throw new Error(`Workload did not exercise indexing: the refresh finished but the index holds ${index.conversations} conversations`);
    return { attempted: true, correctTarget: true, correctResult: true, unmountedBefore, viewer: 'background-index-refresh', marker: f.marker,
      indexRefresh: { triggerToDoneMs: done.t - t0, workerWallMs: start ? done.t - start.t : null, conversationsIndexed: index.conversations, turnsBytes: index.turnsBytes } };
  },
};

// ── the real deps for runWorkloadsLane ─────────────────────────────────────────────────────────────────────────────────────────

// WHY a 3072 MiB PSS cap for documents/diff/path-list/index (images keep the image harness' hard 1536 limit): the cap is a runaway guard for
// the machine, not a pass mark. Measured PSS for an idle-ish app is ~0.7 GiB and the 20000-path list alone reached 1.4 GiB, so 1536 would
// kill exactly the heavy rungs this lane exists to measure and replace their numbers with "cap hit". A rung that reaches 3 GiB of real
// (shared-page-aware) memory is still stopped, and its row shows the real peak next to the cap.
export const DOCUMENT_PSS_CAP_MB = 3072;

/** Per-group watchdog: documents keep the lab's 15 s; the indexing refresh and the 20000-line diff are allowed longer BY NAME, and a timeout is still a recorded finding. */
export function groupLimits(group) {
  if (group.id === 'background-indexing') return { timeoutMs: 60_000, maxRssMb: DOCUMENT_PSS_CAP_MB };
  if (group.id === 'large-diff') return { timeoutMs: 30_000, maxRssMb: DOCUMENT_PSS_CAP_MB };
  if (group.id === 'path-list') return { timeoutMs: 30_000, maxRssMb: DOCUMENT_PSS_CAP_MB };
  return { timeoutMs: 15_000, maxRssMb: DOCUMENT_PSS_CAP_MB };
}

export function createWorkloadDeps({ checkout, build, makeFixtureBase, withBoot, getRenderer, boundInfo = detectBound(), recordInterference, run = runBounded, runCasesImpl = runDocumentStallCases }) {
  const state = { original: null, bound: boundInfo };
  return {
    state,
    makeFixture: (group) => makeFixtureBase(group),
    rootFor: (fixture, group) => { const root = join(fixture.home, 'stall-ladder', group.id); mkdirSync(root, { recursive: true }); return root; },
    generate: async (group, rung, root) => {
      const r = await generateRung(rung, root, { checkout, bound: boundInfo.bound, run });
      if (r.status === 'ok' && r.original) state.original = { source: r.original.source, sourceSha256: r.original.sourceSha256, copy: r.original.copy, verifiedIdentical: r.original.verifiedIdentical };
      return r;
    },
    buildManifest: buildLaneManifest,
    boot: (fixture, fn, group) => withBoot(fixture, fn, group),
    runCases: async ({ app, fixture, group, manifest, caseIds }) => {
      const { timeoutMs, maxRssMb } = groupLimits(group);
      const images = group.mode === 'images';
      return runCasesImpl(app, fixture, manifest, {
        checkout, build, caseIds, timeoutMs: images ? 15_000 : timeoutMs, maxRssMb: images ? 1536 : maxRssMb, images,
        // WHY PSS + 3 calibration attempts: see MEMORY_BASIS and the calibration attempts comments in scenario-document-stalls.mjs.
        memoryBasis: MEMORY_BASIS.pss, calibrationAttempts: LANE_CALIBRATION_ATTEMPTS,
        // WHY: a rung that freezes the renderer past ~0.8 s saturates the keystroke queue; that is a finding to report (see blockedInputEvidence), not a broken instrument.
        allowBlockedInput: true,
        ...(images ? { imageRenderingEvidence: getRenderer() } : {}),
        custom: { 'large-diff': largeDiffAction, 'bg-index': backgroundIndexHook },
      });
    },
    recordInterference,
  };
}

export const memoryBoundRecord = (info) => ({
  bound: info.bound, systemdUser: info.systemdUser, prlimit: info.prlimit, memoryMaxMb: GENERATION_BOUND_MB,
  note: info.bound === BOUND.systemd ? 'systemd-run --user --scope -p MemoryMax (user-level cgroup, swap off)'
    : info.bound === BOUND.prlimit ? 'prlimit --as (address-space cap = MemoryMax + headroom; looser than a cgroup limit) because systemd-run --user was unavailable'
      : 'NO bound available: generation is refused and every generated rung is recorded failed:no-memory-bound',
});

export { ORIGINAL_JPEG, existsSync };
