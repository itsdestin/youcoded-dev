// The beat list and the arithmetic that keeps every cut on a downbeat.
//
// A TransitionSeries transition OVERLAPS its neighbours by its length, so each
// sequence is padded by exactly the transition around it — pad by anything
// else and every later beat drifts (the first draft padded a 2-frame fade by
// 6 and landed the theme drop 4 frames late).
//
// Round 6 (the re-cut): a transition that STARTS on the downbeat reads late,
// because the eye registers the new shot only once the wipe is mostly across.
// So the wipe now straddles the beat: it starts PRE frames BEFORE the downbeat
// and ends POST frames after, and the incoming shot has the majority of the
// frame exactly on the beat. The price is that every beat except the first
// begins PRE frames before its own downbeat — beat components must place
// in-beat anchors at `local(bar)` (below), never at barFrame(bar) - barFrame(start).
export const PRE = 6;                                   // frames of the wipe before the downbeat (200 ms)
export const POST = 4;                                  // …and after it (133 ms); a 333 ms wipe in all
export const CUT = PRE + POST;
// The music is 71.65 s but the bar grid only runs to bar 34 = frame 2075
// (69.17 s). TAIL_FRAMES holds the LAST beat open for the rest of the audio;
// no transition follows it, so nothing else on the timeline moves.
export const TAIL_FRAMES = 74;
export type Transition = 'wipe' | 'cut' | 'none';   // 'cut': same overlap maths, no visible wipe (beat 1 → 2 is the same window)
export type BeatId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8';
export type Beat = { id: BeatId; bars: [number, number]; after: Transition };
export const BEATS: Beat[] = [
  { id: 'b1', bars: [0, 2], after: 'cut' },             // cold open (midnight) → the same window: a hard cut, the host bounces on the beat
  { id: 'b2', bars: [2, 5], after: 'wipe' },            // one tap (midnight)
  { id: 'b3', bars: [5, 8], after: 'wipe' },            // the spreadsheet (meadow mist)
  { id: 'b4', bars: [8, 14], after: 'wipe' },           // games with friends (halftone dimension)
  { id: 'b5', bars: [14, 18], after: 'wipe' },          // manage your conversations (kuromi dreamer)
  { id: 'b6', bars: [18, 22], after: 'wipe' },          // laptop → phone → take over (devil's garden)
  { id: 'b7', bars: [22, 29], after: 'wipe' },          // the theme request under bar 22, flips on 23 / 25 / 27
  { id: 'b8', bars: [29, 34], after: 'none' },          // close (golden sunbreak)
];
export const isFirst = (b: Beat) => b === BEATS[0];
export const isLast = (b: Beat) => b === BEATS.at(-1);
/** Frames a beat's sequence starts before its own downbeat. */
export const preFrames = (b: Beat) => (isFirst(b) ? 0 : PRE);
export const postFrames = (b: Beat) => (b.after === 'none' ? 0 : POST);
export const transitionFrames = (b: Beat) => (b.after === 'none' ? 0 : CUT);
export const tailFrames = (b: Beat) => (isLast(b) ? TAIL_FRAMES : 0);
export const sequenceFrames = (b: Beat, barFrame: (bar: number) => number) =>
  barFrame(b.bars[1]) - barFrame(b.bars[0]) + preFrames(b) + postFrames(b) + tailFrames(b);
/** First frame of each beat's SEQUENCE in the finished composition (its downbeat is preFrames later). */
export function startFrames(barFrame: (bar: number) => number): number[] {
  let t = 0;
  return BEATS.map((b) => { const s = t; t += sequenceFrames(b, barFrame) - transitionFrames(b); return s; });
}
/**
 * The LOCAL frame (inside the beat's own sequence) of an absolute bar. This is
 * the only correct way to anchor anything inside a beat: it is the difference
 * of two ABSOLUTE bar frames (barFrame rounds, so a relative bar can land a
 * frame off) plus the frames the sequence runs before its downbeat.
 */
export const localFrame = (b: Beat, bar: number, barFrame: (bar: number) => number) =>
  barFrame(bar) - barFrame(b.bars[0]) + preFrames(b);
/** The beat's own length in frames — what its shots must cover. */
export const beatFrames = (b: Beat, barFrame: (bar: number) => number) => sequenceFrames(b, barFrame);
