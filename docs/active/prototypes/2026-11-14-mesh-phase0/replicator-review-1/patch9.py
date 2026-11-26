import sys
S = sys.argv[1]
p = S + '/mut-trace/src/main/mesh/replicator/replicator.ts'
s = open(p).read()
old = """    const next = (this.#queues.get(k) ?? Promise.resolve()).catch(() => undefined /* benign: the previous step's failure was reported where it happened; it must not stop the next */).then(fn);"""
new = """    const __g = globalThis as unknown as { __pend?: Map<number, { k: string; stack: string; started: boolean }>; __qid?: number };
    __g.__pend ??= new Map(); __g.__qid = (__g.__qid ?? 0) + 1; const __id = __g.__qid; const __rec = { k, stack: new Error('queued').stack ?? '', started: false }; __g.__pend.set(__id, __rec);
    const next = (this.#queues.get(k) ?? Promise.resolve()).catch(() => undefined /* benign */).then(() => { __rec.started = true; return fn(); }).finally(() => { __g.__pend?.delete(__id); });"""
assert old in s
open(p, 'w').write(s.replace(old, new))
