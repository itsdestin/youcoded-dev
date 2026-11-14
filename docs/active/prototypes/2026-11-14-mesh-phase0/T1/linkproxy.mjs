// T1 rig: a cuttable, slowable TCP link between two parties on 127.0.0.1. One proxy per DIRECTED path you want to
// control (device A's route to device B, or A's route to the relay). The mesh's link layer (S3/S4) will dial the
// proxy's port instead of the real peer, so cutting here exercises the app's real reconnect, retry and
// presence code, with no seam inside the app. (Wifi discovery has no rig stand-in yet: the rig must hand each device
// its peer addresses; see report section "link cutting".)
//   const l = await createLink({ targetPort }); dial l.port; l.cut(); l.heal(); l.setLatency(250); l.stats
// What it can and cannot do: it works on bytes, not frames. It can cut, delay, and sever mid-stream (a half-written
// frame is a real case). Frame-aware faults (drop frame 7, duplicate, reorder, corrupt a signature) belong in the
// Transport test double inside S3's interface, which unit tests of the replicator use; the rig does not need them.
import net from 'node:net';

export async function createLink({ targetPort, targetHost = '127.0.0.1', port = 0 }) {
  const live = new Set();
  const st = { cut: false, latencyMs: 0, accepted: 0, refused: 0, bytes: 0 };
  const server = net.createServer((c) => {
    if (st.cut) { st.refused++; c.destroy(); return; }
    st.accepted++;
    const up = net.connect(targetPort, targetHost);
    live.add(c); live.add(up);
    const pipe = (from, to) => from.on('data', (b) => {
      st.bytes += b.length;
      const send = () => { if (!st.cut && !to.destroyed) to.write(b); };
      st.latencyMs ? setTimeout(send, st.latencyMs) : send();
    });
    pipe(c, up); pipe(up, c);
    const end = () => { c.destroy(); up.destroy(); live.delete(c); live.delete(up); };
    c.on('error', end); up.on('error', end); c.on('close', end); up.on('close', end);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return {
    port: server.address().port, stats: st,
    cut() { st.cut = true; for (const s of live) s.destroy(); live.clear(); },   // existing connections die abruptly; new ones are refused
    heal() { st.cut = false; },
    setLatency(ms) { st.latencyMs = ms; },
    close() { st.cut = true; for (const s of live) s.destroy(); return new Promise((r) => server.close(r)); },
  };
}
