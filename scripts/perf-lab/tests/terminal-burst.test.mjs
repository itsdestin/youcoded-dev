import test from 'node:test';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { glyphCommand, GLYPH_SENTINEL } from '../scenario-terminal.mjs';
import { parseOptions, glyphBody, assessBurst, SUPPORTED_LINES, rawDrainComplete, requiredTailRows, ipcDuringBurst, refuseForeignPackage } from '../terminal-burst.mjs';
import { validateOutputPath } from '../gpu-theme.mjs';

const row = (lines = 200) => ({ lines, raw: glyphBody(lines), tail: glyphBody(lines).split('\r\n').slice(-42).join('\n'), marker: GLYPH_SENTINEL(lines), emission: { startedAt: 1000, finishedAt: 1010 }, firstRawAt: 1002, readyAt: 1020, terminal: {cols:100,tailRows:52}, ipcDuring: {status:'measured',sampleCount:1,maxMs:3,totalStallMs:0}, ipc: { pings: 3, rejectedPings: 0, maxMs: 5, totalStallMs: 0, openStallMs: null }, probe: { windowMs: 18, longtaskSupported: true, longtaskTotalMs: 0, longtaskMaxMs: 0, longtaskCount: 0 }, cpu: { totalSeconds: 0.1, pidsBefore: 2, pidsAfter: 2 } });

test('exact numbered ANSI payload, bounded xterm tail and emission marker are required', () => {
  const r = assessBurst(row());
  assert.equal(r.status, 'measured', r.reasons.join('; '));
  assert.equal(r.integrity.rawBytes, Buffer.byteLength(glyphBody(200)));
  assert.equal(r.integrity.rawLines, 200);
  assert.equal(r.emissionToReadyMs, 20);
  assert.equal(r.coverage, 'raw IPC payload exact; xterm bounded tail only (not full scrollback)');
});
test('missing or duplicated raw bytes cannot pass merely because xterm sentinel exists', () => {
  const original = row();
  for (const raw of [original.raw.replace('00001', '00002'), original.raw.slice(0, -12), original.raw + 'X', original.raw.replace(/\x1b\[0m\r\n\[perf-lab\]/, '[perf-lab]')]) {
    assert.equal(assessBurst({ ...original, raw }).status, 'incomplete');
  }
});
test('missing bounded xterm suffix, sentinel, or emission signal is incomplete', () => {
  const original = row(2000);
  for (const change of [{tail: original.tail.replace('01999', '01888')}, {tail: ''}, {marker: null}, {emission: null}, {firstRawAt: null}]) {
    assert.equal(assessBurst({...original, ...change}).status, 'incomplete');
  }
});
test('invalid renderer/CPU probes invalidate integrity; missing IPC stays explicitly unmeasured', () => {
  const original = row();
  for (const change of [{probe: {...original.probe, longtaskSupported: false}}, {cpu: {totalSeconds: NaN}}, {readyAt: 999}]) {
    assert.equal(assessBurst({...original, ...change}).status, 'incomplete');
  }
  const missing = assessBurst({...original,ipc:null,ipcDuring:null});
  assert.equal(missing.status,'measured');
  assert.deepEqual([missing.ipcDuring.status,missing.ipcDuring.sampleCount,missing.ipcDuring.maxMs],['unmeasured',0,null]);
});
test('raw drain accepts PTY CRCRLF but not a missing final prompt', () => {
  assert.equal(rawDrainComplete(glyphBody(200).replace(/\r\n/g, '\r\r\n'), 200), true);
  assert.equal(rawDrainComplete(glyphBody(200).slice(0,-2), 200), false);
});
test('bounded tail accounts for narrow wrapped rows or refuses unsupported width', () => {
  assert.equal(requiredTailRows(100), 52);
  assert.equal(requiredTailRows(40), 72);
  assert.equal(requiredTailRows(20), null);
  assert.equal(assessBurst({...row(), terminal: {cols:20, tailRows:null}}).status, 'unsupported');
  assert.equal(assessBurst({...row(), terminal: {cols:40, tailRows:72}}).status, 'measured');
});
test('IPC samples outside actual producer-to-ready interval do not establish burst responsiveness', () => {
  const sample = (at, ms) => [at,ms,0];
  const source = {t0EpochMs:990, everyMs:50, samples:[sample(5,2),sample(15,3),sample(24,2),sample(32,2)]};
  assert.equal(ipcDuringBurst(source,1000,1020).sampleCount,2);
  assert.equal(ipcDuringBurst(source,1010,1020).sampleCount,1);
  assert.equal(ipcDuringBurst({...source,samples:[sample(5,2),sample(32,2)]},1010,1020).status,'unmeasured');
  assert.deepEqual([ipcDuringBurst({...source,everyMs:null},1010,1020).status,ipcDuringBurst({...source,everyMs:null},1010,1020).totalStallMs],['unmeasured',null]);
  const measured=ipcDuringBurst({...source,samples:[sample(15,3),sample(16,90),sample(24,2)]},1000,1020);
  assert.equal(measured.sampleCount,2); // the 90ms ping crosses readiness; exclude it
  assert.equal(measured.maxMs,3);
  assert.equal(assessBurst({...row(), ipcDuring:{status:'unmeasured',sampleCount:0,reason:'no overlapping pings'}}).status,'measured');
});
test('refuse a foreign process associated with shared package before fixture/build', () => {
  assert.throws(()=>refuseForeignPackage('/tmp/isolated/package', {find:()=>[1234],read:()=> '/tmp/isolated/package/youcoded --other-worker'}),/already running/);
  assert.doesNotThrow(()=>refuseForeignPackage('/tmp/isolated/package', {find:()=>[],read:()=>''}));
});

test('terminal outputs reject outside, occupied screenshot, or symlink before fixture seeding', () => {
  const root=mkdtempSync(join(tmpdir(),'terminal-output-'));
  const scratch=join(root,'scratch','perf-lab');mkdirSync(scratch,{recursive:true});
  const out=join(scratch,'terminal.json');
  try {
    assert.equal(validateOutputPath(out,root),out);
    assert.throws(()=>validateOutputPath(join(root,'outside.json'),root),/scratch/);
    writeFileSync(out+'.png','keep');
    assert.throws(()=>validateOutputPath(out,root),/already exists/);
    assert.equal(readFileSync(out+'.png','utf8'),'keep');
    const source=readFileSync(new URL('../terminal-burst.mjs',import.meta.url),'utf8');
    assert.ok(source.indexOf('validateOutputPath(opts.out);') < source.indexOf('mkdirSync(dirname(opts.out)'), 'preflight before fixture/output mutation');
    assert.match(source,/writeFileSync\(report\.screenshot,[^\n]*flag:'wx'/);
    assert.match(source,/writeFileSync\(opts\.out,[^\n]*flag:'wx'/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('sizes and workload are deliberately restricted', () => {
  assert.deepEqual(SUPPORTED_LINES, [200, 2000]);
  for (const n of SUPPORTED_LINES) assert.equal(glyphCommand(n), `perf-lab-glyphs ${n}`);
  assert.throws(() => assessBurst({...row(), lines: 300}), /unsupported/);
  assert.throws(() => parseOptions(['--lines', '300']), /Invalid option/);
});
test('fixture command actually emits exact glyph bytes and private producer timestamps', async () => {
  const home = mkdtempSync(join(tmpdir(), 'terminal-burst-'));
  mkdirSync(join(home, '.claude'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../fake-claude.cjs', import.meta.url))], { cwd: home, env: {...process.env, HOME: home}, stdio: ['pipe','pipe','ignore'] });
  let output = '';
  const decoder = new StringDecoder('utf8');
  try {
    await new Promise((ok, fail) => {
      child.once('error', fail);
      const onReady = b => {
        output += decoder.write(b);
        if (output.includes('ready\r\n> ')) { child.stdout.off('data', onReady); ok(); }
      };
      child.stdout.on('data', onReady);
    });
    for (const n of SUPPORTED_LINES) {
      const before = output.length;
      child.stdin.write(glyphCommand(n) + '\n');
      await new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(Error('fixture did not emit glyph body')), 3000);
        const onData = b => {
          output += decoder.write(b);
          if (output.includes(GLYPH_SENTINEL(n) + '\r\n> ', before)) { clearTimeout(timer); child.stdout.off('data', onData); ok(); }
        };
        child.stdout.on('data', onData);
      });
      assert.ok(output.slice(before).includes(glyphBody(n)), `size ${n}: exact output`);
    }
    const records = readFileSync(join(home,'.claude','perf-terminal-emissions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    for (const n of SUPPORTED_LINES) assert.ok(records.some(r => r.n === n && Number.isFinite(r.startedAt)));
  } finally {
    child.kill('SIGTERM');
    await new Promise(ok => child.once('close', ok));
    rmSync(home, {recursive:true, force:true, maxRetries:3});
  }
});

test('CLI rejects malformed, relative and out-of-budget inputs', () => {
  const root = '/tmp/terminal-burst';
  assert.equal(parseOptions([], root).maxMinutes, 5);
  assert.equal(parseOptions(['--max-minutes', '10', '--real-display', ':12'], root).display, ':12');
  for (const args of [['--max-minutes','11'], ['--max-minutes','0'], ['--max-minutes','2.5'], ['--max-minutes','NaN'], ['--app-dir','relative'], ['--checkout','relative'], ['--out','relative'], ['--real-display', 'not-a-display'], ['--real-display'], ['--unknown', 'x']]) assert.throws(() => parseOptions(args, root));
});
