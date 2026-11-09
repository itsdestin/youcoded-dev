// WHY: each control has its own caught step, and approval only grants the two named synthetic files after core returns ask.
export function register(on) {
  let started=false, completed=0;
  const events=[];
  on('turn.complete',($,e,next)=>{completed++;events.push({event:'turn.complete',reason:e.reason});return next(e);});
  on('tool.check',{tool:'Write'},async($,e,next)=>{
    const underlying=await next(e);
    events.push({event:'underlying',input:e.input,underlying,realCall:!!e.tool_use_id});
    const cwd=await $.session.cwd();
    if(underlying.decision!=='ask')return underlying;
    if(![cwd+'/external-allow.txt',cwd+'/external-deny.txt'].includes(e.input.file_path))return underlying;
    const service=JSON.parse(await $.fs.read(cwd+'/control-service.json'));
    const response=await $.http.fetch(service.url+'/'+e.input.file_path.split('/').pop());
    const reply=JSON.parse(response.text);
    if(!response.ok||!['allow','deny'].includes(reply.decision))return {decision:'deny',reason:'Invalid synthetic external response'};
    const returned={decision:reply.decision,reason:'Explicit synthetic external '+reply.decision+' for this one disposable file'};
    events.push({event:'external-return',path:e.input.file_path,returned});return returned;
  }).catch(()=>({decision:'deny',reason:'Synthetic approval error: fail closed'}));
  on('session.start',async($,e,next)=>{
    const result=await next(e);if(started)return result;started=true;
    $.clock.after(1200,async()=>{
      const cwd=await $.session.cwd(),rows=[];
      const metadata=JSON.parse(await $.fs.read(cwd+'/control-service.json'));
      const save=async(done=false)=>$.fs.write(cwd+'/control-report.json',JSON.stringify({rows,events,done}));
      const snapshot=async()=>({rows:await $.config.list(),model:await $.session.model(),settings:await $.fs.read(metadata.settings)});
      async function step(name,fn){try{rows.push({name,ok:true,value:await fn()});}catch(error){rows.push({name,ok:false,error:String(error)});}await save();}
      await step('baseline',async()=>({version:await $.session.version(),id:await $.session.id(),state:await snapshot(),commands:await $.command.list()}));
      await step('mode-plan',async()=>({result:await $.config.set({key:'permissionMode',value:'plan'}),state:await snapshot()}));
      await step('mode-default',async()=>({result:await $.config.set({key:'permissionMode',value:'default'}),state:await snapshot()}));
      await step('effort-low',async()=>({result:await $.command.run({command:'effort',args:'low'}),state:await snapshot()}));
      await step('rename',async()=>({title:metadata.title,result:await $.command.run({command:'rename',args:metadata.title}),id:await $.session.id(),state:await snapshot()}));
      for(const name of ['external-allow','external-deny'])await step(name,async()=>{
        const count=completed+1,result=await $.prompt.submit({text:'Synthetic '+name+' harmless temporary Write probe',asUser:true});
        for(let n=0;n<180&&completed<count;n++)await $.clock.sleep(100);
        return {result,completed:completed>=count,messages:await $.session.messages(),state:await snapshot()};
      });
      await save(true);
    });return result;
  });
}
