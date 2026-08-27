// scripts/ui-review/tests/shot-measure.test.mjs
// Runs the real shot.mjs against a static page served by python, no workbench needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('shot.mjs measures named elements into the manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shot-measure-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><body style="margin:0"><div id="a" style="position:absolute;left:100px;top:50px;width:200px;height:80px;background:red">hello</div>
    <p style="position:absolute;top:300px">enough text on this page for the readiness poll to pass its twenty characters</p></body>`);
  const http = await freePort(), cdp = await freePort();
  const py = spawn('python3', ['-m', 'http.server', String(http), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 800));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ base: `http://127.0.0.1:${http}/index.html`, boot: 300, width: 800, height: 600,
      shots: [{ name: 'm', actions: [], sameAsBaseline: true, expect: '#a', probe: false, measure: ['#a', { text: 'hello' }, '#missing'] }] }));
    const out = join(dir, 'out');
    const r = spawnSync('node', [join(HERE, '..', 'shot.mjs'), join(dir, 'plan.json'), out, 'midnight'], { env: { ...process.env, CDP_PORT: String(cdp), UI_REVIEW_RUN: '12345' }, encoding: 'utf8', timeout: 60000 });
    const mf = readdirSync(out).find(f => f.startsWith('manifest-'));
    assert.ok(mf, 'manifest written: ' + r.stdout + r.stderr);
    const [entry] = JSON.parse(readFileSync(join(out, mf), 'utf8'));
    assert.equal(entry.run, '12345');
    assert.deepEqual(entry.measures['#a'], { x: 100, y: 50, w: 200, h: 80 });
    assert.deepEqual(entry.measures['text:hello'], { x: 100, y: 50, w: 200, h: 80 });
    assert.equal(entry.measures['#missing'], null);
    assert.ok(entry.reasons.includes('measure missing: #missing'));
    assert.equal(entry.verified, false);
  } finally { py.kill(); }
});
