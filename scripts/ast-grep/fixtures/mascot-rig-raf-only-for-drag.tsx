// Violation fixture: an ambient rAF self-chain.
const tick = () => { requestAnimationFrame(tick); };
export const start = () => tick();
// Fix round 2, 2026-09-16: the same shape through window. must be caught too.
const evilTick = () => { window.requestAnimationFrame(evilTick); };
export const startEvil = () => evilTick();
