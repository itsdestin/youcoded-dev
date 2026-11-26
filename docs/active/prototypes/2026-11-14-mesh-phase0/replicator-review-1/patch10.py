import sys
p = sys.argv[1] + '/targeted5.test.ts'
s = open(p).read()
i = s.index("  it('T13")
add = """  it('T14 the only online holder is a non-writer that lost its saved signed points (so it can only say unavailable): hammer?', async () => {
    const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 600_000, stallMs: 600_000 }); const V = wid('t14');
    await w.create('A', V, 'c14'); await w.devs.A.rep.appendLocal(V, lines(6)); await w.settle();
    await w.stopDev('B', false); fs.rmSync(path.join(w.dirs.B, 'store'), { recursive: true, force: true }); fs.rmSync(path.join(w.dirs.B, 'replicator', 'heads'), { recursive: true, force: true });
    await w.stopDev('C', false); fs.rmSync(path.join(w.dirs.C, 'replicator', 'heads'), { recursive: true, force: true });
    w.devs.A.carrier.online = false;
    await w.startDev('C'); w.devs.C.carrier.online = true;
    await w.startDev('B'); w.devs.B.carrier.online = true;
    const p0 = w.devs.C.carrier.passed + w.devs.B.carrier.passed;
    await new Promise((r) => setTimeout(r, 3000));
    const p1 = w.devs.C.carrier.passed + w.devs.B.carrier.passed;
    log('T14 in 3 real seconds with NO virtual time passing, live frames exchanged between B and C:', p1 - p0, 'C counters', JSON.stringify(w.devs.C.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()), 'B status', JSON.stringify(await w.devs.B.rep.status(V)));
    await w.stopAll(); w.cleanup();
  }, 600_000);
"""
open(p, 'w').write(s[:i] + add + s[i:])
