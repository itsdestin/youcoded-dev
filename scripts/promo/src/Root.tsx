import React from 'react';
import { Composition, Still } from 'remotion';
import { FPS } from './grid';
import { Promo, FILM } from './Promo';
import { Intro, INTRO_FRAMES } from './intro/Intro';
import { CaptionStudy } from './CaptionStudy';
import { HostStudy, STUDY_FRAMES } from './intro/HostStudy';
import { TransitionStudy, TRANSITION_STUDY_FRAMES } from './studies/TransitionStudy';
// The film runs the bar grid (TOTAL_FRAMES) plus TAIL_FRAMES, the frames the
// last beat holds so the music's final chord plays out under a live picture.
// `Intro` is the cold-open study clip (round three's mascot check-in) and the
// three `Caption*` stills are the caption designs Destin picks from.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={FILM} fps={FPS} width={1920} height={1080} />
    <Composition id="Intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ faceStyle: 'classic' as const }} />
    <Composition id="HostStudy" component={HostStudy} durationInFrames={STUDY_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ faceStyle: 'classic' as const }} />
    {/* check-in 3b: the label + bubble captions and the three theme-transition candidates */}
    <Composition id="TransitionStudy" component={TransitionStudy} durationInFrames={TRANSITION_STUDY_FRAMES} fps={FPS} width={1920} height={1080} />
    {(['A', 'B', 'C'] as const).map((d) => (
      <Still key={d} id={`Caption${d}`} component={CaptionStudy} width={1920} height={1080}
        defaultProps={{ design: d, slug: 'halftone-dimension' as const, still: 'connect4', head: 'Play while it works.', sub: 'Chess and Connect 4 with friends. Flappy on your own.' }} />
    ))}
  </>
);
