// The Office editor shoot starts: a run only ever uses the server ITS OWN child runs, and the
// child dies with the run (final review F23, F24).
// Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { isOurServer, startEditorServer } from '../office-editor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// A stand-in for desktop/scripts/office-workbench-server.mjs: listens on YC_OFFICE_PORT and
// answers /yc-workbench-info like the real one; dies on "address in use" like the real one.
const FAKE = `
import { createServer } from 'node:http';
const port = Number(process.env.YC_OFFICE_PORT);
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ desktop: process.cwd(), pid: process.pid }));
}).listen(port, '127.0.0.1');
`;

function fakeDesktop() {
  const dir = mkdtempSync(join(tmpdir(), 'yc-office-editor-test-'));
  writeFileSync(join(dir, 'fake-server.mjs'), FAKE);
  return dir;
}

async function freePort() {
  return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a server is ours only when it reports our child pid while the child lives', () => {
  const me = { desktop: '/d', pid: 42, alive: true };
  assert.equal(isOurServer({ desktop: '/d', pid: 42 }, me), true);
  assert.equal(isOurServer({ desktop: '/d', pid: 43 }, me), false, 'same checkout, another run’s server');
  assert.equal(isOurServer({ desktop: '/d', pid: 42 }, { ...me, alive: false }), false);
  assert.equal(isOurServer({ desktop: '/other', pid: 42 }, me), false);
  assert.equal(isOurServer(null, me), false);
  assert.equal(isOurServer({ desktop: '/d' }, me), 'unproven', 'an older server without a pid must be confirmed by our child staying alive');
});

// WHY: the race F23 describes — both runs see the port free at the same moment and start a
// server there. Before the fix the loser adopted the winner's server; now it starts its own.
test('two runs starting on the same port at the same moment never share a server', async () => {
  const desktop = fakeDesktop();
  const port = await freePort();
  const [a, b] = await Promise.all([
    startEditorServer({ desktop, port, server: 'fake-server.mjs', startMs: 10_000 }),
    startEditorServer({ desktop, port, server: 'fake-server.mjs', startMs: 10_000 }),
  ]);
  try {
    assert.notEqual(a.pid, b.pid);
    assert.notEqual(a.port, b.port, 'the loser retried on a port of its own');
    for (const e of [a, b]) {
      const info = await (await fetch(`http://127.0.0.1:${e.port}/yc-workbench-info`)).json();
      assert.equal(info.pid, e.pid, 'each run talks to its own child');
    }
  } finally { a.stop(); b.stop(); rmSync(desktop, { recursive: true, force: true }); }
});

// WHY (F24): a run killed by SIGTERM (a stopped verify.sh) or Ctrl-C ran no `finally`, so its
// editor child lived on — one more per interrupted run.
for (const sig of ['SIGTERM', 'SIGINT']) {
  test(`the editor child is stopped when the run gets ${sig}`, async () => {
    const desktop = fakeDesktop();
    const port = await freePort();
    const runner = join(desktop, 'runner.mjs');
    writeFileSync(runner, `
import { startEditorServer } from ${JSON.stringify(join(HERE, '..', 'office-editor.mjs'))};
const e = await startEditorServer({ desktop: ${JSON.stringify(desktop)}, port: ${port}, server: 'fake-server.mjs', startMs: 10_000 });
console.log('PID ' + e.pid);
setInterval(() => {}, 1000);
`);
    const run = spawn(process.execPath, [runner], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      const childPid = await new Promise((res, rej) => {
        let out = '';
        run.stdout.on('data', (d) => { out += d; const m = /PID (\d+)/.exec(out); if (m) res(Number(m[1])); });
        run.on('exit', () => rej(new Error('runner exited early')));
      });
      assert.ok(alive(childPid));
      const ended = new Promise((res) => run.on('exit', (code) => res(code)));
      run.kill(sig);
      const code = await ended;
      assert.equal(code, sig === 'SIGTERM' ? 143 : 130);
      for (let i = 0; i < 50 && alive(childPid); i++) await new Promise((r) => setTimeout(r, 100));
      assert.equal(alive(childPid), false, 'the editor child was killed with the run');
    } finally { if (run.exitCode === null) run.kill('SIGKILL'); rmSync(desktop, { recursive: true, force: true }); }
  });
}
