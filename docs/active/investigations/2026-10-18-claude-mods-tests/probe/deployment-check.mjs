// WHY: exercise the unchanged installer functions with disposable source/stable directories.
// Expected defects are recorded as observations, not silently fixed or called healthy behavior.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../../../');
const evidence=path.resolve(here,'../evidence/deployment');
const script=fileURLToPath(import.meta.url);
if(process.argv[2]==='--launch'){
  if(fs.existsSync(evidence))throw Error('Existing evidence refused');
  fs.mkdirSync(evidence,{recursive:true});
  const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'cc-deployment-'));
  const home=path.join(sandbox,'home');fs.mkdirSync(home);
  const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:sandbox,LANG:'C.UTF-8',DEPLOYMENT_SANDBOX:sandbox};
  const args=['--ro-bind','/','/','--bind',sandbox,sandbox,'--bind',evidence,evidence,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
  for(const[k,v]of Object.entries(env))args.push('--setenv',k,v);
  args.push('--','/usr/bin/node',script,'--inside');
  const result=spawnSync('/usr/bin/bwrap',args,{env,encoding:'utf8',timeout:15000,maxBuffer:100000});
  fs.writeFileSync(path.join(evidence,'launch.json'),JSON.stringify({command:['/usr/bin/bwrap',...args],sandbox,env,exit:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr},null,2),{flag:'wx'});
  console.log(result.stdout);if(result.stderr)console.error(result.stderr);process.exit(result.status??1);
}
if(process.argv[2]==='--verify'){
 const r=JSON.parse(fs.readFileSync(path.join(evidence,'results.json'),'utf8'));
 const l=JSON.parse(fs.readFileSync(path.join(evidence,'launch.json'),'utf8'));
 assert.equal(l.exit,0);assert.equal(l.signal,null);
 for(const flag of ['--unshare-net','--unshare-pid','--clearenv','--ro-bind'])assert(l.command.includes(flag));
 assert(r.firstStage.copied&&r.firstStage.stagedRelay);
 assert.equal(r.relocation.writeGuardUsesSource,true);assert.equal(r.relocation.sourceExistsAfterMove,false);assert.equal(r.relocation.stableGuardExists,true);
 assert.equal(r.missingScript.copied,false);assert.equal(r.missingScript.statuslineStillMissing,true);assert.equal(r.missingScript.relayStillPresent,true);
 assert.equal(r.ownership.unrelatedNotifyPreserved,true);assert.equal(r.ownership.sameBasenameUserRelayOverwritten,true);assert.equal(r.ownership.userStatuslineOverwritten,true);
 console.log('VERIFIED unchanged installer behavior: stable staging works; volatile write-guard path, missing non-relay script repair gap, and basename ownership collisions reproduced. No app changes.');process.exit(0);
}
if(process.argv[2]!=='--inside'||!process.env.DEPLOYMENT_SANDBOX)throw Error('Use --launch or --verify');
const sandbox=process.env.DEPLOYMENT_SANDBOX;
assert(path.resolve(os.homedir()).startsWith(sandbox+'/'));
const require=createRequire(import.meta.url);
const installer=require(path.join(root,'youcoded/desktop/scripts/install-hooks.js'));
const source=path.join(sandbox,'mount-a','hook-scripts'),stable=path.join(sandbox,'stable');
fs.mkdirSync(path.dirname(source),{recursive:true});
fs.cpSync(path.join(root,'youcoded/desktop/hook-scripts'),source,{recursive:true});
const first=installer.stageHookScripts({stamp:'probe|packaged',srcDir:source,stableDir:stable});
const settings={};installer.applyAppHooks(settings,stable,source);
const guard=settings.hooks.PreToolUse.flatMap(m=>m.hooks).find(h=>h.command.includes('write-guard.sh'));
const ownershipSettings={hooks:{Stop:[{matcher:'',hooks:[{type:'command',command:'node "/user-tools/relay.js"',timeout:10}]},{matcher:'',hooks:[{type:'command',command:'bash "/user-tools/notify.sh"',timeout:10}]}]},statusLine:{type:'command',command:'bash "/user-tools/statusline.sh"'}};
installer.applyAppHooks(ownershipSettings,stable,source);
const ownership={
 unrelatedNotifyPreserved:ownershipSettings.hooks.Stop.some(m=>m.hooks.some(h=>h.command==='bash "/user-tools/notify.sh"')),
 sameBasenameUserRelayOverwritten:!ownershipSettings.hooks.Stop.some(m=>m.hooks.some(h=>h.command==='node "/user-tools/relay.js"')),
 userStatuslineOverwritten:ownershipSettings.statusLine.command!=='bash "/user-tools/statusline.sh"',
 after:ownershipSettings,
};
fs.unlinkSync(path.join(stable,'statusline.sh'));
const missing=installer.stageHookScripts({stamp:'probe|packaged',srcDir:source,stableDir:stable});
const moved=path.join(sandbox,'mount-b');fs.renameSync(path.dirname(source),moved);
const report={sourceFile:path.join(root,'youcoded/desktop/scripts/install-hooks.js'),
 firstStage:{copied:first.copied,stagedRelay:fs.existsSync(path.join(stable,'relay.js'))},
 relocation:{command:guard.command,writeGuardUsesSource:guard.command.includes(source),sourceExistsAfterMove:fs.existsSync(source),stableGuardExists:fs.existsSync(path.join(stable,'write-guard.sh'))},
 missingScript:{copied:missing.copied,statuslineStillMissing:!fs.existsSync(path.join(stable,'statusline.sh')),relayStillPresent:fs.existsSync(path.join(stable,'relay.js'))},ownership,
 noHookCommandsExecuted:true,noClaudeProcessStarted:true};
fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report,null,2));
