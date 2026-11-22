// Take 1B: things in the room that are not screens, and the one shot that still steps off the wall.
//  - ShelfReceipt: "what happened with your personal data". The person's phone prints a receipt of their three
//    things (photos, Sam's message, Mia's pickup); in line 3 four more lines print onto the same paper. It hangs
//    from the phone over the shelf lip, down across the screens of the shelf below, in every wall shot until
//    line 7 rolls it back. WHY one object on the shelf (owner, round 4: "disconnected elements"): the data story
//    is one receipt that belongs to one phone, not a new prop in a void each time.
//  - BillStack: "subscribe to everything and own nothing": monthly charges drop and stack on the shelf in front
//    of the same phone, faster and faster, while the total climbs. Seen once.
//  - Receipt (rewind): the old off-wall shot of line 7, kept only until that line moves onto the shelf too.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Q } from './take1b-cues';
import { APP_BG, OwnScreen, SameScreen, ShareSwitch, sameLayout } from './take1b-screens';
import { dev } from './take1b-world';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));
// WHY deeper than before: the reviewer found the plum lifted and muddy; plum-black lets the paper and screens hit white
const Room: React.FC = () => <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 30%, #22142D 0%, #120A1B 60%, #0B0611 100%)' }} />;

// ---------------------------------------------------------------------------------------------------
// The receipt that prints out of the phone
// ---------------------------------------------------------------------------------------------------
const PW = 400, PH = 836, BZ = 16;      // WHY this big: the switch and the things it copies must read at a glance                       // phone screen and bezel, in frame pixels
const PX = 960 - PW / 2, PY = 58;                        // screen's top-left before the camera follows the paper
const PRINT_LINES: { text: string; item?: 'photo' | 'msg' | 'note' }[] = [
  { text: 'your photos', item: 'photo' }, { text: 'Sam: running late…', item: 'msg' }, { text: 'pick up Mia at 3:15', item: 'note' },
  { text: 'where you were today' }, { text: 'who you message most' }, { text: 'what you looked at' },
];
const HEAD = 84, LINE = 60;
const FULL = HEAD + PRINT_LINES.length * LINE + 40;
// the moments, all from the narrator's words
const SHARE_IN = Q.data + 0.12, FLIP = Q.personal - 0.42, PRINT0 = FLIP + 0.12, PRINT1 = Q.weAll - 0.08;
// WHY from "what happens" (not "And"): the tablet before it needs its own 1.2 s once its new screen is up
const UNFLIP = Q.whatHappens + 0.1, REWIND0 = Q.whatHappens + 0.25, REWIND1 = Q.whatHappens + 1.3;
if (PRINT1 - PRINT0 < 1.3) throw new Error('take1b: the receipt would print too fast to read');

export const Receipt: React.FC<{ t: number; mode: 'print' | 'rewind' }> = ({ t, mode }) => {
  const len = mode === 'print' ? FULL * ez(t, PRINT0, PRINT1, (x) => x) : FULL * (1 - ez(t, REWIND0, REWIND1, EASE_IN_OUT));
  // WHY the camera follows the paper down: the newest line is always in view, as in the "free*" shot later
  const follow = Math.max(0, len - 150) * 0.78;
  const lay = 2;
  const L = sameLayout(PW, PH, lay);
  const on = mode === 'print' ? lin(t, FLIP, FLIP + 0.18) : 1 - lin(t, UNFLIP, UNFLIP + 0.18);
  const shareO = mode === 'print' ? lin(t, SHARE_IN, SHARE_IN + 0.3) : 1 - lin(t, REWIND1 + 0.1, REWIND1 + 0.4);
  return (
    <AbsoluteFill>
      <Room />
      <div style={{ position: 'absolute', left: 0, top: -follow, width: 1920, height: 1080 }}>
        {/* the paper, behind the phone, coming out of its bottom edge */}
        <div style={{ position: 'absolute', left: 960 - 230, top: PY + PH + BZ - 6, width: 460, height: Math.max(0, len), overflow: 'hidden',
          background: 'linear-gradient(180deg,#E9DECB 0px,#FBF6EC 18px,#F3EADB 100%)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
          clipPath: 'polygon(0 0,100% 0,100% calc(100% - 12px),95% 100%,90% calc(100% - 12px),85% 100%,80% calc(100% - 12px),75% 100%,70% calc(100% - 12px),65% 100%,60% calc(100% - 12px),55% 100%,50% calc(100% - 12px),45% 100%,40% calc(100% - 12px),35% 100%,30% calc(100% - 12px),25% 100%,20% calc(100% - 12px),15% 100%,10% calc(100% - 12px),5% 100%,0 calc(100% - 12px))' }}>
          {/* WHY read top-down as it unrolls (like the "free*" receipt): each new line appears as it leaves the phone */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FULL, padding: '28px 40px 0', boxSizing: 'border-box', fontFamily: DMSANS, color: C.plum }}>
            <div style={{ height: HEAD - 28, fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em' }}>shared with partners:</div>
            {PRINT_LINES.map((l, i) => (
              <div key={i} style={{ height: LINE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '2px dashed #E2D4C0', fontSize: 29, fontWeight: 500, color: C.plum2 }}>
                <span>{l.text}</span><span style={{ fontWeight: 700, color: C.plum }}>✓</span>
              </div>
            ))}
          </div>
        </div>
        {/* the phone */}
        <div style={{ position: 'absolute', left: PX - BZ, top: PY - BZ, width: PW + BZ * 2, height: PH + BZ * 2, borderRadius: 64, background: 'linear-gradient(180deg,#3A2C46 0%,#241A2E 45%,#1A1222 100%)',
          boxShadow: '0 30px 60px rgba(6,2,12,0.6), inset 0 2px 0 rgba(255,255,255,0.16)' }}>
          <div style={{ position: 'absolute', left: BZ, top: BZ, width: PW, height: PH, borderRadius: 50, overflow: 'hidden' }}>
            {mode === 'print'
              ? <SameScreen w={PW} h={PH} lay={lay} lock={1} />
              : <OwnScreen look={{ app: 0, glow: APP_BG[0], key: 'app0', theme: 'app0' }} w={PW} h={PH} p={1} />}
            {/* each thing on the screen is outlined the moment its line prints: copied out, still in place */}
            {mode === 'print' && PRINT_LINES.map((l, i) => {
              if (!l.item) return null;
              const at = PRINT0 + (PRINT1 - PRINT0) * ((HEAD + (i + 0.6) * LINE) / FULL);
              const o = bump(t, at, 0.7);
              if (o <= 0) return null;
              const r = L[l.item];
              return <div key={i} style={{ position: 'absolute', left: r.x * PW - 4, top: r.y * PH - 4, width: r.w * PW + 8, height: r.h * PH + 8, borderRadius: 14, border: `4px solid ${C.purpleNight}`, opacity: o }} />;
            })}
            <ShareSwitch w={PW} h={PH} o={shareO} on={on} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 35%)' }} />
          </div>
          <div style={{ position: 'absolute', left: (PW + BZ * 2) / 2 - 40, top: BZ + 12, width: 80, height: 22, borderRadius: 22, background: '#120C18' }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};


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
  { text: ['where you go'], at: Q.wouldBe },
  { text: ['who you talk to'], at: Q.costOf },
  { text: ['what you watch', 'at 2 am'], at: Q.convenience },
  { text: ['how you feel'], at: Q.convenience + 0.5 },
];
if (RLINES[2].at > Q.weAll - 0.5) throw new Error('take1b: the receipt\'s last private line would print as the shot cuts');
const R_W = 150;                       // the phone's full body width: the paper comes out of its bottom edge
const R_TOP = HERO.cy + HERO.h / 2 + 7; // the phone body's bottom edge (screen + bezel)
const R_HEAD = 24, R_ROW = 22, R_ROW2 = 15, R_FONT = 13.5, R_PAD = 9;
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
  // WHY each row feeds out in the quarter second before its line is due: the words are on the paper as it arrives
  for (const l of RLINES) len += rowH(l) * ez(t, l.at - 0.24, l.at + 0.02, EASE_IN_OUT);
  return len > 0 ? (len + 8) * (1 - back) : 0;
};
export const ShelfReceipt: React.FC<{ t: number; dim?: number; back?: number }> = ({ t, dim = 0, back = 0 }) => {
  const len = receiptLen(t, back);
  if (len <= 0.5) return null;
  const teeth = Array.from({ length: 21 }, (_, i) => `${i * 5}% ${i % 2 ? '100%' : 'calc(100% - 4px)'}`).join(',');
  return (
    <div style={{ position: 'absolute', left: HERO.cx - R_W / 2, top: R_TOP, width: R_W, height: len, overflow: 'hidden',
      // WHY a filter, not an overlay: when the room hushes the paper keeps only the faint light of its own phone
      filter: `brightness(${1 - 0.55 * dim}) drop-shadow(0 6px 7px rgba(6,2,12,0.55))` }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(0 0,100% 0,${teeth.split(',').reverse().join(',')})` }}>
        {/* the paper: warm white, a slot shadow where it leaves the phone, the bend over the shelf lip (8..24 px down),
            and the glow of the screens behind it coming through towards the bottom */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#B9AE9C 0px,#EDE3D2 4px,#FBF6EC 8px,#FFFDF7 13px,#E9DFCD 22px,#D8CDBB 25px,#F6EFE3 30px,#FBF6EC 70%,#F3EADB 100%)' }} />
        <div style={{ position: 'absolute', left: R_PAD, right: R_PAD, top: 6, fontFamily: DMSANS, color: C.plum }}>
          <div style={{ height: R_HEAD, display: 'flex', alignItems: 'center', fontSize: 9.5, fontWeight: 900, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>shared with partners:</div>
          {RLINES.map((l, i) => (
            <div key={i} style={{ height: rowH(l), boxSizing: 'border-box', borderTop: '1.2px dashed #D9CAB4', paddingTop: 3, fontSize: R_FONT, lineHeight: `${R_ROW2}px`, fontWeight: 600, letterSpacing: '-0.02em', color: C.plum, whiteSpace: 'nowrap' }}>
              {l.text.map((x, j) => <div key={j}>{x}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
// The monthly bill, stacking on the shelf in front of the person's phone (world units)
// ---------------------------------------------------------------------------------------------------
// generic everyday subscriptions, no company names (brand: nothing identifying a real company)
const SUBS: [string, number, string][] = [
  ['Photo storage', 2.99, '#E6A57E'], ['Music', 10.99, '#D25AA0'], ['Films & shows', 15.49, '#9D5BD0'], ['Office apps', 9.99, '#5E8FD6'],
  ['Cloud backup', 4.99, '#6FB3A8'], ['Fitness', 12.99, '#E07A5F'], ['Password keeper', 3.99, '#8A7B96'], ['News', 8.0, '#C9A227'],
  ['Doorbell video', 4.99, '#7E9C7A'], ['Printer ink plan', 6.99, '#C387D3'], ['Car app', 7.99, '#5A6E8C'],
];
const B_FIRST = Q.weAccepted + 0.45, B_FALL = 0.16;   // WHY so short a fall: a charge lands like a weight, not a feather
// WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions pile up; the last one
// lands as "own" is spoken. The first two are already on the shelf when the shot opens.
const bDrop = (i: number) => (i < 2 ? -99 : B_FIRST + (Q.own - B_FIRST) * Math.pow((i - 2) / (SUBS.length - 3), 0.62));
const B_W = 330, B_H = 58, B_PITCH = 61;              // a card, in world px (about 560 x 100 on screen at the shot's scale)
export const BILL_X = -30;                            // the pile's centre: in front of the phone, the tagged tablet clear to its right
/** How far the camera climbs with the pile, in world px. WHY smooth and lagging: the newest charge always lands in
 *  view and the pile keeps running out of the bottom of the frame instead of the camera jumping card by card. */
export const billRise = (t: number) => {
  const n = SUBS.reduce((a, _, i) => a + (bDrop(i) < 0 ? 1 : ez(t, bDrop(i) + B_FALL - 0.05, bDrop(i) + B_FALL + 0.45, EASE_IN_OUT)), 0);
  return Math.max(0, n - 4.2) * B_PITCH;
};
const billLanded = (t: number) => SUBS.filter((_, i) => t >= bDrop(i) + B_FALL).length;
export const BillStack: React.FC<{ t: number }> = ({ t }) => (
  <>
    {/* the pile's contact shadow on the shelf */}
    <div style={{ position: 'absolute', left: BILL_X - B_W * 0.55, width: B_W * 1.1, top: -6, height: 14, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(6,2,12,0.75), transparent)' }} />
    {SUBS.map(([name, price, col], i) => {
      const d = bDrop(i);
      if (t < d) return null;
      const p = d < 0 ? 1 : ez(t, d, d + B_FALL, EASE_IN);
      const y = -(i + 1) * B_PITCH;
      const since = t - d - B_FALL;
      // WHY squash and a small rebound: weight; it hits, compresses, and settles
      const sq = d >= 0 && since > 0 ? Math.exp(-since * 16) : 0;
      const bounce = d >= 0 && since > 0 ? -Math.sin(since * 28) * Math.exp(-since * 14) * 5 : 0;
      const tilt = ((i * 37) % 7 - 3) * 0.6;
      return (
        <div key={i} style={{ position: 'absolute', left: BILL_X - B_W / 2 + ((i * 53) % 5 - 2) * 4, top: y - (1 - p) * 700 + bounce, width: B_W, height: B_H,
          transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.12}) scaleX(${1 + sq * 0.03})`, transformOrigin: '50% 100%',
          borderRadius: 10, background: 'linear-gradient(180deg,#3A2B46,#271C31)', boxShadow: '0 8px 14px rgba(6,2,12,0.6), inset 0 1px 0 rgba(255,255,255,0.16)',
          display: 'flex', alignItems: 'center', padding: '0 17px', boxSizing: 'border-box', gap: 12, fontFamily: DMSANS }}>
          <div style={{ width: 29, height: 29, borderRadius: 8, background: col, flex: 'none', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)' }} />
          <div style={{ flex: 1, fontSize: 22, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}/mo</div>
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
  const thump = n > 2 && t > lastLand ? Math.exp(-(t - lastLand) * 12) : 0;
  const o = ez(t, Q.weAccepted, Q.weAccepted + 0.5);
  return (
    <div style={{ position: 'absolute', left: 154, top: 300, fontFamily: DMSANS, color: C.nightText, opacity: o, textShadow: '0 4px 30px rgba(10,5,16,0.8)' }}>
      <div style={{ fontSize: 38, fontWeight: 500, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
      <div style={{ fontSize: 176, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.035})`, transformOrigin: '0 60%' }}>${total.toFixed(2)}</div>
    </div>
  );
};
