import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { markTeamDevice, teamDeviceFile } from './team-device.mjs';

test("a contributor's computer is never marked, however often the workspace starts", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-device-'));
  try {
    assert.equal(markTeamDevice(home, 'some-contributor'), 'not-owner');
    assert.equal(markTeamDevice(home, ''), 'not-owner');
    assert.equal(fs.existsSync(teamDeviceFile(home)), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("marks the owner's computer once, then leaves the file alone without asking GitHub again", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-device-'));
  try {
    assert.equal(markTeamDevice(home, 'itsdestin'), 'created');
    assert.equal(teamDeviceFile(home), path.join(home, '.claude', 'youcoded-team-device'));
    assert.ok(fs.existsSync(teamDeviceFile(home)));
    assert.equal(markTeamDevice(home, () => { throw new Error('must not look up the login'); }), 'present');
  } finally {
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 3 });
  }
});

const servicePath = new URL('../youcoded/desktop/src/main/analytics-service.ts', import.meta.url);
// WHY skip when absent: workspace CI checks out only this repo, not the app.
test('the app looks for the same file the workspace writes', { skip: !fs.existsSync(servicePath) && 'app checkout absent' }, () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  assert.match(service, /path\.join\(os\.homedir\(\), "\.claude", "youcoded-team-device"\)/);
});
