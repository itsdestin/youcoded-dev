// WHY: debugging a provider rejection needs its reason, not a guessed cause. Opt-in callers
// keep these bounded fields in the private ledger; details may contain task excerpts.
export async function upstreamDiagnostic(response,secrets){
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>32768){await reader.cancel();return {message:'Upstream diagnostic exceeded 32 KiB'};}
   chunks.push(Buffer.from(value));
  }
 }catch{return {message:'Upstream diagnostic could not be read'};}finally{reader.releaseLock();}
 const clean=value=>{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  let text=String(value);for(const secret of secrets)if(secret)text=text.replaceAll(secret,'[REDACTED]');
  return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi,'Bearer [REDACTED]')
   .replace(/(\b(?:x-api-key|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']?)[^\s"',;]+/gi,'$1[REDACTED]')
   .replace(/(?:sk-|yc-gate-)[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,1200);
 };
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return {message:'Non-JSON upstream error; body omitted'};}
 const error=body?.error??body;let detail=error?.metadata?.raw;
 if(typeof detail==='string'){try{const parsed=JSON.parse(detail);detail=parsed?.error?.message??parsed?.message??null;}catch{/* A vendor may provide a plain error string. */}}
 return {code:clean(error?.code),message:clean(error?.message),detail:clean(detail),provider:clean(error?.metadata?.provider_name)};
}
