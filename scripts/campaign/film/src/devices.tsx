// Real app footage shown on device shapes (a laptop and an Android phone) floating in space.
// WHY devices instead of flat windows: round 1 was a flat window on a pale field for a full
// minute and read as a screen recording. A device with depth, light and a shadow gives the
// picture a world. The screen itself is untouched footage (brand §8: never draw the interface).
import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp, IN_OUT } from './brand';
import { aspectOf } from './cuts';

export type ScreenKey = [t: number, scale: number, x: number, y: number]; // seconds local to the shot

const camAt = (keys: ScreenKey[], sec: number) => {
  if (keys.length === 1) return keys[0];
  const ts = keys.map((k) => k[0]);
  const pick = (i: 1 | 2 | 3) => interpolate(sec, ts, keys.map((k) => k[i]), { ...clamp, easing: IN_OUT });
  return [sec, pick(1), pick(2), pick(3)] as ScreenKey;
};

/** A clip filling a box, with an optional push-in toward a focus point (never below scale 1, so no edges show). */
export const Screen: React.FC<{ clip: string; from: number; rate?: number; w: number; h: number; cam?: ScreenKey[] }> = ({
  clip, from, rate = 1, w, h, cam = [[0, 1, 0.5, 0.5]],
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [, sc, x, y] = camAt(cam, f / fps);
  const s = Math.max(1, sc);
  // Keep the focus point in view without exposing an edge of the footage.
  const tx = Math.max(-(s - 1) / 2, Math.min((s - 1) / 2, -(x - 0.5) * s)) * w;
  const ty = Math.max(-(s - 1) / 2, Math.min((s - 1) / 2, -(y - 0.5) * s)) * h;
  return (
    <div style={{ width: w, height: h, overflow: 'hidden', position: 'relative', background: '#140B1E' }}>
      <div style={{ width: w, height: h, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
        <OffthreadVideo
          src={staticFile(`footage/${clip}.webm`)}
          startFrom={Math.round(from * fps)}
          playbackRate={rate}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    </div>
  );
};

type Pose = { x: number; y: number; scale: number; ry: number; rx: number };
export type PoseKey = [t: number, x: number, y: number, scale: number, ry: number, rx: number];

const poseAt = (keys: PoseKey[], sec: number): Pose => {
  if (keys.length === 1) {
    const [, x, y, scale, ry, rx] = keys[0];
    return { x, y, scale, ry, rx };
  }
  const ts = keys.map((k) => k[0]);
  const p = (i: number) => interpolate(sec, ts, keys.map((k) => k[i] as number), { ...clamp, easing: IN_OUT });
  return { x: p(1), y: p(2), scale: p(3), ry: p(4), rx: p(5) };
};

/** Places a device in the frame: x/y are the device centre as fractions of the frame; ry/rx tilt it in 3D. */
const Stage: React.FC<{ pose: PoseKey[]; children: React.ReactNode; shadowW: number; shadowY: number; opacity?: number }> = ({
  pose, children, shadowW, shadowY, opacity = 1,
}) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = poseAt(pose, f / fps);
  return (
    <AbsoluteFill style={{ perspective: width * 1.6, opacity }}>
      <div
        style={{
          position: 'absolute', left: p.x * width, top: p.y * height,
          transform: `translate(-50%, -50%) scale(${p.scale})`,
        }}
      >
        {/* Contact shadow: a soft plum ellipse on the "floor", never grey (brand §5). */}
        <div
          style={{
            position: 'absolute', left: '50%', top: shadowY, width: shadowW, height: shadowW * 0.09,
            transform: 'translate(-50%, 0)', borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(60,20,100,.30), rgba(60,20,100,0))',
            filter: `blur(${shadowW * 0.02}px)`,
          }}
        />
        <div style={{ transform: `rotateY(${p.ry}deg) rotateX(${p.rx}deg)`, transformStyle: 'preserve-3d' }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};

/** A laptop: plum-black bezel around the screen, a thin lit edge, and a shallow base. `sw` = screen width in px. */
export const Laptop: React.FC<{ sw: number; pose: PoseKey[]; clip: string; from: number; rate?: number; cam?: ScreenKey[]; opacity?: number }> = ({
  sw, pose, clip, from, rate, cam, opacity,
}) => {
  const sh = sw / aspectOf(clip);
  const bez = sw * 0.022;
  const lidW = sw + bez * 2;
  const lidH = sh + bez * 2.6;
  const baseW = lidW * 1.16;
  return (
    <Stage pose={pose} shadowW={baseW * 1.05} shadowY={lidH / 2 + sw * 0.02} opacity={opacity}>
      <div style={{ position: 'relative', width: lidW, height: lidH + sw * 0.03 }}>
        <div
          style={{
            width: lidW, height: lidH, borderRadius: sw * 0.026, background: '#140B1E',
            padding: `${bez}px ${bez}px ${bez * 1.6}px`, boxSizing: 'border-box',
            boxShadow: `inset 0 0 0 ${sw * 0.0016}px rgba(243,234,249,.16), 0 ${sw * 0.03}px ${sw * 0.06}px rgba(60,20,100,.18)`,
          }}
        >
          <div style={{ borderRadius: sw * 0.006, overflow: 'hidden' }}>
            <Screen clip={clip} from={from} rate={rate} w={sw} h={sh} cam={cam} />
          </div>
        </div>
        {/* Base: a slim slab wider than the lid, lit from above. */}
        <div
          style={{
            position: 'absolute', left: (lidW - baseW) / 2, top: lidH - sw * 0.004, width: baseW, height: sw * 0.026,
            borderRadius: `${sw * 0.004}px ${sw * 0.004}px ${sw * 0.03}px ${sw * 0.03}px`,
            background: 'linear-gradient(180deg, #EDE2F4 0%, #D9C8E5 55%, #BBA6CB 100%)',
            boxShadow: `0 ${sw * 0.01}px ${sw * 0.03}px rgba(60,20,100,.16)`,
          }}
        >
          <div style={{ position: 'absolute', left: '50%', top: 0, width: baseW * 0.14, height: sw * 0.008, transform: 'translateX(-50%)', borderRadius: `0 0 ${sw * 0.01}px ${sw * 0.01}px`, background: 'rgba(60,20,100,.14)' }} />
        </div>
      </div>
    </Stage>
  );
};

/** An Android phone: rounded plum-black body, thin bezel, a punch-hole camera. `sh` = screen height in px. */
export const Phone: React.FC<{ sh: number; pose: PoseKey[]; clip: string; from: number; rate?: number; cam?: ScreenKey[]; opacity?: number }> = ({
  sh, pose, clip, from, rate, cam, opacity,
}) => {
  const sw = sh * aspectOf(clip);
  const bez = sw * 0.035;
  const W = sw + bez * 2;
  const H = sh + bez * 2;
  return (
    <Stage pose={pose} shadowW={W * 1.3} shadowY={H / 2 + sw * 0.04} opacity={opacity}>
      <div
        style={{
          position: 'relative', width: W, height: H, borderRadius: sw * 0.13, background: '#140B1E', padding: bez, boxSizing: 'border-box',
          boxShadow: `inset 0 0 0 ${sw * 0.006}px rgba(243,234,249,.18), 0 ${sw * 0.06}px ${sw * 0.12}px rgba(60,20,100,.22)`,
        }}
      >
        <div style={{ borderRadius: sw * 0.1, overflow: 'hidden' }}>
          <Screen clip={clip} from={from} rate={rate} w={sw} h={sh} cam={cam} />
        </div>
        <div style={{ position: 'absolute', left: '50%', top: bez + sw * 0.03, width: sw * 0.03, height: sw * 0.03, transform: 'translateX(-50%)', borderRadius: '50%', background: '#0B0612', boxShadow: '0 0 0 2px rgba(255,255,255,.05)' }} />
      </div>
    </Stage>
  );
};
