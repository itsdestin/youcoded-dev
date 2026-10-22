// scripts/perf-lab/net-shape.mjs — a TCP proxy that makes loopback behave like a phone on
// a slow connection: every byte is delayed by half the round trip in each direction, and
// each direction is capped to a bandwidth. It is plain TCP, so HTTP/1.1 (which opens
// several connections at once) and WebSocket upgrades both pass through untouched.
//
//   node scripts/perf-lab/net-shape.mjs --target 100.64.0.1:9900 [--listen 10071] \
//        [--rtt 470] [--down-mbit 5] [--up-mbit 2]
//
// HOW THE SHAPING WORKS (and what it deliberately does not model)
//  - Each direction is ONE shared link for all connections, like a phone's radio: two
//    parallel downloads split the cap, they do not each get it. The link is a
//    serialisation queue (a chunk of n bytes occupies the link for n*8/bps seconds, then
//    arrives one-way-delay later). That is a token bucket with no burst allowance — the
//    simplest honest cap — and because every chunk's arrival time is later than the
//    previous one's, byte order is preserved by construction.
//  - Data is cut into <= 16 KB pieces before queueing, so a big download from one
//    connection cannot starve a small request on another for seconds.
//  - A new connection pays one extra round trip before its first byte can go up (the
//    TCP handshake the loopback skipped). There is no TLS: the app serves plain http and
//    Tailscale encrypts underneath, which costs the phone no round trips.
//  - NOT modelled: packet loss, jitter, slow start, TCP back-pressure (a sender here
//    always finishes writing instantly, so the SERVER's own timing is unshaped — only
//    what the phone sees is). The numbers are therefore a floor for "this much data
//    over this link", not a replay of a particular phone.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import net from 'node:net';
import { fileURLToPath } from 'node:url';

/** Largest piece queued at once; keeps connections interleaving fairly on the shared link. */
export const PIECE_BYTES = 16 * 1024;

/** One direction of the (shared) link. `bps` 0 = unlimited. */
class Link {
  constructor(bps, oneWayMs) {
    this.bps = bps;
    this.oneWayMs = oneWayMs;
    this.freeAt = 0;      // ms timestamp when the link has finished sending what it holds
    this.bytes = 0;       // delivered so far
  }
  /** When a piece of `n` bytes that is ready at `readyAt` reaches the far end. */
  schedule(n, readyAt) {
    const start = Math.max(this.freeAt, readyAt);
    const wire = this.bps > 0 ? (n * 8 * 1000) / this.bps : 0;
    this.freeAt = start + wire;
    return this.freeAt + this.oneWayMs;
  }
}

/** The ordered, delayed hand-off from one socket to the other, for one direction of one connection. */
class Pipe {
  constructor(link, from, to, notBefore, onDelivered) {
    this.link = link; this.to = to; this.notBefore = notBefore; this.onDelivered = onDelivered;
    this.queue = [];      // { at, buf } | { at, end: true }, already in non-decreasing `at`
    this.timer = null;
    this.dead = false;
    from.on('data', (buf) => this.push(buf));
    from.on('end', () => this.push(null));
  }
  push(buf) {
    if (this.dead) return;
    const now = performance.now() + performance.timeOrigin;
    const ready = Math.max(now, this.notBefore);
    if (buf === null) {
      // The close travels behind the data already queued, one-way later.
      const last = this.queue.length ? this.queue[this.queue.length - 1].at : 0;
      this.queue.push({ at: Math.max(last, ready + this.link.oneWayMs), end: true });
    } else {
      for (let o = 0; o < buf.length; o += PIECE_BYTES) {
        const piece = buf.subarray(o, o + PIECE_BYTES);
        this.queue.push({ at: this.link.schedule(piece.length, ready), buf: piece });
      }
    }
    this.arm();
  }
  arm() {
    if (this.timer || this.dead || !this.queue.length) return;
    const wait = Math.max(0, this.queue[0].at - (performance.now() + performance.timeOrigin));
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, wait);
  }
  flush() {
    const now = performance.now() + performance.timeOrigin;
    // WHY a loop: one wake-up may find several pieces already due (a loaded machine fires
    // timers late); they must still go out in queue order.
    while (this.queue.length && this.queue[0].at <= now + 0.5) {
      const item = this.queue.shift();
      if (this.dead || this.to.destroyed) continue;
      if (item.end) { this.to.end(); continue; }
      this.link.bytes += item.buf.length;
      this.onDelivered?.(item.buf.length);
      this.to.write(item.buf);
    }
    this.arm();
  }
  stop() { this.dead = true; clearTimeout(this.timer); this.queue.length = 0; }
}

/**
 * Starts a shaped proxy.
 * @param {{target:{host:string,port:number}, listenPort?:number, listenHost?:string,
 *   rttMs?:number, downMbit?:number, upMbit?:number, handshakeRtts?:number}} o
 *   `downMbit`/`upMbit` 0 means unlimited. Down = target -> client (what the phone downloads).
 */
export async function createShapedProxy({ target, listenPort = 0, listenHost = '127.0.0.1', rttMs = 470, downMbit = 5, upMbit = 2, handshakeRtts = 1 }) {
  const oneWay = rttMs / 2;
  const down = new Link(downMbit * 1e6, oneWay);
  const up = new Link(upMbit * 1e6, oneWay);
  const live = new Set();           // every socket, both sides, for dropConnections / close
  let accepted = 0;

  const server = net.createServer((client) => {
    accepted++;
    const upstream = net.connect({ host: target.host, port: target.port });
    live.add(client); live.add(upstream);
    client.setNoDelay(true); upstream.setNoDelay(true);
    const acceptedAt = performance.now() + performance.timeOrigin;
    const upPipe = new Pipe(up, client, upstream, acceptedAt + handshakeRtts * rttMs);
    const downPipe = new Pipe(down, upstream, client, 0);
    const teardown = () => {
      upPipe.stop(); downPipe.stop();
      client.destroy(); upstream.destroy();
      live.delete(client); live.delete(upstream);
    };
    // A client that goes away (or any socket error) ends both sides at once. A server that
    // closes first is different: its queued bytes are still "on the wire", so wait for the
    // downstream queue to drain before tearing the client down.
    client.on('error', teardown); upstream.on('error', teardown);
    client.on('close', teardown);
    upstream.on('close', () => {
      const wait = () => { if (!downPipe.queue.length || client.destroyed) teardown(); else setTimeout(wait, 20); };
      wait();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, listenHost, resolve); });

  return {
    port: server.address().port,
    host: listenHost,
    /** Bytes delivered so far in each direction, and connections accepted. Diff two snapshots for a leg. */
    stats: () => ({ down: down.bytes, up: up.bytes, connections: accepted }),
    /** Hard-close every connection from the proxy side (the phone sees an abrupt drop). Returns how many sockets. */
    dropConnections() { const n = live.size; for (const s of [...live]) s.destroy(); return n; },
    async close() {
      for (const s of [...live]) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}

// ---- CLI -------------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
  const t = opt('target');
  if (!t || !t.includes(':')) { console.error('usage: net-shape.mjs --target host:port [--listen port] [--rtt ms] [--down-mbit n] [--up-mbit n]'); process.exit(2); }
  const [host, port] = [t.slice(0, t.lastIndexOf(':')), Number(t.slice(t.lastIndexOf(':') + 1))];
  const p = await createShapedProxy({
    target: { host, port }, listenPort: Number(opt('listen', 0)),
    rttMs: Number(opt('rtt', 470)), downMbit: Number(opt('down-mbit', 5)), upMbit: Number(opt('up-mbit', 2)),
  });
  console.log(`shaping 127.0.0.1:${p.port} -> ${t}  (rtt ${opt('rtt', 470)} ms, down ${opt('down-mbit', 5)} / up ${opt('up-mbit', 2)} Mbit)`);
}
