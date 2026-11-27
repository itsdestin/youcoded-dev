import { defineConfig } from 'vitest/config';
import path from 'path';
const D = '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop';
export default defineConfig({ root: D, server: { fs: { strict: false } }, test: { include: ['/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/review4/*.test.ts'], environment: 'node', testTimeout: 3_000_000, hookTimeout: 60_000, setupFiles: [D + '/tests/setup-waitfor.ts'], alias: { electron: path.resolve(D, 'tests/__mocks__/electron.ts') }, env: { YOUCODED_NO_ANALYTICS: '1' } } });
