// Violation fixture: the window gated on `visible`, both directions.
declare function useOneShotWindow(k: unknown): boolean;
declare const visible: boolean;
export const arriving = useOneShotWindow(visible);
