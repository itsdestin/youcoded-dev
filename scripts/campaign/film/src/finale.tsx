// The payoff: "you didn't write a single line." → "you coded all of it." → the words "you"
// and "coded" close together and become the logo, as the ground floods back to lavender on
// the music's hit. Then the lockup with the tagline, then the brand end card.
// WHY the morph: the name IS the punchline. Turning the sentence into the wordmark lets the
// viewer read "youcoded" as "you coded" without a single extra word on screen.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, clamp, DMSANS, EndCard, EXPO_OUT, Ground, Headline, IN_OUT, useB, Wordmark, words } from './brand';

export const Finale: React.FC<{
  l1: number; // "you didn't write a single line." starts (frame)
  l2: number; // "you coded all of it." starts
  hit: number; // the music's hit: logo arrives
  addr: number; // end card's address block arrives
  enter?: number; // frame the plum ground starts fading in (default l1 - 10)
}> = ({ l1, l2, hit, addr, enter }) => {
  const f = useCurrentFrame();
  const b = useB();
  const size = 6 * b;
  const darkIn = interpolate(f, [enter ?? l1 - 10, (enter ?? l1 - 10) + 10], [0, 1], clamp);
  // The flood back to lavender is quick (5 frames): it is the visual half of the music's hit.
  const darkOut = interpolate(f, [hit - 2, hit + 3], [0, 1], clamp);
  const dark = darkIn * (1 - darkOut);

  // Morph timing (frames before the hit).
  const collapseA = hit - 26;
  const collapseB = hit - 6;
  const col = interpolate(f, [collapseA, collapseB], [0, 1], { ...clamp, easing: IN_OUT });
  // WHY 3 frames with a touch of blur: two different typefaces cross-dissolving read as a
  // double image; a very short, softened swap hidden inside the flood reads as one shape settling.
  const swap = interpolate(f, [hit - 2, hit + 1], [0, 1], clamp);
  const swapBlur = Math.sin(Math.PI * swap) * 6;
  // Wordmark size 7b vs headline 5.5b: the merged words grow into the logo while they close up.
  const grow = 1 + (7 / 6 - 1) * col;
  // Line 2 sits where the end card's wordmark will be (H/2 − 1.3b; see EndCard maths).
  const y = -1.3 * b;

  const l2In = (i: number) => interpolate(f, [l2 + i * 3, l2 + i * 3 + 14], [0, 1], { ...clamp, easing: EXPO_OUT });
  const tail = 1 - col; // "all of it." leaves as the rest closes up
  const ink = C.textDark;
  // Ink of "coded" goes from light (on plum) to plum (on lavender) at the swap.
  const wordStyle = (p: number): React.CSSProperties => ({
    display: 'inline-block',
    opacity: p,
    transform: `translateY(${(1 - p) * size * 0.3}px)`,
    filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined,
  });

  return (
    <AbsoluteFill>
      <Ground dark={dark} />
      {/* Line 1 */}
      {f < l2 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: `translateY(${y}px)` }}>
            <Headline words={words("you didn't write a single line.")} start={l1} end={l2 - 12} size={size} dark />
          </div>
        </AbsoluteFill>
      )}
      {/* Line 2 → logo */}
      {f >= l2 && f < hit + 2 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - swap, filter: swapBlur ? `blur(${swapBlur}px)` : undefined }}>
          <div
            style={{
              transform: `translateY(${y}px) scale(${grow})`,
              fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1,
              color: ink, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline',
            }}
          >
            <span style={{ ...wordStyle(l2In(0)), color: C.purpleDark, marginRight: `${0.22 * (1 - col)}em` }}>you</span>
            <span style={wordStyle(l2In(1))}>coded</span>
            <span
              style={{
                display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap',
                maxWidth: `${5.2 * tail}em`, opacity: tail, filter: col > 0 ? `blur(${col * 10}px)` : undefined,
              }}
            >
              {['all', 'of', 'it.'].map((t, i) => (
                <span key={t} style={{ ...wordStyle(l2In(2 + i)), marginLeft: '0.22em' }}>{t}</span>
              ))}
            </span>
          </div>
        </AbsoluteFill>
      )}
      {/* Crossfade target: the real wordmark, alone, exactly where the end card keeps it. */}
      {f >= hit - 2 && f < hit + 2 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: swap, filter: swapBlur ? `blur(${swapBlur}px)` : undefined }}>
          <div style={{ transform: `translateY(${y}px)` }}>
            <Wordmark size={7 * b} />
          </div>
        </AbsoluteFill>
      )}
      {f >= hit + 2 && <EndCard start={hit + 2} addressAt={addr} markVisible />}
    </AbsoluteFill>
  );
};
