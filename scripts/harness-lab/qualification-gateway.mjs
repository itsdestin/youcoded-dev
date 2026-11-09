// WHY: real gateway/network preflight must never contact a provider, even with
// a dummy key. Both transports are supplied here; neither has a fetch fallback.
import {loadPrivateConfig,createGateway} from './openrouter-gateway.mjs';
import {pathToFileURL} from 'node:url';
export const qualificationTransport=async()=>new Response(JSON.stringify({id:'qualification-only',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'qualification-only'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,cost:0}}),{status:200,headers:{'content-type':'application/json'}});
export const qualificationUsageTransport=async()=>new Response(JSON.stringify({data:{usage:0,usage_daily:0,usage_weekly:0,usage_monthly:0}}),{status:200,headers:{'content-type':'application/json'}});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args.length!==4||args[0]!=='--config'||args[2]!=='--key-file')throw Error('qualification gateway requires controller config');
 const config=await loadPrivateConfig(args[1]);
 const gateway=await createGateway({config,keyFile:args[3],transport:qualificationTransport,usageTransport:qualificationUsageTransport});
 await gateway.listen();
}
