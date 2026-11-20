// Round two, take 1: the narrated fairytale. See docs/active/design/2026-11-19-campaign-round2/takes.md.
//
// The story in pictures (one hero, one magic object, one visual language of control):
//  - A night town where every window is a person's screen, lamp-lit amber. Three towers rule it. On
//    "dictated" each tower lowers a thin string into the windows below, left to right, and every screen it
//    touches turns to the same grey panel. The strings stay: they are how the towers rule.
//  - The towers decide three things, each a physical act on one house: a padlock slides down a string and
//    slams onto a window ("do"); a villager feeds a coin into a meter on her door ("cost"); a string lifts a
//    lit window clean out of its wall and reels it up to hang in a tower ("personal data"). Each is undone
//    on that same house in line 7, and the stolen window flies home and clicks back into its wall.
//  - Inside the tallest tower's top room the lords (only long dark sleeves) set down an enchanted quill
//    (the fable's AI). It writes by itself; they shove it aside and hoist one framed chart; they grab it; it
//    slips their grip and flies out over the rooftops (the film's one fast camera move) to one villager.
//  - "For anyone who asks": she asks, the quill writes it, her string snaps, and the camera pulls back as
//    neighbours follow. On "free ourselves" every string snaps and the towers sink away like stage flats.
//
// WHY every time below is a phrase: cues are read from the narrator's word timings (take1-words.ts), so
// pictures land on the syllable they illustrate, and a re-recorded script re-times the film by itself.
import React from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, useU } from '../kit';
import { E, T, WORDS, captions, cueWord } from './take1-words';
import { APP, AppWin, THEMES } from './take1-apps';
import { Bubble, CoinMeter, Coin, FramedCopy, Padlock, Pennant, Quill, Sitter, Spyglass, Villager } from './take1-props';
import { HandPose, Prize, Room, RoomState, inkPt } from './take1-room';
import {
  ALL_WINS, Birds, CX, CY, Cam, Clouds, Defs, FRONT, Foreground, Hills, House, K, Moon, Row, SkyBack, Stars,
  TOWERS, TOWER_BASE, TOWN, Tower, Win, WinLook, aim, doorSize, layerTransform, mix, palette, project, towerGeo,
} from './take1-scene';

// ---------- small timing helpers ----------
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0→1 between two times (seconds). */
const r = (t: number, a: number, b: number, e: (x: number) => number = EASE_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const BACK_OUT = Easing.bezier(0.34, 1.56, 0.64, 1);
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);
const SLOW_OUT = Easing.bezier(0.35, 0.05, 0.15, 1);      // the opening pull-back: an eased start, a long settle
const WHIP = Easing.bezier(0.7, 0, 0.2, 1);              // the whip-pan: a held breath, then all at once
const LIN = (x: number) => x;
const seeded = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** on between a and b, with soft edges */
const band = (t: number, a: number, b: number, fi = 0.25, fo = 0.25) => Math.min(r(t, a, a + fi, EASE_IN_OUT), 1 - r(t, b - fo, b, EASE_IN_OUT));
/** A landing's spring: 1 on impact, a quick rebound, gone in about 0.2 s. WHY: every heavy thing in the
 *  film (padlock, coin, treasure, the window clicking home) lands with the same 2-3 frame squash. */
const spring = (dt: number) => (dt < 0 || dt > 0.3 ? 0 : Math.exp(-dt * 22) * Math.cos(dt * 48));
type P2 = { x: number; y: number };

// ---------- the cues ----------
// WHY one table, each with a name and a short phrase: when a new recording arrives, any cue whose phrase
// was reworded fails with its name in the error, and is fixed here in one line.
const Q = {
  corporations: T('corporations', 'handful of *corporations'),
  dictated: T('dictated', 'have *dictated'),
  theyDecided: T('theyDecided', '*they decided'),
  computers: T('computers', 'your *computers could'),
  do: T('do', 'could *do'),
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
  something: T('something', '*something truly'),
  wonderful: T('wonderful', 'truly *wonderful'),
  happened: T('happened', 'wonderful *happened'),
  blinded: T('blinded', 'blinded'),
  ownHubris: T('ownHubris', 'their *own hubris'),
  hubris: T('hubris', 'hubris'),
  these: T('these', '*these corporations'),
  created: T('created', 'corporations *created'),
  newTech: T('newTech', 'kind of *technology'),
  artificial: T('artificial', 'artificial intelligence'),
  intelligenceEnd: E('intelligenceEnd', 'artificial *intelligence'),
  aTechnology: T('aTechnology', '*a technology they'),
  great: T('great', 'a *great treasure'),
  treasure: T('treasure', 'great *treasure'),
  shareholder: T('shareholder', 'shareholder value'),
  shareholderEnd: E('shareholderEnd', 'shareholder value'),
  value: T('value', 'shareholder *value'),
  valueEnd: E('valueEnd', 'shareholder *value'),
  but: T('but', '*but in their'),
  excitement: T('excitement', 'their *excitement'),
  something2: T('something2', 'created *something far'),
  far: T('far', '*far beyond'),
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
// The ending, all counted from the END of the spoken "everything." (reviewer, round 4: the headline was still
// up when the card faded in, a double exposure at the brand moment). WHY these numbers: the headline holds
// 0.45 s after the voice stops, fades over 8 frames, and the card starts 4 frames after it is fully gone, so
// no frame ever shows both; that leaves the card about 2.6 s, and the film still ends at exactly 75 s.
const FINAL_FADE = [Q.everythingEnd + 0.45, Q.everythingEnd + 0.45 + 8 / FPS] as const;
const END_CARD = FINAL_FADE[1] + 4 / FPS;
if (END_CARD > 72.5) throw new Error('take1: the end card would hold under 2.5 s; the narration ends too late');
// WHY the dip starts on "everything" itself: the reviewer found the purple word hard to read over the busy
// pastel houses, and a blank lilac frame after it looked like a rendering gap. Now the town dips to the
// end card's own lavender as the word lands; the headline stays put on clean ground until the logo comes.
const DIP = [Q.everything + 0.6, Q.everything + 1.15] as const;

// ---------- night to morning ----------
// WHY: night until the quill escapes; light comes with the asking; morning pours in as the towers sink.
const DAWN_KEYS: [number, number][] = [
  [0, 0], [Q.control, 0], [Q.asks + 0.6, 0.25], [Q.decideEnd, 0.5], [Q.free, 0.55], [Q.pastEnd + 0.3, 0.88], [Q.everything, 1], [99, 1],
];
const dawnAt = (t: number) => {
  let i = 0; while (i < DAWN_KEYS.length - 2 && t >= DAWN_KEYS[i + 1][0]) i++;
  const [t0, a] = DAWN_KEYS[i], [t1, b] = DAWN_KEYS[i + 1];
  return lerp(a, b, SMOOTH(c01((t - t0) / (t1 - t0))));
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
/** The camera that puts world point (x, y) of layer k at screen point (sx, sy). */
const place = (k: number, x: number, y: number, z: number, sx: number, sy: number): Cam => {
  const s = 1 + (z - 1) * k;
  const lx = x - (sx - CX) / s, ly = y - (sy - CY) / s;
  return { cx: CX + (lx - CX) / k, cy: CY + (ly - CY) / k, z };
};
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
LEFT_GIFT.layout = APP.album; RIGHT_GIFT.layout = APP.setlist;
const COATS: Record<number, { coat: string; hair: number; s: number }> = {
  [DATA.id]: { coat: '#B9506F', hair: 1, s: 1.2 }, [LOCK.id]: { coat: '#4F8A57', hair: 0, s: 1.22 },
  [HERO.id]: { coat: '#D9693A', hair: 1, s: 1.25 }, [NEIGH.id]: { coat: '#3F7DA3', hair: 0, s: 1.24 },
  [KID.id]: { coat: '#C08B1C', hair: 1, s: 0.92 }, [COIN.id]: { coat: '#6157C2', hair: 0, s: 1.2 },
};

/** Where a house's coin meter hangs. WHY above the door on picture houses: beside it, it covered the window.
 *  WHY bigger on the coin house: it is the subject of its own shot and must read on a phone. */
const meterAt = (h: House) => {
  const { hw, ht } = doorSize(h);
  if (h === COIN) return { x: h.doorX, y: h.base - ht - hw - 26, s: 2.0 };
  return h.big ? { x: h.doorX, y: h.base - ht - hw - 19, s: 1.35 } : { x: h.doorX + hw + 11 * (h.row === 'front' ? 1 : 0.8), y: h.base - ht * 0.62, s: 1 };
};

// ---------- the towers ----------
// They swell on "hubris"; on "free ourselves" each sinks out of sight like a stage flat, 6 frames apart.
const growthOf = (_i: number, t: number) => 1 + 0.1 * r(t, Q.hubris, Q.hubris + 0.45, BACK_OUT);
const SINK_ORDER = [2, 1, 0];
const sinkAt = (i: number) => Q.free + 0.15 + SINK_ORDER.indexOf(i) * 0.2;
/** How far a tower has dropped (world units, tower layer). WHY a small rise first: weight. A flat that
 *  simply slides away looks like a fade; a hitch up, then a fall that accelerates, looks like it is let go. */
const sinkY = (i: number, t: number) => {
  const a = sinkAt(i);
  return -14 * Math.sin(Math.PI * r(t, a - 0.2, a + 0.05, LIN)) + 1100 * r(t, a, a + 1.0, EASE_IN);
};
const lantern = (t: number) => { const L = towerGeo(TOWERS[1], growthOf(1, t)).lantern; return { ...L, y: L.y + sinkY(1, t) }; };
const aimLantern = (t: number, z: number, dy = 0): Cam => { const L = lantern(t); return aim(K.towers, L.x, L.y + dy, z); };
// The framed window in the left tower: on the tower face, high up.
const frameAt = (t: number) => {
  const g = towerGeo(TOWERS[0], growthOf(0, t));
  const y = g.base - (g.base - g.top) * 0.6;
  return { x: g.cx(y) - 30, y: y - 23 + sinkY(0, t), w: 60, h: 46 };
};

// ---------- the stolen window's two journeys ----------
// "your personal data": the string goes taut, the lit window pops out of the wall and is reeled up to the
// left tower, where it hangs as a gilt-framed picture. "what happens with our data": it drops back down and
// clicks into its own wall. WHY one object making the round trip: the old cut showed a framed picture in a
// tower with no cause, and viewers could not tell it was her window.
const LIFT = { taut: Q.personal, pop: Q.personal + 0.14, reel: Q.personal + 0.28, arrive: Q.data + 0.72 };
const HOME = { unhook: Q.happens, fall: Q.happens + 0.16, land: Q.data2 };
/** The camera that frames two points on two layers: `a` (layer ka) at screen (sax, say) and `b` (layer kb)
 *  at screen height sby. WHY solved, not typed: the stolen window's flight runs from the tower's face to the
 *  house wall, and this keeps both ends in the shot at the largest size that fits. */
const frameTwo = (ka: number, a: P2, kb: number, b: P2, sax: number, say: number, sby: number): Cam => {
  let best: Cam = place(ka, a.x, a.y, 1, sax, say); let err = 1e9;
  for (let z = 1; z <= 3.5; z += 0.01) {
    const c = place(ka, a.x, a.y, z, sax, say);
    const e = Math.abs(project(c, kb, b.x, b.y).y - sby);
    if (e < err) { err = e; best = c; }
  }
  return best;
};
const DATA_WIDE: Cam = (() => { const f = frameAt(0); return frameTwo(K.towers, { x: f.x + f.w / 2, y: f.y - 30 }, 1, WC(DATA), 820, 200, 830); })();

// ---------- the camera ----------
// [time, camera, cut?, easing]. A key marked cut is a hard cut on that word; between keys the camera eases
// (with the easing on the key it travels to).
type Key = [number, Cam, boolean?, ((x: number) => number)?];
const AA: Cam = { cx: 980, cy: 690, z: 1.15 };           // "we get to decide": the whole town
const AA_LOW: Cam = { cx: 980, cy: 850, z: 1.2 };        // the end of the pull-back, framed low (see below)
// when "for anyone who asks." leaves: 1.2 s + 0.25 s a word after "asks" has landed, plus a breath
const ASKS_OUT = Q.asks + 0.42 + 1.2 + 0.25 * 4 + 0.4;
const OPEN_WIDE: Cam = { cx: 990, cy: 600, z: 1.12 };    // towers over the town: "dictated" plays here
// WHY this framing for "something wonderful happened": lantern far upper right, so the headline's lower-left
// corner is open sky and hills instead of a tower body (reviewer, round 3)
const L0 = towerGeo(TOWERS[1], 1).lantern;
const WONDER: Cam = place(K.towers, L0.x, L0.y, 1.2, 1660, 330);
const WONDER2: Cam = place(K.towers, L0.x, L0.y, 1.36, 1660, 330);
const ESCAPE: Cam = place(K.towers, L0.x, L0.y, 1.18, 1180, 250);   // the quill breaks out, seen from the town
const WHIP_AT = Q.aTool - 0.55;
// WHY the cut to the towers waits for "own" (not "Blinded"): the headline "something wonderful happened." needs
// its full hold, and it must leave WITH the lantern shot, never sit over the busy town (reviewer, round 4).
// The towers' windows flare on "Blinded" inside the lantern shot, so the word still has its picture.
const BLIND_CUT = Q.ownHubris;
const CAM_KEYS: Key[] = [
  // 1. one move: from her lit window and face, back and up until the towers loom over the roofs
  [0, at(HERO, -34, -4, 4.4), true],
  [0.3, at(HERO, -34, -4, 4.35)],
  [Q.dictated - 0.15, OPEN_WIDE, false, SLOW_OUT],
  [Q.theyDecided - 0.01, { cx: 995, cy: 625, z: 1.18 }],
  // 2. the three decisions, each a physical act on its own house
  [Q.theyDecided, at(LOCK, 0, -60, 2.8), true],
  [Q.whatCost - 0.01, at(LOCK, 0, -50, 3.0)],
  [Q.whatCost, at(COIN, -50, -30, 2.9), true],
  [Q.andWhat - 0.01, at(COIN, -46, -30, 3.05)],
  [Q.andWhat, at(DATA, 0, -8, 3.3), true],
  [LIFT.reel, at(DATA, 0, -14, 3.45)],
  // follow the stolen window up to the tower
  [LIFT.arrive + 0.05, DATA_WIDE, false, SMOOTH],
  [Q.andWeAll - 0.01, { ...DATA_WIDE, z: DATA_WIDE.z * 1.02 }],
  // 3. the villagers shrug and go back in; meters on every door; pennants on every roof
  [Q.andWeAll, aim(1, 1225, 925, 2.05), true],
  [Q.weAccepted - 0.01, aim(1, 1205, 925, 2.15)],
  [Q.weAccepted, aim(1, 1270, 880, 2.0), true],
  [Q.andThat - 0.01, aim(1, 1250, 864, 1.9)],
  // the privacy line: her window from outside, a spyglass creeping in from the dark
  [Q.andThat, at(HERO, 120, -8, 2.55), true],
  [Q.however - 0.01, at(HERO, 100, -8, 2.85)],
  // the hush: the sleeping town; then far up, a light kindles in the tallest tower
  [Q.however, { cx: 980, cy: 560, z: 1.05 }, true],
  [Q.something - 0.01, { cx: 980, cy: 555, z: 1.07 }],
  [Q.something, WONDER, true],
  [BLIND_CUT - 0.01, WONDER2],
  // hubris: a low look up at the towers as they swell
  [BLIND_CUT, aim(K.towers, 1010, 600, 1.5), true],
  [Q.these - 0.01, aim(K.towers, 1010, 560, 1.42)],
  // (the top room, inside, plays from "these corporations" to "far": see roomAt)
  [Q.far, ESCAPE, true],
  [WHIP_AT, { ...ESCAPE, cy: ESCAPE.cy + 90, z: ESCAPE.z * 1.05 }, false, EASE_IN_OUT],
  // the whip-pan: the only fast camera move in the film, following the quill down to her window
  [Q.aTool, at(HERO, -20, 10, 3.0), false, WHIP],
  [Q.theEver - 0.01, at(HERO, -15, 8, 3.25)],
  // "the ever-scarce foundation of these monopolies": their stone cracks
  [Q.theEver, aim(K.towers, 1010, 560, 1.45), true],
  [Q.forAnyone - 0.01, aim(K.towers, 1010, 545, 1.55)],
  // "for anyone who asks": close on her; from "anyone" one long dolly back and up as her street follows
  [Q.forAnyone, at(HERO, -90, 22, 2.9), true],
  [Q.anyone, at(HERO, -86, 20, 2.92)],
  // WHY the dolly ends low, then tilts up: while "for anyone who asks." is up, the roofs and doors must stay
  // clear of the words (reviewer, round 4), so the pull-back keeps the street high in frame over calm ground;
  // once the words are gone the camera lifts to the whole town and its towers for "we get to decide"
  [ASKS_OUT + 0.1, AA_LOW, false, SMOOTH],
  [Q.what1 - 0.01, { ...AA, z: AA.z + 0.06 }, false, SMOOTH],
  // 7. each decision undone on its own house
  [Q.what1, at(LOCK, 0, -36, 2.9), true],
  [Q.what2 - 0.01, at(LOCK, 0, -36, 3.1)],
  [Q.what2, at(COIN, -45, -10, 3.0), true],
  [Q.andWhat2 - 0.01, at(COIN, -40, -10, 3.2)],
  // the stolen window comes home
  [Q.andWhat2, DATA_WIDE, true],
  [HOME.land + 0.1, { ...DATA_WIDE, z: DATA_WIDE.z * 1.03 }],
  [Q.itsTime - 0.01, at(DATA, 10, -20, 1.9), false, SMOOTH],
  // 8. "free ourselves": every string snaps, the towers sink, morning pours in
  [Q.itsTime, { cx: 990, cy: 560, z: 1.0 }, true],
  [Q.itsTime2 - 0.01, { cx: 985, cy: 720, z: 1.4 }, false, EASE_IN_OUT],
  // 9. along the street: neighbours hand each other what they made
  [Q.itsTime2, at(DATA, -120, 12, 2.5), true],
  [Q.long3 - 0.01, at(DATA, -70, 12, 2.6)],
  [Q.long3, at(COIN, 40, 12, 2.5), true],
  [Q.open - 0.01, at(COIN, 75, 12, 2.62)],
  // WHY a hard cut ON "open", then one slow drift: the old eased pull-back crossed the frame mid-phrase and
  // read as a jump under the building headline; now the last line builds over a single steady wide shot
  [Q.open, { cx: 1000, cy: 690, z: 1.34 }, true],
  [80, { cx: 1000, cy: 712, z: 1.24 }],
];
export const camAt = (t: number): Cam => {
  let i = 0;
  while (i < CAM_KEYS.length - 2 && t >= CAM_KEYS[i + 1][0]) i++;
  const [t0, a] = CAM_KEYS[i], [t1, b, cut, ease] = CAM_KEYS[i + 1];
  const p = cut ? 0 : (ease ?? SMOOTH)(c01((t - t0) / (t1 - t0)));
  // WHY the drift is scaled down when zoomed in: a 7 px wobble is invisible wide but a shake at 6x
  const k = 1 / Math.max(1, (a.z + b.z) / 2 - 0.5);
  // WHY zoom is blended in log space: a pull-back from 4.4x to 1.1x then reads as one even move, not a
  // lurch that stalls at the end
  return {
    cx: lerp(a.cx, b.cx, p) + Math.sin(t * 0.21) * 7 * k,
    cy: lerp(a.cy, b.cy, p) + Math.sin(t * 0.15 + 1) * 5 * k,
    z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), p)) * (1 + 0.004 * Math.sin(t * 0.18)),
  };
};
const ROOM = [Q.these, Q.far] as const;

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
  // WHY a ripple out from her house during the pull-back (reviewer: "the houses colour in one after another
  // along the street"): what she asked for spreads to the people next to her before the whole town asks
  [...TOWN.mid.wins, ...TOWN.back.wins].forEach((w) => {
    if (FLIP.has(w.id) || RESERVED.has(w.id)) return;
    const d = Math.abs(w.x + w.w / 2 - WC(HERO).x);
    if (d < 520) FLIP.set(w.id, Q.first + 0.2 + (d / 520) * (Q.we - Q.first - 0.35) + seeded(w.id) * 0.12);
  });
  FLIP.set(RIGHT_GIFT.id, GIFTS[1].t0 + 0.9);
  const rest: Win[] = [];
  ALL_WINS.forEach((w) => {
    if (FLIP.has(w.id) || RESERVED.has(w.id)) return;
    const p = project(AA, K[w.row], w.x + w.w / 2, w.y);
    if (p.x > 30 && p.x < 1890 && p.y > 0 && p.y < 1080) FLIP.set(w.id, lerp(QUILL_SWEEP[0], QUILL_SWEEP[1], (p.x + 120) / 2160) + seeded(w.id) * 0.06);
    else rest.push(w);
  });
  const swells = [Q.long2, Q.long3, Q.last];
  rest.forEach((w, i) => FLIP.set(w.id, swells[i % 3] + c01((w.x + 300) / 2500) * 0.5 + seeded(w.id + 9) * 0.08));
})();
const HOUSE_FLIP = new Map<House, number>();
(['back', 'mid', 'front'] as const).forEach((row) => TOWN[row].houses.forEach((h) => {
  HOUSE_FLIP.set(h, Math.min(...TOWN[row].wins.filter((w) => w.house === h.id).map((w) => FLIP.get(w.id) ?? 999)));
}));
HOUSE_FLIP.set(DATA, Q.data2);               // the stolen window's house takes its colour when it comes home

// ---------- the strings ----------
// WHY strings (the film's language of control): on "dictated" each tower lowers a thin string into the
// windows below, left to right, two frames apart, and each screen it touches turns to the same grey panel.
// A string snaps the moment its window turns into its owner's own app, and every last one snaps on "free
// ourselves". One idea, carried from the first line to the last, instead of a new icon per sentence.
type Str = { w: Win; ti: number; wi: number; at: number; cut: number };
const STR_GAP = 2 / FPS;
const STRINGS: Str[] = (() => {
  const towerSx = TOWERS.map((d) => project(OPEN_WIDE, K.towers, d.x, 600).x);
  const cand: { w: Win; sx: number }[] = [];
  (['mid', 'front'] as const).forEach((row) => TOWN[row].houses.forEach((h) => {
    const w = TOWN[row].wins.find((x) => x.house === h.id); if (!w) return;
    const p = project(OPEN_WIDE, K[row], w.x + w.w / 2, w.y);
    if (p.x > 40 && p.x < 1880 && p.y > 0 && p.y < 1080) cand.push({ w, sx: p.x });
  }));
  cand.sort((a, b) => a.sx - b.sx);
  const cast = new Set(PICS.map((h) => WIN(h).id));
  const picked: typeof cand = [];
  // WHY about one string per 110 px: enough to read as "every house", few enough not to become a web
  cand.forEach((c) => { if (cast.has(c.w.id) || !picked.length || c.sx - picked[picked.length - 1].sx > 110) picked.push(c); });
  return picked.map((c, i) => {
    const ti = towerSx.reduce((bi, x, j) => (Math.abs(x - c.sx) < Math.abs(towerSx[bi] - c.sx) ? j : bi), 0);
    const wins = TOWERS[ti].wins.map((_, k) => k).filter((k) => TOWERS[ti].wins[k][0] > 0.35);
    const wi = wins[i % wins.length];
    let cut = Math.min(FLIP.get(c.w.id) ?? 999, Q.free - 0.05 + seeded(c.w.id) * 0.15);
    if (c.w.id === WIN(HERO).id) cut = Q.aTool + 0.28;          // the quill slices her string on arrival
    if (c.w.id === WIN(LOCK).id) cut = Q.can;                    // the padlock's string goes with the padlock
    if (c.w.id === WIN(DATA).id) cut = LIFT.arrive;              // reeled all the way up with her window
    return { w: c.w, ti, wi, at: Q.dictated + 0.12 + i * STR_GAP, cut };
  });
})();
const STR_OF = new Map(STRINGS.map((s) => [s.w.id, s]));
const WAVE_END = Q.dictated + 0.12 + STRINGS.length * STR_GAP;
/** When a window turns grey: when its string lands, or (no string) when the wave passes its place. */
const greyAt = (w: Win) => {
  const s = STR_OF.get(w.id); if (s) return s.at;
  const p = project(OPEN_WIDE, K[w.row], w.x + w.w / 2, w.y);
  return lerp(Q.dictated + 0.12, WAVE_END, c01(p.x / 1920)) + 0.03;
};
/** A string's top: a window of its tower (tower layer, world units). */
const anchorOf = (s: Str, t: number): P2 => {
  if (s.w.id === WIN(DATA).id) { const f = frameAt(t); return { x: f.x + f.w / 2, y: f.y - 46 }; }
  const d = TOWERS[s.ti]; const g = towerGeo(d, growthOf(s.ti, t)); const b = TOWER_BASE + 40;
  const [v, u] = d.wins[s.wi]; const y = b - 40 - (b - 40 - g.top - 30) * v;
  return { x: g.cx(y) + u * g.half(y), y: y + 8 + sinkY(s.ti, t) };
};

// ---------- the quill's path out in the world ----------
type Pose = { x: number; y: number; angle: number; len: number; o: number };
const BURST = Q.beyond + 0.18;
/** In the top room, seen from outside (tower layer): lying on the desk; pressing the bars; gone on BURST. */
const quillInRoom = (t: number): Pose | null => {
  if (t >= BURST) return null;
  const L = lantern(t);
  const press = r(t, Q.far, BURST, EASE_IN);
  const rattle = Math.sin(t * 40) * 2.4 * r(t, Q.far, Q.far + 0.1);
  return { x: lerp(L.x - 22, L.x - 2 + rattle, press), y: lerp(L.y + 26, L.y + 2, press), angle: lerp(182, 130, press), len: 58 * (1 + 0.3 * press), o: 1 };
};

/** Out in the world, in screen space (uses the camera of this frame). */
const quillFree = (t: number, cam: Cam): Pose | null => {
  if (t < BURST || t > QUILL_SWEEP[1] + 0.25) return null;
  const front = (x: number, y: number) => project(cam, K.front, x, y);
  const hw = WIN(HERO), kw = WIN(KID);
  const perch = (w: Win, dx = 0) => ({ x: w.x + w.w + 14 + dx, y: w.y - 24 + Math.sin(t * 2.4) * 3 });
  const len = 40;
  const W = (p: P2) => { const s = front(p.x, p.y); return { x: s.x, y: s.y, s: s.s }; };
  if (t < Q.aTool) {
    // out through the bars, a loop up over the rooftops, then the dive into her window: a cubic between the
    // lantern and her window, both projected with this frame's camera, so the quill leads the whip-pan
    const L = lantern(t); const a = project(cam, K.towers, L.x, L.y + 4);
    const b = W(perch(hw));
    const u = r(t, BURST, Q.aTool, Easing.bezier(0.25, 0.6, 0.55, 1));
    // WHY this S: up and out to the left, a long glide across the sky, then a dive over the rooftops into her
    // window from the left, so the flight crosses the whole frame instead of hiding beside a tower
    const c1 = { x: a.x - 900, y: a.y - 160 }, c2 = { x: b.x - 1100, y: b.y - 420 };
    const bz = (v: number) => {
      const m = 1 - v;
      return { x: m * m * m * a.x + 3 * m * m * v * c1.x + 3 * m * v * v * c2.x + v * v * v * b.x, y: m * m * m * a.y + 3 * m * m * v * c1.y + 3 * m * v * v * c2.y + v * v * v * b.y };
    };
    const P = bz(u); const n = bz(Math.min(1, u + 0.015));
    const angle = (Math.atan2(n.y - P.y, n.x - P.x) * 180) / Math.PI;
    return { x: P.x, y: P.y, angle, len: lerp(110, 250, r(t, BURST, BURST + 0.4)), o: 1 };
  }
  if (t < Q.while - 0.6) {
    // arriving, then sketching on "make software", then the request on "asks"
    const arrive = r(t, Q.aTool, Q.aTool + 0.35, EASE_OUT);
    const from = { x: hw.x + hw.w + 60, y: hw.y - 200 };
    let wp = { x: lerp(from.x, perch(hw).x, arrive), y: lerp(from.y, perch(hw).y, arrive) };
    let ang = lerp(100, 115, arrive);
    // the slice: one stroke down through the string above her window
    const cut = band(t, Q.aTool + 0.1, Q.aTool + 0.45, 0.08, 0.15);
    if (cut > 0) { const u = r(t, Q.aTool + 0.1, Q.aTool + 0.32, EASE_IN_OUT); wp = { x: lerp(wp.x, hw.x + hw.w * (0.2 + 0.6 * u), cut), y: lerp(wp.y, hw.y - 30 + 20 * u, cut) }; ang = lerp(ang, 160, cut); }
    const s0 = Q.make, s1 = Q.softwareEnd + 0.5;
    const sk = band(t, s0 - 0.15, s1 + 0.2, 0.15, 0.2);
    if (sk > 0) {
      const u = r(t, s0, s1, LIN);
      const zx = hw.x + hw.w * (0.1 + 0.8 * u), zy = hw.y + hw.h * (0.25 + 0.5 * Math.abs(((u * 5) % 2) - 1));
      wp = { x: lerp(wp.x, zx, sk), y: lerp(wp.y, zy, sk) }; ang = lerp(ang, 112, sk);
    }
    const listen = band(t, Q.who - 0.1, Q.asks + 0.05, 0.2, 0.1);
    ang += 40 * listen;
    const sw = band(t, Q.asks - 0.05, Q.asks + 0.45, 0.06, 0.12);
    if (sw > 0) {
      const u = r(t, Q.asks, Q.asks + 0.35, EASE_IN_OUT);
      wp = { x: lerp(wp.x, hw.x + hw.w * (0.05 + 0.9 * u), sw), y: lerp(wp.y, hw.y + hw.h * 0.5, sw) };
    }
    const wait = r(t, Q.andSo, Q.andSo + 0.5, EASE_IN_OUT);
    wp = { x: lerp(wp.x, hw.x + hw.w + 30, wait), y: lerp(wp.y, hw.y - 70 + Math.sin(t * 2.4) * 3, wait) };
    const s = W(wp);
    return { x: s.x, y: s.y, angle: ang, len: len * s.s, o: 1 };
  }
  if (t < Q.we) {
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
  const u = r(t, QUILL_SWEEP[0], QUILL_SWEEP[1], LIN);
  const x = -120 + 2160 * u, y = 600 - 170 * Math.sin(u * Math.PI) + 40 * Math.sin(u * Math.PI * 4);
  const y2 = 600 - 170 * Math.sin((u + 0.01) * Math.PI) + 40 * Math.sin((u + 0.01) * Math.PI * 4);
  return { x, y, angle: (Math.atan2(y2 - y, 21.6) * 180) / Math.PI, len: 88, o: t < QUILL_SWEEP[0] ? 0 : 1 };
};

// ---------- inside the top room ----------
// Six shots, each under 3 s (reviewer: "never hold one composition for more than 3 s here"):
//  A "these corporations created a new kind of" — a sleeve sets the quill down on the lectern.
//  B "technology: artificial intelligence" — close: a two-frame wind-up, it lifts by itself and writes.
//  C "a technology they believed would bring about" — the sleeves creep up from below, fingers working.
//  D "a great treasure:" — the quill is knocked aside; two hands lift ONE gilt-framed chart into the light.
//  E "shareholder value" — close on it: its line climbs on "shareholder"; a wax seal stamps it on "value".
//  F "But in their excitement, they created something" — a sleeve grabs it; it wriggles, winds up and slips.
type QPose = { x: number; y: number; angle: number; len: number };
const QREST: QPose = { x: 868, y: 624, angle: 184, len: 300 };
const QHOVER: QPose = { x: 1080, y: 560, angle: 122, len: 300 };
const QSIDE: QPose = { x: 1000, y: 652, angle: 166, len: 300 };
// WHY nib-left, vane trailing right and down while held: the sleeves reach in from the upper corners, and a
// vane pointing up along the arm vanished behind the sleeve
const QHELD: QPose = { x: 860, y: 470, angle: 205, len: 300 };
const mixQ = (a: QPose, b: QPose, p: number): QPose => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), angle: lerp(a.angle, b.angle, p), len: lerp(a.len, b.len, p) });
const R_FROM: P2 = { x: 2300, y: -200 };
/** A hand closed round the quill's shaft, its sleeve running back to `from`. */
const handOn = (q: QPose, from: P2, grip: number, back = 0): HandPose => {
  const a = ((q.angle + 180) * Math.PI) / 180;
  // WHY near the nib: held by the bare barrel, the purple vane stays visible behind the glove
  const M = { x: q.x + Math.cos(a) * q.len * 0.24, y: q.y + Math.sin(a) * q.len * 0.24 };
  const dx = M.x - from.x, dy = M.y - from.y, L = Math.hypot(dx, dy);
  const k = 112 + back;
  return { from, at: { x: M.x - (dx / L) * k, y: M.y - (dy / L) * k }, grip };
};
// The treasure: one gilt-framed chart, lifted into the lamplight. WHY (reviewer, round 4): coin piles and books
// were the treasure-chest cliché with new props; "shareholder value" is one idea, a line going up, so it is
// one object, and each word gets one precise action: "great" it rises, "treasure" the light slides across
// it, "shareholder" its line climbs, "value" a seal stamps it.
// WHY left of the lectern, not over it: held over the lectern the arms hid the quill, and the quill lying
// ignored beside their treasure is the point of the shot
const PRIZE_UP = { x: 690, y: 395, w: 400, h: 290 };
const liftAt = (t: number) => {
  // WHY a slight overshoot: a trophy hoisted with pride rises a touch too high, then settles
  const up = r(t, Q.great - 0.05, Q.treasure + 0.3, Easing.bezier(0.25, 0.9, 0.35, 1.12));
  const proud = 14 * Math.sin(Math.PI * r(t, Q.valueEnd, Q.but, EASE_IN_OUT));   // a little hoist after the stamp
  return PRIZE_UP.y + 760 * (1 - up) - proud;
};
const SEAL_LAND = Q.value + 0.12;                         // the stamp lands inside "va-lue"
const prizeAt = (t: number) => ({
  ...PRIZE_UP, y: liftAt(t), rot: 0, o: 1,
  line: 0.62 * r(t, Q.treasure + 0.2, Q.treasure + 1.0, EASE_IN_OUT) + 0.38 * r(t, Q.shareholder - 0.04, Q.shareholderEnd + 0.1, EASE_IN_OUT),
  shine: r(t, Q.treasure + 0.25, Q.treasure + 1.15, EASE_IN_OUT),
  seal: r(t, SEAL_LAND - 3 / FPS, SEAL_LAND, EASE_IN), squash: spring(t - SEAL_LAND),
});
/** The two hands holding the frame by its lower corners, sleeves running down out of frame. */
const liftHands = (p: { x: number; y: number; w: number; h: number }): [HandPose, HandPose] => {
  const hold = (from: P2, cx: number): HandPose => {
    const c = { x: cx, y: p.y + p.h / 2 + 10 };
    const dx = c.x - from.x, dy = c.y - from.y, L = Math.hypot(dx, dy);
    return { from, at: { x: c.x - (dx / L) * 92, y: c.y - (dy / L) * 92 }, grip: 0.55 };
  };
  // the arms rise almost straight up from below, so the left sleeve stays clear of the barred window
  return [hold({ x: p.x - 300, y: 1500 }, p.x - p.w / 2 + 44), hold({ x: p.x + 300, y: 1500 }, p.x + p.w / 2 - 44)];
};
const roomAt = (t: number): RoomState => {
  let cam = { cx: 960, cy: 560, z: 1 };
  let quill: QPose = QREST; let flex = 0; let ink = 0; let left: HandPose | undefined; let right: HandPose | undefined;
  let prize: Prize | undefined;
  if (t < Q.newTech) {
    // A: a sleeve lowers the quill onto the lectern, lets go and withdraws. WHY one hand only: a second one
    // drumming at the left edge was cut off by the frame and overlapped the window (reviewer: "a stray limb")
    const p = r(t, Q.these, Q.newTech, LIN);
    cam = { cx: 1010, cy: 560, z: 1.3 + 0.08 * SMOOTH(p) };
    const set = r(t, Q.these, Q.created + 0.1, EASE_IN_OUT);
    quill = mixQ({ x: 1120, y: 300, angle: 206, len: 300 }, QREST, set);
    quill.y -= 10 * spring(t - Q.created - 0.1);
    const release = r(t, Q.created + 0.15, Q.created + 0.4);
    const away = r(t, Q.created + 0.35, Q.newTech, EASE_IN_OUT);
    const h = handOn(quill, R_FROM, 1 - release, 40 * release);
    right = { ...h, at: { x: lerp(h.at.x, h.at.x + 520, away), y: lerp(h.at.y, h.at.y - 520, away) } };
  } else if (t < Q.aTechnology) {
    // B: close on the parchment; the quill wakes and writes one line by itself
    const p = r(t, Q.newTech, Q.aTechnology, LIN);
    cam = { cx: 985, cy: 612, z: 2.15 + 0.2 * SMOOTH(p) };
    const wind = r(t, Q.artificial, Q.artificial + 2 / FPS, LIN);
    const lift = r(t, Q.artificial + 2 / FPS, Q.artificial + 0.3, BACK_OUT);
    const w0 = Q.artificial + 0.3, w1 = Q.intelligenceEnd + 0.45;
    const u = r(t, w0, w1, EASE_IN_OUT);
    const pen = inkPt(u);
    const start: QPose = { x: inkPt(0).x, y: inkPt(0).y, angle: 116, len: 300 };
    quill = { ...QREST, y: QREST.y + 5 * wind * (1 - lift), angle: QREST.angle + 3 * wind * (1 - lift) };
    flex = Math.sin(t * 9) * 0.3 * band(t, Q.artificial - 0.35, Q.artificial, 0.1, 0.05) - 1.2 * wind * (1 - lift);
    quill = mixQ(quill, start, lift);
    if (t >= w0) quill = { ...quill, x: pen.x, y: pen.y, angle: 116 + Math.sin(u * 46) * 5 };
    const rise = r(t, w1, w1 + 0.45, EASE_IN_OUT);
    quill = mixQ(quill, QHOVER, rise);
    ink = u;
  } else if (t < Q.great) {
    // C: the sleeves creep up from below toward it, fingers working. WHY from below: from the upper left the
    // sleeve crossed the barred window; low, both arms stay clear of it and set up the lift that follows
    const p = r(t, Q.aTechnology, Q.great, LIN);
    cam = { cx: 960, cy: 545, z: 1.12 + 0.12 * SMOOTH(p) };
    ink = 1;
    quill = { ...QHOVER, y: QHOVER.y + Math.sin(t * 2.6) * 6, angle: QHOVER.angle + Math.sin(t * 1.9) * 3 };
    const creep = r(t, Q.aTechnology + 0.1, Q.great - 0.05, EASE_IN_OUT);
    left = { from: { x: 120, y: 1500 }, at: { x: lerp(560, 760, creep), y: lerp(1120, 640, creep) }, grip: 0.1, wiggle: 0.9 };
    right = { from: { x: 1900, y: 1500 }, at: { x: lerp(1500, 1300, creep), y: lerp(1120, 600, creep) }, grip: 0.1, wiggle: 0.9 };
  } else {
    ink = 1;
    // D/E: on "great" the quill is knocked down onto the lectern and lies ignored, trembling more and more,
    // while the hands lift their treasure up into the light (new shot: the hands now hold the frame)
    const swat = r(t, Q.great - 0.04, Q.great + 0.2, EASE_OUT);
    quill = mixQ(QHOVER, QSIDE, swat);
    quill.angle += 40 * Math.sin(Math.PI * swat);
    quill.y -= 10 * spring(t - Q.great - 0.2);
    const trem = r(t, Q.treasure + 0.4, Q.but, EASE_IN) * 3.2;
    quill.angle += Math.sin(t * 52) * trem; flex = Math.sin(t * 37) * trem * 0.3;
    prize = prizeAt(t);
    [left, right] = liftHands(prize);
    if (t < Q.shareholder) {
      // D: wide enough to see the quill pushed aside below the treasure; a slow push in as it rises
      const p = r(t, Q.great, Q.shareholder, LIN);
      cam = { cx: 880, cy: lerp(600, 540, SMOOTH(p)), z: 1.0 + 0.1 * SMOOTH(p) };
    } else if (t < Q.but) {
      // E: close on the frame; the floor jumps once when the seal lands
      const p = r(t, Q.shareholder, Q.but, LIN);
      cam = { cx: 770, cy: 450 + 6 * spring(t - SEAL_LAND), z: 1.5 + 0.08 * SMOOTH(p) };
    } else {
      // F: a sleeve snatches it; it wriggles, winds up and slips the grip. The treasure stands where they set
      // it, leaning on the floor at the left, so it does not vanish across the cut
      prize = { ...prizeAt(t), x: 560, y: 760, w: 300, h: 218, rot: -5, squash: 0 };
      const p = r(t, Q.but, Q.far, LIN);
      cam = { cx: lerp(990, 960, p), cy: lerp(620, 540, SMOOTH(p)), z: 1.8 + 0.12 * p };
      const grab = r(t, Q.excitement - 0.05, Q.excitement + 0.15, EASE_OUT);
      const up = r(t, Q.excitement + 0.18, Q.excitement + 0.6, EASE_IN_OUT);
      const wind = r(t, Q.something2 - 0.4, Q.something2, EASE_IN);
      const slip = r(t, Q.something2, Q.something2 + 0.34, EASE_IN);
      let q = mixQ(quill, QHELD, up);
      const wr = (6 + 12 * r(t, Q.excitement + 0.5, Q.something2 - 0.4)) * up * (1 - wind);
      q.angle += Math.sin(t * 31) * wr;
      // the wind-up: drawn back and down, vane bent hard, for 0.4 s before it goes
      q = { ...q, x: q.x + 24 * wind, y: q.y + 26 * wind, angle: q.angle + 18 * wind };
      flex = -1.6 * wind + Math.sin(t * 29) * 0.4 * up;
      // the slip: a two-frame jolt forward, then out of frame toward the window, nib first
      const out: QPose = { x: q.x - 900, y: q.y - 760, angle: 220, len: 300 };
      const jolt = r(t, Q.something2, Q.something2 + 2 / FPS, LIN) * (1 - slip);
      quill = mixQ({ ...q, x: q.x - 30 * jolt, y: q.y - 26 * jolt }, out, slip);
      const fist = handOn(mixQ(QSIDE, QHELD, up), R_FROM, 1);
      const reach = handOn(QSIDE, R_FROM, 0, 380);
      right = { from: R_FROM, at: { x: lerp(reach.at.x, fist.at.x, grab), y: lerp(reach.at.y, fist.at.y, grab) }, grip: Math.max(grab, slip) };
      // after the slip the empty fist jerks back
      right.at = { x: right.at.x + 50 * slip + 12 * wind, y: right.at.y + 30 * slip + 14 * wind };
      left = { from: { x: -380, y: 120 }, at: { x: lerp(-200, 640, r(t, Q.excitement + 0.2, Q.excitement + 0.7, EASE_OUT)) + 120 * slip, y: lerp(520, 470, up) - 60 * slip }, grip: 0.1 + 0.8 * slip, wiggle: 0.8 * (1 - slip) };
    }
  }
  return { cam, quill: { ...quill, flex }, ink, left, right, prize, lamp: 1, t };
};

// ---------- type ----------
// WHY one place for every word on screen: lower left, on the 8% margins, fixed width, DM Sans 900.
const SPOT = { left: '8%', bottom: '11%', width: '62%' } as const;
/** A headline stays fully readable for 1.2 s + 0.25 s per word after its last word has landed. */
const holdFull = (words: HWord[], wanted = 0) => Math.max(wanted, words[words.length - 1].at + 0.42 + 1.2 + 0.25 * words.length + 0.4);

type HWord = { text: string; at: number; accent?: boolean };
/** A headline whose words arrive exactly as they are spoken (DM Sans 900, lowercase, one purple word).
 *  `from`: no frame of it before this time (WHY: a word that starts fading in 2 frames before a hard cut is
 *  born in one shot and lands in the next, a smeared flash). `fade`: how long it takes to leave. */
const Headline: React.FC<{ words: HWord[]; out: number; t: number; day: boolean; from?: number; fade?: number }> = ({ words, out, t, day, from = -1, fade = 0.4 }) => {
  const u = useU();
  if (t < Math.max(from, words[0].at - 0.1) || t > out + 0.05) return null;
  const exit = r(t, out - fade, out, EASE_IN);
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', ...SPOT, opacity: 1 - exit, transform: `translateY(${-exit * 0.6 * u}px)`,
        fontFamily: DMSANS, fontWeight: 900, fontSize: 5 * u, letterSpacing: '-0.05em', lineHeight: 1.04,
        color: day ? C.plum : C.nightText,
        textShadow: day ? `0 0 ${1.6 * u}px rgba(251,246,253,0.9)` : `0 ${0.2 * u}px ${2 * u}px rgba(10,4,16,0.8)`,
      }}>
        {words.map((w, i) => {
          const a = Math.max(from, w.at - 0.06);
          const p = r(t, a, Math.max(a + 0.3, w.at + 0.42));
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

const FINAL: HWord[] = [{ text: 'open', at: Q.open }, { text: 'source', at: Q.source }, { text: 'everything.', at: Q.everything, accent: true }];
const HEADLINES: { words: HWord[]; out: number; from?: number }[] = [
  { words: [{ text: 'own', at: Q.own }, { text: 'nothing.', at: Q.nothing, accent: true }] },
  // WHY from the cut and out at the next cut: it belongs to the lantern shot only (see BLIND_CUT)
  { words: [{ text: 'something', at: Q.something }, { text: 'wonderful', at: Q.wonderful, accent: true }, { text: 'happened.', at: Q.happened }], from: Q.something, out: BLIND_CUT },
  { words: [{ text: 'for', at: Q.forAnyone }, { text: 'anyone', at: Q.anyone, accent: true }, { text: 'who', at: Q.who }, { text: 'asks.', at: Q.asks }], out: ASKS_OUT },
].map((h) => ({ ...h, out: h.out ?? holdFull(h.words) }));
// WHY checked: the brand guide's minimum (1.2 s + 0.25 s a word on screen) must survive any re-recording
HEADLINES.forEach((h) => { if (h.out - (h.from ?? h.words[0].at) < 1.2 + 0.25 * h.words.length) throw new Error(`take1: headline "${h.words.map((w) => w.text).join(' ')}" is held too briefly`); });
const CAPS = captions(WORDS.indexOf(cueWord('open', '*open source everything')), Q.open - 0.2);
const FIRST_DAY_CAP = CAPS.find((c) => dawnAt(c.at) > 0.5)?.at ?? 99;
const CAP_TONE = (t: number) => r(t, FIRST_DAY_CAP - 0.5, FIRST_DAY_CAP, EASE_IN_OUT);

/** A soft scrim behind the type spot: plum at night, lavender by morning. Wide and feathered, so it reads
 *  as the corner of the page dimming, never as a box. `strong` is the muted version's deeper band. */
const Scrim: React.FC<{ o: number; dawn: number; strong?: boolean }> = ({ o, dawn, strong }) => {
  if (o <= 0) return null;
  const c = mix('#0A0512', '#FAF5FD', dawn);
  const a = (k: number) => c.replace('rgb', 'rgba').replace(')', `,${k})`);
  // WHY deeper than before: the reviewer saw "own nothing." sit on the dark fence with little separation
  const background = strong
    ? `linear-gradient(0deg, ${a(0.9)} 0%, ${a(0.84)} 24%, ${a(0.5)} 36%, transparent 50%)`
    : `radial-gradient(ellipse 80% 58% at 24% 100%, ${a(0.82)} 0%, ${a(0.5)} 46%, transparent 80%), linear-gradient(0deg, ${a(0.5 * (1 - dawn))} 0%, ${a(0.32 * (1 - dawn))} 18%, transparent 34%)`;
  // WHY the second, low band (night only): under "for anyone who asks." the pull-back slides doors and roofs
  // under the words; a soft dark floor across the bottom third keeps them calm (reviewer, round 4)
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
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 52%, transparent 58%, rgba(14,4,24,0.55) 100%)', opacity: 1 - 0.7 * dawn }} />
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

const FLAG = '#D25AA0';                                // the towers' colour: their flags, strings and pennants

/** A whole-frame jolt when something heavy lands: the padlock, the coin, the window clicking home. */
const SHAKES: [number, number][] = [[Q.do, 7], [Q.cost + 0.16, 3.5], [HOME.land, 4]];
const shakeAt = (t: number) => SHAKES.reduce((n, [a, k]) => n + k * spring(t - a), 0);

// ---------- the film ----------
export const Take1: React.FC<{ narrator?: boolean }> = ({ narrator = true }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);
  const dawn = dawnAt(t);
  const pal = palette(dawn);
  const front = (x: number, y: number) => project(cam, K.front, x, y);
  const inRoom = t >= ROOM[0] && t < ROOM[1];

  // --- the towers' windows ---
  const flare = Math.min(r(t, Q.blinded, Q.blinded + 0.4), 1 - r(t, Q.hubris + 0.6, Q.these, EASE_IN_OUT));
  const towerLit = (v: number, i: number) => {
    let L = 0.45 + 0.55 * r(t, Q.corporations + v * 0.8, Q.corporations + v * 0.8 + 0.35);
    L += 0.7 * flare * (0.7 + 0.3 * seeded(i * 7));
    return L;
  };
  const crack = r(t, Q.foundation, Q.monopolies1 + 0.4, EASE_OUT);

  // --- the town's windows ---
  const dataW = WIN(DATA), heroW = WIN(HERO), lockW = WIN(LOCK);
  const hc = WC(HERO);
  const dataHole = t >= LIFT.pop && t < HOME.land;
  const heroInside = t >= Q.andThat - 0.05 && t < Q.however + 0.3;
  const dataInside = (t >= Q.andWhat - 0.05 && t < LIFT.pop) || (t >= HOME.land && t < Q.free + 0.35);
  const winState = (w: Win): WinLook => {
    // lamp-lit at first, a little uneven; dimmed on "nothing"; out one by one through "convenience"
    let b = w.id === heroW.id ? 1 : 0.65 + 0.35 * seeded(w.id);
    b -= 0.3 * r(t, Q.nothing + seeded(w.id) * 0.6, Q.nothing + seeded(w.id) * 0.6 + 0.4, EASE_IN_OUT);
    const d = Math.hypot(w.x - hc.x, (w.y - hc.y) * 2);
    const outAt = Q.convenience + 0.1 + Math.min(1, d / 900) * 0.95;
    b = lerp(b, 0.05, r(t, outAt, outAt + 0.2));
    if (w.id === lockW.id) b = lerp(b, 0.1, r(t, Q.do, Q.do + 0.06));
    b = Math.max(b, dawn);
    let grey = r(t, greyAt(w), greyAt(w) + 0.1, EASE_OUT);
    if ((w.id === dataW.id && dataInside) || (w.id === heroW.id && heroInside)) grey = 0;
    const ft = FLIP.get(w.id) ?? 999;
    const look: WinLook = { b, grey, flip: c01((t - ft) / 0.42) };
    if (w.id === heroW.id) look.sketch = r(t, Q.make, Q.softwareEnd + 0.5, LIN);
    if (w.id === WIN(NEIGH).id) look.layout = APP.recipe;
    if (w.id === dataW.id && dataHole) look.hole = true;
    return look;
  };
  const houseLit = (h: House) => { const ft = HOUSE_FLIP.get(h) ?? 999; return r(t, ft, ft + 0.9, EASE_IN_OUT); };
  const townGlow = ALL_WINS.reduce((n, w) => n + (t >= (FLIP.get(w.id) ?? 999) ? 1 : 0), 0) / ALL_WINS.length;

  // --- someone at home, seen through the glass ---
  const dataWarm = t < Q.andWeAll ? 1 : r(t, HOME.land - 0.05, HOME.land + 0.3, EASE_OUT);
  const heroWarm = 1 - r(t, Q.convenience + 0.75, Q.however, EASE_IN_OUT);
  const inside = (w: Win) => {
    if (w.id === dataW.id && dataInside) return <Sitter x={w.x} y={w.y} w={w.w} h={w.h} t={t} o={1} warm={dataWarm} />;
    if (w.id === heroW.id && heroInside) return <Sitter x={w.x} y={w.y} w={w.w} h={w.h} t={t} o={1} warm={heroWarm} wave={band(t, Q.convenience - 0.05, Q.convenience + 1.0, 0.2, 0.3)} />;
    return null;
  };

  // --- doors and the villagers in them ---
  const heroStr = STR_OF.get(heroW.id);
  const doorOf = (h: House) => {
    if (!h.big) return 0;
    const finale = r(t, Q.itsTime2 + (h.x % 300) / 900, Q.itsTime2 + (h.x % 300) / 900 + 0.35, EASE_OUT);
    const accept = band(t, Q.andWeAll + (h.x % 200) / 900, Q.acceptedIt + 0.45, 0.3, 0.35);
    let o = Math.max(finale, accept);
    // WHY she starts in her open door: the first frame needs a person and her light
    if (h === HERO) o = Math.max(o, 1 - r(t, (heroStr?.at ?? Q.dictated) + 0.5, (heroStr?.at ?? Q.dictated) + 0.9, EASE_IN_OUT), r(t, Q.aTool + 0.1, Q.aTool + 0.4));
    if (h === NEIGH) o = Math.max(o, r(t, Q.andSo - 0.1, Q.andSo + 0.25));
    if (h === KID) o = Math.max(o, r(t, Q.inA - 0.1, Q.inA + 0.25));
    if (h === LOCK) o = Math.max(o, r(t, Q.can, Q.can + 0.3));
    if (h === COIN) o = Math.max(o, band(t, Q.whatCost - 0.15, Q.andWhat + 0.2, 0.2, 0.2), r(t, Q.costs - 0.05, Q.costs + 0.2));
    if (h === DATA) o = Math.max(o, r(t, Q.free, Q.free + 0.3));
    return o;
  };
  const porch = (h: House) => {
    const who = COATS[h.id]; if (!who) return null;
    const o = r(doorOf(h), 0.45, 0.9, LIN);
    if (o <= 0) return null;
    const x = h.doorX + (h === HERO || h === NEIGH ? 10 : 4);
    let reach = 0, shrug = 0, wave = 0; let dir: 1 | -1 = 1;
    shrug = band(t, Q.justAccepted - 0.05, Q.acceptedIt + 0.25, 0.2, 0.2);
    if (h === HERO) {
      // a flinch as the string lands in her window
      shrug = Math.max(shrug, band(t, (heroStr?.at ?? 99) + 0.02, (heroStr?.at ?? 99) + 0.5, 0.08, 0.25) * 0.7);
      reach = band(t, Q.andSo + 0.05, Q.andSo + 0.9, 0.25, 0.3);
      wave = band(t, Q.asks + 0.45, Q.andSo, 0.25, 0.25);
    }
    if (h === NEIGH) { dir = -1; reach = band(t, Q.andSo + 0.4, Q.first + 0.2, 0.25, 0.3); wave = band(t, Q.first + 0.35, Q.inA + 0.6, 0.25, 0.3); }
    if (h === KID) wave = band(t, Q.while + 0.45, Q.we, 0.2, 0.2);
    if (h === LOCK) wave = band(t, Q.can + 0.4, Q.what2, 0.25, 0.2);
    // she holds a coin out to the meter on "cost", then lets her shoulders drop
    if (h === COIN) { reach = band(t, Q.cost - 0.3, Q.cost + 0.25, 0.15, 0.2); shrug = Math.max(shrug, band(t, Q.cost + 0.35, Q.andWhat, 0.2, 0.1) * 0.6); }
    if (t > Q.itsTime2) wave = Math.max(wave, band(t, Q.itsTime2 + 0.6 + seeded(h.id) * 0.8, 99, 0.3, 0.3) * 0.9);
    return <Villager x={x} y={h.base + 1} s={who.s} coat={who.coat} hair={who.hair} t={t + seeded(h.id) * 3} reach={reach} shrug={shrug} wave={wave} dir={dir} o={o} />;
  };

  // --- what the towers put on houses: a coin meter by every door, a pennant on every roof ---
  const clunk = Q.cost + 0.16;
  const meterOn = (h: House) => {
    if (h === COIN) return r(t, Q.whatCost - 0.05, Q.whatCost + 0.25, BACK_OUT);
    const d0 = Q.subscribe + c01((h.doorX - 300) / 1600) * 1.0 + (h.row === 'mid' ? 0.15 : 0);
    return r(t, d0, d0 + 0.22, BACK_OUT);
  };
  const meterOff = (h: House) => (h === COIN ? r(t, Q.costs - 0.02, Q.costs + 0.5, EASE_IN) : r(t, Q.free + seeded(h.id) * 0.4, Q.free + seeded(h.id) * 0.4 + 0.5, EASE_IN));
  const wallBits = (h: House) => {
    const bits: React.ReactNode[] = [];
    if (h.door && h.row !== 'back') {
      const sc = h.row === 'front' ? 1 : 0.8;
      const ticks = Math.max(0, t - Q.subscribe) * 2.2 + (h === COIN ? (t > clunk ? 3 + Math.max(0, t - clunk) * 3 : 0) : 0);
      const m = meterAt(h);
      // WHY the clunk: the coin goes in and the meter jolts, so "cost" is felt, not just shown
      const sq = h === COIN ? spring(t - clunk) : 0;
      bits.push(<g key="m" transform={`translate(${m.x} ${m.y}) scale(${1 + 0.12 * sq} ${1 - 0.14 * sq}) translate(${-m.x} ${-m.y})`}>
        <CoinMeter x={m.x} y={m.y} s={m.s * sc} pop={meterOn(h)} tick={ticks} off={meterOff(h)} />
      </g>);
    }
    if (h.row !== 'back') {
      const k = c01((h.peak.x - 200) / 1700) * 0.35;
      const up = r(t, Q.own + k, Q.own + k + 0.25, BACK_OUT);
      const fly = r(t, Q.free + seeded(h.id + 4) * 0.5, Q.free + seeded(h.id + 4) * 0.5 + 0.9, EASE_IN);
      bits.push(<Pennant key="p" x={h.peak.x} y={h.peak.y + 2} s={h.row === 'front' ? 1.5 : 1.0} up={up} fly={fly} t={t} c={FLAG} seed={h.id} />);
    }
    return bits;
  };

  // --- the strings, drawn inside each row's own layer so nearer houses hide them correctly ---
  const padlockAt = (() => {
    // the padlock slides down her string into view, hangs, a tug, then the drop and the slam on "do"
    const w = lockW; const seat = { x: w.x + w.w / 2, y: w.y + w.h * 0.62 };
    const hang = r(t, Q.theyDecided - 0.1, Q.computers + 0.1, EASE_IN_OUT);
    const tug = Math.sin(Math.PI * r(t, Q.computers + 0.05, Q.do - 0.16, EASE_IN_OUT)) * 18;
    const drop = r(t, Q.do - 0.16, Q.do, EASE_IN);
    const y = lerp(seat.y - lerp(330, 105, hang) - tug, seat.y, drop);
    return { seat, y, swing: Math.sin(t * 4.2) * 7 * (1 - drop) * hang, drop, show: t >= Q.theyDecided && t < Q.computers2 + 0.7 };
  })();
  const stringsFor = (row: 'mid' | 'front') => {
    if (inRoom) return null;
    const o0 = project(cam, K[row], 0, 0);
    const toRow = (p: P2) => ({ x: (p.x - o0.x) / o0.s, y: (p.y - o0.y) / o0.s });
    // WHY dimmer through the hush and the towers' scenes: the town sleeps; the strings are background there
    const master = t >= Q.however && t < Q.aTool ? 0.45 : 1;
    const px = Math.min(3.2, Math.max(1.3, 0.9 * o0.s));
    return STRINGS.filter((s) => s.w.row === row).map((s) => {
      if (t < s.at - 0.2 || t > s.cut + 0.4) return null;
      if (s.w.id === dataW.id && t >= LIFT.taut) return null;   // drawn with the flying window instead
      const A = toRow(project(cam, K.towers, anchorOf(s, t).x, anchorOf(s, t).y));
      let Wp = { x: s.w.x + s.w.w / 2, y: s.w.y - 3 };
      const drop = r(t, s.at - 0.2, s.at, EASE_IN);
      let tip = { x: lerp(A.x, Wp.x, drop), y: lerp(A.y, Wp.y, drop) };
      let sag = 0.04 + 0.02 * Math.sin(t * 1.3 + s.w.id);
      let op = master;
      if (t > s.cut) {
        // the snap: the loose end whips up and away toward its tower
        const k = r(t, s.cut, s.cut + 0.4, EASE_IN);
        tip = { x: lerp(Wp.x, A.x, k) + Math.sin(k * 14) * 18 * (1 - k), y: lerp(Wp.y, A.y, k) };
        sag = 0.12 * (1 - k); op *= 1 - k;
      }
      if (s.w.id === lockW.id && padlockAt.show) Wp = { x: s.w.x + s.w.w / 2, y: s.w.y - 3 };
      // WHY this shape: a straight line from a far tower crossed the whole frame in close shots and made a web.
      // Like a marionette string, it now hangs straight down onto the window and only bends toward its tower
      // high above, so close up it reads as "a string from above", and wide as "from that tower".
      const dy = Math.abs(tip.y - A.y);
      const C1 = { x: A.x, y: A.y + dy * 0.12 }, C2 = { x: tip.x + Math.sin(t * 1.3 + s.w.id) * 4, y: tip.y - dy * (0.6 + sag) };
      return (
        <g key={`s${s.w.id}`} opacity={op * 0.85}>
          <path d={`M${A.x} ${A.y} C${C1.x} ${C1.y} ${C2.x} ${C2.y} ${tip.x} ${tip.y}`} fill="none" stroke={FLAG} strokeWidth={px / o0.s} strokeLinecap="round" />
          {t >= s.at && t <= s.cut && <circle cx={tip.x} cy={tip.y} r={2.6 * px / o0.s} fill={FLAG} />}
        </g>
      );
    });
  };

  // --- things drawn in the town's own space (front row world units) ---
  const town: React.ReactNode[] = [];
  // the padlock: on her string, slammed onto the window on "do", sprung open on "computers can do"
  if (padlockAt.show) {
    const w = lockW;
    const pop = r(t, Q.computers2 - 0.08, Q.computers2 + 0.08, BACK_OUT);
    const fall = r(t, Q.computers2 + 0.1, Q.computers2 + 0.7, EASE_IN);
    const thud = 0.16 * spring(t - Q.do);
    town.push(<Padlock key="lock" x={padlockAt.seat.x + fall * 10} y={padlockAt.y + fall * 160} size={w.w * 0.92}
      open={pop} rot={padlockAt.swing + fall * 30} o={1 - r(t, Q.computers2 + 0.45, Q.computers2 + 0.7)} squash={thud} />);
  }
  // the coin: from her hand into the meter's slot on "cost"; on "costs" the coins come back out of the door
  {
    const h = COIN; const { ht } = doorSize(h); const who = COATS[h.id];
    const mm = meterAt(h); const slot = { x: mm.x, y: mm.y - 12 * mm.s };
    const hand = { x: h.doorX + 4 + 18 * who.s, y: h.base - 27 * who.s };
    const f = r(t, Q.cost - 0.06, clunk, EASE_IN_OUT);
    if (t > Q.cost - 0.3 && t < clunk) town.push(<Coin key="c0" x={lerp(hand.x, slot.x, f)} y={lerp(hand.y, slot.y, f) - Math.sin(f * Math.PI) * 30} r={7} spin={f * 1.5} o={1} />);
    const door = { x: h.doorX, y: h.base - ht * 0.45 };
    const meter = { x: mm.x, y: mm.y - 12 * mm.s };
    [0, 0.1, 0.2, 0.3, 0.4].forEach((d, k) => {
      const t0 = Q.costs + 0.12 + d; const g = (t - t0) / 0.36; if (g < 0 || g >= 1) return;
      const e = EASE_IN_OUT(g);
      town.push(<Coin key={`c${k}`} x={lerp(meter.x, door.x, e)} y={lerp(meter.y, door.y, e) - Math.sin(g * Math.PI) * 34} r={9} spin={g * 1.3 + k * 0.2} o={1 - r(g, 0.85, 1)} />);
    });
  }
  // the speech bubbles: the hero's recipe, the kid's drawing
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
    town.push(<g key={key} opacity={vis}>
      <path d={`M${A.x} ${A.y} Q${M.x} ${M.y} ${B.x} ${B.y}`} fill="none" stroke="#3A2850" strokeWidth={1.4} pathLength={1} strokeDasharray={`${draw} 1`} />
      {t > t0 - 0.05 && t < t1 + 0.15 && <g transform={`rotate(${Math.sin(t * 7) * 4} ${c.x} ${c.y})`} filter="url(#lift)">
        <AppWin x={c.x - cw / 2} y={c.y + 1} w={cw} h={ch} theme={g.from.theme} layout={g.from.layout} t={t} seed={g.from.id} />
        <rect x={c.x - cw / 2} y={c.y + 1} width={cw} height={ch} rx={ch * 0.08} fill="none" stroke="#21152C" strokeWidth={1} />
        {[-0.3, 0.3].map((k) => <rect key={k} x={c.x + k * cw - 1.5} y={c.y - 3} width={3} height={7} rx={1} fill="#C9A06A" stroke="#21152C" strokeWidth={0.6} />)}
      </g>}
    </g>);
  };
  line(HERO_GIFT, 'g0'); GIFTS.forEach((g, i) => line(g, `g${i + 1}`));

  // --- the stolen window: on the tower, and in flight (screen space) ---
  const fr = frameAt(t);
  const onTower = t >= LIFT.arrive && t < HOME.fall;
  const hangSwing = Math.sin((t - LIFT.arrive) * 9) * 9 * Math.exp(-(t - LIFT.arrive) * 3.5) + Math.sin((t - HOME.unhook) * 40) * 3 * band(t, HOME.unhook, HOME.fall, 0.03, 0.03);
  let flying: React.ReactNode = null;
  if (t >= LIFT.taut && t < LIFT.arrive) {
    const w = dataW;
    const a = project(cam, K.front, w.x, w.y), s0 = a.s;
    const b = project(cam, K.towers, fr.x, fr.y), s1 = b.s;
    const jig = t < LIFT.pop ? Math.sin(t * 70) * 1.5 * s0 : 0;
    const popK = r(t, LIFT.pop, LIFT.reel, BACK_OUT);
    const u = r(t, LIFT.reel, LIFT.arrive, EASE_IN_OUT);
    const W0 = w.w * s0 * (1 + 0.1 * popK), H0 = w.h * s0 * (1 + 0.1 * popK);
    const W1 = fr.w * s1, H1 = fr.h * s1;
    const x = lerp(a.x - (W0 - w.w * s0) / 2, b.x, u) + jig + Math.sin(u * Math.PI) * 140;
    const y = lerp(a.y - 10 * s0 * popK - (H0 - w.h * s0) / 2, b.y, u);
    const W = lerp(W0, W1, u), H = lerp(H0, H1, u);
    const anc = project(cam, K.towers, fr.x + fr.w / 2, fr.y - 46);
    flying = (
      <g>
        <path d={`M${anc.x} ${anc.y} L${x + W / 2} ${y}`} stroke={FLAG} strokeWidth={Math.min(3.2, Math.max(1.3, 0.9 * s0))} />
        <g transform={`rotate(${Math.sin(u * Math.PI * 3) * 8} ${x + W / 2} ${y})`} filter="url(#lift)">
          <rect x={x - 3} y={y - 3} width={W + 6} height={H + 6} rx={3} fill={pal.ink} />
          <Sitter x={x} y={y} w={W} h={H} t={t} o={1} warm={1} />
          <rect x={x + W / 2 - 1.2} y={y} width={2.4} height={H} fill={pal.ink} />
          <rect x={x} y={y + H / 2 - 1.2} width={W} height={2.4} fill={pal.ink} />
          {/* it is gilded as it arrives: a window becomes a trophy on their wall */}
          <rect x={x - W * 0.1} y={y - W * 0.1} width={W * 1.2} height={H + W * 0.2} rx={W * 0.06} fill="none" stroke="#B58F4A" strokeWidth={W * 0.1} opacity={r(u, 0.65, 1)} />
        </g>
      </g>
    );
  } else if (t >= HOME.fall && t < HOME.land + 0.3) {
    const w = dataW;
    const a = project(cam, K.towers, fr.x, fr.y), s1 = a.s;
    const b = project(cam, K.front, w.x, w.y), s0 = b.s;
    const u = r(t, HOME.fall, HOME.land, EASE_IN);
    const W = lerp(fr.w * s1, w.w * s0, u), H = lerp(fr.h * s1, w.h * s0, u);
    const x = lerp(a.x, b.x, u) - Math.sin(u * Math.PI) * 120, y = lerp(a.y, b.y, u);
    // the click home: a squash on contact, and the gilt frame drops away
    const sq = spring(t - HOME.land);
    const gilt = 1 - r(t, HOME.land, HOME.land + 0.2);
    flying = (
      <g transform={`translate(${x + W / 2} ${y + H}) scale(${1 + 0.08 * sq} ${1 - 0.1 * sq}) translate(${-x - W / 2} ${-y - H})`} filter={t < HOME.land ? 'url(#lift)' : undefined}>
        <g transform={`rotate(${Math.sin(u * Math.PI * 2) * 10 * (1 - u)} ${x + W / 2} ${y + H / 2})`}>
          <rect x={x - 3} y={y - 3} width={W + 6} height={H + 6} rx={3} fill={pal.ink} />
          <Sitter x={x} y={y} w={W} h={H} t={t} o={1} warm={1} />
          <rect x={x + W / 2 - 1.2} y={y} width={2.4} height={H} fill={pal.ink} />
          <rect x={x} y={y + H / 2 - 1.2} width={W} height={2.4} fill={pal.ink} />
          <rect x={x - W * 0.1} y={y - W * 0.1} width={W * 1.2} height={H + W * 0.2} rx={W * 0.06} fill="none" stroke="#B58F4A" strokeWidth={W * 0.1} opacity={gilt} />
        </g>
      </g>
    );
  }

  // --- the spyglass, in the privacy shot: a dark silhouette creeping in toward her lit window ---
  let spy: React.ReactNode = null;
  if (t >= Q.andThat && t < Q.however) {
    const hw = heroW;
    const tip = front(hw.x + hw.w * 0.78, hw.y + hw.h * 0.42);
    const P = { x: 2010, y: tip.y - 150 };
    const ang = (Math.atan2(tip.y - P.y, tip.x - P.x) * 180) / Math.PI;
    const dist = Math.hypot(tip.x - P.x, tip.y - P.y);
    const ext = Math.min(r(t, Q.privacy - 0.3, Q.privacy + 1.0, EASE_IN_OUT), 1 - r(t, Q.convenience + 0.7, Q.however - 0.05, EASE_IN_OUT));
    spy = <Spyglass x={P.x} y={P.y} angle={ang + Math.sin(t * 1.3) * 0.6} extend={Math.max(0.02, ext)} s={dist / 310} dark />;
  }

  // --- the top room seen from outside: its desk, the quill and the bars of its cage ---
  const LL = lantern(t);
  const roomWarm = Math.max(0.12 * band(t, Q.however, Q.something + 0.2, 0.3, 0.1) * (0.6 + 0.4 * Math.sin(t * 9)), r(t, Q.something, Q.wonderful, EASE_IN_OUT));
  const roomC = mix(mix(pal.ink, pal.towerDark, 0.3), '#F2B470', roomWarm * (1 - r(t, BURST, BURST + 0.3)));
  const qr = quillInRoom(t);
  const roomG = (
    <g>
      <rect x={LL.x - 44} y={LL.y + 44} width={88} height={12} fill={mix('#5A3B2E', pal.ink, 0.3)} />
      <path d={`M${LL.x - 34} ${LL.y + 44} L${LL.x - 28} ${LL.y + 22} L${LL.x + 28} ${LL.y + 22} L${LL.x + 34} ${LL.y + 44} Z`} fill={mix('#3A2A36', '#F6EBD6', roomWarm)} stroke="#21152C" strokeWidth={1} />
      {qr && <Quill x={qr.x} y={qr.y} angle={qr.angle} len={qr.len} flex={Math.sin(t * 3) * 0.6} />}
    </g>
  );
  const bars = [-33, -11, 11, 33].map((dx, i) => {
    // WHY the middle bars bend: the quill tears free through them
    const bow = (i === 1 || i === 2) ? (i === 1 ? -1 : 1) * (8 * r(t, Q.beyond, BURST, EASE_IN) + 38 * r(t, BURST - 0.04, BURST + 0.12, BACK_OUT)) : 0;
    const bx = LL.x + dx, by = LL.y + LL.h / 2;
    return <rect key={i} x={bx - 2} y={LL.y - LL.h / 2} width={4} height={LL.h} rx={2} fill={pal.towerDark} stroke={pal.rim} strokeWidth={0.8} strokeOpacity={0.7} transform={`rotate(${bow} ${bx} ${by})`} />;
  });

  const qf = quillFree(t, cam);
  const dayText = dawn > 0.55;
  const hush = band(t, Q.however, Q.something + 0.3, 0.5, 0.6);
  // WHY a blur only along the motion, only during the whip: a 0.55 s pan across the town would strobe
  // without it; the blur is what makes it read as one fast camera move
  const cam2 = camAt(t + 1 / FPS);
  const v0 = project(cam, K.front, 960, 800), v1 = project(cam2, K.front, 960, 800);
  const whip = t > WHIP_AT && t < Q.aTool + 0.05;
  const bx = whip ? Math.min(12, Math.abs(v1.x - v0.x) * 0.22) : 0, by = whip ? Math.min(12, Math.abs(v1.y - v0.y) * 0.22) : 0;
  const sh = shakeAt(t);

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile(narrator ? 'audio/take1-mix.wav' : 'audio/take1-type-mix.wav')} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <Defs frame={frame} />
        <defs>
          <filter id="lift" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1A0826" floodOpacity="0.45" /></filter>
          <filter id="t1whip" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={`${bx} ${by}`} /></filter>
        </defs>
        {inRoom ? <Room s={roomAt(t)} /> : (
          <g transform={`translate(${sh * 0.6} ${sh})`} filter={bx + by > 0.5 ? 'url(#t1whip)' : undefined}>
            <g transform={layerTransform(cam, K.sky)}><SkyBack pal={pal} field={0.1 + 0.9 * Math.max(0, (dawn - 0.2) / 0.8)} /><Stars o={pal.stars} /><Moon o={pal.moon} /></g>
            <g transform={layerTransform(cam, K.cloud)}><Clouds t={t} pal={pal} /></g>
            <g transform={layerTransform(cam, K.hills2)}><Hills far pal={pal} /></g>
            <g transform={layerTransform(cam, K.hills)}><Hills pal={pal} /></g>
            <g transform={layerTransform(cam, K.towers)}>
              {TOWERS.map((d, i) => {
                if (t > sinkAt(i) + 1.0) return null;
                const g = growthOf(i, t);
                return (
                  <g key={i} transform={`translate(0 ${sinkY(i, t)})`}>
                    <Tower d={d} g={g} t={t} pal={pal} lit={towerLit} crack={crack} flagC={FLAG}
                      room={d.crown === 'lantern' ? roomC : undefined}
                      front={d.crown === 'lantern' ? <>{bars}</> : undefined}>
                      {d.crown === 'lantern' ? roomG : null}
                    </Tower>
                  </g>
                );
              })}
              {onTower && <g transform={`rotate(${hangSwing} ${fr.x + fr.w / 2} ${fr.y - 30})`}>
                <line x1={fr.x + fr.w / 2} y1={fr.y - 30} x2={fr.x + fr.w / 2} y2={fr.y - 4} stroke={pal.ink} strokeWidth={1.6} />
                <FramedCopy x={fr.x} y={fr.y} w={fr.w} h={fr.h} t={t} pop={1} lit={1} />
              </g>}
            </g>
            <g transform={layerTransform(cam, K.back)}><Row row="back" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} townGlow={townGlow} /></g>
            <g transform={layerTransform(cam, K.mid)}><Row row="mid" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} wall={wallBits} />{stringsFor('mid')}</g>
            <g transform={layerTransform(cam, K.front)}>
              <Row row="front" t={t} pal={pal} dawn={dawn} winState={winState} lit={houseLit} inside={inside} door={doorOf} porch={porch} wall={wallBits} />
              {stringsFor('front')}
              {town}
            </g>
            <g transform={layerTransform(cam, K.fore)}><Foreground pal={pal} /></g>
            <Birds t={t} from={Q.free} o={r(t, Q.free, Q.free + 1)} />
            {flying}
            {spy}
            {qf && <Quill x={qf.x} y={qf.y} angle={qf.angle} len={qf.len} flex={Math.sin(t * 9) * 1.2} o={qf.o} />}
          </g>
        )}
      </svg>
      <AbsoluteFill style={{ background: '#07030C', opacity: hush * 0.32 }} />
      <Grain frame={frame} dawn={dawn} />
      <Scrim o={narrator ? Math.max(...HEADLINES.map((h) => Math.min(h.from !== undefined ? r(t, h.from, h.from + 0.25) : r(t, h.words[0].at - 0.4, h.words[0].at), 1 - r(t, h.out - (h.from !== undefined ? 0.4 : 0), h.out + (h.from !== undefined ? 0 : 0.4)))), Math.min(r(t, Q.open - 0.4, Q.open), 1 - r(t, DIP[0], DIP[1]))) : 1 - r(t, END_CARD - 0.4, END_CARD)} dawn={narrator ? dawn : CAP_TONE(t)} strong={!narrator} />
      {narrator ? HEADLINES.map((h, i) => <Headline key={i} words={h.words} out={h.out} from={h.from} t={t} day={false} />) : <Captions t={t} />}
      {/* WHY a veil, then the card: the town stays faintly visible under the last words (no empty frame), and
          the end card's own lavender completes the step when the logo arrives */}
      <AbsoluteFill style={{ background: C.lavender, opacity: narrator ? 0.84 * r(t, DIP[0], DIP[1], EASE_IN_OUT) + 0.16 * r(t, END_CARD - 0.3, END_CARD, EASE_IN_OUT) : r(t, END_CARD - 0.4, END_CARD, EASE_IN_OUT) }} />
      {t >= END_CARD && <EndCard at={END_CARD + 0.05} />}
      {/* the last headline sits on the clean lavender after the dip and is gone 4 frames before the card */}
      {narrator && <Headline words={FINAL} out={FINAL_FADE[1]} fade={FINAL_FADE[1] - FINAL_FADE[0]} t={t} day={dayText} />}
    </AbsoluteFill>
  );
};
