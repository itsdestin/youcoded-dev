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
  phone: { w: 136, h: 284, lift: 8, bezel: 7, radius: 20 },
  tablet: { w: 360, h: 250, lift: 10, bezel: 11, radius: 18 },
  laptop: { w: 400, h: 250, lift: 18, bezel: 9, radius: 10 },
  monitor: { w: 470, h: 270, lift: 64, bezel: 8, radius: 8 },
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
// dim: 0..1, how far the room's lights are down on this device (the hush): its glass sheen and the glow it throws go
// with it. WHY (round 7 review): with only the screen veiled, sixty glossy rectangles still caught light in the dark
export const Device: React.FC<{ d: Dev; night: number; glow: string; lift?: number; dim?: number; children: React.ReactNode }> = ({ d, night, glow, lift = 0, dim = 0, children }) => {
  const z = SIZE[d.kind];
  const b = z.bezel;
  const W = d.w + b * 2, H = d.h + b * 2;
  const left = d.cx - W / 2, top = d.cy - H / 2;
  // bodies are plum-black aluminium lit from above: a lighter top edge, a darker bottom
  const body = `linear-gradient(180deg, #3A2C46 0%, #241A2E 45%, #1A1222 100%)`;
  const pop = 1 + lift * 0.05;
  return (
    <>
      {/* the light the screen throws down onto the plank's lit top edge, tinted with what the screen shows */}
      <div style={{ position: 'absolute', left: d.cx - W * 0.62, width: W * 1.24, top: d.shelf - 10, height: 34, borderRadius: '50%',
        background: `radial-gradient(closest-side, ${glow}, transparent)`, opacity: 0.6 * night * (1 - 0.85 * dim), mixBlendMode: 'screen' }} />
      {/* contact shadow under the device: WHY darker and taller than before, the reviewer could not see it at all */}
      <div style={{ position: 'absolute', left: d.cx - W * 0.5, width: W * 1.0, top: d.shelf - 14, height: 30, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(8,3,12,0.85), rgba(8,3,12,0.35) 60%, transparent)' }} />
      {/* stands */}
      {d.kind === 'laptop' && <div style={{ position: 'absolute', left: d.cx - W * 0.56, width: W * 1.12, top: d.shelf - z.lift + 2, height: z.lift - 2,
        background: 'linear-gradient(180deg,#5A4A66,#2C2136 70%,#1C1424)', borderRadius: '3px 3px 10px 10px', clipPath: 'polygon(4% 0,96% 0,100% 100%,0 100%)' }} />}
      {(d.kind === 'monitor' || d.kind === 'tv') && <>
        <div style={{ position: 'absolute', left: d.cx - (d.kind === 'tv' ? 30 : 22), width: d.kind === 'tv' ? 60 : 44, top: top + H - 4, height: d.shelf - (top + H) + 2,
          background: 'linear-gradient(90deg,#1E1527,#4A3B56 50%,#1E1527)' }} />
        <div style={{ position: 'absolute', left: d.cx - (d.kind === 'tv' ? 260 : 110), width: d.kind === 'tv' ? 520 : 220, top: d.shelf - 12, height: 12,
          background: 'linear-gradient(180deg,#4A3B56,#1E1527)', borderRadius: '6px 6px 2px 2px' }} />
      </>}
      <div style={{ position: 'absolute', left, top, width: W, height: H, transform: lift ? `translateY(${-lift * 14}px) scale(${pop})` : undefined, transformOrigin: '50% 100%' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: z.radius + b * 0.6, background: body,
          boxShadow: `0 ${18 + lift * 26}px ${40 + lift * 40}px rgba(20,8,32,${0.5 + lift * 0.1}), 0 0 ${50 * night}px ${glow.replace('1)', `${0.12 * night * (1 - 0.9 * dim)})`)}, inset 0 1.5px 0 rgba(255,255,255,0.16), inset 0 -2px 0 rgba(0,0,0,0.35)` }} />
        <div style={{ position: 'absolute', left: b, top: b, width: d.w, height: d.h, borderRadius: z.radius, overflow: 'hidden', background: '#000' }}>
          {children}
          {/* glass: a faint diagonal sheen so screens read as objects, not flat rectangles */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 34%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 100%)', pointerEvents: 'none', opacity: 1 - 0.8 * dim }} />
        </div>
        {/* WHY a small lens in the bezel, not a pill over the glass (round 6 final review: the app's own top bar ran under
            the drawn camera cutout, so the real window did not sit in the phone like a real screen) */}
        {d.kind === 'phone' && <div style={{ position: 'absolute', left: W / 2 - 2.2, top: b / 2 - 2.2, width: 4.4, height: 4.4, borderRadius: 4, background: '#0C0812', boxShadow: '0 0 0 0.6px rgba(255,255,255,0.12)' }} />}
      </div>
    </>
  );
};

/** A screen's light on the wall behind it. WHY (round 6 review: "devices look like floating cards, no light falling
 *  anywhere"): a lit screen in a dark room washes the wall around it in its own colour, which seats it on the wall.
 *  Drawn for every device in one layer before any device, so one screen's wash never tints its neighbour's glass. */
export const WallGlow: React.FC<{ d: Dev; glow: string; k: number }> = ({ d, glow, k }) => {
  const W = d.w * 2.1, H = d.h * 2.0;
  return <div style={{ position: 'absolute', left: d.cx - W / 2, top: d.cy - H / 2, width: W, height: H, borderRadius: '50%', opacity: k,
    background: `radial-gradient(closest-side, ${glow.replace('1)', '0.2)')}, ${glow.replace('1)', '0.06)')} 55%, transparent)` }} />;
};

// WHY a tiled noise image (not a full-size filter): a 256 px fractal-noise tile is rasterised once and repeated, so the
// wall and the planks get a real surface (plaster grain, wood fibre) at no render cost. Inline, no external file.
const noise = (freq: string, oct: number, alpha: number, w = 256, h = 256) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.9  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;
const PLASTER = noise('0.9', 3, 0.09);
const GRAIN = noise('0.012 0.55', 2, 0.14, 512, 128);   // stretched sideways: long wood fibres along the plank
export const PLANK = 34;          // the plank's front face, in world px

/** The back wall of the room: dark plum plaster with a fine grain, recessed panel seams where the unit's back boards
 *  meet, and a broad fall-off from the lit top to the dark floor. WHY (owner on the storybook, and the round 6 review
 *  of this film: "extremely flat, needs depth/texture"): the devices need a surface to sit against, not a void. */
export const BackWall: React.FC<{ night: number }> = ({ night }) => {
  const L = -REACH - 1400, T = -3 * ROW - 1500, R = REACH + 1400, B = 2 * ROW + 1400;
  const seams: number[] = [];
  for (let x = -4200; x <= 4200; x += 1400) seams.push(x);
  return (
    <div style={{ position: 'absolute', left: L, top: T, width: R - L, height: B - T, opacity: night }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#2A1A33 0%,#22152B 30%,#170E1F 62%,#0C0712 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: PLASTER, backgroundSize: '256px 256px', mixBlendMode: 'overlay', opacity: 0.9 }} />
      {/* the back boards' seams: a dark groove with a faint lit edge, so the wall reads as one built unit */}
      {seams.map((x) => <div key={x} style={{ position: 'absolute', left: x - L - 5, top: 0, bottom: 0, width: 10,
        background: 'linear-gradient(90deg, rgba(6,2,10,0) 0%, rgba(6,2,10,0.55) 40%, rgba(6,2,10,0.55) 60%, rgba(255,230,240,0.05) 80%, rgba(255,255,255,0) 100%)' }} />)}
    </div>
  );
};

// a darker grain for the daylit plaster and wood (the night tiles are light specks for a dark surface)
const noiseDark = (freq: string, oct: number, alpha: number, w = 256, h = 256) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.25  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;
const DAY_PLASTER = noiseDark('0.8', 3, 0.5);
const DAY_GRAIN = noiseDark('0.01 0.5', 2, 0.55, 512, 128);

/** The room by day (line 8 on). WHY (round 6 review: the daylight wall was a flat near-white lavender, devices like
 *  stickers on a backdrop, the "extremely flat" look the owner rejected): the same room in morning light. A warm
 *  plaster back wall in the brand poster's own day wash (cream, peach, lilac; never purple-to-blue) with a real grain
 *  and the unit's seams, a warm pool of light where the person's phone is (the daylight opens out of it), falling off
 *  towards the edges, and light-oak shelves. `spread` 0..1 opens it out of (ox, oy) as a soft-edged circle. */
// devs: the devices in view, for the shadows the morning light casts behind them on the wall
export const DayRoom: React.FC<{ spread: number; ox: number; oy: number; devs?: Dev[] }> = ({ spread, ox, oy, devs = [] }) => {
  if (spread <= 0) return null;
  const L = -REACH - 1400, T = -3 * ROW - 1500, R = REACH + 1400, B = 2 * ROW + 1400;
  // WHY a slower, tighter circle (round 2 review: it covered the visible frame in 0.3 s, an exposure flash): with the
  // film's 1.8 s eased spread the light visibly travels out of the phone and reaches the frame's corners at the end
  const rad = spread * 5200;
  const m = spread >= 1 ? undefined : `radial-gradient(circle at ${ox - L}px ${oy - T}px, #000 ${Math.max(0, rad - 1700)}px, transparent ${rad}px)`;
  const seams: number[] = [];
  for (let x = -4200; x <= 4200; x += 1400) seams.push(x);
  return (
    <div style={{ position: 'absolute', left: L, top: T, width: R - L, height: B - T, WebkitMaskImage: m, maskImage: m }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 38% 46% at ${ox - L}px ${oy - T + 200}px, #FFF3E2 0%, #FBE5DA 34%, #F2DDEC 64%, #E3CFE6 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: DAY_PLASTER, backgroundSize: '256px 256px', mixBlendMode: 'multiply', opacity: 0.8 }} />
      {/* WHY one window light from the upper left (round 2 review: the daylit room had no direction, the same flat note the
          owner gave the storybook): warm and bright where it falls, a cooler shade towards the lower right */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(128deg, rgba(255,236,200,0.5) 0%, rgba(255,226,190,0.18) 38%, rgba(140,110,160,0) 58%, rgba(96,76,128,0.2) 100%)', mixBlendMode: 'soft-light' }} />
      {/* each device's shadow cast down and to the right on the wall behind it by that light */}
      {devs.map((d) => <div key={`sh${d.id}`} style={{ position: 'absolute', left: d.cx - d.w / 2 - L + d.w * 0.05, top: d.cy - d.h / 2 - T + d.h * 0.07, width: d.w + 16, height: d.h + 16, borderRadius: 18,
        boxShadow: `${d.w * 0.04}px ${d.h * 0.05}px ${Math.max(24, d.w * 0.09)}px rgba(92,52,72,0.3)` }} />)}
      {/* the morning light itself: a broad warm pool around the phone, and the room darkening towards its corners */}
      <div style={{ position: 'absolute', left: ox - L - 2600, top: oy - T - 1700, width: 5200, height: 3400, background: 'radial-gradient(closest-side, rgba(255,226,180,0.55), rgba(255,214,170,0.18) 55%, transparent)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 52% 62% at ${ox - L}px ${oy - T}px, transparent 40%, rgba(96,58,88,0.22) 100%)` }} />
      {seams.map((x) => <div key={x} style={{ position: 'absolute', left: x - L - 4, top: 0, bottom: 0, width: 8,
        background: 'linear-gradient(90deg, rgba(110,70,90,0) 0%, rgba(110,70,90,0.16) 45%, rgba(110,70,90,0.16) 55%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0) 100%)' }} />)}
      <div style={{ position: 'absolute', left: -L, top: -T }}><Shelves night={0} /></div>
    </div>
  );
};

/** The shelves: thick wooden planks, a lit top edge that catches the screens' light, a darker grained front face and
 *  a deep soft shadow on the wall beneath. By day a pale painted version. */
export const Shelves: React.FC<{ night: number }> = ({ night }) => (
  <>
    {WORLD.shelves.map((s, i) => {
      const segs: [number, number][] = [];
      let x = -REACH - 400;
      for (const [a, b] of s.gaps) { segs.push([x, a]); x = b; }
      segs.push([x, REACH + 400]);
      const n = night > 0.5;
      return segs.map(([a, b], j) => (
        <React.Fragment key={`${i}-${j}`}>
          {/* the shadow the plank throws on the wall under it */}
          <div style={{ position: 'absolute', left: a, width: b - a, top: s.y + PLANK - 4, height: 120,
            background: `linear-gradient(180deg, rgba(${n ? '4,1,8,0.8' : '92,52,60,0.34'}) 0%, rgba(${n ? '4,1,8,0.35' : '92,52,60,0.1'}) 35%, transparent 100%)` }} />
          {/* the front face, with its grain */}
          <div style={{ position: 'absolute', left: a, width: b - a, top: s.y, height: PLANK, borderRadius: 2,
            // by day: light oak, its top edge catching the morning light, darker towards the underside (round 6 review:
            // the daylit shelves were faint grey lines)
            background: n ? 'linear-gradient(180deg,#6A5060 0%,#4A3542 9%,#3A2933 22%,#2E2029 70%,#1E141B 100%)' : 'linear-gradient(180deg,#FFF6EA 0%,#EBD3B6 12%,#DDBE9C 30%,#CDA984 75%,#B48F6E 100%)',
            boxShadow: n ? '0 2px 0 rgba(0,0,0,0.4)' : '0 2px 0 rgba(110,70,60,0.28)' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: n ? GRAIN : DAY_GRAIN, backgroundSize: '512px 128px', mixBlendMode: n ? 'overlay' : 'multiply', opacity: n ? 1 : 0.45 }} />
            {/* the lit front edge: a hairline that catches the light of the screens above it */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: n ? 'rgba(255,225,215,0.22)' : '#fff' }} />
          </div>
        </React.Fragment>
      ));
    })}
  </>
);

// =====================================================================================================
// A price tag on a string, swinging after it drops. Text can change (the price ticks).
// =====================================================================================================
/** `lower`: instead of dropping in 0.35 s, the tag is let down slowly on its string from `lower` until `drop`, when it
 *  lands and starts to swing (their treasure is lowered with ceremony). `len`: the string's length in world px. */
export const PriceTag: React.FC<{ x: number; y: number; t: number; drop: number; text: string; scale?: number; fall?: number; dark?: boolean; strike?: number; lower?: number; len?: number; rise?: number; anchored?: boolean; kicks?: number[]; fallDir?: number }> = ({ x, y, t, drop, text, scale = 1, fall = 0, strike = 0, lower, len: lenIn, rise: riseIn, anchored = false, kicks = [], fallDir = 1 }) => {
  if (t < (lower ?? drop)) return null;
  const dt = Math.max(0, t - drop);
  const enter = lower !== undefined ? Math.min(1, Math.max(0, (t - lower) / (drop - lower))) : Math.min(1, dt / 0.35);
  // WHY a gentle ease-out for the slow lowering: a hand letting a string down slows as it arrives
  // WHY ease-in for an anchored drop: the tag falls freely, accelerating, until its string snaps taut and catches it
  // (a softer ease-out when a `rise` is given: the lowering is seen moving right up to the landing, not parked early)
  const ease = lower !== undefined ? 1 - Math.pow(1 - enter, riseIn !== undefined ? 1.5 : 2) : anchored ? enter * enter : 1 - Math.pow(1 - enter, 3);
  // a damped swing: big first arc, settling within ~2 s, like a real tag on a string
  // WHY the arc scales with the string: a long string swings through a smaller angle, more slowly (a pendulum)
  const long = Math.min(1, (70 * scale) / (lenIn ?? 70 * scale));
  // (anchored: the swing starts the instant the string goes taut, kicked by the catch)
  const sdt = anchored ? dt - 0.35 : dt;
  let swing = t < drop || sdt < 0 ? 0 : 16 * long * Math.exp(-sdt * 2.2) * Math.sin(sdt * 8.5 * Math.sqrt(long));
  // WHY a small tug on each price tick (review: the ticks were hard text swaps while everything else moves with weight)
  let pulse = 0;
  for (const k of kicks) {
    if (t < k) continue;
    const u = t - k;
    swing += 3 * Math.exp(-u * 3) * Math.sin(u * 9);
    pulse = Math.max(pulse, u < 0.1 ? Math.sin(Math.PI * u / 0.1) : 0);
  }
  const fy = fall > 0 ? fall * fall * 1600 : 0;
  const len = lenIn ?? 70 * scale;
  const rise = riseIn ?? (lower !== undefined ? len + 140 * scale : 300);
  // anchored: the string's top stays tied to (x, y) and only the tag drops; the string pays out behind it
  const off = (1 - ease) * rise;
  const strLen = anchored ? Math.max(0, len - off) : len;
  const tagTop = anchored ? len - off : len;
  return (
    // fallDir -1: it swings and drifts the other way as it falls (the tablet's tag falls away from the person's phone)
    <div style={{ position: 'absolute', left: x + (fallDir < 0 ? fall * 90 : 0), top: (anchored ? y : y - off) + fy, width: 0, height: 0, transform: `rotate(${swing + fall * 40 * fallDir}deg)`, transformOrigin: '0 0', opacity: fall > 0.8 ? 1 - (fall - 0.8) * 5 : 1 }}>
      {/* WHY cream twine with a faint dark edge (round 7 review: the dark string vanished against the dark bezel and wall,
          so the tag fell in from nowhere and hung in mid-air): it reads against the room and against a pale screen */}
      {fall === 0 && strLen > 0 && <div style={{ position: 'absolute', left: -1.6 * scale, top: 0, width: 3.2 * scale, height: strLen, borderRadius: 2, background: 'linear-gradient(90deg,#B9A98C,#F1E6D0 45%,#D9CAAE)', boxShadow: '0 0 0 0.6px rgba(30,18,38,0.55)' }} />}
      <div style={{ position: 'absolute', left: -95 * scale, top: tagTop, width: 190 * scale, height: 92 * scale, transform: pulse ? `scale(${1 + 0.04 * pulse})` : undefined, transformOrigin: '50% 0',
        filter: `drop-shadow(${7 * scale}px ${12 * scale}px ${10 * scale}px rgba(20,8,32,0.5))` }}>
        <svg width={190 * scale} height={92 * scale} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
          <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
          <circle cx="95" cy="12" r="5" fill="#2A1F33" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22 * scale, height: 70 * scale, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: DMSANS, fontWeight: 900, fontSize: 38 * scale, letterSpacing: '-0.04em', color: C.plum, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ position: 'relative' }}>{text}
            {/* WHY a strike drawn left to right: "what it costs" is decided by us now; the old price is crossed out before it becomes "free" */}
            {/* (in the tag's own ink since round 2: purple belongs to the headline word alone) */}
            {strike > 0 && <span style={{ position: 'absolute', left: '-6%', top: '50%', height: 4.5 * scale, borderRadius: 4 * scale, width: `${112 * strike}%`, background: C.plum }} />}
          </span>
        </div>
      </div>
    </div>
  );
};
