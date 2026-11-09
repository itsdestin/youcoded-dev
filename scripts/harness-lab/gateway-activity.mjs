// Content-free protocol receipts, keyed only by the gateway's durable reservation ID.
// Network/SSE delivery envelopes are not model cognition or continuous execution.
export function createGatewayActivity({clock,requestId,now=()=>performance.now(),limit=100000}){
 const record={schemaVersion:1,clock:{id:clock,kind:'monotonic-ms'},observation:{start:now(),end:null,status:'open'},receipts:[],dropped:0};
 const phases=new Map();let first=true,ended=false;
 const emit=(kind,data={})=>{
  if(record.receipts.length>=limit){record.dropped++;return;}
  record.receipts.push({kind,at:now(),scope:'parent',requestId,...data});
 };
 const phase=(kind,id,name)=>{if(!name)return;emit('phase-'+kind,{id,phase:name});};
 const close=()=>{for(const [id,name]of phases)phase('end',id,name);phases.clear();};
 const endRequest=status=>{if(!ended){ended=true;emit('request-end',{status});}};
 return {record,dispatch(){emit('request-start');},firstByte(){if(first){first=false;emit('first-byte');}},
  event(event,anthropic){
   if(anthropic){
    const id=String(event.index??0);
    const name=({'thinking':'reasoning-stream',text:'answer-stream',tool_use:'tool-argument-stream'})[event.content_block?.type];
    if(event.type==='content_block_start'&&name){
     phases.set(id,name);phase('start',id,name);
     const b=event.content_block;
     if(typeof b.text==='string'&&b.text.length||typeof b.thinking==='string'&&b.thinking.length||b.type==='tool_use'&&b.input&&Object.keys(b.input).length)phase('delta',id,name);
    }
    if(event.type==='content_block_delta'){
     const p=({'thinking_delta':'reasoning-stream',text_delta:'answer-stream',input_json_delta:'tool-argument-stream'})[event.delta?.type];
     const payload=event.delta?.thinking??event.delta?.text??event.delta?.partial_json;
     if(p&&typeof payload==='string'&&payload.length){if(!phases.has(id)){phases.set(id,p);phase('start',id,p);}phase('delta',id,p);}
    }
    if(event.type==='content_block_stop'&&phases.has(id)){phase('end',id,phases.get(id));phases.delete(id);}
    if(event.type==='message_stop')close();
   }else for(const choice of event.choices??[]){
    const d=choice.delta??{},prefix=String(choice.index??0);
    const observe=(id,name,present)=>{if(!present)return;if(!phases.has(id)){phases.set(id,name);phase('start',id,name);}phase('delta',id,name);};
    observe(prefix+':text','answer-stream',typeof d.content==='string'&&d.content.length>0);
    observe(prefix+':reasoning','reasoning-stream',typeof d.reasoning==='string'&&d.reasoning.length>0||typeof d.reasoning_content==='string'&&d.reasoning_content.length>0||Array.isArray(d.reasoning_details)&&d.reasoning_details.some(r=>r?.type==='reasoning.text'&&typeof r.text==='string'&&r.text.length>0||r?.type==='reasoning.summary'&&typeof r.summary==='string'&&r.summary.length>0));
    for(const call of d.tool_calls??[])observe(prefix+':tool:'+String(call.index??0),'tool-argument-stream',typeof call.function?.arguments==='string'&&call.function.arguments.length>0);
    if(choice.finish_reason!=null)close();
   }
  },terminal(){close();},endRequest,finish(status){endRequest(status);record.observation.end=now();record.observation.status=status;return record;}};
}
