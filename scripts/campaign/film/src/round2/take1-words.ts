// Take 1: every cue in the film comes from the narrator's word timings, never from typed seconds.
// WHY: the first two attempts were "completely offbeat" because pictures were placed by hand-typed
// times. Here a cue names a word ("computers", 2nd time it is said) and reads its start from the
// recording's timing file, so re-recording the voice re-times the whole film automatically.
import raw from './take1-words-lily.json';

export type Word = { w: string; start: number; end: number };
export const WORDS = raw as Word[];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z'-]/g, '');

/** The nth time a word is spoken (1-based). Throws if the script changed, so a stale cue can't fail silently. */
export const word = (w: string, nth = 1): Word => {
  let n = 0;
  for (const x of WORDS) if (norm(x.w) === norm(w) && ++n === nth) return x;
  throw new Error(`take1: the word "${w}" (#${nth}) is not in the narration timings`);
};
/** When a word starts / ends, in seconds. */
export const T = (w: string, nth = 1) => word(w, nth).start;
export const E = (w: string, nth = 1) => word(w, nth).end;
export const indexOf = (w: string, nth = 1) => WORDS.indexOf(word(w, nth));

// ---------- the muted version's captions ----------
// WHY blocks end on these words: each is the end of one spoken sentence (or clause), so a caption is
// always a whole thought. The final "to open source everything." is not a caption: it becomes the
// film's closing headline in both versions.
const BLOCK_ENDS: [string, number][] = [
  ['technology', 1], ['data', 1], ['nothing', 1], ['happened', 2], ['intelligence', 1], ['value', 1],
  ['control', 1], ['asks', 1], ['decide', 1], ['data', 2], ['past', 1], ['last', 1],
];

export type Caption = { text: string; at: number; out: number; words: number };

/** Captions with their on-screen times. Each stays up at least 1.2 s + 0.25 s per word (brand guide §8):
 *  when a sentence is spoken faster than that, its caption holds and the next one starts a little late. */
export const captions = (finalIn: number): Caption[] => {
  const out: Caption[] = [];
  let from = 0;
  BLOCK_ENDS.forEach(([w, n]) => {
    const to = indexOf(w, n);
    const ws = WORDS.slice(from, to + 1);
    out.push({ text: ws.map((x) => x.w).join(' '), at: ws[0].start - 0.12, out: 0, words: ws.length });
    from = to + 1;
  });
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const need = 1.2 + 0.25 * c.words;
    const nextIn = i + 1 < out.length ? out[i + 1].at : finalIn;
    c.out = Math.max(nextIn, c.at + need);
    if (i + 1 < out.length && out[i + 1].at < c.out) out[i + 1].at = c.out;
  }
  return out;
};
