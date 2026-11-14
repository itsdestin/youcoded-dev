// T1 proof extras 2: clean stop, restart keeps identity, offline boot, nothing left running.
import { up, ping, decoyLeaks, auditLines, startDevice, stopDevice, planDevice } from './rig.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const R = {};
let rig = await up({ n: 1 });
const d = rig.devices[0];
const id1 = fs.readFileSync(path.join(d.userData, 'device-id.json'), 'utf8');
const pidsBefore = [d.pid];
await rig.stop();
R.cleanStop = { exit: d.exited, stoppedCleanly: d.stoppedCleanly };
// restart the same device folder: same id?
const d2 = planDevice(path.dirname(d.dir), 'A', 't1'); // same folder, same seed
await startDevice(d2, { jail: true, offline: true });   // also: offline
R.offlineBoot = { ready: true, readyMs: d2.readyMs, ping: await ping(d2) };
await stopDevice(d2);
R.sameIdAfterRestart = fs.readFileSync(path.join(d2.userData, 'device-id.json'), 'utf8') === id1;
R.restartStop = { exit: d2.exited, clean: d2.stoppedCleanly };
await rig.relay.close().catch(()=>{});
R.leaks = decoyLeaks(d2); R.audit = auditLines(d2).length;
R.leftoverProcesses = execSync("ps -eo pid,args | grep headless-main.js | grep -v grep | wc -l").toString().trim();
console.log(JSON.stringify(R, null, 1));
