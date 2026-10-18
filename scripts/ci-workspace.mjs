// Executable workspace CI routing. No GitHub API, dependencies or repository writes.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function sha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value) || /^0+$/.test(value)) {
    throw new Error(`${label} must be a nonzero immutable commit SHA.`);
  }
  return value.toLowerCase();
}

function ensureCommit(commit) {
  try { git('cat-file', '-e', `${commit}^{commit}`); }
  catch {
    // WHY: a card update must not download the workspace's entire image history.
    // A multi-commit push can put before outside depth=2; fetch only that SHA.
    git('fetch', '--no-tags', '--depth=1', 'origin', commit);
    git('cat-file', '-e', `${commit}^{commit}`);
  }
}

function laneForEvent(env) {
  const eventName = env.GITHUB_EVENT_NAME;
  if (!eventName) throw new Error('GITHUB_EVENT_NAME is required.');
  // WHY: scheduled/manual runs backstop cross-repository drift even without a
  // workspace edit. Future events and empty diffs must not become fast lanes.
  if (!['push', 'pull_request'].includes(eventName)) return 'full';
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const head = git('rev-parse', '--verify', 'HEAD').trim();
  if (sha(env.GITHUB_SHA, 'GITHUB_SHA') !== head) throw new Error('Checkout does not match the candidate SHA.');
  let range;
  if (eventName === 'push') {
    const after = sha(event.after, 'push after');
    if (after !== head) throw new Error('Push after does not match the checked-out candidate.');
    if (typeof event.before === 'string' && /^0{40}$/.test(event.before)) return 'full';
    const before = sha(event.before, 'push before');
    ensureCommit(before);
    range = `${before}..${after}`;
  } else {
    const base = sha(event.pull_request?.base?.sha, 'PR base');
    const prHead = sha(event.pull_request?.head?.sha, 'PR head');
    ensureCommit(base);
    ensureCommit(prHead);
    // GitHub checks out the synthetic merge commit; it must include this PR's head.
    git('merge-base', '--is-ancestor', prHead, head);
    range = `${base}...${head}`;
  }
  // WHY: early grep termination plus pipefail can misclassify code as data.
  // Consume the entire NUL stream; no-renames includes BOTH old and new paths.
  const raw = git('diff', '--name-only', '-z', '--no-renames', range, '--');
  const paths = raw.split('\0').filter(Boolean);
  const card = /^cards\/[1-9]\d*-[^/\r\n]+\.md$/;
  return paths.length > 0 && paths.every(path => card.test(path)) ? 'cards' : 'full';
}

function assertGate(needs) {
  // WHY: routing is not evidence of success. Require the selected job to pass,
  // the unselected job to be skipped, and classification to have succeeded.
  if (!needs || Array.isArray(needs) || Object.keys(needs).sort().join(',') !== 'cards,changes,full') {
    throw new Error('CI gate requires exactly changes, cards and full dependency results.');
  }
  const lane = needs.changes?.outputs?.lane;
  if (needs.changes?.result !== 'success' || !['cards', 'full'].includes(lane)) throw new Error('CI classification did not succeed.');
  const other = lane === 'cards' ? 'full' : 'cards';
  if (needs[lane]?.result !== 'success' || needs[other]?.result !== 'skipped') {
    throw new Error(`CI gate rejected ${lane}: selected lane must succeed and ${other} must be skipped.`);
  }
}

try {
  if (process.argv[2] === 'changes') {
    const lane = laneForEvent(process.env);
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
    // Publish only after every read/ref/diff has succeeded. Never emit on errors.
    appendFileSync(process.env.GITHUB_OUTPUT, `lane=${lane}\n`);
    console.log(`Workspace CI lane: ${lane}`);
  } else if (process.argv[2] === 'gate') {
    assertGate(JSON.parse(process.env.NEEDS_JSON ?? 'null'));
    console.log('Workspace CI selected checks passed.');
  } else {
    throw new Error('Usage: node scripts/ci-workspace.mjs changes|gate');
  }
} catch (error) {
  console.error(`workspace CI: ${error.message}`);
  process.exitCode = 1;
}
