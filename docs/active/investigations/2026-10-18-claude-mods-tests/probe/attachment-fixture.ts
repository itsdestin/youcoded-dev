// WHY: the current declaration accepts attachment METADATA, not bytes or a file-import instruction. This intentionally tests that negative boundary without inventing data/path fields.
export function register(on) {
  let completed=false;
  let started=false;
  const events=[];
  on('prompt.submit',($,e,next)=>{events.push({event:'prompt.submit',text:e.text,origin:e.origin,attachments:e.attachments});return next(e);});
  on('turn.complete',($,e,next)=>{completed=true;events.push({event:'turn.complete',reason:e.reason});return next(e);});
  on('session.start',async($,e,next)=>{
    const result=await next(e);
    if(started)return result;
    started=true;
    $.clock.after(1200,async()=>{
      const cwd=await $.session.cwd();
      const input={text:'attachment metadata transport probe',asUser:true,attachments:[{type:'image',mediaType:'image/png',filename:cwd+'/tiny.png'}]};
      const report={input,events,done:false};
      try{
        report.result=await $.prompt.submit(input);
        for(let n=0;n<200&&!completed;n++)await $.clock.sleep(100);
        report.completed=completed;
        report.messages=await $.session.messages({as:'api'});
      }catch(error){report.error=String(error);}
      report.done=true;
      await $.fs.write(cwd+'/attachment-mod-report.json',JSON.stringify(report));
    });
    return result;
  });
}
