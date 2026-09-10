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
export const PRELUDE = 150;                             // the punch; see intro/Intro.tsx IMPACT (236 → 196 on 2026-09-04: the silent open ran 8 s; → 150 on 2026-09-09: a quicker, surer walk-in)
export const PRE = 6;                                   // frames of the wipe before the downbeat (200 ms)
export const POST = 4;                                  // …and after it (133 ms); a 333 ms wipe in all
export const CUT = PRE + POST;
// The music runs 2.5 s past bar 42; TAIL_FRAMES holds the LAST beat open for it.
export const TAIL_FRAMES = 74;
export type Transition = 'wipe' | 'cut' | 'none';
export type BeatId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8' | 'b9' | 'b10';
export type Beat = { id: BeatId; bars: [number, number]; after: Transition };
// Re-cut 2026-09-04 to Destin's script edits and his section order (the script editor's
// submit: 1 → 3 → 4 → 5 → 9 → 2 → 6 → 8 → 7 → 10). Every section is sized to its new lines
// (a bubble needs 1.2 s + ¼ s a word). Beats name their moments in bars RELATIVE to their own
// start (beat.ts `B(id, k)`), so a reorder here is the only edit.
// Re-cut again 2026-09-09 (Destin: "just a little faster … a quick guided tour", keep the content):
// 112 → 120 BPM (a bar is 2.0 s, 60 frames), 53 → 51 bars — the theme beat and the games beat each
// lose a bar — then 49 (the conversations beat: two lines, four bars) — and every beat's moments were re-timed to the shorter bars. The lines are unchanged;
// each still gets its reading time, which is what sets the floor on every beat's length.
export const BEATS: Beat[] = [
  { id: 'b1', bars: [0, 5], after: 'cut' },             // the punch intro; two hello lines under the settled window (bars 1–5)
  { id: 'b3', bars: [5, 10], after: 'wipe' },           // describe a look: the request over bars 5–7, golden on 7 (drop 1), strawberry on 8, devil's garden on 9
  { id: 'b4', bars: [10, 14], after: 'wipe' },          // any AI, cloud or local (crème)
  { id: 'b5', bars: [14, 20], after: 'wipe' },          // collaborate on a sheet, then project view (meadow mist)
  { id: 'b9', bars: [20, 25], after: 'wipe' },          // the marketplace, on drop 2 (light)
  { id: 'b2', bars: [25, 29], after: 'wipe' },          // repeatable prompts: the chips (cotton candy)
  { id: 'b6', bars: [29, 36], after: 'wipe' },          // games (golden sunbreak): lobby, connect 4, chess, flappy
  { id: 'b8', bars: [36, 41], after: 'wipe' },          // resume on your phone (devil's garden); the take-over prompt is cut
  { id: 'b7', bars: [41, 45], after: 'wipe' },          // status while the switcher is open, then tag/search/filter (midnight) — 4 bars since 2026-09-09
  { id: 'b10', bars: [45, 49], after: 'none' },         // close (golden sunbreak): the window fills the frame, the modal
];
export const TOTAL_BARS_PLANNED = 49;
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
