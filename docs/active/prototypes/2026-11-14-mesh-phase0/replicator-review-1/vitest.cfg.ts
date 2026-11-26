import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop',
  cacheDir: '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1/cache',
  server: { fs: { strict: false } },
  test: { include: ['/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1/**/*.test.ts'], testTimeout: 3_600_000, hookTimeout: 3_600_000, environment: 'node', alias: { electron: '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/__mocks__/electron.ts' } },
});
