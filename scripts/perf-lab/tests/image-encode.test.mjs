// Offline: pure encoders, no app, no installed packages. Pins the properties the lab relies on (valid framing, exact sizes, determinism).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import { crc32, crc32Fallback, encodeJpeg, encodePng, jpegSize, pngSize } from '../image-encode.mjs';

const rgba = (w, h, f) => { const d = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const [r, g, b] = f(x, y); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; };

test('PNG: signature, IHDR size, per-chunk CRCs and the exact pixels come back out', () => {
  const data = rgba(5, 3, (x, y) => [x * 40, y * 80, 7]);
  const png = encodePng({ width: 5, height: 3, data });
  assert.deepEqual(pngSize(png), { width: 5, height: 3, bitDepth: 8, colorType: 2 });
  // walk the chunks and verify every CRC
  let at = 8; const types = [];
  while (at < png.length) { const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8); types.push(type); assert.equal(png.readUInt32BE(at + 8 + len), crc32(png.subarray(at + 4, at + 8 + len)), `${type} CRC`); at += 12 + len; }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  assert.equal(raw.length, 3 * (1 + 5 * 3));
  assert.deepEqual([...raw.subarray(0, 4)], [0, 0, 0, 7]);                                 // row 0: filter 0, pixel (0,0)
  assert.deepEqual([...raw.subarray(16, 20)], [0, 0, 80, 7]);                              // row 1, pixel (0,1)
  assert.deepEqual(encodePng({ width: 5, height: 3, data }), png, 'deterministic');
});

test('crc32 fallback table agrees with zlib.crc32', () => {
  const buf = Buffer.from('perf-lab image encoder');
  assert.equal(crc32(buf), zlibCrc32(buf) >>> 0);
  assert.equal(crc32Fallback(buf), zlibCrc32(buf) >>> 0);
  assert.equal(crc32Fallback(Buffer.alloc(0)), 0);
});

test('JPEG: baseline SOF with the right size, SOI/EOI framing, no raw 0xFF inside the scan, deterministic, edge sizes', () => {
  for (const [w, h] of [[1, 1], [8, 8], [17, 9], [64, 48]]) {
    const jpg = encodeJpeg({ width: w, height: h, data: rgba(w, h, (x, y) => [(x * 31) & 255, (y * 17) & 255, 128]) }, 85);
    assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8]); assert.deepEqual([...jpg.subarray(-2)], [0xff, 0xd9]);
    const size = jpegSize(jpg); assert.equal(size.width, w); assert.equal(size.height, h); assert.equal(size.baseline, true);
    const sos = jpg.indexOf(Buffer.from([0xff, 0xda])), scan = jpg.subarray(sos + 14, -2);
    for (let i = 0; i < scan.length; i++) if (scan[i] === 0xff) assert.equal(scan[i + 1], 0, 'every 0xFF in the scan is stuffed');
  }
  const d = rgba(16, 16, (x, y) => [x * 9, y * 9, 40]);
  assert.deepEqual(encodeJpeg({ width: 16, height: 16, data: d }), encodeJpeg({ width: 16, height: 16, data: d }));
});

test('JPEG decodes with an independent decoder when one is installed (quality sanity); framing test above is the always-on check', async () => {
  let decoder = null;
  try { const { createRequire } = await import('node:module'); decoder = createRequire(new URL('../../../youcoded/desktop/package.json', import.meta.url))('jpeg-js'); } catch { /* not installed here: the framing test still ran */ }
  if (!decoder) return;
  const w = 33, h = 21, d = rgba(w, h, (x, y) => [x * 7, y * 11, 100]);
  const out = decoder.decode(encodeJpeg({ width: w, height: h, data: d }, 90));
  assert.equal(out.width, w); assert.equal(out.height, h);
  let err = 0; for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) err += Math.abs(out.data[i * 4 + c] - d[i * 4 + c]);
  assert.ok(err / (w * h * 3) < 8, `mean abs error ${err / (w * h * 3)}`);
});

test('bad input is refused with a plain message', () => {
  assert.throws(() => encodePng({ width: 0, height: 1, data: Buffer.alloc(0) }), /positive/);
  assert.throws(() => encodePng({ width: 2, height: 2, data: Buffer.alloc(3) }), /width\*height\*4/);
  assert.throws(() => encodeJpeg({ width: 2, height: 2, data: Buffer.alloc(16) }, 0), /quality/);
  assert.throws(() => jpegSize(Buffer.from('nope')), /SOI/);
  assert.throws(() => pngSize(Buffer.from('nope-nope-nope')), /signature/);
});
