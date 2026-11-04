// `shoot --themes all` = every theme the practice app has (close-session friction, proposal 12).
// Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allThemes, builtinThemeSlugs, themeAppliedExpr } from '../themes.mjs';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'youcoded');

test('all themes = the built-in ones, then the community ones, without repeats', () => {
  assert.deepEqual(allThemes(['light', 'youcoded'], ['meadow-mist', 'creme', 'light']), ['light', 'youcoded', 'creme', 'meadow-mist']);
  assert.deepEqual(allThemes([], null), []);
});

test('the built-in themes are read from the checkout, the two YouCoded themes included', { skip: !existsSync(join(CHECKOUT, 'desktop')) && 'needs the app checkout' }, () => {
  const slugs = builtinThemeSlugs(CHECKOUT);
  for (const s of ['youcoded', 'youcoded-night', 'light', 'dark', 'midnight', 'creme']) assert.ok(slugs.includes(s), `${s} in ${slugs}`);
});

test('the theme guard is true only when the page shows the requested theme', async () => {
  const vm = await import('node:vm');
  const run = (attr, want) => vm.runInNewContext(themeAppliedExpr(want), { document: { documentElement: { getAttribute: () => attr } } });
  assert.equal(run('meadow-mist', 'meadow-mist'), true);
  assert.equal(run('light', 'meadow-mist'), false);
  assert.equal(run(null, 'meadow-mist'), false);
});
