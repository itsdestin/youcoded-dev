#!/usr/bin/env node
// prepare-home.mjs — get a test copy's PRIVATE home folder ready, and lend it the sign-ins this launch keeps.
//
// WHY (card #17, Destin 2026-11-11): a test copy of the app used to run in the real home folder, so its chats landed in
// the real chat list (and synced to his other devices), and removing a provider or picking a theme in it changed the real
// app. The rule now: a test copy ALWAYS runs in a private throwaway home; by default his sign-ins are lent to it; each
// one can be switched off per launch. `scripts/run-dev.sh` calls this just before it starts the app.
//
// THE KEY IDEA — LEND A PASS, NEVER THE RENEWAL KEY. Claude Code and ChatGPT each store two things: a short-lived pass
// (works for hours/days) and a renewal key (mints the next pass, and is REPLACED each time it is used). If a test copy
// held a copy of the renewal key and used it, the real app's copy could stop working: he would be signed out of his real
// app. So the test copy gets the pass only. When the pass runs out, the test copy's sign-in ends (relaunch to borrow a
// fresh one); the real app never notices. Saved API keys do not renew, so they are simply copied.
//
// What this script NEVER does: write, rename or delete anything outside the private home; print a secret; touch the
// network. It only READS five real files: ~/.claude/.credentials.json, ~/.youcoded/providers.json, and in the real app's
// data folder native-secrets.json and chatgpt-account.json (pinned by prepare-home.test.mjs).
//
// Usage: node prepare-home.mjs --home <private home> --real-home <real home> --profile <name> --desktop <checkout>/desktop
//                              --keep <comma list of: claude-code,chatgpt,api-keys>   (empty list = lend nothing)
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIGNINS = ['claude-code', 'chatgpt', 'api-keys'];
/** Stands in for the renewal key. Must be a non-empty string or the app calls the saved sign-in damaged
 *  (chatgpt-auth.ts parseTokenBlob); OpenAI refuses it, and the test copy then signs ITSELF out — nothing real. */
export const NO_RENEWAL = 'lent-to-a-test-copy-no-renewal-key';
/** A borrowed pass with less than this left is not worth lending: the test copy would be signed out within minutes. */
const MIN_LEFT_MS = 10 * 60 * 1000;
/** What an earlier launch lent, so this launch can take it back before lending again (see takeBack). */
const LENT_FILE = '.lent-signins.json';

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
// WHY write-then-rename with mode 600: these files hold passes and keys; a half-written file must never be read by the
// app, and nobody else on the computer should be able to read them.
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);

/** The folders a test copy must never share with the real app. */
export function protectedFolders(realHome) {
  return ['.claude', '.youcoded', 'YouCoded', join('.config', 'youcoded')].map((p) => join(realHome, p));
}

/** Refuse a private home that is the real home, contains it, or sits inside one of the real app's own folders. */
export function assertPrivateHome(home, realHome) {
  const h = real(home); const r = real(realHome);
  if (inside(r, h)) throw new Error(`the private home (${h}) is, or contains, the real home (${r})`);
  for (const p of protectedFolders(r)) {
    if (inside(h, real(p))) throw new Error(`the private home (${h}) sits inside the real app's folder ${p}`);
  }
}

// ---- Claude Code ------------------------------------------------------------------------------------------------------

/** The real sign-in with the renewal key removed. Returns null when there is nothing usable to lend. */
export function lendableClaudeCode(realCreds, now = Date.now()) {
  const o = realCreds?.claudeAiOauth;
  if (!o || typeof o.accessToken !== 'string' || !o.accessToken) return { creds: null, why: 'the real app is not signed in to Claude Code' };
  if (typeof o.expiresAt === 'number' && o.expiresAt - now < MIN_LEFT_MS) {
    return { creds: null, why: 'the real app\'s current Claude Code pass has run out (it renews when the real app next uses Claude Code); relaunch after that' };
  }
  // eslint-disable-next-line no-unused-vars
  const { refreshToken, refreshTokenExpiresAt, ...pass } = o;
  return { creds: { claudeAiOauth: pass }, expiresAt: o.expiresAt ?? null };
}

// ---- keychain (ChatGPT only; API keys are copied still locked) ------------------------------------------------------

/** Lock or unlock values with the system keychain through scripts/dev-signins/keychain-tool.cjs, run by the checkout's own
 *  Electron. Values travel over stdin and a 0600 file in a private scratch folder that is deleted right after. */
export function keychain(op, values, { desktop, appName, env = process.env }) {
  const electron = join(desktop, 'node_modules', '.bin', 'electron');
  if (!existsSync(electron)) return { ok: false, why: `no Electron at ${electron}` };
  const tool = join(dirname(fileURLToPath(import.meta.url)), 'keychain-tool.cjs');
  const scratch = mkdtempSync(join(tmpdir(), 'youcoded-test-keychain-'));
  chmodSync(scratch, 0o700);
  try {
    // WHY ask Electron which keychain first: the tool must name it explicitly, because a brand-new scratch profile would
    // otherwise fall back to "no protection" on some desktops. Same reason as the app's keychain-launch.ts.
    const run = (backendFlag, request) => {
      const out = join(scratch, 'out.json');
      rmSync(out, { force: true });
      const childEnv = { ...env, KEYCHAIN_TOOL_NAME: appName, KEYCHAIN_TOOL_SCRATCH: scratch, KEYCHAIN_TOOL_OUT: out };
      delete childEnv.ELECTRON_RUN_AS_NODE; delete childEnv.NODE_OPTIONS;
      spawnSync(electron, [tool, ...backendFlag, `--user-data-dir=${scratch}`], {
        input: JSON.stringify(request), env: childEnv, cwd: scratch, stdio: ['pipe', 'ignore', 'ignore'], timeout: 60_000,
      });
      return readJson(out);
    };
    const probe = run([], { op: 'backend', values: [] });
    const flag = { kwallet: 'kwallet', kwallet5: 'kwallet5', kwallet6: 'kwallet6', gnome_libsecret: 'gnome-libsecret' }[probe?.backend];
    const answer = run(flag ? [`--password-store=${flag}`] : [], { op, values });
    if (!answer?.ok) return { ok: false, why: 'the system keychain did not answer' };
    return { ok: true, values: answer.values };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The ChatGPT sign-in with the renewal key swapped for a dud. `unlocked` is the real blob as text. */
export function lendableChatGpt(unlocked, now = Date.now()) {
  let blob; try { blob = JSON.parse(unlocked); } catch { blob = null; }
  if (!blob || typeof blob.access_token !== 'string' || !blob.access_token || typeof blob.expires_at !== 'number') {
    return { blob: null, why: 'the real ChatGPT sign-in could not be read' };
  }
  if (blob.expires_at - now < MIN_LEFT_MS) {
    return { blob: null, why: 'the real app\'s current ChatGPT pass has run out (it renews when the real app next uses ChatGPT); relaunch after that' };
  }
  return { blob: { ...blob, refresh_token: NO_RENEWAL }, expiresAt: blob.expires_at };
}

// ---- the private home -------------------------------------------------------------------------------------------------

/** Take back everything an earlier launch lent, so "switched off" is really off on a reused home. Things the tester
 *  added inside the test copy (their own key, their own sign-in) are left alone. */
function takeBack(home, userData) {
  const lent = readJson(join(home, LENT_FILE)) ?? {};
  if (lent.claudeCode) rmSync(join(home, '.claude', '.credentials.json'), { force: true });
  if (lent.chatgpt) rmSync(join(userData, 'chatgpt-account.json'), { force: true });
  const refs = new Set(lent.refs ?? []);
  if (refs.size) {
    const store = readJson(join(userData, 'native-secrets.json')) ?? {};
    for (const r of refs) delete store[r];
    writeJson(join(userData, 'native-secrets.json'), store);
  }
  const ids = new Set(lent.providerIds ?? []);
  if (ids.size) {
    const file = join(home, '.youcoded', 'providers.json');
    const cur = readJson(file);
    if (cur && Array.isArray(cur.providers)) writeJson(file, { ...cur, providers: cur.providers.filter((p) => !ids.has(p.id)) });
  }
  rmSync(join(home, LENT_FILE), { force: true });
}

/** What a brand-new home needs before the app is usable in it. Each step only fills a gap; nothing is overwritten. */
function seedFreshHome(home, profile, desktop) {
  mkdirSync(home, { recursive: true });
  chmodSync(home, 0o700);
  // First-run wizard: the app opens on its setup wizard unless this says setup is done (first-run.ts). run-dev.sh points
  // the app at toolkit-state-<profile> through YOUCODED_TOOLKIT_STATE_DIR.
  const wizard = join(home, '.claude', `toolkit-state-${profile}`, 'config.json');
  if (!existsSync(wizard)) writeJson(wizard, { setup_completed: true });
  // WHY: the app lists past chats from this folder at start and logs an error stack when it is missing.
  mkdirSync(join(home, '.claude', 'projects'), { recursive: true });
  // Claude Code's own first-run screens (theme picker, welcome) would sit in front of the first test chat.
  const cc = join(home, '.claude.json');
  if (!existsSync(cc)) writeJson(cc, { hasCompletedOnboarding: true });
  // WHY hooks here: a test copy skips installing the app's chat hooks (in the real home they would point the real app at
  // this checkout's files). A private home has none at all, and without them a new chat sits on "Initializing" forever.
  // Here they are installed from the checkout under test, into the private home only.
  const hookResult = spawnSync(process.execPath, ['-e', `
    const fs = require('fs'), path = require('path'), os = require('os');
    const ih = require(${JSON.stringify(join(desktop, 'scripts', 'install-hooks.js'))});
    const file = path.join(os.homedir(), '.claude', 'settings.json');
    let settings = {}; try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const { hookDir } = ih.stageHookScripts({ stamp: 'test-copy|dev' });
    ih.applyAppHooks(settings, hookDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  `], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30_000 });
  return hookResult.status === 0 ? null : `chat hooks could not be installed (${(hookResult.stderr || '').trim().split('\n').pop() || 'unknown reason'})`;
}

/**
 * Prepare `home` and lend the sign-ins in `keep`. Returns one line per sign-in for the launcher to print:
 * { name, state: 'lent' | 'off' | 'unavailable', note }.
 */
export function prepareHome({ home, realHome, profile, desktop, keep, now = Date.now(), keychainFn = keychain }) {
  assertPrivateHome(home, realHome);
  const report = [];
  const warnings = [];
  const hookProblem = seedFreshHome(home, profile, desktop);
  if (hookProblem) warnings.push(hookProblem);

  // The app's data folder inside the private home (main.ts: <config>/youcoded-<profile>); run-dev.sh points XDG_CONFIG_HOME
  // at <home>/.config. The real app's is <real home>/.config/youcoded.
  const userData = join(home, '.config', `youcoded-${profile}`);
  const realUserData = join(realHome, '.config', 'youcoded');
  takeBack(home, userData);
  const lent = { claudeCode: false, chatgpt: false, refs: [], providerIds: [] };
  const until = (ms) => (ms ? `works until about ${new Date(ms).toLocaleString()}` : 'no end time recorded');

  // Claude Code
  if (!keep.includes('claude-code')) report.push({ name: 'Claude Code', state: 'off', note: 'switched off for this launch' });
  else {
    const r = lendableClaudeCode(readJson(join(realHome, '.claude', '.credentials.json')), now);
    if (!r.creds) report.push({ name: 'Claude Code', state: 'unavailable', note: r.why });
    else {
      writeJson(join(home, '.claude', '.credentials.json'), r.creds);
      lent.claudeCode = true;
      report.push({ name: 'Claude Code', state: 'lent', note: `${until(r.expiresAt)}; then relaunch to borrow a fresh pass` });
    }
  }

  const realStore = readJson(join(realUserData, 'native-secrets.json')) ?? {};
  const store = readJson(join(userData, 'native-secrets.json')) ?? {};

  // Saved API keys: the provider list plus each key, copied still locked (the test copy unlocks them with the same
  // system keychain the real app uses). Removing or changing one in the test copy changes only this private copy.
  if (!keep.includes('api-keys')) report.push({ name: 'Saved API keys', state: 'off', note: 'switched off for this launch' });
  else {
    const realProviders = readJson(join(realHome, '.youcoded', 'providers.json'));
    const keyed = (realProviders?.providers ?? []).filter((p) => typeof p.secretRef === 'string' && realStore[p.secretRef]);
    if (!keyed.length) report.push({ name: 'Saved API keys', state: 'unavailable', note: 'the real app has no saved API keys' });
    else {
      const file = join(home, '.youcoded', 'providers.json');
      const cur = readJson(file);
      const mine = (cur?.providers ?? []).filter((p) => !keyed.some((k) => k.id === p.id));
      writeJson(file, { ...(cur ?? { v: realProviders.v }), providers: [...mine, ...keyed] });
      for (const p of keyed) { store[p.secretRef] = realStore[p.secretRef]; lent.refs.push(p.secretRef); lent.providerIds.push(p.id); }
      report.push({ name: 'Saved API keys', state: 'lent', note: keyed.map((p) => p.label || p.id).join(', ') });
    }
  }

  // ChatGPT
  if (!keep.includes('chatgpt')) report.push({ name: 'ChatGPT', state: 'off', note: 'switched off for this launch' });
  else {
    const account = readJson(join(realUserData, 'chatgpt-account.json'));
    const locked = account?.secretRef ? realStore[account.secretRef] : null;
    if (!account || !locked) report.push({ name: 'ChatGPT', state: 'unavailable', note: 'the real app is not signed in to ChatGPT' });
    else {
      const appName = profile === 'dev' ? 'YouCoded Dev' : `YouCoded Dev (${profile})`;
      const opened = keychainFn('decrypt', [locked], { desktop, appName });
      const r = opened.ok && opened.values[0] ? lendableChatGpt(opened.values[0], now) : { blob: null, why: opened.why || 'the system keychain could not unlock the real ChatGPT sign-in' };
      const relocked = r.blob ? keychainFn('encrypt', [JSON.stringify(r.blob)], { desktop, appName }) : null;
      if (!r.blob || !relocked?.ok || !relocked.values[0]) report.push({ name: 'ChatGPT', state: 'unavailable', note: r.why || relocked?.why || 'the system keychain could not lock the test copy\'s ChatGPT pass' });
      else {
        store[account.secretRef] = relocked.values[0];
        lent.refs.push(account.secretRef);
        writeJson(join(userData, 'chatgpt-account.json'), account);
        lent.chatgpt = true;
        report.push({ name: 'ChatGPT', state: 'lent', note: `${until(r.expiresAt)}; then relaunch to borrow a fresh pass` });
      }
    }
  }

  if (lent.refs.length) writeJson(join(userData, 'native-secrets.json'), store);
  writeJson(join(home, LENT_FILE), lent);
  return { report, warnings };
}

// ---- command line -----------------------------------------------------------------------------------------------------
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const need = (name) => { const v = arg(name); if (v === undefined) { console.error(`prepare-home: --${name} is required`); process.exit(2); } return v; };
  const keep = (arg('keep') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = keep.filter((k) => !SIGNINS.includes(k));
  if (unknown.length) { console.error(`prepare-home: unknown sign-in: ${unknown.join(', ')} (known: ${SIGNINS.join(', ')})`); process.exit(2); }
  try {
    const { report, warnings } = prepareHome({ home: need('home'), realHome: need('real-home'), profile: need('profile'), desktop: need('desktop'), keep });
    const word = { lent: 'kept', off: 'OFF', unavailable: 'NOT AVAILABLE' };
    for (const r of report) console.log(`  ${`${r.name}:`.padEnd(15)}${word[r.state]} (${r.note})`);
    for (const w of warnings) console.log(`  Warning:       ${w}`);
  } catch (e) {
    console.error(`prepare-home: ${e.message}`);
    process.exit(1);
  }
}
