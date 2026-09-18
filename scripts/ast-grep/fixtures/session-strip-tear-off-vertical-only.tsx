// Violation fixture: a sideways overshoot tears the pill off.
export const outside = (e: { clientX: number }) => e.clientX < 0;
