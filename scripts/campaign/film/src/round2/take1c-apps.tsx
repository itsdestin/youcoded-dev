// Take 1C: the little app windows people make by asking, drawn in the book's own line art.
// WHY one window, four real themes (review 2026-11-20; the owner disliked the last set): six windows in six
// made-up colour schemes, each with its own chrome and layout, read as six different apps from a store. The
// film's claim is ONE app that each person changes by asking it. So every window here is the same frame
// (same title bar, corner radius, type sizes and content grid) and only the THEME changes, using four real
// community themes from the wecoded-themes registry, with every colour copied from that theme's manifest
// tokens. Hot pink and tomato red are gone: all four sit quietly beside the brand purple.
// These are storybook drawings of pages a person made by asking, never a copy of the app's own interface
// (brand guide section 8: no drawn input bar or app chrome pretending to be the real thing).
import React from 'react';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadComfortaa } from '@remotion/google-fonts/Comfortaa';
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { DMSANS, EASE_IN_OUT } from '../brand';
import { Ink, lin, mixHex, P, pop, useT } from './take1c-ink';

// WHY each theme's own font for the page title only: a theme in youcoded changes the font too (it is in each
// manifest's font.family), and that is part of "every copy looks different". The frame's labels stay DM Sans.
const NUNITO = loadNunito('normal', { weights: ['800'], subsets: ['latin'] }).fontFamily;
const COMFORTAA = loadComfortaa('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
const GROTESK = loadGrotesk('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

/** A rounded rectangle as a path that starts at the top-left corner and runs clockwise (so it "draws" round). */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;

const mix = mixHex;

export type Theme = 'meadow' | 'cotton' | 'sunbreak' | 'devils';
/** The order people appear in: light, dark, light, dark, so neighbours never look alike. */
export const THEMES: Theme[] = ['meadow', 'sunbreak', 'cotton', 'devils'];
type Look = { name: string; canvas: string; panel: string; inset: string; accent: string; fg: string; muted: string; edge: string; font: string; page: string; dark: boolean };
// Copied from wecoded-themes/themes/<slug>/manifest.json "tokens" (canvas, panel, inset, accent, fg-2, fg-muted, edge).
// `page` is a whole book page that belongs to that person: a light theme's own panel colour; for a dark theme
// (whose panel would turn the page black) the paper warmed by its accent or edge, so drawn ink still reads.
const MEADOW = { canvas: '#F6FAF5', panel: '#DDE9DA', inset: '#BAD0B6', accent: '#2F7D55', fg: '#1E3426', muted: '#465B4E', edge: '#8FB191' };
const COTTON = { canvas: '#FBF5FC', panel: '#ECDDF0', inset: '#D5BCE0', accent: '#8B47B8', fg: '#41304D', muted: '#695775', edge: '#B597C6' };
const SUNBREAK = { canvas: '#08080E', panel: '#140E1A', inset: '#1C1428', accent: '#FFC030', fg: '#F8E8C8', muted: '#917950', edge: '#3C3223' };
const DEVILS = { canvas: '#140810', panel: '#221020', inset: '#2E1828', accent: '#FFC627', fg: '#FBE9C9', muted: '#A28E6D', edge: '#7A3048' };
export const LOOK: Record<Theme, Look> = {
  meadow: { name: 'Meadow Mist', ...MEADOW, font: NUNITO, page: MEADOW.panel, dark: false },
  cotton: { name: 'Cotton Candy Sky', ...COTTON, font: COMFORTAA, page: COTTON.panel, dark: false },
  // Golden Sunbreak's manifest names no font, so it shows the app's default sans
  sunbreak: { name: 'Golden Sunbreak', ...SUNBREAK, font: DMSANS, page: mix(P.paper, SUNBREAK.accent, 0.24), dark: true },
  devils: { name: "Devil's Garden", ...DEVILS, font: GROTESK, page: mix(P.paper, DEVILS.edge, 0.2), dark: true },
};

// ---------- the one frame every window shares ----------
const W = 400, H = 330, BAR = 34, R = 18;   // designed at 400×330 and scaled to fit
// The content grid, the same in every window: a picture on the left, the title and two rows on the right.
const HERO = { x: 106, y: 196 };            // centre of the picture
const COL = 214;                            // left edge of the text column
const TITLE_Y = 100, ROW1 = 150, ROW2 = 186, BAR_Y = 214;

/** What each page is called in its title bar (DM Sans, the frame's own label). */
const LABEL: Record<Theme, string> = { meadow: 'my plants', cotton: 'biscuit', sunbreak: 'tonight', devils: 'game night' };

// ---------- what each person made ----------
const Plants: React.FC<{ L: Look; hero: number }> = ({ L, hero }) => {
  const leaf = (rot: number, len: number, k: number) => (
    <g key={k} transform={`rotate(${rot})`}>
      <path d={`M 0 0 C ${len * 0.2} ${-len * 0.25} ${len * 0.15} ${-len * 0.8} 0 ${-len} C ${-len * 0.55} ${-len * 0.8} ${-len * 0.6} ${-len * 0.25} 0 0 Z`} fill={L.accent} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={`M 0 -4 L 0 ${-len * 0.9}`} stroke={L.inset} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <g transform={`translate(${HERO.x} ${HERO.y + 70}) scale(${hero})`}>
      {[[-40, 104], [-8, 128], [28, 112], [-68, 80], [54, 84]].map(([r, l], k) => leaf(r, l, k))}
      <path d="M -40 0 L 40 0 L 32 56 L -32 56 Z" fill={L.edge} stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
      <path d="M -46 -8 L 46 -8 L 46 8 L -46 8 Z" fill={L.inset} stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
    </g>
  );
};
const Moon: React.FC<{ L: Look; hero: number }> = ({ L, hero }) => (
  <g transform={`translate(${HERO.x} ${HERO.y}) scale(${hero})`}>
    {/* fixed stars, so nothing flickers between frames */}
    {[[-70, -78, 2.4], [72, -64, 2], [-82, 40, 2], [64, 76, 2.6], [10, -96, 1.8]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={L.fg} opacity={0.7} />)}
    <circle r={66} fill={L.accent} />
    <circle cx={-20} cy={-14} r={13} fill={mix(L.accent, L.canvas, 0.18)} /><circle cx={22} cy={20} r={9} fill={mix(L.accent, L.canvas, 0.18)} /><circle cx={16} cy={-30} r={5} fill={mix(L.accent, L.canvas, 0.18)} />
  </g>
);
const Cat: React.FC<{ L: Look; hero: number; t: number }> = ({ L, hero, t }) => (
  // WHY soft ears, a pale coat and whiskers: a pointed-eared cat in solid accent purple read as a little devil
  <g transform={`translate(${HERO.x} ${HERO.y}) scale(${hero})`}>
    <circle r={84} fill={L.inset} />
    <path d="M -50 34 C -58 -14 -50 -38 -40 -46 Q -46 -70 -38 -80 Q -22 -66 -12 -56 C -4 -59 4 -59 12 -56 Q 22 -66 38 -80 Q 46 -70 40 -46 C 50 -38 58 -14 50 34 Q 0 62 -50 34 Z"
      fill={L.canvas} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d="M -36 -68 Q -30 -60 -24 -56 M 36 -68 Q 30 -60 24 -56" stroke={L.edge} strokeWidth={6} strokeLinecap="round" />
    {/* the stripes on her head, in the theme's accent */}
    <path d="M -8 -54 L -5 -38 M 0 -56 L 0 -40 M 8 -54 L 5 -38" stroke={L.accent} strokeWidth={4} strokeLinecap="round" />
    {/* WHY a slow blink: the only thing moving in the window, so it reads as somebody's cat, alive */}
    <g transform={`translate(0 -4) scale(1 ${Math.abs(Math.sin(t * 0.9)) > 0.97 ? 0.15 : 1})`}>
      <ellipse cx={-19} cy={0} rx={5} ry={7} fill={P.ink} /><ellipse cx={19} cy={0} rx={5} ry={7} fill={P.ink} />
    </g>
    <path d="M -6 14 L 6 14 L 0 20 Z" fill={L.accent} /><path d="M 0 20 Q -8 28 -14 24 M 0 20 Q 8 28 14 24" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    <path d="M -24 14 L -52 8 M -24 20 L -50 24 M 24 14 L 52 8 M 24 20 L 50 24" stroke={P.ink} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
  </g>
);
const Board: React.FC<{ L: Look; hero: number; t: number }> = ({ L, hero, t }) => {
  const s = 38;
  const pieces: [number, number, boolean][] = [[0, 0, true], [2, 0, true], [1, 1, true], [3, 1, true], [0, 2, false], [2, 2, false], [1, 3, false]];
  const hop = lin(t % 4, 1.2, 1.7, EASE_IN_OUT);   // one piece hops forward, now and then
  return (
    <g transform={`translate(${HERO.x} ${HERO.y}) scale(${hero}) translate(${-2 * s} ${-2 * s})`}>
      <rect x={-7} y={-7} width={4 * s + 14} height={4 * s + 14} rx={8} fill={L.edge} />
      {Array.from({ length: 16 }).map((_, i) => <rect key={i} x={(i % 4) * s} y={Math.floor(i / 4) * s} width={s} height={s} fill={(i + Math.floor(i / 4)) % 2 ? L.inset : L.fg} />)}
      {pieces.map(([cx, cy, mine], i) => {
        const h = i === 5 ? hop : 0;
        return <circle key={i} cx={(cx + 0.5 + h) * s} cy={(cy + 0.5 - h) * s - Math.sin(h * Math.PI) * 12} r={13} fill={mine ? L.accent : L.edge} stroke={P.ink} strokeWidth={2.4} />;
      })}
    </g>
  );
};

/** The right-hand column: the same three slots in every window, only the words and colours differ. */
const Column: React.FC<{ theme: Theme; L: Look; compact?: boolean }> = ({ theme, L, compact }) => {
  const title: Record<Theme, [string, string?]> = { meadow: ['Monstera'], cotton: ['biscuit'], sunbreak: ['clear', 'tonight'], devils: ['you 3', 'jo 2'] };
  const rows: Record<Theme, [string, string]> = {
    meadow: ['water in 2 days', 'basil · tomorrow'], cotton: ['fed 8:02 am', 'next · 6 pm'],
    sunbreak: ['saturn 9:40', 'no clouds'], devils: ['your move', 'best of 7'],
  };
  const progress: Record<Theme, number> = { meadow: 0.7, cotton: 0.45, sunbreak: 0.85, devils: 0.6 };
  const [t1, t2] = title[theme];
  const two = !!t2;
  return (
    <g fontFamily={DMSANS}>
      <text x={COL} y={two ? TITLE_Y - 18 : TITLE_Y} fontFamily={L.font} fontWeight={L.font === DMSANS ? 900 : 800} fontSize={36} fill={L.fg} letterSpacing="-0.02em">{t1}</text>
      {two && <text x={COL} y={TITLE_Y + 22} fontFamily={L.font} fontWeight={L.font === DMSANS ? 900 : 800} fontSize={36} fill={L.accent} letterSpacing="-0.02em">{t2}</text>}
      <text x={COL} y={ROW1 + 6} fontWeight={700} fontSize={19} fill={L.fg}>{rows[theme][0]}</text>
      {!compact && <text x={COL} y={ROW2 + 6} fontWeight={500} fontSize={17} fill={L.muted}>{rows[theme][1]}</text>}
      <path d={rr(COL, BAR_Y + (compact ? -26 : 0), 160, 12, 6)} fill={L.inset} />
      <path d={rr(COL, BAR_Y + (compact ? -26 : 0), 160 * progress[theme], 12, 6)} fill={L.accent} />
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
  request?: { text: string; at: number; dur: number; out?: number };   // out: when the bubble fades away
  r?: number; s?: number;                          // tilt and extra scale, for windows in flight
  compact?: boolean;                               // one row fewer, for the smallest sizes
  /** 0..1: a wipe from left to right that repaints this window in `to`'s theme (a shared copy made someone's own) */
  reskin?: { to: Theme; p: number };
  shadow?: number;                                 // extra lift (0..1) for a window being carried
};
/** The inside of a window (title bar and content) in one theme. */
// WHY `what` separate from `theme`: a shared page keeps what it IS (her plants) while taking on the colours,
// font and look of whoever it lands with (his theme).
const Body: React.FC<{ theme: Theme; what: Theme; t: number; wipe: number; hero: number; compact?: boolean; id: string }> = ({ theme, what, t, wipe, hero, compact, id }) => {
  const L = LOOK[theme];
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill={L.canvas} />
      <rect x={0} y={0} width={W} height={BAR} fill={L.panel} />
      <path d={`M 0 ${BAR} L ${W} ${BAR}`} stroke={L.edge} strokeWidth={1.5} />
      {[0, 1, 2].map((i) => <circle key={i} cx={22 + i * 17} cy={BAR / 2} r={5} fill={L.edge} />)}
      <text x={W / 2} y={BAR / 2 + 6} textAnchor="middle" fontFamily={DMSANS} fontWeight={600} fontSize={16} fill={L.muted}>{LABEL[what]}</text>
      {wipe > 0 && (
        <g clipPath={`url(#${id}-w)`}>
          {what === 'meadow' && <Plants L={L} hero={hero} />}
          {what === 'sunbreak' && <Moon L={L} hero={hero} />}
          {what === 'cotton' && <Cat L={L} hero={hero} t={t} />}
          {what === 'devils' && <Board L={L} hero={hero} t={t} />}
          <Column theme={what} L={L} compact={compact} />
        </g>
      )}
    </>
  );
};

let winSeq = 0;
/** One app window in one theme. Draws its outline, floods its colour, then its inside wipes down and lands. */
export const ThemedWindow: React.FC<WinProps> = ({ theme, x, y, w, a = -10, draw = 0.5, contentAt, request, r = 0, s = 1, compact, reskin, shadow = 0 }) => {
  const t = useT();
  // WHY a per-instance id: two copies of the same theme at the same spot (the shared copy) must not share clips
  const [uid] = React.useState(() => ++winSeq);
  const k = (w / W) * s;
  const c = contentAt ?? a + draw * 0.8;
  const fill = lin(t, a + draw * 0.45, a + draw * 0.9);
  if (t < a) return null;
  // WHY the inside wipes down and its picture pops: it reads as the window filling in, never as loose strokes
  const wipe = lin(t, c, c + 0.45, EASE_IN_OUT);
  const hero = Math.min(1.08, pop(t, c + 0.15, 0.5));
  const id = `c-win-${uid}`;
  const typed = request ? Math.floor(request.text.length * lin(t, request.at, request.at + request.dur, (v) => v)) : 0;
  const rs = reskin ? Math.max(0, Math.min(1, reskin.p)) : 0;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${k}) translate(${-W / 2} ${-H / 2})`}>
      <defs>
        <clipPath id={id}><path d={rr(0, 0, W, H, R)} /></clipPath>
        <clipPath id={`${id}-w`}><rect x={0} y={BAR} width={W} height={(H - BAR) * wipe} /></clipPath>
        {reskin && <clipPath id={`${id}-r`}><rect x={0} y={0} width={W * rs} height={H} /></clipPath>}
      </defs>
      {/* a soft drop shadow so the window sits on the page; it grows while the window is carried */}
      <path d={rr(6 + shadow * 10, 10 + shadow * 18, W, H, R)} fill={P.ink} opacity={(0.12 + shadow * 0.08) * fill} />
      <g clipPath={`url(#${id})`} opacity={fill}>
        <Body theme={theme} what={theme} t={t} wipe={wipe} hero={hero} compact={compact} id={id} />
        {reskin && rs > 0 && <g clipPath={`url(#${id}-r)`}><Body theme={reskin.to} what={theme} t={t} wipe={wipe} hero={hero} compact={compact} id={id} /></g>}
      </g>
      {/* the leading edge of a reskin: a thin ink line, so it reads as the window being redrawn, not a glitch */}
      {reskin && rs > 0 && rs < 1 && <path d={`M ${W * rs} 0 L ${W * rs} ${H}`} stroke={P.ink} strokeWidth={3} />}
      <Ink d={`M 0 ${BAR} L ${W} ${BAR}`} a={a + draw * 0.7} b={a + draw} w={2.6} />
      <Ink d={rr(0, 0, W, H, R)} a={a} b={a + draw} w={3.4} />
      {request && t > request.at - 0.25 && (
        // what the person asked, in a storybook speech bubble hanging off the foot of the window
        <g opacity={lin(t, request.at - 0.25, request.at) * (request.out == null ? 1 : 1 - lin(t, request.out, request.out + 0.3))}>
          <path d={`${rr(10, H - 18, W + 10, 56, 28)} M 52 ${H + 36} L 40 ${H + 58} L 74 ${H + 38}`} fill="#FFFFFF" stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
          <text x={34} y={H + 18} fontFamily={DMSANS} fontWeight={500} fontSize={20} fill={P.ink}>
            {request.text.slice(0, typed)}
            {typed < request.text.length && <tspan fill={P.purple}>|</tspan>}
          </text>
        </g>
      )}
    </g>
  );
};

/** A window's height for a given width (they all share one shape). */
export const windowHeight = (w: number) => (w / W) * H;
