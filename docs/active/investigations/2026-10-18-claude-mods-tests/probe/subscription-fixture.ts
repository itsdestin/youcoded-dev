// WHY: only the external test controller grants prompts; reloads cannot reset the three-prompt ceiling.
let state;
let saving=Promise.resolve();
async function save($) {
  const file=(await $.session.cwd())+'/subscription-report.json';
  const text=JSON.stringify(state);
  saving=saving.then(()=>$.fs.write(file,text));
  await saving;
}
async function drive($, config) {
  try {
    state.model = await $.session.model();
    if (!state.model.toLowerCase().includes('haiku')) throw new Error('Refusing non-Haiku model: ' + state.model);
    state.tools=await $.tool.list();
    if(state.tools.length!==0)throw new Error('Refusing model run with tools enabled');
    state.id = await $.session.id();
    state.version = await $.session.version();
    state.handshake = true;
    await save($);
    for (let i = 0; i < config.count; i++) {
      const reply = await $.http.fetch(config.url + '/grant/' + config.phase, {method:'POST',headers:{'x-probe-key':config.key}});
      if (!reply.ok) throw new Error('Prompt grant refused: ' + reply.status);
      const grant = JSON.parse(reply.text);
      if (grant.allowed !== true || typeof grant.text !== 'string') throw new Error('No explicit prompt grant');
      state.grants.push({id:grant.id,text:grant.text});
      await save($);
      const result = await $.prompt.submit({text:grant.text,asUser:true});
      state.submissions.push({id:grant.id,result});
      await save($);
      if (result.drop) throw new Error('Prompt dropped: ' + result.drop);
    }
    for (let i = 0; i < 600 && state.ends.length < config.count; i++) await $.clock.sleep(100);
    if (state.ends.length !== config.count) throw new Error('Expected completed turns not observed');
    if (state.ends.some(e=>e.reason !== 'answer')) throw new Error('A turn did not end with an answer');
    state.messages = await $.session.messages();
    state.usage = await $.session.usage();
  } catch (error) {state.error=String(error);}
  state.done=true;
  await save($);
}
export function register(on) {
  let started=false;
  on('turn.start', ($,e,next)=>{if(state)state.starts.push({turnId:e.turnId,text:e.text});return next(e);});
  on('turn.complete', async ($,e,next)=>{
    const result=await next(e);
    if(state){state.ends.push({turnId:e.turnId,answer:e.answer,reason:e.reason,usage:e.usage,durationMs:e.durationMs,isAborted:e.isAborted});await save($);}
    return result;
  });
  on('session.start',async ($,e,next)=>{
    const result=await next(e);
    if(started)return result;
    started=true;
    const config=JSON.parse(await $.fs.read((await $.session.cwd())+'/subscription-controller.json'));
    state={phase:config.phase,handshake:false,grants:[],submissions:[],starts:[],ends:[],done:false};
    $.clock.after(400,()=>drive($,config));
    return result;
  });
}
