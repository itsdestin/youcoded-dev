// WHY: controls are deferred outside hooks the engine awaits; every Write is confined to this disposable project.
export function register(on) {
  let started=false,completed=0;const events=[],rows=[];let meta,cwd,file;
  on('turn.complete',($,e,next)=>{completed++;events.push({event:'complete',reason:e.reason});return next(e);});
  on('tool.check',{tool:'Write'},async($,e,next)=>{
    const underlying=await next(e),name=e.input.file_path.split('/').pop();
    events.push({event:'underlying',name,underlying,toolUseId:e.tool_use_id});await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));
    if(!['allow.txt','deny.txt','old.txt','new.txt','catch.txt'].includes(name)||e.input.file_path!==cwd+'/'+name)return {decision:'deny',reason:'Outside synthetic compatibility scope'};
    if(meta.kind==='catch'){events.push({event:'gate-throw',name});await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));throw Error('Synthetic ordinary gate failure');}
    const response=await $.http.fetch(meta.url+'/'+name),reply=JSON.parse(response.text);
    events.push({event:'external',name,reply});await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));
    if(!response.ok||!['allow','deny'].includes(reply.decision))throw Error('Invalid synthetic decision');
    return {decision:reply.decision,reason:'Explicit synthetic compat '+reply.decision};
  }).catch(async($,e,next)=>{
    events.push({event:'catch-throw',error:next.error});await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));throw Error('Synthetic catch itself failed');
  });
  on('session.start',async($,e,next)=>{
    const result=await next(e);if(started)return result;started=true;
    $.clock.after(1300,async()=>{
      cwd=await $.session.cwd();meta=JSON.parse(await $.fs.read(cwd+'/compat-meta.json'));file=cwd+'/compat-report-'+meta.phase+'.json';
      async function step(name,fn){try{rows.push({name,ok:true,value:await fn()});}catch(error){rows.push({name,ok:false,error:String(error)});}await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));}
      async function send(text){const goal=completed+1,result=await $.prompt.submit({text,asUser:true});for(let n=0;n<220&&completed<goal;n++)await $.clock.sleep(100);if(completed<goal)throw Error('Bounded turn timeout');return {result,messages:await $.session.messages()};}
      await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:false}));
      if(meta.kind==='controls'){
        await step('baseline',async()=>({id:await $.session.id(),model:await $.session.model()}));
        await step('model',async()=>({result:await $.command.run({command:'model',args:'sonnet'}),model:await $.session.model()}));
        await step('clear',async()=>{const before=await $.session.id(),result=await $.command.run({command:'clear'});return {before,result,after:await $.session.id(),messages:await $.session.messages()};});
        for(const text of ['compat repeat 第二行 café 🧪\nline two','compat repeat 第二行 café 🧪\nline two'])await step('send',()=>send(text));
        await step('compact',async()=>({result:await $.command.run({command:'compact',args:'Keep synthetic compatibility markers.'}),id:await $.session.id(),messages:await $.session.messages()}));
      }else {
        if(meta.kind==='catch')await step('check',()=>$.tool.check({tool:'Write',input:{file_path:cwd+'/catch.txt',content:'SYNTHETIC compat catch\n'}}));
        for(const text of meta.prompts)await step('send',()=>send(text));
      }
      await $.fs.write(file,JSON.stringify({id:await $.session.id(),version:await $.session.version(),events,rows,done:true}));
    });return result;
  });
}
