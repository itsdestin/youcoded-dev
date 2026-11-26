import re,sys
S=sys.argv[1]; D=sys.argv[2]
p=S+'/targeted.test.ts'
s=open(p).read()
s=re.sub(r"import \{ InterimDirectory \}.*\n","import { decode } from '"+D+"/src/main/mesh/crypto/cbor';\n",s)
i=s.index("  it('T5")
new=open(S+'/t5on.txt').read()
open(p,'w').write(s[:i]+new)
