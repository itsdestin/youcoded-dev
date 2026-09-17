// Violation fixture for arcade-end-run-keeps-playing: an endRun that stops play
// (fires on the call) and repeats it in a comment (fires on the comment) — the
// retired check read raw text, comments included. onExit is present, so the
// whole-file branch stays quiet here.
declare const setPlaying: (v: boolean) => void;
declare const Game: (p: any) => any;
export const Shell = () => {
  const endRun = (score: number) => {
    if (score < 0) return;
    setPlaying(false);
    // setPlaying(false) was once here too
  };
  return <Game onEnd={endRun} onExit={() => setPlaying(false)} />;
};
