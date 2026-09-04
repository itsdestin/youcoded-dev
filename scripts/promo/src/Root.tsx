import React from 'react';
import { Composition, Still } from 'remotion';
import { FPS } from './grid';
import { Promo, FILM, Film, studyFrames } from './Promo';
import { Intro, INTRO_FRAMES } from './intro/Intro';
import { CaptionStudy } from './CaptionStudy';
import { HostStudy, STUDY_FRAMES } from './intro/HostStudy';
import { TransitionStudy, TRANSITION_STUDY_FRAMES } from './studies/TransitionStudy';
import { EndPoseStudy } from './studies/EndPoseStudy';
// The film runs the bar grid (TOTAL_FRAMES) plus TAIL_FRAMES, the frames the
// last beat holds so the music's final chord plays out under a live picture.
// `Intro` is the cold-open study clip (round three's mascot check-in) and the
// three `Caption*` stills are the caption designs Destin picks from.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={FILM} fps={FPS} width={1920} height={1080} />
    <Composition id="Intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ faceStyle: 'warm' as const }} />
    <Composition id="HostStudy" component={HostStudy} durationInFrames={STUDY_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ faceStyle: 'warm' as const }} />
    {/* check-in 3c: two beats choreographed so the host PRESENTS the app (model picker, the phone), with the
        rotating theme-change moves, the centred label and the bubbles — the pattern for every other beat */}
    <Composition id="PresentStudy" component={Film} durationInFrames={studyFrames(['b4', 'b8'])} fps={FPS} width={1920} height={1080} defaultProps={{ ids: ['b4', 'b8'] as const as any, music: false }} />
    {/* check-in 5: the close on its own — the window filling the frame, the modal, the host beside the Y (Destin, 2026-09-04) */}
    <Composition id="CloseStudy" component={Film} durationInFrames={studyFrames(['b10'])} fps={FPS} width={1920} height={1080} defaultProps={{ ids: ['b10'] as const as any, music: false }} />
    {/* end-pose candidates for the close (Destin, 2026-09-04) */}
    {(['A', 'B', 'C', 'D', 'E', 'F', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const).map((p) => (
      <Still key={`End${p}`} id={`End${p}`} component={EndPoseStudy} width={1920} height={1080} defaultProps={{ pose: p }} />
    ))}
    {/* check-in 3b: the label + bubble captions and the three theme-transition candidates */}
    <Composition id="TransitionStudy" component={TransitionStudy} durationInFrames={TRANSITION_STUDY_FRAMES} fps={FPS} width={1920} height={1080} />
    {/* the caption style is G (glow, no underline — Destin's pick, 2026-09-04); the nine-variant study is retired */}
    {(['A', 'B', 'C'] as const).map((d) => (
      <Still key={d} id={`Caption${d}`} component={CaptionStudy} width={1920} height={1080}
        defaultProps={{ design: d, slug: 'halftone-dimension' as const, still: 'connect4', head: 'Play while it works.', sub: 'Chess and Connect 4 with friends. Flappy on your own.' }} />
    ))}
  </>
);
