// Violation fixture: packed against the wrapper's full width, no chip reserved.
declare function packSessions(o: object): unknown;
declare const bar: HTMLElement;
export const pack = packSessions({ budget: bar.parentElement?.clientWidth ?? bar.clientWidth });
