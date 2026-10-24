// Per-role, identity-aware process-family memory accounting (workstream D).
// Pure functions over an injected /proc reader: unit tests use fake trees, never real processes.
// WHY: the earlier family PSS total was one number over a membership that churned between
// checkpoints, with no record of WHAT each process was. This records (pid, starttime) identity
// and a privacy-filtered role label per member so comparisons can be made member-for-member.
// Nothing here claims a leak; summed RSS stays a non-unique, conservative figure.
import { readBoundedText } from './lifecycle-evidence.mjs';

export const ROLE_ACCOUNTING_REVISION = 1;
const MAX_MEMBERS = 64; // WHY: bounded report size (record cap) even under a process flood.
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const GONE = new Set(['ENOENT', 'ESRCH']);

// WHY: only an allowlisted label leaves this function: never argv, paths, URLs or env.
export function classifyRole(cmdline) {
  const text = typeof cmdline === 'string' ? cmdline.replaceAll('\0', ' ').trim() : '';
  if (!text) return 'unknown';
  const type = /(?:^|\s)--type=(\S{1,64})/.exec(text)?.[1];
  if (type === 'renderer') return 'renderer';
  if (type === 'gpu-process') return 'gpu';
  if (type === 'utility') {
    const sub = /(?:^|\s)--utility-sub-type=([A-Za-z0-9_.-]{1,64})(?=\s|$)/.exec(text)?.[1];
    return sub ? `utility:${sub}` : 'utility';
  }
  if (type) return /^[a-z][a-z0-9-]{0,31}$/.test(type) ? type : 'other-type'; // zygote, broker, ...
  // No --type: the Electron main process, except a few known non-Electron family members.
  const exe = (text.split(/\s+/)[0] || '').split('/').pop();
  if (exe === 'node') return 'node-helper';
  if (exe === 'llama-server') return 'llama-server';
  if (/crashpad/i.test(exe)) return 'crashpad';
  return 'main';
}
/** Role label made safe for use inside a dotted comparable path. */
export const roleKey = role => String(role).replace(/[^A-Za-z0-9_-]+/g, '-');

function parseStarttime(raw) {
  const f = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
  return /^\d+$/.test(f[19] ?? '') ? f[19] : null;
}
function parseSmaps(text) {
  const kb = name => { const m = new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const clean = kb('Private_Clean'), dirty = kb('Private_Dirty');
  return { pssKb: kb('Pss'), rssKb: kb('Rss'), privateKb: clean !== null && dirty !== null ? clean + dirty : null };
}

/**
 * Read (pid, starttime, role, PSS/RSS/private) for each enumerated pid.
 * Order per member: stat, cmdline, smaps_rollup, stat again. A member that disappears at any
 * step is `exited-during-read` (never a zero); a changed starttime is `identity-changed`.
 */
export function readRoleSnapshot(pids, { read = path => readBoundedText(path, { maxBytes: 65536 }), maxMembers = MAX_MEMBERS } = {}) {
  const list = [...new Set(pids)];
  const truncated = list.length > maxMembers;
  const members = list.slice(0, maxMembers).map(pid => {
    let starttime = null, role = 'unknown';
    const row = (status, reason, extra = {}) => ({ id: starttime ? `${pid}:${starttime}` : `${pid}:?`, pid, starttime, role, status, reason, pssKb: null, rssKb: null, privateKb: null, ...extra });
    const fail = (stage, error) => GONE.has(error?.code) ? row('exited-during-read', stage) : row('unreadable', `${stage}:${error?.code ?? 'error'}`);
    try { starttime = parseStarttime(read(`/proc/${pid}/stat`)); } catch (e) { return fail('stat', e); }
    if (!starttime) return row('unreadable', 'stat-unparsable');
    try { role = classifyRole(read(`/proc/${pid}/cmdline`)); } catch (e) { return fail('cmdline', e); }
    let mem;
    try { mem = parseSmaps(read(`/proc/${pid}/smaps_rollup`)); } catch (e) { return fail('smaps', e); }
    if (!finite(mem.pssKb)) return row('unreadable', 'pss-missing');
    try {
      const again = parseStarttime(read(`/proc/${pid}/stat`));
      if (again !== starttime) return row('identity-changed', 'starttime-changed');
    } catch (e) { return fail('verify', e); }
    return row('measured', null, mem);
  });
  const ok = members.length > 0 && !truncated && members.every(m => m.status === 'measured');
  return { revision: ROLE_ACCOUNTING_REVISION, status: ok ? 'measured' : 'incomplete', truncated, memberCount: list.length, members };
}

const sum = (rows, key) => rows.every(m => finite(m[key])) ? rows.reduce((a, m) => a + m[key], 0) : null;
/** Per-role and whole totals. A total is null when ANY member that could contribute is unmeasured. */
export function roleTotals(snapshot) {
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  // WHY: a member that vanished before its role was read cannot be pinned to a role, so it
  // makes every role total uncertified (conservative) rather than silently shrinking one.
  const unattributed = members.filter(m => m.status !== 'measured' && m.role === 'unknown').length;
  const byRole = {};
  for (const role of new Set(members.map(m => m.role))) {
    const rows = members.filter(m => m.role === role), good = rows.filter(m => m.status === 'measured');
    const complete = good.length === rows.length && unattributed === 0 && snapshot?.truncated !== true;
    byRole[role] = { members: rows.length, measured: good.length, complete, pssKb: complete ? sum(good, 'pssKb') : null,
      rssKb: complete ? sum(good, 'rssKb') : null, privateKb: complete ? sum(good, 'privateKb') : null };
  }
  const good = members.filter(m => m.status === 'measured');
  const complete = members.length > 0 && good.length === members.length && snapshot?.truncated !== true;
  return { valid: complete, byRole, unattributed,
    total: { members: members.length, measured: good.length, complete, pssKb: complete ? sum(good, 'pssKb') : null, rssKb: complete ? sum(good, 'rssKb') : null } };
}

const hasRoles = s => s && s.revision === ROLE_ACCOUNTING_REVISION && Array.isArray(s.members);
/** Member-for-member comparison by (pid, starttime). Churn is listed, never netted into a delta. */
export function compareRoleSnapshots(before, after) {
  if (!hasRoles(before) || !hasRoles(after)) return { status: 'no-roles', reason: 'a checkpoint lacks role accounting (older report or not collected)', wholeFamily: { comparable: false, deltaPssKb: null, reason: 'no-roles' } };
  const a = new Map(before.members.map(m => [m.id, m])), b = new Map(after.members.map(m => [m.id, m]));
  const slim = m => ({ id: m.id, role: m.role, status: m.status });
  const added = [...b.values()].filter(m => !a.has(m.id)).map(slim), removed = [...a.values()].filter(m => !b.has(m.id)).map(slim);
  const tally = rows => rows.reduce((o, m) => (o[m.role] = (o[m.role] ?? 0) + 1, o), {});
  const matched = [], incompleteMatched = [];
  for (const [id, m] of a) {
    const n = b.get(id);
    if (!n) continue;
    if (m.status === 'measured' && n.status === 'measured' && m.role === n.role) matched.push([m, n]);
    else incompleteMatched.push({ id, role: n.role, beforeStatus: m.status, afterStatus: n.status });
  }
  const byRole = {};
  for (const role of new Set([...matched.map(([m]) => m.role), ...incompleteMatched.map(m => m.role)])) {
    const pairs = matched.filter(([m]) => m.role === role), broken = incompleteMatched.some(m => m.role === role);
    const beforePssKb = pairs.reduce((s, [m]) => s + m.pssKb, 0), afterPssKb = pairs.reduce((s, [, n]) => s + n.pssKb, 0);
    byRole[role] = { matched: pairs.length, comparable: !broken, beforePssKb: broken ? null : beforePssKb, afterPssKb: broken ? null : afterPssKb, deltaPssKb: broken ? null : afterPssKb - beforePssKb };
  }
  const beforePssKb = matched.reduce((s, [m]) => s + m.pssKb, 0), afterPssKb = matched.reduce((s, [, n]) => s + n.pssKb, 0);
  const identical = !added.length && !removed.length;
  const validBoth = before.status === 'measured' && after.status === 'measured' && !incompleteMatched.length;
  const reason = !identical ? 'membership-churn' : !validBoth ? 'incomplete-snapshot' : null;
  return { status: 'compared', membership: { identical, added, removed, addedByRole: tally(added), removedByRole: tally(removed), incompleteMatched },
    byRole, matchedTotal: { members: matched.length, beforePssKb, afterPssKb, deltaPssKb: afterPssKb - beforePssKb },
    // WHY: a whole-family delta is only meaningful over identical membership; otherwise only
    // the matched-member totals above are comparable and the churn is the finding.
    wholeFamily: { comparable: reason === null, deltaPssKb: reason === null ? afterPssKb - beforePssKb : null, reason },
    note: 'Summed PSS/RSS over enumerated members; not unique memory and not a leak verdict.' };
}

const MiB = kb => finite(kb) ? kb / 1024 : null;
const sampleOf = (c, policy) => policy === 'forced-gc' ? (c?.afterGc?.status === 'measured' ? c.afterGc.sample : null) : c?.natural;
/**
 * PRIMARY-style comparable paths, each an array with one entry per cycle (null when that
 * cycle lacks valid role data). Natural and forced-GC trajectories are never mixed: pick one.
 */
export function lifecycleRolePaths(cycles, { policy = 'natural' } = {}) {
  const prefix = policy === 'forced-gc' ? 'lifecycle.forcedGc' : 'lifecycle';
  const rows = (cycles ?? []).map(c => sampleOf(c, policy)?.roles);
  const n = rows.length, paths = {}, put = (path, i, v) => { (paths[path] ??= Array(n).fill(null))[i] = v; };
  const roles = new Set(rows.flatMap(r => hasRoles(r) ? r.members.map(m => m.role) : []));
  rows.forEach((snap, i) => {
    put(`${prefix}.roleSnapshotValid`, i, hasRoles(snap) ? snap.status === 'measured' : null);
    if (!hasRoles(snap)) return;
    const t = roleTotals(snap);
    for (const role of roles) {
      const r = t.byRole[role];
      put(`${prefix}.role.${roleKey(role)}.pssMiB`, i, r?.complete ? MiB(r.pssKb) : null);
      put(`${prefix}.role.${roleKey(role)}.count`, i, r ? r.members : 0);
    }
    put(`${prefix}.role.all.pssMiB`, i, t.total.complete ? MiB(t.total.pssKb) : null);
    put(`${prefix}.role.all.count`, i, t.total.members);
    const prev = rows[i - 1];
    if (i > 0 && hasRoles(prev)) {
      const cmp = compareRoleSnapshots(prev, snap);
      put(`${prefix}.roleChurn.added`, i, cmp.membership.added.length);
      put(`${prefix}.roleChurn.removed`, i, cmp.membership.removed.length);
      put(`${prefix}.roleMatched.all.deltaPssMiB`, i, MiB(cmp.matchedTotal.deltaPssKb));
      for (const [role, r] of Object.entries(cmp.byRole)) put(`${prefix}.roleMatched.${roleKey(role)}.deltaPssMiB`, i, MiB(r.deltaPssKb));
      put(`${prefix}.roleFamilyComparable`, i, cmp.wholeFamily.comparable);
    }
  });
  return { revision: ROLE_ACCOUNTING_REVISION, policy, cycleCount: n, roles: [...roles].map(r => ({ role: r, key: roleKey(r) })), paths };
}

/** Report block for short-lifecycle summaries; older cycles without roles are marked, not guessed. */
export function summariseRoleAccounting(cycles) {
  const list = cycles ?? [];
  // Set: natural usually IS checkpoints.released (same object or a deep copy after JSON); count by object.
  const snaps = [...new Set(list.flatMap(c => [...Object.values(c?.checkpoints ?? {}), c?.natural, c?.afterGc?.status === 'measured' ? c.afterGc.sample : null]
    .filter(s => s && s.domain !== 'renderer')))];
  const withRoles = snaps.filter(s => hasRoles(s.roles));
  const status = !snaps.length ? 'not-collected' : !withRoles.length ? 'legacy-no-roles' : withRoles.length < snaps.length ? 'incomplete' : withRoles.every(s => s.roles.status === 'measured') ? 'measured' : 'incomplete';
  const comparisons = list.map((c, i) => i === 0 ? null : compareRoleSnapshots(list[i - 1]?.natural?.roles, c?.natural?.roles));
  return { revision: ROLE_ACCOUNTING_REVISION, status, snapshots: snaps.length, snapshotsWithRoles: withRoles.length,
    allSnapshotsValid: status === 'measured',
    reason: status === 'legacy-no-roles' ? 'report predates role accounting; roles were never recorded and are not inferred' : null,
    natural: lifecycleRolePaths(list, { policy: 'natural' }),
    forcedGc: list.some(c => c?.afterGc?.status === 'measured') ? lifecycleRolePaths(list, { policy: 'forced-gc' }) : null,
    naturalComparisons: comparisons };
}
