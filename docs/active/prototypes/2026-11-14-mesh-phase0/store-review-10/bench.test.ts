// cost of the per-call high-water write: real disk (tmp dir on this machine's fs), 300 calls x 1 line and x 10 lines, store as shipped (HW_EVERY=1) vs HW_EVERY=256, alternating, 3 rounds
import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as os from 'node:os'; import * as nodePath from 'node:path';
import { vid, out, BASE } from './lib';
const mkline = (i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'user' : 'assistant', uuid: 'b-' + i, message: { role: 'user', content: 'b#' + i + 'x'.repeat(40) } }) + '\n');
test('bench', async () => {
  const res: Record<string, number[]> = {};
  for (let round = 0; round < 3; round++) for (const variant of ['new', 'hw256']) for (const per of [1, 10]) {
    const { ChatStore } = await import(`${BASE}/${variant}/store`);
    const dir = await fsp.mkdtemp(nodePath.join(os.homedir() ? '/home/destin/.cache' : os.tmpdir(), 'r10b-')); const s = await ChatStore.open(dir, { proofVerifier: () => true });
    const id = vid(1); await s.registerVersion(id, { chatId: 'bench', runtime: 'claude-code', parent: null });
    let n = 0; await s.append(id, 0, 0, [mkline(n++)]); const t0 = performance.now();
    for (let c = 0; c < 300; c++) { const ls = Array.from({ length: per }, () => mkline(n++)); await s.append(id, 0, n - per, ls); }
    const ms = (performance.now() - t0) / 300; (res[`${variant}/${per}`] ??= []).push(+ms.toFixed(2));
    await s.close(); await fsp.rm(dir, { recursive: true, force: true });
  }
  out('bench', res);
}, 600000);
