// Round two, take 3: "Own everything". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// WHY this file mirrors posters.tsx instead of importing it: the film is the approved poster family in
// motion (same size, left edge, top edge, colours, marker and handwriting), but posters.tsx keeps those
// pieces private and other sessions own it. The numbers below are copied from it; change both together.
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, interpolateColors, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { C, DMSANS, EASE_IN_OUT, EASE_OUT, FPS, OUTFIT } from '../brand';
import { Lockup, ramp } from '../kit';

const HAND = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
const linear = (x: number) => x;

// ---------- the hit points: ONE grid, 96 BPM (beat 0.625 s, bar of 4 beats = 2.5 s, film = 4 bars) ----------
// WHY a 10 s recut (Destin, 2026-11-23: "i still think the own everything video is too long. it should be like
// 10s"): the 18.2 s cut was the 24 s film played faster, so every hold was sized for a sit-down viewer.
// WHY re-timed onto a single pulse (Destin, 2026-11-24: "animation timing and music in own everything feel very
// odd/choppy/inconsistent"): the 120 BPM cut used the grid only as a ruler. Its lines came in pairs (gaps 0.25,
// 0.5, 0.25 s), then a 1 s hold, a 1.75 s gap after the hand, then lines every 0.75 s, then a 1.25 s gap to the
// name; three different entrances (a 3-frame pop, a 0.45 s rise, a letter-by-letter wave); the lines under the
// struck word jumped down mid-strike; and a 5-frame dissolve flashed off the grid. Now EVERY line of type arrives
// exactly one beat after the one before, all with the same entrance (ENTER below), the film is exactly four bars,
// and each bar does one job: say it, correct it, turn the page, build the answer + sign.
// WHY 96 BPM: four bars of it are exactly 10.0 s; one line per beat (0.625 s) is the slowest even pulse that still
// fits the eight lines, the strike, the hand and a 2 s hold. Beats fall between frames at 30 fps (18.75 frames);
// every animation is interpolated on continuous time, so they still land evenly, not 18/19/19/19.
//
// FOR THE COMPOSER, the hits (seconds, beat number from 0 at 96 BPM):
//   bar 1 -- the statement
//   you'll own      0.000  (beat 0)     film opens on the words (already settled on frame 0)
//   nothing.        0.625  (beat 1)
//   and you'll      1.250  (beat 2)
//   be happy.       1.875  (beat 3)
//   bar 2 -- the correction
//   strike 1        2.500  (beat 4)     the marker hits "nothing." (downbeat of bar 2), pen lifts 2.68
//   strike 2        2.8125 (beat 4.5)   the quicker pass back, pen lifts 2.98
//   hand writes     3.125  (beat 5)     "everything." written below, full stop tapped ~3.90
//   dissolve        4.375  (beat 7)     dark page eases to light across one whole beat, ending on beat 8
//   bar 3 -- the answer
//   own your data.  5.000  (beat 8)     downbeat of bar 3, first line on the light page
//   intelligence.   5.625  (beat 9)
//   software.       6.250  (beat 10)
//   everything.     6.875  (beat 11)
//   bar 4 -- the sign
//   name / logo     7.500  (beat 12)    downbeat of bar 4: the poster's foot, fully in by 8.0
//   end of film    10.000  (beat 16)    the finished poster holds still for 2.0 s
export const BPM = 96;
const BEAT = 60 / BPM;                                  // 0.625 s
const b = (beat: number) => beat * BEAT;
export const T3 = {
  youllOwn: b(0), nothing: b(1), andYoull: b(2), beHappy: b(3),
  // WHY the marker keeps its stroke lengths (0.18 s and 0.17 s, ~5 frames each): that is the speed of a real
  // fast hand. The two strokes sit on the beat and the half-beat, so the pen's rhythm is the music's.
  strike1: [b(4), b(4) + 0.18] as const,                          // the marker hits "nothing."
  strike2: [b(4.5), b(4.5) + 0.17] as const,                      // the second, quicker pass back the other way
  // WHY the hand's own pace is unchanged (0.78 s with the full stop): handwriting faster than that stops
  // looking like a person. Starting on beat 5 it finishes ~3.90, and the correction is read through beat 7.
  write: b(5),
  // WHY one whole beat, beat 7 to beat 8: the 5-frame dissolve read as a flash that broke the pulse; a beat-long
  // ease is a page turn the music can carry, and the light page's first words land on the bar's downbeat.
  dissolve: b(7),
  data: b(8), intelligence: b(9), software: b(10), everything: b(11),
  // WHY the name one beat after "everything." like every other line: it lands on the downbeat of the last bar,
  // and with the shared entrance the headline is still by then.
  end: b(12),
  total: b(16),
};
// WHY one entrance for every line of type, name included: the same length and easing on every arrival is what
// makes the arrivals read as one pulse. 0.5 s with EASE_OUT: the word is ~80% visible within 0.1 s (it lands ON
// the beat) and settles over the rest, finished before the next beat (0.625 s).
const ENTER = 0.5;
const RISE = 0.12;                                      // em the line rises into place
const entrance = (frame: number, at: number) => {
  const p = frame < at * FPS ? 0 : ramp(frame, at, at + ENTER, EASE_OUT);
  return { opacity: p, y: (1 - p) * RISE };
};
export const T3_FRAMES = Math.round(T3.total * FPS);

// ---------- layout, copied from posters.tsx (useFrame, fitLines, familySize) ----------
const EM = 0.535; const FOOT_H = 10.2; const GAP = 0.98;
const useLayout = () => {
  const { width: W, height: H } = useVideoConfig();
  const wide = W / H >= 1.35;
  const u = Math.min(W, H) / 60;
  // WHY 8.5% of the WIDTH (review, 2026-11-20): the posters' margin is 8.5% of the short side, which on the
  // 16:9 film put the headline 5.3% from the left edge, inside the brand guide's 8% safe margin. On the tall
  // frame the width is the short side, so this changes nothing there.
  // Only the SIDE margins use the width; top and bottom keep the posters' short-side margin, so the wide
  // page has the posters' vertical layout and headline height.
  const m = W * 0.085;
  const story = H / W > 1.6;                         // 9:16: keep the top 12% and bottom 20% clear (brand §7)
  const mv = Math.min(W, H) * 0.085;
  const mt = story ? H * 0.125 : mv, mb = story ? H * 0.2 : mv;
  const fit = (lines: string[], extraEm: number, em: number) =>
    Math.min((W - 2 * m) / (Math.max(...lines.map((l) => l.length)) * em * 1.04), (H - mt - mb - FOOT_H * u - 3 * u) / (lines.length * 0.98 + extraEm));
  const nothingLines = wide ? ["you'll own nothing.", "and you'll be happy."] : ["you'll own", 'nothing.', "and you'll", 'be happy.'];
  // WHY the family size: one headline size for every line of the film, exactly as on the posters (Destin, 2026-11-19).
  const size = Math.min(fit(nothingLines, GAP, wide ? 0.47 : 0.45), fit(['own your', 'intelligence.'], GAP, 0.41));
  // The one-page "own your ..." poster (posters.tsx `OwnAll`): five lines; the wide shape shrinks them so the
  // five lines and the foot still fit its height.
  const allSize = wide ? Math.min(size, (H - mt - mb - FOOT_H * u - 3 * u) / 4.95) : size;
  return { W, H, wide, u, m, mt, mb, size, allSize };
};
const rowStyle = (size: number, color: string): React.CSSProperties => ({
  fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 0.98, whiteSpace: 'nowrap', color,
});

// ---------- backgrounds: the posters' colour field, alive ----------
// WHY the drift: a 24 s hold on a static gradient reads as a slide; the field breathes a few percent so the
// frame is never dead, but slowly enough that no one notices it moving.
const Wash: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const dx = Math.sin(t * 0.21) * 2.5, dy = Math.cos(t * 0.17) * 2, grow = Math.sin(t * 0.13) * 3;
  return (
    <AbsoluteFill style={{ background: dark ? C.night : `linear-gradient(180deg, #FBF6FD 0%, ${C.lavender} 45%, #F1E6F8 100%)` }}>
      <AbsoluteFill style={{ background: dark
        ? `radial-gradient(${170 + grow}% ${120 + grow * 0.7}% at ${100 + dx}% ${100 + dy}%, #55236A 0%, #3A1A52 30%, #24113A 58%, ${C.night} 90%)`
        : `radial-gradient(${120 + grow}% ${90 + grow * 0.7}% at ${100 + dx}% ${100 + dy}%, #F1B9DC 0%, #E2C6F2 40%, #FBF6FD 82%)` }} />
    </AbsoluteFill>
  );
};
// WHY a fixed paper grain: it breaks up gradient banding in the h264 encode and gives the field the feel of
// printed stock. Static (one seed), so it never fizzes like video noise.
const Grain: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <AbsoluteFill style={{ mixBlendMode: dark ? 'screen' : 'multiply', opacity: dark ? 0.05 : 0.07, pointerEvents: 'none' }}>
    <svg width="100%" height="100%">
      <filter id="t3grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#t3grain)" />
    </svg>
  </AbsoluteFill>
);

// ---------- arrivals ----------
/** A piece of type arriving on its beat with the film's one shared entrance (see `entrance`). */
const Arrive: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const e = entrance(useCurrentFrame(), at);
  return <span style={{ display: 'inline-block', opacity: e.opacity, transform: `translateY(${e.y}em)` }}>{children}</span>;
};

// ---------- the marker ----------
type Pt = [number, number];
const cubic = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
};
// The posters' two strokes ("M1,24 C18,14 40,27 62,17 S90,13 99,18" and "M3,30 C25,22 48,33 72,24 S92,23 98,26"),
// with the S segments' mirrored handles written out, sampled into points with their running length.
// WHY sampled instead of stroke-dashoffset: the strokes use a non-scaling width on a stretched viewBox, where
// dash lengths are unreliable, and drawing the partial curve keeps the round marker tip at the moving end.
const sample = (segs: [Pt, Pt, Pt, Pt][]) => {
  const pts: Pt[] = [];
  segs.forEach((s, i) => { for (let k = i === 0 ? 0 : 1; k <= 40; k++) pts.push(cubic(s[0], s[1], s[2], s[3], k / 40)); });
  // length measured with x stretched ~3.5x, roughly how the 100x40 box is stretched over the word, so the
  // pen moves at an even speed on screen rather than in the box's own units
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * 3.5, pts[i][1] - pts[i - 1][1]));
  return { pts, len };
};
const STROKE1 = sample([[[1, 24], [18, 14], [40, 27], [62, 17]], [[62, 17], [84, 7], [90, 13], [99, 18]]]);
const STROKE2 = sample([[[3, 30], [25, 22], [48, 33], [72, 24]], [[72, 24], [96, 15], [92, 23], [98, 26]]]);
/** The first `p` (0..1) of a sampled stroke as an SVG path; `reverse` draws it from its far end. */
const partial = (s: typeof STROKE1, p: number, reverse = false) => {
  if (p <= 0) return '';
  const pts = reverse ? [...s.pts].reverse() : s.pts;
  const total = s.len[s.len.length - 1];
  const lens = reverse ? s.len.map((l) => total - l).reverse() : s.len;
  const want = p * total;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] <= want) { out.push(pts[i]); continue; }
    const f = (want - lens[i - 1]) / (lens[i] - lens[i - 1]);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
    break;
  }
  if (out.length === 1) out.push([out[0][0] + 0.01, out[0][1]]);   // a just-landed pen still leaves a round dot
  return 'M' + out.map((q) => `${q[0].toFixed(3)},${q[1].toFixed(3)}`).join(' L');
};
/** Pen speed through one stroke: a quick landing, fast through the middle, a slight drag as it lifts.
 *  WHY not a plain ease: a hand accelerates hard and brakes late; the small wobble keeps it from looking machined. */
const penCurve = (x: number) => {
  const base = interpolate(x, [0, 0.12, 0.8, 1], [0, 0.07, 0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.min(1, Math.max(0, base + Math.sin(x * Math.PI * 3) * 0.012 * (1 - x)));
};

// ---------- the handwriting ----------
// Relative time each letter takes the hand (loops and descenders are slower than a straight v or r).
const LETTER_TIME: Record<string, number> = { e: 1, v: 0.85, r: 0.75, y: 1.35, t: 0.9, h: 1.2, i: 0.55, n: 1, g: 1.45 };
const SWEEP = 0.76 * 0.8;            // seconds for "everything" without the full stop
const STOP_AFTER = 0.1;       // the pen lifts, then taps the full stop (Caveat's bold i has no dot to add)
type Measure = { w: number; xs: number[] };   // text width and each letter's left edge, in unrotated px
/** "everything." written on in Caveat, exactly where and how the poster sets it. The real text is revealed by a
 *  soft-edged, slanted wipe that follows a hand's rhythm letter by letter, and the full stop is tapped last.
 *  WHY reveal the real font (not a drawn path): the letterforms must be identical to the approved poster's. */
const Hand: React.FC<{ text: string; size: number; at: number; anchorRight?: boolean }> = ({ text, size, at, anchorRight }) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLSpanElement>(null);
  const [mz, setMz] = useState<Measure | null>(null);
  const [handle] = useState(() => delayRender('measure handwriting'));
  // WHY measured in the browser: the per-letter edges depend on the font's own shaping (Caveat swaps letter
  // shapes by context), so they are read off the laid-out text once the font has loaded.
  useEffect(() => {
    let live = true;
    document.fonts.load(`700 ${size * 1.2}px ${HAND}`).then(() => {
      const el = ref.current; const node = el?.firstChild;
      if (!live || !el || !node) return;
      const box = el.getBoundingClientRect(); const k = el.offsetWidth / box.width;
      const xs: number[] = [];
      for (let i = 0; i < text.length; i++) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
        xs.push((r.getBoundingClientRect().left - box.left) * k);
      }
      xs.push(el.offsetWidth);
      setMz({ w: el.offsetWidth, xs });
      continueRender(handle);
    });
    return () => { live = false; };
  }, [handle, size, text]);

  const fs = size * 1.2;
  const t = frame / FPS - at;
  const word = text.replace(/\.$/, '');
  const soft = fs * 0.035;
  let front = -soft * 2;
  if (mz && t > 0) {
    // the word letter by letter: each letter eases in and out (the pen slows through its turns)...
    const weights = word.split('').map((c) => LETTER_TIME[c] ?? 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0; front = mz.xs[word.length];
    for (let i = 0; i < word.length; i++) {
      const d = (weights[i] / total) * SWEEP;
      if (t < acc + d) { const q = (t - acc) / d; front = mz.xs[i] + (mz.xs[i + 1] - mz.xs[i]) * (EASE_IN_OUT(q) * 0.85 + q * 0.15); break; }
      acc += d;
    }
    // ...then the pen lifts and taps the full stop in two frames. WHY the end is the full width plus the edge:
    // Chrome reports a shaped letter pair ("g.") as one cluster split down the middle, so the stop's own edge
    // is not reliable; sweeping past the whole line always finishes clean.
    if (t >= SWEEP + STOP_AFTER) front = mz.xs[word.length] + (mz.w + fs * 0.5 - mz.xs[word.length]) * ramp(frame, at + SWEEP + STOP_AFTER, at + SWEEP + STOP_AFTER + 0.07, linear);
  }
  const base = fs * 0.74;                         // roughly Caveat's baseline inside a 1.0 line box
  const pad = fs;                                 // room round the line box so overhanging loops are never cut
  const textStyle: React.CSSProperties = { fontFamily: HAND, fontWeight: 700, fontSize: fs, letterSpacing: '-0.01em', lineHeight: 1, color: C.purpleNight, whiteSpace: 'nowrap' };
  const mask = `linear-gradient(90deg, #000 ${pad + front - soft}px, transparent ${pad + front + soft}px)`;
  return (
    <>
      {/* the measurer: same text, never transformed, never seen */}
      <span ref={ref} style={{ ...textStyle, position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}>{text}</span>
      {/* WHY below the struck word, tilted from its top-left (Destin, 2026-11-20: "the new 'everything' should be
          below nothing"): a correction written under the line it fixes, placed exactly as posters.tsx `Struck`. */}
      <span style={{ position: 'absolute', ...(anchorRight ? { right: '-2%' } : { left: '1%' }), top: '84%', transform: 'rotate(-5deg)', transformOrigin: '0% 0%' }}>
        <span style={{ ...textStyle, visibility: 'hidden', display: 'inline-block' }}>{text}</span>
        {mz && t > 0 && (
          // WHY the skew pair: the wipe's edge leans with the handwriting's slant (outer layer skewed, text
          // un-skewed inside), so an upstroke is revealed along its own angle instead of being sliced upright.
          <span style={{ position: 'absolute', left: -pad, top: -pad, width: mz.w + 2 * pad, height: fs + 2 * pad, transform: 'skewX(-16deg)', transformOrigin: `${pad}px ${pad + base}px`,
            WebkitMaskImage: mask, maskImage: mask, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' }}>
            <span style={{ ...textStyle, position: 'absolute', left: pad, top: pad, transform: 'skewX(16deg)', transformOrigin: `0 ${base}px` }}>{text}</span>
          </span>
        )}
      </span>
    </>
  );
};

/** "nothing." as printed, then struck twice by the marker and corrected below in handwriting (posters.tsx `Struck`). */
const Struck: React.FC<{ size: number; anchorRight?: boolean }> = ({ size, anchorRight }) => {
  const frame = useCurrentFrame();
  const p1 = penCurve(ramp(frame, T3.strike1[0], T3.strike1[1], linear));
  const p2 = penCurve(ramp(frame, T3.strike2[0], T3.strike2[1], linear));
  // WHY the word greys as the first stroke crosses it: on the poster the struck word is faded; here you watch
  // the marker take it away.
  const fade = ramp(frame, T3.strike1[0] + 0.05, T3.strike1[1] + 0.25, EASE_OUT);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ color: interpolateColors(fade, [0, 1], [C.nightText, C.nightText2]), opacity: 1 - 0.45 * fade }}>nothing.</span>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', left: '-4%', width: '106%', top: '34%', height: '44%', overflow: 'visible' }}>
        {p1 > 0 && <path d={partial(STROKE1, p1)} fill="none" stroke={C.purpleNight} strokeWidth={size * 0.075} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {p2 > 0 && <path d={partial(STROKE2, p2, true)} fill="none" stroke={C.purpleNight} strokeWidth={size * 0.05} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />}
      </svg>
      <Hand text="everything." size={size} at={T3.write} anchorRight={anchorRight} />
    </span>
  );
};

// ---------- scene 1: "you'll own nothing. and you'll be happy." on night ----------
// WHY the first line's fade starts 0.1 s before the film does: frame 0 was an empty field (the 3-frame fade
// had not begun), and frame 0 is what a feed shows as the still before playing. Now the film opens on words.
// WHY 0.25 s now (half the shared 0.5 s entrance): with the longer entrance a 0.1 s lead left frame 0 at ~60%
// opacity; at half the entrance the line is ~97% in on frame 0 and its last settle still lands on beat 0.
const FIRST_LEAD = 0.25;
const Nothing: React.FC = () => {
  const { wide, m, mt, size } = useLayout();
  const row = rowStyle(size, C.nightText);
  // WHY the room under the struck line is there from the first frame (was: opened by a reflow during the second
  // stroke): the two lines below jumped down while the marker was still moving, the "choppy" Destin saw. Held
  // open from the start it reads as the break after a full stop ("nothing." / "and you'll be happy."), the page
  // never moves, and the finished frame is the poster's layout exactly.
  const open = 1;
  return (
    <AbsoluteFill><Wash dark />
      <div style={{ position: 'absolute', left: m, right: m, top: mt }}>
        {wide ? (<>
          <div style={{ ...row, marginBottom: GAP * size * open }}>
            <Arrive at={T3.youllOwn - FIRST_LEAD}>you'll own</Arrive><span style={{ display: 'inline-block', width: 0.26 * size }} />
            <Arrive at={T3.nothing}><Struck size={size} anchorRight /></Arrive>
          </div>
          <div style={row}><Arrive at={T3.andYoull}>and you'll</Arrive> <Arrive at={T3.beHappy}>be happy.</Arrive></div>
        </>) : (<>
          <div style={row}><Arrive at={T3.youllOwn - FIRST_LEAD}>you'll own</Arrive></div>
          <div style={{ ...row, marginBottom: GAP * size * open }}><Arrive at={T3.nothing}><Struck size={size} /></Arrive></div>
          <div style={row}><Arrive at={T3.andYoull}>and you'll</Arrive></div>
          <div style={row}><Arrive at={T3.beHappy}>be happy.</Arrive></div>
        </>)}
      </div>
      <Grain dark />
    </AbsoluteFill>
  );
};

// ---------- scene 2: one page that builds into the `OwnAll` poster ----------
// WHY one page (Destin, 2026-11-20: "the multiple pages should be a single page, like the poster"): each bar
// adds a line under the last and nothing leaves, so the film ends as exactly the poster.
const LINES: { text: string; at: number }[] = [
  { text: 'data.', at: T3.data }, { text: 'intelligence.', at: T3.intelligence }, { text: 'software.', at: T3.software },
];
/** A noun line: rises in on its beat in purple, then settles to plum when the next line takes the beat.
 *  WHY the hand-over of colour: the newest word always carries the accent, and the page ends with only
 *  "everything." purple, as on the poster. */
const AddLine: React.FC<{ text: string; at: number; next?: number }> = ({ text, at, next }) => {
  const frame = useCurrentFrame();
  const e = entrance(frame, at);
  // WHY the drain is exactly one beat, from the next line's arrival to the one after it (Destin, 2026-11-20:
  // "i think it could be smoother"): the accent is handed over across a whole beat, never two words mid-fade at
  // once, and it starts and ends on the grid like everything else. `next` absent: the closer stays purple.
  const settle = next == null ? 0 : ramp(frame, next, next + BEAT, EASE_IN_OUT);
  return <div style={{ opacity: e.opacity, transform: `translateY(${e.y}em)`, color: interpolateColors(settle, [0, 1], [C.purple, C.plum]) }}>{text}</div>;
};
/** The poster's foot (posters.tsx `Foot`, light): icon + name, then the address and platforms. */
const Foot: React.FC<{ u: number; row: boolean }> = ({ u, row }) => (
  <div style={{ display: 'flex', flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : 'flex-start', gap: row ? 3 * u : 1.5 * u }}>
    <Lockup icon={5.2 * u} />
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 1.4 * u, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: 2.1 * u, color: C.plum, letterSpacing: '-0.01em' }}>youcoded.ai</span>
      <span style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: 1.45 * u, color: C.plum2 }}>Free · Windows · Mac · Linux · Android</span>
    </div>
  </div>
);
const OwnAll: React.FC = () => {
  const frame = useCurrentFrame();
  const { wide, u, m, mt, mb, allSize } = useLayout();
  const own = entrance(frame, T3.data);
  const foot = entrance(frame, T3.end);
  return (
    <AbsoluteFill><Wash />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, ...rowStyle(allSize, C.plum) }}>
        {/* WHY the same entrance as the noun under it: the two arrive together and must move alike */}
        <div style={{ opacity: own.opacity, transform: `translateY(${own.y}em)` }}>own your</div>
        {LINES.map((l, i) => <AddLine key={l.text} text={l.text} at={l.at} next={LINES[i + 1]?.at ?? T3.everything} />)}
        {/* WHY the closer uses the shared entrance (was a letter-by-letter wave over ~1 s): a third kind of
            arrival broke the pulse and kept the headline moving into the name's beat. Its emphasis is the purple
            it keeps, as on the poster. */}
        <AddLine text="everything." at={T3.everything} />
      </div>
      {/* WHY the foot arrives with the same entrance and timing as every line (its rise scaled to the lockup) */}
      <div style={{ position: 'absolute', left: m, bottom: mb, opacity: foot.opacity, transform: `translateY(${(foot.y / RISE) * 1.2 * u}px)` }}>
        <Foot u={u} row={wide} />
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// WHY Sequences carry absolute times (each child reads the film's frame via the `from` offset being undone):
// every scene is written in film seconds, so the hit table above is the only place timing lives.
// `dissolve`: the scene fades in over this many frames ENDING on `from`, over the scene before it.
// WHY (review, 2026-11-20): a one-frame flip between plum-black and near-white flashed harshly on a phone at
// night. The new scene's text is held back until `from` (see `onBeat`), so only the colour field dissolves
// and the words still change exactly on the beat.
// WHY the dissolve now runs from T3.dissolve to `from` (one whole beat, ~19 frames, was 5): see T3.dissolve.
const Scene: React.FC<{ from: number; to: number; dissolve?: number; children: React.ReactNode }> = ({ from, to, dissolve, children }) => {
  const frame = useCurrentFrame();
  const start = dissolve == null ? Math.round(from * FPS) : Math.floor(dissolve * FPS);
  const o = dissolve == null ? 1 : interpolate(frame, [dissolve * FPS, from * FPS], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
  return (
    <Sequence from={start} durationInFrames={Math.round(to * FPS) - start} layout="none">
      <AbsoluteFill style={{ opacity: o }}>
        <Sequence from={-start} layout="none">{children}</Sequence>
      </AbsoluteFill>
    </Sequence>
  );
};
/** 1 from the beat on, 0 during the dissolve before it. */
const onBeat = (frame: number, at: number) => (frame >= Math.round(at * FPS) ? 1 : 0);

export const Take3: React.FC<{ narrator?: boolean }> = () => (
  <AbsoluteFill style={{ background: C.night }}>
    <Audio src={staticFile('audio/sb-take3-mix.wav')} />
    <Scene from={0} to={T3.data}><Nothing /></Scene>
    <Scene from={T3.data} to={T3.total} dissolve={T3.dissolve}><OwnAll /></Scene>
  </AbsoluteFill>
);
