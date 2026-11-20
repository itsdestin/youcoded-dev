// Every moment the pictures react to, named once and read from the narration (see take1c-cues.ts).
// WHY one table: the page turns, ink, camera and headlines all read the same names, so a picture can never
// drift off the word it illustrates, and changing the recording re-times everything at once.
import { E, LAST_WORD_END, T } from './take1c-cues';

export const Q = {
  // (1) the handful
  handful: T('handful', 'small *handful'),
  corporations1: T('corporations1', 'of corporations have'),
  dictated: T('dictated', 'have *dictated'),
  interact: T('interact', 'you *interact'),
  technology1: T('technology1', 'your *technology.'),
  // (2) what they decided
  they: T('they', 'They decided'),
  computersDo: T('computersDo', 'your *computers could do,'),
  cost: T('cost', 'what it would cost,'),
  costWord: T('costWord', 'would *cost,'),
  data: T('data', 'what *happened with your personal'),
  personalData: T('personalData', 'personal *data.'),
  // (3) the bargain
  andWeAll: T('andWeAll', 'And we all...'),
  accepted: T('accepted', 'just *accepted it.'),
  weAccepted: T('weAccepted', 'We accepted that'),
  subscribe: T('subscribe', 'would *subscribe to everything'),
  everything1: T('everything1', 'to *everything and own'),
  own: T('own', 'and *own nothing,'),
  nothing: T('nothing', 'own *nothing,'),
  privacy: T('privacy', 'our *privacy would'),
  costOf: T('costOf', 'the *cost of convenience.'),
  convenience: T('convenience', 'of *convenience.'),
  // (4) the turn
  however: T('however', 'However, recently...'),
  recently: T('recently', 'However, *recently...'),
  something: T('something', 'something truly wonderful'),
  wonderful: T('wonderful', 'truly *wonderful happened.'),
  happened: T('happened', 'wonderful *happened.'),
  // (5) the treasure
  blinded: T('blinded', 'Blinded by their'),
  hubris: T('hubris', 'own *hubris,'),
  created1: T('created1', 'corporations *created a new'),
  newKind: T('newKind', 'a *new kind of technology:'),
  artificial: T('artificial', 'artificial intelligence.'),
  intelligence: T('intelligence', 'artificial *intelligence.'),
  aTechnology: T('aTechnology', 'A technology they believed'),
  believed: T('believed', 'they *believed would'),
  greatTreasure: T('greatTreasure', 'a *great treasure:'),
  treasure: T('treasure', 'great *treasure:'),
  shareholder: T('shareholder', 'shareholder value.'),
  value: T('value', 'shareholder *value.'),
  valueEnd: E('valueEnd', 'shareholder *value.'),
  // (6) the tool
  but: T('but', 'But in their excitement,'),
  excitement: T('excitement', 'their *excitement,'),
  createdSomething: T('createdSomething', 'they *created something far'),
  beyond: T('beyond', 'far *beyond their own control:'),
  control: T('control', 'own *control:'),
  tool: T('tool', 'a *tool that can'),
  makeSoftware: T('makeSoftware', 'can *make software,'),
  software: T('software', 'make *software,'),
  scarce: T('scarce', 'the *ever-scarce foundation'),
  foundation: T('foundation', 'ever-scarce *foundation'),
  monopolies1: T('monopolies1', 'these *monopolies,'),
  monopolies1End: E('monopolies1End', 'these *monopolies,'),
  forAnyone: T('forAnyone', 'for anyone who asks.'),
  anyone: T('anyone', 'for *anyone who'),
  asks: T('asks', 'who *asks.'),
  // (7) our turn
  andSo: T('andSo', 'And so, for the first'),
  firstTime: T('firstTime', 'the *first time in'),
  longWhile: T('longWhile', 'very *long while,'),
  weGet: T('weGet', 'we get to decide.'),
  decide: T('decide', 'to *decide.'),
  ourComputers: T('ourComputers', 'What our computers can do.'),
  canDo: T('canDo', 'computers can *do.'),
  itCosts: T('itCosts', 'What it costs.'),
  costs: T('costs', 'it *costs.'),
  ourData: T('ourData', 'And what happens with our data.'),
  happens: T('happens', 'what *happens with our'),
  data2: T('data2', 'our *data.'),
  // (8) free
  itsTime1: T('itsTime1', "It's time to free"),
  free: T('free', 'to *free ourselves'),
  monopolies2: T('monopolies2', 'tech *monopolies of the past.'),
  past: T('past', 'the *past.'),
  pastEnd: E('pastEnd', 'the *past.'),
  // (9) everything
  itsTime2: T('itsTime2', "It's time, at long,"),
  atLong: T('atLong', 'at long, long last...'),
  last: T('last', 'long *last...'),
  toOpen: T('toOpen', 'to open source everything.'),
  open: T('open', 'to *open source'),
  everything2: T('everything2', 'source *everything.'),
  end: LAST_WORD_END,
};
export type CueName = keyof typeof Q;

// ---------- the page turns ----------
// WHY each turn starts a beat BEFORE its line: a page takes ~0.85 s to fall, so starting it early lands the
// new picture on the first word of the line it illustrates instead of half a second late.
export const TURN_DUR = 0.85;
export const TURN = {
  cover: 0.0,                              // the cover swings open under the first words
  rules: Q.they - 0.42,
  bargain: Q.andWeAll - 0.4,
  nothing: Q.weAccepted - 0.42,
  however: Q.however - 0.35,
  treasure: Q.blinded - 0.4,
  anyone: Q.monopolies1End - 0.12,
  free: Q.itsTime1 - 0.42,
  // the riffle: every page of the book flies past, each one somebody's own
  riffle: [Q.itsTime2 - 0.55, Q.itsTime2 + 0.12, Q.atLong + 0.15, Q.atLong + 0.68, Q.last - 0.35, Q.last + 0.12],
  everything: Q.toOpen - 0.72,
  close: Q.end - 0.05,                     // the book shuts as the last word lands
};
export const COVER_DUR = 1.1;
export const CLOSE_DUR = 0.8;
/** When the end card is fully up: the guide wants it held at least 2.5 s before 75.0. */
export const END_CARD = TURN.close + CLOSE_DUR - 0.1;
