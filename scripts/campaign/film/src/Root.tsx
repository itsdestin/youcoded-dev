import React from 'react';
import { Composition, Still } from 'remotion';
import { Finale } from './finale';
import { Hero60 } from './Hero';
import { Hero30, Short, SHORTS, ShortSpec } from './Cutdowns';
import { PosterTall, PosterWide, PosterProps } from './poster';

const FinaleTest: React.FC = () => <Finale l1={15} l2={96} hit={216} addr={396} />;

// The poster series: one ask, one result, the same line.
export const SERIES: Record<string, PosterProps> = {
  house: { ask: 'make me a page that runs my house', img: 'ph-home.png', imgAspect: 1216 / 760 },
  money: { ask: 'where does my money go?', img: 'ph-money.png', imgAspect: 1216 / 760 },
  paint: { ask: 'a paint app for my niece', img: 'ph-paint.png', imgAspect: 1216 / 760 },
  trip: { ask: 'plan lisbon with my sister', img: 'ph-trip.png', imgAspect: 1216 / 760 },
};

const SIZES = {
  '4x5': { w: 2400, h: 3000, C: PosterTall },
  '9x16': { w: 2160, h: 3840, C: PosterTall },
  '1x1': { w: 2160, h: 2160, C: PosterTall },
  '1200x628': { w: 2400, h: 1256, C: PosterWide },
} as const;

export const Root: React.FC = () => (
  <>
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
