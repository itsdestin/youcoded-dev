// Take 1C's drawing kit: ink that draws itself, flat colour washes, and the cast.
// WHY one kit: the film is a picture book, so every page must look printed by the same hand. All
// characters share one line weight, one ink colour and one way of arriving (the line draws, then the
// colour floods in), which is what makes thirty different drawings read as one book.
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';

// ---------- palette of the book ----------
// WHY cream paper and plum ink: the story opens almost monochrome (the world as it is) and only gains the
// brand's purples, pink and one warm accent as it turns hopeful. Cream is the paper, not a brand colour.
export const P = {
  paper: '#F8F1E6', paperShade: '#EADFD2',
  ink: '#2A1A35', inkSoft: '#5B4A66', inkFaint: 'rgba(42,26,53,0.28)',
  wash: '#E2D6DA', mist: '#E6DCE2',            // the only "colour" before the turn: a grey-plum wash
  purple: C.purple, violet: C.gradA, pink: C.gradB, lilac: '#E6D2F1', plum: C.plum2,
  sun: '#E8A33D',             // the campaign's one extra colour (brand §5), used sparingly and only after the turn
  sunSoft: '#F3D29A', pinkSoft: '#F2C6DD', violetSoft: '#D9C2F0', purpleSoft: '#D7B6E0',
};
/** What ordinary people wear once colour arrives. WHY muted: the reviewer found the shirts and the app themes
 *  shared one pastel set, so "a person" and "their app" blurred into confetti. Clothes stay quiet; each
 *  person's app is what carries the colour. */
export const NEUTRAL = ['#CDBBA7', '#9FAABB', '#BFA6AC', '#A9B39C', '#D6C6A8', '#A496A6', '#B7A99A', '#93A0A8', '#C4B4BC', '#B2B59E', '#CBB79F', '#A3A3B6'];

/** How a figure arrives. 'draw' inks it stroke by stroke; 'pop' has it land whole with one soft overshoot;
 *  'wipe' reveals the finished figure from the feet up. WHY the last two: half-drawn strokes in the opening
 *  read as loose fragments floating in space (a rendering fault), never as drawing. */
export type Enter = 'draw' | 'pop' | 'wipe';
let clipSeq = 0;
/** Wraps a finished figure (its own times pushed into the past) in its entrance. */
const Entrance: React.FC<{ enter: Enter; a: number; dur: number; x: number; y: number; h: number; children: React.ReactNode }> = ({ enter, a, dur, x, y, h, children }) => {
  const t = useT();
  const [id] = React.useState(() => `c-wipe-${++clipSeq}`);
  if (enter === 'pop') {
    const p = pop(t, a, dur);
    if (p <= 0) return null;
    // squash and stretch from the feet: lands a touch wide and short, settles tall
    const sy = p, sx = 1 + (1 - Math.min(1, p)) * 0.25;
    return <g transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`}>{children}</g>;
  }
  const p = lin(t, a, a + dur, EASE_IN_OUT);
  if (p <= 0) return null;
  return (
    <>
      <defs><clipPath id={id}><rect x={x - 400} y={y + 20 - (h + 40) * p} width={800} height={(h + 40) * p} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** Mix two #rrggbb colours (k = 0 gives a, 1 gives b). */
export const mixHex = (a: string, b: string, k: number) => {
  const h = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(h(a, i) + (h(b, i) - h(a, i)) * k).toString(16).padStart(2, '0')).join('')}`;
};
/** Current film time in seconds. */
export const useT = () => useCurrentFrame() / FPS;
/** 0→1 between a and b (seconds), eased. */
export const lin = (t: number, a: number, b: number, ease: (x: number) => number = EASE_OUT) =>
  b <= a ? (t >= a ? 1 : 0) : interpolate(t, [a, b], [0, 1], { ...clamp, easing: ease });
/** A springy 0→1 (one soft overshoot), for things that land: a padlock, a tag, a quill. */
export const pop = (t: number, a: number, dur = 0.45) => {
  const x = Math.min(1, Math.max(0, (t - a) / dur));
  if (x <= 0) return 0;
  return 1 - Math.exp(-6 * x) * Math.cos(x * 9.5) * (1 - x * 0.2);
};
/** Settles to 0: a decaying wobble that starts at `a` (for bumps and jolts). */
export const jolt = (t: number, a: number, amp = 1, dur = 0.7) => {
  const x = (t - a) / dur;
  if (x <= 0 || x >= 1) return 0;
  return amp * Math.sin(x * Math.PI * 4) * (1 - x) * (1 - x);
};

// ---------- ink ----------
type InkProps = { d: string; a: number; b: number; w?: number; c?: string; o?: number; ea?: number; eb?: number; cap?: 'round' | 'butt' };
/** A line that draws itself between a and b; with ea/eb it un-draws again (ink retreating into the page). */
export const Ink: React.FC<InkProps> = ({ d, a, b, w = 3, c = P.ink, o = 1, ea, eb, cap = 'round' }) => {
  const t = useT();
  const p = lin(t, a, b, EASE_IN_OUT) - (ea == null ? 0 : lin(t, ea, eb ?? ea + 0.5, EASE_IN_OUT));
  if (p <= 0.001) return null;
  // WHY pathLength=1: every stroke, long or short, then draws with the same 0→1 dash maths.
  return <path d={d} pathLength={1} fill="none" stroke={c} strokeWidth={w} strokeLinecap={cap} strokeLinejoin="round" opacity={o}
    strokeDasharray={p >= 0.999 ? undefined : '1 2'} strokeDashoffset={p >= 0.999 ? undefined : 1 - p} />;
};
/** A flat colour that soaks in after its outline is drawn. */
export const Wash: React.FC<{ d: string; a: number; b?: number; fill: string; o?: number; ea?: number }> = ({ d, a, b, fill, o = 1, ea }) => {
  const t = useT();
  const p = lin(t, a, b ?? a + 0.35) * (ea == null ? 1 : 1 - lin(t, ea, ea + 0.4));
  if (p <= 0.001) return null;
  return <path d={d} fill={fill} opacity={p * o} />;
};
/** Outline + fill as one drawn shape. */
export const Shape: React.FC<{ d: string; a: number; b: number; fill?: string; w?: number; c?: string; fo?: number; ea?: number; eb?: number }> = ({ d, a, b, fill, w = 3, c = P.ink, fo = 1, ea, eb }) => (
  <>
    {fill && <Wash d={d} a={a + (b - a) * 0.55} b={b + 0.2} fill={fill} o={fo} ea={ea} />}
    <Ink d={d} a={a} b={b} w={w} c={c} ea={ea} eb={eb} />
  </>
);
/** Fades a whole group in (and optionally out): for small details that should not "draw". */
export const Appear: React.FC<{ a: number; b?: number; out?: number; children: React.ReactNode }> = ({ a, b, out, children }) => {
  const t = useT();
  const o = lin(t, a, b ?? a + 0.3) * (out == null ? 1 : 1 - lin(t, out, out + 0.35));
  if (o <= 0.001) return null;
  return <g opacity={o}>{children}</g>;
};

/** The shared <defs>: paper-safe hatching and the slight hand wobble on ink. */
export const InkDefs: React.FC = () => (
  <defs>
    <pattern id="c-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
      <line x1="0" y1="0" x2="0" y2="9" stroke={P.ink} strokeWidth="1.4" opacity="0.55" />
    </pattern>
    <pattern id="c-dots" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2" fill="#fff" opacity="0.5" />
      <circle cx="11" cy="11" r="2" fill="#fff" opacity="0.5" />
    </pattern>
    <pattern id="c-stripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <rect width="8" height="16" fill="#fff" opacity="0.28" />
    </pattern>
    {/* WHY the bleed: spilt ink feathers into paper fibres; a clean vector edge looks like a sticker */}
    <filter id="c-bleed" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="4" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    {/* WHY the wobble: perfectly geometric strokes read as vector clip-art; a 1.5px drift reads as a pen. */}
    <filter id="c-rough" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
);

// ---------- the handful: tall, pompous, faceless ----------
// 'stretch': the right arm is left off, for a scene that draws its own long reaching arm from the shoulder
export type HatPose = 'sides' | 'bar' | 'key' | 'rub' | 'reach' | 'hold' | 'grab' | 'pat' | 'shove' | 'stretch' | 'bare';
// 'bare': no arms at all, for a scene that draws both arms itself (round six: the magnifying glass and the phone)
type HatProps = {
  x: number; y: number; s?: number; a: number; b?: number;
  crown?: number;          // hat height (they grow with their hubris)
  drop?: number;           // 0..1, hat slid down over the head (blinded)
  pose?: HatPose; flip?: boolean; lean?: number; bob?: number;
  fade?: number;           // 0..1: drained to a pale pencil ghost (the past)
  ea?: number;
  band?: string;
  // WHY eyes only where the story needs them (chapter v): the hats slide down over them ("blinded"), and
  // they turn into coins when the men dream of treasure. Everywhere else the handful stay faceless.
  eyes?: 'none' | 'dots' | 'coins' | 'smug';
  // WHY look: a head turn on a faceless round head reads only through where the eyes sit (-1 left .. 1 right)
  look?: number;
  fist?: number;           // 0..1: open hands closing on nothing (the tool escapes them)
  pocket?: boolean;        // a waistcoat pocket, for the coin
  enter?: Enter;
  hatSx?: number;          // the hat's width (squash and stretch as it grows)
  // WHY these three (round six): the plan's three hats must read as three different men at a glance (tall and
  // thin, wide, short and sharp), never stand like cut-outs, and one of them takes his hat off to use it as a bucket.
  girth?: number;          // body width (1 = the old figure)
  sway?: number;           // degrees the coat-tails swing about the shoulders
  noHat?: boolean;         // bare-headed: his hat is drawn elsewhere (in his hand)
  // WHY these two (round seven): with blank heads and fixed arm poses the hats read as cut-outs. A small smug
  // mouth under the dot eyes gives them a face (still graphic: no monocle or moustache), and `armTo` lets a scene
  // put either hand exactly where the story needs it (flicking a tag, dusting off gloves), drawn with an elbow.
  mouth?: 'smug' | 'flat';
  armTo?: { l?: [number, number]; r?: [number, number] };   // hand targets in the figure's own units
};
export const HatFigure: React.FC<HatProps> = (props) => {
  const { enter = 'draw', a, b, x, y, s = 1, crown = 78 } = props;
  if (enter !== 'draw') {
    return <Entrance enter={enter} a={a} dur={enter === 'pop' ? 0.36 : (b ?? a + 0.5) - a} x={x} y={y} h={(212 + crown + 10) * s}><HatFigureInk {...props} a={-10} b={-9} /></Entrance>;
  }
  return <HatFigureInk {...props} />;
};
const HatFigureInk: React.FC<HatProps> = ({ x, y, s = 1, a, b, crown = 78, drop = 0, pose = 'sides', flip, lean = 0, bob = 0, fade = 0, ea, band, eyes = 'none', look = 0, fist = 0, pocket = false, hatSx = 1, girth = 1, sway = 0, noHat = false, mouth, armTo }) => {
  const e = b ?? a + 1;
  const k = (i: number) => a + (e - a) * i;  // stagger inside the drawing window
  // WHY a solid pale ink, not transparency (review 2026-11-20): drawn see-through, the faded handful let the
  // watercolour behind show through their bodies like a double exposure. Now "fade" mixes the ink toward
  // the paper, so a faded man is a solid, light pencil-grey figure.
  const ink = fade > 0 ? mixHex(P.ink, P.paper, fade * 0.66) : P.ink;
  const inner = fade > 0 ? mixHex(P.inkSoft, P.paper, fade * 0.66) : P.inkSoft;
  // WHY pear-shaped with a watch chain and a lifted chin: faceless, they still have to read as pompous at a glance
  const body = 'M -18 -178 C -30 -160 -47 -126 -45 -94 C -43 -66 -37 -50 -35 -38 L 35 -38 C 37 -50 43 -66 45 -94 C 47 -126 30 -160 18 -178 Q 0 -186 -18 -178 Z';
  const arms: Record<HatPose, string[]> = {
    sides: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 40 -140 46 -114 42 -92'],
    bar: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 42 -160 54 -150 60 -136'],
    key: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 42 -150 58 -132 72 -120'],
    rub: ['M -20 -168 C -40 -146 -30 -122 -6 -118', 'M 20 -168 C 40 -146 30 -122 6 -118'],
    reach: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 50 -176 78 -186 104 -196'],
    hold: ['M -20 -168 C -46 -152 -50 -126 -34 -114', 'M 20 -168 C 46 -152 50 -126 34 -114'],
    grab: ['M -20 -168 C -10 -200 20 -232 52 -250', 'M 20 -168 C 44 -190 70 -214 96 -224'],
    pat: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 44 -150 44 -122 24 -110'],
    shove: ['M -20 -168 C -40 -140 -46 -114 -42 -92', 'M 20 -168 C 46 -140 66 -100 84 -60'],
    stretch: ['M -20 -168 C -40 -140 -46 -114 -42 -92'],
    bare: [],
  };
  const hands: Record<HatPose, [number, number][]> = {
    sides: [[-42, -90], [42, -90]], bar: [[-42, -90], [61, -134]], key: [[-42, -90], [73, -119]],
    rub: [[-4, -117], [4, -117]], reach: [[-42, -90], [106, -197]], hold: [[-33, -112], [33, -112]],
    grab: [[54, -252], [98, -226]], pat: [[-42, -90], [22, -108]], shove: [[-42, -90], [86, -58]], stretch: [[-42, -90]], bare: [],
  };
  // an arm sent to a target: from the shoulder, bowing outward through an elbow
  const armPath = (side: -1 | 1, [hx, hy]: [number, number]) => {
    const sx = side * 20, sy = -168;
    const mx = (sx + hx) / 2 + side * 16, my = (sy + hy) / 2 + 10;
    return `M ${sx} ${sy} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
  };
  if (armTo) {
    const ap = [...arms[pose]], hp = [...hands[pose]];
    if (armTo.l) { ap[0] = armPath(-1, armTo.l); hp[0] = armTo.l; }
    if (armTo.r) { ap[1] = armPath(1, armTo.r); hp[1] = armTo.r; }
    arms[pose] = ap.filter(Boolean); hands[pose] = hp.filter(Boolean);
  }
  const hatY = -212 + drop * 34;      // slides down over the faceless head
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${(flip ? -1 : 1) * s} ${s}) rotate(${lean})`}>
      <ellipse cx={0} cy={1} rx={44 * girth} ry={6} fill={P.ink} opacity={0.1 * (1 - fade * 0.6)} />
      {/* legs and pointed shoes */}
      <Ink d="M -12 -2 L -10 -40 M 12 -2 L 10 -40" a={k(0)} b={k(0.25)} w={5} c={ink} ea={ea} />
      <Ink d="M -9 -2 L -28 -1 M 9 -2 L 28 -1" a={k(0.15)} b={k(0.3)} w={6} c={ink} ea={ea} />
      {/* the long coat, a starched shirt front, a bow tie and a watch chain across the belly */}
      {/* WHY skewed about the shoulders: the coat-tails swing while the collar stays put, which reads as cloth */}
      <g transform={`translate(0 -178) skewX(${sway}) scale(${girth} 1) translate(0 178)`}><Shape d={body} a={k(0.1)} b={k(0.55)} fill={ink} c={ink} w={3} ea={ea} /></g>
      <Appear a={k(0.55)} out={ea}>
        <path d="M -9 -179 L 0 -136 L 9 -179 Z" fill={P.paper} />
        <path d="M -9 -178 L 0 -174 L 9 -178 L 9 -170 L 0 -174 L -9 -170 Z" fill={ink} stroke={P.paper} strokeWidth={1} />
        {/* WHY no watch chain: with it they read as the board-game mascot; without, as any suited institution */}
        {pocket && <path d="M 12 -112 L 32 -114" stroke={P.paperShade} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        <path d="M 0 -38 L 0 -66" stroke={P.paper} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />
        {[-124, -108].map((cy) => <circle key={cy} cx={-4} cy={cy} r={2} fill={P.paper} opacity={0.8} />)}
      </Appear>
      {/* arms */}
      {arms[pose].map((d, i) => <Ink key={i} d={d} a={k(0.45)} b={k(0.75)} w={8} c={ink} ea={ea} />)}
      <Appear a={k(0.7)} out={ea}>{hands[pose].map(([hx, hy], i) => (
        // an open hand is a glove; a hand closing on nothing shrinks to a small filled fist
        // WHY a bigger glove with a thumb (round eight review: the small white rings on the black coats read as buttons)
        <g key={i}>
          <circle cx={hx} cy={hy} r={7.5 + (1 - fist) * 1 - fist * 3} fill={fist > 0.5 ? ink : P.paper} stroke={ink} strokeWidth={2.4} />
          {fist <= 0.5 && <circle cx={hx + (i === 0 ? -6 : 6)} cy={hy - 5} r={3.4} fill={P.paper} stroke={ink} strokeWidth={2} />}
        </g>
      ))}</Appear>
      {/* neck + faceless head */}
      <g transform="rotate(-10 0 -197)"><Shape d="M -13 -197 a 13 15 0 1 0 26 0 a 13 15 0 1 0 -26 0" a={k(0.5)} b={k(0.7)} fill={P.paper} c={ink} w={2.6} ea={ea} /></g>
      {/* WHY heavy-lidded with a one-sided smirk when smug (round eight review: the dot eyes and curved mouth read as a
          friendly smiley, so the takers looked cheerful): half-shut eyes under a lid line and a mouth that lifts at one
          corner read as pleased with himself */}
      {eyes === 'dots' && mouth !== 'smug' && <Appear a={k(0.7)} out={ea}><circle cx={-4 + look * 5} cy={-199} r={2.4} fill={ink} /><circle cx={6 + look * 5} cy={-200} r={2.4} fill={ink} /></Appear>}
      {eyes === 'dots' && mouth === 'smug' && <Appear a={k(0.7)} out={ea}>{[[-4, -199], [6, -200]].map(([ex, ey], i) => (
        <g key={i}>
          <path d={`M ${ex - 2.8 + look * 5} ${ey - 0.6} A 2.8 2.8 0 0 0 ${ex + 2.8 + look * 5} ${ey - 0.6} Z`} fill={ink} />
          <path d={`M ${ex - 3.6 + look * 5} ${ey - 1.2} L ${ex + 3.4 + look * 5} ${ey - 1.8}`} stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      ))}</Appear>}
      {mouth && <Appear a={k(0.7)} out={ea}><path d={mouth === 'smug' ? `M ${-3 + look * 5} -190.4 L ${3 + look * 5} -190.6 Q ${7 + look * 5} -190.8 ${9 + look * 5} -194.5` : `M ${-2 + look * 5} -190 L ${7 + look * 5} -190.5`}
        stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" /></Appear>}
      {/* smug: eyes shut into two pleased downward arcs (chapter v, "blinded by their own hubris") */}
      {eyes === 'smug' && <Appear a={k(0.7)} out={ea}><path d={`M ${-8 + look * 5} -199 Q ${-4 + look * 5} -195 ${0 + look * 5} -199 M ${3 + look * 5} -200 Q ${7 + look * 5} -196 ${11 + look * 5} -200`} stroke={ink} strokeWidth={2.2} fill="none" strokeLinecap="round" /></Appear>}
      {eyes === 'coins' && [[-5, -199], [7, -200]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r={6.4} fill={P.sun} stroke={ink} strokeWidth={1.6} /><circle cx={cx} cy={cy} r={3} fill="none" stroke={ink} strokeWidth={1} opacity={0.6} /></g>
      ))}
      {/* the tall hat */}
      {!noHat && <g transform={`translate(0 ${hatY}) scale(${hatSx} 1)`}>
        <Shape d={`M -16 0 L -18.5 ${-crown} Q 0 ${-crown - 4} 18.5 ${-crown} L 16 0 Z`} a={k(0.6)} b={k(0.9)} fill={ink} c={ink} w={3} ea={ea} />
        <Wash d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" a={k(0.85)} fill={band ?? inner} ea={ea} />
        <Ink d="M -27 1 Q 0 -5 27 1" a={k(0.75)} b={k(0.95)} w={6} c={ink} ea={ea} />
      </g>}
    </g>
  );
};

// ---------- ordinary people: small, round, kind ----------
export type Hair = 'tuft' | 'bun' | 'cap' | 'curly' | 'long' | 'bald' | 'bob';
export type PersonPose = 'down' | 'hold' | 'up' | 'bothUp' | 'write' | 'wave' | 'quill';
type PersonProps = {
  x: number; y: number; s?: number; a: number; b?: number; body?: string; hair?: Hair; pose?: PersonPose;
  mood?: 'smile' | 'flat' | 'o'; flip?: boolean; bob?: number; tilt?: number; ea?: number; device?: 'phone' | 'none';
  hairColor?: string;
  enter?: Enter;
  /** Seated: thighs forward, shins down past the seat (y is the seat height). WHY: Theo's armchair and June's stool. */
  sit?: boolean;
  /** 0..1: blends the pose's arms toward both arms up. WHY (round seven): a yank on the strings used to switch
   *  between two poses on a threshold, a one-frame pop; a continuous blend lets the arms jerk up and fall back. */
  raise?: number;
};
/** Blend two SVG paths made of the same commands (only their numbers differ). */
const lerpPath = (a: string, b: string, k: number) => {
  if (k <= 0) return a;
  const na = a.match(/-?\d*\.?\d+/g) ?? [], nb = b.match(/-?\d*\.?\d+/g) ?? [];
  if (na.length !== nb.length) return k < 0.5 ? a : b;
  let i = 0;
  return a.replace(/-?\d*\.?\d+/g, () => { const v = +na[i] + (+nb[i] - +na[i]) * k; i++; return v.toFixed(1); });
};
export const Person: React.FC<PersonProps> = (props) => {
  const { enter = 'draw', a, b, x, y, s = 1, bob = 0 } = props;
  if (enter !== 'draw') {
    return <Entrance enter={enter} a={a} dur={enter === 'pop' ? 0.36 : (b ?? a + 0.5) - a} x={x} y={y + bob} h={110 * s}><PersonInk {...props} a={-10} b={-9} /></Entrance>;
  }
  return <PersonInk {...props} />;
};
const PersonInk: React.FC<PersonProps> = ({ x, y, s = 1, a, b, body = P.wash, hair = 'tuft', pose = 'down', mood = 'smile', flip, bob = 0, tilt = 0, ea, device = 'none', hairColor, sit = false, raise = 0 }) => {
  const e = b ?? a + 0.7;
  const k = (i: number) => a + (e - a) * i;
  const hc = hairColor ?? P.ink;
  const arms: Record<PersonPose, string> = {
    down: 'M -15 -56 Q -24 -44 -22 -32 M 15 -56 Q 24 -44 22 -32',
    hold: 'M -15 -56 Q -20 -44 -9 -42 M 15 -56 Q 20 -44 9 -42',
    up: 'M -15 -56 Q -24 -44 -22 -32 M 15 -58 Q 26 -78 24 -96',
    bothUp: 'M -15 -58 Q -26 -78 -24 -96 M 15 -58 Q 26 -78 24 -96',
    write: 'M -15 -56 Q -24 -44 -22 -32 M 15 -56 Q 28 -50 34 -40',
    wave: 'M -15 -56 Q -24 -44 -22 -32 M 15 -58 Q 30 -70 34 -88',
    quill: 'M -15 -56 Q -24 -44 -22 -32 M 15 -58 Q 28 -66 32 -78',
  };
  const hairD: Record<Hair, string | null> = {
    tuft: 'M -5 -100 Q -1 -110 3 -101 M 2 -101 Q 7 -108 9 -99',
    bun: null, cap: 'M -17 -88 Q -16 -104 0 -104 Q 16 -104 17 -88 Z', curly: null,
    long: 'M -17 -84 Q -18 -104 0 -104 Q 18 -104 17 -84 L 20 -64 L 12 -66 L 13 -84 M -13 -84 L -12 -66 L -20 -64 L -17 -84',
    bald: null, bob: 'M -18 -78 Q -20 -104 0 -104 Q 20 -104 18 -78 L 12 -78 Q 12 -94 0 -94 Q -12 -94 -12 -78 Z',
  };
  return (
    <g transform={`translate(${x} ${y + bob}) rotate(${tilt}) scale(${(flip ? -1 : 1) * s} ${s})`}>
      {!sit && <Appear a={k(0.2)} out={ea}><ellipse cx={0} cy={1 - bob / s} rx={20} ry={3.5} fill={P.ink} opacity={0.12} /></Appear>}
      <Ink d={sit ? 'M -8 -22 L 12 -20 L 13 6 M 6 -22 L 22 -20 L 23 6' : 'M -7 -1 L -6 -24 M 7 -1 L 6 -24'} a={k(0)} b={k(0.3)} w={4} ea={ea} />
      <Shape d="M -18 -22 C -21 -50 -15 -68 0 -69 C 15 -68 21 -50 18 -22 Q 0 -18 -18 -22 Z" a={k(0.15)} b={k(0.55)} fill={body} w={3} ea={ea} />
      <Ink d={lerpPath(arms[pose], arms.bothUp, Math.min(1, Math.max(0, raise)))} a={k(0.4)} b={k(0.7)} w={3.6} ea={ea} />
      {device === 'phone' && <Shape d="M -11 -50 h 22 v 15 h -22 Z" a={k(0.6)} b={k(0.8)} fill={P.paper} w={2.4} ea={ea} />}
      <Shape d="M -17 -85 a 17 17 0 1 0 34 0 a 17 17 0 1 0 -34 0" a={k(0.35)} b={k(0.7)} fill={P.paper} w={3} ea={ea} />
      {hair === 'bun' && <Shape d="M -7 -104 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0" a={k(0.6)} b={k(0.8)} fill={hc} w={2} ea={ea} />}
      {hair === 'curly' && <Ink d="M -16 -92 q 3 -9 9 -8 q 2 -8 9 -5 q 6 -6 10 1 q 7 1 5 9" a={k(0.6)} b={k(0.85)} w={4} c={hc} ea={ea} />}
      {hairD[hair] && (hair === 'tuft' ? <Ink d={hairD[hair]!} a={k(0.6)} b={k(0.85)} w={2.6} c={hc} ea={ea} />
        : <Shape d={hairD[hair]!} a={k(0.6)} b={k(0.85)} fill={hc} w={2} c={hc} ea={ea} />)}
      <Appear a={k(0.75)} out={ea}>
        <circle cx={-6} cy={-86} r={2.3} fill={P.ink} /><circle cx={6} cy={-86} r={2.3} fill={P.ink} />
        {mood === 'smile' && <path d="M -5 -78 Q 0 -74 5 -78" stroke={P.ink} strokeWidth={2} fill="none" strokeLinecap="round" />}
        {mood === 'flat' && <path d="M -4 -77 L 4 -77" stroke={P.ink} strokeWidth={2} strokeLinecap="round" />}
        {mood === 'o' && <circle cx={0} cy={-76} r={2.6} fill="none" stroke={P.ink} strokeWidth={1.8} />}
      </Appear>
    </g>
  );
};

// ---------- props ----------
export const Laptop: React.FC<{ x: number; y: number; s?: number; a: number; b?: number; screen?: string; ea?: number }> = ({ x, y, s = 1, a, b, screen = P.paper, ea }) => {
  const e = b ?? a + 0.5;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M -34 -46 h 68 v 44 h -68 Z" a={a} b={a + (e - a) * 0.6} fill={screen} w={3} ea={ea} />
      <Shape d="M -44 -2 h 88 l -6 8 h -76 Z" a={a + (e - a) * 0.4} b={e} fill={P.wash} w={3} ea={ea} />
    </g>
  );
};
export const Padlock: React.FC<{ x: number; y: number; s?: number; at: number; openAt?: number; fallAt?: number; color?: string }> = ({ x, y, s = 1, at, openAt, fallAt, color = P.ink }) => {
  const t = useT();
  const p = pop(t, at, 0.5);
  if (p <= 0) return null;
  const open = openAt == null ? 0 : lin(t, openAt, openAt + 0.18);
  const fall = fallAt == null ? 0 : lin(t, fallAt, fallAt + 0.45, (v) => v * v);
  const drop = (1 - Math.min(1, p)) * -60 + fall * 220;
  return (
    <g transform={`translate(${x} ${y + drop}) rotate(${fall * 50}) scale(${s})`} opacity={1 - lin(t, (fallAt ?? 1e9) + 0.35, (fallAt ?? 1e9) + 0.6)}>
      <path d={`M -11 -14 L -11 ${-26 - open * 10} a 11 11 0 0 1 22 0 L 11 ${-14 - open * 10}`} transform={`translate(${open * 12} ${-open * 4})`} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      {/* WHY outlined with a soft plum fill (round eight review): the solid black block was a different drawing style
          from the outlined laptop it locks; now it is drawn by the same pen */}
      <rect x={-17} y={-16} width={34} height={28} rx={5} fill={color === P.ink ? '#B9A3C4' : color} stroke={P.ink} strokeWidth={3} />
      <path d="M -12 -9 L 12 -9" stroke={P.paper} strokeWidth={2} opacity={0.6} strokeLinecap="round" />
      <circle cx={0} cy={-1} r={3.6} fill={P.ink} /><path d="M 0 0 L 0 6" stroke={P.ink} strokeWidth={2.8} strokeLinecap="round" />
    </g>
  );
};
/** A price tag on a string; `prices` are re-inked one after another, each striking out the one before. */
// WHY `two` (round seven): three stacked prices (two struck through) were clutter at phone size. With `two`, the tag
// keeps only the new price under the one it replaced; the oldest fades and the rows slide up as each new one inks in.
export const PriceTag: React.FC<{ x: number; y: number; s?: number; at: number; prices: { v: string; at: number }[]; strikeAll?: number; final?: { v: string; at: number; color: string }; swing?: number; two?: boolean }> = ({ x, y, s = 1, at, prices, strikeAll, final, swing = 0, two }) => {
  const t = useT();
  const p = pop(t, at, 0.55);
  if (p <= 0) return null;
  const sway = Math.sin((t - at) * 3.2) * 4 * Math.exp(-(t - at) * 0.7) + swing;
  const h = 70 + (two ? Math.min(2, prices.length) : prices.length) * 30;
  const [clipId] = React.useState(() => `c-tag-${++clipSeq}`);
  const vis = prices.filter((q) => t >= q.at);
  // WHY the rows slide up BEFORE the new price starts (round eight review: for a moment three rows showed at once):
  // the oldest row is gone, and the struck one has moved up, on the frame the pen starts writing the new one
  const slide = two ? prices.reduce((s, q, k) => s + (k >= 2 ? lin(t, q.at - 0.2, q.at, EASE_IN_OUT) : 0), 0) : 0;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${sway})`} opacity={Math.min(1, p)}>
      <path d="M 0 -30 L 0 0" stroke={P.ink} strokeWidth={2} />
      <path d={`M -48 0 L 48 0 L 48 ${h} L -48 ${h} Z`} fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={0} cy={14} r={5} fill="none" stroke={P.ink} strokeWidth={2.4} />
      {vis.map((q, i) => {
        const struck = i < vis.length - 1 || (strikeAll != null && t >= strikeAll);
        const sp = i < vis.length - 1 ? lin(t, vis[i + 1].at, vis[i + 1].at + 0.2) : strikeAll != null ? lin(t, strikeAll, strikeAll + 0.25) : 0;
        const cy = 50 + (i - slide) * 30;
        const ink = two ? Math.max(0, Math.min(1, 1 - (slide - i))) : 1;
        // WHY written on left to right (round eight review: each new price faded in as pale grey ghost text): the pen
        // writes it, which is what "re-inked" means
        const write = lin(t, q.at, q.at + 0.28, EASE_IN_OUT);
        if (ink <= 0 || write <= 0) return null;
        return (
          <g key={i} opacity={ink}>
            {write < 1 && <defs><clipPath id={`${clipId}-${i}`}><rect x={-46} y={cy - 26} width={92 * write} height={34} /></clipPath></defs>}
            <g clipPath={write < 1 ? `url(#${clipId}-${i})` : undefined}>
            <text x={0} y={cy} textAnchor="middle" fontFamily={DMSANS} fontWeight={700} fontSize={20} fill={struck ? P.inkSoft : P.ink} letterSpacing="-0.02em">{q.v}</text>
            {struck && <path d={`M -38 ${cy - 7} L ${-38 + 76 * sp} ${cy - 7}`} stroke={P.ink} strokeWidth={3} strokeLinecap="round" />}
            </g>
          </g>
        );
      })}
      {final && t >= final.at && (
        <text x={0} y={h + 52} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={40} fill={final.color} letterSpacing="-0.04em"
          opacity={lin(t, final.at, final.at + 0.25)} transform={`rotate(-6 0 ${h + 40})`}>{final.v}</text>
      )}
    </g>
  );
};

/** One of the person's things: a small framed photo, a letter, a map pin, a heart, a calendar page. */
export type Keepsake = 'photo' | 'letter' | 'pin' | 'heart' | 'calendar';
export const KeepsakeIcon: React.FC<{ kind: Keepsake; x: number; y: number; s?: number; r?: number; color?: string }> = ({ kind, x, y, s = 1, r = 0, color = P.paper }) => {
  const st = { stroke: P.ink, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {kind === 'photo' && <><rect x={-18} y={-14} width={36} height={28} rx={2} fill={color} {...st} /><path d="M -14 9 L -4 -2 L 3 5 L 8 0 L 14 9" fill="none" {...st} /><circle cx={8} cy={-6} r={3} fill={P.ink} /></>}
      {kind === 'letter' && <><rect x={-19} y={-12} width={38} height={25} rx={2} fill={color} {...st} /><path d="M -19 -12 L 0 3 L 19 -12" fill="none" {...st} /></>}
      {kind === 'pin' && <><path d="M 0 16 C -14 0 -14 -16 0 -16 C 14 -16 14 0 0 16 Z" fill={color} {...st} /><circle cx={0} cy={-5} r={4.5} fill="none" {...st} /></>}
      {kind === 'heart' && <path d="M 0 13 C -22 -2 -14 -18 0 -8 C 14 -18 22 -2 0 13 Z" fill={color} {...st} />}
      {kind === 'calendar' && <><rect x={-16} y={-15} width={32} height={30} rx={3} fill={color} {...st} /><path d="M -16 -6 L 16 -6 M -8 -19 L -8 -11 M 8 -19 L 8 -11" fill="none" {...st} /><path d="M -8 3 h 4 M 3 3 h 4 M -8 10 h 4" {...st} /></>}
    </g>
  );
};

/** The quill: the tool anyone can pick up. Purple from the moment it exists. */
export const Quill: React.FC<{ x: number; y: number; s?: number; r?: number; color?: string; o?: number }> = ({ x, y, s = 1, r = 0, color = P.purple, o = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={o}>
    {/* nib at the origin, feather rising up and to the right */}
    <path d="M 0 0 L 6 -16 L 12 -14 Z" fill={P.ink} />
    <path d="M 8 -15 C 18 -60 52 -118 96 -150 C 92 -118 70 -64 14 -12 Z" fill={color} stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M 10 -14 C 34 -56 62 -104 92 -146" stroke={P.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
    {/* the barbs: a few notches so it reads as a feather, not a leaf */}
    <path d="M 40 -62 L 52 -58 M 54 -86 L 66 -84 M 66 -106 L 78 -106 M 30 -58 L 22 -46 M 46 -84 L 36 -74" stroke={P.ink} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
  </g>
);

/** A cloud of thought, inked as one wobbly outline with two small trailing puffs. */
export const bubblePath = (cx: number, cy: number, rx: number, ry: number, lobes = 9) => {
  let d = '';
  for (let i = 0; i <= lobes; i++) {
    const th = (i / lobes) * Math.PI * 2;
    const px = cx + Math.cos(th) * rx, py = cy + Math.sin(th) * ry;
    if (i === 0) { d += `M ${px.toFixed(1)} ${py.toFixed(1)}`; continue; }
    const mid = th - Math.PI / lobes;
    const bx = cx + Math.cos(mid) * rx * 1.28, by = cy + Math.sin(mid) * ry * 1.28;
    d += ` Q ${bx.toFixed(1)} ${by.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  return d + ' Z';
};

export const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
/** A blob for spilt/blooming ink: a circle whose radius wanders, so it never looks like a perfect dot. */
export const blob = (cx: number, cy: number, r: number, seed: number, wob = 0.18, n = 14) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const rr = r * (1 + wob * Math.sin(seed * 1.7 + i * 2.3) + wob * 0.5 * Math.sin(seed * 0.9 + i * 4.1));
    pts.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
  }
  // closed Catmull-Rom through the points, as cubic Béziers
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
};

/** A watercolour wash behind a vignette: two overlapping translucent layers and a faint pigment edge.
 *  WHY: picture books sit their drawings on soft patches of colour; without them the ink floats on empty paper. */
export const WashBg: React.FC<{ x: number; y: number; r: number; a: number; color?: string; seed?: number; sx?: number; o?: number; ea?: number }> = ({ x, y, r, a, color = P.mist, seed = 1, sx = 1, o = 1, ea }) => {
  const t = useT();
  const p = lin(t, a, a + 0.7) * (ea == null ? 1 : 1 - lin(t, ea, ea + 0.5));
  if (p <= 0.001) return null;
  const rr = r * (0.82 + 0.18 * p);
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} 1)`} opacity={p * o}>
      <path d={blob(0, 0, rr, seed, 0.12, 16)} fill={color} opacity={0.75} />
      <path d={blob(rr * 0.12, -rr * 0.08, rr * 0.82, seed + 4, 0.16, 14)} fill={color} opacity={0.6} />
      <path d={blob(0, 0, rr, seed, 0.12, 16)} fill="none" stroke={color} strokeWidth={4} opacity={0.9} style={{ filter: 'brightness(0.94)' }} />
    </g>
  );
};

// =====================================================================================================
// THE STORY'S CAST (round six). One definition, used by both halves of the film.
// WHY one place: the owner's note on the last round was "disconnected elements". The picture plan fixes a tiny
// cast (three hats, one tower, three heroes and their three things, one inkwell, one quill) whose fate is followed
// from the first line to the last. If both halves draw them from here, Maya's laptop in line 2 is literally the
// same drawing as Maya's laptop in line 7.
// =====================================================================================================

/** The three hats: the same three in every chapter. WHY three outlines: tall and thin, wide, short and sharp, so a
 *  stranger can tell them apart from the silhouette alone. Each always pairs with the same hero. */
export const HATS = {
  tall: { crown: 122, girth: 0.84, s: 1.0 },    // Maya's: the padlock
  wide: { crown: 70, girth: 1.34, s: 0.95 },    // Theo's: the price tags and the lifting
  short: { crown: 54, girth: 1.0, s: 0.82 },    // June's: the keepsakes and the magnifying glass
} as const;
export type HatName = keyof typeof HATS;

/** The three heroes. Pale wash until they ask; then each keeps their own colour. */
export const HEROES = {
  maya: { hair: 'bun' as Hair, colour: '#8FC29E' },   // green: her plant app
  theo: { hair: 'curly' as Hair, colour: '#EDC25E' }, // gold: his records app
  june: { hair: 'long' as Hair, colour: '#CFB2E8' },  // lilac: her keepsake app
};
export type HeroName = keyof typeof HEROES;
/** A hero: a Person with their own hair, and `bloom` 0..1 from the pale wash to their colour. */
export const Hero: React.FC<Omit<PersonProps, 'hair' | 'body'> & { who: HeroName; bloom?: number }> = ({ who, bloom = 0, ...p }) => (
  <Person {...p} hair={HEROES[who].hair} body={bloom > 0 ? mixHex(P.wash, HEROES[who].colour, Math.min(1, bloom)) : P.wash} />
);

/** A top hat on its own (in a hand, used as a bucket). (x, y) is the middle of the brim; r turns it about there. */
export const TopHat: React.FC<{ x: number; y: number; s?: number; crown?: number; r?: number; c?: string }> = ({ x, y, s = 1, crown = 54, r = 0, c = P.ink }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path d={`M -16 0 L -18.5 ${-crown} Q 0 ${-crown - 4} 18.5 ${-crown} L 16 0 Z`} fill={c} stroke={c} strokeWidth={3} strokeLinejoin="round" />
    <path d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" fill={P.inkSoft} />
    {/* the open mouth of the hat, seen as it tips toward the camera */}
    <ellipse cx={0} cy={0} rx={24} ry={7} fill={P.inkSoft} stroke={c} strokeWidth={4} />
  </g>
);

/** The tower the hats stand on: a heavy stack of the SAME app windows the heroes later get (same rounded corners,
 *  same three title-bar dots), seen edge-on. (x, y) is the middle of its top. */
export const TOWER_SLAB = 46;
const SLAB_DX = [0, 14, -10, 16, -6, 10, -14, 6, -8];
export const Tower: React.FC<{ x: number; y: number; w?: number; n?: number; s?: number; c?: string; fill?: string; wobble?: number }> = ({ x, y, w = 330, n = 6, s = 1, c = P.ink, fill = P.paper, wobble = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {/* WHY a long soft cast shadow as well as the contact one (round seven): the light comes from the upper left,
        so a heavy tower throws its shadow down and to the right across the page; without it the tower read as a
        flat outline pasted on the paper */}
    <path d={`M ${-w * 0.42} ${n * TOWER_SLAB} L ${w * 0.52} ${n * TOWER_SLAB} L ${w * 1.02} ${n * TOWER_SLAB + 26} L ${-w * 0.02} ${n * TOWER_SLAB + 30} Z`} fill={P.ink} opacity={0.07} />
    <ellipse cx={0} cy={n * TOWER_SLAB + 4} rx={w * 0.58} ry={9} fill={P.ink} opacity={0.14} />
    {Array.from({ length: n }).map((_, i) => {
      // drawn bottom first so each slab sits on the one below; the wobble grows toward the top
      const j = n - 1 - i;
      const dx = SLAB_DX[j % SLAB_DX.length] + wobble * (n - j) * 3;
      const top = j * TOWER_SLAB;
      const L = -w / 2 + dx;
      const H = TOWER_SLAB;
      const slab = `M ${L + 14} ${top} L ${L + w - 14} ${top} Q ${L + w} ${top} ${L + w} ${top + 14} L ${L + w} ${top + H - 6} Q ${L + w} ${top + H} ${L + w - 8} ${top + H} L ${L + 8} ${top + H} Q ${L} ${top + H} ${L} ${top + H - 6} L ${L} ${top + 14} Q ${L} ${top} ${L + 14} ${top} Z`;
      return (
        <g key={j}>
          <path d={slab} fill={fill} stroke={c} strokeWidth={3} strokeLinejoin="round" />
          {/* WHY a dark lip along each window's foot (round seven): it is the window's thickness, so the stack reads
              as heavy objects piled up, not ruled lines; and the slab above casts a thin shadow onto this one */}
          <path d={`M ${L + 3} ${top + H - 9} L ${L + w - 3} ${top + H - 9} L ${L + w - 3} ${top + H - 5} Q ${L + w - 3} ${top + H - 1.5} ${L + w - 9} ${top + H - 1.5} L ${L + 9} ${top + H - 1.5} Q ${L + 3} ${top + H - 1.5} ${L + 3} ${top + H - 5} Z`} fill={c} opacity={0.82} />
          {j > 0 && <path d={`M ${L + 6} ${top + 1.5} L ${L + w - 6} ${top + 1.5} L ${L + w - 10} ${top + 7} L ${L + 10} ${top + 7} Z`} fill={c} opacity={0.16} />}
          {/* the title bar: its three dots and the line under it */}
          {[0, 1, 2].map((d) => <circle key={d} cx={L + 22 + d * 17} cy={top + 15} r={4.6} fill={c} />)}
          {/* a sliver of each window's content under its title bar, so it reads as a window, not a drawer */}
          <path d={`M ${L + 82} ${top + 15} L ${L + w * 0.62} ${top + 15}`} stroke={c} strokeWidth={4} strokeLinecap="round" opacity={0.22} />
          <path d={`M ${L + 3} ${top + 28} L ${L + w - 3} ${top + 28}`} stroke={c} strokeWidth={2} opacity={0.45} />
        </g>
      );
    })}
  </g>
);

/** The hats' inkwell. (x, y) is the middle of its base; its mouth is 66·s above. `fill` 0..1: how much purple ink. */
export const INKWELL_MOUTH = 66;
// WHY redrawn as glass in the book's line style (round seven): the old solid black block read as a toaster or a
// jam jar, and was the one solid-filled object in a book of cream-filled line art. Now it is a squat glass inkwell:
// pale glass with the ink line, a broad shoulder and a short open neck, the ink visible INSIDE the glass (a thin
// dark band while it is empty, rising and turning purple once the drop lands), and a tiny top-hat stamp on its
// label so that, in line 5, it is plainly the hats' own.
// WHY `tint` (round eight review: one drop filling the jar two-thirds full read as a progress bar): with tint set, the
// ink stays at its level and the purple spreads through it from where the drop went in, like a drop of dye.
export const Inkwell: React.FC<{ x: number; y: number; s?: number; fill?: number; glow?: number; rock?: number; tint?: number }> = ({ x, y, s = 1, fill = 1, glow = 0, rock = 0, tint }) => {
  const f = Math.min(1, Math.max(0, fill));
  const level = -8 - 22 * f;                      // the ink's surface inside the glass
  const inkCol = tint == null ? mixHex('#3A2448', C.purple, f) : mixHex('#3A2448', C.purple, Math.min(1, Math.max(0, tint)) ** 2);
  const spread = tint == null ? 0 : Math.min(1, Math.max(0, tint));
  const body = 'M -40 -2 Q -44 -2 -44 -8 L -44 -30 Q -44 -48 -24 -52 L -16 -54 L -16 -60 L 16 -60 L 16 -54 L 24 -52 Q 44 -48 44 -30 L 44 -8 Q 44 -2 40 -2 Z';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rock}) scale(${s})`}>
      <ellipse cx={0} cy={1} rx={52} ry={6.5} fill={P.ink} opacity={0.16} />
      <defs><clipPath id={`c-well-${Math.round(x)}-${Math.round(y)}`}><path d={body} /></clipPath></defs>
      <path d={body} fill="#EFE6EC" />
      {/* the ink inside: a band at the bottom of the glass, its surface a flat ellipse */}
      <g clipPath={`url(#c-well-${Math.round(x)}-${Math.round(y)})`}>
        <rect x={-50} y={level} width={100} height={60} fill={inkCol} />
        {spread > 0 && spread < 1 && <ellipse cx={0} cy={level + 2} rx={6 + 52 * spread} ry={4 + 30 * spread} fill={C.purple} opacity={0.9} />}
        <ellipse cx={0} cy={level} rx={44} ry={4.5} fill={mixHex(inkCol, '#ffffff', 0.18)} />
        {glow > 0 && <ellipse cx={0} cy={level} rx={44} ry={6} fill={P.violet} opacity={0.5 * glow} />}
      </g>
      <path d={body} fill="none" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      {/* the neck's lip, and the open mouth seen from just above */}
      <path d="M -19 -60 L 19 -60 L 19 -66 L -19 -66 Z" fill="#EFE6EC" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <ellipse cx={0} cy={-66} rx={16} ry={3.6} fill={f > 0 ? inkCol : '#3A2448'} stroke={P.ink} strokeWidth={1.6} />
      {glow > 0 && <ellipse cx={0} cy={-66} rx={16} ry={3.6} fill={P.violet} opacity={0.45 * glow} />}
      {/* the label, stamped with a tiny top hat */}
      <path d="M -20 -40 L 20 -40 L 20 -22 L -20 -22 Z" fill={P.paper} stroke={P.ink} strokeWidth={2} />
      <path d="M -5 -26 L -5.6 -35 L 5.6 -35 L 5 -26 Z M -9 -26 L 9 -26" fill={P.ink} stroke={P.ink} strokeWidth={1.6} strokeLinejoin="round" />
      {/* two thin highlights on the glass, from the lamp at the upper left */}
      <path d="M -36 -12 L -36 -30 Q -36 -40 -26 -44" stroke="#fff" strokeWidth={3.4} opacity={0.75} fill="none" strokeLinecap="round" />
      <path d="M 34 -14 L 34 -24" stroke="#fff" strokeWidth={2.4} opacity={0.5} fill="none" strokeLinecap="round" />
    </g>
  );
};

/** Theo's record player. (x, y) is the middle of its underside; `spin` turns the label (degrees). */
export const RecordPlayer: React.FC<{ x: number; y: number; s?: number; spin?: number; c?: string; dashed?: boolean }> = ({ x, y, s = 1, spin = 0, c = P.ink, dashed }) => {
  const st = dashed ? { strokeDasharray: '6 8', fill: 'none', opacity: 0.5 } : {};
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -66 0 L 66 0 L 66 -26 Q 66 -30 62 -30 L -62 -30 Q -66 -30 -66 -26 Z" fill={P.wash} stroke={c} strokeWidth={3} strokeLinejoin="round" {...st} />
      {!dashed && <>
        <ellipse cx={-8} cy={-33} rx={48} ry={10} fill={P.ink} />
        <ellipse cx={-8} cy={-34} rx={34} ry={6.5} fill="none" stroke={P.paper} strokeWidth={1.2} opacity={0.35} />
        <g transform={`translate(-8 -34) scale(1 0.21) rotate(${spin})`}><circle r={13} fill={P.wash} /><rect x={-2} y={-12} width={4} height={8} fill={P.ink} /></g>
        <path d="M 54 -34 L 54 -46 M 54 -44 L 30 -34" stroke={c} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <circle cx={54} cy={-46} r={4} fill={c} />
        <circle cx={50} cy={-14} r={4} fill={P.paper} stroke={c} strokeWidth={2} />
      </>}
    </g>
  );
};
/** The low cabinet the record player lives on. (x, y): the middle of its feet; its top is 86·s above. */
export const CABINET_TOP = 86;
export const Cabinet: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={2} rx={86} ry={6} fill={P.ink} opacity={0.12} />
    <path d="M -64 0 L -60 -14 M 64 0 L 60 -14" stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
    <path d="M -80 -14 L 80 -14 L 80 -86 L -80 -86 Z" fill={P.paperShade} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d="M 0 -18 L 0 -82 M -12 -50 L -6 -50 M 6 -50 L 12 -50" stroke={P.ink} strokeWidth={2.4} strokeLinecap="round" />
  </g>
);
/** Theo's records: a row of sleeves, each with its record peeping out. (x, y): the middle of their bottom edge. */
export const RECORD_SLEEVES = 4;
export const Records: React.FC<{ x: number; y: number; s?: number; dashed?: boolean }> = ({ x, y, s = 1, dashed }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {Array.from({ length: RECORD_SLEEVES }).map((_, i) => {
      const sx = -94 + i * 48, r = [-4, 3, -2, 6][i];
      return (
        <g key={i} transform={`rotate(${r} ${sx + 22} 0)`}>
          {!dashed && <circle cx={sx + 30} cy={-30} r={20} fill={P.ink} />}
          <rect x={sx} y={-52} width={44} height={52} rx={2} fill={dashed ? 'none' : [P.paper, P.wash, P.paperShade, P.paper][i]} stroke={P.ink} strokeWidth={dashed ? 2 : 2.6}
            strokeDasharray={dashed ? '5 7' : undefined} opacity={dashed ? 0.5 : 1} />
          {!dashed && <circle cx={sx + 22} cy={-26} r={[9, 12, 7, 10][i]} fill="none" stroke={P.inkSoft} strokeWidth={2.2} />}
        </g>
      );
    })}
  </g>
);

/** June's keepsake box. (x, y): the middle of its base. `lid` 0 shut, 1 open; `inside`: how many of her five
 *  keepsakes still peep over the rim (they leave from the right). */
export const KEEPSAKES: Keepsake[] = ['photo', 'letter', 'heart', 'photo', 'letter'];
export const KeepsakeBox: React.FC<{ x: number; y: number; s?: number; lid?: number; inside?: number; fill?: string }> = ({ x, y, s = 1, lid = 1, inside = 5, fill = P.wash }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {/* the lid, hinged at the back edge: open it stands up behind the box, tipped back */}
    <g transform={`translate(0 -58) rotate(${-lid * 18}) scale(1 ${1 - lid * 2})`}>
      <path d="M -62 0 L 62 0 L 62 -14 Q 62 -18 58 -18 L -58 -18 Q -62 -18 -62 -14 Z" fill={fill} stroke={P.ink} strokeWidth={3 / Math.max(0.3, Math.abs(1 - lid * 2))} strokeLinejoin="round" />
    </g>
    {/* the dark inside of the open box, seen just over its front rim: an empty box then reads as empty */}
    {lid > 0.4 && <path d="M -58 -58 L 58 -58 L 52 -70 L -52 -70 Z" fill={P.inkSoft} opacity={0.6 * Math.min(1, (lid - 0.4) / 0.3)} stroke={P.ink} strokeWidth={2} strokeLinejoin="round" />}
    {Array.from({ length: Math.max(0, Math.min(5, Math.round(inside))) }).map((_, i) => (
      <KeepsakeIcon key={i} kind={KEEPSAKES[i]} x={-40 + i * 20} y={-62 - (i % 2) * 8} s={0.85} r={(i - 2) * 9} />
    ))}
    <path d="M -58 -58 L 58 -58 L 54 0 L -54 0 Z" fill={fill} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    {/* WHY a heart clasp (round seven): with a plain bar the box read as a laptop, the one object it must never be
        confused with; a small heart on the front says "keepsakes" at a glance, in ii, iii and vii alike */}
    <path d="M 0 -26 C -15 -36 -10 -48 0 -41 C 10 -48 15 -36 0 -26 Z" fill={P.paper} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
    <path d="M -50 -48 L 50 -48" stroke={P.ink} strokeWidth={1.6} opacity={0.35} />
  </g>
);

/** The puppet control: a crossbar with a short cross-piece. (x, y): its middle; w: its length. */
// WHY a real marionette control (round eight review: "one flat plank held at waist height reads as a tray or a
// cane"): a main bar with a cross-piece seen in perspective, a little hook on top where it is held, and a ring at
// every end where a string ties on. A stranger sees "puppet master" in the first second.
export const Crossbar: React.FC<{ x: number; y: number; w?: number; r?: number; c?: string }> = ({ x, y, w = 110, r = 0, c = P.ink }) => {
  const cx = w * 0.18;   // where the cross-piece crosses the main bar
  const eye = (ex: number, ey: number, k: number) => <circle key={k} cx={ex} cy={ey} r={4.2} fill={P.paper} stroke={c} strokeWidth={2.4} />;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      {/* the cross-piece, foreshortened: it runs toward the camera, so it is short and slanted */}
      <path d={`M ${cx - 15} -13 L ${cx + 15} 13`} stroke={c} strokeWidth={6.5} strokeLinecap="round" />
      <path d={`M ${-w / 2} 0 L ${w / 2} 0`} stroke={c} strokeWidth={7.5} strokeLinecap="round" />
      {/* the hook it hangs from when put down */}
      <path d="M -4 -4 L -4 -14 Q -4 -21 3 -21 Q 9 -21 9 -15" stroke={c} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {[eye(-w / 2, 0, 0), eye(w / 2, 0, 1), eye(cx - 15, -13, 2), eye(cx + 15, 13, 3)]}
    </g>
  );
};
