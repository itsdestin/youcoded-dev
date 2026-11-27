import subprocess, sys, os, shutil, json, re
R='/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-2'
slot=sys.argv[1]; names=sys.argv[2:]
PR=f'{R}/mut'; D=f'{R}/mut{slot}'
if not os.path.exists(D):
    shutil.copytree(PR, D, symlinks=True)
    open(f'{D}/vitest.config.mjs','w').write(open(f'{PR}/vitest.config.mjs').read().replace(PR,D).replace('cache-mut','cache-mut'+slot))
RP='src/main/mesh/replicator/'
M={ # name: (file, old, new)
 'pointsAfter-offchain-skip': (RP+'serve.ts', "if ((await ctx.store.hashAt(local, 0, c.lines)) !== hex(c.hash)) { ctx.bump('saved-point-not-on-my-chain'); continue; }", ""),
 'want-holdback': (RP+'replicator.ts', "if (last !== undefined && nowMs - last < WANT_GAP_MS) {", "if (false && last !== undefined && nowMs - last < WANT_GAP_MS) {"),
 'parent-ask-holdback': (RP+'forks.ts', "if (run.parentAskLines === ph.lines && run.parentAskAt !== null && nowMs - run.parentAskAt < WANT_GAP_MS) {", "if (false) {"),
 'parent-intro-ask-gate': (RP+'forks.ts', "if (run.parentAskAt === null || nowMs - run.parentAskAt >= WANT_GAP_MS) {", "if (true) {"),
 'F1-own-lines-check': (RP+'replicator.ts', "if (head.lines < own.lines) throw new Error('writer-behind-own-signed-head');", ""),
 'F1-own-hash-check': (RP+'replicator.ts', "if (mine !== own.hash) throw new Error('writer-diverged-from-own-signed-head');", ""),
 'F1-recopy-not-confirmed': (RP+'replicator.ts', "else if (v.incarnation > 0 && !run.caughtUp) throw new Error('writer-recopy-not-confirmed');", ""),
 'F1-peer-more-lines': (RP+'replicator.ts', "if (h.lines > head.lines) throw new Error('writer-behind-peer-holds-more');", ""),
 'F1-peer-other-hash': (RP+'replicator.ts', "if (h.lines === head.lines && h.hash !== head.hash) throw new Error('writer-diverged-from-peer');", ""),
 'F1-appendLocal-fault': (RP+'replicator.ts', "if (run.fault) throw new Error(`writer-faulted-${run.fault}`);", ""),
 'F1-appendLocal-refilling': (RP+'replicator.ts', "if (repairFrom(head) !== null) throw new Error('refilling');", ""),
 'F1-saveOwnHead-noop': (RP+'replicator.ts', "await this.saveOwnHead(wire, h.lines, h.hash); // AFTER", "/*noop*/ // AFTER"),
 'F1-fault-refuses-lines': (RP+'receive.ts', "if (run.fault) { ctx.bump('lines-refused-faulted'); return; }", ""),
 'F1-endorsed-always-false': (RP+'receive.ts', "if (iAmWriter || (await endorsedByWriter(ctx, wire, v.local, b.from, lines, head.lines, desc.writer))) {", "if (iAmWriter) {"),
 'F1-iAmWriter-not-fault': (RP+'receive.ts', "if (iAmWriter || (await endorsedByWriter(", "if ((await endorsedByWriter("),
 'F1-endorsed-conflict-start': (RP+'receive.ts', "for (const pt of await ctx.heads.pointsAfter(wire, conflict)) {", "for (const pt of await ctx.heads.pointsAfter(wire, 0)) {"),
 'F1-endorsed-onchain': (RP+'receive.ts', "if ((await ctx.store.hashAt(local, 0, pt.lines)) === hex(pt.hash)) return true;", "return true;"),
 'F1-status-behind-own': (RP+'replicator.ts', "if (own && lines < own.lines) return mk('refilling', 'behind-own-signed-head');", ""),
 'F2-retire-advertise': (RP+'repair.ts', "  ctx.advertise();\n}\n\n/** After any append", "}\n\n/** After any append"),
 'F2-peerAcks-state': (RP+'replicator.ts', "if (!a || !h || h.state !== 'ok' || now - h.at > PEER_FRESH_MS) continue;", "if (!a || !h) continue;"),
 'F2-peerAcks-hash': (RP+'replicator.ts', "if (h.lines < a.lines || (h.lines === a.lines && h.hash !== a.hash)) continue;", ""),
 'F2-onHeads-ack-delete': (RP+'replicator.ts', "if (ack && (e.lines < ack.lines || e.state !== 'ok')) peer.acks.delete(k);", ""),
 'F3-inc0-is-wire': (RP+'idmap.ts', "  return createHash('sha256').update('youcoded-mesh/v1/incarnation\\0')", "  if (n === 0) return wire;\n  return createHash('sha256').update('youcoded-mesh/v1/incarnation\\0')"),
 'F3-folder-check': (RP+'forks.ts', "if (!(await folderIsThisVersion(ctx, cur.local, desc))) {", "if (false) {"),
 'F3-scanAll-off': (RP+'idmap.ts', "const scanAll = start === undefined;", "const scanAll = false;"),
 'F4-first-wins-await': (RP+'directory.ts', "    const have = this.#byWire.get(key);\n    if (have) {", "    await new Promise<void>((r) => setImmediate(r));\n    const have = this.#byWire.get(key);\n    if (have) {"),
 'F5-line-cap': (RP+'replicator.ts', "if (l.length > MAX_LINE_BYTES) throw new Error('line-too-large');", "if (false) throw new Error('line-too-large');"),
 'F5-read-budget-16': (RP+'budget.ts', "export const READ_BUFFER_BUDGET_BYTES = 80 * 1024 * 1024;", "export const READ_BUFFER_BUDGET_BYTES = 16 * 1024 * 1024;"),
 'F6-one-unfinished-line': (RP+'receive.ts', "for (const [k, x] of [...ctx.reasm]) if (x.peer === peer.hex) drop(k);", ""),
 'F6-intro-ask-cap': (RP+'replicator.ts', "askedInFrame < MAX_INTRO_ASKS_PER_FRAME && peer.introAsks < MAX_INTRO_ASKS_PER_PERIOD", "true"),
 'F6-peer-heads-cap': (RP+'replicator.ts', "if (peer.heads.size >= MAX_PEER_HEADS && !peer.heads.has(k)) { this.#ctx.bump('peer-heads-full'); continue; }", ""),
 'F6-sum-rate': (RP+'replicator.ts', "if (!peer.answers.take()) { this.#ctx.bump('sum-rate-limited'); return; }", ""),
 'F7-fresh-only': (RP+'replicator.ts', "if (fresh.length === 0) return mk('stale', 'no peer has said anything recently');", ""),
 'F7-peer-repairing': (RP+'replicator.ts', "if (fresh.some((h) => h.state !== 'ok')) return mk('peer-repairing');", ""),
 'F8-ceiling': (RP+'replicator.ts', "}, this.#o.stepLimitMs ?? QUEUE_STEP_LIMIT_MS); t.unref?.();", "}, 1e12); t.unref?.();"),
 'F8-ceiling-b': (RP+'replicator.ts', "fn().then((v) => { if (!done) { done = true; timer.cancel(); resolve(v); } }", "fn().then((v) => { resolve(v); timer.cancel(); }") ,
 'F8-ceiling-c': (RP+'replicator.ts', "}, this.#o.stepLimitMs ?? QUEUE_STEP_LIMIT_MS); t.unref?.();", "}, 2_000_000_000); t.unref?.();"),
 'F9-scrub-off': (RP+'replicator.ts', "if (this.#stopped || every <= 0) return;", "return;"),
 'comparing-not-registered': (RP+'replicator.ts', "if (!cur?.registered) return mk('comparing', 'copy not set up yet');", ""),
 'caughtUp-needs-no-unsure': (RP+'replicator.ts', "if (inSyncPeers > 0 && unsureHolders === 0 && !pulls.length && !diverged)", "if (!pulls.length && !diverged)"),
}
os.makedirs(f'{R}/mutres', exist_ok=True)
for name in names:
    f,old,new=M[name]; p=f'{D}/{f}'; orig=open(f'{PR}/{f}').read()
    if old not in orig: print(name,'PATTERN-NOT-FOUND'); open(f'{R}/mutres/{name}.txt','w').write('PATTERN-NOT-FOUND'); continue
    open(p,'w').write(orig.replace(old,new,1))
    try:
        out=subprocess.run(['npx','vitest','run','--config','vitest.config.mjs','--reporter=json'],cwd=D,capture_output=True,text=True,timeout=1500).stdout
        j=json.loads(out[out.index('{'):out.rindex('}')+1]); fails=[a['fullName'] for t in j['testResults'] for a in t['assertionResults'] if a['status']=='failed']
        res=f"failed={len(fails)} passed={j['numPassedTests']} :: "+' | '.join(x[:90] for x in fails[:6])
    except Exception as e: res='ERROR '+str(e)[:200]
    open(p,'w').write(orig)
    open(f'{R}/mutres/{name}.txt','w').write(res); print(name,res,flush=True)
