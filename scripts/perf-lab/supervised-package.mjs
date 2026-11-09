// Production backend authorization is exact-checkout + official cached package,
// never a path-name hint. No synthetic binary override in this entry point.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstatSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFingerprint } from './build.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
const exec = promisify(execFile);
const APPROVED_CHECKOUT = resolve(fileURLToPath(new URL('../../youcoded', import.meta.url)));
// WHY: approval is source-owned, shared by controller and worker, never supplied
// by CLI, environment, a receipt or a neighboring checkout's own registration.
const WORKSPACE = dirname(APPROVED_CHECKOUT);
export const MERGED_EVALUATION_CHECKOUT = resolve(WORKSPACE, '../96-merged-evaluation/youcoded');
// WHY (perf-lab workstream E, 2026-10-21): the transcript-batcher counters live in a separate app
// branch (session/93-batcher-counters). It is approved by exact path like the other two; this is one
// added entry, not a pattern, so no neighbouring checkout becomes approved by accident.
export const BATCHER_COUNTERS_CHECKOUT = resolve(WORKSPACE, '../93-batcher-counters/youcoded');
const EXPECTED_COMMON = resolve(WORKSPACE, '../../../youcoded/.git');
export function assertApprovedCheckoutPath(checkout, { approvedCheckouts = [APPROVED_CHECKOUT, MERGED_EVALUATION_CHECKOUT, BATCHER_COUNTERS_CHECKOUT], canonical = realpathSync } = {}) {
  if (!approvedCheckouts.includes(checkout) || resolve(checkout) !== checkout || canonical(checkout) !== checkout) throw Error('Supervisor requires exact approved isolated checkout');
  return checkout;
}
const PRODUCTION_PATHS = ['/opt/YouCoded/youcoded','/opt/youcoded/youcoded','/usr/bin/youcoded','/usr/local/bin/youcoded'];
const defaults = {
  approvedCheckouts: [APPROVED_CHECKOUT, MERGED_EVALUATION_CHECKOUT, BATCHER_COUNTERS_CHECKOUT], expectedCommon: EXPECTED_COMMON,
  readRegistration: path => readBoundedText(path, { maxBytes: 4096 }).trim(),
  uid: () => process.getuid(), canonical: realpathSync,
  stat: path => { const st = lstatSync(path); if (st.isSymbolicLink()) throw Error('Package executable is a symlink'); return st; },
  productionStat: statSync,
  git: async (args, checkout) => (await exec('git', ['-C', checkout, ...args], { timeout: 5000, maxBuffer: 65536, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME } })).stdout.trim(),
  fingerprint: treeFingerprint,
  readStamp: async path => JSON.parse(readBoundedText(path, { maxBytes: 65536 })),
  readOptionalStamp: async path => {
    try { lstatSync(path); } catch (error) { if(error.code==='ENOENT') return null; throw error; }
    return JSON.parse(readBoundedText(path,{maxBytes:65536}));
  },
};
function fileIdentity(path, deps) {
  if (deps.canonical(path) !== path) throw Error('Package executable must be canonical, not symlinked');
  const st = deps.stat(path);
  if (!st.isFile() || st.isSymbolicLink?.() || st.uid !== deps.uid()) throw Error('Package executable regular-file owner identity rejected');
  if ((st.mode & 0o022) || (st.mode & 0o6000) || !(st.mode & 0o100)) throw Error('Package executable writable/privileged/not executable');
  if (![st.dev,st.ino,st.uid,st.mode].every(Number.isSafeInteger)) throw Error('Package executable stat identity unavailable');
  for (const production of PRODUCTION_PATHS) {
    let installed;
    try { installed = (deps.productionStat ?? deps.stat)(production); }
    catch (error) { if (['ENOENT','ENOTDIR'].includes(error.code)) continue; throw error; }
    if (installed.dev === st.dev && installed.ino === st.ino) throw Error('Package aliases production executable inode (including hardlink)');
  }
  return { dev: st.dev, ino: st.ino, uid: st.uid, mode: st.mode };
}
export function assertPackageIdentity(binary, receipt, dependencies = defaults) {
  const deps = { ...defaults, ...dependencies };
  // Custom offline dependency tables use their own production stat too.
  if (dependencies !== defaults && dependencies.stat && !dependencies.productionStat) deps.productionStat = dependencies.stat;
  if (!receipt || binary !== join(receipt.packageRoot, 'youcoded') || receipt.packageRoot !== join(receipt.checkout, 'desktop/release/linux-unpacked')) throw Error('Package receipt identity binding rejected');
  const current = fileIdentity(binary, deps);
  if (!receipt.identity || ['dev','ino','uid','mode'].some(k => current[k] !== receipt.identity[k])) throw Error('Package executable identity changed');
  return current;
}
export async function authorizeSupervisorPackage({ checkout, binary }, dependencies = defaults) {
  const deps = { ...defaults, ...dependencies };
  if (dependencies !== defaults && dependencies.stat && !dependencies.productionStat) deps.productionStat = dependencies.stat;
  assertApprovedCheckoutPath(checkout, deps);
  const packageRoot = join(checkout, 'desktop/release/linux-unpacked');
  if (binary !== join(packageRoot,'youcoded')) throw Error('Supervisor requires approved official package root');
  const top = await deps.git(['rev-parse','--show-toplevel'], checkout);
  const common = await deps.git(['rev-parse','--path-format=absolute','--git-common-dir'], checkout);
  const gitDir = await deps.git(['rev-parse','--absolute-git-dir'], checkout);
  const child = relative(join(common,'worktrees'), gitDir);
  if (common !== deps.expectedCommon || deps.canonical(common) !== common || top !== checkout || !child || child.startsWith('..') || child.includes('/') || gitDir === common || deps.canonical(gitDir) !== gitDir) throw Error('Approved checkout is not an isolated Git worktree of the expected app repository');
  const registered = await deps.git(['worktree','list','--porcelain'], dirname(deps.expectedCommon));
  if (!registered.split('\n\n').some(record => record.split('\n').includes(`worktree ${checkout}`))
    || deps.readRegistration(join(gitDir, 'gitdir')) !== join(checkout, '.git')) throw Error('Approved checkout Git worktree registration/backlink rejected');
  if (deps.canonical(packageRoot) !== packageRoot) throw Error('Supervisor requires approved official package root');
  const stamp = await deps.readStamp(join(dirname(packageRoot),'.perf-lab-build.json'));
  if (!stamp || typeof stamp.sha !== 'string' || !/^[a-f0-9]{6,40}$/.test(stamp.sha) || typeof stamp.dirty !== 'string' || !/^[a-f0-9]{12}$/.test(stamp.dirty)
    || typeof stamp.builtAt !== 'string' || !Number.isFinite(Date.parse(stamp.builtAt))) throw Error('Invalid official package stamp');
  const internal = await deps.readOptionalStamp(join(packageRoot,'.perf-lab-build.json'));
  if (internal && ['sha','dirty','builtAt','buildMs'].some(key=>internal[key]!==stamp[key])) throw Error('Conflicting official parent/internal package stamp');
  const current = await deps.fingerprint(checkout);
  if (stamp.sha !== current.sha || stamp.dirty !== current.dirty) throw Error('Official package stamp differs from current checkout fingerprint');
  const identity = fileIdentity(binary,deps);
  return { revision: 1, checkout, checkoutIdentity: { common, gitDir }, packageRoot, stamp: { sha: stamp.sha, dirty: stamp.dirty, builtAt: stamp.builtAt }, identity };
}
export async function reauthorizeSupervisorPackage(plan, dependencies = defaults) {
  const current = await authorizeSupervisorPackage({ checkout: plan.packageReceipt?.checkout, binary: plan.binary }, dependencies);
  // Worker independently re-runs the actual Git/cache validator and executable
  // checks. Controller receipt equality is necessary, never sole authority.
  if (JSON.stringify(current) !== JSON.stringify(plan.packageReceipt)) throw Error('Worker package receipt/fingerprint identity mismatch');
  return current;
}
