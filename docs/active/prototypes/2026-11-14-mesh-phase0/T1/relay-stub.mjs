// T1 rig: an in-process relay stand-in on 127.0.0.1 that can be told to lie.
// SKELETON of design 6.4 (hold, fetch-after, received, reg-get, reg-set, reg-list, presence). The real wire
// (a WebSocket to a Durable Object) is not built, so this speaks one JSON POST per operation; Phase 2's real
// link layer replaces the transport, not the lie rules. Frames are opaque base64 here: the relay never
// decrypts (S4: `stored` records every byte it keeps so a test can assert none of it is readable).
// It has its OWN clock (`now()`), settable, because the relay's clock times the 30-day rule (5.2 Clocks).
import { createServer } from 'node:http';

export function startRelay({ port = 0, now = () => Date.now() } = {}) {
  const groups = new Map();   // group -> { frames: [{seq, to, bytes}], nextSeq, lastWrite }
  const regs = new Map();     // key -> { value, token }
  const history = new Map();  // key -> [{value, token}] every value ever set (for replay lies)
  const stored = [];          // every byte ever stored, for the "relay cannot read" assertion
  const lies = [];            // active lie rules, applied in order: (op, req, ctx) => undefined | {answer} | {drop:true}
  const log = [];             // every op seen, for assertions
  let clock = now;

  const ops = {
    hold: (r) => {
      const g = groups.get(r.group) ?? { frames: [], nextSeq: 1, lastWrite: clock() };
      const seq = g.nextSeq++; g.frames.push({ seq, to: r.to, bytes: r.bytes }); g.lastWrite = clock();
      groups.set(r.group, g); stored.push(r.bytes); return { stored: { seq } };
    },
    'fetch-after': (r) => {
      const g = groups.get(r.group); if (!g) return { frames: [] };
      return { frames: g.frames.filter((f) => f.seq > r.seq) };
    },
    'reg-get': (r) => ({ ...(regs.get(r.key) ?? { value: null, token: 0 }), key: r.key }),
    'reg-list': () => ({ regs: [...regs].map(([key, v]) => ({ key, ...v })) }),
    'reg-set': (r) => {
      const cur = regs.get(r.key) ?? { value: null, token: 0 };
      if (r.expectToken !== cur.token) return { conflict: { ...cur } };   // compare-and-swap
      const next = { value: r.value, token: cur.token + 1 };
      regs.set(r.key, next); (history.get(r.key) ?? history.set(r.key, []).get(r.key)).push(next);
      return { ok: { token: next.token } };
    },
    presence: () => ({ devices: [...peers.keys()] }),
  };
  const peers = new Map();

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const r = body ? JSON.parse(body) : {};
      if (req.url === '/_rig/lies') { res.end(JSON.stringify({ n: lies.length })); return; }
      const op = req.url.slice(1);
      log.push({ at: clock(), op, device: r.device });
      if (r.device) peers.set(r.device, clock());
      for (const rule of lies) {
        const v = await rule(op, r, { regs, history, groups, clock });
        if (v?.drop) { req.socket.destroy(); return; }              // the call vanishes
        if (v?.answer !== undefined) { res.end(JSON.stringify(v.answer)); return; }
      }
      const fn = ops[op];
      res.end(JSON.stringify(fn ? fn(r) : { error: 'unknown-op' }));
    });
  });

  // Lie rules, each returns a function you pass to relay.lie(). They are the T16 cases:
  const rules = {
    /** Answer reg-get for `key` with an OLD value (replay). */
    replayRegister: (key, nth = 0) => (op, r, c) => (op === 'reg-get' && r.key === key && c.history.get(key)?.[nth]) ? { answer: { ...c.history.get(key)[nth], key } } : undefined,
    /** Silently lose a share of `hold` calls (still tell the sender it was stored). */
    dropFrames: (p, rnd = Math.random) => (op, r, c) => (op === 'hold' && rnd() < p) ? { answer: { stored: { seq: -1 } } } : undefined,
    /** Tell every caller its reg-set won (two devices both "reserved"). */
    doubleReserve: (key) => (op, r) => (op === 'reg-set' && r.key === key) ? { answer: { ok: { token: r.expectToken + 1 } } } : undefined,
    /** Delay every answer. */
    delay: (ms) => () => new Promise((res) => setTimeout(res, ms)).then(() => undefined),
    /** Cut one device off completely (a link cut from the relay's side). */
    cut: (device) => (op, r) => (r.device === device) ? { drop: true } : undefined,
  };

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    port: server.address().port,
    url: `http://127.0.0.1:${server.address().port}`,
    rules, stored, log,
    lie: (rule) => { lies.push(rule); return () => { const i = lies.indexOf(rule); if (i >= 0) lies.splice(i, 1); }; },
    clearLies: () => { lies.length = 0; },
    setClock: (fn) => { clock = fn; },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  })));
}
