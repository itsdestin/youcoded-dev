// scripts/perf-lab/image-encode.mjs — deterministic PNG and baseline-JPEG writers using ONLY node built-ins.
//
// WHY this exists (lane F, item 6): stall-fixtures.mjs used to `require('pngjs')` / `require('jpeg-js')` out of an app
// checkout's node_modules, resolved from the process working directory. Any run started from another directory (or
// against a checkout without installed packages) failed with "Cannot find module 'pngjs'" — and installing packages is
// not allowed in this workspace. PNG is signature + IHDR + IDAT(zlib) + IEND and JPEG baseline is a fixed algorithm, so
// the lab writes them itself: no dependency, same bytes everywhere.
//
// PNG output is byte-identical to pngjs 7's sync writer with { colorType: 2, inputColorType: 6, filterType: 0,
// deflateLevel: 6 } (one IDAT, zlib strategy 3), so fixture hashes did not change when pngjs was dropped.
// JPEG output is a new, valid baseline 4:4:4 file (standard Annex K luminance tables reused for all three components);
// it is NOT byte-compatible with jpeg-js, and fixture hashes for JPEG rungs are new (nothing stored depended on them).
import { crc32 as zlibCrc32, deflateSync } from 'node:zlib';

/** Bump when output bytes can change; recorded in fixture shape.encoder so a changed encoder is visible in reports. */
export const IMAGE_ENCODER_REVISION = 1;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// WHY a fallback table: zlib.crc32 exists from Node 20.15/22.2; the lab should not silently depend on the newest Node.
let crcTable = null;
export function crc32Fallback(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const crc32 = (buf) => (typeof zlibCrc32 === 'function' ? zlibCrc32(buf) >>> 0 : crc32Fallback(buf));

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA (alpha ignored: the lab's pixels are opaque) -> 8-bit truecolour PNG, filter 0, deflate level 6. */
export function encodePng({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('encodePng: width and height must be positive integers');
  if (!data || data.length !== width * height * 4) throw new Error('encodePng: data must be width*height*4 RGBA bytes');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit, colour type 2 (RGB), standard, filter method 0, no interlace
  const rowBytes = 1 + width * 3, raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const o = y * rowBytes;      // filter byte stays 0 (None)
    for (let x = 0, s = y * width * 4, d = o + 1; x < width; x++, s += 4, d += 3) { raw[d] = data[s]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s + 2]; }
  }
  const idat = deflateSync(raw, { chunkSize: 32 * 1024, level: 6, strategy: 3 });
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── baseline JPEG ────────────────────────────────────────────────────────────

// Annex K standard luminance tables (the same constants jpeg-js and libjpeg ship). Reused for every component so only one
// quantisation table and one DC/AC Huffman pair has to be written; a decoder allows components to share tables.
const QT_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];             // codes per length 1..16
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

/** Canonical Huffman: { code[symbol], size[symbol] } from the DHT "counts per length" + symbol list. */
function huffmanCodes(bits, vals) {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) { code[vals[k]] = c++; size[vals[k]] = len; k++; }
    c <<= 1;
  }
  return { code, size };
}
const DC = huffmanCodes(DC_BITS, DC_VALS), AC = huffmanCodes(AC_BITS, AC_VALS);

// 8x8 DCT-II as two matrix products with a precomputed cosine matrix (exact enough; speed is ~1 s per 4 Mpixel).
const COS = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

const segment = (marker, payload) => { const b = Buffer.alloc(4 + payload.length); b[0] = 0xff; b[1] = marker; b.writeUInt16BE(payload.length + 2, 2); Buffer.from(payload).copy(b, 4); return b; };

/** RGBA (alpha ignored) -> baseline JPEG, 4:4:4, quality 1..100 (libjpeg scaling of the Annex K table). */
export function encodeJpeg({ width, height, data }, quality = 85) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) throw new Error('encodeJpeg: width and height must be integers in 1..65535');
  if (!data || data.length !== width * height * 4) throw new Error('encodeJpeg: data must be width*height*4 RGBA bytes');
  if (!(quality >= 1 && quality <= 100)) throw new Error('encodeJpeg: quality must be 1..100');
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  const qt = QT_LUMA.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));   // natural order
  const qZig = ZIGZAG.map((n) => qt[n]);                                                              // zigzag order, for the DQT segment

  const head = [
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),                          // JFIF 1.01, 1:1 aspect
    segment(0xdb, [0, ...qZig]),
    segment(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
    segment(0xc4, [0x00, ...DC_BITS, ...DC_VALS]),
    segment(0xc4, [0x10, ...AC_BITS, ...AC_VALS]),
    segment(0xda, [3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0]),
  ];

  // Entropy-coded scan with 0xFF byte stuffing.
  let out = Buffer.alloc(Math.max(4096, (width * height) >> 2)), n = 0, acc = 0, accBits = 0;
  const ensure = (extra) => { if (n + extra > out.length) { const bigger = Buffer.alloc(Math.max(out.length * 2, n + extra)); out.copy(bigger, 0, 0, n); out = bigger; } };
  const put = (value, size) => {
    acc = (acc << size) | (value & ((1 << size) - 1)); accBits += size;
    while (accBits >= 8) {
      const byte = (acc >> (accBits - 8)) & 0xff; accBits -= 8; acc &= (1 << accBits) - 1;
      ensure(2); out[n++] = byte; if (byte === 0xff) out[n++] = 0;
    }
  };
  const category = (v) => { let a = Math.abs(v), c = 0; while (a) { c++; a >>= 1; } return c; };
  const bitsOf = (v, c) => (v < 0 ? v + (1 << c) - 1 : v);

  const block = new Float64Array(64), tmp = new Float64Array(64), q = new Int32Array(64);
  const prevDc = [0, 0, 0];
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let comp = 0; comp < 3; comp++) {
        for (let y = 0; y < 8; y++) {
          const sy = Math.min(height - 1, by + y);          // edge blocks repeat the last row/column
          for (let x = 0; x < 8; x++) {
            const i = (sy * width + Math.min(width - 1, bx + x)) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
            block[y * 8 + x] = (comp === 0 ? 0.299 * r + 0.587 * g + 0.114 * b
              : comp === 1 ? -0.168736 * r - 0.331264 * g + 0.5 * b + 128
                : 0.5 * r - 0.418688 * g - 0.081312 * b + 128) - 128;
          }
        }
        for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += COS[u * 8 + x] * block[y * 8 + x]; tmp[y * 8 + u] = s; }
        for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += COS[v * 8 + y] * tmp[y * 8 + u]; q[v * 8 + u] = Math.round(s / qt[v * 8 + u]); }
        // DC difference
        const dc = q[0], diff = dc - prevDc[comp]; prevDc[comp] = dc;
        let c = category(diff); put(DC.code[c], DC.size[c]); if (c) put(bitsOf(diff, c), c);
        // AC run-lengths in zigzag order
        let run = 0;
        for (let k = 1; k < 64; k++) {
          const v = q[ZIGZAG[k]];
          if (v === 0) { run++; continue; }
          while (run > 15) { put(AC.code[0xf0], AC.size[0xf0]); run -= 16; }
          c = category(v); const sym = (run << 4) | c; put(AC.code[sym], AC.size[sym]); put(bitsOf(v, c), c); run = 0;
        }
        if (run) put(AC.code[0x00], AC.size[0x00]);          // end of block
      }
    }
  }
  if (accBits) put((1 << (8 - accBits)) - 1, 8 - accBits);   // pad the last byte with 1-bits
  return Buffer.concat([...head, out.subarray(0, n), Buffer.from([0xff, 0xd9])]);
}

/** Width/height of a JPEG from its SOF marker without decoding it (used by tests and the original-JPEG record). */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (no SOI)');
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), baseline: m === 0xc0, progressive: m === 0xc2, marker: m };
    }
    i += 2 + len;
  }
  throw new Error('JPEG has no SOF marker');
}

/** Minimal PNG reader for tests: size + RGB bytes for filter-0..4 truecolour/RGBA images, no interlace. */
export function pngSize(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('PNG has no IHDR first');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}
