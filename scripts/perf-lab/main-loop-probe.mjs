import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { sep } from 'node:path';
import { createServer } from 'node:net';
import { connect as connectCdp } from './cdp.mjs';
import { installLoopProbe, readLoopProbe } from './probe-loop.mjs';

export function listeningInodes(text, port) {
  const out = new Set();
  for (const line of text.split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields[3] === '0A' && parseInt(fields[1]?.split(':').at(-1), 16) === port && fields[9]) out.add(fields[9]);
  }
  return out;
}

/** Linux lab guard: establish socket ownership BEFORE contacting any inspector. */
export function verifyInspectorOwner({ pid, binary, home, port }, deps = {}) {
  const readText = deps.readText ?? (p => readFileSync(p, 'utf8'));
  const list = deps.list ?? readdirSync, link = deps.link ?? readlinkSync, real = deps.real ?? realpathSync;
  if (!Number.isInteger(pid) || pid <= 1 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid owned inspector identity.');
  const privateHome = real(home), realHome = real(homedir());
  if (privateHome === realHome || realHome.startsWith(privateHome.endsWith(sep) ? privateHome : privateHome + sep)) throw new Error('Inspector HOME is not private.');
  if (link(`/proc/${pid}/exe`) !== real(binary)) throw new Error('Inspector process executable does not match the owned build.');
  const actualHome = readText(`/proc/${pid}/environ`).split('\0').find(s => s.startsWith('HOME='))?.slice(5);
  if (!actualHome || real(actualHome) !== privateHome) throw new Error('Inspector process HOME does not match the private fixture.');
  const inodes = new Set();
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try { for (const inode of listeningInodes(readText(table), port)) inodes.add(inode); } catch { /* one family may be unavailable */ }
  }
  const owns = list(`/proc/${pid}/fd`).some(fd => {
    try { const match = /^socket:\[(\d+)\]$/.exec(link(`/proc/${pid}/fd/${fd}`)); return !!match && inodes.has(match[1]); }
    catch { return false; }
  });
  if (!owns) throw new Error('Inspector listening socket is not owned by the launched app.');
  return true;
}

export async function freeInspectorPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  return port;
}

export async function connectMainLoop(app, { binary, home, port }, deps = {}) {
  const owner = { pid: app.pid, binary, home, port };
  (deps.verify ?? verifyInspectorOwner)(owner);
  const targets = await (deps.fetchTargets ?? (async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Owned main inspector returned ${response.status}`);
    return response.json();
  }))();
  const candidates = targets.filter(t => t.type === 'node' && t.webSocketDebuggerUrl);
  if (candidates.length !== 1) throw new Error('Owned main inspector did not expose exactly one Node target.');
  const url = new URL(candidates[0].webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || Number(url.port) !== port) throw new Error('Foreign inspector websocket refused.');
  (deps.verify ?? verifyInspectorOwner)(owner);
  const cdp = await (deps.connect ?? connectCdp)(url.href);
  let token = null, active = false, closed = false;
  return {
    owner,
    async start() {
      if (closed || active) throw new Error('Main loop probe is closed or already measuring another operation.');
      active = true;
      try {
        const installed = await installLoopProbe(cdp, { kind: 'main', owner });
        token = installed.token; return installed;
      } catch (e) { active = false; throw e; }
    },
    async read({ stop = false, waitForSample = false } = {}) {
      if (!active || !token) throw new Error('Main loop probe has not started.');
      try { return await readLoopProbe(cdp, 'main', { token, stop, waitForSample }); }
      finally { if (stop) active = false; }
    },
    async blockForCalibration(ms = 400) {
      if (!active || !Number.isFinite(ms) || ms < 1 || ms > 1000) throw new Error('Invalid bounded main-loop calibration.');
      return cdp.evaluate(`(() => { const start=performance.now(); while(performance.now()-start<${ms}) {} return performance.now()-start; })()`);
    },
    // The owner always kills the private app in withBoot.finally. Do not wait on
    // a blocked main thread here and prevent that external cleanup from running.
    close() { closed = true; active = false; cdp.close(); },
  };
}
