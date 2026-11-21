// Take 1B: the world. A wall of shelves holding dozens of real-looking devices (phones, tablets, laptops,
// monitors, one big TV), all drawn in code with light from above, glass sheen and soft plum shadows.
// The camera is the film's editor: every shot is just a different framing of this one wall, which is what
// makes "the same screen, everywhere" readable and lets the change at the end visibly spread screen to screen.
import React from 'react';
import { C, DMSANS } from '../brand';

export type Kind = 'phone' | 'tablet' | 'laptop' | 'monitor' | 'tv';
export type Dev = { id: string; kind: Kind; row: number; cx: number; cy: number; w: number; h: number; shelf: number; app: number; dist: number };

// screen sizes in world pixels, and what holds the screen up off the shelf
const SIZE: Record<Kind, { w: number; h: number; lift: number; bezel: number; radius: number }> = {
  // WHY radius 12 (was 20, round 7 reviewer BLOCKER: the screen's corner clipped the app's own status row, "olden Sunbreak"):
  // the real window's bottom-left chip now sits inside the rounded glass, as it does on a real phone
  phone: { w: 136, h: 284, lift: 8, bezel: 7, radius: 12 },
  tablet: { w: 360, h: 250, lift: 10, bezel: 11, radius: 18 },
  // WHY lift 30 (was 18, round 7 reviewer: the laptop read as another tablet): room for a keyboard deck seen from just above
  laptop: { w: 400, h: 250, lift: 30, bezel: 9, radius: 10 },
  // WHY 482 wide (was 470): the TV still's exact ratio (2560x1434), so a monitor wears a TV still with no crop and no stretch
  monitor: { w: 482, h: 270, lift: 64, bezel: 8, radius: 8 },
  tv: { w: 1000, h: 560, lift: 46, bezel: 9, radius: 8 },
};
export const ROW = 440;           // shelf spacing
const GAP = 74;                   // between devices on a shelf
const REACH = 3700;               // how far each shelf runs either side of centre

// WHY hand-written sequences (not random): the wall must look designed, with phones punctuating the big
// screens, and the devices the story needs (hero phone, the tablet with the price tag, the laptop that
// stays locked, the TV) must sit exactly where the camera expects them.
const SEQ: Record<number, { centre: Kind | null; gapHalf?: number; right: Kind[]; left: Kind[] }> = {
  [-3]: { centre: null, gapHalf: 640, right: ['phone', 'laptop', 'phone', 'monitor', 'tablet', 'phone'], left: ['tablet', 'phone', 'monitor', 'phone', 'laptop', 'phone'] },
  [-2]: { centre: 'tv', right: ['phone', 'tablet', 'phone', 'laptop', 'phone', 'monitor'], left: ['phone', 'laptop', 'phone', 'tablet', 'monitor', 'phone'] },
  [-1]: { centre: 'laptop', right: ['phone', 'monitor', 'phone', 'tablet', 'laptop', 'phone'], left: ['phone', 'tablet', 'phone', 'monitor', 'phone', 'laptop'] },
  [0]: { centre: 'phone', right: ['tablet', 'phone', 'laptop', 'phone', 'monitor', 'phone', 'tablet'], left: ['laptop', 'phone', 'tablet', 'phone', 'monitor', 'phone'] },
  [1]: { centre: 'monitor', right: ['phone', 'laptop', 'phone', 'tablet', 'phone', 'monitor'], left: ['phone', 'tablet', 'phone', 'laptop', 'phone', 'monitor'] },
  [2]: { centre: 'tablet', right: ['phone', 'monitor', 'phone', 'laptop', 'phone'], left: ['phone', 'laptop', 'phone', 'monitor', 'phone'] },
};

const build = (): { devs: Dev[]; shelves: { y: number; gaps: [number, number][] }[] } => {
  const devs: Dev[] = [];
  const shelves: { y: number; gaps: [number, number][] }[] = [];
  let appN = 0;
  // WHY this app order: neighbours on a shelf and the shelf above never share an app, so the finished
  // wall reads as a mosaic of different things rather than stripes. App 0 (the recipes) is the hero's alone.
  const nextApp = () => 1 + ((appN++ * 5) % 8);
  for (const r of [-3, -2, -1, 0, 1, 2]) {
    const s = SEQ[r];
    const shelf = r * ROW;
    const place = (kind: Kind, x: number, id: string) => {
      const z = SIZE[kind];
      const cy = shelf - z.lift - z.h / 2;
      // WHY the unlocked laptop gets the bright chores chart: a dark app opening on it read as a black hole
      devs.push({ id, kind, row: r, cx: x, cy, w: z.w, h: z.h, shelf, app: id === 'hero' ? 0 : id === 'lockLaptop' ? (nextApp(), 1) : nextApp(), dist: Math.hypot(x, cy + 150) });
    };
    let right: number, left: number;
    if (s.centre) {
      const z = SIZE[s.centre];
      place(s.centre, 0, r === 0 ? 'hero' : r === -1 ? 'lockLaptop' : r === -2 ? 'tv' : `${r}:c`);
      right = z.w / 2 + z.bezel; left = -right;
    } else { right = s.gapHalf ?? 0; left = -right; }
    for (let i = 0; right < REACH; i++) {
      const kind = s.right[i % s.right.length]; const z = SIZE[kind];
      const x = right + GAP + z.w / 2 + z.bezel;
      place(kind, x, r === 0 && i === 0 ? 'tagTablet' : `${r}:r${i}`);
      right = x + z.w / 2 + z.bezel;
    }
    for (let i = 0; left > -REACH; i++) {
      const kind = s.left[i % s.left.length]; const z = SIZE[kind];
      const x = left - GAP - z.w / 2 - z.bezel;
      place(kind, x, `${r}:l${i}`);
      left = x - z.w / 2 - z.bezel;
    }
    // the TV pokes up through the shelf above, so that shelf is cut around it
    shelves.push({ y: shelf, gaps: r === -3 ? [[-(s.gapHalf ?? 0) + 30, (s.gapHalf ?? 0) - 30]] : [] });
  }
  return { devs, shelves };
};
export const WORLD = build();
export const dev = (id: string) => {
  const d = WORLD.devs.find((x) => x.id === id);
  if (!d) throw new Error(`take1b: no device "${id}"`);
  return d;
};

// =====================================================================================================
// A device: body, bezel, glass, and the light it throws onto its shelf.
// =====================================================================================================
export const Device: React.FC<{ d: Dev; night: number; glow: string; lift?: number; glowK?: number; children: React.ReactNode }> = ({ d, night, glow, lift = 0, glowK = 1, children }) => {
  const z = SIZE[d.kind];
  const b = z.bezel;
  const W = d.w + b * 2, H = d.h + b * 2;
  const left = d.cx - W / 2, top = d.cy - H / 2;
  // bodies are plum-black aluminium lit from above: a lighter top edge, a darker bottom
  const body = `linear-gradient(180deg, #3A2C46 0%, #241A2E 45%, #1A1222 100%)`;
  const pop = 1 + lift * 0.05;
  // WHY glowK (round 7 reviewer): a screen that is switched off, or mostly outside a close shot, throws no light
  const gk = Math.max(0, glowK);
  return (
    <>
      {/* the light the screen throws down onto the shelf (only reads at night) */}
      {gk > 0.01 && <div style={{ position: 'absolute', left: d.cx - W * 0.7, width: W * 1.4, top: d.shelf - 26, height: 60, borderRadius: '50%',
        background: `radial-gradient(closest-side, ${glow}, transparent)`, opacity: 0.32 * night * gk }} />}
      {/* contact shadow under the device */}
      <div style={{ position: 'absolute', left: d.cx - W * 0.46, width: W * 0.92, top: d.shelf - 9, height: 18, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(20,8,32,0.55), transparent)' }} />
      {/* stands */}
      {/* WHY a keyboard deck seen from just above (round 7 reviewer: "it reads as the tablet again, not as a computer"): the hinge, two
          faint rows of keys and a trackpad, so a laptop is a laptop from across the room */}
      {d.kind === 'laptop' && <div style={{ position: 'absolute', left: d.cx - W * 0.58, width: W * 1.16, top: d.shelf - z.lift + 1, height: z.lift - 1,
        background: 'linear-gradient(180deg,#4E3F5B 0%,#3A2E46 30%,#2A2034 100%)', borderRadius: '2px 2px 9px 9px', clipPath: 'polygon(7% 0,93% 0,100% 100%,0 100%)' }}>
        <div style={{ position: 'absolute', left: '7%', right: '7%', top: 0, height: 2.5, background: '#16101C' }} />
        {[0, 1, 2].map((r) => <div key={r} style={{ position: 'absolute', left: `${13 - r * 2}%`, right: `${13 - r * 2}%`, top: 5 + r * 5.5, height: 3.6, borderRadius: 1.5,
          background: 'repeating-linear-gradient(90deg, rgba(14,9,20,0.75) 0 7px, transparent 7px 9px)' }} />)}
        <div style={{ position: 'absolute', left: '40%', right: '40%', bottom: 3, height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }} />
      </div>}
      {(d.kind === 'monitor' || d.kind === 'tv') && <>
        <div style={{ position: 'absolute', left: d.cx - (d.kind === 'tv' ? 30 : 22), width: d.kind === 'tv' ? 60 : 44, top: top + H - 4, height: d.shelf - (top + H) + 2,
          background: 'linear-gradient(90deg,#1E1527,#4A3B56 50%,#1E1527)' }} />
        <div style={{ position: 'absolute', left: d.cx - (d.kind === 'tv' ? 260 : 110), width: d.kind === 'tv' ? 520 : 220, top: d.shelf - 12, height: 12,
          background: 'linear-gradient(180deg,#4A3B56,#1E1527)', borderRadius: '6px 6px 2px 2px' }} />
      </>}
      <div style={{ position: 'absolute', left, top, width: W, height: H, transform: lift ? `translateY(${-lift * 14}px) scale(${pop})` : undefined, transformOrigin: '50% 100%' }}>
        {/* WHY the body's corner is the screen's corner plus the bezel (round 7 reviewer: the screen looked pasted onto its frame): the two
            curves are concentric, as on a real device */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: z.radius + b, background: body,
          boxShadow: `0 ${18 + lift * 26}px ${40 + lift * 40}px rgba(20,8,32,${0.5 + lift * 0.1}), 0 0 ${50 * night * gk}px ${glow.replace('1)', `${0.12 * night * gk})`)}, inset 0 1.5px 0 rgba(255,255,255,0.16), inset 0 -2px 0 rgba(0,0,0,0.35)` }} />
        <div style={{ position: 'absolute', left: b, top: b, width: d.w, height: d.h, borderRadius: z.radius, overflow: 'hidden', background: '#000' }}>
          {children}
          {/* a hairline of black where the glass meets the bezel, and a soft edge shade: a screen is set into its frame */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: z.radius, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.7), inset 0 0 ' + (b * 1.2) + 'px rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
          {/* glass: one soft diagonal highlight across the whole pane, about 6% at its brightest (round 7 reviewer: the old sheen ended
              in a hard line a third of the way across, which read as a printed stripe rather than glass) */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(122deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.035) 38%, rgba(255,255,255,0) 58%, rgba(255,255,255,0) 82%, rgba(255,255,255,0.025) 100%)', pointerEvents: 'none' }} />
        </div>
        {/* WHY the camera sits in the bezel above the glass (round 7 reviewer BLOCKER: a punch-hole on the glass covered "ch" of the app's own
            "new chat" title): the app's window is never covered by anything drawn */}
        {d.kind === 'phone' && <div style={{ position: 'absolute', left: W / 2 - 2, top: (b - 4) / 2, width: 4, height: 4, borderRadius: 4, background: '#0A060E', boxShadow: '0 0 0 0.7px rgba(255,255,255,0.1)' }} />}
      </div>
    </>
  );
};

/** The shelves: lilac-lit planks with a highlight on the front edge and a shadow below. */
export const Shelves: React.FC<{ night: number; dayLen?: number }> = ({ night, dayLen = 0 }) => (
  <>
    {WORLD.shelves.map((s, i) => {
      const segs: [number, number][] = [];
      let x = -REACH - 400;
      for (const [a, b] of s.gaps) { segs.push([x, a]); x = b; }
      segs.push([x, REACH + 400]);
      return segs.map(([a, b], j) => (
        <React.Fragment key={`${i}-${j}`}>
          <div style={{ position: 'absolute', left: a, width: b - a, top: s.y, height: 16,
            background: night > 0.5 ? 'linear-gradient(180deg,#4B3A58,#2A1F33)' : 'linear-gradient(180deg,#FFFFFF,#E6D8EF)',
            boxShadow: night > 0.5 ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : 'inset 0 1px 0 #fff' }} />
          {/* WHY dayLen (round 8 reviewer: the daylight read as a flat backdrop with no direction): as the day comes up the shadow under
              each shelf grows longer and a little warmer, as if the sun were rising behind the viewer's left shoulder */}
          <div style={{ position: 'absolute', left: a, width: b - a, top: s.y + 16, height: night > 0.5 ? 46 : 46 + 70 * dayLen,
            background: `linear-gradient(${night > 0.5 ? 180 : 172}deg, rgba(${night > 0.5 ? '6,2,12,0.55' : `74,38,96,${0.16 + 0.08 * dayLen}`}), transparent)` }} />
        </React.Fragment>
      ));
    })}
  </>
);

// =====================================================================================================
// The pointer: one standard arrow (white with a dark edge, a soft shadow), the same shape every desktop uses,
// so it reads at once as "someone is clicking". WHY (owner 2026-11-20: "the mouse pointers are kinda strange"):
// the old oversized near-black arrows, five at a time and turned to face things, read as clip art. Now there is
// one, correctly proportioned (about 0.64 wide for every 1 tall), never rotated, with a real click: it dips and
// a ring spreads from its tip.
// =====================================================================================================
export type Pointer = { x: number; y: number; press: number; o: number; rot?: number };
export const PointerArrow: React.FC<{ p: Pointer; size: number }> = ({ p, size }) => {
  if (p.o <= 0) return null;
  // a click squeezes the arrow a little about its tip, as the real thing is pressed
  const sc = 1 - 0.1 * p.press;
  const ring = size * 0.62;
  const rw = Math.max(1.5, size * 0.03);
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, opacity: p.o }}>
      {/* WHY two rings, dark outside and white inside (reviewer 2026-11-20: the old white-only ring vanished on the near-white screens):
          the click is seen on a dark wall and on a bright screen alike */}
      {p.press > 0.04 && <>
        <div style={{ position: 'absolute', left: -ring * p.press, top: -ring * p.press, width: ring * 2 * p.press, height: ring * 2 * p.press, borderRadius: '50%',
          border: `${rw}px solid rgba(34,20,46,${0.7 * (1 - p.press * 0.55)})` }} />
        <div style={{ position: 'absolute', left: -ring * p.press + rw, top: -ring * p.press + rw, width: ring * 2 * p.press - rw * 2, height: ring * 2 * p.press - rw * 2, borderRadius: '50%',
          border: `${rw}px solid rgba(255,255,255,${0.85 * (1 - p.press * 0.55)})` }} />
      </>}
      {/* WHY a thinner edge, a softer contact shadow and a faint grey toward the tail (reviewer: the thick flat outline read as clip art):
          it is now the ordinary system cursor shape, drawn the way an operating system draws it */}
      <svg width={size * 0.64} height={size} viewBox="0 0 16 25" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transform: `scale(${sc})`, transformOrigin: '0 0',
        filter: `drop-shadow(${size * 0.012}px ${size * 0.04}px ${size * 0.05}px rgba(8,3,14,0.45))` }}>
        <defs><linearGradient id="ptrFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E4DEEA" /></linearGradient></defs>
        {/* the classic arrow: tip at (1,1), a straight left edge, a notched tail */}
        <path d="M1.2 1 L1.2 20.4 L5.6 16.2 L8.6 23.2 L11.6 21.9 L8.7 15.1 L14.8 15.1 Z" fill="url(#ptrFill)" stroke="#1B1024" strokeWidth="0.85" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// =====================================================================================================
// A price tag on a string, swinging after it drops. Text can change (the price ticks).
// =====================================================================================================
export const PriceTag: React.FC<{ x: number; y: number; t: number; drop: number; text: string; scale?: number; fall?: number; dark?: boolean; strike?: number; sub?: string; slap?: boolean; flipFrom?: string; flipAt?: number; kicks?: number[] }> = ({ x, y, t, drop, text, scale = 1, fall = 0, strike = 0, sub, slap = false, flipFrom, flipAt, kicks = [] }) => {
  if (t < drop) return null;
  if (slap) return <SlapTag x={x} y={y} t={t} drop={drop} text={text} scale={scale} fall={fall} strike={strike} sub={sub} flipFrom={flipFrom} flipAt={flipAt} />;
  const dt = t - drop;
  const enter = Math.min(1, dt / 0.35);
  const ease = 1 - Math.pow(1 - enter, 3);
  // a damped swing: big first arc, settling within ~2 s, like a real tag on a string
  // WHY a pendulum (reviewer: the tag landed stiffly): about 9 degrees, two clear swings, then rest
  // WHY kicks (round 8 reviewer: "make the excitement about the price"): each time the number ticks up the tag gets a fresh small swing on
  // its string and the number pops, so greed is acted by the price itself while the camera holds still
  const kickSwing = kicks.reduce((a, k) => (t >= k ? a + 6 * Math.exp(-(t - k) * 2.6) * Math.sin((t - k) * 9) : a), 0);
  const lastKick = kicks.filter((k) => t >= k).pop();
  const numPop = lastKick !== undefined ? 1 + 0.14 * Math.exp(-(t - lastKick) * 10) * (t - lastKick < 0.5 ? 1 : 0) : 1;
  const swing = 9 * Math.exp(-dt * 1.6) * Math.sin(dt * 7) + kickSwing;
  // WHY a short drop and a fade (reviewer: the tag fell out of frame like a glitch): it lets go, sinks a few pixels and dissolves
  const fy = fall > 0 ? fall * fall * 50 : 0;
  const len = 70 * scale;
  return (
    <div style={{ position: 'absolute', left: x, top: y - (1 - ease) * 300 + fy, width: 0, height: 0, transform: `rotate(${swing + fall * 6}deg)`, transformOrigin: '0 0', opacity: fall > 0 ? 1 - fall : 1 }}>
      {fall < 0.3 && <div style={{ position: 'absolute', left: -1.2 * scale, top: 0, width: 2.4 * scale, height: len, background: '#D9CBE4' }} />}
      <div style={{ position: 'absolute', left: -95 * scale, top: len, width: 190 * scale, height: 92 * scale, filter: `drop-shadow(0 ${10 * scale}px ${14 * scale}px rgba(20,8,32,0.45))` }}>
        <svg width={190 * scale} height={92 * scale} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
          <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
          <circle cx="95" cy="12" r="5" fill="#2A1F33" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22 * scale, height: 70 * scale, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: DMSANS, fontWeight: 900, fontSize: 38 * scale, letterSpacing: '-0.04em', color: C.plum, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {/* WHY a small "per month" (reviewer): a tag on a device reads as the device's price; this says it is what using it costs */}
          <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, transform: `scale(${numPop})` }}>{text}
            {sub && <span style={{ fontSize: 14 * scale, fontWeight: 700, letterSpacing: 0, color: C.plum2, marginTop: 2 * scale }}>{sub}</span>}
            {/* WHY a strike drawn left to right: "what it costs" is decided by us now; the old price is crossed out before it becomes "free" */}
            {strike > 0 && <span style={{ position: 'absolute', left: '-6%', top: '52%', height: 6 * scale, borderRadius: 6 * scale, width: `${112 * strike}%`, background: C.purple }} />}
          </span>
        </div>
      </div>
    </div>
  );
};

/** WHY a tag that is slapped on instead of hung from a string (reviewer 2026-11-20: the dangling string and tag fell off the bottom
 *  edge of the frame): it lands centred on (x, y) on the device's own corner, a little large, overshoots and settles at a slight
 *  tilt, so the price is clearly "stuck on" that screen and sits well inside the frame. */
const SlapTag: React.FC<{ x: number; y: number; t: number; drop: number; text: string; scale: number; fall: number; strike: number; sub?: string; flipFrom?: string; flipAt?: number }> = ({ x, y, t, drop, text, scale, fall, strike, sub, flipFrom, flipAt }) => {
  const dt = t - drop;
  // WHY solid from its first frame and only a little large (round 7 reviewer BLOCKER: it arrived as a giant see-through ghost bigger than
  // the tablet, which read as a compositing error): it starts at 1.12x, 30 px up, lands in 5 frames, squashes 3% and settles in 2
  const LAND = 5 / 30, SETTLE = 2 / 30;
  const p = Math.min(1, dt / LAND), pin = p * p;   // ease-in: it is thrown, so it speeds up into the screen
  const sz = dt < LAND ? 1.12 - 0.12 * pin : 1;
  const squash = dt >= LAND && dt < LAND + SETTLE * 2 ? Math.sin(Math.PI * (dt - LAND) / (SETTLE * 2)) : 0;
  const tilt = -6 + (dt < LAND ? 3 * (1 - pin) : 0);
  const lift = dt < LAND ? (1 - pin) * 30 * scale : 0;
  // WHY a swing then a drop, never a fade (round 8 reviewer: the fading tag sat over the new page like smudged grey glass): over the first
  // 40% of `fall` it swings about 8 degrees on its corner as if knocked; then it drops out of frame on an ease-in, fully opaque
  const knock = Math.min(1, fall / 0.4), drop2 = Math.max(0, (fall - 0.4) / 0.6);
  const fy = fall > 0 ? drop2 * drop2 * 900 * scale : 0;
  const fallRot = fall > 0 ? 8 * Math.sin(Math.PI * 0.5 * knock) + 14 * drop2 : 0;
  const W = 190 * scale * 1.15, H = 92 * scale * 1.15;
  // WHY a split-flap turn for a price change (round 7 reviewer: four prices flickered past in 0.7 s): the old price folds away on its top
  // half's hinge and the new one folds down into place, 4 frames each way, so one change is seen and read
  const FLIP = 0.13;
  const fp = flipFrom !== undefined && flipAt !== undefined ? Math.max(0, Math.min(1, (t - flipAt) / FLIP)) : 1;
  const shown = fp < 0.5 && flipFrom !== undefined ? flipFrom : text;
  const rx = fp < 1 ? (fp < 0.5 ? fp * 2 * 90 : (1 - (fp - 0.5) * 2) * -90) : 0;
  return (
    <div style={{ position: 'absolute', left: x - W / 2, top: y - H / 2 + fy - lift, width: W, height: H, transform: `rotate(${tilt + fallRot}deg) scale(${sz * (1 + 0.012 * squash)}, ${sz * (1 - 0.03 * squash)})`, transformOrigin: '50% 100%', opacity: 1,
      filter: `drop-shadow(0 ${(8 + lift * 0.4) * scale}px ${(12 + lift * 0.5) * scale}px rgba(20,8,32,0.5))` }}>
      <svg width={W} height={H} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
        <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
        <circle cx="95" cy="12" r="5" fill="#2A1F33" />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 22 * scale * 1.15, height: 70 * scale * 1.15, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 300 * scale,
        fontFamily: DMSANS, fontWeight: 900, fontSize: 38 * scale * 1.15, letterSpacing: '-0.04em', color: C.plum, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ display: 'inline-block', transform: rx ? `rotateX(${rx}deg)` : undefined, transformOrigin: '50% 55%' }}>{shown}</span>
          {sub && <span style={{ fontSize: 14 * scale * 1.15, fontWeight: 700, letterSpacing: 0, color: C.plum2, marginTop: 2 * scale }}>{sub}</span>}
          {strike > 0 && <span style={{ position: 'absolute', left: '-6%', top: '52%', height: 6 * scale, borderRadius: 6 * scale, width: `${112 * strike}%`, background: C.purple }} />}
        </span>
      </div>
    </div>
  );
};
