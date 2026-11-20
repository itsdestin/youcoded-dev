// Take 1B: the shots that step off the wall.
//  - Receipt: "what happened with your personal data". The phone's things stay where they are, a pointer
//    flips "Share with partners" on, and a receipt of them prints out of the phone. WHY: data that leaks out
//    is the true picture; the first cut showed things being grabbed, an idea the owner had already rejected.
//    In line 7 ("what happens with our data") the same receipt rolls back into the phone.
//  - SubStack: "subscribe to everything and own nothing": monthly charges pile up and the total climbs.
//    Its reprise is "a great treasure": one new line, "AI assistant", and the total ticks up by $20.
//  - Bills: "shareholder value": six people's monthly totals tick up by the same $20 in the same frame.
//    WHY: their treasure is your bill; it calls back "subscribe to everything" instead of a new picture.
//  - FreeTag: "our privacy would be the cost of convenience": a "free*" tag whose small print unrolls.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Q } from './take1b-cues';
import { OwnScreen, SameScreen, ShareSwitch, sameLayout, shareKnob } from './take1b-screens';
import { PointerArrow } from './take1b-world';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));
const Room: React.FC = () => <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 30%, #261833 0%, #150C20 60%, #0F0817 100%)' }} />;

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
const UNFLIP = Q.ourData + 0.12, REWIND0 = Q.ourData + 0.3, REWIND1 = Q.ourData + 1.5;
if (PRINT1 - PRINT0 < 1.3) throw new Error('take1b: the receipt would print too fast to read');

export const Receipt: React.FC<{ t: number; mode: 'print' | 'rewind' }> = ({ t, mode }) => {
  const frame = useCurrentFrame();
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
              : <OwnScreen app={0} w={PW} h={PH} p={1} frame={frame} caret />}
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
        <PointerArrow p={ptr} size={150} />
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

export const SubStack: React.FC<{ t: number; reprise?: boolean }> = ({ t, reprise }) => {
  const lines = reprise ? [...SUBS, AI_LINE] : SUBS;
  const N = SUBS.length;
  const first = Q.weAccepted + 0.45;
  // WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions actually pile up;
  // the last one lands as "own" is spoken. In the reprise everything is already there except the new line,
  // which lands on "treasure".
  const drop = (i: number) => (reprise ? (i < N ? -99 : Q.treasure - 0.12) : i < 2 ? -99 : first + (Q.own - first) * Math.pow((i - 2) / (N - 3), 0.62));
  const landedN = lines.filter((_, i) => t >= drop(i) + 0.2).length;
  const tick = reprise ? ez(t, Q.treasure + 0.12, Q.treasure + 0.75, EASE_IN_OUT) : 0;
  const total = reprise ? BASE_TOTAL + 20 * tick : lines.slice(0, landedN).reduce((a, s) => a + s[1], 0);
  const lastLand = drop(Math.max(0, landedN - 1)) + 0.2;
  const thump = Math.exp(-(t - lastLand) * 14) * (landedN > 2 && t > lastLand ? 1 : 0);
  const CARD_H = 104, PITCH = 114, BASE = 690;
  const rise = Math.max(0, landedN - 6) * PITCH;   // WHY: the camera climbs with the pile, so the newest charge always lands in view
  const scene = reprise ? ez(t, Q.great, Q.great + 0.25) : ez(t, Q.weAccepted, Q.weAccepted + 0.6);
  return (
    <AbsoluteFill>
      <Room />
      <div style={{ position: 'absolute', left: 200, top: 300, fontFamily: DMSANS, color: C.nightText, opacity: scene }}>
        <div style={{ fontSize: 36, fontWeight: 500, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
        <div style={{ fontSize: 170, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.04 + 0.03 * Math.sin(Math.PI * tick)})`, transformOrigin: '0 50%',
          color: reprise && tick > 0 && tick < 1 ? C.purpleNight : undefined }}>
          ${total.toFixed(2)}
        </div>
      </div>
      {/* the pile. WHY the fade at the bottom: the older charges sink away below the frame instead of running
          through the "own nothing." headline */}
      <AbsoluteFill style={{ WebkitMaskImage: 'linear-gradient(180deg,#000 60%,transparent 76%)', maskImage: 'linear-gradient(180deg,#000 60%,transparent 76%)' }}>
        <div style={{ position: 'absolute', left: 930, top: 0, width: 760, height: 1080, transform: `translateY(${rise + thump * 6}px)` }}>
          {lines.map(([name, price, col], i) => {
            const d = drop(i);
            if (t < d) return null;
            const p = d < 0 ? 1 : ez(t, d, d + 0.2, EASE_IN);
            const y = BASE - i * PITCH;
            const tilt = ((i * 37) % 7 - 3) * 0.7;
            const sq = d >= 0 ? Math.exp(-(t - d - 0.2) * 18) * (t > d + 0.2 ? 1 : 0) : 0;
            const isAI = reprise && i === N;
            return (
              <div key={i} style={{ position: 'absolute', left: ((i * 53) % 5 - 2) * 9, top: y - (1 - p) * (y + 300), width: 720, height: CARD_H,
                transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.08})`, transformOrigin: '50% 100%',
                borderRadius: 18, background: isAI ? 'linear-gradient(180deg,#4A2F5E,#3A2549)' : 'linear-gradient(180deg,#34263F,#271C31)', boxShadow: '0 14px 26px rgba(6,2,12,0.55), inset 0 1.5px 0 rgba(255,255,255,0.14)',
                display: 'flex', alignItems: 'center', padding: '0 30px', boxSizing: 'border-box', gap: 22, fontFamily: DMSANS }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: col, flex: 'none', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)' }} />
                <div style={{ flex: 1, fontSize: 38, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em' }}>{name}</div>
                <div style={{ fontSize: 34, fontWeight: isAI ? 700 : 500, color: isAI ? C.nightText : C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}/mo</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// six people's monthly bills (first names only; nobody real)
const PEOPLE: [string, number][] = [['Ana', 64.1], ['Dev', 112.75], ['Rosa', 47.96], ['Tom', 95.3], ['Kemi', 71.88], ['Lee', BASE_TOTAL]];
export const Bills: React.FC<{ t: number }> = ({ t }) => {
  const SH = Q.shareholder + 0.12;
  const line = ez(t, SH, SH + 0.3);
  // WHY one tick for all six, in the same frame: the same lockstep as the pointers' clicks, now on money
  const tick = ez(t, SH + 0.15, SH + 0.65, EASE_IN_OUT);
  const CW = 470, CH = 270, G = 40;
  const x0 = (1920 - (3 * CW + 2 * G)) / 2, y0 = (1080 - (2 * CH + G)) / 2 - 10;
  return (
    <AbsoluteFill>
      <Room />
      {PEOPLE.map(([name, base], i) => {
        const x = x0 + (i % 3) * (CW + G), y = y0 + Math.floor(i / 3) * (CH + G);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: CW, height: CH, borderRadius: 26, background: 'linear-gradient(180deg,#2E2139,#231A2D)', boxShadow: '0 18px 34px rgba(6,2,12,0.5), inset 0 1.5px 0 rgba(255,255,255,0.12)',
            padding: '28px 34px', boxSizing: 'border-box', fontFamily: DMSANS, color: C.nightText, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: C.nightText2 }}>{name} · every month</div>
            <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', color: tick > 0 && tick < 1 ? C.purpleNight : C.nightText }}>${(base + 20 * tick).toFixed(2)}</div>
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 700, color: C.purpleNight, opacity: line, transform: `translateY(${(1 - line) * 14}px)` }}>
              <span>+ AI assistant</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>$20.00</span>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------
// "free*"
// ---------------------------------------------------------------------------------------------------
const PRINT = ['where you go', 'who you talk to', 'what you search for', 'your photos', 'your contacts', 'your voice', 'when you sleep', 'what you buy', 'what you watch at 2 am', 'who your friends are', 'how you feel'];

export const FreeTag: React.FC<{ t: number }> = ({ t }) => {
  const t0 = Q.privacy + 0.1;
  const dt = t - t0;
  const swing = 7 * Math.exp(-dt * 2.4) * Math.sin(dt * 7);
  const enter = ez(t, t0, t0 + 0.45);
  // the small print unrolls from "cost" until the end of the line, then a beat more
  const unroll = ez(t, Q.costOf - 0.35, Q.convenience + 0.9, EASE_IN_OUT);
  const LN = 64;
  const len = 120 + unroll * (PRINT.length * LN + 220);
  const follow = Math.max(0, len - 500) * 0.85;      // the camera tilts down after the paper
  return (
    <AbsoluteFill>
      <Room />
      <div style={{ position: 'absolute', left: 960, top: -40 - follow + (1 - enter) * -260, transform: `rotate(${swing}deg)`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: -2, top: 0, width: 4, height: 150, background: '#D9CBE4' }} />
        <div style={{ position: 'absolute', left: -230, top: 380, width: 460, height: len, overflow: 'hidden',
          background: 'linear-gradient(180deg,#FBF6EC,#F3EADB)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
          clipPath: 'polygon(0 0,100% 0,100% calc(100% - 14px),95% 100%,90% calc(100% - 14px),85% 100%,80% calc(100% - 14px),75% 100%,70% calc(100% - 14px),65% 100%,60% calc(100% - 14px),55% 100%,50% calc(100% - 14px),45% 100%,40% calc(100% - 14px),35% 100%,30% calc(100% - 14px),25% 100%,20% calc(100% - 14px),15% 100%,10% calc(100% - 14px),5% 100%,0 calc(100% - 14px))' }}>
          <div style={{ padding: '70px 44px 0', fontFamily: DMSANS, color: C.plum }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 18 }}>* paid for with:</div>
            {PRINT.map((p, i) => (
              <div key={i} style={{ height: LN, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px dashed #E2D4C0', fontSize: 30, fontWeight: 500, color: C.plum2 }}>
                <span>{p}</span><span style={{ fontWeight: 700, color: C.plum }}>✓</span>
              </div>
            ))}
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
  );
};
