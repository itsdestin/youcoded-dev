import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
// A one-shot UI sound at a frame. 12 frames is longer than any of the effects,
// so the Sequence never truncates one.
export const Sfx: React.FC<{ at: number; name: 'pop' | 'chime' | 'whoosh'; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Sequence from={at} durationInFrames={12}>
    <Audio src={staticFile(`sfx-${name}.wav`)} volume={volume} />
  </Sequence>
);
