// Fixed compositor configuration contract and lifecycle. No generic exec API.
import { compositorEnvironment, validateCompositorPlan } from './supervised-compositor-policy.mjs';
import { CLEANUP_BUDGET } from './supervised-launch-core.mjs';

export const HELPER_CAPS = Object.freeze({
  count: 4,
  wallMs: 3000,
  stdoutBytes: 262144,
  stderrBytes: 65536,
  outputPackets: 1024,
  members: 8,
  sequenceMs: 30000,
  termMs: 500,
  killMs: 750,
  closeMs: 500,
});
export const EXPECTED_OUTPUT = Object.freeze({
  name: 'Virtual-0', width: 2560, height: 1600, refreshHz: 180, scale: 1.5,
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
  if (matches.length !== 1) throw Error('Exact existing 2560x1600@180 mode missing/ambiguous; custom creation unsupported');
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
  if (logical.length !== 1 || current.length !== 1 || Number(logical[0][1]) !== EXPECTED_OUTPUT.logicalWidth ||
      Number(logical[0][2]) !== EXPECTED_OUTPUT.logicalHeight || Number(current[0][1]) !== EXPECTED_OUTPUT.width ||
      Number(current[0][2]) !== EXPECTED_OUTPUT.height || Number(current[0][3]) !== EXPECTED_OUTPUT.refreshHz) {
    throw Error('Effective Wayland geometry/refresh mismatch or incomplete report');
  }
  return { name: EXPECTED_OUTPUT.name, width: Number(current[0][1]), height: Number(current[0][2]),
    refreshHz: Number(current[0][3]), logicalWidth: Number(logical[0][1]), logicalHeight: Number(logical[0][2]) };
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

export function verifyHelperIdentity(record, leader, receipt, plan, uid, gateExe) {
  if (!record || !leader || record.pid !== leader.pid || record.starttime !== leader.starttime ||
      record.ppid !== leader.ppid || record.pgrp !== record.pid || record.session !== record.pid ||
      record.home !== plan.home || record.uid !== uid) throw Error('Helper worker-child identity mismatch');
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
    if (verifyHelperIdentity(record, leader, receipt, plan, uid, gateExe)) {
      this.observed = { pid: record.pid, starttime: record.starttime, executableIdentity: record.executableIdentity };
      return true;
    }
    return false;
  }

  corroborate(state, inspect, leader, receipt, plan, uid, gateExe) {
    if (!state.connected || state.disposed) throw Error('Helper disconnected/retired');
    if (state.exited) return state.closed ? this.completed(state) : false;
    let record;
    try { record = inspect(); }
    catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
      return false; // wait for independently delivered child exit/close events
    }
    return record ? this.observe(record, leader, receipt, plan, uid, gateExe) : false;
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
      if (!handle.family || handle.receipt) continue;
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
        finally { if (gate.family?.leader) handle.family = gate.family; }
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
        const wayland = parseWaylandOutput(await this.run('wayland'));
        const socket = this.proveSocket();
        this.result = { status: 'observed-private-output-metadata', modeVerified: true, observed, wayland,
          socket, helpers: this.handles.map(handle => handle.receipt),
          observedAt: this.deps.now(), observationScope: 'completed helper readbacks, not continuous mode monitoring',
          physicalScanoutVerified: false, appWaylandBinding: 'not-implemented', gpuRuntime: 'blocked' };
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
