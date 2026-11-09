// Frozen SYNTHETIC controlled retrieval, not native/live WebSearch.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const docs=fs.readdirSync(path.join(__dirname,'corpus')).filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(fs.readFileSync(path.join(__dirname,'corpus',n),'utf8')));
const [action,...parts]=process.argv.slice(2),query=parts.join(' ');
const digest=d=>crypto.createHash('sha256').update(d.body).digest('hex');
let result;
if(action==='search'&&query.trim()){
 const terms=query.toLowerCase().split(/\W+/).filter(Boolean);
 result=docs.map(d=>({d,score:terms.filter(t=>(d.id+' '+d.body).toLowerCase().includes(t)).length})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.d.id.localeCompare(b.d.id)).map(({d,score})=>({id:d.id,url:d.url,version:d.version,score,bodySha256:digest(d),snippet:d.body.slice(0,120)}));
}else if(action==='fetch'&&docs.some(d=>d.id===query))result=docs.find(d=>d.id===query);
else throw Error('Usage: node research.cjs search QUERY | fetch DOCUMENT_ID');
fs.appendFileSync(path.join(__dirname,'research-receipts.jsonl'),JSON.stringify({track:'synthetic-controlled-retrieval-v1',action,query,results:(Array.isArray(result)?result:[result]).map(d=>({id:d.id,bodySha256:d.bodySha256||digest(d)}))})+'\n');
console.log(JSON.stringify(result,null,2));
