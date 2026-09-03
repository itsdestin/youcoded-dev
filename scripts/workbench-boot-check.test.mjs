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
