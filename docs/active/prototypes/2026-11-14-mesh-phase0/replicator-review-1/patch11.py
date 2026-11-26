import sys
S = sys.argv[1]
p = S + '/mut-trace/mytests/world.ts'
s = open(p).read()
old = "    let rep: Replicator | null = null;\n    const link = new Link({\n      identity: ids[n], setId, carrier, meshDir: dirs[n]"
new = """    const __pend = ((globalThis as unknown as { __spend?: Map<number, string> }).__spend ??= new Map<number, string>());
    for (const m of ['head', 'hashAt', 'append', 'read', 'registerVersion', 'forkVersion', 'setAsideDamaged', 'scrubStep', 'verify', 'parkedList', 'releaseParked', 'rejectedList', 'close']) {
      const orig = (store as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[m].bind(store);
      (store as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => { const id = (((globalThis as unknown as { __sid?: number }).__sid) = (((globalThis as unknown as { __sid?: number }).__sid) ?? 0) + 1); __pend.set(id, `${n}.${m} ${a.map((x) => (Buffer.isBuffer(x) ? x.toString('hex').slice(0, 8) : typeof x === 'number' ? x : '')).join(',')} crashed=${ffs.crashed}`); const pr = orig(...a); return pr.finally(() => { __pend.delete(id); }); };
    }
    let rep: Replicator | null = null;
    const link = new Link({
      identity: ids[n], setId, carrier, meshDir: dirs[n]"""
assert old in s
s = s.replace(old, new)
s = s.replace("`HANG in ${what}; pending queue tasks: ${pend?.size}\\n`", "`HANG in ${what}; pending queue tasks: ${pend?.size}\\nPENDING STORE CALLS: ${JSON.stringify([...(((globalThis as unknown as { __spend?: Map<number, string> }).__spend) ?? new Map()).values()])}\\n`")
open(p, 'w').write(s)
