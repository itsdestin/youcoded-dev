import React from 'react';
import { Composition, Still } from 'remotion';
import { Finale } from './finale';
import { Hero60 } from './Hero';
import { Yours60 } from './Yours';
import { Hero30, Short, SHORTS, ShortSpec } from './Cutdowns';
import { PosterTall, PosterWide, PosterProps } from './poster';

const FinaleTest: React.FC = () => <Finale l1={15} l2={96} hit={216} addr={396} />;

// The poster series: one ask, one result, the same line.
export const SERIES: Record<string, PosterProps> = {
  // Every crop has the same shape (1.9:1) so the series lines up poster to poster.
  // crop = the one detail that sells each thing at feed size (fractions of the still).
  house: { ask: 'make me a page that runs my house', img: 'still-home-page.png', imgAspect: 1.6, crop: { x: 0.03, y: 0.08, w: 0.63, h: 0.53 } },
  money: { ask: 'where does my money go?', img: 'still-finance-spending.png', imgAspect: 1.6, crop: { x: 0.015, y: 0.07, w: 0.625, h: 0.526 } },
  paint: { ask: 'a paint app for my niece', img: 'still-paint-page.png', imgAspect: 1.6, crop: { x: 0.05, y: 0.1, w: 0.9, h: 0.758 } },
  trip: { ask: 'plan lisbon with my sister', img: 'still-trip-board.png', imgAspect: 1.6, crop: { x: 0.0, y: 0.04, w: 0.78, h: 0.657 } },
  look: { ask: 'make it feel like golden hour', img: 'still-chat-devils-garden.png', imgAspect: 1.6, crop: { x: 0.02, y: 0.0, w: 0.96, h: 0.808 } },
};

const SIZES = {
  '4x5': { w: 2400, h: 3000, C: PosterTall },
  '9x16': { w: 2160, h: 3840, C: PosterTall },
  '1x1': { w: 2160, h: 2160, C: PosterTall },
  '1200x628': { w: 2400, h: 1256, C: PosterWide },
} as const;

export const Root: React.FC = () => (
  <>
    <Composition id="Yours60" component={Yours60} durationInFrames={1800} fps={30} width={1920} height={1080} />
    <Composition id="Hero60" component={Hero60} durationInFrames={1800} fps={30} width={1920} height={1080} />
    <Composition id="Hero30" component={Hero30} durationInFrames={900} fps={30} width={1920} height={1080} />
    {Object.entries(SHORTS).map(([k, p]) => (
      <Composition key={k} id={`short-${k}`} component={Short as React.FC<ShortSpec>} defaultProps={p} durationInFrames={480} fps={30} width={1080} height={1920} />
    ))}
    <Composition id="FinaleTest" component={FinaleTest} durationInFrames={660} fps={30} width={1920} height={1080} />
    {Object.entries(SERIES).flatMap(([name, p]) =>
      Object.entries(SIZES).map(([size, z]) => (
        <Still key={`${name}-${size}`} id={`poster-${name}-${size}`} component={z.C as React.FC<PosterProps>} width={z.w} height={z.h} defaultProps={p} />
      )),
    )}
  </>
);
