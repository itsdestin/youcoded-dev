import { describe, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkWorld, wid, log, W } from './world';
describe('targeted4', () => {
  it('T12 one heads frame naming 2000 unknown versions: what does the victim do?', async () => {
    const w = await mkWorld(['A'], { discoveryMs: 600_000, withM: true });
    const entries = Array.from({ length: 2000 }, (_, i) => ({ version: createHash('sha256').update('rnd' + i).digest(), lines: 5, hash: Buffer.alloc(32, 1), conversationHash: Buffer.alloc(32, 0), stamp: 0, state: 'ok' as const }));
    const before = w.devs.A.carrier.passed; const h0 = process.memoryUsage().heapUsed; const t0 = Date.now();
    w.M!.link.sendLive({ group: W.GROUP_LIVE, kind: W.KIND_HEADS, body: W.headsBodyOf({ page: 0, of: 1, ask: false, heads: entries }) as never, to: w.ids.A.deviceId });
    await w.settle();
    log('T12 frames A sent in response to ONE heads frame:', w.devs.A.carrier.passed - before, 'ms', Date.now() - t0, 'heap delta KiB', Math.round((process.memoryUsage().heapUsed - h0) / 1024));
    // repeat with fresh random ids 10 more times: does anything bound it?
    let total = 0;
    for (let r = 0; r < 10; r++) {
      const es = Array.from({ length: 2000 }, (_, i) => ({ version: createHash('sha256').update(`rnd${r}-${i}`).digest(), lines: 5, hash: Buffer.alloc(32, 1), conversationHash: Buffer.alloc(32, 0), stamp: 0, state: 'ok' as const }));
      const b = w.devs.A.carrier.passed;
      w.M!.link.sendLive({ group: W.GROUP_LIVE, kind: W.KIND_HEADS, body: W.headsBodyOf({ page: 0, of: 1, ask: false, heads: es }) as never, to: w.ids.A.deviceId });
      await w.settle(); total += w.devs.A.carrier.passed - b;
    }
    log('T12 10 more heads frames (20,000 new ids) -> A sent', total, 'frames; counters', JSON.stringify(w.devs.A.rep.counters()));
    await w.stopAll(); w.cleanup();
  }, 900_000);
});
