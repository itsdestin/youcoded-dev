// Violation fixture for arcade-end-run-keeps-playing's whole-declaration backstop:
// the text sits where no listed node kind holds it whole (a malformed type
// annotation the parser recovers from), so only the backstop reports it — once,
// on the endRun declaration. The retired raw-text read would have seen it too.
declare const Game: (p: any) => any;
export const Shell = () => {
  const endRun = () => { let x: setPlaying(false); };
  return <Game onEnd={endRun} onExit={() => {}} />;
};
