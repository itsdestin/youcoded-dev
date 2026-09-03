import React from 'react';
import { Composition, Still } from 'remotion';
import { FPS, TOTAL_FRAMES } from './grid';
import { Promo } from './Promo';
import { LayoutStill } from './beats/LayoutStill';
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Still id="Layout" component={LayoutStill} width={1920} height={1080} />
  </>
);
