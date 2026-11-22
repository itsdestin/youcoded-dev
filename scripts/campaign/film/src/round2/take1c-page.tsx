// Take 1C's page furniture: the printed parts of every spread (chapter headings, page numbers, the headline
// block) and the SVG sheet the ink is drawn on.
import React from 'react';
import { C, DMSANS, EASE_IN, EASE_OUT } from '../brand';
import { InkDefs, lin, mixHex, P, useT } from './take1c-ink';
import { PH, PW, SW } from './take1c-book';

/** The drawing surface for a spread: 1520×980 book units, ink defs included. */
export const Sheet: React.FC<{ children: React.ReactNode; rough?: boolean }> = ({ children, rough = true }) => (
  <svg viewBox={`0 0 ${SW} ${PH}`} width={SW} height={PH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
    <InkDefs />
    <g filter={rough ? 'url(#c-rough)' : undefined}>{children}</g>
  </svg>
);

// WHY the chapter heading is now a number only (owner, round three: "i really don't like ... the style/text of
// the headers on each page"): the old "iv · however", "vi · anyone", "ix · everything" just repeated the word
// the narrator was saying, in a small spaced-out label that read like a web template. A premium picture book
// marks a chapter with one confident figure and lets the picture speak. So every chapter opens with the same
// mark in the same place: a heavy DM Sans numeral (the brand's headline cut) over a short ink rule, set in the
// page's top margin. `title` is still accepted (the spreads pass it) but is deliberately not printed.
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
/** A chapter's number, printed at the top of the left-hand page. */
export const Heading: React.FC<{ n: string; title?: string; color?: string }> = ({ n, color = P.ink }) => {
  const num = ROMAN[n.trim().toLowerCase()] ?? n;
  return (
    <div style={{ position: 'absolute', left: 0, top: 58, width: PW, display: 'flex', flexDirection: 'column', alignItems: 'center', color }}>
      <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: 40, lineHeight: 1, letterSpacing: '-0.04em', fontFeatureSettings: '"lnum"', opacity: 0.88 }}>{num}</div>
      <div style={{ width: 22, height: 2.5, borderRadius: 2, marginTop: 10, background: color, opacity: 0.55 }} />
    </div>
  );
};
/** Page numbers at the foot of each page.
 *  WHY `hideRight`: on the four spreads that carry a headline, the right-hand number sat right under the
 *  headline's last line (it touched the "y" of "everything."), so those spreads print only the left number. */
export const Folio: React.FC<{ left: number; hideRight?: boolean }> = ({ left, hideRight }) => (
  <>
    {(hideRight ? [0] : [0, 1]).map((i) => (
      // WHY smaller, lighter and set with lining figures: the folio is fine print (brand level three) and should
      // be found, not seen; it now matches the chapter numeral's figures
      <div key={i} style={{ position: 'absolute', left: i * PW, top: PH - 62, width: PW, textAlign: 'center', fontFamily: DMSANS, fontWeight: 500, fontSize: 13, letterSpacing: '0.04em', fontFeatureSettings: '"lnum", "tnum"', color: P.inkSoft, opacity: 0.6 }}>
        {left + i}
      </div>
    ))}
  </>
);

// WHY on the screen, not on the page: printed on the page, each headline moved with the camera and landed in
// a different place every time. Fixed in screen space, all four land on exactly the same spot (over the lower
// right-hand page at the home framing, which every spread keeps clear while a headline is up).
export const HEADLINE_SCREEN = { cx: 1290, cy: 818, w: 640 };
/** A headline that inks in word by word at one fixed spot on screen. *word* is the purple one; "/" breaks a line.
 *  `words`: when given, each word appears on its own spoken start time instead of a fixed stagger.
 *  `cutOut`: it leaves on a hard cut (gone on the frame of `out`) instead of fading. */
export const Headline: React.FC<{ text: string; at: number; out: number; stagger?: number; words?: number[]; cutOut?: boolean; night?: (t: number) => number }> = ({ text, at, out, stagger = 0.11, words, cutOut, night }) => {
  const t = useT();
  // `night`: 0..1, the type turning to the brand's dark-mode colours as a dark surface (the closing cover) slides under it
  const nt = night ? night(t) : 0;
  if (t < at - 0.05 || (cutOut ? t >= out : t > out + 0.05)) return null;
  const exit = cutOut ? 0 : lin(t, out - 0.35, out, EASE_IN);
  const rows = text.split('/').map((r) => r.trim().split(/\s+/));
  let n = 0;
  return (
    <div style={{ position: 'absolute', left: HEADLINE_SCREEN.cx - HEADLINE_SCREEN.w / 2, top: HEADLINE_SCREEN.cy - 200, width: HEADLINE_SCREEN.w, height: 400, display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: 80, letterSpacing: '-0.05em', lineHeight: 1.0, color: nt > 0 ? mixHex(P.ink, C.nightText, nt) : P.ink, opacity: 1 - exit, pointerEvents: 'none' }}>
      <div>
        {rows.map((row, r) => (
          <div key={r} style={{ whiteSpace: 'nowrap' }}>
            {row.map((raw, i) => {
              const k = n++;
              // WHY spoken times when known: a word on screen before the narrator says it spoils the line
              const w0 = words ? words[k] : at + k * stagger;
              const p = lin(t, w0, w0 + 0.42, EASE_OUT);
              const accent = raw.startsWith('*');
              return (
                <span key={i} style={{ display: 'inline-block', margin: '0 0.11em', opacity: p, filter: p < 1 ? `blur(${(1 - p) * 3}px)` : undefined,
                  transform: `translateY(${(1 - p) * 10}px)`, color: accent ? (nt > 0 ? mixHex(C.purple, C.purpleNight, nt) : C.purple) : undefined }}>{raw.replace(/\*/g, '')}</span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
