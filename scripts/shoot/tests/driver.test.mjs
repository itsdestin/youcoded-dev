import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDriver, stepText } from '../driver.mjs';

test('wait-scroll-idle accepts only chat and describes the condition', async () => {
  const driver = makeDriver({ evaluate: async () => true, still: async () => {}, send: async () => {} });
  await assert.rejects(driver.perform({ do: 'wait-scroll-idle', area: 'sidebar' }), /supports only area/);
  assert.equal(stepText({ do: 'wait-scroll-idle', area: 'chat' }), 'wait for chat scrolling to settle');
});

import { runInNewContext } from 'node:vm';

async function observerHarness({ targets, failResizeObserve = false, failMeasureInitially = false } = {}) {
  let now = 0; let seq = 0; let failMeasure = failMeasureInitially; const timers = new Map(); const observers = []; const elements = targets ?? [element()];
  function element({ visible = true, connected = true } = {}) {
    const listeners = new Map();
    return { visible, isConnected: connected, scrollTop: 0, scrollHeight: 100, clientHeight: 50, rect: { x: 0, y: 0, width: 100, height: 50 }, listeners,
      getBoundingClientRect() { if (failMeasure) throw new Error('measure failed'); return this.rect; },
      addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  }
  class Observer { constructor(cb) { this.cb = cb; this.disconnected = false; this.observed = []; observers.push(this); } observe(target, options) { if (failResizeObserve && this instanceof ResizeObs) throw new Error('observe failed'); this.observed.push({ target, options }); } deliver() { this.cb([]); } disconnect() { this.disconnected = true; } }
  class ResizeObs extends Observer {} class MutationObs extends Observer {}
  const clock = { setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; }, clearTimeout(id) { timers.delete(id); },
    async advance(ms) { const end = now + ms; while (true) { let item; let id; for (const [k, t] of timers) if (t.at <= end && (!item || t.at < item.at)) { item = t; id = k; } if (!item) break; now = item.at; timers.delete(id); item.fn(); await Promise.resolve(); await Promise.resolve(); } now = end; await Promise.resolve(); } };
  // Capture the exact function expression sent through the driver's CDP evaluation path.
  let expression;
  const driver = makeDriver({ evaluate: async (code) => { expression = code; return true; }, still: async () => {}, send: async () => {} });
  await driver.perform({ do: 'wait-scroll-idle', area: 'chat' });
  return { elements, observers, timers, clock, expression, createElement: element, setMeasureFailure(value) { failMeasure = value; }, run() { return runInNewContext(this.expression, { document: { querySelectorAll: () => elements }, getComputedStyle: (el) => ({ display: el.visible ? 'block' : 'none', visibility: 'visible' }), ResizeObserver: ResizeObs, MutationObserver: MutationObs, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock), Error }); } };
}

test('wait-scroll-idle registers only the visible connected scroller and ignores unchanged mutations', async () => {
  const h = await observerHarness(); const target = h.elements[0];
  const hidden = h.createElement({ visible: false }); const disconnected = h.createElement({ connected: false });
  h.elements.splice(0, 0, hidden, disconnected);
  const pending = h.run();
  assert.ok(h.observers.every((observer) => observer.observed[0]?.target === target), 'both observers attach to the chosen visible scroller');
  const mutation = h.observers[1];
  assert.equal(JSON.stringify(mutation.observed[0].options), '{"subtree":true,"childList":true,"attributes":true}');
  let settled = false; pending.then(() => { settled = true; });
  for (let t = 0; t < 400; t += 100) { await h.clock.advance(100); mutation.deliver(); }
  await h.clock.advance(100);
  assert.equal(settled, true, 'unchanged mutations must not postpone stable readiness');
  await pending;
  for (const observer of h.observers) observer.deliver();
  assert.equal(h.timers.size, 0, 'late callbacks cannot rearm timers');
  assert.equal(h.timers.size, 0); assert.ok(h.observers.every((o) => o.disconnected)); assert.equal(target.listeners.size, 0);
});

test('wait-scroll-idle resets its quiet window on relevant scroll and cleans up', async () => {
  const h = await observerHarness(); const target = h.elements[0]; const pending = h.run();
  await h.clock.advance(400); target.listeners.get('scroll')();
  await h.clock.advance(499); let settled = false; pending.then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false);
  await h.clock.advance(1); await pending;
  assert.equal(h.timers.size, 0); assert.ok(h.observers.every((o) => o.disconnected)); assert.equal(target.listeners.size, 0);
});

test('wait-scroll-idle detects geometry changes, times out ongoing activity, and rejects a hidden target', async () => {
  const h = await observerHarness(); const target = h.elements[0]; const pending = h.run();
  await h.clock.advance(499); target.rect.width++;
  let resolved = false; pending.then(() => { resolved = true; });
  h.observers.find((o) => o.constructor.name === 'MutationObs').deliver();
  await h.clock.advance(499); await Promise.resolve(); assert.equal(resolved, false, 'changed geometry reported by mutation resets quiet window');
  target.rect.x++;
  h.observers.find((o) => o.constructor.name === 'ResizeObs').deliver();
  await h.clock.advance(499); await Promise.resolve(); assert.equal(resolved, false, 'changed geometry reported by resize resets quiet window');
  await h.clock.advance(1); await pending; assert.equal(h.timers.size, 0);
  for (const observer of h.observers) observer.deliver();
  assert.equal(h.timers.size, 0, 'late callbacks after finish cannot rearm timers');
  const timeout = await observerHarness(); const target2 = timeout.elements[0]; const stuck = timeout.run();
  for (let t = 0; t < 7_600; t += 400) { await timeout.clock.advance(400); target2.listeners.get('scroll')(); }
  await timeout.clock.advance(400);
  assert.match(await stuck.catch((e) => e.message), /did not stabilize/);
  assert.equal(timeout.timers.size, 0); assert.ok(timeout.observers.every((o) => o.disconnected)); assert.equal(target2.listeners.size, 0);
  const hidden = await observerHarness(); const pendingHidden = hidden.run(); hidden.elements[0].visible = false;
  await hidden.clock.advance(500);
  assert.match(await pendingHidden.catch((e) => e.message), /hidden|disconnected/);
  const detached = await observerHarness(); const pendingDetached = detached.run(); detached.elements[0].isConnected = false;
  await detached.clock.advance(500); assert.match(await pendingDetached.catch((e) => e.message), /hidden|disconnected/);
});

test('wait-scroll-idle rejects missing targets and cleans up when measurement or observer setup throws', async () => {
  const missing = await observerHarness({ targets: [] });
  assert.equal(await missing.run().catch((e) => e.message), 'visible chat scroller not found');
  const measured = await observerHarness({ failMeasureInitially: true });
  assert.match(await measured.run().catch((e) => e.message), /measure failed/);
  assert.equal(measured.timers.size, 0); assert.ok(measured.observers.every((o) => o.disconnected));
  const callback = await observerHarness(); const callbackTarget = callback.elements[0]; const callbackWait = callback.run();
  callback.setMeasureFailure(true); callbackTarget.listeners.get('scroll')();
  assert.match(await callbackWait.catch((e) => e.message), /measure failed/);
  assert.equal(callback.timers.size, 0); assert.ok(callback.observers.every((o) => o.disconnected)); assert.equal(callbackTarget.listeners.size, 0);
  const setup = await observerHarness({ failResizeObserve: true });
  assert.match(await setup.run().catch((e) => e.message), /observe failed/);
  assert.equal(setup.timers.size, 0); assert.ok(setup.observers.every((o) => o.disconnected));
});

test('click re-aims after pointer travel moves its target', async () => {
  let targetX = 100;
  let moved = false;
  let pressedX = null;
  const tab = {
    still: async () => {},
    evaluate: async (expression) => {
      if (expression.includes('function locate(')) return { x: targetX, y: 50 };
      if (expression.includes('function hits(')) return true;
      if (expression.includes('function listControls(')) return { controls: [{ role: 'button', label: 'Resume', n: 1 }] };
      if (expression.includes('function layoutSignature(')) return 'stable';
      if (expression.includes('function listLayers(')) return [];
      throw new Error(`Unexpected driver expression: ${expression.slice(0, 100)}`);
    },
    send: async (_method, event) => {
      // WHY: hover expansion can shift the row after the original hit test,
      // before the mouse button is pressed. Rechecking only beforehand misses it.
      if (event.type === 'mouseMoved' && !moved) { moved = true; targetX = 200; }
      if (event.type === 'mousePressed') pressedX = event.x;
    },
  };
  await makeDriver(tab).perform({ do: 'click', target: { role: 'button', label: 'Resume', nth: 1 } }, 1);
  assert.equal(pressedX, 200);
});

// "Open this first" on a screen entry (games-social friction, proposal 9).
import { openSteps } from '../driver.mjs';

test('an open step written as a label is a click on that button', () => {
  assert.deepEqual(openSteps(['Your status: Online']), [{ do: 'click', target: { role: 'button', label: 'Your status: Online', nth: 1 } }]);
});

test('an open step may be any journey step, and none is no steps', () => {
  const key = { do: 'key', key: 'ArrowDown' };
  assert.deepEqual(openSteps([key]), [key]);
  assert.deepEqual(openSteps(undefined), []);
});

test('an open step that checks, or says nothing, is refused', () => {
  assert.throws(() => openSteps([{ do: 'expect', text: 'x' }]), /belongs in a journey/);
  assert.throws(() => openSteps([{}]), /needs "do"/);
  assert.throws(() => openSteps(['  ']), /empty label/);
  assert.throws(() => openSteps('Your status'), /is a list/);
});

// submit-ticket friction, proposal 15: a row's accessible name is its title AND its hint, so
// adding a hint renamed it and broke every step that clicked it by name.
import { labelMatches, markOf, pointerRestsOnClick } from '../driver.mjs';

test('a control is found by the start of its name: labelStarts, or a label ending in "…"', () => {
  const row = { role: 'button', label: 'Recent logs 4 lines — open to read them' };
  assert.equal(labelMatches(row, { role: 'button', labelStarts: 'Recent logs' }), true);
  assert.equal(labelMatches(row, { role: 'button', label: 'Recent logs' }), false, 'a plain label still means the whole name');
  assert.equal(labelMatches(row, { role: 'link', labelStarts: 'Recent logs' }), false, 'the role still has to match');
  assert.deepEqual(openSteps(['Recent logs…']), [{ do: 'click', target: { role: 'button', labelStarts: 'Recent logs', nth: 1 } }]);
});

test('a click on a control found by the start of its name lands on it', async () => {
  let pressed = false;
  const tab = {
    still: async () => {},
    evaluate: async (expression) => {
      if (expression.includes('function locate(')) return { x: 10, y: 10 };
      if (expression.includes('function hits(')) return true;
      if (expression.includes('function listControls(')) return { controls: [{ role: 'button', label: 'Recent logs 4 lines', n: 1 }] };
      if (expression.includes('function layoutSignature(')) return 'stable';
      if (expression.includes('function listLayers(')) return [];
      throw new Error('unexpected');
    },
    send: async (_m, e) => { if (e.type === 'mousePressed') pressed = true; },
  };
  await makeDriver(tab).perform({ do: 'click', target: { role: 'button', labelStarts: 'Recent logs' } });
  assert.equal(pressed, true);
});

// Proposal 18: a dialog that hands over to another can name the mark it ends on.
test('a screen state is checked by its own mark when it names one, else by its plain name', () => {
  assert.equal(markOf({ name: 'settings/help/ticket#contribute', mark: 'settings/help/contribute' }), 'settings/help/contribute');
  assert.equal(markOf({ name: 'settings/help/ticket#review' }), 'settings/help/ticket');
});

// Proposal 14: the pointer left on the last thing clicked painted its hover tint into the
// picture, which read as a selected state. A hover step is the exception: it is the point.
test('the pointer is moved away after open steps unless the last pointer step was a hover', () => {
  assert.equal(pointerRestsOnClick([{ do: 'click' }]), true);
  assert.equal(pointerRestsOnClick([{ do: 'click' }, { do: 'key', key: 'ArrowDown' }]), true);
  assert.equal(pointerRestsOnClick([{ do: 'click' }, { do: 'hover' }]), false);
  assert.equal(pointerRestsOnClick([{ do: 'key', key: 'Escape' }]), false);
  assert.equal(pointerRestsOnClick([]), false);
});

// Close-session friction, proposal 20: a state that opens something only the new code has
// (`chat/tags#complete` clicks Mark complete) failed on the before side by design, reported as
// NOT TAKEN like a real failure. Marked `newIn: 'after'`, the before side skips it, saying so.
import { splitForSide } from '../driver.mjs';

test('a state new in the after side is skipped on the before side, and only there', () => {
  const screens = [{ name: 'chat/tags' }, { name: 'chat/tags#complete', newIn: 'after' }];
  assert.deepEqual(splitForSide(screens, 'before'), { take: [screens[0]], skip: [screens[1]] });
  assert.deepEqual(splitForSide(screens, 'after'), { take: screens, skip: [] });
  assert.deepEqual(splitForSide(screens, null), { take: screens, skip: [] });
});
