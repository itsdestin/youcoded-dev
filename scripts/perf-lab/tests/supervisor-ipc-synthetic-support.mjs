// TEST ONLY support; not imported by production launcher/worker. No spawn API.
import { sendFinalAndDisconnect } from '../supervised-protocol.mjs';
export function authorizeSyntheticInvocation(env,argv) {
  if(env.PERF_LAB_SYNTHETIC_IPC!=='1' || process.platform!=='linux')throw Error('explicit Linux PERF_LAB_SYNTHETIC_IPC=1 required');
  if(argv.length===2 && !env.PERF_LAB_SYNTHETIC_IPC_WORKER)return 'controller';
  if(argv.length===3 && argv[2]==='--fixed-worker' && env.PERF_LAB_SYNTHETIC_IPC_WORKER==='1')return 'worker';
  throw Error('fixed test-only invocation required; no binary/argument overrides');
}
export async function finishSyntheticRetirement({session,reason,detach,save,channel,send,timers}) {
  const receipt=await session.stop(reason);
  detach();save(receipt);
  sendFinalAndDisconnect(channel,send,{final:receipt},timers);
  return receipt;
}
