// H3: a roster device (not a writer of anything of A's) floods A with announcements of brand-new versions it "writes".
import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { afterEach, describe, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { repWorld, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { GROUP_LIVE, introBodyOf, introMessage, KIND_INTRO } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';
import { deriveRootId } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/directory';
import { signWith } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/identity';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const du = (p: string): number => { let n = 0; const walk = (q: string) => { for (const e of fs.existsSync(q) ? fs.readdirSync(q, { withFileTypes: true }) : []) { const f = nodePath.join(q, e.name); if (e.isDirectory()) walk(f); else n += fs.statSync(f).size; } }; walk(p); return n; };
const count = (p: string): number => { let n = 0; const walk = (q: string) => { for (const e of fs.existsSync(q) ? fs.readdirSync(q, { withFileTypes: true }) : []) { n++; if (e.isDirectory()) walk(nodePath.join(q, e.name)); } }; walk(p); return n; };
describe('H3 announcement flood', () => {
  it('N new versions from one roster device cost A disk, files and memory without bound', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000, bound: true }); const world = w;
    world.devs.B.rep.stop();
    const N = Number(process.env.NFLOOD ?? 1500); const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const nonce = randomBytes(16); const version = deriveRootId(world.setId, 'flood:' + i, world.ids.B.deviceId, nonce);
      const d = { version, chatId: 'flood:' + i, runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: world.ids.B.deviceId, nonce };
      const sig = signWith(world.ids.B, introMessage(d));
      world.devs.B.link.sendLive({ group: GROUP_LIVE, kind: KIND_INTRO, body: introBodyOf({ ...d, sig }) });
      if (i % 100 === 99) await world.settle(60_000, 10, 2);
    }
    await world.settle(120_000, 10, 3);
    const A = world.dirs.A;
    console.log('H3 sent', N, 'in', Date.now() - t0, 'ms; A knows', world.devs.A.rep.versions().length, 'versions; stateSizes', JSON.stringify(world.devs.A.rep.stateSizes()), '; files under A/replicator', count(nodePath.join(A, 'replicator')), 'bytes', du(nodePath.join(A, 'replicator')), '; files under A/store', count(nodePath.join(A, 'store')), 'bytes', du(nodePath.join(A, 'store')));
  });
});
