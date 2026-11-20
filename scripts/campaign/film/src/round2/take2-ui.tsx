// Take 2's STAGED content: the things the person makes inside youcoded (a smart-home screen, their money,
// a cute morning email). Brand guide section 8 allows this in ads: the app around them is real footage;
// what a person makes may be designed for the camera. Everything here is drawn in the app's CSS pixels
// (the page view's content box) so it sits in the real page frame at the real scale, and it is styled from
// the "Rainy Tokyo" (less pink) theme's own tokens so it reads as made by that app, not pasted on.
import React from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { EASE_OUT, FPS } from '../brand';

export const GROTESK = loadGrotesk('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;
const FREDOKA = loadFredoka('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;

// The theme's tokens (take2-make-theme.mjs, "rainy-tokyo-blue"), plus the neon the wallpaper glows in.
export const TK = {
  panel: 'rgba(13,20,40,0.78)', panelSolid: '#0D1428', inset: 'rgba(22,33,61,0.9)', edge: 'rgba(43,127,255,0.38)', edgeSoft: 'rgba(36,68,122,0.55)',
  accent: '#2B7FFF', cyan: '#2DE2FF', pink: '#FF4FA8', warm: '#FFB86B',
  fg: '#F4ECFB', fg2: '#DCD0EA', dim: '#988AB0', faint: '#71648C',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sec = (frame: number) => frame / FPS;
/** 0→1 over [a, b] seconds, eased. */
const p01 = (frame: number, a: number, b: number, e = EASE_OUT) => interpolate(sec(frame), [a, b], [0, 1], { ...clamp, easing: e });
/** A spring that starts at `at` seconds. WHY springs: "punchier" is the person's word; a spring overshoots and settles, which is what punchy means on screen. */
const sp = (frame: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  frame < at * FPS ? 0 : spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping: 14, stiffness: 160, mass: 0.9, ...cfg } });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const money = (n: number, cents = true) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

// ---------------------------------------------------------------- shared bits
const Card: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode; glow?: number }> = ({ style, children, glow = 0 }) => (
  <div style={{
    position: 'absolute', borderRadius: 18, background: TK.panel, border: `1px solid ${TK.edge}`,
    boxShadow: `0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)${glow ? `, 0 0 ${24 * glow}px rgba(45,226,255,${0.25 * glow})` : ''}`,
    overflow: 'hidden', ...style,
  }}>{children}</div>
);
const Bulb: React.FC<{ size: number; on: number }> = ({ size, on }) => (
  // A lamp glyph whose glass fills with warm light as `on` goes 0→1.
  <div style={{ width: size, height: size, borderRadius: size, display: 'grid', placeItems: 'center',
    background: `radial-gradient(circle at 50% 45%, rgba(255,184,107,${0.55 * on}), rgba(255,184,107,${0.12 * on}) 60%, rgba(255,255,255,0.05))`,
    boxShadow: on > 0.05 ? `0 0 ${size * 0.6 * on}px rgba(255,184,107,${0.55 * on})` : 'none', border: `1px solid rgba(255,255,255,${0.08 + 0.2 * on})` }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={on > 0.5 ? '#FFE2BF' : TK.fg2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </svg>
  </div>
);
const Toggle: React.FC<{ on: number; scale?: number; pop?: number }> = ({ on, scale = 1, pop = 0 }) => {
  const w = 44 * scale, h = 26 * scale, k = h - 6 * scale;
  return (
    <div style={{ width: w, height: h, borderRadius: h, padding: 3 * scale, boxSizing: 'border-box', position: 'relative', transform: `scale(${1 + 0.18 * pop})`,
      background: `linear-gradient(90deg, rgba(43,127,255,${on}), rgba(45,226,255,${on}))`, border: `1px solid rgba(255,255,255,${0.1 + 0.15 * on})`,
      boxShadow: on > 0.5 ? `0 0 ${14 * on}px rgba(45,226,255,0.5)` : 'none' }}>
      <div style={{ position: 'absolute', top: 3 * scale, left: 3 * scale + on * (w - k - 6 * scale - 2), width: k, height: k, borderRadius: k, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }} />
    </div>
  );
};
/** A dimmer: `track` is its thickness, so "make the sliders bigger" can literally grow it. */
const Slider: React.FC<{ value: number; track: number; width: number; color?: string }> = ({ value, track, width, color = TK.cyan }) => {
  const knob = track + 12;
  return (
    <div style={{ position: 'relative', width, height: knob }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: (knob - track) / 2, height: track, borderRadius: track, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.06)' }} />
      <div style={{ position: 'absolute', left: 0, top: (knob - track) / 2, height: track, width: Math.max(track, width * value), borderRadius: track,
        background: `linear-gradient(90deg, ${TK.accent}, ${color})`, boxShadow: `0 0 ${track * 0.8}px ${color}66` }} />
      <div style={{ position: 'absolute', top: 0, left: Math.max(0, width * value - knob / 2), width: knob, height: knob, borderRadius: knob, background: '#fff',
        boxShadow: `0 3px 10px rgba(0,0,0,0.4), 0 0 0 ${Math.max(2, track * 0.18)}px ${color}55` }} />
    </div>
  );
};
const Thermostat: React.FC<{ size: number; temp: number; bounce: number; arc: number }> = ({ size, temp, bounce, arc }) => {
  // 270-degree dial; `arc` (0..1) is how far the set point sits along it.
  const r = size * 0.4, cx = size / 2, cy = size / 2, sw = size * 0.075;
  const a0 = 135, a = a0 + 270 * arc;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a), [xe, ye] = pt(a0 + 270);
  const big = a - a0 > 180 ? 1 : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs><linearGradient id="t2arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={TK.accent} /><stop offset="1" stopColor={TK.cyan} /></linearGradient></defs>
        <path d={`M${x0} ${y0} A${r} ${r} 0 1 1 ${xe} ${ye}`} stroke="rgba(255,255,255,0.08)" strokeWidth={sw} fill="none" strokeLinecap="round" />
        <path d={`M${x0} ${y0} A${r} ${r} 0 ${big} 1 ${x1} ${y1}`} stroke="url(#t2arc)" strokeWidth={sw} fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px rgba(45,226,255,0.6))' }} />
        <circle cx={x1} cy={y1} r={sw * 0.85} fill="#fff" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: size * 0.07, color: TK.dim, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>heating to</div>
          <div style={{ fontSize: size * 0.27, fontWeight: 600, color: TK.fg, lineHeight: 1, transform: `scale(${1 + 0.12 * bounce})`, letterSpacing: '-0.03em' }}>{Math.round(temp)}°</div>
          <div style={{ fontSize: size * 0.065, color: TK.dim, marginTop: size * 0.02 }}>inside 68°</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the smart-home screen
export type HomeTimes = { build: number; rearrange: number; bigger: number };
const ROOMS = ['My room', 'Living room', 'Kitchen', 'Hallway', 'Bathroom', 'Porch'];
const ROOM_LIGHTS: Record<string, string> = { 'Living room': 'Floor lamp · TV glow', Kitchen: 'Pendants', Hallway: 'Ceiling', Bathroom: 'Mirror', Porch: 'Lantern' };

/** `W`×`H` is the page view's content box in CSS px. One screen, three states: everything on one screen →
 *  "my room on the front, everything else on a tab" → bigger sliders, punchier motion. */
export const HomeUI: React.FC<{ W: number; H: number; T: HomeTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame();
  const t = sec(frame);
  const pad = 16, gap = 12;
  const re = sp(frame, T.rearrange, { damping: 18, stiffness: 120 });           // layout A → B
  const big = sp(frame, T.bigger, { damping: 9, stiffness: 190, mass: 0.8 });   // slider growth, with overshoot
  const tabsIn = p01(frame, T.rearrange + 0.1, T.rearrange + 0.5);
  // layout A: a 3 × 2 grid of rooms
  const cols = 3, gw = (W - pad * 2 - gap * (cols - 1)) / cols, gh = (H - pad * 2 - gap) / 2;
  const gridRect = (i: number) => ({ x: pad + (i % cols) * (gw + gap), y: pad + Math.floor(i / cols) * (gh + gap), w: gw, h: gh });
  // layout B: tabs on top, "My room" fills the rest; the others shrink into the "Everything else" tab
  const tabY = pad, tabH = 40, tab2X = pad + 132;
  const heroRect = { x: pad, y: tabY + tabH + 12, w: W - pad * 2, h: H - (tabY + tabH + 12) - pad };
  const mix = (a: { x: number; y: number; w: number; h: number }, b: typeof a, k: number) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });

  // the hero room's own state over time
  const lampSweep = sp(frame, T.bigger + 0.55, { damping: 11, stiffness: 120 });
  const lampVal = lerp(0.42, 0.9, lampSweep);
  const ceilOn = sp(frame, T.bigger + 1.35, { damping: 10, stiffness: 260 });
  const ceilPop = t > T.bigger + 1.35 ? Math.max(0, Math.sin(Math.min(1, (t - T.bigger - 1.35) / 0.35) * Math.PI)) : 0;
  const thermoUp = sp(frame, T.bigger + 2.2, { damping: 8, stiffness: 220 });
  const temp = 70 + 2 * Math.min(1, thermoUp);
  const thermoBounce = t > T.bigger + 2.2 ? Math.max(0, Math.sin(Math.min(1, (t - T.bigger - 2.2) / 0.3) * Math.PI)) : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: GROTESK, color: TK.fg }}>
      {/* tabs (layout B) */}
      <div style={{ position: 'absolute', left: pad, top: tabY, height: tabH, display: 'flex', gap: 8, opacity: tabsIn, transform: `translateY(${(1 - tabsIn) * -8}px)` }}>
        {['My room', 'Everything else'].map((name, i) => (
          <div key={name} style={{ height: tabH, padding: '0 18px', borderRadius: tabH, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600,
            background: i === 0 ? `linear-gradient(90deg, ${TK.accent}, #3C8DFF)` : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fff' : TK.fg2,
            border: `1px solid ${i === 0 ? 'rgba(255,255,255,0.2)' : TK.edgeSoft}`, boxShadow: i === 0 ? '0 0 18px rgba(43,127,255,0.45)' : 'none' }}>
            {name}{i === 1 && <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: TK.dim }}>5</span>}
          </div>
        ))}
      </div>
      {ROOMS.map((room, i) => {
        const appear = sp(frame, T.build + 0.06 * i, { damping: 15, stiffness: 170 });
        if (appear <= 0.001) return null;
        const A = gridRect(i);
        if (i === 0) {
          const r = mix(A, heroRect, re);
          return (
            <Card key={room} glow={big} style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: Math.min(1, appear * 1.4), transform: `scale(${0.92 + 0.08 * appear})` }}>
              <RoomHead name={room} sub="3 lights · thermostat" big={re} />
              {/* compact contents (layout A) fade as the card grows */}
              <div style={{ position: 'absolute', left: 16, right: 16, top: 62, opacity: 1 - p01(frame, T.rearrange, T.rearrange + 0.25) }}>
                <MiniRow name="Desk lamp" on={1} value={0.42} />
                <MiniRow name="Ceiling" on={0} value={0} />
                <div style={{ marginTop: 10, fontSize: 13, color: TK.dim }}>Thermostat · heating to 70°</div>
              </div>
              {/* full contents (layout B): the thermostat and every light in the room */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 70, bottom: 0, opacity: p01(frame, T.rearrange + 0.18, T.rearrange + 0.5), display: 'flex', padding: '0 26px 22px', gap: 28 }}>
                <div style={{ flex: 'none', width: heroRect.h - 110, display: 'grid', placeItems: 'center', transform: `scale(${1 + 0.06 * thermoBounce})` }}>
                  <Thermostat size={heroRect.h - 110} temp={temp} bounce={thermoBounce} arc={0.55 + 0.06 * Math.min(1, thermoUp)} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: lerp(18, 26, big) }}>
                  {[
                    { name: 'Desk lamp', on: 1, val: lampVal, pop: 0, col: TK.warm },
                    { name: 'Ceiling', on: Math.min(1, ceilOn), val: lerp(0, 0.7, Math.min(1, ceilOn)), pop: ceilPop, col: TK.cyan },
                    { name: 'LED strip', on: 1, val: 0.6, pop: 0, col: TK.pink },
                  ].map((l, k) => {
                    const rowIn = p01(frame, T.rearrange + 0.22 + 0.08 * k, T.rearrange + 0.62 + 0.08 * k);
                    const rowBig = sp(frame, T.bigger + 0.07 * k, { damping: 9, stiffness: 190, mass: 0.8 });
                    return (
                      <div key={l.name} style={{ opacity: rowIn, transform: `translateX(${(1 - rowIn) * 24}px)` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ transform: `scale(${1 + 0.25 * l.pop})` }}><Bulb size={lerp(40, 50, rowBig)} on={l.on * (0.45 + 0.55 * l.val)} /></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: lerp(17, 20, rowBig), fontWeight: 600 }}>{l.name}</div>
                            <div style={{ fontSize: 13, color: TK.dim }}>{l.on > 0.5 ? `On · ${Math.round(l.val * 100)}%` : 'Off'}</div>
                          </div>
                          <Toggle on={l.on} scale={lerp(1, 1.3, rowBig)} pop={l.pop} />
                        </div>
                        <div style={{ marginTop: lerp(10, 14, rowBig), marginLeft: 2 }}>
                          <Slider value={l.val} track={lerp(8, 28, rowBig)} width={heroRect.w - (heroRect.h - 110) - 110} color={l.col} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        }
        // the other rooms: in the grid, then folded away into the "Everything else" tab
        const B = { x: tab2X + 20, y: tabY + 4, w: 80, h: 32 };
        const k = interpolate(re, [0, 1], [0, 1], clamp);
        const r = mix(A, B, k);
        const fade = 1 - p01(frame, T.rearrange + 0.12, T.rearrange + 0.45);
        if (fade <= 0.001) return null;
        return (
          <Card key={room} style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: Math.min(1, appear * 1.4) * fade, transform: `scale(${0.92 + 0.08 * appear})` }}>
            <RoomHead name={room} sub={ROOM_LIGHTS[room]} big={0} />
            <div style={{ position: 'absolute', left: 16, right: 16, top: 62 }}>
              <MiniRow name={ROOM_LIGHTS[room].split(' · ')[0]} on={i % 2} value={i % 2 ? 0.6 : 0} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};
const RoomHead: React.FC<{ name: string; sub: string; big: number }> = ({ name, sub, big }) => (
  <div style={{ position: 'absolute', left: 16, top: 14, right: 16, display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <div style={{ fontSize: lerp(17, 24, big), fontWeight: 700, letterSpacing: '-0.01em' }}>{name}</div>
    <div style={{ fontSize: 13, color: TK.dim }}>{sub}</div>
  </div>
);
const MiniRow: React.FC<{ name: string; on: number; value: number }> = ({ name, on, value }) => (
  <div style={{ marginTop: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Bulb size={28} on={on * 0.8} />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</div>
      <Toggle on={on} scale={0.8} />
    </div>
    <div style={{ marginTop: 8 }}><Slider value={value} track={6} width={230} /></div>
  </div>
);

// ---------------------------------------------------------------- money
export type MoneyTimes = { connect: number; bills: number };
const ACCOUNTS = [
  { name: 'Everyday checking', sub: '•••• 4417', value: 3482.17, col: TK.cyan },
  { name: 'Savings', sub: '•••• 0921', value: 12940.0, col: TK.accent },
  { name: 'Credit card', sub: 'due on the 14th', value: -612.4, col: TK.pink },
];
const BILLS: [string, string, number][] = [
  ['Rent', '1st', 1450], ['Car insurance', '3rd', 118], ['Electric', '6th', 82.4], ['Internet', '9th', 60], ['Phone', '12th', 45],
  ['Gym', '15th', 39], ['Water', '18th', 34.1], ['TV streaming', '20th', 15.49], ['Renter’s insurance', '22nd', 14], ['Music', '25th', 11.99], ['Cloud storage', '28th', 2.99],
];
const BILLS_TOTAL = BILLS.reduce((s, b) => s + b[2], 0);

export const MoneyUI: React.FC<{ W: number; H: number; T: MoneyTimes }> = ({ W, H, T }) => {
  const frame = useCurrentFrame(); const t = sec(frame);
  const pad = 16;
  const connecting = t < T.connect + 0.45;
  const total = ACCOUNTS.reduce((s, a) => s + a.value, 0);
  const count = p01(frame, T.connect + 0.4, T.connect + 1.5, EASE_OUT);
  const squash = sp(frame, T.bills, { damping: 17, stiffness: 130 });   // balances fold up to make room for the bills
  const heroIn = sp(frame, T.connect + 0.25, { damping: 16 });
  const heroH = lerp(150, 0, squash), cardsY = pad + 44 + lerp(heroH + 8, 6, squash), cardsH = lerp(H - (pad + 44 + heroH + 8) - pad, 92, squash);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: GROTESK, color: TK.fg }}>
      {/* connection chip */}
      <div style={{ position: 'absolute', left: pad, top: pad, height: 32, padding: '0 14px', borderRadius: 32, display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 500,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TK.edgeSoft}`, opacity: p01(frame, T.connect, T.connect + 0.2) }}>
        <div style={{ width: 9, height: 9, borderRadius: 9, background: connecting ? TK.warm : '#3DDC97', boxShadow: `0 0 10px ${connecting ? TK.warm : '#3DDC97'}` }} />
        {connecting ? 'Connecting to First Harbor Bank…' : 'First Harbor Bank · connected just now'}
      </div>
      {/* total */}
      <div style={{ position: 'absolute', left: pad + 4, top: pad + 52, height: heroH, overflow: 'hidden', opacity: heroIn * (1 - squash), transform: `translateY(${(1 - heroIn) * 16}px)` }}>
        <div style={{ fontSize: 14, color: TK.dim, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>Everything, right now</div>
        <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.05, textShadow: '0 0 30px rgba(45,226,255,0.35)' }}>{money(total * count)}</div>
      </div>
      {/* accounts */}
      {ACCOUNTS.map((a, i) => {
        const inn = sp(frame, T.connect + 0.45 + 0.09 * i, { damping: 14, stiffness: 150 });
        const cw = (W - pad * 2 - 12 * 2) / 3;
        return (
          <Card key={a.name} style={{ left: pad + i * (cw + 12), top: cardsY, width: cw, height: cardsH, opacity: Math.min(1, inn * 1.5), transform: `translateY(${(1 - inn) * 40}px)` }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: a.col, boxShadow: `0 0 14px ${a.col}` }} />
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: TK.fg2, fontWeight: 500 }}><span>{a.name}</span><span style={{ color: TK.dim }}>{a.sub}</span></div>
              <div style={{ fontSize: lerp(40, 30, squash), fontWeight: 600, letterSpacing: '-0.03em', marginTop: lerp(10, 4, squash), color: a.value < 0 ? '#FFC2DD' : TK.fg }}>
                {a.value < 0 ? '−' : ''}{money(Math.abs(a.value) * count)}
              </div>
              {/* a little sparkline per account, drawn left to right */}
              <svg width={cw - 36} height={lerp(70, 0, squash)} style={{ marginTop: 10, opacity: 1 - squash }}>
                <path d={spark(i, cw - 36, 60)} fill="none" stroke={a.col} strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray={1000} strokeDashoffset={1000 * (1 - p01(frame, T.connect + 0.7 + 0.1 * i, T.connect + 1.8 + 0.1 * i))} style={{ filter: `drop-shadow(0 0 6px ${a.col})` }} />
              </svg>
            </div>
          </Card>
        );
      })}
      {/* bills */}
      {t >= T.bills - 0.05 && <Bills frame={frame} T={T} x={pad} y={cardsY + 92 + 12} w={W - pad * 2} h={H - (cardsY + 92 + 12) - pad} />}
    </div>
  );
};
const spark = (seed: number, w: number, h: number) => {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const y = h * (0.55 + 0.3 * Math.sin(i * 0.9 + seed * 2.1) * (seed === 2 ? -0.6 : 0.6) - (seed === 1 ? i * 0.035 : 0));
    return `${(i / 11) * w},${Math.max(4, Math.min(h - 4, y))}`;
  });
  return 'M' + pts.join(' L');
};
const Bills: React.FC<{ frame: number; T: MoneyTimes; x: number; y: number; w: number; h: number }> = ({ frame, T, x, y, w, h }) => {
  const inn = sp(frame, T.bills + 0.1, { damping: 16, stiffness: 140 });
  const rowsPerCol = 6, colW = (w - 36 - 20) / 2, rowH = Math.min(40, (h - 70) / rowsPerCol);
  const sum = BILLS_TOTAL * p01(frame, T.bills + 0.3, T.bills + 1.3);
  return (
    <Card style={{ left: x, top: y, width: w, height: h, opacity: Math.min(1, inn * 1.4), transform: `translateY(${(1 - inn) * 60}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Recurring bills</div>
        <div style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(45,226,255,0.14)', color: TK.cyan, border: '1px solid rgba(45,226,255,0.35)' }}>11 found</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{money(sum)}<span style={{ fontSize: 14, color: TK.dim, fontWeight: 500 }}> a month</span></div>
      </div>
      <div style={{ display: 'flex', gap: 20, padding: '4px 18px' }}>
        {[0, 1].map((c) => (
          <div key={c} style={{ width: colW }}>
            {BILLS.slice(c * rowsPerCol, c * rowsPerCol + rowsPerCol).map(([name, due, amt], k) => {
              const i = c * rowsPerCol + k;
              const r = sp(frame, T.bills + 0.25 + 0.055 * i, { damping: 15, stiffness: 200 });
              return (
                <div key={name} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: Math.min(1, r * 1.5), transform: `translateX(${(1 - r) * 30}px)` }}>
                  <div style={{ width: 8, height: 8, borderRadius: 8, background: [TK.cyan, TK.accent, TK.pink, TK.warm][i % 4], boxShadow: `0 0 8px ${[TK.cyan, TK.accent, TK.pink, TK.warm][i % 4]}` }} />
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 12, color: TK.dim, width: 78, whiteSpace: 'nowrap' }}>on the {due}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, width: 84, textAlign: 'right' }}>{money(amt)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- the kawaii morning email
/** Drawn at `w` px wide in film pixels. `at` = the moment it lands. */
export const KawaiiEmail: React.FC<{ w: number; at: number }> = ({ w, at }) => {
  const frame = useCurrentFrame();
  const u = w / 600;   // designed at 600 wide
  const blink = (Math.floor(sec(frame) * 10) % 34) === 0 ? 0.15 : 1;   // the cloud blinks now and then
  const bob = Math.sin((sec(frame) - at) * 3.2) * 3 * u;
  const rows = [
    { label: 'checking', value: '$3,482.17', bg: '#CFF5EC', ic: '♡' },
    { label: 'savings', value: '$12,940.00', bg: '#E4DAFF', ic: '☆' },
    { label: 'bills this week', value: '3 · $143.48', bg: '#FFE0CC', ic: '✿' },
  ];
  return (
    <div style={{ width: w, borderRadius: 34 * u, background: 'linear-gradient(180deg, #FFF8FC 0%, #FFEFF6 100%)', boxShadow: `0 ${30 * u}px ${80 * u}px rgba(20,6,40,0.55), 0 0 0 ${3 * u}px #FFD3E6`,
      fontFamily: FREDOKA, color: '#6B3E6E', overflow: 'hidden', position: 'relative' }}>
      {/* the mail header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${18 * u}px ${24 * u}px`, background: '#FFE3EF', borderBottom: `${2 * u}px dashed #FFC2DB` }}>
        <div style={{ width: 40 * u, height: 40 * u, borderRadius: 40 * u, background: 'linear-gradient(135deg,#B69CFF,#FF9CC8)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600, fontSize: 20 * u }}>y</div>
        <div style={{ flex: 1, lineHeight: 1.25 }}>
          <div style={{ fontSize: 17 * u, fontWeight: 600 }}>youcoded</div>
          <div style={{ fontSize: 14 * u, opacity: 0.75 }}>to me · 7:00 am</div>
        </div>
        <div style={{ fontSize: 22 * u, color: '#FF8FBF' }}>✉</div>
      </div>
      <div style={{ padding: `${20 * u}px ${28 * u}px ${26 * u}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u }}>
          {/* the mascot: a little cloud with a face */}
          <svg width={110 * u} height={84 * u} viewBox="0 0 110 84" style={{ flex: 'none', transform: `translateY(${bob}px)` }}>
            <path d="M24 70 C6 70 4 46 20 42 C18 22 44 14 54 28 C62 10 92 14 90 36 C106 38 106 70 86 70 Z" fill="#fff" stroke="#FFC2DB" strokeWidth="3" />
            <ellipse cx="44" cy={50} rx="4.5" ry={6 * blink} fill="#5B3A5E" />
            <ellipse cx="68" cy={50} rx="4.5" ry={6 * blink} fill="#5B3A5E" />
            <ellipse cx="36" cy="60" rx="7" ry="4" fill="#FFB3CF" opacity="0.8" />
            <ellipse cx="77" cy="60" rx="7" ry="4" fill="#FFB3CF" opacity="0.8" />
            <path d="M51 58 Q56 64 61 58" stroke="#5B3A5E" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{ fontSize: 30 * u, fontWeight: 600, lineHeight: 1.1, color: '#5B3A5E' }}>good morning!!</div>
            <div style={{ fontSize: 18 * u, opacity: 0.85, marginTop: 4 * u }}>here are your numbers ♡</div>
          </div>
        </div>
        <div style={{ marginTop: 18 * u, display: 'flex', flexDirection: 'column', gap: 10 * u }}>
          {rows.map((r, i) => {
            const k = sp(frame, at + 0.25 + 0.12 * i, { damping: 11, stiffness: 180 });
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${12 * u}px ${18 * u}px`, borderRadius: 22 * u, background: r.bg,
                transform: `scale(${0.6 + 0.4 * k})`, opacity: Math.min(1, k * 1.5) }}>
                <div style={{ fontSize: 20 * u, width: 22 * u, textAlign: 'center' }}>{r.ic}</div>
                <div style={{ flex: 1, fontSize: 19 * u, fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 24 * u, fontWeight: 600 }}>{r.value}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16 * u, fontSize: 17 * u, textAlign: 'center', opacity: 0.8 }}>have the best day ✧ (ﾉ◕ヮ◕)ﾉ</div>
      </div>
      {/* a few hearts drifting up out of the card */}
      {[0, 1, 2, 3].map((i) => {
        const tt = (sec(frame) - at - i * 0.35) % 2.2;
        if (sec(frame) < at + i * 0.35) return null;
        return <div key={i} style={{ position: 'absolute', right: (40 + i * 46) * u, top: (90 - tt * 60) * u, fontSize: (16 + (i % 2) * 6) * u, color: ['#FF8FBF', '#B69CFF', '#7FD8C3', '#FFB48A'][i], opacity: interpolate(tt, [0, 0.3, 1.6, 2.2], [0, 0.9, 0.6, 0]) }}>♥</div>;
      })}
    </div>
  );
};
