import React from 'react';
import { Composition, Still } from 'remotion';
import { FPS } from './brand';
import { Banner, Poster } from './posters';
import { Hero30, Hero60, ShortFounder, ShortHouse, ShortRent, ShortYours } from './films';

// Poster sizes: name → pixels. Social 4:5 and 9:16 are the brand guide's two; the rest are the
// shapes posters and adverts are actually bought in.
const POSTER_SIZES: Record<string, [number, number]> = {
  'social-4x5': [2160, 2700], 'story-9x16': [2160, 3840], 'print-24x36': [4800, 7200],
  'square': [2160, 2160], 'landscape-16x9': [3840, 2160], 'link-1200x628': [2400, 1256],
};
const IDEAS = ['own', 'ask', 'quote', 'everyone'] as const;
// Standard web advert slots, rendered at twice their size so they stay sharp on dense screens.
const BANNERS: [number, number][] = [[300, 250], [336, 280], [300, 600], [160, 600], [728, 90], [970, 250], [320, 50], [320, 100]];

// Every deliverable is one composition: `npx remotion render src/index.ts <id> out/<id>.mp4`.
export const Root: React.FC = () => (
  <>
    <Composition id="hero60" component={Hero60} fps={FPS} width={1920} height={1080} durationInFrames={60 * FPS} />
    <Composition id="hero30" component={Hero30} fps={FPS} width={1920} height={1080} durationInFrames={30 * FPS} />
    <Composition id="short-house" component={ShortHouse} fps={FPS} width={1080} height={1920} durationInFrames={15 * FPS} />
    <Composition id="short-yours" component={ShortYours} fps={FPS} width={1080} height={1920} durationInFrames={15 * FPS} />
    <Composition id="short-rent" component={ShortRent} fps={FPS} width={1080} height={1920} durationInFrames={15 * FPS} />
    <Composition id="short-founder" component={ShortFounder} fps={FPS} width={1080} height={1920} durationInFrames={20 * FPS} />
    {IDEAS.flatMap((idea) => Object.entries(POSTER_SIZES).map(([name, [w, h]]) => (
      <Still key={`${idea}-${name}`} id={`poster-${idea}-${name}`} component={Poster} width={w} height={h} defaultProps={{ idea }} />
    )))}
    {BANNERS.map(([w, h]) => <Still key={`${w}x${h}`} id={`banner-${w}x${h}`} component={Banner} width={w * 2} height={h * 2} />)}
  </>
);
