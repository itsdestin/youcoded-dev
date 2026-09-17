// Violation fixture: a shell file narrowing another game's state.
declare const state: { play: unknown };
export const Shell = () => <div>{String(state.play)}</div>;
