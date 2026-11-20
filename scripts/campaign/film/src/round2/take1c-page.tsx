// Take 1C's page furniture: the printed parts of every spread (chapter headings, page numbers, the headline
// block) and the SVG sheet the ink is drawn on.
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

// WHY on the screen, not on the page: printed on the page, each headline moved with the camera and landed in
// a different place every time. Fixed in screen space, all four land on exactly the same spot (over the lower
// right-hand page at the home framing, which every spread keeps clear while a headline is up).
export const HEADLINE_SCREEN = { cx: 1290, cy: 818, w: 640 };
/** A headline that inks in word by word at one fixed spot on screen. *word* is the purple one; "/" breaks a line. */
export const Headline: React.FC<{ text: string; at: number; out: number; stagger?: number }> = ({ text, at, out, stagger = 0.11 }) => {
  const t = useT();
  if (t < at - 0.05 || t > out + 0.05) return null;
  const exit = lin(t, out - 0.35, out, EASE_IN);
  const rows = text.split('/').map((r) => r.trim().split(/\s+/));
  let n = 0;
  return (
    <div style={{ position: 'absolute', left: HEADLINE_SCREEN.cx - HEADLINE_SCREEN.w / 2, top: HEADLINE_SCREEN.cy - 200, width: HEADLINE_SCREEN.w, height: 400, display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: 80, letterSpacing: '-0.05em', lineHeight: 1.0, color: P.ink, opacity: 1 - exit, pointerEvents: 'none' }}>
      <div>
        {rows.map((row, r) => (
          <div key={r} style={{ whiteSpace: 'nowrap' }}>
            {row.map((raw, i) => {
              const k = n++;
              const p = lin(t, at + k * stagger, at + k * stagger + 0.42, EASE_OUT);
              const accent = raw.startsWith('*');
              return (
                <span key={i} style={{ display: 'inline-block', margin: '0 0.11em', opacity: p, filter: p < 1 ? `blur(${(1 - p) * 3}px)` : undefined,
                  transform: `translateY(${(1 - p) * 10}px)`, color: accent ? C.purple : undefined }}>{raw.replace(/\*/g, '')}</span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
