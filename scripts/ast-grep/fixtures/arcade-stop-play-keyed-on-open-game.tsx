// Violation fixture: stopping play shares an effect with the width helper.
declare function useEffect(fn: () => void, deps: unknown[]): void;
declare const setPlaying: (v: boolean) => void;
declare const openGame: unknown, applyGameDefaultWidth: unknown;
useEffect(() => {
  setPlaying(false);
}, [openGame, applyGameDefaultWidth]);
