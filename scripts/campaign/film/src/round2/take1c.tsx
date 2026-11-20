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
import { C, EASE_IN_OUT, FPS } from '../brand';
import { EndCard } from '../kit';
import { Boards, BOARD, BasePage, cameraAt, coverArt, Edges, Face, Lamp, Leaf, LeafShadow, PH, PW, Shot, Spread, World } from './take1c-book';
import { lin } from './take1c-ink';
import { BARGAIN, HANDFUL, HOWEVER, NOTHING, RULES } from './take1c-spreads-a';
import { ANYONE, EVERYTHING, FREE, TREASURE, VARIANTS } from './take1c-spreads-b';
import { CLOSE_DUR, COVER_DUR, END_CARD, Q, TURN, TURN_DUR } from './take1c-time';

// ---------- the order of the book ----------
const SPREADS: Spread[] = [HANDFUL, RULES, BARGAIN, NOTHING, HOWEVER, TREASURE, ANYONE, FREE, ...VARIANTS, EVERYTHING];
const STARTS = [TURN.cover, TURN.rules, TURN.bargain, TURN.nothing, TURN.however, TURN.treasure, TURN.anyone, TURN.free, ...TURN.riffle, TURN.everything];
const DURS = STARTS.map((_, k) => (k === 0 ? COVER_DUR : k >= 8 && k < 8 + VARIANTS.length + 1 ? 0.78 : TURN_DUR));
if (STARTS.length !== SPREADS.length) throw new Error('take1c: every spread needs exactly one turn into it (see TURN in take1c-time.ts)');

// ---------- the cover ----------
const FOIL = 'linear-gradient(160deg, #E3C6EC 0%, #B98BC9 38%, #8E5DA2 62%, #D7B3E2 100%)';
/** Foil stamping: a flat shape filled with a soft metallic sheen, pressed slightly into the cloth. */
const Foil: React.FC<{ d: string; w: number; h: number; vb: string }> = ({ d, w, h, vb }) => (
  <div style={{ width: w, height: h, background: FOIL, clipPath: `path("${d}")`, filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.35))' }} data-vb={vb} />
);
const HatEmblem: React.FC = () => (
  <div style={{ transform: 'translateY(-30px)' }}>
    <Foil w={150} h={170} vb="0 0 150 170" d="M 45 10 L 105 10 L 102 120 L 140 128 Q 140 142 75 142 Q 10 142 10 128 L 48 120 Z" />
  </div>
);
const QuillEmblem: React.FC = () => (
  <div style={{ transform: 'translateY(-30px) rotate(-8deg)' }}>
    <Foil w={150} h={190} vb="0 0 150 190" d="M 30 186 L 36 166 L 42 168 Z M 40 164 C 50 116 84 54 128 14 C 124 52 100 112 46 168 Z" />
  </div>
);
const COVER_START = coverArt(HatEmblem);
const COVER_END = coverArt(QuillEmblem);

// ---------- the camera ----------
const H = { x: 760, y: 500, z: 1, tilt: 16 };
const L = (k: number) => STARTS[k] + DURS[k];
const SHOTS: Shot[] = [
  // i: from the stamped cover to the hats, then down the strings to everyone else
  { t: 0, x: 1150, y: 520, z: 1.5, tilt: 28 },
  { t: 1.7, x: 1080, y: 440, z: 1.24, tilt: 20 }, { t: 2.75, x: 1060, y: 445, z: 1.26, tilt: 20 },
  { t: Q.interact, x: 700, y: 560, z: 1.0, tilt: 17 }, { t: TURN.rules - 0.3, x: 740, y: 520, z: 0.98, tilt: 16 },
  // ii: one picture per thing they decided
  { t: L(1) - 0.15, ...H }, { t: Q.computersDo + 0.05, x: 400, y: 340, z: 1.6, tilt: 18 }, { t: Q.cost - 0.42, x: 392, y: 348, z: 1.62, tilt: 18 },
  { t: Q.cost + 0.08, x: 340, y: 720, z: 1.6, tilt: 18 }, { t: Q.data - 0.3, x: 348, y: 728, z: 1.62, tilt: 18 },
  { t: Q.data + 0.3, x: 1110, y: 600, z: 1.12, tilt: 17 }, { t: TURN.bargain - 0.1, x: 1100, y: 590, z: 1.15, tilt: 17 },
  // iii: along the queue as everyone signs
  { t: L(2) - 0.1, x: 760, y: 560, z: 1.06, tilt: 16 }, { t: Q.accepted - 0.2, x: 1000, y: 620, z: 1.32, tilt: 18 }, { t: Q.accepted + 0.12, x: 990, y: 620, z: 1.32, tilt: 18 },
  { t: TURN.nothing + 0.35, x: 560, y: 600, z: 1.15, tilt: 17 },
  // the room, then home for the headline, then the magnifying glass
  { t: L(3) + 0.05, ...H }, { t: Q.subscribe - 0.15, x: 400, y: 560, z: 1.38, tilt: 18 }, { t: Q.own - 0.62, x: 420, y: 560, z: 1.4, tilt: 18 },
  { t: Q.own - 0.06, ...H }, { t: Q.privacy + 0.45, ...H },
  { t: Q.costOf + 0.15, x: 1100, y: 460, z: 1.55, tilt: 18 }, { t: TURN.however - 0.25, x: 1095, y: 465, z: 1.6, tilt: 18 },
  // iv: still, while the lamp dims and the drop falls
  { t: TURN.however + 0.3, ...H }, { t: TURN.treasure + 0.1, ...H },
  // v: the hats, the jar, the dream, the deflating punchline
  { t: L(5) - 0.05, x: 390, y: 470, z: 1.3, tilt: 18 }, { t: Q.created1 - 0.65, x: 390, y: 440, z: 1.3, tilt: 18 },
  { t: Q.created1 + 0.1, x: 1140, y: 560, z: 1.35, tilt: 24 }, { t: Q.artificial - 0.15, x: 1140, y: 570, z: 1.42, tilt: 24 },
  { t: Q.intelligence + 0.4, x: 1140, y: 560, z: 1.72, tilt: 24 }, { t: Q.aTechnology - 0.1, x: 1140, y: 560, z: 1.74, tilt: 24 },
  { t: Q.believed + 0.2, x: 960, y: 340, z: 1.12, tilt: 18 }, { t: Q.shareholder - 0.3, x: 1000, y: 330, z: 1.18, tilt: 18 },
  { t: Q.shareholder + 0.25, x: 1140, y: 200, z: 1.9, tilt: 16 }, { t: Q.but - 0.05, x: 1140, y: 205, z: 1.95, tilt: 16 },
  // vi: the jar breaks, the quill rises, it makes things; their foundation wobbles
  { t: Q.excitement + 0.5, ...H }, { t: Q.control - 0.35, x: 880, y: 540, z: 1.08, tilt: 17 }, { t: Q.control + 0.1, x: 1000, y: 560, z: 1.14, tilt: 18 },
  { t: Q.makeSoftware - 0.1, x: 1140, y: 560, z: 1.42, tilt: 22 }, { t: Q.scarce - 0.15, x: 1140, y: 520, z: 1.3, tilt: 20 },
  { t: Q.foundation - 0.1, x: 400, y: 700, z: 1.4, tilt: 18 }, { t: TURN.anyone - 0.1, x: 390, y: 690, z: 1.45, tilt: 18 },
  // vii: anyone; the quill goes round the panels, then the three things we decide now
  { t: L(6) - 0.1, ...H }, { t: L(6) + 2.2, ...H },
  { t: Q.firstTime - 0.1, x: 380, y: 520, z: 1.22, tilt: 17 }, { t: Q.decide, x: 380, y: 520, z: 1.2, tilt: 17 },
  { t: Q.ourComputers + 0.4, x: 225, y: 265, z: 3.3, tilt: 16 }, { t: Q.itCosts - 0.1, x: 229, y: 268, z: 3.36, tilt: 16 },
  { t: Q.itCosts + 0.35, x: 535, y: 265, z: 3.3, tilt: 16 }, { t: Q.ourData - 0.12, x: 538, y: 268, z: 3.36, tilt: 16 },
  { t: Q.ourData + 0.4, x: 225, y: 515, z: 3.3, tilt: 16 }, { t: TURN.free - 0.15, x: 228, y: 518, z: 3.36, tilt: 16 },
  // viii: the strings snap; the handful fade into the past
  // WHY no stop at home: the camera travels straight from the last panel down to the strings, so it is already there when they snap
  { t: L(7) - 0.25, x: 700, y: 620, z: 1.2, tilt: 17 }, { t: Q.free + 0.1, x: 560, y: 700, z: 1.45, tilt: 17 }, { t: Q.monopolies2 - 0.2, x: 600, y: 680, z: 1.4, tilt: 17 },
  { t: Q.past - 0.3, x: 1110, y: 430, z: 1.2, tilt: 17 }, { t: TURN.riffle[0] - 0.2, x: 1100, y: 440, z: 1.2, tilt: 17 },
  // ix: pull back while every page flies past, then home for the last headline
  { t: TURN.riffle[1], x: 760, y: 500, z: 0.84, tilt: 24 }, { t: TURN.riffle[5], x: 760, y: 500, z: 0.86, tilt: 24 },
  { t: L(SPREADS.length - 1) - 0.08, ...H }, { t: TURN.close, ...H },
  // the book shuts; the camera settles on its cover
  { t: TURN.close + CLOSE_DUR, x: 1150, y: 500, z: 1.18, tilt: 20 }, { t: 75, x: 1150, y: 500, z: 1.26, tilt: 20 },
];
// WHY checked: an out-of-order key would make the camera snap, and the keys are computed from word times.
SHOTS.forEach((s, i) => { if (i && s.t < SHOTS[i - 1].t) throw new Error(`take1c camera key ${i} (t=${s.t.toFixed(2)}) comes before key ${i - 1} (t=${SHOTS[i - 1].t.toFixed(2)})`); });

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
      leaves.push(<Leaf key={k} front={{ kind: 'cover', Art: COVER_START }} back={{ kind: 'board', spread: SPREADS[0] }} p={p} n={1} bend={0} w={PW + BOARD} h={PH + BOARD * 2} dy={-BOARD} lift={2} />);
    } else {
      const riffle = k >= 8;
      leaves.push(<Leaf key={k} front={page(k - 1, 'R')} back={page(k, 'L')} p={p} n={riffle ? 6 : 10} bend={riffle ? 70 : 58} lift={0.8 + (k - landed) * 0.4} />);
    }
  }
  const turning = leaves.length > 0 && !(landed === started);
  const pArr = Array.from({ length: Math.max(0, started - landed) }, (_, i) => progress(t, landed + 1 + i));
  const Pop = landed >= 0 && landed === started ? SPREADS[landed].Pop : undefined;
  return (
    <>
      <Boards left={landed >= 0} right />
      <Edges left={landed >= 1} right />
      {landed >= 1 && <BasePage face={page(landed, 'L')} side="L" />}
      {landed === 0 && <BasePage face={{ kind: 'board', spread: SPREADS[0] }} side="L" />}
      <BasePage face={page(Math.max(0, started), 'R')} side="R" />
      {turning && pArr.map((p, i) => <React.Fragment key={i}><LeafShadow p={p} side="R" /><LeafShadow p={p} side="L" /></React.Fragment>)}
      {Pop && <Pop />}
      {leaves}
    </>
  );
};

export const Take1C: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = cameraAt(SHOTS, t);
  // the lamp dims for the whisper ("however, recently…") and comes back warmer on "wonderful"
  const dim = Math.min(lin(t, Q.however, Q.recently + 0.3), 1 - lin(t, Q.wonderful - 0.1, Q.wonderful + 0.7)) * 0.55;
  const warm = lin(t, Q.wonderful - 0.1, Q.wonderful + 1.2) + lin(t, Q.toOpen, Q.everything2 + 0.5) * 0.6;
  const card = lin(t, END_CARD, END_CARD + 0.3);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile('audio/take1-mix.wav')} />
      {card < 1 && (
        <>
          <World cam={cam}><Book t={t} /></World>
          <Lamp dim={dim} warm={warm} />
        </>
      )}
      {card > 0 && <AbsoluteFill style={{ opacity: card }}><EndCard at={END_CARD} /></AbsoluteFill>}
    </AbsoluteFill>
  );
};
