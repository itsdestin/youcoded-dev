// Take 1C: the little app windows people make by asking, drawn in the book's own line art.
// WHY one window, three looks: the film's claim is ONE app that each person changes by asking it. So every window
// here is the same frame (same title bar, corner radius, type sizes and content grid) and only the LOOK changes:
// Maya's green (the Meadow Mist community theme), June's lilac (Cotton Candy Sky) and Theo's light gold (staged
// from his own colour; brand guide section 8 lets what a person makes inside the app be staged).
// These are storybook drawings of pages a person made by asking, never a copy of the app's own interface
// (brand guide section 8: no drawn input bar or app chrome pretending to be the real thing).
// WHY redrawn (round eight review: "crisp, thin-stroked UI mockups with tiny labels ... pasted on from a different
// style", "generic app cards"): the frame is now inked with the same weight as the people beside it, each window
// holds ONE big picture of the very thing that person lost (her plant, his records, her keepsake box) and ONE big
// label, and the fine print ("38 albums", "sorted by year", "just for me") is gone: none of it could be read.
import React from 'react';
import { DMSANS, EASE_IN_OUT } from '../brand';
import { Ink, lin, P, pop, useT } from './take1c-ink';

/** A rounded rectangle as a path that starts at the top-left corner and runs clockwise (so it "draws" round). */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;

export type Theme = 'meadow' | 'cotton' | 'honey';
type Look = { canvas: string; panel: string; inset: string; accent: string; fg: string; muted: string; edge: string };
// Copied from wecoded-themes/themes/<slug>/manifest.json "tokens" (canvas, panel, inset, accent, fg-2, fg-muted, edge).
const MEADOW: Look = { canvas: '#F6FAF5', panel: '#DDE9DA', inset: '#BAD0B6', accent: '#2F7D55', fg: '#1E3426', muted: '#465B4E', edge: '#8FB191' };
const COTTON: Look = { canvas: '#FBF5FC', panel: '#ECDDF0', inset: '#D5BCE0', accent: '#8B47B8', fg: '#41304D', muted: '#695775', edge: '#B597C6' };
// WHY a staged light gold look for Theo (round seven review): Golden Sunbreak is a dark theme, and Theo's app drawn
// in it was a near-black slab that read as a different app. This is the same light chrome, his gold as the accent.
const HONEY: Look = { canvas: '#FFF9EB', panel: '#F5E6BF', inset: '#EBD196', accent: '#B9800F', fg: '#3B2A0C', muted: '#7A6236', edge: '#D8B866' };
export const LOOK: Record<Theme, Look> = { meadow: MEADOW, cotton: COTTON, honey: HONEY };

// ---------- the one frame every window shares ----------
const W = 400, H = 330, BAR = 40, R = 26;   // designed at 400×330 and scaled to fit
const LINE = 6.5;                            // the frame's ink weight, in window units (~the figures' own weight on screen)
const HERO = { x: 112, y: 200 };             // centre of the picture
const COL = 222;                             // left edge of the text column
/** What a window holds: each answers exactly what was taken from its owner. */
export type What = 'plants' | 'records' | 'keepsakes';
const DEFAULT_WHAT: Record<Theme, What> = { meadow: 'plants', honey: 'records', cotton: 'keepsakes' };
// WHY one big title and nothing else (one line of what it does for the plants, because that box ticks itself):
// every word here must be readable on a phone in the shot that shows it
const TITLE: Record<What, [string, string]> = { plants: ['my', 'plants'], records: ['my', 'records'], keepsakes: ['photos', '& letters'] };
const TITLE_Y = [104, 152];
const TICK = { x: COL, y: 204 };             // the plant app's one tick box (top-left corner)

// ---------- what each person made ----------
const Plants: React.FC<{ L: Look; hero: number }> = ({ L, hero }) => {
  const leaf = (rot: number, len: number, k: number) => (
    <g key={k} transform={`rotate(${rot})`}>
      <path d={`M 0 0 C ${len * 0.2} ${-len * 0.25} ${len * 0.15} ${-len * 0.8} 0 ${-len} C ${-len * 0.55} ${-len * 0.8} ${-len * 0.6} ${-len * 0.25} 0 0 Z`} fill={L.accent} stroke={P.ink} strokeWidth={4} strokeLinejoin="round" />
      <path d={`M 0 -4 L 0 ${-len * 0.9}`} stroke={L.inset} strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <g transform={`translate(${HERO.x} ${HERO.y + 74}) scale(${hero})`}>
      {[[-40, 108], [-8, 132], [28, 116], [-68, 84], [54, 88]].map(([r, l], k) => leaf(r, l, k))}
      <path d="M -42 0 L 42 0 L 33 58 L -33 58 Z" fill={L.edge} stroke={P.ink} strokeWidth={4} strokeLinejoin="round" />
      <path d="M -48 -9 L 48 -9 L 48 8 L -48 8 Z" fill={L.inset} stroke={P.ink} strokeWidth={4} strokeLinejoin="round" />
    </g>
  );
};
/** Theo's records: three sleeves standing in a row, each with its black disc half slid out. No prices anywhere. */
const RecordsPic: React.FC<{ L: Look; hero: number }> = ({ L, hero }) => (
  <g transform={`translate(${HERO.x} ${HERO.y + 62}) scale(${hero})`}>
    {[[-58, -8, L.accent], [-8, 4, L.edge], [40, -4, L.inset]].map(([x, r, c], i) => (
      <g key={i} transform={`translate(${x} 0) rotate(${r})`}>
        {/* the disc first, so the sleeve covers its lower half: "half out of its sleeve" */}
        <circle cx={0} cy={-100} r={38} fill={P.ink} />
        <circle cx={0} cy={-100} r={26} fill="none" stroke={P.paper} strokeWidth={1.6} opacity={0.3} />
        <circle cx={0} cy={-100} r={11} fill={L.canvas} stroke={P.ink} strokeWidth={2} />
        <path d={rr(-40, -88, 80, 88, 4)} fill={c as string} stroke={P.ink} strokeWidth={4} strokeLinejoin="round" />
        <circle cx={0} cy={-44} r={18} fill="none" stroke={L.canvas} strokeWidth={5} opacity={0.75} />
      </g>
    ))}
  </g>
);
/** June's keepsakes: her own box (the heart clasp from chapters ii and vii), open, with a photo, a letter and a heart. */
const KeepsakesPic: React.FC<{ L: Look; hero: number }> = ({ L, hero }) => (
  <g transform={`translate(${HERO.x} ${HERO.y + 66}) scale(${hero})`}>
    {/* the lid, standing open behind the box */}
    <path d="M -74 -92 L -84 -128 L 84 -128 L 74 -92 Z" fill={L.inset} stroke={P.ink} strokeWidth={4} strokeLinejoin="round" />
    <g transform="translate(-34 -100) rotate(-12)"><path d={rr(-24, -20, 48, 38, 3)} fill={L.canvas} stroke={P.ink} strokeWidth={3.4} /><path d="M -17 11 L -5 -2 L 3 6 L 9 0 L 17 11" fill="none" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" /></g>
    <g transform="translate(16 -104) rotate(9)"><path d={rr(-24, -16, 48, 32, 3)} fill={L.panel} stroke={P.ink} strokeWidth={3.4} /><path d="M -24 -16 L 0 4 L 24 -16" fill="none" stroke={P.ink} strokeWidth={3} /></g>
    <path d="M 54 -86 C 32 -102 40 -122 54 -111 C 68 -122 76 -102 54 -86 Z" fill={L.accent} stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />
    <path d="M -74 -90 L 74 -90 L 68 0 L -68 0 Z" fill={L.edge} stroke={P.ink} strokeWidth={4.4} strokeLinejoin="round" />
    <path d="M 0 -32 C -17 -44 -11 -58 0 -50 C 11 -58 17 -44 0 -32 Z" fill={L.canvas} stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />
  </g>
);

/** The right-hand column: one big title, the same place in every window; only the words and colours differ. */
const Column: React.FC<{ what: What; L: Look; tick?: number; t: number }> = ({ what, L, tick, t }) => {
  const [a, b] = TITLE[what];
  const tk = tick == null ? 1 : lin(t, tick, tick + 0.22);
  // WHY sized to the column (first render: "& letters" ran off the window's edge): as big as the longer word allows
  const fs = Math.min(46, (W - COL - 16) / (Math.max(a.length, b.length) * 0.54));
  return (
    // WHY one face for every look (round eight review: June's title in a different font read as a different app)
    <g fontFamily={DMSANS} fontWeight={800} letterSpacing="-0.03em">
      <text x={COL} y={TITLE_Y[0]} fontSize={fs} fill={L.fg}>{a}</text>
      <text x={COL} y={TITLE_Y[0] + fs * 1.04} fontSize={fs} fill={L.accent}>{b}</text>
      {what === 'plants' && (
        // WHY a tick box (round six plan): the one thing Maya's app does is remind her to water, and the box ticks
        // itself as the app fills, so it reads as working, not as a picture of an app
        <g>
          <path d={rr(TICK.x, TICK.y, 34, 34, 8)} fill={L.canvas} stroke={L.accent} strokeWidth={4} />
          {tk > 0 && <path d={`M ${TICK.x + 8} ${TICK.y + 18} L ${TICK.x + 15} ${TICK.y + 26} L ${TICK.x + 28} ${TICK.y + 9}`} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - tk}
            stroke={L.accent} strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <text x={TICK.x + 46} y={TICK.y + 15} fontSize={24} fontWeight={700} letterSpacing="-0.01em" fill={L.fg}>water in</text>
          <text x={TICK.x + 46} y={TICK.y + 42} fontSize={24} fontWeight={700} letterSpacing="-0.01em" fill={L.fg}>2 days</text>
        </g>
      )}
    </g>
  );
};

// ---------- the window ----------
type WinProps = {
  theme: Theme;
  x: number; y: number; w: number;                // centre and width, in page units (height follows: 400×330)
  a?: number;                                      // when its outline starts to draw (default: long done)
  draw?: number;                                   // how long the outline takes (the quill drawing it)
  contentAt?: number;                              // when the inside arrives
  what?: What;                                     // what it holds (default: that look's owner's thing)
  tick?: number;                                   // when the plant app's tick box ticks itself
  r?: number; s?: number;                          // tilt and extra scale, for windows in flight
  /** 0..1: the window repainted in `to`'s look behind a soft edge that sweeps left to right (the quill redrawing it) */
  reskin?: { to: Theme; p: number };
  shadow?: number;                                 // extra lift (0..1) for a window being carried
  compact?: boolean;                               // accepted for old callers; every window now has one layout
};
/** The inside of a window (title bar and content) in one look. */
// WHY `what` separate from `theme`: a shared page keeps what it IS (her plants) while taking on the colours of
// whoever it lands with.
const Body: React.FC<{ theme: Theme; what: What; t: number; wipe: number; hero: number; id: string; tick?: number }> = ({ theme, what, t, wipe, hero, id, tick }) => {
  const L = LOOK[theme];
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill={L.canvas} />
      <rect x={0} y={0} width={W} height={BAR} fill={L.panel} />
      {[0, 1, 2].map((i) => <circle key={i} cx={28 + i * 22} cy={BAR / 2} r={6.5} fill={L.edge} stroke={P.ink} strokeWidth={2} />)}
      {wipe > 0 && (
        <g clipPath={`url(#${id}-w)`}>
          {what === 'plants' && <Plants L={L} hero={hero} />}
          {what === 'records' && <RecordsPic L={L} hero={hero} />}
          {what === 'keepsakes' && <KeepsakesPic L={L} hero={hero} />}
          <Column what={what} L={L} tick={tick} t={t} />
        </g>
      )}
    </>
  );
};

/** Where the soft edge of a reskin is at progress p (window units, along x). */
const reskinEdge = (p: number) => -50 + (W + 100) * Math.max(0, Math.min(1, p));

let winSeq = 0;
/** One app window in one look. Draws its outline, floods its colour, then its inside wipes down and lands. */
export const ThemedWindow: React.FC<WinProps> = ({ theme, x, y, w, a = -10, draw = 0.5, contentAt, r = 0, s = 1, reskin, shadow = 0, what, tick }) => {
  const t = useT();
  // WHY a per-instance id: two copies of the same look at the same spot (the shared copy) must not share clips
  const [uid] = React.useState(() => ++winSeq);
  const holds = what ?? DEFAULT_WHAT[theme];
  const k = (w / W) * s;
  const c = contentAt ?? a + draw * 0.8;
  const fill = lin(t, a + draw * 0.45, a + draw * 0.9);
  if (t < a) return null;
  // WHY the inside wipes down and its picture pops: it reads as the window filling in, never as loose strokes
  const wipe = lin(t, c, c + 0.45, EASE_IN_OUT);
  const hero = Math.min(1.08, pop(t, c + 0.15, 0.5));
  const id = `c-win-${uid}`;
  const rs = reskin ? Math.max(0, Math.min(1, reskin.p)) : 0;
  const e = reskinEdge(rs);
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${k}) translate(${-W / 2} ${-H / 2})`}>
      <defs>
        <clipPath id={id}><path d={rr(0, 0, W, H, R)} /></clipPath>
        <clipPath id={`${id}-w`}><rect x={0} y={BAR} width={W} height={(H - BAR) * wipe} /></clipPath>
        {/* WHY a soft, slightly slanted edge (round eight review: a hard vertical seam sliding across read as a UI
            transition): the new colours follow the quill's nib across the window like wet ink */}
        {reskin && (
          <>
            <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={e - 24} y1={0} x2={e + 24} y2={14}>
              <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
            </linearGradient>
            <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-20} y={-20} width={W + 40} height={H + 40}><rect x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${id}-g)`} /></mask>
          </>
        )}
      </defs>
      {/* a soft drop shadow so the window sits on the page; it grows while the window is carried */}
      <path d={rr(8 + shadow * 10, 12 + shadow * 18, W, H, R)} fill={P.ink} opacity={(0.14 + shadow * 0.08) * fill} />
      <g clipPath={`url(#${id})`} opacity={fill}>
        <Body theme={theme} what={holds} t={t} wipe={wipe} hero={hero} id={id} tick={tick} />
        {reskin && rs > 0 && <g mask={`url(#${id}-m)`}><Body theme={reskin.to} what={holds} t={t} wipe={wipe} hero={hero} id={id} tick={tick} /></g>}
      </g>
      <Ink d={`M ${LINE / 2} ${BAR} L ${W - LINE / 2} ${BAR}`} a={a + draw * 0.7} b={a + draw} w={4} />
      <Ink d={rr(0, 0, W, H, R)} a={a} b={a + draw} w={LINE} />
    </g>
  );
};

/** A window's height for a given width (they all share one shape). */
export const windowHeight = (w: number) => (w / W) * H;
/** Where the plant app's tick box is on the page, for a window centred at (x, y) of width w (for the quill's dab). */
export const tickPoint = (win: { x: number; y: number; w: number }) => {
  const k = win.w / W;
  return { x: win.x - win.w / 2 + (TICK.x + 17) * k, y: win.y - windowHeight(win.w) / 2 + (TICK.y + 17) * k };
};
/** Where the quill's nib rides while it repaints a window (on the soft edge, a little above the middle). */
export const reskinNib = (win: { x: number; y: number; w: number }, p: number) => {
  const k = win.w / W;
  return { x: win.x - win.w / 2 + reskinEdge(p) * k, y: win.y - windowHeight(win.w) / 2 + (H * 0.42 + Math.sin(p * Math.PI * 3) * 26) * k };
};
/** The window's corner radius in its own units (the quill walks the same rounded outline). */
export const WIN_R = R;
