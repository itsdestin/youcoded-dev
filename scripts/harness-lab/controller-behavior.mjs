// Host-only journal composer. stdin comes from controller_behavior.py, never an
// agent import. The protected callback journal, not a hash of raw, is authorship.
import {createBehaviorCollector} from './behavior-evidence.mjs';
import {collectOwnedNative} from './native-behavior.mjs';
let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>64*1024*1024)throw Error('Controller behavior bound');}
const {identity,raw,callbacks,agentObservations}=JSON.parse(text);
// Host callbacks preserve their host monotonic observation time, not the time
// this post-run composer happens to serialize them. No cross-clock subtraction.
let observedAt=callbacks[0]?.at??0;
const c=createBehaviorCollector(identity,{clock:()=>observedAt});
// The final answer existed before post-run verifier callbacks. Fence it BEFORE
// executions so a later semantic assessment cannot use those exits retroactively.
const count=(raw.events??raw.steps??[]).length;
c.checkpoint({id:'answer',start:0,end:count});
for(const [i,event] of callbacks.entries()){
 if(!Number.isFinite(event.at)||event.at<observedAt)throw Error('Host callback clock order');
 observedAt=event.at;
 if(event.type==='checkpoint')continue;
 const row={...event.row,id:`host-${i}`,checkpointId:'answer',reference:event.reference};
 if(event.type==='execution')await c.execute(row,async()=>({exitCode:row.exitCode}));
 else if(['input','safety'].includes(event.type))c[event.type](row);
 else if(event.type==='native-profile')collectOwnedNative(c,raw,event.row);
 else throw Error('Unsupported host behavior callback');
}
const envelope=c.finish(raw);
// These are explicitly NON-authoritative. No SDK/permission/continuation event
// originating in the submitted interpreter/container enters c's trusted rows.
envelope.agentObservations=agentObservations;
envelope.producer={kind:'host-trial-controller',semanticLabels:'missing',internalRegistries:'missing',recoveryTriggers:'partial',inputs:'host callbacks only; not inferred from transcript',limits:[
 'Post-run verifier invocations are host-observed exits, not assistant test/shell execution or a complete recovery-trigger monitor.',
 'Agent-container SDK/request, permission and continuation records remain untrusted observations; they cannot establish human inputs or safety.',
 'Ordinary native SDK/decision/tool/recovery-rerun/shell/scheduler callbacks are reported as runtime-observed telemetry, not controller-verified or validated-semantic authority.',
 'Native background Bash completion, notice injection and subsequent tools are observed. Useful-work/no-nudge verdicts require independent defined fixture outputs; controller-protocol shell controls remain separate.',
 'Ordinary tasks have no automatic fixture semantic labels or complete internal registries. False waiting, false verification and premature-stop assessments remain unknown.'
]};
process.stdout.write(JSON.stringify(envelope));
