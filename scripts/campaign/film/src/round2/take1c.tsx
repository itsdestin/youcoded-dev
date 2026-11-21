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
import { ANYONE, EVERYTHING, FREE, OURS, OURS_HAND, TREASURE, TREASURE_MARKS, VARIANTS } from './take1c-spreads-b';
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
const TM = TREASURE_MARKS;
const SHOTS: Shot[] = [
  // i: open close on one hat, the handful land beside it, and the camera pulls back to reveal the book
  at(0, 380, 330, 2.5, 13), at(Q.handful + 0.3, 385, 336, 2.42, 13), at(Q.corporations1 - 0.12, 386, 338, 2.38, 13),
  // WHY the pull-back ends before "dictated" and the wide is held only briefly (review): the wide of twelve tiny
  // people was a dead plateau; it now shows for ~0.6 s, then pushes in on one man and his two puppets while the
  // strings go taut, and returns to the wide only for "technology" and the turn.
  at(Q.dictated - 0.4, 760, 520, 1.0), at(Q.dictated - 0.05, 760, 520, 1.0),
  cut(Q.dictated, 950, 500, 1.3), at(Q.interact + 0.5, 950, 520, 1.45),
  cut(Q.technology1 - 0.1, 760, 530, 1.04), at(TURN.rules - 0.05, 760, 520, 1.0),
  // ii: one picture per thing they decided, each a hard cut on its word
  { t: L(1), ...H },
  cut(Q.computersDo - 0.04, 375, 425, 2.3, 14), at(Q.cost - 0.07, 380, 428, 2.4, 14),
  // WHY centred right of the laptop: the tag now hangs clear of it, beside the man who sets the price
  cut(Q.cost - 0.05, 335, 760, 2.2, 14), at(Q.data - 0.07, 340, 765, 2.3, 14),
  cut(Q.data - 0.05, 1110, 610, 1.3), at(TURN.bargain, 1100, 600, 1.36),
  // iii: the queue; a cut in to the boxes ticking themselves on "accepted"
  at(L(2), 760, 560, 1.02), at(Q.accepted - 0.14, 745, 575, 1.08),
  // WHY 1.8 and a little right/lower (review 2026-11-20): at 1.9 the 'terms of service' label was cut off at the edge
  cut(Q.accepted - 0.12, 660, 748, 1.8), at(TURN.nothing - 0.01, 640, 748, 1.86),
  // the room: a cut in to the price tags on "subscribe", back out for "own nothing", in to the glass
  cut(TURN.nothing, 740, 520, 1.06), at(Q.subscribe - 0.07, 750, 515, 1.1),
  cut(Q.subscribe - 0.05, 410, 540, 2.05, 15), at(Q.own - 0.08, 405, 545, 2.12, 15),
  cut(Q.own - 0.06, H.x, H.y, H.z), at(Q.costOf - 0.37, 770, 505, 1.03),
  // WHY wider (was 1.75 on her face): her things now float up and out of the page to a hat in the corner
  cut(Q.costOf - 0.35, 1170, 400, 1.3), at(TURN.however - 0.02, 1175, 395, 1.4),
  // iv: WHY a cut to a calm, nearly whole-book framing as the page turns (review 2026-11-20): the fast pull
  // back during the turn smeared the falling page with motion blur. Then a slow push in while the drop falls.
  cut(TURN.however, 800, 505, 1.1), at(DROP_LAND, 835, 515, 1.28), at(CUT.hubris - 0.01, 845, 518, 1.33),
  // v: a hard cut on "hubris" (hats out of the page), the inkwell, the quill rising, the chart, the snatch
  // WHY framed on the page, not on the desk (it was 30% bare felt): the men left of centre, their desk at right,
  // and the frame's top free for the hats to grow out of
  // WHY wider than before (review: the hats ran off the top of the frame): the tallest hat now ends at about y 140
  // on the page, and every shot with the men keeps at least 8% of the frame above it
  cut(CUT.hubris, 430, 450, 1.38, 11), at(CUT.these - 0.01, 430, 445, 1.36, 11),
  cut(CUT.these, 440, 470, 1.5, 14), at(Q.artificial - 0.07, 445, 470, 1.55, 14),
  // WHY 2.0 and centred between the men and the well (review: the 2.6 close-up cropped the men out, so nothing
  // reacted to the quill): now the men's hands rubbing and the quill rising are in one frame
  cut(Q.artificial - 0.05, 520, 450, 1.55, 12), at(Q.aTechnology - 0.07, 525, 450, 1.6, 12),
  cut(Q.aTechnology - 0.05, 420, 480, 1.45, 14), at(Q.greatTreasure - 0.07, 425, 480, 1.52, 14),
  // the chart close: the three men and their easel, hats whole and with headroom above them
  cut(Q.greatTreasure - 0.05, 400, 430, 1.7, 13), at(Q.but - 0.07, 404, 430, 1.74, 13),
  cut(Q.but - 0.05, 450, 480, 1.5), at(Q.far - 0.07, 470, 465, 1.55),
  // the snatch: the men at the left of the same shot, the quill and the room it escapes into at the right
  cut(Q.far - 0.05, 480, 450, 1.6, 12), at(CUT.tool - 0.01, 484, 450, 1.65, 12),
  // a hard cut as the quill leaves the frame: it is already at the scrap of paper, where it writes the wish
  cut(CUT.tool, 1060, 410, 1.65, 14), at(Q.scarce - 0.07, 1060, 415, 1.7, 14),
  cut(Q.scarce - 0.05, 252, 540, 1.5), at(Q.foundation - 0.07, 254, 545, 1.55),
  // WHY the same centre and zoom on both sides of the next cut (review: the book seemed to jump): only the picture changes
  cut(Q.foundation - 0.05, 760, 470, 1.2), at(TURN.anyone - 0.01, 760, 462, 1.2),
  // vi: anyone (a cut, then a slow push so the four cards read at phone size; the headline sits in the clear band below)
  cut(TURN.anyone, 760, 460, 1.2), at(Q.asks + 0.3, 760, 480, 1.3), at(TURN.ours - 0.01, 760, 482, 1.3),
  // vii: the key falls into her hand with the padlock in the same frame ("and so"), a slow push as she carries it
  // to the lock ("a very long while"), the wide on "decide" while the other two scenes ink in
  // WHY a medium shot, not an extreme close-up on empty paper (review): the figure, key and lock stay together
  cut(TURN.ours, 290, 340, 2.6, 12), at(Q.veryLong, 320, 400, 2.3, 13), at(Q.veryLong + 0.9, 350, 400, 2.3, 13), at(Q.decide - 0.07, 350, 405, 2.3, 13),
  cut(Q.decide - 0.05, H.x, H.y, H.z), at(Q.ourComputers - 0.07, 760, 505, 1.03),
  cut(Q.ourComputers - 0.05, 375, 425, 2.3, 14), at(Q.canDo + 0.2, 380, 428, 2.4, 14),
  // WHY the cut to the price tag waits a hair past "what it costs" begins (review: the screen filled and the cut came
  // 0.4 s later): the reward of "can do" is held on screen about 0.9 s
  cut(Q.itCosts + 0.08, 290, 790, 2.45, 14), at(Q.ourData - 0.07, 292, 793, 2.55, 14),
  cut(Q.ourData - 0.05, 1120, 600, 1.5), at(TURN.free + 0.14, 1110, 600, 1.55),
  // viii: a cut to the wide as the page falls (review: the pull-back during the turn smeared the falling page), then
  // a slow push to the strings as they snap, with every hat and the heading inside the frame
  cut(TURN.free + 0.15, 760, 505, 1.12), at(L(8), 760, 510, 1.12), at(Q.free + 0.1, 740, 520, 1.2), at(Q.monopolies2 - 0.07, 745, 520, 1.22),
  cut(Q.monopolies2 - 0.05, 760, 420, 1.12), at(TURN.riffle[0] - 0.1, 760, 440, 1.1),
  // ix: pull back while every page flies past, then in on the one copy being passed across, then home to shut
  at(TURN.riffle[1], 760, 500, 0.84, 24), at(TURN.riffle[3], 760, 500, 0.86, 24),
  { t: L(SPREADS.length - 1) - 0.08, ...H },
  // WHY the push-in on the payoff (review BLOCKER: the thesis was shot at the widest framing, with cards 10% of the
  // frame): zoom 1.5, centred low enough that the headline (fixed bottom right) clears the people's feet
  at(Q.open, 830, 560, 1.5, 14), at(Q.everything2 + 0.3, 830, 560, 1.5, 14),
  // WHY the camera drifts onto the cover as the book shuts (review): the closed book fills the frame and the empty
  // half of the desk is mostly out of shot; the sheen on the cover and the cross-fade carry it into the card
  at(TURN.close, H.x, H.y, H.z), at(TURN.close + CLOSE_DUR, 1090, 500, 1.35, 16), at(END_CARD, 1130, 500, 1.55, 16),
  // the book shuts; the camera settles on its cover
  // WHY the camera stays home while it shuts: the closed book then lies exactly under the headline
  at(75, 1135, 500, 1.58, 16),
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
  { text: 'something *wonderful / happened.', at: Q.something, out: CUT.hubris, words: [Q.something, Q.wonderful, Q.happened], cutOut: true },
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: TURN.ours - 0.04 },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, until the dip to dark takes them.
  // WHY it fades 0.35 s before the card fades up (review: it sat printed on the cover through the whole hand-off):
  // it still holds the brand minimum of 1.2 s + 0.25 s per word after "everything.", then the cover is clean
  { text: 'open source / *everything.', at: Q.open, out: Q.everything2 + 1.2 + 0.25 * 3 + 0.4, words: [Q.open, Q.source, Q.everything2],
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
  // WHY a short straight cross-fade, no dip (review: "a dark flash before the end card"): the old fade down to
  // dark and back up read as a flicker. The card now sits under the book from the start of the fade, and the
  // book layer (headline included) fades out over the last DIP_OUT seconds, so brightness only rises, once.
  const bookOpacity = 1 - lin(t, END_CARD - DIP_OUT, END_CARD, EASE_IN_OUT);
  const showBook = t < END_CARD;
  const showCard = t >= END_CARD - DIP_OUT;
  const settle = 0.97 + 0.03 * lin(t, END_CARD - DIP_OUT, END_CARD + 0.8, EASE_OUT);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {showCard && <><Day /><AbsoluteFill style={{ transform: `scale(${settle})` }}><EndCard at={END_CARD - DIP_OUT + 0.25} /></AbsoluteFill></>}
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
