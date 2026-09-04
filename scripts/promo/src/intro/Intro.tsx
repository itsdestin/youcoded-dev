import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { Host } from '../host/Host';
import { A, REST, type Action } from '../host/engine';
import type { FaceStyle } from '../host/faces';
import { THEMES } from '../themes';
import { Window } from '../Window';
import { Backdrop } from '../Backdrop';
import { CLIP, perch } from '../layout';
import { barFrame } from '../grid';
import { Sfx } from '../beats/sfx';
const { fontFamily } = loadInter();

// The cold open, Destin's storyboard of 2026-09-04: a fully black, silent
// screen with a white YouCoded in the centre. The host peeks in over the LEFT
// edge, looks around, steps in and walks cautiously across to stand just left
// of the Y, looks at it for a beat, then punches it — the music starts on the
// hit, the screen bursts into Cotton Candy Sky from the point of impact, the
// word "Assistant" rolls out from behind the wordmark, and on bar 1 the app
// window rises under it while the wordmark hands off to the caption band.
//
// Every number here is a frame at 30 fps. IMPACT is the music's bar 0.
export const IMPACT = 236;                       // must equal timeline.ts PRELUDE
export const SIZE = 140;                        // the host is bigger here than on a title bar
const WORD = { size: 112, cx: 960, baseline: 578 };
// Inter 800 at 112 px: "YouCoded" measures ~525 px, so its left edge (the Y) is at ~697.
const WORD_LEFT = WORD.cx - 262;
const GROUND_Y = WORD.baseline - SIZE * 0.86;    // the host's feet on the wordmark's baseline
const STAND_X = WORD_LEFT - 44 - SIZE;           // its box just left of the Y
// After the punch the whole title — host, gap, "YouCoded Assistant" — sits
// CENTRED for a beat (Destin, 2026-09-04: "bound the mascot back a bit and
// center the full title page thing for a second"). "Assistant" adds 28 + 470
// px on the right, so the group is 140 + 44 + 525 + 28 + 470 = 1207 px wide;
// the host bounces back to its left edge and the wordmark slides left to meet it.
const ASSIST_W = 28 + 470;
const GROUP_W = SIZE + 44 + 525 + ASSIST_W;
// −20: the body fills only the middle of its 140 px box, so the group's VISIBLE left edge is ~20 px in
export const RECOIL_X = Math.round(960 - GROUP_W / 2) - 20;       // the host's box after the recoil (336)
export const WORD_LEFT_CENTRED = RECOIL_X + SIZE + 44;              // the Y's left edge once centred (520)
const P = perch(0.3);

export const introActions = (): Action[] => [
  // pacing (review of 3b: it waited 3.5 s at the edge): peek at 30, look, step in at 96, walk 108–196, size up the Y, punch at 236
  A.peekIn(30, 28, GROUND_Y, SIZE, 0.82),         // peeks in over the left edge (the body is the middle half of the box, so most of the box must show)
  A.face(30, 'curious'),
  A.look(60, 8, 0.55, 0.1), A.look(74, 8, -0.4, -0.15), A.blink(86), A.look(90, 8, 0.2, 0),
  A.stepIn(96, 14, -18, GROUND_Y),                // steps fully into frame
  A.face(108, 'welcome'),
  A.walk(108, 88, STAND_X, 7),                    // a cautious walk across
  A.look(124, 20, 0.5, 0),
  A.face(198, 'curious'), A.look(198, 10, 0.6, -0.25), A.tilt(202, 10, 7), A.blink(212),   // looks the Y up and down
  A.face(220, 'welcome'), A.look(220, 6, 0.5, -0.1), A.tilt(220, 6, 0),   // fixes on the Y (never the chevron 'idle' face — it read as empty eyes)
  A.punch(IMPACT, 1),                             // wind-up from 224, the hit at 236
  A.face(IMPACT, 'shocked'), A.costume(IMPACT, 'cotton-candy-sky'), A.look(IMPACT, 4, 0, 0),
  // the recoil: knocked STRAIGHT back off the Y in a fast low arc (lands by IMPACT+10), BEFORE the title
  // slides over to meet it — two separate motions, so it reads as a knock-back and then a re-centre
  A.hop(IMPACT + 1, 12, RECOIL_X, GROUND_Y, 56),
  A.face(IMPACT + 22, 'welcome'), A.look(IMPACT + 22, 8, 0.5, -0.1), A.blink(IMPACT + 30),   // …and admires the full title
  // onto the title bar: takes off BEFORE the window arrives and hangs long enough to land as it settles
  // (review: the window rose through it and it looked drawn inside the wallpaper)
  A.hop(IMPACT + barFrame(1) - 8, 34, P.x, P.y, 150),
  A.to(IMPACT + barFrame(1) - 8, 34, 'size', 120),
  A.face(IMPACT + barFrame(1) + 40, 'welcome'),
];

const Wordmark: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const fadeIn = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  // the jolt on impact: the WHOLE row knocked right, springs back (jolting only "YouCoded" made the gap
  // to "Assistant" breathe — review of 3b)
  const jolt = f >= IMPACT ? interpolate(spring({ frame: f - IMPACT, fps, config: { damping: 11, stiffness: 260 } }), [0, 1], [26, 0]) : 0;
  // "Assistant" rolls out from behind the wordmark's right edge over 14 frames
  const roll = f >= IMPACT + 2 ? spring({ frame: f - IMPACT - 2, fps, config: { damping: 14, stiffness: 140 } }) : 0;
  // …then, once the host has been knocked back and landed (IMPACT+10), the mark slides left to meet it,
  // so host + wordmark end up centred as a group
  const centre = f >= IMPACT + 10 ? spring({ frame: f - IMPACT - 10, fps, config: { damping: 16, stiffness: 110 } }) : 0;
  const left = interpolate(centre, [0, 1], [WORD_LEFT, WORD_LEFT_CENTRED]) + jolt;
  // The mark hands off to the caption band BEFORE bar 1 (14 frames early), so
  // the window rising on the downbeat never passes through it.
  const HAND = IMPACT + barFrame(1) - 14;
  const hand = f >= HAND ? spring({ frame: f - HAND, fps, config: { damping: 20, stiffness: 160 } }) : 0;
  const scale = interpolate(hand, [0, 1], [1, 0.38]);
  const y = interpolate(hand, [0, 1], [WORD.baseline - WORD.size * 0.82, 990]);
  const flash = f === IMPACT ? 1 : f === IMPACT + 1 ? 0.45 : 0;   // one hard white frame and a half, not a grey fade (review: "a grey strobe")
  // WHY the mark is anchored by its LEFT edge and not centred: a centred flex
  // row re-centres itself when "Assistant" rolls out, which slid "You" under the
  // host's feet in the first study. Instead the left edge is driven on purpose:
  // it slides from the punch point to WORD_LEFT_CENTRED in step with the roll,
  // while the host bounces back to RECOIL_X, so the GROUP is what ends centred.
  return (
    <>
      <div style={{ position: 'absolute', left: interpolate(hand, [0, 1], [left, 960 - (525 + 28 + 300) * 0.38 / 2]), top: y, display: 'flex', justifyContent: 'flex-start', transform: `scale(${scale})`, transformOrigin: '0% 50%',
        fontFamily: `${fontFamily}, system-ui, sans-serif`, fontWeight: 800, fontSize: WORD.size, letterSpacing: '-0.03em', color: '#fff', opacity: fadeIn, lineHeight: 1 }}>
        <span style={{ display: 'inline-block', textShadow: f >= IMPACT ? '0 6px 30px rgba(0,0,0,.35)' : 'none' }}>YouCoded</span>
        <span style={{ display: 'inline-block', overflow: 'hidden', width: interpolate(roll, [0, 1], [0, 470]), marginLeft: interpolate(roll, [0, 1], [0, 28]), whiteSpace: 'nowrap', verticalAlign: 'top' }}>
          <span style={{ display: 'inline-block', transform: `translateX(${interpolate(roll, [0, 1], [-470, 0])}px)`, fontWeight: 500, color: f >= IMPACT ? THEMES['cotton-candy-sky'].accent : '#fff' }}>Assistant</span>
        </span>
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash }} />}
    </>
  );
};

/** The burst: black until the impact, then Cotton Candy Sky spreads from the fist as a soft circle. */
const Burst: React.FC = () => {
  const f = useCurrentFrame();
  const t = THEMES['cotton-candy-sky'];
  const p = interpolate(f - IMPACT, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (f < IMPACT) return <AbsoluteFill style={{ background: '#000' }} />;
  if (p >= 1) return null;                          // the film's own backdrop takes over once the burst has covered the frame
  const r = 60 + p * 2300;
  const cx = STAND_X + SIZE + 24, cy = WORD.baseline - 60;
  const mask = `radial-gradient(circle at ${cx}px ${cy}px, #000 ${Math.max(0, r - 220)}px, transparent ${r}px)`;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ maskImage: mask, WebkitMaskImage: mask }}>
        <AbsoluteFill style={{ background: t.canvas }}>
          <img src={staticFile('themes/cotton-candy-sky/backdrop.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
          <AbsoluteFill style={{ background: t.canvas, opacity: 0.5 }} />
          <AbsoluteFill style={{ background: `radial-gradient(70% 85% at 40% 40%, ${t.accent}22 0%, transparent 70%)` }} />
        </AbsoluteFill>
      </AbsoluteFill>
      {/* sparks flung from the fist */}
      {p < 1 && Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + 0.2; const d = 40 + p * (260 + (i % 5) * 60);
        const sz = 14 - p * 10;
        return <div key={i} style={{ position: 'absolute', left: cx + Math.cos(a) * d, top: cy + Math.sin(a) * d * 0.8, width: sz, height: sz, borderRadius: '50%', background: i % 2 ? '#fff' : t.accent, opacity: 1 - p }} />;
      })}
    </AbsoluteFill>
  );
};

/** The window rises from below on bar 1. */
const Rise: React.FC<{ file: string }> = ({ file }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18, stiffness: 90, mass: 1 } });
  return (
    <Window dy={interpolate(s, [0, 1], [760, 0])} opacity={interpolate(s, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' })} light>
      <OffthreadVideo src={staticFile(`footage/${file}.webm`)} muted style={{ width: CLIP.w, height: CLIP.h }} />
    </Window>
  );
};

export const INTRO_FRAMES = IMPACT + barFrame(2) + 40;
/** Everything the intro draws except the host and the music: black, the burst, the window rising, the wordmark, the sounds. */
export const IntroVisuals: React.FC<{ windowFile?: string }> = ({ windowFile = 'promo-idle-cotton' }) => (
  <AbsoluteFill>
    <Burst />
    <Sequence from={IMPACT + barFrame(1)}><Rise file={windowFile} /></Sequence>
    <Wordmark />
    {/* footsteps, the punch, the poof and the landing pop live HERE so the film (Beat1 renders
        IntroVisuals) gets them too — they were only in the study before */}
    {[116, 128, 140, 152, 164, 176, 188].map((at) => <Sfx key={at} at={at} name="step" volume={0.35} />)}
    <Sfx at={IMPACT} name="punch" volume={0.8} />
    <Sfx at={IMPACT} name="poof" volume={0.5} />
    <Sfx at={IMPACT + barFrame(1) + 18} name="pop" volume={0.4} />
  </AbsoluteFill>
);
export const Intro: React.FC<{ faceStyle?: FaceStyle; windowFile?: string }> = ({ faceStyle = 'warm', windowFile = 'promo-idle-cotton' }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence from={IMPACT}><Audio src={staticFile('promo.wav')} /></Sequence>
    {/* the film's backdrop, as Promo.tsx draws it: black through the prelude, Cotton Candy under the burst and after it
        (without it the study went black again once the burst had covered the frame — Burst hands off to the backdrop) */}
    <Backdrop themes={[{ at: IMPACT, slug: 'cotton-candy-sky' }]} total={INTRO_FRAMES} from={IMPACT} />
    <IntroVisuals windowFile={windowFile} />
    <Host actions={introActions()} base={{ ...REST, hidden: true, costume: 'midnight' }} faceStyle={faceStyle} />
  </AbsoluteFill>
);
