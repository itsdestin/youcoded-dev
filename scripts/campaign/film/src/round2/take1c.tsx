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
import { Day, EndCard, Icon } from '../kit';
import { Boards, BOARD, BasePage, cameraAt, coverArt, Edges, Face, Lamp, Leaf, LeafShadow, PH, PW, Shot, Spread, World } from './take1c-book';
import { lin } from './take1c-ink';
import { BARGAIN, DROP_LAND, HANDFUL, HOWEVER, NOTHING, RULES } from './take1c-spreads-a';
import { ANYONE, EVERYTHING, FREE, OURS, OURS_HAND, TREASURE, TREASURE_MARKS } from './take1c-spreads-b';
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
// so when the emblem dissolves into the icon the outline does not jump
const QuillEmblem: React.FC = () => (
  <div style={{ transform: 'translateY(-30px)', width: 176, height: 176, borderRadius: 42, border: '3px solid rgba(215,179,226,0.75)',
    boxShadow: '0 -1px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ transform: 'rotate(-8deg) scale(0.72)' }}>
      <Foil w={150} h={190} vb="0 0 150 190" d="M 30 186 L 36 166 L 42 168 Z M 40 164 C 50 116 84 54 128 14 C 124 52 100 112 46 168 Z" />
    </div>
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
  // i (round six): open close on the tall hat, waist up, his crossbar in his hands and the dark field beyond the
  // page's top edge; a slow push back while the other two land beside him, then a pull back past the tower to the
  // whole spread from a low, steep angle as the strings pull tight on "dictated"
  // WHY round seven: frame his chest and hands at the sharpest zoom the page holds, so the crossbar sits mid-frame
  // and its slack strings fall straight down out of the frame; a slow push back that HOLDS while the other two
  // land (a fast move fought the landings); then one smooth pull back and tilt from "corporations" to "dictated",
  // the tilt capped at 20 so the book never seems to roll; and a slow creep in through the yanks, so the wide is
  // never still while she talks
  at(0, 296, 252, 3.2, 12), at(Q.handful + 0.56, 290, 290, 2.4, 12),
  at(Q.interact - 0.05, 756, 528, 1.2, 20), at(Q.technology1 + 0.15, 752, 522, 1.3, 20), at(TURN.rules + 0.12, 760, 505, 1.04, 17),
  // ii: the wide of all three vignettes, then one hard cut per thing they decided, each on its word
  { t: L(1), ...H },
  // WHY these framings (round seven review): each close-up showed half-cut neighbours at its edges (Theo's hat
  // under Maya, the tall hat's feet over Theo, the left page's hats beside June); each now holds one vignette
  cut(Q.computersDo - 0.04, 384, 296, 2.5, 14), at(Q.cost - 0.07, 386, 300, 2.58, 14),
  cut(Q.cost - 0.05, 380, 800, 2.4, 14), at(Q.data - 0.07, 382, 804, 2.48, 14),
  cut(Q.data - 0.05, 1196, 620, 2.3), at(TURN.bargain - 0.02, 1192, 616, 2.36),
  // WHY a cut to the wide as the page starts to turn: a fast pull back during the turn smears the leaf with motion blur
  cut(TURN.bargain, 736, 660, 1.22),
  // iii: the queue in depth; on "accepted" a slow push toward its front, where the heroes' ticks land last
  // WHY the push ends at 1.42 (round seven): pushed to 1.6 it slid the hat paying out the scroll off the frame
  at(L(2), 724, 680, 1.28), at(Q.accepted - 0.1, 716, 696, 1.34), at(TURN.nothing - 0.01, 700, 700, 1.42),
  // Theo's room: a medium shot for the tags, the wide for "own nothing" (the headline's framing), in to June
  // WHY x 360 for the medium (round seven): further right, June's page peeked in at the frame's right edge.
  // WHY the "own nothing" wide sits at ~1.4 on the left page (round seven): at the whole-book framing Theo's lifted
  // things were thumbnails; at this framing his room fills the frame and the headline still lands on clean paper
  // to the right of the gutter
  cut(TURN.nothing, 360, 560, 1.9, 15), at(Q.own - 0.08, 365, 555, 1.98, 15),
  cut(Q.own - 0.06, 714, 500, 1.36), at(Q.costOf - 0.37, 718, 505, 1.4),
  cut(Q.costOf - 0.35, 1130, 470, 1.75), at(TURN.however - 0.02, 1135, 476, 1.85),
  // iv: WHY a cut to a calm, nearly whole-book framing as the page turns (review 2026-11-20): the fast pull
  // back during the turn smeared the falling page with motion blur. Then a slow push in while the drop falls.
  cut(TURN.however, 790, 520, 1.1), at(DROP_LAND, 790, 545, 1.32), at(CUT.hubris - 0.01, 845, 518, 1.33),
  // v (round six): close on the three on their tower as their hats shoot up; the medium for the inkwell being
  // dragged in; close on the inkwell as the quill rises; the medium as they turn to it; close for the treasure
  cut(CUT.hubris, 300, 430, 2.0, 11), at(CUT.these - 0.01, 300, 420, 1.96, 11),
  cut(CUT.these, 430, 585, 1.8, 14), at(Q.artificial - 0.07, 440, 585, 1.86, 14),
  // WHY the inkwell close sits higher and the treasure close a step left (integration check): framed as before,
  // half of Maya's head peeked in at the bottom-right corner of the one and at the right edge of the other, which
  // read as a cropping mistake. Now she is wholly out of both close-ups until the medium on "but" shows her.
  cut(Q.artificial - 0.05, TM.well.x - 22, 420, 2.7, 12), at(Q.aTechnology - 0.07, TM.well.x - 20, 416, 2.8, 12),
  cut(Q.aTechnology - 0.05, 440, 545, 1.62, 14), at(Q.greatTreasure - 0.07, 446, 545, 1.68, 14),
  cut(Q.greatTreasure - 0.05, 390, 474, 2.2, 13), at(Q.but - 0.07, 394, 472, 2.28, 13),
  // "but": the medium that shows the hats, the quill and Maya waiting small across the gutter; on "control" the
  // camera whip-pans after the quill to her (the motion blur is measured from the move in useWhip)
  cut(Q.but - 0.05, 620, 600, 1.6), at(Q.control - 0.02, 640, 600, 1.66),
  at(Q.control + 0.45, TM.maya.x + 200, 492, 1.72, 14), at(TURN.anyone - 0.01, TM.maya.x + 204, 495, 1.76, 14),
  // vi: the wide, held still from "asks" so the three windows can be taken in
  // WHY 1.3 (review of the first build): at the home framing the three windows were too small to read
  // WHY y 540 by "for anyone": the headline (fixed on screen) then sits on clean paper under June, not over her
  cut(TURN.anyone, 780, 480, 1.22), at(Q.forAnyone - 0.3, 782, 540, 1.3), at(TURN.ours - 0.01, 783, 542, 1.31),
  // vii: an extreme close-up of Maya's raised hand as the quill drops into it; ease back to the full spread on
  // "a very long while"; then chapter ii's three close-ups, each a hard cut on its clause
  // WHY 3.3, not 4.6: closer than this the page's drawing goes soft
  cut(TURN.ours, OURS_HAND.x + 14, OURS_HAND.y - 4, 3.3, 10), at(Q.so + 0.45, OURS_HAND.x + 18, OURS_HAND.y, 3.1, 10),
  at(Q.longWhile + 0.3, H.x, H.y, H.z), at(Q.decide - 0.07, 762, 504, 1.03),
  // WHY the same three framings as chapter ii's cuts: line 7 visibly plays line 2 back, undone
  cut(Q.ourComputers - 0.05, 390, 340, 2.5, 14), at(Q.itCosts - 0.07, 392, 344, 2.58, 14),
  cut(Q.itCosts - 0.05, 400, 760, 2.45, 14), at(Q.ourData - 0.07, 402, 764, 2.53, 14),
  cut(Q.ourData - 0.05, 1120, 640, 1.5), at(TURN.free - 0.01, 1114, 636, 1.56),
  // viii and ix: the wide, home framing for both (line 1's layout; the last headline)
  // WHY 1.2, not the home 1.0 (review of the first build): at home the heroes and windows read too small
  cut(TURN.free, 785, 485, 1.16), at(Q.free + 0.1, 785, 485, 1.2), at(TURN.everything - 0.02, 786, 486, 1.22),
  cut(TURN.everything, 788, 482, 1.16), at(Q.last, 790, 482, 1.2), at(TURN.close, 790, 482, 1.21),
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
// the cover as its foil emblem, and that emblem dissolves into the real youcoded icon, which then glides into the
// end card's icon position. The logo itself is never restyled: the real icon file simply takes the emblem's place.
// WHY no dip through dark: the book now floats over the light field and the card is light too, so a straight
// cross-fade never flashes (the old dip read as a grey frame on the light backdrop).
const SHUT = TURN.close + CLOSE_DUR;
const HAND = SHUT + 0.2;            // the emblem starts to become the icon
const CARD = HAND + 0.55;           // the end card's own icon is in place under ours from here
/** Where the cover's emblem sits on screen once the book is shut (measured from the render), and the card's icon. */
const EMB = { x: 1261, y: 476, size: 142 };
const ICON_END = { x: 960, y: 311, size: 252 };
const IconFlight: React.FC<{ t: number }> = ({ t }) => {
  const u = lin(t, HAND + 0.08, CARD, EASE_IN_OUT);
  const o = lin(t, HAND, HAND + 0.22) * (1 - lin(t, CARD + 0.45, CARD + 0.55));
  if (o <= 0) return null;
  const x = EMB.x + (ICON_END.x - EMB.x) * u, y = EMB.y + (ICON_END.y - EMB.y) * u, size = EMB.size + (ICON_END.size - EMB.size) * u;
  return <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, opacity: o }}><Icon size={size} /></div>;
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
  // WHY three rows (round seven): on two rows "something wonderful" was wider than the headline box and its first
  // letter sat on the book's gutter; one word a row keeps the whole line on the right-hand page
  { text: 'something / *wonderful / happened.', at: Q.something, out: CUT.hubris, words: [Q.something, Q.wonderful, Q.happened], cutOut: true },
  { text: 'for *anyone / who asks.', at: Q.forAnyone, out: TURN.ours - 0.04 },
  // WHY held through the book closing (review 2026-11-20): "everything." used to appear 0.85 s before she said
  // it, and to leave 1.4 s after. Now each word lands on its spoken start, and the line stays while the book
  // shuts beneath it: the cover slides in under the words, which turn to the dark-mode colours as it does, so
  // they end printed on the closed cover like its title, until the dip to dark takes them.
  // WHY out just after the book shuts, fading (round six plan): the headline leaves first, then the quill emblem
  // on the cover turns into the youcoded icon, so the eye has one thing to follow into the end card
  { text: 'open source / *everything.', at: Q.open, out: SHUT + 0.15, words: [Q.open, Q.source, Q.everything2],
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
  // the shut book fades away over the light card's background while the emblem becomes the icon
  const bookO = 1 - lin(t, HAND + 0.05, HAND + 0.5, EASE_IN_OUT);
  const showBook = bookO > 0;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {/* WHY the narrator only (round six): the old music was rejected; a new score comes later */}
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {showBook && (
        <>
          {(whip.bx > 0 || whip.by > 0) && (
            <svg width={0} height={0} style={{ position: 'absolute' }}>
              <filter id={`c-whip-${frame}`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={`${whip.bx.toFixed(1)} ${whip.by.toFixed(1)}`} /></filter>
            </svg>
          )}
          {t >= HAND && <Day />}
          <AbsoluteFill style={{ filter: whip.bx > 0 || whip.by > 0 ? `url(#c-whip-${frame})` : undefined, opacity: bookO }}>
            <World cam={cam}><Book t={t} /></World>
            <Lamp dim={dim} warm={warm} />
          </AbsoluteFill>
          {HEADLINES.map((h) => <Headline key={h.text} {...h} />)}
        </>
      )}
      {!showBook && <Day />}
      {t >= CARD && <EndCard at={CARD} />}
      <IconFlight t={t} />
    </AbsoluteFill>
  );
};
