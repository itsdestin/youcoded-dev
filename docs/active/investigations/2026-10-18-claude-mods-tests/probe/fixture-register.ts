// WHY: all controls originate in the mod, not terminal keystrokes. A deferred callback avoids invoking queued controls inside a hook the engine waits on.
export function register(on) {
  let started = false;
  let completed = 0;
  let currentTurn;
  const events = [];
  on('turn.start', ($, e, next) => { currentTurn = e.turnId; events.push({event:'turn.start',turnId:e.turnId}); return next(e); });
  on('turn.complete', ($, e, next) => { completed++; events.push({event:'turn.complete',reason:e.reason}); return next(e); });
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    if (started) return result;
    started = true;
    $.clock.after(1500, async () => {
      const file = (await $.session.cwd()) + '/mod-report.json';
      const rows = [];
      async function save(done = false) { await $.fs.write(file, JSON.stringify({rows,events,done})); }
      async function step(name, fn) {
        try { const value = await fn(); rows.push({name,ok:true,value}); }
        catch (error) {rows.push({name,ok:false,error:String(error)});}
        await save();
      }
      async function waitTurn(count) {
        for(let i=0;i<180;i++){if(completed>=count)return;await $.clock.sleep(100);}
        throw new Error('turn.complete timeout');
      }
      try {
        await step('baseline', async()=>({id:await $.session.id(),model:await $.session.model(),version:await $.session.version()}));
        await step('commands', async()=>await $.command.list());
        await step('config-keys', async()=>(await $.config.list()).map(r=>({key:r.key,kind:r.kind})));
        await step('model-sonnet', async()=>({result:await $.command.run({command:'model',args:'sonnet'}),model:await $.session.model()}));
        await step('clear', async()=>{const before=await $.session.id();const result=await $.command.run({command:'clear'});return{before,result,after:await $.session.id(),messages:await $.session.messages()};});
        await step('send-simple', async()=>{const count=completed+1;const result=await $.prompt.submit({text:'repeat exact',asUser:true});await waitTurn(count);return{result,messages:await $.session.messages()};});
        await step('send-repeat-unicode-busy', async()=>{const count=completed+3;const results=[];results.push(await $.prompt.submit({text:'repeat exact',asUser:true}));results.push(await $.prompt.submit({text:'line one\n第二行 café 🧪',asUser:true}));results.push(await $.prompt.submit({text:'queued while busy',asUser:true}));await waitTurn(count);return{results,messages:await $.session.messages()};});
        await step('compact', async()=>({result:await $.command.run({command:'compact',args:'Keep the probe markers.'}),id:await $.session.id(),messages:await $.session.messages()}));
        await step('unknown-command', async()=>await $.command.run({command:'does-not-exist-probe'}));
        await step('abort-turn', async()=>{const count=completed+1;await $.prompt.submit({text:'slow interruption probe',asUser:true});await $.clock.sleep(500);const result=await $.turn.abort({turnId:currentTurn});await waitTurn(count);return{result,messages:await $.session.messages()};});
      } catch(error) {rows.push({name:'fatal',ok:false,error:String(error)});}
      await save(true);
    });
    return result;
  });
}
