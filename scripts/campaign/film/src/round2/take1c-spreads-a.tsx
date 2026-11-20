// Take 1C, chapters i–iv: the world as it is (plum ink on cream, almost no colour) up to the first drop of purple.
// WHY each picture: it must say what the narrator is saying at that moment to someone seeing it for one second.
//  i   "a small handful of corporations have dictated…"  five tall hats working everyone's devices on strings
//  ii  "what your computers could do / cost / your data"   a padlock, a price that keeps getting re-inked, your
//                                                            keepsakes flowing into a top hat
//  iii "we all just accepted it"                            a queue signing a scroll that never ends
//      "subscribe to everything and own nothing"            tags on every thing in a room, then the things lifted away
//      "privacy… the cost of convenience"                   a giant magnifying glass held over someone on their phone
//  iv  "however, recently… something truly wonderful"       a blank page, one drop of purple ink, and it blooms
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT } from '../brand';
import { Appear, blob, circle, WashBg, HatFigure, Ink, jolt, KeepsakeIcon, Keepsake, Laptop, lin, P, Padlock, Person, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { Folio, Heading, Headline, Sheet } from './take1c-page';
import { Q, TURN, TURN_DUR } from './take1c-time';
import type { Spread } from './take1c-book';

const land = (turnAt: number) => turnAt + TURN_DUR;

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
}> = ({ figA, peopleA, stringsA, beats, colourful, snapAt, fadeFrom, fadeTo }) => {
  const t = useT();
  const y = yankAt(t, beats);
  const fade = fadeFrom == null ? 0 : lin(t, fadeFrom, fadeTo ?? fadeFrom + 1, EASE_IN_OUT);
  const bodies = [P.violet, P.pink, P.sun, P.purple, P.lilac, P.violetSoft, P.pinkSoft, P.purple, P.sunSoft, P.violet, P.pink, P.lilac];
  const hairCol = [P.ink, P.purple, P.ink, P.pink, P.ink, P.violet];
  const by = BAR_Y - y * 14;
  return (
    <>
      {/* the two ledges the handful stand on, high above everyone else */}
      <g opacity={1 - fade * 0.75}>
        {[[90, 690], [830, 1430]].map(([x0, x1], i) => (
          <g key={i}>
            <Shape d={`M ${x0} ${LEDGE_Y} L ${x1} ${LEDGE_Y} L ${x1 - 8} ${LEDGE_Y + 34} L ${x0 + 8} ${LEDGE_Y + 34} Z`} a={figA - 0.2 + i * 0.1} b={figA + 0.45 + i * 0.1} fill="url(#c-hatch)" w={3} />
            <Ink d={`M ${x0 - 10} ${LEDGE_Y} L ${x1 + 10} ${LEDGE_Y}`} a={figA - 0.25 + i * 0.1} b={figA + 0.35 + i * 0.1} w={4.5} />
          </g>
        ))}
      </g>
      {HANDFUL_FIGS.map((f, j) => (
        <g key={j}>
          <HatFigure x={f.x} y={LEDGE_Y} s={FIG_S} crown={f.c} a={figA + j * 0.14} b={figA + j * 0.14 + 1.0} pose="hold" fade={fade} bob={-y * 4} />
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
            {snapT < 0 || t < snapT ? <Ink d={`M ${hx} ${hy} L ${px} ${ty}`} a={stringsA + i * 0.035} b={stringsA + i * 0.035 + 0.4} w={1.8} c={P.ink} o={0.8} />
              : <g opacity={(1 - sp * 0.85) * 0.8}><path d={top} stroke={P.ink} strokeWidth={1.8} fill="none" /><path d={bot} stroke={P.ink} strokeWidth={1.8} fill="none" /></g>}
            <Person x={px} y={880} s={0.92} a={peopleA + i * 0.05} b={peopleA + i * 0.05 + 0.6} pose={free ? 'bothUp' : 'hold'} device={colourful ? 'none' : 'phone'}
              hair={HAIR[i % HAIR.length]} mood={colourful ? 'smile' : 'flat'} bob={-y * 12 + hop} body={colourful ? bodies[i] : P.wash} hairColor={colourful ? hairCol[i % hairCol.length] : undefined} />
            {/* in the callback everyone already holds a quill: that is what cuts the strings */}
            {colourful && <g transform={`translate(${px + (free ? 21 : 8)} ${880 + hop - (free ? 86 : 38)})`}><Quill x={0} y={0} s={0.3} r={free ? 20 : 0} /></g>}
          </g>
        );
      })}
    </>
  );
};

const HandfulArt: React.FC = () => (
  <>
    <Heading n="i" title="the handful" />
    <Folio left={2} />
    <Sheet>
      {/* soft washes: a dusky sky behind the handful, the ground beneath everyone else */}
      <WashBg x={390} y={330} r={200} sx={1.5} a={1.0} seed={2} />
      <WashBg x={1130} y={330} r={200} sx={1.5} a={0.8} seed={5} />
      <WashBg x={385} y={850} r={62} sx={4.6} a={Q.corporations1 - 0.4} seed={8} />
      <WashBg x={1135} y={850} r={62} sx={4.6} a={Q.corporations1 - 0.3} seed={9} />
      <Strings figA={0.3} peopleA={Q.corporations1 - 0.1} stringsA={Q.dictated} beats={[Q.interact, Q.interact + 0.66, Q.technology1]} />
    </Sheet>
  </>
);
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
      <Heading n="ii" title="the rules" />
      <Folio left={4} />
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L + 0.6} seed={3} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={L + 0.9} seed={6} />
        <WashBg x={1130} y={620} r={290} a={L + 1.1} seed={11} />
        {/* A: what your computers could do: a padlock snapped onto the laptop, the key kept by a hat */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 270 420 L 470 420 M 290 420 L 290 500 M 450 420 L 450 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <g transform={`translate(${shake} 0)`}><Laptop x={370} y={418} s={1.15} a={L} b={L + 0.4} /></g>
        <Person x={208} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose="write" mood={t > Q.computersDo + 0.3 ? 'o' : 'smile'} hair="bun" />
        <HatFigure x={592} y={500} s={1} crown={92} a={L - 0.2} b={L + 0.7} pose="key" flip />
        <Appear a={L + 0.6}><g transform={`translate(521 382) rotate(${-20 + Math.sin(t * 4) * 6})`}>
          <path d="M 0 0 L 0 26 M 0 18 L 7 18 M 0 24 L 6 24" stroke={P.ink} strokeWidth={3} fill="none" strokeLinecap="round" />
          <circle cx={0} cy={-5} r={6} fill="none" stroke={P.ink} strokeWidth={3} /></g></Appear>
        <Padlock x={370} y={398} s={1.25} at={Q.computersDo} />

        {/* B: what it would cost: a price on a string, re-inked higher each time she says it */}
        <Ink d="M 140 860 L 660 860" a={L + 0.1} b={L + 0.5} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={L + 0.1} b={L + 0.45} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={L + 0.2} b={L + 0.6} />
        <PriceTag x={281} y={728} s={0.72} at={Q.cost - 0.12} swing={-14}
          prices={[{ v: '4.99/mo', at: Q.cost - 0.05 }, { v: '9.99/mo', at: Q.costWord }, { v: '14.99/mo', at: Q.costWord + 0.36 }, { v: '19.99/mo', at: Q.costWord + 0.72 }]} />
        <Person x={480} y={860} s={1.12} a={L + 0.25} b={L + 0.8} mood={t > Q.costWord + 0.3 ? 'o' : 'flat'} hair="curly" flip />

        {/* C: what happened with your personal data: your things stream out of your phone into a top hat */}
        <Ink d="M 820 880 L 1450 880" a={L + 0.2} b={L + 0.6} w={2} c={P.inkSoft} />
        <Person x={905} y={880} s={1.35} a={L + 0.3} b={L + 0.9} pose="hold" device="phone" hair="long" mood={t > Q.personalData ? 'o' : 'smile'} />
        <HatFigure x={1330} y={880} s={1.5} crown={120} a={L + 0.2} b={L + 1.2} pose="sides" />
        <Appear a={L + 1.1}><ellipse cx={1330} cy={880 - (212 + 120) * 1.5 + 2} rx={27} ry={6} fill={P.inkSoft} stroke={P.paper} strokeWidth={1.5} /></Appear>
        <Ink d="M 905 790 Q 1050 230 1330 372" a={Q.data - 0.05} b={Q.data + 0.5} w={2} c={P.inkSoft} o={0.6} />
        <Stream from={Q.data + 0.2} p0={[905, 790]} p1={[1050, 230]} p2={[1330, 380]} count={11} gap={0.19} />
      </Sheet>
    </>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · the bargain =======================
const QUEUE = [130, 262, 394, 526, 658, 790, 922, 1054];
const SIGN = 'M -24 6 c 6 -16 11 -16 9 -1 c -2 13 7 11 11 -4 c 4 -11 9 -7 7 2 c -1 7 6 5 11 -3 l 8 3';
const BargainArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.bargain) - 0.3;
  const unroll = lin(t, L - 0.2, Q.accepted - 0.25, EASE_IN_OUT);
  const left = 1250 - unroll * 1170;
  const shuffle = lin(t, L, Q.accepted - 0.2, EASE_IN_OUT);
  return (
    <>
      <Heading n="iii" title="the bargain" />
      <Folio left={6} />
      <Sheet>
        <WashBg x={700} y={640} r={130} sx={5} a={L + 0.5} seed={4} />
        <Ink d="M 70 700 L 1450 700" a={L - 0.3} b={L + 0.3} w={2} c={P.inkSoft} />
        {/* the terms: a scroll that runs off the lectern and across both pages */}
        {unroll > 0 && (
          <g>
            <path d={`M ${left} 806 L 1262 806 L 1262 812 L ${left} 812 Z`} fill={P.ink} opacity={0.12} />
            <path d={`M ${left} 718 ${Array.from({ length: 24 }, (_, k) => { const x = left + ((1262 - left) * (k + 1)) / 24; return `L ${x.toFixed(1)} ${(718 + Math.sin(k * 1.3) * 2.5).toFixed(1)}`; }).join(' ')} L 1262 800 ${Array.from({ length: 24 }, (_, k) => { const x = 1262 - ((1262 - left) * (k + 1)) / 24; return `L ${x.toFixed(1)} ${(800 + Math.sin(k * 1.7 + 1) * 2.5).toFixed(1)}`; }).join(' ')} Z`}
              fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
            <text x={1236} y={746} textAnchor="end" fontFamily={DMSANS} fontWeight={700} fontSize={18} fill={P.ink} letterSpacing="0.06em">terms</text>
            {Array.from({ length: 30 }).map((_, i) => {
              const x = 1160 - i * 39;
              if (x < left + 20) return null;
              return <path key={i} d={`M ${x} 734 l -24 0 M ${x} 746 l -30 0 M ${x} 758 l -18 0`} stroke={P.inkSoft} strokeWidth={2} opacity={0.5} strokeLinecap="round" />;
            })}
            <ellipse cx={left} cy={759} rx={14} ry={42} fill={P.paper} stroke={P.ink} strokeWidth={3} />
            <ellipse cx={left} cy={759} rx={5} ry={16} fill="none" stroke={P.ink} strokeWidth={2} />
          </g>
        )}
        <HatFigure x={1330} y={700} s={1.35} crown={100} a={L - 0.3} b={L + 0.6} pose="rub" bob={jolt(t, Q.accepted + 0.6, 6, 0.8)} />
        {/* the lectern, drawn over the hat's coat */}
        <Shape d="M 1252 700 L 1408 700 L 1392 530 L 1268 530 Z" a={L - 0.2} b={L + 0.3} fill={P.paper} w={3} />
        <Shape d="M 1240 534 L 1420 516 L 1420 500 L 1240 518 Z" a={L - 0.1} b={L + 0.35} fill={P.inkSoft} w={3} />
        <Ink d="M 1262 528 Q 1250 600 1262 718" a={L} b={L + 0.3} w={3} />
        {QUEUE.map((x, i) => {
          const signAt = Q.accepted + (QUEUE.length - 1 - i) * 0.075;
          const nod = jolt(t, signAt, 9, 0.5);
          const walk = Math.abs(Math.sin((t - L) * 7 + i)) * 4 * (1 - shuffle) * (t > L ? 1 : 0);
          return (
            <g key={i}>
              <Person x={x + shuffle * 22} y={700} s={1} a={L - 0.15 + i * 0.05} b={L + 0.45 + i * 0.05} hair={HAIR[i % HAIR.length]} pose={t > signAt - 0.1 && t < signAt + 0.5 ? 'write' : 'down'}
                mood="flat" tilt={nod} bob={-walk} />
              <g transform={`translate(${x + shuffle * 22 + 18} 772)`}><Ink d={SIGN} a={signAt} b={signAt + 0.35} w={2.4} /></g>
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
    <g transform={`translate(${x} ${y - lift}) rotate(${sway - 8})`} opacity={Math.min(1, p * 2)}>
      <path d="M 0 0 L 0 18" stroke={P.ink} strokeWidth={1.6} />
      <path d={`M -44 18 L 44 18 L 44 46 L -44 46 Z`} fill={P.paper} stroke={P.ink} strokeWidth={2.4} transform={`scale(${0.6 + 0.4 * p})`} />
      <text x={0} y={39} textAnchor="middle" fontSize={17} fontWeight={700} fill={P.ink} fontFamily={DMSANS} letterSpacing="-0.02em">{text}</text>
    </g>
  );
};

type Thing = { id: string; d: string; fill: string; tag: [number, number]; price: string; top: [number, number] };
const THINGS: Thing[] = [
  { id: 'bike', d: `${circle(132, 776, 42)} ${circle(246, 776, 42)} M 132 776 L 172 730 L 230 730 L 246 776 M 172 730 L 196 776 L 132 776 M 230 730 L 222 712 M 196 776 L 166 716 L 150 716`, fill: 'none', tag: [196, 700], price: '14.99/mo', top: [196, 700] },
  { id: 'picture', d: 'M 305 200 L 415 200 L 415 284 L 305 284 Z M 318 270 L 345 238 L 365 258 L 380 244 L 402 270', fill: P.paper, tag: [360, 296], price: '3.99/mo', top: [360, 200] },
  { id: 'books', d: 'M 432 420 L 432 362 L 452 362 L 452 420 M 454 420 L 454 352 L 476 352 L 476 420 M 478 420 L 482 368 L 500 370 L 497 420 M 502 420 L 502 358 L 522 358 L 522 420', fill: P.wash, tag: [478, 432], price: '2.99/mo', top: [478, 352] },
  { id: 'camera', d: 'M 572 420 L 572 384 L 588 384 L 594 374 L 616 374 L 622 384 L 640 384 L 640 420 Z M 594 402 a 12 12 0 1 0 24 0 a 12 12 0 1 0 -24 0', fill: P.wash, tag: [606, 432], price: '9.99/mo', top: [606, 374] },
  { id: 'record', d: 'M 528 720 L 652 720 L 652 696 L 528 696 Z M 548 696 a 42 9 0 1 0 84 0 a 42 9 0 1 0 -84 0 M 640 690 L 616 698', fill: P.wash, tag: [590, 734], price: '11.99/mo', top: [590, 686] },
];

const NothingArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.nothing) - 0.3;
  const glassIn = lin(t, Q.privacy - 0.2, Q.privacy + 0.55);
  const gx = (1 - glassIn) * 520, gy = (1 - glassIn) * -160;
  const lens = { x: 1080 + gx, y: 470 + gy, r: 88 };
  const shrug = t > Q.convenience - 0.1;
  const viewer = (k: number) => <Person x={1080} y={560} s={1.25} a={L + 0.3} b={L + 0.9} pose={shrug ? 'wave' : 'hold'} device="phone" hair="cap" mood="smile" key={k} />;
  return (
    <>
      <Folio left={8} />
      <Sheet>
        <WashBg x={385} y={540} r={300} a={L + 0.5} seed={12} />
        <WashBg x={1100} y={470} r={170} sx={1.3} a={L + 0.8} seed={13} />
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
        {viewer(0)}
        {glassIn > 0 && (
          <g>
            <clipPath id="c-lens"><circle cx={lens.x} cy={lens.y} r={lens.r} /></clipPath>
            <g clipPath="url(#c-lens)">
              <rect x={lens.x - lens.r} y={lens.y - lens.r} width={lens.r * 2} height={lens.r * 2} fill={P.paper} />
              <g transform={`translate(${lens.x} ${lens.y}) scale(1.75) translate(${-lens.x} ${-lens.y})`}>{viewer(1)}</g>
              <circle cx={lens.x} cy={lens.y} r={lens.r} fill="rgba(194,170,214,0.18)" />
            </g>
            <path d={`M ${lens.x - 52} ${lens.y - 48} A 70 70 0 0 1 ${lens.x + 18} ${lens.y - 70}`} stroke="#fff" strokeWidth={6} fill="none" opacity={0.7} strokeLinecap="round" />
            <circle cx={lens.x} cy={lens.y} r={lens.r} fill="none" stroke={P.ink} strokeWidth={9} />
            <path d={`M ${lens.x + 62} ${lens.y - 62} L ${lens.x + 150} ${lens.y - 150}`} stroke={P.ink} strokeWidth={16} strokeLinecap="round" />
            {/* the sleeve of whoever is holding it, reaching in from the edge of the book */}
            <path d={`M ${lens.x + 150} ${lens.y - 150} L 1540 ${180 + gy}`} stroke={P.ink} strokeWidth={34} strokeLinecap="round" />
            <circle cx={lens.x + 150} cy={lens.y - 150} r={15} fill={P.paper} stroke={P.ink} strokeWidth={3} />
          </g>
        )}
      </Sheet>
      <Headline text="own *nothing." at={Q.own} out={Math.max(Q.own + 1.75, Q.privacy + 0.45)} />
    </>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
export const DROP_LAND = Q.recently + 0.72;
const HoweverArt: React.FC = () => {
  const t = useT();
  const g = lin(t, DROP_LAND, DROP_LAND + 0.55);
  const slow = lin(t, DROP_LAND + 0.55, Q.happened + 1.0, EASE_IN_OUT);
  const r = 18 + g * 74 + slow * 30;
  // "wonderful": the ink grows like something alive, curling out into leaves and two small flowers
  const vines = [
    'M 1180 356 C 1226 316 1252 266 1238 222 C 1228 190 1262 168 1290 184',
    'M 1102 358 C 1062 316 1074 258 1042 230 C 1018 210 990 220 986 246',
    'M 1200 426 C 1262 446 1312 426 1330 384 C 1340 360 1366 352 1382 366',
    'M 1086 444 C 1032 474 996 462 972 430',
    'M 1150 470 C 1160 520 1130 552 1150 590',
  ];
  const leaves: [number, number, number, string][] = [[1238, 252, -40, P.violet], [1056, 262, 210, P.pink], [1312, 404, 20, P.violet], [1004, 452, 160, P.pink], [1146, 540, 80, P.violet], [1210, 302, 30, P.pink]];
  return (
    <>
      <Heading n="iv" title="however" />
      <Folio left={10} />
      <Sheet rough={false}>
        {t >= DROP_LAND && (
          <g>
            {/* ink soaking into paper: layered translucent pools, each wandering a little, with a darker rim */}
            <g filter="url(#c-bleed)">
              <path d={blob(1140, 400, r * 1.28, 3, 0.18, 18)} fill={P.purple} opacity={0.13} />
              <path d={blob(1146, 396, r * 1.08, 5, 0.16, 18)} fill={P.purple} opacity={0.32} />
              <path d={blob(1138, 404, r, 7, 0.14, 18)} fill={P.purple} opacity={0.62} />
              <path d={blob(1132, 392, r * 0.62, 2, 0.2, 14)} fill="#7A3A8C" opacity={0.35} />
              <path d={blob(1138, 404, r, 7, 0.14, 18)} fill="none" stroke="#6E2F80" strokeWidth={4} opacity={0.4} />
            </g>
            {t < DROP_LAND + 0.45 && <circle cx={1140} cy={400} r={20 + lin(t, DROP_LAND, DROP_LAND + 0.45) * 130} fill="none" stroke={P.purple} strokeWidth={3} opacity={0.55 * (1 - lin(t, DROP_LAND, DROP_LAND + 0.45))} />}
            {vines.map((d, k) => <Ink key={k} d={d} a={Q.wonderful - 0.15 + k * 0.1} b={Q.wonderful + 0.8 + k * 0.1} w={3.4} c={P.purple} />)}
            {leaves.map(([x, y, rot, col], k) => {
              const p = lin(t, Q.wonderful + 0.45 + k * 0.1, Q.wonderful + 0.95 + k * 0.1);
              return p > 0 ? (
                <g key={k} transform={`translate(${x} ${y}) rotate(${rot}) scale(${p})`}>
                  <path d="M 0 0 C 10 -15 28 -15 34 0 C 28 15 10 15 0 0 Z" fill={col} stroke={P.ink} strokeWidth={2} />
                  <path d="M 3 0 L 28 0" stroke={P.ink} strokeWidth={1.4} opacity={0.6} />
                </g>
              ) : null;
            })}
            {[[1290, 184, P.pink], [986, 246, P.sun], [1382, 366, P.violet]].map(([x, y, col], k) => {
              const p = lin(t, Q.happened + 0.1 + k * 0.12, Q.happened + 0.55 + k * 0.12);
              return p > 0 ? (
                <g key={k} transform={`translate(${x} ${y}) scale(${p})`}>
                  {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-11} rx={7} ry={11} transform={`rotate(${a})`} fill={col as string} stroke={P.ink} strokeWidth={1.8} />)}
                  <circle cx={0} cy={0} r={5} fill={P.sunSoft} stroke={P.ink} strokeWidth={1.6} />
                </g>
              ) : null;
            })}
          </g>
        )}
      </Sheet>
      <Headline text="something / *wonderful / happened." at={Q.something} out={TURN.treasure - 0.05} />
    </>
  );
};
/** The falling drop is a standing piece above the page: it has height, so it gets a real shadow. */
const HoweverPop: React.FC = () => {
  const t = useT();
  const a = DROP_LAND - 0.62;
  const u = (t - a) / 0.62;
  if (u <= 0 || u >= 1) return null;
  const z = 900 * (1 - u * u);
  return (
    <>
      <div style={{ position: 'absolute', left: 1140 - 30 + z * 0.1, top: 400 - 12 + z * 0.06, width: 60, height: 24, borderRadius: '50%',
        background: 'rgba(40,14,48,0.5)', filter: `blur(${4 + z * 0.02}px)`, opacity: 0.25 + 0.6 * u, transform: 'translateZ(0.5px)' }} />
      <div style={{ position: 'absolute', left: 1140 - 14, top: 400 - 40, width: 28, height: 40, transform: `translateZ(${z}px) rotateX(-70deg)`, transformOrigin: '50% 100%' }}>
        <div style={{ width: 28, height: 40, background: 'radial-gradient(circle at 38% 62%, #C88AD8 0%, #9750AA 45%, #6E3482 100%)', borderRadius: '50% 50% 50% 50% / 64% 64% 40% 40%',
          clipPath: 'path("M 14 0 C 18 12 28 20 28 28 A 14 12 0 0 1 0 28 C 0 20 10 12 14 0 Z")' }} />
      </div>
    </>
  );
};
export const HOWEVER: Spread = { id: 'however', Art: HoweverArt, Pop: HoweverPop };

