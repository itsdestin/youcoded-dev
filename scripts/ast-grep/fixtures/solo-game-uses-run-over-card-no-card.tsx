// Violation fixture for solo-game-uses-run-over-card: a solo game with a
// hand-rolled end overlay (fires once, on the whole file). It imports
// RunOverCard and names it in this comment, but never renders it.
import RunOverCard from './RunOverCard';
declare const Overlay: (p: any) => any;
export default function DiceGame() {
  return <Overlay retryKeyHint="Space">Game over</Overlay>;
}
