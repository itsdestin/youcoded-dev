// Take 1C's page furniture: the printed parts of every spread (chapter headings, page numbers, the headline
// block) and the SVG sheet the ink is drawn on.
import React from 'react';
import { C, DMSANS, EASE_IN, EASE_OUT } from '../brand';
import { InkDefs, lin, mixHex, P, useT } from './take1c-ink';
import { PH, PW, SW } from './take1c-book';

/** The drawing surface for a spread: 1520×980 book units, ink defs included. */
// WHY no hand wobble by default (round nine review: "at full size the roughening ... reads as stair-stepped jaggies
// rather than ink ... the rough ones look like a low-resolution capture"): the displacement filter is computed at the
// page's own resolution and then magnified by the camera, so every edge stepped. Clean vector ink stays crisp at
// any zoom, and now matches the crisp headline type beside it.
export const Sheet: React.FC<{ children: React.ReactNode; rough?: boolean }> = ({ children, rough = false }) => (
  <svg viewBox={`0 0 ${SW} ${PH}`} width={SW} height={PH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
    <InkDefs />
    <g filter={rough ? 'url(#c-rough)' : undefined}>{children}</g>
  </svg>
);

// WHY the chapter heading prints nothing (review round six): the old worded labels ("iv · however") read like a
// web template (owner, round three), and the numeral that replaced them read at film size as a page number or a
// minus sign, and crowded the hats in the opening close-up. A larger numeral would collide with art the spreads
// already place at the top of the left page. The narrator never counts chapters, so the page turn alone marks
// each one. `n` and `title` are still accepted, so the spreads need no change and the mark can return in one place.
/** A chapter's mark at the top of the left-hand page (currently none: the page turn is the mark). */
export const Heading: React.FC<{ n: string; title?: string; color?: string }> = () => null;
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
// WHY these numbers (review round six): the home framing pulled back (the book is smaller and sits a touch
// higher, see HOME_SCALE in take1c-book.tsx), so the headline moved and shrank with the right-hand page it sits
// on, keeping the same place on the page and room past its last letter.
// WHY anchored by its TOP edge, centred on one column, at one size (round nine review: "the four headlines move and
// change size on screen ... 'something wonderful happened.' sits low right in three rows and is the smallest"): a
// one-row and a two-row headline now start on the same line and share one centre, and none has three rows.
export const HEADLINE_SCREEN = { cx: 1254, top: 664, w: 780, size: 72 };
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
    <div style={{ position: 'absolute', left: HEADLINE_SCREEN.cx - HEADLINE_SCREEN.w / 2, top: HEADLINE_SCREEN.top, width: HEADLINE_SCREEN.w, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', textAlign: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: HEADLINE_SCREEN.size, letterSpacing: '-0.05em', lineHeight: 1.0, color: nt > 0 ? mixHex(P.ink, C.nightText, nt) : P.ink, opacity: 1 - exit, pointerEvents: 'none' }}>
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
