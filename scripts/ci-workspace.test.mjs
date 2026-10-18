import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./ci-workspace.mjs', import.meta.url));
const CARDS = fileURLToPath(new URL('./cards.mjs', import.meta.url));
const WORKFLOW = fileURLToPath(new URL('../.github/workflows/workspace-ci.yml', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, path, content = 'fixture\n') => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };

function fixture(t, files = { 'cards/1-one.md': 'before\n' }) {
  const root = mkdtempSync(join(tmpdir(), 'workspace-ci-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', join(root, 'no-hooks'));
  for (const [path, content] of Object.entries(files)) put(root, path, content);
  const commit = () => { git(root, 'add', '--all'); git(root, 'commit', '-qm', 'Fixture\n\nSubmitted via YouCoded Assistant'); return git(root, 'rev-parse', 'HEAD'); };
  const base = commit();
  function run({ eventName = 'push', event, before = base, after = git(root, 'rev-parse', 'HEAD'), rawEvent, checkout = root, script = SCRIPT } = {}) {
    const payload = event ?? (eventName === 'pull_request' ? { pull_request: { base: { sha: before }, head: { sha: after } } } : { before, after });
    const eventPath = join(root, 'event.json');
    const output = join(root, 'output');
    writeFileSync(eventPath, rawEvent ?? JSON.stringify(payload));
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [script, 'changes'], { cwd: checkout, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: git(checkout, 'rev-parse', 'HEAD'), GITHUB_OUTPUT: output } });
    return { ...result, output: readFileSync(output, 'utf8') };
  }
  return { root, base, commit, run };
}

function expectLane(result, lane) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `lane=${lane}\n`);
}

test('card-only pushes and PRs select whole-graph validation', (t) => {
  const f = fixture(t);
  put(f.root, 'cards/1-one.md', 'changed\n'); f.commit();
  expectLane(f.run(), 'cards');
  expectLane(f.run({ eventName: 'pull_request' }), 'cards');
});

test('mixed, infrastructure, unknown and non-card files use full checks', (t) => {
  for (const path of ['docs/shipped.md', 'scripts/cards.mjs', '.github/workflows/workspace-ci.yml', 'unknown.txt', 'cards/program.js', 'cards/README.md']) {
    const f = fixture(t);
    put(f.root, 'cards/1-one.md', 'changed\n'); put(f.root, path); f.commit();
    expectLane(f.run(), 'full');
  }
});

test('deleted cards still use whole-graph validation', (t) => {
  const f = fixture(t, { 'cards/1-one.md': 'one\n', 'cards/2-two.md': 'two\n' });
  rmSync(join(f.root, 'cards/1-one.md')); f.commit();
  expectLane(f.run(), 'cards');
});

test('renames classify both old and new paths across the cards boundary', (t) => {
  for (const [from, to] of [['cards/1-one.md', 'docs/one.md'], ['docs/one.md', 'cards/1-one.md']]) {
    const f = fixture(t, { [from]: 'same contents\n' });
    mkdirSync(dirname(join(f.root, to)), { recursive: true });
    renameSync(join(f.root, from), join(f.root, to)); f.commit();
    expectLane(f.run(), 'full');
  }
});

test('NUL-delimited changes cannot hide code after a newline in a filename', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t);
  put(f.root, 'cards/1-one.md\nscripts/hidden.mjs'); f.commit();
  expectLane(f.run(), 'full');
  const g = fixture(t);
  put(g.root, 'cards/2-spaces and\ttabs.md'); g.commit();
  expectLane(g.run(), 'cards');
});

test('large diffs are completely consumed instead of early-exit pipeline classification', (t) => {
  const f = fixture(t);
  for (let n = 2; n < 602; n++) put(f.root, `cards/${n}-${'x'.repeat(100)}.md`);
  put(f.root, 'zz-code.mjs'); f.commit();
  expectLane(f.run(), 'full');
});

test('empty ranges, new branches, scheduled, manual and unknown events stay full', (t) => {
  const f = fixture(t);
  expectLane(f.run(), 'full');
  expectLane(f.run({ before: '0'.repeat(40) }), 'full');
  for (const eventName of ['schedule', 'workflow_dispatch', 'merge_group', 'future_event']) expectLane(f.run({ eventName }), 'full');
});

test('bad refs, missing event data and malformed JSON fail without success output', (t) => {
  const f = fixture(t);
  for (const options of [{ before: 'f'.repeat(40) }, { before: '--bad-option' }, { event: {} }, { eventName: 'pull_request', event: { pull_request: { base: {} } } }, { rawEvent: '{bad' }]) {
    const result = f.run(options);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
  }
});

test('shallow pushes fetch only the missing immutable before revision', (t) => {
  const f = fixture(t);
  put(f.root, 'cards/1-one.md', 'second\n'); f.commit();
  put(f.root, 'cards/1-one.md', 'third\n'); f.commit();
  const checkout = join(f.root, 'shallow');
  execFileSync('git', ['clone', '-q', '--depth=2', pathToFileURL(f.root).href, checkout], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.throws(() => git(checkout, 'cat-file', '-e', `${f.base}^{commit}`));
  expectLane(f.run({ checkout }), 'cards');
  assert.equal(git(checkout, 'rev-parse', '--is-shallow-repository'), 'true');
});

test('PR routing uses the event base and checks the synthetic merge candidate', (t) => {
  const f = fixture(t);
  git(f.root, 'checkout', '-qb', 'feature');
  put(f.root, 'cards/1-one.md', 'feature\n'); const head = f.commit();
  git(f.root, 'checkout', '-q', f.base);
  put(f.root, 'docs/base-only.md'); const base = f.commit();
  git(f.root, 'merge', '--no-ff', '-qm', 'Fixture merge\n\nSubmitted via YouCoded Assistant', head);
  expectLane(f.run({ eventName: 'pull_request', before: base, after: head }), 'cards');
});

test('push revisions must identify the candidate actually checked out', (t) => {
  const f = fixture(t);
  put(f.root, 'cards/1-one.md', 'changed\n'); f.commit();
  const result = f.run({ after: f.base });
  assert.notEqual(result.status, 0);
  assert.equal(result.output, '');
});

const needs = (lane, cards = 'skipped', full = 'skipped', changes = 'success') => ({ changes: { result: changes, outputs: { lane } }, cards: { result: cards }, full: { result: full } });
function gate(value) {
  return spawnSync(process.execPath, [SCRIPT, 'gate'], { encoding: 'utf8', env: { ...process.env, NEEDS_JSON: typeof value === 'string' ? value : JSON.stringify(value) } });
}

test('completion accepts only each explicitly selected successful lane', () => {
  for (const value of [needs('cards', 'success'), needs('full', 'skipped', 'success')]) {
    const r = gate(value); assert.equal(r.status, 0, r.stderr);
  }
});

test('completion rejects failed, cancelled, missing and unexpectedly skipped jobs', () => {
  for (const status of ['failure', 'cancelled', 'skipped', 'unknown', undefined]) {
    assert.notEqual(gate(needs('cards', status)).status, 0);
    assert.notEqual(gate(needs('full', 'skipped', status)).status, 0);
  }
  for (const value of [needs('cards', 'success', 'success'), needs('full', 'success', 'success'), needs('cards', 'success', 'skipped', 'failure'), needs('maybe', 'success'), {}, '{bad', { changes: { result: 'success', outputs: { lane: 'cards' } }, cards: { result: 'success' } }]) assert.notEqual(gate(value).status, 0);
});

test('whole-graph card validation rejects an unchanged card pointing at a deleted card', (t) => {
  const f = fixture(t, {
    'cards/1-one.md': '---\nid: 1\ntitle: One\nstage: explore\n---\n',
    'cards/2-two.md': '---\nid: 2\ntitle: Two\nstage: explore\nneeds: 1\n---\n',
  });
  const check = () => spawnSync(process.execPath, [CARDS, 'check', '--root', f.root], { encoding: 'utf8' });
  assert.equal(check().status, 0);
  rmSync(join(f.root, 'cards/1-one.md')); f.commit();
  expectLane(f.run(), 'cards');
  const result = check();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /needs 1, but no card/);
});

// WHY parsed cross-file contracts: GitHub YAML conditions/commands are not JS
// ASTs. Substring guards accepted !always() and commented-out validation.
function jobs() {
  const parser = 'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding="utf-8"))))';
  const text = execFileSync(process.env.CI_YAML_PYTHON || 'python3', ['-c', parser, WORKFLOW], { encoding: 'utf8' });
  return JSON.parse(text).jobs;
}
const runnable = (step) => step['continue-on-error'] !== true && [undefined, '${{ !cancelled() }}'].includes(step.if);
const hasCommand = (job, command) => job.steps.some(step => runnable(step) && step.run?.includes(command));
const checkout = (job) => job.steps.find(step => step.uses === 'actions/checkout@v7');
const sparsePaths = (job) => {
  const options = checkout(job).with;
  assert.equal(options?.['sparse-checkout-cone-mode'], false);
  assert.equal(typeof options?.['sparse-checkout'], 'string');
  return options['sparse-checkout'].trim().split('\n').map(line => line.trim());
};

function sparseFixture(t, name, extra = {}) {
  const files = {
    'cards/1-one.md': '---\nid: 1\ntitle: One\nstage: explore\n---\n',
    'cards/2-two.md': '---\nid: 2\ntitle: Two\nstage: explore\nneeds: 1\n---\n',
    'docs/unrelated.png': 'media is not a helper-job input\n',
    'scripts/unrelated.mjs': 'unrelated code\n',
    '.github/workflows/workspace-ci.yml': readFileSync(WORKFLOW, 'utf8'),
    'scripts/ci-workspace.mjs': readFileSync(SCRIPT, 'utf8'),
    'scripts/ci-workspace.test.mjs': readFileSync(fileURLToPath(import.meta.url), 'utf8'),
    'scripts/cards.mjs': readFileSync(CARDS, 'utf8'),
    ...extra,
  };
  const f = fixture(t, files);
  put(f.root, 'cards/2-two.md', files['cards/2-two.md'] + 'Changed progress.\n'); f.commit();
  git(f.root, 'config', 'uploadpack.allowFilter', 'true');
  const dir = join(f.root, 'sparse');
  execFileSync('git', ['clone', '-q', '--no-checkout', '--filter=blob:none', '--depth=2', pathToFileURL(f.root).href, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(dir, 'sparse-checkout', 'init', '--no-cone');
  execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', '--stdin'], { input: sparsePaths(jobs()[name]).join('\n') + '\n', stdio: ['pipe', 'pipe', 'pipe'] });
  git(dir, 'checkout', '-q', 'HEAD');
  assert.equal(existsSync(join(dir, 'docs/unrelated.png')), false);
  assert.equal(existsSync(join(dir, 'scripts/unrelated.mjs')), false);
  return { ...f, checkout: dir };
}

test('small jobs fetch only declared candidate inputs and full fallback stays complete', () => {
  const { changes, cards, anchors, full } = jobs();
  assert.deepEqual(sparsePaths(changes), ['/.github/workflows/workspace-ci.yml', '/scripts/ci-workspace.mjs', '/scripts/ci-workspace.test.mjs', '/scripts/cards.mjs']);
  assert.deepEqual(sparsePaths(cards), ['/cards/', '/scripts/cards.mjs', '/ROADMAP.md', '/docs/roadmap/']);
  assert.deepEqual(sparsePaths(anchors), ['/scripts/ci-workspace.mjs']);
  assert.equal(checkout(full).with?.['sparse-checkout'], undefined);
});

test('real sparse helper checkouts retain routing, complete graph and gate execution', (t) => {
  const routing = sparseFixture(t, 'changes');
  assert.equal(existsSync(join(routing.checkout, 'cards/2-two.md')), false);
  expectLane(routing.run({ checkout: routing.checkout, script: join(routing.checkout, 'scripts/ci-workspace.mjs') }), 'cards');

  const cards = sparseFixture(t, 'cards');
  const check = () => spawnSync(process.execPath, [join(cards.checkout, 'scripts/cards.mjs'), 'check', '--root', cards.checkout], { encoding: 'utf8' });
  assert.equal(check().status, 0);
  rmSync(join(cards.checkout, 'cards/1-one.md'));
  assert.match(check().stderr, /needs 1, but no card/);

  const completion = sparseFixture(t, 'anchors');
  const result = spawnSync(process.execPath, [join(completion.checkout, 'scripts/ci-workspace.mjs'), 'gate'], { encoding: 'utf8', env: { ...process.env, NEEDS_JSON: JSON.stringify(needs('cards', 'success')) } });
  assert.equal(result.status, 0, result.stderr);
});

test('sparse card validation preserves both retired-roadmap rejection checks', (t) => {
  for (const retired of ['ROADMAP.md', 'docs/roadmap/old.md']) {
    const f = sparseFixture(t, 'cards', { [retired]: 'retired\n' });
    assert.equal(existsSync(join(f.checkout, retired)), true);
    const result = spawnSync(process.execPath, [join(f.checkout, 'scripts/cards.mjs'), 'check', '--root', f.checkout], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /roadmap was retired/);
  }
});

test('workflow keeps expensive clones out of cards and validates the checked-out candidate', () => {
  const { cards, full } = jobs();
  assert.equal(cards.needs, 'changes');
  assert.equal(cards.if, "needs.changes.outputs.lane == 'cards'");
  assert.ok(cards.steps.some(step => runnable(step) && step.run === 'node scripts/cards.mjs check --root .'));
  assert.doesNotMatch(cards.steps.map(step => step.run || '').join('\n'), /git clone|audit-anchors|prune-worktrees|perf-lab/);
  assert.equal(full.needs, 'changes');
  assert.equal(full.if, "needs.changes.outputs.lane == 'full'");
  for (const command of ['scripts/audit-anchors.test.mjs', 'scripts/workspace-start.test.mjs', 'scripts/workspace-sync.test.mjs', 'scripts/prune-worktrees.test.mjs', 'scripts/cards.test.mjs', 'scripts/vm/*.test.mjs', 'scripts/perf-lab/tests/', 'scripts/shoot/tests/', 'scripts/luna/', 'python3 -m unittest', 'scripts/check-doc-commands.mjs', 'scripts/audit-anchors.mjs --no-diff', 'scripts/ast-grep/check.sh']) assert.ok(hasCommand(full, command), `full lane executes ${command}`);
  assert.ok(hasCommand(full, 'node scripts/cards.mjs check --root .'));
});

test('workflow always reports the stable gate and checks its own policy before routing', () => {
  const { changes, anchors } = jobs();
  assert.equal(changes.steps.find(step => step.uses === 'actions/checkout@v7').with['fetch-depth'], 2);
  assert.ok(hasCommand(changes, 'node --test scripts/ci-workspace.test.mjs'));
  assert.ok(hasCommand(changes, 'node scripts/ci-workspace.mjs changes'));
  const parser = changes.steps.find(step => step.name === 'Install workflow contract parser');
  assert.ok(parser && runnable(parser));
  assert.ok(parser.run.includes('PyYAML==6.0.3'));
  assert.equal(anchors.name, 'Anchors and invariants');
  assert.equal(anchors.if, 'always()');
  assert.deepEqual(anchors.needs, ['changes', 'cards', 'full']);
  const gate = anchors.steps.find(step => step.run === 'node scripts/ci-workspace.mjs gate');
  assert.ok(gate && runnable(gate));
  assert.equal(gate.env.NEEDS_JSON, '${{ toJSON(needs) }}');
});
