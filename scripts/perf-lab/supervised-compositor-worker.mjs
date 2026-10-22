// Private worker entry only. Importing this module never launches anything.
import { openSync, closeSync, writeSync, constants, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { CompositorSession, fitRetirementReceipt } from './supervised-compositor-core.mjs';
import { validateCompositorPlan, COMPOSITOR_CAPS as CAPS } from './supervised-compositor-policy.mjs';
import { makeCompositorLinuxAdapters, reauthorizeCompositorExecutables, verifyCompositorDirectories } from './supervised-compositor-linux.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { assertProtocolEnvelope, makeBoundedSender, sendFinalAndDisconnect } from './supervised-protocol.mjs';
import { bindSupervisorProtocol } from './supervised-launch-worker.mjs';
export function compositorOutputBudget(finish) {
  let bytes=0,helperBytes=0,failed=false;
  const tails = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  const retain = (name, data) => {
    if (!['stdout', 'stderr'].includes(name)) throw Error('Unknown compositor output stream');
    // WHY: counts alone discarded the first failure's diagnostic output. Retain
    // only private synthetic child output, at most 4 KiB per stream (8 total).
    // This also bounds JSON escaping below the existing evidence envelope cap.
    tails[name] = Buffer.concat([tails[name], data.subarray(-4096)]).subarray(-4096);
  };
  const output = (name,data)=>{
    if(failed)return;
    retain(name, data);
    bytes+=data.length;
    if(bytes>CAPS.stdioBytes){failed=true;void finish('stdio-byte-cap');}
  };
  // Helper caps remain independently enforced by their existing collector.
  output.retainHelper = (name, data) => { helperBytes += data.length; retain(name, data); };
  output.snapshot = () => ({ bytes, helperBytes, capped: failed, ...Object.fromEntries(
    Object.entries(tails).map(([name, buffer]) => {
      let text = buffer.toString('utf8');
      while (Buffer.byteLength(text) > 4096) text = text.slice(1);
      return [name, text];
    })) });
  return output;
}
// Shared by the actual worker finish handler and offline handle-order tests.
export async function finishCompositorWorker({session,reason,channel,send,persist,closeEvidence,detach,finalOptions}) {
  let receipt;
  try {receipt=await session.stop(reason);}
  catch(error){receipt={cleanupConfirmed:false,reason,error:String(error.message).slice(0,1024)};}
  if (session.deps?.outputSnapshot) {
    const { bytes, helperBytes, capped, stdout, stderr } = session.deps.outputSnapshot();
    receipt.output = { bytes, helperBytes, capped, scope: 'private-compositor-and-helpers', tailEvidence: 'compositor-output-tail',
      retainedBytes: Buffer.byteLength(stdout) + Buffer.byteLength(stderr) };
    // Keep tails in private evidence, not the already bounded final IPC receipt.
    try {
      for (const [stream, text] of Object.entries({ stdout, stderr })) persist({ type: 'compositor-output-tail', stream, text });
    } catch (error) { receipt.cleanupConfirmed = false; receipt.output.evidenceError = String(error.message).slice(0, 512); }
  }
  // WHY: output/localResources are appended after stop(); re-fit so the final envelope and the
  // retirement-local-resources row can never exceed the bounded budget and veto the receipt.
  receipt = fitRetirementReceipt(receipt);
  session.receipt=receipt; // retain failure evidence BEFORE destroying any handle
  detach();
  try {
    receipt.localResources=session.gate?session.gate.disposeLocal():{status:'no-child-acquired',pipeDestroyRequests:0,childUnrefRequested:false,errors:[]};
    if(receipt.localResources.errors.length)receipt.cleanupConfirmed=false;
  }catch(error){receipt.cleanupConfirmed=false;receipt.localResources={status:'local-disposal-failed',errors:[String(error.message).slice(0,512)]};}
  // WHY: disposal is local resource release, not proof the writer/process exited.
  // Preserve family/pipe errors and flush a final evidence row before IPC drops.
  receipt=fitRetirementReceipt(receipt);session.receipt=receipt;
  try {persist({type:'retirement-local-resources',...receipt});}
  catch(error){receipt.cleanupConfirmed=false;receipt.evidenceError=String(error.message).slice(0,512);}
  try {closeEvidence();}catch(error){receipt.cleanupConfirmed=false;receipt.evidenceCloseError=String(error.message).slice(0,512);}
  channel.exitCode=receipt.cleanupConfirmed?0:2;
  sendFinalAndDisconnect(channel,send,{final:receipt},finalOptions);
  return receipt;
}
export async function runCompositorWorker(planPath) {
  if(process.platform!=='linux' || typeof process.send!=='function' || process.argv.length!==3)throw Error('Private compositor worker IPC required');
  const raw=JSON.parse(readBoundedText(planPath,{maxBytes:65536}));assertProtocolEnvelope(raw);
  if(!raw || Object.keys(raw).sort().join(',')!=='plan,receipts')throw Error('Invalid compositor worker plan');
  const plan=validateCompositorPlan(raw.plan);
  if(resolve(planPath)!==join(plan.runDir,'compositor-plan.json'))throw Error('Plan outside private reservation');
  verifyCompositorDirectories(plan);
  const st=lstatSync(planPath);if(!st.isFile() || st.isSymbolicLink() || st.uid!==process.getuid() || (st.mode&0o077))throw Error('Untrusted compositor plan file');
  const receipts=reauthorizeCompositorExecutables(raw.receipts);
  const fd=openSync(join(plan.runDir,'compositor-evidence.jsonl'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  let bytes=0,records=0,stopping=false,timer,busy=false,detach=()=>{};
  const send=makeBoundedSender(process,reason=>{void finish(reason);});
  const persist=row=>{
    assertProtocolEnvelope(row);const data=Buffer.from(JSON.stringify(row)+'\n');
    if(++records>CAPS.evidenceRecords || bytes+data.length>CAPS.evidenceBytes)throw Error('Compositor evidence cap');
    bytes+=data.length;
    for(let offset=0;offset<data.length;){const n=writeSync(fd,data,offset,data.length-offset);if(n<=0)throw Error('Evidence short write');offset+=n;}
  };
  const output=compositorOutputBudget(finish);
  const session=new CompositorSession(plan,makeCompositorLinuxAdapters(plan,receipts,{persist,emit:event=>send({event}),output}));
  async function finish(reason) {
    if(stopping)return;stopping=true;clearInterval(timer);
    await finishCompositorWorker({session,reason,channel:process,send,persist,closeEvidence:()=>closeSync(fd),detach});
  }
  detach=bindSupervisorProtocol(process,session,{finish,send,isStopping:()=>stopping});
  timer=setInterval(()=>{
    if(busy || stopping)return;busy=true;
    void session.tick().then(()=>{if(session.receipt)void finish(session.receipt.reason);},error=>{void finish(`monitor-error: ${String(error.message).slice(0,512)}`);}).finally(()=>{busy=false;});
  },CAPS.pollMs);
  if(!process.connected){await finish('controller-disconnected-before-ready');return;}
  try{session.ready();}catch(error){await finish(`ready-error: ${String(error.message).slice(0,512)}`);}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))runCompositorWorker(process.argv[2]).catch(error=>{
  process.exitCode=2;const send=makeBoundedSender(process,()=>{});sendFinalAndDisconnect(process,send,{fatal:String(error.message).slice(0,1024)});
});
