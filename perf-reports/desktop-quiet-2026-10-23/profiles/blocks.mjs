import {readFileSync} from 'fs';
const p=JSON.parse(readFileSync(process.argv[2]));const nodes=new Map(p.nodes.map(n=>[n.id,n]));const MIN=Number(process.argv[3]||100);
let t=0,cur=null;const blocks=[];
for(let i=0;i<p.samples.length;i++){const d=p.timeDeltas[i]/1000;t+=d;const nm=nodes.get(p.samples[i]).callFrame.functionName;const busy=nm!=='(idle)';
 if(busy){if(!cur)cur={s:t-d,e:t,js:0,prog:0,gc:0,fn:new Map()};cur.e=t;if(nm==='(program)')cur.prog+=d;else if(nm==='(garbage collector)')cur.gc+=d;else{cur.js+=d;const k=nm+'@'+nodes.get(p.samples[i]).callFrame.url.split('/').pop().slice(0,12)+':'+nodes.get(p.samples[i]).callFrame.lineNumber;cur.fn.set(k,(cur.fn.get(k)||0)+d)}}
 else if(cur){blocks.push(cur);cur=null}}
if(cur)blocks.push(cur);
const big=blocks.filter(b=>b.e-b.s>=MIN);
console.log(process.argv[2],'blocks>=',MIN,'ms:',big.length);
big.forEach((b,i)=>console.log(' @'+(b.s/1000).toFixed(1)+'s len '+Math.round(b.e-b.s)+'ms js '+Math.round(b.js)+' native '+Math.round(b.prog)+' gc '+Math.round(b.gc)+' gap since prev '+(i?((b.s-big[i-1].e)/1000).toFixed(2)+'s':'-')+' top '+[...b.fn].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>Math.round(v)+'ms '+k).join(' | ')));
