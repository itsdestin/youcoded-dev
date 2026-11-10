// Guard for the false green that made this script worthless.
//
// Until 2026-09-02, `workbench-boot-check.mjs` run against a port NOTHING was
// serving printed `ok` for all sixteen routes and exited 0 with "All 16
// workbench routes mount cleanly" — Chrome rendered its own
// net::ERR_CONNECTION_REFUSED page, which has no "failed to start" text, no
// #boot spinner, and throws no exception. CLAUDE.md tells every session to trust
// this check, so a dead dev server read as a passing app.
//
// This asserts the refusal, and does it WITHOUT Chrome: the preflight now runs
// before the browser is discovered or launched, so the whole check is one HTTP
// request when the port is dead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workbench-boot-check.mjs');

/** A port nothing is listening on: bind one, read it, close it. */
async function freePort() {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

test('refuses loudly when nothing is serving the workbench port', async () => {
  const port = await freePort();
  const { status, stderr } = spawnSync(process.execPath, [SCRIPT, String(port)], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(status, 2, `expected exit 2, got ${status}\n${stderr}`);
  assert.match(stderr, /nothing is serving the workbench on port/);
  assert.match(stderr, /run-workbench\.sh/);
  // The old false green, spelled out so a regression is unmistakable.
  assert.doesNotMatch(stderr, /routes mount cleanly/);
});

test('does not report routes as passing against a dead port', async () => {
  const port = await freePort();
  const { stdout } = spawnSync(process.execPath, [SCRIPT, String(port)], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.doesNotMatch(stdout, /^ok /m);
  assert.doesNotMatch(stdout, /mount cleanly/);
});

// ── Every `view=` the app can show must have a boot route (card #18(i)) ──────────────
// WHY: three of the eight views (buddy-group, buddy-chat, buddy-session) shipped in the
// app's view switch with no route in ROUTES, so a crash on them was invisible to this
// check. The list is read from the app's own source so a ninth view fails here at once.
// WHY the skip is spelled out: workspace-ci.yml's anchors job DOES clone youcoded/ (depth 1) before the
// "Test the workbench boot check" step, so this guard runs in CI. Where no checkout exists (a bare
// clone on a laptop) it skips WITH its reason; under CI a missing checkout fails instead, because a
// quiet skip there would be a guard that silently stopped guarding.
import { existsSync, readFileSync } from 'node:fs';
import { resolveCheckout } from './shoot/engine.mjs';

const WORKSPACE = path.resolve(path.dirname(SCRIPT), '..');
function appRendererIndex() {
  let checkout = null;
  if (existsSync(path.join(WORKSPACE, 'youcoded', 'desktop'))) checkout = path.join(WORKSPACE, 'youcoded');
  else { try { checkout = resolveCheckout(''); } catch { checkout = null; } }
  const file = checkout && path.join(checkout, 'desktop', 'src', 'renderer', 'index.tsx');
  return file && existsSync(file) ? file : null;
}

test('every __view value in the app has a ROUTES entry', (t) => {
  const file = appRendererIndex();
  if (!file) {
    assert.ok(!process.env.CI, 'CI has no youcoded app checkout (the anchors job should have cloned it) — the view list cannot be read');
    t.skip(`SKIPPED: no youcoded app checkout found (looked in ${path.join(WORKSPACE, 'youcoded')} and the resolver's default) — the app's view list cannot be read, so the every-view-has-a-route guard did not run`);
    return;
  }
  const views = [...new Set([...readFileSync(file, 'utf8').matchAll(/__view === '([\w-]+)'/g)].map((m) => m[1]))];
  assert.ok(views.length >= 8, `expected to find the app's view switch in ${file}, found ${views.length}`);
  const routes = readFileSync(SCRIPT, 'utf8');
  const missing = views.filter((v) => !new RegExp(`&view=${v}'`).test(routes));
  assert.deepEqual(missing, [], `views with no boot route in workbench-boot-check.mjs: ${missing.join(', ')}`);
});
