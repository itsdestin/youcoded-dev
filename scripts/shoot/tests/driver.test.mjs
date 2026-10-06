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
