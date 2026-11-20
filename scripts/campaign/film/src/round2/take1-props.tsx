// Take 1: the props the keeps use on the town, and the treasure-map insert.
// WHY a file of its own: take1.tsx decides WHEN things happen; these are just the drawings, each one a single
// readable object (a padlock, a money bag, coins, a person's photos and letters, a spyglass, a map), so a
// stranger can name it in under a second. Paper cut-outs with a plum ink line, like the rest of the town.
import React from 'react';
import { DMSANS } from '../brand';

const INK = '#21152C';
const ink = (w = 2) => ({ stroke: INK, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const });

/** A padlock. `open` 0 = shut, 1 = shackle sprung up. `size` is the body's width in screen pixels. */
export const Padlock: React.FC<{ x: number; y: number; size: number; open: number; rot: number; o: number; squash?: number }> = ({ x, y, size, open, rot, o, squash = 0 }) => {
  const s = size / 60;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s * (1 + squash)} ${s * (1 - squash)})`} opacity={o} filter="url(#lift)">
      {/* WHY the shackle drawn first: its legs disappear into the body, so it reads as one solid lock */}
      <g transform={`translate(${open * 3} ${-15 * open})`}>
        <path d="M-17 -10 V-32 A17 17 0 0 1 17 -32 V-10" fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" />
        <path d="M-17 -10 V-32 A17 17 0 0 1 17 -32 V-10" fill="none" stroke="#CDBBDD" strokeWidth={6.5} strokeLinecap="round" />
      </g>
      <rect x={-30} y={-18} width={60} height={46} rx={8} fill="#E6D3F1" {...ink(2.4)} />
      <rect x={-30} y={-18} width={60} height={9} rx={4} fill="#C9B0DB" />
      <rect x={-30} y={-18} width={60} height={46} rx={8} fill="none" {...ink(2.4)} />
      <circle cx={0} cy={2} r={6} fill={INK} />
      <path d="M-3 4 L-5 17 L5 17 L3 4 Z" fill={INK} />
      <path d="M-24 22 L24 22" stroke="#9750AA" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
};

/** A cloth money bag with a coin sewn on its front. `fill` 0..1 makes it bulge; `open` widens its mouth. */
export const MoneyBag: React.FC<{ x: number; y: number; size: number; fill: number; open: number; rot: number; o: number }> = ({ x, y, size, fill, open, rot, o }) => {
  const s = size / 60;
  const b = 1 + 0.16 * fill;
  const m = 8 + 10 * open;                                   // half-width of the mouth
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={o} filter="url(#lift)">
      <g transform={`scale(${b} ${1 + 0.06 * fill})`}>
        <path d={`M${-m} -16 Q-36 4 -27 24 Q0 38 27 24 Q36 4 ${m} -16 Z`} fill="#DCC7EA" {...ink(2.2)} />
        <path d={`M${-m} -16 Q-30 4 -22 22 Q-12 28 -4 30`} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={3} />
        <circle cx={0} cy={9} r={10} fill="#E9C25E" {...ink(1.8)} />
        <circle cx={0} cy={9} r={5.5} fill="none" stroke="#B88A2A" strokeWidth={1.8} />
      </g>
      {/* the gathered neck and its tie */}
      <path d={`M${-m} -16 L${-m - 6} -27 L${m + 6} -27 L${m} -16 Z`} fill="#CDB4DF" {...ink(2)} />
      <ellipse cx={0} cy={-27} rx={m + 6} ry={3 + 2.5 * open} fill={open > 0.3 ? '#4A2D5C' : '#CDB4DF'} {...ink(1.8)} />
      <path d={`M${-m - 1} -17 Q0 -12 ${m + 1} -17`} fill="none" stroke="#9750AA" strokeWidth={3} />
    </g>
  );
};

/** One coin, spinning on its edge as it flies (`spin` in turns). */
export const Coin: React.FC<{ x: number; y: number; r: number; spin: number; o: number }> = ({ x, y, r, spin, o }) => {
  const c = Math.cos(spin * Math.PI * 2);
  const rx = Math.max(0.18, Math.abs(c)) * r;
  return (
    <g opacity={o}>
      <ellipse cx={x} cy={y} rx={rx} ry={r} fill={c > 0 ? '#E9C25E' : '#D9AE47'} {...ink(Math.max(1.2, r * 0.16))} />
      {rx > r * 0.4 && <ellipse cx={x} cy={y} rx={rx * 0.55} ry={r * 0.55} fill="none" stroke="#B88A2A" strokeWidth={Math.max(1, r * 0.14)} />}
    </g>
  );
};

/** A person's things, as paper cards: a photo of them, a letter with a heart, their calendar, a map with
 *  their pin. WHY these four: "personal data" made concrete in a picture anyone recognises as theirs. */
export type CardKind = 'photo' | 'letter' | 'calendar' | 'pin';
export const CARDS: CardKind[] = ['photo', 'letter', 'calendar', 'pin'];
export const Card: React.FC<{ kind: CardKind; x: number; y: number; size: number; rot: number; o: number }> = ({ kind, x, y, size, rot, o }) => {
  const s = size / 48;
  let art: React.ReactNode;
  if (kind === 'photo') art = (<g>
    <rect x={-19} y={-23} width={38} height={46} rx={2} fill="#FBF7FD" {...ink(2)} />
    <rect x={-14} y={-18} width={28} height={27} fill="#D9C3E8" />
    <circle cx={0} cy={-8} r={5.5} fill="#6E4A86" />
    <path d="M-10 9 Q-10 -1 0 -1 Q10 -1 10 9 Z" fill="#6E4A86" />
  </g>);
  else if (kind === 'letter') art = (<g>
    <rect x={-23} y={-16} width={46} height={32} rx={2} fill="#F3EAF9" {...ink(2)} />
    <path d="M-23 -15 L0 3 L23 -15" fill="none" stroke="#C9B0DB" strokeWidth={2.5} strokeLinejoin="round" />
    <path d="M0 9 C-9 2 -9 -5 -4 -5 C-2 -5 0 -3 0 -1 C0 -3 2 -5 4 -5 C9 -5 9 2 0 9 Z" fill="#9750AA" />
  </g>);
  else if (kind === 'calendar') art = (<g>
    <rect x={-19} y={-21} width={38} height={42} rx={3} fill="#FBF7FD" {...ink(2)} />
    <rect x={-19} y={-21} width={38} height={10} rx={3} fill="#9750AA" />
    {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={-13 + c * 10} y={-5 + r * 8} width={6} height={4} rx={1} fill="#C9B0DB" />))}
    <circle cx={-0} cy={5} r={6} fill="none" stroke="#9750AA" strokeWidth={2} />
  </g>);
  else art = (<g>
    <rect x={-20} y={-19} width={40} height={38} rx={3} fill="#EFE3F6" {...ink(2)} />
    <path d="M-20 4 C-6 -2 4 12 20 2 M-6 -19 C-2 -6 -8 8 -4 19" fill="none" stroke="#C9B0DB" strokeWidth={3} />
    <path d="M4 7 C-4 -2 -4 -12 4 -12 C12 -12 12 -2 4 7 Z" fill="#9750AA" {...ink(1.6)} />
    <circle cx={4} cy={-6} r={2.5} fill="#F7F0FB" />
  </g>);
  return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={o} filter="url(#lift)">{art}</g>;
};

/** A keep's spyglass: three brass-ringed sections that slide out of a window. World units (towers layer).
 *  `extend` 0 = tucked away, 1 = fully out. `angle` in degrees, 0 = pointing right. */
export const Spyglass: React.FC<{ x: number; y: number; angle: number; extend: number; dark: string; lit: string; rim: string; inkC: string }> = ({ x, y, angle, extend, dark, lit, rim, inkC }) => {
  if (extend <= 0.01) return null;
  const L = 175 * extend;
  // [start, end, radius] of each section along the tube, each one narrower: it reads as a spyglass, not a cannon
  const segs: [number, number, number][] = [[-22, L * 0.42, 16], [L * 0.36, L * 0.74, 13], [L * 0.68, L, 11]];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      {segs.map(([a, b, r], i) => (
        <g key={i}>
          <rect x={a} y={-r} width={b - a} height={2 * r} rx={2} fill={dark} stroke={inkC} strokeWidth={1.8} />
          <rect x={a} y={-r} width={b - a} height={r * 0.7} rx={2} fill={lit} />
          <rect x={b - 5} y={-r - 1.5} width={5} height={2 * r + 3} rx={1.5} fill={rim} stroke={inkC} strokeWidth={1.2} />
        </g>
      ))}
      {/* the lens: a pale disc at the far end, the eye the town feels on it */}
      <ellipse cx={L + 1} cy={0} rx={4} ry={10} fill="#F3EAF9" stroke={inkC} strokeWidth={1.2} />
    </g>
  );
};

/** Someone at home: a lamp-lit window with a person at their computer, seen from behind the glass.
 *  Drawn inside the window's opening (before its cross bars), in the town's world units. */
export const Sitter: React.FC<{ x: number; y: number; w: number; h: number; t: number; o: number }> = ({ x, y, w, h, t, o }) => {
  if (o <= 0) return null;
  const bob = Math.sin(t * 1.7) * h * 0.012;
  const glow = 0.8 + 0.2 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
  return (
    <g opacity={o}>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#F2DCEB" />
      <rect x={x} y={y + h * 0.55} width={w} height={h * 0.45} fill="#E3C3DD" />
      {/* the laptop's light on the person's face */}
      <ellipse cx={x + w * 0.62} cy={y + h * 0.52} rx={w * 0.3} ry={h * 0.32} fill="#D7A9E6" opacity={0.6 * glow} />
      {/* head and shoulders, facing the screen */}
      <circle cx={x + w * 0.36} cy={y + h * 0.38 + bob} r={h * 0.15} fill={INK} />
      <path d={`M${x + w * 0.12} ${y + h} Q${x + w * 0.14} ${y + h * 0.58 + bob} ${x + w * 0.36} ${y + h * 0.56 + bob} Q${x + w * 0.56} ${y + h * 0.6 + bob} ${x + w * 0.58} ${y + h}`} fill={INK} />
      {/* the laptop: its lid from the side, lit */}
      <path d={`M${x + w * 0.66} ${y + h * 0.78} L${x + w * 0.78} ${y + h * 0.4} L${x + w * 0.82} ${y + h * 0.42} L${x + w * 0.72} ${y + h * 0.78} Z`} fill="#9750AA" />
      <rect x={x + w * 0.6} y={y + h * 0.78} width={w * 0.34} height={h * 0.06} fill={INK} />
    </g>
  );
};

// ---------- the treasure map ----------
// WHY a map: "a great treasure" is said like a pirate's dream, so the keeps' dream is drawn as a treasure
// map, and the dry "shareholder value" is the reveal that its mountain range was a stock chart all along:
// gridlines and quarters slide in, the dotted trail becomes the line, the X becomes an arrow. One picture,
// one joke, landed on the word.
const RIDGE: [number, number][] = [
  [600, 730], [668, 650], [722, 688], [800, 588], [858, 628], [946, 510], [1004, 552], [1092, 438],
  [1152, 478], [1246, 360], [1306, 398], [1404, 284], [1460, 318], [1556, 226],
];
const BASE_Y = 772;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (t: number, a: number, b: number, e: (x: number) => number = (x) => 1 - (1 - x) ** 3) => e(clamp01((t - a) / (b - a)));
const backOut = (x: number) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const smooth = (x: number) => x * x * (3 - 2 * x);

export const TreasureMap: React.FC<{ t: number; at: number; treasure: number; shareholder: number; value: number; out: number }> = ({ t, at, treasure, shareholder, value, out }) => {
  if (t < at || t >= out) return null;
  const unroll = ramp(t, at, at + 0.5);
  // the camera on the page: a slow push toward the X while the narrator pauses, then a quick pull back
  // on "shareholder" so the whole chart is seen at once (the pull-back IS the punchline's timing)
  const push = ramp(t, at + 0.35, shareholder - 0.05, smooth);
  const pull = ramp(t, shareholder - 0.04, shareholder + 0.5);
  const sc = 1 + 0.26 * push - 0.3 * pull;
  const fx = 960 + (1330 - 960) * push * (1 - pull), fy = 540 + (420 - 540) * push * (1 - pull);
  const reveal = ramp(t, shareholder - 0.02, shareholder + 0.45);
  const arrow = ramp(t, value - 0.02, value + 0.3, backOut);
  const trailP = ramp(t, at + 0.3, treasure + 0.1, smooth);
  const x1 = ramp(t, treasure - 0.02, treasure + 0.12), x2 = ramp(t, treasure + 0.1, treasure + 0.24);
  const ridge = RIDGE.map(([x, y]) => `${x} ${y}`).join(' L');
  const peaks = RIDGE.filter((_, i) => i % 2 === 1);
  const last = RIDGE[RIDGE.length - 1], prev = RIDGE[RIDGE.length - 2];
  const ang = (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) / Math.PI;
  const half = 730 * unroll;
  const brown = '#6B4A3E';
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="t1table" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#2E1A3C" /><stop offset="1" stopColor="#120818" /></radialGradient>
        <clipPath id="t1mapclip"><rect x={960 - half} y={0} width={2 * half} height={1080} /></clipPath>
        <filter id="t1parch"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.09 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
        <linearGradient id="t1roll" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#C9AE8C" /><stop offset="0.45" stopColor="#F4E8D4" /><stop offset="1" stopColor="#B89A78" /></linearGradient>
        <radialGradient id="t1burn" cx="50%" cy="50%" r="70%"><stop offset="0.7" stopColor="#7A5432" stopOpacity="0" /><stop offset="1" stopColor="#7A5432" stopOpacity="0.32" /></radialGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#t1table)" />
      <g transform={`translate(960 540) scale(${sc}) translate(${-fx} ${-fy})`}>
        <g clipPath="url(#t1mapclip)">
          {/* the parchment, with a soft shadow on the table */}
          <rect x={238} y={184} width={1460} height={712} rx={6} fill="#0A0410" opacity={0.45} transform="translate(8 14)" />
          <rect x={230} y={170} width={1460} height={712} rx={6} fill="#F1E4CF" />
          <rect x={230} y={170} width={1460} height={712} rx={6} fill="url(#t1burn)" />
          <rect x={230} y={170} width={1460} height={712} rx={6} fill="#F1E4CF" filter="url(#t1parch)" />
          {/* the sea, a ship and a compass rose on the left */}
          <path d="M230 170 L520 170 C560 300 500 420 560 520 C610 610 540 720 600 882 L230 882 Z" fill="#E4D6C6" />
          <path d="M520 170 C560 300 500 420 560 520 C610 610 540 720 600 882" fill="none" stroke={brown} strokeWidth={2.4} strokeOpacity={0.7} />
          {[[300, 260], [420, 330], [330, 420], [450, 470], [300, 560], [430, 620]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q12 -10 24 0 q12 10 24 0`} fill="none" stroke={brown} strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />
          ))}
          <g transform="translate(395 545)" opacity={0.85}>
            <path d="M-34 0 L34 0 L24 16 L-24 16 Z" fill="#B99A80" stroke={brown} strokeWidth={2} strokeLinejoin="round" />
            <line x1={0} y1={0} x2={0} y2={-58} stroke={brown} strokeWidth={2.4} />
            <path d="M3 -54 Q30 -32 3 -8 Z" fill="#F7EEDF" stroke={brown} strokeWidth={1.8} />
            <path d="M-3 -46 Q-22 -28 -3 -10 Z" fill="#F7EEDF" stroke={brown} strokeWidth={1.8} />
          </g>
          <g transform="translate(360 770)" opacity={0.8}>
            <circle r={44} fill="none" stroke={brown} strokeWidth={1.6} />
            <path d="M0 -56 L8 -8 L56 0 L8 8 L0 56 L-8 8 L-56 0 L-8 -8 Z" fill="#E9DBC6" stroke={brown} strokeWidth={1.8} strokeLinejoin="round" />
            <path d="M0 -56 L8 -8 L0 0 Z M56 0 L8 8 L0 0 Z M0 56 L-8 8 L0 0 Z M-56 0 L-8 -8 L0 0 Z" fill={brown} opacity={0.75} />
          </g>
          {/* the chart's grid, slid in on "shareholder" (drawn under the mountains so they still read as land) */}
          {[300, 420, 540, 660].map((y, i) => {
            const g = ramp(t, shareholder + i * 0.05, shareholder + 0.35 + i * 0.05);
            return g > 0 ? <line key={y} x1={600} y1={y} x2={600 + 1040 * g} y2={y} stroke={brown} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="10 9" /> : null;
          })}
          {/* Before the reveal it must read as a MAP, not a chart: separate engraved peaks of different
              widths (overlapping, shaded on one side, snow on top), a winding river, forests and a little
              castle. Only the peaks' tips sit on the chart line, so nobody sees the chart until it is drawn. */}
          <path d={`M${RIDGE[0][0]} ${BASE_Y} L${ridge} L${last[0]} ${BASE_Y} Z`} fill="#E3CCEE" opacity={reveal} />
          <path d={`M${RIDGE[0][0]} ${BASE_Y} L${ridge} L${last[0]} ${BASE_Y} Z`} fill="#9750AA" opacity={0.16 * reveal} />
          <g opacity={1 - reveal}>
            {/* a river winding from the hills down to the sea */}
            <path d="M1180 772 C1120 800 1060 790 1000 820 C930 855 860 830 800 850 C730 872 660 860 600 878" fill="none" stroke="#B8A99A" strokeWidth={9} strokeLinecap="round" />
            <path d="M1180 772 C1120 800 1060 790 1000 820 C930 855 860 830 800 850 C730 872 660 860 600 878" fill="none" stroke={brown} strokeOpacity={0.45} strokeWidth={1.6} />
            {peaks.map(([px, py], i) => {
              // each peak its own width, so the range looks drawn by hand, not plotted
              const wl = [70, 85, 95, 105, 120, 135, 150][i] ?? 100, wr = wl * (0.75 + 0.1 * (i % 3));
              const shade = `M${px} ${py} L${px + wr} ${BASE_Y} L${px + wr * 0.2} ${BASE_Y} Z`;
              return (
                <g key={i}>
                  <path d={`M${px - wl} ${BASE_Y} L${px} ${py} L${px + wr} ${BASE_Y} Z`} fill="#E8D9C3" stroke={brown} strokeWidth={2.4} strokeLinejoin="round" />
                  <path d={shade} fill="#CDB89C" />
                  {[0.3, 0.5, 0.7].map((f) => <line key={f} x1={px + wr * f * 0.5} y1={py + (BASE_Y - py) * f} x2={px + wr * f * 0.5 + 18} y2={py + (BASE_Y - py) * f + 24} stroke={brown} strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />)}
                  <path d={`M${px - wl * 0.22} ${py + (BASE_Y - py) * 0.2} L${px} ${py} L${px + wr * 0.22} ${py + (BASE_Y - py) * 0.2} L${px + wr * 0.06} ${py + (BASE_Y - py) * 0.15} L${px - wl * 0.06} ${py + (BASE_Y - py) * 0.22} Z`} fill="#FFFBF4" stroke={brown} strokeWidth={1.4} strokeLinejoin="round" />
                </g>
              );
            })}
            {/* forests in the foothills */}
            {[[640, 830], [668, 846], [700, 828], [880, 812], [906, 828], [1040, 806], [1066, 820], [1250, 796], [1276, 812], [1450, 800], [1476, 816]].map(([x, y], i) => (
              <path key={i} d={`M${x} ${y} l11 -28 l11 28 Z M${x + 11} ${y} v7`} fill="#BFA98F" stroke={brown} strokeWidth={1.6} strokeLinejoin="round" />
            ))}
            {/* a little castle where the trail begins */}
            <g transform="translate(760 812)" fill="#E8D9C3" stroke={brown} strokeWidth={1.8} strokeLinejoin="round">
              <path d="M-22 0 V-26 h7 v6 h6 v-6 h6 v6 h6 v-6 h7 V0 Z" />
              <path d="M-4 0 v-10 a4 4 0 0 1 8 0 v10" fill={brown} fillOpacity={0.5} />
              <path d="M0 -26 v-16 l12 5 l-12 4" fill="#9A3B3B" fillOpacity={0.7} />
            </g>
          </g>
          {/* the chart's line, drawn on "shareholder" through every peak and valley */}
          <path d={`M${ridge}`} fill="none" stroke="#9750AA" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={2600} strokeDashoffset={2600 * (1 - reveal)} />
          {/* the dotted trail: from the castle along the river and the foothills, then up the last peak to the X */}
          <g opacity={1 - reveal}>
            <clipPath id="t1trailclip"><rect x={740} y={0} width={900 * trailP} height={1080} /></clipPath>
            <path d="M770 800 C840 790 880 770 960 784 S1120 770 1200 752 S1380 700 1440 560 S1520 300 1556 214" fill="none" stroke="#9A3B3B" strokeWidth={5} strokeDasharray="2 14" strokeLinecap="round" clipPath="url(#t1trailclip)" />
          </g>
          {/* the axes and the four quarters: the moment the map stops being a map */}
          <g opacity={reveal}>
            <line x1={600} y1={196} x2={600} y2={BASE_Y} stroke={brown} strokeWidth={3} />
            <line x1={600} y1={BASE_Y} x2={1640} y2={BASE_Y} stroke={brown} strokeWidth={3} />
          </g>
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
            const p = ramp(t, shareholder + 0.15 + i * 0.07, shareholder + 0.45 + i * 0.07, backOut);
            return p > 0 ? <text key={q} x={730 + i * 250} y={BASE_Y + 52} fontFamily={DMSANS} fontWeight={700} fontSize={34} fill={brown} textAnchor="middle" opacity={clamp01(p)} transform={`translate(0 ${(1 - p) * 12})`}>{q}</text> : null;
          })}
          {/* the X, hand-drawn in two strokes on "treasure"; it turns into the chart's arrowhead on "value" */}
          <g transform={`translate(${last[0]} ${last[1] - 30})`} opacity={1 - arrow}>
            <line x1={-20} y1={-20} x2={-20 + 40 * x1} y2={-20 + 40 * x1} stroke="#9750AA" strokeWidth={9} strokeLinecap="round" />
            <line x1={20} y1={-20} x2={20 - 40 * x2} y2={-20 + 40 * x2} stroke="#9750AA" strokeWidth={9} strokeLinecap="round" />
          </g>
          {arrow > 0 && (
            <g transform={`translate(${last[0]} ${last[1]}) rotate(${ang}) scale(${arrow})`}>
              <path d="M10 0 L-22 -18 L-14 0 L-22 18 Z" fill="#9750AA" stroke="#9750AA" strokeWidth={4} strokeLinejoin="round" />
            </g>
          )}
        </g>
        {/* the rolled ends of the scroll, sliding apart as it opens */}
        {[-1, 1].map((sd) => (
          <g key={sd} transform={`translate(${960 + sd * half} 0)`}>
            <rect x={-16} y={156} width={32} height={740} rx={16} fill="url(#t1roll)" stroke={brown} strokeWidth={2} />
            <ellipse cx={0} cy={156} rx={16} ry={6} fill="#D9C2A0" stroke={brown} strokeWidth={1.6} />
          </g>
        ))}
      </g>
    </svg>
  );
};

/** Mix two hex colours (0 = a, 1 = b). */
function mixHex(a: string, b: string, p: number) {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * clamp01(p))).join(',')})`;
}
