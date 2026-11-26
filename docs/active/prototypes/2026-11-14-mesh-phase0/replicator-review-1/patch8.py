import sys
p = sys.argv[1] + '/fuzz.test.ts'
s = open(p).read()
old = "      const r = ri(100); let what = '';\n"
new = "      const r = ri(100); let what = ''; if (process.env.TRACE) fs.appendFileSync(process.env.TRACE, `seed ${seed} op ${i} START r=${r}\\n`);\n"
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
