// Round two, take 2: "Make it mine". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// One person, three short conversations with their youcoded, and it changing in front of them.
//
// WHAT IS REAL: every frame of the app window (its frame, header, chat, the shortcut buttons, the message
// box and the status row under it, typed messages, replies, thinking words, message times, the theme
// changing, the page view's frame) is footage of the real renderer as it ships, filmed by
// scripts/ui-review/record.mjs from scenes/r2-look.json, r2-home.json and r2-money.json. Nothing of the app's
// own interface is hidden, restyled or drawn over (brand guide section 8). The two looks are real community
// themes that ship for the app, Cotton Candy Sky and then Meadow Mist, switched by the app's own theme engine.
// (take2-make-theme.mjs and take2-wallpaper.html, the drawn "Rainy Tokyo" look, are no longer used: the
// owner did not like it.) WHAT IS STAGED (brand guide section 8, ads only): what the person makes inside
// the page view (take2-ui.tsx) and the morning email.
//
// Music grid (scripts/campaign/music, composed to these numbers): 120 BPM, bar 2.0 s, beat 0.5 s.
// Sections: look 0 · home 14 · money 30 · payoff 46 · lines 50 · name 56. Every visible cut sits on a beat.
//
// Fourth pass (2026-11-20, review of the third): the film no longer draws anything over the window. The
// look changes are hard cuts on the beat to the app's own repainted window, with the camera easing back
// as the new look lands (the drawn neon wipes tore the bubbles and were stock motion graphics). Each
// conversation opens close on the message box as the first words are typed and pulls back as they are
// sent, so the empty chat's placeholder line is never the thing on screen. Builds are cut before their
// file cards (developer words like "manifest.json") appear. The takes were re-filmed 1960 px tall (no
// bubble ever cut off at the top) with evening clocks (9:12 PM, 6:24 PM, 9:38 PM) instead of a frozen 8:00 AM.
import React from 'react';
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { Day, EndCard, Line, mark } from '../kit';
import manifest from '../footage.json';
import { HomeUI, KawaiiEmail, MoneyUI } from './take2-ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const s2f = (s: number) => Math.round(s * FPS);
const ease01 = (t: number, a: number, b: number, e = EASE_IN_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });

// ------------------------------------------------------------------ the footage
// All three takes are 2880 x 1962 at zoom 3.2 (CSS 900 x 613). The page view's content box, measured from
// the 2026-11-20 re-film (its border sits at x 30 / 2849 and y 126 / 1931): staged things are drawn inside it.
const FW = 2880, FH = 1962, CSS = 3.2;
const BOX = { x: 33, y: 129, w: 2813, h: 1799, r: 42 };
const CLIPS = manifest as unknown as Record<string, { file: string; duration: number }>;
type Seg = { clip: string; from: number; at: number; out: number; rate?: number };

/** Shots back to back with hard cuts. A shot whose `rate` is above 1 is a wait sped up (owner: "the shown
 *  build process can be GREATLY sped up"); typing plays at true speed. */
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

/** The app window: footage (plus anything staged inside its page view), rounded and softly shadowed, at a camera. */
const AppWindow: React.FC<{ segs: Seg[]; content?: React.ReactNode; z: number; cx: number; cy: number; fx?: number; fy?: number; opacity?: number }> =
  ({ segs, content, z, cx, cy, fx = 0.5, fy = 0.5, opacity = 1 }) => {
    const k = z * (1640 / FW);   // z = 1 draws the window 1640 film px wide
    return (
      <div style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH, transformOrigin: '0 0', opacity,
        transform: `translate(${cx - fx * FW * k}px, ${cy - fy * FH * k}px) scale(${k})` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 40, overflow: 'hidden',
          boxShadow: '0 60px 160px rgba(74,38,110,0.30), 0 12px 40px rgba(74,38,110,0.22), 0 0 0 3px rgba(201,176,219,0.7)' }}>
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
// [time, zoom, focus x, focus y, curve]: the window point (fx, fy) sits at the frame centre. Two keys at the
// same time are a cut. Between keys the camera glides on the brand's in-out curve (or, for a key marked
// 'out', decelerates into it: used right after a cut so the new picture is already moving as it lands).
type Key = [number, number, number, number, ('out' | undefined)?];
const camAt = (keys: Key[], t: number): Key => {
  if (t <= keys[0][0]) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[0] && t < b[0]) {
      if (b[0] === a[0]) return b;
      const p = ease01(t, a[0], b[0], b[4] === 'out' ? EASE_OUT : EASE_IN_OUT);
      return [t, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p, a[3] + (b[3] - a[3]) * p];
    }
  }
  return keys[keys.length - 1];
};
// Framings. WHY the chat is the WHOLE window (z 0.965 is 1078 px tall, inside the 1080 frame): header,
// conversation, message box and status row are all in view and nothing is ever half cut. Life comes from a
// slow drift between 0.90 and 0.965, not from cropping.
const CHAT = (t: number, z = 0.95, c?: 'out'): Key => [t, z, 0.5, 0.5, c];
// Close on the message box (its left two-thirds and the window's bottom edge; pull-backs start only once
// the first message is sent, when the placeholder line has gone), where the first words of
// each conversation are typed. WHY: it is what the person is looking at, and it keeps the empty chat's
// placeholder line ("Start a conversation…", thin grey over the busy wallpaper) out of the picture.
const TYPE = (t: number, c?: 'out'): Key => [t, 1.8, 0.32, 0.79, c];   // fx 0.32 keeps the window's own left edge in frame; fy 0.79 keeps the placeholder line out
// The page view: the whole page content box well inside the frame.
const PAGE = (t: number, z = 0.93, c?: 'out'): Key => [t, z, 0.5, 0.5, c];

// ------------------------------------------------------------------ the timeline, built from the takes' marks
const L = 'r2-look', HM = 'r2-home', MN = 'r2-money';
const m = (clip: string, label: string, edge: 'start' | 'end' = 'start') => mark(clip, label, edge);
/** A shot that plays footage [from, until] at `rate`, starting at film time `at`. */
const play = (clip: string, from: number, at: number, until: number, rate = 1): Seg => ({ clip, from, at, out: at + (until - from) / rate, rate });
/** A sped-up shot that squeezes footage [from, until] into film [at, out]. */
const squeeze = (clip: string, from: number, until: number, at: number, out: number): Seg => ({ clip, from, at, out, rate: (until - from) / (out - at) });
/** A shot that plays at true speed and ENDS at footage `until` exactly on film time `out`. */
const playTo = (clip: string, until: number, at: number, out: number): Seg => ({ clip, from: until - (out - at), at, out });
// WHY each build is cut this soon after sending (thinking word just showing): ~0.3 s after Enter the real
// app shows a file card ("Creating a file · manifest.json"), developer words this film should not spend
// screen time on. Measured from the 2026-11-20 takes: look 0.25 s, home 0.22 s, money 0.20 s.
const SENT = { look: 0.24, home: 0.22, money: 0.2 };

// A LOOK (0-14). Opens close on "can i change how this whole thing looks?" being typed; it is sent, the answer
// lands, "idk. kinda dreamy sunset type vibe?" is typed and sent, and on the 5.0 downbeat the window is
// Cotton Candy Sky. "ok yeah. less pink tho" is sent, and on 10.5 it is Meadow Mist.
const T_LOOK1 = 5.0, T_LOOK2 = 10.5;
const lookSegs = (): Seg[] => {
  const a = play(L, m(L, 'type1') - 0.05, 0, m(L, 'type1', 'end'));                              // 0.0: first question typed
  const b = squeeze(L, m(L, 'send1') - 0.04, m(L, 'reply1', 'end') + 0.05, a.out, 2.0);          // sent; the answer lands
  const c = play(L, m(L, 'reply1', 'end') + 0.05, 2.0, m(L, 'reply1', 'end') + 0.65);           // a breath to read it
  const e = playTo(L, m(L, 'send2') + SENT.look, T_LOOK1 - (m(L, 'send2') + SENT.look - m(L, 'type2', 'end')), T_LOOK1);
  const d = playTo(L, m(L, 'type2', 'end'), c.out, e.at);                                        // "idk. kinda dreamy sunset…" (true speed)
  // WHY +0.35 s after the switch: the app repaints in a fallback font for a few frames while the theme's
  // own font loads; the shot starts once the new look is fully itself.
  const f = play(L, m(L, 'swap1') + 0.35, T_LOOK1, m(L, 'swap1') + 0.35 + 3.8);                  // 5.0: Cotton Candy Sky
  const h = playTo(L, m(L, 'send3') + SENT.look, T_LOOK2 - (m(L, 'send3') + SENT.look - m(L, 'type3', 'end')), T_LOOK2);
  const g = playTo(L, m(L, 'type3', 'end'), f.out, h.at);                                        // "ok yeah. less pink tho"
  const i = play(L, m(L, 'swap2') + 0.35, T_LOOK2, m(L, 'swap2') + 0.35 + 3.5);                   // 10.5: Meadow Mist
  return [a, b, c, d, e, f, g, h, { ...i, out: 14.0 }];
};
// THEIR HOME (14-30)
const homeSegs = (): Seg[] => {
  const a = play(HM, m(HM, 'type1') - 0.05, 14.0, m(HM, 'type1', 'end') + 0.1);                   // 14.0: "i want youcoded to manage my smart home"
  const b = squeeze(HM, m(HM, 'send1') - 0.05, m(HM, 'reply1', 'end') + 0.1, a.out, 16.5);         // sent; the answer arrives (thinking shortened)
  const e = playTo(HM, m(HM, 'send2') + SENT.home, 20.0 - (m(HM, 'send2') + SENT.home - m(HM, 'type2', 'end')), 20.0);
  const d = playTo(HM, m(HM, 'type2', 'end'), e.at - (m(HM, 'type2', 'end') - m(HM, 'type2') + 0.04), e.at); // "epic. can we put my room on the front…"
  const c = play(HM, m(HM, 'reply1', 'end') + 0.1, 16.5, m(HM, 'reply1', 'end') + 0.1 + (d.at - 16.5)); // a breath to read "All on one screen?"
  const page = (at: number, out: number, rate: number): Seg => ({ clip: HM, from: m(HM, 'pagehold'), at, out, rate });
  const g = playTo(HM, m(HM, 'send3') + SENT.home, 25.5 - (m(HM, 'send3') + SENT.home - m(HM, 'type3', 'end')), 25.5);
  const f = playTo(HM, m(HM, 'type3', 'end'), 23.0, g.at);                                         // 23.0: "perfect. now make the sliders bigger…"
  return [a, b, c, d, e, page(20.0, 23.0, 0.75), f, g, page(25.5, 30.0, 0.85)];
};
// THEIR MONEY (30-46)
const moneyPage = (at: number, out: number, rate: number): Seg => ({ clip: MN, from: m(MN, 'pagehold'), at, out, rate });
const moneySegs = (): Seg[] => [
  playTo(MN, m(MN, 'send1') + SENT.money, 30.0, 32.5),                                             // 30.0: "can we connect my bank…" typed and sent
  moneyPage(32.5, 35.5, 0.9),
  playTo(MN, m(MN, 'reply2', 'end') + 1.04, 35.5, 39.5),                                           // 35.5: "can it pull out my recurring bills…" → "Yes. Found eleven."
  moneyPage(39.5, 41.5, 0.9),
  playTo(MN, m(MN, 'type3', 'end') + 0.05, 41.5, 43.0),                                            // 41.5: "send me those numbers every morning…"
  moneyPage(43.0, 46.0, 0.6),
];
const HOME_T = { build: 20.0, rearrange: 21.0, bigger: 26.0 };
const MONEY_T = { connect: 32.5, bills: 39.5 };
const T_EMAIL = 43.0, T_BEFORE = 46.0, T_AFTER = 47.0;

const CAM: Key[] = [
  // a look: close on the first words, out to the whole window as they are sent, a slow push while they talk;
  // at each look change the camera eases back from the cut, so the new world opens out around the chat
  TYPE(0), TYPE(1.2), CHAT(2.0, 0.93), CHAT(T_LOOK1, 0.962),
  CHAT(T_LOOK1, 0.962), CHAT(6.3, 0.9, 'out'), CHAT(T_LOOK2, 0.94),
  CHAT(T_LOOK2, 0.962), CHAT(11.8, 0.9, 'out'), CHAT(14.0, 0.915),
  // their home
  TYPE(14.0), TYPE(15.35), CHAT(16.2, 0.93), CHAT(20.0, 0.955),
  PAGE(20.0, 0.91), PAGE(23.0, 0.945),
  CHAT(23.0, 0.93), CHAT(25.5, 0.955),
  PAGE(25.5, 0.91), PAGE(30.0, 0.95),
  // their money: close on the box until the send, then straight to the page it made. WHY no pull back here:
  // pulling out before the message is sent showed the empty chat's placeholder line for half a second.
  TYPE(30.0), TYPE(32.5),
  PAGE(32.5, 0.91), PAGE(35.5, 0.945),
  CHAT(35.5, 0.93), CHAT(39.5, 0.955),
  PAGE(39.5, 0.91), PAGE(41.5, 0.935),
  CHAT(41.5, 0.93), CHAT(43.0, 0.95),
  // the email: the camera backs off the money page so the card has room
  PAGE(43.0, 0.92), PAGE(46.0, 0.84, 'out'),
];

// ------------------------------------------------------------------ the film
export const Take2: React.FC<{ narrator?: boolean }> = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const segs = React.useMemo(() => [...lookSegs(), ...homeSegs(), ...moneySegs()], []);
  const [, z, fx, fy] = camAt(CAM, t);
  const onPage = (a: number, b: number) => t >= a && t < b;
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const content = onPage(20, 23) || onPage(25.5, 30) ? <HomeUI W={W} H={H} T={HOME_T} />
    : onPage(32.5, 35.5) || onPage(39.5, 41.5) || onPage(43, 46) ? <MoneyUI W={W} H={H} T={MONEY_T} /> : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take2-mix.wav')} />
      {/* WHY lavender throughout: both real looks the person tries are daylight themes */}
      <AbsoluteFill><Day /></AbsoluteFill>
      {t < T_BEFORE && <AppWindow segs={segs} content={content} z={z} cx={960} cy={540} fx={fx} fy={fy} />}
      <Email />
      {t >= T_BEFORE && t < 50 && <Payoff />}
      {/* 50-56: the two lines, then the name */}
      <Line text="stop waiting for *updates.*" at={50.1} out={52.4} size={6.4} />
      <Line text="make anything you can imagine, / just by *asking.*" at={52.5} out={55.95} size={5.6} />
      <EndCard at={56.0} />
    </AbsoluteFill>
  );
};

/** The kawaii email: springs up over the money page on the 43.0 downbeat and holds three seconds.
 *  WHY only a light veil (review 2026-11-20: a 38% grey veil turned the real page muddy): the money page
 *  keeps its colour; the card stands off it by its own shadow and the camera backing away. */
const Email: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  if (t < T_EMAIL || t >= T_BEFORE) return null;
  const inn = spring({ frame: frame - s2f(T_EMAIL), fps: FPS, config: { damping: 15, stiffness: 120, mass: 0.9 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(40,52,44,0.16)', opacity: Math.min(inn, 1) }} />
      <div style={{ position: 'absolute', left: 960 - 320, top: 62, width: 640,
        transform: `translateY(${(1 - inn) * 900}px) rotate(${(1 - inn) * 6 - 1.2}deg)` }}>
        <KawaiiEmail w={640} at={T_EMAIL} />
      </div>
    </AbsoluteFill>
  );
};

/** 46-50: the payoff. The app exactly as it started (46.0: the first exchange, in its first look). On 47.0
 *  that same window shrinks into the corner of a grid and, as it travels, becomes the window as it is now
 *  (Meadow Mist, the whole look conversation); around it rise everything the person made: their room, their
 *  money and the morning email. WHY a move instead of a wipe: the viewer follows ONE window and sees it
 *  changed, with nothing drawn over the app (the old neon scan line was the cliché the review flagged). */
const Payoff: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const outro = ease01(t, 49.5, 49.95, EASE_IN);
  const settle = (d: number) => spring({ frame: frame - s2f(T_AFTER + d), fps: FPS, config: { damping: 16, stiffness: 110 } });
  const drift = ease01(t, T_AFTER, 50, (x) => x);
  const W = BOX.w / CSS, H = BOX.h / CSS;
  // WHY these numbers: a 2 × 2 grid inside the 8% safe margins (86-994 tall), nothing overlapping. Each
  // window is 649 px wide and 441 tall (z 0.395); cells sit 40 px apart across and 26 px apart down.
  const Z = 0.395, X0 = 616, X1 = 1304, Y0 = 307, Y1 = 773;
  // the travelling window: from the full frame into the bottom-left cell
  const mv = ease01(t, T_AFTER, T_AFTER + 0.75, EASE_IN_OUT);
  const zMv = interpolate(mv, [0, 1], [0.93 + 0.02 * ease01(t, T_BEFORE, T_AFTER), Z]);
  const cxMv = interpolate(mv, [0, 1], [960, X0]), cyMv = interpolate(mv, [0, 1], [540, Y1]);
  // the "before" gives way to the "now" early in the move, while the window is still large enough to read
  // as the same window but already moving (WHY: a fade on a still frame reads as a slide transition)
  const becomes = ease01(t, T_AFTER + 0.08, T_AFTER + 0.38, EASE_IN_OUT);
  const item = (d: number) => {
    const s = settle(d);
    return { opacity: Math.min(1, s * 1.4), dy: (1 - s) * 60, ds: 0.94 + 0.06 * s };
  };
  const home = item(0.3), money = item(0.4), mail = item(0.55);
  const grow = 1 + 0.015 * drift;
  return (
    <AbsoluteFill style={{ opacity: 1 - outro }}>
      <div style={{ position: 'absolute', inset: 0, opacity: home.opacity, transform: `translateY(${home.dy}px)` }}>
        <AppWindow segs={[{ clip: HM, from: m(HM, 'pagehold'), at: T_BEFORE, out: 50, rate: 0.5 }]} content={<HomeUI W={W} H={H} T={HOME_T} />} z={Z * home.ds * grow} cx={X0} cy={Y0} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: money.opacity, transform: `translateY(${money.dy}px)` }}>
        <AppWindow segs={[{ clip: MN, from: m(MN, 'pagehold'), at: T_BEFORE, out: 50, rate: 0.5 }]} content={<MoneyUI W={W} H={H} T={MONEY_T} />} z={Z * money.ds * grow} cx={X1} cy={Y0} />
      </div>
      <div style={{ position: 'absolute', left: X1 - 200, top: Y1 - 218, width: 400, opacity: mail.opacity, transform: `translateY(${mail.dy}px) rotate(-1.5deg) scale(${mail.ds})` }}>
        <KawaiiEmail w={400} at={T_EMAIL} />
      </div>
      {/* the conversation as it is now (whole: every bubble in view, the top one included). WHY fully opaque
          under the fading "before": two half-transparent windows would let the lavender show through mid-fade. */}
      <AppWindow segs={[{ clip: L, from: m(L, 'swap2') + 1.2, at: T_BEFORE, out: 50, rate: 0.6 }]} z={zMv * (mv >= 1 ? grow : 1)} cx={cxMv} cy={cyMv} />
      {/* the app as it started, frozen on its first exchange, travelling with it until it has become the now */}
      {becomes < 1 && (
        <Freeze frame={0}>
          <AppWindow segs={[{ clip: L, from: m(L, 'reply1', 'end') + 0.4, at: 0, out: 1 }]} z={zMv} cx={cxMv} cy={cyMv} opacity={1 - becomes} />
        </Freeze>
      )}
    </AbsoluteFill>
  );
};
