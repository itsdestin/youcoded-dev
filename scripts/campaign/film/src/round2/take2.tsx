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
// Sections: look 0 · home 14 · money 30 · pull-back 46 · lines 50 · name 56. Every cut and every visible
// change below sits on a beat.
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
// WHY: a mark is when the recorder ran the theme swap; the repaint lands a moment later. Starting the swap
// shot this far AFTER the mark puts the first changed frame on the beat (measured frame by frame, 2026-11-20).
const SWAP_LAG = 0.08;

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

/** The app window: footage (plus anything staged inside its page view), rounded and lit, at a camera. */
const AppWindow: React.FC<{ segs: Seg[]; content?: React.ReactNode; z: number; cx: number; cy: number; fx: number; fy: number; opacity?: number; glow?: number; light?: boolean }> =
  ({ segs, content, z, cx, cy, fx, fy, opacity = 1, glow = 0, light }) => {
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
        </div>
      </div>
    );
  };

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
// framings. WHY one steady chat frame (z 1.1, whole window height in view) instead of panning between the
// message box and the thread: a typed line and the reply above it are always in frame together, and the
// header (which conversation this is) never gets cut. While typing, the camera leans in a little.
const INPUT = (t: number): Key => [t, 1.13, 0.5, 0.505];
const THREAD = (t: number): Key => [t, 1.1, 0.5, 0.5];
const WIDE = (t: number, z = 0.9): Key => [t, z, 0.5, 0.5];
const PAGE = (t: number, z = 1.0, fy = 0.52): Key => [t, z, 0.5, fy];

// ------------------------------------------------------------------ the timeline, built from the takes' marks
const L = 'r2-look', HM = 'r2-home', MN = 'r2-money';
const m = (clip: string, label: string) => mark(clip, label);
/** A shot that plays from `from` until the footage reaches `until`, starting at film time `at`. */
const play = (clip: string, from: number, at: number, until: number): Seg => ({ clip, from, at, out: at + (until - from) });
/** A sped-up shot that squeezes footage [from, until] into film [at, out]. */
const squeeze = (clip: string, from: number, until: number, at: number, out: number): Seg => ({ clip, from, at, out, rate: (until - from) / (out - at) });

const lookSegs = (): Seg[] => {
  const a = play(L, m(L, 'type1') - 0.5, 0, m(L, 'type1') + 4.0);                    // 0.5: "can i change how this whole thing looks?"
  const b = play(L, m(L, 'type2') - 0.02, 4.5, m(L, 'send2'));                         // 4.5: "idk. kinda rainy tokyo…"
  const c = squeeze(L, m(L, 'send2'), m(L, 'swap1') + SWAP_LAG, b.out, 8.0);          // the build, sped up
  const d = play(L, m(L, 'swap1') + SWAP_LAG, 8.0, m(L, 'swap1') + SWAP_LAG + 2.0);              // 8.0: neon and rain
  const e = play(L, m(L, 'type3') - 0.04, 10.0, m(L, 'send3'));                         // 10.0: "ok yeah. less pink tho"
  const f = squeeze(L, m(L, 'send3'), m(L, 'swap2') + SWAP_LAG, e.out, 12.0);
  const g = play(L, m(L, 'swap2') + SWAP_LAG, 12.0, m(L, 'swap2') + SWAP_LAG + 2.0);              // 12.0: it shifts
  return [a, b, c, d, e, f, g];
};
const homeSegs = (): Seg[] => {
  const a = play(HM, m(HM, 'type1') - 0.1, 14.0, m(HM, 'send1') + 0.1);               // 14.1: "i want youcoded to manage my smart home"
  const b = { clip: HM, from: m(HM, 'send1') + 0.1, at: a.out, out: 17.0, rate: 1.8 };   // the reply arrives (thinking pause shortened)
  const c = play(HM, m(HM, 'type2') - 0.04, 17.0, m(HM, 'type2') + 2.96);              // 17.0: "epic. can we put my room on the front…"
  const page = (at: number, out: number, rate: number): Seg => ({ clip: HM, from: m(HM, 'pagehold'), at, out, rate });
  const d = play(HM, m(HM, 'type3') - 0.04, 23.0, m(HM, 'type3') + 2.46);              // 23.0: "perfect. now make the sliders bigger…"
  return [a, b, c, page(20.0, 23.0, 0.75), d, page(25.5, 30.0, 0.85)];
};
const moneyPage = (at: number, out: number, rate: number): Seg => ({ clip: MN, from: m(MN, 'pagehold'), at, out, rate });
const moneySegs = (): Seg[] => [
  play(MN, m(MN, 'type1') - 0.1, 30.0, m(MN, 'type1') + 2.4),                         // 30.1: "can we connect my bank…"
  moneyPage(32.5, 35.0, 0.9),
  play(MN, m(MN, 'type2') - 0.04, 35.0, m(MN, 'type2') + 4.46),                       // 35.0: "can it pull out my recurring bills…" → "Yes. Found eleven."
  moneyPage(39.5, 41.5, 0.9),
  play(MN, m(MN, 'type3') - 0.04, 41.5, m(MN, 'type3') + 2.46),                       // 41.5: "send me those numbers every morning…"
  moneyPage(44.0, 50.0, 0.6),
];
const HOME_T = { build: 20.0, rearrange: 21.0, bigger: 26.0 };
const MONEY_T = { connect: 32.5, bills: 39.5 };

const CAM: Key[] = [
  // a look: open wide on the starting look, settle into the conversation, pull back as it turns neon
  WIDE(0, 0.92), INPUT(0.6), INPUT(2.4), THREAD(3.1), THREAD(4.2), INPUT(4.7), INPUT(6.8), THREAD(7.4),
  WIDE(8.4, 0.84), WIDE(9.5, 0.88), INPUT(10.1), INPUT(11.4), WIDE(12.0, 0.86), WIDE(14.0, 0.95),
  // their home
  INPUT(14.0), INPUT(15.7), THREAD(16.4), THREAD(16.7), INPUT(17.2), INPUT(19.3), THREAD(20.0),
  PAGE(20.0, 0.98), PAGE(21.0, 1.0), PAGE(23.0, 1.06),
  INPUT(23.0), INPUT(25.0), THREAD(25.5),
  PAGE(25.5, 1.0), [26.4, 1.1, 0.54, 0.55], [30.0, 1.16, 0.55, 0.56],
  // their money
  INPUT(30.0), INPUT(32.0), THREAD(32.5),
  PAGE(32.5, 0.98), PAGE(35.0, 1.05),
  INPUT(35.0), INPUT(37.0), THREAD(37.6), THREAD(39.5),
  PAGE(39.5, 1.0, 0.54), PAGE(41.5, 1.06, 0.56),
  INPUT(41.5), INPUT(43.6), THREAD(44.0),
  PAGE(44.0, 0.92), PAGE(46.0, 0.9), WIDE(47.0, 0.6),
];

// ------------------------------------------------------------------ backgrounds
/** The field around the window: the brand's lavender while the app is in its first look, the brand's
 *  night once it goes neon (on the 8.0 downbeat), so the room around the screen changes with it. */
const Field: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const night = ease01(t, 8.0, 8.4, EASE_OUT);
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
  const content = onPage(20, 23) || onPage(25.5, 30) ? <HomeUI W={BOX.w / CSS} H={BOX.h / CSS} T={HOME_T} />
    : onPage(32.5, 35) || onPage(39.5, 41.5) || onPage(44, 50) ? <MoneyUI W={BOX.w / CSS} H={BOX.h / CSS} T={MONEY_T} /> : undefined;
  const glow = ease01(t, 8.0, 8.6);

  // 47.0-50.0: the pull-back. The window moves right and the very first look of the app slides out from
  // behind it to the left: the same app, where it started and where it is now.
  const split = spring({ frame: frame - s2f(47.0), fps: FPS, config: { damping: 20, stiffness: 90 } });
  const outro = ease01(t, 49.45, 49.95, EASE_IN);
  const inPull = t >= 46.95;
  const afterZ = inPull ? interpolate(split, [0, 1], [0.6, 0.5]) * (1 + 0.02 * ease01(t, 47.5, 50)) : z;
  const afterCx = inPull ? interpolate(split, [0, 1], [960, 1390]) : 960;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take2-mix.wav')} />
      {t < 50 && <Field />}
      {t >= 50 && <AbsoluteFill style={{ background: C.night }} />}
      {t < 50 && inPull && (
        // the starting look, held on the film's very first frame (WHY Freeze: the shot's clock is pinned to 0)
        <Freeze frame={0}>
          <AppWindow light segs={[{ clip: L, from: m(L, 'type1') - 0.5, at: 0, out: 1 }]} z={afterZ} cx={interpolate(split, [0, 1], [960, 530])} cy={540} fx={0.5} fy={0.5}
            opacity={Math.min(1, split * 1.6) * (1 - outro)} />
        </Freeze>
      )}
      {t < 50 && (
        <AppWindow segs={segs} content={content} z={inPull ? afterZ : z} cx={afterCx} cy={540} fx={inPull ? 0.5 : fx} fy={inPull ? 0.5 : fy} glow={glow} light={t < 8.0} opacity={1 - outro} />
      )}
      {/* 44.0: the morning email arrives over the money page */}
      <Email />
      {/* 50-56: the two lines, then the name */}
      <Line dark text="stop waiting for *updates.*" at={50.1} out={52.4} size={6.4} />
      <Line dark text="make anything you can imagine, / just by *asking.*" at={52.5} out={55.95} size={5.6} />
      <EndCard at={56.0} />
    </AbsoluteFill>
  );
};

/** The kawaii email: springs up from below on the 44.0 downbeat, holds, and drops away as the camera pulls back. */
const Email: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  if (t < 43.9 || t > 47.0) return null;
  const inn = spring({ frame: frame - s2f(44.0), fps: FPS, config: { damping: 13, stiffness: 120, mass: 0.9 } });
  const out = ease01(t, 46.0, 46.6, EASE_IN);
  const dim = Math.min(inn, 1) * (1 - out);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(6,4,16,0.55)', opacity: dim }} />
      <div style={{ position: 'absolute', left: 960 - 320, top: 70, width: 640,
        transform: `translateY(${(1 - inn) * 900 + out * 1000}px) rotate(${(1 - inn) * 8 - 1.5 + out * 6}deg)` }}>
        <KawaiiEmail w={640} at={44.0} />
      </div>
    </AbsoluteFill>
  );
};
