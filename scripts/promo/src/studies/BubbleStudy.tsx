import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Host } from '../host/Host';
import { Bubbles, type Look, type Motion, type Shape } from '../Bubble';
import { A, REST } from '../host/engine';
import { perch } from '../layout';
import { inWindow } from '../beats/beat';
import { isLight } from '../beats/beat';
import type { Slug } from '../themes';

// The bubble check-in (2026-09-09): one line said from the title bar over a still of the app,
// in any LOOK and MOTION (Bubble.tsx), on any theme — a still for the look, a clip for the
// motion. `file` is the footage the window shows (the idle clips are stills in all but name).
export const BUBBLE_STUDY_FRAMES = 72;
type Props = { look: Look; motion: Motion; shape?: Shape; slug: Slug; file: string; text: string };
export const BubbleStudy: React.FC<Props> = ({ look, motion, shape = 'wedge', slug, file, text }) => {
  const P = perch(0.3);
  const actions = [
    A.set(0, { x: P.x, y: P.y, size: 120, costume: slug, face: 'happy', hidden: false }),
    A.aim(8, inWindow(0.5, 0.5).x, inWindow(0.5, 0.5).y),
  ];
  const base = { ...REST, hidden: true, costume: slug };
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Backdrop themes={[{ at: 0, slug }]} total={BUBBLE_STUDY_FRAMES} />
      <Footage file={file} from={0} light={isLight(slug)} />
      <Host actions={actions} base={base} />
      <Bubbles cues={[{ at: 10, until: 56, text, slug }]} actions={actions} base={base} look={look} motion={motion} shape={shape} />
    </AbsoluteFill>
  );
};
