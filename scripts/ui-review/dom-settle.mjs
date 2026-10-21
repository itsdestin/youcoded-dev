// Node-count stability is scheduling evidence, not proof of paint or virtualization.
export async function settleAndCount(tab, { capMs = 20000, stableMs = 1500, intervalMs = 250, maxSamples = 10000,
  now = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (![capMs, stableMs, intervalMs, maxSamples].every(n => Number.isSafeInteger(n) && n > 0) || capMs > 600000 || maxSamples > 10000) throw Error('invalid DOM settle cap');
  const start = now();
  let lastCount = null, stableSince = null, samples = 0;
  const incomplete = reason => ({ revision: 1, status: 'incomplete', reason, nodes: null, lastCount, samples, elapsedMs: now() - start });
  while (now() - start < capMs) {
    if (samples >= maxSamples) return incomplete('sample-cap');
    const remaining = capMs - (now() - start);
    let n, timer;
    try {
      // WHY: an evaluation that never returns must not make the settle cap fictional.
      n = await Promise.race([tab.evaluate("document.querySelectorAll('*').length", Math.min(5000, remaining)),
        new Promise((_, reject) => { timer = setTimer(() => reject(Error('timeout')), remaining); })]);
    } catch (error) { return incomplete(error.message === 'timeout' ? 'timeout' : `counter unavailable: ${error.message}`); }
    finally { clearTimer(timer); }
    samples++;
    if (!Number.isSafeInteger(n) || n < 0) return incomplete('counter unavailable');
    if (now() - start >= capMs) { lastCount = n; return incomplete('timeout'); }
    if (n !== lastCount) { lastCount = n; stableSince = now(); }
    else if (now() - stableSince >= stableMs) return { revision: 1, status: 'measured', reason: null, nodes: n, lastCount, samples, elapsedMs: now() - start };
    await wait(Math.min(intervalMs, capMs - (now() - start)));
  }
  return incomplete('timeout');
}
