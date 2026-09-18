// Violation fixture: a rAF-chained spinner.
const tick = () => { requestAnimationFrame(tick); };
export const start = () => tick();
