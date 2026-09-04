import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { Window } from './Window';
import { Backdrop } from './Backdrop';
import { CLIP, CAPTION } from './layout';
import { THEMES, type Slug, type Theme } from './themes';
import { family } from './Caption';

// Caption STYLE variants for Destin (2026-09-04: "i want a few variants of different ways to
// style the bottom captions. i don't like the underline. different sizes/effects/etc.").
// Round one was five stills; this round is nine designs, each ANIMATED, shown in a reel
// (light theme, then dark) and on a still sheet. None of them draws an underline.
//
//   G · Glow            the current look minus the underline, 48 px, slides up + fades
//   X · Big glow        the same glow at 62 px, pops in with a scale overshoot
//   P · Plate           words on a blurred pill; the pill rises, the words follow
//   O · Outline         knockout text, revealed by a left→right wipe
//   K · Kicker          a tiny letterspaced kicker in the accent over the headline
//   S · Stacked accent  the payoff word bigger and in the accent, popping in last
//   W · Word by word    each word springs up in turn, the last in the accent
//   B · Blur in         56 px, from a soft blur to sharp; a faint accent glow stays
//   R · Ribbon          a solid accent bar behind the words, sliding in from the left
//
// THE BAND: the window ends at y 954 and the frame at 1080; every design has to live
// between y 960 and y 1070 (~110 px). The `top` of each design and its size were checked on
// the sheet (docs/.../storyboard-v3/caption-variants-2.png) — X at 62 px is the tallest.
export type LabelDesign = 'G' | 'X' | 'P' | 'O' | 'K' | 'S' | 'W' | 'B' | 'R';
export const DESIGNS: LabelDesign[] = ['G', 'X', 'P', 'O', 'K', 'S', 'W', 'B', 'R'];
export const DESIGN_NAME: Record<LabelDesign, string> = {
  G: 'Glow', X: 'Big glow', P: 'Plate', O: 'Outline', K: 'Kicker', S: 'Stacked accent', W: 'Word by word', B: 'Blur in', R: 'Ribbon',
};

// The soft glow the current label wears (Label.tsx): accent-tinted on dark themes, a
// canvas-coloured halo plus a faint dark edge on light ones (pink-on-pink needs an edge).
const glowFor = (t: Theme, strength = 1) => t.dark
  ? `0 0 ${Math.round(22 * strength)}px ${t.accent}aa, 0 3px 18px rgba(0,0,0,.6)`
  : `0 0 ${Math.round(18 * strength)}px ${t.accent}66, 0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.3)`;
// The plain drop shadow (no accent tint) for the designs that carry their own colour.
const shadowFor = (t: Theme) => t.dark ? '0 3px 18px rgba(0,0,0,.6)' : `0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.25)`;

// Every design is a function of `p`, the frames since its `at` (negative = not yet).
// They all settle by p = 30 and hold; a negative `at` (the stills use -40) draws them settled.
type DesignProps = { t: Theme; words: string[]; p: number; fps: number; kicker: string };

/** Splits the headline into spans, the last word in the accent when `accent` is on. */
const Words: React.FC<{ t: Theme; words: string[]; accent?: boolean; style?: (i: number) => React.CSSProperties }> = ({ t, words, accent = true, style }) => {
  const last = words.length - 1;
  return <>{words.map((w, i) => (
    <span key={i} style={{ display: 'inline-block', marginRight: i < last ? '0.26em' : 0, color: accent && i === last && words.length > 1 ? t.accent : undefined, ...(style ? style(i) : {}) }}>{w}</span>
  ))}</>;
};

// The column every design sits in: full width, centred, the theme's face.
const band = (t: Theme, top: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  position: 'absolute', left: 0, right: 0, top, display: 'flex', flexDirection: 'column', alignItems: 'center',
  fontFamily: family(t), fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, whiteSpace: 'nowrap', color: t.fg, ...extra,
});

// G · Glow — Label.tsx's own spring (damping 18, stiffness 120): a 10 px rise and a fade.
const Glow: React.FC<DesignProps> = ({ t, words, p, fps }) => {
  const s = spring({ frame: p, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <div style={band(t, CAPTION.top - 6, { textShadow: glowFor(t) })}>
      <div style={{ fontSize: 48, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [10, 0])}px)` }}><Words t={t} words={words} /></div>
    </div>
  );
};

// X · Big glow — 62 px, tighter tracking, and a low-damping spring so the scale overshoots
// past 1 and settles back: it lands ON the beat rather than easing in. 62 × 1.1 = 68 px tall,
// top at 974 → bottom 1042, inside the band.
const BigGlow: React.FC<DesignProps> = ({ t, words, p, fps }) => {
  const s = spring({ frame: p, fps, config: { damping: 9, stiffness: 140 } });
  const fade = interpolate(p, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={band(t, CAPTION.top - 10, { textShadow: glowFor(t, 1.2), letterSpacing: '-0.035em' })}>
      <div style={{ fontSize: 62, opacity: fade, transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, transformOrigin: 'center center' }}><Words t={t} words={words} /></div>
    </div>
  );
};

// P · Plate — a blurred, semi-transparent pill rises into place first; the words fade in
// 5 frames later so the plate reads as a surface the words land on, not a box drawn around them.
const Plate: React.FC<DesignProps> = ({ t, words, p, fps }) => {
  const pill = spring({ frame: p, fps, config: { damping: 16, stiffness: 120 } });
  const text = spring({ frame: p - 5, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <div style={band(t, CAPTION.top - 12)}>
      <div style={{ padding: '8px 30px', borderRadius: 999, opacity: pill, transform: `translateY(${interpolate(pill, [0, 1], [16, 0])}px)`,
        background: t.dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        boxShadow: `0 0 0 1.5px ${t.accent}44, 0 10px 30px rgba(0,0,0,.25)` }}>
        <div style={{ fontSize: 46, opacity: text }}><Words t={t} words={words} /></div>
      </div>
    </div>
  );
};

// O · Outline — knockout text (a stroke, the fill in the canvas colour), revealed by a wipe:
// a clip-path inset whose RIGHT edge moves from 100 % to 0 % over 18 frames. One colour only —
// an outlined word in a second colour read as two different signs.
const Outline: React.FC<DesignProps> = ({ t, words, p }) => {
  const wipe = interpolate(p, [0, 18], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={band(t, CAPTION.top - 8, { color: t.dark ? '#fff' : t.canvas, WebkitTextStroke: `1.5px ${t.dark ? t.accent : t.fg}`, textShadow: t.dark ? `0 0 18px ${t.accent}77` : `0 2px 12px ${t.fg}55` })}>
      {/* the padding keeps the glow inside the clip box so the wipe edge is the letters, not a cut-off halo */}
      <div style={{ fontSize: 50, padding: '0 24px', clipPath: `inset(-20px ${wipe}% -20px -20px)` }}><Words t={t} words={words} accent={false} /></div>
    </div>
  );
};

// K · Kicker — a 15 px letterspaced small-caps line in the accent (the beat's topic) fades in
// first; the headline slides up under it 6 frames later. 15 + 4 + 51 = 70 px tall, top 966 → 1036.
const Kicker: React.FC<DesignProps> = ({ t, words, p, fps, kicker }) => {
  const k = interpolate(p, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const h = spring({ frame: p - 6, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <div style={band(t, CAPTION.top - 18)}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.accent, marginBottom: 4, opacity: k, textShadow: shadowFor(t) }}>{kicker}</div>
      <div style={{ fontSize: 46, textShadow: shadowFor(t), opacity: h, transform: `translateY(${interpolate(h, [0, 1], [12, 0])}px)` }}><Words t={t} words={words} accent={false} /></div>
    </div>
  );
};

// S · Stacked accent — the setup words (40 px, weight 600) fade in; the payoff word (60 px,
// accent) POPS 6 frames later with an overshoot, scaling up from its own baseline so the line
// never jumps. The two share one baseline (alignItems: 'baseline').
const Stacked: React.FC<DesignProps> = ({ t, words, p, fps }) => {
  const last = words.length - 1;
  const lead = spring({ frame: p, fps, config: { damping: 18, stiffness: 120 } });
  const pop = spring({ frame: p - 6, fps, config: { damping: 8, stiffness: 150 } });
  return (
    <div style={band(t, CAPTION.top - 10, { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: '0.28em', textShadow: shadowFor(t) })}>
      {last > 0 && <span style={{ fontSize: 40, fontWeight: 600, opacity: 0.85 * lead, transform: `translateY(${interpolate(lead, [0, 1], [8, 0])}px)`, display: 'inline-block' }}>{words.slice(0, last).join(' ')}</span>}
      <span style={{ fontSize: 60, color: t.accent, display: 'inline-block', opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])})`, transformOrigin: 'center 80%', textShadow: t.dark ? `0 0 22px ${t.accent}99` : undefined }}>{words[last]}</span>
    </div>
  );
};

// W · Word by word — 52 px; each word springs up from 14 px below, 4 frames after the one before,
// so a four-word headline takes ~30 frames to settle. The pattern the old Caption used, slower.
const WordByWord: React.FC<DesignProps> = ({ t, words, p, fps }) => (
  <div style={band(t, CAPTION.top - 8, { textShadow: shadowFor(t) })}>
    <div style={{ fontSize: 52 }}>
      <Words t={t} words={words} style={(i) => {
        const s = spring({ frame: p - i * 4, fps, config: { damping: 14, stiffness: 150 } });
        return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [14, 0])}px)` };
      }} />
    </div>
  </div>
);

// B · Blur in — 56 px, weight 800: blurred (14 px), slightly large (1.06) and invisible, resolving
// to sharp over 14 frames. Once sharp, a soft accent glow stays (a plain sharp word after a blur
// read as flat). The blur is a `filter` on the wrapper, so the glow blurs and resolves with it.
const BlurIn: React.FC<DesignProps> = ({ t, words, p }) => {
  const k = interpolate(p, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  const blur = interpolate(k, [0, 1], [14, 0]);
  return (
    <div style={band(t, CAPTION.top - 8, { textShadow: glowFor(t, 0.9) })}>
      <div style={{ fontSize: 56, opacity: k, filter: `blur(${blur.toFixed(2)}px)`, transform: `scale(${interpolate(k, [0, 1], [1.06, 1])})`, transformOrigin: 'center center' }}><Words t={t} words={words} /></div>
    </div>
  );
};

// R · Ribbon — a solid accent bar (rounded, 60 px tall, 34 px side padding) behind the words in
// the theme's on-accent colour; the bar slides in from the left, the words follow 3 frames behind
// so they arrive on a surface that is already there. One colour: the accent IS the emphasis.
const Ribbon: React.FC<DesignProps> = ({ t, words, p, fps }) => {
  const bar = spring({ frame: p, fps, config: { damping: 16, stiffness: 120 } });
  const text = spring({ frame: p - 3, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <div style={band(t, CAPTION.top - 2, { fontWeight: 700 })}>
      <div style={{ height: 60, padding: '0 34px', borderRadius: 14, background: t.accent, display: 'flex', alignItems: 'center',
        opacity: bar, transform: `translateX(${interpolate(bar, [0, 1], [-90, 0])}px)`,
        boxShadow: t.dark ? `0 6px 24px rgba(0,0,0,.5), 0 0 24px ${t.accent}55` : '0 6px 20px rgba(0,0,0,.22)' }}>
        <div style={{ fontSize: 40, color: t.onAccent, opacity: text, transform: `translateX(${interpolate(text, [0, 1], [-40, 0])}px)` }}><Words t={t} words={words} accent={false} /></div>
      </div>
    </div>
  );
};

const RENDER: Record<LabelDesign, React.FC<DesignProps>> = { G: Glow, X: BigGlow, P: Plate, O: Outline, K: Kicker, S: Stacked, W: WordByWord, B: BlurIn, R: Ribbon };

/**
 * One frame's worth of one design: the theme's backdrop, the window with a still in it, and the
 * label animating from `at` (negative = already settled). `showTag` prints "G · Glow" bottom-right
 * so a viewer of the reel or the sheet knows which design they are looking at.
 */
export const LabelStudy: React.FC<{ design: LabelDesign; slug: Slug; still: string; head: string; at?: number; kicker?: string; showTag?: boolean }> =
  ({ design, slug, still, head, at = 6, kicker = 'Just ask', showTag = false }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const t = THEMES[slug];
  const Body = RENDER[design];
  const p = f - at;
  return (
    <AbsoluteFill>
      <Backdrop themes={[{ at: 0, slug }]} total={1} />
      <Window light={!t.dark}><Img src={staticFile(`stills/${still}.png`)} style={{ width: CLIP.w, height: CLIP.h }} /></Window>
      {p >= 0 && <Body t={t} words={head.split(' ')} p={p} fps={fps} kicker={kicker} />}
      {showTag && (
        <div style={{ position: 'absolute', right: 28, bottom: 14, fontFamily: 'system-ui', fontSize: 22, fontWeight: 600, color: t.dark ? '#fff' : t.fg, opacity: 0.65, letterSpacing: '0.02em' }}>
          {design} · {DESIGN_NAME[design]}
        </div>
      )}
    </AbsoluteFill>
  );
};

// The reel: every design for 2 s on the light still (Cotton Candy Sky, "Just ask.") then 2 s on
// the dark one (Devil's Garden, "Pick up on any device."), the label animating from frame 6 of
// each block. 9 × 120 = 1080 frames at 30 fps.
const BLOCK = 60;
export const REEL_FRAMES = DESIGNS.length * BLOCK * 2;
// WHY 'Any model' and not 'Just ask': the kicker sits ABOVE the headline "Just ask.", so repeating it read as a stutter on the sheet.
const LIGHT = { slug: 'cotton-candy-sky' as const, still: 'cotton', head: 'Just ask.', kicker: 'Any model' };
const DARK = { slug: 'devils-garden' as const, still: 'anydevice', head: 'Pick up on any device.', kicker: 'Any device' };
export const LabelReel: React.FC = () => (
  <AbsoluteFill>
    {DESIGNS.map((d, i) => (
      <React.Fragment key={d}>
        <Sequence from={i * BLOCK * 2} durationInFrames={BLOCK}><LabelStudy design={d} {...LIGHT} at={6} showTag /></Sequence>
        <Sequence from={i * BLOCK * 2 + BLOCK} durationInFrames={BLOCK}><LabelStudy design={d} {...DARK} at={6} showTag /></Sequence>
      </React.Fragment>
    ))}
  </AbsoluteFill>
);
