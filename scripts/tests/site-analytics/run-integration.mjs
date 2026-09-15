// WHY workspace-owned: the Worker standalone CI checkout does not contain the website repo.
// Stage the real-client integration test temporarily where the Worker test pool resolves its bindings.
import { copyFile, unlink, constants } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const worker = resolve(root, 'wecoded-marketplace/worker');
const target = resolve(worker, 'test/site-analytics-integration.test.ts');
await copyFile(resolve(here, 'integration.test.ts.template'), target, constants.COPYFILE_EXCL);
try {
  const result = spawnSync('npm', ['test', '--', '--run', 'test/site-analytics-integration.test.ts'], { cwd: worker, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await unlink(target); }
