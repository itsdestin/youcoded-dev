// scripts/perf-lab/os-hidden.mjs — make the ISOLATED candidate's window really hidden by the OS, and prove it.
//
// WHY (workstream E): "hidden" in the stream legs means a hidden SESSION inside a visible window. The
// app has a different code path when the whole window is hidden (requestAnimationFrame stops, the batcher falls
// back to a 16 ms timer), and only a minimized/occluded window exercises it. The proof is the page's own
// document.visibilityState, never the request that asked for it. Without a window manager (the lab's Xvfb has
// none) a minimize request may do nothing: that is recorded as `hidden-not-achieved`, never as a pass.
//
// Only ever called with the lab's own CDP connection to its own launched candidate.
const bounded = (promise, ms, what) => {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${what} deadline ${ms}ms`)), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const readVisibility = cdp => bounded(cdp.evaluate('document.visibilityState'), 1500, 'visibility read');

export async function waitForVisibility(cdp, want, { timeoutMs = 4000, everyMs = 100 } = {}) {
  const start = performance.now(); let last = null;
  while (performance.now() - start <= timeoutMs) {
    try { last = await readVisibility(cdp); } catch (e) { last = `read-failed: ${e.message}`; }
    if (last === want) return { reached: true, state: last, waitedMs: performance.now() - start };
    await sleep(everyMs);
  }
  return { reached: false, state: last, waitedMs: performance.now() - start };
}

async function cdpWindowState(cdp, windowState) {
  const { windowId } = await bounded(cdp.send('Browser.getWindowForTarget'), 2000, 'Browser.getWindowForTarget');
  await bounded(cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState } }), 2000, 'Browser.setWindowBounds');
  return { windowId };
}

/** Try each supported route in order until document.visibilityState === 'hidden'. */
export async function minimizeWindow(cdp, { timeoutMs = 4000 } = {}) {
  const attempts = [];
  const routes = [
    ['cdp-Browser.setWindowBounds-minimized', () => cdpWindowState(cdp, 'minimized')],
    // The app's own window:minimize IPC, called from the isolated candidate's renderer.
    ['app-ipc-window:minimize', () => bounded(cdp.evaluate('window.claude.window.minimize().then(() => true)'), 3000, 'window.minimize')],
  ];
  for (const [route, run] of routes) {
    const attempt = { route };
    try { attempt.result = await run(); } catch (e) { attempt.error = e.message; }
    const seen = await waitForVisibility(cdp, 'hidden', { timeoutMs });
    attempt.visibilityAfter = seen.state; attempt.waitedMs = Math.round(seen.waitedMs);
    attempts.push(attempt);
    if (seen.reached) return { achieved: true, route, attempts };
  }
  return { achieved: false, status: 'hidden-not-achieved', attempts,
    reason: 'No supported route made document.visibilityState hidden (an Xvfb session without a window manager normally ignores minimize); a request that returned without error is NOT evidence of a hidden window.' };
}

/** Bring the window back and prove it: only 'visible' counts. */
export async function restoreWindow(cdp, { timeoutMs = 4000 } = {}) {
  const attempts = [];
  for (const state of ['normal', 'maximized']) {
    const attempt = { route: `cdp-Browser.setWindowBounds-${state}` };
    try { attempt.result = await cdpWindowState(cdp, state); } catch (e) { attempt.error = e.message; }
    const seen = await waitForVisibility(cdp, 'visible', { timeoutMs });
    attempt.visibilityAfter = seen.state;
    attempts.push(attempt);
    if (seen.reached) return { restored: true, attempts };
  }
  return { restored: false, attempts };
}
