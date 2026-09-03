import React from 'react';
import { OffthreadVideo, staticFile, Sequence, Loop } from 'remotion';
import { Window } from './Window';
import { CLIP } from './layout';
import { clipFrames, type Scene } from './marks';

type Props = { file: Scene; from?: number; rate?: number; pushIn?: number; scale?: number; dy?: number; opacity?: number };

// One clip inside the window, trimmed by frame and optionally sped up (`rate`)
// so a long recording fits its bars.
export const Footage: React.FC<Props> = ({ file, from = 0, rate = 1, pushIn = 0, scale, dy, opacity }) => (
  <Window pushIn={pushIn} scale={scale} dy={dy} opacity={opacity}>
    <OffthreadVideo src={staticFile(`footage/${file}.webm`)} trimBefore={from} playbackRate={rate} muted style={{ width: CLIP.w, height: CLIP.h }} />
  </Window>
);

/**
 * Footage for a beat that outlasts its recording, where the recording's tail is
 * a STILL screen (an end card, or the settled app after the theme flip).
 *
 * WHY this exists: beats 7 and 8 need 12.4 s and 10.2 s of footage; the scenes
 * hold 3.8 s and 2.5 s after their last action. An OffthreadVideo that runs out
 * freezes on its final frame, which is the one failure that looks deliberate.
 * Instead we play the clip through at 1x and then LOOP its last `tail` frames.
 * Measured on both clips: between two frames 2.8 s apart in the tail, 0.017 %
 * of pixels differ by more than 20/255 (the golden theme's ambient dust is the
 * only thing moving), so the loop seam is invisible.
 *
 * It is self-healing: if the clip is later re-filmed long enough to cover
 * `beatFrames`, the loop half is never mounted and this behaves like <Footage>.
 */
export const FootageWithStillTail: React.FC<Props & { beatFrames: number; tail?: number; margin?: number }> = ({
  file, from = 0, beatFrames, tail = 60, margin = 4, ...rest
}) => {
  const live = Math.min(beatFrames, clipFrames(file) - from - margin);
  if (live >= beatFrames) return <Footage file={file} from={from} {...rest} />;
  // The loop body is the last `tail` frames the clip actually has.
  const loopFrom = from + live - tail;
  if (loopFrom < from) throw new Error(`${file}.webm has only ${live} usable frames from ${from} — shorter than the ${tail}-frame still tail`);
  return (
    <>
      <Sequence durationInFrames={live}>
        <Footage file={file} from={from} {...rest} />
      </Sequence>
      <Sequence from={live} durationInFrames={beatFrames - live}>
        <Loop durationInFrames={tail}>
          <Footage file={file} from={loopFrom} {...rest} />
        </Loop>
      </Sequence>
    </>
  );
};
