// Round two, take 1: "Once upon a time". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// A storybook that travels from plum night to a light morning: a few crooked keeps over a town where every
// window looks the same. The keeps take three things from the town; a purple light slips out of the
// tallest; window by window the town turns into different youcodeds and takes their colours; the three
// things come home; by morning the town is the brightest thing in the picture and the keeps are ghosts.
//
// WHY every time below is a phrase: cues are read from the narrator's word timings (take1-words.ts), so
// pictures land on the syllable they illustrate, and a re-recorded script re-times the film by itself.
import React from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, useU } from '../kit';
import { E, T, WORDS, captions, cueWord } from './take1-words';
import {
  ALL_WINS, Birds, CX, Cam, Clouds, Defs, FarTowers, FRONT, Foreground, Hills, House, K, Moon, Row, SkyBack, Stars,
  TOWERS, TOWN, Tower, Win, aim, layerTransform, mix, palette, project, towerGeo,
} from './take1-scene';

// ---------- small timing helpers ----------
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0→1 between two times (seconds). */
const r = (t: number, a: number, b: number, e: (x: number) => number = EASE_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const BACK_OUT = Easing.bezier(0.34, 1.56, 0.64, 1);
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);
const seeded = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- the cues ----------
// WHY one table, each with a name and a short phrase: when the owner's new recording arrives, any cue
// whose phrase was reworded fails with its name in the error, and is fixed here in one line. Phrases are
// chosen to survive edits (they avoid "what" / "and" / "the" counts, which an added line would shift).
const Q = {
  corporations: T('corporations', 'handful of *corporations'),
  technology: T('technology', 'with your *technology'),
  haveDictated: T('haveDictated', 'corporations *have dictated'),
  theyDecided: T('theyDecided', '*they decided'),
  whatItWould: T('whatItWould', '*what it would cost'),
  happenedWith: T('happenedWith', '*happened with your personal'),
  andWeAll: T('andWeAll', '*and we all'),
  weAccepted: T('weAccepted', '*we accepted that'),
  aTechnology: T('aTechnology', '*a technology they'),
  butIn: T('butIn', '*but in their'),
  createdSomething: T('createdSomething', 'they *created something'),
  takeComputers: T('takeComputers', 'your *computers could do'),
  takeCost: T('takeCost', 'would *cost'),
  takeData: T('takeData', 'your personal *data'),
  subscribe: T('subscribe', 'subscribe to everything'),
  own: T('own', '*own nothing'),
  nothing: T('nothing', 'own *nothing'),
  nothingEnd: E('nothingEnd', 'own *nothing'),
  however: T('however', 'however'),
  something: T('something', '*something truly wonderful'),
  wonderful: T('wonderful', 'truly *wonderful'),
  happened: T('happened', 'wonderful *happened'),
  happenedEnd: E('happenedEnd', 'wonderful *happened'),
  blinded: T('blinded', 'blinded'),
  hubris: T('hubris', 'hubris'),
  hubrisEnd: E('hubrisEnd', 'hubris'),
  created: T('created', 'corporations *created'),
  newTech: T('newTech', 'kind of *technology'),
  artificial: T('artificial', 'artificial intelligence'),
  intelligenceEnd: E('intelligenceEnd', 'artificial *intelligence'),
  great: T('great', 'a *great treasure'),
  treasure: T('treasure', 'great *treasure'),
  shareholder: T('shareholder', 'shareholder value'),
  valueEnd: E('valueEnd', 'shareholder *value'),
  excitement: T('excitement', 'their *excitement'),
  excitementEnd: E('excitementEnd', 'their *excitement'),
  beyond: T('beyond', 'far *beyond'),
  control: T('control', 'own *control'),
  tool: T('tool', 'a *tool that'),
  make: T('make', 'can *make software'),
  software: T('software', 'make *software'),
  softwareEnd: E('softwareEnd', 'make *software'),
  everScarce: T('everScarce', 'ever-scarce'),
  foundation: T('foundation', 'foundation'),
  monopolies1: T('monopolies1', 'these *monopolies'),
  forAnyone: T('forAnyone', '*for anyone who'),
  anyone: T('anyone', 'for *anyone'),
  who: T('who', 'anyone *who'),
  asks: T('asks', 'who *asks'),
  asksEnd: E('asksEnd', 'who *asks'),
  so: T('so', 'and *so'),
  first: T('first', 'the *first time'),
  firstTime: T('firstTime', 'first *time'),
  very: T('very', '*very long'),
  long1: T('long1', 'very *long'),
  while: T('while', 'long *while'),
  get: T('get', 'we *get to decide'),
  decide: T('decide', 'get to *decide'),
  decideEnd: E('decideEnd', 'get to *decide'),
  release0: T('release0', '*what our computers'),
  land0: T('land0', 'what our *computers'),
  can: T('can', 'computers *can do'),
  do: T('do', 'can *do'),
  release1: T('release1', '*what it costs'),
  land1: T('land1', 'what it *costs'),
  release2: T('release2', 'and *what happens'),
  happens: T('happens', 'what *happens'),
  land2: T('land2', 'with our *data'),
  land2End: E('land2End', 'with our *data'),
  free: T('free', 'free ourselves'),
  ourselves: T('ourselves', 'free *ourselves'),
  monopolies2: T('monopolies2', 'tech *monopolies'),
  pastEnd: E('pastEnd', 'the *past'),
  timeLast: T('timeLast', "it's *time at long"),
  long2: T('long2', 'at *long long'),
  long3: T('long3', 'at long *long'),
  last: T('last', 'long *last'),
  open: T('open', '*open source everything'),
  source: T('source', 'open *source everything'),
  everything: T('everything', 'open source *everything'),
  everythingEnd: E('everythingEnd', 'open source *everything'),
};
export const END_CARD = Q.everythingEnd + 0.35;      // the end card arrives just after the last word
const G1 = 1.1;                                      // how much taller the keeps grow on "hubris"

// ---------- night to morning ----------
// WHY: the owner's direction for the second pass. Night until the turn; the turn lifts the sky; pre-dawn
// by "we get to decide"; a light morning by "open source everything", so the light end card is inevitable.
const DAWN_KEYS: [number, number][] = [
  [0, 0], [Q.something, 0], [Q.happenedEnd + 0.9, 0.3], [Q.beyond, 0.32], [Q.asksEnd, 0.46],
  [Q.decideEnd, 0.7], [Q.pastEnd, 0.86], [Q.everything, 1], [99, 1],
];
const dawnAt = (t: number) => {
  let i = 0; while (i < DAWN_KEYS.length - 2 && t >= DAWN_KEYS[i + 1][0]) i++;
  const [t0, a] = DAWN_KEYS[i], [t1, b] = DAWN_KEYS[i + 1];
  return lerp(a, b, SMOOTH(Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))));
};

// ---------- who lives where ----------
const nearestFront = (x: number, skip: number[] = []) =>
  FRONT.houses.filter((h) => !skip.includes(h.id) && FRONT.wins.some((w) => w.house === h.id))
    .reduce((a, b) => (Math.abs(b.x + b.w / 2 - x) < Math.abs(a.x + a.w / 2 - x) ? b : a));
// the window a house hands its thing out of: its upper, most central one
const mainWin = (house: number) => {
  const hc = FRONT.houses[house].x + FRONT.houses[house].w / 2;
  return FRONT.wins.filter((w) => w.house === house).sort((a, b) => a.y - b.y || Math.abs(a.x + a.w / 2 - hc) - Math.abs(b.x + b.w / 2 - hc))[0];
};

// The three things the keeps take, each by the keep whose arm hangs over that house.
type Item = { kind: 'laptop' | 'tag' | 'letter'; tower: number; take: number; release: number; land: number; house: number; win: Win };
const ITEM_DEFS: Omit<Item, 'house' | 'win'>[] = [
  { kind: 'laptop', tower: 0, take: Q.takeComputers, release: Q.release0, land: Q.land0 },
  { kind: 'tag', tower: 1, take: Q.takeCost, release: Q.release1, land: Q.land1 },
  { kind: 'letter', tower: 2, take: Q.takeData, release: Q.release2, land: Q.land2 },
];
const ITEMS: Item[] = [];
ITEM_DEFS.forEach((d) => {
  const tip = towerGeo(TOWERS[d.tower], 1).armTip;
  const h = nearestFront(tip.x, ITEMS.map((i) => i.house));
  ITEMS.push({ ...d, house: h.id, win: mainWin(h.id) });
});
// Where the light lands: the first youcoded in town, near the middle, not one of the item houses.
const O_HOUSE = nearestFront(1150, ITEMS.map((i) => i.house));
const O = mainWin(O_HOUSE.id);

// ---------- when each window turns ----------
// WHY a schedule built from words: "window by window" should feel like the narration is lighting them.
// Windows nearest the first one go first (a ripple outwards); item houses wait for their thing to land.
const FLIP = new Map<number, number>();
(() => {
  FLIP.set(O.id, Q.software + 0.04);
  ITEMS.forEach((it) => FRONT.wins.filter((w) => w.house === it.house).forEach((w, j) => FLIP.set(w.id, it.land + 0.06 + j * 0.08)));
  const ox = O.x + O.w / 2;
  const queue = ALL_WINS.filter((w) => !FLIP.has(w.id))
    .map((w) => ({ w, d: Math.abs(w.x + w.w / 2 - ox) * (w.row === 'back' ? 1.2 : w.row === 'mid' ? 1.1 : 1) + seeded(w.id) * 90 }))
    .sort((a, b) => a.d - b.d).map((x) => x.w);
  const beats: [number, number][] = [
    [Q.everScarce, 1], [Q.foundation, 1], [Q.monopolies1, 2],
    [Q.anyone, 3], [Q.who, 3], [Q.asks, 4],
    [Q.so, 2], [Q.first, 3], [Q.firstTime, 3], [Q.very, 3], [Q.long1, 3], [Q.while, 4], [Q.get, 4], [Q.decide, 6],
    [Q.can, 3], [Q.do, 3], [Q.land1 - 0.3, 3], [Q.happens, 4], [Q.free, 5], [Q.ourselves, 4],
  ];
  let q = 0;
  beats.forEach(([at, n]) => { for (let j = 0; j < n && q < queue.length; j++) FLIP.set(queue[q++].id, at + j * 0.07); });
  // the finale: everything left, in three swells on "long, long last", each sweeping left to right
  const rest = queue.slice(q);
  const swells = [Q.long2, Q.long3, Q.last];
  rest.forEach((w, i) => {
    const xs = Math.max(0, Math.min(1, (w.x + 300) / 2500));
    FLIP.set(w.id, swells[i % 3] + xs * 0.55 + seeded(w.id + 9) * 0.08);
  });
})();
const HOUSE_FLIP = new Map<House, number>();
(['back', 'mid', 'front'] as const).forEach((row) => TOWN[row].houses.forEach((h) => {
  HOUSE_FLIP.set(h, Math.min(...TOWN[row].wins.filter((w) => w.house === h.id).map((w) => FLIP.get(w.id) ?? 999)));
}));

// ---------- the camera ----------
// WHY keys at words: each move starts or settles on the phrase it serves. Between keys the camera eases;
// a slow breathing drift on top keeps any held shot from freezing.
const g1 = towerGeo(TOWERS[1], 1), g2 = towerGeo(TOWERS[1], G1);
// WHY one medium frame for the taking and the returning: all three arms and all three houses fit, and at
// this zoom each thing is about a tenth of the frame tall, unmistakable on a phone.
const ITEM_FRAME: Cam = { cx: 1005, cy: 625, z: 1.3 };
// WHY a close-up on a cluster of new windows: the apps must read as different little apps in different looks.
const APPS_CLOSE = aim(1, O.x + O.w / 2 + 150, O.y - 30, 2.4);
// The three things, each in its own close shot: low on the window as the hook comes down and the thing
// pops out, then tilting up after it toward the keep's arm. WHY: the reviewer named "the three things
// taken" the film's strongest idea; at this zoom each thing is about a sixth of the frame tall.
const itemLow = (i: number): Cam => { const w = ITEMS[i].win; return aim(1, w.x + w.w / 2, w.y - 50, 2.15); };
const itemUp = (i: number): Cam => {
  const w = ITEMS[i].win, tip = towerGeo(TOWERS[ITEMS[i].tower], 1).armTip;
  return aim(0.8, (w.x + w.w / 2 + tip.x) / 2, (w.y + tip.y) / 2 + 30, 1.55);
};
const LANTERN1 = aim(K.towers, 1010, g1.lantern.y + 40, 1.6);
// [time, camera, cut?]. A key marked cut is a hard cut: the shot before holds its last framing and the
// picture jumps on that word. WHY cuts in the opening: every clause of the first 20 s gets its own
// framing (towers / identical windows / each thing taken / the keeps / the strings / own nothing),
// where one slow push left the first third looking the same at 0, 4, 8, 12, 16 and 20 s.
type Key = [number, Cam, boolean?];
const CAM_KEYS: Key[] = [
  // the keeps loom, their windows igniting on "corporations"
  [0, aim(K.towers, 985, 300, 1.62), true],
  [Q.haveDictated - 0.01, aim(K.towers, 1000, 335, 1.48)],
  // a lateral glide over a town of identical windows, which switch on together on "technology"
  [Q.haveDictated, { cx: 880, cy: 790, z: 1.65 }, true],
  [Q.theyDecided - 0.01, { cx: 1040, cy: 770, z: 1.75 }],
  [Q.theyDecided, itemLow(0), true],
  [ITEMS[0].take + 0.3, itemLow(0)],
  [Q.whatItWould - 0.01, itemUp(0)],
  [Q.whatItWould, itemLow(1), true],
  [ITEMS[1].take + 0.3, itemLow(1)],
  [Q.happenedWith - 0.01, itemUp(1)],
  [Q.happenedWith, itemLow(2), true],
  [ITEMS[2].take + 0.3, itemLow(2)],
  [Q.andWeAll - 0.01, itemUp(2)],
  // the keeps, now holding what they took
  [Q.andWeAll, aim(K.towers, 1010, 380, 1.22), true],
  [Q.weAccepted - 0.01, aim(K.towers, 1010, 400, 1.12)],
  // from the rooftops: the strings grow down to every house
  [Q.weAccepted, { cx: 960, cy: 615, z: 1.28 }, true],
  [Q.own - 0.13, { cx: 990, cy: 595, z: 1.2 }],
  // close on the identical windows as they dim on "nothing"
  [Q.own - 0.12, aim(1, 930, 905, 2.35), true],
  [Q.however - 0.01, aim(1, 960, 905, 2.45)],
  // the hush: the whole night town, then up to the lantern
  [Q.however, { cx: 980, cy: 520, z: 1.06 }, true],
  [Q.something - 0.05, LANTERN1],
  // the wonder: pull back wide so the colour can be seen arriving over the whole world
  [Q.happenedEnd + 0.8, { cx: 980, cy: 520, z: 1.05 }],
  [Q.hubrisEnd + 0.3, aim(K.towers, 1010, 330, 1.12)],
  [Q.aTechnology - 0.01, aim(K.towers, 1010, g2.lantern.y + 20, 2.05)],
  // cutaway: the town below, still dim under its strings, while the keeps dream of treasure
  [Q.aTechnology, { cx: 840, cy: 770, z: 1.7 }, true],
  [Q.great - 0.26, { cx: 1120, cy: 755, z: 1.78 }],
  [Q.great - 0.25, aim(K.towers, g2.chest.x - 10, g2.chest.y - 30, 2.8), true],
  [Q.butIn - 0.01, aim(K.towers, g2.chest.x - 10, g2.chest.y - 46, 2.95)],
  // the keeps twinkling in their excitement, then in to the lantern for the escape
  [Q.butIn, aim(K.towers, 1000, 390, 1.15), true],
  [Q.createdSomething, aim(K.towers, 1000, 370, 1.2)],
  [Q.beyond, aim(K.towers, 1000, g2.lantern.y + 30, 1.85)],
  // WHY a wide midpoint: following the falling light straight down at full zoom was a whip
  [(Q.control + Q.tool) / 2, { cx: 1000, cy: 330, z: 1.15 }],
  [Q.tool + 0.1, aim(1, O.x + O.w / 2, O.y - 110, 1.7)],
  [Q.softwareEnd + 0.4, aim(1, O.x + O.w / 2, O.y - 90, 1.85)],
  [Q.asksEnd + 0.2, aim(1, O.x + O.w / 2 + 40, O.y - 150, 1.45)],
  [Q.first + 0.3, APPS_CLOSE],
  [Q.long1, { ...APPS_CLOSE, cx: APPS_CLOSE.cx + 50, z: APPS_CLOSE.z + 0.1 }],
  // WHY a long pull-back (about 2.5 s): from this close, a faster move read as a jump in the motion check
  [Q.release0 + 0.1, ITEM_FRAME],
  [Q.land2End + 0.4, { ...ITEM_FRAME, cx: 1020 }],
  // the finale frames the town large: it is the brightest, most colourful thing on screen; the keeps are ghosts above
  [Q.pastEnd, { cx: 960, cy: 680, z: 1.3 }],
  [END_CARD, { cx: 960, cy: 740, z: 1.42 }],
  [80, { cx: 960, cy: 750, z: 1.45 }],
];
export const camAt = (t: number): Cam => {
  let i = 0;
  while (i < CAM_KEYS.length - 2 && t >= CAM_KEYS[i + 1][0]) i++;
  const [t0, a] = CAM_KEYS[i], [t1, b, cut] = CAM_KEYS[i + 1];
  const p = cut ? 0 : SMOOTH(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
  return {
    cx: lerp(a.cx, b.cx, p) + Math.sin(t * 0.21) * 7,
    cy: lerp(a.cy, b.cy, p) + Math.sin(t * 0.15 + 1) * 5,
    z: lerp(a.z, b.z, p) * (1 + 0.006 * Math.sin(t * 0.18)),
  };
};

// ---------- the drawings that move ----------
/** The purple light: a small flame with a soft halo; `squash` while it slips between bars. */
const Light: React.FC<{ x: number; y: number; s: number; t: number; squash?: number; halo?: number }> = ({ x, y, s, t, squash = 0, halo = 1 }) => {
  const fl = 1 + 0.06 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 13.7);   // a candle's flicker, never a strobe
  return (
    <g transform={`translate(${x} ${y}) scale(${s * (1 - squash * 0.6)} ${s * fl * (1 + squash * 0.35)})`}>
      <circle r={70} fill="url(#t1halo)" opacity={halo} />
      <path d="M0 -20 C9 -8 12 0 12 6 C12 14 6 19 0 19 C-6 19 -12 14 -12 6 C-12 0 -9 -8 0 -20 Z" fill="#C387D3" />
      <path d="M0 -12 C5 -4 7 2 7 7 C7 12 4 15 0 15 C-4 15 -7 12 -7 7 C-7 2 -5 -4 0 -12 Z" fill="#F6EEFB" />
    </g>
  );
};

/** The three things, drawn as paper cut-outs with a plum ink line. `size` is in screen pixels. */
const Thing: React.FC<{ kind: Item['kind']; x: number; y: number; size: number; rot: number; o: number }> = ({ kind, x, y, size, rot, o }) => {
  const s = size / 60;
  const ink = { stroke: '#21152C', strokeWidth: 2, strokeLinejoin: 'round' as const };
  let art: React.ReactNode;
  if (kind === 'laptop') art = (<g>
    <rect x={-24} y={-30} width={48} height={32} rx={4} fill="#EFE3F6" {...ink} />
    <rect x={-19} y={-25} width={38} height={22} rx={2} fill="#9750AA" />
    <rect x={-13} y={-20} width={16} height={4} rx={2} fill="#F7F0FB" opacity={0.9} />
    <rect x={-13} y={-13} width={24} height={3} rx={1.5} fill="#F7F0FB" opacity={0.55} />
    <path d="M-30 2 L30 2 L26 9 L-26 9 Z" fill="#C9B0DB" {...ink} />
  </g>);
  else if (kind === 'tag') art = (<g transform="rotate(-12)">
    {/* WHY no currency sign: a plain price tag with its string reads as "cost" anywhere in the world */}
    <path d="M-26 -16 L14 -16 L28 0 L14 16 L-26 16 Q-30 16 -30 12 L-30 -12 Q-30 -16 -26 -16 Z" fill="#EFE3F6" {...ink} />
    <circle cx={14} cy={0} r={4} fill="#F7F0FB" {...ink} strokeWidth={1.6} />
    <path d="M18 0 C30 -6 34 -18 26 -26" fill="none" stroke="#21152C" strokeWidth={1.6} />
    <rect x={-22} y={-6} width={22} height={4} rx={2} fill="#9750AA" />
    <rect x={-22} y={3} width={14} height={4} rx={2} fill="#C9B0DB" />
  </g>);
  else art = (<g>
    <rect x={-28} y={-19} width={56} height={38} rx={3} fill="#EFE3F6" {...ink} />
    <path d="M-28 -17 L0 4 L28 -17" fill="none" stroke="#C9B0DB" strokeWidth={3} strokeLinejoin="round" />
    <circle cx={0} cy={4} r={7} fill="#9750AA" />
    <path d="M-3 3 L-1 6 L3 1" fill="none" stroke="#F7F0FB" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </g>);
  return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={o} filter="url(#lift)">{art}</g>;
};

/** A hook on a rope, hanging from a keep's arm. */
const Hook: React.FC<{ ax: number; ay: number; hx: number; hy: number; s: number; o: number; c: string }> = ({ ax, ay, hx, hy, s, o, c }) => (
  <g opacity={o} stroke={c} fill="none" strokeLinecap="round">
    <line x1={ax} y1={ay} x2={hx} y2={hy} strokeWidth={1.8} strokeOpacity={0.9} />
    {/* a weighted block and a curled hook: it should read as a crane's hook even when small */}
    <rect x={hx - 5 * s} y={hy - 2 * s} width={10 * s} height={9 * s} rx={2 * s} fill={c} stroke="none" />
    <path d={`M${hx} ${hy + 7 * s} l0 ${10 * s} a${7 * s} ${7 * s} 0 1 1 ${-13 * s} ${1 * s}`} strokeWidth={3 * Math.max(0.8, s)} />
  </g>
);

// ---------- type ----------
// WHY one place for every word on screen, in both versions: the reviewer saw the headlines jump around the
// frame and sit on busy tower shapes, and the boxed captions read as auto-subtitles. All type now sits in
// one spot (lower left, on the 8% margins, fixed width), set in the scene in DM Sans, over a soft scrim.
const SPOT = { left: '8%', bottom: '11%', width: '62%' } as const;
const holdOut = (at: number, words: number, wanted: number) => Math.max(wanted, at + 1.2 + 0.25 * words);

type HWord = { text: string; at: number; accent?: boolean };
/** A headline whose words arrive exactly as they are spoken (DM Sans 900, lowercase, one purple word).
 *  `day` switches it to the light palette (plum) once morning has come. */
const Headline: React.FC<{ words: HWord[]; out: number; t: number; day: boolean }> = ({ words, out, t, day }) => {
  const u = useU();
  if (t < words[0].at - 0.1 || t > out + 0.05) return null;
  const exit = r(t, out - 0.4, out, EASE_IN);
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', ...SPOT, opacity: 1 - exit, transform: `translateY(${-exit * 0.6 * u}px)`,
        fontFamily: DMSANS, fontWeight: 900, fontSize: 5 * u, letterSpacing: '-0.05em', lineHeight: 1.04,
        color: day ? C.plum : C.nightText,
        textShadow: day ? `0 0 ${1.6 * u}px rgba(251,246,253,0.9)` : `0 ${0.2 * u}px ${2 * u}px rgba(10,4,16,0.8)`,
      }}>
        {words.map((w, i) => {
          const p = r(t, w.at - 0.06, w.at + 0.42);
          return (
            <span key={i} style={{
              display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 0.3}em)`,
              filter: p < 1 ? `blur(${(1 - p) * 0.1}em)` : undefined, color: w.accent ? (day ? C.purple : C.purpleNight) : undefined,
            }}>{w.text}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const FINAL_OUT = END_CARD - 0.35;                   // gone before the dip to the end card
const FINAL: HWord[] = [{ text: 'open', at: Q.open }, { text: 'source', at: Q.source }, { text: 'everything.', at: Q.everything, accent: true }];
const HEADLINES: { words: HWord[]; out: number }[] = [
  { words: [{ text: 'own', at: Q.own }, { text: 'nothing.', at: Q.nothing, accent: true }], out: Q.however - 0.1 },
  { words: [{ text: 'something', at: Q.something }, { text: 'wonderful', at: Q.wonderful, accent: true }, { text: 'happened.', at: Q.happened }], out: Q.blinded + 0.5 },
  { words: [{ text: 'for', at: Q.forAnyone }, { text: 'anyone', at: Q.anyone, accent: true }, { text: 'who', at: Q.who }, { text: 'asks.', at: Q.asks }], out: Q.so - 0.05 },
].map((h) => ({ ...h, out: holdOut(h.words[0].at, h.words.length, h.out) }));
// the captions stop where the closing headline begins ("open source everything.")
const CAPS = captions(WORDS.indexOf(cueWord('open', '*open source everything')), Q.open - 0.2);

/** A soft scrim behind the type spot: plum at night, lavender by morning. Wide and feathered, so it reads
 *  as the corner of the page dimming, never as a box. */
const Scrim: React.FC<{ o: number; dawn: number }> = ({ o, dawn }) => (o <= 0 ? null : (
  <AbsoluteFill style={{
    opacity: o, pointerEvents: 'none',
    background: `radial-gradient(ellipse 72% 52% at 22% 100%, ${mix('#0E0616', '#FAF5FD', dawn).replace('rgb', 'rgba').replace(')', `,${0.62 + 0.16 * dawn})`)} 0%, ${mix('#0E0616', '#FAF5FD', dawn).replace('rgb', 'rgba').replace(')', ',0.32)')} 48%, transparent 78%)`,
  }} />
));

/** The muted version's captions: the whole script, one sentence at a time, in the type spot. Each caption
 *  fades out over four frames and the next fades in over six, on a scrim that never moves, so the change
 *  reads as a soft breath, never a flicker (a cross-dissolve smeared one sentence over the other).
 *  Bottom-anchored so a one-line caption sits where a two-line one ends. */
const Captions: React.FC<{ t: number }> = ({ t }) => {
  const u = useU();
  return (
    <AbsoluteFill>
      {CAPS.map((c, i) => {
        const o = Math.min(r(t, c.at - 0.01, c.at + 0.2), 1 - r(t, c.out - 0.14, c.out - 0.01, EASE_IN));
        if (o <= 0) return null;
        const day = dawnAt(c.at) > 0.5;
        return (
          <div key={i} style={{
            position: 'absolute', ...SPOT, opacity: o, transform: `translateY(${(1 - o) * 0.4 * u}px)`,
            fontFamily: DMSANS, fontWeight: 700, fontSize: 2.75 * u, lineHeight: 1.24, letterSpacing: '-0.02em',
            color: day ? C.plum : C.nightText, textWrap: 'balance',
            textShadow: day ? `0 0 ${1.2 * u}px rgba(251,246,253,0.95)` : `0 ${0.15 * u}px ${1.4 * u}px rgba(10,4,16,0.85)`,
          }}>{c.text}</div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Film grain, a paper texture and a gentle vignette, on top of everything: the paper and the lens. */
const Grain: React.FC<{ frame: number; dawn: number }> = ({ frame, dawn }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 52%, transparent 58%, rgba(30,8,44,0.5) 100%)', opacity: 1 - 0.7 * dawn }} />
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.1 }}>
      {/* paper fibres: long thin noise, still, so the picture looks printed on paper */}
      <filter id="t1paper"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.35" numOctaves="3" seed="4" /><feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.6  0 0 0 1.2 -0.3" /></filter>
      <rect width="100%" height="100%" filter="url(#t1paper)" />
    </svg>
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.14 }}>
      <filter id="t1grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(frame / 2) % 50} /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#t1grain)" />
    </svg>
  </AbsoluteFill>
);

// ---------- the film ----------
export const Take1: React.FC<{ narrator?: boolean }> = ({ narrator = true }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);
  const dawn = dawnAt(t);
  const pal = palette(dawn);

  // --- the keeps ---
  const growth = 1 + (G1 - 1) * spring({ frame: frame - Math.round(Q.hubris * FPS), fps: FPS, config: { damping: 11, mass: 0.9, stiffness: 90 } });
  const flare = Math.min(r(t, Q.blinded, Q.blinded + 0.5), 1 - r(t, Q.hubrisEnd, Q.hubrisEnd + 1.2, EASE_IN_OUT));
  const excited = Math.min(r(t, Q.excitement, Q.excitement + 0.3), 1 - r(t, Q.excitementEnd + 0.4, Q.beyond, EASE_IN_OUT));
  const towerLit = (v: number, i: number) => {
    let L = 0.45 + 0.55 * r(t, Q.corporations + v * 0.8, Q.corporations + v * 0.8 + 0.35);
    L += 0.65 * flare * (0.7 + 0.3 * seeded(i * 7));
    L *= 1 - 0.45 * excited * (0.5 + 0.5 * Math.sin(t * 11 + i * 2.3));
    const off = Q.monopolies2 + (1 - v) * 1.2;
    L *= 1 - 0.95 * r(t, off, off + 0.3);
    return L;
  };
  const recede = r(t, Q.monopolies2, Q.pastEnd + 0.8, EASE_IN_OUT);

  // --- the light, and the colour it brings ---
  const kindle = r(t, Q.something, Q.wonderful + 0.25, EASE_OUT);
  const brightAI = 1 + 0.25 * r(t, Q.artificial, Q.intelligenceEnd);
  // WHY the field grows with the dawn: the brand's colour field is what the morning sky becomes
  const field = 0.12 + 0.88 * Math.max(0, (dawn - 0.25) / 0.75);
  const hush = Math.min(r(t, Q.however, Q.however + 0.6, EASE_IN_OUT), 1 - r(t, Q.something, Q.wonderful, EASE_IN_OUT));
  const G = towerGeo(TOWERS[1], growth);
  const escapeAt = Q.beyond, outAt = Q.control, landAt = Q.software;

  // --- the town's windows ---
  const winState = (w: Win) => {
    const xs = Math.max(0, (w.x + 300) / 2500) * 0.5;
    const on = r(t, Q.technology + xs, Q.technology + xs + 0.25);
    const dim = r(t, Q.nothing + seeded(w.id) * 0.7, Q.nothing + seeded(w.id) * 0.7 + 0.5, EASE_IN_OUT);
    const b = 0.1 + 0.75 * on - 0.5 * dim;
    const ft = FLIP.get(w.id) ?? 999;
    return { b, flip: Math.max(0, Math.min(1, (t - ft) / 0.42)) };
  };
  const houseLit = (h: House) => { const ft = HOUSE_FLIP.get(h) ?? 999; return r(t, ft, ft + 1.2, EASE_IN_OUT); };
  const townGlow = ALL_WINS.reduce((n, w) => n + (t >= (FLIP.get(w.id) ?? 999) ? 1 : 0), 0) / ALL_WINS.length;

  // --- strings from every house to a keep ("subscribe to everything") ---
  const strings: React.ReactNode[] = [];
  const stringC = mix('#C2AED4', '#7E6098', dawn);
  [...TOWN.back.houses, ...TOWN.mid.houses, ...TOWN.front.houses].forEach((h, i) => {
    if (h.x < -500 || h.x > 2350 || (h.row !== 'front' && i % 2)) return;
    const tw = TOWERS.reduce((a, b) => (Math.abs(b.x - h.peak.x) < Math.abs(a.x - h.peak.x) ? b : a));
    const geo = towerGeo(tw, growth);
    const ay = geo.top + (geo.base - geo.top) * (0.25 + 0.4 * seeded(i + 3));
    const side = h.peak.x < geo.cx(ay) ? -1 : 1;
    const A = project(cam, K.towers, geo.cx(ay) + side * geo.half(ay) * 0.9, ay + recede * 30);
    const B = project(cam, K[h.row], h.peak.x, h.peak.y);
    const d0 = Q.subscribe + Math.min(1, Math.abs(h.peak.x - 960) / 1500) * 1.2;
    const grow = r(t, d0, d0 + 0.5, EASE_IN_OUT);
    if (grow <= 0) return;
    const snapT = Q.free + seeded(i) * 0.45;
    const snap = r(t, snapT, snapT + 0.7, EASE_OUT);
    if (snap >= 1) return;
    // the line grows down from the keep; after "free" its lower end whips back up and fades
    const reach = grow * (1 - snap);
    const bx = lerp(A.x, B.x, reach), by = lerp(A.y, B.y, reach);
    const mx = (A.x + bx) / 2 + snap * 30 * side, my = (A.y + by) / 2 + 40 * (1 - snap) + snap * 60 * side;
    strings.push(<path key={i} d={`M${A.x} ${A.y} Q${mx} ${my} ${bx} ${by}`} fill="none" stroke={stringC} strokeWidth={1.7} strokeOpacity={0.58 * (1 - snap)} />);
  });

  // --- hooks and the three things ---
  const hooks: React.ReactNode[] = [];
  const things: React.ReactNode[] = [];
  const spins = [0, 0, 0];
  const hookC = mix('#C9B6DA', '#5F4676', dawn);
  ITEMS.forEach((it, i) => {
    const tw = TOWERS[it.tower];
    const geo = towerGeo(tw, growth);
    const A = project(cam, K.towers, geo.armTip.x, geo.armTip.y + 12 + recede * 30);
    const W = project(cam, K.front, it.win.x + it.win.w / 2, it.win.y + it.win.h / 2);
    const sT = project(cam, K.towers, geo.cx(geo.armY), geo.armTip.y + 40);
    const s = lerp(A.s, W.s, 0.5);
    const base = 92;                                   // WHY 92: about a tenth of the frame tall in the item shots
    const size = base * s;
    const hang = { x: A.x, y: A.y + 80 * A.s };
    const N = it.take;
    let hook = { x: A.x, y: A.y + 14 * A.s };
    let thing: { x: number; y: number; sz: number; rot: number; o: number } | null = null;
    if (t < it.release) {
      const down = r(t, N - 1.0, N - 0.1, EASE_IN_OUT);
      const pop = r(t, N, N + 0.4, BACK_OUT);
      const lift = r(t, N + 0.35, N + 1.5, EASE_IN_OUT);
      const stow = r(t, N + 1.5, N + 1.95, EASE_IN);
      const out = r(t, it.release - 0.7, it.release - 0.2, EASE_OUT);
      if (t < N + 1.5) {
        const startY = W.y - 30 * W.s * pop;
        const px = lerp(W.x, hang.x, lift) + Math.sin(lift * Math.PI) * 26 * (i - 1);
        const py = lerp(startY, hang.y, lift);
        hook = lift > 0 || pop > 0 ? { x: px, y: py - size * 0.45 } : { x: lerp(A.x, W.x, down), y: lerp(A.y + 14 * A.s, W.y - size * 0.35, down) };
        if (pop > 0) thing = { x: px, y: py, sz: size * pop * lerp(1, A.s / s, lift), rot: Math.sin(t * 3 + i) * 6 * lift, o: 1 };
      } else if (t < it.release - 0.7) {
        // stowed: slides into the keep and is gone; the empty hook stays up there, waiting
        thing = stow < 1 ? { x: lerp(hang.x, sT.x, stow), y: hang.y, sz: base * A.s * (1 - 0.5 * stow), rot: 0, o: 1 - stow } : null;
        hook = { x: hang.x, y: lerp(hang.y - base * A.s * 0.45, A.y + 14 * A.s, stow) };
      } else {
        thing = { x: lerp(sT.x, hang.x, out), y: hang.y, sz: base * A.s, rot: 0, o: out };
        hook = { x: hang.x, y: lerp(A.y + 14 * A.s, hang.y - base * A.s * 0.45, out) };
      }
    } else {
      // released: the rope lets go and the thing drifts home, swaying like a leaf, landing on its word
      const p = r(t, it.release, it.land, EASE_IN_OUT);
      const into = r(t, it.land, it.land + 0.22, EASE_IN);
      const sway = Math.sin(p * Math.PI * 2) * 34 * (1 - p) * s;
      thing = into < 1 ? { x: lerp(hang.x, W.x, p) + sway, y: lerp(hang.y, W.y, p), sz: lerp(base * A.s, base * W.s * 0.85, p) * (1 - 0.7 * into), rot: sway * 0.5, o: 1 - into } : null;
      const back = r(t, it.release, it.release + 0.5, EASE_OUT);
      hook = { x: hang.x, y: lerp(hang.y - 30 * A.s, A.y + 14 * A.s, back) };
    }
    spins[it.tower] = (hook.y - A.y) * 2.2;            // the pulley turns as the rope pays out
    hooks.push(<Hook key={i} ax={A.x} ay={A.y} hx={hook.x} hy={hook.y} s={A.s * 1.2} o={1 - recede} c={hookC} />);
    if (thing) things.push(<Thing key={i} kind={it.kind} x={thing.x} y={thing.y} size={thing.sz} rot={thing.rot} o={thing.o} />);
  });

  // --- the light's journey ---
  const L0 = G.lantern;
  let lightInTower: React.ReactNode = null;
  let lightFree: React.ReactNode = null;
  if (t >= Q.something - 0.1 && t < escapeAt) {
    lightInTower = <Light x={L0.x} y={L0.y + 10} s={(0.2 + 1.3 * kindle) * (0.9 + 0.1 * brightAI)} t={t} halo={kindle * brightAI} />;
  } else if (t >= escapeAt && t < landAt + 0.4) {
    const exitPt = { x: L0.x - L0.w / 2 - 30, y: L0.y + 20 };
    const inLantern = project(cam, K.towers, L0.x, L0.y + 10);
    const outside = project(cam, K.towers, exitPt.x, exitPt.y);
    const W = project(cam, K.front, O.x + O.w / 2, O.y + O.h / 2);
    // free: it drifts down in a lazy S, hovers on "a tool", then darts into the window on "software"
    const path = (tj: number) => {
      const p1 = r(tj, outAt, Q.tool, SMOOTH) * 0.86;
      const p2 = r(tj, Q.make, landAt, EASE_IN);
      const p = p1 + 0.14 * p2;
      return {
        x: lerp(outside.x, W.x, p) + Math.sin(p * Math.PI * 2.2) * (1 - p) * 120,
        y: lerp(outside.y, W.y - 40 * W.s * (1 - p2), p) + Math.sin(tj * 3.2) * 6 * (1 - p2) * r(tj, Q.tool - 0.3, Q.tool),
        s: lerp(outside.s * 1.5, W.s * 0.9, p),
      };
    };
    let x: number, y: number, s: number, squash = 0;
    if (t < outAt) {
      // squeezing sideways between two bars
      const p = r(t, escapeAt, outAt, EASE_IN_OUT);
      squash = Math.sin(p * Math.PI);
      x = lerp(inLantern.x, outside.x, p); y = lerp(inLantern.y, outside.y, p); s = inLantern.s * 1.5;
    } else ({ x, y, s } = path(t));
    const gone = r(t, landAt - 0.02, landAt + 0.14, EASE_IN);   // WHY quick: the light becomes the window, it must not linger on top of it
    // the trail: the same path over the last half second, drawn as one tapering ribbon (not dots, which
    // would read as particles: the brand bans those)
    let trail: React.ReactNode = null;
    if (t > outAt + 0.04) {
      const pts: { x: number; y: number }[] = [];
      for (let j = 0; j <= 18; j++) { const tj = t - j * 0.03; if (tj < outAt) break; pts.push(path(tj)); }
      if (pts.length > 2) {
        const left: string[] = [], right: string[] = [];
        pts.forEach((pt, j) => {
          const n = pts[Math.min(pts.length - 1, j + 1)], m = pts[Math.max(0, j - 1)];
          const dx = n.x - m.x, dy = n.y - m.y, len = Math.hypot(dx, dy) || 1;
          const wdt = 5.5 * s * (1 - j / pts.length);
          left.push(`${pt.x - (dy / len) * wdt} ${pt.y + (dx / len) * wdt}`);
          right.push(`${pt.x + (dy / len) * wdt} ${pt.y - (dx / len) * wdt}`);
        });
        trail = <path d={`M${left.join(' L')} L${right.reverse().join(' L')} Z`} fill="url(#t1trail)" opacity={0.75 * (1 - gone)} />;
      }
    }
    lightFree = (<g>{trail}<Light x={x} y={y} s={s * (1 - gone * 0.9)} t={t} squash={squash} halo={brightAI * (1 - gone)} /></g>);
  }

  // --- the cage and the treasure chest on the tallest keep ---
  const bars = [-33, -11, 11, 33].map((dx, i) => {
    const at = lerp(Q.created, Q.newTech, i / 3);
    const p = r(t, at, at + 0.35, BACK_OUT);
    return p > 0 ? <rect key={i} x={L0.x + dx - 2.5} y={L0.y - L0.h / 2} width={5} height={L0.h * p} rx={2} fill={pal.towerDark} stroke={pal.rim} strokeWidth={0.9} strokeOpacity={0.7} /> : null;
  });
  const chestP = r(t, Q.great, Q.great + 0.45, BACK_OUT);
  const lid = r(t, Q.treasure + 0.15, Q.treasure + 0.7, BACK_OUT);
  const chart = r(t, Q.shareholder - 0.1, Q.valueEnd, EASE_OUT);
  const ch = G.chest;
  const chest = chestP > 0 ? (
    <g transform={`translate(${ch.x} ${ch.y}) scale(${chestP * 1.45})`}>
      {/* WHY a tiny line chart instead of gold: the "great treasure" is shareholder value, and the joke lands when the lid opens on nothing but a graph */}
      <path d="M-14 -12 L-5 -30 L3 -23 L16 -54" fill="none" stroke="#F3EAF9" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={80} strokeDashoffset={80 * (1 - chart)} />
      {chart > 0.9 && <path d="M16 -54 l-9 3 M16 -54 l1 9" stroke="#F3EAF9" strokeWidth={3.4} strokeLinecap="round" />}
      <rect x={-23} y={-26} width={46} height={26} rx={3} fill="#4A2D5C" stroke="#21152C" strokeWidth={1.6} />
      <rect x={-23} y={-16} width={46} height={4} fill="#B98ECB" />
      <rect x={-4} y={-18} width={8} height={9} rx={1.5} fill="#E6D3F1" />
      <g transform={`translate(-23 -26) rotate(${-115 * lid})`}>
        <path d="M0 0 L0 -6 Q23 -20 46 -6 L46 0 Z" fill="#573670" stroke="#21152C" strokeWidth={1.6} />
      </g>
    </g>
  ) : null;

  const towerRecede = { opacity: 1 - 0.5 * recede, transform: `translate(0 ${recede * 30})` };
  const dayText = dawn > 0.55;

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile(narrator ? 'audio/take1-mix.wav' : 'audio/take1-type-mix.wav')} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <Defs frame={frame} />
        <defs>
          <filter id="lift" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1A0826" floodOpacity="0.45" /></filter>
        </defs>
        <g transform={layerTransform(cam, K.sky)}><SkyBack pal={pal} field={field} /><Stars o={pal.stars} /><Moon o={pal.moon} /></g>
        <g transform={layerTransform(cam, K.cloud)}><Clouds t={t} pal={pal} /></g>
        <g transform={layerTransform(cam, K.hills2)}><Hills far pal={pal} /></g>
        <g transform={layerTransform(cam, K.hills)}><Hills pal={pal} /></g>
        <g transform={layerTransform(cam, K.far)}><g opacity={1 - 0.5 * recede}><FarTowers lit={r(t, Q.corporations, Q.corporations + 1) * (1 - recede)} pal={pal} /></g></g>
        <g transform={layerTransform(cam, K.towers)}>
          <g opacity={towerRecede.opacity} transform={towerRecede.transform}>
            {TOWERS.map((d, i) => (
              <Tower key={i} d={d} g={growth} t={t} pal={pal} lit={towerLit} spin={spins[i]}
                front={d.crown === 'lantern' ? <>{bars}{chest}</> : undefined}>
                {d.crown === 'lantern' ? lightInTower : null}
              </Tower>
            ))}
          </g>
        </g>
        <g transform={layerTransform(cam, K.back)}><Row row="back" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} townGlow={townGlow} /></g>
        <g transform={layerTransform(cam, K.mid)}><Row row="mid" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} /></g>
        <g transform={layerTransform(cam, K.front)}><Row row="front" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} /></g>
        <g>{strings}{hooks}{things}{lightFree}</g>
        <g transform={layerTransform(cam, K.fore)}><Foreground pal={pal} /></g>
        <Birds t={t} from={Q.free} o={r(t, Q.free, Q.free + 1)} />
      </svg>
      {/* the hush on "However, recently…" (no fade from black: the film opens on a full picture) */}
      <AbsoluteFill style={{ background: '#07030C', opacity: hush * 0.3 }} />
      <Grain frame={frame} dawn={dawn} />
      <Scrim o={narrator ? Math.max(...[...HEADLINES, { words: FINAL, out: FINAL_OUT }].map((h) => Math.min(r(t, h.words[0].at - 0.4, h.words[0].at), 1 - r(t, h.out, h.out + 0.4)))) : 1 - r(t, FINAL_OUT, END_CARD)} dawn={dawn} />
      {narrator ? HEADLINES.map((h, i) => <Headline key={i} words={h.words} out={h.out} t={t} day={false} />) : <Captions t={t} />}
      <Headline words={FINAL} out={FINAL_OUT} t={t} day={dayText} />
      {/* WHY a dip to lavender and then the card: a cross-dissolve let the houses show through the logo;
          the morning sky is already this colour, so the dip is barely a step */}
      <AbsoluteFill style={{ background: C.lavender, opacity: r(t, END_CARD - 0.35, END_CARD, EASE_IN_OUT) }} />
      {t >= END_CARD && <EndCard at={END_CARD + 0.05} />}
    </AbsoluteFill>
  );
};
