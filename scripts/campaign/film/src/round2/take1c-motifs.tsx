// Take 1C: what each person draws their corner of the book into once they hold the quill.
// WHY six different things in six palettes: the idea the film has to leave behind is that everyone's copy
// looks and works differently. Each motif is something a real person might want that no shop sells them in
// exactly that shape: their own garden planner, their records, their night sky, their cat, their recipes, a
// game for their friends. They are drawings in a book, never pictures of the app.
import React from 'react';
import { circle, P, Shape, Ink, Appear, useT } from './take1c-ink';

export type Motif = 'garden' | 'music' | 'stars' | 'cat' | 'cook' | 'game';
export type Palette = { bg: string; a: string; b: string; pattern?: 'dots' | 'stripes' };
export const PALETTES: Palette[] = [
  { bg: P.pinkSoft, a: P.pink, b: P.purple, pattern: 'dots' },
  { bg: P.violetSoft, a: P.violet, b: P.sun },
  { bg: P.sunSoft, a: P.sun, b: P.purple, pattern: 'stripes' },
  { bg: P.lilac, a: P.purple, b: P.pink },
  { bg: '#F6D9E7', a: P.purple, b: P.sun, pattern: 'stripes' },
  { bg: P.purpleSoft, a: P.violet, b: P.pink, pattern: 'dots' },
];
export const MOTIFS: Motif[] = ['garden', 'music', 'stars', 'cat', 'cook', 'game'];

/** A motif drawn around (x, y), about 220 units wide at s = 1. `a` is when its ink starts. */
export const MotifArt: React.FC<{ kind: Motif; x: number; y: number; s?: number; a: number; pal: Palette }> = ({ kind, x, y, s = 1, a, pal }) => {
  const d = (i: number) => a + i * 0.08;
  const t = useT();
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {kind === 'garden' && (
        <>
          {[-70, 0, 70].map((px, i) => (
            <g key={i}>
              <Ink d={`M ${px} 40 C ${px - 6} 0 ${px + 8} -30 ${px} ${-50 - i * 14}`} a={d(i)} b={d(i) + 0.4} w={4} c={P.ink} />
              <Shape d={`M ${px - 8} ${-36 - i * 14} q -26 -6 -24 14 q 18 4 24 -14 z`} a={d(i) + 0.2} b={d(i) + 0.5} fill={pal.b} w={2.4} />
              <Shape d={circle(px, -62 - i * 14, 15)} a={d(i) + 0.25} b={d(i) + 0.55} fill={i === 1 ? pal.b : pal.a} w={2.6} />
              <Shape d={circle(px, -62 - i * 14, 6)} a={d(i) + 0.4} b={d(i) + 0.6} fill={P.sunSoft} w={2} />
              <Shape d={`M ${px - 28} 40 L ${px + 28} 40 L ${px + 20} 92 L ${px - 20} 92 Z`} a={d(i)} b={d(i) + 0.35} fill={i === 1 ? pal.a : P.paper} w={3} />
            </g>
          ))}
          <Ink d="M -120 92 L 120 92" a={d(0)} b={d(3)} w={3} />
        </>
      )}
      {kind === 'music' && (
        <>
          <Shape d={circle(-30, 20, 78)} a={d(0)} b={d(0) + 0.5} fill={P.ink} w={3} />
          <Ink d={`${circle(-30, 20, 58)} ${circle(-30, 20, 40)}`} a={d(2)} b={d(2) + 0.5} w={1.6} c={P.paper} o={0.5} />
          <Shape d={circle(-30, 20, 22)} a={d(2)} b={d(2) + 0.4} fill={pal.a} w={2} />
          <Shape d="M 66 -40 L 66 -110 L 112 -122 L 112 -52" a={d(3)} b={d(3) + 0.4} w={5} />
          <Shape d={`${circle(56, -40, 12)} ${circle(102, -52, 12)}`} a={d(4)} b={d(4) + 0.3} fill={pal.b} w={3} />
          <Shape d="M 100 40 L 100 -6 l 22 8" a={d(5)} b={d(5) + 0.3} w={4} />
          <Shape d={circle(92, 40, 10)} a={d(5)} b={d(5) + 0.3} fill={pal.a} w={3} />
        </>
      )}
      {kind === 'stars' && (
        <>
          <Shape d="M 40 -96 a 46 46 0 1 0 34 74 a 36 36 0 1 1 -34 -74 z" a={d(0)} b={d(0) + 0.5} fill={pal.b} w={3} />
          {[[-90, -80, 12], [-30, -110, 9], [-60, -30, 7], [110, -20, 10]].map(([sx, sy, r], i) => (
            <Shape key={i} d={`M ${sx} ${sy - r * 2} L ${sx + r * 0.6} ${sy - r * 0.6} L ${sx + r * 2} ${sy} L ${sx + r * 0.6} ${sy + r * 0.6} L ${sx} ${sy + r * 2} L ${sx - r * 0.6} ${sy + r * 0.6} L ${sx - r * 2} ${sy} L ${sx - r * 0.6} ${sy - r * 0.6} Z`}
              a={d(i + 1)} b={d(i + 1) + 0.3} fill={i % 2 ? pal.a : P.sunSoft} w={2.2} />
          ))}
          <Shape d="M -70 50 L 20 6 L 30 26 L -60 70 Z" a={d(2)} b={d(2) + 0.4} fill={pal.a} w={3} />
          <Ink d="M -20 46 L -50 110 M -20 46 L -20 110 M -20 46 L 10 110" a={d(3)} b={d(3) + 0.4} w={3.4} />
        </>
      )}
      {kind === 'cat' && (
        <>
          <Shape d="M -40 90 C -70 90 -76 30 -50 4 L -56 -40 L -34 -20 C -22 -26 -4 -26 8 -20 L 30 -40 L 26 4 C 48 30 44 90 10 90 Z" a={d(0)} b={d(0) + 0.6} fill={pal.a} w={3} />
          <Ink d="M 30 80 C 80 84 96 40 70 20" a={d(2)} b={d(2) + 0.4} w={7} c={P.ink} />
          <Appear a={d(3)}><circle cx={-28} cy={6} r={3.5} fill={P.ink} /><circle cx={-4} cy={6} r={3.5} fill={P.ink} /><path d="M -20 18 q 4 4 8 0" stroke={P.ink} strokeWidth={2} fill="none" /></Appear>
          <Shape d={circle(100, 70, 24)} a={d(3)} b={d(3) + 0.4} fill={pal.b} w={3} />
          <Ink d="M 82 58 q 18 6 36 -2 M 80 74 q 20 8 40 -4 M 90 50 q 4 20 -2 42" a={d(4)} b={d(4) + 0.4} w={1.8} c={P.paper} />
          <Ink d={`M 100 46 C 110 ${10 + Math.sin(t * 2) * 6} 60 -10 40 -60`} a={d(4)} b={d(4) + 0.5} w={2} />
        </>
      )}
      {kind === 'cook' && (
        <>
          <Shape d="M -80 0 L 60 0 L 50 80 Q -10 96 -70 80 Z" a={d(0)} b={d(0) + 0.5} fill={pal.a} w={3} />
          <Ink d="M -96 4 L 76 4 M -80 20 L -100 20 M 60 20 L 80 20" a={d(1)} b={d(1) + 0.4} w={5} />
          {[-40, 0, 40].map((sx, i) => (
            <Ink key={i} d={`M ${sx - 10} -14 C ${sx - 20} ${-34} ${sx + 10} ${-44} ${sx} ${-62} C ${sx - 10} ${-80} ${sx + 12} ${-90} ${sx + 4} ${-108}`} a={d(2 + i)} b={d(2 + i) + 0.5} w={3} c={P.inkSoft} />
          ))}
          <Shape d="M 90 -40 L 130 40 L 118 46 Z" a={d(4)} b={d(4) + 0.4} fill={pal.b} w={2.6} />
          <Ink d="M 92 -44 l -8 -16 M 96 -46 l 2 -18 M 100 -42 l 12 -12" a={d(5)} b={d(5) + 0.3} w={3} c={P.ink} />
        </>
      )}
      {kind === 'game' && (
        <>
          <Shape d="M -90 -80 L 90 -80 L 90 100 L -90 100 Z" a={d(0)} b={d(0) + 0.5} fill={P.paper} w={3} />
          {Array.from({ length: 9 }).map((_, i) => {
            const cx = -90 + (i % 3) * 60, cy = -80 + Math.floor(i / 3) * 60;
            return (i + Math.floor(i / 3)) % 2 === 0 ? <Shape key={i} d={`M ${cx} ${cy} h 60 v 60 h -60 Z`} a={d(1)} b={d(1) + 0.3} fill={pal.a} w={1.5} /> : null;
          })}
          <Shape d={circle(-30, -20, 18)} a={d(3)} b={d(3) + 0.3} fill={pal.b} w={3} />
          <Shape d={circle(30, 40, 18)} a={d(4)} b={d(4) + 0.3} fill={P.ink} w={3} />
          <Shape d={circle(-60, 70, 18)} a={d(5)} b={d(5) + 0.3} fill={pal.b} w={3} />
        </>
      )}
    </g>
  );
};
