// Take 1C: the little app windows people make by asking, drawn in the book's own line art.
// WHY each one is a different THEME, not a different tint: the owner disliked the old windows, which shared one
// cream body and one layout and differed only by a pastel title bar. The film's one claim about youcoded is
// that everyone's copy looks and works differently, so each window here has its own colours, its own type and
// its own layout: a night sky, a plant journal, a loud record poster, a kitchen card, a cat's day, a board
// game. They are storybook drawings of things a person made by asking, never the app's real interface
// (brand guide section 8), and nothing in them is a feature that ships in the download.
import React from 'react';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { DMSANS, EASE_IN_OUT, OUTFIT } from '../brand';
import { Ink, lin, P, pop, useT } from './take1c-ink';

// WHY a serif only here: text inside a scene is exempt from the three-font rule (brand section 6), and a
// botanical journal set in the brand's sans would look like every other window
const FRAUNCES = loadFraunces('italic', { weights: ['600'], subsets: ['latin'] }).fontFamily;

/** A rounded rectangle as a path that starts at the top-left corner and runs clockwise (so it "draws" round). */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;

export type Theme = 'night' | 'botanical' | 'poster' | 'kitchen' | 'cat' | 'board';
export const THEMES: Theme[] = ['poster', 'botanical', 'night', 'cat', 'kitchen', 'board'];
/** Each theme's own colours. `page` is a light tint of it, for a whole page that belongs to that person. */
export const LOOK: Record<Theme, { body: string; bar: string; ink: string; page: string; accent: string }> = {
  night: { body: '#252B5E', bar: '#161A3F', ink: '#F4E9CF', page: '#CDD0EC', accent: '#F4D58A' },
  botanical: { body: '#DCE6CF', bar: '#AFC39C', ink: '#2D4A2D', page: '#E3ECD9', accent: '#5E8A55' },
  poster: { body: '#EC5DA6', bar: '#1C1220', ink: '#1C1220', page: '#F7CBE1', accent: '#1C1220' },
  kitchen: { body: '#F8E8CF', bar: '#D6603A', ink: '#4A2A1C', page: '#F7E4C8', accent: '#D6603A' },
  cat: { body: '#FAD9BE', bar: '#E58A3E', ink: '#5A2E14', page: '#FADDC8', accent: '#E58A3E' },
  board: { body: '#2F6B4F', bar: '#1E4935', ink: '#F3EBD8', page: '#CFE2D2', accent: '#D9573B' },
};

const W = 400, H = 330, BAR = 34, R = 18;   // every window is designed at 400×330 and scaled to fit

// ---------- what each one is ----------
// Stars on the night window: fixed positions, so they never flicker between frames.
const STARS: [number, number, number][] = [[214, 60, 3], [246, 92, 2], [286, 54, 2.4], [330, 80, 3.4], [370, 58, 2], [262, 128, 2], [362, 128, 2.6],
  [30, 60, 2], [58, 92, 2.6], [190, 104, 2], [24, 140, 2.2], [318, 150, 2]];
const star4 = (x: number, y: number, r: number) => `M ${x} ${y - r * 2} L ${x + r * 0.5} ${y - r * 0.5} L ${x + r * 2} ${y} L ${x + r * 0.5} ${y + r * 0.5} L ${x} ${y + r * 2} L ${x - r * 0.5} ${y + r * 0.5} L ${x - r * 2} ${y} L ${x - r * 0.5} ${y - r * 0.5} Z`;

const Night: React.FC<{ hero: number }> = ({ hero }) => {
  const L = LOOK.night;
  return (
    <>
      {STARS.map(([x, y, r], i) => (i % 3 === 0 ? <path key={i} d={star4(x, y, r)} fill={L.ink} /> : <circle key={i} cx={x} cy={y} r={r * 0.7} fill={L.ink} opacity={0.75} />))}
      {/* the big moon, with two craters */}
      <g transform={`translate(112 150) scale(${hero})`}>
        <circle r={72} fill={L.ink} />
        <circle cx={-22} cy={-16} r={14} fill="#E3D6B8" /><circle cx={24} cy={22} r={10} fill="#E3D6B8" /><circle cx={18} cy={-30} r={6} fill="#E3D6B8" />
      </g>
      <text x={212} y={180} fontFamily={OUTFIT} fontWeight={600} fontSize={40} fill={L.ink} letterSpacing="-0.01em">clear</text>
      <text x={212} y={220} fontFamily={OUTFIT} fontWeight={600} fontSize={40} fill={L.accent} letterSpacing="-0.01em">tonight</text>
      <text x={214} y={246} fontFamily={OUTFIT} fontWeight={400} fontSize={17} fill="#B9BFE8">saturn rises 9:40</text>
      {/* the hills, and the telescope on them */}
      <path d={`M 0 ${H - 52} C 70 ${H - 82} 140 ${H - 46} 220 ${H - 66} C 300 ${H - 86} 350 ${H - 58} ${W} ${H - 72} L ${W} ${H} L 0 ${H} Z`} fill="#161A3F" />
      <g transform={`translate(56 ${H - 52})`} stroke={L.ink} strokeWidth={4} strokeLinecap="round" fill="none">
        <path d="M -16 -18 L 26 -40" strokeWidth={11} /><path d="M 0 -26 L -14 0 M 0 -26 L 0 0 M 0 -26 L 14 0" />
      </g>
    </>
  );
};

const Botanical: React.FC<{ hero: number; compact?: boolean }> = ({ hero, compact }) => {
  const L = LOOK.botanical;
  const leaf = (rot: number, len: number, k: number) => (
    <g key={k} transform={`rotate(${rot}) scale(${hero})`}>
      <path d={`M 0 0 C ${len * 0.2} ${-len * 0.25} ${len * 0.15} ${-len * 0.8} 0 ${-len} C ${-len * 0.55} ${-len * 0.8} ${-len * 0.6} ${-len * 0.25} 0 0 Z`} fill={L.accent} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={`M 0 -4 L 0 ${-len * 0.9} M 0 ${-len * 0.35} L ${-len * 0.3} ${-len * 0.48} M 0 ${-len * 0.6} L ${-len * 0.3} ${-len * 0.74}`} stroke="#3F6A3B" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <>
      {/* one big plant, drawn whole: the window is about this plant */}
      <g transform="translate(112 238)">
        {[[-40, 120], [-8, 150], [28, 128], [-70, 92], [56, 96]].map(([r, l], k) => leaf(r, l, k))}
      </g>
      <path d="M 66 236 L 158 236 L 148 300 L 76 300 Z" fill="#C8724E" stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
      <path d="M 60 228 L 164 228 L 164 244 L 60 244 Z" fill="#B5603E" stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
      <text x={204} y={102} fontFamily={FRAUNCES} fontStyle="italic" fontWeight={600} fontSize={40} fill={L.ink}>Monstera</text>
      <path d="M 206 116 L 370 116" stroke={L.ink} strokeWidth={1.6} opacity={0.5} />
      {/* when it next needs water, as a drop and a bar */}
      <path d="M 214 140 C 220 150 226 156 226 162 A 12 12 0 0 1 202 162 C 202 156 208 150 214 140 Z" fill="#7FA9C9" stroke={P.ink} strokeWidth={2} />
      <text x={236} y={166} fontFamily={DMSANS} fontWeight={700} fontSize={19} fill={L.ink}>water in 2 days</text>
      <path d={rr(206, 182, 160, 14, 7)} fill="#F4F7EE" stroke={P.ink} strokeWidth={2} />
      <path d={rr(206, 182, 160 * 0.7, 14, 7)} fill="#7FA9C9" />
      {!compact && (
        <>
          <text x={206} y={236} fontFamily={DMSANS} fontWeight={500} fontSize={17} fill={L.ink} opacity={0.8}>basil · tomorrow</text>
          <text x={206} y={262} fontFamily={DMSANS} fontWeight={500} fontSize={17} fill={L.ink} opacity={0.8}>fern · friday</text>
        </>
      )}
    </>
  );
};

const Poster: React.FC<{ hero: number; t: number }> = ({ hero, t }) => {
  const L = LOOK.poster;
  return (
    <>
      {/* a giant record, half off the edge, turning */}
      <g transform={`translate(352 196) scale(${hero}) rotate(${t * 40})`}>
        <circle r={128} fill={L.ink} />
        {[104, 86, 68].map((r) => <circle key={r} r={r} fill="none" stroke="#3A2C40" strokeWidth={2} />)}
        <circle r={40} fill="#FFE0EF" /><path d="M 0 -40 A 40 40 0 0 1 40 0 L 0 0 Z" fill="#EC5DA6" /><circle r={5} fill={L.ink} />
      </g>
      <text x={22} y={104} fontFamily={DMSANS} fontWeight={900} fontSize={60} fill={L.ink} letterSpacing="-0.05em">turn it</text>
      <text x={22} y={162} fontFamily={DMSANS} fontWeight={900} fontSize={60} fill="#FFF3F9" letterSpacing="-0.05em">up.</text>
      <text x={24} y={232} fontFamily={DMSANS} fontWeight={700} fontSize={18} fill={L.ink}>side b · track 4</text>
      <path d="M 24 266 L 200 266" stroke={L.ink} strokeWidth={6} strokeLinecap="round" />
      <circle cx={24 + 176 * ((t * 0.08) % 1)} cy={266} r={10} fill="#FFF3F9" stroke={L.ink} strokeWidth={3} />
    </>
  );
};

const Kitchen: React.FC<{ hero: number; t: number }> = ({ hero, t }) => {
  const L = LOOK.kitchen;
  const rows: [string, boolean][] = [['onions', true], ['garlic', true], ['simmer 20 min', false]];
  return (
    <>
      {/* a gingham tablecloth along the bottom */}
      {Array.from({ length: 20 }).map((_, i) => <rect key={i} x={i * 20} y={H - 54} width={20} height={20} fill={i % 2 ? '#F2B9A6' : '#FBEFE4'} />)}
      {Array.from({ length: 20 }).map((_, i) => <rect key={`b${i}`} x={i * 20} y={H - 34} width={20} height={20} fill={i % 2 ? '#FBEFE4' : '#F2B9A6'} />)}
      {/* the pot, with steam that keeps rising */}
      <g transform={`translate(106 ${H - 70}) scale(${hero})`}>
        {[-26, 0, 26].map((sx, i) => {
          const ph = (t * 0.9 + i * 0.33) % 1;
          return <path key={i} d={`M ${sx} -96 C ${sx - 12} -114 ${sx + 12} -124 ${sx} -142 C ${sx - 12} -158 ${sx + 10} -168 ${sx + 2} -184`} stroke={L.ink} strokeWidth={3.4} fill="none" strokeLinecap="round"
            opacity={0.55 * Math.sin(ph * Math.PI)} transform={`translate(0 ${-ph * 16})`} />;
        })}
        <path d="M -70 -86 L 70 -86 L 62 0 Q 0 10 -62 0 Z" fill={L.accent} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d="M -80 -86 L 80 -86 M -86 -66 L -70 -66 M 70 -66 L 86 -66" stroke={P.ink} strokeWidth={6} strokeLinecap="round" />
        <path d="M -40 -92 Q 0 -112 40 -92 Z" fill="#E98A64" stroke={P.ink} strokeWidth={3} /><circle cx={0} cy={-106} r={6} fill={P.ink} />
      </g>
      <text x={206} y={86} fontFamily={DMSANS} fontWeight={900} fontSize={30} fill={L.accent} letterSpacing="-0.04em">sunday soup</text>
      {rows.map(([s, done], i) => (
        <g key={s} transform={`translate(208 ${118 + i * 40})`}>
          <rect x={0} y={-18} width={24} height={24} rx={5} fill="#FFF8EE" stroke={L.ink} strokeWidth={2.6} />
          {done && <path d="M 4 -6 L 10 1 L 21 -14" stroke={L.accent} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <text x={36} y={2} fontFamily={DMSANS} fontWeight={700} fontSize={20} fill={L.ink} opacity={done ? 0.55 : 1}
            textDecoration={done ? 'line-through' : undefined}>{s}</text>
        </g>
      ))}
    </>
  );
};

const Cat: React.FC<{ hero: number; t: number }> = ({ hero, t }) => {
  const L = LOOK.cat;
  const paw = (x: number, y: number, r: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${r})`} fill="#F2BE97">
      <ellipse cx={0} cy={4} rx={7} ry={6} /><circle cx={-7} cy={-5} r={3} /><circle cx={0} cy={-8} r={3} /><circle cx={7} cy={-5} r={3} />
    </g>
  );
  return (
    <>
      {[[230, 270, 20], [290, 300, -10], [350, 268, 15], [372, 52, -20], [26, 300, 10]].map(([x, y, r]) => paw(x, y, r))}
      {/* the cat, in a round frame */}
      <g transform={`translate(112 168) scale(${hero})`}>
        <circle r={92} fill="#FFF4EA" stroke={L.accent} strokeWidth={8} />
        <path d="M -52 30 C -60 -20 -50 -44 -40 -50 L -46 -86 L -14 -58 C -4 -62 4 -62 14 -58 L 46 -86 L 40 -50 C 50 -44 60 -20 52 30 Q 0 62 -52 30 Z" fill={L.accent} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d="M -8 -56 L -4 -36 M 8 -56 L 4 -36 M 0 -58 L 0 -38 M -50 -6 L -32 -2 M 50 -6 L 32 -2" stroke="#B8611F" strokeWidth={4} strokeLinecap="round" />
        {/* WHY a slow blink: the only moving thing in the frame, so it reads as her cat, alive */}
        <g transform={`translate(0 -8) scale(1 ${Math.abs(Math.sin(t * 0.9)) > 0.97 ? 0.15 : 1})`}>
          <ellipse cx={-20} cy={0} rx={7} ry={9} fill={P.ink} /><ellipse cx={20} cy={0} rx={7} ry={9} fill={P.ink} />
        </g>
        <path d="M -6 12 L 6 12 L 0 18 Z" fill="#E97A8F" /><path d="M 0 18 Q -8 26 -14 22 M 0 18 Q 8 26 14 22" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </g>
      <text x={220} y={110} fontFamily={DMSANS} fontWeight={900} fontSize={44} fill={L.ink} letterSpacing="-0.05em">biscuit</text>
      <text x={222} y={148} fontFamily={DMSANS} fontWeight={700} fontSize={19} fill={L.ink}>fed 8:02 am</text>
      <path d="M 344 132 L 352 142 L 368 122" stroke={L.accent} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x={222} y={180} fontFamily={DMSANS} fontWeight={500} fontSize={18} fill={L.ink} opacity={0.75}>next: 6 pm</text>
      {/* her bowl */}
      <g transform="translate(300 252)">
        <path d="M -54 -10 L 54 -10 Q 48 26 0 26 Q -48 26 -54 -10 Z" fill={L.accent} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d="M -40 -12 Q -20 -28 0 -16 Q 20 -30 40 -12" fill="#B8611F" stroke={P.ink} strokeWidth={2.4} />
        <text x={0} y={14} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={16} fill="#FFF4EA">B</text>
      </g>
    </>
  );
};

const Board: React.FC<{ hero: number; t: number }> = ({ hero, t }) => {
  const L = LOOK.board;
  const s = 44;
  const pieces: [number, number, string][] = [[0, 0, L.accent], [2, 0, L.accent], [1, 1, L.accent], [3, 1, L.accent], [0, 2, L.ink], [2, 2, L.ink], [1, 3, L.ink]];
  const slide = lin(t % 4, 1.2, 1.7, EASE_IN_OUT);   // one piece hops forward, now and then
  return (
    <>
      <g transform={`translate(${28 + 2 * s} ${70 + 2 * s}) scale(${hero}) translate(${-2 * s} ${-2 * s})`}>
        <rect x={-8} y={-8} width={4 * s + 16} height={4 * s + 16} rx={8} fill="#7A4B2C" stroke={P.ink} strokeWidth={3} />
        {Array.from({ length: 16 }).map((_, i) => <rect key={i} x={(i % 4) * s} y={Math.floor(i / 4) * s} width={s} height={s} fill={(i + Math.floor(i / 4)) % 2 ? '#1E4935' : '#E9DFC4'} />)}
        {pieces.map(([cx, cy, c], i) => {
          const hop = i === 5 ? slide : 0;
          return <g key={i} transform={`translate(${(cx + 0.5 + hop) * s} ${(cy + 0.5 - hop) * s - Math.sin(hop * Math.PI) * 14})`}>
            <circle r={16} fill={c} stroke={P.ink} strokeWidth={2.6} /><circle r={9} fill="none" stroke={P.ink} strokeWidth={1.4} opacity={0.5} />
          </g>;
        })}
      </g>
      <text x={250} y={104} fontFamily={DMSANS} fontWeight={900} fontSize={34} fill={L.ink} letterSpacing="-0.04em">you 3</text>
      <text x={250} y={146} fontFamily={DMSANS} fontWeight={900} fontSize={34} fill={L.accent} letterSpacing="-0.04em">jo 2</text>
      <text x={252} y={186} fontFamily={DMSANS} fontWeight={500} fontSize={18} fill={L.ink} opacity={0.8}>your move</text>
    </>
  );
};

// ---------- the window ----------
type WinProps = {
  theme: Theme;
  x: number; y: number; w: number;                // centre and width, in page units (height follows: 400×330)
  a?: number;                                      // when its outline starts to draw (default: long done)
  draw?: number;                                   // how long the outline takes (the quill drawing it)
  contentAt?: number;                              // when the inside arrives
  request?: { text: string; at: number; dur: number };
  r?: number; s?: number;                          // tilt and extra scale, for windows in flight
  compact?: boolean;                               // fewer lines of small text, for the smallest sizes
};
/** One app window in its own theme. Draws its outline, floods its colour, then its inside lands. */
export const ThemedWindow: React.FC<WinProps> = ({ theme, x, y, w, a = -10, draw = 0.5, contentAt, request, r = 0, s = 1, compact }) => {
  const t = useT();
  const L = LOOK[theme];
  const k = (w / W) * s;
  const c = contentAt ?? a + draw * 0.8;
  const fill = lin(t, a + draw * 0.45, a + draw * 0.9);
  if (t < a) return null;
  // WHY the inside wipes down and its hero pops: it reads as the window filling in, never as loose strokes
  const wipe = lin(t, c, c + 0.45, EASE_IN_OUT);
  const hero = Math.min(1.08, pop(t, c + 0.15, 0.5));
  const id = `c-win-${theme}-${Math.round(x)}-${Math.round(y)}-${Math.round(w)}`;
  const typed = request ? Math.floor(request.text.length * lin(t, request.at, request.at + request.dur, (v) => v)) : 0;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${k}) translate(${-W / 2} ${-H / 2})`}>
      <defs>
        <clipPath id={id}><path d={rr(0, 0, W, H, R)} /></clipPath>
        <clipPath id={`${id}-w`}><rect x={0} y={BAR} width={W} height={(H - BAR) * wipe} /></clipPath>
      </defs>
      {/* a soft drop shadow so the window sits on the page */}
      <path d={rr(6, 10, W, H, R)} fill={P.ink} opacity={0.12 * fill} />
      <g clipPath={`url(#${id})`} opacity={fill}>
        <rect x={0} y={0} width={W} height={H} fill={L.body} />
        <rect x={0} y={0} width={W} height={BAR} fill={L.bar} />
        {[0, 1, 2].map((i) => <circle key={i} cx={22 + i * 18} cy={BAR / 2} r={5} fill={theme === 'poster' ? '#EC5DA6' : L.body} opacity={0.9} />)}
        {wipe > 0 && (
          <g clipPath={`url(#${id}-w)`}>
            {theme === 'night' && <Night hero={hero} />}
            {theme === 'botanical' && <Botanical hero={hero} compact={compact} />}
            {theme === 'poster' && <Poster hero={hero} t={t} />}
            {theme === 'kitchen' && <Kitchen hero={hero} t={t} />}
            {theme === 'cat' && <Cat hero={hero} t={t} />}
            {theme === 'board' && <Board hero={hero} t={t} />}
          </g>
        )}
      </g>
      <Ink d={`M 0 ${BAR} L ${W} ${BAR}`} a={a + draw * 0.7} b={a + draw} w={2.6} />
      <Ink d={rr(0, 0, W, H, R)} a={a} b={a + draw} w={3.4} />
      {request && t > request.at - 0.25 && (
        // what the person asked, in a speech bubble hanging off the foot of the window
        <g opacity={lin(t, request.at - 0.25, request.at)}>
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
