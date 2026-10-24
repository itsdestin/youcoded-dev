import { statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// WHY: a model download exhausted /home before the first viewer measurement.
// Keep a reserve in addition to the operation's allocation; unknown space fails closed.
export function requireDiskHeadroom(path, {
  reserveBytes = 1024 ** 3, additionalBytes = 128 * 1024 ** 2, statfs = statfsSync,
} = {}) {
  if (![reserveBytes, additionalBytes, reserveBytes + additionalBytes].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Invalid disk budget');
  }
  let checkedPath = resolve(path);
  let stats;
  for (;;) {
    try { stats = statfs(checkedPath); break; }
    catch (error) {
      const parent = dirname(checkedPath);
      if (error.code !== 'ENOENT' || parent === checkedPath) throw error;
      checkedPath = parent;
    }
  }
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  if (!Number.isSafeInteger(availableBytes) || availableBytes < 0 || !(Number(stats.bsize) > 0)) {
    throw new Error(`Invalid disk capacity measurement for ${checkedPath}`);
  }
  const requiredBytes = reserveBytes + additionalBytes;
  if (availableBytes < requiredBytes) {
    throw new Error(`Insufficient disk headroom at ${checkedPath}: ${availableBytes} bytes available, ${requiredBytes} required (including ${reserveBytes} reserved)`);
  }
  return { checkedPath, availableBytes, requiredBytes, reserveBytes, additionalBytes, measuredAt: new Date().toISOString() };
}
