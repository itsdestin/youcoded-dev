// WHY: ordinary disposable-profile Write permission removes CLI dialogs as a confound; this external gate must still veto that underlying allow.
export function register(on) {
  const events = [];
  let completed = 0;
  let started = false;
  on('turn.complete', ($, e, next) => { completed++; events.push({event:'turn.complete',reason:e.reason}); return next(e); });
  on('tool.check', {tool:'Write'}, async ($, e, next) => {
    const start = await $.clock.now();
    const underlying = await next(e);
    const name = e.input.file_path.split('/').pop().replace('.txt','');
    events.push({event:'underlying',name,underlying,realCall:!!e.tool_use_id,origin:next.origin,budget:next.budget.ms,remaining:next.budget.remainingMs});
    const port = await $.fs.read((await $.session.cwd())+'/approval-service.json');
    const service = JSON.parse(port);
    const url = name === 'approval-unreachable' ? service.unreachable : service.url+'/'+name;
    const response = await $.http.fetch(url);
    if(!response.ok)throw new Error('approval HTTP '+response.status);
    const decision = JSON.parse(response.text).decision;
    if(decision !== 'allow' && decision !== 'deny')throw new Error('invalid approval response');
    const returned = {decision,reason:'External '+name+' '+decision};
    events.push({event:'returned',name,returned,elapsedMs:(await $.clock.now())-start,remaining:next.budget.remainingMs});
    return returned;
  }).catch(($, e, next) => {
    const name = e.input.file_path.split('/').pop().replace('.txt','');
    const returned = {decision:'deny',reason:'Explicit external approval error denial: '+name};
    events.push({event:'catch-deny',name,error:next.error,called:next.called,returned});
    return returned;
  });
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    if(started)return result;
    started=true;
    $.clock.after(1200,async()=>{
      const rows=[];
      const file=(await $.session.cwd())+'/approval-mod-report.json';
      try {
        const config=await $.config.list();
        events.push({event:'config-permission-inspection',rows:config.filter(r=>/permission|mode/i.test(r.key+' '+r.label))});
        for(const name of ['approval-allow12','approval-deny','approval-unreachable','approval-disconnect']){
          const goal=completed+1;
          const time=await $.clock.now();
          const result=await $.prompt.submit({text:name,asUser:true});
          for(let n=0;n<450&&completed<goal;n++)await $.clock.sleep(100);
          rows.push({name,result,elapsedMs:(await $.clock.now())-time,completed:completed>=goal});
          await $.fs.write(file,JSON.stringify({rows,events,done:false}));
          if(completed<goal)throw new Error('turn.complete timeout');
        }
      }catch(error){rows.push({error:String(error)});}
      await $.fs.write(file,JSON.stringify({rows,events,done:true}));
    });
    return result;
  });
}
