// Take 1C's page furniture: the printed parts of every spread (chapter headings, page numbers, the headline
// block) and the SVG sheet the ink is drawn on.
// WHY the headline always sits in the same block on the right-hand page: the brand asks for one consistent
// headline position, and the camera returns to its home framing whenever a headline is up, so the block
// lands on the same spot of the screen every time.
import React from 'react';
import { C, DMSANS, EASE_IN, EASE_OUT } from '../brand';
import { InkDefs, lin, P, useT } from './take1c-ink';
import { PH, PW, SW } from './take1c-book';

/** The drawing surface for a spread: 1520×980 book units, ink defs included. */
export const Sheet: React.FC<{ children: React.ReactNode; rough?: boolean }> = ({ children, rough = true }) => (
  <svg viewBox={`0 0 ${SW} ${PH}`} width={SW} height={PH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
    <InkDefs />
    <g filter={rough ? 'url(#c-rough)' : undefined}>{children}</g>
  </svg>
);

/** "i · the handful": printed at the top of the left-hand page. */
export const Heading: React.FC<{ n: string; title: string; color?: string }> = ({ n, title, color = P.inkSoft }) => (
  <div style={{ position: 'absolute', left: 0, top: 74, width: PW, textAlign: 'center', fontFamily: DMSANS, fontWeight: 700, fontSize: 21,
    letterSpacing: '0.08em', color }}>
    <span style={{ opacity: 0.75 }}>{n}</span><span style={{ margin: '0 0.6em', opacity: 0.5 }}>·</span>{title}
  </div>
);
/** Page numbers at the foot of each page. */
export const Folio: React.FC<{ left: number }> = ({ left }) => (
  <>
    {[0, 1].map((i) => (
      <div key={i} style={{ position: 'absolute', left: i * PW, top: PH - 66, width: PW, textAlign: 'center', fontFamily: DMSANS, fontWeight: 500, fontSize: 15, color: P.inkSoft, opacity: 0.7 }}>
        {left + i}
      </div>
    ))}
  </>
);

export const HEADLINE_BOX = { x: PW + 60, y: 640, w: PW - 120, h: 250 };
/** A headline printed into the page word by word, as if the ink were arriving. *word* is the purple one. */
export const Headline: React.FC<{ text: string; at: number; out: number; stagger?: number }> = ({ text, at, out, stagger = 0.11 }) => {
  const t = useT();
  if (t < at - 0.05 || t > out + 0.05) return null;
  const exit = lin(t, out - 0.35, out, EASE_IN);
  // "/" forces a line break, so each headline breaks where it reads best ("for anyone / who asks.")
  const rows = text.split('/').map((r) => r.trim().split(/\s+/));
  let n = 0;
  return (
    <div style={{ position: 'absolute', left: HEADLINE_BOX.x, top: HEADLINE_BOX.y, width: HEADLINE_BOX.w, height: HEADLINE_BOX.h, display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: 88, letterSpacing: '-0.05em', lineHeight: 1.0, color: P.ink, opacity: 1 - exit }}>
      <div>
        {rows.map((row, r) => (
          <div key={r} style={{ whiteSpace: 'nowrap' }}>
            {row.map((raw, i) => {
              const k = n++;
              const p = lin(t, at + k * stagger, at + k * stagger + 0.42, EASE_OUT);
              const accent = raw.startsWith('*');
              return (
                <span key={i} style={{ display: 'inline-block', margin: '0 0.11em', opacity: p, filter: p < 1 ? `blur(${(1 - p) * 3}px)` : undefined,
                  transform: `scale(${1.06 - 0.06 * p})`, color: accent ? C.purple : undefined }}>{raw.replace(/\*/g, '')}</span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
