// The beat list and the arithmetic that keeps every cut on a downbeat.
//
// A TransitionSeries transition OVERLAPS its neighbours by its length, so each
// sequence is padded by exactly the transition around it — pad by anything
// else and every later beat drifts.
//
// The wipe straddles the beat: it starts PRE frames BEFORE the downbeat and
// ends POST frames after, so the incoming shot owns most of the frame exactly
// on the beat. Every beat except the first therefore begins PRE frames before
// its own downbeat; in-beat anchors go through localFrame(), never
// barFrame(bar) - barFrame(start).
//
// Round three: the film opens with a SILENT PRELUDE — black, the wordmark, the
// host walking in — and the music starts on the frame the host punches the
// wordmark. That frame is bar 0. PRELUDE is how many frames come before it;
// the first beat carries them, and every absolute bar sits PRELUDE later.
export const PRELUDE = 236;                             // the punch; see intro/Intro.tsx IMPACT
export const PRE = 6;                                   // frames of the wipe before the downbeat (200 ms)
export const POST = 4;                                  // …and after it (133 ms); a 333 ms wipe in all
export const CUT = PRE + POST;
// The music runs 2.5 s past bar 44; TAIL_FRAMES holds the LAST beat open for it.
export const TAIL_FRAMES = 74;
export type Transition = 'wipe' | 'cut' | 'none';
export type BeatId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8' | 'b9' | 'b10';
export type Beat = { id: BeatId; bars: [number, number]; after: Transition };
export const BEATS: Beat[] = [
  { id: 'b1', bars: [0, 2], after: 'cut' },             // the punch intro (prelude + bars 0–1); cotton candy from the hit
  { id: 'b2', bars: [2, 5], after: 'wipe' },            // just ask (cotton candy)
  { id: 'b3', bars: [5, 10], after: 'wipe' },           // describe a look: golden on 6, strawberry on 7, kuromi on 8
  { id: 'b4', bars: [10, 13], after: 'wipe' },          // pick your model (crème)
  { id: 'b5', bars: [13, 18], after: 'wipe' },          // files, then project view on 16 (meadow mist)
  { id: 'b6', bars: [18, 24], after: 'wipe' },          // games with friends (halftone)
  { id: 'b7', bars: [24, 28], after: 'wipe' },          // manage your conversations (midnight)
  { id: 'b8', bars: [28, 33], after: 'wipe' },          // pick up on any device (devil's garden)
  { id: 'b9', bars: [33, 38], after: 'wipe' },          // the marketplace, on drop 2 (light)
  { id: 'b10', bars: [38, 44], after: 'none' },         // close (golden sunbreak)
];
export const isFirst = (b: Beat) => b === BEATS[0];
export const isLast = (b: Beat) => b === BEATS.at(-1);
/** Frames a beat's sequence runs before its own first downbeat (the prelude for the first beat, the wipe's lead for the rest). */
export const preFrames = (b: Beat) => (isFirst(b) ? PRELUDE : PRE);
export const postFrames = (b: Beat) => (b.after === 'none' ? 0 : POST);
export const transitionFrames = (b: Beat) => (b.after === 'none' ? 0 : CUT);
export const tailFrames = (b: Beat) => (isLast(b) ? TAIL_FRAMES : 0);
export const sequenceFrames = (b: Beat, barFrame: (bar: number) => number) =>
  barFrame(b.bars[1]) - barFrame(b.bars[0]) + preFrames(b) + postFrames(b) + tailFrames(b);
/** First frame of each beat's SEQUENCE in the finished composition. */
export function startFrames(barFrame: (bar: number) => number): number[] {
  let t = 0;
  return BEATS.map((b) => { const s = t; t += sequenceFrames(b, barFrame) - transitionFrames(b); return s; });
}
/** The LOCAL frame (inside the beat's own sequence) of an absolute bar. */
export const localFrame = (b: Beat, bar: number, barFrame: (bar: number) => number) =>
  barFrame(bar) - barFrame(b.bars[0]) + preFrames(b);
/** The beat's full length in frames — what its shots must cover. */
export const beatFrames = (b: Beat, barFrame: (bar: number) => number) => sequenceFrames(b, barFrame);
/** Absolute frame of a bar's downbeat in the finished film. */
export const absBar = (bar: number, barFrame: (bar: number) => number) => PRELUDE + barFrame(bar);
