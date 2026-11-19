// The films. Each is a timeline in seconds, cut to the score: one bar is 2.4 s (100 BPM), and
// every section starts on a bar line (see ../music). Text obeys the brand guide's reading rule:
// on screen at least 1.2 s + 0.25 s per word, so every film works with the sound off.
import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { Bloom, Day, EndCard, Fine, Ledger, Line, Night, Shot, Stage, Typing, Wall, mark } from './kit';
import stills from './stills.json';

// WHY this list (review, 2026-11-18): only things commonly sold by monthly subscription. Email, calendar and maps
// were removed: they are usually free, and "billed monthly" beside them read as a false claim about other products.
const RENTED = ['documents', 'photos', 'storage', 'music', 'smart home', 'budgeting', 'notes', 'passwords', 'video', 'backup', 'design', 'films', 'fitness', 'games'];
const WIDE = { x: 17.5, y: 16.6, w: 65, h: 72.2 };           // the app window in a 16:9 frame (room below for the small print)
// WHY phone-shaped (w 62): the wider card showed only the top half of the phone screen and sliced the thermostat dial.
const TALL = { x: 19, y: 24.5, w: 62, h: 52.5 };             // the app card in a 9:16 frame (clear of the top 12% and bottom 20%)
const FINE_WIDE = 92.2, FINE_TALL = 78.7;                     // where the small print sits under each
const SPED = 'sped up · sample data';
const SPED_HOME = 'sped up · sample data · home control works with Home Assistant';
const Score: React.FC<{ name: string }> = ({ name }) => <Audio src={staticFile(`audio/${name}.wav`)} />;
// Every still, chat included: the wall needs as many different pictures as there are (20), or it reads as six repeated.
// The Finance stills are left out: their practice data shows a negative balance and a credit warning, the wrong mood for an advert.
const WALL = (stills as string[]).filter((s) => !/page-money/.test(s));

/** One "ask": a sentence typed on the lavender field, which rises to become the caption as the
 *  result appears beneath it. `T` is the bar line it starts on; it lasts `len` seconds. */
const Ask: React.FC<{ T: number; len: number; text: string; shots: (t0: number, t1: number) => Shot[]; tall?: boolean; typeFor?: number; note?: string }> = ({ T, len, text, shots, tall, typeFor = 1.2, note }) => {
  const stageAt = T + typeFor + 0.25, out = T + len - 0.05;
  return (
    <>
      <Typing text={text} at={T} start={T + 0.1} end={T + 0.1 + typeFor} dockAt={T + typeFor + 0.15} out={out}
        size={tall ? 4.4 : 4.6} y={tall ? 45 : 47} maxWidth={tall ? 92 : 84} dockY={tall ? 17.6 : 10.5} dockSize={tall ? 3.3 : 2.3} />   {/* tall 4.4: the sentence stays on ONE line, so no word is stranded */}
      <Stage at={stageAt} out={out} box={tall ? TALL : WIDE} shots={shots(stageAt, out)} radius={tall ? 2.4 : 1.6} />
      {note && <Fine text={note} at={stageAt} out={out} y={tall ? FINE_TALL : FINE_WIDE} />}
    </>
  );
};

// The shots, shared by every cut. Each takes the stretch of film it must fill.
// WHY these play at true speed and never splice mid-action (review, 2026-11-18): the first cut sped the chat up
// and jumped between two moments of the Home page, so a lamp flicked off-on-off and the thermostat leapt.
/** The last moment of the build: "Created 2 files", then "Home is ready". */
const homeBuilt = (clip: string) => (t0: number, t1: number): Shot[] => [{ clip, from: mark(clip, 'end') - (t1 - t0) + 0.25, at: t0, out: t1 }];
/** The page in use, one continuous take starting just before the lamp is switched. */
const homePage = (clip: string) => (t0: number, t1: number): Shot[] => [{ clip, from: mark(clip, 'lamp') - 0.9, at: t0, out: t1, cut: true }];
/** The reply finishing, then the whole app changing its look on the beat (`beats` = swap times). */
const themeSwaps = (clip: string, beats: number[]) => (t0: number, t1: number): Shot[] => {
  // Never start before the message is sent: an empty chat under the typed caption read as a mismatch.
  const s: Shot[] = [{ clip, from: Math.max(mark(clip, 'send') - 0.05, mark(clip, 'built', 'end') - (beats[0] - t0) + 0.1), at: t0, out: beats[0] }];
  // the last look is held, so it drifts in very slightly rather than sitting dead still
  beats.forEach((b, i) => s.push({ clip, from: mark(clip, `swap${i + 1}`) - 0.04, at: b, out: beats[i + 1] ?? t1, zoom: i === beats.length - 1 ? [1, 1.035] : undefined }));
  return s;
};

// ------------------------------------------------------------------ the 60-second film (16:9)
// Score hero60: rent 0 · breath 9.6 · ask 12.0 · bloom 14.4 · pulse 21.6 · peak 36.0 · stance 48.0 · end 55.2.
// WHY this shape (reviews, 2026-11-18): the first cut ran four demos back to back and read as a feature tour.
// Now: the problem (rent), one ask that becomes a page, one ask that changes the look, then what it MEANS
// (it stays on your devices; nobody can take it back; everyone can change and share it), then the line.
export const Hero60: React.FC = () => (
  <AbsoluteFill>
    <Score name="hero60-mix" />
    <Night />
    <Ledger at={0.2} out={8.8} items={RENTED} />
    <Line dark text="for twenty years, software has been / something you *rent.*" at={0.3} out={4.55} size={5.2} />
    <Line dark text="pay forever. / own *nothing.*" at={4.75} out={8.7} size={8.8} />
    <Line dark text="now you can just *ask.*" at={8.9} out={11.95} size={5.2} />
    <Typing dark text="build me a page that runs my house" at={12.0} start={12.25} end={14.15} out={14.9} />
    <Bloom at={14.4}>
      <Typing text="build me a page that runs my house" at={12.0} start={12.25} end={14.15} dockAt={14.6} out={21.55} />
      <Stage at={14.9} out={21.55} box={WIDE} shots={[...homeBuilt('ask-home')(14.9, 16.3), ...homePage('page-home')(16.3, 21.55)]} />
      <Fine text={SPED_HOME} at={14.9} out={21.55} y={FINE_WIDE} />
    </Bloom>
    {/* 21.6-27.4: the look. The whole app turns to sunset on the bar line and is held. WHY it ends at 27.4: the take
        itself moves on to another look 3.6 s after the sunset, and holding longer showed that as a glitch. */}
    <Ask T={21.6} len={5.85} typeFor={1.1} text="make it feel like sunset" note={SPED} shots={themeSwaps('ask-theme', [24.0])} />
    {/* 27.5-36.0: what that means. WHY these words: an earlier "stays on your devices" is not true today (chats go to
        an AI provider); "is yours" and "open source, nobody can lock you out" are (MIT licence, your own files). */}
    <Line text="what you make / is *yours.*" at={27.55} out={31.5} size={8.8} />
    <Line text="it's open source. / nobody can lock you *out.*" at={31.7} out={35.9} size={7} />
    {/* 36.0-48.0: it is not one app, it is everyone's */}
    <Wall at={35.95} out={48.1} stills={WALL} cols={4} rows={4} dim={[[36.6, 41.3], [41.5, 45.5]]} />
    <Line text="everyone who installs it / can *change* it." at={36.9} out={41.1} size={6.2} />
    <Line text="and *share* what they made." at={41.6} out={45.3} size={6.2} />
    {/* 48.0-55.2: the stance */}
    <AbsoluteFillDay at={48.0} />
    <Line text="ask for it. / it's *yours.*" at={48.15} out={51.4} size={9.6} />
    <Line text="software you *own,* / not rent." at={51.6} out={55.1} size={9.6} />
    <EndCard at={55.2} />
  </AbsoluteFill>
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
// Score hero30: rent 0 · ask 4.8 · bloom 7.2 · pulse 12.0 · peak 16.8 · stance 21.6 · end 26.4.
export const Hero30: React.FC = () => (
  <AbsoluteFill>
    <Score name="hero30-mix" />
    <Night />
    <Ledger at={0.1} out={4.7} items={RENTED} />
    <Line dark text="for twenty years, software has been / something you *rent.*" at={0.3} out={4.7} size={5.2} />
    <Typing dark text="build me a page that runs my house" at={4.8} start={5.0} end={6.9} out={7.7} />
    <Bloom at={7.2}>
      <Typing text="build me a page that runs my house" at={4.8} start={5.0} end={6.9} dockAt={7.4} out={11.95} />
      <Stage at={7.7} out={11.95} box={WIDE} shots={[...homeBuilt('ask-home')(7.7, 8.8), ...homePage('page-home')(8.8, 11.95)]} />
      <Fine text={SPED_HOME} at={7.7} out={11.95} y={FINE_WIDE} />
    </Bloom>
    <Ask T={12.0} len={4.75} text="make it feel like sunset" shots={themeSwaps('ask-theme', [14.4])} typeFor={1.0} note={SPED} />
    <Wall at={16.75} out={21.7} stills={WALL} cols={4} rows={4} dim={[[17.2, 21.6]]} />
    <Line text="everyone who installs it / can *change* it." at={17.5} out={21.45} size={6.2} />
    <AbsoluteFillDay at={21.6} />
    <Line text="software you *own,* / not rent." at={21.75} out={26.35} size={9.6} y={47} />
    <EndCard at={26.4} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ shorts (9:16, 15-20 s)
/** "house": one sentence becomes a page that runs a home. Score short15a: bloom 2.4 · stance 7.2 · lift 9.6 · end 12.0. */
export const ShortHouse: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-house-mix" />
    <Night />
    <Typing dark text="build me a page that runs my house" at={0} start={0.2} end={2.0} out={2.9} size={5.4} maxWidth={88} y={44} />
    <Bloom at={2.4} cy={44}>
      <Typing text="build me a page that runs my house" at={0} start={0.2} end={2.0} dockAt={2.6} out={7.15} size={5.4} maxWidth={88} y={44} dockY={17.6} dockSize={2.7} />
      <Stage at={2.9} out={7.15} box={TALL} radius={2.4} shots={[...homeBuilt('ask-home-phone')(2.9, 4.0), ...homePage('page-home-phone')(4.0, 7.15)]} />
      <Fine text={SPED} at={2.9} out={7.15} y={FINE_TALL} />
    </Bloom>
    <AbsoluteFillDay at={7.2} />
    {/* one line held, with the campaign line joining under it on the score's lift at 9.6: both get full reading time */}
    <Line text="ask for it. / it's *yours.*" at={7.3} out={11.95} size={9.5} y={42} stagger={0.04} />
    <Line text="software you own, not rent." at={9.65} out={11.95} size={3.5} y={57} weight={700} stagger={0.03} />
    <EndCard at={12.0} />
  </AbsoluteFill>
);
/** "yours": one sentence changes the whole app's look. Score short15b: pulse 0 · peak 4.8 · stance 7.2 · end 12.0. */
export const ShortYours: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-yours-mix" />
    <Day />
    <Typing text="make it feel like sunset" at={0} start={0.15} end={1.15} dockAt={1.3} out={7.15} size={4.4} maxWidth={92} y={44} dockY={17.6} dockSize={3.3} />
    <Stage at={1.5} out={7.15} box={TALL} radius={2.4} shots={themeSwaps('ask-theme-phone', [4.8])(1.5, 7.15)} />
    <Fine text={SPED} at={1.5} out={7.15} y={FINE_TALL} />
    <AbsoluteFillDay at={7.2} />
    <Line text="your app should / look like *you.*" at={7.3} out={11.95} size={6.2} maxWidth={92} y={46} />
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
    <Line dark text="for twenty years, / software has been / something you *rent.*" at={0.05} out={4.75} size={5.4} maxWidth={90} y={45} />
    <Bloom at={4.8} cy={45}>
      <Line text="now you can / just *ask.*" at={4.95} out={8.3} size={8} maxWidth={90} y={45} stagger={0.04} />
      <Stage at={8.35} out={11.95} box={TALL} radius={2.4} enter="rise" shots={homePage('page-home-phone')(8.35, 11.95)} />
      <Fine text={SPED} at={8.35} out={11.95} y={FINE_TALL} />
    </Bloom>
    <EndCard at={12.0} />
  </AbsoluteFill>
);
/** "founder": how the app itself was made. Score short20: bloom 4.8 · pulse 7.2 · stance 12.0 · end 16.8. */
export const ShortFounder: React.FC = () => (
  <AbsoluteFill>
    <Score name="short-founder-mix" />
    <Night />
    <Line dark text="this app was built / by someone who has / never written *code.*" at={0.3} out={4.75} size={5.4} maxWidth={90} y={45} />
    <Bloom at={4.8} cy={45}>
      <Line text="entirely by *asking.*" at={4.95} out={7.15} size={10.5} y={45} stagger={0.03} />
      <Ask tall T={7.2} len={4.75} text="make it feel like sunset" typeFor={1.0} shots={themeSwaps('ask-theme-phone', [9.6])} note={SPED} />
    </Bloom>
    <AbsoluteFillDay at={12.0} />
    <Line text="ask for / *yours.*" at={12.15} out={16.75} size={12} y={46} />
    <EndCard at={16.8} />
  </AbsoluteFill>
);
