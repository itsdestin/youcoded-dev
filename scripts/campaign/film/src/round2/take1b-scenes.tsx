// Take 1B: the two shots that step off the wall.
//  - SubStack: "subscribe to everything and own nothing": monthly charges drop onto a pile that keeps growing,
//    and the monthly total climbs with every one.
//  - FreeTag: "our privacy would be the cost of convenience": a price tag that says "free*", and the
//    small print under the asterisk unrolls, and unrolls.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Q } from './take1b-cues';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const Room: React.FC = () => <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 30%, #261833 0%, #150C20 60%, #0F0817 100%)' }} />;

// generic everyday subscriptions, no company names (brand: nothing identifying a real company)
const SUBS: [string, number, string][] = [
  ['Photo storage', 2.99, '#E6A57E'], ['Music', 10.99, '#D25AA0'], ['Films & shows', 15.49, '#9D5BD0'], ['Office apps', 9.99, '#5E8FD6'],
  ['Cloud backup', 4.99, '#6FB3A8'], ['Fitness', 12.99, '#E07A5F'], ['Password keeper', 3.99, '#8A7B96'], ['News', 8.0, '#C9A227'],
  ['Doorbell video', 4.99, '#7E9C7A'], ['Printer ink plan', 6.99, '#C387D3'], ['Car app', 7.99, '#5A6E8C'],
];

export const SubStack: React.FC<{ t: number }> = ({ t }) => {
  const N = SUBS.length;
  const first = Q.weAccepted + 0.45;
  // WHY accelerating: the charges arrive slowly, then faster and faster, the way subscriptions actually pile up;
  // the last one lands as "own" is spoken
  const drop = (i: number) => (i < 2 ? -99 : first + (Q.own - first) * Math.pow((i - 2) / (N - 3), 0.62));
  const landed = SUBS.filter((_, i) => t >= drop(i) + 0.2).length;
  const total = SUBS.slice(0, landed).reduce((a, s) => a + s[1], 0);
  const lastLand = drop(Math.max(0, landed - 1)) + 0.2;
  const thump = Math.exp(-(t - lastLand) * 14) * (landed > 2 ? 1 : 0);
  const CARD_H = 104, PITCH = 114, BASE = 690;
  // the camera rises with the pile so its top stays in view, and settles at the end
  const rise = Math.max(0, landed - 6) * PITCH;   // WHY: the camera climbs with the pile, so the newest charge always lands in view
  const scene = ez(t, Q.weAccepted, Q.weAccepted + 0.6);
  return (
    <AbsoluteFill>
      <Room />
      {/* the running total, left */}
      <div style={{ position: 'absolute', left: 200, top: 300, fontFamily: DMSANS, color: C.nightText, opacity: scene }}>
        <div style={{ fontSize: 36, fontWeight: 500, color: C.nightText2, letterSpacing: '-0.01em' }}>every month</div>
        <div style={{ fontSize: 170, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: `scale(${1 + thump * 0.04})`, transformOrigin: '0 50%' }}>
          ${total.toFixed(2)}
        </div>
      </div>
      {/* the pile. WHY the fade at the bottom: the older charges sink away below the frame instead of running
          through the "own nothing." headline */}
      <AbsoluteFill style={{ WebkitMaskImage: 'linear-gradient(180deg,#000 60%,transparent 76%)', maskImage: 'linear-gradient(180deg,#000 60%,transparent 76%)' }}>
      <div style={{ position: 'absolute', left: 930, top: 0, width: 760, height: 1080, transform: `translateY(${rise + thump * 6}px)` }}>
        {SUBS.map(([name, price, col], i) => {
          const d = drop(i);
          if (t < d) return null;
          const p = i < 2 ? 1 : ez(t, d, d + 0.2, EASE_IN);
          const y = BASE - i * PITCH;
          const tilt = ((i * 37) % 7 - 3) * 0.7;
          const sq = i >= 2 ? Math.exp(-(t - d - 0.2) * 18) * (t > d + 0.2 ? 1 : 0) : 0;
          return (
            <div key={i} style={{ position: 'absolute', left: ((i * 53) % 5 - 2) * 9, top: y - (1 - p) * (y + 300), width: 720, height: CARD_H,
              transform: `rotate(${tilt}deg) scaleY(${1 - sq * 0.08})`, transformOrigin: '50% 100%',
              borderRadius: 18, background: 'linear-gradient(180deg,#34263F,#271C31)', boxShadow: '0 14px 26px rgba(6,2,12,0.55), inset 0 1.5px 0 rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', padding: '0 30px', boxSizing: 'border-box', gap: 22, fontFamily: DMSANS }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: col, flex: 'none', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)' }} />
              <div style={{ flex: 1, fontSize: 38, fontWeight: 700, color: C.nightText, letterSpacing: '-0.02em' }}>{name}</div>
              <div style={{ fontSize: 34, fontWeight: 500, color: C.nightText2, fontVariantNumeric: 'tabular-nums' }}>${price.toFixed(2)}/mo</div>
            </div>
          );
        })}
      </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const PRINT = ['where you go', 'who you talk to', 'what you search for', 'your photos', 'your contacts', 'your voice', 'when you sleep', 'what you buy', 'what you watch at 2 am', 'who your friends are', 'how you feel'];

export const FreeTag: React.FC<{ t: number }> = ({ t }) => {
  const t0 = Q.privacy + 0.1;
  const dt = t - t0;
  const swing = 7 * Math.exp(-dt * 2.4) * Math.sin(dt * 7);
  const enter = ez(t, t0, t0 + 0.45);
  // the small print unrolls from "cost" until the end of the line, then a beat more
  const unroll = ez(t, Q.costOf - 0.35, Q.convenience + 0.9, EASE_IN_OUT);
  const LINE = 64;
  const len = 120 + unroll * (PRINT.length * LINE + 220);
  const follow = Math.max(0, len - 500) * 0.85;      // the camera tilts down after the paper
  return (
    <AbsoluteFill>
      <Room />
      <div style={{ position: 'absolute', left: 960, top: -40 - follow + (1 - enter) * -260, transform: `rotate(${swing}deg)`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: -2, top: 0, width: 4, height: 150, background: '#D9CBE4' }} />
        {/* the receipt paper, behind the tag */}
        <div style={{ position: 'absolute', left: -230, top: 380, width: 460, height: len, overflow: 'hidden',
          background: 'linear-gradient(180deg,#FBF6EC,#F3EADB)', boxShadow: '0 20px 40px rgba(6,2,12,0.5)',
          clipPath: 'polygon(0 0,100% 0,100% calc(100% - 14px),95% 100%,90% calc(100% - 14px),85% 100%,80% calc(100% - 14px),75% 100%,70% calc(100% - 14px),65% 100%,60% calc(100% - 14px),55% 100%,50% calc(100% - 14px),45% 100%,40% calc(100% - 14px),35% 100%,30% calc(100% - 14px),25% 100%,20% calc(100% - 14px),15% 100%,10% calc(100% - 14px),5% 100%,0 calc(100% - 14px))' }}>
          <div style={{ padding: '70px 44px 0', fontFamily: DMSANS, color: C.plum }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 18 }}>* paid for with:</div>
            {PRINT.map((p, i) => (
              <div key={i} style={{ height: LINE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px dashed #E2D4C0', fontSize: 30, fontWeight: 500, color: C.plum2 }}>
                <span>{p}</span><span style={{ fontWeight: 700, color: C.plum }}>✓</span>
              </div>
            ))}
          </div>
        </div>
        {/* the tag */}
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
