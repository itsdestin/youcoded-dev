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
export type EndPose = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const END_POSES: Record<EndPose, { name: string; blurb: string; actions: Action[] }> = {
  A: { name: 'Powered down', blurb: 'Today: eyes closed, limbs tucked under.', actions: [A.shutdown(0)] },
  B: { name: 'At ease', blurb: 'Standing, arms down, looking at you with the warm face.', actions: [A.face(0, 'welcome'), A.look(0, 4, 0, 0.05)] },
  C: { name: 'Wave held', blurb: 'Right arm up in a wave, the happy face.', actions: [A.face(0, 'happy'), A.pose(0, 8, { armR: -150, armL: 0, rot: -3 })] },
  D: { name: 'Leaning on the Y', blurb: 'Leans into the wordmark, one arm up against the Y, smug.', actions: [A.face(0, 'smug'), A.pose(0, 8, { armR: -100, armL: 8, rot: 9 }), A.look(0, 4, 0.3, 0)] },
  E: { name: 'Ta-da', blurb: 'Both arms wide, presenting the wordmark, happy.', actions: [A.face(0, 'happy'), A.pose(0, 8, { armL: 115, armR: -115, rot: 4 })] },
  F: { name: 'Sitting', blurb: 'Sat down on the baseline, legs out in front, at ease.', actions: [A.face(0, 'welcome'), A.pose(0, 8, { legL: -80, legR: 80, armL: 20, armR: -20 }), A.set(0, { sy: 0.96, sx: 1.03 }), A.look(0, 4, 0, 0.1)] },
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
