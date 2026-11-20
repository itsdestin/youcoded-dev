// Round two, take 3: "Own everything". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// WHY this file mirrors posters.tsx instead of importing it: the film is the approved poster family in
// motion (same size, left edge, top edge, colours, marker and handwriting), but posters.tsx keeps those
// pieces private and other sessions own it. The numbers below are copied from it; change both together.
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, interpolateColors, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, ramp } from '../kit';

const HAND = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
const linear = (x: number) => x;

// ---------- the hit points (seconds; 100 BPM, beat 0.6 s, bar 2.4 s) ----------
// WHY one table: the music is composed to exactly these, so every animation reads its times from here.
export const T3 = {
  // WHY the first line at 0: an empty opening frame read as a slow start; the film now opens on the words.
  youllOwn: 0.0, nothing: 1.8, andYoull: 3.6, beHappy: 4.2,     // the deadpan statement
  // WHY a beat before bar 4 (coordinator, 2026-11-20): so the fully corrected poster holds ~1.4 s before 9.6.
  strike1: [6.6, 6.83] as const,                                 // the marker hits "nothing."
  strike2: [6.87, 7.06] as const,                                // the second, quicker pass back the other way
  reflow: [7.0, 7.35] as const,                                  // tall frame only: room opens for the correction
  write: 7.28,                                                   // the hand starts "everything."
  data: 9.6, intelligence: 12.0, software: 14.4, everything: 16.8,
  end: 19.2,
};

// ---------- layout, copied from posters.tsx (useFrame, fitLines, familySize) ----------
const EM = 0.535; const FOOT_H = 10.2; const GAP = 0.98;
const useLayout = () => {
  const { width: W, height: H } = useVideoConfig();
  const wide = W / H >= 1.35;
  const u = Math.min(W, H) / 60;
  const m = Math.min(W, H) * 0.085;
  const story = H / W > 1.6;                         // 9:16: keep the top 12% and bottom 20% clear (brand §7)
  const mt = story ? H * 0.125 : m, mb = story ? H * 0.2 : m;
  const fit = (lines: string[], extraEm: number, em: number) =>
    Math.min((W - 2 * m) / (Math.max(...lines.map((l) => l.length)) * em * 1.04), (H - mt - mb - FOOT_H * u - 3 * u) / (lines.length * 0.98 + extraEm));
  const nothingLines = wide ? ["you'll own nothing.", "and you'll be happy."] : ["you'll own", 'nothing.', "and you'll", 'be happy.'];
  // WHY the family size: one headline size for every line of the film, exactly as on the posters (Destin, 2026-11-19).
  const size = Math.min(fit(nothingLines, GAP, wide ? 0.47 : 0.45), fit(['own your', 'intelligence.'], GAP, 0.41));
  return { W, H, wide, u, m, mt, mb, size };
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
/** A piece of type that cuts on at `at`: a 3-frame fade and a short settle upward. WHY so small: the opening is
 *  deadpan; the words should land like a statement on the beat, not perform. */
const Arrive: React.FC<{ at: number; children: React.ReactNode; rise?: number; leave?: number }> = ({ at, children, rise = 0.07, leave }) => {
  const frame = useCurrentFrame();
  const o = ramp(frame, at, at + 0.1, linear);
  const y = (1 - ramp(frame, at, at + 0.5)) * rise;
  // `leave`: gone by this time, lifting a hair as it fades (4 frames), so the next word owns the beat
  const x = leave == null ? 0 : ramp(frame, leave - 0.14, leave, EASE_IN);
  if (frame < at * FPS) return <span style={{ display: 'inline-block', opacity: 0 }}>{children}</span>;
  return <span style={{ display: 'inline-block', opacity: o * (1 - x), transform: `translateY(${y - x * 0.05}em)` }}>{children}</span>;
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
const SWEEP = 0.76;            // seconds for "everything" without the full stop
const STOP_AFTER = 0.12;       // the pen lifts, then taps the full stop (Caveat's bold i has no dot to add)
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
      <span style={{ position: 'absolute', ...(anchorRight ? { right: '-2%' } : { left: '1%' }), bottom: '80%', transform: 'rotate(-5deg)', transformOrigin: '0% 100%' }}>
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

/** "nothing." as printed, then struck twice by the marker and corrected above in handwriting (posters.tsx `Struck`). */
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
const Nothing: React.FC = () => {
  const frame = useCurrentFrame();
  const { wide, m, mt, size } = useLayout();
  const row = rowStyle(size, C.nightText);
  // WHY the tall frame opens a line for the correction only after the strike: before it, an empty line between
  // "you'll own" and "nothing." would read as a layout mistake. Wide has the room above the line already.
  const open = wide ? 1 : ramp(frame, T3.reflow[0], T3.reflow[1], EASE_IN_OUT);
  return (
    <AbsoluteFill><Wash dark />
      <div style={{ position: 'absolute', left: m, right: m, top: mt }}>
        {wide ? (<>
          <div style={{ ...row, marginTop: GAP * size }}>
            <Arrive at={T3.youllOwn}>you'll own</Arrive><span style={{ display: 'inline-block', width: 0.26 * size }} />
            <Arrive at={T3.nothing}><Struck size={size} anchorRight /></Arrive>
          </div>
          <div style={row}><Arrive at={T3.andYoull}>and you'll</Arrive> <Arrive at={T3.beHappy}>be happy.</Arrive></div>
        </>) : (<>
          <div style={row}><Arrive at={T3.youllOwn}>you'll own</Arrive></div>
          <div style={{ ...row, marginTop: GAP * size * open }}><Arrive at={T3.nothing}><Struck size={size} /></Arrive></div>
          <div style={row}><Arrive at={T3.andYoull}>and you'll</Arrive></div>
          <div style={row}><Arrive at={T3.beHappy}>be happy.</Arrive></div>
        </>)}
      </div>
      <Grain dark />
    </AbsoluteFill>
  );
};

// ---------- scene 2 and 3: "own your data / intelligence / software." then "own everything." ----------
const NOUNS: { word: string; at: number }[] = [
  { word: 'data.', at: T3.data }, { word: 'intelligence.', at: T3.intelligence }, { word: 'software.', at: T3.software },
];
/** One noun on its bar: rises in on the downbeat, lifts away in the four frames before the next one.
 *  WHY "own your" never moves: only the noun changes, so the eye stays put and the swap is the rhythm. */
const Noun: React.FC<{ word: string; at: number; out: number; color: string }> = ({ word, at, out, color }) => {
  const frame = useCurrentFrame();
  if (frame < at * FPS || frame >= out * FPS) return null;
  const inP = ramp(frame, at, at + 0.42, EASE_OUT);
  const o = ramp(frame, at, at + 0.12, linear);
  const x = ramp(frame, out - 0.14, out, EASE_IN);
  return <div style={{ color, opacity: o * (1 - x), transform: `translateY(${(1 - inP) * 0.2 - x * 0.06}em)` }}>{word}</div>;
};
const OwnYour: React.FC = () => {
  const frame = useCurrentFrame();
  const { wide, m, mt, size } = useLayout();
  const yourOut = ramp(frame, T3.everything - 0.14, T3.everything, EASE_IN);   // "your" steps out for the closer
  return (
    <AbsoluteFill><Wash />
      <div style={{ position: 'absolute', left: m, right: m, top: mt + (wide ? GAP * size : 0), ...rowStyle(size, C.plum) }}>
        <div>own <span style={{ display: 'inline-block', opacity: 1 - yourOut, transform: `translateY(${-yourOut * 0.05}em)` }}>your</span></div>
        {NOUNS.map((n, i) => <Noun key={n.word} word={n.word} at={n.at} out={NOUNS[i + 1]?.at ?? T3.everything} color={C.purple} />)}
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
const OwnEverything: React.FC = () => {
  const { wide, m, mt, size } = useLayout();
  return (
    <AbsoluteFill><Wash dark />
      <div style={{ position: 'absolute', left: m, right: m, top: mt + (wide ? GAP * size : 0), ...rowStyle(size, C.nightText) }}>
        <div>own</div>
        <Noun word="everything." at={T3.everything} out={T3.end + 1} color={C.purpleNight} />
      </div>
      <Grain dark />
    </AbsoluteFill>
  );
};

// WHY Sequences carry absolute times (each child reads the film's frame via the `from` offset being undone):
// every scene is written in film seconds, so the hit table above is the only place timing lives.
const Scene: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => (
  <Sequence from={Math.round(from * FPS)} durationInFrames={Math.round((to - from) * FPS)} layout="none">
    <Sequence from={-Math.round(from * FPS)} layout="none">{children}</Sequence>
  </Sequence>
);

export const Take3: React.FC<{ narrator?: boolean }> = () => (
  <AbsoluteFill style={{ background: C.night }}>
    <Audio src={staticFile('audio/take3-mix.wav')} />
    <Scene from={0} to={T3.data}><Nothing /></Scene>
    <Scene from={T3.data} to={T3.everything}><OwnYour /></Scene>
    <Scene from={T3.everything} to={T3.end}><OwnEverything /></Scene>
    {/* WHY the wrapper: the kit's EndCard paints flat lavender as its first layer. On the light colour field the
        last cut lands on the same paper as the "own your" frames; the rule below makes only that first layer
        transparent, so kit.tsx stays untouched and the card's own layout is unchanged. */}
    <Scene from={T3.end} to={24}>
      <Wash />
      <style>{'.t3-end > div > div:first-child { background: transparent !important; }'}</style>
      <AbsoluteFill className="t3-end"><EndCard at={T3.end} /></AbsoluteFill>
      <Grain />
    </Scene>
  </AbsoluteFill>
);
