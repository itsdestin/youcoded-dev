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
// Music grid (round 10 re-cut, 2026-11-25): 128 BPM, beat 0.46875 s, bar 1.875 s; 60 s is exactly 32 bars.
// Sections: look 0 (bar 0) · home 15 (bar 8) · money 30 (bar 16) · email 43.125 (bar 23) · payoff 46.875
// (bar 25) · lines 50.625 (bar 27) · name 56.25 (bar 30). Every scene cut (a look change, chat to page, page to
// chat, a new section) sits on a bar line; every other shot join, send and staged tap sits on a beat (a few
// on an eighth). WHY 128 and not the old 120 (owner, align deck A2: cuts on bar lines were "probably best,
// but the music needs to better match the busier/higher-energy nature of this specific video"): the film
// cuts every 2-4 s, which at 128 is one to two bars; 15, 30, 45 and 60 s all fall on bar lines; and the
// faster grid lifts the music. The re-time moves cut points and holds; no captured shot plays more than
// about 8% faster or slower than it did in the 120 cut (each shot's rate change is noted where it differs).
// The music is the songbook's src/film_r10_mim.py, written to these same numbers.
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
// THE SHARED GRID (round 10): film time of beat n. WHY every time below is written in beats: picture and music
// read one timing sheet (owner, align deck A3: "yes"), so a cut is a beat number the composer can read off.
const BPM = 128, BEAT = 60 / BPM, BAR = 4 * BEAT;
const bt = (n: number) => n * BEAT;
/** A shot that plays footage from `from` at `rate`, filling film [at, out]. */
const span = (clip: string, from: number, at: number, out: number, rate = 1): Seg => ({ clip, from, at, out, rate });

// A LOOK (0-14). Opens on the whole plain lilac app (the "before", on screen for a moment) and pushes straight
// into the message box, where "can i change how this whole thing looks?" starts on the first beat. It is sent,
// the answer lands, "idk. kinda rainy anime tokyo type vibe? open to ideas" is typed close up (readable), and
// as it is sent the camera follows the bubble up the chat. On the 5.0 downbeat the window is Golden Sunbreak
// AT THE SAME FRAMING (the purple bubble is now gold, the lilac behind it is a rainy city) and the camera
// pulls out over a second to show the whole new look. "actuallyyy gimme desert. i'm an ASU boy" gets the same move into
// Devil's Garden on 10.5. WHY (review 2026-11-20): the change was a one-frame cut seen in a wide shot, small
// and weightless; seen close on the very bubble the person sent, the change is the subject of the frame.
// ROUND 10 RE-TIME (128 BPM). Every join is a beat number (bt). WHY these shot lengths: each look change
// moves onto a bar line (5.0 -> bar 3 = 5.625, 10.5 -> bar 6 = 11.25) and the section grows from 14 to 15 s
// (bar 8), so the extra time goes into holds (the empty box, the breath to read the answer, the new look);
// typing keeps within 8% of its old speed, and the sped-up waits keep their old speed (their joins move).
const T_LOOK1 = bt(12), T_LOOK2 = bt(24);
// WHY typing a little faster than filmed: the opening holds a beat of the plain app, two typed lines and the
// reply before the first look change; no one can tell 34 from 42 letters a second.
const lookSegs = (): Seg[] => {
  const a0 = span(L, m(L, 'type1') - bt(1), 0, bt(1));                                            // 0.0: the empty box, its caret blinking
  const a1 = squeeze(L, m(L, 'type1'), m(L, 'type1', 'end'), bt(1), bt(3));                        // beat 1: typed (1.23x; was 1.15x)
  // WHY b keeps the old 1.567x and its join moves instead: slowing the sped-up thinking wait to fill two beats
  // would have meant 1.28x (18% slower than the cut he heard). It runs on past the reply into c.
  const bFrom = m(L, 'send1') - 0.04, B_RATE = 1.567;
  const b = span(L, bFrom, bt(3), bt(5), B_RATE);                                                  // beat 3: sent; the answer lands at ~2.17
  const c = span(L, bFrom + (bt(5) - bt(3)) * B_RATE, bt(5), bt(7));                               // beat 5: a breath to read it
  const d = squeeze(L, m(L, 'type2') - 0.15, m(L, 'type2', 'end'), bt(7), bt(10));                 // beat 7: typed (1.10x)
  const e = span(L, m(L, 'send2') - 0.24, bt(10), T_LOOK1);                                        // beat 10: sent (~4.87); the camera follows it up
  // WHY +0.35 s after the switch: the app repaints in a fallback font for a few frames while the theme's
  // own font loads; the shot starts once the new look is fully itself.
  const f = span(L, m(L, 'swap1') + 0.35, T_LOOK1, bt(19));                                        // bar 3 (5.625): Golden Sunbreak
  const g = squeeze(L, m(L, 'type3') - 0.3, m(L, 'type3', 'end'), bt(19), bt(22));                 // "actuallyyy gimme desert. i'm an ASU boy" (1.10x)
  const h = span(L, m(L, 'send3') - 0.15, bt(22), T_LOOK2);                                        // beat 22: sent (~10.46), followed up
  // WHY 0.94x: Devil's Garden now holds 3.75 s (was 3.5); at true speed the shot would run past the take's end mark
  const i = span(L, m(L, 'swap2') + 0.35, T_LOOK2, bt(32), 0.94);                                  // bar 6 (11.25): Devil's Garden
  return [a0, a1, b, c, d, e, f, g, h, i];
};
// THEIR HOME (bar 8 = 15.0 to bar 16 = 30.0)
const homeSegs = (): Seg[] => {
  const a = span(HM, m(HM, 'type1', 'end') + 0.1 - (bt(35) - bt(32)), bt(32), bt(35));             // bar 8 (15.0): "i want youcoded to manage my smart home"
  // WHY 1.38x (was 1.50x, 8% slower): the thinking wait now fills three beats, so the send lands on beat 35
  const bFrom = m(HM, 'send1') - 0.05, B_RATE = 1.38;
  const b = span(HM, bFrom, bt(35), bt(38), B_RATE);                                               // sent; the answer arrives (~17.7)
  const c = span(HM, bFrom + (bt(38) - bt(35)) * B_RATE, bt(38), bt(39));                          // a breath to read "All on one screen?"
  const d = playTo(HM, m(HM, 'type2', 'end'), bt(39), bt(43));                                     // "epic. can we put my room on the front…"
  // WHY the wait between the last letter and Enter is jumped (as the look already did): it fits the send
  // into the beat before the bar-line cut to the page
  const e = playTo(HM, m(HM, 'send2') + SENT.home, bt(43), bt(44));
  const page = (at: number, out: number, rate: number): Seg => ({ clip: HM, from: m(HM, 'pagehold'), at, out, rate });
  // WHY the page holds two bars: it opens straight on what was asked for (my room on the front) and has time
  // to show the second half of the request: "Everything else" is tapped on bar 12 (22.5), the rest of the
  // house slides in and is readable, and "My room" comes back a bar and a beat later.
  const f = playTo(HM, m(HM, 'type3', 'end'), bt(52), bt(55.5));                                   // bar 13 (24.375): "perfect. now make the sliders bigger…"
  const g = playTo(HM, m(HM, 'send3') + SENT.home, bt(55.5), bt(56));                              // sent (the wait jumped)
  return [a, b, c, d, e, page(bt(44), bt(52), 0.75), f, g, page(bt(56), bt(64), 0.85)];
};
// THEIR MONEY (bar 16 = 30.0 to bar 23 = 43.125), then the email to bar 25
const moneyPage = (at: number, out: number, rate: number): Seg => ({ clip: MN, from: m(MN, 'pagehold'), at, out, rate });
const moneySegs = (): Seg[] => [
  // WHY the typing at 0.97x (was 0.91x) and the wait before Enter jumped: the page now opens on bar 17 (31.875)
  squeeze(MN, m(MN, 'type1') - 0.03, m(MN, 'type1', 'end'), bt(64), bt(67)),                      // bar 16 (30.0): "can we connect my bank…"
  playTo(MN, m(MN, 'send1') + SENT.money, bt(67), bt(68)),                                         // sent
  moneyPage(bt(68), bt(76), 0.9),                                                                  // bar 17 (31.875)
  span(MN, m(MN, 'type2') - 0.01, bt(76), bt(84)),                                                 // bar 19 (35.625): "can it pull out my recurring bills…" → "Yes. Found eleven."
  moneyPage(bt(84), bt(88), 0.9),                                                                  // bar 21 (39.375)
  span(MN, m(MN, 'type3') - 0.3, bt(88), bt(92)),                                                  // bar 22 (41.25): "send me those numbers every morning…"
  moneyPage(bt(92), bt(100), 0.6),                                                                 // bar 23 (43.125): beside the email
];
// One change per beat after the sliders grow: beat 57 the sliders grow · 59 the ceiling light is switched on ·
// 60 (bar 15) the thermostat nudged down · 61 "Wind down".
const HOME_T = { build: bt(44), tabOut: bt(48), tabBack: bt(51), bigger: bt(57), ceiling: bt(59), thermo: bt(60), scene: bt(61) };
// WHY bills 0.15 s before the bar-21 cut: the page opens with the person's tap already sliding the tab across
// and the first bills arriving, never on the old tab about to change.
const MONEY_T = { connect: bt(68), bills: bt(84) - 0.15 };
const T_EMAIL = bt(92), T_BEFORE = bt(100), T_AFTER = bt(101), T_MONEY2 = bt(104), T_LINES = bt(108), T_NAME = bt(120);

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
  // WHY these key times (round 10): each keeps its old distance from the event it follows (the typing, the
  // send, the reply, the look change), moved with that event onto the 128 grid
  CHAT(0, 0.93), TYPE(0.9), TYPE(1.43),
  // sent: out to the whole window to read the answer, then back in for the reply typed close up
  CHAT(2.2, 0.95, 'out'), CHAT(3.2, 0.955), TYPE(3.7), TYPE(4.87),
  // the message is sent and the camera follows it up the chat; a slow push into it until the bar line
  BUB2(5.42), BUB2(T_LOOK1, 1.76),
  // bar 3: the same framing in the new look, then out to the whole window over a second (decelerating)
  BUB2(T_LOOK1, 1.76), CHAT(7.0, 0.95, 'out'), CHAT(8.5, 0.925),
  // "actuallyyy gimme desert. i'm an ASU boy", close; sent, followed up; bar 6 the same move into Devil's Garden
  TYPE(9.0), TYPE(10.46), BUB3(11.0), BUB3(T_LOOK2, 1.96),
  BUB3(T_LOOK2, 1.96), CHAT(12.65, 0.95, 'out'), CHAT(bt(32), 0.92),
  // their home
  TYPE(bt(32)), TYPE(16.45), CHAT(17.4, 0.93), CHAT(bt(44), 0.955),
  PAGE(bt(44), 0.91), PAGE(bt(52), 0.945),
  CHAT(bt(52), 0.93), CHAT(bt(56), 0.955),
  PAGE(bt(56), 0.91), PAGE(bt(64), 0.95),
  // their money: close on the box until the send, then straight to the page it made. WHY no pull back here:
  // pulling out before the message is sent showed the empty chat's placeholder line for half a second.
  TYPE(bt(64)), TYPE(bt(68)),
  PAGE(bt(68), 0.91), PAGE(bt(76), 0.945),
  CHAT(bt(76), 0.93), CHAT(bt(84), 0.955),
  PAGE(bt(84), 0.91), PAGE(bt(88), 0.935),
  CHAT(bt(88), 0.93), CHAT(bt(92), 0.95),
  // the email: the window steps back to the left so the morning email can arrive beside it, outside the app
  // (review 2026-11-20: a card laid over the window's title bar read as pasted onto the app)
  // WHY these numbers (review 2026-11-20: the window sat 5% from the left edge): at z 0.648 the window is
  // 1063 px wide; focus x 0.753 puts its left edge at 160 px, and the email (500 wide) ends at 1766, so both
  // sit inside the 8% margins with a 50 px gap between them.
  // WHY cut straight to this framing on the email's bar line (not a step back after the cut): the notification then drops in
  // beside a still window, never over its edge while it is still moving.
  [T_EMAIL, 0.652, 0.753, 0.5], [T_BEFORE, 0.636, 0.753, 0.5],
];

// ------------------------------------------------------------------ the film
export const Take2: React.FC<{ narrator?: boolean }> = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const segs = React.useMemo(() => [...lookSegs(), ...homeSegs(), ...moneySegs()], []);
  const [, z, fx, fy] = camAt(CAM, t);
  const onPage = (a: number, b: number) => t >= a && t < b;
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const content = onPage(bt(44), bt(52)) || onPage(bt(56), bt(64)) ? <HomeUI W={W} H={H} T={HOME_T} />
    : onPage(bt(68), bt(76)) || onPage(bt(84), bt(88)) || onPage(bt(92), bt(100)) ? <MoneyUI W={W} H={H} T={MONEY_T} /> : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take2-mix.wav')} />
      {/* WHY lavender around the window: brand guide section 8, everything around the app wears the brand look */}
      <AbsoluteFill><Day /></AbsoluteFill>
      {t < T_BEFORE && <AppWindow segs={segs} content={content} z={z} cx={960} cy={540} fx={fx} fy={fy} />}
      <Email />
      {t >= T_BEFORE && t < T_LINES && <Payoff />}
      {/* the two lines, then the name. WHY these times (review 2026-11-20: both lines left before they could be
          read): line one on bar 27 (50.625) for 2.2 s (it needs 2.2), line two on beat 113 (52.97) for 3.1 s (it
          needs 2.95), with a breath between them; the name lands on bar 30 (56.25) and holds 3.75 s. */}
      <Line text="stop waiting for *updates.*" at={T_LINES} out={52.85} size={6.4} />
      <Line text="make anything you can imagine, / just by *asking.*" at={bt(113)} out={56.1} size={5.6} />
      <EndCard at={T_NAME} />
    </AbsoluteFill>
  );
};

/** The kawaii email (43-46). It arrives OUTSIDE the window (laid over the money page it read as pasted on):
 *  the window steps back to the left and, on the bar-23 downbeat (43.125), a notification drops in beside it. That
 *  notification IS the email's own pink header (who it is from, "every morning", the subject); one beat later it
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
  // WHY one beat (was 0.5 s): the email opens on the beat after the bar it drops in on (round 10 grid)
  const open = t < T_EMAIL + BEAT ? 0 : spring({ frame: frame - s2f(T_EMAIL + BEAT), fps: FPS, config: { damping: 19, stiffness: 120, mass: 0.9 } });
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

/** The payoff (bar 25 to bar 27, 46.875-50.625 on the round 10 grid), one before-and-after (review 2026-11-20: the old travelling recap of screens seen ten
 *  seconds earlier read as a template slideshow, and the plain app it started as never came back).
 *  46.875 (bar 25)  the plain lilac app from the opening, alone and still. The music breathes here, so this is the held
 *        breath: "this is where it started".
 *  47.34 (one beat later)  on the beat it steps back and up to the left, and the app as it is now rises in front of it, large:
 *        the desert look, with the Home page the person made open in it.
 *  48.75 (bar 26)  on the bar that window switches to their money (Bills & subscriptions, "11 found"), as the app does.
 *  It holds, readable, until the lines; no split frames, one continuous move. */
const Payoff: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const outro = ease01(t, T_LINES - 0.4, T_LINES, EASE_IN);   // WHY: gone as line one lands on bar 27
  const W = BOX.w / CSS, H = BOX.h / CSS;
  const drift = 1 + 0.02 * ease01(t, T_AFTER, T_LINES, (x) => x);   // a slow push over the whole hold, so it is never a freeze
  // the "before": centred as at the start of the film, then back to its slot top left
  const k = ease01(t, T_AFTER, T_AFTER + 0.75, EASE_IN_OUT);
  // WHY this slot (x 154-876, y 114-605 at z 0.44): big enough that the plain lilac app reads at a glance,
  // with only its lower right corner tucked behind the "after" (x 684-1766, y 232-969), all inside 8% margins.
  const before = { x: interpolate(k, [0, 1], [960, 515]), y: interpolate(k, [0, 1], [540, 360]), z: interpolate(k, [0, 1], [0.93 * (1 + 0.015 * ease01(t, T_BEFORE, T_AFTER, (x) => x)), 0.44]) };
  // the "after": slides up from below the frame and settles, decelerating, in front. WHY a slide and not a
  // fade: fading in over the lilac window printed one window through the other for a few frames.
  const r = t < T_AFTER ? 0 : spring({ frame: frame - s2f(T_AFTER), fps: FPS, config: { damping: 24, stiffness: 120, mass: 1 } });
  const after = { x: 1225, y: 600 + 900 * (1 - r), z: 0.66 * drift };
  const money = t >= T_MONEY2;   // bar 26 (48.75)
  // WHY these page times: Home already in its finished state (sliders big, the ceiling light on, "Wind down"
  // lit), its cards building in as the window rises; the money page opens straight on the bills, building.
  const homeT = { build: T_AFTER + 0.05, tabOut: 999, tabBack: 999, bigger: 40, ceiling: 40, thermo: 40, scene: 40 };
  const moneyT = { connect: 40, bills: T_MONEY2 - 0.15 };
  return (
    <AbsoluteFill style={{ opacity: 1 - outro }}>
      <AppWindow segs={[{ clip: L, from: m(L, 'open') + 0.2, at: T_BEFORE, out: T_LINES, rate: 0.25 }]} z={before.z * (k > 0 ? drift : 1)} cx={before.x} cy={before.y} />
      {r > 0.001 && (
        <div>
          <AppWindow segs={money ? [{ clip: MN, from: m(MN, 'pagehold'), at: T_MONEY2, out: T_LINES, rate: 0.5 }] : [{ clip: HM, from: m(HM, 'pagehold'), at: T_AFTER, out: T_MONEY2, rate: 0.5 }]}
            content={money ? <MoneyUI W={W} H={H} T={moneyT} /> : <HomeUI W={W} H={H} T={homeT} />} z={after.z} cx={after.x} cy={after.y} />
        </div>
      )}
    </AbsoluteFill>
  );
};
