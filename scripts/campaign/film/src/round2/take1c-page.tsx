// Take 1C's page furniture: the printed parts of every spread (chapter headings, page numbers, the headline
// block) and the SVG sheet the ink is drawn on.
import React from 'react';
import { C, DMSANS, EASE_IN, EASE_OUT } from '../brand';
import { InkDefs, lin, mixHex, P, useT } from './take1c-ink';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadCormorant } from '@remotion/google-fonts/CormorantGaramond';
import { LOOK, PH, PW, SW } from './take1c-book';

// WHY these faces: look a sets its chapter titles in Fraunces italic (a soft, warm storybook serif), look c in
// Cormorant Garamond (a classical book face for letterpress openers); look b stays in the brand's DM Sans.
const FRAUNCES = loadFraunces('italic', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;
const CORMORANT = loadCormorant('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily;
const CORMORANT_I = loadCormorant('italic', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily;
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
// WHY the spoken chapter words (max 3, lower case): the headings now echo what the narrator says, not invented labels
const SPOKEN: Record<string, string> = { 'what they decided': 'the rules', 'what we accepted': 'the bargain', 'then, quietly': 'however...', 'so long, old kings': 'so long, kings', 'at long, long last': 'at long last' };
const WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** The drawing surface for a spread: 1520×980 book units, ink defs included. */
export const Sheet: React.FC<{ children: React.ReactNode; rough?: boolean }> = ({ children, rough = true }) => (
  <svg viewBox={`0 0 ${SW} ${PH}`} width={SW} height={PH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
    <InkDefs />
    <g filter={rough ? 'url(#c-rough)' : undefined}>{children}</g>
  </svg>
);

/** The chapter opener printed at the top of the left-hand page: a numbered chapter and a short storybook title.
 *  WHY redesigned (owner: "the style/text of the headers"): tiny grey "i · the handful" labels read as UI captions;
 *  each look now has a deliberate opener in its own type, with titles that continue the narration. */
export const Heading: React.FC<{ n: string; title: string; color?: string }> = ({ n, title, color = P.ink }) => {
  const num = ROMAN[n] ?? 0;
  if (LOOK === 'b') {
    // editorial: a plum number tab, the title in the brand's own heavy sans, a hairline underneath
    return (
      <div style={{ position: 'absolute', left: 84, top: 40, width: PW - 168 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, fontFamily: DMSANS, color }}>
          <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '0.02em', padding: '3px 12px', border: `2.5px solid ${color}`, borderRadius: 999, lineHeight: 1 }}>{String(num).padStart(2, '0')}</span>
          <span style={{ fontWeight: 900, fontSize: 38, letterSpacing: '-0.045em', lineHeight: 1 }}>{title}</span>
        </div>
        <div style={{ marginTop: 14, height: 2, background: P.ink, opacity: 0.22 }} />
      </div>
    );
  }
  if (LOOK === 'c') {
    // heirloom opener: small-caps "chapter", a large numeral between two ruled flourishes, an italic title, all pressed into the paper
    const press = { textShadow: '0 1.2px 0 rgba(255,250,236,0.55), 0 -0.8px 0 rgba(30,12,36,0.35)', color: mixHex(color, P.paper, 0.1) } as const;
    const rule = (flip: boolean) => <div style={{ width: 120, height: 10, display: 'flex', alignItems: 'center', flexDirection: flip ? 'row-reverse' : 'row' }}>
      <div style={{ flex: 1, height: 1.5, background: color, opacity: 0.55 }} /><div style={{ width: 7, height: 7, transform: 'rotate(45deg)', background: color, opacity: 0.6, margin: '0 6px' }} /></div>;
    return (
      <div style={{ position: 'absolute', left: 0, top: 24, width: PW, textAlign: 'center', ...press }}>
        <div style={{ fontFamily: CORMORANT, fontWeight: 600, fontSize: 16, letterSpacing: '0.5em', paddingLeft: '0.5em', textTransform: 'uppercase', opacity: 0.8 }}>chapter</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: -2 }}>
          {rule(false)}<span style={{ fontFamily: CORMORANT, fontWeight: 600, fontSize: 50, lineHeight: 1.0, textTransform: 'uppercase' }}>{n}</span>{rule(true)}
        </div>
        <div style={{ fontFamily: CORMORANT_I, fontWeight: 600, fontSize: 40, letterSpacing: '0.01em', marginTop: 0 }}>{title}</div>
      </div>
    );
  }
  // a: WHY the brand's own face at weight 900, lower case, bigger, with the chapter number as a plum pill (owner: "the
  // style/text of the headers"; review: tiny grey italics were unreadable and unrelated to the headlines). Same
  // left margin on every spread; the plum number echoes the one purple word of the headlines.
  const spoken = SPOKEN[title] ?? title;
  return (
    <div style={{ position: 'absolute', left: 84, top: 26, width: PW - 168, textAlign: 'left', color, fontFamily: DMSANS }}>
      <div style={{ display: 'inline-block', fontWeight: 900, fontSize: 22, letterSpacing: '0.02em', lineHeight: 1, padding: '7px 16px', borderRadius: 999, background: C.purple, color: '#fff' }}>chapter {WORD[num]}</div>
      <div style={{ fontWeight: 900, fontSize: 68, lineHeight: 1.0, marginTop: 12, letterSpacing: '-0.05em', color: P.ink, textTransform: 'lowercase' }}>{spoken}</div>
    </div>
  );
};
/** Page numbers at the foot of each page.
 *  WHY `hideRight`: on the four spreads that carry a headline, the right-hand number sat right under the
 *  headline's last line (it touched the "y" of "everything."), so those spreads print only the left number. */
export const Folio: React.FC<{ left: number; hideRight?: boolean }> = ({ left, hideRight }) => (
  <>
    {(hideRight ? [0] : [0, 1]).map((i) => {
      const num = left + i;
      // WHY per look: a centred "— 2 —" in the title face (a), a bare numeral at the outer corner (b), a flanked numeral (c)
      if (LOOK === 'b') return (
        <div key={i} style={{ position: 'absolute', [i === 0 ? 'left' : 'right']: 84 + i * 0, top: PH - 74 + 0, left: i === 0 ? 84 : i * PW + PW - 84 - 40, width: 40, textAlign: i === 0 ? 'left' : 'right',
          fontFamily: DMSANS, fontWeight: 700, fontSize: 18, color: P.inkSoft, opacity: 0.75 }}>{String(num).padStart(2, '0')}</div>
      );
      return (
        <div key={i} style={{ position: 'absolute', left: i * PW, top: PH - 78, width: PW, textAlign: 'center', color: LOOK === 'a' ? P.ink : P.inkSoft, opacity: LOOK === 'a' ? 0.6 : 0.85,
          fontFamily: LOOK === 'a' ? FRAUNCES : CORMORANT_I, fontWeight: 600, fontSize: LOOK === 'a' ? 21 : 30 }}>
          {LOOK === 'a' ? `\u2014 ${num} \u2014` : `\u00b7 ${num} \u00b7`}
        </div>
      );
    })}
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
      {/* WHY a soft paper plate under the type (review BLOCKER: headlines read as captions and crossed art): it keeps the
          words legible over any drawing, and it arrives with the first word, never empty */}
      <div style={{ position: 'relative', padding: '24px 44px 24px', borderRadius: 26, /* WHY trailing the first word by two frames (integrator review: starting 0.05 s early it showed as an empty pale box before the word inked in) */ opacity: lin(t, (words ? words[0] : at) + 0.06, (words ? words[0] : at) + 0.4, EASE_OUT), background: 'rgba(255,250,241,0.93)', boxShadow: '0 10px 34px rgba(20,10,4,0.32), 0 1px 0 rgba(255,255,255,0.6) inset' }}>
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
