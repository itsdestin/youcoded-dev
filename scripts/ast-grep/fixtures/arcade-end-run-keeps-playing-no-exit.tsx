// Violation fixture for arcade-end-run-keeps-playing: a shell that hands the game
// no onExit prop (fires once, on the whole file). The onExit= in this comment and
// the string below do not count — only a real prop does.
declare const Game: (p: any) => any;
export const note = 'onExit={leave}';
export const Shell = () => {
  const endRun = (score: number) => { void score; };
  return <Game onEnd={endRun} />;
};
