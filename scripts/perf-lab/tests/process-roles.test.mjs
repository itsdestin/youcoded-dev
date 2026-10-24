// Deterministic fake /proc trees only: no real process is sampled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRole, readRoleSnapshot, roleTotals, compareRoleSnapshots, lifecycleRolePaths, summariseRoleAccounting, roleKey } from '../process-roles.mjs';

const stat = (pid, start) => `${pid} (electron (x)) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0`;
const smaps = ({ pss, rss = pss * 2, clean = 1, dirty = pss - 1 }) => `Rss: ${rss} kB\nPss: ${pss} kB\nPrivate_Clean: ${clean} kB\nPrivate_Dirty: ${dirty} kB\n`;
const CMD = {
  main: '/opt/app/youcoded --user-data-dir=/home/secret/profile',
  renderer: '/opt/app/youcoded --type=renderer --secret-token=abc --lang=en',
  gpu: '/opt/app/youcoded --type=gpu-process --ozone=x11',
  net: '/opt/app/youcoded --type=utility --utility-sub-type=network.mojom.NetworkService --user-data-dir=/home/secret',
  zygote: '/opt/app/youcoded --type=zygote --no-zygote-sandbox',
};
// procs: pid -> {start, cmd, pss}; vanish: {pid: 'stat'|'cmdline'|'smaps'|'verify'}; swap: {pid: newStart}
function fakeProc(procs, { vanish = {}, swap = {}, errno = {} } = {}) {
  const calls = {};
  return path => {
    const [, , pid, file] = path.split('/');
    const p = procs[pid], n = calls[`${pid}/${file}`] = (calls[`${pid}/${file}`] ?? 0) + 1;
    const gone = () => Object.assign(Error('gone'), { code: 'ENOENT' });
    if (!p) throw gone();
    if (errno[pid]) throw Object.assign(Error('denied'), { code: errno[pid] });
    if (file === 'stat') {
      if (vanish[pid] === 'stat' || (vanish[pid] === 'verify' && n > 1)) throw gone();
      return stat(pid, n > 1 && swap[pid] ? swap[pid] : p.start);
    }
    if (file === 'cmdline') { if (vanish[pid] === 'cmdline') throw gone(); return p.cmd.replaceAll(' ', '\0'); }
    if (vanish[pid] === 'smaps') throw gone();
    return p.pss === undefined ? 'Rss: 5 kB\n' : smaps(p);
  };
}
const FAMILY = {
  100: { start: '1000', cmd: CMD.main, pss: 1000 }, 101: { start: '1001', cmd: CMD.gpu, pss: 400 },
  102: { start: '1002', cmd: CMD.renderer, pss: 3000 }, 103: { start: '1003', cmd: CMD.net, pss: 200 },
  104: { start: '1004', cmd: CMD.zygote, pss: 20 },
};

test('role classification is allowlisted: no argv, paths, tokens or env leave the function', () => {
  assert.equal(classifyRole(CMD.main), 'main');
  assert.equal(classifyRole(CMD.renderer.replaceAll(' ', '\0')), 'renderer');
  assert.equal(classifyRole(CMD.gpu), 'gpu');
  assert.equal(classifyRole(CMD.net), 'utility:network.mojom.NetworkService');
  assert.equal(classifyRole('/x/youcoded --type=utility'), 'utility');
  assert.equal(classifyRole(CMD.zygote), 'zygote');
  assert.equal(classifyRole('/x/youcoded --type=Weird!!'), 'other-type');
  assert.equal(classifyRole('/usr/bin/node /home/secret/pty-worker.js'), 'node-helper');
  assert.equal(classifyRole('/x/chrome_crashpad_handler --database=/home/secret'), 'crashpad');
  assert.equal(classifyRole(''), 'unknown');
  for (const c of Object.values(CMD)) assert.doesNotMatch(classifyRole(c), /secret|\/home|token|user-data/);
  assert.equal(roleKey('utility:network.mojom.NetworkService'), 'utility-network-mojom-NetworkService');
});

test('a fully readable family is a valid snapshot with (pid,starttime) identity, roles and per-role totals', () => {
  const snap = readRoleSnapshot([100, 101, 102, 103, 104], { read: fakeProc(FAMILY) });
  assert.equal(snap.status, 'measured');
  assert.deepEqual(snap.members.map(m => m.id), ['100:1000', '101:1001', '102:1002', '103:1003', '104:1004']);
  assert.equal(snap.members[2].role, 'renderer');
  assert.equal(snap.members[2].privateKb, 3000);
  assert.equal(JSON.stringify(snap).includes('secret'), false, 'no argv or paths retained');
  const t = roleTotals(snap);
  assert.equal(t.valid, true);
  assert.equal(t.byRole.renderer.pssKb, 3000);
  assert.equal(t.byRole['utility:network.mojom.NetworkService'].pssKb, 200);
  assert.equal(t.total.pssKb, 4620);
});

test('a member vanishing at each read step is exited-during-read, never zero-filled', () => {
  for (const step of ['stat', 'cmdline', 'smaps', 'verify']) {
    const snap = readRoleSnapshot([100, 102, 103], { read: fakeProc(FAMILY, { vanish: { 103: step } }) });
    const gone = snap.members.find(m => m.pid === 103);
    assert.equal(gone.status, 'exited-during-read', step);
    assert.equal(gone.reason, step);
    assert.equal(gone.pssKb, null);
    assert.equal(snap.status, 'incomplete');
    assert.equal(roleTotals(snap).total.pssKb, null, 'whole total withheld');
    if (step === 'stat' || step === 'cmdline') {
      assert.equal(gone.role, 'unknown');
      assert.equal(roleTotals(snap).byRole.renderer.pssKb, null, 'unattributable loss uncertifies every role');
    } else {
      // role known, so ONLY the affected role and the whole total are incomplete
      assert.equal(gone.role, 'utility:network.mojom.NetworkService');
      assert.equal(roleTotals(snap).byRole.renderer.pssKb, 3000);
      assert.equal(roleTotals(snap).byRole.main.pssKb, 1000);
      assert.equal(roleTotals(snap).byRole['utility:network.mojom.NetworkService'].complete, false);
    }
  }
});

test('permission errors, missing Pss, pid reuse and over-cap lists are incomplete but distinct from exit', () => {
  const s1 = readRoleSnapshot([100], { read: fakeProc(FAMILY, { errno: { 100: 'EACCES' } }) });
  assert.equal(s1.members[0].status, 'unreadable');
  assert.match(s1.members[0].reason, /EACCES/);
  const s2 = readRoleSnapshot([100], { read: fakeProc({ 100: { start: '1', cmd: CMD.main } }) });
  assert.equal(s2.members[0].reason, 'pss-missing');
  const s3 = readRoleSnapshot([100], { read: fakeProc(FAMILY, { swap: { 100: '9999' } }) });
  assert.equal(s3.members[0].status, 'identity-changed');
  const s4 = readRoleSnapshot([100, 101, 102], { read: fakeProc(FAMILY), maxMembers: 2 });
  assert.equal(s4.truncated, true);
  assert.equal(s4.status, 'incomplete');
  assert.equal(roleTotals(s4).total.pssKb, null);
  assert.equal(readRoleSnapshot([], { read: fakeProc(FAMILY) }).status, 'incomplete', 'empty family is never healthy');
});

const snapOf = (procs, pids, opts) => readRoleSnapshot(pids, { read: fakeProc(procs, opts) });
test('identical membership: whole-family and per-role deltas are comparable', () => {
  const grown = { ...FAMILY, 102: { ...FAMILY[102], pss: 3500 } };
  const c = compareRoleSnapshots(snapOf(FAMILY, [100, 101, 102]), snapOf(grown, [100, 101, 102]));
  assert.equal(c.membership.identical, true);
  assert.equal(c.wholeFamily.comparable, true);
  assert.equal(c.wholeFamily.deltaPssKb, 500);
  assert.equal(c.byRole.renderer.deltaPssKb, 500);
  assert.equal(c.byRole.main.deltaPssKb, 0);
});

test('churn: matched-member totals only, added/removed listed with roles, no whole-family delta', () => {
  // the audited shape: helpers appear in the middle checkpoint and are gone again
  const withKids = { ...FAMILY, 200: { start: '2000', cmd: CMD.net, pss: 5 }, 201: { start: '2001', cmd: CMD.zygote, pss: 2 } };
  const mid = { ...withKids, 102: { ...FAMILY[102], pss: 3100 } };
  const up = compareRoleSnapshots(snapOf(FAMILY, [100, 102]), snapOf(mid, [100, 102, 200, 201]));
  assert.equal(up.wholeFamily.comparable, false);
  assert.equal(up.wholeFamily.reason, 'membership-churn');
  assert.equal(up.wholeFamily.deltaPssKb, null);
  assert.deepEqual(up.membership.added.map(m => `${m.id}=${m.role}`), ['200:2000=utility:network.mojom.NetworkService', '201:2001=zygote']);
  assert.deepEqual(up.membership.addedByRole, { 'utility:network.mojom.NetworkService': 1, zygote: 1 });
  assert.equal(up.matchedTotal.members, 2);
  assert.equal(up.matchedTotal.deltaPssKb, 100, 'only members present in both are subtracted');
  const down = compareRoleSnapshots(snapOf(mid, [100, 102, 200, 201]), snapOf(FAMILY, [100, 102]));
  assert.deepEqual(down.membership.removed.map(m => m.id), ['200:2000', '201:2001']);
  assert.equal(down.matchedTotal.deltaPssKb, -100);
});

test('pid reuse is churn (different starttime), not a continuing member', () => {
  const reused = { ...FAMILY, 101: { start: '5555', cmd: CMD.gpu, pss: 410 } };
  const c = compareRoleSnapshots(snapOf(FAMILY, [100, 101]), snapOf(reused, [100, 101]));
  assert.deepEqual(c.membership.removed.map(m => m.id), ['101:1001']);
  assert.deepEqual(c.membership.added.map(m => m.id), ['101:5555']);
  assert.equal(c.wholeFamily.comparable, false);
});

test('an incomplete member makes only its role and the whole comparison incomplete; renderer role stays comparable', () => {
  const after = snapOf({ ...FAMILY, 102: { ...FAMILY[102], pss: 3300 } }, [100, 102, 103], { vanish: { 103: 'smaps' } });
  const c = compareRoleSnapshots(snapOf(FAMILY, [100, 102, 103]), after);
  assert.equal(c.wholeFamily.comparable, false);
  assert.equal(c.wholeFamily.reason, 'incomplete-snapshot');
  assert.equal(c.byRole.renderer.comparable, true);
  assert.equal(c.byRole.renderer.deltaPssKb, 300);
  assert.equal(c.byRole['utility:network.mojom.NetworkService'].comparable, false);
  assert.equal(c.byRole['utility:network.mojom.NetworkService'].deltaPssKb, null);
});

test('snapshots without roles (older reports) are reported as no-roles, never compared', () => {
  const c = compareRoleSnapshots({ revision: 2 }, snapOf(FAMILY, [100]));
  assert.equal(c.status, 'no-roles');
  assert.equal(c.wholeFamily.comparable, false);
});

const cycle = (roles, gc) => ({ natural: { domain: 'full', roles }, checkpoints: {}, afterGc: gc ? { status: 'measured', sample: { domain: 'full', roles: gc } } : { status: 'unmeasured' } });
test('comparable lifecycle paths: per-role PSS/count per cycle, churn counts, matched deltas; GC kept separate', () => {
  const k = { ...FAMILY, 200: { start: '2000', cmd: CMD.net, pss: 5 } };
  const c1 = snapOf(k, [100, 102, 200]), c2 = snapOf({ ...FAMILY, 102: { ...FAMILY[102], pss: 3072 } }, [100, 102]);
  const gc = snapOf(FAMILY, [100, 102]);
  const out = lifecycleRolePaths([cycle(c1, gc), cycle(c2)]);
  assert.equal(out.policy, 'natural');
  assert.deepEqual(out.paths['lifecycle.role.renderer.pssMiB'], [3000 / 1024, 3072 / 1024]);
  assert.deepEqual(out.paths['lifecycle.role.renderer.count'], [1, 1]);
  assert.deepEqual(out.paths['lifecycle.role.utility-network-mojom-NetworkService.count'], [1, 0]);
  assert.deepEqual(out.paths['lifecycle.roleChurn.added'], [null, 0]);
  assert.deepEqual(out.paths['lifecycle.roleChurn.removed'], [null, 1]);
  assert.deepEqual(out.paths['lifecycle.roleFamilyComparable'], [null, false]);
  assert.deepEqual(out.paths['lifecycle.roleMatched.renderer.deltaPssMiB'], [null, 72 / 1024]);
  assert.deepEqual(out.paths['lifecycle.roleSnapshotValid'], [true, true]);
  const forced = lifecycleRolePaths([cycle(c1, gc), cycle(c2)], { policy: 'forced-gc' });
  assert.ok(Object.keys(forced.paths).every(p => p.startsWith('lifecycle.forcedGc.')));
  assert.deepEqual(forced.paths['lifecycle.forcedGc.role.renderer.pssMiB'], [3000 / 1024, null]);
});

test('an incomplete role leaves null in its path, not zero', () => {
  const bad = snapOf(FAMILY, [100, 102, 103], { vanish: { 103: 'smaps' } });
  const out = lifecycleRolePaths([cycle(bad)]);
  assert.deepEqual(out.paths['lifecycle.role.utility-network-mojom-NetworkService.pssMiB'], [null]);
  assert.deepEqual(out.paths['lifecycle.role.renderer.pssMiB'], [3000 / 1024]);
  assert.deepEqual(out.paths['lifecycle.role.all.pssMiB'], [null]);
  assert.deepEqual(out.paths['lifecycle.roleSnapshotValid'], [false]);
});

test('report summary marks legacy cycles as lacking roles and counts valid snapshots', () => {
  const legacy = summariseRoleAccounting([{ natural: { revision: 2, domain: 'full' }, checkpoints: { before: { revision: 2 } } }]);
  assert.equal(legacy.status, 'legacy-no-roles');
  assert.match(legacy.reason, /not inferred/);
  assert.equal(legacy.allSnapshotsValid, false);
  const good = snapOf(FAMILY, [100, 102]);
  const ok = summariseRoleAccounting([cycle(good), cycle(good)]);
  assert.equal(ok.status, 'measured');
  assert.equal(ok.allSnapshotsValid, true);
  assert.equal(ok.naturalComparisons[1].wholeFamily.comparable, true);
  assert.equal(summariseRoleAccounting([{ natural: { domain: 'renderer', revision: 3 } }]).status, 'not-collected');
  assert.equal(summariseRoleAccounting([cycle(snapOf(FAMILY, [100, 103], { vanish: { 103: 'cmdline' } }))]).status, 'incomplete');
});
