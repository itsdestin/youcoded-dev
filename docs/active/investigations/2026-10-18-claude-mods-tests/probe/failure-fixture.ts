// WHY: the fake model requests only harmless Write calls inside this disposable project; failure paths must be checked against actual filesystem effects.
export function register(on) {
  const events = [];
  let completed = 0;
  let started = false;
  on('turn.complete', ($, e, next) => { completed++; events.push({event:'turn.complete',reason:e.reason}); return next(e); });
  on('tool.call', {tool:'Write',file_path:/failure-open[.]txt$/}, ($, e, next) => {
    events.push({event:'throw-before-next',path:e.file_path,budget:next.budget.ms});
    throw new Error('ordinary failure-open observer probe');
  });
  on('tool.call', {tool:'Write',file_path:/failure-deny[.]txt$/}, ($, e, next) => {
    events.push({event:'throw-before-next-deny',path:e.file_path});
    throw new Error('ordinary failure-deny observer probe');
  }).catch(($, e, next) => {
    events.push({event:'catch-deny',called:next.called,error:next.error});
    return {deny:'Explicit disposable probe catch denial'};
  });
  on('tool.call', {tool:'Write',file_path:/failure-timeout[.]txt$/}, async ($, e, next) => {
    events.push({event:'timeout-start',budget:next.budget.ms,remaining:next.budget.remainingMs});
    // A cooperative bounded wait, not a worker crash or infinite loop; $.clock waits count against the hook's own budget.
    await $.clock.sleep(next.budget.ms + 1000,{signal:next.signal});
    events.push({event:'unexpected-after-timeout'});
    return next(e);
  }).catch(($, e, next) => {
    events.push({event:'catch-timeout',called:next.called,error:next.error});
    return {deny:'Explicit disposable timeout denial'};
  });
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    if(started)return result;
    started=true;
    $.clock.after(1200,async()=>{
      const rows=[];
      const file=(await $.session.cwd())+'/failure-mod-report.json';
      try {
        for(const name of ['failure-open','failure-deny','failure-timeout']){
          const goal=completed+1;
          const time=await $.clock.now();
          const result=await $.prompt.submit({text:name,asUser:true});
          for(let n=0;n<350&&completed<goal;n++)await $.clock.sleep(100);
          rows.push({name,result,elapsedMs:(await $.clock.now())-time,completed:completed>=goal,messages:await $.session.messages()});
          await $.fs.write(file,JSON.stringify({rows,events,done:false}));
          if(completed<goal)throw new Error('turn.complete timeout');
        }
      }catch(error){rows.push({error:String(error)});}
      await $.fs.write(file,JSON.stringify({rows,events,done:true}));
    });
    return result;
  });
}
