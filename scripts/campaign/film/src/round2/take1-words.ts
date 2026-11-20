// Take 1: every cue in the film comes from the narrator's word timings, never from typed seconds.
// WHY: the first attempts were "completely offbeat" because pictures were placed by hand-typed times.
// Here a cue names a short PHRASE from the script ("truly *wonderful") and reads the starred word's
// start from the recording's timing file. Phrases, not "the 4th 'what'": the owner is still editing the
// script, and an added line shifts every word count but rarely breaks a three-word phrase. Re-recording
// the voice re-times the whole film automatically; a phrase that no longer exists stops the render with
// a message naming the cue, so fixing it is one edit.
import raw from './take1-words-lily.json';

export type Word = { w: string; start: number; end: number };
export const WORDS = raw as Word[];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z'-]/g, '');
const TOKENS = WORDS.map((x) => norm(x.w));

/** The word marked with * in `phrase` (or its first word), found where the whole phrase is spoken in order.
 *  `nth` picks a later occurrence when a phrase is said more than once. */
export const cueWord = (name: string, phrase: string, nth = 1): Word => {
  const parts = phrase.split(/\s+/);
  const mark = Math.max(0, parts.findIndex((p) => p.startsWith('*')));
  const want = parts.map(norm);
  let seen = 0;
  for (let i = 0; i + want.length <= TOKENS.length; i++) {
    if (want.every((w, j) => TOKENS[i + j] === w) && ++seen === nth) return WORDS[i + mark];
  }
  throw new Error(`take1 cue "${name}": the phrase "${phrase.replace(/\*/g, '')}"${nth > 1 ? ` (#${nth})` : ''} is not in the narration timings. ` +
    'The script or recording changed: update this cue in take1.tsx (search for its name).');
};
/** When a cue's word starts / ends, in seconds. */
export const T = (name: string, phrase: string, nth = 1) => cueWord(name, phrase, nth).start;
export const E = (name: string, phrase: string, nth = 1) => cueWord(name, phrase, nth).end;

// ---------- the muted version's captions ----------
export type Caption = { text: string; at: number; out: number; words: number };

/** Captions built from the recording itself: one per spoken sentence, so a rewritten script re-captions
 *  itself. Rules: a block ends on . ! or ? (a colon continues the thought: "a great treasure: shareholder
 *  value."); a pause-only ending ("all...") ends a block only once it has six words; a block over 22
 *  words splits at its colon, or else at the comma nearest its middle; blocks under five words join the
 *  next; anything from `finalFrom` on is left out (the closing headline shows it). Each block stays up at
 *  least 1.2 s + 0.25 s per word (brand guide §8): when speech is faster, the block holds and the next
 *  one starts a little late. */
export const captions = (finalFrom: number, finalIn: number): Caption[] => {
  let blocks: Word[][] = [];
  let cur: Word[] = [];
  WORDS.forEach((x, i) => {
    if (i >= finalFrom) return;
    cur.push(x);
    const ellipsis = /\.\.\.$|…$/.test(x.w);
    const stop = (!ellipsis && /[.!?]$/.test(x.w)) || (ellipsis && cur.length >= 6);
    if (stop) { blocks.push(cur); cur = []; }
  });
  if (cur.length > 1) blocks.push(cur);              // a lone leftover word (like "to") before the headline is dropped
  const split = (b: Word[]): Word[][] => {
    if (b.length <= 22) return [b];
    const colon = b.findIndex((x, j) => /:$/.test(x.w) && j > 4 && j < b.length - 5);
    let at = colon;
    if (at < 0) {
      const commas = b.map((x, j) => (/,$/.test(x.w) && j > 4 && j < b.length - 5 ? j : -1)).filter((j) => j >= 0);
      at = commas.length ? commas.reduce((p, q) => (Math.abs(q - b.length / 2) < Math.abs(p - b.length / 2) ? q : p)) : Math.floor(b.length / 2);
    }
    return [...split(b.slice(0, at + 1)), ...split(b.slice(at + 1))];
  };
  blocks = blocks.flatMap(split);
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].length < 5) { blocks[i + 1] = [...blocks[i], ...blocks[i + 1]]; blocks.splice(i, 1); i--; }
  }
  // WHY the ellipsis: a caption that continues the previous sentence ("a tool that can…") would otherwise
  // start in lower case, which reads as a mistake; the leading "…" shows the thought carries on.
  const out: Caption[] = blocks.map((ws) => {
    const text = ws.map((x) => x.w).join(' ');
    return { text: /^[a-z]/.test(text) ? `…${text}` : text, at: ws[0].start - 0.12, out: 0, words: ws.length };
  });
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const nextIn = i + 1 < out.length ? out[i + 1].at : finalIn;
    c.out = Math.max(nextIn, c.at + 1.2 + 0.25 * c.words);
    if (i + 1 < out.length && out[i + 1].at < c.out) out[i + 1].at = c.out;
  }
  return out;
};
