import subprocess, sys, os, re, json
S = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1'
D = '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop'

def sub(path, old, new, count=1):
    s = open(path).read()
    assert old in s, ('pattern not found', path, old[:60])
    s = s.replace(old, new, count)
    open(path, 'w').write(s)

R = 'src/main/mesh/replicator/'
MUTS = {
 'writer-ahead': (R + 'receive.ts', """  if (iAmWriter && end > head.lines && !refilling) {
    ctx.bump('writer-ahead-unexplained'); run.stuck = 'writer-behind-unreported';
    sendNak(ctx, peer, wire, head.lines, 'not-a-prefix', head.hash);
    throw new FrameReject('writer-ahead-unexplained');
  }""", "  void refilling;"),
 'ack-before-append': (R + 'receive.ts', "  // 6. append, and every outcome of it", """  ctx.sendLive(KIND_ACK, ackBodyOf({ version: wire, lines: b.head.lines, hash: b.head.hash, sig: ctx.crypto.sign(ackMessage(ctx.crypto.self, wire, b.head.lines, b.head.hash)) }), peer.id);
  // 6. append, and every outcome of it"""),
 'part-order': (R + 'receive.ts', " || r.chunks.length !== part.index", ""),
 'read-budget': (R + 'budget.ts', "export const READ_BUFFER_BUDGET_BYTES = 16 * 1024 * 1024;", "export const READ_BUFFER_BUDGET_BYTES = Number.MAX_SAFE_INTEGER;"),
 'enospc-before-store': (R + 'receive.ts', "try { kept = await ctx.heads.add(wire, { lines: b.head.lines, hash: b.head.hash, sig: b.head.sig, spanBytes: span > 0xfffffffe ? UNKNOWN_SPAN : span }); } catch (e) { await storeFailed(ctx, peer, wire, e, b.from); return; }", "kept = await ctx.heads.add(wire, { lines: b.head.lines, hash: b.head.hash, sig: b.head.sig, spanBytes: span > 0xfffffffe ? UNKNOWN_SPAN : span });"),
 'serve-through-clamp': (R + 'serve.ts', "if (!desc.writer.equals(ctx.crypto.self)) { const newest = await ctx.heads.newest(wire); through = Math.min(through, newest ? newest.lines : 0); }", ""),
 'ack-chain-check': (R + 'serve.ts', "if (v.mine !== a.hash.toString('hex')) { ctx.bump('ack-not-on-my-chain'); peer.acks.delete(wireHex); return; }", ""),
 'signed-point-recheck': (R + 'serve.ts', "if ((await ctx.store.hashAt(local, 0, pt.lines)) !== hex(pt.hash)) { ctx.runOf(wire).diverged = 'my-chain-differs-from-signed-point'; return { nak: 'unavailable' }; }", ""),
 'chain-check': (R + 'receive.ts', "if (!c.equals(b.head.hash)) {", "if (false && !c.equals(b.head.hash)) {"),
}

def run(name):
    T = subprocess.check_output([S + '/mkmut.sh', name]).decode().strip()
    path, old, new = MUTS[name]
    sub(T + '/' + path, old, new)
    files = sys.argv[2:] or ['replicator.test', 'replicator-hostile.test', 'replicator-repair.test']
    out = {}
    for f in files:
        p = subprocess.run(['npx', 'vitest', 'run', '--config', T + '/cfg.mjs', f], cwd=D, capture_output=True, text=True, timeout=3000)
        txt = p.stdout + p.stderr
        m = re.search(r'Tests\s+(.*)', txt)
        fails = re.findall(r'(?:FAIL|×)\s+(.*)', txt)
        out[f] = {'summary': m.group(1).strip() if m else 'no summary', 'failed': sorted(set(fails))[:8]}
    open(S + '/mut-results.jsonl', 'a').write(json.dumps({'mutation': name, 'files': out}) + '\n')
    print(name, json.dumps(out)[:600])

if __name__ == '__main__':
    run(sys.argv[1])
