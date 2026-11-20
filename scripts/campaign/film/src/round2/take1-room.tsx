// Take 1: the top room of the tallest tower, seen from inside. Screen-space drawing (1920x1080 frame).
// WHY a room of its own: the reviewer found 20 s of the same tower skyline under "created a new kind of
// technology… shareholder value… far beyond their own control" ("a screensaver"). Inside, the tower lords are
// only long dark sleeves reaching in from the frame edges (no faces, no company), the quill is the hero on a
// lectern, and every beat of the line is a physical action: they set it down, it writes by itself, they
// shove it aside and lift one framed chart (their treasure) into the light, they grab it, it slips their grip.
// This file only draws. take1.tsx decides WHEN (from word times) and passes poses in.
import React from 'react';
import { Quill } from './take1-props';

const INK = '#07030E';
const FLAG = '#D25AA0';                   // the towers' colour: their cuffs match their flags
const SLEEVE = '#1E1128', SLEEVE_HI = '#3A2349';

export type Pt = { x: number; y: number };
export type HandPose = { at: Pt; from: Pt; grip: number; o?: number; wiggle?: number };
export type RoomState = {
  cam: { cx: number; cy: number; z: number };
  quill: { x: number; y: number; angle: number; len: number; flex: number };
  ink: number;                 // 0..1 how much of the quill's line has been written
  left?: HandPose; right?: HandPose;
  prize?: Prize;               // the treasure, when it is in the room
  lamp: number;                // 0..1 how warm the room is lit
  t: number;
};

/** One point of the quill's written line on the parchment (room units), u 0..1. Exported so the film can
 *  put the nib exactly where the ink is. WHY a loose cursive: it must read as handwriting, not a graph. */
export const inkPt = (u: number): Pt => ({ x: 850 + 230 * u + Math.sin(u * 46) * 7, y: 626 + Math.cos(u * 46) * 9 - 8 * u });
export const LECTERN = { x: 960, top: 600, foot: 880 };

/** A long sleeve from off-frame to the wrist, with a cuff in the towers' colour, then a gloved hand.
 *  `grip` 0 open hand, 1 closed fist. WHY sleeves only: the lords must never be a person or a company,
 *  just the reach of power. */
const Arm: React.FC<{ p: HandPose; t: number }> = ({ p, t }) => {
  const { at, from, grip } = p;
  const dx = at.x - from.x, dy = at.y - from.y; const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const quad = (a: number, b: number, wa: number, wb: number) => {
    const A = { x: from.x + dx * a, y: from.y + dy * a }, B = { x: from.x + dx * b, y: from.y + dy * b };
    return `M${A.x + nx * wa} ${A.y + ny * wa} L${B.x + nx * wb} ${B.y + ny * wb} L${B.x - nx * wb} ${B.y - ny * wb} L${A.x - nx * wa} ${A.y - ny * wa} Z`;
  };
  const wig = (p.wiggle ?? 0) * Math.sin(t * 17);
  // fingers: open they reach forward; closed they curl under
  const finger = (i: number) => {
    const y = -15 + i * 10;
    const len = [30, 34, 32, 25][i] * (1 - 0.62 * grip);
    const bend = (8 + i * 2) * grip + wig * (i % 2 ? 3 : -3);
    return `M44 ${y} L${44 + len} ${y + bend + i * 1.2}`;
  };
  const thumb = grip > 0.5 ? 'M14 -18 L42 -12' : `M14 -18 L${30 + 6 * grip} ${-36 + 18 * grip}`;
  return (
    <g opacity={p.o ?? 1}>
      <path d={quad(0, 1, 92, 58)} fill={SLEEVE} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      {/* a fold of light along the sleeve, so it reads as cloth and not a pipe */}
      <path d={quad(0.1, 0.86, 30, 16)} fill={SLEEVE_HI} opacity={0.55} transform={`translate(${nx * -34} ${ny * -34})`} />
      <path d={quad(0.86, 0.95, 66, 62)} fill={FLAG} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <g transform={`translate(${at.x} ${at.y}) rotate(${ang}) scale(2.1)`}>
        {[0, 1, 2, 3].map((i) => <path key={`o${i}`} d={finger(i)} stroke={INK} strokeWidth={12.5} strokeLinecap="round" fill="none" />)}
        <path d={thumb} stroke={INK} strokeWidth={12.5} strokeLinecap="round" fill="none" />
        <path d="M-4 -21 C18 -27 42 -23 48 -10 L48 12 C42 23 18 27 -4 21 Z" fill={SLEEVE} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        {[0, 1, 2, 3].map((i) => <path key={`f${i}`} d={finger(i)} stroke={SLEEVE} strokeWidth={8.5} strokeLinecap="round" fill="none" />)}
        <path d={thumb} stroke={SLEEVE} strokeWidth={8.5} strokeLinecap="round" fill="none" />
        <path d="M2 -17 C20 -22 38 -19 44 -9" stroke={SLEEVE_HI} strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
};

/** The treasure: ONE gilt frame holding a ledger page whose line climbs. WHY one object, not a hoard: the
 *  owner called the treasure chest "super poorly done" and the reviewer read the coin piles that replaced it
 *  as the same cliché. "Shareholder value" is a number going up, so the treasure is exactly that: a framed
 *  chart the lords lift into the light like a trophy. `line` 0..1 draws the line (the flat part first, the
 *  climb last); `seal` 0..1 is the wax seal stamping onto the corner; `squash` the stamp's spring. */
export type Prize = { x: number; y: number; w: number; h: number; rot: number; line: number; seal: number; squash: number; shine: number; o: number };
const PRIZE_LINE: Pt[] = [[0.06, 0.8], [0.18, 0.74], [0.28, 0.78], [0.4, 0.7], [0.52, 0.73], [0.62, 0.62], [0.74, 0.46], [0.84, 0.28], [0.92, 0.12]].map(([x, y]) => ({ x, y }));
const PrizeDraw: React.FC<{ p: Prize }> = ({ p }) => {
  if (p.o <= 0) return null;
  const { w, h } = p; const b = w * 0.085;               // the gilt border's width
  const ix = -w / 2 + b, iy = -h / 2 + b, iw = w - 2 * b, ih = h - 2 * b;
  // the line, cut to `line` of its length (by segment count: the climb is the last third, so it lands on "shareholder")
  const n = PRIZE_LINE.length - 1, upto = p.line * n, k = Math.floor(upto);
  const pts = PRIZE_LINE.slice(0, k + 1).map((q) => ({ x: ix + q.x * iw, y: iy + q.y * ih }));
  if (k < n && upto > k) {
    const a = PRIZE_LINE[k], c = PRIZE_LINE[k + 1], f = upto - k;
    pts.push({ x: ix + (a.x + (c.x - a.x) * f) * iw, y: iy + (a.y + (c.y - a.y) * f) * ih });
  }
  const tip = pts[pts.length - 1], prev = pts[Math.max(0, pts.length - 2)];
  const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const head = (d: number, s: number) => `${tip.x + Math.cos(ang + d) * s} ${tip.y + Math.sin(ang + d) * s}`;
  // WHY the top-left corner: the lower corners are under the hands, and the top right is the arrow's
  const sealR = w * 0.11, sx = -w / 2 + b * 0.6, sy = -h / 2 + b * 0.6;
  const drop = 1 - p.seal;                                // the seal falls the last little way and lands
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${1 + 0.03 * p.squash} ${1 - 0.04 * p.squash})`} opacity={p.o}>
      <defs>
        <linearGradient id="rmgilt" x1="0" y1={-h / 2} x2="0" y2={h / 2} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F6D77E" /><stop offset="0.5" stopColor="#D9A944" /><stop offset="1" stopColor="#A77824" />
        </linearGradient>
        <clipPath id="rmglass"><rect x={ix} y={iy} width={iw} height={ih} /></clipPath>
      </defs>
      <rect x={-w / 2 + 6} y={-h / 2 + 14} width={w} height={h} rx={6} fill={INK} opacity={0.45} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} fill="url(#rmgilt)" stroke={INK} strokeWidth={4} />
      <rect x={-w / 2 + b * 0.45} y={-h / 2 + b * 0.45} width={w - b * 0.9} height={h - b * 0.9} rx={3} fill="none" stroke="#8A5E1A" strokeWidth={2.5} />
      <rect x={ix} y={iy} width={iw} height={ih} fill="#F6EAD0" stroke={INK} strokeWidth={3} />
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={ix + 10} x2={ix + iw - 10} y1={iy + ih * f} y2={iy + ih * f} stroke="#C9B48E" strokeWidth={2} />)}
      <line x1={ix + iw * 0.06} y1={iy + 8} x2={ix + iw * 0.06} y2={iy + ih - 8} stroke="#A99572" strokeWidth={2.5} />
      <line x1={ix + iw * 0.06} y1={iy + ih * 0.9} x2={ix + iw - 8} y2={iy + ih * 0.9} stroke="#A99572" strokeWidth={2.5} />
      {pts.length > 1 && <path d={`M${pts.map((q) => `${q.x} ${q.y}`).join(' L')}`} fill="none" stroke={FLAG} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
      {p.line > 0.86 && <path d={`M${head(Math.PI * 0.8, 30)} L${tip.x} ${tip.y} L${head(-Math.PI * 0.8, 30)}`} fill="none" stroke={FLAG} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
      {/* the lamplight sliding across the glass on "treasure": one soft band, no sparkles */}
      {p.shine > 0 && p.shine < 1 && <g clipPath="url(#rmglass)"><rect x={ix - iw * 0.4 + iw * 1.6 * p.shine} y={iy - ih} width={iw * 0.22} height={ih * 3} fill="#FFF7E2" opacity={0.4} transform={`rotate(22 ${ix + iw * 0.5} ${iy + ih * 0.5})`} /></g>}
      {p.seal > 0 && (
        <g transform={`translate(${sx} ${sy - drop * 60}) scale(${1 + 0.5 * drop}) rotate(-8)`} opacity={Math.min(1, p.seal * 3)}>
          <path d={Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, rr = sealR * (i % 2 ? 0.92 : 1.04); return `${i ? 'L' : 'M'}${Math.cos(a) * rr} ${Math.sin(a) * rr}`; }).join(' ') + ' Z'} fill={FLAG} stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
          <circle r={sealR * 0.7} fill="none" stroke="#A33C78" strokeWidth={3} />
          <path d={`M${-sealR * 0.36} ${sealR * 0.02} L${-sealR * 0.08} ${sealR * 0.3} L${sealR * 0.4} ${-sealR * 0.3}`} fill="none" stroke="#FBF0F6" strokeWidth={sealR * 0.17} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
};

/** The top room. WHY these pieces: a barred arch window with the identical grey windows of the town far
 *  below (it says "high up, ruling them"), warm lamp light pooled on stone (the only warm thing in the
 *  first act, so the quill is lit like a jewel), one lectern, one parchment, one inkwell. Nothing else. */
export const Room: React.FC<{ s: RoomState }> = ({ s }) => {
  const { cam, quill, ink, prize, lamp, t } = s;
  const tf = `translate(960 540) scale(${cam.z}) translate(${-cam.cx} ${-cam.cy})`;
  const inkD: string[] = [];
  for (let k = 0; k <= 80 * ink; k++) { const p = inkPt(k / 80); inkD.push(`${p.x} ${p.y}`); }
  // stone courses, staggered like real masonry
  const stones: React.ReactNode[] = [];
  for (let r = 0; r < 14; r++) {
    const y = -200 + r * 74;
    stones.push(<line key={`h${r}`} x1={-600} y1={y} x2={2520} y2={y} stroke={INK} strokeOpacity={0.35} strokeWidth={2.5} />);
    for (let c = 0; c < 16; c++) {
      const x = -600 + c * 200 + (r % 2) * 100 + ((r * 37 + c * 13) % 23);
      stones.push(<line key={`v${r}-${c}`} x1={x} y1={y} x2={x} y2={y + 74} stroke={INK} strokeOpacity={0.3} strokeWidth={2.5} />);
    }
  }
  const town = Array.from({ length: 9 }, (_, i) => ({ x: 130 + i * 34 + ((i * 17) % 11), h: 30 + ((i * 29) % 26), w: 30 + ((i * 7) % 9) }));
  return (
    <g transform={tf}>
      <defs>
        <linearGradient id="rmwall" x1="0" y1="-300" x2="0" y2="1100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0E0716" /><stop offset="1" stopColor="#22122C" />
        </linearGradient>
        {/* lamplight pooled on the stone around the lectern: wide and soft, a wash on the wall, not a ball */}
        <radialGradient id="rmlamp" cx="960" cy="640" r="760" gradientUnits="userSpaceOnUse" gradientTransform="translate(960 640) scale(1.25 0.8) translate(-960 -640)">
          <stop offset="0" stopColor="#F2A85C" stopOpacity="0.62" /><stop offset="0.45" stopColor="#C2683E" stopOpacity="0.26" /><stop offset="1" stopColor="#5A2A3A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rmsky" x1="0" y1="180" x2="0" y2="640" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0B0720" /><stop offset="0.7" stopColor="#2B1748" /><stop offset="1" stopColor="#7A4486" />
        </linearGradient>
      </defs>
      <rect x={-800} y={-500} width={3520} height={2100} fill="url(#rmwall)" />
      {stones}
      <rect x={-800} y={-500} width={3520} height={2100} fill="url(#rmlamp)" opacity={lamp} />
      {/* the barred window, and the town far below with its identical grey windows */}
      <g>
        <path d="M120 640 V300 A160 160 0 0 1 440 300 V640 Z" fill="url(#rmsky)" stroke={INK} strokeWidth={5} />
        <path d="M379 236 a38 38 0 1 0 22 62 a30 30 0 1 1 -22 -62 Z" fill="#EDE2F4" opacity={0.9} />
        {town.map((h, i) => (
          <g key={i}>
            <path d={`M${h.x} 640 V${640 - h.h} L${h.x + h.w / 2} ${640 - h.h - 16} L${h.x + h.w} ${640 - h.h} V640 Z`} fill="#140B22" />
            <rect x={h.x + h.w * 0.3} y={640 - h.h * 0.6} width={h.w * 0.4} height={h.h * 0.3} fill="#B8AFC3" opacity={0.8} />
          </g>
        ))}
        {[180, 240, 300, 360].map((x) => <rect key={x} x={x} y={150} width={11} height={492} rx={4} fill="#120A1B" stroke="#4A3560" strokeWidth={1.5} />)}
        <rect x={102} y={636} width={356} height={22} rx={4} fill="#1A0F24" stroke={INK} strokeWidth={3} />
      </g>
      {/* floor */}
      <rect x={-800} y={880} width={3520} height={700} fill="#120917" />
      <line x1={-800} y1={880} x2={2720} y2={880} stroke="#5A3A4E" strokeWidth={3} opacity={0.6} />
      <ellipse cx={LECTERN.x} cy={888} rx={520} ry={40} fill="#F2A85C" opacity={0.12 * lamp} />
      {/* the lectern: a carved pedestal and a slanted desk */}
      <g stroke={INK} strokeWidth={4} strokeLinejoin="round">
        <path d="M850 880 Q960 852 1070 880 Z" fill="#3A2224" />
        <path d="M918 868 L928 690 L992 690 L1002 868 Z" fill="#5A3428" />
        <path d="M928 690 L940 868" stroke="#7A4A36" strokeWidth={6} />
        <path d="M770 664 L1150 664 L1132 596 L788 596 Z" fill="#6E4130" />
        <path d="M770 664 L1150 664 L1150 684 L770 684 Z" fill="#4A2A22" />
        {/* parchment, curling at its corners */}
        <path d="M812 600 Q960 590 1104 600 L1118 656 Q960 648 800 658 Z" fill="#F4E7CC" />
        <path d="M1104 600 q14 2 14 14" fill="none" strokeWidth={3} />
        {/* inkwell */}
        <path d="M1140 596 L1144 566 L1184 566 L1188 596 Z" fill="#1C1426" />
        <rect x={1152} y={556} width={24} height={12} rx={3} fill="#2E2438" />
      </g>
      {inkD.length > 1 && <path d={`M${inkD.join(' L')}`} fill="none" stroke="#9750AA" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
      <Quill x={quill.x} y={quill.y} angle={quill.angle} len={quill.len} flex={quill.flex} />
      {/* WHY the treasure in front of the quill: when they lift it, it eclipses the thing that made it */}
      {prize && <PrizeDraw p={prize} />}
      {s.left && <Arm p={s.left} t={t} />}
      {s.right && <Arm p={s.right} t={t} />}
    </g>
  );
};
