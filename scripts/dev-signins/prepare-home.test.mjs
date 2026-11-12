// prepare-home.test.mjs — the promises card #17 rests on: a test copy's private home gets a pass but never a renewal key,
// "switched off" really removes a sign-in, and the real home's files are never changed.
// Run: node --test scripts/dev-signins/prepare-home.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NO_RENEWAL, assertPrivateHome, lendableClaudeCode, prepareHome } from './prepare-home.mjs';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** A stand-in keychain: "locking" just wraps the text, so the test can read what would have been stored. */
const fakeKeychain = (op, values) => ({
  ok: true,
  values: values.map((v) => (op === 'encrypt' ? `locked:${v}` : v.replace(/^locked:/, ''))),
});

/** Every file under `dir` with a fingerprint of its contents, to prove nothing in the real home changed. */
function fingerprint(dir) {
  const out = {};
  const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else out[p] = createHash('sha256').update(readFileSync(p)).digest('hex'); } };
  walk(dir);
  return out;
}

function fixture({ claudeLeft = 5 * HOUR, chatgptLeft = 48 * HOUR } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prephome-'));
  const realHome = join(root, 'real'); const home = join(root, 'cache', 'test-copies', 'p1', 'home');
  // A stand-in checkout: only the hook installer is needed, and a tiny one is enough.
  const desktop = join(root, 'desktop');
  mkdirSync(join(desktop, 'scripts'), { recursive: true });
  writeFileSync(join(desktop, 'scripts', 'install-hooks.js'),
    'module.exports = { stageHookScripts: () => ({ hookDir: "/hooks" }), applyAppHooks: (s, d) => { s.hooks = { Stop: [d] }; } };');
  const w = (rel, v) => { const f = join(realHome, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(v)); };
  w('.claude/.credentials.json', { claudeAiOauth: { accessToken: 'PASS-CC', refreshToken: 'RENEW-CC', refreshTokenExpiresAt: NOW + 900 * HOUR, expiresAt: NOW + claudeLeft, scopes: ['user:inference'], subscriptionType: 'max' } });
  w('.youcoded/providers.json', { v: 1, providers: [{ id: 'local', type: 'local-engine' }, { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', secretRef: 'REF-OR' }] });
  w('.config/youcoded/native-secrets.json', {
    'REF-OR': 'locked:sk-or-key', 'REF-BANK': 'locked:bank-secret',
    'REF-GPT': `locked:${JSON.stringify({ access_token: 'PASS-GPT', refresh_token: 'RENEW-GPT', id_token: 'ID', expires_at: NOW + chatgptLeft })}`,
  });
  w('.config/youcoded/chatgpt-account.json', { v: 1, secretRef: 'REF-GPT', accountId: 'acct', email: 'someone@example.com', plan: 'free' });
  return { realHome, home, desktop };
}
const run = (fx, keep) => prepareHome({ home: fx.home, realHome: fx.realHome, profile: 'p1', desktop: fx.desktop, keep, now: NOW, keychainFn: fakeKeychain });
const everything = (dir) => Object.keys(fingerprint(dir)).map((f) => readFileSync(f, 'utf8')).join('\n');

test('all three sign-ins are lent, and no renewal key reaches the private home', () => {
  const fx = fixture();
  const before = fingerprint(fx.realHome);
  const { report } = run(fx, ['claude-code', 'chatgpt', 'api-keys']);
  assert.deepEqual(report.map((r) => r.state), ['lent', 'lent', 'lent']);
  const cc = json(join(fx.home, '.claude', '.credentials.json')).claudeAiOauth;
  assert.equal(cc.accessToken, 'PASS-CC');
  assert.equal('refreshToken' in cc, false);
  const store = json(join(fx.home, '.config', 'youcoded-p1', 'native-secrets.json'));
  const gpt = JSON.parse(store['REF-GPT'].replace(/^locked:/, ''));
  assert.equal(gpt.access_token, 'PASS-GPT');
  assert.equal(gpt.refresh_token, NO_RENEWAL);
  assert.equal(store['REF-OR'], 'locked:sk-or-key');
  // Only what a kept sign-in needs is carried: the bank secret stays behind.
  assert.equal('REF-BANK' in store, false);
  const all = everything(fx.home);
  assert.equal(all.includes('RENEW-CC'), false);
  assert.equal(all.includes('RENEW-GPT'), false);
  assert.equal(all.includes('bank-secret'), false);
  // The real home is byte-for-byte what it was.
  assert.deepEqual(fingerprint(fx.realHome), before);
  // A fresh home is usable: setup marked done, Claude Code's first-run skipped, chat hooks installed.
  assert.equal(json(join(fx.home, '.claude', 'toolkit-state-p1', 'config.json')).setup_completed, true);
  assert.equal(json(join(fx.home, '.claude.json')).hasCompletedOnboarding, true);
  assert.ok(json(join(fx.home, '.claude', 'settings.json')).hooks);
  // Readable by this user only.
  assert.equal(statSync(join(fx.home, '.claude', '.credentials.json')).mode & 0o077, 0);
});

test('switching a sign-in off on a reused home takes back what was lent, and keeps what the tester added', () => {
  const fx = fixture();
  run(fx, ['claude-code', 'chatgpt', 'api-keys']);
  // The tester adds a provider and a key of their own inside the test copy.
  const pf = join(fx.home, '.youcoded', 'providers.json'); const p = json(pf);
  p.providers.push({ id: 'mine', type: 'openai', secretRef: 'REF-MINE' }); writeFileSync(pf, JSON.stringify(p));
  const sf = join(fx.home, '.config', 'youcoded-p1', 'native-secrets.json'); const s = json(sf);
  s['REF-MINE'] = 'locked:my-own-key'; writeFileSync(sf, JSON.stringify(s));
  const { report } = run(fx, []);
  assert.deepEqual(report.map((r) => r.state), ['off', 'off', 'off']);
  assert.equal(existsSync(join(fx.home, '.claude', '.credentials.json')), false);
  assert.equal(existsSync(join(fx.home, '.config', 'youcoded-p1', 'chatgpt-account.json')), false);
  assert.deepEqual(Object.keys(json(sf)), ['REF-MINE']);
  assert.deepEqual(json(pf).providers.map((x) => x.id), ['mine']);
  // One sign-in off, the others still lent.
  const r2 = run(fx, ['claude-code', 'api-keys']).report;
  assert.deepEqual(r2.map((r) => r.state), ['lent', 'lent', 'off']);
  assert.deepEqual(json(pf).providers.map((x) => x.id).sort(), ['mine', 'openrouter']);
});

test('a pass that has run out is reported, not lent', () => {
  const fx = fixture({ claudeLeft: 60_000, chatgptLeft: -HOUR });
  const { report } = run(fx, ['claude-code', 'chatgpt']);
  assert.deepEqual(report.map((r) => r.state), ['unavailable', 'off', 'unavailable']);
  assert.equal(existsSync(join(fx.home, '.claude', '.credentials.json')), false);
  assert.equal(lendableClaudeCode(null, NOW).creds, null);
});

test('a private home that is, contains, or sits inside the real app\'s folders is refused', () => {
  const fx = fixture();
  assert.throws(() => assertPrivateHome(fx.realHome, fx.realHome));
  assert.throws(() => assertPrivateHome(join(fx.realHome, '..'), fx.realHome));
  assert.throws(() => assertPrivateHome(join(fx.realHome, '.claude', 'x'), fx.realHome));
  assert.throws(() => assertPrivateHome(join(fx.realHome, 'YouCoded', 'x'), fx.realHome));
  assert.throws(() => prepareHome({ home: fx.realHome, realHome: fx.realHome, profile: 'p1', desktop: fx.desktop, keep: [], now: NOW, keychainFn: fakeKeychain }));
  assert.doesNotThrow(() => assertPrivateHome(join(fx.realHome, '.cache', 'youcoded-test-copies', 'p1', 'home'), fx.realHome));
});
