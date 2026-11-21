// Round two, take 1 variant B: "The same screen, everywhere."
// The idea: a wall of devices that all show the same screen, because five dark pointers (the few who decide)
// click for everyone: one click, every screen changes in the same frame. They lock things, price things and
// switch on "Share with partners". Then, full of themselves, they build their machine (round 8: no pointers, no "AI" icon): one more
// card in their own locked app, labelled "assistant", with an empty text field, a padlock and a price; it appears on every screen.
// In their excitement the field's caret escapes: one arc down the wall into one person's phone, which becomes
// the real youcoded app. That person asks for something of their own, gets it, and the change spreads until
// every screen is different: the real app in bold, different themes, and things people made in it.
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
//
// Round-three pass (reviewer 2026-11-20): the wall is never shot the same way twice (low angle, overhead,
// dutch tilt, a lateral track with a foreground layer, a full pull-back), two frame-filling close-ups (a
// padlock macro, their price-tagged bar), deeper plum-black grade with near-white screens, real-size pointers
// that twitch in lockstep and are retired for good once the caret escapes, no to-do demo, no bills table,
// and no drawn copy of the app's own interface anywhere (real recorded frames instead).
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { Day, EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { HOLDOUT, NT, NT_CARET_X, NT_FIELD, NewTile, OwnScreen, PhoneAsk, RealApp, ShapeAsk, askKit, homeIn, markFor, SameScreen, TEXT_MID, TEXT_X, WALL_VARIETY, lookFor, lookOf, tileCenter, workingIn } from './take1b-screens';
import { Dev, Device, PriceTag, Shelves, WORLD, dev } from './take1b-world';
import { FREE_EXIT1, FreeTag, RW_CUT, Receipt, SubStack } from './take1b-scenes';

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
// WHY no pointers at all in lines 1-4 (round 7 reviewer BLOCKER, owner: "the mouse pointers are kinda strange"). WHY a boot (round 9
// reviewer BLOCKER: the decade skin jump and the tiny corner marks were invisible, so line 1 read as wallpaper): the wall opens dark;
// on "For" every screen switches on in the same frame to a start-up splash with ONE big plain mark, five marks dealt across the wall
// (take1b-screens markFor); the camera pushes in until a dozen splashes fill the frame on "handful"; on "dictated" every splash gives
// way to the identical app in the same frame.

// ---------- the timeline's derived moments ----------
const CUT_PRIVACY = Q.privacy + 0.1;                 // the "own nothing." headline has had its minimum hold by here
// (9) the ending. WHY this order (round 8 reviewer): the last wall stays sharp and in colour under "open source everything."; the
// words leave completely; then the wall fades to the end card's own background in 8 frames, and only then does the card build.
const END_FADE = Math.max(LAST_WORD_END + 0.2, Q.open + 2.3);    // the headline is gone by here
const END_CARD = END_FADE + 0.27;                                // the wall has faded to the card's background by here
// (1) the boot, the order on "dictated", one person's own arrangement on "interact" and the order taking it back on "technology"
const BOOT = Q.for1, DICT = Q.dictated, TECH = Q.technology1 + 0.06;
const SWAP0 = Q.interact + 0.05;
// (2) the padlocks and the terms
const LOCK0 = Q.could + 0.04;
// WHY the first padlock lands on "decided" (round 9 reviewer: 1.2 s of a slow push with nothing happening): one lock, then the rest on "could"
const LOCK_FIRST = Q.decidedWord + 0.08;
// WHY on "accepted" itself and in one frame everywhere (round 7 reviewer: the line is "we ALL"; the old 0.3 s ripple blurred the beat)
const ACCEPT = Q.acceptedIt + 0.03;
// WHY the laptop shot cuts in on "They" (round 7 reviewer: the old cut fell in the silence before it and opened on a stray arrow)
const CUT_LL = Q.decided;
// WHY a cut on "However" (round 7 reviewer: the 0.3 s cross-fade laid the free* list over the wall like a double exposure): the tag is
// already being pulled up out of the frame, and the cut to the dimmed wall happens on that movement
const HOW0 = Q.however;
// (4) the turn: the real window wakes in the phone from "truly" and is at full brightness by "wonderful"
const WAKE = Q.truly;
// WHY Golden Sunbreak (round 9 reviewer BLOCKER: a cartoon doctor-dog read as "a vet app opened", and the same phone wore Golden Sunbreak
// when it is asked in line 6): sunlight breaking through rain clouds is the picture for "something wonderful", and it is the same person's phone
const WAKE_LOOK = lookOf('golden-sunbreak-phone-wake.png');
// (5) their new technology. WHY (round 8 reviewer BLOCKER: a stand-alone "AI" app icon was the most literal stock picture of AI, held
// for 11 s, with a lone pointer clicking nothing): no pointer and no "AI" letters anywhere. Their machine is one more card in their own
// locked app (the language the opening taught), and it builds itself on the big screen, each step on its spoken word: the card on
// "created", its empty text field on "new kind", a padlock on "technology"; on "artificial" the field's caret starts to blink, and that
// caret is the thing that later escapes.
const NT_CARD = Q.created1 + 0.02, NT_FIELD_AT = Q.newKind, NT_LOCK = Q.technology2 + 0.05;
const BAR_IN = Q.ai;
// "A technology they believed...": every other screen gets the same card, in place, rippling out from the big screen
const RIPPLE = Q.aTechnology + 0.15;
// "a great treasure: shareholder value": a price tag swings on and lands on "value". WHY the ticks (round 8 reviewer: three clicks that
// grew the tile read as a camera bump): "in their excitement" is acted by the price itself, ticking up on "But" and "excite-", while
// the camera holds still
const TAG = Q.value - 0.35;
const TICKS = [Q.but, Q.excitement + 0.18];
const PRICES = ['$20/mo', '$30/mo', '$49/mo'];
// (6) the escape. WHY one arc (round 8 reviewer BLOCKER: three hops under a whip-following camera smeared the wall): the caret leaves
// on "control" in ONE continuous eased arc of 0.9 s, from the big screen's text field to the phone's message box, the camera leading it
const HOP0 = Q.control, FLY_T = 0.9, LAND = HOP0 + FLY_T;
// WHY a hold before the push (round 8 reviewer: the turning point of the film got no beat): the phone opens from its message box at
// medium size and is held 0.6 s before the camera goes in to the box
const MACRO = LAND + 0.6;
const TYPE0 = LAND + 0.85, TYPE1 = Q.software + 0.75, SEND = TYPE1 + 0.25;
// the request, typed into the REAL phone's own message box (the box is a real capture with its placeholder hidden; the letters are set
// in the app's own font, size and colour at its own spot).
// WHY per-key times (owner: "the typing feels broken/laggy"): each letter has its own moment, uneven like a real hand (seeded, so every
// render is identical): a little longer after a space, the first and last keys never rushed. The last key lands on TYPE1.
// WHY this sentence (round 8 reviewer BLOCKER: "make me a home app" sounded like a product prompt): lower case, a little unsure, the way a
// person really asks, and it matches the Home page that comes back; 19 letters sit on one line of the box
const REQUEST = 'a page for my flat?';
const KEYS: number[] = (() => {
  let seed = 7;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gaps: number[] = [];                          // gap after letter j (before letter j+1)
  for (let j = 0; j < REQUEST.length - 1; j++) {
    const c = REQUEST[j];
    gaps.push((0.72 + r() * 0.62) * (c === ' ' ? 1.55 : c === ',' ? 2.4 : 1) * (j === 0 ? 1.5 : 1));
  }
  const sum = gaps.reduce((a, g) => a + g, 0);
  let acc = 0;
  return REQUEST.split('').map((_, i) => { const k = TYPE0 + ((TYPE1 - TYPE0) * acc) / sum; acc += gaps[i] ?? 0; return k; });
})();
const charsAt = (t: number) => (t >= SEND ? 0 : KEYS.filter((k) => t >= k).length);
/** The caret stays solid while keys are going in, then blinks steadily, like a real text box. */
const typedCaret = (t: number) => {
  const last = [...KEYS].reverse().find((k) => t >= k) ?? TYPE0;
  const since = t - last;
  return since < 0.5 || Math.floor((since - 0.5) / 0.53) % 2 === 1;
};
// WHY a working beat (round 8 reviewer BLOCKER: the page came back 0.6 s after send with no sign of the app making it): the sent words
// lift into the app's own bubble (SENT_D), then the REAL window takes over with its own working line under the bubble, and the page only
// rises from "foundation", landing as "monopolies" is said: about a second and a half after send
const SENT_D = 0.4;
const FLIP_HERO = Q.foundation - 0.1;
// "for anyone who asks". WHY (round 8 reviewer BLOCKER: only one neighbour changed, the payoff picture said the opposite of the words):
// two neighbours are seen ASKING (their own sent bubble and working line, real captures) before their pages come, and eight more turn
// their own in a ripple out from the phone, 0.12 s apart, all inside the frame
const ASKERS: Record<string, { ask: number; page: number }> = {
  '0:l1': { ask: Q.forAnyone + 0.02, page: Q.asks - 0.05 },
  '-1:l1': { ask: Q.forAnyone + 0.22, page: Q.asks + 0.18 },
};
// (7) "we get to decide": two more real asks. WHY (round 8 reviewer BLOCKER): no unasked second page, a real "working" beat after each
// send, the window opening from its own message box (no wipe), and the page rising in over 9 frames
const LL_IN = Q.decide - 0.6;                                   // the cut to the laptop
const UNLOCK = LL_IN + 0.1;
const LL_OPEN = UNLOCK + 0.3;                                   // the real window opens from its box
// WHY the window is seen whole for 0.45 s before the push into its box (round 8 reviewer: it never read as an app on a laptop)
const LL_T0 = LL_OPEN + 0.45, LL_T1 = LL_T0 + 0.8, LL_SEND = LL_T1 + 0.1;
const LL_FLIP = Q.canWord - 0.33;                               // the page lands on "can"
const TT_IN = Q.costs - 0.22;                                   // the cut to the tablet, just before "What it costs"
const STRIKE = Q.costsWord - 0.25;
const TT_OPEN = TT_IN + 0.1;
const TT_T0 = TT_OPEN + 0.18, TT_T1 = TT_T0 + 0.6, TT_SEND = TT_T1 + 0.08;
const TT_FLIP = TT_SEND + 0.36;
/** Per-key times for a typed sentence: uneven like a real hand (seeded: every render is identical), longer after a space. */
const mkKeys = (text: string, t0: number, t1: number, seed: number): number[] => {
  let sd = seed;
  const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const gaps: number[] = [];
  for (let j = 0; j < text.length - 1; j++) gaps.push((0.72 + r() * 0.62) * (text[j] === ' ' ? 1.55 : 1));
  const sum = gaps.reduce((a, g) => a + g, 0);
  let acc = 0;
  return text.split('').map((_, i) => { const k = t0 + ((t1 - t0) * acc) / sum; acc += gaps[i] ?? 0; return k; });
};
const KIT_LL = askKit('devils-garden', 'laptop'), KIT_TT = askKit('halftone-dimension', 'tablet');
const KEYS_LL = mkKeys(KIT_LL.text, LL_T0, LL_T1, 11), KEYS_TT = mkKeys(KIT_TT.text, TT_T0, TT_T1, 5);
const ASK: Record<string, { kit: typeof KIT_LL; shape: 'laptop' | 'tablet'; keys: number[]; open: number; send: number; at: string; caret: string }> = {
  lockLaptop: { kit: KIT_LL, shape: 'laptop', keys: KEYS_LL, open: LL_OPEN, send: LL_SEND, at: '13% 90%', caret: '#F6EDF2' },
  tagTablet: { kit: KIT_TT, shape: 'tablet', keys: KEYS_TT, open: TT_OPEN, send: TT_SEND, at: '7% 91%', caret: '#F8E8F0' },
};
/** A steady caret while keys go in, then a regular blink: the same feel as the phone's. */
const caretFor = (keys: number[], t: number) => {
  const last = [...keys].reverse().find((k) => t >= k) ?? keys[0];
  const since = t - last;
  return since < 0.4 || Math.floor((since - 0.4) / 0.53) % 2 === 1;
};
// (9) the phone's page is shared next door. WHY the landings stay on "long," and "long last" (round 5 reviewer); WHY 0.55 s arcs (round 8)
const SHARE_AT = [Q.long1, Q.longLast], FLY = 0.55;
// WHY the pull-back starts after the second "long" and lasts a full second (round 8 reviewer: a 0.25 s whip with no story reason)
const SHARE_HOLD = Q.long2End + 0.2;

type Head = { text: string; at: number; out: number; fade?: number; times?: number[] };
const HEADS: Head[] = [
  // WHY a 0.15 s fade (round 9 reviewer: with the usual 0.35 s fade "nothing." was fully readable for only 1.4 s before the cut)
  { text: 'own *nothing.', at: Q.own, out: CUT_PRIVACY, fade: 0.15 },
  // WHY each word on its own spoken start (round 9 reviewer: all three cascaded in 0.2 s, "happened." a second before it was said), so the
  // purple "wonderful" lands as the phone reaches full brightness
  { text: 'something *wonderful happened.', at: Q.something, out: Q.blinded - 0.04, times: [Q.something, Q.wonderful, Q.happened] },
  { text: 'for *anyone who asks.', at: Q.forAnyone, out: Q.andSo - 0.04 },
  { text: 'open source *everything.', at: Q.open, out: END_FADE },
];
// WHY checks: the brand guide's muted-video rule (1.2 s + 0.25 s a word), and beats that need room. If the
// voice is re-timed and something would flash by, the render stops instead of shipping it.
for (const h of HEADS) {
  const words = h.text.split(/\s+/).length;
  if (h.out - h.at < 1.2 + 0.25 * words) throw new Error(`take1b: headline "${h.text}" is up ${(h.out - h.at).toFixed(2)} s, needs ${1.2 + 0.25 * words} s`);
  // WHY (round 9 reviewer): the time a plate is whole and at full strength, from its last word landing to the start of its fade
  const whole = h.out - (h.fade ?? 0.35) - ((h.times ? h.times[h.times.length - 1] : h.at + 0.055 * (words - 1)) + 0.3);
  if (whole < (h.times ? 0.3 : 1.2)) throw new Error(`take1b: headline "${h.text}" is whole for only ${whole.toFixed(2)} s`);
}
if (END_CARD + 2.5 > 75) throw new Error('take1b: the end card would be held under 2.5 s');
if (WALL_VARIETY < 20) throw new Error(`take1b: the wall uses only ${WALL_VARIETY} different screens, needs 20`);
if (TAG < Q.shareholder - 0.2) throw new Error('take1b: the price would land before "shareholder"');
if (MACRO < LAND + 0.4) throw new Error('take1b: the phone would not be held before the push into its message box');
if (TYPE0 < MACRO + 0.15) throw new Error('take1b: typing would start before the camera is in the message box');
if (FLIP_HERO - (SEND + SENT_D) < 0.4) throw new Error('take1b: the phone would not be seen working for 0.4 s before its page arrives');
if (Q.andSo - (FLIP_HERO + 0.8) < 1.5) throw new Error('take1b: the made page would not be held before "for anyone who asks"');
if (LL_FLIP - LL_SEND < 0.35) throw new Error('take1b: the laptop would not be seen working before its page arrives');
if (TT_IN - (LL_FLIP + 0.3) < 0.4) throw new Error('take1b: the laptop\'s page would be up under 0.4 s');
if (TT_FLIP - TT_SEND < 0.3) throw new Error('take1b: the tablet would not be seen working before its page arrives');
if (RW_CUT - (TT_FLIP + 0.3) < 0.3) throw new Error('take1b: the tablet\'s page would be up under 0.3 s');
if (LL_IN < Q.andSo + 2) throw new Error('take1b: the laptop shot would start before the wall has turned');
if (SHARE_HOLD - SHARE_AT[1] < 0.35) throw new Error('take1b: the second shared page would not be seen landing');
if (SHARE_AT[0] - FLY < Q.itsTime) throw new Error('take1b: the first shared card would leave before the shot starts');

// ---------- when each screen becomes someone's own ----------
// the story's own devices change on their own beats; the holdout keeps the old app until "past"
const STORY = ['hero', 'lockLaptop', 'tagTablet', HOLDOUT];
// WHY rows 0 and -1 only (round 8): those are the shelves inside the "for anyone who asks" frame, above the headline band
const NEAR = WORLD.devs.filter((d) => !STORY.includes(d.id) && !ASKERS[d.id] && (d.row === 0 || d.row === -1))
  .sort((a, b) => Math.hypot(a.cx - HERO.cx, a.cy - hy) - Math.hypot(b.cx - HERO.cx, b.cy - hy));
const FOLLOW = NEAR.slice(0, 10).map((d) => d.id);
const SHARE_TARGETS = ['tagTablet', L0.id];
// WHY a wave that travels with the camera (round 8 reviewer: the track was rows of the old screens, turning at a flat pace): every
// screen already in frame when "And so" starts turns in a quick left-to-right wave over the first second; every screen the track brings
// in turns just as it has fully slid into view. Worked out once from the track shot's own camera keys.
let TRACK_FLIPS: Map<string, number> | null = null;
const trackFlips = (): Map<string, number> => {
  if (TRACK_FLIPS) return TRACK_FLIPS;
  const m = new Map<string, number>();
  const shot = SHOTS.find((s) => s.at === Q.andSo);
  if (!shot) throw new Error('take1b: no track shot on "And so"');
  const first: Dev[] = [];
  for (const d of WORLD.devs) {
    if (STORY.includes(d.id) || ASKERS[d.id] || FOLLOW.includes(d.id)) continue;
    for (let i = 0; Q.andSo + i / 30 < LL_IN; i++) {
      const t = Q.andSo + i / 30;
      const [cx, cy, s] = camAtKeys(t, shot);
      const hw = 960 / s, hh = 540 / s;
      if (d.cx + d.w / 2 < cx + hw - 30 / s && d.cx - d.w / 2 > cx - hw && Math.abs(d.cy - cy) < hh + d.h * 0.3) { if (i === 0) first.push(d); else m.set(d.id, t + 0.04); break; }
    }
  }
  const xs = first.map((d) => d.cx), x0 = Math.min(...xs), x1 = Math.max(...xs);
  for (const d of first) m.set(d.id, Q.andSo + 0.08 + ((d.cx - x0) / Math.max(1, x1 - x0)) * 1.0 + jit(d) * 0.1);
  TRACK_FLIPS = m;
  return m;
};
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return FLIP_HERO;
  if (d.id === 'lockLaptop') return LL_FLIP;
  if (d.id === 'tagTablet') return TT_FLIP;
  if (d.id === HOLDOUT) return Q.past + 0.05;
  if (ASKERS[d.id]) return ASKERS[d.id].page;
  const fi = FOLLOW.indexOf(d.id);
  if (fi >= 0) return Q.anyone + fi * 0.12;
  const tr = trackFlips().get(d.id);
  if (tr !== undefined) return tr;
  // everything the track never shows changes in a ripple over the same seconds, so the wide shots later are complete
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.canDo - Q.andSo - 0.3) + jit(d) * 0.25;
};
const SAME_GLOW = 'rgba(236,230,244,1)';

// ---------- screen geometry the caret and the tags aim at ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
// the real app's message box on the hero phone. WHY exact: the still is cut to the phone's own shape (1170x2442), so
// the box's words start at TEXT_X of 1170 across and TEXT_MID of 2442 down (take1b-screens.tsx)
const heroInput = { x: HS.x + (TEXT_X / 1170) * HERO.w, y: HS.y + (TEXT_MID / 2442) * HERO.h };
const HERO_CARET_H = (58 / 2442) * HERO.h;   // the phone's own caret height (take1b-screens PhoneAsk)
// the message box's middle, for the macro shot
const BOX_Y = heroInput.y;
// WHY the box sits 86% of the way down the frame (round 8 reviewer: the sharpest small text under the typing was a developer model name):
// the row of chips under the box falls below the frame edge; the capture itself is never edited
const BOX_UP = 0.365 * 1080;
// where the tablet's price tag is slapped on in line 2: hanging off its lower-right corner (round 7)
const TAG_PT = { x: TT.cx + TT.w / 2 - 28, y: TT.cy + TT.h / 2 - 16 };
const TAG_S = 0.85;
// WHY the upper-right corner in line 7 (round 8 reviewer: the tag covered the message box exactly where the request was being typed)
const TAG_PT7 = { x: TT.cx + TT.w / 2 - 8, y: top(TT) + 8 };
// WHY round 9 (reviewer BLOCKER: the rise to $14.99 was readable for 0.25 s): $9.99 is slapped on as the shot opens on "what", and a
// $14.99 sticker is slapped over it on "cost," itself, then held 0.7 s to the cut
const TAG_DROP = Q.cost + 0.06, PRICE_FLIP = Q.costWord;
// their new card on the big screen, in world pixels, and the caret in its text field
const TVL = TV.cx - TV.w / 2, TVT = top(TV);
const NT_W = { x: TVL + NT.x * TV.w, y: TVT + NT.y * TV.h, w: NT.w * TV.w, h: NT.h * TV.h };
const TV_CARET = { x: NT_W.x + NT_CARET_X * NT_W.w, y: NT_W.y + (NT_FIELD.y + NT_FIELD.h / 2) * NT_W.h, h: NT_FIELD.h * NT_W.h * 0.62 };
// the TV's price tag hangs from the card's top-right corner, inside the card (about a quarter of its width)
const TV_TAG = { x: NT_W.x + NT_W.w - 0.14 * NT_W.w, y: NT_W.y + 6, s: (0.25 * NT_W.w) / 190 };
const HO = dev(HOLDOUT);
// framings for "for anyone who asks" and the last wall. WHY these heights: the shelf line (and, at the end, the empty lit wall under
// the last shelf) lies behind the headline band, never a row of bright moving screens (round 8 reviewer)
const ANY_S = 0.95, ANY_Y = -(0.22 * 1080) / ANY_S;
const END_S = 0.6, END_Y = 880 - (0.2 * 1080) / END_S;

const NT_C_X = NT_W.x + NT_W.w / 2;
// the laptop's message box (devils-garden-laptop: the box's words start about a quarter of the way across, 90% of the way down)
const LL_BOX = { x: LL.cx - LL.w / 2 + LL.w * 0.24, y: top(LL) + LL.h * 0.9 };

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
type Scene = 'print' | 'rewind' | 'stack' | 'free';
// dof: a real lens's depth of field on a wide of the wall: the shelves near the frame's middle are sharp, the rows above and below go soft and dim
// band: half-height of the sharp band in world px (default 120); lit: devices kept bright in a close-up although they are out of focus
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: Scene; linear?: boolean; out?: boolean; rack?: [number, number, number]; follow?: boolean; dof?: boolean; band?: number; lit?: string[] };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the cut from the close-up of the press to the wide: as every dialog starts to leave
const ACCEPT_WIDE = ACCEPT + 0.15;
// the laptop's tile row, for the padlock macro
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
const SHOTS: Shot[] = [
  // (1) WHY a low three-quarter dolly that never stops (round 7 reviewer BLOCKER: a flat, evenly lit grid held still for 4 s read as
  // wallpaper): the camera looks up at the wall and slides along it while it pushes in, with depth of field, so the rows pass at different
  // speeds and the eye has a middle to rest on. On "interact" a straight cut lands on the phone and the tablet
  // WHY round 9: the push brings a dozen boot splashes to fill the frame by "handful" (two shelves, both in the sharp band), and keeps
  // drifting right so the cut on "interact" carries on in the same direction
  { at: Q.start, linear: true, dof: true, band: 330, keys: [[0, [-560, -318, 0.9, 6, 0]], [Q.handful, [-330, -318, 1.2, 5, 0]], [Q.interact, [-150, -312, 1.36, 4, 0]]] },
  // WHY the pair drifts right with an easing-out (round 9 reviewer: the moving dolly cut to a dead-still medium): the motion carries over the cut
  { at: Q.interact, out: true, keys: [[Q.interact, [TWO_X - 30, hy - 20, 2.3]], [CUT_LL, [TWO_X + 14, hy - 22, 2.44]]], focus: ['hero', 'tagTablet'] },
  // (2) "what your computers could do": a cut on "They" to the laptop seen from a little above, keyboard deck in view, so it reads as a
  // computer and not as the tablet again; a slow push while the padlocks spread from the middle tile outwards
  { at: CUT_LL, keys: [[CUT_LL, [LL_GRID.x - 30, LL.cy + 34, 2.0, -5, 0]], [Q.could, [LL_GRID.x, LL.cy + 28, 2.5, -4, 0]], [Q.cost, [LL_GRID.x + 10, LL.cy + 26, 2.62, -4, 0]]], focus: ['lockLaptop'] },
  // "what it would cost": WHY a macro of the price tag from a little above and rolled (round 9 reviewer BLOCKER: a third straight-on
  // medium of the same layout read as a jump cut): the tablet's locked tiles are only soft colour behind the tag; it eases back a little
  { at: Q.cost, out: true, keys: [[Q.cost, [TAG_PT.x - 70, TAG_PT.y - 46, 3.5, -6, -2]], [Q.data, [TAG_PT.x - 100, TAG_PT.y - 60, 3.0, -6, -2]]], focus: [], lit: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, 0, 1]]], scene: 'print' },
  // (3) WHY a slow slide along two shelves from a little above (round 7 reviewer: the "overhead" read as a fourth flat wide): a distinct
  // shot, the same dialog sweeping across the screens left to right through the pause of "all...", no dialog cut by the frame
  // WHY held to "we" (round 9 reviewer: the cut came before the sweep had crossed the frame)
  { at: Q.weAll, dof: true, linear: true, keys: [[Q.weAll, [-760, -300, 1.0, -5, 0]], [Q.weAll2, [-280, -312, 1.05, -5, 0]]] },
  // WHY a close-up for the "just" and a wide for the "all" (round 9 reviewer: the trio was a fourth flat wide of identical screens): one
  // phone big enough to read its dialog, its press seen up close; then a cut wide just as every dialog on the wall is dismissed at once
  { at: Q.weAll2, keys: [[Q.weAll2, [HERO.cx, hy - 6, 2.6]], [ACCEPT_WIDE, [HERO.cx, hy - 8, 2.7]]], focus: ['hero'] },
  { at: ACCEPT_WIDE, dof: true, band: 260, keys: [[ACCEPT_WIDE, [-120, -300, 0.92, 6, 0]], [Q.weAccepted, [-110, -302, 0.96, 6, 0]]] },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  // (4) "however, recently...": the wall goes dark and the camera finds one phone
  // WHY one continuous push from the wide to the phone, still settling at the cut to "Blinded" (round 7 reviewer: it raced, then held dead
  // still for 0.9 s): a single eased move that reaches about 2x on "wonderful" and drifts on; the phone stays high so the headline band
  // under it only ever lies over dark shelf
  // WHY round 9: it starts closer (0.85, so the phone is a subject from the first second) and ends tighter (2.35, so only the inner edges
  // of the switched-off neighbours show)
  { at: HOW0, keys: [[HOW0, [0, -260, 0.85, 0, 0]], [Q.blinded, [0, hy + 70, 2.35]]], focus: ['hero'] },
  // (5) WHY one direction of travel (round 8 reviewer BLOCKER: wide, tight, wide, tight on the same TV in 17 s, with the TV and its tag
  // cropped off the top): a hard cut on "Blinded" to the low-angle dark wall at normal brightness, and from there ONE slow push in to
  // the big screen through "created ... intelligence", ending with the whole screen inside the margins (scale 1.25)
  { at: Q.blinded, keys: [[Q.blinded, [TV.cx * 0.4, -640, 0.55, 7, 0]], [Q.these, [NT_W.x * 0.3, -700, 0.66, 5, 0]], [Q.created1 + 0.5, [40, TV.cy + 20, 1.02, 2, 0]], [Q.intelligence + 0.6, [40, TV.cy - 10, 1.25, 0, 0]], [Q.aTechnology, [40, TV.cy - 10, 1.27, 0, 0]]], focus: ['tv'] },
  // a single pull-out on "a technology they believed": the same new card arrives on every screen, rippling out from the big screen
  { at: Q.aTechnology, out: true, keys: [[Q.aTechnology, [40, TV.cy - 10, 1.27, 0, 0]], [Q.about + 0.35, [-60, TV.cy + 430, 0.74, 2, 0]], [Q.great, [-70, TV.cy + 436, 0.73, 2, 0]]], focus: ['tv'] },
  // "a great treasure: shareholder value": a cut to a medium shot from a new angle (a touch low and rolled), card and tag inside the margins
  { at: Q.great, keys: [[Q.great, [NT_C_X + 30, TV.cy - 40, 1.2, 3, -1.2]], [Q.but, [NT_C_X + 20, TV.cy - 44, 1.27, 3, -1.2]]], focus: ['tv'] },
  // (6) "But in their excitement": a straight, closer medium that holds still while the price ticks up; the caret then leaves from here
  { at: Q.but, keys: [[Q.but, [NT_C_X + 10, TV.cy - 50, 1.4, 0, 0]], [HOP0, [NT_C_X + 10, TV.cy - 52, 1.44, 0, 0]]], focus: ['tv'] },
  // the flight: the camera eases out a little at mid-flight so both ends are understood, leads the caret, and settles on the phone,
  // which is then held at medium size while it opens from its message box
  { at: HOP0, follow: true, keys: [[HOP0, [NT_C_X + 10, TV.cy - 52, 1.44]], [HOP0 + FLY_T * 0.5, [80, (TV.cy + hy) / 2, 1.0]], [LAND, [HERO.cx, hy, 2.0]], [MACRO, [HERO.cx, hy + 4, 2.12]]], focus: ['hero'] },
  { at: MACRO, keys: [[MACRO, [HERO.cx, hy + 4, 2.12]], [TYPE0 + 0.3, [HERO.cx, BOX_Y - BOX_UP / 11.6, 11.6]], [SEND - 0.05, [HERO.cx, BOX_Y - BOX_UP / 11.9, 11.9]], [SEND + 0.5, [HERO.cx, hy, 2.75]], [FLIP_HERO + 1.6, [HERO.cx, hy, 2.62]]], focus: ['hero'] },
  // "for anyone who asks": WHY (round 8 reviewer): the page is held whole for 0.8 s, then ONE short move out to a frame where ten screens
  // can be read (scale 1.1), held still while they change and while the headline is up; the big pull-back only comes with "And so"
  { at: FLIP_HERO + 1.6, keys: [[FLIP_HERO + 1.6, [HERO.cx, hy, 2.62]], [Q.anyone + 0.1, [0, ANY_Y, ANY_S]], [Q.andSo, [0, ANY_Y + 4, ANY_S * 1.015]]], focus: ['hero', ...FOLLOW, ...Object.keys(ASKERS)] },
  // (7) "and so... for the first time in a very long while": a lateral track along the shelves with an eased start and stop and a slight
  // push in, so it reads as a move with intent; the screens turn in a wave that travels with it (trackFlips)
  { at: Q.andSo, keys: [[Q.andSo, [-1500, -320, 0.62, 2, 0]], [LL_IN, [1500, -300, 0.7, 2, 0]]] },
  // WHY the laptop is first seen whole, keyboard and frame in view (round 8 reviewer BLOCKER: a desert picture with a text field): 2.2-2.4x
  // while it unlocks and opens; then a push onto its message box while the request goes in, so the words can be read; back out to see the
  // app working and the page arrive
  { at: LL_IN, keys: [[LL_IN, [LL.cx, LL.cy + 34, 2.2]], [LL_T0 - 0.05, [LL.cx, LL.cy + 34, 2.4]], [LL_T0 + 0.3, [LL_BOX.x, LL_BOX.y - 24, 4.6]], [LL_SEND, [LL_BOX.x + 8, LL_BOX.y - 24, 4.7]], [LL_SEND + 0.4, [LL.cx, LL.cy + 34, 2.35]], [TT_IN, [LL.cx, LL.cy + 34, 2.42]]], focus: ['lockLaptop'] },
  // the tablet whole, its price tag hanging off the upper-right corner, clear of the message box
  { at: TT_IN, keys: [[TT_IN, [TT.cx + 36, TT.cy - 12, 2.4]], [RW_CUT, [TT.cx + 36, TT.cy - 12, 2.55]]], focus: ['tagTablet'] },
  { at: RW_CUT, keys: [[RW_CUT, [0, 0, 1]]], scene: 'rewind' },
  // (8) "free ourselves": low angle again, the whole wall flips to daylight. WHY a slow lateral drift with a slight push (round 8 reviewer:
  // the wall held nearly still for 2 s), and one holdout monitor that keeps the old app until "past"
  { at: Q.free, keys: [[Q.free, [-90, -380, 0.66, 5, 0]], [Q.itsTime, [70, -400, 0.71, 4, 0]]] },
  // (9) WHY a straight cut on "It's" to the three devices framed whole (round 8 reviewer: a 5-frame jump-zoom, devices cropped by both edges)
  { at: Q.itsTime, keys: [[Q.itsTime, [TRIO_X, hy - 30, 1.32]], [SHARE_HOLD, [TRIO_X, hy - 34, 1.4]], [SHARE_HOLD + 1.0, [0, END_Y, END_S]], [END_FADE, [0, END_Y - 8, END_S * 1.02]]], focus: TRIO },
];
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): [number, number, number, number, number] => {
  if (s.follow && t >= HOP0 - 0.05 && t < LAND + 0.15) {
    // WHY the camera LEADS the caret (aims a few frames ahead of it, round 8 reviewer): the eye is carried along the arc, never dragged
    const base = camAtKeys(t, s), c = caretAt(Math.min(LAND, t + 0.1));
    const w = 0.7 * ez(t, HOP0 - 0.05, HOP0 + 0.2, EASE_IN_OUT) * (1 - ez(t, LAND - 0.2, LAND + 0.15, EASE_IN_OUT));
    return [lerp(base[0], c.x, w), lerp(base[1], c.y, w), base[2], base[3], base[4]];
  }
  return camAtKeys(t, s);
};
const camAtKeys = (t: number, s: Shot): [number, number, number, number, number] => {
  const k = s.keys;
  const full = (c: Cam): [number, number, number, number, number] => [c[0], c[1], c[2], c[3] ?? 0, c[4] ?? 0];
  if (t <= k[0][0]) return full(k[0][1]);
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      // WHY linear for the track: a tracking shot runs at one speed; easing it would read as a lurch
      const p = s.linear ? lin(t, k[i - 1][0], k[i][0]) : (s.out ? EASE_OUT : EASE_IN_OUT)(lin(t, k[i - 1][0], k[i][0]));
      const a = full(k[i - 1][1]), b = full(k[i][1]);
      // WHY log-space zoom: equal steps in log scale read as a steady camera move; linear zoom lurches at the end
      return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), p)), lerp(a[3], b[3], p), lerp(a[4], b[4], p)];
    }
  }
  return full(k[k.length - 1][1]);
};

// ---------- the escaping caret ----------
// WHY one arc bowed to the right (round 8 reviewer): a single path the eye can follow, from the big screen's text field to the first
// letter of the phone's message box; it is the field's own caret, so it starts at that caret's height and ends at the phone's
const caretAt = (t: number) => {
  const p = EASE_IN_OUT(lin(t, HOP0, LAND));
  return { x: lerp(TV_CARET.x, heroInput.x, p) + Math.sin(Math.PI * p) * 240, y: lerp(TV_CARET.y, heroInput.y, p), h: lerp(TV_CARET.h, HERO_CARET_H, p) * (1 + 1.5 * Math.sin(Math.PI * p)), p };   // WHY it grows in mid-flight: still a text cursor's shape, but big enough to follow across the wall
};
// WHY no pointers at all any more (owner: "the mouse pointers are kinda strange"; round 8 reviewer BLOCKER: the one left in lines 5-6 stood
// on an empty shelf clicking nothing and covered the caret): the screens act by themselves.

// ---------- what each screen shows at time t ----------
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode, at = '50% 50%', mode: 'circle' | 'wake' | 'rise' = 'wake') => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  const e = EASE_OUT(f);
  // WHY three kinds (reviewer: the same circular porthole on every screen looked like a stock transition):
  //  circle = only where the caret lands, growing from its box; wake = every other screen wakes from its bottom edge
  //  with a tiny settle; rise = the made page slides up into the phone as if it were built there. The new screen is
  //  always complete behind the reveal, never an empty panel.
  if (mode === 'circle') return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `circle(${e * 150}% at ${at})` }}>{b}</div></>;
  if (mode === 'rise') return <>{a}<div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - e) * 100}%)`, boxShadow: '0 -20px 40px rgba(10,4,18,0.3)' }}>{b}</div></>;
  return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `inset(${(1 - e) * 100}% 0 0 0)` }}><div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.04 * (1 - e)})` }}>{b}</div></div></>;
};
// WHY one 6-frame reflow, on "technology" (round 9): the app first appears on "dictated" already in its order (layout 1, warm tiles);
// on "technology" the blocks move and the tiles turn cool on every screen in exactly the same frames; the sync is the point
const layAt = (t: number) => 1 + ez(t, TECH, TECH + 0.2, EASE_IN_OUT);
// WHY only on the tablet, worded "Layout restored" (round 9 reviewer): it explains the snap-back of the tile its owner had moved
const bannerAt = (t: number) => (t >= TECH && t < TECH + 0.9 ? lin(t, TECH, TECH + 0.9) : 0);
// the boot: every screen is off until "For", then shows its splash; on "dictated" every splash gives way to the app in one frame
const splashAt = (t: number) => (t >= DICT ? 0 : Math.max(0.002, ez(t, BOOT, BOOT + 0.2, EASE_IN_OUT)));
// the tablet owner's own arrangement: tile 2 is picked up on "interact" and trades places with tile 3, then is yanked back on "technology"
const swapAt = (t: number) => ({ a: 2, b: 3, p: ez(t, SWAP0 + 0.12, SWAP0 + 0.55, EASE_IN_OUT) * (1 - ez(t, TECH, TECH + 0.15, EASE_IN)), lift: ez(t, SWAP0, SWAP0 + 0.12) * (1 - ez(t, SWAP0 + 0.55, SWAP0 + 0.68)) });
// the laptop's padlocks land one tile after another, starting from the tile under the frame's centre (tile 2) and spreading outwards
const LL_LOCK_ORDER = [4, 2, 0, 1, 3, 5];
const blink = (frame: number) => Math.floor(frame / 15) % 2 === 0;

/** The big screen: still their same generic app, with the new card building itself over its blocks (take1b-screens NewTile). */
const TVScreen: React.FC<{ same: React.ReactNode; t: number; frame: number }> = ({ same, t, frame }) => (
  <>
    {same}
    <div style={{ position: 'absolute', left: NT.x * TV.w, top: NT.y * TV.h, width: NT.w * TV.w, height: NT.h * TV.h }}>
      <NewTile w={NT.w * TV.w} h={NT.h * TV.h} t={t} card={NT_CARD} field={NT_FIELD_AT} lock={lin(t, NT_LOCK, NT_LOCK + 0.4)} caretOn={t >= BAR_IN && blink(frame)} caretGone={t >= HOP0} />
    </div>
  </>
);

const screenOf = (d: Dev, t: number, frame: number): { node: React.ReactNode; glow: string; lift: number } => {
  const look = lookFor(d);
  const fa = flipAt(d);
  const isHero = d.id === 'hero';
  // WHY the asked-for pages rise in over 9 frames (round 8 reviewer: a hard wipe), the rest wake over half a second
  const fd = isHero ? 0.8 : ASK[d.id] ? 0.3 : ASKERS[d.id] ? 0.45 : 0.5;
  const f = lin(t, fa, fa + fd);
  // WHY every device lifts in a ripple out from the phone on "free" (reviewer: the thesis word was never acted out); WHY twice as high
  // (round 8 reviewer: too small to see at wall scale); the holdout's own turn on "past" gets a bigger lift: it is the last one
  const lift = bump(t, fa, 0.7) * 0.9 * (d.id === HOLDOUT ? 1.8 : 1) + bump(t, Q.freeWord + 0.05 + (d.dist / MAXD) * 0.9, 0.6) * 1.6;
  const lockS = Q.could - 0.05 + (d.dist / MAXD) * 0.45 + jit(d) * 0.15;
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => (r === 0 ? lin(t, LOCK_FIRST, LOCK_FIRST + 0.4) : lin(t, LOCK0 + (r - 1) * 0.08, LOCK0 + (r - 1) * 0.08 + 0.4))) : lin(t, lockS, lockS + 0.45);
  // their new card arrives on every screen in place, rippling out from the big screen (which builds its own, larger one)
  const aiAt = RIPPLE + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 1.4;
  // WHY the terms dialog sweeps across the wall left to right through the pause of "all..." (round 7 reviewer: a random stagger left a messy
  // half-state): the hesitation is animated; every Accept is then pressed in the same frame
  const dlgAt = Q.weAll + 0.08 + Math.max(0, Math.min(1, (d.cx + 1700) / 2600)) * 0.75;
  const tt = d.id === 'tagTablet';
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t)} banner={tt ? bannerAt(t) : 0} bannerText="Layout restored"
      splash={splashAt(t)} mark={markFor(d.id)} swap={tt && t < TECH + 0.3 ? swapAt(t) : undefined}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, UNLOCK, UNLOCK + 0.4) : 0}
      dialog={lin(t, dlgAt, dlgAt + 0.22)}
      accept={lin(t, ACCEPT, ACCEPT + 0.5)}
      ai={d.id === 'tv' ? 0 : lin(t, aiAt, aiAt + 0.35)} />
  );
  // WHY the old shared dip is gone (round 9 reviewer: invisible); the order now lands as the splash-to-app snap with its own overshoot
  const dip = 0;
  if (isHero) {
    // the phone becomes the real app the moment the caret lands in it (opening from its message box, held at medium size); then the
    // request is typed into that box, sent, the app is seen working, and the page asked for rises in the person's own look
    const atInput = `${((heroInput.x - HS.x) / HERO.w) * 100}% ${((heroInput.y - HS.y) / HERO.h) * 100}%`;
    const n = charsAt(t);
    // WHY the box blinks between two real pictures before the first key: the app's own caret, not a drawn one
    const idleOn = Math.floor((t - LAND) / 0.53) % 2 === 0;
    const real = <PhoneAsk w={d.w} h={d.h} text={REQUEST.slice(0, n)} typing={n > 0} caretOn={n > 0 ? typedCaret(t) : idleOn} sent={t >= SEND ? lin(t, SEND, SEND + SENT_D) : 0} sentText={REQUEST} />;
    const own = <OwnScreen look={look} w={d.w} h={d.h} />;
    const g = lin(t, LAND - 0.05, LAND + 0.45);
    // WHY the turn is an exposure RISE (round 7 reviewer BLOCKER: the chosen screen went darker on "something" and read as switching off):
    // through "However, recently..." this is the one lit screen on a dark wall; on "truly" the real youcoded window (a real capture: a light
    // community theme on its empty chat, a friendly model in its picker) rises up the glass from the bottom edge, starts a touch dim and is
    // brighter than the page it replaced by "wonderful". At "Blinded" the film cuts away, and on the wall this phone is the corporations' again
    const turn = t >= WAKE && t < Q.blinded;
    // WHY round 9 (reviewer BLOCKER: the brightness change could not be seen): through "However, recently..." the corporations' app on
    // this phone drops to standby (0.55) and breathes slowly over the ellipsis; on "truly" the woken window rises from 0.75 to 1.05 by
    // "wonderful": a dim grey grid becoming a full-colour sky
    const standby = t >= HOW0 && t < Q.blinded ? 0.45 * ez(t, HOW0, HOW0 + 0.5, EASE_IN_OUT) - 0.07 * bump(t, Q.recently + 0.15, Q.something - Q.recently - 0.1) : 0;
    const sameDim = standby > 0.001 ? <div style={{ position: 'absolute', inset: 0, filter: `brightness(${1 - standby})` }}>{same}</div> : same;
    const bright = 0.75 + 0.3 * ez(t, WAKE, Q.wonderful + 0.1, EASE_IN_OUT);
    const woke = <div style={{ position: 'absolute', inset: 0, filter: `brightness(${bright})` }}><OwnScreen look={WAKE_LOOK} w={d.w} h={d.h} /></div>;
    const node = turn ? flipNode(lin(t, WAKE, WAKE + 0.5), sameDim, woke, '50% 50%', 'wake') : t >= HOW0 && t < WAKE ? sameDim
      : t < fa ? flipNode(g, same, real, atInput, 'circle') : flipNode(f, real, own, atInput, 'rise');
    const glow = t >= fa ? look.glow : turn ? WAKE_LOOK.glow : g > 0.5 ? 'rgba(201,166,224,1)' : SAME_GLOW;
    // a slow pulse on the ellipsis of "recently...", a small lift as it wakes, and the shared dip on "dictated"
    return { node, glow, lift: t < fa ? bump(t, Q.wonderful, 0.8) * 0.5 + bump(t, LAND, 0.5) * 0.6 + dip : lift };
  }
  const own = <OwnScreen look={look} w={d.w} h={d.h} />;
  if (d.id === 'tv') return { node: flipNode(f, <TVScreen same={same} t={t} frame={frame} />, own), glow: f > 0.5 ? look.glow : SAME_GLOW, lift: lift + dip };
  let node: React.ReactNode;
  const ak = ASK[d.id];
  const asker = ASKERS[d.id];
  if (ak) {
    // the person's own message box, the typed request, the app working on it (a real capture), then the page it asked for
    const n = ak.keys.filter((k) => t >= k).length;
    const caretOn = n > 0 ? caretFor(ak.keys, t) : Math.floor((t - ak.open) / 0.53) % 2 === 0;
    const ask = <ShapeAsk kit={ak.kit} shape={ak.shape} w={d.w} h={d.h} n={n} caretOn={caretOn} caretColor={ak.caret} sent={t >= ak.send} />;
    node = flipNode(f, flipNode(lin(t, ak.open, ak.open + 0.35), same, ask, ak.at, 'circle'), own, '50% 50%', 'rise');
  } else if (asker) {
    // a neighbour seen asking: its own window with its own sent request and working line (a real capture), then its page rises in
    const wk = workingIn(look, d.kind);
    const working = wk ? <OwnScreen look={wk} w={d.w} h={d.h} /> : own;
    node = flipNode(f, flipNode(lin(t, asker.ask, asker.ask + 0.4), same, working), own, '50% 50%', 'rise');
  } else node = flipNode(f, same, own);
  // the phone's page arriving on a neighbour: WHY the same page in the neighbour's OWN theme (round 8 reviewer BLOCKER: the shared page
  // replaced the neighbour's whole look): what one person makes, another opens in their own copy. It settles from 1.03 over 6 frames.
  const si = SHARE_TARGETS.indexOf(d.id);
  if (si >= 0 && t >= SHARE_AT[si]) {
    const hl = homeIn(look, d.kind) ?? look;
    const k = lin(t, SHARE_AT[si], SHARE_AT[si] + 0.2);
    node = <><OwnScreen look={look} w={d.w} h={d.h} /><div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, k * 3.3), transform: `scale(${1.03 - 0.03 * EASE_OUT(k)})` }}><OwnScreen look={hl} w={d.w} h={d.h} /></div></>;
  }
  return { node, glow: f > 0.5 ? look.glow : SAME_GLOW, lift: lift + dip + (si >= 0 ? bump(t, SHARE_AT[si], 0.35) * 0.4 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s, rx, rz] = camAt(t, shot);
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + 1.0, EASE_IN_OUT);

  // WHY the wall first fades fully to the end card's own background, and only then does the card build (round 8 reviewer: the logo was
  // ghosted over grey device smudges); the card's own short staggered rise (icon, wordmark, then address and platforms) is its one beat
  if (t >= END_CARD) return (<AbsoluteFill style={{ background: C.night }}><Audio src={staticFile('audio/voice-take1-lily.wav')} /><Day /><EndCard at={END_CARD} /></AbsoluteFill>);

  const scene = shot.scene;
  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens; the opening racks focus
  const rack = shot.rack ? shot.rack[2] * (1 - ez(t, shot.rack[0], shot.rack[1], EASE_IN_OUT)) : 0;
  const blur = (s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0) + rack / s;
  // WHY a wider cull when tilted: perspective shows more of the wall than the flat frame does
  const tilt = Math.abs(rx) + Math.abs(rz);
  const vw = 1920 / s * (1 + tilt * 0.04), vh = 1080 / s * (1 + tilt * 0.05);
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  // WHY the wall hushes again while the request is typed: it echoes the "something wonderful" hush, the same lit
  // phone, now being asked, and keeps the eye on its message box
  const hush = t >= LAND && t < FLIP_HERO + 0.6 ? ez(t, LAND + 0.2, LAND + 0.9) * (1 - ez(t, FLIP_HERO + 0.05, FLIP_HERO + 0.6, EASE_IN_OUT)) : 0;
  // WHY a mood change on "hubris" instead of a flashbulb on "Blinded" (round 8 reviewer: the white flash read as a power surge): every
  // screen dims about 15% on "hubris" and comes back up as the new card is created
  const mood = 0.15 * ez(t, Q.hubris, Q.hubris + 0.5, EASE_IN_OUT) * (1 - ez(t, Q.created1, Q.created1 + 0.7, EASE_IN_OUT));
  // WHY the wall dims 30% while the caret flies (round 8 reviewer): the thin purple caret is then the one bright saturated thing in frame
  const travel = t >= HOP0 - 0.2 && t < LAND + 0.4 ? ez(t, HOP0 - 0.2, HOP0 + 0.1) * (1 - ez(t, LAND - 0.1, LAND + 0.4)) : 0;

  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t, frame);
    // WHY the screens are switched OFF, not veiled (round 7 reviewer: a flat dark layer turned white screens milky lavender, never dark,
    // and their glows stayed on): each screen fades to dark glass and its light goes with it. Half-way already on the cut on "However"
    // (the tag is still leaving), then a ring sweeps in from the frame's edges to the phone's neighbours, ending just after "recently".
    // The quiet lifts across the first second of "Blinded" instead of snapping.
    const quiet = t >= HOW0 && t < Q.blinded + 0.9 ? 1 - ez(t, Q.blinded, Q.blinded + 0.9, EASE_IN_OUT) : 0;
    const ring = Math.min(1, Math.hypot(d.cx - HERO.cx, d.cy - HERO.cy) / 1400);
    const offAt = HOW0 + (1 - ring) * 0.95;
    const off = d.id === 'hero' ? 0 : quiet * (0.45 + 0.47 * ez(t, offAt, offAt + 0.45, EASE_IN_OUT));
    const glass = off > 0 ? <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg,#16101D 0%,#09060D 46%,#0C0812 100%)', opacity: off }} /> : null;
    // the hush while the request is typed (line 6), the mood on "hubris" and the dim while the caret flies are simple veils
    const veil = (hush > 0 && d.id !== 'hero' ? hush * 0.8 : 0) + mood + (d.id !== 'hero' ? 0.45 * travel : 0);
    const overlay = veil > 0.005 ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: Math.min(0.9, veil) }} /> : null;
    // WHY a device mostly outside a close shot throws no light (round 7 reviewer: a neighbour's glow showed as a white sliver along the frame edge)
    let glowK = 1 - off;
    if (s > 1.3) {
      const x0 = (d.cx - d.w / 2 - cx) * s + 960, x1 = (d.cx + d.w / 2 - cx) * s + 960, y0 = (d.cy - d.h / 2 - cy) * s + 540, y1 = (d.cy + d.h / 2 - cy) * s + 540;
      const inside = (Math.max(0, Math.min(1920, x1) - Math.max(0, x0)) * Math.max(0, Math.min(1080, y1) - Math.max(0, y0))) / ((x1 - x0) * (y1 - y0));
      glowK *= cl((inside - 0.3) / 0.4);
    }
    const el = <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift} glowK={glowK}>{sc.node}{glass}{overlay}</Device>;
    if (!shot.dof) return el;
    // WHY per-device depth of field on the wides (round 7 reviewer: "all equally bright and equally sharp, no focal point"): the band of
    // shelves in the frame's middle is sharp; rows above it (further away, the camera looks up) go soft and dim more than rows below
    const dy = d.cy - cy;
    const soft = dy < 0 ? cl((-dy - 120) / 400) : cl((dy - 260) / 560) * 0.6;
    if (soft < 0.02) return el;
    return <div key={d.id} style={{ position: 'absolute', left: 0, top: 0, filter: `blur(${(soft * (dy < 0 ? 8 : 5)) / s}px) brightness(${1 - (dy < 0 ? 0.45 : 0.28) * soft})` }}>{el}</div>;
  };

  // WHY light only on real surfaces next to the waking phone (round 7 reviewer BLOCKER: a big lavender wash fogged the whole frame): a soft
  // warm highlight on the shelf lip under it and a faint rim on the two neighbours' facing edges; the brightness lives in the screen itself
  const woke = t >= WAKE && t < Q.blinded + 0.3 ? ez(t, WAKE + 0.2, Q.wonderful + 0.3, EASE_IN_OUT) * (1 - ez(t, Q.blinded - 0.05, Q.blinded + 0.3)) : 0;
  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));

  // headline readability: a soft wide band behind the lower third while a headline is up (darkening at night,
  // lightening by day), never a box
  // WHY the band is fully up by the first word (round 7 reviewer: the first word blurred in alone on bare wall for a quarter second)
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.35, h.at + 0.02), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const bandC = night > 0.5 ? '10,5,16' : '250,246,252';
  // WHY no blur or grey veil at the end any more (round 8 reviewer BLOCKER: the thesis line landed on grey smudges): the last wall stays
  // sharp and in colour, framed so the headline sits on the empty lit wall under the last shelf; it fades to the card's background at the end
  const endWash = ez(t, END_FADE, END_CARD, EASE_IN_OUT);
  const dayLen = ez(t, Q.freeWord, Q.freeWord + 2.6, EASE_IN_OUT);

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {scene === 'print' && <Receipt t={t} mode="print" />}
      {scene === 'rewind' && <Receipt t={t} mode="rewind" />}
      {scene === 'stack' && <SubStack t={t} />}
      {scene === 'free' && <FreeTag t={t} />}
      {!scene && <>
        {/* the room: plum-black (the reviewer found the old plum lifted and muddy), lit a little from above */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg,#1C1027 0%,#120A1B 55%,#0B0611 100%)' }} />
        {night < 1 && <Daylight t={t} />}
        <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
              <div style={{ opacity: night }}><Shelves night={1} /></div>
              <div style={{ opacity: 1 - night }}><Shelves night={0} dayLen={dayLen} /></div>
              {back.map(renderDev)}
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: rack > 0.05 ? `blur(${rack / s}px)` : undefined }}>
              {woke > 0.01 && <>
                <div style={{ position: 'absolute', left: HERO.cx - HERO.w * 0.9, width: HERO.w * 1.8, top: -14, height: 34, borderRadius: '50%', opacity: woke,
                  background: 'radial-gradient(closest-side, rgba(255,240,222,0.36), rgba(255,240,222,0.1) 60%, transparent)' }} />
                <div style={{ position: 'absolute', left: TT.cx - TT.w / 2 - 12, width: 4, top: TT.cy - TT.h / 2, height: TT.h, opacity: woke * 0.8,
                  background: 'linear-gradient(180deg, transparent, rgba(255,236,214,0.22) 40%, rgba(255,236,214,0.22) 70%, transparent)' }} />
                <div style={{ position: 'absolute', left: L0.cx + L0.w / 2 + 8, width: 4, top: L0.cy - L0.h / 2, height: L0.h, opacity: woke * 0.8,
                  background: 'linear-gradient(180deg, transparent, rgba(255,236,214,0.22) 40%, rgba(255,236,214,0.22) 70%, transparent)' }} />
              </>}
              {front.map(renderDev)}
              <WorldProps t={t} />
            </div>
          </div>
        </AbsoluteFill>
        {/* a vignette holds the eye in the middle of the wide shots */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: (0.35 + 0.65 * night) * (s > 1.3 ? 0.6 : 1) }} />
        {/* WHY the free* tag keeps rising out of the top of the frame over the dimmed wall (round 7 reviewer: no text dissolving over screens) */}
        {t >= HOW0 && t < FREE_EXIT1 && <FreeTag t={t} bare />}
      </>}
      {/* WHY a full-width band, stronger than before (reviewer 2026-11-20): "for anyone who asks." lost contrast over
          bright moving screens; one even band under every headline keeps all four the same and always legible.
          WHY it now runs to the bottom edge (round 8 reviewer: device tops showed under the words): nothing busy sits below the type */}
      {headUp > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(${bandC},0) 64%, rgba(${bandC},0.84) 75%, rgba(${bandC},0.9) 83%, rgba(${bandC},0.9) 100%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} />)}
      {endWash > 0 && <AbsoluteFill style={{ opacity: endWash }}><Day /></AbsoluteFill>}
    </AbsoluteFill>
  );
};

/** Daylight rising from the shelf's foot at "free ourselves". WHY a straight upward sweep with a wide soft edge (round 5 reviewer:
 *  the radial edge read as a glowing ball, a banned look): dawn simply climbs the wall. WHY warm from the upper left (round 8 reviewer:
 *  a flat lavender-white backdrop with no direction): the light has a source, a warm key falling off into the brand's lavender. */
const Daylight: React.FC<{ t: number }> = ({ t }) => {
  const p = ez(t, Q.freeWord, Q.freeWord + 1.0, EASE_IN_OUT);
  const edge = p * 150;   // 0..150%: the soft edge is 45% tall, so it is fully past the top at the end
  const mask = `linear-gradient(0deg, #000 ${Math.max(0, edge - 45)}%, transparent ${edge}%)`;
  return <AbsoluteFill style={{ background: 'linear-gradient(132deg,#FFF1DE 0%,#FCF3F1 30%,#F7EFFA 58%,#ECDDF5 100%)', WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }} />;
};

/** Things that live in the world but are not screens: the price tags, the escaping caret, the shared page in flight. */
const WorldProps: React.FC<{ t: number }> = ({ t }) => {
  // the tablet's price: ticking up in line 2; struck through and made free in line 7
  // WHY two prices, not four (round 7 reviewer BLOCKER: four prices flickered past in 0.7 s): $9.99 lands on "cost" and is read, then one
  // split-flap turn to $14.99 that holds to the cut
  const strike = t >= Q.costs ? ez(t, STRIKE, STRIKE + 0.2, EASE_IN_OUT) : 0;
  const isFree = t >= STRIKE + 0.2;   // WHY not the tablet's page change (round 6): the price turns free on "costs"; the page it asks for comes a little later
  const tagText = t < Q.costs ? (t < PRICE_FLIP ? '$9.99' : '$14.99') : isFree ? 'free' : '$14.99';
  const line7 = t >= Q.costs;
  // WHY the "free" tag swings and drops away just before the page arrives (round 8 reviewer: it faded into grey glass over the page)
  const ttFall = lin(t, TT_FLIP - 0.35, TT_FLIP + 0.2);
  // their card's price on the big screen, ticking up "in their excitement"; gone when the big screen becomes someone's own
  const tick = TICKS.filter((k) => t >= k).length;
  // WHY the shared thing that flies is the PAGE, not a phone (round 8 reviewer BLOCKER: a whole phone flew across the shelf): a card of the
  // phone's own page (its real capture), 60% of the phone's screen, rounded, with a soft shadow, on a ballistic arc (it rises easing out
  // and falls easing in), landing on "long," and "long last"
  const flights = SHARE_AT.map((land, i) => {
    const a = land - FLY;
    if (t < a || t > land + 0.1) return null;
    const dst = SHARE_TARGETS[i] === 'tagTablet' ? TT : L0;
    const p = lin(t, a, land);
    const x = lerp(HERO.cx, dst.cx, EASE_IN_OUT(p)), y = lerp(HERO.cy, dst.cy, p) - 4 * 170 * p * (1 - p);
    const w0 = HERO.w * 0.72, h0 = HERO.h * 0.72;
    const sc = (0.92 + 0.08 * ez(p, 0, 0.2)) * lerp(1, 0.86, EASE_IN(p));
    return <div key={i} style={{ position: 'absolute', left: x - w0 / 2, top: y - h0 / 2, width: w0, height: h0, transform: `scale(${sc})`, borderRadius: 9, overflow: 'hidden',
      opacity: 1 - lin(t, land - 0.02, land + 0.1), boxShadow: '0 18px 34px rgba(8,3,14,0.42), 0 0 0 2px rgba(255,255,255,0.9)' }}>   {/* WHY a white rim: it reads as a page lifted off, not a device */}
      <RealApp src={lookFor(HERO).still} w={w0} h={h0} />
    </div>;
  });
  return (
    <>
      {flights}
      {(t < Q.data || (line7 && t < TT_FLIP + 0.25)) && <PriceTag slap x={line7 ? TAG_PT7.x : TAG_PT.x} y={line7 ? TAG_PT7.y : TAG_PT.y} scale={line7 ? 0.68 : TAG_S} sub={isFree ? undefined : 'per month'} t={t} drop={line7 ? Q.costs : Q.costWord} text={tagText} flipFrom={t < Q.costs ? '$9.99' : undefined} flipAt={PRICE_FLIP} strike={isFree ? 0 : strike} fall={line7 ? ttFall : 0} />}
      {t >= TAG && t < flipAt(TV) && <PriceTag x={TV_TAG.x} y={TV_TAG.y} t={t} drop={TAG} text={PRICES[tick]} scale={TV_TAG.s} kicks={TICKS} />}
      {/* the holdout's price, hanging on through "free ourselves" and knocked off on "past" */}
      {t >= Q.andSo && t < Q.past + 0.7 && <PriceTag slap x={HO.cx + HO.w / 2 - 14} y={top(HO) + 16} scale={0.8} t={t} drop={Q.andSo - 2} text="$49/mo" sub="per month" fall={lin(t, Q.past, Q.past + 0.55)} />}
      {/* (6) the caret, out on its own: a thin solid text cursor in the proportions of a real one, no outline, no trail */}
      {t >= HOP0 && t < LAND && (() => {
        const c = caretAt(t);
        const h = Math.max(5, c.h), w = Math.max(1.8, h / 9);
        return <div style={{ position: 'absolute', left: c.x - w / 2, top: c.y - h / 2, width: w, height: h, borderRadius: w / 2, background: '#A35BC0',
          boxShadow: `0 ${h * 0.08}px ${h * 0.3}px rgba(10,4,18,0.55)` }} />;
      })()}
    </>
  );
};
