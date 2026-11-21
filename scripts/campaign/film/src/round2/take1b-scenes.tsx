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
import { APP_BG, OwnScreen, SameScreen, ShareSwitch, sameLayout, shareKnob } from './take1b-screens';
import { PointerArrow } from './take1b-world';

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
  // the pointer that flips the switch (print only)
  const knob = shareKnob(PW, PH);
  const tip = { x: PX + knob.x, y: PY + knob.y };
  const pIn = ez(t, Q.data, FLIP - 0.06, EASE_IN_OUT);
  const pOut = ez(t, FLIP + 0.35, FLIP + 1.0, EASE_IN);
  const ptr = { x: tip.x + 420 * (1 - pIn) + 380 * pOut, y: tip.y - 300 * (1 - pIn) - 700 * pOut, press: bump(t, FLIP - 0.04, 0.26), o: mode === 'print' ? 1 : 0 };
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
        <PointerArrow p={ptr} size={104} />
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
  const first = Q.weAccepted + 0.45;
  // WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions actually pile up;
  // the last one lands as "own" is spoken. In the reprise everything is already there except the new charge,
  // which slams in on "shareholder".
  const drop = (i: number) => (reprise ? (i < N ? -99 : Q.shareholder - 0.1) : i < 2 ? -99 : first + (Q.own - first) * Math.pow((i - 2) / (N - 3), 0.62));
  const FALL = 0.16;                                     // WHY so short: a charge lands like a weight, not a feather
  const landedN = lines.filter((_, i) => t >= drop(i) + FALL).length;
  // the reprise's roll: $89.40 to $109.40 on "value", one eased turn of the wheels, then a thump as it locks
  const rp = reprise ? ez(t, Q.value + 0.02, Q.value + 0.42, EASE_IN_OUT) : 0;
  const lockThump = reprise ? Math.exp(-Math.max(0, t - Q.value - 0.42) * 12) * (t > Q.value + 0.42 ? 1 : 0) : 0;
  const total = reprise ? BASE_TOTAL + 20 * rp : lines.slice(0, landedN).reduce((a, s) => a + s[1], 0);
  const lastLand = drop(Math.max(0, landedN - 1)) + FALL;
  const thump = Math.exp(-(t - lastLand) * 12) * (landedN > 2 && t > lastLand ? 1 : 0);
  const CARD_H = 104, PITCH = 114, BASE = 690;
  // WHY the camera climbs with the pile but lags it: the newest charge lands in view, and the pile keeps running out
  // of the top of the frame instead of stopping politely
  const rise = Math.max(0, landedN - 4.5) * PITCH;
  const scene = reprise ? ez(t, Q.great, Q.great + 0.25) : ez(t, Q.weAccepted, Q.weAccepted + 0.6);
  // a slow push-in the whole time, so the frame never sits still
  const t0 = reprise ? Q.great : Q.weAccepted, t1 = reprise ? Q.but : Q.privacy + 0.1;
  const push = 1 + 0.07 * lin(t, t0, t1);
  const dollars = Math.floor(total), cents = total.toFixed(2).slice(-2);
  return (
    <AbsoluteFill>
      <Room />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '30% 45%' }}>
        <div style={{ position: 'absolute', left: 190, top: 290, fontFamily: DMSANS, color: C.nightText, opacity: scene }}>
          <div style={{ fontSize: 38, fontWeight: 500, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
          <div style={{ fontSize: 176, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.035 + lockThump * 0.05})`, transformOrigin: '0 60%',
            color: reprise && rp > 0 && rp < 1 ? C.purpleNight : undefined }}>
            {/* WHY wheels only while turning: at rest the number is set as plain type, so its spacing is exact */}
            {reprise && rp > 0 && rp < 1 ? <Odometer p={rp} size={176} /> : `$${dollars}.${cents}`}
          </div>
        </div>
        {/* the pile. WHY the fade at the bottom: the older charges sink away below the frame instead of running
            through the "own nothing." headline */}
        <AbsoluteFill style={{ WebkitMaskImage: 'linear-gradient(180deg,#000 62%,transparent 78%)', maskImage: 'linear-gradient(180deg,#000 62%,transparent 78%)' }}>
          <div style={{ position: 'absolute', left: 930, top: 0, width: 760, height: 1080, transform: `translateY(${rise + thump * 9}px)` }}>
            {lines.map(([name, price, col], i) => {
              const d = drop(i);
              if (t < d) return null;
              const p = d < 0 ? 1 : ez(t, d, d + FALL, EASE_IN);
              const y = BASE - i * PITCH;
              const tilt = ((i * 37) % 7 - 3) * 0.7;
              const since = t - d - FALL;
              // WHY squash and a two-frame rebound: weight; it hits, compresses, and settles
              const sq = d >= 0 && since > 0 ? Math.exp(-since * 16) : 0;
              const bounce = d >= 0 && since > 0 ? -Math.sin(since * 28) * Math.exp(-since * 14) * 10 : 0;
              const isAI = reprise && i === N;
              return (
                <div key={i} style={{ position: 'absolute', left: ((i * 53) % 5 - 2) * 9, top: y - (1 - p) * (y + 300) + bounce, width: 720, height: CARD_H,
                  transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.12}) scaleX(${1 + sq * 0.03})`, transformOrigin: '50% 100%',
                  borderRadius: 18, background: isAI ? 'linear-gradient(180deg,#5A3672,#43295A)' : 'linear-gradient(180deg,#34263F,#271C31)', boxShadow: '0 14px 26px rgba(6,2,12,0.6), inset 0 1.5px 0 rgba(255,255,255,0.14)',
                  display: 'flex', alignItems: 'center', padding: '0 30px', boxSizing: 'border-box', gap: 22, fontFamily: DMSANS }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: col, flex: 'none', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)' }} />
                  <div style={{ flex: 1, fontSize: 40, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em' }}>{name}</div>
                  <div style={{ fontSize: 36, fontWeight: isAI ? 900 : 500, color: isAI ? C.nightText : C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}/mo</div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------
// "free*"
// ---------------------------------------------------------------------------------------------------
// WHY four lines, each on its own word (reviewer 2026-11-20): eleven small lines were unreadable on a phone
const PRINT: [string, number][] = [['where you go', Q.wouldBe], ['who you talk to', Q.costOf], ['what you watch at 2 am', Q.convenience], ['how you feel', Q.convenience + 0.5]];

export const FreeTag: React.FC<{ t: number }> = ({ t }) => {
  const t0 = Q.privacy + 0.1;
  const dt = t - t0;
  const swing = 7 * Math.exp(-dt * 2.4) * Math.sin(dt * 7);
  const enter = ez(t, t0, t0 + 0.45);
  const LN = 118, HEAD = 150;
  // the paper unrolls one line at a time, a beat before each line's word
  const shown = PRINT.reduce((a, [, at]) => a + ez(t, at - 0.2, at + 0.12, EASE_OUT), 0);
  const len = 60 + HEAD * Math.min(1, ez(t, t0 + 0.2, PRINT[0][1] - 0.2)) + shown * LN + 30 * Math.min(1, shown);
  // the camera tilts down after the paper, and pushes in the whole time
  const follow = Math.max(0, len - 640);   // WHY 640: the "free*" tag stays in view while its list is read
  const push = 1 + 0.06 * lin(t, t0, Q.however);
  return (
    <AbsoluteFill>
      <Room />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 40%' }}>
        <div style={{ position: 'absolute', left: 960, top: -70 - follow + (1 - enter) * -260, transform: `rotate(${swing}deg)`, transformOrigin: '0 0' }}>
          <div style={{ position: 'absolute', left: -2, top: 0, width: 4, height: 150, background: '#D9CBE4' }} />
          <div style={{ position: 'absolute', left: -450, top: 380, width: 900, height: len, overflow: 'hidden',
            background: 'linear-gradient(180deg,#FBF6EC,#F3EADB)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
            clipPath: 'polygon(0 0,100% 0,100% calc(100% - 16px),95% 100%,90% calc(100% - 16px),85% 100%,80% calc(100% - 16px),75% 100%,70% calc(100% - 16px),65% 100%,60% calc(100% - 16px),55% 100%,50% calc(100% - 16px),45% 100%,40% calc(100% - 16px),35% 100%,30% calc(100% - 16px),25% 100%,20% calc(100% - 16px),15% 100%,10% calc(100% - 16px),5% 100%,0 calc(100% - 16px))' }}>
            <div style={{ padding: '70px 56px 0', fontFamily: DMSANS, color: C.plum }}>
              <div style={{ height: HEAD - 70, fontSize: 46, fontWeight: 700, letterSpacing: '-0.02em' }}>* paid for with:</div>
              {PRINT.map(([p, at], i) => {
                const o = ez(t, at - 0.12, at + 0.2);
                return (
                  <div key={i} style={{ height: LN, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '3px dashed #E2D4C0', fontSize: 60, fontWeight: 700, letterSpacing: '-0.03em', color: C.plum, whiteSpace: 'nowrap',
                    opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
                    <span>{p}</span><span style={{ fontWeight: 900, color: C.purple }}>✓</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', left: -280, top: 130, width: 560, height: 272, filter: 'drop-shadow(0 26px 30px rgba(6,2,12,0.55))' }}>
            <svg width={560} height={272} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
              <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
              <circle cx="95" cy="12" r="5" fill="#2A1F33" />
            </svg>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 60, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: 150, letterSpacing: '-0.05em', color: C.plum }}>
              free<span style={{ color: C.purple, transform: 'translateY(-34px)', fontSize: 110 }}>*</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
