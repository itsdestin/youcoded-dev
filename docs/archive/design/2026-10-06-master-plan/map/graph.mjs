import fs from 'fs'; import path from 'path';
const ROOT=process.cwd(); const SRC='youcoded/desktop/src';
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
// files
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
 if(e.name==='node_modules')continue; const p=path.join(d,e.name);
 if(e.isDirectory())walk(p); else if(/\.(ts|tsx)$/.test(e.name)&&!/\.(test|spec)\.tsx?$/.test(e.name)&&!p.includes('__tests__')&&!e.name.endsWith('.d.ts'))files.push(p);}})(SRC);
const fset=new Set(files);
const lines={}; const imps={};
for(const f of files){const t=fs.readFileSync(f,'utf8'); lines[f]=t.split('\n').length;
 const s=new Set(); for(const m of t.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g))s.add(m[1]); imps[f]=[...s];}
function resolve(from,spec){ if(!spec.startsWith('.'))return null; const b=path.join(path.dirname(from),spec);
 for(const c of [b,b+'.ts',b+'.tsx',b+'/index.ts',b+'/index.tsx',b.replace(/\.js$/,'.ts'),b.replace(/\.js$/,'.tsx')]) if(fset.has(c))return c; return null;}
// ownership
const claims=[]; rows.forEach((r,i)=>{for(const p of r.paths){ if(p.includes('*')||p.includes('<'))continue; claims.push({p:p.replace(/\/$/,''),i,dir:p.endsWith('/')});}});
function claim(f){let best=null;for(const c of claims){ if(f===c.p||f.startsWith(c.p+'/')){ if(!best||c.p.length>best.p.length)best=c;}} return best;}
const owner={}; const unclaimed=[];
for(const f of files){const c=claim(f); if(c)owner[f]='S:'+c.i; else unclaimed.push(f);}
// unclaimed dir key
const rel=f=>f.slice(SRC.length+1); 
function key(f){const s=rel(f).split('/'); const d=s.slice(0,-1); let depth=(s[0]==='renderer'&&s[1]==='components')?3:(s[0]==='main'?2:2); if(s[0]==='renderer'&&s[1]==='components'&&s.length===3)return 'renderer/components (root files)'; return d.slice(0,depth).join('/')||'(root)';}
const fw=f=>{const b=path.basename(f).replace(/\.(tsx?)$/,''); return b.replace(/([a-z])([A-Z])/g,'$1-$2').toLowerCase().split(/[-_.]/)[0];};
const cnt0={}; for(const f of unclaimed){const k=key(f);(cnt0[k]??=[]).push(f);}
const cnt={}; for(const [k,v] of Object.entries(cnt0)){ if(!(k==='main'||k==='shared'||k.endsWith('(root files)')||k==='renderer/hooks'||k==='renderer/state')){cnt[k]=v;continue;}
 const g={}; v.forEach(f=>(g[fw(f)]??=[]).push(f)); const rest=[]; for(const [w,fs_] of Object.entries(g)){ if(fs_.length>=4)cnt[k+'/'+w+'-*']=fs_; else rest.push(...fs_);} if(rest.length)cnt[k+' (misc)']=rest;}
const tot=files.length, totL=files.reduce((a,f)=>a+lines[f],0);
const ul=unclaimed.reduce((a,f)=>a+lines[f],0);
const big=Object.entries(cnt).map(([k,v])=>[k,v.length,v.reduce((a,f)=>a+lines[f],0)]).sort((a,b)=>b[1]-a[1]);
const MIN=+process.env.MIN||8;
for(const [k,v] of Object.entries(cnt)){ const nm='U:'+(v.length>=MIN||/[*)]$/.test(k)?k:'other small dirs'); v.forEach(f=>owner[f]=nm);}
const nodeIds=[...new Set(Object.values(owner))];
const nodes={}; for(const id of nodeIds){nodes[id]={id,name:id.startsWith('S:')?rows[+id.slice(2)].name:'unclaimed: '+id.slice(2),files:0,lines:0,kind:id[0]==='S'?'map':'unclaimed'};}
// dev-only subsystems with no src files still nodes
rows.forEach((r,i)=>{const id='S:'+i; if(!nodes[id])nodes[id]={id,name:r.name,files:0,lines:0,kind:'map'};});
for(const f of files){const n=nodes[owner[f]];n.files++;n.lines+=lines[f];}
// non-src claimed file counts for scripts/ paths
function countFiles(p){try{const st=fs.statSync(p); if(st.isFile())return 1; let n=0; for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.name==='node_modules')continue;n+=e.isDirectory()?countFiles(path.join(p,e.name)):1;}return n;}catch{return 0}}
rows.forEach((r,i)=>{nodes['S:'+i].extFiles=r.paths.filter(p=>(p.startsWith('scripts/')||p.startsWith('.claude/'))&&!p.includes('*')&&!p.includes('<')).reduce((a,p)=>a+countFiles(p.replace(/\/$/,'')),0);});
const edges={}; let unres=0;
for(const f of files)for(const s of imps[f]){const t=resolve(f,s); if(!t)continue; const a=owner[f],b=owner[t]; if(a===b)continue; const k=a+'>'+b; edges[k]=(edges[k]||0)+1;}
fs.writeFileSync(process.argv[3],JSON.stringify({nodes,edges,tot,totL,unclaimedFiles:unclaimed.length,unclaimedLines:ul,big:big.slice(0,25)},null,1));
console.log({tot,totL,unc:unclaimed.length,ul,nodes:Object.keys(nodes).length,edges:Object.keys(edges).length});
console.log(big.slice(0,22).map(b=>b.join(' ')).join('\n'));
console.log('rows with 0 src files:',Object.values(nodes).filter(n=>n.kind=='map'&&!n.files).length);
