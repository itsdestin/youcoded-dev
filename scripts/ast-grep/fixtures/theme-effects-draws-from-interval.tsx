// Violation fixture: a rAF draw loop.
const draw = () => { requestAnimationFrame(draw); };
export const start = () => draw();
