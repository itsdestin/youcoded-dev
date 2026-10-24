// Explicit observed resources, not Node private _closesGot mutation. Node 26's
// parent-initiated IPC disconnect can omit aggregate ChildProcess 'close'. Keep
// every actual requirement: child exit, channel disconnect, all configured pipes.
export function observeChildRetirement(child) {
 let exited=false,code=null,signal=null,ipcDisconnected=child.connected===false,aggregateCloseObserved=false,error=null,complete=false;
 const pipes=[...new Set(['stdin','stdout','stderr'].map(k=>child[k]).filter(Boolean))];
 const closed=new Set(pipes.filter(p=>p.closed===true)),removers=[];
 let resolve;const done=new Promise(r=>resolve=r);
 const snapshot=()=>({complete,exited,code,signal,ipcDisconnected,pipesClosed:closed.size===pipes.length,aggregateCloseObserved,error});
 const dispose=()=>{for(const off of removers.splice(0))off();};
 const update=()=>{if(!complete&&exited&&ipcDisconnected&&closed.size===pipes.length){complete=true;const result=snapshot();dispose();resolve(result);}};
 const on=(emitter,event,fn)=>{emitter.on(event,fn);removers.push(()=>emitter.off(event,fn));};
 on(child,'error',e=>{error??=e.message;});
 on(child,'exit',(c,s)=>{exited=true;code=c;signal=s;update();});
 on(child,'disconnect',()=>{ipcDisconnected=true;update();});
 on(child,'close',()=>{aggregateCloseObserved=true;});
 for(const pipe of pipes){on(pipe,'close',()=>{closed.add(pipe);update();});on(pipe,'error',e=>{error??=e.message;});}
 return {done,snapshot,dispose};
}
