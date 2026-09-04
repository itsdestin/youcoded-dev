import React from 'react';
import { Composition } from 'remotion';
import { FPS, TOTAL_FRAMES } from './grid';
import { TAIL_FRAMES } from './timeline';
import { Promo } from './Promo';
// The film runs the bar grid (TOTAL_FRAMES) plus TAIL_FRAMES, the frames the
// last beat holds so the music's final chord plays out under a live picture.
export const RemotionRoot: React.FC = () => (
  <Composition id="Promo" component={Promo} durationInFrames={TOTAL_FRAMES + TAIL_FRAMES} fps={FPS} width={1920} height={1080} />
);
