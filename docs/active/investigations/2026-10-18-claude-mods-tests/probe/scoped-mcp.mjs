// WHY: minimal inert newline JSON-RPC stdio server; no filesystem or network tools.
import readline from 'node:readline';
import fs from 'node:fs';
const log=process.argv[2],label=process.argv[3];
readline.createInterface({input:process.stdin}).on('line',line=>{
  const e=JSON.parse(line);fs.appendFileSync(log,JSON.stringify({received:e})+'\n');if(e.id===undefined)return;
  let result={};
  if(e.method==='initialize')result={protocolVersion:e.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'scoped-'+label,version:'1.0.0'}};
  else if(e.method==='tools/list')result={tools:[{name:'echo',description:'Inert synthetic echo only',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]};
  else if(e.method==='tools/call')result={content:[{type:'text',text:'SCOPED_MCP_'+label+':'+e.params.arguments.text}]};
  const reply={jsonrpc:'2.0',id:e.id,result};fs.appendFileSync(log,JSON.stringify({sent:reply})+'\n');console.log(JSON.stringify(reply));
});
