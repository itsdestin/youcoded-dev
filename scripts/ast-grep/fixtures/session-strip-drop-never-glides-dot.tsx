// Violation fixture: the peek lock lifts on 8px of travel.
declare const hoverLock: { current: { x: number } };
export const lift = (x: number) => Math.abs(x - hoverLock.current.x) > 8;
