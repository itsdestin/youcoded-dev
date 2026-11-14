// T19 prototype: the "app" side. A hook-like unix-socket server that answers a fake runtime's
// pre-write asks, and holds them after a (simulated) sleep. Throwaway code, no dependencies.
//
// argv: sockPath logPath mode
// modes:
//   baseline  - always answers "allow" at once (what happens with no protection)
//   gap       - heartbeat-gap detector only (no sleep signal at all)
//   signal    - sleep signal only (controller sends SUSPEND/RESUME messages; may be lost or late)
//   both      - signal + gap detector
import net from 'node:net';
import fs from 'node:fs';

const [sockPath, logPath, mode] = process.argv.slice(2);
const TICK_MS = 50;          // real design: ~1000 ms
const GAP_MS = 200;          // real design: ~3000 ms (4x tick, far below the host-presence timeout)
const CAP_MS = 1500;         // real design: ~10 s "nothing reachable" cap
const useGap = mode === 'gap' || mode === 'both';
const useSignal = mode === 'signal' || mode === 'both';
const holdEnabled = mode !== 'baseline';

const log = (o) => fs.appendFileSync(logPath, JSON.stringify({ ...o, t: Date.now() }) + '\n');
let lastTick = Date.now();
let held = false;
let queue = [];
let checkRunning = false;

function grant(sock, id) {
  log({ k: 'grant', id });
  sock.end(JSON.stringify({ decision: 'allow', id }) + '\n');
}

// The wake check: connect, fetch control logs, run decide. 80% of trials the network is reachable
// (100-400 ms); 20% nothing is reachable and the cap releases the hold ("carry on as host").
function startWakeCheck(why) {
  if (checkRunning) return;
  checkRunning = true;
  const reachable = Math.random() < 0.8;
  const wait = reachable ? 100 + Math.random() * 300 : CAP_MS;
  log({ k: 'check-start', why, reachable, wait: Math.round(wait) });
  setTimeout(() => {
    held = false;
    checkRunning = false;
    const q = queue; queue = [];
    log({ k: 'release', n: q.length, reachable });
    for (const { sock, id } of q) grant(sock, id);
  }, wait);
}

function enterHold(why) {
  if (!holdEnabled) return;
  if (!held) { held = true; log({ k: 'hold-enter', why }); }
}

// Heartbeat: if THIS tick is much later than the last one, the process was not running (slept or
// frozen). It enters the hold itself and starts the wake check; it does not just update lastTick.
setInterval(() => {
  const now = Date.now();
  if (useGap && now - lastTick > GAP_MS) { enterHold('tick-gap'); startWakeCheck('tick-gap'); }
  lastTick = now;
}, TICK_MS);

const server = net.createServer((sock) => {
  let buf = '';
  sock.setEncoding('utf8');
  sock.on('error', () => {});
  sock.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.ctl) {                       // simulated powerMonitor events
        if (m.ctl === 'SUSPEND' && useSignal) { enterHold('suspend-signal'); }
        if (m.ctl === 'RESUME' && useSignal) { startWakeCheck('resume-signal'); }
        sock.end(); continue;
      }
      // A hook ask. The gap check runs in the handler too: after a wake the socket event can be
      // processed before the heartbeat's own tick, so the handler cannot rely on the tick.
      const now = Date.now();
      if (useGap && now - lastTick > GAP_MS) { enterHold('handler-gap'); startWakeCheck('handler-gap'); }
      if (held) { log({ k: 'held', id: m.id }); queue.push({ sock, id: m.id }); }
      else grant(sock, m.id);
    }
  });
});
server.listen(sockPath, () => console.log('ready'));
