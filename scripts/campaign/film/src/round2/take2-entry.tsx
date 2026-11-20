// A render entry with take 2 alone. WHY: src/index.ts bundles every film, so a half-saved edit in another
// take (they are being worked on in parallel) stops take 2 from rendering at all. Same composition as Root's.
//   npx remotion render src/round2/take2-entry.tsx take2 out/films/youcoded-take2.mp4
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FPS } from '../brand';
import { Take2 } from './take2';

const Take2Root: React.FC = () => <Composition id="take2" component={Take2} fps={FPS} width={1920} height={1080} durationInFrames={60 * FPS} />;
registerRoot(Take2Root);
