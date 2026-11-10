// dev-chat's promises, against a STUB page (no app, no Chrome): it can only reach a dev window,
// `say` uses real key events and presses Enter once, `mode` clicks until the chip reads right,
// `click` refuses ambiguity, `new` makes a Claude Code chat and trusts the folder.
// NOT proven here: that any of it works against a real dev window (see docs/local-dev.md).
// Run: node --test scripts/shoot/tests/dev-chat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevMarker, attachDev, clickLabel, newChat, say, setMode } from '../dev-chat-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const noSleep = async () => {};

/** A stub tab: `handlers` map a substring of the evaluated source to a value (or function). */
function stubTab(handlers, { onSend } = {}) {
  const sent = [];
  return {
    sent,
    evaluate: async (expr) => {
      for (const [k, v] of Object.entries(handlers)) if (expr.includes(k)) return typeof v === 'function' ? v(expr) : v;
      return null;
    },
    send: async (method, params) => { sent.push({ method, params }); onSend?.(method, params); },
    png: async () => Buffer.from('png'),
    close: async () => { stubTab.closed = true; },
  };
}

// ─── Only a dev window ───────────────────────────────────────────────────────
test('no marker: refuses, never calls attachPage', async () => {
  let attached = false;
  await assert.rejects(
    attachDev('/x', { findDevWindow: () => { throw new Error('no dev window is running'); }, attachPage: async () => { attached = true; } }),
    /no dev window/);
  assert.equal(attached, false);
});

test('a malformed marker is refused', () => {
  assert.throws(() => assertDevMarker({ pid: 1 }), /no valid dev-window marker/);
  assert.throws(() => assertDevMarker(null), /no valid dev-window marker/);
});

test('attaches through the marker\'s own ports; a page that is not the dev server is refused and detached', async () => {
  const marker = { pid: 7, devtoolsPort: 9272, vitePort: 5223 };
  const run = async (origin) => {
    const seen = []; let closed = false;
    const deps = {
      readCmd: () => 'bash\0scripts/run-dev.sh\0x',
      findDevWindow: () => marker,
      attachPage: async (...a) => { seen.push(a); return { evaluate: async (e) => (e === 'location.origin' ? origin : true), close: async () => { closed = true; } }; },
    };
    return { seen, get closed() { return closed; }, p: attachDev('/x', deps) };
  };
  const good = await run('http://localhost:5223');
  await good.p;
  assert.deepEqual(good.seen, [[9272, 'http://localhost:5223']]);
  const bad = await run('file://');
  await assert.rejects(bad.p, /refusing to drive a page at file:\/\//);
  assert.equal(bad.closed, true);
});

test('a marker whose process is not run-dev.sh is refused even if findDevWindow returned it', async () => {
  await assert.rejects(attachDev('/x', { readCmd: () => '/opt/YouCoded/youcoded', findDevWindow: () => ({ pid: 7, devtoolsPort: 1, vitePort: 2 }), attachPage: async () => { throw new Error('must not attach'); } }), /not run-dev\.sh/);
});

test('source guard: no port or URL option and no connection of its own; the engine\'s attach is the only way in', () => {
  for (const f of ['dev-chat.mjs', 'dev-chat-lib.mjs']) {
    // Comments may name what is forbidden; only code is checked.
    const src = readFileSync(join(HERE, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /new WebSocket|\/json\/version|\b9222\b|['"]--port|['"]--url|\/opt\/YouCoded/i, `${f} must not open its own connection`);
  }
  assert.match(readFileSync(join(HERE, '..', 'dev-chat.mjs'), 'utf8'), /attachDev\(checkout, \{ findDevWindow, attachPage \}\)/);
});

// ─── say ─────────────────────────────────────────────────────────────────────
test('say: real insertText then ONE real Enter (keyDown + keyUp), reports sent once the box empties', async () => {
  let value = '';
  const tab = stubTab({
    'focus()': true,
    'return t ? t.value.length': () => value.length,
    'return t ? t.value : null': () => value,
  }, { onSend: (m, p) => { if (m === 'Input.insertText') value = p.text; if (m === 'Input.dispatchKeyEvent' && p.type === 'keyDown') value = ''; } });
  const long = 'x'.repeat(5000);
  const out = await say(tab, long, { sleep: noSleep });
  assert.match(out, /sent \(5000 characters\)/);
  const methods = tab.sent.map((s) => `${s.method}:${s.params.type ?? ''}`);
  assert.deepEqual(methods, ['Input.insertText:', 'Input.dispatchKeyEvent:keyDown', 'Input.dispatchKeyEvent:keyUp']);
  assert.equal(tab.sent[1].params.key, 'Enter');
  assert.equal(tab.sent[1].params.windowsVirtualKeyCode, 13);
});

test('say: text still in the box is reported as stuck and Enter is NOT pressed a second time', async () => {
  let value = '';
  const tab = stubTab({ 'focus()': true, 'return t ? t.value.length': () => value.length, 'return t ? t.value : null': () => value },
    { onSend: (m, p) => { if (m === 'Input.insertText') value = p.text; } });
  await assert.rejects(say(tab, 'hello', { sleep: noSleep, waitMs: 0 }), /still in the box.*NOT pressed again/);
  assert.equal(tab.sent.filter((s) => s.params.type === 'keyDown').length, 1);
});

test('say: no message box, or text that did not all arrive, sends nothing', async () => {
  await assert.rejects(say(stubTab({ 'focus()': false }), 'hi', { sleep: noSleep }), /no message box/);
  let value = '';
  const tab = stubTab({ 'focus()': true, 'return t ? t.value : null': () => value }, { onSend: (m) => { if (m === 'Input.insertText') value = 'hi'; } });
  await assert.rejects(say(tab, 'hello there', { sleep: noSleep }), /not sending/);
  assert.equal(tab.sent.some((s) => s.params.type === 'keyDown'), false);
});

// ─── click ───────────────────────────────────────────────────────────────────
test('click: a real mouse move, press and release at the button\'s centre', async () => {
  const tab = stubTab({ 'document.querySelectorAll': { x: 40, y: 50, label: 'allow once' } });
  assert.equal(await clickLabel(tab, 'Allow once', { sleep: noSleep }), 'clicked "allow once"');
  assert.deepEqual(tab.sent.map((s) => s.params.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.equal(tab.sent[1].params.x, 40);
});

test('click: no match lists what is on screen; two matches are refused; a covered button is refused', async () => {
  await assert.rejects(clickLabel(stubTab({ 'document.querySelectorAll': { none: true, seen: ['send', 'stop'] } }), 'Yes', { sleep: noSleep }), /send \| stop/);
  await assert.rejects(clickLabel(stubTab({ 'document.querySelectorAll': { ambiguous: ['yes', 'yes, always'] } }), 'yes', { sleep: noSleep }), /more than one/);
  const covered = stubTab({ 'document.querySelectorAll': { covered: true, by: 'a dialog' } });
  await assert.rejects(clickLabel(covered, 'Save', { sleep: noSleep }), /covered by a dialog/);
  assert.equal(covered.sent.length, 0);
});

// ─── mode ────────────────────────────────────────────────────────────────────
test('mode: clicks the chip until it reads NORMAL, and does not click when already there', async () => {
  const order = ['AUTO MODE', 'ACCEPT CHANGES', 'NORMAL'];
  let i = 0;
  const tab = stubTab({ 'cycle permission mode': () => ({ text: order[i], x: 5, y: 6 }) }, { onSend: (m, p) => { if (p.type === 'mouseReleased') i++; } });
  assert.equal(await setMode(tab, 'normal', { sleep: noSleep }), 'mode is now NORMAL');
  assert.equal(tab.sent.filter((s) => s.params.type === 'mousePressed').length, 2);
  const already = stubTab({ 'cycle permission mode': { text: 'AUTO MODE', x: 1, y: 1 } });
  await setMode(already, 'auto', { sleep: noSleep });
  assert.equal(already.sent.length, 0);
  await assert.rejects(setMode(already, 'bypass', { sleep: noSleep }), /normal" or "auto/);
});

test('mode: a chip that never reaches the mode gives up with what it reads', async () => {
  const tab = stubTab({ 'cycle permission mode': { text: 'PLAN MODE', x: 1, y: 1 } });
  await assert.rejects(setMode(tab, 'auto', { sleep: noSleep }), /6 clicks.*PLAN MODE/);
});

// ─── new ─────────────────────────────────────────────────────────────────────
test('new: creates a Claude Code chat in the folder (not the native runtime) and clicks the trust button', async () => {
  let created = null; let polls = 0;
  const tab = stubTab({
    'window.claude.session.create': (e) => { created = e; return { id: 's-1' }; },
    'data-chat-session-id': true,
    'trust': () => (++polls < 2 ? null : { x: 9, y: 9, text: 'Yes, I trust this folder' }),
    'form textarea': null,
  });
  const out = await newChat(tab, tmpdir(), { sleep: noSleep, trustWaitMs: 5000 });
  assert.match(out, /session s-1, trusted the folder/);
  assert.match(created, /"provider":"claude"/);
  assert.match(created, /"skipPermissions":false/);
  assert.ok(created.includes(JSON.stringify(tmpdir()).slice(1, -1)));
  assert.equal(tab.sent.filter((s) => s.params.type === 'mousePressed').length, 1);
});

test('new: a missing folder or a failed create is a plain error', async () => {
  await assert.rejects(newChat(stubTab({}), '/no/such/folder/here', { sleep: noSleep }), /is not a folder/);
  await assert.rejects(newChat(stubTab({ 'window.claude.session.create': { error: 'boom' } }), tmpdir(), { sleep: noSleep }), /session\.create failed: boom/);
});
