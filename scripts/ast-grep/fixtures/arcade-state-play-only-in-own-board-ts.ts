// Violation fixture: a .ts game helper narrowing the open game's state.
declare const state: { play: unknown };
export const peek = () => state.play;
