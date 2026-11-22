// Every moment the pictures react to, named once and read from the narration (see take1c-cues.ts).
// WHY one table: the page turns, ink, camera and headlines all read the same names, so a picture can never
// drift off the word it illustrates, and changing the recording re-times everything at once.
import { E, LAST_WORD_END, T } from './take1c-cues';

export const Q = {
  // (1) the handful
  decade: T('decade', 'a *decade,'),
  small: T('small', 'a *small handful'),
  handful: T('handful', 'small *handful'),
  corporations1: T('corporations1', 'of corporations have'),
  dictated: T('dictated', 'have *dictated'),
  interact: T('interact', 'you *interact'),
  technology1: T('technology1', 'your *technology.'),
  // (2) what they decided
  they: T('they', 'They decided'),
  decided: T('decided', 'They *decided'),
  computersDo: T('computersDo', 'your *computers could do,'),
  cost: T('cost', 'what it would cost,'),
  costWord: T('costWord', 'would *cost,'),
  data: T('data', 'what *happened with your personal'),
  personalData: T('personalData', 'personal *data.'),
  // (3) the bargain
  andWeAll: T('andWeAll', 'And we all...'),
  weAll2: T('weAll2', '*we all just accepted'),
  accepted: T('accepted', 'just *accepted it.'),
  weAccepted: T('weAccepted', 'We accepted that'),
  subscribe: T('subscribe', 'would *subscribe to everything'),
  everything1: T('everything1', 'to *everything and own'),
  own: T('own', 'and *own nothing,'),
  nothing: T('nothing', 'own *nothing,'),
  privacy: T('privacy', 'our *privacy would'),
  costOf: T('costOf', 'the *cost of convenience.'),
  convenience: T('convenience', 'of *convenience.'),
  convenienceEnd: E('convenienceEnd', 'of *convenience.'),
  // (4) the turn
  however: T('however', 'However, recently...'),
  howeverEnd: E('howeverEnd', '*However, recently...'),
  recently: T('recently', 'However, *recently...'),
  recentlyEnd: E('recentlyEnd', 'However, *recently...'),
  something: T('something', 'something truly wonderful'),
  wonderful: T('wonderful', 'truly *wonderful happened.'),
  happened: T('happened', 'wonderful *happened.'),
  // (5) the treasure
  blinded: T('blinded', 'Blinded by their'),
  hubris: T('hubris', 'own *hubris,'),
  created1: T('created1', 'corporations *created a new'),
  newKind: T('newKind', 'a *new kind of technology:'),
  technology2: T('technology2', 'of *technology: artificial'),
  artificial: T('artificial', 'artificial intelligence.'),
  intelligence: T('intelligence', 'artificial *intelligence.'),
  aTechnology: T('aTechnology', 'A technology they believed'),
  believed: T('believed', 'they *believed would'),
  greatTreasure: T('greatTreasure', 'a *great treasure:'),
  treasure: T('treasure', 'great *treasure:'),
  these: T('these', 'these corporations created'),
  shareholder: T('shareholder', 'shareholder value.'),
  value: T('value', 'shareholder *value.'),
  valueEnd: E('valueEnd', 'shareholder *value.'),
  // (6) the tool
  but: T('but', 'But in their excitement,'),
  excitement: T('excitement', 'their *excitement,'),
  createdSomething: T('createdSomething', 'they *created something far'),
  far: T('far', 'something *far beyond'),
  beyond: T('beyond', 'far *beyond their own control:'),
  control: T('control', 'own *control:'),
  aTool: T('aTool', 'a tool that can'),
  tool: T('tool', 'a *tool that can'),
  makeSoftware: T('makeSoftware', 'can *make software,'),
  software: T('software', 'make *software,'),
  the: T('the', '*the ever-scarce foundation'),
  scarce: T('scarce', 'the *ever-scarce foundation'),
  foundation: T('foundation', 'ever-scarce *foundation'),
  monopolies1: T('monopolies1', 'these *monopolies,'),
  monopolies1End: E('monopolies1End', 'these *monopolies,'),
  forAnyone: T('forAnyone', 'for anyone who asks.'),
  so: T('so', 'And *so, for'),
  veryLong: T('veryLong', 'a *very long while,'),
  anyone: T('anyone', 'for *anyone who'),
  who: T('who', 'anyone *who asks.'),
  asks: T('asks', 'who *asks.'),
  // (7) our turn
  andSo: T('andSo', 'And so, for the first'),
  weGetStart: T('weGetStart', 'we get to decide.'),
  firstTime: T('firstTime', 'the *first time in'),
  longWhile: T('longWhile', 'very *long while,'),
  weGet: T('weGet', 'we get to decide.'),
  get: T('get', 'we *get to decide.'),
  decide: T('decide', 'to *decide.'),
  ourComputers: T('ourComputers', 'What our computers can do.'),
  computers2: T('computers2', 'our *computers can do.'),
  canDo: T('canDo', 'computers can *do.'),
  can2: T('can2', 'computers *can do.'),
  itCosts: T('itCosts', 'What it costs.'),
  it2: T('it2', 'What *it costs.'),
  costs: T('costs', 'it *costs.'),
  ourData: T('ourData', 'And what happens with our data.'),
  happens: T('happens', 'what *happens with our'),
  data2: T('data2', 'our *data.'),
  // (8) free
  itsTime1: T('itsTime1', "It's time to free"),
  time1: T('time1', "It's *time to free"),
  free: T('free', 'to *free ourselves'),
  ourselves: T('ourselves', 'free *ourselves'),
  monopolies2: T('monopolies2', 'tech *monopolies of the past.'),
  past: T('past', 'the *past.'),
  pastEnd: E('pastEnd', 'the *past.'),
  // (9) everything
  itsTime2: T('itsTime2', "It's time, at long,"),
  atLong: T('atLong', 'at long, long last...'),
  long1: T('long1', 'at *long, long last'),
  long2: T('long2', 'long, *long last'),
  last: T('last', 'long *last...'),
  lastEnd: E('lastEnd', 'long *last...'),
  toOpen: T('toOpen', 'to open source everything.'),
  open: T('open', 'to *open source'),
  source: T('source', 'open *source everything'),
  everything2: T('everything2', 'source *everything.'),
  end: LAST_WORD_END,
};
export type CueName = keyof typeof Q;

// ---------- the page turns ----------
// WHY each turn starts a beat BEFORE its line: a page takes ~0.85 s to fall, so starting it early lands the
// new picture on the first word of the line it illustrates instead of half a second late.
export const TURN_DUR = 0.85;
/** Snap a time to the frame grid, a hair early, so a hard cut always lands exactly on one frame. */
const onFrame = (s: number) => Math.round(s * 30) / 30 - 0.001;
export const TURN = {
  // WHY the cover is already open at frame 0: a dark cover was a dim, slow first second; the film now opens
  // straight on a bright page in close-up (the book is revealed by the pull-back).
  cover: -1.5,
  rules: Q.they - 0.42,
  bargain: Q.andWeAll - 0.4,
  // WHY cuts, not turns, inside a chapter: a page turn marks a new chapter; within one, the film cuts hard on
  // the stressed word, which is what gives it an editor's rhythm instead of one long camera move.
  nothing: onFrame(Q.weAccepted - 0.03),
  however: Q.convenienceEnd - 0.05,
  // WHY a hard cut on "hubris", not a page turn on "blinded" (review 2026-11-20): the headline "something
  // wonderful happened." must stay up 1.95 s after "happened" is spoken, and the hats start growing on
  // "hubris". The cut takes the headline and the old page away on the same frame, which is a clean edit.
  treasure: onFrame(Q.hubris - 0.03),
  // WHY a page turn on "the" (round six plan): chapter vi is a new spread, Theo and June's; it lands as she says
  // "ever-scarce", in time for Theo's ask to write itself
  anyone: Q.the - 0.3,
  // WHY a separate spread for section 7: it mirrors chapter ii's three pictures one for one
  ours: onFrame(Q.andSo - 0.03),
  free: Q.itsTime1 - 0.42,
  // WHY one turn on "It's", no riffle (round six plan): the sharing of Maya's app gets the whole line
  everything: Q.itsTime2 - 0.45,
  close: Q.end - 0.05,                     // the book shuts as the last word lands
};
/** Turns that are hard cuts (the new spread is simply there on the next frame). */
export const CUT_TURNS = new Set<number>([TURN.nothing, TURN.treasure, TURN.ours]);
/** Hard cuts inside a chapter that something on the page must change on, frame-exact.
 *  WHY shared: the hats used to reset one frame after the camera cut away from them (a one-frame pop);
 *  the camera and the drawing now read the same number, so both change on the same frame. */
export const CUT = {
  hubris: TURN.treasure,
  these: onFrame(Q.these - 0.05),
  // the quill escapes the men in one shot and is drawing the window in the next: cut on "a tool"
  tool: onFrame(Q.aTool - 0.02),
};
/** When a spread's pictures are fully on the page (a cut lands at once, a turn after TURN_DUR). */
export const land = (turnAt: number) => turnAt + (CUT_TURNS.has(turnAt) ? 0 : TURN_DUR);
export const COVER_DUR = 1.1;
export const CLOSE_DUR = 0.8;
/** How long the shut book rests before the dip, and the dip's two halves (to the felt's dark, then up). */
export const SHUT_REST = 0.3, DIP_OUT = 8 / 30, DIP_IN = 16 / 30;
/** The frame the end card starts to fade up from dark (the book has already dipped out to dark by here).
 *  WHY a dip through dark, not a cross-fade: the 4-frame dissolve from the dark cover to the near-white card
 *  read as a flash; dark to dark and then a slow rise keeps the brightness change gentle. */
export const END_CARD = TURN.close + CLOSE_DUR + SHUT_REST + DIP_OUT;
