// scripts/perf-lab/cdp.mjs — minimal Chrome DevTools Protocol client on Node 26's
// built-in WebSocket (no `ws` dependency — the workspace root has no package.json).
export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}
export async function waitForMainTarget(port, { timeoutMs = 60000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const targets = await listTargets(port);
      // Packaged app loads file://.../index.html; buddy windows add ?mode=… — exclude them.
      const main = targets.find((t) => t.type === 'page' && t.url.startsWith('file://') && !t.url.includes('mode='));
      if (main) return main;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP main target not found on :${port} within ${timeoutMs}ms`);
}
export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const listeners = new Map();
    let closedReason = null;
    // WHY: without this, a CDP target that dies mid-request (the app crashed, the
    // diff-Chrome was killed by a concurrent run) leaves every in-flight promise
    // pending FOREVER — the rig hangs with no error instead of failing. Measured:
    // a killed browser produced an unsettled top-level await, not a rejection.
    // Rejecting on close turns a whole class of silent hangs into loud failures.
    const failAllPending = (why) => {
      closedReason = why;
      for (const [, { rej }] of pending) rej(new Error(`CDP connection ${why} (${wsUrl})`));
      pending.clear();
    };
    ws.addEventListener('open', () => resolve(api));
    ws.addEventListener('error', (e) => { failAllPending('errored'); reject(new Error(`ws error: ${e.message || e}`)); });
    ws.addEventListener('close', (e) => failAllPending(`closed (code ${e?.code ?? '?'})`));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const cb of listeners.get(msg.method)) cb(msg.params);
      }
    });
    const api = {
      send(method, params = {}) {
        // Send-after-close must reject immediately rather than queue a promise
        // nothing will ever settle.
        if (closedReason) return Promise.reject(new Error(`CDP connection ${closedReason}; cannot send ${method}`));
        return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
      },
      on(method, cb) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(cb); },
      async evaluate(expression) {
        const r = await api.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('evaluate threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result?.value;
      },
      close() { ws.close(); },
    };
  });
}
/** Poll `expr` (must return truthy when done) every `everyMs` until `timeoutMs`. */
export async function waitFor(cdp, expr, { timeoutMs = 30000, everyMs = 100 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await cdp.evaluate(expr);
    if (v) return v;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`waitFor timed out: ${expr.slice(0, 80)}`);
}
