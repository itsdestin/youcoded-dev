import sys
p = sys.argv[1] + '/targeted2.test.ts'
s = open(p).read()
i = s.index("  it('T9")
add = """  it('T8b the same 17 MiB line, but the device was away and the relay forgot: the catch-up (want) path', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 30_000, stallMs: 10_000 }); const V = wid('t8b');
    await w.create('A', V, 'c8b'); await w.devs.A.rep.appendLocal(V, lines(2)); await w.settle();
    w.devs.B.carrier.online = false;
    const big = Buffer.concat([Buffer.from('{"type":"user","message":{"content":"'), Buffer.alloc(17 * 1024 * 1024, 0x63), Buffer.from('"}}\\n')]);
    await w.devs.A.rep.appendLocal(V, [big]); await w.settle();
    w.hub.releaseThrough(chatGroup(w.setId, 'c8b'), 1_000_000);
    w.devs.B.carrier.online = true; w.devs.B.rep.hello();
    await w.elapse(400_000, 10_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!);
    log('T8b after 400 virtual s: B holds', bh.lines, 'of 3; B status', await st(w, 'B', V), 'A status', await st(w, 'A', V), 'A counters', JSON.stringify(w.devs.A.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()));
    await w.stopAll(); w.cleanup();
  }, T);

"""
open(p, 'w').write(s[:i] + add + s[i:])
