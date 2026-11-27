import subprocess, sys, os, shutil, json
R = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-3'
slot = sys.argv[1]; names = sys.argv[2:]
PR = f'{R}/mut'; D = f'{R}/mut{slot}'
if not os.path.exists(D):
    shutil.copytree(PR, D, symlinks=True)
    open(f'{D}/vitest.config.mjs', 'w').write(open(f'{PR}/vitest.config.mjs').read().replace(PR, D).replace('cache-mut', 'cache-mut' + slot))
RP = 'src/main/mesh/replicator/'
M = {
 'ev-startedAt': (RP+'replicator.ts', "p.headsComplete >= this.#startedAt && ", ""),
 'ev-fresh': (RP+'replicator.ts', " && now - p.headsComplete <= PEER_FRESH_MS) { run.evidence = true; return true; }", ") { run.evidence = true; return true; }"),
 'ev-alone-heard': (RP+'replicator.ts', "if (!heard && haveRecord && now", "if (haveRecord && now"),
 'ev-alone-20s': (RP+'replicator.ts', "if (!heard && haveRecord && now - this.#startedAt >= WRITER_ALONE_MS)", "if (!heard && haveRecord)"),
 'ev-alone-haveRecord': (RP+'replicator.ts', "if (!heard && haveRecord && now", "if (!heard && now"),
 'ev-gate-off': (RP+'replicator.ts', "if (!this.evidenceNow(wire, eff !== null && ev.own.kind === 'ok' && ev.witness.kind === 'ok')) throw new Error('writer-waiting-for-peers');", ""),
 'ev-needs-witness': (RP+'replicator.ts', "this.evidenceNow(wire, eff !== null && ev.own.kind === 'ok' && ev.witness.kind === 'ok')) throw", "this.evidenceNow(wire, eff !== null && ev.own.kind === 'ok')) throw"),
 'ev-digest-counts': (RP+'replicator.ts', "this.#ctx.bump('sum-equal');", "this.#ctx.bump('sum-equal'); peer.headsComplete = this.#ctx.clock.now();"),
 'wit-problem-throw': (RP+'replicator.ts', "if (ev.problem === 'own-records-disagree' || (ev.problem && !eff)) {", "if (false) {"),
 'wit-lower-check': (RP+'replicator.ts', "for (const rec of ev.lower ? [eff, ev.lower] : [eff]) {", "for (const rec of [eff]) {"),
 'wit-lines-check': (RP+'replicator.ts', "if (head.lines < eff.lines) throw new Error('writer-behind-own-signed-head');", ""),
 'wit-hash-check': (RP+'replicator.ts', "if (mine !== rec.hash) throw new Error('writer-diverged-from-own-signed-head');", ""),
 'wit-recopy': (RP+'replicator.ts', "else if (v.incarnation > 0 && !run.caughtUp) throw new Error('writer-recopy-not-confirmed');", ""),
 'wit-length': ('src/main/mesh/replicator/own-record.ts', "if (raw.length !== 40) return { kind: 'malformed' };", ""),
 'wit-skip-save': ('src/main/mesh/replicator/own-record.ts', "[['replicator', this.ownDir], ['witness', this.witnessDir]] as const", "[['replicator', this.ownDir]] as const"),
 'wit-save-ok1': (RP+'replicator.ts', "if (r.ok === 2) { run.ownPending = null; return true; }", "if (r.ok >= 1) { run.ownPending = null; return true; }"),
 'dnr-always-saved': (RP+'replicator.ts', "return { lines: h.lines, hash: h.hash, result: recorded ? 'saved' as const : 'durable-not-recorded' as const };", "return { lines: h.lines, hash: h.hash, result: 'saved' as const };"),
 'claim-discount-always': (RP+'replicator.ts', "if (now - (h.since ?? h.at) > CLAIM_UNBACKED_MS) {", "if (true) {"),
 'claim-discount-never': (RP+'replicator.ts', "if (now - (h.since ?? h.at) > CLAIM_UNBACKED_MS) {", "if (false) {"),
 'exp-moved': (RP+'replicator.ts', "if (!same) throw new Error('writer-head-moved');", ""),
 'exp-bytes': (RP+'replicator.ts', "same = got !== 'evicted' && got.length === lines.length && got.every((l, i) => l.equals(lines[i]));", "same = true;"),
 'exp-lencount': (RP+'replicator.ts', "if (head.lines === expected.lines + lines.length && (await", "if ((await"),
 'late-clear': (RP+'replicator.ts', "if (r.stuck === 'store-call-blocked') { r.stuck = null;", "if (false) { r.stuck = null;"),
 'status-no-serve': (RP+'replicator.ts', "if (cands.length > 0 && run.unavailableRounds >= 2 * cands.length && cands.every((p) => run.unavailable.has(p.hex))) return mk('stuck', 'no-peer-can-serve');", ""),
 'status-no-sig': (RP+'replicator.ts', "if (h2 && (await vouchLines(ctx, wire, cur.local, desc, h2)).unsignable) return mk('comparing', 'holds-lines-without-signature');", ""),
 'status-own-not-saved': (RP+'replicator.ts', "if (ctx.runOf(wire).ownPending) return mk('stuck', 'own-record-not-saved');", ""),
 'status-wait-peers': (RP+'replicator.ts', "return mk('comparing', 'writer-waiting-for-peers');", "return mk('comparing');"),
 'want-cover': (RP+'replicator.ts', "let cover = newest && newest.lines > have ? { lines: newest.lines, hash: newest.hash, sig: newest.sig } : null;", "let cover = null as { lines: number; hash: Buffer; sig: Buffer } | null;"),
 'want-writer-resign': (RP+'replicator.ts', "if (!cover && wd && wd.writer.equals(this.#ctx.crypto.self)) {", "if (false) {"),
 'want-round': (RP+'replicator.ts', "round: opts.solicit ? (opts.round ?? run.solicitRound) : 0", "round: 0"),
 'acks-solicited-fresh': (RP+'replicator.ts', "const solicited = a.round > 0 && now - a.at <= PEER_FRESH_MS;", "const solicited = a.round > 0;"),
 'acks-contradict': (RP+'replicator.ts', "if (h.state !== 'ok' || h.lines < a.lines || (h.lines === a.lines && h.hash !== a.hash)) continue;", ""),
 'known-heads-cap': (RP+'replicator.ts', "if (peer.heads.size >= MAX_PEER_HEADS && !peer.heads.has(k)) { this.#ctx.bump('peer-heads-full'); continue; }\n      const prevH", "const prevH"),
 'unknown-heads-cap': (RP+'replicator.ts', "if (peer.heads.size >= MAX_PEER_HEADS && !peer.heads.has(k)) { this.#ctx.bump('peer-heads-full'); continue; } // finding 8: claims about versions nobody announced count against the same cap", ""),
 'comparing-not-registered': (RP+'replicator.ts', "if (!cur?.registered) return mk('comparing', 'copy not set up yet');", ""),
 'bind-root': (RP+'directory.ts', "if (b.parent === null && (!b.nonce || !b.version.equals(deriveRootId(this.opts.setId, b.chatId, b.writer, b.nonce)))) return 'bad-root-id';", ""),
 'bind-token': (RP+'directory.ts', "if (b.parent !== null && !(b.token as string).startsWith(`${b.writer.toString('hex')}:`)) return 'bad-token';", ""),
 'bind-default': (RP+'replicator.ts', "bind: o.bindIds ?? true", "bind: o.bindIds ?? false"),
 'first-wins-await': (RP+'directory.ts', "    const have = this.#byWire.get(key);\n    if (have) {", "    await new Promise<void>((r) => setImmediate(r));\n    const have = this.#byWire.get(key);\n    if (have) {"),
 'one-unfinished': (RP+'receive.ts', "for (const [k, x] of [...ctx.reasm]) if (x.peer === peer.hex) drop(k);", ""),
 'unsignable-fault': (RP+'receive.ts', "if (unsignable) {", "if (false) {"),
 'endorsed-conflict-start': (RP+'receive.ts', "for (const pt of await ctx.heads.pointsAfter(wire, conflict)) {", "for (const pt of await ctx.heads.pointsAfter(wire, 0)) {"),
 'endorsed-onchain': (RP+'receive.ts', "if ((await ctx.store.hashAt(local, 0, pt.lines)) === hex(pt.hash)) return true;", "return true;"),
 'vouch-sig-cut': (RP+'ctx.ts', "if (lines > cap) return { lines: cap, unsignable: true };", ""),
 'vouch-damage-cut': (RP+'ctx.ts', "let lines = repairFrom(head) ?? head.lines;", "let lines = head.lines;"),
 'vouch-onchain': (RP+'ctx.ts', "=== p.hash.toString('hex')) { cap = Math.max(cap, p.lines); break; }", "=== p.hash.toString('hex') || true) { cap = Math.max(cap, p.lines); break; }"),
 'ack-vouch': (RP+'receive.ts', "const v = await vouchLines(ctx, wire, local, desc, h);\n  const hash", "const v = { lines: h.lines, unsignable: false };\n  const hash"),
 'ack-round-check': (RP+'serve.ts', "if (a.round > run.solicitRound) { ctx.bump('ack-round-unknown'); return; }", ""),
 'cover-sig': (RP+'serve.ts', "&& ctx.crypto.verify(writer, headMessage(wire, cover.lines, cover.hash), cover.sig) && (await", "&& (await"),
 'cover-chain': (RP+'serve.ts', "&& (await ctx.store.hashAt(local, 0, cover.lines)) === hex(cover.hash)) {\n    pt = {", "&& true) {\n    pt = {"),
 'cover-head': (RP+'serve.ts', "cover.lines <= head.lines && cover.lines <= cap", "cover.lines <= cap"),
 'F1-endorsed-always-false': (RP+'receive.ts', "if (iAmWriter || (await endorsedByWriter(ctx, wire, v.local, b.from, lines, head.lines, desc.writer))) {", "if (iAmWriter) {"),
}
os.makedirs(f'{R}/mutres', exist_ok=True)
for name in names:
    if os.path.exists(f'{R}/mutres/{name}.txt'): continue
    f, old, new = M[name]; p = f'{D}/{f}'; orig = open(f'{PR}/{f}').read()
    if old not in orig:
        print(name, 'PATTERN-NOT-FOUND'); open(f'{R}/mutres/{name}.txt', 'w').write('PATTERN-NOT-FOUND'); continue
    open(p, 'w').write(orig.replace(old, new, 1))
    try:
        out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.config.mjs', '--reporter=json'], cwd=D, capture_output=True, text=True, timeout=1500).stdout
        j = json.loads(out[out.index('{'):out.rindex('}') + 1]); fails = [a['fullName'] for t in j['testResults'] for a in t['assertionResults'] if a['status'] == 'failed']
        res = f"failed={len(fails)} passed={j['numPassedTests']} :: " + ' | '.join(x[:90] for x in fails[:6])
    except Exception as e:
        res = 'ERROR ' + str(e)[:200]
    open(p, 'w').write(orig)
    open(f'{R}/mutres/{name}.txt', 'w').write(res); print(name, res, flush=True)
if M and slot == 'list': print(list(M))
