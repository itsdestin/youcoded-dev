import sys
p = sys.argv[1] + '/fuzz.test.ts'
s = open(p).read()
s = s.replace("      if (rng() < 0.3) await w.settle().catch(() => undefined);",
"""      if (rng() < 0.3) await w.settle().catch(() => undefined);
      if (rng() < 0.3) {
        await w.settle().catch(() => undefined);
        for (const vr of vers.filter((x) => !x.hostile)) for (const n of DEVS) {
          if (!live(n)) continue;
          for (const a of w.devs[n].rep.peerAcks(vr.v)) {
            const hn = DEVS.find((d) => w.ids[d].deviceId.toString('hex') === a.holder); if (!hn || !live(hn)) continue;
            const full = [...vr.lines, ...(vr.maybe ?? [])];
            if (a.lines > full.length || a.hash !== oracleChain(vr.chat, vr.v, full, a.lines)) { viol('SAFETY-ack-not-on-authored-chain(mid-run)', `${n} ack ${hn} ${a.lines} ${vr.chat}`); continue; }
            const hl = await w.current(hn, vr.v).catch(() => null); const hh = hl ? await w.devs[hn].store.head(hl).catch(() => null) : null;
            if (!hh || hh.lines < a.lines) viol('QUIET-ack-for-lines-live-holder-lacks(mid-run)', `${n} reports ${hn} holds ${a.lines} of ${vr.chat}; holder has ${hh ? hh.lines : 0} (steps ${trail.length})`);
          }
        }
      }""")
open(p, 'w').write(s)
