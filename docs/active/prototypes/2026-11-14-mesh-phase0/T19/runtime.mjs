// T19 prototype: the fake "runtime". Before each simulated file write it asks the app over the
// socket and waits for the answer; only an "allow" lets it write.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
const [sockPath, outDir] = process.argv.slice(2);
const wlog = path.join(outDir, 'writes.log');
let n = 0;
function ask() {
  const id = ++n;
  const c = net.createConnection(sockPath, () => c.write(JSON.stringify({ id }) + '\n'));
  let buf = '';
  c.setEncoding('utf8');
  c.on('error', () => setTimeout(ask, 20));
  c.on('data', (d) => { buf += d; });
  c.on('end', () => {
    let r; try { r = JSON.parse(buf.trim()); } catch { return setTimeout(ask, 20); }
    if (r.decision !== 'allow') return setTimeout(ask, 20);
    // A tool takes a moment between the answer and the file change (0-3 ms).
    setTimeout(() => {
      fs.writeFileSync(path.join(outDir, `w-${id}`), 'x');
      fs.appendFileSync(wlog, JSON.stringify({ k: 'write', id, t: Date.now() }) + '\n');
      setTimeout(ask, 5 + Math.random() * 40);
    }, Math.random() * 3);
  });
}
ask(); ask(); ask();   // three tool calls in flight at once (parallel tools, subagents)
