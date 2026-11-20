// Take 1C, chapters v–ix: the handful build a machine that writes, it escapes as a quill that makes little apps
// for whoever asks, the three things they decided are undone one by one, the strings snap, and the book ends on
// two friends passing what they made back and forth.
//  v    "blinded by their own hubris"                 their hats slide down over their eyes; they totter
//       "created a new kind of technology: AI"        cogs, a box and an inkwell ink themselves onto a workbench;
//                                                      the purple drop falls in, a quill drops into the ink, and
//                                                      on "intelligence" it lifts out and writes "hello" by itself
//       "a great treasure: shareholder value"         hats back up, their eyes turn to coins; the machine drops
//                                                      one coin into a waistcoat pocket, and all three pat theirs
//  vi   "far beyond their own control"                they lean in and reach; the quill lifts out, loops over
//                                                      their heads, and their hands close on air
//       "a tool that can make software"               the quill draws an app window; a plain request types
//                                                      itself in; a plant tracker draws itself inside
//       "the ever-scarce foundation of these monopolies" their stack, alone and padlocked; then the quill writes
//                                                      the same stack again, and again, and again
//       "for anyone who asks"                         six people, hands up, each gets a window of their own
//  vii  "we get to decide. what our computers can do…" chapter ii's three pictures, in colour, undone: she turns the
//                                                      key herself; he snips the price tag; her things fly home
//  viii "free ourselves… monopolies of the past"      the strings from chapter i snap; the hats fade to pencil
//  ix   "at long, long last… open source everything"  every page riffles past, each one someone's own app; then
//                                                      two friends passing their apps back and forth
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT } from '../brand';
import { Appear, blob, circle, WashBg, HatFigure, HatPose, Ink, jolt, Laptop, lin, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { MOTIFS, PALETTES } from './take1c-motifs';
import { AppWindow, Chrome, Content, MiniWindow } from './take1c-apps';
import { Folio, Heading, Sheet } from './take1c-page';
import { Stream, Strings } from './take1c-spreads-a';
import { Q, TURN, TURN_DUR } from './take1c-time';
import type { Spread } from './take1c-book';

const land = (turnAt: number) => turnAt + TURN_DUR;

// ---------- small 3D helpers for standing pieces ----------
type Key = { t: number; x: number; y: number; z: number; r?: number; s?: number };
/** Eased position along a list of keys (like the camera, for the quill). */
const track = (keys: Key[], t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const k = B.t === A.t ? 1 : EASE_IN_OUT(Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))));
  const m = (a: number, b: number) => a + (b - a) * k;
  return { x: m(A.x, B.x), y: m(A.y, B.y), z: m(A.z, B.z), r: m(A.r ?? 0, B.r ?? 0), s: m(A.s ?? 1, B.s ?? 1) };
};
// WHY checked: the quill's keys are computed from word times; one out of order would make it jump.
const checked = (name: string, keys: Key[]) => {
  keys.forEach((k, i) => { if (i && k.t < keys[i - 1].t) throw new Error(`take1c ${name} quill key ${i} (t=${k.t.toFixed(2)}) comes before key ${i - 1}`); });
  return keys;
};
/** The quill standing above the page, with a soft shadow on the paper beneath it. `still` stops the hover bob. */
const FlyingQuill: React.FC<{ q: ReturnType<typeof track>; o?: number; still?: number }> = ({ q, o = 1, still = 0 }) => {
  const t = useT();
  if (q.s <= 0.01 || o <= 0.01) return null;
  const bob = Math.sin(t * 3.1) * 8 * (1 - still);
  const z = Math.max(0, q.z + bob);
  return (
    <>
      <div style={{ position: 'absolute', left: q.x - 40 + z * 0.18, top: q.y - 14 + z * 0.1, width: 80 * q.s, height: 26 * q.s, borderRadius: '50%',
        background: 'rgba(40,14,48,0.55)', filter: `blur(${5 + z * 0.04}px)`, opacity: o * Math.max(0.12, 0.5 - z * 0.0012), transform: 'translateZ(0.6px)' }} />
      <div style={{ position: 'absolute', left: q.x, top: q.y - 170, width: 130, height: 170, transformOrigin: '0 100%', opacity: o,
        transform: `translateZ(${z}px) rotateX(-30deg) rotateZ(${q.r}deg) scale(${q.s * 1.5})` }}>
        <svg width={130} height={170} viewBox="0 -165 130 170" style={{ overflow: 'visible' }}><Quill x={0} y={0} s={1.05} /></svg>
      </div>
    </>
  );
};

// ---------- the made things the stacks are built from ----------
const ICONS = ['calendar', 'note', 'game', 'map', 'chat'] as const;
const ICON_D: Record<typeof ICONS[number], string> = {
  calendar: 'M -18 -12 h 36 v 30 h -36 Z M -18 -2 h 36 M -8 -16 v 8 M 8 -16 v 8',
  note: 'M -6 14 L -6 -16 L 16 -20 L 16 8 M -6 14 a 6 5 0 1 1 -1 -1 M 16 8 a 6 5 0 1 1 -1 -1',
  game: 'M -18 -18 h 36 v 36 h -36 Z M -6 -18 v 36 M 6 -18 v 36 M -18 -6 h 36 M -18 6 h 36',
  map: 'M 0 18 C -16 2 -14 -18 0 -18 C 14 -18 16 2 0 18 Z M 0 -9 a 5 5 0 1 0 0.1 0',
  chat: 'M -20 -14 h 40 v 24 h -26 l -10 8 v -8 h -4 Z',
};
/** A stack of slabs, each stamped with an app icon: the software the handful's power rests on. */
const Stack: React.FC<{ cx: number; w: number; n: number; a: number; dur?: number; fill?: string; wobble?: number }> = ({ cx, w, n, a, dur = 0.5, fill = P.wash, wobble = 0 }) => {
  const t = useT();
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const y0 = 880 - (i + 1) * 44;
        const jit = [0, 10, -6, 12, 4][i % 5] * (w / 300);
        const x0 = cx - w / 2 + jit, x1 = cx + w / 2 + jit;
        const k = a + (i / n) * dur;
        return (
          <g key={i} transform={`translate(${jolt(t, wobble, 6 - i, 0.7)} 0)`}>
            <Shape d={`M ${x0} ${y0 + 44} L ${x1} ${y0 + 44} L ${x1} ${y0} L ${x0} ${y0} Z`} a={k} b={k + 0.25} fill={fill} w={3} />
            <g transform={`translate(${(x0 + x1) / 2} ${y0 + 22}) scale(0.5)`}><Ink d={ICON_D[ICONS[i % 5]]} a={k + 0.1} b={k + 0.35} w={4} /></g>
          </g>
        );
      })}
    </>
  );
};

// ======================= v · the treasure, and vi · the tool =======================
const STACK = { cx: 300, w: 300, n: 5 };
const TOP = 880 - STACK.n * 44;
const MEN = [200, 300, 400];
const COPIES: [number, number][] = [[620, 190], [930, 190], [1150, 190], [1370, 190]];
const WELL = { x: 1010, y: 598 };
const WIN = { x: 1140, y: 300, w: 460, h: 330 };
const HELLO = { x0: 840, x1: 985, y: 512 };   // left of the well, so the quill standing in it never covers the word
const COIN_FROM = { x: 1158, y: 738 }, COIN_TO = { x: MEN[2] + 26, y: TOP - 113 };
// the window: drawn by the quill, then a plain request types itself in, then the tracker draws itself
const WIN_A = Q.tool - 0.35, WIN_DRAW = 0.7;
const REQ = { text: 'help me keep my plants alive?', at: WIN_A + WIN_DRAW - 0.05, dur: 0.72 };
const PLANTS_AT = REQ.at + REQ.dur + 0.05;

/** Where each man's hat sits (0 up, 1 down over his eyes), what his hands do, and what his eyes are. */
const manAt = (t: number, j: number) => {
  const drop = Math.min(1, pop(t, Q.hubris + j * 0.08, 0.45)) * (1 - lin(t, Q.believed - 0.1 + j * 0.06, Q.believed + 0.3 + j * 0.06, EASE_IN_OUT));
  let pose: HatPose = 'sides';
  if (t > Q.believed && t < Q.but) pose = 'rub';
  if (j === 2 && t > Q.shareholder + 0.4 && t < Q.but) pose = 'pat';
  if (t > Q.value - 0.05 && t < Q.but) pose = 'pat';
  if (t > Q.excitement - 0.1 && t < Q.beyond + 0.15) pose = 'reach';
  if (t >= Q.beyond + 0.15 && t < Q.control + 0.7) pose = 'grab';
  const coins = t > Q.greatTreasure + j * 0.07 && t < Q.but;
  const fist = lin(t, Q.control + 0.02 + j * 0.05, Q.control + 0.16 + j * 0.05) * (1 - lin(t, Q.control + 0.7, Q.control + 0.8));
  // chins up on "hubris", a blind totter under the hats, a lean toward the machine "in their excitement"
  const lean = -5 * lin(t, Q.blinded + 0.2, Q.hubris) * (1 - lin(t, Q.created1, Q.created1 + 0.4)) + drop * Math.sin(t * 3.4 + j * 1.9) * 5
    + 9 * lin(t, Q.excitement - 0.1, Q.excitement + 0.3) * (1 - lin(t, Q.control + 0.5, Q.control + 0.9));
  const smug = t > Q.value && t < Q.but ? -Math.abs(Math.sin((t - Q.value) * 6 + j)) * 5 : 0;
  return { drop, pose, coins, fist, lean, bob: smug };
};

const TreasureArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.treasure);
  const alive = t > Q.intelligence;
  // the cogs start turning as the machine comes to life, and race when it pays out
  const spin = (t - Q.technology2) * (alive ? 120 : 30) + lin(t, Q.greatTreasure, Q.shareholder) * 360;
  const machineOut = Q.makeSoftware;
  const level = lin(t, Q.artificial - 0.05, Q.artificial + 0.35);
  const dropY = 380 + 218 * Math.pow(Math.min(1, Math.max(0, (t - (Q.artificial - 0.4)) / 0.35)), 2);
  const helloP = lin(t, Q.intelligence + 0.35, Q.intelligence + 1.15, (v) => v);
  // the coin: out of the spout on "shareholder", over in an arc, into the pocket
  const cu = lin(t, Q.shareholder - 0.1, Q.shareholder + 0.45, EASE_IN_OUT);
  const coinX = COIN_FROM.x + (COIN_TO.x - COIN_FROM.x) * cu, coinY = COIN_FROM.y + (COIN_TO.y - COIN_FROM.y) * cu - Math.sin(cu * Math.PI) * 260;
  const cog = (x: number, y: number, r: number, dir: number, a: number) => {
    const teeth = Array.from({ length: 8 }, (_, i) => { const th = (i / 8) * Math.PI * 2; return `M ${x + Math.cos(th) * r} ${y + Math.sin(th) * r} L ${x + Math.cos(th) * (r + 8)} ${y + Math.sin(th) * (r + 8)}`; }).join(' ');
    return (
      <g transform={`rotate(${spin * dir} ${x} ${y})`}>
        <Shape d={circle(x, y, r)} a={a} b={a + 0.3} fill={P.wash} w={3} ea={machineOut} />
        <Ink d={teeth} a={a + 0.1} b={a + 0.35} w={6} cap="butt" ea={machineOut} />
        <Shape d={circle(x, y, r * 0.3)} a={a + 0.2} b={a + 0.4} fill={P.ink} w={2} ea={machineOut} />
      </g>
    );
  };
  return (
    <>
      <Heading n="v" title="the treasure" />
      <Folio left={12} />
      <Sheet>
        <WashBg x={320} y={600} r={250} sx={1.1} a={L - 0.4} seed={14} />
        <WashBg x={1040} y={660} r={200} sx={1.2} a={Q.created1 - 0.4} seed={15} color={P.purpleSoft} o={0.5} ea={machineOut} />
        {/* their stack: a few precious blocks of software, all they ever had */}
        <g transform={`rotate(${jolt(t, Q.monopolies1 - 0.1, 2, 0.9)} ${STACK.cx} 880)`}>
          <Stack cx={STACK.cx} w={STACK.w} n={STACK.n} a={TURN.treasure - 0.7} wobble={Q.monopolies1} />
          {MEN.map((fx, j) => {
            const m = manAt(t, j);
            return <HatFigure key={j} x={fx} y={TOP} s={1} crown={84} drop={m.drop} a={TURN.treasure - 0.5 + j * 0.08} b={TURN.treasure + 0.3 + j * 0.08} pose={m.pose}
              lean={m.lean} bob={m.bob} eyes={m.coins ? 'coins' : 'dots'} fist={m.fist} pocket />;
          })}
        </g>
        {/* the padlock on "ever-scarce": theirs is the only stack there is */}
        <Padlock x={STACK.cx} y={790} s={1.6} at={Q.scarce} />

        {/* the workbench and the machine, inked piece by piece as she names it */}
        <Ink d="M 850 880 L 1220 880" a={Q.created1 - 0.4} b={Q.created1} w={2} c={P.inkSoft} ea={machineOut} />
        <Shape d="M 860 760 L 1200 760 L 1200 776 L 860 776 Z" a={Q.created1 - 0.3} b={Q.created1 + 0.1} fill={P.inkSoft} w={3} ea={machineOut} />
        <Ink d="M 878 776 L 884 880 M 1182 776 L 1176 880" a={Q.created1 - 0.2} b={Q.created1 + 0.15} w={5} ea={machineOut} />
        <Shape d="M 920 760 L 1100 760 L 1100 650 L 920 650 Z" a={Q.created1 + 0.05} b={Q.created1 + 0.45} fill={P.paper} w={3} ea={machineOut} />
        {cog(965, 705, 26, 1, Q.newKind)}
        {cog(1046, 690, 20, -1.3, Q.newKind + 0.2)}
        {cog(1066, 736, 11, 2, Q.newKind + 0.35)}
        <Ink d="M 1100 700 C 1130 700 1150 712 1158 738" a={Q.technology2 - 0.1} b={Q.technology2 + 0.2} w={10} cap="butt" ea={machineOut} />
        {/* the inkwell on top: the drop from chapter iv falls into it, and that is the ink the quill writes with */}
        <defs><clipPath id="c-well"><path d="M 975 650 L 975 616 Q 975 604 990 604 L 1030 604 Q 1045 604 1045 616 L 1045 650 Z" /></clipPath></defs>
        {level > 0 && <g clipPath="url(#c-well)" opacity={machineOut < t ? 1 - lin(t, machineOut, machineOut + 0.4) : 1}><rect x={970} y={650 - 46 * level * 0.85} width={80} height={60} fill={P.purple} /></g>}
        <Shape d="M 975 650 L 975 616 Q 975 604 990 604 L 1030 604 Q 1045 604 1045 616 L 1045 650 Z" a={Q.technology2 - 0.05} b={Q.technology2 + 0.3} w={3} ea={machineOut} />
        <Shape d="M 994 604 L 994 594 L 1026 594 L 1026 604" a={Q.technology2 + 0.1} b={Q.technology2 + 0.35} w={3} ea={machineOut} />
        {t > Q.artificial - 0.4 && t < Q.artificial - 0.05 && <path d={`M ${WELL.x} ${dropY - 26} C ${WELL.x + 4} ${dropY - 14} ${WELL.x + 9} ${dropY - 6} ${WELL.x + 9} ${dropY} A 9 9 0 0 1 ${WELL.x - 9} ${dropY} C ${WELL.x - 9} ${dropY - 6} ${WELL.x - 4} ${dropY - 14} ${WELL.x} ${dropY - 26} Z`} fill={P.purple} />}
        {/* "intelligence": with nobody holding it, the quill writes a word */}
        {helloP > 0 && (
          <g opacity={1 - lin(t, Q.but - 0.2, Q.but + 0.3)}>
            <defs><clipPath id="c-hello"><rect x={HELLO.x0 - 10} y={HELLO.y - 80} width={(HELLO.x1 - HELLO.x0 + 30) * helloP} height={120} /></clipPath></defs>
            <text x={HELLO.x0} y={HELLO.y} clipPath="url(#c-hello)" fontFamily={DMSANS} fontWeight={700} fontStyle="italic" fontSize={58} fill={P.purple} letterSpacing="-0.02em">hello</text>
          </g>
        )}
        {/* the coin */}
        {cu > 0 && cu < 1 && (
          <g transform={`translate(${coinX} ${coinY}) scale(${1 - 0.4 * cu}) rotate(${cu * 540})`}>
            <circle r={24} fill={P.sun} stroke={P.ink} strokeWidth={3} /><circle r={14} fill="none" stroke={P.ink} strokeWidth={2} opacity={0.6} />
          </g>
        )}

        {/* "a tool that can make software": the quill draws an app window; a request types itself in; it draws itself */}
        <AppWindow x={WIN.x} y={WIN.y} w={WIN.w} h={WIN.h} a={WIN_A} draw={WIN_DRAW} pal={PALETTES[1]} chrome="plain" content="plants" contentAt={PLANTS_AT} request={REQ} />
        {/* "foundation": the same stack, written again and again, so theirs is no longer special */}
        {COPIES.map(([cx, w], i) => <Stack key={i} cx={cx} w={w} n={STACK.n} a={Q.foundation - 0.1 + i * 0.2} dur={0.3} fill={[P.lilac, P.pinkSoft, P.sunSoft, P.violetSoft][i]} />)}
      </Sheet>
    </>
  );
};

const TreasurePop: React.FC = () => {
  const t = useT();
  const sit = { x: WELL.x - 4, y: WELL.y + 2, z: 0, s: 0.8, r: -4 };
  const q = track(checked('treasure', [
    { t: Q.artificial + 0.05, x: WELL.x, y: WELL.y, z: 420, s: 0.8, r: -4 },
    { t: Q.artificial + 0.45, ...sit },
    { t: Q.intelligence + 0.1, ...sit },
    { t: Q.intelligence + 0.35, x: HELLO.x0, y: HELLO.y, z: 6, s: 0.8, r: -10 },
    { t: Q.intelligence + 1.15, x: HELLO.x1 + 20, y: HELLO.y, z: 6, s: 0.8, r: -10 },
    { t: Q.aTechnology + 0.35, ...sit },
    { t: Q.createdSomething + 0.5, ...sit },
    // "far beyond": it lifts out on its own, loops over their heads, and is gone before their hands close
    { t: Q.beyond + 0.05, x: WELL.x, y: 540, z: 150, s: 0.9, r: -8 },
    { t: Q.beyond + 0.5, x: 520, y: 430, z: 70, s: 0.9, r: 12 },
    { t: Q.control - 0.02, x: 300, y: 400, z: 60, s: 0.9, r: 20 },
    { t: Q.control + 0.7, x: 860, y: 190, z: 320, s: 0.9, r: -10 },
    // it draws the window round, clockwise from the top-left corner
    { t: WIN_A, x: WIN.x - WIN.w / 2, y: WIN.y - WIN.h / 2, z: 8, s: 0.8, r: -12 },
    { t: WIN_A + WIN_DRAW * 0.3, x: WIN.x + WIN.w / 2, y: WIN.y - WIN.h / 2, z: 8, s: 0.8, r: -12 },
    { t: WIN_A + WIN_DRAW * 0.5, x: WIN.x + WIN.w / 2, y: WIN.y + WIN.h / 2, z: 8, s: 0.8, r: -12 },
    { t: WIN_A + WIN_DRAW * 0.8, x: WIN.x - WIN.w / 2, y: WIN.y + WIN.h / 2, z: 8, s: 0.8, r: -12 },
    { t: WIN_A + WIN_DRAW, x: WIN.x - WIN.w / 2, y: WIN.y - WIN.h / 2 + 60, z: 30, s: 0.8, r: -12 },
    { t: PLANTS_AT, x: WIN.x + WIN.w / 2 + 40, y: WIN.y + 40, z: 90, s: 0.8, r: 6 },
    { t: Q.scarce, x: WIN.x + WIN.w / 2 + 50, y: WIN.y + 40, z: 140, s: 0.8, r: 6 },
    // then the stacks, one after another
    ...COPIES.map(([cx], i) => ({ t: Q.foundation - 0.1 + i * 0.2 + 0.15, x: cx + 40, y: 700, z: 50, s: 0.8, r: -8 })),
    { t: TURN.anyone - 0.3, x: 1380, y: 520, z: 220, s: 0.8, r: 0 },
    { t: TURN.anyone + 0.1, x: 1180, y: 400, z: 900, s: 0.8, r: 10 },
  ]), t);
  const still = t > Q.artificial + 0.45 && t < Q.createdSomething + 0.5 && !(t > Q.intelligence + 0.1 && t < Q.aTechnology + 0.35) ? 1 : 0;
  // a twitch on "intelligence", and a shiver on "created something" before it goes
  const twitch = jolt(t, Q.intelligence - 0.05, 10, 0.45) + jolt(t, Q.createdSomething + 0.1, 7, 0.6);
  return t > Q.artificial ? <FlyingQuill q={{ ...q, r: q.r + twitch }} still={still} o={lin(t, Q.artificial, Q.artificial + 0.15)} /> : null;
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt, Pop: TreasurePop };

// ======================= vi · anyone =======================
// WHY each raised hand gets its own window, each a different layout, palette and purpose: the line says the tool
// makes software "for anyone who asks", and the product idea is that every person's copy is different.
const ASKERS = [150, 370, 590, 930, 1150, 1370];
const HAIRS6 = ['bob', 'tuft', 'curly', 'bun', 'cap', 'long'] as const;
const CHROMES: Chrome[] = ['tabs', 'sidebar', 'plain', 'cards', 'sidebar', 'tabs'];
const CONTENTS: Content[] = ['music', 'garden', 'stars', 'cat', 'cook', 'game'];
// WHY from the landing, not from "anyone": the page is still turning on "anyone"; windows that popped then were
// half-hidden by the falling leaf. They start as it lands and the last one is up just before "asks".
const winAt = (i: number) => land(TURN.anyone) - 0.12 + i * 0.14;
const AnyoneArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  return (
    <>
      <Heading n="vi" title="anyone" />
      <Folio left={14} />
      <Sheet>
        <WashBg x={380} y={420} r={230} sx={1.4} a={L - 1} seed={16} color={P.lilac} o={0.7} />
        <WashBg x={1140} y={420} r={230} sx={1.4} a={L - 1} seed={17} color={P.pinkSoft} o={0.6} />
        <Ink d="M 70 600 L 1450 600" a={L - 0.8} b={L - 0.3} w={2} c={P.inkSoft} />
        {ASKERS.map((x, i) => {
          const up = t > winAt(i) - 0.15;
          const pal = PALETTES[i];
          const p = pop(t, winAt(i), 0.5);
          return (
            <g key={i}>
              <Person x={x} y={600} s={1.3} a={L - 0.8 + i * 0.03} b={L - 0.3 + i * 0.03} pose={up ? (i % 2 ? 'up' : 'wave') : 'down'} hair={HAIRS6[i]}
                body={t > winAt(i) + 0.1 ? pal.a : P.wash} mood="smile" bob={up ? jolt(t, winAt(i) - 0.15, -8, 0.5) : 0} />
              {p > 0 && <g transform={`translate(${x} ${330}) scale(${p}) translate(0 70)`}><MiniWindow x={0} y={-70} w={196} h={150} pal={pal} chrome={CHROMES[i]} content={CONTENTS[i]} /></g>}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
const AnyonePop: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  const q = track(checked('anyone', [
    { t: L - 0.5, x: 120, y: 200, z: 700, s: 0.8, r: 10 },
    ...ASKERS.map((x, i) => ({ t: winAt(i) + 0.05, x: x + 70, y: 300, z: 70, s: 0.75, r: -10 + i * 3 })),
    { t: Q.asks + 0.5, x: 1460, y: 200, z: 260, s: 0.75, r: 0 },
    { t: TURN.ours + 0.2, x: 1500, y: 120, z: 900, s: 0.75, r: 0 },
  ]), t);
  return <FlyingQuill q={q} o={1 - lin(t, TURN.ours, TURN.ours + 0.25)} />;
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt, Pop: AnyonePop };

// ======================= vii · ours: chapter ii, undone =======================
// WHY the exact layout of chapter ii: the narrator repeats that line's three clauses word for word, so the
// pictures repeat too, in colour, and each is undone by the person it was done to, on its own clause.
const Scissors: React.FC<{ x: number; y: number; r: number; open: number }> = ({ x, y, r, open }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    {[1, -1].map((s) => (
      <g key={s} transform={`rotate(${s * open * 16})`}>
        <path d={`M 0 0 L 46 ${s * -3} L 0 ${s * 6} Z`} fill={P.paperShade} stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
        <circle cx={-16} cy={s * 10} r={9} fill={P.pink} stroke={P.ink} strokeWidth={2.4} />
      </g>
    ))}
    <circle r={2.6} fill={P.ink} />
  </g>
);
const OursArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.ours) - 0.45;
  const bob = (k: number) => jolt(t, Q.decide + k * 0.08, -10, 0.5);
  // A: she turns the key herself
  const kGo = lin(t, Q.ourComputers + 0.3, Q.ourComputers + 0.7, EASE_IN_OUT);
  const kTurn = lin(t, Q.ourComputers + 0.72, Q.ourComputers + 0.88);
  const keyX = 251 + (370 - 251) * kGo, keyY = 446 + (382 - 446) * kGo;
  const screenP = pop(t, Q.canDo - 0.05, 0.5);
  // B: he snips the price tag
  const sGo = lin(t, Q.itCosts + 0.05, Q.costs - 0.05, EASE_IN_OUT);
  const snip = lin(t, Q.costs - 0.05, Q.costs + 0.05);
  const fall = lin(t, Q.costs + 0.05, Q.costs + 0.75, EASE_IN);
  const scX = 432 + (300 - 432) * sGo, scY = 812 + (690 - 812) * sGo;
  return (
    <>
      <Heading n="vii" title="ours" />
      <Folio left={16} />
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L} seed={3} color={P.pinkSoft} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={L + 0.2} seed={6} color={P.sunSoft} />
        <WashBg x={1130} y={620} r={290} a={L + 0.4} seed={11} color={P.lilac} />
        {/* A: what our computers can do */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 250 420 L 490 420 M 270 420 L 270 500 M 470 420 L 470 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <Laptop x={370} y={418} s={1.5} a={L} b={L + 0.4} />
        {screenP > 0 && <g transform={`translate(370 ${418 - 1.5 * 24}) scale(${screenP})`}><MiniWindow x={0} y={0} w={96} h={60} pal={PALETTES[0]} chrome="sidebar" content="garden" /></g>}
        <Person x={200} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose={t > Q.ourComputers + 0.25 && t < Q.ourComputers + 1.1 ? 'write' : 'up'} mood="smile" hair="bun" body={P.pink} bob={bob(0)} />
        <HatFigure x={592} y={500} s={1} crown={84} a={L - 0.2} b={L + 0.7} pose="sides" flip fade={0.75} />
        <Padlock x={370} y={384} s={1.25} at={L} openAt={Q.ourComputers + 0.85} fallAt={Q.ourComputers + 1.05} color={P.inkSoft} />
        {t < Q.ourComputers + 1.05 && (
          <g transform={`translate(${t > Q.ourComputers + 0.25 ? keyX : 236} ${t > Q.ourComputers + 0.25 ? keyY : 398 + bob(0)}) rotate(${-90 + kTurn * 90})`} opacity={lin(t, L + 0.4, L + 0.7)}>
            <path d="M 0 0 L 0 26 M 0 18 L 7 18 M 0 24 L 6 24" stroke={P.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <circle cx={0} cy={-6} r={7} fill={P.sun} stroke={P.ink} strokeWidth={3} />
          </g>
        )}

        {/* B: what it costs */}
        <Ink d="M 140 860 L 660 860" a={L + 0.1} b={L + 0.5} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={L + 0.1} b={L + 0.45} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={L + 0.2} b={L + 0.6} />
        {/* the tag hangs from a short string; once snipped it tumbles away */}
        {snip < 1 && <Ink d="M 281 668 L 281 698" a={L + 0.3} b={L + 0.5} w={2} />}
        {snip >= 1 && <path d="M 281 668 L 281 680" stroke={P.ink} strokeWidth={2} />}
        <g transform={`translate(${-fall * 40} ${fall * 260}) rotate(${-fall * 60} 281 728)`} opacity={1 - lin(t, Q.costs + 0.5, Q.costs + 0.8)}>
          <PriceTag x={281} y={728} s={0.72} at={L + 0.3} swing={-6} prices={[{ v: '19.99/mo', at: L + 0.4 }]} />
        </g>
        {/* once the tag is gone, the screen it hung from says what it costs now */}
        {t > Q.costs + 0.2 && (
          <text x={236} y={738} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={34} fill={P.purple} letterSpacing="-0.04em"
            opacity={lin(t, Q.costs + 0.2, Q.costs + 0.45)}>free</text>
        )}
        <Person x={480} y={860} s={1.12} a={L + 0.25} b={L + 0.8} pose={t > Q.itCosts && t < Q.costs + 0.5 ? 'write' : 'down'} mood="smile" hair="curly" body={P.sun} flip bob={bob(1)} />
        {t > L + 0.6 && <Scissors x={t > Q.itCosts + 0.05 ? scX : 432} y={t > Q.itCosts + 0.05 ? scY : 812} r={t > Q.itCosts + 0.05 ? 190 : 200} open={1 - snip} />}

        {/* C: what happens with our data: her things fly back out of the hat, into a box of her own */}
        <Ink d="M 820 880 L 1450 880" a={L + 0.2} b={L + 0.6} w={2} c={P.inkSoft} />
        <Person x={905} y={880} s={1.35} a={L + 0.3} b={L + 0.9} pose={t > Q.happens ? 'bothUp' : 'down'} hair="long" mood="smile" body={P.violet} hairColor={P.purple} bob={bob(2)} />
        <Shape d="M 960 880 L 1060 880 L 1060 820 L 960 820 Z" a={L + 0.4} b={L + 0.8} fill={P.sun} w={3} />
        <Shape d="M 960 820 L 1060 820 L 1080 780 L 980 780 Z" a={L + 0.5} b={L + 0.9} fill={P.sunSoft} w={3} />
        <HatFigure x={1330} y={880} s={1.5} crown={100} a={L + 0.2} b={L + 1.2} pose="sides" fade={0.75} />
        <Stream from={Q.ourData + 0.35} p0={[1330, 880 - (212 + 100) * 1.5 + 20]} p1={[1170, 330]} p2={[1010, 830]} count={8} gap={0.13} dur={0.9} s={1.05} />
      </Sheet>
    </>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

// ======================= viii · the past =======================
const FreeArt: React.FC = () => {
  const L = land(TURN.free);
  return (
    <>
      <Heading n="viii" title="the past" />
      <Folio left={18} />
      <Sheet>
        <WashBg x={390} y={330} r={200} sx={1.5} a={L - 2} seed={2} o={0.8} />
        <WashBg x={1130} y={330} r={200} sx={1.5} a={L - 2} seed={5} o={0.8} />
        <WashBg x={385} y={850} r={62} sx={4.6} a={L - 2} seed={8} color={P.lilac} />
        <WashBg x={1135} y={850} r={62} sx={4.6} a={L - 2} seed={9} color={P.pinkSoft} />
        <Strings figA={L - 1.6} peopleA={L - 1.4} stringsA={L - 1.0} beats={[]} colourful snapAt={Q.free} fadeFrom={Q.monopolies2} fadeTo={Q.pastEnd} />
      </Sheet>
    </>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · everyone's own (the riffle) =======================
// WHY each riffled page is that person's own app: "every copy is different" has to read in half a second a page,
// and a person beside a window that looks like nobody else's says it faster than loose objects did.
const HAIRS = ['curly', 'bob', 'cap', 'long', 'bun', 'tuft'] as const;
const RIFFLE_CHROME: Chrome[] = ['sidebar', 'tabs', 'cards', 'plain', 'sidebar', 'cards'];
const ownSpread = (k: number): Spread => {
  const pal = PALETTES[k], content: Content = k === 1 ? 'plants' : MOTIFS[(k + 2) % MOTIFS.length];
  const Art: React.FC = () => {
    // WHY drawn complete (a far in the past): these pages fly by in half a second each; they must arrive finished
    const a = -10;
    return (
      <>
        <Sheet rough={false}>
          <rect x={60} y={60} width={640} height={860} rx={6} fill={pal.bg} />
          {pal.pattern && <rect x={60} y={60} width={640} height={860} rx={6} fill={`url(#c-${pal.pattern})`} />}
          <path d={blob(380, 520, 230, k + 1, 0.16)} fill="#fff" opacity={0.4} />
          <Person x={380} y={800} s={3.1} a={a} b={a + 0.5} body={pal.a} hair={HAIRS[k]} hairColor={k % 2 ? pal.b : P.ink} pose="quill" mood="smile" />
          <g transform="translate(470 590)"><Quill x={0} y={0} s={0.7} r={10} /></g>
          <path d={blob(1140, 480, 300, k + 7, 0.12)} fill={pal.bg} opacity={0.7} />
          <MiniWindow x={1140} y={470} w={[560, 500, 540, 480, 560, 520][k]} h={[600, 640, 560, 620, 580, 640][k]} pal={pal} chrome={RIFFLE_CHROME[k]} content={content} r={[-2, 1.5, -1, 2, -1.5, 1][k]} />
        </Sheet>
        <Folio left={20 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = [0, 1, 2, 3, 4, 5].map(ownSpread);

// ======================= ix · everything =======================
// WHY two friends, not a crowd: the campaign's rule is one person refining one thing, or two friends passing
// something back and forth. What one makes, the other gets a copy of, and makes their own.
const FRIENDS = [[190, 860, 0], [570, 860, 2]] as const;
const EverythingArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.everything);
  return (
    <>
      <Heading n="ix" title="everything" />
      <Folio left={32} />
      <Sheet>
        <WashBg x={380} y={600} r={290} a={-10} seed={21} color={P.lilac} />
        <WashBg x={1140} y={400} r={230} a={-10} seed={22} color={P.pinkSoft} o={0.8} />
        {FRIENDS.map(([x, y, pi], i) => {
          const pal = PALETTES[pi];
          return (
            <g key={i}>
              <Person x={x} y={y} s={1.75} a={-10} b={-9} body={pal.a} hair={HAIRS[i]} hairColor={i % 2 ? pal.b : P.ink} pose="bothUp" mood="smile" flip={i === 1} />
              <MiniWindow x={x} y={y - 300} w={250} h={190} pal={pal} chrome={i ? 'tabs' : 'sidebar'} content={i ? 'stars' : 'plants'} r={(i ? 4 : -4) + Math.sin(t * 2 + i) * 1.5} />
            </g>
          );
        })}
        {/* copies of each one's app arc over to the other, back and forth */}
        {[0, 1, 2, 3].map((j) => {
          const from = FRIENDS[j % 2], to = FRIENDS[(j + 1) % 2];
          const start = L - 0.7 + j * 0.42;
          const u = (t - start) / 1.0;
          if (u <= 0 || u >= 1) return null;
          const e = EASE_IN_OUT(u);
          const x = from[0] + (to[0] - from[0]) * e, y = from[1] - 330 - Math.sin(e * Math.PI) * 280;
          const pal = PALETTES[from[2]];
          return <MiniWindow key={j} x={x} y={y} w={150} h={114} pal={pal} chrome={j % 2 ? 'tabs' : 'sidebar'} content={j % 2 ? 'stars' : 'plants'} r={(e - 0.5) * 30 * (j % 2 ? -1 : 1)} s={0.7 + 0.3 * Math.sin(e * Math.PI)} />;
        })}
        {/* the quill, back in its ink pot */}
        <ellipse cx={1140} cy={540} rx={120} ry={16} fill={P.ink} opacity={0.12} />
        <g transform="translate(1176 500)"><Quill x={0} y={0} s={2.3} r={14} /></g>
        <Shape d="M 1080 540 L 1080 470 Q 1080 448 1102 446 L 1178 446 Q 1200 448 1200 470 L 1200 540 Z" a={-10} b={-9} fill={P.ink} w={3} />
        <Shape d="M 1106 446 L 1106 426 L 1174 426 L 1174 446 Z" a={-10} b={-9} fill={P.inkSoft} w={3} />
        <path d="M 1094 528 L 1094 476 Q 1094 462 1108 460" stroke="#fff" strokeWidth={5} opacity={0.35} fill="none" strokeLinecap="round" />
        <path d="M 1112 432 Q 1140 424 1168 432" stroke={P.purple} strokeWidth={6} fill="none" strokeLinecap="round" />
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };

