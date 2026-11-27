// Independent oracle: every line text acknowledged "saved" must be held, verified, in some live version on some device.
import { type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
export async function allLines(world: World): Promise<Map<string, string[]>> {
  // device -> version hex -> lines (current incarnation). Versions = everything the device's directory knows.
  const out = new Map<string, string[]>();
  for (const n of world.names) for (const v of world.devs[n].rep.versions()) {
    const lines = await world.readAll(n, v);
    out.set(n + '/' + v.toString('hex').slice(0, 8), lines.map((l) => l.toString()));
  }
  return out;
}
export async function missing(world: World, acked: string[]): Promise<string[]> {
  const all = await allLines(world); const have = new Set<string>();
  for (const ls of all.values()) for (const l of ls) have.add(l);
  return acked.filter((a) => !have.has(a));
}
