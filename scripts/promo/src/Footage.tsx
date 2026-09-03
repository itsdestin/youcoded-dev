import React from 'react';
import { OffthreadVideo, staticFile } from 'remotion';
import { Window } from './Window';
import { CLIP } from './layout';
import { type Scene } from './marks';

type Props = { file: Scene; from?: number; rate?: number; pushIn?: number; scale?: number; dy?: number; opacity?: number };

// One clip inside the window, trimmed by frame and optionally sped up (`rate`)
// so a long recording fits its bars.
export const Footage: React.FC<Props> = ({ file, from = 0, rate = 1, pushIn = 0, scale, dy, opacity }) => (
  <Window pushIn={pushIn} scale={scale} dy={dy} opacity={opacity}>
    <OffthreadVideo src={staticFile(`footage/${file}.webm`)} trimBefore={from} playbackRate={rate} muted style={{ width: CLIP.w, height: CLIP.h }} />
  </Window>
);
