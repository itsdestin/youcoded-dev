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
import { lin } from './take1c-ink';
import { BARGAIN, DROP_LAND, HANDFUL, HOWEVER, NOTHING, RULES } from './take1c-spreads-a';
import { ANYONE, EVERYTHING, FREE, OURS, OURS_HAND, TREASURE, TREASURE_MARKS, VARIANTS } from './take1c-spreads-b';
import { Headline } from './take1c-page';
import { CLOSE_DUR, COVER_DUR, CUT, CUT_TURNS, DIP_IN, DIP_OUT, END_CARD, Q, TURN, TURN_DUR } from './take1c-time';

// ---------- the order of the book ----------
const SPREADS: Spread[] = [HANDFUL, RULES, BARGAIN, NOTHING, HOWEVER, TREASURE, ANYONE, OURS, FREE, ...VARIANTS, EVERYTHING];
const STARTS = [TURN.cover, TURN.rules, TURN.bargain, TURN.nothing, TURN.however, TURN.treasure, TURN.anyone, TURN.ours, TURN.free, ...TURN.riffle, TURN.everything];
// WHY found by name, not a typed index: adding a spread before the riffle must not silently shift which turns are fast
const RIFFLE_FROM = SPREADS.indexOf(VARIANTS[0]);
// a cut turn takes no time at all: the next spread is simply there on the next frame
const DURS = STARTS.map((s, k) => (k === 0 ? COVER_DUR : CUT_TURNS.has(s) ? 0 : k >= RIFFLE_FROM ? 0.78 : TURN_DUR));
if (STARTS.length !== SPREADS.length) throw new Error('take1c: every spread needs exactly one turn into it (see TURN in take1c-time.ts)');

// ---------- the cover (seen only as the book shuts) ----------
const FOIL = 'linear-gradient(160deg, #E3C6EC 0%, #B98BC9 38%, #8E5DA2 62%, #D7B3E2 100%)';
/** Foil stamping: a flat shape filled with a soft metallic sheen, pressed slightly into the cloth. */
const Foil: React.FC<{ d: string; w: number; h: number; vb: string }> = ({ d, w, h, vb }) => (
  <div style={{ width: w, height: h, background: FOIL, clipPath: `path("${d}")`, filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.35))' }} data-vb={vb} />
);
const QuillEmblem: React.FC = () => (
  <div style={{ transform: 'translateY(-30px) rotate(-8deg)' }}>
    <Foil w={150} h={190} vb="0 0 150 190" d="M 30 186 L 36 166 L 42 168 Z M 40 164 C 50 116 84 54 128 14 C 124 52 100 112 46 168 Z" />
  </div>
);
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
const TM = TREASURE_MARKS;
const SHOTS: Shot[] = [
  // i: open close on one hat, the handful land beside it, and the camera pulls back to reveal the book
  at(0, 380, 330, 2.5, 13), at(Q.handful + 0.3, 385, 336, 2.42, 13), at(Q.corporations1 - 0.12, 386, 338, 2.38, 13),
  at(Q.dictated, 760, 520, 1.0), at(Q.technology1, 760, 530, 1.04), at(TURN.rules - 0.05, 760, 520, 1.0),
  // ii: one picture per thing they decided, each a hard cut on its word
  { t: L(1), ...H },
  cut(Q.computersDo - 0.04, 375, 425, 2.3, 14), at(Q.cost - 0.07, 380, 428, 2.4, 14),
  cut(Q.cost - 0.05, 290, 790, 2.45, 14), at(Q.data - 0.07, 292, 793, 2.55, 14),
  cut(Q.data - 0.05, 1110, 610, 1.3), at(TURN.bargain, 1100, 600, 1.36),
  // iii: the queue; a cut in to the boxes ticking themselves on "accepted"
  at(L(2), 760, 560, 1.02), at(Q.accepted - 0.14, 745, 575, 1.08),
  // WHY 1.8 and a little right/lower (review 2026-11-20): at 1.9 the 'terms of service' label was cut off at the edge
  cut(Q.accepted - 0.12, 660, 748, 1.8), at(TURN.nothing - 0.01, 640, 748, 1.86),
  // the room: a cut in to the price tags on "subscribe", back out for "own nothing", in to the glass
  cut(TURN.nothing, 740, 520, 1.06), at(Q.subscribe - 0.07, 750, 515, 1.1),
  cut(Q.subscribe - 0.05, 410, 540, 2.05, 15), at(Q.own - 0.08, 405, 545, 2.12, 15),
  cut(Q.own - 0.06, H.x, H.y, H.z), at(Q.costOf - 0.37, 770, 505, 1.03),
  cut(Q.costOf - 0.35, 1090, 470, 1.75), at(TURN.however - 0.02, 1095, 478, 1.85),
  // iv: WHY a cut to a calm, nearly whole-book framing as the page turns (review 2026-11-20): the fast pull
  // back during the turn smeared the falling page with motion blur. Then a slow push in while the drop falls.
  cut(TURN.however, 800, 505, 1.1), at(DROP_LAND, 835, 515, 1.28), at(CUT.hubris - 0.01, 845, 518, 1.33),
  // v: a hard cut on "hubris" (hats out of the page), the inkwell, the quill rising, the chart, the snatch
  // WHY framed on the page, not on the desk (it was 30% bare felt): the men left of centre, their desk at right,
  // and the frame's top free for the hats to grow out of
  cut(CUT.hubris, 430, 420, 2.0, 11), at(CUT.these - 0.01, 430, 405, 1.95, 11),
  cut(CUT.these, 440, 540, 1.55, 14), at(Q.artificial - 0.07, 450, 545, 1.6, 14),
  cut(Q.artificial - 0.05, TM.well.x + 10, 470, 2.6, 12), at(Q.aTechnology - 0.07, TM.well.x + 12, 465, 2.7, 12),
  cut(Q.aTechnology - 0.05, 420, 500, 1.45, 14), at(Q.greatTreasure - 0.07, 425, 500, 1.52, 14),
  // the chart close: the three men and their easel, with headroom above the hats (8% of the frame or more)
  cut(Q.greatTreasure - 0.05, 382, 488, 2.55, 13), at(Q.but - 0.07, 386, 486, 2.62, 13),
  cut(Q.but - 0.05, 450, 520, 1.5), at(Q.far - 0.07, 470, 520, 1.6),
  // the snatch: the men at the left of the same shot, the quill and the room it escapes into at the right
  cut(Q.far - 0.05, 470, 500, 2.4, 12), at(CUT.tool - 0.01, 478, 498, 2.48, 12),
  // a hard cut on "a tool": the quill is already at the empty window's corner
  cut(CUT.tool, TM.win.x, TM.win.y + 10, 1.8, 14), at(Q.scarce - 0.07, TM.win.x, TM.win.y + 15, 1.9, 14),
  cut(Q.scarce - 0.05, 250, 650, 1.9), at(Q.foundation - 0.07, 252, 655, 1.98),
  cut(Q.foundation - 0.05, 780, 540, 1.04), at(TURN.anyone - 0.01, 790, 545, 1.08),
  // vi: anyone (a cut, then a slow settle to the wide for the headline)
  cut(TURN.anyone, 760, 460, 1.2), at(Q.asks + 0.3, 760, 490, 1.06), at(TURN.ours - 0.01, 760, 492, 1.05),
  // vii: her hand closing on the key ("and so"), the full page ("a very long while"), the wide on "decide"
  cut(TURN.ours, OURS_HAND.x + 14, OURS_HAND.y - 6, 5.0, 10), at(Q.veryLong - 0.1, OURS_HAND.x + 22, OURS_HAND.y, 4.6, 10),
  at(Q.weGetStart - 0.1, 390, 520, 1.42, 15), at(Q.decide - 0.07, 392, 522, 1.45, 15),
  cut(Q.decide - 0.05, H.x, H.y, H.z), at(Q.ourComputers - 0.07, 760, 505, 1.03),
  cut(Q.ourComputers - 0.05, 375, 425, 2.3, 14), at(Q.itCosts - 0.07, 380, 428, 2.4, 14),
  cut(Q.itCosts - 0.05, 290, 790, 2.45, 14), at(Q.ourData - 0.07, 292, 793, 2.55, 14),
  cut(Q.ourData - 0.05, 1110, 610, 1.3), at(TURN.free, 1100, 600, 1.36),
  // viii: down to the strings as they snap, then a cut to the handful fading
  at(L(8) - 0.1, 700, 620, 1.2), at(Q.free + 0.1, 560, 700, 1.45), at(Q.monopolies2 - 0.07, 580, 690, 1.45),
  cut(Q.monopolies2 - 0.05, 760, 420, 1.12), at(TURN.riffle[0] - 0.1, 760, 440, 1.1),
  // ix: pull back while every page flies past, then home for the last headline
  at(TURN.riffle[1], 760, 500, 0.84, 24), at(TURN.riffle[3], 760, 500, 0.86, 24),
  { t: L(SPREADS.length - 1) - 0.08, ...H }, { t: TURN.close, ...H },
  // the book shuts; the camera settles on its cover
  // WHY the camera stays home while it shuts: the closed book then lies exactly under the headline
  at(TURN.close + CLOSE_DUR, 770, 500, 1.02, 16), at(75, 772, 500, 1.04, 16),
];
// WHY checked: an out-of-order key would make the camera snap, and the keys are computed from word times.
SHOTS.forEach((s, i) => { if (i && s.t <= SHOTS[i - 1].t) throw new Error(`take1c camera key ${i} (t=${s.t.toFixed(2)}) is not after key ${i - 1} (t=${SHOTS[i - 1].t.toFixed(2)})`); });
const cutBetween = (t0: number, t1: number) => SHOTS.some((s) => s.cut && s.t > t0 && s.t <= t1) || STARTS.some((s, k) => DURS[k] === 0 && s > t0 && s <= t1);

// ---------- the book at time t ----------
const page = (k: number, side: 'L' | 'R'): Face => ({ kind: 'page', spread: SPREADS[k], side });
const progress = (t: number, k: number) => interpolate(t, [STARTS[k], STARTS[k] + DURS[k]], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });

const Book: React.FC<{ t: number }> = ({ t }) => {
  const last = SPREADS.length - 1;
  if (t >= TURN.close) {
    // the whole left half (board and pages) swings over onto the right: a rigid board does not bend
    const p = 1 - interpolate(t, [TURN.close, TURN.close + CLOSE_DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
    return (
      <>
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
  { text: 'something *wonderful / happened.', at: Q.something, out: CUT.hubris, words: [Q.something, Q.wonderful, Q.happened], cutOut: true },
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: TURN.ours - 0.04 },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, until the dip to dark takes them.
  { text: 'open source / *everything.', at: Q.open, out: END_CARD, words: [Q.open, Q.source, Q.everything2], cutOut: true,
    night: (t: number) => lin(t, TURN.close + CLOSE_DUR * 0.45, TURN.close + CLOSE_DUR * 0.95, EASE_IN_OUT) },
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
  // WHY a dip through dark (review 2026-11-20): the 4-frame cross-fade from the dark cover to the near-white
  // card read as a flash. The shut book now sinks into the plum dark over 8 frames, and the card rises out of
  // that dark over 16, so the brightness climbs once, slowly, instead of jumping.
  const toDark = lin(t, END_CARD - DIP_OUT, END_CARD, EASE_IN_OUT);
  const fromDark = 1 - lin(t, END_CARD, END_CARD + DIP_IN, EASE_IN_OUT);
  const showBook = t < END_CARD;
  const settle = 0.97 + 0.03 * lin(t, END_CARD, END_CARD + 0.8, EASE_OUT);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile('audio/take1-mix.wav')} />
      {showBook && (
        <>
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
        </>
      )}
      {/* the card settles from 96% to full size as the cut lands, over its own background so no edge shows */}
      {!showBook && <><Day /><AbsoluteFill style={{ transform: `scale(${settle})` }}><EndCard at={END_CARD + 0.12} /></AbsoluteFill></>}
      {(showBook ? toDark : fromDark) > 0 && <AbsoluteFill style={{ background: C.night, opacity: showBook ? toDark : fromDark }} />}
    </AbsoluteFill>
  );
};
