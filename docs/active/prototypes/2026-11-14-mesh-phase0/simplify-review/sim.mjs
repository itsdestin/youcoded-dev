// Reviewer's own simulator, written from the study's plain rules only.
// usage: node sim.mjs <seedStart> <count> <mix> [relayMode]
const [,, S0='1', N='1000', MIX='hostile', RM='honest'] = process.argv;
function rngf(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const MIXES = {
 hostile:{poison:process.env.POISON?3:0,write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,term:3,hk:3,roll:2,reset:1,evict:1,die:1,remove:2,repair:1,snap:2,newchat:1},
 calm:{write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:2,rup:3,link:8,unlink:6,sync:8,rsync:8,hk:3,snap:2},
};
const W = MIXES[MIX]; for(const k of (process.env.DROP||'').split(',').filter(Boolean))W[k]=0; const WK = Object.keys(W); const WT = WK.reduce((a,k)=>a+W[k],0);
const cmpK=(a,b)=>{for(let i=0;i<4;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1}return 0};
const keyOf=e=>[e.ctr,e.conf?1:0,-e.owner,-e.start];
const stats={sched:0,fail:{},stale:{},copies:0,copyCause:{},loss:0,inherent:0,dbl:0,tap:0,tapCopy:0,tapPlace:0,tapDirect:0,tapMoved:0,demote:0,ownerless:0,stuck:0,examples:[]};
function bump(o,k,n=1){o[k]=(o[k]||0)+n}

function run(seed){
 const rng=rngf(seed); const R=n=>Math.floor(rng()*n); const P=p=>rng()<p;
 const nd=2+R(4); let lyP = RM==='honest'?0: RM==='ly30'?0.3:0.8;
 const w={fail:{},nd,nextRid:1,shown:new Map(),excused:new Set(),relay:null,devs:[],linkUp:new Set(),trace:[],chatIds:[]};
 const relay=w.relay={up:true,notes:new Map(),hist:new Map(),nodes:new Map(),entries:new Map(),grants:new Map(),removed:new Set()};
 const lk=(i,j)=>i<j?i+'-'+j:j+'-'+i;
 for(let i=0;i<nd;i++)w.devs.push({id:i,alive:true,dead:false,awake:true,online:true,removed:new Set(),chats:new Map(),snap:null,rawTerm:[],lastNote:new Map()});
 const D=w.devs;
 const mkChat=(id)=>({id,nodes:new Map(),entries:new Map()});
 const getChat=(d,c)=>{let x=d.chats.get(c);if(!x){x=mkChat(c);d.chats.set(c,x)}return x};
 const ek=e=>e.ctr+':'+e.owner+':'+e.start;
 const addEntry=(ch,e)=>{const k=ek(e);const o=ch.entries.get(k);if(!o)ch.entries.set(k,{...e});else if(e.conf)o.conf=true};
 const top=ch=>{let b=null;for(const e of ch.entries.values())if(!b||cmpK(keyOf(e),keyOf(b))>0)b=e;return b};
 const ownerOf=(d,c)=>{const ch=d.chats.get(c);if(!ch)return -1;const t=top(ch);if(!t)return -1;return d.removed.has(t.owner)?-2:t.owner};
 const valid=(ch,n)=>{if(n.hk)return false;if(n.tc===0)return true;const t=ch.entries.get(n.tc+':'+n.to+':'+n.ts);if(!t)return true;const kt=keyOf(t);for(const e of ch.entries.values()){if(e!==t&&e.start<=n.idx&&cmpK(keyOf(e),kt)>0)return false}return true};
 function chainOf(ch){const kids=new Map();for(const n of ch.nodes.values()){if(n.hk)continue;const p=n.parent===null?0:n.parent;if(!kids.has(p))kids.set(p,[]);kids.get(p).push(n)}
  const out=[];let cur=0;for(;;){const c=(kids.get(cur)||[]).filter(n=>valid(ch,n));if(!c.length)break;c.sort((a,b)=>a.rid-b.rid);out.push(c[0]);cur=c[0].rid}return {chain:out,kids}}
 function reconcile(d,c,cause){const ch=d.chats.get(c);if(!ch)return;const {chain,kids}=chainOf(ch);const on=new Set(chain.map(n=>n.rid));
  const roots=[];for(const n of ch.nodes.values()){if(n.hk||on.has(n.rid))continue;const p=n.parent===null?null:ch.nodes.get(n.parent);if(n.parent===null||(p&&on.has(p.rid)))roots.push(n)}
  for(const b of roots){if(process.env.NOCOPY)continue;const cid=c+'~'+b.rid;const cc=getChat(d,cid);const fresh=cc.nodes.size===0;
   // prefix = ancestors (all on canonical chain), retagged 0
   let anc=[];let p=b.parent;while(p!==null){const x=ch.nodes.get(p);anc.push(x);p=x.parent}anc.reverse();
   for(const x of anc)if(!cc.nodes.has(x.rid))cc.nodes.set(x.rid,{...x,tc:0,to:-1});
   const W0=b.writer;const st=[b];while(st.length){const x=st.pop();if(!cc.nodes.has(x.rid))cc.nodes.set(x.rid,{...x,tc:1,to:W0,ts:b.idx});for(const k of kids.get(x.rid)||[])st.push(k)}
   addEntry(cc,{ctr:1,owner:W0,start:b.idx,conf:false});
   if(fresh){const dl=[...cc.nodes.values()].filter(n=>n.tc===1).length;const wl=chain.length-b.idx;stats.dem=(stats.dem||0)+1;if(dl>wl)stats.demLonger=(stats.demLonger||0)+1;if(dl>wl&&dl>=3)stats.demLonger3=(stats.demLonger3||0)+1;stats.copies++;bump(stats.copyCause,cause||'?');d.copyMade=(d.copyMade||0)+1;w.copyEver=true;reconcile(d,cid,'copy')}}}
 const len=(d,c)=>chainOf(getChat(d,c)).chain.length;
 const tipOf=(d,c)=>{const ch=chainOf(getChat(d,c)).chain;return ch.length?ch[ch.length-1].rid:null};
 // reachability
 const canRelay=(d)=>d.alive&&d.online&&relay.up&&!d.dead;
 const relayOK=(d)=>canRelay(d)&&!(lyP&&P(lyP*0.5)); // withholding
 const directOK=(a,b)=>a.alive&&b.alive&&!a.dead&&!b.dead&&a.awake&&b.awake&&w.linkUp.has(lk(a.id,b.id));
 const viaRelayOK=(a,b)=>relayOK(a)&&canRelay(b)&&b.awake&&b.alive;
 const reach=(a,b)=>directOK(a,b)||viaRelayOK(a,b);
 function rRead(d,c){ if(!relayOK(d))return {down:true}; const cur=relay.notes.get(c)||null; if(lyP&&P(lyP)){const h=relay.hist.get(c)||[];if(h.length&&P(0.8))return {note:h[R(h.length)]};if(P(0.3))return {note:null}} return {note:cur}}
 function rCAS(d,c,expect,nn,entry){ if(!relayOK(d))return {down:true}; const cur=relay.notes.get(c)||null; let ok=cur?cur.ctr===expect:expect===0; if(lyP&&P(lyP)){ok=!ok||P(0.2)?(!ok):ok; if(P(0.1))ok=false}
   if(ok){const h=relay.hist.get(c)||[];if(cur)h.push(cur);relay.hist.set(c,h);relay.notes.set(c,nn);const g=relay.grants.get(c+':'+nn.ctr);if(g!==undefined&&g!==nn.owner&&!lyP){stats.dbl++;if(w.resetDone)stats.dblAfterReset=(stats.dblAfterReset||0)+1}if(g!==undefined&&g!==nn.owner)w.dbl=true;relay.grants.set(c+':'+nn.ctr,nn.owner);return {ok:true}}
   return {ok:false,note:cur}}
 function rMark(d,c,ctr,mn,mr){ if(!relayOK(d))return;const cur=relay.notes.get(c);
   if(!cur){relay.notes.set(c,{ctr,owner:d.id,markN:mn,markRid:mr});return {ok:true}}
   if(cur.ctr===ctr&&cur.owner===d.id){relay.notes.set(c,{...cur,markN:mn,markRid:mr});return {ok:true}}
   return {ok:false,note:cur}}
 function syncRelay(d){ if(!relayOK(d))return false; if(d.removed.size&&0)return false;
   // roster: removed devices are refused
   if(relay.removed.has(d.id))return false;
   for(const [c,ch] of d.chats){let rn=relay.nodes.get(c);if(!rn){rn=new Map();relay.nodes.set(c,rn)}let re=relay.entries.get(c);if(!re){re=new Map();relay.entries.set(c,re)}
     for(const [k,n] of ch.nodes)rn.set(k,n);for(const e of ch.entries.values()){const o=re.get(ek(e));if(!o)re.set(ek(e),{...e});else if(e.conf)o.conf=true}}
   if(!(lyP&&P(lyP*0.5))){for(const [c,rn] of relay.nodes){const ch=getChat(d,c);for(const [k,n] of rn)if(!ch.nodes.has(k))ch.nodes.set(k,n);const re=relay.entries.get(c);if(re)for(const e of re.values())addEntry(ch,e)}}
   for(const x of relay.removed)d.removed.add(x);
   // register / learn notes
   for(const [c,ch] of d.chats){const t=top(ch);const cur=relay.notes.get(c);
     if(!cur&&t&&t.owner===d.id&&!d.removed.has(d.id)){rMark(d,c,t.ctr,len(d,c),tipOf(d,c))}
     else if(cur){d.lastNote.set(c,cur)}}
   for(const c of [...d.chats.keys()])reconcile(d,c,'relay-sync');
   if(lyP&&P(lyP*0.2)){for(const [c,rn] of relay.nodes){for(const k of [...rn.keys()])if(P(0.1))rn.delete(k)}}
   return true}
 function syncPair(a,b){ if(a.removed.has(b.id)||b.removed.has(a.id))return false; if(relay.removed.has(a.id)&&0)return false;
   for(const x of b.removed)a.removed.add(x);for(const x of a.removed)b.removed.add(x);
   const cs=new Set([...a.chats.keys(),...b.chats.keys()]);
   for(const c of cs){const A=getChat(a,c),B=getChat(b,c);for(const [k,n] of B.nodes)if(!A.nodes.has(k))A.nodes.set(k,n);for(const [k,n] of A.nodes)if(!B.nodes.has(k))B.nodes.set(k,n);
     for(const e of B.entries.values())addEntry(A,e);for(const e of A.entries.values())addEntry(B,e);
     const na=a.lastNote.get(c),nb=b.lastNote.get(c);const nn=!na?nb:!nb?na:(na.ctr>=nb.ctr?na:nb);if(nn){a.lastNote.set(c,nn);b.lastNote.set(c,nn)}}
   for(const c of cs){reconcile(a,c,'peer-sync');reconcile(b,c,'peer-sync')}
   return true}
 function write(d,c,tag){ if(process.env.CHK&&relayOK(d)){syncRelay(d);const rr=relay.notes.get(c);const tt=top(getChat(d,c));if(rr&&tt&&(rr.ctr>tt.ctr||(rr.ctr===tt.ctr&&rr.owner!==d.id)))return false}const ch=getChat(d,c);const o=ownerOf(d,c);if(o!==d.id)return false;if(!d.alive||!d.awake||d.dead)return false;
   const t=top(ch);const {chain}=chainOf(ch);const rid=w.nextRid++;
   // stale-write classification against ground truth
   let truthTop=null;const all=[ch,...D.filter(x=>x!==d).map(x=>x.chats.get(c)).filter(Boolean),{entries:relay.entries.get(c)||new Map()}];
   for(const g of all)for(const e of g.entries.values())if(!truthTop||cmpK(keyOf(e),keyOf(truthTop))>0)truthTop=e;
   if(truthTop&&(truthTop.owner!==d.id||truthTop.ctr!==t.ctr)){let cause;if(d.justRolled)cause='rolled-back';else if(!d.online||!relay.up)cause='offline-owner';else if(d.justWoke)cause='unchecked-after-wake';else if(lyP)cause='relay-lie';else cause='ONLINE-honest-unchecked';bump(stats.stale,cause);w.stale=true}
   const n={rid,parent:chain.length?chain[chain.length-1].rid:null,idx:chain.length,tc:t.ctr,to:d.id,ts:t.start,writer:d.id,hk:false};
   ch.nodes.set(rid,n);w.shown.set(rid,{by:d.id,c});
   // end-of-reply: send lines + refresh mark
   if(relayOK(d)){const rn=relay.nodes.get(c)||new Map();relay.nodes.set(c,rn);for(const [kk,nn2] of ch.nodes)rn.set(kk,nn2);const re=relay.entries.get(c)||new Map();relay.entries.set(c,re);for(const e of ch.entries.values())if(!re.has(ek(e)))re.set(ek(e),{...e});
     if(!P(0.1)){const r=rMark(d,c,t.ctr,chain.length+1,rid);if(r&&r.ok===false){d.lastNote.set(c,r.note)}}}
   return true}
 // hand-over or takeover. returns outcome string
 function tap(T,c,kind){ // kind: 'chip' (owner thought on) or 'cont'
   const ch=getChat(T,c);const o=ownerOf(T,c);stats.tap++;
   if(o===T.id)return 'self';
   const O=o>=0?D[o]:null;
   // 1. direct/relayed hand-over when owner reachable
   if(O&&reach(T,O)&&ownerOf(O,c)===O.id){
     const t0=top(getChat(O,c));let conf=false;const L=len(O,c);const ne={ctr:t0.ctr+1,owner:T.id,start:L,conf:false};
     if(canRelay(O)&&relayOK(O)){const cur=rRead(O,c);const note=cur.note;
       if(note&&(note.owner!==O.id||note.ctr!==t0.ctr)){O.lastNote.set(c,note);stats.tapMoved++;return fall(T,c,O)}
       const r=rCAS(O,c,note?note.ctr:0,{ctr:ne.ctr,owner:T.id,markN:L,markRid:tipOf(O,c)});if(r.ok===false){stats.tapMoved++;return fall(T,c,O)}if(r.ok)conf=true}
     ne.conf=conf;addEntry(getChat(O,c),ne);
     if(P(0.1)){return 'crash-mid-handover'} // O persisted entry; message to T lost
     const ok=syncPairChat(O,T,c);stats.tapDirect++;
     if(canRelay(T)&&!conf){const cur=rRead(T,c);if(cur.note&&cur.note.owner===T.id){}}
     return 'handover'}
   if(O&&ownerOf(O,c)===T.id&&0){}
   return fall(T,c,O)}
 function syncPairChat(a,b,c){const A=getChat(a,c),B=getChat(b,c);for(const [k,n] of A.nodes)if(!B.nodes.has(k))B.nodes.set(k,n);for(const [k,n] of B.nodes)if(!A.nodes.has(k))A.nodes.set(k,n);for(const e of A.entries.values())addEntry(B,e);for(const e of B.entries.values())addEntry(A,e);reconcile(a,c,'handover');reconcile(b,c,'handover');return true}
 function fall(T,c,O){ // owner unreachable path
   const ch=getChat(T,c);let note,haveRelay=false;
   const r=rRead(T,c);if(!r.down){haveRelay=true;note=r.note;if(note)T.lastNote.set(c,note)}else note=T.lastNote.get(c)||null;
   const L=len(T,c);
   const holds=(n)=>n&&(n.markN===0||(L>=n.markN&&chainOf(ch).chain[n.markN-1]&&chainOf(ch).chain[n.markN-1].rid===n.markRid));
   if(holds(note)||(process.env.NOMARK&&note)){
     const base=Math.max(note.ctr,top(ch)?top(ch).ctr:0);
     const ne={ctr:base+1,owner:T.id,start:L,conf:false};
     if(haveRelay){const x=rCAS(T,c,note.ctr,{ctr:ne.ctr,owner:T.id,markN:L,markRid:tipOf(T,c)});
       if(x.ok===false){if(x.note)T.lastNote.set(c,x.note);stats.tapMoved++;return 'moved';}
       if(x.ok)ne.conf=true}
     addEntry(ch,ne);stats.tapPlace++;
     if(haveRelay)syncRelay(T);return 'placed'}
   // copy
   stats.tapCopy++;bump(stats,note?(note.markN>L?'copyWhy_behind':'copyWhy_mismatch'):'copyWhy_nonote');const cid=c+'~u'+T.id+'~'+(tipOf(T,c)||0)+'~'+w.nextRid++;const cc=getChat(T,cid);for(const n of chainOf(ch).chain)cc.nodes.set(n.rid,{...n,tc:0,to:-1});addEntry(cc,{ctr:1,owner:T.id,start:L,conf:false});
   w.userCopy=(w.userCopy||0)+1;return 'copy'}
 // setup
 const nChats=1+R(3);
 for(let i=0;i<nChats;i++){const c='c'+i;const own=R(nd);const ch0=getChat(D[own],c);addEntry(ch0,{ctr:1,owner:own,start:0,conf:true});relay.notes.set(c,{ctr:1,owner:own,markN:0,markRid:0});w.chatIds.push(c);
   for(let k=0;k<R(4);k++)write(D[own],c)}
 for(let i=0;i<nd;i++)for(let j=i+1;j<nd;j++){w.linkUp.add(lk(i,j));syncPair(D[i],D[j])}
 for(const d of D){syncRelay(d);d.snap=snapOf(d)}
 function snapOf(d){const m=new Map();for(const [c,ch]of d.chats)m.set(c,{nodes:new Map(ch.nodes),entries:new Map([...ch.entries].map(([k,e])=>[k,{...e}]))});return {chats:m,lastNote:new Map(d.lastNote)}}
 function holders(){const h=new Map();const add=(rid,who)=>{let s=h.get(rid);if(!s){s=new Set();h.set(rid,s)}s.add(who)};
  for(const d of D){const tag=d.dead?'dead':relay.removed.has(d.id)?'removed':'live';for(const ch of d.chats.values())for(const n of ch.nodes.values())if(!n.hk)add(n.rid,tag+d.id);for(const r of d.rawTerm)add(r,tag+d.id)}
  for(const rn of relay.nodes.values())for(const n of rn.values())add(n.rid,'relay');return h}
 let lastDestr=false;
 function oracle(ev){ const h=holders();for(const [rid,info] of w.shown){if(w.excused.has(rid))continue;const s=h.get(rid);
   const live=s&&[...s].some(x=>x==='relay'||x.startsWith('live'));
   if(live)continue; if(s&&[...s].some(x=>x.startsWith('dead')||x.startsWith('removed'))){continue} // stranded (inherent)
   if(lastDestr){w.excused.add(rid);stats.inherent++;continue}
   stats.loss++;w.fail.LOSS=(w.fail.LOSS||0)+1;w.failMsg=w.failMsg||('LOSS rid '+rid+' after '+ev);return}}
 const evs=[];
 for(let step=0;step<60&&!w.fail.LOSS;step++){
  let r=R(WT),ev;for(const k of WK){if(r<W[k]){ev=k;break}r-=W[k]}
  const d=D[R(nd)];const c=w.chatIds[R(w.chatIds.length)];lastDestr=false;if(process.env.TR)console.log('EV',step,ev,'d'+d.id);const cc=[...d.chats.keys()];const c2=cc.length?cc[R(cc.length)]:c;
  for(const x of D)x.justWoke=x.justWoke&&ev==='write';
  switch(ev){
   case 'write':{if(!d.rawTerm)break;if(P(0.5))write(d,c2);break}
   case 'chip':case 'cont':{if(!d.alive||d.dead||!d.awake)break;if(ownerOf(d,c2)===d.id)break;evs.push(ev+d.id);tap(d,c2,ev);break}
   case 'sleep':{if(d.awake&&d.alive){if(P(0.8)&&relayOK(d)){for(const [cx,ch] of d.chats){const t=top(ch);if(t&&t.owner===d.id){const rn=relay.nodes.get(cx)||new Map();relay.nodes.set(cx,rn);for(const [k,n] of ch.nodes)rn.set(k,n);if(!P(0.2))rMark(d,cx,t.ctr,len(d,cx),tipOf(d,cx))}}}d.awake=false}break}
   case 'wake':{if(!d.awake&&d.alive&&!d.dead){d.awake=true;d.justWoke=true;if(P(0.7)&&relayOK(d)){d.justWoke=false;syncRelay(d)}}break}
   case 'off':d.online=false;break;case 'on':d.online=true;break;
   case 'rdown':relay.up=false;break;case 'rup':relay.up=true;break;
   case 'link':{const e=D[R(nd)];if(e!==d)w.linkUp.add(lk(d.id,e.id));break}
   case 'unlink':{const e=D[R(nd)];if(e!==d)w.linkUp.delete(lk(d.id,e.id));break}
   case 'sync':{const e=D[R(nd)];if(e!==d&&directOK(d,e))syncPair(d,e);break}
   case 'rsync':{if(d.awake)syncRelay(d);break}
   case 'term':{ // plain-terminal resume on a non-owner device
     if(!d.alive||d.dead||!d.awake)break;const ch=d.chats.get(c2);if(!ch||ownerOf(d,c2)===d.id)break;const rid=w.nextRid++;const {chain}=chainOf(ch);const cid=c2+'~t'+d.id+'~'+rid;if(process.env.TR)console.log('TERM',d.id,c2,rid);const cx=getChat(d,cid);for(const n of chain)cx.nodes.set(n.rid,{...n,tc:0,to:-1});cx.nodes.set(rid,{rid,parent:chain.length?chain[chain.length-1].rid:null,idx:chain.length,tc:1,to:d.id,ts:chain.length,writer:d.id,hk:false});if(process.env.TR)console.log('TERMDONE',rid,cid,JSON.stringify([...cx.nodes.values()].map(n=>[n.rid,n.parent])),chain.map(n=>n.rid));addEntry(cx,{ctr:1,owner:d.id,start:chain.length,conf:false});w.shown.set(rid,{by:d.id,c:cid});stats.copies++;bump(stats.copyCause,'terminal');w.copyEver=true;break}
   case 'hk':{const ch=d.chats.get(c2);if(!ch)break;const rid=w.nextRid++;const tp=tipOf(d,c2);ch.nodes.set(rid,{rid,parent:tp,idx:99,tc:0,to:-1,writer:d.id,hk:true});break}
   case 'roll':{if(d.snap&&!d.dead){lastDestr=true;const s=d.snap;d.chats=new Map();for(const [c3,x] of s.chats)d.chats.set(c3,{id:c3,nodes:new Map(x.nodes),entries:new Map([...x.entries].map(([k,e])=>[k,{...e}]))});d.lastNote=new Map(s.lastNote);d.rawTerm=[];d.justRolled=true}break}
   case 'snap':d.snap=snapOf(d);break;
   case 'reset':{lastDestr=true;relay.notes.clear();relay.nodes.clear();relay.entries.clear();relay.hist.clear();w.resetDone=true;break}
   case 'evict':{lastDestr=true;relay.nodes.clear();break}
   case 'die':{if(D.filter(x=>!x.dead).length>2){d.dead=true;d.alive=false}break}
   case 'remove':{const y=d;const x=D[R(nd)];if(x===y||y.dead||x.dead||y.removed.has(x.id)||y.removed.has(y.id))break;if(D.filter(z=>!y.removed.has(z.id)&&!z.dead).length<=2)break;
     if(relayOK(y)&&!P(0.3)){relay.removed.add(x.id);for(const q of relay.removed)y.removed.add(q)}else y.removed.add(x.id);break}
   case 'repair':{const x=D[R(nd)];if(x.removed.size||relay.removed.has(x.id)){relay.removed.delete(x.id);for(const z of D)z.removed.delete(x.id)}break}
   case 'poison':{if(!process.env.POISON)break;const ch=d.chats.get(c2);if(ch){const t=top(ch);if(t&&t.owner===d.id&&relayOK(d)){const cur=relay.notes.get(c2);if(cur&&cur.owner===d.id)relay.notes.set(c2,{...cur,markN:999,markRid:-1})}}break}
   case 'newchat':{const id='c'+(w.chatIds.length);if(w.chatIds.length<5&&d.alive&&!d.dead){w.chatIds.push(id);addEntry(getChat(d,id),{ctr:1,owner:d.id,start:0,conf:false})}break}
  }
  if(ev!=='write'&&ev!=='roll')for(const x of D)x.justRolled=false;
  oracle(ev);
 }
 // heal with an honest relay
 relay.up=true;lyP=0;
 const heal=()=>{for(let rnd=0;rnd<6;rnd++){for(const d of D){if(d.dead)continue;d.awake=true;d.alive=true;d.online=true}for(let i=0;i<nd;i++)for(let j=i+1;j<nd;j++)w.linkUp.add(lk(i,j));
   for(const d of D)if(!d.dead)syncRelay(d);for(let i=0;i<nd;i++)for(let j=i+1;j<nd;j++)if(!D[i].dead&&!D[j].dead)syncPair(D[i],D[j])}};
 relay.removed.clear();for(const d of D)d.removed.clear();
 heal();
 const live=D.filter(x=>!x.dead);for(const [c,nt] of relay.notes){const mx=Math.max(0,...live.map(x=>x.chats.has(c)?chainOf(x.chats.get(c)).chain.length:0));if(nt.markN>mx){bump(stats,'unreachableMarkChats');w.um=true}}bump(stats,'chatsTotal',relay.notes.size);

 const fails=[];
 // P1 / P2
 const chainRids=(d,c)=>chainOf(getChat(d,c)).chain.map(n=>n.rid);
 const allChats=new Set();for(const d of live)for(const c of d.chats.keys())allChats.add(c);
 for(const d of live){const inChain=new Set();for(const c of d.chats.keys())for(const rid of chainRids(d,c))inChain.add(rid);
   for(const [rid,info] of w.shown){if(w.excused.has(rid))continue;const h=holders().get(rid);const liveHold=h&&[...h].some(x=>x==='relay'||x.startsWith('live'));if(!liveHold)continue;if(!inChain.has(rid)){let orph=false;for(const ch of d.chats.values()){const n=ch.nodes.get(rid);if(n){let p=n;while(p&&p.parent!==null){const q=ch.nodes.get(p.parent);if(!q){orph=true;break}p=q}}}fails.push((orph?'ORPHAN':'P1')+' hidden rid '+rid+' on dev '+d.id)}}}
 for(const c of allChats){let ref=null;for(const d of live){if(!d.chats.has(c)){fails.push('P2 chat '+c+' missing on '+d.id);continue}const s=chainRids(d,c).join(',');if(ref===null)ref=s;else if(ref!==s)fails.push('P2 diverged '+c)}}
 return {fails,w,stats0:null};
}
const t0=Date.now();
for(let s=0;s<+N;s++){const seed=+S0+s;let res;try{res=run(seed)}catch(e){console.log('CRASH seed',seed,e.stack.split('\n').slice(0,3).join('|'));process.exit(1)}
 stats.sched++;const w=res.w;
 if(w.fail.LOSS){bump(stats.fail,'LOSS');if(stats.examples.length<3)stats.examples.push({seed,msg:w.failMsg})}
 for(const f of res.fails){const k=f.split(' ')[0]+(f.startsWith('P2 diverged')?'-div':f.startsWith('P2 chat')?'-miss':'');bump(stats.fail,k);if(stats.examples.length<6&&!stats.examples.some(e=>e.k===k))stats.examples.push({seed,k,msg:f})}
 if(w.um)bump(stats,'unreachMarkSched');if(w.dbl)bump(stats,'dblSched');if(w.stale)bump(stats,'staleSched');if(w.copyEver)bump(stats,'copySched');if(w.userCopy)bump(stats,'userCopySched');
}
console.log(JSON.stringify({mix:MIX,relay:RM,seed0:+S0,n:+N,secs:(Date.now()-t0)/1000,...stats}));
if(process.env.DBG){const r=run(+S0);const w=r.w;for(const d of w.devs){for(const [c,ch] of d.chats){if(process.env.DBG!=="*"&&c!==process.env.DBG)continue;console.log("dev",d.id,"chat",c,"dead",d.dead,"entries",JSON.stringify([...ch.entries.values()]));console.log("  nodes",[...ch.nodes.values()].map(n=>`${n.rid}<${n.parent} i${n.idx} t${n.tc}:${n.to}${n.hk?"H":""}`).join(" "))}};console.log([...w.shown].filter(([r])=>r==10))}
