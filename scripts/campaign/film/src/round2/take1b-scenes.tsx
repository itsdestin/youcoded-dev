// Take 1B: the shots that step off the wall.
//  - Receipt: "what happened with your personal data". The phone's things stay where they are, a pointer
//    flips "Share with partners" on, and a receipt of them prints out of the phone. WHY: data that leaks out
//    is the true picture; the first cut showed things being grabbed, an idea the owner had already rejected.
//    In line 7 ("what happens with our data") the same receipt rolls back into the phone.
//  - SubStack: "subscribe to everything and own nothing": monthly charges slam onto a pile that runs out of
//    the frame, and the total climbs. Its reprise is "a great treasure: shareholder value": the same total,
//    one new charge slams in on "shareholder" and the total rolls over to $109.40 on "value".
//    WHY one number (reviewer 2026-11-20): the old six-bill table read as a data sheet; their treasure is
//    simply your bill going up, and the viewer already knows this counter from chapter 3.
//  - FreeTag: "our privacy would be the cost of convenience": a "free*" tag whose small print unrolls,
//    four big lines, each on its own spoken word.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Q } from './take1b-cues';
import { HERO_LOOK, HOLDOUT, OwnScreen, SameScreen, ShareSwitch, lookFor, sameLayout } from './take1b-screens';
import { Device, Shelves, WORLD, dev } from './take1b-world';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));
// WHY the real wall behind every card scene (reviewer 2026-11-20: the old blurred grey rectangles read as a missing-image
// placeholder and made these scenes feel like another film): the same shelves and the same devices, defocused and dimmed,
// at one steady angle, so the film stays in one room. Only the devices that can be seen are drawn.
type Cam = { cx: number; cy: number; s: number };
const GW: Cam = { cx: 0, cy: -430, s: 0.7 };
const camDevs = (c: Cam, skip: string[] = []) => WORLD.devs.filter((d) => !skip.includes(d.id) && Math.abs(d.cx - c.cx) < 960 / c.s + d.w && Math.abs(d.cy - c.cy) < 540 / c.s + d.h);
const GW_DEVS = camDevs(GW);
const GhostWall: React.FC<{ soft?: boolean; cam?: Cam; skip?: string[]; dy?: number; own?: boolean }> = ({ soft = false, cam = GW, skip = [], dy = 0, own = false }) => (
  // WHY softer in the rewind (round 5 reviewer: flat grey boxes read as a placeholder): less blur and a lighter veil, so the real shelves and screens read as the room
  <AbsoluteFill style={{ filter: `blur(${soft ? 6 : 13}px)` }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cam.cx * cam.s}px, ${540 - cam.cy * cam.s + dy}px) scale(${cam.s})`, transformOrigin: '0 0' }}>
      <Shelves night={1} />
      {/* WHY `own` (round 8 reviewer BLOCKER: the rewind sat on the OLD locked wall after every screen had become someone's own): in line 7
          the room behind the phone is the personalised wall, each device in its own real look (the one holdout still generic) */}
      {(cam === GW ? GW_DEVS : camDevs(cam, skip)).map((d) => <Device key={d.id} d={d} night={1} glow={own && d.id !== HOLDOUT ? lookFor(d).glow : 'rgba(236,230,244,1)'}>
        {own && d.id !== HOLDOUT ? <OwnScreen look={lookFor(d)} w={d.w} h={d.h} /> : <SameScreen w={d.w} h={d.h} lay={2} lock={d.id === 'lockLaptop' ? 1 : 0} ai={own ? 1 : 0} />}</Device>)}
    </div>
    <AbsoluteFill style={{ background: `rgba(11,6,17,${soft ? 0.48 : 0.66})` }} />
  </AbsoluteFill>
);
const Room: React.FC<{ ghosts?: boolean; soft?: boolean; cam?: Cam; skip?: string[]; dy?: number; own?: boolean }> = ({ ghosts = true, soft = false, cam, skip, dy, own }) => (
  <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 30%, #22142D 0%, #120A1B 60%, #0B0611 100%)' }}>
    {ghosts && <GhostWall soft={soft} cam={cam} skip={skip} dy={dy} own={own} />}
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgba(8,3,14,0.55) 100%)' }} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------------------------------------------
// The receipt that prints out of the phone
// ---------------------------------------------------------------------------------------------------
// WHY the wall's own phone, scaled up (round 7 reviewer: a bigger, differently drawn phone broke the cut from the wall): the same bezel,
// corner curve and camera as take1b-world's phone (136x284, bezel 7, screen corner 12), only K times larger
const K = 400 / 136;
const PW = 400, PH = Math.round(284 * K), BZ = 7 * K, PR = 12 * K;   // screen width/height, bezel, screen corner, in frame pixels
const PX = 960 - PW / 2, PY = 66;                        // screen's top-left before the camera follows the paper
// WHY the backdrop is the real wall framed on the phone's own spot (round 7 reviewer: "your phone, the same one from the wall"): the phone
// sits where the wall's phone would sit at this zoom, and its neighbours (the tablet just seen among them) are out of focus around it
const HERO_D = dev('hero');
const PRINT_LINES: { text: string; item?: 'photo' | 'msg' | 'note' }[] = [
  { text: 'your photos', item: 'photo' }, { text: 'Sam: running late!', item: 'msg' }, { text: 'pick up Mia at 3:15', item: 'note' },
  { text: 'where you were today' }, { text: 'who you message most' }, { text: 'what you looked at' },
];
// WHY the paper is the phone's own width (round 9 reviewer: a narrower strip did not look like something the phone produced), with
// smaller type (30 px header, 24 px lines) and a fixed column for the ticks so no tick ever touches its words
const PAPER = PW;
const HEAD = 62, LINE = 52;
const FULL = HEAD + PRINT_LINES.length * LINE + 30;
// the moments, all from the narrator's words
// WHY the print starts on "personal" (reviewer 2026-11-20), after the switch has been held for 0.4 s, and its last line lands 0.35 s before the cut
const SHARE_IN = Q.data - 0.3, FLIP = Q.personal - 0.46, PRINT0 = Q.personal, PRINT1 = Q.weAll - 0.35;
// WHY from "what happens" (not "And"): the tablet before it needs its own 1.2 s once its new screen is up
// WHY the rewind starts ON "what" and ends on "data" (round 5 reviewer: the paper sat finished while the words went by): the data goes back into the phone
// one row at a time, a tick per spoken word; then the phone itself dissolves into the wall behind it so the cut to the next shot matches
// WHY round 8 (reviewer BLOCKER: the lines just scrolled away with their ticks still on, and a one-frame empty wall showed before the cut):
// the receipt is TAKEN BACK. The cut into this shot comes mid-"what" (the tablet's page needs its moment first); then on "happens",
// "with" and "our" two lines at a time are struck through and pulled back into the phone, and on "data." the header goes too. The
// scene ends on a straight cut on "It's", with no dissolve.
export const RW_CUT = Q.whatHappens + 0.15;
const UNFLIP = Q.whatHappens + 0.1;
const RW_GROUP = [Q.dataWord, Q.ourWord, Q.ourWord, Q.withWord, Q.withWord, Q.happensWord, Q.happensWord];   // per row: header, then lines 1..6
if (PRINT1 - PRINT0 < 1.1) throw new Error('take1b: the receipt would print too fast to read');

export const Receipt: React.FC<{ t: number; mode: 'print' | 'rewind' }> = ({ t, mode }) => {
  // WHY a ratchet and not a linear roll (reviewer): the paper steps out one row at a time, each with its own quick ease,
  // like a receipt printer; the header is row 0 and the little tail after the last line rides with the last row
  const rows = [HEAD, ...PRINT_LINES.map((_, i) => LINE + (i === PRINT_LINES.length - 1 ? 30 : 0))];
  const pu = lin(t, PRINT0, PRINT1) * rows.length;
  const ratchet = rows.reduce((a, h, i) => a + h * ez(pu, i, i + 0.7), 0);
  // the rewind: each row is struck on its word, then pulled back into the phone a beat later
  const strikeOf = (i: number) => (mode === 'rewind' ? ez(t, RW_GROUP[i] - 0.02, RW_GROUP[i] + 0.14, EASE_IN_OUT) : 0);
  const pullOf = (i: number) => (mode === 'rewind' ? ez(t, RW_GROUP[i] + 0.16, RW_GROUP[i] + 0.42, EASE_IN_OUT) : 0);
  const back = rows.reduce((a, h, i) => a + h * pullOf(i), 0);
  const len = mode === 'print' ? ratchet : Math.max(0, FULL - back);
  const gone = 0;
  const settle = mode === 'rewind' ? -3 * bump(t, Q.dataWord + 0.4, 0.25) : 0;
  // WHY the camera holds the phone whole until the header and the first line are out (round 7 reviewer: the switch, the cause, left the
  // frame just as the receipt, the effect, began); after that it follows the paper so the newest line is always in view
  // WHY no follow in the rewind (round 8 reviewer: the phone's top was cut off): the whole scene is drawn smaller instead (below), so the
  // phone sits whole near the top of the frame with the full receipt under it
  // WHY round 9 (reviewer: the camera follow pushed the switch, the cause, off the top of the frame): no follow at all. The scene opens
  // with the phone large (0.92) and pulls back in one eased move while the paper prints, ending at exactly the framing the rewind in
  // line 7 uses (0.75), so the switch row and the whole receipt are both in frame by "data."
  const follow = 0;
  const z = mode === 'rewind' ? 0.75 : 0.92 - 0.17 * EASE_IN_OUT(lin(t, PRINT0 - 0.2, PRINT1 + 0.1));
  const cam: Cam = { cx: HERO_D.cx, cy: HERO_D.cy + (540 - (34 + z * (PY + PH / 2))) / (K * z), s: K * z };
  const lay = 2;
  const L = sameLayout(PW, PH, lay);
  // WHY the knob crosses in 6 frames (round 7 reviewer), with no hand doing it: it is switched on for you, somewhere else
  const on = mode === 'print' ? ez(t, FLIP, FLIP + 0.2, EASE_IN_OUT) : 1 - lin(t, UNFLIP, UNFLIP + 0.18);
  // WHY no switch on the rewind: that phone now wears a real youcoded window, and a drawn switch would sit over its real interface
  const shareO = mode === 'print' ? lin(t, SHARE_IN, SHARE_IN + 0.25) : 0;
  const phoneTop = PY + PH + BZ;
  return (
    <AbsoluteFill>
      {mode === 'print' ? <Room cam={cam} skip={['hero']} /> : <Room soft own />}
      <div style={{ position: 'absolute', left: 0, top: -follow + settle, width: 1920, height: 1080, opacity: 1 - gone,
        transform: `translateY(34px) scale(${z})`, transformOrigin: '50% 0' }}>
        {/* the paper, behind the phone, coming out of its bottom edge */}
        <div style={{ position: 'absolute', left: 960 - PAPER / 2, top: phoneTop - 8, width: PAPER, height: Math.max(0, len), overflow: 'hidden',
          background: 'linear-gradient(180deg,#E3D8C5 0px,#FBF6EC 14px,#F3EADB 100%)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
          clipPath: 'polygon(0 0,100% 0,100% calc(100% - 10px),95% 100%,90% calc(100% - 10px),85% 100%,80% calc(100% - 10px),75% 100%,70% calc(100% - 10px),65% 100%,60% calc(100% - 10px),55% 100%,50% calc(100% - 10px),45% 100%,40% calc(100% - 10px),35% 100%,30% calc(100% - 10px),25% 100%,20% calc(100% - 10px),15% 100%,10% calc(100% - 10px),5% 100%,0 calc(100% - 10px))' }}>
          {/* WHY read top-down as it unrolls (like the "free*" receipt): each new line appears as it leaves the phone */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FULL, padding: '22px 26px 0', boxSizing: 'border-box', fontFamily: DMSANS, color: C.plum, whiteSpace: 'nowrap' }}>
            <div style={{ height: HEAD - 22, fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em' }}>shared with partners:</div>
            {PRINT_LINES.map((l, i) => (
              <div key={i} style={{ height: LINE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '2px dashed #E2D4C0', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: C.plum2 }}>
                <span style={{ position: 'relative' }}>{l.text}
                  {/* WHY a strike drawn left to right before the line is pulled back (round 8 reviewer): it reads as "taken back", not "scrolled away" */}
                  {strikeOf(i + 1) > 0 && <span style={{ position: 'absolute', left: -4, top: '52%', height: 4, borderRadius: 4, width: `calc(${strikeOf(i + 1) * 100}% + 8px)`, background: C.purple }} />}
                </span><span style={{ width: 28, flex: 'none', textAlign: 'right', fontWeight: 800, color: C.plum, opacity: 1 - strikeOf(i + 1) }}>✓</span>
              </div>
            ))}
          </div>
        </div>
        {/* the phone: the wall's phone, scaled */}
        <div style={{ position: 'absolute', left: PX - BZ, top: PY - BZ, width: PW + BZ * 2, height: PH + BZ * 2, borderRadius: PR + BZ, background: 'linear-gradient(180deg,#3A2C46 0%,#241A2E 45%,#1A1222 100%)',
          boxShadow: '0 30px 60px rgba(6,2,12,0.6), inset 0 2px 0 rgba(255,255,255,0.16), inset 0 -3px 0 rgba(0,0,0,0.35)' }}>
          <div style={{ position: 'absolute', left: BZ, top: BZ, width: PW, height: PH, borderRadius: PR, overflow: 'hidden', background: '#000' }}>
            {mode === 'print'
              ? <SameScreen w={PW} h={PH} lay={lay} lock={1} hideTitle={shareO} />
              : <OwnScreen look={HERO_LOOK} w={PW} h={PH} />}
            {/* WHY each thing is outlined 0.15 s BEFORE its line prints (round 7 reviewer: the outlines fired after the camera had left them):
                the item lights up on the phone, then its line comes out of the bottom, so the link is seen */}
            {mode === 'print' && PRINT_LINES.map((l, i) => {
              if (!l.item) return null;
              const at = PRINT0 + (PRINT1 - PRINT0) * ((i + 1) / rows.length) - 0.15;
              const o = bump(t, at, 0.8);
              if (o <= 0) return null;
              const r = L[l.item];
              return <div key={i} style={{ position: 'absolute', left: r.x * PW - 5, top: r.y * PH - 5, width: r.w * PW + 10, height: r.h * PH + 10, borderRadius: 14, border: `5px solid ${C.purple}`, opacity: o }} />;
            })}
            <ShareSwitch w={PW} h={PH} o={shareO} on={on} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: PR, boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.7)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(122deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.035) 38%, rgba(255,255,255,0) 58%)' }} />
          </div>
          {/* the camera, in the bezel (as on the wall's phones) */}
          <div style={{ position: 'absolute', left: (PW + BZ * 2) / 2 - 2 * K, top: (BZ - 4 * K) / 2, width: 4 * K, height: 4 * K, borderRadius: 4 * K, background: '#0A060E' }} />
          {/* WHY a thin dark lip only as wide as the paper, in the phone's own bottom edge: the paper visibly comes out of the phone */}
          <div style={{ position: 'absolute', left: (PW + BZ * 2) / 2 - PAPER / 2 - 6, width: PAPER + 12, top: PH + BZ * 2 - 9, height: 7, borderRadius: 4, background: '#07040A' }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------
// The monthly bill
// ---------------------------------------------------------------------------------------------------
// generic everyday subscriptions, no company names (brand: nothing identifying a real company)
const SUBS: [string, number, string][] = [
  ['Photo storage', 2.99, '#E6A57E'], ['Music', 10.99, '#D25AA0'], ['Films & shows', 15.49, '#9D5BD0'], ['Office apps', 9.99, '#5E8FD6'],
  ['Cloud backup', 4.99, '#6FB3A8'], ['Fitness', 12.99, '#E07A5F'], ['Password keeper', 3.99, '#8A7B96'], ['News', 8.0, '#C9A227'],
  ['Doorbell video', 4.99, '#7E9C7A'], ['Printer ink plan', 6.99, '#C387D3'], ['Car app', 7.99, '#5A6E8C'],
];
const AI_LINE: [string, number, string] = ['AI assistant', 20, C.purpleNight];
const BASE_TOTAL = SUBS.reduce((a, s) => a + s[1], 0);

/** "$89.40" turning over to "$109.40" on mechanical wheels. WHY only two notches of the tens wheel (8, 9, 0)
 *  carrying the hundreds wheel from nothing to 1: one weighted tick a viewer can follow, not a blur of digits. */
const Odometer: React.FC<{ p: number; size: number }> = ({ p, size }) => {
  const tens = 8 + 2 * p, hundreds = Math.max(0, Math.min(1, tens - 9));
  const W = size * 0.53, H = size * 1.02;
  const wheel = (pos: number, blankZero: boolean, key: string) => {
    const base = Math.floor(pos), frac = pos - base;
    const show = (n: number) => (blankZero && n % 10 === 0 ? '' : String(n % 10));
    return (
      <span key={key} style={{ position: 'relative', width: blankZero ? W * Math.max(0, Math.min(1, pos)) : W, height: H, display: 'inline-block', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 0, width: W, textAlign: blankZero ? 'right' : 'center', top: -frac * H, lineHeight: 1.02 }}>{show(base)}<br />{show(base + 1)}</span>
      </span>
    );
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-start', height: H, overflow: 'hidden', fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
      <span style={{ letterSpacing: '-0.05em', marginRight: size * 0.02 }}>$</span>
      {hundreds > 0 && wheel(hundreds, true, 'h')}{wheel(tens, false, 't')}{wheel(9, false, 'o')}
      <span style={{ letterSpacing: '-0.05em' }}>.40</span>
    </span>
  );
};

export const SubStack: React.FC<{ t: number; reprise?: boolean }> = ({ t, reprise }) => {
  const lines = reprise ? [...SUBS, AI_LINE] : SUBS;
  const N = SUBS.length;
  const first = Q.weAccepted + 0.95;
  // WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions actually pile up;
  // the last one lands as "own" is spoken. In the reprise everything is already there except the new charge,
  // which slams in on "shareholder".
  // WHY the first four fall at once as the scene opens, then a short pause, then the rest accelerate to "own" (reviewer 2026-11-20:
  // one lonely card sat for 1.2 s at the cut): the pile already reads in the first half second
  const drop = (i: number) => (reprise ? (i < N ? -99 : Q.shareholder - 0.1) : i < 4 ? Q.weAccepted - 0.13 + i * 0.1 :   /* WHY -0.13 (round 7 reviewer: 0.3 s of an empty frame on the cut): the first charge is already falling on the cut frame */ first + (Q.own - first) * Math.pow((i - 4) / (N - 5), 0.62));
  const FALL = 0.16;                                     // WHY so short: a charge lands like a weight, not a feather
  const landedN = lines.filter((_, i) => t >= drop(i) + FALL).length;
  // the reprise's roll: $89.40 to $109.40 on "value", one eased turn of the wheels, then a thump as it locks
  const rp = reprise ? ez(t, Q.value + 0.02, Q.value + 0.42, EASE_IN_OUT) : 0;
  const lockThump = reprise ? Math.exp(-Math.max(0, t - Q.value - 0.42) * 12) * (t > Q.value + 0.42 ? 1 : 0) : 0;
  const total = reprise ? BASE_TOTAL + 20 * rp : lines.slice(0, landedN).reduce((a, s) => a + s[1], 0);
  const lastLand = drop(Math.max(0, landedN - 1)) + FALL;
  const thump = Math.exp(-(t - lastLand) * 12) * (landedN > 2 && t > lastLand ? 1 : 0);
  // WHY a pile that never leaves the frame (round 7 reviewer: the top card ran under the frame edge and the bottom one was sliced above the
  // headline): the newest charge always lands in the same place, level with the total; the one before sits whole beneath it; every older
  // one is pushed down into a pile of 12 px slivers, so eleven charges still end above 70% of the frame height, clear of the headline
  // WHY round 9 (reviewer: the pile only ever showed two cards and thin slivers, so "everything" never looked like more and more): the
  // slivers are 20 px and the whole pile creeps 14 px higher with every charge that lands, so by "own" the stack is plainly tall
  const CARD_H = 120, NEXT = 140, SLIVER = 20;
  const TOPY = 380 - 14 * lines.reduce((a, _, i) => a + (drop(i) < 0 ? 1 : ez(t, drop(i) + FALL, drop(i) + FALL + 0.2)), 0);
  const slotY = (sl: number) => (sl < 0 ? TOPY + sl * (TOPY + 300) : sl <= 1 ? TOPY + NEXT * sl : TOPY + NEXT + SLIVER * (sl - 1));
  const arrive = (i: number) => { const d = drop(i); return d < 0 ? 1 : ez(t, d, d + FALL, EASE_IN); };
  const count = lines.reduce((a, _, i) => a + arrive(i), 0);
  // WHY the total shows at full strength on the cut frame (round 7 reviewer: a faded $0.00 on an empty half of the frame): only the reprise fades in
  const scene = reprise ? ez(t, Q.great, Q.great + 0.25) : 1;
  // a slow push-in the whole time, so the frame never sits still
  const t0 = reprise ? Q.great : Q.weAccepted, t1 = reprise ? Q.but : Q.privacy + 0.1;
  const push = 1 + 0.07 * lin(t, t0, t1);
  const dollars = Math.floor(total), cents = total.toFixed(2).slice(-2);
  const back = reprise ? 0 : ez(t, Q.own, Q.own + 0.3, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <Room />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '30% 45%' }}>
        {/* WHY the total steps back on "own" (round 9 reviewer: at 176 px it out-shouted the "own nothing." headline): it shrinks to 60% and
            dims to 70% over 0.3 s, so the headline is the main type for its whole hold */}
        <div style={{ position: 'absolute', left: 150, top: 290, fontFamily: DMSANS, color: C.nightText, opacity: scene * (1 - 0.3 * back), transform: `scale(${1 - 0.4 * back})`, transformOrigin: '0 100%' }}>
          <div style={{ fontSize: 48, fontWeight: 500, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
          <div style={{ fontSize: 176, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.035 + lockThump * 0.05})`, transformOrigin: '0 60%',
            color: reprise && rp > 0 && rp < 1 ? C.purpleNight : undefined }}>
            {/* WHY wheels only while turning: at rest the number is set as plain type, so its spacing is exact */}
            {reprise && rp > 0 && rp < 1 ? <Odometer p={rp} size={176} /> : `$${dollars}.${cents}`}
          </div>
        </div>
        {/* the pile */}
        <div style={{ position: 'absolute', left: 800, top: 0, width: 860, height: 1080, opacity: scene, transform: `translateY(${thump * 6}px)` }}>
          {lines.map(([name, price, col], i) => {
            const d = drop(i);
            if (t < d) return null;
            const sl = count - 1 - i;                     // 0 = the newest, on top; 1 = the one before; >1 = the slivers
            const y = slotY(sl);
            const tilt = ((i * 37) % 7 - 3) * 0.3 * Math.min(1, Math.max(0, 1.6 - sl));   // the slivers lie straight, as a pile does
            const since = t - d - FALL;
            // WHY squash and a two-frame rebound: weight; it hits, compresses, and settles
            const sq = d >= 0 && since > 0 ? Math.exp(-since * 16) : 0;
            const bounce = d >= 0 && since > 0 ? -Math.sin(since * 28) * Math.exp(-since * 14) * 10 : 0;
            const isAI = reprise && i === N;
            // WHY the dead state sweeps top to bottom in 0.4 s on "nothing" (round 7 reviewer: the greying was too subtle to read):
            // every charge goes fully grey and its colour chip becomes a padlock; the bill stays
            const dead = reprise ? 0 : ez(t, Q.own + 0.33 + Math.min(sl, 10) * 0.04, Q.own + 0.5 + Math.min(sl, 10) * 0.04, EASE_IN_OUT);
            return (
              <div key={i} style={{ position: 'absolute', left: ((i * 53) % 5 - 2) * 6, top: y + bounce, width: 860, height: CARD_H,
                transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.12}) scaleX(${1 + sq * 0.03})`, transformOrigin: '50% 100%',
                filter: dead > 0 ? `saturate(${1 - dead}) brightness(${1 - 0.25 * dead})` : undefined,
                borderRadius: 18, background: isAI ? 'linear-gradient(180deg,#5A3672,#43295A)' : 'linear-gradient(180deg,#34263F,#271C31)', // WHY a band of the charge's own colour along its foot: once a card is pushed down into the pile only that edge shows, so the pile
                // reads as a stack of different bills rather than a dark smudge
                boxShadow: `0 14px 26px rgba(6,2,12,0.6), inset 0 1.5px 0 rgba(255,255,255,0.14), inset 0 -6px 0 ${col}`,
                display: 'flex', alignItems: 'center', padding: '0 30px', boxSizing: 'border-box', gap: 22, fontFamily: DMSANS }}>
                <div style={{ width: 56, height: 56, borderRadius: 15, background: dead > 0.5 ? '#4A3B57' : col, flex: 'none', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)', position: 'relative' }}>
                  {dead > 0 && <svg width={80} height={80} viewBox="0 0 24 24" style={{ position: 'absolute', left: -12, top: -12, opacity: dead, transform: `scale(${1.25 - 0.25 * dead})` }}>
                    <path d="M7.6 11V8.2a4.4 4.4 0 0 1 8.8 0V11" stroke="#E9DDF2" strokeWidth="2.4" fill="none" strokeLinecap="round" /><rect x="4.5" y="10.4" width="15" height="11" rx="2.6" fill="#E9DDF2" />
                  </svg>}
                </div>
                <div style={{ flex: 1, fontSize: 56, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: 48, fontWeight: isAI ? 900 : 500, color: isAI ? C.nightText : C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}/mo</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------
// "free*"
// ---------------------------------------------------------------------------------------------------
// WHY four lines, each on its own word (reviewer 2026-11-20): eleven small lines were unreadable on a phone
// WHY 0.25 s ahead of each word (reviewer: the tag sat blank for 0.6 s and the lines landed after their words): the line is already there as it is spoken
const PRINT: [string, number][] = [['where you go', Q.wouldBe - 0.25], ['who you talk to', Q.costOf - 0.25], ['what you watch at 2 am', Q.convenience - 0.2], ['how you feel', Q.convenience + 0.3]];

/** When the tag leaves: it is pulled up out of the top of the frame across "However" (exported so the film can show the wall under it). */
// WHY round 9 (reviewer: it whipped out in 5 frames right over the cut): it is already moving 0.25 s before "However" and is gone 0.1 s after
export const FREE_EXIT0 = Q.however - 0.25, FREE_EXIT1 = Q.however + 0.1;
export const FreeTag: React.FC<{ t: number; bare?: boolean }> = ({ t, bare = false }) => {
  const t0 = Q.privacy + 0.1;   // the scene itself starts here (the "own nothing." headline needs its full hold first)
  const dt = t - t0;
  const swing = 7 * Math.exp(-dt * 2.4) * Math.sin(dt * 7);
  const enter = ez(t, t0, t0 + 0.35);
  // WHY plate and paper share one width and one corner (round 7 reviewer: two cream rectangles of different sizes looked assembled):
  // the paper is tucked behind the plate, which throws a 1 px line of shadow onto it
  const TW = 760, PLATE_H = TW * 92 / 190, LN = 92, HEAD = 110;
  // the paper unrolls one line at a time, a beat before each line's word
  const shown = PRINT.reduce((a, [, at]) => a + ez(t, at - 0.2, at + 0.12, EASE_OUT), 0);
  const len = 50 + HEAD * ez(t, t0 + 0.05, t0 + 0.4) + shown * LN + 30 * Math.min(1, shown);
  // WHY the whole tag at 0.86 and centred on its finished size (round 7 reviewer: the string and its hole were cut by the top edge and the
  // lower 40% sat empty): the pin it hangs from is inside the frame, and the finished list is balanced top to bottom
  const G = 0.8, FULL_H = 470 + 50 + HEAD + PRINT.length * LN + 30, TOP = (1080 - FULL_H * G) / 2;
  // WHY a bigger push in the second half (reviewer: the list froze for 0.6 s before the cut): the camera keeps closing on the ticks
  const push = 1 + 0.05 * lin(t, t0, Q.however) + 0.08 * ez(t, PRINT[3][1] + 0.1, Q.however, EASE_IN_OUT);
  // WHY pulled up and out instead of a cross-fade (round 7 reviewer: the dissolve laid the list's words over the wall like a double exposure)
  const exit = EASE_IN(lin(t, FREE_EXIT0, FREE_EXIT1));
  return (
    <AbsoluteFill>
      {!bare && <Room />}
      <AbsoluteFill style={{ transform: `translateY(${-exit * 1400}px) scale(${push})`, transformOrigin: '50% 50%' }}>
        <div style={{ position: 'absolute', left: 960, top: TOP + (1 - enter) * -300, transform: `scale(${G}) rotate(${swing}deg)`, transformOrigin: '0 0' }}>
          {/* the pin it hangs from */}
          <div style={{ position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: 18, background: 'radial-gradient(circle at 35% 35%, #8A7B96, #2A1F33 70%)', boxShadow: '0 3px 6px rgba(6,2,12,0.6)' }} />
          <div style={{ position: 'absolute', left: -2, top: 0, width: 4, height: 150, background: '#D9CBE4' }} />
          <div style={{ position: 'absolute', left: -TW / 2, top: 130 + PLATE_H - 28, width: TW, height: len, overflow: 'hidden', borderRadius: '32px 32px 0 0',
            background: 'linear-gradient(180deg,#F4ECDD,#FBF5EA 30px,#F3EADB)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
            clipPath: 'polygon(0 0,100% 0,100% calc(100% - 16px),95% 100%,90% calc(100% - 16px),85% 100%,80% calc(100% - 16px),75% 100%,70% calc(100% - 16px),65% 100%,60% calc(100% - 16px),55% 100%,50% calc(100% - 16px),45% 100%,40% calc(100% - 16px),35% 100%,30% calc(100% - 16px),25% 100%,20% calc(100% - 16px),15% 100%,10% calc(100% - 16px),5% 100%,0 calc(100% - 16px))' }}>
            <div style={{ padding: '62px 56px 0', fontFamily: DMSANS, color: C.plum }}>
              <div style={{ height: HEAD - 62, fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em' }}>* paid for with:</div>
              {PRINT.map(([p, at], i) => {
                const o = ez(t, at - 0.12, at + 0.2);
                return (
                  <div key={i} style={{ height: LN, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '3px dashed #E2D4C0', fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em', color: C.plum, whiteSpace: 'nowrap',
                    opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
                    <span>{p}</span><span style={{ fontWeight: 900, color: C.purple }}>✓</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', left: -TW / 2, top: 130, width: TW, height: PLATE_H, filter: 'drop-shadow(0 1.5px 0 rgba(70,40,80,0.22)) drop-shadow(0 22px 26px rgba(6,2,12,0.45))' }}>
            <svg width={TW} height={PLATE_H} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
              <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
              <circle cx="95" cy="12" r="5" fill="#2A1F33" />
            </svg>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 70, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: 190, letterSpacing: '-0.05em', color: C.plum }}>
              {/* WHY the asterisk pulses once on "convenience" (round 9 reviewer): the joke gets its punch on the word */}
              free<span style={{ color: C.purple, transform: `translateY(-44px) scale(${1 + 0.35 * bump(t, Q.convenience + 0.05, 0.35)})`, fontSize: 140, display: 'inline-block', transformOrigin: '50% 60%' }}>*</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
