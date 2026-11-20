// Take 2's STAGED content: the things the person makes inside youcoded (their smart-home screen, their
// money, a cute morning email). Brand guide section 8 allows this in ads: the app around them is real
// footage; what a person makes may be designed for the camera.
//
// WHY it looks like this (owner, 2026-11-20: "more closely based on the features/cards in my real pages"):
// every card here is one of the card kinds on the owner's own Home and Finance pages (mirrored by the
// practice build's practice pages, footage/stills/page-home--*.png and page-money--*.png): the row of
// status chips along the top, a lights group with a fat orange dimmer, the thermostat dial with − / + and
// Off · Cool · Heat · Auto, scenes; the net-worth chart with its Net worth / One account / Spending /
// Bills & subscriptions / Debt tabs and 1W … All range, and the Cash available / Total owed / You have
// cards. Same groupings and information, made fuller and moving.
//
// Everything is drawn in the app's CSS pixels (the page view's content box), so it sits in the real page
// frame at the real scale, in Meadow Mist's own colours and font: the look the person settled on.
import React from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { EASE_IN_OUT, EASE_OUT, FPS } from '../brand';

// WHY Nunito: it is Meadow Mist's own font (its manifest's font.family), so the page reads as the app's.
const NUNITO = loadNunito('normal', { weights: ['400', '600', '700', '800'], subsets: ['latin'] }).fontFamily;
const FREDOKA = loadFredoka('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;

// Meadow Mist's tokens (wecoded-themes/themes/meadow-mist/manifest.json), plus the warm light and cooling
// blue the owner's practice pages use for lamps and the thermostat.
export const MM = {
  canvas: '#F6FAF5', panel: 'rgba(221,233,218,0.78)', panelSolid: '#DDE9DA', inset: '#C9DCC5', well: '#C4DCBF',
  accent: '#2F7D55', accentDeep: '#24613F', edge: 'rgba(143,177,145,0.55)', edgeSoft: 'rgba(143,177,145,0.32)',
  fg: '#041008', fg2: '#1E3426', dim: '#33493A', muted: '#465B4E', faint: '#637668',
  warm: '#FFA95E', warmSoft: '#FFC690', warmTint: 'rgba(255,169,94,0.16)', warmEdge: 'rgba(240,150,80,0.38)',
  cool: '#3A86FF', red: '#E0483E', lime: '#A6D93B',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sec = (frame: number) => frame / FPS;
/** 0→1 over [a, b] seconds, eased. */
const p01 = (frame: number, a: number, b: number, e = EASE_OUT) => interpolate(sec(frame), [a, b], [0, 1], { ...clamp, easing: e });
/** A spring that starts at `at` seconds. WHY springs: "punchier" is the person's word; a spring overshoots and settles. */
const sp = (frame: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  frame < at * FPS ? 0 : spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping: 15, stiffness: 170, mass: 0.9, ...cfg } });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const usd = (n: number, cents = false) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
type R = { x: number; y: number; w: number; h: number };
const mixR = (a: R, b: R, k: number): R => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
/** Arrival: fades and rises a little. */
const rise = (k: number, d = 10): React.CSSProperties => ({ opacity: Math.min(1, k * 1.4), transform: `translateY(${(1 - k) * d}px)` });

// ---------------------------------------------------------------- icons (line icons, as on the practice pages)
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bulb: 'M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  tv: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM17 2l-5 5-5-5',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  calendar: 'M4 5h16v16H4zM16 3v4M8 3v4M4 10h16',
  dollar: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  chevron: 'm9 18 6-6-6-6',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22zM7.5 11.5h.01M10.5 7.5h.01M15.5 8.5h.01',
  speaker: 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  bed: 'M2 20V6M2 11h20v9M22 16H2M6 11V8h6v3',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z',
  card: 'M2 6h20v12H2zM2 10h20',
  wallet: 'M3 7h17v13H3zM16 13.5h.01M3 7l13-4v4',
  bars: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-3',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'm18 15-6-6-6 6',
  drop: 'M12 2.7s-6 6.3-6 11a6 6 0 0 0 12 0c0-4.7-6-11-6-11z',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
};
const Ico: React.FC<{ n: keyof typeof PATHS | string; s: number; c?: string; w?: number }> = ({ n, s, c = 'currentColor', w = 2 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
    <path d={PATHS[n]} />
  </svg>
);

// ---------------------------------------------------------------- shared pieces
/** The page's own background: Meadow Mist's canvas with a faint mint wash, like the practice pages. */
const PageBg: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 85% 0%, #FFFFFF 0%, ${MM.canvas} 45%, #E8F1E5 100%)` }} />
);
const Panel: React.FC<{ r: R; style?: React.CSSProperties; children?: React.ReactNode }> = ({ r, style, children }) => (
  <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 18, background: MM.panel,
    border: `1px solid ${MM.edgeSoft}`, boxShadow: '0 8px 22px rgba(30,52,38,0.09), inset 0 1px 0 rgba(255,255,255,0.7)', overflow: 'hidden', ...style }}>{children}</div>
);
/** A status chip from the page's top row: a coloured round icon, then a few words. */
const Chip: React.FC<{ icon: string; dot: string; ic?: string; text: string; style?: React.CSSProperties; filled?: boolean }> = ({ icon, dot, ic = MM.fg2, text, style, filled }) => (
  <div style={{ height: 30, padding: '0 12px 0 4px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    background: filled ? MM.accent : 'rgba(255,255,255,0.55)', color: filled ? '#fff' : MM.fg2, border: `1px solid ${filled ? MM.accentDeep : MM.edgeSoft}`,
    boxShadow: filled ? '0 4px 12px rgba(47,125,85,0.35)' : '0 1px 2px rgba(30,52,38,0.06)', ...style }}>
    <div style={{ width: 22, height: 22, borderRadius: 22, background: dot, display: 'grid', placeItems: 'center' }}><Ico n={icon} s={13} c={ic} w={2.2} /></div>
    {text}
  </div>
);
const RoundBtn: React.FC<{ icon: string; size?: number; style?: React.CSSProperties }> = ({ icon, size = 28, style }) => (
  <div style={{ width: size, height: size, borderRadius: size, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.6)', border: `1px solid ${MM.edgeSoft}`, color: MM.dim, ...style }}>
    <Ico n={icon} s={size * 0.5} />
  </div>
);
/** The fat dimmer from the owner's lights cards: an orange fill and a white knob. `track` is its thickness. */
const Dimmer: React.FC<{ value: number; track: number; width: number; on?: boolean; color?: string }> = ({ value, track, width, on = true, color = MM.warm }) => {
  const knob = track + 6;
  const x = Math.max(knob / 2, Math.min(width - knob / 2, width * value));
  return (
    <div style={{ position: 'relative', width, height: knob }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 3, height: track, borderRadius: track, background: 'rgba(160,190,158,0.45)' }} />
      <div style={{ position: 'absolute', left: 0, top: 3, height: track, width: on ? x + knob / 2 : 0, borderRadius: track,
        background: `linear-gradient(90deg, ${MM.warmSoft}, ${color})`, boxShadow: on ? `0 2px ${track * 0.5}px rgba(255,150,70,0.35)` : 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: x - knob / 2, width: knob, height: knob, borderRadius: knob, background: '#fff',
        boxShadow: '0 2px 6px rgba(30,52,38,0.25), 0 0 0 1px rgba(30,52,38,0.06)' }} />
    </div>
  );
};
/** The bulb tile: an orange disc when the light is on, a quiet mint one when it is off. */
const BulbTile: React.FC<{ size: number; on: number; glow?: number }> = ({ size, on, glow = 0 }) => (
  <div style={{ width: size, height: size, borderRadius: size, display: 'grid', placeItems: 'center', flex: 'none',
    background: on > 0.5 ? `radial-gradient(circle at 40% 35%, ${MM.warmSoft}, ${MM.warm})` : 'rgba(255,255,255,0.7)',
    border: on > 0.5 ? '1px solid rgba(230,130,60,0.35)' : `1px solid ${MM.edgeSoft}`,
    boxShadow: on > 0.5 ? `0 0 ${6 + 18 * glow}px rgba(255,160,80,${0.35 + 0.4 * glow})` : 'none' }}>
    <Ico n="bulb" s={size * 0.5} c={on > 0.5 ? '#5B2E0C' : MM.faint} />
  </div>
);
/** The round on/off button at the right of a light (the practice pages draw it as a filled orange dot). */
const Dot: React.FC<{ on: boolean; size?: number; pop?: number }> = ({ on, size = 22, pop = 0 }) => (
  <div style={{ width: size, height: size, borderRadius: size, flex: 'none', transform: `scale(${1 + 0.25 * pop})`,
    background: on ? MM.warm : 'rgba(255,255,255,0.7)', border: on ? '2px solid #fff' : `2px solid ${MM.edge}`,
    boxShadow: on ? '0 0 0 1px rgba(230,130,60,0.4), 0 2px 6px rgba(255,150,70,0.4)' : 'none' }} />
);

// ---------------------------------------------------------------- the thermostat dial (as on the practice pages)
const Dial: React.FC<{ size: number; set: number; inside: number; bounce?: number }> = ({ size, set, inside, bounce = 0 }) => {
  // 260-degree arc, open at the bottom; the set point (60°-85°) sits along it.
  const r = size * 0.4, c = size / 2, sw = Math.max(6, size * 0.075);
  const a0 = 140, span = 260, k = (set - 60) / 25;
  const pt = (deg: number) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a0 + span * k), [xe, ye] = pt(a0 + span);
  const big = span * k > 180 ? 1 : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M${x0} ${y0} A${r} ${r} 0 1 1 ${xe} ${ye}`} stroke="rgba(160,190,158,0.5)" strokeWidth={sw} fill="none" strokeLinecap="round" />
        <path d={`M${x0} ${y0} A${r} ${r} 0 ${big} 1 ${x1} ${y1}`} stroke={MM.cool} strokeWidth={sw} fill="none" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r={sw * 0.95} fill="#fff" stroke={MM.cool} strokeWidth={sw * 0.35} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: Math.max(9, size * 0.075), color: MM.dim, fontWeight: 700 }}>Cooling to</div>
          <div style={{ fontSize: size * 0.27, fontWeight: 800, color: MM.fg, lineHeight: 1, letterSpacing: '-0.03em', transform: `scale(${1 + 0.14 * bounce})` }}>{Math.round(set)}°</div>
          <div style={{ fontSize: Math.max(9, size * 0.068), color: MM.muted, fontWeight: 600, marginTop: size * 0.02 }}>{inside}° inside</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the smart-home screen
export type HomeTimes = { build: number; rearrange: number; bigger: number };

/** `W`×`H` is the page view's content box in CSS px (about 882 × 499). One screen, three states:
 *  everything on one screen → "my room on the front, everything else on a separate tab" → bigger sliders,
 *  punchier motion. */
export const HomeUI: React.FC<{ W: number; H: number; T: HomeTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame();
  const t = sec(frame);
  const pad = 16, gap = 12, top = 60;
  const built = (d: number) => sp(frame, T.build + d, { damping: 16, stiffness: 190 });
  // WHY a spring for the rearrange: the rooms are seen MOVING to where they now live, not cross-faded.
  const re = sp(frame, T.rearrange + 0.08, { damping: 19, stiffness: 120 });
  // WHY low damping on "bigger": it is the person's "punchier" made literal: everything overshoots, then settles.
  const big = sp(frame, T.bigger, { damping: 8, stiffness: 180, mass: 0.8 });
  const cw = (W - pad * 2 - gap * 2) / 3, ch = (H - top - pad - gap) / 2;
  const grid = (i: number): R => ({ x: pad + (i % 3) * (cw + gap), y: top + Math.floor(i / 3) * (ch + gap), w: cw, h: ch });
  // layout B: the person's room fills the front; lights on the left, the thermostat and scenes on the right
  const colR = 300;
  const lightsB: R = { x: pad, y: top, w: W - pad * 2 - colR - gap, h: H - top - pad };
  const thermoB: R = { x: W - pad - colR, y: top, w: colR, h: 286 };
  const scenesB: R = { x: W - pad - colR, y: top + 286 + gap, w: colR, h: H - top - pad - 286 - gap };
  const tabX = pad + 118;    // where "Everything else" sits; the other rooms fold into it

  const lights = mixR(grid(0), lightsB, re);
  const thermo = mixR(grid(1), thermoB, re);
  // WHY early: the card must never be seen empty while it grows (a 2026-11-20 frame check caught it bare).
  const fullIn = p01(frame, T.rearrange + 0.04, T.rearrange + 0.34);
  // "punchier": after the sliders grow, each light gives a little show of its new spring, then settles back
  // to exactly where it was (WHY: an earlier cut that changed a light read as "it changed my home unasked").
  const show = (at: number, back: number) => sp(frame, at, { damping: 9, stiffness: 210 }) - sp(frame, at + back, { damping: 10, stiffness: 190 });
  const LIGHTS = [
    { name: 'Desk lamp', val: 0.64 + 0.22 * show(T.bigger + 0.7, 0.55), on: true, palette: false },
    { name: 'Ceiling light', val: 0.0, on: false, palette: false },
    { name: 'LED strip', val: 0.4 + 0.18 * show(T.bigger + 1.15, 0.5), on: true, palette: true },
  ];
  const onCount = LIGHTS.filter((l) => l.on).length;
  // WHY one house-wide count that never changes (review 2026-11-20: the chip read "6 on" over five lit
  // lights, then silently became a room count): my room's 2 + living room 1 + kitchen pendants + porch lantern.
  const thermoBounce = Math.max(0, Math.sin(Math.min(1, Math.max(0, t - T.bigger - 1.6) / 0.32) * Math.PI)) * (t > T.bigger + 1.6 ? 1 : 0);

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: NUNITO, color: MM.fg, overflow: 'hidden' }}>
      <PageBg />
      {/* the top row of status chips, the same kinds as the owner's Home page */}
      <div style={{ position: 'absolute', left: pad, top: 15, right: pad, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ ...rise(built(0)), position: 'relative', height: 30, display: 'flex' }}>
          {/* "Home" becomes the "My room" tab; "Everything else" opens out beside it */}
          <div style={{ height: 30, padding: '0 13px 0 5px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800,
            background: MM.accent, color: '#fff', boxShadow: '0 4px 12px rgba(47,125,85,0.35)', position: 'relative', zIndex: 2, minWidth: 74 + 26 * re }}>
            <div style={{ width: 22, height: 22, borderRadius: 22, background: '#fff', display: 'grid', placeItems: 'center' }}><Ico n="home" s={13} c={MM.accent} w={2.2} /></div>
            <span style={{ position: 'relative' }}>
              <span style={{ opacity: 1 - re }}>Home</span>
              <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', opacity: re }}>My room</span>
            </span>
          </div>
          <div style={{ height: 30, marginLeft: -30, paddingLeft: 30 + 12 * re, paddingRight: 12 * re, width: 30 + 132 * re, overflow: 'hidden', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 12.5, fontWeight: 700, color: MM.fg2, whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.55)', border: `1px solid ${MM.edgeSoft}`, boxSizing: 'border-box', opacity: Math.min(1, re * 3) }}>
            Everything else
            <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 10, background: MM.accent, color: '#fff', transform: `scale(${0.6 + 0.4 * sp(frame, T.rearrange + 0.45, { damping: 9 })})` }}>4</span>
          </div>
        </div>
        <div style={rise(built(0.04))}><Chip icon="bulb" dot={MM.warmSoft} ic="#5B2E0C" text={`${onCount + OTHERS_ON} on`} /></div>
        <div style={rise(built(0.08))}><Chip icon="moon" dot={MM.lime} ic="#24410A" text="58° out · 72° in" /></div>
        <div style={{ ...rise(built(0.12)), opacity: Math.min(1, built(0.12) * 1.4) * (1 - re), display: re > 0.98 ? 'none' : 'block' }}><Chip icon="tv" dot={MM.accent} ic="#fff" text="1 playing" /></div>
        <div style={rise(built(0.16))}><Chip icon="lock" dot="#BFE3CF" ic={MM.accentDeep} text="All locked" /></div>
        <div style={{ flex: 1 }} />
        <div style={{ ...rise(built(0.2)), height: 30, padding: '0 14px', borderRadius: 30, display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 800, color: MM.fg2, background: 'rgba(255,255,255,0.6)', border: `1px solid ${MM.edgeSoft}` }}>Edit</div>
        <div style={rise(built(0.22))}><RoundBtn icon="gear" size={30} /></div>
      </div>

      {/* the other rooms: on the one screen first, then folded away into "Everything else" */}
      {OTHER_ROOMS.map((room, k) => {
        const i = k + 2;
        const a = built(0.06 + 0.05 * i);
        const fold = interpolate(re, [0, 1], [0, 1], clamp);
        const r = mixR(grid(i), { x: tabX + 30, y: 18, w: 70, h: 24 }, fold);
        const fade = 1 - p01(frame, T.rearrange + 0.05, T.rearrange + 0.3);
        if (fade <= 0.001 || a <= 0.001) return null;
        return (
          <Panel key={room.name} r={r} style={{ opacity: Math.min(1, a * 1.4) * fade, transform: `scale(${0.94 + 0.06 * a})` }}>
            <div style={{ width: cw, height: ch, transform: `scale(${r.w / cw}, ${r.h / ch})`, transformOrigin: '0 0' }}>
              <RoomBody room={room} w={cw} />
            </div>
          </Panel>
        );
      })}

      {/* my room's lights */}
      <Panel r={lights} style={{ ...rise(built(0.06), 14), zIndex: 3, boxShadow: `0 8px 22px rgba(30,52,38,0.09), 0 0 ${30 * big}px rgba(255,169,94,${0.25 * Math.min(1, big)})` }}>
        <div style={{ position: 'absolute', left: 16, top: 13, right: 16, display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <div style={{ fontSize: lerp(16, 20, re), fontWeight: 800, letterSpacing: '-0.01em' }}>My room</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: MM.muted, opacity: re }}>3 lights · thermostat</div>
        </div>
        {/* compact (one screen): the lights as one group, like the practice page's "Lights · 2 of 3 on" */}
        <div style={{ position: 'absolute', left: 12, right: 12, top: 44, opacity: 1 - p01(frame, T.rearrange, T.rearrange + 0.18) }}>
          <GroupTile name="Lights" sub="2 of 3 on" value={0.58} width={cw - 24} />
        </div>
        {/* full (front tab): every light with its own dimmer */}
        <div style={{ position: 'absolute', left: 12, top: 46, width: lightsB.w - 24, bottom: 12, opacity: fullIn, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LIGHTS.map((l, k) => {
            const inK = p01(frame, T.rearrange + 0.06 + 0.06 * k, T.rearrange + 0.44 + 0.06 * k);
            const grow = sp(frame, T.bigger + 0.08 * k, { damping: 8, stiffness: 180, mass: 0.8 });
            const pop = show(T.bigger + 0.08 * k, 0.18);
            const track = lerp(10, 28, grow);
            return (
              <div key={l.name} style={{ flex: 1, borderRadius: 14, padding: '0 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: lerp(8, 10, grow),
                background: l.on ? `linear-gradient(135deg, ${MM.warmTint}, rgba(255,255,255,0.35))` : 'rgba(255,255,255,0.4)',
                border: `1px solid ${l.on ? MM.warmEdge : MM.edgeSoft}`, opacity: inK, transform: `translateX(${(1 - inK) * 18}px) scale(${1 + 0.025 * pop})` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <BulbTile size={lerp(32, 38, grow)} on={l.on ? 1 : 0} glow={l.on ? Math.max(0, pop) + l.val * 0.3 : 0} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: lerp(14, 16, grow), fontWeight: 800 }}>{l.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: MM.muted, fontVariantNumeric: 'tabular-nums' }}>{l.on ? `${Math.round(l.val * 100)}%` : 'Off'}</div>
                  </div>
                  {l.palette && <RoundBtn icon="palette" size={lerp(26, 30, grow)} />}
                  <Dot on={l.on} size={lerp(20, 26, grow)} pop={pop} />
                </div>
                <Dimmer value={l.val} track={track} width={lightsB.w - 24 - 28} on={l.on} />
              </div>
            );
          })}
        </div>
      </Panel>

      {/* the thermostat: a small dial on the one screen, the full control on the front tab */}
      <Panel r={thermo} style={{ ...rise(built(0.1), 14), zIndex: 3, background: `linear-gradient(160deg, rgba(196,222,240,0.85), ${MM.panel})` }}>
        <div style={{ position: 'absolute', left: 16, top: 13, fontSize: lerp(16, 17, re), fontWeight: 800 }}>Thermostat</div>
        {(() => {
          const size = Math.min(thermo.w * 0.62, thermo.h - lerp(56, 110, re));
          return (
            <div style={{ position: 'absolute', left: (thermo.w - size) / 2, top: lerp(38, 40, re), transform: `scale(${1 + 0.05 * thermoBounce})` }}>
              <Dial size={size} set={71} inside={73} bounce={thermoBounce} />
            </div>
          );
        })()}
        <div style={{ position: 'absolute', left: 16, right: 16, top: thermo.h * 0.46 - 2, display: 'flex', justifyContent: 'space-between', opacity: fullIn }}>
          <RoundBtn icon="minus" size={lerp(34, 38, big)} /><RoundBtn icon="plus" size={lerp(34, 38, big)} />
        </div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, height: 32, borderRadius: 32, display: 'flex', padding: 3, gap: 2, background: 'rgba(255,255,255,0.55)', border: `1px solid ${MM.edgeSoft}`, opacity: fullIn }}>
          {['Off', 'Cool', 'Heat', 'Auto'].map((m) => (
            <div key={m} style={{ flex: 1, borderRadius: 26, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
              background: m === 'Cool' ? MM.cool : 'transparent', color: m === 'Cool' ? '#fff' : MM.dim, boxShadow: m === 'Cool' ? '0 3px 10px rgba(58,134,255,0.4)' : 'none' }}>{m}</div>
          ))}
        </div>
      </Panel>

      {/* scenes, only on the front tab */}
      <Panel r={scenesB} style={{ opacity: p01(frame, T.rearrange + 0.4, T.rearrange + 0.75), transform: `translateY(${(1 - p01(frame, T.rearrange + 0.4, T.rearrange + 0.75)) * 14}px)`, zIndex: 3 }}>
        <div style={{ position: 'absolute', left: 16, top: 12, fontSize: 15, fontWeight: 800 }}>Scenes</div>
        <div style={{ position: 'absolute', left: 12, right: 12, top: 40, bottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['book', 'Focus', '#E7F1DA'], ['sun', 'Wind down', '#FFE6CF'], ['film', 'Movie', '#DDE8FA'], ['bed', 'Sleep', '#E9E1F6']].map(([ic, name, bg], k) => {
            const b = show(T.bigger + 1.9 + 0.08 * k, 0.16);
            return (
              <div key={name} style={{ borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', fontSize: 13, fontWeight: 800, color: MM.fg2,
                background: bg, border: `1px solid ${MM.edgeSoft}`, transform: `scale(${1 + 0.06 * b})` }}>
                <Ico n={ic} s={15} c={MM.dim} />{name}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
};

type Room = { name: string; light: string; sub: string; on: number; extra: [string, string] };
const OTHER_ROOMS: Room[] = [
  { name: 'Living room', light: 'Lights', sub: '1 of 2 on', on: 0.55, extra: ['speaker', 'Speaker · playing'] },
  { name: 'Kitchen', light: 'Pendants', sub: '80%', on: 0.8, extra: ['drop', 'Dishwasher · 12 min left'] },
  { name: 'Hallway', light: 'Ceiling', sub: 'Off', on: 0, extra: ['activity', 'Motion · 4 min ago'] },
  { name: 'Porch', light: 'Lantern', sub: 'On at sunset', on: 1, extra: ['lock', 'Front door · locked'] },
];
const OTHERS_ON = 3;   // living room (1 of 2), kitchen pendants, porch lantern: the lit lights outside my room
const RoomBody: React.FC<{ room: Room; w: number }> = ({ room, w }) => (
  <>
    <div style={{ position: 'absolute', left: 16, top: 13, fontSize: 16, fontWeight: 800 }}>{room.name}</div>
    <div style={{ position: 'absolute', left: 12, right: 12, top: 44 }}>
      <GroupTile name={room.light} sub={room.sub} value={room.on} width={w - 24} />
      <div style={{ marginTop: 8, height: 34, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: 'rgba(255,255,255,0.45)', border: `1px solid ${MM.edgeSoft}`, fontSize: 12, fontWeight: 700, color: MM.dim }}>
        <Ico n={room.extra[0]} s={14} c={MM.dim} />{room.extra[1]}
      </div>
    </div>
  </>
);
/** The practice page's light group: bulb tile, "Lights · 2 of 3 on", a palette button, and its dimmer. */
const GroupTile: React.FC<{ name: string; sub: string; value: number; width: number }> = ({ name, sub, value, width }) => (
  <div style={{ borderRadius: 14, padding: '10px 12px', background: value > 0 ? `linear-gradient(135deg, ${MM.warmTint}, rgba(255,255,255,0.35))` : 'rgba(255,255,255,0.4)', border: `1px solid ${value > 0 ? MM.warmEdge : MM.edgeSoft}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <BulbTile size={30} on={value > 0 ? 1 : 0} />
      <div style={{ flex: 1, lineHeight: 1.2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{name}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: MM.muted }}>{sub}</div>
      </div>
      <RoundBtn icon="palette" size={24} />
    </div>
    <div style={{ marginTop: 9 }}><Dimmer value={value} track={10} width={width - 24} on={value > 0} /></div>
  </div>
);

// ---------------------------------------------------------------- money
export type MoneyTimes = { connect: number; bills: number };
// The person's numbers (practice data). They agree everywhere they appear, the email included:
// you have = checking + savings + investments; net worth = you have − the card; cash available = checking.
const CHECKING = 6240.12, SAVINGS = 12940, INVEST = 6244, CARD = 612.4;
const HAVE = CHECKING + SAVINGS + INVEST, NET = HAVE - CARD;
type Bill = { name: string; day: number; amt: number; kind: keyof typeof KIND };
const KIND = {
  home: { col: '#F0964A', label: 'Home' }, util: { col: '#2FA59A', label: 'Utilities' }, ins: { col: '#3A86FF', label: 'Insurance' },
  phone: { col: '#8B6CF0', label: 'Phone & internet' }, subs: { col: '#E46AA8', label: 'Subscriptions' },
};
export const BILLS: Bill[] = [
  { name: 'Rent', day: 1, amt: 1450, kind: 'home' }, { name: 'Car insurance', day: 3, amt: 118, kind: 'ins' },
  { name: 'Electric', day: 6, amt: 82.4, kind: 'util' }, { name: 'Internet', day: 9, amt: 60, kind: 'phone' },
  { name: 'Phone', day: 12, amt: 45, kind: 'phone' }, { name: 'Gym', day: 15, amt: 39, kind: 'subs' },
  { name: 'Water', day: 18, amt: 34.1, kind: 'util' }, { name: 'TV streaming', day: 20, amt: 15.49, kind: 'subs' },
  { name: 'Renter’s insurance', day: 22, amt: 14, kind: 'ins' }, { name: 'Music', day: 25, amt: 11.99, kind: 'subs' },
  { name: 'Cloud storage', day: 28, amt: 2.99, kind: 'subs' },
];
const BILLS_TOTAL = BILLS.reduce((s, b) => s + b.amt, 0);
const TODAY = 10;   // the 10th: Phone (12th) and Gym (15th) are the "2 due this week"
// 31 days of net worth, gently up with a dip around rent day (deterministic, so every render matches)
const NET_SERIES = Array.from({ length: 31 }, (_, i) => NET - 1204 * (1 - i / 30) + 260 * Math.sin(i * 0.7) * (1 - i / 40) - (i >= 1 && i < 4 ? 900 * (1 - (i - 1) / 3) : 0) + (i === 30 ? 0 : 0));

export const MoneyUI: React.FC<{ W: number; H: number; T: MoneyTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame(); const t = sec(frame);
  const pad = 16, top = 60, gap = 12;
  const connecting = t < T.connect + 0.4;
  const a = (d: number) => sp(frame, T.connect + 0.3 + d, { damping: 16, stiffness: 180 });
  const count = p01(frame, T.connect + 0.4, T.connect + 1.4, EASE_OUT);
  const tab = p01(frame, T.bills, T.bills + 0.35, EASE_IN_OUT);            // the selected tab slides to "Bills & subscriptions"
  const swap = p01(frame, T.bills + 0.12, T.bills + 0.4, EASE_IN_OUT);     // the card's content changes under it
  const left: R = { x: pad, y: top, w: 548, h: H - top - pad };
  const sideX = left.x + left.w + gap, sideW = W - pad - sideX, sideH = (left.h - gap * 2) / 3;
  const TABS = ['Net worth', 'One account', 'Spending', 'Bills & subscriptions', 'Debt'];
  const TABW = [74, 92, 70, 146, 48];
  const tabX = (i: number) => TABW.slice(0, i).reduce((s, w) => s + w + 6, 0);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: NUNITO, color: MM.fg, overflow: 'hidden' }}>
      <PageBg />
      {/* the top row, as on the owner's Finance page */}
      <div style={{ position: 'absolute', left: pad, top: 15, right: pad, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={rise(a(-0.3))}><Chip filled icon="dollar" dot="#fff" ic={MM.accent} text="Finance" /></div>
        <div style={rise(a(-0.25))}>
          <Chip icon={connecting ? 'refresh' : 'bank'} dot={connecting ? MM.warmSoft : '#BFE3CF'} ic={connecting ? '#5B2E0C' : MM.accentDeep}
            text={connecting ? 'Connecting to First Harbor Bank…' : 'First Harbor Bank · 4 accounts'} />
        </div>
        <div style={{ ...rise(a(0.1)) }}>
          <Chip icon="calendar" dot={t > T.bills + 0.5 ? MM.warmSoft : '#E4EEDF'} ic={MM.fg2} text="2 due this week"
            style={{ transform: `scale(${1 + 0.08 * (sp(frame, T.bills + 0.9, { damping: 8 }) - sp(frame, T.bills + 1.1, { damping: 10 }))})` }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...rise(a(0.15)), fontSize: 12, fontWeight: 600, color: MM.muted }}>{connecting ? 'Checking…' : 'Checked just now'}</div>
        <div style={{ ...rise(a(0.18)), height: 30, padding: '0 12px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: MM.fg2, background: '#CFE3CB', border: `1px solid ${MM.edgeSoft}` }}>
          <Ico n="refresh" s={13} c={MM.fg2} />Check now
        </div>
      </div>

      {/* the big card: net worth first, then "Bills & subscriptions" */}
      <Panel r={left} style={rise(a(0), 16)}>
        <div style={{ position: 'absolute', left: 14, top: 13, height: 26 }}>
          {/* the sliding selection behind the tabs */}
          <div style={{ position: 'absolute', top: 0, height: 26, borderRadius: 26, background: '#C2D8BE', border: `1px solid ${MM.edge}`,
            left: lerp(tabX(0), tabX(3), tab), width: lerp(TABW[0], TABW[3], tab) }} />
          {TABS.map((n, i) => (
            <div key={n} style={{ position: 'absolute', left: tabX(i), top: 0, width: TABW[i], height: 26, borderRadius: 26, display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800,
              color: MM.fg2, border: `1px solid ${MM.edgeSoft}`, boxSizing: 'border-box' }}>{n}</div>
          ))}
        </div>
        {/* net worth */}
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - swap, transform: `translateX(${-swap * 24}px)` }}>
          <div style={{ position: 'absolute', left: 18, top: 54, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', color: MM.muted }}>NET WORTH</div>
          <div style={{ position: 'absolute', left: 16, top: 66, fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{usd(NET * count)}</div>
          <div style={{ position: 'absolute', left: 18, top: 122, height: 22, padding: '0 9px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800,
            color: MM.accentDeep, background: 'rgba(47,125,85,0.14)', ...rise(a(0.5), 6) }}><Ico n="up" s={12} c={MM.accentDeep} w={2.6} />Up $1,204 in 30 days</div>
          <div style={{ position: 'absolute', right: 16, top: 56, height: 28, borderRadius: 28, display: 'flex', padding: 2, background: 'rgba(196,220,191,0.7)', border: `1px solid ${MM.edgeSoft}`, ...rise(a(0.2), 6) }}>
            {['1W', '1M', '3M', '6M', '1Y', 'All'].map((r) => (
              <div key={r} style={{ width: 34, borderRadius: 24, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: r === '1M' ? MM.fg : 'transparent', color: r === '1M' ? '#fff' : MM.dim }}>{r}</div>
            ))}
          </div>
          <NetChart x={14} y={156} w={left.w - 28} h={left.h - 156 - 14} draw={p01(frame, T.connect + 0.55, T.connect + 1.75, EASE_IN_OUT)} />
        </div>
        {/* bills & subscriptions */}
        {swap > 0 && <BillsView frame={frame} T={T} w={left.w} h={left.h} k={swap} />}
      </Panel>

      {/* the three cards down the side (the owner's Cash available / Total owed / You have) */}
      {[
        { icon: 'wallet', label: 'CASH AVAILABLE', value: CHECKING, sub: `After ${usd(BILLS_TOTAL)} still due this month`, hot: true },
        { icon: 'card', label: 'TOTAL OWED', value: -CARD, sub: 'One card · due on the 14th', hot: false },
        { icon: 'bars', label: 'YOU HAVE', value: HAVE, sub: 'Checking, savings, investments', hot: false },
      ].map((c, i) => {
        const k = a(0.12 + 0.08 * i);
        const hot = c.hot ? sp(frame, T.bills + 0.8, { damping: 9 }) - sp(frame, T.bills + 1.05, { damping: 11 }) : 0;
        return (
          <Panel key={c.label} r={{ x: sideX, y: top + i * (sideH + gap), w: sideW, h: sideH }} style={{ ...rise(k, 16), transform: `translateY(${(1 - k) * 16}px) scale(${1 + 0.03 * hot})` }}>
            <div style={{ position: 'absolute', left: 14, top: 0, bottom: 0, right: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', display: 'grid', placeItems: 'center', background: '#C9DFC4' }}><Ico n={c.icon} s={18} c={MM.accentDeep} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: MM.muted }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{c.value < 0 ? '−' : ''}{usd(c.value * count)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: c.hot && t > T.bills + 0.6 ? MM.accentDeep : MM.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</div>
              </div>
              <Ico n="chevron" s={16} c={MM.faint} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
};

/** The net-worth line, drawn left to right, over a soft fill, with the practice page's axis labels. */
const NetChart: React.FC<{ x: number; y: number; w: number; h: number; draw: number }> = ({ x, y, w, h, draw }) => {
  const axisW = 46, plotW = w - axisW, plotH = h - 22;
  const lo = Math.min(...NET_SERIES) - 300, hi = Math.max(...NET_SERIES) + 300;
  const px = (i: number) => axisW + (i / 30) * plotW;
  const py = (v: number) => ((hi - v) / (hi - lo)) * plotH;
  const pts = NET_SERIES.map((v, i) => [px(i), py(v)] as const);
  const line = 'M' + pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' L');
  const area = `${line} L${px(30)},${plotH} L${px(0)},${plotH} Z`;
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const reveal = axisW + plotW * draw;
  const last = pts[Math.min(30, Math.round(draw * 30))];
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id="t2nw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={MM.accent} stopOpacity="0.28" /><stop offset="1" stopColor={MM.accent} stopOpacity="0" /></linearGradient>
          <clipPath id="t2nwc"><rect x="0" y="-10" width={reveal} height={h + 20} /></clipPath>
        </defs>
        {ticks.map((v) => <line key={v} x1={axisW} x2={w} y1={py(v)} y2={py(v)} stroke="rgba(100,130,100,0.18)" strokeWidth={1} />)}
        <g clipPath="url(#t2nwc)">
          <path d={area} fill="url(#t2nw)" />
          <path d={line} fill="none" stroke={MM.accent} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {draw > 0.02 && <circle cx={last[0]} cy={last[1]} r={4.5} fill="#fff" stroke={MM.accent} strokeWidth={2.4} />}
      </svg>
      {ticks.map((v) => <div key={v} style={{ position: 'absolute', left: 0, top: py(v) - 7, fontSize: 10, fontWeight: 700, color: MM.faint }}>${(v / 1000).toFixed(1)}k</div>)}
      {['Oct 10', 'Oct 17', 'Oct 24', 'Oct 31', 'Nov 10'].map((d, k) => (
        <div key={d} style={{ position: 'absolute', left: axisW + (k / 4) * plotW - (k === 4 ? 40 : k === 0 ? 0 : 18), top: plotH + 6, fontSize: 10, fontWeight: 700, color: MM.faint }}>{d}</div>
      ))}
    </div>
  );
};

/** "Bills & subscriptions": eleven found, a month strip showing when each lands, and the list. */
const BillsView: React.FC<{ frame: number; T: MoneyTimes; w: number; h: number; k: number }> = ({ frame, T, w, h, k }) => {
  const sum = BILLS_TOTAL * p01(frame, T.bills + 0.3, T.bills + 1.2);
  const stripX = 20, stripW = w - 40, dayX = (d: number) => stripX + ((d - 1) / 29) * stripW;
  const colW = (w - 40 - 16) / 2;
  // WHY rows sized to the card: the 2026-11-20 re-film made the page view taller, and fixed 32 px rows left
  // a blank band under the list. The eleven now fill the card, as a real list of bills would.
  const rowH = Math.max(32, Math.min(46, (h - 190 - 18) / 6));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k, transform: `translateX(${(1 - k) * 24}px)` }}>
      <div style={{ position: 'absolute', left: 18, top: 54, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', color: MM.muted }}>RECURRING · EVERY MONTH</div>
      <div style={{ position: 'absolute', left: 16, top: 66, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{usd(sum)}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: MM.muted }}>a month</span>
      </div>
      <div style={{ position: 'absolute', right: 18, top: 62, height: 26, padding: '0 11px', borderRadius: 26, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800,
        color: '#fff', background: MM.accent, boxShadow: '0 4px 12px rgba(47,125,85,0.35)', transform: `scale(${sp(frame, T.bills + 0.35, { damping: 9, stiffness: 200 })})` }}>
        <Ico n="check" s={13} c="#fff" w={3} />11 found
      </div>
      {/* the month strip: a dot on each bill's day, today marked */}
      <div style={{ position: 'absolute', left: 0, top: 136, width: w, height: 40 }}>
        <div style={{ position: 'absolute', left: stripX, width: stripW, top: 16, height: 6, borderRadius: 6, background: 'rgba(160,190,158,0.4)' }} />
        <div style={{ position: 'absolute', left: stripX, width: dayX(TODAY) - stripX, top: 16, height: 6, borderRadius: 6, background: 'rgba(47,125,85,0.35)' }} />
        <div style={{ position: 'absolute', left: dayX(TODAY) - 1, top: 6, width: 2, height: 26, borderRadius: 2, background: MM.fg2 }} />
        <div style={{ position: 'absolute', left: dayX(TODAY) - 18, top: -10, width: 36, textAlign: 'center', fontSize: 9.5, fontWeight: 800, color: MM.fg2 }}>today</div>
        {BILLS.map((b, i) => {
          const p = sp(frame, T.bills + 0.4 + 0.045 * i, { damping: 9, stiffness: 220 });
          const s = 8 + Math.min(10, Math.sqrt(b.amt) * 0.28);
          return <div key={b.name} style={{ position: 'absolute', left: dayX(b.day) - s / 2, top: 19 - s / 2, width: s, height: s, borderRadius: s, background: KIND[b.kind].col,
            border: '2px solid #fff', boxShadow: '0 1px 4px rgba(30,52,38,0.25)', transform: `scale(${p})` }} />;
        })}
        {[1, 8, 15, 22, 29].map((d) => <div key={d} style={{ position: 'absolute', left: dayX(d) - 22, top: 28, width: 44, textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: MM.faint, whiteSpace: 'nowrap' }}>Nov {d}</div>)}
      </div>
      {/* the eleven, in two columns */}
      <div style={{ position: 'absolute', left: 20, top: 190, display: 'flex', gap: 16 }}>
        {[0, 1].map((c) => (
          <div key={c} style={{ width: colW }}>
            {BILLS.slice(c * 6, c * 6 + 6).map((b, j) => {
              const i = c * 6 + j;
              const r = sp(frame, T.bills + 0.35 + 0.05 * i, { damping: 14, stiffness: 210 });
              const soon = b.day >= TODAY && b.day < TODAY + 7;
              return (
                <div key={b.name} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid rgba(100,130,100,0.16)`, ...rise(r, 0), transform: `translateX(${(1 - r) * 22}px)` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: '#fff', background: KIND[b.kind].col }}>{b.name[0]}</div>
                  <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{b.name}</div>
                  {soon && <div style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 10, background: MM.warmSoft, color: '#5B2E0C', whiteSpace: 'nowrap' }}>this week</div>}
                  <div style={{ fontSize: 11, fontWeight: 600, color: MM.muted, width: 34, textAlign: 'right' }}>{ordinal(b.day)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(b.amt, true)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
const ordinal = (d: number) => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');

// ---------------------------------------------------------------- the kawaii morning email
/** Drawn at `w` px wide in film pixels. `at` = the moment it lands. Its numbers are the money page's. */
export const KawaiiEmail: React.FC<{ w: number; at: number }> = ({ w, at }) => {
  const frame = useCurrentFrame();
  const u = w / 600;   // designed at 600 wide
  const blink = (Math.floor(sec(frame) * 10) % 34) === 0 ? 0.15 : 1;   // the cloud blinks now and then
  const bob = Math.sin((sec(frame) - at) * 3.2) * 3 * u;
  const rows = [
    { label: 'checking', value: usd(CHECKING, true), bg: '#CFF5EC', ic: '♡' },
    { label: 'savings', value: usd(SAVINGS, true), bg: '#E4DAFF', ic: '☆' },
    { label: 'investments', value: usd(INVEST, true), bg: '#FFF1C7', ic: '✿' },
  ];
  const due = BILLS.filter((b) => b.day >= TODAY && b.day < TODAY + 7);
  return (
    <div style={{ width: w, borderRadius: 34 * u, background: 'linear-gradient(180deg, #FFF8FC 0%, #FFEFF6 100%)', boxShadow: `0 ${30 * u}px ${80 * u}px rgba(60,30,80,0.30), 0 0 0 ${3 * u}px #FFD3E6`,
      fontFamily: FREDOKA, color: '#6B3E6E', overflow: 'hidden', position: 'relative' }}>
      {/* the mail header: who it is from, and the subject */}
      <div style={{ padding: `${16 * u}px ${24 * u}px ${14 * u}px`, background: '#FFE3EF', borderBottom: `${2 * u}px dashed #FFC2DB` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u }}>
          <div style={{ width: 40 * u, height: 40 * u, borderRadius: 40 * u, background: 'linear-gradient(135deg,#B69CFF,#FF9CC8)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600, fontSize: 20 * u }}>y</div>
          <div style={{ flex: 1, lineHeight: 1.25 }}>
            <div style={{ fontSize: 17 * u, fontWeight: 600 }}>youcoded</div>
            <div style={{ fontSize: 14 * u, opacity: 0.75 }}>to me · 7:00 am</div>
          </div>
          <div style={{ fontSize: 13 * u, fontWeight: 600, padding: `${4 * u}px ${12 * u}px`, borderRadius: 20 * u, background: '#fff', color: '#FF7FB5' }}>every morning ♡</div>
        </div>
        <div style={{ marginTop: 10 * u, fontSize: 19 * u, fontWeight: 600, color: '#5B3A5E' }}>your money, this morning ☀︎</div>
      </div>
      <div style={{ padding: `${18 * u}px ${28 * u}px ${22 * u}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u }}>
          {/* the mascot: a little cloud with a face */}
          <svg width={100 * u} height={76 * u} viewBox="0 0 110 84" style={{ flex: 'none', transform: `translateY(${bob}px)` }}>
            <path d="M24 70 C6 70 4 46 20 42 C18 22 44 14 54 28 C62 10 92 14 90 36 C106 38 106 70 86 70 Z" fill="#fff" stroke="#FFC2DB" strokeWidth="3" />
            <ellipse cx="44" cy={50} rx="4.5" ry={6 * blink} fill="#5B3A5E" />
            <ellipse cx="68" cy={50} rx="4.5" ry={6 * blink} fill="#5B3A5E" />
            <ellipse cx="36" cy="60" rx="7" ry="4" fill="#FFB3CF" opacity="0.8" />
            <ellipse cx="77" cy="60" rx="7" ry="4" fill="#FFB3CF" opacity="0.8" />
            <path d="M51 58 Q56 64 61 58" stroke="#5B3A5E" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{ fontSize: 30 * u, fontWeight: 600, lineHeight: 1.1, color: '#5B3A5E' }}>good morning!!</div>
            <div style={{ fontSize: 17 * u, opacity: 0.85, marginTop: 4 * u }}>you have {usd(HAVE)} ♡ all safe and cozy</div>
          </div>
        </div>
        <div style={{ marginTop: 16 * u, display: 'flex', flexDirection: 'column', gap: 9 * u }}>
          {rows.map((r, i) => {
            const k = sp(frame, at + 0.25 + 0.1 * i, { damping: 11, stiffness: 180 });
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${10 * u}px ${18 * u}px`, borderRadius: 22 * u, background: r.bg,
                transform: `scale(${0.6 + 0.4 * k})`, opacity: Math.min(1, k * 1.5) }}>
                <div style={{ fontSize: 19 * u, width: 22 * u, textAlign: 'center' }}>{r.ic}</div>
                <div style={{ flex: 1, fontSize: 18 * u, fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 22 * u, fontWeight: 600 }}>{r.value}</div>
              </div>
            );
          })}
        </div>
        {/* this week's bills, as little stickers */}
        <div style={{ marginTop: 14 * u, padding: `${12 * u}px ${16 * u}px`, borderRadius: 22 * u, background: '#fff', border: `${2 * u}px dashed #FFC2DB` }}>
          <div style={{ fontSize: 15 * u, fontWeight: 600, color: '#FF7FB5', marginBottom: 6 * u }}>due this week (just {due.length}!)</div>
          <div style={{ display: 'flex', gap: 10 * u }}>
            {due.map((b, i) => {
              const k = sp(frame, at + 0.6 + 0.12 * i, { damping: 9, stiffness: 200 });
              return (
                <div key={b.name} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 * u, padding: `${7 * u}px ${12 * u}px`, borderRadius: 16 * u, background: i ? '#FFE0CC' : '#DDF0FF',
                  transform: `scale(${0.5 + 0.5 * k}) rotate(${(i ? 1.5 : -1.5) * k}deg)`, opacity: Math.min(1, k * 1.5) }}>
                  <div style={{ flex: 1, fontSize: 16 * u, fontWeight: 500 }}>{b.name.toLowerCase()} · {ordinal(b.day)}</div>
                  <div style={{ fontSize: 17 * u, fontWeight: 600 }}>{usd(b.amt, true)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 14 * u, fontSize: 16 * u, textAlign: 'center', opacity: 0.8 }}>have the best day ✧ (ﾉ◕ヮ◕)ﾉ</div>
      </div>
      {/* a few hearts drifting up out of the card */}
      {[0, 1, 2, 3].map((i) => {
        const tt = (sec(frame) - at - i * 0.35) % 2.2;
        if (sec(frame) < at + i * 0.35) return null;
        return <div key={i} style={{ position: 'absolute', right: (40 + i * 46) * u, top: (120 - tt * 60) * u, fontSize: (16 + (i % 2) * 6) * u, color: ['#FF8FBF', '#B69CFF', '#7FD8C3', '#FFB48A'][i], opacity: interpolate(tt, [0, 0.3, 1.6, 2.2], [0, 0.9, 0.6, 0]) }}>♥</div>;
      })}
    </div>
  );
};
