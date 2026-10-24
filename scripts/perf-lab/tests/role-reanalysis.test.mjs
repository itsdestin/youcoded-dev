// Synthetic report only: the helper is pure and the tests never touch scratch/ evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacySnapshot, reanalyseLegacyLifecycle, formatReanalysis } from '../role-reanalysis.mjs';

const cp = members => ({ identity: { processStarts: Object.fromEntries(members.map(([pid, s]) => [pid, s])) },
  pss: { expectedPids: members.map(([pid]) => pid), perPid: members.map(([pid, , mb]) => ({ pid, mb })) } });
const cycle = (released, extra = {}) => ({ rendererValid: true, familyPssComparable: false, natural: released, checkpoints: { before: released, grown: released, switched: released, released }, ...extra });
const A = cp([[1, '10', 100], [2, '11', 50]]), B = cp([[1, '10', 110], [2, '11', 50], [3, '12', 4]]), C = cp([[1, '10', 105], [2, '11', 52]]);

test('legacy evidence gets identity and PSS but never a role', () => {
  const s = legacySnapshot(A);
  assert.deepEqual(s.members.map(m => [m.id, m.role, m.pssKb]), [['1:10', 'unknown-legacy', 102400], ['2:11', 'unknown-legacy', 51200]]);
  assert.equal(legacySnapshot({ pss: {} }), null);
  const partial = legacySnapshot({ identity: { processStarts: { 1: '10' } }, pss: { expectedPids: [1, 2], perPid: [{ pid: 1, mb: 1 }] } });
  assert.equal(partial.status, 'incomplete', 'a missing start or PSS is never zero-filled');
});

test('churn between cycles is separated from matched-member change; roles are listed as unconcludable', () => {
  const r = reanalyseLegacyLifecycle({ cycles: [cycle(A), cycle(B), cycle(C)] });
  assert.equal(r.rolesRecordedInReport, false);
  const [t1, t2] = r.transitions;
  assert.deepEqual(t1.added, ['3:12']);
  assert.equal(t1.matchedMembers, 2);
  assert.equal(t1.matchedDeltaMiB, 10);
  assert.equal(t1.churnAddedPssMiB, 4);
  assert.equal(t1.wholeFamilyComparable, false);
  assert.deepEqual(t2.removed, ['3:12']);
  assert.equal(t2.matchedDeltaMiB, -3);
  assert.deepEqual(r.lifetimes.map(l => [l.id, l.seenAt, l.firstSeen, l.lastSeen]), [['3:12', 4, 'cycle2.before', 'cycle2.released']], 'only the identity absent from some checkpoints is listed as transient');
  assert.ok(r.cannotConclude.some(s => /Roles .* never recorded/.test(s)));
  assert.match(formatReanalysis(r), /CANNOT conclude/);
});

test('missing or role-bearing input does not crash and is not fabricated', () => {
  assert.equal(reanalyseLegacyLifecycle({}).checkpoints, 0);
  assert.equal(reanalyseLegacyLifecycle({ cycles: [{ natural: { roles: { revision: 1 } } }] }).rolesRecordedInReport, true);
  assert.ok(reanalyseLegacyLifecycle({ cycles: [{}, {}] }).transitions.every(t => t.status === 'unavailable'));
});
