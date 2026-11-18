// Brand primitives for the "you coded that." campaign films.
// WHY one file: every value here comes from docs/brand/README.md (colours §5, type §6,
// layout §7, logo §3). Films and shorts import these instead of re-typing numbers, so a
// brand correction lands everywhere at once.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';

const outfit = loadOutfit('normal', { weights: ['400', '600'], subsets: ['latin'] });
const dmsans = loadDMSans('normal', { weights: ['500', '900'], subsets: ['latin'] });
export const OUTFIT = outfit.fontFamily;
export const DMSANS = dmsans.fontFamily;

export const C = {
  lavender: '#F7F0FB',
  lilac: '#EFE3F6',
  plum: '#21152C',
  plumBlack: '#140B1E',
  textDark: '#F3EAF9',
  secondary: '#43354E',
  secondaryDark: '#B3A8BC',
  tagline: '#8A7B96',
  purple: '#9750AA',
  purpleDark: '#C387D3',
  gradA: '#9D5BD0',
  gradB: '#D25AA0',
};

export const FPS = 30;
export const BEAT = 15; // 120 BPM at 30 fps
export const BAR = 60;
export const s = (sec: number) => Math.round(sec * FPS);

// Easings. EXPO_OUT for things arriving (type, windows); IN_OUT for camera moves.
export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const SOFT = Easing.bezier(0.33, 0, 0.2, 1);

/** Base unit b = short side ÷ 60 (brand §7). */
export const useB = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 60;
};

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Plain brand ground. A barely-there vertical falloff keeps big flat fields from banding
 * on TV encoders without reading as a gradient (brand forbids decorative gradients). */
export const Ground: React.FC<{ dark?: number }> = ({ dark = 0 }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.lavender} 0%, #F4ECF9 100%)` }} />
    {dark > 0 && (
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.plumBlack} 0%, #180E23 100%)`, opacity: dark }} />
    )}
  </AbsoluteFill>
);

/**
 * A headline whose words rise into place one after another.
 * WHY word-by-word with blur: it reads as calm and deliberate (Apple-style supers) rather
 * than the typewriter or bounce effects the brief rules out.
 */
export const Headline: React.FC<{
  words: { t: string; purple?: boolean }[];
  start: number; // frame the first word starts
  end?: number; // frame the line starts leaving
  size: number;
  dark?: boolean;
  stagger?: number;
  align?: 'center' | 'left';
  maxWidth?: number;
  lineHeight?: number;
}> = ({ words, start, end, size, dark, stagger = 3, align = 'center', maxWidth, lineHeight = 1.0 }) => {
  const f = useCurrentFrame();
  const out = end == null ? 0 : interpolate(f, [end, end + 10], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const ink = dark ? C.textDark : C.plum;
  return (
    <div
      style={{
        fontFamily: DMSANS,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '-0.05em',
        lineHeight,
        color: ink,
        textAlign: align,
        maxWidth,
        opacity: 1 - out,
        transform: `translateY(${-out * size * 0.15}px)`,
        filter: out > 0 ? `blur(${out * 8}px)` : undefined,
      }}
    >
      {words.map((w, i) => {
        const p = interpolate(f, [start + i * stagger, start + i * stagger + 14], [0, 1], { ...clamp, easing: EXPO_OUT });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.3}px)`,
              filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined,
              color: w.purple ? (dark ? C.purpleDark : C.purple) : ink,
              marginRight: i < words.length - 1 ? '0.22em' : 0,
            }}
          >
            {w.t}
          </span>
        );
      })}
    </div>
  );
};

export const words = (line: string, purple: string[] = []) =>
  line.split(' ').map((t) => ({ t, purple: purple.includes(t) }));

/** The wordmark, by the site's recipe: Outfit 600, −3.5%, gradient "you", ink "coded". */
export const Wordmark: React.FC<{ size: number; dark?: boolean; style?: React.CSSProperties }> = ({ size, dark, style }) => (
  <div
    style={{
      fontFamily: OUTFIT,
      fontWeight: 600,
      fontSize: size,
      letterSpacing: '-0.035em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      color: dark ? C.textDark : C.plum,
      ...style,
    }}
  >
    <span
      style={{
        paddingRight: '0.02em',
        background: `linear-gradient(100deg, ${C.gradA}, ${C.gradB})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      you
    </span>
    coded
  </div>
);

export const Icon: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img
    src={staticFile('icon.png')}
    style={{
      width: size,
      height: size,
      filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.08}px rgba(60,20,100,.22))`,
      ...style,
    }}
  />
);

/**
 * End card, to the brand's measurements (§7): icon 14b · 2b · logo 7b · 6b · youcoded.ai 3b ·
 * 1b · platforms 2b. Centred, on lavender, slightly above the middle.
 * `start` = frame it begins assembling. `tagline` swaps the address block for the tagline
 * (used for the lockup moment just before the end card proper).
 */
export const EndCard: React.FC<{ start: number; addressAt?: number; withTagline?: boolean; scale?: number; markVisible?: boolean }> = ({
  start,
  addressAt,
  withTagline = true,
  scale = 1,
  markVisible = false,
}) => {
  const f = useCurrentFrame();
  const b = useB() * scale;
  const ap = (at: number, dur = 16) => interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: EXPO_OUT });
  const icon = ap(start, 22);
  // markVisible: the wordmark is already on screen (the hero's morph hands it over in place).
  const mark = markVisible ? 1 : ap(start + 4, 22);
  const tagIn = withTagline ? ap(start + 30) : 0;
  const addr = addressAt == null ? 0 : ap(addressAt);
  const plat = addressAt == null ? 0 : ap(addressAt + 6);
  const tagOut = addressAt == null ? 0 : interpolate(f, [addressAt - 8, addressAt + 2], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${-3 * b}px)` }}>
        <Icon size={14 * b} style={{ opacity: icon, transform: `translateY(${(1 - icon) * 2 * b}px) scale(${0.94 + 0.06 * icon})` }} />
        <div style={{ height: 2 * b }} />
        <Wordmark size={7 * b} style={{ opacity: mark, transform: `translateY(${(1 - mark) * 1.5 * b}px)` }} />
        <div style={{ position: 'relative', height: 6 * b + 3 * b + 1 * b + 2 * b * 1.3, width: 60 * b }}>
          {withTagline && (
            <div
              style={{
                position: 'absolute', top: 2 * b, width: '100%', textAlign: 'center',
                fontFamily: OUTFIT, fontWeight: 400, fontSize: 3 * b, letterSpacing: '-0.005em', color: C.tagline,
                opacity: tagIn * (1 - tagOut), transform: `translateY(${(1 - tagIn) * b}px)`,
              }}
            >
              open source everything
            </div>
          )}
          <div
            style={{
              position: 'absolute', top: 6 * b, width: '100%', textAlign: 'center',
              fontFamily: OUTFIT, fontWeight: 600, fontSize: 3 * b, lineHeight: 1, color: C.plum,
              opacity: addr, transform: `translateY(${(1 - addr) * b}px)`,
            }}
          >
            youcoded.ai
          </div>
          <div
            style={{
              position: 'absolute', top: 6 * b + 3 * b + 1 * b, width: '100%', textAlign: 'center',
              fontFamily: DMSANS, fontWeight: 500, fontSize: 2 * b, lineHeight: 1.3, color: C.secondary,
              opacity: plat, transform: `translateY(${(1 - plat) * b}px)`,
            }}
          >
            Free · Windows · Mac · Linux · Android
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
