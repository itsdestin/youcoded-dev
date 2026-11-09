import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const evidence=new URL('../evidence/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,evidence)));
const failure=read('failure-run.json'),attachment=read('attachment-run.json');
for(const run of [failure,attachment]){
 assert.equal(run.modReport.done,true);assert.equal(run.serverClosed,true);assert.equal(run.childExit.exitCode,129);
 assert(run.commands.every(c=>c.code===0));assert(run.requests.every(r=>r.dummyAuth));
 assert.match(run.environment.ANTHROPIC_BASE_URL,/^http:\/\/127[.]0[.]0[.]1:/);
 for(const key of Object.keys(run.environment))assert(['PATH','TERM','LANG','LC_ALL','HOME','CLAUDE_CONFIG_DIR','TMPDIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','DISABLE_AUTOUPDATER','DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC','ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN'].includes(key),key);
}
assert.equal(failure.requests.length,6);
assert.equal(failure.files['failure-open'].content,'SYNTHETIC_failure-open\n');
assert.equal(failure.files['failure-deny'].exists,false);assert.equal(failure.files['failure-timeout'].exists,false);
assert(failure.modReport.rows.every(r=>r.completed));
assert.equal(failure.modReport.events.filter(e=>e.event==='turn.complete'&&e.reason==='answer').length,3);
const catchDeny=failure.modReport.events.find(e=>e.event==='catch-deny');assert.equal(catchDeny.called,false);assert.equal(catchDeny.error.kind,'throw');assert.equal(catchDeny.error.budget,1000);
const timeout=failure.modReport.events.find(e=>e.event==='catch-timeout');assert.equal(timeout.called,false);assert.equal(timeout.error.kind,'timeout');assert.equal(timeout.error.budget,1000);
assert.equal(failure.modReport.events.find(e=>e.event==='timeout-start').budget,10000);
assert(!failure.modReport.events.some(e=>e.event==='unexpected-after-timeout'));
assert(failure.modReport.rows.find(r=>r.name==='failure-timeout').elapsedMs>=10000);
const toolResults=failure.requests.flatMap(r=>(r.messages??[]).flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='tool_result'):[]));
assert(toolResults.some(r=>r.is_error&&String(r.content).includes('Explicit disposable probe catch denial')));
assert(toolResults.some(r=>r.is_error&&String(r.content).includes('Explicit disposable timeout denial')));
assert.equal(attachment.requests.length,1);assert.equal(attachment.modReport.completed,true);
assert.equal(attachment.modReport.input.attachments[0].type,'image');
assert.equal(attachment.modReport.result.origin.kind,'plugin');assert.equal(attachment.modReport.result.origin.asUser,true);
const apiBlocks=attachment.requests.flatMap(r=>(r.messages??[]).flatMap(m=>Array.isArray(m.content)?m.content:[]));
assert(!apiBlocks.some(b=>b.type==='image'));
assert(apiBlocks.some(b=>b.type==='text'&&b.text==='attachment metadata transport probe'));
const user=attachment.transcripts.flatMap(t=>t.userRows).find(r=>r.message?.content==='attachment metadata transport probe');
assert(user);assert.equal(user.origin.kind,'plugin');assert.equal(user.origin.name,'isolated-attachment-probe');assert.equal(user.origin.asUser,true);
const png=fs.readFileSync(attachment.project+'/tiny.png');assert.equal(png.length,70);assert.equal(png.readUInt32BE(16),1);assert.equal(png.readUInt32BE(20),1);
assert.equal(crypto.createHash('sha256').update(png).digest('hex'),attachment.png.sha256);
// Confirm the generated fixture decodes to the expected filtered red RGBA scanline.
let p=8,idat=[];while(p<png.length){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8);if(type==='IDAT')idat.push(png.subarray(p+8,p+8+n));p+=n+12;}
assert.deepEqual([...zlib.inflateSync(Buffer.concat(idat))],[0,255,0,0,255]);
const originalHashes=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const preservation={filesChecked:Object.keys(originalHashes).length,changed:[]};
for(const [name,hash] of Object.entries(originalHashes)){const now=crypto.createHash('sha256').update(fs.readFileSync(new URL(name,evidence))).digest('hex');if(now!==hash)preservation.changed.push(name);}
assert.deepEqual(preservation.changed,[]);
const remaining=[];for(const name of fs.readdirSync('/proc')){if(!/^\d+$/.test(name)||Number(name)===process.pid)continue;try{const args=fs.readFileSync(`/proc/${name}/cmdline`,'utf8').split('\0');if(args.some(a=>[failure.root,attachment.root].some(root=>a.startsWith(root))))remaining.push(Number(name));}catch{/* process ended or inaccessible */}}
assert.deepEqual(remaining,[]);
const report={preservation,remainingMatchingTempChildren:remaining,binarySha256:crypto.createHash('sha256').update(fs.readFileSync(fs.realpathSync(failure.binary))).digest('hex'),failure:{throwWithoutCatch:'Write executed',throwWithCatchDeny:'Write blocked',timeoutWithCatchDeny:'Write blocked',timeoutElapsedMs:failure.modReport.rows.find(r=>r.name==='failure-timeout').elapsedMs},attachment:{imageBlocks:0,textArrived:true,pluginOriginRetained:true,pngBytes:png.length},requests:7};
// WHY: re-verifying saved evidence must not overwrite the original report or fail merely because it exists.
if (!process.argv.includes('--check-only')) {
 fs.writeFileSync(new URL('failure-attachment-assertions.json',evidence),JSON.stringify(report,null,2),{flag:'wx'});
 fs.writeFileSync(new URL('attachment-tiny.png',evidence),png,{flag:'wx'});
}
console.log('PASS failure: throw-before-next executed Write; explicit catch deny blocked Write; 10000ms own-budget timeout reached catch and blocked Write; CLI completed all three turns.');
console.log('PASS attachment NEGATIVE capability: real 70-byte PNG exists, metadata submission delivered text with plugin origin, but fake API received ZERO image blocks. No pixel transport established.');
console.log(`PASS isolation/preservation: seven dummy-auth localhost API requests, both servers closed, no matching temporary children, ${preservation.filesChecked} existing evidence files unchanged.`);
