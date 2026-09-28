import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import { killTree } from '../src/main/harness/shell-registry';

const live = (pid: number) => {
  try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.[0] !== 'Z'; } catch { return false; }
};
const groupOf = (pid: number) => Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[2]);
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise<void>(r => setTimeout(r, 20));
  }
  throw new Error('process did not change state');
};

describe.skipIf(process.platform !== 'linux')('disposable process-group audit', () => {
  it('leader exits on TERM but TERM-ignoring descendant survives grace; clean up exact validated group', async () => {
    const leader = spawn('/bin/bash', ['-c', `${process.execPath} -e 'process.on("SIGTERM", () => {}); console.log("READY"); setInterval(() => {}, 1000)' & echo CHILD:$!; wait`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const leaderPid = leader.pid!;
    let childPid = 0;
    try {
      let output = '';
      leader.stdout.on('data', d => { output += String(d); const m = /CHILD:(\d+)/.exec(output); if (m) childPid = Number(m[1]); });
      await waitUntil(() => childPid > 0 && output.includes('READY'));
      expect(groupOf(childPid)).toBe(leaderPid);
      killTree(leader, { graceMs: 80 });
      await once(leader, 'exit');
      await new Promise<void>(r => setTimeout(r, 150));
      expect(live(childPid)).toBe(true);
    } finally {
      // Only a group spawned by this test and verified to contain its known child.
      if (childPid > 0 && live(childPid)) {
        if (groupOf(childPid) === leaderPid) process.kill(-leaderPid, 'SIGKILL');
        else process.kill(childPid, 'SIGKILL');
      }
      if (live(leaderPid)) leader.kill('SIGKILL');
      if (childPid > 0) await waitUntil(() => !live(childPid));
    }
  });
});
