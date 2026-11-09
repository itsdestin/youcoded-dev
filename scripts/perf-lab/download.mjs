import { existsSync, mkdirSync, readFileSync, statSync, linkSync, unlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireDiskHeadroom } from './disk-budget.mjs';

export function completedAsset(dest) {
  try {
    const receipt = JSON.parse(readFileSync(`${dest}.complete`, 'utf8'));
    return receipt.version === 1 && Number.isSafeInteger(receipt.bytes) && receipt.bytes > 0 && statSync(dest).isFile() && statSync(dest).size === receipt.bytes;
  } catch { return false; }
}

// WHY: interrupted downloads used to leave nonempty final files which the next
// run accepted as complete. Publish only after EOF, bounded size and length checks.
export async function downloadAsset(url, dest, {
  fetchImpl = fetch, maximumBytes = 1024 ** 3, checkSpace = requireDiskHeadroom,
} = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('Invalid download budget');
  if (existsSync(dest) || existsSync(`${dest}.complete`)) throw new Error(`Refusing existing asset: ${dest}`);
  checkSpace(dirname(dest), { additionalBytes: maximumBytes });
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const lengthHeader = response.headers.get('content-length');
  const length = lengthHeader === null ? null : Number(lengthHeader);
  if (length !== null && (!Number.isSafeInteger(length) || length < 1 || length > maximumBytes)) {
    await response.body?.cancel();
    throw new Error('Response length exceeds download budget or is invalid');
  }
  mkdirSync(dirname(dest), { recursive: true });
  const partial = `${dest}.${randomUUID()}.partial`;
  let handle, published = false;
  try {
    handle = await open(partial, 'wx');
    let bytes = 0;
    if (!response.body) throw new Error('Missing download body');
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) throw new Error('Response exceeds download budget');
      await handle.writeFile(chunk);
    }
    if (!bytes || (length !== null && bytes !== length)) throw new Error('Response length mismatch');
    await handle.sync();
    await handle.close(); handle = null;
    // Hard-link publication is atomic and refuses a concurrently created target.
    linkSync(partial, dest); published = true;
    writeFileSync(`${dest}.complete`, JSON.stringify({ version: 1, bytes, url }), { flag: 'wx' });
  } catch (error) {
    if (published) unlinkSync(dest);
    throw error;
  } finally {
    await handle?.close();
    if (existsSync(partial)) unlinkSync(partial);
  }
}
