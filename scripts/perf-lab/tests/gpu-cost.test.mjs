import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, sanitizeProcessEnv, parseArgs } from '../gpu-cost.mjs';

test('parseCell reads slug and toggles, and rejects unknown toggles', () => {
  const c = parseCell('cotton-candy-sky+noparticles+smallwall');
  assert.equal(c.slug, 'cotton-candy-sky');
  assert.deepEqual([...c.toggles].sort(), ['noparticles', 'smallwall']);
  assert.throws(() => parseCell('midnight+turbo'), /unknown toggle/);
});
test('sanitizeProcessEnv keeps only the allow-list (no session-manager or auth variables leak to the test app)', () => {
  const env = { PATH: '/bin', HOME: '/h', SESSION_MANAGER: 'x', ICEAUTHORITY: 'y', XAUTHORITY: 'z', KDE_FULL_SESSION: 'true', LANG: 'C' };
  sanitizeProcessEnv(env);
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH']);
});
test('parseArgs requires absolute app-dir and an --out inside scratch/perf-lab/gpu', () => {
  assert.throws(() => parseArgs(['--app-dir', 'rel', '--out', '/x/y.json']), /absolute/);
  assert.throws(() => parseArgs(['--app-dir', '/a', '--out', '/tmp/out.json']), /must be inside/);
});
