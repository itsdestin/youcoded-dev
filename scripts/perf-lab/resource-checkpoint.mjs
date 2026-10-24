// Boundary-only resource observations. No frame polling, observers or geometry reads.
import { types } from 'node:util';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { readCounters } from './layout-cost.mjs';
import { createProcFailureRing,procFailureSnapshot,emitProcFailure } from './proc-forensics.mjs';
import { readRoleSnapshot, ROLE_ACCOUNTING_REVISION } from './process-roles.mjs';

export const RESOURCE_METRICS = Object.freeze(['TaskDuration', 'ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'Nodes', 'JSEventListeners']);
export const CUMULATIVE_METRICS = Object.freeze(['TaskDuration', 'ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration']);
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const RESOURCE_DESCRIPTOR = Object.freeze({ revision: 3, lane: 'short-lifecycle-diagnostic', standardAcceptanceCoverage: false,
  phases: ['before', 'grown', 'switched', 'released'], maxCyclesIncludingWarmup: 5, maxMinutes: 10, maxBytes: 5 * 1024 * 1024, maxRecords: 10000,
  // WHY: role accounting is additive. checkpoint/descriptor revisions stay put because comparability
  // gates (coverage.mjs, checkpointDelta) key on them; reports carry their own roleAccounting revision.
  roleAccounting: { revision: ROLE_ACCOUNTING_REVISION, note: 'Full-domain checkpoints add roles{} (pid:starttime identity, privacy-filtered role label, per-member PSS/RSS/private kB). Reports without it are legacy: roles unknown, never inferred.' },
  scope: { renderer: 'CDP target renderer-wide', pss: 'enumerated rig-marker process family, Linux smaps_rollup' },
  gaps: ['Marker discovery may omit untagged helpers; discovery completeness is unproven.', 'Switched sessions are not minimized or hidden windows; no hidden-window activity measurement.', 'No cumulative long-list scroll/reopen measurement yet; chunked reveal retains rows, it is not virtualization.', 'No queue conservation/drain, graphics, energy or per-component memory attribution.', 'Observer overhead is timed separately, not calibrated by a control run.', 'Source identity is the package build stamp, not an attestation of packaged bytes or the current checkout. Serializer output caps do not bound input allocation or total process memory.'],
  comparison: 'Renderer continuity and family composition are separate domains. Membership churn retains renderer deltas only with full identities/counters; aggregate PSS retention stays unavailable. Whole-cycle validity remains incomplete.',
  interpretation: 'Growth and release evidence only, not an automatic leak verdict. PSS minus JS heap is not DOM memory.' });

// WHY: the legacy PSS reader maps an absent Pss field to zero and silently omits
// unreadable PIDs. Preserve missing membership explicitly at the matched boundary.
export function readFamilyPss(pids, read = path => readBoundedText(path, { maxBytes: 65536 }),{onFailure,phase='unspecified',now=()=>performance.now()}={}) {
  const perPid = [];
  for (const pid of pids) {
    try {
      const text = read(`/proc/${pid}/smaps_rollup`);
      const match = /^Pss:\s+(\d+) kB\s*$/m.exec(text);
      const mb = match ? Number(match[1]) / 1024 : null;
      if (finite(mb)) perPid.push({ pid, mb });
      else emitProcFailure(onFailure,procFailureSnapshot({pid,operation:'parse-pss',phase,at:now(),reason:'Pss-field-missing'}));
    } catch(error) { emitProcFailure(onFailure,procFailureSnapshot({pid,operation:'read-pss',phase,at:now(),reason:'pss-read-unavailable',errno:error.code})); }
  }
  return { totalMb: perPid.reduce((sum, p) => sum + p.mb, 0), perPid };
}

export const DOCUMENT_EPOCH_EXPRESSION = `({ documentEpoch: String(performance.timeOrigin), url: location.href })`;
export function readProcessStart(pid,{read=path=>readBoundedText(path,{maxBytes:8192}),onFailure,phase='unspecified',now=()=>performance.now(),intentionalTeardown=false}={}) {
  let rawStat=null,operation='read-starttime';
  try{
    rawStat=read(`/proc/${pid}/stat`);operation='parse-starttime';
    const start=rawStat.slice(rawStat.lastIndexOf(')')+2).trim().split(/\s+/)[19];
    if(!start||!/^\d+$/.test(start))throw Error('process start identity unavailable');
    return start;
  }catch(error){
    const row=procFailureSnapshot({pid,operation,phase,intentionalTeardown,at:now(),reason:'process-start-unavailable',errno:error.code,rawStat});
    emitProcFailure(onFailure,row);try{error.procForensic=row;}catch{}throw error;
  }
}

export async function captureCheckpoint({ cdp, family, phase, identity, gcPolicy = 'natural', readPss = readFamilyPss,
  readEpoch = () => cdp.evaluate(DOCUMENT_EPOCH_EXPRESSION), readProcessStart: processStart = readProcessStart, now = () => performance.now(), domain = 'full',
  // WHY: a caller that injects a fake readPss is a unit test; never sample real /proc for it.
  readRoles = readPss === readFamilyPss ? readRoleSnapshot : null }) {
  if (!['full', 'renderer'].includes(domain)) throw Error('unknown checkpoint domain');
  const startedAt = now(), gaps = [],procFailureRing=createProcFailureRing();
  const readStart=pid=>{
    try{return processStart(pid,{phase,now,onFailure:procFailureRing.record});}
    catch(error){if(!error.procForensic)procFailureRing.record(procFailureSnapshot({pid,phase,operation:'read-starttime',at:now(),reason:'process-start-unavailable',errno:error.code}));throw error;}
  };
  let epochBefore, epochAfter;
  const epoch = async () => { try { return await readEpoch(); } catch (error) { gaps.push(`document epoch: ${error.message}`); return null; } };
  epochBefore = await epoch();
  if (!RESOURCE_DESCRIPTOR.phases.includes(phase) || !['natural', 'gc-intervened-pre-collection', 'forced-gc'].includes(gcPolicy)) gaps.push('unknown phase or GC policy');
  let response;
  try { response = await cdp.send('Performance.getMetrics'); }
  catch (error) { gaps.push(`CDP counters: ${error.message}`); }
  const by = Object.fromEntries((Array.isArray(response?.metrics) ? response.metrics : []).map(m => [m.name, m.value]));
  const metrics = Object.fromEntries(RESOURCE_METRICS.map(name => {
    if (!finite(by[name])) gaps.push(`missing/nonfinite/negative ${name}`);
    return [name, finite(by[name]) ? by[name] : null];
  }));
  // Reuse the existing layout-cost conversion against this SAME CDP response;
  // a second protocol read would no longer be the same checkpoint.
  const layout = await readCounters({ send: async () => ({ metrics: Object.entries(metrics).map(([name, value]) => ({ name, value })) }) });
  for (const key of ['layoutCount', 'recalcStyleCount', 'layoutDurationMs', 'recalcStyleDurationMs']) if (!finite(layout[key])) layout[key] = null;
  // WHY: renderer diagnostics must never discover/read the process family on
  // the timed CDP path. Ownership and RSS safety remain the supervisor's job.
  if (domain === 'renderer') {
    epochAfter = await epoch();
    if (typeof epochBefore?.documentEpoch !== 'string' || !epochBefore.documentEpoch || typeof epochBefore?.url !== 'string' || !epochBefore.url || epochBefore.documentEpoch !== epochAfter?.documentEpoch || epochBefore.url !== epochAfter?.url) gaps.push('document epoch missing or changed inside checkpoint');
    const checkpointIdentity = { ...identity, documentEpoch: epochBefore?.documentEpoch ?? null, documentUrl: epochBefore?.url ?? null, processStarts: {} };
    if (['source','run','target'].some(k=>typeof checkpointIdentity[k]!=='string'||!checkpointIdentity[k])) gaps.push('source/run/target identity unavailable');
    const endedAt = now(), observerMs = finite(endedAt-startedAt) ? endedAt-startedAt : null;
    if (observerMs === null) gaps.push('invalid observer clock');
    return { revision:3, domain, identity:checkpointIdentity, phase, gcPolicy, status:gaps.length?'incomplete':'renderer-only',
      scope:RESOURCE_DESCRIPTOR.scope, startedAt, endedAt, observerMs, metrics, layout,
      renderer:{status:gaps.length?'incomplete':'measured',gaps:[...gaps],readBrackets:{before:epochBefore,after:epochAfter}},
      process:{status:'not-collected',reason:'renderer-only checkpoint requested; PSS and composition not measured',gaps:[]},
      pss:{status:'not-collected',totalMb:null,perPid:[],expectedPids:[],missingPids:[],complete:false,discoveryComplete:false},procFailures:procFailureRing.snapshot(),gaps };
  }
  const rendererReadGaps = [...gaps];
  let expectedPids = [], observed = { totalMb: null, perPid: [] };
  const processStarts = {};
  try {
    expectedPids = [...new Set(family())];
    if (!expectedPids.length || expectedPids.length > 10000 || expectedPids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) throw Error('empty, invalid or over-cap process family');
    for (const pid of expectedPids) processStarts[pid] = readStart(pid);
    observed = readPss(expectedPids,undefined,{phase,now,onFailure:procFailureRing.record});
  } catch (error) { gaps.push(`PSS: ${error.message}`); }
  // WHY: roles are a separate read of the same enumerated pids; their failure marks only
  // roles.status, never the existing PSS/renderer verdicts.
  let roles = { revision: ROLE_ACCOUNTING_REVISION, status: 'not-collected', members: [] };
  if (readRoles && expectedPids.length) {
    try { roles = readRoles(expectedPids); }
    catch (error) { roles = { revision: ROLE_ACCOUNTING_REVISION, status: 'incomplete', members: [], reason: `role read failed: ${error.code ?? 'error'}` }; }
  }
  const perPid = Array.isArray(observed?.perPid) ? observed.perPid.filter(p => expectedPids.includes(p.pid) && finite(p.mb)) : [];
  const missingPids = expectedPids.filter(pid => !perPid.some(p => p.pid === pid));
  const complete = expectedPids.length > 0 && missingPids.length === 0 && perPid.length === expectedPids.length && finite(observed?.totalMb);
  if (!complete) gaps.push('process-family PSS membership incomplete');
  for (const pid of expectedPids) {
    try {
      const afterStart=readStart(pid);
      if(processStarts[pid]!==afterStart){
        gaps.push(`process ${pid} start changed inside checkpoint`);
        procFailureRing.record(procFailureSnapshot({pid,phase,operation:'verify-starttime',at:now(),reason:'process-start-changed',before:{pid,starttime:processStarts[pid]},after:{pid,starttime:afterStart}}));
      }
    }
    catch (error) { gaps.push(`process ${pid} start: ${error.message}`); }
  }
  epochAfter = await epoch();
  if (typeof epochBefore?.documentEpoch !== 'string' || !epochBefore.documentEpoch || typeof epochBefore?.url !== 'string' || !epochBefore.url || epochBefore.documentEpoch !== epochAfter?.documentEpoch || epochBefore.url !== epochAfter?.url) gaps.push('document epoch missing or changed inside checkpoint');
  const checkpointIdentity = { ...identity, documentEpoch: epochBefore?.documentEpoch ?? null, documentUrl: epochBefore?.url ?? null, processStarts };
  if (['source', 'run', 'target'].some(k => typeof checkpointIdentity[k] !== 'string' || !checkpointIdentity[k])) gaps.push('source/run/target identity unavailable');
  if (expectedPids.some(pid => typeof processStarts[pid] !== 'string' || !processStarts[pid])) gaps.push('process start identity unavailable');
  const endedAt = now();
  const observerMs = finite(endedAt - startedAt) ? endedAt - startedAt : null;
  if (observerMs === null) gaps.push('invalid observer clock');
  rendererReadGaps.push(...gaps.filter(g=>g.startsWith('document epoch')||g.startsWith('source/run/target')||g==='invalid observer clock'));
  return { revision: 2, domain:'full', renderer:{status:rendererReadGaps.length?'incomplete':'measured',gaps:rendererReadGaps,readBrackets:{before:epochBefore,after:epochAfter}},
    process:{status:complete&&!gaps.some(g=>g.startsWith('process')||g.startsWith('PSS:'))?'measured':'incomplete',gaps:gaps.filter(g=>g.startsWith('process')||g.startsWith('PSS:'))},
    identity: checkpointIdentity, phase, gcPolicy, status: gaps.length ? 'incomplete' : 'measured', scope: RESOURCE_DESCRIPTOR.scope, startedAt, endedAt, observerMs, metrics, layout,
    pss: { totalMb: complete ? observed.totalMb : null, perPid, expectedPids, missingPids, complete, discoveryComplete: false }, roles, procFailures:procFailureRing.snapshot(), gaps };
}

const ALLOWED_PHASE_PAIRS = new Set(['before:before', 'grown:grown', 'switched:switched', 'released:released', 'before:grown', 'before:switched', 'before:released', 'grown:switched', 'switched:released']);
export function checkpointDelta(before, after) {
  const resets = [], gaps = [];
  const aId = before?.identity, bId = after?.identity;
  const sameIdentity = aId && bId && ['source', 'run', 'target', 'documentEpoch', 'documentUrl'].every(k => typeof aId[k] === 'string' && aId[k] && aId[k] === bId[k]);
  const aPids = before?.pss?.expectedPids, bPids = after?.pss?.expectedPids;
  const sameFamily = Array.isArray(aPids) && Array.isArray(bPids) && aPids.length > 0 && aPids.length === bPids.length && new Set(aPids).size === aPids.length && new Set(bPids).size === bPids.length && aPids.every(pid => bPids.includes(pid) && typeof aId?.processStarts?.[pid] === 'string' && aId.processStarts[pid] && aId.processStarts[pid] === bId?.processStarts?.[pid]);
  const ordered = finite(before?.startedAt) && finite(before?.endedAt) && finite(after?.startedAt) && finite(after?.endedAt) && before.startedAt <= before.endedAt && before.endedAt <= after.startedAt && after.startedAt <= after.endedAt;
  // WHY: process membership churn is a different measurement domain from one
  // unchanged CDP renderer. Full-domain shared PID reuse/missing start evidence
  // still fences both comparisons. Renderer-only explicitly omits process reads;
  // it cannot manufacture a PSS trend or substitute for supervisor ownership.
  const aList=Array.isArray(aPids)?aPids:[], bList=Array.isArray(bPids)?bPids:[];
  const added=bList.filter(pid=>!aList.includes(pid)),removed=aList.filter(pid=>!bList.includes(pid));
  const reused=aList.filter(pid=>bList.includes(pid)&&aId?.processStarts?.[pid]!==bId?.processStarts?.[pid]);
  const completeStarts=aList.length>0&&bList.length>0&&new Set(aList).size===aList.length&&new Set(bList).size===bList.length
    && aList.every(pid=>typeof aId?.processStarts?.[pid]==='string'&&aId.processStarts[pid])&&bList.every(pid=>typeof bId?.processStarts?.[pid]==='string'&&bId.processStarts[pid]);
  const rendererOnly = before?.revision===3 && after?.revision===3 && before.domain==='renderer' && after.domain==='renderer';
  const rendererComparable = Boolean(sameIdentity && (rendererOnly || completeStarts) && !reused.length && ordered && (rendererOnly || before?.revision === 2 && after?.revision === 2) && before.gcPolicy === after.gcPolicy && ALLOWED_PHASE_PAIRS.has(`${before.phase}:${after.phase}`) && before.scope?.renderer === RESOURCE_DESCRIPTOR.scope.renderer && after.scope?.renderer === RESOURCE_DESCRIPTOR.scope.renderer && before.scope?.pss === RESOURCE_DESCRIPTOR.scope.pss && after.scope?.pss === RESOURCE_DESCRIPTOR.scope.pss);
  const comparable=rendererComparable&&sameFamily;
  const rendererGaps=[];
  if(!rendererComparable)rendererGaps.push('renderer source/epoch/order/scope/shared-process identity not comparable');
  if(rendererOnly ? [before,after].some(s=>s.status!=='renderer-only'||s.renderer?.status!=='measured') : before?.status!=='measured'||after?.status!=='measured')rendererGaps.push('incomplete checkpoint');
  if (!sameIdentity) gaps.push('source/run/target/document epoch mismatch or missing identity');
  if (rendererOnly) gaps.push('process family not collected: renderer-only diagnostic');
  else if (!sameFamily) gaps.push('process membership/start identity mismatch');
  if (!ordered) gaps.push('unordered or overlapping checkpoint boundaries');
  if (!rendererComparable || !rendererOnly && !comparable) gaps.push('phase, scope, revision or identity not comparable');
  if (rendererOnly ? rendererGaps.length : before?.status !== 'measured' || after?.status !== 'measured') gaps.push('incomplete checkpoint');
  const metrics = Object.fromEntries(RESOURCE_METRICS.map(name => {
    const a = before?.metrics?.[name], b = after?.metrics?.[name];
    if (!rendererComparable || rendererGaps.length || !finite(a) || !finite(b)) { gaps.push(`unavailable ${name}`); rendererGaps.push(`unavailable ${name}`); return [name, null]; }
    if (CUMULATIVE_METRICS.includes(name) && b < a) { resets.push(name); return [name, null]; }
    return [name, b - a];
  }));
  const a = before?.pss?.totalMb, b = after?.pss?.totalMb;
  if(!rendererOnly&&(!finite(a)||!finite(b)))gaps.push('missing/nonfinite family PSS');
  const rendererStatus=rendererGaps.length||resets.length?'incomplete':'measured';
  const familyComparable=comparable&&before?.status==='measured'&&after?.status==='measured'&&finite(a)&&finite(b);
  return { comparable, status: gaps.length || resets.length ? 'incomplete' : 'measured', resets, gaps, metrics,
    renderer:{comparable:rendererComparable,status:rendererStatus,gaps:rendererGaps,resets},
    family:{comparable:familyComparable,status:rendererOnly?'not-collected':familyComparable?'measured':'incomparable',added,removed,reused,
      membershipChanged:added.length>0||removed.length>0,
      compositionOnly:rendererStatus==='measured'&&before?.status==='measured'&&after?.status==='measured'&&finite(a)&&finite(b)&&!reused.length&&(added.length>0||removed.length>0),gaps:rendererOnly?['process family not collected']:sameFamily?[]:['family composition/start identities differ; no aggregate PSS retention delta']},
    pssMb: familyComparable ? b - a : null };
}

// WHY: stringify-then-check allocates the oversized escaped result first. Emit
// bounded chunks instead, counting every property/primitive and escape BEFORE
// retaining it. This bounds serializer-owned output, not input or process memory.
// Only inert plain data is accepted: no proxies, accessors, toJSON or prototypes.
export function boundedJson(value) {
  const chunks = [], ancestors = new Set();
  let bytes = 0, records = 0, pending = '';
  const emit = text => {
    const n = Buffer.byteLength(text);
    if (bytes + n > RESOURCE_DESCRIPTOR.maxBytes) throw Error('resource report byte cap exceeded');
    bytes += n;
    pending += text;
    if (pending.length >= 4096) { chunks.push(pending); pending = ''; }
  };
  const count = () => { if (++records > RESOURCE_DESCRIPTOR.maxRecords) throw Error('resource report record cap exceeded'); };
  const quote = text => {
    // Every UTF-16 code unit needs at least one output byte (surrogates need
    // more), so reject an impossible fit before scanning or escaping the string.
    if (text.length + 2 > RESOURCE_DESCRIPTOR.maxBytes - bytes) throw Error('resource report byte cap exceeded');
    emit('"');
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i), c = text[i];
      if (c === '"' || c === '\\') emit('\\' + c);
      else if (code < 32) emit('\\u' + code.toString(16).padStart(4, '0'));
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) emit(c + text[++i]);
      else if (code >= 0xd800 && code <= 0xdfff) emit('\\u' + code.toString(16).padStart(4, '0'));
      else emit(c);
    }
    emit('"');
  };
  const visit = (item, depth) => {
    count();
    if (depth > 64) throw Error('resource report depth cap exceeded');
    if (item === null || item === undefined) { emit('null'); return; }
    if (typeof item === 'string') { quote(item); return; }
    if (typeof item === 'boolean' || typeof item === 'number') { emit(Number.isFinite(item) || typeof item === 'boolean' ? String(item) : 'null'); return; }
    if (typeof item !== 'object') throw Error('unsupported JSON value');
    if (types.isProxy(item)) throw Error('resource report proxy rejected');
    if (ancestors.has(item)) throw Error('resource report cyclic value');
    const array = Array.isArray(item), proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw Error('resource report requires plain data');
    ancestors.add(item);
    emit(array ? '[' : '{');
    let first = true;
    const property = key => {
      count();
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor && !('value' in descriptor)) throw Error('resource report accessor rejected');
      return descriptor;
    };
    if (array) {
      if (item.length > RESOURCE_DESCRIPTOR.maxRecords) throw Error('resource report record cap exceeded');
      for (let i = 0; i < item.length; i++) { if (i) emit(','); visit(property(String(i))?.value, depth + 1); }
    } else {
      // for-in avoids allocating all keys of a primitive-property flood up front.
      for (const key in item) {
        const descriptor = property(key);
        if (!descriptor?.enumerable || descriptor.value === undefined) continue;
        if (!first) emit(','); first = false;
        quote(key); emit(':'); visit(descriptor.value, depth + 1);
      }
    }
    emit(array ? ']' : '}');
    ancestors.delete(item);
  };
  visit(value, 0); emit('\n');
  if (pending) chunks.push(pending);
  return chunks.join('');
}
