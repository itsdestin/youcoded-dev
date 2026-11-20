// Take 1: the little apps in the town's windows.
// WHY a separate file: the main film reads as a timeline; these are just drawings. Each window is a
// stylised miniature of something one person asked for (a recipe, a kid's drawing game, a garden plan, a
// band's set list...), in its own colours, so a street of them reads as "everyone's copy is different and
// personal" at a glance. The reviewer found the old ones (bar charts, calendar grids, dashboards) read as
// business software; and the owner disliked loud app themes, so the colours below are a calm storybook
// family (soft paper tones, one rich accent each), not neon.
import React from 'react';

/** bg/panel/accent/ink colour the little app; wall/roof colour its whole house once it has turned. */
export type Theme = { bg: string; panel: string; accent: string; ink: string; glow: string; wall: string; roof: string };

// WHY these ten: each is distinct from its neighbours from across the town (warm and cool, light and two
// darker ones), and all share the same softness so the street looks like one illustrated book. Two are
// the brand's own purple themes so the family still reads as youcoded.
export const THEMES: Theme[] = [
  { bg: '#FBF5FD', panel: '#EADBF3', accent: '#9750AA', ink: '#2A1B36', glow: '#DCC0EC', wall: '#E7D6F1', roof: '#8E4FA3' }, // youcoded light
  { bg: '#FFF3E8', panel: '#FBD9BD', accent: '#D9693A', ink: '#47220F', glow: '#F7C49B', wall: '#F6D3B6', roof: '#C9603A' }, // apricot
  { bg: '#F1F7EE', panel: '#D3E7CC', accent: '#4E8A4F', ink: '#1E3320', glow: '#BFDDB4', wall: '#CFE3C6', roof: '#4F8A57' }, // sage
  { bg: '#FFF9E6', panel: '#F6E3A6', accent: '#C08B1C', ink: '#3D2D08', glow: '#F2D88E', wall: '#F3E2A9', roof: '#B98A2A' }, // butter
  { bg: '#EEF6FB', panel: '#CDE3F0', accent: '#3A7FA8', ink: '#122A38', glow: '#B4D6EA', wall: '#C9E0EE', roof: '#3F7DA3' }, // sky
  { bg: '#FDF1F4', panel: '#F5D0DB', accent: '#C24E74', ink: '#3E1222', glow: '#F0B6C8', wall: '#F2CCD8', roof: '#B9506F' }, // rose
  { bg: '#2A1A3B', panel: '#3C2853', accent: '#D29BE0', ink: '#F4EAF9', glow: '#B784C8', wall: '#5E4479', roof: '#A877BD' }, // youcoded dark
  { bg: '#F3F1FF', panel: '#D9D4FA', accent: '#5E52C7', ink: '#1C1747', glow: '#C3BCF5', wall: '#D6D0F6', roof: '#6157C2' }, // periwinkle
  { bg: '#FBF0EA', panel: '#EFCFC0', accent: '#A9543A', ink: '#3A1A10', glow: '#E7B9A4', wall: '#E9C6B5', roof: '#A35A42' }, // terracotta
  { bg: '#1E3434', panel: '#2B4A49', accent: '#7FD1BE', ink: '#E6F7F2', glow: '#6FBFAE', wall: '#4E7A74', roof: '#5FAE9C' }, // deep teal
];

/** The one look every window is forced into while the towers decide: a dull, identical panel.
 *  WHY lilac-greys, not true grey: the brand never uses pure grey; this still reads as "drained". */
export const GREY: Theme = { bg: '#B8AFC3', panel: '#A59BB2', accent: '#8F859D', ink: '#5A5066', glow: '#B8AFC3', wall: '#B8AFC3', roof: '#8F859D' };

// The personal things people ask for. Order matters: the film's named beats pick them by index.
export const APP = { recipe: 0, drawing: 1, garden: 2, setlist: 3, walk: 4, album: 5, knit: 6, books: 7 } as const;
export const LAYOUTS = 8;

type Props = { x: number; y: number; w: number; h: number; theme: Theme; layout: number; t: number; seed: number };

/** One small app filling a house window's opening. All measurements are fractions of the opening, so a
 *  layout reads the same in any window. `t` drives a little life inside (a line being ticked, a crayon
 *  moving, a song playing), so each app looks in use rather than printed. */
export const AppWin: React.FC<Props> = ({ x, y, w, h, theme: c, layout, t: time, seed }) => {
  const r = (fx: number, fy: number, fw: number, fh: number, fill: string, rr = 0.06, op = 1, k?: string) => (
    <rect key={k} x={x + fx * w} y={y + fy * h} width={Math.max(0, fw) * w} height={Math.max(0, fh) * h} rx={rr * h} fill={fill} opacity={op} />
  );
  const P = (fx: number, fy: number) => `${x + fx * w} ${y + fy * h}`;
  const bar = 0.16;
  const ph = time * 0.9 + seed * 1.7;                // each window on its own clock, so the town never pulses in unison
  const cyc = (ph % 3) / 3;
  const sw = Math.max(0.6, h * 0.03);                 // a line weight that scales with the window
  const body: React.ReactNode[] = [];
  switch (((layout % LAYOUTS) + LAYOUTS) % LAYOUTS) {
    case 0: { // a recipe: a dish picture, the title, ingredients being ticked off
      body.push(r(0.05, bar + 0.06, 0.4, 0.62, c.panel, 0.08, 1, 'pic'));
      // the bowl, with steam
      body.push(<path key="bowl" d={`M${P(0.1, 0.5)} Q${P(0.25, 0.78)} ${P(0.4, 0.5)} Z`} fill={c.accent} />);
      body.push(<rect key="rim" x={x + 0.08 * w} y={y + 0.48 * h} width={0.34 * w} height={0.035 * h} rx={0.02 * h} fill={c.ink} opacity={0.5} />);
      [0.19, 0.25, 0.31].forEach((fx, i) => body.push(<path key={`st${i}`} d={`M${P(fx, 0.43)} q${0.03 * w} ${-0.05 * h} 0 ${-0.1 * h} q${-0.03 * w} ${-0.05 * h} 0 ${-0.1 * h}`} fill="none" stroke={c.accent} strokeWidth={sw} strokeLinecap="round" opacity={0.5 + 0.3 * Math.sin(ph * 2 + i)} />));
      body.push(r(0.52, bar + 0.07, 0.38, 0.09, c.ink, 0.03, 0.75, 'title'));
      const done = Math.floor(cyc * 4);
      [0, 1, 2, 3].forEach((i) => {
        const fy = 0.42 + i * 0.13;
        body.push(<circle key={`ck${i}`} cx={x + 0.56 * w} cy={y + (fy + 0.035) * h} r={0.035 * h} fill={i < done ? c.accent : 'none'} stroke={c.accent} strokeWidth={sw * 0.8} />);
        body.push(r(0.62, fy, [0.28, 0.22, 0.3, 0.18][i], 0.07, c.ink, 0.03, i < done ? 0.18 : 0.38, `il${i}`));
      });
      break;
    }
    case 1: { // a kid's drawing game: a canvas with a crayon sun and house, colour pots below
      body.push(r(0.06, bar + 0.06, 0.88, 0.56, '#FFFFFF', 0.05, 1, 'cv'));
      body.push(<circle key="sun" cx={x + 0.24 * w} cy={y + 0.42 * h} r={0.08 * h} fill="none" stroke="#E7A32B" strokeWidth={sw * 1.4} />);
      [0, 1, 2, 3, 4, 5].forEach((i) => { const a = i * 1.05; body.push(<line key={`ray${i}`} x1={x + 0.24 * w + Math.cos(a) * 0.12 * h} y1={y + 0.42 * h + Math.sin(a) * 0.12 * h} x2={x + 0.24 * w + Math.cos(a) * 0.17 * h} y2={y + 0.42 * h + Math.sin(a) * 0.17 * h} stroke="#E7A32B" strokeWidth={sw} strokeLinecap="round" />); });
      body.push(<path key="hs" d={`M${P(0.55, 0.7)} L${P(0.55, 0.5)} L${P(0.66, 0.38)} L${P(0.77, 0.5)} L${P(0.77, 0.7)}`} fill="none" stroke={c.accent} strokeWidth={sw * 1.3} strokeLinejoin="round" />);
      // the crayon line still being drawn: grass that grows across the canvas
      const g = Math.min(1, cyc * 1.4);
      body.push(<path key="grass" d={`M${P(0.1, 0.72)} Q${P(0.1 + 0.4 * g, 0.66)} ${P(0.1 + 0.8 * g, 0.72)}`} fill="none" stroke="#5FA36A" strokeWidth={sw * 1.4} strokeLinecap="round" />);
      ['#E25D5D', '#E7A32B', '#5FA36A', '#4F86C6', c.accent].forEach((f, i) => body.push(<circle key={`pot${i}`} cx={x + (0.16 + i * 0.17) * w} cy={y + 0.88 * h} r={0.055 * h} fill={f} />));
      break;
    }
    case 2: { // a garden plan: beds in a grid, sprouts in some, today's bed highlighted
      const hi = Math.floor(ph % 6);
      [0, 1, 2].forEach((i) => [0, 1].forEach((j) => {
        const n = i + j * 3; const fx = 0.07 + i * 0.3, fy = bar + 0.08 + j * 0.38;
        body.push(r(fx, fy, 0.26, 0.32, n === hi ? c.accent : c.panel, 0.06, n === hi ? 0.35 : 1, `bed${n}`));
        if (n % 2 === 0 || n === 5) {
          const cx = x + (fx + 0.13) * w, cy = y + (fy + 0.24) * h;
          body.push(<g key={`sp${n}`} stroke={c.accent} strokeWidth={sw} strokeLinecap="round" fill={c.accent}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - 0.12 * h} />
            <ellipse cx={cx - 0.035 * w} cy={cy - 0.1 * h} rx={0.035 * w} ry={0.03 * h} stroke="none" />
            <ellipse cx={cx + 0.035 * w} cy={cy - 0.13 * h} rx={0.035 * w} ry={0.03 * h} stroke="none" />
          </g>);
        }
      }));
      break;
    }
    case 3: { // a band's set list: numbered songs, the playing one marked and its bar filling
      const now = Math.floor(ph % 4);
      [0, 1, 2, 3].forEach((i) => {
        const fy = bar + 0.08 + i * 0.19;
        if (i === now) body.push(r(0.04, fy - 0.03, 0.92, 0.17, c.panel, 0.05, 1, `hl${i}`));
        body.push(<text key={`n${i}`} x={x + 0.1 * w} y={y + (fy + 0.1) * h} fontSize={0.12 * h} fontFamily="DM Sans, sans-serif" fontWeight={700} fill={c.accent}>{i + 1}</text>);
        body.push(r(0.22, fy + 0.025, [0.5, 0.38, 0.56, 0.44][i], 0.07, c.ink, 0.03, i === now ? 0.75 : 0.35, `sl${i}`));
        if (i === now) body.push(<path key="play" d={`M${P(0.84, fy + 0.01)} L${P(0.84, fy + 0.12)} L${P(0.9, fy + 0.065)} Z`} fill={c.accent} />);
      });
      // a music note in the corner of the title strip's row
      body.push(<g key="note" fill={c.accent}><ellipse cx={x + 0.9 * w} cy={y + 0.93 * h} rx={0.035 * w} ry={0.03 * h} /></g>);
      break;
    }
    case 4: { // a dog-walk route: a winding path with today's walk being traced, a paw at the end
      body.push(r(0.05, bar + 0.05, 0.9, 0.72, c.panel, 0.06, 1, 'map'));
      const d = `M${P(0.12, 0.8)} C${P(0.3, 0.3)} ${P(0.45, 0.95)} ${P(0.6, 0.5)} S${P(0.8, 0.3)} ${P(0.88, 0.35)}`;
      body.push(<path key="r0" d={d} fill="none" stroke={c.ink} strokeOpacity={0.25} strokeWidth={sw * 1.4} strokeDasharray={`${sw * 2} ${sw * 2}`} />);
      body.push(<path key="r1" d={d} fill="none" stroke={c.accent} strokeWidth={sw * 1.6} strokeLinecap="round" pathLength={1} strokeDasharray={`${Math.min(1, cyc * 1.3)} 1`} />);
      const px = x + 0.88 * w, py = y + 0.35 * h, pr = 0.05 * h;
      body.push(<g key="paw" fill={c.accent}><circle cx={px} cy={py + pr * 0.4} r={pr} />{[-1, -0.35, 0.35, 1].map((k, i) => <circle key={i} cx={px + k * pr * 1.1} cy={py - pr * (i % 3 === 0 ? 0.6 : 1.1)} r={pr * 0.42} />)}</g>);
      break;
    }
    case 5: { // a family photo album: four pictures, one of them being added
      [[0.07, bar + 0.06], [0.52, bar + 0.06], [0.07, 0.6], [0.52, 0.6]].forEach(([fx, fy], i) => {
        const o = i < 3 ? 1 : Math.min(1, cyc * 2);
        body.push(<g key={`ph${i}`} opacity={o}>
          {r(fx, fy, 0.41, 0.33, c.panel, 0.04)}
          <path d={`M${P(fx + 0.04, fy + 0.29)} L${P(fx + 0.15, fy + 0.14)} L${P(fx + 0.24, fy + 0.24)} L${P(fx + 0.3, fy + 0.18)} L${P(fx + 0.37, fy + 0.29)} Z`} fill={c.accent} opacity={0.8} />
          <circle cx={x + (fx + 0.31) * w} cy={y + (fy + 0.09) * h} r={0.04 * h} fill={c.accent} opacity={0.6} />
        </g>);
      });
      break;
    }
    case 6: { // a knitting pattern: a grid of stitches making a heart, the current row highlighted
      const heart = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
      const row = Math.floor(ph * 1.5) % heart.length;
      heart.forEach((line, j) => line.split('').forEach((ch, i) => {
        body.push(r(0.14 + i * 0.105, bar + 0.07 + j * 0.125, 0.085, 0.1, ch === '1' ? c.accent : c.panel, 0.02, j === row ? 1 : 0.85, `k${i}-${j}`));
      }));
      break;
    }
    default: { // a reading list: book spines on a shelf, one being pulled out
      const pull = Math.sin(ph * 1.2) * 0.5 + 0.5;
      [0.14, 0.11, 0.16, 0.12, 0.15, 0.1].forEach((bw, i) => {
        const fx = 0.08 + [0, 0.15, 0.27, 0.44, 0.57, 0.73][i];
        const tall = [0.52, 0.6, 0.48, 0.56, 0.62, 0.5][i];
        const lift = i === 3 ? pull * 0.1 : 0;
        body.push(r(fx, 0.86 - tall - lift, bw, tall, i % 2 ? c.panel : c.accent, 0.02, i % 2 ? 1 : 0.85, `bk${i}`));
      });
      body.push(r(0.05, 0.86, 0.9, 0.04, c.ink, 0, 0.4, 'shelf'));
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.08 * h} fill={c.bg} />
      {body}
      {/* title strip with one accent dot: the cue that says "this is an app window" */}
      <rect x={x} y={y} width={w} height={bar * h} fill={c.panel} />
      <circle cx={x + 0.07 * w} cy={y + bar * h * 0.5} r={bar * h * 0.24} fill={c.accent} />
    </g>
  );
};

/** The dull panel the towers force into every window: the same title strip and the same two grey lines
 *  everywhere. WHY so plain: it must read as "identical and lifeless" next to the personal apps. */
export const GreyWin: React.FC<{ x: number; y: number; w: number; h: number }> = ({ x, y, w, h }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={0.08 * h} fill={GREY.bg} />
    <rect x={x} y={y} width={w} height={0.16 * h} fill={GREY.panel} />
    <rect x={x + 0.1 * w} y={y + 0.34 * h} width={0.8 * w} height={0.14 * h} rx={0.03 * h} fill={GREY.panel} />
    <rect x={x + 0.1 * w} y={y + 0.58 * h} width={0.55 * w} height={0.09 * h} rx={0.03 * h} fill={GREY.accent} opacity={0.6} />
    <rect x={x + 0.1 * w} y={y + 0.74 * h} width={0.4 * w} height={0.09 * h} rx={0.03 * h} fill={GREY.accent} opacity={0.45} />
  </g>
);

/** The thing a villager asks for, drawn as a tiny picture inside a speech bubble. Centred on 0,0, ~40 units. */
export const Pictogram: React.FC<{ layout: number; c: Theme }> = ({ layout, c }) => {
  const sw = 2.4;
  switch (layout) {
    case APP.recipe: return (<g>
      <path d="M-17 0 Q0 22 17 0 Z" fill={c.accent} stroke="#21152C" strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={-19} y={-2} width={38} height={4} rx={2} fill="#21152C" />
      {[-7, 0, 7].map((dx) => <path key={dx} d={`M${dx} -6 q4 -5 0 -9 q-4 -5 0 -9`} fill="none" stroke={c.accent} strokeWidth={sw} strokeLinecap="round" />)}
    </g>);
    case APP.drawing: return (<g>
      <circle cx={-6} cy={-4} r={9} fill="none" stroke="#E7A32B" strokeWidth={sw + 0.6} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4; return <line key={i} x1={-6 + Math.cos(a) * 12} y1={-4 + Math.sin(a) * 12} x2={-6 + Math.cos(a) * 16} y2={-4 + Math.sin(a) * 16} stroke="#E7A32B" strokeWidth={sw} strokeLinecap="round" />; })}
      <g transform="translate(12 8) rotate(-40)"><rect x={-3.5} y={-14} width={7} height={22} rx={1.5} fill={c.accent} stroke="#21152C" strokeWidth={1.4} /><path d="M-3.5 8 L0 14 L3.5 8 Z" fill="#21152C" /></g>
    </g>);
    case APP.garden: return (<g>
      <path d="M-11 4 L11 4 L8 18 L-8 18 Z" fill="#C9603A" stroke="#21152C" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M0 4 L0 -12" stroke="#4E8A4F" strokeWidth={sw + 0.4} strokeLinecap="round" />
      <ellipse cx={-7} cy={-9} rx={8} ry={4.5} transform="rotate(-25 -7 -9)" fill="#4E8A4F" />
      <ellipse cx={7} cy={-14} rx={8} ry={4.5} transform="rotate(25 7 -14)" fill="#4E8A4F" />
    </g>);
    default: return (<g fill={c.accent}>
      <path d="M-6 10 V-14 L14 -18 V6" fill="none" stroke={c.accent} strokeWidth={sw + 0.6} strokeLinejoin="round" />
      <ellipse cx={-10} cy={10} rx={6.5} ry={5} />
      <ellipse cx={10} cy={6} rx={6.5} ry={5} />
    </g>);
  }
};
