import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadAsset, completedAsset } from '../download.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lab-download-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return { dir, dest: join(dir, 'asset.bin') };
}
test('only publishes a complete response and its byte-count receipt', async t => {
  const { dest } = fixture(t);
  await downloadAsset('https://example.invalid/asset', dest, { fetchImpl: async () => new Response('complete'), maximumBytes: 100 });
  assert.equal(readFileSync(dest, 'utf8'), 'complete');
  assert.equal(completedAsset(dest), true);
});
test('an interrupted response leaves neither a final asset nor temporary files', async t => {
  const { dir, dest } = fixture(t);
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.error(new Error('interrupted')); } });
  await assert.rejects(downloadAsset('https://example.invalid/asset', dest, {
    fetchImpl: async () => new Response(body), maximumBytes: 100,
  }), /interrupted/);
  assert.deepEqual(readdirSync(dir), []);
});
test('refuses oversized responses even without a Content-Length', async t => {
  const { dest } = fixture(t);
  await assert.rejects(downloadAsset('https://example.invalid/asset', dest, {
    fetchImpl: async () => new Response('too large'), maximumBytes: 2,
  }), /budget/);
  assert.equal(existsSync(dest), false);
});
test('a nonzero legacy partial is not a completed asset and is not overwritten', async t => {
  const { dest } = fixture(t);
  writeFileSync(dest, 'partial');
  assert.equal(completedAsset(dest), false);
  await assert.rejects(downloadAsset('https://example.invalid/asset', dest, {
    fetchImpl: async () => assert.fail('must not fetch'), maximumBytes: 100,
  }), /existing asset/);
  assert.equal(readFileSync(dest, 'utf8'), 'partial');
});
test('checks disk headroom before requesting bytes', async t => {
  const { dest } = fixture(t);
  await assert.rejects(downloadAsset('https://example.invalid/asset', dest, {
    checkSpace: () => { throw new Error('disk budget'); },
    fetchImpl: async () => assert.fail('must not fetch'),
  }), /disk budget/);
});
test('rejects a response shorter than its declared length', async t => {
  const { dest } = fixture(t);
  await assert.rejects(downloadAsset('https://example.invalid/asset', dest, {
    fetchImpl: async () => new Response('short', { headers: { 'content-length': '10' } }), maximumBytes: 100,
  }), /length/);
  assert.equal(existsSync(dest), false);
});
