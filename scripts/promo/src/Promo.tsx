import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { barFrame, TOTAL_FRAMES } from './grid';
import { BEATS, CUT, PRE, PRELUDE, TAIL_FRAMES, startFrames, sequenceFrames, preFrames, type BeatId } from './timeline';
import { MODULES } from './beats';
import { Backdrop } from './Backdrop';
import { Host } from './host/Host';
import { Bubbles, type BubbleCue } from './Bubble';
import { A, REST, type Action } from './host/engine';
import { accentWipe, hardCut, bandHitFrame, BandOverlay, type WipeFrom } from './transitions';
import { THEMES } from './themes';
import type { ThemeCue } from './tracks';
import { Sfx } from './beats/sfx';

const STARTS = startFrames(barFrame);
export const FILM = PRELUDE + TOTAL_FRAMES + TAIL_FRAMES;
const shift = (actions: Action[], by: number): Action[] => actions.map((a) => ({ ...a, at: a.at + by }));

const FadeOut: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [total - 30, total - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />;
};

// The theme-change moves, in the order they rotate through the cuts (Destin,
// 2026-09-04: "i actually like all 3 together, kinda exactly how the demo does
// it"): A the quick-change behind the wipe, B the poof-teleport, C the twirl.
// A needs the band, so a cut that has no wipe, or one the host enters hidden
// (after the dive into the game), takes B instead.
export type Move = 'A' | 'B' | 'C';
const CYCLE: Move[] = ['A', 'B', 'C'];
/**
 * The host's move onto `home` in `slug`, landing on `downbeat`, for a wipe
 * that starts at `wipeAt` from `from`. Returns the actions and the sounds.
 */
export function arrival(move: Move, downbeat: number, wipeAt: number, from: WipeFrom, home: { x: number; y: number }, slug: BeatModuleSlug, key: string): { actions: Action[]; sounds: React.ReactNode[] } {
  const size = A.to(downbeat - 16, 8, 'size', 120);              // whatever size the last beat left it (96 on the phone)
  if (move === 'A') {
    const hit = wipeAt + bandHitFrame(CUT, from, home.x + 60, home.y + 60);
    return { actions: [size, ...A.quickChange(hit, slug, home.x, home.y)],
      sounds: [<Sfx key={`${key}-poof`} at={hit} name="poof" volume={0.4} />, <Sfx key={`${key}-pop`} at={hit + 8} name="pop" volume={0.35} />] };
  }
  if (move === 'B') {
    return { actions: [size, ...A.vanish(downbeat - 8), ...A.appear(downbeat, home.x, home.y, slug)],
      sounds: [<Sfx key={`${key}-poof1`} at={downbeat - 8} name="poof" volume={0.4} />, <Sfx key={`${key}-poof2`} at={downbeat} name="poof" volume={0.4} />, <Sfx key={`${key}-pop`} at={downbeat + 12} name="pop" volume={0.35} />] };
  }
  return { actions: [size, ...A.twirl(downbeat - 14, 24, home.x, home.y, slug)],
    sounds: [<Sfx key={`${key}-poof`} at={downbeat - 2} name="poof" volume={0.4} />, <Sfx key={`${key}-pop`} at={downbeat + 8} name="pop" volume={0.35} />] };
}
type BeatModuleSlug = (typeof MODULES)[number]['slug'];

/**
 * Assemble the beats named in `ids` (in film order) into one composition: the
 * backdrop underneath (one continuous theme track), the beats in a
 * TransitionSeries with an accent wipe between them, the band drawn again
 * ABOVE the host for the quick-change, the host (one continuous action list),
 * its speech bubbles, and the sounds. Each beat's LOCAL actions, bubbles and
 * theme changes are shifted by its start frame; the theme-change move between
 * beats is generated here, rotating A → B → C, landing on the beat's downbeat.
 * `Promo` is every beat with the music; a study is any subset without it.
 */
export function assemble(ids: BeatId[]) {
  const modules = MODULES.filter((m) => ids.includes(m.id));
  const beats = BEATS.filter((b) => ids.includes(b.id));
  // starts: sequential for the subset (the full film's STARTS when ids is every beat)
  let t = 0;
  const starts = beats.map((b) => { const s = t; t += sequenceFrames(b, barFrame) - (b.after === 'none' ? 0 : CUT); return s; });
  const total = t;
  const nodes: React.ReactNode[] = [];
  const themes: ThemeCue[] = [];
  const host: Action[] = [];
  const bubbles: BubbleCue[] = [];
  const sounds: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];
  let cycle = 0;
  modules.forEach((m, i) => {
    const b = beats[i];
    if (m.id !== b.id) throw new Error(`beat module order ${m.id} ≠ timeline ${b.id}`);
    const start = starts[i];
    const downbeat = start + preFrames(b);
    const prev = i > 0 ? beats[i - 1] : undefined;
    const from: WipeFrom = (i - 1) % 2 === 0 ? 'left' : 'right';
    // the first beat's theme sits at frame 0 (a study of a subset drew the NEXT beat's backdrop under
    // its first beat, because only cuts pushed a cue); the full film's b1 cue at the punch dedupes
    themes.push(i === 0 ? { at: 0, slug: m.slug } : { at: start, slug: m.slug, wash: from === 'left' ? 'wipe-left' : 'wipe-right' });
    themes.push(...(m.themes ?? []).map((c) => ({ ...c, at: c.at + start })));
    if (i === 0 && m.arrival === 'none') {
      // the film's first beat stages its own entrance
    } else if (i === 0) {
      host.push(A.set(0, { x: m.home.x, y: m.home.y, size: 120, costume: m.slug, face: 'welcome', hidden: false }));   // a study: already there
    } else if (m.arrival !== 'none') {
      let move = CYCLE[cycle % 3]; cycle++;
      const hasWipe = prev?.after === 'wipe';
      const entersHidden = prev?.id === 'b6';                      // the dive into Flappy leaves the host hidden
      // the poof is the only move that starts from NOTHING: a quick-change needs a visible host under the band and a
      // twirl needs a body to spin — after the dive into Flappy the host stayed hidden for the rest of the film when
      // the reorder handed that cut a twirl (2026-09-04)
      if (entersHidden || (move === 'A' && !hasWipe)) move = 'B';
      const r = arrival(move, downbeat, start, from, m.home, m.slug, m.id);
      host.push(...r.actions); sounds.push(...r.sounds);
    }
    host.push(...shift(m.host, start));
    bubbles.push(...(m.bubbles ?? []).map((c) => ({ ...c, at: c.at + start, until: c.until != null ? c.until + start : undefined })));
    nodes.push(<TransitionSeries.Sequence key={b.id} durationInFrames={sequenceFrames(b, barFrame)}><m.Component /></TransitionSeries.Sequence>);
    if (b.after !== 'none' && i < modules.length - 1) {
      const next = modules[i + 1];
      const nextFrom: WipeFrom = i % 2 === 0 ? 'left' : 'right';
      nodes.push(
        <TransitionSeries.Transition key={`${b.id}-t`} timing={linearTiming({ durationInFrames: CUT })}
          presentation={(b.after === 'cut' ? hardCut : accentWipe)({ accent: THEMES[next.slug].accent, from: nextFrom })} />);
      if (b.after === 'wipe') {
        sounds.push(<Sfx key={`whoosh-${b.id}`} at={starts[i + 1]} name="whoosh" volume={0.35} />);
        overlays.push(<BandOverlay key={`band-${b.id}`} at={starts[i + 1]} cut={CUT} accent={THEMES[next.slug].accent} from={nextFrom} />);
      }
    }
  });
  return { nodes, themes, host, bubbles, sounds, overlays, total, first: beats[0] };
}

export const Film: React.FC<{ ids: BeatId[]; music?: boolean }> = ({ ids, music = false }) => {
  const a = assemble(ids);
  const from = a.first.id === 'b1' ? PRELUDE : 0;
  const total = a.first.id === 'b1' ? FILM : a.total;
  void PRE;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {music && <Sequence from={PRELUDE}><Audio src={staticFile('promo.wav')} /></Sequence>}
      <Backdrop themes={a.themes} total={total} from={from} />
      <TransitionSeries>{a.nodes}</TransitionSeries>
      <Host actions={a.host} base={{ ...REST, hidden: true, costume: 'midnight' }} />
      {a.overlays}
      <Bubbles cues={a.bubbles} actions={a.host} base={{ ...REST, hidden: true, costume: 'midnight' }} />
      {a.sounds}
      <FadeOut total={total} />
    </AbsoluteFill>
  );
};
/** The whole film, with the music. */
export const Promo: React.FC = () => <Film ids={BEATS.map((b) => b.id)} music />;
/** Frames of a study made from a subset of beats. */
export const studyFrames = (ids: BeatId[]) => assemble(ids).total;
