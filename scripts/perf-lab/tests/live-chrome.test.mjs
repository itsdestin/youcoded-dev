// startLiveChrome retries a Chrome that never opens its port, and a real failure
// still names every attempt's own startup output (live-chrome.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLiveChrome } from './live-chrome.mjs';

test('a browser that never opens its port is tried twice, then fails naming both attempts', async () => {
  // `false` exits at once without binding anything — the fastest "never opened".
  await assert.rejects(
    startLiveChrome('false', 9791, [], 'perf-lab-livechrome-', { waitMs: 2000 }),
    (e) => /never opened its debugging port/.test(e.message) && /attempt 1:/.test(e.message) && /attempt 2:/.test(e.message),
  );
});
