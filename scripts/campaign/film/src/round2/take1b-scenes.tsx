// Take 1B: things in the room that are not screens, and the one shot that still steps off the wall.
//  - ShelfReceipt: "what happened with your personal data". The person's phone prints a receipt of their three
//    things (photos, Sam's message, Mia's pickup); in line 3 four more lines print onto the same paper. It hangs
//    from the phone over the shelf lip, down across the screens of the shelf below, in every wall shot until
//    line 7 rolls it back. WHY one object on the shelf (owner, round 4: "disconnected elements"): the data story
//    is one receipt that belongs to one phone, not a new prop in a void each time.
//  - BillStack: "subscribe to everything and own nothing": monthly charges drop and stack on the shelf in front
//    of the same phone, faster and faster, while the total climbs. Seen once.
//  (The old off-wall receipt shot is gone: line 7 rolls this same paper back up into the phone, on the shelf.)
import React from 'react';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Q } from './take1b-cues';
import { dev } from './take1b-world';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));

// ---------------------------------------------------------------------------------------------------
// The receipt on the shelf (world units: it is drawn inside the wall's camera, so every shot sees the same paper)
// ---------------------------------------------------------------------------------------------------
const HERO = dev('hero');
/** "Share with partners" slides onto the phone as line 2's last clause starts, and flips on by itself just before
 *  "personal". WHY by itself: nobody on screen chose it; it was decided for them. */
export const SHARE = { in: Q.data + 0.05, on: Q.personal - 0.4 };
type RLine = { text: string[]; at: number; item?: 'photo' | 'msg' | 'note' };
// WHY these times: line 2's three lines land on "personal", "data" and just after, each as its card is ringed;
// line 3's four lines each land on their own spoken word, a beat after the paper feeds out for them
const RLINES: RLine[] = [
  { text: ['your photos'], at: SHARE.on + 0.18, item: 'photo' },
  { text: ['Sam: running late…'], at: SHARE.on + 0.62, item: 'msg' },
  { text: ['pick up Mia at 3:15'], at: SHARE.on + 1.06, item: 'note' },
  // WHY each a few hundredths after its word starts (round 7 review: 'where you go' was whole a quarter second before
  // "would be", so the picture rushed ahead of the voice)
  { text: ['where you go'], at: Q.wouldBe + 0.05 },
  { text: ['who you talk to'], at: Q.costOf + 0.05 },
  // WHY one line (review: the two-line entry broke the receipt's rhythm)
  { text: ['what you watch at 2am'], at: Q.convenience + 0.05 },
  { text: ['how you feel'], at: Q.convenience + 0.5 },
];
if (RLINES[2].at > Q.weAll - 0.5) throw new Error('take1b: the receipt\'s last private line would print as the shot cuts');
const R_W = 150;                       // the phone's full body width: the paper comes out of its bottom edge
const R_TOP = HERO.cy + HERO.h / 2 + 7; // the phone body's bottom edge (screen + bezel)
// WHY 13 and a 6 px margin: "what you watch at 2am" must fit on one line of the phone-wide paper
// (R_PAD 9, round 8: the text hugged the left edge; 12.6 px type keeps the longest line on one row inside it)
const R_HEAD = 24, R_ROW = 22, R_ROW2 = 15, R_FONT = 12.6, R_PAD = 9;
const rowH = (l: RLine) => R_ROW + (l.text.length - 1) * R_ROW2;
/** Where the person's three things are ringed on the phone, 0..1 each, as their line prints. */
export const receiptOutline = (t: number) => {
  const o = (i: number) => bump(t, RLINES[i].at - 0.12, 0.8);
  return { photo: o(0), msg: o(1), note: o(2) };
};
/** How much paper hangs out of the phone, in world px. Line 7 (the other half of the film) rolls it back by
 *  passing its own 0..1 `back`. */
export const receiptLen = (t: number, back = 0) => {
  let len = R_HEAD * ez(t, SHARE.on + 0.02, RLINES[0].at - 0.08, EASE_IN_OUT);
  // WHY each row feeds out in the third of a second before its line is due, and is whole a tenth before the word
  // (review: the new line was still half inside the phone for its first frames as the word was spoken)
  for (const l of RLINES) len += rowH(l) * ez(t, l.at - 0.36, l.at - 0.08, EASE_IN_OUT);
  // WHY 14 below the last line (review: the last line sat on the torn edge): a clear margin of paper under it
  return len > 0 ? (len + 14) * (1 - back) : 0;
};
/** The paper's bottom edge in world y (the camera follows it down in the receipt shots). */
export const receiptBottom = (t: number) => R_TOP + receiptLen(t);
// glowTop: 0..1, the hush on "However": the paper's upper third keeps a little of its phone's light
// tear: 0..1, line 7's payoff. WHY torn off and dropped rather than rolled back (round 6 final review: rolling back up
// "reads like it is printing backwards"): the paper snaps free at the phone's slot and falls away down the wall, out of
// frame; the slot is left empty, so the phone keeps nothing for the partners
export const ShelfReceipt: React.FC<{ t: number; dim?: number; back?: number; fade?: number; glowTop?: number; tear?: number }> = ({ t, dim = 0, back = 0, fade = 0, glowTop = 0, tear = 0 }) => {
  const len = receiptLen(t, back);
  if (len <= 0.5 || tear >= 1) return null;
  // gravity: a small jolt as it snaps (it drops 3 px at once), then it accelerates down, swinging a little to one side
  const fallY = tear > 0 ? 3 + tear * tear * 1500 : 0;
  const fallR = tear * tear * 9;
  const teethTop = Array.from({ length: 21 }, (_, i) => `${i * 5}% ${i % 2 ? '0%' : '4px'}`).join(',');
  // WHY it thins out over its last few px as it rolls in (review: a row of torn teeth hung under the phone for several
  // frames like a leftover): the end disappears cleanly into the phone's bottom edge
  const tail = back > 0 ? cl(len / 16) : 1;
  const teeth = Array.from({ length: 21 }, (_, i) => `${i * 5}% ${i % 2 ? '100%' : 'calc(100% - 4px)'}`).join(',');
  return (
    <>
    {/* WHY a dark slot across the phone's bottom edge (round 7 review: the paper came out of a straight edge with
        nothing to come out of) */}
    <div style={{ position: 'absolute', left: HERO.cx - R_W / 2 - 3, top: R_TOP - 2.5, width: R_W + 6, height: 4, borderRadius: 2, background: '#08040C', opacity: tail * (1 - fade), boxShadow: '0 1px 0 rgba(255,240,230,0.18)' }} />
    <div style={{ position: 'absolute', left: HERO.cx - R_W / 2, top: R_TOP + fallY, width: R_W, height: len, overflow: 'hidden', transform: fallR ? `rotate(${fallR}deg)` : undefined, transformOrigin: '50% 0',
      // WHY a filter, not an overlay: when the room hushes the paper keeps only the faint light of its own phone
      opacity: tail * (1 - fade) * (1 - cl((tear - 0.75) * 4)), filter: `brightness(${1 - 0.55 * dim}) drop-shadow(0 6px 7px rgba(6,2,12,0.55))${fade > 0.01 ? ` blur(${fade * 1.5}px)` : ''}` }}>
      {/* (once torn, its top edge is ragged too) */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(${tear > 0 ? teethTop : '0 0,100% 0'},${teeth.split(',').reverse().join(',')})` }}>
        {/* the paper: warm white, a slot shadow where it leaves the phone, the bend over the plank's front edge (a
            bright crease at 2..6 px), a little shade down the plank's face where the shelf's own lip shadows it
            (to 35 px), then lit flat as it hangs */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#A99E8C 0px,#E6DBC9 2px,#FFFDF7 5px,#F4EBDC 9px,#E2D7C4 20px,#E9DFCD 33px,#F8F2E7 40px,#FBF6EC 70%,#F3EADB 100%)' }} />
        <div style={{ position: 'absolute', left: R_PAD, right: R_PAD, top: 6, fontFamily: DMSANS, color: C.plum }}>
          <div style={{ height: R_HEAD, display: 'flex', alignItems: 'center', fontSize: 9.5, fontWeight: 900, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>shared with partners:</div>
          {RLINES.map((l, i) => (
            <div key={i} style={{ height: rowH(l), boxSizing: 'border-box', borderTop: '1.2px dashed #D9CAB4', paddingTop: 3, fontSize: R_FONT, lineHeight: `${R_ROW2}px`, fontWeight: 600, letterSpacing: '-0.035em', color: C.plum, whiteSpace: 'nowrap' }}>
              {l.text.map((x, j) => <div key={j}>{x}</div>)}
            </div>
          ))}
        </div>
        {/* WHY a rim of light on its lower edges: the bright screens of the shelf below are behind the hanging paper, so
            its edges glow a little and its fibres show through, which puts it IN FRONT of them rather than pasted on */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 46, bottom: 0, boxShadow: 'inset 3px 0 4px -1px rgba(255,248,236,0.9), inset -3px 0 4px -1px rgba(255,248,236,0.9)',
          background: 'linear-gradient(180deg, rgba(255,240,220,0) 0%, rgba(255,236,214,0.18) 100%)', mixBlendMode: 'screen' }} />
        {/* WHY a slight curl: the paper's edges turn a touch darker and its centre catches the light, so it reads as a
            strip of paper with a little body, not a flat card */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(120,96,70,0.16) 0%, rgba(255,255,255,0) 14%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 86%, rgba(120,96,70,0.16) 100%)' }} />
        {glowTop > 0.01 && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 70, background: 'linear-gradient(180deg, rgba(255,246,236,0.9), rgba(255,246,236,0))', mixBlendMode: 'screen', opacity: glowTop * 0.5 }} />}
      </div>
    </div>
    </>
  );
};

// ---------------------------------------------------------------------------------------------------
// The monthly bill, stacking on the shelf in front of the person's phone (world units)
// ---------------------------------------------------------------------------------------------------
// generic everyday subscriptions, no company names (brand: nothing identifying a real company)
// WHY eight (review): the whole pile must fit in frame at "own", beside the person's phone, so its weight is seen
const SUBS: [string, number, string][] = [
  ['Photo storage', 2.99, '#E6A57E'], ['Music', 10.99, '#D25AA0'], ['Films & shows', 15.49, '#9D5BD0'], ['Office apps', 9.99, '#5E8FD6'],
  ['Cloud backup', 4.99, '#6FB3A8'], ['Doorbell video', 4.99, '#7E9C7A'], ['Printer ink plan', 6.99, '#C387D3'], ['Car app', 7.99, '#5A6E8C'],
];
const B_FALL = 0.16;   // WHY so short a fall: a charge lands like a weight, not a feather
// WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions pile up; the last one
// lands as "own" is spoken. WHY the shelf starts empty (round 7 review: two charges were already there when the shot
// opened, so the gag began mid-action and then sat parked for a second): the first lands on "accepted", the second on
// "subscribe", and from there they come faster and faster
const B_ONE = Q.subscribe + 0.03 - B_FALL;
const bDrop = (i: number) => (i === 0 ? Q.accepted2 + 0.05 - B_FALL : B_ONE + (Q.own - B_FALL - B_ONE) * Math.pow((i - 1) / (SUBS.length - 2), 0.62));
// each charge is a solid block (like a book lying on a shelf): a front face carrying its name, and a lit top face
const B_W = 300, B_H = 46, B_TOP = 9, B_PITCH = B_H + B_TOP - 1;
/** The pile's centre, in world px. WHY in front of the tagged tablet (review): set in front of the phone it hid the
 *  phone; here the phone with its receipt stays in plain view beside the pile, the tablet's price tag just left of it. */
// WHY 500 (round 7 review: at 380 the pile buried the tablet and left only its tag peeking out): the tablet's left
// half and its $14.99 tag stay clear beside the pile
export const BILL_X = 500;
const billLanded = (t: number) => SUBS.filter((_, i) => t >= bDrop(i) + B_FALL).length;
/** How much of the pile has come down (0..SUBS.length, smooth): the camera eases back as it grows. */
export const billGrowth = (t: number) => SUBS.reduce((a, _, i) => a + (ez(t, bDrop(i) + B_FALL - 0.05, bDrop(i) + B_FALL + 0.5, EASE_IN_OUT)), 0);
export const BILL_N = SUBS.length;
export const BillStack: React.FC<{ t: number }> = ({ t }) => (
  <>
    {/* the pile's contact shadow on the plank */}
    <div style={{ position: 'absolute', left: BILL_X - B_W * 0.6, width: B_W * 1.2, top: -10, height: 22, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(4,1,8,0.85), transparent)' }} />
    {SUBS.map(([name, price, col], i) => {
      const d = bDrop(i);
      if (t < d) return null;
      const p = ez(t, d, d + B_FALL, EASE_IN);
      const y = -(i + 1) * B_PITCH;
      const since = t - d - B_FALL;
      // WHY squash and a small rebound: weight; it hits, compresses, and settles
      const sq = since > 0 ? Math.exp(-since * 16) : 0;
      const bounce = since > 0 ? -Math.sin(since * 28) * Math.exp(-since * 14) * 4 : 0;
      const tilt = ((i * 37) % 7 - 3) * 0.45;
      return (
        <div key={i} style={{ position: 'absolute', left: BILL_X - B_W / 2 + ((i * 53) % 5 - 2) * 5, top: y - (1 - p) * 760 + bounce, width: B_W, height: B_H + B_TOP,
          transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.12}) scaleX(${1 + sq * 0.03})`, transformOrigin: '50% 100%', filter: 'drop-shadow(0 6px 6px rgba(4,1,8,0.55))' }}>
          {/* the top face, seen from a little above: a lighter strip, narrower at the back */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: B_TOP, clipPath: 'polygon(3% 0,97% 0,100% 100%,0 100%)', background: 'linear-gradient(180deg,#5C4A68,#4A3A56)' }} />
          {/* the front face, with its lit top edge */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: B_TOP, height: B_H, borderRadius: '2px 2px 6px 6px', background: 'linear-gradient(180deg,#3B2C47 0%,#2C2036 60%,#22182A 100%)',
            boxShadow: 'inset 0 1.5px 0 rgba(255,236,246,0.28), inset 0 -2px 0 rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', padding: '0 15px', boxSizing: 'border-box', gap: 11, fontFamily: DMSANS }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: col, flex: 'none', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)' }} />
            <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}</div>
          </div>
        </div>
      );
    })}
  </>
);
/** The running total, set on the left of the frame (screen px). */
export const BillTotal: React.FC<{ t: number }> = ({ t }) => {
  const n = billLanded(t);
  const total = SUBS.slice(0, n).reduce((a, s) => a + s[1], 0);
  const lastLand = bDrop(Math.max(0, n - 1)) + B_FALL;
  const thump = n > 0 && t > lastLand ? Math.exp(-(t - lastLand) * 12) : 0;
  // WHY whole on the cut (round 7 review: its fade-in started before the cut and ghosted over the last frames of the
  // three-shot), at $0.00 until the first charge lands with a counted thump
  return (
    <div style={{ position: 'absolute', left: 154, top: 300, fontFamily: DMSANS, color: C.nightText, textShadow: '0 4px 30px rgba(10,5,16,0.8)' }}>
      {/* WHY a soft local darkening behind it, never a box (round 7 review: the white numerals sat on a pale blurred
          screen and went muddy): the shelf behind falls into shadow just where the total is */}
      <div style={{ position: 'absolute', left: -180, top: -150, width: 960, height: 520, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(10,5,16,0.78), rgba(10,5,16,0.5) 55%, rgba(10,5,16,0) 100%)' }} />
      <div style={{ position: 'relative', fontSize: 40, fontWeight: 700, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
      {/* WHY 150 (was 176): the total must end clear of the person's phone, which now stands in plain view beside it */}
      <div style={{ position: 'relative', fontSize: 150, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.035})`, transformOrigin: '0 60%' }}>${total.toFixed(2)}</div>
    </div>
  );
};
