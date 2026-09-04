import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { POSES, PIVOT, type Face } from './poses';
import { MASCOT } from './layout';
import { THEMES, rigFor, companionsFor, type Slug } from './themes';
import type { Cue } from './tracks';

type Resolved = Required<Omit<Cue, 'hop' | 'burst'>> & { hop: boolean; burst: boolean };
// The app's own limb-spring constants (mascot-poses.ts stepSpring defaults):
// underdamped on purpose, so an arm thrown up overshoots and settles.
const SPRING = { damping: 16, stiffness: 170, mass: 1 };
const FACES: Face[] = ['idle', 'welcome', 'curious', 'shocked', 'dizzy'];
export const HOP = 14;          // frames a hop is in the air
const HOP_HEIGHT = 150;         // px above the straight line between take-off and landing

/** Fill every cue's gaps from the cue before it, so a cue can say only what changes. */
function resolve(cues: Cue[]): Resolved[] {
  const out: Resolved[] = [];
  let prev: Resolved = { at: 0, x: 0, y: 0, pose: 'idle', size: MASCOT.size, costume: 'midnight', hidden: false, hop: false, burst: false };
  for (const c of [...cues].sort((a, b) => a.at - b.at)) {
    prev = { at: c.at, x: c.x ?? prev.x, y: c.y ?? prev.y, pose: c.pose ?? prev.pose, size: c.size ?? prev.size,
      costume: c.costume ?? prev.costume, hidden: c.hidden ?? prev.hidden, hop: !!c.hop, burst: !!c.burst };
    out.push(prev);
  }
  return out;
}

/** The host's state on frame f: position, limbs, costume — one continuous track for the whole film. */
export function hostAt(cues: Cue[], f: number, fps: number) {
  const r = resolve(cues);
  let i = 0;
  for (let k = 0; k < r.length; k++) if (f >= r[k].at) i = k;
  const cur = r[i];
  const prev = r[i - 1] ?? cur;
  const dt = f - cur.at;
  // A hop is ballistic (a parabola over HOP frames); everything else springs.
  const hopP = cur.hop ? Math.min(1, Math.max(0, dt / HOP)) : 1;
  const t = cur.hop ? hopP : spring({ frame: dt, fps, config: SPRING });
  const x = interpolate(t, [0, 1], [prev.x, cur.x]);
  // The arc is capped so a hop from the title bar (y ≈ 10) does not leave the
  // top of the frame — the first draft's host vanished for four frames on every
  // cut. A hop that starts or ends low (the dive into the window, the pop back
  // out) keeps the full height.
  const height = Math.min(HOP_HEIGHT, Math.max(24, Math.min(prev.y, cur.y) + 14));
  const arc = cur.hop ? -4 * height * hopP * (1 - hopP) : 0;
  const y = interpolate(t, [0, 1], [prev.y, cur.y]) + arc;
  // A hop that shrinks (the dive into the window) keeps its size until the
  // last third, or the host fades to nothing before it reaches the window.
  const sizeT = cur.hop && cur.size < prev.size ? Math.pow(t, 3) : t;
  const size = interpolate(sizeT, [0, 1], [prev.size, cur.size]);
  // Landing: a squash that springs back (scaleY dips, scaleX widens).
  const land = cur.hop ? spring({ frame: dt - HOP, fps, config: { damping: 9, stiffness: 220 } }) : 1;
  const squash = cur.hop && dt >= HOP ? interpolate(land, [0, 1], [0.78, 1]) : 1;
  // In the air the limbs tuck; the costume switches at the apex, under the burst.
  const pose = cur.hop && hopP < 1 ? 'tuck' : cur.pose;
  // Emerging from nothing (the pop back out of the window) wears the new costume from the first frame.
  const costume = cur.hop && hopP < 0.5 && prev.size > 0 ? prev.costume : cur.costume;
  // The burst: on an explicit cue, at the apex of a costume-changing hop, or where a dive lands.
  const burstAt = cur.burst ? cur.at : cur.hop && cur.size === 0 ? cur.at + HOP : cur.hop && prev.costume !== cur.costume ? cur.at + HOP / 2 : null;
  const def = POSES[pose];
  const prevDef = POSES[cur.hop ? cur.pose : prev.pose];
  const lt = cur.hop ? 1 : t;
  const limb = (a: number, b: number) => interpolate(lt, [0, 1], [a, b]);
  let armR = limb(prevDef.arms[1], def.arms[1]);
  if (def.wave) armR += Math.sin((dt / fps) * Math.PI * 2 * 2.2) * 14;   // the raised arm waves
  return { x, y, size, squash, costume, hidden: cur.hidden && (!cur.hop || hopP >= 1), pose, burstAt,
    arms: [limb(prevDef.arms[0], def.arms[0]), armR] as const, legs: [limb(prevDef.legs[0], def.legs[0]), limb(prevDef.legs[1], def.legs[1])] as const, face: def.face };
}

/** One rig, posed. `scope` keeps its style rules from leaking into another rig on screen. */
const Rig: React.FC<{ costume: Slug; arms: readonly [number, number]; legs: readonly [number, number]; face: Face; blink: boolean; scope: string }> =
  ({ costume, arms, legs, face, blink, scope }) => {
  const t = THEMES[costume];
  return (
    <div className={scope} style={{ width: '100%', height: '100%',
      // --rig-* are what the DEFAULT rig paints itself with (app convention: Icons.tsx maps them to the theme accent);
      // the theme rigs carry their own colours and ignore these.
      ['--rig-accent' as string]: t.accent, ['--rig-on-accent' as string]: t.onAccent, ['--rig-line' as string]: t.fg }}>
      <style>{`
.${scope} svg { width: 100%; height: 100%; display: block; overflow: visible; }
.${scope} #rig-arm-left { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-left']}; transform: rotate(${arms[0].toFixed(2)}deg); }
.${scope} #rig-arm-right { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-right']}; transform: rotate(${arms[1].toFixed(2)}deg); }
.${scope} #rig-leg-left { transform-box: view-box; transform-origin: ${PIVOT['rig-leg-left']}; transform: rotate(${legs[0].toFixed(2)}deg); }
.${scope} #rig-leg-right { transform-box: view-box; transform-origin: ${PIVOT['rig-leg-right']}; transform: rotate(${legs[1].toFixed(2)}deg); }
.${scope} #rig-hand-peek-left, .${scope} #rig-hand-peek-right { display: none !important; }
.${scope} #rig-face-blink { display: ${blink ? 'inline' : 'none'} !important; }
${FACES.map((n) => `.${scope} #rig-face-${n} { display: ${n === face && !blink ? 'inline' : 'none'} !important; }`).join('\n')}
`}</style>
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: rigFor(costume) }} />
    </div>
  );
};

/**
 * The host. `cues` are ABSOLUTE frames (Promo.tsx shifts each beat's local
 * cues by its start). Draws the rig for the current costume, its companions
 * (the sun, motes, sparks the theme floats around its mascot in the app) on a
 * lazier clock so they trail the hop, and a burst ring on costume changes.
 */
export const Mascot: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = hostAt(cues, f, fps);
  if (h.hidden) return null;
  // A 2 % vertical bob is always on — a perfectly still mascot reads as a pasted-on PNG next to live footage.
  const bob = Math.sin((f / fps) * Math.PI * 2 * 0.55) * h.size * 0.02;
  // Blink for 3 frames roughly every 3.2 s (the app's chill blink cadence), never mid-hop.
  const blink = f % 97 < 3 && h.pose !== 'tuck';
  const t = THEMES[h.costume];
  // Halftone's 'ghost' (a chromatic after-image of the body) read as a SECOND mascot
  // tumbling behind the host — companions that are silhouettes are not drawn.
  const comps = companionsFor(h.costume).filter((c) => !c.ghost);
  const lag = hostAt(cues, f - 4, fps);      // companions follow four frames behind
  const compIn = spring({ frame: f - (h.burstAt ?? -100), fps, config: { damping: 12, stiffness: 120 } });
  const burst = h.burstAt != null ? interpolate(f - h.burstAt, [0, 12], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }) : 1;
  const cx = h.x + h.size / 2, cy = h.y + bob + h.size / 2;
  return (
    <>
      {comps.map((c, i) => {
        const w = c.size * h.size, hh = w / c.aspect;
        const period = (c.floatMs / 1000) * fps;
        const fl = Math.sin(((f + i * 17) / period) * Math.PI * 2) * c.float * h.size;
        const lx = lag.x + lag.size / 2 + c.dx * lag.size - w / 2;
        const ly = lag.y + bob + lag.size / 2 + c.dy * lag.size - hh / 2 + fl;
        let s = h.burstAt != null && f >= h.burstAt ? compIn : 1;
        // a ghost shows only while the host is moving (speed in px/frame → 0..1)
        if (c.ghost) s *= Math.min(1, Math.hypot(h.x - lag.x, h.y - lag.y) / 40);
        return <div key={i} style={{ position: 'absolute', left: lx, top: ly, width: w, height: hh, transform: `scale(${s})`, opacity: s }}
          dangerouslySetInnerHTML={{ __html: c.svg.replace('<svg', '<svg style="width:100%;height:100%;display:block;overflow:visible"') }} />;
      })}
      {burst < 1 && (
        <div style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', left: -150 * burst, top: -150 * burst, width: 300 * burst, height: 300 * burst, borderRadius: '50%',
            border: `${4 * (1 - burst) + 1.5}px solid ${t.accent}`, opacity: (1 - burst) * 0.9 }} />
        </div>
      )}
      <div style={{ position: 'absolute', left: h.x, top: h.y + bob, width: h.size, height: h.size,
        transform: `scaleY(${h.squash}) scaleX(${1 + (1 - h.squash) * 0.6})`, transformOrigin: 'center bottom',
        // On a dark theme the host also gets a faint accent glow: Halftone's rig is a
        // near-black body with neon edges and vanished into its own backdrop.
        filter: t.dark ? `drop-shadow(0 6px 14px rgba(0,0,0,.5)) drop-shadow(0 0 22px ${t.accent}66)` : 'drop-shadow(0 6px 14px rgba(40,10,40,.35))' }}>
        <Rig costume={h.costume} arms={h.arms} legs={h.legs} face={h.face} blink={blink} scope={`host-${h.costume}`} />
      </div>
    </>
  );
};
