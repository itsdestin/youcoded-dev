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

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
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
export type HatPose = 'sides' | 'bar' | 'key' | 'rub' | 'reach' | 'hold' | 'grab' | 'pat';
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
  eyes?: 'none' | 'dots' | 'coins';
  fist?: number;           // 0..1: open hands closing on nothing (the tool escapes them)
  pocket?: boolean;        // a waistcoat pocket, for the coin
};
export const HatFigure: React.FC<HatProps> = ({ x, y, s = 1, a, b, crown = 78, drop = 0, pose = 'sides', flip, lean = 0, bob = 0, fade = 0, ea, band, eyes = 'none', fist = 0, pocket = false }) => {
  const e = b ?? a + 1;
  const k = (i: number) => a + (e - a) * i;  // stagger inside the drawing window
  const ink = P.ink;
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
  };
  const hands: Record<HatPose, [number, number][]> = {
    sides: [[-42, -90], [42, -90]], bar: [[-42, -90], [61, -134]], key: [[-42, -90], [73, -119]],
    rub: [[-4, -117], [4, -117]], reach: [[-42, -90], [106, -197]], hold: [[-33, -112], [33, -112]],
    grab: [[54, -252], [98, -226]], pat: [[-42, -90], [22, -108]],
  };
  const hatY = -212 + drop * 34;      // slides down over the faceless head
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${(flip ? -1 : 1) * s} ${s}) rotate(${lean})`} opacity={1 - fade * 0.72}
      style={fade > 0 ? { filter: `saturate(${1 - fade})` } : undefined}>
      <ellipse cx={0} cy={1} rx={44} ry={6} fill={P.ink} opacity={0.1} />
      {/* legs and pointed shoes */}
      <Ink d="M -12 -2 L -10 -40 M 12 -2 L 10 -40" a={k(0)} b={k(0.25)} w={5} ea={ea} />
      <Ink d="M -9 -2 L -28 -1 M 9 -2 L 28 -1" a={k(0.15)} b={k(0.3)} w={6} ea={ea} />
      {/* the long coat, a starched shirt front, a bow tie and a watch chain across the belly */}
      <Shape d={body} a={k(0.1)} b={k(0.55)} fill={ink} w={3} ea={ea} />
      <Appear a={k(0.55)} out={ea}>
        <path d="M -9 -179 L 0 -136 L 9 -179 Z" fill={P.paper} />
        <path d="M -9 -178 L 0 -174 L 9 -178 L 9 -170 L 0 -174 L -9 -170 Z" fill={ink} stroke={P.paper} strokeWidth={1} />
        {/* WHY no watch chain: with it they read as the board-game mascot; without, as any suited institution */}
        {pocket && <path d="M 12 -112 L 32 -114" stroke={P.paperShade} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        <path d="M 0 -38 L 0 -66" stroke={P.paper} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />
        {[-124, -108].map((cy) => <circle key={cy} cx={-4} cy={cy} r={2} fill={P.paper} opacity={0.8} />)}
      </Appear>
      {/* arms */}
      {arms[pose].map((d, i) => <Ink key={i} d={d} a={k(0.45)} b={k(0.75)} w={8} ea={ea} />)}
      <Appear a={k(0.7)} out={ea}>{hands[pose].map(([hx, hy], i) => (
        // an open hand is a ring; a hand closing on nothing shrinks to a small filled fist
        <circle key={i} cx={hx} cy={hy} r={5.5 + (1 - fist) * 2 - fist * 1.5} fill={fist > 0.5 ? ink : P.paper} stroke={ink} strokeWidth={2.4} />
      ))}</Appear>
      {/* neck + faceless head */}
      <g transform="rotate(-10 0 -197)"><Shape d="M -13 -197 a 13 15 0 1 0 26 0 a 13 15 0 1 0 -26 0" a={k(0.5)} b={k(0.7)} fill={P.paper} w={2.6} ea={ea} /></g>
      {eyes === 'dots' && <Appear a={k(0.7)} out={ea}><circle cx={-4} cy={-199} r={2.4} fill={ink} /><circle cx={6} cy={-200} r={2.4} fill={ink} /></Appear>}
      {eyes === 'coins' && [[-5, -199], [7, -200]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r={5.6} fill={P.sun} stroke={ink} strokeWidth={1.6} /><circle cx={cx} cy={cy} r={2.6} fill="none" stroke={ink} strokeWidth={1} opacity={0.6} /></g>
      ))}
      {/* the tall hat */}
      <g transform={`translate(0 ${hatY})`}>
        <Shape d={`M -16 0 L -18.5 ${-crown} Q 0 ${-crown - 4} 18.5 ${-crown} L 16 0 Z`} a={k(0.6)} b={k(0.9)} fill={ink} w={3} ea={ea} />
        <Wash d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" a={k(0.85)} fill={band ?? P.inkSoft} ea={ea} />
        <Ink d="M -27 1 Q 0 -5 27 1" a={k(0.75)} b={k(0.95)} w={6} ea={ea} />
      </g>
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
};
export const Person: React.FC<PersonProps> = ({ x, y, s = 1, a, b, body = P.wash, hair = 'tuft', pose = 'down', mood = 'smile', flip, bob = 0, tilt = 0, ea, device = 'none', hairColor }) => {
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
      <Appear a={k(0.2)} out={ea}><ellipse cx={0} cy={1 - bob / s} rx={20} ry={3.5} fill={P.ink} opacity={0.12} /></Appear>
      <Ink d="M -7 -1 L -6 -24 M 7 -1 L 6 -24" a={k(0)} b={k(0.3)} w={4} ea={ea} />
      <Shape d="M -18 -22 C -21 -50 -15 -68 0 -69 C 15 -68 21 -50 18 -22 Q 0 -18 -18 -22 Z" a={k(0.15)} b={k(0.55)} fill={body} w={3} ea={ea} />
      <Ink d={arms[pose]} a={k(0.4)} b={k(0.7)} w={3.6} ea={ea} />
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
      <rect x={-17} y={-16} width={34} height={28} rx={5} fill={color} />
      <circle cx={0} cy={-4} r={3.4} fill={P.paper} /><path d="M 0 -3 L 0 4" stroke={P.paper} strokeWidth={2.6} strokeLinecap="round" />
    </g>
  );
};
/** A price tag on a string; `prices` are re-inked one after another, each striking out the one before. */
export const PriceTag: React.FC<{ x: number; y: number; s?: number; at: number; prices: { v: string; at: number }[]; strikeAll?: number; final?: { v: string; at: number; color: string }; swing?: number }> = ({ x, y, s = 1, at, prices, strikeAll, final, swing = 0 }) => {
  const t = useT();
  const p = pop(t, at, 0.55);
  if (p <= 0) return null;
  const sway = Math.sin((t - at) * 3.2) * 4 * Math.exp(-(t - at) * 0.7) + swing;
  const h = 70 + prices.length * 30;
  const vis = prices.filter((q) => t >= q.at);
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${sway})`} opacity={Math.min(1, p)}>
      <path d="M 0 -30 L 0 0" stroke={P.ink} strokeWidth={2} />
      <path d={`M -48 0 L 48 0 L 48 ${h} L -48 ${h} Z`} fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={0} cy={14} r={5} fill="none" stroke={P.ink} strokeWidth={2.4} />
      {vis.map((q, i) => {
        const struck = i < vis.length - 1 || (strikeAll != null && t >= strikeAll);
        const sp = i < vis.length - 1 ? lin(t, vis[i + 1].at, vis[i + 1].at + 0.2) : strikeAll != null ? lin(t, strikeAll, strikeAll + 0.25) : 0;
        const cy = 50 + i * 30;
        const ink = lin(t, q.at, q.at + 0.22);
        return (
          <g key={i} opacity={ink}>
            <text x={0} y={cy} textAnchor="middle" fontFamily={DMSANS} fontWeight={700} fontSize={20} fill={struck ? P.inkSoft : P.ink} letterSpacing="-0.02em">{q.v}</text>
            {struck && <path d={`M -38 ${cy - 7} L ${-38 + 76 * sp} ${cy - 7}`} stroke={P.ink} strokeWidth={3} strokeLinecap="round" />}
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
