import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { FPS } from '../grid';

// How long each effect's file actually is, in seconds. Measured with
// `ffprobe -show_entries format=duration` on public/sfx-*.wav, 2026-09-03.
// A Sequence CUTS its children off at durationInFrames, so a Sequence shorter
// than the file truncates the sound with no sign of it in the picture — the
// old code wrapped all three in a flat 12 frames and the chime (1.30 s = 39
// frames) stopped dead after 0.4 s, in the middle of the theme flip. Never
// give an effect fewer frames than its file: re-measure if a file is replaced.
const SECONDS = { pop: 0.16, whoosh: 0.26, chime: 1.3, punch: 0.25, poof: 0.35, step: 0.08 } as const;   // punch/poof/step added 2026-09-04 with the 44-bar track
export type SfxName = keyof typeof SECONDS;

/** One-shot UI sound starting at frame `at`, played to the end of its file. */
export const Sfx: React.FC<{ at: number; name: SfxName; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Sequence from={at} durationInFrames={Math.ceil(SECONDS[name] * FPS)}>
    <Audio src={staticFile(`sfx-${name}.wav`)} volume={volume} />
  </Sequence>
);
