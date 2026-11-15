// Runs crosscheck.test.ts with the app's own vitest, from OUTSIDE the app repo (no app file is touched). Paths are for this worktree; edit ROOT to move.
const ROOT = '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop';
export default { root: ROOT, test: { globals: true, include: [process.env.CROSSCHECK_TEST as string], environment: 'node', testTimeout: 600000 }, server: { fs: { strict: false } } };
