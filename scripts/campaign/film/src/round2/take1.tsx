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
import { CARDS, Card, Coin, MoneyBag, Padlock, Sitter, Spyglass, TreasureMap } from './take1-props';
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
  // the privacy line (new in this recording): spyglasses on "privacy", the view through one on "cost"
  andThat: T('andThat', '*and that our privacy'),
  privacy: T('privacy', 'our *privacy'),
  costConv: T('costConv', 'the *cost of convenience'),
  mapIn: T('mapIn', '*a great treasure'),
  value: T('value', 'shareholder *value'),
  itsTime: T('itsTime', "*it's time to free"),
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

// The three things the keeps decide, one per clause of "They decided what your computers could do, what it
// would cost, and what happened with your personal data". WHY three different ACTIONS, not three objects
// carried off: the owner found hooks lifting things out of houses "completely random". Each clause now has
// the one action that means it: a padlock snaps shut on a window (they decide what it can do), a money bag
// is filled with the house's coins and hoisted (what it costs), and the house's photos, letters, calendar
// and map pin are reeled out on a line (what happens with your data). In the return ("what our computers
// can do…") each action is undone, in the same framing, so the rhyme is unmistakable.
type Kind = 'lock' | 'coins' | 'data';
type Item = { kind: Kind; tower: number; take: number; release: number; land: number; house: number; win: Win };
// the three picture windows in the middle of the front row: the biggest windows in town
const PICS = FRONT.houses.filter((h) => FRONT.wins.some((w) => w.house === h.id && w.w > 60)).sort((a, b) => a.x - b.x);
const COIN_HOUSE = nearestFront(towerGeo(TOWERS[0], 1).armTip.x, PICS.map((h) => h.id));
const ITEMS: Item[] = [
  { kind: 'lock', tower: 1, take: Q.takeComputers, release: Q.release0, land: Q.land0, house: PICS[0].id, win: mainWin(PICS[0].id) },
  { kind: 'coins', tower: 0, take: Q.takeCost, release: Q.release1, land: Q.land1, house: COIN_HOUSE.id, win: mainWin(COIN_HOUSE.id) },
  { kind: 'data', tower: 2, take: Q.takeData, release: Q.release2, land: Q.land2, house: PICS[PICS.length - 1].id, win: mainWin(PICS[PICS.length - 1].id) },
];
// Where the light lands: the first youcoded in town, near the middle, not one of the item houses.
const O_HOUSE = nearestFront(1150, ITEMS.map((i) => i.house));
const O = mainWin(O_HOUSE.id);
// The person at home whom the keeps watch through their spyglasses (the privacy line): a lit window near
// the middle of the front row, not one of the houses above.
const SIT_HOUSE = nearestFront(900, [...ITEMS.map((i) => i.house), O_HOUSE.id]);
const SIT = FRONT.wins.filter((w) => w.house === SIT_HOUSE.id).sort((a, b) => b.x - a.x || a.y - b.y)[0];

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
// WHY this close (about a third of the frame per object): at the previous zoom the lock, bag and cards were
// too small to name in a second. The coins come out of a small window, so that shot sits closest.
const SHOT_Z = [3.3, 3.5, 3.0];
const itemLow = (i: number, dz = 0): Cam => { const w = ITEMS[i].win; return aim(1, w.x + w.w / 2, w.y - 40, SHOT_Z[i] + dz); };
// The privacy line: first the keeps with their spyglasses out, then the view through one, into a home.
const SCOPE_SHOT = aim(K.towers, 1000, 600, 1.5);
const POV = (dx: number, dy: number, z = 5.4): Cam => aim(1, SIT.x + SIT.w / 2 + dx, SIT.y + SIT.h / 2 + dy, z);
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
  // the lock stays on its window, so that shot only pushes in; the bag and the cards are hoisted, so the
  // camera tilts up after them toward the keep that took them
  [Q.theyDecided, itemLow(0), true],
  [Q.whatItWould - 0.01, itemLow(0, 0.18)],
  [Q.whatItWould, itemLow(1), true],
  [ITEMS[1].take + 0.3, itemLow(1)],
  [Q.happenedWith - 0.01, itemUp(1)],
  [Q.happenedWith, itemLow(2), true],
  [Q.takeData + 0.05, itemLow(2, 0.08)],
  [Q.andWeAll - 0.01, itemUp(2)],
  // the keeps, now holding what they took
  [Q.andWeAll, aim(K.towers, 1010, 380, 1.22), true],
  [Q.weAccepted - 0.01, aim(K.towers, 1010, 400, 1.12)],
  // from the rooftops: the strings grow down to every house
  [Q.weAccepted, { cx: 960, cy: 615, z: 1.28 }, true],
  [Q.own - 0.13, { cx: 990, cy: 595, z: 1.2 }],
  // close on the identical windows as they dim on "nothing"
  [Q.own - 0.12, aim(1, 930, 905, 2.35), true],
  [Q.andThat - 0.01, aim(1, 950, 905, 2.42)],
  // "and that our privacy…": the keeps, spyglasses sliding out, all aimed at one lit window
  [Q.andThat, SCOPE_SHOT, true],
  [Q.costConv - 0.01, { ...SCOPE_SHOT, z: SCOPE_SHOT.z + 0.07 }],
  // "…the cost of convenience": the view through the glass, searching, then settling on the person at home
  [Q.costConv, POV(-60, -18, 5.1), true],
  [Q.costConv + 0.75, POV(0, 0)],
  [Q.however - 0.01, POV(0, 2, 5.55)],
  // the hush: the whole night town, then up to the lantern
  [Q.however, { cx: 980, cy: 520, z: 1.06 }, true],
  [Q.something - 0.05, LANTERN1],
  // the wonder: pull back wide so the colour can be seen arriving over the whole world
  [Q.happenedEnd + 0.8, { cx: 980, cy: 520, z: 1.05 }],
  [Q.hubrisEnd + 0.3, aim(K.towers, 1010, 330, 1.12)],
  [Q.aTechnology - 0.01, aim(K.towers, 1010, g2.lantern.y + 20, 2.05)],
  // cutaway: the town below, still dim under its strings, while the keeps dream of treasure
  [Q.aTechnology, { cx: 840, cy: 770, z: 1.7 }, true],
  // from "a great treasure" to "shareholder value" the treasure-map insert covers the frame; the world
  // camera just holds underneath it
  [Q.mapIn, { cx: 1120, cy: 755, z: 1.78 }],
  [Q.butIn - 0.01, { cx: 1120, cy: 755, z: 1.78 }],
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
  [Q.release0 - 0.01, { ...APPS_CLOSE, cx: APPS_CLOSE.cx + 90, z: APPS_CLOSE.z + 0.16 }],
  // "What our computers can do. What it costs. And what happens with our data.": the same three shots as
  // the taking, cut on each "what", so each undoing rhymes with its taking
  [Q.release0, itemLow(0), true],
  [Q.release1 - 0.01, itemLow(0, 0.12)],
  [Q.release1, itemLow(1), true],
  [Q.release2 - 0.01, itemLow(1, 0.1)],
  [Q.release2, itemLow(2), true],
  [Q.itsTime - 0.01, itemLow(2, 0.14)],
  // "It's time to free ourselves": wide, so the strings snapping and the spyglasses withdrawing read at once
  [Q.itsTime, ITEM_FRAME, true],
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
  { words: [{ text: 'own', at: Q.own }, { text: 'nothing.', at: Q.nothing, accent: true }], out: Q.privacy },   // WHY: gone as the spyglasses come out, so the privacy beat has the frame
  { words: [{ text: 'something', at: Q.something }, { text: 'wonderful', at: Q.wonderful, accent: true }, { text: 'happened.', at: Q.happened }], out: Q.blinded + 0.5 },
  { words: [{ text: 'for', at: Q.forAnyone }, { text: 'anyone', at: Q.anyone, accent: true }, { text: 'who', at: Q.who }, { text: 'asks.', at: Q.asks }], out: Q.so - 0.05 },
].map((h) => ({ ...h, out: holdOut(h.words[0].at, h.words.length, h.out) }));
// the captions stop where the closing headline begins ("open source everything.")
const CAPS = captions(WORDS.indexOf(cueWord('open', '*open source everything')), Q.open - 0.2);

// WHY the muted scrim follows the caption colour, not the sky: half-way through the dawn a sky-matched scrim
// went mid-grey under white text. It stays plum while captions are light text and turns lavender in the
// half-second before the first plum (daytime) caption.
const FIRST_DAY_CAP = CAPS.find((c) => dawnAt(c.at) > 0.5)?.at ?? 99;
const CAP_TONE = (t: number) => r(t, FIRST_DAY_CAP - 0.5, FIRST_DAY_CAP, EASE_IN_OUT);

/** A soft scrim behind the type spot: plum at night, lavender by morning. Wide and feathered, so it reads
 *  as the corner of the page dimming, never as a box. `strong` (the muted version, where words are always
 *  up) is a deeper band across the lower left. WHY: by day plum captions crossed the colourful houses and
 *  by night they crossed lit windows; the band quiets the picture under the words at phone size. */
const Scrim: React.FC<{ o: number; dawn: number; strong?: boolean }> = ({ o, dawn, strong }) => {
  if (o <= 0) return null;
  const c = mix('#0E0616', '#FAF5FD', dawn);
  const a = (k: number) => c.replace('rgb', 'rgba').replace(')', `,${k})`);
  const background = strong
    ? `linear-gradient(0deg, ${a(0.9)} 0%, ${a(0.84)} 24%, ${a(0.5)} 36%, transparent 50%)`
    : `radial-gradient(ellipse 72% 52% at 22% 100%, ${a(0.62 + 0.16 * dawn)} 0%, ${a(0.32)} 48%, transparent 78%)`;
  const mask = strong ? 'linear-gradient(90deg, #000 0%, #000 62%, transparent 92%)' : undefined;
  return <AbsoluteFill style={{ opacity: o, pointerEvents: 'none', background, WebkitMaskImage: mask, maskImage: mask }} />;
};

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
    let b = 0.1 + 0.75 * on - 0.5 * dim;
    // WHY: the watched window stays lit while the town dims around it; the locked window goes dull
    if (w.id === SIT.id) b = Math.max(b, 0.95 * sitO);
    if (w.id === ITEMS[0].win.id) b *= 1 - 0.45 * r(t, Q.takeComputers, Q.takeComputers + 0.5) * (1 - r(t, Q.land0 - 0.1, Q.land0));
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

  // --- what the keeps decide: a padlock, a money bag, a line of personal things ---
  // Everything is placed in screen space between two projected points: the keep's arm (A) and the house's
  // window (W). WHY: the two sit on different parallax layers, and a rope must join them on every frame.
  const hooks: React.ReactNode[] = [];
  const props: React.ReactNode[] = [];
  const spins = [0, 0, 0];
  const hookC = mix('#C9B6DA', '#5F4676', dawn);
  ITEMS.forEach((it, i) => {
    const geo = towerGeo(TOWERS[it.tower], growth);
    const A = project(cam, K.towers, geo.armTip.x, geo.armTip.y + 12 + recede * 30);
    const W = project(cam, K.front, it.win.x + it.win.w / 2, it.win.y + it.win.h / 2);
    const ws = W.s;
    const rest = { x: A.x, y: A.y + 14 * A.s };            // the hook tucked up under the pulley
    const hang = { x: A.x, y: A.y + 95 * A.s };            // where a hoisted thing hangs below the arm
    const keep = project(cam, K.towers, geo.cx(geo.armY), geo.armTip.y + 40);
    const N = it.take;
    let hook = rest, hs = A.s * 1.2;
    // where the hook's curl sits for a thing whose top is at y (the hook drawing reaches ~24 units below hy)
    const above = (x: number, y: number, s: number) => ({ x, y: y - 22 * s });

    if (it.kind === 'lock') {
      // "They decided what your computers could do": lowered on the rope, snapped shut on "computers",
      // left hanging on the window; on "what our computers can do" it springs open and drops away.
      // WHY bigger than the window: a storybook padlock hung right across it reads at a glance
      const seat = { x: W.x, y: W.y + it.win.h * 0.18 * ws };
      const size = it.win.w * 1.05 * ws;
      const down = r(t, Q.theyDecided - 0.35, N - 0.06, EASE_IN_OUT);
      const shut = r(t, N - 0.06, N + 0.05, EASE_IN);
      const thud = Math.sin(r(t, N + 0.03, N + 0.34, EASE_OUT) * Math.PI) * 0.08;
      const unhook = r(t, N + 0.4, N + 1.05, EASE_IN_OUT);
      const pop = r(t, it.land - 0.14, it.land + 0.02, BACK_OUT);
      const fall = r(t, it.land + 0.02, it.land + 0.7, EASE_IN);
      if (down > 0 && fall < 1) {
        const sway = Math.sin(t * 5.2) * 9 * (1 - down);
        const x = lerp(A.x, seat.x, down) + fall * 14 * ws, y = lerp(A.y + 70 * A.s, seat.y, down) + fall * 190 * ws;
        const sz = lerp(size * (A.s / ws), size, down);
        const shackleTop = y - 49 * (sz / 60);
        hs = lerp(A.s * 1.2, ws * 1.1, down);
        hook = unhook > 0 ? { x: lerp(x, rest.x, unhook), y: lerp(above(x, shackleTop, hs).y, rest.y, unhook) } : above(x, shackleTop, hs);
        if (unhook > 0) hs = lerp(ws * 1.1, A.s * 1.2, unhook);
        props.push(<Padlock key="lock" x={x} y={y} size={sz} open={fall > 0 || pop > 0 ? pop : 1 - shut} rot={sway + fall * 32}
          o={1 - r(t, it.land + 0.4, it.land + 0.7)} squash={thud} />);
      }
    } else if (it.kind === 'coins') {
      // "what it would cost": a money bag lowered beside the window; three coins hop out of the window into
      // it, the middle one on "cost"; the bag is hoisted into the keep. On "what it costs" it comes back
      // down and the coins hop home.
      const seat = { x: W.x + (it.win.w * 0.5 + 52) * ws, y: W.y + it.win.h * 0.2 * ws };
      const size = 84;
      const hops = [-0.24, -0.03, 0.18];
      const going = t < it.release - 0.5;
      const down = r(t, Q.whatItWould - 0.6, Q.whatItWould + 0.14, EASE_OUT);
      const up = r(t, N + 0.5, N + 1.2, EASE_IN_OUT);
      const stow = r(t, N + 1.25, N + 1.7, EASE_IN);
      const back = r(t, it.release - 0.5, it.land - 0.2, EASE_OUT);
      const leave = r(t, it.land + 0.55, it.land + 1.25, EASE_IN_OUT);
      let bag: { x: number; y: number; s: number; o: number; fill: number } | null = null;
      if (going && down > 0 && stow < 1) {
        const p = { x: lerp(A.x, seat.x, down), y: lerp(A.y + 60 * A.s, seat.y, down) };
        const q = { x: lerp(p.x, hang.x, up), y: lerp(p.y, hang.y, up) };
        const filled = hops.filter((h) => t > N + h + 0.34).length / 3;
        bag = { x: lerp(q.x, keep.x, stow), y: q.y, s: lerp(ws, A.s, Math.max(up, 1 - down)), o: 1 - stow, fill: filled };
      } else if (!going && back > 0 && leave < 1) {
        const p = { x: lerp(hang.x, seat.x, back), y: lerp(hang.y, seat.y, back) };
        const q = { x: lerp(p.x, hang.x, leave), y: lerp(p.y, hang.y, leave) };
        const left = hops.filter((h) => t > it.land + h).length / 3;
        bag = { x: q.x, y: q.y, s: lerp(A.s, ws, back) * (1 - leave) + A.s * leave, o: 1 - r(t, it.land + 1.0, it.land + 1.25), fill: 1 - left };
      }
      if (bag) {
        hs = bag.s * 1.1;
        hook = above(bag.x, bag.y - 30 * (size / 60) * bag.s, hs);
        props.push(<MoneyBag key="bag" x={bag.x} y={bag.y} size={size * bag.s} fill={bag.fill} open={going ? 1 - up : 1 - leave} rot={Math.sin(t * 2.4) * 3} o={bag.o} />);
      }
      // the coins: each a short hop on an arc, spinning, between the window and the bag's mouth
      const mouth = { x: seat.x, y: seat.y - 36 * ws };
      hops.forEach((h, k) => {
        const t0 = going ? N + h : it.land + h;
        const f = (t - t0) / 0.34;
        if (f < 0 || f >= 1) return;
        const [a, b] = going ? [W, mouth] : [mouth, W];
        const e = EASE_IN_OUT(f);
        props.push(<Coin key={`c${k}`} x={lerp(a.x, b.x, e)} y={lerp(a.y, b.y, e) - Math.sin(f * Math.PI) * 60 * ws} r={13 * ws} spin={f * 1.25 + k * 0.2}
          o={going ? 1 : 1 - r(f, 0.78, 1)} />);
      });
    } else {
      // "what happened with your personal data": the hook drops into the window and reels out a line of the
      // person's things (a photo, a letter, their calendar, their map pin) and hauls it up to the keep.
      // On "what happens with our data" the line is lowered back and each card slips home.
      const catchPt = { x: W.x, y: W.y };
      const going = t < it.release - 0.25;
      const down = r(t, Q.happenedWith - 0.7, Q.happenedWith + 0.05, EASE_OUT);
            // WHY two stages: first the whole line is drawn out of the window while the camera is still on it
      // (all four cards visible by "data"), then it is hauled up to the keep as the camera tilts after it
      const p1 = r(t, Q.happenedWith + 0.25, N + 0.05, EASE_IN_OUT);
      const p2 = r(t, N + 0.05, Q.andWeAll - 0.05, EASE_IN_OUT);
      const mid = { x: W.x, y: W.y - 300 * ws };
      const stow = r(t, Q.andWeAll + 0.1, Q.andWeAll + 0.75, EASE_IN);
      const back = r(t, it.release - 0.25, it.land - 0.05, EASE_IN_OUT);
      const leave = r(t, it.land + 0.3, it.land + 1.0, EASE_IN_OUT);
      let H: { x: number; y: number }, lift: number, show: boolean, o = 1;
      if (going) {
        H = p2 > 0 ? { x: lerp(mid.x, hang.x, p2), y: lerp(mid.y, hang.y, p2) }
          : p1 > 0 ? { x: lerp(catchPt.x, mid.x, p1), y: lerp(catchPt.y, mid.y, p1) }
          : { x: lerp(rest.x, catchPt.x, down), y: lerp(rest.y, catchPt.y, down) };
        lift = p2; show = p1 > 0 && stow < 1;
        if (stow > 0) { H = { x: lerp(H.x, keep.x, stow), y: H.y }; o = 1 - stow; }
        if (stow >= 1) H = rest;
      } else {
        H = back < 1 ? { x: lerp(hang.x, catchPt.x, back), y: lerp(hang.y, catchPt.y, back) } : { x: lerp(catchPt.x, rest.x, leave), y: lerp(catchPt.y, rest.y, leave) };
        lift = 1 - back; show = back > 0 && back < 1;
      }
      const cs = lerp(ws, A.s, lift);                       // cards shrink as they rise toward the keep
      hs = cs * 1.1;
      hook = { x: H.x, y: H.y - 22 * hs };
      if (show) {
        const dx = W.x - H.x, dy = W.y - H.y, len = Math.hypot(dx, dy) || 1;
        const gap = 80 * cs;
        let lineTo = 0;
        CARDS.forEach((kind, j) => {
          const dj = 46 * cs + j * gap;
          const out = Math.max(0, Math.min(1, (len - dj) / (0.5 * gap)));
          if (out <= 0) return;
          lineTo = dj;
          const sw = Math.sin(t * 3.1 + j * 1.4) * 5 * cs * (j + 1) * (1 - 0.6 * lift);
          props.push(<Card key={`d${j}`} kind={kind} x={H.x + (dx / len) * dj + sw} y={H.y + (dy / len) * dj} size={66 * cs * (0.4 + 0.6 * out)}
            rot={Math.sin(t * 2.6 + j * 1.3) * 9} o={o * Math.min(1, out * 2)} />);
        });
        if (lineTo > 0) props.unshift(<line key="dline" x1={H.x} y1={H.y} x2={H.x + (dx / len) * lineTo} y2={H.y + (dy / len) * lineTo} stroke={hookC} strokeWidth={1.6} opacity={o} />);
      }
    }
    spins[it.tower] = (hook.y - A.y) * 2.2;               // the pulley turns as the rope pays out
    hooks.push(<Hook key={i} ax={A.x} ay={A.y} hx={hook.x} hy={hook.y} s={hs} o={1 - recede} c={hookC} />);
  });

  // --- the spyglasses ("our privacy"): out of every keep, all aimed at one lit window; gone on "free" ---
  const spyOut = Math.min(r(t, Q.andThat + 0.08, Q.privacy + 0.3, BACK_OUT), 1 - r(t, Q.free, Q.free + 0.6, EASE_IN_OUT));
  const spies = spyOut <= 0 ? null : TOWERS.map((d, i) => {
    const g = towerGeo(d, growth);
    const y = g.base - (g.base - g.top) * [0.5, 0.42, 0.48][i];
    const tx = SIT.x + SIT.w / 2, ty = SIT.y + SIT.h / 2;
    const side = tx < g.cx(y) ? -1 : 1;
    const x0 = g.cx(y) + side * g.half(y) * 0.92;
    // WHY a slow search before they lock on: still tubes read as cannons; a small sweep reads as looking
    const search = 1 - r(t, Q.privacy, Q.costConv, EASE_IN_OUT);
    const ang = (Math.atan2(ty - y, tx - x0) * 180) / Math.PI + Math.sin(t * 1.3 + i * 2) * 7 * search;
    // WHY pale brass-lilac, not the towers' own colour: dark tubes vanished against the dark keeps
    return <Spyglass key={i} x={x0} y={y} angle={ang} extend={spyOut} dark={mix('#7D6394', '#B9A3CC', dawn)} lit={mix('#BCA4CF', '#E2D3EC', dawn)} rim={mix('#E9D8F2', '#FFFFFF', dawn)} inkC={pal.ink} />;
  });
  const sitO = Math.min(r(t, Q.weAccepted, Q.weAccepted + 0.6), 1 - r(t, Q.however + 0.4, Q.something, EASE_IN_OUT));
  const inside = (w: Win) => (w.id === SIT.id ? <Sitter x={w.x} y={w.y} w={w.w} h={w.h} t={t} o={sitO} /> : null);
  // the view through a spyglass: a round hole in the dark that opens on the cut and drifts as it searches
  const pov = t >= Q.costConv && t < Q.however;
  const povR = 300 + 80 * r(t, Q.costConv, Q.costConv + 0.3, EASE_OUT);

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

  // --- the cage on the tallest keep (the bars close round the light as "a new kind of technology" is made) ---
  const bars = [-33, -11, 11, 33].map((dx, i) => {
    const at = lerp(Q.created, Q.newTech, i / 3);
    const p = r(t, at, at + 0.35, BACK_OUT);
    return p > 0 ? <rect key={i} x={L0.x + dx - 2.5} y={L0.y - L0.h / 2} width={5} height={L0.h * p} rx={2} fill={pal.towerDark} stroke={pal.rim} strokeWidth={0.9} strokeOpacity={0.7} /> : null;
  });
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
                front={d.crown === 'lantern' ? <>{bars}</> : undefined}>
                {d.crown === 'lantern' ? lightInTower : null}
              </Tower>
            ))}
            {spies}
          </g>
        </g>
        <g transform={layerTransform(cam, K.back)}><Row row="back" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} townGlow={townGlow} /></g>
        <g transform={layerTransform(cam, K.mid)}><Row row="mid" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} /></g>
        <g transform={layerTransform(cam, K.front)}><Row row="front" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} inside={inside} /></g>
        <g>{strings}{hooks}{props}{lightFree}</g>
        <g transform={layerTransform(cam, K.fore)}><Foreground pal={pal} /></g>
        <Birds t={t} from={Q.free} o={r(t, Q.free, Q.free + 1)} />
      </svg>
      {/* the hush on "However, recently…" (no fade from black: the film opens on a full picture) */}
      <AbsoluteFill style={{ background: '#07030C', opacity: hush * 0.3 }} />
      {/* the spyglass view: everything outside a round lens goes dark, with a faint rim to the glass */}
      {pov && (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 48%, transparent ${povR - 14}px, rgba(7,3,12,0.92) ${povR + 4}px, #07030C ${povR + 40}px)` }} />
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
            <circle cx={960} cy={518} r={povR - 4} fill="none" stroke="#C9B0DB" strokeOpacity={0.22} strokeWidth={3} />
          </svg>
        </AbsoluteFill>
      )}
      {/* "a great treasure: shareholder value": the keeps' dream, as a treasure map that turns out to be a chart */}
      <TreasureMap t={t} at={Q.mapIn} treasure={Q.treasure} shareholder={Q.shareholder} value={Q.value} out={Q.butIn} />
      <Grain frame={frame} dawn={dawn} />
      <Scrim o={narrator ? Math.max(...[...HEADLINES, { words: FINAL, out: FINAL_OUT }].map((h) => Math.min(r(t, h.words[0].at - 0.4, h.words[0].at), 1 - r(t, h.out, h.out + 0.4)))) : 1 - r(t, FINAL_OUT, END_CARD)} dawn={narrator ? dawn : CAP_TONE(t)} strong={!narrator} />
      {narrator ? HEADLINES.map((h, i) => <Headline key={i} words={h.words} out={h.out} t={t} day={false} />) : <Captions t={t} />}
      <Headline words={FINAL} out={FINAL_OUT} t={t} day={dayText} />
      {/* WHY a dip to lavender and then the card: a cross-dissolve let the houses show through the logo;
          the morning sky is already this colour, so the dip is barely a step */}
      <AbsoluteFill style={{ background: C.lavender, opacity: r(t, END_CARD - 0.35, END_CARD, EASE_IN_OUT) }} />
      {t >= END_CARD && <EndCard at={END_CARD + 0.05} />}
    </AbsoluteFill>
  );
};
