import fs from 'fs';
const g=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const out=process.argv[3];
const rows=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
const N=g.nodes; const ids=Object.keys(N);
const short=n=>{let s=n.kind==='unclaimed'?'unclaimed: '+n.name.replace('unclaimed: ','').replace(/ \(root files\)/,''):n.name; if(n.kind!=='unclaimed')s=s.split(/ \(|\s—|\s-\s|,|:|\*\*/)[0].replace(/[`"]/g,'').trim(); return s.slice(0,46);};
for(const id of ids)N[id].label=short(N[id]);
// ---------- B and C assignment: [test, B, C, hardReason?]
const B=['Chat & agents','Pages','Marketplace','Social','Projects & files','Sync & devices','Foundations','Workshop'];
const C=['Integrations & plugins','Harness engineering','UI','Backend & experience','Workflow engineering'];
const S_={ // index: [B,C,hard]
0:['Chat & agents','Harness engineering','model picker UI is renderer, but its content is provider/model data'],
1:['Chat & agents','Backend & experience','chat reducer is renderer code but the transcript is conversation data'],
2:['Foundations','Backend & experience'],3:['Foundations','Backend & experience'],4:['Sync & devices','Backend & experience'],
5:['Chat & agents','UI'],6:['Foundations','UI'],7:['Foundations','UI'],
8:['Foundations','UI','window management: neither chat nor a standalone system'],
9:['Workshop','Workflow engineering'],10:['Workshop','Workflow engineering'],11:['Workshop','Workflow engineering'],12:['Workshop','Workflow engineering'],13:['Workshop','Workflow engineering'],14:['Workshop','Workflow engineering'],
15:['Workshop','Workflow engineering','a test rig, but it measures prompt caching (a harness topic)'],
16:['Workshop','Workflow engineering'],
17:['Workshop','Workflow engineering','packaging is dev tooling but ships to every user'],
18:['Foundations','Backend & experience','update check is app plumbing yet a visible button'],
19:['Foundations','Backend & experience'],20:['Workshop','Workflow engineering'],21:['Workshop','Workflow engineering'],22:['Workshop','Workflow engineering'],23:['Workshop','Workflow engineering'],
24:['Foundations','UI'],25:['Foundations','UI'],26:['Foundations','UI'],
27:['Projects & files','Backend & experience','file feature, no matching work stream (files is not one of the five streams)'],
28:['Projects & files','Backend & experience','file feature, no matching work stream'],
29:['Projects & files','Integrations & plugins','separate add-on, but a file feature to users'],
30:['Pages','Integrations & plugins','pages are built by a plugin skill but run as part of the app'],
31:['Chat & agents','Backend & experience'],
32:['Chat & agents','UI','permission cards are chat UI but answer terminal menus'],
33:['Projects & files','Backend & experience'],34:['Sync & devices','Backend & experience'],35:['Chat & agents','Backend & experience'],
36:['Foundations','Backend & experience'],37:['Sync & devices','Backend & experience','chat handoff is both chat and device sync'],38:['Chat & agents','Backend & experience'],
39:['Chat & agents','Harness engineering'],40:['Chat & agents','Harness engineering'],41:['Chat & agents','Harness engineering'],
42:['Chat & agents','Harness engineering','a screen showing harness state'],43:['Chat & agents','Harness engineering'],
44:['Chat & agents','UI','a status screen fed by harness numbers'],45:['Chat & agents','Backend & experience','tiny feed for the status bar'],
46:['Chat & agents','Harness engineering'],47:['Chat & agents','Harness engineering'],48:['Chat & agents','Harness engineering'],
49:['Workshop','Harness engineering','evaluator is a dev tool whose subject is the harness'],
50:['Chat & agents','Integrations & plugins','sign-in is a connection but sits inside chat setup'],51:['Chat & agents','Integrations & plugins','sign-in is a connection but sits inside chat setup'],52:['Chat & agents','Integrations & plugins','sign-in is a connection but sits inside chat setup'],
53:['Chat & agents','Harness engineering'],
54:['Chat & agents','UI','voice is input UI, but also uses local models'],
55:['Foundations','Backend & experience','Android is out of the desktop graph'],56:['Foundations','Backend & experience'],57:['Foundations','UI'],
58:['Marketplace','Integrations & plugins'],59:['Social','Backend & experience','games are a feature; no stream owns features'],60:['Social','Backend & experience'],
61:['Foundations','Backend & experience','usage counting: not a user feature, not dev tooling'],
62:['Workshop','Workflow engineering','a website measure, not the app'],63:['Marketplace','Integrations & plugins'],64:['Marketplace','Integrations & plugins'],
65:['Foundations','Integrations & plugins','hooks wire the app into Claude Code'],66:['Workshop','Integrations & plugins','archived history'],67:['Workshop','Workflow engineering'],
};
const U=[ // [regex on unclaimed key, B, C, hard]
[/^main\/buddy/,'Chat & agents','UI','the floating buddy window: chat surface, or its own thing?'],
[/^main\/github/,'Sync & devices','Backend & experience'],[/^main\/marketplace/,'Marketplace','Integrations & plugins'],[/^main\/project/,'Projects & files','Backend & experience'],
[/^main\/remote/,'Sync & devices','Backend & experience'],[/^main\/sync/,'Sync & devices','Backend & experience'],[/^main\/theme/,'Foundations','UI'],
[/^main \(misc\)/,'Foundations','Backend & experience','59 loose top-level files; mixed purposes'],
[/^main\/artifacts/,'Projects & files','Backend & experience'],[/^main\/chatsearch/,'Chat & agents','Backend & experience'],[/^main\/conversations/,'Foundations','Backend & experience','conversation store is Foundations by definition but is chat data'],
[/^main\/doc-comments/,'Projects & files','Backend & experience'],[/^main\/engine/,'Chat & agents','Harness engineering'],[/^main\/harness/,'Chat & agents','Harness engineering'],[/^main\/models/,'Chat & agents','Harness engineering'],
[/^main\/office/,'Projects & files','Integrations & plugins'],[/^main\/providers/,'Chat & agents','Harness engineering','providers: a connection (Integrations) or the brain (Harness)?'],[/^main\/sync-spaces/,'Sync & devices','Backend & experience'],
[/^renderer\/components\/artifact-views/,'Projects & files','UI'],[/^renderer\/components\/assistant-settings/,'Foundations','UI'],[/^renderer\/components\/buddy/,'Chat & agents','UI','the floating buddy window: chat surface, or its own thing?'],
[/^renderer\/components\/context-menu/,'Foundations','UI'],[/^renderer\/components\/development/,'Foundations','UI','bug-report and contribute popups: app chrome or workflow?'],[/^renderer\/components\/first-run/,'Foundations','UI'],
[/^renderer\/components\/game/,'Social','UI'],[/^renderer\/components\/git/,'Projects & files','Backend & experience'],[/^renderer\/components\/guide/,'Foundations','UI'],[/^renderer\/components\/header/,'Foundations','UI'],
[/^renderer\/components\/marketplace/,'Marketplace','Integrations & plugins'],[/^renderer\/components\/mascot/,'Foundations','UI'],[/^renderer\/components\/office/,'Projects & files','Integrations & plugins'],
[/^renderer\/components\/pages/,'Pages','Integrations & plugins'],[/^renderer\/components\/project-view/,'Projects & files','UI'],[/^renderer\/components\/specialists/,'Chat & agents','Harness engineering'],
[/^renderer\/components\/tags/,'Chat & agents','UI','session tags: chat organisation or projects?'],[/^renderer\/components\/tool-views/,'Chat & agents','UI'],
[/^renderer\/game/,'Social','UI'],[/^renderer\/themes/,'Foundations','UI'],[/^renderer\/utils/,'Foundations','UI'],[/^renderer$/,'Foundations','UI'],
[/^shared\/artifacts/,'Projects & files','Backend & experience'],[/^other small dirs/,'Foundations','Backend & experience','82 leftover files from many small folders'],
[/^renderer\/components \(root files\)\/model/,'Chat & agents','UI'],[/^renderer\/components \(root files\)\/resume/,'Sync & devices','Backend & experience','resume screens: chat or handoff?'],
[/^renderer\/components \(root files\)\/session/,'Chat & agents','UI'],[/^renderer\/components \(root files\)\/sync/,'Sync & devices','UI'],[/^renderer\/components \(root files\)\/theme/,'Foundations','UI'],
[/^renderer\/components \(root files\) \(misc\)/,'Foundations','UI','92 loose components of every kind (chat, settings, dialogs)'],
[/^renderer\/hooks/,'Foundations','UI','53 hooks that serve every feature'],[/^renderer\/state\/artifact/,'Projects & files','UI'],[/^renderer\/state\/marketplace/,'Marketplace','Integrations & plugins'],
[/^renderer\/state \(misc\)/,'Foundations','UI','33 state files: mostly chat, but filed as shared'],
[/^shared\/doc-/,'Projects & files','Backend & experience'],[/^shared\/session-/,'Chat & agents','Backend & experience'],[/^shared \(misc\)/,'Foundations','Backend & experience'],
];
const gB={},gC={},hard=[];
for(const id of ids){const n=N[id]; let b,c,h;
 if(id[0]==='S'){[b,c,h]=S_[+id.slice(2)]||[]; if(!b)throw new Error('no map '+id+n.name);}
 else{const k=n.name.replace('unclaimed: ',''); const r=U.find(u=>u[0].test(k)); if(!r)throw new Error('unmapped '+k); [,b,c,h]=r;}
 if(!B.includes(b))throw new Error('badB '+b); if(!C.includes(c))throw new Error('badC '+c);
 gB[id]=b;gC[id]=c; if(h)hard.push({id,label:n.label,files:n.files,B:b,C:c,why:h});}
// ---------- edges
const E=Object.entries(g.edges).map(([k,w])=>{const [a,b]=k.split('>');return {a,b,w};});
const und={}; for(const e of E){const k=[e.a,e.b].sort().join('|'); und[k]=(und[k]||0)+e.w;}
// louvain
function louvain(ids,und){
 let nodes=ids.map(i=>[i]); let adjs=ids.map(()=>new Map()); const ix=Object.fromEntries(ids.map((id,i)=>[id,i]));
 let m2=0; for(const [k,w] of Object.entries(und)){const [a,b]=k.split('|'); const i=ix[a],j=ix[b]; adjs[i].set(j,(adjs[i].get(j)||0)+w); adjs[j].set(i,(adjs[j].get(i)||0)+w); m2+=2*w;}
 let comm=ids.map((_,i)=>i); // mapping original idx->current community, tracked via members
 let members=ids.map((_,i)=>[i]);
 for(let level=0;level<10;level++){
  const n=adjs.length; const c=[...Array(n).keys()]; const deg=adjs.map(m=>[...m.values()].reduce((a,b)=>a+b,0));
  const tot=[...deg]; let moved=true,any=false,it=0;
  while(moved&&it++<50){moved=false;
   for(let i=0;i<n;i++){const ci=c[i]; const ws=new Map(); for(const [j,w] of adjs[i]) if(j!==i) ws.set(c[j],(ws.get(c[j])||0)+w);
    tot[ci]-=deg[i]; let best=ci,bg=(ws.get(ci)||0)-tot[ci]*deg[i]/m2;
    for(const [cc,w] of ws){const gain=w-tot[cc]*deg[i]/m2; if(gain>bg+1e-9){bg=gain;best=cc;}}
    tot[best]+=deg[i]; if(best!==ci){c[i]=best;moved=true;any=true;}}}
  if(!any)break;
  const rem=[...new Set(c)]; const rm=Object.fromEntries(rem.map((x,i)=>[x,i]));
  const nm=rem.map(()=>[]); const na=rem.map(()=>new Map());
  for(let i=0;i<n;i++){nm[rm[c[i]]].push(...members[i]);}
  for(let i=0;i<n;i++)for(const [j,w] of adjs[i]){const a=rm[c[i]],b=rm[c[j]]; na[a].set(b,(na[a].get(b)||0)+w);}
  members=nm; adjs=na;
 }
 const res={}; members.forEach((mm,gi)=>mm.forEach(i=>res[ids[i]]=gi)); return res;
}
const connected=ids.filter(id=>E.some(e=>e.a===id||e.b===id));
const lv=louvain(connected,und);
const clusters={}; for(const [id,gi] of Object.entries(lv))(clusters[gi]??=[]).push(id);
const gA={}; const used=new Set();
for(const [gi,mem] of Object.entries(clusters)){mem.sort((x,y)=>N[y].lines-N[x].lines); let nm=mem.slice(0,2).map(i=>N[i].label.replace('unclaimed: ','')).join(' + '); if(used.has(nm))nm+=' #'+gi; used.add(nm); mem.forEach(i=>gA[i]=nm);}
for(const id of ids) if(!gA[id])gA[id]='No code links (dev tools, workers)';
function metrics(gm){let within=0,across=0; const pair={}; const pn={};
 for(const e of E){const x=gm[e.a],y=gm[e.b]; if(x===y)within+=e.w; else{across+=e.w; const k=[x,y].sort().join(' <> '); pair[k]=(pair[k]||0)+e.w; (pn[k]??=[]).push([e.w,N[e.a].label+' -> '+N[e.b].label]);}}
 const seams=Object.entries(pair).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,w])=>({seam:k,imports:w,top:pn[k].sort((a,b)=>b[0]-a[0]).slice(0,3).map(t=>t[1]+' ('+t[0]+')')}));
 const groups=[...new Set(Object.values(gm))];
 return {groups:groups.length,within,across,withinPct:+(100*within/(within+across)).toFixed(1),seams};}
const mA=metrics(gA),mB=metrics(gB),mC=metrics(gC);
// group sizes
const gsz=gm=>{const o={};for(const id of ids){const k=gm[id];o[k]??={nodes:0,files:0,lines:0};o[k].nodes++;o[k].files+=N[id].files;o[k].lines+=N[id].lines;}return o;};
fs.writeFileSync(out,JSON.stringify({coverage:{files:g.tot,lines:g.totL,unclaimedFiles:g.unclaimedFiles,unclaimedLines:g.unclaimedLines,biggestGaps:g.big},nodes:N,edges:E,groupings:{A:gA,B:gB,C:gC},metrics:{A:mA,B:mB,C:mC},sizes:{A:gsz(gA),B:gsz(gB),C:gsz(gC)},hard},null,1));
console.log(JSON.stringify({mA,mB,mC},null,1)); console.log(Object.entries(gsz(gA)).map(([k,v])=>k+' '+v.nodes+'n '+v.files+'f').join('\n'));
