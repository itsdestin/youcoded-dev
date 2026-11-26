// shotmark — a small label written INSIDE a PNG that says "this is a real screenshot of the app".
//
// WHY (Destin, 2026-11-23: "it make fully custom/unique mockup ui's instead of basing on the real app?"): a session drew
// the design options for a deck by pasting hand-written HTML into a frozen copy of a screen and photographing that. The
// deck had no way to tell those pictures from real ones. `shoot` and `explore` photograph the real renderer, so they now
// write this label into every picture they take; the deck builder refuses a question's or option's picture without it
// (scripts/ui-review/deck/shotmark.py reads it back). A picture of a frozen copy, a mockup page or an edited image never
// gets it: ui-probe does not write it, and an image editor drops it.
//
// The label is a standard PNG text chunk (tEXt, keyword `youcoded-shot`, JSON text), placed right after the header. It
// changes no pixel, and every image viewer ignores it.
import { crc32 } from 'node:zlib';

export const SHOT_KEY = 'youcoded-shot';
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Returns a copy of `png` carrying the label `info` (e.g. {by: 'shoot', screen, theme}). A non-PNG is returned as is. */
export function markShot(png, info) {
  if (!Buffer.isBuffer(png) || png.length < 33 || !png.subarray(0, 8).equals(SIG)) return png;
  const data = Buffer.concat([Buffer.from(SHOT_KEY, 'latin1'), Buffer.from([0]), Buffer.from(JSON.stringify(info), 'latin1')]);
  const type = Buffer.from('tEXt', 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;   // signature, then the IHDR chunk (length, type, 13 bytes, crc)
  return Buffer.concat([png.subarray(0, ihdrEnd), len, type, data, crc, png.subarray(ihdrEnd)]);
}

/** Reads the label back: the info object, or null when the picture has none. */
export function readShotMark(png) {
  if (!Buffer.isBuffer(png) || !png.subarray(0, 8).equals(SIG)) return null;
  for (let at = 8; at + 8 <= png.length;) {
    const n = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8);
    if (type === 'tEXt') {
      const body = png.subarray(at + 8, at + 8 + n), z = body.indexOf(0);
      if (z > 0 && body.toString('latin1', 0, z) === SHOT_KEY) { try { return JSON.parse(body.toString('latin1', z + 1)); } catch { return null; } }
    }
    if (type === 'IDAT' || type === 'IEND') return null;   // text chunks we write sit before the picture data
    at += 12 + n;
  }
  return null;
}
