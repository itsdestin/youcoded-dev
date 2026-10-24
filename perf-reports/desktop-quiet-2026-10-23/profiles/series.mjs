import {readFileSync} from 'fs';
const p=JSON.parse(readFileSync(process.argv[2]));const nodes=new Map(p.nodes.map(n=>[n.id,n]));const B=Number(process.argv[3]||4000);
const rows=[];let t=0;
for(let i=0;i<p.samples.length;i++){const d=p.timeDeltas[i]/1000;t+=d;const b=Math.floor(t/B);const r=rows[b]??={js:0,prog:0,idle:0,gc:0};const nm=nodes.get(p.samples[i]).callFrame.functionName;
 if(nm==='(idle)')r.idle+=d;else if(nm==='(program)')r.prog+=d;else if(nm==='(garbage collector)')r.gc+=d;else r.js+=d}
console.log(process.argv[2].split('/').pop(),'meta',JSON.stringify(p.perfLab||{}));
console.log('t(s)  js  native  gc  idle   (ms per',B,'ms)');
rows.forEach((r,i)=>r&&console.log(String(i*B/1000).padStart(5),String(Math.round(r.js)).padStart(5),String(Math.round(r.prog)).padStart(6),String(Math.round(r.gc)).padStart(4),String(Math.round(r.idle)).padStart(6)));
