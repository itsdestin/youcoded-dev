// Internal opt-in source API only. No CLI, GPU-lane wiring or import-time launch.
import { fork } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositorPlan, COMPOSITOR_CAPS as CAPS, COMPOSITOR_DESCRIPTOR } from './supervised-compositor-policy.mjs';
import { authorizeCompositorExecutables, writeCompositorJson, verifyCompositorDirectories } from './supervised-compositor-linux.mjs';
import { assertProtocolEnvelope, PROTOCOL_CAPS } from './supervised-protocol.mjs';
import { observeChildRetirement } from './supervised-retirement.mjs';
import { SUPERVISOR_STOP_TIMEOUT_MS } from './supervised-launch-core.mjs';
function bounded(promise,ms,label) {
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Compositor ${label} timeout`)),ms);})]).finally(()=>clearTimeout(timer));
}
export class CompositorController {
  constructor(worker) {
    this.worker=worker;this.pending=new Map();this.nextId=1;this.receipt=null;this.stopping=null;this.descriptor=COMPOSITOR_DESCRIPTOR;
    this.retirement=observeChildRetirement(worker);
    let acknowledged,rejectAck;
    const ack=new Promise((ok,no)=>{acknowledged=ok;rejectAck=no;});
    const fail=reason=>{rejectAck(Error(reason));for(const p of this.pending.values())p.reject(Error(reason));this.pending.clear();};
    worker.on('message',message=>{
      try {
        assertProtocolEnvelope(message);
        if(!message || typeof message!=='object' || Object.keys(message).some(k=>!['fatal','id','result','error','event','final'].includes(k)))throw Error('Invalid worker envelope');
        if(message.fatal){fail(message.fatal);this.disconnect();return;}
        if(message.event?.type==='ready')acknowledged();
        if(message.final || message.event?.type==='retirement')this.receipt=message.final??message.event;
        if(message.id && this.pending.has(message.id)) {
          const p=this.pending.get(message.id);this.pending.delete(message.id);message.error?p.reject(Error(message.error)):p.resolve(message.result);
        }
      }catch{fail('Unsafe compositor response');this.disconnect();}
    });
    worker.on('error',e=>{fail(e.message);this.disconnect();});
    worker.on('disconnect',()=>fail('Compositor controller disconnected'));
    worker.on('exit',()=>{clearTimeout(this.watchdog);fail('Compositor worker exited');});
    this.watchdog=setTimeout(()=>this.disconnect(),CAPS.wallMs+2000);
    // Handle is already returned while this bounded promise waits. Rejection
    // disconnects into independent worker cleanup, never a child.kill fallback.
    this.ready=bounded(ack,3000,'acknowledgement').then(()=>{
      if(this.stopping)throw Error('Compositor stopped before start');
      return this.#request('start',6000);
    }).catch(error=>{this.disconnect();throw error;});
    this.ready.catch(()=>{});
  }
  disconnect(){if(this.worker.connected)this.worker.disconnect();}
  #request(type,ms=3000) {
    if(!['start','inspect','stop'].includes(type) || !this.worker.connected || this.receipt) return Promise.reject(Error('Compositor retired/disconnected or unsupported command'));
    if(this.pending.size>=PROTOCOL_CAPS.requests){this.disconnect();return Promise.reject(Error('Compositor request cap'));}
    const id=this.nextId++;
    const promise=new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      try {const message={id,type};assertProtocolEnvelope(message);this.worker.send(message,error=>{if(error){this.pending.delete(id);reject(error);this.disconnect();}});}
      catch(error){this.pending.delete(id);reject(error);this.disconnect();}
    });
    return bounded(promise,ms,type).catch(error=>{this.pending.delete(id);this.disconnect();throw error;});
  }
  inspect(...args) {
    if (args.length) return Promise.reject(Error('Inspection accepts no commands'));
    // WHY: four serial helpers plus bounded rollback exceed an ownership-only
    // request's 3-second timeout; worker lifetime/reserve remain authoritative.
    return this.ready.then(() => this.#request('inspect', 40000));
  }
  stop(...args) {
    if(args.length)return Promise.reject(Error('Stop accepts no PID/signal'));
    if(this.stopping)return this.stopping;
    this.stopping=(async()=>{
      // Stop can precede worker readiness. Do not wait for start or retry it.
      if(this.worker.connected && !this.receipt)await this.#request('stop',SUPERVISOR_STOP_TIMEOUT_MS).catch(()=>this.disconnect());
      const actual=await bounded(this.retirement.done,SUPERVISOR_STOP_TIMEOUT_MS,'actual retirement');
      clearTimeout(this.watchdog);
      if(!this.receipt?.cleanupConfirmed || actual.code!==0 || actual.signal || actual.error)throw Error('Compositor cleanup/actual retirement unconfirmed');
      return this.receipt;
    })();return this.stopping;
  }
}
export function startCompositorSupervisor(...args) {
  if(args.length)throw Error('Fixed compositor start accepts no binary/argv/environment');
  if(process.platform!=='linux')throw Error('Compositor supervisor is Linux-only');
  const receipts=authorizeCompositorExecutables();
  // Fresh reservation outside active files; short enough for Linux sun_path.
  const root=realpathSync(mkdtempSync('/tmp/perf-lab-compositor-'));
  const plan=compositorPlan(join(root,'reservation'));
  for(const path of [plan.runDir,plan.home,plan.config,plan.data,plan.cache,plan.runtime])mkdirSync(path,{mode:0o700});
  verifyCompositorDirectories(plan);
  const path=join(plan.runDir,'compositor-plan.json');writeCompositorJson(path,{plan,receipts});
  const worker=fork(fileURLToPath(new URL('./supervised-compositor-worker.mjs',import.meta.url)),[path],{cwd:plan.runDir,env:{PATH:'/usr/bin:/bin',HOME:plan.home,LANG:'C.UTF-8'},execArgv:[],detached:true,stdio:['ignore','ignore','ignore','ipc']});
  const handle=new CompositorController(worker);handle.reservation=plan.runDir;return handle;
}
