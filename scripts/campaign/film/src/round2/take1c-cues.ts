// Take 1C ("a book that tells itself"): every page turn, ink stroke and headline is timed from the
// narrator's recorded word timings, never from typed seconds.
// WHY phrases: a cue names a short phrase from the script and reads the starred word's start from the
// timing file, so a re-recorded voice re-times the whole film. A phrase that is no longer spoken stops
// the render with a message naming the cue, instead of silently drifting off the words.
import raw from './take1-words-lily.json';

type Word = { w: string; start: number; end: number };
const WORDS = raw as Word[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z'-]/g, '');
const TOKENS = WORDS.map((x) => norm(x.w));

const find = (name: string, phrase: string, nth: number): Word => {
  const parts = phrase.split(/\s+/);
  const mark = Math.max(0, parts.findIndex((p) => p.startsWith('*')));
  const want = parts.map(norm);
  let seen = 0;
  for (let i = 0; i + want.length <= TOKENS.length; i++) {
    if (want.every((w, j) => TOKENS[i + j] === w) && ++seen === nth) return WORDS[i + mark];
  }
  throw new Error(`take1c cue "${name}": the phrase "${phrase.replace(/\*/g, '')}"${nth > 1 ? ` (#${nth})` : ''} is not in the narration timings. ` +
    'The script or recording changed: update this cue in take1c-time.ts.');
};
/** Start (seconds) of the starred word of `phrase` (or its first word). */
export const T = (name: string, phrase: string, nth = 1) => find(name, phrase, nth).start;
/** End (seconds) of the starred word of `phrase`. */
export const E = (name: string, phrase: string, nth = 1) => find(name, phrase, nth).end;
/** When the narrator stops talking. */
export const LAST_WORD_END = WORDS[WORDS.length - 1].end;
