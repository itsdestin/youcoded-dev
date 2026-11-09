// WHY: preserve runtime fixture revisions and scoped config/context excerpts without rewriting any prior run.
import fs from 'node:fs';
import crypto from 'node:crypto';
const base=new URL('../',import.meta.url).pathname,out=base+'evidence/scoped-audit';
if(fs.existsSync(out))throw Error('Refuse evidence rewrite');fs.mkdirSync(out);
const rows=[];
for(const [batch,modes]of [['scoped-batch',['control','submit','context','observer','installed','mcp','broken','abort']],['scoped-context-followup',['context','installed']]])for(const mode of modes){
 const r=JSON.parse(fs.readFileSync(base+'evidence/'+batch+'/'+mode+'.json','utf8'));
 const sources=[r.root+'/market/plugins/scoped-probe/hooks/register.ts',r.root+'/session-mcp.json',r.root+'/observer/hooks/register.ts',r.project+'/scoped-meta.json'].filter(p=>fs.existsSync(p));
 const row={batch,mode,files:sources.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),text:fs.readFileSync(p,'utf8')})),instructionFileExists:fs.existsSync(r.configDir+'/CLAUDE.md'),modelUserMessages:r.requests.map(q=>q.body.messages?.filter(m=>m.role==='user')),submitted:r.mod.rows.find(x=>x.submitted)};rows.push(row);
}
fs.writeFileSync(out+'/inputs-context.json',JSON.stringify(rows,null,2),{flag:'wx'});
console.log('Recorded runtime source/config and synthetic context excerpts for '+rows.length+' sessions; no existing output rewritten.');
