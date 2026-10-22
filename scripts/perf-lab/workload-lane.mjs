// scripts/perf-lab/workload-lane.mjs — lane F: workload breadth + the owner's original JPEG.
//
// WHAT IT IS: ladders of real files (CSV, XLSX, DOCX, HTML, images up to 4096x3072 PNG/JPEG, plus the owner's own JPEG) opened in the
// app's real file viewer, and four workloads the lab never ran in the app before: CSV "Load the whole file", a long path list shown in
// a chat message, a large file change shown in the diff view, and the background search-index refresh over a large history.
// Every rung ends as exactly one of
//   measured                  valid evidence, every named threshold met
//   slow                      valid evidence, at least one named threshold breached (the breach is kept, never tuned away)
//   failed:<reason>           the rung did not complete; the reason is a finding (timeout, memory-limit, memory-bound...) or an
//                             instrument problem (see INSTRUMENT_REASONS) — only the second kind makes the report INCOMPLETE
//   unsupported-by-candidate  the candidate's source has no such feature; evidence is the file/pattern that was looked for. Never zero.
// This file is pure orchestration + report shaping: every side effect (fixtures, boots, the app) arrives through `deps`, so it is
// unit-tested offline. The real wiring is scenario-workloads.mjs and the `workloads` block in run.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSV_FULLREAD_BYTES, stallCasePlan } from './stall-fixtures.mjs';

export const WORKLOAD_LANE = Object.freeze({ revision: 1, repeats: 3, maxAttemptsPerGroup: 3 });

// NAMED thresholds (lower is better). A rung over any of them is "slow", with the breach kept in the row.
//  operationMs 1000   time from the click to the content being on screen; 1 s is where waiting becomes noticeable.
//  *MaxDelayMs 250    the document lab's existing long-task budget (document-report.mjs DOCUMENT_BUDGETS), so lane F and the smoke
//                     documents are judged by the same line.
//  inputLatencyMs 250 same existing budget for the independent keystroke train.
export const WORKLOAD_THRESHOLDS = Object.freeze({ operationMs: 1000, rendererMaxDelayMs: 250, mainMaxDelayMs: 250, inputLatencyMs: 250 });
export const WORKLOAD_METRICS = Object.freeze(['operationMs', 'rendererMaxDelayMs', 'mainMaxDelayMs']);

// External memory bounds for the generation children (bounded-exec.mjs). Generous for what each job truly needs (a 4096x3072 RGBA
// buffer is 50 MB, node itself ~100 MB) but small enough that a runaway is killed long before the machine is affected.
export const GENERATION_BOUND_MB = Object.freeze({ document: 1024, image: 1536, verify: 1536, copy: 256 });

/** The owner's real image that froze the file viewer. Pinned by hash: if the source file is ever edited the lane refuses, not silently re-baselines. */
export const ORIGINAL_JPEG = Object.freeze({
  id: 'image-jpeg-original-wealth-game',
  source: '/home/destin/Projects/metropolis-e5-astra/docs/review/era5-housing-wealth/wealth-game.jpg',
  sha256: 'f88cab4e57f447ba16d81f947bff7bedcb7042891281e4fbd1d27a0792900ee4', bytes: 416168, width: 1620, height: 1640,
});

export const IMAGE_SEED = 23063;
const imageRung = (format, width, height) => ({ id: `image-${format}-${width}x${height}`, kind: `image-${format}`, source: 'image', family: `image-${format}`,
  spec: { id: `image-${format}-${width}x${height}`, format, width, height, seed: IMAGE_SEED } });

// The in-app diff workload sizes (lines per side). 500 is the "ordinary big edit", 20000 the "whole file rewritten" extreme.
export const LARGE_DIFF_LINES = Object.freeze([500, 5000, 20000]);

const docRung = (c) => ({ id: c.id, kind: c.kind, source: 'doc', family: c.kind.startsWith('csv-') ? (c.kind === 'csv-fullread' ? 'csv-fullread' : 'csv') : c.kind.split('-')[0] });

/**
 * The whole lane as groups. One group = one fixture set + one or more app boots (a rung that kills the app is retried-around in a
 * fresh boot, so one fatal rung never erases its neighbours). `requires` names a support probe (probeCandidateSupport).
 */
export function ladderGroups() {
  const plan = stallCasePlan('ladder'), pick = (...kinds) => plan.filter((c) => kinds.includes(c.kind)).map(docRung);
  const groups = [
    { id: 'csv', mode: 'documents', requires: 'documents', rungs: pick('csv-rows', 'csv-wide', 'csv-quoted') },
    { id: 'csv-fullread', mode: 'documents', requires: 'csvFullRead', rungs: pick('csv-fullread') },
    { id: 'xlsx', mode: 'documents', requires: 'documents', rungs: pick('xlsx-merge', 'xlsx-sheets') },
    { id: 'docx', mode: 'documents', requires: 'documents', rungs: pick('docx-paragraphs', 'docx-table') },
    { id: 'html', mode: 'documents', requires: 'documents', rungs: pick('html-assets', 'html-script') },
    { id: 'path-list', mode: 'documents', requires: 'pathList', rungs: pick('path-list') },
    { id: 'large-diff', mode: 'documents', requires: 'largeDiff', rungs: LARGE_DIFF_LINES.map((lines) => ({ id: `large-diff-${lines}`, kind: 'large-diff', source: 'spec', family: 'large-diff', params: { lines } })) },
    { id: 'background-indexing', mode: 'documents', requires: 'backgroundIndexing', rungs: [{ id: 'background-index-large-history', kind: 'bg-index', source: 'spec', family: 'background-indexing', params: {} }] },
  ];
  // Images: each large rung is measured in its own boot beside the small same-format control the image harness requires. The
  // control therefore repeats; the first measurement of it is the ladder row, later ones are kept as controlRepeats.
  const control = (fmt) => imageRung(fmt, 1024, 768);
  for (const [fmt, w, h] of [['png', 2048, 1536], ['png', 4096, 3072], ['jpeg', 2048, 1536], ['jpeg', 4096, 3072]]) {
    groups.push({ id: `images-${fmt}-${w}x${h}`, mode: 'images', requires: 'images', rungs: [control(fmt), imageRung(fmt, w, h)] });
  }
  groups.push({ id: 'images-jpeg-original', mode: 'images', requires: 'images', rungs: [control('jpeg'),
    { id: ORIGINAL_JPEG.id, kind: 'image-jpeg', source: 'original', family: 'image-jpeg-original', original: ORIGINAL_JPEG }] });
  return groups;
}

export const plannedRungIds = (groups = ladderGroups()) => [...new Set(groups.flatMap((g) => g.rungs.map((r) => r.id)))];

/** Every PRIMARY-style path lane F exposes to compareAll/ab (lower is better for all). Raw samples live at workloads.runs[].rungs.<id>.<metric>. */
export function workloadPaths(groups = ladderGroups()) {
  return plannedRungIds(groups).flatMap((id) => WORKLOAD_METRICS.map((m) => `workloads.median.rungs.${id}.${m}`));
}

// ── candidate support: look in the candidate's SOURCE before claiming anything ──────────────────────────────────────────────────
const VIEWS = 'desktop/src/renderer/components/artifact-views';
const SUPPORT_CHECKS = {
  documents: [[`${VIEWS}/CsvView.tsx`], [`${VIEWS}/XlsxView.tsx`], [`${VIEWS}/DocxView.tsx`], [`${VIEWS}/HtmlView.tsx`]],
  images: [[`${VIEWS}/ImageView.tsx`]],
  csvFullRead: [[`${VIEWS}/PartialFileBanner.tsx`, 'Load the whole file'], [`${VIEWS}/ActiveArtifactView.tsx`, 'full: true']],
  pathList: [['desktop/src/renderer/components/UserMessage.tsx', 'detectFilepaths'], ['desktop/src/renderer/hooks/useInlineFilepathDetector.ts'], ['desktop/src/renderer/components/FilepathToken.tsx', 'data-file-path']],
  largeDiff: [['desktop/src/renderer/components/diff/UnifiedDiff.tsx', 'diffRowsFromStrings'], ['desktop/src/renderer/components/tool-views/ToolBody.tsx', 'UnifiedDiff']],
  backgroundIndexing: [['desktop/src/main/chatsearch-index/index-service.ts', 'bg:chatsearch-refresh'], ['desktop/src/main/chatsearch-index/index-service.ts', 'requestChatsearchRefresh'], ['desktop/src/main/chatsearch-index/index-store.ts', 'chatsearchDir']],
};
/** { name: { supported, evidence } } — evidence names every file/pattern looked for and what was found. Injected IO for tests. */
export function probeCandidateSupport(checkout, { exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  const out = {};
  for (const [name, checks] of Object.entries(SUPPORT_CHECKS)) {
    const evidence = [];
    let supported = true;
    for (const [rel, pattern] of checks) {
      const file = join(checkout, rel);
      let ok = exists(file), why = ok ? 'present' : 'file not present';
      if (ok && pattern) { try { ok = read(file).includes(pattern); why = ok ? `contains "${pattern}"` : `does not contain "${pattern}"`; } catch (e) { ok = false; why = `unreadable: ${e.message}`; } }
      evidence.push(`${rel}: ${why}`);
      if (!ok) supported = false;
    }
    out[name] = { supported, evidence };
  }
  return out;
}

// ── turning raw document-lab rows into rung rows ────────────────────────────────────────────────────────────────────────────────
// Failure reasons that mean "the instrument did not do its job" (they make the report INCOMPLETE). Everything else under failed:* is
// a FINDING about the app/candidate: it is kept and compared, never hidden, and does not by itself void the report.
export const INSTRUMENT_REASONS = Object.freeze(['failed:instrument', 'failed:evidence-incomplete', 'failed:no-memory-bound', 'failed:image-lane-ineligible', 'failed:generation-exit', 'failed:not-run']);
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const maxOf = (xs) => { const v = xs.filter((x) => num(x) !== null); return v.length ? Math.max(...v) : null; };

/** The numbers a rung is judged on. Image rows keep their numbers per sub-step: time-to-render is the open+decode step, long tasks are the worst across steps. */
export function summariseRow(row) {
  const steps = Array.isArray(row?.imageSteps) ? row.imageSteps : null;
  const open = steps?.find((s) => String(s.id).endsWith('/open-decode'));
  const parts = steps ?? [row];
  return {
    operationMs: round1(steps ? open?.operationMs : row?.operationMs),
    rendererMaxDelayMs: round1(maxOf(parts.map((r) => r?.renderer?.maxDelayMs))),
    rendererTotalStallMs: round1(maxOf(parts.map((r) => r?.renderer?.totalStallMs))),
    mainMaxDelayMs: round1(maxOf(parts.map((r) => r?.main?.maxDelayMs))),
    inputLatencyMs: round1(maxOf(parts.map((r) => r?.input?.latencyMs))),
    peakRssMb: round1(maxOf(parts.map((r) => r?.memory?.peakRssMb))),
  };
}

const firstLine = (s) => String(s ?? '').split('\n')[0].slice(0, 300);
/** { status, reason?, reasons? } + metrics for one raw row. `status` is one of measured|slow|failed|not-run. */
export function classifyRow(row, thresholds = WORKLOAD_THRESHOLDS) {
  if (!row) return { status: 'failed', reason: 'failed:not-run', detail: 'no row was produced for this rung' };
  const steps = Array.isArray(row.imageSteps) ? row.imageSteps : null;
  const bad = steps ? steps.find((s) => s.status !== 'measured') : null;
  const st = bad ? bad.status : row.status;
  if (st === 'unreviewed') return { status: 'not-run', detail: firstLine(row.error) };
  if (st === 'timeout') return { status: 'failed', reason: 'failed:timeout', detail: firstLine((bad ?? row).error), metrics: summariseRow(row) };
  if (st === 'memory-limit') return { status: 'failed', reason: 'failed:memory-limit', detail: firstLine((bad ?? row).error), metrics: summariseRow(row) };
  if (st !== 'measured') {
    const err = firstLine((bad ?? row).error);
    // The document adapter reports "evidence missing/invalid" in these words; that is the instrument, not the app.
    const instrument = /Missing\/invalid viewer proof|Incomplete image RSS|Calibration controls invalid|provenance|Independent owned main-loop|did not exercise/i.test(err);
    return { status: 'failed', reason: instrument ? 'failed:evidence-incomplete' : 'failed:viewer', detail: err, metrics: summariseRow(row) };
  }
  const m = summariseRow(row), breaches = [];
  if (m.operationMs === null) return { status: 'failed', reason: 'failed:evidence-incomplete', detail: 'no operation time was recorded', metrics: m };
  if (m.operationMs > thresholds.operationMs) breaches.push(`time to render ${m.operationMs} ms > ${thresholds.operationMs} ms`);
  if (num(m.rendererMaxDelayMs) !== null && m.rendererMaxDelayMs > thresholds.rendererMaxDelayMs) breaches.push(`renderer long task ${m.rendererMaxDelayMs} ms > ${thresholds.rendererMaxDelayMs} ms`);
  if (num(m.mainMaxDelayMs) !== null && m.mainMaxDelayMs > thresholds.mainMaxDelayMs) breaches.push(`main-process stall ${m.mainMaxDelayMs} ms > ${thresholds.mainMaxDelayMs} ms`);
  if (num(m.inputLatencyMs) !== null && row.input?.budgetStatus === 'breach' && m.inputLatencyMs > thresholds.inputLatencyMs) breaches.push(`typing delay ${m.inputLatencyMs} ms > ${thresholds.inputLatencyMs} ms`);
  return breaches.length ? { status: 'slow', reasons: breaches, metrics: m } : { status: 'measured', metrics: m };
}

const median = (xs) => { const s = xs.filter((x) => num(x) !== null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ── the orchestrator ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function emptySection({ repeats, groups, support, memoryBound, original }) {
  return {
    revision: WORKLOAD_LANE.revision, lane: 'F', expectedRepeats: repeats, thresholds: WORKLOAD_THRESHOLDS,
    plan: { groups: groups.map((g) => ({ id: g.id, mode: g.mode, requires: g.requires, rungs: g.rungs.map((r) => r.id) })), rungIds: plannedRungIds(groups) },
    support, memoryBound, original, runs: [], median: { rungs: {} },
  };
}

/** Recompute the per-rung medians from every repeat so far (called after each group, so an aborted run still reports what it measured). */
export function finalizeSection(section) {
  const rungs = {};
  for (const id of section.plan.rungIds) {
    const done = section.runs.map((r) => r.rungs[id]).filter((r) => r && (r.status === 'measured' || r.status === 'slow'));
    if (!done.length) continue;
    rungs[id] = { samples: done.length, ...Object.fromEntries(['operationMs', 'rendererMaxDelayMs', 'rendererTotalStallMs', 'mainMaxDelayMs', 'inputLatencyMs', 'peakRssMb'].map((m) => [m, median(done.map((r) => r[m]))])) };
  }
  section.median = { rungs };
  return section;
}

/**
 * Run the whole lane. `deps` (all injected):
 *   makeFixture(group)                    -> fixture (fresh app HOME for this group)
 *   rootFor(fixture, group)               -> directory the group's files go in (inside the fixture HOME)
 *   generate(group, rung, root)           -> { status:'ok', cases:[manifestCase] } | { status:'failed:memory-bound'|..., detail }
 *   buildManifest(group, root, cases)     -> a manifest runDocumentStallCases accepts (schema 1 documents, or schema 2 images)
 *   boot(fixture, fn, group)              -> boots one app, runs fn(app), always tears down
 *   runCases({app,fixture,group,manifest,caseIds}) -> runDocumentStallCases-shaped result { cases, fatal, descriptor }
 *   recordInterference(verdict)           -> push the per-window verdict into report.interference.windows
 */
export async function runWorkloadsLane({ groups = ladderGroups(), support, repeats = WORKLOAD_LANE.repeats, memoryBound = null, original = null, deps, log = () => {}, checkDeadline = () => {}, onProgress = () => {} }) {
  const section = emptySection({ repeats, groups, support, memoryBound, original });
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const run = { repeat, rungs: {}, groups: [], controlRepeats: {} };
    section.runs.push(run);
    for (const group of groups) {
      checkDeadline();
      const entry = { id: group.id, attempts: 0, interference: [], rows: [], error: null };
      run.groups.push(entry);
      try { await runGroup({ group, run, entry, support, deps, log, label: `workloads/${group.id}/repeat-${repeat}` }); }
      catch (error) {
        // An unexpected failure inside one group must not erase the others: every rung it still owes becomes an instrument failure.
        entry.error = String(error?.stack ?? error);
        for (const rung of group.rungs) if (!run.rungs[rung.id]) setRung(run, group, rung, { status: 'failed', reason: 'failed:instrument', detail: firstLine(error?.message ?? error) }, entry);
      }
      finalizeSection(section); onProgress(section);
    }
  }
  return finalizeSection(section);
}

function setRung(run, group, rung, outcome, entry, extra = {}) {
  const prior = run.rungs[rung.id];
  const row = { id: rung.id, family: rung.family, group: group.id, kind: rung.kind, status: outcome.status === 'not-run' ? 'failed' : outcome.status,
    ...(outcome.status === 'not-run' ? { reason: 'failed:not-run' } : outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.reasons ? { reasons: outcome.reasons } : {}), ...(outcome.detail ? { detail: outcome.detail } : {}), ...(outcome.metrics ?? {}), ...extra };
  if (prior) {
    // The image harness needs a small control beside every large rung, so a control id can arrive several times. First one is the ladder row.
    (run.controlRepeats[rung.id] ??= []).push({ group: group.id, status: row.status, operationMs: row.operationMs ?? null });
    return;
  }
  run.rungs[rung.id] = row;
}

async function runGroup({ group, run, entry, support, deps, log, label }) {
  const gate = support?.[group.requires];
  if (gate && gate.supported === false) {
    for (const rung of group.rungs) setRung(run, group, rung, { status: 'unsupported-by-candidate', detail: gate.evidence.join('; ') }, entry);
    log(`workloads ${group.id}: unsupported-by-candidate (${gate.evidence.filter((e) => !/present$|contains/.test(e)).join('; ') || 'see report'})`);
    return;
  }
  const fixture = await deps.makeFixture(group), root = deps.rootFor(fixture, group);
  const cases = [], byId = new Map();
  for (const rung of group.rungs) {
    const gen = await deps.generate(group, rung, root);
    if (gen.status !== 'ok') { setRung(run, group, rung, { status: 'failed', reason: gen.status, detail: gen.detail }, entry); log(`workloads ${rung.id}: ${gen.status}`); continue; }
    for (const c of gen.cases) { cases.push(c); byId.set(c.id, rung); }
  }
  if (!cases.length) return;
  let remaining = cases.map((c) => c.id);
  for (let attempt = 1; attempt <= WORKLOAD_LANE.maxAttemptsPerGroup && remaining.length; attempt++) {
    entry.attempts = attempt;
    let result = null, verdict = null;
    try {
      await deps.boot(fixture, async (app) => {
        const mark = app.interference?.mark?.() ?? null;
        try { result = await deps.runCases({ app, fixture, group, manifest: deps.buildManifest(group, root, cases), caseIds: remaining }); }
        finally {
          verdict = mark === null || !app.interference ? { label, verdict: 'unknown', reasons: ['no interference watch was running for this window'], offenders: [] } : app.interference.verdictSince(mark, `${label}${attempt > 1 ? `/attempt-${attempt}` : ''}`);
          deps.recordInterference?.(verdict);
        }
      }, group);
    } catch (error) {
      entry.error = String(error?.stack ?? error);
      if (!result) { for (const id of remaining) { const rung = byId.get(id); if (rung) setRung(run, group, rung, { status: 'failed', reason: 'failed:instrument', detail: firstLine(error?.message ?? error) }, entry); } return; }
    }
    entry.interference.push({ label: verdict?.label, verdict: verdict?.verdict, reasons: verdict?.reasons ?? [] });
    const stillOwed = [];
    for (const row of result?.cases ?? []) {
      entry.rows.push(row);
      const rung = byId.get(row.id); if (!rung) continue;
      const outcome = classifyRow(row);
      if (outcome.status === 'not-run') { stillOwed.push(row.id); continue; }
      setRung(run, group, rung, outcome, entry, { bytes: row.fixture?.bytes ?? null, sha256: row.fixture?.sha256 ?? null, interference: verdict?.verdict ?? 'unknown', attempts: attempt });
    }
    // Only a fatal case (the harness killed the app) justifies another boot for what it never reached. A non-fatal 'unreviewed' row
    // (invalid calibration, provenance error) would fail identically again, so it is final.
    if (result?.fatal && stillOwed.length && attempt < WORKLOAD_LANE.maxAttemptsPerGroup) {
      const targets = new Set(stillOwed);
      // images need their small control selected in every call
      remaining = group.mode === 'images' ? cases.map((c) => c.id) : [...targets];
      if (group.mode === 'images') { /* control rows repeat; setRung keeps the first */ }
      continue;
    }
    for (const id of stillOwed) { const rung = byId.get(id); if (rung) setRung(run, group, rung, { status: 'failed', reason: result?.fatal ? 'failed:not-run' : 'failed:instrument', detail: firstLine(result?.descriptor?.error ?? 'case not reached') }, entry); }
    remaining = [];
  }
  for (const id of remaining) { const rung = byId.get(id); if (rung && !run.rungs[rung.id]) setRung(run, group, rung, { status: 'failed', reason: 'failed:not-run', detail: 'attempts exhausted' }, entry); }
}

// ── contract + presentation ─────────────────────────────────────────────────────────────────────────────────────────────────────
const STATUSES = new Set(['measured', 'slow', 'failed', 'unsupported-by-candidate']);

/** Why the lane's report cannot be trusted as complete. Empty = complete (slow and finding-type failures are results, not problems). */
export function workloadsProblems(report) {
  const s = report?.workloads;
  if (!s) return ['workloads: required section missing'];
  const problems = [];
  if (s.revision !== WORKLOAD_LANE.revision) problems.push(`workloads: revision ${s.revision} is not ${WORKLOAD_LANE.revision}`);
  if (!Number.isInteger(s.expectedRepeats) || s.expectedRepeats < 1 || s.runs?.length !== s.expectedRepeats) problems.push('workloads: incomplete repeat count');
  if (!s.memoryBound?.bound) problems.push('workloads: the external memory bound that applied is not recorded');
  if (!s.support || typeof s.support !== 'object') problems.push('workloads: candidate support probe not recorded');
  const ids = s.plan?.rungIds ?? [];
  (s.runs ?? []).forEach((run, i) => {
    for (const id of ids) {
      const row = run.rungs?.[id];
      if (!row) { problems.push(`workloads repeat ${i + 1}: ${id} has no row`); continue; }
      if (!STATUSES.has(row.status)) problems.push(`workloads repeat ${i + 1}: ${id} has unknown status ${String(row.status)}`);
      else if (row.status === 'failed' && !row.reason) problems.push(`workloads repeat ${i + 1}: ${id} failed without a recorded reason`);
      else if (row.status === 'failed' && INSTRUMENT_REASONS.includes(row.reason)) problems.push(`workloads repeat ${i + 1}: ${id} ${row.reason} — ${row.detail ?? 'no detail'}`);
      else if ((row.status === 'measured' || row.status === 'slow') && num(row.operationMs) === null) problems.push(`workloads repeat ${i + 1}: ${id} ${row.status} without a time-to-render`);
    }
  });
  return problems;
}

export const WORKLOAD_MEASURES = Object.freeze({
  scenario: 'workloads', lane: 'F',
  question: 'How long does each file/size rung take to appear in the app, what long tasks and main-process stalls does it cause, and what do the CSV full read, long path list, large diff and background index refresh cost?',
  configuration: ['one app boot per family (a fatal rung is re-run around in a fresh boot, max 3 boots per group)', 'document ladders: CSV/XLSX/DOCX/HTML from the lab stress profile + CSV full read (5 MiB)', 'images: PNG and JPEG 1024x768, 2048x1536, 4096x3072 + the owner\'s original JPEG (byte copy)',
    `thresholds: ${Object.entries(WORKLOAD_THRESHOLDS).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'fixtures generated by memory-bounded child processes'],
  clocks: { operation: 'performance.now() in the controller around the click-to-content action', longTasks: 'renderer and main event-loop probes (probe-loop.mjs, main-loop-probe.mjs), independent of the action clock', input: 'independent F24 key train (document-input.mjs)' },
  blindTo: ['software rendering only (llvmpipe under Xvfb): GPU paint cost', 'transcript-driven path list/diff, not composer typing or paste', 'background indexing measures the app\'s chat-history index, not a project file tree (none exists in source)', 'cold OS disk cache'],
});

export function workloadsMarkdown(section) {
  if (!section) return [];
  const lines = ['', '## Workload breadth (lane F) — per-rung measured / slow / failed', '',
    `Memory bound for generation: ${section.memoryBound?.bound ?? 'NOT RECORDED'} (${section.memoryBound?.note ?? ''}). Thresholds: ${Object.entries(section.thresholds ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    '| Rung | Family | Status | Time to render ms | Renderer long task ms | Main stall ms | Notes |', '|---|---|---|---|---|---|---|'];
  const last = section.runs?.at(-1);
  for (const id of section.plan?.rungIds ?? []) {
    const r = last?.rungs?.[id], m = section.median?.rungs?.[id];
    lines.push(`| ${id} | ${r?.family ?? ''} | ${r?.status ?? 'no row'}${r?.reason ? ` (${r.reason})` : ''} | ${m?.operationMs ?? '—'} | ${m?.rendererMaxDelayMs ?? '—'} | ${m?.mainMaxDelayMs ?? '—'} | ${[...(r?.reasons ?? []), r?.detail].filter(Boolean).join('; ').slice(0, 160)} |`);
  }
  for (const [name, s] of Object.entries(section.support ?? {})) if (!s.supported) lines.push(`- Unsupported by candidate, ${name}: ${s.evidence.join('; ')}`);
  if (section.original) lines.push(`- Original JPEG copy: ${section.original.copy?.file ?? '?'} sha256 ${section.original.copy?.sha256 ?? '?'} (source verified identical, copy read-only)`);
  lines.push(...workloadsProblems({ workloads: section }).map((p) => `- Invalid: ${p}`));
  return lines;
}

export { CSV_FULLREAD_BYTES };
