// Violation fixture: stopping play shares an effect with the width helper.
declare function useEffect(fn: () => void, deps: unknown[]): void;
declare const setPlaying: (v: boolean) => void;
declare const openGame: unknown, applyGameDefaultWidth: unknown;
useEffect(() => {
  setPlaying(false);
}, [openGame, applyGameDefaultWidth]);
// Fix round 2, 2026-09-16: the same shape through a member-form call.
declare const React: { useEffect: typeof useEffect };
React.useEffect(() => {
  setPlaying(false);
}, [openGame, applyGameDefaultWidth]);
