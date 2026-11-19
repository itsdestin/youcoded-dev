// The films. Each is a timeline in seconds, cut to the score: one bar is 2.4 s (100 BPM), and
// every section starts on a bar line (see ../music). Text obeys the brand guide's reading rule:
// on screen at least 1.2 s + 0.25 s per word, so every film works with the sound off.
import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { Bloom, Day, EndCard, Label, Ledger, Line, Night, Shot, Stage, Typing, Wall, mark } from './kit';
import stills from './stills.json';

const RENTED = ['documents', 'photos', 'storage', 'music', 'smart home', 'budgeting', 'notes', 'passwords', 'calendar', 'email', 'video', 'backup', 'design', 'maps'];
const WIDE = { x: 16.25, y: 17.6, w: 67.5, h: 75 };          // the app window in a 16:9 frame
const TALL = { x: 8.5, y: 24.5, w: 83, h: 54.5 };            // the app card in a 9:16 frame (clear of the top 12% and bottom 20%)
const Score: React.FC<{ name: string }> = ({ name }) => <Audio src={staticFile(`audio/${name}.wav`)} />;
const WALL = (stills as string[]).filter((s) => !/chat--/.test(s));

/** One "ask": a sentence typed on the lavender field, which rises to become the caption as the
 *  result appears beneath it. `T` is the bar line it starts on; it lasts `len` seconds. */
const Ask: React.FC<{ T: number; len: number; text: string; shots: (t0: number, t1: number) => Shot[]; tall?: boolean; typeFor?: number }> = ({ T, len, text, shots, tall, typeFor = 1.2 }) => {
  const stageAt = T + typeFor + 0.25, out = T + len - 0.05;
  return (
    <>
      <Typing text={text} at={T} start={T + 0.1} end={T + 0.1 + typeFor} dockAt={T + typeFor + 0.15} out={out}
        size={tall ? 5.6 : 4.6} y={tall ? 45 : 47} maxWidth={tall ? 80 : 84} dockY={tall ? 17.6 : 10.5} dockSize={tall ? 3.3 : 2.3} />
      <Stage at={stageAt} out={out} box={tall ? TALL : WIDE} shots={shots(stageAt, out)} radius={tall ? 2.4 : 1.6} />
    </>
  );
};

// The shots, shared by every cut. Each takes the stretch of film it must fill.
const homeBuilt = (clip: string) => (t0: number, t1: number): Shot[] => {
  const from = mark(clip, 'send') - 0.05, span = mark(clip, 'end') + 0.5 - from;
  return [{ clip, from, at: t0, out: t1, rate: Math.max(1, span / (t1 - t0)) }];
};
// `second` is the labelled moment the second half opens on: the thermostat on the desktop take,
// the living-room lights on the phone take (each is what that take does next, in order).
const homePage = (clip: string, second = 'thermo') => (t0: number, t1: number): Shot[] => {
  const mid = t0 + (t1 - t0) * 0.46;
  return [{ clip, from: mark(clip, 'lamp') - 0.9, at: t0, out: mid }, { clip, from: mark(clip, second) - 0.5, at: mid, out: t1 }];
};
const moneyPage = (clip: string) => (t0: number, t1: number): Shot[] => {
  const mid = t0 + (t1 - t0) * 0.45;
  return [{ clip, from: mark(clip, 'spending') - 0.7, at: t0, out: mid }, { clip, from: mark(clip, 'year') - 0.4, at: mid, out: t1 }];
};
const docPage = (t0: number, t1: number): Shot[] => [{ clip: 'office-doc', from: mark('office-doc', 'scroll') - 1.1, at: t0, out: t1, zoom: [1, 1.03] }];
/** The reply finishing, then the whole app changing its look on the beat (`beats` = swap times). */
const themeSwaps = (clip: string, beats: number[]) => (t0: number, t1: number): Shot[] => {
  const s: Shot[] = [{ clip, from: mark(clip, 'built', 'end') - (beats[0] - t0) + 0.1, at: t0, out: beats[0] }];
  beats.forEach((b, i) => s.push({ clip, from: mark(clip, `swap${i + 1}`) - 0.04, at: b, out: beats[i + 1] ?? t1 }));
  return s;
};

// ------------------------------------------------------------------ the 60-second film (16:9)
export const Hero60: React.FC = () => (
  <AbsoluteFill>
    <Score name="hero60-mix" />
    <Night />
    <Ledger at={0.2} out={9.5} items={RENTED} />
    <Line dark text="for twenty years, software has been / something you *rent.*" at={0.7} out={4.9} size={5.2} />
    <Line dark text="pay forever. / own *nothing.*" at={5.2} out={9.4} size={7.4} />
    <Line dark text="now you can just *ask.*" at={9.8} out={12.0} size={5.2} />
    <Typing dark text="build me a page that runs my house" at={12.0} start={12.25} end={14.15} out={14.9} />
    <Bloom at={14.4}>
      <Typing text="build me a page that runs my house" at={12.0} start={12.25} end={14.15} dockAt={14.6} out={21.55} />
      <Stage at={14.9} out={21.55} box={WIDE} shots={[...homeBuilt('ask-home')(14.9, 17.5), ...homePage('page-home')(17.5, 21.55)]} />
    </Bloom>
    {/* 21.6-36.0: three more asks, two bars each */}
    <Ask T={21.6} len={4.8} text="show me where my money goes" shots={moneyPage('page-money')} />
    <Ask T={26.4} len={4.8} text="turn my notes into a plan for the garden" shots={docPage} typeFor={1.3} />
    <Ask T={31.2} len={4.75} text="make it feel like golden hour" shots={themeSwaps('ask-theme', [33.6])} />
    {/* 36.0-48.0: it is not one app, it is everyone's */}
    <Wall at={35.95} out={48.1} stills={WALL} cols={4} rows={4} dim={[[38.2, 42.1], [42.5, 46.2]]} />
    <Line text="everyone who installs it / can *change* it." at={38.4} out={42.0} size={6.2} />
    <Line text="and *share* what they made." at={42.7} out={46.1} size={6.2} />
    {/* 48.0-52.8: the stance */}
    {<StanceBlock at={48.0} out={52.75} />}
    <EndCard at={52.8} />
  </AbsoluteFill>
);
const StanceBlock: React.FC<{ at: number; out: number; tall?: boolean }> = ({ at, out, tall }) => (
  <>
    <AbsoluteFillDay at={at} />
    <Label text="free · open source" at={at + 0.5} out={out} y={tall ? 36.5 : 31} />
    <Line text={tall ? 'software / you *own,* / not rent.' : 'software you *own,* / not rent.'} at={at + 0.15} out={out} size={tall ? 9 : 8.4} y={tall ? 47 : 49} />
  </>
);
import { useCurrentFrame } from 'remotion';
import { FPS } from './brand';
import { ramp } from './kit';
/** The lavender field fading up under a section that begins after footage. */
const AbsoluteFillDay: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  if (frame < at * FPS - 12) return null;
  return <AbsoluteFill style={{ opacity: ramp(frame, at - 0.4, at) }}><Day /></AbsoluteFill>;
};

// ------------------------------------------------------------------ the 30-second cut (16:9)
export const Hero30: React.FC = () => (
  <AbsoluteFill>
    <Score name="hero30-mix" />
    <Night />
    <Ledger at={0.1} out={4.9} items={RENTED} />
    <Line dark text="for twenty years, software has been / something you *rent.*" at={0.4} out={4.75} size={5.2} />
    <Typing dark text="build me a page that runs my house" at={4.8} start={5.0} end={6.9} out={7.7} />
    <Bloom at={7.2}>
      <Typing text="build me a page that runs my house" at={4.8} start={5.0} end={6.9} dockAt={7.4} out={14.35} />
      <Stage at={7.7} out={14.35} box={WIDE} shots={[...homeBuilt('ask-home')(7.7, 9.9), ...homePage('page-home')(9.9, 14.35)]} />
    </Bloom>
    <Ask T={14.4} len={4.75} text="make it feel like golden hour" shots={themeSwaps('ask-theme', [16.8])} typeFor={1.1} />
    <Wall at={19.15} out={24.1} stills={WALL} cols={4} rows={4} dim={[[20.0, 23.9]]} />
    <Line text="everyone who installs it / can *change* it." at={20.2} out={23.8} size={6.2} />
    <AbsoluteFillDay at={24.0} />
    <Line text="software you *own,* / not rent." at={24.1} out={26.9} size={8.4} y={49} />
    <EndCard at={27.0} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ shorts (9:16, 15-20 s)
/** "house": one sentence becomes a page that runs a home. Score short15a (bloom at 2.4). */
export const ShortHouse: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-house-mix" />
    <Night />
    <Typing dark text="build me a page that runs my house" at={0} start={0.35} end={2.15} out={2.9} size={6.6} maxWidth={80} y={44} />
    <Bloom at={2.4} cy={44}>
      <Typing text="build me a page that runs my house" at={0} start={0.35} end={2.15} dockAt={2.6} out={9.55} size={6.6} maxWidth={80} y={44} dockY={17.6} dockSize={3.3} />
      <Stage at={2.9} out={9.55} box={TALL} radius={2.4} shots={[...homeBuilt('ask-home-phone')(2.9, 4.8), ...homePage('page-home-phone', 'living')(4.8, 9.55)]} />
    </Bloom>
    <AbsoluteFillDay at={9.6} />
    <Line text="ask for it. / it's *yours.*" at={9.65} out={11.95} size={9.5} y={46} />
    <EndCard at={12.0} />
  </AbsoluteFill>
);
/** "yours": the whole app changes its look on the beat. Score short15b (pulse from 0, peak at 4.8). */
export const ShortYours: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-yours-mix" />
    <Day />
    <Typing text="make it feel like golden hour" at={0} start={0.15} end={1.35} dockAt={1.5} out={11.95} size={6.6} maxWidth={80} y={44} dockY={17.6} dockSize={3.3} />
    <Stage at={1.7} out={11.95} box={TALL} radius={2.4} shots={themeSwaps('ask-theme-phone', [4.8, 6.0, 7.2, 8.4, 9.6, 10.8])(1.7, 11.95)} />
    <EndCard at={12.0} />
  </AbsoluteFill>
);
// WHY the opening lines of "rent" and "founder" are size 5.4: at 7.6 each written row was wider than a phone
// screen and re-wrapped, stranding single words ("built", "been") on lines of their own.
/** "rent": the campaign's argument in fifteen seconds. Score short15c (bloom at 4.8). */
export const ShortRent: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-rent-mix" />
    <Night />
    <Ledger at={0} out={4.9} items={RENTED} />
    <Line dark text="for twenty years, / software has been / something you *rent.*" at={0.3} out={4.75} size={5.4} maxWidth={90} y={45} />
    <Bloom at={4.8} cy={45}>
      <Line text="now you can / just *ask.*" at={4.95} out={7.15} size={9.5} y={45} />
      <Stage at={7.2} out={9.6} box={{ ...TALL, y: 17, h: 62 }} radius={2.4} enter="rise" shots={[{ clip: 'page-home-phone', from: mark('page-home-phone', 'lamp') - 0.9, at: 7.2, out: 9.6 }]} />
      <Stage at={9.55} out={11.95} box={{ ...TALL, y: 17, h: 62 }} radius={2.4} enter="fade" shots={[{ clip: 'page-money-phone', from: mark('page-money-phone', 'spending') - 0.9, at: 9.55, out: 11.95 }]} />
    </Bloom>
    <EndCard at={12.0} />
  </AbsoluteFill>
);
/** "founder": how the app itself was made. Score short20 (bloom at 4.8, stance at 14.4, end at 16.8). */
export const ShortFounder: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-founder-mix" />
    <Night />
    <Line dark text="this app was built / by someone who has / never written *code.*" at={0.3} out={4.75} size={5.4} maxWidth={90} y={45} />
    <Bloom at={4.8} cy={45}>
      <Line text="entirely by *asking.*" at={4.95} out={7.15} size={10.5} y={45} />
      <Ask tall T={7.2} len={7.15} text="make it feel like golden hour" typeFor={1.1} shots={themeSwaps('ask-theme-phone', [9.6, 10.8, 12.0, 13.2])} />
    </Bloom>
    <AbsoluteFillDay at={14.4} />
    <Line text="now it's / *your* turn." at={14.45} out={16.75} size={10.5} y={46} />
    <EndCard at={16.8} />
  </AbsoluteFill>
);
