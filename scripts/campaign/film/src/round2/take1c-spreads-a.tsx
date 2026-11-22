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
import { EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
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
/** The small idle life every hat has, so none of them ever stands still like a cut-out: a breath, the coat-tails
 *  swinging a little, a slow weight shift. `j` de-syncs them. */
const idle = (t: number, j: number) => ({
  bob: Math.sin(t * 2.2 + j * 1.9) * 1.6,
  sway: Math.sin(t * 1.6 + j * 2.4) * 2.6,
  lean: Math.sin(t * 0.85 + j * 1.3) * 1.3,
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

// ======================= i · the handful =======================
// The layout line 8 repeats exactly (exported so the other half draws the same picture in colour).
export const PUPPETS = {
  tower: { x: 280, y: 404, w: 340, n: 6 },
  // drawn back to front: the wide hat stands a step behind the others
  hats: [
    { name: 'wide' as HatName, x: 168, y: 398, hero: 'theo' as HeroName },
    { name: 'tall' as HatName, x: 286, y: 404, hero: 'maya' as HeroName },
    { name: 'short' as HatName, x: 398, y: 404, hero: 'june' as HeroName },
  ],
  heroes: {
    maya: { x: 1150, y: 930, s: 2.6 },    // right-hand foreground, at her laptop
    june: { x: 556, y: 866, s: 1.9 },     // middle left, hugging her keepsake box
    theo: { x: 960, y: 612, s: 1.3 },     // further back (higher up the page), beside his record player
  },
  // the faint crowd: loose clumps that get smaller toward the gutter (x, feet y, size)
  crowd: [
    [92, 944, 1.12], [170, 958, 1.18], [246, 938, 1.08],
    [356, 870, 0.86], [412, 882, 0.9], [466, 864, 0.82],
    [650, 772, 0.62], [694, 780, 0.64], [730, 766, 0.58],
    [800, 640, 0.5], [836, 648, 0.52],
    [1384, 700, 0.7], [1436, 712, 0.72], [1480, 694, 0.66],
  ] as [number, number, number][],
};
const HAIRS: Hair[] = ['tuft', 'bob', 'cap', 'bald', 'tuft', 'bob', 'cap'];

/** Where a hat's hands meet its crossbar (its middle), given its idle state. */
const barAt = (h: typeof PUPPETS.hats[number], bob: number, lift: number): [number, number] => {
  const H = HATS[h.name];
  return [h.x, h.y - 112 * H.s + bob - lift];
};

type PuppetsProps = {
  /** heroes' colour (0 pale wash, 1 their own colour) and the crowd's */
  bloom?: number; crowdBloom?: number;
  /** strings hang slack until `tautAt`, and are pulled tight over 0.35 s */
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
  const yank = yankAt(t, beats);
  const taut = lin(t, tautAt, tautAt + 0.35, EASE_OUT);
  const hatState = PUPPETS.hats.map((h, j) => {
    const H = HATS[h.name];
    const id = idle(t, j);
    const la = landAt[j];
    // a hat that lands falls the last 280 units in 0.22 s, then squashes and settles
    const fall = (1 - lin(t, la - 0.16, la, EASE_IN)) * -420;
    const squash = jolt(t, la, 0.16, 0.42);
    const seen = t >= la - 0.16;
    const twitch = twitchAt != null && j === 1 ? jolt(t, twitchAt, 1, 0.7) : 0;
    const lift = yank * 18 + twitch * 6;
    const [bx, by] = barAt(h, id.bob + fall, lift);
    return { h, H, id, fall, squash, seen, twitch, bx, by, landed: la };
  });
  const heroPt = (who: HeroName): [number, number] => {
    const p = PUPPETS.heroes[who];
    return [p.x, p.y - 104 * p.s];
  };
  // WHY the faint crowd hangs off the far end of the nearest bar: every string in the picture leads back to the
  // three men, which is the whole point of "dictated", without a second set of controls
  const crowdBar = (cx: number) => (cx < 300 ? 0 : cx < 760 ? 2 : 1);
  return (
    <>
      {/* the faint crowd and their strings: pencil-weight, behind everything */}
      {PUPPETS.crowd.map(([cx, cy, cs], i) => {
        const hs = hatState[crowdBar(cx)];
        const dist = Math.abs(cx - 760) / 760;
        // the yank ripples back through the crowd: the further from the heroes, the later
        const ry = yankAt(t, beats.map((b) => b + 0.14 + (1 - dist) * 0.22 + (i % 3) * 0.04));
        const cut = cutAt?.(3 + i);
        const isCut = cut != null && t >= cut;
        const head: [number, number] = [cx, cy - 104 * cs - ry * 10 * cs];
        const col = crowdBloom > 0 ? mixHex(P.paper, ['#CDBBA7', '#9FAABB', '#BFA6AC', '#A9B39C', '#D6C6A8'][i % 5], crowdBloom) : P.paper;
        return (
          <g key={i}>
            {!isCut && t >= hs.landed && <path d={stringPath([hs.bx + (cx > hs.bx ? 1 : -1) * (14 + (i * 13) % 40), hs.by], head, 40 * (1 - taut))} stroke={P.ink} strokeWidth={1.1} fill="none" opacity={0.2 * (1 - f)} />}
            <g opacity={0.34 + 0.4 * crowdBloom}>
              <Person x={cx} y={cy} s={cs} a={DONE} hair={HAIRS[i % HAIRS.length]} pose={ry > 0.35 ? 'bothUp' : 'down'} mood="flat" bob={-ry * 10 * cs} body={col} flip={i % 2 === 1} />
            </g>
          </g>
        );
      })}

      {/* the tower of windows */}
      <g opacity={1 - f}>
        <Tower x={PUPPETS.tower.x} y={PUPPETS.tower.y} w={PUPPETS.tower.w} n={PUPPETS.tower.n} />
      </g>
      {/* the three hats and their crossbars */}
      {hatState.map(({ h, H, id, fall, squash, seen, twitch, bx, by }, j) => seen && (
        <g key={h.name} opacity={1 - f}>
          <g transform={`translate(${h.x} ${h.y}) scale(${1 + squash} ${1 - squash}) translate(${-h.x} ${-h.y})`}>
            <HatFigure x={h.x} y={h.y + fall} s={H.s} crown={H.crown} girth={H.girth} a={DONE} pose="hold" bob={id.bob - yank * 6}
              sway={id.sway + squash * 30} lean={id.lean} />
          </g>
          <Crossbar x={bx} y={by} w={104} r={twitch * 9 + Math.sin(t * 1.3 + j) * 1.5} />
        </g>
      ))}

      {/* the heroes, their things and their strings */}
      {(['theo', 'june', 'maya'] as HeroName[]).map((who) => {
        const j = PUPPETS.hats.findIndex((h) => h.hero === who);
        const hs = hatState[j];
        const p = PUPPETS.heroes[who];
        const cut = cutAt?.(j);
        const isCut = cut != null && t >= cut;
        const lift = isCut ? 0 : yank * 16;
        const [hx, hy] = heroPt(who);
        const end: [number, number] = [hx, hy - lift];
        const start: [number, number] = [hs.bx + (end[0] > hs.bx ? 52 : -52), hs.by];
        const up = !isCut && yank > 0.3;
        return (
          <g key={who}>
            {who === 'maya' && (
              <>
                {/* her little table and laptop */}
                <path d="M 1232 826 L 1446 826 M 1248 826 L 1248 930 M 1430 826 L 1430 930" stroke={P.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" />
                <Laptop x={1338} y={824} s={1.8} a={DONE} />
              </>
            )}
            {who === 'theo' && (
              <>
                <Cabinet x={1092} y={612} s={0.85} />
                <RecordPlayer x={1092} y={612 - CABINET_TOP * 0.85} s={0.85} spin={t * 200} />
              </>
            )}
            <Hero who={who} x={p.x} y={p.y} s={p.s} a={DONE} bloom={bloom} bob={-lift} mood={bloom > 0.5 ? 'smile' : up ? 'o' : 'flat'}
              pose={up ? 'bothUp' : who === 'maya' ? 'write' : who === 'june' ? 'hold' : 'write'} />
            {who === 'june' && <KeepsakeBox x={p.x} y={p.y - 38 * p.s - lift + (up ? -6 : 0)} s={0.6} lid={1} inside={5} />}
            {!isCut && t >= hs.landed && <path d={stringPath(start, end, 70 * (1 - taut), hs.twitch * 26 * (who === 'maya' ? 1 : 0))} stroke={P.ink} strokeWidth={1.8} fill="none" opacity={0.75 * (1 - f * 0.6)} />}
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
    <Puppets landAt={[Q.handful, DONE, Q.handful + 0.38]} tautAt={Q.dictated} beats={[Q.interact, Q.technology1 + 0.1]} twitchAt={Q.decade} />
  </Sheet>
);
export const HANDFUL: Spread = { id: 'handful', Art: HandfulArt };

// ======================= ii · what they decided =======================
/** Keepsakes travelling along a curve into the top hat (line 2) or back out of it (line 7). */
export const Stream: React.FC<{ from: number; p0: [number, number]; p1: [number, number]; p2: [number, number]; count?: number; gap?: number; dur?: number; s?: number; reverse?: boolean; until?: number }> = ({ from, p0, p1, p2, count = 5, gap = 0.2, dur = 1.25, s = 1, reverse, until = 1e9 }) => {
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
        // WHY June's own five keepsakes, in order: the same five fly back along the same curve in line 7
        return <KeepsakeIcon key={i} kind={KEEPSAKES[(reverse ? i : count - 1 - i) % KEEPSAKES.length] as Keepsake} x={x} y={y} s={s * shrink * 1.05} r={Math.sin(i * 2.1 + t * 3) * 14} />;
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
const BUCKET = { x: BUCKET_HAND[0] - 26 * JS, y: BUCKET_HAND[1] - 6, r: -78 };
const STREAM_P0: [number, number] = [JL.x, JL.y - 42 * JL.s - 52];
const STREAM_P1: [number, number] = [(JL.x + BUCKET.x) / 2, JL.y - 470];
const STREAM_P2: [number, number] = [BUCKET.x, BUCKET.y];

const RulesArt: React.FC = () => {
  const t = useT();
  // --- Maya: the padlock, set down on her laptop by the tall hat on "computers"
  const lockFrom = hatPt(ML.hat.x, ML.hat.y, ML.hat.s, true, 0, 73, -119);
  const lockTo: [number, number] = [ML.laptop.x, ML.laptop.y - 26 * ML.laptop.s];
  const place = lin(t, Q.computersDo - 0.25, Q.computersDo + 0.15, EASE_IN_OUT);
  const clampAt = Q.computersDo + 0.2;
  const clamped = t >= clampAt;
  const lx = lockFrom[0] + (lockTo[0] - lockFrom[0]) * place, ly = lockFrom[1] + (lockTo[1] - lockFrom[1]) * place - Math.sin(place * Math.PI) * 40;
  const thunk = jolt(t, clampAt, 5, 0.4);
  // he reaches out with it, lets go, and then dusts off his gloves
  const dusting = t > clampAt + 0.15;
  const tallId = idle(t, 1);
  // --- Theo: the wide hat; the tag is re-inked higher twice
  const wideId = idle(t, 0);
  const rewrite1 = Q.cost + 0.14, rewrite2 = Q.costWord + 0.12;
  // --- June: the short hat takes his hat off to use as a bucket (off camera, while we are on Theo)
  const shortId = idle(t, 2);
  const bucket = t > Q.cost;
  const tip = lin(t, Q.data - 0.05, Q.data + 0.35, EASE_IN_OUT);
  const flyFrom = Q.data + 0.02, gap = 0.16, dur = Q.personalData + 0.05 - flyFrom - gap * 4;
  const left = KEEPSAKES.length - Math.max(0, Math.min(5, Math.floor((t - flyFrom) / gap) + 1));
  const sad = t > Q.personalData - 0.2;
  return (
    <Sheet>
      {/* Maya, her table and laptop, and the tall hat */}
      <path d={`M 60 ${ML.y} L 720 ${ML.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <path d={`M ${ML.table[0]} ${ML.table[2]} L ${ML.table[1]} ${ML.table[2]} M ${ML.table[0] + 14} ${ML.table[2]} L ${ML.table[0] + 14} ${ML.y} M ${ML.table[1] - 14} ${ML.table[2]} L ${ML.table[1] - 14} ${ML.y}`}
        stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <g transform={`translate(${thunk} ${Math.abs(thunk) * 0.4})`}><Laptop x={ML.laptop.x} y={ML.laptop.y} s={ML.laptop.s} a={DONE} /></g>
      <HeroString x={ML.x} y={ML.y} s={ML.s} lean={70} />
      <Hero who="maya" x={ML.x} y={ML.y} s={ML.s} a={DONE} pose="write" mood={t > clampAt + 0.05 ? 'o' : 'smile'} tilt={jolt(t, clampAt, 4, 0.5)} />
      <HatFigure x={ML.hat.x} y={ML.hat.y} s={HATS.tall.s * ML.hat.s} crown={HATS.tall.crown} girth={HATS.tall.girth} a={DONE} flip
        pose={dusting ? 'rub' : 'key'} bob={tallId.bob + (dusting ? Math.sin(t * 26) * 1.5 : 0)} sway={tallId.sway} lean={tallId.lean + place * -6 * (1 - lin(t, clampAt, clampAt + 0.4))} />
      {/* the padlock: carried in his hand, swung onto the screen, and it clamps shut there on its own */}
      <g transform={`translate(${lx} ${ly}) scale(${clamped ? 1 + jolt(t, clampAt, 0.12, 0.3) : 1})`}>
        <Padlock x={0} y={0} s={1.3} at={DONE} openAt={clamped ? undefined : DONE} />
      </g>
      {/* WHY a key would be cut: it is never used again; the quill opens this padlock in line 7 */}

      {/* Theo, his record player on its cabinet, its tag, and the wide hat */}
      <path d={`M 60 ${TL.y} L 720 ${TL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <Cabinet x={TL.cabinet.x} y={TL.cabinet.y} s={TL.cabinet.s} />
      <RecordPlayer x={TL.cabinet.x} y={TL.cabinet.y - CABINET_TOP * TL.cabinet.s} s={TL.cabinet.s} spin={t * 200} />
      <PriceTag x={TL.cabinet.x + 58} y={TL.cabinet.y - CABINET_TOP * TL.cabinet.s - 6} s={0.82} at={DONE} swing={jolt(t, rewrite1, 9, 0.8) + jolt(t, rewrite2, 12, 0.9) - 4}
        prices={[{ v: '4.99/mo', at: DONE }, { v: '9.99/mo', at: rewrite1 }, { v: '14.99/mo', at: rewrite2 }]} />
      <HeroString x={TL.x} y={TL.y} s={TL.s} lean={60} o={0.4} />
      <Hero who="theo" x={TL.x} y={TL.y} s={TL.s} a={DONE} pose="write" mood={t > rewrite2 + 0.1 ? 'o' : 'smile'} tilt={jolt(t, rewrite2 + 0.05, 3, 0.6)} />
      <HatFigure x={TL.hat.x} y={TL.hat.y} s={HATS.wide.s * TL.hat.s} crown={HATS.wide.crown} girth={HATS.wide.girth} a={DONE} flip pose="rub"
        bob={wideId.bob + jolt(t, rewrite1, 4, 0.5) + jolt(t, rewrite2, 4, 0.5)} sway={wideId.sway} lean={wideId.lean} />

      {/* June, her open keepsake box, and the short hat */}
      <path d={`M 800 ${JL.y} L 1470 ${JL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <HeroString x={JL.x} y={JL.y} s={JL.s} lean={-60} />
      <Hero who="june" x={JL.x} y={JL.y} s={JL.s} a={DONE} pose="hold" mood={sad ? 'flat' : 'smile'} />
      <KeepsakeBox x={JL.x} y={JL.y - 34 * JL.s} s={1.0} lid={1} inside={t < flyFrom ? 5 : left} />
      <HatFigure x={JL.hat.x} y={JL.hat.y} s={HATS.short.s * JL.hat.s} crown={HATS.short.crown} girth={HATS.short.girth} a={DONE} flip
        pose={bucket ? 'key' : 'sides'} noHat={bucket} bob={shortId.bob} sway={shortId.sway} lean={shortId.lean - tip * 5} />
      {bucket && <TopHat x={BUCKET.x} y={BUCKET.y} s={JS} crown={HATS.short.crown} r={BUCKET.r - 40 * (1 - tip) + Math.sin(t * 2) * 2} />}
      <Stream from={flyFrom} p0={STREAM_P0} p1={STREAM_P1} p2={STREAM_P2} count={5} gap={gap} dur={dur} s={1.35} />
    </Sheet>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · we all accepted it =======================
// WHY the queue runs back in depth (round six): the old single row on one ground line was the same picture as
// line 1; now Maya, Theo and June lead it, large, and the faint crowd shrinks away toward the hat.
const Q_AT = (u: number) => ({ x: 1290 - 1130 * u, y: 552 + 380 * u, s: 0.55 + 2.25 * u });
const QUEUE: { u: number; who?: HeroName }[] = [
  { u: 0.06 }, { u: 0.12 }, { u: 0.18 }, { u: 0.25 }, { u: 0.32 }, { u: 0.4 }, { u: 0.49 }, { u: 0.58 },
  { u: 0.69, who: 'june' }, { u: 0.82, who: 'theo' }, { u: 0.97, who: 'maya' },
];
/** The scroll's strip on the floor at depth u: its top and bottom edge (it widens toward the camera). */
const stripAt = (u: number) => { const p = Q_AT(u); return { x: p.x - 30 * p.s, top: p.y + 10 + 14 * u, bot: p.y + 34 + 126 * u }; };
const BargainArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.bargain);
  // the scroll unrolls from the hat's hand toward the camera through "we all..."
  const unroll = lin(t, L - 0.1, Q.weAll2 + 0.2, EASE_IN_OUT);
  const head = -0.04 + unroll * 1.08;   // how far toward the camera (in u) the scroll has reached
  const hat = { x: 1380, y: 548, s: 1.15 };
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
      <path d="M 40 985 Q 700 720 1480 548" stroke={P.inkSoft} strokeWidth={2} fill="none" opacity={0.5} />
      {unroll > 0 && (
        <g>
          {/* WHY shaded: paper on paper, the scroll vanished into the page */}
          <path d={poly} fill={P.paperShade} stroke={P.ink} strokeWidth={2.8} strokeLinejoin="round" />
          {/* the leading curl, still unrolling */}
          <ellipse cx={headE.x} cy={(headE.top + headE.bot) / 2} rx={6 + 10 * Math.max(0, head)} ry={(headE.bot - headE.top) / 2} fill={P.paperShade} stroke={P.ink} strokeWidth={2.6} />
        </g>
      )}
      <HatFigure x={hat.x} y={hat.y} s={HATS.wide.s * hat.s} crown={HATS.wide.crown} girth={HATS.wide.girth} a={DONE} pose="pat"
        bob={id.bob + Math.sin(t * 9) * (t > Q.accepted ? 1.2 : 0)} sway={id.sway} lean={id.lean} />
      {/* the roll in his hand */}
      <g transform={`translate(${hand[0]} ${hand[1]}) rotate(${-8 + unroll * 360 * 4})`}><ellipse cx={0} cy={0} rx={9} ry={9} fill={P.paperShade} stroke={P.ink} strokeWidth={2.4} /><path d="M -5 0 L 5 0" stroke={P.ink} strokeWidth={2} /></g>
      {QUEUE.map(({ u, who }, i) => {
        const p = Q_AT(u);
        // the ticks run from the back of the queue to the front; the heroes' land last and closest
        const tickAt = Q.accepted - 0.05 + i * 0.075;
        const nod = jolt(t, tickAt, 8, 0.55);
        const box = stripAt(u);
        const bs = 16 + 40 * u;
        const bx = p.x - bs * 0.5, by = (box.top + box.bot) / 2 - bs / 2;
        const boxed = head >= u;
        const shuffle = Math.sin(t * 1.4 + i * 1.7) * 1.2;
        const person = who
          ? <><HeroString x={p.x + shuffle} y={p.y} s={p.s} lean={-90 + i * 4} /><Hero who={who} x={p.x + shuffle} y={p.y} s={p.s} a={DONE} pose={t > tickAt - 0.1 && t < tickAt + 0.4 ? 'write' : 'down'} mood="flat" tilt={nod} /></>
          : <g opacity={0.36}><Person x={p.x + shuffle} y={p.y} s={p.s} a={DONE} hair={HAIRS[i % HAIRS.length]} body={P.paper} pose="down" mood="flat" tilt={nod} flip={i % 2 === 1} /></g>;
        return (
          <g key={i}>
            {person}
            {boxed && (
              <g opacity={who ? 1 : 0.5}>
                <rect x={bx} y={by} width={bs} height={bs} rx={bs * 0.14} fill={P.paper} stroke={P.ink} strokeWidth={1.4 + 1.8 * u} />
                <Ink d={`M ${bx + bs * 0.2} ${by + bs * 0.52} L ${bx + bs * 0.42} ${by + bs * 0.76} L ${bx + bs * 0.86} ${by + bs * 0.12}`} a={tickAt} b={tickAt + 0.16} w={2 + 3 * u} />
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
      <path d="M 0 0 L 0 16" stroke={P.ink} strokeWidth={1.8} />
      <path d="M -50 16 L 50 16 L 50 50 L -50 50 Z" fill={P.paper} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
      <text x={0} y={41} textAnchor="middle" fontSize={21} fontWeight={800} fill={P.ink} fontFamily="DM Sans" letterSpacing="-0.02em">{text}</text>
    </g>
  );
};

// Theo's room (left page): his armchair, his record player on its cabinet, one shelf of records. Nothing else.
const ROOM = { floor: 820, chair: { x: 236, seat: 740 }, cab: { x: 520 }, shelf: { x: 400, y: 470 }, bar: { x: 470, y: 132 } };
const PLAYER_TOP = ROOM.floor - CABINET_TOP * 1.05;
// June's corner (right page, top: the headline needs the clean paper below)
const JUNE = { x: 1040, seat: 560, s: 1.5 };
const SHORT = { x: 1352, y: 640, s: HATS.short.s * 1.45 };

const NothingArt: React.FC = () => {
  const t = useT();
  // --- own nothing: the bar's strings tighten and the record player and records rise to dangle under it
  // WHY lowered on "own", in the wide: the bar must be seen arriving, not just be there after the cut
  const barIn = lin(t, Q.own - 0.18, Q.own + 0.22, EASE_OUT);
  const barY = ROOM.bar.y - (1 - barIn) * 260;
  const rise = lin(t, Q.own + 0.2, Q.own + 0.9, EASE_IN_OUT);
  const swing = Math.sin((t - Q.own) * 3.2) * 4 * lin(t, Q.own + 0.4, Q.own + 0.8) * Math.exp(-Math.max(0, t - Q.own - 0.8) * 0.6);
  const playerY = PLAYER_TOP - rise * (PLAYER_TOP - 330);
  const recordsY = ROOM.shelf.y - rise * (ROOM.shelf.y - 252);
  const recordsX = ROOM.shelf.x - rise * 120;
  const reach = t > Q.own + 0.3 && t < Q.nothing + 0.5;
  // --- privacy: the short hat leans in from the edge and swings a giant glass over June; on "convenience" he
  // slips a shiny phone into her hand and she smiles down at it
  const id = idle(t, 2);
  const leanIn = -10 - lin(t, Q.privacy - 0.2, Q.costOf, EASE_IN_OUT) * 8 + id.lean;
  const sh = (lx: number, ly: number) => hatPt(SHORT.x, SHORT.y, SHORT.s, true, leanIn, lx, ly);
  const shoulderR = sh(20, -168), shoulderL = sh(-20, -168);
  const face: [number, number] = [JUNE.x, JUNE.seat - 85 * JUNE.s];
  const swingIn = lin(t, Q.privacy - 0.1, Q.costOf, EASE_IN_OUT);
  // WHY held up by his shoulder at rest: lower down, the lens covered his coat and read as a drum
  const rest: [number, number] = [shoulderR[0] - 96, shoulderR[1] - 50];
  const lens = { x: rest[0] + (face[0] + 6 - rest[0]) * swingIn, y: rest[1] + (face[1] - rest[1]) * swingIn - Math.sin(swingIn * Math.PI) * 70, r: 66 };
  const handle: [number, number] = [lens.x + 60, lens.y + 62];
  const give = lin(t, Q.convenience - 0.3, Q.convenience + 0.1, EASE_IN_OUT);
  const herHand: [number, number] = [JUNE.x + 10, JUNE.seat - 44 * JUNE.s];
  const phoneRest: [number, number] = [shoulderL[0] + 10, shoulderL[1] + 120];
  const phone: [number, number] = [phoneRest[0] + (herHand[0] - phoneRest[0]) * give, phoneRest[1] + (herHand[1] - phoneRest[1]) * give - Math.sin(give * Math.PI) * 30];
  const has = give >= 1;
  const juneMood = has ? 'smile' : swingIn > 0.6 ? 'o' : 'flat';
  const june = (k: number) => (
    <g key={k}>
      <Hero who="june" x={JUNE.x} y={JUNE.seat} s={JUNE.s} a={DONE} sit pose={has ? 'hold' : 'down'} mood={juneMood} tilt={has ? 6 : 0} />
      <KeepsakeBox x={JUNE.x + 22} y={JUNE.seat - 4} s={0.66} lid={0.7} inside={0} />
    </g>
  );
  const arm = (a: [number, number], b: [number, number]) => `M ${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2 + 10} ${(a[1] + b[1]) / 2 + 26} ${b[0]} ${b[1]}`;
  return (
    <Sheet>
      {/* ---- Theo's room ---- */}
      <path d={`M 70 ${ROOM.floor} L 690 ${ROOM.floor}`} stroke={P.ink} strokeWidth={2.4} />
      {/* the shelf on the wall, and where the records stood */}
      <path d={`M ${ROOM.shelf.x - 140} ${ROOM.shelf.y} L ${ROOM.shelf.x + 140} ${ROOM.shelf.y} M ${ROOM.shelf.x - 120} ${ROOM.shelf.y} L ${ROOM.shelf.x - 120} ${ROOM.shelf.y + 22} M ${ROOM.shelf.x + 120} ${ROOM.shelf.y} L ${ROOM.shelf.x + 120} ${ROOM.shelf.y + 22}`} stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" />
      {rise > 0.2 && <g opacity={lin(t, Q.own + 0.2, Q.own + 0.6)}><Records x={ROOM.shelf.x} y={ROOM.shelf.y} s={1.1} dashed /></g>}
      <Cabinet x={ROOM.cab.x} y={ROOM.floor} s={1.05} />
      {rise > 0.2 && <g opacity={lin(t, Q.own + 0.2, Q.own + 0.6)}><RecordPlayer x={ROOM.cab.x} y={PLAYER_TOP} s={1.05} dashed /></g>}
      {/* the armchair, with Theo in it */}
      <path d={`M ${ROOM.chair.x - 80} ${ROOM.floor} L ${ROOM.chair.x - 80} ${ROOM.chair.seat - 70} Q ${ROOM.chair.x - 80} ${ROOM.chair.seat - 112} ${ROOM.chair.x - 36} ${ROOM.chair.seat - 112} L ${ROOM.chair.x + 36} ${ROOM.chair.seat - 112} Q ${ROOM.chair.x + 80} ${ROOM.chair.seat - 112} ${ROOM.chair.x + 80} ${ROOM.chair.seat - 70} L ${ROOM.chair.x + 80} ${ROOM.floor} Z`}
        fill={P.wash} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <HeroString x={ROOM.chair.x - 6} y={ROOM.chair.seat} s={1.95} lean={80} />
      <Hero who="theo" x={ROOM.chair.x - 6} y={ROOM.chair.seat} s={1.95} a={DONE} sit pose={reach ? 'up' : 'down'} mood={t > Q.own + 0.2 ? 'o' : 'flat'} />
      <path d={`M ${ROOM.chair.x - 100} ${ROOM.floor} L ${ROOM.chair.x - 100} ${ROOM.chair.seat - 30} Q ${ROOM.chair.x - 100} ${ROOM.chair.seat - 48} ${ROOM.chair.x - 80} ${ROOM.chair.seat - 48} L ${ROOM.chair.x - 66} ${ROOM.chair.seat - 48} L ${ROOM.chair.x - 66} ${ROOM.floor} Z M ${ROOM.chair.x + 66} ${ROOM.floor} L ${ROOM.chair.x + 66} ${ROOM.chair.seat - 48} L ${ROOM.chair.x + 80} ${ROOM.chair.seat - 48} Q ${ROOM.chair.x + 100} ${ROOM.chair.seat - 48} ${ROOM.chair.x + 100} ${ROOM.chair.seat - 30} L ${ROOM.chair.x + 100} ${ROOM.floor} Z`}
        fill={P.wash} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <MoTag x={ROOM.chair.x + 92} y={ROOM.chair.seat - 46} at={Q.everything1 + 0.05} text="6.99/mo" r={10} />
      {/* the wide hat's crossbar, lowered in from above the page, with his gloved hands on it */}
      {barIn > 0 && (
        <g>
          {/* WHY both arms reach in from the upper right: straight and parallel they read as legs dangling from the page
              top, splayed as a V they read as a coat hanger; both leaning one way reads as a man just off the page */}
          <path d={`M ${ROOM.bar.x - 50} ${barY - 4} Q ${ROOM.bar.x + 10} ${barY - 150} ${ROOM.bar.x + 170} ${barY - 340} M ${ROOM.bar.x + 50} ${barY - 4} Q ${ROOM.bar.x + 120} ${barY - 130} ${ROOM.bar.x + 270} ${barY - 320}`} stroke={P.ink} strokeWidth={11} fill="none" strokeLinecap="round" />
          <Crossbar x={ROOM.bar.x} y={barY} w={240} r={swing * 0.4} />
          <circle cx={ROOM.bar.x - 50} cy={barY - 2} r={13} fill={P.paper} stroke={P.ink} strokeWidth={3} />
          <circle cx={ROOM.bar.x + 50} cy={barY - 2} r={13} fill={P.paper} stroke={P.ink} strokeWidth={3} />
          {/* strings to the record player and the records: slack, then tight on "own" */}
          <path d={stringPath([ROOM.bar.x + 110, barY], [ROOM.cab.x + 30, playerY - 40], 40 * (1 - lin(t, Q.own + 0.1, Q.own + 0.22)))} stroke={P.ink} strokeWidth={1.8} fill="none" />
          <path d={stringPath([ROOM.bar.x - 110, barY], [recordsX - 10, recordsY - 54], 40 * (1 - lin(t, Q.own + 0.1, Q.own + 0.22)))} stroke={P.ink} strokeWidth={1.8} fill="none" />
        </g>
      )}
      {/* the record player and its tag (still on from line 2), and the records with theirs */}
      <g transform={`translate(${ROOM.cab.x} ${playerY}) rotate(${swing}) translate(${-ROOM.cab.x} ${-playerY})`}>
        <RecordPlayer x={ROOM.cab.x} y={playerY} s={1.05} spin={rise > 0 ? 0 : t * 200} />
        <PriceTag x={ROOM.cab.x + 50} y={playerY - 4} s={0.62} at={DONE} swing={-6 + swing * 2} prices={[{ v: '14.99/mo', at: DONE }]} />
      </g>
      <g transform={`translate(${recordsX} ${recordsY}) rotate(${-swing}) translate(${-recordsX} ${-recordsY})`}>
        <Records x={recordsX} y={recordsY} s={1.1} />
        <MoTag x={recordsX + 70} y={recordsY - 50} at={Q.subscribe + 0.05} text="2.99/mo" r={12} />
      </g>

      {/* ---- June's corner ---- */}
      <path d={`M 860 ${JUNE.seat + 70} L 1460 ${JUNE.seat + 70}`} stroke={P.inkSoft} strokeWidth={2} />
      {/* the stool */}
      <path d={`M ${JUNE.x - 40} ${JUNE.seat} L ${JUNE.x + 40} ${JUNE.seat} M ${JUNE.x - 30} ${JUNE.seat} L ${JUNE.x - 40} ${JUNE.seat + 70} M ${JUNE.x + 30} ${JUNE.seat} L ${JUNE.x + 40} ${JUNE.seat + 70}`} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
      <HeroString x={JUNE.x} y={JUNE.seat} s={JUNE.s} lean={-70} />
      {june(0)}
      {/* the short hat, all of him in view, leaning in from the page edge */}
      <HatFigure x={SHORT.x} y={SHORT.y} s={SHORT.s} crown={HATS.short.crown} girth={HATS.short.girth} a={DONE} flip pose="bare" bob={id.bob} sway={id.sway} lean={leanIn} />
      <path d={arm(shoulderR, handle)} stroke={P.ink} strokeWidth={8 * SHORT.s} fill="none" strokeLinecap="round" />
      <path d={arm(shoulderL, phone)} stroke={P.ink} strokeWidth={8 * SHORT.s} fill="none" strokeLinecap="round" />
      {/* the phone he is holding out: small, shiny, the one bright thing he offers */}
      <g transform={`translate(${phone[0]} ${phone[1]}) rotate(${-10 + give * 10})`}>
        <rect x={-11} y={-18} width={22} height={34} rx={4} fill={P.paper} stroke={P.ink} strokeWidth={3} />
        <path d="M -6 -12 L 4 -12 M -6 -6 L 1 -6" stroke={P.inkSoft} strokeWidth={2} strokeLinecap="round" />
        <path d="M 5 -16 L -9 10" stroke="#fff" strokeWidth={3} opacity={0.8} strokeLinecap="round" />
      </g>
      <circle cx={phone[0]} cy={phone[1] + 18} r={7} fill={P.paper} stroke={P.ink} strokeWidth={2.4} opacity={has ? 0 : 1} />
      {/* the glass: through it, June's face, huge */}
      <clipPath id="c-lens6"><circle cx={lens.x} cy={lens.y} r={lens.r} /></clipPath>
      <g clipPath="url(#c-lens6)">
        <rect x={lens.x - lens.r} y={lens.y - lens.r} width={lens.r * 2} height={lens.r * 2} fill={P.paper} />
        <g transform={`translate(${lens.x} ${lens.y}) scale(1.8) translate(${-lens.x} ${-lens.y})`}>{june(1)}</g>
        <circle cx={lens.x} cy={lens.y} r={lens.r} fill="rgba(194,170,214,0.16)" />
      </g>
      <path d={`M ${lens.x - 48} ${lens.y - 44} A 64 64 0 0 1 ${lens.x + 16} ${lens.y - 64}`} stroke="#fff" strokeWidth={6} fill="none" opacity={0.7} strokeLinecap="round" />
      <circle cx={lens.x} cy={lens.y} r={lens.r} fill="none" stroke={P.ink} strokeWidth={9} />
      <path d={`M ${lens.x + 46} ${lens.y + 46} L ${handle[0] + 14} ${handle[1] + 14}`} stroke={P.ink} strokeWidth={15} strokeLinecap="round" />
      <circle cx={handle[0]} cy={handle[1]} r={11} fill={P.paper} stroke={P.ink} strokeWidth={3} />
    </Sheet>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
// WHY a lone inkwell: one drop of purple, the first colour in the film, falls through the whole of "recently..."
// and lands in an empty inkwell as the word ends. The inkwell is the hats' own (line 5 reveals it), so the
// wonderful thing is born out of their world; the quill rises out of it only once, on "artificial".
export const DROP_LAND = Q.recentlyEnd - 0.02;
const DROP_FROM = Q.recently + 0.05;
const WELL = { x: 470, y: 730, s: 2.7 };
// WHY on the left page: the headline lands on the right page at this moment, and must sit on clean paper
const DROP = { x: WELL.x, y: WELL.y - INKWELL_MOUTH * WELL.s };
const HoweverArt: React.FC = () => {
  const t = useT();
  const filled = lin(t, DROP_LAND, DROP_LAND + 0.25);
  const glow = lin(t, Q.wonderful - 0.1, Q.wonderful + 0.6) * (0.75 + 0.25 * Math.sin((t - Q.wonderful) * 2.4));
  const ripple = (at: number) => {
    const p = lin(t, at, at + 0.9, EASE_OUT);
    if (p <= 0 || p >= 1) return null;
    // WHY inside the mouth only: a ring spreading over the paper read as a little orb; ink ripples on its surface
    return <ellipse cx={DROP.x} cy={DROP.y} rx={4 + p * 38} ry={(4 + p * 38) * 0.24} fill="none" stroke="#fff" strokeWidth={2.4 - 1.6 * p} opacity={0.75 * (1 - p)} />;
  };
  const splash = lin(t, DROP_LAND, DROP_LAND + 0.3);
  return (
    <Sheet rough={false}>
      <Inkwell x={WELL.x} y={WELL.y} s={WELL.s} fill={filled} glow={glow} />
      {ripple(DROP_LAND)}
      {ripple(Q.happened)}
      {/* the drop's little crown of a splash as it goes in, gone in a quarter second */}
      {splash > 0 && splash < 1 && <path d={`M ${DROP.x - 8} ${DROP.y} q -4 ${-14 * Math.sin(splash * Math.PI)} -10 ${-18 * Math.sin(splash * Math.PI)} M ${DROP.x + 8} ${DROP.y} q 4 ${-14 * Math.sin(splash * Math.PI)} 10 ${-18 * Math.sin(splash * Math.PI)}`}
        stroke={P.purple} strokeWidth={3} strokeLinecap="round" fill="none" opacity={1 - splash} />}
    </Sheet>
  );
};
/** The falling drop is a standing piece above the page: it has height, so it gets a real shadow.
 *  It falls the whole length of "recently...": slow at the top, quickening, landing as the word ends. */
const HoweverPop: React.FC = () => {
  const t = useT();
  const u = (t - DROP_FROM) / (DROP_LAND - DROP_FROM);
  if (u <= 0 || u >= 1) return null;
  // WHY u^2.2: a real drop accelerates; most of its height is lost in the last third
  const z = 700 * (1 - Math.pow(u, 2.2));
  const near = 1 - z / 700;
  const seen = Math.min(1, u / 0.12);
  return (
    <>
      <div style={{ position: 'absolute', left: DROP.x - 30, top: DROP.y - 10, width: 60, height: 20, borderRadius: '50%',
        background: 'rgba(40,14,48,0.5)', filter: `blur(${3 + (1 - near) * 12}px)`, opacity: 0.1 + 0.5 * near, transform: `translateZ(0.5px) scale(${1.9 - 0.9 * near})` }} />
      <div style={{ position: 'absolute', left: DROP.x - 18, top: DROP.y - 52, width: 36, height: 52, transform: `translateZ(${z}px) rotateX(-70deg)`, transformOrigin: '50% 100%', opacity: seen }}>
        <div style={{ width: 36, height: 52, background: 'radial-gradient(circle at 38% 62%, #C88AD8 0%, #9750AA 45%, #6E3482 100%)',
          clipPath: 'path("M 18 0 C 23 15 36 26 36 37 A 18 15 0 0 1 0 37 C 0 26 13 15 18 0 Z")' }} />
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
