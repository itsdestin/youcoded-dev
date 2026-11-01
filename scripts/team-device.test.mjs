import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { markTeamDevice, teamDeviceFile } from './team-device.mjs';

test('marks a computer as a team device once, then leaves the file alone', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-device-'));
  try {
    assert.equal(markTeamDevice(home), 'created');
    assert.equal(teamDeviceFile(home), path.join(home, '.claude', 'youcoded-team-device'));
    assert.ok(fs.existsSync(teamDeviceFile(home)));
    assert.equal(markTeamDevice(home), 'present');
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
