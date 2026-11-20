// Take 1: the people and objects of the fable.
// WHY a file of its own: take1.tsx decides WHEN things happen; these are just the drawings, each one a single
// readable object (a padlock, a coin meter, a villager, the enchanted quill, a speech bubble...), so a
// stranger can name it in under a second. Paper cut-outs with a plum ink line, like the rest of the town.
// No hooks, ropes or cards: the owner called the hook-and-cards gag "completely random".
import React from 'react';
import { Pictogram, Theme } from './take1-apps';

const INK = '#21152C';
const ink = (w = 2) => ({ stroke: INK, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const });

/** A padlock. `open` 0 = shut, 1 = shackle sprung up. `size` is the body's width. */
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
    </g>
  );
};

/** One coin, spinning on its edge as it flies (`spin` in turns). */
export const Coin: React.FC<{ x: number; y: number; r: number; spin: number; o: number }> = ({ x, y, r, spin, o }) => {
  const c = Math.cos(spin * Math.PI * 2);
  const rx = Math.max(0.18, Math.abs(c)) * r;
  return (
    <g opacity={o}>
      <ellipse cx={x} cy={y} rx={rx} ry={r} fill={c > 0 ? '#E9C25E' : '#D9AE47'} {...ink(Math.max(0.8, r * 0.16))} />
      {rx > r * 0.4 && <ellipse cx={x} cy={y} rx={rx * 0.55} ry={r * 0.55} fill="none" stroke="#B88A2A" strokeWidth={Math.max(0.6, r * 0.14)} />}
    </g>
  );
};

/** A coin meter bolted to a house wall, like a parking meter: a slot on top, a dial whose needle creeps
 *  round as money goes in. `x, y` is its centre; `s` its scale (1 ≈ 26 units tall). `pop` 0..1 grows it
 *  in; `tick` turns the needle; `off` 0..1 tears it off the wall (it tips and drops). */
export const CoinMeter: React.FC<{ x: number; y: number; s: number; pop: number; tick: number; off?: number }> = ({ x, y, s, pop, tick, off = 0 }) => {
  if (pop <= 0 || off >= 1) return null;
  const k = s * pop;
  const a = -120 + ((tick * 47) % 240);
  return (
    <g transform={`translate(${x + off * 6 * s} ${y + off * off * 60 * s}) rotate(${off * 40}) scale(${k})`} opacity={1 - off * off}>
      <rect x={-9} y={-13} width={18} height={26} rx={4} fill="#E6D3F1" {...ink(1.4)} />
      <rect x={-4.5} y={-11.5} width={9} height={2.2} rx={1.1} fill={INK} />
      <circle cx={0} cy={-1} r={6} fill="#FBF6FD" {...ink(1.1)} />
      <line x1={0} y1={-1} x2={Math.cos((a - 90) * Math.PI / 180) * 4.6} y2={-1 + Math.sin((a - 90) * Math.PI / 180) * 4.6} stroke="#C24E74" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={0} cy={8} r={2.6} fill="#E9C25E" {...ink(0.8)} />
    </g>
  );
};

/** The tower's pennant, planted on a roof to say "theirs". `x, y` the foot of its pole. `fly` 0..1 rips
 *  it away (up and spinning) when the town frees itself. */
export const Pennant: React.FC<{ x: number; y: number; s: number; up: number; fly: number; t: number; c: string; seed: number }> = ({ x, y, s, up, fly, t, c, seed }) => {
  if (up <= 0 || fly >= 1) return null;
  const w = Math.sin(t * 6 + seed) * 2;
  const dx = fly * (40 + seed % 30) * s, dy = -fly * 160 * s;
  return (
    <g transform={`translate(${x + dx} ${y + dy}) rotate(${fly * (seed % 2 ? 160 : -160)}) scale(${s} ${s * up})`} opacity={1 - fly}>
      <line x1={0} y1={0} x2={0} y2={-26} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M0 -26 L17 ${-21 + w} L0 -15 Z`} fill={c} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
};

/** A villager: a paper-doll figure, feet at 0,0, about 44 units tall. Poses blend:
 *  `reach` points the near arm out sideways (tapping their window, handing something over),
 *  `shrug` lifts both shoulders and opens the hands, `wave` raises an arm and waves it,
 *  `dir` 1 faces right, -1 left. `coat` is their clothes colour. */
export const Villager: React.FC<{
  x: number; y: number; s: number; coat: string; t: number; reach?: number; shrug?: number; wave?: number; dir?: 1 | -1; o?: number; hair?: number;
}> = ({ x, y, s, coat, t, reach = 0, shrug = 0, wave = 0, dir = 1, o = 1, hair = 0 }) => {
  if (o <= 0) return null;
  const sh = -27 + 3 * shrug;                       // shoulder height (head sinks a little in a shrug)
  const head = { x: 0, y: sh - 8 + 2.5 * shrug };
  // arm = shoulder → elbow → hand, angles in degrees (0 = straight down)
  const arm = (side: 1 | -1, k: number) => {
    const isNear = side === 1;
    let up = 8, fore = 12;                           // resting: hanging by the sides
    if (isNear && reach > 0) { up += (75 - up) * reach; fore += (85 - fore) * reach; }
    if (shrug > 0) { up += (40 - up) * shrug; fore += (120 - fore) * shrug; }
    if (isNear && wave > 0) { const wv = Math.sin(t * 11) * 22; up += (150 - up) * wave; fore += (165 + wv - fore) * wave; }
    const ax = side * 6.5, ay = sh + 2;
    const e = { x: ax + side * Math.sin(up * Math.PI / 180) * 9, y: ay + Math.cos(up * Math.PI / 180) * 9 };
    const h = { x: e.x + side * Math.sin(fore * Math.PI / 180) * 9, y: e.y + Math.cos(fore * Math.PI / 180) * 9 };
    return <path key={k} d={`M${ax} ${ay} L${e.x} ${e.y} L${h.x} ${h.y}`} fill="none" stroke={coat} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />;
  };
  const armOut = (side: 1 | -1, k: number) => {
    // the same arm again, thinner and dark, underneath: an ink outline that keeps the arm readable on any wall
    const a = arm(side, k) as React.ReactElement<{ d: string }>;
    return <g key={k}><path d={a.props.d} fill="none" stroke={INK} strokeWidth={6.8} strokeLinecap="round" strokeLinejoin="round" />{a}</g>;
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${s * dir} ${s})`} opacity={o}>
      {armOut(-1, 0)}
      {/* body: a soft bell shape, wider at the hem */}
      <path d={`M-7 ${sh} Q-11 ${sh + 12} -10 0 L10 0 Q11 ${sh + 12} 7 ${sh} Q0 ${sh - 3} -7 ${sh} Z`} fill={coat} {...ink(1.5)} />
      {/* hair: two styles so neighbours are different people. WHY the long style is drawn as one shape that
          falls behind the head to the shoulder (no separate bun): the reviewer read the old bun as "an
          unexplained blob stuck to the door". */}
      {hair === 0 ? null : <path d={`M${head.x - 9.4} ${head.y + 8} Q${head.x - 10.4} ${head.y - 9} ${head.x} ${head.y - 9.2} Q${head.x + 8.6} ${head.y - 9} ${head.x + 7.8} ${head.y - 1} L${head.x + 1} ${head.y + 3} Q${head.x - 3} ${head.y + 8} ${head.x - 4} ${head.y + 9} Z`} fill={INK} />}
      <circle cx={head.x} cy={head.y} r={6.6} fill="#F1DCCB" {...ink(1.5)} />
      {hair === 0
        ? <path d={`M${head.x - 6.8} ${head.y - 0.5} Q${head.x - 6} ${head.y - 8.5} ${head.x + 1} ${head.y - 7} Q${head.x + 7} ${head.y - 6} ${head.x + 6.8} ${head.y - 0.5} Q${head.x + 2} ${head.y - 4} ${head.x - 6.8} ${head.y - 0.5} Z`} fill={INK} />
        : <path d={`M${head.x - 6.9} ${head.y + 2} Q${head.x - 6.4} ${head.y - 8} ${head.x + 0.5} ${head.y - 7.4} Q${head.x + 6.6} ${head.y - 6.8} ${head.x + 7} ${head.y - 1.2} Q${head.x + 3.4} ${head.y - 4.6} ${head.x - 0.6} ${head.y - 3.8} Q${head.x - 3.6} ${head.y - 1.6} ${head.x - 3.4} ${head.y + 2.4} Z`} fill={INK} />}
      <circle cx={head.x + 2.6} cy={head.y + 0.2} r={0.95} fill={INK} />
      {armOut(1, 1)}
    </g>
  );
};

/** The enchanted quill: the fable's picture of AI. Nib at 0,0, pointing along `angle` (degrees, 0 = right).
 *  Purple vane (the brand's colour: it is what youcoded becomes), a pale shaft, an ink-dark nib. `len` is
 *  its length; `flex` bends the vane like a feather in the wind. */
export const Quill: React.FC<{ x: number; y: number; angle: number; len: number; flex?: number; o?: number }> = ({ x, y, angle, len, flex = 0, o = 1 }) => {
  if (o <= 0) return null;
  const k = len / 100;
  const b = flex * 6;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle + 180}) scale(${k})`} opacity={o} filter="url(#lift)">
      {/* the vane, drawn back from the nib along +x (rotated 180° so the nib leads). WHY curved and starting
          well back from the nib, with a slim split nib: the straight version read as an arrow. */}
      <path d={`M30 -1 C46 ${-14 + b} 72 ${-26 + b} 104 ${-26 + b * 1.6} C92 ${-14 + b} 64 ${-2 + b * 0.4} 30 2 Z`} fill="#9750AA" {...ink(1.6)} />
      <path d={`M30 1 C48 ${10 + b * 0.6} 76 ${8 + b} 100 ${-10 + b * 1.4} C82 ${-4 + b} 58 ${1 + b * 0.3} 30 1 Z`} fill="#C387D3" {...ink(1.6)} />
      {[42, 56, 70, 84].map((u, i) => <path key={i} d={`M${u} ${-0.6 * (u - 30) / 10 + b * (u / 100) * 0.4} L${u + 10} ${-12 - i * 2.4 + b}`} stroke="#E7C8F0" strokeWidth={1.3} strokeLinecap="round" />)}
      <path d={`M10 0 Q60 ${-4 + b * 0.5} 106 ${-20 + b * 1.6}`} fill="none" stroke="#FBF6FD" strokeWidth={2.2} strokeLinecap="round" />
      {/* the barrel and a slim, split nib, dark only at the tip where the ink is */}
      <path d="M0 0 L13 -2.2 Q16 0 13 2.2 Z" fill="#E9DCC8" {...ink(1.1)} />
      <path d="M0 0 L5 -0.9 L5 0.9 Z" fill={INK} />
      <path d="M2.5 0 L10 0" stroke={INK} strokeWidth={0.6} />
    </g>
  );
};

/** A speech bubble holding a picture of the thing a villager is asking for. `x, y` is the tail's tip (at
 *  the villager's mouth); the bubble sits up and to one side. `pop` 0..1 scales it in. */
export const Bubble: React.FC<{ x: number; y: number; s: number; pop: number; layout: number; c: Theme; side?: 1 | -1 }> = ({ x, y, s, pop, layout, c, side = 1 }) => {
  if (pop <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${s * pop})`} opacity={Math.min(1, pop * 3)}>
      <g transform={`translate(${side * 30} -44)`}>
        <path d={`M${-side * 16} 18 L${-side * 30} 44 L${-side * 4} 22 Z`} fill="#FFFDFE" {...ink(1.6)} />
        <rect x={-31} y={-25} width={62} height={48} rx={14} fill="#FFFDFE" {...ink(1.6)} />
        <path d={`M${-side * 14} 21.5 L${-side * 6} 21.5`} stroke="#FFFDFE" strokeWidth={3} />
        <g transform="scale(0.9)"><Pictogram layout={layout} c={c} /></g>
      </g>
    </g>
  );
};

/** Someone at home: a lamp-lit room with a person at their laptop, seen through the glass. Drawn inside a
 *  window's opening. `wave` turns them toward the glass with a raised hand. `warm` 0 dims the room. */
export const Sitter: React.FC<{ x: number; y: number; w: number; h: number; t: number; o: number; wave?: number; warm?: number }> = ({ x, y, w, h, t, o, wave = 0, warm = 1 }) => {
  if (o <= 0) return null;
  const bob = Math.sin(t * 1.7) * h * 0.012;
  const glow = 0.8 + 0.2 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
  const wv = Math.sin(t * 10) * 0.05;
  return (
    <g opacity={o}>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={warm > 0.5 ? '#F5DCC4' : '#5C4570'} />
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#F5DCC4" opacity={warm} />
      <rect x={x} y={y + h * 0.62} width={w} height={h * 0.38} fill="#E6BFA4" opacity={0.4 + 0.6 * warm} />
      {/* a lamp on the wall, and a picture: it is a home */}
      <rect x={x + w * 0.08} y={y + h * 0.14} width={w * 0.14} height={h * 0.18} fill="#C9A06A" opacity={0.6 * warm} />
      <ellipse cx={x + w * 0.62} cy={y + h * 0.5} rx={w * 0.26} ry={h * 0.3} fill="#F7E3C9" opacity={0.7 * glow * warm} />
      <circle cx={x + w * 0.38} cy={y + h * 0.4 + bob} r={h * 0.14} fill={INK} />
      <path d={`M${x + w * 0.16} ${y + h} Q${x + w * 0.17} ${y + h * 0.6 + bob} ${x + w * 0.38} ${y + h * 0.58 + bob} Q${x + w * 0.58} ${y + h * 0.62 + bob} ${x + w * 0.6} ${y + h}`} fill={INK} />
      {wave > 0 && (
        <path d={`M${x + w * 0.48} ${y + h * 0.66} L${x + w * (0.56 + wv)} ${y + h * (0.66 - 0.36 * wave)}`} stroke={INK} strokeWidth={h * 0.08} strokeLinecap="round" opacity={Math.min(1, wave * 3)} />
      )}
      <path d={`M${x + w * 0.68} ${y + h * 0.8} L${x + w * 0.79} ${y + h * 0.44} L${x + w * 0.83} ${y + h * 0.46} L${x + w * 0.73} ${y + h * 0.8} Z`} fill="#9750AA" />
      <rect x={x + w * 0.62} y={y + h * 0.8} width={w * 0.32} height={h * 0.05} fill={INK} />
      {/* the dimmed room: a plum veil */}
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#2A1838" opacity={0.72 * (1 - warm)} />
    </g>
  );
};

/** The same home, framed and hung in a tower's window: "your window is now on their wall". `lit` 0 puts it
 *  out (the frame goes dark and the picture fades). */
export const FramedCopy: React.FC<{ x: number; y: number; w: number; h: number; t: number; pop: number; lit: number }> = ({ x, y, w, h, t, pop, lit }) => {
  if (pop <= 0) return null;
  const fw = w * 0.1;
  return (
    <g transform={`translate(${x + w / 2} ${y + h / 2}) scale(${pop}) translate(${-x - w / 2} ${-y - h / 2})`}>
      <rect x={x - fw} y={y - fw} width={w + 2 * fw} height={h + 2 * fw} rx={fw * 0.6} fill="#B58F4A" {...ink(1.8)} />
      <rect x={x - fw * 0.45} y={y - fw * 0.45} width={w + fw * 0.9} height={h + fw * 0.9} fill="none" stroke="#E2C27A" strokeWidth={fw * 0.3} />
      <Sitter x={x} y={y} w={w} h={h} t={t} o={1} warm={lit} />
      <rect x={x} y={y} width={w} height={h} fill={INK} opacity={0.85 * (1 - lit)} />
    </g>
  );
};

/** A spyglass, drawn big in screen space: three brass-ringed sections ending in a round lens.
 *  Pivot (the eyepiece end) at 0,0; it points along `angle`. `extend` 0..1 slides it out. */
export const Spyglass: React.FC<{ x: number; y: number; angle: number; extend: number; s: number; dark?: boolean }> = ({ x, y, angle, extend, s, dark }) => {
  // WHY `dark`: in the privacy shot it is a sharp silhouette against her lit window (reviewer: the brass
  // version read as clip-art); only a cold glint on the lens is left.
  const body = dark ? '#0C0614' : '#5B4270', hi = dark ? '#2A1A3A' : '#8D72A6', brass = dark ? '#3A2C1A' : '#C9A35A';
  if (extend <= 0.01) return null;
  const L = 300 * extend;
  const segs: [number, number, number][] = [[-40, L * 0.42, 34], [L * 0.36, L * 0.74, 29], [L * 0.68, L, 25]];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`} filter="url(#lift)">
      {segs.map(([a, b, r], i) => (
        <g key={i}>
          <rect x={a} y={-r} width={b - a} height={2 * r} rx={3} fill={body} {...ink(2.4)} />
          <rect x={a + 2} y={-r + 3} width={b - a - 4} height={r * 0.55} rx={2} fill={hi} />
          <rect x={b - 9} y={-r - 3} width={9} height={2 * r + 6} rx={2} fill={brass} {...ink(2)} />
        </g>
      ))}
      {/* the lens end: a brass ring and glass catching the light */}
      <ellipse cx={L + 4} cy={0} rx={10} ry={29} fill={brass} {...ink(2)} />
      <ellipse cx={L + 6} cy={0} rx={6} ry={22} fill={dark ? '#3A3352' : '#DCD6F2'} />
      <ellipse cx={L + 7} cy={-7} rx={2.4} ry={7} fill="#FFFFFF" opacity={0.8} />
    </g>
  );
};
