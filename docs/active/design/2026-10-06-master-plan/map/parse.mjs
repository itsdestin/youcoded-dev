import fs from 'fs';
const L=fs.readFileSync('docs/MAP.md','utf8').split('\n').slice(0,84).filter(l=>l.startsWith('| ')&&!l.startsWith('| Subsystem')&&!l.startsWith('|---'));
const rows=[];
for(const l of L){
  const cells=l.split(/ \| /); // crude
  const name=cells[0].replace(/^\| /,'').trim();
  const entry=cells[1]||'';
  const paths=[...entry.matchAll(/`([^`\s]+)`/g)].map(m=>m[1]).filter(p=>/[\/.]/.test(p)&&!p.startsWith('http')).map(p=>p.replace(/[,;)]+$/,''));
  rows.push({name,paths:[...new Set(paths)]});
}
fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,1));
console.log(rows.length, rows.filter(r=>!r.paths.length).map(r=>r.name));
