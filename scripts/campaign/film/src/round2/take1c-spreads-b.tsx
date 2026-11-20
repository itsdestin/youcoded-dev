// Take 1C, chapters v–viii: the corporations bottle a new kind of ink, it escapes as a quill anyone can hold,
// everyone redraws their own corner, the strings snap, and the book ends on what we share.
//  v    "blinded by their own hubris"                  their hats grow taller and slide down over their eyes
//       "created… artificial intelligence"             a bell jar on a pedestal pops up and fills with purple ink
//       "a great treasure: shareholder value"          they dream of a gilt frame; inside it, a small line going up
//  vi   "far beyond their own control"                 one grabs at the jar; it cracks; the ink floods the page
//       "a tool that can make software"                the ink gathers into a quill that draws little made things
//       "the ever-scarce foundation of these monopolies" they stand on a few precious blocks of the same things
//       "for anyone who asks"                          people with hands up, each asking for something different
//  vii  "we get to decide. what our computers can do…" six identical grey panels redrawn one by one, each its own;
//       "what it costs / what happens with our data"   then the padlock, the price and the top hat undone in turn
//  viii "free ourselves… monopolies of the past"       the strings from chapter i snap; the hats fade to pencil
//  ix   "at long, long last… open source everything"   every page of the book riffles past, each one someone's own;
//                                                       the last spread: people passing pages to one another
import React from 'react';
import { EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Appear, blob, bubblePath, circle, WashBg, HatFigure, Ink, jolt, Laptop, lin, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT, Wash } from './take1c-ink';
import { MotifArt, MOTIFS, PALETTES, Palette } from './take1c-motifs';
import { Folio, Heading, Headline, Sheet } from './take1c-page';
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
/** The quill standing above the page, with a soft shadow on the paper beneath it. */
const FlyingQuill: React.FC<{ q: ReturnType<typeof track>; o?: number }> = ({ q, o = 1 }) => {
  const t = useT();
  if (q.s <= 0.01 || o <= 0.01) return null;
  const bob = Math.sin(t * 3.1) * 8;
  const z = q.z + bob;
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
/** A pop-up piece: a card hinged on its bottom edge that stands up out of the page. angle 0 = flat. */
const PopCard: React.FC<{ x: number; y: number; w: number; h: number; angle: number; o?: number; children: React.ReactNode }> = ({ x, y, w, h, angle, o = 1, children }) => (
  <div style={{ position: 'absolute', left: x - w / 2, top: y - h, width: w, height: h, transformOrigin: '50% 100%', opacity: o,
    transform: `translateZ(1px) rotateX(${angle}deg)` }}>
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>{children}</svg>
  </div>
);

// ======================= v · the treasure (and vi's escape) =======================
const SLABS: [number, number][] = [[150, 610], [172, 588], [160, 600], [182, 578], [170, 590]];
const PODIUM_TOP = 880 - SLABS.length * 50;
const TREASURE_FIGS = [270, 380, 490];
const DOODLES: [number, number][] = [[930, 330], [1350, 330], [905, 610], [1380, 610], [1140, 240]];
const DOODLE_ICONS = ['calendar', 'note', 'game', 'map', 'chat'] as const;
/** A small made thing: a card with an icon, the "software" the quill (and the podium) is made of. */
const Made: React.FC<{ x: number; y: number; kind: typeof DOODLE_ICONS[number]; a: number; c: string; s?: number; fill?: string }> = ({ x, y, kind, a, c, s = 1, fill }) => {
  const icon: Record<typeof DOODLE_ICONS[number], string> = {
    calendar: 'M -18 -12 h 36 v 30 h -36 Z M -18 -2 h 36 M -8 -16 v 8 M 8 -16 v 8',
    note: 'M -6 14 L -6 -16 L 16 -20 L 16 8 M -6 14 a 6 5 0 1 1 -1 -1 M 16 8 a 6 5 0 1 1 -1 -1',
    game: 'M -18 -18 h 36 v 36 h -36 Z M -6 -18 v 36 M 6 -18 v 36 M -18 -6 h 36 M -18 6 h 36',
    map: 'M 0 18 C -16 2 -14 -18 0 -18 C 14 -18 16 2 0 18 Z M 0 -9 a 5 5 0 1 0 0.1 0',
    chat: 'M -20 -14 h 40 v 24 h -26 l -10 8 v -8 h -4 Z',
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M -44 -36 h 88 a 10 10 0 0 1 10 10 v 52 a 10 10 0 0 1 -10 10 h -88 a 10 10 0 0 1 -10 -10 v -52 a 10 10 0 0 1 10 -10 Z" a={a} b={a + 0.3} fill={fill} c={c} w={3} />
      <Ink d={icon[kind]} a={a + 0.15} b={a + 0.45} w={3} c={c} />
    </g>
  );
};

const crownAt = (t: number) => 74 + 232 * pop(t, Q.hubris - 0.05, 0.75);
const blindAt = (t: number) => Math.min(1, pop(t, Q.hubris + 0.62, 0.4));
const TreasureArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.treasure);
  const crown = crownAt(t);
  const excited = t > Q.but && t < Q.control + 0.2 ? -Math.abs(Math.sin((t - Q.but) * 8.5)) * 16 : 0;
  const wobble = jolt(t, Q.monopolies1 - 0.1, 5, 0.9) + jolt(t, Q.foundation, 2.5, 0.6);
  const spill = lin(t, Q.control + 0.12, Q.control + 0.9, EASE_OUT) * (1 - lin(t, Q.tool - 0.15, Q.tool + 0.5, EASE_IN_OUT));
  const stain = lin(t, Q.control + 0.5, Q.tool + 0.3);
  const reach = lin(t, Q.excitement - 0.1, Q.createdSomething + 0.2, EASE_OUT) - lin(t, Q.control + 0.25, Q.control + 0.7, EASE_IN);
  return (
    <>
      <Heading n="v" title="the treasure" />
      <Folio left={12} />
      <Sheet>
        <WashBg x={380} y={600} r={250} sx={1.1} a={L + 0.1} seed={14} />
        <WashBg x={1140} y={640} r={250} a={Q.created1 - 0.4} seed={15} color={P.purpleSoft} o={0.55} />
        {/* the podium: a few precious blocks of made things, which is all they ever had */}
        <g transform={`rotate(${wobble * 0.4} 380 880)`}>
          {SLABS.map(([x0, x1], i) => {
            const y0 = 880 - (i + 1) * 50;
            const glow = lin(t, Q.foundation - 0.1 + i * 0.06, Q.foundation + 0.3 + i * 0.06);
            return (
              <g key={i} transform={`translate(${jolt(t, Q.monopolies1 + i * 0.05, 6 - i, 0.7)} 0)`}>
                <Shape d={`M ${x0} ${y0 + 50} L ${x1} ${y0 + 50} L ${x1} ${y0} L ${x0} ${y0} Z`} a={L - 0.6 + i * 0.05} b={L - 0.2 + i * 0.05} fill={glow > 0 ? P.purpleSoft : P.wash} w={3} fo={1} />
                <Made x={(x0 + x1) / 2} y={y0 + 25} kind={DOODLE_ICONS[i]} a={L - 0.4 + i * 0.05} c={P.ink} s={0.5} />
              </g>
            );
          })}
          {TREASURE_FIGS.map((fx, j) => (
            <HatFigure key={j} x={fx} y={PODIUM_TOP} s={1} crown={crown} drop={blindAt(t)} a={L - 0.5 + j * 0.1} b={L + 0.3 + j * 0.1}
              pose={t > Q.believed && t < Q.but ? 'rub' : 'sides'} bob={excited * (j % 2 ? 0.7 : 1)}
              lean={wobble * (j - 1) * 0.6 + blindAt(t) * Math.sin(t * 3.4 + j * 1.9) * 5} />
            /* WHY the sway: with their hats over their eyes they totter, which is what makes "blinded" read */
          ))}
        </g>
        {/* in their excitement one of them grabs for it, blind, with a very long arm */}
        {reach > 0.01 && (
          <g>
            <path d={`M 512 ${PODIUM_TOP - 168} C 700 ${PODIUM_TOP - 330} 900 520 ${512 + (1010 - 512) * reach} ${PODIUM_TOP - 168 + (720 - PODIUM_TOP + 168) * reach}`}
              stroke={P.ink} strokeWidth={8} fill="none" strokeLinecap="round" />
            <circle cx={512 + (1010 - 512) * reach} cy={PODIUM_TOP - 168 + (720 - PODIUM_TOP + 168) * reach} r={7} fill={P.paper} stroke={P.ink} strokeWidth={2.6} />
          </g>
        )}
        {/* the dream: a gilt frame, and inside it the treasure — a line going up */}
        <Ink d="M 560 360 a 9 9 0 1 0 0.1 0 M 640 300 a 14 14 0 1 0 0.1 0 M 740 250 a 18 18 0 1 0 0.1 0" a={Q.believed - 0.1} b={Q.believed + 0.4} w={2.6} ea={Q.but + 0.1} eb={Q.but + 0.6} />
        <Shape d={bubblePath(1140, 205, 240, 118, 11)} a={Q.believed + 0.1} b={Q.believed + 0.8} fill={P.paper} w={3} ea={Q.but + 0.1} eb={Q.but + 0.7} />
        <Shape d="M 1020 130 L 1260 130 L 1260 285 L 1020 285 Z M 1036 146 L 1244 146 L 1244 269 L 1036 269 Z" a={Q.greatTreasure} b={Q.greatTreasure + 0.6} fill={P.sun} w={3} ea={Q.but + 0.1} eb={Q.but + 0.6} />
        {[[1020, 130, 1], [1260, 130, -1], [1020, 285, 1], [1260, 285, -1]].map(([cx, cy, dir], i) => (
          <Ink key={i} d={`M ${cx} ${cy} c ${dir * 18} -22 ${dir * 34} 4 ${dir * 16} 14 c ${dir * -10} 6 ${dir * -14} -6 ${dir * -6} -8 M ${cx} ${cy} c ${dir * -4} ${cy > 200 ? 26 : -26} ${dir * 20} ${cy > 200 ? 30 : -30} ${dir * 18} ${cy > 200 ? 12 : -12}`}
            a={Q.greatTreasure + 0.3 + i * 0.08} b={Q.greatTreasure + 0.7 + i * 0.08} w={2.6} ea={Q.but + 0.1} eb={Q.but + 0.6} />
        ))}
        <Ink d="M 1056 252 L 1056 160 M 1056 252 L 1228 252" a={Q.shareholder - 0.1} b={Q.shareholder + 0.15} w={2} c={P.inkSoft} ea={Q.but + 0.1} eb={Q.but + 0.6} />
        <Ink d="M 1066 240 L 1100 226 L 1124 232 L 1158 200 L 1180 206 L 1218 166 M 1204 166 L 1218 166 L 1218 180" a={Q.shareholder + 0.05} b={Q.value + 0.3} w={4} ea={Q.but + 0.1} eb={Q.but + 0.6} />

        {/* the jar breaks: the ink floods the page, then gathers itself into a quill */}
        {stain > 0 && <path d={blob(1140, 700, 240, 5, 0.22)} fill={P.purple} opacity={0.1 * stain} />}
        {spill > 0.01 && (
          <g>
            <path d={blob(1140, 700, 30 + 270 * spill, 9, 0.2, 18)} fill={P.purple} opacity={0.9} />
            <path d={blob(1140, 700, 30 + 270 * spill, 9, 0.2, 18)} fill="none" stroke="#7A3A8C" strokeWidth={5} opacity={0.45} />
            {[[880, 520, 18], [1400, 560, 14], [1330, 900, 12], [920, 900, 16], [1200, 440, 10]].map(([dx, dy, r], i) => (
              <path key={i} d={blob(1140 + (dx - 1140) * spill, 700 + (dy - 700) * spill, r * spill, i + 2, 0.25, 10)} fill={P.purple} opacity={0.85} />
            ))}
          </g>
        )}
        {/* what the quill makes: one thing after another, as fast as she can say it */}
        {DOODLES.map(([dx, dy], i) => (
          <Made key={i} x={dx} y={dy} kind={DOODLE_ICONS[i]} a={Q.makeSoftware + i * 0.27} c={P.purple} fill={i % 2 ? P.lilac : P.paper} />
        ))}
      </Sheet>
    </>
  );
};
const JAR = { x: 1140, y: 860, w: 300, h: 470 };
const TreasurePop: React.FC = () => {
  const t = useT();
  const rise = pop(t, Q.created1 - 0.08, 0.7);
  const topple = lin(t, Q.control + 0.32, Q.control + 0.8, EASE_IN);
  const angle = -52 * rise * (1 - topple) + jolt(t, Q.beyond, 6, 0.9);
  const fadeOut = lin(t, Q.control + 0.8, Q.control + 1.1);
  const level = lin(t, Q.artificial - 0.1, Q.intelligence + 0.7, EASE_IN_OUT);
  const broken = t >= Q.control + 0.16;
  const shard = lin(t, Q.control + 0.16, Q.control + 0.8, EASE_OUT);
  const a = Q.created1 - 0.15;
  const surf = 270 - level * 168;
  const wave = (k: number) => Math.sin(t * 5 + k) * 4 * level;
  const q = track([
    { t: Q.tool - 0.1, x: 1140, y: 720, z: 0, s: 0.01, r: 0 },
    { t: Q.tool + 0.45, x: 1140, y: 700, z: 150, s: 1, r: -8 },
    ...DOODLES.map(([dx, dy], i) => ({ t: Q.makeSoftware + i * 0.27 + 0.1, x: dx + 40, y: dy + 30, z: 40, s: 1, r: -14 + i * 6 })),
    { t: Q.scarce + 0.2, x: 1140, y: 620, z: 170, s: 1, r: -6 },
    { t: TURN.anyone - 0.4, x: 1140, y: 600, z: 180, s: 1, r: -6 },
    { t: TURN.anyone, x: 1180, y: 520, z: 900, s: 1, r: 10 },
  ], t);
  return (
    <>
      {fadeOut < 1 && t > a && (
        <PopCard x={JAR.x} y={JAR.y} w={JAR.w} h={JAR.h} angle={angle} o={1 - fadeOut}>
          <defs><clipPath id="c-dome"><path d="M 82 270 L 82 120 C 82 44 218 44 218 120 L 218 270 Z" /></clipPath></defs>
          <Shape d="M 66 470 L 234 470 L 224 448 L 76 448 Z" a={a} b={a + 0.25} fill={P.wash} w={3} />
          <Shape d="M 106 448 L 194 448 L 188 300 L 112 300 Z" a={a + 0.05} b={a + 0.35} fill={P.paper} w={3} />
          <Ink d="M 128 440 L 126 306 M 150 440 L 150 306 M 172 440 L 174 306" a={a + 0.2} b={a + 0.5} w={1.8} c={P.inkSoft} />
          <Shape d="M 86 300 L 214 300 L 204 280 L 96 280 Z" a={a + 0.1} b={a + 0.4} fill={P.wash} w={3} />
          <Shape d="M 66 280 L 234 280 L 234 268 L 66 268 Z" a={a + 0.15} b={a + 0.45} fill={P.ink} w={3} />
          {!broken && (
            <g>
              {level > 0 && (
                <g clipPath="url(#c-dome)">
                  <path d={`M 70 ${surf + wave(0)} Q 115 ${surf - 10 + wave(1)} 150 ${surf + wave(2)} T 230 ${surf + wave(3)} L 230 280 L 70 280 Z`} fill={P.purple} />
                  <path d={`M 110 ${surf + 60} C 140 ${surf + 20} 190 ${surf + 50} 170 ${surf + 90} C 150 ${surf + 120} 120 ${surf + 100} 136 ${surf + 76}`} stroke="#C387D3" strokeWidth={3} fill="none" opacity={0.7 * level}
                    transform={`rotate(${t * 60} 150 ${surf + 70})`} />
                </g>
              )}
              <Ink d="M 82 268 L 82 120 C 82 44 218 44 218 120 L 218 268" a={a + 0.25} b={a + 0.7} w={3.4} />
              <Shape d={circle(150, 50, 11)} a={a + 0.55} b={a + 0.75} fill={P.ink} w={2} />
              <Appear a={a + 0.6}><path d="M 100 250 L 100 128 C 100 96 116 76 138 68" stroke="#fff" strokeWidth={6} fill="none" opacity={0.75} strokeLinecap="round" /></Appear>
              {t > Q.control - 0.02 && <Ink d="M 214 150 L 186 170 L 196 196 L 160 214 L 170 240 M 186 170 L 162 150 L 140 160" a={Q.control - 0.02} b={Q.control + 0.12} w={2.4} />}
            </g>
          )}
          {broken && shard < 1 && [[-1, -1], [1, -1.2], [-1.3, 0.2], [1.2, 0.3], [0.2, -1.5], [-0.4, -1.3]].map(([vx, vy], i) => (
            <path key={i} d="M 0 -14 L 10 8 L -9 6 Z" transform={`translate(${150 + vx * 170 * shard} ${150 + vy * 140 * shard + 160 * shard * shard}) rotate(${shard * 300 * (i % 2 ? 1 : -1)})`}
              fill="rgba(255,255,255,0.6)" stroke={P.ink} strokeWidth={2} opacity={1 - shard} />
          ))}
        </PopCard>
      )}
      {t > Q.tool - 0.1 && <FlyingQuill q={q} />}
    </>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt, Pop: TreasurePop };

// ======================= vi · anyone, and vii · our turn =======================
const PANELS = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i % 2 ? 395 : 85, y: [150, 400, 650][Math.floor(i / 2)], w: 280, h: 225 }));
const VISIT = (i: number) => Q.firstTime + i * 0.36;
const ASKS = ['flower', 'note', 'star', 'cat', 'cup'] as const;
const AskIcon: React.FC<{ kind: typeof ASKS[number] }> = ({ kind }) => {
  const st = { stroke: P.purple, strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'flower') return <><circle cx={0} cy={-4} r={5} {...st} /><path d="M 0 1 L 0 12 M -8 -4 a 8 8 0 0 1 16 0" {...st} /></>;
  if (kind === 'note') return <path d="M -4 10 L -4 -10 L 8 -12 L 8 6 M -4 10 a 4 3 0 1 1 -1 -1" {...st} />;
  if (kind === 'star') return <path d="M 0 -12 L 3 -3 L 12 -3 L 5 3 L 8 12 L 0 6 L -8 12 L -5 3 L -12 -3 L -3 -3 Z" {...st} />;
  if (kind === 'cat') return <path d="M -9 10 L -9 -6 L -5 -12 L -2 -6 L 2 -6 L 5 -12 L 9 -6 L 9 10 Z" {...st} />;
  return <path d="M -9 -6 L 9 -6 L 7 10 L -7 10 Z M 9 -2 a 4 4 0 0 1 0 8 M -3 -10 q 2 -4 0 -6 M 3 -10 q 2 -4 0 -6" {...st} />;
};

/** One small panel: someone at the same grey screen as everyone else, until the quill reaches it. */
const Panel: React.FC<{ i: number; pal: Palette }> = ({ i, pal }) => {
  const t = useT();
  const L = land(TURN.anyone);
  const p = PANELS[i];
  const v = VISIT(i);
  const reveal = lin(t, v, v + 0.55, EASE_OUT);
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const holdsQuill = t > Q.weGet + i * 0.07;
  const id = `c-panel-${i}`;
  const px = p.x + 64, py = p.y + p.h - 22;
  const grey = (
    <>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={P.paperShade} />
      <Person x={px} y={py} s={0.82} a={L - 0.6} b={L - 0.2} pose="hold" device={i > 2 ? 'phone' : 'none'} mood="flat" hair={(['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as const)[i]} />
    </>
  );
  const colour = (
    <>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={pal.bg} />
      {pal.pattern && <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={`url(#c-${pal.pattern})`} />}
      <path d={blob(p.x + p.w * 0.66, p.y + p.h * 0.48, 72, i + 3, 0.18)} fill="#fff" opacity={0.35} />
      <Person x={px} y={py} s={0.82} a={v - 1} b={v - 0.5} pose={holdsQuill ? 'quill' : 'hold'} device={i > 2 && !holdsQuill ? 'phone' : 'none'} mood="smile" body={pal.a}
        hair={(['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as const)[i]} hairColor={i % 2 ? pal.b : P.ink} />
      {holdsQuill && <g transform={`translate(${px + 26} ${py - 63})`}><Quill x={0} y={0} s={0.28} r={10} /></g>}
      {i > 2 && <MotifArt kind={MOTIFS[i]} x={p.x + 190} y={p.y + 108} s={0.42} a={v + 0.1} pal={pal} />}
    </>
  );
  return (
    <g>
      <clipPath id={id}><rect x={p.x} y={p.y} width={p.w} height={p.h} /></clipPath>
      <clipPath id={`${id}-r`}><circle cx={cx} cy={cy} r={reveal * 260} /></clipPath>
      <g clipPath={`url(#${id})`}>
        {grey}
        {reveal > 0 && <g clipPath={`url(#${id}-r)`}>{colour}</g>}
        {/* the three things they decided, each undone on its own line */}
        {i === 0 && (
          <>
            <Laptop x={p.x + 190} y={p.y + 190} s={1} a={L - 0.6} b={L - 0.2} screen={reveal > 0.5 ? P.paper : P.paper} />
            <Padlock x={p.x + 190} y={p.y + 166} s={0.95} at={L - 0.6} openAt={Q.ourComputers + 0.62} fallAt={Q.ourComputers + 0.85} />
            {t > Q.ourComputers + 1.05 && <MotifArt kind="garden" x={p.x + 190} y={p.y + 120} s={0.36} a={Q.ourComputers + 1.05} pal={pal} />}
          </>
        )}
        {i === 1 && (
          <>
            <Laptop x={p.x + 150} y={p.y + 200} s={0.9} a={L - 0.6} b={L - 0.2} />
            <PriceTag x={p.x + 200} y={p.y + 64} s={0.62} at={L - 0.6} prices={[{ v: '19.99/mo', at: L - 0.6 }]} strikeAll={Q.costs} final={{ v: 'free', at: Q.costs + 0.22, color: P.purple }} />
          </>
        )}
        {i === 2 && (
          <>
            <Person x={px} y={py} s={0.82} a={L - 0.6} b={L - 0.2} pose="hold" device="phone" mood={t > Q.happens + 0.6 ? 'smile' : 'flat'} hair="cap" body={reveal > 0.5 ? pal.a : P.wash} />
            <g opacity={1 - lin(t, Q.data2, Q.data2 + 0.5)}>
              <HatFigure x={p.x + 222} y={p.y + 170} s={0.32} crown={130} a={L - 0.6} b={L - 0.2} />
            </g>
            <Shape d={`M ${p.x + 120} ${p.y + 205} L ${p.x + 120} ${p.y + 170} L ${p.x + 145} ${p.y + 148} L ${p.x + 170} ${p.y + 170} L ${p.x + 170} ${p.y + 205} Z`} a={Q.ourData - 0.1} b={Q.ourData + 0.3} fill={pal.b} w={2.6} />
            <Stream from={L - 2} p0={[px + 4, py - 46]} p1={[p.x + 150, p.y + 10]} p2={[p.x + 222, p.y + 52]} count={14} gap={0.4} dur={1.1} s={0.5} until={Q.ourData - 0.6} />
            <Stream from={Q.happens - 0.2} p0={[p.x + 145, p.y + 170]} p1={[p.x + 190, p.y + 20]} p2={[p.x + 222, p.y + 52]} count={6} gap={0.17} dur={0.9} s={0.55} reverse />
          </>
        )}
      </g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke={P.ink} strokeWidth={3} />
    </g>
  );
};

const ANYONE_PEOPLE = [880, 1010, 1140, 1270, 1400];
const AnyoneArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  return (
    <>
      <Heading n="vi" title="anyone" />
      <Folio left={14} />
      <Sheet>
        <WashBg x={1140} y={500} r={250} sx={1.3} a={L} seed={16} color={P.lilac} o={0.7} />
        {PANELS.map((_, i) => <Panel key={i} i={i} pal={PALETTES[i]} />)}
        <Ink d="M 830 600 L 1450 600" a={L - 0.8} b={L - 0.3} w={2} c={P.inkSoft} />
        {ANYONE_PEOPLE.map((x, i) => {
          const up = t > Q.anyone + i * 0.09;
          const askA = Q.asks - 0.25 + i * 0.1;
          return (
            <g key={i}>
              <Person x={x} y={600} s={1.3} a={L - 0.8} b={L - 0.3} pose={up ? (i % 2 ? 'up' : 'wave') : 'down'} hair={(['bob', 'tuft', 'curly', 'bun', 'cap'] as const)[i]} mood="smile" bob={up ? jolt(t, Q.anyone + i * 0.09, -8, 0.5) : 0} />
              <Appear a={askA} b={askA + 0.2}>
                <g transform={`translate(${x + (i % 2 ? -32 : 36)} ${600 - 178}) scale(${0.8 + 0.2 * Math.min(1, pop(t, askA, 0.4))})`}>
                  <path d={bubblePath(0, 0, 28, 22, 7)} fill={P.paper} stroke={P.ink} strokeWidth={2.4} />
                  <AskIcon kind={ASKS[i]} />
                </g>
              </Appear>
            </g>
          );
        })}
      </Sheet>
      <Headline text="for *anyone / who asks." at={L - 0.08} out={L + 2.24} />
    </>
  );
};
const AnyonePop: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  const q = track([
    { t: L - 0.1, x: 1180, y: 330, z: 600, s: 1, r: 10 },
    { t: L + 0.5, x: 1140, y: 300, z: 160, s: 1, r: -6 },
    { t: Q.andSo + 0.15, x: 1140, y: 300, z: 170, s: 1, r: -6 },
    ...PANELS.map((p, i) => ({ t: VISIT(i), x: p.x + p.w / 2 + 10, y: p.y + p.h / 2 + 40, z: 30, s: 0.85, r: -12 + i * 4 })),
    { t: Q.weGet, x: 380, y: 520, z: 160, s: 0.85, r: 0 },
    { t: Q.decide + 0.4, x: 380, y: 480, z: 900, s: 0.85, r: 0 },
  ], t);
  return <FlyingQuill q={q} o={1 - lin(t, Q.decide, Q.decide + 0.4)} />;
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt, Pop: AnyonePop };

// ======================= vii · the past =======================
const FreeArt: React.FC = () => {
  const L = land(TURN.free);
  return (
    <>
      <Heading n="vii" title="the past" />
      <Folio left={16} />
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

// ======================= ix · everyone's own book (the riffle) =======================
const HAIRS = ['curly', 'bob', 'cap', 'long', 'bun', 'tuft'] as const;
const ownSpread = (k: number): Spread => {
  const pal = PALETTES[k], motif = MOTIFS[(k + 2) % MOTIFS.length];
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
          <path d={blob(1140, 470, 250, k + 7, 0.14)} fill={pal.bg} />
          <MotifArt kind={motif} x={1140} y={480} s={1.55} a={a} pal={pal} />
          <MotifArt kind={MOTIFS[(k + 4) % MOTIFS.length]} x={1300} y={820} s={0.45} a={a} pal={pal} />
          <MotifArt kind={MOTIFS[(k + 5) % MOTIFS.length]} x={960} y={150} s={0.4} a={a} pal={pal} />
        </Sheet>
        <Folio left={18 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = [0, 1, 2, 3, 4, 5].map(ownSpread);

// ======================= viii · everything =======================
const SHARERS = [[150, 850], [380, 850], [610, 850]] as const;
const EverythingArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.everything);
  return (
    <>
      <Heading n="viii" title="everything" />
      <Folio left={30} />
      <Sheet>
        <WashBg x={380} y={600} r={290} a={-10} seed={21} color={P.lilac} />
        <WashBg x={1140} y={400} r={230} a={-10} seed={22} color={P.pinkSoft} o={0.8} />
        {/* three people, each holding up a page of their own; copies of them fly from one to the next */}
        {SHARERS.map(([x, y], i) => {
          const pal = PALETTES[[0, 2, 5][i]];
          return (
            <g key={i}>
              <Person x={x} y={y} s={1.75} a={-10} b={-9} body={pal.a} hair={HAIRS[i]} hairColor={i % 2 ? pal.b : P.ink} pose="bothUp" mood="smile" />
              <g transform={`translate(${x} ${y - 250}) rotate(${(i - 1) * 5 + Math.sin(t * 2 + i) * 2})`}>
                <rect x={-70} y={-56} width={140} height={112} rx={4} fill={pal.bg} stroke={P.ink} strokeWidth={3} />
                <MotifArt kind={MOTIFS[[0, 2, 5][i]]} x={0} y={6} s={0.4} a={-10} pal={pal} />
              </g>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5].map((j) => {
          const from = SHARERS[j % 3], to = SHARERS[(j + 1 + (j % 2)) % 3];
          const start = L - 0.6 + j * 0.34;
          const u = (t - start) / 1.15;
          if (u <= 0 || u >= 1) return null;
          const e = EASE_IN_OUT(u);
          const lift = Math.sin(e * Math.PI) * 170;
          const x = from[0] + (to[0] - from[0]) * e, y = from[1] - 330 + (to[1] - from[1]) * e - lift;
          const dy = -Math.cos(e * Math.PI) * 170 * Math.PI;
          const ang = (Math.atan2(dy, to[0] - from[0]) * 180) / Math.PI;
          const pal = PALETTES[[0, 2, 5][j % 3]];
          return (
            <g key={j} transform={`translate(${x} ${y}) rotate(${ang}) scale(1.6)`}>
              <path d="M 22 0 L -18 -12 L -10 0 L -18 12 Z" fill={pal.bg} stroke={P.ink} strokeWidth={2} strokeLinejoin="round" />
              <path d="M 22 0 L -10 0" stroke={P.ink} strokeWidth={1.4} />
            </g>
          );
        })}
        {/* the quill, back in its ink pot */}
        <ellipse cx={1140} cy={540} rx={120} ry={16} fill={P.ink} opacity={0.12} />
        <g transform="translate(1176 500)"><Quill x={0} y={0} s={2.3} r={14} /></g>
        <Shape d="M 1080 540 L 1080 470 Q 1080 448 1102 446 L 1178 446 Q 1200 448 1200 470 L 1200 540 Z" a={-10} b={-9} fill={P.ink} w={3} />
        <Shape d="M 1106 446 L 1106 426 L 1174 426 L 1174 446 Z" a={-10} b={-9} fill={P.inkSoft} w={3} />
        <path d="M 1094 528 L 1094 476 Q 1094 462 1108 460" stroke="#fff" strokeWidth={5} opacity={0.35} fill="none" strokeLinecap="round" />
        <path d="M 1112 432 Q 1140 424 1168 432" stroke={P.purple} strokeWidth={6} fill="none" strokeLinecap="round" />
      </Sheet>
      <Headline text="open source / *everything." at={Q.open} out={TURN.close + 0.6} />
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
