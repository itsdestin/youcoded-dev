import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDriver } from '../driver.mjs';

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
