// Optional SENSOR-ONLY CLI, import-safe. Never builds/launches an app, attaches
// a browser, reads an app PID or touches profile locks. Not runtime accepted yet.
// --out must name a FRESH private run directory immediately under this worktree's
// scratch/sensor-runs/<new-run>/<report>.json. Helper reserves/checks its inode
// identities; existing run directories/reports and symlink ancestors are refused.
import {resolve,isAbsolute} from 'node:path';import {fileURLToPath} from 'node:url';
import {runOwnedDiagnosticHelper,validateSensorRequest} from './energy-controller.mjs';
export function parseSensorArgs(argv){
 if(!Array.isArray(argv)||argv.length>6)throw Error('Sensor CLI option cap');const values={};
 for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1];if(!['--out','--seconds','--interval-ms'].includes(k)||k in values||typeof v!=='string'||!v||v.startsWith('--'))throw Error('Unknown/duplicate/missing/equals sensor option');values[k]=v;}
 const seconds=values['--seconds']??'5',interval=values['--interval-ms']??'2000';
 if(!/^\d+$/.test(seconds)||Number(seconds)<1||Number(seconds)>30||!/^\d+$/.test(interval)||Number(interval)<1000||Number(interval)>10000)throw Error('Bounded sensor duration/interval required');
 const durationMs=Number(seconds)*1000,intervalMs=Number(interval),maxSamples=Math.ceil(durationMs/intervalMs)+1,maxSensors=Math.min(4,Math.floor(256/maxSamples)),out=values['--out'];
 if(typeof out!=='string'||!isAbsolute(out)||resolve(out)!==out)throw Error('Canonical absolute sensor output path required');
 return validateSensorRequest({command:'sensors',out,options:{durationMs,intervalMs,maxSamples,maxSensors}});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const request=parseSensorArgs(process.argv.slice(2)),result=await runOwnedDiagnosticHelper(request);console.log(JSON.stringify(result));process.exitCode=result.status==='supported'&&result.cleanup.exitObserved?0:1;}
 catch(error){console.error(error.message);process.exitCode=2;}
}
