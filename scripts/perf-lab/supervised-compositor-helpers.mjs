// Fixed compositor configuration contract and lifecycle. No generic exec API.
import { compositorEnvironment, validateCompositorPlan } from './supervised-compositor-policy.mjs';
import { CLEANUP_BUDGET } from './supervised-launch-core.mjs';

export const HELPER_CAPS = Object.freeze({
  count: 4,
  // WHY (runtime attempts inferred-kwin-ready-6/-7/-8): a real kscreen-doctor -j takes ~1.3-1.7 s on an idle
  // machine and several seconds under load; 3 s plus a 2 s exec-proof window made healthy helpers time out.
  // 8 s is ~5x typical, still fits 4 x (wall + retirement) inside sequenceMs and the compositor wall.
  wallMs: 8000,
  // Bound for the gate process to reach its ready packet (python start-up), separate from helper runtime.
  gateReadyMs: 4000,
  stdoutBytes: 262144,
  stderrBytes: 65536,
  outputPackets: 1024,
  members: 8,
  sequenceMs: 44000,
  termMs: 500,
  killMs: 750,
  closeMs: 500,
});
// WHY (owner decision 2026-10-21): kwin's virtual backend offers only 2560x1600@60 and custom
// modes stay forbidden, so the lab measures at the laptop's size and 1.5x scale but 60 Hz.
// 180 Hz presentation is explicitly NOT measured by this lane.
export const EXPECTED_OUTPUT = Object.freeze({
  name: 'Virtual-0', width: 2560, height: 1600, refreshHz: 60, scale: 1.5,
  logicalWidth: 1707, logicalHeight: 1067,
});

function numericId(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,5})$/.test(value)) {
    throw Error('Unsupported nonnumeric mode identifier');
  }
  return value;
}

function boundedText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > HELPER_CAPS.stdoutBytes || text.includes('\0')) {
    throw Error('Helper output byte/encoding cap');
  }
  return text;
}

// WHY (runtime attempt helper-hardening-1): four FULL helper retirement receipts (pipes, spawnedChild,
// gateEvidence, authorizer, execution, survivors ...) are ~100 protocol records each, so once all four
// helpers ran, the inspect result and the worker's retirement receipt exceeded the 512-record IPC budget,
// the receipt was never delivered and no retirement evidence was written. The full per-helper receipt is
// already persisted in its own `helper-retirement` evidence row; anything that rides the IPC envelope
// carries this fixed-shape summary instead (every safety-relevant verdict kept, nothing silently dropped).
export function summarizeHelperReceipt(r) {
  if (!r || typeof r !== 'object') return { step: null, cleanupConfirmed: false, summary: 'missing' };
  if (typeof r.evidence === 'string' && 'executionKind' in r) return r; // already a summary (idempotent)
  const exec = r.execution ?? null, pipes = r.pipes ?? {};
  return {
    step: r.step ?? null, cleanupConfirmed: r.cleanupConfirmed === true,
    executionKind: exec?.kind ?? pipes.gateEvidence?.kind ?? null,
    runtimeExeObserved: exec ? exec.runtimeExeObserved === true : false,
    receiptPipeEOF: exec ? exec.receiptPipeEOF === true : pipes.gateEvidence?.receiptPipeEOF === true,
    authorized: !!(exec?.authorizer ?? pipes.gateEvidence?.authorizer),
    exited: pipes.exited === true, closed: pipes.closed === true,
    code: pipes.code ?? exec?.exit?.code ?? null, signal: pipes.signal ?? exec?.exit?.signal ?? null,
    error: r.error ? String(r.error).slice(0, 256) : null,
    survivors: Array.isArray(r.survivors) ? r.survivors.length : 0,
    localErrors: Array.isArray(r.localErrors) ? r.localErrors.length : 0,
    memoryComplete: r.memoryComplete !== false,
    evidence: 'full receipt in the helper-retirement evidence row',
  };
}
export function summarizeHelperRetirement(h) {
  if (!h || typeof h !== 'object') return h ?? null;
  return { cleanupConfirmed: h.cleanupConfirmed === true,
    error: h.error ? String(h.error).slice(0, 256) : null,
    receipts: (h.receipts ?? []).slice(0, HELPER_CAPS.count).map(summarizeHelperReceipt) };
}

export function parseKScreen(text, { effective = false } = {}) {
  // WHY: installed /usr/share/zsh/site-functions/_kscreen-doctor documents
  // outputs[].id/name/connected/enabled/currentModeId and modes[].id/size/refreshRate.
  // Installed KF6/KScreen/kscreen/output.h declares pos/rotation/scale properties
  // and Rotation::None = 1. Unknown/version-drifted shapes remain unsupported.
  // Treat tool output only as data; never splice arbitrary strings into commands.
  const value = JSON.parse(boundedText(text));
  const queue = [[value, 0]];
  let nodes = 0;
  while (queue.length) {
    const [item, depth] = queue.pop();
    if (++nodes > 2048 || depth > 12) throw Error('KScreen JSON structural cap');
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) queue.push([child, depth + 1]);
    }
  }
  if (!Array.isArray(value?.outputs) || value.outputs.length !== 1) {
    throw Error('Exactly one private virtual output required');
  }
  const output = value.outputs[0];
  if (!Number.isSafeInteger(output.id) || output.id < 1 || output.id > 65535 ||
      output.name !== EXPECTED_OUTPUT.name || output.connected !== true || output.enabled !== true ||
      output.rotation !== 1 || output.pos?.x !== 0 || output.pos?.y !== 0 ||
      !Number.isFinite(output.scale) || output.scale <= 0 || output.scale > 4 ||
      !Array.isArray(output.modes) || !output.modes.length || output.modes.length > 128) {
    throw Error('Unexpected output identity/state/geometry');
  }
  const ids = new Set();
  for (const mode of output.modes) {
    numericId(mode.id);
    if (ids.has(mode.id) || !Number.isSafeInteger(mode.size?.width) || !Number.isSafeInteger(mode.size?.height) ||
        mode.size.width < 1 || mode.size.height < 1 || mode.size.width > 16384 || mode.size.height > 16384 ||
        !Number.isFinite(mode.refreshRate) || mode.refreshRate <= 0 || mode.refreshRate > 1000) {
      throw Error('Invalid/duplicate KScreen mode metadata');
    }
    ids.add(mode.id);
  }
  numericId(output.currentModeId);
  if (!ids.has(output.currentModeId)) throw Error('Unknown effective mode identifier');
  const matches = output.modes.filter(mode => mode.size.width === EXPECTED_OUTPUT.width &&
    mode.size.height === EXPECTED_OUTPUT.height && mode.refreshRate === EXPECTED_OUTPUT.refreshHz);
  if (matches.length !== 1) throw Error(`Exact existing ${EXPECTED_OUTPUT.width}x${EXPECTED_OUTPUT.height}@${EXPECTED_OUTPUT.refreshHz} mode missing/ambiguous; custom creation unsupported`);
  const mode = matches[0];
  if (effective && (output.currentModeId !== mode.id || output.scale !== EXPECTED_OUTPUT.scale)) {
    throw Error('Effective KScreen mode/scale differs from fixed request');
  }
  return {
    outputId: output.id, modeId: mode.id, name: output.name,
    width: mode.size.width, height: mode.size.height, refreshHz: mode.refreshRate,
    scale: output.scale, currentModeId: output.currentModeId,
  };
}

export function parseWaylandOutput(text) {
  // WHY: installed wayland-info format strings and its manual describe output
  // records. Match one wl_output block, not a random mode elsewhere in stdout.
  const blocks = boundedText(text).split(/^interface: /m).slice(1);
  if (!blocks.length || blocks.length > 256) throw Error('Wayland interface report incomplete/bounded');
  const outputs = blocks.filter(block => /^'?wl_output'?,\s+version:/.test(block));
  if (outputs.length !== 1) throw Error('Wayland output count mismatch');
  const block = outputs[0];
  const names = [...block.matchAll(/^\s*name:\s*'?([^'\r\n]+)'?\s*$/gm)].map(match => match[1].trim());
  if (!names.length || names.some(name => name !== EXPECTED_OUTPUT.name)) throw Error('Wayland output name mismatch');
  const logical = [...block.matchAll(/^\s*logical_width: (\d+), logical_height: (\d+)\s*$/gm)];
  const modes = [...block.matchAll(/width: (\d+) px, height: (\d+) px, refresh: (\d+\.\d{3}) Hz,\s*\r?\n\s*flags:([^\r\n]*)/g)];
  const current = modes.filter(match => /\bcurrent\b/.test(match[4]));
  // WHY: kwin 6.7.5's wl_output block carries no xdg_output logical size (containment-1 evidence);
  // it prints the integer wl_output scale, i.e. ceil(1.5) = 2. When the logical size is printed it
  // must match exactly; when it is absent, exactly one integer scale equal to ceil(EXPECTED scale)
  // is required and the result says the logical size was not reported. KScreen's readback is what
  // pins the fractional 1.5 itself.
  const intScale = [...block.matchAll(/^\s*x: -?\d+, y: -?\d+, scale: (\d+),\s*$/gm)];
  const logicalOk = logical.length === 1 ? Number(logical[0][1]) === EXPECTED_OUTPUT.logicalWidth &&
      Number(logical[0][2]) === EXPECTED_OUTPUT.logicalHeight
    : logical.length === 0 && intScale.length === 1 && Number(intScale[0][1]) === Math.ceil(EXPECTED_OUTPUT.scale);
  if (!logicalOk || current.length !== 1 || Number(current[0][1]) !== EXPECTED_OUTPUT.width ||
      Number(current[0][2]) !== EXPECTED_OUTPUT.height || Number(current[0][3]) !== EXPECTED_OUTPUT.refreshHz) {
    // WHY: helper-hardening-1 failed here with no hint which sub-check differed. Report only the
    // numbers wl_output itself printed (bounded), so the next attempt is not blind.
    const seen = `logical=${logical.map(m => `${m[1]}x${m[2]}`).join('|').slice(0, 60)} intScale=${intScale.map(m => m[1]).join('|').slice(0, 20)} ` +
      `modes=${modes.map(m => `${m[1]}x${m[2]}@${m[3]}${/\bcurrent\b/.test(m[4]) ? '*' : ''}`).join('|').slice(0, 160)}`;
    throw Error(`Effective Wayland geometry/refresh mismatch or incomplete report (${seen})`);
  }
  return { name: EXPECTED_OUTPUT.name, width: Number(current[0][1]), height: Number(current[0][2]),
    refreshHz: Number(current[0][3]),
    ...(logical.length ? { logicalWidth: Number(logical[0][1]), logicalHeight: Number(logical[0][2]) }
      : { logicalSize: 'not-reported-by-compositor', wlOutputIntegerScale: Number(intScale[0][1]) }) };
}

export function waylandOutputExcerpt(text) {
  const blocks = String(text).split(/^interface: /m).slice(1);
  const block = blocks.find(b => /^'?wl_output'?,\s+version:/.test(b)) ?? '';
  const heads = blocks.map(b => b.split('\n', 1)[0].slice(0, 60)).slice(0, 40);
  return `interfaces=${heads.join(' ; ')}`.slice(0, 1800) + '\n---wl_output---\n' + block.slice(0, 2000);
}

export function createHelperOutputCollector() {
  let stdoutBytes = 0, stderrBytes = 0, packets = 0, failure = null;
  const chunks = [];
  return {
    append(name, bytes) {
      if (failure) return;
      if (++packets > HELPER_CAPS.outputPackets) {
        failure = Error('Helper output packet cap');
        return;
      }
      if (!Buffer.isBuffer(bytes) || !['stdout', 'stderr'].includes(name)) {
        failure = Error('Invalid helper output packet');
        return;
      }
      if (name === 'stdout') stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      // WHY: cap at the producer before retaining chunks, not after joining or
      // parsing. A truncated prefix can never become a successful JSON report.
      if (stdoutBytes > HELPER_CAPS.stdoutBytes || stderrBytes > HELPER_CAPS.stderrBytes) {
        failure = Error('Helper stdout/stderr byte cap');
        return;
      }
      if (name === 'stdout') chunks.push(Buffer.from(bytes));
    },
    check() { if (failure) throw failure; },
    result() {
      if (failure) throw failure;
      return { stdout: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), stderrBytes };
    },
  };
}

export function helperEnvironment(plan) {
  plan = validateCompositorPlan(plan);
  // The worker is outside dbus-run-session's environment inheritance tree.
  // Its helpers connect ONLY to the explicit private bus selected by bus.conf.
  return { ...compositorEnvironment(plan), DBUS_SESSION_BUS_ADDRESS: `unix:path=${plan.runtime}/bus` };
}

export function helperCommand(receipts, step, selection) {
  let role, args;
  if (step === 'initial' || step === 'final') {
    role = 'kscreen-doctor';
    args = ['-j'];
  } else if (step === 'apply') {
    role = 'kscreen-doctor';
    if (!Number.isSafeInteger(selection?.outputId) || selection.outputId < 1 || selection.outputId > 65535 ||
        selection.name !== EXPECTED_OUTPUT.name || selection.width !== EXPECTED_OUTPUT.width ||
        selection.height !== EXPECTED_OUTPUT.height || selection.refreshHz !== EXPECTED_OUTPUT.refreshHz) {
      throw Error('Invalid validated mode selection');
    }
    args = [`output.${selection.outputId}.mode.${numericId(selection.modeId)}`,
      `output.${selection.outputId}.scale.1.5`];
  } else if (step === 'wayland') {
    role = 'wayland-info';
    args = [];
  } else {
    throw Error('Unsupported fixed helper purpose');
  }
  const receipt = receipts[role];
  if (receipt?.path !== `/usr/bin/${role}`) throw Error('Unverified helper role');
  return { binary: receipt.path, identity: receipt.identity, argv: [receipt.path, ...args] };
}

export const TRANSIENT_INSPECTION_CODES = Object.freeze(['ENOENT', 'ESRCH', 'EIDENTITYCHANGED']);

// WHY: a poll that lands mid-execve (or mid-exit) can read a process whose environ is momentarily empty,
// so HOME is unreadable. That is "cannot observe yet", NOT a different process. A definite mismatch (pid,
// starttime, ppid, session, uid, a READABLE wrong HOME, or an unapproved executable) still fails closed;
// an unreadable HOME is never accepted as a match and never recorded as an observation.
export function verifyHelperIdentity(record, leader, receipt, plan, uid, gateExe) {
  const homeUnreadable = record && (record.home === null || record.home === undefined);
  if (!record || !leader || record.pid !== leader.pid || record.starttime !== leader.starttime ||
      record.ppid !== leader.ppid || record.pgrp !== record.pid || record.session !== record.pid ||
      (record.home !== plan.home && !homeUnreadable) || record.uid !== uid) {
    // Name only the failing FIELDS (no values, no paths) so a refusal is never blind.
    const failed = !record ? ['record'] : !leader ? ['leader'] : [
      record.pid !== leader.pid && 'pid', record.starttime !== leader.starttime && 'starttime',
      record.ppid !== leader.ppid && 'ppid', record.pgrp !== record.pid && 'pgrp', record.session !== record.pid && 'session',
      record.home !== plan.home && !homeUnreadable && 'home',
      record.uid !== uid && 'uid'].filter(Boolean);
    throw Error(`Helper worker-child identity mismatch (${failed.join(',')})`);
  }
  if (homeUnreadable) return null; // transient: retry on the next poll
  if (record.exe === gateExe) return false;
  if (record.exe !== receipt.path || !record.executableIdentity ||
      ['dev', 'ino', 'uid', 'mode'].some(key => record.executableIdentity[key] !== receipt.identity[key])) {
    throw Error('Helper role executable identity mismatch');
  }
  return true;
}

export class HelperExecEvidence {
  constructor(expected) {
    this.expected = expected;
    this.bytes = Buffer.alloc(0);
    this.ready = false;
    this.receipt = null;
    this.eof = false;
    this.observed = null;
    this.packets = 0;
  }

  append(chunk) {
    if (this.eof || !Buffer.isBuffer(chunk) || ++this.packets > 32 || this.bytes.length + chunk.length > 4096) {
      throw Error('Helper gate receipt packet/byte cap');
    }
    this.bytes = Buffer.concat([this.bytes, chunk]);
    if (!this.ready && this.bytes.length) {
      if (this.bytes[0] !== 71) throw Error('Invalid helper gate readiness');
      this.ready = true;
    }
    const body = this.bytes.subarray(1);
    const newline = body.indexOf(10);
    if (newline < 0) return;
    if (newline !== body.length - 1) throw Error('Extra helper authorization bytes');
    const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, newline)));
    const expected = this.expected;
    if (Object.keys(receipt).sort().join(',') !== 'home,identity,kind,pid,planDigest,purpose,revision,uid' ||
        receipt.revision !== 1 || receipt.kind !== 'authorized_fdexec' ||
        ['pid', 'uid', 'home', 'purpose', 'planDigest'].some(key => receipt[key] !== expected[key]) ||
        !receipt.identity || ['dev', 'ino', 'uid', 'mode'].some(key => receipt.identity[key] !== expected.identity[key])) {
      throw Error('Helper authorization receipt binding mismatch');
    }
    this.receipt = receipt;
  }

  end() { this.eof = true; }

  observe(record, leader, receipt, plan, uid, gateExe) {
    if (verifyHelperIdentity(record, leader, receipt, plan, uid, gateExe) === true) {
      this.observed = { pid: record.pid, starttime: record.starttime, executableIdentity: record.executableIdentity };
      return true;
    }
    return false;
  }

  // One tolerant poll: a vanished/changing process is "not observable now", every definite mismatch throws.
  tryObserve(inspect, leader, receipt, plan, uid, gateExe) {
    let record;
    try { record = inspect(); }
    catch (error) {
      if (!TRANSIENT_INSPECTION_CODES.includes(error.code)) throw error;
      return false; // wait for independently delivered child exit/close events
    }
    return record ? this.observe(record, leader, receipt, plan, uid, gateExe) : false;
  }

  // WHY: the gate writes the bound authorization receipt over its private descriptor BEFORE execve, so
  // "release was honoured" is established by that receipt (or by a completed exit), never by catching a
  // short-lived helper alive in /proc. A live observation is opportunistic corroboration only. Completion
  // (waitResult/completed) still demands receipt + EOF + clean exit 0, so a failed exec stays fail-closed.
  corroborate(state, inspect, leader, receipt, plan, uid, gateExe) {
    if (!state.connected || state.disposed) throw Error('Helper disconnected/retired');
    if (state.exited) return state.closed ? this.completed(state) : false;
    if (this.observed === null) this.tryObserve(inspect, leader, receipt, plan, uid, gateExe);
    return this.ready && this.receipt !== null;
  }

  completed({ released, connected, exited, closed, code, signal }) {
    // WHY: EOF or exit 0 alone cannot authorize a fast helper. This evidence is
    // valid only for a captured trusted gate's fixed-role, verified FD-exec plan,
    // bound receipt, close-on-exec receipt pipe and normal completed child.
    if (!released || !connected || !this.ready || !this.receipt || !this.eof ||
        !exited || !closed || code !== 0 || signal) throw Error('Helper FD-exec completion unconfirmed');
    return { kind: this.observed ? 'observed_postexec' : 'authorized_fdexec_completed',
      runtimeExeObserved: this.observed !== null, observed: this.observed,
      authorizer: this.receipt, receiptPipeEOF: true, exit: { code, signal } };
  }
}

export class CompositorConfiguration {
  constructor(plan, receipts, deps, deadline) {
    this.plan = validateCompositorPlan(plan);
    this.receipts = receipts;
    this.deps = deps;
    if (!Number.isFinite(deadline)) throw Error('Finite compositor helper deadline required');
    this.deadline = Math.min(deadline, deps.now() + HELPER_CAPS.sequenceMs);
    this.handles = [];
    this.stopped = false;
    this.failure = null;
    this.result = null;
  }

  checkBudget() {
    if (this.stopped || this.failure || this.deps.now() >= this.deadline) {
      throw Error('Configuration stopped/failed/deadline; no helper retry');
    }
  }

  proveSocket() {
    this.checkBudget();
    const proof = this.deps.proveSocket();
    if (proof?.owned !== true) throw Error('Helper connection requires verified private socket');
    const key = JSON.stringify([proof.socketPath, proof.filesystemDevice, proof.filesystemInode,
      proof.kernelInode, proof.owners]);
    if (this.socketKey && key !== this.socketKey) throw Error('Private socket replaced between helpers');
    this.socketKey = key;
    return proof;
  }

  sampleResources() {
    let rssMb = 0, members = 0;
    for (const handle of this.handles) {
      if (!handle.family?.leader || handle.receipt) continue;
      const sample = handle.family.sample();
      if (!Number.isFinite(sample.rssMb) || sample.rssMb < 0 || sample.members.length > HELPER_CAPS.members) {
        throw Error('Incomplete helper memory/family observation');
      }
      rssMb += sample.rssMb;
      members += sample.members.length;
    }
    return { rssMb, members };
  }

  async retire(handle) {
    if (handle.retiring) return handle.retiring;
    handle.retiring = (async () => {
      await handle.captureDone?.catch(() => {});
      let family = { cleanupConfirmed: false }, pipes = { exited: false, closed: false }, error = null;
      try { handle.gate.abort(); } catch (e) { error = String(e.message).slice(0, 256); }
      try {
        if (handle.family) family = await handle.family.cleanup({ termWaitMs: HELPER_CAPS.termMs,
          killWaitMs: HELPER_CAPS.killMs, everyMs: CLEANUP_BUDGET.stabilizeMs });
      } catch (e) { error = String(e.message).slice(0, 256); }
      try { pipes = await handle.gate.waitClosed(HELPER_CAPS.closeMs); }
      catch (e) { error = String(e.message).slice(0, 256); }
      // Retain the observed failure before disposing local handles. No child.kill
      // fallback and no equation of destroyed local pipes with a dead writer.
      handle.receipt = { step: handle.step, cleanupConfirmed: !error && family.cleanupConfirmed === true &&
        pipes.exited === true && pipes.closed === true && !pipes.error, pipes, error,
        familyError: family.cleanupError ?? family.error ?? null,
        execution: handle.execution ?? null,
        survivors: (family.survivors ?? []).slice(0, HELPER_CAPS.members).map(
          ({ pid, starttime, currentStarttime, state, unreadable }) =>
            ({ pid, starttime, currentStarttime, state, unreadable })),
        memoryComplete: family.memoryComplete !== false };
      try {
        const local = handle.gate.disposeLocal();
        if (local.errors?.length) handle.receipt.cleanupConfirmed = false;
        handle.receipt.localErrors = local.errors ?? [];
      } catch (e) { handle.receipt.cleanupConfirmed = false; handle.receipt.localErrors = [String(e.message).slice(0, 256)]; }
      this.deps.note('helper-retirement', handle.receipt);
      return handle.receipt;
    })();
    return handle.retiring;
  }

  async run(step, selection) {
    this.proveSocket();
    if (this.handles.length >= HELPER_CAPS.count) throw Error('Helper count cap');
    const command = helperCommand(this.receipts, step, selection);
    this.acquisition = Promise.resolve(this.deps.spawnHelper(step, selection));
    const gate = await this.acquisition;
    const handle = { step, gate, family: null, receipt: null };
    this.handles.push(handle);
    try {
      this.checkBudget();
      handle.captureDone = (async () => {
        try { await gate.capture(); }
        finally { if (gate.family?.leader || gate.family?.spawned) handle.family = gate.family; }
      })();
      await handle.captureDone;
      this.deps.note('helper-ownership', { step, leader: handle.family?.leader ?? null });
      this.proveSocket(); // repeated immediately before fixed helper gate release
      gate.release();
      await gate.corroborate();
      this.checkBudget();
      const output = await gate.waitResult();
      handle.execution = output.execution ?? null;
      if (!['observed_postexec', 'authorized_fdexec_completed'].includes(handle.execution?.kind)) {
        throw Error('Helper execution evidence missing');
      }
      if (output.code !== 0 || output.signal || output.stderrBytes > HELPER_CAPS.stderrBytes) {
        throw Error('Helper failed exit/output');
      }
      boundedText(output.stdout);
      this.checkBudget();
      this.proveSocket();
      return output.stdout;
    } finally {
      const receipt = await this.retire(handle);
      if (!receipt.cleanupConfirmed) throw Error(`Helper ${command.binary} retirement unconfirmed`);
    }
  }

  inspect() {
    if (this.failure || this.stopped) return Promise.reject(Error('Configuration failed/stopped; no retry'));
    if (this.result) {
      try { this.proveSocket(); return Promise.resolve(this.result); }
      catch (error) { this.failure = error; return Promise.reject(error); }
    }
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const selected = parseKScreen(await this.run('initial'));
        await this.run('apply', selected);
        const observed = parseKScreen(await this.run('final'), { effective: true });
        if (observed.outputId !== selected.outputId || observed.modeId !== selected.modeId) {
          throw Error('Output/mode identity changed during configuration');
        }
        const waylandText = await this.run('wayland');
        let wayland;
        try { wayland = parseWaylandOutput(waylandText); }
        catch (error) {
          // WHY: helper-hardening-2 showed no logical size in the report; the evidence tail kept only the
          // end of a ~40 KB dmabuf-format table. Keep the wl_output block itself (bounded, no env/paths).
          this.deps.note('wayland-report-excerpt', { reason: String(error.message).slice(0, 256),
            excerpt: waylandOutputExcerpt(waylandText) });
          throw error;
        }
        const socket = this.proveSocket();
        this.result = { status: 'observed-private-output-metadata', modeVerified: true, observed, wayland,
          socket, helpers: this.handles.map(handle => summarizeHelperReceipt(handle.receipt)),
          observedAt: this.deps.now(), observationScope: 'completed helper readbacks, not continuous mode monitoring',
          physicalScanoutVerified: false, appWaylandBinding: 'supervised-launch-plan-field-not-runtime-validated', gpuRuntime: 'blocked' };
        this.deps.note('configuration-observed', this.result);
        return this.result;
      } catch (error) {
        this.failure = error;
        this.deps.note('configuration-incomplete', { reason: String(error.message).slice(0, 512) });
        throw error;
      }
    })();
    return this.pending;
  }

  async stop() {
    this.stopped = true;
    // Only acquisition, not the whole sequence: the sequence may be blocked in
    // helper output. Retire that actual captured family before the compositor.
    await this.acquisition?.catch(() => {});
    const receipts = [];
    for (const handle of [...this.handles].reverse()) receipts.push(await this.retire(handle));
    // Local disposal cancels the adapter's bounded output poll on its next turn.
    // Drain its failure note before the worker closes the evidence descriptor.
    await this.pending?.catch(() => {});
    return { cleanupConfirmed: receipts.every(receipt => receipt.cleanupConfirmed), receipts };
  }
}
