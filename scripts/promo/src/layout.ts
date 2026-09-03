// src/layout.ts — the ONE set of screen coordinates. Every beat positions the
// window, the caption, the host and the phone from here; nothing is ad hoc.
// The window is filmed at 1440×900 and shown at 0.96 (near 1:1 pixels, so the
// app's 14 px text stays ~13.4 px in the video), leaving headroom for the host
// above and a caption band below. Approved from the `Layout` still before any
// beat existed.
//
// WHY 0.96 rather than the plan's first guess of 0.98, and WHY cy is 528 and
// not the frame's centre: push-ins scale the window from its TOP edge (so the
// host's feet stay glued to the title bar), which means a 3 % push-in grows the
// window 26 px DOWNWARD. The vertical budget is therefore
//   10 (headroom) + 86 (mascot above the title bar) + 890 (window at max
//   push-in) + 16 (clear space) + 53 (caption text) + 25 (bottom margin) = 1080.
// At 0.98/cy 541 the pushed-in window reached y 1005 and ran into the caption.
export const FRAME = { w: 1920, h: 1080 };
export const CLIP = { w: 1440, h: 900 };                       // what record.mjs films
export const WINDOW = { scale: 0.96, cx: 960, cy: 528 };       // centre; 1382×864 at 0.96 → x 269–1651, y 96–960
/** Max push-in any beat may use. Bigger and the window grows into the caption band. */
export const MAX_PUSH_IN = 0.03;
export const windowRect = (scale = WINDOW.scale) => {
  const w = CLIP.w * scale, h = CLIP.h * scale;
  return { x: WINDOW.cx - w / 2, y: WINDOW.cy - h / 2, w, h };
};
export const CAPTION = { top: 984, h: 90, size: 44 };          // the band below the window (text centre y 1029)
export const MASCOT = { size: 120, feetIn: 34 };               // feet `feetIn` px into the window's title bar
/** Where the host sits on the window's top edge, for a given window scale and a 0–1 position along it. */
export const perch = (along = 0.3, scale = WINDOW.scale) => {
  const r = windowRect(scale);
  return { x: r.x + r.w * along - MASCOT.size / 2, y: r.y - MASCOT.size + MASCOT.feetIn };
};
export const PHONE = { w: 390, h: 844, scale: 0.86, x: 1445, y: 130 };   // over the window's right edge, clear of the caption band
