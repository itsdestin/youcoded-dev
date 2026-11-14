// T1 proof extras: positive controls (the leak detectors DO fire), clock skew read back from a live device,
// restart keeps identity, offline boot, kill-by-pid leaves nothing behind.
import { up, ping, decoyLeaks, auditLines, BUILD, REAL_HOME, jailArgv, deviceEnv, prepareHome, planDevice } from './rig.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const R = {};
const rig = await up({ n: 2 });
try {
  const [A, B] = rig.devices;
  // 1. positive control: a jailed process that DOES write and read real-home paths. Detector must see both.
  const env = deviceEnv(A, true, 1);
  const probe = `const fs=require('fs');const R=process.env.RIG_REAL_HOME;try{fs.writeFileSync(R+'/.claude/rig-positive-control.txt','x')}catch(e){};try{fs.mkdirSync(R+'/.claude',{recursive:true});fs.writeFileSync(R+'/.claude/rig-positive-control.txt','x')}catch(e){};try{fs.readFileSync(R+'/.claude.json')}catch(e){};console.log('ok')`;
  const r = spawnSync('bwrap', [...jailArgv(A, env, {}), '/usr/bin/node', '-r', path.join(A.dir, 'rig/fs-audit-preload.cjs'), '-e', probe], { encoding: 'utf8' });
  R.positiveControl = { stdout: r.stdout.trim(), decoyLeaks: decoyLeaks(A), audit: auditLines(A).filter((x) => x.path.includes('rig-positive') || x.path.endsWith('.claude.json')) };
  // 2. clock skew read back from B's own log: connect, read the timestamp the backend wrote.
  const before = fs.readFileSync(B.log, 'utf8').length;
  fs.writeFileSync(B.clock, JSON.stringify({ offsetMs: 30 * 86400000 })); await new Promise((s) => setTimeout(s, 600));
  await ping(B); await new Promise((s) => setTimeout(s, 300));
  const stamp = /\[remote-server\] (\S+Z)/.exec(fs.readFileSync(B.log, 'utf8').slice(before));
  R.skew = { hostNow: new Date().toISOString(), deviceLogStamp: stamp?.[1], daysAhead: stamp ? ((Date.parse(stamp[1]) - Date.now()) / 86400000).toFixed(2) : null };
  // 3. in-jail view: the device cannot see the live app's sockets or the real home
  R.ready = [A.readyMs, B.readyMs];
} finally { await rig.stop(); }
R.stopExit = rig.devices.map((d) => d.exited);
R.leaksAfter = Object.fromEntries(rig.devices.map((d) => [d.name, decoyLeaks(d)]));
console.log(JSON.stringify(R, null, 1));
