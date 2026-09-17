// Violation fixture: a literal duration at the call site, and no stylesheet read.
declare function useOneShotWindow(k: unknown, ms?: number): boolean;
export const armed = useOneShotWindow('k', 360);
