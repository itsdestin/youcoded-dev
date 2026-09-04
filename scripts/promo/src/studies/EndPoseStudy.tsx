import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Beat10, Y_SPOT } from '../beats/Beat10';
import { LEN } from '../beats/beat';
import { Backdrop } from '../Backdrop';
import { Host } from '../host/Host';
import { A, REST, type Action } from '../host/engine';

// End-pose candidates for the close (Destin, 2026-09-04: "we need to work on the final
// idle/ending pose"). Each is a still of the film's last second — the grown window, the
// modal, the wordmark — with the host beside the Y in one candidate pose, settled.
export type EndPose = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6';
export const END_POSES: Record<EndPose, { name: string; blurb: string; actions: Action[] }> = {
  A: { name: 'Powered down', blurb: 'Today: eyes closed, limbs tucked under.', actions: [A.shutdown(0)] },
  B: { name: 'At ease', blurb: 'Standing, arms down, looking at you with the warm face.', actions: [A.face(0, 'welcome'), A.look(0, 4, 0, 0.05)] },
  C: { name: 'Wave held', blurb: 'Right arm up in a wave, the happy face.', actions: [A.face(0, 'happy'), A.pose(0, 8, { armR: -150, armL: 0, rot: -3 })] },
  D: { name: 'Leaning on the Y', blurb: 'Leans into the wordmark, one arm up against the Y, smug.', actions: [A.face(0, 'smug'), A.pose(0, 8, { armR: -100, armL: 8, rot: 9 }), A.look(0, 4, 0.3, 0)] },
  E: { name: 'Ta-da', blurb: 'Both arms wide, presenting the wordmark, happy.', actions: [A.face(0, 'happy'), A.pose(0, 8, { armL: 115, armR: -115, rot: 4 })] },
  F: { name: 'Sitting', blurb: 'Sat down on the baseline, legs out in front, at ease.', actions: [A.face(0, 'welcome'), A.pose(0, 8, { legL: -80, legR: 80, armL: 20, armR: -20 }), A.set(0, { sy: 0.96, sx: 1.03 }), A.look(0, 4, 0, 0.1)] },
  // ---- the POWERED-DOWN alternatives (Destin, 2026-09-04: "i still want to wind down to something like A as
  // the video ends/dims, but … the current one looks odd"). Each is what he settles into from E as the picture dims.
  P1: { name: 'Today', blurb: 'Flat-line eyes, arms and legs tucked under.', actions: [A.shutdown(0)] },
  P2: { name: 'Asleep standing', blurb: 'Eyes closed in soft arcs, a small smile, arms hanging, sunk a touch.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { armL: 6, armR: -6, rot: 0 }), A.set(0, { sy: 0.95, sx: 1.04 })] },
  P3: { name: 'Nodding off', blurb: 'Tipped over sideways, eyes closed, arms loose, one leg cocked.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { rot: 13, armL: 12, armR: 4, legR: -10 })] },
  P4: { name: 'Curled up', blurb: 'Squashed into a ball, arms hugging in, legs tucked, eyes closed.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { armL: 62, armR: -62, legL: 90, legR: -90 }), A.set(0, { sy: 0.86, sx: 1.12 })] },
  P5: { name: 'Sat down asleep', blurb: 'Sitting on the baseline, legs out, arms in its lap, eyes closed.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { legL: -85, legR: 85, armL: 40, armR: -40, rot: 3 }), A.set(0, { sy: 0.95, sx: 1.03 })] },
  // Destin, 2026-09-04: "some between p1/p5 ish. he should crouch/sit into his legs, then tuck his arms in under
  // the left/right corners of his body" — four takes on that: the body squats down onto legs folded out in front,
  // and the arms swing inward and down so the hands sit under the body's lower corners (arms are painted BEHIND
  // the body, so only what pokes past its edge shows).
  Q1: { name: 'Sit and tuck', blurb: 'A deep squat onto the legs, hands tucked under the lower corners.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { legL: -85, legR: 85, armL: -28, armR: 28 }), A.set(0, { sy: 0.8, sx: 1.12 })] },
  Q2: { name: 'Sit and tuck, deeper', blurb: 'Same, the arms further under.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { legL: -80, legR: 80, armL: -50, armR: 50 }), A.set(0, { sy: 0.84, sx: 1.1 })] },
  Q3: { name: 'Sit and tuck, flat eyes', blurb: 'Q1 with today\'s flat-line eyes.', actions: [A.face(0, 'shutdown'), A.pose(0, 8, { legL: -85, legR: 85, armL: -28, armR: 28 }), A.set(0, { sy: 0.8, sx: 1.12 })] },
  Q4: { name: 'Sit and tuck, legs under', blurb: 'The legs fold under the body instead of out in front.', actions: [A.face(0, 'asleep'), A.pose(0, 8, { legL: 95, legR: -95, armL: -28, armR: 28 }), A.set(0, { sy: 0.82, sx: 1.12 })] },
  Q5: { name: 'Sit and tuck (arms slide down)', blurb: 'The squat, and the arms slid down the sides to the lower corners, turned in under.', actions: [A.sitTuck(0, 30)] },
  Q6: { name: 'Sit and tuck, hands showing', blurb: 'As Q5, the hands turned less far under so a little of each shows at the corner.', actions: [A.sitTuck(0, 30), A.pose(30, 1, { armL: -30, armR: 30 })] },
  P6: { name: 'Standby', blurb: 'Lids most of the way down, arms down, still upright — dimming with the picture.', actions: [A.face(0, 'dozy'), A.pose(0, 8, { armL: 0, armR: 0, rot: 0 }), A.set(0, { sy: 0.97, sx: 1.02 })] },
};
const AT = LEN('b10') - 40;   // the close's last second
export const EndPoseStudy: React.FC<{ pose: EndPose }> = ({ pose }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Backdrop themes={[{ at: 0, slug: 'golden-sunbreak' }]} total={1} />
    <Sequence from={-AT}><Beat10 /></Sequence>
    <Sequence from={-30}><Host actions={END_POSES[pose].actions} base={{ ...REST, x: Y_SPOT.x, y: Y_SPOT.y, size: 120, costume: 'golden-sunbreak', face: 'welcome' }} /></Sequence>
    <div style={{ position: 'absolute', right: 28, bottom: 14, fontFamily: 'system-ui', fontSize: 24, color: '#fff', opacity: 0.7 }}>{pose} · {END_POSES[pose].name}</div>
  </AbsoluteFill>
);
