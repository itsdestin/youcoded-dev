// Offline, read-only re-analysis of an existing lifecycle report's raw process evidence.
// Pure: takes parsed JSON, returns a result; the CLI only reads the one named file and prints.
// WHY: older reports recorded (pid, starttime) and per-pid PSS but never roles. This extracts
// exactly what that evidence supports (who came and went, when, how much PSS, matched-member
// totals) and states what it cannot show. It never assigns a role to old data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareRoleSnapshots, ROLE_ACCOUNTING_REVISION } from './process-roles.mjs';

const LEGACY_ROLE = 'unknown-legacy';
const PHASES = ['before', 'grown', 'switched', 'released'];

// Convert one checkpoint's identity.processStarts + pss.perPid into a role-shaped snapshot
// whose every role is 'unknown-legacy'. Members lacking a start or a PSS are not measured.
export function legacySnapshot(checkpoint) {
  const starts = checkpoint?.identity?.processStarts, per = checkpoint?.pss?.perPid, expected = checkpoint?.pss?.expectedPids;
  if (!starts || !Array.isArray(per) || !Array.isArray(expected)) return null;
  const members = expected.map(pid => {
    const start = starts[pid], row = per.find(p => p.pid === pid);
    const ok = typeof start === 'string' && start && typeof row?.mb === 'number' && Number.isFinite(row.mb);
    return { id: `${pid}:${start ?? '?'}`, pid, role: LEGACY_ROLE, status: ok ? 'measured' : 'unreadable', pssKb: ok ? row.mb * 1024 : null };
  });
  return { revision: ROLE_ACCOUNTING_REVISION, status: members.length && members.every(m => m.status === 'measured') ? 'measured' : 'incomplete', members };
}

export function reanalyseLegacyLifecycle(report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  const hasRoles = cycles.some(c => c?.natural?.roles?.revision === ROLE_ACCOUNTING_REVISION);
  const points = [];
  cycles.forEach((c, i) => PHASES.forEach(phase => {
    const snap = legacySnapshot(c?.checkpoints?.[phase]);
    if (snap) points.push({ label: `cycle${i + 1}.${phase}`, cycle: i + 1, phase, snap });
  }));
  // Lifetime of each identity across the checkpoints that observed it.
  const lifetimes = new Map();
  for (const p of points) for (const m of p.snap.members) {
    const l = lifetimes.get(m.id) ?? { id: m.id, firstSeen: p.label, lastSeen: p.label, seenAt: 0, maxPssMiB: 0 };
    l.lastSeen = p.label; l.seenAt++; l.maxPssMiB = Math.max(l.maxPssMiB, (m.pssKb ?? 0) / 1024);
    lifetimes.set(m.id, l);
  }
  const transitions = [];
  for (let i = 1; i < cycles.length; i++) {
    const a = legacySnapshot(cycles[i - 1]?.natural), b = legacySnapshot(cycles[i]?.natural);
    if (!a || !b) { transitions.push({ from: i, to: i + 1, status: 'unavailable' }); continue; }
    const cmp = compareRoleSnapshots(a, b), pssOf = (snap, ids) => snap.members.filter(m => ids.includes(m.id)).reduce((s, m) => s + (m.pssKb ?? 0), 0) / 1024;
    const addedIds = cmp.membership.added.map(m => m.id), removedIds = cmp.membership.removed.map(m => m.id);
    transitions.push({ from: i, to: i + 1, status: 'compared', membershipIdentical: cmp.membership.identical, added: addedIds, removed: removedIds,
      matchedMembers: cmp.matchedTotal.members, matchedDeltaMiB: cmp.matchedTotal.deltaPssKb / 1024,
      churnAddedPssMiB: pssOf(b, addedIds), churnRemovedPssMiB: pssOf(a, removedIds),
      // Raw total change shown only so it can be seen to be a mixture of matched change and churn.
      rawFamilyTotalDeltaMiB: (b.members.reduce((s, m) => s + (m.pssKb ?? 0), 0) - a.members.reduce((s, m) => s + (m.pssKb ?? 0), 0)) / 1024,
      wholeFamilyComparable: cmp.wholeFamily.comparable });
  }
  const can = [], cannot = [];
  if (hasRoles) can.push('This report already contains role accounting; use lifecycle.role.* paths instead.');
  else cannot.push('Roles (renderer/gpu/utility/zygote/main) for any process: cmdline was never recorded in this report. Not inferred from pid order or PSS size.');
  if (points.length) can.push(`Process identity (pid, starttime) and PSS at ${points.length} checkpoints, so membership churn is exact.`);
  else cannot.push('No checkpoint with processStarts + per-pid PSS found; nothing to extract.');
  if (transitions.some(t => t.status === 'compared')) can.push('Matched-member PSS change between released checkpoints, with added/removed identities and their PSS listed separately.');
  can.push('Which checkpoints each churned identity was first/last seen at (short-lived vs persistent).');
  cannot.push('Why a member appeared or left, or what it was; any leak or retention claim; unique memory (summed PSS is over an incompletely discovered family).');
  return { revision: ROLE_ACCOUNTING_REVISION, rolesRecordedInReport: hasRoles, cycles: cycles.length, checkpoints: points.length,
    rendererValid: cycles.map(c => c?.rendererValid ?? null), reportedFamilyPssComparable: cycles.map(c => c?.familyPssComparable ?? null),
    transitions, lifetimes: [...lifetimes.values()].filter(l => l.seenAt < points.length), canConclude: can, cannotConclude: cannot };
}

export function formatReanalysis(r) {
  const f = n => typeof n === 'number' ? n.toFixed(2) : 'n/a', out = [];
  out.push(`Role re-analysis (revision ${r.revision}): ${r.cycles} cycles, ${r.checkpoints} checkpoints with identity+PSS. Roles recorded in report: ${r.rolesRecordedInReport}.`);
  out.push(`Reported rendererValid: ${r.rendererValid.join('/')}; reported familyPssComparable: ${r.reportedFamilyPssComparable.join('/')}.`);
  for (const t of r.transitions) {
    if (t.status !== 'compared') { out.push(`cycle ${t.from} -> ${t.to}: unavailable`); continue; }
    out.push(`cycle ${t.from} -> ${t.to}: membership ${t.membershipIdentical ? 'identical' : 'CHANGED'}; matched ${t.matchedMembers} members, matched PSS change ${f(t.matchedDeltaMiB)} MiB; added [${t.added.join(' ')}] ${f(t.churnAddedPssMiB)} MiB; removed [${t.removed.join(' ')}] ${f(t.churnRemovedPssMiB)} MiB; raw family total change ${f(t.rawFamilyTotalDeltaMiB)} MiB (${t.wholeFamilyComparable ? 'comparable' : 'NOT comparable'}).`);
  }
  for (const l of r.lifetimes) out.push(`transient ${l.id} (role unknown): first ${l.firstSeen}, last ${l.lastSeen}, seen at ${l.seenAt} checkpoint(s), max ${f(l.maxPssMiB)} MiB`);
  out.push('CAN conclude:', ...r.canConclude.map(s => `  - ${s}`), 'CANNOT conclude:', ...r.cannotConclude.map(s => `  - ${s}`));
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node role-reanalysis.mjs <lifecycle report.json>  (read-only)'); process.exit(2); }
  console.log(formatReanalysis(reanalyseLegacyLifecycle(JSON.parse(readFileSync(file, 'utf8')))));
}
