// Take 1C, lines 1-4: the world as it is (plum ink on cream, no colour) up to the first drop of purple.
// WHY this cast and nothing else (round six, owner: "lots of disconnected elements or things that just feel kinda
// random/unrelated to the narration"): every picture here uses the same small cast the rest of the film follows.
//  i   "a small handful ... dictated how you interact"   three hats on a tower of app windows work three people
//                                                         (Maya, Theo, June) and a faint crowd on strings
//  ii  "what your computers could do / cost / data"      Maya's laptop is padlocked, Theo's record player's
//                                                         monthly price is re-inked higher, June's keepsakes are
//                                                         tipped out of her box into a hat
//  iii "we all just accepted it"                          the same three lead a queue ticking a scroll the hat pays out
//      "subscribe to everything and own nothing"         Theo's things get '/mo' tags, then are lifted out of reach
//      "privacy ... the cost of convenience"             the short hat looks at June through a glass and hands her a phone
//  iv  "however, recently ... something wonderful"       one drop of purple falls into a lone inkwell (the hats'; v)
// What is taken here (padlock, tag and lifted player, keepsakes) is exactly what line 7 hands back.
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import {
  Cabinet, CABINET_TOP, Crossbar, HatFigure, HATS, Hero, HEROES, Ink, Inkwell, INKWELL_MOUTH, jolt, KeepsakeBox, KEEPSAKES, KeepsakeIcon, Keepsake,
  Laptop, lin, mixHex, P, Padlock, Person, pop, PriceTag, RecordPlayer, Records, TopHat, Tower, TOWER_SLAB, useT,
} from './take1c-ink';
import type { HatName, HeroName, Hair, Enter } from './take1c-ink';
import { Sheet } from './take1c-page';
import { land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';

// WHY everything that must be on the page when it lands uses this time: a drawing that is already finished when
// the leaf falls or the camera cuts never shows a near-empty or half-drawn page (the round-three fault at 6.0 s).
const DONE = -10;

/** A point on a hat figure, from its own drawing units to the page (the same transform HatFigure uses). */
export const hatPt = (x: number, y: number, s: number, flip: boolean, lean: number, lx: number, ly: number): [number, number] => {
  const r = (lean * Math.PI) / 180;
  const rx = lx * Math.cos(r) - ly * Math.sin(r), ry = lx * Math.sin(r) + ly * Math.cos(r);
  return [x + (flip ? -1 : 1) * s * rx, y + s * ry];
};
/** The inverse of hatPt: a point on the page in a hat figure's own units (to send his hand to a thing on the page). */
const toHat = (x: number, y: number, s: number, flip: boolean, lean: number, px: number, py: number): [number, number] => {
  const dx = (px - x) / ((flip ? -1 : 1) * s), dy = (py - y) / s;
  const r = (lean * Math.PI) / 180;
  return [dx * Math.cos(r) + dy * Math.sin(r), -dx * Math.sin(r) + dy * Math.cos(r)];
};
/** The idle life every hat has, so none of them ever stands still like a cut-out: a breath, the coat-tails
 *  swinging, a slow weight shift. `j` de-syncs them.
 *  WHY this big (round seven): at a 1.6-unit breath and 1.3-degree lean nobody could see it, and the hats read as
 *  cut-outs; at three times that they visibly breathe and shift their weight. */
const idle = (t: number, j: number) => ({
  bob: Math.sin(t * 2.2 + j * 1.9) * 4.5,
  sway: Math.sin(t * 1.6 + j * 2.4) * 7,
  lean: Math.sin(t * 0.85 + j * 1.3) * 3,
});
/** A string from a to b that hangs slack (`sag` units at its middle) and ripples when the bar twitches. */
const stringPath = (a: [number, number], b: [number, number], sag: number, wave = 0) => {
  const mx = (a[0] + b[0]) / 2 + wave * 0.6, my = (a[1] + b[1]) / 2 + sag + wave;
  return `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
};
/** The faint string every hero wears from line 1 until it is cut in line 8, leading up off the page toward the
 *  hats' bars. WHY on every shot: the strings are the film's picture of "dictated"; they never go away until "free". */
export const HeroString: React.FC<{ x: number; y: number; s: number; lean?: number; o?: number }> = ({ x, y, s, lean = 60, o = 0.55 }) => {
  const head = y - 103 * s;
  return <path d={`M ${x} ${head} Q ${x + lean * 0.3} ${head / 2} ${x + lean} -60`} stroke={P.ink} strokeWidth={1.6} fill="none" opacity={o} />;
};
/** How hard the strings are yanked right now: one sharp jolt at each of the narrator's beats. */
export const yankAt = (t: number, beats: number[]) => beats.reduce((s, b) => s + Math.max(0, jolt(t, b, 1, 0.6)) + (t > b && t < b + 0.12 ? (t - b) / 0.12 * 0.4 : 0), 0);
/** The yank as a smooth envelope: a fast jerk up (0.09 s, with a small shudder) and a slower fall back (~0.3 s).
 *  WHY (round seven): the old yank flipped the arms on a threshold, so each yank was a one-frame pop. */
const yankEnv = (t: number, beats: number[]) => Math.min(1.1, beats.reduce((s, b) => {
  if (t < b) return s;
  const d = t - b;
  const rise = d < 0.09 ? EASE_OUT(d / 0.09) : 1;
  const fall = d < 0.09 ? 1 : Math.exp(-(d - 0.09) / 0.3);
  return s + rise * fall * (1 + 0.12 * Math.sin(d * 30) * Math.exp(-d * 7));
}, 0));
/** A landing: squashes on contact and springs back with one small overshoot. */
const landSquash = (t: number, at: number) => (t < at ? 0 : 0.24 * Math.exp(-(t - at) * 9) * Math.cos((t - at) * 20));

// ======================= i · the handful =======================
// The layout line 8 repeats exactly (exported so the other half draws the same picture in colour).
// WHY the heroes this big (round seven review): at the old sizes Maya was 15% of the frame and the three people
// the film is about read as a diagram. They are now the largest, sharpest marks on the page. Maya's laptop and
// table keep their exact place, because line 8 lays her plant app onto that screen.
// WHY the faint crowd stands only to the right of the tower (round seven): crowd figures under the tower had
// their strings run up into its underside, so they looked tethered to the tower instead of to the hats.
export const PUPPETS = {
  // WHY higher and nearer the middle of the left page (round eight review: "every string fans sideways out of one
  // point ... they read as tow ropes or a zip-line"): with the hats standing as high as the page allows (the tall
  // one's crown just under the top edge) and spread along a wider tower, each string leaves its OWN hat's control and
  // falls steeply toward its own person, the way marionette strings hang from the hands that work them.
  // WHY the wide hat now stands on the right (nearest Theo, who is furthest back and right), the short one on the
  // left over June: each string takes the shortest, steepest path to its own hero, and no string crosses another hat.
  tower: { x: 372, y: 356, w: 400, n: 5 },
  // drawn back to front: the wide hat stands a step behind, the tall one a half step, the short one in front.
  // Each hat's strings are drawn straight after him, so a string from a hat further back passes behind the
  // hats in front of him, as it would.
  hats: [
    { name: 'wide' as HatName, x: 506, y: 350, hero: 'theo' as HeroName },
    { name: 'tall' as HatName, x: 366, y: 353, hero: 'maya' as HeroName },
    { name: 'short' as HatName, x: 236, y: 356, hero: 'june' as HeroName },
  ],
  heroes: {
    maya: { x: 1150, y: 944, s: 3.2 },    // right-hand foreground, at her laptop
    june: { x: 560, y: 884, s: 2.4 },     // middle left, hugging her keepsake box
    theo: { x: 960, y: 618, s: 1.7 },     // further back (higher up the page), beside his record player
  },
  // the faint crowd: three loose clumps getting smaller toward the gutter and beyond it (x, feet y, size)
  crowd: [
    [640, 808, 0.84], [690, 822, 0.88], [734, 800, 0.8],
    [822, 702, 0.58], [856, 710, 0.6],
    [1334, 690, 0.66], [1382, 704, 0.7], [1428, 688, 0.64],
  ] as [number, number, number][],
};
const HAIRS: Hair[] = ['tuft', 'bob', 'cap', 'bald', 'tuft', 'bob', 'cap'];
/** Which hat's bar a crowd figure hangs from (an index into PUPPETS.hats). WHY by x: the clumps on the left page and
 *  by the gutter hang from the wide hat, who stands nearest them, the far clump from the tall one; no crowd string
 *  then crosses another hat. Exported so line 8 cuts exactly these strings. */
export const crowdBar = (cx: number) => (cx < 1000 ? 0 : 1);

type PuppetsProps = {
  /** heroes' colour (0 pale wash, 1 their own colour) and the crowd's */
  bloom?: number; crowdBloom?: number;
  /** strings dangle from the controls until `tautAt`, then reach down to their people over 0.5 s */
  tautAt?: number;
  /** the moments the bars yank everyone's strings */
  beats?: number[];
  /** when each string is cut (heroes first, then crowd clumps), for line 8 */
  cutAt?: (i: number) => number | undefined;
  /** the hats and their tower fade to nothing between these times (line 8) */
  fade?: [number, number];
  /** when each hat appears ([wide, tall, short]); a hat that lands drops in from above and squashes */
  landAt?: [number, number, number];
  /** the tall hat's idle twitch of his bar */
  twitchAt?: number;
};
/** Line 1's whole picture: the tower, the three hats with their crossbars, the strings, the heroes, the crowd. */
export const Puppets: React.FC<PuppetsProps> = ({ bloom = 0, crowdBloom = 0, tautAt = -10, beats = [], cutAt, fade, landAt = [-10, -10, -10], twitchAt }) => {
  const t = useT();
  const f = fade ? lin(t, fade[0], fade[1], EASE_IN_OUT) : 0;
  const yank = yankEnv(t, beats);
  // WHY the tower shudders on each landing: the hats are heavy, and the pile of windows they stand on gives a little
  const wobble = landAt.reduce((s, la) => s + jolt(t, la, 0.7, 0.4), 0);
  const twitch = twitchAt != null ? jolt(t, twitchAt, 1, 0.75) : 0;
  const hatState = PUPPETS.hats.map((h, j) => {
    const H = HATS[h.name];
    const id = idle(t, j);
    const la = landAt[j];
    // WHY a 0.28 s eased fall from just above the frame (round seven): at 0.16 s the hat popped in, and the frame
    // before showed only his legs dangling from the top edge
    const fall = (1 - lin(t, la - 0.28, la, EASE_IN)) * -460;
    const squash = landSquash(t, la);
    const seen = t >= la - 0.28;
    const tw = j === 1 ? twitch : 0;
    const lift = yank * 18 + tw * 10;
    const bx = h.x, by = h.y - 112 * H.s + id.bob + fall - lift + squash * 30;
    // each looks along his own strings toward his own hero, with a slow head turn
    const look = 0.45 + 0.4 * Math.sin(t * 0.6 + j * 2.1);
    return { h, H, id, fall, squash, seen, tw, bx, by, landed: la, look };
  });
  const heroHead = (who: HeroName): [number, number] => {
    const p = PUPPETS.heroes[who];
    return [p.x, p.y - 104 * p.s];
  };
  const heroLift = (who: HeroName, j: number) => {
    const cut = cutAt?.(j);
    return cut != null && t >= cut ? 0 : yank * 16;
  };
  // the yank ripples back through the crowd: the further from the heroes, the later
  const crowdYank = (i: number, cx: number) => yankEnv(t, beats.map((b) => b + 0.12 + (Math.abs(cx - 960) / 960) * 0.2 + (i % 3) * 0.04));
  // WHY the strings dangle from the controls until "dictated", then reach down to their people (round eight
  // review: a long taut string swept across empty paper toward an off-screen Theo during the pull-back, a stray
  // line). In the opening close-up they hang straight down out of the frame, plainly puppet strings; on "dictated"
  // each swings out and down to the head it works, the hero strings first, the crowd's a beat after.
  const reachOf = (delay: number) => lin(t, tautAt + delay, tautAt + delay + 0.5, EASE_IN_OUT);
  const reachPath = (a: [number, number], head: [number, number], reach: number, k: number, wave: number) => {
    const dangle: [number, number] = [a[0] + Math.sin(t * 1.7 + k) * 5 + wave * 0.5, a[1] + 300];
    const e: [number, number] = [dangle[0] + (head[0] - dangle[0]) * reach, dangle[1] + (head[1] - dangle[1]) * reach];
    // the control point starts under the bar (a straight hanging string) and moves to the middle (a straight taut one);
    // in between the string bows out like a line being cast
    const c0: [number, number] = [a[0] + wave, a[1] + 160], c1: [number, number] = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
    const sag = Math.sin(reach * Math.PI) * 60;
    const cx = c0[0] + (c1[0] - c0[0]) * reach, cy = c0[1] + (c1[1] - c0[1]) * reach + sag;
    return `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
  };
  const strings = (j: number) => {
    const hs = hatState[j];
    // WHY only once he has landed, fading in fast: strings trailing from a falling hat streaked down the frame
    if (t < hs.landed) return null;
    const so = lin(t, hs.landed, hs.landed + 0.12);
    const out: React.ReactNode[] = [];
    // the faint crowd strings, from the bar's ends. WHY unseen until they reach (round eight): eleven strings dangling
    // down the tower's face in the close-up read as rack wiring; only the three hero strings hang there
    PUPPETS.crowd.forEach(([cx, cy, cs], i) => {
      if (crowdBar(cx) !== j) return;
      const cut = cutAt?.(3 + i);
      if (cut != null && t >= cut) return;
      const ry = crowdYank(i, cx);
      const head: [number, number] = [cx, cy - 104 * cs - ry * 10 * cs];
      const end = (cx > hs.bx ? 1 : -1) * (24 + ((i * 11) % 30));
      const reach = reachOf(0.14 + (i % 3) * 0.05 + Math.abs(cx - 700) / 4000);
      out.push(<path key={`c${i}`} d={reachPath([hs.bx + end, hs.by + 4], head, reach, i, hs.tw * 30)} stroke={P.ink} strokeWidth={1.1} fill="none" opacity={0.18 * so * (1 - f) * Math.min(1, reach * 5)} />);
    });
    // the hero's own string: one clear, darker string, from the ring at his control's end
    const who = hs.h.hero;
    const cut = cutAt?.(j);
    if (!(cut != null && t >= cut)) {
      const [hx, hy] = heroHead(who);
      const start: [number, number] = [hs.bx + (hx > hs.bx ? 52 : -52), hs.by];
      out.push(<path key="h" d={reachPath(start, [hx, hy - heroLift(who, j)], reachOf(j * 0.05), 9 + j, hs.tw * 40)} stroke={P.ink} strokeWidth={2} fill="none" opacity={0.8 * so * (1 - f * 0.6)} />);
    }
    return out;
  };
  return (
    <>
      {/* the faint crowd: pencil-weight, behind everything */}
      {PUPPETS.crowd.map(([cx, cy, cs], i) => {
        const ry = crowdYank(i, cx);
        const col = crowdBloom > 0 ? mixHex(P.paper, ['#CDBBA7', '#9FAABB', '#BFA6AC', '#A9B39C', '#D6C6A8'][i % 5], crowdBloom) : P.paper;
        return (
          <g key={i} opacity={0.34 + 0.4 * crowdBloom}>
            <Person x={cx} y={cy} s={cs} a={DONE} hair={HAIRS[i % HAIRS.length]} pose="down" raise={ry * 0.9} mood="flat" bob={-ry * 10 * cs} body={col} flip={i % 2 === 1} />
          </g>
        );
      })}

      {/* the tower of windows */}
      <g opacity={1 - f}>
        <Tower x={PUPPETS.tower.x} y={PUPPETS.tower.y} w={PUPPETS.tower.w} n={PUPPETS.tower.n} wobble={wobble} />
      </g>
      {/* the three hats, back to front, each with his crossbar and his strings */}
      {hatState.map(({ h, H, id, fall, squash, seen, tw, bx, by, look }, j) => seen && (
        <g key={h.name}>
          <g opacity={1 - f}>
            <g transform={`translate(${h.x} ${h.y}) scale(${1 + squash * 0.8} ${1 - squash}) translate(${-h.x} ${-h.y})`}>
              <HatFigure x={h.x} y={h.y + fall} s={H.s} crown={H.crown} girth={H.girth} a={DONE} pose="hold" bob={id.bob - yank * 6}
                sway={id.sway + squash * 40} lean={id.lean + tw * 4} eyes="dots" mouth="smug" look={look} />
            </g>
            <Crossbar x={bx} y={by} w={110} r={tw * 14 + Math.sin(t * 1.3 + j) * 1.5 - yank * 3} />
          </g>
          {strings(j)}
        </g>
      ))}

      {/* the heroes and their things */}
      {(['theo', 'june', 'maya'] as HeroName[]).map((who) => {
        const j = PUPPETS.hats.findIndex((h) => h.hero === who);
        const p = PUPPETS.heroes[who];
        const cut = cutAt?.(j);
        const isCut = cut != null && t >= cut;
        const lift = heroLift(who, j);
        const r = isCut ? 0 : yank;
        // WHY the things jolt with the yank: the people are jerked off what they were holding
        const thingJolt = -r * 8;
        return (
          <g key={who}>
            {who === 'maya' && (
              <>
                {/* her little table and laptop (line 8 lays her plant app onto this screen: keep its place) */}
                <path d="M 1232 826 L 1446 826 M 1248 826 L 1248 930 M 1430 826 L 1430 930" stroke={P.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" />
                <g transform={`translate(0 ${thingJolt * 0.5})`}><Laptop x={1338} y={824} s={1.8} a={DONE} /></g>
              </>
            )}
            {who === 'theo' && (
              <>
                <Cabinet x={1100} y={618} s={1.0} />
                <g transform={`translate(0 ${thingJolt * 0.4})`}><RecordPlayer x={1100} y={618 - CABINET_TOP * 1.0} s={1.0} spin={t * 200} /></g>
              </>
            )}
            <Hero who={who} x={p.x} y={p.y} s={p.s} a={DONE} bloom={bloom} bob={-lift} mood={bloom > 0.5 ? 'smile' : r > 0.3 ? 'o' : 'flat'}
              pose={who === 'june' ? 'hold' : 'write'} raise={r * 0.95} />
            {who === 'june' && <KeepsakeBox x={p.x} y={p.y - 38 * p.s - lift + thingJolt} s={0.62} lid={1} inside={5} />}
          </g>
        );
      })}
    </>
  );
};

const HandfulArt: React.FC = () => (
  <Sheet>
    {/* WHY this order: the film opens close on the tall hat, already holding his bar; the wide hat lands beside him
        on "handful" and the short one a beat later; the strings pull tight on "dictated" and yank on "interact"
        and "technology" */}
    <Puppets landAt={[Q.handful + 0.1, DONE, Q.handful + 0.5]} tautAt={Q.dictated} beats={[Q.interact + 0.05, Q.technology1 + 0.12]} twitchAt={Q.decade + 0.05} />
  </Sheet>
);
export const HANDFUL: Spread = { id: 'handful', Art: HandfulArt };

// ======================= ii · what they decided =======================
/** Keepsakes travelling along a curve into the top hat (line 2) or back out of it (line 7).
 *  `emerge`: each one rises out of the box mouth with a small overshoot instead of appearing in mid-air. */
export const Stream: React.FC<{ from: number; p0: [number, number]; p1: [number, number]; p2: [number, number]; count?: number; gap?: number; dur?: number; s?: number; reverse?: boolean; until?: number; emerge?: boolean }> = ({ from, p0, p1, p2, count = 5, gap = 0.2, dur = 1.25, s = 1, reverse, until = 1e9, emerge }) => {
  const t = useT();
  const at = (u: number) => {
    const v = 1 - u;
    return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
  };
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const start = from + i * gap;
        if (start > until) return null;
        let u = (t - start) / dur;
        if (u <= 0 || u >= 1) return null;
        u = EASE_IN_OUT(u);
        const pos = reverse ? 1 - u : u;
        const [x, y] = at(pos);
        const shrink = 1 - 0.55 * Math.max(0, (pos - 0.8) / 0.2);
        // WHY (round seven): popping into existence above the box read as a conjuring trick, not a taking
        const grow = emerge ? Math.min(1.06, pop(t, start, 0.28) * 0.7 + 0.3) : 1;
        // WHY June's own five keepsakes, in order: the same five fly back along the same curve in line 7
        return <KeepsakeIcon key={i} kind={KEEPSAKES[(reverse ? i : count - 1 - i) % KEEPSAKES.length] as Keepsake} x={x} y={y} s={s * shrink * grow * 1.05} r={Math.sin(i * 2.1 + t * 3) * 14} />;
      })}
    </>
  );
};

// The three vignettes, laid out so line 7 can repeat them exactly (exported).
export const RULES_LAYOUT = {
  // WHY this big (round six): at the old sizes the three vignettes were small figures adrift on a lot of paper
  maya: { x: 150, y: 500, s: 1.65, table: [232, 462, 432] as [number, number, number], laptop: { x: 350, y: 430, s: 1.5 }, hat: { x: 604, y: 500, s: 1.3 } },
  theo: { x: 150, y: 920, s: 1.65, cabinet: { x: 380, y: 920, s: 1.25 }, hat: { x: 620, y: 920, s: 1.22 } },
  june: { x: 960, y: 900, s: 2.6, hat: { x: 1356, y: 900, s: 1.72 } },
};
const ML = RULES_LAYOUT.maya, TL = RULES_LAYOUT.theo, JL = RULES_LAYOUT.june;
/** Where the short hat holds his top hat out to June: in his hand, its mouth turned toward her.
 *  WHY computed from his hand: drawn at a fixed spot it floated beside him, not held. */
const JS = HATS.short.s * JL.hat.s;
const BUCKET_HAND = hatPt(JL.hat.x, JL.hat.y, JS, true, 0, 73, -119);
// WHY upside down, gripped by the brim (round eight review: the hat floated 20 px from his glove, a detached prop):
// turned mouth-up and tipped toward June, its near brim end sits exactly in his glove, so he is plainly holding it
// out like a bucket. The brim's middle is 20 units from the hand along the tipped brim.
const BUCKET_R = 155;
const BUCKET = { x: BUCKET_HAND[0] - 19.9 * JS, y: BUCKET_HAND[1] + 9.3 * JS, r: BUCKET_R };
// WHY the box is held at her chest and smaller (round seven): drawn big at her waist she seemed to stand in a crate
const JBOX = { x: JL.x, y: JL.y - 40 * JL.s, s: 0.78 };
// WHY from the box's far right corner and over a point well to her right (round eight review: the big keepsakes
// crossed her face and hid the smile that is meant to drain): the one curve now rises clear of her head
const STREAM_P0: [number, number] = [JBOX.x + 44 * JBOX.s, JBOX.y - 62 * JBOX.s];
const STREAM_P1: [number, number] = [(JL.x + BUCKET.x) / 2 + 80, JL.y - 470];
const STREAM_P2: [number, number] = [BUCKET.x, BUCKET.y];
const TALL_S = HATS.tall.s * ML.hat.s, WIDE_S = HATS.wide.s * TL.hat.s;

const RulesArt: React.FC = () => {
  const t = useT();
  // --- "decided": each hat turns his head to his own hero, one after another
  const turn = (j: number) => lin(t, Q.decided + j * 0.14, Q.decided + j * 0.14 + 0.3, EASE_OUT);
  const turnJolt = (j: number) => jolt(t, Q.decided + j * 0.14, 3, 0.5);
  // --- Maya: the padlock. WHY kept out of sight in the wide (round seven): held up in the wide it gave the next beat
  // away. On the cut to her close-up he has it up in his hand; he swings it onto her laptop and it clamps itself
  // shut with a thunk on "computers"
  const tallId = idle(t, 1);
  const hasLock = t >= Q.computersDo - 0.04;
  const place = lin(t, Q.computersDo + 0.0, Q.computersDo + 0.34, EASE_IN_OUT);
  const clampAt = Q.computersDo + 0.36;
  const clamped = t >= clampAt;
  // WHY he steps in and keeps hold of the lock until it touches the screen (round eight review: it was lobbed out of
  // his hand and his hand was back before it landed): his hand carries it all the way, then lets go on the clamp
  const step = place * (1 - lin(t, clampAt + 0.15, clampAt + 0.6, EASE_IN_OUT));
  const tallX = ML.hat.x - 118 * step;
  const tallLean = tallId.lean - 10 * step;
  const lockHand = hatPt(tallX, ML.hat.y, TALL_S, true, tallLean, 73, -119);
  const lockTo: [number, number] = [ML.laptop.x, ML.laptop.y - 26 * ML.laptop.s];
  const lx = lockHand[0] + (lockTo[0] - lockHand[0]) * place, ly = lockHand[1] + (lockTo[1] - lockHand[1]) * place - Math.sin(place * Math.PI) * 50;
  const carry = hasLock && !clamped ? toHat(tallX, ML.hat.y, TALL_S, true, tallLean, lx + 14, ly + 6) : undefined;
  const thunk = jolt(t, clampAt, 9, 0.38);
  const shake = jolt(t, clampAt, 3, 0.2);
  const lockSquash = landSquash(t, clampAt) * 0.9;
  // then he dusts off his gloves: WHY two slow, wide brushes held clear of the coat (round eight review: a fast
  // sin(t*24) landed on random phases each frame, and the white gloves flickered on his chest like buttons)
  const dustP = (t - clampAt - 0.28) / 0.9;
  const dusting = dustP > 0 && dustP < 1;
  const dustAmp = dusting ? Math.sin(dustP * Math.PI) : 0;
  const dustK = dusting ? Math.sin(dustP * Math.PI * 2 * 2) * dustAmp : 0;
  const tallArms = carry ? { r: carry } : dusting ? { l: [-30 + dustK * 18, -132] as [number, number], r: [30 + dustK * 18, -128 - dustAmp * 4] as [number, number] } : undefined;
  const mayaJump = jolt(t, clampAt + 0.02, 0.9, 0.5);
  // --- Theo: the wide hat leans in and flicks the tag with a gloved finger each time the price is re-inked
  const wideId = idle(t, 0);
  const rewrite1 = Q.cost + 0.14, rewrite2 = Q.costWord + 0.12;
  const flick = (rw: number) => lin(t, rw - 0.28, rw - 0.02, EASE_IN_OUT) * (1 - lin(t, rw + 0.12, rw + 0.45, EASE_IN_OUT));
  const reach = Math.max(flick(rewrite1), flick(rewrite2));
  const wideX = TL.hat.x - 46 * reach, wideLean = wideId.lean - 7 * reach;
  // WHY smaller and hung from the record player's lid corner by its own string (round eight review: bigger than the
  // cabinet door and hanging from nothing, it seemed to float)
  const TAG = { x: TL.cabinet.x + 62 * TL.cabinet.s, y: TL.cabinet.y - CABINET_TOP * TL.cabinet.s - 28 * TL.cabinet.s + 30 * 0.86, s: 0.86 };
  const flickHit = (rw: number) => jolt(t, rw - 0.02, 1, 0.9);
  const tagSwing = flickHit(rewrite1) * 12 + flickHit(rewrite2) * 15 - 4;
  const finger = toHat(wideX, TL.hat.y, WIDE_S, true, wideLean, TAG.x + 50 * TAG.s, TAG.y + 52);
  const wideArm = reach > 0.02 ? { r: [20 + (finger[0] - 20) * reach, -150 + (finger[1] + 150) * reach] as [number, number] } : undefined;
  // --- June: the short hat takes his hat off to use as a bucket (off camera, while we are on Theo)
  const shortId = idle(t, 2);
  const bucket = t > Q.cost;
  const tip = lin(t, Q.data - 0.05, Q.data + 0.35, EASE_IN_OUT);
  // WHY 0.16 s apart and smaller (round eight review: four big keepsakes in the air at once read as a juggled
  // scatter): at most three are ever in flight, one behind another along the same curve
  const flyFrom = Q.data + 0.04, gap = 0.16, dur = Q.personalData + 0.08 - flyFrom - gap * 4;
  const left = KEEPSAKES.length - Math.max(0, Math.min(5, Math.floor((t - flyFrom) / gap) + 1));
  const sad = t > Q.personalData - 0.15;
  // his hand, live (he breathes and leans), so the hat he grips moves with it
  const shortLean = shortId.lean * 0.5 - tip * 5 + turnJolt(2);
  const shortHand = hatPt(JL.hat.x, JL.hat.y + shortId.bob * 0.5, JS, true, shortLean, 73, -119);
  // her head follows the keepsakes up and over toward his hat
  const follow = lin(t, flyFrom, flyFrom + 0.5, EASE_IN_OUT) * (1 - lin(t, Q.personalData, Q.personalData + 0.4));
  return (
    <Sheet>
      {/* Maya, her table and laptop, and the tall hat */}
      <g transform={`translate(${shake} ${Math.abs(shake) * 0.5})`}>
        <path d={`M 60 ${ML.y} L 720 ${ML.y}`} stroke={P.inkSoft} strokeWidth={2} />
        <g transform={`translate(0 ${Math.abs(thunk) * 0.3})`}>
          <path d={`M ${ML.table[0]} ${ML.table[2]} L ${ML.table[1]} ${ML.table[2]} M ${ML.table[0] + 14} ${ML.table[2]} L ${ML.table[0] + 14} ${ML.y} M ${ML.table[1] - 14} ${ML.table[2]} L ${ML.table[1] - 14} ${ML.y}`}
            stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        </g>
        <g transform={`translate(${thunk * 0.4} ${Math.abs(thunk) * 0.9})`}><Laptop x={ML.laptop.x} y={ML.laptop.y} s={ML.laptop.s} a={DONE} /></g>
        <HeroString x={ML.x} y={ML.y} s={ML.s} lean={70} />
        <Hero who="maya" x={ML.x} y={ML.y} s={ML.s} a={DONE} pose="write" raise={Math.max(0, mayaJump) * 0.6} mood={t > clampAt + 0.04 ? 'o' : 'smile'} tilt={-jolt(t, clampAt, 5, 0.5)} />
        <HatFigure x={tallX} y={ML.hat.y} s={TALL_S} crown={HATS.tall.crown} girth={HATS.tall.girth} a={DONE} flip
          pose={hasLock && !clamped ? 'key' : dusting ? 'hold' : 'rub'} armTo={tallArms} eyes="dots" mouth="smug" look={0.3 + 0.7 * turn(0)}
          bob={tallId.bob + dustAmp * 2} sway={tallId.sway + dustK * 3} lean={tallLean + turnJolt(0) - dustAmp * 3} />
        {/* the hasp on the lid's top edge the padlock hooks through, so the screen reads as locked shut */}
        {clamped && <rect x={lockTo[0] - 9} y={ML.laptop.y - 46 * ML.laptop.s - 7} width={18} height={12} rx={3} fill={P.paperShade} stroke={P.ink} strokeWidth={2.4} />}
        {/* the padlock: in his hand on the cut, carried onto the screen, and it clamps shut there on its own */}
        {hasLock && (
          <g transform={`translate(${lx} ${ly}) scale(${1 + lockSquash * 0.7} ${1 - lockSquash})`}>
            <Padlock x={0} y={0} s={1.3} at={DONE} openAt={clamped ? undefined : DONE} />
          </g>
        )}
      </g>
      {/* WHY a key would be cut: it is never used again; the quill opens this padlock in line 7 */}

      {/* Theo, his record player on its cabinet, its tag, and the wide hat */}
      <path d={`M 60 ${TL.y} L 720 ${TL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <Cabinet x={TL.cabinet.x} y={TL.cabinet.y} s={TL.cabinet.s} />
      <RecordPlayer x={TL.cabinet.x} y={TL.cabinet.y - CABINET_TOP * TL.cabinet.s} s={TL.cabinet.s} spin={t * 200} />
      {/* WHY bigger and only two rows (round seven): at the old size the price could not be read on a phone, and three
          stacked prices were clutter. Now the new price sits under the one it struck out. */}
      <PriceTag x={TAG.x} y={TAG.y} s={TAG.s} at={DONE} swing={tagSwing} two
        prices={[{ v: '4.99/mo', at: DONE }, { v: '9.99/mo', at: rewrite1 }, { v: '14.99/mo', at: rewrite2 }]} />
      {/* WHY leaning left, off the page's edge (round eight review: rising to the right it ran straight through Maya) */}
      {/* WHY hidden during Maya's close-up only (a hard cut on each side, so it never visibly pops): rising past her
          vignette it showed as a stray line at the edge of her shot */}
      {!(t >= Q.computersDo - 0.04 && t < Q.cost - 0.05) && <HeroString x={TL.x} y={TL.y} s={TL.s} lean={-170} o={0.4} />}
      <Hero who="theo" x={TL.x} y={TL.y} s={TL.s} a={DONE} pose="write" mood={t > rewrite2 + 0.1 ? 'o' : 'smile'} tilt={jolt(t, rewrite2 + 0.05, 4, 0.6)} />
      <HatFigure x={wideX} y={TL.hat.y} s={WIDE_S} crown={HATS.wide.crown} girth={HATS.wide.girth} a={DONE} flip pose="rub" armTo={wideArm}
        eyes="dots" mouth="smug" look={0.3 + 0.7 * turn(1)}
        bob={wideId.bob} sway={wideId.sway + reach * 5} lean={wideLean + turnJolt(1)} />

      {/* June, her open keepsake box, and the short hat */}
      {/* WHY her ground line starts at 870: from 800 its end poked into the right edge of Theo's close-up */}
      <path d={`M 870 ${JL.y} L 1470 ${JL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <HeroString x={JL.x} y={JL.y} s={JL.s} lean={-60} />
      {/* WHY her smile goes as soon as the first keepsake leaves (round nine review: "June also smiles while her letters
          are being taken"): an "o" of alarm as they fly, then flat once they are gone */}
      <Hero who="june" x={JL.x} y={JL.y} s={JL.s} a={DONE} pose="hold" mood={sad ? 'flat' : t > flyFrom + 0.08 ? 'o' : 'smile'} tilt={follow * 7 + jolt(t, Q.personalData, 3, 0.5)} />
      <KeepsakeBox x={JBOX.x} y={JBOX.y} s={JBOX.s} lid={1} inside={t < flyFrom ? 5 : left} />
      {/* the hat first, so his glove is drawn over its brim; it turns about the hand that grips it */}
      {bucket && <g transform={`translate(${shortHand[0] - BUCKET_HAND[0]} ${shortHand[1] - BUCKET_HAND[1]}) rotate(${-25 * (1 - tip) + Math.sin(t * 2) * 2} ${BUCKET_HAND[0]} ${BUCKET_HAND[1]})`}>
        <TopHat x={BUCKET.x} y={BUCKET.y} s={JS} crown={HATS.short.crown} r={BUCKET.r} /></g>}
      <HatFigure x={JL.hat.x} y={JL.hat.y} s={JS} crown={HATS.short.crown} girth={HATS.short.girth} a={DONE} flip
        pose={bucket ? 'key' : 'sides'} noHat={bucket} eyes="dots" mouth="smug" look={0.3 + 0.7 * turn(2)}
        bob={shortId.bob * 0.5} sway={shortId.sway} lean={shortLean} />
      {/* WHY a faint dotted trail along the one curve (round eight): it makes the single path readable, and line 7 can
          visibly run the same trail backwards */}
      <path d={`M ${STREAM_P0[0]} ${STREAM_P0[1]} Q ${STREAM_P1[0]} ${STREAM_P1[1]} ${STREAM_P2[0]} ${STREAM_P2[1]}`} fill="none" stroke={P.inkSoft}
        strokeWidth={2.4} strokeDasharray="2 12" strokeLinecap="round" pathLength={1000}
        opacity={0.5 * lin(t, flyFrom, flyFrom + 0.3) * (1 - lin(t, Q.personalData + 0.3, Q.personalData + 0.8))} />
      <Stream from={flyFrom} p0={STREAM_P0} p1={STREAM_P1} p2={STREAM_P2} count={5} gap={gap} dur={dur} s={1.45} emerge />
    </Sheet>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · we all accepted it =======================
// WHY the queue runs back in depth (round six): the old single row on one ground line was the same picture as
// line 1; now Maya, Theo and June lead it, large, and the faint crowd shrinks away toward the hat.
// WHY a shallower slope and a narrower strip (round nine): the front of the queue and its boxes now stay on the page,
// so the close-up on "accepted" can show each hero's box whole
const Q_AT = (u: number) => ({ x: 1290 - 1130 * u, y: 540 + 300 * u, s: 0.55 + 2.0 * u });
// WHY only four faint people behind the three (round nine review: "a diagonal paper ramp of grey 'ghost' people ...
// lose most of the ghost people"): enough to say "we all", few enough that the three we know lead it
const QUEUE: { u: number; who?: HeroName; dx?: number }[] = [
  { u: 0.1, dx: -8 }, { u: 0.2, dx: 10 }, { u: 0.3, dx: -6 }, { u: 0.42, dx: 8 },
  { u: 0.58, who: 'june' }, { u: 0.77, who: 'theo' }, { u: 0.96, who: 'maya' },
];
/** The scroll's strip on the floor at depth u: its top and bottom edge (it widens toward the camera). */
const stripAt = (u: number) => { const p = Q_AT(u); return { x: p.x - 30 * p.s, top: p.y + 10 + 12 * u, bot: p.y + 30 + 70 * u }; };
/** The hard cut to the front of the queue, on "accepted" (snapped to a frame); the camera reads it. */
export const ACCEPT_CUT = Math.round((Q.accepted - 0.04) * 30) / 30 - 0.001;
/** The close-up on the three at the front of the queue: their boxes and "i agree" whole in frame. */
export const QUEUE_FRONT = { x: 452, y: 730, z: 2.6 };
// when each person's box is ticked: the faint ones back to front in the wide, then the three, one each, on "accepted"
const tickTime = (i: number, who?: HeroName) => who ? Q.accepted + 0.12 + (['june', 'theo', 'maya'] as HeroName[]).indexOf(who) * 0.2 : Q.weAll2 + 0.2 + i * 0.07;
const BargainArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.bargain);
  // the scroll unrolls from the hat's hand toward the camera through "we all..."
  const unroll = lin(t, L - 0.1, Q.weAll2 + 0.2, EASE_IN_OUT);
  const head = -0.04 + unroll * 1.08;   // how far toward the camera (in u) the scroll has reached
  // WHY bigger (round eight review: pushed into the top-right corner, he was too small to be the one handing it out)
  const hat = { x: 1372, y: 560, s: 1.5 };
  const id = idle(t, 0);
  const hand = hatPt(hat.x, hat.y, HATS.wide.s * hat.s, false, id.lean, -42, -90);
  // the floor strip as a polygon, sampled along u
  const N = 24;
  const us = Array.from({ length: N + 1 }, (_, k) => -0.04 + (Math.max(0, head + 0.04) * k) / N);
  const topE = us.map((u) => stripAt(u)), botE = [...topE].reverse();
  const poly = unroll > 0 ? `M ${hand[0]} ${hand[1]} L ${topE[0].x + 40} ${topE[0].top} ` + topE.map((e) => `L ${e.x.toFixed(1)} ${e.top.toFixed(1)}`).join(' ') + ' ' +
    botE.map((e) => `L ${e.x.toFixed(1)} ${e.bot.toFixed(1)}`).join(' ') + ` L ${hand[0] + 14} ${hand[1] + 4} Z` : '';
  const headE = stripAt(head);
  return (
    <Sheet>
      {/* the long ground, falling away toward the hat */}
      <path d="M 40 880 Q 700 700 1480 532" stroke={P.inkSoft} strokeWidth={2} fill="none" opacity={0.5} />
      {unroll > 0 && (
        <g>
          {/* WHY a lighter sheet with a soft shadow under it (round eight review: the shaded strip read as a ramp or a
              road): paper lying on the page, a little lifted, casts a shadow; a road does not */}
          <path d={poly} fill={P.ink} opacity={0.13} transform="translate(7 12)" style={{ filter: 'blur(3px)' }} />
          <path d={poly} fill="#FFFBF4" stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
          {/* WHY fold creases across the strip (round seven): a plain shaded strip read as a road or a ramp; light
              creases at even steps, widening toward the camera, say paper that has been folded and paid out */}
          {Array.from({ length: 16 }, (_, k) => 0.03 + k * 0.064).filter((u) => u < head - 0.02).map((u) => {
            const e = stripAt(u);
            return <path key={u} d={`M ${e.x - 2} ${e.top + 2} L ${e.x - 2} ${e.bot - 2}`} stroke={P.ink} strokeWidth={1 + 1.6 * u} opacity={0.18} />;
          })}
          {/* the leading curl, still unrolling: a little cylinder that grows as it nears the camera */}
          {/* WHY a big curl (round eight review): the roll still to unroll is what says "scroll" at a glance */}
          <ellipse cx={headE.x} cy={(headE.top + headE.bot) / 2} rx={14 + 34 * Math.max(0, head)} ry={(headE.bot - headE.top) / 2 + 4} fill="#FFFBF4" stroke={P.ink} strokeWidth={2.8} />
          <path d={`M ${headE.x} ${(headE.top + headE.bot) / 2} m ${-(14 + 34 * Math.max(0, head)) * 0.5} 0 a ${(14 + 34 * Math.max(0, head)) * 0.5} ${((headE.bot - headE.top) / 2) * 0.55} 0 1 1 ${(14 + 34 * Math.max(0, head)) * 0.7} ${((headE.bot - headE.top) / 2) * 0.3}`} fill="none" stroke={P.ink} strokeWidth={1.8} opacity={0.65} />
        </g>
      )}
      {/* he rubs his free hand on his coat as the ticks land */}
      <HatFigure x={hat.x} y={hat.y} s={HATS.wide.s * hat.s} crown={HATS.wide.crown} girth={HATS.wide.girth} a={DONE} pose="pat" eyes="dots" mouth="smug" look={0.6}
        armTo={t > Q.accepted ? { r: [24 + Math.sin(t * 16) * 7, -110 + Math.cos(t * 16) * 3] } : undefined}
        bob={id.bob + Math.sin(t * 9) * (t > Q.accepted ? 1.2 : 0)} sway={id.sway} lean={id.lean} />
      {/* the roll in his hand: WHY a visible cylinder (round seven), the old 18-unit circle could not be seen */}
      <g transform={`translate(${hand[0]} ${hand[1]}) rotate(-24)`}>
        <rect x={-30} y={-14} width={60} height={28} rx={4} fill={P.paper} stroke={P.ink} strokeWidth={2.6} />
        <ellipse cx={-30} cy={0} rx={6} ry={14} fill={P.paperShade} stroke={P.ink} strokeWidth={2.4} />
        <g transform={`translate(-30 0) rotate(${unroll * 360 * 4})`}><path d="M -3 -6 L 3 6" stroke={P.ink} strokeWidth={1.6} /></g>
        <path d="M -14 -8 L 22 -8" stroke={P.ink} strokeWidth={1.4} opacity={0.3} />
      </g>
      {QUEUE.map(({ u, who, dx = 0 }, i) => {
        const p0 = Q_AT(u), p = { ...p0, x: p0.x + dx * p0.s };
        // the ticks run from the back of the queue to the front; the heroes' land last and closest
        const tickAt = tickTime(i, who);
        const nod = jolt(t, tickAt, 8, 0.55);
        const box = stripAt(u);
        // WHY the box in front of each person's feet with "i agree" beside it (round nine review: round three's readable
        // "I agree" row "told a stranger at once what 'accepted' meant"; the new tiny boxes did not)
        const bs = 20 + 54 * u;
        const bx = p.x - bs * 1.05, by = (box.top + box.bot) / 2 - bs / 2;
        const boxed = head >= u;
        const shuffle = Math.sin(t * 1.4 + i * 1.7) * 1.2;
        const person = who
          ? <><HeroString x={p.x + shuffle} y={p.y} s={p.s} lean={-90 + i * 4} /><Hero who={who} x={p.x + shuffle} y={p.y} s={p.s} a={DONE} flip pose={t > tickAt - 0.25 && t < tickAt + 0.45 ? 'write' : 'down'} mood="flat" tilt={nod} /></>
          : <g opacity={0.36}><Person x={p.x + shuffle} y={p.y} s={p.s} a={DONE} hair={HAIRS[i % HAIRS.length]} body={P.paper} pose="down" mood="flat" tilt={nod} flip={i % 2 === 1} /></g>;
        return (
          <g key={i}>
            {person}
            {boxed && (
              <g opacity={who ? 1 : 0.5}>
                <rect x={bx} y={by} width={bs} height={bs} rx={bs * 0.14} fill={P.paper} stroke={P.ink} strokeWidth={2 + 2.4 * u} />
                <Ink d={`M ${bx + bs * 0.2} ${by + bs * 0.52} L ${bx + bs * 0.42} ${by + bs * 0.76} L ${bx + bs * 0.86} ${by + bs * 0.12}`} a={tickAt} b={tickAt + 0.16} w={3 + 4 * u} />
                {who && <text x={bx + bs + 12} y={by + bs * 0.72} fontFamily={DMSANS} fontWeight={700} fontSize={bs * 0.58} fill={P.ink} letterSpacing="-0.02em">i agree</text>}
              </g>
            )}
          </g>
        );
      })}
    </Sheet>
  );
};
export const BARGAIN: Spread = { id: 'bargain', Art: BargainArt };

// ======================= (iii, cont.) own nothing / the cost of convenience =======================
/** A small '/mo' tag that pops onto a thing and swings. */
const MoTag: React.FC<{ x: number; y: number; at: number; text: string; dy?: number; r?: number }> = ({ x, y, at, text, dy = 0, r = -8 }) => {
  const t = useT();
  const p = pop(t, at, 0.45);
  if (p <= 0) return null;
  const sway = Math.sin((t - at) * 5) * 10 * Math.exp(-(t - at) * 1.5);
  return (
    <g transform={`translate(${x} ${y + dy}) rotate(${sway + r}) scale(${Math.min(1.08, p)})`}>
      {/* WHY bigger (round eight review: at 21 units the prices could not be read at 1080p) */}
      <path d="M 0 0 L 0 16" stroke={P.ink} strokeWidth={2} />
      <path d="M -60 16 L 60 16 L 60 56 L -60 56 Z" fill={P.paper} stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
      <text x={0} y={46} textAnchor="middle" fontSize={27} fontWeight={800} fill={P.ink} fontFamily="DM Sans" letterSpacing="-0.02em">{text}</text>
    </g>
  );
};

// Theo's room (left page): his armchair, his record player on its cabinet, one shelf of records. Nothing else.
const ROOM = { floor: 820, chair: { x: 236, seat: 740 }, cab: { x: 520 }, shelf: { x: 400, y: 470 }, bar: { x: 470, y: 132 } };
const PLAYER_TOP = ROOM.floor - CABINET_TOP * 1.05;
// WHY a step darker than Theo (round eight review: chair and man had the same fill and merged)
const CHAIR = mixHex(P.wash, P.ink, 0.13);
// June's corner (right page, top: the headline needs the clean paper below)
const JUNE = { x: 1040, seat: 560, s: 1.5 };
// WHY nearer June (round seven): at 1352 his arm had to stretch twice his height and read as a rubber hose
const SHORT = { x: 1236, y: 640, s: HATS.short.s * 1.45 };
/** A gloved hand gripping the bar, with its coat cuff: the same hands the hats have in line 1. */
const Cuffed: React.FC<{ x: number; y: number; dx: number; dy: number }> = ({ x, y, dx, dy }) => {
  const n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
  const cx = x - ux * 26, cy = y - uy * 26;
  return (
    <g>
      {/* the shirt cuff peeping out of the sleeve, across the arm */}
      <path d={`M ${cx - uy * 13} ${cy + ux * 13} L ${cx + uy * 13} ${cy - ux * 13}`} stroke={P.ink} strokeWidth={13} strokeLinecap="round" />
      <path d={`M ${cx - uy * 10} ${cy + ux * 10} L ${cx + uy * 10} ${cy - ux * 10}`} stroke={P.paper} strokeWidth={7} strokeLinecap="round" />
      <circle cx={x} cy={y} r={13} fill={P.paper} stroke={P.ink} strokeWidth={3} />
    </g>
  );
};

/** The hard cut from Theo's room to June. WHY here: as soon after "privacy" as the "own nothing." headline's
 *  minimum time allows (1.2 s + 0.25 s a word after "nothing"), snapped to a frame; the camera and headline read it. */
export const JUNE_CUT = Math.round((Q.nothing + 1.2 + 0.25 * 2 + 0.02) * 30) / 30 - 0.001;
const NothingArt: React.FC = () => {
  const t = useT();
  // --- own nothing: the bar's strings tighten and the record player and records rise to dangle under it
  // WHY lowered from the cut to the wide (round seven): starting before the cut, its strings flashed into the last
  // frames of the medium shot with no bar in view
  const barIn = lin(t, Q.own - 0.06, Q.own + 0.3, EASE_OUT);
  const barY = ROOM.bar.y - (1 - barIn) * 260;
  // WHY a small dip before the lift and a little overshoot at the top (round eight review): weight. The strings take
  // up the slack, the things sink a hair as they are yanked, rise, and bob past their stop before settling.
  const riseK = lin(t, Q.own + 0.24, Q.own + 0.9, EASE_IN_OUT);
  const dipK = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - Q.own - 0.14) / 0.12)));
  const overK = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - Q.own - 0.84) / 0.34)));
  const rise = riseK - 0.035 * dipK + 0.04 * overK;
  const swing = Math.sin((t - Q.own) * 3.2) * 4 * lin(t, Q.own + 0.4, Q.own + 0.8) * Math.exp(-Math.max(0, t - Q.own - 0.8) * 0.6);
  const playerY = PLAYER_TOP - rise * (PLAYER_TOP - 330);
  const recordsY = ROOM.shelf.y - rise * (ROOM.shelf.y - 252);
  const recordsX = ROOM.shelf.x - rise * 120;
  const reach = t > Q.own + 0.3 && t < Q.nothing + 0.5;
  // Theo is alive in his chair: a breath, and he turns toward his record player as the shot opens
  const theoBreath = Math.sin(t * 2.1) * 2.2;
  // WHY he reacts to each tag (round eight review: three seconds of a man who only breathes): he turns to the shelf
  // as its tag lands, looks down at his own armchair's tag, and slumps a little
  const theoTurn = 5 * lin(t, Q.weAccepted + 0.3, Q.weAccepted + 0.8, EASE_IN_OUT) * (1 - lin(t, Q.subscribe, Q.subscribe + 0.25))
    + 9 * lin(t, Q.subscribe + 0.02, Q.subscribe + 0.3, EASE_OUT) * (1 - lin(t, Q.everything1, Q.everything1 + 0.25))
    + 4 * lin(t, Q.everything1 + 0.05, Q.everything1 + 0.35, EASE_OUT) * (1 - lin(t, Q.own, Q.own + 0.3));
  const theoSlump = 7 * lin(t, Q.everything1 + 0.1, Q.everything1 + 0.5, EASE_IN_OUT);
  // --- privacy: one readable gesture (round eight review: the level handle read as a handshake, his eye was a small
  // almond in a corner of the lens, the phone was hard to find). On the cut he raises a giant glass to HIS OWN eye
  // and leans toward June, so his eye, hugely magnified, fills the lens and stares at her; on "cost" he leans right in
  // and blinks. On "convenience" he lowers the glass to his chest and his other hand holds out a big lit phone in
  // front of her; she takes it and smiles down at it, her keepsake box open and empty on her lap.
  const juneSeen = t >= JUNE_CUT;
  const id = idle(t, 2);
  const raise = lin(t, JUNE_CUT + 0.02, JUNE_CUT + 0.36, EASE_IN_OUT) * (1 - lin(t, Q.convenience - 0.32, Q.convenience + 0.04, EASE_IN_OUT));
  const leanK = lin(t, Q.costOf - 0.12, Q.costOf + 0.22, EASE_IN_OUT) * (1 - lin(t, Q.convenience - 0.3, Q.convenience + 0.1, EASE_IN_OUT));
  const leanIn = -3 - raise * 5 - leanK * 9 + id.lean * 0.5;
  const sh = (lx: number, ly: number) => hatPt(SHORT.x, SHORT.y, SHORT.s, true, leanIn, lx, ly);
  const shoulderR = sh(20, -168), shoulderL = sh(-20, -168);
  const R = 62;
  // the lens: at his chest when lowered, over his eye (a little toward June) when raised
  const eyeAt = sh(8, -199);
  // WHY tucked behind his back by its handle when lowered: held at his chest the big ring covered him like a drum,
  // and hanging by his legs it read as a wheel
  const rest = sh(-16, -118);
  const lens = { x: rest[0] + (eyeAt[0] - 14 - rest[0]) * raise, y: rest[1] + (eyeAt[1] + 4 - rest[1]) * raise, r: R };
  // WHY the handle points down from the lens into his hand by his chest: it never meets June's hands
  const HA = ((100 - 180 * (1 - raise)) * Math.PI) / 180;
  const rim: [number, number] = [lens.x + R * Math.cos(HA), lens.y + R * Math.sin(HA)];
  const hand: [number, number] = [rim[0] + 54 * Math.cos(HA), rim[1] + 54 * Math.sin(HA)];
  const blink = Math.max(0, 1 - Math.abs(t - (Q.costOf + 0.32)) / 0.06);
  const give = lin(t, Q.convenience - 0.26, Q.convenience + 0.16, EASE_IN_OUT);
  const herHand: [number, number] = [JUNE.x + 10, JUNE.seat - 50 * JUNE.s];
  const phoneRest: [number, number] = sh(-46, -112);   // tucked at his far side, out of sight until he offers it
  const offer: [number, number] = [JUNE.x + 64, JUNE.seat - 86 * JUNE.s];
  // the phone comes up in front of her face first (offered), then down into her hands
  const p1 = Math.min(1, give * 1.6), p2 = Math.max(0, give * 1.6 - 0.6) / 1.0;
  const phone: [number, number] = give < 0.625
    ? [phoneRest[0] + (offer[0] - phoneRest[0]) * EASE_OUT(p1), phoneRest[1] + (offer[1] - phoneRest[1]) * EASE_OUT(p1)]
    : [offer[0] + (herHand[0] - offer[0]) * EASE_IN_OUT(Math.min(1, p2)), offer[1] + (herHand[1] - offer[1]) * EASE_IN_OUT(Math.min(1, p2))];
  const has = give >= 1;
  // once she has it he takes his hand back to his side
  const back = lin(t, Q.convenience + 0.18, Q.convenience + 0.5, EASE_IN_OUT);
  const hisHand: [number, number] = [phone[0] + 30 + (phoneRest[0] - phone[0] - 30) * back, phone[1] + 26 + (phoneRest[1] - phone[1] - 26) * back];
  const juneMood = has ? 'smile' : leanK > 0.4 ? 'o' : 'flat';
  const june = (k: number) => (
    <g key={k}>
      <Hero who="june" x={JUNE.x} y={JUNE.seat} s={JUNE.s} a={DONE} sit pose={has ? 'hold' : 'down'} mood={juneMood}
        tilt={has ? 9 * lin(t, Q.convenience + 0.16, Q.convenience + 0.42) : -3 * leanK} />
      {/* WHY bigger and open (round eight review): her box being EMPTY is the tie back to line 2 */}
      <KeepsakeBox x={JUNE.x + 24} y={JUNE.seat - 2} s={0.8} lid={1} inside={0} />
    </g>
  );
  /** An arm with an elbow: shoulder to hand through a joint that bends down and outward. */
  const arm = (a: [number, number], b: [number, number], bend = 1) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
    const ex = mx - (dy / n) * 26 * bend, ey = my + Math.abs(dx / n) * 26;
    return `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  const armW = 8 * SHORT.s;
  const glassArt = (
    <>
      {/* the glass: lens, rim, handle, and through the lens his own eye, magnified, staring at her */}
      <clipPath id="c-lens8"><circle cx={lens.x} cy={lens.y} r={lens.r} /></clipPath>
      <g clipPath="url(#c-lens8)">
        <circle cx={lens.x} cy={lens.y} r={lens.r} fill={P.paper} />
        {raise > 0.35 && (
          <g opacity={lin(raise, 0.35, 0.7)} transform={`translate(${lens.x + 6} ${lens.y + 2})`}>
            {/* a slice of his magnified head behind the eye, so it reads as HIS face through the glass */}
            <circle cx={14} cy={-6} r={74} fill={P.paper} stroke={P.ink} strokeWidth={5} />
            <path d={`M -34 ${-26 - 4 * leanK} Q -6 -40 22 -30`} stroke={P.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
            <path d={`M -38 0 Q -4 ${-24 * (1 - blink)} 30 0 Q -4 ${24 * (1 - blink)} -38 0 Z`} fill="#fff" stroke={P.ink} strokeWidth={4.5} strokeLinejoin="round" />
            {blink < 0.6 && <><circle cx={-12 - 4 * leanK} cy={1} r={12} fill={P.ink} /><circle cx={-16 - 4 * leanK} cy={-3} r={3.6} fill="#fff" /></>}
          </g>
        )}
        <circle cx={lens.x} cy={lens.y} r={lens.r} fill="rgba(194,170,214,0.16)" />
      </g>
      <path d={`M ${lens.x - 44} ${lens.y - 40} A 58 58 0 0 1 ${lens.x + 12} ${lens.y - 58}`} stroke="#fff" strokeWidth={6} fill="none" opacity={0.75} strokeLinecap="round" />
      <circle cx={lens.x} cy={lens.y} r={lens.r} fill="none" stroke={P.ink} strokeWidth={9} />
      <path d={`M ${rim[0]} ${rim[1]} L ${hand[0]} ${hand[1]}`} stroke={P.ink} strokeWidth={15} strokeLinecap="round" />
      <circle cx={hand[0]} cy={hand[1]} r={11} fill={P.paper} stroke={P.ink} strokeWidth={3} />
    </>
  );
  return (
    <Sheet>
      {/* ---- Theo's room ---- WHY gone after the hard cut to June (round eight review: half-cropped pieces of his
          dangling things cluttered the left of her shot) */}
      {!juneSeen && <>
      <path d={`M 70 ${ROOM.floor} L 690 ${ROOM.floor}`} stroke={P.ink} strokeWidth={2.4} />
      {/* the shelf on the wall, and where the records stood */}
      <path d={`M ${ROOM.shelf.x - 140} ${ROOM.shelf.y} L ${ROOM.shelf.x + 140} ${ROOM.shelf.y} M ${ROOM.shelf.x - 120} ${ROOM.shelf.y} L ${ROOM.shelf.x - 120} ${ROOM.shelf.y + 22} M ${ROOM.shelf.x + 120} ${ROOM.shelf.y} L ${ROOM.shelf.x + 120} ${ROOM.shelf.y + 22}`} stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" />
      {rise > 0.2 && <g opacity={lin(t, Q.own + 0.2, Q.own + 0.6)}><Records x={ROOM.shelf.x} y={ROOM.shelf.y} s={1.1} dashed /></g>}
      <Cabinet x={ROOM.cab.x} y={ROOM.floor} s={1.05} />
      {rise > 0.2 && <g opacity={lin(t, Q.own + 0.2, Q.own + 0.6)}><RecordPlayer x={ROOM.cab.x} y={PLAYER_TOP} s={1.05} dashed /></g>}
      {/* the armchair, with Theo in it */}
      <path d={`M ${ROOM.chair.x - 80} ${ROOM.floor} L ${ROOM.chair.x - 80} ${ROOM.chair.seat - 70} Q ${ROOM.chair.x - 80} ${ROOM.chair.seat - 112} ${ROOM.chair.x - 36} ${ROOM.chair.seat - 112} L ${ROOM.chair.x + 36} ${ROOM.chair.seat - 112} Q ${ROOM.chair.x + 80} ${ROOM.chair.seat - 112} ${ROOM.chair.x + 80} ${ROOM.chair.seat - 70} L ${ROOM.chair.x + 80} ${ROOM.floor} Z`}
        fill={CHAIR} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <HeroString x={ROOM.chair.x - 6} y={ROOM.chair.seat} s={1.95} lean={80} />
      <Hero who="theo" x={ROOM.chair.x - 6} y={ROOM.chair.seat} s={1.95} a={DONE} sit pose={reach ? 'up' : 'down'} mood={t > Q.own + 0.2 ? 'o' : 'flat'} bob={theoBreath + theoSlump} tilt={theoTurn} />
      <path d={`M ${ROOM.chair.x - 100} ${ROOM.floor} L ${ROOM.chair.x - 100} ${ROOM.chair.seat - 30} Q ${ROOM.chair.x - 100} ${ROOM.chair.seat - 48} ${ROOM.chair.x - 80} ${ROOM.chair.seat - 48} L ${ROOM.chair.x - 66} ${ROOM.chair.seat - 48} L ${ROOM.chair.x - 66} ${ROOM.floor} Z M ${ROOM.chair.x + 66} ${ROOM.floor} L ${ROOM.chair.x + 66} ${ROOM.chair.seat - 48} L ${ROOM.chair.x + 80} ${ROOM.chair.seat - 48} Q ${ROOM.chair.x + 100} ${ROOM.chair.seat - 48} ${ROOM.chair.x + 100} ${ROOM.chair.seat - 30} L ${ROOM.chair.x + 100} ${ROOM.floor} Z`}
        fill={CHAIR} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <MoTag x={ROOM.chair.x + 92} y={ROOM.chair.seat - 46} at={Q.everything1 + 0.05} text="6.99/mo" r={10} />
      {/* the wide hat's crossbar, lowered in from above the page, held in his gloved hands */}
      {barIn > 0 && (
        <g>
          {/* WHY both arms reach in from the upper right: straight and parallel they read as legs dangling from the page
              top, splayed as a V they read as a coat hanger; both leaning one way reads as a man just off the page.
              WHY coat cuffs at the hands (round seven): bare struts read as a ceiling rig; the cuffs make them his arms */}
          <path d={`M ${ROOM.bar.x - 50} ${barY - 4} Q ${ROOM.bar.x + 10} ${barY - 150} ${ROOM.bar.x + 170} ${barY - 340} M ${ROOM.bar.x + 50} ${barY - 4} Q ${ROOM.bar.x + 120} ${barY - 130} ${ROOM.bar.x + 270} ${barY - 320}`} stroke={P.ink} strokeWidth={14} fill="none" strokeLinecap="round" />
          <Crossbar x={ROOM.bar.x} y={barY} w={240} r={swing * 0.4} />
          <Cuffed x={ROOM.bar.x - 50} y={barY - 2} dx={-60} dy={146} />
          <Cuffed x={ROOM.bar.x + 50} y={barY - 2} dx={-70} dy={126} />
          {/* strings to the record player and the records: slack, then tight on "own" */}
          <path d={stringPath([ROOM.bar.x + 110, barY], [ROOM.cab.x + 30, playerY - 40], 40 * (1 - lin(t, Q.own + 0.1, Q.own + 0.22)))} stroke={P.ink} strokeWidth={1.8} fill="none" />
          <path d={stringPath([ROOM.bar.x - 110, barY], [recordsX - 10, recordsY - 54], 40 * (1 - lin(t, Q.own + 0.1, Q.own + 0.22)))} stroke={P.ink} strokeWidth={1.8} fill="none" />
        </g>
      )}
      {/* the record player and its tag (still on from line 2), and the records with theirs */}
      <g transform={`translate(${ROOM.cab.x} ${playerY}) rotate(${swing}) translate(${-ROOM.cab.x} ${-playerY})`}>
        <RecordPlayer x={ROOM.cab.x} y={playerY} s={1.05} spin={rise > 0 ? 0 : t * 200} />
        <PriceTag x={ROOM.cab.x + 50} y={playerY - 4} s={0.95} at={DONE} swing={-6 + swing * 2} prices={[{ v: '14.99/mo', at: DONE }]} />
      </g>
      <g transform={`translate(${recordsX} ${recordsY}) rotate(${-swing}) translate(${-recordsX} ${-recordsY})`}>
        <Records x={recordsX} y={recordsY} s={1.1} />
        <MoTag x={recordsX + 70} y={recordsY - 50} at={Q.subscribe + 0.05} text="2.99/mo" r={12} />
      </g>
      </>}

      {/* ---- June's corner ---- */}
      {juneSeen && (
        <g>
          <path d={`M 860 ${JUNE.seat + 70} L 1460 ${JUNE.seat + 70}`} stroke={P.inkSoft} strokeWidth={2} />
          {/* the stool */}
          <path d={`M ${JUNE.x - 40} ${JUNE.seat} L ${JUNE.x + 40} ${JUNE.seat} M ${JUNE.x - 30} ${JUNE.seat} L ${JUNE.x - 40} ${JUNE.seat + 70} M ${JUNE.x + 30} ${JUNE.seat} L ${JUNE.x + 40} ${JUNE.seat + 70}`} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
          <HeroString x={JUNE.x} y={JUNE.seat} s={JUNE.s} lean={-70} />
          {june(0)}
          {/* WHY the glass is drawn behind him while lowered: hanging in front of his legs the big ring read as a wheel */}
          {raise < 0.5 && glassArt}
          {/* the short hat, all of him in view, leaning in toward her */}
          <HatFigure x={SHORT.x} y={SHORT.y} s={SHORT.s} crown={HATS.short.crown} girth={HATS.short.girth} a={DONE} flip pose="bare"
            eyes="dots" mouth="smug" look={1} bob={id.bob} sway={id.sway} lean={leanIn} />
          <path d={arm(shoulderR, hand)} stroke={P.ink} strokeWidth={armW} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={arm(shoulderL, hisHand, -1)} stroke={P.ink} strokeWidth={armW} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {raise >= 0.5 && glassArt}
          {/* WHY a lit screen, big (round eight review: hard to find): it is the one bright, glossy thing on the page,
              which is what "convenience" is */}
          {give > 0 && <g transform={`translate(${phone[0]} ${phone[1]}) rotate(${-8 + give * 8}) scale(2.2)`}>
            <rect x={-12} y={-19} width={24} height={36} rx={4.5} fill={P.ink} stroke={P.ink} strokeWidth={2.4} />
            <defs><linearGradient id="c-phone8" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E6D6F2" /></linearGradient></defs>
            <rect x={-9.5} y={-15.5} width={19} height={28} rx={2.5} fill="url(#c-phone8)" />
            <circle cx={5} cy={-10} r={2.4} fill={P.ink} />
            <path d="M -6 -3 L 4 -3 M -6 2 L 1 2" stroke={P.inkSoft} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
          </g>}
          <circle cx={hisHand[0]} cy={hisHand[1]} r={11} fill={P.paper} stroke={P.ink} strokeWidth={3} />
        </g>
      )}
    </Sheet>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
// WHY a lone inkwell: one drop of purple, the first colour in the film, falls through the whole of "recently..."
// and lands in an empty inkwell as the word ends. The inkwell is the hats' own (line 5 reveals it, and the tiny
// top-hat stamp on its label hints it), so the wonderful thing is born out of their world; the quill rises out of
// it only once, on "artificial".
export const DROP_LAND = Q.recentlyEnd - 0.02;
// WHY the drop starts as "however" ends (round seven): the line then has motion from its first word
const DROP_FROM = Q.howeverEnd + 0.04;
// WHY this big (round seven): at 2.7 the first colour of the film was a small object adrift on an empty spread
// WHY bigger again and lower (round nine review: "the film's turning point is its smallest picture"): with the camera
// pushing in as the drop falls, the inkwell fills a good part of the frame when the purple lands, and stays left of
// the headline's place
const WELL = { x: 400, y: 800, s: 5.0 };
/** Where the camera looks once it has pushed in on the inkwell (see take1c.tsx, chapter iv). */
export const WELL_AT = { camX: 770, camY: 560 };
// WHY on the left page: the headline lands on the right page at this moment, and must sit on clean paper
const DROP = { x: WELL.x, y: WELL.y - INKWELL_MOUTH * WELL.s };
/** The ink's surface inside the glass at fill f (the same sum as Inkwell draws), on the page. */
const inkSurface = (f: number) => WELL.y + (-8 - 22 * f) * WELL.s;
// WHY the ink stays at one low level and the purple spreads through it (round eight review: one drop filling the jar
// two-thirds full read as a progress bar; the high surface also ran the ripples through the label)
const WELL_FILL = 0.3;
const HoweverArt: React.FC = () => {
  const t = useT();
  const filled = WELL_FILL;
  // the drop's colour spreads from where it went in: half through at the landing ripple, full and glowing on "wonderful"
  const tint = Math.min(1, lin(t, DROP_LAND, DROP_LAND + 0.45, EASE_OUT) * 0.55 + lin(t, DROP_LAND + 0.45, Q.wonderful, EASE_IN_OUT) * 0.45);
  const glow = lin(t, Q.wonderful - 0.1, Q.wonderful + 0.6) * (0.8 + 0.2 * Math.sin((t - Q.wonderful) * 2.4));
  // WHY ripples on the ink inside the glass (round seven): the old ring inside the narrow mouth was ~40 px across
  // and could not be seen; the glass is see-through now, so the whole surface of the ink can ring out, in violet
  const ripple = (at: number, big: number) => {
    const p = lin(t, at, at + 0.75, EASE_OUT);
    if (p <= 0 || p >= 1) return null;
    const y = inkSurface(filled);
    return [0, 0.28].map((d, k) => {
      const q = Math.max(0, p - d) / (1 - d);
      if (q <= 0) return null;
      const rx = (6 + q * 34 * big) * WELL.s;
      return <ellipse key={k} cx={WELL.x} cy={y} rx={Math.min(rx, 40 * WELL.s)} ry={Math.min(rx, 40 * WELL.s) * 0.1} fill="none" stroke={P.violet} strokeWidth={(3 - 2 * q) * 1.4 * big} opacity={0.85 * (1 - q)} />;
    });
  };
  const splash = lin(t, DROP_LAND, DROP_LAND + 0.3);
  return (
    <Sheet rough={false}>
      {/* WHY a soft violet light on the paper round the inkwell's foot on "wonderful" (round seven): the ink glows, and
          the glow falls on the page it stands on, flat on the paper, never a radiating orb */}
      <defs>
        <radialGradient id="c-wellglow7"><stop offset="0" stopColor={P.violet} stopOpacity="0.5" /><stop offset="0.55" stopColor={P.violet} stopOpacity="0.16" /><stop offset="1" stopColor={P.violet} stopOpacity="0" /></radialGradient>
      </defs>
      {glow > 0 && <ellipse cx={WELL.x} cy={WELL.y - 6} rx={72 * WELL.s} ry={22 * WELL.s} fill="url(#c-wellglow7)" opacity={glow} />}
      <Inkwell x={WELL.x} y={WELL.y} s={WELL.s} fill={filled} glow={glow} tint={t < DROP_LAND ? 0 : tint} />
      {ripple(DROP_LAND, 1)}
      {ripple(Q.happened, 1.6)}
      {/* the drop's little crown of a splash as it goes in, gone in a quarter second */}
      {splash > 0 && splash < 1 && <path d={`M ${DROP.x - 12} ${DROP.y} q -6 ${-22 * Math.sin(splash * Math.PI)} -15 ${-28 * Math.sin(splash * Math.PI)} M ${DROP.x + 12} ${DROP.y} q 6 ${-22 * Math.sin(splash * Math.PI)} 15 ${-28 * Math.sin(splash * Math.PI)} M ${DROP.x} ${DROP.y - 4} l 0 ${-30 * Math.sin(splash * Math.PI)}`}
        stroke={P.purple} strokeWidth={4} strokeLinecap="round" fill="none" opacity={1 - splash} />}
    </Sheet>
  );
};
/** The falling drop: it falls DOWN the page from beyond its top edge (out over the backdrop) into the inkwell.
 *  WHY down the page, not toward it (round seven): falling along the page's depth it barely moved on screen and
 *  read as a blob hovering; falling down the frame it is seen against the backdrop first, then crosses the page's
 *  top edge, quickening, and stretches to a teardrop just before it goes in. */
const DROP_TOP = -40;
const HoweverPop: React.FC = () => {
  const t = useT();
  const u = (t - DROP_FROM) / (DROP_LAND - DROP_FROM);
  if (u <= 0 || u >= 1) return null;
  // WHY u^1.9: a real drop accelerates; most of its height is lost in the last third
  const k = Math.pow(u, 1.9);
  const y = DROP_TOP + (DROP.y - DROP_TOP) * k;
  const stretch = 1 + 0.4 * Math.max(0, (u - 0.8) / 0.2);
  const seen = Math.min(1, u / 0.08);
  const W = 58, H = 84;
  const near = Math.max(0, (u - 0.55) / 0.45);
  return (
    <>
      {/* its shadow on the page under the inkwell's mouth, gathering and sharpening as it nears */}
      <div style={{ position: 'absolute', left: DROP.x - 40, top: DROP.y - 12, width: 80, height: 24, borderRadius: '50%',
        background: 'rgba(40,14,48,0.5)', filter: `blur(${2 + (1 - near) * 10}px)`, opacity: 0.45 * near, transform: `translateZ(0.5px) scale(${1.8 - 0.8 * near})` }} />
      <div style={{ position: 'absolute', left: DROP.x - W / 2, top: y - H, width: W, height: H, opacity: seen,
        transform: `translateZ(6px) scale(${1 / Math.sqrt(stretch)}, ${stretch})`, transformOrigin: '50% 100%' }}>
        {/* WHY flat purple with the book's ink outline and one paper highlight (round eight review: the glossy
            gradient blob was a different material from the flat-ink world and read as a jelly bean) */}
        <svg width={W} height={H} viewBox={`-3 -3 ${W + 6} ${H + 6}`} style={{ overflow: 'visible' }}>
          <path d={`M ${W / 2} 0 C ${W * 0.64} ${H * 0.29} ${W} ${H * 0.5} ${W} ${H * 0.71} A ${W / 2} ${H * 0.29} 0 0 1 0 ${H * 0.71} C 0 ${H * 0.5} ${W * 0.36} ${H * 0.29} ${W / 2} 0 Z`}
            fill={P.purple} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
          <path d={`M ${W * 0.28} ${H * 0.62} Q ${W * 0.3} ${H * 0.5} ${W * 0.4} ${H * 0.42}`} stroke="#FFFBF4" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.85} />
        </svg>
      </div>
    </>
  );
};
export const HOWEVER: Spread = { id: 'however', Art: HoweverArt, Pop: HoweverPop };

// ======================= kept for the other half =======================
// WHY kept: line 8 (take1c-spreads-b.tsx) still draws its callback with this until it moves to <Puppets>, which
// draws line 1's exact layout. It is the round-three six-hat composition and is no longer used by lines 1-4.
const HANDFUL_FIGS = [{ x: 190, c: 82 }, { x: 380, c: 108 }, { x: 570, c: 90 }, { x: 950, c: 116 }, { x: 1140, c: 94 }, { x: 1330, c: 78 }];
const LEDGE_Y = 490, FIG_S = 1.1;
const BAR_Y = LEDGE_Y - 112 * FIG_S;
const HANDFUL_PEOPLE = HANDFUL_FIGS.flatMap((f) => [f.x - 46, f.x + 46]);
const OLD_HAIR = ['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as const;
export const Strings: React.FC<{
  figA: number; peopleA: number; stringsA: number; beats: number[]; colourful?: boolean; snapAt?: number; fadeFrom?: number; fadeTo?: number;
  figAt?: number[]; figEnter?: Enter[]; peopleEnter?: Enter; ledgeAt?: [number, number];
}> = ({ figA, peopleA, stringsA, beats, colourful, snapAt, fadeFrom, fadeTo, figAt, figEnter, peopleEnter = 'draw' }) => {
  const t = useT();
  const y = yankAt(t, beats);
  const fade = fadeFrom == null ? 0 : lin(t, fadeFrom, fadeTo ?? fadeFrom + 1, EASE_IN_OUT);
  const hairCol = [P.ink, P.purple, P.ink, P.pink, P.ink, P.violet];
  const by = BAR_Y - y * 14;
  return (
    <>
      <g opacity={1 - fade * 0.75}>
        {[[90, 690], [830, 1430]].map(([x0, x1], i) => <path key={i} d={`M ${x0 - 10} ${LEDGE_Y} L ${x1 + 10} ${LEDGE_Y}`} stroke={P.ink} strokeWidth={4.5} strokeLinecap="round" />)}
      </g>
      {HANDFUL_FIGS.map((f, j) => (
        <g key={j}>
          <HatFigure x={f.x} y={LEDGE_Y} s={FIG_S} crown={f.c} a={figAt ? figAt[j] : figA + j * 0.14} b={(figAt ? figAt[j] : figA + j * 0.14) + 1.0} pose="hold" fade={fade} bob={-y * 4} enter={figEnter?.[j] ?? 'draw'} />
          <g opacity={1 - fade * 0.72}><Ink d={`M ${f.x - 54} ${by} L ${f.x + 54} ${by} M ${f.x} ${by - 12} L ${f.x} ${by + 12}`} a={stringsA - 0.4 + j * 0.05} b={stringsA - 0.1 + j * 0.05} w={5} /></g>
        </g>
      ))}
      {HANDFUL_PEOPLE.map((px, i) => {
        const f = HANDFUL_FIGS[Math.floor(i / 2)];
        const hx = f.x + (i % 2 ? 50 : -50), hy = by;
        const ty = 834 - y * 12;
        const snapT = snapAt == null ? -1 : snapAt + 0.05 + i * 0.09;
        const free = snapT >= 0 && t >= snapT;
        return (
          <g key={i}>
            {!free && <Ink d={`M ${hx} ${hy} L ${px} ${ty}`} a={stringsA + i * 0.035} b={stringsA + i * 0.035 + 0.4} w={1.8} c={P.ink} o={0.8} />}
            <Person x={px} y={880} s={0.92} a={peopleA + i * 0.05} b={peopleA + i * 0.05 + 0.6} pose={free ? 'bothUp' : 'hold'} device={colourful ? 'none' : 'phone'} enter={peopleEnter}
              hair={OLD_HAIR[i % OLD_HAIR.length]} mood={colourful ? 'smile' : 'flat'} bob={-y * 12} body={colourful ? HEROES.maya.colour : P.wash} hairColor={colourful ? hairCol[i % hairCol.length] : undefined} />
          </g>
        );
      })}
    </>
  );
};
