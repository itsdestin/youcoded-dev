// Renders only take1c. WHY its own entry: several agents build films side by side; a mistake in one film's
// files must not stop the others from rendering (it did, once, through the shared src/index.ts).
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FPS } from '../brand';
import { Take1C } from './take1c';
const Root: React.FC = () => <Composition id="take1c" component={Take1C} fps={FPS} width={1920} height={1080} durationInFrames={75 * FPS} />;
registerRoot(Root);
