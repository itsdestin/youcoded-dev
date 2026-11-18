// Real app footage, presented as a floating window with an eased "camera".
// WHY a camera in the edit rather than in the recording: the recorder films the app still
// and sharp at 2x; every push-in and glide is added here, so moves are perfectly smooth and
// land on the music's beat grid. Nothing inside the window is drawn — brand §8.
import React from 'react';
import { AbsoluteFill, Freeze, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp, IN_OUT } from './brand';

export type Key = { f: number; scale: number; x: number; y: number };

/** Interpolate camera keyframes (frames are local to the shot). */
const cam = (keys: Key[], f: number) => {
  if (keys.length === 1) return keys[0];
  const fs = keys.map((k) => k.f);
  const pick = (p: keyof Key) => interpolate(f, fs, keys.map((k) => k[p] as number), { ...clamp, easing: IN_OUT });
  return { f, scale: pick('scale'), x: pick('x'), y: pick('y') };
};

export const Window: React.FC<{
  src: string; // file under public/footage
  from: number; // seconds into the clip to start at
  aspect: number; // clip width / height
  fit?: number; // window width as a share of frame width (or height for tall clips) at scale 1
  keys?: Key[];
  radius?: number; // as a share of window width
  rate?: number;
  muted?: boolean;
  hold?: number; // frames to hold the clip's first frame before it plays (re-times a take to the music)
  lift?: number; // 0..1 shadow strength
}> = ({ src, from, aspect, fit = 0.78, keys = [{ f: 0, scale: 1, x: 0.5, y: 0.5 }], radius = 0.012, rate = 1, hold = 0 }) => {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tall = aspect < 1;
  // Fit by width for desktop clips, by height for phone clips.
  const Wb = tall ? height * fit * aspect : width * fit;
  const Hb = Wb / aspect;
  const c = cam(keys, f);
  const tx = -(c.x - 0.5) * Wb * c.scale;
  const ty = -(c.y - 0.5) * Hb * c.scale;
  const r = Wb * (tall ? 0.06 : radius);
  const zs = Math.max(1, c.scale);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: Wb,
          height: Hb,
          transform: `translate(${tx}px, ${ty}px) scale(${c.scale})`,
          borderRadius: r,
          overflow: 'hidden',
          // A layered, plum-tinted shadow: soft lift without a hard grey edge (never pure black/grey).
          // WHY divide by scale: the shadow lives inside the zoomed box, so a 2.5x close-up
          // would otherwise grow a muddy grey band under the window.
          boxShadow: [
            `0 ${(Wb * 0.004) / zs}px ${(Wb * 0.01) / zs}px rgba(33,21,44,.10)`,
            `0 ${(Wb * 0.02) / zs}px ${(Wb * 0.05) / zs}px rgba(33,21,44,.14)`,
            `0 ${(Wb * 0.06) / zs}px ${(Wb * 0.14) / zs}px rgba(60,20,100,${0.16 / zs})`,
          ].join(', '),
          outline: '1px solid rgba(33,21,44,.08)',
        }}
      >
        {hold > 0 && f < hold && (
          <Freeze frame={0}>
            <OffthreadVideo src={staticFile(`footage/${src}`)} startFrom={Math.round(from * fps)} muted style={{ width: '100%', height: '100%', display: 'block' }} />
          </Freeze>
        )}
        <Sequence from={hold} layout="none">
          <OffthreadVideo
            src={staticFile(`footage/${src}`)}
            startFrom={Math.round(from * fps)}
            playbackRate={rate}
            muted
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

/** A shot = a Window placed on the timeline. */
export const Shot: React.FC<React.ComponentProps<typeof Window> & { at: number; dur: number; children?: React.ReactNode }> = ({
  at,
  dur,
  children,
  ...w
}) => (
  <Sequence from={at} durationInFrames={dur} layout="none">
    <Window {...w} />
    {children}
  </Sequence>
);
