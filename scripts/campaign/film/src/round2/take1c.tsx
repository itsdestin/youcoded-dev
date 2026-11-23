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
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, Icon } from '../kit';
import { Boards, BOARD, BasePage, cameraAt, coverArt, Edges, Face, Lamp, Leaf, LeafShadow, liftAt, PERSPECTIVE, PH, PW, screenScale, Shot, Spread, World } from './take1c-book';
import { lin, Quill } from './take1c-ink';
import { ACCEPT_CUT, BARGAIN, DROP_LAND, HANDFUL, HOWEVER, JUNE_CUT, NOTHING, QUEUE_FRONT, RULES, WELL_AT } from './take1c-spreads-a';
import { ANYONE, EMBLEM, EVERYTHING, FREE, OURS, OURS_HAND, QUILL_LIFT, QUILL_PERCH, TREASURE, TREASURE_MARKS, VI_CAM } from './take1c-spreads-b';
import { Headline } from './take1c-page';
import { CLOSE_DUR, COVER_DUR, CUT, CUT_TURNS, Q, TURN, TURN_DUR } from './take1c-time';

// ---------- the order of the book ----------
// WHY no riffle (round six plan): one page turn to the last spread, so the sharing gets the whole of line 9
const SPREADS: Spread[] = [HANDFUL, RULES, BARGAIN, NOTHING, HOWEVER, TREASURE, ANYONE, OURS, FREE, EVERYTHING];
const STARTS = [TURN.cover, TURN.rules, TURN.bargain, TURN.nothing, TURN.however, TURN.treasure, TURN.anyone, TURN.ours, TURN.free, TURN.everything];
// a cut turn takes no time at all: the next spread is simply there on the next frame
const DURS = STARTS.map((s, k) => (k === 0 ? COVER_DUR : CUT_TURNS.has(s) ? 0 : TURN_DUR));
if (STARTS.length !== SPREADS.length) throw new Error('take1c: every spread needs exactly one turn into it (see TURN in take1c-time.ts)');

// ---------- the cover (seen only as the book shuts) ----------
const FOIL = 'linear-gradient(160deg, #E3C6EC 0%, #B98BC9 38%, #8E5DA2 62%, #D7B3E2 100%)';
/** Foil stamping: a flat shape filled with a soft metallic sheen, pressed slightly into the cloth. */
const Foil: React.FC<{ d: string; w: number; h: number; vb: string }> = ({ d, w, h, vb }) => (
  <div style={{ width: w, height: h, background: FOIL, clipPath: `path("${d}")`, filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.35))' }} data-vb={vb} />
);
// WHY a rounded-square frame round the quill (round six plan): it is the shape and size of the youcoded icon,
// so when the emblem dissolves into the icon the outline does not jump.
// WHY this big and this high on the cover (round seven review: the icon slid 300 px and grew while the cover
// faded): the emblem is sized and placed (EMBLEM, shared with chapter ix, where the quill lands on exactly this
// spot) so that once the camera has centred the shut book it is the end card's icon, same place, same size, and
// the real icon only has to dissolve in over it.
// WHY the foil quill only appears as the flying quill lands on it (round eight): until then the frame is empty, so the
// quill visibly becomes the emblem rather than meeting a copy of itself already printed there
const QuillEmblem: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return (
  <div style={{ transform: `translateY(${EMBLEM.cy - (PH / 2)}px)`, width: EMBLEM.size, height: EMBLEM.size, borderRadius: EMBLEM.size * 0.24, border: '4px solid rgba(215,179,226,0.75)',
    boxShadow: '0 -1px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ transform: `rotate(-8deg) scale(${0.72 * EMBLEM.size / 176})`, opacity: lin(t, FOIL_T[0] + 0.12, FOIL_T[1]) }}>
      <Foil w={150} h={190} vb="0 0 150 190" d="M 30 186 L 36 166 L 42 168 Z M 40 164 C 50 116 84 54 128 14 C 124 52 100 112 46 168 Z" />
    </div>
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
/** The camera on the shut book at the very end: framed so the cover's emblem is the end card's icon (measured). */
const CAM_END = { x: EMBLEM.cx + 3, y: 534, z: 1.12, tilt: 3 };
const SHOTS: Shot[] = [
  // i (round six): open close on the tall hat, waist up, his crossbar in his hands and the dark field beyond the
  // page's top edge; a slow push back while the other two land beside him, then a pull back past the tower to the
  // whole spread from a low, steep angle as the strings pull tight on "dictated"
  // WHY round seven: frame his chest and hands at the sharpest zoom the page holds, so the crossbar sits mid-frame
  // and its slack strings fall straight down out of the frame; a slow push back that HOLDS while the other two
  // land (a fast move fought the landings); then one smooth pull back and tilt from "corporations" to "dictated",
  // the tilt capped at 20 so the book never seems to roll; and a slow creep in through the yanks, so the wide is
  // never still while she talks
  // WHY round eight: the hats now stand higher and nearer the gutter (see PUPPETS); the tall one opens left of centre,
  // waist up, his control mid-frame, with the page's top edge and a strip of the backdrop above him
  at(0, 446, 200, 3.3, 12), at(Q.handful + 0.56, 404, 236, 2.35, 12),
  // WHY closer in the wide (round eight review: the hats shrank to 12% of the frame just as "dictated" is said)
  at(Q.interact - 0.05, 770, 540, 1.3, 20), at(Q.technology1 + 0.15, 766, 534, 1.38, 20), at(TURN.rules + 0.12, 760, 505, 1.04, 17),
  // ii: the wide of all three vignettes, then one hard cut per thing they decided, each on its word
  // WHY lower and closer (round eight review: the three vignettes were tiny for their 0.7 s on screen)
  { t: L(1), x: 760, y: 610, z: 1.14, tilt: 16 },
  // WHY these framings (round seven review): each close-up showed half-cut neighbours at its edges (Theo's hat
  // under Maya, the tall hat's feet over Theo, the left page's hats beside June); each now holds one vignette
  // WHY x 446 (round nine review: the same framing in line 7 showed "a board-edge stripe at the left"): inside the page
  cut(Q.computersDo - 0.04, 446, 296, 2.5, 14), at(Q.cost - 0.07, 448, 300, 2.58, 14),
  cut(Q.cost - 0.05, 380, 800, 2.4, 14), at(Q.data - 0.07, 382, 804, 2.48, 14),
  // WHY lower (round eight review: her feet were cut off and the top half of the frame was empty paper)
  cut(Q.data - 0.05, 1176, 732, 2.15), at(TURN.bargain - 0.02, 1172, 728, 2.2),
  // WHY a cut to the wide as the page starts to turn: a fast pull back during the turn smears the leaf with motion blur
  cut(TURN.bargain, 736, 660, 1.22),
  // iii: the queue in depth; on "accepted" a slow push toward its front, where the heroes' ticks land last
  // WHY the push ends at 1.42 (round seven): pushed to 1.6 it slid the hat paying out the scroll off the frame
  // WHY round nine (review: "the ticks on 'accepted' are unreadable and the scroll reads as a ramp"): the wide shows
  // the hat paying the scroll out down the queue; on "accepted" a hard cut to the front of the queue, close enough that
  // each of the three ticks a clearly drawn "i agree" box, one after another
  at(L(2), 724, 680, 1.28), at(ACCEPT_CUT - 0.01, 716, 692, 1.34),
  cut(ACCEPT_CUT, QUEUE_FRONT.x, QUEUE_FRONT.y, QUEUE_FRONT.z, 14), at(TURN.nothing - 0.01, QUEUE_FRONT.x + 8, QUEUE_FRONT.y + 6, QUEUE_FRONT.z * 1.04, 14),
  // Theo's room: a medium shot for the tags, the wide for "own nothing" (the headline's framing), in to June
  // WHY x 360 for the medium (round seven): further right, June's page peeked in at the frame's right edge.
  // WHY the "own nothing" wide sits at ~1.4 on the left page (round seven): at the whole-book framing Theo's lifted
  // things were thumbnails; at this framing his room fills the frame and the headline still lands on clean paper
  // to the right of the gutter
  // WHY round eight: a slow push in on Theo while the tags land; the "own nothing" wide tighter so the lift is a big
  // event (the headline still lands right of the gutter); the cut to June as soon after "privacy" as the headline
  // allows (JUNE_CUT), framed so she and the hat fill most of the frame height
  cut(TURN.nothing, 360, 560, 1.9, 15), at(Q.own - 0.08, 368, 552, 2.06, 15),
  cut(Q.own - 0.06, 700, 488, 1.45), at(JUNE_CUT - 0.02, 704, 492, 1.49),
  cut(JUNE_CUT, 1130, 520, 2.3), at(TURN.however - 0.02, 1132, 524, 2.38),
  // iv: WHY a cut to a calm, nearly whole-book framing as the page turns (review 2026-11-20): the fast pull
  // back during the turn smeared the falling page with motion blur. Then a slow push in while the drop falls.
  // WHY wider (round eight review): wide and calm, with the backdrop filling a good part of the frame, so its sink on
  // "however" and its sweep to light on "wonderful" can be seen; a gentle push in while the drop falls
  // WHY round nine (review: "the film's turning point is its smallest picture"): wide as the page turns, so the field
  // can be seen sinking on "however"; then a push in as the drop falls, so the inkwell is big when the purple lands,
  // with the field still showing round the book for the sweep of light on "wonderful"; the inkwell sits left of the
  // headline's place
  cut(TURN.however, 776, 516, 0.88), at(Q.howeverEnd + 0.1, 772, 520, 0.9), at(DROP_LAND, WELL_AT.camX, WELL_AT.camY, 1.3), at(CUT.hubris - 0.01, WELL_AT.camX + 6, WELL_AT.camY - 4, 1.36),
  // v (round eight): a true close-up on the three on their tower on "blinded" (no book edge in frame); one eased
  // pull back from "these" to the medium as the tall one slides the inkwell in (round eight review: a second hard
  // cut 1.2 s later on the same subject was "two jolts ... with no new information"); close on the inkwell as the
  // quill rises; a slow push on hats, desk and quill while they admire it; close on hats, chest and quill for the
  // treasure. Maya's string only appears once she is in frame, so the right page is clean in all of these.
  // WHY round nine (review: "from 25.8 to about 31.5 s the picture barely changes ... the left hat is sliced by the
  // frame edge as if by accident"): each beat has its own framing and nothing stands still. Close on the three for
  // "hubris"; pull back as the tall one slides the inkwell in; then one slow push all the way in to the inkwell through
  // "a new kind of technology", so the quill rises out of it in close-up on "artificial" (framed so no hat is cut in
  // half at the edge); back to the medium as they admire it; the chest shot frames all three whole.
  cut(CUT.hubris, 372, 438, 3.0, 11), at(Q.these, 380, 434, 3.06, 11),
  at(Q.created1 + 0.6, 496, 470, 2.25, 13), at(Q.newKind, 500, 466, 2.3, 13),
  at(Q.artificial - 0.05, 630, 402, 3.3, 10), at(Q.aTechnology - 0.07, 632, 398, 3.36, 10),
  cut(Q.aTechnology - 0.05, 492, 452, 2.3, 13), at(Q.greatTreasure - 0.07, 498, 440, 2.4, 13),
  cut(Q.greatTreasure - 0.05, 532, 404, 2.3, 13), at(Q.but - 0.07, 536, 398, 2.36, 13),
  // "but": the medium that shows the hats, the quill and Maya waiting across the gutter; on "control" the camera
  // whip-pans after the quill to her and lands centred on her and the space her window is about to fill
  cut(Q.but - 0.05, 780, 540, 1.62), at(Q.control - 0.02, 790, 540, 1.66),
  // WHY round nine (review: "the camera drifts past the book's edge ... the right fifth of the frame is backdrop with
  // the dark board edge cutting through"): Maya's corner moved in from the edge, and this framing stays inside the paper
  at(Q.control + 0.45, TM.mayaCam.x, TM.mayaCam.y, TM.mayaCam.z, 14), at(TURN.anyone - 0.01, TM.mayaCam.x + 2, TM.mayaCam.y, TM.mayaCam.z * 1.01, 14),
  // vi (round eight review: "in 0.4 s the leaf ... the camera pulls back ... reads as a jumble"): ONE move at a
  // time. A cut to the whole book as the leaf lifts, held still while it falls, then one eased push in to the held
  // frame of three people and three windows, the book filling the frame edge to edge
  // WHY round nine (review: "in about 2 s it shows three windows, two long asks and the headline ... each window is
  // small"): one beat each. The whole book as the leaf falls; in close on the right page for Theo, then June, each
  // asking and being drawn their window big; then back to the wide of all three windows for the headline, framed
  // high so the headline sits alone on clean paper below them
  cut(TURN.anyone, 760, 492, 1.06), at(TURN.anyone + TURN_DUR + 0.04, 760, 492, 1.06),
  // WHY hard cuts in and out (second render: the fast push and pull smeared with motion blur): cut in once the leaf
  // has landed, drift a hair while Theo then June are drawn, cut back to the wide on "for"
  cut(VI_CAM.closeAt, VI_CAM.theo.x, VI_CAM.theo.y, VI_CAM.theo.z), at(VI_CAM.juneFrom, VI_CAM.theo.x + 3, VI_CAM.theo.y, VI_CAM.theo.z * 1.01),
  at(VI_CAM.juneAt, VI_CAM.june.x, VI_CAM.june.y, VI_CAM.june.z), at(VI_CAM.wideAt - 0.01, VI_CAM.june.x + 3, VI_CAM.june.y, VI_CAM.june.z * 1.01),
  cut(VI_CAM.wideAt, VI_CAM.wide.x, VI_CAM.wide.y, VI_CAM.wide.z), at(TURN.ours - 0.01, VI_CAM.wide.x, VI_CAM.wide.y - 4, VI_CAM.wide.z * 1.03),
  // vii: an extreme close-up of Maya's raised hand as the quill drops into it; ease back to the full spread on
  // "a very long while", then in a touch as they decide; then chapter ii's three close-ups, each a hard cut
  // WHY 3.3, not 4.6: closer than this the page's drawing goes soft
  // WHY x 360 (round nine review: "a board-edge stripe sits at the left"): the hand sits left of centre, inside the page
  cut(TURN.ours, 340, OURS_HAND.y - 70, 3.3, 10), at(Q.so + 0.45, 362, OURS_HAND.y - 50, 3.1, 10),
  // WHY a push in on "we get to decide" (round eight review: the full spread "sits almost still for about 3.2 s ...
  // reads as a pause, not as people taking control"): the camera moves toward Maya and the raised quill as she
  // decides, keeping Theo and June, who turn to her, in frame
  // WHY round nine (review: the wide "is held for about 3 s with only small quill lifts"): the ease back lands on
  // "very" and turns straight into one slow move toward Maya and the raised quill, so the frame never rests
  at(Q.veryLong + 0.05, H.x, H.y, H.z), at(Q.decide + 0.3, 560, 520, 1.38), at(Q.ourComputers - 0.07, 556, 520, 1.41),
  // WHY the same three framings as chapter ii's cuts (copied from them): line 7 visibly plays line 2 back, undone
  cut(Q.ourComputers - 0.05, 446, 296, 2.5, 14), at(Q.itCosts - 0.07, 448, 300, 2.58, 14),
  cut(Q.itCosts - 0.05, 380, 800, 2.4, 14), at(Q.ourData - 0.07, 382, 804, 2.48, 14),
  cut(Q.ourData - 0.05, 1196, 620, 2.3), at(TURN.free - 0.01, 1192, 616, 2.36),
  // viii: line 1's wide; once the hats have gone, a slow push toward the freed heroes so no empty paper is held
  // WHY round eight (review: on "free" the quill was "a 20-25 px purple sliver" in a wide, and once the hats had gone
  // the left two-thirds of the spread was empty paper): line 1's wide as the page lands; on "time" a push in along
  // the quill's path so each cut reads; from "monopolies" a move in on the three freed people
  cut(TURN.free, 785, 485, 1.16), at(Q.time1, 780, 480, 1.2), at(Q.ourselves + 0.2, 690, 440, 1.62), at(Q.monopolies2, 700, 450, 1.64),
  at(Q.past + 0.1, 990, 640, 1.7), at(TURN.everything - 0.02, 996, 644, 1.72),
  // ix: the same held framing as vi, so the copies land where the windows stood and the headline on clean paper
  // WHY chapter vi's held framing (round eight): ix repeats vi's layout, so the copies land where the windows stood
  // WHY chapter vi's closing wide (round nine): ix repeats vi's layout, and the headline needs the same clean paper
  cut(TURN.everything, VI_CAM.wide.x, VI_CAM.wide.y, VI_CAM.wide.z), at(TURN.close, VI_CAM.wide.x, VI_CAM.wide.y - 4, VI_CAM.wide.z * 1.03),
  // the book shuts under the headline; then, as the cover settles, the camera glides to centre the shut book so
  // its emblem sits exactly where and as big as the end card's icon (see QuillEmblem and the hand-off below)
  // WHY the glide starts while the cover is still settling and takes 0.95 s: shorter, it smeared with motion blur
  // WHY round nine: the glide starts as the cover swings and is done 0.2 s after it shuts (it used to start after,
  // and the end card then had half a second on screen)
  at(TURN.close + 0.12, VI_CAM.wide.x, VI_CAM.wide.y - 4, VI_CAM.wide.z * 1.03), at(TURN.close + CLOSE_DUR + 0.2, CAM_END.x, CAM_END.y, CAM_END.z, CAM_END.tilt),
  at(75, CAM_END.x, CAM_END.y, CAM_END.z, CAM_END.tilt),
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
      leaves.push(<Leaf key={k} front={page(k - 1, 'R')} back={page(k, 'L')} p={p} n={10} bend={58} lift={0.8 + (k - landed) * 0.4} />);
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

// ---------- the hand-off to the end card ----------
// WHY the quill becomes the icon (round six plan): the one quill has been the hero's tool all film; it lands on
// the cover as its foil emblem, and that emblem dissolves into the real youcoded icon in the same place. The logo
// itself is never restyled: the real icon file simply takes the emblem's place.
// WHY round eight (review, two BLOCKERS: "the viewer never sees the quill become the emblem. The closing page simply
// swallows it", and "a 3-frame diagonal wipe tears the cover and the backdrop away ... then jumps to a flat card"):
// the quill now lifts off the page onto the screen layer, above the closing cover, and hovers while the book shuts
// and the camera centres it; then it drops onto the cover with a small squash exactly where the emblem is, turns
// from purple to foil with one soft glint, and IS the emblem. The real icon dissolves in over it, and the shut book
// and its backdrop fade together (0.6 s, nearly linear) into the end card's own light background, so nothing tears
// and no frame flashes.
// WHY round nine (review, a BLOCKER: "the plum cover fades through a washed-out grey-mauve slab ... the finished card
// is readable for about 0.5-0.7 s"): nothing fades through anything any more. The emblem becomes the real icon; then
// the end card is built UNDER the book (its own light background matches the light field, so the field simply thins
// away into it), and the shut book drops out of the bottom of the frame like a book lowered off a table, leaving the
// icon exactly where it was. Dark cloth only ever moves; it is never made see-through, so no frame turns grey.
const SHUT = TURN.close + CLOSE_DUR;
const LAND = SHUT + 0.22;                            // the camera has settled: the quill lands on the cover
const FOIL_T = [LAND + 0.04, LAND + 0.3] as const;     // purple to foil, with one glint
const ICON_IN = LAND + 0.12;                         // the real icon dissolves in over the emblem
/** The headline leaves as the cover finishes closing over it (it is printed on the cover for that moment; once the
 *  camera glides to centre the shut book it would hang off the cover's edge). */
const HEAD_OUT = SHUT - 0.04;
const CARD = ICON_IN + 0.12;                         // the end card starts building beneath the book
const FIELD_OUT = [CARD, CARD + 0.3] as const;       // the light field thins into the card's own light background
const DROP = [CARD + 0.12, CARD + 0.62] as const;    // the shut book falls away out of the bottom of the frame
if (ICON_IN + 0.24 > DROP[0]) throw new Error('take1c: the real icon must be fully in before the book drops away');
/** The end card's icon, which the emblem matches (measured from the render). */
const ICON_END = { x: 960, y: 311, size: 252 };
/** Where the cover's foil quill sits on screen once the camera has centred the shut book (measured from the render):
 *  its nib, size and turn, in screen pixels. */
const QUILL_END = { x: 927, y: 410, s: 1.145, r: -11 };
/** A point on the book (book units, spine at x = PW) projected to the screen for camera `cam`, and the scale there.
 *  WHY: the quill leaves the page for the screen layer at the moment it lifts, so it must start exactly where the
 *  page drew it. This follows World's own transform (scale, tilt, perspective) in take1c-book.tsx. */
const pageToScreen = (cam: ReturnType<typeof cameraAt>, px: number, py: number) => {
  const S = screenScale(cam.z), a = (cam.tilt * Math.PI) / 180;
  const x = (px - cam.x) * S, y = (py - cam.y) * Math.cos(a) * S, z = (py - cam.y) * Math.sin(a) * S;
  const ox = 960, oy = 1080 * 0.46, oz = 540 - liftAt(cam.z);
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: ox + (960 + x - ox) * k, y: oy + (oz + y - oy) * k, k: S * k };
};
const ScreenQuill: React.FC<{ t: number }> = ({ t }) => {
  if (t < QUILL_LIFT || t > FOIL_T[1] + 0.12) return null;
  // where the page drew it at the lift (FlyQuill's own hover and idle, frozen at that moment)
  const cam0 = cameraAt(SHOTS, QUILL_LIFT);
  const z0 = 34 + Math.sin(QUILL_LIFT * 2.6) * 6;
  const p0 = pageToScreen(cam0, QUILL_PERCH.x, QUILL_PERCH.y - z0);
  const start = { x: p0.x, y: p0.y, s: QUILL_PERCH.s * p0.k, r: QUILL_PERCH.r + Math.sin(QUILL_LIFT * 1.9) * 2 };
  const hover = { x: 1004, y: 214, s: 1.32, r: -18 };
  const rise = lin(t, QUILL_LIFT, QUILL_LIFT + 0.6, EASE_IN_OUT);
  const dive = lin(t, LAND - 0.42, LAND, EASE_IN);
  const bob = Math.sin((t - QUILL_LIFT) * 3.1) * 7 * rise * (1 - dive);
  const mix = (k: keyof typeof start) => start[k] + (hover[k] - start[k]) * rise + (QUILL_END[k] - hover[k]) * dive;
  // a small squash as the nib meets the cloth, and the foil coming up through the purple
  const squash = t > LAND ? Math.sin(Math.PI * Math.max(0, Math.min(1, (t - LAND) / 0.16))) * 0.12 : 0;
  const foil = lin(t, FOIL_T[0], FOIL_T[1], EASE_IN_OUT);
  const glint = lin(t, FOIL_T[0] + 0.06, FOIL_T[1] + 0.04, EASE_IN_OUT);
  const o = 1 - lin(t, FOIL_T[1] - 0.02, FOIL_T[1] + 0.12);
  const x = mix('x'), y = mix('y') + bob, s = mix('s'), r = mix('r');
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: o, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="c-end-foil" gradientUnits="userSpaceOnUse" x1={10} y1={-10} x2={96} y2={-150}>
          <stop offset="0" stopColor="#E3C6EC" /><stop offset="0.38" stopColor="#B98BC9" /><stop offset="0.62" stopColor="#8E5DA2" /><stop offset="1" stopColor="#D7B3E2" />
        </linearGradient>
        <linearGradient id="c-end-glint" gradientUnits="userSpaceOnUse" x1={10} y1={-10} x2={96} y2={-150}>
          <stop offset={Math.max(0, glint * 1.3 - 0.25)} stopColor="#fff" stopOpacity={0} />
          <stop offset={Math.max(0, glint * 1.3 - 0.12)} stopColor="#fff" stopOpacity={0.85} />
          <stop offset={Math.max(0, glint * 1.3)} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* its shadow on the cover grows and firms as it comes down */}
      {dive > 0 && <ellipse cx={x + 24 * s} cy={y + 6} rx={30 * s * (1.4 - 0.4 * dive)} ry={7 * s} fill="#140818" opacity={0.3 * dive * (1 - foil)} />}
      <g transform={`translate(${x} ${y}) scale(1 ${1 - squash}) translate(${-x} ${-y})`}>
        <Quill x={x} y={y} s={s} r={r} />
        {foil > 0 && <Quill x={x} y={y} s={s} r={r} color="url(#c-end-foil)" o={foil} />}
        {glint > 0 && glint < 1 && <Quill x={x} y={y} s={s} r={r} color="url(#c-end-glint)" />}
      </g>
    </svg>
  );
};
const IconFlight: React.FC<{ t: number }> = ({ t }) => {
  // WHY it stays until the end card's own icon (beneath it, in the same place) has fully faded up
  const o = lin(t, ICON_IN, ICON_IN + 0.24) * (1 - lin(t, CARD + 0.6, CARD + 0.7));
  if (o <= 0) return null;
  return <div style={{ position: 'absolute', left: ICON_END.x - ICON_END.size / 2, top: ICON_END.y - ICON_END.size / 2, opacity: o }}><Icon size={ICON_END.size} /></div>;
};

// ---------- the four headlines ----------
// WHY all in one list on the screen layer: they share one position and one style, and each is held at least
// 1.2 s + 0.25 s per word (the brand's muted-video rule) after its last word has inked in.
const minUp = (text: string) => 1.2 + 0.25 * text.split(/[\s/]+/).filter(Boolean).length;
const HEADLINES = [
  // WHY each 'out' is the next cut: a headline never straddles a hard cut
  { text: 'own *nothing.', at: Q.own, out: JUNE_CUT, words: [Q.own, Q.nothing] },
  // WHY each word on its own spoken start, and out on the hard cut at "hubris" (review 2026-11-20): it used to
  // show "wonderful happened." a second before she said it, and leave while she was still saying it
  // WHY three rows (round seven): on two rows "something wonderful" was wider than the headline box and its first
  // letter sat on the book's gutter; one word a row keeps the whole line on the right-hand page
  // WHY holdFromFirst (round eight): the cut now comes on "blinded" (see TURN.treasure), 0.8 s after "happened";
  // the line has been building word by word since "something", 2.6 s on screen in all, which is the brand's
  // reading time for three words; holding it longer froze the picture while she was already on the next line
  // WHY two rows now (round nine): one size and one place for every headline, and none has three rows
  { text: 'something *wonderful / happened.', at: Q.something, out: CUT.hubris, words: [Q.something, Q.wonderful, Q.happened], cutOut: true, holdFromFirst: true },
  // WHY each word on its spoken start (round nine): the camera pulls back to the wide as she says them
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: TURN.ours - 0.04, words: [Q.forAnyone, Q.anyone, Q.who, Q.asks], holdFromFirst: true },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, fading as it shuts.
  // WHY out as the book shuts (round six plan, round nine timing): the headline leaves first, then the quill emblem
  // on the cover turns into the youcoded icon, so the eye has one thing to follow into the end card
  // WHY holdFromFirst (round nine): the line has been building since "open" (2.3 s on screen); it leaves as the
  // cover shuts, so the end card can hold two seconds
  { text: 'open source / *everything.', at: Q.open, out: HEAD_OUT, words: [Q.open, Q.source, Q.everything2], holdFromFirst: true,
    // WHY 0.50-0.61 (integration review): the cover's edge crosses the headline in about three frames, between
    // those two points of the swing (measured from the render); the old, slower 0.45-0.95 ramp left "open source"
    // dark-on-dark, all but vanished, for several frames and then had it pop back in white
    night: (t: number) => lin(t, TURN.close + CLOSE_DUR * 0.50, TURN.close + CLOSE_DUR * 0.61, (x) => x) },
];
// WHY measured from the LAST word's appearance: that is when the whole line is first readable
HEADLINES.forEach((h) => {
  const last = 'holdFromFirst' in h && h.holdFromFirst ? h.at : 'words' in h && h.words ? h.words[h.words.length - 1] : h.at;
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
  // the field thins into the end card's light, and the shut book falls away out of the frame (see DROP)
  const fieldO = 1 - lin(t, FIELD_OUT[0], FIELD_OUT[1], EASE_IN_OUT);
  const drop = lin(t, DROP[0], DROP[1], EASE_IN) * 1250;
  const showBook = t < DROP[1];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {/* WHY the narrator only (round six): the old music was rejected; a new score comes later */}
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {/* WHY beneath the book: it builds while the book leaves, and is whole the moment the cover has gone */}
      {t >= CARD && <EndCard at={CARD} />}
      {showBook && (
        <>
          {(whip.bx > 0 || whip.by > 0) && (
            <svg width={0} height={0} style={{ position: 'absolute' }}>
              <filter id={`c-whip-${frame}`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={`${whip.bx.toFixed(1)} ${whip.by.toFixed(1)}`} /></filter>
            </svg>
          )}
          <AbsoluteFill style={{ filter: whip.bx > 0 || whip.by > 0 ? `url(#c-whip-${frame})` : undefined }}>
            <World cam={cam} fieldO={fieldO} drop={drop}><Book t={t} /></World>
            <Lamp dim={dim} warm={warm} o={fieldO} />
          </AbsoluteFill>
          {HEADLINES.map((h) => <Headline key={h.text} {...h} />)}
        </>
      )}
      {/* WHY a 0.4 s fade up from the dark field (round eight review: the first frame was a hard start) */}
      {t < 0.4 && <AbsoluteFill style={{ background: C.night, opacity: 1 - lin(t, 0, 0.4, EASE_OUT) }} />}
      <ScreenQuill t={t} />
      <IconFlight t={t} />
    </AbsoluteFill>
  );
};
