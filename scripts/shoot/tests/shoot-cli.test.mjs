// The shoot command line refuses what would silently shoot nothing.
// Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'shoot.mjs');

// WHY (submit-ticket friction, proposal 17): `shoot $F` in zsh passed "a/b c/d" as ONE argument
// and the run shot nothing. Refused before anything is built, naming the fix.
test('a screen name with a space in it is refused, before any build', () => {
  const r = spawnSync(process.execPath, [SHOOT, 'settings/about settings/sound'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /has a space in it/);
  assert.match(r.stderr, /its own argument/);
});
