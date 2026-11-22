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
export const Device: React.FC<{ d: Dev; night: number; glow: string; lift?: number; children: React.ReactNode }> = ({ d, night, glow, lift = 0, children }) => {
  const z = SIZE[d.kind];
  const b = z.bezel;
  const W = d.w + b * 2, H = d.h + b * 2;
  const left = d.cx - W / 2, top = d.cy - H / 2;
  // bodies are plum-black aluminium lit from above: a lighter top edge, a darker bottom
  const body = `linear-gradient(180deg, #3A2C46 0%, #241A2E 45%, #1A1222 100%)`;
  const pop = 1 + lift * 0.05;
  return (
    <>
      {/* the light the screen throws down onto the shelf (only reads at night) */}
      <div style={{ position: 'absolute', left: d.cx - W * 0.7, width: W * 1.4, top: d.shelf - 26, height: 60, borderRadius: '50%',
        background: `radial-gradient(closest-side, ${glow}, transparent)`, opacity: 0.32 * night }} />
      {/* contact shadow under the device */}
      <div style={{ position: 'absolute', left: d.cx - W * 0.46, width: W * 0.92, top: d.shelf - 9, height: 18, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(20,8,32,0.55), transparent)' }} />
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
          boxShadow: `0 ${18 + lift * 26}px ${40 + lift * 40}px rgba(20,8,32,${0.5 + lift * 0.1}), 0 0 ${50 * night}px ${glow.replace('1)', `${0.12 * night})`)}, inset 0 1.5px 0 rgba(255,255,255,0.16), inset 0 -2px 0 rgba(0,0,0,0.35)` }} />
        <div style={{ position: 'absolute', left: b, top: b, width: d.w, height: d.h, borderRadius: z.radius, overflow: 'hidden', background: '#000' }}>
          {children}
          {/* glass: a faint diagonal sheen so screens read as objects, not flat rectangles */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 34%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 100%)', pointerEvents: 'none' }} />
        </div>
        {d.kind === 'phone' && <div style={{ position: 'absolute', left: W / 2 - 14, top: b + 6, width: 28, height: 8, borderRadius: 8, background: '#120C18' }} />}
      </div>
    </>
  );
};

/** The shelves: lilac-lit planks with a highlight on the front edge and a shadow below. */
export const Shelves: React.FC<{ night: number }> = ({ night }) => (
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
          <div style={{ position: 'absolute', left: a, width: b - a, top: s.y + 16, height: 46,
            background: `linear-gradient(180deg, rgba(${night > 0.5 ? '6,2,12,0.55' : '74,38,110,0.16'}), transparent)` }} />
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
export const PriceTag: React.FC<{ x: number; y: number; t: number; drop: number; text: string; scale?: number; fall?: number; dark?: boolean; strike?: number; lower?: number; len?: number }> = ({ x, y, t, drop, text, scale = 1, fall = 0, strike = 0, lower, len: lenIn }) => {
  if (t < (lower ?? drop)) return null;
  const dt = Math.max(0, t - drop);
  const enter = lower !== undefined ? Math.min(1, Math.max(0, (t - lower) / (drop - lower))) : Math.min(1, dt / 0.35);
  // WHY a gentle ease-out for the slow lowering: a hand letting a string down slows as it arrives
  const ease = lower !== undefined ? 1 - Math.pow(1 - enter, 2) : 1 - Math.pow(1 - enter, 3);
  // a damped swing: big first arc, settling within ~2 s, like a real tag on a string
  // WHY the arc scales with the string: a long string swings through a smaller angle, more slowly (a pendulum)
  const long = Math.min(1, (70 * scale) / (lenIn ?? 70 * scale));
  const swing = t < drop ? 0 : 16 * long * Math.exp(-dt * 2.2) * Math.sin(dt * 8.5 * Math.sqrt(long));
  const fy = fall > 0 ? fall * fall * 1600 : 0;
  const len = lenIn ?? 70 * scale;
  const rise = lower !== undefined ? len + 140 * scale : 300;
  return (
    <div style={{ position: 'absolute', left: x, top: y - (1 - ease) * rise + fy, width: 0, height: 0, transform: `rotate(${swing + fall * 40}deg)`, transformOrigin: '0 0', opacity: fall > 0.8 ? 1 - (fall - 0.8) * 5 : 1 }}>
      {fall === 0 && <div style={{ position: 'absolute', left: -1.2 * scale, top: 0, width: 2.4 * scale, height: len, background: '#D9CBE4' }} />}
      <div style={{ position: 'absolute', left: -95 * scale, top: len, width: 190 * scale, height: 92 * scale, filter: `drop-shadow(0 ${10 * scale}px ${14 * scale}px rgba(20,8,32,0.45))` }}>
        <svg width={190 * scale} height={92 * scale} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
          <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
          <circle cx="95" cy="12" r="5" fill="#2A1F33" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22 * scale, height: 70 * scale, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: DMSANS, fontWeight: 900, fontSize: 38 * scale, letterSpacing: '-0.04em', color: C.plum, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ position: 'relative' }}>{text}
            {/* WHY a strike drawn left to right: "what it costs" is decided by us now; the old price is crossed out before it becomes "free" */}
            {strike > 0 && <span style={{ position: 'absolute', left: '-6%', top: '52%', height: 6 * scale, borderRadius: 6 * scale, width: `${112 * strike}%`, background: C.purple }} />}
          </span>
        </div>
      </div>
    </div>
  );
};
