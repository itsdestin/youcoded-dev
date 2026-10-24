import {readFileSync} from 'fs';
const p=JSON.parse(readFileSync(process.argv[2]));const nodes=new Map(p.nodes.map(n=>[n.id,n]));
const win=(process.argv[3]||'0-1e9').split('-').map(Number);
let t=0,js=0,prog=0,idle=0,gc=0;const fn=new Map();
for(let i=0;i<p.samples.length;i++){const d=p.timeDeltas[i]/1000;t+=d;if(t<win[0]||t>win[1])continue;const n=nodes.get(p.samples[i]);const nm=n.callFrame.functionName;
 if(nm==='(idle)')idle+=d;else if(nm==='(program)')prog+=d;else if(nm==='(garbage collector)')gc+=d;else{js+=d;const k=nm+'@'+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;fn.set(k,(fn.get(k)||0)+d)}}
console.log(process.argv[2].split('/').pop(),process.argv[3]||'all','js',Math.round(js),'native(program)',Math.round(prog),'gc',Math.round(gc),'idle',Math.round(idle));
console.log([...fn].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>'   '+Math.round(v)+'ms '+k).join('\n'));
