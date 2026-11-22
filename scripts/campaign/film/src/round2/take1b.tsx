// Round two, take 1 variant B: "The same screen, everywhere." (the wall of screens)
// One dark wall of devices in one room, and three things on it we follow from start to finish: the big TV at the
// top (the companies), one person's phone in the middle (us), and that phone's three private things (their photos,
// Sam's message, "pick up Mia at 3:15"). From the TV the companies rearrange every screen at once, row by row; they
// padlock the laptop, hang a price tag on the tablet and make the person's phone print a receipt of their private
// things. Everyone accepts. Then a single cursor wakes up in the dark TV: the companies made it and put a price on it,
// but it gets away, down the wall into the person's phone, which becomes a real youcoded window. The person types a
// plain request and the app makes them a pickup board from their own things. Then the wall becomes everyone's own
// youcoded, screen by screen: padlocks off, the tag turns to "free", the receipt rolls back into the phone, daylight
// opens out of it, the dead TV finally becomes someone's too, and the board is picked up by two neighbours, each
// filled with their own life and in their own look.
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
//
// Round six (the agreed picture plan): no pointers anywhere; no drawn "ask" bar; every "own" screen is a real capture
// of the youcoded window (public/stills/r4); the hero's request is the real app's own box, typed one real character at
// a time; every shot stays in the room, on the shelves.
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS, MONO } from '../brand';
import { EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { LOCK_SIZE, Lock, OwnScreen, RealApp, SameScreen, WALL_VARIETY, look, lookFor, r4, tileCenter } from './take1b-screens';
import { BackWall, DayRoom, Dev, Device, PLANK, PriceTag, Shelves, WORLD, WallGlow, dev } from './take1b-world';
import TYPE from '../../public/stills/r4/golden-sunbreak-phone-type.json';
import { BILL_N, BILL_X, BillStack, BillTotal, SHARE, ShelfReceipt, billGrowth, receiptBottom, receiptOutline } from './take1b-scenes';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const HERO = dev('hero'), TV = dev('tv'), LL = dev('lockLaptop'), TT = dev('tagTablet'), L0 = dev('0:l0');
const MAXD = Math.max(...WORLD.devs.map((d) => d.dist));
const jit = (d: Dev) => ((Math.abs(Math.sin(d.cx * 0.013 + d.cy * 0.007)) * 1000) % 1);
const top = (d: Dev) => d.cy - d.h / 2;
const hy = HERO.cy;

// ---------- the timeline's derived moments ----------
const CUT_PRIVACY = Q.privacy + 0.1;                 // the "own nothing." headline has had its minimum hold by here
// (9) the ending. WHY this order (reviewer 2026-11-20): the wall goes soft and pale under "open source everything."
// so the words sit on a calm backdrop; the words leave completely; only then does the calm wall give way to the
// end card, already whole (never a ghost of the headline over the wall, never a half-built card).
const CALM0 = Q.open - 0.15;
const END_FADE = Math.max(LAST_WORD_END + 0.2, Q.open + 2.3);    // the headline is gone by here
const END_CARD = END_FADE + 0.06, END_X = 0.3;                   // then a short dissolve to the end card
// (1) the two moments the TV rearranges every screen
// WHY TECH a beat early (review: the row-0 pour delay put the snap 0.3 s after "technology" began): the person's shelf
// lands its snap just as the word starts
const DICT = Q.dictated + 0.06, TECH = Q.technology1 - 0.14;
// (2) the padlocks and the terms
// WHY from just before "could", 0.085 s apart, each 0.34 s long (review): the sixth lock has landed about a quarter of
// a second before the cut on "what", so the full row of six is seen at rest
// (0.42 long since round 8: each now falls from above the screen's top edge, so it needs a frame more of fall)
const LOCK0 = Q.could - 0.02, LOCK_GAP = 0.085, LOCK_DUR = 0.42;
if (LOCK0 + 5 * LOCK_GAP + LOCK_DUR * 0.4 > Q.cost - 0.2) throw new Error('take1b: the last padlock would land as the shot cuts');
// WHY earlier and a shorter gap to the person (review: their card cleared two frames before the cut, so the shot's
// payoff, the last and most hesitant press, was never seen settled): their card is gone about a third of a second
// before "We"
const ACCEPT = Q.acceptedIt - 0.08;
// WHY uneven gaps (plan): three people giving in one at a time, the person with the receipt last and a little hesitant
const ACCEPT_AT: Record<string, number> = { '0:l0': ACCEPT, tagTablet: ACCEPT + 0.13, hero: ACCEPT + 0.36 };
// (the card is gone 0.5 s after the press starts: SameScreen's accept runs 0.6 s and the card has left by 0.84 of it)
if (ACCEPT_AT.hero + 0.5 > Q.weAccepted - 0.2) throw new Error('take1b: the hero phone\'s terms card would still be up at the cut');
const TAG_DROP = Q.costWord - 0.3;
// (4) "However": the wall hushes and the TV goes fully black; on "something" a cursor is born in it
const HUSH = Q.however;
const CURSOR_AT = Q.something + 0.04;

// (5) the cursor in the black TV. WHY a typed line and nothing else (plan): the new AI is one thin cream cursor that
// can make things; no bar, no glow, no interface. It types its own question on "intelligence".
const TV_LINE = 'what should i make?';
const TV_FS = 58, TV_ADV = TV_FS * 0.6;              // world px: the line's type size, and one monospaced letter's width
// WHY the line AND its tag centred together (round 2 review: the line sat left of centre with the tag hanging off its
// right, so the close-up was lopsided): the tag hangs TAG_GAP past the line's end, and the pair is centred in the TV
const TAG_GAP = 130;
const TV_LX = (TV.w - TV_LINE.length * TV_ADV - TAG_GAP - 95) / 2;  // where the finished line starts, from the TV screen's left edge
export const TV_CURSOR = { w: 8, h: 78 };            // world px: thin like the real caret, still readable as it crosses the wall
// the cursor's own letters: a quick, even typist (it is the machine), a beat after each space. WHY it may run a few
// tenths into the close-up: a cut on the action, the closer framing picks the line up mid-word
const TV_TYPE: number[] = (() => {
  const out: number[] = []; let t = Q.intelligence + 0.02; let seed = 7;
  for (let i = 0; i < TV_LINE.length; i++) {
    out.push(t);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    t += 0.05 + (seed % 1000) / 1000 * 0.025 + (TV_LINE[i] === ' ' ? 0.05 : 0);
  }
  return out;
})();
const CREATED_DIP = Q.created1 + 0.02;               // the wall dips as one, poured down from the TV: it is wired to it
// "a great treasure": the same cream tag as the tablet's is let down slowly from "believed" and lands on "treasure";
// on "value" a small $20/mo tag pops onto every other screen, poured down from the TV like every order
const PRICE_ALL = Q.value + 0.04;
// (6) the blink quickens on "excitement"; on "far" their tag drops off and the cursor gets away
// WHY 0.4 s hops (review: at 0.34 the follow read as a whip and the landings could not be seen)
// (0.45 s and 70% moving since round 2: at 0.4 the cursor still crossed the wall as a sliver; now each landing on a shelf
// lip is held for four frames, and it drops into the phone during "control")
const HOP0 = Q.far + 0.2, HOP = 0.45, HOP_MOVE = 0.7, LAND = HOP0 + 2 * HOP + HOP_MOVE * HOP;
// the hero's request: real stills of the app with one more real character typed into its own box (take1b-library.mjs)
// WHY sent on "monopolies" itself (review: sent later, the app's working beat played during a fast pull-back and could
// not be read): the box is seen empty for a beat, then the camera settles on the sent message and the app working
const SEND = Q.monopolies1;
const TYPE_AT: number[] = (() => {
  // WHY this rhythm (owner: "the typing feels broken/laggy"): 75-125 ms a letter, a little longer after each space,
  // one 0.25 s hesitation before "pickup", so it reads as a person's fingers, never a machine or a stall
  const gaps: number[] = []; let seed = 11;
  for (let i = 0; i < TYPE.n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    gaps.push(0.075 + (seed % 1000) / 1000 * 0.05 + (TYPE.text[i - 1] === ' ' ? 0.14 : 0) + (TYPE.text.slice(i).startsWith('pickup') ? 0.25 : 0));
  }
  const total = gaps.reduce((a, g) => a + g, 0);
  // the last letter lands about 0.6 s before it is sent: a glance at what was typed, then send
  let t = Math.max(Q.aTool + 0.15, SEND - 0.6 - total);
  return gaps.map((g) => (t += g) - g);
})();
const TYPE0 = TYPE_AT[0];
// WHY the push into the box starts as soon as the window has opened and runs a full second and more (round 2 look
// check: squeezed into the 0.65 s before the first letter, a 2.6x zoom read as a lurch)
const MACRO = LAND + 0.45;
const FLIP_HERO = Q.forAnyone;                       // the board the app made arrives on "for anyone who asks"
const WHO_AT = (i: number) => Q.who + i * 0.4;       // three neighbours turn into their own windows on "who"
// (7) the lateral track along the shelves, then the three callbacks
// WHY closer, on two shelves, and timed (round 2 review: at 1.05 twenty small screens flipped at once and read as
// confetti): at 1.4 about eight screens are in frame on the laptop's and the person's shelves, each opening as it
// reaches the middle, and the person's phone (board and receipt) crosses the centre on "we get to decide", with the
// still-locked laptop above it and the still-tagged tablet beside it
const TRACK_S = 1.4, TRACK_Y = -360, TRACK_LEAD = 120;
const TRACK_X1 = 610, TRACK_X0 = TRACK_X1 - 2600;
{ const at0 = Q.andSo + (-TRACK_X0 / (TRACK_X1 - TRACK_X0)) * (Q.canDo - Q.andSo); if (at0 < Q.firstTime + 1.5 || at0 > Q.decide + 0.3) throw new Error(`take1b: the person's phone would cross the track's centre at ${at0.toFixed(2)} s, not on "we get to decide"`); }
// WHY the laptop opens on "can" (review: it opened half a second early, on "computers", and took the punch out of
// "can do"); the padlocks are knocked off on "What", a second before, so the empty tiles are seen unlocked first
// WHY the padlocks leave one by one, 0.12 s apart, and the studio opens fast and is held (round 2 review: 0.9 s of
// static empty tiles, then the studio was up for only half a second): the locks tumble through the beat before "can",
// and the cut to the tablet waits for "it"
const UNLOCK = Q.canDo + 0.1, LL_FLIP = Q.can - 0.16, LL_REVEAL = 0.4;
const LL_UNLOCK_AT = (i: number) => UNLOCK + i * 0.12;
const CUT_TT = Q.costs + 0.33;                        // "What it": the tablet shot starts on "it"
const STRIKE = CUT_TT + 0.02, TT_FREE = Q.costsWord, TT_FALL = Q.costsWord + 0.1, TT_FLIP = Q.costsWord + 0.2;
const REWIND0 = Q.whatHappens + 0.25, REWIND1 = Q.whatHappens + 1.3;
// (8) the TV is the last holdout: everything holds still, then it opens on "past"
const TV_FLIP = Q.past;
// (9) the board passes to two neighbours, each in their own look with their own life in it
// (the line 9 shot starts 0.2 s later since round 2, so the TV's own reveal is held longer; the first pass moves with it)
const CUT_L9 = Q.timeWord - 0.1;
const SHARE_AT = [Q.timeWord + 0.35, Q.longFirst - 0.1], SHARE_REVEAL = 0.6;
// WHY the pull back starts on "last" and runs long (review: it snapped from close to wide in three frames on "open")
const SHARE_HOLD = Q.last + 0.05;
// WHY 0.7 s eased out (round 2 review: at 1 s eased in and out the TV was fully open for only 0.45 s before the cut)
const TV_REVEAL = 0.7;

const HEADS: { text: string; at: number; out: number; stagger?: number }[] = [
  { text: 'own *nothing.', at: Q.own, out: CUT_PRIVACY },
  // WHY from "truly" (reviewer): it used to be whole two seconds before "happened" was said
  { text: 'something *wonderful happened.', at: Q.truly, out: Q.blinded - 0.04 },
  // WHY a few frames after the board (round 2 review): the board, not the type, is what changes on "for"; and gone a
  // quarter second before the cut, so it never ghosts into the track. It arrives whole (stagger 0), like "own nothing."
  { text: 'for *anyone who asks.', at: FLIP_HERO + 0.08, out: Q.andSo - 0.2, stagger: 0 },
  { text: 'open source *everything.', at: Q.open, out: END_FADE },
];
// WHY checks: the brand guide's muted-video rule (1.2 s + 0.25 s a word), and beats that need room. If the
// voice is re-timed and something would flash by, the render stops instead of shipping it.
for (const h of HEADS) {
  const words = h.text.split(/\s+/).length;
  if (h.out - h.at < 1.2 + 0.25 * words) throw new Error(`take1b: headline "${h.text}" is up ${(h.out - h.at).toFixed(2)} s, needs ${1.2 + 0.25 * words} s`);
}
if (END_CARD + 2.5 > 75) throw new Error('take1b: the end card would be held under 2.5 s');
if (WALL_VARIETY < 20) throw new Error(`take1b: the wall uses only ${WALL_VARIETY} different stills, needs 20`);
if (TV_TYPE[TV_TYPE.length - 1] > Q.aTechnology + 0.6) throw new Error('take1b: the cursor would still be typing at the cut');
if (TYPE0 - MACRO < 0.9) throw new Error('take1b: the push into the message box would be under 0.9 s (a lurch)');
if (SEND + 0.5 > FLIP_HERO) throw new Error('take1b: the app would not be seen working before the board arrives');
if (SHARE_HOLD - (SHARE_AT[1] + SHARE_REVEAL * 0.6) < 0.8) throw new Error('take1b: the shared copies would not be held together');
if (CUT_TT - (LL_FLIP + LL_REVEAL) < 0.6) throw new Error('take1b: the opened laptop would be held fully open under 0.6 s');
if (Q.whatHappens - TT_FLIP < 0.9) throw new Error('take1b: the freed tablet would be up under 0.9 s');
if (TV_FLIP - Q.freeWord < 1.5) throw new Error('take1b: the TV would open before the daylight has settled');
if (CUT_L9 - (TV_FLIP + TV_REVEAL) < 0.5) throw new Error('take1b: the TV\'s film night would be held fully open under 0.5 s');

// ---------- when each screen becomes someone's own ----------
const STORY = ['hero', 'lockLaptop', 'tagTablet', 'tv'];
// WHY these three (plan): ordinary neighbours of the hero, not story devices, so the wall's turn starts next door
const FIRST_FOLLOWERS = ['0:l0', '0:r1', '-1:l0'];
// the devices the lateral track passes: they change as the camera reaches them
const TRACKED = (d: Dev) => d.row >= -1 && d.row <= 0 && d.cx > TRACK_X0 - 1100 && d.cx < TRACK_X1 + 1100 && !STORY.includes(d.id) && !FIRST_FOLLOWERS.includes(d.id);
// When each screen the track passes turns its own. WHY (round 2 review): a clamp made the whole left third of the wall
// flip at once on "And so". Now a screen already past the frame's centre when the track starts turned while the camera
// was elsewhere (hidden, during "for anyone who asks", far off to the left of that shot); every other one turns as it
// reaches the centre, and no two turns in frame start within a tenth of a second of each other (so never more than two
// in any 0.2 s).
const TRACK_FLIP: Map<string, number> = (() => {
  const out = new Map<string, number>();
  const live: { id: string; t: number }[] = [];
  for (const d of WORLD.devs.filter(TRACKED)) {
    const tc = Q.andSo + ((d.cx - TRACK_LEAD - TRACK_X0) / (TRACK_X1 - TRACK_X0)) * (Q.canDo - Q.andSo);
    if (tc < Q.andSo + 0.1) out.set(d.id, Q.who + 1.3 + jit(d) * 0.3);
    else live.push({ id: d.id, t: tc + jit(d) * 0.08 });
  }
  live.sort((a, b) => a.t - b.t);
  let last = -9;
  for (const x of live) { const t = Math.max(x.t, last + 0.105); out.set(x.id, t); last = t; }
  return out;
})();
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return FLIP_HERO;
  if (d.id === 'lockLaptop') return LL_FLIP;
  if (d.id === 'tagTablet') return TT_FLIP;
  if (d.id === 'tv') return TV_FLIP;
  const fi = FIRST_FOLLOWERS.indexOf(d.id);
  if (fi >= 0) return WHO_AT(fi);
  const tf = TRACK_FLIP.get(d.id);
  if (tf !== undefined) return tf;
  // everything out of shot changes in a ripple over the same seconds, so the wide shots later are complete
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.canDo - Q.andSo - 0.3) + jit(d) * 0.25;
};
const SAME_GLOW = 'rgba(236,230,244,1)';
const DEAD_GLOW = 'rgba(14,9,20,1)';

// ---------- the hero phone's real window ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
const [SW, SH] = TYPE.full;                          // the stills' pixel size (1170 x 2442: the phone's exact shape)
// the real caret in those stills, measured from the pixels: x 264-266, y 2205-2270, colour #F8E8C8
const CARET = { x: HS.x + (265 / SW) * HERO.w, y: HS.y + (2237.5 / SH) * HERO.h, h: (66 / SH) * HERO.h, w: (3 / SW) * HERO.w };
const CARET_COL = '#F8E8C8';
const BOX_AT = `50% ${((2237 / SH) * 100).toFixed(1)}%`;   // the message box, where the board opens from
// where the real caret sits: the window opens from exactly where the escaping cursor lands (round 2 review)
const CARET_AT = `${((265 / SW) * 100).toFixed(1)}% ${((2237.5 / SH) * 100).toFixed(1)}%`;
const HERO_BASE = r4('golden-sunbreak-phone-type-base');    // the window, the box empty, caret in its "off" half
const strip = (i: number) => r4(`golden-sunbreak-phone-type-${String(i).padStart(2, '0')}`);
const typedAt = (t: number) => TYPE_AT.filter((a) => t >= a).length;

/** The hero phone as the real youcoded window, from the moment the cursor lands until the board arrives. */
const HeroWindow: React.FC<{ t: number }> = ({ t }) => {
  const W = HERO.w, H = HERO.h;
  if (t >= SEND) return <RealApp src={r4('golden-sunbreak-phone-asked')} w={W} h={H} />;
  const n = typedAt(t);
  // WHY two stills for the idle blink: the box empty with its caret off (base) and on (strip 0), both real; while
  // typing, every strip is the real box a moment after a real keystroke, when the caret is always on
  const on = n > 0 || Math.floor((t - LAND) / 0.5) % 2 === 0;
  const src = n > 0 ? strip(Math.min(n, TYPE.n)) : on ? strip(0) : null;
  return (
    <>
      <RealApp src={HERO_BASE} w={W} h={H} />
      {src && <RealApp src={src} w={W} h={H * (SH - TYPE.y0) / SH} style={{ top: H * TYPE.y0 / SH }} />}
    </>
  );
};
// the made board's three parts, as bands of the still (fractions of its height): time, Sam's message, their photos
const BOARD_BANDS: [number, number][] = [[0.062, 0.3], [0.3, 0.445], [0.445, 0.93]];
/** The pickup board the app made, inside the real Golden Sunbreak window. `p` is its build, starting a quarter built:
 *  the time first, then Sam's message, then the photos settle in, each rising a little and coming into focus.
 *  WHY over the board's own empty still (round 6 review: the parts used to settle over black, so the reveal read as
 *  the phone going dark): under the parts is the same window and its sunlit wallpaper, as the app draws it. */
const HeroBoard: React.FC<{ p: number }> = ({ p }) => {
  const W = HERO.w, H = HERO.h, src = r4('golden-sunbreak-phone-mine');
  return (
    <>
      <RealApp src={r4('golden-sunbreak-phone-mineempty')} w={W} h={H} />
      {BOARD_BANDS.map(([a, b], i) => {
        const k = cl(p * 4 - i);
        const s = k * k * (3 - 2 * k);
        if (s <= 0) return null;
        return <div key={`b${i}`} style={{ position: 'absolute', inset: 0, clipPath: `inset(${a * 100}% 0 ${(1 - b) * 100}% 0)`, opacity: s, transform: `translateY(${(1 - s) * 6}px)`, filter: s < 1 ? `blur(${(1 - s) * 2.5}px)` : undefined }}><RealApp src={src} w={W} h={H} /></div>;
      })}
    </>
  );
};

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
// focus: sharp devices; semi: slightly soft ones (a lens's shallow depth, the neighbour just behind the plane);
// soft: the background's blur in world px when it should be softer than the zoom alone gives; par: how much less the
// shelf below moves than the camera (parallax), for the tilts that follow the receipt; bill: the camera climbs
// with the pile of charges; bgDim: how much the background is stopped down so a cream receipt or the white total
// keeps its contrast against the bright soft screens behind it; fn: a camera that follows something (the cursor)
// semiBlur: how soft the "semi" devices are, as a share of the background's blur (default 0.3); tagDim: an extra
// stop-down on the tablet's tag when it would otherwise be the brightest blur in frame
type Shot = { at: number; ease?: (p: number) => number; keys: [number, Cam][]; focus?: string[]; semi?: string[]; semiBlur?: number; soft?: number; par?: number; bgDim?: number; tagDim?: number; bill?: boolean; linear?: boolean; rack?: [number, number, number]; fn?: (t: number) => Cam };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the laptop's tile row, for the padlock macro
const LL_AT = (() => { const a = tileCenter(LL.w, LL.h, 2, 2); return `50% ${((a.y / LL.h) * 100).toFixed(1)}%`; })();
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
// the cursor's line on the TV, in world px
const TV_L = TV.cx - TV.w / 2;
const LINE_Y = TV.cy;
const LINE_END = TV_L + TV_LX + TV_LINE.length * TV_ADV;
const TAG_X = LINE_END + TAG_GAP, TAG_LEN = 640;          // their tag hangs on a long string from above, beside the line
const TAG_Y = LINE_Y - 50 - TAG_LEN;
// WHY it starts just above the close-up's top edge (review: it came from so high that nothing was seen for the first
// second of "a technology they believed"): it is seen coming down for the whole two seconds, landing on "treasure"
const TAG_RISE = 50 + 1080 / 2 / 1.8 - 20 + 110;
const CLOSE_X = (TV_L + TV_LX + TAG_X + 95) / 2;      // the close-up holds the whole line and its tag
// the message box close-up: the box along the bottom of the frame, the chips and a band of the wallpaper above it.
// WHY the box's lower edge just inside the frame (round 6 review): the model's row under it and the receipt below the
// phone both stay out of shot, so the only words in frame are the person's own
// WHY the box well inside the frame, scale 6 (round 2 review: the box was jammed against the bottom edge under a
// painting of a building, and the phone floated in a void): the chips and a band of the sunlit wallpaper above it, the
// phone's lower bezel corners, its shelf lip and the soft lit edges of its neighbours below and beside it. The row under
// the box shows the friendly model name the plan allows.
const BOX_Y = HS.y + ((TYPE.box[1] + TYPE.box[3] / 2) / SH) * HERO.h;
// (box at about 76% after a look at the frames: any lower and the receipt's heading filled the bottom of the shot)
const MACRO_CAM: Cam = [HERO.cx, BOX_Y - 0.26 * 1080 / 6, 6.0];
// the app working: the upper part of the phone, the sent bubble and the working line under it
// WHY a cut on the send, to the top of the same phone at the same closeness (round 2 review: the old cut went to a
// medium where the sent bubble was a tiny chip and the working word could not be read): the sent words and the app's
// own working line sit at about 40% of the frame, type about 28 px tall, the phone's top edge in frame
const WORKING: Cam = [HERO.cx, HS.y + 0.183 * HERO.h, 5.7];
// "shareholder value": the TV whole at the top, the shelves below it down to the person's phone
// WHY a three-shelf medium, not the whole wall (round 2 review: the tags were white specks): the TV whole at the top,
// the laptop's shelf and the person's below it, so each $20/mo reads as a tag
const VALUE_MED: Cam = [0, -800, 0.78];
// "but in their excitement": back up only part of the way, the TV and the shelf below it, so the escape starts from a
// framing that already shows where the cursor will go (and the follow starts exactly here)
const ESC_START: Cam = [TV.cx + 30, -1060, 1.32];
// "who": the person's phone above the headline's band, the laptop beside it and the phone above that laptop
// "for anyone who asks": the whole phone with the board, kept above the headline's band (WHY, round 2 review: the board
// is the act's payoff and was full size for only 0.6 s), then on "who" a three-device medium where the neighbours turn
const PHONE_WHOLE: Cam = [HERO.cx, -62, 2.2];
const MED3: Cam = [94, -100, 1.45];
// "It's time, at long, long last": five devices on the person's shelf
// WHY four, not five, and closer (review: at the five-device width the hero was 160 px wide and "Leo" and "swim"
// could not be read): the person's phone, the laptop the board passes to, the tablet, and the phone it passes to next
const FIVE = ['0:l0', 'hero', 'tagTablet', '0:r1'].map(dev);
const FIVE_L = Math.min(...FIVE.map((d) => d.cx - d.w / 2)), FIVE_R = Math.max(...FIVE.map((d) => d.cx + d.w / 2));
const FIVE_S = 1920 / (FIVE_R - FIVE_L + 150);

// the escaping cursor's path: its line's end in the TV, a landing on the TV's shelf lip, one on the shelf below, then
// into the person's phone exactly where the real caret sits
// (the TV cursor's own size out in the room: with the closer follow it is about 14 x 125 px on screen)
const ESC = { w: 9, h: 80 };
const HOPS = [
  { x: LINE_END + 4 + TV_CURSOR.w / 2, y: LINE_Y, h: TV_CURSOR.h, w: TV_CURSOR.w },
  // WHY a little larger out in the room (review: 4 px wide on a full frame, it vanished against the pale screens)
  { x: TV.cx + TV.w / 2 + 110, y: TV.shelf - ESC.h / 2, h: ESC.h, w: ESC.w },
  { x: LL.cx + LL.w / 2 + 70, y: LL.shelf - ESC.h / 2, h: ESC.h, w: ESC.w },
  { x: CARET.x, y: CARET.y, h: CARET.h, w: CARET.w },
];
const cursorAt = (t: number): { x: number; y: number; h: number; w: number; sq: number } => {
  if (t <= HOP0) return { ...HOPS[0], sq: 0 };
  if (t >= LAND) return { ...HOPS[3], sq: 0 };
  const j = Math.min(2, Math.floor((t - HOP0) / HOP));
  // WHY 70% moving, 30% resting: it visibly lands on each shelf lip (four frames) before it jumps again
  const p = lin(t, HOP0 + j * HOP, HOP0 + (j + HOP_MOVE) * HOP);
  const e = EASE_IN_OUT(p);
  const a = HOPS[j], b = HOPS[j + 1];
  const arc = Math.sin(Math.PI * p) * (j === 2 ? 90 : 150);
  // a short squash where it lands, like something with a little weight
  const sq = p >= 1 ? bump(t, HOP0 + (j + HOP_MOVE) * HOP, 0.17) : 0;   // five frames, deep enough to see
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - arc, h: lerp(a.h, b.h, j === 2 ? EASE_IN(p) : e), w: lerp(a.w, b.w, j === 2 ? EASE_IN(p) : e), sq };
};
/** The camera that follows the cursor down the wall: it leaves the TV close-up, tracks the cursor with a slight lag
 *  (a hand-held operator follows, never leads), and settles on the person's phone as the window opens. */
const followCam = (t: number): Cam => {
  const startC: Cam = ESC_START;
  const endC: Cam = [HERO.cx + 30, hy + 30, 2.3];
  // the lagging follow: the cursor's average place over the last quarter second
  let fx = 0, fy = 0;
  for (let k = 0; k < 8; k++) { const c = cursorAt(t - (k / 7) * 0.25); fx += c.x; fy += c.y; }
  fx /= 8; fy /= 8;
  // WHY 1.25 (review: at 1.05 the cursor was a hair and the move read as a whip): closer, so the cursor is big and
  // the camera visibly trails it down the wall rather than racing past it
  // (1.6 since round 2: the cursor reads as an object crossing the room, and the camera, a frame width of only about
  // 1200 world px, visibly trails it from lip to lip instead of whipping past)
  const follow: Cam = [lerp(0, fx, 0.85), fy + 40, 1.6];
  const a = ez(t, Q.far + 0.05, HOP0 + 0.35, EASE_IN_OUT);     // ease out of the TV framing into the follow
  // WHY settled ON the landing (round 2 review: the phone was still moving as its window opened)
  const b = ez(t, LAND - 0.75, LAND, EASE_IN_OUT);
  const mix = (u: Cam, v: Cam, q: number): Cam => [lerp(u[0], v[0], q), lerp(u[1], v[1], q), Math.exp(lerp(Math.log(u[2]), Math.log(v[2]), q))];
  const c = mix(mix(startC, follow, a), endC, b);
  // and once on the phone, a gentle push in towards its message box while its window wakes (WHY, review: the static
  // second here made the cut to the box close-up feel like a jump; now the cut continues a move already under way)
  return c;
};

/** A camera that tilts down after the receipt as it prints. WHY (review): keyed moves lagged the paper, so a new line
 *  printed half below the frame edge before the camera caught up. This one aims each new line's bottom at about 80%
 *  of the frame height a tenth of a second AHEAD of the paper (it leads, never chases), smoothed over a third of a
 *  second so it glides, and never rises above `yMin`. Its zoom eases from s0 to s1 over the shot. */
// keep: how much of the phone must stay in frame, as the world y that must stay at least 4% inside the top edge
const paperCam = (t0: number, t1: number, s0: number, s1: number, yMin: number, keep: number, at = 0.84) => (t: number): Cam => {
  const s = Math.exp(lerp(Math.log(s0), Math.log(s1), EASE_IN_OUT(lin(t, t0, t1))));
  const H = 1080 / s;
  let y = 0;
  for (let k = 0; k < 9; k++) {
    const u = t + 0.1 + (k / 8 - 0.5) * 0.36;
    y += Math.min(keep + 0.46 * H, Math.max(yMin, receiptBottom(u) - (at - 0.5) * H));
  }
  return [0, y / 9 + 6 * lin(t, t0, t1), s];      // plus a very slow drift, so the frame never sits dead still
};
/** The bill: as the pile grows the camera eases back (WHY, review: the old camera climbed with the pile and lost the
 *  person's phone, its receipt and the tablet's tag right as "own nothing." landed), keeping the whole pile, the
 *  phone and the tag in frame; after "own" a slow push in. */
const billCam = (t: number): Cam => {
  const g = EASE_IN_OUT(cl((billGrowth(t) - 2) / (BILL_N - 2)));
  const push = ez(t, Q.own + 0.2, CUT_PRIVACY + 0.4, EASE_IN_OUT);
  // WHY it settles with the shelf at about 62% of the frame: the whole pile then stands on the plank above the
  // headline's band, never cut off by it (cut off, the pile looked as if it floated)
  // (x further right since round 8: the pile now stands right of the tablet's centre and must stay whole in frame)
  return [lerp(175, 205, g), lerp(-150, -92, g), Math.exp(lerp(Math.log(1.7), Math.log(1.35), g)) * (1 + 0.03 * push)];
};
// the "However" wide's last framing; line 5's push up to the TV starts from exactly here (no jump at "Blinded")
// WHY this framing (review: phone, receipt and TV all clear of the headline band): the whole TV just inside the top
// edge, the person's phone just above the band, which for this headline starts lower (BAND_LOW)
// WHY 0.5 and lower (round 7 review: the turn was a near-static wide with a tiny subject): the push from "recently"
// lands closer, the TV with a little headroom at the top, the lit phone just above the lowered headline band
const HUSH_END: Cam = [0, -485, 0.5];

const SHOTS: Shot[] = [
  // (1) low angle on the whole wall: the TV whole at upper centre in the room's one warm light, the person's phone
  // in the middle. It opens closer, tilted and out of focus, and settles; on "corporations" it eases towards the TV.
  // WHY the last half second drifts down (review): the camera eases a little towards the person's phone just before the
  // cut, so the two-shot pushes in along the same line and the phone reads as "that one, in the middle of the wall"
  // WHY it opens lower and less defocused (review: the first frame was mush with the TV's top cut off), and the push
  // after "dictated" stops lower (review: it pushed the TV's top edge against the frame's top): the TV keeps its
  // headroom from the first frame to the cut
  { at: Q.start, keys: [[0, [0, -745, 0.7, 8, -3]], [1.3, [0, -700, 0.55, 4, 0]], [Q.corporations, [0, -705, 0.55, 4, 0]], [Q.dictated + 0.45, [0, -725, 0.6, 3, 0]], [Q.interact, [20, -705, 0.62, 3, 0]]], rack: [0, 1.1, 6] },
  // "how you interact": the person's phone sharp, the tablet beside it softer; both snap on "technology".
  // WHY wider and lower than before (review: the phone was jammed against the left edge with a dead black right side
  // and nothing glowing behind): the pair sits centred, the lit bottoms of the shelf above glow across the top of the
  // frame, and the tablet is visibly a plane behind the phone
  { at: Q.interact, keys: [[Q.interact, [TWO_X - 40, hy - 60, 2.05]], [Q.decided, [TWO_X - 40, hy - 56, 2.16]]], focus: ['hero'], semi: ['tagTablet'], semiBlur: 0.55, soft: 3.2 },
  // (2) "what your computers could do": a macro on the laptop's tiles as the padlocks snap shut. WHY lower than before
  // (review): a sliver of the laptop's lit keyboard deck shows at the bottom, so it reads as a computer, not a panel,
  // while its "Good morning" title stays whole at the top
  { at: Q.decided, keys: [[Q.decided, [LL_GRID.x, LL_GRID.y - 26, 3.3]], [Q.cost, [LL_GRID.x + 20, LL_GRID.y - 26, 3.6]]], focus: ['lockLaptop'] },
  // WHY tighter (review: the tablet filled a third of the frame under an empty shelf, its tag tiny): the tablet and its
  // tag fill the frame, the person's phone stays in at the left, the top edge on the dark wall under the shelf above
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 90, TT.cy - 15, 2.4]], [Q.data, [TT.cx - 90, TT.cy - 15, 2.5]]], focus: ['tagTablet'] },
  // "and what happened with your personal data": the phone close on its shelf; the switch flips by itself, and the
  // receipt prints out of it over the shelf lip; the camera tilts down ahead of the paper
  // (the whole phone stays in frame: its switch and its three things are what the receipt is a copy of)
  { at: Q.data, keys: [[Q.data, [0, hy, 2.42]]], fn: paperCam(Q.data, Q.weAll, 2.42, 2.5, hy, top(HERO) - 8, 0.72), focus: ['hero'], par: 0.45, bgDim: 0.35, tagDim: 0.62 },
  // (3) "and we all... we all just accepted it": looking down on the wall, the whole TV in the top of the frame, the
  // terms card poured down from it; padlocks, tag and receipt all findable. Then three accept, the person last
  // WHY a touch tighter (review: padlocks, tag and receipt were 15-25 px and could not be found in 1.1 s)
  { at: Q.weAll, keys: [[Q.weAll, [0, -610, 0.55, -20, 0]], [Q.weAll2, [0, -640, 0.57, -18, 0]]] },
  // WHY a push towards the person's phone during the last press (review): its hesitant press is the shot's payoff
  // (and larger, eased INTO the person's press, review: 1.72 to 1.92 barely registered)
  { at: Q.weAll2, keys: [[Q.weAll2, [TRIO_X, hy - 30, 1.7]], [ACCEPT_AT['0:l0'], [TRIO_X - 4, hy - 30, 1.74]], [ACCEPT_AT.hero + 0.1, [HERO.cx + 20, hy - 22, 2.05]], [Q.weAccepted, [HERO.cx + 16, hy - 22, 2.1]]], focus: TRIO },
  // "subscribe to everything and own nothing": the charges stack on the shelf in front of the tagged tablet, beside
  // the same phone
  { at: Q.weAccepted, keys: [[Q.weAccepted, [175, -150, 1.7]]], fn: billCam, bill: true, soft: 3.2, bgDim: 0.4 },
  // "our privacy would be the cost of convenience": the same receipt, close; four more lines print, one per word.
  // WHY 3.1, not 4.3 (review): the phone's lower third and the shelf lip stay in frame the whole time, with the bright
  // soft screens of the shelf below behind the paper, instead of a strip of paper in a void
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 3.05]]], fn: paperCam(CUT_PRIVACY, Q.however, 3.05, 3.2, -60, HERO.cy + 0.15 * HERO.h, 0.74), focus: ['hero'], par: 0.45, bgDim: 0.28, tagDim: 0.62 },
  // (4) "however, recently...": the wide wall hushes, the TV goes black, the person's phone is the last light; on
  // "something" a cursor is born in the black TV and a slow push up towards it begins
  // WHY a real push that starts on "recently" (review: 0.44 to 0.48 was a push nobody saw): "However" dims a still
  // frame first, then one long eased move up and in carries through the cursor's birth to "Blinded"
  { at: Q.however, keys: [[Q.however, [0, -300, 0.42]], [Q.recently + 0.1, [0, -305, 0.423]], [Q.blinded, HUSH_END]] },
  // (5) "blinded by their own hubris, these corporations": the push carries on up the shelves until the black TV
  // fills the upper half, landing on "corporations"; the wall below comes back up, small and obedient. Then through
  // "artificial" a slow push in on the TV, where the cursor types its own line on "intelligence".
  // WHY never still and never cut (round 6 review: six seconds of a dead black TV, then a lurching push and a cut while
  // the letters typed): after the push lands, a slow drift; from "technology" one steady push in that lands as the
  // cursor starts typing, so the letters appear in an almost still frame, already at the close-up's framing
  // (round 2: a gentler ease with a constant share, so the push starts moving at once instead of hesitating then lunging)
  { at: Q.blinded, ease: SOFT_EASE, keys: [[Q.blinded, HUSH_END], [Q.corporations2, [TV.cx, TV.cy + 232, 1.0]], [Q.technology2, [TV.cx, TV.cy + 190, 1.12]], [Q.intelligence - 0.05, [CLOSE_X - 10, LINE_Y + 20, 1.74]], [Q.aTechnology, [CLOSE_X - 10, LINE_Y + 20, 1.78]]], focus: ['tv'] },
  // "a technology they believed would bring about a great treasure": close on the line and the cursor; the tag is let
  // down beside it and lands on "treasure". "shareholder value": pull back to the wall, landing as "value" is said, when
  // every other screen gets its tag. "but in their excitement": a slow push back up to the TV. WHY one shot (review:
  // the old cut back to the same close-up read as a yo-yo), and the wide keeps the person's phone in view just before
  // the cursor heads for it
  // (round 2 review: a 0.6 s whip out to the whole wall and straight back read as a yo-yo): the pull back starts on
  // "shareholder" and lands just after "value" on a three-shelf medium; then only part of the way back up
  { at: Q.aTechnology, keys: [[Q.aTechnology, [CLOSE_X - 10, LINE_Y + 20, 1.78]], [Q.shareholder, [CLOSE_X, LINE_Y + 20, 1.88]], [Q.value + 0.4, VALUE_MED], [Q.but, [VALUE_MED[0], VALUE_MED[1] + 6, VALUE_MED[2] * 1.01]],
    [Q.created2, [ESC_START[0] - 10, ESC_START[1] - 4, ESC_START[2] * 0.95]], [Q.far, ESC_START]], focus: ['tv'] },
  // "far beyond their own control": the cursor gets away and the camera follows it down into the person's phone
  { at: Q.far, keys: [[Q.far, [0, 0, 1]]], fn: followCam, focus: ['hero'] },
  // "a tool that can make software...": close on the phone's own message box; the request is typed, then sent
  // WHY a beat on the sent box, then the upper phone (review: the send played during a fast pull-back and the app's
  // working line could not be seen): the sent bubble and the working line are held, readable, before "for"
  // WHY a push that continues the follow's own move (round 2 review: the cut to the close-up was a jump)
  { at: MACRO, keys: [[MACRO, MACRO_CAM]], fn: macroCam, focus: ['hero'] },
  { at: SEND + 0.08, keys: [[SEND + 0.08, WORKING], [FLIP_HERO, [WORKING[0], WORKING[1] - 1, WORKING[2] * 1.025]]], focus: ['hero'] },
  // "for anyone who asks": the made board opens on the phone as the camera eases back to the whole phone; on "who"
  // it eases back again as three neighbours turn into their own windows, all three clear of the headline's band
  { at: FLIP_HERO, keys: [[FLIP_HERO, [WORKING[0], WORKING[1] - 1, WORKING[2] * 1.025]], [FLIP_HERO + 0.6, PHONE_WHOLE], [Q.who + 0.5, [PHONE_WHOLE[0], PHONE_WHOLE[1] - 4, PHONE_WHOLE[2] * 1.05]], [Q.who + 1.3, MED3], [Q.andSo, [MED3[0] + 6, MED3[1] + 2, MED3[2] * 0.985]]], focus: ['hero'], semi: FIRST_FOLLOWERS },
  // (7) "and so... we get to decide": a lateral track along the shelves; each screen turns its own as it passes
  { at: Q.andSo, keys: [[Q.andSo, [TRACK_X0, TRACK_Y, TRACK_S, 2, 0]], [Q.canDo, [TRACK_X1, TRACK_Y, TRACK_S, 2, 0]]], linear: true },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy + 10, 2.3]], [CUT_TT, [LL.cx, LL.cy + 10, 2.44]]], focus: ['lockLaptop'] },
  { at: CUT_TT, keys: [[CUT_TT, [TT.cx - 10, TT.cy - 60, 1.9]], [Q.whatHappens, [TT.cx - 10, TT.cy - 60, 2.0]]], focus: ['tagTablet'] },
  // "and what happens with our data": the phone close on its shelf with the long receipt; the camera tilts up with the
  // paper as it rolls back into the phone
  // (round 2 review: the background was stopped down to murk and the phone's top was cut): the neighbours either side now
  // glow in their own colours behind it, and the whole phone stays in frame as the paper rolls up
  { at: Q.whatHappens, keys: [[Q.whatHappens, [0, -70, 2.3]], [REWIND0, [0, -72, 2.32]], [REWIND1 + 0.2, [0, hy + 10, 2.5]], [Q.free, [0, hy + 6, 2.53]]], focus: ['hero'], par: 0.45, bgDim: 0.1, soft: 1.6 },
  // (8) "free ourselves": low angle again, daylight opens out of the person's phone; then everything holds still while
  // a slight drift settles the one black screen, the TV, into the top third, and on "past" it opens
  // (round 2 review: the TV's reveal was 14% of the frame): through the stillness a slow push brings the TV to about
  // 40% of the frame's width, in the top third, so its film night can be read
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62, 6, 0]], [TV_FLIP - 0.55, [0, -740, 0.74, 3, 0]], [CUT_L9, [0, -800, 0.86, 2, 0]]] },
  // (9) "it's time, at long, long last": five devices on the person's shelf; the board passes to two neighbours; then
  // all the way back to the calm wall
  // (round 2: the tablet between the person and the second copy is as soft as the copies, so the eye's path from the
  // person's board to each copy crosses no dead smear; the pull back eases softly and starts moving at once)
  { at: CUT_L9, ease: SOFT_EASE, keys: [[CUT_L9, [(FIVE_L + FIVE_R) / 2, hy - 30, FIVE_S]], [SHARE_HOLD, [(FIVE_L + FIVE_R) / 2, hy - 34, FIVE_S * 0.97]], [Q.open + 1.4, [0, -390, 0.52]], [END_FADE, [0, -400, 0.42]]], focus: ['hero'], semi: ['0:l0', '0:r1', 'tagTablet'], soft: 2.4 },
];
/** A camera ease that starts moving at once: a third of it constant speed, the rest a soft sine in-out. WHY (round 2
 *  review): EASE_IN_OUT on a long move sat nearly still for most of a second, then lunged. */
function SOFT_EASE(p: number) { return 0.35 * p + 0.65 * (0.5 - 0.5 * Math.cos(Math.PI * p)); }
/** The push from the follow into the message box: it starts at exactly the follow's last framing and decelerates onto
 *  the box, landing just before the first letter. */
function macroCam(t: number): Cam {
  const a = followCam(MACRO), p = EASE_IN_OUT(lin(t, MACRO, TYPE0 - 0.05));
  const d = lin(t, TYPE0, SEND);                                 // then a very slow drift while the words are typed
  return [lerp(a[0], MACRO_CAM[0], p), lerp(a[1], MACRO_CAM[1], p) - 2 * d, Math.exp(lerp(Math.log(a[2]), Math.log(MACRO_CAM[2]), p)) * (1 + 0.025 * d)];
}
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): [number, number, number, number, number] => {
  const full = (c: Cam): [number, number, number, number, number] => [c[0], c[1], c[2], c[3] ?? 0, c[4] ?? 0];
  if (s.fn) return full(s.fn(t));
  const k = s.keys;
  if (t <= k[0][0]) return full(k[0][1]);
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      // WHY linear for the track: a tracking shot runs at one speed; easing it would read as a lurch
      const p = s.linear ? lin(t, k[i - 1][0], k[i][0]) : (s.ease ?? EASE_IN_OUT)(lin(t, k[i - 1][0], k[i][0]));
      const a = full(k[i - 1][1]), b = full(k[i][1]);
      // WHY log-space zoom: equal steps in log scale read as a steady camera move; linear zoom lurches at the end
      return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), p)), lerp(a[3], b[3], p), lerp(a[4], b[4], p)];
    }
  }
  return full(k[k.length - 1][1]);
};

// ---------- what each screen shows at time t ----------
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode, at = '50% 50%', e: (x: number) => number = EASE_OUT) => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  // WHY a circle opening (from the centre, or from where the change came in): the change reads as arriving IN
  // the screen. The new screen is always already complete behind the circle, never an empty panel.
  // WHY a soft edge (round 6 review: a hard circle opening on a pale screen read as a black hole punched through it):
  // the new screen spreads in like light, its edge feathered over a sixth of the way
  // (feather narrowed from 20% to 7% in round 2: the wide feather left a muddy dark ring on pale screens)
  const r = e(f) * 112, m = `radial-gradient(circle farthest-corner at ${at}, #000 ${Math.max(0, r - 7)}%, transparent ${r}%)`;
  return <>{a}<div style={{ position: 'absolute', inset: 0, WebkitMaskImage: m, maskImage: m }}>{b}</div></>;
};
/** An ordinary wall screen turning its own: a six-frame crossfade with the new window settling from 102% to 100%.
 *  WHY (round 2 review): a circle on every one of sixty screens read as noise; the circle is kept for the screens whose
 *  change is a line's payoff (the person's phone, the laptop, the tablet, the TV and the two shared boards). */
const fadeNode = (f: number, a: React.ReactNode, b: React.ReactNode) => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  const e = EASE_IN_OUT(f);
  return <>{a}<div style={{ position: 'absolute', inset: 0, opacity: e, transform: `scale(${1.02 - 0.02 * e})` }}>{b}</div></>;
};
// WHY every change pours down from the TV (plan): the TV is the companies; it changes first, then each shelf below it
// two frames later, top to bottom, so a viewer sees the order of command. The shelf above the TV goes with the TV's own.
// WHY the TV leads by two whole frames (review): "the TV speaks, the wall obeys" must be visible in the wide shots
const pour = (d: Dev) => (d.id === 'tv' ? 0 : (2 + Math.max(0, d.row - TV.row) * 2) / FPS);
// WHY a 4-frame snap rather than a slide: blocks sliding past each other looked messy; a snap reads as an order obeyed
// (on "technology" the camera is close on the phone and the tablet, where a shelf-by-shelf order means nothing: the
// phone obeys first and the tablet two frames later, so it reads as an order passed along, not a dropped frame)
const techPour = (d: Dev) => pour(d) + (d.id === 'tagTablet' ? 2 / FPS : 0);
const layAt = (t: number, d: Dev) => { const p = pour(d), q = techPour(d); return ez(t, DICT + p, DICT + p + 0.13, EASE_IN_OUT) + ez(t, TECH + q, TECH + q + 0.13, EASE_IN_OUT); };
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];   // the laptop's padlocks land one tile after another

/** The TV from "However" on: black, with the one cream cursor. It is born on "something" (a steady half second on,
 *  half off), types its own question on "intelligence", blinks faster on "excitement", and is gone on "far" (the
 *  cursor drawn in the room takes over as it gets away). The line fades as it leaves. */
const TVDark: React.FC<{ t: number; s: number; children: React.ReactNode }> = ({ t, s, children }) => {
  const black = ez(t, HUSH, HUSH + 0.9, EASE_IN_OUT);
  const n = TV_TYPE.filter((a) => t >= a).length;
  // (the pulse and the glass need these too)
  const typing = t >= TV_TYPE[0] && t < TV_TYPE[TV_TYPE.length - 1] + 0.25;
  // the blink's phase, summed frame by frame so its rate can quicken smoothly ("excitement") without a jump
  let phase = 0;
  for (let u = CURSOR_AT; u < t; u += 1 / FPS) {
    const quick = lin(u, Q.excitement, Q.created2);
    phase += (1 / FPS) * lerp(1, 2.8, quick);
  }
  // WHY a two-frame fade on every blink edge (review): a hard on/off read as a flicker, not a screen's caret
  const cyc = (phase / 0.5) % 2;
  const blink = cyc < 1 ? cl(Math.min(cyc, 1 - cyc) / 0.13 + 0.001) : 0;
  // the first "on" fades in over two frames so it arrives rather than pops
  const born = t < CURSOR_AT ? 0 : Math.min(1, (t - CURSOR_AT) / 0.07);
  const cursorO = t >= HOP0 ? 0 : born * (typing ? 1 : blink);
  const lineO = 1 - ez(t, Q.far, Q.far + 0.3, EASE_IN_OUT);
  // WHY bigger while the camera is far away (review: in the wide it was a 3-pixel sliver nobody's eye went to): it
  // holds about 7 x 64 px on screen in the wide, and shrinks to its true thin size (8 x 78 world px) by the time the
  // camera is close, so the escape and the hand-off to the real caret still match
  // (round 7 review: at 7 px it read as a scratch on the glass, not "something wonderful": now about 14 x 90 px on
  // screen in the wide, which still meets its true 8 px width exactly at the close-up's 1.74)
  const cw = Math.max(TV_CURSOR.w, 14 / s), ch = Math.max(TV_CURSOR.h, 90 / s);
  // WHY no glide any more (round 2 review: the cursor slid a third of the TV's width across empty black before typing,
  // like an animator repositioning it): it is born at the middle of where its line will sit, and the line grows outward
  // from there as each letter arrives, the caret always at its end; each letter's half-step eases over two frames so the
  // text never jumps. When the line is finished it ends exactly where the escape starts.
  const nS = TV_TYPE.reduce((a, at) => a + ez(t, at, at + 0.07, EASE_OUT), 0);
  const left = TV_LX + (TV_LINE.length - nS) * TV_ADV / 2;
  // the dark glass: a touch lighter at the top, the warm key light caught as a broad soft reflection in its upper left,
  // and the cursor's own faint light on the glass around the line (WHY, round 2 review: a flat #07040B slab for fifteen
  // seconds, flatter than the lit grey screen it replaced)
  const cx = left + nS * TV_ADV + 4 + cw / 2;
  const pulse = bump(t, CREATED_DIP - 1 / FPS, 3 / FPS);       // the order leaves the TV a frame before the wall dips
  return (
    <>
      {children}
      <div style={{ position: 'absolute', inset: 0, opacity: black, background: 'linear-gradient(180deg, #17121F 0%, #0D0A14 42%, #08060C 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 62% 58% at 16% 8%, rgba(255,206,160,0.11), rgba(255,196,150,0.035) 55%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 30%, transparent 31%)' }} />
        {born > 0 && lineO > 0 && <div style={{ position: 'absolute', left: cx - 360, top: TV.h / 2 - 170, width: 720, height: 340, borderRadius: '50%', opacity: born * lineO * (t >= HOP0 ? 0 : 1),
          background: 'radial-gradient(closest-side, rgba(248,232,200,0.07), rgba(248,232,200,0.02) 60%, transparent)' }} />}
        {pulse > 0 && <div style={{ position: 'absolute', inset: 0, background: '#E8D8C4', opacity: 0.08 * pulse }} />}
      </div>
      <div style={{ position: 'absolute', left, top: TV.h / 2 - ch / 2, height: ch, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: TV_FS, color: CARET_COL, whiteSpace: 'pre' }}>
        {/* WHY a fixed cell per letter: the cursor's place after the line is known exactly, so its escape starts there */}
        <span style={{ display: 'flex', opacity: lineO }}>{TV_LINE.slice(0, n).split('').map((c, i) => <span key={i} style={{ display: 'inline-block', width: TV_ADV, textAlign: 'center' }}>{c}</span>)}</span>
        <span style={{ display: 'inline-block', width: cw, height: ch, marginLeft: n > 0 ? 4 : 0, borderRadius: Math.min(3, cw / 3), background: CARET_COL, opacity: cursorO }} />
      </div>
    </>
  );
};

/** The small "$20/mo" tag that pops onto a screen's corner on "value", and drops off when the screen turns its own. */
const MiniTag: React.FC<{ d: Dev; t: number; at: number; off: number }> = ({ d, t, at, off }) => {
  if (t < at) return null;
  const k = Math.min(d.w, d.h);
  // WHY bigger (review: at half the screen's short side, "$20/mo" was 10 px on a full frame and could not be read):
  // on a phone it spans most of the screen's width, on the bigger screens a good corner
  const tw = k * (d.kind === 'phone' ? 0.74 : 0.6), th = tw * 0.42;
  // it drops in from just above (three frames), lands with a small bounce and a swing that settles
  const pop = lin(t, at, at + 0.1);
  const since = t - at - 0.1;
  const swing = since > 0 ? 7 * Math.exp(-since * 5) * Math.sin(since * 14) : 0;
  // WHY it falls straight down the glass and is gone a beat before the screen opens (review: the old tag grew and lay
  // across the new window as it opened); it never gets bigger than it rests
  const fall = lin(t, off, off + 0.38);
  if (fall >= 1) return null;
  // WHY the same paper tag as the tablet's and the TV's (round 2 review: three different tag designs, and the wall's
  // fell back to a serif face): the same pointed cream card with its punched hole, DM Sans, hung on a short cream string
  // from the screen's top edge
  const sc = tw / 190;
  return (
    <div style={{ position: 'absolute', right: k * 0.05 + tw / 2, top: -(1 - EASE_IN(pop)) * th * 2.2 + fall * fall * (d.h + th * 2.4), width: 0, height: 0, transform: `rotate(${6 + swing + fall * 16}deg)`, transformOrigin: '0 0', opacity: pop < 1 ? cl(pop * 3) : 1 }}>
      <div style={{ position: 'absolute', left: -1.2 * sc, top: 0, width: 2.4 * sc, height: k * 0.06 + 2, background: '#EDE2CC' }} />
      <div style={{ position: 'absolute', left: -95 * sc, top: k * 0.06, width: 190 * sc, height: 92 * sc, filter: `drop-shadow(0 ${6 * sc}px ${8 * sc}px rgba(20,8,32,0.45))` }}>
        <svg width={190 * sc} height={92 * sc} viewBox="0 0 190 92" style={{ position: 'absolute' }}>
          <path d="M95 0 L120 16 H182 a8 8 0 0 1 8 8 V84 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 H70 Z" fill="#FBF5EA" />
          <circle cx="95" cy="12" r="5" fill="#2A1F33" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22 * sc, height: 70 * sc, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: DMSANS, fontWeight: 900, fontSize: 38 * sc, letterSpacing: '-0.04em', color: C.plum, whiteSpace: 'nowrap' }}>$20/mo</div>
      </div>
    </div>
  );
};

const screenOf = (d: Dev, t: number, s = 1): { node: React.ReactNode; glow: string; lift: number } => {
  const own = lookFor(d);
  const fa = flipAt(d);
  const isHero = d.id === 'hero';
  // WHY slower reveals on the story devices (review: the TV and the laptop popped open in two frames): each is that
  // line's payoff, so it is given time to open
  const payoff = STORY.includes(d.id) || d.id === '0:l0' || d.id === '0:r1';
  const dur = d.id === 'tv' ? TV_REVEAL : d.id === 'lockLaptop' ? LL_REVEAL : payoff ? 0.5 : 0.2;
  const f = lin(t, fa, fa + dur);
  const lift = bump(t, fa, 0.7) * (payoff ? 0.9 : 0.35);
  // WHY padlocks on the one laptop only (plan): it is the device the story follows for "what your computers could do",
  // and it must be findable in every wide shot until line 7 knocks them off
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * LOCK_GAP, LOCK0 + r * LOCK_GAP + LOCK_DUR)) : 0;
  // the terms card pours down from the TV like every other order; the three in the "accepted it" shot press one at a
  // time, and the rest of the wall gives in at scattered moments just after
  const dlg0 = Q.weAll + 0.05 + pour(d);
  const acc0 = ACCEPT_AT[d.id] ?? ACCEPT + 0.1 + jit(d) * 0.6;
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t, d)}
      lock={lock} unlock={d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => (t >= LL_UNLOCK_AT(r) ? 1 : 0)) : 0}
      // WHY four frames (round 7 review: over 0.3 s the card sat as a translucent ghost over Sam and the Note)
      dialog={lin(t, dlg0, dlg0 + 0.13)}
      accept={lin(t, acc0, acc0 + 0.6)}
      share={isHero ? { o: lin(t, SHARE.in, SHARE.in + 0.3), on: lin(t, SHARE.on, SHARE.on + 0.18) } : undefined}
      // WHY (round 2 review): from line 7 the old app on the laptop and the tablet is seen big, and must not show the
      // person's own Sam and Mia; their things live only on their phone (the swap happens at the cut into the track)
      personal={isHero || t < Q.andSo}
      outline={isHero ? receiptOutline(t) : undefined} />
  );
  // every screen gets its small price on "value", and sheds it as it turns, except the story devices: each already
  // carries its one mark (the receipt, the tablet's tag, the padlocks, the TV's own tag). WHY: never two marks on one
  const priced = !STORY.includes(d.id);
  const tag = priced ? <MiniTag d={d} t={t} at={PRICE_ALL + pour(d)} off={fa - 0.42} /> : null;
  if (isHero) {
    // the phone becomes the real window the moment the cursor lands in it, opening from its message box; then, on
    // "for anyone who asks", the board the app made opens over it the same way and settles in
    const g = lin(t, LAND - 0.02, LAND + 0.42);
    const win = <div style={{ position: 'absolute', inset: 0, background: '#120A19' }}><HeroWindow t={t} /></div>;
    // the window opens from exactly where the cursor lands, its real caret (round 2 review)
    const board = <div style={{ position: 'absolute', inset: 0, background: '#120A19' }}><HeroBoard p={0.25 + 0.75 * lin(t, fa, fa + 0.9)} /></div>;
    let node = t < fa ? flipNode(g, same, win, CARET_AT) : flipNode(lin(t, fa, fa + 0.55), win, board, BOX_AT);
    // WHY a warm brightening as the receipt's end disappears into it (review: nothing said "the data is theirs now"),
    // and a brightening along the edge facing each neighbour just before the board passes to it (it visibly leaves
    // from here)
    const back = bump(t, REWIND1 - 0.05, 0.45);
    // (round 2 review: the glow was too faint to see at this size; now stronger, wider and a little earlier)
    const toL = bump(t, SHARE_AT[0] - 0.45, 0.6), toR = bump(t, SHARE_AT[1] - 0.45, 0.6);
    if (back > 0 || toL > 0 || toR > 0) node = <>{node}
      {back > 0 && <div style={{ position: 'absolute', inset: 0, background: '#FFE7BE', mixBlendMode: 'screen', opacity: back * 0.18 }} />}
      {toL > 0 && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,240,210,1), rgba(255,240,210,0) 60%)', mixBlendMode: 'screen', opacity: toL }} />}
      {toR > 0 && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(270deg, rgba(255,240,210,1), rgba(255,240,210,0) 60%)', mixBlendMode: 'screen', opacity: toR }} />}
    </>;
    const glow = t >= LAND ? look('golden-sunbreak-tv-chat').glow : SAME_GLOW;
    return { node, glow, lift: t < fa ? bump(t, LAND, 0.5) * 0.5 : bump(t, fa, 0.6) * 0.5 + back * 0.25 };
  }
  const ownNode = <OwnScreen look={own} w={d.w} h={d.h} />;
  if (d.id === 'tv') {
    // WHY black from "However" until "past" (plan): the TV is the companies; after the cursor escapes it stays the one
    // dead rectangle on the bright wall, and is the last screen to become someone's own
    const before = t < HUSH ? same : <TVDark t={t} s={s}>{same}</TVDark>;
    // (from the screen's centre, eased in and out, so it opens as a held moment rather than a pop)
    return { node: flipNode(f, before, ownNode, '50% 50%', EASE_OUT), glow: f > 0.5 ? own.glow : t >= HUSH + 0.5 ? DEAD_GLOW : SAME_GLOW, lift };
  }
  // the laptop opens from its tile row, where the padlocks were; WHY: the studio grows out of the place the locks left
  let node: React.ReactNode = <>{d.id === 'lockLaptop' ? flipNode(f, same, ownNode, LL_AT, EASE_OUT) : payoff ? flipNode(f, same, ownNode) : fadeNode(f, same, ownNode)}{tag}</>;
  // the pickup board, passed on to two neighbours: the same board in each one's own look with their own life in it
  const si = ['0:l0', '0:r1'].indexOf(d.id);
  if (si >= 0) {
    const mine = <OwnScreen look={look(si === 0 ? 'youcoded-night-laptop-mine' : 'morning-rounds-phone-mine')} w={d.w} h={d.h} />;
    // WHY from the side facing the person's phone: it visibly comes from them
    // (eased in and out over 0.6 s, review: the old ease-out landed most of the circle in two frames)
    // (round 2: from the height of the board's big time block, so the time arrives first and mirrors the person's "3:15")
    node = <>{flipNode(lin(t, SHARE_AT[si], SHARE_AT[si] + SHARE_REVEAL), flipNode(f, same, ownNode), mine, si === 0 ? '100% 22%' : '0% 22%', EASE_IN_OUT)}{tag}</>;
  }
  return { node, glow: f > 0.5 ? own.glow : SAME_GLOW, lift: lift + (si >= 0 ? bump(t, SHARE_AT[si] + 0.2, 0.8) * 0.65 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s, rx, rz] = camAt(t, shot);
  // WHY 1.8 s (round 2 review: the daylight swept the frame in 0.3 s, an exposure flash, not a morning): the night
  // light goes as slowly as the daylight spreads out of the phone
  const DAY = 1.8;
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + DAY, EASE_IN_OUT);

  // WHY the card is passed an earlier start: it arrives already whole (reviewer: a faded URL first, then the
  // platforms, read as a half-loaded card); the short dissolve below is the only movement
  const card = <EndCard at={END_CARD - 0.75} />;

  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens; the opening racks focus
  const rack = shot.rack ? shot.rack[2] * (1 - ez(t, shot.rack[0], shot.rack[1], EASE_IN_OUT)) : 0;
  const blur = (shot.soft ?? (s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0)) + rack / s;
  const semi = new Set(shot.semi ?? []);
  // WHY a wider cull when tilted: perspective shows more of the wall than the flat frame does
  const tilt = Math.abs(rx) + Math.abs(rz);
  const vw = 1920 / s * (1 + tilt * 0.04), vh = 1080 / s * (1 + tilt * 0.05);
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  // "However" hushes the wall; WHY it comes back up during the push to the TV (plan): the wall below is the companies'
  // small, obedient screens, lit again, while only their own big screen stays black
  // (corporations2 is line 5's "these corporations"; the old line-1 cue here meant the hush never happened)
  // (round 2 review: it came back in 0.3 s and popped): the wall wakes across the whole push, "Blinded" to "corporations"
  const dim = t >= Q.however && t < Q.corporations2 ? ez(t, Q.however, Q.however + 0.9) * (1 - ez(t, Q.blinded, Q.corporations2 - 0.1, EASE_IN_OUT)) : 0;
  // WHY the wall hushes again while the request is typed: it echoes the "something wonderful" hush, the same lit
  // phone, now being asked, and keeps the eye on its message box
  // WHY it starts on "far" (review: the escaping cursor was lost over the bright, identical screens): the wall drops to
  // about half as the cursor leaves the TV, so the cursor is the brightest thing in frame on its way down
  const hush = t >= Q.far && t < FLIP_HERO + 0.6 ? Math.max(0.62 * ez(t, Q.far, Q.far + 0.35), ez(t, LAND + 0.3, LAND + 1.1)) * (1 - ez(t, FLIP_HERO + 0.05, FLIP_HERO + 0.6, EASE_IN_OUT)) : 0;
  const dimAll = Math.max(dim, hush);

  // the room's light (plan): one warm key on the TV, rising on "corporations" and dimmed by the hush; everything else
  // falls off cool and darker down the shelves and out to the sides. Night only: daylight replaces it at "free".
  // (plus a brief warm swell on the TV's bezel as their tag lands on "treasure": the room answers the landing)
  const warm = night * (0.55 + 0.45 * ez(t, Q.corporations, Q.corporations + 0.8, EASE_IN_OUT)) * (1 - 0.6 * dimAll) + 0.45 * night * bump(t, Q.treasure, 0.8);
  const scs = new Map<string, ReturnType<typeof screenOf>>();
  const scOf = (d: Dev) => { let v = scs.get(d.id); if (!v) { v = screenOf(d, t, s); scs.set(d.id, v); } return v; };
  const renderDev = (d: Dev) => {
    const sc = scOf(d);
    const story = STORY.includes(d.id);
    // WHY the order is shown as LIGHT (round 7 review: the old dark dip rolling down the shelves read as a video glitch,
    // and nothing on screen played the corporations): when the TV gives an order it flashes, and each shelf below
    // flashes up to full brightness as it obeys, two frames apart, then settles back to its stopped-down level. The
    // eye sees light pour from the TV down the wall. In the wide shots only, except "technology", which happens in the
    // close two-shot (the phone, then the tablet two frames later)
    const k = t >= HUSH ? 0 : Math.max(flash(t, DICT + pour(d) - 0.03), flash(t, Q.weAll + 0.02 + pour(d))) * wideK(s) + flash(t, TECH + techPour(d) - 0.03) * 0.8;
    // WHY every ordinary screen stopped down in the wide shots before the turn (review: an evenly lit grid of identical
    // pale rectangles, no subject): only the TV (the companies) and the three story devices keep full brightness, the
    // rest fall away down the shelves and out to the sides. It eases off as line 5's push lands, so the wall below the
    // TV comes back up "small and obedient" as the plan asks, and lines 5 to 9 keep their old light
    const early = t < Q.blinded ? 1 : 1 - ez(t, Q.blinded, Q.corporations2 - 0.1, EASE_IN_OUT);
    // (a device the shot is about is never shaded: round 7 review, the laptop beside the person's phone sat a stop
    // greyer than the phone and tablet in the same three-shot)
    const shade = story || focus.has(d.id) ? 0 : Math.min(0.7, coolShade(d) + early * wideK(s) * stopDown(d)) * night * (1 - 0.85 * cl(k));
    // by day the outer and lower rows sit about a tenth darker, so the light has a direction and the person's phone's
    // part of the wall stays brightest (round 2 review: the daylit wall was evenly lit)
    const dayShade = (1 - night) * 0.2 * coolShade(d) * (focus.has(d.id) ? 0 : 1);
    // the dip on "created": every screen but the TV drops to about 30% for five frames, poured down from the TV
    // WHY six frames and deeper (review: five frames at 70% barely registered)
    const dip = d.id === 'tv' ? 0 : bump(t, CREATED_DIP + pour(d), 6 / FPS) * 0.88;
    // WHY 0.93 (round 7 review: at 0.8 the hushed wall stayed sixty mid-grey rectangles): the lights go out, and only the
    // person's phone is left lit
    const veil = Math.max(d.id !== 'hero' ? dimAll * 0.93 : 0, dip);
    const overlay = veil > 0.01 ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: veil }} /> : null;
    const node = <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift} dim={d.id === 'hero' ? 0 : Math.max(dimAll, shade * 0.6)}>{sc.node}
      {/* WHY only a touch of warmth ON the screen (review: a strong multiply just made the TV a beige monitor); the
          warm key is carried by the light around it (RoomLight, TvKeyLight) */}
      {d.id === 'tv' && warm > 0.01 && t < TV_FLIP && <div style={{ position: 'absolute', inset: 0, background: '#FFE2C4', mixBlendMode: 'multiply', opacity: warm * 0.22 }} />}
      {shade > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#0A0918', opacity: shade }} />}
      {dayShade > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#3A2436', opacity: dayShade }} />}
      {k > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#FFF6EA', mixBlendMode: 'screen', opacity: cl(k) * (d.id === 'tv' ? 0.3 : 0.25) }} />}
      {overlay}</Device>;
    // WHY the shelf below moves a little less than the camera in the receipt tilts: it is further back, so the paper
    // in front reads as hanging in front of it (real parallax), not painted on it
    if (shot.par && d.row > HERO.row) {
      const dy = (cy - camAt(shot.at, shot)[1]) * shot.par;
      return <div key={d.id} style={{ position: 'absolute', left: 0, top: 0, transform: `translateY(${dy}px)` }}>{node}</div>;
    }
    return node;
  };

  const devs = WORLD.devs.filter(visible);
  const lowLit = (d: Dev) => !!shot.par && !!shot.bgDim && d.row > HERO.row;
  const back = devs.filter((d) => !focus.has(d.id) && !semi.has(d.id));
  const mid = devs.filter((d) => semi.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  // WHY the tag and the receipt are drawn in the same focus layer as the device they hang from: a sharp tag beside a
  // soft tablet (or a sharp receipt under a soft phone) read as stuck on the lens, not hanging in the room
  const layerOf = (id: string) => (focus.has(id) ? 'front' : semi.has(id) ? 'mid' : 'back');
  const propsIn = (layer: string) => <>
    {layerOf('tagTablet') === layer && <TabletTag t={t} dim={Math.max(dimAll, shot.tagDim ?? 0)} />}
    {/* WHY the receipt sinks back while "for anyone who asks." is up (review: its lines showed between the headline's
        words); it is not what the narrator is talking about there, and it comes back for its payoff in line 7.
        WHY the roll-back starts slow and quickens (review: a steady slide had no tension), pulled in like tape */}
    {layerOf('hero') === layer && <ShelfReceipt t={t} dim={dimAll * 0.4} glowTop={dim} fade={0.7 * Math.min(ez(t, FLIP_HERO - 0.3, FLIP_HERO + 0.3, EASE_IN_OUT), 1 - ez(t, Q.andSo - 0.3, Q.andSo, EASE_IN_OUT))} back={EASE_IN(lin(t, REWIND0, REWIND1))} />}
  </>;

  // headline readability: a soft wide band behind the lower third while a headline is up (darkening at night,
  // lightening by day), never a box
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const bandC = night > 0.5 ? '10,5,16' : '250,246,252';
  // WHY a lower band under "something wonderful happened." (review): the person's phone, the last light, sits just
  // above it instead of being swallowed; the hushed wall behind the words is dark enough to read on
  const bandLow = t >= Q.truly - 0.3 && t < Q.blinded + 0.1;
  // WHY a narrower, lighter band from "for anyone who asks" on (round 2 review: over a soft medium the full band read as
  // a subtitle bar and darkened the shelf under the phone)
  const bandNarrow = t >= FLIP_HERO - 0.3;
  const b0 = bandLow ? 72 : 64;
  // WHY tied to the pull back (round 2 review: the blur and the pale wash snapped on in three frames as "open" was said):
  // the wall softens over the whole move, from the held shared boards to just after "open"
  const calm = ez(t, SHARE_HOLD + 0.2, CALM0 + 1.35, EASE_IN_OUT);

  const world = (
      <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%', filter: calm > 0.01 ? `blur(${calm * 18}px)` : undefined }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, filter: [blur > 0.05 ? `blur(${blur}px)` : '', shot.bgDim ? `brightness(${1 - shot.bgDim})` : ''].join(' ').trim() || undefined }}>
          {/* the room (round 6): a textured back wall, each screen's light on it, the TV's warm key, then the planks */}
          {night > 0.01 && <BackWall night={night} />}
          {night > 0.01 && <RoomLight warm={warm} night={night} />}
          {night > 0.01 && devs.map((d) => <WallGlow key={`g${d.id}`} d={d} glow={scOf(d).glow} k={night * (STORY.includes(d.id) ? 1 : 1 - coolShade(d) - wideK(s) * 0.25 * (t < Q.blinded ? 1 : 0)) * (d.id === 'hero' ? 1 : 1 - 0.95 * dimAll)} />)}
          {/* WHY a soft pool of the phone's own light around it in the hush (round 7 review: the dimmed wall still competed with
              it): the room is now lit BY that phone, its light falling on the wall behind it and on its shelf lip */}
          {night > 0.01 && dimAll > 0.01 && <HeroPool k={dimAll * night} />}
          <div style={{ opacity: night }}><Shelves night={1} /></div>
          {/* the daylit room, opening out of the person's phone on "free" (in the room, not a flat backdrop) */}
          {night < 1 && <DayRoom spread={ez(t, Q.freeWord, Q.freeWord + DAY, EASE_IN_OUT)} ox={HERO.cx} oy={HERO.cy} devs={devs} />}
          {night > 0.01 && <TvKeyLight warm={warm} />}
          {back.filter((d) => !lowLit(d)).map(renderDev)}
          {propsIn('back')}
        </div>
        {/* WHY the shelf below the person's phone is stopped down far less in the receipt shots (round 7 review: bgDim
            plus blur made it a black void, so the paper hung into nothing): its screens glow softly behind the paper,
            warm and cool, and the receipt reads as lit from behind */}
        {back.some(lowLit) && <div style={{ position: 'absolute', left: 0, top: 0, filter: `blur(${blur * 1.15}px) brightness(0.86)` }}>{back.filter(lowLit).map(renderDev)}</div>}
        {mid.length > 0 && <div style={{ position: 'absolute', left: 0, top: 0, filter: `blur(${blur * (shot.semiBlur ?? 0.3)}px)` }}>{mid.map(renderDev)}{propsIn('mid')}</div>}
        <div style={{ position: 'absolute', left: 0, top: 0, filter: rack > 0.05 ? `blur(${rack / s}px)` : undefined }}>
          {front.map(renderDev)}
          {propsIn('front')}
          <WorldProps t={t} s={s} />
          {/* WHY a mask in frame terms: once "own nothing." is up, the older charges sink away under it instead of
              their words showing through the headline */}
          {shot.bill && (() => {
            // WHY driven by the headline's arrival only (review): as the headline faded out the hidden charges came back
            // through it for three frames before the cut
            const L = cx - 960 / s, T = cy - 540 / s, a = 1 - ez(t, Q.own - 0.2, Q.own + 0.3);
            const m = `linear-gradient(180deg,#000 64%,rgba(0,0,0,${a}) 74%)`;
            return <div style={{ position: 'absolute', left: L, top: T, width: 1920 / s, height: 1080 / s, WebkitMaskImage: m, maskImage: m }}>
              <div style={{ position: 'absolute', left: -L, top: -T }}><BillStack t={t} /></div>
            </div>;
          })()}
        </div>
      </div>
    </AbsoluteFill>
  );
  const cardIn = ez(t, END_CARD, END_CARD + END_X, EASE_IN_OUT);
  // WHY the calm wall stays faintly round the card's edges (round 2 review: after a textured room the film ended on a
  // flat card): the soft, pale daylit wall shows through at about 14% outside the card's centre, the card untouched
  const cardMask = 'radial-gradient(ellipse 62% 58% at 50% 48%, transparent 45%, #000 100%)';
  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {/* the room: plum-black (the reviewer found the old plum lifted and muddy), lit a little from above */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg,#1C1027 0%,#120A1B 55%,#0B0611 100%)' }} />
      {world}
      {/* a vignette holds the eye in the middle of the wide shots */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: night * (s > 1.3 ? 0.6 : 1) }} />
      {/* by day a warm, lighter vignette (round 6 review: the daylit frame had no fall-off at all) */}
      {night < 1 && <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 78% at 50% 50%, transparent 55%, rgba(84,46,72,0.32) 100%)', opacity: 1 - night }} />}
      {/* the ending's calm: the busy wall goes soft and pale behind the last line */}
      {/* WHY lighter than before (review: the pale wall matched the end card so closely the dissolve did not register) */}
      {calm > 0.01 && <AbsoluteFill style={{ background: '#FBF3F4', opacity: calm * 0.5 }} />}
      {shot.bill && <BillTotal t={t} />}
      {/* WHY a full-width band, stronger than before (reviewer 2026-11-20): "for anyone who asks." lost contrast over
          bright moving screens; one even band under every headline keeps all four the same and always legible */}
      {headUp > 0 && <AbsoluteFill style={{ background: bandNarrow
        ? `linear-gradient(180deg, rgba(${bandC},0) 70%, rgba(${bandC},0.62) 79%, rgba(${bandC},0.7) 83%, rgba(${bandC},0.62) 88%, rgba(${bandC},0) 96%)`
        : `linear-gradient(180deg, rgba(${bandC},0) ${b0}%, rgba(${bandC},0.84) ${bandLow ? 78 : 75}%, rgba(${bandC},0.9) 83%, rgba(${bandC},0.84) 91%, rgba(${bandC},0) 100%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} stagger={h.stagger} />)}
      {/* the end card dissolves in over the calm wall, after the headline has gone */}
      {t >= END_CARD && <AbsoluteFill style={{ opacity: cardIn }}>{card}</AbsoluteFill>}
      {t >= END_CARD && <AbsoluteFill style={{ opacity: 0.14 * cardIn, WebkitMaskImage: cardMask, maskImage: cardMask }}>{world}<AbsoluteFill style={{ background: '#FBF3F4', opacity: 0.5 }} /></AbsoluteFill>}
    </AbsoluteFill>
  );
};

/** How much darker a screen sits for being lower down or further out than the TV's warm light reaches (0..~0.45).
 *  WHY (plan): far rows about a third dimmer, so the wall has depth and a subject instead of an even grid. */
// WHY steeper than before (review: 0.1 a row could not be seen): about 0.16 darker per shelf below the TV's and more
// out to the sides, capped near half, so the bottom row and the outer columns sit clearly dimmer and cooler
const coolShade = (d: Dev) => Math.min(0.52, cl(0.16 * (d.row - TV.row - 1)) + 0.42 * cl((Math.abs(d.cx) - 650) / 2200));
/** The extra stop-down an ordinary screen gets in the wide shots before the turn (round 7 review: the TV did not read
 *  as the room's one light). About 0.26 for the TV's own shelf, steeper (0.08 a shelf) below it. */
const stopDown = (d: Dev) => 0.26 + 0.08 * Math.max(0, d.row - TV.row);
/** 1 in the wide shots, 0 from a medium (scale 1.3) in: the stop-down and the shelf-by-shelf flash are wide-shot
 *  devices; in a close-up the neighbours stay at the subject's brightness. */
const wideK = (s: number) => cl((1.3 - s) / 0.6);
/** A screen's refresh as it obeys an order: up in about one frame, then settling over about six. */
const flash = (t: number, a: number) => (t < a || t > a + 0.4 ? 0 : t < a + 0.035 ? (t - a) / 0.035 : Math.exp(-(t - a - 0.035) * 13));
/** The warm key light on the TV (a broad pool on the wall around it, never a ball) and the cool fall-off over the
 *  shelves below and to the sides, in world px, under the devices. WHY stronger and tighter (review: at 0.2 the pool
 *  could not be seen in any frame): the wall behind the TV visibly glows amber, so the eye lands there first. */
const RoomLight: React.FC<{ warm: number; night: number }> = ({ warm, night }) => (
  <>
    <div style={{ position: 'absolute', left: TV.cx - 1500, top: TV.cy - 900, width: 3000, height: 1650, opacity: warm,
      // WHY about twice as strong, and brighter above than below (round 7 review: the pool could not be seen; light
      // falls from above, so the wall over the TV catches most of it)
      background: 'radial-gradient(ellipse 50% 50% at 50% 40%, rgba(255,186,128,0.8) 0%, rgba(255,176,120,0.45) 30%, rgba(255,166,116,0.16) 58%, rgba(255,160,110,0) 80%)', mixBlendMode: 'screen' }} />
    <div style={{ position: 'absolute', left: -4400, top: TV.shelf - 300, width: 8800, height: 3000, opacity: night,
      background: `radial-gradient(ellipse 46% 60% at 50% 0%, rgba(6,6,20,0) 26%, rgba(6,6,20,0.45) 70%, rgba(6,6,20,0.7) 100%)` }} />
  </>
);
/** The warm key falling on the TV itself and its shelf: a warm rim on the bezel's top and sides, light on the stand,
 *  and a warm pool on the plank. Drawn over the planks, under the devices (the rim is drawn as a halo just outside the
 *  body, so it reads on the bezel edge). WHY: light that falls ON things is what makes it a light, not a tint. It
 *  stays faintly after the TV goes black, so it still reads as the room's master screen. */
const TvKeyLight: React.FC<{ warm: number }> = ({ warm }) => {
  const W = TV.w + 18, H = TV.h + 18, L = TV.cx - W / 2, T = TV.cy - H / 2;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: warm }}>
      {/* WHY the rim cut by about 60% and the light spread as a broad wash instead (round 7 review: the rim read as an
          orange neon outline hugging the bezel, close to the banned glow look): light falls ON the wall over the TV and
          on the plank, it does not outline the set */}
      <div style={{ position: 'absolute', left: L - 6, top: T - 6, width: W + 12, height: H + 12, borderRadius: 16,
        boxShadow: '0 -6px 22px rgba(255,190,130,0.22), -10px 0 26px rgba(255,180,120,0.1), 10px 0 26px rgba(255,180,120,0.1)' }} />
      <div style={{ position: 'absolute', left: TV.cx - 900, width: 1700, top: T - 520, height: 700, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(255,200,150,0.22), rgba(255,186,130,0.08) 60%, transparent)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', left: TV.cx - 900, width: 1800, top: TV.shelf - 40, height: 100, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(255,196,140,0.6), rgba(255,180,125,0.2) 60%, transparent)', mixBlendMode: 'screen' }} />
    </div>
  );
};

/** The person's phone lighting the room in the hush: a soft warm wash on the wall about one and a half phone-widths
 *  either side, and a brighter spill along the plank's lit edge in front of it. */
const HeroPool: React.FC<{ k: number }> = ({ k }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, opacity: k }}>
    <div style={{ position: 'absolute', left: HERO.cx - 330, width: 660, top: HERO.cy - 330, height: 620, borderRadius: '50%',
      background: 'radial-gradient(closest-side, rgba(240,228,250,0.2), rgba(240,226,250,0.07) 55%, transparent)', mixBlendMode: 'screen' }} />
    <div style={{ position: 'absolute', left: HERO.cx - 260, width: 520, top: HERO.shelf - 22, height: 50, borderRadius: '50%',
      background: 'radial-gradient(closest-side, rgba(244,234,252,0.55), rgba(244,234,252,0.15) 60%, transparent)', mixBlendMode: 'screen' }} />
  </div>
);

/** The tablet's price tag: ticking up in line 2; in line 7 the price is struck through, turns to "free" and drops away. */
const TabletTag: React.FC<{ t: number; dim: number }> = ({ t, dim }) => {
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord + 0.08, Q.costWord + 0.75) * 3.999));
  // the moments the price ticks up: each gives the tag a small tug
  const ticks = [1, 2, 3].map((i) => Q.costWord + 0.08 + (i / 3.999) * 0.67);
  // WHY tied over the tablet's top bezel corner (review: the string's top hung in mid-air, tied to nothing); the far,
  // right-hand corner since round 2 (review: on the left it hung against the person's phone and read as its price)
  const ax = TT.cx + TT.w / 2 + 4, ay = top(TT) - 11;
  const strike = t >= Q.costs ? ez(t, STRIKE, STRIKE + 0.2, EASE_IN_OUT) : 0;
  const isFree = t >= TT_FREE;
  const tagText = t < Q.costs ? `$${up[upI].toFixed(2)}` : isFree ? 'free' : '$14.99';
  return (
    // WHY dimmed with the wall: in the hush only the person's phone keeps its light
    <div style={{ position: 'absolute', left: 0, top: 0, filter: dim > 0.01 ? `brightness(${1 - 0.7 * dim})` : undefined }}>
      {/* WHY always drawn once dropped (plan): the tag hangs on this tablet in every wall shot until line 7. It lands
          swinging as "cost" is said (it takes 0.35 s to fall) and then ticks up. Hung at the tablet's left corner so it
          never covers the tablet's terms card. */}
      {/* the string's loop around the bezel's top edge: a dark band over the top and a short wrap down its front */}
      {t >= TAG_DROP && t < TT_FALL && <div style={{ position: 'absolute', left: ax - 5, top: ay - 4, width: 10, height: 14, borderRadius: '5px 5px 3px 3px', border: '3px solid #E9DCC4', borderBottomWidth: 0, boxSizing: 'border-box', filter: 'drop-shadow(0 0 0.6px rgba(30,18,38,0.7))' }} />}
      {/* WHY 0.7 (review: at 0.85 it covered the whole sidebar); it hangs off the corner. Anchored: it falls from above
          frame and its string, already tied to the corner, snaps taut and catches it */}
      <PriceTag x={ax} y={ay + 8} t={t} drop={TAG_DROP} text={tagText} scale={0.7} strike={isFree ? 0 : strike} fall={lin(t, TT_FALL, TT_FALL + 0.55)} fallDir={1} anchored kicks={t < Q.costs ? ticks : []} />
    </div>
  );
};

/** The laptop's six padlocks being knocked off on "What our computers": each pops up off its tile, then drops with
 *  gravity and a spin, past the screen's edge and the shelf, out of the frame. WHY drawn out here in the room (round 6
 *  review: on the screen they could only fade in place, which did not land as the payoff of the six that snapped shut
 *  in line 2). They leave one after another in the order they arrived. */
const LaptopLocks: React.FC<{ t: number }> = ({ t }) => {
  if (t < UNLOCK || t > UNLOCK + 1.5) return null;
  const k = Math.min(LL.w, LL.h) / 100, gx = 2.4 * k;
  const tw = (0.71 * LL.w - gx * 5) / 6, th = 0.24 * LL.h, ls = Math.min(tw, th) * LOCK_SIZE;
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const u = t - LL_UNLOCK_AT(LL_LOCK_ORDER[i]);
        if (u < 0 || u > 0.7) return null;
        const c = tileCenter(LL.w, LL.h, 2, i);
        const up = EASE_OUT(lin(u, 0, 0.08)) * 8;
        const fu = Math.max(0, u - 0.08);
        const dir = i % 2 ? 1 : -1;
        return <div key={i} style={{ position: 'absolute', left: LL.cx - LL.w / 2 + c.x - ls / 2 + dir * fu * 60, top: top(LL) + c.y - ls / 2 - up + 0.5 * 3200 * fu * fu, width: ls, height: ls,
          transform: `rotate(${dir * fu * 420}deg)`, filter: 'drop-shadow(0 3px 3px rgba(10,4,16,0.5))' }}><Lock s={ls} p={1} off={0} /></div>;
      })}
    </>
  );
};

/** Things in the room that are not screens: their tag on the TV, and the cursor getting away down the wall. */
const WorldProps: React.FC<{ t: number; s: number }> = ({ t, s }) => {
  const c = cursorAt(t);
  // WHY never thinner than one screen pixel: at the landing the real caret is under a pixel wide in world terms
  const w = Math.max(c.w, 1.1 / s);
  return (
    <>
      <LaptopLocks t={t} />
      {/* their treasure: the same cream tag as the tablet's, let down slowly on a long string from "believed", landing on
          "treasure" beside the cursor's line; on "far" it drops off and falls out of frame */}
      {t >= Q.believed && t < Q.far + 0.7 && <PriceTag x={TAG_X} y={TAG_Y} t={t} lower={Q.believed} drop={Q.treasure} len={TAG_LEN} rise={TAG_RISE} text="$20/mo" scale={1} fall={lin(t, Q.far, Q.far + 0.6)} />}
      {/* the cursor, out in the room: the same cream as the real caret, landing on two shelf lips, then into the phone */}
      {/* WHY a little cream light on each shelf lip it lands on (review: the landings could not be seen): the lip catches
          the cursor's light for a moment, so each hop visibly lands somewhere */}
      {[0, 1].map((j) => {
        const k = bump(t, HOP0 + (j + HOP_MOVE) * HOP - 0.02, 0.45);
        if (k <= 0) return null;
        const h = HOPS[j + 1];
        return <div key={`lip${j}`} style={{ position: 'absolute', left: h.x - 110, top: h.y + h.h / 2 - 12, width: 220, height: 30, borderRadius: '50%', opacity: k * 0.85,
          background: 'radial-gradient(closest-side, rgba(248,232,200,0.85), rgba(248,232,200,0.25) 55%, transparent)', mixBlendMode: 'screen' }} />;
      })}
      {/* WHY a dark rim (review: the cream line vanished against the pale screens behind it): it reads on any screen */}
      {/* WHY held on the real caret for two frames as the window starts to open, then faded over two (round 2 review: it
          vanished a couple of frames before the window opened, so the hand-off could not be seen) */}
      {t >= HOP0 && t < LAND + 4 / FPS && <div style={{ position: 'absolute', left: c.x - w * (1 + c.sq * 0.6) / 2, top: c.y - c.h / 2 + c.h * c.sq * 0.3, width: w * (1 + c.sq * 0.6), height: c.h * (1 - c.sq * 0.3), borderRadius: Math.min(2, w / 2), background: CARET_COL,
        opacity: 1 - lin(t, LAND + 2 / FPS, LAND + 4 / FPS),
        boxShadow: `0 0 0 ${Math.max(1, 2.2 / s)}px rgba(12,5,20,0.8), 0 ${c.h * 0.1}px ${c.h * 0.22}px rgba(6,2,12,0.5)` }} />}
    </>
  );
};
