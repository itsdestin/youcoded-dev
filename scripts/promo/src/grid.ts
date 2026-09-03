// The music's beat grid, written by the sequencer in music/. Every cut, caption
// hit and the theme flip is placed on a bar boundary computed here — never on a
// hand-counted second.
import grid from '../public/promo.grid.json';
export const FPS = 30;
export const BAR_S = grid.bar_seconds as number;
export const BEAT_S = grid.beat_seconds as number;
export const TOTAL_BARS = grid.bars as number;
/** First frame of bar `b` (fractional bars allowed: 2.5 = the third beat of bar 2). */
export const barFrame = (b: number) => Math.round(b * BAR_S * FPS);
export const TOTAL_FRAMES = barFrame(TOTAL_BARS);
