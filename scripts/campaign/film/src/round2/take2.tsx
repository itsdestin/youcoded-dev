// Round two, take 2: "Make it mine". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// One person, three short conversations with their youcoded, and it changing in front of them.
//
// WHAT IS REAL: every frame of the app window (its frame, chat, typed messages, replies, the theme
// changing, the rain, the page view) is footage of the real renderer, filmed by scripts/ui-review/record.mjs
// from scenes/r2-look.json, r2-home.json and r2-money.json. The "Rainy Tokyo" look is a real theme handed to
// the app's own theme engine (take2-make-theme.mjs). WHAT IS STAGED (brand guide section 8, ads only): what
// the person makes inside the page view (take2-ui.tsx) and the morning email.
//
// Music grid (scripts/campaign/music, composed to these numbers): 120 BPM, bar 2.0 s, beat 0.5 s.
// Sections: look 0 · home 14 · money 30 · payoff 46 · lines 50 · name 56. Every cut and every visible
// change below sits on a beat. Second pass (2026-11-20 review): faster opening, the look changes wash in,
// the developer clutter is hidden at record time, the payoff shows everything they made.
import React from 'react';
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { Day, EndCard, Line, mark } from '../kit';
import manifest from '../footage.json';
import { HomeUI, KawaiiEmail, MoneyUI } from './take2-ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const s2f = (s: number) => Math.round(s * FPS);
const ease01 = (t: number, a: number, b: number, e = EASE_IN_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });

// ------------------------------------------------------------------ the footage
// All three takes are 2880 x 1802 at zoom 3.2 (CSS 900 x 563). The page view's content box, measured from
// the filmed frame (its 1px border sits at x 27 / 2852 and y 174 / 1774): staged things are drawn inside it.
const FW = 2880, FH = 1802, CSS = 3.2;
const BOX = { x: 28, y: 176, w: 2823, h: 1597, r: 30 };
const CLIPS = manifest as unknown as Record<string, { file: string; duration: number }>;
type Seg = { clip: string; from: number; at: number; out: number; rate?: number };

/** Shots back to back with hard cuts (cuts land on beats). A shot whose `rate` is above 1 is the build
 *  sped up (owner: "the shown build process can be GREATLY sped up"); typing and replies play at true speed. */
const Footage: React.FC<{ segs: Seg[] }> = ({ segs }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {segs.map((s, i) => {
        if (frame < s2f(s.at) - 1 || frame >= s2f(s.out) + 1) return null;
        const info = CLIPS[s.clip];
        if (!info) return null;
        return (
          // WHY a Sequence per shot: the video counts time from its Sequence, so each shot starts at its `from`.
          <Sequence key={i} from={s2f(s.at)} durationInFrames={Math.max(1, s2f(s.out) - s2f(s.at))} layout="none">
            <AbsoluteFill>
              <OffthreadVideo src={staticFile(info.file)} muted playbackRate={s.rate ?? 1} trimBefore={Math.max(0, Math.round(s.from * FPS))}
                style={{ width: FW, height: FH }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

/** A look change washing across the window: `before` (the old look, held still) is masked away as the new
 *  look (the footage underneath) arrives, with a band of neon light and rain riding the edge.
 *  WHY not the app's own instant swap: on screen it was a hard cut with a two-frame repaint flash; the
 *  person asked for a whole new world, so the change is shown arriving, like weather. Both looks are real
 *  frames of the app; only the moment between them is drawn. */
type Wash = { p: number; before: React.ReactNode; dir: 'down' | 'right'; tint: [string, string] };
const WashOver: React.FC<{ w: Wash; W: number; H: number }> = ({ w, W, H }) => {
  if (w.p >= 1) return null;
  // WHY a narrow soft zone under a bright seam: the two looks lay the window out slightly differently, so a
  // wide blend between them showed doubled text. The seam of light covers the join.
  const edge = w.p * 1.12 - 0.06;           // edge position as a fraction; starts just off-window, ends past it
  const soft = 0.035;
  const ang = w.dir === 'down' ? '180deg' : '90deg';
  const mask = `linear-gradient(${ang}, transparent ${edge * 100}%, #000 ${(edge + soft) * 100}%)`;
  const along = w.dir === 'down' ? H : W;
  const pos = (edge + soft * 0.5) * along;
  const vis = Math.min(1, w.p * 8) * Math.min(1, (1 - w.p) * 8);
  const band = (thick: number, blur: number, a: number, col: string): React.CSSProperties => ({
    position: 'absolute', opacity: vis * a, filter: blur ? `blur(${blur}px)` : undefined,
    ...(w.dir === 'down'
      ? { left: -40, width: W + 80, top: pos - thick / 2, height: thick, background: `linear-gradient(180deg, transparent, ${col}, transparent)` }
      : { top: -40, height: H + 80, left: pos - thick / 2, width: thick, background: `linear-gradient(90deg, transparent, ${col}, transparent)` }),
  });
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: mask, maskImage: mask }}>{w.before}</div>
      {/* the leading light: a wide neon glow, a bright core over the seam, and rain falling through it */}
      <div style={band(along * 0.22, along * 0.02, 0.8, w.tint[0] + 'AA')} />
      <div style={band(along * 0.07, along * 0.008, 1, w.tint[1])} />
      <div style={band(along * 0.012, 1, 1, '#FFFFFF')} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: vis }}>
        {Array.from({ length: 70 }, (_, i) => {
          // streaks scattered just behind the edge, each falling a little with the progress
          const r1 = ((i * 7919) % 1000) / 1000, r2 = ((i * 104729) % 1000) / 1000;
          const x = w.dir === 'down' ? r1 * W : pos - along * 0.12 + r1 * along * 0.12;
          const y = w.dir === 'down' ? pos - along * 0.14 + r2 * along * 0.14 + w.p * along * 0.05 : r2 * H + w.p * H * 0.08;
          const len = (40 + r2 * 110) * (H / 1080);
          return <line key={i} x1={x} y1={y} x2={x - len * 0.16} y2={y + len} stroke={i % 3 ? w.tint[1] : '#ffffff'} strokeOpacity={0.3 + 0.5 * r1} strokeWidth={(2 + r2 * 3) * (H / 1080)} strokeLinecap="round" />;
        })}
      </svg>
    </>
  );
};

/** The app window: footage (plus anything staged inside its page view), rounded and lit, at a camera. */
const AppWindow: React.FC<{ segs: Seg[]; content?: React.ReactNode; z: number; cx: number; cy: number; fx?: number; fy?: number; opacity?: number; glow?: number; light?: boolean; wash?: Wash }> =
  ({ segs, content, z, cx, cy, fx = 0.5, fy = 0.5, opacity = 1, glow = 0, light, wash }) => {
    const k = z * (1640 / FW);   // z = 1 draws the window 1640 film px wide
    return (
      <div style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH, transformOrigin: '0 0', opacity,
        transform: `translate(${cx - fx * FW * k}px, ${cy - fy * FH * k}px) scale(${k})` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 40, overflow: 'hidden',
          // one soft shadow; on the night field the window also casts a little of its own neon
          boxShadow: light
            ? '0 60px 160px rgba(74,38,110,0.30), 0 12px 40px rgba(74,38,110,0.22), 0 0 0 3px rgba(201,176,219,0.7)'
            : `0 70px 180px rgba(0,0,0,0.6), 0 0 ${200 * glow}px rgba(43,127,255,${0.28 * glow}), 0 0 0 3px rgba(80,110,170,0.35)` }}>
          <Footage segs={segs} />
          {content && (
            <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, borderRadius: BOX.r, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: BOX.w / CSS, height: BOX.h / CSS, transform: `scale(${CSS})`, transformOrigin: '0 0' }}>{content}</div>
            </div>
          )}
          {wash && <WashOver w={wash} W={FW} H={FH} />}
        </div>
      </div>
    );
  };
/** One still frame of a take (WHY Freeze: the shot's own clock is pinned, so it never moves). */
const Still: React.FC<{ clip: string; at: number }> = ({ clip, at }) => (
  <Freeze frame={0}><Footage segs={[{ clip, from: at, at: 0, out: 1 }]} /></Freeze>
);

// ------------------------------------------------------------------ camera
// [time, zoom, focus x, focus y]: the window point (fx, fy) sits at the frame centre. Two keys at the same
// time are a cut. Between keys the camera glides on the brand's in-out curve, never linearly.
type Key = [number, number, number, number];
const camAt = (keys: Key[], t: number) => {
  if (t <= keys[0][0]) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[0] && t < b[0]) {
      if (b[0] === a[0]) return b;
      const p = ease01(t, a[0], b[0]);
      return [t, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p, a[3] + (b[3] - a[3]) * p] as Key;
    }
  }
  return keys[keys.length - 1];
};
// Framings. WHY the chat is always the WHOLE window (z 1.05 is 1077 px tall, inside the 1080 frame): the
// header, the conversation and the message box are all in view, no bar is ever half cut, and chat text is
// still ~25 px tall. Life comes from a slow drift between 1.0 and 1.05, not from cropping.
const CHAT = (t: number, z = 1.05): Key => [t, z, 0.5, 0.5];
const WIDE = (t: number, z = 0.9): Key => [t, z, 0.5, 0.5];
// The page view: at z <= 1.0 the whole page content box sits inside the frame's 8% side margins.
const PAGE = (t: number, z = 0.97): Key => [t, z, 0.5, 0.5];

// ------------------------------------------------------------------ the timeline, built from the takes' marks
const L = 'r2-look', HM = 'r2-home', MN = 'r2-money';
const m = (clip: string, label: string, edge: 'start' | 'end' = 'start') => mark(clip, label, edge);
/** A shot that plays from `from` until the footage reaches `until`, starting at film time `at` (rate 1). */
const play = (clip: string, from: number, at: number, until: number, rate = 1): Seg => ({ clip, from, at, out: at + (until - from) / rate, rate });
/** A sped-up shot that squeezes footage [from, until] into film [at, out]. */
const squeeze = (clip: string, from: number, until: number, at: number, out: number): Seg => ({ clip, from, at, out, rate: (until - from) / (out - at) });

// A LOOK (0-14). WHY this pace (review, 2026-11-20: "an empty chat for seven seconds"): the film opens on
// the first question already being finished and sent; the answer lands in the first second; the neon
// arrives at 4.5 s. Thinking pauses and the build are squeezed; a held message box is cut, never shown.
const T_NEON = 4.5, T_NEON_END = 5.3, T_LESS = 10.0, T_LESS_END = 10.6;
const lookSegs = (): Seg[] => {
  const a = play(L, m(L, 'type1', 'end') - 0.4, 0, m(L, 'type1', 'end'));                       // 0.0: "…whole thing looks?" finishing
  const b = squeeze(L, m(L, 'send1') - 0.04, m(L, 'reply1', 'end') + 0.05, a.out, 1.0);          // sent; the answer lands
  const c = play(L, m(L, 'reply1', 'end') + 0.05, 1.0, m(L, 'reply1', 'end') + 0.55);             // a breath to read it
  const d = play(L, m(L, 'type2') - 0.02, 1.5, m(L, 'type2', 'end'), 1.5);                       // 1.5: "idk. kinda rainy tokyo…" (typed 1.5x)
  const e = squeeze(L, m(L, 'send2') - 0.03, m(L, 'swap1') - 0.05, d.out, T_NEON);               // sent; the build, sped up
  const f = play(L, m(L, 'swap1') + 0.35, T_NEON, m(L, 'swap1') + 0.35 + 3.5);                   // 4.5: neon and rain wash in
  const g = play(L, m(L, 'type3') - 0.04, 8.0, m(L, 'type3', 'end'));                             // 8.0: "ok yeah. less pink tho"
  const h = squeeze(L, m(L, 'send3') - 0.03, m(L, 'swap2') - 0.05, g.out, T_LESS);
  const i = play(L, m(L, 'swap2') + 0.35, T_LESS, CLIPS[L] ? CLIPS[L].duration - 0.2 : 20, 0.85); // 10.0: it shifts
  return [a, b, c, d, e, f, g, h, { ...i, out: 14.0 }];
};
const homeSegs = (): Seg[] => {
  const a = play(HM, m(HM, 'type1') - 0.1, 14.0, m(HM, 'send1') + 0.1);                         // 14.1: "i want youcoded to manage my smart home"
  const b = { clip: HM, from: m(HM, 'send1') + 0.1, at: a.out, out: 17.0, rate: 1.8 };             // the reply arrives (thinking shortened)
  const c = play(HM, m(HM, 'type2') - 0.04, 17.0, m(HM, 'type2') + 2.96);                        // 17.0: "epic. can we put my room on the front…"
  const page = (at: number, out: number, rate: number): Seg => ({ clip: HM, from: m(HM, 'pagehold'), at, out, rate });
  const d = play(HM, m(HM, 'type3') - 0.04, 23.0, m(HM, 'type3') + 2.46);                        // 23.0: "perfect. now make the sliders bigger…"
  return [a, b, c, page(20.0, 23.0, 0.75), d, page(25.5, 30.0, 0.85)];
};
const moneyPage = (at: number, out: number, rate: number): Seg => ({ clip: MN, from: m(MN, 'pagehold'), at, out, rate });
const moneySegs = (): Seg[] => [
  play(MN, m(MN, 'type1') - 0.1, 30.0, m(MN, 'type1') + 2.4),                                   // 30.1: "can we connect my bank…"
  moneyPage(32.5, 35.0, 0.9),
  play(MN, m(MN, 'type2') - 0.04, 35.0, m(MN, 'type2') + 4.46),                                 // 35.0: "can it pull out my recurring bills…" → "Yes. Found eleven."
  moneyPage(39.5, 41.5, 0.9),
  play(MN, m(MN, 'type3') - 0.04, 41.5, m(MN, 'type3') + 1.5),                                  // 41.5: "send me those numbers every morning…"
  moneyPage(43.0, 46.0, 0.6),
];
const HOME_T = { build: 20.0, rearrange: 21.0, bigger: 26.0 };
const MONEY_T = { connect: 32.5, bills: 39.5 };
const T_EMAIL = 43.0, T_BEFORE = 46.0, T_AFTER = 47.0;

const CAM: Key[] = [
  // a look: the whole window throughout; it eases back a touch as the neon arrives, then settles
  CHAT(0, 1.02), CHAT(4.3, 1.05), WIDE(5.6, 0.94), CHAT(8.0, 1.03), CHAT(9.8, 1.05), WIDE(11.0, 0.95), CHAT(14.0, 1.0),
  // their home
  CHAT(14.0, 1.02), CHAT(20.0, 1.05),
  PAGE(20.0, 0.95), PAGE(23.0, 0.99),
  CHAT(23.0, 1.02), CHAT(25.5, 1.05),
  PAGE(25.5, 0.95), PAGE(30.0, 0.99),
  // their money
  CHAT(30.0, 1.02), CHAT(32.5, 1.05),
  PAGE(32.5, 0.95), PAGE(35.0, 0.99),
  CHAT(35.0, 1.02), CHAT(39.5, 1.05),
  PAGE(39.5, 0.95), PAGE(41.5, 0.98),
  CHAT(41.5, 1.02), CHAT(43.0, 1.05),
  PAGE(43.0, 0.9), PAGE(46.0, 0.92),
];

// ------------------------------------------------------------------ the field around the window
/** Lavender while the app wears its first look; the brand's night from the moment the neon washes in
 *  (eased with the wash, so the surround never flashes); lavender again for the "before" at 46. */
const Field: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const night = t < T_BEFORE ? ease01(t, T_NEON, T_NEON_END) : 0;
  return (
    <AbsoluteFill>
      <Day />
      <AbsoluteFill style={{ opacity: night, background: `radial-gradient(ellipse 80% 70% at 50% 55%, #1A1236 0%, ${C.night} 70%)` }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the film
export const Take2: React.FC<{ narrator?: boolean }> = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const segs = React.useMemo(() => [...lookSegs(), ...homeSegs(), ...moneySegs()], []);
  const [, z, fx, fy] = camAt(CAM, t);
  const onPage = (a: number, b: number) => t >= a && t < b;
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const content = onPage(20, 23) || onPage(25.5, 30) ? <HomeUI W={W} H={H} T={HOME_T} />
    : onPage(32.5, 35) || onPage(39.5, 41.5) || onPage(43, 46) ? <MoneyUI W={W} H={H} T={MONEY_T} /> : undefined;
  const glow = ease01(t, T_NEON, T_NEON + 0.8);
  // the two look changes, each washing across the whole window
  const wash: Wash | undefined =
    t >= T_NEON && t < T_NEON_END ? { p: ease01(t, T_NEON, T_NEON_END, EASE_IN_OUT), before: <Still clip={L} at={m(L, 'swap1') - 0.05} />, dir: 'down', tint: ['#FF3FA4', '#2DE2FF'] }
      : t >= T_LESS && t < T_LESS_END ? { p: ease01(t, T_LESS, T_LESS_END, EASE_IN_OUT), before: <Still clip={L} at={m(L, 'swap2') - 0.05} />, dir: 'right', tint: ['#2B7FFF', '#2DE2FF'] }
        : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take2-mix.wav')} />
      {t < T_BEFORE && <Field />}
      {t < T_BEFORE && <AppWindow segs={segs} content={content} z={z} cx={960} cy={540} fx={fx} fy={fy} glow={glow} light={t < T_NEON} wash={wash} />}
      <Email />
      {t >= T_BEFORE && <AbsoluteFill style={{ background: C.night }} />}
      {t >= T_BEFORE && t < 50 && <Payoff />}
      {/* 50-56: the two lines, then the name */}
      <Line dark text="stop waiting for *updates.*" at={50.1} out={52.4} size={6.4} />
      <Line dark text="make anything you can imagine, / just by *asking.*" at={52.5} out={55.95} size={5.6} />
      <EndCard at={56.0} />
    </AbsoluteFill>
  );
};

/** The kawaii email: springs up over the money page on the 43.0 downbeat and holds three seconds. */
const Email: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  if (t < T_EMAIL || t >= T_BEFORE) return null;
  const inn = spring({ frame: frame - s2f(T_EMAIL), fps: FPS, config: { damping: 13, stiffness: 120, mass: 0.9 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(6,4,16,0.55)', opacity: Math.min(inn, 1) }} />
      <div style={{ position: 'absolute', left: 960 - 320, top: 70, width: 640,
        transform: `translateY(${(1 - inn) * 900}px) rotate(${(1 - inn) * 8 - 1.5}deg)` }}>
        <KawaiiEmail w={640} at={T_EMAIL} />
      </div>
    </AbsoluteFill>
  );
};

/** 46-50: the payoff. The app exactly as it started (46.0), then the same neon wash sweeps the whole frame
 *  (47.0) and leaves everything the person made, at once, in their look: the conversation, their room,
 *  their money and the morning email. WHY the wash again: it is the film's own sign for "it changed",
 *  so the viewer reads the second picture as the first one, transformed, with no label needed. */
const Payoff: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const p = ease01(t, T_AFTER, T_AFTER + 0.8, EASE_IN_OUT);
  const outro = ease01(t, 49.5, 49.95, EASE_IN);
  const settle = (d: number) => spring({ frame: frame - s2f(T_AFTER + 0.15 + d), fps: FPS, config: { damping: 16, stiffness: 110 } });
  const drift = ease01(t, T_AFTER, 50, (x) => x);
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const before = (
    <AbsoluteFill>
      <Day />
      <AppWindowStill z={1.0 + 0.03 * ease01(t, T_BEFORE, T_AFTER)} />
    </AbsoluteFill>
  );
  // where each made thing sits (inside the 8% safe margins), and how it rises into place
  const item = (d: number) => {
    const s = settle(d);
    return { opacity: Math.min(1, s * 1.4), dy: (1 - s) * 60, ds: 0.94 + 0.06 * s };
  };
  const home = item(0), money = item(0.08), chat = item(0.16), mail = item(0.3);
  const after = (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 55%, #1A1236 0%, ${C.night} 70%)` }}>
      <div style={{ position: 'absolute', inset: 0, opacity: home.opacity, transform: `translateY(${home.dy}px)` }}>
        <AppWindow segs={[{ clip: HM, from: m(HM, 'pagehold'), at: T_BEFORE, out: 50, rate: 0.5 }]} content={<HomeUI W={W} H={H} T={HOME_T} />} z={0.5 * home.ds * (1 + 0.02 * drift)} cx={570} cy={345} glow={0.6} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: money.opacity, transform: `translateY(${money.dy}px)` }}>
        <AppWindow segs={[{ clip: MN, from: m(MN, 'pagehold'), at: T_BEFORE, out: 50, rate: 0.5 }]} content={<MoneyUI W={W} H={H} T={MONEY_T} />} z={0.5 * money.ds * (1 + 0.02 * drift)} cx={1350} cy={345} glow={0.6} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: chat.opacity, transform: `translateY(${chat.dy}px)` }}>
        <AppWindow segs={[{ clip: L, from: m(L, 'swap2') + 1.2, at: T_BEFORE, out: 50, rate: 0.6 }]} z={0.58 * chat.ds * (1 + 0.02 * drift)} cx={900} cy={690} glow={1} />
      </div>
      <div style={{ position: 'absolute', left: 1590 - 165, top: 610, width: 330, opacity: mail.opacity, transform: `translateY(${mail.dy}px) rotate(-2deg) scale(${mail.ds})` }}>
        <KawaiiEmail w={330} at={T_EMAIL} />
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ opacity: 1 - outro }}>
      {after}
      {/* the "before" is wiped away top to bottom by the same neon light */}
      <FrameWash p={p}>{before}</FrameWash>
    </AbsoluteFill>
  );
};
/** The starting look as the film first showed it: the light app with the first exchange, frozen. */
const AppWindowStill: React.FC<{ z: number }> = ({ z }) => (
  <Freeze frame={0}>
    <AppWindow light segs={[{ clip: L, from: m(L, 'reply1', 'end') + 0.4, at: 0, out: 1 }]} z={z} cx={960} cy={540} />
  </Freeze>
);
const FrameWash: React.FC<{ p: number; children: React.ReactNode }> = ({ p, children }) => (
  <AbsoluteFill>
    <WashOver w={{ p, before: children, dir: 'down', tint: ['#FF3FA4', '#2DE2FF'] }} W={1920} H={1080} />
  </AbsoluteFill>
);
