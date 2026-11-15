// Reviewer's roster/removal check. usage: node roster.mjs <seed0> <count> <variant: V1|V2> <relayMode: honest|none|lying>
const [,, S0='1',N='1000',VAR='V1',RM='honest']=process.argv;
function rngf(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const st={n:0,honestLost:0,thiefIn:0,diverge:0,allGone:0,stashKill:0,runsWithStash:0,thiefFirstWins:0,blockedRemoval:0};
function run(seed){const rng=rngf(seed);const R=n=>Math.floor(rng()*n),P=p=>rng()<p;
 const n=3+R(3),X=n-1;const ids=[...Array(n).keys()];
 const mk=()=>({step:0,mem:new Set(ids),log:[]});
 const D=ids.map(mk);const relay=mk();let relayUp=RM!=='none';
 let eid=0;const E=(step,signer,target)=>({id:eid++,step,signer,target,conf:false});
 const apply=(s,e)=>{if(e.step!==s.step||!s.mem.has(e.signer)||!s.mem.has(e.target))return false;s.mem.delete(e.target);s.step++;s.log.push(e);return true};
 const stash=E(0,X,R(n-1)); // thief pre-signs "X removes honest H" at the start; released later
 let stashLive=true;let honestDone=false;let hEntry=null;let afterConf=false,afterLocal=false;const lyP=RM==='lying'?0.5:0;
 const net=ids.map(()=>true);const can=(d)=>relayUp&&net[d];
 function relaySubmit(e,d=0){if(!can(d))return false;if(lyP&&P(lyP)&&P(0.5))return false; // withheld/refused
   const ok=apply(relay,{...e});if(ok){relay.log[relay.log.length-1].conf=true;e.conf=true}return ok}
 function pullRelay(d,di){if(!can(di))return;const dl=d;// V1: relay-confirmed overrides
   if(VAR==='V1'){let i=0;while(i<dl.log.length&&i<relay.log.length&&dl.log[i].id===relay.log[i].id)i++;
     if(i<relay.log.length&&(i>=dl.log.length||!dl.log[i].conf)){dl.log.length=i;dl.mem=new Set(ids);dl.step=0;for(const e of dl.log)apply(dl,e);for(let k=i;k<relay.log.length;k++){apply(dl,{...relay.log[k]})}}}
   else{for(const e of relay.log)if(!dl.log.some(x=>x.id===e.id)){if(!apply(dl,{...e})){/*conflict: apply anyway as both-stand*/dl.mem.delete(e.target);dl.step=Math.max(dl.step,e.step+1);dl.log.push(e)}}}}
 function pushRelay(d,di){for(const e of d.log)if(!e.conf&&!relay.log.some(x=>x.id===e.id))relaySubmit(e,di)}
 function meet(a,b){ // direct meeting: adopt entries; conflicts per variant
   const A=D[a],B=D[b];if(!A.mem.has(b)&&0)return;
   const union=new Map();for(const e of [...A.log,...B.log])union.set(e.id,e);
   // rebuild: order by step then id; same-step conflicts
   const all=[...union.values()].sort((x,y)=>x.step-y.step||x.id-y.id);
   const rebuild=(d)=>{d.mem=new Set(ids);d.step=0;d.log=[];let i=0;while(i<all.length){const s=all[i].step;const grp=all.filter(e=>e.step===s);i+=grp.length;if(s!==d.step&&s>d.step){/*gap*/}
       let chosen=grp.slice();if(VAR==='V1'&&grp.some(e=>e.conf))chosen=grp.filter(e=>e.conf);
       // same-step entries: mutual removal both stand; otherwise lowest id
       const ok=[];for(const e of chosen){if(d.mem.has(e.signer)||ok.some(o=>o.target===e.signer))ok.push(e)}
       let first=true;for(const e of ok){if(!first){ // second entry at same step stands only if mutual
           const o=ok[0];if(!(o.target===e.signer&&e.target===o.signer))continue}
         first=false;d.mem.delete(e.target)}
       if(ok.length){d.step=s+1;d.log.push(...ok.filter((e,ix)=>ix===0||(ok[0].target===e.signer&&e.target===ok[0].signer)))}}};
   rebuild(A);rebuild(B);}
 for(let t=0;t<30;t++){const ev=R(10);const d=R(n);
  if(ev<2&&d!==X){pullRelay(D[d],d);if(can(d))pushRelay(D[d],d)}
  else if(ev<3&&d!==X){const o=R(n);if(o!==d)meet(d,o)}
  else if(ev<4){if(RM!=='none'&&P(0.5))net[d]=!net[d]}
  else if(ev<6&&!honestDone&&d!==X&&D[d].mem.has(X)){const e=E(D[d].step,d,X);if(apply(D[d],e)){honestDone=true;hEntry=e;relaySubmit(e,d)}}
  else if(ev<8&&stashLive){ // release stash to a random device directly or to relay
     const to=R(n);if(to===X)continue;if(honestDone){if(hEntry.conf)afterConf=true;else afterLocal=true}if(P(0.5)&&can(X)){const e={...stash};relaySubmit(e,X);stashLive=false}else{if(apply(D[to],{...stash}))stashLive=false}}
  else if(ev<9&&!process.env.NOFRESH&&D[X].mem.has(X)){ // thief tries a fresh removal on its own view
     const e=E(D[X].step,X,R(n-1));if(apply(D[X],e))relaySubmit(e,X)}
 }
 // heal: relay up honest (if relay exists), everybody pulls/pushes and meets
 if(RM!=='none'){relayUp=true;net.fill(true)}
 for(let r=0;r<4;r++){for(let d=0;d<n;d++){if(RM!=='none'){pushRelay(D[d],d);pullRelay(D[d],d)}}for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)meet(a,b)}
 const fin=D[0];const lost=[];for(let i=0;i<n-1;i++)if(!fin.mem.has(i))lost.push(i);
 let div=false;for(const d of D.slice(0,n-1))if([...d.mem].sort().join()!==[...fin.mem].sort().join())div=true;
 st.n++;if(div)st.diverge++;
 if(!honestDone||!(afterConf||afterLocal))return;
 const cat=afterConf?'honestRemovalConfirmedThenStash':'honestRemovalLocalThenStash';
 st[cat]=(st[cat]||0)+1;if(lost.length)st[cat+'_honestLost']=(st[cat+'_honestLost']||0)+1;if(fin.mem.has(X))st[cat+'_thiefStillIn']=(st[cat+'_thiefStillIn']||0)+1;
}
for(let s=0;s<+N;s++)run(+S0+s);
console.log(JSON.stringify({VAR,RM,...st}));
