// The beat list and the one piece of arithmetic that keeps every cut on a
// downbeat. A TransitionSeries transition OVERLAPS its neighbours by its
// length, so each sequence is padded by exactly the transition that FOLLOWS
// it — pad by anything else and every later beat drifts (the first draft of
// this plan padded a 2-frame fade by 6 and landed the theme drop 4 frames late).
// Round 3: 6 frames read LATE. A slide that STARTS on the downbeat is only half
// done 100 ms after it, so the eye registers the change after the beat rather
// than on it. 4 frames (133 ms) still reads as a move, not a jump cut, and lands
// the visible change inside the same 1/8 note. The transition still starts on
// the downbeat — no lead-in offset — because beat-internal anchors (beat 7's
// theme flip, beat 8's link) are nailed to their bars and must not shift.
export const CUT = 4;                                   // frames: a 133 ms slide; the spec caps transitions at 250 ms
export type Transition = 'slide' | 'slide-up' | 'none';
export type Beat = { id: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8'; bars: [number, number]; after: Transition };
export const BEATS: Beat[] = [
  { id: 'b1', bars: [0, 2], after: 'slide' },           // cold open
  { id: 'b2', bars: [2, 6], after: 'slide' },           // quick chip
  { id: 'b3', bars: [6, 10], after: 'slide' },          // spreadsheet
  { id: 'b4', bars: [10, 14], after: 'slide-up' },      // Flappy
  { id: 'b5', bars: [14, 16], after: 'slide' },         // the drag (the break)
  { id: 'b6', bars: [16, 21], after: 'slide' },         // remote → phone → takeover (the build + half-time groove)
  { id: 'b7', bars: [21, 29], after: 'slide' },         // ONE continuous clip: the theme request typed under bars 21–22, the flip on bar 23's downbeat
  { id: 'b8', bars: [29, 34], after: 'none' },          // close
];
export const transitionFrames = (b: Beat) => (b.after === 'none' ? 0 : CUT);
export const sequenceFrames = (b: Beat, barFrame: (bar: number) => number) => barFrame(b.bars[1]) - barFrame(b.bars[0]) + transitionFrames(b);
/** First frame of each beat in the finished composition. */
export function startFrames(barFrame: (bar: number) => number): number[] {
  let t = 0;
  return BEATS.map((b) => { const s = t; t += sequenceFrames(b, barFrame) - transitionFrames(b); return s; });
}
