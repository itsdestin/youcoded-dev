// Narrow optional route used by launchApp. Existing unsupervised callers unchanged.
import { createConnection } from 'node:net';
import { connect } from './cdp.mjs';
import { findFamily } from './procs.mjs';
import { readPpid, selfChain } from './launch.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const within = (operation, ms, label) => {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`Supervised ${label} timeout`)), ms); })]).finally(() => clearTimeout(timer));
};
function portBusy(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', error => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve(false) : reject(error); });
    socket.on('timeout', () => { socket.destroy(); reject(Error('CDP conflict probe timeout')); });
  });
}
// WHY: shared CDP discovery follows redirects. This fenced lane must never
// contact a redirect destination or allocate an unbounded /json/list response.
export async function fetchSupervisedTargets(port, { fetcher = fetch, timeoutMs = 2000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid CDP numeric port');
  const url = `http://127.0.0.1:${port}/json/list`, abort = new AbortController();
  let reader, response, timer;
  const timeout = new Promise((_, reject) => { timer = setTimer(() => { abort.abort(); reject(Error('Supervised CDP body deadline')); }, timeoutMs); });
  const operation = async () => {
    response = await fetcher(url, { redirect: 'error', signal: abort.signal });
    if (response.url !== url) throw Error('Supervised CDP response origin/path changed');
    if (response.status !== 200 || !response.ok) throw Error(`Supervised CDP redirect/status ${response.status}`);
    if (!response.body?.getReader) throw Error('Supervised CDP body unavailable');
    reader = response.body.getReader();
    const chunks=[]; let total=0;
    while(true) {
      const item=await reader.read(); if(item.done) break;
      total+=item.value.byteLength;
      if(total>65536) throw Error('Supervised CDP response byte cap');
      chunks.push(Buffer.from(item.value));
    }
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total)));
    if(!Array.isArray(data) || data.length>64) throw Error('Supervised CDP target count cap');
    return data;
  };
  try { return await Promise.race([operation(),timeout]); }
  finally {
    clearTimer(timer); abort.abort();
    // Cancel on success AND failure; do not await a hostile cancel promise.
    try { const pending=reader ? reader.cancel() : response?.body?.cancel(); pending?.catch(()=>{}); } catch { /* own aborted response */ }
    try { reader?.releaseLock?.(); } catch { /* read may still be pending after deadline */ }
  }
}

export async function launchSupervisedApp(options, deps = {}) {
  const { binary, appDir, fixture, cdpPort = 9555, display = ':99', supervisedBackend: backend, waylandSocket, protocolLog, extraArgs = [] } = options;
  try {
    if (waylandSocket || protocolLog || extraArgs.length) throw Error('Initial supervised backend supports fixed X11 app only; GPU/native/additional argv unsupported');
    backend.assertBinding({ binary, appDir, fixture, cdpPort, display });
    const ancestors = deps.ancestors ?? selfChain(readPpid, process.pid);
    const conflicts = (deps.findFamily ?? findFamily)([appDir, fixture.home]).filter(pid => !ancestors.has(pid));
    // Read-only refusal, never recovery sweeps, lock removal or marker/group signals.
    if (conflicts.length || await (deps.portBusy ?? portBusy)(cdpPort)) throw Error('Supervised app conflict: refusing without signalling');
  } catch (error) {
    // Even an unlaunched worker must explicitly retire; it is not reusable.
    try { await backend.kill(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Supervised preflight/retirement failed'); }
    throw error;
  }
  let proc, cdp, retired = false;
  const runtime = deps.runtime ?? process;
  const onExit = () => backend.disconnect();
  const onSignal = () => { backend.disconnect(); }; // worker survives controller blockage/death
  const detach = () => { runtime.off('exit', onExit); runtime.off('SIGTERM', onSignal); runtime.off('SIGINT', onSignal); };
  runtime.on('exit', onExit); runtime.on('SIGTERM', onSignal); runtime.on('SIGINT', onSignal);
  const kill = async () => {
    try { cdp?.close(); } catch { /* own socket only */ }
    try { const receipt = await backend.kill(); retired = true; return receipt; }
    finally { detach(); }
  };
  try {
    proc = await backend.spawn();
    const end = performance.now() + 90000;
    let target;
    while (performance.now() < end && !target) {
      if (backend.retired || proc.exitCode !== null || proc.signalCode !== null) throw Error('Supervised app exited during startup');
      let endpoint;
      try { endpoint = await backend.request('endpoint', 2000); } catch (error) {
        // A missing listener is expected before Chromium opens its port. Every
        // error is retained in the worker; unknown/foreign listener never permits HTTP/CDP.
        if (backend.retired) throw error;
      }
      if (endpoint?.owned) {
        const targets = await within(() => (deps.listTargets ?? fetchSupervisedTargets)(cdpPort), 2000, 'targets');
        target = targets.find(t => t.type === 'page' && t.url?.startsWith('file://') && !t.url.includes('mode='));
      }
      if (!target) await (deps.sleep ?? sleep)(100);
    }
    if (!target) throw Error('Supervised startup timeout');
    const url = new URL(target.webSocketDebuggerUrl);
    if (!target.webSocketDebuggerUrl.startsWith(`ws://127.0.0.1:${cdpPort}/devtools/page/`) || url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.search || Number(url.port) !== cdpPort || !url.pathname.startsWith('/devtools/page/')) throw Error('Untrusted CDP websocket endpoint');
    const attachmentProof = await backend.request('endpoint', 2000); // re-prove immediately before attach
    if (attachmentProof?.owned !== true) throw Error('CDP endpoint ownership lost before attach');
    const pending = (deps.connect ?? connect)(url.href);
    try { cdp = await within(() => pending, 3000, 'CDP acquisition'); }
    catch (error) { pending.then(late => late.close()).catch(() => {}); throw error; }
    await within(() => cdp.send('Runtime.enable'), 3000, 'Runtime.enable');
    await within(() => cdp.send('Page.enable'), 3000, 'Page.enable');
    return { proc, pid: proc.pid, spawnedAt: Date.now(), cdpPort, target, cdp, familyNeedles: [],
      family: () => backend.members.map(m => m.pid), output: () => backend.output(),
      get exitInfo() { return proc.exitCode === null && proc.signalCode === null ? null : { code: proc.exitCode, signal: proc.signalCode }; },
      get supervisionReceipt() { return backend.receipt; }, kill };
  } catch (error) {
    try { await kill(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Supervised startup/cleanup failed; no retry permitted'); }
    throw error;
  } finally { if (retired) detach(); }
}
