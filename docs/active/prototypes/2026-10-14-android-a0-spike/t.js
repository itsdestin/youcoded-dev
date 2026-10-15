const pty = require('node-pty');
const [cmd, ...args] = process.argv.slice(2);
const t0 = Date.now();
const p = pty.spawn(cmd, args, { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.env.HOME, env: process.env });
let out = '';
p.onData(d => { out += d; });
p.onExit(e => { console.log('EXIT', JSON.stringify(e)); });
if (cmd.endsWith('bash')) setTimeout(() => p.write('echo hello-from-pty $((6*7)); tty\r'), 500);
setTimeout(() => {
  console.log('pid', p.pid, 'ms', Date.now() - t0, 'bytes', out.length);
  console.log(out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g,'').split(/\r?\n/).filter(l => l.trim()).slice(-25).join('\n'));
  p.kill(); setTimeout(() => process.exit(0), 300);
}, +process.env.WAIT || 3000);
