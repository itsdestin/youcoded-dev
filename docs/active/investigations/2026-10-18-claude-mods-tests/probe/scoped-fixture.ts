// WHY: record actual model-facing context separately from unchanged submitted user text; no profile hooks.
export function register(on) {
  let started=false, completed=0, active='', mode=''; const events=[];
  on('prompt.submit',($,e,next)=>{events.push({event:'submit-hook',text:e.text,origin:e.origin});return next(mode==='submit'?{...e,context:[...(e.context??[]),'SCOPED_SUBMIT_CONTEXT_73']}:e);});
  // WHY: context may be eagerly cached before session.start's timer; load the immutable session fixture here, not from timer state.
  on('prompt.context',async($,e,next)=>{const meta=JSON.parse(await $.fs.read((await $.session.cwd())+'/scoped-meta.json')),r=await next(e);events.push({event:'context-hook',mode:meta.mode});return meta.mode==='context'||meta.mode==='installed'?{...r,blocks:[...r.blocks,{name:'scopedApplication',text:'SCOPED_APP_CONTEXT_73'}]}:r;});
  on('turn.start',($,e,next)=>{active=e.turnId;events.push({event:'start',data:e});return next(e);});
  on('turn.complete',($,e,next)=>{completed++;events.push({event:'complete',data:e});return next(e);});
  on('session.measure',($,e,next)=>{events.push({event:'measure',data:e});return next(e);});
  on('tool.check',async($,e,next)=>e.tool.startsWith('mcp__')?{decision:'allow',reason:'Only inert synthetic MCP tools exposed'}:next(e));
  on('session.start',async($,e,next)=>{
    const r=await next(e);if(started)return r;started=true;
    $.clock.after(2000,async()=>{
      const cwd=await $.session.cwd(),meta=JSON.parse(await $.fs.read(cwd+'/scoped-meta.json'));mode=meta.mode;const rows=[];
      const save=async(done)=>$.fs.write(cwd+'/scoped-report.json',JSON.stringify({handshake:true,version:await $.session.version(),id:await $.session.id(),mode,events,rows,done}));
      await save(false);
      try {
        rows.push({stage:'before',usage:await $.session.usage()});
        const goal=completed+1;rows.push({submitted:meta.text,result:await $.prompt.submit({text:meta.text,asUser:true})});
        if(mode==='abort'){for(let n=0;n<100&&!active;n++)await $.clock.sleep(100);await $.clock.sleep(700);rows.push({abort:active,result:await $.turn.abort({turnId:active})});}
        for(let n=0;n<240&&completed<goal;n++)await $.clock.sleep(100);
        rows.push({completed:completed>=goal,stage:'after',usage:await $.session.usage(),messages:await $.session.messages()});
      }catch(error){rows.push({error:String(error)});}
      await save(true);
    });return r;
  });
}
