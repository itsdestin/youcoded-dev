// Retain synthetic-task evidence, not credentials, auth URLs or thinking signatures.
import fs from 'node:fs';import path from 'node:path';
const home='/tmp/cc-real-ab-KEjSRV/home',base=path.dirname(new URL(import.meta.url).pathname);
const projects=path.join(home,'.claude/projects');const summary=[];
for(const slug of fs.readdirSync(projects)){
 const dir=path.join(projects,slug);if(!fs.statSync(dir).isDirectory())continue;
 for(const file of fs.readdirSync(dir).filter(n=>n.endsWith('.jsonl'))){
  const rows=fs.readFileSync(path.join(dir,file),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const first=rows.find(r=>r.type==='user'&&typeof r.message?.content==='string'&&r.message.content.startsWith('Using only the contents'));
  if(!first)continue;
  const mode=first.message.content.includes('tasks/mods/')?'mods':'legacy';
  const events=rows.filter(r=>['user','assistant'].includes(r.type)).map(r=>({timestamp:r.timestamp,type:r.type,uuid:r.uuid,model:r.message?.model,content:Array.isArray(r.message?.content)?r.message.content.filter(b=>b.type!=='thinking'):r.message?.content,usage:r.message?.usage}));
  const cost=rows.filter(r=>r.type==='cost-state').at(-1);
  const prompts=events.filter(r=>r.type==='user'&&typeof r.content==='string'&&/^(Using only the contents|Work only in tasks\/|Cancellation exercise|Do not resume the cancelled)/.test(r.content));
  const rec={mode,conversationId:file.slice(0,-6),humanPrompts:prompts.length,models:[...new Set(events.map(r=>r.model).filter(Boolean))],cliEstimatedCostUSD:cost?.totalCostUSD??null,modelUsage:cost?.modelUsage??null,cancellationFileExists:fs.existsSync(path.join(home,'tasks',mode,'cancel-finished.txt')),events};
  fs.writeFileSync(path.join(base,'real-ab-'+mode,'transcript-evidence.json'),JSON.stringify(rec,null,2));
  summary.push({...rec,events:undefined});
 }
}
fs.writeFileSync(path.join(base,'real-ab-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
