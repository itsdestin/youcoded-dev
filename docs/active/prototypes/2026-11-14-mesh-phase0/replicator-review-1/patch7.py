import sys
p = sys.argv[1] + '/fuzz.test.ts'
s = open(p).read()
old = "      trail.push(what);\n"
new = "      trail.push(what); if (process.env.TRACE) fs.appendFileSync(process.env.TRACE, `seed ${seed} op ${i}: ${what}\\n`);\n"
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
