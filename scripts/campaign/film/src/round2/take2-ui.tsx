// Take 2's STAGED content: the things the person makes inside youcoded (their smart-home screen, their
// money, a cute morning email). Brand guide section 8 allows this in ads: the app around them is real
// footage; what a person makes may be designed for the camera.
//
// WHY it looks like this (owner, 2026-11-20: "more closely based on the features/cards in my real pages"):
// every card here is one of the card kinds on the owner's own Home and Finance pages (mirrored by the
// practice build's practice pages, footage/stills/page-home--*.png and page-money--*.png). Home: the row
// of status pills (lights on, "playing" with moving bars, outside/inside temperature, "to fix",
// Activity), a Favorites header, a light group with ALL, a palette button and an expand arrow above its
// single lights, the thermostat dial with − / + and Off · Cool · Heat · Auto, a speaker card and a TV card
// with power and play buttons, rooms as cards. Finance: Finance / bank / "to look at" / "due this week"
// chips, the Net worth · One account · Spending · Bills & subscriptions · Debt tabs, 1W … All, the Cash
// available / Total owed / You have cards and a "Needs you" alert. Same kinds and information, made
// fuller, each card with one live detail.
//
// Everything is drawn in the app's CSS pixels (the page view's content box), so it sits in the real page
// frame at the real scale, in Devil's Garden's own colours and font (wecoded-themes/themes/devils-garden):
// the look the person settled on in the look conversation, and what the real app paints its pages in.
import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { EASE_IN_OUT, EASE_OUT, FPS } from '../brand';

// WHY Space Grotesk: it is Devil's Garden's own font (its manifest's font.family), so the page reads as the app's.
const GROTESK = loadGrotesk('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;
export const FREDOKA = loadFredoka('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;

// Devil's Garden's tokens (manifest.json), plus the warm lamp orange and cooling blue the owner's practice
// pages use for lights and the thermostat. `page` is the page view's measured empty colour in the re-film,
// so the staged page meets the real frame with no seam.
export const DG = {
  page: '#13070F', canvas: '#140810', panel: '#221020', inset: '#2E1828', well: '#0E0610',
  accent: '#FFC627', onAccent: '#140810', fg: '#FBE9C9', fg2: '#D8C299', dim: '#BDA57C', muted: '#A28E6D', faint: '#836F5E',
  edge: '#7A3048', edgeSoft: 'rgba(122,48,72,0.42)', edgeFaint: 'rgba(122,48,72,0.26)',
  warm: '#FFA95E', warmSoft: '#FFC690', warmTint: 'rgba(255,169,94,0.13)', warmEdge: 'rgba(255,169,94,0.42)',
  cool: '#3A86FF', red: '#F0524A', amber: '#FFB547', green: '#7BD88F', lime: '#A6D93B',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sec = (frame: number) => frame / FPS;
/** 0→1 over [a, b] seconds, eased. */
const p01 = (frame: number, a: number, b: number, e = EASE_OUT) => interpolate(sec(frame), [a, b], [0, 1], { ...clamp, easing: e });
/** A spring that starts at `at` seconds. WHY springs: "punchier" is the person's word; a spring overshoots and settles. */
const sp = (frame: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  frame < at * FPS ? 0 : spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping: 15, stiffness: 170, mass: 0.9, ...cfg } });
/** A press: 0 → 1 → 0 over about a quarter second (a button pushed in and let go). */
const press = (frame: number, at: number) => { const x = (sec(frame) - at) / 0.26; return x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const usd = (n: number, cents = false) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
type R = { x: number; y: number; w: number; h: number };
/** Arrival: fades and rises a little. */
const rise = (k: number, d = 10): React.CSSProperties => ({ opacity: Math.min(1, Math.max(0, k * 1.4)), transform: `translateY(${(1 - k) * d}px)` });

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
  chevUp: 'm18 15-6-6-6 6',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22zM7.5 11.5h.01M10.5 7.5h.01M15.5 8.5h.01',
  speaker: 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  sunset: 'M12 10V2M5.2 11.2 3.8 9.8M2 18h20M18.8 11.2l1.4-1.4M7 18a5 5 0 0 1 10 0M8 6l4-4 4 4M5 22h14',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  card: 'M2 6h20v12H2zM2 10h20',
  wallet: 'M3 7h17v13H3zM16 13.5h.01M3 7l13-4v4',
  bars: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-3',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'm18 15-6-6-6 6',
  drop: 'M12 2.7s-6 6.3-6 11a6 6 0 0 0 12 0c0-4.7-6-11-6-11z',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  power: 'M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10',
  play: 'M7 4v16l13-8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  dish: 'M4 3h16v18H4zM4 8h16M8 5.5h.01M11 5.5h.01M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  door: 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M15 12h.01',
  garage: 'M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 16h10',
  battery: 'M2 8h16v8H2zM22 11v2M5 11v2',
  bed: 'M2 20V6M2 11h20v9M22 16H2M6 11V8h6v3',
};
const Ico: React.FC<{ n: string; s: number; c?: string; w?: number; fill?: string }> = ({ n, s, c = 'currentColor', w = 2, fill = 'none' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
    <path d={PATHS[n]} />
  </svg>
);

// ---------------------------------------------------------------- shared pieces
/** The page's own background: Devil's Garden's own wallpaper (wecoded-themes/themes/devils-garden/assets/
 *  wallpaper.jpg, copied to public/footage/r2-devils-garden.jpg) seen through the theme's dark canvas.
 *  WHY (review 2026-11-20: "every chat-to-page cut feels like a different app"): the chat wears the bright
 *  desert, so the page the person made wears it too, as a soft glow at the top behind its cards, and the
 *  cut from chat to page carries the same sky and rock colours across. */
const PageBg: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: DG.page, overflow: 'hidden' }}>
    <Img src={staticFile('footage/r2-devils-garden.jpg')} style={{ position: 'absolute', left: -12, top: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 24px)', objectFit: 'cover', objectPosition: '50% 40%', filter: 'blur(3px) saturate(1.15)' }} />
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(19,7,15,0.40) 0%, rgba(19,7,15,0.72) 30%, rgba(19,7,15,0.87) 65%, rgba(19,7,15,0.93) 100%)` }} />
  </div>
);
// WHY translucent panels: the glass look the theme gives its chat bubbles, so a little of the desert reads through the cards.
const Panel: React.FC<{ r: R; style?: React.CSSProperties; children?: React.ReactNode; tint?: string }> = ({ r, style, children, tint }) => (
  <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16, background: tint ?? 'linear-gradient(180deg, rgba(34,16,32,0.84), rgba(27,12,25,0.90))',
    border: `1px solid ${DG.edgeSoft}`, boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,230,200,0.05)', overflow: 'hidden', ...style }}>{children}</div>
);
/** A status pill from the page's top row: a coloured round icon, then a few words (owner's Home page). */
const Pill: React.FC<{ icon: string; dot: string; ic?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ icon, dot, ic = DG.onAccent, children, style }) => (
  <div style={{ height: 30, padding: '0 11px 0 4px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    background: 'rgba(34,16,32,0.9)', color: DG.fg, border: `1px solid ${DG.edgeSoft}`, ...style }}>
    <div style={{ width: 22, height: 22, borderRadius: 22, background: dot, display: 'grid', placeItems: 'center' }}><Ico n={icon} s={13} c={ic} w={2.2} /></div>
    {children}
  </div>
);
const RoundBtn: React.FC<{ icon: string; size?: number; style?: React.CSSProperties; c?: string; bg?: string; fill?: string }> = ({ icon, size = 28, style, c = DG.fg2, bg = DG.well, fill }) => (
  <div style={{ width: size, height: size, borderRadius: size, display: 'grid', placeItems: 'center', flex: 'none', background: bg, border: `1px solid ${DG.edgeSoft}`, ...style }}>
    <Ico n={icon} s={size * 0.48} c={c} fill={fill} />
  </div>
);
/** Little moving equaliser bars: the "playing" detail from the owner's pill. */
const EqBars: React.FC<{ t: number; h?: number; c?: string; n?: number }> = ({ t, h = 11, c = DG.accent, n = 3 }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} style={{ width: 2.6, borderRadius: 2, background: c, height: h * (0.35 + 0.65 * Math.abs(Math.sin(t * (5.1 + i * 1.7) + i * 1.3))) }} />
    ))}
  </div>
);
/** The fat dimmer from the owner's lights cards: a near-black track, an orange fill and a white knob. */
const Dimmer: React.FC<{ value: number; track: number; width: number; on?: boolean }> = ({ value, track, width, on = true }) => {
  const knob = track + 6;
  const x = Math.max(knob / 2, Math.min(width - knob / 2, width * value));
  return (
    <div style={{ position: 'relative', width, height: knob }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 3, height: track, borderRadius: track, background: DG.well, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'absolute', left: 0, top: 3, height: track, width: on && value > 0.005 ? x + knob / 2 : 0, borderRadius: track,
        background: `linear-gradient(90deg, ${DG.warmSoft}, ${DG.warm})`, boxShadow: on ? `0 0 ${track * 0.8}px rgba(255,160,80,0.35)` : 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: x - knob / 2, width: knob, height: knob, borderRadius: knob, background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.45)', opacity: on || value > 0.005 ? 1 : 0.5 }} />
    </div>
  );
};
/** The bulb tile: an orange disc when the light is on (glowing in proportion), a quiet dark one when off. */
const BulbTile: React.FC<{ size: number; on: number; glow?: number }> = ({ size, on, glow = 0 }) => (
  <div style={{ position: 'relative', width: size, height: size, borderRadius: size, flex: 'none', display: 'grid', placeItems: 'center',
    background: DG.well, border: `1px solid ${DG.edgeSoft}` }}>
    {/* WHY a layer that fades instead of a swap: a light coming on should warm up, not blink */}
    <div style={{ position: 'absolute', inset: -1, borderRadius: size, opacity: on, background: `radial-gradient(circle at 40% 35%, ${DG.warmSoft}, ${DG.warm})`,
      boxShadow: `0 0 ${6 + 20 * glow}px rgba(255,160,80,${0.3 + 0.45 * glow})` }} />
    <div style={{ position: 'relative' }}><Ico n="bulb" s={size * 0.5} c={on > 0.5 ? '#4A2208' : DG.faint} /></div>
  </div>
);
/** The round on/off button at the right of a light (the practice pages draw it as a filled orange dot). */
const Dot: React.FC<{ on: number; size?: number }> = ({ on, size = 22 }) => (
  <div style={{ position: 'relative', width: size, height: size, borderRadius: size, flex: 'none', background: DG.well, border: `2px solid ${DG.edgeSoft}` }}>
    <div style={{ position: 'absolute', inset: -2, borderRadius: size, background: DG.warm, border: '2px solid #FFE3C8', opacity: on, transform: `scale(${0.6 + 0.4 * on})`, boxShadow: '0 0 10px rgba(255,150,70,0.5)' }} />
  </div>
);
/** A number that rolls from `a` to `b` as k goes 0 → 1 (the pill count, the thermostat). */
const Roll: React.FC<{ a: string; b: string; k: number; h: number }> = ({ a, b, k, h }) => (
  <span style={{ position: 'relative', display: 'inline-block', height: h, overflow: 'hidden', verticalAlign: 'top' }}>
    <span style={{ display: 'block', transform: `translateY(${-k * h}px)`, lineHeight: `${h}px` }}>
      <span style={{ display: 'block', height: h }}>{a}</span><span style={{ display: 'block', height: h }}>{b}</span>
    </span>
  </span>
);

// ---------------------------------------------------------------- the thermostat dial (as on the practice pages)
const Dial: React.FC<{ size: number; set: number; label: string; inside: number; breathe: number; sweep?: number }> = ({ size, set, label, inside, breathe, sweep }) => {
  // 260-degree arc, open at the bottom; the set point (60°-85°) sits along it. `sweep` (if given) draws the
  // arc to a value other than the label, so the ring can travel while the number rolls.
  const r = size * 0.4, c = size / 2, sw = Math.max(6, size * 0.07);
  const a0 = 140, span = 260, k = ((sweep ?? set) - 60) / 25;
  const pt = (deg: number) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a0 + span * k), [xe, ye] = pt(a0 + span);
  const big = span * k > 180 ? 1 : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={`M${x0} ${y0} A${r} ${r} 0 1 1 ${xe} ${ye}`} stroke={DG.well} strokeWidth={sw} fill="none" strokeLinecap="round" />
        {/* WHY a soft halo that breathes: the dial is live (it is cooling), so it should look alive while still */}
        <path d={`M${x0} ${y0} A${r} ${r} 0 ${big} 1 ${x1} ${y1}`} stroke={DG.cool} strokeWidth={sw * 2.2} fill="none" strokeLinecap="round" opacity={0.1 + 0.12 * breathe} style={{ filter: 'blur(4px)' }} />
        <path d={`M${x0} ${y0} A${r} ${r} 0 ${big} 1 ${x1} ${y1}`} stroke={DG.cool} strokeWidth={sw} fill="none" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r={sw * 0.95} fill="#fff" stroke={DG.cool} strokeWidth={sw * 0.35} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: Math.max(9, size * 0.07), color: DG.dim, fontWeight: 500 }}>Cooling to</div>
          <div style={{ fontSize: size * 0.27, fontWeight: 600, color: DG.fg, lineHeight: 1, letterSpacing: '-0.03em', height: size * 0.27, overflow: 'hidden' }}>{label}</div>
          <div style={{ fontSize: Math.max(9, size * 0.065), color: DG.muted, fontWeight: 500, marginTop: size * 0.03 }}>{inside}° inside</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the smart-home screen
/** build: the page appears · tabOut / tabBack: "Everything else" opened and closed · bigger: the sliders
 *  grow · ceiling: a light is switched on · scene: "Wind down" pressed · thermo: the thermostat nudged. */
export type HomeTimes = { build: number; tabOut: number; tabBack: number; bigger: number; ceiling: number; scene: number; thermo: number };

/** `W`×`H` is the page view's content box in CSS px (about 879 × 562). "My room" is the front tab;
 *  "Everything else" (the rest of the house) slides in beside it. */
export const HomeUI: React.FC<{ W: number; H: number; T: HomeTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame();
  const t = sec(frame);
  // WHY the build starts a few frames BEFORE the cut: the first frame of the page already has its first
  // cards on the way in (review 2026-11-20: an empty panel for 0.3 s read as a loading hitch).
  const built = (d: number) => sp(frame, T.build - 0.15 + d * 0.7, { damping: 17, stiffness: 200 });
  // the tab: 0 = My room, 1 = Everything else. A firm spring with a whisker of overshoot.
  const tab = sp(frame, T.tabOut + 0.06, { damping: 20, stiffness: 170 }) - sp(frame, T.tabBack + 0.06, { damping: 20, stiffness: 170 });
  // WHY low damping on "bigger": it is the person's "punchier" made literal: everything overshoots, then settles.
  const big = sp(frame, T.bigger, { damping: 9, stiffness: 190, mass: 0.8 });
  // the ceiling light: switched on with a springy slide from 0 to 70 %
  const ceilOn = sp(frame, T.ceiling, { damping: 9, stiffness: 200, mass: 0.8 });
  const ceilWarm = p01(frame, T.ceiling, T.ceiling + 0.35);
  // "Wind down": the three lights dim together, one after another
  const wind = (i: number) => sp(frame, T.scene + 0.12 + 0.09 * i, { damping: 11, stiffness: 160 });
  const LIGHTS = [
    { name: 'Desk lamp', val: lerp(0.64, 0.38, wind(0)), on: 1, palette: false, note: 'Warm white' },
    { name: 'LED strip', val: lerp(0.46, 0.28, wind(1)), on: 1, palette: true, note: 'Amber' },
    { name: 'Ceiling light', val: lerp(0.7 * ceilOn, 0.3, wind(2)), on: ceilWarm, palette: false, note: '' },
  ];
  const lit = t >= T.ceiling + 0.15;
  const onTick = p01(frame, T.ceiling + 0.12, T.ceiling + 0.42, EASE_IN_OUT);
  const groupVal = LIGHTS.reduce((s, l) => s + l.val, 0) / 3;
  // thermostat: "−" pressed, the ring sweeps 71 → 70 and the number rolls
  const thermoK = sp(frame, T.thermo + 0.05, { damping: 10, stiffness: 190 });
  const breathe = 0.5 + 0.5 * Math.sin(t * 2.4);

  const pad = 16;
  const tabW = [88, 138];
  const selX = lerp(0, tabW[0], tab), selW = lerp(tabW[0], tabW[1], tab);
  const tabPress = Math.max(press(frame, T.tabOut), press(frame, T.tabBack));
  const L = { x: pad, w: 528 }, Rc = { x: pad + 528 + 12, w: W - pad * 2 - 528 - 12 };

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: GROTESK, color: DG.fg, overflow: 'hidden' }}>
      <PageBg />
      {/* the top row: the two tabs, then the house's status pills (the owner's Home page) */}
      <div style={{ position: 'absolute', left: pad, top: 14, right: pad, display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ ...rise(built(0)), position: 'relative', height: 30, width: tabW[0] + tabW[1] + 4, borderRadius: 30, background: DG.well, border: `1px solid ${DG.edgeSoft}`, flex: 'none' }}>
          {/* the sliding gold selection; WHY a press ring: it is the person tapping the tab, not the page changing by itself */}
          <div style={{ position: 'absolute', top: 1, left: 1 + selX, width: selW, height: 26, borderRadius: 26, background: DG.accent,
            boxShadow: `0 0 0 ${tabPress * 5}px rgba(255,198,39,${0.25 * tabPress}), 0 3px 12px rgba(255,198,39,0.3)`, transform: `scale(${1 - 0.05 * tabPress})` }} />
          {['My room', 'Everything else'].map((name, i) => {
            const sel = i === 0 ? 1 - tab : tab;
            const col = sel > 0.5 ? DG.onAccent : DG.fg2;
            return (
              <div key={name} style={{ position: 'absolute', top: 1, left: 1 + (i ? tabW[0] : 0), width: tabW[i], height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: col }}>
                {i === 0 && <Ico n="home" s={13} c={col} w={2.2} />}
                {name}
                {i === 1 && <span style={{ fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 10, lineHeight: '16px', background: sel > 0.5 ? 'rgba(20,8,16,0.18)' : DG.inset, color: col }}>6</span>}
              </div>
            );
          })}
        </div>
        <div style={rise(built(0.04))}><Pill icon="bulb" dot={DG.warm} ic="#4A2208"><Roll a="5" b="6" k={lit ? onTick : 0} h={16} />&nbsp;on</Pill></div>
        <div style={rise(built(0.08))}><Pill icon="tv" dot={DG.accent}>2 playing <EqBars t={t} /></Pill></div>
        <div style={rise(built(0.12))}><Pill icon="moon" dot={DG.lime} ic="#24410A">58° out · 72° in</Pill></div>
        <div style={rise(built(0.16))}><Pill icon="alert" dot={DG.amber} ic="#3A2400">1 to fix</Pill></div>
        <div style={rise(built(0.2))}><Pill icon="activity" dot={DG.well} ic={DG.fg2}>Activity</Pill></div>
        <div style={{ flex: 1 }} />
        <div style={rise(built(0.22))}><RoundBtn icon="gear" size={30} /></div>
      </div>

      {/* ---- My room (the front tab) ---- */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-tab * W}px)`, opacity: 1 - 0.6 * Math.min(1, tab) }}>
        {/* the Favorites header, as on the owner's page, with one live detail at its right */}
        <div style={{ ...rise(built(0.05)), position: 'absolute', left: L.x + 2, top: 56, width: L.w - 4, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ico n="star" s={15} c={DG.accent} fill={DG.accent} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>Favorites</div>
          <div style={{ fontSize: 12, color: DG.muted, fontWeight: 500 }}>· my room</div>
          <div style={{ flex: 1 }} />
          <div style={{ width: 7, height: 7, borderRadius: 7, background: DG.green, boxShadow: `0 0 ${4 + 6 * breathe}px ${DG.green}` }} />
          <div style={{ fontSize: 11.5, color: DG.dim, fontWeight: 500 }}>Motion · 2 min ago</div>
        </div>

        {/* lights: the group (ALL, palette, expand) over each light with its own dimmer */}
        <Panel r={{ x: L.x, y: 84, w: L.w, h: 362 }} style={{ ...rise(built(0.08), 16), boxShadow: `0 10px 26px rgba(0,0,0,0.35), 0 0 ${30 * Math.min(1, big)}px rgba(255,169,94,${0.18 * Math.min(1, big)})` }}
          tint={`linear-gradient(160deg, rgba(255,169,94,0.10), ${DG.panel} 45%, #1B0C19)`}>
          <div style={{ position: 'absolute', left: 14, top: 12, right: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ position: 'relative' }}>
              <BulbTile size={38} on={1} glow={groupVal} />
              <div style={{ position: 'absolute', top: 40, left: 0, width: 38, textAlign: 'center', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', color: DG.dim }}>ALL</div>
            </div>
            <div style={{ flex: 1, lineHeight: 1.25 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Lights</div>
              <div style={{ fontSize: 12, color: DG.muted, fontWeight: 500 }}><Roll a="2" b="3" k={lit ? onTick : 0} h={15} /> of 3 on · {Math.round(groupVal * 100)}%</div>
            </div>
            <RoundBtn icon="palette" size={30} />
            <RoundBtn icon="chevUp" size={30} />
          </div>
          <div style={{ position: 'absolute', left: 14, top: 62 }}><Dimmer value={groupVal} track={lerp(9, 20, big)} width={L.w - 28} /></div>
          {/* each light */}
          <div style={{ position: 'absolute', left: 12, right: 12, top: 100, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LIGHTS.map((l, k) => {
              const inK = built(0.18 + 0.07 * k);
              const grow = sp(frame, T.bigger + 0.07 * k, { damping: 9, stiffness: 190, mass: 0.8 });
              const pressK = k === 2 ? press(frame, T.ceiling - 0.04) : 0;
              return (
                <div key={l.name} style={{ flex: 1, borderRadius: 12, padding: '0 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: lerp(6, 8, grow),
                  background: l.on > 0.5 ? `linear-gradient(135deg, ${DG.warmTint}, rgba(46,24,40,0.6))` : 'rgba(46,24,40,0.55)',
                  border: `1px solid ${l.on > 0.5 ? DG.warmEdge : DG.edgeFaint}`, ...rise(inK, 12) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BulbTile size={30} on={l.on} glow={l.on * l.val} />
                    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{l.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: DG.muted, fontVariantNumeric: 'tabular-nums' }}>{l.on > 0.5 ? `${Math.round(l.val * 100)}%` : 'Off'}{l.note && l.on > 0.5 ? ` · ${l.note}` : ''}</div>
                    </div>
                    {l.palette && <RoundBtn icon="palette" size={24} />}
                    <div style={{ transform: `scale(${1 - 0.2 * pressK})` }}><Dot on={l.on} size={22} /></div>
                  </div>
                  <Dimmer value={l.val} track={lerp(6, 16, grow)} width={L.w - 24 - 24} on={l.on > 0.5} />
                </div>
              );
            })}
          </div>
        </Panel>

        {/* the speaker (from the owner's Speaker and TV cards): now playing, a moving progress bar, play/pause */}
        <Panel r={{ x: L.x, y: 454, w: L.w, h: H - 454 - pad }} style={rise(built(0.3), 16)}>
          <div style={{ position: 'absolute', left: 14, top: 12, right: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #FFD65C, #F2A40F)' }}><Ico n="speaker" s={20} c={DG.onAccent} /></div>
            <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: DG.accent }}>DESK SPEAKER · NOW PLAYING</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Night Drive</div>
              <div style={{ fontSize: 11.5, color: DG.muted }}>Lo-fi radio</div>
            </div>
            <EqBars t={t} h={16} n={4} />
            <RoundBtn icon="skip" size={30} style={{ transform: 'scaleX(-1)' }} />
            <RoundBtn icon="pause" size={36} c={DG.onAccent} bg={DG.accent} fill={DG.onAccent} />
            <RoundBtn icon="skip" size={30} />
          </div>
          {(() => {
            const prog = 0.32 + (t - T.build) * 0.012;
            const secs = Math.floor(prog * 220);
            return (
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: DG.faint, fontVariantNumeric: 'tabular-nums' }}>
                <span>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
                <div style={{ flex: 1, height: 4, borderRadius: 4, background: DG.well }}><div style={{ width: `${prog * 100}%`, height: 4, borderRadius: 4, background: DG.accent }} /></div>
                <span>3:40</span>
              </div>
            );
          })()}
        </Panel>

        {/* the thermostat */}
        <Panel r={{ x: Rc.x, y: 56, w: Rc.w, h: 282 }} style={rise(built(0.14), 16)} tint={`linear-gradient(165deg, #1C1E3E, ${DG.panel} 60%, #1B0C19)`}>
          <div style={{ position: 'absolute', left: 14, top: 12, fontSize: 15, fontWeight: 700 }}>Thermostat</div>
          <div style={{ position: 'absolute', left: 14, top: 32, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: DG.muted }}>
            <Ico n="drop" s={11} c={DG.cool} />Humidity 41% · Fan auto
          </div>
          {(() => {
            const size = 162;
            const minusPress = press(frame, T.thermo - 0.02);
            return (
              <>
                <div style={{ position: 'absolute', left: (Rc.w - size) / 2, top: 54 }}>
                  <Dial size={size} set={71} sweep={71 - thermoK} label="" inside={73} breathe={breathe} />
                  {/* the number, rolling 71 → 70 */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: size * 0.5 - size * 0.15, textAlign: 'center', fontSize: size * 0.27, fontWeight: 600, letterSpacing: '-0.03em', color: DG.fg }}>
                    <Roll a="71°" b="70°" k={Math.min(1, Math.max(0, thermoK))} h={Math.round(size * 0.3)} />
                  </div>
                </div>
                <div style={{ position: 'absolute', left: 12, top: 54 + size / 2 - 18, transform: `scale(${1 - 0.15 * minusPress})` }}>
                  <RoundBtn icon="minus" size={36} bg={minusPress > 0.05 ? DG.cool : DG.well} c={minusPress > 0.05 ? '#fff' : DG.fg2} />
                </div>
                <div style={{ position: 'absolute', right: 12, top: 54 + size / 2 - 18 }}><RoundBtn icon="plus" size={36} /></div>
              </>
            );
          })()}
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 32, borderRadius: 32, display: 'flex', padding: 3, gap: 2, background: DG.well, border: `1px solid ${DG.edgeSoft}` }}>
            {['Off', 'Cool', 'Heat', 'Auto'].map((m) => (
              <div key={m} style={{ flex: 1, borderRadius: 26, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600,
                background: m === 'Cool' ? DG.cool : 'transparent', color: m === 'Cool' ? '#fff' : DG.dim, boxShadow: m === 'Cool' ? '0 3px 10px rgba(58,134,255,0.4)' : 'none' }}>{m}</div>
            ))}
          </div>
        </Panel>

        {/* scenes */}
        <Panel r={{ x: Rc.x, y: 346, w: Rc.w, h: H - 346 - pad }} style={rise(built(0.22), 16)}>
          <div style={{ position: 'absolute', left: 14, top: 12, fontSize: 15, fontWeight: 700 }}>Scenes</div>
          <div style={{ position: 'absolute', left: 12, right: 12, top: 40, bottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8 }}>
            {([['target', 'Focus', 'Bright, cool', '#2A2A52'], ['sunset', 'Wind down', 'Dim and warm', '#4A2418'], ['film', 'Movie', 'Lights off', '#3A1830'], ['moon', 'Sleep', 'All off at 11', '#22183C']] as const).map(([ic, name, sub, bg]) => {
              const p = name === 'Wind down' ? press(frame, T.scene) : 0;
              const ripple = name === 'Wind down' && t >= T.scene ? p01(frame, T.scene, T.scene + 0.55) : 0;
              const active = name === 'Wind down' && t >= T.scene + 0.08;
              return (
                <div key={name} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px',
                  background: active ? 'linear-gradient(135deg, #7A3A16, #4A2418)' : bg, border: `1px solid ${active ? DG.warmEdge : DG.edgeFaint}`,
                  transform: `scale(${1 - 0.07 * p})` }}>
                  {ripple > 0 && ripple < 1 && <div style={{ position: 'absolute', left: '30%', top: '50%', width: 260 * ripple, height: 260 * ripple, marginLeft: -130 * ripple, marginTop: -130 * ripple, borderRadius: 400, background: 'rgba(255,169,94,0.35)', opacity: 1 - ripple }} />}
                  <div style={{ position: 'relative', width: 30, height: 30, borderRadius: 30, display: 'grid', placeItems: 'center', background: active ? DG.warm : 'rgba(255,255,255,0.07)', flex: 'none' }}>
                    <Ico n={ic} s={15} c={active ? '#4A2208' : DG.fg2} />
                  </div>
                  <div style={{ position: 'relative', lineHeight: 1.2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: active ? DG.warmSoft : DG.muted }}>{active ? 'On now' : sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ---- Everything else (the second tab): the rest of the house ---- */}
      {tab > 0.001 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - tab) * W}px)` }}>
          <Rooms frame={frame} W={W} H={H} />
        </div>
      )}
    </div>
  );
};

/** The rest of the house, one card per room, each with the kinds of controls the owner's room cards have. */
const Rooms: React.FC<{ frame: number; W: number; H: number }> = ({ frame, W, H }) => {
  const t = sec(frame);
  const pad = 16, gap = 10, top = 56;
  const cw = (W - pad * 2 - gap * 2) / 3, ch = (H - top - pad - gap) / 2;
  const cell = (i: number): R => ({ x: pad + (i % 3) * (cw + gap), y: top + Math.floor(i / 3) * (ch + gap), w: cw, h: ch });
  const Row: React.FC<{ children: React.ReactNode; hot?: boolean; warn?: boolean }> = ({ children, hot, warn }) => (
    <div style={{ borderRadius: 11, padding: '7px 11px', marginTop: 7, background: warn ? 'rgba(255,181,71,0.10)' : hot ? `linear-gradient(135deg, ${DG.warmTint}, rgba(46,24,40,0.6))` : 'rgba(46,24,40,0.55)',
      border: `1px solid ${warn ? 'rgba(255,181,71,0.45)' : hot ? DG.warmEdge : DG.edgeFaint}` }}>{children}</div>
  );
  const Line1: React.FC<{ icon?: React.ReactNode; name: string; sub: React.ReactNode; right?: React.ReactNode }> = ({ icon, name, sub, right }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {icon}
      <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: DG.muted, whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      {right}
    </div>
  );
  const tile = (n: string, bg: string, c: string) => <div style={{ width: 28, height: 28, borderRadius: 28, flex: 'none', display: 'grid', placeItems: 'center', background: bg }}><Ico n={n} s={14} c={c} /></div>;
  const iw = cw - 24 - 22;
  const rooms: { name: string; body: React.ReactNode }[] = [
    { name: 'Living room', body: <>
      <Row hot><Line1 icon={<BulbTile size={28} on={1} glow={0.5} />} name="Lights" sub="1 of 2 on · 55%" right={<RoundBtn icon="palette" size={24} />} /><div style={{ marginTop: 8 }}><Dimmer value={0.55} track={8} width={iw} /></div></Row>
      <Row><Line1 icon={tile('speaker', DG.accent, DG.onAccent)} name="Speaker" sub="Jazz radio" right={<EqBars t={t + 1.3} h={13} n={4} />} /></Row>
      {/* WHY no slider here: three rows with two sliders overflowed the card's bottom edge */}
      <Row><Line1 icon={tile('sunset', DG.inset, DG.fg2)} name="Blinds" sub="60% open · close at sunset" right={<div style={{ fontSize: 11, fontWeight: 600, color: DG.fg2 }}>60%</div>} /></Row>
    </> },
    { name: 'Kitchen', body: <>
      <Row hot><Line1 icon={<BulbTile size={28} on={1} glow={0.8} />} name="Pendants" sub="80%" right={<Dot on={1} size={20} />} /><div style={{ marginTop: 8 }}><Dimmer value={0.8} track={8} width={iw} /></div></Row>
      <Row><Line1 icon={tile('dish', DG.inset, DG.fg2)} name="Dishwasher" sub={`${Math.max(1, 12 - Math.floor((t % 60) / 30))} min left`} />
        <div style={{ marginTop: 8, height: 5, borderRadius: 5, background: DG.well }}><div style={{ width: `${74 + 2 * Math.sin(t)}%`, height: 5, borderRadius: 5, background: DG.cool }} /></div></Row>
      <Row><Line1 icon={tile('drop', DG.inset, DG.fg2)} name="Coffee maker" sub="Ready at 7:00 AM" right={<Dot on={0} size={20} />} /></Row>
    </> },
    { name: 'Hallway', body: <>
      <Row><Line1 icon={<BulbTile size={28} on={0} />} name="Ceiling" sub="Off · on with motion" right={<Dot on={0} size={20} />} /></Row>
      <Row><Line1 icon={tile('activity', 'rgba(123,216,143,0.18)', DG.green)} name="Motion" sub="4 min ago" right={<div style={{ width: 7, height: 7, borderRadius: 7, background: DG.green, opacity: 0.5 + 0.5 * Math.sin(t * 3) }} />} /></Row>
      <Row><Line1 icon={tile('activity', DG.inset, DG.fg2)} name="Air" sub="72° · humidity 40% · good" right={<Ico n="check" s={14} c={DG.green} w={2.6} />} /></Row>
    </> },
    { name: 'Guest bedroom', body: <>
      {/* the owner's Guest Bedroom TV card: a power button and a big play button */}
      <div style={{ marginTop: 8, borderRadius: 12, padding: '10px 11px', background: 'linear-gradient(160deg, rgba(255,198,39,0.12), rgba(46,24,40,0.6))', border: '1px solid rgba(255,198,39,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ico n="tv" s={13} c={DG.dim} /><div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Guest TV</div>
          <RoundBtn icon="power" size={28} c={DG.onAccent} bg={DG.accent} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 11, color: DG.muted }}>Paused · Episode 4</div>
          <RoundBtn icon="play" size={36} c={DG.onAccent} bg={DG.accent} fill={DG.onAccent} />
        </div>
      </div>
      <Row><Line1 icon={<BulbTile size={28} on={0} />} name="Bedside lamp" sub="Off" right={<Dot on={0} size={20} />} /></Row>
    </> },
    { name: 'Porch', body: <>
      <Row hot><Line1 icon={<BulbTile size={28} on={1} glow={0.6} />} name="Lantern" sub="On at sunset · 6:12 PM" right={<Dot on={1} size={20} />} /></Row>
      <Row><Line1 icon={tile('lock', 'rgba(123,216,143,0.18)', DG.green)} name="Front door" sub="Locked" right={<Ico n="check" s={14} c={DG.green} w={2.6} />} /></Row>
      <Row><Line1 icon={tile('door', DG.inset, DG.fg2)} name="Doorbell" sub="2 visitors today · last 4:51 PM" /></Row>
    </> },
    { name: 'Garage', body: <>
      <Row warn><Line1 icon={tile('battery', 'rgba(255,181,71,0.22)', DG.amber)} name="Door sensor" sub="Battery 8% · replace soon" right={<div style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: DG.amber, color: '#3A2400' }}>Fix</div>} /></Row>
      <Row><Line1 icon={tile('garage', DG.inset, DG.fg2)} name="Garage door" sub="Closed" right={<Ico n="check" s={14} c={DG.green} w={2.6} />} /></Row>
      <Row><Line1 icon={tile('battery', DG.inset, DG.green)} name="Car charger" sub="Charging · 82%" />
        <div style={{ marginTop: 8, height: 5, borderRadius: 5, background: DG.well }}><div style={{ width: `${82 + 0.4 * Math.sin(t * 2)}%`, height: 5, borderRadius: 5, background: DG.green }} /></div></Row>
    </> },
  ];
  return (
    <>
      {rooms.map((r, i) => {
        const c = cell(i);
        return (
          <Panel key={r.name} r={c}>
            <div style={{ position: 'absolute', left: 12, top: 10, right: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginLeft: 2 }}>{r.name}</div>
              {r.body}
            </div>
          </Panel>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- money
export type MoneyTimes = { connect: number; bills: number };
// The person's numbers (practice data). They agree everywhere they appear, the email included:
// you have = checking + savings + investments; net worth = you have − the card; cash available = checking.
const CHECKING = 6240.12, SAVINGS = 12940, INVEST = 6244, CARD = 612.4;
const HAVE = CHECKING + SAVINGS + INVEST, NET = HAVE - CARD;
type Bill = { name: string; day: number; amt: number; kind: keyof typeof KIND };
const KIND = {
  home: { col: '#F0964A', label: 'Home' }, util: { col: '#2FB5A8', label: 'Utilities' }, ins: { col: '#4A90FF', label: 'Insurance' },
  phone: { col: '#9B7CF4', label: 'Phone & internet' }, subs: { col: '#EC6FAE', label: 'Subscriptions' },
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
// 31 days of net worth (Oct 10 → Nov 10). WHY this shape (review 2026-11-20: the old one opened on a sharp
// V that read as a glitch): a gentle, believable climb with a soft rent-day step around Nov 1 (day 22),
// ending exactly on today's net worth. Deterministic, so every render matches.
const NET_SERIES = Array.from({ length: 31 }, (_, i) => {
  const x = i / 30;
  const climb = 1204 * (x * x * (3 - 2 * x));                       // smooth S-curve rise
  const wiggle = 95 * Math.sin(i * 0.62 + 0.4) * Math.sin(Math.PI * x); // pinned to 0 at both ends
  const rent = -380 / (1 + Math.exp(-(i - 22) * 1.6));             // a soft step down at rent day…
  const recover = Math.min(380, 380 * Math.max(0, (i - 22) / 8));      // …earned back by today
  return NET - 1204 + climb + wiggle + rent + recover;
});
NET_SERIES[30] = NET;
/** A smooth line through points (Catmull-Rom as cubic Béziers), so the chart reads as a drawn curve, not a zig-zag. */
const smooth = (pts: readonly (readonly [number, number])[]) => {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
/** Checking over the month: pay lands on the 1st and the 15th, bills and spending draw it down. Ends on CHECKING. */
const CASH_SERIES = Array.from({ length: 31 }, (_, i) => CHECKING - 900 + 900 * (i / 30) + 420 * Math.sin(i * 0.41) * Math.sin((Math.PI * i) / 30));

const Chip: React.FC<{ icon: string; dot: string; ic?: string; text: string; style?: React.CSSProperties; filled?: boolean }> = ({ icon, dot, ic = DG.onAccent, text, style, filled }) => (
  <div style={{ height: 30, padding: '0 12px 0 4px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    background: filled ? '#F6E2B8' : 'rgba(34,16,32,0.9)', color: filled ? DG.onAccent : DG.fg, border: `1px solid ${filled ? '#F6E2B8' : DG.edgeSoft}`,
    boxShadow: filled ? '0 4px 14px rgba(246,226,184,0.18)' : 'none', ...style }}>
    <div style={{ width: 22, height: 22, borderRadius: 22, background: dot, display: 'grid', placeItems: 'center' }}><Ico n={icon} s={13} c={ic} w={2.2} /></div>
    {text}
  </div>
);

export const MoneyUI: React.FC<{ W: number; H: number; T: MoneyTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame(); const t = sec(frame);
  const pad = 16, top = 58, gap = 12;
  const connecting = t < T.connect + 0.4;
  const a = (d: number) => sp(frame, T.connect + 0.3 + d, { damping: 16, stiffness: 180 });
  const count = p01(frame, T.connect + 0.4, T.connect + 1.4, EASE_OUT);
  const tab = p01(frame, T.bills, T.bills + 0.35, EASE_IN_OUT);            // the selected tab slides to "Bills & subscriptions"
  // WHY the bills arrive WITH the swap (review 2026-11-20: '$735' counted up over an empty half card for a beat):
  // the net worth slides out while the first bill rows are already sliding in, so the card is never empty.
  // WHY out-then-in, not a cross-fade: cross-fading printed '$1,087' over '$24,812' for a few frames.
  const swapOut = p01(frame, T.bills, T.bills + 0.1, EASE_IN_OUT);
  const swap = p01(frame, T.bills + 0.09, T.bills + 0.3, EASE_OUT);     // the card's new content arriving
  const left: R = { x: pad, y: top, w: 548, h: H - top - pad };
  const sideX = left.x + left.w + gap, sideW = W - pad - sideX, sideH = (left.h - gap * 2) / 3;
  const TABS = ['Net worth', 'One account', 'Spending', 'Bills & subscriptions', 'Debt'];
  const TABW = [74, 92, 70, 146, 48];
  const tabX = (i: number) => TABW.slice(0, i).reduce((s, w) => s + w + 6, 0);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: GROTESK, color: DG.fg, overflow: 'hidden' }}>
      <PageBg />
      {/* the top row, as on the owner's Finance page */}
      <div style={{ position: 'absolute', left: pad, top: 14, right: pad, display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={rise(a(-0.3))}><Chip filled icon="dollar" dot={DG.onAccent} ic="#F6E2B8" text="Finance" /></div>
        <div style={rise(a(-0.25))}>
          <Chip icon={connecting ? 'refresh' : 'bank'} dot={connecting ? DG.warm : DG.green} ic={connecting ? '#4A2208' : '#0E3A1C'}
            text={connecting ? 'Connecting to First Harbor Bank…' : 'First Harbor Bank · 4 accounts'} />
        </div>
        <div style={rise(a(0.06))}><Chip icon="alert" dot={DG.amber} ic="#3A2400" text="1 to look at" /></div>
        <div style={{ ...rise(a(0.1)) }}>
          <Chip icon="calendar" dot={t > T.bills + 0.5 ? DG.warm : DG.inset} ic={t > T.bills + 0.5 ? '#4A2208' : DG.fg2} text="2 due this week"
            style={{ transform: `scale(${1 + 0.08 * (sp(frame, T.bills + 0.9, { damping: 8 }) - sp(frame, T.bills + 1.1, { damping: 10 }))})` }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...rise(a(0.15)), fontSize: 11.5, fontWeight: 500, color: DG.muted, whiteSpace: 'nowrap' }}>{connecting ? 'Checking…' : 'Checked just now'}</div>
        <div style={{ ...rise(a(0.18)), height: 30, padding: '0 11px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: DG.fg, background: DG.inset, border: `1px solid ${DG.edgeSoft}`, whiteSpace: 'nowrap' }}>
          <Ico n="refresh" s={13} c={DG.fg2} />Check now
        </div>
      </div>

      {/* the big card: net worth first, then "Bills & subscriptions" */}
      <Panel r={left} style={rise(a(0), 16)}>
        <div style={{ position: 'absolute', left: 14, top: 13, height: 26 }}>
          {/* the sliding selection behind the tabs */}
          <div style={{ position: 'absolute', top: 0, height: 26, borderRadius: 26, background: DG.inset, border: `1px solid ${DG.edge}`,
            left: lerp(tabX(0), tabX(3), tab), width: lerp(TABW[0], TABW[3], tab) }} />
          {TABS.map((n, i) => (
            <div key={n} style={{ position: 'absolute', left: tabX(i), top: 0, width: TABW[i], height: 26, borderRadius: 26, display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 600,
              color: DG.fg2, border: `1px solid ${DG.edgeFaint}`, boxSizing: 'border-box', whiteSpace: 'nowrap' }}>{n}</div>
          ))}
        </div>
        {/* net worth */}
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - swapOut, transform: `translateX(${-swapOut * 24}px)` }}>
          <div style={{ position: 'absolute', left: 18, top: 54, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', color: DG.muted }}>NET WORTH</div>
          <div style={{ position: 'absolute', left: 16, top: 66, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: '#F6E2B8' }}>{usd(NET * count)}</div>
          <div style={{ position: 'absolute', left: 18, top: 122, height: 22, padding: '0 9px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600,
            color: DG.green, background: 'rgba(123,216,143,0.12)', ...rise(a(0.5), 6) }}><Ico n="up" s={12} c={DG.green} w={2.6} />Up $1,204 in 30 days</div>
          <div style={{ position: 'absolute', right: 16, top: 56, height: 28, borderRadius: 28, display: 'flex', padding: 2, background: DG.well, border: `1px solid ${DG.edgeSoft}`, ...rise(a(0.2), 6) }}>
            {['1W', '1M', '3M', '6M', '1Y', 'All'].map((r) => (
              <div key={r} style={{ width: 34, borderRadius: 24, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: r === '1M' ? '#F6E2B8' : 'transparent', color: r === '1M' ? DG.onAccent : DG.dim }}>{r}</div>
            ))}
          </div>
          <NetChart x={14} y={152} w={left.w - 28} h={left.h - 152 - 82} draw={p01(frame, T.connect + 0.55, T.connect + 1.75, EASE_IN_OUT)} />
          {/* "Needs you" (the owner's alert cards), in a calm amber: the card payment the "1 to look at" chip counts */}
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, height: 54, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px',
            background: 'linear-gradient(90deg, rgba(255,181,71,0.13), rgba(255,181,71,0.04))', border: '1px solid rgba(255,181,71,0.42)', ...rise(a(0.7), 10) }}>
            <div style={{ width: 30, height: 30, borderRadius: 30, display: 'grid', placeItems: 'center', background: DG.amber, flex: 'none' }}><Ico n="card" s={15} c="#3A2400" /></div>
            <div style={{ flex: 1, lineHeight: 1.25 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: DG.amber }}>NEEDS YOU</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Card payment due Nov 14 · $612.40</div>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,181,71,0.6)', color: DG.amber, whiteSpace: 'nowrap' }}>Set a reminder</div>
          </div>
        </div>
        {/* bills & subscriptions */}
        {swap > 0 && <BillsView frame={frame} T={T} w={left.w} h={left.h} k={swap} />}
      </Panel>

      {/* the three cards down the side (the owner's Cash available / Total owed / You have), each with a picture of its number */}
      {[0, 1, 2].map((i) => {
        const k = a(0.12 + 0.08 * i);
        const hot = i === 0 ? sp(frame, T.bills + 0.8, { damping: 9 }) - sp(frame, T.bills + 1.05, { damping: 11 }) : 0;
        const r = { x: sideX, y: top + i * (sideH + gap), w: sideW, h: sideH };
        const head = (icon: string, label: string, value: number) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', background: DG.well }}><Ico n={icon} s={16} c={DG.fg2} /></div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', color: DG.muted }}>{label}</div>
              <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: '#F6E2B8' }}>{value < 0 ? '−' : ''}{usd(value * count)}</div>
            </div>
            <Ico n="chevron" s={15} c={DG.faint} />
          </div>
        );
        const sub = (s: string, c = DG.muted) => <div style={{ fontSize: 10.5, fontWeight: 500, color: c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</div>;
        const iw = sideW - 26;
        let body: React.ReactNode;
        if (i === 0) {
          const lo = Math.min(...CASH_SERIES) - 200, hi = Math.max(...CASH_SERIES) + 200;
          const pts = CASH_SERIES.map((v, j) => [(j / 30) * iw, 30 - ((v - lo) / (hi - lo)) * 30] as const);
          const dr = p01(frame, T.connect + 0.7, T.connect + 1.6, EASE_IN_OUT);
          body = <>{head('wallet', 'CASH AVAILABLE', CHECKING)}
            <svg width={iw} height={34} style={{ display: 'block', margin: '8px 0 4px', overflow: 'visible' }}>
              <defs><clipPath id="t2cash"><rect x={0} y={-4} width={iw * dr} height={40} /></clipPath></defs>
              <g clipPath="url(#t2cash)"><path d={smooth(pts)} stroke={DG.accent} strokeWidth={2} fill="none" strokeLinecap="round" /></g>
            </svg>
            {sub(`After ${usd(BILLS_TOTAL)} in bills this month`, t > T.bills + 0.6 ? DG.accent : DG.muted)}</>;
        } else if (i === 1) {
          const fill = 0.061 * p01(frame, T.connect + 0.8, T.connect + 1.5);
          body = <>{head('card', 'TOTAL OWED', -CARD)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
              <div style={{ flex: 1, height: 6, borderRadius: 6, background: DG.well }}><div style={{ width: `${fill * 100}%`, minWidth: fill > 0 ? 6 : 0, height: 6, borderRadius: 6, background: DG.green }} /></div>
              <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,181,71,0.16)', color: DG.amber, whiteSpace: 'nowrap' }}>Due Nov 14</div>
            </div>
            {sub('One card · 6% of its $10,000 limit')}</>;
        } else {
          const parts = [{ v: CHECKING, c: DG.accent, n: 'Checking' }, { v: SAVINGS, c: '#E58AA8', n: 'Savings' }, { v: INVEST, c: '#7FB7FF', n: 'Investing' }];
          const grow = p01(frame, T.connect + 0.8, T.connect + 1.6, EASE_IN_OUT);
          body = <>{head('bars', 'YOU HAVE', HAVE)}
            <div style={{ display: 'flex', gap: 3, margin: '10px 0 6px', height: 7, width: iw * grow }}>
              {parts.map((p) => <div key={p.n} style={{ flex: p.v, borderRadius: 4, background: p.c }} />)}
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: DG.muted, whiteSpace: 'nowrap' }}>
              {parts.map((p) => <span key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 6, background: p.c }} />{p.n} {Math.round((p.v / HAVE) * 100)}%</span>)}
            </div></>;
        }
        return (
          <Panel key={i} r={r} style={{ ...rise(k, 16), transform: `translateY(${(1 - k) * 16}px) scale(${1 + 0.03 * hot})` }}>
            <div style={{ position: 'absolute', left: 13, right: 13, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{body}</div>
          </Panel>
        );
      })}
    </div>
  );
};

/** The net-worth line, drawn left to right, over a soft fill, with the practice page's axis labels. */
const NetChart: React.FC<{ x: number; y: number; w: number; h: number; draw: number }> = ({ x, y, w, h, draw }) => {
  const axisW = 46, plotW = w - axisW, plotH = h - 20;
  const lo = Math.min(...NET_SERIES) - 300, hi = Math.max(...NET_SERIES) + 300;
  const px = (i: number) => axisW + (i / 30) * plotW;
  const py = (v: number) => ((hi - v) / (hi - lo)) * plotH;
  const pts = NET_SERIES.map((v, i) => [px(i), py(v)] as const);
  const line = smooth(pts);
  const area = `${line} L${px(30)},${plotH} L${px(0)},${plotH} Z`;
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const reveal = axisW + plotW * draw;
  // the head dot rides the curve (interpolated between days, so it glides instead of stepping)
  const fi = Math.min(30, draw * 30), i0 = Math.floor(fi), i1 = Math.min(30, i0 + 1), f = fi - i0;
  const head = [lerp(pts[i0][0], pts[i1][0], f), lerp(pts[i0][1], pts[i1][1], f)];
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id="t2nw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={DG.accent} stopOpacity="0.26" /><stop offset="1" stopColor={DG.accent} stopOpacity="0" /></linearGradient>
          <clipPath id="t2nwc"><rect x="0" y="-10" width={reveal} height={h + 20} /></clipPath>
        </defs>
        {ticks.map((v) => <line key={v} x1={axisW} x2={w} y1={py(v)} y2={py(v)} stroke="rgba(216,194,153,0.10)" strokeWidth={1} />)}
        <g clipPath="url(#t2nwc)">
          <path d={area} fill="url(#t2nw)" />
          <path d={line} fill="none" stroke={DG.accent} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {draw > 0.02 && <circle cx={head[0]} cy={head[1]} r={4.5} fill={DG.page} stroke={DG.accent} strokeWidth={2.4} />}
      </svg>
      {ticks.map((v) => <div key={v} style={{ position: 'absolute', left: 0, top: py(v) - 7, fontSize: 10, fontWeight: 500, color: DG.faint }}>${(v / 1000).toFixed(1)}k</div>)}
      {['Oct 10', 'Oct 17', 'Oct 24', 'Oct 31', 'Nov 10'].map((d, k) => (
        <div key={d} style={{ position: 'absolute', left: axisW + (k / 4) * plotW - (k === 4 ? 40 : k === 0 ? 0 : 18), top: plotH + 5, fontSize: 10, fontWeight: 500, color: DG.faint }}>{d}</div>
      ))}
    </div>
  );
};

/** "Bills & subscriptions": eleven found, a month strip showing when each lands, and the list. */
const BillsView: React.FC<{ frame: number; T: MoneyTimes; w: number; h: number; k: number }> = ({ frame, T, w, h, k }) => {
  const sum = BILLS_TOTAL * p01(frame, T.bills + 0.08, T.bills + 0.9);
  const stripX = 24, stripW = w - 48, dayX = (d: number) => stripX + ((d - 1) / 29) * stripW;
  const colW = (w - 40 - 16) / 2;
  // WHY rows sized to the card: the eleven fill the card, as a real list of bills would.
  const rowH = Math.max(32, Math.min(46, (h - 196 - 16) / 6));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k, transform: `translateX(${(1 - k) * 24}px)` }}>
      <div style={{ position: 'absolute', left: 18, top: 54, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', color: DG.muted }}>RECURRING · EVERY MONTH</div>
      <div style={{ position: 'absolute', left: 16, top: 66, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: '#F6E2B8' }}>{usd(sum)}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: DG.muted }}>a month</span>
      </div>
      <div style={{ position: 'absolute', right: 18, top: 62, height: 26, padding: '0 11px', borderRadius: 26, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
        color: DG.onAccent, background: DG.accent, boxShadow: '0 4px 14px rgba(255,198,39,0.3)', transform: `scale(${sp(frame, T.bills + 0.2, { damping: 9, stiffness: 200 })})` }}>
        <Ico n="check" s={13} c={DG.onAccent} w={3} />11 found
      </div>
      {/* the month strip: a dot on each bill's own day, in its badge's colour, with the day under it; today marked.
          WHY a number under every dot (review 2026-11-20): the dots must visibly agree with the list's dates. */}
      <div style={{ position: 'absolute', left: 0, top: 132, width: w, height: 56 }}>
        <div style={{ position: 'absolute', left: dayX(TODAY) - 18, top: 0, width: 36, textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: DG.fg2 }}>today</div>
        <div style={{ position: 'absolute', left: stripX, width: stripW, top: 22, height: 5, borderRadius: 5, background: DG.well }} />
        <div style={{ position: 'absolute', left: stripX, width: dayX(TODAY) - stripX, top: 22, height: 5, borderRadius: 5, background: 'rgba(255,198,39,0.35)' }} />
        <div style={{ position: 'absolute', left: dayX(TODAY) - 1, top: 13, width: 2, height: 22, borderRadius: 2, background: DG.fg2 }} />
        {BILLS.map((b, i) => {
          const p = sp(frame, T.bills + 0.15 + 0.035 * i, { damping: 9, stiffness: 220 });
          const s = 12;
          return (
            <React.Fragment key={b.name}>
              <div style={{ position: 'absolute', left: dayX(b.day) - s / 2, top: 24.5 - s / 2, width: s, height: s, borderRadius: s, background: KIND[b.kind].col,
                border: `2px solid ${DG.panel}`, transform: `scale(${p})` }} />
              <div style={{ position: 'absolute', left: dayX(b.day) - 12, top: 36, width: 24, textAlign: 'center', fontSize: 9.5, fontWeight: 600, color: DG.faint, opacity: Math.min(1, p) }}>{b.day}</div>
            </React.Fragment>
          );
        })}
      </div>
      {/* the eleven, in two columns */}
      <div style={{ position: 'absolute', left: 20, top: 196, display: 'flex', gap: 16 }}>
        {[0, 1].map((c) => (
          <div key={c} style={{ width: colW }}>
            {BILLS.slice(c * 6, c * 6 + 6).map((b, j) => {
              const i = c * 6 + j;
              const r = sp(frame, T.bills + 0.06 + 0.035 * i, { damping: 14, stiffness: 210 });
              const soon = b.day >= TODAY && b.day < TODAY + 7;
              return (
                <div key={b.name} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${DG.edgeFaint}`, ...rise(r, 0), transform: `translateX(${(1 - r) * 22}px)` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: KIND[b.kind].col }}>{b.name[0]}</div>
                  <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.name}</div>
                  {soon && <div style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: DG.warm, color: '#4A2208', whiteSpace: 'nowrap' }}>this week</div>}
                  <div style={{ fontSize: 11, fontWeight: 500, color: DG.muted, width: 34, textAlign: 'right' }}>{ordinal(b.day)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(b.amt, true)}</div>
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
/** Drawn at `w` px wide in film pixels. `at` = the moment it lands. Its numbers are the money page's.
 *  (Unchanged from the reviewed cut: the review asked to keep this card exactly as it is.) */
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
          {/* WHY smaller sticker type (2026-11-20): at the card's new 500 px width the two stickers' words ran into each other */}
          <div style={{ display: 'flex', gap: 8 * u }}>
            {due.map((b, i) => {
              const k = sp(frame, at + 0.6 + 0.12 * i, { damping: 9, stiffness: 200 });
              return (
                <div key={b.name} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 * u, padding: `${7 * u}px ${10 * u}px`, borderRadius: 16 * u, background: i ? '#FFE0CC' : '#DDF0FF',
                  transform: `scale(${0.5 + 0.5 * k}) rotate(${(i ? 1.5 : -1.5) * k}deg)`, opacity: Math.min(1, k * 1.5) }}>
                  <div style={{ flex: 1, fontSize: 14.5 * u, fontWeight: 500, whiteSpace: 'nowrap' }}>{b.name.toLowerCase()} · {ordinal(b.day)}</div>
                  <div style={{ fontSize: 15 * u, fontWeight: 600 }}>{usd(b.amt, true)}</div>
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
