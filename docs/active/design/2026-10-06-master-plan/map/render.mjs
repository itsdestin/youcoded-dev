// Renders graph.json -> grouping-{A,B,C}-*.dot/png with graphviz. Usage: node render.mjs
import fs from 'fs'; import {execSync} from 'child_process'; import path from 'path'; import {fileURLToPath} from 'url';
const dir=path.dirname(fileURLToPath(import.meta.url)); const g=JSON.parse(fs.readFileSync(path.join(dir,'graph.json'),'utf8'));
const files={A:'grouping-A-code',B:'grouping-B-systems',C:'grouping-C-streams'};
const pal=['#dbeafe','#fde68a','#d1fae5','#fbcfe8','#e9d5ff','#fed7aa','#cffafe','#e5e7eb','#fecaca'];
const q=s=>'"'+s.replace(/"/g,"'")+'"';
for(const k of Object.keys(files)){
 const gm=g.groupings[k]; const groups=[...new Set(Object.values(gm))];
 let d=`digraph G{ size="21,21"; compound=true; newrank=true; nodesep=0.12; ranksep=0.5; pad=0.2; fontname="Helvetica"; labelloc=t; label=${q('Grouping '+k+' - '+g.metrics[k].withinPct+'% of links stay inside a group (node size = files, line width = imports, links of 8+ shown)')}; node[shape=box,style="filled,rounded",fontname="Helvetica",fontsize=9,fillcolor=white,margin="0.06,0.03"]; edge[color="#00000055",arrowsize=0.4];\n`;
 groups.forEach((gr,i)=>{ d+=`subgraph cluster_${i}{label=${q(gr+' ('+g.sizes[k][gr].files+' files)')};fontsize=14;style="filled,rounded";fillcolor="${pal[i%pal.length]}";color="#555555";\n`;
  const mem=Object.entries(g.nodes).filter(([id])=>gm[id]===gr).sort((a,b)=>b[1].files-a[1].files); const cols=Math.min(3,Math.max(1,Math.ceil(mem.length/7)));
  mem.forEach(([id,n],j)=>{ const w=(0.5+Math.sqrt(n.files||n.extFiles||1)*0.13).toFixed(2); d+=`  ${q(id)}[label=${q(n.label)},width=${w},fontsize=${n.files>25?11:9}${n.kind==='unclaimed'?',fillcolor="#fff7d6",style="filled,rounded,dashed"':''}];\n`;
   if(j>=cols) d+=`  ${q(mem[j-cols][0])}->${q(id)}[style=invis,weight=10];\n`; if(j%cols!==0) d+=`  {rank=same; ${q(mem[j-1][0])}->${q(id)}[style=invis];}\n`;});
  d+='}\n';});
 for(const e of g.edges) if(e.w>=8) d+=`${q(e.a)}->${q(e.b)}[constraint=false,penwidth=${(0.4+Math.log2(e.w)*0.5).toFixed(2)}${gm[e.a]!==gm[e.b]?',color="#c2410c99"':''}];\n`;
 d+='}\n'; fs.writeFileSync(path.join(dir,files[k]+'.dot'),d);
 for(const dpi of [72,64,56,48]){ execSync(`dot -Tpng -Gdpi=${dpi} ${files[k]}.dot -o ${files[k]}.png`,{cwd:dir}); const sz=fs.statSync(path.join(dir,files[k]+'.png')).size; if(sz<600000)break;}
}
