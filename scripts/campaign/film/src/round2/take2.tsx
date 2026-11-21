// Round two, take 2: "Make it mine". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// One person, three short conversations with their youcoded, and it changing in front of them.
//
// WHAT IS REAL: every frame of the app window (its frame, header, chat, the shortcut buttons, the message
// box and the status row under it, typed messages, replies, thinking words, message times, the theme
// changing, the page view's frame) is footage of the real renderer as it ships, filmed by
// scripts/ui-review/record.mjs from scenes/r2-look.json, r2-home.json and r2-money.json. Nothing of the app's
// own interface is hidden, restyled or drawn over (brand guide section 8). The two looks are real community
// themes that ship for the app, Golden Sunbreak (a rainy Tokyo rooftop under god rays) and then Devil's
// Garden (a sunlit desert), switched by the app's own theme engine. (The owner, 2026-11-20, did not like the
// drawn "Rainy Tokyo" looks of take2-make-theme.mjs / take2-wallpaper.html, nor Cotton Candy Sky / Meadow
// Mist in this window; those files are kept but unused.) WHAT IS STAGED (brand guide section 8, ads only): what the person makes inside
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
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { Day, EndCard, Line, mark } from '../kit';
import manifest from '../footage.json';
import { FREDOKA, HomeUI, KawaiiEmail, MoneyUI } from './take2-ui';

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

// A LOOK (0-14). Opens on the whole plain lilac app (the "before", on screen for a moment) and pushes straight
// into the message box, where "can i change how this whole thing looks?" starts on the first beat. It is sent,
// the answer lands, "idk. kinda rainy anime tokyo type vibe? open to ideas" is typed close up (readable), and
// as it is sent the camera follows the bubble up the chat. On the 5.0 downbeat the window is Golden Sunbreak
// AT THE SAME FRAMING (the purple bubble is now gold, the lilac behind it is a rainy city) and the camera
// pulls out over a second to show the whole new look. "actuallyyy gimme desert. i'm an ASU boy" gets the same move into
// Devil's Garden on 10.5. WHY (review 2026-11-20): the change was a one-frame cut seen in a wide shot, small
// and weightless; seen close on the very bubble the person sent, the change is the subject of the frame.
const T_LOOK1 = 5.0, T_LOOK2 = 10.5;
// WHY typing a little faster than filmed (1.15x): the five seconds before the first look change now hold a
// beat of the plain app, two typed lines and the reply; no one can tell 34 from 39 letters a second.
const TYPE_RATE = 1.15;
const lookSegs = (): Seg[] => {
  const a0 = play(L, m(L, 'type1') - 0.5, 0, m(L, 'type1'));                                     // 0.0: the empty box, its caret blinking
  const a1 = squeeze(L, m(L, 'type1'), m(L, 'type1', 'end'), 0.5, 0.5 + (m(L, 'type1', 'end') - m(L, 'type1')) / TYPE_RATE); // 0.5: typed
  const b = squeeze(L, m(L, 'send1') - 0.04, m(L, 'reply1', 'end') + 0.05, a1.out, 2.3);         // sent; the answer lands
  const c = play(L, m(L, 'reply1', 'end') + 0.05, 2.3, m(L, 'reply1', 'end') + 0.05 + 0.7);      // a breath to read it
  const d = squeeze(L, m(L, 'type2') - 0.03, m(L, 'type2', 'end'), 3.0, 3.0 + (m(L, 'type2', 'end') - m(L, 'type2') + 0.03) / TYPE_RATE);
  const e = playTo(L, m(L, 'send2') + (T_LOOK1 - d.out) - 0.06, d.out, T_LOOK1);                  // sent; the camera follows it up
  // WHY +0.35 s after the switch: the app repaints in a fallback font for a few frames while the theme's
  // own font loads; the shot starts once the new look is fully itself.
  // WHY 3.3 s (was 3.6) and a squeeze for the third line (owner 2026-11-20: the line is now "actuallyyy gimme
  // desert. i'm an ASU boy", 1.25 s of typing instead of 0.78): Golden Sunbreak gives up 0.3 s and the line is
  // typed at the same 1.15x as the other two, so the camera still has ~0.8 s to follow the sent bubble up
  // before the 10.5 beat, exactly as before.
  const f = play(L, m(L, 'swap1') + 0.35, T_LOOK1, m(L, 'swap1') + 0.35 + 3.3);                  // 5.0: Golden Sunbreak
  const g = squeeze(L, m(L, 'type3') - 0.3, m(L, 'type3', 'end'), f.out, f.out + (m(L, 'type3', 'end') - m(L, 'type3') + 0.3) / TYPE_RATE);   // "actuallyyy gimme desert. i'm an ASU boy"
  const h = playTo(L, m(L, 'send3') + (T_LOOK2 - g.out) - 0.06, g.out, T_LOOK2);
  const i = play(L, m(L, 'swap2') + 0.35, T_LOOK2, m(L, 'swap2') + 0.35 + 3.5);                   // 10.5: Devil's Garden
  return [a0, a1, b, c, d, e, f, g, h, { ...i, out: 14.0 }];
};
// THEIR HOME (14-30)
const homeSegs = (): Seg[] => {
  const a = play(HM, m(HM, 'type1') - 0.05, 14.0, m(HM, 'type1', 'end') + 0.1);                   // 14.0: "i want youcoded to manage my smart home"
  const b = squeeze(HM, m(HM, 'send1') - 0.05, m(HM, 'reply1', 'end') + 0.1, a.out, 16.5);         // sent; the answer arrives (thinking shortened)
  const e = playTo(HM, m(HM, 'send2') + SENT.home, 20.0 - (m(HM, 'send2') + SENT.home - m(HM, 'type2', 'end')), 20.0);
  const d = playTo(HM, m(HM, 'type2', 'end'), e.at - (m(HM, 'type2', 'end') - m(HM, 'type2') + 0.04), e.at); // "epic. can we put my room on the front…"
  const c = play(HM, m(HM, 'reply1', 'end') + 0.1, 16.5, m(HM, 'reply1', 'end') + 0.1 + (d.at - 16.5)); // a breath to read "All on one screen?"
  const page = (at: number, out: number, rate: number): Seg => ({ clip: HM, from: m(HM, 'pagehold'), at, out, rate });
  // WHY the page now holds 20.0-24.0 (review 2026-11-20): it opens straight on what was asked for (my room on
  // the front) and has time to show the second half of the request: "Everything else" is tapped on 22.0,
  // the rest of the house slides in and is readable for a second and a half, and "My room" comes back on 23.5.
  const g = playTo(HM, m(HM, 'send3') + SENT.home, 26.5 - (m(HM, 'send3') + SENT.home - m(HM, 'type3', 'end')), 26.5);
  const f = playTo(HM, m(HM, 'type3', 'end'), 24.0, g.at);                                         // 24.0: "perfect. now make the sliders bigger…"
  return [a, b, c, d, e, page(20.0, 24.0, 0.75), f, g, page(26.5, 30.0, 0.85)];
};
// THEIR MONEY (30-46)
const moneyPage = (at: number, out: number, rate: number): Seg => ({ clip: MN, from: m(MN, 'pagehold'), at, out, rate });
const moneySegs = (): Seg[] => [
  // WHY a squeeze at 0.9x rather than true speed: at true speed the shot had to start 0.3 s before the first
  // letter, on the empty box's placeholder line; slowed by a tenth the typing fills the whole 2.5 s, unnoticed.
  squeeze(MN, m(MN, 'type1') - 0.03, m(MN, 'send1') + SENT.money, 30.0, 32.5),                    // 30.0: "can we connect my bank…" typed and sent
  moneyPage(32.5, 35.5, 0.9),
  playTo(MN, m(MN, 'reply2', 'end') + 1.04, 35.5, 39.5),                                           // 35.5: "can it pull out my recurring bills…" → "Yes. Found eleven."
  moneyPage(39.5, 41.5, 0.9),
  playTo(MN, m(MN, 'type3', 'end') + 0.05, 41.5, 43.0),                                            // 41.5: "send me those numbers every morning…"
  moneyPage(43.0, 46.0, 0.6),
];
// "punchier", one change per beat after the sliders grow (review 2026-11-20: the page sat still for 2.4 s):
// 27.0 the sliders grow · 28.0 the ceiling light is switched on · 28.5 the thermostat nudged down · 29.0 "Wind down".
const HOME_T = { build: 20.0, tabOut: 22.0, tabBack: 23.5, bigger: 27.0, ceiling: 28.0, thermo: 28.5, scene: 29.0 };
// WHY bills 0.15 s before the 39.5 cut: the page opens with the person's tap already sliding the tab across
// and the first bills arriving, never on the old tab about to change.
const MONEY_T = { connect: 32.5, bills: 39.35 };
const T_EMAIL = 43.0, T_BEFORE = 46.0;

// The sent look lines, measured in the 2026-11-20 re-film (fractions of the window): "idk. kinda rainy anime
// tokyo…" sits at x 0.57-0.98 / y 0.36 in lilac and x 0.45-0.98 / y 0.35 in Golden Sunbreak; the third line
// "actuallyyy gimme desert. i'm an ASU boy" (longer, so wider; re-measured 2026-11-20) at x 0.575-0.98 / y 0.58
// in Golden Sunbreak and x 0.625-0.98 / y 0.56 in Devil's Garden. WHY
// these framings: the same window point is on screen either side of each cut, so the bubble stays put while
// everything about it changes; fx is kept so the window's own right edge just stays in frame.
const BUB2 = (t: number, z = 1.7, c?: 'out'): Key => [t, z, 0.655, 0.36, c];
const BUB3 = (t: number, z = 1.9, c?: 'out'): Key => [t, z, 0.69, 0.57, c];

const CAM: Key[] = [
  // a look: the whole plain app for a moment, then straight into the message box as the typing starts
  CHAT(0, 0.93), TYPE(0.95), TYPE(1.5),
  // sent: out to the whole window to read the answer, then back in for the reply typed close up
  CHAT(2.3, 0.95, 'out'), CHAT(2.85, 0.955), TYPE(3.35), TYPE(4.32),
  // the message is sent and the camera follows it up the chat; a slow push into it until the beat
  BUB2(4.85), BUB2(T_LOOK1, 1.76),
  // 5.0: the same framing in the new look, then out to the whole window over a second (decelerating)
  BUB2(T_LOOK1, 1.76), CHAT(6.4, 0.95, 'out'), CHAT(7.85, 0.925),
  // "actuallyyy gimme desert. i'm an ASU boy", close; sent, followed up; 10.5 the same move into Devil's Garden
  TYPE(8.35), TYPE(9.7), BUB3(10.25), BUB3(T_LOOK2, 1.96),
  BUB3(T_LOOK2, 1.96), CHAT(11.9, 0.95, 'out'), CHAT(14.0, 0.92),
  // their home
  TYPE(14.0), TYPE(15.35), CHAT(16.2, 0.93), CHAT(20.0, 0.955),
  PAGE(20.0, 0.91), PAGE(24.0, 0.945),
  CHAT(24.0, 0.93), CHAT(26.5, 0.955),
  PAGE(26.5, 0.91), PAGE(30.0, 0.95),
  // their money: close on the box until the send, then straight to the page it made. WHY no pull back here:
  // pulling out before the message is sent showed the empty chat's placeholder line for half a second.
  TYPE(30.0), TYPE(32.5),
  PAGE(32.5, 0.91), PAGE(35.5, 0.945),
  CHAT(35.5, 0.93), CHAT(39.5, 0.955),
  PAGE(39.5, 0.91), PAGE(41.5, 0.935),
  CHAT(41.5, 0.93), CHAT(43.0, 0.95),
  // the email: the window steps back to the left so the morning email can arrive beside it, outside the app
  // (review 2026-11-20: a card laid over the window's title bar read as pasted onto the app)
  // WHY these numbers (review 2026-11-20: the window sat 5% from the left edge): at z 0.648 the window is
  // 1063 px wide; focus x 0.753 puts its left edge at 160 px, and the email (500 wide) ends at 1766, so both
  // sit inside the 8% margins with a 50 px gap between them.
  // WHY cut straight to this framing on 43.0 (not a step back after the cut): the notification then drops in
  // beside a still window, never over its edge while it is still moving.
  [43.0, 0.652, 0.753, 0.5], [46.0, 0.636, 0.753, 0.5],
];

// ------------------------------------------------------------------ the film
export const Take2: React.FC<{ narrator?: boolean }> = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const segs = React.useMemo(() => [...lookSegs(), ...homeSegs(), ...moneySegs()], []);
  const [, z, fx, fy] = camAt(CAM, t);
  const onPage = (a: number, b: number) => t >= a && t < b;
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const content = onPage(20, 24) || onPage(26.5, 30) ? <HomeUI W={W} H={H} T={HOME_T} />
    : onPage(32.5, 35.5) || onPage(39.5, 41.5) || onPage(43, 46) ? <MoneyUI W={W} H={H} T={MONEY_T} /> : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take2-mix.wav')} />
      {/* WHY lavender around the window: brand guide section 8, everything around the app wears the brand look */}
      <AbsoluteFill><Day /></AbsoluteFill>
      {t < T_BEFORE && <AppWindow segs={segs} content={content} z={z} cx={960} cy={540} fx={fx} fy={fy} />}
      <Email />
      {t >= T_BEFORE && t < 50 && <Payoff />}
      {/* 50-56: the two lines, then the name. WHY these times (review 2026-11-20: both lines left before they
          could be read): line one is on screen 2.5 s (it needs 2.2), line two 3.2 s (it needs 2.95), with a
          breath between them; the name lands on the 56.0 section start and holds 4 s. */}
      <Line text="stop waiting for *updates.*" at={50.0} out={52.5} size={6.4} />
      <Line text="make anything you can imagine, / just by *asking.*" at={52.7} out={55.9} size={5.6} />
      <EndCard at={56.0} />
    </AbsoluteFill>
  );
};

/** The kawaii email (43-46). It arrives OUTSIDE the window (laid over the money page it read as pasted on):
 *  the window steps back to the left and, on the 43.0 downbeat, a notification drops in beside it. That
 *  notification IS the email's own pink header (who it is from, "every morning", the subject); on 43.5 it
 *  opens downward into the whole email. WHY one object that grows (review 2026-11-20): a separate toast fading
 *  out over a growing card gave a double image, and the card was seen with empty rows; now the rows build in
 *  order as the card opens around them, and nothing is ever on screen twice. */
const EMAIL = { x: 1266, w: 500, top: 300 };
const Email: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  if (t < T_EMAIL || t >= T_BEFORE) return null;
  const u = EMAIL.w / 600;
  // drop-in: from 26 px higher, fully inside the frame from its first frame (no clipping at the edge)
  const drop = spring({ frame: frame - s2f(T_EMAIL), fps: FPS, config: { damping: 16, stiffness: 170 } });
  // open: the header's clip grows to the whole card (a firm spring, a whisker of settle)
  const open = t < T_EMAIL + 0.5 ? 0 : spring({ frame: frame - s2f(T_EMAIL + 0.5), fps: FPS, config: { damping: 19, stiffness: 120, mass: 0.9 } });
  const HEAD = 106 * u, FULL = 533 * u;   // the header's height and the whole card's (measured at 500 px wide), in film px
  const h = HEAD + (FULL - HEAD) * open;
  return (
    <div style={{ position: 'absolute', left: EMAIL.x, top: EMAIL.top, width: EMAIL.w, height: h, borderRadius: 34 * u, overflow: 'hidden',
      opacity: Math.min(1, drop * 1.6), transform: `translateY(${(1 - drop) * -26}px) scale(${0.97 + 0.03 * drop})`, transformOrigin: '50% 0',
      boxShadow: `0 ${24 + 10 * open}px ${60 + 20 * open}px rgba(60,30,80,${0.22 + 0.08 * open})` }}>
      {/* the bottom of the clip draws the card's own rounded pink edge, so the closed notification is a finished object */}
      <KawaiiEmail w={EMAIL.w} at={T_EMAIL + 0.25} />
    </div>
  );
};

/** 46-50: the payoff, one before-and-after (review 2026-11-20: the old travelling recap of screens seen ten
 *  seconds earlier read as a template slideshow, and the plain app it started as never came back).
 *  46.0  the plain lilac app from the opening, alone and still. The music breathes here, so this is the held
 *        breath: "this is where it started".
 *  46.5  on the beat it steps back and up to the left, and the app as it is now rises in front of it, large:
 *        the desert look, with the Home page the person made open in it.
 *  48.5  on the beat that window switches to their money (Bills & subscriptions, "11 found"), as the app does.
 *  It holds, readable, until the lines; no split frames, one continuous move. */
const Payoff: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const outro = ease01(t, 49.55, 49.95, EASE_IN);
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const drift = 1 + 0.02 * ease01(t, 46.5, 50, (x) => x);   // a slow push over the whole hold, so it is never a freeze
  // the "before": centred as at the start of the film, then back to its slot top left
  const k = ease01(t, 46.5, 47.25, EASE_IN_OUT);
  // WHY this slot (x 154-876, y 114-605 at z 0.44): big enough that the plain lilac app reads at a glance,
  // with only its lower right corner tucked behind the "after" (x 684-1766, y 232-969), all inside 8% margins.
  const before = { x: interpolate(k, [0, 1], [960, 515]), y: interpolate(k, [0, 1], [540, 360]), z: interpolate(k, [0, 1], [0.93 * (1 + 0.015 * ease01(t, 46, 46.5, (x) => x)), 0.44]) };
  // the "after": slides up from below the frame and settles, decelerating, in front. WHY a slide and not a
  // fade: fading in over the lilac window printed one window through the other for a few frames.
  const r = t < 46.5 ? 0 : spring({ frame: frame - s2f(46.5), fps: FPS, config: { damping: 24, stiffness: 120, mass: 1 } });
  const after = { x: 1225, y: 600 + 900 * (1 - r), z: 0.66 * drift };
  const money = t >= 48.5;
  // WHY these page times: Home already in its finished state (sliders big, the ceiling light on, "Wind down"
  // lit), its cards building in as the window rises; the money page opens straight on the bills, building.
  const homeT = { build: 46.55, tabOut: 999, tabBack: 999, bigger: 40, ceiling: 40, thermo: 40, scene: 40 };
  const moneyT = { connect: 40, bills: 48.35 };
  return (
    <AbsoluteFill style={{ opacity: 1 - outro }}>
      <AppWindow segs={[{ clip: L, from: m(L, 'open') + 0.2, at: T_BEFORE, out: 50, rate: 0.25 }]} z={before.z * (k > 0 ? drift : 1)} cx={before.x} cy={before.y} />
      {r > 0.001 && (
        <div>
          <AppWindow segs={money ? [{ clip: MN, from: m(MN, 'pagehold'), at: 48.5, out: 50, rate: 0.5 }] : [{ clip: HM, from: m(HM, 'pagehold'), at: 46.5, out: 48.5, rate: 0.5 }]}
            content={money ? <MoneyUI W={W} H={H} T={moneyT} /> : <HomeUI W={W} H={H} T={homeT} />} z={after.z} cx={after.x} cy={after.y} />
        </div>
      )}
    </AbsoluteFill>
  );
};
