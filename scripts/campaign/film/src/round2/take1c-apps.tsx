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
  // WHY `bare` (review 2026-11-20): a title bar with three dots reads as the product's own window, which the brand
  // forbids drawing. Bare cards are what a person MADE: a taped paper card, same content, no window chrome.
  bare?: boolean;
  r?: number; s?: number;                          // tilt and extra scale, for windows in flight
  compact?: boolean;                               // one row fewer, for the smallest sizes
  /** 0..1: a wipe from left to right that repaints this window in `to`'s theme (a shared copy made someone's own) */
  reskin?: { to: Theme; p: number };
  shadow?: number;                                 // extra lift (0..1) for a window being carried
};
/** The inside of a window (title bar and content) in one theme. */
// WHY `what` separate from `theme`: a shared page keeps what it IS (her plants) while taking on the colours,
// font and look of whoever it lands with (his theme).
const Body: React.FC<{ theme: Theme; what: Theme; t: number; wipe: number; hero: number; compact?: boolean; id: string; bare?: boolean }> = ({ theme, what, t, wipe, hero, compact, id, bare }) => {
  const L = LOOK[theme];
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill={L.canvas} />
      {!bare && <>
        <rect x={0} y={0} width={W} height={BAR} fill={L.panel} />
        <path d={`M 0 ${BAR} L ${W} ${BAR}`} stroke={L.edge} strokeWidth={1.5} />
        {[0, 1, 2].map((i) => <circle key={i} cx={22 + i * 17} cy={BAR / 2} r={5} fill={L.edge} />)}
        <text x={W / 2} y={BAR / 2 + 6} textAnchor="middle" fontFamily={DMSANS} fontWeight={600} fontSize={16} fill={L.muted}>{LABEL[what]}</text>
      </>}
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
export const ThemedWindow: React.FC<WinProps> = ({ theme, x, y, w, a = -10, draw = 0.5, contentAt, bare, r = 0, s = 1, compact, reskin, shadow = 0 }) => {
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
        <Body theme={theme} what={theme} t={t} wipe={wipe} hero={hero} compact={compact} id={id} bare={bare} />
        {reskin && rs > 0 && <g clipPath={`url(#${id}-r)`}><Body theme={reskin.to} what={theme} t={t} wipe={wipe} hero={hero} compact={compact} id={id} bare={bare} /></g>}
      </g>
      {/* the leading edge of a reskin: a thin ink line, so it reads as the window being redrawn, not a glitch */}
      {reskin && rs > 0 && rs < 1 && <path d={`M ${W * rs} 0 L ${W * rs} ${H}`} stroke={P.ink} strokeWidth={3} />}
      {!bare && <Ink d={`M 0 ${BAR} L ${W} ${BAR}`} a={a + draw * 0.7} b={a + draw} w={2.6} />}
      <Ink d={rr(0, 0, W, H, R)} a={a} b={a + draw} w={3.4} />
      {/* a strip of washi tape holds a bare card to the page */}
      {bare && <rect x={W / 2 - 46} y={-9} width={92} height={22} fill="#E8C9D8" opacity={0.78 * fill} transform={`rotate(-2 ${W / 2} 0)`} />}
    </g>
  );
};

/** A window's height for a given width (they all share one shape). */
export const windowHeight = (w: number) => (w / W) * H;

// ======================= the made card (round five) =======================
// WHY a second, simpler card (review BLOCKER: the windows' two rows of small text, 'water in 2 days · basil ·
// tomorrow', could not be read at phone size, and the four cards looked like generic widget templates): each
// thing a person makes is now ONE big drawing and at most ONE line of large type, on the same taped card. The
// frame, tape and type size never change from card to card, so a stranger sees one object that each person's
// asking re-dresses, which is the film's whole claim. The colours and title font are still copied from four real
// community themes (LOOK above).
export type Made = 'plants' | 'bus' | 'game' | 'cat' | 'photos' | 'chores' | 'quiz' | 'shifts';
const MADE_LINE: Record<Made, string> = {
  plants: 'water friday', bus: '3 min', game: 'your move', cat: 'biscuit',
  // WHY these answer their asks literally (round 2 review: 'quiz night' read as a pub quiz, not 'a quiz for my class')
  photos: 'grandma', chores: 'mia · leo · ava', quiz: 'class 4b', shifts: 'mon · wed · fri',
};
const HERO_C = { x: W / 2, y: 140 };
const LINE_Y = 298;
const ink = (w = 3) => ({ stroke: P.ink, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const });

/** The one drawing on a made card, centred in its upper three quarters. `t` drives the small idle motions. */
// WHY `beat` (round 2 review: the three copies froze for 1.9 s): a moment when the thing does its one job (the leaves
// perk up, the bus pulls in, a piece hops), so each copy visibly works
const MadeHero: React.FC<{ what: Made; L: Look; t: number; name?: string; beat?: number }> = ({ what, L, t, beat }) => {
  const { x, y } = HERO_C;
  const bt = beat == null ? 0 : Math.max(0, Math.min(1, (t - beat) / 0.5));
  const act = Math.sin(bt * Math.PI);
  if (what === 'plants') {
    // the Monstera: the quality bar the reviewers named (heavy outline, simple leaves, pale pot)
    const leaf = (rot: number, len: number, k: number) => (
      <g key={k} transform={`rotate(${rot * (1 - 0.18 * act) + Math.sin(t * 1.3 + k) * 1.5}) scale(${1 + 0.12 * act})`}>
        <path d={`M 0 0 C ${len * 0.2} ${-len * 0.25} ${len * 0.15} ${-len * 0.8} 0 ${-len} C ${-len * 0.55} ${-len * 0.8} ${-len * 0.6} ${-len * 0.25} 0 0 Z`} fill={L.accent} {...ink(3)} />
        <path d={`M 0 -4 L 0 ${-len * 0.9}`} stroke={L.inset} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </g>
    );
    return (
      <g transform={`translate(${x} ${y + 58}) scale(0.84)`}>
        {[[-40, 104], [-8, 128], [28, 112], [-68, 80], [54, 84]].map(([r, l], k) => leaf(r, l, k))}
        <path d="M -42 0 L 42 0 L 33 58 L -33 58 Z" fill={L.edge} {...ink(3)} />
        <path d="M -48 -8 L 48 -8 L 48 8 L -48 8 Z" fill={L.inset} {...ink(3)} />
      </g>
    );
  }
  if (what === 'bus') {
    // a big, friendly bus side-on with its route number: "when's my bus. big numbers"
    const roll = Math.sin(t * 9) * 0.8;
    return (
      <g transform={`translate(${x - 40 * act} ${y + 4 + roll})`}>
        <path d={rr(-136, -70, 272, 124, 22)} fill={L.accent} {...ink(3.4)} />
        {[-108, -54, 0].map((wx) => <path key={wx} d={rr(wx, -52, 44, 40, 7)} fill={L.canvas} {...ink(2.6)} />)}
        <path d={rr(66, -52, 48, 92, 7)} fill={L.inset} {...ink(2.6)} />
        <path d="M 90 -52 L 90 40" {...ink(2.2)} />
        <path d={rr(-118, 6, 64, 30, 6)} fill={L.canvas} {...ink(2.4)} />
        <text x={-86} y={30} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={26} fill={L.fg === L.canvas ? P.ink : (L.dark ? L.canvas : L.fg)} letterSpacing="-0.04em">14</text>
        {[-80, 84].map((wx) => <g key={wx}><circle cx={wx} cy={56} r={22} fill={P.ink} /><circle cx={wx} cy={56} r={8} fill={L.inset} /></g>)}
      </g>
    );
  }
  if (what === 'game') {
    const s = 44;
    const pieces: [number, number, boolean][] = [[0, 0, true], [2, 0, true], [1, 1, true], [3, 1, true], [0, 2, false], [2, 2, false], [1, 3, false]];
    const hop = beat == null ? lin(t % 3, 1.0, 1.45, EASE_IN_OUT) : lin(t, beat, beat + 0.45, EASE_IN_OUT);
    return (
      <g transform={`translate(${x - 2 * s} ${y - 2 * s + 4})`}>
        <rect x={-8} y={-8} width={4 * s + 16} height={4 * s + 16} rx={9} fill={L.edge} {...ink(3)} />
        {Array.from({ length: 16 }).map((_, i) => <rect key={i} x={(i % 4) * s} y={Math.floor(i / 4) * s} width={s} height={s} fill={(i + Math.floor(i / 4)) % 2 ? L.inset : L.fg} />)}
        {pieces.map(([cx, cy, mine], i) => {
          const h = i === 5 ? hop : 0;
          return <circle key={i} cx={(cx + 0.5 + h) * s} cy={(cy + 0.5 - h) * s - Math.sin(h * Math.PI) * 14} r={15} fill={mine ? L.accent : L.edge} {...ink(2.6)} />;
        })}
      </g>
    );
  }
  if (what === 'cat') {
    return (
      <g transform={`translate(${x} ${y + 2}) scale(0.98)`}>
        <circle r={86} fill={L.inset} />
        <path d="M -50 34 C -58 -14 -50 -38 -40 -46 Q -46 -70 -38 -80 Q -22 -66 -12 -56 C -4 -59 4 -59 12 -56 Q 22 -66 38 -80 Q 46 -70 40 -46 C 50 -38 58 -14 50 34 Q 0 62 -50 34 Z"
          fill={L.canvas} {...ink(3.2)} />
        <path d="M -8 -54 L -5 -38 M 0 -56 L 0 -40 M 8 -54 L 5 -38" stroke={L.accent} strokeWidth={5} strokeLinecap="round" />
        <g transform={`translate(0 -4) scale(1 ${Math.abs(Math.sin(t * 0.9)) > 0.97 ? 0.15 : 1})`}>
          <ellipse cx={-19} cy={0} rx={5.5} ry={7.5} fill={P.ink} /><ellipse cx={19} cy={0} rx={5.5} ry={7.5} fill={P.ink} />
        </g>
        <path d="M -6 14 L 6 14 L 0 20 Z" fill={L.accent} /><path d="M 0 20 Q -8 28 -14 24 M 0 20 Q 8 28 14 24" {...ink(2.4)} fill="none" />
        <path d="M -24 14 L -52 8 M -24 20 L -50 24 M 24 14 L 52 8 M 24 20 L 50 24" stroke={P.ink} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
      </g>
    );
  }
  if (what === 'photos') {
    // grandma's photo, as big as the card allows: "grandma's photos, huge"
    return (
      <g transform={`translate(${x} ${y + 2})`}>
        <path d={rr(-118, -96, 236, 192, 8)} fill={L.panel} {...ink(3.2)} />
        <path d={rr(-102, -80, 204, 160, 4)} fill={L.inset} {...ink(2)} />
        <path d="M -70 80 C -66 30 -34 18 0 18 C 34 18 66 30 70 80 Z" fill={L.accent} {...ink(2.6)} />
        <circle cx={0} cy={-18} r={34} fill="#F6E9DE" {...ink(2.6)} />
        <path d="M -34 -22 C -36 -56 36 -56 34 -22 C 26 -42 -26 -42 -34 -22 Z" fill="#E4DDE6" {...ink(2.2)} />
        <circle cx={0} cy={-58} r={13} fill="#E4DDE6" {...ink(2.2)} />
        <circle cx={-12} cy={-16} r={8} fill="none" {...ink(2.2)} /><circle cx={12} cy={-16} r={8} fill="none" {...ink(2.2)} />
        <path d="M -4 -16 L 4 -16" {...ink(2)} />
        <path d="M -9 0 Q 0 7 9 0" fill="none" {...ink(2.2)} />
      </g>
    );
  }
  if (what === 'chores') {
    // WHY names and stars (round 2 review: dots alone did not say 'for the kids'): one row per child, a star per job done
    const done = [4, 2, 3];
    const kids = ['mia', 'leo', 'ava'];
    const star = (cx: number, cy: number, on: boolean, k: string) => {
      const pts = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 9 : 21, a = (i * Math.PI) / 5 - Math.PI / 2; return `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`; }).join(' L ');
      return <path key={k} d={`M ${pts} Z`} fill={on ? L.accent : 'none'} stroke={on ? P.ink : L.edge} strokeWidth={on ? 2.6 : 2.4} strokeDasharray={on ? undefined : '5 5'} strokeLinejoin="round" />;
    };
    return (
      <g transform={`translate(${x - 150} ${y - 74})`}>
        {kids.map((n, r) => <text key={n} x={0} y={r * 66 + 11} fontFamily={DMSANS} fontWeight={800} fontSize={30} fill={L.fg}>{n}</text>)}
        {[0, 1, 2].map((r) => Array.from({ length: 4 }).map((_, c) => star(110 + c * 54, r * 66, c < done[r], `${r}${c}`)))}
      </g>
    );
  }
  if (what === 'quiz') {
    // WHY a real question with three big answers (round 2 review: a planet with a '?' was a pub-quiz poster)
    return (
      <g transform={`translate(${x} ${y})`}>
        <text x={0} y={-58} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={54} fill={L.fg} letterSpacing="-0.03em">7 × 8 = ?</text>
        {['54', '56', '64'].map((v, i) => {
          const bx = -138 + i * 96, right = i === 1;
          const pick = right ? lin(t % 3, 1.2, 1.4) : 0;
          return <g key={v}>
            <path d={rr(bx, -14, 84, 84, 16)} fill={pick > 0.5 ? L.accent : L.inset} {...ink(3)} />
            <text x={bx + 42} y={42} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={38} fill={pick > 0.5 ? L.canvas : L.fg}>{v}</text>
          </g>;
        })}
      </g>
    );
  }
  // shifts: one week, only the days she works lit, each labelled (round 2 review: 'just my shifts' must read in a glance)
  const on = [true, false, true, false, true, false, false];
  const day = ['m', 't', 'w', 't', 'f', 's', 's'];
  return (
    <g transform={`translate(${x} ${y})`}>
      {on.map((v, i) => <g key={i}>
        <path d={rr(-136 + i * 39, -70, 33, 150, 8)} fill={v ? L.accent : 'none'} stroke={v ? P.ink : L.edge} strokeWidth={v ? 2.6 : 2.2} strokeDasharray={v ? undefined : '5 5'} strokeLinejoin="round" />
        <text x={-136 + i * 39 + 16.5} y={-82} textAnchor="middle" fontFamily={DMSANS} fontWeight={800} fontSize={22} fill={v ? L.fg : L.muted}>{day[i]}</text>
      </g>)}
    </g>
  );
};
/** The one drawing on a made card, on its own (for a scene that pulls it out past the card's edges). */
export const MadeArt: React.FC<{ what: Made; look: Theme; t: number }> = ({ what, look, t }) => <MadeHero what={what} L={LOOK[look]} t={t} />;
export const MADE_HERO = { x: 200, y: 140 };

/** One side of a made card (its fill, drawing and line) in one look. */
const MadeFace: React.FC<{ look: Theme; what: Made; t: number; wipe: number; hero: number; name?: string; clip: string; beat?: number }> = ({ look, what, t, wipe, hero, name, clip, beat }) => {
  const L = LOOK[look];
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill={L.canvas} />
      {wipe > 0 && (
        <g clipPath={`url(#${clip})`}>
          <g transform={`translate(${HERO_C.x} ${HERO_C.y}) scale(${hero}) translate(${-HERO_C.x} ${-HERO_C.y})`}><MadeHero what={what} L={L} t={t} beat={beat} /></g>
          <text x={W / 2} y={LINE_Y} textAnchor="middle" fontFamily={L.font} fontWeight={L.font === DMSANS ? 900 : 800} fontSize={46} fill={L.fg} letterSpacing="-0.03em">{name ?? MADE_LINE[what]}</text>
        </g>
      )}
    </>
  );
};

let madeSeq = 0;
/** The one app's mark: a small purple quill in the card's top-left corner, on every copy.
 *  WHY (round 2 review: the copies read as 'everyone gets a different gadget'): one constant mark on every card, in
 *  every look, says these are all the same thing, each re-dressed by whoever asked. */
const Mark: React.FC<{ o: number }> = ({ o }) => (
  <g transform="translate(22 52) rotate(-8) scale(0.3)" opacity={o}>
    <path d="M 0 0 L 6 -16 L 12 -14 Z" fill={P.ink} />
    <path d="M 8 -15 C 18 -60 52 -118 96 -150 C 92 -118 70 -64 14 -12 Z" fill={P.purple} stroke={P.ink} strokeWidth={6} strokeLinejoin="round" />
  </g>
);
/** A card a person made by asking: same frame, tape and mark every time; `next` re-dresses it with a wipe from the left
 *  (a new look, a new thing, or just a new name), led by a thin ink edge so it reads as being redrawn.
 *  `sketch` (round 2 review: 'a tool that MAKES software' was lost when the inside simply wiped on): between a and b
 *  the inside is drawn as plum line art, top to bottom behind the nib, and its colour floods in at b.
 *  `nextInk`: the re-dress is drawn as line art first and its colour floods after (an ink redraw, not a card flip). */
export const MadeCard: React.FC<{
  look: Theme; what: Made; x: number; y: number; w: number; r?: number; s?: number;
  a?: number; draw?: number; contentAt?: number; name?: string; shadow?: number; o?: number;
  next?: { look: Theme; what: Made; p: number; name?: string; ink?: number };
  sketch?: { a: number; b: number };
  mark?: boolean; beat?: number;
}> = ({ look, what, x, y, w, r = 0, s = 1, a = -10, draw = 0.45, contentAt, name, shadow = 0, o = 1, next, sketch, mark = true, beat }) => {
  const t = useT();
  const [uid] = React.useState(() => ++madeSeq);
  if (t < a) return null;
  const k = (w / W) * s;
  const c = contentAt ?? a + draw * 0.8;
  // WHY the fill follows the nib closely (review: a blank card sat drawn for frames before anything arrived)
  const fill = lin(t, a + draw * 0.35, a + draw * 0.8);
  const wipe = sketch ? 1 : lin(t, c, c + 0.3, EASE_IN_OUT);
  const sk = sketch ? lin(t, sketch.a, sketch.b, (v) => v) : 1;
  const colour = sketch ? lin(t, sketch.b, sketch.b + 0.24, EASE_IN_OUT) : 1;
  const hero = sketch ? 1 + 0.08 * Math.sin(Math.min(1, Math.max(0, (t - sketch.b) / 0.4)) * Math.PI) : Math.min(1.06, pop(t, c + 0.06, 0.45));
  const id = `c-made-${uid}`;
  const rs = next ? Math.max(0, Math.min(1, next.p)) : 0;
  const nextColour = next?.ink == null ? 1 : next.ink;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${k}) translate(${-W / 2} ${-H / 2})`} opacity={o}>
      <defs>
        <clipPath id={id}><path d={rr(0, 0, W, H, R)} /></clipPath>
        <clipPath id={`${id}-w`}><rect x={0} y={0} width={W} height={H * wipe} /></clipPath>
        <clipPath id={`${id}-s`}><rect x={0} y={0} width={W} height={H * sk} /></clipPath>
        {next && <clipPath id={`${id}-r`}><rect x={0} y={0} width={W * rs} height={H} /></clipPath>}
        {/* WHY a threshold, not a second drawing: every made thing's own outlines become its pencil sketch, so the line
            art always matches the finished card exactly. Dark lines stay plum ink; every fill turns to paper. */}
        <filter id={`${id}-l`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0.165 0.165 0.995 0.995 0.995 0.995 0.995 0.995" />
            <feFuncG type="discrete" tableValues="0.102 0.102 0.992 0.992 0.992 0.992 0.992 0.992" />
            <feFuncB type="discrete" tableValues="0.208 0.208 0.973 0.973 0.973 0.973 0.973 0.973" />
          </feComponentTransfer>
        </filter>
      </defs>
      <path d={rr(6 + shadow * 10, 10 + shadow * 18, W, H, R)} fill={P.ink} opacity={(0.14 + shadow * 0.08) * fill} />
      <g clipPath={`url(#${id})`} opacity={fill}>
        {sketch && colour < 1 && <>
          <rect x={0} y={0} width={W} height={H} fill="#FFFDF8" />
          <g clipPath={`url(#${id}-s)`} filter={`url(#${id}-l)`}><MadeFace look={look} what={what} t={t} wipe={1} hero={1} name={name} clip={`${id}-w`} /></g>
        </>}
        <g opacity={colour}><MadeFace look={look} what={what} t={t} wipe={wipe} hero={hero} name={name} clip={`${id}-w`} beat={beat} /></g>
        {next && rs > 0 && <g clipPath={`url(#${id}-r)`}>
          {nextColour < 1 && <g filter={`url(#${id}-l)`}><MadeFace look={next.look} what={next.what} t={t} wipe={1} hero={1} name={next.name} clip={`${id}-w`} /></g>}
          <g opacity={nextColour}><MadeFace look={next.look} what={next.what} t={t} wipe={1} hero={1 + 0.06 * Math.sin(nextColour * Math.PI)} name={next.name} clip={`${id}-w`} /></g>
        </g>}
        {mark && <Mark o={sketch ? colour : 1} />}
      </g>
      {next && rs > 0 && rs < 1 && <path d={`M ${W * rs} 0 L ${W * rs} ${H}`} stroke={P.ink} strokeWidth={3.4} />}
      <Ink d={rr(0, 0, W, H, R)} a={a} b={a + draw} w={4} />
      <rect x={W / 2 - 50} y={-11} width={100} height={24} fill="#E8C9D8" opacity={0.8 * fill} transform={`rotate(-2 ${W / 2} 0)`} />
    </g>
  );
};
/** A made card's height for a given width. */
export const madeHeight = (w: number) => (w / W) * H;
/** The screen-space point on a made card's top edge where a reskin's leading edge is (for the quill to ride). */
export const madeEdge = (x: number, y: number, w: number, p: number) => ({ x: x - w / 2 + w * p, y: y - windowHeight(w) / 2 });
