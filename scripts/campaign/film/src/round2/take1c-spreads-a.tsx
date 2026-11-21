// Take 1C, chapters i–iv: the world as it is (plum ink on cream, almost no colour) up to the first drop of purple.
// WHY each picture: it must say what the narrator is saying at that moment to someone seeing it for one second.
//  i   "a small handful of corporations have dictated…"  five tall hats working everyone's devices on strings
//  ii  "what your computers could do / cost / your data"   a padlock, a price that keeps getting re-inked, your
//                                                            keepsakes flowing into a top hat
//  iii "we all just accepted it"                            a queue signing a scroll that never ends
//      "subscribe to everything and own nothing"            tags on every thing in a room, then the things lifted away
//      "privacy… the cost of convenience"                   a giant magnifying glass held over someone on their phone
//  iv  "however, recently… something truly wonderful"       a blank page; one drop of purple ink falls through
//                                                            "recently...", lands as it ends, and on "wonderful" runs
//                                                            into the nib of a quill: the wonderful thing is the tool
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT } from '../brand';
import { Appear, blob, circle, Enter, HatFigure, Ink, jolt, KeepsakeIcon, Keepsake, Laptop, lin, NEUTRAL, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { Folio, Heading, Sheet } from './take1c-page';
import { land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';
// WHY no watercolour blobs on these spreads: behind every drawing they read as wallpaper; they now appear only
// once colour comes back (chapters vi, vii and ix), where they mean something.

// ======================= i · the handful =======================
// Six of them on two high ledges, one per page; each works two people below on strings.
// WHY vertical strings: a marionette reads instantly; diagonal strings crossing the gutter read as a tangle.
export const HANDFUL_FIGS = [{ x: 190, c: 82 }, { x: 380, c: 108 }, { x: 570, c: 90 }, { x: 950, c: 116 }, { x: 1140, c: 94 }, { x: 1330, c: 78 }];
const LEDGE_Y = 490, FIG_S = 1.1;
const BAR_Y = LEDGE_Y - 112 * FIG_S;
export const HANDFUL_PEOPLE = HANDFUL_FIGS.flatMap((f) => [f.x - 46, f.x + 46]);
const HAIR = ['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as const;

/** How hard the strings are yanked right now: the same jolt for everyone, at the narrator's beats. */
export const yankAt = (t: number, beats: number[]) => beats.reduce((s, b) => s + jolt(t, b, 1, 0.55), 0);

/** The puppet-master composition, shared by chapter i and its callback in chapter vii. */
export const Strings: React.FC<{
  figA: number; peopleA: number; stringsA: number; beats: number[]; colourful?: boolean; snapAt?: number; fadeFrom?: number; fadeTo?: number;
  figAt?: number[]; figEnter?: Enter[]; peopleEnter?: Enter; ledgeAt?: [number, number];
}> = ({ figA, peopleA, stringsA, beats, colourful, snapAt, fadeFrom, fadeTo, figAt, figEnter, peopleEnter = 'draw', ledgeAt }) => {
  const t = useT();
  const y = yankAt(t, beats);
  const fade = fadeFrom == null ? 0 : lin(t, fadeFrom, fadeTo ?? fadeFrom + 1, EASE_IN_OUT);
  const bodies = NEUTRAL;
  const hairCol = [P.ink, P.purple, P.ink, P.pink, P.ink, P.violet];
  const by = BAR_Y - y * 14;
  return (
    <>
      {/* the two ledges the handful stand on, high above everyone else */}
      <g opacity={1 - fade * 0.75}>
        {[[90, 690], [830, 1430]].map(([x0, x1], i) => {
          const la = ledgeAt ? ledgeAt[i] : figA - 0.25 + i * 0.1;
          return (
            <g key={i}>
              <Shape d={`M ${x0} ${LEDGE_Y} L ${x1} ${LEDGE_Y} L ${x1 - 8} ${LEDGE_Y + 34} L ${x0 + 8} ${LEDGE_Y + 34} Z`} a={la + 0.05} b={la + 0.7} fill="url(#c-hatch)" w={3} />
              <Ink d={`M ${x0 - 10} ${LEDGE_Y} L ${x1 + 10} ${LEDGE_Y}`} a={la} b={la + 0.6} w={4.5} />
            </g>
          );
        })}
      </g>
      {HANDFUL_FIGS.map((f, j) => (
        <g key={j}>
          <HatFigure x={f.x} y={LEDGE_Y} s={FIG_S} crown={f.c} a={figAt ? figAt[j] : figA + j * 0.14} b={(figAt ? figAt[j] : figA + j * 0.14) + (figEnter?.[j] === 'wipe' ? 0.5 : 1.0)}
            pose="hold" fade={fade} bob={-y * 4 - Math.abs(Math.sin(t * 1.9 + j * 1.3)) * 1.6} lean={Math.sin(t * 1.5 + j * 2.1) * 1.1} enter={figEnter?.[j] ?? 'draw'} />
          {/* WHY a slow sway and breath on every man (review: one stood rigid for 1.4 s while she talked) */}
          <g opacity={1 - fade * 0.72}>
            {/* the puppet control: a crossbar in both gloved hands */}
            <Ink d={`M ${f.x - 54} ${by} L ${f.x + 54} ${by} M ${f.x} ${by - 12} L ${f.x} ${by + 12}`} a={stringsA - 0.4 + j * 0.05} b={stringsA - 0.1 + j * 0.05} w={5} />
          </g>
        </g>
      ))}
      {HANDFUL_PEOPLE.map((px, i) => {
        const f = HANDFUL_FIGS[Math.floor(i / 2)];
        const hx = f.x + (i % 2 ? 50 : -50), hy = by;
        const ty = 834 - y * 12;
        // a snapped string recoils: the top half springs up to the bar, the bottom half drops to the hand
        const snapT = snapAt == null ? -1 : snapAt + 0.05 + i * 0.09;
        const sp = snapT < 0 ? 0 : lin(t, snapT, snapT + 0.5);
        const mx = hx + (px - hx) * 0.5, my = hy + (ty - hy) * 0.5;
        const top = `M ${hx} ${hy} Q ${mx + 14 * sp} ${(hy + my) / 2} ${mx + (hx - mx) * sp + 10 * Math.sin(sp * Math.PI)} ${my + (hy - my) * sp}`;
        const bot = `M ${mx + (px - mx) * sp - 8 * Math.sin(sp * Math.PI)} ${my + (ty - my) * sp} Q ${mx - 12 * sp} ${(my + ty) / 2} ${px} ${ty}`;
        const free = snapT >= 0 && t >= snapT;
        const hop = free ? -Math.abs(Math.sin((t - snapT) * 7)) * 18 * Math.exp(-(t - snapT) * 1.4) : 0;
        return (
          <g key={i}>
            {snapT < 0 || t < snapT ? <Ink d={`M ${hx} ${hy} L ${px} ${ty}`} a={stringsA + i * 0.035} b={stringsA + i * 0.035 + 0.4} w={3} c={P.ink} o={0.85} />
              : <g opacity={(1 - sp * 0.85) * 0.8}><path d={top} stroke={P.ink} strokeWidth={3} fill="none" /><path d={bot} stroke={P.ink} strokeWidth={3} fill="none" /></g>}
            <Person x={px} y={880} s={0.92} a={peopleA + i * 0.05} b={peopleA + i * 0.05 + 0.6} pose={free ? 'bothUp' : 'hold'} device={colourful ? 'none' : 'phone'} enter={peopleEnter}
              hair={HAIR[i % HAIR.length]} mood={colourful ? 'smile' : 'flat'} bob={-y * 12 + hop} body={colourful ? bodies[i] : P.wash} hairColor={colourful ? hairCol[i % hairCol.length] : undefined} />
            {/* in the callback everyone already holds a quill: that is what cuts the strings */}
            {colourful && <g transform={`translate(${px + (free ? 21 : 8)} ${880 + hop - (free ? 86 : 38)})`}><Quill x={0} y={0} s={0.3} r={free ? 20 : 0} /></g>}
          </g>
        );
      })}
    </>
  );
};

const HandfulArt: React.FC = () => {
  const t = useT();
  // WHY the heading and folio ink in after the pull-back (review BLOCKER): the opening close-up sliced the title
  // at the frame's top edge; now the first shot holds only the hat, the ledge and the desk edge.
  const furniture = lin(t, Q.dictated - 0.45, Q.dictated - 0.05);
  return (
  <>
    <div style={{ opacity: furniture }}><Heading n="i" title="a small handful" /><Folio left={2} /></div>
    <Sheet>
      {/* WHY this order: the film opens close on ONE hat, wiped in whole on "For"; two more land beside it on
          "small handful"; the other three land on "corporations" as the camera pulls back to show the book */}
      <Strings figA={0} peopleA={Q.corporations1 + 0.15} stringsA={Q.dictated} beats={[Q.interact, Q.interact + 0.66, Q.technology1]}
        figAt={[Q.handful - 0.2, -0.12, Q.handful - 0.08, Q.corporations1 + 0.25, Q.corporations1 + 0.35, Q.corporations1 + 0.45]}
        figEnter={['pop', 'wipe', 'pop', 'pop', 'pop', 'pop']} peopleEnter="pop" ledgeAt={[-1.5, Q.corporations1 - 0.3]} />
    </Sheet>
  </>
  );
};
export const HANDFUL: Spread = { id: 'handful', Art: HandfulArt };

// ======================= ii · the rules =======================
/** Keepsakes travelling along a curve into the top hat (chapter ii) or back out of it (chapter vi's panel). */
export const Stream: React.FC<{ from: number; p0: [number, number]; p1: [number, number]; p2: [number, number]; count?: number; gap?: number; dur?: number; s?: number; reverse?: boolean; until?: number }> = ({ from, p0, p1, p2, count = 9, gap = 0.2, dur = 1.25, s = 1, reverse, until = 1e9 }) => {
  const t = useT();
  const kinds: Keepsake[] = ['photo', 'letter', 'heart', 'pin', 'calendar'];
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
        const shrink = 1 - 0.55 * Math.max(0, (pos - 0.75) / 0.25);
        return <KeepsakeIcon key={i} kind={kinds[i % kinds.length]} x={x} y={y} s={s * shrink * 1.05} r={Math.sin(i * 2.1 + t * 3) * 14} />;
      })}
    </>
  );
};

const RulesArt: React.FC = () => {
  const t = useT();
  // WHY 0.35 s early: the ink starts while the page is still falling, so it never lands on an empty page
  const L = land(TURN.rules) - 0.35;
  const shake = jolt(t, Q.computersDo + 0.25, 3, 0.45);
  return (
    <>
      <Heading n="ii" title="what they decided" />
      <Folio left={4} />
      <Sheet>
        {/* A: what your computers could do: a padlock snapped onto the laptop, the key kept by a hat */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 270 420 L 470 420 M 290 420 L 290 500 M 450 420 L 450 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <g transform={`translate(${shake} 0)`}><Laptop x={370} y={418} s={1.15} a={L} b={L + 0.4} /></g>
        <Person x={208} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose="write" mood={t > Q.computersDo + 0.3 ? 'o' : 'smile'} hair="bun" />
        <HatFigure x={592} y={500} s={1} crown={92} a={L - 0.1} b={L + 0.7} pose="key" flip enter="pop" bob={Math.sin(t * 2.2) * 1.5} />
        <Appear a={L + 0.6}><g transform={`translate(521 382) rotate(${-20 + Math.sin(t * 4) * 6})`}>
          <path d="M 0 0 L 0 26 M 0 18 L 7 18 M 0 24 L 6 24" stroke={P.ink} strokeWidth={3} fill="none" strokeLinecap="round" />
          <circle cx={0} cy={-5} r={6} fill="none" stroke={P.ink} strokeWidth={3} /></g></Appear>
        {/* WHY inkSoft: the heavy black block read as pasted on; a softer lock lets the laptop show through */}
        <Padlock x={370} y={398} s={1.25} at={Q.computersDo} color={P.inkSoft} />

        {/* B: what it would cost: a price on a string, re-inked higher each time she says it */}
        <Ink d="M 140 860 L 660 860" a={L + 0.1} b={L + 0.5} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={L + 0.1} b={L + 0.45} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={L + 0.2} b={L + 0.6} />
        {/* WHY 0.85: the camera cuts in on "cost", and at this size the price reads at ~38 px on a 1080p frame */}
        <PriceTag x={392} y={640} s={1.0} at={Q.cost - 0.12} swing={-10}
          prices={[{ v: '4.99/mo', at: Q.cost - 0.05 }, { v: '9.99/mo', at: Q.costWord }, { v: '14.99/mo', at: Q.costWord + 0.36 }, { v: '19.99/mo', at: Q.costWord + 0.72 }]} />
        <Person x={545} y={860} s={1.12} a={L + 0.25} b={L + 0.8} mood={t > Q.costWord + 0.3 ? 'o' : 'flat'} hair="curly" flip />

        {/* C: what happened with your personal data: your things stream out of your phone into a top hat */}
        <Ink d="M 820 880 L 1450 880" a={L + 0.2} b={L + 0.6} w={2} c={P.inkSoft} />
        <Person x={905} y={880} s={1.35} a={L + 0.3} b={L + 0.9} pose="hold" device="phone" hair="long" mood={t > Q.personalData ? 'o' : 'smile'} />
        <HatFigure x={1330} y={880} s={1.5} crown={120} a={L + 0.2} b={L + 1.2} pose="sides" enter="pop" bob={Math.sin(t * 2) * 1.5 + Math.max(0, jolt(t, Q.personalData - 0.1, 5, 0.6)) * -1} />
        <Appear a={L + 1.1}><ellipse cx={1330} cy={880 - (212 + 120) * 1.5 + 2} rx={27} ry={6} fill={P.inkSoft} stroke={P.paper} strokeWidth={1.5} /></Appear>
        {/* WHY fewer, much bigger keepsakes and no hairline arc (review): at 22 px they read as specks on a thread */}
        <Stream from={Q.data + 0.15} p0={[905, 790]} p1={[1050, 230]} p2={[1330, 380]} count={7} gap={0.24} dur={1.2} s={2.1} />
      </Sheet>
    </>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · the bargain =======================
// WHY a terms-of-service scroll with an "I agree" box in front of everyone: the old version was a rolled
// scroll that read as a log at film size. A long page of small print and a box each person ticks is the
// one picture of "we all just accepted it" that nobody needs explaining.
const QUEUE = [130, 262, 394, 526, 658, 790, 922, 1054];
const BAND = { top: 716, h: 96 };
const BargainArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.bargain) - 0.3;
  // the scroll spills off the lectern and unrolls leftwards along the floor, in front of everyone's feet
  const unroll = lin(t, L - 0.2, Q.accepted - 0.45, EASE_IN_OUT);
  const left = 1250 - unroll * 1190;
  const shuffle = lin(t, L, Q.accepted - 0.2, EASE_IN_OUT);
  // a slightly wavering paper edge: right-to-left along the top, left-to-right along the bottom
  const edge = (y: number, k0: number) => Array.from({ length: 30 }, (_, k) => { const x = 1262 - ((1262 - left) * (k + 1)) / 30; return `L ${x.toFixed(1)} ${(y + Math.sin(k * 1.3 + k0) * 2).toFixed(1)}`; }).join(' ');
  const back = (y: number, k0: number) => Array.from({ length: 30 }, (_, k) => { const x = left + ((1262 - left) * (k + 1)) / 30; return `L ${x.toFixed(1)} ${(y + Math.sin(k * 1.7 + k0) * 2).toFixed(1)}`; }).join(' ');
  return (
    <>
      <Heading n="iii" title="what we accepted" />
      <Folio left={6} />
      <Sheet>
        <Ink d="M 70 700 L 1450 700" a={L - 0.3} b={L + 0.3} w={2} c={P.inkSoft} />
        <HatFigure x={1330} y={700} s={1.35} crown={100} a={L - 0.3} b={L + 0.6} pose="rub" bob={jolt(t, Q.accepted + 0.6, 6, 0.8)} />
        {/* the lectern, drawn over the hat's coat */}
        <Shape d="M 1252 700 L 1408 700 L 1392 530 L 1268 530 Z" a={L - 0.2} b={L + 0.3} fill={P.paper} w={3} />
        <Shape d="M 1240 534 L 1420 516 L 1420 500 L 1240 518 Z" a={L - 0.1} b={L + 0.35} fill={P.inkSoft} w={3} />
        {unroll > 0 && (
          <g>
            {/* down the front of the lectern... */}
            <path d="M 1262 520 L 1300 520 L 1300 700 Q 1300 716 1262 716 Z" fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
            {[548, 572, 596, 620, 644, 668].map((y) => <path key={y} d={`M 1270 ${y} l 22 0`} stroke={P.inkSoft} strokeWidth={2} opacity={0.5} />)}
            {/* ...and along the floor */}
            <path d={`M 1262 ${BAND.top} ${edge(BAND.top, 0)} L ${left} ${BAND.top + BAND.h} ${back(BAND.top + BAND.h, 1)} L 1262 ${BAND.top + BAND.h} Z`}
              fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
            {/* the small print: rows of it, all the way along */}
            {Array.from({ length: 34 }).map((_, i) => {
              const x = 1236 - i * 36;
              if (x < left + 12) return null;
              return <path key={i} d={`M ${x} ${BAND.top + 14} l -26 0 M ${x} ${BAND.top + 26} l -30 0 M ${x} ${BAND.top + 80} l -22 0`} stroke={P.inkSoft} strokeWidth={2} opacity={0.42} strokeLinecap="round" />;
            })}
            {/* the curl where it is still unrolling */}
            <path d={`M ${left} ${BAND.top} q -16 4 -14 ${BAND.h / 2} q 2 ${BAND.h / 2 - 4} 14 ${BAND.h / 2}`} fill={P.paper} stroke={P.ink} strokeWidth={3} />
          </g>
        )}
        {/* the title on the lectern, big enough to read at film size */}
        <Appear a={L + 0.1}>
          {/* WHY above the gap beside the lectern: on the lectern itself it ran across the man's face */}
          {/* WHY moved in from x 1236 (review 2026-11-20): in the close-up on "accepted" it was cut off at the
              frame's right edge ("terms of servic"); it now sits inside the close-up with room to spare */}
          <text x={1190} y={482} textAnchor="end" fontFamily={DMSANS} fontWeight={800} fontSize={32} fill={P.ink} letterSpacing="-0.02em">terms of service</text>
          <Ink d="M 1196 474 C 1230 486 1252 500 1266 522" a={L + 0.2} b={L + 0.5} w={2.4} />
        </Appear>
        {QUEUE.map((x, i) => {
          // the tick runs from the front of the queue to the back, as she says "accepted"
          const signAt = Q.accepted - 0.1 + (QUEUE.length - 1 - i) * 0.085;
          const nod = jolt(t, signAt, 9, 0.5);
          const walk = Math.abs(Math.sin((t - L) * 7 + i)) * 4 * (1 - shuffle) * (t > L ? 1 : 0);
          const px = x + shuffle * 22;
          const bx = px - 52;
          const printed = left < bx - 6;
          return (
            <g key={i}>
              <Person x={px} y={700} s={1} a={L - 0.15 + i * 0.05} b={L + 0.45 + i * 0.05} hair={HAIR[i % HAIR.length]} pose={t > signAt - 0.15 && t < signAt + 0.45 ? 'write' : 'down'}
                mood="flat" tilt={nod} bob={-walk} />
              {printed && (
                <g>
                  <rect x={bx} y={BAND.top + 38} width={30} height={30} rx={4} fill={P.paper} stroke={P.ink} strokeWidth={3} />
                  <text x={bx + 40} y={BAND.top + 62} fontFamily={DMSANS} fontWeight={800} fontSize={24} fill={P.ink} letterSpacing="-0.02em">I agree</text>
                  <Ink d={`M ${bx + 6} ${BAND.top + 53} L ${bx + 13} ${BAND.top + 61} L ${bx + 27} ${BAND.top + 41}`} a={signAt} b={signAt + 0.18} w={4.5} />
                </g>
              )}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const BARGAIN: Spread = { id: 'bargain', Art: BargainArt };

// ======================= (iii, cont.) own nothing / privacy =======================
const SmallTag: React.FC<{ x: number; y: number; at: number; text: string; lift: number }> = ({ x, y, at, text, lift }) => {
  const t = useT();
  const p = Math.min(1, Math.max(0, (t - at) / 0.4));
  if (p <= 0) return null;
  const sway = Math.sin((t - at) * 5) * 10 * Math.exp(-(t - at) * 1.5);
  return (
    <g transform={`translate(${x} ${y - lift}) rotate(${sway - 4}) scale(1.3)`} opacity={Math.min(1, p * 2)}>
      {/* WHY this size: the camera cuts in on "subscribe"; the prices must read on a phone */}
      <path d="M 0 0 L 0 18" stroke={P.ink} strokeWidth={1.6} />
      <path d={`M -54 18 L 54 18 L 54 52 L -54 52 Z`} fill={P.paper} stroke={P.ink} strokeWidth={2.4} transform={`scale(${0.6 + 0.4 * p})`} />
      <text x={0} y={43} textAnchor="middle" fontSize={21} fontWeight={800} fill={P.ink} fontFamily={DMSANS} letterSpacing="-0.02em">{text}</text>
    </g>
  );
};

type Thing = { id: string; d: string; fill: string; tag: [number, number]; price: string; top: [number, number] };
const THINGS: Thing[] = [
  { id: 'bike', d: `${circle(132, 776, 42)} ${circle(246, 776, 42)} M 132 776 L 172 730 L 230 730 L 246 776 M 172 730 L 196 776 L 132 776 M 230 730 L 222 712 M 196 776 L 166 716 L 150 716`, fill: 'none', tag: [196, 648], price: '14.99/mo', top: [196, 648] },
  { id: 'picture', d: 'M 305 200 L 415 200 L 415 284 L 305 284 Z M 318 270 L 345 238 L 365 258 L 380 244 L 402 270', fill: P.paper, tag: [360, 296], price: '3.99/mo', top: [360, 200] },
  { id: 'books', d: 'M 432 420 L 432 362 L 452 362 L 452 420 M 454 420 L 454 352 L 476 352 L 476 420 M 478 420 L 482 368 L 500 370 L 497 420 M 502 420 L 502 358 L 522 358 L 522 420', fill: P.wash, tag: [478, 432], price: '2.99/mo', top: [478, 352] },
  { id: 'camera', d: 'M 572 420 L 572 384 L 588 384 L 594 374 L 616 374 L 622 384 L 640 384 L 640 420 Z M 594 402 a 12 12 0 1 0 24 0 a 12 12 0 1 0 -24 0', fill: P.wash, tag: [606, 432], price: '9.99/mo', top: [606, 374] },
  { id: 'record', d: 'M 528 720 L 652 720 L 652 696 L 528 696 Z M 548 696 a 42 9 0 1 0 84 0 a 42 9 0 1 0 -84 0 M 640 690 L 616 698', fill: P.wash, tag: [590, 734], price: '11.99/mo', top: [590, 686] },
];

const NothingArt: React.FC = () => {
  const t = useT();
  // WHY finished before the cut (review 2026-11-20): inking itself in on camera, the room spent its first
  // 0.8 s as stray dashes and half-drawn marks. The film now cuts to a finished room; the tags are what move.
  const L = land(TURN.nothing) - 1.5;
  // WHY the button: "the cost of convenience" is a trade. She presses a big "easy" button at "cost", the glass
  // is already over her, and her smile drains on "convenience": both sides of the bargain in one picture.
  const press = t > Q.costOf - 0.2;
  const pushed = lin(t, Q.costOf, Q.costOf + 0.12) * (1 - lin(t, Q.costOf + 0.35, Q.costOf + 0.5));
  const viewer = (k: number) => <Person x={1080} y={560} s={1.25} a={L + 0.3} b={L + 0.9} pose={press ? 'write' : 'hold'} device={press ? 'none' : 'phone'} hair="cap" mood={t > Q.convenience + 0.1 ? 'flat' : 'smile'} key={k} />;
  const button = (
    <g>
      <Shape d="M 1118 562 L 1184 562 L 1184 528 L 1118 528 Z" a={L + 0.4} b={L + 0.8} fill={P.wash} w={3} />
      <path d={`M 1124 528 Q 1151 ${506 + pushed * 14} 1178 528 Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" opacity={lin(t, L + 0.6, L + 0.9)} />
      <Appear a={L + 0.7}><text x={1151} y={552} textAnchor="middle" fontFamily={DMSANS} fontWeight={800} fontSize={18} fill={P.ink}>easy</text></Appear>
    </g>
  );
  return (
    <>
      <Folio left={8} hideRight />
      <Sheet>
        <path d="M 150 840 Q 380 870 620 840 Q 380 812 150 840 Z" fill={P.paperShade} />
        {/* the room */}
        <Ink d="M 70 820 L 690 820" a={L - 0.3} b={L + 0.2} w={2.4} />
        <Shape d="M 120 205 L 270 205 L 270 380 L 120 380 Z" a={L - 0.2} b={L + 0.3} fill={P.paperShade} w={3} />
        <Ink d="M 195 205 L 195 380 M 120 292 L 270 292 M 104 196 Q 112 300 100 392 M 286 196 Q 278 300 290 392 M 96 196 L 294 196" a={L} b={L + 0.4} w={2.4} />
        <Ink d="M 420 420 L 665 420 M 440 420 L 440 440 M 645 420 L 645 440" a={L} b={L + 0.35} w={3} />
        <Shape d="M 520 820 L 660 820 L 660 722 L 520 722 Z" a={L + 0.05} b={L + 0.4} fill={P.paper} w={3} />
        {/* the armchair and its occupant */}
        <Shape d="M 286 820 L 286 700 Q 286 660 330 660 L 400 660 Q 444 660 444 700 L 444 820 Z" a={L} b={L + 0.4} fill={P.wash} w={3} />
        <Person x={365} y={790} s={1.15} a={L + 0.15} b={L + 0.7} pose="hold" device="phone" hair="tuft" mood={t > Q.nothing + 0.2 ? 'o' : 'smile'} />
        <Shape d="M 270 820 L 270 730 Q 270 716 286 716 L 300 716 L 300 820 Z M 430 820 L 430 716 L 446 716 Q 460 716 460 730 L 460 820 Z" a={L + 0.1} b={L + 0.45} fill={P.wash} w={3} />
        {/* the things: tagged one by one, then lifted off the page */}
        {THINGS.map((th, i) => {
          const tagAt = Q.subscribe + i * 0.24;
          const liftAt = Q.own + i * 0.07;
          const lift = lin(t, liftAt + 0.12, liftAt + 0.95, EASE_IN) * 820;
          const gone = lin(t, liftAt + 0.5, liftAt + 0.9);
          const strP = lin(t, Q.own - 0.28 + i * 0.04, Q.own - 0.05 + i * 0.04);
          return (
            <g key={th.id}>
              {/* where it used to be */}
              {t > liftAt + 0.2 && <path d={th.d} fill="none" stroke={P.ink} strokeWidth={2} strokeDasharray="5 8" opacity={0.42 * lin(t, liftAt + 0.2, liftAt + 0.6)} />}
              <g transform={`translate(0 ${-lift})`} opacity={1 - gone}>
                <Shape d={th.d} a={L + 0.1 + i * 0.06} b={L + 0.6 + i * 0.06} fill={th.fill === 'none' ? undefined : th.fill} w={3} />
                {strP > 0 && <path d={`M ${th.top[0]} ${-40 + lift} L ${th.top[0]} ${th.top[1]}`} stroke={P.ink} strokeWidth={1.8} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - strP} />}
              </g>
              <SmallTag x={th.tag[0]} y={th.tag[1]} at={tagAt} text={th.price} lift={lift} />
            </g>
          );
        })}

        {/* the cost of convenience: a giant magnifying glass held over someone happily on their phone */}
        <Ink d="M 960 562 L 1200 562 M 975 562 L 975 600 M 1185 562 L 1185 600" a={L + 0.2} b={L + 0.6} w={3} />
        {button}
        {viewer(0)}
        {/* WHY the glass is gone (review BLOCKER: a surveillance cliche that never showed anything being taken):
            on "privacy" small pieces of HER (a face, a pin, a heart, a letter) lift off her, smiling as she is,
            and float up out of the page into the hand of a top-hatted man waiting in the corner. The cost is
            paid silently, which is the point. */}
        <Appear a={Q.privacy - 0.35}>
          <HatFigure x={1440} y={330} s={0.95} crown={96} a={-10} b={-9} pose="reach" flip enter="pop" bob={Math.sin(t * 2.3) * 1.5} />
        </Appear>
        <Stream from={Q.privacy + 0.1} p0={[1080, 500]} p1={[1230, 130]} p2={[1335, 150]} count={5} gap={0.3} dur={1.15} s={1.9} />
      </Sheet>
    </>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
// WHY the drop becomes a quill: the wonderful thing is literally the tool the film is about. One drop of purple
// falls through the whole of "recently..." (its shadow gathering on the empty page, so the hush has something
// to wait for), lands as the word ends, and on "wonderful" runs into the nib of a quill that inks itself up.
// WHY no spatter dots or rings (review 2026-11-20): the dots circling the blot read as a little particle orb.
export const DROP_LAND = Q.recentlyEnd - 0.02;
const DROP_FROM = Q.recently + 0.05;
// WHY on the left page: the headline lands on the right page at this moment, and must sit on clean paper
const DROP = { x: 400, y: 640 };
const QS = 3.1;   // the quill's size on this page
const HoweverArt: React.FC = () => {
  const t = useT();
  const g = pop(t, DROP_LAND, 0.4);
  // "wonderful": the drop runs down into a nib, and the feather inks itself up out of it
  const run = lin(t, Q.wonderful - 0.2, Q.wonderful + 0.2);
  const qa = Q.wonderful - 0.05;
  const lift = lin(t, Q.happened, Q.happened + 1.2) * 1;
  // WHY a constant float once it exists (review: the quill froze for ~1 s while she kept talking)
  const bob = Math.sin((t - qa) * 2.4) * 7 * Math.max(0.45, lift);
  return (
    <>
      <Heading n="iv" title="then, quietly" />
      <Folio left={10} hideRight />
      <Sheet rough={false}>
        {/* WHY an inkwell on the empty page (review BLOCKER: ~4 s of blank paper): the hush now has a source for
            the drop and something to wait on. It inks in on "However" and a nib rests on its rim. */}
        <Shape d="M 205 620 L 305 620 L 318 700 Q 318 722 296 722 L 214 722 Q 192 722 192 700 Z" a={Q.however + 0.1} b={Q.however + 0.7} fill={P.wash} w={3} />
        <Ink d="M 224 620 L 224 604 L 286 604 L 286 620" a={Q.however + 0.5} b={Q.however + 0.9} w={3} />
        <Ink d="M 246 604 Q 246 540 300 470 L 324 456" a={Q.recently - 0.3} b={Q.recently + 0.3} w={3} />
        {t >= DROP_LAND && (
          <g>
            {/* where it landed: a soft stain that stays, feathered into the paper */}
            <g filter="url(#c-bleed)">
              <path d={blob(DROP.x, DROP.y, 34 * Math.min(1.06, g), 3, 0.12, 14)} fill={P.purple} opacity={0.16 + 0.1 * (1 - run)} />
            </g>
            {/* one soft ripple as it lands, nothing more */}
            {(() => {
              const p = lin(t, DROP_LAND, DROP_LAND + 0.55);
              return p > 0 && p < 1 ? <ellipse cx={DROP.x} cy={DROP.y} rx={30 + p * 70} ry={(30 + p * 70) * 0.8} fill="none" stroke={P.purple} strokeWidth={3 - 2 * p} opacity={0.4 * (1 - p)} /> : null;
            })()}
            {/* the drop itself, until it runs into the nib */}
            {run < 1 && (
              <g transform={`translate(${DROP.x} ${DROP.y}) scale(${(1 - run * 0.6) * Math.min(1.08, g)} ${(1 + run * 0.5) * Math.min(1.08, g)}) translate(0 ${run * 10})`}>
                <path d={blob(0, 0, 26, 7, 0.08, 14)} fill={P.purple} />
                <ellipse cx={-8} cy={-9} rx={7} ry={4} fill="#fff" opacity={0.35} transform="rotate(-30 -8 -9)" />
              </g>
            )}
            {/* the first stroke the quill writes on "happened", sweeping toward the headline (replaces the stray arc) */}
            <Ink d={`M ${DROP.x} ${DROP.y} C ${DROP.x + 140} ${DROP.y + 40} ${DROP.x + 260} ${DROP.y - 70} ${DROP.x + 380} ${DROP.y - 20}`} a={Q.happened} b={Q.happened + 0.9} w={7} c={P.purple} o={0.8} />
            {/* the quill, nib at the drop */}
            {t > qa && (
              <g transform={`translate(${DROP.x} ${DROP.y - 14 * lift + bob}) rotate(${-14 - 4 * lift}) scale(${QS})`}>
                <g transform={`scale(${Math.min(1.1, pop(t, qa, 0.35))})`}><path d="M 0 0 L 6 -16 L 12 -14 Z" fill={P.ink} /></g>
                <Shape d="M 8 -15 C 18 -60 52 -118 96 -150 C 92 -118 70 -64 14 -12 Z" a={qa + 0.08} b={qa + 0.62} fill={P.purple} w={2.4 / QS * 2.2} />
                <Ink d="M 10 -14 C 34 -56 62 -104 92 -146" a={qa + 0.3} b={qa + 0.75} w={2} />
                <Appear a={qa + 0.6}>
                  <path d="M 40 -62 L 52 -58 M 54 -86 L 66 -84 M 66 -106 L 78 -106 M 30 -58 L 22 -46 M 46 -84 L 36 -74" stroke={P.ink} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
                </Appear>
              </g>
            )}
          </g>
        )}
      </Sheet>
    </>
  );
};
/** The falling drop is a standing piece above the page: it has height, so it gets a real shadow.
 *  It falls the whole length of "recently...": slow at the top, quickening, landing as the word ends. */
const HoweverPop: React.FC = () => {
  const t = useT();
  const u = (t - DROP_FROM) / (DROP_LAND - DROP_FROM);
  if (u <= 0 || u >= 1) return null;
  // WHY u^2.2: a real drop accelerates; most of its height is lost in the last third
  // WHY 700, not higher, and a fade-in: from higher up the perspective threw the drop into the frame's corner,
  // where it read as a stray blob; from here it is seen falling toward its own shadow the whole way
  const z = 700 * (1 - Math.pow(u, 2.2));
  const near = 1 - z / 700;
  const seen = Math.min(1, u / 0.12);
  return (
    <>
      <div style={{ position: 'absolute', left: DROP.x - 40, top: DROP.y - 16, width: 80, height: 32, borderRadius: '50%',
        background: 'rgba(40,14,48,0.5)', filter: `blur(${3 + (1 - near) * 14}px)`, opacity: 0.12 + 0.6 * near, transform: `translateZ(0.5px) scale(${1.9 - 0.9 * near})` }} />
      <div style={{ position: 'absolute', left: DROP.x - 22, top: DROP.y - 64, width: 44, height: 64, transform: `translateZ(${z}px) rotateX(-70deg) scale(1.5)`, transformOrigin: '50% 100%', opacity: seen }}>
        <div style={{ width: 44, height: 64, background: 'radial-gradient(circle at 38% 62%, #C88AD8 0%, #9750AA 45%, #6E3482 100%)',
          clipPath: 'path("M 22 0 C 28 18 44 32 44 45 A 22 19 0 0 1 0 45 C 0 32 16 18 22 0 Z")' }} />
      </div>
    </>
  );
};
export const HOWEVER: Spread = { id: 'however', Art: HoweverArt, Pop: HoweverPop };
