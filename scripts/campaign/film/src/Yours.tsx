// "Yours." — round 2, revision 2 (docs/active/specs/2026-11-18-campaign-v2-treatments.md, direction A).
// Picture only: music, the people's voices and the sound effects are mixed by ../mix_yours.py, which
// reads the same yours.json, so sound and picture can never drift apart.
//
// Revision 2 (Destin: "the voice feels disconnected… visuals too basic… sound design needs work"):
// - The voice is now the person asking, spoken as it's typed; the typing is re-timed to the speech.
// - Requests are shown as a big, sharp message bar floating over the app (blurred behind it).
// - Results are the full screen floating in 3D with a moving camera, each composed differently.
// - The opening is a storm of notification cards; headlines reveal from behind a line.
import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, random, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, clamp, DMSANS, EndCard, EXPO_OUT, Ground, IN_OUT, s, useB } from './brand';
import { aspectOf, mark, MARKS } from './cuts';
import { Phone, Screen, ScreenKey } from './devices';
import Y from './yours.json';

const END = (clip: string) => MARKS[clip].duration;
type Ask = (typeof Y.asks)[number];

// ------------------------------------------------------------------ type
/**
 * A line whose words slide up from behind an invisible edge, one after another.
 * WHY: a mask reveal is crisp and deliberate; the blur-fade it replaces read as a template.
 */
const Reveal: React.FC<{ text: string; purple?: string[]; size: number; dark?: boolean; start?: number; out?: number; align?: 'left' | 'center' | 'right'; stagger?: number }> = ({
  text, purple = [], size, dark, start = 0, out, align = 'center', stagger = 3,
}) => {
  const f = useCurrentFrame();
  const ink = dark ? C.textDark : C.plum;
  const accent = dark ? C.purpleDark : C.purple;
  const o = out == null ? 0 : interpolate(f, [out, out + 9], [0, 1], { ...clamp, easing: IN_OUT });
  return (
    <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1.04, color: ink, textAlign: align, whiteSpace: 'nowrap' }}>
      {text.split(' ').map((w, i) => {
        const p = interpolate(f, [start + i * stagger, start + i * stagger + 16], [0, 1], { ...clamp, easing: EXPO_OUT });
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em', marginRight: i < text.split(' ').length - 1 ? '0.22em' : 0 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p + o) * 105}%)`, color: purple.includes(w) ? accent : ink }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ 0–10 s: the notification storm
const SUB: Record<string, string> = {
  'Sign in.': 'Your session has expired.',
  'Subscribe.': 'Unlock this feature for $9.99 a month.',
  'Renew.': 'Your plan renews tomorrow.',
  'Upgrade to continue.': "You've reached your free limit.",
  'Accept the new terms.': 'Required to keep using your account.',
  'Your price has changed.': 'Starting next month: $17.99.',
  'Your data is shared with our partners.': 'Learn more in our privacy policy.',
};

/** One generic notification card. WHY generic: it's every service at once, so it names and copies nobody. */
const Card: React.FC<{ title: string; sub?: string; b: number; scale?: number }> = ({ title, sub, b, scale = 1 }) => {
  const u = b * scale;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 1.4 * u, padding: `${1.3 * u}px ${2 * u}px ${1.3 * u}px ${1.4 * u}px`,
        borderRadius: 2 * u, background: 'rgba(52,38,66,.92)', boxShadow: `inset 0 0 0 ${0.08 * u}px rgba(243,234,249,.12), 0 ${0.8 * u}px ${2.4 * u}px rgba(0,0,0,.35)`,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ width: 3.2 * u, height: 3.2 * u, borderRadius: 0.9 * u, background: 'linear-gradient(160deg, #6E5C80, #4A3B58)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1.1 * u, height: 1.1 * u, borderRadius: '50%', border: `${0.22 * u}px solid rgba(243,234,249,.75)` }} />
      </div>
      <div style={{ fontFamily: DMSANS }}>
        <div style={{ fontWeight: 900, fontSize: 1.7 * u, letterSpacing: '-0.02em', color: C.textDark, lineHeight: 1.15 }}>{title}</div>
        {sub && <div style={{ fontWeight: 500, fontSize: 1.25 * u, color: C.secondaryDark, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    </div>
  );
};

const Storm: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const b = useB();
  const t = f / fps;
  const W = Y.wall;
  const MAJOR = 7;
  // The camera creeps in and rolls a fraction of a degree: the room closing in.
  const push = interpolate(t, [0.8, Y.wall_end], [1, 1.14], clamp);
  const roll = interpolate(t, [0.8, Y.wall_end], [0, -1.2], clamp);
  return (
    <AbsoluteFill style={{ background: C.plumBlack, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push}) rotate(${roll}deg)` }}>
        {W.map((w, i) => {
          if (t < w.t) return null;
          const age = t - w.t;
          if (i < MAJOR) {
            // The big ones drop in at the centre; each new one pushes the older ones back into a stack.
            const newer = W.slice(i + 1, MAJOR).filter((n) => t >= n.t).length;
            const lastAt = newer > 0 ? W[i + newer].t : w.t;
            const d = newer === 0 ? 0 : newer - 1 + interpolate(t - lastAt, [0, 0.3], [0, 1], { ...clamp, easing: EXPO_OUT });
            const inP = interpolate(age, [0, 0.28], [0, 1], { ...clamp, easing: EXPO_OUT });
            const sc = (1 - 0.08 * d) * (0.9 + 0.1 * inP);
            return (
              <div key={i} style={{
                position: 'absolute', left: width / 2, top: height / 2, zIndex: 100 - newer,
                transform: `translate(-50%, -50%) translateY(${-(1 - inP) * 6 * b - d * 3.4 * b}px) scale(${sc})`,
                opacity: inP,
                filter: d > 0.05 ? `brightness(${Math.max(0.35, 1 - d * 0.18)}) blur(${Math.min(6, d * 1.5)}px)` : undefined,
              }}>
                <Card title={w.text} sub={SUB[w.text]} b={b} scale={1.55} />
              </div>
            );
          }
          // The rest arrive from everywhere, at every depth, faster and faster.
          const rx = random(`x-${i}`), ry = random(`y-${i}`), rz = random(`z-${i}`);
          const x = 0.14 + 0.72 * rx;
          const y = 0.08 + 0.84 * ry;
          const sc = 0.65 + 0.7 * rz;
          const inP = interpolate(age, [0, 0.18], [0, 1], { ...clamp, easing: EXPO_OUT });
          const fromX = (rx < 0.5 ? -1 : 1) * 6 * b;
          return (
            <div key={i} style={{
              position: 'absolute', left: x * width, top: y * height, zIndex: Math.round(rz * 90) + (rz > 0.6 ? 20 : 0),
              transform: `translate(-50%, -50%) translateX(${(1 - inP) * fromX}px) scale(${sc * (0.92 + 0.08 * inP)})`,
              // WHY brightness, not opacity, for depth: see-through cards stacked their text into a smear.
              opacity: inP, filter: `brightness(${0.55 + 0.45 * rz})${rz < 0.35 ? ` blur(${(0.35 - rz) * 8}px)` : ''}`,
            }}>
              <Card title={w.text} b={b} scale={1.15} />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 10–16 s: the turn
const Turn: React.FC = () => {
  const b = useB();
  const base = Y.wall_end;
  return (
    <AbsoluteFill style={{ background: C.plumBlack }}>
      <Sequence from={s(10.45 - base)} durationInFrames={s(13.95 - 10.45)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Reveal dark text="Everything became a subscription." purple={['subscription.']} size={4.6 * b} out={s(13.95 - 10.45) - 10} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={s(14.55 - base)} durationInFrames={s(Y.flood - 14.55)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Reveal dark text="Not anymore." size={7 * b} stagger={5} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

/** 16.0: light floods out from the centre. */
const Flood: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = interpolate(f, [s(at), s(at) + 12], [0, 1], { ...clamp, easing: EXPO_OUT });
  if (f < s(at) || p >= 1) return null;
  const r = Math.hypot(width, height) / 2;
  const mask = `radial-gradient(circle at 50% 50%, transparent ${p * r}px, black ${p * r + r * 0.08}px)`;
  return <AbsoluteFill style={{ background: C.plumBlack, WebkitMaskImage: mask, maskImage: mask }} />;
};

// ------------------------------------------------------------------ the request
/** Where the message box sits in the desktop takes (fractions of the frame), measured 2026-11-18. */
const BAR = { x0: 0.012, x1: 0.38, y0: 0.888, y1: 0.952 };

/**
 * The request: the app behind, out of focus; the message bar in front, sharp and big enough to
 * read at a glance. Both are the same take at the same moment (nothing is redrawn).
 */
const AskShot: React.FC<{ a: Ask; dur: number }> = ({ a, dur }) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t0 = mark(a.clip, 'typed');
  const t1 = mark(a.clip, 'typed', 'end');
  const rate = (t1 - t0) / a.say_len;
  const from = Math.max(0, t0 - Y.ask_voice_at * rate);
  const t = f / fps;
  const cw = width * 0.84;
  const vw = cw / (BAR.x1 - BAR.x0);
  const vh = vw / aspectOf(a.clip);
  const ch = vh * (BAR.y1 - BAR.y0);
  const inP = interpolate(t, [0, 0.45], [0, 1], { ...clamp, easing: EXPO_OUT });
  const send = Y.ask_voice_at + a.say_len + 0.05; // the moment they finish speaking = Enter
  const outP = interpolate(t, [send, dur], [0, 1], { ...clamp, easing: IN_OUT });
  const video = (style: React.CSSProperties) => (
    <OffthreadVideo src={staticFile(`footage/${a.clip}.webm`)} startFrom={Math.round(from * fps)} playbackRate={rate} muted style={style} />
  );
  return (
    <AbsoluteFill style={{ background: C.lavender }}>
      <AbsoluteFill style={{ transform: `scale(${1.12 + 0.04 * t / dur})`, filter: 'blur(30px) saturate(1.25) brightness(0.86)' }}>
        {video({ width, height, objectFit: 'cover' })}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: cw, height: ch, borderRadius: ch / 2, overflow: 'hidden', position: 'relative',
            transform: `translateY(${(1 - inP) * ch * 0.6 - outP * ch * 0.5}px) scale(${(0.94 + 0.06 * inP) * (1 + 0.04 * outP)})`,
            opacity: inP * (1 - outP),
            boxShadow: `0 ${ch * 0.25}px ${ch * 0.7}px rgba(60,20,100,.22), 0 ${ch * 0.05}px ${ch * 0.12}px rgba(60,20,100,.12)`,
            WebkitMaskImage: 'linear-gradient(90deg, black 86%, transparent 99%)', maskImage: 'linear-gradient(90deg, black 86%, transparent 99%)',
          }}
        >
          <div style={{ position: 'absolute', left: -BAR.x0 * vw, top: -BAR.y0 * vh, width: vw, height: vh }}>
            {video({ width: vw, height: vh, display: 'block' })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the result: a floating screen
export type PlaneKey = [t: number, x: number, y: number, w: number, ry: number, rx: number];

const lerpKeys = (keys: PlaneKey[], t: number) => {
  const ts = keys.map((k) => k[0]);
  const p = (i: number) => (keys.length === 1 ? keys[0][i] : interpolate(t, ts, keys.map((k) => k[i]), { ...clamp, easing: IN_OUT }));
  return { x: p(1), y: p(2), w: p(3), ry: p(4), rx: p(5) };
};

/**
 * The real screen as a floating pane: depth, a soft plum shadow on the "floor" and a faint
 * sheen from above. x/y = centre in frame fractions, w = width as a share of frame width.
 */
const Plane: React.FC<{ clip: string; from: number; rate?: number; keys: PlaneKey[]; cam?: ScreenKey[]; opacity?: number; z?: number }> = ({
  clip, from, rate = 1, keys, cam, opacity = 1, z = 0,
}) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = lerpKeys(keys, f / fps);
  const w = p.w * width;
  const h = w / aspectOf(clip);
  const r = w * 0.012;
  return (
    <AbsoluteFill style={{ perspective: width * 1.3, opacity, zIndex: z }}>
      <div style={{ position: 'absolute', left: p.x * width, top: p.y * height, transform: 'translate(-50%, -50%)' }}>
        <div style={{ position: 'absolute', left: '50%', top: h / 2 + h * 0.06, width: w * 0.95, height: h * 0.14, transform: 'translate(-50%, 0)', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(60,20,100,.28), rgba(60,20,100,0))', filter: `blur(${w * 0.015}px)` }} />
        <div style={{ transform: `rotateY(${p.ry}deg) rotateX(${p.rx}deg)`, borderRadius: r, overflow: 'hidden', position: 'relative', boxShadow: `0 ${w * 0.03}px ${w * 0.07}px rgba(60,20,100,.20), 0 0 0 1px rgba(33,21,44,.08)` }}>
          <Screen clip={clip} from={from} rate={rate} w={w} h={h} cam={cam} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 38%)', pointerEvents: 'none' }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

type Layout = { plane: PlaneKey[]; text: React.CSSProperties; align: 'left' | 'center' | 'right' };
// One composition per request, so the run never repeats itself.
const LAYOUTS: Record<string, Layout> = {
  house: { plane: [[0, 0.65, 0.5, 0.6, -16, 2], [2, 0.63, 0.5, 0.63, -9, 1]], text: { left: '6%', top: 0, bottom: 0, justifyContent: 'center' }, align: 'left' },
  money: { plane: [[0, 0.34, 0.52, 0.6, 14, 2], [2, 0.35, 0.5, 0.63, 7, 1]], text: { right: '6%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-end' }, align: 'right' },
  paint: { plane: [[0, 0.5, 0.6, 0.6, 0, 18], [2, 0.5, 0.58, 0.64, 0, 9]], text: { paddingTop: '5%', alignItems: 'center' }, align: 'center' },
  trip: { plane: [[0, 0.66, 0.46, 0.6, -6, -10], [2, 0.64, 0.5, 0.63, -12, -3]], text: { left: '6%', top: 0, bottom: 0, justifyContent: 'center' }, align: 'left' },
  look: { plane: [[0, 0.5, 0.42, 0.58, 0, 6], [2, 0.5, 0.42, 0.62, 0, 3]], text: { paddingBottom: '4.5%', justifyContent: 'flex-end', alignItems: 'center' }, align: 'center' },
};

const RESULT: Record<string, { clip: string; from: number; rate?: number; cam?: ScreenKey[] }> = {
  house: { clip: 'house-ask', from: mark('house-ask', 'favorites') + 0.1, cam: [[0, 1, 0.5, 0.5], [2, 1.08, 0.35, 0.4]] },
  money: { clip: 'money', from: mark('money', 'spending', 'end') + 0.15, cam: [[0, 1.02, 0.4, 0.45], [2, 1.12, 0.32, 0.45]] },
  paint: { clip: 'paint-page', from: END('paint-page') - 7, rate: 3, cam: [[0, 1, 0.5, 0.5], [2, 1.06, 0.45, 0.5]] },
  trip: { clip: 'trip', from: mark('trip', 'page') - 0.05, cam: [[0, 1, 0.5, 0.4], [2, 1.08, 0.4, 0.4]] },
};

export const resultAt = (a: Ask) => Y.ask_voice_at + a.say_len + 0.3;

const Moment: React.FC<{ a: Ask; dur?: number }> = ({ a, dur = 4 }) => {
  const b = useB();
  const ra = resultAt(a);
  const L = LAYOUTS[a.id];
  const rd = dur - ra;
  // Every result's camera move is stretched over however long that result is on screen.
  const k = (t: number) => t * (rd / 2);
  const shift = (keys: PlaneKey[]): PlaneKey[] => keys.map(([t, ...rest]) => [k(t), ...rest] as PlaneKey);
  return (
    <Sequence from={s(a.at)} durationInFrames={s(dur)} layout="none">
      <Sequence durationInFrames={s(ra)} layout="none"><AskShot a={a} dur={ra} /></Sequence>
      <Sequence from={s(ra)} layout="none">
        <Ground />
        {a.id === 'look' ? <Looks keys={shift(L.plane)} dur={rd} /> : (
          <Plane clip={RESULT[a.id].clip} from={RESULT[a.id].from} rate={RESULT[a.id].rate} keys={shift(L.plane)}
            cam={RESULT[a.id].cam?.map(([t, ...r]) => [k(t), ...r] as ScreenKey)} />
        )}
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', padding: 0, ...L.text }}>
          <Reveal text={a.line} purple={[a.purple]} size={5.4 * b} align={L.align} start={s(a.id === 'look' ? 0.95 : 0.12)} />
        </AbsoluteFill>
      </Sequence>
    </Sequence>
  );
};

export const LOOK_FLIPS = ['cotton-candy-sky', 'meadow-mist', 'golden-sunbreak', 'halftone-dimension'];
export const LOOK_STEP = 0.22;

/** "make it feel like golden hour": the screen changes four times, then lands on the warm desert. */
const Looks: React.FC<{ keys: PlaneKey[]; dur: number }> = ({ keys, dur }) => (
  <>
    {LOOK_FLIPS.map((k, i) => (
      <Sequence key={k} from={s(i * LOOK_STEP)} durationInFrames={s(LOOK_STEP)} layout="none">
        <Plane clip={`look-${k}`} from={mark(`look-${k}`, 'held') + 0.2} keys={keys.map(([t, x, y, w, ry, rx]) => [t, x, y, w, ry + (i % 2 ? 5 : -5), rx] as PlaneKey)} />
      </Sequence>
    ))}
    <Sequence from={s(LOOK_FLIPS.length * LOOK_STEP)} layout="none">
      <Plane clip="look-devils-garden" from={mark('look-devils-garden', 'held') - 0.4} keys={keys} cam={[[0, 1, 0.5, 0.5], [dur, 1.05, 0.55, 0.45]]} />
    </Sequence>
  </>
);

// ------------------------------------------------------------------ 36–40: quick run, then "Just ask."
const JustAsk: React.FC<{ at: number }> = ({ at }) => {
  const b = useB();
  const { width, height } = useVideoConfig();
  const shots: [string, number, number, number, number][] = [
    ['house-ask', mark('house-ask', 'lamp') + 0.6, 1.3, 0.38, 0.38],
    ['money', mark('money', '1y', 'end') + 0.4, 1.7, 0.2, 0.45],
    ['paint-page', END('paint-page') - 1.2, 1.2, 0.44, 0.53],
  ];
  return (
    <>
      {shots.map(([clip, from, sc, x, y], i) => (
        <Sequence key={i} from={s(at + i * 0.5)} durationInFrames={s(0.5)} layout="none">
          <Screen clip={clip} from={from} w={width} h={height} cam={[[0, sc, x, y], [0.5, sc * 1.05, x, y]]} />
        </Sequence>
      ))}
      {/* The same home page, on a phone: one beat that says "everywhere" without a word. */}
      <Sequence from={s(at + 1.5)} durationInFrames={s(0.5)} layout="none">
        <Ground />
        <Phone sh={height * 0.82} pose={[[0, 0.5, 0.5, 1.0, -8, 2], [0.5, 0.5, 0.5, 1.03, -5, 2]]} clip="phone-house" from={mark('phone-house', 'lamp') - 0.2} />
      </Sequence>
      <Sequence from={s(at + 2)} durationInFrames={s(2)} layout="none">
        <Ground />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Reveal text="Just ask." purple={['ask.']} size={9 * b} stagger={5} />
        </AbsoluteFill>
      </Sequence>
    </>
  );
};

// ------------------------------------------------------------------ 40–46: everything they made
const Gallery: React.FC<{ at: number; dur: number }> = ({ at, dur }) => {
  const b = useB();
  // Each pane drifts at its own depth while the camera pulls back: a collection, not a slideshow.
  const panes: { clip: string; from: number; rate?: number; k0: PlaneKey; k1: PlaneKey }[] = [
    { clip: 'trip', from: mark('trip', 'scroll'), k0: [0, 0.17, 0.25, 0.3, 18, 4], k1: [dur, 0.13, 0.23, 0.25, 22, 4] },
    { clip: 'money', from: mark('money', 'spending', 'end'), k0: [0, 0.83, 0.25, 0.3, -18, 4], k1: [dur, 0.87, 0.23, 0.25, -22, 4] },
    { clip: 'paint-page', from: END('paint-page') - 5, rate: 2, k0: [0, 0.18, 0.7, 0.3, 16, -4], k1: [dur, 0.14, 0.73, 0.25, 20, -4] },
    { clip: 'house-ask', from: mark('house-ask', 'lamp'), k0: [0, 0.82, 0.7, 0.3, -16, -4], k1: [dur, 0.86, 0.73, 0.25, -20, -4] },
    { clip: 'look-devils-garden', from: mark('look-devils-garden', 'held'), k0: [0, 0.5, 0.42, 0.5, 0, 3], k1: [dur, 0.5, 0.4, 0.4, 0, 3] },
  ];
  return (
    <Sequence from={s(at)} durationInFrames={s(dur)} layout="none">
      <Ground />
      {panes.map((p, i) => (
        <Plane key={i} clip={p.clip} from={p.from} rate={p.rate} keys={[p.k0, p.k1]} z={i === 4 ? 2 : 1} />
      ))}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '5%', zIndex: 5 }}>
        <Reveal text="Yours." purple={['Yours.']} size={8 * b} start={s(1.4)} />
      </AbsoluteFill>
    </Sequence>
  );
};

const FreeOpen: React.FC<{ at: number; until: number }> = ({ at, until }) => {
  const b = useB();
  return (
    <Sequence from={s(at)} durationInFrames={s(until - at)} layout="none">
      <Ground />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Reveal text="Free. And open source." purple={['open', 'source.']} size={6.2 * b} start={s(0.2)} out={s(until - at) - 10} stagger={4} />
      </AbsoluteFill>
    </Sequence>
  );
};

export const Yours60: React.FC = () => (
  <AbsoluteFill>
    <Ground />
    <Sequence durationInFrames={s(Y.wall_end)} layout="none"><Storm /></Sequence>
    <Sequence from={s(Y.wall_end)} durationInFrames={s(Y.flood - Y.wall_end)} layout="none"><Turn /></Sequence>
    {Y.asks.map((a) => <Moment key={a.id} a={a} />)}
    <JustAsk at={36} />
    <Gallery at={40} dur={6} />
    <FreeOpen at={46} until={Y.logo} />
    <Sequence from={s(Y.logo)} layout="none">
      <Ground />
      <EndCard start={0} addressAt={s(3.2)} withTagline />
    </Sequence>
    <Flood at={Y.flood} />
  </AbsoluteFill>
);
