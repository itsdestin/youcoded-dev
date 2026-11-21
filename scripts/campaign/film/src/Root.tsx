import React from 'react';
import { Composition, Still } from 'remotion';
import { FPS } from './brand';
import { Banner, Poster } from './posters';
import { Take1 } from './round2/take1';
import { Take1B } from './round2/take1b';
import { Take1C } from './round2/take1c';
import { Take2 } from './round2/take2';
import { Take3, T3_FRAMES } from './round2/take3';
import { Hero30, Hero60, ShortFounder, ShortHouse, ShortRent, ShortYours } from './films';

// Poster sizes: name → pixels. Social 4:5 and 9:16 are the brand guide's two; the rest are the
// shapes posters and adverts are actually bought in.
const POSTER_SIZES: Record<string, [number, number]> = {
  'social-4x5': [2160, 2700], 'story-9x16': [2160, 3840], 'print-24x36': [4800, 7200],
  'square': [2160, 2160], 'landscape-16x9': [3840, 2160], 'link-1200x628': [2400, 1256],
};
const IDEAS = ['own', 'ask', 'quote', 'everyone', 'nothing', 'own-data', 'own-intelligence', 'own-software', 'own-everything', 'own-all'] as const;
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
    {/* Round two (2026-11-20). Each take owns one file under src/round2; lengths are set there via the exported DURATION if it differs. */}
    {/* WHY 75 s exactly: Destin's length for the fairytale (2026-11-20); the narration ends at 71.5 s. */}
    <Composition id="take1" component={Take1} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} defaultProps={{ narrator: true }} />
    <Composition id="take1-type" component={Take1} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} defaultProps={{ narrator: false }} />
    <Composition id="take1b" component={Take1B} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} />
    <Composition id="take1c" component={Take1C} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} />
    <Composition id="take2" component={Take2} fps={FPS} width={1920} height={1080} durationInFrames={60 * FPS} />
    <Composition id="take3" component={Take3} fps={FPS} width={1080} height={1920} durationInFrames={T3_FRAMES} />
    <Composition id="take3-wide" component={Take3} fps={FPS} width={1920} height={1080} durationInFrames={T3_FRAMES} />
    {IDEAS.flatMap((idea) => Object.entries(POSTER_SIZES).map(([name, [w, h]]) => (
      <Still key={`${idea}-${name}`} id={`poster-${idea}-${name}`} component={Poster} width={w} height={h} defaultProps={{ idea }} />
    )))}
    {BANNERS.map(([w, h]) => <Still key={`${w}x${h}`} id={`banner-${w}x${h}`} component={Banner} width={w * 2} height={h * 2} />)}
  </>
);
