// Take 1: the tiny "youcodeds" that replace the town's identical windows.
// WHY a separate file: the main film reads as a timeline; these are just drawings. Each window is a
// stylised miniature of an app window (title strip, side panel, content) in its own colour theme, so a
// town of them reads as "everyone's is different" without pretending to be the real interface.
import React from 'react';

/** bg/panel/accent/ink colour the little app; wall/roof colour its whole house once morning comes. */
export type Theme = { bg: string; panel: string; accent: string; ink: string; glow: string; wall: string; roof: string };

// WHY these twelve: distinct at a glance from across the town (light and dark, warm and cool), each a
// believable app look. Two are the brand's own purple themes so the family still reads as youcoded.
// The house colours are the same family softened, so by morning each house wears its own app's look.
export const THEMES: Theme[] = [
  { bg: '#F7F0FB', panel: '#E6D3F1', accent: '#9750AA', ink: '#21152C', glow: '#D9B6EA', wall: '#E9D9F3', roof: '#9750AA' }, // youcoded light
  { bg: '#FFE7D1', panel: '#FFC9A0', accent: '#E8572C', ink: '#4A1E0E', glow: '#FFB27A', wall: '#FFD9BC', roof: '#E0643C' }, // sunset
  { bg: '#1B1033', panel: '#2E1B52', accent: '#FF4FA3', ink: '#F7D9FF', glow: '#FF6FB5', wall: '#4B3478', roof: '#E9559F' }, // rainy neon
  { bg: '#E3F6EA', panel: '#BFE8CF', accent: '#24935F', ink: '#0F3322', glow: '#9EE3BC', wall: '#CDEEDA', roof: '#3A9C6C' }, // mint
  { bg: '#FBF1D4', panel: '#F2DC9C', accent: '#C08A12', ink: '#3A2A06', glow: '#F5D27A', wall: '#F7E7B6', roof: '#C99A2E' }, // honey
  { bg: '#DCEFF8', panel: '#B5DCEE', accent: '#1E86B0', ink: '#0B2C3A', glow: '#93D2EE', wall: '#C8E6F3', roof: '#3A8FB4' }, // sea
  { bg: '#FCE6EE', panel: '#F6C3D5', accent: '#CF3F74', ink: '#3E0F20', glow: '#F7A9C6', wall: '#F8D3E0', roof: '#CC4D7C' }, // rose
  { bg: '#26123A', panel: '#3A1F57', accent: '#C387D3', ink: '#F3EAF9', glow: '#C387D3', wall: '#5B3E78', roof: '#B57BC8' }, // youcoded dark
  { bg: '#122A20', panel: '#1D4333', accent: '#5FE0A0', ink: '#DFFBEA', glow: '#4FD493', wall: '#3E6B55', roof: '#58C690' }, // forest night
  { bg: '#FFF6C2', panel: '#FFE97A', accent: '#D99A00', ink: '#3B2C00', glow: '#FFE36B', wall: '#FFF1A8', roof: '#D9A21E' }, // lemon
  { bg: '#E9E6FF', panel: '#CBC4FF', accent: '#5B4BE0', ink: '#1B1550', glow: '#B4ABFF', wall: '#DAD5FF', roof: '#6A5BDF' }, // periwinkle
  { bg: '#2B1414', panel: '#47201F', accent: '#FF8A5B', ink: '#FFE3D6', glow: '#FF8A5B', wall: '#6B3A36', roof: '#F08A5E' }, // ember
];

export const LAYOUTS = 6;

type Props = { x: number; y: number; w: number; h: number; theme: Theme; layout: number; t: number; seed: number };

/** One tiny app window filling a house window's opening. All measurements are fractions of the opening.
 *  `t` drives a little life inside (a reply arriving, bars settling, a dot moving): each app is "in use". */
export const AppWin: React.FC<Props> = ({ x, y, w, h, theme: t, layout, t: time, seed }) => {
  // r(): a rounded rectangle placed by fractions of the window, so every layout scales with any opening size.
  const r = (fx: number, fy: number, fw: number, fh: number, fill: string, rr = 0.06, op = 1, k?: string) => (
    <rect key={k} x={x + fx * w} y={y + fy * h} width={Math.max(0, fw) * w} height={Math.max(0, fh) * h} rx={rr * h} fill={fill} opacity={op} />
  );
  const bar = 0.17;
  const ph = time * 0.9 + seed * 1.7;                // each window runs on its own clock so the town never pulses in unison
  const cyc = (ph % 3) / 3;                          // 0..1 every ~3.3 s
  const body: React.ReactNode[] = [];
  switch (layout % LAYOUTS) {
    case 0: { // a conversation: side list, a message, then the reply growing in
      body.push(r(0, bar, 0.27, 1 - bar, t.panel, 0, 1, 'a'));
      body.push(r(0.05, bar + 0.1, 0.17, 0.07, t.ink, 0.03, 0.25, 'b'), r(0.05, bar + 0.24, 0.13, 0.07, t.ink, 0.03, 0.2, 'c'));
      body.push(r(0.5, 0.3, 0.42, 0.16, t.accent, 0.08, 1, 'd'));
      const grow = Math.min(1, Math.max(0, (cyc - 0.15) * 3));
      body.push(r(0.34, 0.53, 0.46 * grow, 0.16, t.panel, 0.08, 1, 'e'));
      body.push(r(0.62, 0.76, 0.3, 0.13, t.accent, 0.08, cyc > 0.55 ? 1 : 0, 'f'));
      break;
    }
    case 1: { // four cards; the highlight moves from card to card
      const hi = Math.floor(ph % 4);
      [[0.07, 0.27], [0.53, 0.27], [0.07, 0.63], [0.53, 0.63]].forEach(([fx, fy], i) =>
        body.push(r(fx, fy, 0.4, i < 2 ? 0.3 : 0.28, i === hi ? t.accent : t.panel, 0.08, 1, `c${i}`)));
      break;
    }
    case 2: // a big header band and lines of text being written
      body.push(r(0, bar, 1, 0.33, t.accent, 0, 1, 'a'));
      body.push(r(0.08, 0.6, 0.7, 0.07, t.ink, 0.03, 0.3, 'b'), r(0.08, 0.73, 0.55, 0.07, t.ink, 0.03, 0.22, 'c'));
      body.push(r(0.08, 0.86, 0.62 * Math.min(1, cyc * 1.6), 0.06, t.ink, 0.03, 0.16, 'd'));
      break;
    case 3: // a little bar chart that breathes
      [0.34, 0.55, 0.42, 0.7, 0.5].forEach((v0, i) => {
        const v = v0 * (0.85 + 0.15 * Math.sin(ph * 2 + i * 1.3));
        body.push(r(0.1 + i * 0.17, 0.92 - v * 0.95 * (1 - bar), 0.11, v * 0.95 * (1 - bar), i === 3 ? t.accent : t.panel, 0.03, 1, `b${i}`));
      });
      break;
    case 4: // a profile: a round picture and two lines
      body.push(<circle key="c" cx={x + 0.27 * w} cy={y + 0.55 * h} r={0.2 * h * (1 + 0.06 * Math.sin(ph * 2.4))} fill={t.accent} />);
      body.push(r(0.5, 0.42, 0.4, 0.09, t.ink, 0.03, 0.32, 'a'), r(0.5, 0.58, 0.3, 0.08, t.ink, 0.03, 0.2, 'b'), r(0.5, 0.72, 0.36, 0.08, t.panel, 0.03, 1, 'c'));
      break;
    default: { // a calendar grid with today's square moving along
      const today = Math.floor(ph * 0.8) % 12;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const n = i + j * 4;
        body.push(r(0.08 + i * 0.22, 0.3 + j * 0.22, 0.17, 0.16, n === today || n % 5 === 2 ? t.accent : t.panel, 0.04, 1, `g${n}`));
      }
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.08 * h} fill={t.bg} />
      {body}
      {/* title strip with one accent dot: the cue that says "this is an app window" */}
      <rect x={x} y={y} width={w} height={bar * h} fill={t.panel} />
      <circle cx={x + 0.08 * w} cy={y + bar * h * 0.5} r={bar * h * 0.24} fill={t.accent} />
    </g>
  );
};
