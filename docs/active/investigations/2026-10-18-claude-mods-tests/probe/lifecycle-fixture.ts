// WHY: bounded polling accepts only explicit decisions and only the named disposable files; errors deny even when core would ask.
export function register(on) {
  let started=false,completed=0; const events=[];
  on('turn.complete',($,e,next)=>{completed++;events.push({event:'complete',reason:e.reason});return next(e);});
  on('tool.check',{tool:'Write'},async($,e,next)=>{
    const cwd=await $.session.cwd(),underlying=await next(e),name=e.input.file_path.split('/').pop();
    if(e.input.file_path!==cwd+'/'+name||!['stall.txt','malformed.txt','recovered.txt','poll.txt'].includes(name))return {decision:'deny',reason:'Outside synthetic lifecycle scope'};
    const meta=JSON.parse(await $.fs.read(cwd+'/lifecycle-service.json')),start=await $.clock.now();
    events.push({event:'underlying',name,underlying,start,remaining:next.budget.remainingMs,toolUseId:e.tool_use_id});
    for(let attempt=0;attempt<4;attempt++){
      const response=await $.http.fetch(meta.url+'/'+name+'?attempt='+attempt);
      const reply=JSON.parse(response.text);
      events.push({event:'response',name,attempt,reply,elapsedMs:(await $.clock.now())-start,remaining:next.budget.remainingMs});
      if(!response.ok)throw Error('HTTP '+response.status);
      if(reply.decision==='allow'||reply.decision==='deny')return {decision:reply.decision,reason:'Explicit synthetic lifecycle '+reply.decision};
      if(name==='poll.txt'&&reply.pending===true&&attempt<3)continue;
      throw Error('Missing valid explicit decision');
    }
    return {decision:'deny',reason:'Bounded attempts exhausted'};
  }).catch(($,e,next)=>{events.push({event:'catch-deny',name:e.input.file_path.split('/').pop(),error:next.error});return {decision:'deny',reason:'Explicit lifecycle catch denial'};});
  on('session.start',async($,e,next)=>{
    const result=await next(e);if(started)return result;started=true;
    $.clock.after(1200,async()=>{
      const cwd=await $.session.cwd(),meta=JSON.parse(await $.fs.read(cwd+'/lifecycle-service.json')),rows=[];
      const save=async(done)=>$.fs.write(cwd+'/lifecycle-report-'+meta.phase+'.json',JSON.stringify({handshake:true,id:await $.session.id(),version:await $.session.version(),phase:meta.phase,events,rows,done}));
      await save(false);
      try{
        for(const prompt of meta.prompts){
          const goal=completed+1,start=await $.clock.now(),result=await $.prompt.submit({text:prompt,asUser:true});
          for(let n=0;n<600&&completed<goal;n++)await $.clock.sleep(100);
          rows.push({prompt,result,elapsedMs:(await $.clock.now())-start,completed:completed>=goal});
          if(completed<goal)throw Error('Bounded turn timeout');
        }
        rows.push({messages:await $.session.messages()});
      }catch(error){rows.push({error:String(error)});}
      await save(true);
    });return result;
  });
}
