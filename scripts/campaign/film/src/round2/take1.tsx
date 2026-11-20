// Round two, take 1: the narrated fairytale. See docs/active/design/2026-11-19-campaign-round2/takes.md.
//
// The story in pictures (one hero, one magic object, one call-back per promise):
//  - A town where every window is a person's screen. Three towers rule it. On "dictated" every window
//    switches to the same dull panel at once.
//  - The towers decide three things, each shown as one object on one house: a padlock (what your computer
//    can do), a coin meter (what it costs), and the house's own lit window hung as a framed picture in a
//    tower (what happens with your data). Later each is undone in the same framing.
//  - The towers make an enchanted quill (the fable's AI), cage it, and dream of treasure: their tops stack
//    up like coin piles into a bar chart. The quill breaks out and flies down to one villager.
//  - "For anyone who asks": the villager asks (a speech bubble with a picture of a recipe) and the quill
//    writes it into their window. The neighbour gets it handed over a washing line, in their own colours.
//    Then the whole town asks, every window different. The towers fold flat like pop-up-book pages.
//
// WHY every time below is a phrase: cues are read from the narrator's word timings (take1-words.ts), so
// pictures land on the syllable they illustrate, and a re-recorded script re-times the film by itself.
import React from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, useU } from '../kit';
import { E, T, WORDS, captions, cueWord } from './take1-words';
import { APP, AppWin, THEMES } from './take1-apps';
import { Bubble, Coin, CoinMeter, FramedCopy, Padlock, Pennant, Quill, Sitter, Spyglass, Villager } from './take1-props';
import {
  ALL_WINS, Birds, Cam, Clouds, Defs, FRONT, Foreground, Hills, House, K, Moon, Row, SkyBack, Stars,
  TOWERS, TOWN, Tower, Win, WinLook, aim, doorSize, layerTransform, mix, palette, project, towerGeo,
} from './take1-scene';

// ---------- small timing helpers ----------
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0→1 between two times (seconds). */
const r = (t: number, a: number, b: number, e: (x: number) => number = EASE_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const BACK_OUT = Easing.bezier(0.34, 1.56, 0.64, 1);
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);
const LIN = (x: number) => x;
const seeded = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** on between a and b, with soft edges */
const band = (t: number, a: number, b: number, fi = 0.25, fo = 0.25) => Math.min(r(t, a, a + fi, EASE_IN_OUT), 1 - r(t, b - fo, b, EASE_IN_OUT));

// ---------- the cues ----------
// WHY one table, each with a name and a short phrase: when a new recording arrives, any cue whose phrase
// was reworded fails with its name in the error, and is fixed here in one line.
const Q = {
  corporations: T('corporations', 'handful of *corporations'),
  have: T('have', 'corporations *have dictated'),
  dictated: T('dictated', 'have *dictated'),
  theyDecided: T('theyDecided', '*they decided'),
  computers: T('computers', 'your *computers could'),
  whatCost: T('whatCost', '*what it would cost'),
  cost: T('cost', 'would *cost'),
  andWhat: T('andWhat', '*and what happened'),
  personal: T('personal', 'your *personal data'),
  data: T('data', 'personal *data'),
  andWeAll: T('andWeAll', '*and we all'),
  justAccepted: T('justAccepted', '*just accepted'),
  acceptedIt: T('acceptedIt', 'accepted *it'),
  weAccepted: T('weAccepted', '*we accepted that'),
  subscribe: T('subscribe', 'subscribe to everything'),
  own: T('own', '*own nothing'),
  nothing: T('nothing', 'own *nothing'),
  andThat: T('andThat', '*and that our privacy'),
  privacy: T('privacy', 'our *privacy'),
  convenience: T('convenience', 'of *convenience'),
  however: T('however', 'however'),
  recently: T('recently', 'recently'),
  something: T('something', '*something truly'),
  wonderful: T('wonderful', 'truly *wonderful'),
  happened: T('happened', 'wonderful *happened'),
  blinded: T('blinded', 'blinded'),
  hubris: T('hubris', 'hubris'),
  these: T('these', '*these corporations'),
  created: T('created', 'corporations *created'),
  newTech: T('newTech', 'kind of *technology'),
  artificial: T('artificial', 'artificial intelligence'),
  intelligenceEnd: E('intelligenceEnd', 'artificial *intelligence'),
  aTechnology: T('aTechnology', '*a technology they'),
  great: T('great', 'a *great treasure'),
  shareholder: T('shareholder', 'shareholder value'),
  value: T('value', 'shareholder *value'),
  but: T('but', '*but in their'),
  excitement: T('excitement', 'their *excitement'),
  beyond: T('beyond', 'far *beyond'),
  control: T('control', 'own *control'),
  aTool: T('aTool', '*a tool that'),
  make: T('make', 'can *make software'),
  softwareEnd: E('softwareEnd', 'make *software'),
  theEver: T('theEver', '*the ever-scarce'),
  foundation: T('foundation', 'foundation'),
  monopolies1: T('monopolies1', 'these *monopolies'),
  forAnyone: T('forAnyone', '*for anyone who'),
  anyone: T('anyone', 'for *anyone'),
  who: T('who', 'anyone *who'),
  asks: T('asks', 'who *asks'),
  andSo: T('andSo', '*and so'),
  first: T('first', 'the *first time'),
  inA: T('inA', '*in a very'),
  very: T('very', '*very long'),
  while: T('while', 'long *while'),
  we: T('we', '*we get to'),
  decide: T('decide', 'to *decide'),
  decideEnd: E('decideEnd', 'to *decide'),
  what1: T('what1', '*what our computers'),
  computers2: T('computers2', 'our *computers can'),
  can: T('can', 'computers *can'),
  what2: T('what2', '*what it costs'),
  costs: T('costs', 'it *costs'),
  andWhat2: T('andWhat2', '*and what happens'),
  happens: T('happens', 'what *happens'),
  withOur: T('withOur', '*with our data'),
  data2: T('data2', 'our *data'),
  itsTime: T('itsTime', "*it's time to free"),
  free: T('free', 'to *free'),
  monopolies2: T('monopolies2', 'tech *monopolies'),
  pastEnd: E('pastEnd', 'the *past'),
  itsTime2: T('itsTime2', "*it's time at"),
  time2: T('time2', "it's *time at"),
  long2: T('long2', 'at *long long'),
  long3: T('long3', 'long *long last'),
  last: T('last', 'long *last'),
  to: T('to', '*to open source'),
  open: T('open', '*open source everything'),
  source: T('source', 'open *source everything'),
  everything: T('everything', 'open source *everything'),
  everythingEnd: E('everythingEnd', 'open source *everything'),
};
// WHY 72.5 s: the brand end card must hold at least 2.5 s and the film is exactly 75 s; the closing
// headline is held as long as that allows (it is fully readable for ~1.5 s after its last word lands).
export const END_CARD = 72.5;

// ---------- night to morning ----------
// WHY: night until the quill escapes; light comes with the asking; a clear morning by "open source
// everything", so the light end card is the natural last step. Only the sky lifts (see palette()).
const DAWN_KEYS: [number, number][] = [
  [0, 0], [Q.control, 0], [Q.asks + 0.6, 0.25], [Q.decideEnd, 0.5], [Q.pastEnd, 0.8], [Q.everything, 1], [99, 1],
];
const dawnAt = (t: number) => {
  let i = 0; while (i < DAWN_KEYS.length - 2 && t >= DAWN_KEYS[i + 1][0]) i++;
  const [t0, a] = DAWN_KEYS[i], [t1, b] = DAWN_KEYS[i + 1];
  return lerp(a, b, SMOOTH(Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))));
};

// ---------- the cast ----------
// The six picture-window houses in the middle of the front row, left to right. WHY fixed roles: each
// promise of line 2 belongs to one house and is undone on that same house in line 7, so a viewer can
// follow it; the one who asks stands between the padlocked house and the neighbour.
const PICS = FRONT.houses.filter((h) => h.big).sort((a, b) => a.x - b.x);
if (PICS.length < 6) throw new Error('take1: the town needs six picture-window houses for the cast');
const [DATA, LOCK, HERO, NEIGH, KID, COIN] = PICS;
const WIN = (h: House) => FRONT.wins.find((w) => w.house === h.id)!;
const WC = (h: House) => { const w = WIN(h); return { x: w.x + w.w / 2, y: w.y + w.h / 2 }; };
/** a camera aimed at a cast house's window, nudged by dx/dy (world units) */
const at = (h: House, dx: number, dy: number, z: number): Cam => aim(1, WC(h).x + dx, WC(h).y + dy, z);
// two plain front-row houses that are handed apps over washing lines in the finale (their nearest window)
const nearWin = (x: number) => FRONT.wins.filter((w) => !PICS.some((p) => p.id === w.house)).reduce((a, b) => (Math.abs(b.x + b.w / 2 - x) < Math.abs(a.x + a.w / 2 - x) ? b : a));
const LEFT_GIFT = nearWin(WIN(DATA).x - 120);
const RIGHT_GIFT = nearWin(WIN(COIN).x + WIN(COIN).w + 90);

// Their looks. WHY set here: each cast app must be a recognisable personal thing in a colour that
// tells it apart from its neighbour (the hero's recipe is apricot; the same recipe next door is sky blue).
const CAST: [House, number, number][] = [
  [HERO, 1, APP.recipe], [NEIGH, 4, APP.recipe], [KID, 3, APP.drawing], [LOCK, 2, APP.garden], [COIN, 7, APP.setlist], [DATA, 5, APP.album],
];
CAST.forEach(([h, th, lay]) => { const w = WIN(h); w.theme = THEMES[th]; w.layout = lay; h.theme = THEMES[th]; });
// the two finale gifts keep the app they are handed but wear their own house's colours
LEFT_GIFT.layout = APP.album; RIGHT_GIFT.layout = APP.setlist;
const COATS: Record<number, { coat: string; hair: number; s: number }> = {
  [DATA.id]: { coat: '#B9506F', hair: 1, s: 1.2 }, [LOCK.id]: { coat: '#4F8A57', hair: 0, s: 1.22 },
  [HERO.id]: { coat: '#D9693A', hair: 1, s: 1.25 }, [NEIGH.id]: { coat: '#3F7DA3', hair: 0, s: 1.24 },
  [KID.id]: { coat: '#C08B1C', hair: 1, s: 0.92 }, [COIN.id]: { coat: '#6157C2', hair: 0, s: 1.2 },
};

/** Where a house's coin meter hangs. WHY above the door on picture houses: beside it, it covered the window. */
const meterAt = (h: House) => {
  const { hw, ht } = doorSize(h);
  return h.big ? { x: h.doorX, y: h.base - ht - hw - 19, s: 1.35 } : { x: h.doorX + hw + 11 * (h.row === 'front' ? 1 : 0.8), y: h.base - ht * 0.62, s: 1 };
};

// ---------- the towers ----------
// Growth: all three swell on "hubris"; then on "a great treasure" they stack extra storeys one at a time,
// like coins on a pile, until their tops form a rising staircase: a bar chart made of their own castles.
const STOREY = 60;
const STACK: number[] = [2, 1, 2, 0, 2, 2, 1, 2, 2, 2];          // which tower gets each storey, in order
const STACK_T = (k: number) => lerp(Q.great, Q.shareholder - 0.12, k / STACK.length);
const growthOf = (i: number, t: number) => {
  let g = 1 + 0.1 * r(t, Q.hubris, Q.hubris + 0.45, BACK_OUT);
  STACK.forEach((ti, k) => { if (ti === i) g += (STOREY / TOWERS[i].h) * r(t, STACK_T(k), STACK_T(k) + 0.2, BACK_OUT); });
  return g;
};
// "free ourselves from the tech monopolies of the past": each tower folds flat into the ground like a
// pop-up-book page, tallest first, timed across "monopolies of the past".
const FOLD_ORDER = [2, 1, 0];
const foldOf = (i: number, t: number) => {
  const k = FOLD_ORDER.indexOf(i);
  const a = Q.monopolies2 - 0.1 + k * 0.22;
  return r(t, a, a + 0.75, EASE_IN);
};
const lantern = (t: number) => towerGeo(TOWERS[1], growthOf(1, t)).lantern;
const aimLantern = (t: number, z: number, dy = 0): Cam => { const L = lantern(t); return aim(K.towers, L.x, L.y + dy, z); };
// The framed window in the left tower: on the tower face, high up.
const frameAt = (t: number) => {
  const g = towerGeo(TOWERS[0], growthOf(0, t));
  const y = g.base - (g.base - g.top) * 0.6;
  return { x: g.cx(y) - 30, y: y - 23, w: 60, h: 46 };
};
const aimFrame = (t: number, z: number): Cam => { const f = frameAt(t); return aim(K.towers, f.x + f.w / 2, f.y + f.h / 2, z); };

// ---------- the camera ----------
// [time, camera, cut?]. A key marked cut is a hard cut on that word; between keys the camera eases.
type Key = [number, Cam, boolean?];
const Q_ESCAPE_WIDE = Q.control + 0.3;                // the cut from the lantern to the wide swoop
const AA: Cam = { cx: 980, cy: 690, z: 1.15 };         // "we get to decide": the whole town
const CAM_KEYS: Key[] = [
  // 1. a villager taps their window and it lights up as a screen
  [0, at(HERO, -40, -14, 3.3), true],
  [Q.corporations - 0.01, at(HERO, -30, -14, 3.55)],
  // the towers loom
  [Q.corporations, aim(K.towers, 1010, 430, 1.32), true],
  [Q.have - 0.01, aim(K.towers, 1010, 415, 1.38)],
  // towers and town together: every window switches to the same panel on "dictated"
  [Q.have, { cx: 990, cy: 610, z: 1.12 }, true],
  [Q.theyDecided - 0.01, { cx: 1000, cy: 700, z: 1.3 }],
  // 2. the three decisions, each on its own house
  [Q.theyDecided, at(LOCK, 0, -40, 3.0), true],
  [Q.whatCost - 0.01, at(LOCK, 0, -36, 3.2)],
  [Q.whatCost, at(COIN, -45, -15, 3.1), true],
  [Q.andWhat - 0.01, at(COIN, -40, -15, 3.3)],
  [Q.andWhat, at(DATA, 0, -6, 3.6), true],
  [Q.data - 0.01, at(DATA, 0, -8, 4.0)],
  [Q.data, aimFrame(Q.data, 5.6), true],
  [Q.andWeAll - 0.01, aimFrame(Q.data, 6.2)],
  // 3. the villagers shrug and go back in; meters on every door; pennants on every roof
  [Q.andWeAll, aim(1, 1225, 925, 2.05), true],
  [Q.weAccepted - 0.01, aim(1, 1205, 925, 2.15)],
  // WHY this close: meters above the doors and pennants on the roofs must be nameable at a glance
  [Q.weAccepted, aim(1, 1270, 880, 2.0), true],
  [Q.own - 0.01, aim(1, 1255, 868, 1.92)],
  [Q.andThat - 0.01, aim(1, 1250, 864, 1.9)],
  // the privacy line: the watched window, a spyglass, a wave; the town's lights go out around it
  [Q.andThat, at(DATA, -80, -20, 3.0), true],
  [Q.however - 0.01, at(DATA, -60, -16, 3.5)],
  // the hush: the sleeping town, then up to the top room of the tallest tower
  [Q.however, { cx: 980, cy: 560, z: 1.05 }, true],
  [Q.recently, { cx: 980, cy: 555, z: 1.06 }],
  [Q.wonderful, aimLantern(Q.wonderful, 3.1, 10)],
  [Q.blinded - 0.01, aimLantern(Q.wonderful, 3.35, 10)],
  // hubris: a low look up at the towers as they swell
  [Q.blinded, aim(K.towers, 1010, 600, 1.5), true],
  [Q.these - 0.01, aim(K.towers, 1010, 560, 1.42)],
  // they make a new kind of technology: in to the caged top room...
  [Q.these, aim(K.towers, 1000, 300, 1.45), true],
  [Q.artificial - 0.01, aimLantern(Q.artificial, 2.6, 10)],
  // ...and inside it, the quill writes by itself
  [Q.artificial, aimLantern(Q.artificial, 6.4, 8), true],
  [Q.aTechnology - 0.01, aimLantern(Q.artificial, 6.8, 8)],
  // treasure: the towers stack up; on "shareholder" the camera tilts up to their rising tops
  [Q.aTechnology, aim(K.towers, 1010, 380, 1.05), true],
  [Q.great, aim(K.towers, 1010, 360, 1.0)],
  [Q.shareholder - 0.2, aim(K.towers, 1010, 300, 0.93)],
  [Q.value + 0.3, aim(K.towers, 1060, 215, 0.95)],
  // the quill rattles its cage, then breaks out
  [Q.but, aim(K.towers, 1000, 330, 1.25), true],
  [Q.beyond - 0.01, aimLantern(Q.beyond, 2.6, 10)],
  [Q.beyond, aimLantern(Q.beyond, 4.0, 10), true],
  [Q_ESCAPE_WIDE - 0.01, aimLantern(Q.beyond, 4.25, 10)],
  [Q_ESCAPE_WIDE, { cx: 990, cy: 470, z: 0.98 }, true],
  [Q.aTool - 0.01, { cx: 990, cy: 500, z: 1.0 }],
  // 4. the quill reaches one villager and sketches a blank app in their window
  [Q.aTool, at(HERO, -20, 10, 3.0), true],
  [Q.theEver - 0.01, at(HERO, -15, 8, 3.25)],
  // "the ever-scarce foundation of these monopolies": their stone cracks
  [Q.theEver, aim(K.towers, 1010, 560, 1.45), true],
  [Q.forAnyone - 0.01, aim(K.towers, 1010, 545, 1.55)],
  // "for anyone who asks": the villager asks, the quill writes it
  [Q.forAnyone, at(HERO, -90, 22, 2.9), true],
  [Q.andSo - 0.01, at(HERO, -80, 20, 3.0)],
  // the neighbour takes it over the washing line, in their own colours
  [Q.andSo, aim(1, (WC(HERO).x + WC(NEIGH).x) / 2, WC(HERO).y + 20, 2.5), true],
  [Q.inA, aim(1, (WC(HERO).x + WC(NEIGH).x) / 2 + 20, WC(HERO).y + 20, 2.45)],
  [Q.while - 0.1, aim(1, (WC(NEIGH).x + WC(KID).x) / 2 + 40, WC(KID).y + 10, 2.25)],
  [Q.we - 0.01, aim(1, (WC(NEIGH).x + WC(KID).x) / 2 + 50, WC(KID).y + 10, 2.3)],
  // "we get to decide": the whole town asks
  [Q.we, AA, true],
  [Q.what1 - 0.01, { ...AA, z: AA.z + 0.06 }],
  // 7. each decision undone on its own house
  [Q.what1, at(LOCK, 0, -36, 2.9), true],
  [Q.what2 - 0.01, at(LOCK, 0, -36, 3.1)],
  [Q.what2, at(COIN, -45, -10, 3.0), true],
  [Q.andWhat2 - 0.01, at(COIN, -40, -10, 3.2)],
  [Q.andWhat2, aimFrame(Q.andWhat2, 5.6), true],
  [Q.withOur - 0.01, aimFrame(Q.andWhat2, 6.0)],
  [Q.withOur, at(DATA, 0, -8, 3.6), true],
  [Q.itsTime - 0.01, at(DATA, 0, -8, 3.3)],
  // 8. "free ourselves": pennants fly off the roofs, the towers fold away
  [Q.itsTime, { cx: 990, cy: 560, z: 1.0 }, true],
  [Q.pastEnd + 0.6, { cx: 985, cy: 630, z: 1.1 }],
  // 9. along the street: neighbours hand each other what they made
  [Q.itsTime2, at(DATA, -120, 12, 2.5), true],
  [Q.long3 - 0.01, at(DATA, -70, 12, 2.6)],
  [Q.long3, at(COIN, 40, 12, 2.5), true],
  [Q.to, at(COIN, 75, 12, 2.6)],
  // and back to the whole bright town for the last line
  [Q.everything + 0.6, { cx: 1000, cy: 700, z: 1.28 }],
  [80, { cx: 1000, cy: 705, z: 1.3 }],
];
export const camAt = (t: number): Cam => {
  let i = 0;
  while (i < CAM_KEYS.length - 2 && t >= CAM_KEYS[i + 1][0]) i++;
  const [t0, a] = CAM_KEYS[i], [t1, b, cut] = CAM_KEYS[i + 1];
  const p = cut ? 0 : SMOOTH(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
  // WHY the drift is scaled down when zoomed in: a 7 px wobble is invisible wide but a shake at 6x
  const k = 1 / Math.max(1, (a.z + b.z) / 2 - 0.5);
  return {
    cx: lerp(a.cx, b.cx, p) + Math.sin(t * 0.21) * 7 * k,
    cy: lerp(a.cy, b.cy, p) + Math.sin(t * 0.15 + 1) * 5 * k,
    z: lerp(a.z, b.z, p) * (1 + 0.004 * Math.sin(t * 0.18)),
  };
};

// ---------- washing lines ----------
// A hand-off: a small copy of an app slides along a line from one window to the next, which then turns
// into that app in its own colours. WHY: "what one person makes, others can use", in one picture.
type Gift = { from: Win; to: Win; t0: number };
const GIFTS: Gift[] = [
  { from: WIN(DATA), to: LEFT_GIFT, t0: Q.time2 + 0.2 },
  { from: WIN(COIN), to: RIGHT_GIFT, t0: Q.long3 + 0.12 },
];
const HERO_GIFT: Gift = { from: WIN(HERO), to: WIN(NEIGH), t0: Q.andSo + 0.25 };

// ---------- when each window turns ----------
// WHY a schedule built from words: the hero turns on "asks", the neighbour on "first", the kid on
// "while"; "we get to decide" turns every window the quill passes; the three decided houses wait for their
// own line; everything else turns in three swells on "long, long last".
const FLIP = new Map<number, number>();
const RESERVED = new Set([LOCK, COIN, DATA].map((h) => WIN(h).id).concat([LEFT_GIFT.id, RIGHT_GIFT.id]));
const QUILL_SWEEP = [Q.we + 0.25, Q.decideEnd + 0.15] as const;   // its run across the town, left to right
(() => {
  FLIP.set(WIN(HERO).id, Q.asks + 0.14);
  FLIP.set(WIN(NEIGH).id, Q.first - 0.05);
  FLIP.set(WIN(KID).id, Q.while + 0.12);
  FLIP.set(WIN(LOCK).id, Q.can);
  FLIP.set(WIN(COIN).id, Q.costs + 0.32);
  FLIP.set(WIN(DATA).id, Q.free + 0.1);
  FLIP.set(LEFT_GIFT.id, GIFTS[0].t0 + 0.9);
  FLIP.set(RIGHT_GIFT.id, GIFTS[1].t0 + 0.9);
  // the sweep: a window turns as the quill passes over it (in screen space, in that shot's framing)
  const rest: Win[] = [];
  ALL_WINS.forEach((w) => {
    if (FLIP.has(w.id) || RESERVED.has(w.id)) return;
    const p = project(AA, K[w.row], w.x + w.w / 2, w.y);
    if (p.x > 30 && p.x < 1890 && p.y > 0 && p.y < 1080) FLIP.set(w.id, lerp(QUILL_SWEEP[0], QUILL_SWEEP[1], (p.x + 120) / 2160) + seeded(w.id) * 0.06);
    else rest.push(w);
  });
  const swells = [Q.long2, Q.long3, Q.last];
  rest.forEach((w, i) => FLIP.set(w.id, swells[i % 3] + Math.max(0, Math.min(1, (w.x + 300) / 2500)) * 0.5 + seeded(w.id + 9) * 0.08));
})();
const HOUSE_FLIP = new Map<House, number>();
(['back', 'mid', 'front'] as const).forEach((row) => TOWN[row].houses.forEach((h) => {
  HOUSE_FLIP.set(h, Math.min(...TOWN[row].wins.filter((w) => w.house === h.id).map((w) => FLIP.get(w.id) ?? 999)));
}));
HOUSE_FLIP.set(DATA, Q.data2);               // the watched house takes its colour when its window relights

// ---------- the quill's path ----------
type Pose = { x: number; y: number; angle: number; len: number; o: number };
/** Inside the top room (tower layer, world units), until it breaks out. */
const quillInRoom = (t: number): Pose | null => {
  if (t >= Q.control + 0.02) return null;
  const L = lantern(t);
  const rest = { x: L.x - 22, y: L.y + 26, angle: 182 };
  const bob = Math.sin(t * 2.3) * 2.5;
  const hover = { x: L.x + 4, y: L.y + 18 + bob, angle: 112 + Math.sin(t * 1.4) * 4 };
  const lift = r(t, Q.something, Q.wonderful + 0.3, EASE_IN_OUT);
  let p = { x: lerp(rest.x, hover.x, lift), y: lerp(rest.y, hover.y, lift), angle: lerp(rest.angle, hover.angle, lift) };
  // writing a line by itself on "artificial intelligence"
  const w0 = Q.artificial - 0.2, w1 = Q.intelligenceEnd + 0.15;
  const into = r(t, w0 - 0.25, w0, EASE_IN_OUT) * (1 - r(t, w1, w1 + 0.35, EASE_IN_OUT));
  if (into > 0) {
    const u = r(t, w0, w1, LIN);
    const n = writePt(L, u);
    p = { x: lerp(p.x, n.x, into), y: lerp(p.y, n.y, into), angle: lerp(p.angle, 108 + Math.sin(u * 40) * 6, into) };
  }
  // rattling the cage in their excitement, then pressing against the bars
  const rattle = band(t, Q.excitement, Q.beyond + 0.1, 0.2, 0.2);
  p.x += Math.sin(t * 38) * 2.2 * rattle;
  const press = r(t, Q.beyond, Q.control, EASE_IN);
  p = { x: lerp(p.x, L.x, press), y: lerp(p.y, L.y + 4, press), angle: lerp(p.angle, 125, press) };
  return { ...p, len: 58 * (1 + 0.25 * press), o: 1 };
};
/** a cursive line on the parchment (tower world units), u 0..1 */
const writePt = (L: { x: number; y: number }, u: number) => ({ x: L.x - 26 + 50 * u + Math.sin(u * 44) * 2.4, y: L.y + 31 + Math.cos(u * 44) * 2.6 - 1.5 * u });

/** Out in the world, in screen space (uses the camera of this frame). */
const quillFree = (t: number, cam: Cam): Pose | null => {
  if (t < Q.control + 0.02 || t > QUILL_SWEEP[1] + 0.25) return null;
  const front = (x: number, y: number) => project(cam, K.front, x, y);
  const hw = WIN(HERO), kw = WIN(KID);
  // world points around the hero's window
  const perch = (w: Win, dx = 0) => ({ x: w.x + w.w + 14 + dx, y: w.y - 24 + Math.sin(t * 2.4) * 3 });
  let P: { x: number; y: number }; let len = 40; let angle: number | null = null;
  const W = (p: { x: number; y: number }) => { const s = front(p.x, p.y); return { x: s.x, y: s.y, s: s.s }; };
  if (t < Q_ESCAPE_WIDE) {
    // bursting out of the lantern, down and toward us
    const L = lantern(t); const a = project(cam, K.towers, L.x, L.y + 4);
    const p = r(t, Q.control, Q_ESCAPE_WIDE, EASE_IN);
    return { x: a.x - 520 * p, y: a.y + 300 * p, angle: 150, len: 58 * a.s * (1 + 0.8 * p), o: 1 };
  }
  if (t < Q.aTool) {
    // the big swoop down into the town (wide shot): an S from the tower to the hero's house
    const L = lantern(t); const a = project(cam, K.towers, L.x - 40, L.y + 20);
    const b = W(perch(hw));
    const u = SMOOTH(r(t, Q_ESCAPE_WIDE, Q.aTool, LIN));
    const c1 = { x: a.x - 520, y: a.y + 260 }, c2 = { x: b.x + 520, y: b.y - 380 };
    const bz = (v: number) => {
      const m = 1 - v;
      return { x: m * m * m * a.x + 3 * m * m * v * c1.x + 3 * m * v * v * c2.x + v * v * v * b.x, y: m * m * m * a.y + 3 * m * m * v * c1.y + 3 * m * v * v * c2.y + v * v * v * b.y };
    };
    P = bz(u); const n = bz(Math.min(1, u + 0.02));
    angle = (Math.atan2(n.y - P.y, n.x - P.x) * 180) / Math.PI;
    return { x: P.x, y: P.y, angle: angle ?? 120, len: 150, o: 1 };
  }
  if (t < Q.while - 0.6) {
    // arriving from above, then sketching on "make software", then the request on "asks"
    const arrive = r(t, Q.aTool, Q.aTool + 0.45, EASE_OUT);
    const from = { x: hw.x - 160, y: hw.y - 260 };
    let wp = { x: lerp(from.x, perch(hw).x, arrive), y: lerp(from.y, perch(hw).y, arrive) };
    let ang = lerp(60, 115, arrive);
    // the sketch: a zigzag over the glass
    const s0 = Q.make, s1 = Q.softwareEnd + 0.5;
    const sk = band(t, s0 - 0.15, s1 + 0.2, 0.15, 0.2);
    if (sk > 0) {
      const u = r(t, s0, s1, LIN);
      const zx = hw.x + hw.w * (0.1 + 0.8 * u), zy = hw.y + hw.h * (0.25 + 0.5 * Math.abs(((u * 5) % 2) - 1));
      wp = { x: lerp(wp.x, zx, sk), y: lerp(wp.y, zy, sk) }; ang = lerp(ang, 112, sk);
    }
    // listening: it turns toward the villager on "who"
    const listen = band(t, Q.who - 0.1, Q.asks + 0.05, 0.2, 0.1);
    ang += 40 * listen;
    // on "asks" it sweeps across the window once, and the app is written
    const sw = band(t, Q.asks - 0.05, Q.asks + 0.45, 0.06, 0.12);
    if (sw > 0) {
      const u = r(t, Q.asks, Q.asks + 0.35, EASE_IN_OUT);
      wp = { x: lerp(wp.x, hw.x + hw.w * (0.05 + 0.9 * u), sw), y: lerp(wp.y, hw.y + hw.h * 0.5, sw) };
    }
    // during the hand-off it waits up on the roof edge, out of the way
    const wait = r(t, Q.andSo, Q.andSo + 0.5, EASE_IN_OUT);
    wp = { x: lerp(wp.x, hw.x + hw.w + 30, wait), y: lerp(wp.y, hw.y - 70 + Math.sin(t * 2.4) * 3, wait) };
    const s = W(wp);
    return { x: s.x, y: s.y, angle: ang, len: len * s.s, o: 1 };
  }
  if (t < Q.we) {
    // to the kid's window, then a sweep on "while"
    const go = r(t, Q.while - 0.6, Q.while - 0.05, EASE_IN_OUT);
    const a = { x: hw.x + hw.w + 30, y: hw.y - 70 }, b = perch(kw, -kw.w - 40);
    let wp = { x: lerp(a.x, b.x, go), y: lerp(a.y, b.y, go) - Math.sin(go * Math.PI) * 50 };
    const sw = band(t, Q.while - 0.05, Q.while + 0.5, 0.06, 0.15);
    if (sw > 0) {
      const u = r(t, Q.while, Q.while + 0.35, EASE_IN_OUT);
      wp = { x: lerp(wp.x, kw.x + kw.w * (0.05 + 0.9 * u), sw), y: lerp(wp.y, kw.y + kw.h * 0.5, sw) };
    }
    const lift = r(t, Q.while + 0.5, Q.we, EASE_IN);
    wp = { x: wp.x + 200 * lift, y: wp.y - 260 * lift };
    const s = W(wp);
    return { x: s.x, y: s.y, angle: 112 - 60 * lift, len: len * s.s, o: 1 };
  }
  // the run across the whole town on "we get to decide", in screen space (the shot is held still)
  const u = r(t, QUILL_SWEEP[0], QUILL_SWEEP[1], LIN);
  const x = -120 + 2160 * u, y = 600 - 170 * Math.sin(u * Math.PI) + 40 * Math.sin(u * Math.PI * 4);
  const y2 = 600 - 170 * Math.sin((u + 0.01) * Math.PI) + 40 * Math.sin((u + 0.01) * Math.PI * 4);
  return { x, y, angle: (Math.atan2(y2 - y, 21.6) * 180) / Math.PI, len: 88, o: t < QUILL_SWEEP[0] ? 0 : 1 };
};

// ---------- type ----------
// WHY one place for every word on screen: lower left, on the 8% margins, fixed width, DM Sans 900.
const SPOT = { left: '8%', bottom: '11%', width: '62%' } as const;
/** A headline stays fully readable for 1.2 s + 0.25 s per word after its last word has landed. */
const holdFull = (words: HWord[], wanted = 0) => Math.max(wanted, words[words.length - 1].at + 0.42 + 1.2 + 0.25 * words.length + 0.4);

type HWord = { text: string; at: number; accent?: boolean };
/** A headline whose words arrive exactly as they are spoken (DM Sans 900, lowercase, one purple word). */
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

const FINAL_OUT = END_CARD + 0.1;                     // WHY: it fades on the lavender dip, as the logo arrives
const FINAL: HWord[] = [{ text: 'open', at: Q.open }, { text: 'source', at: Q.source }, { text: 'everything.', at: Q.everything, accent: true }];
const HEADLINES: { words: HWord[]; out: number }[] = [
  { words: [{ text: 'own', at: Q.own }, { text: 'nothing.', at: Q.nothing, accent: true }] },
  { words: [{ text: 'something', at: Q.something }, { text: 'wonderful', at: Q.wonderful, accent: true }, { text: 'happened.', at: Q.happened }] },
  { words: [{ text: 'for', at: Q.forAnyone }, { text: 'anyone', at: Q.anyone, accent: true }, { text: 'who', at: Q.who }, { text: 'asks.', at: Q.asks }] },
].map((h) => ({ ...h, out: holdFull(h.words) }));
// the captions stop where the closing headline begins ("open source everything.")
const CAPS = captions(WORDS.indexOf(cueWord('open', '*open source everything')), Q.open - 0.2);
const FIRST_DAY_CAP = CAPS.find((c) => dawnAt(c.at) > 0.5)?.at ?? 99;
const CAP_TONE = (t: number) => r(t, FIRST_DAY_CAP - 0.5, FIRST_DAY_CAP, EASE_IN_OUT);

/** A soft scrim behind the type spot: plum at night, lavender by morning. Wide and feathered, so it reads
 *  as the corner of the page dimming, never as a box. `strong` is the muted version's deeper band. */
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

/** The muted version's captions: the whole script, one sentence at a time, in the type spot. */
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
      <filter id="t1paper"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.35" numOctaves="3" seed="4" /><feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.6  0 0 0 1.2 -0.3" /></filter>
      <rect width="100%" height="100%" filter="url(#t1paper)" />
    </svg>
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.14 }}>
      <filter id="t1grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(frame / 2) % 50} /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#t1grain)" />
    </svg>
  </AbsoluteFill>
);

const FLAG = '#D25AA0';                                // the towers' colour: their flags and the pennants they plant

// ---------- the film ----------
export const Take1: React.FC<{ narrator?: boolean }> = ({ narrator = true }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);
  const dawn = dawnAt(t);
  const pal = palette(dawn);
  const front = (x: number, y: number) => project(cam, K.front, x, y);

  // --- the towers' windows ---
  const flare = Math.min(r(t, Q.blinded, Q.blinded + 0.4), 1 - r(t, Q.hubris + 0.6, Q.these, EASE_IN_OUT));
  const excited = band(t, Q.excitement, Q.beyond, 0.3, 0.4);
  const pulse = Math.sin(r(t, Q.dictated - 0.05, Q.dictated + 0.4, LIN) * Math.PI);
  const gold = band(t, Q.shareholder - 0.05, Q.but + 0.2, 0.3, 0.5);
  const towerLit = (v: number, i: number) => {
    let L = 0.45 + 0.55 * r(t, Q.corporations + v * 0.8, Q.corporations + v * 0.8 + 0.35);
    L += 0.6 * pulse + 0.7 * flare * (0.7 + 0.3 * seeded(i * 7));
    L *= 1 - 0.45 * excited * (0.5 + 0.5 * Math.sin(t * 11 + i * 2.3));
    return L;
  };
  const crack = r(t, Q.foundation, Q.monopolies1 + 0.4, EASE_OUT);

  // --- the town's windows ---
  const dataW = WIN(DATA), heroW = WIN(HERO);
  const dc = WC(DATA);
  const winState = (w: Win): WinLook => {
    // lamp-lit at first, a little uneven; dimmed on "nothing"; out one by one through "convenience"
    let b = 0.65 + 0.35 * seeded(w.id);
    b -= 0.3 * r(t, Q.nothing + seeded(w.id) * 0.6, Q.nothing + seeded(w.id) * 0.6 + 0.4, EASE_IN_OUT);
    const d = Math.hypot(w.x - dc.x, (w.y - dc.y) * 2);
    const outAt = Q.convenience + 0.1 + Math.min(1, d / 900) * 0.95;
    b = lerp(b, 0.05, r(t, outAt, outAt + 0.2));
    b = Math.max(b, dawn);
    // every window to the same dull panel on "dictated"; the hero's lights first, when they tap it
    let grey = r(t, Q.dictated, Q.dictated + 0.12, EASE_OUT);
    if (w.id === heroW.id) grey = Math.max(grey, r(t, 0.85, 1.0));
    if (w.id === dataW.id && sitterO(t) > 0) grey = 0;
    const ft = FLIP.get(w.id) ?? 999;
    const look: WinLook = { b, grey, flip: Math.max(0, Math.min(1, (t - ft) / 0.42)) };
    if (w.id === heroW.id) look.sketch = r(t, Q.make, Q.softwareEnd + 0.5, LIN);
    if (w.id === WIN(NEIGH).id) look.layout = APP.recipe;
    if (w.id === dataW.id) look.flip = Math.max(0, Math.min(1, (t - ft) / 0.42));
    return look;
  };
  const houseLit = (h: House) => { const ft = HOUSE_FLIP.get(h) ?? 999; return r(t, ft, ft + 0.9, EASE_IN_OUT); };
  const townGlow = ALL_WINS.reduce((n, w) => n + (t >= (FLIP.get(w.id) ?? 999) ? 1 : 0), 0) / ALL_WINS.length;

  // --- the watched house: someone at home ---
  const sitterWarm = (() => {
    if (t < Q.however + 0.2) return Math.min(1 - r(t, Q.personal, Q.personal + 0.45, EASE_IN_OUT) * (t < Q.andThat - 0.1 ? 1 : 0),
      1 - r(t, Q.convenience + 0.75, Q.however, EASE_IN_OUT));
    return r(t, Q.data2 - 0.25, Q.data2 + 0.25, EASE_OUT);
  })();
  const inside = (w: Win) => (w.id === dataW.id && sitterO(t) > 0
    ? <Sitter x={w.x} y={w.y} w={w.w} h={w.h} t={t} o={1} warm={sitterWarm} wave={band(t, Q.convenience - 0.05, Q.convenience + 1.0, 0.2, 0.3)} />
    : null);

  // --- doors and the villagers in them ---
  const doorOf = (h: House) => {
    if (!h.big) return 0;
    const finale = r(t, Q.itsTime2 + (h.x % 300) / 900, Q.itsTime2 + (h.x % 300) / 900 + 0.35, EASE_OUT);
    const accept = band(t, Q.andWeAll + (h.x % 200) / 900, Q.acceptedIt + 0.45, 0.3, 0.35);
    let o = Math.max(finale, accept);
    if (h === HERO) o = Math.max(o, 1 - r(t, Q.corporations - 0.3, Q.corporations, EASE_IN_OUT), r(t, Q.aTool + 0.1, Q.aTool + 0.4));
    if (h === NEIGH) o = Math.max(o, r(t, Q.andSo - 0.1, Q.andSo + 0.25));
    if (h === KID) o = Math.max(o, r(t, Q.inA - 0.1, Q.inA + 0.25));
    if (h === LOCK) o = Math.max(o, r(t, Q.can, Q.can + 0.3));
    if (h === COIN) o = Math.max(o, r(t, Q.costs - 0.05, Q.costs + 0.2));
    if (h === DATA) o = Math.max(o, r(t, Q.free, Q.free + 0.3));
    return o;
  };
  const porch = (h: House) => {
    const who = COATS[h.id]; if (!who) return null;
    const o = r(doorOf(h), 0.45, 0.9, LIN);
    if (o <= 0) return null;
    const { ht } = doorSize(h);
    const x = h.doorX + (h === HERO || h === NEIGH ? 10 : 4);
    let reach = 0, shrug = 0, wave = 0; let dir: 1 | -1 = 1;
    shrug = band(t, Q.justAccepted - 0.05, Q.acceptedIt + 0.25, 0.2, 0.2);
    if (h === HERO) {
      reach = Math.max(band(t, 0.45, 1.5, 0.35, 0.4), band(t, Q.andSo + 0.05, Q.andSo + 0.9, 0.25, 0.3));
      wave = band(t, Q.asks + 0.45, Q.andSo, 0.25, 0.25);
    }
    if (h === NEIGH) { dir = -1; reach = band(t, Q.andSo + 0.4, Q.first + 0.2, 0.25, 0.3); wave = band(t, Q.first + 0.35, Q.inA + 0.6, 0.25, 0.3); }
    if (h === KID) wave = band(t, Q.while + 0.45, Q.we, 0.2, 0.2);
    if (h === LOCK) wave = band(t, Q.can + 0.4, Q.what2, 0.25, 0.2);
    if (t > Q.itsTime2) wave = Math.max(wave, band(t, Q.itsTime2 + 0.6 + seeded(h.id) * 0.8, 99, 0.3, 0.3) * 0.9);
    void ht;
    return <Villager x={x} y={h.base + 1} s={who.s} coat={who.coat} hair={who.hair} t={t + seeded(h.id) * 3} reach={reach} shrug={shrug} wave={wave} dir={dir} o={o} />;
  };

  // --- what the towers put on houses: a coin meter by every door, a pennant on every roof ---
  const meterOn = (h: House) => {
    if (h === COIN) return r(t, Q.whatCost - 0.05, Q.whatCost + 0.2, BACK_OUT);
    const d0 = Q.subscribe + Math.max(0, Math.min(1, (h.doorX - 300) / 1600)) * 1.0 + (h.row === 'mid' ? 0.15 : 0);
    return r(t, d0, d0 + 0.22, BACK_OUT);
  };
  const meterOff = (h: House) => (h === COIN ? r(t, Q.costs - 0.02, Q.costs + 0.5, EASE_IN) : r(t, Q.free + seeded(h.id) * 0.4, Q.free + seeded(h.id) * 0.4 + 0.5, EASE_IN));
  const wallBits = (h: House) => {
    const bits: React.ReactNode[] = [];
    if (h.door && h.row !== 'back') {
      const { hw, ht } = doorSize(h);
      const sc = h.row === 'front' ? 1 : 0.8;
      const ticks = Math.max(0, t - Q.subscribe) * 2.2 + (h === COIN ? Math.max(0, t - Q.whatCost) * 3 : 0);
      const m = meterAt(h);
      bits.push(<CoinMeter key="m" x={m.x} y={m.y} s={m.s * sc} pop={meterOn(h)} tick={ticks} off={meterOff(h)} />);
      void hw; void ht;
    }
    if (h.row !== 'back') {
      const up = r(t, Q.own + Math.max(0, Math.min(1, (h.peak.x - 200) / 1700)) * 0.35, Q.own + Math.max(0, Math.min(1, (h.peak.x - 200) / 1700)) * 0.35 + 0.25, BACK_OUT);
      const fly = r(t, Q.free + seeded(h.id + 4) * 0.5, Q.free + seeded(h.id + 4) * 0.5 + 0.9, EASE_IN);
      bits.push(<Pennant key="p" x={h.peak.x} y={h.peak.y + 2} s={h.row === 'front' ? 1.5 : 1.0} up={up} fly={fly} t={t} c={FLAG} seed={h.id} />);
    }
    return bits;
  };

  // --- things drawn in the town's own space (front row world units) ---
  const town: React.ReactNode[] = [];
  // the padlock: dropped onto the window on "computers", sprung open on "computers can do"
  {
    const w = WIN(LOCK);
    const seat = { x: w.x + w.w / 2, y: w.y + w.h * 0.62 };
    const drop = r(t, Q.computers - 0.42, Q.computers, EASE_IN);
    const thud = Math.sin(r(t, Q.computers, Q.computers + 0.28, EASE_OUT) * Math.PI) * 0.1;
    const shut = r(t, Q.computers - 0.02, Q.computers + 0.08, EASE_IN);
    const pop = r(t, Q.computers2 - 0.08, Q.computers2 + 0.08, BACK_OUT);
    const fall = r(t, Q.computers2 + 0.1, Q.computers2 + 0.7, EASE_IN);
    if (drop > 0 && fall < 1) {
      town.push(<Padlock key="lock" x={seat.x + fall * 10} y={lerp(seat.y - 420, seat.y, drop) + fall * 160} size={w.w * 0.92}
        open={pop > 0 ? pop : 1 - shut} rot={fall * 30} o={1 - r(t, Q.computers2 + 0.45, Q.computers2 + 0.7)} squash={thud} />);
    }
  }
  // coins: from the window into the meter on "cost"; out of the torn-off meter, back through the door, on "costs"
  {
    const w = WIN(COIN), h = COIN; const { ht } = doorSize(h);
    const mm = meterAt(h); const meter = { x: mm.x, y: mm.y - 12 * mm.s };
    const win = { x: w.x + 8, y: w.y + w.h * 0.5 };
    const door = { x: h.doorX, y: h.base - ht * 0.45 };
    const hop = (a: { x: number; y: number }, b: { x: number; y: number }, t0: number, k: number, arc: number) => {
      const f = (t - t0) / 0.36; if (f < 0 || f >= 1) return;
      const e = EASE_IN_OUT(f);
      town.push(<Coin key={`c${t0}`} x={lerp(a.x, b.x, e)} y={lerp(a.y, b.y, e) - Math.sin(f * Math.PI) * arc} r={9} spin={f * 1.3 + k * 0.2} o={1 - r(f, 0.85, 1)} />);
    };
    [-0.3, -0.12, 0.06, 0.24].forEach((d, k) => hop(win, meter, Q.cost + d, k, 26));
    [0, 0.1, 0.2, 0.3, 0.4].forEach((d, k) => hop(meter, door, Q.costs + 0.12 + d, k, 34));
  }
  // the speech bubbles: the hero's recipe, the kid's drawing; in the town's ask, everyone's
  {
    const bub = (h: House, layout: number, a: number, b: number, side: 1 | -1 = 1) => {
      const who = COATS[h.id]; const pop = band(t, a, b, 0.3, 0.25);
      if (pop <= 0) return;
      const p = r(t, a, a + 0.35, BACK_OUT) * (1 - r(t, b - 0.25, b, EASE_IN));
      const x = h.doorX + (h === HERO ? 10 : 4) + side * 8, y = h.base - 40 * who.s;
      town.push(<Bubble key={`b${h.id}`} x={x} y={y} s={1.05} pop={p} layout={layout} c={WIN(h).theme} side={side} />);
    };
    bub(HERO, APP.recipe, Q.anyone - 0.05, Q.asks + 0.45, -1);
    bub(KID, APP.drawing, Q.very - 0.1, Q.while + 0.4, -1);
  }
  // the washing lines
  const line = (g: Gift, key: string) => {
    const t0 = g.t0, t1 = g.t0 + 0.8;
    const vis = band(t, t0 - 0.35, t1 + 0.7, 0.3, 0.35);
    if (vis <= 0) return;
    const leftToRight = g.to.x > g.from.x;
    const A = { x: leftToRight ? g.from.x + g.from.w + 2 : g.from.x - 2, y: g.from.y + 4 };
    const B = { x: leftToRight ? g.to.x - 2 : g.to.x + g.to.w + 2, y: g.to.y + 4 };
    const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + 16 };
    const draw = r(t, t0 - 0.35, t0, EASE_OUT);
    const q = (u: number) => ({ x: (1 - u) * (1 - u) * A.x + 2 * (1 - u) * u * M.x + u * u * B.x, y: (1 - u) * (1 - u) * A.y + 2 * (1 - u) * u * M.y + u * u * B.y });
    const u = r(t, t0, t1, EASE_IN_OUT);
    const c = q(u); const cw = Math.min(40, g.from.w * 0.5), ch = cw * 0.74;
    const fromTheme = g.from.theme;
    town.push(<g key={key} opacity={vis}>
      <path d={`M${A.x} ${A.y} Q${M.x} ${M.y} ${B.x} ${B.y}`} fill="none" stroke="#3A2850" strokeWidth={1.4} pathLength={1} strokeDasharray={`${draw} 1`} />
      {t > t0 - 0.05 && t < t1 + 0.15 && <g transform={`rotate(${Math.sin(t * 7) * 4} ${c.x} ${c.y})`} filter="url(#lift)">
        <AppWin x={c.x - cw / 2} y={c.y + 1} w={cw} h={ch} theme={fromTheme} layout={g.from.layout} t={t} seed={g.from.id} />
        <rect x={c.x - cw / 2} y={c.y + 1} width={cw} height={ch} rx={ch * 0.08} fill="none" stroke="#21152C" strokeWidth={1} />
        {[-0.3, 0.3].map((k) => <rect key={k} x={c.x + k * cw - 1.5} y={c.y - 3} width={3} height={7} rx={1} fill="#C9A06A" stroke="#21152C" strokeWidth={0.6} />)}
      </g>}
    </g>);
  };
  line(HERO_GIFT, 'g0'); GIFTS.forEach((g, i) => line(g, `g${i + 1}`));

  // --- the left tower's framed copy of the watched window ---
  const fr = frameAt(t);
  const framePop = r(t, Q.data - 0.05, Q.data + 0.3, BACK_OUT);
  const frameLit = 1 - r(t, Q.happens, Q.happens + 0.4, EASE_IN_OUT);

  // --- the spyglass, in the privacy shot ---
  let spy: React.ReactNode = null;
  if (t >= Q.andThat && t < Q.however) {
    const W = front(dc.x, dc.y);
    const P = { x: 2080, y: -170 };
    const ang = (Math.atan2(W.y - P.y, W.x - P.x) * 180) / Math.PI;
    const dist = Math.hypot(W.x - P.x, W.y - P.y);
    const ext = Math.min(r(t, Q.privacy - 0.15, Q.privacy + 0.35, BACK_OUT), 1 - r(t, Q.convenience + 0.7, Q.however - 0.05, EASE_IN_OUT));
    const s = (dist - dataW.w * W.s * 0.75) / 310;
    spy = <Spyglass x={P.x} y={P.y} angle={ang + Math.sin(t * 1.6) * 0.8} extend={ext} s={s} />;
  }

  // --- the top room, its desk, the quill and the bars of its cage ---
  const L0 = lantern(t);
  const roomWarm = Math.max(0.12 * band(t, Q.recently, Q.something + 0.2, 0.3, 0.1) * (0.6 + 0.4 * Math.sin(t * 9)), r(t, Q.something, Q.wonderful, EASE_IN_OUT));
  const roomC = mix(mix(pal.ink, pal.towerDark, 0.3), '#EBD6C2', roomWarm * (1 - r(t, Q.control, Q.control + 0.3)));
  const qr = quillInRoom(t);
  const writeU = r(t, Q.artificial - 0.2, Q.intelligenceEnd + 0.15, LIN);
  const inkPts: string[] = [];
  for (let k = 0; k <= 60 * writeU; k++) { const p = writePt(L0, k / 60); inkPts.push(`${p.x} ${p.y}`); }
  const room = (
    <g>
      {/* a writing desk and a sheet of parchment, an inkwell */}
      <rect x={L0.x - 44} y={L0.y + 44} width={88} height={12} fill={mix('#5A3B2E', pal.ink, 0.3)} />
      <path d={`M${L0.x - 34} ${L0.y + 44} L${L0.x - 28} ${L0.y + 22} L${L0.x + 28} ${L0.y + 22} L${L0.x + 34} ${L0.y + 44} Z`} fill={mix('#3A2A36', '#F6EBD6', roomWarm)} stroke="#21152C" strokeWidth={1} />
      <rect x={L0.x + 26} y={L0.y + 36} width={10} height={8} rx={2} fill="#21152C" />
      {inkPts.length > 1 && <path d={`M${inkPts.join(' L')}`} fill="none" stroke="#2A1B36" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />}
      {qr && <Quill x={qr.x} y={qr.y} angle={qr.angle} len={qr.len} flex={Math.sin(t * 3) * 0.6} />}
    </g>
  );
  const bars = [-33, -11, 11, 33].map((dx, i) => {
    const a = lerp(Q.created, Q.newTech, i / 3);
    const p = r(t, a, a + 0.35, BACK_OUT);
    if (p <= 0) return null;
    // WHY the middle bars bend: the quill tears free through them on "control"
    const bow = (i === 1 || i === 2) ? (i === 1 ? -1 : 1) * (8 * r(t, Q.beyond, Q.control, EASE_IN) + 38 * r(t, Q.control - 0.04, Q.control + 0.12, BACK_OUT)) : 0;
    const bx = L0.x + dx, by = L0.y + L0.h / 2;
    return <rect key={i} x={bx - 2} y={L0.y - L0.h / 2} width={4} height={L0.h * p} rx={2} fill={pal.towerDark} stroke={pal.rim} strokeWidth={0.8} strokeOpacity={0.7} transform={`rotate(${bow} ${bx} ${by})`} />;
  });

  const qf = quillFree(t, cam);
  const dayText = dawn > 0.55;
  // "However, recently…": the town holds its breath
  const hush = band(t, Q.however, Q.something + 0.3, 0.5, 0.6);

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile(narrator ? 'audio/take1-mix.wav' : 'audio/take1-type-mix.wav')} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <Defs frame={frame} />
        <defs>
          <filter id="lift" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1A0826" floodOpacity="0.45" /></filter>
        </defs>
        <g transform={layerTransform(cam, K.sky)}><SkyBack pal={pal} field={0.1 + 0.9 * Math.max(0, (dawn - 0.2) / 0.8)} /><Stars o={pal.stars} /><Moon o={pal.moon} /></g>
        <g transform={layerTransform(cam, K.cloud)}><Clouds t={t} pal={pal} /></g>
        <g transform={layerTransform(cam, K.hills2)}><Hills far pal={pal} /></g>
        <g transform={layerTransform(cam, K.hills)}><Hills pal={pal} /></g>
        <g transform={layerTransform(cam, K.towers)}>
          {TOWERS.map((d, i) => {
            const fold = foldOf(i, t);
            if (fold >= 1) return null;
            const g = growthOf(i, t);
            const bx = d.x;
            // WHY a fold, not a fade: the reviewer saw ghost towers still standing at "free ourselves";
            // a pop-up page folding down into the ground is the storybook way to end them
            return (
              <g key={i} transform={`translate(${bx} 945) skewX(${-fold * 14}) scale(1 ${1 - fold}) translate(${-bx} -945)`} opacity={1 - fold * fold * 0.4}>
                <Tower d={d} g={g} t={t} pal={pal} lit={towerLit} crack={crack} gold={gold} flagC={FLAG}
                  room={d.crown === 'lantern' ? roomC : undefined}
                  front={d.crown === 'lantern' ? <>{bars}</> : undefined}>
                  {d.crown === 'lantern' ? room : null}
                </Tower>
                {i === 0 && <FramedCopy x={fr.x} y={fr.y} w={fr.w} h={fr.h} t={t} pop={framePop} lit={frameLit} />}
                {/* the tallest tower's pennant whips on "value" */}
                {i === 2 && t > Q.shareholder - 0.2 && t < Q.but + 0.3 && (() => {
                  const G = towerGeo(d, g); const top = G.top - 52;
                  const whip = Math.sin(t * 16) * 9 * band(t, Q.value - 0.05, Q.value + 0.7, 0.05, 0.3);
                  return <path d={`M${G.cx(G.top)} ${top - 34} Q${G.cx(G.top) + 40} ${top - 40 + whip} ${G.cx(G.top) + 72} ${top - 26 + whip * 1.4} Q${G.cx(G.top) + 36} ${top - 18 + whip * 0.5} ${G.cx(G.top)} ${top - 16} Z`} fill={FLAG} opacity={band(t, Q.value - 0.1, Q.but, 0.15, 0.3)} />;
                })()}
              </g>
            );
          })}
        </g>
        <g transform={layerTransform(cam, K.back)}><Row row="back" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} townGlow={townGlow} /></g>
        <g transform={layerTransform(cam, K.mid)}><Row row="mid" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} wall={wallBits} /></g>
        <g transform={layerTransform(cam, K.front)}>
          <Row row="front" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} inside={inside} door={doorOf} porch={porch} wall={wallBits} />
          {town}
        </g>
        <g transform={layerTransform(cam, K.fore)}><Foreground pal={pal} /></g>
        <Birds t={t} from={Q.free} o={r(t, Q.free, Q.free + 1)} />
        {spy}
        {qf && <Quill x={qf.x} y={qf.y} angle={qf.angle} len={qf.len} flex={Math.sin(t * 9) * 1.2} o={qf.o} />}
      </svg>
      <AbsoluteFill style={{ background: '#07030C', opacity: hush * 0.32 }} />
      <Grain frame={frame} dawn={dawn} />
      <Scrim o={narrator ? Math.max(...[...HEADLINES, { words: FINAL, out: FINAL_OUT }].map((h) => Math.min(r(t, h.words[0].at - 0.4, h.words[0].at), 1 - r(t, h.out, h.out + 0.4)))) : 1 - r(t, END_CARD - 0.4, END_CARD)} dawn={narrator ? dawn : CAP_TONE(t)} strong={!narrator} />
      {narrator ? HEADLINES.map((h, i) => <Headline key={i} words={h.words} out={h.out} t={t} day={false} />) : <Captions t={t} />}
      {/* WHY a dip to lavender and then the card: a cross-dissolve let the houses show through the logo;
          the morning sky is already this colour, so the dip is barely a step. The last headline stays over
          the dip, so it is readable for as long as the 2.5 s end card allows. */}
      <AbsoluteFill style={{ background: C.lavender, opacity: r(t, END_CARD - 0.4, END_CARD, EASE_IN_OUT) }} />
      {narrator && <Headline words={FINAL} out={FINAL_OUT} t={t} day={dayText} />}
      {t >= END_CARD && <EndCard at={END_CARD + 0.05} />}
    </AbsoluteFill>
  );
};

/** Whether the person at home is shown in the watched window: in their own shots, and once it relights. */
function sitterO(t: number) {
  return (t >= Q.andWhat - 0.05 && t < Q.andWeAll) || (t >= Q.andThat - 0.05 && t < Q.however + 0.3) || (t >= Q.withOur - 0.05 && t < Q.free + 0.35) ? 1 : 0;
}
