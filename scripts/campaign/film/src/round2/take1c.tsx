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
import { ANYONE, EVERYTHING, FREE, OURS, TREASURE, VARIANTS } from './take1c-spreads-b';
import { Headline } from './take1c-page';
import { CLOSE_DUR, COVER_DUR, CUT, CUT_TURNS, DIP_OUT, END_CARD, Q, TURN, TURN_DUR } from './take1c-time';

// ---------- the order of the book ----------
const SPREADS: Spread[] = [HANDFUL, RULES, BARGAIN, NOTHING, HOWEVER, TREASURE, ANYONE, OURS, FREE, ...VARIANTS, EVERYTHING];
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
  at(0, 400, 425, 1.9, 13), at(Q.corporations1 - 0.04, 404, 430, 1.82, 13),
  cut(Q.corporations1 - 0.03, 760, 520, 1.0), at(Q.dictated - 0.04, 760, 516, 1.02),
  // WHY x 1130 and 1.9: the left page's title stays wholly out of this frame (at 1110 its last letters were sliced)
  cut(Q.dictated - 0.03, 1150, 390, 1.9, 13), at(Q.interact - 0.04, 1154, 386, 1.96, 13),
  cut(Q.interact - 0.03, 1110, 800, 2.5, 14), at(Q.technology1 - 0.14, 1114, 796, 2.6, 14),
  cut(Q.technology1 - 0.13, 760, 520, 1.03), at(TURN.rules - 0.05, 760, 515, 1.0),
  // ii: one picture per thing they decided, each a hard cut on its word
  { t: L(1), ...H },
  // WHY y 272: the whole chapter opener sits inside the top of this frame (at 300 its label was sliced by the edge)
  cut(Q.computersDo - 0.04, 395, 272, 2.45, 14), at(Q.cost - 0.07, 398, 270, 2.5, 14),
  // the price board: laptop, her, the tag and the man with the stamp in one frame
  cut(Q.cost - 0.05, 385, 790, 2.5, 14), at(Q.data - 0.07, 387, 786, 2.6, 14),
  // WHY close on her, the arc and the hat only (review: slices of the neighbouring scenes cluttered the frame)
  cut(Q.data - 0.05, 1165, 645, 2.35), at(TURN.bargain - 0.02, 1170, 642, 2.45),
  // iii: the wide as the page turns (a cut, so the falling leaf is not smeared), in on the front of the queue and the
  // whole man at his lectern on "accepted" (review BLOCKER: his head was cut off by the frame)
  cut(TURN.bargain - 0.01, 760, 520, 1.02), at(Q.accepted - 0.14, 770, 540, 1.08),
  cut(Q.accepted - 0.12, 1080, 660, 2.4), at(TURN.nothing - 0.01, 1086, 656, 2.48),
  // the room fills the frame; in on the tags for "subscribe"; back out for "own nothing" with the right page clear
  // for the headline; in on her and "free" for "the cost of convenience", pushing to her face as her smile goes
  cut(TURN.nothing, 420, 520, 1.45), at(Q.subscribe - 0.07, 425, 515, 1.5),
  cut(Q.subscribe - 0.05, 380, 560, 1.75, 15), at(Q.own - 0.08, 384, 556, 1.8, 15),
  cut(Q.own - 0.06, 590, 540, 1.3), at(Q.costOf - 0.37, 585, 545, 1.34),
  cut(Q.costOf - 0.35, 430, 650, 2.3), at(Q.convenience, 400, 700, 2.6), at(TURN.however - 0.02, 375, 765, 3.3),
  // iv: the wide as the page turns; it holds the chapter title while the drop falls the height of the frame, then
  // pushes in on the pen (taking the title out of frame) and eases back a little on "wonderful" so the pen can rise
  cut(TURN.however, 760, 505, 1.05), at(TURN.however + TURN_DUR + 0.2, 640, 470, 1.15), at(DROP_LAND, 520, 450, 1.32),
  at(Q.wonderful - 0.1, 440, 560, 1.75), at(Q.wonderful + 0.6, 470, 590, 1.5), at(CUT.hubris - 0.01, 480, 590, 1.48),
  // v (round five): WHY every cut now changes the shot size by 1.6x or more, or the subject (review BLOCKER: ten near-identical
  // reframings of one side-on picture read as jump cuts). Close on the faces for "Blinded… hubris", wide across both pages
  // for the unveiling, an extreme close on the quill waking, a medium on their scheming, close over the tall one's shoulder
  // on the caged treasure, close on their puffed chests, then wide for the escape.
  // WHY the men sit left of the held headline until it has faded, then the camera drifts in on them as the hats shoot up
  cut(CUT.hubris, 668, 400, 2.3, 12), at(Q.hubris - 0.05, 662, 398, 2.32, 12), at(CUT.these - 0.01, 585, 388, 2.55, 12),
  cut(CUT.these, 690, 500, 1.62, 14), at(Q.technology2 + 0.6, 705, 495, 1.7, 14), at(CUT.artificial - 0.01, 710, 492, 1.72, 14),
  cut(CUT.artificial, 980, 440, 3.0, 12), at(CUT.believe - 0.01, 975, 430, 3.15, 12),
  cut(CUT.believe, 660, 430, 1.72, 13), at(CUT.cage - 0.01, 690, 430, 1.82, 13),
  cut(CUT.cage, 860, 450, 2.65, 12), at(CUT.value - 0.01, 855, 445, 2.75, 12),
  cut(CUT.value, 430, 420, 2.45, 11), at(CUT.escape - 0.01, 432, 412, 2.5, 11),
  cut(CUT.escape, 700, 455, 1.52, 14), at(CUT.tool - 0.01, 712, 448, 1.56, 14),
  // vi: the wish and the card (right page, high); their cracking stack; then the one card, close, and the pull-out on "asks"
  cut(CUT.tool, 1080, 382, 2.35, 13), at(CUT.scarce - 0.01, 1084, 376, 2.45, 13),
  cut(CUT.scarce, 500, 600, 2.15, 13), at(TURN.anyone - 0.01, 498, 592, 2.3, 13),
  cut(TURN.anyone, 1095, 442, 2.55, 13), at(CUT.anyWide - 0.01, 1097, 440, 2.62, 13),
  cut(CUT.anyWide, 760, 480, 1.45, 14), at(TURN.ours - 0.01, 760, 476, 1.52, 14),
  // vii: WHY no flash wide on "decide" (review SHOULD: a 0.6 s wide of half-inked scenes read as a broken render): the film
  // cuts straight into her close shot once the "anyone" headline has gone, and stays with the key and the lock through "decide"
  // WHY 3x (review NIT: the vignette sat small in big empty margins): her, the key, the lock and him fill the frame
  cut(TURN.ours, 380, 392, 3.0, 12), at(Q.veryLong + 0.9, 392, 398, 2.95, 13), at(Q.decide + 0.5, 396, 402, 2.95, 13), at(Q.canDo + 0.2, 392, 400, 3.05, 14),
  cut(Q.itCosts + 0.08, 385, 762, 2.8, 14), at(Q.ourData + 0.28, 390, 765, 2.95, 14),
  cut(Q.ourData + 0.3, 1010, 640, 2.0), at(TURN.free + 0.14, 1005, 640, 2.05),
  // viii: wide on the strings as the page falls, a push as they snap, close on the kings for their toppling hats, and a
  // pull back to the wide as they fade into the past and the next leaf lifts
  cut(TURN.free + 0.15, 760, 505, 1.2), at(L(8), 760, 500, 1.38), at(Q.free + 0.1, 760, 505, 1.42), at(Q.monopolies2 - 0.07, 760, 510, 1.46),
  // WHY tight on the kings alone: wider, the people's raised quills poked up into the bottom of the frame
  cut(Q.monopolies2 - 0.05, 850, 228, 2.3, 13), at(Q.past - 0.1, 845, 234, 2.36, 13), at(TURN.riffle[0] + 0.15, 790, 500, 1.1, 13),
  // ix: the riffle (the card sits at one spot on every page), then a slow push in on the hand-over
  at(TURN.riffle[1], 800, 500, 1.02, 13), at(TURN.riffle[3], 800, 500, 1.04, 13),
  at(L(SPREADS.length - 1), 800, 500, 1.04, 13),
  // WHY the composition, not the camera, keeps the headline clear (review BLOCKER: it sat on his legs): the bottom right
  // of the payoff page is empty paper at every zoom of this push
  at(Q.source, 800, 500, 1.3, 14), at(Q.everything2 + 0.3, 800, 500, 1.42, 14),
  // WHY the camera drifts onto the cover as the book shuts (review): the closed book fills the frame and the empty
  // half of the desk is mostly out of shot; the sheen on the cover and the cross-fade carry it into the card
  at(TURN.close + 0.6, 800, 498, 1.46, 14), at(END_CARD, 800, 496, 1.48, 14),
  // the book shuts; the camera settles on its cover
  // WHY the camera stays home while it shuts: the closed book then lies exactly under the headline
  at(75, 800, 496, 1.48, 14),
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
  out: Q.hubris, words: [Q.something, Q.wonderful, Q.happened] },
  // WHY words on their spoken starts and held 2.3 s after "asks" (review BLOCKER: the words spelled out 0.6-0.8 s early and left 1.1 s after)
  // WHY out just before the cut into chapter vii (review SHOULD: it outlived its picture by 1.1 s): TURN.ours now waits for it
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: Q.asks + 2.22, words: [Q.forAnyone, Q.anyone, Q.who, Q.asks] },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, until the dip to dark takes them.
  // WHY it fades 0.35 s before the card fades up (review: it sat printed on the cover through the whole hand-off):
  // it still holds the brand minimum of 1.2 s + 0.25 s per word after "everything.", then the cover is clean
  { text: 'open source / *everything.', at: Q.open, out: Q.everything2 + 1.2 + 0.25 * 3 + 0.4, words: [Q.open, Q.source, Q.everything2] },
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
  const bookOpacity = 1 - lin(t, END_CARD - DIP_OUT, END_CARD - DIP_OUT + 0.3, EASE_IN_OUT);
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
