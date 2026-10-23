// Guards the slow-phone proxy (net-shape.mjs): it must delay, cap, keep order, and stay
// out of the way of many parallel connections. Every assertion is a LOWER bound on elapsed
// time (a loaded machine only makes things slower, never faster), plus exact byte/order
// checks — nothing here fails because the machine is busy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createShapedProxy } from '../net-shape.mjs';

/** A TCP server that echoes everything back. */
async function echoServer() {
  const server = net.createServer((s) => { s.on('data', (d) => s.write(d)); s.on('error', () => {}); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}
/** A server that sends `bytes` zero bytes to anyone who connects, then ends. */
async function sourceServer(bytes) {
  const server = net.createServer((s) => { s.on('error', () => {}); s.end(Buffer.alloc(bytes, 7)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}
const open = (port) => new Promise((resolve, reject) => {
  const s = net.connect(port, '127.0.0.1', () => resolve(s)); s.on('error', reject);
});
/** Collect from `s` until `n` bytes have arrived (or the socket ends). */
const read = (s, n) => new Promise((resolve) => {
  const parts = []; let got = 0;
  s.on('data', (d) => { parts.push(d); got += d.length; if (got >= n) resolve(Buffer.concat(parts)); });
  s.on('end', () => resolve(Buffer.concat(parts)));
  s.on('close', () => resolve(Buffer.concat(parts)));
});
const now = () => performance.now();

test('a round trip through the proxy takes at least the configured round trip', async () => {
  const echo = await echoServer();
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: echo.port }, rttMs: 300, downMbit: 0, upMbit: 0, handshakeRtts: 0 });
  const s = await open(proxy.port);
  const t0 = now();
  s.write('ping');
  const got = await read(s, 4);
  const took = now() - t0;
  assert.equal(got.toString(), 'ping');
  // 300 ms round trip; allow 10% for timer rounding. No upper bound: load only slows timers.
  assert.ok(took >= 270, `round trip took ${took.toFixed(0)} ms, expected >= 270 ms for a 300 ms round trip`);
  s.destroy(); await proxy.close(); await echo.close();
});

test('a new connection pays one extra round trip for its handshake', async () => {
  const echo = await echoServer();
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: echo.port }, rttMs: 300, downMbit: 0, upMbit: 0, handshakeRtts: 1 });
  const s = await open(proxy.port);
  const t0 = now();
  s.write('x');
  await read(s, 1);
  const took = now() - t0;
  assert.ok(took >= 540, `first byte round trip took ${took.toFixed(0)} ms, expected >= 540 ms (handshake + round trip)`);
  s.destroy(); await proxy.close(); await echo.close();
});

test('bytes arrive complete and in order across several parallel connections', async () => {
  const echo = await echoServer();
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: echo.port }, rttMs: 20, downMbit: 0, upMbit: 0 });
  const conns = await Promise.all(Array.from({ length: 12 }, () => open(proxy.port)));
  const results = await Promise.all(conns.map(async (s, i) => {
    // 40 numbered 5 KB pieces per connection: bigger than the proxy's piece size in total, written without waiting.
    const pieces = Array.from({ length: 40 }, (_, k) => Buffer.alloc(5000, (i * 40 + k) % 251));
    const want = Buffer.concat(pieces);
    const done = read(s, want.length);
    for (const p of pieces) s.write(p);
    return { got: await done, want };
  }));
  results.forEach(({ got, want }, i) => assert.ok(got.equals(want), `connection ${i} came back different or out of order`));
  for (const s of conns) s.destroy();
  await proxy.close(); await echo.close();
});

test('the download cap makes a transfer take at least its size divided by the rate', async () => {
  const BYTES = 250_000;                       // at 4 Mbit/s: 500 ms
  const src = await sourceServer(BYTES);
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: src.port }, rttMs: 0, downMbit: 4, upMbit: 0, handshakeRtts: 0 });
  const s = await open(proxy.port);
  const t0 = now();
  const got = await read(s, BYTES);
  const took = now() - t0;
  assert.equal(got.length, BYTES);
  assert.ok(took >= 450, `250 KB at 4 Mbit/s took ${took.toFixed(0)} ms, expected >= 450 ms`);
  assert.equal(proxy.stats().down, BYTES, 'the proxy counts every byte it delivered downstream');
  s.destroy(); await proxy.close(); await src.close();
});

test('two parallel downloads share the cap instead of each getting all of it', async () => {
  const BYTES = 125_000;                       // two of them at 4 Mbit/s shared: 500 ms; unshared would be 250
  const src = await sourceServer(BYTES);
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: src.port }, rttMs: 0, downMbit: 4, upMbit: 0, handshakeRtts: 0 });
  const [a, b] = await Promise.all([open(proxy.port), open(proxy.port)]);
  const t0 = now();
  const [ga, gb] = await Promise.all([read(a, BYTES), read(b, BYTES)]);
  const took = now() - t0;
  assert.equal(ga.length + gb.length, 2 * BYTES);
  assert.ok(took >= 450, `two 125 KB downloads took ${took.toFixed(0)} ms, expected >= 450 ms on a shared 4 Mbit/s link`);
  a.destroy(); b.destroy(); await proxy.close(); await src.close();
});

test('dropConnections closes the phone side abruptly and the proxy keeps accepting', async () => {
  const echo = await echoServer();
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: echo.port }, rttMs: 10, downMbit: 0, upMbit: 0 });
  const s = await open(proxy.port);
  const closed = new Promise((r) => s.on('close', r));
  s.on('error', () => {});
  assert.ok(proxy.dropConnections() >= 1);
  await closed;
  const again = await open(proxy.port);
  again.write('hi');
  assert.equal((await read(again, 2)).toString(), 'hi');
  again.destroy(); await proxy.close(); await echo.close();
});

test('goSilent stops a connection carrying anything without closing either side, and new connections still work', async () => {
  const echo = await echoServer();
  const proxy = await createShapedProxy({ target: { host: '127.0.0.1', port: echo.port }, rttMs: 20, downMbit: 0, upMbit: 0 });
  try {
    const s = await open(proxy.port);
    let closed = false; s.on('close', () => { closed = true; });
    s.write('a'); await read(s, 1);
    assert.equal(proxy.goSilent(), 1);
    let got = 0; s.on('data', (d) => { got += d.length; });
    s.write('lost');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(got, 0);
    assert.equal(closed, false);
    const fresh = await open(proxy.port);
    fresh.write('ok');
    assert.equal((await read(fresh, 2)).toString(), 'ok');
    s.destroy(); fresh.destroy();
  } finally { await proxy.close(); await echo.close(); }
});
