import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import { ChatStore, out } from './lib';
const { readMarksState } = await import('./new/marks');
const { realFs } = await import('./new/fsio');
test('lk', async () => {
  const src = process.env.LK_DIR!; const root = '/tmp/lk-' + Date.now(); await fsp.cp(src, root, { recursive: true });
  const id = Buffer.from(process.env.LK_ID!, 'hex');
  const m = await readMarksState(realFs, root + '/versions/' + process.env.LK_ID); out('lk-marks', m);
  const s = await ChatStore.open(root, { proofVerifier: () => true });
  const h = await s.head(id); out('lk-head', { n: h.lines, dmg: h.damagedFromLine, rb: h.rolledBack });
  for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1) as any; out('lk-read' + i, 'ok ' + g[0].length); } catch (x: any) { out('lk-read' + i, 'ERR ' + x.code + ' ' + String(x.message).slice(0, 120)); } }
  await s.close();
}, 60000);
