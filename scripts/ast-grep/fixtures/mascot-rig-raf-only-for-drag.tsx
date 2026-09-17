// Violation fixture: an ambient rAF self-chain.
const tick = () => { requestAnimationFrame(tick); };
export const start = () => tick();
