// Violation fixture for solo-game-uses-run-over-card: a solo game that uses the
// shared card but offers no keyboard retry (fires once, on the whole file). The
// retryKeyHint in this comment and the string below do not count.
declare const RunOverCard: (p: any) => any;
export const label = 'retryKeyHint';
export default function DiceGame() {
  return <RunOverCard reason="x" score="1" isBest={false} onRetry={() => {}} />;
}
