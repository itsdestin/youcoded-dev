#!/usr/bin/env node
// scripts/perf-lab/ladder-child.mjs — ONE fixture job per process, so bounded-exec.mjs can put a memory bound around it.
//
//   node ladder-child.mjs '<json spec>'      prints exactly one JSON line on stdout: { ok: true, ... } or { ok: false, error }
//
// ops: doc (one stall-fixtures case), image (one generated PNG/JPEG), verify-image (read a file back and check its size),
//      copy-original (read-only byte copy of a real image with SHA-256 verification).
// WHY separate processes: a rung that needs too much memory must die alone (recorded failed:memory-bound) instead of taking
// the lane's controller with it.
import { chmod, copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jpegSize, pngSize } from './image-encode.mjs';
import { buildStallFixtures, encodeImageFixture } from './stall-fixtures.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Byte-copy `source` to `<destDir>/<name>` WITHOUT ever opening the source for writing, verify the copy's SHA-256 equals the
 * source's (and `expectedSha256` when pinned), and make the copy read-only (0444). The source is never modified or renamed.
 */
export async function copyVerified({ source, destDir, name = basename(source), expectedSha256 = null }) {
  const real = await realpath(source);
  const before = sha256(await readFile(real));
  if (expectedSha256 && before !== expectedSha256) throw new Error(`source changed: expected sha256 ${expectedSha256}, found ${before}`);
  await mkdir(destDir, { recursive: true });
  const dest = join(resolve(destDir), name);
  // COPYFILE_EXCL: never overwrite an existing file.
  await copyFile(real, dest, 1);
  const copyBytes = await readFile(dest);
  const after = sha256(copyBytes);
  if (after !== before) throw new Error(`copy differs from source: ${after} != ${before}`);
  await chmod(dest, 0o444);
  const sourceAfter = sha256(await readFile(real));
  if (sourceAfter !== before) throw new Error('source changed while copying');
  return { source: real, file: dest, bytes: copyBytes.length, sha256: after };
}

export async function runChildOp(spec) {
  if (spec?.op === 'doc') {
    const manifest = await buildStallFixtures(spec.root, { checkout: spec.checkout, profile: spec.profile ?? 'ladder', only: [spec.id], reuseRoot: true });
    return { ok: true, cases: manifest.cases };
  }
  if (spec?.op === 'image') {
    const f = spec.spec, encoded = encodeImageFixture(f);
    const file = join(resolve(spec.root), f.id + (f.format === 'jpeg' ? '.jpg' : '.png'));
    await writeFile(file, encoded.data, { flag: 'wx' });
    return { ok: true, cases: [{ id: f.id, kind: 'image-' + f.format, marker: 'stall-lab-' + f.id, file, bytes: encoded.data.length, sha256: sha256(encoded.data), shape: encoded.shape }] };
  }
  if (spec?.op === 'verify-image') {
    const data = await readFile(spec.file);
    const size = spec.format === 'jpeg' ? jpegSize(data) : pngSize(data);
    if (size.width !== spec.width || size.height !== spec.height) throw new Error(`image is ${size.width}x${size.height}, expected ${spec.width}x${spec.height}`);
    if (sha256(data) !== spec.sha256) throw new Error('image bytes differ from the recorded SHA-256');
    return { ok: true, size };
  }
  if (spec?.op === 'copy-original') {
    const copy = await copyVerified({ source: spec.source, destDir: spec.destDir, name: spec.name, expectedSha256: spec.expectedSha256 });
    const st = await lstat(copy.file);
    return { ok: true, copy: { ...copy, mode: (st.mode & 0o777).toString(8) } };
  }
  throw new Error(`unknown op ${JSON.stringify(spec?.op)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runChildOp(JSON.parse(process.argv[2])))); }
  catch (error) { console.log(JSON.stringify({ ok: false, error: String(error?.message ?? error) })); process.exitCode = 1; }
}
