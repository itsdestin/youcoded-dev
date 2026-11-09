// WHY: this disposable fixture distinguishes permission decisions, replacement results, and actual engine state; every answer comes from an explicitly synthetic localhost service.
const mode=async($)=>(await $.config.list()).find(r=>r.key==='permissionMode');
const save=async($,cwd,events,completed,turnId,done=false)=>$.fs.write(cwd+'/interaction-report.json',JSON.stringify({events,completed,turnId,done,id:await $.session.id(),mode:await mode($),messages:await $.session.messages()}));
export function register(on) {
  let started=false, turnId='', completed=0, pending=false;
  const events=[];
  let cwd='', meta;
  on('turn.start',($,e,next)=>{turnId=e.turnId;events.push({event:'turn.start',input:e});return next(e);});
  on('turn.complete',async($,e,next)=>{completed++;events.push({event:'turn.complete',input:e,mode:await mode($),id:await $.session.id()});return next(e);});
  on('tool.check',async($,e,next)=>{
    const base=await next(e);
    events.push({event:'check',input:e,base,mode:await mode($)});
    if(e.tool==='Write'&&e.input.file_path.endsWith('/post-plan.txt'))return {decision:'deny',reason:'Synthetic safety veto after observing post-plan base policy'};
    if(e.tool==='Write'&&meta.name.startsWith('plan-'))return base;
    if(!['AskUserQuestion','EnterPlanMode','ExitPlanMode','Write'].includes(e.tool))return base;
    pending=true;await save($,cwd,events,completed,turnId);
    const response=await $.http.fetch(meta.url+'/check/'+e.tool+'/'+e.tool_use_id);
    const reply=JSON.parse(response.text);
    if(!response.ok||!['allow','deny'].includes(reply.decision))return {decision:'deny',reason:'Invalid synthetic response'};
    events.push({event:'external-check',tool:e.tool,reply,turnId});await save($,cwd,events,completed,turnId);
    return {decision:reply.decision,reason:'Explicit synthetic '+reply.decision};
  }).catch(($,e,next)=>({decision:'deny',reason:'Synthetic fail-closed check error'}));
  on('tool.call',async($,e,next)=>{
    events.push({event:'call-before',input:e,mode:await mode($),id:await $.session.id()});
    await save($,cwd,events,completed,turnId);
    if((['question-replace','question-structured','question-free'].includes(meta.name)&&e.tool==='AskUserQuestion')||(meta.name==='plan-replace'&&e.tool==='ExitPlanMode')){
      const response=await $.http.fetch(meta.url+'/answer');const reply=JSON.parse(response.text);
      if(!response.ok||reply.synthetic!==true)return {deny:'Missing explicit synthetic answer'};
      const result=e.tool==='AskUserQuestion'?{questions:e.questions,answers:reply.answers,response:reply.response}:{plan:reply.plan,isAgent:false};
      events.push({event:'replacement',tool:e.tool,reply,result,mode:await mode($)});await save($,cwd,events,completed,turnId);
      return {result};
    }
    const result=await next(e);
    events.push({event:'call-after',tool:e.tool,result,mode:await mode($),id:await $.session.id()});await save($,cwd,events,completed,turnId);
    return result;
  }).catch(($,e,next)=>next.called?next(e):{deny:'Synthetic replacement error'});
  on('session.start',async($,e,next)=>{
    const result=await next(e);if(started)return result;started=true;
    $.clock.after(900,async()=>{
      cwd=await $.session.cwd();meta=JSON.parse(await $.fs.read(cwd+'/interaction-service.json'));
      try{
        events.push({event:'baseline',mode:await mode($),id:await $.session.id(),commands:await $.command.list()});await save($,cwd,events,completed,turnId);
        await $.prompt.submit({text:'Synthetic isolated '+meta.name,asUser:true});
        if(meta.name==='cancel-late'||meta.name==='reload-pending'){
          for(let n=0;n<100&&!pending;n++)await $.clock.sleep(100);
          if(!pending)throw Error('No pending check observed');
          await $.clock.sleep(300);
          if(meta.name==='cancel-late'){
            const addressed=turnId;await $.turn.abort({turnId:addressed});events.push({event:'aborted',addressed});await save($,cwd,events,completed,turnId);
            await $.prompt.submit({text:'Synthetic new turn after addressed abort',asUser:true});
          }else{
            events.push({event:'reload-requested'});await save($,cwd,events,completed,turnId);
            const reload=await $.command.run({command:'reload-plugins'});events.push({event:'reload-returned',reload});await save($,cwd,events,completed,turnId);
          }
        }
        for(let n=0;n<160&&completed<(meta.name==='cancel-late'?2:1);n++)await $.clock.sleep(100);
        events.push({event:'bounded-observation-ended'});
      }catch(error){events.push({event:'fixture-error',error:String(error)});}
      await save($,cwd,events,completed,turnId,true);
    });return result;
  });
}
