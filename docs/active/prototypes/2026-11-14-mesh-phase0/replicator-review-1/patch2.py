import sys
p = sys.argv[1] + '/fuzz.test.ts'
L = open(p).read().split('\n')
new = '        pendingBehind.push({ n, s, lines: h.lines });'
L[189:193] = [new]
s = '\n'.join(L)
s = s.replace("      const lens: Record<string, number> = {};", "      const lens: Record<string, number> = {}; const pendingBehind: Array<{ n: string; s: { state: string; reason: string | null }; lines: number }> = [];")
block = """      for (const b of pendingBehind) {
        if (b.lines >= nat.length || vr.writer === 'M') continue;
        const holderAll = DEVS.some((d) => (lens[d] ?? 0) >= nat.length);
        if (!holderAll) { viol('DATA-LOST-no-device-holds-all', `${vr.chat} truth ${nat.length} lens ${JSON.stringify(lens)}`); continue; }
        if (b.s.state === 'in-sync') viol('QUIET-in-sync-but-behind-truth', `${b.n} ${vr.chat} status in-sync with ${b.lines} of ${nat.length} lines (another device holds all)`);
        const named = ['stuck', 'diverged', 'refilling', 'retired-recopy'].includes(b.s.state);
        viol(named ? 'LOUD-not-converged' : 'UNNAMED-not-converged', `${b.n} ${vr.chat} ${b.lines}/${nat.length} state=${b.s.state}${b.s.reason ? '(' + b.s.reason + ')' : ''}`);
      }
      // all devices equal the same prefix of truth;"""
s = s.replace("      // all devices equal the same prefix of truth;", block)
s = s.replace("const ls = DEVS.map((n) => lens[n]); if (new Set(ls).size > 1 && vr.writer !== 'M') viol('DIVERGENT-lengths'", "const ls = DEVS.map((n) => lens[n]); if (new Set(ls).size > 1 && vr.writer !== 'M' && DEVS.some((d) => (lens[d] ?? 0) >= nat.length)) viol('DIVERGENT-lengths'")
open(p, 'w').write(s)
