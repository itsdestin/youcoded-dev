// Which clocks move while a process is SIGSTOPped, and does this kernel's monotonic clock skip suspend?
import { spawn, execSync } from 'node:child_process';
const child = spawn('node', ['-e', `
const w0=Date.now(), m0=performance.now(); let t=setInterval(()=>{},50);
process.on('SIGUSR2',()=>{console.log(JSON.stringify({wallMs:Date.now()-w0, monoMs:Math.round(performance.now()-m0), upt:require('fs').readFileSync('/proc/uptime','utf8').split(' ')[0]}));process.exit(0)});
`], { stdio: ['ignore', 'inherit', 'inherit'] });
await new Promise((r) => setTimeout(r, 300));
process.kill(child.pid, 'SIGSTOP'); await new Promise((r) => setTimeout(r, 1500)); process.kill(child.pid, 'SIGCONT');
await new Promise((r) => setTimeout(r, 100)); process.kill(child.pid, 'SIGUSR2');
await new Promise((r) => setTimeout(r, 300));
console.log(execSync('python3 -c "import time;print(time.clock_gettime(time.CLOCK_MONOTONIC),time.clock_gettime(time.CLOCK_BOOTTIME))"').toString().trim(), '<- MONOTONIC, BOOTTIME on this boot (equal gap = no suspend yet)');
