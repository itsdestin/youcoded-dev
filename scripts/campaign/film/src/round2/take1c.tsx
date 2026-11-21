// Round two, take 1 variant C: "a book that tells itself".
// The narrator's fairytale is a real picture book lying open under a lamp. Its pages turn with her chapters,
// its ink draws itself as she speaks, and it starts almost colourless (plum ink on cream) until one drop of
// purple lands on a blank page. From there the corporations' own invention escapes as a quill that anyone can
// pick up, and every person's corner of the book is redrawn differently; the last pages riffle past, each one
// someone's own, and the book closes onto the end card.
// WHY a book: the script is told as a storybook, so the film shows one, and the product idea maps onto it
// without drawing the app: one book that each reader redraws for themselves, and passes on.
import React from 'react';
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { Day, EndCard } from '../kit';
import { Boards, BOARD, BasePage, cameraAt, coverArt, Edges, Face, Lamp, Leaf, LeafShadow, PH, PW, Shot, Spread, World } from './take1c-book';
import { lin, useT } from './take1c-ink';
import { BARGAIN, DROP_LAND, HANDFUL, HOWEVER, NOTHING, RULES } from './take1c-spreads-a';
import { ANYONE, BlindedPop, EVERYTHING, FREE, OURS, PAGE_CLEAR, TREASURE, VARIANTS } from './take1c-spreads-b';
import { Headline } from './take1c-page';
import { CLOSE_DUR, COVER_DUR, CUT, CUT_TURNS, DIP_OUT, END_CARD, land, Q, TURN, TURN_DUR } from './take1c-time';

// ---------- the order of the book ----------
// WHY the wonderful page carries an overlay: "Blinded by their own" plays on it, in the corner the headline never covers
// (BlindedPop in take1c-spreads-b.tsx), so the next chapter can start on "hubris" with the screen clear of type
const HOWEVER_THEN: Spread = { ...HOWEVER, Pop: BlindedPop };
const SPREADS: Spread[] = [HANDFUL, RULES, BARGAIN, NOTHING, HOWEVER_THEN, TREASURE, ANYONE, OURS, FREE, ...VARIANTS, EVERYTHING];
const STARTS = [TURN.cover, TURN.rules, TURN.bargain, TURN.nothing, TURN.however, TURN.treasure, TURN.anyone, TURN.ours, TURN.free, ...TURN.riffle, TURN.everything];
// WHY found by name, not a typed index: adding a spread before the riffle must not silently shift which turns are fast
const RIFFLE_FROM = SPREADS.indexOf(VARIANTS[0]);
// WHY shorter each time (review: four equal turns read as a template): the pages speed up into "at long, long last"
const RIFFLE_DUR = [0.8, 0.7, 0.55, 0.45];
// a cut turn takes no time at all: the next spread is simply there on the next frame
const DURS = STARTS.map((s, k) => (k === 0 ? COVER_DUR : CUT_TURNS.has(s) ? 0 : k >= RIFFLE_FROM ? RIFFLE_DUR[k - RIFFLE_FROM] ?? 0.78 : TURN_DUR));
if (STARTS.length !== SPREADS.length) throw new Error('take1c: every spread needs exactly one turn into it (see TURN in take1c-time.ts)');

// ---------- the cover (seen only as the book shuts) ----------
const FOIL = 'linear-gradient(160deg, #E3C6EC 0%, #B98BC9 38%, #8E5DA2 62%, #D7B3E2 100%)';
const QuillEmblem: React.FC = () => {
  // WHY about 2.3 times the old size and a slow sheen (review: a small flat quill read as a placeholder): the cover
  // carries one clear emblem, and a band of light slides across the foil as the camera pushes in on it
  const t = useT();
  const sheen = lin(t, TURN.close, END_CARD, EASE_IN_OUT) * 100;
  return (
    <div style={{ transform: 'translateY(-20px) rotate(-8deg) scale(2.3)' }}>
      <div style={{ width: 150, height: 190, background: FOIL, backgroundSize: '320% 320%', backgroundPosition: `${100 - sheen}% ${sheen}%`,
        clipPath: 'path("M 30 186 L 36 166 L 42 168 Z M 40 164 C 50 116 84 54 128 14 C 124 52 100 112 46 168 Z")', filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.35))' }} />
    </div>
  );
};
const COVER_END = coverArt(QuillEmblem);

// ---------- the camera ----------
// WHY three shot sizes and hard cuts: one slow drift over one book for 75 s read as a template. The film now
// uses a wide of the whole book (chapter openings and headlines), a full page (the book's edges leave the
// frame) and an extreme close-up on one drawn detail, and it CUTS between them on the stressed word
// (decided, cost, data, accepted, hubris, treasure, decide…). Page turns are kept for new chapters only.
const H = { x: 760, y: 500, z: 1, tilt: 16 };
const L = (k: number) => STARTS[k] + DURS[k];
const cut = (t: number, x: number, y: number, z: number, tilt = 16): Shot => ({ t, x, y, z, tilt, cut: true });
const at = (t: number, x: number, y: number, z: number, tilt = 16): Shot => ({ t, x, y, z, tilt });
const SHOTS: Shot[] = [
  // i: WHY (round 5) every change of shot is a hard cut on a word, never a long pull-back (review: the blurred pull
  // made the new men smear in like a glitch). Close on the first man and his calendar; the wide on "corporations";
  // in on the masters working their bars on "dictated"; in on the people jerked by their phones on "interact"; the
  // wide again on "technology", where the two on the right share a smirk.
  // i (round 6): WHY four set-ups instead of five cuts (review: ten near-identical shots in 11 s read as a slideshow).
  // The film opens on the open book and pushes in to the calendar and the first man over "For more than a decade";
  // cuts to the box as his partners ink themselves in on "handful"; cuts wide on "corporations" (masters above, the
  // audience below); cuts in on their crosses on "dictated" and then tilts down the strings to the people they jerk on
  // "interact", so the yank and the jerk share the frame; and closes on the two sharing a smirk on "technology", pulling
  // back as the page turns.
  at(0, 600, 520, 1.2, 15), at(Q.decade + 0.3, 250, 372, 2.25, 13), at(Q.handful - 0.07, 254, 376, 2.3, 13),
  cut(Q.handful - 0.06, 430, 420, 1.62, 14), at(Q.corporations1 - 0.04, 434, 422, 1.68, 14),
  cut(Q.corporations1 - 0.03, 760, 520, 1.0), at(Q.dictated - 0.04, 760, 516, 1.02),
  // WHY y 490 and a 0.9 s tilt (first look: the title was sliced at the top, and a 0.55 s move smeared the frame)
  cut(Q.dictated - 0.03, 460, 490, 1.9, 13), at(Q.dictated + 0.28, 466, 492, 1.93, 13),
  at(Q.interact + 0.28, 850, 614, 1.55, 14), at(Q.technology1 - 0.14, 854, 616, 1.57, 14),
  cut(Q.technology1 - 0.13, 600, 410, 2.7, 13), at(TURN.rules, 606, 414, 2.75, 13),
  // ii (round 6): one shopkeeper and one counter. Close and level for the chain and the padlock; a low, steep angle on
  // the price tag as it grows over her; then high and wider for her things arcing into his hat.
  { t: L(1), ...H },
  cut(Q.computersDo - 0.04, 850, 632, 2.7, 14), at(Q.cost - 0.13, 856, 630, 2.78, 14),
  cut(Q.cost - 0.12, 760, 690, 2.45, 26), at(Q.data - 0.07, 764, 686, 2.55, 26),
  cut(Q.data - 0.05, 800, 630, 2.05, 8), at(TURN.bargain - 0.02, 806, 626, 2.1, 8),
  // iii: the wide as the page turns (a cut, so the falling leaf is not smeared), then straight in to a medium on the
  // middle of the queue as it lands, so the faces turning to camera read; the man at his lectern on "accepted"
  cut(TURN.bargain - 0.01, 760, 520, 1.02), at(land(TURN.bargain) - 0.02, 760, 522, 1.04),
  cut(land(TURN.bargain) - 0.01, 720, 700, 1.6, 15), at(Q.accepted - 0.14, 730, 702, 1.64, 15),
  cut(Q.accepted - 0.12, 1110, 690, 2.25), at(TURN.nothing - 0.01, 1116, 686, 2.3),
  // the room fills the frame; in on the tags for "subscribe"; back out for "own nothing" with the right page clear
  // for the headline (the man rises into her window here); then a two-shot of the window and her for "the cost of
  // convenience", held so her reaction plays (review: the push cropped his face and never reached hers)
  cut(TURN.nothing, 420, 520, 1.45), at(Q.subscribe - 0.07, 425, 515, 1.5),
  cut(Q.subscribe - 0.05, 380, 560, 1.75, 15), at(Q.own - 0.08, 384, 556, 1.8, 15),
  cut(Q.own - 0.06, 590, 540, 1.3), at(Q.costOf - 0.37, 585, 545, 1.34),
  cut(Q.costOf - 0.35, 370, 522, 1.85), at(TURN.however - 0.02, 376, 528, 1.93),
  // iv: the wide as the page turns; it holds while the drop falls the height of the frame into the well, pushes in
  // on the quill as it drinks, and follows the nib across the gutter as it draws the door on "happened"
  cut(TURN.however, 760, 505, 1.05), at(TURN.however + TURN_DUR + 0.2, 620, 480, 1.15), at(DROP_LAND, 480, 590, 1.45),
  // WHY these heights: the chapter title is either wholly in frame or wholly out of it, never sliced by the top edge
  at(Q.wonderful - 0.1, 480, 560, 1.7), at(Q.happened - 0.05, 560, 545, 1.7), at(Q.happened + 0.62, 740, 458, 1.95), at(CUT.hubris - 0.01, 750, 456, 1.98),
  // v (round-two polish): WHY a different drawing for each beat, not re-crops of one side-on row (review BLOCKER). Close
  // and low on the three as their hats shoot up out of the frame on "hubris"; wide for the unveiling; an extreme close on
  // the quill waking; behind their backs for the huddle and the cage dropping through the gap; over a soft foreground
  // shoulder onto the caged treasure; a mid shot (waist up) for coin eyes, puffed chests and the leap; the wide once, for
  // the escape's geography, then close on the cage top for the squeeze, the grab and the whoosh past the lens.
  cut(CUT.hubris, 420, 470, 2.7, 12), at(CUT.these - 0.01, 425, 458, 2.8, 12),
  cut(CUT.these, 690, 500, 1.62, 14), at(Q.technology2 + 0.6, 705, 495, 1.7, 14), at(CUT.artificial - 0.01, 710, 492, 1.72, 14),
  cut(CUT.artificial, 980, 440, 3.0, 12), at(CUT.believe - 0.01, 975, 430, 3.15, 12),
  cut(CUT.believe, 900, 470, 2.25, 12), at(CUT.cage - 0.01, 905, 462, 2.4, 12),
  cut(CUT.cage, 880, 450, 2.65, 12), at(CUT.value - 0.01, 875, 445, 2.75, 12),
  cut(CUT.value, 420, 400, 3.3, 11), at(CUT.escape - 0.01, 422, 392, 3.4, 11),
  cut(CUT.escape, 700, 455, 1.52, 14), at(CUT.beyond - 0.01, 706, 452, 1.55, 14),
  cut(CUT.beyond, 905, 330, 2.6, 12), at(CUT.tool - 0.01, 900, 336, 2.7, 12),
  // vi: the wish and the card (right page, high); their cracking stack, whole figures and all (round 2: hats and heads
  // were cut off while they windmilled); then the one card, close, and the pull-out on "asks", pushing in slowly
  cut(CUT.tool, 1080, 382, 2.35, 13), at(CUT.scarce - 0.01, 1084, 376, 2.45, 13),
  cut(CUT.scarce, 690, 470, 1.6, 13), at(TURN.anyone - 0.01, 686, 466, 1.66, 13),
  cut(TURN.anyone, 1095, 442, 2.55, 13), at(CUT.anyWide - 0.01, 1097, 440, 2.62, 13),
  cut(CUT.anyWide, 760, 500, 1.45, 14), at(TURN.ours - 0.01, 760, 496, 1.6, 14),
  // vii: WHY no flash wide on "decide" (review SHOULD: a 0.6 s wide of half-inked scenes read as a broken render): the film
  // cuts straight into her close shot once the "anyone" headline has gone, and stays with her, the quill and the lock
  // WHY 3x (review NIT: the vignette sat small in big empty margins): her, the lock and him fill the frame
  cut(TURN.ours, 380, 392, 3.0, 12), at(Q.veryLong + 0.9, 392, 398, 2.95, 13), at(Q.decide + 0.5, 396, 402, 2.95, 13), at(Q.canDo + 0.2, 392, 400, 3.05, 14),
  cut(Q.itCosts + 0.08, 385, 762, 2.8, 14), at(Q.ourData + 0.28, 390, 765, 2.95, 14),
  // WHY lower, tighter and further right (round 2 review: an empty lilac top half and slices of the other two scenes)
  cut(Q.ourData + 0.3, 1110, 740, 2.7), at(TURN.free + 0.14, 1106, 738, 2.75),
  // viii: wide on the strings as the page falls, a push as they snap, close on the kings as they grab their hats on "tech",
  // and a hard cut back to the wide on "past" as they fade and the next leaf lifts
  // WHY a cut, not a pull (round 2 review BLOCKER: a 0.35 s pull from 2.4x to 1.1x smeared the frame like a glitch)
  cut(TURN.free + 0.15, 760, 505, 1.2), at(L(8), 760, 500, 1.38), at(Q.free + 0.1, 760, 505, 1.42), at(Q.tech - 0.06, 760, 510, 1.46),
  // WHY y 262 (round 2 review: a band of dark desk showed along the top of this close)
  cut(Q.tech - 0.05, 850, 262, 2.45, 13), at(Q.past - 0.04, 845, 266, 2.5, 13),
  cut(Q.past - 0.03, 780, 500, 1.12, 13),
  // ix: the riffle (the card sits at one spot on every page), pushing in a little as the pages speed up, then in on the
  // right page from "source" so his card and his ask fill the frame, then onto bare paper as the drawings ink away
  at(TURN.riffle[1], 780, 496, 1.2, 13), at(TURN.riffle[3], 785, 492, 1.27, 13),
  at(L(SPREADS.length - 1), 790, 490, 1.3, 13),
  at(Q.source, 870, 420, 1.7, 14), at(Q.everything2 + 0.3, 875, 418, 1.74, 14),
  // WHY the push waits for bare paper, then goes into the right page until no gutter shows: the page itself then warms
  // into the end card's light field (a fast move on blank paper has nothing to smear)
  at(PAGE_CLEAR + 0.12, 875, 418, 1.75, 14), at(PAGE_CLEAR + 0.6, 1140, 470, 2.9, 14), at(END_CARD, 1140, 468, 2.95, 14), at(75, 1140, 468, 2.95, 14),
];
// WHY checked: an out-of-order key would make the camera snap, and the keys are computed from word times.
SHOTS.forEach((s, i) => { if (i && s.t <= SHOTS[i - 1].t) throw new Error(`take1c camera key ${i} (t=${s.t.toFixed(2)}) is not after key ${i - 1} (t=${SHOTS[i - 1].t.toFixed(2)})`); });
const cutBetween = (t0: number, t1: number) => SHOTS.some((s) => s.cut && s.t > t0 && s.t <= t1) || STARTS.some((s, k) => DURS[k] === 0 && s > t0 && s <= t1);

// ---------- the book at time t ----------
const page = (k: number, side: 'L' | 'R'): Face => ({ kind: 'page', spread: SPREADS[k], side });
const progress = (t: number, k: number) => interpolate(t, [STARTS[k], STARTS[k] + DURS[k]], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });

const Book: React.FC<{ t: number }> = ({ t }) => {
  const last = SPREADS.length - 1;
  // WHY disabled: the book no longer shuts (see END_CARD in take1c-time.ts); the lit payoff page cross-fades to the card
  if (false as boolean) {
    // the whole left half (board and pages) swings over onto the right: a rigid board does not bend
    const p = 1 - interpolate(t, [TURN.close, TURN.close + CLOSE_DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
    return (
      <>
        {/* WHY a patch of felt over the left half (review BLOCKER: a black slab sat beside the closed cover): the book's
            shadow on the desk is drawn for the whole open book, so once the left half has swung away its shadow was
            left behind as a dark void. This fills it with the desk's own plum, solid at the spine and feathered
            outward, and it comes in as the half leaves. */}
        <div style={{ position: 'absolute', left: -560, top: -360, width: PW + 560, height: PH + 720, transform: 'translateZ(-12.9px)', pointerEvents: 'none',
          background: 'radial-gradient(ellipse 100% 64% at 100% 50%, rgb(70,41,81) 0%, rgb(68,40,79) 50%, rgba(66,38,77,0) 100%)', opacity: 1 - p }} />
        <Boards left={false} right /><Edges left={false} right />
        <BasePage face={page(last, 'R')} side="R" />
        <LeafShadow p={p} side="R" />
        <Leaf front={{ kind: 'cover', Art: COVER_END }} back={{ kind: 'board', spread: SPREADS[last] }} p={p} n={1} bend={0} w={PW + BOARD} h={PH + BOARD * 2} dy={-BOARD} lift={2} />
      </>
    );
  }
  let started = -1, landed = -1;
  STARTS.forEach((s, k) => { if (t >= s) started = k; if (t >= s + DURS[k]) landed = k; });
  const leaves: React.ReactNode[] = [];
  for (let k = Math.max(0, landed + 1); k <= Math.max(0, started); k++) {
    const p = progress(t, k);
    if (k === 0) {
      leaves.push(<Leaf key={k} front={{ kind: 'cover', Art: COVER_END }} back={{ kind: 'board', spread: SPREADS[0] }} p={p} n={1} bend={0} w={PW + BOARD} h={PH + BOARD * 2} dy={-BOARD} lift={2} />);
    } else {
      const riffle = k >= RIFFLE_FROM;
      leaves.push(<Leaf key={k} front={page(k - 1, 'R')} back={page(k, 'L')} p={p} n={riffle ? 6 : 10} bend={riffle ? 70 : 58} lift={0.8 + (k - landed) * 0.4} />);
    }
  }
  const turning = leaves.length > 0 && !(landed === started);
  const pArr = Array.from({ length: Math.max(0, started - landed) }, (_, i) => progress(t, landed + 1 + i));
  const Pop = landed >= 0 && landed === started ? SPREADS[landed].Pop : undefined;
  return (
    <>
      <Boards left={landed >= 0} right />
      <Edges left={landed >= 0} right />
      {/* WHY a plain page on the left from the start: the film opens on the open book, never on its board */}
      {landed >= 0 && <BasePage face={page(landed, 'L')} side="L" />}
      <BasePage face={page(Math.max(0, started), 'R')} side="R" />
      {turning && pArr.map((p, i) => <React.Fragment key={i}><LeafShadow p={p} side="R" /><LeafShadow p={p} side="L" /></React.Fragment>)}
      {Pop && <Pop />}
      {leaves}
    </>
  );
};

// ---------- the four headlines ----------
// WHY all in one list on the screen layer: they share one position and one style, and each is held at least
// 1.2 s + 0.25 s per word (the brand's muted-video rule) after its last word has inked in.
const minUp = (text: string) => 1.2 + 0.25 * text.split(/[\s/]+/).filter(Boolean).length;
const HEADLINES = [
  // WHY each 'out' is the next cut: a headline never straddles a hard cut
  { text: 'own *nothing.', at: Q.own, out: Q.costOf - 0.4, words: [Q.own, Q.nothing] },
  // WHY each word on its own spoken start, and out on the hard cut at "hubris" (review 2026-11-20): it used to
  // show "wonderful happened." a second before she said it, and leave while she was still saying it
  { text: 'something *wonderful / happened.', at: Q.something, // WHY out on "hubris", not at the cut on "Blinded": it must stay up 1.95 s after "happened" (brand hold), and the men now begin plain
  // WHY a fade, not a pop (review BLOCKER: it vanished in one frame mid-shot): it must stay up 1.95 s after "happened",
  // which outlasts the cut on "Blinded", so it fades out over the men's blinded hats and is gone as "hubris" lands
  // WHY gone by the cut on "hubris" (round 2): the chapter now starts on that frame, so the plate must not straddle it
  out: CUT.hubris - 0.01, words: [Q.something, Q.wonderful, Q.happened] },
  // WHY words on their spoken starts and held 2.3 s after "asks" (review BLOCKER: the words spelled out 0.6-0.8 s early and left 1.1 s after)
  // WHY out just before the cut into chapter vii (review SHOULD: it outlived its picture by 1.1 s): TURN.ours now waits for it
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: Q.asks + 2.22, words: [Q.forAnyone, Q.anyone, Q.who, Q.asks] },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, until the dip to dark takes them.
  // WHY it fades 0.35 s before the card fades up (review: it sat printed on the cover through the whole hand-off):
  // it still holds the brand minimum of 1.2 s + 0.25 s per word after "everything.", then the cover is clean
  // WHY out at the brand minimum (round 2): the page's drawings then ink away and the bare page becomes the end card
  { text: 'open source / *everything.', at: Q.open, out: Q.everything2 + 1.2 + 0.25 * 3 + 0.01, words: [Q.open, Q.source, Q.everything2] },
];
// WHY measured from the LAST word's appearance: that is when the whole line is first readable
HEADLINES.forEach((h) => {
  const last = 'words' in h && h.words ? h.words[h.words.length - 1] : h.at;
  if (h.out - last < minUp(h.text)) throw new Error(`take1c headline "${h.text}" is up ${(h.out - last).toFixed(2)} s after its last word, under the brand minimum`);
});

/** Motion blur for the whip-pan: a directional blur sized by how far the picture moves this frame.
 *  WHY measured from the camera, not hand-set: it then appears on any fast move and never on a hard cut. */
const useWhip = (t: number) => {
  const dt = 1 / FPS;
  if (cutBetween(t - dt, t)) return { bx: 0, by: 0 };
  const a = cameraAt(SHOTS, t - dt), b = cameraAt(SHOTS, t);
  const k = 0.87 * (a.z + b.z) / 2;
  const vx = Math.abs(b.x - a.x) * k, vy = Math.abs(b.y - a.y) * k;
  const bx = vx > 24 ? Math.min(40, (vx - 24) * 0.26) : 0, by = vy > 24 ? Math.min(40, (vy - 24) * 0.26) : 0;
  return { bx, by };
};

export const Take1C: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = cameraAt(SHOTS, t);
  const whip = useWhip(t);
  // the edges of the frame darken for the whisper ("however, recently…") and lift again on "wonderful"
  const dim = Math.min(lin(t, Q.however, Q.recently + 0.3), 1 - lin(t, Q.wonderful - 0.1, Q.wonderful + 0.7));
  const warm = lin(t, Q.wonderful - 0.1, Q.wonderful + 1.2) + lin(t, Q.toOpen, Q.everything2 + 0.5) * 0.6;
  // WHY a short straight cross-fade, no dip (review: "a dark flash before the end card"): the old fade down to
  // dark and back up read as a flicker. The card now sits under the book from the start of the fade, and the
  // book layer (headline included) fades out over the last DIP_OUT seconds, so brightness only rises, once.
  // WHY the book fades to lavender first and the logo arrives on a clean field (review SHOULD: a straight cross-fade put
  // the logo over a ghost of the cards for ~5 frames, the first frame the brand appears)
  // WHY 0.4 s from bare paper (round 2 review: the book faded through a milky ghost of the cards): by now the last
  // page's drawings have inked away (PAGE_CLEAR) and the camera is on blank paper, so the cream simply warms into the
  // card's light field: the page becomes the end card
  const bookOpacity = 1 - lin(t, END_CARD - DIP_OUT, END_CARD - DIP_OUT + 0.4, EASE_IN_OUT);
  const showBook = t < END_CARD;
  const showCard = t >= END_CARD - DIP_OUT;
  const settle = 0.97 + 0.03 * lin(t, END_CARD - DIP_OUT, END_CARD + 0.8, EASE_OUT);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {showCard && <><Day /><AbsoluteFill style={{ transform: `scale(${settle})` }}><EndCard at={END_CARD - DIP_OUT + 0.34} /></AbsoluteFill></>}
      {showBook && (
        <AbsoluteFill style={{ opacity: bookOpacity }}>
          {(whip.bx > 0 || whip.by > 0) && (
            <svg width={0} height={0} style={{ position: 'absolute' }}>
              <filter id={`c-whip-${frame}`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={`${whip.bx.toFixed(1)} ${whip.by.toFixed(1)}`} /></filter>
            </svg>
          )}
          <AbsoluteFill style={{ filter: whip.bx > 0 || whip.by > 0 ? `url(#c-whip-${frame})` : undefined }}>
            <World cam={cam}><Book t={t} /></World>
            <Lamp dim={dim} warm={warm} />
          </AbsoluteFill>
          {HEADLINES.map((h) => <Headline key={h.text} {...h} />)}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
