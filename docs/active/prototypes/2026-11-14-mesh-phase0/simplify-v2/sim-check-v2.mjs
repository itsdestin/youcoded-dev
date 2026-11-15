// simplify-v2 / sim-check-v2.mjs  -- chat simulator #1 (fork of the REVIEWER's simplify-review/sim.mjs, rewritten to the rules of
// simplify-study-v2.md section A). Independent of the study's own-sim.mjs. Oracle (section C):
//   P0  after every event no shown reply vanishes from every live holder (inherent losses counted apart, as the reviewer did)
//   P1  after heal every shown reply that a live device or the relay holds is on the chain of SOME chat on every live device (copies count)
//   P2  after heal every live device holds the same chats with the same chain
//   ORPHAN a reply hanging off a missing ancestor is shown as a gap copy (rule 11), never hidden
//   CUT  an item a removed device made AFTER its removal, that no honest device held when it learned of the removal, is on no chain
//   R2   after everybody is paired again the unsent work of removed/dead devices is visible (copies), nothing hidden
//   ESC  after the run, on EVERY chat any live device can continue in place (override), without loss, even if the mark is unmeetable
// usage: node sim-check-v2.mjs <seed0> <count> <mix> <relay: honest|ly30|ly80>
// mutants (env, each should make the oracle fail, proving it bites): NOCOPY NOCUT NOOVERRIDE NOCACHE NOGAP NOINORDER NOCHK NOVACATE
// variants (env): OLDTIE (reviewer's tie-break: lowest owner id), TWOREF (two note referees, no hand-over rule)
const [,, S0='1', N='1000', MIX='hostile', RM='honest'] = process.argv;
function rngf(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const MIXES = {
 hostile:{poison:2,thief:2,write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,term:3,hk:3,roll:2,reset:1,evict:1,die:1,remove:2,repair:1,snap:2,newchat:1},
 calm:{write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:2,rup:3,link:8,unlink:6,sync:8,rsync:8,hk:3,snap:2},
 poison:{poison:9,thief:1,write:30,chip:8,cont:10,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,hk:3,die:2,remove:2,repair:1,snap:2,newchat:1},
 wipe:{write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,term:2,hk:3,reset:6,evict:5,die:1,snap:2,newchat:1},
 restore:{write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,hk:3,roll:8,snap:6,evict:3,reset:2,die:1,newchat:1},
 removal:{thief:7,write:30,chip:8,cont:8,sleep:4,wake:4,off:5,on:5,rdown:3,rup:3,link:8,unlink:6,sync:8,rsync:8,hk:3,remove:8,repair:2,die:2,snap:2,newchat:1},
};
const W = {...MIXES[MIX]}; for(const k of (process.env.DROP||'').split(',').filter(Boolean))W[k]=0; const WK = Object.keys(W); const WT = WK.reduce((a,k)=>a+W[k],0);
const E=process.env; const NOCOPY=!!E.NOCOPY,NOCUT=!!E.NOCUT,NOOVERRIDE=!!E.NOOVERRIDE,NOCACHE=!!E.NOCACHE,NOGAP=!!E.NOGAP,NOINORDER=!!E.NOINORDER,NOCHK=!!E.NOCHK,NOVACATE=!!E.NOVACATE,OLDTIE=!!E.OLDTIE,TWOREF=!!E.TWOREF;
const cmpK=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1}return 0};
const stats={sched:0,fail:{},stale:{},copies:0,copyCause:{},loss:0,inherent:0,dbl:0,tap:0,tapCopy:0,tapPlace:0,tapDirect:0,tapMoved:0,tapVacated:0,overrideUser:0,ownerless:0,examples:[],failSeeds:{}};
function bump(o,k,n=1){o[k]=(o[k]||0)+n}
const setOf=(d,x)=>{let s=d.wit.get(x);if(!s){s=new Set();d.wit.set(x,s)}return s};

function run(seed){
 const rng=rngf(seed); const R=n=>Math.floor(rng()*n); const P=p=>rng()<p;
 const nd=2+R(4); let lyP = RM==='honest'?0: RM==='ly30'?0.3:0.8;
 const w={gen:new Map(),fail:{},nd,nextRid:1,nextEid:1,shown:new Map(),excused:new Set(),devs:[],linkUp:new Set(),chatIds:[],rem:new Set(),items:new Map(),lastDestr:false};
 const relay=w.relay={up:true,notes:new Map(),notes2:new Map(),hist:new Map(),nodes:new Map(),entries:new Map(),grants:new Map(),removed:new Set(),wit:new Map()};
 const NT=(d)=>TWOREF&&(d.id%2)?relay.notes2:relay.notes;
 const lk=(i,j)=>i<j?i+'-'+j:j+'-'+i;
 for(let i=0;i<nd;i++)w.devs.push({id:i,alive:true,dead:false,awake:true,online:true,removed:new Set(),wit:new Map(),chats:new Map(),snap:null,lastNote:new Map(),up:new Map()});
 const D=w.devs;
 // ---- removed-device cut-off (rule 16): items of a removed device count only if some device WITNESSED them when it first learned of the removal
 const itemOk=(d,x,key)=>NOCUT||!d.removed.has(x)||(d.wit.has(x)&&d.wit.get(x).has(key));
 const nodeOk=(d,n)=>!n.hk&&itemOk(d,n.writer,'n'+n.rid);
 const entryOk=(d,e)=>itemOk(d,e.owner,'e'+e.eid);
 function learn(d,x){ if(d.removed.has(x)||x===d.id)return; if(E.TR)console.log('   LEARN dev',d.id,'of',x,'holds',[...d.chats.values()].flatMap(ch=>[...ch.nodes.values()].filter(n=>n.writer===x).map(n=>n.rid))); d.removed.add(x); const s=setOf(d,x);
   for(const ch of d.chats.values()){for(const n of ch.nodes.values())if(n.writer===x&&!n.hk){s.add('n'+n.rid);const it=w.items.get('n'+n.rid);if(it)it.acc=true}
     for(const e of ch.entries.values())if(e.owner===x){s.add('e'+e.eid);const it=w.items.get('e'+e.eid);if(it)it.acc=true}} }
 const mergeKnow=(a,b)=>{ for(const x of b.removed)learn(a,x); for(const x of a.removed)learn(b,x);
   for(const [x,s] of b.wit)for(const k of s)setOf(a,x).add(k); for(const [x,s] of a.wit)for(const k of s)setOf(b,x).add(k)};
 // oracle bookkeeping only: a late item counts as 'accepted by design' if any device that did not yet know of the removal ever received it
 const touchN=(d,n)=>{if(n.writer!==d.id&&!d.removed.has(n.writer)){const it=w.items.get('n'+n.rid);if(it)it.acc=true}};const touchE=(d,e)=>{if(e.owner!==d.id&&!d.removed.has(e.owner)){const it=w.items.get('e'+e.eid);if(it)it.acc=true}};
 const mkChat=(id,d)=>({id,d,nodes:new Map(),entries:new Map()});
 const getChat=(d,c)=>{let x=d.chats.get(c);if(!x){x=mkChat(c,d);d.chats.set(c,x)}return x};
 const addEntry=(ch,e)=>{const o=ch.entries.get(e.eid);if(!o)ch.entries.set(e.eid,{...e});else if(e.conf)o.conf=true};
 // ---- the one view of a chat on one device: winner entry, its lineage, the chain (rules 2,3,4,13)
 // rule 16: a removed device's line or entry also counts when a device that is NOT removed built on it (its hash chain / its `prev` vouches for everything under it);
 // this is "work another device already built on stays valid", and it covers the devices that learned of the removal before they could witness
 function backedSets(ch){const d=ch.d;const bn=new Set(),be=new Set();
   for(const n of ch.nodes.values()){if(n.hk||!itemOk(d,n.writer,'n'+n.rid))continue;let p=n.parent;let g=0;while(p!==null&&p!==undefined&&g++<500){if(bn.has(p))break;bn.add(p);const q=ch.nodes.get(p);if(!q)break;p=q.parent}}
   for(const e of ch.entries.values()){if(!itemOk(d,e.owner,'e'+e.eid))continue;let q=e.prev,g=0;while(q&&g++<100){if(be.has(q))break;be.add(q);const x=ch.entries.get(q);if(!x)break;q=x.prev}}
   return {bn,be}}
 const sendN=(ch)=>{const d=ch.d;const bk=NOCUT?null:backedSets(ch);return n=>NOCUT||itemOk(d,n.writer,'n'+n.rid)||bk.bn.has(n.rid)};
 const sendE=(ch)=>{const d=ch.d;const bk=NOCUT?null:backedSets(ch);return e=>NOCUT||itemOk(d,e.owner,'e'+e.eid)||bk.be.has(e.eid)};
 function viewOf(ch){ const d=ch.d; const bk=NOCUT?null:backedSets(ch); const okN=n=>!n.hk&&(NOCUT||itemOk(d,n.writer,'n'+n.rid)||bk.bn.has(n.rid)); const okE=e=>NOCUT||itemOk(d,e.owner,'e'+e.eid)||bk.be.has(e.eid);
   const ents=[...ch.entries.values()].filter(okE);
   const wt=new Map(); for(const n of ch.nodes.values())if(n.te)wt.set(n.te,(wt.get(n.te)||0)+1);
   // total order: ctr, relay-confirmed, then the side that keeps MORE (start + lines written under it), then lowest owner, then lowest entry id
   const K=e=>[e.ctr,e.conf?1:0,OLDTIE?0:(e.start+(wt.get(e.eid)||0)),-e.owner,-e.eid];
   let Wn=null,kW=null; for(const e of ents){const k=K(e);if(!Wn||cmpK(k,kW)>0){Wn=e;kW=k}}
   const rng=new Map(); if(Wn){let hi=Infinity,e=Wn,g=0;while(e&&g++<200){const prev=e.prev?ch.entries.get(e.prev):null;const lo=prev?e.start:0;if(okE(e))rng.set(e.eid,[lo,hi]);if(!prev)break;if(okE(e))hi=lo;e=prev}}
   const valid=n=>{if(n.hk||!okN(n))return false;if(!n.te)return true;if(!Wn)return true;const r=rng.get(n.te);if(!r)return !ch.entries.has(n.te);return n.idx>=r[0]&&n.idx<r[1]};
   const kids=new Map();for(const n of ch.nodes.values()){if(n.hk)continue;const p=n.parent===null?0:n.parent;if(!kids.has(p))kids.set(p,[]);kids.get(p).push(n)}
   const chain=[];let cur=0;for(;;){const c=(kids.get(cur)||[]).filter(valid);if(!c.length)break;c.sort((a,b)=>a.rid-b.rid);chain.push(c[0]);cur=c[0].rid}
   return {W:Wn,chain,kids,wt,okN};}
 const top=ch=>viewOf(ch).W;
 const chainOf=ch=>viewOf(ch);
 const ownerOf=(d,c)=>{const ch=d.chats.get(c);if(!ch)return -1;const t=top(ch);if(!t)return -1;return d.removed.has(t.owner)?-2:t.owner};
 const len=(d,c)=>chainOf(getChat(d,c)).chain.length;
 const tipOf=(d,c)=>{const ch=chainOf(getChat(d,c)).chain;return ch.length?ch[ch.length-1].rid:null};
 const mkEid=()=>w.nextEid++;
 // a copy's own entry is named by the copy's id (a hash of it in the real thing), so every device that makes the same copy makes the same entry
 const copyEids=new Map();const ceid=(cid)=>{if(!copyEids.has(cid))copyEids.set(cid,mkEid());return copyEids.get(cid)};
 // ---- the one copy rule (rules 8,10,12) -------------------------------------------------------------------
 function reconcile(d,c,cause){const ch=d.chats.get(c);if(!ch)return;const {chain,kids,okN,W:Wn}=chainOf(ch);const on=new Set(chain.map(n=>n.rid));
  const roots=[];for(const n of ch.nodes.values()){if(n.hk||on.has(n.rid)||!okN(n))continue;const p=n.parent===null?null:ch.nodes.get(n.parent);if(n.parent===null||(p&&on.has(p.rid)))roots.push(n)}
  for(const b of roots){if(NOCOPY)continue;const cid=c+'~'+b.rid;const cc=getChat(d,cid);const fresh=cc.nodes.size===0;
   let anc=[];let p=b.parent;while(p!==null){const x=ch.nodes.get(p);anc.push(x);p=x.parent}anc.reverse();
   for(const x of anc)if(!cc.nodes.has(x.rid))cc.nodes.set(x.rid,{...x,te:0});
   const ce=cc.entries.size?null:{eid:ceid(cid),ctr:1,owner:b.writer,start:b.idx,prev:null,conf:false,kind:'copy'};
   const st=[b];let cnt=0;const cid_e=ce?ce.eid:[...cc.entries.values()][0].eid;
   while(st.length){const x=st.pop();if(!okN(x))continue;if(!cc.nodes.has(x.rid)){cc.nodes.set(x.rid,{...x,te:cid_e});cnt++}for(const k of kids.get(x.rid)||[])st.push(k)}
   if(ce)addEntry(cc,ce);
   if(fresh){const wl=chain.length-b.idx;const be=ch.entries.get(b.te);if(be&&Wn&&be.ctr===Wn.ctr&&!!be.conf===!!Wn.conf){stats.tie=(stats.tie||0)+1;if(cnt>wl)stats.tieLonger=(stats.tieLonger||0)+1;if(cnt>wl&&cnt>=3)stats.tieLonger3=(stats.tieLonger3||0)+1;if(cnt>=3)stats.tie3=(stats.tie3||0)+1}stats.dem=(stats.dem||0)+1;if(cnt>wl)stats.demLonger=(stats.demLonger||0)+1;if(cnt>wl&&cnt>=3)stats.demLonger3=(stats.demLonger3||0)+1;stats.copies++;bump(stats.copyCause,cause||'?');w.copyEver=true;reconcile(d,cid,'copy')}}}
 // rule 11: after every reachable source has been tried, a reply hanging off a missing ancestor is shown as a gap copy
 function gapCopies(d){ if(NOGAP)return; for(const [c,ch] of [...d.chats]){ const {kids,okN}=chainOf(ch);const miss=[...ch.nodes.values()].filter(n=>!n.hk&&n.parent!==null&&!ch.nodes.has(n.parent)&&okN(n)); if(!miss.length)continue;
   for(const b of miss){const cid=c+'~g'+b.rid;const isNew=!d.chats.has(cid);const cc=getChat(d,cid);   // an existing gap copy is topped up (a removed device's lines may have become valid since)
     const ce={eid:ceid(cid),ctr:1,owner:b.writer,start:0,prev:null,conf:false,kind:'gap'};
     const st=[b];while(st.length){const x=st.pop();if(!okN(x))continue;if(!cc.nodes.has(x.rid))cc.nodes.set(x.rid,{...x,parent:x===b?null:x.parent,te:ce.eid});for(const k of kids.get(x.rid)||[])st.push(k)}
     addEntry(cc,ce);if(isNew){stats.gap=(stats.gap||0)+1;w.copyEver=true}}}}
 // ---- reachability / relay
 const canRelay=(d)=>d.alive&&d.online&&relay.up&&!d.dead;
 const relayOK=(d)=>canRelay(d)&&!(lyP&&P(lyP*0.5));
 const directOK=(a,b)=>a.alive&&b.alive&&!a.dead&&!b.dead&&a.awake&&b.awake&&w.linkUp.has(lk(a.id,b.id));
 const viaRelayOK=(a,b)=>relayOK(a)&&canRelay(b)&&b.awake&&b.alive;
 const reach=(a,b)=>directOK(a,b)||viaRelayOK(a,b);
 function rRead(d,c){ if(!relayOK(d))return {down:true}; const cur=NT(d).get(c)||null; if(lyP&&P(lyP)){const h=relay.hist.get(c)||[];if(h.length&&P(0.8))return {note:h[R(h.length)]};if(P(0.3))return {note:null}} return {note:cur}}
 function confirmAtRelay(c,eid){const re=relay.entries.get(c);if(re&&re.has(eid))re.get(eid).conf=true}
 function rCAS(d,c,expect,nn){ if(!relayOK(d))return {down:true}; const NS=NT(d);const cur=NS.get(c)||null; let ok=cur?cur.ctr===expect:true; // an absent note (wiped / never made) is re-registered first-come-first-served
   if(lyP&&P(lyP)){ok=!ok||P(0.2)?(!ok):ok; if(P(0.1))ok=false}
   if(ok){const h=relay.hist.get(c)||[];if(cur)h.push(cur);relay.hist.set(c,h);NS.set(c,nn);const g=relay.grants.get(c+':'+nn.ctr);if(g!==undefined&&g!==nn.owner&&!lyP&&!TWOREF){stats.dbl++;w.dbl=true}if(g!==undefined&&g!==nn.owner)w.dbl=true;relay.grants.set(c+':'+nn.ctr,nn.owner);confirmAtRelay(c,nn.eid);return {ok:true}}
   return {ok:false,note:cur}}
 function rMark(d,c,ctr,mn,mr,eid){ if(!relayOK(d))return; const NS=NT(d);const cur=NS.get(c);
   if(!cur){NS.set(c,{ctr,owner:d.id,markN:mn,markRid:mr,eid});confirmAtRelay(c,eid);return {ok:true,created:true}}
   if(cur.ctr===ctr&&cur.owner===d.id){NS.set(c,{...cur,markN:mn,markRid:mr});return {ok:true}}
   return {ok:false,note:cur}}
 // rule 5: in-order upload. The relay takes a line only if it already holds the line before it; the device resumes from where the relay is.
 function uploadChat(d,c){ const ch=d.chats.get(c);if(!ch)return;let rn=relay.nodes.get(c);if(!rn){rn=new Map();relay.nodes.set(c,rn)}let re=relay.entries.get(c);if(!re){re=new Map();relay.entries.set(c,re)}
   const from=d.up.get(c)||0;let mx=from;const sN=sendN(ch),sE=sendE(ch);const ns=[...ch.nodes.values()].filter(n=>n.rid>from&&!n.hk&&sN(n)).sort((a,b)=>a.rid-b.rid);
   for(const n of ns){ if(!NOINORDER&&n.parent!==null&&!rn.has(n.parent)){d.up.set(c,0);mx=null;break} rn.set(n.rid,n);if(mx!==null)mx=Math.max(mx,n.rid)}
   if(mx!==null)d.up.set(c,mx);
   for(const e of ch.entries.values()){if(!sE(e))continue;const o=re.get(e.eid);if(!o)re.set(e.eid,{...e});else if(e.conf)o.conf=true}}
 function syncRelay(d){ if(!relayOK(d))return false; if(relay.removed.has(d.id))return false;
   for(const x of relay.removed)learn(d,x); for(const x of d.removed)relay.removed.add(x);
   for(const [x,s] of relay.wit)for(const k of s)setOf(d,x).add(k); for(const [x,s] of d.wit){let r=relay.wit.get(x);if(!r){r=new Set();relay.wit.set(x,r)}for(const k of s)r.add(k)}
   for(const c of [...d.chats.keys()])uploadChat(d,c);
   if(!(lyP&&P(lyP*0.5))){ for(const [c,rn] of relay.nodes){const ch=getChat(d,c);for(const [k,n] of rn)if(!ch.nodes.has(k)){touchN(d,n);ch.nodes.set(k,n)}const re=relay.entries.get(c);if(re)for(const e of re.values()){touchE(d,e);addEntry(ch,e)}} }
   for(const [c,ch] of d.chats){const t=top(ch);const cur=NT(d).get(c);
     if(!cur&&t&&t.owner===d.id&&!d.removed.has(d.id)){const r=rMark(d,c,t.ctr,len(d,c),tipOf(d,c),t.eid);if(r&&r.ok){const e=ch.entries.get(t.eid);if(e)e.conf=true}}
     else if(cur){ // rule 4: an owner that took over while it could not reach the relay now publishes its entry: first come, first served
       if(t&&t.owner===d.id&&t.ctr>cur.ctr&&!t.conf){let e=t,okAnc=false,g=0;while(e&&g++<100){if(e.ctr===cur.ctr&&e.owner===cur.owner){okAnc=true;break}e=e.prev?ch.entries.get(e.prev):null}
         if(okAnc){const x=rCAS(d,c,cur.ctr,{ctr:t.ctr,owner:d.id,markN:len(d,c),markRid:tipOf(d,c),eid:t.eid});if(x.ok){const e2=ch.entries.get(t.eid);if(e2)e2.conf=true;continue}}}
       d.lastNote.set(c,NT(d).get(c)||cur)}}
   for(const c of [...d.chats.keys()])reconcile(d,c,'relay-sync');
   if(lyP&&P(lyP*0.2)){w.lastDestr=true;for(const [c,rn] of relay.nodes){for(const k of [...rn.keys()])if(P(0.1))rn.delete(k)}}   // a lying relay destroying what it holds: a reply that ONLY the relay still held is gone for everyone (counted as inherent, as the study and the reviewer did)
   return true}
 function syncPair(a,b){ if(a.removed.has(b.id)||b.removed.has(a.id))return false; mergeKnow(a,b);
   const cs=new Set([...a.chats.keys(),...b.chats.keys()]);
   for(const c of cs){const A=getChat(a,c),B=getChat(b,c);
     const sNb=sendN(B),sNa=sendN(A),sEb=sendE(B),sEa=sendE(A);
     for(const [k,n] of B.nodes)if(!A.nodes.has(k)&&sNb(n)){touchN(a,n);A.nodes.set(k,n)}for(const [k,n] of A.nodes)if(!B.nodes.has(k)&&sNa(n)){touchN(b,n);B.nodes.set(k,n)}
     for(const e of B.entries.values())if(sEb(e)){touchE(a,e);addEntry(A,e)}for(const e of A.entries.values())if(sEa(e)){touchE(b,e);addEntry(B,e)}
     const na=a.lastNote.get(c),nb=b.lastNote.get(c);const nn=!na?nb:!nb?na:(na.ctr>=nb.ctr?na:nb);if(nn){a.lastNote.set(c,nn);b.lastNote.set(c,nn)}}
   for(const c of cs){reconcile(a,c,'peer-sync');reconcile(b,c,'peer-sync')}
   return true}
 // ---- writes: the owner appends a reply, reads the note first when it can (rule 6), refreshes the mark after (rule 7)
 function write(d,c,tag){ if(!NOCHK&&relayOK(d)){syncRelay(d);const rr=NT(d).get(c);const tt=top(getChat(d,c));if(rr&&tt&&(rr.ctr>tt.ctr||(rr.ctr===tt.ctr&&rr.owner!==d.id)))return false}
   const ch=getChat(d,c);const o=ownerOf(d,c);if(o!==d.id)return false;if(!d.alive||!d.awake||d.dead)return false;
   const t=top(ch);const {chain}=chainOf(ch);const rid=w.nextRid++;
   let stale=false;const all=[ch,...D.filter(x=>x!==d).map(x=>x.chats.get(c)).filter(Boolean),{entries:relay.entries.get(c)||new Map()}];
   for(const g of all)for(const e of g.entries.values())if(e.ctr>t.ctr||(e.ctr===t.ctr&&e.owner!==d.id&&e.conf&&!t.conf))stale=true;
   if(stale){let cause;if(d.justRolled)cause='rolled-back';else if(!d.online||!relay.up)cause='offline-owner';else if(d.justWoke)cause='unchecked-after-wake';else if(lyP)cause='relay-lie';else cause='ONLINE-honest-unchecked';bump(stats.stale,cause);w.stale=true}
   const n={rid,parent:chain.length?chain[chain.length-1].rid:null,idx:chain.length,te:t.eid,writer:d.id,hk:false};
   ch.nodes.set(rid,n);w.shown.set(rid,{by:d.id,c});
   if(w.rem.has(d.id)){w.items.set('n'+rid,{by:d.id,late:true,acc:false});w.lateEver=true}
   if(relayOK(d)&&!relay.removed.has(d.id)){uploadChat(d,c);if(!P(0.1)){const r=rMark(d,c,t.ctr,chain.length+1,rid,t.eid);if(r&&r.ok===false){d.lastNote.set(c,r.note)}}}
   return true}
 // ---- hand-over, takeover, copy (rules 5-9, 14)
 function tap(T,c,kind){ const ch=getChat(T,c);const o=ownerOf(T,c);stats.tap++;
   if(o===T.id)return 'self';
   if(o===-1)return 'noentry';   // the control log of a chat is exchanged before its lines (5.3): a chat whose ownership entries have not arrived cannot be continued yet
   if(o===-2&&!NOVACATE){stats.tapVacated++;return fall(T,c,null,{vacated:true})}   // rule 10: a removed owner's chats are freed
   const O=o>=0?D[o]:null;
   if(O&&reach(T,O)&&ownerOf(O,c)===O.id&&!O.removed.has(T.id)&&!T.removed.has(O.id)){
     const t0=top(getChat(O,c));let conf=false;const L=len(O,c);const ne={eid:mkEid(),ctr:t0.ctr+1,owner:T.id,start:L,prev:t0.eid,conf:false,kind:'handover'};
     if(canRelay(O)&&relayOK(O)){const cur=rRead(O,c);const note=cur.note;
       if(note&&(note.owner!==O.id||note.ctr!==t0.ctr)){O.lastNote.set(c,note);stats.tapMoved++;return fall(T,c,O,{})}
       const r=rCAS(O,c,note?note.ctr:t0.ctr,{ctr:ne.ctr,owner:T.id,markN:L,markRid:tipOf(O,c),eid:ne.eid});if(r.ok===false){stats.tapMoved++;return fall(T,c,O,{})}if(r.ok)conf=true}
     ne.conf=conf;addEntry(getChat(O,c),ne);
     if(P(0.1)){return 'crash-mid-handover'} // rule 19: O recorded the entry (and stopped writing), the message to T is lost; T finds it on its next sync
     const A=getChat(O,c),B=getChat(T,c);const hA=sendN(A),hB=sendN(B);for(const [k,n] of A.nodes)if(!B.nodes.has(k)&&hA(n)){touchN(T,n);B.nodes.set(k,n)}for(const [k,n] of B.nodes)if(!A.nodes.has(k)&&hB(n)){touchN(O,n);A.nodes.set(k,n)}for(const e of A.entries.values())addEntry(B,e);for(const e of B.entries.values())addEntry(A,e);
     reconcile(O,c,'handover');reconcile(T,c,'handover');stats.tapDirect++;return 'handover'}
   return fall(T,c,O,{})}
 function fall(T,c,O,opt){ // owner unreachable (or removed): rule 7, 8, 9, 10, 14
   const ch=getChat(T,c);let note=null,haveRelay=false;
   const r=rRead(T,c);if(!r.down){haveRelay=true;note=r.note;if(note)T.lastNote.set(c,note)}
   if(!note&&!NOCACHE)note=T.lastNote.get(c)||null;                        // rule 8: no (or no reachable) relay note: use the last one this device saw
   const L=len(T,c);const cv=chainOf(ch).chain;
   const holds=(n)=>n&&(n.markN===0||(L>=n.markN&&cv[n.markN-1]&&cv[n.markN-1].rid===n.markRid));
   let allow=!!opt.vacated||holds(note)||!!opt.force;
   if(!allow&&!NOOVERRIDE&&(opt.userPick||(!opt.noUser&&P(0.3)))){allow=true;stats.overrideUser++}   // rule 9: "Continue here anyway" is always offered next to "Continue as a copy"
   if(allow){
     const t0=top(ch);const base=Math.max(note?note.ctr:0,t0?t0.ctr:0);
     const ne={eid:mkEid(),ctr:base+1,owner:T.id,start:L,prev:t0?t0.eid:null,conf:false,kind:opt.vacated?'vacate':opt.force?'override':'takeover'};
     if(haveRelay){const x=rCAS(T,c,note?note.ctr:0,{ctr:ne.ctr,owner:T.id,markN:L,markRid:tipOf(T,c),eid:ne.eid});
       if(x.ok===false){if(x.note)T.lastNote.set(c,x.note);stats.tapMoved++;return 'moved'}
       if(x.ok)ne.conf=true}
     addEntry(ch,ne);stats.tapPlace++;
     if(haveRelay)syncRelay(T);return 'placed'}
   stats.tapCopy++;bump(stats,note?(note.markN>L?'copyWhy_behind':'copyWhy_mismatch'):'copyWhy_nonote');
   const cid=c+'~u'+T.id+'~'+(tipOf(T,c)||0)+'~'+w.nextRid++;const cc=getChat(T,cid);for(const n of cv)cc.nodes.set(n.rid,{...n,te:0});addEntry(cc,{eid:mkEid(),ctr:1,owner:T.id,start:L,prev:null,conf:false,kind:'copy'});
   w.userCopy=(w.userCopy||0)+1;return 'copy'}
 // ---- setup
 const nChats=1+R(3);
 for(let i=0;i<nChats;i++){const c='c'+i;const own=R(nd);const ch0=getChat(D[own],c);const e0={eid:mkEid(),ctr:1,owner:own,start:0,prev:null,conf:true,kind:'create'};addEntry(ch0,e0);relay.notes.set(c,{ctr:1,owner:own,markN:0,markRid:0,eid:e0.eid});relay.notes2.set(c,{...relay.notes.get(c)});relay.entries.set(c,new Map([[e0.eid,{...e0}]]));w.chatIds.push(c);
   for(let k=0;k<R(4);k++)write(D[own],c)}
 for(let i=0;i<nd;i++)for(let j=i+1;j<nd;j++){w.linkUp.add(lk(i,j));syncPair(D[i],D[j])}
 for(const d of D){syncRelay(d);d.snap=snapOf(d)}
 function snapOf(d){const m=new Map();for(const [c,ch]of d.chats)m.set(c,{nodes:new Map(ch.nodes),entries:new Map([...ch.entries].map(([k,e])=>[k,{...e}]))});return {chats:m,lastNote:new Map(d.lastNote),removed:new Set(d.removed),wit:new Map([...d.wit].map(([x,s])=>[x,new Set(s)])),gen:new Map(w.gen)}}
 function holders(){const h=new Map();const add=(rid,who)=>{let s=h.get(rid);if(!s){s=new Set();h.set(rid,s)}s.add(who)};
  for(const d of D){const tag=d.dead?'dead':w.rem.has(d.id)?'removed':'live';for(const ch of d.chats.values())for(const n of ch.nodes.values())if(!n.hk)add(n.rid,tag+d.id)}
  for(const rn of relay.nodes.values())for(const n of rn.values())add(n.rid,'relay');return h}
 function oracle(ev){ const h=holders();for(const [rid] of w.shown){if(w.excused.has(rid))continue;const s=h.get(rid);
   const live=s&&[...s].some(x=>x==='relay'||x.startsWith('live'));
   if(live)continue; if(s&&[...s].some(x=>x.startsWith('dead')||x.startsWith('removed')))continue;
   if(w.lastDestr){w.excused.add(rid);stats.inherent++;continue}
   stats.loss++;w.fail.LOSS=(w.fail.LOSS||0)+1;w.failMsg=w.failMsg||('LOSS rid '+rid+' after '+ev);return}}
 for(let step=0;step<60&&!w.fail.LOSS;step++){
  let r=R(WT),ev;for(const k of WK){if(r<W[k]){ev=k;break}r-=W[k]}
  const d=D[R(nd)];const c=w.chatIds[R(w.chatIds.length)];w.lastDestr=false;const cc=[...d.chats.keys()];const c2=cc.length?cc[R(cc.length)]:c;
  for(const x of D)x.justWoke=x.justWoke&&ev==='write';
  if(E.TR)console.log('EV',step,ev,'d'+d.id,'c',c2);
  switch(ev){
   case 'write':{if(P(0.5))write(d,c2);break}
   case 'chip':case 'cont':{if(!d.alive||d.dead||!d.awake)break;if(ownerOf(d,c2)===d.id)break;tap(d,c2,ev);break}
   case 'sleep':{if(d.awake&&d.alive){if(P(0.8)&&relayOK(d)&&!relay.removed.has(d.id)){for(const [cx,ch] of d.chats){const t=top(ch);if(t&&t.owner===d.id){uploadChat(d,cx);if(!P(0.2))rMark(d,cx,t.ctr,len(d,cx),tipOf(d,cx),t.eid)}}}d.awake=false}break}
   case 'wake':{if(!d.awake&&d.alive&&!d.dead){d.awake=true;d.justWoke=true;if(P(0.7)&&relayOK(d)){d.justWoke=false;syncRelay(d)}}break}
   case 'off':d.online=false;break;case 'on':d.online=true;break;
   case 'rdown':relay.up=false;break;case 'rup':relay.up=true;break;
   case 'link':{const e=D[R(nd)];if(e!==d)w.linkUp.add(lk(d.id,e.id));break}
   case 'unlink':{const e=D[R(nd)];if(e!==d)w.linkUp.delete(lk(d.id,e.id));break}
   case 'sync':{const e=D[R(nd)];if(e!==d&&directOK(d,e))syncPair(d,e);break}
   case 'rsync':{if(d.awake)syncRelay(d);break}
   case 'term':{ if(!d.alive||d.dead||!d.awake)break;const ch=d.chats.get(c2);if(!ch||ownerOf(d,c2)===d.id)break;const rid=w.nextRid++;const {chain}=chainOf(ch);const cid=c2+'~t'+d.id+'~'+rid;
     const cx=getChat(d,cid);for(const n of chain)cx.nodes.set(n.rid,{...n,te:0});const ce={eid:mkEid(),ctr:1,owner:d.id,start:chain.length,prev:null,conf:false,kind:'copy'};cx.nodes.set(rid,{rid,parent:chain.length?chain[chain.length-1].rid:null,idx:chain.length,te:ce.eid,writer:d.id,hk:false});addEntry(cx,ce);w.shown.set(rid,{by:d.id,c:cid});stats.copies++;bump(stats.copyCause,'terminal');w.copyEver=true;break}
   case 'hk':{const ch=d.chats.get(c2);if(!ch)break;const rid=w.nextRid++;ch.nodes.set(rid,{rid,parent:tipOf(d,c2),idx:99,te:0,writer:d.id,hk:true});break}
   case 'roll':{if(d.snap&&!d.dead){w.lastDestr=true;const s=d.snap;d.chats=new Map();for(const [c3,x] of s.chats){const ch=mkChat(c3,d);ch.nodes=new Map(x.nodes);ch.entries=new Map([...x.entries].map(([k,e])=>[k,{...e}]));d.chats.set(c3,ch)}d.lastNote=new Map(s.lastNote);d.removed=new Set([...s.removed].filter(x=>(w.gen.get(x)||0)===(s.gen.get(x)||0)));d.wit=new Map([...s.wit].filter(([x])=>d.removed.has(x)).map(([x,st])=>[x,new Set(st)]));d.up=new Map();d.justRolled=true}break}
   case 'snap':d.snap=snapOf(d);break;
   case 'reset':{w.lastDestr=true;relay.notes.clear();relay.notes2.clear();relay.nodes.clear();relay.entries.clear();relay.hist.clear();for(const x of D)x.up=new Map();break}
   case 'evict':{w.lastDestr=true;relay.nodes.clear();break}
   case 'die':{if(D.filter(x=>!x.dead).length>2){d.dead=true;d.alive=false}break}
   case 'remove':{const y=d;const x=D[R(nd)];if(x===y||y.dead||x.dead||y.removed.has(x.id)||w.rem.has(y.id))break;if(D.filter(z=>!w.rem.has(z.id)&&!z.dead).length<=2)break;
     w.rem.add(x.id);learn(y,x.id);if(relayOK(y)&&!P(0.3))relay.removed.add(x.id);break}
   case 'repair':{const x=D[R(nd)];if(w.rem.has(x.id)){w.gen.set(x.id,(w.gen.get(x.id)||0)+1);w.rem.delete(x.id);relay.removed.delete(x.id);relay.wit.delete(x.id);for(const z of D){z.removed.delete(x.id);z.wit.delete(x.id)}}break}
   case 'poison':{const ch=d.chats.get(c2);if(ch){const t=top(ch);if(t&&t.owner===d.id&&relayOK(d)){const NS=NT(d);const cur=NS.get(c2);if(cur&&cur.owner===d.id)NS.set(c2,{...cur,markN:999,markRid:-1})}}break}
   case 'thief':{ // a removed device that does not accept it: writes, and forges a back-dated take-over of everything it holds
     const xs=D.filter(x=>w.rem.has(x.id)&&x.alive&&!x.dead);if(!xs.length)break;const X=xs[R(xs.length)];const cx=[...X.chats.keys()];if(!cx.length)break;const cz=cx[R(cx.length)];
     if(P(0.5))write(X,cz);else{const ch=X.chats.get(cz);const t=top(ch);if(t){const ne={eid:mkEid(),ctr:t.ctr+3,owner:X.id,start:0,prev:t.eid,conf:false,kind:'forged'};addEntry(ch,ne);w.items.set('e'+ne.eid,{by:X.id,late:true,acc:false});w.lateEver=true}}
     const e=D[R(nd)];if(e!==X&&directOK(X,e))syncPair(X,e);
     if(relayOK(X)&&!relay.removed.has(X.id))syncRelay(X);break}
   case 'newchat':{const id='c'+(w.chatIds.length);if(w.chatIds.length<5&&d.alive&&!d.dead&&!w.rem.has(d.id)){w.chatIds.push(id);const e0={eid:mkEid(),ctr:1,owner:d.id,start:0,prev:null,conf:false,kind:'create'};addEntry(getChat(d,id),e0)}break}
  }
  if(ev!=='write'&&ev!=='roll')for(const x of D)x.justRolled=false;
  oracle(ev);
 }
 // ---- heal with an honest relay; removal stays in force (rem) -----------------------------------------------------
 relay.up=true;lyP=0;
 const liveDevs=()=>D.filter(x=>!x.dead&&!w.rem.has(x.id));
 const heal=(rounds=6)=>{for(let rnd=0;rnd<rounds;rnd++){for(const d of D){if(d.dead)continue;d.awake=true;d.alive=true;d.online=true}const L=liveDevs();for(let i=0;i<nd;i++)for(let j=i+1;j<nd;j++)w.linkUp.add(lk(i,j));
   for(const d of L)syncRelay(d);for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++)syncPair(L[i],L[j])}
   for(const d of liveDevs())gapCopies(d);
   const L=liveDevs();for(let rnd=0;rnd<3;rnd++){for(const d of L)syncRelay(d);for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++)syncPair(L[i],L[j])}};
 // everyone live learns of every removal (a removal is a signed entry that travels on every path); witnesses were taken at first learning
 for(const x of w.rem)for(const d of liveDevs())learn(d,x);
 heal();
 const fails=[];
 const chainRids=(d,c)=>chainOf(getChat(d,c)).chain.map(n=>n.rid);
 function check(prefix){ const live=liveDevs(); const allChats=new Set();for(const d of live)for(const c of d.chats.keys())allChats.add(c);
  const hh=holders();
  for(const d of live){const inChain=new Set();for(const c of d.chats.keys())for(const rid of chainRids(d,c))inChain.add(rid);
   for(const [rid,info] of w.shown){if(w.excused.has(rid))continue;
     // rule 16 / design 2.4 as decided (P-13 'as designed'): a removed device's reply that no honest device held when it learned of the removal stays void (hidden, KEPT) until the device is paired again; phase R2 checks it comes back as a copy
     if(w.rem.has(info.by)&&!liveDevs().some(x=>itemOk(x,info.by,'n'+rid)))continue;
     const h=hh.get(rid);const liveHold=h&&[...h].some(x=>x==='relay'||x.startsWith('live'));if(!liveHold)continue;
     if(!inChain.has(rid)){let orph=false;for(const ch of d.chats.values()){const n=ch.nodes.get(rid);if(n){let p=n;while(p&&p.parent!==null){const q=ch.nodes.get(p.parent);if(!q){orph=true;break}p=q}}}
       // a reply written by a device after its own removal, never held by anybody who learned of it, is void by design (rule 16)
       const it=w.items.get('n'+rid);if(it&&it.late&&!it.acc&&prefix==='')continue;
       fails.push(prefix+(orph?'ORPHAN':'P1')+' hidden rid '+rid+' on dev '+d.id)}}}
  for(const c of allChats){let ref=null;for(const d of live){if(!d.chats.has(c)){fails.push(prefix+'P2 chat '+c+' missing on '+d.id);continue}const s=chainRids(d,c).join(',');if(ref===null)ref=s;else if(ref!==s)fails.push(prefix+'P2 diverged '+c)}}}
 if(E.DBG1)console.log('PHASE1 rem',[...w.rem],'live',liveDevs().map(x=>x.id),'dead',D.filter(x=>x.dead).map(x=>x.id));
 check('');
 if(E.DBG1&&fails.length){for(const d of D){for(const [c,ch] of d.chats){const v=chainOf(ch);console.log('P1 dev',d.id,'wit',JSON.stringify([...d.wit].map(([x,s])=>[x,[...s]])),'chat',c,'rem',[...d.removed],'owner',ownerOf(d,c),'entries',JSON.stringify([...ch.entries.values()].map(e=>[e.eid,e.ctr,e.owner,e.start,e.prev,e.conf?'C':'',e.kind])),'nodes',[...ch.nodes.values()].map(n=>n.rid+'<'+n.parent+' i'+n.idx+' e'+n.te+' w'+n.writer).join(' '),'chain',v.chain.map(n=>n.rid).join(','))}}}
 // CUT: late items nobody honest held when learning must be on no chain / not the winner anywhere
 for(const [key,it] of w.items){if(!it.late||it.acc||!w.rem.has(it.by))continue;
   for(const d of liveDevs()){for(const [c,ch] of d.chats){const v=chainOf(ch);if(key[0]==='n'&&v.chain.some(n=>'n'+n.rid===key)){fails.push('CUT late line on chain dev '+d.id);if(E.DBG2)console.log('CUTL dev',d.id,'chat',c,key,JSON.stringify(it),'removed',[...d.removed],'wit',JSON.stringify([...d.wit].map(([x,s])=>[x,[...s]])),'nodes',[...ch.nodes.values()].map(n=>n.rid+'<'+n.parent+' e'+n.te+' w'+n.writer).join(' '),'chain',v.chain.map(n=>n.rid).join(','))}if(key[0]==='e'&&v.W&&'e'+v.W.eid===key){fails.push('CUT late entry wins dev '+d.id+' chat '+c);if(E.DBG2)console.log('CUT dbg dev',d.id,'removed',[...d.removed],'wit',JSON.stringify([...d.wit].map(([x,s])=>[x,[...s]])),'rem',[...w.rem],'item',key,JSON.stringify(it),'dead',d.dead,'entry',JSON.stringify(v.W))}}}}
 // unreachable marks at the end of phase 1 (counted, not a failure: rule 9 gives the way out)
 {const live=liveDevs();for(const [c,nt] of relay.notes){const mx=Math.max(0,...live.map(x=>x.chats.has(c)?chainOf(x.chats.get(c)).chain.length:0));if(nt.markN>mx){bump(stats,'unreachableMarkChats');w.um=true}}bump(stats,'chatsTotal',relay.notes.size)}
 // VAC: a chat whose owner was removed is freed (design 2.4 / 2.7 "Continue this chat here?"): a live device is never offered only a copy for it
 {const L=liveDevs();for(const [c] of [...(L[0]?L[0].chats:[])]){if(c.includes('~'))continue;const T=L[R(L.length)];if(!T.chats.has(c)||ownerOf(T,c)!==-2)continue;const res=tap(T,c,'chip');stats.vacChecked=(stats.vacChecked||0)+1;if(res==='copy')fails.push('VAC copy offered for a chat whose owner was removed '+c)}
  heal(6)}
 // R2: pair everybody again: what removed/dead-but-returning devices held must appear (as copies) and nothing is hidden
 {const dead=D.filter(x=>x.dead);void dead; w.rem.clear();relay.removed.clear();relay.wit.clear();for(const d of D){d.removed.clear();d.wit.clear()}
  const s0=fails.length;
  heal(8);check('R2-');}
 // ESC: on every chat any live device can continue in place without loss, whatever the mark says
 {const live=liveDevs();const base=[...new Set(live.flatMap(d=>[...d.chats.keys()].filter(c=>!c.includes('~'))))];
  for(const c of base){const T=live[R(live.length)];if(!T.chats.has(c))continue;if(ownerOf(T,c)!==T.id){const o=fall(T,c,null,{userPick:true,noUser:true});if(o!=='placed'&&o!=='moved')fails.push('ESC no way to continue '+c+' on '+T.id)}
     if(!write(T,c))stats.escNoWrite=(stats.escNoWrite||0)+1}
  heal(8);check('ESC-');}
 if(E.DBG&&fails.length){for(const d of D){for(const [c,ch] of d.chats){const v=chainOf(ch);console.log('dev',d.id,'chat',c,'rem',[...d.removed],'dead',d.dead,'owner',ownerOf(d,c));console.log('  entries',JSON.stringify([...ch.entries.values()].map(e=>[e.eid,e.ctr,e.owner,e.start,e.prev,e.conf?'C':'',e.kind])));console.log('  nodes',[...ch.nodes.values()].map(n=>n.rid+'<'+n.parent+' i'+n.idx+' e'+n.te+' w'+n.writer+(n.hk?'H':'')).join(' '));console.log('  chain',v.chain.map(n=>n.rid).join(','),'W',v.W&&v.W.eid)}}console.log(fails.join('\n'))}
 return {fails,w}}
const t0=Date.now();
for(let s=0;s<+N;s++){const seed=+S0+s;let res;try{res=run(seed)}catch(e){console.log('CRASH seed',seed,e.stack.split('\n').slice(0,4).join('|'));process.exit(1)}
 stats.sched++;const w=res.w;
 if(w.fail.LOSS){bump(stats.fail,'LOSS');(stats.failSeeds.LOSS||=[]).length<12&&stats.failSeeds.LOSS.push(seed);if(stats.examples.length<4)stats.examples.push({seed,msg:w.failMsg})}
 const seen=new Set();
 for(const f of res.fails){const k=f.split(' ')[0]+(f.startsWith('P2 diverged')||f.endsWith('diverged')?'-div':'');if(seen.has(k))continue;seen.add(k);bump(stats.fail,k);const a=(stats.failSeeds[k]||=[]);if(a.length<12)a.push(seed);if(stats.examples.length<8&&!stats.examples.some(e=>e.k===k))stats.examples.push({seed,k,msg:f})}
 if(w.um)bump(stats,'unreachMarkSched');if(w.dbl)bump(stats,'dblSched');if(w.stale)bump(stats,'staleSched');if(w.copyEver)bump(stats,'copySched');if(w.userCopy)bump(stats,'userCopySched');if(w.lateEver)bump(stats,'lateSched');
}
console.log(JSON.stringify({mix:MIX,relay:RM,seed0:+S0,n:+N,secs:(Date.now()-t0)/1000,variant:['NOCOPY','NOCUT','NOOVERRIDE','NOCACHE','NOGAP','NOINORDER','NOCHK','NOVACATE','OLDTIE','TWOREF'].filter(k=>E[k]).join('+')||'v2',...stats}));
