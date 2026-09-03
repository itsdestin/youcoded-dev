import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { DEFAULT_BUDDY_RIG } from './rig';
import { GOLDEN_SHOCKED, GOLDEN_WELCOME } from './golden';
import { POSES, PIVOT, type Pose, type Face } from './poses';
import { MASCOT } from './layout';

/** One waypoint for the host: where it is, what pose it holds, from `at` onward. */
export type Cue = { at: number; x?: number; y?: number; pose?: Pose; size?: number; costume?: 'rig' | 'golden' };
type Resolved = Required<Cue>;

// The app's own limb-spring constants (mascot-poses.ts stepSpring defaults):
// underdamped on purpose, so an arm thrown up overshoots and settles. Reusing
// them is what makes the host in the video move like the host in the app.
const SPRING = { damping: 16, stiffness: 170, mass: 1 };
const FACES: Face[] = ['idle', 'welcome', 'curious', 'shocked', 'dizzy'];

/** Fill every cue's gaps from the cue before it, so a cue can say only what changes. */
function resolve(cues: Cue[]): Resolved[] {
  const out: Resolved[] = [];
  let prev: Resolved = { at: 0, x: 0, y: 0, pose: 'idle', size: MASCOT.size, costume: 'rig' };
  for (const c of cues) {
    prev = { at: c.at, x: c.x ?? prev.x, y: c.y ?? prev.y, pose: c.pose ?? prev.pose, size: c.size ?? prev.size, costume: c.costume ?? prev.costume };
    out.push(prev);
  }
  return out;
}

export const Mascot: React.FC<{ cues: Cue[]; hidden?: boolean }> = ({ cues, hidden }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = resolve(cues);
  // Index of the cue in force. Before the first cue the host holds cue 0's
  // state, so the beat can spawn it already in place.
  let i = 0;
  for (let k = 0; k < r.length; k++) if (f >= r[k].at) i = k;
  const cur = r[i];
  const prev = r[i - 1] ?? cur;
  // Everything that moves springs from the previous cue to this one on the same
  // clock, so position and limbs arrive together rather than in two waves.
  const t = spring({ frame: f - cur.at, fps, config: SPRING });
  const x = interpolate(t, [0, 1], [prev.x, cur.x]);
  const y = interpolate(t, [0, 1], [prev.y, cur.y]);
  const size = interpolate(t, [0, 1], [prev.size, cur.size]);
  const def = POSES[cur.pose];
  const prevDef = POSES[prev.pose];
  let armL = interpolate(t, [0, 1], [prevDef.arms[0], def.arms[0]]);
  let armR = interpolate(t, [0, 1], [prevDef.arms[1], def.arms[1]]);
  // The raised arm waves at ~3 Hz while the welcome pose holds.
  if (def.wave) armR += Math.sin(((f - cur.at) / fps) * Math.PI * 2 * 3) * 16;
  // A 2 % vertical bob is always on — a perfectly still mascot reads as a
  // pasted-on PNG next to live footage.
  const bob = Math.sin((f / fps) * Math.PI * 2 * 0.55) * size * 0.02;

  if (hidden) return null;
  const scope = 'host-rig';
  const golden = cur.costume === 'golden';
  return (
    <div style={{ position: 'absolute', left: x, top: y + bob, width: size, height: size,
      // --rig-* are what the rig paints itself with (app convention); golden
      // stills use currentColor instead.
      ['--rig-accent' as string]: golden ? '#ffc030' : '#B1BAC4',
      ['--rig-on-accent' as string]: golden ? '#2a1004' : '#0D1117',
      color: '#ffc030',
      filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.5))' }}>
      {golden ? (
        <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: def.face === 'shocked' ? GOLDEN_SHOCKED : GOLDEN_WELCOME }} />
      ) : (
        <div className={scope} style={{ width: '100%', height: '100%' }}>
          {/* The rig hides its faces with INLINE style="display:none", so these
              rules need !important to win. Limb pivots come from the rig's own
              data-pivot attributes via poses.ts. */}
          <style>{`
.${scope} svg { width: 100%; height: 100%; display: block; overflow: visible; }
.${scope} #rig-arm-left { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-left']}; transform: rotate(${armL.toFixed(2)}deg); }
.${scope} #rig-arm-right { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-right']}; transform: rotate(${armR.toFixed(2)}deg); }
.${scope} #rig-hand-peek-left, .${scope} #rig-hand-peek-right, .${scope} #rig-face-blink { display: none !important; }
${FACES.map((n) => `.${scope} #rig-face-${n} { display: ${n === def.face ? 'inline' : 'none'} !important; }`).join('\n')}
`}</style>
          <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: DEFAULT_BUDDY_RIG }} />
        </div>
      )}
    </div>
  );
};
