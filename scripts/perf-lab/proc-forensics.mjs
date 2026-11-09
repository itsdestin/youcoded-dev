import { types } from 'node:util';

// Failure evidence only, NEVER an ownership/measurement verdict. No cmdline,
// environ or user strings. Excerpts retain only allowlisted proc structure.
export const PROC_FORENSIC_LIMITS=Object.freeze({revision:1,maxRecords:4,maxBytes:24576,excerptBytes:4096,scanChars:8192});
function excerpt(text,kind){
 if(typeof text!=='string')return {text:null,truncated:false};
 const raw=text.slice(0,PROC_FORENSIC_LIMITS.scanChars);let safe='';
 if(kind==='stat'){
  const end=raw.lastIndexOf(')'),pid=/^\d+/.exec(raw)?.[0]??'?';
  // comm may contain arbitrary user text, including parentheses. Never retain it.
  const tail=end>=0?raw.slice(end+1):'';
  safe=`${pid} ([redacted-comm])`+(/^\s+[A-Za-z](?:\s+-?\d+)*\s*$/.test(tail)?tail:' [unparseable-structure]');
 }else{
  const allowed=new Set(['State','Pid','PPid','Tgid','TracerPid','Threads','VmRSS','VmSize','VmData','VmStk','VmExe','VmLib','VmPTE','VmSwap','RssAnon','RssFile','RssShmem']);
  const lines=[];
  for(const line of raw.split('\n')){
   const match=/^([A-Za-z_]+):[ \t]*(.*)$/.exec(line);
   if(!match)continue;
   const [,key,value]=match;
   if(key==='Name'){lines.push('Name: [redacted]');continue;}
   if(!allowed.has(key))continue;
   if(key==='State')lines.push('State: '+(/^[A-Z](?:[ \t]+\([^\n]*\))?$/.test(value)?value[0]:'[malformed]'));
   else lines.push(key+': '+(/^[0-9 \tkB]+$/.test(value)?value:'[malformed]'));
  }
  safe=lines.join('\n');
 }
 return {text:safe.slice(0,PROC_FORENSIC_LIMITS.excerptBytes),truncated:text.length>raw.length||safe.length>PROC_FORENSIC_LIMITS.excerptBytes};
}
export function compactProcIdentity(record){
 if(!record)return null;
 return {pid:Number.isSafeInteger(record.pid)?record.pid:null,starttime:typeof record.starttime==='string'&&/^\d{1,32}$/.test(record.starttime)?record.starttime:null,
 state:typeof record.state==='string'&&/^[A-Z]$/.test(record.state)?record.state:null,ppid:Number.isSafeInteger(record.ppid)?record.ppid:null};
}
export function procFailureSnapshot({pid,operation,phase='unspecified',intentionalTeardown=false,at=0,reason='failure',errno=null,rawStat=null,rawStatus=null,before=null,after=null,afterError=null}){
 const stat=excerpt(rawStat,'stat'),status=excerpt(rawStatus,'status');
 const label=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(v)?v:'unclassified';
 const op=label(operation),file=op.includes('pss')?'smaps_rollup':op.includes('status')||op==='missing-rss'?'status':op.includes('cmdline')?null:'stat';
 return {revision:1,pid:Number.isSafeInteger(pid)?pid:null,operation:op,path:Number.isSafeInteger(pid)&&file?`/proc/${pid}/${file}`:null,phase:label(phase),intentionalTeardown:intentionalTeardown===true,
 at:Number.isFinite(at)?at:null,reason:label(reason),errno:typeof errno==='string'&&/^[A-Z0-9_]{1,32}$/.test(errno)?errno:null,
 before:compactProcIdentity(before),after:compactProcIdentity(after),afterError:typeof afterError==='string'&&/^[A-Z0-9_]{1,32}$/.test(afterError)?afterError:null,
 statBytes:typeof rawStat==='string'?Buffer.byteLength(rawStat):null,statusBytes:typeof rawStatus==='string'?Buffer.byteLength(rawStatus):null,
 statExcerpt:stat.text,statusExcerpt:status.text,statTruncated:stat.truncated,statusTruncated:status.truncated,
 privacy:'proc-structure-only; comm/name redacted, unknown status fields omitted; no cmdline/environ'};
}
function ownData(value,fields){
 if(typeof value!=='object'||value===null||types.isProxy(value))throw Error('Unsafe proc diagnostic');
 const data=Object.create(null);
 // WHY: fixed descriptor lookups neither enumerate a property flood nor execute
 // accessors/proxy traps while collecting best-effort failure evidence.
 for(const field of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,field);
  if(descriptor&&!Object.hasOwn(descriptor,'value'))throw Error('Proc diagnostic accessor');
  if(descriptor)data[field]=descriptor.value;
 }
 return data;
}
export function createProcFailureRing(){
 const records=[];let bytes=0,dropped=0;
 return {record(value){
  // Re-sanitize even internal callers. Never persist a supplied path/message or
  // arbitrary extra fields into an exception/report channel.
  let data;
  try{
   data=ownData(value??{},['revision','pid','operation','phase','intentionalTeardown','at','reason','errno','rawStat','rawStatus','before','after','afterError','statExcerpt','statusExcerpt','statBytes','statusBytes','statTruncated','statusTruncated']);
   for(const key of ['before','after'])if(data[key]!=null)data[key]=ownData(data[key],['pid','starttime','state','ppid']);
  }catch{dropped++;return;/* diagnostics must not replace the original failure */}
  if(data.revision===1&&Object.hasOwn(data,'statExcerpt')){data.rawStat=data.statExcerpt;data.rawStatus=data.statusExcerpt;}
  const row=procFailureSnapshot(data);
  for(const key of ['statBytes','statusBytes'])if(Number.isSafeInteger(data[key])&&data[key]>=0)row[key]=data[key];
  if(data.statTruncated===true)row.statTruncated=true;
  if(data.statusTruncated===true)row.statusTruncated=true;
  const size=Buffer.byteLength(JSON.stringify(row));
  if(size>PROC_FORENSIC_LIMITS.maxBytes){dropped++;return;}
  while(records.length>=PROC_FORENSIC_LIMITS.maxRecords||bytes+size>PROC_FORENSIC_LIMITS.maxBytes){const old=records.shift();bytes-=old.size;dropped++;}
  records.push({row,size});bytes+=size;
 },snapshot(){return {revision:1,limits:PROC_FORENSIC_LIMITS,records:records.map(v=>v.row),bytes,dropped};}};
}
export function emitProcFailure(callback,row){try{callback?.(row);}catch{/*diagnostic callback must not change original verdict*/}}
