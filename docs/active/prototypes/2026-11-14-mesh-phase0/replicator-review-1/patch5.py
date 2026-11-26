import sys
p = sys.argv[1] + '/fuzz.test.ts'
s = open(p).read()
old = "        else { what = 'hostile'; await hostile(); }"
new = """        else if (r < 86) { // the store itself declares a copy damaged (set aside); the replicator must recopy it
          const n = pick(DEVS); const vr = pick(vers.filter((x) => !x.hostile)); what = `retire ${n} ${vr.chat}${vr.writer === n ? ' (WRITER)' : ''}`;
          if (live(n)) { const local = await w.current(n, vr.v).catch(() => null); if (local) { await w.devs[n].store.setAsideDamaged(local).catch(() => undefined); await w.devs[n].rep.reportCorrupt(vr.v).catch(() => undefined); bump(vr.writer === n ? 'retire-writer' : 'retire-nonwriter'); } }
        }
        else { what = 'hostile'; await hostile(); }"""
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
