// Violation fixture: a smooth ring on fractional pixels.
declare const level: number;
export const ring = { boxShadow: `0 0 0 ${level * 7}px red`, transition: 'box-shadow 90ms linear' };
