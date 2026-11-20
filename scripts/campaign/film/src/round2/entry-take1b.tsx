// Renders only take1b. WHY its own entry: several agents build films side by side; a mistake in one film's
// files must not stop the others from rendering (it did, once, through the shared src/index.ts).
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FPS } from '../brand';
import { Take1B } from './take1b';
const Root: React.FC = () => <Composition id="take1b" component={Take1B} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} />;
registerRoot(Root);
