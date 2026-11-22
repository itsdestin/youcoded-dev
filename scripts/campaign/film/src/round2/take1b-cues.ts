// Take 1B: every cut, reveal and word on screen is pinned to the narrator's recorded word times.
// WHY: hand-typed seconds drift the moment the voice is re-recorded; a phrase anchor re-times the whole
// film by itself, and a phrase that disappears from the recording stops the render with a clear message.
import raw from './take1-words-lily.json';

type Word = { w: string; start: number; end: number };
const WORDS = raw as Word[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z'-]/g, '');
const TOKENS = WORDS.map((x) => norm(x.w));

/** Finds `phrase` (a few consecutive spoken words) and returns the word marked with * (default: the first). */
const find = (phrase: string, nth: number): Word => {
  const parts = phrase.trim().split(/\s+/);
  const mark = Math.max(0, parts.findIndex((p) => p.startsWith('*')));
  const want = parts.map(norm);
  let seen = 0;
  for (let i = 0; i + want.length <= TOKENS.length; i++) {
    if (want.every((w, j) => TOKENS[i + j] === w) && ++seen === nth) return WORDS[i + mark];
  }
  throw new Error(`take1b cue: "${phrase.replace(/\*/g, '')}"${nth > 1 ? ` (#${nth})` : ''} is not in the narration timings. ` +
    'The script or recording changed: update this cue in take1b-cues.ts.');
};
/** Start of the marked word, in seconds. */
export const at = (phrase: string, nth = 1) => find(phrase, nth).start;
/** End of the marked word, in seconds. */
export const end = (phrase: string, nth = 1) => find(phrase, nth).end;
/** The last spoken word's end: the end card follows it. */
export const LAST_WORD_END = WORDS[WORDS.length - 1].end;

/** Every moment the film uses, by spoken line. WHY one table: the timeline reads like the script. */
export const Q = {
  // (1) For more than a decade, a small handful of corporations have dictated how you interact with your technology.
  start: 0,
  handful: at('a *small handful'),
  corporations: at('handful of *corporations'),
  dictated: at('have *dictated'),
  interact: at('you *interact'),
  technology1: at('your *technology.'),
  // (2) They decided what your computers could do, what it would cost, and what happened with your personal data.
  decided: at('*They decided'),
  computers1: at('your *computers could'),
  could: at('computers *could do,'),
  couldDo: at('could *do,'),
  cost: at('*what it would cost,'),
  costWord: at('would *cost,'),
  data: at('*and what happened'),
  personal: at('your *personal data.'),
  dataEnd: end('personal *data.'),
  // (3) And we all... we all just accepted it. We accepted that we would subscribe to everything and own nothing, ...
  weAll: at('*And we all'),
  weAll2: at('*we all just'),
  acceptedIt: at('just *accepted it.'),
  weAccepted: at('*We accepted that'),
  accepted2: at('We *accepted that'),
  subscribe: at('would *subscribe'),
  everything1: at('to *everything and'),
  own: at('and *own nothing,'),
  privacy: at('our *privacy'),
  wouldBe: at('privacy *would be'),
  costOf: at('the *cost of convenience.'),
  convenience: at('of *convenience.'),
  // (4) However, recently... something truly wonderful happened.
  however: at('*However, recently'),
  recently: at('*recently... something'),
  something: at('*something truly'),
  truly: at('something *truly'),
  wonderful: at('truly *wonderful'),
  happenedEnd: end('wonderful *happened.'),
  // (5) Blinded by their own hubris, these corporations created a new kind of technology: artificial intelligence. ...
  blinded: at('*Blinded by'),
  // WHY its own name: `corporations` above is line 1's word; line 4's hush must end on THIS one (it used to use line
  // 1's, so the hush never happened)
  corporations2: at('these *corporations'),
  ownHubris: at('their *own hubris,'),
  hubris: at('own *hubris,'),
  these: at('*these corporations created'),
  created1: at('corporations *created a new'),
  newKind: at('a *new kind'),
  technology2: at('of *technology: artificial'),
  ai: at('*artificial intelligence.'),
  intelligence: at('artificial *intelligence.'),
  aTechWord: at('A *technology they'),
  aTechnology: at('*A technology they'),
  believed: at('they *believed'),
  great: at('a *great treasure:'),
  treasure: at('great *treasure:'),
  shareholder: at('*shareholder value.'),
  value: at('shareholder *value.'),
  // (6) But in their excitement, they created something far beyond their own control: a tool that can make software, ...
  but: at('*But in their'),
  excitement: at('their *excitement,'),
  created2: at('they *created something'),
  far: at('something *far beyond'),
  beyond: at('far *beyond'),
  control: at('own *control:'),
  aTool: at('*a tool that'),
  software: at('make *software,'),
  scarce: at('the *ever-scarce'),
  monopoliesEnd: end('these *monopolies,'),
  monopolies1: at('these *monopolies,'),
  forAnyone: at('*for anyone who'),
  who: at('anyone *who asks.'),
  asks: at('who *asks.'),
  // (7) And so, for the first time in a very long while, we get to decide. What our computers can do. What it costs. ...
  andSo: at('*And so, for'),
  firstTime: at('the *first time'),
  decide: at('get to *decide.'),
  canDo: at('*What our computers'),
  costs: at('*What it costs.'),
  ourData: at('*And what happens'),
  whatHappens: at('*what happens with'),
  computers2: at('our *computers can'),
  costsWord: at('it *costs.'),
  can: at('computers *can do.'),
  ourDataEnd: end('our *data.'),
  // (8) It's time to free ourselves from the tech monopolies of the past.
  free: at("*It's time to free"),
  freeWord: at('to *free ourselves'),
  tech: at('the *tech monopolies'),
  past: at('the *past.'),
  // (9) It's time, at long, long last... to open source everything.
  itsTime: at("*It's time, at"),
  timeWord: at("It's *time, at"),
  longFirst: at('at *long, long'),
  longLast: at('long, *long last...'),
  last: at('long *last...'),
  open: at('to *open source'),
  everythingEnd: end('source *everything.'),
} as const;
