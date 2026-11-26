import sys
p = sys.argv[1] + '/fuzz.test.ts'
s = open(p).read()
old = "          if (live(n)) { const local = await w.current(n, vr.v).catch(() => null);"
new = "          if (live(n) && (vr.writer !== n || process.env.WRITER_RETIRE)) { const local = await w.current(n, vr.v).catch(() => null);"
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
